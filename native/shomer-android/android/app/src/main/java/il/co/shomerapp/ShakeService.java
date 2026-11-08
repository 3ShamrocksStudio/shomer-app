package il.co.shomerapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
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
 * BACKGROUND SHAKE-TO-SOS — the capability a pure PWA cannot have.
 * A foreground service with a live accelerometer listener, so 5 hard shakes trigger the SOS
 * even when the app is backgrounded (and, on most devices, when swiped away — START_STICKY).
 * On trigger it sounds the un-silenceable alarm immediately AND launches the app with an
 * "shomer_sos=shake" intent so the web app completes the real SOS broadcast over REST/SSE.
 * v333: the same ShakeDetector pattern check as the web build (Low / Medium / High), and the
 * user's Settings (level + Silent mode) arrive through ShomerNativePlugin.setShakeConfig.
 */
public class ShakeService extends Service implements SensorEventListener {
  private static final String CH = "shomer_shake";
  private SensorManager sm;
  private Sensor acc;
  private PowerManager.WakeLock wl;
  private long lastFire;
  private final ShakeDetector det = new ShakeDetector("medium");
  private volatile boolean silent;
  static volatile ShakeService sInstance;
  static final String PREFS = "shomer_native";

  /** Re-read level + Silent mode (called by the plugin when the user changes Settings). */
  static void reloadConfig() { ShakeService s = sInstance; if (s != null) s.loadConfig(); }
  private void loadConfig() {
    try {
      android.content.SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
      synchronized (det) { det.setLevel(sp.getString("shake_sens", "medium")); }
      silent = sp.getBoolean("shake_silent", false);
    } catch (Exception e) {}
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    sInstance = this;
    loadConfig();
    Notification n = buildNotification();
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(2, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
    } else {
      startForeground(2, n);
    }
    if (sm == null) {
      sm = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
      if (sm != null) {
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
        if (acc != null) sm.registerListener(this, acc, SensorManager.SENSOR_DELAY_GAME);
      }
    }
    try { BeatTask.start(this); } catch (Throwable e) {}   // keep this phone visible on the dashboard while the app is off-screen
    return START_STICKY;
  }

  @Override
  public void onSensorChanged(SensorEvent e) {
    boolean hit;
    synchronized (det) { hit = det.push(e.timestamp / 1000000L, e.values[0], e.values[1], e.values[2]); }
    if (hit) fireSos();
  }

  private void fireSos() {
    long now = System.currentTimeMillis();
    if (now - lastFire < 8000) return;   // still shaking after it fired - not a second press
    lastFire = now;
    // Felt confirmation in the pocket: SOS is on its way (the countdown can still be cancelled).
    try {
      Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
      if (v != null) {
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(new long[]{0, 400, 150, 400, 150, 400}, -1));
        else v.vibrate(new long[]{0, 400, 150, 400, 150, 400}, -1);
      }
    } catch (Throwable e) {}
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
    // Silent mode (v333): a channel with NO sound, and a neutral text, so nothing on this phone
    // gives the SOS away. The vibration above is the only signal; the web countdown stays cancellable.
    final boolean quiet = silent;
    final String chId = quiet ? "shomer_shake_fire_quiet" : "shomer_shake_fire";
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel fch = new NotificationChannel(chId, quiet ? "SHOMER (silent)" : "SHOMER SOS trigger", NotificationManager.IMPORTANCE_HIGH);
      fch.setDescription("Opens the SOS screen when you shake with the screen off");
      if (quiet) { fch.setSound(null, null); fch.enableVibration(false); }
      try { fch.setBypassDnd(true); } catch (Exception e) {}
      nm.createNotificationChannel(fch);
    }
    Notification fire = new NotificationCompat.Builder(this, chId)
        .setContentTitle(quiet ? "SHOMER" : "SHOMER — SOS")
        .setContentText(quiet ? "Tap to open" : "Shake detected — opening SOS…")
        .setSilent(quiet)
        .setSmallIcon(R.drawable.ic_stat_shomer)
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

  private Notification buildNotification() {
    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel ch = new NotificationChannel(CH, "SHOMER Shake-to-SOS", NotificationManager.IMPORTANCE_LOW);
      nm.createNotificationChannel(ch);
    }
    Intent open = new Intent(this, MainActivity.class);
    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
    return new NotificationCompat.Builder(this, CH)
        .setContentTitle("SHOMER — Shake-to-SOS armed")
        .setContentText("Shake to trigger an SOS (you can cancel)")
        .setSmallIcon(R.drawable.ic_stat_shomer)
        .setOngoing(true)
        .setContentIntent(pi)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build();
  }

  @Override
  public void onDestroy() {
    if (sInstance == this) sInstance = null;
    try { if (sm != null) sm.unregisterListener(this); } catch (Exception e) {}
    try { if (wl != null && wl.isHeld()) wl.release(); } catch (Exception e) {}
    try { AlarmPlayer.stop(this); } catch (Exception e) {}
    try { BeatTask.stop(); } catch (Throwable e) {}
    super.onDestroy();
  }

  @Override public IBinder onBind(Intent intent) { return null; }
}
