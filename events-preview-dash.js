/* SH✡MER dashboard · events preview layer (NOT public, NOT in statistics).
   Loaded only with ?evp=1. Shows the seeded published-news events from events-seed.json
   as a separate map layer. It reads no user data, writes nothing, and is never counted in
   any KPI, chart, export or aggregate. */
(function(){
'use strict';
if(window.EVPD) return; window.EVPD=true;
var COL={violence:'#FF7A1A',medical:'#16A06A',fire:'#D9480F',suspicious:'#F2B705',other:'#7E8CA0'};
var LBL={violence:'אלימות',medical:'רפואי',fire:'שריפה',suspicious:'חשוד',other:'אחר'};
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function when(e){ var d=new Date(e.at); return d.toLocaleString('he-IL',{timeZone:'Asia/Jerusalem',day:'numeric',month:'numeric',year:'numeric',hour:e.atKind==='date'?undefined:'2-digit',minute:e.atKind==='date'?undefined:'2-digit'}); }
function start(){
  if(typeof MAP==='undefined'||!MAP||!window.L){ setTimeout(start,700); return; }
  fetch('events-seed.json?nosw&t='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){
    if(!j||!j.events) return;
    var layer=L.layerGroup().addTo(MAP);
    j.events.forEach(function(e){
      var c=e.mem?'#0A1628':(COL[e.cat]||COL.other);
      var html='<div style="width:26px;height:26px;border-radius:50%;background:'+c+';border:2px solid '+(e.mem?'#E0A828':'#0A1628')+';box-shadow:0 2px 6px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font:700 13px sans-serif">'+(e.mem?'🕯':'•')+'</div>';
      var m=L.marker([e.lat,e.lng],{icon:L.divIcon({className:'',html:html,iconSize:[26,26],iconAnchor:[13,13]}),zIndexOffset:950}).addTo(layer);
      m.bindPopup('<div dir="rtl" style="font:13px Heebo,sans-serif;max-width:250px">'
        +(e.mem?'<div style="color:#9A6C1A;font-weight:700;margin-bottom:4px">🕯 זיכרון · האירוע שבגללו נבנה SH✡MER</div>':'')
        +'<b>'+esc(LBL[e.cat]||'אחר')+'</b> · '+esc(when(e))+' · ~'+esc(e.area&&e.area.he)
        +'<div style="margin:6px 0">'+esc(e.sum&&e.sum.he)+'</div>'
        +'<a href="'+esc(e.src.url)+'" target="_blank" rel="noopener">מתוך פרסום בתקשורת · '+esc(e.src.name)+' ↗</a>'
        +'<div style="color:#888;font-size:11px;margin-top:6px">תצוגה מקדימה · לא נכלל בסטטיסטיקה</div></div>');
    });
    var b=document.createElement('div');
    b.textContent='תצוגה מקדימה: '+j.events.length+' אירועים מפרסומים בתקשורת · לא נכללים בסטטיסטיקה';
    b.style.cssText='position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;background:#0A1628;color:#F5C840;border:1px solid #E0A828;border-radius:999px;padding:6px 14px;font:600 12px Heebo,sans-serif;direction:rtl;pointer-events:none';
    document.body.appendChild(b);
  }).catch(function(){});
}
start();
})();
