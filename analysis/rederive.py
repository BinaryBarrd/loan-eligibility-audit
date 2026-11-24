"""Re-derive every calculator's rule from the probe logs alone, step by step.

Anyone with the CSV files in data/ can run this. It uses plain Python (3.9+), nothing to install:

    python3 analysis/rederive.py            # prints the derivation for all nine calculators
    python3 analysis/rederive.py kotak      # just one

It never reads site/rules.js or the audit's rule files. Each constant is measured from the
probes with a stated calculation, the rule is assembled from those measurements, and the
assembled rule is then checked against every probe, including the held-out ones that were
not used to build it. A full report is also written to analysis/derivation_report.md.

The method (see the methodology write-up for the reasoning behind each step):
  Step 1  Load the log as it stands after corrections; keep held-out probes aside.
  Step 2  Which inputs matter? Compare probes that differ in one input only.
  Step 3  Read the shape of each one-input sweep: flat, straight line, kink, step or curve.
  Step 4  Measure slopes (change in amount / change in input).
  Step 5  Where a loan formula is involved, find the interest rate behind it.
  Step 6  Turn slopes into coefficients and find the constant term from a baseline probe.
  Step 7  Find caps, floors, cut-offs and rounding.
  Step 8  Assemble the rule and check it on every probe, held-out probes last.
"""
import csv
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "audit"
OUT = Path(__file__).resolve().parent / "derivation_report.md"
LINES = []


def say(s=""):
    print(s)
    LINES.append(s)


# --------------------------------------------------------------------------- Step 1: loading

def money(text):
    """'₹ 6,00,000' -> 600000.0; '' -> None (no amount on screen)."""
    digits = re.sub(r"[^\d.]", "", text or "")
    return float(digits) if digits else None


def load(site):
    """Probe rows after corrections: '<id>~fixN' replaces '<id>', '<id>~voidN' withdraws it, '~err' rows are dropped."""
    raw = list(csv.DictReader(open(DATA / f"{site}.csv", encoding="utf-8")))
    fixes, voided = {}, set()
    for r in raw:
        if "~fix" in r["probe_id"]:
            fixes[r["probe_id"].split("~fix")[0]] = r
        if "~void" in r["probe_id"]:
            voided.add(r["probe_id"].split("~void")[0])
    probes = []
    for r in raw:
        pid = r["probe_id"]
        if "~err" in pid or "~fix" in pid or "~void" in pid or pid in voided:
            continue
        r = fixes.get(pid, r)
        note = r["note"] or ""
        probes.append({
            "id": pid,
            "step": r["step"],
            "varies": note.split(";")[0][len("varies="):] if note.startswith("varies=") else "",
            "x": json.loads(r["inputs_json"]),
            "a": money(r["shown_amount"]),
            "msg": (r["shown_message"] or "") + " " + (r["shown_text"] or ""),
            "out": json.loads(r["other_outputs_json"]) if r["other_outputs_json"].strip() else {},
        })
    return probes


def building(P):
    """Probes the rule may be built from: everything except held-out probes and the standard people."""
    return [p for p in P if p["step"] not in ("holdout", "persona")]


def sweep(P, field):
    """One-input sweep: probes that changed only `field` (sorted by its value, one probe per value)."""
    pts = {}
    for p in building(P):
        if p["varies"] == field and p["step"] in ("sweep", "boundary"):
            pts.setdefault(p["x"][field], p)
    return [(x, pts[x]) for x in sorted(pts)]


def pairs(P, field):
    """Pairs of probes whose inputs differ in `field` only (works without sweep notes)."""
    out, rows = [], building(P)
    for i, p in enumerate(rows):
        for q in rows[i + 1:]:
            if p["x"].get(field) != q["x"].get(field) and all(p["x"].get(k) == q["x"].get(k) for k in set(p["x"]) | set(q["x"]) if k != field):
                out.append((p, q))
    return out


def baseline(P):
    return next(p for p in P if p["step"] == "baseline")


def rs(v):
    if v is None:
        return "no amount"
    s = f"{abs(v):,.0f}"
    # Indian grouping: 12,34,567
    whole = str(int(round(abs(v))))
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        s = f"{head},{tail}"
    return ("-" if v < 0 else "") + "₹" + s


# --------------------------------------------------------------------------- loan maths

def pv(rate_pct, months):
    """How many rupees of loan one rupee of monthly EMI repays (the annuity factor)."""
    r = rate_pct / 1200
    return (1 - (1 + r) ** -months) / r


def rate_from_pv(value, months):
    """Invert pv(): the yearly rate at which one rupee of EMI repays `value` rupees (bisection)."""
    lo, hi = 0.001, 200.0
    for _ in range(100):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if pv(mid, months) > value else (lo, mid)
    return (lo + hi) / 2


def rate_from_tenure_sweep(points, n_ref):
    """Grid search 5.00%..39.99%: the rate whose pv() reproduces how the amount changes with tenure.
    Ratios A(n)/A(n_ref) cancel the unknown EMI room, so only the rate is left."""
    d = dict(points)
    best = (float("inf"), None)
    for k in range(500, 4000):
        R = k / 100
        sse = sum((pv(R, n) / pv(R, n_ref) - a / d[n_ref]) ** 2 for n, a in points)
        best = min(best, (sse, R))
    return best[1], best[0]


# --------------------------------------------------------------------------- shapes, slopes, brackets

def slopes(pts):
    """Finite differences between neighbouring points: (A2 - A1) / (x2 - x1)."""
    return [((p1["a"] - p0["a"]) / (x1 - x0), x0, x1) for (x0, p0), (x1, p1) in zip(pts, pts[1:])
            if p0["a"] is not None and p1["a"] is not None]


def describe(pts, field):
    """Step 3: name the shape of a sweep in plain words."""
    vals = [p["a"] for _, p in pts]
    if any(isinstance(x, str) for x, _ in pts):  # a text input such as a city: only "does the amount change?"
        names = ", ".join(str(x) for x, _ in pts)
        amounts = sorted({rs(v) for v in vals})
        return f"{len(pts)} values ({names}) give {len(amounts)} distinct amount(s): {', '.join(amounts)}" + (
            f", so {field} does not change the amount" if len(amounts) == 1 else "")
    s = slopes(pts)
    distinct = sorted({round(v, 4) for v, _, _ in s})
    shown = [v for v in vals if v is not None]
    if len(set(shown)) == 1 and len(shown) == len(vals):
        return f"flat: all {len(pts)} values give {rs(shown[0])}, so {field} does not change the amount"
    parts = []
    run = None
    for v, x0, x1 in s:
        key = "flat" if abs(v) < 1e-9 else f"slope {v:,.4f}"
        if run and run[0] == key:
            run[2] = x1
        else:
            run = [key, x0, x1]
            parts.append(run)
    text = "; ".join(f"{k} from {x0:,.0f} to {x1:,.0f}" for k, x0, x1 in parts[:6])
    more = f" (+{len(parts) - 6} more segments)" if len(parts) > 6 else ""
    return f"{len(pts)} points; {len(distinct)} distinct slope(s): {text}{more}"


def bracket(pts, test):
    """Step 7: the last probe where `test` is False and the first where it is True."""
    for (x0, p0), (x1, p1) in zip(pts, pts[1:]):
        if not test(p0) and test(p1):
            return (x0, p0), (x1, p1)
    return None


def show_bracket(b, what):
    if not b:
        return f"{what}: not bracketed by the probes"
    (x0, p0), (x1, p1) = b
    return f"{what}: between {x0:,.0f} ({p0['id']}: {rs(p0['a'])}) and {x1:,.0f} ({p1['id']}: {rs(p1['a'])})"


def ls_slope(xs, ys):
    """Ordinary least squares slope through (x, y) points (useful when amounts are rounded)."""
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)


# --------------------------------------------------------------------------- Step 8: check

RESULTS = {}


def check(site, P, predict, tol=1, comparable=lambda x: True):
    groups = {"rule-building": [0, 0], "held-out": [0, 0], "standard people": [0, 0]}
    misses, skipped = [], 0
    for p in P:
        if not comparable(p["x"]):
            skipped += 1
            continue
        g = "held-out" if p["step"] == "holdout" else "standard people" if p["step"] == "persona" else "rule-building"
        pred = predict(p["x"])
        ok = (pred is None and p["a"] is None) or (pred is not None and p["a"] is not None and abs(pred - p["a"]) <= tol)
        groups[g][0] += ok
        groups[g][1] += 1
        if not ok:
            misses.append((p["id"], p["x"], rs(p["a"]), rs(pred)))
    say("")
    say("**Step 8: check the assembled rule on every probe**")
    say("")
    say("| probes | matched |")
    say("|---|---|")
    for g, (ok, n) in groups.items():
        if n:
            say(f"| {g} | {ok}/{n} |")
    if skipped:
        say(f"| set aside as not comparable | {skipped} |")
    say("")
    for m in misses[:10]:
        say(f"- MISS {m[0]}: inputs {m[1]} shown {m[2]}, rule {m[3]}")
    RESULTS[site] = (groups, skipped, len(misses))


def head(name, P):
    say("")
    say(f"## {name}")
    say("")
    steps = Counter(p["step"] for p in P)
    say(f"Step 1: {len(P)} probes after corrections ({', '.join(f'{k} {v}' for k, v in sorted(steps.items()))}). "
        f"Held-out probes and standard people are not used until Step 8.")
    say("")


# =========================================================================== the nine calculators

def kotak():
    P = load("kotak")
    head("Kotak Mahindra Bank", P)
    inc, emi, ten = sweep(P, "monthly_income"), sweep(P, "existing_emi"), sweep(P, "tenure_months")
    say(f"- Step 2-3, tenure: {describe(ten, 'tenure')}.")
    say(f"- Step 3, income: {describe(inc, 'income')}.")
    say(f"- Step 3, EMIs: {describe(emi, 'EMIs')}.")
    k = slopes(inc)[0][0]
    ke = slopes(emi)[0][0]
    say(f"- Step 4: income slope {k:,.4f}, EMI slope {ke:,.4f}. Equal size, opposite sign: the amount depends on income − EMIs, "
        f"times {k:g}. No interest rate is involved (whole-number slopes, and tenure is ignored).")
    b = baseline(P)
    c = b["a"] - k * (b["x"]["monthly_income"] - b["x"]["existing_emi"])
    say(f"- Step 6: constant from baseline {b['id']}: {rs(b['a'])} − {k:g} × ({b['x']['monthly_income']:,.0f} − {b['x']['existing_emi']:,.0f}) = {c:,.0f}.")
    zb = bracket(emi, lambda p: p["a"] == 0)
    say(f"- Step 7, floor: {show_bracket(zb, 'the amount reaches ₹0')}; it stays at ₹0 after, so the amount never goes below ₹0. "
        f"No cap: the income sweep stays a straight line up to {rs(inc[-1][0])} income.")
    say(f"- **Rule:** amount = max(0, {k:g} × (income − EMIs)).")

    def predict(x):
        return max(0, round(k * (x["monthly_income"] - x["existing_emi"]) + c))
    check("kotak", P, predict)


def axis():
    P = load("axis")
    head("Axis Bank", P)
    inc, exp = sweep(P, "monthly_income"), sweep(P, "monthly_expense")
    say(f"- Step 3, income (expenses fixed): {describe(inc, 'income')}.")
    say(f"- Step 3, expenses (income fixed): {describe(exp, 'expenses')}.")
    I0 = exp[0][1]["x"]["monthly_income"]
    multiples = sorted({round(p["a"] / x) for x, p in inc if p["a"]})
    cap = max(p["a"] for _, p in inc)
    say(f"- Step 4: amount ÷ income along the income sweep takes only the values {multiples} before it goes flat, "
        f"so the amount is a whole-number multiple of income, not a loan formula. Flat top: cap {rs(cap)}.")
    levels = [p["a"] / I0 for _, p in exp]
    say(f"- Step 4, expense sweep at income {I0:,.0f}: amount ÷ income steps through {sorted(set(round(v) for v in levels), reverse=True)} "
        f"as expenses rise: a step rule, not a slope.")
    b1 = bracket(exp, lambda p: p["a"] < 15 * I0)
    b2 = bracket(exp, lambda p: p["a"] == 0)
    t1, t2 = b1[0][0] / I0, b2[0][0] / I0
    say(f"- Step 7, cut-offs as a share of income: {show_bracket(b1, '15× to 10×')} → expenses/income between {b1[0][0] / I0:.3f} and {b1[1][0] / I0:.3f}; "
        f"{show_bracket(b2, '10× to 0')} → between {b2[0][0] / I0:.3f} and {b2[1][0] / I0:.3f}. "
        f"The rule uses the lower ends ({t1:.0%}, {t2:.0%}); the exact edges are only known within these ranges (inferred).")
    say(f"- **Rule:** multiple = 15 if expenses ≤ {t1:.0%} of income, 10 if ≤ {t2:.0%}, else 0; amount = min({rs(cap)}, multiple × income).")

    def predict(x):
        I, E = x["monthly_income"], x["monthly_expense"]
        m = 15 if E <= t1 * I else 10 if E <= t2 * I else 0
        return round(min(cap, m * I))
    check("axis", P, predict)


def bajaj():
    P = load("bajaj_finserv")
    head("Bajaj Finserv", P)
    city, inc, exp = sweep(P, "city"), sweep(P, "monthly_income"), sweep(P, "monthly_expense")
    say(f"- Step 2, city: {describe(city, 'city')}.")
    say(f"- Step 3, income: {describe(inc, 'income')}.")
    say(f"- Step 3, expenses: {describe(exp, 'expenses')}.")
    capm = Counter(round(p["a"] / x, 6) for x, p in inc if p["a"]).most_common(1)[0][0]
    say(f"- Step 4: along the income sweep the amount is exactly {capm:g} × income (a cap that binds when expenses are low).")
    lin = [(x, p) for x, p in exp if p["a"] and p["a"] < capm * p["x"]["monthly_income"]]
    s = ls_slope([x for x, _ in lin], [p["a"] for _, p in lin])
    P60 = -s
    say(f"- Step 4: where the cap does not bind, the expense sweep is a straight line with slope {s:,.4f}: each rupee of expenses "
        f"removes {P60:,.4f} rupees of loan. That is a loan formula: one rupee of EMI repays {P60:,.4f} rupees.")
    shares = sorted({round((p["a"] / P60 + p["x"]["monthly_expense"]) / p["x"]["monthly_income"], 4) for _, p in lin})
    share = shares[0]
    say(f"- Step 6: share of income for EMIs plus expenses = (amount ÷ {P60:,.4f} + expenses) ÷ income = {shares} on every uncapped point.")
    say("- Step 5, rate and tenure: the page has no rate or tenure box, so the factor fixes only a pair (rate, tenure). The rate each tenure implies:")
    say("")
    say("| tenure (months) | implied yearly rate |")
    say("|---|---|")
    for n in (36, 48, 60, 72, 84):
        # one rupee a month over n months repays at most n rupees (at 0%), so a factor above n is impossible
        say(f"| {n} | {'not possible (would need a rate below 0%)' if P60 > n else f'{rate_from_pv(P60, n):.2f}%'} |")
    say("")
    R = round(rate_from_pv(P60, 60), 2)
    say(f"  Only 60 months gives a round rate ({R:.2f}%), and it is the lowest rate the same page advertises, so the rule uses "
        f"{R:g}% over 60 months (rate seen in the slope; the split into rate and tenure is inferred).")
    lim = [p for p in P if "allowed value" in p["msg"]]
    ok_inc = [p["x"]["monthly_income"] for p in building(P) if p["a"] is not None]
    lo, hi = min(ok_inc), max(ok_inc)
    say(f"- Step 7: floor ₹0 (rows with expenses ≥ {share:.0%} of income show ₹0). Input limits: {len(lim)} probes show "
        f"“Minimum/Maximum allowed value” and no amount; accepted incomes run from {rs(lo)} to {rs(hi)}.")
    say(f"- **Rule:** amount = min({capm:g} × income, PV({R:g}%, 60) × ({share:.0%} × income − expenses)), never below ₹0.")

    def predict(x):
        I, E = x["monthly_income"], x["monthly_expense"]
        if I < lo or I > hi:
            return None
        return max(0, round(min(capm * I, pv(R, 60) * (share * I - E))))
    check("bajaj_finserv", P, predict)


def idfc():
    P = load("idfc_first")
    head("IDFC FIRST Bank", P)
    ten = sweep(P, "tenure_months")
    say(f"- Step 3, tenure: {describe(ten, 'tenure')} — a curve that bends like a loan formula.")
    R, sse = rate_from_tenure_sweep([(x, p["a"]) for x, p in ten], 60)
    F = pv(R, 60)
    say(f"- Step 5: rate grid search on the tenure sweep → **{R:.2f}%** (sum of squared errors {sse:.1e}). One rupee of EMI repays {F:.4f} over 60 months.")
    say("- Step 4 and 5: slope of each input ÷ that factor = its coefficient in the EMI room:")
    say("")
    say("| input | slope | coefficient |")
    say("|---|---|---|")
    coef = {}
    cap = max(p["a"] for p in building(P) if p["a"] is not None)
    for f in ("monthly_income", "other_income", "rent", "sip_investments", "utilities_other_expenses", "existing_emi"):
        pts = [(x, p) for x, p in sweep(P, f) if p["a"] and p["a"] < cap]
        s = slopes(pts)[0][0]
        coef[f] = round(s / F, 3)
        say(f"| {f} | {s:,.3f} | {coef[f]:+.3f} |")
    say("")
    b = baseline(P)
    c = b["a"] / F - sum(coef[f] * b["x"][f] for f in coef)
    say(f"- Step 6, constant from baseline {b['id']}: {rs(b['a'])} ÷ {F:.4f} − Σ coefficient × input = {c:,.2f} → 0.")
    say(f"- Reading the coefficients: +0.7 on income and other income, −0.7 on rent, SIPs and utilities, and −1.7 on EMIs: "
        f"70% of what is left after all commitments, minus the EMIs a second time.")
    say(f"- Step 7: cap {rs(cap)} (flat tops of the sweeps); floor ₹0.")
    say(f"- **Rule:** amount = min({rs(cap)}, PV({R:.2f}%, tenure) × (0.7 × (income + other − rent − SIPs − utilities − EMIs) − EMIs)), never below ₹0.")

    def predict(x):
        room = sum(coef[f] * x[f] for f in coef)
        return max(0, round(min(cap, pv(R, x["tenure_months"]) * room)))
    check("idfc_first", P, predict)


def smfg():
    P = load("smfg")
    head("SMFG India Credit", P)
    sal = [p for p in P if p["x"].get("employment") != "self_employed"]
    b = baseline(sal)
    R0, n0 = b["x"]["rate_pct"], b["x"]["tenure_months"]
    F = pv(R0, n0)
    inc, emi = sweep(sal, "monthly_income"), sweep(sal, "existing_emi")
    rate, ten = sweep(sal, "rate_pct"), sweep(sal, "tenure_months")
    si, se = slopes(inc)[0][0], slopes(emi)[0][0]
    say(f"- Step 3: income {describe(inc, 'income')}; EMIs {describe(emi, 'EMIs')}.")
    say(f"- Step 4-6: at the baseline ({R0:g}%, {n0:g} months) one rupee of EMI repays {F:.4f}. Income slope {si:,.4f} ÷ {F:.4f} = {si / F:.4f}; "
        f"EMI slope {se:,.4f} ÷ {F:.4f} = {se / F:.4f}. So the EMI room is {si / F:.2f} × (income − EMIs).")
    share = round(si / F, 2)
    c = b["a"] / F - share * (b["x"]["monthly_income"] - b["x"]["existing_emi"])
    say(f"- Step 6, constant from baseline {b['id']}: {c:,.2f} → 0.")
    ar = dict((x, p["a"]) for x, p in rate)
    gap_r = max(abs(a / ar[R0] - pv(x, n0) / F) for x, a in ar.items() if a)
    at = dict((x, p["a"]) for x, p in ten)
    gap_t = max(abs(a / at[n0] - pv(R0, x) / F) for x, a in at.items() if a)
    say(f"- Step 5: the rate and tenure sweeps follow PV(chosen rate, chosen tenure) exactly (largest gap in the ratios: rate {gap_r:.1e}, tenure {gap_t:.1e}), "
        "so this calculator uses the rate and tenure you pick.")
    mb = bracket(emi, lambda p: p["a"] is None)
    say(f"- Step 7: {show_bracket(mb, 'the amount disappears (message “income seems to be less than your expenses”)')}: when EMIs reach income. No cap within the income box.")
    se_rows = [p for p in building(P) if p["x"].get("employment") == "self_employed" and p["a"]]
    se_share = sorted({round(p["a"] / pv(p["x"]["rate_pct"], p["x"]["tenure_months"]) / (p["x"]["yearly_profit"] / 12 - p["x"]["existing_emi"]), 4) for p in se_rows})
    say(f"- Self-employed tab: amount ÷ PV ÷ (yearly profit ÷ 12 − EMIs) = {se_share} on all {len(se_rows)} probes with an amount.")
    s2 = se_share[0]
    say(f"- **Rule:** salaried: amount = PV(rate, tenure) × {share:.2f} × (income − EMIs); self-employed: PV × {s2:.2f} × (yearly profit ÷ 12 − EMIs); "
        "message when EMIs ≥ income (or monthly profit).")

    def predict(x):
        F = pv(x["rate_pct"], x["tenure_months"])
        if x.get("employment") == "self_employed":
            m = x["yearly_profit"] / 12
            return None if x["existing_emi"] >= m else round(F * s2 * (m - x["existing_emi"]))
        if x["existing_emi"] >= x["monthly_income"]:
            return None
        return round(F * share * (x["monthly_income"] - x["existing_emi"]))
    check("smfg", P, predict)


def fibe():
    P = load("fibe")
    head("Fibe", P)
    inc, exp = sweep(P, "monthly_income"), sweep(P, "monthly_expense")
    say(f"- Step 3, income: {describe(inc, 'income')}.")
    say(f"- Step 3, expenses: {describe(exp, 'expenses')}.")
    # tenure tiers from the page's own "tenure" output
    tiers, prev = [], None
    for x, p in inc:
        t = p["out"].get("tenure")
        if t and t != prev:
            tiers.append((x, int(t.split()[0])))
            prev = t
    edges = []
    for (x0, t0), (x1, t1) in zip(tiers, tiers[1:]):
        last = max(x for x, p in inc if p["out"].get("tenure", "").startswith(f"{t0} ") and x < x1)
        edges.append((last, t0))
    edges.append((float("inf"), tiers[-1][1]))
    say(f"- Step 2: the page also shows a tenure. Along the income sweep it changes at: "
        + ", ".join(f"up to {rs(e)} → {t} months" for e, t in edges[:-1]) + f", above → {edges[-1][1]} months.")
    tier = lambda I: next(t for e, t in edges if I <= e)
    six = sorted({round(p["a"] / p["x"]["monthly_income"], 4) for p in building(P) if p["a"] and tier(p["x"]["monthly_income"]) == 6})
    say(f"- Step 4: in the 6-month tier, amount ÷ income = {six}.")
    I0 = exp[0][1]["x"]["monthly_income"]
    T0 = tier(I0)
    lin = [(x, p) for x, p in exp if p["a"]]
    segs = slopes(lin)
    steep = min(v for v, _, _ in segs)
    keep = {x for v, x0, x1 in segs if v <= 0.9 * steep for x in (x0, x1)}  # the steady steep stretch only
    pts = [(x, p) for x, p in lin if x in keep]
    s = ls_slope([x for x, _ in pts], [p["a"] for _, p in pts])
    R_est = rate_from_pv(-s, T0)
    say(f"- Step 4-5: at income {I0:,.0f} ({T0}-month tier) the expense sweep is flat, then falls steadily between expenses "
        f"{min(keep):,.0f} and {max(keep):,.0f} with slope ≈ {s:,.2f} (least squares over {len(pts)} points; amounts are rounded), then levels off. "
        f"Solving PV(R, {T0}) = {-s:,.2f} gives R ≈ {R_est:.2f}%.")
    flat = lin[0][1]["a"]
    share_lo = round(flat / pv(R_est, T0) / I0, 2)
    share_hi = round(sum((p["a"] / pv(R_est, T0) + x) / I0 for x, p in pts) / len(pts), 2)
    say(f"- Step 6: flat level ÷ PV ÷ income ≈ {share_lo} (EMI room capped at {share_lo:.0%} of income); on the falling part "
        f"(amount ÷ PV + expenses) ÷ income ≈ {share_hi} (room = {share_hi:.0%} of income − expenses).")
    mult500 = all(p["a"] % 500 == 0 for p in building(P) if p["a"])
    cap = max(p["a"] for p in building(P) if p["a"])
    say(f"- Step 7: every amount is a multiple of ₹500: {mult500}. Cap {rs(cap)}. Pin down the exact rate and the rounding together "
        f"with a grid search (22.0–25.9% × nearest/down/up to ₹500), scored on all rule-building probes:")
    rows = [p for p in building(P)]

    def make(R, rnd):
        def predict(x):
            I, E = x["monthly_income"], x["monthly_expense"]
            if E > I:
                return None
            T = tier(I)
            room = min(share_lo * I, share_hi * I - E)
            if T == 6 or room <= 0:
                return round(six[0] * I)
            return min(cap, rnd(pv(R, T) * room / 500) * 500)
        return predict
    scores = []
    for k in range(220, 260):
        for name, fn in (("nearest", round), ("down", math.floor), ("up", math.ceil)):
            f = make(k / 10, fn)
            ok = sum((f(p["x"]) is None and p["a"] is None) or (f(p["x"]) is not None and p["a"] is not None and abs(f(p["x"]) - p["a"]) <= 1) for p in rows)
            scores.append((ok, k / 10, name, fn))
    scores.sort(key=lambda t: -t[0])
    say("")
    say("| rate | rounding | probes matched |")
    say("|---|---|---|")
    for ok, R, name, _ in scores[:4]:
        say(f"| {R:.1f}% | {name} | {ok}/{len(rows)} |")
    say("")
    _, R, name, fn = scores[0]
    hb = bracket(exp, lambda p: p["a"] is None)
    say(f"- Step 7: {show_bracket(hb, 'the result disappears')}: when expenses go above income.")
    say(f"- **Rule:** tenure by income tier; room = min({share_lo:.0%} × income, {share_hi:.0%} × income − expenses); "
        f"amount = min({rs(cap)}, PV({R:g}%, tenure) × room, rounded {name} to ₹500); 6-month tier or no room: {six[0]:g} × income.")
    check("fibe", P, make(R, fn))


def poonawalla():
    P = load("poonawalla")
    head("Poonawalla Fincorp", P)
    emi, ten = sweep(P, "existing_emi"), sweep(P, "tenure_months")
    s = slopes(emi)[0][0]
    n0 = emi[0][1]["x"]["tenure_months"]
    R = round(rate_from_pv(-s, n0), 2)
    say(f"- Step 4-5: EMI slope {s:,.3f} → one rupee of EMI repays {-s:,.3f} over {n0:g} months → solving gives **R = {R:.2f}%**.")
    R2, sse = rate_from_tenure_sweep([(x, p["a"]) for x, p in ten if p["a"]], max(x for x, p in ten if p["a"]))
    say(f"- Independent check, grid search on the tenure sweep: {R2:.2f}% (sum of squared errors {sse:.1e}).")
    cap = max(p["a"] for p in building(P) if p["a"])
    share_rows = sorted((p for p in building(P) if p["a"] and p["a"] < cap),
                        key=lambda p: p["x"]["monthly_income"])
    bands = []
    for p in share_rows:
        sh = round((p["a"] / pv(R, p["x"]["tenure_months"]) + p["x"]["existing_emi"]) / p["x"]["monthly_income"], 4)
        bands.append((p["x"]["monthly_income"], sh, p["id"]))
    distinct = sorted({b[1] for b in bands})
    say(f"- Step 6: share of income = (amount ÷ PV(R, tenure) + EMIs) ÷ income, on all {len(bands)} uncapped probes, takes only the values {distinct}.")
    edges = []
    for lo_s, hi_s in zip(distinct, distinct[1:]):
        last = max(I for I, sh, _ in bands if sh == lo_s)
        first = min(I for I, sh, _ in bands if sh == hi_s)
        edges.append((last, lo_s))
        say(f"  - {lo_s:.0%} up to income {rs(last)}; {hi_s:.0%} from {rs(first)}.")
    edges.append((float("inf"), distinct[-1]))
    share = lambda I: next(sh for e, sh in edges if I <= e)
    hidden = [p for p in building(P) if p["a"] is None]
    raw_hidden = [pv(R, p["x"]["tenure_months"]) * (share(p["x"]["monthly_income"]) * p["x"]["monthly_income"] - p["x"]["existing_emi"]) for p in hidden]
    top_hidden = max(raw_hidden)
    low_shown = min(p["a"] for p in building(P) if p["a"])
    MIN = 100000
    say(f"- Step 7: cap {rs(cap)}. {len(hidden)} probes show no amount; the formula gives at most {rs(top_hidden)} for them, while the smallest amount shown is "
        f"{rs(low_shown)}. So results below a minimum between those two are hidden; ₹1,00,000 is the round number in that range (inferred).")
    q = pairs(P, "qualification")
    same = sum(1 for p1, p2 in q if p1["a"] == p2["a"])
    say(f"- Step 2, qualification: {same}/{len(q)} probe pairs that differ only in qualification show the same amount → ignored.")
    say(f"- **Rule:** amount = min({rs(cap)}, PV({R:g}%, tenure) × (share × income − EMIs)), share {', '.join(f'{sh:.0%}' for _, sh in edges)} by income band; "
        f"hidden below {rs(MIN)}.")

    def predict(x):
        a = pv(R, x["tenure_months"]) * (share(x["monthly_income"]) * x["monthly_income"] - x["existing_emi"])
        return None if a < MIN else round(min(cap, a))
    check("poonawalla", P, predict)


def aditya_birla():
    P = load("aditya_birla")
    head("Aditya Birla Capital", P)

    def valid(x):
        income = x["monthly_income"] + x.get("variable_income", 0)
        return x["monthly_expense"] <= income and x.get("emi_affordable", 0) <= income - x["monthly_expense"]
    say("- Step 1: when expenses exceed income, or the “EMI you can afford” box exceeds what is left, the page shows a warning and keeps the "
        "previous amount on screen (screenshot tg-exp-01). Those probes are set aside as not comparable.")
    PV_ = [p for p in P if valid(p["x"])]
    b = baseline(PV_)
    net0 = b["x"]["monthly_income"] + b["x"]["variable_income"] - b["x"]["monthly_expense"]
    ten = sweep(PV_, "tenure_years")
    mult = {int(x): round(p["a"] / net0, 3) for x, p in ten}
    say(f"- Step 3-4, tenure: amount ÷ (income + variable income − expenses = {net0:,.0f}) gives multipliers {mult}.")
    for f in ("monthly_income", "variable_income", "monthly_expense"):
        pts = [(x, p) for x, p in sweep(PV_, f) if p["a"] and p["a"] < 5e6]
        say(f"- Step 4, {f}: first slope {slopes(pts)[0][0]:+,.3f} (± the 5-year multiplier).")
    rate = sweep(PV_, "rate_pct")
    say(f"- Step 2, rate: {describe(rate, 'rate')} (where the multiplier limit binds).")
    cap = max(p["a"] for p in building(PV_) if p["a"])
    sb = [p for p in building(PV_) if p["varies"] == "share-by-income" and p["a"]]
    rows = []
    for p in sb:
        x = p["x"]
        income = x["monthly_income"] + x["variable_income"]
        lim1 = mult[int(x["tenure_years"])] * (income - x["monthly_expense"])
        if p["a"] < lim1 - 1:
            rows.append((income, round((p["a"] / pv(x["rate_pct"], 12 * x["tenure_years"]) + x["monthly_expense"]) / income, 4), p["id"]))
    distinct = sorted({r[1] for r in rows})
    say(f"- Step 4-6, a second limit: on {len(rows)} targeted probes the amount is below the multiplier limit. There, "
        f"(amount ÷ PV(chosen rate, years × 12) + expenses) ÷ income takes only the values {distinct}: a loan formula with a share of income.")
    edges = []
    for lo_s, hi_s in zip(distinct, distinct[1:]):
        last = max(I for I, sh, _ in rows if sh == lo_s)
        first = min(I for I, sh, _ in rows if sh == hi_s)
        edges.append((first, lo_s))
        say(f"  - {lo_s:.0%} up to {rs(last)}; {hi_s:.0%} from {rs(first)}.")
    share = lambda I: next((sh for e, sh in edges if I < e), distinct[-1])
    sorry = [p for p in building(PV_) if p["a"] is None]

    def raw(x):
        income = x["monthly_income"] + x["variable_income"]
        n = int(x["tenure_years"])
        return min(cap, mult[n] * (income - x["monthly_expense"]),
                   pv(x["rate_pct"], 12 * n) * (share(income) * income - x["monthly_expense"]))
    top_sorry = max(raw(p["x"]) for p in sorry)
    low_shown = min(p["a"] for p in building(PV_) if p["a"])
    MIN = 100000
    say(f"- Step 7: cap {rs(cap)}. {len(sorry)} probes show “We’re sorry … not be able to help”; the formula gives at most {rs(top_sorry)} for them, "
        f"the smallest amount shown is {rs(low_shown)}: minimum ₹1,00,000 inferred.")
    say(f"- **Rule:** amount = min({rs(cap)}, multiplier(years) × (income + variable − expenses), PV(rate, years × 12) × (share × income − expenses)); "
        "message below ₹1,00,000.")

    def predict(x):
        a = raw(x)
        return None if a < MIN else round(a)
    check("aditya_birla", P, predict, comparable=valid)


def paisabazaar():
    P = load("paisabazaar")
    head("Paisabazaar", P)
    say("- These are the 14 November probes. They have no sweep notes, so Step 2 uses pairs of probes that differ in one input only.")
    for f in ("tenure_years", "rate_pct", "desired_amount", "existing_emi", "monthly_income", "age"):
        for p, q in pairs(P, f)[:2]:
            say(f"  - {f}: {p['x'][f]} → {rs(p['a'])}  vs  {q['x'][f]} → {rs(q['a'])} ({p['id']}, {q['id']})")
    r = {(p["x"]["rate_pct"]): p["a"] for p, q in pairs(P, "rate_pct") for p in (p, q) if p["a"]}
    say(f"- Step 5: amounts at 10% and 20% (same person, 5 years): ratio {r[10] / r[20]:.4f}; PV(10%, 60) ÷ PV(20%, 60) = {pv(10, 60) / pv(20, 60):.4f}. "
        "So the amount is PV(chosen rate, tenure) × a monthly room.")
    rows = [p for p in building(P) if p["a"]]
    for p in rows:
        p["n"] = p["out"].get("shown_tenure_years", p["x"]["tenure_years"]) * 12
    caps = sorted({round(p["a"] / p["x"]["monthly_income"], 4) for p in rows if p["x"]["existing_emi"] == 0 and p["a"] < p["x"]["desired_amount"]})
    say(f"- Step 4: with no EMIs, amount ÷ income = {caps}: a cap of 24 × income.")
    capm = 24
    unc = [p for p in rows if p["a"] < min(p["x"]["desired_amount"], capm * p["x"]["monthly_income"])]
    shares = sorted({round((p["a"] / pv(p["x"]["rate_pct"], p["n"]) + p["x"]["existing_emi"]) / p["x"]["monthly_income"], 4) for p in unc})
    share = shares[0]
    say(f"- Step 6: (amount ÷ PV + EMIs) ÷ income on the {len(unc)} probes below both caps = {shares}: 55% of income for all EMIs.")
    des = [p for p in rows if p["a"] == p["x"]["desired_amount"]]
    say(f"- Step 4: {len(des)} probe(s) show exactly the amount asked for: the result never exceeds the desired amount.")
    say("- Step 7, tenure actually used (the page shows it as “Eligible Tenure”):")
    for p in sorted(building(P), key=lambda p: p["x"]["age"]):
        t = p["out"].get("shown_tenure_years")
        if t is not None and t != p["x"]["tenure_years"]:
            say(f"  - age {p['x']['age']}, chose {p['x']['tenure_years']} years → used {t} ({p['id']}) = 60 − age")
    live = list(csv.DictReader(open(ROOT / "data" / "live_check_2026-11-14.csv", encoding="utf-8")))
    for row in live:
        if row["site"] == "paisabazaar" and row["check"] == "tenure cap":
            say(f"  - live re-check: {row['typed']} → {row['shown_on_site']}")
    say("  So the tenure used is min(chosen, 5 years, 60 − age).")
    msgs = sorted(((p["x"]["age"], p["msg"].strip()[:60]) for p in building(P) if p["a"] is None and "age" in p["msg"]))
    say(f"- Step 7, age messages: {sorted(set(msgs))[:3]} …")
    for row in live:
        if row["site"] == "paisabazaar" and row["check"] == "minimum age":
            say(f"  - live re-check: {row['typed'].split(';')[0]} → {row['shown_on_site'][:70]}")
    say("  So: below 21 or above 60 is not eligible; at 60 there is no time left to repay.")
    say("- **Rule:** years = min(chosen, 5, 60 − age); amount = min(desired, 24 × income, PV(rate, years × 12) × (55% × income − EMIs)); "
        "messages for age < 21, age > 60, no years left, or EMIs ≥ 55% of income.")

    def predict(x):
        if x["age"] < 21 or x["age"] > 60:
            return None
        n = min(x["tenure_years"], 5, 60 - x["age"])
        room = round(share * x["monthly_income"] - x["existing_emi"], 6)
        if n <= 0 or room <= 0:
            return None
        return round(min(x["desired_amount"], capm * x["monthly_income"], pv(x["rate_pct"], n * 12) * room))
    check("paisabazaar", P, predict)


SITES = {"bajaj_finserv": bajaj, "paisabazaar": paisabazaar, "kotak": kotak, "idfc_first": idfc, "smfg": smfg,
         "axis": axis, "fibe": fibe, "poonawalla": poonawalla, "aditya_birla": aditya_birla}


def main(only=None):
    say("# Re-deriving the nine rules from the probe logs")
    say("")
    say("Generated by `analysis/rederive.py` from `data/audit/*.csv` (and, for Paisabazaar's age and tenure limits, "
        "`data/live_check_2026-11-14.csv`). No rule file is read. Amounts are compared to within ₹1.")
    for sid, fn in SITES.items():
        if only and sid != only:
            continue
        fn()
    say("")
    say("## Summary")
    say("")
    say("| calculator | rule-building | held-out | standard people | not comparable | misses |")
    say("|---|---|---|---|---|---|")
    total = 0
    for sid, (g, skipped, miss) in RESULTS.items():
        f = lambda k: f"{g[k][0]}/{g[k][1]}" if g[k][1] else "—"
        say(f"| {sid} | {f('rule-building')} | {f('held-out')} | {f('standard people')} | {skipped or '—'} | {miss} |")
        total += miss
    say("")
    say(f"Total misses: {total}.")
    if not only:
        OUT.write_text("\n".join(LINES) + "\n", encoding="utf-8")
        print(f"\nwrote {OUT.relative_to(ROOT)}")
    return total


if __name__ == "__main__":
    sys.exit(1 if main(sys.argv[1] if len(sys.argv) > 1 else None) else 0)
