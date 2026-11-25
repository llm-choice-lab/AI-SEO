# Changelog

## v5.2 — 26 Nov 2026

- **▶ Launch study** (Run page and header): one click runs a 1-call check per model (models that fail are skipped for that launch and listed), the validation check, the pilot, a cost check projected from the pilot (with an option to skip asking when the full run fits under the spend cap), the full run and the analysis. Press it again after a stop to carry on.
- Hosted on GitHub Pages: https://llm-choice-lab.github.io/ai-seo/

- **Guided tour**: opens on first visit and walks through the 8 pages, highlighting the real controls; **? Tour** in the header replays it.
- **One-click demo**: **▶ Demo** runs Study 3 on 3 simulated models (validation check, pilot, analysis) in a few seconds with no keys or cost; a banner marks demo results, and **Exit demo** restores the project you had open.

## v5.1 — 25 Nov 2026

- Study 3 lineup moved from OpenRouter to direct OpenAI, Anthropic and Google keys: GPT-4o (2024-11-20), GPT-4o mini, GPT-6 Luna; Claude Haiku 5.5, Haiku 4.5, Sonnet 5.5; Gemini 2.5, 3.1 and 3.5 Flash-Lite.
- Spend is counted from token use and list prices for direct API calls; the cost line projects the cost of a full run from the calls so far.
- Reasoning effort is sent to OpenAI GPT-5/GPT-6/o-series models as well as OpenRouter models.
- If the conjoint can't be fitted yet (too few or one-sided answers), the storefront still runs and the log warns that no prediction was locked.
- Pilot size raised to 30 pairs.

## v5.1 docs and tests — 26 Nov 2026

- README rewritten for direct keys and for people downloading the tool.
- `tests/sim_recovery.py`: full Study 3 run on simulated models with known preferences; all 36 weights recovered within 3 SE, locked prediction vs storefront ρ = .92–.98.

## v5.0 — 24 Nov 2026

v3 (recovered from the 18 Nov chat) is the base again, and it stays a single HTML file with v3's own storefront. v5 adds:

- **Order per model:** conjoint and ranking, then the prediction is locked (timestamp + SHA-256), then the storefront.
- **Study 3 preset:** the 10 e-readers from the v5/v6 storefront Sheet. The conjoint uses the same attributes and wording as the cards; Resolution is shown linked to Screen type, as on real products. 500 pairs, each asked both ways (1,000 calls per model), 20 rankings, 1,000 storefront trials.
- **9 starting models** on OpenRouter, editable any time.
- **Pilot / Full** run sizes on the same fixed design; **validation check** (one dominant product); **spend cap** that pauses the run; **reasoning effort** setting.
- **Storefront cards** sized to their longest line (v3's fixed 290 px let long values run into the next card).
- **Results:** locked prediction vs storefront shares, shares on correctly read trials, misread fields, conditional logit (product + page position).
- Separate browser storage from v3.
- A Selenium helper that copied the v6 ACES procedure was built and tested, then dropped as too much setup; it is in this commit's history.

## v4.0 — 24 Nov 2026

Rebuilt from the v2/v3 design notes (the v3 HTML file was not saved locally). First version under version control.

- Runs many models at once (default slots: 3 providers × 3 tiers) through OpenRouter, or OpenAI, Anthropic and Google keys directly; simulated models for testing.
- Study 3 preset: 10 e-readers, 9 conjoint attributes (price, battery life, weight, storage, screen size, screen colour, water resistance, page buttons, stylus).
- Conjoint with counterbalancing; unclear answers re-asked once, then recorded as missing.
- Ranking (Rotman bot) task with shuffled order.
- Conjoint prediction locked (timestamp + SHA-256) before the storefront runs.
- Storefront: screenshot or text mode, `add_to_cart` tool with read-back of every attribute (v6 method), re-ask once.
- Extreme-condition validation check.
- Pilot / full sizes on the same fixed design.
- Results: logistic regression, relative importance, predicted vs ranking vs storefront, conditional logit with product, row and column effects.
- Compare models: side-by-side table, random-effects pooling with I².
- Exports: CSVs, SPSS syntax, project and study files. Autosave in the browser.

Not yet carried over from v3: Excel/PDF report export, finding products online from a link, Study 2 legacy import with its exact prompt wording (needs the Study 2 files).
