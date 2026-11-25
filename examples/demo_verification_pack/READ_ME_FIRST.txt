LLM Conjoint Lab verification pack
Generated 2026-11-25T23:31:10.833Z for "Study 3 – e-readers (conjoint → ACES storefront)".

Everything here lets you recompute the tool's results without the tool:
  data/conjoint_long.csv        every valid conjoint answer: ChoseFirst (1/0) and Product1 - Product2 differences (d_ columns)
  data/products.csv             the storefront products, coded the same way (x_ columns = the d_ columns before differencing)
  data/storefront_trials.csv    every storefront trial: page order, choice, position, time
  data/storefront_long.csv      one row per product shown per valid trial (ready for conditional logit)
  data/locks.csv + locks/*.json the locked conjoint predictions and their SHA-256 fingerprints
  data/lock_history.csv         every lock made (a pilot locks first; the full run re-locks with all answers)
  tool_results/*.csv            the tool's own numbers at full precision, to compare against
  scripts/verify.py             Python: runs checks A, B and C and prints PASS or CHECK for each
  scripts/verify.R              R: the same checks
  scripts/verify.sps            SPSS: checks A and C (SPSS can't compute SHA-256)
  manifest.json                 study settings, models and the column codebook

Quickest check:  python scripts/verify.py      (needs: pip install pandas numpy scipy statsmodels)
             or  Rscript scripts/verify.R      (needs: install.packages(c("survival","jsonlite","digest")))
Full step-by-step guide: VALIDATION.md in the GitHub repository.
