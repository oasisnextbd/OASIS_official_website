/**
 * VenGuard team dashboard — server side (Google Apps Script web app).
 *
 * The page people use is hosted with the website at  <site>/team/  (built from Index.html).
 * It signs each person in with Google through Firebase Auth (they pick their account, so several
 * Google accounts in one browser are fine) and POSTs every request here with a Firebase ID token.
 * This script asks Google whether the token is valid, then checks the email against the Team tab.
 *
 * Deploy as a web app with
 *   Execute as: Me (the company account)   ·   Who has access: Anyone
 * so only this account touches the "VenGuard Leads" Sheet; team members never need the Sheet itself.
 * Roles (Team tab):
 *   founder   – everything, incl. dealers and site settings
 * Only the owner (the company account this script runs as) adds or removes team members, and the
 * owner always stays on the team as founder, so nobody can lock the company out.
 *   support   – leads: add orders, change status, add notes, export
 *   marketing – read-only view + export
 * Script properties (Project Settings), each overriding CONFIG below: SHEET_ID, SITE_URL.
 */

/* The Sheet ID is best kept in Project Settings → Script properties as SHEET_ID, so pasting a newer
   version of this file never loses it. It is the long part of the Sheet's address between /d/ and /edit. */
var CONFIG = {
  SHEET_ID: 'PASTE-THE-SHEET-ID-HERE',
  SITE_URL: 'https://oasisnextbd.github.io/OASIS_official_website/VENGuard',
  DASHBOARD_URL: 'https://oasisnextbd.github.io/OASIS_official_website/team/',
  // Public web key of the venguard-connected Firebase project (the same one the app uses); it only
  // lets this script ask Google whether a sign-in token is genuine.
  FIREBASE_API_KEY: 'AIzaSyBhorrXE1tw7IH1CqUpvOYNgQaKpW4xOoA'
};

var TABS = {
  leads: 'Leads',
  team: 'Team',
  dealers: 'Dealers',
  settings: 'Settings',
  activity: 'Activity'
};
// Same columns, same order as ../leads-sheet/Code.gs, so the website and the dashboard share one Leads tab.
var LEAD_COLS = [
  'submitted_at', 'order_id', 'form_type', 'status', 'name', 'phone', 'email', 'organisation',
  'area', 'district', 'kitchen_type', 'business_type', 'units', 'cylinder_brand', 'heard_from',
  'dealer_code', 'qr_tag', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
  'referrer', 'landing_page', 'page_url', 'lang', 'message', 'consent',
  'payment_status', 'payment_txn', 'payment_method', 'paid_at', 'team_notes',
  'package'
];
var FORM_TYPES = ['preorder', 'enquiry', 'dealer', 'waitlist', 'contact'];
var TEAM_COLS = ['email', 'name', 'role', 'active'];
var DEALER_COLS = ['code', 'shop_name', 'owner_name', 'phone', 'area', 'district', 'status', 'created_at', 'notes'];
var ACTIVITY_COLS = ['time', 'user', 'action', 'ref', 'detail'];
var LEAD_STATUSES = ['new', 'payment_pending', 'contacted', 'paid', 'refunded', 'installed', 'not_interested'];
var ROLES = ['founder', 'support', 'marketing'];
var CAN = {
  editLead: ['founder', 'support'],
  dealers: ['founder'],
  settings: ['founder'],
  team: ['founder']
};

/** Opening the script's own address points people to the dashboard page. */
function doGet() {
  var url = prop_('DASHBOARD_URL');
  return HtmlService.createHtmlOutput(
    '<p style="font:16px/1.5 system-ui,sans-serif;padding:24px">The VenGuard dashboard is at ' +
    '<a href="' + url + '" target="_top">' + url + '</a>.</p>')
    .setTitle('VenGuard Dashboard')
    .setFaviconUrl('https://oasisnextbd.github.io/OASIS_official_website/VENGuard/assets/img/favicon-32.png');
}

/** Every dashboard request: { fn, args, token }. Answers { ok, result } or { ok: false, error }. */
var API_ = {
  getBootstrap: function () { return getBootstrap(); },
  updateLead: function (id, ch) { return updateLead(id, ch); },
  addLead: function (d) { return addLead(d); },
  saveDealer: function (d) { return saveDealer(d); },
  saveSettings: function (st) { return saveSettings(st); },
  saveTeamMember: function (m) { return saveTeamMember(m); }
};
var CALLER_ = '';   // verified email of whoever made the current request
function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!Object.prototype.hasOwnProperty.call(API_, req.fn)) throw new Error('Unknown request.');
    CALLER_ = verifiedEmail_(req.token);
    var args = Array.isArray(req.args) ? req.args : [];
    out = { ok: true, result: API_[req.fn].apply(null, args) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Asks Google (Identity Toolkit) whether the Firebase ID token is genuine; returns its email. */
function verifiedEmail_(token) {
  if (typeof token !== 'string' || token.length < 100 || token.length > 4096) throw new Error('Please sign in again.');
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var hit = cache.get(key);
  if (hit) return hit;
  var res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(prop_('FIREBASE_API_KEY')), {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true
  });
  var u = res.getResponseCode() === 200 ? (JSON.parse(res.getContentText()).users || [])[0] : null;
  if (!u || !u.email) throw new Error('Your sign-in has expired. Please sign in again.');
  if (!u.emailVerified) throw new Error('Please sign in with Google.');
  var email = String(u.email).toLowerCase();
  // Remember the answer until shortly before the token expires (Firebase tokens last an hour).
  // Being on the team is still checked on every request, so removing someone takes effect at once.
  var exp = 0;
  try {
    var part = token.split('.')[1];
    exp = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(part + '==='.slice((part.length + 3) % 4))).getDataAsString()).exp || 0;
  } catch (x) {}
  var ttl = Math.min(21600, Math.floor(exp - Date.now() / 1000) - 60);
  if (ttl > 0) cache.put(key, email, ttl);
  return email;
}

/* ---------------- helpers ---------------- */
function prop_(k) {
  return PropertiesService.getScriptProperties().getProperty(k) || CONFIG[k] || '';
}
var SS_ = null;   // the Sheet, opened once per request (opening it is the slowest step)
function ss_() {
  if (SS_) return SS_;
  var id = prop_('SHEET_ID');
  if (!id || /PASTE/.test(id)) throw new Error('The dashboard is not connected to its Sheet yet: add SHEET_ID in Project Settings → Script properties.');
  return (SS_ = SpreadsheetApp.openById(id));
}
function tab_(name, cols) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh && cols) {
    sh = ss.insertSheet(name);
    sh.appendRow(cols);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, cols.length).setFontWeight('bold');
  }
  return sh;
}
function rows_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getValues(), head = v.shift();
  return v.map(function (r, i) {
    var o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = r[j] instanceof Date ? r[j].toISOString() : r[j]; });
    return o;
  });
}
/** The company account: the script's owner, which it runs as. */
function owner_() {
  return (Session.getEffectiveUser().getEmail() || '').toLowerCase();
}
function me_() {
  // A web request carries a verified email; running a function from the editor uses the owner.
  var owner = owner_();
  var email = CALLER_ || owner;
  if (!email) throw new Error('Please sign in with your Google account.');
  var team = team_();
  if (!team.length) {
    var sh = tab_(TABS.team, TEAM_COLS);
    // Empty team list: only the account that owns this script can become the first founder.
    if (email !== owner) throw new Error('The dashboard has no team yet. Open it first with ' + owner + '.');
    sh.appendRow([email, '', 'founder', true]);
    CacheService.getScriptCache().remove('team');
    return { email: email, name: '', role: 'founder', owner: true };
  }
  if (email === owner) {
    var row = team.filter(function (t) { return String(t.email).toLowerCase() === owner; })[0];
    return { email: email, name: (row && row.name) || '', role: 'founder', owner: true };
  }
  var m = team.filter(function (t) { return String(t.email).toLowerCase() === email && t.active !== false; })[0];
  if (!m) throw new Error('Your account (' + email + ') is not on the VenGuard team list. Ask ' + owner + ' to add you.');
  return { email: email, name: m.name || '', role: ROLES.indexOf(m.role) >= 0 ? m.role : 'marketing', owner: false };
}
/** Team tab, cached for 10 minutes; saveTeamMember clears the cache, so changes apply at once. */
function team_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('team');
  if (hit) return JSON.parse(hit);
  var team = rows_(tab_(TABS.team, TEAM_COLS));
  try { cache.put('team', JSON.stringify(team), 600); } catch (e) {}
  return team;
}
/** Only the newest rows of a long tab (the activity log grows forever). */
function lastRows_(sh, n) {
  if (!sh || sh.getLastRow() < 2) return [];
  var last = sh.getLastRow(), cols = sh.getLastColumn(), from = Math.max(2, last - n + 1);
  var head = sh.getRange(1, 1, 1, cols).getValues()[0];
  return sh.getRange(from, 1, last - from + 1, cols).getValues().map(function (r, i) {
    var o = { _row: from + i };
    head.forEach(function (h, j) { o[h] = r[j] instanceof Date ? r[j].toISOString() : r[j]; });
    return o;
  });
}
function need_(user, what) {
  if (CAN[what].indexOf(user.role) < 0) throw new Error('Your role (' + user.role + ') cannot do this.');
}
function log_(user, action, ref, detail) {
  tab_(TABS.activity, ACTIVITY_COLS).appendRow([new Date(), user.email, action, ref || '', detail || '']);
}
function settings_() {
  var o = {};
  rows_(tab_(TABS.settings, ['key', 'value'])).forEach(function (r) { o[r.key] = r.value; });
  return o;
}

/* ---------------- API used by Index.html ---------------- */
function getBootstrap() {
  var user = me_();
  var activity = lastRows_(tab_(TABS.activity, ACTIVITY_COLS), 200).reverse();
  return {
    user: user,
    leads: rows_(tab_(TABS.leads, LEAD_COLS)),
    dealers: rows_(tab_(TABS.dealers, DEALER_COLS)),
    settings: settings_(),
    team: user.role === 'founder' ? team_() : [],
    activity: activity,
    owner: owner_(),
    siteUrl: prop_('SITE_URL'),
    statuses: LEAD_STATUSES,
    generatedAt: new Date().toISOString()
  };
}

function updateLead(orderId, changes) {
  var user = me_(); need_(user, 'editLead');
  var sh = ss_().getSheetByName(TABS.leads);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var idCol = head.indexOf('order_id') + 1;
  var ids = sh.getRange(2, idCol, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  var row = 0;
  for (var i = ids.length - 1; i >= 0; i--) if (ids[i][0] === orderId) { row = i + 2; break; }
  if (!row) throw new Error('Order ' + orderId + ' was not found.');
  var allowed = ['status', 'team_notes', 'assigned_to'];
  var done = [];
  allowed.forEach(function (k) {
    if (changes[k] === undefined) return;
    if (k === 'status' && LEAD_STATUSES.indexOf(changes[k]) < 0) throw new Error('Unknown status.');
    var c = head.indexOf(k) + 1;
    if (!c) { c = head.length + 1; sh.getRange(1, c).setValue(k).setFontWeight('bold'); head.push(k); }
    sh.getRange(row, c).setValue(String(changes[k]).slice(0, 2000));
    done.push(k + (k === 'status' ? ' → ' + changes[k] : ''));
  });
  log_(user, 'lead_update', orderId, done.join(', '));
  return true;
}

/**
 * Records an order or enquiry that reached the team outside the website endpoint, e.g. a WhatsApp
 * or email message from the website's hand-off, a phone call or a walk-in. Keeps the website's
 * order number when there is one, so a message sent twice is caught.
 */
function addLead(d) {
  var user = me_(); need_(user, 'editLead');
  var name = String(d.name || '').trim(), phone = String(d.phone || '').replace(/[^\d+]/g, '');
  if (!name || phone.replace(/\D/g, '').length < 10) throw new Error('A name and a phone number are needed.');
  var type = FORM_TYPES.indexOf(d.form_type) >= 0 ? d.form_type : 'preorder';
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = tab_(TABS.leads, LEAD_COLS);
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var id = String(d.order_id || '').trim().toUpperCase();
    if (!/^VG-\d{6}-[A-Z0-9]{4}$/.test(id)) id = newOrderId_();
    var taken = rows_(sh).some(function (r) { return String(r.order_id).toUpperCase() === id; });
    if (taken) throw new Error('Order ' + id + ' is already in the list.');
    var v = {
      submitted_at: new Date(), order_id: id, form_type: type, status: 'new', name: name, phone: phone,
      heard_from: d.heard_from || 'whatsapp', referrer: 'added by team', team_notes: 'Added by ' + user.email
    };
    ['email', 'organisation', 'area', 'district', 'kitchen_type', 'business_type', 'units', 'cylinder_brand',
      'dealer_code', 'message', 'package'].forEach(function (k) { if (d[k]) v[k] = String(d[k]).trim().slice(0, 1000); });
    if (d.heard_from) v.heard_from = String(d.heard_from).slice(0, 40);
    // Phone as text keeps its leading 0; a cell that starts with = + - @ is stored as text, not a formula.
    sh.getRange(sh.getLastRow() + 1, head.indexOf('phone') + 1).setNumberFormat('@');
    sh.appendRow(head.map(function (h) {
      var x = v[h] === undefined ? '' : v[h];
      return typeof x === 'string' && /^[=+\-@]/.test(x) ? "'" + x : x;
    }));
    log_(user, 'lead_add', id, type + ' via ' + v.heard_from);
    return id;
  } finally { lock.releaseLock(); }
}
function newOrderId_() {
  var d = Utilities.formatDate(new Date(), 'Asia/Dhaka', 'yyMMdd'), abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
  for (var i = 0; i < 4; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return 'VG-' + d + '-' + s;
}

function saveDealer(d) {
  var user = me_(); need_(user, 'dealers');
  var code = String(d.code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
  if (!code) throw new Error('A dealer code is needed, e.g. DH-042.');
  var sh = tab_(TABS.dealers, DEALER_COLS);
  var existing = rows_(sh).filter(function (r) { return String(r.code).toUpperCase() === code; })[0];
  var values = DEALER_COLS.map(function (c) {
    if (c === 'code') return code;
    if (c === 'created_at') return existing ? existing.created_at : new Date();
    return d[c] === undefined ? (existing ? existing[c] : '') : String(d[c]).slice(0, 500);
  });
  if (existing) sh.getRange(existing._row, 1, 1, values.length).setValues([values]);
  else sh.appendRow(values);
  log_(user, existing ? 'dealer_update' : 'dealer_add', code, d.shop_name || '');
  return code;
}

function saveSettings(s) {
  var user = me_(); need_(user, 'settings');
  var sh = tab_(TABS.settings, ['key', 'value']);
  var keys = ['preorder_open', 'kit_price_bdt', 'deposit_bdt', 'notice_bn', 'notice_en'];
  var cur = rows_(sh);
  keys.forEach(function (k) {
    if (s[k] === undefined) return;
    var r = cur.filter(function (x) { return x.key === k; })[0];
    if (r) sh.getRange(r._row, 2).setValue(s[k]); else sh.appendRow([k, s[k]]);
  });
  log_(user, 'settings_update', '', JSON.stringify(s));
  return settings_();
}

function saveTeamMember(m) {
  var user = me_();
  if (!user.owner) throw new Error('Only ' + owner_() + ' can add or remove team members.');
  var email = String(m.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (email === owner_()) throw new Error('The company account always stays on the team as founder.');
  if (ROLES.indexOf(m.role) < 0) throw new Error('Choose a role.');
  var sh = tab_(TABS.team, TEAM_COLS);
  var r = rows_(sh).filter(function (x) { return String(x.email).toLowerCase() === email; })[0];
  var vals = [email, m.name || '', m.role, m.active !== false];
  if (r) sh.getRange(r._row, 1, 1, 4).setValues([vals]); else sh.appendRow(vals);
  // No Sheet sharing needed: the dashboard reads and writes the Sheet as the company account.
  CacheService.getScriptCache().remove('team');
  log_(user, 'team_update', email, m.role + (m.active === false ? ' (removed)' : ''));
  return rows_(sh);
}
