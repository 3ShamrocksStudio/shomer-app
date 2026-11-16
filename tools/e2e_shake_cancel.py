"""
E2E (v337): shake -> 8 s pre-alarm -> cancel, siren -> "Stop - I'm OK", PIN, restart, shake test.
Simulates real devicemotion events (synthetic accelerometer traces from tests/shake-traces.js,
replayed at 60 Hz). ALL network except the local server is blocked: nothing can reach Firebase,
the push worker or anyone's phone.

  python3 -m http.server 8899 --bind 127.0.0.1   (repo root)   then:
  node tools/gen_shake_traces.js /tmp/traces.json && python3 tools/e2e_shake_cancel.py [/tmp/traces.json] [base-url]
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

TR = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/traces.json"))
BASE = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8899"   # only this host is reachable
URL = BASE + "/shomer.html?cb=" + str(__import__("time").time_ns())
OLD = {"onboarded": True, "lang": "he", "user": {"name": "בודק", "phone": "972541234567"},
       "security": {"phoneVerified": True}, "shake": {"enabled": True, "level": 30}}
RES = []
SHOT = __import__("os").environ.get("SHK_SHOTS", "/tmp/")


def check(name, ok, info=""):
    RES.append((name, bool(ok), info))
    print(("PASS " if ok else "FAIL ") + name + ("  | " + str(info) if info != "" else ""))


REPLAY = """(tr)=>new Promise(res=>{ let i=0; const t0=tr[0][0];
  if(typeof DeviceMotionEvent==='undefined'){   /* desktop WebKit has no motion API: feed the same detector the handler uses */
    const d=ShakeDetector(shakeSens());
    for(const [t,x,y,z] of tr){ if(d.push(t,x,y,z)){ if(window._shakeTest) shakeTestHit(); else if(SS.shake.enabled===true) shakeFired('web'); } }
    return res(tr.length); }
  const step=()=>{ if(i>=tr.length) return res(i);
    const [t,x,y,z]=tr[i++];
    window.dispatchEvent(new DeviceMotionEvent('devicemotion',{accelerationIncludingGravity:{x,y,z},acceleration:null,interval:16}));
    setTimeout(step, i<tr.length ? Math.max(0,(tr[i][0]-t)) : 0); };
  step(); })"""


async def page_with(b, state):
    ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="he-IL",
                              geolocation={"latitude": 31.9, "longitude": 35.0}, permissions=["geolocation"])
    async def guard(route):
        u = route.request.url
        if u.startswith("http://127.0.0.1") or u.startswith("http://localhost") or u.startswith(BASE + "/"):
            await route.continue_()
        else:
            await route.abort()
    await ctx.route("**/*", guard)
    if state is not None:
        await ctx.add_init_script("localStorage.setItem('shomer_state_v1', %s);" % json.dumps(json.dumps(state)))
    pg = await ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    await pg.goto(URL, wait_until="load", timeout=60000)
    await pg.wait_for_timeout(5000)
    # spies: nothing leaves, but we see what WOULD be sent
    await pg.evaluate("""()=>{ window._calls=[];
      const spy=(n)=>{ const o=window[n]; window[n]=function(){ window._calls.push([n].concat([].slice.call(arguments))); try{ return o.apply(this,arguments); }catch(e){} }; };
      ['fbResolveSOS','fbAlertPairedSafe','fbAlertPairedSos','sosBroadcast'].forEach(spy);
      try{ popupClearLow(); }catch(e){} }""")
    return ctx, pg, errs


async def main():
    async with async_playwright() as p:
        eng = __import__("os").environ.get("SHK_ENGINE", "chromium")   # SHK_ENGINE=webkit = Safari's engine
        b = await (p.webkit.launch() if eng == "webkit" else p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"]))

        # 1. fresh install: shake is OFF
        ctx, pg, errs = await page_with(b, None)   # a real fresh install: nothing saved yet
        s = await pg.evaluate("()=>({sh:SS.shake, tog:document.getElementById('shake-tog').classList.contains('on'), ver:APP_VER})")
        check("fresh user: shake off by default", s["sh"].get("enabled") is False and s["sh"].get("sens") == "medium" and not s["tog"], s)
        n = await pg.evaluate(REPLAY, TR["shake"])
        await pg.wait_for_timeout(600)
        st = await pg.evaluate("()=>({ph:sosPhase, pre:document.getElementById('sos-pre').classList.contains('on')})")
        check("fresh user: a shake does nothing while the switch is off", st["ph"] == "idle" and not st["pre"], st)
        await pg.evaluate("()=>{ try{ startShakeDetection(); }catch(e){} }")
        await pg.evaluate(REPLAY, TR["shake"])
        await pg.wait_for_timeout(400)
        st = await pg.evaluate("()=>({ph:sosPhase, pre:document.getElementById('sos-pre').classList.contains('on')})")
        check("fresh user: listener running, switch off -> still nothing", st["ph"] == "idle" and not st["pre"], st)
        check("app version", s["ver"] == "v338", s["ver"])
        await ctx.close()

        # 2. existing user who had shake ON (old slider at 30 = 1.2 g): kept on, new safe level, one-time notice
        ctx, pg, errs = await page_with(b, OLD)
        s = await pg.evaluate("()=>({sh:SS.shake, bar:!!document.getElementById('shake-v2-bar')})")
        check("existing user: shake kept on at medium, notice queued/shown",
              s["sh"].get("enabled") is True and s["sh"].get("sens") == "medium" and s["sh"].get("v") == 2 and (s["sh"].get("notice") == 1 or s["bar"]), s)

        # 3. fast walking with the phone swinging in hand: the old detector fires on this exact trace, the new must not
        await pg.evaluate(REPLAY, TR["walk"])
        await pg.wait_for_timeout(500)
        st = await pg.evaluate("()=>({ph:sosPhase, pre:document.getElementById('sos-pre').classList.contains('on')})")
        check("fast walk (old detector fired %dx on it): no trigger" % TR["walkOldFires"], st["ph"] == "idle" and not st["pre"], st)

        # 4. deliberate shake -> pre-alarm, no siren, nothing sent; cancel
        await pg.evaluate("()=>{ window._shakeFiredAt=0; }")
        await pg.evaluate(REPLAY, TR["shake"])
        await pg.wait_for_timeout(700)
        st = await pg.evaluate("""()=>({ph:sosPhase, pre:document.getElementById('sos-pre').classList.contains('on'),
            ttl:document.getElementById('sos-pre-ttl').textContent, num:document.getElementById('sos-pre-num').textContent, btn:document.getElementById('sos-pre-cancel').textContent,
            ring:getComputedStyle(document.getElementById('sos-pre-bar')).strokeDashoffset, logo:!!document.querySelector('#sos-pre .sos-pre-badge')&&!!document.querySelector('#sos-pre-wm svg'),
            siren:_alarmLoopTimer!==null, cd:document.getElementById('sos-cd').classList.contains('on'), sent:_calls.filter(c=>c[0]==='sosBroadcast').length})""")
        check("shake -> full-screen pre-alarm 'שולח SOS בעוד N…' + 'ביטול – אני בסדר'",
              st["pre"] and st["ph"] == "countdown" and st["ttl"] == "שולח SOS בעוד…" and st["num"] in list("12345678") and st["btn"] == "ביטול – אני בסדר", st)
        check("pre-alarm: SH✡MER badge + wordmark shown", st["logo"], st["logo"])
        r1 = float((await pg.evaluate("()=>getComputedStyle(document.getElementById('sos-pre-bar')).strokeDashoffset")).replace("px", ""))
        await pg.wait_for_timeout(500)
        r2 = float((await pg.evaluate("()=>getComputedStyle(document.getElementById('sos-pre-bar')).strokeDashoffset")).replace("px", ""))
        check("countdown ring drains smoothly (moves within a second)", r2 > r1 > 0, (r1, r2))
        check("pre-alarm: no siren, nothing sent", not st["siren"] and st["sent"] == 0 and not st["cd"], st)
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path=SHOT + "v2-prealarm-390.png")
        box = await pg.evaluate("()=>{const r=document.getElementById('sos-pre-cancel').getBoundingClientRect();return {w:r.width,h:r.height,top:r.top,vh:innerHeight}}")
        check("cancel button: large (>=300x64) and in the bottom third", box["w"] >= 300 and box["h"] >= 64 and box["top"] >= box["vh"] * 0.6, box)
        await pg.click("#sos-pre-cancel")
        await pg.wait_for_timeout(300)
        st = await pg.evaluate("()=>({ph:sosPhase, pre:document.getElementById('sos-pre').classList.contains('on'), siren:_alarmLoopTimer!==null, sent:_calls.length, toast:[...document.querySelectorAll('#toasts .t-tx')].map(e=>e.textContent).join('|')})")
        check("cancel: back to idle, overlay gone, nothing sent", st["ph"] == "idle" and not st["pre"] and not st["siren"] and st["sent"] == 0 and "שום דבר לא נשלח" in st["toast"], st)

        # 4b. "שלח עכשיו" sends at once
        await pg.evaluate("()=>{ window._shakeFiredAt=0; _calls.length=0; }")
        await pg.evaluate(REPLAY, TR["shake"])
        await pg.wait_for_timeout(500)
        await pg.click("#sos-pre-now")
        await pg.wait_for_timeout(300)
        st = await pg.evaluate("()=>({ph:sosPhase, siren:_alarmLoopTimer!==null, sent:_calls.filter(c=>c[0]==='sosBroadcast').length})")
        check("'שלח עכשיו' sends at once", st["ph"] == "active" and st["siren"] and st["sent"] == 1, st)
        await pg.evaluate("()=>sosImOk()")
        await pg.wait_for_timeout(300)

        # 5. shake, no cancel -> after 8 s the siren AND the alert go out together
        await pg.evaluate("()=>{ window._shakeFiredAt=0; _calls.length=0; }")
        await pg.evaluate(REPLAY, TR["shake"])
        await pg.wait_for_timeout(4000)
        mid = await pg.evaluate("()=>({ph:sosPhase, siren:_alarmLoopTimer!==null, sent:_calls.filter(c=>c[0]==='sosBroadcast').length})")
        check("4 s into the pre-alarm: still no siren, nothing sent", mid["ph"] == "countdown" and not mid["siren"] and mid["sent"] == 0, mid)
        await pg.wait_for_timeout(5500)
        st = await pg.evaluate("""()=>({ph:sosPhase, siren:_alarmLoopTimer!==null, sent:_calls.filter(c=>c[0]==='sosBroadcast').length,
            strip:document.getElementById('sos-strip').classList.contains('on'), lbl:document.getElementById('ss-cancel-lbl').textContent,
            strobeBtn:(document.getElementById('strobe-stop')||{}).textContent})""")
        check("after 8 s: siren + alert together", st["ph"] == "active" and st["siren"] and st["sent"] == 1, st)
        check("stop control visible: 'עצור – אני בסדר'", st["strip"] and st["lbl"] == "עצור – אני בסדר", st)
        await pg.evaluate("()=>{ var b=document.getElementById('callpol-bar'); if(b) b.remove(); }")
        await pg.screenshot(path=SHOT + "v2-siren-stop-390.png")
        vis = await pg.evaluate("()=>{const s=document.getElementById('sos-strobe'); return !!(s&&getComputedStyle(s).display!=='none')}")
        await pg.click("#strobe-stop" if vis else "#ss-cancel")
        await pg.wait_for_timeout(300)
        st = await pg.evaluate("""()=>({ph:sosPhase, siren:_alarmLoopTimer!==null, calls:_calls.map(c=>c[0]+':'+(c[2]===true?'safe':'')),
            strip:document.getElementById('sos-strip').classList.contains('on'), resolveOpen:document.getElementById('sos-resolve').classList.contains('on'),
            toast:[...document.querySelectorAll('#toasts .t-tx')].map(e=>e.textContent).join('|')})""")
        check("'עצור – אני בסדר' (no code set): siren off, SOS closed, SHOMERs told 'false alarm'",
              st["ph"] == "idle" and not st["siren"] and not st["strip"] and "fbResolveSOS:safe" in st["calls"] and "fbAlertPairedSafe:" in st["calls"] and not st["resolveOpen"], st)

        # 6. with a cancel code: the siren stops at once, the code closes the SOS
        await pg.evaluate("()=>{ SS.security.pin='1234'; _calls.length=0; beginSOS('manual'); }")
        await pg.wait_for_timeout(1200)
        q = await pg.evaluate("()=>({siren:_alarmLoopTimer!==null, cd:document.getElementById('sos-cd').classList.contains('on'), sub:document.getElementById('sos-cd-sub').textContent})")
        check("SOS button press: countdown shown, siren waits ~3 s", q["cd"] and not q["siren"], q)
        await pg.wait_for_timeout(2600)
        q2 = await pg.evaluate("()=>({siren:_alarmLoopTimer!==null})")
        check("SOS button press: siren on after 3 s", q2["siren"], q2)
        await pg.evaluate("()=>{ activateSOS(); }")
        await pg.wait_for_timeout(300)
        await pg.evaluate("()=>{ sosImOk(); }")
        q = await pg.evaluate("()=>({ph:sosPhase, siren:_alarmLoopTimer!==null, pin:document.getElementById('sos-pin').classList.contains('on'), ttl:document.getElementById('pin-ttl').textContent})")
        check("with a code: siren stops instantly, code pad opens", q["ph"] == "active" and not q["siren"] and q["pin"], q)
        await pg.evaluate("()=>{ ['1','2','3','4'].forEach(d=>pinDigit(d)); }")
        await pg.wait_for_timeout(500)
        q = await pg.evaluate("()=>({ph:sosPhase, calls:_calls.map(c=>c[0]+':'+(c[2]===true?'safe':''))})")
        check("with a code: correct code closes it + 'false alarm' to SHOMERs", q["ph"] == "idle" and "fbResolveSOS:safe" in q["calls"] and "fbAlertPairedSafe:" in q["calls"], q)

        # 7. notification button / service-worker message stops a live SOS
        await pg.evaluate("()=>{ SS.security.pin=''; _calls.length=0; beginSOS('manual'); activateSOS(); }")
        await pg.wait_for_timeout(300)
        await pg.evaluate("()=>{ navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'shomer-sos-stop'}})); }")
        await pg.wait_for_timeout(300)
        q = await pg.evaluate("()=>({ph:sosPhase, siren:_alarmLoopTimer!==null})")
        check("notification 'עצור – אני בסדר' (SW message) stops it", q["ph"] == "idle" and not q["siren"], q)

        # 8. after an app restart: restored SOS shows the same stop; a stop tapped while closed is applied
        await pg.evaluate("()=>{ _calls.length=0; sosRestore('s'+Date.now(), Date.now()-60000); }")
        await pg.wait_for_timeout(300)
        q = await pg.evaluate("()=>({ph:sosPhase, btn:(document.getElementById('sosr-cancel')||{}).textContent, lbl:document.getElementById('ss-cancel-lbl').textContent})")
        check("restored SOS after restart: 'עצור – אני בסדר' shown", q["ph"] == "active" and q["btn"] == "עצור – אני בסדר", q)
        await pg.click("#sosr-cancel")
        await pg.wait_for_timeout(300)
        q = await pg.evaluate("()=>({ph:sosPhase, calls:_calls.map(c=>c[0]+':'+(c[2]===true?'safe':''))})")
        check("restored SOS: stop closes it + tells SHOMERs", q["ph"] == "idle" and "fbResolveSOS:safe" in q["calls"], q)
        await pg.evaluate("()=>{ window._sosStopPending=Date.now(); sosRestore('s'+Date.now(), Date.now()-60000); }")
        await pg.wait_for_timeout(400)
        q = await pg.evaluate("()=>({ph:sosPhase})")
        check("stop tapped while the app was closed (?sosstop / native) is applied on restore", q["ph"] == "idle", q)

        # 9. shake test never sends anything
        await pg.evaluate("()=>{ _calls.length=0; window._shakeFiredAt=0; shakeTestOpen(); }")
        await pg.evaluate(REPLAY, TR["shake"])
        await pg.wait_for_timeout(400)
        q = await pg.evaluate("()=>({ph:sosPhase, st:(document.getElementById('shk-st')||{}).textContent, calls:_calls.length})")
        check("shake test: detected, no SOS, nothing sent", q["ph"] == "idle" and "זוהה" in (q["st"] or "") and q["calls"] == 0, q)
        await pg.screenshot(path=SHOT + "v2-shake-test-390.png")
        await pg.evaluate("()=>shakeTestClose()")

        # 10. settings: Low / Medium / High
        await pg.evaluate("()=>{ setShakeSens('high'); }")
        q = await pg.evaluate("()=>({s:SS.shake.sens, on:[...document.querySelectorAll('#shake-sens .chip.on')].map(c=>c.dataset.sens), hint:document.getElementById('shake-sens-hint').textContent})")
        check("sensitivity chips Low/Medium/High", q["s"] == "high" and q["on"] == ["high"], q)
        await pg.evaluate("()=>{ setShakeSens('medium'); try{ openSettings&&openSettings(); }catch(e){} }")

        # 11. Dead Man's Switch is automatic too -> pre-alarm with its own line
        await pg.evaluate("()=>{ _calls.length=0; dmsActive=true; triggerSOS('dms'); }")
        await pg.wait_for_timeout(300)
        q = await pg.evaluate("()=>({pre:document.getElementById('sos-pre').classList.contains('on'), sub:document.getElementById('sos-pre-sub').textContent, siren:_alarmLoopTimer!==null})")
        check("DMS trigger -> pre-alarm, no siren", q["pre"] and not q["siren"] and "לא אישרת" in q["sub"], q)
        await pg.evaluate("()=>sosPreCancel()")
        check("no page errors", not errs, errs[:3])
        await ctx.close()
        await b.close()
    bad = [r for r in RES if not r[1]]
    print("\n%d/%d PASS" % (len(RES) - len(bad), len(RES)))
    sys.exit(1 if bad else 0)


asyncio.run(main())
