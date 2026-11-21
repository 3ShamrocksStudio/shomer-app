package il.co.shomerapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
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
 * setShakeConfig). A detection never sounds the siren: it buzzes for the 8 s pre-alarm, shows a notification
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
  private long lastFire;
  private ShakeDetector det;
  /* ── v342: NATIVE pre-alarm countdown ────────────────────────────────────────────────────
   * The siren and the 8-second countdown used to live entirely in the WebView's JavaScript
   * (sosPreStart -> setInterval -> sosPreEnd -> startSosAlarm). On a locked phone Android
   * suspends that WebView's timers, so the countdown never finished, the siren never sounded
   * and nothing was ever broadcast - a shake produced a vibration and nothing else.
   * This service is a foreground service and keeps running with the screen off, so the
   * countdown belongs here. The web layer still runs its own countdown and cancel UI when it
   * is awake; whichever cancel happens first stops this one too. */
  static final long PRE_ALARM_MS = 8000;   // must match SOS_PRE_S (8) in shomer.html
  private static final android.os.Handler PRE = new android.os.Handler(android.os.Looper.getMainLooper());
  private static Runnable preTask;

  static void armNativeAlarm(Context c) {
    final Context app = c.getApplicationContext();
    cancelNativeAlarm(app);
    preTask = new Runnable() {
      @Override public void run() {
        preTask = null;
        try {
          if (AlarmForegroundService.isPlaying()) return;   // the web layer got there first
          Intent a = new Intent(app, AlarmForegroundService.class);
          if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(a);
          else app.startService(a);
        } catch (Throwable e) {}
      }
    };
    PRE.postDelayed(preTask, PRE_ALARM_MS);
  }

  /** Any cancel - the notification STOP, or "ביטול - אני בסדר" in the app - must kill this too,
   *  or a cancelled SOS would still start screaming 8 seconds later. */
  static void cancelNativeAlarm(Context c) {
    try { if (preTask != null) { PRE.removeCallbacks(preTask); preTask = null; } } catch (Throwable e) {}
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
    if (btnGate(this)) startButtonWatch(); else stopButtonWatch();   // v359: only watch buttons when the gate is on
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
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "shomer:shake");
        wl.setReferenceCounted(false);
        wl.acquire();
      } catch (Exception e) {}
    }
    // v367: believe registerListener's ANSWER. Taking acc != null as liveness meant a failed
    // registration still claimed the detector was running - and with the button gate on, the web
    // layer stands its own detector down on that claim. The one place this design could fail
    // CLOSED instead of open.
    sListening = (acc != null) && sm.registerListener(this, acc, SensorManager.SENSOR_DELAY_GAME);
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
    if (btnGate(this) && System.currentTimeMillis() - btnMs > BTN_WINDOW_MS) {
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
   *   - power  -> ACTION_SCREEN_ON (a wake). NOT screen-off: that also fires on a timeout.
   *   - volume -> VOLUME_CHANGED_ACTION, plus a ContentObserver on the volume_* keys only
   * Default OFF: with the gate on, a two-handed gesture is impossible for someone whose arm
   * is held or whose phone is in a coat pocket, which is the case shake exists for. */
  /** v366: true while the accelerometer is actually registered. Read by the plugin so the web
   *  layer can tell "the app is enforcing the gate" from "the plugin merely exists". A process
   *  death resets it to false, which is the safe direction - the web detector then stays on. */
  static volatile boolean sListening = false;
  static final long BTN_WINDOW_MS = 10000;
  private volatile long btnMs = 0;
  private BroadcastReceiver btnRx;
  private ContentObserver volObs;

  static boolean btnGate(Context c) {
    try { return c.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("shake_btn_gate", false); }
    catch (Throwable e) { return false; }
  }

  private void startButtonWatch() {
    if (btnRx == null) {
      btnRx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) { btnMs = System.currentTimeMillis(); }
      };
      IntentFilter f = new IntentFilter();
      // Power: ACTION_SCREEN_ON only. ACTION_SCREEN_OFF also fires on a screen TIMEOUT, which
      // would prime the gate every time the phone falls asleep in a pocket - the exact accident
      // this gate exists to stop. So the power gesture is "wake the screen, then shake".
      f.addAction(Intent.ACTION_SCREEN_ON);
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
        String[] keys = { "volume_music", "volume_ring", "volume_alarm",
                          "volume_notification", "volume_system", "volume_voice_call" };
        for (String k : keys) {
          try { getContentResolver().registerContentObserver(Settings.System.getUriFor(k), false, volObs); }
          catch (Throwable e) {}
        }
      } catch (Throwable e) { volObs = null; }
    }
  }

  private void stopButtonWatch() {
    try { if (btnRx != null) unregisterReceiver(btnRx); } catch (Throwable e) {}
    btnRx = null;
    try { if (volObs != null) getContentResolver().unregisterContentObserver(volObs); } catch (Throwable e) {}
    volObs = null;
  }

  private void fireSos() {
    long now = System.currentTimeMillis();
    if (now - lastFire < 8000) return;   // still shaking after it fired - not a second press
    lastFire = now;
    // The 8 s pre-alarm, felt in the pocket: a strong buzz every second, no sound. Cancel (web or
    // notification) stops it through AlarmPlayer.stop(), which cancels the vibrator.
    try {
      Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
      if (v != null) {
        long[] pat = new long[17]; pat[0] = 0;
        for (int i = 1; i < 17; i += 2) { pat[i] = 450; pat[i + 1] = 550; }
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
        .setContentText("SOS יישלח בעוד 8 שניות. לא צריך? הקישו ביטול.")
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
        .setContentText(on ? "ניעור חזק הלוך-חזור פותח ספירה של 8 שניות לביטול" : "כדי שהתראות מהשומרים שלך יגיעו גם כשהטלפון נעול")
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
    try { if (!AlarmPlayer.isPlaying() && !AlarmForegroundService.isPlaying()) AlarmPlayer.stop(this); } catch (Exception e) {}
    try { BeatTask.stop(); } catch (Throwable e) {}
    super.onDestroy();
  }

  @Override public IBinder onBind(Intent intent) { return null; }
}
