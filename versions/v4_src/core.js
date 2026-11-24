/* LLM Conjoint Lab — core logic (no DOM).
 * Design generation, prompt building, answer parsing, statistics,
 * predictions and exports. Loaded by index.html and by the Node tests.
 */
(function (root) {
'use strict';

// ---------- Seeded random numbers (mulberry32) ----------
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, r) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pick(arr, r) { return arr[Math.floor(r() * arr.length)]; }

// ---------- Attribute display ----------
// attribute: {key, name, type:'continuous'|'categorical', levels:[...], format:'$ {v}' }
function fmtValue(attr, v) {
  if (v === null || v === undefined || v === '') return '';
  if (attr.type === 'categorical') return String(v);
  const f = attr.format || '{v}';
  let s = String(v);
  if (attr.decimals !== undefined && attr.decimals !== null && attr.decimals !== '') s = Number(v).toFixed(Number(attr.decimals));
  return f.replace('{v}', s);
}

// ---------- Conjoint design ----------
// Same pairs for every model. With counterbalancing, every pair also appears reversed.
function makeConjointDesign(study) {
  const c = study.conjoint;
  const r = rng(Number(study.seed) || 1);
  const attrs = study.attributes;
  const base = [];
  let guard = 0;
  while (base.length < c.pairs && guard < c.pairs * 50) {
    guard++;
    const a = {}, b = {};
    attrs.forEach(at => { a[at.key] = pick(at.levels, r); b[at.key] = pick(at.levels, r); });
    if (attrs.every(at => String(a[at.key]) === String(b[at.key]))) continue; // identical profiles
    base.push({ pair: base.length + 1, p1: a, p2: b });
  }
  const tasks = [];
  base.forEach(p => {
    tasks.push({ id: 'C' + p.pair + 'a', pair: p.pair, order: 'AB', p1: p.p1, p2: p.p2 });
    if (c.counterbalance) tasks.push({ id: 'C' + p.pair + 'b', pair: p.pair, order: 'BA', p1: p.p2, p2: p.p1 });
  });
  return tasks;
}

function describeProfile(study, prof) {
  return study.attributes.map(at => at.name + ': ' + fmtValue(at, prof[at.key])).join('; ');
}

function fill(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

function conjointPrompt(study, task) {
  return fill(study.conjoint.prompt, {
    product: study.category,
    products: study.categoryPlural || (study.category + 's'),
    first: describeProfile(study, task.p1),
    second: describeProfile(study, task.p2)
  });
}

// Returns 'first' | 'second' | null
function parseFirstSecond(text) {
  if (!text) return null;
  const t = String(text);
  let m = t.match(/ANSWER\s*[:\-]?\s*\**\s*\[?\s*(first|second)\b/i);
  if (m) return m[1].toLowerCase();
  const lead = t.trim().replace(/^[\s*"'`#>\-]+/, '').match(/^(first|second)\b/i);
  if (lead) return lead[1].toLowerCase();
  const hasF = /\bfirst\b/i.test(t), hasS = /\bsecond\b/i.test(t);
  if (hasF && !hasS) return 'first';
  if (hasS && !hasF) return 'second';
  return null;
}

// ---------- Ranking (validation) ----------
function rankingPrompt(study, order) {
  const lines = order.map(p => p.id + ' — ' + describeProfile(study, p.attrs) + (p.price !== undefined && !study.attributes.some(a => a.key === 'price') ? '; Price: $' + p.price : ''));
  return fill(study.ranking.prompt, {
    product: study.category, products: study.categoryPlural || (study.category + 's'),
    n: order.length, list: lines.join('\n')
  });
}
function parseRanking(text, ids) {
  if (!text) return null;
  const found = [];
  const re = /\b([A-Z]{1,3}\d{1,3})\b/g; let m;
  const want = new Set(ids);
  let src = String(text);
  const ans = src.match(/RANKING\s*:\s*([\s\S]*)/i);
  if (ans) src = ans[1];
  while ((m = re.exec(src))) { if (want.has(m[1]) && !found.includes(m[1])) found.push(m[1]); }
  return found.length === ids.length ? found : null;
}

// ---------- Storefront design ----------
function makeStorefrontDesign(study, nTrials, seedOffset) {
  const s = study.storefront;
  const r = rng((Number(study.seed) || 1) * 7919 + (seedOffset || 0));
  const ids = study.products.map(p => p.id);
  const slots = s.rows * s.cols;
  const trials = [];
  for (let t = 1; t <= nTrials; t++) {
    const perm = shuffle(ids, r).slice(0, slots);
    trials.push({ trial: t, layout: perm.map((id, i) => ({ id, slot: i + 1, row: Math.floor(i / s.cols) + 1, col: (i % s.cols) + 1 })) });
  }
  return trials;
}

function storefrontPrompt(study) {
  return fill(study.storefront.prompt, { product: study.category, products: study.categoryPlural || (study.category + 's') });
}

function readbackKey(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

function addToCartTool(study) {
  const props = { product_id: { type: 'string', enum: study.products.map(p => p.id), description: 'Label of the product to add to the cart.' } };
  const req = ['product_id'];
  if (study.storefront.readback) {
    props.price = { type: 'number', description: 'Price shown for this product.' };
    props.rating = { type: 'number', description: 'Customer rating shown for this product.' };
    req.push('price', 'rating');
    study.attributes.filter(a => a.key !== 'price').forEach(a => {
      const k = readbackKey(a.name);
      props[k] = { type: 'string', description: '"' + a.name + '" shown for this product, exactly as written on its card.' };
      req.push(k);
    });
  }
  return { name: 'add_to_cart', description: "Add the selected item to cart. This is a special tool that is only used when you've selected a product item.", parameters: { type: 'object', properties: props, required: req, additionalProperties: false } };
}

function cardLines(study, p) {
  return study.attributes.filter(a => a.key !== 'price').map(a => ({ label: a.name, value: fmtValue(a, p.attrs[a.key]) }));
}
function productPrice(study, p) {
  return p.attrs.price !== undefined ? Number(p.attrs.price) : Number(p.price);
}
function storefrontText(study, layout) {
  const byId = Object.fromEntries(study.products.map(p => [p.id, p]));
  return layout.map(L => {
    const p = byId[L.id];
    return 'Row ' + L.row + ', column ' + L.col + ' — ' + p.id + ': ' + (study.storefront.cardTitle || p.title || study.category) +
      ' | $' + productPrice(study, p).toFixed(2) + ' | ' + Number(p.rating).toFixed(1) + ' stars (' + p.reviews + ' reviews) | ' +
      cardLines(study, p).map(l => l.label + ': ' + l.value).join(' | ');
  }).join('\n');
}

function norm(s) { return String(s === undefined || s === null ? '' : s).toLowerCase().replace(/[\s"'$,]+/g, '').replace(/inches|inch|in\.?$/,'in'); }
function sameValue(a, b) {
  const na = parseFloat(String(a).replace(/[^0-9.\-]/g, '')), nb = parseFloat(String(b).replace(/[^0-9.\-]/g, ''));
  if (norm(a) === norm(b)) return true;
  // numeric-only strings: compare numbers
  if (!isNaN(na) && !isNaN(nb) && /^[\s$]*[0-9.,]+[\s]*$/.test(String(a)) && na === nb) return true;
  return false;
}
// Compare what the model read back with what its chosen card showed.
function checkReadback(study, args) {
  const p = study.products.find(x => x.id === args.product_id);
  if (!p || !study.storefront.readback) return { misread: [], n: 0 };
  const mis = [];
  if (args.price !== undefined && Math.abs(Number(args.price) - productPrice(study, p)) > 0.005) mis.push('price');
  if (args.rating !== undefined && Math.abs(Number(args.rating) - Number(p.rating)) > 0.05) mis.push('rating');
  study.attributes.filter(a => a.key !== 'price').forEach(a => {
    const k = readbackKey(a.name);
    if (args[k] !== undefined && !sameValue(args[k], fmtValue(a, p.attrs[a.key]))) mis.push(a.name);
  });
  return { misread: mis, n: mis.length };
}

function parseToolArgsFromText(text, ids) {
  if (!text) return null;
  const j = String(text).match(/\{[\s\S]*"product_id"[\s\S]*?\}/);
  if (j) { try { return JSON.parse(j[0]); } catch (e) { /* fall through */ } }
  const m = String(text).match(/product_id\W+([A-Z]{1,3}\d{1,3})/);
  if (m && ids.includes(m[1])) return { product_id: m[1] };
  return null;
}

// ---------- Linear algebra ----------
function zeros(n, m) { return Array.from({ length: n }, () => new Array(m).fill(0)); }
function invert(A) {
  const n = A.length, M = A.map((row, i) => row.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map(row => row.slice(n));
}
function normCdf(x) { // Abramowitz-Stegun 7.1.26 via erf
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
function pTwo(z) { return Math.max(0, Math.min(1, 2 * (1 - normCdf(Math.abs(z))))); }

// ---------- Conjoint regression ----------
// Columns: continuous attributes enter as P1 − P2 in raw units; categorical attributes as
// differences of dummies for each non-reference level (reference = first level).
function conjointColumns(study) {
  const cols = [];
  study.attributes.forEach(a => {
    if (a.type === 'categorical') a.levels.slice(1).forEach(l => cols.push({ attr: a.key, level: l, name: a.name + ' = ' + l, spss: spssName(a.name + '_' + l) }));
    else cols.push({ attr: a.key, level: null, name: a.name, spss: spssName(a.name) });
  });
  return cols;
}
function spssName(s) { let n = String(s).replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''); if (!/^[A-Za-z]/.test(n)) n = 'v' + n; return n.slice(0, 60); }
function colValue(col, prof) {
  if (col.level === null) return Number(prof[col.attr]);
  return String(prof[col.attr]) === String(col.level) ? 1 : 0;
}

function logit(X, y) { // X includes intercept column; Newton-Raphson
  const n = X.length, k = X[0].length;
  let b = new Array(k).fill(0), ll = -Infinity, it = 0, converged = false;
  for (it = 0; it < 100; it++) {
    const g = new Array(k).fill(0), H = zeros(k, k);
    let newll = 0;
    for (let i = 0; i < n; i++) {
      let eta = 0; for (let j = 0; j < k; j++) eta += X[i][j] * b[j];
      const p = 1 / (1 + Math.exp(-eta));
      newll += y[i] ? Math.log(Math.max(p, 1e-300)) : Math.log(Math.max(1 - p, 1e-300));
      const w = p * (1 - p);
      for (let j = 0; j < k; j++) { g[j] += (y[i] - p) * X[i][j]; for (let l = 0; l <= j; l++) H[j][l] += w * X[i][j] * X[i][l]; }
    }
    for (let j = 0; j < k; j++) for (let l = 0; l < j; l++) H[l][j] = H[j][l];
    const Hi = invert(H); if (!Hi) return { error: 'Singular matrix: an attribute may not vary, or levels are perfectly confounded.' };
    const step = Hi.map(row => row.reduce((s, v, j) => s + v * g[j], 0));
    b = b.map((v, j) => v + step[j]);
    if (Math.abs(newll - ll) < 1e-10) { ll = newll; converged = true; break; }
    ll = newll;
  }
  // final covariance
  const H = zeros(k, k);
  for (let i = 0; i < n; i++) {
    let eta = 0; for (let j = 0; j < k; j++) eta += X[i][j] * b[j];
    const p = 1 / (1 + Math.exp(-eta)), w = p * (1 - p);
    for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) H[j][l] += w * X[i][j] * X[i][l];
  }
  const V = invert(H);
  const se = V ? V.map((r, j) => Math.sqrt(r[j])) : b.map(() => NaN);
  return { b, se, z: b.map((v, j) => v / se[j]), p: b.map((v, j) => pTwo(v / se[j])), ll, n, iterations: it + 1, converged };
}

function fitConjoint(study, rows) {
  const cols = conjointColumns(study);
  const use = rows.filter(r => r.choice === 'first' || r.choice === 'second');
  if (use.length < cols.length + 5) return { error: 'Not enough valid answers yet (' + use.length + ').' };
  const X = use.map(r => [1].concat(cols.map(c => colValue(c, r.p1) - colValue(c, r.p2))));
  const y = use.map(r => (r.choice === 'first' ? 1 : 0));
  const fit = logit(X, y);
  if (fit.error) return fit;
  const terms = [{ name: 'Constant (first-position bias)', spss: 'Constant', b: fit.b[0], se: fit.se[0], z: fit.z[0], p: fit.p[0] }]
    .concat(cols.map((c, j) => ({ name: c.name, spss: c.spss, attr: c.attr, level: c.level, b: fit.b[j + 1], se: fit.se[j + 1], z: fit.z[j + 1], p: fit.p[j + 1] })));
  // utilities and relative importance (utility-range method)
  const util = {};
  study.attributes.forEach(a => {
    if (a.type === 'categorical') {
      const u = {}; u[a.levels[0]] = 0;
      a.levels.slice(1).forEach(l => { u[l] = terms.find(t => t.attr === a.key && t.level === l).b; });
      util[a.key] = u;
    } else util[a.key] = terms.find(t => t.attr === a.key && t.level === null).b;
  });
  const ranges = {};
  study.attributes.forEach(a => {
    if (a.type === 'categorical') { const v = Object.values(util[a.key]); ranges[a.key] = Math.max(...v) - Math.min(...v); }
    else { const L = a.levels.map(Number); ranges[a.key] = Math.abs(util[a.key]) * (Math.max(...L) - Math.min(...L)); }
  });
  const tot = Object.values(ranges).reduce((s, v) => s + v, 0) || 1;
  const importance = Object.fromEntries(Object.entries(ranges).map(([k, v]) => [k, v / tot]));
  const firstShare = y.reduce((s, v) => s + v, 0) / y.length;
  const nullLL = y.length * (firstShare * Math.log(firstShare) + (1 - firstShare) * Math.log(1 - firstShare));
  return { terms, util, importance, n: use.length, nMissing: rows.length - use.length, firstShare,
    firstShareP: binomP(y.reduce((s, v) => s + v, 0), y.length), ll: fit.ll, nagelkerke: nagelkerke(fit.ll, nullLL, y.length), converged: fit.converged };
}
function nagelkerke(ll, ll0, n) { const cs = 1 - Math.exp(2 * (ll0 - ll) / n); return cs / (1 - Math.exp(2 * ll0 / n)); }
function binomP(k, n) { const z = (k - n / 2) / Math.sqrt(n / 4); return pTwo(z); }

function productUtility(study, util, attrs) {
  let u = 0;
  study.attributes.forEach(a => {
    if (a.type === 'categorical') u += util[a.key][attrs[a.key]] || 0;
    else u += util[a.key] * Number(attrs[a.key]);
  });
  return u;
}
// Predicted storefront shares: multinomial logit on conjoint utilities (constant excluded).
function predictShares(study, util) {
  const us = study.products.map(p => productUtility(study, util, p.attrs));
  const mx = Math.max(...us), ex = us.map(u => Math.exp(u - mx)), s = ex.reduce((a, b) => a + b, 0);
  const out = study.products.map((p, i) => ({ id: p.id, utility: us[i], share: ex[i] / s }));
  const ranks = rankOf(out.map(o => -o.utility));
  out.forEach((o, i) => { o.rank = ranks[i]; });
  return out;
}

function rankOf(vals) { // average ranks, 1 = smallest value
  const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(vals.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1;
  }
  return r;
}
function pearson(a, b) {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}
function spearman(a, b) { return pearson(rankOf(a), rankOf(b)); }

function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.959964, p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

// ---------- Storefront analysis ----------
function storefrontSummary(study, rows) {
  const valid = rows.filter(r => r.chosen);
  const n = valid.length;
  const shares = study.products.map(p => {
    const k = valid.filter(r => r.chosen === p.id).length;
    const ci = wilson(k, n);
    return { id: p.id, k, share: n ? k / n : 0, lo: ci[0], hi: ci[1] };
  });
  const mis = valid.filter(r => r.nMisread > 0).length;
  const correct = valid.filter(r => r.nMisread === 0);
  const sharesCorrect = study.products.map(p => { const k = correct.filter(r => r.chosen === p.id).length; return { id: p.id, k, share: correct.length ? k / correct.length : 0 }; });
  return { n, nInvalid: rows.length - n, shares, sharesCorrect, misreadRate: n ? mis / n : 0, nCorrect: correct.length };
}

// Conditional logit with product fixed effects + row + column effects (first product, row 1, col 1 = reference).
function clogit(study, rows, designByTrial) {
  const ids = study.products.map(p => p.id);
  const s = study.storefront;
  const vars = ids.slice(1).map(id => 'fe_' + id)
    .concat(Array.from({ length: s.rows - 1 }, (_, i) => 'row_' + (i + 2)))
    .concat(Array.from({ length: s.cols - 1 }, (_, i) => 'col_' + (i + 2)));
  const sets = [];
  rows.filter(r => r.chosen).forEach(r => {
    const lay = designByTrial[r.trial]; if (!lay) return;
    sets.push({ chosen: r.chosen, alts: lay.map(L => {
      const x = new Array(vars.length).fill(0);
      const fi = ids.indexOf(L.id); if (fi > 0) x[fi - 1] = 1;
      if (L.row > 1) x[ids.length - 1 + (L.row - 2)] = 1;
      if (L.col > 1) x[ids.length - 1 + (s.rows - 1) + (L.col - 2)] = 1;
      return { id: L.id, x };
    }) });
  });
  if (sets.length < 10) return { error: 'Not enough storefront choices yet.' };
  // drop fixed effects for products never chosen (they diverge); report them separately
  const chosenIds = new Set(sets.map(st => st.chosen));
  const keep = vars.map((v, j) => !(v.startsWith('fe_') && !chosenIds.has(v.slice(3))));
  const k = keep.filter(Boolean).length, kv = vars.filter((v, j) => keep[j]);
  const red = sets.map(st => ({ chosen: st.chosen, alts: st.alts.filter(a => chosenIds.has(a.id) || true).map(a => ({ id: a.id, never: !chosenIds.has(a.id), x: a.x.filter((v, j) => keep[j]) })) }));
  let b = new Array(k).fill(0), ll = -Infinity, converged = false;
  for (let it = 0; it < 100; it++) {
    const g = new Array(k).fill(0), H = zeros(k, k); let newll = 0;
    red.forEach(st => {
      const alts = st.alts.filter(a => !a.never);
      const eta = alts.map(a => a.x.reduce((s2, v, j) => s2 + v * b[j], 0));
      const mx = Math.max(...eta), ex = eta.map(e => Math.exp(e - mx)), S = ex.reduce((x, y) => x + y, 0);
      const pr = ex.map(e => e / S);
      const ci = alts.findIndex(a => a.id === st.chosen);
      newll += Math.log(pr[ci]);
      const xbar = new Array(k).fill(0);
      alts.forEach((a, i) => a.x.forEach((v, j) => { xbar[j] += pr[i] * v; }));
      alts[ci].x.forEach((v, j) => { g[j] += v - xbar[j]; });
      alts.forEach((a, i) => { for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) H[j][l] += pr[i] * (a.x[j] - xbar[j]) * (a.x[l] - xbar[l]); });
    });
    const Hi = invert(H); if (!Hi) return { error: 'Storefront model could not be estimated (singular).' };
    b = b.map((v, j) => v + Hi[j].reduce((s2, h, l) => s2 + h * g[l], 0));
    if (Math.abs(newll - ll) < 1e-10) { ll = newll; converged = true; break; }
    ll = newll;
    if (it === 99) { const Hf = invert(H); }
  }
  // covariance at the solution
  const H = zeros(k, k);
  red.forEach(st => {
    const alts = st.alts.filter(a => !a.never);
    const eta = alts.map(a => a.x.reduce((s2, v, j) => s2 + v * b[j], 0));
    const mx = Math.max(...eta), ex = eta.map(e => Math.exp(e - mx)), S = ex.reduce((x, y) => x + y, 0), pr = ex.map(e => e / S);
    const xbar = new Array(k).fill(0); alts.forEach((a, i) => a.x.forEach((v, j) => { xbar[j] += pr[i] * v; }));
    alts.forEach((a, i) => { for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) H[j][l] += pr[i] * (a.x[j] - xbar[j]) * (a.x[l] - xbar[l]); });
  });
  const V = invert(H);
  const terms = kv.map((v, j) => { const se = V ? Math.sqrt(V[j][j]) : NaN; return { term: v, b: b[j], se, z: b[j] / se, p: pTwo(b[j] / se) }; });
  return { terms, ll, n: sets.length, converged, neverChosen: ids.filter(id => !chosenIds.has(id)), reference: ids[0] };
}

// ---------- Across models: random-effects pooling (DerSimonian–Laird) ----------
function poolRE(est) { // est: [{b, se}]
  const e = est.filter(x => isFinite(x.b) && isFinite(x.se) && x.se > 0);
  const k = e.length; if (k < 2) return null;
  const w = e.map(x => 1 / (x.se * x.se)), sw = w.reduce((a, b) => a + b, 0);
  const bf = e.reduce((s, x, i) => s + w[i] * x.b, 0) / sw;
  const Q = e.reduce((s, x, i) => s + w[i] * (x.b - bf) ** 2, 0);
  const C = sw - w.reduce((s, v) => s + v * v, 0) / sw;
  const tau2 = Math.max(0, (Q - (k - 1)) / C);
  const ws = e.map(x => 1 / (x.se * x.se + tau2)), sws = ws.reduce((a, b) => a + b, 0);
  const b = e.reduce((s, x, i) => s + ws[i] * x.b, 0) / sws, se = Math.sqrt(1 / sws);
  const I2 = Q > 0 ? Math.max(0, (Q - (k - 1)) / Q) : 0;
  return { b, se, z: b / se, p: pTwo(b / se), tau2, Q, I2, k };
}

// ---------- Exports ----------
function csvCell(v) { if (v === null || v === undefined) return ''; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function toCSV(rows, cols) { return [cols.join(',')].concat(rows.map(r => cols.map(c => csvCell(r[c])).join(','))).join('\n'); }

function conjointLong(study, modelLabel, condition, rows) {
  const out = [];
  rows.forEach(r => {
    const base = { model: modelLabel, condition, task_id: r.id, pair: r.pair, order: r.order, choice: r.choice || '', chose_first: r.choice ? (r.choice === 'first' ? 1 : 0) : '', missing: r.choice ? 0 : 1, reasked: r.reasked ? 1 : 0, model_returned: r.modelReturned || '', response: r.text || '' };
    study.attributes.forEach(a => { base['P1_' + spssName(a.name)] = r.p1[a.key]; base['P2_' + spssName(a.name)] = r.p2[a.key]; });
    out.push(base);
  });
  return out;
}

function spssSyntax(study, modelLabel) {
  const cols = conjointColumns(study);
  const L = [];
  L.push('* LLM Conjoint Lab: conjoint analysis for ' + modelLabel + '.');
  L.push('* Open the conjoint CSV for this model first (File > Import Data > CSV).');
  L.push('* DV: chose_first (1 = chose the first product). Predictors: Product 1 minus Product 2.');
  L.push('* Missing answers (missing = 1) are excluded.');
  L.push('SELECT IF (missing = 0).');
  study.attributes.forEach(a => {
    const n = spssName(a.name);
    if (a.type === 'categorical') {
      a.levels.slice(1).forEach(l => {
        const d = spssName(a.name + '_' + l);
        L.push('COMPUTE D_' + d + ' = (P1_' + n + ' = "' + String(l).replace(/"/g, "'") + '") - (P2_' + n + ' = "' + String(l).replace(/"/g, "'") + '").');
      });
    } else L.push('COMPUTE D_' + n + ' = P1_' + n + ' - P2_' + n + '.');
  });
  L.push('EXECUTE.');
  L.push('LOGISTIC REGRESSION VARIABLES chose_first');
  L.push('  /METHOD=ENTER ' + cols.map(c => 'D_' + c.spss).join(' '));
  L.push('  /PRINT=CI(95)');
  L.push('  /CRITERIA=PIN(0.05) POUT(0.10) ITERATE(20) CUT(0.5).');
  return L.join('\n');
}

async function sha256(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return 'djb2-' + (h >>> 0).toString(16);
  }
}

// ---------- Simulated models (for testing without API calls) ----------
function simTruth(study, name) {
  const r = rng([...name].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>> 0);
  const util = {};
  study.attributes.forEach(a => {
    if (a.type === 'categorical') { const u = {}; a.levels.forEach((l, i) => { u[l] = i === 0 ? 0 : (r() * 1.6 - 0.3); }); util[a.key] = u; }
    else {
      const L = a.levels.map(Number), span = (Math.max(...L) - Math.min(...L)) || 1;
      const sign = a.better === 'lower' ? -1 : 1;
      util[a.key] = sign * (0.4 + r() * 1.6) / span;
    }
  });
  return { util, firstBias: 0.1 + r() * 0.4, misread: 0.02 + r() * 0.08 };
}
function simConjoint(study, task, name, r) {
  const T = simTruth(study, name);
  const d = productUtility(study, T.util, task.p1) - productUtility(study, T.util, task.p2) + T.firstBias;
  const p = 1 / (1 + Math.exp(-d));
  if (r() < 0.01) return 'I like both of these.'; // occasional unclear answer
  return 'ANSWER: ' + (r() < p ? 'first' : 'second') + ' REASON: simulated.';
}
function simRanking(study, name, r) {
  const T = simTruth(study, name);
  const u = study.products.map(p => ({ id: p.id, u: productUtility(study, T.util, p.attrs) + (r() - 0.5) * 0.6 }));
  return 'RANKING: ' + u.sort((a, b) => b.u - a.u).map(x => x.id).join(', ');
}
function simStorefront(study, layout, name, r) {
  const T = simTruth(study, name);
  const byId = Object.fromEntries(study.products.map(p => [p.id, p]));
  const u = layout.map(L => productUtility(study, T.util, byId[L.id].attrs) + (L.row === 1 ? 0.3 : 0) + (L.col === 1 ? 0.2 : 0));
  const mx = Math.max(...u), ex = u.map(x => Math.exp(x - mx)), S = ex.reduce((a, b) => a + b, 0);
  let x = r() * S, i = 0; while (x > ex[i] && i < ex.length - 1) { x -= ex[i]; i++; }
  const p = byId[layout[i].id];
  const args = { product_id: p.id, price: productPrice(study, p), rating: Number(p.rating) };
  study.attributes.filter(a => a.key !== 'price').forEach(a => { args[readbackKey(a.name)] = fmtValue(a, p.attrs[a.key]); });
  if (r() < T.misread) { const a = study.attributes.find(at => at.key !== 'price'); args[readbackKey(a.name)] = 'misread'; }
  return { text: 'Simulated reasoning.', args };
}

const api = { rng, shuffle, fmtValue, makeConjointDesign, describeProfile, conjointPrompt, parseFirstSecond, rankingPrompt, parseRanking,
  makeStorefrontDesign, storefrontPrompt, addToCartTool, readbackKey, cardLines, productPrice, storefrontText, checkReadback, parseToolArgsFromText,
  logit, fitConjoint, conjointColumns, productUtility, predictShares, rankOf, spearman, pearson, wilson, storefrontSummary, clogit, poolRE,
  toCSV, conjointLong, spssSyntax, spssName, sha256, simTruth, simConjoint, simRanking, simStorefront, pTwo, fill };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LabCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
