"""Parameter-recovery check for the LLM Conjoint Lab.

Runs the full Study 3 pipeline (conjoint -> locked prediction -> storefront) in a headless browser on
3 simulated models whose true preferences are known, then prints true vs estimated conjoint weights and
the locked-prediction vs storefront correlation. No API keys, no cost.

    pip install playwright
    python tests/sim_recovery.py            # uses installed Chrome, or run `playwright install chromium`
"""
import asyncio, pathlib, shutil
from playwright.async_api import async_playwright

HTML = (pathlib.Path(__file__).resolve().parent.parent / 'index.html').as_uri()

async def main():
    async with async_playwright() as p:
        chrome = shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
        b = await p.chromium.launch(executable_path=chrome, args=['--no-sandbox']) if chrome else await p.chromium.launch()
        pg = await b.new_page(); errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(HTML); await pg.wait_for_timeout(800)
        await pg.evaluate("""() => { S.models = []; loadStudy3(); S.models = []; document.getElementById('addSims').click();
                                     S.settings.runSize = 'full'; S.tasks.storeTrials = 300; }""")
        await pg.evaluate("() => document.getElementById('startAll').click()"); await pg.wait_for_timeout(500)
        await pg.wait_for_function("() => !run.active", timeout=1_200_000)
        out = await pg.evaluate("""() => units().map(u => {
            const rows = conjointRows(u), fit = E.analyseConjoint(rows, S.study.attrs), t = Sim.truth(u.m), R = resOf(u);
            const st = Object.values(R.store || {}), obs = S.val.products.map(p => st.filter(x => x.choice === p.name).length / st.length);
            const pred = R.lock.predicted.map(x => x.share);
            return { label: u.label, answered: rows.filter(r => r.choice).length, missing: rows.filter(r => !r.choice).length,
                     truth: [t.bias, ...t.beta], est: fit.coefs.map(c => [c.term, c.B, c.SE]), rho: E.spearman(pred, obs) }; })""")
        ok = not errors
        for m in out:
            print(f"\n{m['label']}: {m['answered']} answered, {m['missing']} missing; locked prediction vs storefront rho = {m['rho']:.2f}")
            print(f"  {'term':45s} {'true':>8s} {'estimate':>9s} {'SE':>7s}  within 3 SE")
            for (term, B, SE), true in zip(m['est'], m['truth']):
                hit = abs(B - true) <= 3 * SE; ok &= hit
                print(f"  {term[:45]:45s} {true:8.3f} {B:9.3f} {SE:7.3f}  {'yes' if hit else 'NO'}")
        print('\nPage errors:', errors or 'none')
        print('RESULT:', 'PASS' if ok else 'CHECK')
        await b.close()

asyncio.run(main())
