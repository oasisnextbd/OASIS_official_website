#pragma once
#include "Arduino.h"
#include "WiFi.h"
// Bridge: publishes go to stdout as lines, incoming messages come from stdin (see bench.cpp).
// Like the real library, ONE shared buffer holds the incoming topic+payload and outgoing packets.
class PubSubClient {
 public:
  typedef std::function<void(char*, uint8_t*, unsigned int)> CB;
  PubSubClient(WiFiClient&) {}
  void setServer(const char*, uint16_t) {}
  void setCallback(CB c) { cb = c; }
  bool setBufferSize(uint16_t n) { bufSize = n; return true; }
  void setSocketTimeout(uint16_t) {}
  bool connect(const char*, const char*, uint8_t, bool, const char*);
  bool connected();
  bool publish(const char* t, const char* p, bool r);
  bool subscribe(const char*) { return true; }
  bool loop();
  int state() { return -2; }
  bool beginPublish(const char* t, unsigned int len, bool r);
  size_t write(const uint8_t* b, size_t n);
  int endPublish();
  CB cb; uint16_t bufSize = 256;
  static char shared[65536];
  std::string pubTopic, pubBody; bool pubRetain = false; unsigned int pubLen = 0;
};
