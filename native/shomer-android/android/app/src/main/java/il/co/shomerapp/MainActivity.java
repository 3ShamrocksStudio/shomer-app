package il.co.shomerapp;

import android.os.Bundle;
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
    ensureCameraPermission();
    dispatchShakeSos(getIntent());
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
