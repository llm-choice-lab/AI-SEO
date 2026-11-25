// ================= VERIFY: outside-the-tool checks =================
// Page 9 "Verify" + "Download verification pack" (a .zip): raw data, the locked prediction files, the tool's own results
// at full precision, and SPSS / R / Python scripts that recompute everything from the raw data.
// VERIFY_PY and VERIFY_R are filled in by tools/patch_v5.py from verify/verify.py and verify/verify.R.

const runId = u => E.safe(u.label) || 'run';
const xName = f => 'x_' + f.name.slice(2);   // product-level column for d_ feature f

function vRows() {
  const U = units().filter(u => u.m.provider !== 'import' || conjointRows(u).length), feats = E.features(S.study.attrs), P = S.val.products, cols = Math.max(1, +S.tasks.cols || 5);
  const conj = [], trials = [], long = [], locks = [], hist = [], lockFiles = [], coefs = [], comp = [], summ = [], clog = [];
  U.forEach(u => { const id = runId(u), R = S.results[u.key] || {}, a = analyseUnit(u);
    conjointRows(u).forEach(r => { if (r.choice !== 'first' && r.choice !== 'second') return; const x1 = E.encodeProduct(r.p1, S.study.attrs), x2 = E.encodeProduct(r.p2, S.study.attrs); if (x1.some(isNaN) || x2.some(isNaN)) return;
      const o = { Run: u.label, RunID: id, Model: u.m.model, Pair: r.pair, Order: r.order || 'AB', ChoseFirst: r.choice === 'first' ? 1 : 0 };
      feats.forEach((f, j) => o[f.name] = x1[j] - x2[j]); S.study.attrs.forEach(at => { o[E.safe(at.name) + '_P1'] = r.p1[at.name]?.display ?? ''; o[E.safe(at.name) + '_P2'] = r.p2[at.name]?.display ?? ''; }); conj.push(o); });
    Object.entries(R.store || {}).sort((p, q) => +p[0] - +q[0]).forEach(([t, v]) => { trials.push({ RunID: id, Run: u.label, Trial: +t, Choice: v.choice ?? '', Position: v.position ?? '', Misreads: v.misreads ?? '', At: v.at ?? '', PageOrder: v.order ?? '' });
      if (v.choice && v.order) v.order.split(' | ').forEach((pid, i) => long.push({ RunID: id, Trial: +t, Product: pid, Position: i + 1, PageRow: Math.floor(i / cols) + 1, PageCol: i % cols + 1, Chosen: pid === v.choice ? 1 : 0 })); });
    if (R.lock) { locks.push({ RunID: id, Run: u.label, LockedAt: R.lock.at, Answers: R.lock.n, SHA256: R.lock.hash, PayloadFile: `locks/${id}.json` }); lockFiles.push([`locks/${id}.json`, R.lock.payload]); }
    (R.locks || []).forEach(l => hist.push({ RunID: id, LockedAt: l.at, Answers: l.n, SHA256: l.hash }));
    if (a.fit) a.fit.coefs.forEach((c, j) => coefs.push({ RunID: id, Run: u.label, Variable: j === 0 ? 'Constant' : feats[j - 1].name, Term: c.term, B: c.B, SE: c.SE, p: c.p }));
    if (a.lockedPred && a.share) { P.forEach((p, i) => comp.push({ RunID: id, Product: p.name, LockedPredictedShare: a.lockedPred[i], ObservedShare: a.share[i] }));
      summ.push({ RunID: id, Run: u.label, ConjointAnswers: a.fit?.n ?? '', LockedFromAnswers: R.lock?.n ?? '', StorefrontValidTrials: a.nStore ?? '', Rho_LockedPrediction_vs_Storefront: a.rhoLocked, MeanAbsShareGap: a.maeLocked, TopPredicted: a.topPred, TopObserved: a.topObs }); }
    else if (a.fit) summ.push({ RunID: id, Run: u.label, ConjointAnswers: a.fit.n, LockedFromAnswers: R.lock?.n ?? '', StorefrontValidTrials: a.nStore ?? '', Rho_LockedPrediction_vs_Storefront: '', MeanAbsShareGap: '', TopPredicted: '', TopObserved: '' });
    if (a.clogit?.terms) a.clogit.terms.forEach(t => clog.push({ RunID: id, Term: t.term, B: t.B, SE: t.SE })); });
  const prods = P.map(p => { const x = E.encodeProduct(productForPrediction(p), S.study.attrs), o = { Product: p.name }; feats.forEach((f, j) => o[xName(f)] = x[j]); showHeaders().slice(1).forEach(h => o['Card_' + E.safe(h)] = p.display[h] ?? ''); return o; });
  return { conj, trials, long, locks, hist, lockFiles, coefs, comp, summ, clog, prods, feats };
}

function spssVerify(feats) { const d = feats.map(f => f.name), x = feats.map(xName), q = s => `'${s}'`;
  return `* Encoding: UTF-8.
* LLM Conjoint Lab verification syntax (SPSS). Generated ${new Date().toISOString()}.
* 1. Unzip the verification pack.  2. On the CD line below, put the folder where you unzipped it.  3. Run All.
* Check A: conjoint coefficients.  Check C: storefront shares, rank correlation and position model.
* Check B (the SHA-256 fingerprint) needs R or Python: SPSS cannot compute SHA-256.

CD 'C:\\Users\\you\\Downloads\\verification_pack'.

* ===================== CHECK A: conjoint (one logistic regression per run) =====================.
GET DATA /TYPE=TXT /FILE='data/conjoint_long.csv' /ENCODING='UTF8' /DELIMITERS="," /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /VARIABLES=
  Run A200 RunID A100 Model A200 Pair F8.0 Order A4 ChoseFirst F8.0
${d.map(n => `  ${n} F20.10`).join('\n')}
${S.study.attrs.map(a => `  ${E.safe(a.name)}_P1 A200 ${E.safe(a.name)}_P2 A200`).join('\n')}.
SORT CASES BY RunID.
SPLIT FILE SEPARATE BY RunID.
LOGISTIC REGRESSION VARIABLES ChoseFirst WITH ${d.join(' ')}
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
`; }

// ---------- minimal ZIP writer (stored, no compression) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) { const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  files.forEach(([name, text]) => { const nb = enc.encode(name), db = typeof text === 'string' ? enc.encode(text) : text, crc = crc32(db);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, db.length, true); h.setUint32(22, db.length, true); h.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(h.buffer), nb, db);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, db.length, true); c.setUint32(24, db.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), nb); off += 30 + nb.length + db.length; });
  const size = cen.reduce((s, b) => s + b.length, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], { type: 'application/zip' }); }

const fullCSV = rows => (rows.length ? '' : '') + E.toCSV(rows.map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : v])))) + '\n';
function verificationFiles() { if (!Object.keys(S.fits || {}).length) $('analyseAll').click();
  const v = vRows(), base = 'verification_pack/';
  if (!v.conj.length && !v.trials.length) throw new Error('No results yet. Run a study (or the demo) first.');
  const manifest = { tool: 'LLM Conjoint Lab', version: document.querySelector('header .sub')?.textContent.split('·')[0].trim(), generated: new Date().toISOString(), project: S.projName, product: S.study.product,
    pairs: S.design?.length ?? 0, seed: S.study.seed, counterbalance: S.study.counterbalance, storefrontColumns: +S.tasks.cols || 5, runs: units().map(u => ({ RunID: runId(u), label: u.label, provider: u.m.provider, model: u.m.model, condition: u.c.label })),
    features: v.feats.map(f => ({ difference: f.name, product: xName(f), attribute: f.attr, level: f.level })) };
  const readme = `LLM Conjoint Lab verification pack
Generated ${manifest.generated} for "${S.projName}".

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
`;
  return [[base + 'READ_ME_FIRST.txt', readme], [base + 'manifest.json', JSON.stringify(manifest, null, 2)],
    [base + 'data/conjoint_long.csv', fullCSV(v.conj)], [base + 'data/products.csv', fullCSV(v.prods)], [base + 'data/storefront_trials.csv', fullCSV(v.trials)], [base + 'data/storefront_long.csv', fullCSV(v.long)],
    [base + 'data/locks.csv', fullCSV(v.locks)], [base + 'data/lock_history.csv', fullCSV(v.hist)], ...v.lockFiles.map(([n, t]) => [base + n, t]),
    [base + 'tool_results/coefficients.csv', fullCSV(v.coefs)], [base + 'tool_results/storefront_comparison.csv', fullCSV(v.comp)], [base + 'tool_results/summary.csv', fullCSV(v.summ)], [base + 'tool_results/storefront_clogit.csv', fullCSV(v.clog)],
    [base + 'scripts/verify.py', VERIFY_PY], [base + 'scripts/verify.R', VERIFY_R], [base + 'scripts/verify.sps', spssVerify(v.feats)]]; }
function downloadPack() { try { const files = verificationFiles(); download(`${fn(S.projName)}_verification_${stamp()}.zip`, makeZip(files)); msg('verifyMsg', `Downloaded: ${files.length} files.`); } catch (e) { msg('verifyMsg', e.message, false); } }

function verifyInit() {
  const nav = $('tabs'); if (nav && !nav.querySelector('[data-t="verify"]')) { const b = document.createElement('button'); b.dataset.t = 'verify'; b.innerHTML = '<span class="n">9</span>Verify'; b.onclick = () => showTab('verify'); nav.appendChild(b); }
  if (!$('verify')) { const s = document.createElement('section'); s.id = 'verify'; s.innerHTML = `<div class="card">
    <h2>Verify the results outside this tool</h2>
    <p>Every number on the Results page can be recomputed from the raw data with standard software, so you, a co-author or a reviewer can confirm it without trusting this tool.</p>
    <div class="row"><button class="b" id="verifyGo">⬇ Download verification pack (.zip)</button><span id="verifyMsg" class="hint"></span></div>
    <p class="hint">The pack holds the raw data, the locked predictions, the tool's own results at full precision, and ready-to-run scripts for <b>SPSS</b>, <b>R</b> and <b>Python</b>.</p></div>
    <div class="card"><h2>The three checks</h2>
    <p><b>Check A · Conjoint.</b> Re-fit the binary logistic regression (ChoseFirst on the d_ differences, with a constant) for each model in SPSS, R or Python. The coefficients and standard errors should match <code>tool_results/coefficients.csv</code> to at least 4 decimals.</p>
    <p><b>Check B · Locked prediction.</b> Each <code>locks/*.json</code> file is the exact prediction the tool saved before the storefront. Its SHA-256 fingerprint must match <code>data/locks.csv</code>, so the file can't have been changed afterwards. The script then re-computes the predicted shares from the locked coefficients and the products (share = e<sup>U</sup> ÷ Σe<sup>U</sup>, where U is the sum of coefficient × product value) and checks they match. For proof that the prediction came first, post the fingerprint somewhere dated (OSF, an email to co-authors) before running the storefront.</p>
    <p><b>Check C · Conjoint vs storefront.</b> Count each product's share of storefront picks, then compare with the locked prediction: Spearman's ρ, the mean share gap and the top pick. Then re-fit the position model (conditional logit: product + page row + page column, one stratum per trial). All should match <code>tool_results/</code>.</p></div>
    <div class="card"><h2>Step by step</h2><ol>
    <li>Run a study, then press <b>Analyse</b> on page 7.</li>
    <li>Press <b>Download verification pack</b> above and unzip it.</li>
    <li><b>Python:</b> <code>pip install pandas numpy scipy statsmodels</code>, then <code>python scripts/verify.py</code>. It prints PASS or CHECK for every check and writes <code>verify_report_python.txt</code>.</li>
    <li><b>R:</b> <code>install.packages(c("survival","jsonlite","digest"))</code>, then <code>Rscript scripts/verify.R</code>. It writes <code>verify_report_R.txt</code>.</li>
    <li><b>SPSS:</b> open <code>scripts/verify.sps</code>, put the folder where you unzipped the pack on the CD line at the top, then Run All. Compare the tables with the files in <code>tool_results/</code> (the comments in the syntax say which number goes with which).</li>
    <li>Any CHECK: open the report, which lists the numbers that differ and by how much. Small differences in the 5th decimal or beyond are rounding; anything larger means stop and look.</li></ol>
    <p class="hint">The full guide, with a worked example and expected answers, is VALIDATION.md in the GitHub repository.</p></div>
    <div class="navrow"><button class="b sec" onclick="showTab('data')">← Back</button><span></span></div>`;
    document.querySelector('main').appendChild(s); }
  $('verifyGo').onclick = downloadPack; }
