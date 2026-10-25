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
      Vibrator v = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
      if (v != null) v.vibrate(VibrationEffect.createWaveform(new long[]{0, 500, 140, 500, 140, 500, 320}, new int[]{0, 255, 0, 255, 0, 255, 0}, 1));
    } catch (Exception e) { mp = null; }
  }

  static synchronized void stop(Context c) {
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
