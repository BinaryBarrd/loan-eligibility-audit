# Loan-cue pilot audit

Pilot audit for the cue taxonomy, finance vertical. Two parts:

1. **Eligibility checkers** (done, 14 Nov 2026): black-box probing of two public
   calculators (Bajaj Finserv, Paisabazaar). Results in `FINDINGS.md`.
2. **AI chatbots** (ready to run): a persona audit. The same loan question is asked
   by different people (name, city, job) with identical money facts.

## Files

| File | What it is |
|---|---|
| `FINDINGS.md` | results so far, cue coding on the taxonomy, what worked and what didn't |
| `data/checker_probes.csv` | every probe we ran: inputs, what the site showed, the rule's prediction |
| `rules.py` | the two rules we reconstructed; `python reference/rules.py` re-checks all probes (76/76 match) |
| `checker_audit.py` | re-runs the calculator probes in a real browser on your laptop |
| `chatbot_persona_audit.py` | runs the chatbot persona audit with your own API keys |

## Run it yourself

```bash
pip install requests playwright
playwright install chromium

python reference/rules.py                       # re-check the reconstructed rules
python reference/checker_audit.py --show          # re-probe both calculators, watch the browser

export OPENAI_API_KEY=...  OPENAI_MODEL=...     # any of the three providers
export GEMINI_API_KEY=...  GEMINI_MODEL=...
python reference/chatbot_persona_audit.py --reps 5
python reference/chatbot_persona_audit.py --summarise
```

## Chatbot audit: what to do with the results

1. **Write down** the exact model names and the date. Answers change when providers update models.
2. **Comparisons:** `--summarise` prints "yes" rates and median amounts by name, city and job. The money facts are identical for everyone, so a gap points to the persona. With only a few repeats per group, small gaps are noise. Look for consistent gaps and test them before claiming anything.
3. **Code cues by hand:** take 20–30 answers from `data/chatbot_raw.jsonl` and code the cues in them on the 7 dimensions (e.g. a "not financial advice" line, a mention of credit score, a named app). The keyword flags in the CSV are only a first pointer; check them.
4. **Trace back:** does any answer say what its advice is based on? Compare what it claims ("based on your income…") with what actually changed it (the persona).

## Ground rules used

- Only on-page calculators. Nothing submitted; no PAN, OTP or phone number entered.
- Few probes, with pauses between them.
- Chatbots are queried through their official APIs with your own keys.
