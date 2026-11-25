import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1]; MODE = sys.argv[2] if len(sys.argv) > 2 else 'demo'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(accept_downloads=True); pg = await ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto('file:///home/claude/ai-seo/index.html'); await pg.wait_for_timeout(1200)
        await pg.evaluate("() => tourEnd()")
        if MODE == 'demo':
            await pg.click('#gDemoBtn')
        else:  # bigger launch run on sims
            await pg.evaluate("() => { S.models=[]; loadStudy3(); S.models=[]; document.getElementById('addSims').click(); S.tasks.storeTrials=300; S.settings.autoFull=true; save(); }")
            await pg.click('#launchHead'); await pg.wait_for_timeout(500); await pg.wait_for_function("() => !launching", timeout=600000)
        await pg.wait_for_function("() => Object.keys(S.fits||{}).length > 0", timeout=300000); await pg.wait_for_timeout(500)
        await pg.evaluate("() => showTab('verify')")
        async with pg.expect_download() as d: await pg.click('#verifyGo')
        dl = await d.value; await dl.save_as(OUT)
        print('msg:', await pg.evaluate("() => document.getElementById('verifyMsg').innerText"), '| errors:', errs)
        await pg.screenshot(path='/home/claude/tests/verify_page.png'); await b.close()
asyncio.run(main())
