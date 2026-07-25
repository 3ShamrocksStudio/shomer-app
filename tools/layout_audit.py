"""
Layout audit: instead of eyeballing the render, ask the DOM what is actually on
screen and where. Reports every visible marker/overlay with its CSS-pixel position
so composition can be judged without viewing the image.
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

ZOOM = float(sys.argv[1]) if len(sys.argv) > 1 else 13
LAT, LNG = 32.0853, 34.7818
STATE = {"onboarded": True, "lang": "he",
         "user": {"name": "דוד", "phone": "972524806699", "username": "shomer"},
         "security": {"phoneVerified": True, "twilioVerified": True},
         "circleMembers": [], "country": "ישראל"}


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage",
                                          "--ignore-certificate-errors"])
        ctx = await b.new_context(ignore_https_errors=True,
                                  viewport={"width": 360, "height": 779},
                                  device_scale_factor=3, locale="he-IL",
                                  geolocation={"latitude": LAT, "longitude": LNG},
                                  permissions=["geolocation"])
        await ctx.add_init_script(
            "localStorage.setItem('shomer_state_v1', %s);" % json.dumps(json.dumps(STATE)))
        pg = await ctx.new_page()
        await pg.goto("http://127.0.0.1:8899/shomer.html", wait_until="load", timeout=60000)
        await pg.wait_for_function(
            "() => typeof MAP !== 'undefined' && MAP && window.L && MAP._loaded", timeout=45000)
        await pg.wait_for_timeout(1500)

        await pg.evaluate("""async ([lat,lng,zoom]) => {
            MAP.setView([lat,lng], zoom, {animate:false});
            if (typeof statsLoad === 'function') await statsLoad();
            if (typeof STATS !== 'undefined') STATS.on = true;
            if (typeof statsRender === 'function') statsRender();
            window._pastOn = true;
            if (typeof renderPastEvents === 'function') renderPastEvents();
            window.__demo = [];
            const ev=[lat+0.0090,lng+0.0075];
            window.__demo.push(window.L.marker(ev,{icon:sosIcon(),zIndexOffset:1100}).addTo(MAP));
            [[lat+0.0155,lng+0.0020],[lat+0.0035,lng+0.0170],[lat+0.0020,lng-0.0035]].forEach(c=>{
              window.__demo.push(window.L.marker(c,{icon:responderIcon(),zIndexOffset:600}).addTo(MAP));
              window.__demo.push(window.L.polyline([c,ev],{color:'#37D98A',weight:2,opacity:.55,dashArray:'7 7'}).addTo(MAP));
            });
        }""", [LAT, LNG, ZOOM])
        await pg.wait_for_timeout(4500)

        report = await pg.evaluate("""() => {
            const VW=innerWidth, VH=innerHeight;
            const out={viewport:[VW,VH], zoom:MAP.getZoom(), markers:[], tiles:0, circles:0};
            out.tiles = document.querySelectorAll('.leaflet-tile-loaded').length;
            out.circles = document.querySelectorAll('.leaflet-overlay-pane path').length;
            document.querySelectorAll('.leaflet-marker-icon').forEach(el=>{
              const r=el.getBoundingClientRect();
              if (r.width===0) return;
              const cx=Math.round(r.left+r.width/2), cy=Math.round(r.top+r.height/2);
              let kind='other';
              const h=el.innerHTML||'', c=el.className||'';
              if (h.includes('mk-sos')||c.includes('shomer-marker')&&h.includes('core')) kind='LIVE-SOS';
              if (c.includes('past-div')) kind='past-event';
              if (h.includes('resp')||c.includes('resp')) kind='responder';
              if (h.includes('aed')||c.includes('aed')) kind='AED';
              if (c.includes('me-')||h.includes('me-dot')||h.includes('user-arrow')) kind='ME';
              out.markers.push({kind, x:cx, y:cy,
                                onscreen: cx>=0&&cx<=VW&&cy>=0&&cy<=VH,
                                cls:(''+c).slice(0,42)});
            });
            const ob=document.getElementById('ob');
            out.onboarding = ob ? getComputedStyle(ob).display : 'none';
            out.sosBtn = (()=>{const b=document.querySelector('.sos-btn,#sosBtn,#sos-btn');
                               if(!b) return null; const r=b.getBoundingClientRect();
                               return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2),
                                       w:Math.round(r.width)};})();
            return out;
        }""")

        print(f"zoom={report['zoom']}  viewport={report['viewport']}  "
              f"tiles_loaded={report['tiles']}  vector_circles={report['circles']}")
        print(f"onboarding={report['onboarding']}  sos_button={report['sosBtn']}")
        on = [m for m in report["markers"] if m["onscreen"]]
        off = len(report["markers"]) - len(on)
        print(f"markers: {len(report['markers'])} total, {len(on)} on-screen, {off} off-screen")
        from collections import Counter
        print("  by kind:", dict(Counter(m["kind"] for m in on)))
        for m in sorted(on, key=lambda m: m["y"]):
            print(f"    {m['kind']:11s} at ({m['x']:3d},{m['y']:3d})  {m['cls']}")
        await b.close()


asyncio.run(main())
