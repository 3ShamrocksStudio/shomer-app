package il.co.shomerapp;

import android.content.Context;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;

/**
 * v409 - the flashlight flashing SOS in Morse, natively.
 *
 * This existed only in the web layer, driven by getUserMedia + applyConstraints({torch:true}).
 * That path needs the camera, needs the page to be running, and is simply gone the moment the
 * screen locks or Android freezes the WebView - which is the exact situation the whole
 * button+shake gesture is built for. So on a locked phone the SOS had sound and vibration and
 * no light, however many times the code said "flashlight morse".
 *
 * CameraManager.setTorchMode needs no CAMERA permission and no preview surface, and it works
 * from a foreground service with the screen off. It is driven off its own HandlerThread so a
 * busy main looper cannot stutter the pattern.
 *
 * It stops the instant the siren stops: a light nobody can switch off is its own emergency.
 */
final class TorchMorse {

  /* · · ·   - - -   · · ·  -- true = lit. Timings in ms, at the slow end of readable Morse,
     because this is meant to be recognised across a street, not decoded by an operator. */
  private static final int UNIT = 220;
  private static final int DOT = UNIT, DASH = UNIT * 3, GAP = UNIT, LETTER_GAP = UNIT * 3, CYCLE_GAP = UNIT * 7;
  private static final int[] PATTERN = { DOT, DOT, DOT, DASH, DASH, DASH, DOT, DOT, DOT };
  private static final int[] AFTER   = { GAP, GAP, LETTER_GAP, GAP, GAP, LETTER_GAP, GAP, GAP, CYCLE_GAP };

  private static HandlerThread sThread;
  private static Handler sH;
  private static CameraManager sCam;
  private static String sId;
  private static volatile boolean sRunning = false;
  private static int sStep = 0;

  static synchronized boolean isRunning() { return sRunning; }

  static synchronized void start(Context c) {
    if (sRunning || c == null) return;
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;   // setTorchMode is API 23+
    try {
      sCam = (CameraManager) c.getApplicationContext().getSystemService(Context.CAMERA_SERVICE);
      if (sCam == null) return;
      sId = null;
      for (String id : sCam.getCameraIdList()) {
        try {
          CameraCharacteristics ch = sCam.getCameraCharacteristics(id);
          Boolean has = ch.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
          Integer face = ch.get(CameraCharacteristics.LENS_FACING);
          if (has != null && has) {
            sId = id;
            /* prefer the back lens, but take any flash rather than none */
            if (face != null && face == CameraCharacteristics.LENS_FACING_BACK) break;
          }
        } catch (Throwable e) {}
      }
      if (sId == null) {   // tablets and some devices simply have no flash
        AlarmForegroundService.note(new RuntimeException("no camera flash on this device"), "torch-none");
        return;
      }
      if (sThread == null || !sThread.isAlive()) {
        sThread = new HandlerThread("shomer-torch");
        sThread.start();
        sH = new Handler(sThread.getLooper());
      }
      sRunning = true;
      sStep = 0;
      sH.post(RUN);
    } catch (Throwable e) {
      sRunning = false;
      AlarmForegroundService.note(e, "torch-start");
    }
  }

  static synchronized void stop() {
    sRunning = false;
    try { if (sH != null) sH.removeCallbacksAndMessages(null); } catch (Throwable e) {}
    set(false);
  }

  private static void set(boolean on) {
    try {
      if (sCam != null && sId != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) sCam.setTorchMode(sId, on);
    } catch (Throwable e) {
      /* CameraAccessException: another app holds the camera, or the torch was yanked. Say so
         once and give up quietly - the siren and the vibration carry on regardless. */
      if (sRunning) { sRunning = false; AlarmForegroundService.note(e, "torch"); }
    }
  }

  private static final Runnable RUN = new Runnable() {
    @Override public void run() {
      if (!sRunning) { set(false); return; }
      int i = sStep % PATTERN.length;
      set(true);
      final int onMs = PATTERN[i], offMs = AFTER[i];
      sH.postDelayed(new Runnable() {
        @Override public void run() {
          set(false);
          if (!sRunning) return;
          sStep++;
          sH.postDelayed(RUN, offMs);
        }
      }, onMs);
    }
  };

  private TorchMorse() {}
}
