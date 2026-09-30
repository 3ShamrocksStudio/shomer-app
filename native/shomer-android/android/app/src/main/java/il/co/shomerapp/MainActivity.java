package il.co.shomerapp;

import android.os.Bundle;
import android.content.Intent;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Register SHOMER's native bridge BEFORE the web layer loads.
    registerPlugin(ShomerNativePlugin.class);
    super.onCreate(savedInstanceState);
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
}
