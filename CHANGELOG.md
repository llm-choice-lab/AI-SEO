# Changelog

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
