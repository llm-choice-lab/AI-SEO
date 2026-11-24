# Changelog

## v5.0 — 24 Nov 2026

v3 (recovered from the 18 Nov chat) is the base again; v5 adds:

- **ACES storefront through a Selenium helper** (`aces_helper.py`), copying the v6 notebook: ACES page template and stylesheet, search typed into the box, 1280 × 1080 screenshot, ACES prompts, `add_to_cart` with full read-back, Add to Cart clicked and checked, Latin-square positions, temperature 1.0, image detail high.
- **Order per model:** conjoint and ranking, then the prediction is locked (timestamp + SHA-256), then the storefront.
- **Study 3 preset:** the 10 e-readers from the v5/v6 storefront Sheet. The conjoint uses the same attributes and wording as the cards; Resolution is shown linked to Screen type, as on real products. 500 pairs, each asked both ways (1,000 calls per model), 20 rankings, 1,000 storefront trials.
- **9 starting models** on OpenRouter, editable any time.
- **Pilot / Full** run sizes on the same fixed design; **validation check** (one dominant product); **spend cap** that pauses the run; **reasoning effort** setting.
- **Results:** locked prediction vs storefront shares, read-correctly shares, misread fields, cart clicks, conditional logit (product + position).
- Separate browser storage from v3.

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
