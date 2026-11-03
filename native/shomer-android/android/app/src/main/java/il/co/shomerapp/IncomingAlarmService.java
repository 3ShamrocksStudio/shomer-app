package il.co.shomerapp;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.core.app.NotificationCompat;

/**
 * INCOMING SOS ALARM (someone else's SOS). Kept fully apart from AlarmForegroundService / AlarmPlayer,
 * which sound MY OWN SOS siren: its own player, own notification id, own stop. Stopping this never
 * touches my own siren. START_NOT_STICKY: if Android kills it, it does not come back on its own.
 * Started by SosPush (push / background poll) or by the web takeover (startIncomingAlarm).
 */
public class IncomingAlarmService extends Service {
  static final int NOTIF_ID = 14;
  private MediaPlayer mp;
  private AudioManager am;
  private int prevVol = -1;
  private PowerManager.WakeLock wl;

  static void start(Context c, String title, String body, String json) {
    Intent i = new Intent(c, IncomingAlarmService.class);
    i.putExtra("in_title", title); i.putExtra("in_body", body); i.putExtra(SosPush.EXTRA, json);
    if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
  }
  static void stop(Context c) { try { c.stopService(new Intent(c, IncomingAlarmService.class)); } catch (Throwable e) {} }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null || "STOP".equals(intent.getAction())) { stopForeground(true); stopSelf(); return START_NOT_STICKY; }
    String title = intent.getStringExtra("in_title"), body = intent.getStringExtra("in_body");
    Notification n = build(title != null ? title : "🚨 SH✡MER SOS", body != null ? body : "", intent.getStringExtra(SosPush.EXTRA));
    if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
    else startForeground(NOTIF_ID, n);
    ring();
    return START_NOT_STICKY;
  }

  private void ring() {
    if (mp != null) return;   // already ringing (a second start only updates the notification)
    try {
      am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
      prevVol = am.getStreamVolume(AudioManager.STREAM_ALARM);
      am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
      mp = new MediaPlayer();
      mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
      AssetFileDescriptor afd = getResources().openRawResourceFd(R.raw.sos_alarm);
      mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
      afd.close();
      mp.setLooping(true); mp.prepare(); mp.start();
      PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
      wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "shomer:incoming"); wl.acquire(5 * 60 * 1000L);
      Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
      if (v != null && Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(new long[]{0, 600, 200, 600, 200, 900}, new int[]{0, 255, 0, 255, 0, 255}, 1));
      // Safety stop: an unanswered incoming alarm rings for at most 5 minutes.
      new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(this::stopSelf, 5 * 60 * 1000L);
    } catch (Throwable e) { /* never crash the alarm */ }
  }

  private Notification build(String title, String body, String json) {
    SosPush.channels(this);
    PendingIntent pi = SosPush.openIntent(this, json);
    Intent stopI = new Intent(this, IncomingAlarmService.class); stopI.setAction("STOP");
    PendingIntent stopPi = PendingIntent.getService(this, 15, stopI, PendingIntent.FLAG_IMMUTABLE);
    return new NotificationCompat.Builder(this, SosPush.CH_LOOP)
        .setContentTitle(title).setContentText(body)
        .setSmallIcon(R.drawable.ic_stat_shomer).setColor(0xFFCC1426)
        .setOngoing(true).setContentIntent(pi).setFullScreenIntent(pi, true)
        .addAction(0, "⛔ השתק / Silence", stopPi)
        .setPriority(NotificationCompat.PRIORITY_MAX).setCategory(NotificationCompat.CATEGORY_ALARM)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC).build();
  }

  @Override
  public void onDestroy() {
    try { if (mp != null) { mp.stop(); mp.release(); mp = null; } } catch (Throwable e) {}
    try { if (am != null && prevVol >= 0) am.setStreamVolume(AudioManager.STREAM_ALARM, prevVol, 0); } catch (Throwable e) {}
    try { if (wl != null && wl.isHeld()) wl.release(); } catch (Throwable e) {}
    try { Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE); if (v != null) v.cancel(); } catch (Throwable e) {}
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) { return null; }
}
