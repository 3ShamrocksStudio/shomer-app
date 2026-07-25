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
LAT, LNG = 32.0853, 34.7818          # Tel Aviv — same area as the previous shot

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
            """async ([lat, lng, zoom]) => {
            MAP.setView([lat, lng], zoom, {animate:false});

            // police crime-stat circles — the app's own loader + renderer
            if (typeof statsLoad === 'function') { await statsLoad(); }
            if (typeof STATS !== 'undefined') { STATS.on = true; }
            if (typeof statsRender === 'function') statsRender();
            if (typeof statsLegPaint === 'function') { try { statsLegPaint(); } catch(e){} }

            // past events — the app's own layer
            window._pastOn = true;
            if (typeof renderPastEvents === 'function') renderPastEvents();

            // live SOS + converging responders, drawn with the app's own icons
            window.__demo = [];
            const ev = [lat + 0.0090, lng + 0.0075];
            if (typeof sosIcon === 'function') {
              window.__demo.push(window.L.marker(ev, {icon: sosIcon(), zIndexOffset: 1100}).addTo(MAP));
            }
            if (typeof responderIcon === 'function') {
              [[lat+0.0155, lng+0.0020],
               [lat+0.0035, lng+0.0170],
               [lat+0.0020, lng-0.0035]].forEach(c => {
                 window.__demo.push(window.L.marker(c, {icon: responderIcon(), zIndexOffset: 600}).addTo(MAP));
                 window.__demo.push(window.L.polyline([c, ev], {
                   color:'#37D98A', weight:2, opacity:.55, dashArray:'7 7'}).addTo(MAP));
              });
            }
        }""",
            [LAT, LNG, ZOOM],
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
            onboarding: (document.getElementById('ob')||{}).style ? document.getElementById('ob').style.display : 'n/a'
        })""")
        print("state:", st)
        await b.close()


asyncio.run(main())
