# Rod Bondhu firmware (ESP32)

`solar_dryer_cloud/solar_dryer_cloud.ino` runs the dryer: sensing, fan control, the local dashboard on the
dryer's own Wi-Fi, the hotspot setup portal, and the link to the online app at
<https://oasisnextbd.github.io/OASIS_official_website/Rod_Bondhu/app/>.

## Flash it

1. Arduino IDE → board **ESP32 Dev Module** (Espressif ESP32 package).
2. Libraries: **DHT sensor library** + **Adafruit Unified Sensor** (Adafruit), **PubSubClient** (Nick O'Leary).
3. Copy `secrets.example.h` to `secrets.h` in the same folder and set:
   - `SECRET_CONTROL_PIN`: the PIN for fan control from the online app. Use 8+ characters, not a year.
   - `SECRET_AP_PASS`: the password of the dryer's own Wi-Fi `SolarDryer-BUET`.
   `secrets.h` is git-ignored, and the sketch stops with a clear error if it is missing.
4. Upload, open the Serial Monitor at 115200 baud.

## Connect it to the internet (once)

Join `SolarDryer-BUET` → the setup page opens (or go to `http://192.168.4.1/wifi`) → pick the phone
hotspot (2.4 GHz, mobile data on) → **Save and connect**. When the Serial Monitor shows
`MQTT connected: online dashboard is live`, the app at the link above turns **Live**.

Once a hotspot has reached the internet it is remembered as working, even across restarts and battery
swaps: if it is switched off, the dryer keeps retrying instead of erasing it. Only details that never
worked are erased after 3 tries.

## What changed in 1.1.0

| Area | Change |
|---|---|
| Online control | Commands are signed with HMAC-SHA256 over a one-time nonce: the PIN never travels and a recorded command cannot be replayed. 5 wrong PINs in a minute lock control for a minute. The app gets an instant reply (`ack`) such as "Wrong PIN". |
| Charts | The dryer keeps 1-minute averages for 24 h and sends them when the app opens, so the charts show the whole batch, not only the time the page has been open. |
| Water estimate | Counted on the dryer for the whole batch (airflow 0.047 kg/s × Δω × fan-on time), shown in both dashboards. |
| Overheat | Fan on above 65 °C until back below 62 °C, so the relay cannot chatter in manual Off. |
| Sensor fault | Old inside readings are dropped at once, so nothing stale is shown or acted on; outside readings stay live. |
| Wi-Fi | Working hotspot details survive restarts (flash flag). Reconnects back off from 15 s to 2 min, and MQTT from 5 s to 60 s, so the dryer's own Wi-Fi and local dashboard stay responsive while the internet is away. |
| Status | The state message adds `water_g`, `nonce`, `rssi`, `up`, `lh` (history minutes) and `fw`; the app shows them under About → Dryer status. |
| Local page | Rod Bondhu name, water estimate, link to the online app when it is live. |

The MQTT topics and message formats are listed at the top of the sketch. Keep `TOPIC_BASE` the same in
`../app/index.html`.

## Test without hardware

`test/run.sh` compiles the real sketch on a computer against small stand-ins for the Arduino libraries
(`test/mock/`), runs it as a simulated dryer on a local MQTT broker, and drives the real app in Chromium:
live data, history, signed commands, wrong PIN, replay, new batch, sensor faults, overheat latch, and the
dryer going offline and coming back (21 checks). Needs g++, OpenSSL headers, Node 18+ and Playwright.
