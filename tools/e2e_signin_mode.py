"""
Reproduces what Dave actually did: tap the returning-user link FIRST, with an empty
form. The previous test filled the phone before clicking, which is why it passed
while the real flow was broken.
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
                                  geolocation={"latitude": 32.08, "longitude": 34.78},
                                  permissions=["geolocation"])
        pg = await ctx.new_page()
        otp = []

        async def _block(route):
            otp.append(route.request.url)
            await route.abort()
        await pg.route("**/sendOTP*", _block)

        await pg.goto(URL, wait_until="load", timeout=60000)
        await pg.wait_for_timeout(3500)

        async def snap():
            return await pg.evaluate("""() => ({
                title: (document.getElementById('ob-h0')||{}).textContent,
                cta:   (document.getElementById('ob-cta0-t')||{}).textContent,
                link:  (document.getElementById('ob-returning')||{}).textContent,
                nameVisible: (()=>{const w=document.querySelector('#step0 .name-field-wrap');
                                   return !!w && getComputedStyle(w).display!=='none';})(),
                onStep0: (()=>{const p=document.getElementById('step0');
                               return !!p && p.classList.contains('active');})()
            })""")

        print("1. FRESH INSTALL")
        for k, v in (await snap()).items():
            print(f"     {k:12s} {v}")

        print("\n2. TAP THE LINK — nothing typed yet (this is what was broken)")
        await pg.click("#ob-returning")
        await pg.wait_for_timeout(600)
        a = await snap()
        for k, v in a.items():
            print(f"     {k:12s} {v}")
        assert not a["nameVisible"], "FAIL: name field still showing in sign-in mode"
        assert "כניסה" in (a["title"] or ""), "FAIL: title did not switch to sign-in"

        print("\n3. TYPE PHONE, SUBMIT")
        await pg.fill("#ob-phone", "0524806699")
        await pg.click("#ob-submit-btn")
        await pg.wait_for_timeout(2500)
        sms = await pg.evaluate(
            """() => {
                const v=document.getElementById('ob-verify');
                if (v && v.classList.contains('on')) return 'ob-verify';
                const s0=document.getElementById('step0');
                const step0Gone = !s0 || !s0.classList.contains('active') ||
                                  getComputedStyle(s0).display==='none';
                const t=document.body.innerText||'';
                if (t.includes('אימות מספר טלפון') || t.includes('Phone Verification')) return 'sms-code-screen';
                return step0Gone ? 'left-step0' : false;
            }""")
        print(f"     verify screen open : {sms}")
        print(f"     OTP requested      : {len(otp) > 0}")

        print("\n4. RELOAD, TAP LINK TWICE — should return to sign-up")
        await pg.reload(wait_until="load"); await pg.wait_for_timeout(3000)
        await pg.click("#ob-returning"); await pg.wait_for_timeout(300)
        await pg.click("#ob-returning"); await pg.wait_for_timeout(300)
        bk = await snap()
        print(f"     title              : {bk['title']}")
        print(f"     nameVisible        : {bk['nameVisible']}")
        assert bk["nameVisible"], "FAIL: could not get back to sign-up"

        print("\n5. LANGUAGE SWITCH KEEPS THE MODE")
        await pg.evaluate("() => { _obMode='signin'; obApplyMode(); setLang('en'); }")
        await pg.wait_for_timeout(400)
        en = await snap()
        print(f"     title              : {en['title']}")
        print(f"     cta                : {en['cta']}")
        print(f"     nameVisible        : {en['nameVisible']}")
        assert not en["nameVisible"], "FAIL: mode lost after language switch"

        print("\nALL ASSERTIONS PASSED")
        await b.close()


asyncio.run(main())
