// SHâ¡MER Service Worker v2
// Offline support + Push notifications for emergency alerts
// By 3Shamrocks.Studio
//
// NOTE: github.io serves every project of an org from ONE shared origin
// (https://<org>.github.io). A service worker or CacheStorage left behind by
// another project on that origin can hijack navigations. This SW therefore
// (a) uses network-first for navigations so a stale shell can never trap the
// user, and (b) deletes every cache it does not own on activate.

const CACHE_NAME = 'shomer-v206-cache';
const SW_VERSION = 'v206';
const urlsToCache = [
  './',
  'index.html',
  'shomer.html',
  'manifest.json',
  'logo-192.png',
  'logo-512.png',
  'sos-icon-96.png',
  'report-icon-96.png',
  '3shamrocks.png',
  'SHOMER_logo_big.png',
  'SHOMER-bg.jpg',
  // Emergency-guide topic illustrations â precached so the (offline-capable) guide shows
  // its pictograms with no network.
  'img/guide/cpr.jpg','img/guide/choke.jpg','img/guide/bleed.jpg','img/guide/burn.jpg',
  'img/guide/stroke.jpg','img/guide/heart.jpg','img/guide/allergy.jpg','img/guide/seizure.jpg',
  'img/guide/drown.jpg','img/guide/shock.jpg','img/guide/faint.jpg','img/guide/bone.jpg','img/guide/call.jpg',
  'img/guide/ptsd.jpg','img/guide/selfdef.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)).catch(() => {})
  );
  // Adopt a new build promptly so a device can't get stuck on a stale shell. This is
  // SAFE now: the page no longer reloads on controllerchange (that earlier reload loop
  // was removed), so skipWaiting takes over without reloading or killing the socket.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Purge ALL other caches on this (shared) origin â including any left by
    // sibling org projects â so nothing stale or foreign can be served.
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Lightweight instrumentation â the ?diag panel queries this ('swstats') so a real
// device can PROVE whether this SW ever intercepts a Firebase request (it must not).
let SW_STATS = { total: 0, fbBypassed: 0, handled: 0 };

self.addEventListener('fetch', event => {
  const req = event.request;
  const u = req.url;
  SW_STATS.total++;

  // âââ #1 FIRST-LINE FIREBASE / GOOGLE BYPASS (root-cause fix) âââââââââââââââââââ
  // ANY request to a Firebase / Google backend endpoint, or any RTDB transport path,
  // goes STRAIGHT to the network. The SW must NEVER intercept, cache, delay, or
  // respondWith the Realtime-DB handshake / long-poll (/.lp) / websocket negotiation
  // (/.ws) / .info, or the auth-token calls (identitytoolkit / securetoken). This is
  // checked FIRST and synchronously (no URL parsing) so the handler returns with
  // minimal work. Symptom it fixes: installed-PWA Android hung on "connecting" â raw
  // socket + auth OK, but the SDK session never completed while the SW was active
  // (works in incognito with no SW). Do NOT weaken this.
  if (
    u.indexOf('firebaseio.com') !== -1 ||
    u.indexOf('firebasedatabase.app') !== -1 ||
    u.indexOf('firebaseapp.com') !== -1 ||
    u.indexOf('googleapis.com') !== -1 ||            // identitytoolkit / securetoken / fcm token
    u.indexOf('google.com') !== -1 ||                // apis/accounts.google.com auth
    u.indexOf('gstatic.com') !== -1 ||               // the Firebase SDK bundles
    u.indexOf('/.lp') !== -1 || u.indexOf('/.ws') !== -1 || u.indexOf('/.info') !== -1
  ) {
    SW_STATS.fbBypassed++;
    return; // no respondWith â browser makes the request natively, fully untouched
  }

  if (req.method !== 'GET') return;

  // Belt-and-braces: any OTHER cross-origin request (map tiles, OSRM, fonts) also
  // goes straight to the network, untouched by the SW.
  let url;
  try { url = new URL(u); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // ESCAPE HATCH: never touch the reset page or any ?nosw / ?fresh request. Let
  // them go straight to the network so this SW can never trap a user who is
  // trying to force the latest build. (reset.html is also never cached.)
  if (/(^|\/)(reset|rtdb-test)\.html$/.test(url.pathname) || /(^|\/)version\.json$/.test(url.pathname) || /[?&](nosw|fresh)\b/i.test(url.search)) {
    return; // straight to network (version.json must stay fresh for the auto-update check)
  }

  // Navigation requests: network-first, fall back to cached app shell.
  if (req.mode === 'navigate') {
    SW_STATS.handled++;
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('shomer.html')))
    );
    return;
  }

  // Same-origin assets: cache-first, then network (offline-friendly).
  SW_STATS.handled++;
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});

// Allow the page to tell the SW to activate immediately after an update,
// and to ASK which version is actually controlling the page (so the diagnostic
// panel can show "are we on the latest build, or a stale cached SW?").
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'version' && event.ports && event.ports[0]) {
    event.ports[0].postMessage(SW_VERSION);
  }
  // Diagnostics: report fetch stats so ?diag can PROVE the SW never intercepted a
  // Firebase request (fbBypassed should be > 0 and NONE handled/cached).
  if (event.data === 'swstats' && event.ports && event.ports[0]) {
    event.ports[0].postMessage(JSON.stringify(SW_STATS));
  }
});

// Push notification handler (for SOS / emergency alerts)
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'ð¨ SHâ¡MER Emergency Alert';
  const options = {
    body: data.body || 'Immediate help needed nearby. Tap to open map.',
    icon: 'logo-192.png',
    badge: 'logo-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'shomer-emergency',
    requireInteraction: true,
    actions: [
      { action: 'open-map', title: 'Open Map' },
      { action: 'call-100', title: 'Call 100' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'call-100') {
    clients.openWindow('tel:100');
  } else {
    clients.openWindow('shomer.html');
  }
});


// Allow the page to activate a new SW immediately (used by forceFreshReload).
self.addEventListener('message', function(e){
  if(e.data && e.data.type === 'SKIP_WAITING'){ self.skipWaiting(); }
});
