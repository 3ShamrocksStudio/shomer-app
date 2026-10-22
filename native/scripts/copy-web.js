/* Copies the live SHOMER PWA into the Capacitor web dir, patching the CSP so it
   works inside the native webview. The live web app is never modified. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const WWW  = path.resolve(__dirname, '..', 'www');

const FILES = [
  'shomer.html', 'sw.js', 'manifest.json', 'version.json', 'crime-stats.json',
  'SHOMER_logo_big.png', 'SHOMER-bg.jpg',
  'logo-192.png', 'logo-512.png', 'badge-192.png', 'badge-512.png',
  'nature-badge.png', 'nature-bg.jpg', '3shamrocks.png'
];

fs.mkdirSync(WWW, { recursive: true });
for (const f of FILES) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(WWW, f)); console.log('copied', f); }
}

/* Read shomer.html, patch its CSP for Capacitor, write as index.html */
let html = fs.readFileSync(path.join(ROOT, 'shomer.html'), 'utf8');

/* Native webview serves from https://localhost + capacitor://localhost. Add those
   schemes everywhere so scripts, connections, images and the bridge all load. */
const NATIVE_ORIGINS = "https://localhost capacitor://localhost http://localhost";
html = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/, function(_, a, csp, c) {
  // add native origins to the key directives
  csp = csp.replace(/default-src ([^;]*);/, `default-src $1 ${NATIVE_ORIGINS};`);
  csp = csp.replace(/script-src ([^;]*);/, `script-src $1 ${NATIVE_ORIGINS};`);
  csp = csp.replace(/connect-src ([^;]*);/, `connect-src $1 ${NATIVE_ORIGINS};`);
  csp = csp.replace(/img-src ([^;]*);/, `img-src $1 ${NATIVE_ORIGINS};`);
  csp = csp.replace(/style-src ([^;]*);/, `style-src $1 ${NATIVE_ORIGINS};`);
  return a + csp + c;
});

/* Inject the Capacitor runtime + native bridge before </body> */
if (html.indexOf('native-bridge.js') === -1) {
  html = html.replace('</body>', '<script src="native-bridge.js"></script>\n</body>');
}

/* v276: this bundled copy is only the OFFLINE fallback (capacitor errorPath). It used to
   become a trap: once a flaky launch landed here, its update check read its own bundled
   version.json, so the phone stayed on the frozen build forever. Now, whenever the live
   site is reachable (and no SOS / dead-man switch is running), hop back to the live app. */
const LIVE_HOP = "<script>(function(){var LIVE='https://www.shomer-app.co.il/shomer.html';"
  + "if(!/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname))return;"
  + "function busy(){try{return typeof _emergencyBusy==='function'&&_emergencyBusy();}catch(e){return false;}}"
  + "function tryLive(){if(navigator.onLine===false||busy())return;"
  + "fetch('https://www.shomer-app.co.il/version.json?cb='+Date.now(),{cache:'no-store',mode:'no-cors'})"
  + ".then(function(){if(!busy())location.replace(LIVE+'?u='+Date.now());}).catch(function(){});}"
  + "tryLive();setInterval(tryLive,8000);window.addEventListener('online',tryLive);"
  + "document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')tryLive();});})();</script>";
html = html.replace(/<head([^>]*)>/i, function (m) { return m + '\n' + LIVE_HOP; });

fs.writeFileSync(path.join(WWW, 'index.html'), html);
console.log('wrote patched index.html (CSP adjusted for native)');

/* guide artwork */
const guideSrc = path.join(ROOT, 'img', 'guide');
if (fs.existsSync(guideSrc)) {
  const guideDst = path.join(WWW, 'img', 'guide');
  fs.mkdirSync(guideDst, { recursive: true });
  for (const f of fs.readdirSync(guideSrc)) fs.copyFileSync(path.join(guideSrc, f), path.join(guideDst, f));
  console.log('copied guide artwork');
}

fs.copyFileSync(path.resolve(__dirname, '..', 'native-bridge.js'), path.join(WWW, 'native-bridge.js'));
console.log('web assets ready in', WWW);
