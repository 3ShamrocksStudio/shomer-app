"""
E2E security (v339): stored-XSS guards on the invite banner and the person-alert card.
Feeds the REAL app code hostile data from a stubbed database read - ALL network except the
local server is blocked, so nothing reaches Firebase or anyone's phone.

  python3 -m http.server 8899 --bind 127.0.0.1   (repo root)   then:
  python3 tools/e2e_xss_guard.py [base-url]
"""
import asyncio, json, sys, time
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8899"
URL = BASE + "/shomer.html?cb=" + str(time.time_ns())
STATE = {"onboarded": True, "lang": "en", "user": {"name": "Tester", "phone": "972541234567"},
         "security": {"phoneVerified": True}}
JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQ=="
RES = []


def check(name, ok, info=""):
    RES.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + ("  | " + str(info) if info != "" else ""))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, locale="en-US")

        async def guard(route):
            u = route.request.url
            if u.startswith(BASE + "/"):
                await route.continue_()
            else:
                await route.abort()
        await ctx.route("**/*", guard)
        await ctx.add_init_script("localStorage.setItem('shomer_state_v1', %s);" % json.dumps(json.dumps(STATE)))
        pg = await ctx.new_page()
        dialogs = []
        pg.on("dialog", lambda d: (dialogs.append(d.message), asyncio.ensure_future(d.dismiss())))
        await pg.goto(URL, wait_until="load", timeout=60000)
        await pg.wait_for_timeout(4000)
        await pg.evaluate("()=>{ try{ currentLang='en'; }catch(e){} try{ popupClearLow(); }catch(e){} }")

        # 1. invite banner: hostile sender name from invites/inbox_<hash>
        r = await pg.evaluate("""async ()=>{
          window.__pwn=0;
          window.fbRestGet=function(){ return Promise.resolve({ val:function(){ return {fromUid:'attacker', type:'invite', ts:Date.now(), seen:false,
              fromName:'<img src=x onerror="window.__pwn=1">'}; } }); };
          window._inboxChecked=false; FB.ready=true; FB._myPhoneHash='a'.repeat(64);
          checkInbox();
          await new Promise(r=>setTimeout(r,800));
          var b=document.getElementById('inbox-banner');
          return { shown:!!b, imgs:b?b.querySelectorAll('img').length:-1, text:b?b.textContent:'', pwn:window.__pwn };
        }""")
        check("invite banner shows", r["shown"], r)
        check("sender name <img onerror> rendered as text, no element", r["imgs"] == 0 and "<img src=x" in r["text"], r["text"][:80])
        check("sender name script did not run", r["pwn"] == 0)

        # 2. person-alert card: hostile photo values
        async def card(photo):
            return await pg.evaluate("""(ph)=>{
              window.__pwn2=0; var o=document.getElementById('pa-detail'); if(o) o.remove();
              FB._paCache={pa_0000000000000001:{id:'pa_0000000000000001', kind:'missing', subjName:'<b>n</b>', ts:Date.now(), status:'active', subjPhoto:ph}};
              window.fbRestGet=function(){ return Promise.reject(new Error('blocked')); };
              openPersonAlertDetail('pa_0000000000000001');
              var d=document.getElementById('pa-detail'); var im=d?d.querySelectorAll('img'):[];
              return { open:!!d, imgs:im.length, src:im.length?im[0].getAttribute('src'):'', onerr:im.length?im[0].hasAttribute('onerror'):false,
                       bold:d?d.querySelectorAll('.rep-h b').length:-1 };
            }""", photo)
        r = await card("javascript:window.__pwn2=1")
        check("javascript: photo URL blocked (no <img>)", r["open"] and r["imgs"] == 0, r)
        r = await card('x" onerror="window.__pwn2=1')
        check("attribute break-out photo blocked (no <img>, no onerror)", r["open"] and r["imgs"] == 0 and not r["onerr"], r)
        r = await card("https://evil.example/track.gif")
        check("remote https tracking photo blocked", r["open"] and r["imgs"] == 0, r)
        r = await card("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")
        check("svg data photo blocked", r["open"] and r["imgs"] == 0, r)
        r = await card(JPEG)
        check("genuine inline JPEG photo still shown", r["imgs"] == 1 and r["src"] == JPEG, r["src"][:40])
        check("subject name with HTML rendered as text", r["bold"] == 0, r)
        await pg.wait_for_timeout(600)
        pw = await pg.evaluate("()=>window.__pwn2")
        check("no hostile photo script ran", pw == 0)
        check("no alert() dialogs", len(dialogs) == 0, dialogs)
        await b.close()
    bad = [n for n, ok in RES if not ok]
    print("\n%d passed, %d failed" % (len(RES) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)

asyncio.run(main())
