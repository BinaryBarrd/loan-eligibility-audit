"""Re-run the black-box probes on the two eligibility calculators.

It opens each calculator in a real browser, types a grid of values into the
fields (exactly what a person would do), reads the "You are eligible for ..."
result, and saves every input -> output pair. It then compares each result with
the rule reconstructed in rules.py, so you can see whether a site has changed.

Run (on your own laptop; needs internet):
  pip install playwright
  playwright install chromium
  python checker_audit.py                 # both sites
  python checker_audit.py --site bajaj    # one site
  python checker_audit.py --show          # watch the browser do it

Notes
- Only the on-page calculators are used. Nothing is submitted, and no phone
  number, PAN or OTP is entered.
- Keep the grid small and the pause on: a few dozen probes is plenty.
- If a site redesigns its page, the field-finding code below may need updating.
  The probing logic was first checked by hand in a browser on 14 Nov 2026.
"""
import argparse
import csv
import itertools
import time
from datetime import date
from pathlib import Path

from playwright.sync_api import sync_playwright

from rules import bajaj_rule, paisabazaar_rule

OUT_DIR = Path(__file__).resolve().parent.parent / "data"

# Sets a value in a React-controlled text field the same way typing does.
SET_VALUES_JS = """
async ([fieldsJs, values]) => {
  const fields = eval(fieldsJs);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === null) continue;
    const el = fields[i];
    el.focus(); setter.call(el, String(values[i]));
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
    el.blur(); el.dispatchEvent(new FocusEvent('focusout', {bubbles: true}));
  }
  await new Promise(r => setTimeout(r, 900));
  return true;
}
"""

SITES = {
    "bajaj": {
        "url": "https://www.bajajfinserv.in/personal-loan-eligibility-calculator",
        # fields in order: city, monthly income, monthly expense
        "fields_js": """(() => {
            const h = [...document.querySelectorAll('h1,h2,h3,h4')].find(e =>
                /Personal Loan Eligibility Calculator/i.test(e.textContent));
            let box = h;
            for (let i = 0; i < 8 && box && box.querySelectorAll('input').length < 3; i++) box = box.parentElement;
            return [...box.querySelectorAll('input')];
        })()""",
        "read_js": """() => {
            const t = document.body.innerText;
            const m = t.match(/eligible for a personal loan upto\\s*\\n?\\s*(₹[\\d,]+)/i);
            return m ? m[1] : 'MSG: ' + (t.match(/(Minimum|Maximum) allowed value[^\\n]*/) || [''])[0];
        }""",
        "grid": [dict(city=c, income=i, expense=e)
                 for c, i, e in itertools.product(["Pune", "Patna"], [30000, 60000, 120000],
                                                  [0, 20000, 45000, 70000])],
        "values": lambda g: [g["city"], g["income"], g["expense"]],
        "rule": lambda g: bajaj_rule(g["income"], g["expense"]),
    },
    "paisabazaar": {
        "url": "https://www.paisabazaar.com/personal-loan/eligibility-calculator/",
        # fields in order: age, desired amount, rate, tenure (years), monthly income, existing EMI
        "fields_js": "[...document.querySelectorAll('input')].filter(i => i.offsetParent && i.type === 'text').slice(0, 6)",
        "read_js": """() => {
            const L = document.body.innerText.split('\\n').map(s => s.trim()).filter(Boolean);
            const i = L.indexOf('Results');
            const j = L.indexOf('You are eligible for', i);
            if (j > 0) return L[j + 1] + ' | tenure ' + (L[L.indexOf('Eligible Tenure', i) + 1] || '');
            return 'MSG: ' + (L[i + 1] || '');
        }""",
        "grid": [dict(age=a, desired=2000000, rate=r, years=y, income=i, emi=e)
                 for a, r, y, i, e in itertools.product([25, 45, 58], [12, 24], [3, 7],
                                                        [30000, 80000], [0, 10000])],
        "values": lambda g: [g["age"], g["desired"], g["rate"], g["years"], g["income"], g["emi"]],
        "rule": lambda g: paisabazaar_rule(g["age"], g["desired"], g["rate"], g["years"], g["income"], g["emi"]),
    },
}


def to_number(shown: str):
    if shown.startswith("MSG"):
        return None
    head = shown.split("|")[0]
    digits = "".join(ch for ch in head if ch.isdigit())
    return int(digits) if digits else None


def audit(site: str, show: bool, pause: float):
    cfg = SITES[site]
    OUT_DIR.mkdir(exist_ok=True)
    out_path = OUT_DIR / f"checker_rerun_{site}_{date.today().isoformat()}.csv"
    mismatches = 0
    with sync_playwright() as p, open(out_path, "w", newline="", encoding="utf-8") as f:
        browser = p.chromium.launch(headless=not show)
        page = browser.new_page()
        page.goto(cfg["url"], wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
        w = csv.writer(f)
        keys = list(cfg["grid"][0].keys())
        w.writerow([*keys, "shown", "rule", "match"])
        for g in cfg["grid"]:
            page.evaluate(SET_VALUES_JS, [cfg["fields_js"], cfg["values"](g)])
            shown = page.evaluate(cfg["read_js"])
            rule = cfg["rule"](g)
            num = to_number(shown)
            match = (num is None and isinstance(rule, str)) or (
                num is not None and not isinstance(rule, str) and abs(num - rule) <= 1)
            mismatches += not match
            w.writerow([*g.values(), shown, rule, "yes" if match else "NO"])
            print(f"{site}: {g} -> {shown}  (rule {rule}) {'' if match else '<-- MISMATCH'}")
            time.sleep(pause)
        browser.close()
    print(f"{site}: {len(cfg['grid'])} probes, {mismatches} mismatches -> {out_path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", choices=list(SITES), help="one site only (default: both)")
    ap.add_argument("--show", action="store_true", help="show the browser window")
    ap.add_argument("--pause", type=float, default=1.5, help="seconds between probes")
    a = ap.parse_args()
    for s in ([a.site] if a.site else SITES):
        audit(s, a.show, a.pause)
