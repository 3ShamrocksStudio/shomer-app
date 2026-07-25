import asyncio, json
from playwright.async_api import async_playwright

STATE = {"onboarded": True, "lang": "he",
         "user": {"name": "דוד", "phone": "972524806699"},
         "security": {"phoneVerified": True, "twilioVerified": True}}


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = await b.new_context(viewport={"width": 360, "height": 779}, device_scale_factor=2,
                                  locale="he-IL",
                                  geolocation={"latitude": 32.0853, "longitude": 34.7818},
                                  permissions=["geolocation"])
        await ctx.add_init_script(
            "localStorage.setItem('shomer_state_v1', %s);" % json.dumps(json.dumps(STATE)))
        pg = await ctx.new_page()
        errs, failed = [], []
        pg.on("console", lambda m: errs.append((m.type, m.text[:200])))
        pg.on("pageerror", lambda e: errs.append(("PAGEERROR", str(e)[:300])))
        pg.on("requestfailed", lambda r: failed.append((r.url[:110], str(r.failure))))

        await pg.goto("http://127.0.0.1:8899/shomer.html", wait_until="load", timeout=60000)
        await pg.wait_for_timeout(9000)

        d = await pg.evaluate("""()=>({
            L: typeof window.L,
            MAP: (typeof MAP!=='undefined')? (MAP? 'obj':'null') : 'undef',
            mapEl: !!document.getElementById('map'),
            mapH: document.getElementById('map') ? document.getElementById('map').offsetHeight : -1,
            ob: document.getElementById('ob') ? getComputedStyle(document.getElementById('ob')).display : 'no-ob',
            restored: window.__shomerRestored,
            err: window.__shomerErr||null,
            APP_VER: (typeof APP_VER!=='undefined')?APP_VER:'?',
            SSon: (typeof SS!=='undefined')? SS.onboarded : 'noSS',
            hasInitMap: typeof initMap,
            hasBuildPins: typeof buildPins
        })""")
        print("STATE:", d)
        print("--- failed requests ---")
        for f in failed[:12]:
            print("  ", f)
        print("--- console errors/warnings ---")
        for t, m in errs:
            if t in ("error", "warning", "PAGEERROR"):
                print(f"  [{t}] {m}")
        await pg.screenshot(path="/tmp/diag.png")
        await b.close()


asyncio.run(main())
