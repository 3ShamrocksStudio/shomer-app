package il.co.shomerapp;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.content.Intent;
import android.Manifest;
import android.content.pm.PackageManager;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Register SHOMER's native bridge BEFORE the web layer loads.
    registerPlugin(ShomerNativePlugin.class);
    super.onCreate(savedInstanceState);
    sActive = this;
    ensureCameraPermission();
    dispatchShakeSos(getIntent());
  }

  /** The live activity (and its WebView bridge) while it exists - ShakeService uses it to fire
   *  the SOS straight into the running web app, even with the screen off and the phone locked. */
  static volatile MainActivity sActive;

  @Override
  public void onDestroy() {
    if (sActive == this) sActive = null;
    super.onDestroy();
  }

  /** Hand the SOS to the web app and KEEP TRYING until the web app confirms it took it
   *  (the page may still be loading or reloading). Returns false if there is no bridge at all. */
  boolean fireWebSos(final String reason) {
    if (getBridge() == null) return false;
    deliverSos(reason.replace("'", ""), 0);
    return true;
  }

  private void deliverSos(final String reason, final int attempt) {
    runOnUiThread(() -> {
      try {
        if (getBridge() == null) return;
        getBridge().eval("(typeof window.__shomerNativeSOS==='function')?(window.__shomerNativeSOS('" + reason + "'),'ok'):'wait'", (v) -> {
          if (v != null && v.contains("ok")) return;
          if (attempt < 60) getWindow().getDecorView().postDelayed(() -> deliverSos(reason, attempt + 1), 750);
        });
      } catch (Exception e) {
        if (attempt < 60) getWindow().getDecorView().postDelayed(() -> deliverSos(reason, attempt + 1), 750);
      }
    });
  }

  // Once the SOS screen is no longer on top, stop showing SHOMER over the lock screen.
  @Override
  public void onStop() {
    try {
      if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(false); setTurnScreenOn(false); }
      else { getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON); }
      getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    } catch (Exception e) {}
    super.onStop();
  }

  /** A shake SOS must be visible over the lock screen and wake the display. */
  private void showOverLock() {
    try {
      if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
      else { getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON); }
      getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    } catch (Exception e) {}
  }

  // Handle a shake that arrives while the app is ALREADY running (warm start).
  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    dispatchShakeSos(intent);
  }

  // Tell the web app to run its CANCELLABLE SOS countdown. The web layer owns the
  // grace period + cancel UI + alarm; native only signals the trigger.
  private void dispatchShakeSos(Intent intent) {
    String sos = intent != null ? intent.getStringExtra("shomer_sos") : null;
    if (sos == null) return;
    showOverLock();
    // ShakeService already fired the SOS into the live web app; this launch only brings the
    // screen up. Don't fire twice (a second trigger during the countdown would cancel it).
    if (intent.getBooleanExtra("shomer_sos_fired", false)) return;
    // Not fired yet (app was closed): deliver once the web app is ready - retried, not a fixed wait.
    deliverSos(sos.replace("'", ""), 0);
  }

  // Theft-protection selfie needs the front camera. Capacitor grants the WebView's
  // getUserMedia request only when the OS CAMERA permission is already held, so ask once.
  private void ensureCameraPermission() {
    try {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
        ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, 7021);
      }
    } catch (Exception e) {}
  }
}
