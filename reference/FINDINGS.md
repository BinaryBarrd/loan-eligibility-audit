# Pilot audit: loan eligibility checkers (14 Nov 2026)

Black-box audit of two public personal-loan eligibility calculators. We typed in
different values, recorded what each one said, and worked out the rule behind it.
No login, PAN, OTP or phone number was needed; nothing was submitted.

| | Bajaj Finserv (a lender) | Paisabazaar (a loan marketplace) |
|---|---|---|
| Page | bajajfinserv.in/personal-loan-eligibility-calculator | paisabazaar.com/personal-loan/eligibility-calculator |
| Asks for | city, monthly income, monthly expense | age, desired amount, interest rate, tenure, monthly income, existing EMI |
| Shows | "You are eligible for a personal loan upto ₹X" | "You are eligible for ₹X", estimated EMI, "Eligible Tenure" |
| Is it AI? | No: a fixed formula, computed in the browser (no server call) | No: a fixed formula, computed in the browser (no server call) |
| Probes | 43 (2 rejected as out of range; 6 held out to test the rule) | 35 (5 held out to test the rule) |
| Rule reproduces the site | 41/41 | 35/35 |

## The rules we reconstructed

**Bajaj:** `eligible = min(10 × income, PV(10% p.a., 60 months) × (0.75 × income − expense))`, shown as ₹0 when negative

- It assumes a 10% rate, the lowest of the "10% and 30.5% p.a." range advertised on the same page. At 30.5%, the same EMI would support about a third less.
- It assumes up to 75% of income can go to EMIs and expenses.
- When expenses use up all the room, it still reads "You are eligible for a personal loan upto ₹0".
- **City is a required field but changes nothing**, even for a made-up city ("Xyzabc").
- Age is not asked. A note says "18 to 65 years", while elsewhere the same page says "80 years or younger at the end of the loan tenure".

**Paisabazaar:** `eligible = min(desired, 24 × income, PV(rate, tenure) × (0.55 × income − existing EMI))`

- It assumes up to 55% of income can go to EMIs, and caps the loan at 24 × monthly income.
- **Tenure is silently capped at 5 years**: choose 6 or 7 and it shows "Eligible Tenure 5 Years". The slider goes to 10.
- The loan must end by age 60. Above 60 it shows "not eligible for most loan offers, as your age is higher than the maximum age allowed".
- If existing EMIs take up 55% of income or more, it shows "not eligible … your existing debts on your current income are higher than the permissible limit".
- The page says it estimates "based on your income, **employment type, monthly expenses and more**". It asks for neither employment type nor expenses.

**Both will say "You are eligible" for as little as ₹47.** That happens when only ₹1 of monthly room is left. Personal loans in the same pages start at tens of thousands of rupees.

**Neither uses a credit score or any credit history**, though the result is worded as *your* eligibility.

## Same person, different "You are eligible" (5-year loan)

Every amount below was seen on the sites, except one cell marked *rule*.

| Person | Bajaj | Paisabazaar at 10% | Paisabazaar at 20% |
|---|---|---|---|
| A: 29, ₹40k income, ₹10k EMIs | ₹4,00,000 | ₹5,64,784 | ₹4,52,935 |
| B: 29, ₹40k income, no EMIs | ₹4,00,000 | ₹9,60,000 | ₹8,30,380 |
| C: 35, ₹60k income, ₹35k EMIs | ₹4,70,654 | not eligible (debts too high) | not eligible (*rule*: the debt check doesn't use the rate) |
| D: 59, ₹80k income, no EMIs | ₹8,00,000 | ₹5,00,478 (tenure cut to 1 year) | ₹4,74,985 (tenure cut to 1 year) |

(Bajaj asks for "expenses" and Paisabazaar for "existing EMIs". In this table both are the person's EMIs.)

## How the cues fit the taxonomy (first pass, by hand)

| Cue | Scope | Origin | Claimed property | Form | Abstraction | Verifiability | Mandate | Trace-back |
|---|---|---|---|---|---|---|---|---|
| Bajaj: "You are eligible for a personal loan upto ₹X" | worded as *instance* ("you"), actually one *system* rule | deployer (lender) | valid & reliable | numeric + text | high: rate, tenure and 75% hidden | self-attested ("indicative"); checkable by probing | voluntary | no model metric; fixed formula (now **seen**) |
| Bajaj: required "Select City*" field | system | deployer | implies a tailored result | form field | — | checkable by probing | voluntary | **nothing behind it** |
| Paisabazaar: "You are eligible for ₹X" + "Eligible Tenure" | instance wording, system rule | platform (marketplace, not a lender) | valid & reliable | numeric + text | high: 55%, 24× cap, 5-year cap hidden | self-attested ("indicative"); checkable by probing | voluntary | no model metric; fixed formula (now **seen**) |
| Paisabazaar: "not eligible … age / existing debts …" | instance | platform | valid & reliable | text flag | medium: names the reason, hides the cut-off (age 60, 55% of income) | checkable by probing | voluntary | fixed rule (now **seen**) |
| Paisabazaar: "based on your income, employment type, monthly expenses and more" | system | platform | explainable | text | high | checkable by probing | voluntary | **claims inputs that are not used** |

## What worked and what didn't

**Worked**

- Every cue could be classified on the 7 dimensions.
- Probing turned "absent" trace-backs into rules we could see and test. That is trace-back done by experiment.
- Claimed vs measured is directly visible: the page claims inputs it doesn't use, and asks for inputs that change nothing.

**Didn't / open questions**

- **Neither system is AI.** These cues *look* like a personal assessment but rest on fixed formulas. This is useful as a contrast case, but the AI part of the audit has to come from the chatbots (`chatbot_persona_audit.py`, not yet run: it needs your API keys).
- **Scope edge case:** personal wording on a one-size rule. Is that instance or system? We may need a rule for this.
- **Is an input field a cue?** A required field that changes nothing still signals "this is tailored to you". The taxonomy currently has no place for implied cues.
- The same person can be "eligible" for ₹4.7 lakh at one site and "not eligible" at the other. A borrower can't see which assumptions sit behind either answer.
