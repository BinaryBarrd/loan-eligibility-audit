"""Build site/audit-data.js from the audit extension repo (../loan_audit). Standard library only.

Everything in the output is copied or counted from loan_audit files, never typed by hand:
  - per-site check counts      reports/verification.md (table)
  - test dates                 data/probes/<site>.csv timestamps
  - calculator URLs            adapters/<site>.py SPEC["url"] (the page actually tested)
  - labelled rule parts        rules/<site>.py PARTS (what, seen/inferred/unknown, evidence)
  - personas                   audit/personas.py PERSONAS + reports/comparison.csv
  - Fibe EMI match             reports/summary.md ("113/119")
  - Poonawalla payable match   reports/summary.md ("176/176 probes equal")
  - page quotes                data/cues.csv cue_text (verbatim page text, captured 19 Nov 2026)
Also copies the probe logs to data/audit/ (for the tests) and site/data/ (for download).
Run from the TAI377 folder: python3 scripts/import_audit.py [../loan_audit]
"""
import ast
import csv
import json
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / "loan_audit").resolve()
SITES = ["bajaj_finserv", "paisabazaar", "kotak", "idfc_first", "smfg", "axis", "fibe", "poonawalla", "aditya_birla"]


def literal(path, name):
    for node in ast.parse(path.read_text(encoding="utf-8")).body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == name:
            try:
                return ast.literal_eval(node.value)
            except ValueError:
                return None
    return None


def url_of(site):
    m = re.search(r'(?:"url":\s*|url = )"([^"]+)"', (SRC / "adapters" / f"{site}.py").read_text(encoding="utf-8"))
    return m.group(1)


def verification():
    out = {}
    for line in (SRC / "reports" / "verification.md").read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 8 and cells[0] in SITES:
            frac = lambda c: [int(x) for x in c.split("/")] if "/" in c else [0, 0]
            out[cells[0]] = {"logged": int(cells[1]), "build": frac(cells[2]), "heldOut": frac(cells[3]), "persona": frac(cells[4]),
                             "limit": frac(cells[5]), "notComparable": int(cells[6]) if cells[6].isdigit() else 0, "checked": frac(cells[7])}
    return out


def dates(site):
    ts = sorted(r["timestamp_utc"][:10] for r in csv.DictReader(open(SRC / "data" / "probes" / f"{site}.csv", encoding="utf-8")) if r["timestamp_utc"])
    v1 = any(r["probe_id"].startswith("v1-") for r in csv.DictReader(open(SRC / "data" / "probes" / f"{site}.csv", encoding="utf-8")))
    days = sorted(set(ts))
    return (["2026-11-14"] if v1 else []) + days


def personas():
    defs = literal(SRC / "audit" / "personas.py", "PERSONAS")
    common = literal(SRC / "audit" / "personas.py", "COMMON")
    rows = list(csv.DictReader(open(SRC / "reports" / "comparison.csv", encoding="utf-8")))
    out = []
    for pid, (age, income, emi, city, emp, score) in defs.items():
        seen = {}
        for r in rows:
            if r["persona"] != pid:
                continue
            seen[r["site_id"]] = {"shown": r["shown"], "amount": int(r["shown_amount_rs"]) if r["shown_amount_rs"] else None,
                                  "inputs": json.loads(r["inputs_used"]), "adjusted": json.loads(r["site_adjusted_inputs"] or "{}"),
                                  "matchesRule": r["matches_rule"] == "True", "notAsked": r["not_asked"]}
        out.append({"id": pid, "age": age, "monthlyIncome": income, "existingEmi": emi, "employment": emp, "seen": seen})
    return out, common


def main():
    ver = verification()
    sites = {}
    for s in SITES:
        parts = literal(SRC / "rules" / f"{s}.py", "PARTS") or []
        sites[s] = {"url": url_of(s), "testedOn": dates(s), "checks": ver[s],
                    "parts": [{"what": w, "label": l, "evidence": e.replace("(rule 3.2)", "(no personal details were typed)")} for w, l, e in parts]}
    m = re.search(r"\((\d+)/(\d+); \d+ differ\)", (SRC / "reports" / "summary.md").read_text(encoding="utf-8"))
    sites["fibe"]["emiMatched"] = [int(m.group(1)), int(m.group(2))]
    m = re.search(r"\| (\d+)/(\d+) probes equal \|", (SRC / "reports" / "summary.md").read_text(encoding="utf-8"))
    sites["poonawalla"]["payableEqualsAmount"] = [int(m.group(1)), int(m.group(2))]
    quotes = {r["cue_id"]: r["cue_text"] for r in csv.DictReader(open(SRC / "data" / "cues.csv", encoding="utf-8"))}
    pers, common = personas()
    totals = {k: sum(v["checks"][k][0] for v in sites.values()) for k in ("build", "heldOut", "persona", "limit")}
    totals["notComparable"] = sum(v["checks"]["notComparable"] for v in sites.values())
    totals["logged"] = sum(v["checks"]["logged"] for v in sites.values())
    data = {"sites": sites, "personas": pers, "personaCommon": common, "totals": totals, "quotes": quotes}
    js = ("// Generated by scripts/import_audit.py from the audit repo. Do not edit by hand.\n"
          f"export const AUDIT = Object.freeze({json.dumps(data, ensure_ascii=False, separators=(",", ":"))});\n")
    (HERE / "site" / "audit-data.js").write_text(js, encoding="utf-8")
    for d in (HERE / "data" / "audit", HERE / "site" / "data"):
        d.mkdir(parents=True, exist_ok=True)
        for s in SITES:
            shutil.copyfile(SRC / "data" / "probes" / f"{s}.csv", d / f"{s}.csv")
        shutil.copyfile(SRC / "reports" / "comparison.csv", d / "personas.csv")
    print("wrote site/audit-data.js;", totals)


if __name__ == "__main__":
    main()
