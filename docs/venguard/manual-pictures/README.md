# Pictures for the manuals

Two manuals use real screenshots with numbered orange rings on what to press:

- **Customer guide** on the website: `venguard/templates/pages/app-guide.html`, pictures in
  `venguard/assets/img/app-guide/<bn|en>/NN-name.webp` (540 px wide).
- **Team dashboard Manual** (`team-dashboard/js/views/manual.js`), pictures in
  `team-dashboard/manual/NN-name.webp` (1100 px wide). It also reuses some English app pictures.

Retake them when a screen changes. The scripts here were used to make them; adjust the paths at the top
of each (Playwright, the Firebase SDK in `venguard-app/node_modules`, the rules-test `node_modules`).

| Script | What it does |
|---|---|
| `mark.mjs` | draws the numbered rings (`mark(page, [[locator, number, padding], …])`) |
| `dash-shots.mjs` | the dashboard in demo mode (`http://localhost:8765/team/?demo` after `python3 scripts/build.py` and `python3 -m http.server 8765 -d _site`) → 20 pictures |
| `app-shots.mjs <out> <ctrl> <bn|en>` | the Android layout of the app against the local Firebase emulators, as a new customer: sign up, add a device, leak, mitigated, reset, history, remove, profile → 15 pictures |
| `node-dash.mjs <ctrl>` | runs the dashboard's own emulator code (`store.js`, `emulator.js`) against the emulators: creates and starts the test device that `app-shots.mjs` adds, and follows its commands (`<ctrl>/cmd.txt`) |

App pictures, in short:

1. Start the emulators from `backend/connected-firebase/rules-test` with `--project demo-venguard`
   (auth, firestore, database) and load `database.rules.json` into the
   `venguard-connected-default-rtdb` namespace (`PUT /.settings/rules.json`).
2. In `venguard-app`: `VITE_FIREBASE_EMULATORS=1 npx vite --port 5173`.
3. For each language: start `node-dash.mjs <ctrl>` in the background, then run `app-shots.mjs`.
4. Convert the PNGs to WebP at the widths above (Pillow, quality about 78).

The pictures show made-up data only (example names, example device ID `VG-0001A3`).
