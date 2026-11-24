# LLM Conjoint Lab (v5)

Runs one consumer-choice study on many AI models at once and checks whether each model's conjoint predicts what it buys on a shop page. One HTML file: open it in Chrome, paste an OpenRouter key, run.

For every model, with the same fixed design:

1. **Conjoint** (Study 2 method and wording): paired product comparisons, each pair asked in both orders. Binary logistic regression on Product 1 − Product 2; the constant is the first-position bias.
2. **Ranking (Rotman bot)**: the model ranks all storefront products several times.
3. **Locked prediction**: the conjoint utilities give a predicted share for each storefront product, saved with a timestamp and SHA-256 hash before any storefront trial.
4. **Storefront** (v3 method): the page draws a shop page of the products in a new shuffled order each trial and sends it as a screenshot. The model picks one product and copies back every card, so misreadings are counted.
5. **Results**: locked prediction vs storefront shares (Spearman ρ, share gap, top pick), the same on correctly read trials, a conditional logit with product and page-position effects, and all models side by side.

## Running it

1. Download `index.html` and open it in Chrome.
2. Page 1: load **Study 3 (e-readers, built in)**. Page 4: paste your OpenRouter key; the 9 starting models are listed (change them any time with **Browse models**). Set the spend cap.
3. Page 6: **Validation check** first, then **Start** at **Pilot** size, check the cost, then switch to **Full** and press Start again (it carries on from the pilot).

## Files

| Path | What |
|---|---|
| `index.html` | The Lab (v5). Built from v3 by `tools/patch_v5.py`; do not edit by hand. |
| `tools/` | `patch_v5.py` + `v5_additions.js`: everything v5 adds to v3 |
| `versions/` | v3 as recovered (18 Nov 2026) and the v4 rebuild, for reference |

To rebuild after editing `tools/v5_additions.js`: `python tools/patch_v5.py index.html`.
