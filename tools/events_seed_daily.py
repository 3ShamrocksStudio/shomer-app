"""
SH✡MER events preview: daily seed candidates (manual script, nothing is deployed).

  python3 -I tools/events_seed_daily.py            # step 1: write tools/events-seed-candidates.json
  python3 -I tools/events_seed_daily.py --approve rahat-1102,dimona-1103   # step 2: merge into events-seed.json

Step 1 reads public RSS from ynet, N12 (mako) and Haaretz and keeps violent-crime or emergency
headlines from the last 7 days that name a known town. It drops domestic or in-home cases
(the preview only shows public-space incidents). Each candidate gets a town-level point
(2 dp, about 1 km) and its source link.
Step 2 needs a human: before approving, rewrite each "sum" as a short, neutral line with no
private names. Only approved candidates reach events-seed.json, and only preview accounts see them.
Later the same logic can run as a scheduled Cloud Function that writes a review queue,
deployed only after Dave approves.
"""
import json, re, sys, html, datetime, email.utils, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "events-seed.json"
CAND = ROOT / "tools" / "events-seed-candidates.json"
FEEDS = [("ynet", "https://www.ynet.co.il/Integration/StoryRss1854.xml"),
         ("ynet", "https://www.ynet.co.il/Integration/StoryRss2.xml"),
         ("N12", "https://rcs.mako.co.il/rss/news-law.xml"),
         ("הארץ", "https://www.haaretz.co.il/srv/rss---feedly")]
B = r"(?<![א-ת])[ובהמלשכ]?"   # word start, allowing one Hebrew prefix letter
E = r"(?![א-ת])"
VIOL = re.compile(B + r"(נרצח|נרצחה|נורה|נורתה|ירי|נדקר|נדקרה|דקירה|רצח|הותקף|הותקפה|תקיפה|קטטה)" + E)
EMERG = re.compile(B + r"(שריפה|דליקה|פיצוץ|תאונה|תאונת|נפצע|נפצעה|נפצעו|נפגע|נפגעה)" + E)
FIRE = re.compile(r"שריפה|דליקה")
SKIP = re.compile(r"בדירה|בביתו|בביתה|אשתו|בעלה|בן זוגה|בת זוגו|התאבד|עזה|איראן|לבנון|בחו\"ל|אוסטרליה|ארה\"ב|נשק כימי|כתב אישום|השופט|בתיק|חקירת|עדות|פענוח|נתניהו")
TOWNS = {  # town-level points, 2 dp (~1 km)
 "תל אביב": (32.08, 34.78), "ירושלים": (31.78, 35.22), "חיפה": (32.79, 34.99), "באר שבע": (31.25, 34.79),
 "פתח תקווה": (32.09, 34.88), "ראשון לציון": (31.97, 34.79), "אשדוד": (31.80, 34.65), "נתניה": (32.32, 34.86),
 "חולון": (32.01, 34.78), "בני ברק": (32.08, 34.83), "רמת גן": (32.07, 34.82), "בת ים": (32.02, 34.75),
 "אשקלון": (31.67, 34.57), "רחובות": (31.89, 34.81), "בית שמש": (31.75, 34.99), "כפר סבא": (32.18, 34.91),
 "הרצליה": (32.16, 34.84), "חדרה": (32.44, 34.92), "מודיעין": (31.90, 35.01), "לוד": (31.95, 34.89),
 "רמלה": (31.93, 34.87), "נצרת": (32.70, 35.30), "רהט": (31.39, 34.75), "אום אל-פחם": (32.52, 35.15),
 "טייבה": (32.27, 35.01), "טירה": (32.23, 34.95), "קלנסווה": (32.28, 34.98), "שפרעם": (32.81, 35.17),
 "טמרה": (32.85, 35.20), "סכנין": (32.86, 35.30), "עכו": (32.93, 35.08), "נהריה": (33.01, 35.10),
 "טבריה": (32.79, 35.53), "עפולה": (32.61, 35.29), "דימונה": (31.07, 35.03), "אילת": (29.56, 34.95),
 "קריית גת": (31.61, 34.76), "קריית שמונה": (33.21, 35.57), "תל שבע": (31.25, 34.86), "עוספיא": (32.72, 35.06),
 "ירכא": (32.95, 35.21), "כפר קאסם": (32.11, 34.98), "ג'לג'וליה": (32.15, 34.95), "יפו": (32.05, 34.76),
 "אופקים": (31.31, 34.62), "שדרות": (31.52, 34.60), "נתיבות": (31.42, 34.59), "ערד": (31.26, 35.21),
 "כסייפה": (31.25, 35.09), "חורה": (31.30, 34.94), "לקיה": (31.32, 34.86), "ערערה": (32.50, 35.10),
}

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()

def candidates():
    now = datetime.datetime.now(datetime.timezone.utc)
    out, seen = [], set()
    for name, url in FEEDS:
        try:
            root = ET.fromstring(fetch(url))
        except Exception as e:
            print("skip feed", url, e); continue
        for it in root.iter("item"):
            t = html.unescape((it.findtext("title") or "").strip())
            d = re.sub("<[^>]+>", "", html.unescape(it.findtext("description") or "")).strip()
            link = (it.findtext("link") or "").strip()
            try: at = email.utils.parsedate_to_datetime(it.findtext("pubDate"))
            except Exception: continue
            if (now - at).days > 7: continue
            text = t + " " + d
            if SKIP.search(text) or not (VIOL.search(t) or EMERG.search(t)): continue
            town = next((k for k in TOWNS if re.search(B + re.escape(k) + E, t)), None) or next((k for k in TOWNS if re.search(B + re.escape(k) + E, d)), None)
            if not town or (town, at.date()) in seen: continue
            seen.add((town, at.date()))
            cat = "fire" if FIRE.search(t) else ("violence" if VIOL.search(t) else "medical")
            lat, lng = TOWNS[town]
            cid = re.sub(r"[^a-z0-9]+", "", link.split("/")[-1].lower())[-10:] or str(len(out))
            out.append({"id": cid, "cat": cat, "at": at.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "atKind": "reported", "lat": lat, "lng": lng, "area": {"he": town, "en": town},
                        "sum": {"he": "EDIT: " + t, "en": "EDIT"}, "src": {"name": name, "url": link},
                        "_review": "Rewrite sum.he/sum.en neutrally, no private names; confirm it is a public space."})
    CAND.write_text(json.dumps({"made": now.isoformat(), "candidates": out}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(len(out), "candidates ->", CAND)
    for c in out: print(" ", c["id"], c["cat"], c["area"]["he"], c["sum"]["he"][:80])

def approve(ids):
    cand = {c["id"]: c for c in json.loads(CAND.read_text(encoding="utf-8"))["candidates"]}
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    have = {e["id"] for e in seed["events"]}
    for i in ids:
        c = cand.get(i)
        if not c: print("unknown", i); continue
        if c["sum"]["he"].startswith("EDIT") or c["sum"]["en"] == "EDIT":
            print("refused", i, "- edit its summary in the candidates file first"); continue
        if i in have: print("already in", i); continue
        c.pop("_review", None); seed["events"].append(c); print("added", i)
    seed["updated"] = datetime.date.today().isoformat()
    SEED.write_text(json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--approve": approve(sys.argv[2].split(","))
    else: candidates()
