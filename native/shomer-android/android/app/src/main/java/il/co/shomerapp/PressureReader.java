package il.co.shomerapp;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.Looper;

/**
 * v355 FLOOR AT SOS TIME - one short barometer reading (Sensor.TYPE_PRESSURE).
 * The web layer keeps the outdoor reference and does the floor math; this class only reads
 * the air pressure for up to ~2.5 s and averages a few samples. FAIL-SAFE: no sensor, no
 * reading, or any error -> ok=false, and the SOS goes out without a floor estimate.
 * Nothing is stored here and nothing leaves the phone from here.
 */
public final class PressureReader {
  public interface Result { void done(boolean ok, double hPa, int samples, String reason); }

  private PressureReader() {}

  public static void read(Context ctx, long timeoutMs, final Result cb) {
    final SensorManager sm;
    final Sensor sensor;
    try {
      sm = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
      sensor = (sm == null) ? null : sm.getDefaultSensor(Sensor.TYPE_PRESSURE);
    } catch (Throwable e) { cb.done(false, 0, 0, "error"); return; }
    if (sensor == null) { cb.done(false, 0, 0, "no-sensor"); return; }

    final Handler h = new Handler(Looper.getMainLooper());
    final double[] sum = {0};
    final int[] n = {0};
    final boolean[] finished = {false};
    final SensorEventListener[] holder = new SensorEventListener[1];
    final Runnable finish = new Runnable() {
      @Override public void run() {
        if (finished[0]) return;
        finished[0] = true;
        try { sm.unregisterListener(holder[0]); } catch (Throwable e) {}
        if (n[0] > 0) cb.done(true, sum[0] / n[0], n[0], "");
        else cb.done(false, 0, 0, "no-reading");
      }
    };
    holder[0] = new SensorEventListener() {
      @Override public void onSensorChanged(SensorEvent e) {
        if (finished[0] || e == null || e.values == null || e.values.length < 1) return;
        float p = e.values[0];
        if (p < 300f || p > 1100f) return;           // not a believable air pressure (hPa)
        sum[0] += p; n[0]++;
        if (n[0] >= 5) h.post(finish);
      }
      @Override public void onAccuracyChanged(Sensor s, int accuracy) {}
    };
    boolean ok;
    try { ok = sm.registerListener(holder[0], sensor, SensorManager.SENSOR_DELAY_UI, h); }
    catch (Throwable e) { ok = false; }
    if (!ok) { finished[0] = true; cb.done(false, 0, 0, "no-listener"); return; }
    h.postDelayed(finish, Math.max(500L, Math.min(timeoutMs, 5000L)));
  }
}
