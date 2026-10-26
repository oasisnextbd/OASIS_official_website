// Test bench: runs the real solar_dryer_cloud.ino on the host.
// stdout: "PUB\t<retain>\t<topic>\t<base64 payload>" lines (a bridge forwards them to an MQTT broker)
// stdin : "MSG\t<topic>\t<base64 payload>" (incoming MQTT) and "CTL\t<name>\t<0|1>" (test controls)
#include "Arduino.h"
#include <chrono>
#include <sys/select.h>
#include <unistd.h>

SerialMock Serial;
EspMock ESP;
#include "WiFi.h"
WiFiMock WiFi;

static double SPEED = 1;
static unsigned long jumpMs = 0;
static auto t0 = std::chrono::steady_clock::now();
unsigned long millis() {
  double real = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
  return (unsigned long)(real * SPEED) + jumpMs;
}
void delay(unsigned long ms) { jumpMs += ms; }
static std::mt19937 rng(12345);
long random(long lo, long hi) { return lo + (long)(rng() % (unsigned long)(hi - lo)); }
void configTime(long, int, const char*, const char*) {}

static bool internetUp = true, brokerUp = false, simFailIn = false, simFailOut = false, simHot = false;
bool WiFiClient::connect(const char*, int, int) { return WiFi.status() == WL_CONNECTED && internetUp; }

#include "PubSubClient.h"
char PubSubClient::shared[65536];

// ---- base64 ----
static const char* B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static std::string b64enc(const std::string& in) {
  std::string out; int val = 0, bits = -6;
  for (unsigned char c : in) { val = (val << 8) + c; bits += 8; while (bits >= 0) { out.push_back(B64[(val >> bits) & 0x3F]); bits -= 6; } }
  if (bits > -6) out.push_back(B64[((val << 8) >> (bits + 8)) & 0x3F]);
  while (out.size() % 4) out.push_back('=');
  return out;
}
static std::string b64dec(const std::string& in) {
  std::string out; std::vector<int> T(256, -1); for (int i = 0; i < 64; i++) T[(unsigned char)B64[i]] = i;
  int val = 0, bits = -8;
  for (unsigned char c : in) { if (T[c] == -1) break; val = (val << 6) + T[c]; bits += 6; if (bits >= 0) { out.push_back(char((val >> bits) & 0xFF)); bits -= 8; } }
  return out;
}

// ---- PubSubClient bridge ----
static bool didConnect = false;
bool PubSubClient::connect(const char*, const char*, uint8_t, bool, const char*) { didConnect = brokerUp; if (didConnect) printf("CONN\n"); fflush(stdout); return didConnect; }
bool PubSubClient::connected() { if (!brokerUp) didConnect = false; return didConnect; }
static void emit(const std::string& t, const std::string& p, bool r) {
  printf("PUB\t%d\t%s\t%s\n", r ? 1 : 0, t.c_str(), b64enc(p).c_str()); fflush(stdout);
}
bool PubSubClient::publish(const char* t, const char* p, bool r) {
  if (!connected()) return false;
  std::string ts(t), ps(p);
  if (ts.size() + ps.size() + 8 > bufSize) { fprintf(stderr, "BENCH: publish larger than buffer (%zu)\n", ps.size()); return false; }
  memset(shared, 'X', 256);                 // like the real library: outgoing packet overwrites the shared buffer
  emit(ts, ps, r);
  return true;
}
bool PubSubClient::beginPublish(const char* t, unsigned int len, bool r) {
  if (!connected()) return false;
  pubTopic = t; pubBody.clear(); pubBody.reserve(len); pubRetain = r; pubLen = len;
  memset(shared, 'X', 256);
  return true;
}
size_t PubSubClient::write(const uint8_t* b, size_t n) { pubBody.append((const char*)b, n); return n; }
int PubSubClient::endPublish() {
  if (pubBody.size() != pubLen) { fprintf(stderr, "BENCH: length mismatch %zu vs %u\n", pubBody.size(), pubLen); return 0; }
  emit(pubTopic, pubBody, pubRetain); return 1;
}
static std::string inbuf;
bool PubSubClient::loop() {
  for (;;) {
    fd_set fs; FD_ZERO(&fs); FD_SET(0, &fs); timeval tv{0, 0};
    if (select(1, &fs, nullptr, nullptr, &tv) <= 0) break;
    char b[4096]; ssize_t n = read(0, b, sizeof b);
    if (n <= 0) { exit(0); }
    inbuf.append(b, n);
  }
  size_t nl;
  while ((nl = inbuf.find('\n')) != std::string::npos) {
    std::string line = inbuf.substr(0, nl); inbuf.erase(0, nl + 1);
    size_t a = line.find('\t'), b = line.find('\t', a + 1);
    if (a == std::string::npos || b == std::string::npos) continue;
    std::string kind = line.substr(0, a), k = line.substr(a + 1, b - a - 1), v = line.substr(b + 1);
    if (kind == "CTL") {
      bool on = v == "1";
      if (k == "fail_in") simFailIn = on; else if (k == "fail_out") simFailOut = on; else if (k == "hot") simHot = on;
      else if (k == "broker") brokerUp = on; else if (k == "internet") internetUp = on; else if (k == "hotspot") WiFi.hotspotUp = on;
      fprintf(stderr, "BENCH: %s=%d\n", k.c_str(), on);
    } else if (kind == "MSG" && connected() && cb) {
      std::string p = b64dec(v);
      memcpy(shared, k.c_str(), k.size() + 1);                 // topic and payload live in ONE buffer
      memcpy(shared + k.size() + 1, p.data(), p.size());
      cb(shared, (uint8_t*)shared + k.size() + 1, (unsigned)p.size());
    }
  }
  return true;
}

// ---- simulated sensors (a drying day starting 09:00) ----
static double simM = 0.2, simTin = 31, simLastMin = -1;
static double simTout = 30, simRHout = 70;
extern bool fanOn;
static double psatK(double T) { return 0.61121 * exp((18.678 - T / 234.5) * (T / (257.14 + T))); }
static void simStep() {
  double min = millis() / 60000.0;
  if (simLastMin < 0) simLastMin = min;
  double dt = min - simLastMin; if (dt <= 0) return; simLastMin = min;
  double hour = 9 + min / 60, I = std::max(0.0, sin(M_PI * (hour - 6) / 12));
  simTout = 28 + 5 * I; simRHout = 72 - 22 * I;
  double target = simHot ? 72 : simTout + 24 * I * (fanOn ? 0.8 : 1.0);
  static bool cooling = false;                       // test speed-up: heat and cool fast around the 62-65 C band
  if (simHot) cooling = true; else if (simTin < 58) cooling = false;
  simTin += (target - simTin) * std::min(1.0, (cooling ? 1.2 : 0.12) * dt);
  double gen = 0.14 * (0.3 + 0.7 * I) * exp(-min / 300);
  simM = std::max(0.0, simM + (gen - simM * (fanOn ? 0.35 : 0.05)) * dt);
}
float simRead(int pin, bool temp) {
  simStep();
  bool in = pin == 32;
  if ((in && simFailIn) || (!in && simFailOut)) return NAN;
  if (!in) return temp ? simTout : simRHout;
  if (temp) return simTin;
  double pvo = simRHout / 100 * psatK(simTout), wout = 622 * pvo / (101.325 - pvo), win = wout + simM;
  double pv = win * 101.325 / (622 + win);
  return (float)std::min(99.0, 100 * pv / psatK(simTin));
}

#include SKETCH

int main() {
  if (getenv("SPEED")) SPEED = atof(getenv("SPEED"));
  int prefill = getenv("PREFILL_MIN") ? atoi(getenv("PREFILL_MIN")) : 0;
  prefs.m["ssid"] = "TestHotspot"; prefs.m["pass"] = "password1";
  if (getenv("NO_WIFI_SAVED")) prefs.m.clear();
  setup();
  // Prefill: run the dryer quickly through the morning with the broker unreachable
  unsigned long target = millis() + (unsigned long)prefill * 60000UL;
  while (millis() < target) { jumpMs += 500; loop(); }
  brokerUp = true;
  fprintf(stderr, "BENCH: ready after %d simulated minutes\n", prefill);
  for (;;) { loop(); usleep(2000); }
}
