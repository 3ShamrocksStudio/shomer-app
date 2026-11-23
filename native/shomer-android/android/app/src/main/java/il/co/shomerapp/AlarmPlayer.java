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

  /* v386: tell ShakeService this volume change was ours, so it does not count as a
     button press. See ShakeService.sSelfVolMs. */
  private static void markSelf() { try { ShakeService.markSelfVolume(); } catch (Throwable e) {} }

  private static volatile MediaPlayer mp;   // v376: read without the monitor by isPlaying/isPlayingSos

  /** v366: is the fallback siren sounding right now? Anything that tears down a service must
   *  ask this before stopping it - a live alarm is only ever silenced by the real cancel. */
  static boolean isPlaying() { return mp != null; }
  /** v375: ...and is it sounding for THIS user's own SOS, or for a linked SHOMER's alert? This
   *  player serves both. Treating a guardian's alert as "the siren is already up" meant the
   *  user's own countdown ended in silence, and clearing that alert then left the phone quiet
   *  over a live SOS. Only the SOS cause means "no second siren needed". */
  private static volatile boolean sosCause = false;
  static boolean isPlayingSos() { return mp != null && sosCause; }
  private static int prevVol = -1;
  private static int prevMusicVol = -1;   // v408: only set when the fallback had to reroute

  static void start(Context c) { start(c, false); }

  /** v377: decide and act under the monitor start() already holds. BeatTask read isPlayingSos()
   *  and then called stop(), and an SOS taking the player over between those two lines was
   *  silenced - the very bug v376 was for, surviving in a sub-millisecond window. */
  static synchronized void stopUnlessSos(Context c) {
    if (!isPlayingSos()) stop(c);
  }

  static synchronized void start(Context c, boolean forSos) {
    MediaPlayer p = null;   // v376: declared out here so the catch can release a half-built player
    try {
      if (mp != null) { if (forSos) sosCause = true; return; }   // v375: an SOS outranks a guard alert
      /* v377: the AudioManager lookup belongs BELOW that guard. Above it, a throw here while a
         siren was playing fell into the handler and released the live player. */
      AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
      sosCause = forSos;
      /* v401: the volume is an optimisation, not a precondition - exactly as in
         AlarmForegroundService. A Do-Not-Disturb policy that owns the alarm stream makes
         setStreamVolume throw, and in the same try that throw killed the fallback siren too,
         so BOTH paths went silent on the same device for the same reason. A quiet siren beats
         no siren. */
      try {
        /* v408: only snapshot when we do not already hold one, or a second start records the
           maximum WE set as the user's own level and pins their alarm volume to max for good.
           An onError clears mp without restoring, so a second start really does happen. */
        if (prevVol < 0) prevVol = am.getStreamVolume(AudioManager.STREAM_ALARM);
        markSelf(); am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
      } catch (Throwable ve) { AlarmForegroundService.note(ve, "fallback-volume"); }

      /* v408: THIS is the siren on a locked phone - every fallback path lands here. v407 taught
         the foreground service to reroute around a Do-Not-Disturb policy that pins the alarm
         stream at 0, and left this one hard-wired to USAGE_ALARM, so on exactly the device the
         reroute exists for the fallback was still silent while the release note said otherwise.
         Same decision, same order: alarm first, media only when alarm is provably dead. */
      int usage = AudioAttributes.USAGE_ALARM;
      int focusStream = AudioManager.STREAM_ALARM;
      try {
        if (am.getStreamVolume(AudioManager.STREAM_ALARM) == 0) {
          AlarmForegroundService.note(new RuntimeException("fallback: alarm stream pinned at 0 - rerouting to media"), "muted");
          try {
            if (prevMusicVol < 0) prevMusicVol = am.getStreamVolume(AudioManager.STREAM_MUSIC);
            markSelf(); am.setStreamVolume(AudioManager.STREAM_MUSIC, am.getStreamMaxVolume(AudioManager.STREAM_MUSIC), 0);
          } catch (Throwable e) { AlarmForegroundService.note(e, "fallback-music-volume"); }
          if (am.getStreamVolume(AudioManager.STREAM_MUSIC) > 0) {
            usage = AudioAttributes.USAGE_MEDIA; focusStream = AudioManager.STREAM_MUSIC;
          } else {
            AlarmForegroundService.note(new RuntimeException("fallback: media stream is at 0 too"), "muted-all");
          }
        }
      } catch (Throwable e) { AlarmForegroundService.note(e, "fallback-route"); }
      /* v376: build it in a LOCAL and publish to mp only once it is actually sounding. Published
         first, a failed prepare() left a window where isPlayingSos() said yes - long enough for
         the native countdown, which ends at the same instant this fallback starts, to skip its
         own siren and leave the phone silent. */
      p = new MediaPlayer();
      p.setAudioAttributes(new AudioAttributes.Builder().setUsage(usage)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
      AssetFileDescriptor afd = c.getResources().openRawResourceFd(R.raw.sos_alarm);
      p.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
      afd.close();
      p.setLooping(true);
      /* v401: a mid-playback death must clear mp, or isPlaying()/isPlayingSos() keep claiming a
         siren that is not there and the native countdown skips its own. */
      final MediaPlayer self = p;
      p.setOnErrorListener(new MediaPlayer.OnErrorListener() {
        @Override public boolean onError(MediaPlayer m, int what, int extra) {
          AlarmForegroundService.note(new RuntimeException("fallback onError " + what + "/" + extra), "fallback-play");
          if (mp == self) { mp = null; sosCause = false; }
          return true;
        }
      });
      p.prepare();
      p.start();
      mp = p;
      /* v409: this is the siren on a locked phone - it gets the flashlight too */
      if (forSos) { try { TorchMorse.start(c.getApplicationContext()); } catch (Throwable e) {} }
      /* v376: the siren is SOUNDING from here. Everything below is the notification and the buzz,
         and it gets its own catch - a throw in any of it must never reach the handler below and
         tear down a siren that is already playing. */
      try {
        try { ((android.app.NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(7); } catch (Throwable e) {}
        notifyStop(c);   // v337: this path had no notification at all - so no STOP button on a locked phone
        Vibrator v = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
        if (v != null) {
          if (android.os.Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(new long[]{0, 500, 140, 500, 140, 500, 320}, new int[]{0, 255, 0, 255, 0, 255, 0}, 1));
          else v.vibrate(new long[]{0, 500, 140, 500, 140, 500, 320}, 1);
        }
      } catch (Throwable e) {}
      return;
    } catch (Throwable e) {
      /* v376: release whichever we are holding - the half-built local on a prepare/start failure,
         or mp if we got far enough to publish it. Leaving a MediaPlayer unreleased holds an audio
         focus/codec handle for the life of the process. */
      try { if (p != null) p.release(); } catch (Throwable t) {}
      mp = null; sosCause = false;
      /* v377: hand the alarm volume back. Without this a failed start left STREAM_ALARM pinned at
         maximum - so no siren, and the user's next alarm clock screams - and a second failed start
         re-snapshotted that maximum as prevVol, losing their real setting for good. */
      try {
        if (prevVol >= 0) {
          AudioManager am2 = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
          if (am2 != null) { markSelf(); am2.setStreamVolume(AudioManager.STREAM_ALARM, prevVol, 0); }
          if (am2 != null && prevMusicVol >= 0) { markSelf(); am2.setStreamVolume(AudioManager.STREAM_MUSIC, prevMusicVol, 0); }   // v408
        }
      } catch (Throwable t) {}
      prevVol = -1; prevMusicVol = -1;
    }
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
    try { TorchMorse.stop(); } catch (Throwable e) {}   /* v409 */
    try { ((android.app.NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(3); } catch (Throwable e) {}
    try { if (mp != null) { mp.stop(); mp.release(); } } catch (Exception e) {}
    mp = null; sosCause = false;   // v375
    try {
      AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
      if (prevVol >= 0) { markSelf(); am.setStreamVolume(AudioManager.STREAM_ALARM, prevVol, 0); }
      if (prevMusicVol >= 0) { markSelf(); am.setStreamVolume(AudioManager.STREAM_MUSIC, prevMusicVol, 0); }   // v408
    } catch (Exception e) {}
    prevVol = -1; prevMusicVol = -1;
    try { Vibrator v = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE); if (v != null) v.cancel(); } catch (Exception e) {}
  }
}
