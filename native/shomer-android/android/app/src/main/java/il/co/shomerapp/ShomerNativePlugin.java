package il.co.shomerapp;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/**
 * Bridge the web app (shomer.html) to SHOMER's native capabilities. The web app
 * feature-detects window.Capacitor and calls these; on a plain browser it falls back to the
 * existing Web-Audio alarm and in-app shake — so it's one codebase, additive only.
 */
@CapacitorPlugin(
  name = "ShomerNative",
  permissions = {
    @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
  }
)
public class ShomerNativePlugin extends Plugin {

  @PluginMethod
  public void isNative(PluginCall call) {
    JSObject r = new JSObject();
    r.put("native", true);
    r.put("platform", "android");
    call.resolve(r);
  }

  @PluginMethod
  public void startAlarm(PluginCall call) {
    Intent i = new Intent(getContext(), AlarmForegroundService.class);
    try {
      if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
      else getContext().startService(i);
    } catch (Exception e) {
      // Locked / backgrounded phone: Android won't start a new foreground service here.
      // ShakeService is already running in the foreground - sound the alarm from it.
      AlarmPlayer.start(getContext());
    }
    call.resolve();
  }

  @PluginMethod
  public void stopAlarm(PluginCall call) {
    AlarmForegroundService.stopAlarm(getContext());
    AlarmPlayer.stop(getContext());
    call.resolve();
  }

  @PluginMethod
  public void enableBackgroundShake(PluginCall call) {
    Intent i = new Intent(getContext(), ShakeService.class);
    if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
    else getContext().startService(i);
    call.resolve();
  }

  /** Dashboard heartbeat settings from the web app (see BeatTask). */
  @PluginMethod
  public void beat(PluginCall call) {
    try { BeatTask.configure(getContext(), new org.json.JSONObject(call.getData().toString())); } catch (Throwable e) {}
    call.resolve();
  }

  /** A linked SHOMER's Alert / Alarm: loud on the ALARM stream (ignores silent mode). No notification
   *  STOP button - it stops only through the web layer after the cancel code, or the sender's remote stop. */
  @PluginMethod
  public void startGuardAlarm(PluginCall call) {
    try { AlarmPlayer.start(getContext()); } catch (Throwable e) {}
    call.resolve();
  }
  @PluginMethod
  public void stopGuardAlarm(PluginCall call) {
    try { BeatTask.clearGuardAlert(getContext()); } catch (Throwable e) {}
    call.resolve();
  }

  @PluginMethod
  public void disableBackgroundShake(PluginCall call) {
    getContext().stopService(new Intent(getContext(), ShakeService.class));
    call.resolve();
  }

  /**
   * Ask Android to exempt SHOMER from battery optimisation. Without this, Doze and the
   * aggressive OEM battery managers (Xiaomi, Samsung, Huawei, Oppo) suspend the process
   * after the screen has been off for a while, and an incoming SOS never arrives.
   * Resolves {granted:true} if already exempt, otherwise opens the system dialog.
   */
  @PluginMethod
  public void requestBatteryExemption(PluginCall call) {
    JSObject r = new JSObject();
    try {
      if (Build.VERSION.SDK_INT < 23) { r.put("granted", true); call.resolve(r); return; }
      Context ctx = getContext();
      PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
      String pkg = ctx.getPackageName();
      if (pm != null && pm.isIgnoringBatteryOptimizations(pkg)) {
        r.put("granted", true); call.resolve(r); return;
      }
      Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
      i.setData(Uri.parse("package:" + pkg));
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      ctx.startActivity(i);
      r.put("granted", false); r.put("prompted", true);
      call.resolve(r);
    } catch (Exception e) {
      r.put("granted", false); r.put("error", String.valueOf(e.getMessage()));
      call.resolve(r);
    }
  }

  /** Android 14+: may this app show its SOS screen over the lock screen? */
  @PluginMethod
  public void canFullScreen(PluginCall call) {
    JSObject r = new JSObject();
    boolean ok = true;
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        android.app.NotificationManager nm = (android.app.NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        ok = nm != null && nm.canUseFullScreenIntent();
      }
    } catch (Exception e) { ok = false; }
    r.put("granted", ok);
    call.resolve(r);
  }

  /** Opens the system page where the user allows SHOMER to show the SOS over the lock screen. */
  @PluginMethod
  public void openFullScreenSettings(PluginCall call) {
    try {
      Intent i;
      if (Build.VERSION.SDK_INT >= 34) {
        i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
        i.setData(Uri.parse("package:" + getContext().getPackageName()));
      } else {
        i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
      }
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(i);
    } catch (Exception e) {}
    call.resolve();
  }

  @PluginMethod
  public void requestNotifications(PluginCall call) {
    if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
      requestPermissionForAlias("notifications", call, "notifPermCallback");
    } else {
      call.resolve();
    }
  }
}
