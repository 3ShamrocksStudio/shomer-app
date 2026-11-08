/* SH✡MER dashboard · published-news events layer (v322: on by default, NOT in statistics).
   ?evp=0 hides it. Same 90-day rule as the app (from the event time; pinned events stay).
   Shows the seeded published-news events from events-seed.json
   as a separate map layer. It reads no user data, writes nothing, and is never counted in
   any KPI, chart, export or aggregate. */
(function(){
'use strict';
if(window.EVPD) return; window.EVPD=true;
var COL={violence:'#FF7A1A',medical:'#16A06A',fire:'#D9480F',suspicious:'#F2B705',other:'#7E8CA0'};
var LBL={violence:'אלימות',medical:'רפואי',fire:'שריפה',suspicious:'חשוד',other:'אחר'};
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function when(e){ var d=new Date(e.at); return d.toLocaleString('he-IL',{timeZone:'Asia/Jerusalem',day:'numeric',month:'numeric',year:'numeric',hour:e.atKind==='date'?undefined:'2-digit',minute:e.atKind==='date'?undefined:'2-digit'}).replace(/(\d{1,2}:\d{2})/,e.atKind==='reported'?'~$1':'$1'); }   /* event time ('at'); ~ = first news report */
function start(){
  if(typeof MAP==='undefined'||!MAP||!window.L){ setTimeout(start,700); return; }
  fetch('events-seed.json?nosw&t='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){
    if(!j||!j.events) return;
    var layer=L.layerGroup().addTo(MAP), KEEP=90*86400000;
    var evs=j.events.filter(function(e){ return e.pinned || (Date.parse(e.at)||0) >= Date.now()-KEEP; });
    evs.forEach(function(e){
      var c=e.mem?'#0A1628':(COL[e.cat]||COL.other);
      var html='<div style="width:26px;height:26px;border-radius:50%;background:'+c+';border:2px solid '+(e.mem?'#E0A828':'#0A1628')+';box-shadow:0 2px 6px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;color:#fff;font:700 13px sans-serif">'+(e.mem?'🕯':'•')+'</div>';
      var m=L.marker([e.lat,e.lng],{icon:L.divIcon({className:'',html:html,iconSize:[26,26],iconAnchor:[13,13]}),zIndexOffset:950}).addTo(layer);
      m.bindPopup('<div dir="rtl" style="font:13px Heebo,sans-serif;max-width:250px">'
        +(e.mem?'<div style="color:#9A6C1A;font-weight:700;margin-bottom:4px">🕯 זיכרון · האירוע שבגללו נבנה SH✡MER</div>':'')
        +'<b>'+esc(LBL[e.cat]||'אחר')+'</b> · '+esc(when(e))+' · ~'+esc(e.area&&e.area.he)
        +'<div role="button" tabindex="0" title="הקשה להרחבה" onclick="var x=this.style;x.webkitLineClamp=x.webkitLineClamp===\'unset\'?\'3\':\'unset\'" style="margin:6px 0;cursor:pointer;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden">'+esc(e.sum&&e.sum.he)+'</div>'
        +'<div style="color:#888;font-size:11px">צוות SH✡MER · לפי '+esc(e.src.name)+'</div>'
        +'<a href="'+esc(e.src.url)+'" target="_blank" rel="noopener">מקור: '+esc(e.src.name)+' ↗</a>'
        +(e.src2?' · <a href="'+esc(e.src2.url)+'" target="_blank" rel="noopener">מקור: '+esc(e.src2.name)+' ↗</a>':'')
        +'<div style="color:#888;font-size:11px;margin-top:6px">מפרסום בתקשורת · לא נכלל בסטטיסטיקה</div></div>');
    });
    var b=document.createElement('div'); b.className='evp-chip';   /* hidden in the Nature view (nature-dash.css) */
    b.textContent=evs.length+' אירועים מפרסומים בתקשורת · לא נכללים בסטטיסטיקה';
    b.style.cssText='position:fixed;top:calc(8px + var(--demo-h,0px));left:50%;transform:translateX(-50%);z-index:9999;background:#0A1628;color:#F5C840;border:1px solid #E0A828;border-radius:999px;padding:6px 14px;font:600 12px Heebo,sans-serif;direction:rtl;pointer-events:none';
    document.body.appendChild(b); setTimeout(function(){ try{ b.remove(); }catch(e){} },8000);   /* v322: never covers the dashboard for long */
  }).catch(function(){});
}
start();
})();
