# SH✡MER · map events: source table (v322, 4 Nov 2026)

Every event in `events-seed.json`, with the claims a verifier can check against the linked pages.
Rules: shown to all users for 90 days from the event time (`at`), then dropped; `pinned:true` stays (Zalka, Dave's request).
Credited in the card as "צוות SH✡MER · לפי <src>", never to a user. Points are town/area level, rounded to 2 dp (~1 km).
No names of private individuals (except the pinned Zalka memorial, unchanged by Dave's earlier decision), no addresses, no ages.
Times in the file are UTC. Israel was UTC+3 until 25 Oct 2026 and UTC+2 after.
`atKind`: `time` = exact time from the source; `reported` = first-report time (shown with ~); `date` = date only (no time shown).

## New in v322 (8)

| id | type | event date (Israel time) | where (point) | sources | checkable claims |
|---|---|---|---|---|---|
| mifalsim-1103 | medical | 3.11.2026, 20:03 (MDA report time) · `time` | Route 232, Mefalsim entrance (31.50, 34.56) | [Walla](https://www.walla.co.il/news/breaking-news/383960003) · [Maariv](https://www.maariv.co.il/breaking-news/article-1384545) | 3 vehicles; 7 injured, 4 moderate; all to Barzilai; per MDA |
| ramim-1030 | suspicious | 30.10.2026 · `date` | Ramim Ridge, Upper Galilee (33.21, 35.55) | [ynet](https://www.ynet.co.il/news/article/rjsubs7amx) · [Maariv](https://www.maariv.co.il/news/military/article-1383086) | IDF: report of unexploded ordnance (נפלים) at Ramim Ridge; closed military zone; hikers barred (Kiryat Shmona statement, Maariv); disposal teams working |
| south-floods-1027 | other (weather) | 27.10.2026 · `date` | Eilat and the Arava (29.56, 34.95) | [Israel Hayom](https://www.israelhayom.co.il/news/local/article/21718414) · [ynet](https://www.ynet.co.il/news/article/rylzgbjtze) | heavy rain, floods in the south; police closed sections of Route 90 and other roads; road access in/out of Eilat blocked (exit only toward Ramon Airport); rescuers searched for people/vehicles (Israel Hayom: tractor driver found alive) |
| arava-quake-1021 | other (earthquake) | 21.10.2026, 11:00 · `time` | Arava (30.60, 35.20, regional marker: epicentre not published) | [Walla](https://www.walla.co.il/news/israel/383958315) · [ynet](https://www.ynet.co.il/news/article/bjeguglngl) | magnitude 3.4 per the Geological Survey; felt elsewhere; no injuries or damage (Walla). Time 11:00 is from Walla; ynet says "midday" |
| kiryatgat-1014 | fire | 14.10.2026, 14:11 (MDA call) · `time` | Kiryat Gat industrial park (31.61, 34.76) | [Maariv](https://www.maariv.co.il/news/israel/article-1377135) · [Times of Israel](https://www.timesofisrael.com/second-worker-dies-of-wounds-sustained-in-intel-plant-blast-in-southern-israel/) | blast and fire at the Intel site; 3 workers seriously injured, 2 died of their wounds; suspected gas cylinder explosion (police); hazmat teams checked a possible leak |
| route6-0929 | medical | 29.9.2026, 09:42 (MDA report time) · `time` | Route 6 north, Iron to Ein Tut interchange (32.52, 35.04) | [N12](https://www.mako.co.il/news-israel/2026_q3/Article-462e1e13f2ce0a1027.htm) · [ynet](https://www.ynet.co.il/news/article/sjxfxxkqgl) | 8-vehicle chain crash; 18 lightly injured; 10 to Hillel Yaffe; per MDA |
| haruvit-0926 | fire | 26.9.2026, ~14:33 (first report, Davar) · `reported` | Haruvit Forest, between Kiryat Malachi and Beit Shemesh (31.70, 34.86) | [ynet](https://www.ynet.co.il/news/article/sywghhhqzg) · [Davar](https://www.davar1.co.il/698731/) | ~600 dunams; 51 fire crews and 8 aircraft (ynet); hikers evacuated; no injuries reported; arson suspected, passed to police |
| meashearim-0923 | fire | 23.9.2026, ~18:30 (first report, Kipa) · `reported` | Jerusalem, Mea She'arim (31.79, 35.22) | [Kipa](https://www.kipa.co.il/%D7%97%D7%93%D7%A9%D7%95%D7%AA/1232191-0/) · [Jerusalem Post](https://www.jpost.com/israel-news/article-909476) | fire in a synagogue; firefighters ruled out anyone trapped; no injuries; several Torah scrolls damaged |

## Kept from v321 (6)

| id | type | event date | sources | v322 change |
|---|---|---|---|---|
| zalka | violence | 21.4.2026 · `date` | [N12](https://www.mako.co.il/news-law/2026_q2/Article-f6a371cc9bdbd91027.htm) · [ynetnews](https://www.ynetnews.com/article/2866zicrf) | `pinned:true` (Dave asked to keep it past 90 days); text unchanged |
| rahat-1102 | violence | 2.11.2026, 17:11 · `time` | [ynet](https://www.ynet.co.il/news/article/bjaxsnitzg) | none |
| isfiya-1101 | violence | 1.11.2026, 06:25 · `time` | [ynet](https://www.ynet.co.il/news/article/hyv25sntgl) | age removed |
| telsheva-1030 | violence | 30.10.2026, ~22:32 · `reported` | [Haaretz](https://www.haaretz.co.il/news/law/2026-10-30/ty-article/000001a1-8e80-def7-adad-8ef84cf20000) | none |
| dimona-1103 | medical | 3.11.2026, ~18:35 · `reported` | [ynet](https://www.ynet.co.il/news/article/h1ibpkptze) | age removed |
| pt-sirkin-1103 | medical | 3.11.2026, ~15:36 · `reported` | [ynet](https://www.ynet.co.il/news/article/hykgxwdazx) | age removed |

The 5 kept non-Zalka events still have one source each (v321). A second source was not added in v322.

## Considered and left out
- Beit Shemesh / Ksalon wildfire (2.8.2026): older than 90 days.
- Ramim Ridge school-trip blast (12.10.2026): a minor died and was named. Left out on privacy grounds, and because the responsibility questions are still disputed.
- Route 25 bus–tractor crash (30.10.2026): the details (a girls' school trip, the driver's death) point to a specific group.
- Intel hazmat follow-up (19.10.2026): folded into the 14.10 event.

## Images and tips
- Images are the app's own category illustrations, `img/events/<type>.svg` (about 1 KB each, lazy-loaded). They contain no news photos and no people.
- "מה עושים במצב כזה" is one general tip per type (`TIPS` in `events-preview.js`). The flood, earthquake and Kiryat Gat events have a tip of their own (`tip`). Every card ends with "בחירום, חייגו קודם 100 · 101 · 102".


## 2026-11-04 fact-check corrections
- meashearim-0923 removed: sources disagree on the structure (Kipa: synagogue in Sha'arei Pina; JPost: residential temporary structure in Mea She'arim) and the first-report time.
- south-floods-1027: summary trimmed to what both sources support (road closures).
- haruvit-0926: removed unsourced location phrase and 'no injuries reported'.
