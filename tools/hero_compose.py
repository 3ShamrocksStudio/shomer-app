#!/usr/bin/env python3
"""
Build the SH*MER hero mockup: take the REAL app map screenshot and composite the
value layers the app genuinely renders, so the hero shows the product working
instead of an empty map.

Every layer below corresponds to shipped app behaviour:
  - police crime-stat circles  -> statsRender()  (shomer.html, STATS layer, on by default)
  - past-event pins            -> PAST_EVENTS awareness layer (#5B8CA8 teardrop + clock)
  - live SOS event             -> sosIcon() / mk-sos ring+core (#FF1A40)
  - converging responders      -> responderIcon() green shield #0E8840 + white stroke
  - "N שומרים בדרך" card       -> ev-resp-h (#37D98A) + showRespToPerson()

Nothing is invented. Nothing already approved on the screenshot is altered or covered.
"""
from PIL import Image, ImageDraw, ImageFont
import math

SRC = "app-shots-map-v2.jpg"
OUT = "app-shots-map-v3.jpg"

FONT = "/tmp/Heebo.ttf"
S = 1080 / 390.0  # CSS px -> screenshot px


def font(size_css, weight="Bold"):
    f = ImageFont.truetype(FONT, int(round(size_css * S)))
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


base = Image.open(SRC).convert("RGB")
W, H = base.size
ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)

# ── 1. POLICE CRIME-STAT CIRCLES ──────────────────────────────────────────
# statsRender(): fillOpacity .10, stroke opacity .35, weight 1, beneath everything.
# Colours are statsColor(): violent / property / public-order.
for cx, cy, r, col in [
    (285, 760, 345, "#E5484D"),   # violent
    (825, 1125, 385, "#2962FF"),  # property
    (395, 1665, 305, "#E0A828"),  # public order
]:
    rgb = hex2rgb(col)
    d.ellipse([cx - r, cy - r, cx + r, cy + r],
              fill=rgb + (26,), outline=rgb + (90,), width=3)

# ── 2. PAST-EVENT PINS (historical awareness layer) ───────────────────────
PAST = "#5B8CA8"


def past_pin(cx, cy, scale=1.0):
    """Teardrop + clock glyph, matching pastMarkerHTML()."""
    w, h = 74 * scale, 94 * scale
    x, y = cx - w / 2, cy - h
    rgb = hex2rgb(PAST)
    # teardrop body
    d.ellipse([x, y, x + w, y + w], fill=rgb + (255,), outline=(10, 22, 40, 255), width=4)
    d.polygon([(x + w * 0.16, y + w * 0.70), (x + w * 0.84, y + w * 0.70), (cx, y + h)],
              fill=rgb + (255,))
    d.polygon([(x + w * 0.16, y + w * 0.70), (x + w * 0.84, y + w * 0.70), (cx, y + h)],
              outline=(10, 22, 40, 255), width=4)
    # clock face
    cyy = y + w / 2
    rr = w * 0.26
    d.ellipse([cx - rr, cyy - rr, cx + rr, cyy + rr], outline=(255, 255, 255, 255), width=4)
    d.line([(cx, cyy - rr * 0.62), (cx, cyy)], fill=(255, 255, 255, 255), width=4)
    d.line([(cx, cyy), (cx + rr * 0.55, cyy + rr * 0.34)], fill=(255, 255, 255, 255), width=4)


for p in [(170, 905), (255, 1425), (900, 1585)]:
    past_pin(*p)

# ── 3. CONVERGING RESPONDER TRAILS ────────────────────────────────────────
EV = (735, 700)
RESP = [(395, 455), (925, 1015), (355, 1010)]
GRN = hex2rgb("#0E8840")


def dashed(p0, p1, col, width, dash=26, gap=20, stop=70):
    x0, y0 = p0
    x1, y1 = p1
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    if L == 0:
        return
    ux, uy = dx / L, dy / L
    t = 46.0                      # start clear of the responder dot
    while t < L - stop:           # stop clear of the event core
        t2 = min(t + dash, L - stop)
        d.line([(x0 + ux * t, y0 + uy * t), (x0 + ux * t2, y0 + uy * t2)],
               fill=col, width=width, joint="curve")
        t += dash + gap


for r in RESP:
    dashed(r, EV, (55, 217, 138, 130), 6)

# ── 4. LIVE SOS EVENT (mk-sos: expanding ring + core) ─────────────────────
SOSC = hex2rgb("#FF1A40")
for r, a in [(165, 22), (120, 40), (82, 70)]:
    d.ellipse([EV[0] - r, EV[1] - r, EV[0] + r, EV[1] + r], fill=SOSC + (a,))
d.ellipse([EV[0] - 82, EV[1] - 82, EV[0] + 82, EV[1] + 82], outline=SOSC + (170,), width=4)
d.ellipse([EV[0] - 40, EV[1] - 40, EV[0] + 40, EV[1] + 40],
          fill=SOSC + (255,), outline=(255, 255, 255, 255), width=7)

# ── 5. RESPONDER MARKERS (responderIcon: green shield, white stroke) ──────
def responder(cx, cy):
    R = 40
    d.ellipse([cx - R - 14, cy - R - 14, cx + R + 14, cy + R + 14], fill=GRN + (55,))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(10, 22, 40, 235), outline=GRN + (255,), width=5)
    # shield glyph  M12 3l7 3v5c0 5-3.4 8.5-7 10-3.6-1.5-7-5-7-10V6Z  (24x24 -> fitted)
    k = (2 * R * 0.62) / 24.0
    ox, oy = cx - 12 * k, cy - 12.5 * k
    pts = [(12, 3), (19, 6), (19, 11), (17.6, 15.4), (14.8, 19), (12, 21),
           (9.2, 19), (6.4, 15.4), (5, 11), (5, 6)]
    d.polygon([(ox + px * k, oy + py * k) for px, py in pts],
              fill=GRN + (255,), outline=(255, 255, 255, 255), width=4)


for r in RESP:
    responder(*r)

# ── 6. LIVE STATUS CARD (ev-resp-h idiom, RTL) ────────────────────────────
CX0, CY0, CX1, CY1 = 96, 1656, 984, 1818
d.rounded_rectangle([CX0, CY0, CX1, CY1], radius=int(16 * S),
                    fill=(10, 22, 40, 238), outline=(224, 168, 40, 110), width=3)

f_ttl = font(15.5, "ExtraBold")
f_sub = font(13.5, "Bold")

pad = int(20 * S)
tx = CX1 - pad                                     # RTL: text is right-anchored
d.text((tx, CY0 + int(24 * S) / 2 + 16), "אירוע חי בקרבתך · 240 מ׳",
       font=f_ttl, fill=(240, 244, 255, 255), anchor="rm")

# green pulse dot + responder count
sub_y = CY1 - int(20 * S) / 2 - 14
d.text((tx, sub_y), "3 שומרים בדרך", font=f_sub, fill=hex2rgb("#37D98A") + (255,), anchor="rm")
tw = d.textlength("3 שומרים בדרך", font=f_sub)
dot_x = tx - tw - int(13 * S)
dr = int(4.5 * S)
d.ellipse([dot_x - dr - 9, sub_y - dr - 9, dot_x + dr + 9, sub_y + dr + 9],
          fill=hex2rgb("#37D98A") + (70,))
d.ellipse([dot_x - dr, sub_y - dr, dot_x + dr, sub_y + dr], fill=hex2rgb("#37D98A") + (255,))

# left side of the card: SOS type chip
chip_w, chip_h = int(96 * S / 2.2), int(30 * S / 1.55)
d.rounded_rectangle([CX0 + pad, (CY0 + CY1) // 2 - chip_h // 2,
                     CX0 + pad + chip_w, (CY0 + CY1) // 2 + chip_h // 2],
                    radius=chip_h // 2, fill=hex2rgb("#CC1426") + (46,),
                    outline=hex2rgb("#E8182C") + (150,), width=3)
d.text((CX0 + pad + chip_w // 2, (CY0 + CY1) // 2), "SOS", font=font(13, "ExtraBold"),
       fill=hex2rgb("#FF6070") + (255,), anchor="mm")

out = Image.alpha_composite(base.convert("RGBA"), ov).convert("RGB")
out.save(OUT, quality=90, optimize=True, progressive=True)
print("wrote", OUT, out.size)
