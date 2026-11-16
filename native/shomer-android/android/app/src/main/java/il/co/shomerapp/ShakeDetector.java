package il.co.shomerapp;

import java.util.ArrayList;
import java.util.Arrays;

/**
 * SH✡MER deliberate-shake detector (v337). A 1:1 port of ShakeDetector() in shomer.html
 * (between the SHAKE-DETECTOR markers); `node tests/shake-detector.test.js --java` runs both on
 * the same synthetic traces and requires identical results.
 *
 * A deliberate shake = several STRONG jerks (2.5-3 g after gravity is removed) whose direction
 * flips each time, 75-260 ms apart and rhythmic, all inside 1.5 s. Walking and running cannot
 * build that chain; when a steady 1.4-3.7 Hz gait rhythm is seen, one more reversal is required.
 * Free fall (toss / drop) wipes the chain. After a detection the rest of that shake is ignored (2 s).
 * Research and thresholds: docs/SHAKE-DETECTION.md.
 */
public final class ShakeDetector {
  private static final double G = 9.81;
  private final double thr; private final int peaks; private final long win, gap, dur;
  private final String level;

  private static final class Pk { long t; double m, x, y, z; Pk(long t, double m, double x, double y, double z) { this.t = t; this.m = m; this.x = x; this.y = y; this.z = z; } }
  private static final class Ep { long t0, t, hi; double m, x, y, z; boolean bad; }

  private boolean init; private double gx, gy, gz; private long gt;
  private Ep ep;
  private final ArrayList<Pk> chain = new ArrayList<>();
  private final ArrayList<Long> strong = new ArrayList<>();
  private long ff0, gaitUntil, quiet;
  private boolean bt; private long bt0, bt1;

  public ShakeDetector(String lvl) {
    if ("low".equals(lvl)) { thr = 3.0 * G; peaks = 4; win = 1500; gap = 260; dur = 220; }
    else if ("high".equals(lvl)) { thr = 2.5 * G; peaks = 3; win = 1500; gap = 260; dur = 260; }
    else { thr = 2.7 * G; peaks = 3; win = 1500; gap = 260; dur = 240; }
    level = lvl;
  }

  public String level() { return level; }

  private static double cos(double ax, double ay, double az, double bx, double by, double bz) {
    double d = ax * bx + ay * by + az * bz, n = Math.sqrt((ax * ax + ay * ay + az * az) * (bx * bx + by * by + bz * bz));
    return n != 0 ? d / n : 1;
  }

  private void beat(long t) {
    if (bt && t - bt1 < 150) { bt1 = t; return; }
    if (bt) gaitCheck(bt0);
    bt = true; bt0 = t; bt1 = t;
  }

  private void gaitCheck(long t) {
    strong.add(t); if (strong.size() > 6) strong.remove(0);
    if (strong.size() < 5) return;
    long[] all = new long[strong.size() - 1];
    for (int i = 1; i < strong.size(); i++) all[i - 1] = strong.get(i) - strong.get(i - 1);
    long[] iv = Arrays.copyOfRange(all, all.length - 4, all.length);
    long[] s = iv.clone(); Arrays.sort(s);
    double med = (s[1] + s[2]) / 2.0;
    if (med < 270 || med > 720) return;
    for (long v : iv) if (Math.abs(v - med) > 0.2 * med) return;
    gaitUntil = t + 2000;
  }

  private boolean peak(Pk p) {
    if (p.t < quiet) return false;
    Pk last = chain.isEmpty() ? null : chain.get(chain.size() - 1);
    long dt = last != null ? p.t - last.t : 0;
    if (last != null && dt >= 75 && dt <= gap && cos(p.x, p.y, p.z, last.x, last.y, last.z) < -0.5) {
      long pd = chain.size() > 1 ? last.t - chain.get(chain.size() - 2).t : 0;
      if (pd != 0 && (dt < pd * 0.5 || dt > pd * 2)) { chain.clear(); chain.add(last); }
      chain.add(p);
    } else { chain.clear(); chain.add(p); }
    while (!chain.isEmpty() && p.t - chain.get(0).t > win) chain.remove(0);
    int need = peaks + (p.t < gaitUntil ? 1 : 0);
    if (chain.size() >= need) { chain.clear(); quiet = p.t + 2000; return true; }
    return false;
  }

  /** One accelerometer sample in m/s², including gravity. Returns true when a deliberate shake completes. */
  public boolean push(long t, double x, double y, double z) {
    if (!init) { init = true; gx = x; gy = y; gz = z; gt = t; return false; }
    if (x * x + y * y + z * z < 25) { if (ff0 == 0) ff0 = t; else if (t - ff0 >= 70) { chain.clear(); ep = null; } } else ff0 = 0;
    double dt = Math.max(1, Math.min(100, t - gt)), A = Math.exp(-dt / 250); gt = t;
    gx = A * gx + (1 - A) * x; gy = A * gy + (1 - A) * y; gz = A * gz + (1 - A) * z;
    double vx = x - gx, vy = y - gy, vz = z - gz, m = Math.sqrt(vx * vx + vy * vy + vz * vz);
    boolean fired = false;
    if (ep != null && (m < thr * 0.5 || (m > thr * 0.6 && cos(vx, vy, vz, ep.x, ep.y, ep.z) < 0))) {
      Ep e = ep; ep = null; beat(e.t);
      if (e.bad) chain.clear(); else if (e.m > thr) fired = peak(new Pk(e.t, e.m, e.x, e.y, e.z));
    }
    if (m > thr * 0.6) {
      if (ep == null) { ep = new Ep(); ep.t0 = t; ep.t = t; ep.m = m; ep.x = vx; ep.y = vy; ep.z = vz; ep.hi = 0; }
      else if (m > ep.m) { ep.t = t; ep.m = m; ep.x = vx; ep.y = vy; ep.z = vz; }
      if (m > thr) { if (ep.hi == 0) ep.hi = t; if (t - ep.hi > dur) ep.bad = true; }
    }
    return fired;
  }
}
