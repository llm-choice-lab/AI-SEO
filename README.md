# LLM Conjoint Lab

A tool for studying how AI models make consumer choices. It runs one study on many models at once and tests whether each model's stated preferences (from a conjoint) predict what it picks on a shop page (an ACES-style storefront).

It is a single HTML file. Nothing to install: download it, open it in Chrome, add your API keys, run. Keys stay in your browser and calls go straight from your browser to the AI provider.

## What it does, for every model

All models get the same fixed design.

1. **Conjoint.** The model sees pairs of products and picks one. Each pair is asked in both orders (counterbalancing). Binary logistic regression on Product 1 − Product 2 differences gives the attribute weights; the constant is the first-position bias.
2. **Ranking ("Rotman bot").** The model ranks all storefront products several times.
3. **Locked prediction.** The conjoint weights give a predicted choice share for each storefront product. This is saved with a timestamp and SHA-256 hash *before* any storefront trial runs.
4. **Storefront.** The page draws a shop page of the products in a new random order each trial and sends it as a screenshot. The model picks one product and copies back every card, so misreadings are counted.
5. **Results.** Locked prediction vs storefront shares (Spearman ρ, share gap, top pick), the same on correctly read trials only, a conditional logit with product and page-position effects, and all models side by side. Exports: CSV, SPSS syntax, Excel, PDF report.

Unclear answers are asked again once, then recorded as missing (never defaulted to an option).

## Running it

1. Download `index.html` (green **Code** button → **Download ZIP**, or open the file and click **Download raw file**). Open it in Chrome.
2. **Page 1:** load **Study 3 (e-readers, OpenAI + Claude + Gemini, built in)**.
3. **Page 4:** paste your OpenAI, Anthropic and Google API keys. The 9 starting models are listed; change them any time with **Browse model list**. An OpenRouter key also works for any model on OpenRouter.
4. **Page 6:**
   - **Validation check** first: one product is best on every attribute, so each model should pick it every time.
   - **Start** at **Pilot** size, check the cost line, then switch to **Full** and press **Start** again (it carries on from the pilot).
   - Set a **spend cap**: the run pauses when it is reached.
5. **Results → Analyse.**

To try it with no keys and no cost, press **Add 3 simulated models** on page 4.

### Study 3 starting lineup (editable)

| Provider | Models |
|---|---|
| OpenAI | GPT-4o (2024-11-20), GPT-4o mini, GPT-6 Luna |
| Anthropic | Claude Haiku 5.5, Claude Haiku 4.5, Claude Sonnet 5.5 |
| Google | Gemini 2.5 Flash-Lite, Gemini 3.1 Flash-Lite, Gemini 3.5 Flash-Lite |

## Checks that it works

- **Study 2 parity:** the conjoint analysis reproduces the published Study 2 SPSS coefficients to 5 decimals for GPT-4o, Gemini and Claude.
- **Parameter recovery:** `tests/sim_recovery.py` runs the full Study 3 pipeline on simulated models whose true preferences are known and prints true vs estimated weights. Requires Python with `playwright` and Chrome or Chromium:

  ```
  pip install playwright
  python tests/sim_recovery.py
  ```

## Files

| Path | What |
|---|---|
| `index.html` | The Lab. Built from v3 by `tools/patch_v5.py`; do not edit by hand. |
| `tools/` | `patch_v5.py` + `v5_additions.js`: everything v5 adds to v3. Rebuild with `python tools/patch_v5.py index.html` |
| `tests/` | Simulated end-to-end and parameter-recovery check |
| `versions/` | v3 as recovered (18 Nov 2026) and the v4 rebuild, for reference |
| `CHANGELOG.md` | What changed in each version |
