package il.co.shomerapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.media.AudioManager;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.ContentObserver;
import android.provider.Settings;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.core.app.NotificationCompat;

/**
 * v337: detection = ShakeDetector (deliberate back-and-forth jerks, gait rejected; same code as the web).
 * Runs only while the user's switch is on (prefs shomer_native/shake_enabled, set by the web app through
 * setShakeConfig). A detection never sounds the siren: it buzzes for the pre-alarm (PRE_ALARM_MS), shows a notification
 * with "ביטול – אני בסדר", and hands the web app the trigger, which runs the cancellable countdown.
 *
 * BACKGROUND SHAKE-TO-SOS — the capability a pure PWA cannot have.
 * A foreground service with a live accelerometer listener, so 5 hard shakes trigger the SOS
 * even when the app is backgrounded (and, on most devices, when swiped away — START_STICKY).
 * On trigger it sounds the un-silenceable alarm immediately AND launches the app with an
 * "shomer_sos=shake" intent so the web app completes the real SOS broadcast over REST/SSE.
 * Same gravity-compensated 5-shake algorithm as the web build.
 */
public class ShakeService extends Service implements SensorEventListener {
  private static final String CH = "shomer_shake";
  private SensorManager sm;
  private Sensor acc;
  private PowerManager.WakeLock wl;
  private static volatile long sLastFire;   // v370: static, so cancelNativeAlarm can clear it
  private ShakeDetector det;
  /* ── v342: NATIVE pre-alarm countdown ────────────────────────────────────────────────────
   * The siren and the 8-second countdown used to live entirely in the WebView's JavaScript
   * (sosPreStart -> setInterval -> sosPreEnd -> startSosAlarm). On a locked phone Android
   * suspends that WebView's timers, so the countdown never finished, the siren never sounded
   * and nothing was ever broadcast - a shake produced a vibration and nothing else.
   * This service is a foreground service and keeps running with the screen off, so the
   * countdown belongs here. The web layer still runs its own countdown and cancel UI when it
   * is awake; whichever cancel happens first stops this one too. */
  static final long PRE_ALARM_MS = 10000;   // v378: must match SOS_PRE_S (10) in shomer.html
  private static final android.os.Handler PRE = new android.os.Handler(android.os.Looper.getMainLooper());
  /* v371: volatile. These are written on the main looper (the sensor callback) and read from the
     Capacitor task thread (stopAlarm). A stale preTask read means removeCallbacks is skipped and
     the siren starts 8 s AFTER a cancel - the one thing the cancel exists to prevent. */
  private static volatile Runnable preTask;

  /** v370: a Handler delay runs on uptimeMillis, which does NOT advance while the CPU is in deep
   *  sleep and does not wake it. On a phone with a wake-up accelerometer nothing else holds a wake
   *  lock across these 8 seconds - the sensor wakes the CPU for onSensorChanged and it can suspend
   *  again the moment that returns. So the siren could arrive late or not at all on a locked phone:
   *  the very case v342 moved this countdown out of the WebView to fix. Hold the CPU for the
   *  countdown, with a timeout so the OS reclaims it even if this process dies. */
  private static volatile PowerManager.WakeLock preWl;   // v371: volatile, same race as preTask

  /** v371: drop a pending countdown and its wake lock. NOT the same thing as a user cancel - see
   *  cancelNativeAlarm, which also clears the re-fire stamp. Arming must not clear that stamp:
   *  armNativeAlarm used to call cancelNativeAlarm, so every fire wiped its own dedupe and a user
   *  who kept shaking pushed the native countdown back 8 s at a time - on a locked phone, where
   *  that countdown is the only siren, indefinitely. */
  /* v372: synchronized, together with armNativeAlarm. volatile fixed the stale READ; this fixes
     the lost UPDATE. A cancel landing inside the microseconds of a fresh arm could read the old
     task, have it replaced underneath, then null the field - orphaning a posted countdown that no
     later cancel could reach. The siren would start 8 s after the user said they were fine. */
  private static synchronized void clearPending() {
    try { if (preTask != null) { PRE.removeCallbacks(preTask); preTask = null; } } catch (Throwable e) {}
    try { if (preWl != null && preWl.isHeld()) preWl.release(); } catch (Throwable e) {}
    preWl = null;
  }

  static synchronized void armNativeAlarm(Context c) {
    final Context app = c.getApplicationContext();
    clearPending();
    try {
      PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
      preWl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "shomer:prealarm");
      preWl.setReferenceCounted(false);
      preWl.acquire(PRE_ALARM_MS + 4000);
    } catch (Throwable e) {}
    preTask = new Runnable() {
      @Override public void run() {
        /* v373: claim this countdown under the same lock the cancel uses, or lose the last race
           in this path: the old code nulled preTask first, so a cancel arriving in the next few
           microseconds found nothing pending, stopped a siren that had not started, and then this
           runnable started it - an alarm sounding AFTER the user said they were fine, with the
           notification STOP the only way out. Exactly the thing a cancel exists to prevent. */
        /* v374: the START goes inside the monitor too. Claiming alone left a window where a
           cancel that arrived a moment later found nothing to cancel and stopped a siren that had
           not begun - and then this started it. Holding the lock across the start forces that
           cancel to queue behind it, so its stop lands after the siren exists and works. Only the
           main looper waits here, and only on itself, so there is no new way to hang. */
        /* v375: hold OUR wake lock by value. Read from the field later it could already belong
           to a newer countdown, and releasing that one would leave the fresh countdown running
           with nothing holding the CPU awake. */
        PowerManager.WakeLock mine;
        synchronized (ShakeService.class) {
          if (preTask != this) return;   // a cancel got here first - this countdown is void
          preTask = null;
          mine = preWl;
          try {
            /* The web layer's own siren may already be up. On a locked phone that siren IS
               AlarmPlayer - but AlarmPlayer also carries a linked SHOMER's alert, and treating
               someone else's alert as "already sounding" would end this user's own countdown in
               silence. Only an SOS cause counts. */
            if (!AlarmForegroundService.isPlaying() && !AlarmPlayer.isPlayingSos()) {
              Intent a = new Intent(app, AlarmForegroundService.class);
              if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(a);
              else app.startService(a);
            }
          } catch (Throwable e) {}
        }
        /* v371: the siren holds its own wake lock from here, so hand ours back instead of sitting
           on the CPU until the acquire timeout runs out. v375: ours by value, and also on the
           already-sounding path, which used to leave it held until the acquire timeout. */
        try { if (mine != null && mine.isHeld()) mine.release(); } catch (Throwable e) {}
        synchronized (ShakeService.class) { if (preWl == mine) preWl = null; }
      }
    };
    PRE.postDelayed(preTask, PRE_ALARM_MS);
  }

  /** Any cancel - the notification STOP, or "ביטול - אני בסדר" in the app - must kill this too,
   *  or a cancelled SOS would still start screaming 8 seconds later. */
  static synchronized void cancelNativeAlarm(Context c) {
    clearPending();
    /* v370: a cancel means the user decided this one was false. The 8 s re-fire guard must not
       then swallow a DELIBERATE second shake - the situation can turn real between the cancel and
       the next shake, and before this the phone answered that shake with nothing at all. */
    sLastFire = 0;
    btnMs = 0;   // v382: a cancel closes the button window too
  }

  static final String PREFS = "shomer_native";
  static boolean enabled(Context c) { return c.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("shake_enabled", false); }
  static String sens(Context c) { String s = c.getSharedPreferences(PREFS, MODE_PRIVATE).getString("shake_sens", "medium"); return ("low".equals(s) || "high".equals(s)) ? s : "medium"; }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    boolean on = enabled(this);
    Notification n = buildNotification(on);
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(2, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
    } else {
      startForeground(2, n);
    }
    // v337: this service also hosts BeatTask (locked-phone alerts from my SHOMERs + dashboard presence),
    // so it keeps running; only the accelerometer follows the user's Shake-to-SOS switch.
    if (on) listen(); else unlisten();
    try { BeatTask.start(this); } catch (Throwable e) {}   // keep this phone visible on the dashboard while the app is off-screen
    return START_STICKY;
  }

  private void listen() {
    cLv = sens(this); det = new ShakeDetector(cLv);   // (re)read the level on every start / config change
    startButtonWatch();   // v381: the gate is unconditional, so the button watch always runs
    // v368: ...and only skip the setup if we are actually LISTENING. A registerListener that
    // returned false left sm and acc non-null, so every later start returned here without trying
    // again - background shake dead for the life of the service, which is exactly the locked-screen
    // case this service exists for. Re-registering a listener already attached is harmless.
    if (sListening && sm != null && acc != null) return;
    sm = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
    if (sm == null) return;
    // With the screen off the CPU sleeps and an ordinary accelerometer stops reporting -
    // that is why shake did nothing on a locked phone. Use the WAKE-UP accelerometer where
    // the phone has one (it wakes the CPU itself); otherwise hold a partial wake lock.
    acc = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER, true);
    if (acc == null) {
      acc = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
      try {
        // v369: only when there is a sensor to keep awake FOR, and never a second lock object
        // while the first is still held. setReferenceCounted(false) makes repeat acquires on one
        // object idempotent; it does nothing for a fresh object, and unlisten() can only release
        // whatever wl points at - so a retry used to leave the previous lock held and orphaned.
        if (acc != null) {
          if (wl != null && wl.isHeld()) wl.release();
          PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
          wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "shomer:shake");
          wl.setReferenceCounted(false);
          wl.acquire();
        }
      } catch (Exception e) {}
    }
    // v367: believe registerListener's ANSWER. Taking acc != null as liveness meant a failed
    // registration still claimed the detector was running - and with the button gate on, the web
    // layer stands its own detector down on that claim. The one place this design could fail
    // CLOSED instead of open.
    sListening = (acc != null) && sm.registerListener(this, acc, SensorManager.SENSOR_DELAY_GAME);
    /* v370: registration failed - do not sit on a partial wake lock for a detector that is not
       running. Shake is already dead here; a flat battery on top of it sends no SOS either. */
    if (!sListening) { try { if (wl != null && wl.isHeld()) wl.release(); } catch (Throwable e) {} wl = null; }
  }

  private void unlisten() {
    sListening = false;   // v366
    det = null;
    stopButtonWatch();   // v359
    try { if (sm != null) sm.unregisterListener(this); } catch (Exception e) {}
    sm = null; acc = null;
    try { if (wl != null && wl.isHeld()) wl.release(); } catch (Exception e) {}
    wl = null;
  }

  @Override
  public void onSensorChanged(SensorEvent e) {
    ShakeDetector d = det; if (d == null) return;
    long t = e.timestamp / 1000000L;   // sensor clock, ms
    boolean hit = d.push(t, e.values[0], e.values[1], e.values[2]);
    // v347: the classic detector that worked until 16 Nov runs next to the new one (same as the web):
    // 8 strong peaks (gravity removed) within 1.5 s, at least 120 ms apart. Either one fires; the 8 s
    // countdown still guards every false start.
    float a = 0.9f;
    if (!cInit) { cgx = e.values[0]; cgy = e.values[1]; cgz = e.values[2]; cInit = true; }
    else {
      cgx = a * cgx + (1 - a) * e.values[0]; cgy = a * cgy + (1 - a) * e.values[1]; cgz = a * cgz + (1 - a) * e.values[2];
      double dx = e.values[0] - cgx, dy = e.values[1] - cgy, dz = e.values[2] - cgz;
      double mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
      String lv = cLv;
      double thr = "low".equals(lv) ? 20.0 : ("high".equals(lv) ? 16.0 : 18.0);
      long now = System.currentTimeMillis();
      if (mag > thr && now - cLast > 120) {
        if (cFirst == 0 || now - cFirst > 1500) { cFirst = now; cCount = 0; }
        cCount++; cLast = now;
        if (cCount >= 8) { cCount = 0; cFirst = 0; hit = true; }
      }
    }
    if (!hit) return;
    // v359: with the button gate on, a shake only counts if a hardware button was pressed in
    // the last few seconds. Reset the counters so the gated shake does not leave a primed
    // detector that fires on the next stray jolt.
    if (System.currentTimeMillis() - btnMs > BTN_WINDOW_MS) {   // v381: always - see btnGate
      cCount = 0; cFirst = 0;
      return;
    }
    fireSos();
  }
  private float cgx, cgy, cgz; private boolean cInit; private int cCount; private long cFirst, cLast; private String cLv = "medium";

  /* ── v359: BUTTON + SHAKE gate ──────────────────────────────────────────────────────────
   * When the user switches this on, a shake alone does nothing: they must press a hardware
   * button (volume up/down or power) and shake within BTN_WINDOW_MS. That is what stops a
   * pocket, a jog or a dance floor from starting an SOS.
   * Both signals reach us with the screen off because this is a foreground service:
   *   - v384: no power/screen signal at all. ACTION_SCREEN_ON fires on lift-to-wake and on a
   *     notification waking the display, neither of which is a button press.
   *   - volume -> VOLUME_CHANGED_ACTION, plus a ContentObserver on the volume_* keys only
   * Default OFF: with the gate on, a two-handed gesture is impossible for someone whose arm
   * is held or whose phone is in a coat pocket, which is the case shake exists for. */
  /** v366: true while the accelerometer is actually registered. Read by the plugin so the web
   *  layer can tell "the app is enforcing the gate" from "the plugin merely exists". A process
   *  death resets it to false, which is the safe direction - the web detector then stays on. */
  static volatile boolean sListening = false;
  /** v370: is at least one button signal actually registered? The accelerometer being live says
   *  nothing about the gate's INPUT. If both the receiver and the observers failed, btnMs would
   *  never update, every shake would be refused forever, and the web layer - which stands its own
   *  detector down on a healthy report - would leave nothing watching at all. */
  static volatile boolean sGateArmed = false;
  static final long BTN_WINDOW_MS = 10000;
  /* v382: static, so a cancel can close it. A cancel already clears the re-fire stamp; it must
     also close the button window, or "I'm fine" leaves ten seconds in which a bare shake starts
     a fresh SOS - and the volume restore that the cancel itself triggers used to prime it. */
  private static volatile long btnMs = 0;
  private BroadcastReceiver btnRx;
  private ContentObserver volObs;

  /** v381: UNCONDITIONAL. This used to read a preference, and that was the last hole: a web layer
   *  older than v378 wrote shake_btn_gate=false into every install that existed, so the service
   *  ran ungated until the web layer next configured it - which does not happen before a cold
   *  start, mid-onboarding, or after a reboot, when BootReceiver starts the service with no web
   *  layer involved at all. A bare shake was then detected and handed up, and the web layer had
   *  no way to know the gate had not been applied to THAT detection. A shake alone must never
   *  start an SOS, so the rule lives here, below any preference, any stale write and any ordering.
   *  If it ever becomes a user choice again, this is the one line to change. */
  static boolean btnGate(Context c) { return true; }

  private void startButtonWatch() {
    if (btnRx == null) {
      btnRx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
          /* v382: NOT the alarm stream. VOLUME_CHANGED_ACTION is broadcast for programmatic
             setStreamVolume too, and SHOMER raises the alarm stream to maximum whenever a siren
             starts and restores it whenever one stops - so the app was priming its own gate.
             After a cancel, or while a linked SHOMER's alert rang, a bare shake was inside the
             window and started a real SOS. The gate must only ever open for a human. */
          try {
            if (i != null && "android.media.VOLUME_CHANGED_ACTION".equals(i.getAction())
                && i.getIntExtra("android.media.EXTRA_VOLUME_STREAM_TYPE", -1) == AudioManager.STREAM_ALARM) return;
          } catch (Throwable e) { return; }   /* v384: a malformed intent must not prime the gate */
          btnMs = System.currentTimeMillis();
        }
      };
      IntentFilter f = new IntentFilter();
      /* v382: volume keys only. ACTION_SCREEN_ON fires on lift-to-wake, on an incoming
         notification waking the display and on always-on-display transitions - none of which is
         a button press, and each of which opened the gate for ten seconds. Screen-off was
         already excluded because a screen timeout fires it. So the gesture is a volume key, and
         the copy says exactly that. */
      f.addAction("android.media.VOLUME_CHANGED_ACTION");          // volume key, every recent Android
      f.addAction("android.media.MASTER_VOLUME_CHANGED_ACTION");
      try {
        // Android 13+ demands an export flag on a runtime receiver. These are system broadcasts,
        // so NOT_EXPORTED still receives them and nothing else can forge one.
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(btnRx, f, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(btnRx, f);
      } catch (Throwable e) { btnRx = null; }
    }
    if (volObs == null) {
      try {
        volObs = new ContentObserver(new android.os.Handler(android.os.Looper.getMainLooper())) {
          @Override public void onChange(boolean self) { btnMs = System.currentTimeMillis(); }
        };
        // ONE URI PER STREAM, notifyForDescendants = false. Observing Settings.System as a whole
        // fires on any system write - on a phone with adaptive brightness, screen_brightness is
        // rewritten as the light changes, which would hold the 10 s window permanently open and
        // make the gate block nothing at all.
        /* v383: NOT volume_alarm. The receiver above already refuses alarm-stream broadcasts,
           but a programmatic setStreamVolume writes this settings key too - so the observer was
           still priming the gate from SHOMER's own siren start and stop. Nothing a user presses
           before an SOS lands on the alarm stream, so dropping it costs nothing. */
        String[] keys = { "volume_music", "volume_ring",
                          "volume_notification", "volume_system", "volume_voice_call" };
        boolean obsOk = false;
        for (String k : keys) {
          try { getContentResolver().registerContentObserver(Settings.System.getUriFor(k), false, volObs); obsOk = true; }
          catch (Throwable e) {}
        }
        /* v371: a constructed observer is not a registered one. Claiming it would report the gate
           as armed with nothing feeding btnMs - every shake refused, and the web layer standing
           its own detector down on the strength of that report. */
        if (!obsOk) volObs = null;
      } catch (Throwable e) { volObs = null; }
    }
    sGateArmed = (btnRx != null || volObs != null);   // v370
  }

  private void stopButtonWatch() {
    sGateArmed = false;   // v370
    try { if (btnRx != null) unregisterReceiver(btnRx); } catch (Throwable e) {}
    btnRx = null;
    try { if (volObs != null) getContentResolver().unregisterContentObserver(volObs); } catch (Throwable e) {}
    volObs = null;
  }

  private void fireSos() {
    long now = System.currentTimeMillis();
    /* v378: the guard must OUTLAST the countdown. At 8 s each (now 10) it expired exactly when the siren
       was due, so a shake a moment later re-armed a fresh countdown and pushed the siren back. */
    if (sLastFire != 0 && now - sLastFire < PRE_ALARM_MS + 2000) return;   // still shaking after it fired
    sLastFire = now;
    // The pre-alarm, felt in the pocket: a strong buzz every second, no sound. Cancel (web or
    // notification) stops it through AlarmPlayer.stop(), which cancels the vibrator.
    try {
      Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
      if (v != null) {
        /* v379: derived from PRE_ALARM_MS. Hard-coded at 8 s it stopped two seconds before the
           siren once the countdown became 10 s - in a pocket that reads as "it cancelled". */
        int beats = (int) (PRE_ALARM_MS / 1000);
        long[] pat = new long[beats * 2 + 1]; pat[0] = 0;
        for (int i = 1; i < pat.length - 1; i += 2) { pat[i] = 450; pat[i + 1] = 550; }
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(pat, -1));
        else v.vibrate(pat, -1);
      }
    } catch (Throwable e) {}
    // v342: start the NATIVE countdown immediately. This is what actually makes the siren sound
    // on a locked phone - everything below depends on the WebView waking up, which on most
    // devices it does not.
    armNativeAlarm(this);
    // 1) The app is running (screen off / locked / in the background): fire the SOS straight
    //    into the live web app - no need to wait for the screen to come up.
    boolean fired = false;
    try { MainActivity a = MainActivity.sActive; if (a != null) fired = a.fireWebSos("shake"); } catch (Throwable e) {}
    fireSosLaunch(fired);
  }

  // 2) Bring the SOS screen up over the lock screen (and start the app if it was closed).
  private void fireSosLaunch(boolean alreadyFired) {
    // Do NOT sound the alarm here. Bring up the app so the web layer runs the
    // CANCELLABLE countdown (a few seconds to abort a false alarm before anything is
    // broadcast or the loud alarm sounds). An accidental shake must never fire an
    // un-cancellable alarm.
    //
    // Android 10+ BLOCKS a background service from calling startActivity() directly, so
    // a screen-off shake used to do nothing until the user manually opened the app. The
    // fix is a FULL-SCREEN-INTENT notification — the same mechanism alarm clocks and
    // incoming calls use to surface UI over a locked/off screen from the background.
    Intent open = new Intent(this, MainActivity.class);
    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    open.putExtra("shomer_sos", "shake");
    open.putExtra("shomer_sos_fired", alreadyFired);
    try {
      android.content.SharedPreferences sp = getSharedPreferences("shomer_native", MODE_PRIVATE);
      String k = sp.getString("sos_key", null);
      if (k == null) { k = java.util.UUID.randomUUID().toString(); sp.edit().putString("sos_key", k).commit(); }
      open.putExtra("shomer_sos_key", k);
    } catch (Exception e) {}
    PendingIntent pi = PendingIntent.getActivity(this, 1, open,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel fch = new NotificationChannel("shomer_shake_fire", "SHOMER SOS trigger", NotificationManager.IMPORTANCE_HIGH);
      fch.setDescription("Opens the SOS screen when you shake with the screen off");
      try { fch.setBypassDnd(true); } catch (Exception e) {}
      nm.createNotificationChannel(fch);
    }
    Notification fire = new NotificationCompat.Builder(this, "shomer_shake_fire")
        .setContentTitle("SH\u2721MER – זוהה ניעור")
        .setContentText("SOS יישלח בעוד " + (PRE_ALARM_MS / 1000) + " שניות. לא צריך? הקישו ביטול.")   // v379: derived, never a hard-coded number that drifts
        .setSmallIcon(R.drawable.ic_stat_shomer)
        .addAction(0, "ביטול – אני בסדר", AlarmForegroundService.stopIntent(this))
        .setTimeoutAfter(10 * 60 * 1000L)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setFullScreenIntent(pi, true)
        .setContentIntent(pi)
        .setAutoCancel(true)
        .setOngoing(false)
        .build();
    try { nm.notify(7, fire); } catch (Exception e) {}

    // Fallback for the cases where a direct launch IS permitted (app recently foregrounded).
    try { startActivity(open); } catch (Exception e) {}
  }

  @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}

  private Notification buildNotification(boolean on) {
    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel ch = new NotificationChannel(CH, "SHOMER Shake-to-SOS", NotificationManager.IMPORTANCE_LOW);
      nm.createNotificationChannel(ch);
    }
    Intent open = new Intent(this, MainActivity.class);
    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
    return new NotificationCompat.Builder(this, CH)
        .setContentTitle(on ? "SH\u2721MER – ניעור ל-SOS פעיל" : "SH\u2721MER פועל ברקע")
        /* v379: this is the one line visible the entire time shake is armed, and it still promised
             the old behaviour - that a shake on its own opens the countdown. Someone who believed
             it would shake without pressing anything in a real emergency and nothing would
             happen. */
        .setContentText(on ? ("לחיצה על כפתור העוצמה יחד עם ניעור חזק פותחת ספירה של " + (PRE_ALARM_MS / 1000) + " שניות לביטול. ניעור לבד לא מפעיל כלום.")
                           : "כדי שהתראות מהשומרים שלך יגיעו גם כשהטלפון נעול")
        .setSmallIcon(R.drawable.ic_stat_shomer)
        .setOngoing(true)
        .setContentIntent(pi)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build();
  }

  @Override
  public void onDestroy() {
    unlisten();
    // v366: NEVER silence a sounding alarm on the way out. On a locked phone AlarmPlayer IS the
    // siren (startForegroundService throws there, so the plugin falls back to it), and this
    // service is torn down by disableBackgroundShake - which the web layer now calls on every
    // return to the app. Stopping the player here silenced a live emergency.
    /* v376: this is CLEANUP, not a silencer - AlarmPlayer.stop also cancels the STOP notification,
       the pre-alarm vibration and restores the alarm volume. The condition reads inverted on
       purpose: only run it when nothing is sounding. Do not "simplify" it into an unconditional
       stop; that silences a live siren on the way out of the service. */
    try { if (!AlarmPlayer.isPlaying() && !AlarmForegroundService.isPlaying()) AlarmPlayer.stop(this); } catch (Exception e) {}
    try { BeatTask.stop(); } catch (Throwable e) {}
    super.onDestroy();
  }

  @Override public IBinder onBind(Intent intent) { return null; }
}
