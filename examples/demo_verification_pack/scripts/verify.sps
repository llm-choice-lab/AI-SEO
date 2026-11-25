* Encoding: UTF-8.
* LLM Conjoint Lab verification syntax (SPSS). Generated 2026-11-25T23:31:10.878Z.
* 1. Unzip the verification pack.  2. On the CD line below, put the folder where you unzipped it.  3. Run All.
* Check A: conjoint coefficients.  Check C: storefront shares, rank correlation and position model.
* Check B (the SHA-256 fingerprint) needs R or Python: SPSS cannot compute SHA-256.

CD 'C:\Users\you\Downloads\verification_pack'.

* ===================== CHECK A: conjoint (one logistic regression per run) =====================.
GET DATA /TYPE=TXT /FILE='data/conjoint_long.csv' /ENCODING='UTF8' /DELIMITERS="," /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /VARIABLES=
  Run A200 RunID A100 Model A200 Pair F8.0 Order A4 ChoseFirst F8.0
  d_Screen_size F20.10
  d_Screen_type_E_Ink_Carta_1200 F20.10
  d_Screen_type_Color_E_Ink F20.10
  d_Storage F20.10
  d_Water_resistance_Waterproof_IPX7 F20.10
  d_Water_resistance_Waterproof_IPX8 F20.10
  d_Battery_life F20.10
  d_Weight F20.10
  d_Page_buttons_Yes F20.10
  d_Stylus_support_Yes F20.10
  d_Price F20.10
  Screen_size_P1 A200 Screen_size_P2 A200
  Screen_type_P1 A200 Screen_type_P2 A200
  Storage_P1 A200 Storage_P2 A200
  Water_resistance_P1 A200 Water_resistance_P2 A200
  Battery_life_P1 A200 Battery_life_P2 A200
  Weight_P1 A200 Weight_P2 A200
  Page_buttons_P1 A200 Page_buttons_P2 A200
  Stylus_support_P1 A200 Stylus_support_P2 A200
  Price_P1 A200 Price_P2 A200.
SORT CASES BY RunID.
SPLIT FILE SEPARATE BY RunID.
LOGISTIC REGRESSION VARIABLES ChoseFirst WITH d_Screen_size d_Screen_type_E_Ink_Carta_1200 d_Screen_type_Color_E_Ink d_Storage d_Water_resistance_Waterproof_IPX7 d_Water_resistance_Waterproof_IPX8 d_Battery_life d_Weight d_Page_buttons_Yes d_Stylus_support_Yes d_Price
  /CRITERIA=ITERATE(50) CUT(.5).
SPLIT FILE OFF.
* Compare "Variables in the Equation" (B, S.E.) with tool_results/coefficients.csv. They should match to 4 decimals.

* ===================== CHECK C: storefront =====================.
* C1. Observed share of each product among valid storefront trials.
GET DATA /TYPE=TXT /FILE='data/storefront_long.csv' /ENCODING='UTF8' /DELIMITERS="," /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /VARIABLES=
  RunID A100 Trial F8.0 Product A100 Position F4.0 PageRow F4.0 PageCol F4.0 Chosen F8.0.
DATASET NAME sf.
SORT CASES BY RunID Product.
SPLIT FILE SEPARATE BY RunID.
MEANS TABLES=Chosen BY Product /CELLS=SUM COUNT.
SPLIT FILE OFF.
* Observed share = Sum of Chosen / number of valid trials. Compare with ObservedShare in tool_results/storefront_comparison.csv.

* C2. Rank correlation between the locked prediction and the observed shares (tool's own numbers, to check its rho).
GET DATA /TYPE=TXT /FILE='tool_results/storefront_comparison.csv' /ENCODING='UTF8' /DELIMITERS="," /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /VARIABLES=
  RunID A100 Product A100 LockedPredictedShare F20.12 ObservedShare F20.12.
* Spearman's rho = Pearson correlation of the ranks (ties get their average rank).
SORT CASES BY RunID.
RANK VARIABLES=LockedPredictedShare ObservedShare BY RunID /RANK INTO rPred rObs /TIES=MEAN /PRINT=NO.
SPLIT FILE SEPARATE BY RunID.
CORRELATIONS /VARIABLES=rPred rObs.
SPLIT FILE OFF.
* Compare the correlation with Rho_LockedPrediction_vs_Storefront in tool_results/summary.csv.
* SPSS shows 3 decimals by default: double-click a table, then a cell, to see more.

* C3. Position model: conditional logit (product + page row + page column), fitted as a stratified Cox model.
* With one chosen product per trial, Cox partial likelihood = conditional logit. Products never chosen by a run are dropped (as in ACES).
DATASET ACTIVATE sf.
SORT CASES BY RunID Product.
AGGREGATE /OUTFILE=* MODE=ADDVARIABLES /BREAK=RunID Product /EverChosen=MAX(Chosen).
SELECT IF EverChosen = 1.
COMPUTE CoxTime = 2 - Chosen.
SORT CASES BY RunID.
SPLIT FILE SEPARATE BY RunID.
COXREG VARIABLES=CoxTime WITH Product PageRow PageCol
  /STATUS=Chosen(1) /STRATA=Trial
  /CATEGORICAL=Product PageRow PageCol
  /CONTRAST (Product)=Indicator(1) /CONTRAST (PageRow)=Indicator /CONTRAST (PageCol)=Indicator
  /METHOD=ENTER Product PageRow PageCol.
SPLIT FILE OFF.
* Reference categories: Product = first product (alphabetical in SPSS; the tool uses the first product in the product list, so check that both use the same one),
* PageRow = last (bottom) row, PageCol = last column. Compare B and SE with tool_results/storefront_clogit.csv.
