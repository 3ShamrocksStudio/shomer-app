/* ════════════════════════════════════════════════════════════════════════
   SH✡MER — NATIVE BRIDGE
   This file only does anything when SHOMER runs inside the Capacitor shell.
   In the browser it is inert, so the exact same shomer.html works as both a
   PWA and a native app. One codebase, two shells.

   What native buys us (and what the PWA fundamentally cannot do):
     • BACKGROUND LOCATION — during a live SOS only (v351). A web page can only
       read GPS while visible; the native plugin keeps the SOS location going to
       that SOS's SHOMERs with the screen off, and stops when the SOS ends.
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

  /* v351 PRIVACY: background location runs ONLY while this phone has a live SOS, and only feeds
     that SOS's channel (read by the paired SHOMERs). It never runs at any other time, never feeds
     public presence, and stops the moment the SOS ends (hook from the app + a watchdog).
     The old code checked window.SS - SS is a script-level let, never on window - so it never
     started at all, and when it did it would have tracked 24/7. */
  function sosLive() {
    try { return typeof sosPhase !== 'undefined' && sosPhase === 'active' && !window._sosPractice &&
                 !(typeof isReviewAccount === 'function' && isReviewAccount()); } catch (e) { return false; }
  }
  function publish(loc) {
    try {
      if (!sosLive()) { stopBackground(); return; }        // SOS over → no more location, not even one tick
      if (typeof userLat !== 'undefined') { userLat = loc.latitude; userLng = loc.longitude; }
      if (typeof sosMaybeResendPos === 'function') sosMaybeResendPos();   // the SOS channel only
    } catch (e) { /* never let a location tick crash the app */ }
  }
  function bgLang(he, ar, en) { try { return currentLang === 'he' ? he : currentLang === 'ar' ? ar : en; } catch (e) { return en; } }

  var watchdog = null;
  function startBackground() {
    if (watcherId || !BG || !sosLive()) return;           // no live SOS → no tracking
    BG.addWatcher(
      {
        // Android shows this while tracking - a safety app never tracks invisibly.
        backgroundMessage: bgLang('SOS פעיל - השומרים שלך רואים את המיקום שלך עד סיום ה-SOS.', 'SOS نشط - يرى حُرّاسك موقعك حتى انتهاء SOS.', 'SOS active - your SHOMERs see your location until the SOS ends.'),
        backgroundTitle: 'SH\u2721MER - SOS',
        requestPermissions: true,
        stale: false,
        distanceFilter: 25   // metres - enough to follow a person, easy on the battery
      },
      function (location, error) {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            /* never a blocking confirm() during an SOS - it froze the alert flow (v287) */
            try { if (typeof toast === 'function') toast(bgLang('כדי שהשומרים יראו אותך גם כשהמסך כבוי בזמן SOS - אשר/י מיקום "תמיד"', 'ليراك حُرّاسك والشاشة مطفأة أثناء SOS - اسمح بالموقع "دائماً"', 'To keep your SHOMERs updated with the screen off during an SOS, allow "Always" location'), 'amb', function () { try { BG.openSettings(); } catch (_) {} }); } catch (e) {}
          }
          return;
        }
        if (location) publish(location);
      }
    ).then(function (id) {
      watcherId = id;
      if (!sosLive()) { stopBackground(); return; }       // the SOS ended while we were starting
      if (!watchdog) watchdog = setInterval(function () { if (!sosLive()) stopBackground(); }, 15000);
    }).catch(function () {});
  }

  function stopBackground() {
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
    if (!watcherId) return;
    var id = watcherId; watcherId = null;
    try { BG.removeWatcher({ id: id }).catch(function () {}); } catch (e) {}
  }

  /* The app calls these when an SOS goes live / ends. The older names (consent + ghost toggles)
     can only ever START tracking while an SOS is live, and ghost mode stops it. */
  window.nativeSosTrackStart = startBackground;
  window.nativeSosTrackStop  = stopBackground;
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
    // v351: no tracking at boot. A live SOS restored after a restart starts it (sosRestore → nativeSosTrackStart).
    setTimeout(function () { try { if (sosLive()) startBackground(); } catch (e) {} }, 2500);
  });

  /* Keep publishing when the app returns to the foreground. */
  if (Cap.Plugins.App) {
    Cap.Plugins.App.addListener('appStateChange', function (s) {
      if (s.isActive) { try { if (typeof fbPublishPresence === 'function') fbPublishPresence(); } catch (e) {} }
    });
  }
})();
