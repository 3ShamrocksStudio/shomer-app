"""v355 E2E: age question, 65+ -> Simple mode, Simple home, spoken countdown, normal user unchanged,
guardian SOS card with floor. 390px, HE/EN/AR. All network beyond 127.0.0.1 is blocked; window._sosPractice=true."""
import asyncio, json, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8899/shomer.html"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/mnt/user-data/outputs/shomer-simple-1119"
LOCAL = BASE.startswith("http://127.0.0.1")
res = {"base": BASE, "checks": []}
fails = 0

def chk(name, ok, extra=None):
    global fails
    res["checks"].append({"name": name, "ok": bool(ok), "extra": extra})
    if not ok: fails += 1
    print(("PASS " if ok else "FAIL ") + name + ("" if extra is None else "  " + json.dumps(extra, ensure_ascii=False)[:300]))

INIT = """
window._sosPractice = true;
window.__spoken = [];
window.__writes = [];
"""

async def new_page(b, lang, state=None):
    ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                              locale={"he": "he-IL", "en": "en-US", "ar": "ar"}[lang],
                              geolocation={"latitude": 31.8980, "longitude": 35.0104}, permissions=["geolocation"])
    pg = await ctx.new_page()
    async def guard(route):
        u = route.request.url
        if LOCAL and not u.startswith("http://127.0.0.1"):
            # nothing leaves the test machine (reads of map tiles / CDN libs are allowed, writes never)
            if route.request.method == "GET" and ("cdnjs.cloudflare.com" in u or "tile" in u or "fonts.g" in u):
                return await route.continue_()
            window_writes.append(route.request.method + " " + u[:80])
            return await route.abort()
        if not LOCAL and route.request.method != "GET":
            window_writes.append(route.request.method + " " + u[:80])
            return await route.abort()
        return await route.continue_()
    await pg.route("**/*", guard)
    st = "" if state is None else "if(!localStorage.getItem('shomer_state_v1')) localStorage.setItem('shomer_state_v1', %s);" % json.dumps(json.dumps(state))
    await pg.add_init_script(INIT + st)
    return ctx, pg

window_writes = []

def base_state(lang, **kw):
    s = {"onboarded": True, "lang": lang, "user": {"name": "Tester", "phone": ""},
         "consent": {"share": False, "tos": True, "ts": 1, "ver": "2026-07-10-draft"}, "_lastVerSeen": "v356",
         "shake": {"enabled": True, "sens": "medium", "v": 3}}
    s.update(kw)
    return s

async def spy(pg):
    await pg.evaluate("""() => { const o = window.helpSay; window.helpSay = function(he,en,ar){ window.__spoken.push({he,en,ar,lang:currentLang}); try{ return o.apply(this, arguments); }catch(e){} }; }""")

async def run_lang(b, lang):
    tag = lang
    # ── A. a NEW user: onboarding finishes → the age question appears
    ctx, pg = await new_page(b, lang)
    await pg.goto(BASE + ("&" if "?" in BASE else "?") + "t=" + lang, wait_until="load", timeout=60000)
    await pg.wait_for_timeout(2500)
    await pg.evaluate("(l) => { try{ setLang(l); }catch(e){} }", lang)
    await pg.evaluate("() => { const c=document.getElementById('ob-agree-chk'); if(c) c.checked=true; try{ user.name='Tester'; }catch(e){} obFinish(); }")
    await pg.wait_for_timeout(2600)
    q = await pg.evaluate("() => { const a=document.getElementById('age-ask'); return {on: a.classList.contains('on'), q: document.getElementById('age-q').textContent, n: a.querySelectorAll('.age-b').length, x: a.querySelector('.age-b.x').textContent}; }")
    chk(f"[{tag}] new user: age question shown after onboarding", q["on"] and q["n"] == 5, q)
    await pg.screenshot(path=f"{OUT}/{tag}-1-age-question.png")
    # 75+ → Simple mode on, with the "switch back in Settings" note
    await pg.click("#age-card-q .age-b >> nth=3")
    await pg.wait_for_timeout(500)
    d = await pg.evaluate("""() => ({simple: document.body.classList.contains('simple-on'), done: !document.getElementById('age-card-done').hidden,
        note: document.querySelector('#age-card-done .age-note').textContent, band: SS.user.ageBand, asked: !!SS.ageAsked,
        stored: JSON.parse(localStorage.getItem('shomer_state_v1')).simple})""")
    chk(f"[{tag}] 75+ turns Simple mode ON with the note", d["simple"] and d["done"] and d["band"] == "75p" and d["stored"]["on"], d)
    await pg.screenshot(path=f"{OUT}/{tag}-2-simple-on-note.png")
    await pg.click("#age-card-done .age-ok")
    await pg.wait_for_timeout(600)
    h = await pg.evaluate("""() => { const vis = (id) => { const e=document.getElementById(id); if(!e) return false; const r=e.getBoundingClientRect(); const cs=getComputedStyle(e); return cs.display!=='none' && cs.visibility!=='hidden' && r.width>0 && r.height>0; };
        const fs = (id) => parseFloat(getComputedStyle(document.getElementById(id)).fontSize);
        const sos=document.getElementById('smp-sos').getBoundingClientRect();
        const top = document.elementFromPoint(195, 300);
        return {home: vis('simple-home'), sos: vis('smp-sos'), ok: vis('smp-ok'), call: vis('smp-call'), shake: document.getElementById('smp-shake').textContent,
          navHidden: getComputedStyle(document.querySelector('.nav')).display==='none', mapCovered: !!(top && top.closest('#simple-home')),
          sosW: Math.round(sos.width), okFs: fs('smp-ok'), stFs: fs('smp-ok-st'), lineFs: fs('smp-shake'), callFs: fs('smp-call'), homeFs: fs('simple-home'),
          callTxt: document.getElementById('smp-call').textContent, okSt: document.getElementById('smp-ok-st').textContent,
          shakeOn: SS.shake.enabled===true, dir: document.documentElement.dir,
          hscroll: document.documentElement.scrollWidth > window.innerWidth+1,
          cards: !!document.querySelector('#tp-bar,#nudge-bar,#dyk-bar') }; }""")
    chk(f"[{tag}] Simple home: SOS, I'm OK, call; map + nav hidden; shake on", h["home"] and h["sos"] and h["ok"] and h["call"] and h["navHidden"] and h["mapCovered"] and h["shakeOn"], h)
    chk(f"[{tag}] Simple home: large text (>=20px) and a huge button", min(h["okFs"], h["stFs"], h["lineFs"], h["callFs"], h["homeFs"]) >= 20 and h["sosW"] >= 240 and not h["hscroll"], {k: h[k] for k in ("okFs", "stFs", "lineFs", "callFs", "homeFs", "sosW", "hscroll")})
    chk(f"[{tag}] RTL/LTR follows the language", h["dir"] == ("ltr" if lang == "en" else "rtl"), h["dir"])
    await pg.wait_for_timeout(4200)   # the daily card / nudges must not appear in Simple mode
    cards = await pg.evaluate("() => !!document.querySelector('#tp-bar,#nudge-bar,#dyk-bar')")
    chk(f"[{tag}] daily/tester card and nudges stay hidden in Simple mode", not cards)
    await pg.screenshot(path=f"{OUT}/{tag}-3-simple-home.png")
    # I'm OK
    await pg.click("#smp-ok"); await pg.wait_for_timeout(400)
    okd = await pg.evaluate("() => ({day: SS.simple.okDay, st: document.getElementById('smp-ok-st').textContent})")
    chk(f"[{tag}] 'I'm OK' marks today", bool(okd["day"]), okd)
    # settings in Simple mode: only the simple group, language and account
    await pg.click(".smp-set"); await pg.wait_for_timeout(700)
    sv = await pg.evaluate("""() => { const b=document.querySelector('#sh-set .sh-body'); const kids=[...b.children].filter(e=>getComputedStyle(e).display!=='none');
        return {shown: kids.length, allKeep: kids.every(e=>e.classList.contains('sm-keep')), tog: document.getElementById('smp-tog').classList.contains('on'),
                hour: document.getElementById('smp-hour').value, hourVis: document.getElementById('smp-hour').getBoundingClientRect().height>0 && document.getElementById('smp-tog').getBoundingClientRect().height>0,
                shakeHidden: getComputedStyle(document.getElementById('shake-tog').closest('.set-grp')).display==='none', age: document.getElementById('smp-age-st').textContent,
                nmFs: parseFloat(getComputedStyle(document.querySelector('#sh-set .sm-keep .sr-nm')).fontSize), sbFs: parseFloat(getComputedStyle(document.querySelector('#sh-set .sm-keep .sr-sb')).fontSize) }; }""")
    chk(f"[{tag}] Settings in Simple mode: advanced settings hidden, switch on", sv["allKeep"] and sv["tog"] and sv["hourVis"] and sv["shakeHidden"] and sv["age"] == "75+" and sv["nmFs"] >= 20 and sv["sbFs"] >= 18, sv)
    await pg.screenshot(path=f"{OUT}/{tag}-4-simple-settings.png")
    await pg.evaluate("() => cl('sh-set')"); await pg.wait_for_timeout(500)
    # spoken SOS countdown (practice: nothing is sent)
    await spy(pg)
    await pg.evaluate("() => { window._sosPractice = true; }")
    await pg.click("#smp-sos"); await pg.wait_for_timeout(700)
    sp = await pg.evaluate("() => ({spoken: window.__spoken, phase: sosPhase, smp: window._smpSpoken})")
    exp = {"he": "שולחים עזרה בעוד", "en": "Sending help in", "ar": "سنرسل المساعدة خلال"}[lang]
    said = sp["spoken"][0] if sp["spoken"] else {}
    chk(f"[{tag}] SOS countdown spoken aloud (helpSay hook)", sp["phase"] == "countdown" and len(sp["spoken"]) == 1 and exp in (said.get(lang) or ""), sp)
    await pg.screenshot(path=f"{OUT}/{tag}-5-sos-countdown.png")
    await pg.evaluate("() => cancelCountdown()"); await pg.wait_for_timeout(400)
    # switch back to the regular mode
    await pg.evaluate("() => { simpleOpenSettings(); }"); await pg.wait_for_timeout(500)
    await pg.click("#smp-tog"); await pg.wait_for_timeout(700)
    back = await pg.evaluate("() => ({simple: document.body.classList.contains('simple-on'), nav: getComputedStyle(document.querySelector('.nav')).display!=='none', stored: JSON.parse(localStorage.getItem('shomer_state_v1')).simple.on})")
    chk(f"[{tag}] switch back to regular mode from Settings", (not back["simple"]) and back["nav"] and back["stored"] is False, back)
    await ctx.close()

    # ── B. an EXISTING user, 18–39: asked once on the next open; app unchanged
    ctx, pg = await new_page(b, lang, base_state(lang))
    await pg.goto(BASE, wait_until="load", timeout=60000)
    await pg.wait_for_timeout(3200)
    on = await pg.evaluate("() => document.getElementById('age-ask').classList.contains('on')")
    chk(f"[{tag}] existing user: asked on next open", on)
    em = await pg.evaluate("""async () => { window._sosPractice = true; beginSOS('practice'); await new Promise(r=>setTimeout(r,300));
        const b = document.getElementById('sos-cd-cancel').getBoundingClientRect(); const top = document.elementFromPoint(b.left+b.width/2, b.top+b.height/2);
        const r = {askOpen: document.getElementById('age-ask').classList.contains('on'), cancelOnTop: !!(top && (top.id==='sos-cd-cancel' || top.closest('#sos-cd-cancel'))), asked: !!SS.ageAsked};
        cancelCountdown(); await new Promise(r=>setTimeout(r,200)); ageAskOpen(false); return r; }""")
    chk(f"[{tag}] an SOS closes the age question; the countdown's cancel is on top", (not em["askOpen"]) and em["cancelOnTop"] and not em["asked"], em)
    await pg.click("#age-card-q .age-b >> nth=0"); await pg.wait_for_timeout(500)
    n = await pg.evaluate("""() => ({simple: document.body.classList.contains('simple-on'), ask: document.getElementById('age-ask').classList.contains('on'),
        nav: getComputedStyle(document.querySelector('.nav')).display!=='none', home: getComputedStyle(document.getElementById('simple-home')).display, band: SS.user.ageBand,
        map: getComputedStyle(document.getElementById('map-wrap')).display!=='none' })""")
    chk(f"[{tag}] 18–39: regular app unchanged (map + nav, no Simple home)", (not n["simple"]) and (not n["ask"]) and n["nav"] and n["home"] == "none" and n["band"] == "18_39" and n["map"], n)
    await pg.screenshot(path=f"{OUT}/{tag}-6-normal-user-unchanged.png")
    await pg.reload(wait_until="load"); await pg.wait_for_timeout(3200)
    again = await pg.evaluate("() => document.getElementById('age-ask').classList.contains('on')")
    chk(f"[{tag}] asked only once (not again after reopening)", not again)
    # profile: the same 4 ranges in the profile
    pf = await pg.evaluate("() => { renderProfile2(); return [...document.querySelectorAll('#pf-age .prof2-b')].map(b=>b.textContent); }")
    chk(f"[{tag}] profile age uses the same 4 ranges", pf == ["18–39", "40–64", "65–74", "75+"], pf)

    # ── C. floor: saved place → SOS record carries it (stubbed DB, nothing leaves)
    rec = await pg.evaluate("""() => {
        SS.places = {home: {lat: 31.8980, lng: 35.0104, floor: '3', apt: '12'}}; saveStore();
        userLat = 31.89830; userLng = 35.01060;  // ~35 m away
        const near = sosFloorValue();
        userLat = 31.9100; userLng = 35.0104;     // ~1.3 km away
        const far = sosFloorValue();
        userLat = 31.89830; userLng = 35.01060;
        window._sosPractice = false;
        const realFB = FB; let cap = null;
        FB = {ready:true,_authReady:true,uid:'me',db:{ref:function(){ return {set:function(r){ cap=r; return new Promise(function(){}); }, update:function(){ return Promise.resolve(); }, off:function(){} }; }}};
        curSosId = 'sos_test'; try{ fbPublishSOS(); }catch(e){ cap = {err: String(e)}; }
        FB = realFB; curSosId = null; window._sosPractice = true;
        return {near, far, rec: cap};
    }""")
    chk(f"[{tag}] floor from saved place within 80 m, none when far", rec["near"] == "f:3|a:12" and rec["far"] == "", rec)
    chk(f"[{tag}] SOS record carries floor (and nothing else new)", (rec["rec"] or {}).get("floor") == "f:3|a:12" and "age" not in (rec["rec"] or {}), rec["rec"])
    # web: no barometer estimate
    est = await pg.evaluate("() => { sosFloorPrepare(); return {est: window._sosFloorEst||'', native: shomerIsNative()}; }")
    chk(f"[{tag}] web: no barometer estimate", est["est"] == "" and not est["native"], est)
    calc = await pg.evaluate("() => [floorsFromPressure(1012.70,1013.25), floorsFromPressure(1011.45,1013.25), floorsFromPressure(1013.25,1013.25), floorsFromPressure(0,1013)]")
    chk(f"[{tag}] floor math: Δp→floors (≈4.6 m→2, ≈15 m→5, 0→0, bad→null)", calc == [2, 5, 0, None], calc)

    # ── D. the guardian's SOS card shows the floor (escaped)
    g = await pg.evaluate("""() => {
        SS.circleMembers = (SS.circleMembers||[]).concat([{id:'m1', name:'Mom', partnerUid:'p1', phoneCanon:'972500000000'}]);
        try{ onPartnerSOS('p1', {active:true, name:'', lat:31.8981, lng:35.0105, ts:Date.now(), floor:'f:3|a:12'}, 'rec'); }catch(e){ return {err:String(e)}; }
        const c = document.getElementById('in-sos-p1'); const f = c && c.querySelector('.in-sos-fl');
        const tk = document.getElementById('sos-tko'); const tf = tk && tk.querySelector('.tk-fl');
        return {card: !!c, txt: f ? f.textContent : null, hidden: f ? f.hidden : null, tko: tk ? tk.classList.contains('on') : null, tkoTxt: tf ? tf.textContent : null};
    }""")
    exp_fl = {"he": "🏢 קומה 3 · דירה 12", "en": "🏢 Floor 3 · Apt 12", "ar": "🏢 الطابق 3 · شقة 12"}[lang]
    chk(f"[{tag}] guardian SOS card shows floor from saved place", g.get("card") and g.get("txt") == exp_fl and g.get("hidden") is False, g)
    chk(f"[{tag}] full-screen SOS alert shows the floor too", g.get("tko") and g.get("tkoTxt") == exp_fl, g)
    try:
        await pg.evaluate("() => { try{ stopAlarm&&stopAlarm(); }catch(e){} try{ stopSosAlarm&&stopSosAlarm(); }catch(e){} }")
    except Exception:
        pass
    await pg.screenshot(path=f"{OUT}/{tag}-7a-guardian-fullscreen-floor.png")
    up = await pg.evaluate("""() => { onPartnerSOS('p1', {active:true, name:'', lat:31.8981, lng:35.0105, ts:Date.now(), floor:'~3'}, 'rec');
        return {card: document.querySelector('#in-sos-p1 .in-sos-fl').textContent, tko: document.querySelector('#sos-tko .tk-fl').textContent}; }""")
    exp_e = {"he": "🏢 קומה ~3 (±1)", "en": "🏢 Floor ~3 (±1)", "ar": "🏢 الطابق ~3 (±1)"}[lang]
    chk(f"[{tag}] a later floor update (barometer) refreshes card + full-screen alert", up["card"] == exp_e and up["tko"] == exp_e, up)
    try:
        await pg.click("#sos-tko .tk-b", timeout=3000); await pg.wait_for_timeout(400)
    except Exception:
        pass
    await pg.screenshot(path=f"{OUT}/{tag}-7b-guardian-card-floor.png")
    g2 = await pg.evaluate("""() => {
        onPartnerSOS('p1', {active:true, name:'', lat:31.8981, lng:35.0105, ts:Date.now(), floor:'~3'}, 'rec');
        const t1 = document.querySelector('#in-sos-p1 .in-sos-fl').textContent; const t1k = document.querySelector('#sos-tko .tk-fl').textContent;
        onPartnerSOS('p1', {active:true, name:'', lat:31.8981, lng:35.0105, ts:Date.now(), floor:'f:<img src=x onerror=window.__xss=1>'}, 'rec');
        const el = document.querySelector('#in-sos-p1 .in-sos-fl');
        return {est: t1, estTko: t1k, xssImg: !!el.querySelector('img') || !!document.querySelector('#sos-tko .tk-fl img'), xss: !!window.__xss};
    }""")
    exp_est = {"he": "🏢 קומה ~3 (±1)", "en": "🏢 Floor ~3 (±1)", "ar": "🏢 الطابق ~3 (±1)"}[lang]
    chk(f"[{tag}] barometer estimate shown as '~3 (±1)'; HTML in floor is inert text", g2["est"] == exp_est and not g2["xssImg"] and not g2["xss"], g2)
    try:
        await pg.evaluate("() => { try{ onPartnerSOSClear('p1','rec'); }catch(e){} try{ stopAlarm(); }catch(e){} }")
    except Exception:
        pass
    # profile places screen
    await pg.evaluate("() => { op('sh-prof'); setTimeout(function(){ var d=document.getElementById('pf-sec-places'); d.open=true; d.scrollIntoView({block:'start'}); }, 300); }")
    await pg.wait_for_timeout(900)
    pl = await pg.evaluate("() => ({floor: document.getElementById('pl-home-floor').value, apt: document.getElementById('pl-home-apt').value, st: document.getElementById('pl-home-st').textContent})")
    chk(f"[{tag}] profile: Home floor + apartment fields", pl["floor"] == "3" and pl["apt"] == "12", pl)
    await pg.screenshot(path=f"{OUT}/{tag}-8-profile-places.png")
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        for lang in ("he", "en", "ar"):
            await run_lang(b, lang)
        await b.close()
    res["blocked_requests"] = len(window_writes)
    res["blocked_sample"] = window_writes[:8]
    res["fails"] = fails
    open(f"{OUT}/e2e-result.json", "w").write(json.dumps(res, ensure_ascii=False, indent=1))
    print("\nTOTAL", len(res["checks"]), "checks,", fails, "failed; blocked outgoing requests:", len(window_writes))
    sys.exit(1 if fails else 0)

asyncio.run(main())
