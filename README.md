# LLM Conjoint Lab (v5)

Runs one consumer-choice study on many AI models at once and checks whether each model's conjoint predicts what it buys in an ACES-style storefront.

For every model, with the same fixed design:

1. **Conjoint** (Study 2 method and wording): paired product comparisons, each pair asked in both orders. Binary logistic regression on Product 1 − Product 2; the constant is the first-position bias.
2. **Ranking (Rotman bot)**: the model ranks all storefront products several times.
3. **Locked prediction**: the conjoint utilities give a predicted share for each storefront product, saved with a timestamp and SHA-256 hash before any storefront trial.
4. **ACES storefront** (the v6 notebook procedure): Selenium opens the store's search page in headless Chrome, types the query, presses Enter, screenshots the 1280 × 1080 results page, and sends it with the ACES system and user prompts and the `add_to_cart` tool (temperature 1.0, image detail high). The model also reads back every attribute of the product it buys, so misreadings are counted. Selenium then clicks that product's Add to Cart button and checks the cart. Positions are balanced with random Latin squares.
5. **Results**: locked prediction vs storefront shares (Spearman ρ, share gap, top pick), the same on correctly read trials, conditional logit with product and position effects (ACES Eq. 5.1), and all models side by side.

## Running it (Windows)

1. Install [Python](https://www.python.org/downloads/) (tick "Add Python to PATH") and Google Chrome.
2. Download this folder and double-click **START_LAB.bat**. It installs Selenium if needed, starts the storefront helper and opens the Lab at http://127.0.0.1:8765.
3. Page 1: load **Study 3 (e-readers, ACES storefront, built in)**. Page 4: paste your OpenRouter key; the 9 starting models are already listed (change them any time with **Browse models**).
4. Page 6: **Validation check** first, then **Start** at **Pilot** size, check the cost per call, then switch to **Full**.

The helper only drives Chrome. API keys stay in the browser and go straight to the providers.

## Files

| Path | What |
|---|---|
| `index.html` | The Lab (v5). Built from v3 by `tools/patch_v5.py`; do not edit by hand. |
| `aces_helper.py`, `aces_style.css` | Storefront helper (Selenium) and the ACES stylesheet (MIT licence, commit 6c561d8) |
| `START_LAB.bat` | Windows starter |
| `tools/` | `patch_v5.py` + `v5_additions.js`: everything v5 adds to v3 |
| `versions/` | v3 as recovered (18 Nov 2026) and the v4 rebuild, for reference |

To rebuild after editing `tools/v5_additions.js`: `python tools/patch_v5.py index.html`.
