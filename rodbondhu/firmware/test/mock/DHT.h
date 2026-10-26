#pragma once
#include "Arduino.h"
#define DHT22 22
float simRead(int pin, bool temp);
class DHT { int pin; public: DHT(int p, int) : pin(p) {} void begin() {}
  float readTemperature() { return simRead(pin, true); } float readHumidity() { return simRead(pin, false); } };
