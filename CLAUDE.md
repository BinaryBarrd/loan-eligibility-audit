# CLAUDE.md: "Same person, different 'You are eligible'"

Brief for Claude Code. Put this file in the root of the repo; Claude Code reads it automatically.

---

## 0. How to work with me (read first)

- I'm Aditya. I'm building this myself, with you. Work **in phases** (Section 9): after each phase, stop, show me what changed in a few plain sentences, and wait for my OK.
- Explain things simply. No jargon unless I ask.
- **Ask me before you:**
  - deploy anything, or make anything public
  - add any names: mine, BITS Pilani, my professors
  - change the reconstructed rules
  - add any dependency
- **Never invent a number.** Every number on the page must come from `site/rules.js` or `data/checker_probes.csv`.
- If something in this brief is unclear or looks wrong, ask. Don't guess.

---

## 1. What we're building

**One static, phone-friendly web page.** It shows that two popular Indian personal-loan eligibility calculators give the same person very different "You are eligible" answers, and which hidden assumptions produce each number.

- **Audience:** first my professors, through an unlisted link. Maybe the public later; that's my decision.
- **What it must not be:** an accusation. It's a factual, dated, reproducible comparison.

---

## 2. Background (short)

- This is part of my research on **trustworthiness cues**: the things people see (badges, scores, "pre-approved", "You are eligible") that make them trust an automated system.
- I audited two public calculators from outside. I typed many input combinations, recorded every answer, and worked out the formula behind each one.
- **Main finding:** both are fixed formulas, not AI, and neither uses a credit score. Yet both word the result as *your* eligibility.
- Full results are in `reference/FINDINGS.md`. Read it before starting.

---

## 3. Repo layout

```
.
├── CLAUDE.md                     ← this file
├── reference/                    ← from my audit; read, don't edit
│   ├── FINDINGS.md               ← results + cue coding
│   ├── rules.py                  ← the reconstructed rules (source of truth)
│   ├── checker_audit.py          ← re-probes the live calculators (runs locally, not part of the site)
│   └── chatbot_persona_audit.py  ← chatbot audit (later phase, not part of the site yet)
├── data/
│   └── checker_probes.csv        ← every probe: inputs, what the site showed, rule prediction (76 checked rows)
├── site/                         ← everything that gets deployed
│   ├── index.html
│   ├── styles.css
│   ├── app.js                    ← page logic (form → results)
│   ├── rules.js                  ← the two rules, ported from rules.py (pure functions, ES module)
│   ├── checker_probes.csv        ← copy of data/checker_probes.csv, for the download link
│   └── robots.txt                ← blocks indexing while unlisted
├── tests/
│   └── rules.test.js
└── package.json                  ← only for tests: { "type": "module", "scripts": { "test": "node --test tests/" } }
```

There is no build step and no framework. `site/` is deployed as it is.

---

## 4. The two rules (port these exactly)

`reference/rules.py` is the source of truth. Port it to `site/rules.js` as pure functions. If this section and rules.py ever disagree, **stop and ask me**.

### Shared helper

```
annuityFactor(annualRatePct, months):
    r = annualRatePct / 1200
    return (1 - (1 + r) ** -months) / r
```

This is how much loan an EMI of ₹1 can repay. For example, `annuityFactor(10, 60) ≈ 47.0654`.

### 4.1 Bajaj Finserv (a lender)

Page: https://www.bajajfinserv.in/personal-loan-eligibility-calculator

```
bajaj(monthlyIncome, monthlyExpense):
    room   = 0.75 * monthlyIncome - monthlyExpense
    amount = min(10 * monthlyIncome, annuityFactor(10, 60) * room)
    return max(0, round(amount))
```

- **Fixed assumptions:** 10% p.a. (the lowest of the "10% and 30.5% p.a." the same page advertises); 60 months; up to 75% of income for EMIs plus expenses; cap of 10 × monthly income.
- **Ignores:** the rate and tenure the visitor picks (Bajaj has no such inputs), city (a required field that changes nothing), age, credit score.
- **Allowed input on the site:**
  - monthly income ₹25,000 – ₹10,00,000. Outside this the site shows "Minimum allowed value is ₹25,000" or "Maximum allowed value is ₹10 Lakhs", and no amount.
  - monthly expense ₹0 – ₹10,00,000.
- **Wording shown on the site:** "You are eligible for a personal loan upto ₹X". It still says this when X is ₹0.

### 4.2 Paisabazaar (a loan marketplace)

Page: https://www.paisabazaar.com/personal-loan/eligibility-calculator/

```
paisabazaar(age, desiredAmount, ratePct, tenureYears, monthlyIncome, existingEmi):
    if age < 21:                return NOT_ELIGIBLE("age below minimum")
    if age > 60:                return NOT_ELIGIBLE("age above maximum")
    years = min(tenureYears, 5, 60 - age)
    if years <= 0:              return NOT_ELIGIBLE("age at maturity")
    room = round6(0.55 * monthlyIncome - existingEmi)    // round to 6 decimals: avoids 0.55 float error
    if room <= 0:               return NOT_ELIGIBLE("existing debts too high")
    amount = min(desiredAmount, 24 * monthlyIncome, annuityFactor(ratePct, years * 12) * room)
    return { amount: round(amount), years, emi: round(amount / annuityFactor(ratePct, years * 12)), numberOfEmis: years * 12 }
```

- **Fixed assumptions:**
  - up to 55% of income for EMIs
  - cap of 24 × monthly income, and never more than the desired amount
  - tenure silently capped at 5 years (the slider goes to 10)
  - the loan must end by age 60
  - minimum age 21, though the age slider starts at 18 (found in the live re-check, `data/LIVE_CHECK_2026-11-14.md`)
- **Ignores:** employment type and monthly expenses, though its page says it estimates "based on your income, employment type, monthly expenses and more". Also credit score.
- **Allowed input on the site (slider ranges):** age 18–70; desired ₹50,000 – ₹50,00,000; rate 8–30%; tenure 1–10 years; income ₹20,000 – ₹10,00,000; existing EMI ₹0 – ₹40,000. Typed values above ₹40,000 EMI were still accepted.
- **Wording shown on the site:** "You are eligible for ₹X", plus "Estimated EMI", "Number of EMI" and "Eligible Tenure". For the not-eligible cases, show these reasons as text:
  - age below minimum → "may not be eligible for most loan offers, as your age is lower than the minimum age required"
  - age above maximum → "may not be eligible for most loan offers, as your age is higher than the maximum age allowed"
  - age at maturity → "may not be eligible for most loan offers, as you would exceed the maximum permissible age on maturity"
  - existing debts too high → "may not be eligible for most loan offers, as your existing debts on your current income are higher than the permissible limit"

### 4.3 Values to check against (all seen on the live sites, 14 Nov 2026)

| Inputs | Expected |
|---|---|
| bajaj(40000, 10000) | 400000 |
| bajaj(60000, 35000) | 470654 |
| bajaj(100000, 75000) | 0 |
| paisabazaar(29, 2000000, 10, 5, 40000, 10000) | amount 564784, years 5 |
| paisabazaar(29, 200000, 10, 3, 40000, 10000) | amount 200000, emi 6453, 36 EMIs |
| paisabazaar(26, 4000000, 12, 6, 120000, 30000) | amount 1618381, years 5 (tenure cap) |
| paisabazaar(59, 2000000, 10, 5, 80000, 0) | amount 500478, years 1 |
| paisabazaar(35, 2000000, 10, 5, 60000, 32999) | amount 47 (still "eligible") |
| paisabazaar(35, 2000000, 10, 5, 60000, 33000) | not eligible: existing debts too high |
| paisabazaar(60, 2000000, 10, 5, 80000, 0) | not eligible: age at maturity |
| paisabazaar(61, 2000000, 10, 5, 80000, 0) | not eligible: age above maximum |

Rounding: JS `Math.round` and Python `round` differ on exact .5 values, so tests allow ₹1 difference. Show money in Indian format with `toLocaleString('en-IN')`, e.g. ₹5,64,784.

---

## 5. Page content (in this order)

### 5.1 Top

- **Title:** Same person, different "You are eligible"
- **One or two sentences:** Two popular loan-eligibility calculators give the same person very different answers. Here is what each one assumes.
- **Date stamp:** "Tested on 14 November 2026. The sites may have changed since."

### 5.2 Try it yourself

- **Inputs, with plain labels and short helper text:**

  | Input | Default |
  |---|---|
  | Age | 29 |
  | Monthly income (₹) | 40,000 |
  | Monthly EMIs you already pay (₹) | 10,000 |
  | Loan amount you want (₹) | 20,00,000 |
  | Interest rate for the Paisabazaar calculation (%) | 10 |
  | Loan tenure for the Paisabazaar calculation (years, 1–10) | 5 |

- **Two result cards side by side,** stacked on a phone. Each card has:
  1. **The site name** in plain text, linking to the original calculator. No logos, no brand colours.
  2. **What that site would show,** in its own style of wording ("You are eligible for ₹X" or the not-eligible reason).
  3. **"What's behind this number"**: that site's assumptions (Section 4). For Bajaj, clearly say: "always uses 10% and 5 years, whatever rate or tenure you pick".
  4. **"What it ignores":** for example, credit score; for Bajaj also city; for Paisabazaar also employment type.
  5. **A notice when input is outside that site's allowed range,** e.g. "This calculator only accepts monthly income from ₹25,000 to ₹10 lakh."
- **Under the cards, one computed line:** "Difference between the two: ₹X" (or "one says eligible, the other says not eligible").
- **Bajaj's input is labelled "expenses" and Paisabazaar's "existing EMIs".** Use the EMI value for both, and say so in one small note.

### 5.3 Four example people

A static table of cases A–D from `reference/FINDINGS.md`, copied exactly. Keep the *rule* label on the one predicted cell.

### 5.4 What we found

Short bullets taken from FINDINGS.md:
- not AI, just fixed formulas
- no credit score
- assumptions hidden
- city ignored
- tenure silently capped
- "eligible" for ₹47
- the page claims inputs it doesn't ask for

### 5.5 How we tested

Use Appendix A. I will rewrite this text. Put a visible `[DRAFT]` marker on it until I say it's final.

### 5.6 Limits

Use Appendix B, also marked `[DRAFT]`.

### 5.7 Data

- Download link for `checker_probes.csv`.
- Links to both original calculator pages.
- One line: "76 checks; our rules matched what the sites showed to within ₹1."

### 5.8 Footer

- "Not financial advice."
- "Nothing you type here leaves your browser."
- "Contact: [to be added]". Leave this as a placeholder.

### 5.9 Wording rules (strict)

- Neutral and factual. Prefer "the calculator assumes …" and "the page says …".
- Quote the sites' own words where useful, e.g. both call their results "indicative".
- **Never use** these words anywhere on the page: misleading, shady, fishy, scam, trick, fraud, predatory, lie, cheat, dark pattern.
- Don't say the calculators are AI, or that they are the lenders' real loan decisions.
- No logos, screenshots or brand colours of either company.

---

## 6. Technical requirements

- **Code:** plain HTML, CSS and JavaScript (ES modules). No framework, no build step, and no runtime dependencies without asking me.
- **No backend.** No cookies, no analytics, no tracking, no external fonts or scripts. After the page loads, it makes **no network requests** (system fonts only).
- **`site/rules.js`:** pure functions, exported, and used by both `app.js` and the tests.
- **Phone-first:** must work at 360 px wide with no sideways scrolling. Big tap targets; results update as you type.
- **Accessible:**
  - a `<label>` on every input
  - works with the keyboard
  - enough colour contrast
  - results announced with `aria-live="polite"`
- **Light and dark mode** via `prefers-color-scheme`.
- **While unlisted:**
  - in `index.html`: `<meta name="robots" content="noindex, nofollow">`
  - in `site/robots.txt`: `User-agent: *` and `Disallow: /`

---

## 7. Tests (`node --test tests/`)

`tests/rules.test.js` must:

1. **Check every probe in `data/checker_probes.csv`:**
   - Skip rows where `probe_type` is `limit` (inputs the site rejected).
   - **Bajaj rows:** `|bajaj(income, expense) − shown_eligible_amount| ≤ 1`.
   - **Paisabazaar rows with an amount:** same check, against `amount`.
   - **Paisabazaar rows with a message:** the rule returns not-eligible, and its reason matches the message:
     - "age higher than maximum" → age above maximum
     - "age on maturity" → age at maturity
     - "existing debts" → existing debts too high
   - Expect **76 rows checked, 0 mismatches**, and print the count.
2. **Check every row in the table in Section 4.3.**
3. **Check the range warnings** (e.g. Bajaj income 20,000 → out-of-range notice).

Write a tiny CSV parser. The file has no quoted commas, but don't rely on that: handle quotes properly.

An optional smoke test with Playwright (dev dependency only, ask me first): the page loads, typing changes the results, and there are no console errors.

---

## 8. Deployment (only when I say so)

**Before any deploy:**
- `npm test` passes.
- The page is checked at phone width.
- The noindex tag and robots.txt are present.
- A search for the banned words (Section 5.9) finds nothing.

**Option A: Vercel (preferred)**
- I run `npx vercel` and log in myself in the terminal. Never handle my credentials.
- Set the project to serve `site/` as a static site.
- The first deploy is a **preview URL**. That is our unlisted link.
- `vercel --prod` only after I say so.

**Option B: GitHub Pages**
- Serve `site/` from the repo.
- Note that a free GitHub Pages site needs a public repo, which makes the code and data public too. Tell me before choosing this.

---

## 9. Phases (stop after each one)

1. **Set up:** create the layout from Section 3, copy the reference files, port the rules to `site/rules.js`, and write the tests. Done when `npm test` shows 76/76 plus all of Section 4.3.
2. **"Try it yourself":** the form and the two result cards with assumptions, "ignores" and range notices. Done when the defaults show ₹4,00,000 (Bajaj) and ₹5,64,784 (Paisabazaar).
3. **The rest of the page:** example table, findings, method `[DRAFT]`, limits `[DRAFT]`, data download, footer.
4. **Polish:** phone layout, keyboard, contrast, dark mode, noindex, and no network requests after load. Then run the checklist in Section 10 and report the results.
5. **Preview deploy:** an unlisted link I can open on my phone.
6. **Later, a separate task:** a section for the chatbot persona audit, once I have run `reference/chatbot_persona_audit.py` and have data.

---

## 10. Done when (checklist)

- [ ] `npm test`: 76/76 probes and all of Section 4.3 pass
- [ ] Every number on the page comes from `rules.js` or the CSV
- [ ] Works at 360 px with no sideways scroll; keyboard-only works
- [ ] No network requests after load (checked in the browser's network tab)
- [ ] noindex meta tag and robots.txt present
- [ ] None of the banned words appear
- [ ] Date stamp and links to both original pages present
- [ ] Method and Limits still marked `[DRAFT]` until I approve the text
- [ ] No names or affiliations on the page until I approve

---

## Appendix A: "How we tested" (draft, Aditya will rewrite)

On 14 November 2026 we opened each calculator in a normal web browser. We typed in different values (income, expenses or EMIs, age, interest rate, tenure), usually changing one thing at a time, and wrote down what the calculator showed. From these input–output pairs we worked out the rule each calculator follows. We then tested each rule on inputs we had not used to build it. Across 76 checks, the rules matched what the sites showed to within ₹1 of rounding.

We did not log in, enter a PAN, phone number or OTP, or submit any application. We only used the calculators on the public pages. Changing the inputs sends nothing to the sites' servers: the calculation happens in the browser. So these are fixed formulas, not AI, and not a real loan decision.

## Appendix B: Limits (draft)

- Both sites call their results "indicative". These are calculators, not loan offers. Real lenders also look at credit score, job, documents and more.
- We tested two calculators on one day. Others may work differently, and these two may change at any time.
- The rules match every case we tried, but we did not see the sites' code. A rule could differ for inputs we didn't try.
- Bajaj asks for "monthly expenses" and Paisabazaar for "existing EMIs". In the comparison we use the same number for both.

## Appendix C: Plain-language labels

| Term | Say this on the page |
|---|---|
| EMI | monthly instalment |
| Tenure | how many years you repay over |
| Interest rate (p.a.) | yearly interest rate |
| FOIR | share of your income allowed for EMIs |
| Annuity factor | don't show it; say "how much loan a monthly instalment can repay" |
