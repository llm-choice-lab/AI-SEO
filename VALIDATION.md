# Checking the LLM Conjoint Lab's results yourself

The Lab runs the whole study and analyses it in your browser. You don't have to take its numbers on trust: every result can be recomputed from the raw data with SPSS, R or Python, without the Lab and without any AI. This guide shows how.

It takes about 10 minutes the first time.

## What gets checked

| Check | Question it answers | How |
|---|---|---|
| **A · Conjoint** | Are the attribute weights right? | Re-fit the binary logistic regression (ChoseFirst on the Product 1 − Product 2 differences, with a constant) for each model. Same method as Study 2 in SPSS. |
| **B · Locked prediction** | Was the prediction made from the conjoint alone, before the storefront, and never changed? | The SHA-256 fingerprint of each saved prediction file, its coefficients against your own re-fit, and its predicted shares recomputed by hand. |
| **C · Conjoint vs storefront** | Does the conjoint predict what each model buys? | Each product's share of storefront picks, Spearman's ρ and the mean share gap against the locked prediction, the top pick, and the position model (conditional logit). |

## Before you start

You need a finished run (or the demo), analysed:

1. Run a study with **▶ Launch study** (or press **▶ Demo** to try this with simulated models).
2. On page 7, press **Analyse**.
3. On page 9 (**Verify**), press **⬇ Download verification pack**, then unzip it.

No study of your own yet? Use the worked example in [`examples/demo_verification_pack`](examples/demo_verification_pack). It's a finished run on 3 simulated models, with the reports you should get.

## What's in the pack

```
verification_pack/
  READ_ME_FIRST.txt
  manifest.json                 study settings, models and a codebook for every column
  data/
    conjoint_long.csv           one row per valid conjoint answer: ChoseFirst (1/0) and the d_ differences
    products.csv                the storefront products, coded the same way (x_ columns)
    storefront_trials.csv       every storefront trial: page order, choice, position, time
    storefront_long.csv         one row per product shown in each valid trial (for the conditional logit)
    locks.csv                   the final locked prediction for each model, with its SHA-256 fingerprint
    lock_history.csv            every lock made (the pilot locks first; the full run re-locks with all answers)
  locks/<model>.json            the exact prediction files that were fingerprinted
  tool_results/                 the Lab's own numbers at full precision, to compare against
    coefficients.csv  summary.csv  storefront_comparison.csv  storefront_clogit.csv
  scripts/
    verify.py   verify.R   verify.sps
```

**How the data are coded.** Each attribute becomes one or more columns:
- a number attribute (price, battery weeks, grams) is one column holding the value;
- a category attribute (screen type, waterproof rating) gets one 0/1 column per level, except the first level, which is the reference.

In `conjoint_long.csv` the columns start with `d_` and hold Product 1 minus Product 2. In `products.csv` they start with `x_` and hold each product's own values. `manifest.json` lists every column and its attribute and level.

## Option 1 · Python (all checks, about 2 minutes)

1. Install Python 3, then in a terminal: `pip install pandas numpy scipy statsmodels`
2. Go into the unzipped folder: `cd verification_pack`
3. Run: `python scripts/verify.py`

It prints every coefficient side by side (the Lab's and your own), then a line per check:

```
=== Simulated A  (sim · sim-11) ===
  Check A · conjoint, 1000 answers. Largest difference: B 4.44e-16, SE 2.50e-16
  [PASS] A: coefficients and SEs match the tool
  [PASS] B1: the lock file is unchanged (SHA-256 matches)
  [PASS] B2: locked coefficients equal your own re-fit of all conjoint answers
  [PASS] B3: predicted shares re-computed from the locked coefficients match the lock file
  [PASS] B4: a prediction was locked before the first storefront trial
  [PASS] C1: observed storefront shares (300 valid trials) match the tool
  [PASS] C2: rho, share gap and top picks match the tool
  [PASS] C3: position model (conditional logit) matches the tool
...
SUMMARY: 24 PASS, 0 CHECK
```

The same text is saved as `verify_report_python.txt` in the pack folder.

## Option 2 · R (all checks)

1. In R: `install.packages(c("survival", "jsonlite", "digest"))`
2. In a terminal, from the unzipped folder: `Rscript scripts/verify.R`. Or in RStudio, set the working directory to the folder and `source("scripts/verify.R")`.

It prints the same checks and saves `verify_report_R.txt`. It fits the conjoint with `glm(..., family = binomial)` and the position model with `survival::clogit`.

## Option 3 · SPSS (checks A and C)

SPSS can't compute SHA-256 fingerprints, so use Python or R for check B.

1. Open `scripts/verify.sps` in SPSS.
2. On the `CD` line near the top, replace the example folder with the folder where you unzipped the pack, e.g. `CD 'C:\Users\sam\Downloads\verification_pack'.`
3. **Run → All.**
4. Compare the output with the files in `tool_results/`:

| SPSS output | Compare with | Should match |
|---|---|---|
| **Check A:** *Variables in the Equation*, one table per model (split by RunID): B and S.E. | `tool_results/coefficients.csv`, columns `B` and `SE` | 4 decimals |
| **Check C1:** *Report* (Sum of Chosen by Product). Share = Sum ÷ number of valid trials | `tool_results/storefront_comparison.csv`, column `ObservedShare` | exactly |
| **Check C2:** *Correlations* of the two RANK variables (this is Spearman's ρ) | `tool_results/summary.csv`, column `Rho_LockedPrediction_vs_Storefront` | 3 decimals as shown |
| **Check C3:** COXREG *Variables in the Equation*: B and SE for Product, PageRow, PageCol | `tool_results/storefront_clogit.csv` | 3 decimals |

SPSS shows 3 decimals by default. To see more, double-click the table, then double-click a cell.

In C3, SPSS takes the first product in alphabetical order as the reference, and the Lab takes the first product in the product list that was ever chosen. They're the same whenever that product was chosen at least once. Otherwise every product coefficient shifts by the same constant, while the row and column coefficients still match.

## What the checks prove, and what they don't

- **A** proves the Lab's regression is the standard binary logit, fitted correctly on the answers it recorded.
- **B1** proves each prediction file is byte-for-byte the one fingerprinted when it was locked. **B2** proves the locked weights come from the conjoint answers alone. **B3** proves the predicted shares follow from those weights (share = e^U ÷ Σ e^U, where U is the sum of coefficient × product value; the constant is left out because it is the same for every product). **B4** shows the first lock happened before the first storefront trial.
- The lock time and fingerprint are recorded by the Lab itself. For proof that holds up independently, for example for a preregistered study, post the fingerprint somewhere dated before the storefront runs: an OSF registration, or an email to your co-authors. To do that, switch off the storefront module on page 3 and launch: the conjoint runs and its prediction is locked. Copy the fingerprint from the run log (the line reads "prediction locked from N answers · sha256 …"), post it, then switch the storefront back on and launch again.
- **C** proves the comparison between the conjoint and the storefront is computed correctly from the recorded choices.
- None of the checks can show that a model *understood* the products as you intended. That's what the **validation check** is for: before each run, one product is made best on every attribute, so a model that reads the page should pick it every time. The read-back count, the number of storefront cards a model copied back wrongly, also shows how often it misread the page.

## If a check says CHECK

1. Open the report. It lists every number side by side and says by how much they differ.
2. Differences in the 5th decimal or beyond are rounding between programs. Anything larger is real: don't use those results until it's explained.
3. A typical cause: the pack was downloaded before **Analyse** was pressed again after new answers came in. Press **Analyse**, download a fresh pack and run the check again.
4. Still CHECK? Open an issue on the GitHub repository and attach the report (it holds no API keys).

## Testing the whole pipeline (parameter recovery)

The checks above show the analysis is computed correctly. `tests/sim_recovery.py` in the repository goes one step further. It runs the full study on simulated models whose true preferences are set in advance, and confirms the Lab recovers them: all 36 weights within 3 standard errors of the truth, and the locked prediction matching storefront choices at ρ = .92–.98. Run it with `pip install playwright`, then `python tests/sim_recovery.py`.

## Where these checks were run

When this version was released, the checks were run on the worked example and on fresh runs:

- **Python** (statsmodels 0.15) and **R** 4.3 (survival): 24 of 24 PASS. Differences were below 10⁻⁹.
- **PSPP** 2.0, the free SPSS clone: the SPSS syntax for checks A, C1 and C2 reproduced the Lab's numbers. PSPP has no COXREG, so the C3 syntax was not run there.
- **Tamper test:** the checks were also run on packs that had been deliberately changed. A changed prediction file, five flipped conjoint answers and one changed storefront choice were each caught (CHECK).

The checks also caught one real problem. The Lab's position model failed to converge when a product was chosen only once. This is now fixed with step-halving, and it agrees with R's `clogit` to 10⁻⁹.
