# VenGuard Connected: device API (for firmware)

For: CTO / firmware. Status: v1 draft, tested against the Firebase emulators
(`functions/test/emulator.e2e.js` plays the device's side).

## Free plan (Spark) edition — what is different

The Firebase project currently runs on the free **Spark** plan, which has no Cloud Functions.
Everything below still applies, with these differences (the security rules in
`database.rules.json` enforce them; tests in `rules-test/`):

| | Spark (now) | Blaze (later, with `functions/`) |
|---|---|---|
| Device sign-in | Email + password per device (see "Spark sign-in") | Signed request to `deviceToken` |
| Who writes `cmd` | The owner's app, directly: `{"type":"close","exp":<ms>,"by":<uid>}`; rules allow only `close`, expiring within 30 min | A Cloud Function |
| Removing a handled command | **The device** deletes `/devices/<id>/cmd/<commandId>` after writing its ack | The cloud |
| History | **The device** POSTs events: `leak_confirmed`, `valve_closed`, `fan_on`, `fan_off`, `air_clear`, `reset`, `remote_close` (plus `test`, `battery_low`, `tamper`), each `{"type":…,"at":{".sv":"timestamp"}}` | The cloud derives them from state |
| State fields | As below, plus `"fan": true/false` (ventilation relay) and `"valve":"none"` for Detector + Relay kits | Same |
| Offline SMS / push | Not available (the app shows "offline" from the heartbeat age) | Cloud |

### Spark sign-in

Provision each device with `node tools/provision-spark.mjs VG-0001A3` (prints its login and the
console steps). The device signs in with the Firebase Auth REST API:

```
POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<WEB_API_KEY>
{"email":"vg-0001a3@venguard-connected.firebaseapp.com","password":"<flashed password>","returnSecureToken":true}
→ {"idToken":"…","refreshToken":"…","expiresIn":"3600","localId":"<uid>"}
```

Refresh as in section 3. The rules recognise the device because `/deviceAuth/<id>` holds its UID.
Database URL (Singapore): `https://venguard-connected-default-rtdb.asia-southeast1.firebasedatabase.app`.

## 0. What must never change

1. **The safety loop stays local.** Sensing, the 7-second check, the RF close and the buzzer work with
   no Wi-Fi, no cloud and no mains, exactly as today. The connected part is an add-on that only
   *reports* and *accepts a close request*.
2. **Close only.** The only remote command is `close`. Firmware must ignore and log any other type.
   No code path, on the gateway or on the valve, may open the valve. Reopening stays the manual lever.
3. **Confirm, don't assume.** Acknowledge a close only after the valve reports it is closed
   (position switch or equivalent over the RF link). If the valve doesn't confirm within 5 s, ack `failed`.

## 1. Hardware needed for "remote close" (decision for the CTO)

The HCD design has a detector and valve talking over a 2.4 GHz point-to-point RF link, with no internet.
To keep the promise "close your valve remotely", **something in the home must reach the internet**.
Recommended: a small **Connected hub** (e.g. ESP32-C3 + the same RF module), plugged into any socket
with a small backup cell, that:

- joins the home Wi-Fi (set up from the app or a one-time hotspot page);
- listens to the detector/valve RF traffic (state, leak, battery) and relays it to the cloud;
- forwards a cloud `close` to the valve as the **same RF close message** a leak already uses.

Why a hub rather than Wi-Fi inside the detector: kitchens have no outlet near the cylinder (HCD
finding), and a Wi-Fi radio kept connected would drain the detector's Li-ion cell quickly. The hub
also keeps Tier 1 hardware identical for customers who never buy Connected.

Everything below applies to whichever part holds the internet connection ("the gateway").

## 2. Identity (factory)

- Device ID: `VG-` + 4–12 uppercase letters/digits, e.g. `VG-0001A3`. Printed on the QR sticker.
- `node tools/provision.js VG-0001A3` (on the in-house flashing PC, with `DEVICE_MASTER_KEY` set) prints:
  - the 32-byte **device secret** (hex) to flash into protected storage (ESP32: encrypted NVS / eFuse);
  - the 6-digit **sticker code** the customer types (or scans) when adding the device in the app.
  The cloud never stores secrets; it re-derives them from the master key.

## 3. Sign in (once per boot, then refresh)

```
POST https://asia-southeast1-<project>.cloudfunctions.net/deviceToken
Content-Type: application/json
X-VG-Signature: <hex HMAC-SHA256(deviceSecret, exact request body)>

{"id":"VG-0001A3","ts":1760360000000}        ← ts = Unix ms from NTP; must be within 5 minutes
```

Response `{"ok":true,"token":"<custom token>"}`. Exchange it with the Firebase Auth REST API:

```
POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=<WEB_API_KEY>
{"token":"<custom token>","returnSecureToken":true}
→ {"idToken":"…","refreshToken":"…","expiresIn":"3600"}
```

Refresh the ID token before it expires with `https://securetoken.googleapis.com/v1/token?key=<WEB_API_KEY>`
(`grant_type=refresh_token`). Only call `deviceToken` again if the refresh token stops working.
Use TLS and verify the server certificate (Google Trust Services roots).

## 4. Realtime Database paths (the device's whole API)

Base URL: `https://<project>-default-rtdb.asia-southeast1.firebasedatabase.app` — add `?auth=<idToken>` to each request.
The database rules only let a device touch its own paths.

| Path | Device does | When |
|---|---|---|
| `/devices/<id>/cmd` | **Listen** (REST streaming: `GET …/cmd.json` with `Accept: text/event-stream`) | Always, while online |
| `/devices/<id>/ack/<commandId>` | **PUT** `{"result":"closed"}` / `"already_closed"` / `"failed"` | After acting on a command |
| `/devices/<id>/state` | **PUT** the full state (below) | Only when it changes, and on every boot |
| `/devices/<id>/events/<push id>` | **POST** `{"type":"test"}` / `{"type":"battery_low","level":14}` / `{"type":"tamper"}` | When it happens |
| `/hb/<id>` | **PUT** `{".sv":"timestamp"}` | Every 20 s |
| `/hb/<id>` | **DELETE** | On a planned shutdown or restart (optional goodbye) |

Offline in the app: a device counts as offline when its heartbeat is more than **65 s** old (three
missed beats), so a power cut or lost Wi-Fi shows within about a minute. A device that is switched off
on purpose can DELETE its heartbeat first; the app then shows it offline at once. (Devices on the REST API
cannot use the Realtime Database's on-disconnect clean-up; the team dashboard's emulators do.) Cost on the
free plan: about 130,000 tiny heartbeat writes per device a month, well inside the Spark limits for the pilot.

State object (rules reject anything else):

```json
{ "valve": "open", "gasLEL": 3, "alarm": false, "detectorBattery": 86, "valveBattery": 78, "rfLinkOk": true, "fw": "1.0.4" }
```

- `valve`: `"open"` or `"closed"` (last confirmed position).
- `gasLEL`: integer % LEL. Report a change only when it moves ≥ 2 points, crosses the 20 % alarm limit, or every 10 min.
- `alarm`: `true` from the moment the 7-second check confirms a leak until the lever reset. A leak or
  reset is reported through `alarm`/`valve` in the state; do not also send them as events.
- Batteries: integer %. Report changes of ≥ 5 points.

## 5. Handling a close command

A command appears as `/devices/<id>/cmd/<commandId> = {"type":"close","exp":<unix ms>}`.

1. If `type` ≠ `"close"` or `exp` has passed: ignore it (log it). Never open.
2. If the valve is already closed: ack `already_closed`.
3. Otherwise send the RF close to the valve (same message as a leak close), wait for the valve's
   confirmation (max 5 s, retry RF up to 3 times), then:
   - PUT the new state (`"valve":"closed"`), and
   - PUT `/devices/<id>/ack/<commandId>` `{"result":"closed"}` — or `{"result":"failed"}`.
4. Commands can arrive twice (reconnects). Acting on a close twice is harmless; ack each id once.

The cloud removes the command after the ack. Commands that are never picked up expire after 30 minutes.

## 6. Offline behaviour

- No Wi-Fi / no cloud: keep protecting as normal, keep retrying with backoff (5 s → 5 min).
- On reconnect: sign in, PUT the current state, then open the `cmd` stream (any still-valid close is delivered then).
- The cloud marks a device offline after 3 minutes without a heartbeat and sends one SMS to the family.

## 7. Test it

`npm run test:e2e` in `functions/` starts the emulators and runs a simulated device through sign-in,
state, a close request, the ack and a leak. Point a real gateway at the emulators by using
`http://<pc-ip>:9000/devices/...?ns=demo-venguard-default-rtdb&auth=<token>` for the database and
`http://<pc-ip>:5001/demo-venguard/asia-southeast1/deviceToken` for sign-in.
