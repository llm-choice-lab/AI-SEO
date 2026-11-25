"""LLM Conjoint Lab: independent verification (Python).

Recomputes the tool's results from the raw data in a verification pack, with standard statistics packages,
and prints PASS or CHECK for each check. Nothing here uses the tool's code.

  Check A  conjoint: binary logistic regression of ChoseFirst on the d_ differences (with a constant), per run
  Check B  locked prediction: SHA-256 of each locks/*.json file, its coefficients vs Check A, and its
           predicted shares re-computed from those coefficients and data/products.csv
  Check C  conjoint vs storefront: observed shares, Spearman rho, mean share gap, top pick, and the
           position model (conditional logit: product + page row + page column, one stratum per trial)

Usage (from the unzipped pack folder, or pass its path):
    pip install pandas numpy scipy statsmodels
    python scripts/verify.py [path/to/verification_pack]
"""
import hashlib, json, sys
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
import statsmodels.api as sm
from statsmodels.discrete.conditional_models import ConditionalLogit

TOL_COEF, TOL_SHARE, TOL_RHO, TOL_CLOGIT = 1e-4, 1e-6, 1e-6, 1e-3

pack = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
read = lambda p: pd.read_csv(pack / p, encoding='utf-8-sig', keep_default_na=False, na_values=[''])
lines, status = [], {'PASS': 0, 'CHECK': 0}
def out(s=''): print(s); lines.append(s)
def verdict(ok, what, detail=''):
    k = 'PASS' if ok else 'CHECK'; status[k] += 1; out(f'  [{k}] {what}' + (f'  ({detail})' if detail else ''))

manifest = json.loads((pack / 'manifest.json').read_text(encoding='utf-8'))
conj, prods = read('data/conjoint_long.csv'), read('data/products.csv')
coefs_tool = read('tool_results/coefficients.csv')
locks = read('data/locks.csv') if (pack / 'data/locks.csv').stat().st_size > 5 else pd.DataFrame()
trials = read('data/storefront_trials.csv') if (pack / 'data/storefront_trials.csv').stat().st_size > 5 else pd.DataFrame()
long = read('data/storefront_long.csv') if (pack / 'data/storefront_long.csv').stat().st_size > 5 else pd.DataFrame()
comp = read('tool_results/storefront_comparison.csv') if (pack / 'tool_results/storefront_comparison.csv').stat().st_size > 5 else pd.DataFrame()
summ = read('tool_results/summary.csv')
clog_tool = read('tool_results/storefront_clogit.csv') if (pack / 'tool_results/storefront_clogit.csv').stat().st_size > 5 else pd.DataFrame()

dvars = [f['difference'] for f in manifest['features']]
xvars = [f['product'] for f in manifest['features']]
products = list(prods['Product'].astype(str))
cols = int(manifest.get('storefrontColumns', 5))

out(f"LLM Conjoint Lab verification (Python) · pack generated {manifest['generated']} · {manifest['project']}")
out(f"pandas {pd.__version__}, statsmodels {sm.__version__}")

for run in manifest['runs']:
    rid = run['RunID']; out(); out(f"=== {run['label']}  ({run['provider']} · {run['model']}) ===")
    d = conj[conj['RunID'] == rid]
    own = None
    # ---------------- Check A ----------------
    if len(d):
        X = sm.add_constant(d[dvars].astype(float), has_constant='add'); y = d['ChoseFirst'].astype(int)
        fit = sm.Logit(y, X).fit(disp=0, method='newton', maxiter=200, tol=1e-12)
        own = pd.DataFrame({'Variable': ['Constant'] + dvars, 'B': fit.params.values, 'SE': fit.bse.values})
        t = coefs_tool[coefs_tool['RunID'] == rid].merge(own, on='Variable', suffixes=('_tool', '_own'))
        db, ds = (t['B_tool'] - t['B_own']).abs().max(), (t['SE_tool'] - t['SE_own']).abs().max()
        out(f"  Check A · conjoint, {len(d)} answers. Largest difference: B {db:.2e}, SE {ds:.2e}")
        for _, r in t.iterrows(): out(f"      {r['Variable'][:38]:38s} tool {r['B_tool']:12.6f}  own {r['B_own']:12.6f}")
        verdict(len(t) == len(own) and db < TOL_COEF and ds < TOL_COEF, 'A: coefficients and SEs match the tool')
    else: out('  Check A · no conjoint answers for this run (skipped)')
    # ---------------- Check B ----------------
    L = locks[locks['RunID'] == rid] if len(locks) else locks
    pred = None
    if len(L):
        L = L.iloc[0]; raw = (pack / L['PayloadFile']).read_bytes()
        verdict(hashlib.sha256(raw).hexdigest() == L['SHA256'], 'B1: the lock file is unchanged (SHA-256 matches)', f"locked {L['LockedAt']} from {L['Answers']} answers")
        payload = json.loads(raw.decode('utf-8'))
        B = dict(zip(['Constant'] + dvars, [c[1] for c in payload['coefs']]))
        if own is not None and int(L['Answers']) == len(d):
            gap = max(abs(B[v] - b) for v, b in zip(own['Variable'], own['B']))
            verdict(gap < TOL_COEF, 'B2: locked coefficients equal your own re-fit of all conjoint answers', f'largest gap {gap:.2e}')
        elif own is not None:
            out(f"  [NOTE] B2: the lock used {L['Answers']} answers and the data now has {len(d)} (e.g. locked after a pilot), so B2 is skipped")
        U = prods[xvars].astype(float).values @ np.array([B[v] for v in dvars])
        pred = np.exp(U - U.max()); pred /= pred.sum()
        saved = np.array([p['share'] for p in payload['predicted']])
        verdict(np.abs(pred - saved).max() < TOL_SHARE, 'B3: predicted shares re-computed from the locked coefficients match the lock file', f'largest gap {np.abs(pred - saved).max():.2e}')
        hist = read('data/lock_history.csv') if (pack / 'data/lock_history.csv').exists() else pd.DataFrame()
        if len(trials) and len(hist):
            tt = trials[(trials['RunID'] == rid) & trials['At'].notna() & (trials['At'] != '')]
            first_lock = str(hist[hist['RunID'] == rid]['LockedAt'].min())
            if len(tt): verdict(str(tt['At'].min()) >= first_lock, 'B4: a prediction was locked before the first storefront trial',
                                f"first lock {first_lock}, first trial {tt['At'].min()}; later locks only add conjoint answers")
    else: out('  Check B · no locked prediction for this run (skipped)')
    # ---------------- Check C ----------------
    T = trials[(trials['RunID'] == rid)] if len(trials) else trials
    if len(T) and pred is not None:
        v = T[T['Choice'].notna() & (T['Choice'] != '')]
        obs = np.array([(v['Choice'].astype(str) == p).mean() for p in products])
        c = comp[comp['RunID'] == rid].set_index('Product').reindex(products)
        verdict(np.abs(obs - c['ObservedShare'].values).max() < TOL_SHARE, f'C1: observed storefront shares ({len(v)} valid trials) match the tool')
        rho = spearmanr(pred, obs).statistic; s = summ[summ['RunID'] == rid].iloc[0]
        mae = np.abs(pred - obs).mean(); top_p, top_o = products[int(np.argmax(pred))], products[int(np.argmax(obs))]
        out(f"  Locked prediction vs storefront: rho {rho:.4f}, mean share gap {mae:.4f}, top predicted {top_p}, top observed {top_o}")
        verdict(abs(rho - float(s['Rho_LockedPrediction_vs_Storefront'])) < TOL_RHO and abs(mae - float(s['MeanAbsShareGap'])) < TOL_SHARE
                and top_p == str(s['TopPredicted']) and top_o == str(s['TopObserved']), 'C2: rho, share gap and top picks match the tool')
        # position model: products never chosen are dropped (as in ACES); reference = first chosen product in list order, bottom row, last column
        g = long[long['RunID'] == rid].copy(); g['Product'] = g['Product'].astype(str)
        ever = set(g.loc[g['Chosen'] == 1, 'Product']); keep = [p for p in products if p in ever]
        g = g[g['Product'].isin(ever)]
        nrows = int(long[long['RunID'] == rid]['PageRow'].max())
        Xc = pd.DataFrame({f'fe_{p}': (g['Product'] == p).astype(float) for p in keep[1:]}, index=g.index)
        for r in range(1, nrows): Xc[f'row_{r}'] = (g['PageRow'] == r).astype(float)
        for k in range(1, cols): Xc[f'col_{k}'] = (g['PageCol'] == k).astype(float)
        Xc = Xc.loc[:, Xc.std() > 0]
        if len(keep) >= 2 and g['Trial'].nunique() >= 10:
            cm = ConditionalLogit(g['Chosen'].astype(int), Xc, groups=g['Trial'])
            with np.errstate(all='ignore'):   # rough fit first, then Newton from there (a product chosen once or twice can make Newton from zero overshoot)
                cl = cm.fit(method='bfgs', maxiter=5000, gtol=1e-8, disp=0)
                cl = cm.fit(start_params=cl.params.values, method='newton', maxiter=200, tol=1e-12, disp=0)
            ct = clog_tool[clog_tool['RunID'] == rid].set_index('Term')
            both = [k for k in Xc.columns if k in ct.index]
            gap = max(abs(cl.params[k] - ct.loc[k, 'B']) for k in both) if both else np.inf
            for k in both: out(f"      {k:20s} tool {ct.loc[k, 'B']:10.4f}  own {cl.params[k]:10.4f}")
            verdict(len(both) == len(Xc.columns) and gap < TOL_CLOGIT, 'C3: position model (conditional logit) matches the tool', f'largest gap {gap:.2e}')
        else: out('  [NOTE] C3: too few trials or only one product ever chosen; no position model')
    else: out('  Check C · no storefront trials or no locked prediction for this run (skipped)')

out(); out(f"SUMMARY: {status['PASS']} PASS, {status['CHECK']} CHECK")
(pack / 'verify_report_python.txt').write_text('\n'.join(lines), encoding='utf-8')
print(f"Report written to {pack / 'verify_report_python.txt'}")
sys.exit(1 if status['CHECK'] else 0)
