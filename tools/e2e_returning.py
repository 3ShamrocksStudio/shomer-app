"""
E2E: prove the returning-user login exists, is VISIBLE on the first sign-up screen,
and actually advances a returning user to phone verification.

Runs against a FRESH install (empty localStorage) — exactly what a user who
reinstalled sees. Stops before any SMS is sent.
"""
import asyncio
from playwright.async_api import async_playwright

URL = "http://127.0.0.1:8899/shomer.html"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage",
                                          "--ignore-certificate-errors"])
        ctx = await b.new_context(ignore_https_errors=True,
                                  viewport={"width": 360, "height": 779},
                                  device_scale_factor=2, locale="he-IL",
                                  geolocation={"latitude": 32.0853, "longitude": 34.7818},
                                  permissions=["geolocation"])
        pg = await ctx.new_page()
        sms = []
        # never actually send an OTP
        async def _block(route):
            sms.append(route.request.url)
            await route.abort()
        await pg.route("**/sendOTP*", _block)

        await pg.goto(URL, wait_until="load", timeout=60000)
        await pg.wait_for_timeout(3500)

        r = {}
        r["app_version"] = await pg.evaluate("() => typeof APP_VER!=='undefined'?APP_VER:'?'")
        r["onboarding_shown"] = await pg.evaluate(
            "() => { const o=document.getElementById('ob'); return !!o && getComputedStyle(o).display!=='none'; }")

        btn = pg.locator("#ob-returning")
        r["button_exists"] = await btn.count() > 0
        r["button_visible"] = await btn.is_visible() if r["button_exists"] else False
        r["button_text_he"] = (await btn.inner_text()).strip() if r["button_exists"] else None
        r["button_text_en"] = await btn.get_attribute("data-en") if r["button_exists"] else None
        r["on_first_screen"] = await pg.evaluate(
            """() => { const b=document.getElementById('ob-returning');
                       if(!b) return false;
                       const s=b.closest('.ob-panel');
                       return s ? (s.id||'step0') : 'no-panel'; }""")

        # a returning user types their number and taps the link
        await pg.fill("#ob-phone", "0524806699")
        await btn.click()
        await pg.wait_for_timeout(2500)

        r["reached_sms_screen"] = await pg.evaluate(
            """() => { const p=document.getElementById('ob-sms-panel');
                       return !!p && getComputedStyle(p).display!=='none'; }""")
        r["otp_attempted"] = len(sms) > 0
        r["name_not_required"] = await pg.evaluate(
            "() => { const n=document.getElementById('ob-name'); return !!(n && n.value.trim()); }")

        print("--- RETURNING-USER LOGIN E2E (fresh install) ---")
        for k, v in r.items():
            print(f"  {k:22s} {v}")
        await pg.screenshot(path="/tmp/e2e_returning.png")
        await b.close()


asyncio.run(main())
