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
    if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
    else getContext().startService(i);
    call.resolve();
  }

  @PluginMethod
  public void stopAlarm(PluginCall call) {
    AlarmForegroundService.stopAlarm(getContext());
    call.resolve();
  }

  @PluginMethod
  public void enableBackgroundShake(PluginCall call) {
    Intent i = new Intent(getContext(), ShakeService.class);
    if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
    else getContext().startService(i);
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

  @PluginMethod
  public void requestNotifications(PluginCall call) {
    if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
      requestPermissionForAlias("notifications", call, "notifPermCallback");
    } else {
      call.resolve();
    }
  }
}
