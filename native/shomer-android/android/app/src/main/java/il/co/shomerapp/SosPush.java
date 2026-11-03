package il.co.shomerapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.util.Map;

/**
 * INCOMING SOS ALARM from a push (app closed, phone locked). Called by ShomerMessagingService
 * for a data-only, high-priority FCM message sent by the sosFanout Cloud Function.
 *  - Paired SHOMER (and nearby, unless the server turns that off): looping alarm on the ALARM
 *    stream through IncomingAlarmService (separate from my own SOS siren) + a full-screen alert.
 *  - If Android refuses the foreground service, an INSISTENT notification (alarm sound repeats
 *    until opened) on the "shomer_sos_alert" channel does the job instead.
 *  - Tapping opens SHOMER on the event (MainActivity hands the push data to the web app).
 * The push carries no precise location (see native/PUSH-ALARM-PLAN.md).
 */
final class SosPush {
  static final String CH_ALERT = "shomer_sos_alert";   // loud: custom alarm sound + vibration
  static final String CH_LOOP = "shomer_sos_loop";     // silent channel for the looping-alarm service notification
  static final int NOTIF_ID = 12;
  static final String EXTRA = "shomer_sos_push";       // JSON of the push data, read by MainActivity
  private static final String P = "shomer_push";
  private static final long[] VIBE = {0, 600, 200, 600, 200, 900};

  static void channels(Context c) {
    if (Build.VERSION.SDK_INT < 26) return;
    NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;
    NotificationChannel a = new NotificationChannel(CH_ALERT, "SH✡MER SOS alarm", NotificationManager.IMPORTANCE_HIGH);
    a.setDescription("SOS from your SHOMERs and people near you");
    Uri snd = Uri.parse("android.resource://" + c.getPackageName() + "/" + R.raw.sos_alarm);
    a.setSound(snd, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
    a.enableVibration(true); a.setVibrationPattern(VIBE);
    a.enableLights(true); a.setLightColor(0xFFE8182C);
    a.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    try { a.setBypassDnd(true); } catch (Throwable e) {}
    nm.createNotificationChannel(a);
    NotificationChannel l = new NotificationChannel(CH_LOOP, "SH✡MER SOS alarm (ringing)", NotificationManager.IMPORTANCE_HIGH);
    l.setDescription("Shown while an incoming SOS alarm is ringing");
    l.setSound(null, null); l.enableVibration(false);
    l.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    try { l.setBypassDnd(true); } catch (Throwable e) {}
    nm.createNotificationChannel(l);
  }

  static void handle(Context c, Map<String, String> d) {
    String kind = d.get("kind");
    if ("sos_clear".equals(kind)) { clear(c, d.get("sid")); return; }
    if (!"sos".equals(kind)) return;
    String sid = d.get("sid"); if (sid == null || sid.length() == 0) return;
    if (seen(c, sid)) return;                                // one alarm per SOS, even if FCM redelivers
    channels(c);
    String title = d.containsKey("title") ? d.get("title") : "🚨 SH✡MER SOS";
    String body = d.containsKey("body") ? d.get("body") : "";
    JSONObject j = new JSONObject();
    try { for (Map.Entry<String, String> e : d.entrySet()) j.put(e.getKey(), e.getValue()); } catch (Throwable e) {}
    c.getSharedPreferences(P, Context.MODE_PRIVATE).edit().putString("ringing", sid).apply();
    boolean loop = !"0".equals(d.get("alarm"));
    if (loop) {
      // High-priority FCM lets the app start a foreground service from the background.
      try { IncomingAlarmService.start(c, title, body, j.toString()); return; }
      catch (Throwable e) { /* fall through to the insistent notification */ }
    }
    show(c, title, body, j.toString(), loop);
  }

  /** The SOS notification itself (fallback, or the no-loop variant). */
  static void show(Context c, String title, String body, String json, boolean insistent) {
    try {
      NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
      PendingIntent pi = openIntent(c, json);
      Notification n = new NotificationCompat.Builder(c, CH_ALERT)
          .setSmallIcon(R.drawable.ic_stat_shomer)
          .setColor(0xFFCC1426)
          .setContentTitle(title).setContentText(body)
          .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
          .setPriority(NotificationCompat.PRIORITY_MAX)
          .setCategory(NotificationCompat.CATEGORY_ALARM)
          .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
          .setVibrate(VIBE)
          .setContentIntent(pi).setFullScreenIntent(pi, true)
          .setAutoCancel(true).build();
      if (insistent) n.flags |= Notification.FLAG_INSISTENT;   // sound repeats until opened / cleared
      nm.notify(NOTIF_ID, n);
    } catch (Throwable e) {}
  }

  static PendingIntent openIntent(Context c, String json) {
    Intent open = new Intent(c, MainActivity.class);
    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    open.putExtra(EXTRA, json);
    return PendingIntent.getActivity(c, 13, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  /** SOS ended (or the user opened / silenced it in the app): stop ringing. */
  static void clear(Context c, String sid) {
    SharedPreferences sp = c.getSharedPreferences(P, Context.MODE_PRIVATE);
    String r = sp.getString("ringing", null);
    if (sid != null && r != null && !sid.equals(r)) return;   // a different SOS is ringing
    stopAll(c);
  }
  static void stopAll(Context c) {
    c.getSharedPreferences(P, Context.MODE_PRIVATE).edit().remove("ringing").apply();
    try { IncomingAlarmService.stop(c); } catch (Throwable e) {}   // never AlarmForegroundService/AlarmPlayer: those are MY OWN SOS siren
    try { ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NOTIF_ID); } catch (Throwable e) {}
  }

  static synchronized boolean seen(Context c, String sid) {
    SharedPreferences sp = c.getSharedPreferences(P, Context.MODE_PRIVATE);
    String s = sp.getString("seen", "");
    if (s.contains("|" + sid + "|")) return true;
    s = "|" + sid + "|" + s; if (s.length() > 1200) s = s.substring(0, 1200);
    sp.edit().putString("seen", s).apply();
    return false;
  }

  /* FCM token, kept here so the web app can read it at any time (ShomerNativePlugin.pushToken). */
  static void saveToken(Context c, String t) { c.getSharedPreferences(P, Context.MODE_PRIVATE).edit().putString("token", t).apply(); }
  static String token(Context c) { return c.getSharedPreferences(P, Context.MODE_PRIVATE).getString("token", null); }
}
