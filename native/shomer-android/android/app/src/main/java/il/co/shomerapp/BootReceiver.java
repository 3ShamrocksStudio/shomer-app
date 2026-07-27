package il.co.shomerapp;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * A safety app that stops guarding after a phone reboot is not a safety app.
 * On BOOT_COMPLETED (and on the OEM quick-boot variants) this restarts the
 * background shake-to-SOS service so protection resumes without the user having
 * to remember to open SHOMER.
 */
public class BootReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context ctx, Intent intent) {
    if (intent == null || intent.getAction() == null) return;
    String a = intent.getAction();
    if (!Intent.ACTION_BOOT_COMPLETED.equals(a)
        && !"android.intent.action.QUICKBOOT_POWERON".equals(a)
        && !"com.htc.intent.action.QUICKBOOT_POWERON".equals(a)) return;
    try {
      Intent svc = new Intent(ctx, ShakeService.class);
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(svc);
      else ctx.startService(svc);
    } catch (Exception ignored) {}
  }
}
