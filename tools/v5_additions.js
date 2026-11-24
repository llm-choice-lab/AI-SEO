// ================= v5 additions: Study 3, ACES storefront via the Selenium helper, locked prediction, validation =================
const S3_ATTRS = [
  { name: 'Screen size', kind: 'list', levels: ['7 inches', '7.8 inches', '8 inches'], type: 'continuous', isPrice: false, better: '' },
  { name: 'Screen type', kind: 'list', levels: ['E Ink Carta', 'E Ink Carta 1200', 'Color E Ink'], type: 'categorical', isPrice: false, best: '',
    also: { Resolution: { 'E Ink Carta': '300 PPI', 'E Ink Carta 1200': '300 PPI', 'Color E Ink': '300 PPI B&W, 150 PPI color' } } },
  { name: 'Storage', kind: 'list', levels: ['16 GB', '32 GB', '64 GB'], type: 'continuous', isPrice: false, better: 'higher' },
  { name: 'Water resistance', kind: 'list', levels: ['Water-repellent', 'Waterproof (IPX7)', 'Waterproof (IPX8)'], type: 'categorical', isPrice: false, best: 'Waterproof (IPX8)' },
  { name: 'Battery life', kind: 'list', levels: ['Up to 3 weeks', 'Up to 4 weeks', 'Up to 6 weeks', 'Up to 8 weeks', 'Up to 12 weeks'], type: 'continuous', isPrice: false, better: 'higher' },
  { name: 'Weight', kind: 'list', levels: ['190 g', '215 g', '240 g', '265 g', '290 g'], type: 'continuous', isPrice: false, better: 'lower' },
  { name: 'Page buttons', kind: 'list', levels: ['No', 'Yes'], type: 'categorical', isPrice: false, best: 'Yes' },
  { name: 'Stylus support', kind: 'list', levels: ['No', 'Yes'], type: 'categorical', isPrice: false, best: 'Yes' },
  { name: 'Price', kind: 'list', levels: ['$149', '$199', '$249', '$299', '$349'], type: 'continuous', isPrice: true, better: 'lower' }
];
// The 10 real e-readers of the v5/v6 storefront runs (Google Sheet "AI SEO Storefront v4 – Products", tab "E-readers";
// specs from the-ebook-reader.com 7"-8" comparison table, checked 27 Oct 2026). Rating and reviews are held equal.
const S3_VAL = `Name,Brand and model,Screen size,Screen type,Resolution,Storage,Water resistance,Battery life,Weight,Page buttons,Stylus support,Price,Rating,Reviews,Card title
E01,Kindle Paperwhite (2024),7 inches,E Ink Carta,300 PPI,16 GB,Waterproof (IPX8),Up to 12 weeks,211 g,No,No,$159,4.5,1000,E-Reader
E02,Kindle Colorsoft,7 inches,Color E Ink,"300 PPI B&W, 150 PPI color",32 GB,Waterproof (IPX8),Up to 8 weeks,219 g,No,No,$279,4.5,1000,E-Reader
E03,Kobo Libra Colour,7 inches,Color E Ink,"300 PPI B&W, 150 PPI color",32 GB,Waterproof (IPX8),Up to 6 weeks,200 g,Yes,Yes,$219,4.5,1000,E-Reader
E04,Kobo Sage,8 inches,E Ink Carta 1200,300 PPI,32 GB,Waterproof (IPX8),Up to 3 weeks,241 g,Yes,Yes,$269,4.5,1000,E-Reader
E05,Boox Go 7 Color,7 inches,Color E Ink,"300 PPI B&W, 150 PPI color",64 GB,Water-repellent,Up to 4 weeks,195 g,Yes,No,$249,4.5,1000,E-Reader
E06,PocketBook InkPad 4,7.8 inches,E Ink Carta 1200,300 PPI,32 GB,Waterproof (IPX8),Up to 4 weeks,265 g,Yes,No,$269,4.5,1000,E-Reader
E07,PocketBook InkPad Color,7.8 inches,Color E Ink,"300 PPI B&W, 150 PPI color",32 GB,Waterproof (IPX8),Up to 4 weeks,270 g,Yes,No,$329,4.5,1000,E-Reader
E08,PocketBook Era,7 inches,E Ink Carta 1200,300 PPI,16 GB,Waterproof (IPX8),Up to 4 weeks,228 g,Yes,No,$219,4.5,1000,E-Reader
E09,PocketBook Era Color,7 inches,Color E Ink,"300 PPI B&W, 150 PPI color",32 GB,Waterproof (IPX8),Up to 4 weeks,235 g,Yes,No,$259,4.5,1000,E-Reader
E10,Nook GlowLight 4 Plus,7.8 inches,E Ink Carta,300 PPI,32 GB,Waterproof (IPX7),Up to 4 weeks,285 g,Yes,No,$199,4.5,1000,E-Reader`;
const S3_MODELS = [['openai/gpt-4o-2024-11-20', 'GPT-4o (2024-11-20)'], ['openai/gpt-4o-mini', 'GPT-4o mini'], ['openai/gpt-6-luna', 'GPT-6 Luna'],
  ['google/gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite'], ['google/gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite'],
  ['qwen/qwen3.5-flash-02-23', 'Qwen 3.5 Flash'], ['qwen/qwen3.7-flash', 'Qwen 3.7 Flash'], ['qwen/qwen3.8-flash', 'Qwen 3.8 Flash'],
  ['anthropic/claude-haiku-5.5', 'Claude Haiku 5.5']];
const ACES_DEFAULTS = () => ({ query: 'e-reader', image: 'ereader', specCols: ['Screen size', 'Screen type', 'Resolution', 'Storage', 'Water resistance', 'Battery life', 'Weight', 'Page buttons', 'Stylus support'],
  priceCol: 'Price', ratingCol: 'Rating', reviewsCol: 'Reviews', titleCol: 'Card title', temperature: 1.0, detail: 'high', search: true, click: true, validationTrials: 10, maxTokens: 4096 });
function loadStudy3() {
  S.study = { product: 'e-reader', attrs: JSON.parse(JSON.stringify(S3_ATTRS)), iterations: 500, seed: 20261124, counterbalance: true };
  S.val = { headers: ['Name'], products: [] }; setValFromCSV(S3_VAL, true);
  S.tasks = { ...S.tasks, conjoint: true, ranking: true, rankRuns: 20, store: true, storeTrials: 1000, storeMode: 'aces', cols: 5 };
  S.aces = ACES_DEFAULTS(); S.acesDesign = null;
  S.design = E.pairDesign(S.study.attrs, 500, 20261124); S.fits = {};
  S.projName = 'Study 3 – e-readers (conjoint → ACES storefront)';
  if (!S.models.length) S3_MODELS.forEach(([id, label]) => S.models.push({ provider: 'openrouter', model: id, label }));
  save(); syncAll(); }

// ---------- ACES prompt and tool (exactly as in the v6 notebook) ----------
const ACES_SYSTEM = 'You are a helpful shopping assistant and are to purchase a single product.';
function acesPrompt() { const q = (S.aces || ACES_DEFAULTS()).query || S.study.product;
  return `You are a personal shopping assistant helping someone find a good ${q}. They haven't specified particular requirements, so use your best judgment about what would work well for a typical person, and select one product to purchase.

<instructions>
1. Carefully examine the entire screenshot to identify all available products and their attributes.
2. Use the \`add_to_cart\` function when you are ready to buy a product.
3. Before making your selection, explain your reasoning for choosing this product, including what factors influenced your decision and any assumptions you made about what would be best:
   - Your primary decision criteria and why you prioritized them
   - How each available product performed on these criteria
   - What specific factors made your chosen product superior
   - Any assumptions you made about the user's needs or preferences
4. If information is missing or unclear in the screenshot, explicitly mention the limitation and how it influenced your decision-making.
</instructions>`; }
function acesSpecCols() { const A = S.aces || ACES_DEFAULTS(); return (A.specCols && A.specCols.length ? A.specCols : showHeaders().slice(1)).filter(c => S.val.headers.includes(c)); }
function acesKey(col) { let k = col.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'attribute'; while (['product_id', 'price', 'rating'].includes(k)) k += '_'; return k; }
function acesCard(p) { const A = S.aces || ACES_DEFAULTS(), num = (v, d) => { const x = E.leadNum(v); return isNaN(x) ? d : x; };
  return { id: p.name, title: p.display[A.titleCol] || 'Product', specs: acesSpecCols().map(c => [c, p.display[c] ?? '']), price: num(p.display[A.priceCol], 0), rating: num(p.display[A.ratingCol], 4.5), reviews: Math.round(num(p.display[A.reviewsCol], 1000)) }; }
function acesTool(products, m) {
  const props = { product_id: { type: 'string', enum: products.map(p => p.name), description: 'Label of the product to add to the cart.' },
    price: { type: 'number', description: 'Price shown for this product.' }, rating: { type: 'number', description: 'Customer rating shown for this product.' } };
  acesSpecCols().forEach(c => props[acesKey(c)] = { type: 'string', description: `"${c}" shown for this product, exactly as written on its card.` });
  const t = { name: 'add_to_cart', description: "Add the selected item to cart. This is a special tool that is only used when you've selected a product item.",
    parameters: { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false } };
  if (m && (m.provider === 'openai' || /^openai\//.test(m.model))) t.strict = true;   // as in v6 (OpenAI strict tool schema)
  return t; }

// ---------- helper connection ----------
const HELPER = { base: null };
async function helperOK() {
  const cands = [location.protocol.startsWith('http') ? location.origin : null, 'http://127.0.0.1:8765'].filter(Boolean);
  for (const c of cands) { try { const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 2500); const r = await fetch(c + '/api/health', { signal: ctl.signal }); clearTimeout(tm); const j = await r.json(); if (j.ok) { HELPER.base = c; HELPER.info = j; showHelper(true); return true; } } catch (e) {} }
  HELPER.base = null; showHelper(false); return false; }
function showHelper(ok) { const el = $('helperStatus'); if (!el) return; el.className = 'pill' + (ok ? '' : ' warn'); el.textContent = ok ? `Storefront helper connected (Selenium · ${HELPER.info.window.join('×')} window · ${HELPER.info.drivers} Chrome)` : 'Storefront helper not running: start  python aces_helper.py'; }
async function helperPost(path, body) { let r, j;
  try { r = await fetch(HELPER.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); j = await r.json(); }
  catch (e) { throw new ApiError('Storefront helper not reachable: ' + e.message, 0, true); }
  if (!r.ok || j.error) throw new ApiError('Storefront helper: ' + (j.error || r.status), 0, true); return j; }
const acesRunId = kind => `${(S.projName || 'study').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)}_${S.study.seed}_${kind}`;
async function acesPrepare(kind, products) { const A = S.aces || (S.aces = ACES_DEFAULTS());
  await helperPost('/api/aces/prepare', { run: acesRunId(kind), query: A.query, cols: +S.tasks.cols || 5, image: A.image, products: products.map(acesCard) }); }

// ---------- design: positions balanced with random Latin squares (as in v6) ----------
function randomLatinSquare(n, r) { const base = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i + j) % n));
  const rows = E.shuffle([...Array(n).keys()], r), cols = E.shuffle([...Array(n).keys()], r), syms = E.shuffle([...Array(n).keys()], r);
  return rows.map(ri => cols.map(ci => syms[base[ri][ci]])); }
function acesOrders(n, nTrials, seed) { const r = E.rng(seed); let orders = []; while (orders.length < nTrials) orders.push(...randomLatinSquare(n, r)); return E.shuffle(orders.slice(0, nTrials), r); }
function acesOrder(t) { const n = S.val.products.length, N = Math.max(+S.tasks.storeTrials || 1, 1), key = `${n}|${N}|${S.study.seed}|${S.val.products.map(p => p.name).join(',')}`;
  if (!S.acesDesign || S.acesDesign.key !== key) S.acesDesign = { key, orders: acesOrders(n, N, (+S.study.seed || 1) * 31 + 7) };
  return S.acesDesign.orders[t - 1].map(i => S.val.products[i].name); }

// ---------- one storefront trial (v6 procedure) ----------
function sameValue(rep, act) { const r = String(rep ?? '').trim(), a = String(act ?? '').trim();
  if (/^-?\d+(\.\d+)?$/.test(r) && /^-?\d+(\.\d+)?$/.test(a)) return Math.abs(+r - +a) < 1e-6;
  const n = s => s.toLowerCase().replace(/[^a-z0-9.]/g, ''); return n(r) === n(a); }
async function acesTrial(u, trial, products, runId, store, order, ctl) {
  const A = S.aces || ACES_DEFAULTS();
  const shot = await helperPost('/api/aces/screenshot', { run: runId, trial, order, search: A.search !== false });
  const byName = Object.fromEntries(products.map(p => [p.name, p])), page = order.map(nm => byName[nm]), ids = products.map(p => p.name);
  const opts = { system: ACES_SYSTEM, tool: acesTool(products, u.m), temperature: A.temperature ?? 1.0, detail: A.detail || 'high', maxTokens: A.maxTokens || 4096 };
  let res; try { res = await callRetry(u, acesPrompt(), shot.png, { type: 'aces', products: page }, ctl, opts); }
  catch (e) { if (/temperature/i.test(e.message) && opts.temperature === 1.0) { log(`${u.label}: model only accepts its default temperature (1.0); sending without it.`); A.temperature = null; opts.temperature = null; res = await callRetry(u, acesPrompt(), shot.png, { type: 'aces', products: page }, ctl, opts); } else throw e; }
  const issues = []; let args = res.args;
  if (!args) issues.push('no_add_to_cart_call'); else if (args._multiple) { issues.push('multiple_add_to_cart_calls'); args = null; } else if (args._bad) { issues.push('bad_tool_arguments'); args = null; }
  const pid = args ? (ids.find(x => x.toUpperCase() === String(args.product_id ?? '').trim().toUpperCase()) || null) : null;
  if (args && !pid) issues.push('unknown_product_id');
  let wrong = [], slot = null, row = null, col = null, cart = null;
  if (pid) { const c = acesCard(byName[pid]), cols = +S.tasks.cols || 5;
    if (args.price != null && Math.abs(+args.price - c.price) > 0.005) wrong.push('Price');
    if (args.rating != null && Math.abs(+args.rating - c.rating) > 0.001) wrong.push('Rating');
    acesSpecCols().forEach(cn => { if (!sameValue(args[acesKey(cn)], byName[pid].display[cn])) wrong.push(cn); });
    slot = order.indexOf(pid) + 1; row = Math.floor((slot - 1) / cols) + 1; col = (slot - 1) % cols + 1;
    if (A.click !== false) { try { cart = (await helperPost('/api/aces/click', { run: runId, trial, product_id: pid, search: A.search !== false })).ok; } catch (e) { cart = false; issues.push('cart_click_failed'); } } }
  if (wrong.length) issues.push('readback_mismatch');
  store[trial] = { order: order.join(' | '), choice: pid, position: slot, row, col, misreads: pid ? wrong.length : null, misread_detail: wrong.join('; '), cart_ok: cart, issues: issues.join(' | '),
    args: res.args || null, raw: res.text, served: res.served, cost: res.cost, tin: res.inTok, tout: res.outTok, ms: res.ms, url: shot.url, searched: shot.searched };
  return !!pid; }

// ---------- lock the conjoint prediction before the storefront ----------
async function sha256(t) { try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return 'djb2-' + (h >>> 0).toString(16); } }
async function lockPrediction(u) { const R = resOf(u), rows = conjointRows(u), n = rows.filter(r => r.choice).length;
  if (R.lock && R.lock.n === n) return true;
  let fit; try { fit = E.analyseConjoint(rows, S.study.attrs); } catch (e) { log(`${u.label}: conjoint fit failed (${e.message})`); return false; }
  const P = S.val.products, util = P.map(p => E.utility(fit, S.study.attrs, productForPrediction(p))), mx = Math.max(...util), ex = util.map(v => Math.exp(v - mx)), sum = ex.reduce((a, b) => a + b, 0), rk = E.ranks(util, true);
  const predicted = P.map((p, i) => ({ product: p.name, utility: util[i], share: ex[i] / sum, rank: rk[i] }));
  const coefs = fit.coefs.map(c => [c.term, c.B]);
  const payload = JSON.stringify({ model: u.m.model, condition: u.c.label, answers: n, coefs, predicted });
  R.lock = { at: new Date().toISOString(), n, hash: await sha256(payload), predicted, coefs, payload }; R.locks = [...(R.locks || []), { at: R.lock.at, n, hash: R.lock.hash }];
  log(`${u.label}: prediction locked from ${n} answers · sha256 ${R.lock.hash.slice(0, 12)}…`); save(); return true; }

// ---------- validation: one product best on every attribute with a clear direction ----------
function validationProducts() { const P = JSON.parse(JSON.stringify(S.val.products)); if (P.length < 2) return {};
  let any = false;
  S.study.attrs.forEach(a => { let best, worst;
    if (a.type === 'continuous' && a.kind === 'list' && (a.better || a.isPrice)) { const dir = a.better || 'lower', L = a.levels.slice().sort((x, y) => E.leadNum(x) - E.leadNum(y)); best = dir === 'higher' ? L[L.length - 1] : L[0]; worst = dir === 'higher' ? L[0] : L[L.length - 1]; }
    else if (a.type === 'categorical' && a.best) { best = a.best; worst = a.levels.find(l => l !== a.best); }
    else { best = worst = P[0].display[a.name]; }
    if (best !== worst) any = true;
    P.forEach((p, i) => { const v = i === 0 ? best : worst; p.display[a.name] = v; if (a.type === 'categorical') { p.level = p.level || {}; p.level[a.name] = v; } Object.entries(a.also || {}).forEach(([c, map]) => { if (map[v] != null) p.display[c] = map[v]; }); }); });
  return any ? { prods: P, dominant: P[0].name } : {}; }
async function runValidation() { if (run.active) return; const U = units().filter(u => u.m.provider !== 'import'); if (!U.length) return log('Add models on page 4.');
  if (!(await helperOK())) return log('The validation check needs the storefront helper: start  python aces_helper.py');
  const { prods, dominant } = validationProducts(); if (!dominant) return log('Validation needs at least one attribute with a "better" direction.');
  const A = S.aces || (S.aces = ACES_DEFAULTS()), N = +A.validationTrials || 10; await acesPrepare('validation', prods);
  const orders = acesOrders(prods.length, N, (+S.study.seed || 1) * 31 + 99).map(o => o.map(i => prods[i].name));
  log(`Validation check: ${dominant} is best on every attribute with a clear direction; the rest are worst. ${N} storefront trials per model.`);
  run.active = true; run.paused = false; globalStop = false; capWarned = false; $('startAll').disabled = true; $('runValidation').disabled = true; $('pauseAll').disabled = false; $('stopAll').disabled = false;
  const tick = setInterval(renderProgress, 600);
  await Promise.all(U.map(async u => { const R = resOf(u); R.validation = { dominant, trials: {} }; const ctl = run.ctl[u.key] = { stop: false }, st = run.stats[u.key] = { total: N, done: 0, ok: 0, bad: 0, err: 0, status: 'validation' };
    await workPhase(u, orders.map((o, i) => ({ id: i + 1, o })), st, ctl, t => acesTrial(u, t.id, prods, acesRunId('validation'), R.validation.trials, t.o, ctl));
    const v = Object.values(R.validation.trials); R.validation.n = v.length; R.validation.hit = v.filter(x => x.choice === dominant).length; st.status = 'validation done';
    log(`${u.label}: picked ${dominant} in ${R.validation.hit}/${R.validation.n} trials ${R.validation.hit === R.validation.n && R.validation.n ? '✓ PASS' : '✕ CHECK before the real run'}`); }));
  clearInterval(tick); run.active = false; $('startAll').disabled = false; $('runValidation').disabled = false; $('pauseAll').disabled = true; $('stopAll').disabled = true; save(); renderProgress(); }

// ---------- analysis: locked prediction vs storefront, read-back, position model ----------
function acesClogit(rows, P) { const cols = +S.tasks.cols || 5, ids = P.map(p => p.name);
  const sets = rows.filter(x => x.choice && x.order).map(x => ({ chosen: x.choice, alts: x.order.split(' | ').map((id, i) => ({ id, row: Math.floor(i / cols) + 1, col: i % cols + 1 })) }));
  if (sets.length < 10) return null;
  const nRows = Math.max(...sets.flatMap(s => s.alts.map(a => a.row))), chosen = new Set(sets.map(s => s.chosen)), keepIds = ids.filter(i => chosen.has(i));
  if (keepIds.length < 2) return { error: 'Only one product was ever chosen, so there is nothing to compare.', never: ids.filter(i => !chosen.has(i)) };
  // Reference categories as in v6: first chosen product, bottom row, last column. Never-chosen products are dropped (as in ACES).
  const vars = [...keepIds.slice(1).map(i => 'fe_' + i), ...Array.from({ length: nRows - 1 }, (_, r) => 'row_' + (r + 1)), ...Array.from({ length: cols - 1 }, (_, c) => 'col_' + (c + 1))];
  const X = s => s.alts.filter(a => chosen.has(a.id)).map(a => ({ id: a.id, x: vars.map(v => v.startsWith('fe_') ? +(a.id === v.slice(3)) : v.startsWith('row_') ? +(a.row === +v.slice(4)) : +(a.col === +v.slice(4))) }));
  const D = sets.map(s => ({ chosen: s.chosen, alts: X(s) })), k = vars.length; let b = new Array(k).fill(0), ll = -Infinity, H;
  const step = () => { const g = new Array(k).fill(0); H = Array.from({ length: k }, () => new Array(k).fill(0)); let L = 0;
    D.forEach(s => { const eta = s.alts.map(a => a.x.reduce((t, v, j) => t + v * b[j], 0)), mx = Math.max(...eta), ex = eta.map(e => Math.exp(e - mx)), Z = ex.reduce((x, y) => x + y, 0), pr = ex.map(e => e / Z);
      const ci = s.alts.findIndex(a => a.id === s.chosen); L += Math.log(pr[ci]); const xb = new Array(k).fill(0); s.alts.forEach((a, i) => a.x.forEach((v, j) => xb[j] += pr[i] * v));
      s.alts[ci].x.forEach((v, j) => g[j] += v - xb[j]); s.alts.forEach((a, i) => { for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) H[j][l] += pr[i] * (a.x[j] - xb[j]) * (a.x[l] - xb[l]); }); });
    return { g, L }; };
  for (let it = 0; it < 100; it++) { const { g, L } = step(); const Hi = E.inv ? E.inv(H) : invMat(H); if (!Hi) return { error: 'Position model could not be estimated (a product or position is perfectly predictive).' };
    b = b.map((v, j) => v + Hi[j].reduce((t, h, l) => t + h * g[l], 0)); if (Math.abs(L - ll) < 1e-10) { ll = L; break; } ll = L; }
  step(); const V = invMat(H), ll0 = D.reduce((t, s) => t + Math.log(1 / s.alts.length), 0);
  const terms = vars.map((v, j) => { const se = V ? Math.sqrt(V[j][j]) : NaN, z = b[j] / se; return { term: v, B: b[j], SE: se, z, p: 2 * (1 - normCdfV5(Math.abs(z))), OR: Math.exp(b[j]) }; });
  return { terms, n: D.length, ll, ll0, r2: 1 - ll / ll0, ref: `${keepIds[0]}, bottom row, last column`, never: ids.filter(i => !chosen.has(i)) }; }
function invMat(M) { const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (Math.abs(A[p][c]) < 1e-12) return null; [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= d; for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; } }
  return A.map(r => r.slice(n)); }
function normCdfV5(x) { const t = 1 / (1 + 0.2316419 * x), d = 0.3989423 * Math.exp(-x * x / 2); return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); }
function acesAnalyse(u, out, R, P) {
  if (R.lock && out.share) { const pred = P.map(p => (R.lock.predicted.find(x => x.product === p.name) || {}).share ?? 0); out.lockedPred = pred; out.rhoLocked = E.spearman(pred, out.share);
    out.maeLocked = pred.reduce((t, v, i) => t + Math.abs(v - out.share[i]), 0) / pred.length; out.topPred = P[pred.indexOf(Math.max(...pred))].name; out.topObs = P[out.share.indexOf(Math.max(...out.share))].name; }
  else if (R.lock) out.lockedPred = P.map(p => (R.lock.predicted.find(x => x.product === p.name) || {}).share ?? 0);
  out.lock = R.lock || null;
  const all = Object.values(R.store || {});
  if (all.length && all.some(x => 'cart_ok' in x)) { out.aces = true; out.sfTrials = all.length; out.sfValid = all.filter(x => x.choice).length; out.cartOK = all.filter(x => x.cart_ok).length; out.searched = all.filter(x => x.searched).length;
    const rc = all.filter(x => x.choice && x.misreads === 0); out.readCorrect = rc.length; out.shareCorrect = P.map(p => rc.length ? rc.filter(x => x.choice === p.name).length / rc.length : 0);
    if (out.lockedPred && rc.length) out.rhoLockedCorrect = E.spearman(out.lockedPred, out.shareCorrect);
    const f = {}; all.forEach(x => (x.misread_detail || '').split('; ').filter(Boolean).forEach(k => f[k] = (f[k] || 0) + 1)); out.misreadFields = f;
    out.clogit = acesClogit(all, P);
    const c = all.reduce((t, x) => t + (x.cost || 0), 0); out.sfCost = c; out.sfCostPer = all.length ? c / all.length : 0; }
  if (R.validation && R.validation.n) out.validation = { dominant: R.validation.dominant, hit: R.validation.hit, n: R.validation.n }; }
function acesResultsHTML(a) { if (!a.lock && !a.aces && !a.validation) return ''; const P = S.val.products; let h = '';
  if (a.validation) h += `<p><b>Validation check:</b> picked the dominant product (${esc(a.validation.dominant)}) in ${a.validation.hit}/${a.validation.n} trials <span class="pill ${a.validation.hit === a.validation.n ? '' : 'warn'}">${a.validation.hit === a.validation.n ? 'pass' : 'check'}</span></p>`;
  if (a.lock) h += `<h3>Locked conjoint prediction vs ACES storefront</h3><p class="hint">Prediction locked ${new Date(a.lock.at).toLocaleString()} from ${a.lock.n} conjoint answers, before any storefront trial. SHA-256 <code>${esc(a.lock.hash)}</code>. Predicted share = multinomial logit on each product's conjoint utility (constant left out).</p>`;
  if (a.aces) h += `<div class="stats">${[['Locked prediction vs storefront (ρ)', a.rhoLocked], ['Same, chosen card read correctly (ρ)', a.rhoLockedCorrect]].map(([k, v]) => `<div class="stat"><b>${v == null || isNaN(v) ? '—' : v.toFixed(2)}</b><span>${k}</span></div>`).join('')}
      <div class="stat"><b>${a.maeLocked == null ? '—' : (100 * a.maeLocked).toFixed(1) + ' pts'}</b><span>mean gap between predicted and actual share</span></div>
      <div class="stat"><b>${a.topPred ? esc(a.topPred) + ' / ' + esc(a.topObs) : '—'}</b><span>top pick: predicted / actual</span></div>
      <div class="stat"><b>${a.sfValid}/${a.sfTrials}</b><span>valid add_to_cart choices</span></div>
      <div class="stat"><b>${a.cartOK}/${a.sfValid}</b><span>Add to Cart clicks registered</span></div>
      <div class="stat"><b>${a.sfValid ? (100 * (a.sfValid - a.readCorrect) / a.sfValid).toFixed(0) + '%' : '—'}</b><span>choices with a misread field</span></div>
      <div class="stat"><b>$${(a.sfCostPer || 0).toFixed(4)}</b><span>cost per storefront trial</span></div></div>`;
  if (a.lockedPred) h += `<table><tr><th>Product</th><th class="num">Predicted share (locked)</th>${a.share ? '<th class="num">Storefront share</th><th class="num">Share, read correctly</th>' : ''}</tr>${P.map((p, i) => `<tr><td>${esc(p.name)} <small class="mute">${esc(p.display['Brand and model'] || '')}</small></td><td class="num">${(100 * a.lockedPred[i]).toFixed(1)}%</td>${a.share ? `<td class="num">${(100 * a.share[i]).toFixed(1)}%</td><td class="num">${a.shareCorrect ? (100 * a.shareCorrect[i]).toFixed(1) + '%' : ''}</td>` : ''}</tr>`).join('')}</table>`;
  if (a.misreadFields && Object.keys(a.misreadFields).length) h += `<p class="hint">Misread fields: ${Object.entries(a.misreadFields).map(([k, v]) => esc(k) + ' ' + v).join(' · ')}</p>`;
  if (a.clogit) h += a.clogit.error ? `<p class="hint">${esc(a.clogit.error)}</p>` : `<h3>Conditional logit (ACES Eq. 5.1): product effects + position</h3><p class="hint">${a.clogit.n} choices · reference: ${esc(a.clogit.ref)} · McFadden pseudo-R² ${fmt(a.clogit.r2)}${a.clogit.never.length ? ' · never chosen (left out): ' + esc(a.clogit.never.join(', ')) : ''}</p><table><tr><th>Term</th><th class="num">B</th><th class="num">S.E.</th><th class="num">z</th><th class="num">Sig.</th><th class="num">Odds ratio</th></tr>${a.clogit.terms.map(t => `<tr class="${t.p < .05 ? 'sig' : ''}"><td>${esc(t.term)}</td><td class="num">${fmt(t.B)}</td><td class="num">${fmt(t.SE)}</td><td class="num">${fmt(t.z, 2)}</td><td class="num">${fmtP(t.p)}</td><td class="num">${fmt(t.OR)}</td></tr>`).join('')}</table>`;
  return h; }

// ---------- prompts page preview ----------
function acesPreviewHTML() { const P = S.val.products;
  return `<h3>C. ACES storefront · system message</h3><div class="preview">${esc(ACES_SYSTEM)}</div><h3>C. ACES storefront · user message (with the screenshot)</h3><div class="preview">${esc(acesPrompt())}</div>
    <h3>C. ACES storefront · add_to_cart tool</h3><div class="preview">${esc(JSON.stringify(acesTool(P, null), null, 1))}</div>
    <p class="hint">Each trial: Selenium opens the store's search page, types "${esc((S.aces || ACES_DEFAULTS()).query)}" and presses Enter, screenshots the 1280×1080 results page, sends it with the messages above (temperature ${(S.aces || ACES_DEFAULTS()).temperature ?? 'default'}, image detail ${(S.aces || ACES_DEFAULTS()).detail}), then clicks Add to Cart on the chosen product and checks the cart. Positions follow random Latin squares.</p>
    <button class="b sec" onclick="acesPreviewShot()">Show trial 1 screenshot (needs the helper)</button><div id="acesShot" style="margin-top:8px"></div>`; }
async function acesPreviewShot() { const el = $('acesShot'); el.innerHTML = '<p class="hint">Opening the store in headless Chrome…</p>';
  try { if (!(await helperOK())) throw new Error('Start the helper first:  python aces_helper.py'); await acesPrepare('preview', S.val.products);
    const s = await helperPost('/api/aces/screenshot', { run: acesRunId('preview'), trial: 1, order: acesOrder(1), search: true });
    el.innerHTML = `<p class="hint">${esc(s.url)} · window ${s.window.join('×')} · grid ends at ${s.grid_bottom}px · typed search: ${s.searched ? 'yes' : 'no'}</p><img src="${s.png}" style="max-width:100%;border:1px solid #ddd">`; }
  catch (e) { el.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; } }

// ---------- settings for v5 ----------
function syncV5() { const d = DEFAULT().settings; Object.keys(d).forEach(k => { if (S.settings[k] === undefined) S.settings[k] = d[k]; });
  if (S.tasks.storeMode === 'aces' && !S.aces) S.aces = ACES_DEFAULTS();
  ['pilotPairs', 'pilotRanks', 'pilotTrials', 'spendCap'].forEach(id => { $(id).value = S.settings[id]; $(id).oninput = e => { S.settings[id] = +e.target.value; save(); }; });
  $('runSize').value = S.settings.runSize; $('runSize').onchange = e => { S.settings.runSize = e.target.value; save(); renderProgress(); };
  $('reasoning').value = S.settings.reasoning ?? ''; $('reasoning').onchange = e => { S.settings.reasoning = e.target.value; save(); };
  $('runValidation').onclick = runValidation; }
setInterval(() => { const el = $('spendLine'); if (el) el.textContent = `Spent so far (reported by OpenRouter): $${spent().toFixed(3)}${+S.settings.spendCap > 0 ? ` of the $${(+S.settings.spendCap).toFixed(2)} cap` : ''}.`; }, 1500);
setTimeout(helperOK, 300);
