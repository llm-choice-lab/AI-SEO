"""Fits the conjoint logit in statsmodels on data written by make_logit_data.js and prints both sets of estimates.
Run: node tests/make_logit_data.js && python3 tests/check_logit.py"""
import json, numpy as np, statsmodels.api as sm
d = json.load(open('conj.json')); X = np.array(d['X'], float); y = X[:, -1]; X = sm.add_constant(X[:, :-1])
r = sm.Logit(y, X).fit(disp=0)
for (n, b, se, p), bb, ss in zip(d['terms'], r.params, r.bse):
    print(f"{n[:34]:34s} JS {b: .6f} ({se:.6f})  statsmodels {bb: .6f} ({ss:.6f})  |diff| {abs(b-bb):.1e}")
