package il.co.shomerapp;

/**
 * SH✡MER shake pattern detector (v333). A 1:1 port of ShakeDetector() in shomer.html
 * (between the SHAKE-DETECTOR markers); tests/shake-detector.test.js --java checks that both
 * give identical results on the same synthetic traces. Pure Java, no Android imports.
 *
 * A shake is a fast BACK-AND-FORTH: strong peaks whose direction flips each time, a short
 * time apart. Running and walking make strong peaks too, but they repeat in the SAME
 * direction (foot strikes) or swing back and forth too slowly (arm swing), so they never
 * build the chain. Peak strength alone is not enough. A toss also swaps direction, but the
 * phone is in free fall between catches (reading ~0 incl. gravity for 70 ms+), which a shake
 * never is, so free fall wipes the chain.
 */
public final class ShakeDetector {
  /** thr m/s² (gravity removed), alternating peaks needed, window ms, max gap ms, max peak ms */
  private static final double[][] LEVELS = {
    {21, 5, 2000, 280, 260},   // low:    3 strong shakes within 2 s
    {17, 5, 2000, 300, 280},   // medium: 3 firm shakes
    {13, 4, 1500, 300, 300},   // high:   2 quick shakes
  };
  private static final int MAXP = 16;

  private double thr, win, gap, dur; private int need;
  private boolean init; private double gx, gy, gz; private long gt;
  private boolean ep, epBad; private long epT0, epT; private double epM, epX, epY, epZ;
  private final long[] ct = new long[MAXP]; private final double[][] cv = new double[MAXP][3]; private int cn;
  private String level = "";
  private long ff0;   // free-fall start (0 = not in free fall)

  public ShakeDetector(String level) { setLevel(level); }

  public static int index(String level) {
    if ("low".equals(level)) return 0;
    if ("high".equals(level)) return 2;
    return 1;
  }

  public void setLevel(String l) {
    String n = (l == null) ? "medium" : l;
    if (index(n) == index(level) && !level.isEmpty()) return;
    level = n;
    double[] c = LEVELS[index(n)];
    thr = c[0]; need = (int) c[1]; win = c[2]; gap = c[3]; dur = c[4];
    cn = 0; ep = false;
  }

  private static double cos(double ax, double ay, double az, double bx, double by, double bz) {
    double d = ax * bx + ay * by + az * bz;
    double n = Math.sqrt((ax * ax + ay * ay + az * az) * (bx * bx + by * by + bz * bz));
    return n > 0 ? d / n : 1;
  }

  private boolean peak(long t, double x, double y, double z) {
    boolean link = false;
    if (cn > 0) {
      long dt = t - ct[cn - 1];
      double[] l = cv[cn - 1];
      link = dt >= 50 && dt <= gap && cos(x, y, z, l[0], l[1], l[2]) < -0.5;
    }
    if (!link) cn = 0;
    if (cn == MAXP) { System.arraycopy(ct, 1, ct, 0, MAXP - 1); for (int i = 1; i < MAXP; i++) cv[i - 1] = cv[i].clone(); cn--; }
    ct[cn] = t; cv[cn][0] = x; cv[cn][1] = y; cv[cn][2] = z; cn++;
    int drop = 0; while (drop < cn && t - ct[drop] > win) drop++;
    if (drop > 0) {
      for (int i = drop; i < cn; i++) { ct[i - drop] = ct[i]; cv[i - drop] = cv[i].clone(); }
      cn -= drop;
    }
    if (cn >= need) { cn = 0; return true; }
    return false;
  }

  /** One accelerometer sample INCLUDING gravity (m/s²) at time t (ms). True = shake pattern found. */
  public boolean push(long t, double x, double y, double z) {
    if (!init) { init = true; gx = x; gy = y; gz = z; gt = t; return false; }
    if (x * x + y * y + z * z < 25) { if (ff0 == 0) ff0 = t; else if (t - ff0 >= 70) { cn = 0; ep = false; } } else ff0 = 0;
    double dt = Math.max(1, Math.min(100, t - gt)), a = Math.exp(-dt / 250.0); gt = t;
    gx = a * gx + (1 - a) * x; gy = a * gy + (1 - a) * y; gz = a * gz + (1 - a) * z;
    double vx = x - gx, vy = y - gy, vz = z - gz, m = Math.sqrt(vx * vx + vy * vy + vz * vz);
    boolean fired = false;
    if (ep && (m < thr * 0.5 || (m > thr && cos(vx, vy, vz, epX, epY, epZ) < 0))) {
      ep = false;
      if (epBad) cn = 0; else fired = peak(epT, epX, epY, epZ);
    }
    if (m > thr) {
      if (!ep) { ep = true; epBad = false; epT0 = t; epT = t; epM = m; epX = vx; epY = vy; epZ = vz; }
      else if (m > epM) { epT = t; epM = m; epX = vx; epY = vy; epZ = vz; }
      if (t - epT0 > dur) epBad = true;
    }
    return fired;
  }
}
