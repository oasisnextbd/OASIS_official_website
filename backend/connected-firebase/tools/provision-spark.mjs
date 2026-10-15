#!/usr/bin/env node
/**
 * Provision one VenGuard device on the free (Spark) plan — no Cloud Functions needed.
 *
 *   node tools/provision-spark.mjs VG-0001A3 [complete|detector_relay]
 *
 * Prints what to flash into the device and the three console steps that register it.
 * Run it on the in-house flashing PC. Nothing is sent anywhere; nothing is stored.
 * Keep the printed password with the device record only; the sticker code goes on the box/QR.
 */
import { randomInt } from "node:crypto";

const PROJECT = process.env.FIREBASE_PROJECT || "venguard-connected";
const [id, kit = "complete"] = process.argv.slice(2);

if (!/^VG-[A-Z0-9]{4,12}$/.test(id || "") || !["complete", "detector_relay"].includes(kit)) {
  console.error("Usage: node tools/provision-spark.mjs VG-XXXX [complete|detector_relay]");
  process.exit(1);
}

const pick = (alphabet, n) => Array.from({ length: n }, () => alphabet[randomInt(alphabet.length)]).join("");
// No 0/O/1/I/L in the sticker code: easy to read and type.
const stickerCode = pick("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 12);
const password = pick("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 32);
const email = `${id.toLowerCase()}@${PROJECT}.firebaseapp.com`; // a login name only; no mail is ever sent

console.log(`
VenGuard device ${id} (${kit})
────────────────────────────────────────────
FLASH INTO THE DEVICE (protected storage)
  device id   ${id}
  email       ${email}
  password    ${password}

STICKER / QR CODE (for the customer)
  ${id} · ${stickerCode}

REGISTER IN THE FIREBASE CONSOLE (project ${PROJECT})
  1. Authentication → Users → Add user
       Email: ${email}
       Password: ${password}
     → copy the new "User UID".
  2. Realtime Database → Data → on the top line click "+" and add, one at a time:
       deviceAuth/${id}        = <the User UID from step 1>
       claimCodes/${id}        = ${stickerCode}
       devices/${id}/meta/kit  = ${kit}
  3. Done. The customer adds the device in the VenGuard app with: ${id} and ${stickerCode}
`);
