#!/usr/bin/env python3
"""Build the SH✡MER shake-control STAGING preview (never the live site).

    python3 -I tools/build-shake-preview.py <repo-root> <out-dir>

Same method and safety as tools/build-nature-preview.py on the nature-layer branch.

Safety, in this order:
  1. every production endpoint string is replaced by an unroutable *.invalid host;
  2. the app's Firebase config is removed (the app runs in its built-in "no config" mode);
  3. the app's Content-Security-Policy connect-src is cut to map tiles + 'self';
  4. a guard script, first in <head>, refuses every network write and every request
     to a Firebase / Supabase / Worker / Twilio / shomer-app.co.il host;
  5. pages are noindex and carry a visible "preview" banner.
The build fails if any production database URL survives in the output.
"""
import os, re, shutil, sys

SRC, OUT = sys.argv[1], sys.argv[2]
PROD = ['shomergency-default-rtdb.firebaseio.com', 'shomergency.firebaseapp.com',
        'otkvebgrdiayjnqrytrn.supabase.co', 'shomer-otp.shomer3s.workers.dev']
PAGES = ['shomer.html', 'dashboard.html', 'index.html', 'privacy.html', 'terms.html']
GUARD = """<script>/* PREVIEW GUARD: nothing here may write anywhere, or talk to production */
(function(){window.SHOMER_PREVIEW=true;var BAD=/firebaseio|firebasedatabase|firebaseapp|googleapis|gstatic\\.com\\/firebasejs|supabase|workers\\.dev|twil\\.io|shomer-app\\.co\\.il|\\.invalid/i;
function bad(u,m){try{var x=new URL(u,location.href);m=(m||'GET').toUpperCase();return BAD.test(x.href)||(m!=='GET'&&m!=='HEAD');}catch(e){return true;}}
window.__previewBlocked=[];var f=window.fetch;window.fetch=function(u,o){var url=(u&&u.url)||String(u),m=(o&&o.method)||(u&&u.method)||'GET';if(bad(url,m)){window.__previewBlocked.push(m+' '+url);return Promise.resolve(new Response('null',{status:503,headers:{'Content-Type':'application/json'}}));}return f.apply(this,arguments);};
var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(bad(u,m)){window.__previewBlocked.push(m+' '+u);u='data:application/json,null';m='GET';}return xo.apply(this,[m,u].concat([].slice.call(arguments,2)));};
if(navigator.sendBeacon)navigator.sendBeacon=function(u){window.__previewBlocked.push('BEACON '+u);return true;};
var ES=window.EventSource;if(ES)window.EventSource=function(u,c){if(bad(u)){window.__previewBlocked.push('SSE '+u);return {close:function(){},addEventListener:function(){},readyState:2};}return new ES(u,c);};
var WS=window.WebSocket;if(WS)window.WebSocket=function(u,p){window.__previewBlocked.push('WS '+u);throw new Error('preview: websocket blocked');};
try{if(navigator.serviceWorker)navigator.serviceWorker.register=function(){return Promise.resolve({});};}catch(e){}
})();</script>
<meta name="robots" content="noindex,nofollow">"""
BANNER = ('<div id="pv-banner" style="position:fixed;bottom:0;left:0;right:0;z-index:2147483000;'
          'background:#E0A828;color:#0A1628;font:800 12px/1.3 Heebo,Alef,system-ui,sans-serif;'
          'text-align:center;padding:4px 8px;pointer-events:none">תצוגה מקדימה · לא האתר החי · '
          'שום דבר לא נשלח · PREVIEW, NOT LIVE · NEEDS YOUR EYES</div>')
PV_TESTER = ('<script>/* preview only: open the app without sign-in (there is no backend here). The real shake '
             'detector starts too, so on a phone the actual sensitivity can be tried. */'
             'function pvEnter(){try{if(!document.getElementById("app").classList.contains("on"))enterApp(true);}catch(e){}}</script>'
             '<div id="pv-tester" dir="rtl" style="position:fixed;top:calc(env(safe-area-inset-top,0px) + 6px);left:50%;transform:translateX(-50%);'
             'z-index:2147483001;display:flex;gap:6px;align-items:center;background:#0A1628;border:1px solid #E0A828;border-radius:999px;'
             'padding:4px 6px;font:700 12px Heebo,Alef,system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.45);max-width:96vw">'
             '<span style="color:#E0A828;padding:0 4px">בדיקה</span>'
             '<button type="button" onclick="pvEnter();setTimeout(function(){setReveal(\'#shake-sens-presets\')},250)" style="border:0;border-radius:999px;background:#E0A828;color:#0A1628;font:inherit;padding:7px 11px;cursor:pointer;white-space:nowrap">הגדרות ניעור</button>'
             '<button type="button" onclick="pvEnter();setTimeout(simulateShake,250)" style="border:1px solid #E0A828;border-radius:999px;background:none;color:#F5C840;font:inherit;padding:6px 10px;cursor:pointer;white-space:nowrap">סימולציית ניעור</button></div>')
APP_CFG = re.compile(r"<script>\s*window\.SHOMER_FB = \{.*?</script>", re.S)
APP_STUB = ("<script>window.SHOMER_FB=null;window.SHOMER_VAPID='';window.SHOMER_PUSH_URL='';"
            "window.SHOMER_FCM=null;/* preview: no Firebase, no push */</script>")
CSP_CONNECT = re.compile(r"connect-src [^;]*;")
CSP_SAFE = ("connect-src 'self' https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com "
            "https://server.arcgisonline.com https://*.arcgisonline.com https://nominatim.openstreetmap.org "
            "https://photon.komoot.io https://router.project-osrm.org https://valhalla1.openstreetmap.de "
            "https://overpass-api.de https://overpass.kumi.systems;")   # read-only map lookups, as on live


def transform(path, s):
    if path == 'shomer.html':
        s, n = APP_CFG.subn(APP_STUB, s, count=1)
        assert n == 1, 'app Firebase config block not found'
        s, n = CSP_CONNECT.subn(CSP_SAFE, s, count=1)
        assert n == 1, 'app CSP connect-src not found'
        # preview only: a tester bar, because there is no phone sign-in without a backend
        i = s.rfind('</body>')
        s = s[:i] + PV_TESTER + '\n' + s[i:]
    for h in PROD:
        s = s.replace(h, 'preview-blocked.invalid')
    s = re.sub(r'<head>', '<head>\n' + GUARD, s, count=1)
    i = s.rfind('</body>')
    s = (s[:i] + BANNER + '\n' + s[i:]) if i >= 0 else s + BANNER
    return s


def copy_assets():
    exts = ('.jpg', '.jpeg', '.png', '.webp', '.svg', '.css', '.js')
    skip = {'sw.js', 'firebase-messaging-sw.js', 'rtdb-test.html'}
    for f in os.listdir(SRC):
        p = os.path.join(SRC, f)
        if os.path.isfile(p) and f.lower().endswith(exts) and f not in skip and os.path.getsize(p) < 3_000_000:
            shutil.copy2(p, os.path.join(OUT, f))
    for f in ('crime-stats.json', 'manifest.json', 'version.json', 'events-seed.json'):
        if os.path.exists(os.path.join(SRC, f)):
            shutil.copy2(os.path.join(SRC, f), os.path.join(OUT, f))
    for d in ('img', 'site-assets', 'scenes', 'nature-assets'):
        if os.path.isdir(os.path.join(SRC, d)):
            shutil.copytree(os.path.join(SRC, d), os.path.join(OUT, d), dirs_exist_ok=True)

def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    copy_assets()
    for p in PAGES:
        s = open(os.path.join(SRC, p), encoding='utf-8').read()
        o = os.path.join(OUT, p)
        os.makedirs(os.path.dirname(o), exist_ok=True)
        open(o, 'w', encoding='utf-8').write(transform(p, s))
    open(os.path.join(OUT, 'robots.txt'), 'w').write('User-agent: *\nDisallow: /\n')
    # drop images no preview page, script or stylesheet mentions (keeps the preview small)
    text = ''
    for root, _, files in os.walk(OUT):
        for f in files:
            if f.endswith(('.html', '.js', '.css', '.json')):
                text += open(os.path.join(root, f), encoding='utf-8', errors='ignore').read()
    for d in (OUT,):
        for f in os.listdir(d):
            if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')) and f not in text:
                os.remove(os.path.join(d, f))
    for d in ('scenes', 'site-assets'):
        if os.path.isdir(os.path.join(OUT, d)) and (d + '/') not in text:
            shutil.rmtree(os.path.join(OUT, d))
    # hard gate: no production endpoint may survive anywhere in the build
    hits = []
    for root, _, files in os.walk(OUT):
        for f in files:
            if f.endswith(('.html', '.js', '.json', '.css')):
                t = open(os.path.join(root, f), encoding='utf-8', errors='ignore').read()
                for h in PROD:
                    if h in t:
                        hits.append((os.path.join(root, f), h))
    if hits:
        print('PRODUCTION ENDPOINT IN PREVIEW BUILD:', hits)
        sys.exit(1)
    print('preview built:', OUT, '| production endpoints in build: 0')


main()
