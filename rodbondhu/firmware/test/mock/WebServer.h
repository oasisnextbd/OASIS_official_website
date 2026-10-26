#pragma once
#include "Arduino.h"
enum HTTPMethod { HTTP_ANY, HTTP_GET, HTTP_POST };
class WebServer {
 public:
  WebServer(int) {}
  std::map<std::string, std::function<void()>> routes;
  std::map<std::string, std::string> args;
  std::string lastBody; int lastCode = 0;
  void on(const char* p, std::function<void()> f) { routes[p] = f; }
  void on(const char* p, HTTPMethod, std::function<void()> f) { routes[p] = f; }
  void onNotFound(std::function<void()>) {}
  void begin() {}
  void handleClient() {}
  void sendHeader(const char*, const char*) {}
  void send(int c, const char*, const String& b) { lastCode = c; lastBody = b.s; }
  void send(int c, const char*, const char* b) { lastCode = c; lastBody = b; }
  String arg(const char* n) { return String(args[n]); }
};
