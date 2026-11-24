/* LLM Conjoint Lab — interface, runner and API adapters. */
(function () {
'use strict';
const C = window.LabCore;
const VERSION = 'v4.0';
const $ = id => document.getElementById(id);
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const f3 = v => (v === undefined || v === null || !isFinite(v)) ? '' : Number(v).toFixed(3);
const f5 = v => (v === undefined || v === null || !isFinite(v)) ? '' : Number(v).toFixed(5);
const pct = v => (v === undefined || v === null || !isFinite(v)) ? '' : (100 * v).toFixed(1) + '%';
const pfmt = p => !isFinite(p) ? '' : p < .001 ? '< .001' : p.toFixed(3).replace(/^0/, '');

// ---------- Project state ----------
let P = null; // project
function newProject() {
  return { version: VERSION, studies: [clone(window.LAB_PRESET)], current: 0, models: defaultModels(), results: {}, locks: {}, settings: { concurrency: 6 } };
}
function defaultModels() {
  const slots = [];
  ['OpenAI', 'Anthropic', 'Google'].forEach(pv => ['small', 'mid', 'frontier'].forEach(t => slots.push({ uid: pv[0] + t[0] + Math.random().toString(36).slice(2, 6), label: pv + ' ' + t, provider: 'openrouter', model: '', tier: t, vision: true, enabled: false })));
  return slots;
}
const study = () => P.studies[P.current];
const studyKey = () => study().name + '#' + study().seed;
function resFor(m, cond) {
  const k = studyKey(); P.results[k] = P.results[k] || {};
  const mk = m.uid; P.results[k][mk] = P.results[k][mk] || {};
  const r = P.results[k][mk][cond] = P.results[k][mk][cond] || { conjoint: {}, ranking: {}, storefront: {}, validation: {}, prediction: null };
  return r;
}
function hasResults() { const r = P.results[studyKey()]; return r && Object.values(r).some(m => Object.values(m).some(c => Object.keys(c.conjoint).length || Object.keys(c.storefront).length || Object.keys(c.ranking).length)); }

// ---------- Persistence (IndexedDB; keys kept apart) ----------
const DB = { db: null };
function idb() {
  return new Promise(res => {
    try {
      const rq = indexedDB.open('llm-conjoint-lab', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => { DB.db = rq.result; res(true); };
      rq.onerror = () => res(false);
    } catch (e) { res(false); }
  });
}
function idbGet(k) { return new Promise(res => { try { const t = DB.db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => res(null); } catch (e) { res(null); } }); }
function idbSet(k, v) { return new Promise(res => { try { const t = DB.db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(true); t.onerror = () => res(false); } catch (e) { res(false); } }); }
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (DB.db) idbSet('project', JSON.stringify(P)); }, 800); }
function keys() { return { openrouter: $('key_openrouter').value.trim(), openai: $('key_openai').value.trim(), anthropic: $('key_anthropic').value.trim(), google: $('key_google').value.trim() }; }
function saveKeys() { if ($('rememberKeys').checked && DB.db) idbSet('keys', JSON.stringify(keys())); else if (DB.db) idbSet('keys', ''); }

// ---------- Navigation ----------
const pages = [...document.querySelectorAll('section.page')];
let pageIx = 0;
function go(i) {
  pageIx = Math.max(0, Math.min(pages.length - 1, i));
  pages.forEach((p, j) => p.classList.toggle('on', j === pageIx));
  [...$('nav').children].forEach((b, j) => b.classList.toggle('on', j === pageIx));
  $('back').disabled = pageIx === 0; $('next').disabled = pageIx === pages.length - 1;
  const name = pages[pageIx].dataset.page;
  if (name === 'products') { renderProducts(); drawCardPreview(); }
  if (name === 'design') { renderDesign(); }
  if (name === 'run') renderProgress();
  if (name === 'results') renderResultsPickers();
  if (name === 'compare') renderCompare();
  window.scrollTo(0, 0);
}
pages.forEach((p, i) => { const b = document.createElement('button'); b.textContent = p.dataset.title; b.onclick = () => go(i); $('nav').appendChild(b); });
$('back').onclick = () => go(pageIx - 1); $('next').onclick = () => go(pageIx + 1);

// ---------- Logging ----------
function log(msg) { const el = $('log'); const t = new Date().toLocaleTimeString(); el.textContent += '[' + t + '] ' + msg + '\n'; el.scrollTop = el.scrollHeight; }

// ---------- Page 1: models ----------
const PROVIDERS = ['openrouter', 'openai', 'anthropic', 'google', 'sim'];
function renderModels() {
  const t = $('modelTable');
  t.innerHTML = '<tr><th>Use</th><th>Label</th><th>Provider</th><th>Model ID</th><th>Tier</th><th>Vision <span class="tip" data-tip="Ticked: the storefront is sent as a screenshot. Unticked: the same page is sent as text.">i</span></th><th></th></tr>' +
    P.models.map((m, i) => '<tr data-i="' + i + '"><td><input type="checkbox" data-f="enabled" ' + (m.enabled ? 'checked' : '') + '></td>' +
      '<td><input type="text" data-f="label" value="' + esc(m.label) + '"></td>' +
      '<td><select data-f="provider">' + PROVIDERS.map(p => '<option ' + (p === m.provider ? 'selected' : '') + '>' + p + '</option>').join('') + '</select></td>' +
      '<td><input type="text" data-f="model" list="orModels" value="' + esc(m.model) + '" placeholder="' + (m.provider === 'sim' ? 'any name' : 'e.g. provider/model-name') + '"></td>' +
      '<td><select data-f="tier">' + ['small', 'mid', 'frontier', 'other'].map(p => '<option ' + (p === m.tier ? 'selected' : '') + '>' + p + '</option>').join('') + '</select></td>' +
      '<td><input type="checkbox" data-f="vision" ' + (m.vision ? 'checked' : '') + '></td>' +
      '<td><button class="btn" data-del="' + i + '">✕</button></td></tr>').join('');
  t.querySelectorAll('input,select').forEach(el => el.onchange = () => {
    const m = P.models[+el.closest('tr').dataset.i], f = el.dataset.f;
    m[f] = el.type === 'checkbox' ? el.checked : el.value; save(); if (f === 'provider') renderModels();
  });
  t.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { P.models.splice(+b.dataset.del, 1); save(); renderModels(); });
}
$('addModel').onclick = () => { P.models.push({ uid: 'm' + Date.now().toString(36), label: 'New model', provider: 'openrouter', model: '', tier: 'other', vision: true, enabled: true }); save(); renderModels(); };
$('addSims').onclick = () => { ['sim-alpha', 'sim-beta', 'sim-gamma'].forEach(n => P.models.push({ uid: n + Date.now().toString(36), label: n, provider: 'sim', model: n, tier: 'other', vision: true, enabled: true })); save(); renderModels(); };
$('fetchModels').onclick = async () => {
  $('fetchStatus').textContent = 'Fetching…';
  try {
    const r = await fetch('https://openrouter.ai/api/v1/models'); const j = await r.json();
    const list = j.data.map(m => ({ id: m.id, vision: ((m.architecture && m.architecture.input_modalities) || []).includes('image'), tools: (m.supported_parameters || []).includes('tools'), p: m.pricing || {} }));
    $('orModels').innerHTML = list.map(m => '<option value="' + esc(m.id) + '">' + esc(m.id) + (m.vision ? ' · vision' : '') + (m.tools ? ' · tools' : ' · NO tools') + ' · $' + (Number(m.p.prompt || 0) * 1e6).toFixed(2) + '/$' + (Number(m.p.completion || 0) * 1e6).toFixed(2) + ' per M</option>').join('');
    window.OR_LIST = list;
    $('fetchStatus').textContent = list.length + ' models loaded. Start typing in a Model ID box to pick one.';
  } catch (e) { $('fetchStatus').textContent = 'Could not fetch the list: ' + e.message; }
};
['key_openrouter', 'key_openai', 'key_anthropic', 'key_google', 'rememberKeys'].forEach(id => $(id).addEventListener('change', saveKeys));
$('concurrency').onchange = () => { P.settings.concurrency = Math.max(1, +$('concurrency').value || 6); save(); };

// ---------- Page 2: study ----------
function lockedNote() {
  const on = hasResults();
  $('lockNote').innerHTML = on ? '<div class="notice">This study already has results. Changing attributes, levels, products or the seed would change the design, so make a <b>Duplicate</b> first and edit the copy.</div>' : '';
  document.querySelectorAll('#attrTable input,#attrTable select,#prodTable input,#s_seed').forEach(el => { el.disabled = on; });
}
function renderStudyPick() {
  $('studyPick').innerHTML = P.studies.map((s, i) => '<option value="' + i + '" ' + (i === P.current ? 'selected' : '') + '>' + esc(s.name) + '</option>').join('');
}
function renderStudy() {
  const s = study();
  renderStudyPick();
  $('s_name').value = s.name; $('s_category').value = s.category; $('s_plural').value = s.categoryPlural || ''; $('s_seed').value = s.seed;
  const t = $('attrTable');
  t.innerHTML = '<tr><th>Name</th><th>Type</th><th>Levels (comma separated; categorical: reference first)</th><th>Display <span class="tip" data-tip="How a continuous value is written, with {v} for the number, e.g. ${v} or Up to {v} weeks.">i</span></th><th>Better</th><th></th></tr>' +
    s.attributes.map((a, i) => '<tr data-i="' + i + '"><td><input type="text" data-f="name" value="' + esc(a.name) + '"></td>' +
      '<td><select data-f="type"><option ' + (a.type === 'continuous' ? 'selected' : '') + '>continuous</option><option ' + (a.type === 'categorical' ? 'selected' : '') + '>categorical</option></select></td>' +
      '<td><input type="text" data-f="levels" value="' + esc(a.levels.join(', ')) + '"></td>' +
      '<td>' + (a.type === 'continuous' ? '<input type="text" data-f="format" value="' + esc(a.format || '{v}') + '">' : '<span class="muted small">as written</span>') + '</td>' +
      '<td>' + (a.type === 'continuous' ? '<select data-f="better">' + ['', 'higher', 'lower'].map(v => '<option value="' + v + '" ' + ((a.better || '') === v ? 'selected' : '') + '>' + (v || 'no clear direction') + '</option>').join('') + '</select>'
        : '<select data-f="best"><option value="">no clear best</option>' + a.levels.map(l => '<option ' + (a.best === l ? 'selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>') + '</td>' +
      '<td><button class="btn" data-del="' + i + '">✕</button></td></tr>').join('');
  t.querySelectorAll('input,select').forEach(el => el.onchange = () => {
    const a = s.attributes[+el.closest('tr').dataset.i], f = el.dataset.f;
    if (f === 'levels') {
      const parts = el.value.split(',').map(x => x.trim()).filter(x => x !== '');
      a.levels = a.type === 'continuous' ? parts.map(Number).filter(x => isFinite(x)) : parts;
    } else if (f === 'type') { a.type = el.value; if (a.type === 'continuous') a.levels = a.levels.map(Number).filter(isFinite); renderStudy(); }
    else if (f === 'name') { const old = a.key; a.name = el.value; if (!old) a.key = C.spssName(el.value).toLowerCase(); }
    else a[f] = el.value;
    save();
  });
  t.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const a = s.attributes.splice(+b.dataset.del, 1)[0]; s.products.forEach(p => delete p.attrs[a.key]); save(); renderStudy(); });
  const ct = $('condTable');
  ct.innerHTML = '<tr><th>Label</th><th>Temperature (blank = model default)</th><th></th></tr>' + s.conditions.map((c, i) => '<tr data-i="' + i + '"><td><input type="text" data-f="label" value="' + esc(c.label) + '"></td><td><input type="number" step="0.1" data-f="temperature" value="' + (c.temperature === null || c.temperature === undefined ? '' : c.temperature) + '"></td><td>' + (s.conditions.length > 1 ? '<button class="btn" data-del="' + i + '">✕</button>' : '') + '</td></tr>').join('');
  ct.querySelectorAll('input').forEach(el => el.onchange = () => { const c = s.conditions[+el.closest('tr').dataset.i]; if (el.dataset.f === 'temperature') c.temperature = el.value === '' ? null : Number(el.value); else c.label = el.value; save(); });
  ct.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { s.conditions.splice(+b.dataset.del, 1); save(); renderStudy(); });
  lockedNote();
}
$('addAttr').onclick = () => { const k = 'attr' + Date.now().toString(36); study().attributes.push({ key: k, name: 'New attribute', type: 'categorical', levels: ['No', 'Yes'], best: '' }); save(); renderStudy(); };
$('addCond').onclick = () => { study().conditions.push({ label: 'T=' + (study().conditions.length), temperature: 0 }); save(); renderStudy(); };
['s_name', 's_category', 's_plural', 's_seed'].forEach(id => $(id).onchange = () => {
  const s = study(); const v = $(id).value;
  if (id === 's_name') s.name = v; if (id === 's_category') s.category = v; if (id === 's_plural') s.categoryPlural = v; if (id === 's_seed') s.seed = Number(v);
  save(); renderStudyPick();
});
$('studyPick').onchange = () => { P.current = +$('studyPick').value; save(); renderStudy(); };
$('studyNew').onclick = () => { const s = clone(window.LAB_PRESET); s.name = 'New study ' + (P.studies.length + 1); s.attributes = []; s.products = []; s.seed = Math.floor(Math.random() * 1e8); P.studies.push(s); P.current = P.studies.length - 1; save(); renderStudy(); };
$('studyDup').onclick = () => { const s = clone(study()); s.name += ' (copy)'; P.studies.push(s); P.current = P.studies.length - 1; save(); renderStudy(); };
$('studyLoadPreset').onclick = () => { P.studies.push(clone(window.LAB_PRESET)); P.current = P.studies.length - 1; save(); renderStudy(); };

// ---------- Page 3: products ----------
function renderProducts() {
  const s = study(), t = $('prodTable');
  t.innerHTML = '<tr><th>Code</th><th>Name (records only)</th><th>Rating</th><th>Reviews</th>' + s.attributes.map(a => '<th>' + esc(a.name) + '</th>').join('') + '<th></th></tr>' +
    s.products.map((p, i) => '<tr data-i="' + i + '"><td><input type="text" data-f="id" value="' + esc(p.id) + '" style="width:60px"></td><td><input type="text" data-f="name" value="' + esc(p.name) + '"></td>' +
      '<td><input type="number" step="0.1" data-f="rating" value="' + esc(p.rating) + '" style="width:60px"></td><td><input type="number" data-f="reviews" value="' + esc(p.reviews) + '" style="width:70px"></td>' +
      s.attributes.map(a => '<td>' + (a.type === 'categorical' ? '<select data-a="' + a.key + '">' + a.levels.map(l => '<option ' + (String(p.attrs[a.key]) === String(l) ? 'selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>'
        : '<input type="number" step="any" data-a="' + a.key + '" value="' + esc(p.attrs[a.key]) + '" style="width:75px">') + '</td>').join('') +
      '<td><button class="btn" data-del="' + i + '">✕</button></td></tr>').join('');
  t.querySelectorAll('input,select').forEach(el => el.onchange = () => {
    const p = s.products[+el.closest('tr').dataset.i];
    if (el.dataset.a) { const a = s.attributes.find(x => x.key === el.dataset.a); p.attrs[a.key] = a.type === 'continuous' ? Number(el.value) : el.value; }
    else p[el.dataset.f] = (el.dataset.f === 'rating' || el.dataset.f === 'reviews') ? Number(el.value) : el.value;
    save(); drawCardPreview();
  });
  t.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { s.products.splice(+b.dataset.del, 1); save(); renderProducts(); });
  lockedNote();
}
$('addProd').onclick = () => {
  const s = study(), n = s.products.length + 1;
  const attrs = {}; s.attributes.forEach(a => { attrs[a.key] = a.levels[0]; });
  s.products.push({ id: 'P' + String(n).padStart(2, '0'), name: '', rating: 4.5, reviews: 1000, attrs }); save(); renderProducts();
};
$('applyPaste').onclick = () => {
  const s = study(), txt = $('pasteRows').value.trim(); if (!txt) return;
  const lines = txt.split(/\r?\n/).filter(l => l.trim()); const sep = lines[0].includes('\t') ? '\t' : ',';
  const head = lines[0].split(sep).map(h => h.trim().toLowerCase());
  const col = n => head.indexOf(n.toLowerCase());
  const out = lines.slice(1).map((l, i) => {
    const c = l.split(sep).map(x => x.trim());
    const attrs = {};
    s.attributes.forEach(a => { const j = col(a.name) >= 0 ? col(a.name) : col(a.key); let v = j >= 0 ? c[j] : a.levels[0]; if (a.type === 'continuous') v = Number(String(v).replace(/[^0-9.\-]/g, '')); attrs[a.key] = v; });
    return { id: c[col('id')] || ('P' + String(i + 1).padStart(2, '0')), name: col('name') >= 0 ? c[col('name')] : '', rating: col('rating') >= 0 ? Number(c[col('rating')]) : 4.5, reviews: col('reviews') >= 0 ? Number(c[col('reviews')]) : 1000, attrs };
  });
  if (!confirmBox('Replace ' + s.products.length + ' products with ' + out.length + ' pasted rows?')) return;
  s.products = out; save(); renderProducts(); drawCardPreview();
};
function confirmBox(msg) { try { return window.confirm(msg); } catch (e) { return true; } }

// ---------- Card drawing (screenshot mode) ----------
const CARD = { w: 228, h: 318, gap: 14, pad: 16 };
function drawCard(ctx, x, y, s, p) {
  ctx.save();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 1;
  roundRect(ctx, x, y, CARD.w, CARD.h, 8); ctx.fill(); ctx.stroke();
  // code label
  ctx.fillStyle = '#eef1f5'; roundRect(ctx, x + 8, y + 8, 44, 20, 4); ctx.fill();
  ctx.fillStyle = '#333'; ctx.font = '600 12px Arial'; ctx.fillText(p.id, x + 14, y + 22);
  // product image placeholder: a simple e-reader/device outline
  ctx.fillStyle = '#f3f3f3'; ctx.fillRect(x + 64, y + 34, 100, 74);
  ctx.strokeStyle = '#9a9a9a'; ctx.lineWidth = 2; roundRect(ctx, x + 98, y + 40, 32, 62, 4); ctx.stroke();
  ctx.fillStyle = '#e6e6e6'; ctx.fillRect(x + 102, y + 45, 24, 48);
  // title, price, rating
  ctx.fillStyle = '#111'; ctx.font = '13px Arial'; ctx.fillText(s.storefront.cardTitle || s.category, x + 10, y + 128);
  ctx.font = '700 16px Arial'; ctx.fillText('$' + C.productPrice(s, p).toFixed(2), x + 10, y + 149);
  const r = Number(p.rating); let sx = x + 10;
  for (let i = 1; i <= 5; i++) { ctx.fillStyle = r >= i ? '#e8a33d' : (r >= i - 0.5 ? '#f0c987' : '#d6d6d6'); ctx.font = '13px Arial'; ctx.fillText('★', sx, y + 168); sx += 13; }
  ctx.fillStyle = '#555'; ctx.font = '12px Arial'; ctx.fillText(r.toFixed(1) + ' (' + Number(p.reviews).toLocaleString('en-US') + ')', sx + 4, y + 167);
  // attributes (smaller text, as in the earlier storefronts)
  let ly = y + 186; ctx.font = '11.5px Arial'; ctx.fillStyle = '#333';
  C.cardLines(s, p).forEach(l => { wrapText(ctx, l.label + ': ' + l.value, x + 10, ly, CARD.w - 20, 14).forEach(t => { ctx.fillText(t, x + 10, ly); ly += 14; }); });
  // button
  ctx.fillStyle = '#f2c14e'; roundRect(ctx, x + 10, y + CARD.h - 30, CARD.w - 20, 22, 11); ctx.fill();
  ctx.fillStyle = '#111'; ctx.font = '12px Arial'; ctx.textAlign = 'center'; ctx.fillText('Add to cart', x + CARD.w / 2, y + CARD.h - 15); ctx.textAlign = 'left';
  ctx.restore();
}
function wrapText(ctx, text, x, y, maxW) {
  const words = String(text).split(' '), out = []; let line = '';
  words.forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; });
  if (line) out.push(line); return out;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function renderPage(canvas, s, layout) {
  const st = s.storefront;
  canvas.width = CARD.pad * 2 + st.cols * CARD.w + (st.cols - 1) * CARD.gap;
  canvas.height = CARD.pad * 2 + st.rows * CARD.h + (st.rows - 1) * CARD.gap + 30;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#222'; ctx.font = '600 14px Arial'; ctx.fillText('Results', CARD.pad, CARD.pad + 12);
  const byId = Object.fromEntries(s.products.map(p => [p.id, p]));
  layout.forEach(L => drawCard(ctx, CARD.pad + (L.col - 1) * (CARD.w + CARD.gap), CARD.pad + 30 + (L.row - 1) * (CARD.h + CARD.gap), s, byId[L.id]));
  return canvas;
}
function drawCardPreview() {
  const s = study(); if (!s.products.length) return;
  const cv = $('cardPreview'); const st = s.storefront;
  const lay = s.products.slice(0, Math.min(s.products.length, st.cols)).map((p, i) => ({ id: p.id, slot: i + 1, row: 1, col: i + 1 }));
  renderPage(cv, Object.assign({}, s, { storefront: Object.assign({}, st, { rows: 1 }) }), lay);
}

// ---------- Page 4: design ----------
const designFields = [['c_pairs', 'conjoint', 'pairs', 'n'], ['c_counter', 'conjoint', 'counterbalance', 'b'], ['c_prompt', 'conjoint', 'prompt'], ['c_reask', 'conjoint', 'reask'],
  ['r_enabled', 'ranking', 'enabled', 'b'], ['r_repeats', 'ranking', 'repeats', 'n'], ['r_prompt', 'ranking', 'prompt'],
  ['f_trials', 'storefront', 'trials', 'n'], ['f_rows', 'storefront', 'rows', 'n'], ['f_cols', 'storefront', 'cols', 'n'], ['f_title', 'storefront', 'cardTitle'], ['f_readback', 'storefront', 'readback', 'b'],
  ['f_system', 'storefront', 'system'], ['f_prompt', 'storefront', 'prompt'], ['f_textPrompt', 'storefront', 'textPrompt'], ['f_reask', 'storefront', 'reask'], ['v_trials', 'validation', 'trials', 'n']];
function renderDesign() {
  const s = study(); s.validation = s.validation || { trials: 10 };
  designFields.forEach(([id, sec, k, t]) => { const el = $(id); if (t === 'b') el.checked = !!s[sec][k]; else el.value = s[sec][k] === undefined ? '' : s[sec][k]; });
  const tasks = C.makeConjointDesign(s);
  $('c_example').textContent = tasks.length ? C.conjointPrompt(s, tasks[0]) : '(add attributes first)';
  if (s.products.length) renderPage($('pagePreview'), s, C.makeStorefrontDesign(s, 1, 0)[0].layout);
  const nm = P.models.filter(m => m.enabled).length, nc = s.conditions.length;
  const perModel = tasks.length + (s.ranking.enabled ? s.ranking.repeats : 0) + s.storefront.trials;
  $('callEstimate').innerHTML = '<p>Per model and condition: <b>' + tasks.length.toLocaleString() + '</b> conjoint calls' + (s.conjoint.counterbalance ? ' (' + s.conjoint.pairs + ' pairs × 2 orders)' : '') +
    (s.ranking.enabled ? ' + <b>' + s.ranking.repeats + '</b> ranking calls' : '') + ' + <b>' + s.storefront.trials.toLocaleString() + '</b> storefront calls = <b>' + perModel.toLocaleString() + '</b>.</p>' +
    '<p>With <b>' + nm + '</b> models switched on and <b>' + nc + '</b> condition(s): about <b>' + (perModel * nm * nc).toLocaleString() + '</b> calls, plus a few re-asks. Storefront screenshot calls cost the most.</p>';
}
designFields.forEach(([id, sec, k, t]) => { $(id).onchange = () => { const s = study(); const el = $(id); s[sec][k] = t === 'b' ? el.checked : t === 'n' ? Number(el.value) : el.value; save(); renderDesign(); }; });

// ---------- API adapters ----------
class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
async function post(url, headers, body) {
  let r;
  try { r = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body) }); }
  catch (e) { throw new ApiError('Network error: ' + e.message, 0); }
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) { /* not json */ }
  if (!r.ok) throw new ApiError('HTTP ' + r.status + ': ' + (j && (j.error && (j.error.message || j.error)) ? JSON.stringify(j.error.message || j.error).slice(0, 300) : txt.slice(0, 300)), r.status);
  if (j && j.error) throw new ApiError('API error: ' + JSON.stringify(j.error).slice(0, 300), 500);
  return j;
}
function stripSchema(o) { // Gemini rejects some JSON-schema keywords
  if (Array.isArray(o)) return o.map(stripSchema);
  if (o && typeof o === 'object') { const r = {}; Object.keys(o).forEach(k => { if (k !== 'additionalProperties' && k !== 'strict') r[k] = stripSchema(o[k]); }); return r; }
  return o;
}
// req: {system, messages:[{role, text, image}], tool, temperature}
async function callModel(m, req, simCtx) {
  const K = keys();
  if (m.provider === 'sim') return simCtx();
  const temp = req.temperature;
  if (m.provider === 'openrouter' || m.provider === 'openai') {
    const url = m.provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    const key = m.provider === 'openrouter' ? K.openrouter : K.openai; if (!key) throw new ApiError('No ' + m.provider + ' key', 401);
    const msgs = []; if (req.system) msgs.push({ role: 'system', content: req.system });
    req.messages.forEach(x => {
      if (x.role === 'assistant' && x.toolCall) msgs.push({ role: 'assistant', content: x.text || '', tool_calls: [x.toolCall] });
      else msgs.push({ role: x.role, content: x.image ? [{ type: 'text', text: x.text }, { type: 'image_url', image_url: { url: x.image } }] : x.text });
    });
    const body = { model: m.model, messages: msgs };
    if (temp !== null && temp !== undefined) body.temperature = temp;
    if (req.tool) { body.tools = [{ type: 'function', function: req.tool }]; body.tool_choice = 'auto'; }
    const h = { Authorization: 'Bearer ' + key }; if (m.provider === 'openrouter') { h['X-Title'] = 'LLM Conjoint Lab'; }
    const j = await post(url, h, body);
    const msg = (j.choices && j.choices[0] && j.choices[0].message) || {};
    const tc = msg.tool_calls && msg.tool_calls[0];
    let args = null; if (tc) { try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) { args = null; } }
    return { text: typeof msg.content === 'string' ? msg.content : (Array.isArray(msg.content) ? msg.content.map(c => c.text || '').join('') : ''), args, modelReturned: j.model || m.model, usage: j.usage || null };
  }
  if (m.provider === 'anthropic') {
    if (!K.anthropic) throw new ApiError('No Anthropic key', 401);
    const msgs = req.messages.map(x => ({ role: x.role, content: x.image ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: x.image.split(',')[1] } }, { type: 'text', text: x.text }] : x.text }));
    const body = { model: m.model, max_tokens: 2048, messages: msgs };
    if (req.system) body.system = req.system;
    if (temp !== null && temp !== undefined) body.temperature = temp;
    if (req.tool) body.tools = [{ name: req.tool.name, description: req.tool.description, input_schema: req.tool.parameters }];
    const j = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': K.anthropic, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body);
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    const tu = (j.content || []).find(c => c.type === 'tool_use');
    return { text, args: tu ? tu.input : null, modelReturned: j.model || m.model, usage: j.usage || null };
  }
  if (m.provider === 'google') {
    if (!K.google) throw new ApiError('No Google key', 401);
    const contents = req.messages.map(x => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: x.image ? [{ text: x.text }, { inline_data: { mime_type: 'image/png', data: x.image.split(',')[1] } }] : [{ text: x.text }] }));
    const body = { contents };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
    if (temp !== null && temp !== undefined) body.generationConfig = { temperature: temp };
    if (req.tool) body.tools = [{ functionDeclarations: [{ name: req.tool.name, description: req.tool.description, parameters: stripSchema(req.tool.parameters) }] }];
    const j = await post('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(m.model) + ':generateContent?key=' + encodeURIComponent(K.google), {}, body);
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const fc = parts.find(p => p.functionCall);
    return { text: parts.filter(p => p.text).map(p => p.text).join('\n'), args: fc ? fc.functionCall.args : null, modelReturned: j.modelVersion || m.model, usage: j.usageMetadata || null };
  }
  throw new ApiError('Unknown provider ' + m.provider, 400);
}
async function withRetry(fn, label) {
  let wait = 2000;
  for (let a = 1; ; a++) {
    try { return await fn(); }
    catch (e) {
      const retryable = !(e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 408);
      if (!retryable || a >= 4) throw e;
      log(label + ': ' + e.message + ' — retrying in ' + (wait / 1000) + ' s');
      await new Promise(r => setTimeout(r, wait)); wait *= 2;
    }
  }
}

// ---------- Runner ----------
const RUN = { on: false, paused: false, active: 0, waiters: [] };
async function slot() {
  const lim = Math.max(1, P.settings.concurrency || 6);
  while (RUN.active >= lim || RUN.paused) await new Promise(r => RUN.waiters.push(r));
  RUN.active++;
}
function wake() { const w = RUN.waiters.splice(0); w.forEach(r => r()); }
function release() { RUN.active--; wake(); }
async function pool(items, fn) {
  await Promise.all(items.map(async it => { if (!RUN.on) return; await slot(); try { if (RUN.on) await fn(it); } finally { release(); } }));
}
function simRng(m, id) { return C.rng([...(m.model + '|' + id)].reduce((s, c) => (s * 33 + c.charCodeAt(0)) >>> 0, 5381)); }

async function runConjointTask(m, cond, s, task, R) {
  const prompt = C.conjointPrompt(s, task);
  const req = { system: s.conjoint.system || '', temperature: cond.temperature, messages: [{ role: 'user', text: prompt }] };
  const r = simRng(m, task.id);
  const out = await withRetry(() => callModel(m, req, () => ({ text: C.simConjoint(s, task, m.model, r), modelReturned: 'sim:' + m.model })), m.label + ' ' + task.id);
  let choice = C.parseFirstSecond(out.text), reasked = false, text = out.text;
  if (!choice) {
    reasked = true;
    const req2 = { system: req.system, temperature: cond.temperature, messages: [{ role: 'user', text: prompt }, { role: 'assistant', text: out.text || '(no answer)' }, { role: 'user', text: s.conjoint.reask }] };
    const out2 = await withRetry(() => callModel(m, req2, () => ({ text: 'ANSWER: ' + (r() < 0.5 ? 'first' : 'second'), modelReturned: 'sim:' + m.model })), m.label + ' ' + task.id + ' re-ask');
    choice = C.parseFirstSecond(out2.text); text = out.text + '\n--- re-ask ---\n' + out2.text;
  }
  R.conjoint[task.id] = { id: task.id, pair: task.pair, order: task.order, p1: task.p1, p2: task.p2, choice: choice || null, reasked, text, modelReturned: out.modelReturned, usage: out.usage || null, at: new Date().toISOString() };
}
async function runRankingTask(m, cond, s, rep, R) {
  const r0 = C.rng((Number(s.seed) || 1) * 104729 + rep);
  const order = C.shuffle(s.products, r0);
  const prompt = C.rankingPrompt(s, order);
  const ids = s.products.map(p => p.id);
  const r = simRng(m, 'R' + rep);
  const out = await withRetry(() => callModel(m, { system: s.ranking.system || '', temperature: cond.temperature, messages: [{ role: 'user', text: prompt }] }, () => ({ text: C.simRanking(s, m.model, r), modelReturned: 'sim:' + m.model })), m.label + ' ranking ' + rep);
  R.ranking[rep] = { rep, shown: order.map(p => p.id), ranking: C.parseRanking(out.text, ids), text: out.text, modelReturned: out.modelReturned, at: new Date().toISOString() };
}
async function runStorefrontTrial(m, cond, sIn, trial, store, tag) {
  const s = sIn;
  const tool = C.addToCartTool(s);
  const ids = s.products.map(p => p.id);
  const useImage = !!m.vision;
  let userText, image = null;
  if (useImage) { userText = C.storefrontPrompt(s); image = renderPage(document.createElement('canvas'), s, trial.layout).toDataURL('image/png'); }
  else userText = C.fill(s.storefront.textPrompt, { product: s.category, products: s.categoryPlural || s.category + 's', page: C.storefrontText(s, trial.layout) });
  const req = { system: s.storefront.system, temperature: cond.temperature, tool, messages: [{ role: 'user', text: userText, image }] };
  const r = simRng(m, tag + trial.trial);
  const sim = () => { const o = C.simStorefront(s, trial.layout, m.model, r); return { text: o.text, args: o.args, modelReturned: 'sim:' + m.model }; };
  let out = await withRetry(() => callModel(m, req, sim), m.label + ' ' + tag + ' ' + trial.trial);
  let args = out.args && ids.includes(out.args.product_id) ? out.args : C.parseToolArgsFromText(out.text, ids);
  let text = out.text || '', reasked = false;
  if (!args || !ids.includes(args.product_id)) {
    reasked = true;
    const req2 = Object.assign({}, req, { messages: req.messages.concat([{ role: 'assistant', text: out.text || '(no answer)' }, { role: 'user', text: s.storefront.reask }]) });
    const out2 = await withRetry(() => callModel(m, req2, sim), m.label + ' ' + tag + ' ' + trial.trial + ' re-ask');
    args = out2.args && ids.includes(out2.args.product_id) ? out2.args : C.parseToolArgsFromText(out2.text, ids);
    text += '\n--- re-ask ---\n' + (out2.text || '');
  }
  const ok = args && ids.includes(args.product_id);
  const chk = ok ? C.checkReadback(s, args) : { misread: [], n: 0 };
  const L = ok ? trial.layout.find(x => x.id === args.product_id) : null;
  store[trial.trial] = { trial: trial.trial, chosen: ok ? args.product_id : null, slot: L ? L.slot : null, row: L ? L.row : null, col: L ? L.col : null, reported: args || null, misread: chk.misread, nMisread: chk.n, reasked, mode: useImage ? 'screenshot' : 'text', text, modelReturned: out.modelReturned, usage: out.usage || null, at: new Date().toISOString() };
}

function enabledModels() { return P.models.filter(m => m.enabled && m.model); }
function sizes(s) {
  const full = $('runSize').value === 'full';
  const tasks = C.makeConjointDesign(s);
  const perPair = s.conjoint.counterbalance ? 2 : 1;
  return { tasks: full ? tasks : tasks.slice(0, Math.max(1, +$('pilotPairs').value || 20) * perPair), trials: full ? s.storefront.trials : Math.max(1, +$('pilotTrials').value || 10), reps: s.ranking.enabled ? (full ? s.ranking.repeats : Math.min(s.ranking.repeats, 3)) : 0 };
}

async function lockPrediction(m, cond, s, R) {
  const fit = C.fitConjoint(s, Object.values(R.conjoint));
  if (fit.error) { log(m.label + ': prediction not locked — ' + fit.error); return null; }
  const pred = C.predictShares(s, fit.util);
  const payload = JSON.stringify({ model: m.model, condition: cond.label, nAnswers: fit.n, utilities: fit.util, predicted: pred });
  R.prediction = { at: new Date().toISOString(), hash: await C.sha256(payload), nAnswers: fit.n, util: fit.util, predicted: pred, payload };
  log(m.label + ' [' + cond.label + ']: prediction locked from ' + fit.n + ' answers, sha256 ' + R.prediction.hash.slice(0, 12) + '…');
  return R.prediction;
}

async function runModel(m, cond, s, mods, sz) {
  const R = resFor(m, cond.label);
  try {
    const conj = mods.conjoint ? sz.tasks.filter(t => !R.conjoint[t.id]) : [];
    const reps = mods.ranking ? Array.from({ length: sz.reps }, (_, i) => i + 1).filter(i => !R.ranking[i]) : [];
    let done = 0;
    await pool(conj.map(t => ({ k: 'c', t })).concat(reps.map(i => ({ k: 'r', i }))), async it => {
      try { if (it.k === 'c') await runConjointTask(m, cond, s, it.t, R); else await runRankingTask(m, cond, s, it.i, R); }
      catch (e) { if (e.status === 401 || e.status === 403 || e.status === 404) { log(m.label + ': ' + e.message + ' — stopping this model.'); throw e; } log(m.label + ': ' + e.message); }
      if (++done % 10 === 0) { save(); renderProgress(); }
    });
    save(); renderProgress();
    if (mods.storefront && RUN.on) {
      // refit and re-lock if the conjoint has grown since the last lock (e.g. pilot → full)
      const nNow = Object.values(R.conjoint).filter(r => r.choice).length;
      if (!R.prediction || R.prediction.nAnswers !== nNow) await lockPrediction(m, cond, s, R);
      const design = C.makeStorefrontDesign(s, sz.trials, 0).filter(t => !R.storefront[t.trial]);
      let k = 0;
      await pool(design, async t => {
        try { await runStorefrontTrial(m, cond, s, t, R.storefront, 'S'); }
        catch (e) { if (e.status === 401 || e.status === 403 || e.status === 404) { log(m.label + ': ' + e.message + ' — stopping this model.'); throw e; } log(m.label + ': ' + e.message); }
        if (++k % 5 === 0) { save(); renderProgress(); }
      });
    }
  } catch (e) { log(m.label + ': stopped (' + e.message + ')'); }
  save(); renderProgress();
}

function setRunning(on) { RUN.on = on; $('runAll').disabled = on; $('runValidate').disabled = on; $('pauseRun').disabled = !on; $('pauseRun').textContent = 'Pause'; RUN.paused = false; }
$('pauseRun').onclick = () => { RUN.paused = !RUN.paused; $('pauseRun').textContent = RUN.paused ? 'Resume' : 'Pause'; if (!RUN.paused) wake(); log(RUN.paused ? 'Paused (calls already sent will finish).' : 'Resumed.'); };
$('runAll').onclick = async () => {
  const s = study(), ms = enabledModels();
  if (!ms.length) { log('Switch on at least one model with a model ID (page 1).'); return; }
  if (!s.attributes.length || s.products.length < 2) { log('The study needs attributes and at least 2 products.'); return; }
  const mods = { conjoint: $('m_conjoint').checked, ranking: $('m_ranking').checked, storefront: $('m_storefront').checked };
  const sz = sizes(s);
  log('Starting ' + ($('runSize').value) + ' run: ' + ms.length + ' model(s) × ' + s.conditions.length + ' condition(s); ' + sz.tasks.length + ' conjoint tasks, ' + sz.reps + ' ranking repeats, ' + sz.trials + ' storefront trials each.');
  setRunning(true);
  await Promise.all(ms.flatMap(m => s.conditions.map(c => runModel(m, c, s, mods, sz))));
  setRunning(false); log('Run finished.'); renderProgress();
};
// Extreme-condition validation: product 1 is best on every attribute with a clear direction,
// the others are worst on those attributes; attributes without a direction are identical.
function validationStudy(s) {
  const v = clone(s);
  const best = {}, worst = {};
  s.attributes.forEach(a => {
    if (a.type === 'continuous' && a.better) { const L = a.levels.map(Number); best[a.key] = a.better === 'higher' ? Math.max(...L) : Math.min(...L); worst[a.key] = a.better === 'higher' ? Math.min(...L) : Math.max(...L); }
    else if (a.type === 'categorical' && a.best) { best[a.key] = a.best; worst[a.key] = a.levels.find(l => l !== a.best); }
    else { best[a.key] = worst[a.key] = s.products[0].attrs[a.key]; }
  });
  v.products = s.products.map((p, i) => Object.assign({}, p, { attrs: Object.assign({}, p.attrs, i === 0 ? best : worst) }));
  return { v, dominant: s.products[0].id };
}
$('runValidate').onclick = async () => {
  const s = study(), ms = enabledModels(); if (!ms.length) { log('Switch on at least one model first.'); return; }
  const { v, dominant } = validationStudy(s);
  const n = (s.validation && s.validation.trials) || 10;
  const design = C.makeStorefrontDesign(v, n, 99991);
  log('Validation check: ' + dominant + ' is best on every attribute with a clear direction. ' + n + ' trials per model.');
  setRunning(true);
  await Promise.all(ms.flatMap(m => s.conditions.map(async c => {
    const R = resFor(m, c.label); R.validation = { dominant, trials: {} };
    await pool(design, async t => { try { await runStorefrontTrial(m, c, v, t, R.validation.trials, 'V'); } catch (e) { log(m.label + ' validation: ' + e.message); } });
    const rows = Object.values(R.validation.trials), hit = rows.filter(r => r.chosen === dominant).length;
    log(m.label + ' [' + c.label + ']: picked the dominant product ' + hit + '/' + rows.length + (hit === rows.length && rows.length ? ' — PASS' : ' — CHECK'));
    save();
  })));
  setRunning(false); renderProgress();
};
$('clearResults').onclick = () => {
  if (!confirmBox('Delete all results for "' + study().name + '"? Save a project file first if you may need them.')) return;
  delete P.results[studyKey()]; save(); renderProgress(); log('Results cleared for this study.');
};

function renderProgress() {
  const s = study(), sz = (() => { try { return sizes(s); } catch (e) { return null; } })();
  const ms = P.models.filter(m => m.enabled && m.model);
  const rows = [];
  ms.forEach(m => s.conditions.forEach(c => {
    const R = resFor(m, c.label);
    const cj = Object.values(R.conjoint), ok = cj.filter(r => r.choice).length, sf = Object.values(R.storefront);
    const val = R.validation && R.validation.trials ? Object.values(R.validation.trials) : [];
    const vhit = val.filter(r => r.chosen === R.validation.dominant).length;
    const tgtC = sz ? sz.tasks.length : 0, tgtS = sz ? sz.trials : 0;
    rows.push('<tr><td>' + esc(m.label) + '<div class="muted small">' + esc(m.model) + '</div></td><td>' + esc(c.label) + '</td>' +
      '<td>' + (val.length ? '<span class="pill ' + (vhit === val.length ? 'good' : 'bad') + '">' + vhit + '/' + val.length + '</span>' : '<span class="muted">—</span>') + '</td>' +
      '<td style="min-width:150px">' + cj.length + ' / ' + tgtC + ' <span class="muted small">(' + (cj.length - ok) + ' missing)</span><div class="bar"><i style="width:' + Math.min(100, tgtC ? 100 * cj.length / tgtC : 0) + '%"></i></div></td>' +
      '<td>' + Object.keys(R.ranking).length + '</td>' +
      '<td>' + (R.prediction ? '<span class="pill good" title="' + esc(R.prediction.hash) + '">locked ' + new Date(R.prediction.at).toLocaleString() + '</span>' : '<span class="muted">—</span>') + '</td>' +
      '<td style="min-width:150px">' + sf.length + ' / ' + tgtS + '<div class="bar"><i style="width:' + Math.min(100, tgtS ? 100 * sf.length / tgtS : 0) + '%"></i></div></td></tr>');
  }));
  $('progress').innerHTML = '<tr><th>Model</th><th>Condition</th><th>Validation</th><th>Conjoint answers</th><th>Rankings</th><th>Prediction</th><th>Storefront trials</th></tr>' + (rows.join('') || '<tr><td colspan="7" class="muted">Switch on models with IDs on page 1.</td></tr>');
}

// ---------- Results ----------
function modelsWithResults() { const r = P.results[studyKey()] || {}; return P.models.filter(m => r[m.uid]); }
function renderResultsPickers() {
  const ms = modelsWithResults();
  $('resModel').innerHTML = ms.map(m => '<option value="' + m.uid + '">' + esc(m.label) + '</option>').join('');
  $('resCond').innerHTML = study().conditions.map(c => '<option>' + esc(c.label) + '</option>').join('');
  renderResults();
}
$('resModel').onchange = renderResults; $('resCond').onchange = renderResults;
function analyse(m, condLabel) {
  const s = study(), R = resFor(m, condLabel);
  const rows = Object.values(R.conjoint);
  const fit = C.fitConjoint(s, rows);
  const pred = fit.error ? null : C.predictShares(s, fit.util);
  const rk = Object.values(R.ranking).filter(x => x.ranking);
  let meanRank = null, rhoRank = null;
  if (rk.length) {
    meanRank = s.products.map(p => rk.reduce((a, x) => a + x.ranking.indexOf(p.id) + 1, 0) / rk.length);
    if (pred) rhoRank = C.spearman(pred.map(x => x.rank), meanRank);
  }
  const sf = Object.values(R.storefront);
  const sum = sf.length ? C.storefrontSummary(s, sf) : null;
  const locked = R.prediction;
  let match = null;
  if (sum && locked && sum.n) {
    const ps = locked.predicted.map(x => x.share), os = sum.shares.map(x => x.share);
    const topP = locked.predicted.slice().sort((a, b) => b.share - a.share)[0].id, topO = sum.shares.slice().sort((a, b) => b.share - a.share)[0].id;
    match = { rho: C.spearman(ps, os), mae: ps.reduce((a, v, i) => a + Math.abs(v - os[i]), 0) / ps.length, topP, topO, topMatch: topP === topO };
  }
  let cl = null;
  if (sf.length >= 10) { const dbt = Object.fromEntries(C.makeStorefrontDesign(s, Math.max(...sf.map(r => r.trial)), 0).map(t => [t.trial, t.layout])); cl = C.clogit(s, sf, dbt); }
  return { s, R, fit, pred, meanRank, rhoRank, nRank: rk.length, sum, locked, match, cl };
}
function renderResults() {
  const m = P.models.find(x => x.uid === $('resModel').value); const body = $('resBody');
  if (!m) { body.innerHTML = '<div class="card muted">No results yet.</div>'; return; }
  const A = analyse(m, $('resCond').value), s = A.s;
  let h = '';
  if (A.fit.error) h += '<div class="card"><h2>A. Conjoint</h2><p class="muted">' + esc(A.fit.error) + '</p></div>';
  else {
    const f = A.fit;
    h += '<div class="card"><h2>A. Conjoint — binary logistic regression on Product 1 − Product 2</h2><p class="small muted">' + f.n + ' valid answers, ' + f.nMissing + ' missing. Chose the first product ' + pct(f.firstShare) + ' of the time (p ' + pfmt(f.firstShareP) + ' vs 50%). Nagelkerke R² ' + f3(f.nagelkerke) + '.</p>' +
      '<table><tr><th>Term</th><th class="num">B</th><th class="num">SE</th><th class="num">z</th><th class="num">p</th><th class="num">Exp(B)</th></tr>' +
      f.terms.map(t => '<tr><td>' + esc(t.name) + '</td><td class="num">' + f5(t.b) + '</td><td class="num">' + f5(t.se) + '</td><td class="num">' + f3(t.z) + '</td><td class="num ' + (t.p < .05 ? 'sig' : '') + '">' + pfmt(t.p) + '</td><td class="num">' + f3(Math.exp(t.b)) + '</td></tr>').join('') + '</table>' +
      '<h3>Relative importance (utility-range method)</h3><table>' + s.attributes.slice().sort((a, b) => f.importance[b.key] - f.importance[a.key]).map(a => '<tr><td style="width:200px">' + esc(a.name) + '</td><td><div class="bar"><i style="width:' + (100 * f.importance[a.key]).toFixed(1) + '%"></i></div></td><td class="num" style="width:70px">' + pct(f.importance[a.key]) + '</td></tr>').join('') + '</table></div>';
  }
  if (A.pred) {
    const byId = Object.fromEntries(s.products.map(p => [p.id, p]));
    const L = A.locked ? Object.fromEntries(A.locked.predicted.map(x => [x.id, x])) : null;
    const O = A.sum ? Object.fromEntries(A.sum.shares.map(x => [x.id, x])) : null;
    h += '<div class="card"><h2>B–C. Prediction vs ranking vs storefront</h2>' +
      (A.locked ? '<p class="small">Prediction locked ' + new Date(A.locked.at).toLocaleString() + ' from ' + A.locked.nAnswers + ' answers. SHA-256 <code>' + esc(A.locked.hash) + '</code></p>' : '<p class="small muted">Prediction not locked yet (it locks before the storefront runs).</p>') +
      '<table><tr><th>Code</th><th>Product</th><th class="num">Utility</th><th class="num">Predicted rank</th><th class="num">Predicted share (locked)</th><th class="num">Mean rank (ranking task)</th><th class="num">Storefront share</th><th class="num">95% CI</th></tr>' +
      s.products.map((p, i) => '<tr><td>' + p.id + '</td><td>' + esc(byId[p.id].name) + '</td><td class="num">' + f3(A.pred[i].utility) + '</td><td class="num">' + A.pred[i].rank + '</td><td class="num">' + (L ? pct(L[p.id].share) : '') + '</td><td class="num">' + (A.meanRank ? A.meanRank[i].toFixed(2) : '') + '</td><td class="num">' + (O ? pct(O[p.id].share) + ' <span class="muted small">(' + O[p.id].k + ')</span>' : '') + '</td><td class="num">' + (O ? pct(O[p.id].lo) + '–' + pct(O[p.id].hi) : '') + '</td></tr>').join('') + '</table>' +
      '<p class="small">' + (A.rhoRank !== null ? 'Conjoint-predicted rank vs ranking task (' + A.nRank + ' rankings): Spearman ρ = <b>' + f3(A.rhoRank) + '</b>. ' : '') +
      (A.match ? 'Locked prediction vs storefront shares: Spearman ρ = <b>' + f3(A.match.rho) + '</b>, mean absolute share error ' + pct(A.match.mae) + '; top pick predicted ' + A.match.topP + ', chosen most ' + A.match.topO + ' <span class="pill ' + (A.match.topMatch ? 'good' : 'warn') + '">' + (A.match.topMatch ? 'match' : 'no match') + '</span>' : '') + '</p></div>';
  }
  if (A.sum) {
    h += '<div class="card"><h2>C. Storefront</h2><p class="small">' + A.sum.n + ' valid choices, ' + A.sum.nInvalid + ' with no valid product. Read-back: ' + pct(A.sum.misreadRate) + ' of choices had at least one misread field.</p>';
    if (A.cl && !A.cl.error) h += '<h3>Conditional logit: product fixed effects + row + column (reference: ' + A.cl.reference + ', row 1, column 1)</h3><table><tr><th>Term</th><th class="num">B</th><th class="num">SE</th><th class="num">z</th><th class="num">p</th></tr>' + A.cl.terms.map(t => '<tr><td>' + t.term + '</td><td class="num">' + f3(t.b) + '</td><td class="num">' + f3(t.se) + '</td><td class="num">' + f3(t.z) + '</td><td class="num ' + (t.p < .05 ? 'sig' : '') + '">' + pfmt(t.p) + '</td></tr>').join('') + '</table>' + (A.cl.neverChosen.length ? '<p class="small muted">Never chosen (left out of the model): ' + A.cl.neverChosen.join(', ') + '</p>' : '');
    else if (A.cl) h += '<p class="small muted">' + esc(A.cl.error) + '</p>';
    const mis = Object.values(A.R.storefront).filter(r => r.nMisread);
    if (mis.length) { const cnt = {}; mis.forEach(r => r.misread.forEach(f => { cnt[f] = (cnt[f] || 0) + 1; })); h += '<h3>Misread fields</h3><p class="small">' + Object.entries(cnt).map(([k, v]) => esc(k) + ': ' + v).join(' · ') + '</p>'; }
    h += '</div>';
  }
  const v = A.R.validation && A.R.validation.trials ? Object.values(A.R.validation.trials) : [];
  if (v.length) { const hit = v.filter(r => r.chosen === A.R.validation.dominant).length; h += '<div class="card"><h2>Validation check</h2><p>Dominant product ' + A.R.validation.dominant + ' chosen in <b>' + hit + '/' + v.length + '</b> trials <span class="pill ' + (hit === v.length ? 'good' : 'bad') + '">' + (hit === v.length ? 'pass' : 'check before the real run') + '</span></p></div>'; }
  body.innerHTML = h;
}

// ---------- Compare ----------
function compareRows() {
  const s = study(), out = [];
  modelsWithResults().forEach(m => s.conditions.forEach(c => {
    const A = analyse(m, c.label); if (A.fit.error && !A.sum) return;
    const top = A.fit.error ? [] : s.attributes.slice().sort((a, b) => A.fit.importance[b.key] - A.fit.importance[a.key]).slice(0, 3).map(a => a.name + ' ' + pct(A.fit.importance[a.key]));
    out.push({ m, c, A, top });
  }));
  return out;
}
function renderCompare() {
  const s = study(), rows = compareRows(), el = $('cmpBody');
  if (!rows.length) { el.innerHTML = '<div class="card muted">Run at least one model first.</div>'; return; }
  let h = '<div class="card"><h2>Models side by side</h2><table><tr><th>Model</th><th>Cond.</th><th class="num">Valid answers</th><th class="num">Missing</th><th class="num">Chose first</th><th>Top attributes</th><th class="num">ρ prediction vs ranking</th><th class="num">ρ prediction vs storefront</th><th>Top pick (pred / actual)</th><th class="num">Misread</th></tr>' +
    rows.map(r => { const A = r.A; return '<tr><td>' + esc(r.m.label) + '</td><td>' + esc(r.c.label) + '</td><td class="num">' + (A.fit.n || '') + '</td><td class="num">' + (A.fit.nMissing === undefined ? '' : A.fit.nMissing) + '</td><td class="num">' + (A.fit.firstShare ? pct(A.fit.firstShare) : '') + '</td><td class="small">' + esc(r.top.join(', ')) + '</td><td class="num">' + (A.rhoRank === null ? '' : f3(A.rhoRank)) + '</td><td class="num">' + (A.match ? f3(A.match.rho) : '') + '</td><td>' + (A.match ? A.match.topP + ' / ' + A.match.topO : '') + '</td><td class="num">' + (A.sum ? pct(A.sum.misreadRate) : '') + '</td></tr>'; }).join('') + '</table></div>';
  // attribute effects across models + random-effects pooling
  const fits = rows.filter(r => !r.A.fit.error);
  if (fits.length) {
    const terms = fits[0].A.fit.terms.map(t => t.name);
    h += '<div class="card"><h2>Attribute effects across models (B, * p < .05) with random-effects pooling <span class="tip" data-tip="DerSimonian–Laird random-effects average of each coefficient across models. I² is the share of variation between models beyond sampling error: high I² means the models disagree.">i</span></h2><div style="overflow:auto"><table><tr><th>Term</th>' + fits.map(r => '<th class="num">' + esc(r.m.label) + '</th>').join('') + '<th class="num">Pooled B</th><th class="num">SE</th><th class="num">p</th><th class="num">I²</th></tr>' +
      terms.map(tn => { const est = fits.map(r => r.A.fit.terms.find(t => t.name === tn)); const pl = C.poolRE(est); return '<tr><td>' + esc(tn) + '</td>' + est.map(t => '<td class="num">' + f3(t.b) + (t.p < .05 ? '*' : '') + '</td>').join('') + '<td class="num">' + (pl ? f3(pl.b) : '') + '</td><td class="num">' + (pl ? f3(pl.se) : '') + '</td><td class="num">' + (pl ? pfmt(pl.p) : '') + '</td><td class="num">' + (pl ? pct(pl.I2) : '') + '</td></tr>'; }).join('') + '</table></div></div>';
    h += '<div class="card"><h2>Relative importance across models</h2><table><tr><th>Attribute</th>' + fits.map(r => '<th class="num">' + esc(r.m.label) + '</th>').join('') + '</tr>' + s.attributes.map(a => '<tr><td>' + esc(a.name) + '</td>' + fits.map(r => '<td class="num">' + pct(r.A.fit.importance[a.key]) + '</td>').join('') + '</tr>').join('') + '</table></div>';
  }
  el.innerHTML = h;
}

// ---------- Export ----------
function download(name, text, type) { const b = new Blob([text], { type: type || 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
const slug = () => study().name.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40);
function exportData(kind) {
  const s = study(), ms = modelsWithResults(), stamp = new Date().toISOString().slice(0, 10);
  const each = fn => { const out = []; ms.forEach(m => s.conditions.forEach(c => fn(m, c, resFor(m, c.label), out))); return out; };
  if (kind === 'conjoint') { const rows = each((m, c, R, out) => out.push(...C.conjointLong(s, m.label + ' | ' + m.model, c.label, Object.values(R.conjoint)))); if (!rows.length) return log('No conjoint answers yet.'); download(slug() + '_conjoint_' + stamp + '.csv', C.toCSV(rows, Object.keys(rows[0])), 'text/csv'); }
  if (kind === 'ranking') { const rows = each((m, c, R, out) => Object.values(R.ranking).forEach(r => out.push({ model: m.label + ' | ' + m.model, condition: c.label, rep: r.rep, shown_order: r.shown.join(' '), ranking: r.ranking ? r.ranking.join(' ') : '', valid: r.ranking ? 1 : 0, response: r.text }))); if (!rows.length) return log('No rankings yet.'); download(slug() + '_ranking_' + stamp + '.csv', C.toCSV(rows, Object.keys(rows[0])), 'text/csv'); }
  if (kind === 'storefront') { const rows = each((m, c, R, out) => Object.values(R.storefront).forEach(r => out.push({ model: m.label + ' | ' + m.model, condition: c.label, trial: r.trial, chosen: r.chosen || '', slot: r.slot, row: r.row, col: r.col, mode: r.mode, n_misread: r.nMisread, misread_fields: (r.misread || []).join('; '), reasked: r.reasked ? 1 : 0, reported: r.reported, model_returned: r.modelReturned, reasoning: r.text }))); if (!rows.length) return log('No storefront choices yet.'); download(slug() + '_storefront_' + stamp + '.csv', C.toCSV(rows, Object.keys(rows[0])), 'text/csv'); }
  if (kind === 'design') { const rows = []; C.makeStorefrontDesign(s, s.storefront.trials, 0).forEach(t => t.layout.forEach(L => rows.push({ trial: t.trial, product_id: L.id, slot: L.slot, grid_row: L.row, grid_col: L.col }))); download(slug() + '_storefront_design.csv', C.toCSV(rows, Object.keys(rows[0])), 'text/csv'); }
  if (kind === 'coefs') { const rows = each((m, c, R, out) => { const f = C.fitConjoint(s, Object.values(R.conjoint)); if (!f.error) f.terms.forEach(t => out.push({ model: m.label + ' | ' + m.model, condition: c.label, term: t.name, B: t.b, SE: t.se, z: t.z, p: t.p, n: f.n })); }); if (!rows.length) return log('No fitted models yet.'); download(slug() + '_coefficients_' + stamp + '.csv', C.toCSV(rows, Object.keys(rows[0])), 'text/csv'); }
  if (kind === 'predictions') { const rows = each((m, c, R, out) => { if (!R.prediction) return; const sum = Object.keys(R.storefront).length ? C.storefrontSummary(s, Object.values(R.storefront)) : null; R.prediction.predicted.forEach(p => { const o = sum ? sum.shares.find(x => x.id === p.id) : null; out.push({ model: m.label + ' | ' + m.model, condition: c.label, product: p.id, utility: p.utility, predicted_rank: p.rank, predicted_share: p.share, storefront_n: o ? o.k : '', storefront_share: o ? o.share : '', locked_at: R.prediction.at, sha256: R.prediction.hash }); }); }); if (!rows.length) return log('No locked predictions yet.'); download(slug() + '_predictions_' + stamp + '.csv', C.toCSV(rows, Object.keys(rows[0])), 'text/csv'); }
  if (kind === 'compare') { const rows = compareRows().map(r => ({ model: r.m.label, model_id: r.m.model, tier: r.m.tier, condition: r.c.label, valid_answers: r.A.fit.n || '', missing: r.A.fit.nMissing, chose_first: r.A.fit.firstShare, rho_pred_vs_ranking: r.A.rhoRank, rho_pred_vs_storefront: r.A.match ? r.A.match.rho : '', mae_share: r.A.match ? r.A.match.mae : '', top_pick_pred: r.A.match ? r.A.match.topP : '', top_pick_actual: r.A.match ? r.A.match.topO : '', misread_rate: r.A.sum ? r.A.sum.misreadRate : '' })); if (!rows.length) return log('Nothing to compare yet.'); download(slug() + '_comparison_' + stamp + '.csv', C.toCSV(rows, Object.keys(rows[0])), 'text/csv'); }
  if (kind === 'spss') download(slug() + '_conjoint.sps', C.spssSyntax(s, 'each model (filter on the model column if the file holds several)'));
  if (kind === 'project') download('llm_conjoint_lab_project_' + stamp + '.json', JSON.stringify(P), 'application/json');
  if (kind === 'study') download(slug() + '.json', JSON.stringify(s, null, 2), 'application/json');
}
document.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => exportData(b.dataset.exp));
$('openProject').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (!j.studies) throw new Error('not a project file'); P = j; save(); initUI(); log('Project opened.'); } catch (err) { alert('Could not open: ' + err.message); } };
$('openStudy').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (!j.attributes) throw new Error('not a study file'); P.studies.push(j); P.current = P.studies.length - 1; save(); renderStudy(); log('Study added.'); } catch (err) { alert('Could not open: ' + err.message); } };

// ---------- Init ----------
function initUI() { $('ver').textContent = VERSION; $('concurrency').value = P.settings.concurrency || 6; renderModels(); renderStudy(); go(pageIx); }
(async function () {
  await idb();
  const saved = DB.db ? await idbGet('project') : null;
  try { P = saved ? JSON.parse(saved) : newProject(); } catch (e) { P = newProject(); }
  const k = DB.db ? await idbGet('keys') : null;
  if (k) { try { const o = JSON.parse(k); Object.keys(o).forEach(n => { if ($('key_' + n)) $('key_' + n).value = o[n]; }); $('rememberKeys').checked = true; } catch (e) { /* ignore */ } }
  initUI();
  window.LAB = { get P() { return P; }, exportData, analyse, renderResults, renderCompare, go }; // for testing
})();
})();
