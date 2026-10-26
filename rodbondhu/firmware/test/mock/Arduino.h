// Host stand-ins for the Arduino-ESP32 APIs used by solar_dryer_cloud.ino (test bench only).
#pragma once
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cctype>
#include <cmath>
#include <ctime>
#include <string>
#include <map>
#include <random>
#include <functional>
#include <cstdarg>
#include <iostream>
#include <vector>
#include <algorithm>

typedef uint8_t byte;
typedef bool boolean;
#define HEX 16
#define DEC 10
#define PROGMEM
#define INPUT 0
#define OUTPUT 1
#define LOW 0
#define HIGH 1
#define constrain(x, lo, hi) ((x) < (lo) ? (lo) : ((x) > (hi) ? (hi) : (x)))
using std::isnan;

unsigned long millis();
void delay(unsigned long ms);
inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}
long random(long lo, long hi);

class String {
 public:
  std::string s;
  String() {}
  String(const char* c) : s(c ? c : "") {}
  String(const std::string& x) : s(x) {}
  explicit String(char c) : s(1, c) {}
  String(int v, unsigned char base = 10) { fmtInt((long long)v, base); }
  String(unsigned int v, unsigned char base = 10) { fmtU((unsigned long long)v, base); }
  String(long v, unsigned char base = 10) { fmtInt((long long)v, base); }
  String(unsigned long v, unsigned char base = 10) { fmtU((unsigned long long)v, base); }
  String(unsigned char v, unsigned char base = 10) { fmtU(v, base); }
  String(float v, unsigned char d = 2) { fmtF(v, d); }
  String(double v, unsigned char d = 2) { fmtF(v, d); }
  const char* c_str() const { return s.c_str(); }
  unsigned int length() const { return (unsigned)s.size(); }
  void reserve(unsigned int n) { s.reserve(n); }
  void trim() { size_t a = s.find_first_not_of(" \t\r\n"); if (a == std::string::npos) { s.clear(); return; } size_t b = s.find_last_not_of(" \t\r\n"); s = s.substr(a, b - a + 1); }
  char operator[](unsigned int i) const { return s[i]; }
  String& operator+=(const String& o) { s += o.s; return *this; }
  String& operator+=(const char* c) { s += c; return *this; }
  String& operator+=(char c) { s += c; return *this; }
  String& operator+=(unsigned char v) { s += std::to_string(v); return *this; }   // Arduino: number
  String& operator+=(int v) { s += std::to_string(v); return *this; }
  String& operator+=(unsigned int v) { s += std::to_string(v); return *this; }
  String& operator+=(long v) { s += std::to_string(v); return *this; }
  String& operator+=(unsigned long v) { s += std::to_string(v); return *this; }
  bool operator==(const char* c) const { return s == c; }
  bool operator!=(const char* c) const { return s != c; }
  bool operator==(const String& o) const { return s == o.s; }
 private:
  void fmtInt(long long v, int base) { if (base == 10) s = std::to_string(v); else fmtU((unsigned long long)v, base); }
  void fmtU(unsigned long long v, int base) { char b[40]; if (base == 16) snprintf(b, sizeof b, "%llx", v); else snprintf(b, sizeof b, "%llu", v); s = b; }
  void fmtF(double v, unsigned d) { char b[64]; snprintf(b, sizeof b, "%.*f", (int)d, v); s = b; }
};
inline String operator+(const String& a, const String& b) { String r(a); r += b; return r; }
inline String operator+(const String& a, const char* b) { String r(a); r += b; return r; }
inline String operator+(const char* a, const String& b) { String r(a); r += b; return r; }

class IPAddress { public: std::string toString() const { return "192.168.4.1"; } };

struct SerialMock {
  void begin(long) {}
  template <class T> void print(const T& v) { std::cerr << v; }
  void print(const String& v) { std::cerr << v.s; }
  void print(const IPAddress& v) { std::cerr << v.toString(); }
  template <class T> void println(const T& v) { print(v); std::cerr << "\n"; }
  void println() { std::cerr << "\n"; }
  void printf(const char* f, ...) { va_list a; va_start(a, f); vfprintf(stderr, f, a); va_end(a); }
};
extern SerialMock Serial;

struct EspMock { uint64_t getEfuseMac() { return 0x24A1B2C3D4E5ULL; } };
extern EspMock ESP;

void configTime(long, int, const char*, const char*);
