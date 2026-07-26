"""
Compare the desktop rendering of index.html BEFORE my changes vs NOW, at several
desktop widths, and report any element whose size or position moved.
"""
import asyncio, sys, json
from playwright.async_api import async_playwright

WIDTHS = [1920, 1440, 1280, 1024]

PROBE = """() => {
    const out = {};
    const q = (sel, key) => {
        document.querySelectorAll(sel).forEach((el, i) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            out[key + '[' + i + ']'] = {
                x: Math.round(r.left), y: Math.round(r.top + scrollY),
                w: Math.round(r.width), h: Math.round(r.height),
                fs: cs.fontSize, lh: cs.lineHeight,
                lines: Math.round(r.height / parseFloat(cs.lineHeight || cs.fontSize)),
                txt: (el.textContent || '').trim().slice(0, 26)
            };
        });
    };
    q('.hero', 'hero');
    q('.hero-phone', 'heroPhone');
    q('.hero-phone img', 'heroImg');
    q('.hero-text h1', 'h1');
    q('.hero-text p', 'hsub');
    q('.hero-cta', 'cta');
    q('.adv h2', 'advH2');
    q('.adv-grid', 'advGrid');
    q('.adv-col', 'advCol');
    q('.adv-col h3', 'advH3');
    q('.adv-col p', 'advP');
    q('.arrive-inner', 'arrive');
    out.__docH = document.body.scrollHeight;
    return out;
}"""


async def grab(pg, url, w):
    await pg.set_viewport_size({"width": w, "height": 1000})
    await pg.goto(url, wait_until="load", timeout=60000)
    await pg.wait_for_timeout(1800)
    return await pg.evaluate(PROBE)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage",
                                          "--ignore-certificate-errors"])
        ctx = await b.new_context(ignore_https_errors=True, locale="he-IL")
        pg = await ctx.new_page()

        for w in WIDTHS:
            before = await grab(pg, f"http://127.0.0.1:8898/index.html", w)
            after = await grab(pg, f"http://127.0.0.1:8899/index.html", w)
            print(f"\n{'='*66}\nWIDTH {w}px")
            keys = sorted(set(before) | set(after))
            diffs = 0
            for k in keys:
                a, bf = after.get(k), before.get(k)
                if a is None or bf is None:
                    print(f"  {k:16s} MISSING  before={bf is not None} after={a is not None}")
                    diffs += 1
                    continue
                if k == "__docH":
                    if abs(a - bf) > 2:
                        print(f"  page height      {bf} -> {a}  ({a-bf:+d}px)")
                        diffs += 1
                    continue
                ch = [f"{f}:{bf[f]}->{a[f]}" for f in ("x", "y", "w", "h", "fs", "lh", "lines")
                      if bf[f] != a[f]]
                if ch:
                    print(f"  {k:16s} {' '.join(ch)}   [{a['txt']}]")
                    diffs += 1
            if not diffs:
                print("  no layout differences")
        await b.close()


asyncio.run(main())
