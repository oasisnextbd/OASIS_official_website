// Copy this file to secrets.h (same folder) and set both values.
// secrets.h is listed in .gitignore, so your real values never reach GitHub.

// Password of the dryer's own Wi-Fi "SolarDryer-BUET" (local dashboard). At least 8 characters.
#define SECRET_AP_PASS     "choose-8-or-more-characters"

// Control PIN for the online dashboard (fan On / Off / Auto, new batch).
// Any length works and longer is safer: 8 or more characters, not a year or a phone number.
#define SECRET_CONTROL_PIN "choose-a-long-pin"
