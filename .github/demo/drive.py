"""Drives the SHOMER debug build on the CI emulator through the WebView DevTools socket,
so the Play demo video can be recorded without a person: sign in with the store-review
test account (no SMS), show the Shake-to-SOS setting, then the caller locks the phone and
injects a shake. Usage: drive.py <step>   step = signin | settings | state"""
import json, subprocess, sys, time, urllib.request
import websocket  # websocket-client

def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

def page_ws():
    for _ in range(40):
        socks = [l.split()[-1].lstrip('@') for l in sh("adb shell cat /proc/net/unix").splitlines() if 'webview_devtools_remote' in l]
        if socks:
            sh(f"adb forward tcp:9222 localabstract:{socks[-1]}")
            try:
                pages = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5))
                pages = [p for p in pages if p.get('type') == 'page' and 'shomer' in p.get('url', '')]
                if pages:
                    return pages[0]['webSocketDebuggerUrl']
            except Exception as e:
                print('devtools not ready', e)
        time.sleep(3)
    raise SystemExit('no webview page found')

_id = [0]
def ev(ws, js, wait=True):
    _id[0] += 1
    ws.send(json.dumps({'id': _id[0], 'method': 'Runtime.evaluate', 'params': {'expression': js, 'awaitPromise': wait, 'returnByValue': True}}))
    while True:
        m = json.loads(ws.recv())
        if m.get('id') == _id[0]:
            r = m.get('result', {}).get('result', {})
            return r.get('value', r.get('description'))

step = sys.argv[1]
ws = websocket.create_connection(page_ws(), timeout=60)
if step == 'signin':
    print(ev(ws, "location.href+' onboarded='+(window.SS&&SS.onboarded)"))
    print(ev(ws, """(async()=>{ if(SS.onboarded) return 'already';
      try{ SS.country='IL'; ccSetButton('ob-cc','IL'); }catch(e){}
      document.getElementById('ob-name').value='Google Review';
      document.getElementById('ob-phone').value='0500000000';
      document.getElementById('ob-submit-btn').click();
      for(let i=0;i<20&&!document.getElementById('ob-code-inp');i++) await new Promise(r=>setTimeout(r,500));
      if(!document.getElementById('ob-code-inp')) return 'no code screen';
      document.getElementById('ob-code-inp').value='246802';
      await verifyTwilioCode();
      await new Promise(r=>setTimeout(r,6000));
      if(!SS.onboarded){ SS.onboarded=true; saveStore(); try{ enterApp(false); }catch(e){} }
      return 'signed in: '+isReviewAccount(); })()"""))
elif step == 'settings':
    print(ev(ws, """(async()=>{ ['tp-bar','upd-modal'].forEach(i=>{var e=document.getElementById(i);if(e)e.remove()});
      try{ shakeNativeSync(); }catch(e){}
      setReveal('[onclick="toggleShake(this)"]'); await new Promise(r=>setTimeout(r,5000));
      try{ closeAll(); }catch(e){} return 'shake on: '+(SS.shake.enabled!==false); })()"""))
elif step == 'state':
    print(ev(ws, "JSON.stringify({phase:typeof sosPhase!=='undefined'?sosPhase:null, practice:!!window._sosPractice, review:isReviewAccount()})"))
