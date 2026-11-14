"""Rules reconstructed from outside (black-box probing) for two public
personal-loan eligibility calculators, as observed on 14 Nov 2026.

Nothing here comes from the sites' code: each rule was inferred from
input -> output pairs and then checked on held-out inputs it had not seen.

Run:  python rules.py          (re-checks every probe in data/checker_probes.csv)
"""
import csv
import sys
from pathlib import Path


def annuity_factor(annual_rate_pct: float, months: int) -> float:
    """Loan amount supported by an EMI of 1 rupee (present value of an annuity)."""
    r = annual_rate_pct / 1200.0
    return (1 - (1 + r) ** -months) / r


def bajaj_rule(monthly_income: float, monthly_expense: float) -> int:
    """Bajaj Finserv personal-loan eligibility calculator.

    eligible = min(10 x income, PV(10% p.a., 60 months) x (0.75 x income - expense))
    - interest rate fixed at 10% p.a. (the lowest of the 10%-30.5% range the same page advertises)
    - tenure fixed at 60 months
    - up to 75% of income may go to EMIs + expenses
    - cap: 10 x monthly income
    - city is asked for (required field) but does not change the result
    - age is not asked; a note says loans are for ages 18-65
    """
    emi_capacity = 0.75 * monthly_income - monthly_expense
    amount = min(10 * monthly_income, annuity_factor(10, 60) * emi_capacity)
    return max(0, round(amount))


def paisabazaar_rule(age: int, desired: float, rate_pct: float, tenure_years: int,
                     monthly_income: float, existing_emi: float):
    """Paisabazaar personal-loan eligibility calculator.

    eligible = min(desired, 24 x income, PV(rate, tenure) x (0.55 x income - existing EMI))
    - up to 55% of income may go to EMIs
    - cap: 24 x monthly income, and never more than the amount you asked for
    - tenure silently capped at 5 years (the slider goes to 10)
    - loan must end by age 60: tenure = min(chosen, 5, 60 - age)
    - age below 21 -> "not eligible ... age is lower than the minimum age required"
      (the age slider starts at 18; found in a live re-check on 14 Nov 2026, see
      data/LIVE_CHECK_2026-11-14.md)
    - age above 60 -> "not eligible ... age is higher than the maximum age allowed"
    - age exactly 60 -> "not eligible ... would exceed the maximum permissible age on maturity"
    - existing EMIs >= 55% of income -> "not eligible ... existing debts ... higher than the
      permissible limit"; any positive room left is still "eligible" (even Rs 47)
    """
    if age < 21:
        return "not eligible: age below minimum"
    if age > 60:
        return "not eligible: age above maximum"
    years = min(tenure_years, 5, 60 - age)
    if years <= 0:
        return "not eligible: age at maturity"
    emi_capacity = round(0.55 * monthly_income - existing_emi, 6)
    if emi_capacity <= 0:
        return "not eligible: existing debts too high"
    amount = min(desired, 24 * monthly_income, annuity_factor(rate_pct, years * 12) * emi_capacity)
    return max(0, round(amount))


def _num(x):
    return float(x) if x not in ("", None) else None


def recheck(csv_path: Path) -> int:
    """Recompute the rule for every probe and compare with what the site showed."""
    bad = 0
    rows = list(csv.DictReader(open(csv_path, newline="", encoding="utf-8")))
    for row in rows:
        shown = row["shown_eligible_amount"]
        if row["site"] == "bajaj_finserv":
            if row["probe_type"] == "limit":
                continue  # input rejected by the slider limits, nothing to predict
            pred = bajaj_rule(_num(row["monthly_income"]), _num(row["monthly_expense_or_existing_emi"]))
            ok = abs(pred - float(shown)) <= 1
        else:
            pred = paisabazaar_rule(int(row["age"]), _num(row["desired_amount"]), _num(row["rate_pct"]),
                                    int(row["tenure_years_chosen"]), _num(row["monthly_income"]),
                                    _num(row["monthly_expense_or_existing_emi"]))
            if isinstance(pred, str):
                reason = {"age below minimum": "age lower than minimum",
                          "age above maximum": "age higher than maximum",
                          "age at maturity": "age on maturity",
                          "existing debts too high": "existing debts"}[pred.split(": ")[1]]
                ok = shown == "" and reason in row["shown_message"]
            else:
                ok = shown != "" and abs(pred - float(shown)) <= 1
        if not ok:
            bad += 1
            print("MISMATCH:", row["site"], row["probe_type"], "shown", shown or row["shown_message"], "rule", pred)
    checked = sum(1 for r in rows if r["probe_type"] != "limit")
    print(f"checked {checked} probes, {bad} mismatches (tolerance: 1 rupee of rounding)")
    return bad


if __name__ == "__main__":
    sys.exit(1 if recheck(Path(__file__).resolve().parent.parent / "data" / "checker_probes.csv") else 0)
