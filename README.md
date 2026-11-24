# LLM Conjoint Lab

A browser tool that runs one consumer-choice study on many AI models at once and checks whether each model's stated trade-offs predict what it does when it shops.

For every model, with the same fixed design:

1. **Conjoint**: paired product comparisons (optionally counterbalanced, so each pair is asked in both orders). A binary logistic regression on Product 1 − Product 2 recovers attribute weights. The constant is the first-position bias.
2. **Ranking (Rotman bot)**: the model ranks all storefront products, several times in shuffled order. Its mean rank is compared with the ranking its conjoint predicts.
3. **Locked prediction**: before any storefront trial, the conjoint utilities give predicted choice shares for the storefront products. These are saved with a timestamp and a SHA-256 hash.
4. **Storefront**: ACES-style page of products (screenshot for vision models, text otherwise). The model buys one product with an `add_to_cart` tool and reads back every attribute of its choice, so misreadings can be counted.

The tool then compares models: coefficients, relative importance, prediction accuracy, position effects, misread rates, and random-effects pooling of each coefficient across models (with I²).

## Running it

1. Download `index.html` and open it in Chrome. Nothing to install.
2. **Keys & models**: paste an OpenRouter key (one key reaches all providers), click **Fetch OpenRouter list**, and pick model IDs. Keys stay in the browser and are never written to exports.
3. **Run**: start with **Pilot** size and the **validation check** (one product dominant, so picks should be 100% that product), then switch to **Full**. A full run carries on from the pilot, because it uses the same fixed design.
4. **Export**: raw answers, design, coefficients, locked predictions, comparison table, SPSS syntax and a project file.

Use **Add 3 simulated models** to test the whole pipeline without API calls.

## Repository layout

| Path | What |
|---|---|
| `index.html` | The built tool (single file). Do not edit by hand. |
| `src/core.js` | Design, prompts, parsing, statistics, exports (no browser code) |
| `src/app.js` | Interface, runner, API adapters (OpenRouter, OpenAI, Anthropic, Google, simulated) |
| `src/shell.html` | Page layout and styles |
| `studies/` | Study files (`study3_ereaders.json` is built in as the default) |
| `tests/` | Checks of the statistics against statsmodels |
| `build.py` | Builds `index.html` from `src/` and the default study |

After changing anything in `src/` or `studies/`, run `python3 build.py`.

## Verification

- The conjoint regression matches statsmodels `Logit` to machine precision (`tests/check_logit.py`).
- The storefront conditional logit matches statsmodels `ConditionalLogit` to about 3 decimals on the 27 Oct 2026 e-reader run (`tests/check_clogit.py`).
