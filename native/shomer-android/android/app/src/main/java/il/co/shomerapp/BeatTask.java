package il.co.shomerapp;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.HandlerThread;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * BACKGROUND DASHBOARD HEARTBEAT.
 * Android freezes the web layer once the screen is off or another app is in front, so the
 * dashboard lost every phone whose SHOMER was not on screen. The always-on Shake-to-SOS
 * service now keeps the SAME anonymous heartbeat row alive once a minute:
 *  - same row id the web app owns (dashown/<id> = my uid), same ~1 km coarse point (last
 *    position the app had), same daily-rotating anonymous tag - nothing new is collected;
 *  - skipped while the app itself is on screen (the web layer beats then);
 *  - a new unlinkable row every Israel calendar day, the old one deleted (as the web app does);
 *  - ghost mode / no location / sign-out = the web app sends on=false and the row is deleted.
 */
final class BeatTask {
  private static final String P = "shomer_beat";
  private static final long EVERY = 60_000L;
  private static HandlerThread th;
  private static Handler h;
  private static Context app;
  private static String idTok; private static long idTokExp;
  static volatile boolean webForeground;

  static synchronized void start(Context c) {
    app = c.getApplicationContext();
    if (th != null) return;
    th = new HandlerThread("shomer-beat"); th.start();
    h = new Handler(th.getLooper());
    h.postDelayed(BeatTask::tick, 15_000L);
  }

  static synchronized void stop() {
    if (th != null) { try { th.quitSafely(); } catch (Throwable e) {} th = null; h = null; }
  }

  /** Called from the web app on every foreground beat (or on=false to remove my row). */
  static void configure(Context c, JSONObject o) {
    final Context ctx = c.getApplicationContext();
    final SharedPreferences sp = ctx.getSharedPreferences(P, Context.MODE_PRIVATE);
    if (o.optBoolean("wipe", false)) { sp.edit().clear().commit(); idTok = null; return; }   // account deleted: forget everything
    final String oldKey = sp.getString("key", null);
    final boolean oldNative = sp.getBoolean("nativeKey", false);
    final String newKey = o.optString("key", null);
    SharedPreferences.Editor e = sp.edit();
    e.putBoolean("on", o.optBoolean("on", false));
    if (newKey != null && newKey.startsWith("hb_")) { e.putString("key", newKey); e.putBoolean("nativeKey", false); e.putString("day", dayKey()); }
    for (String k : new String[]{"uid", "dev", "rt", "apiKey", "db"}) { String v = o.optString(k, null); if (v != null && v.length() > 0) e.putString(k, v); }
    if (o.has("lat") && !o.isNull("lat")) { e.putString("lat", String.valueOf(o.optDouble("lat"))); e.putString("lng", String.valueOf(o.optDouble("lng"))); }
    e.commit();
    // A row this service created after midnight is replaced by the web app's own row: remove mine.
    if (oldNative && oldKey != null && newKey != null && !oldKey.equals(newKey)) {
      new Thread(() -> { try { String t = token(ctx); if (t != null) { rest(ctx, "DELETE", "dashfeed/" + oldKey, null, t); rest(ctx, "DELETE", "dashown/" + oldKey, null, t); } } catch (Throwable x) {} }).start();
    }
  }

  private static void tick() {
    try { beatOnce(); } catch (Throwable e) {}
    Handler hh = h; if (hh != null) hh.postDelayed(BeatTask::tick, EVERY);
  }

  private static void beatOnce() throws Exception {
    if (app == null || webForeground) return;
    SharedPreferences sp = app.getSharedPreferences(P, Context.MODE_PRIVATE);
    try { checkGuardAlerts(sp); } catch (Throwable e) {}   // alerts from my linked SHOMERs reach a locked phone too
    if (!sp.getBoolean("on", false)) return;
    String key = sp.getString("key", null), uid = sp.getString("uid", null), dev = sp.getString("dev", null);
    String lat = sp.getString("lat", null), lng = sp.getString("lng", null);
    if (key == null || uid == null || dev == null || lat == null || lng == null) return;
    String t = token(app); if (t == null) return;
    String dk = dayKey();
    if (!dk.equals(sp.getString("day", ""))) {          // midnight: fresh unlinkable row, old one deleted
      String nk = "hb_" + hex(8);
      if (rest(app, "PUT", "dashown/" + nk, JSONObject.quote(uid), t) / 100 != 2) return;
      rest(app, "DELETE", "dashfeed/" + key, null, t);
      rest(app, "DELETE", "dashown/" + key, null, t);
      sp.edit().putString("key", nk).putString("day", dk).putBoolean("nativeKey", true).commit();
      key = nk;
    }
    JSONObject row = new JSONObject();
    row.put("type", "presence");
    row.put("lat", Double.parseDouble(lat)); row.put("lng", Double.parseDouble(lng));   // already ~1 km (2 decimals) from the app
    row.put("ts", System.currentTimeMillis());
    row.put("status", "v2:" + sha256(dev + ":" + dk).substring(0, 12));
    int code = rest(app, "PUT", "dashfeed/" + key, row.toString(), t);
    if (code == 401) { idTok = null; }
  }

  /** GUARDIAN ALERTS while the app is off-screen: a linked SHOMER's Alert / Alarm on ping/<me>/<them>.
   *  Sound the loud alarm and bring SHOMER up over the lock screen - the web layer then shows the
   *  "enter your cancel code" screen (the only way to stop it besides the sender's remote stop).
   *  Who may write here is checked when the alert is shown; the database rules limit it to linked people. */
  static volatile String ringingId;
  private static void checkGuardAlerts(SharedPreferences sp) throws Exception {
    String uid = sp.getString("uid", null); if (uid == null) return;
    String t = token(app); if (t == null) return;
    String body = get(app, "ping/" + uid, t); if (body == null || body.equals("null")) return;
    JSONObject all = new JSONObject(body);
    java.util.Iterator<String> it = all.keys();
    String seen = sp.getString("ga_seen", "");
    long now = System.currentTimeMillis();
    while (it.hasNext()) {
      String from = it.next(); JSONObject v = all.optJSONObject(from); if (v == null) continue;
      String id = v.optString("id", ""), lv = v.optString("level", "");
      if (id.length() == 0) continue;
      if ("stop".equals(lv) && id.equals(ringingId)) { clearGuardAlert(app); continue; }
      if (!("alert".equals(lv) || "alarm".equals(lv))) continue;
      if (now - v.optLong("ts", 0) > 15 * 60_000L) continue;
      if (seen.contains("|" + id + "|")) continue;
      seen = ("|" + id + "|" + seen); if (seen.length() > 1200) seen = seen.substring(0, 1200);
      sp.edit().putString("ga_seen", seen).commit();
      ringingId = id;
      try { AlarmPlayer.start(app); } catch (Throwable e) {}
      showGuardAlert(v.optString("name", "SHOMER"), "alarm".equals(lv));
    }
  }
  private static void showGuardAlert(String name, boolean alarm) {
    try {
      android.app.NotificationManager nm = (android.app.NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
      if (android.os.Build.VERSION.SDK_INT >= 26) {
        android.app.NotificationChannel ch = new android.app.NotificationChannel("shomer_guard", "SHOMER guardian alerts", android.app.NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Alerts from the SHOMERs you linked with"); try { ch.setBypassDnd(true); } catch (Throwable e) {}
        nm.createNotificationChannel(ch);
      }
      android.content.Intent open = new android.content.Intent(app, MainActivity.class);
      open.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP);
      open.putExtra("shomer_ga", true);
      android.app.PendingIntent pi = android.app.PendingIntent.getActivity(app, 9, open, android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);
      android.app.Notification n = new androidx.core.app.NotificationCompat.Builder(app, "shomer_guard")
          .setSmallIcon(R.drawable.ic_stat_shomer)
          .setContentTitle((alarm ? "🚨 " : "🔔 ") + "SHOMER - " + name)
          .setContentText("Open and enter your cancel code / פתח/י והזן/י קוד ביטול")
          .setPriority(androidx.core.app.NotificationCompat.PRIORITY_MAX)
          .setCategory(androidx.core.app.NotificationCompat.CATEGORY_ALARM)
          .setFullScreenIntent(pi, true).setContentIntent(pi).setOngoing(true).setAutoCancel(false).build();
      nm.notify(11, n);
    } catch (Throwable e) {}
  }
  static void clearGuardAlert(Context c) {
    try { AlarmPlayer.stop(c); } catch (Throwable e) {}
    ringingId = null;
    try { ((android.app.NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(11); } catch (Throwable e) {}
  }
  private static String get(Context c, String path, String tok) {
    HttpURLConnection k = null;
    try {
      String db = c.getSharedPreferences(P, Context.MODE_PRIVATE).getString("db", "https://shomergency-default-rtdb.firebaseio.com");
      k = (HttpURLConnection) new URL(db + "/" + path + ".json?auth=" + URLEncoder.encode(tok, "UTF-8")).openConnection();
      k.setConnectTimeout(15000); k.setReadTimeout(15000);
      if (k.getResponseCode() / 100 != 2) return null;
      try (InputStream is = k.getInputStream()) { return read(is); }
    } catch (Throwable e) { return null; } finally { if (k != null) k.disconnect(); }
  }

  /** Firebase ID token from the anonymous account's refresh token (the same sign-in the app uses). */
  private static synchronized String token(Context c) {
    if (idTok != null && System.currentTimeMillis() < idTokExp) return idTok;
    SharedPreferences sp = c.getSharedPreferences(P, Context.MODE_PRIVATE);
    String rt = sp.getString("rt", null), key = sp.getString("apiKey", null);
    if (rt == null || key == null) return null;
    HttpURLConnection k = null;
    try {
      k = (HttpURLConnection) new URL("https://securetoken.googleapis.com/v1/token?key=" + URLEncoder.encode(key, "UTF-8")).openConnection();
      k.setRequestMethod("POST"); k.setDoOutput(true); k.setConnectTimeout(15000); k.setReadTimeout(15000);
      k.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
      byte[] b = ("grant_type=refresh_token&refresh_token=" + URLEncoder.encode(rt, "UTF-8")).getBytes("UTF-8");
      try (OutputStream os = k.getOutputStream()) { os.write(b); }
      if (k.getResponseCode() / 100 != 2) return null;
      String body; try (InputStream is = k.getInputStream()) { body = read(is); }
      JSONObject j = new JSONObject(body);
      idTok = j.optString("id_token", null);
      String nrt = j.optString("refresh_token", null);
      if (nrt != null && nrt.length() > 0 && !nrt.equals(rt)) sp.edit().putString("rt", nrt).commit();
      idTokExp = System.currentTimeMillis() + Math.max(60, j.optLong("expires_in", 3600) - 300) * 1000L;
      return idTok;
    } catch (Throwable e) { return null; } finally { if (k != null) k.disconnect(); }
  }

  private static int rest(Context c, String method, String path, String json, String tok) {
    HttpURLConnection k = null;
    try {
      String db = c.getSharedPreferences(P, Context.MODE_PRIVATE).getString("db", "https://shomergency-default-rtdb.firebaseio.com");
      k = (HttpURLConnection) new URL(db + "/" + path + ".json?auth=" + URLEncoder.encode(tok, "UTF-8")).openConnection();
      k.setRequestMethod(method); k.setConnectTimeout(15000); k.setReadTimeout(15000);
      if (json != null) {
        k.setDoOutput(true); k.setRequestProperty("Content-Type", "application/json");
        try (OutputStream os = k.getOutputStream()) { os.write(json.getBytes("UTF-8")); }
      }
      return k.getResponseCode();
    } catch (Throwable e) { return -1; } finally { if (k != null) k.disconnect(); }
  }

  private static String dayKey() {
    SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
    f.setTimeZone(TimeZone.getTimeZone("Asia/Jerusalem"));
    return f.format(new Date());
  }
  private static String sha256(String s) throws Exception {
    byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes("UTF-8"));
    StringBuilder b = new StringBuilder(); for (byte x : d) b.append(String.format("%02x", x)); return b.toString();
  }
  private static String hex(int n) { byte[] a = new byte[n]; new SecureRandom().nextBytes(a); StringBuilder b = new StringBuilder(); for (byte x : a) b.append(String.format("%02x", x)); return b.toString(); }
  private static String read(InputStream is) throws Exception { StringBuilder b = new StringBuilder(); byte[] buf = new byte[4096]; int r; while ((r = is.read(buf)) > 0) b.append(new String(buf, 0, r, "UTF-8")); return b.toString(); }
}
