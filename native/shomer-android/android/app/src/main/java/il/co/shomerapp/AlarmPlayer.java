package il.co.shomerapp;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.VibrationEffect;
import android.os.Vibrator;

/**
 * Plays the SOS alarm on the ALARM stream from inside an already-running foreground service
 * (ShakeService). Android 12+ refuses to START a new foreground service while the app is in
 * the background - exactly the locked-phone case - so when AlarmForegroundService can't be
 * started, the alarm still sounds through here.
 */
final class AlarmPlayer {
  private static MediaPlayer mp;
  private static int prevVol = -1;

  static synchronized void start(Context c) {
    try {
      AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
      if (mp != null) return;
      prevVol = am.getStreamVolume(AudioManager.STREAM_ALARM);
      am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
      mp = new MediaPlayer();
      mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
      AssetFileDescriptor afd = c.getResources().openRawResourceFd(R.raw.sos_alarm);
      mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
      afd.close();
      mp.setLooping(true);
      mp.prepare();
      mp.start();
      try { ((android.app.NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(7); } catch (Throwable e) {}
      notifyStop(c);   // v337: this path had no notification at all - so no STOP button on a locked phone
      Vibrator v = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
      if (v != null) {
        if (android.os.Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(new long[]{0, 500, 140, 500, 140, 500, 320}, new int[]{0, 255, 0, 255, 0, 255, 0}, 1));
        else v.vibrate(new long[]{0, 500, 140, 500, 140, 500, 320}, 1);
      }
    } catch (Throwable e) { try { if (mp != null) mp.release(); } catch (Throwable t) {} mp = null; }
  }

  /** The "עצור – אני בסדר" notification for the fallback alarm (id 3). */
  private static void notifyStop(Context c) {
    try {
      android.app.NotificationManager nm = (android.app.NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
      if (android.os.Build.VERSION.SDK_INT >= 26) {
        android.app.NotificationChannel ch = new android.app.NotificationChannel("shomer_sos", "SHOMER SOS", android.app.NotificationManager.IMPORTANCE_HIGH);
        ch.setBypassDnd(true); nm.createNotificationChannel(ch);
      }
      android.content.Intent open = new android.content.Intent(c, MainActivity.class);
      open.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
      android.app.PendingIntent pi = android.app.PendingIntent.getActivity(c, 0, open, android.app.PendingIntent.FLAG_IMMUTABLE);
      nm.notify(3, new androidx.core.app.NotificationCompat.Builder(c, "shomer_sos")
          .setContentTitle("SH\u2721MER – אזעקה")
          .setContentText("האזעקה פועלת. בסדר? הקישו \"עצור – אני בסדר\".")
          .setSmallIcon(R.drawable.ic_stat_shomer)
          .setOngoing(true)
          .setContentIntent(pi)
          .addAction(0, "עצור – אני בסדר", AlarmForegroundService.stopIntent(c))
          .setPriority(androidx.core.app.NotificationCompat.PRIORITY_MAX)
          .setCategory(androidx.core.app.NotificationCompat.CATEGORY_ALARM)
          .build());
    } catch (Throwable e) {}
  }

  static synchronized void stop(Context c) {
    try { ((android.app.NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(3); } catch (Throwable e) {}
    try { if (mp != null) { mp.stop(); mp.release(); } } catch (Exception e) {}
    mp = null;
    try {
      AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
      if (prevVol >= 0) am.setStreamVolume(AudioManager.STREAM_ALARM, prevVol, 0);
    } catch (Exception e) {}
    prevVol = -1;
    try { Vibrator v = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE); if (v != null) v.cancel(); } catch (Exception e) {}
  }
}
