/* SH✡MER — FCM background/closed-app push handler.
   This service worker receives FCM Web Push delivered by the Cloud Functions trigger
   (sosFanout / alarmFanout). It fires on the push event EVEN WHEN THE APP IS FULLY
   CLOSED and no realtime socket is open — that is how closed-app SOS alerts reach a
   SHOMER. (The live RTDB socket is only for in-app/foreground; it is NOT relied on for
   background delivery.)
   Server sender = Cloud Functions on the Blaze plan: `firebase deploy --only functions`. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAfevYysNLWMtXluY5lZSM_VY0eyDwZ6KQ',
  authDomain: 'shomergency.firebaseapp.com',
  projectId: 'shomergency',
  messagingSenderId: '745767303099',
  appId: '1:745767303099:web:6c9605fbba940430b7769e'
});

const SHOMER_LINK = 'shomer.html';

function showShomerAlert(payload) {
  const n = (payload && payload.notification) || {};
  const d = (payload && payload.data) || {};
  const isSos = /sos/i.test(d.tag || '') || /SOS/.test(n.title || '');
  const title = n.title || (isSos ? '🚨 SH✡MER — SOS nearby' : 'SH✡MER');
  const options = {
    body: n.body || (isSos ? 'A SHOMER nearby needs help. Tap to open the map.' : ''),
    icon: 'logo-192.png',
    badge: 'logo-192.png',
    // Long, insistent vibration for an emergency; silent:false lets the device sound play.
    vibrate: isSos ? [300, 120, 300, 120, 500] : [200, 100, 200],
    silent: false,
    requireInteraction: true,           // stays on screen until acted on — must not be missed
    renotify: true,
    tag: d.tag || 'shomer-alert',
    data: { url: d.url || SHOMER_LINK, tag: d.tag || 'shomer-alert' },
    actions: isSos
      ? [{ action: 'open-sos', title: 'Open map' }, { action: 'call-100', title: 'Call 100' }]
      : [{ action: 'open-app', title: 'Open' }]
  };
  return self.registration.showNotification(title, options);
}

const messaging = firebase.messaging();
// Fires when the app is backgrounded (and, with a data-bearing payload, when closed).
messaging.onBackgroundMessage(function (payload) {
  showShomerAlert(payload);
});

// Raw push fallback — guarantees a notification even on a fully-closed app, in case
// onBackgroundMessage doesn't fire (data-only payloads / cold SW start). The OS
// coalesces same-tag notifications, so this won't double up with the SDK's own.
self.addEventListener('push', function (event) {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) { payload = {}; }
  event.waitUntil(showShomerAlert(payload));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const data = event.notification.data || {};
  if (event.action === 'call-100') {
    event.waitUntil(clients.openWindow('tel:100'));
    return;
  }
  const url = data.url || SHOMER_LINK;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (wins) {
      for (const w of wins) { if ('focus' in w) { try { w.navigate && w.navigate(url); } catch (e) {} return w.focus(); } }
      return clients.openWindow(url);
    })
  );
});
