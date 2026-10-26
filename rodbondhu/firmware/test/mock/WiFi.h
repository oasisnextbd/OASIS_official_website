#pragma once
#include "Arduino.h"
typedef enum { WL_IDLE_STATUS = 0, WL_NO_SSID_AVAIL = 1, WL_CONNECTED = 3, WL_CONNECT_FAILED = 4, WL_DISCONNECTED = 6 } wl_status_t;
#define WIFI_AP_STA 3
#define WIFI_SCAN_RUNNING (-1)
#define WIFI_SCAN_FAILED (-2)
#define WIFI_AUTH_OPEN 0
struct WiFiMock {
  wl_status_t st = WL_DISCONNECTED;
  bool hotspotUp = true;   // test control
  void persistent(bool) {}
  void mode(int) {}
  void softAP(const char*, const char*) {}
  IPAddress softAPIP() { return IPAddress(); }
  void setAutoReconnect(bool) {}
  void begin(const char*, const char*) { st = hotspotUp ? WL_CONNECTED : WL_NO_SSID_AVAIL; }
  void disconnect() { st = WL_DISCONNECTED; }
  wl_status_t status() { if (!hotspotUp && st == WL_CONNECTED) st = WL_DISCONNECTED; return st; }
  int RSSI() { return -58; }
  int RSSI(int) { return -60; }
  String SSID(int) { return String("TestHotspot"); }
  int encryptionType(int) { return 3; }
  int scanComplete() { return 1; }
  void scanNetworks(bool) {}
  void scanDelete() {}
};
extern WiFiMock WiFi;
class WiFiClient {
 public:
  bool connect(const char*, int, int = 0);
  void stop() {}
};
