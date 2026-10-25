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

  /** Run the web SOS trigger now (screen on or off). Returns false if there is no live web app. */
  boolean fireWebSos(final String reason) {
    try {
      if (getBridge() == null) return false;
      runOnUiThread(() -> {
        try { getBridge().eval("window.__shomerNativeSOS && window.__shomerNativeSOS('" + reason + "');", (v) -> {}); } catch (Exception e) {}
      });
      return true;
    } catch (Exception e) { return false; }
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
    final String reason = sos.replace("'", "");
    getWindow().getDecorView().postDelayed(() -> {
      try {
        if (getBridge() != null) {
          getBridge().eval("window.__shomerNativeSOS && window.__shomerNativeSOS('" + reason + "');", (v) -> {});
        }
      } catch (Exception e) {}
    }, 1200);
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
