"""Compares the Lab's storefront conditional logit with statsmodels ConditionalLogit.
Needs design.csv and choices.csv from a storefront results zip in this folder."""
import json, subprocess, pandas as pd
from statsmodels.discrete.conditional_models import ConditionalLogit
d = pd.read_csv('design.csv'); c = pd.read_csv('choices.csv').fillna('')
json.dump({'design': d.to_dict('records'), 'choices': c[['trial', 'chosen_product_id']].to_dict('records')}, open('er.json', 'w'))
js = json.loads(subprocess.check_output(['node', '-e', """
const C=require('../src/core.js'),fs=require('fs');const s=JSON.parse(fs.readFileSync(__dirname+'/../studies/study3_ereaders.json'));
const d=JSON.parse(fs.readFileSync('er.json'));const dbt={};d.design.forEach(r=>{(dbt[r.trial]=dbt[r.trial]||[]).push({id:r.product_id,slot:r.slot,row:r.grid_row,col:r.grid_col})});
const rows=d.choices.filter(r=>r.chosen_product_id).map(r=>({trial:r.trial,chosen:r.chosen_product_id}));
console.log(JSON.stringify(C.clogit(s,rows,dbt).terms));"""], cwd='.'))
js = {t['term']: t for t in js}
D = d.merge(c[c.chosen_product_id != ''][['trial', 'chosen_product_id']], on='trial'); D['y'] = (D.product_id == D.chosen_product_id).astype(int)
chosen = set(D.chosen_product_id); D = D[D.product_id.isin(chosen)]; ids = sorted(chosen)
X = pd.DataFrame({f'fe_{i}': (D.product_id == i).astype(int) for i in ids[1:]})
for k in range(2, D.grid_row.max() + 1): X[f'row_{k}'] = (D.grid_row == k).astype(int)
for k in range(2, D.grid_col.max() + 1): X[f'col_{k}'] = (D.grid_col == k).astype(int)
r = ConditionalLogit(D.y.values, X.values, groups=D.trial.values).fit(disp=0)
for n, b, se in zip(X.columns, r.params, r.bse): print(f"{n:8s} statsmodels {b: .4f} ({se:.4f})  Lab {js[n]['b']: .4f} ({js[n]['se']:.4f})")
