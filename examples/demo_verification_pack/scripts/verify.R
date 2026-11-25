# LLM Conjoint Lab: independent verification (R).
# Recomputes the tool's results from the raw data in a verification pack and prints PASS or CHECK for each check.
#   Check A  conjoint: glm(ChoseFirst ~ d_ differences, binomial) per run
#   Check B  locked prediction: SHA-256 of each locks/*.json, its coefficients vs Check A, predicted shares re-computed
#   Check C  conjoint vs storefront: observed shares, Spearman rho, mean share gap, top pick,
#            and the position model survival::clogit(Chosen ~ product + row + column + strata(Trial))
# Usage:  install.packages(c("survival", "jsonlite", "digest"))
#         Rscript scripts/verify.R [path/to/verification_pack]

suppressPackageStartupMessages({ library(survival); library(jsonlite); library(digest) })
TOL_COEF <- 1e-4; TOL_SHARE <- 1e-6; TOL_RHO <- 1e-6; TOL_CLOGIT <- 1e-3

args <- commandArgs(trailingOnly = TRUE)
if (length(args)) pack <- args[1] else {
  f <- sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE))
  pack <- if (length(f)) normalizePath(file.path(dirname(f), "..")) else getwd() }
rd <- function(p) { fp <- file.path(pack, p); if (!file.exists(fp) || file.size(fp) < 6) return(data.frame())
  read.csv(fp, fileEncoding = "UTF-8-BOM", stringsAsFactors = FALSE, check.names = FALSE, na.strings = "") }
lines <- character(); npass <- 0; ncheck <- 0
out <- function(...) { s <- paste0(...); cat(s, "\n"); lines <<- c(lines, s) }
verdict <- function(ok, what, detail = "") { ok <- isTRUE(ok); if (ok) npass <<- npass + 1 else ncheck <<- ncheck + 1
  out("  [", if (ok) "PASS" else "CHECK", "] ", what, if (nchar(detail)) paste0("  (", detail, ")") else "") }

manifest <- fromJSON(file.path(pack, "manifest.json"))
conj <- rd("data/conjoint_long.csv"); prods <- rd("data/products.csv"); coefs_tool <- rd("tool_results/coefficients.csv")
locks <- rd("data/locks.csv"); hist <- rd("data/lock_history.csv"); trials <- rd("data/storefront_trials.csv"); long <- rd("data/storefront_long.csv")
comp <- rd("tool_results/storefront_comparison.csv"); summ <- rd("tool_results/summary.csv"); clog_tool <- rd("tool_results/storefront_clogit.csv")
dvars <- manifest$features$difference; xvars <- manifest$features$product
products <- as.character(prods$Product); ncols <- as.integer(manifest$storefrontColumns)

out("LLM Conjoint Lab verification (R) · pack generated ", manifest$generated, " · ", manifest$project)
out(R.version.string, ", survival ", as.character(packageVersion("survival")))

for (i in seq_len(nrow(manifest$runs))) {
  run <- manifest$runs[i, ]; rid <- run$RunID; out(""); out("=== ", run$label, "  (", run$provider, " · ", run$model, ") ===")
  d <- conj[conj$RunID == rid, ]; own <- NULL
  # ---------------- Check A ----------------
  if (nrow(d)) {
    fit <- glm(reformulate(dvars, "ChoseFirst"), family = binomial, data = d, control = glm.control(epsilon = 1e-14, maxit = 100))
    own <- data.frame(Variable = c("Constant", dvars), B = unname(coef(fit)), SE = unname(sqrt(diag(vcov(fit)))))
    t <- merge(coefs_tool[coefs_tool$RunID == rid, ], own, by = "Variable", suffixes = c("_tool", "_own"))
    db <- max(abs(t$B_tool - t$B_own)); ds <- max(abs(t$SE_tool - t$SE_own))
    out(sprintf("  Check A · conjoint, %d answers. Largest difference: B %.2e, SE %.2e", nrow(d), db, ds))
    for (k in seq_len(nrow(t))) out(sprintf("      %-38s tool %12.6f  own %12.6f", substr(t$Variable[k], 1, 38), t$B_tool[k], t$B_own[k]))
    verdict(nrow(t) == nrow(own) && db < TOL_COEF && ds < TOL_COEF, "A: coefficients and SEs match the tool")
  } else out("  Check A · no conjoint answers for this run (skipped)")
  # ---------------- Check B ----------------
  L <- if (nrow(locks)) locks[locks$RunID == rid, ] else locks; pred <- NULL
  if (nrow(L)) {
    L <- L[1, ]; raw <- readBin(file.path(pack, L$PayloadFile), "raw", file.size(file.path(pack, L$PayloadFile)))
    verdict(digest(raw, algo = "sha256", serialize = FALSE) == L$SHA256, "B1: the lock file is unchanged (SHA-256 matches)",
            paste0("locked ", L$LockedAt, " from ", L$Answers, " answers"))
    payload <- fromJSON(rawToChar(raw), simplifyVector = FALSE)
    B <- setNames(sapply(payload$coefs, function(x) as.numeric(x[[2]])), c("Constant", dvars))
    if (!is.null(own) && as.integer(L$Answers) == nrow(d)) {
      gap <- max(abs(B[own$Variable] - own$B)); verdict(gap < TOL_COEF, "B2: locked coefficients equal your own re-fit of all conjoint answers", sprintf("largest gap %.2e", gap))
    } else if (!is.null(own)) out("  [NOTE] B2: the lock used ", L$Answers, " answers and the data now has ", nrow(d), " (e.g. locked after a pilot), so B2 is skipped")
    U <- as.matrix(prods[, xvars]) %*% B[dvars]; pred <- as.vector(exp(U - max(U)) / sum(exp(U - max(U))))
    saved <- sapply(payload$predicted, function(p) p$share)
    verdict(max(abs(pred - saved)) < TOL_SHARE, "B3: predicted shares re-computed from the locked coefficients match the lock file", sprintf("largest gap %.2e", max(abs(pred - saved))))
    if (nrow(trials) && nrow(hist)) { tt <- trials[trials$RunID == rid & !is.na(trials$At), ]; fl <- min(hist$LockedAt[hist$RunID == rid])
      if (nrow(tt)) verdict(min(tt$At) >= fl, "B4: a prediction was locked before the first storefront trial", paste0("first lock ", fl, ", first trial ", min(tt$At))) }
  } else out("  Check B · no locked prediction for this run (skipped)")
  # ---------------- Check C ----------------
  Tr <- if (nrow(trials)) trials[trials$RunID == rid, ] else trials
  if (nrow(Tr) && !is.null(pred)) {
    v <- Tr[!is.na(Tr$Choice) & Tr$Choice != "", ]
    obs <- sapply(products, function(p) mean(as.character(v$Choice) == p))
    cc <- comp[comp$RunID == rid, ]; cc <- cc[match(products, as.character(cc$Product)), ]
    verdict(max(abs(obs - cc$ObservedShare)) < TOL_SHARE, sprintf("C1: observed storefront shares (%d valid trials) match the tool", nrow(v)))
    rho <- cor(pred, obs, method = "spearman"); mae <- mean(abs(pred - obs)); s <- summ[summ$RunID == rid, ][1, ]
    tp <- products[which.max(pred)]; to <- products[which.max(obs)]
    out(sprintf("  Locked prediction vs storefront: rho %.4f, mean share gap %.4f, top predicted %s, top observed %s", rho, mae, tp, to))
    verdict(abs(rho - s$Rho_LockedPrediction_vs_Storefront) < TOL_RHO && abs(mae - s$MeanAbsShareGap) < TOL_SHARE &&
            tp == as.character(s$TopPredicted) && to == as.character(s$TopObserved), "C2: rho, share gap and top picks match the tool")
    g <- long[long$RunID == rid, ]; g$Product <- as.character(g$Product); nrows <- max(g$PageRow)
    ever <- unique(g$Product[g$Chosen == 1]); keep <- products[products %in% ever]; g <- g[g$Product %in% ever, ]
    if (length(keep) >= 2 && length(unique(g$Trial)) >= 10) {
      g$Product <- factor(g$Product, levels = keep)
      g$Row <- relevel(factor(g$PageRow), ref = as.character(nrows)); g$Col <- relevel(factor(g$PageCol), ref = as.character(ncols))
      cl <- clogit(Chosen ~ Product + Row + Col + strata(Trial), data = g, method = "exact")
      b <- coef(cl); names(b) <- sub("^Product", "fe_", sub("^Row", "row_", sub("^Col", "col_", names(b))))
      ct <- clog_tool[clog_tool$RunID == rid, ]; both <- intersect(names(b), ct$Term); b <- b[!is.na(b)]
      gap <- if (length(both)) max(abs(b[both] - ct$B[match(both, ct$Term)])) else Inf
      for (k in both) out(sprintf("      %-20s tool %10.4f  own %10.4f", k, ct$B[ct$Term == k], b[k]))
      verdict(length(both) == length(b) && gap < TOL_CLOGIT, "C3: position model (conditional logit) matches the tool", sprintf("largest gap %.2e", gap))
    } else out("  [NOTE] C3: too few trials or only one product ever chosen; no position model")
  } else out("  Check C · no storefront trials or no locked prediction for this run (skipped)")
}
out(""); out(sprintf("SUMMARY: %d PASS, %d CHECK", npass, ncheck))
writeLines(lines, file.path(pack, "verify_report_R.txt"), useBytes = TRUE)
cat("Report written to", file.path(pack, "verify_report_R.txt"), "\n")
quit(status = if (ncheck) 1 else 0)
