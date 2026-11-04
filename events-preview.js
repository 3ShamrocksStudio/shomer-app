/* SH✡MER · Events on the map (v322: shown to all users).
   Loaded by evpMaybeLoad() in shomer.html for everyone.
   - Everyone: the published-news seed events (events-seed.json) are shown read-only, straight from
     the file. Nothing is written or read in the database for them (no new user data).
   - Preview account (uid in the rules-protected /founders node, or the verified founder phone):
     unchanged preview mode below - seed rows + votes in events/<key>.
   - Retention: an event shows for 90 days from its event time ("at"), then drops off the map and
     the lists. pinned:true keeps it (Zalka, Dave's request).

   Data (existing rules, nothing new to deploy):
   - events/<key>             owner-only read (rules). Seed rows: seed:true + source:url.
   - events/<key>/confirms/<uid>, disputes/<uid>   {ts, w}: one vote per user, no location.
   - Nothing is written to the public dashfeed from preview. Seed rows never feed stats.
   - Rows older than 90 days are deleted by their owner on load (policy). */
(function(){
'use strict';
if(window.EVP) return;
var DAY=86400000, KEEP=90*DAY;
function he(){ return (typeof currentLang!=='undefined'?currentLang:'he')==='he'; }
function tr(o){ return o ? (he()?(o.he||o.en):(o.en||o.he)) : ''; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function r2(v){ return Math.round(v*100)/100; }
function get(path){ return fbRestGet(path).then(function(sn){ return sn&&sn.val?sn.val():sn; }); }
function ls(k,v){ try{ if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){ return null; } }

var CATS={
  violence:  {he:'אלימות', en:'Violence',   color:'#FF7A1A', g:'fist'},
  medical:   {he:'רפואי',  en:'Medical',    color:'#16A06A', g:'medcross'},
  fire:      {he:'שריפה',  en:'Fire',       color:'#D9480F', g:'fire'},
  suspicious:{he:'חשוד',   en:'Suspicious', color:'#F2B705', g:'eye'},
  other:     {he:'אחר',    en:'Other',      color:'#7E8CA0', g:'clipboard'}
};
var CANDLE='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 2.5c1.6 2 2.3 3.3 2.3 4.4A2.3 2.3 0 0 1 12 9.2a2.3 2.3 0 0 1-2.3-2.3c0-1.1.7-2.4 2.3-4.4Z" fill="#F5C840"/><rect x="9" y="10.5" width="6" height="10" rx="1.2" fill="#E6ECF6"/><path d="M7 21.5h10" stroke="#E0A828" stroke-width="1.6" stroke-linecap="round"/></svg>';

var EVP=window.EVP={ items:{}, markers:{}, order:[], cur:null, FEED:false, PV:!!window._evpPreview };
/* v322 retention: 90 days from the event time; pinned events stay */
function keepEv(e){ return !!(e && (e.pinned || ((e.at||e.ts||0) >= Date.now()-KEEP))); }
EVP.keep=keepEv;
/* v322 "מה עושים במצב כזה": calm, general tips in line with MDA / police / fire-service guidance */
var TIPS={
  violence:  {he:'התרחקו אל מקום בטוח ומואר ואל תתעמתו. מסרו למשטרה מיקום ותיאור.', en:'Move to a safe, well-lit place and do not confront anyone. Give the police the location and a description.'},
  medical:   {he:'ודאו שהמקום בטוח לפני שמתקרבים. התקשרו למד״א והישארו על הקו: המוקדן ינחה אתכם עד שהצוות יגיע.', en:'Make sure the scene is safe before you approach. Call MDA and stay on the line: the dispatcher will guide you until the team arrives.'},
  fire:      {he:'צאו מהמבנה בלי מעלית וסגרו דלתות מאחוריכם. בשטח פתוח התרחקו מכיוון התפשטות האש והעשן.', en:'Leave the building without using the lift and close doors behind you. Outdoors, move away from where the fire and smoke are spreading.'},
  suspicious:{he:'אל תיגעו ואל תרימו חפץ חשוד או נפל, גם אם הוא נראה ישן. התרחקו, הרחיקו אחרים ודווחו למשטרה.', en:'Do not touch or pick up a suspicious object or ordnance, even if it looks old. Move away, keep others away and tell the police.'},
  other:     {he:'הישמעו להנחיות הרשויות ועקבו אחרי עדכונים רשמיים בלבד.', en:'Follow the authorities\' instructions and rely on official updates only.'}
};
function evImg(t){ return 'img/events/'+(CATS[t]?t:'other')+'.svg'; }

/* ── confidence: confirm/dispute balance, each vote weighted by distance + time to the event ── */
function voteWeight(ev){
  var wd=0.3, p=(typeof _myPos==='function')?_myPos():null;
  if(p && typeof haversineM==='function'){ var km=haversineM(p.lat,p.lng,ev.lat,ev.lng)/1000; wd = km<=1?1 : km>=20?0.2 : 1-0.8*(km-1)/19; }
  var h=(Date.now()-(ev.at||ev.ts))/3600000; var wt = h<=6?1 : h>=72?0.3 : 1-0.7*(h-6)/66;
  return Math.round(wd*wt*100)/100;
}
function sumW(o){ var s=0,n=0; for(var k in (o||{})){ var v=o[k]; if(v){ n++; s+= (typeof v.w==='number'&&v.w>0&&v.w<=1)?v.w:0.3; } } return {s:s,n:n}; }
function confidence(ev){
  var c=sumW(ev.confirms), d=sumW(ev.disputes), a=ev.seed?3:1, b=1;
  var cf=(a+c.s)/(a+b+c.s+d.s);
  var lbl, col;
  if(!ev.seed && c.n+d.n===0){ lbl=he()?'טרם אומת':'Unverified'; col='var(--tx2)'; }
  else if(cf>=0.75){ lbl=he()?'אמין':'Likely true'; col='var(--grn)'; }
  else if(cf>=0.5){ lbl=he()?'סביר':'Plausible'; col='var(--amb)'; }
  else { lbl=he()?'שנוי במחלוקת':'Disputed'; col='var(--tx2)'; }
  return {cf:cf, pct:Math.round(cf*100), c:c.n, d:d.n, lbl:lbl, col:col};
}
EVP.confidence=confidence;
/* paid-dashboard row: aggregate only (no ids/names/precise location). Disabled in preview;
   seed rows are never aggregated. */
EVP.feedRow=function(ev){ if(ev.seed) return null; var q=confidence(ev); return {type:ev.type,lat:r2(ev.lat),lng:r2(ev.lng),ts:ev.ts,status:'active',c:q.c,d:q.d,cf:q.pct}; };

/* ── storage ── */
function mine(){ try{ return JSON.parse(ls('shomer_evp_mine')||'[]'); }catch(e){ return []; } }
function seedKey(id){ var map={}; try{ map=JSON.parse(ls('shomer_evp_seedkeys')||'{}'); }catch(e){} return map[id] || ('ps_'+id.replace(/[^a-z0-9]/gi,'')+'_'+String(FB.uid).slice(0,6)); }
function setSeedKey(id,k){ var map={}; try{ map=JSON.parse(ls('shomer_evp_seedkeys')||'{}'); }catch(e){} map[id]=k; ls('shomer_evp_seedkeys',JSON.stringify(map)); }

async function syncSeeds(){
  var j=null;
  try{ var r=await fetch('events-seed.json?nosw&t='+Date.now(),{cache:'no-store'}); if(r.ok) j=await r.json(); }catch(e){}
  if(!j||!j.events) return;
  for(var i=0;i<j.events.length;i++){
    var s=j.events[i], at=Date.parse(s.at)||Date.now();
    var base={by:(FB&&FB.uid)||'', ts:Date.now(), type:s.cat, seed:true, sid:s.id, source:s.src.url, srcName:s.src.name,
      mem:!!s.mem, pinned:!!s.pinned, at:at, atKind:s.atKind||'', lat:r2(s.lat), lng:r2(s.lng), area:s.area, sum:s.sum, status:'seed'};
    if(s.src2){ base.source2=s.src2.url; base.srcName2=s.src2.name; }
    if(s.tip) base.tip=s.tip;
    if(!EVP.PV){   /* everyone: read-only from the file, nothing stored */
      var lk='seed_'+s.id.replace(/[^a-z0-9]/gi,'');
      if(keepEv(base)) EVP.items[lk]=base; else delete EVP.items[lk];
      continue;
    }
    var k=seedKey(s.id);
    if(!keepEv(base)){   /* past 90 days: drop it, and remove this account's preview row */
      try{ var old=await get('events/'+k); if(old && old.by===FB.uid) await fbRestWrite('DELETE','events/'+k); }catch(e){}
      delete EVP.items[k]; continue;
    }
    var cur=null;
    try{ cur=await get('events/'+k); }catch(e){ cur='denied'; }
    if(cur==='denied'){ k='ps_'+(typeof fbDashKey==='function'?fbDashKey('').slice(0,12):Date.now()); setSeedKey(s.id,k); cur=null; }
    if(cur && cur.by===FB.uid){
      /* keep votes, refresh the published text (wording can be edited in the seed file) */
      var upd={type:base.type,source:base.source,srcName:base.srcName,source2:base.source2||null,srcName2:base.srcName2||null,tip:base.tip||null,mem:base.mem,pinned:base.pinned,at:base.at,atKind:base.atKind,lat:base.lat,lng:base.lng,area:base.area,sum:base.sum};
      try{ await fbRestWrite('PATCH','events/'+k,upd); }catch(e){}
      for(var f in upd){ if(upd[f]===null) delete cur[f]; else cur[f]=upd[f]; }
      EVP.items[k]=cur;
    } else {
      try{ await fbRestWrite('PUT','events/'+k,base); setSeedKey(s.id,k); EVP.items[k]=base; }catch(e){ EVP.items[k]=base; }  /* show it even if the write fails */
    }
  }
}
async function loadMine(){
  var m=mine(), keep=[];
  for(var i=0;i<m.length;i++){
    var k=m[i], v=null; try{ v=await get('events/'+k); }catch(e){}
    if(!v) continue;
    if(v.ts && v.ts<Date.now()-KEEP){ try{ await fbRestWrite('DELETE','events/'+k); }catch(e){} continue; }   /* 90-day policy */
    EVP.items[k]=v; keep.push(k);
  }
  ls('shomer_evp_mine',JSON.stringify(keep));
}
async function refresh(){
  if(document.hidden) return;
  if(!EVP.PV){ try{ await syncSeeds(); }catch(e){} paint(); return; }   /* everyone: re-read the file (new events, 90-day drop-off) */
  var ks=Object.keys(EVP.items);
  for(var i=0;i<ks.length;i++){ try{ var v=await get('events/'+ks[i]); if(v){ EVP.items[ks[i]]=v; } }catch(e){} }
  paint(); var _c=document.getElementById('evp-card'); if(EVP.cur && EVP.items[EVP.cur] && _c && _c.classList.contains('open')) openCard(EVP.cur,true);   /* v320: never re-opens a closed card */
}

/* ── map ── */
function pinHTML(ev){
  if(ev.mem) return '<div class="evp-pin evp-mem">'+CANDLE+'</div>';
  var c=CATS[ev.type]||CATS.other;
  return '<div class="evp-pin" style="--c:'+c.color+'"><svg class="ic" viewBox="0 0 24 24">'+(typeof _glyph==='function'?_glyph(c.g):'')+'</svg></div>';
}
function paint(){
  if(typeof MAP==='undefined'||!MAP||!window.L){ setTimeout(paint,800); return; }
  Object.keys(EVP.items).forEach(function(k){ if(!keepEv(EVP.items[k])) delete EVP.items[k]; });
  Object.keys(EVP.markers).forEach(function(k){ if(!EVP.items[k]){ try{ MAP.removeLayer(EVP.markers[k]); }catch(e){} delete EVP.markers[k]; } });
  EVP.order=Object.keys(EVP.items).sort(function(a,b){ var A=EVP.items[a],B=EVP.items[b]; if(A.mem!==B.mem) return A.mem?-1:1; return (B.at||B.ts)-(A.at||A.ts); });
  EVP.order.forEach(function(k){
    var ev=EVP.items[k]; if(!ev||typeof ev.lat!=='number') return;
    var icon=window.L.divIcon({className:'shomer-marker evp-mk',html:pinHTML(ev),iconSize:[36,36],iconAnchor:[18,18]});
    if(EVP.markers[k]){ EVP.markers[k].setIcon(icon); EVP.markers[k].setLatLng([ev.lat,ev.lng]); }
    else { var m=window.L.marker([ev.lat,ev.lng],{icon:icon,zIndexOffset:500}).addTo(MAP); m.on('click',function(e){ try{ window.L.DomEvent.stopPropagation(e); }catch(_){} openCard(k); }); EVP.markers[k]=m; }
  });
  /* v324: no counter on the map - new events light the bell (באזור שלי) instead */
  try{ var seen=+(localStorage.getItem('shomerEvSeen')||0), fresh=0;
    EVP.order.forEach(function(k){ var e=EVP.items[k], t=+new Date((e&&(e.at||e.ts))||0); if(t>seen) fresh++; });
    if(fresh>0 && typeof newUpd!=='undefined'){ newUpd=Math.max(newUpd,fresh); if(typeof updBdg==='function') updBdg(); } }catch(e){}
}

/* ── card ── */
function ago(ev){
  /* the EVENT time (seed "at" = when it happened), never the row's created/publish time */
  var t=ev.at||ev.ts, d=new Date(t);
  if(ev.atKind==='date') return d.getDate()+'.'+(d.getMonth()+1)+'.'+d.getFullYear();
  if(ev.atKind==='time'||ev.atKind==='reported'){
    var hm=''; try{ hm=d.toLocaleTimeString('he-IL',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit',hour12:false}); }catch(e){ hm=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); }
    var dm=''; try{ dm=d.toLocaleDateString('he-IL',{timeZone:'Asia/Jerusalem',day:'numeric',month:'numeric'}); }catch(e){ dm=d.getDate()+'.'+(d.getMonth()+1); }
    return dm.replace(/\//g,'.')+' · '+(ev.atKind==='reported'?'~':'')+hm;   /* ~ = first news report, exact minute not published */
  }
  if(Date.now()-t>14*DAY) return d.getDate()+'.'+(d.getMonth()+1)+'.'+d.getFullYear();
  var m=Math.max(1,Math.round((Date.now()-t)/60000));
  if(m<60) return he()?('לפני '+m+' דק׳'):(m+' min ago');
  var h=Math.round(m/60); if(h<48) return he()?('לפני '+h+' שע׳'):(h+' h ago');
  var dd=Math.round(h/24); return he()?('לפני '+dd+' ימים'):(dd+' days ago');
}
function myVote(ev){ var u=FB.uid; if(ev.confirms&&ev.confirms[u]) return 'c'; if(ev.disputes&&ev.disputes[u]) return 'd'; return ''; }
function openCard(k,quiet){
  var ev=EVP.items[k]; if(!ev) return; if(EVP.cur!==k) EVP.full=null; EVP.cur=k;
  var c=CATS[ev.type]||CATS.other, q=confidence(ev), v=myVote(ev);
  var el=document.getElementById('evp-card');
  if(!el){ el=document.createElement('div'); el.id='evp-card'; el.className='evp-card'; document.body.appendChild(el); }
  var head = ev.mem
    ? '<div class="evp-mem-l">'+CANDLE+'<span>'+(he()?'זיכרון · האירוע שבגללו נבנה SH✡MER':'In memory · the event SH✡MER was built for')+'</span></div>'
    : '';
  var area=ev.area?tr(ev.area):(he()?'באזור':'Nearby');
  var sum=ev.sum?tr(ev.sum):(ev.note||'');
  /* v322: seed events are credited to the SH✡MER team per the outlet - never to a user */
  function sl(u,n){ return u?'<a class="evp-src" href="'+esc(u)+'" target="_blank" rel="noopener">'+(he()?'מקור: ':'Source: ')+esc(n||'')+' ↗</a>':''; }
  var src = ev.seed
    ? '<div class="evp-srcs"><span class="evp-by">'+(he()?'צוות SH✡MER · לפי ':'SH✡MER team · per ')+esc(ev.srcName||'')+'</span>'+sl(ev.source,ev.srcName)+sl(ev.source2,ev.srcName2)+'</div>'
    : '<span class="evp-src">'+(he()?'דיווח אנונימי':'Anonymous report')+'</span>';
  var tip=ev.tip?tr(ev.tip):(ev.mem?'':tr(TIPS[ev.type]||TIPS.other));
  var more='<div class="evp-more">'
    +(ev.mem?'':'<img class="evp-img" src="'+evImg(ev.type)+'" alt="" width="320" height="96" loading="lazy" decoding="async">')
    +'<div class="evp-tip">'+(tip?'<b>'+(he()?'מה עושים במצב כזה':'What to do')+'</b>'+esc(tip):'')
    +'<div class="evp-sos">'+(he()?'בחירום, חייגו קודם 100 · 101 · 102':'In an emergency, call 100 · 101 · 102 first')+'</div></div></div>';
  var vote = (ev.mem || (ev.seed && !EVP.PV)) ? '' :
    '<div class="evp-vote">'
    +'<button class="evp-vb'+(v==='c'?' on':'')+'" data-v="c">✓ '+(he()?'אישרתי / ראיתי גם':'Confirm / I saw it')+(q.c?' · '+q.c:'')+'</button>'
    +'<button class="evp-vb d'+(v==='d'?' on':'')+'" data-v="d">✕ '+(he()?'לא נכון':'Not true')+(q.d?' · '+q.d:'')+'</button>'
    +'</div>';
  el.innerHTML='<button class="evp-x" aria-label="close">✕</button>'+head
    +'<div class="evp-row"><span class="evp-ic" style="background:'+(ev.mem?'#0A1628':c.color)+'">'+(ev.mem?CANDLE:'<svg class="ic" viewBox="0 0 24 24">'+_glyph(c.g)+'</svg>')+'</span>'
    +'<div class="evp-meta"><b>'+(he()?c.he:c.en)+'</b> · '+esc(ago(ev))+' · ~'+esc(area)+'</div>'
    +(ev.mem?'':'<span class="evp-chip" style="color:'+q.col+';border-color:'+q.col+'">'+q.lbl+' '+q.pct+'%</span>')+'</div>'
    +'<div class="evp-sum'+(EVP.full===k?' full':'')+'" role="button" tabindex="0" aria-expanded="'+(EVP.full===k)+'">'+esc(sum)+'<span class="evp-mo">'+(he()?' · עוד':' · more')+'</span></div>'
    +more
    +'<div class="evp-foot">'+src+'<button class="evp-next">'+(he()?'הבא ›':'Next ›')+'</button></div>'
    +vote;
  el.classList.add('open'); document.body.classList.add('evp-on');
  el.querySelector('.evp-x').onclick=closeCard;
  el.querySelector('.evp-next').onclick=function(){ var i=EVP.order.indexOf(k); go(EVP.order[(i+1)%EVP.order.length]); };
  var sm=el.querySelector('.evp-sum'), tg=function(){ var on=sm.classList.toggle('full'); el.classList.toggle('full',on); sm.setAttribute('aria-expanded',on); EVP.full=on?k:null; };
  el.classList.toggle('full', EVP.full===k);
  sm.onclick=tg; sm.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); tg(); } };
  el.querySelector('.evp-row').onclick=tg; el.querySelector('.evp-row').style.cursor='pointer';
  el.querySelectorAll('.evp-vb').forEach(function(b){ b.onclick=function(){ vote_(k,b.getAttribute('data-v')); }; });
}
function closeCard(){ var el=document.getElementById('evp-card'); if(el) el.classList.remove('open','full'); document.body.classList.remove('evp-on'); EVP.cur=null; EVP.full=null; }
function go(k){ var ev=EVP.items[k]; if(!ev) return; try{ MAP.flyTo([ev.lat,ev.lng], Math.max(12, Math.min(14, MAP.getZoom()||12)), {duration:.8}); }catch(e){} openCard(k); }
EVP.go=go; EVP.close=closeCard; EVP.CATS=CATS;   /* read by the באזור שלי list */

/* one user, one vote: atomic multi-path update (confirm XOR dispute); tap again = undo */
async function vote_(k,which){
  var ev=EVP.items[k]; if(!ev||!FB.uid) return;
  var u=FB.uid, cur=myVote(ev), up={};
  if(cur===which){ up[(which==='c'?'confirms/':'disputes/')+u]=null; }
  else { var rec={ts:Date.now(), w:voteWeight(ev)};
    up['confirms/'+u]= which==='c'?rec:null; up['disputes/'+u]= which==='d'?rec:null; }
  ev.confirms=ev.confirms||{}; ev.disputes=ev.disputes||{};
  for(var p in up){ var a=p.split('/'); if(up[p]) ev[a[0]][a[1]]=up[p]; else delete ev[a[0]][a[1]]; }
  openCard(k,true);
  try{ await fbRestWrite('PATCH','events/'+k,up); if(typeof toast==='function') toast(cur===which?(he()?'ההצבעה בוטלה':'Vote removed'):(he()?'תודה, נשמר':'Thanks, saved'),'grn'); }
  catch(e){ if(typeof toast==='function') toast(he()?'לא נשמר - נסו שוב':'Not saved - try again','amb'); }
}

/* ── chrome ── */
function css(){
  var s=document.createElement('style'); s.id='evp-css';
  s.textContent=
  '.evp-mk{background:none!important;border:none!important}'
  +'.evp-pin{width:32px;height:32px;border-radius:50%;background:var(--c);border:2px solid #0A1628;box-shadow:0 2px 8px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:#fff}'
  +'.evp-pin .ic{width:18px;height:18px}'
  +'.evp-pin.evp-mem{background:#0A1628;border:2px solid #E0A828;box-shadow:0 0 0 4px rgba(224,168,40,.25),0 2px 8px rgba(0,0,0,.5)}'
  +'.evp-card{position:absolute;left:10px;right:10px;bottom:calc(var(--nav) + 44px + env(safe-area-inset-bottom,0px));z-index:610;background:var(--n2);border:1px solid var(--b3,#2E4070);border-radius:16px;padding:12px 14px 12px;box-shadow:var(--e3);color:var(--tx0);font-family:var(--font-heb);transform:translateY(140%);visibility:hidden;pointer-events:none;transition:transform .28s cubic-bezier(.25,1,.35,1),visibility 0s .28s}'
  +'.evp-card.open{transform:none;visibility:visible;pointer-events:auto;transition:transform .28s cubic-bezier(.25,1,.35,1)}'
  +'.evp-x{position:absolute;top:6px;inset-inline-end:8px;background:none;border:none;color:var(--tx2);font-size:16px;padding:6px;cursor:pointer}'
  +'.evp-mem-l{display:flex;align-items:center;gap:6px;color:var(--g3);font-size:12px;font-weight:700;margin-bottom:6px;padding-inline-end:24px}'
  +'.evp-mem-l svg{width:16px;height:16px}'
  +'.evp-row{display:flex;align-items:center;gap:8px;padding-inline-end:22px}'
  +'.evp-ic{flex:none;width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff}'
  +'.evp-ic .ic,.evp-ic svg{width:16px;height:16px}'
  +'.evp-meta{flex:1;min-width:0;font-size:12.5px;color:var(--tx1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
  +'.evp-meta b{color:var(--tx0)}'
  +'.evp-chip{flex:none;font-size:11px;font-weight:700;border:1px solid;border-radius:999px;padding:2px 8px}'
  +'.evp-sum{margin:8px 0 6px;font-size:14px;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}'
  +'.evp-sum.full{white-space:normal}'
  +'.evp-mo{color:var(--g3);font-size:12px}.evp-sum.full .evp-mo{display:none}'
  +'.evp-more{display:none}.evp-card.full .evp-more{display:block}'
  +'.evp-card.full{max-height:calc(100vh - var(--nav,64px) - 120px);overflow:auto}'
  +'.evp-img{display:block;width:100%;height:auto;max-height:72px;object-fit:cover;border-radius:12px;margin:2px 0 8px}'
  +'.evp-tip{background:var(--n4);border-radius:12px;padding:8px 10px;font-size:12.5px;line-height:1.5;color:var(--tx1);margin-bottom:8px}'
  +'.evp-tip b{display:block;color:var(--tx0);font-size:12px;margin-bottom:2px}'
  +'.evp-sos{margin-top:4px;font-weight:700;color:var(--tx0)}'
  +'.evp-srcs{display:flex;flex-wrap:wrap;gap:2px 10px;min-width:0}.evp-by{color:var(--tx2);width:100%}'
    /* a "הידעת?" tip that is up when a card opens moves to the top, so it never covers the card */
  +'body.evp-on .nudge-bar{top:calc(env(safe-area-inset-top,0px) + var(--hdr,60px) + 8px);transform:translateX(-50%);animation:none;max-height:calc(100vh - var(--nav,64px) - 300px);overflow:auto}'
  +'.evp-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px}'
  +'.evp-src{color:var(--tx2);text-decoration:none}a.evp-src{color:var(--g3)}'
  +'.evp-next{flex:none;white-space:nowrap;background:none;border:none;color:var(--tx1);font-size:12px;cursor:pointer;padding:4px}'
  +'.evp-vote{display:flex;gap:8px;margin-top:10px}'
  +'.evp-vb{flex:1;min-height:42px;border-radius:12px;border:1px solid var(--b3,#2E4070);background:var(--n4);color:var(--tx0);font:600 13px var(--font-heb);cursor:pointer}'
  +'.evp-vb.on{background:var(--grn);border-color:var(--grn)}.evp-vb.d.on{background:var(--n6);border-color:var(--p2)}'
  +'.evp-pill{position:absolute;right:12px;bottom:calc(var(--nav) + 70px);z-index:400;height:34px;padding:0 12px;border-radius:17px;background:rgba(8,18,36,.92);border:1px solid var(--b3,#2E4070);color:var(--tx1);font:600 12px var(--font-heb);cursor:pointer}'
  +'.evp-pill b{color:var(--g3)}.evp-pill small{display:block;font-size:9px;color:var(--tx3);margin-top:-2px}'
  +'body.evp-on .evp-pill{display:none}';
  document.head.appendChild(s);
}
function chrome(){
  var host=document.getElementById('map'); host=(host&&host.parentNode)||document.body;
  /* v324: the map counter pill was removed (Dave 4 Nov) - events show under the bell */
  try{ MAP.on('click',closeCard); }catch(e){}
  /* v320: opening another sheet closes the card (it opens again only on the next tap) */
  try{ if(typeof window.op==='function' && !window.op._evp){ var _op=window.op; window.op=function(){ closeCard(); return _op.apply(this,arguments); }; window.op._evp=1; } }catch(e){}
}

async function start(){
  if(typeof MAP==='undefined'||!MAP||(EVP.PV&&(!FB||!FB.uid))){ setTimeout(start,800); return; }
  css(); chrome();
  await syncSeeds(); paint();
  if(EVP.PV){ await loadMine(); paint(); }
  setInterval(refresh, EVP.PV?30000:600000);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) refresh(); });
}
/* the founders list can arrive after the file loaded: switch this account to preview mode */
EVP.enablePreview=async function(){ if(EVP.PV||!FB||!FB.uid) return; EVP.PV=true;
  Object.keys(EVP.markers).forEach(function(k){ try{ MAP.removeLayer(EVP.markers[k]); }catch(e){} }); EVP.markers={}; EVP.items={};
  await syncSeeds(); await loadMine(); paint(); };
start();
})();
