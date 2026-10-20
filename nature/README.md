# SHOMER Nature · שומר טבע

**Guardians of the Wild & Coast** — one community guardian PWA that merges Israel's
forests, nature reserves **and** coastline into a single live safety map.

Part of the **SHOMER** family by **3Shamrocks Studio** — same shield, same design
system, themed in a light natural palette.

## What it does

One map, one event set covering the full range of nature hazards:

| | Hazard | Forest | Coast |
|---|---|:---:|:---:|
| 🔥 | Wildfire / smoke | ✓ | |
| 🗑️ | Pollution / illegal dumping | ✓ | ✓ |
| 🐾 | Injured / distressed wildlife | ✓ | ✓ |
| 〜 | Rip current / drowning | | ✓ |
| 🧍 | Lost hiker / child | ✓ | ✓ |
| ⚠️ | Trail / beach hazard | ✓ | ✓ |

Plus **live SOS**, a personal safety alarm, Dead-Man's-Switch, shake-to-SOS, and a
direct line to the authorities (Fire & Rescue, Nature & Parks Authority, Marine
Rescue, Ministry of Environmental Protection).

The map markers are an **aggregate area overview** of Israel's major forests,
reserves and beaches (Carmel, Ben Shemen, Yatir, Biriya, Hula, Ramat HaNadiv;
Tel Aviv, Herzliya, Haifa, Netanya, Eilat) — **not** specific incidents. Personal
pins come only from user reports and live SOS.

## Tech

- Single-file PWA (`nature.html`) — no build step.
- Real interactive map via Leaflet + OpenStreetMap tiles.
- Full **Hebrew / English** (RTL + LTR).
- Offline support + push via service worker (`sw.js`), installable (`manifest.json`).
- Strict CSP, accessible contrast, reduced-motion & high-contrast support.

## Run locally

```sh
python3 -m http.server 8144
# open http://localhost:8144/
```

## Sources

KKL-JNF · Israel Nature & Parks Authority · Israel Fire & Rescue ·
Ministry of Environmental Protection. Emergency numbers marked "verify" still need
final confirmation.

---

© 2026 **3Shamrocks Studio** · All rights reserved.
