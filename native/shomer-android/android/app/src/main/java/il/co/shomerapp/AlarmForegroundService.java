package il.co.shomerapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
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
 * UN-SILENCEABLE SOS ALARM — the capability a pure PWA cannot have.
 * Plays the looping SOS alarm on the ALARM audio stream (USAGE_ALARM), which the OS keeps
 * audible even in silent/vibrate/DND, forces the alarm-stream volume to max, holds audio
 * focus, runs as a foreground service (survives backgrounding), and keeps a wake lock +
 * vibration going. So volume-down / mute / the ringer switch can't kill it.
 */
public class AlarmForegroundService extends Service {

  /* v386: tell ShakeService this volume change was ours, so it does not count as a
     button press. See ShakeService.sSelfVolMs. */
  private static void markSelf() { try { ShakeService.markSelfVolume(); } catch (Throwable e) {} }

  private static final String CH = "shomer_sos";
  private static volatile MediaPlayer mp;   // v398: read without the monitor by isPlaying()
  private AudioManager am;
  private int prevAlarmVol = -1;
  private PowerManager.WakeLock wl;

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    // STOP action from a notification (always-reachable kill switch, works on the lock screen).
    // v337: also stops the fallback player and the pre-alarm buzz, and tells the web app to close the SOS
    // and send "false alarm - I'm OK" - or leaves a note it acts on as soon as it opens.
    if (intent != null && "STOP".equals(intent.getAction())) {
      handleStop(this);
      stopForeground(true);
      stopSelf();
      return START_NOT_STICKY;
    }
    try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).cancel(7); } catch (Throwable e) {}   // v337: the pre-alarm notice is over
    Notification n = buildNotification();
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(1, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
    } else {
      startForeground(1, n);
    }
    startAlarm();
    return START_STICKY; // OS restarts it if killed while an SOS is active
  }

  private void startAlarm() {
    /* v398: build the player in a LOCAL and publish it to mp only once it is actually SOUNDING -
       the same shape AlarmPlayer was given in v376, which this class never got.
       Published first, any throw between `new MediaPlayer()` and start() - openRawResourceFd,
       setDataSource, a prepare() that fails on a busy codec - left mp non-null with nothing
       playing, and the catch swallowed it. isPlaying() is `mp != null`, so from that moment the
       phone claimed a siren was up for the life of the process. ShakeService's pre-alarm asks
       exactly that question before it fires (ShakeService:119) and skipped starting the siren -
       so press+shake buzzed, raised the notification, opened the app, and then went silent.
       onDestroy could not clear it either: mp.stop() on an unprepared player throws, and it ran
       first in a shared try, so mp = null never executed. A permanent lie, per process. */
    /* v401: raising the volume is an OPTIMISATION, never a precondition. It sat in the same try
       as the player, so a SecurityException from setStreamVolume - which Android throws when a
       Do-Not-Disturb policy owns the alarm stream and the app holds no policy-access permission -
       aborted the whole siren start before a player was ever built. That reproduces on the same
       device every time and survives a reboot, which matches the field report better than the
       stale-handle fault fixed in v398. A quiet siren beats no siren: the volume is tried, and
       whatever happens the player is still built and started. */
    MediaPlayer p = null;
    try {
      try {
        am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        /* Do NOT re-snapshot while a siren is already up, or the second start records the maximum
           WE set as the user's own setting and pins their alarm volume to max for good. */
        if (am != null && mp == null && prevAlarmVol < 0) prevAlarmVol = am.getStreamVolume(AudioManager.STREAM_ALARM);
        if (am != null) { markSelf(); am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0); }
      } catch (Throwable e) { note(e, "volume"); }

      if (mp != null) { try { mp.stop(); } catch (Exception e) {} try { mp.release(); } catch (Exception e) {} mp = null; }
      p = new MediaPlayer();
      /* v401: a player can also die mid-playback (MEDIA_ERROR_SERVER_DIED resets it to Idle).
         Without this, mp stayed non-null and silent and the pre-alarm went on believing a siren
         was up - the v398 bug by another route. */
      final MediaPlayer self = p;
      p.setOnErrorListener(new MediaPlayer.OnErrorListener() {
        @Override public boolean onError(MediaPlayer m, int what, int extra) {
          note(new RuntimeException("mp onError " + what + "/" + extra), "play");
          if (mp == self) mp = null;
          try { AlarmPlayer.start(getApplicationContext(), true); } catch (Throwable t) {}
          return true;
        }
      });
      AudioAttributes aa = new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build();
      p.setAudioAttributes(aa);
      AssetFileDescriptor afd = getResources().openRawResourceFd(R.raw.sos_alarm);
      p.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
      afd.close();
      p.setLooping(true);
      /* v405: audio focus is an optimisation too, and it sat outside the volume try - a null
         AudioManager does not throw where am is assigned, it throws HERE and took the primary
         player down with it. Same rule as the volume: never a precondition for the siren. */
      try { if (am != null) am.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN); }
      catch (Throwable e) { note(e, "focus"); }
      p.prepare();
      p.start();
      mp = p;   // SOUNDING from here, and only from here
      /* v405: started is not the same as audible. If a Do-Not-Disturb policy owns the alarm
         stream the player runs at volume 0 and isPlaying() says yes over a silent phone - and
         getAlarmFaults, the only readout a tester has, repeats that. Read the level back and
         record it, so a muted device can be told apart from a working one. */
      try {
        if (am != null && am.getStreamVolume(AudioManager.STREAM_ALARM) == 0) {
          note(new RuntimeException("alarm stream is at 0 - siren started but inaudible"), "muted");
        }
      } catch (Throwable e) {}

      /* Everything below is the wake lock and the buzz. It gets its own catch: a throw in any of
         it must never reach the handler and tear down a siren that is already playing. */
      try {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "shomer:sos");
        wl.acquire(10 * 60 * 1000L);

        Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (v != null) {
          long[] pat = {0, 500, 140, 500, 140, 500, 320};
          int[] amp = {0, 255, 0, 255, 0, 255, 0};
          v.vibrate(VibrationEffect.createWaveform(pat, amp, 1)); // repeat from index 1
        }
      } catch (Throwable e) {}
    } catch (Throwable e) {
      /* This player did not start. Record why, release the half-built one, and hand the alarm
         volume back - left pinned at maximum it would mean no siren AND the user's next alarm
         clock screaming. */
      note(e, "start");
      try { if (p != null) p.release(); } catch (Throwable t) {}
      /* v401: only if the dead player is the one we published. Clearing unconditionally could
         deny a siren that IS sounding from an earlier start, which would hand the pre-alarm the
         same false answer in the opposite direction. */
      if (mp == p) mp = null;
      if (mp == null) {
        try {
          if (am != null && prevAlarmVol >= 0) { markSelf(); am.setStreamVolume(AudioManager.STREAM_ALARM, prevAlarmVol, 0); }
        } catch (Throwable t) {}
        prevAlarmVol = -1;
        /* Last resort: the siren is the whole product. Try the fallback player, which runs inside
           ShakeService's already-running foreground service. */
        try { AlarmPlayer.start(getApplicationContext(), true); } catch (Throwable t) {}
      }
    }
  }

  /** v401: the siren used to fail in total silence - every throw swallowed, and not one Log call
   *  in this package, so a phone that never screamed could not be told from one that was never
   *  asked to. The last few failures are kept where the web layer can read them back
   *  (ShomerNativePlugin.getAlarmFaults), so a tester's device can say what actually went wrong. */
  static final java.util.List<String> FAULTS = java.util.Collections.synchronizedList(new java.util.ArrayList<String>());
  static void note(Throwable e, String where) {
    try {
      String s = System.currentTimeMillis() + " " + where + ": " + (e == null ? "?" : (e.getClass().getSimpleName() + " " + e.getMessage()));
      android.util.Log.e("SHOMER", s, e);
      synchronized (FAULTS) { FAULTS.add(s); while (FAULTS.size() > 10) FAULTS.remove(0); }
    } catch (Throwable t) {}
  }

  private Notification buildNotification() {
    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel ch = new NotificationChannel(CH, "SHOMER SOS", NotificationManager.IMPORTANCE_HIGH);
      ch.enableVibration(true);
      ch.setBypassDnd(true);
      nm.createNotificationChannel(ch);
    }
    Intent open = new Intent(this, MainActivity.class);
    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    PendingIntent pi = PendingIntent.getActivity(this, 0, open,
        PendingIntent.FLAG_IMMUTABLE);
    // Always-reachable STOP button on the alarm notification.
    PendingIntent stopPi = stopIntent(this);
    return new NotificationCompat.Builder(this, CH)
        .setContentTitle("SH\u2721MER – SOS")
        .setContentText("האזעקה פועלת. בסדר? הקישו \"עצור – אני בסדר\".")
        .setSmallIcon(R.drawable.ic_stat_shomer)
        .setOngoing(true)
        .setContentIntent(pi)
        .setFullScreenIntent(pi, true)
        .addAction(0, "עצור – אני בסדר", stopPi)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .build();
  }

  static PendingIntent stopIntent(Context c) {
    Intent stopI = new Intent(c, AlarmForegroundService.class);
    stopI.setAction("STOP");
    return PendingIntent.getService(c, 1, stopI, PendingIntent.FLAG_IMMUTABLE);
  }

  /** v342: lets the native pre-alarm countdown skip starting a siren the web layer already started. */
  static boolean isPlaying() { return mp != null; }

  static void handleStop(Context c) {
    try { ShakeService.cancelNativeAlarm(c); } catch (Throwable e) {}   // v342: or it fires 8 s after a cancel
    try { AlarmPlayer.stop(c); } catch (Throwable e) {}
    try { NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE); nm.cancel(7); nm.cancel(3); } catch (Throwable e) {}
    boolean told = false;
    try { MainActivity a = MainActivity.sActive; if (a != null) told = a.stopWeb(); } catch (Throwable e) {}
    try { c.getSharedPreferences("shomer_native", Context.MODE_PRIVATE).edit().putLong("stop_pending", told ? 0L : System.currentTimeMillis()).apply(); } catch (Throwable e) {}
  }

  public static void stopAlarm(Context c) {
    c.stopService(new Intent(c, AlarmForegroundService.class));
  }

  @Override
  public void onDestroy() {
    /* v398: one try per step. Sharing a try meant a throwing stop() skipped release() AND
       mp = null, so isPlaying() kept answering yes after the service was gone - and the next
       press+shake never started a siren. mp is cleared whatever happens. */
    MediaPlayer p = mp; mp = null;
    try { if (p != null) p.stop(); } catch (Exception e) {}
    try { if (p != null) p.release(); } catch (Exception e) {}
    try { if (am != null && prevAlarmVol >= 0) { markSelf(); am.setStreamVolume(AudioManager.STREAM_ALARM, prevAlarmVol, 0); } } catch (Exception e) {}
    try { if (wl != null && wl.isHeld()) wl.release(); } catch (Exception e) {}
    try { Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE); if (v != null) v.cancel(); } catch (Exception e) {}
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) { return null; }
}
