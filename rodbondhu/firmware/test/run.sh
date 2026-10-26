#!/usr/bin/env bash
# Firmware + app end-to-end test, no hardware needed. Needs g++, OpenSSL (libssl-dev), Node 18+, Playwright with Chromium.
#   rodbondhu/firmware/test/run.sh
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --silent
# Test-only secrets (the real ones live in an untracked secrets.h next to the sketch)
g++ -std=gnu++17 -O1 -Wall -Wextra -Wno-unused-parameter -Imock \
  -DSECRET_AP_PASS='"bench-ap-pass"' -DSECRET_CONTROL_PIN='"bench-pin-4821"' \
  -DSKETCH='"../solar_dryer_cloud/solar_dryer_cloud.ino"' -x c++ bench.cpp -o bench -lcrypto
PREFILL_MIN=180 node bridge.js > bridge.log 2>&1 & BRIDGE=$!
python3 -m http.server 8766 -d ../../app > /dev/null 2>&1 & WEB=$!
trap 'kill $BRIDGE $WEB 2>/dev/null' EXIT
sleep 3
mkdir -p out
node e2e.js out
