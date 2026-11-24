"""Write the static HTML shells in site/ (one per platform, plus overview, compare and method).
The content is filled in by the page's script from rules.js, platforms.js and audit-data.js.
Run from the TAI377 folder: python3 scripts/build_pages.py
"""
import json
import re
import subprocess
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"
PRE = json.loads(subprocess.run(["node", str(SITE.parent / "scripts" / "prerender.mjs")], capture_output=True, text=True, check=True).stdout)
PLATFORMS = [  # (file, id, short name for the menu) in the order of platforms.js
    ("bajaj-finserv.html", "bajaj_finserv", "Bajaj Finserv"),
    ("paisabazaar.html", "paisabazaar", "Paisabazaar"),
    ("kotak.html", "kotak", "Kotak"),
    ("idfc-first.html", "idfc_first", "IDFC FIRST"),
    ("smfg.html", "smfg", "SMFG"),
    ("axis.html", "axis", "Axis"),
    ("fibe.html", "fibe", "Fibe"),
    ("poonawalla.html", "poonawalla", "Poonawalla"),
    ("aditya-birla-capital.html", "aditya_birla", "Aditya Birla"),
]
PLATFORM_NAMES = [  # (file, id, name in the Calculators menu)
    ("bajaj-finserv.html", "bajaj_finserv", "Bajaj Finserv"),
    ("paisabazaar.html", "paisabazaar", "Paisabazaar"),
    ("kotak.html", "kotak", "Kotak Mahindra Bank"),
    ("idfc-first.html", "idfc_first", "IDFC FIRST Bank"),
    ("smfg.html", "smfg", "SMFG India Credit"),
    ("axis.html", "axis", "Axis Bank"),
    ("fibe.html", "fibe", "Fibe"),
    ("poonawalla.html", "poonawalla", "Poonawalla Fincorp"),
    ("aditya-birla-capital.html", "aditya_birla", "Aditya Birla Capital"),
]
TITLE = "Same person, different “You are eligible”"


def module_graph(script):
    """Every module the page script imports, directly or through other modules."""
    seen, todo = [], [script]
    while todo:
        f = todo.pop(0)
        if f in seen:
            continue
        seen.append(f)
        todo += re.findall(r"^import[^;]*?from\s+'\./([^']+)'", (SITE / f).read_text(encoding="utf-8"), re.M)
    return seen


FONTS = "\n".join(
    f'  <link rel="preload" href="fonts/{f}" as="font" type="font/woff2" crossorigin>'
    for f in ("atkinson-hyperlegible-400.woff2", "atkinson-hyperlegible-700.woff2", "atkinson-hyperlegible-400-italic.woff2"))


HEAD_START = """<!doctype html>
<html lang="en-IN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="color-scheme" content="light dark">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <link rel="icon" href="data:,">
{FONTS}
  <link rel="stylesheet" href="styles.css">
"""


def head(title, script, desc):
    if not script:  # a page with no script at all
        return HEAD_START.format(title=title, desc=desc, FONTS=FONTS) + "</head>\n"
    preload = "\n".join(f'  <link rel="modulepreload" href="{m}">' for m in module_graph(script))
    return f"""<!doctype html>
<html lang="en-IN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="color-scheme" content="light dark">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <link rel="icon" href="data:,">
{FONTS}
  <link rel="stylesheet" href="styles.css">
{preload}
  <script type="module" src="{script}"></script>
</head>
"""


def header(current):
    """Overview, Calculators (a menu of the nine), Compare, Method. Every page is linked from every page."""
    cur = lambda f: ' aria-current="page"' if f.split("#")[0] == current else ""
    platform_files = [f for f, _, _ in PLATFORMS]
    calc_links = "\n".join(
        f'                <li><a href="{f}"{cur(f)}>{name}</a></li>' for f, name in [(f, full) for f, _, full in PLATFORM_NAMES])
    in_menu = " current" if current in platform_files else ""
    return f"""    <header class="top">
      <div class="wrap">
        <p class="site-title"><a href="index.html#overview">{TITLE}</a></p>
        <p class="stamp">Nine Indian personal-loan eligibility calculators, tested 14–19 November 2026. The sites may have changed since.</p>
      </div>
      <nav class="tabs" aria-label="Pages">
        <div class="wrap tabs-inner">
          <ul class="menu-bar">
            <li><a href="index.html#overview"{cur("index.html")}>Overview</a></li>
            <li>
              <details class="menu{in_menu}">
                <summary>Calculators</summary>
                <ul class="menu-panel">
{calc_links}
                </ul>
              </details>
            </li>
            <li><a href="compare.html"{cur("compare.html")}>Compare</a></li>
            <li><a href="method.html"{cur("method.html")}>Method</a></li>
          </ul>
        </div>
      </nav>
    </header>
"""


STRIP = """    <div class="strip"><div class="wrap"><p><strong>Not financial advice.</strong> Calculators, not loan offers. Results here are recreated from rules worked out by testing the public pages; not made by, or connected to, any of these companies. Nothing you type here leaves your browser.</p></div></div>
"""
FOOT = """    <footer class="foot wrap">
      <p>Not financial advice.</p>
      <p>Nothing you type here leaves your browser.</p>
    </footer>
"""
NOSCRIPT = '<noscript><p class="notice">This page needs JavaScript to show the calculators.</p></noscript>'


def page(file, script, title, desc, body, data_platform=None, gate=False):
    attr = f' data-platform="{data_platform}"' if data_platform else ""
    inner = header(file) + (STRIP if not gate else "") + body + FOOT
    if gate:
        inner = f'  <div id="app" hidden>\n{inner}  </div>\n'
        inner = GATE + inner
    else:
        inner = f"  <div id=\"app\">\n{inner}  </div>\n"
    (SITE / file).write_text(head(title, script, desc) + f"<body{attr}>\n{inner}</body>\n</html>\n", encoding="utf-8")


GATE = f"""  <!-- Disclaimer first. The rest of the page stays hidden until "Continue". Nothing is stored. -->
  <section id="disclaimer" class="disclaimer wrap" aria-labelledby="disclaimer-h">
    <div class="disclaimer-card">
      <p class="eyebrow">Before you start</p>
      <h1 id="disclaimer-h">{TITLE}</h1>
      <p class="lede">This site compares nine public personal-loan eligibility calculators from Indian banks, lenders and a loan marketplace. Please read this first.</p>
      <ul class="disclaimer-list">
        <li><strong>Not financial advice.</strong> This is a research comparison. It does not tell you whether you will get a loan.</li>
        <li><strong>Calculators, not loan offers.</strong> The sites call their results “indicative” or an estimate. Real lenders also look at credit score, job, documents and more.</li>
        <li><strong>Recreated, not live.</strong> The results here are worked out from rules we reconstructed by testing the public calculator pages between 14 and 19 November 2026. The sites may have changed since.</li>
        <li><strong>Not connected to any of these companies.</strong> This site is not made by, or connected to, any of them.</li>
        <li><strong>Private.</strong> Nothing you type here leaves your browser.</li>
      </ul>
      {NOSCRIPT}
      <button type="button" class="primary" id="continue">I’ve read this, continue</button>
    </div>
  </section>

"""

INDEX = f"""    <main class="wrap" id="main">
      <h1 tabindex="-1">Same person, different “You are eligible”</h1>
      <p class="lede">We tested nine personal-loan eligibility calculators and worked out the rule each one follows. Each page below recreates one calculator, shows the rule behind its number, and lists what the audit found.</p>
      <section class="section" aria-labelledby="take-h">
        <h3 id="take-h">Key takeaways</h3>
        <ol class="takeaways" id="takeaways">
          {PRE["takeaways"]}
        </ol>
      </section>
      <section class="section" aria-labelledby="dir-h">
        <h3 id="dir-h">The nine calculators</h3>
        <ul class="cards" id="cards">
          {PRE["cards"]}
        </ul>
        <p class="next"><a href="compare.html">Put one person into all nine →</a></p>
        <p class="next"><a href="method.html">How we tested, and the limits →</a></p>
      </section>
    </main>
"""

PLATFORM = f"""    <main class="wrap" id="main">
      {NOSCRIPT}
    </main>
"""


def field(key, label, value, unit=None, money=False, decimal=False):
    pre = '<span class="affix" aria-hidden="true">₹</span>' if money else ""
    post = f'<span class="affix after" aria-hidden="true">{unit}</span>' if unit else ""
    kind = ' data-kind="decimal"' if decimal else (' data-kind="money"' if money else "")
    mode = "decimal" if decimal else "numeric"
    return f"""            <div class="field">
              <label for="c-{key}">{label}</label>
              <div class="input{' money' if money else ''}">{pre}<input id="c-{key}" type="text" inputmode="{mode}" value="{value}"{kind} aria-describedby="c-{key}-err" autocomplete="off">{post}</div>
              <p class="err" id="c-{key}-err" aria-live="polite"></p>
            </div>
"""


COMPARE = f"""    <main class="wrap" id="main">
      <h1 tabindex="-1">Compare all nine</h1>
      <p class="lede">Type one person’s details once. The calculators ask for different things, so each one gets only what it asks for, in its own boxes. Under each name you can see exactly what it was given.</p>
      <ul class="small muted">
        <li>Calculators with one “expenses” box (Bajaj Finserv, Axis, Fibe, Aditya Birla) get your EMIs plus other expenses.</li>
        <li>Calculators that ask only for EMIs (Paisabazaar, Kotak, SMFG, Poonawalla) get your EMIs; other expenses are left out.</li>
        <li>IDFC FIRST gets EMIs as EMIs and other expenses as “utilities”. Age is used only by Paisabazaar; rate and tenure only where a calculator asks.</li>
        <li>If a value is outside a calculator’s own range, it says so instead of guessing.</li>
      </ul>
      <form class="inputs" id="compare-form" novalidate autocomplete="off">
        <fieldset>
          <legend>One person</legend>
          <div class="field-grid">
{field('age', 'Age', '29', 'years')}{field('income', 'Monthly income (₹)', '40,000', money=True)}{field('emis', 'Monthly EMIs you already pay (₹)', '10,000', money=True)}{field('other', 'Other monthly expenses (₹)', '0', money=True)}{field('years', 'Tenure, where asked', '5', 'years')}{field('rate', 'Interest rate, where asked', '10', '% a year', decimal=True)}            <div class="field choice">
              <label for="c-employment">Employment (SMFG only)</label>
              <select id="c-employment"><option value="salaried" selected>Salaried</option><option value="self">Self-employed</option></select>
            </div>
          </div>
        </fieldset>
      </form>
      <section class="section" aria-labelledby="one-h">
        <h3 id="one-h">What each page would show</h3>
        <div class="table-scroll"><table class="wide">
          <thead><tr><th scope="col">Calculator, and what it was given</th><th scope="col">Shows</th></tr></thead>
          <tbody id="one-body"></tbody>
        </table></div>
        <p id="one-spread"></p>
      </section>
      <section class="section" aria-labelledby="people-h">
        <h3 id="people-h">Twelve standard people, as seen on the sites</h3>
        <p class="intro">Each person was typed into each live calculator on 19 November 2026 (EMIs in the EMI or expenses box, other boxes at the page’s default).</p>
        <div class="table-scroll"><table class="wide">
          <thead id="people-head"></thead>
          <tbody id="people-body"></tbody>
        </table></div>
        <p class="small muted" id="people-note"></p>
        <p class="small"><a href="data/personas.csv" download>Download the standard-people results (personas.csv)</a></p>
      </section>
    </main>
"""

METHOD = f"""    <main class="wrap" id="main">
      <h1 tabindex="-1">How we tested</h1>
      <section class="section" aria-labelledby="m-h">
        <h3 id="m-h">Method</h3>
        <p>We treated each calculator as a black box: we changed what we typed in and recorded what the page showed. On 14 November 2026 the Bajaj Finserv and Paisabazaar calculators were tested in a web browser. On 18–19 November 2026 a script opened each of the other seven calculators (and Bajaj Finserv again) in an automated browser, typed values into the calculator’s own boxes, and recorded the result text.</p>
        <p>For each calculator we changed one input at a time across its range (sweeps), narrowed down where the result jumped (boundary searches), and fitted the simplest rule that reproduced every result. Interest rates were found by searching for the rate whose annuity factor reproduces the slope of the amount. Each rule was then tested on held-out inputs chosen after the rule was fixed, and on 12 standard people. Where a held-out check failed, the rule was refined once and tested again on fresh inputs.</p>
        <p>We did not log in, did not enter a name, phone number, email, PAN, Aadhaar, date of birth or OTP, and did not click “Apply” or submit anything. Changing the inputs sent nothing to a lender: every calculator works in the browser.</p>
      </section>
      <section class="section" aria-labelledby="v-h">
        <h3 id="v-h">Verification</h3>
        <p>{PRE["n"]["analysed"]} checks were analysed, after corrections (the logs also keep error and correction rows). Every comparable check matched the rule to within ₹1: {PRE["n"]["build"]} rule-building checks, {PRE["n"]["heldOut"]} held-out checks and {PRE["n"]["persona"]} standard-people checks. {PRE["n"]["notComparable"]} were not comparable because the page kept an old, greyed-out amount.</p>
        <div class="table-scroll"><table class="wide">
          <thead><tr><th scope="col">Calculator</th><th scope="col">Tested</th><th scope="col">Rule-building</th><th scope="col">Held-out</th><th scope="col">Standard people</th><th scope="col">Input limits</th><th scope="col">Not comparable</th><th scope="col">Data</th></tr></thead>
          <tbody id="ver-body">
            {PRE["verification"]}
          </tbody>
        </table></div>
        <ul class="links">
          <li><a href="checker_probes.csv" download>Download the 14 November checks for Bajaj Finserv and Paisabazaar (checker_probes.csv)</a></li>
          <li><a href="data/personas.csv" download>Download the standard-people results (personas.csv)</a></li>
        </ul>
      </section>
      <section class="section" aria-labelledby="l-h">
        <h3 id="l-h">Limits</h3>
        <ul>
          <li>These are calculators, not loan offers. Real lenders also look at credit score, job, documents and more.</li>
          <li>A snapshot: the sites can change at any time.</li>
          <li>Black-box: the rules match every case we tried, but we did not see the sites’ code. A rule could differ for inputs we did not try. Parts marked “inferred” were not pinned down exactly.</li>
          <li>We never entered a date of birth, so any effect of age on Axis Bank and SMFG India Credit is unknown.</li>
          <li>Calculators ask for different things (“expenses”, “obligations”, “EMIs”). On the compare page the same person is mapped to each one’s boxes as shown there.</li>
          <li>Several other calculators were looked at but not tested: some had no eligibility calculator, one was under maintenance, and some would not load or need decisions first.</li>
        </ul>
      </section>
    </main>
"""


def main():
    desc = "Nine Indian personal-loan eligibility calculators give the same person very different answers. Here is the rule behind each one."
    page("index.html", "index.js", TITLE, desc, INDEX, gate=True)
    for f, pid, name in PLATFORMS:
        page(f, "platform.js", f"{name}: loan eligibility calculator audit", f"The rule behind the {name} personal-loan eligibility calculator, and what a black-box audit found.", PLATFORM, data_platform=pid)
    page("compare.html", "compare.js", "Compare all nine calculators", desc, COMPARE)
    page("method.html", None, "How the calculators were tested", desc, METHOD)
    print("wrote", 3 + len(PLATFORMS), "pages")


if __name__ == "__main__":
    main()
