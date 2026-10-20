/* ════════════════════════════════════════════════════════════════════════
   SH✡MER — NATIVE BRIDGE
   This file only does anything when SHOMER runs inside the Capacitor shell.
   In the browser it is inert, so the exact same shomer.html works as both a
   PWA and a native app. One codebase, two shells.

   What native buys us (and what the PWA fundamentally cannot do):
     • BACKGROUND LOCATION — the whole reason we went native. A web page can
       only read GPS while visible; a service worker has no geolocation access
       at all. The native plugin keeps publishing presence with the app closed.
     • Real push notifications when the app is closed.
     • A foreground service notification (Android requires this for "always"
       location — and it is the honest thing to show the user anyway).
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  var Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) {
    window.SHOMER_NATIVE = false;
    return; // running as a normal web app — nothing to do
  }
  window.SHOMER_NATIVE = true;

  var BG = Cap.Plugins.BackgroundGeolocation;
  var Push = Cap.Plugins.PushNotifications;
  var LocalNotif = Cap.Plugins.LocalNotifications;

  var watcherId = null;

  /* Publish a position through the app's existing presence layer.
     We deliberately reuse the SAME functions the web app uses, so there is one
     source of truth and no divergence between platforms. */
  function publish(loc) {
    try {
      if (typeof userLat !== 'undefined') { userLat = loc.latitude; userLng = loc.longitude; }
      if (typeof fbPublishPresence === 'function') fbPublishPresence();
      if (typeof gdBroadcast === 'function') gdBroadcast();
    } catch (e) { /* never let a location tick crash the app */ }
  }

  /* Start background tracking. Gated on the user's consent — exactly like the
     web app. Consent is not a formality here: this is a person's location. */
  function startBackground() {
    if (watcherId) return;
    try {
      if (!window.SS || !SS.consent || !SS.consent.share) return;  // no consent → no tracking
      if (window.SS && SS.circleGhost) return;                     // ghost mode → paused
    } catch (e) { return; }

    BG.addWatcher(
      {
        // Android shows this while tracking. Required by the OS, and the user
        // deserves to see it — a safety app should never track invisibly.
        backgroundMessage: 'SH\u2721MER is protecting you. Your guardians can see your location.',
        backgroundTitle: 'SH\u2721MER — active',
        requestPermissions: true,
        stale: false,
        distanceFilter: 25   // metres — enough for safety, easy on the battery
      },
      function (location, error) {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            try {
              if (confirm(
                (typeof currentLang !== 'undefined' && currentLang === 'he')
                  ? 'כדי שהשומרים שלך יראו אותך גם כשהאפליקציה סגורה, צריך לאשר גישה למיקום "תמיד". לפתוח הגדרות?'
                  : 'To let your guardians see you even when the app is closed, allow "Always" location access. Open settings?'
              )) BG.openSettings();
            } catch (e) {}
          }
          return;
        }
        if (location) publish(location);
      }
    ).then(function (id) { watcherId = id; })
     .catch(function () {});
  }

  function stopBackground() {
    if (!watcherId) return;
    BG.removeWatcher({ id: watcherId }).catch(function () {});
    watcherId = null;
  }

  /* Expose so the app's consent/ghost toggles can drive native tracking too. */
  window.nativeStartTracking = startBackground;
  window.nativeStopTracking  = stopBackground;

  /* Push notifications — SOS must reach a guardian whose phone is in their pocket. */
  function initPush() {
    if (!Push) return;
    Push.requestPermissions().then(function (r) {
      if (r.receive === 'granted') Push.register();
    }).catch(function () {});

    Push.addListener('registration', function (token) {
      // Store the FCM token against this user so the SOS path can target them.
      try {
        if (window.FB && FB.ready && FB.uid && typeof fbRestWrite === 'function') {
          fbRestWrite('PUT', 'presence/' + FB.uid + '/push', token.value);
        }
      } catch (e) {}
    });

    Push.addListener('pushNotificationReceived', function (n) {
      try {
        LocalNotif.schedule({
          notifications: [{
            id: Date.now() % 100000,
            title: n.title || 'SH\u2721MER',
            body: n.body || '',
            sound: 'default'
          }]
        });
      } catch (e) {}
    });
  }

  /* Boot */
  document.addEventListener('DOMContentLoaded', function () {
    initPush();
    // Give the app a moment to restore its store, then honour existing consent.
    setTimeout(function () {
      try { if (window.SS && SS.consent && SS.consent.share) startBackground(); } catch (e) {}
    }, 2500);
  });

  /* Keep publishing when the app returns to the foreground. */
  if (Cap.Plugins.App) {
    Cap.Plugins.App.addListener('appStateChange', function (s) {
      if (s.isActive) { try { if (typeof fbPublishPresence === 'function') fbPublishPresence(); } catch (e) {} }
    });
  }
})();
