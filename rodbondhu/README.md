# Rod Bondhu website

Bilingual (Bangla default, English) site for **Rod Bondhu (রোদ বন্ধু)**, the OASIS smart solar dryer,
plus its live dryer app. Built the same way as the VenGuard site (`../venguard/`).

Published at `/Rod_Bondhu/` (Bangla), `/Rod_Bondhu/en/` (English) and `/Rod_Bondhu/app/` (live app).
`/Dryer_Name/` (the RE Fest 2026 poster QR code) redirects to `/Rod_Bondhu/`, and `/Rod_Bondhu/?demo`
forwards to `/Rod_Bondhu/app/?demo`.

```
rodbondhu/
├── site.json          contacts, team, status timeline, references
├── templates/         base.html, partials/, pages/*.html  ({{ t("বাংলা", "English") }})
├── assets/            css/, js/, fonts/, img/ (published as-is)
├── app/index.html     the live app: one self-contained page (MQTT over WebSocket, demo mode)
└── tools/build.py     renders every page in both languages, copies assets and the app
└── firmware/          ESP32 sketch (not published) + a no-hardware test bench, see firmware/README.md
```

Build and preview from the repository root:

```bash
python3 scripts/build.py && python3 scripts/check_links.py
python3 -m http.server 8000 -d _site     # http://localhost:8000/Rod_Bondhu/
```

## Common edits

| Task | Where |
|---|---|
| A reference's full citation | `site.json → references[].citation` (shown once filled in) |
| Status timeline | `site.json → status_timeline` (`done` / `current` / `next`) |
| Team | `site.json → team` |
| Contacts | `site.json → contact` (same values as `venguard/site.json`) |
| Add a page | `templates/pages/<name>.html` + `PAGES` in `tools/build.py` + `nav` in `templates/partials/header.html` |
| App: MQTT topic | `TOPIC_BASE` in `app/index.html` and `firmware/solar_dryer_cloud/solar_dryer_cloud.ino` (must match) |
| Firmware or app protocol change | run `firmware/test/run.sh` (21 end-to-end checks, no hardware) |

## Rules

- **Prototype honesty:** Rod Bondhu is a prototype. No price, no "available now", and every number must
  trace to the poster, our tests, the CFD model or a reference (the Sources page shows the working).
- **Demo data is always labelled:** the app's demo mode marks every screen and never turns on by itself.
- The language choice is shared between the site and the app (`localStorage` key `rb_lang`).
