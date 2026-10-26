#pragma once
#include "Arduino.h"
class Preferences { public:
  std::map<std::string, std::string> m;
  void begin(const char*, bool) {}
  String getString(const char* k, const char* d) { auto i = m.find(k); return i == m.end() ? String(d) : String(i->second); }
  void putString(const char* k, const String& v) { m[k] = v.s; }
  bool getBool(const char* k, bool d) { auto i = m.find(k); return i == m.end() ? d : i->second == "1"; }
  void putBool(const char* k, bool v) { m[k] = v ? "1" : "0"; }
  void remove(const char* k) { m.erase(k); }
};
