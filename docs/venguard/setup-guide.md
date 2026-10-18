# VenGuard: switching everything on

Do this signed in to the **company Google account** (not a personal one), in Chrome on a computer.
Total time: about 1–1.5 hours. Send Claude the three things marked **📨 SEND** as you go.

---

## Part 0 · Merge the code (2 min)

1. Open https://github.com/oasisnextbd/OASIS_official_website/compare/main...claude/venguard-docs-requirements-2rzq1l
2. **Create pull request** → **Merge pull request** → **Confirm merge**.

---

## Part A · Order database: Google Sheet + script (15 min)

1. Go to https://sheets.new → name the file **VenGuard Leads** (top left).
2. In the Sheet: **Extensions → Apps Script**. A new tab opens.
3. Delete everything in the editor.
4. Open https://github.com/oasisnextbd/OASIS_official_website/blob/main/backend/leads-sheet/Code.gs
   → click the **copy** icon (top right of the code) → paste into the Apps Script editor.
5. At the top, change the `ALERT_EMAILS` line to your team's emails, for example
   `ALERT_EMAILS: 'ceo@yourcompany.com, support@yourcompany.com',`
6. Click **💾 Save**. Rename the project (top left) to **VenGuard Leads**.
7. In the function menu next to **▶ Run**, choose **setup** → click **▶ Run**.
   → **Review permissions** → choose the company account → **Advanced** →
   **Go to VenGuard Leads (unsafe)** → **Allow**. (It says "unsafe" only because it is your own script.)
   The log shows "VenGuard leads backend is ready." and the Sheet now has a **Leads** tab.
8. **Deploy → New deployment** → click ⚙️ next to "Select type" → **Web app**.
   - Description: `website`
   - Execute as: **Me**
   - Who has access: **Anyone**
   → **Deploy** → copy the **Web app URL** (ends in `/exec`).
9. **📨 SEND Claude the Web app URL.**
10. Copy the Sheet's ID: in the Sheet's address `https://docs.google.com/spreadsheets/d/`**`THIS-LONG-PART`**`/edit` — keep it for Part B.

---

## Part B · Team dashboard (5 min)

The team dashboard keeps its data in Firestore, in the same Firebase project as the app.

1. https://console.firebase.google.com → project **venguard-connected** → **Firestore Database** →
   **Create database** → location **asia-south1 (Mumbai)** → **Start in production mode** → **Create**.
2. **Rules** tab → replace everything with
   https://github.com/oasisnextbd/OASIS_official_website/blob/main/backend/connected-firebase/firestore.rules
   → **Publish**.
3. Open https://oasisnextbd.github.io/OASIS_official_website/team/ → **Sign in with Google** → company account.
4. Fill in Settings → Company details and the authorised signature, Inventory → Add the VenGuard devices,
   then add the team in Settings → Team. Only the company account can add or remove people.

Details: [`team-dashboard/README.md`](../../team-dashboard/README.md).

---

## Part C (free plan) · Firebase on the Spark plan — current setup

The project `venguard-connected` stays on the free **Spark** plan for now. Spark has no Cloud Functions,
so skip "C4 · Deploy the backend" below; the database security rules do the work instead.

1. **Sign-in for customers:** Authentication → Sign-in method → **Phone** → Enable. Under
   *Phone numbers for testing* add the numbers you demo with (fixed codes, no SMS cost) → Save.
   Settings → Authorized domains → add `oasisnextbd.github.io`.
2. **Sign-in for devices:** Authentication → Sign-in method → **Email/Password** → Enable → Save.
3. **Database:** Realtime Database → Create Database → **Singapore** → locked mode → Enable.
4. **Rules:** Realtime Database → **Rules** tab → replace everything with the contents of
   `backend/connected-firebase/database.rules.json` → **Publish**.
5. **You as admin:** after signing in to the VenGuard app once, Authentication → Users → copy your UID →
   Realtime Database → Data → add `admins/<your UID>` = `true`.
6. **Each device:** `node backend/connected-firebase/tools/provision-spark.mjs VG-XXXX` prints the three
   console steps and what to flash.

Moving to Blaze later adds SMS to family, notifications when the app is closed and online payments
(the `functions/` folder, steps C1–C4 below).

## Part C · Firebase for the VenGuard app (45 min)

### C1 · Create the project (console)
1. https://console.firebase.google.com → **Create a project** → name **venguard-connected** →
   turn **Gemini** and **Google Analytics** off (you can add Analytics later) → **Create**.
2. Bottom left: **Spark plan → Upgrade** → **Blaze** → add the company card →
   set a **budget alert** of **US$ 30**. (Needed for the cloud functions. Small usage stays free or very cheap.)

### C2 · Turn on the services
1. **Build → Authentication → Get started → Sign-in method → Phone → Enable → Save**.
   Then **Settings → Authorized domains → Add domain** → `oasisnextbd.github.io`.
2. **Build → Firestore Database → Create database** → location **asia-southeast1 (Singapore)** →
   **Start in production mode** → **Create**.
3. **Build → Realtime Database → Create Database** → location **Singapore (asia-southeast1)** →
   **Start in locked mode** → **Enable**.

### C3 · Register the app and copy its settings
1. ⚙️ **Project settings → General → Your apps → `</>` (Web)** → nickname **VenGuard app** →
   **Register app** (don't tick Hosting).
2. You'll see `const firebaseConfig = { apiKey: "...", authDomain: "...", ... };`
3. **📨 SEND Claude that whole `firebaseConfig` block.** (It is safe to share: it identifies the app, it is not a password.)

### C4 · Deploy the backend (Cloud Shell, all in the browser)
1. Open https://shell.cloud.google.com (company account) and wait for the terminal.
2. Paste these lines **one at a time** (press Enter after each):

```bash
git clone https://github.com/oasisnextbd/OASIS_official_website.git
cd OASIS_official_website/backend/connected-firebase
firebase login --no-localhost
```
   Follow the link it prints, choose the company account, **Allow**, copy the code, paste it back.

```bash
firebase use --add
```
   Choose **venguard-connected**, alias: `default`.

3. Create the device master key. **Save the printed value in your password manager — if it is lost, devices must be re-flashed:**
```bash
openssl rand -hex 32
firebase functions:secrets:set DEVICE_MASTER_KEY
```
   Paste the value from the first line when asked.

4. Set placeholders for SMS and payments (change later when those accounts exist). For each command, type `-` and press Enter:
```bash
firebase functions:secrets:set SMS_API_URL
firebase functions:secrets:set SMS_API_KEY
firebase functions:secrets:set SMS_SENDER_ID
firebase functions:secrets:set SSLC_STORE_ID
firebase functions:secrets:set SSLC_STORE_PASSWORD
```

5. Install, test and deploy:
```bash
cd functions && npm install && npm test && cd ..
firebase deploy --only functions,firestore,database
```
   If it asks to enable APIs, answer **Y**. The first deploy takes 5–10 minutes.
   It ends with **✔ Deploy complete!** — **📨 SEND Claude a screenshot** (or the last 20 lines) of the output.

---

## Part D · Claude finishes (no action needed)

When the three 📨 items arrive, Claude:
- connects the website's forms to the Sheet (orders appear in the Sheet + email alerts);
- connects the VenGuard app (repository oasisnextbd/venguard-app) to Firebase: real sign-in by SMS code, live device data;
- rebuilds, tests and pushes. You merge one more pull request (Part 0 again).

Then test together: place a pre-order on the website → a row appears in **VenGuard Leads**,
an email arrives. Orders from WhatsApp go into the **team dashboard** with Orders → Add order.

---

## Later, when ready
| What | Where |
|---|---|
| SSLCommerz live (online deposits) | Leads script: ⚙️ Project Settings → Script properties `SSLC_STORE_ID`, `SSLC_STORE_PASSWORD`; then tell Claude to set `payment_enabled` |
| SMS provider | Leads script properties `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER_ID`; Firebase: `firebase functions:secrets:set …` then redeploy |
| Google Analytics, Meta Pixel, Clarity | Send Claude the IDs |
| Company domain | Tell Claude; addresses and Firebase authorized domains are updated |
