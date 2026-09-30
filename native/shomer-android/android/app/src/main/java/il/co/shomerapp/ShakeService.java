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

import androidx.core.app.NotificationCompat;

/**
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
  private float gx, gy, gz;
  private int count;
  private long firstT, lastPeak;
  private static final int REQUIRED = 6;
  private static final long WINDOW = 1500, MIN_GAP = 120;
  private static final double THRESHOLD = 19.0; // m/s^2 (gravity removed) — raised so casual movement never triggers

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    Notification n = buildNotification();
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(2, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
    } else {
      startForeground(2, n);
    }
    sm = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
    if (sm != null) {
      acc = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
      if (acc != null) sm.registerListener(this, acc, SensorManager.SENSOR_DELAY_GAME);
    }
    return START_STICKY;
  }

  @Override
  public void onSensorChanged(SensorEvent e) {
    float a = 0.8f;
    gx = a * gx + (1 - a) * e.values[0];
    gy = a * gy + (1 - a) * e.values[1];
    gz = a * gz + (1 - a) * e.values[2];
    double dx = e.values[0] - gx, dy = e.values[1] - gy, dz = e.values[2] - gz;
    double mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
    long now = System.currentTimeMillis();
    if (mag > THRESHOLD && now - lastPeak > MIN_GAP) {
      if (firstT == 0 || now - firstT > WINDOW) { firstT = now; count = 0; }
      count++;
      lastPeak = now;
      if (count >= REQUIRED) { count = 0; firstT = 0; fireSos(); }
    }
  }

  private void fireSos() {
    // Do NOT sound the alarm here. Launch the app so the web layer runs the
    // CANCELLABLE countdown (a few seconds to abort a false alarm before anything is
    // broadcast or the loud alarm sounds). An accidental shake must never fire an
    // un-cancellable alarm.
    Intent open = new Intent(this, MainActivity.class);
    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    open.putExtra("shomer_sos", "shake");
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
        .setContentText("Shake hard 5× to trigger an SOS")
        .setSmallIcon(R.mipmap.ic_launcher)
        .setOngoing(true)
        .setContentIntent(pi)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build();
  }

  @Override
  public void onDestroy() {
    try { if (sm != null) sm.unregisterListener(this); } catch (Exception e) {}
    super.onDestroy();
  }

  @Override public IBinder onBind(Intent intent) { return null; }
}
