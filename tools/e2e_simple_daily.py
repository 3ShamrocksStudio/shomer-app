# Run: python3 -m http.server 8899 --bind 127.0.0.1  (repo root), then: python3 tools/e2e_simple_daily.py
import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width":390,"height":844})
        pg = await ctx.new_page()
        await pg.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://127.0.0.1") else r.abort())
        st={"onboarded":True,"lang":"he","ageAsked":1,"user":{"name":"Savta","phone":"","ageBand":"75p"},"consent":{"share":False,"tos":True,"ts":1,"ver":"2026-07-10-draft"},"_lastVerSeen":"v356",
            "simple":{"on":True,"src":"age","hour":7,"okDay":"","missDay":"","since":"2000-01-01"},
            "circleMembers":[{"id":"m1","name":"Dana","partnerUid":"g1","phoneCanon":"972501112233"},{"id":"m2","name":"Pending","pending":True,"partnerUid":"g2"}]}
        await pg.add_init_script("window._sosPractice=true; localStorage.setItem('shomer_state_v1', %s);" % json.dumps(json.dumps(st)))
        await pg.goto("http://127.0.0.1:8899/shomer.html", wait_until="load")
        await pg.wait_for_timeout(2500)
        r = await pg.evaluate("""async () => {
          const out = {};
          const realW = fbRestWrite, realFB = FB; const writes = [];
          window.fbRestWrite = function(m,p,v){ writes.push({m,p,v}); return Promise.resolve(null); };
          FB = {ready:true,_authReady:true,uid:'me',db:null};
          out.call = document.getElementById('smp-call').textContent;
          // practice flag on → nothing is sent
          simpleTick(); await new Promise(r=>setTimeout(r,50)); out.sentWhilePractice = writes.length;
          window._sosPractice = false;
          // hour passed, not tapped, guardians linked → one gentle message to the linked (not pending) SHOMER
          simpleTick(); await new Promise(r=>setTimeout(r,50));
          out.miss = writes.slice(); out.missDay = SS.simple.missDay; out.st = document.getElementById('smp-ok-st').textContent;
          simpleTick(); await new Promise(r=>setTimeout(r,50)); out.afterSecondTick = writes.length;   // once a day only
          simpleOkTap(); await new Promise(r=>setTimeout(r,50)); out.okMsg = writes.slice(out.miss.length);
          // first day of Simple mode: never a message
          writes.length = 0; SS.simple.okDay=''; SS.simple.missDay=''; SS.simple.since = smpDay(); simpleTick(); await new Promise(r=>setTimeout(r,50)); out.firstDay = writes.length;
          // profile sync: owner-only node, age + ts only
          writes.length = 0; profileSync(); out.profile = writes.slice();
          SS.user.ageBand=''; profileSync(); out.profileDel = writes.slice(1);
          window.fbRestWrite = realW; FB = realFB; window._sosPractice = true;
          return out; }""")
        print(json.dumps(r, ensure_ascii=False, indent=1))
        ok = (r["sentWhilePractice"]==0 and len(r["miss"])==1 and r["miss"][0]["p"]=="alarms" and r["miss"][0]["v"]["toUid"]=="g1" and r["miss"][0]["v"]["tag"]=="daily-miss"
              and r["afterSecondTick"]==1 and len(r["okMsg"])==1 and r["okMsg"][0]["v"]["tag"]=="daily-ok" and r["firstDay"]==0
              and r["profile"]==[{"m":"PUT","p":"profile/me","v":{"age":"75p","ts":r["profile"][0]["v"]["ts"]}}] and r["profileDel"][0]["m"]=="DELETE")
        print("DAILY+PROFILE:", "PASS" if ok else "FAIL")
        await b.close()
        return ok
print(asyncio.run(main()))
