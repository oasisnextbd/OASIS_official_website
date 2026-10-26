/*
  Rod Bondhu - Smart Mixed-Mode Solar Dryer - ESP32 controller + local app + online dashboard
  -------------------------------------------------------------------------------------------
  TWO dashboards at the same time:
   A) LOCAL  : ESP32's own Wi-Fi, http://192.168.4.1  (works with no internet)
   B) ONLINE : https://oasisnextbd.github.io/OASIS_official_website/Rod_Bondhu/app/
               via the free HiveMQ MQTT broker. Needs the ESP32 on a phone hotspot
               that has internet.
  If the hotspot or internet drops, the dryer and the local dashboard keep working.

  SECRETS: copy secrets.example.h to secrets.h (same folder) and set your own
  control PIN and dryer Wi-Fi password. secrets.h is never committed to GitHub,
  and the sketch does not compile without it.

  INTERNET WI-FI SETUP PORTAL (no hotspot name/password in the code):
    - First start, or no Wi-Fi saved: join "SolarDryer-BUET" (dryer Wi-Fi password).
      A setup page pops up (or open http://192.168.4.1/wifi). Pick the hotspot,
      type its password, tap "Save and connect". The details are saved in flash.
    - New details are tried 3 times. If they never join, or join but never reach
      the internet, they are ERASED and the setup portal opens again.
    - Once saved details have reached the internet, they are marked as working
      (also in flash). After that they are never erased: if the hotspot is off,
      even across restarts or battery swaps, the dryer keeps retrying (every
      15 s, slowing to every 2 min) until the hotspot is back.
    - The dryer keeps drying and the local dashboard keeps working throughout.

  ONLINE DASHBOARD PROTOCOL (topics under TOPIC_BASE; keep in sync with app/index.html)
    state    out, retained  JSON readings every 5 s (includes a one-time "nonce")
    status   out, retained  "online" / "offline" (last will)
    cmd      in             "<cmd>:<nonce>:<hmac>", cmd = auto|on|off|reset,
                            hmac = hex HMAC-SHA256(key = control PIN, msg = "<cmd>:<nonce>").
                            The PIN never travels over the internet and each nonce
                            works once, so a recorded command cannot be replayed.
                            5 wrong PINs in a minute lock control for a minute.
    ack      out            {"cmd","ok","why":"pin|stale|locked","nonce"}
    histreq  in             any payload: asks for the batch history
    hist     out            {"i","of","p":[[t,Tin,Tout,RHin,RHout,dw,fan],...]},
                            1-minute averages, up to 24 h, sent in chunks

  Extra library: "PubSubClient" (Nick O'Leary)

  LOCAL dashboard:

    1. Phone: turn OFF mobile data
    2. Join Wi-Fi  "SolarDryer-BUET"   (password: SECRET_AP_PASS in secrets.h)
    3. If Android says "no internet", choose "Stay connected"
    4. Open Chrome and go to  http://192.168.4.1
    5. (Optional) Chrome menu > "Add to Home screen" for an app icon

  App features: live inside/outside readings, live moisture-difference
  meter, live charts, fan Auto / On / Off buttons, batch timer, fan run
  time and energy, CSV data download.

  Board    : "ESP32 Dev Module" (Espressif ESP32 board package)
  Libraries: "DHT sensor library" + "Adafruit Unified Sensor" (Adafruit)
             (LiquidCrystal I2C only if USE_LCD is set to 1)

  CONTROL ALGORITHM (every 2.5 s)
    w = 0.622 pv / (P - pv),  pv = RH/100 * psat(T)  (Buck equation for psat)
    dw = w_inside - w_outside
    Auto mode:  dw > 1.5 g/kg -> fan ON,  dw < 0.5 g/kg -> fan OFF,
                in between -> no change (deadband), min 1 min per state.
    Overrides:  chamber > 65 C -> fan ON (also in manual Off) until it is
                back below 62 C, so the relay cannot chatter around 65 C
                sensor fault   -> fan ON (Auto mode)
                manual On / Off buttons from the app.
    Water pushed out (estimate) = airflow 0.047 kg/s (CFD, full fan) x dw x fan-on time.
*/

#include <Wire.h>
#include <DHT.h>
#include <WiFi.h>
#include <WebServer.h>
#include <PubSubClient.h>
#include <time.h>
#include <DNSServer.h>
#include <Preferences.h>
#include "mbedtls/md.h"

#if __has_include("secrets.h")
#include "secrets.h"
#endif
#if !defined(SECRET_AP_PASS) || !defined(SECRET_CONTROL_PIN)
#error "Create secrets.h: copy secrets.example.h to secrets.h (same folder) and set your control PIN and dryer Wi-Fi password."
#endif

const char* FW_VERSION = "1.1.0";

// ---------------- Pins (ESP32 GPIO numbers) ----------------
const uint8_t PIN_DHT_IN  = 32;  // sensor inside the drying chamber
const uint8_t PIN_DHT_OUT = 33;  // sensor in shaded ambient air
const uint8_t PIN_RELAY   = 26;  // relay module IN
const uint8_t PIN_SDA     = 21;  // LCD backpack SDA
const uint8_t PIN_SCL     = 22;  // LCD backpack SCL
const bool RELAY_ACTIVE_LOW = true;   // if fan state is reversed, set false

// LCD: 0 = not used (no LCD library needed). Set 1 and install "LiquidCrystal I2C" to use it.
#define USE_LCD 0
#if USE_LCD
#include <LiquidCrystal_I2C.h>
#endif

// ---------------- Wi-Fi ----------------
const char* AP_SSID = "SolarDryer-BUET";   // the dryer's own network (local dashboard)
const char* AP_PASS = SECRET_AP_PASS;      // at least 8 characters (secrets.h)

// Internet Wi-Fi (phone hotspot) is entered in the setup portal, not here.
const unsigned long CONNECT_TIMEOUT_MS  = 20000UL;  // time to join the hotspot, per try
const uint8_t       MAX_CONNECT_TRIES   = 3;        // tries before erasing saved Wi-Fi
const unsigned long INTERNET_TIMEOUT_MS = 45000UL;  // joined but no internet for this long = fail

// ---------------- Online dashboard (MQTT) ----------------
// TOPIC_BASE must be EXACTLY the same in index.html on GitHub.
const char* MQTT_HOST   = "broker.hivemq.com";
const uint16_t MQTT_PORT = 1883;
const char* TOPIC_BASE  = "oasisnextbd/solar-dryer/x7k2";
const char* CONTROL_PIN = SECRET_CONTROL_PIN;  // fan control from the online page (secrets.h)
const unsigned long PUBLISH_MS = 5000UL;   // send readings every 5 s
const char* ONLINE_URL  = "https://oasisnextbd.github.io/OASIS_official_website/Rod_Bondhu/app/";

// ---------------- Settings ----------------
const float P_ATM_KPA   = 101.325; // Dhaka is near sea level
const float DW_ON_GKG   = 1.5;     // fan ON above this dw (g/kg)
const float DW_OFF_GKG  = 0.5;     // fan OFF below this dw (g/kg)
const float T_MAX_IN_C  = 65.0;    // overheat override (deg C)
const float T_HOT_OFF_C = 62.0;    // overheat override ends below this (deg C)
const float FAN_WATTS   = 12.0 * 0.70;   // fan label: 12 V, 0.70 A
const float AIRFLOW_KGS = 0.047;   // air through the chamber at full fan (CFD), kg/s

const unsigned long SAMPLE_MS  = 2500UL;
const unsigned long MIN_ON_MS  = 60000UL;
const unsigned long MIN_OFF_MS = 60000UL;
const uint8_t AVG_N     = 6;
const uint8_t MAX_FAILS = 3;

const uint16_t HIST_N     = 720;   // stored points (720 x 5 s = 1 hour)
const uint8_t  HIST_EVERY = 2;     // store every 2nd sample = every 5 s
const uint16_t LONG_N     = 1440;  // 1-minute averages (1440 = 24 hours) for the online charts
const uint16_t HIST_CHUNK = 120;   // points per MQTT history message

// ---------------- Outside sensor fallback ----------------
// If the OUTSIDE sensor is missing or fails, these values are used instead,
// so the dryer still works with only the inside sensor. Set them to today's
// weather (e.g. from a weather app) before the demo.
const float AMBIENT_T_C = 31.0;
const float AMBIENT_RH  = 70.0;

// ---------------- Calibration ----------------
const float T_OFFSET_IN  = 0.0;
const float RH_OFFSET_IN = 0.0;

// ---------------- Objects ----------------
DHT dhtIn(PIN_DHT_IN, DHT22);
DHT dhtOut(PIN_DHT_OUT, DHT22);
#if USE_LCD
LiquidCrystal_I2C lcd(0x27, 16, 2);
#endif
WebServer server(80);
WiFiClient net;
PubSubClient mqtt(net);
unsigned long lastPublish = 0, lastMqttTry = 0, mqttRetryMs = 5000UL;
bool publishNow = false;
String topicState, topicStatus, topicCmd, topicAck, topicHist, topicHistReq;

// Online control: one-time nonce + wrong-PIN lockout
uint32_t cmdNonce = 0;
uint8_t badPins = 0;
unsigned long badSince = 0, lockUntil = 0;
// History requests from the online page
bool histWanted = false;
unsigned long lastHistSent = 0;

// Internet Wi-Fi state
enum NetState : uint8_t { NET_PORTAL, NET_CONNECTING, NET_CHECKING, NET_ONLINE, NET_LOST };
NetState netState = NET_PORTAL;
DNSServer dns;
Preferences prefs;
bool dnsOn = false;
bool credsWorked = false;           // saved Wi-Fi has reached the internet (kept in flash as "ok")
uint8_t netAttempt = 0;
unsigned long netSince = 0, lastNetCheck = 0, lostRetryMs = 15000UL;
String staSsid, staPass, netMsg = "Starting";
const char* netStateName();

struct MovingAvg {
  float buf[AVG_N];
  uint8_t idx = 0, count = 0;
  void add(float v) { buf[idx] = v; idx = (idx + 1) % AVG_N; if (count < AVG_N) count++; }
  float mean() const { float s = 0; for (uint8_t i = 0; i < count; i++) s += buf[i]; return s / count; }
  void clear() { idx = 0; count = 0; }
};
MovingAvg avgTin, avgRHin, avgTout, avgRHout;

enum CtrlMode : uint8_t { CTRL_AUTO = 0, CTRL_ON = 1, CTRL_OFF = 2 };
CtrlMode ctrlMode = CTRL_AUTO;

bool fanOn = false;
unsigned long lastSwitch = 0, lastSample = 0;
unsigned long sessionStart = 0, fanMsTotal = 0, fanOnSince = 0;
uint32_t sampleNo = 0;
uint8_t failIn = 0, failOut = 0, page = 0, histSkip = 0;

float gTin = NAN, gRHin = NAN, gTout = NAN, gRHout = NAN;
float gWin = NAN, gWout = NAN, gDw = NAN;
bool gFault = false, gHave = false, gOutEst = false, lastOutEst = false, lastFault = false;
const char* gMode = "START";

struct Rec { uint32_t t; float tin, rhin, tout, rhout, dw; uint8_t fan; };
Rec hist[HIST_N];
uint16_t histHead = 0, histCount = 0;

// 1-minute averages for the online charts. Scaled integers: T and RH x10, dw x100, fan = % of the minute on.
struct LRec { uint32_t t; int16_t tin, tout, dw; uint16_t rhin, rhout; uint8_t fan; };
LRec lhist[LONG_N];
uint16_t lHead = 0, lCount = 0;
float accTin = 0, accTout = 0, accRHin = 0, accRHout = 0, accDw = 0;
uint16_t accN = 0, accFan = 0;
uint32_t accMinute = 0;

float waterG = 0;                  // water pushed out this batch, grams (estimate)

byte DELTA[8] = {0b00000, 0b00100, 0b00100, 0b01010, 0b01010, 0b10001, 0b11111, 0b00000};

// =====================================================================
//  The phone app (HTML + CSS + JS). Works fully offline.
// =====================================================================
const char PAGE[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#24453a">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>Rod Bondhu</title>
<style>
:root{--bg:#edf1ec;--card:#fff;--ink:#1d2a24;--muted:#5b6a62;--line:#d3dcd5;--track:#e2e8e3;
--sun:#c97a06;--air:#3a6f9e;--leaf:#2c8553;--alert:#bf3e28;--shade:rgba(44,133,83,.13);color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#121815;--card:#1b231f;--ink:#e5ece8;--muted:#98a79f;--line:#2d3833;--track:#26302b;
--sun:#f0a53a;--air:#80b2df;--leaf:#5cc48a;--alert:#ee7a62;--shade:rgba(92,196,138,.15);color-scheme:dark}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink)}
body{font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)}
main{max-width:720px;margin:0 auto;padding:16px 14px 28px}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin:4px 2px 14px}
h1{font-size:1.35rem;line-height:1.2;margin:0;letter-spacing:-.01em}
.sub{margin:3px 0 0;color:var(--muted);font-size:.85rem}
.live{display:flex;align-items:center;gap:7px;font-size:.85rem;color:var(--muted);white-space:nowrap;padding-top:4px}
.dot{width:9px;height:9px;border-radius:50%;background:var(--muted)}
.live.ok .dot{background:var(--leaf)}.live.bad .dot{background:var(--alert)}
section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:12px}
h2{font-size:1rem;margin:0 0 10px}
.hero{padding:18px 16px 16px}
.hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.lbl{color:var(--muted);font-size:.88rem}
.big{font-size:3rem;font-weight:700;line-height:1.05;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-top:2px}
.big small{font-size:1rem;font-weight:500;color:var(--muted);letter-spacing:0}
.fan{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:var(--track);font-weight:600;font-size:.95rem;white-space:nowrap}
.fan svg{width:22px;height:22px;fill:currentColor;transform-origin:50% 50%}
.fan.on{background:var(--leaf);color:var(--card)}
.fan.on svg{animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.fan.on svg{animation:none}}
.meter{margin:20px 0 6px;position:relative}
.track{display:flex;height:14px;border-radius:7px;overflow:hidden}
.z{height:100%}.z.off{background:var(--track)}.z.band{background:repeating-linear-gradient(135deg,var(--track) 0 5px,var(--line) 5px 10px)}.z.on{background:var(--shade);border-left:2px solid var(--leaf)}
.mark{position:absolute;top:-6px;width:4px;height:26px;margin-left:-2px;border-radius:2px;background:var(--ink);transition:left .6s ease;left:0}
.ticks{position:relative;height:18px;font-size:.75rem;color:var(--muted);font-variant-numeric:tabular-nums}
.ticks span{position:absolute;transform:translateX(-50%);top:3px}
.zones{display:flex;font-size:.78rem;color:var(--muted);margin-top:2px}
.zones div{padding-right:6px}
.say{margin:12px 0 0;font-size:.95rem}
.mode{color:var(--muted);font-size:.85rem;margin-top:4px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.side{border-left:4px solid var(--sun);padding-left:12px}
.side.out{border-color:var(--air)}
.side h2{margin-bottom:4px}
.temp{font-size:2rem;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.15}
.temp small{font-size:.95rem;font-weight:500;color:var(--muted)}
dl{margin:8px 0 0}dl div{display:flex;justify-content:space-between;gap:6px;font-size:.9rem;padding:3px 0;border-top:1px solid var(--line)}
dt{color:var(--muted)}dd{margin:0;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
.seg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:var(--track);padding:5px;border-radius:12px}
.seg button{font:inherit;font-weight:600;border:0;border-radius:9px;padding:11px 6px;background:transparent;color:var(--ink);cursor:pointer}
.seg button[aria-pressed="true"]{background:var(--card);box-shadow:0 1px 3px rgba(0,0,0,.18)}
.hint{color:var(--muted);font-size:.85rem;margin:10px 0 0}
.leg{display:flex;gap:14px;font-size:.82rem;color:var(--muted);margin:-4px 0 6px;flex-wrap:wrap}
.leg i{display:inline-block;width:14px;height:3px;border-radius:2px;vertical-align:middle;margin-right:5px}
.leg i.box{height:10px;background:var(--shade);border:1px solid var(--leaf)}
canvas{display:block;width:100%;height:190px}
.gap{height:14px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
@media (max-width:520px){.stats{grid-template-columns:repeat(2,1fr)}}
.stats div{display:flex;flex-direction:column}
.stats b{font-size:1.25rem;font-variant-numeric:tabular-nums}
.stats small{color:var(--muted);font-size:.8rem}
.btns{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
.btn{font:inherit;font-weight:600;font-size:.92rem;text-decoration:none;text-align:center;flex:1;min-width:140px;padding:11px 12px;border-radius:10px;background:var(--ink);color:var(--card);border:1px solid var(--ink);cursor:pointer}
.btn.ghost{background:transparent;color:var(--ink)}
details summary{cursor:pointer;font-weight:600}
details p{margin:10px 0 0;font-size:.92rem}
code{font-size:.88rem}
button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid var(--air);outline-offset:2px}
footer{color:var(--muted);font-size:.8rem;text-align:center;margin-top:16px}
@media (max-width:420px){.big{font-size:2.5rem}.temp{font-size:1.7rem}.stats b{font-size:1.1rem}}
</style></head><body><main>

<header>
  <div><h1>Rod Bondhu</h1><p class="sub">Smart solar dryer &middot; local dashboard</p></div>
  <div class="live" id="live"><span class="dot"></span><span id="liveTxt">Connecting</span></div>
</header>

<section class="hero" aria-live="polite">
  <div class="hero-top">
    <div><div class="lbl">Extra water in the chamber air</div>
      <div class="big"><span id="dw">--</span><small> g/kg</small></div></div>
    <div class="fan" id="fanBox"><svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 10.2C11.6 6 12.6 2.6 15.2 2.9c2.4.3 2 4.4-3.2 7.3z"/>
      <path d="M12 10.2C11.6 6 12.6 2.6 15.2 2.9c2.4.3 2 4.4-3.2 7.3z" transform="rotate(120 12 12)"/>
      <path d="M12 10.2C11.6 6 12.6 2.6 15.2 2.9c2.4.3 2 4.4-3.2 7.3z" transform="rotate(240 12 12)"/>
      <circle cx="12" cy="12" r="2.2"/></svg><span id="fanTxt">Fan</span></div>
  </div>
  <div class="meter">
    <div class="track"><div class="z off" id="zOff"></div><div class="z band" id="zBand"></div><div class="z on" id="zOn"></div></div>
    <div class="mark" id="mark"></div>
  </div>
  <div class="ticks"><span id="tOff">0.5</span><span id="tOn">1.5</span></div>
  <div class="zones"><div id="lOff">Fan rests</div><div id="lBand">Hold</div><div id="lOn">Fan runs</div></div>
  <p class="say" id="say">Waiting for the first reading.</p>
  <div class="mode" id="mode"></div>
</section>

<section>
  <div class="pair">
    <div class="side in"><h2>Chamber</h2>
      <div class="temp"><span id="tin">--</span><small> &deg;C</small></div>
      <dl><div><dt>Humidity</dt><dd id="rhin">--</dd></div><div><dt>Water</dt><dd id="win">--</dd></div></dl></div>
    <div class="side out"><h2 id="outH">Outside air</h2>
      <div class="temp"><span id="tout">--</span><small> &deg;C</small></div>
      <dl><div><dt>Humidity</dt><dd id="rhout">--</dd></div><div><dt>Water</dt><dd id="wout">--</dd></div></dl></div>
  </div>
</section>

<section>
  <h2>Fan control</h2>
  <div class="seg" role="group" aria-label="Fan control">
    <button data-m="auto" aria-pressed="true">Auto</button>
    <button data-m="on" aria-pressed="false">On</button>
    <button data-m="off" aria-pressed="false">Off</button>
  </div>
  <p class="hint">Auto decides from the humidity readings. On and Off override it. Overheat protection stays active in every mode.</p>
</section>

<section>
  <h2>Temperature</h2>
  <div class="leg"><span><i style="background:var(--sun)"></i>Inside</span><span><i style="background:var(--air)"></i>Outside</span></div>
  <canvas id="cT" aria-label="Temperature chart"></canvas>
  <div class="gap"></div>
  <h2>Extra water in the chamber air</h2>
  <div class="leg"><span><i style="background:var(--ink)"></i>Difference, g/kg</span><span><i class="box"></i>Fan running</span></div>
  <canvas id="cW" aria-label="Moisture difference chart"></canvas>
</section>

<section>
  <h2>This batch</h2>
  <div class="stats">
    <div><b id="sess">--</b><small>Drying time</small></div>
    <div><b id="fans">--</b><small>Fan run time</small></div>
    <div><b id="wh">--</b><small>Fan energy</small></div>
    <div><b id="wat">--</b><small>Water out (est.)</small></div>
  </div>
  <div class="btns">
    <a class="btn" href="/csv" download="solar_dryer_batch.csv">Download data (CSV)</a>
    <button class="btn ghost" id="reset">Start new batch</button>
  </div>
</section>

<section>
  <details><summary>How the dryer decides</summary>
  <p>Two DHT22 sensors measure temperature and relative humidity, one inside the chamber and one in the outside air. Relative humidity alone is misleading because warm air holds more water, so each reading is converted to absolute humidity, the grams of water per kilogram of dry air:</p>
  <p><code>&omega; = 0.622 p<sub>v</sub> / (P &minus; p<sub>v</sub>)</code>, with <code>p<sub>v</sub> = RH/100 &times; p<sub>sat</sub>(T)</code></p>
  <p>When the chamber air carries 1.5 g/kg more water than the outside air, the exhaust fan switches on to push it out. Below 0.5 g/kg it switches off so the chamber keeps its heat. In between nothing changes, which stops the relay from clicking on and off. The fan also runs if the chamber passes 65 &deg;C or a sensor stops responding.</p>
  <p>Everything runs on a 15 W solar panel and a battery. Because the fan only runs when there is moisture to remove, the small panel is enough.</p>
  </details>
</section>

<p class="hint" style="text-align:center"><span id="netLine"></span> <a id="onlineLink" href="https://oasisnextbd.github.io/OASIS_official_website/Rod_Bondhu/app/" style="color:var(--air)" hidden>Open it</a> &middot; <a href="/wifi" style="color:var(--air)">Wi-Fi setup</a></p>
<footer>Departments of Chemical and Mechanical Engineering, BUET<br>Renewable Energy Fest 2026</footer>
</main>
<script>
const $=id=>document.getElementById(id);
let ON=1.5,OFF=0.5,lastN=-1,lastSess=-1;
const H={t:[],tin:[],tout:[],dw:[],fan:[]};const MAXP=1500;
function clearH(){for(const k in H)H[k].length=0}
function push(t,tin,tout,dw,fan){const n=H.t.length;if(n&&t<=H.t[n-1])return;
 H.t.push(t);H.tin.push(tin);H.tout.push(tout);H.dw.push(dw);H.fan.push(fan);
 if(H.t.length>MAXP)for(const k in H)H[k].shift()}
const f=(v,d)=>v==null?'--':Number(v).toFixed(d);
function dur(s){s=Math.max(0,Math.floor(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60);
 return h?h+' h '+m+' m':m+' m '+(s%60)+' s'}
function setLive(ok){const l=$('live');l.className='live '+(ok?'ok':'bad');
 $('liveTxt').textContent=ok?'Live':'Not connected'}
const MODES={AUTO:'Automatic control',MANUAL:'Manual control',HOT:'Overheat protection',FAULT:'Sensor check needed',START:'Starting'};

function update(d){
 ON=d.on;OFF=d.off;
 if(lastSess>=0&&d.sess<lastSess)clearH();
 lastSess=d.sess;
 $('dw').textContent=f(d.dw,2);
 $('tin').textContent=f(d.tin,1);$('tout').textContent=f(d.tout,1);
 $('rhin').textContent=d.rhin==null?'--':f(d.rhin,0)+' %';
 $('rhout').textContent=d.rhout==null?'--':f(d.rhout,0)+' %';
 $('win').textContent=d.win==null?'--':f(d.win,1)+' g/kg';
 $('wout').textContent=d.wout==null?'--':f(d.wout,1)+' g/kg';
 $('outH').textContent=d.oest?'Outside air (set value)':'Outside air';
 if($('netLine')&&d.net){const N={online:'Online dashboard is live.',connecting:'Online dashboard: joining the hotspot.',checking:'Online dashboard: checking internet.',lost:'Online dashboard: reconnecting.',portal:'Online dashboard is off until Wi-Fi is set up.'};$('netLine').textContent=N[d.net]||'';$('onlineLink').hidden=d.net!=='online'}
 $('fanBox').classList.toggle('on',!!d.fan);
 $('fanTxt').textContent=d.fan?'Fan on':'Fan off';
 $('mode').textContent=MODES[d.mode]||d.mode;
 let s;
 if(d.fault)s='The chamber sensor is not responding, so the fan stays on to keep moist air moving out. Check the sensor wires.';
 else if(d.mode==='HOT')s='The chamber went above '+d.tmax+' \u00b0C. The fan is cooling it and protecting the fruit until it is back below 62 \u00b0C.';
 else if(d.ctrl===1)s='The fan is held on from this app.';
 else if(d.ctrl===2)s='The fan is held off from this app.';
 else if(d.dw==null)s='Waiting for the first reading.';
 else if(d.dw>ON)s=d.fan?'The chamber air is carrying extra water from the fruit. The fan is pushing it out.':'Moist air is building up. The fan will switch on within a minute.';
 else if(d.dw<OFF)s=d.fan?'The moist air is cleared. The fan will rest within a minute to keep the heat in.':'There is little moisture to remove right now. The fan rests so the chamber keeps its heat.';
 else s='The reading is between the two limits, so the fan keeps its current state.';
 $('say').textContent=s;
 // meter
 const MIN=-1,MAX=Math.max(4,ON+2),R=MAX-MIN,p=v=>Math.min(100,Math.max(0,(v-MIN)/R*100));
 $('zOff').style.width=p(OFF)+'%';$('zBand').style.width=(p(ON)-p(OFF))+'%';$('zOn').style.width=(100-p(ON))+'%';
 $('lOff').style.width=p(OFF)+'%';$('lBand').style.width=(p(ON)-p(OFF))+'%';$('lOn').style.width=(100-p(ON))+'%';
 $('tOff').style.left=p(OFF)+'%';$('tOn').style.left=p(ON)+'%';
 $('tOff').textContent=f(OFF,1);$('tOn').textContent=f(ON,1);
 if(d.dw!=null)$('mark').style.left=p(d.dw)+'%';
 // control buttons
 const m=['auto','on','off'][d.ctrl];
 document.querySelectorAll('[data-m]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===m?'true':'false'));
 // batch
 $('sess').textContent=dur(d.sess);$('fans').textContent=dur(d.fan_s);$('wh').textContent=f(d.wh,1)+' Wh';
 $('wat').textContent=d.water_g==null?'--':d.water_g>=1000?f(d.water_g/1000,2)+' kg':f(d.water_g,0)+' g';
 if(d.n!==lastN){lastN=d.n;if(d.dw!=null)push(d.sess,d.tin,d.tout,d.dw,d.fan)}
 draw();
}

function niceStep(r){const p=Math.pow(10,Math.floor(Math.log10(r))),n=r/p;return(n<1.5?1:n<3?2:n<7?5:10)*p}
function chart(cv,series,o){
 const dpr=window.devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;
 if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr)}
 const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
 const cs=getComputedStyle(document.documentElement),col=n=>cs.getPropertyValue(n).trim();
 const L=40,Rm=10,T=8,B=22,pw=w-L-Rm,ph=h-T-B,xs=H.t;
 c.font='12px system-ui,sans-serif';c.fillStyle=col('--muted');
 if(xs.length<2){c.textAlign='left';c.textBaseline='middle';c.fillText('Collecting data, the chart starts in a few seconds.',L,T+ph/2);return}
 const x0=xs[0],xr=Math.max(1,xs[xs.length-1]-x0);
 let lo=Infinity,hi=-Infinity;
 for(const s of series)for(const v of s.v)if(v!=null){if(v<lo)lo=v;if(v>hi)hi=v}
 (o.include||[]).forEach(v=>{if(v<lo)lo=v;if(v>hi)hi=v});
 if(!isFinite(lo))return;
 const pad=(hi-lo)*0.12||1;lo-=pad;hi+=pad;
 const X=t=>L+(t-x0)/xr*pw,Y=v=>T+(hi-v)/(hi-lo)*ph;
 if(o.shade){c.fillStyle=col('--shade');for(let i=0;i<xs.length-1;i++)if(H.fan[i])c.fillRect(X(xs[i]),T,X(xs[i+1])-X(xs[i])+0.6,ph)}
 const st=niceStep((hi-lo)/4);c.strokeStyle=col('--line');c.lineWidth=1;c.fillStyle=col('--muted');c.textAlign='right';c.textBaseline='middle';
 for(let v=Math.ceil(lo/st)*st;v<=hi+1e-9;v+=st){const y=Y(v);c.beginPath();c.moveTo(L,y);c.lineTo(w-Rm,y);c.stroke();c.fillText(st<1?v.toFixed(1):v.toFixed(0),L-6,y)}
 c.textAlign='center';c.textBaseline='top';
 for(let k=0;k<=4;k++){const t=x0+xr*k/4,lab=xr<300?Math.round(t)+' s':Math.round(t/60)+' min';c.textAlign=k===0?'left':k===4?'right':'center';c.fillText(lab,X(t),T+ph+6)}
 (o.lines||[]).forEach(l=>{c.save();c.setLineDash([5,4]);c.strokeStyle=col(l.c);c.lineWidth=1.5;c.beginPath();c.moveTo(L,Y(l.v));c.lineTo(w-Rm,Y(l.v));c.stroke();c.restore()});
 for(const s of series){c.strokeStyle=col(s.c);c.lineWidth=2;c.lineJoin='round';c.beginPath();let pen=false;
  for(let i=0;i<xs.length;i++){const v=s.v[i];if(v==null){pen=false;continue}const x=X(xs[i]),y=Y(v);if(pen)c.lineTo(x,y);else c.moveTo(x,y);pen=true}c.stroke()}
}
function draw(){
 chart($('cT'),[{v:H.tin,c:'--sun'},{v:H.tout,c:'--air'}],{});
 chart($('cW'),[{v:H.dw,c:'--ink'}],{shade:true,include:[ON,OFF],lines:[{v:ON,c:'--leaf'},{v:OFF,c:'--muted'}]});
}
async function getJSON(u){const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(r.status);return r.json()}
async function poll(){try{update(await getJSON('/data'));setLive(true)}catch(e){setLive(false)}setTimeout(poll,2500)}
async function start(){
 try{const a=await getJSON('/history');clearH();a.forEach(p=>push(p[0],p[1],p[2],p[3],p[4]))}catch(e){}
 poll();
}
document.querySelectorAll('[data-m]').forEach(b=>b.addEventListener('click',async()=>{
 try{update(await getJSON('/fan?m='+b.dataset.m));setLive(true)}catch(e){setLive(false)}}));
$('reset').addEventListener('click',async()=>{
 if(!confirm('Start a new batch? This clears the charts, timer and fan run time.'))return;
 try{const d=await getJSON('/reset');clearH();lastN=-1;update(d)}catch(e){setLive(false)}});
window.addEventListener('resize',draw);
start();
</script></body></html>)rawliteral";

// =====================================================================
//  Psychrometrics
// =====================================================================
float psatKPa(float T) { return 0.61121 * exp((18.678 - T / 234.5) * (T / (257.14 + T))); }
float omegaGkg(float T, float RH) {
  float pv = (RH / 100.0) * psatKPa(T);
  return 1000.0 * 0.622 * pv / (P_ATM_KPA - pv);
}

// =====================================================================
//  Fan / relay
// =====================================================================
unsigned long fanRunMs(unsigned long now) { return fanMsTotal + (fanOn ? now - fanOnSince : 0); }

void setFan(bool on, unsigned long now) {
  if (fanOn && !on) fanMsTotal += now - fanOnSince;
  if (!fanOn && on) fanOnSince = now;
  fanOn = on;
  lastSwitch = now;
  if (RELAY_ACTIVE_LOW) {
    if (on) { pinMode(PIN_RELAY, OUTPUT); digitalWrite(PIN_RELAY, LOW); }
    else    { pinMode(PIN_RELAY, INPUT); }   // release: module pulls itself OFF
  } else {
    pinMode(PIN_RELAY, OUTPUT);
    digitalWrite(PIN_RELAY, on ? HIGH : LOW);
  }
}

void decideFan(unsigned long now) {
  static bool hot = false;              // latched: on above 65 C, off below 62 C
  if (!gHave)                  hot = false;
  else if (gTin > T_MAX_IN_C)  hot = true;
  else if (gTin < T_HOT_OFF_C) hot = false;
  bool overheat = hot;
  bool want = fanOn, urgent = false;

  if (ctrlMode == CTRL_ON)        { want = true;  gMode = "MANUAL"; urgent = true; }
  else if (overheat)              { want = true;  gMode = "HOT";    urgent = true; }
  else if (ctrlMode == CTRL_OFF)  { want = false; gMode = "MANUAL"; urgent = true; }
  else if (gFault)                { want = true;  gMode = "FAULT";  urgent = true; }
  else {
    gMode = "AUTO";
    if (gDw > DW_ON_GKG)       want = true;
    else if (gDw < DW_OFF_GKG) want = false;
    // in between: deadband, keep current state
  }

  if (want != fanOn) {
    unsigned long held = now - lastSwitch;
    bool minDone = fanOn ? (held >= MIN_ON_MS) : (held >= MIN_OFF_MS);
    if (urgent || minDone) setFan(want, now);
  }
}

// =====================================================================
//  History buffer (for charts and CSV)
// =====================================================================
void addHistory(unsigned long now) {
  Rec& r = hist[histHead];
  r.t = (now - sessionStart) / 1000;
  r.tin = gTin; r.rhin = gRHin; r.tout = gTout; r.rhout = gRHout; r.dw = gDw;
  r.fan = fanOn ? 1 : 0;
  histHead = (histHead + 1) % HIST_N;
  if (histCount < HIST_N) histCount++;
}

const Rec& histAt(uint16_t i) { return hist[(histHead + HIST_N - histCount + i) % HIST_N]; }

void clearLongAcc() { accTin = accTout = accRHin = accRHout = accDw = 0; accN = accFan = 0; }

void flushLong() {
  if (!accN) return;
  LRec& r = lhist[lHead];
  r.t     = accMinute * 60 + 30;                     // middle of the minute, batch seconds
  r.tin   = (int16_t)lroundf(accTin / accN * 10);
  r.tout  = (int16_t)lroundf(accTout / accN * 10);
  r.rhin  = (uint16_t)lroundf(accRHin / accN * 10);
  r.rhout = (uint16_t)lroundf(accRHout / accN * 10);
  r.dw    = (int16_t)lroundf(accDw / accN * 100);
  r.fan   = (uint8_t)((accFan * 100UL + accN / 2) / accN);
  lHead = (lHead + 1) % LONG_N;
  if (lCount < LONG_N) lCount++;
  clearLongAcc();
}

void addLong(unsigned long now) {
  uint32_t minute = (now - sessionStart) / 60000UL;
  if (accN && minute != accMinute) flushLong();
  accMinute = minute;
  accTin += gTin; accTout += gTout; accRHin += gRHin; accRHout += gRHout; accDw += gDw;
  accN++;
  if (fanOn) accFan++;
}

const LRec& longAt(uint16_t i) { return lhist[(lHead + LONG_N - lCount + i) % LONG_N]; }

void resetBatch() {
  unsigned long now = millis();
  sessionStart = now;
  fanMsTotal = 0;
  fanOnSince = now;
  histHead = 0; histCount = 0; histSkip = 0;
  lHead = 0; lCount = 0; clearLongAcc();
  waterG = 0;
}

// =====================================================================
//  Web handlers
// =====================================================================
String jf(float v, int d) { return isnan(v) ? String("null") : String(v, d); }

String hex8(uint32_t v) { char b[9]; snprintf(b, sizeof(b), "%08lx", (unsigned long)v); return String(b); }

void handleRoot() { server.send(200, "text/html", PAGE); }

String stateJson() {
  unsigned long now = millis();
  unsigned long run = fanRunMs(now);
  time_t ts = time(nullptr);
  String j; j.reserve(640);
  j += "{\"n\":";     j += sampleNo;
  j += ",\"tin\":";   j += jf(gTin, 2);
  j += ",\"rhin\":";  j += jf(gRHin, 1);
  j += ",\"tout\":";  j += jf(gTout, 2);
  j += ",\"rhout\":"; j += jf(gRHout, 1);
  j += ",\"win\":";   j += jf(gWin, 2);
  j += ",\"wout\":";  j += jf(gWout, 2);
  j += ",\"dw\":";    j += jf(gDw, 2);
  j += ",\"fan\":";   j += (fanOn ? 1 : 0);
  j += ",\"mode\":\""; j += gMode; j += "\"";
  j += ",\"ctrl\":";  j += (int)ctrlMode;
  j += ",\"fault\":"; j += (gFault ? "true" : "false");
  j += ",\"oest\":";  j += (gOutEst ? 1 : 0);
  j += ",\"on\":";    j += String(DW_ON_GKG, 2);
  j += ",\"off\":";   j += String(DW_OFF_GKG, 2);
  j += ",\"tmax\":";  j += String(T_MAX_IN_C, 0);
  j += ",\"sess\":";  j += (now - sessionStart) / 1000;
  j += ",\"fan_s\":"; j += run / 1000;
  j += ",\"wh\":";    j += String(run / 3600000.0 * FAN_WATTS, 2);
  j += ",\"ts\":";    j += (unsigned long)(ts > 1700000000 ? ts : 0);
  j += ",\"net\":\""; j += netStateName(); j += "\"";
  j += ",\"water_g\":"; j += String(waterG, 1);
  j += ",\"nonce\":\""; j += hex8(cmdNonce); j += "\"";
  j += ",\"rssi\":";  j += (netState == NET_ONLINE ? String(WiFi.RSSI()) : String("null"));
  j += ",\"up\":";    j += now / 1000;
  j += ",\"lh\":";    j += lCount;
  j += ",\"fw\":\"";  j += FW_VERSION; j += "\"";
  j += "}";
  return j;
}

void handleData() {
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", stateJson());
}

void handleHistory() {
  String j; j.reserve(histCount * 34 + 8);
  j += "[";
  for (uint16_t i = 0; i < histCount; i++) {
    const Rec& r = histAt(i);
    if (i) j += ",";
    j += "["; j += r.t;
    j += ","; j += jf(r.tin, 1);
    j += ","; j += jf(r.tout, 1);
    j += ","; j += jf(r.dw, 2);
    j += ","; j += r.fan;
    j += "]";
  }
  j += "]";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", j);
}

void handleCsv() {
  String c; c.reserve(histCount * 44 + 80);
  c += "time_s,T_in_C,RH_in_pct,T_out_C,RH_out_pct,dw_g_per_kg,fan_on\n";
  for (uint16_t i = 0; i < histCount; i++) {
    const Rec& r = histAt(i);
    c += r.t;               c += ",";
    c += String(r.tin, 2);  c += ",";
    c += String(r.rhin, 1); c += ",";
    c += String(r.tout, 2); c += ",";
    c += String(r.rhout, 1);c += ",";
    c += String(r.dw, 2);   c += ",";
    c += r.fan;             c += "\n";
  }
  server.sendHeader("Content-Disposition", "attachment; filename=solar_dryer_batch.csv");
  server.send(200, "text/csv", c);
}

void handleFan() {
  String m = server.arg("m");
  if (m == "on")       ctrlMode = CTRL_ON;
  else if (m == "off") ctrlMode = CTRL_OFF;
  else                 ctrlMode = CTRL_AUTO;
  decideFan(millis());   // apply right away
  publishNow = true;
  handleData();
}

void handleReset() { resetBatch(); publishNow = true; handleData(); }

// =====================================================================
//  Online dashboard: MQTT
// =====================================================================
void newNonce() { cmdNonce = (uint32_t)random(1, 0x7FFFFFFF); }   // ESP32 random() uses the hardware RNG

// hex HMAC-SHA256(key = CONTROL_PIN, msg = "<cmd>:<nonce>"), compared in constant time
bool macOk(const char* cmd, const char* nonce, const char* macHex) {
  if (strlen(macHex) != 64) return false;
  char msg[32];
  snprintf(msg, sizeof(msg), "%s:%s", cmd, nonce);
  uint8_t mac[32];
  if (mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
                      (const unsigned char*)CONTROL_PIN, strlen(CONTROL_PIN),
                      (const unsigned char*)msg, strlen(msg), mac) != 0) return false;
  char hex[65];
  for (int i = 0; i < 32; i++) snprintf(hex + 2 * i, 3, "%02x", mac[i]);
  uint8_t diff = 0;
  for (int i = 0; i < 64; i++) diff |= (uint8_t)(hex[i] ^ tolower((unsigned char)macHex[i]));
  return diff == 0;
}

void sendAck(const char* cmd, bool ok, const char* why) {
  String j = "{\"cmd\":\""; j += cmd;
  j += "\",\"ok\":"; j += (ok ? "true" : "false");
  if (why) { j += ",\"why\":\""; j += why; j += "\""; }
  j += ",\"nonce\":\""; j += hex8(cmdNonce); j += "\"}";
  mqtt.publish(topicAck.c_str(), j.c_str(), false);
}

// Commands arrive as "<cmd>:<nonce>:<hmac>", cmd = auto | on | off | reset.
// Note: PubSubClient reuses one buffer, so topic and payload are copied before anything is published.
void mqttCallback(char* topic, byte* payload, unsigned int len) {
  if (topicHistReq == topic) { histWanted = true; return; }
  if (topicCmd != topic) return;
  char msg[128];
  unsigned int n = len < sizeof(msg) - 1 ? len : sizeof(msg) - 1;
  memcpy(msg, payload, n);
  msg[n] = 0;
  char* s1 = strchr(msg, ':');
  if (!s1) return;
  *s1 = 0;
  char* s2 = strchr(s1 + 1, ':');
  if (!s2) return;
  *s2 = 0;
  const char* cmd = msg;
  const char* nonce = s1 + 1;
  const char* mac = s2 + 1;
  if (strcmp(cmd, "on") && strcmp(cmd, "off") && strcmp(cmd, "auto") && strcmp(cmd, "reset")) return;

  unsigned long now = millis();
  if ((long)(lockUntil - now) > 0) { sendAck(cmd, false, "locked"); return; }
  if (strlen(nonce) != 8 || strtoul(nonce, nullptr, 16) != cmdNonce) { sendAck(cmd, false, "stale"); return; }
  if (!macOk(cmd, nonce, mac)) {
    if (now - badSince > 60000UL) { badSince = now; badPins = 0; }
    if (++badPins >= 5) { lockUntil = now + 60000UL; badPins = 0; Serial.println("Online control locked for 1 min (wrong PINs)"); }
    sendAck(cmd, false, "pin");
    return;
  }
  newNonce();                                   // each nonce works once
  if      (!strcmp(cmd, "on"))    ctrlMode = CTRL_ON;
  else if (!strcmp(cmd, "off"))   ctrlMode = CTRL_OFF;
  else if (!strcmp(cmd, "auto"))  ctrlMode = CTRL_AUTO;
  else                            resetBatch();
  decideFan(now);
  publishNow = true;
  sendAck(cmd, true, nullptr);
  Serial.printf("Online command: %s\n", cmd);
}

// Batch history (1-minute averages) for the online page, in chunks so no message is large.
void sendLongHistory() {
  uint16_t chunks = lCount ? (lCount + HIST_CHUNK - 1) / HIST_CHUNK : 1;
  for (uint16_t c = 0; c < chunks; c++) {
    String j; j.reserve(HIST_CHUNK * 46 + 48);
    j += "{\"i\":"; j += c; j += ",\"of\":"; j += chunks; j += ",\"p\":[";
    uint16_t from = c * HIST_CHUNK, to = from + HIST_CHUNK;
    if (to > lCount) to = lCount;
    for (uint16_t k = from; k < to; k++) {
      const LRec& r = longAt(k);
      if (k > from) j += ",";
      j += "["; j += r.t;
      j += ","; j += String(r.tin / 10.0, 1);
      j += ","; j += String(r.tout / 10.0, 1);
      j += ","; j += String(r.rhin / 10.0, 1);
      j += ","; j += String(r.rhout / 10.0, 1);
      j += ","; j += String(r.dw / 100.0, 2);
      j += ","; j += String(r.fan / 100.0, 2);
      j += "]";
    }
    j += "]}";
    if (!mqtt.beginPublish(topicHist.c_str(), j.length(), false)) return;
    mqtt.write((const uint8_t*)j.c_str(), j.length());
    if (!mqtt.endPublish()) return;
  }
}

void ensureMqtt(unsigned long now) {
  if (netState != NET_ONLINE) return;
  if (mqtt.connected()) return;
  if (now - lastMqttTry < mqttRetryMs) return;   // 5 s, doubling to 60 s while the broker is unreachable
  lastMqttTry = now;
  String id = "dryer-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  if (mqtt.connect(id.c_str(), topicStatus.c_str(), 0, true, "offline")) {
    mqttRetryMs = 5000UL;
    mqtt.publish(topicStatus.c_str(), "online", true);
    mqtt.subscribe(topicCmd.c_str());
    mqtt.subscribe(topicHistReq.c_str());
    publishNow = true;
    Serial.print("MQTT connected: online dashboard is live at "); Serial.println(ONLINE_URL);
  } else {
    mqttRetryMs = mqttRetryMs >= 30000UL ? 60000UL : mqttRetryMs * 2;
    Serial.print("MQTT connect failed, state "); Serial.println(mqtt.state());
  }
}

void handleNotFound() {
  // While the setup portal is open, every unknown address (phone captive checks)
  // is sent to the setup page so it pops up automatically.
  server.sendHeader("Location", dnsOn ? "http://192.168.4.1/wifi" : "/");
  server.send(302, "text/plain", "");
}

// =====================================================================
//  Internet Wi-Fi: saved credentials + setup portal
// =====================================================================
const char* netStateName() {
  switch (netState) {
    case NET_PORTAL:     return "portal";
    case NET_CONNECTING: return "connecting";
    case NET_CHECKING:   return "checking";
    case NET_ONLINE:     return "online";
    default:             return "lost";
  }
}

void setNetMsg(const String& m) { netMsg = m; Serial.println("[Wi-Fi] " + m); }

void startConnect() {
  WiFi.disconnect();
  delay(100);
  WiFi.begin(staSsid.c_str(), staPass.c_str());
  netState = NET_CONNECTING;
  netSince = millis();
  setNetMsg("Connecting to \"" + staSsid + "\" (try " + String(netAttempt + 1) + " of " + String(MAX_CONNECT_TRIES) + ")");
}

void openPortal(const String& why) {
  WiFi.disconnect();
  if (!dnsOn) { dns.start(53, "*", WiFi.softAPIP()); dnsOn = true; }
  netState = NET_PORTAL;
  netSince = millis();
  setNetMsg(why);
  Serial.printf("[Wi-Fi] Setup portal open: join \"%s\" and open http://192.168.4.1/wifi\n", AP_SSID);
}

void closePortal() { if (dnsOn) { dns.stop(); dnsOn = false; } }

void wipeCredentials() {
  prefs.remove("ssid");
  prefs.remove("pass");
  prefs.remove("ok");
  staSsid = ""; staPass = "";
  Serial.println("[Wi-Fi] Saved Wi-Fi erased");
}

void connectFailed(const String& why) {
  if (credsWorked) {                       // worked before (even before a restart): never erase, keep reconnecting
    netState = NET_LOST; netSince = millis();
    setNetMsg(why + " Retrying.");
    return;
  }
  netAttempt++;
  if (netAttempt < MAX_CONNECT_TRIES) { setNetMsg(why); startConnect(); return; }
  wipeCredentials();
  openPortal(why + " The saved Wi-Fi was erased. Enter the details again.");
}

bool internetReachable() {
  WiFiClient c;
  bool ok = c.connect("connectivitycheck.gstatic.com", 80, 2000);
  c.stop();
  return ok;
}

void netTick(unsigned long now) {
  wl_status_t st = WiFi.status();
  switch (netState) {
    case NET_PORTAL:
      break;

    case NET_CONNECTING:
      if (st == WL_CONNECTED) {
        netState = NET_CHECKING; netSince = now; lastNetCheck = 0;
        setNetMsg("Joined \"" + staSsid + "\", checking internet");
      } else if (now - netSince > CONNECT_TIMEOUT_MS) {
        connectFailed(st == WL_NO_SSID_AVAIL
          ? "Network \"" + staSsid + "\" was not found. Is the hotspot on and set to 2.4 GHz?"
          : "Could not join \"" + staSsid + "\". The password may be wrong.");
      }
      break;

    case NET_CHECKING:
      if (st != WL_CONNECTED) { connectFailed("Lost \"" + staSsid + "\" while checking internet."); break; }
      // Each check can block for up to 2 s, so known-good details are checked less often
      if (lastNetCheck == 0 || now - lastNetCheck >= (credsWorked ? 15000UL : 5000UL)) {
        lastNetCheck = now;
        if (internetReachable()) {
          netState = NET_ONLINE; credsWorked = true; netAttempt = 0; lostRetryMs = 15000UL;
          if (!prefs.getBool("ok", false)) prefs.putBool("ok", true);   // remember: these details work
          closePortal();
          setNetMsg("Online through \"" + staSsid + "\"");
          break;
        }
      }
      if (now - netSince > INTERNET_TIMEOUT_MS)
        connectFailed("\"" + staSsid + "\" has no internet. Turn on mobile data on the hotspot phone.");
      break;

    case NET_ONLINE:
      if (st != WL_CONNECTED) { netState = NET_LOST; netSince = now; setNetMsg("Lost \"" + staSsid + "\". Reconnecting."); }
      break;

    case NET_LOST:                            // only reached after the Wi-Fi has worked
      if (st == WL_CONNECTED) {               // back: check the internet straight away
        netState = NET_CHECKING; netSince = now; lastNetCheck = 0; lostRetryMs = 15000UL;
        setNetMsg("Rejoined \"" + staSsid + "\", checking internet");
      } else if (now - netSince > lostRetryMs) {
        // Each attempt scans the channels, which briefly disturbs the dryer's own Wi-Fi,
        // so retries slow down from 15 s to 2 min while the hotspot stays away.
        netSince = now;
        lostRetryMs = lostRetryMs >= 60000UL ? 120000UL : lostRetryMs * 2;
        WiFi.disconnect(); WiFi.begin(staSsid.c_str(), staPass.c_str());
      }
      break;
  }
}

String jsonEsc(const String& s) {
  String o; o.reserve(s.length() + 4);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '"' || c == '\\') { o += '\\'; o += c; }
    else if ((uint8_t)c < 0x20) o += ' ';
    else o += c;
  }
  return o;
}

void handleWifiPage();   // page defined below

void handleWifiStatus() {
  String j = "{\"state\":\""; j += netStateName();
  j += "\",\"ssid\":\"";  j += jsonEsc(staSsid);
  j += "\",\"msg\":\"";   j += jsonEsc(netMsg);
  j += "\",\"mqtt\":";    j += (mqtt.connected() ? 1 : 0);
  j += "}";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", j);
}

void handleWifiScan() {
  int n = WiFi.scanComplete();
  if (n == WIFI_SCAN_FAILED) { WiFi.scanNetworks(true); n = WIFI_SCAN_RUNNING; }
  if (n == WIFI_SCAN_RUNNING) { server.send(200, "application/json", "{\"scanning\":true}"); return; }
  String j = "{\"scanning\":false,\"nets\":[";
  for (int i = 0; i < n; i++) {
    if (i) j += ",";
    j += "{\"s\":\""; j += jsonEsc(WiFi.SSID(i));
    j += "\",\"r\":"; j += WiFi.RSSI(i);
    j += ",\"o\":";   j += (WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? 1 : 0);
    j += "}";
  }
  j += "]}";
  WiFi.scanDelete();                     // next request starts a fresh scan
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", j);
}

void handleWifiSave() {
  String s = server.arg("ssid"), p = server.arg("pass");
  s.trim();
  if (s.length() == 0 || s.length() > 32) { server.send(400, "text/plain", "Enter the Wi-Fi name."); return; }
  if (p.length() > 0 && p.length() < 8)   { server.send(400, "text/plain", "The password must be at least 8 characters."); return; }
  prefs.putString("ssid", s);
  prefs.putString("pass", p);
  prefs.remove("ok");                    // new details count as working only once they reach the internet
  staSsid = s; staPass = p;
  credsWorked = false; netAttempt = 0;
  server.send(200, "text/plain", "Saved");
  delay(300);                            // let the reply reach the phone first
  startConnect();                        // portal stays open until it is online
}

void handleWifiForget() {
  wipeCredentials();
  credsWorked = false; netAttempt = 0;
  server.send(200, "text/plain", "Erased");
  openPortal("Saved Wi-Fi erased. Enter new details.");
}

// =====================================================================
//  Wi-Fi setup page
// =====================================================================
const char WIFI_PAGE[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Dryer Wi-Fi setup</title>
<style>
:root{--bg:#edf1ec;--card:#fff;--ink:#1d2a24;--muted:#5b6a62;--line:#d3dcd5;--track:#e2e8e3;--air:#3a6f9e;--leaf:#2c8553;--alert:#bf3e28;--sun:#c97a06;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#121815;--card:#1b231f;--ink:#e5ece8;--muted:#98a79f;--line:#2d3833;--track:#26302b;--air:#80b2df;--leaf:#5cc48a;--alert:#ee7a62;--sun:#f0a53a;color-scheme:dark}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink)}
body{font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)}
main{max-width:560px;margin:0 auto;padding:16px 14px 28px}
h1{font-size:1.35rem;margin:4px 2px 2px}.sub{margin:0 2px 14px;color:var(--muted);font-size:.9rem}
section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:12px}
h2{font-size:1rem;margin:0 0 10px}
.st{display:flex;align-items:center;gap:8px;font-weight:700;font-size:1.1rem}
.dot{width:10px;height:10px;border-radius:50%;background:var(--sun)}.dot.ok{background:var(--leaf)}.dot.bad{background:var(--alert)}
.msg{margin:6px 0 0}.hint{color:var(--muted);font-size:.85rem;margin:8px 0 0}
.nets{display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto}
.net{font:inherit;display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);cursor:pointer}
.net small{color:var(--muted);white-space:nowrap}
label{display:block;font-size:.9rem;color:var(--muted);margin:10px 0 4px}
input[type=text],input[type=password]{width:100%;font:inherit;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}
.chk{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:.9rem;color:var(--muted)}
.btn{font:inherit;font-weight:600;width:100%;margin-top:14px;padding:12px;border-radius:10px;background:var(--ink);color:var(--card);border:1px solid var(--ink);cursor:pointer}
.btn.ghost{background:transparent;color:var(--ink)}
.row{display:flex;justify-content:space-between;align-items:center}
.link{font:inherit;background:none;border:0;color:var(--air);cursor:pointer;padding:0}
a{color:var(--air)}
button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid var(--air);outline-offset:2px}
</style></head><body><main>
<h1>Internet Wi-Fi setup</h1>
<p class="sub">Connect the dryer to a phone hotspot so the online dashboard can show live data.</p>

<section aria-live="polite">
  <div class="st"><span class="dot" id="dot"></span><span id="st">Checking</span></div>
  <p class="msg" id="msg"></p>
  <p class="hint" id="cur"></p>
  <p class="hint" id="lost" hidden>Lost contact with the dryer. Rejoin the SolarDryer-BUET Wi-Fi and reload this page.</p>
</section>

<section>
  <div class="row"><h2>Choose a network</h2><button class="link" id="rescan" type="button">Search again</button></div>
  <div class="nets" id="nets"></div>
  <p class="hint">Use a 2.4 GHz hotspot with mobile data turned on.</p>
</section>

<section>
  <form id="f">
    <label for="ssid">Wi-Fi name</label>
    <input type="text" id="ssid" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="32">
    <label for="pass">Password</label>
    <input type="password" id="pass" autocomplete="off" maxlength="63">
    <label class="chk"><input type="checkbox" id="show"> Show password</label>
    <button class="btn" type="submit">Save and connect</button>
  </form>
  <p class="hint" id="fmsg" aria-live="polite"></p>
  <button class="btn ghost" id="forget" type="button">Erase saved Wi-Fi</button>
</section>

<p class="hint" style="text-align:center"><a href="/">Back to the dryer dashboard</a></p>
</main>
<script>
const $=id=>document.getElementById(id);
const NAMES={portal:'Not connected',connecting:'Connecting',checking:'Checking internet',online:'Online',lost:'Reconnecting'};
async function status(){
 try{const r=await fetch('/wifi/status',{cache:'no-store'});const d=await r.json();
  $('st').textContent=NAMES[d.state]||d.state;
  $('dot').className='dot '+(d.state==='online'?'ok':d.state==='portal'?'bad':'');
  $('msg').textContent=d.msg+(d.state==='online'?(d.mqtt?'. The online dashboard is receiving data.':'. Connecting to the online dashboard.'):'');
  $('cur').textContent=d.ssid?'Saved network: '+d.ssid:'No network saved.';
  $('lost').hidden=true;
 }catch(e){$('lost').hidden=false}
 setTimeout(status,2000);
}
function showNets(list){
 const seen={};list=(list||[]).filter(n=>n.s&&!seen[n.s]&&(seen[n.s]=1)).sort((a,b)=>b.r-a.r);
 const box=$('nets');box.innerHTML='';
 if(!list.length){box.innerHTML='<p class="hint">No networks found. Type the name below.</p>';return}
 list.forEach(n=>{const b=document.createElement('button');b.type='button';b.className='net';
  const name=document.createElement('span');name.textContent=n.s;
  const q=document.createElement('small');q.textContent=(n.r>-60?'Strong':n.r>-75?'Good':'Weak')+(n.o?', open':'');
  b.append(name,q);b.addEventListener('click',()=>{$('ssid').value=n.s;$('pass').focus()});box.appendChild(b)});
}
async function scan(){
 $('nets').innerHTML='<p class="hint">Searching for networks.</p>';
 for(let i=0;i<15;i++){
  try{const r=await fetch('/wifi/scan',{cache:'no-store'});const d=await r.json();if(!d.scanning){showNets(d.nets);return}}catch(e){}
  await new Promise(r=>setTimeout(r,1000));
 }
 $('nets').innerHTML='<p class="hint">No networks found. Type the name below.</p>';
}
$('rescan').addEventListener('click',scan);
$('show').addEventListener('change',e=>{$('pass').type=e.target.checked?'text':'password'});
$('f').addEventListener('submit',async e=>{
 e.preventDefault();
 const s=$('ssid').value.trim(),p=$('pass').value;
 if(!s){$('fmsg').textContent='Enter the Wi-Fi name.';return}
 if(p&&p.length<8){$('fmsg').textContent='The password must be at least 8 characters.';return}
 $('fmsg').textContent='Saving.';
 try{const r=await fetch('/wifi/save',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:'ssid='+encodeURIComponent(s)+'&pass='+encodeURIComponent(p)});
  $('fmsg').textContent=r.ok?'Saved. The dryer is connecting to '+s+'. Watch the status at the top.':await r.text();
 }catch(err){$('fmsg').textContent='Sent. If your phone disconnected, rejoin SolarDryer-BUET and open 192.168.4.1/wifi to see the result.'}
});
$('forget').addEventListener('click',async()=>{
 if(!confirm('Erase the saved Wi-Fi from the dryer?'))return;
 try{await fetch('/wifi/forget',{method:'POST'})}catch(e){}
 $('fmsg').textContent='Saved Wi-Fi erased.';scan();
});
status();scan();
</script></body></html>)rawliteral";

void handleWifiPage() { server.send(200, "text/html", WIFI_PAGE); }

// =====================================================================
//  LCD (optional)
// =====================================================================
void updateLcd() {
#if USE_LCD
  page = (page + 1) % 4;
  lcd.clear();
  if (page < 2) {
    lcd.setCursor(0, 0); lcd.print("In  "); lcd.print(gTin, 1);  lcd.print("C "); lcd.print(gRHin, 0);  lcd.print('%');
    lcd.setCursor(0, 1); lcd.print("Out "); lcd.print(gTout, 1); lcd.print("C "); lcd.print(gRHout, 0); lcd.print('%');
  } else {
    lcd.setCursor(0, 0); lcd.write(byte(0)); lcd.print("w "); lcd.print(gDw, 2); lcd.print(" g/kg");
    lcd.setCursor(0, 1); lcd.print("Fan "); lcd.print(fanOn ? "ON  " : "OFF "); lcd.print(gMode);
  }
#endif
}

// =====================================================================
//  Setup
// =====================================================================
void setup() {
  setFan(false, 0);
  Serial.begin(115200);
  dhtIn.begin();
  dhtOut.begin();

#if USE_LCD
  Wire.begin(PIN_SDA, PIN_SCL);
  lcd.init(); lcd.backlight(); lcd.createChar(0, DELTA);
  lcd.setCursor(0, 0); lcd.print("Solar Dryer");
#endif

  WiFi.persistent(false);                 // we store the hotspot details ourselves
  WiFi.mode(WIFI_AP_STA);                 // own network + phone hotspot together
  WiFi.softAP(AP_SSID, AP_PASS);
  WiFi.setAutoReconnect(false);           // netTick() reconnects, with backoff, so the dryer's own Wi-Fi stays steady
  configTime(6 * 3600, 0, "pool.ntp.org", "time.google.com");   // clock for "last update" on the online page
  newNonce();                             // after Wi-Fi start: the hardware RNG is fully random with the radio on

  topicState   = String(TOPIC_BASE) + "/state";
  topicStatus  = String(TOPIC_BASE) + "/status";
  topicCmd     = String(TOPIC_BASE) + "/cmd";
  topicAck     = String(TOPIC_BASE) + "/ack";
  topicHist    = String(TOPIC_BASE) + "/hist";
  topicHistReq = String(TOPIC_BASE) + "/histreq";
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(1024);
  mqtt.setSocketTimeout(5);
  server.on("/", handleRoot);
  server.on("/data", handleData);
  server.on("/history", handleHistory);
  server.on("/csv", handleCsv);
  server.on("/fan", handleFan);
  server.on("/reset", handleReset);
  server.on("/wifi", HTTP_GET, handleWifiPage);
  server.on("/wifi/status", handleWifiStatus);
  server.on("/wifi/scan", handleWifiScan);
  server.on("/wifi/save", HTTP_POST, handleWifiSave);
  server.on("/wifi/forget", HTTP_POST, handleWifiForget);
  server.onNotFound(handleNotFound);
  server.begin();

  // Load saved hotspot details, or open the setup portal
  prefs.begin("dryerwifi", false);
  staSsid = prefs.getString("ssid", "");
  staPass = prefs.getString("pass", "");
  credsWorked = staSsid.length() && prefs.getBool("ok", false);   // worked before a restart: never erase
  if (staSsid.length()) startConnect();
  else openPortal("No internet Wi-Fi saved yet.");

  Serial.print("Wi-Fi: "); Serial.print(AP_SSID);
  Serial.print("   open http://"); Serial.println(WiFi.softAPIP());
  Serial.println("time_s,T_in,RH_in,T_out,RH_out,w_in,w_out,dw,fan,mode");

  sessionStart = millis();
  delay(2000);
}

// =====================================================================
//  Main loop
// =====================================================================
void loop() {
  if (dnsOn) dns.processNextRequest();
  server.handleClient();

  unsigned long now = millis();
  netTick(now);
  mqtt.loop();
  ensureMqtt(now);
  if (mqtt.connected() && (publishNow || now - lastPublish >= PUBLISH_MS)) {
    mqtt.publish(topicState.c_str(), stateJson().c_str(), true);   // retained: page sees last reading at once
    lastPublish = now;
    publishNow = false;
  }
  if (histWanted && mqtt.connected() && (lastHistSent == 0 || now - lastHistSent > 15000UL)) {
    histWanted = false;                   // one reply serves every page that asked meanwhile
    lastHistSent = now;
    sendLongHistory();
  }

  if (now - lastSample < SAMPLE_MS) return;
  unsigned long dtMs = lastSample ? now - lastSample : 0;
  lastSample = now;

  float tIn   = dhtIn.readTemperature();
  float rhIn  = dhtIn.readHumidity();
  float tOut  = dhtOut.readTemperature();
  float rhOut = dhtOut.readHumidity();

  // Each sensor is handled on its own
  if (!isnan(tIn) && !isnan(rhIn)) {
    failIn = 0;
    avgTin.add(tIn + T_OFFSET_IN);
    avgRHin.add(constrain(rhIn + RH_OFFSET_IN, 0.0f, 100.0f));
  } else if (failIn < 255) failIn++;

  if (!isnan(tOut) && !isnan(rhOut)) {
    failOut = 0;
    avgTout.add(tOut);
    avgRHout.add(rhOut);
  } else if (failOut < 255) failOut++;

  gFault   = (failIn >= MAX_FAILS);                          // inside sensor is essential
  gOutEst  = (failOut >= MAX_FAILS) || (avgTout.count == 0); // outside missing -> set values
  if (gFault && avgTin.count) {           // drop old inside readings: never show or act on stale values
    avgTin.clear(); avgRHin.clear();
    gTin = gRHin = gWin = gDw = NAN;
  }
  gHave    = (avgTin.count > 0);

  if (gOutEst != lastOutEst) {
    lastOutEst = gOutEst;
    if (gOutEst) Serial.printf("Outside sensor (GPIO %d) not reading: using set values %.1f C, %.0f %%RH\n",
                               PIN_DHT_OUT, AMBIENT_T_C, AMBIENT_RH);
    else         Serial.println("Outside sensor reading OK");
  }
  if (gFault != lastFault) {
    lastFault = gFault;
    Serial.println(gFault ? "Inside sensor (GPIO 32) NOT reading: check wiring" : "Inside sensor reading OK");
  }
  if (!gHave && !gFault) return;

  // Outside air is updated even during an inside-sensor fault, so the page never shows stale values
  if (gOutEst) { gTout = AMBIENT_T_C;     gRHout = AMBIENT_RH; }
  else         { gTout = avgTout.mean();  gRHout = avgRHout.mean(); }
  gWout = omegaGkg(gTout, gRHout);
  if (gHave) {
    gTin  = avgTin.mean();   gRHin  = avgRHin.mean();
    gWin  = omegaGkg(gTin, gRHin);
    gDw   = gWin - gWout;
  }
  sampleNo++;

  // Water pushed out since the last sample (fan state and dw of the interval just ended)
  if (fanOn && gHave && gDw > 0 && dtMs > 0 && dtMs < 10000UL)
    waterG += AIRFLOW_KGS * gDw * (dtMs / 1000.0f);

  decideFan(now);

  if (gHave && ++histSkip >= HIST_EVERY) { histSkip = 0; addHistory(now); }
  if (gHave) addLong(now);

  updateLcd();
  Serial.printf("%lu,%.2f,%.1f,%.2f,%.1f,%.2f,%.2f,%.2f,%d,%s\n",
                (now - sessionStart) / 1000, gTin, gRHin, gTout, gRHout,
                gWin, gWout, gDw, fanOn ? 1 : 0, gMode);
}
