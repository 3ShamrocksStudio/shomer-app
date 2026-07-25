#!/usr/bin/env python3
"""
Render the hero screenshot from the REAL app.

No drawing, no mockup, no invented UI. This boots shomer.html in Chromium and lets
the APP render itself, then calls the app's OWN functions to populate the map:
  statsRender()      -> police crime circles
  renderPastEvents() -> past-event pins (incl. the year badge)
  sosIcon()          -> live SOS marker
  responderIcon()    -> converging responder markers
Every pixel is produced by shomer.html's own code and CSS.
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

PORT = 8899
URL = f"http://127.0.0.1:{PORT}/shomer.html"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/hero_real.png"
ZOOM = float(sys.argv[2]) if len(sys.argv) > 2 else 13
STATS_ON = (sys.argv[5].lower() != 'off') if len(sys.argv) > 5 else True
LAT = float(sys.argv[3]) if len(sys.argv) > 3 else 32.0853
LNG = float(sys.argv[4]) if len(sys.argv) > 4 else 34.7818

STATE = {
    "onboarded": True,
    "lang": "he",
    "user": {"name": "דוד", "phone": "972524806699", "username": "shomer", "profession": ""},
    "security": {"phoneVerified": True, "twilioVerified": True},
    "circleMembers": [],
    "country": "ישראל",
}


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox","--disable-dev-shm-usage",
                                          "--ignore-certificate-errors",
                                          "--ignore-urlfetcher-cert-requests"])
        ctx = await b.new_context(
            ignore_https_errors=True,
            viewport={"width": 360, "height": 779},
            device_scale_factor=3,
            locale="he-IL",
            geolocation={"latitude": LAT, "longitude": LNG},
            permissions=["geolocation"],
            user_agent=("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/126 Mobile Safari/537.36"),
        )
        await ctx.add_init_script(
            "localStorage.setItem('shomer_state_v1', %s);" % json.dumps(json.dumps(STATE))
        )
        pg = await ctx.new_page()
        pg.on("console", lambda m: print("  [console]", m.type, m.text[:160])
              if m.type in ("error", "warning") else None)

        await pg.goto(URL, wait_until="load", timeout=60000)

        # wait for Leaflet + the app's MAP object
        await pg.wait_for_function("() => typeof MAP !== 'undefined' && MAP && window.L && MAP._loaded",
                                   timeout=45000)
        await pg.wait_for_timeout(1500)

        # ── everything below calls the APP's own functions ──────────────────
        await pg.evaluate(
            """async ([lat, lng, zoom, statsOn]) => {
            MAP.setView([lat, lng], zoom, {animate:false});

            // police crime-stat circles — the app's own loader + renderer
            if (typeof statsLoad === 'function') { await statsLoad(); }
            if (typeof STATS !== 'undefined') { STATS.on = statsOn; }
            if (statsOn && typeof statsRender === 'function') statsRender();
            if (!statsOn && typeof statsClear === 'function') statsClear();
            if (typeof statsLegPaint === 'function') { try { statsLegPaint(); } catch(e){} }

            // past events — the app's own layer
            window._pastOn = true;
            if (typeof renderPastEvents === 'function') renderPastEvents();

            // Pins only. The app never draws connector lines between responders and
            // an event — its only route line is showRespToPerson(), a cyan OSRM
            // walking route for the ONE user who tapped "אני בדרך". So: no lines.
            window.__demo = [];
            const pt = (x, y) => MAP.containerPointToLatLng(window.L.point(x, y));
            const P = (x, y) => { const q = pt(x, y); return [q.lat, q.lng]; };

            // live event
            if (typeof sosIcon === 'function') {
              window.__demo.push(window.L.marker(P(214, 286), {icon: sosIcon(), zIndexOffset: 1100}).addTo(MAP));
            }
            // other SH✡MER users — the app's own circle-member pin
            if (typeof circleIcon === 'function') {
              [[108, 178, 'יוסי', '#37D98A', '🛡'],
               [296, 372, 'מיכל', '#4EA8FF', '👮'],
               [134, 486, 'אבי',  '#E0A828', '🚑'],
               [268, 556, 'נועה', '#37D98A', '🛡']].forEach(([x, y, nm, col, em]) => {
                 window.__demo.push(window.L.marker(P(x, y), {
                   icon: circleIcon({name: nm, color: col, emoji: em, sos: false}),
                   zIndexOffset: 600}).addTo(MAP));
              });
            }
        }""",
            [LAT, LNG, ZOOM, STATS_ON],
        )

        await pg.wait_for_timeout(4500)          # tiles + CSS animations settle
        await pg.screenshot(path=OUT)
        print("wrote", OUT)

        st = await pg.evaluate("""() => ({
            statsCircles: (typeof STATS!=='undefined' && STATS.layer) ? STATS.layer.length : -1,
            pastOn: (typeof _pastOn!=='undefined') ? _pastOn : null,
            pastLayer: (typeof _pastLayer!=='undefined' && _pastLayer) ? 1 : 0,
            demo: (window.__demo||[]).length,
            appVer: (typeof APP_VER!=='undefined') ? APP_VER : '?',
            zoom: MAP.getZoom(),
            onboarding: (document.getElementById('ob')||{}).style ? document.getElementById('ob').style.display : 'n/a',
            lines: document.querySelectorAll('.leaflet-overlay-pane path').length,
            pins: Array.from(document.querySelectorAll('.leaflet-marker-icon')).map(el=>{
                const r=el.getBoundingClientRect();
                if(r.width===0) return null;
                const x=Math.round(r.left+r.width/2), y=Math.round(r.top+r.height/2);
                if(x<0||x>innerWidth||y<0||y>innerHeight) return null;
                const h=el.innerHTML||'';
                let k='other';
                if(h.includes('mk-sos')) k='EVENT';
                else if(h.includes('mk-circle')) k='shomer-user';
                else if((el.className||'').includes('past-div')) k='past-event';
                else if(h.includes('mk3')) k='ME';
                else if(h.includes('aed')) k='AED';
                return k+'@'+x+','+y;
            }).filter(Boolean)
        })""")
        print("state:", st)
        await b.close()


asyncio.run(main())
