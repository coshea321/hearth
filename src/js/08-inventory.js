// ============================================================
// HOME INVENTORY (v424 as Appliances, widened v428) — the reference book
// for the things in the house: what model it is, when it was bought,
// whether it is still in warranty, where its manual lives, and — since
// v428 — what it would cost to replace, where the receipt is, and a link
// to the photos. Deliberately a RECORDS section, not a maintenance
// tracker: nothing here nags and nothing is alerted on — the warranty
// date is shown when you open the record and that is all it does (design
// confirmed 18/08/2026).
//
// v428 widened the SCOPE, not the storage: the store is still
// `fl4_appliances` and every internal name is still `appliance*`. That is
// deliberate — the key is wired through sync, tombstones, the backup
// payload and the search registry, and renaming it would be a migration
// risk for a label change. Only what Cathal reads says "inventory".
//
// The insurance job (design confirmed 19/08/2026) is: a room-by-room list
// with replacement values, totalled, that can leave the phone as a file.
// The AREA chips already are the room-by-room axis a loss adjuster asks
// for, so a bike and a sofa just get an area — there is deliberately no
// second category field. Photos are a LINK (OneDrive), never bytes:
// photos are the one thing in Hearth that threatens the localStorage
// budget, and a claim wants full-resolution ones anyway.
//
// Storage contract is the Plants/Watchlist one: one record is one
// edit unit, so whole-record newest-wins by `updated` with tombstone
// filtering, and no nested merge.
// ============================================================
function getAppliances() {
  var a = storeGet("fl4_appliances");
  if (!Array.isArray(a)) return [];
  // Null-guarded at the source (the v385 getRecipeBook / v388 normaliseNotes
  // lesson): a null from a bad write or a sync merge must never reach a
  // renderer, and fixing it here covers every caller at once.
  return a.filter(function(x){ return x && typeof x === "object"; });
}
function saveAppliances(a) {
  storeSet("fl4_appliances", a);
  pushPersonal();
  if (typeof isHouseholdSet === "function" && isHouseholdSet()) pushHousehold();
}

// Whole-record newest-wins by `updated`, tombstone-filtered. Returns
// {appliances, push} — push=true means our merged copy is fuller or newer
// than what arrived, so the caller re-pushes to converge (the same contract
// as mergePlantsData / mergeWatchData).
function mergeApplianceData(localA, incomingA, tombs) {
  tombs = tombs || {};
  var push = false;
  var incById = {};
  (incomingA || []).forEach(function(a){ if (a && a.id != null) incById[a.id] = a; });
  var localIds = {};
  var merged = (localA || []).filter(function(a){ return a && a.id != null; }).map(function(a){
    localIds[a.id] = true;
    var inc = incById[a.id];
    if (!inc) { push = true; return a; }                        // partner missing this → push
    var winner, loser;
    if ((inc.updated||0) > (a.updated||0)) { winner = inc; loser = a; }   // incoming newer → take it
    else {
      if ((a.updated||0) > (inc.updated||0)) push = true;       // local newer → push to converge
      winner = a; loser = inc;
    }
    // v296 lesson (the babySex incident class): a copy written by an older
    // build doesn't know about newer fields, so fill keys UNDEFINED on the
    // winner from the loser rather than letting them vanish. A field the user
    // deliberately cleared is "" (defined) and stays cleared.
    Object.keys(loser).forEach(function(k){ if (winner[k] === undefined) winner[k] = loser[k]; });
    return winner;
  });
  var fresh = (incomingA || []).filter(function(a){ return a && a.id != null && !localIds[a.id]; });
  var full = fresh.concat(merged);
  var pre = full.length;
  full = full.filter(function(a){ return !(tombs[a.id] && tombs[a.id] >= (a.updated||0)); });
  if (full.length < pre) push = true;
  return { appliances: full, push: push };
}

// ── Areas ─────────────────────────────────────────────────────────────────
// The same idea as the Plants area filter (v379), and deliberately the same
// code: `plantAreaKey` is a plain string normaliser and `plantAreas` is a
// pure list→labels helper that reads `.room`, so appliances map onto it
// rather than growing a second copy of its commonest-spelling tie-break.
// `PLANT_AREA_NONE` is reused as the "no area" sentinel for the same reason.
function applianceAreas(list) {
  return plantAreas((list || []).map(function(a){ return { room: a && a.area }; }));
}
function appliancesInArea(list, area) {
  var all = (list || []).filter(function(a){ return !!a; });
  if (!area) return all;
  if (area === PLANT_AREA_NONE) return all.filter(function(a){ return !plantAreaKey(a.area); });
  var k = plantAreaKey(area);
  return all.filter(function(a){ return plantAreaKey(a.area) === k; });
}

// ── Dates + warranty ──────────────────────────────────────────────────────
// Both dates are stored as the browser's own "YYYY-MM-DD" input value and
// COMPARED AS STRINGS, never parsed into a Date: a date-only string parsed as
// UTC and read back in local time is exactly how off-by-one-day bugs start,
// and YYYY-MM-DD already sorts correctly as text.
function applianceDateLabel(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso == null ? "" : iso).trim());
  return m ? (listDate(m[0]) || m[0]) : ""; // v498: one list date format (was DD/MM/YYYY)
}
function applianceTodayISO() {
  var d = new Date(), p = function(x){ return x < 10 ? "0" + x : x; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
// {state, text}. state is "none" (no date set / unparseable), "in" or "out".
// Shown on the detail view only — never a badge, never a Home line, never a
// notification. An expiring warranty isn't something you can act on, so a
// nudge would be noise (design confirmed 18/08/2026; do not add one without
// a fresh request).
function applianceWarranty(rec) {
  var iso = String((rec && rec.warranty) || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { state:"none", text:"" };
  if (iso >= applianceTodayISO()) return { state:"in",  text:"In warranty until " + applianceDateLabel(iso) };
  return { state:"out", text:"Warranty ended " + applianceDateLabel(iso) };
}

// ── Replacement value (v428) ──────────────────────────────────────────────
// Stored as a NUMBER of euro, or absent when it was never filled in — the one
// field an insurance list needs that a reference book doesn't. Absent and 0
// are deliberately different states: 0 is a thing he decided is worth nothing,
// absent is a thing he hasn't valued yet, and only the absent ones are worth
// chasing. `applianceValueNum` returns null for absent so a total can tell
// them apart; every caller that wants a number treats null as "skip".
function applianceValueNum(rec) {
  var v = rec && rec.value;
  if (v === undefined || v === null || v === "") return null;
  var n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}
// Parses what he TYPED, so "1,250", "€1250" and "1250.00" all land as 1250.
// Returns null when the box is empty (field cleared) and false when there is
// text in it that isn't a number (so the editor can refuse rather than store
// a silent 0 — a wrong value on an insurance list is worse than a blank one).
function applianceParseValue(raw) {
  var t = String(raw == null ? "" : raw).trim();
  if (!t) return null;
  if (!/^[€\s]*[0-9][0-9,\s]*(\.[0-9]{1,2})?$/.test(t)) return false;
  var n = parseFloat(t.replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n < 0) return false;
  return Math.round(n * 100) / 100;
}
// Euro, thousands-separated, and whole euro unless the cents are real — a
// claim list reads as "€1,250", not "€1,250.00".
function applianceMoney(n) {
  if (n == null || !isFinite(n)) return "";
  var neg = n < 0; n = Math.abs(n);
  var cents = Math.round(n * 100) % 100;
  var whole = Math.floor(Math.round(n * 100) / 100);
  var w = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + "\u20AC" + w + (cents ? "." + (cents < 10 ? "0" : "") + cents : "");
}
// What the editor box shows: the stored number, plain, with no euro sign or
// separators so it reads straight back through applianceParseValue. An
// unvalued record opens with an empty box, never "0".
function applianceValueEditText(rec) {
  var n = applianceValueNum(rec);
  return n == null ? "" : String(n);
}
// {total, valued, missing} over a list. `missing` is what makes the summary
// honest: a total is meaningless without knowing how many records aren't in it.
function applianceValueSummary(list) {
  var total = 0, valued = 0, missing = 0;
  (list || []).forEach(function(a){
    var n = applianceValueNum(a);
    if (n == null) { missing++; return; }
    total += n; valued++;
  });
  return { total: Math.round(total * 100) / 100, valued: valued, missing: missing };
}

// Everything worth searching for, including the numbers you'd never remember
// — the model and serial are the whole reason this section exists, so global
// search has to reach them (not just name + notes like a list item). `receipt`
// joined in v428: "Currys order 88214" is exactly the kind of thing you search
// for and never remember which machine it belongs to. `fd` (v431) is the same
// idea — the factory-date code on Bosch/Siemens rating plates.
function applianceSearchText(a) {
  if (!a) return "";
  return [a.name, a.brand, a.model, a.serial, a.fd, a.area, a.boughtFrom, a.receipt, a.notes]
    .map(function(v){ return v == null ? "" : String(v); }).join(" ").toLowerCase();
}

// Clipboard with an execCommand fallback — writeText needs a user gesture and
// a secure context, and neither is guaranteed on every browser he opens this
// in. Same shape as plantCopyPrompt, but takes its text and message so it can
// serve a one-field copy.
function copyToClipboard(text, okMsg) {
  text = String(text == null ? "" : text);
  okMsg = okMsg || "&#x1F4CB; Copied";
  function fallback() {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      toast(ok ? okMsg : "Couldn't copy &mdash; select it by hand");
    } catch (e) { toast("Couldn't copy &mdash; select it by hand"); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function(){ toast(okMsg); }, fallback);
  } else { fallback(); }
}

// The two link fields are the only ones that become a tappable href, so they
// get their own gate rather than trusting normalizeRecipeUrl alone: that helper
// prefixes anything schemeless with https://, which turns "javascript:alert(1)"
// into a harmless-but-silly "https://javascript:alert(1)" rather than refusing
// it. Checked HERE as well as on save, because a record can arrive from sync or
// a restored backup written by anything. v428 split the gate out of
// applianceManualUrl so the photos link goes through exactly the same one —
// two copies of a security check is how one of them drifts.
// v483: it is now the render gate for EVERY stored link — watchlist and
// list-item links (allowContact: their editors have always accepted
// mailto:/tel: as well, confirmed 25/09/2026) and the recipe source URL.
// Widen it here with a flag; never write a second gate beside it.
function applianceLinkUrl(raw, allowContact) {
  raw = String(raw == null ? "" : raw).trim();
  if (!raw) return "";
  if (allowContact && /^(mailto|tel):/i.test(raw)) return raw;
  // Anything carrying its own scheme must be http(s). The (?!\d) is what keeps
  // "example.com:8080/manual" out of that branch — a bare host:port is a valid
  // link, and "example.com" is a syntactically valid scheme name, so the port
  // digits are the only thing that tells the two apart.
  if (/^[a-z][a-z0-9+.\-]*:(?!\d)/i.test(raw) && !/^https?:\/\//i.test(raw)) return "";
  var u = normalizeRecipeUrl(raw);
  return /^https?:\/\//i.test(u) ? u : "";
}
function applianceManualUrl(rec) { return applianceLinkUrl(rec && rec.manual); }
// v428: the photos live in OneDrive, not in localStorage — this is a link to a
// shared folder, and the app deliberately never holds the images themselves.
function appliancePhotosUrl(rec) { return applianceLinkUrl(rec && rec.photos); }

// ── The inventory file (v428, `inventory-v1`) ─────────────────────────────
// The insurance argument for this section is only as good as the data's
// ability to LEAVE the phone: a list that only exists on the device that
// burned/was stolen is not evidence. The whole-app backup already carries
// these records, but it is a whole-app blob — this is the one file you can
// email to yourself, drop in OneDrive beside the photos, or hand to a broker.
//
// Shaped on the Plants `plant-v1` file (v378) and it reuses that file's
// download helper rather than growing a second copy of the same six lines.
// Deliberately NOT in the file: `id` (regenerated on import, so a file can
// never overwrite the wrong record), `updated` (set to now), `addedBy`/`added`
// (whose phone typed it is not inventory information).
//
// IMPORT IS ADD-ONLY, BY DESIGN. Every entry lands as a NEW record and
// nothing already in the section is touched or replaced. That is the whole
// safety story: the worst a bad paste can do here is give you duplicates you
// can delete, never a silently overwritten valuation. Do NOT "improve" this
// into a match-by-name update without a fresh design call.
var INVENTORY_FILE_TAG = "inventory-v1";
var INVENTORY_TEXT_MAX = 2000;   // per field; a runaway paste must not eat localStorage

function inventoryCleanText(v, max) {
  if (typeof v === "number") v = String(v);
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max || INVENTORY_TEXT_MAX);
}
// A date is only carried when it is the exact YYYY-MM-DD the date inputs
// produce — anything else is dropped rather than stored as a string the
// warranty read would silently treat as "no date".
function inventoryCleanDate(v) {
  var t = inventoryCleanText(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
}

function inventoryExportObj(a) {
  var val = applianceValueNum(a);
  return {
    name:       a.name       || "",
    area:       a.area       || "",
    brand:      a.brand      || "",
    model:      a.model      || "",
    serial:     a.serial     || "",
    fd:         a.fd         || "",
    bought:     a.bought     || "",
    warranty:   a.warranty   || "",
    boughtFrom: a.boughtFrom || "",
    value:      val,                    // null = never valued, and stays null
    receipt:    a.receipt    || "",
    manual:     a.manual     || "",
    photos:     a.photos     || "",
    notes:      a.notes      || ""
  };
}

// {items} or {error}. Same tolerance as parsePlantFile: a bare array, a single
// object, or the tagged wrapper all parse, because a file that round-trips
// through a chat or a text editor loses its wrapper often enough to matter.
function parseInventoryFile(raw) {
  var obj;
  try { obj = JSON.parse(raw); } catch (e) { return { error: "Couldn't read that as JSON \u2014 check the paste and try again." }; }
  if (!obj || typeof obj !== "object") return { error: "That isn't a Hearth inventory file." };
  var list;
  if (Array.isArray(obj)) list = obj;
  else if (Array.isArray(obj.items)) list = obj.items;
  else if (obj.name) list = [obj];
  else return { error: "No items found \u2014 the file needs an \"items\" list." };
  if (obj.hearth && obj.hearth !== INVENTORY_FILE_TAG) return { error: "That's a Hearth " + esc(String(obj.hearth)) + " file, not an inventory one." };
  list = list.filter(function(x){ return x && typeof x === "object"; });
  if (!list.length) return { error: "No items found in that file." };
  if (list.some(function(x){ return !inventoryCleanText(x.name, 80); })) return { error: "Every item needs a \"name\"." };
  return { items: list };
}

// One file entry -> one brand-new record. Value comes through
// applianceParseValue so a file written by hand with "1,250" or "\u20AC1250" is
// read the same way the editor reads it, and junk lands as unvalued rather
// than as a wrong number.
function inventoryRecordFrom(src, id) {
  var v = applianceParseValue(src.value);
  var rec = {
    id: id,
    name:       inventoryCleanText(src.name, 80),
    area:       inventoryCleanText(src.area, 120),
    brand:      inventoryCleanText(src.brand, 120),
    model:      inventoryCleanText(src.model, 120),
    serial:     inventoryCleanText(src.serial, 120),
    fd:         inventoryCleanText(src.fd, 120),
    bought:     inventoryCleanDate(src.bought),
    warranty:   inventoryCleanDate(src.warranty),
    boughtFrom: inventoryCleanText(src.boughtFrom, 200),
    receipt:    inventoryCleanText(src.receipt, 300),
    manual:     applianceLinkUrl(src.manual),
    photos:     applianceLinkUrl(src.photos),
    notes:      inventoryCleanText(src.notes),
    addedBy:    hearthUser,
    added:      Date.now(),
    updated:    Date.now()
  };
  // "" not a missing key: an absent field is refilled from the other side by
  // mergeApplianceData's v296 fill, so an unvalued record has to be DEFINED.
  rec.value = (v === null || v === false) ? "" : v;
  return rec;
}
// Returns the number added; 0 for an empty list.
function importInventoryAsNew(list) {
  var all = getAppliances();
  var now = Date.now(), added = 0;
  (list || []).forEach(function(src, i){
    all.unshift(inventoryRecordFrom(src, now + i * 1000 + Math.floor(Math.random() * 1000)));
    added++;
  });
  if (!added) return 0;
  saveAppliances(all);
  return added;
}

function applianceDelete(id) {
  var all = getAppliances();
  var i = all.findIndex(function(a){ return a && a.id === id; });
  if (i < 0) return;                                   // -1 guard (CLAUDE.md)
  var name = String(all[i].name || "this");
  confirmDialog("Remove &ldquo;" + esc(name) + "&rdquo;?", function(){
    var cur = getAppliances();
    var j = cur.findIndex(function(a){ return a && a.id === id; });
    if (j < 0) return;
    cur.splice(j, 1);
    addTomb("appliances", id);
    saveAppliances(cur);
    _applView = "list"; _applOpenId = null;
    renderAppliances(); window.scrollTo(0, 0);
    toast("Removed");
  });
}

// ── Appliances UI ─────────────────────────────────────────────────────────
var APPL_COLOR = "#3E5C6B";
var _applView    = "list";   // "list" | "detail" | "editor"
var _applOpenId  = null;
var _applEditId  = null;
var _applArea    = "";       // session-only area filter, never stored (the v379 rule)
var _applEditing = false;
var _applCancelFn = null;    // back-button discard closure (v345 pattern), nulled on every exit path
var _applImportParsed = null;// v428: parsed inventory-file entries; null = still on the paste step

function applianceCardHTML(a) {
  var area = String(a.area || "").trim();
  var bits = [];
  if (area) bits.push(esc(area));
  if (a.brand) bits.push(esc(String(a.brand)));
  if (a.model) bits.push(esc(String(a.model)));
  // v428: the value sits in its own column rather than joining the grey line —
  // a list you are totting up for a claim wants the figures aligned down the
  // right, and an unvalued record shows nothing rather than a misleading 0.
  var val = applianceValueNum(a);
  return "<div class='appl-card' data-aid='" + esc(a.id) + "' style='display:flex;align-items:center;gap:10px;background:#fff;border-radius:12px;padding:13px 14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(20,40,50,.08);cursor:pointer;touch-action:manipulation'>" +
    "<div style='flex:1;min-width:0'>" +
      "<div style='font-size:15px;font-weight:700;color:#2A2010;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" + esc(a.name || "(unnamed)") + "</div>" +
      (bits.length ? "<div style='font-size:13px;color:#7A8A94;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" + bits.join(" &middot; ") + "</div>" : "") +
    "</div>" +
    (val == null ? "" : "<span style='flex-shrink:0;font-size:14px;font-weight:700;color:" + APPL_COLOR + "'>" + esc(applianceMoney(val)) + "</span>") +
    "<span style='color:#B8C4CC;font-size:18px'>&#x203A;</span>" +
  "</div>";
}

// ── The totals card (v428) ────────────────────────────────────────────────
// The number an insurer asks for and nobody has. It totals WHAT IS ON SCREEN,
// so picking an area chip gives you that room's total — which is the shape a
// room-by-room claim is actually made in. It always says how many records are
// NOT in the total: a sum that quietly ignores half the house is worse than no
// sum at all, because it looks authoritative.
function inventorySummaryHTML(shown, area) {
  if (!shown || !shown.length) return "";
  var sum = applianceValueSummary(shown);
  var where = !area ? "Everything" : (area === PLANT_AREA_NONE ? "No area" : String(area));
  var count = shown.length + " item" + (shown.length === 1 ? "" : "s");
  if (!sum.valued) {
    return "<div style='background:#F4F7F8;border:1px solid #E2EAEE;border-radius:12px;padding:11px 13px;margin-bottom:10px;font-size:13px;color:#5A6A74;line-height:1.55'>" +
      "<b>" + esc(where) + "</b> &middot; " + count +
      "<div style='margin-top:3px'>Add what each one would cost to replace and the total for an insurance claim adds up here.</div></div>";
  }
  return "<div style='background:" + APPL_COLOR + ";color:#fff;border-radius:12px;padding:12px 14px;margin-bottom:10px'>" +
    "<div style='display:flex;align-items:baseline;gap:8px'>" +
      "<span style='flex:1;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.85'>" + esc(where) + "</span>" +
      "<span style='font-size:20px;font-weight:800'>" + esc(applianceMoney(sum.total)) + "</span>" +
    "</div>" +
    "<div style='font-size:12px;opacity:.85;margin-top:3px'>" + count + " &middot; " + sum.valued + " valued" +
      (sum.missing ? " &middot; " + sum.missing + " not valued yet" : "") + "</div>" +
  "</div>";
}

// Export/import row. `withExport` is false in the empty state — there is
// nothing to export from an empty section, but there is every reason to import.
function inventoryFileButtonsHTML(withExport) {
  var btn = "width:100%;padding:12px;border:1.5px solid #D8E0E4;background:#fff;color:#5A6A74;border-radius:10px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;margin-top:8px;touch-action:manipulation";
  return (withExport ? "<button id='invExport' style='" + btn + "'>&#x1F4E4; Export the inventory (JSON)</button>" : "") +
    "<button id='invImport' style='" + btn + "'>&#x1F4E5; Import an inventory file</button>" +
    "<div style='font-size:12px;color:#A8B2B8;margin-top:7px;line-height:1.55;text-align:center'>Keep the exported file somewhere off this phone &mdash; that is the copy an insurance claim is made from.</div>";
}

function inventoryWireFileButtons(el) {
  var ex = el.querySelector("#invExport");
  if (ex) ex.addEventListener("click", function(){
    var all = getAppliances();
    if (!all.length) { toast("Nothing to export yet"); return; }
    // Reuses the Plants v378 download helper rather than a second copy of it.
    plantDownloadJSON({ hearth: INVENTORY_FILE_TAG, exported: new Date().toISOString().slice(0, 10),
      items: all.map(inventoryExportObj) }, "hearth-home-inventory.json");
    toast("&#x1F4E4; " + all.length + " item" + (all.length === 1 ? "" : "s") + " exported");
  });
  var im = el.querySelector("#invImport");
  if (im) im.addEventListener("click", function(){
    _applImportParsed = null;
    _applView = "import";
    renderAppliances();
    window.scrollTo(0, 0);
  });
}

// ── Import screen (v428) ──────────────────────────────────────────────────
// Two steps, the plant-import shape: paste, then confirm what was found. The
// confirm step exists because import is add-only — the thing a person needs to
// see before tapping is HOW MANY records are about to appear, so a file pasted
// twice is caught by the reader rather than by the section afterwards.
function renderInventoryImport() {
  var el = document.getElementById("appliancesContent");
  if (!el) return;
  function leave() {
    _applImportParsed = null;
    _applView = "list"; _applOpenId = null;
    renderAppliances(); window.scrollTo(0, 0);
  }
  _applCancelFn = leave;

  if (!_applImportParsed) {
    el.innerHTML =
      "<button id='invImpCancel' style='border:none;background:none;color:" + APPL_COLOR + ";font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px;touch-action:manipulation'>&larr; Cancel</button>" +
      "<div style='font-size:22px;font-weight:800;color:#2A2010;margin-bottom:10px'>Import an inventory file</div>" +
      "<div style='font-size:13px;color:#5A6A74;background:#F4F7F8;border:1px solid #E2EAEE;border-radius:10px;padding:12px 14px;margin-bottom:12px;line-height:1.65'>" +
        "Paste the contents of a <b>hearth-home-inventory.json</b> file below. Everything in it is added as new items &mdash; nothing already here is changed or replaced." +
      "</div>" +
      "<textarea id='invImpJson' rows='8' placeholder='Paste the file contents here&hellip;' style='" + recipeInputCss() + "margin-bottom:14px;resize:vertical;line-height:1.5;font-size:12px;font-family:monospace'></textarea>" +
      "<button id='invImpGo' style='width:100%;padding:13px;border:none;background:" + APPL_COLOR + ";color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation'>Next &rsaquo;</button>";
    document.getElementById("invImpCancel").addEventListener("click", leave);
    document.getElementById("invImpGo").addEventListener("click", function(){
      var raw = stripPasteFence(document.getElementById("invImpJson").value);
      if (!raw) { toast("Paste the file first"); return; }
      var parsed = parseInventoryFile(raw);
      if (parsed.error) { toast(parsed.error); return; }
      _applImportParsed = parsed.items;
      renderInventoryImport();
      window.scrollTo(0, 0);
    });
    return;
  }

  var list = _applImportParsed;
  var names = list.map(function(x){ return inventoryCleanText(x.name, 80); });
  var totalSum = applianceValueSummary(list.map(function(x){
    var v = applianceParseValue(x.value);
    return (v === null || v === false) ? {} : { value: v };
  }));
  el.innerHTML =
    "<button id='invImpBack' style='border:none;background:none;color:" + APPL_COLOR + ";font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px;touch-action:manipulation'>&larr; Back</button>" +
    "<div style='font-size:22px;font-weight:800;color:#2A2010;margin-bottom:10px'>Import an inventory file</div>" +
    "<div style='background:#F4F7F8;border:1px solid #E2EAEE;border-radius:10px;padding:12px 14px;margin-bottom:14px'>" +
      "<div style='font-size:15px;font-weight:700;color:#2A2010;margin-bottom:4px'>" + list.length + " item" + (list.length === 1 ? "" : "s") + " in this file" +
        (totalSum.valued ? " &middot; " + esc(applianceMoney(totalSum.total)) : "") + "</div>" +
      "<div style='font-size:12px;color:#5A6A74;line-height:1.6'>" + esc(names.join(", ")) + "</div>" +
    "</div>" +
    "<button id='invImpAdd' style='width:100%;padding:13px;border:none;background:" + APPL_COLOR + ";color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation'>Add " +
      (list.length === 1 ? "it" : "all " + list.length) + " as new items</button>" +
    "<div style='font-size:12px;color:#A8B2B8;margin-top:8px;line-height:1.55;text-align:center'>Importing the same file twice gives you two copies of everything &mdash; it never updates what is already here.</div>";
  document.getElementById("invImpBack").addEventListener("click", function(){
    _applImportParsed = null; renderInventoryImport(); window.scrollTo(0, 0);
  });
  document.getElementById("invImpAdd").addEventListener("click", function(){
    var n = importInventoryAsNew(list);
    _applImportParsed = null;
    _applView = "list"; _applOpenId = null; _applArea = "";
    renderAppliances(); window.scrollTo(0, 0);
    toast(n ? ("Added " + n + " item" + (n === 1 ? "" : "s")) : "Nothing to add");
  });
}

function renderAppliances() {
  _applEditing = false;
  _applCancelFn = null;
  if (_applView === "editor") { renderApplianceEditor(); return; }
  if (_applView === "import") { renderInventoryImport(); return; }
  if (_applView === "detail" && _applOpenId != null) { renderApplianceDetail(); return; }
  _applView = "list";
  var el = document.getElementById("appliancesContent");
  if (!el) return;

  var all = getAppliances().slice().sort(function(a, b){
    return String((a && a.name) || "").localeCompare(String((b && b.name) || ""));
  });
  if (!all.length) {
    el.innerHTML = "<div style='text-align:center;color:#7A8A94;padding:40px 20px'>" +
      "<div style='font-size:40px;margin-bottom:10px'>&#x1F4E6;</div>" +
      "<div style='font-size:16px;font-weight:600;margin-bottom:4px;color:#2A2010'>Nothing saved yet</div>" +
      "<div style='font-size:13px'>Tap + to save something &mdash; what it is and where, its model and serial number, what it would cost to replace, and where the receipt and photos are.</div></div>" +
      // The import button belongs in the empty state too: a phone that lost
      // everything is exactly the phone with an inventory file to restore.
      inventoryFileButtonsHTML(false);
    inventoryWireFileButtons(el);
    return;
  }

  // Area filter, exactly the v379 Plants shape: the row only earns its space
  // when there's a real choice to make, and a chosen area that has vanished
  // (retagged, deleted, or dropped by a sync from the other phone) falls back
  // to All rather than showing an empty list with no explanation.
  var areas = applianceAreas(all);
  var untagged = appliancesInArea(all, PLANT_AREA_NONE).length;
  var showChips = (areas.length + ((untagged && areas.length) ? 1 : 0)) >= 2;
  if (!showChips) _applArea = "";
  if (_applArea && _applArea !== PLANT_AREA_NONE &&
      !areas.some(function(a){ return plantAreaKey(a) === plantAreaKey(_applArea); })) _applArea = "";
  if (_applArea === PLANT_AREA_NONE && !untagged) _applArea = "";
  var shown = appliancesInArea(all, _applArea);

  var html = "";
  if (showChips) {
    html += "<div class='chip-scroll' style='display:flex;gap:7px;overflow-x:auto;padding:1px 24px 10px 1px;-webkit-overflow-scrolling:touch'>";
    var chips = [{ kind:"all", v:"", t:"All" }];
    areas.forEach(function(a){ chips.push({ kind:"area", v:a, t:a }); });
    if (untagged) chips.push({ kind:"none", v:"", t:"No area" });
    chips.forEach(function(c){
      var on = c.kind === "all"  ? !_applArea
             : c.kind === "none" ? _applArea === PLANT_AREA_NONE
             : plantAreaKey(c.v) === plantAreaKey(_applArea);
      html += "<button class='appl-area-chip' data-kind='" + esc(c.kind) + "' data-area='" + esc(c.v) + "' " +
        "style='flex-shrink:0;border-radius:20px;padding:7px 13px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;touch-action:manipulation;" +
        (on ? "background:" + APPL_COLOR + ";color:#fff;border:1.5px solid " + APPL_COLOR
            : "background:#fff;color:#5A6A74;border:1.5px solid #D8E0E4") + "'>" + esc(c.t) + "</button>";
    });
    html += "</div>";
  }

  html += inventorySummaryHTML(shown, _applArea);

  if (!shown.length) {
    html += "<div style='text-align:center;color:#7A8A94;padding:30px 20px;font-size:13px'>" +
      (_applArea ? "No inventory records in " + esc(_applArea) + "." : "No inventory records match this filter.") +
      "<br><span style='display:inline-block;margin-top:5px'>Choose another area above.</span></div>";
  }
  shown.forEach(function(a){ html += applianceCardHTML(a); });
  html += inventoryFileButtonsHTML(true);
  el.innerHTML = html;
  inventoryWireFileButtons(el);

  el.querySelectorAll(".appl-card").forEach(function(card){
    card.addEventListener("click", function(){
      _applOpenId = +card.dataset.aid;
      _applView = "detail";
      renderApplianceDetail();
      window.scrollTo(0, 0);
    });
  });
  el.querySelectorAll(".appl-area-chip").forEach(function(chip){
    chip.addEventListener("click", function(){
      var k = chip.dataset.kind;
      _applArea = k === "all" ? "" : (k === "none" ? PLANT_AREA_NONE : (chip.dataset.area || ""));
      renderAppliances();
    });
  });
}

// One label/value row. `copy` makes the whole row a copy button — the moment
// this section exists for is standing at the machine typing its model number
// into a parts site or reading the serial down the phone, and re-typing a
// 17-character code off a screen is exactly what we're trying to avoid.
function applianceRowHTML(label, value, copy) {
  var v = String(value == null ? "" : value).trim();
  if (!v) return "";
  return "<div class='appl-row" + (copy ? " appl-copy" : "") + "'" +
    (copy ? " data-copy='" + esc(v) + "' data-label='" + esc(label) + "' role='button' tabindex='0' aria-label='Copy " + esc(label) + "'" : "") +
    " style='background:#fff;border-radius:11px;padding:11px 13px;margin-bottom:7px;box-shadow:0 1px 4px rgba(20,40,50,.07)" + (copy ? ";cursor:pointer;touch-action:manipulation" : "") + "'>" +
    "<div style='font-size:11px;font-weight:700;color:#8A98A2;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px'>" + esc(label) + "</div>" +
    "<div style='display:flex;align-items:center;gap:10px'>" +
      "<span style='flex:1;font-size:15px;color:#2A2010;word-break:break-word'>" + esc(v) + "</span>" +
      (copy ? "<span style='font-size:12px;font-weight:700;color:" + APPL_COLOR + ";white-space:nowrap'>&#x1F4CB; Copy</span>" : "") +
    "</div></div>";
}

function renderApplianceDetail() {
  var el = document.getElementById("appliancesContent");
  if (!el) return;
  var all = getAppliances();
  var i = all.findIndex(function(a){ return a && a.id === _applOpenId; });
  // Deleted on the other phone while we were looking at it — fall back to the
  // list rather than rendering a blank detail view.
  if (i < 0) { _applView = "list"; _applOpenId = null; renderAppliances(); return; }
  var rec = all[i];
  var war = applianceWarranty(rec);
  var manual = applianceManualUrl(rec);
  var photos = appliancePhotosUrl(rec);

  var html = "<button id='applBack' style='border:none;background:none;color:" + APPL_COLOR + ";font-family:inherit;font-size:14px;font-weight:700;padding:0 0 10px;cursor:pointer;touch-action:manipulation'>&#x2039; All items</button>" +
    "<div style='font-size:22px;font-weight:800;color:#2A2010;line-height:1.25'>" + esc(rec.name || "(unnamed)") + "</div>";
  var area = String(rec.area || "").trim();
  if (area) html += "<div style='font-size:13px;color:#7A8A94;margin-top:3px'>" + esc(area) + "</div>";
  html += "<div style='height:14px'></div>";

  html += applianceRowHTML("Brand", rec.brand, false);
  html += applianceRowHTML("Model", rec.model, true);
  html += applianceRowHTML("Serial number", rec.serial, true);
  html += applianceRowHTML("FD number", rec.fd, true);
  html += applianceRowHTML("Bought", applianceDateLabel(rec.bought), false);
  html += applianceRowHTML("Bought from", rec.boughtFrom, false);
  // v428 — the insurance cluster: what it would cost to replace, and where the
  // proof of purchase is. Both sit with the buying details rather than at the
  // top, because the model/serial rows are still what this section is opened for.
  var val = applianceValueNum(rec);
  if (val != null) html += applianceRowHTML("Replacement value", applianceMoney(val), false);
  html += applianceRowHTML("Receipt", rec.receipt, false);
  if (war.state !== "none") {
    html += "<div style='background:" + (war.state === "in" ? "#E8F2E8" : "#F2EFE8") + ";color:" +
      (war.state === "in" ? "#2E6B3F" : "#7A6A50") + ";border-radius:11px;padding:11px 13px;margin-bottom:7px;font-size:14px;font-weight:700'>" +
      (war.state === "in" ? "&#x1F6E1;&#xFE0F; " : "") + esc(war.text) + "</div>";
  }
  var linkCss = "display:flex;align-items:center;gap:10px;background:#fff;border-radius:11px;padding:12px 13px;margin-bottom:7px;box-shadow:0 1px 4px rgba(20,40,50,.07);text-decoration:none;color:" + APPL_COLOR + ";font-size:14px;font-weight:700;touch-action:manipulation";
  if (manual) {
    html += "<a href='" + esc(manual) + "' target='_blank' rel='noopener noreferrer' style='" + linkCss + "'>" +
      "<span style='flex:1'>&#x1F4D6; Open the manual</span><span style='font-size:16px'>&#x2197;</span></a>";
  }
  if (photos) {
    html += "<a href='" + esc(photos) + "' target='_blank' rel='noopener noreferrer' style='" + linkCss + "'>" +
      "<span style='flex:1'>&#x1F4F7; Photos &amp; receipt</span><span style='font-size:16px'>&#x2197;</span></a>";
  }
  if (String(rec.notes || "").trim()) {
    html += "<div style='background:#fff;border-radius:11px;padding:11px 13px;margin-bottom:7px;box-shadow:0 1px 4px rgba(20,40,50,.07)'>" +
      "<div style='font-size:11px;font-weight:700;color:#8A98A2;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px'>Notes</div>" +
      "<div style='font-size:15px;color:#2A2010;line-height:1.55'>" + escNl(rec.notes) + "</div></div>";
  }

  html += "<div style='display:flex;gap:8px;margin-top:16px'>" +
      "<button id='applEditBtn' style='flex:2;padding:13px;border:none;background:" + APPL_COLOR + ";color:#fff;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>Edit</button>" +
      "<button id='applDelBtn' style='flex:1;padding:13px;border:1.5px solid #E4C8C8;background:#fff;color:#B03030;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation'>Delete</button>" +
    "</div>";
  el.innerHTML = html;

  document.getElementById("applBack").addEventListener("click", function(){
    _applView = "list"; _applOpenId = null; renderAppliances(); window.scrollTo(0, 0);
  });
  document.getElementById("applEditBtn").addEventListener("click", function(){ openApplianceEditor(rec.id); });
  document.getElementById("applDelBtn").addEventListener("click", function(){ applianceDelete(rec.id); });
  el.querySelectorAll(".appl-copy").forEach(function(row){
    row.addEventListener("click", function(){
      copyToClipboard(row.dataset.copy || "", "&#x1F4CB; " + esc(row.dataset.label || "Value") + " copied");
    });
  });
}

function openApplianceEditor(id) {
  _applEditId = (id == null) ? null : id;
  _applImportParsed = null;      // opening the editor abandons any half-finished import
  _applView = "editor";
  renderApplianceEditor();
  window.scrollTo(0, 0);
}

function renderApplianceEditor() {
  var el = document.getElementById("appliancesContent");
  if (!el) return;
  var rec = null;
  if (_applEditId != null) {
    var all = getAppliances();
    var i = all.findIndex(function(a){ return a && a.id === _applEditId; });
    // Removed on the other phone while this editor was open — fall back to the
    // list rather than silently saving a resurrected copy.
    if (i < 0) { _applView = "list"; _applEditId = null; _applOpenId = null; renderAppliances(); return; }
    rec = all[i];
  }
  _applEditing = true;

  function leave() {
    _applEditing = false; _applCancelFn = null;
    _applView = (_applEditId != null) ? "detail" : "list";
    _applOpenId = (_applEditId != null) ? _applEditId : null;
    _applEditId = null;
    renderAppliances(); window.scrollTo(0, 0);
  }
  _applCancelFn = leave;

  var lbl = "font-size:11px;font-weight:700;color:#8A98A2;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px";
  var inp = "width:100%;box-sizing:border-box;padding:11px;border:1.5px solid #D8E0E4;border-radius:9px;font-family:inherit;font-size:15px;background:#fff;color:#2A2010";
  var opt = "<span style='text-transform:none;font-weight:600;color:#A8B2B8'>(optional)</span>";
  // Areas already in use, offered as suggestions — the same trick the Plants
  // editor uses, so "Kitchen" gets typed once and re-picked after that.
  var areaOpts = applianceAreas(getAppliances()).map(function(a){ return "<option value='" + esc(a) + "'></option>"; }).join("");

  el.innerHTML =
    "<div style='" + lbl + "'>What is it</div>" +
    "<input id='apEdName' type='text' placeholder='e.g. Dishwasher' style='" + inp + "' value='" + esc((rec && rec.name) || "") + "'>" +
    "<div style='" + lbl + ";margin-top:14px'>Area " + opt + "</div>" +
    "<input id='apEdArea' type='text' list='apEdAreaList' placeholder='e.g. Kitchen' style='" + inp + "' value='" + esc((rec && rec.area) || "") + "'>" +
    "<datalist id='apEdAreaList'>" + areaOpts + "</datalist>" +
    "<div style='" + lbl + ";margin-top:14px'>Brand " + opt + "</div>" +
    "<input id='apEdBrand' type='text' placeholder='e.g. Bosch' style='" + inp + "' value='" + esc((rec && rec.brand) || "") + "'>" +
    "<div style='" + lbl + ";margin-top:14px'>Model " + opt + "</div>" +
    "<input id='apEdModel' type='text' placeholder='e.g. SMS4HVI33E' style='" + inp + "' value='" + esc((rec && rec.model) || "") + "'>" +
    "<div style='" + lbl + ";margin-top:14px'>Serial number " + opt + "</div>" +
    "<input id='apEdSerial' type='text' placeholder='Usually on a sticker inside the door' style='" + inp + "' value='" + esc((rec && rec.serial) || "") + "'>" +
    "<div style='" + lbl + ";margin-top:14px'>FD number " + opt + "</div>" +
    "<input id='apEdFD' type='text' placeholder='e.g. 0603 &mdash; the FD code on Bosch/Siemens rating plates' style='" + inp + "' value='" + esc((rec && rec.fd) || "") + "'>" +
    "<div style='" + lbl + ";margin-top:14px'>Bought " + opt + "</div>" +
    "<input id='apEdBought' type='date' style='" + inp + "' value='" + esc((rec && rec.bought) || "") + "'>" +
    "<div style='" + lbl + ";margin-top:14px'>Warranty ends " + opt + "</div>" +
    "<input id='apEdWarranty' type='date' style='" + inp + "' value='" + esc((rec && rec.warranty) || "") + "'>" +
    "<div style='" + lbl + ";margin-top:14px'>Bought from " + opt + "</div>" +
    "<input id='apEdFrom' type='text' placeholder='e.g. Harvey Norman, Cork' style='" + inp + "' value='" + esc((rec && rec.boughtFrom) || "") + "'>" +
    // v428 — the two insurance fields. `inputmode=decimal` rather than
    // type=number: a number input on a phone silently rejects "1,250" and
    // spins on scroll, and this is a figure you type once and read often.
    "<div style='" + lbl + ";margin-top:14px'>What would it cost to replace " + opt + "</div>" +
    "<input id='apEdValue' type='text' inputmode='decimal' placeholder='e.g. 650' style='" + inp + "' value='" + esc(applianceValueEditText(rec)) + "'>" +
    "<div style='font-size:11px;color:#A8B2B8;margin-top:5px;line-height:1.5'>Euro. Today&rsquo;s price to buy the same thing again &mdash; that is the number an insurer asks for, not what you paid.</div>" +
    "<div style='" + lbl + ";margin-top:14px'>Where&rsquo;s the receipt " + opt + "</div>" +
    "<input id='apEdReceipt' type='text' placeholder='e.g. Gmail, order 88214 &mdash; or the folder in the desk' style='" + inp + "' value='" + esc((rec && rec.receipt) || "") + "'>" +
    "<div style='" + lbl + ";margin-top:14px'>Link to the manual " + opt + "</div>" +
    "<input id='apEdManual' type='url' inputmode='url' placeholder='https://&hellip;' style='" + inp + "' value='" + esc((rec && rec.manual) || "") + "'>" +
    "<div style='font-size:11px;color:#A8B2B8;margin-top:5px;line-height:1.5'>The manufacturer&rsquo;s manual page, so the PDF is one tap away instead of in a drawer.</div>" +
    "<div style='" + lbl + ";margin-top:14px'>Link to the photos " + opt + "</div>" +
    "<input id='apEdPhotos' type='url' inputmode='url' placeholder='https://&hellip;' style='" + inp + "' value='" + esc((rec && rec.photos) || "") + "'>" +
    "<div style='font-size:11px;color:#A8B2B8;margin-top:5px;line-height:1.5'>A OneDrive folder with the photos and the receipt. Hearth keeps the link, never the pictures &mdash; a claim wants them full size anyway.</div>" +
    "<div style='" + lbl + ";margin-top:14px'>Notes " + opt + "</div>" +
    "<textarea id='apEdNotes' rows='3' placeholder='Filter size, the service number, which fuse it&rsquo;s on&hellip;' style='" + inp + ";resize:vertical'>" + esc((rec && rec.notes) || "") + "</textarea>" +
    "<div style='display:flex;gap:8px;margin-top:18px'>" +
      "<button id='apEdCancel' style='flex:1;padding:13px;border:1.5px solid #D8E0E4;background:#fff;color:#5A6A74;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation'>Cancel</button>" +
      "<button id='apEdSave' style='flex:2;padding:13px;border:none;background:" + APPL_COLOR + ";color:#fff;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>Save</button>" +
    "</div>";

  document.getElementById("apEdCancel").addEventListener("click", leave);
  document.getElementById("apEdSave").addEventListener("click", function(){
    var name = document.getElementById("apEdName").value.trim();
    if (!name) { toast("Give it a name first"); return; }
    // Same normalisation as the recipe source link (v393): a bare domain gets
    // https://, and anything that isn't a web address is refused rather than
    // stored as a dead link.
    // Same gate the detail view renders through, so what saves and what is
    // offered as a link can never disagree.
    var manualRaw = document.getElementById("apEdManual").value.trim();
    var manual = manualRaw ? applianceLinkUrl(manualRaw) : "";
    if (manualRaw && !manual) { toast("The manual link should be a web address"); return; }
    var photosRaw = document.getElementById("apEdPhotos").value.trim();
    var photos = photosRaw ? applianceLinkUrl(photosRaw) : "";
    if (photosRaw && !photos) { toast("The photos link should be a web address"); return; }
    // false = there is text in the box that isn't a number. Refused rather than
    // rounded to 0: a wrong figure on an insurance list is worse than a blank.
    var value = applianceParseValue(document.getElementById("apEdValue").value);
    if (value === false) { toast("The replacement value should be a number, like 650"); return; }
    var fields = {
      name: name,
      area: document.getElementById("apEdArea").value.trim(),
      brand: document.getElementById("apEdBrand").value.trim(),
      model: document.getElementById("apEdModel").value.trim(),
      serial: document.getElementById("apEdSerial").value.trim(),
      fd: document.getElementById("apEdFD").value.trim(),
      bought: document.getElementById("apEdBought").value.trim(),
      warranty: document.getElementById("apEdWarranty").value.trim(),
      boughtFrom: document.getElementById("apEdFrom").value.trim(),
      // "" rather than a dropped key when the box is empty — a field left
      // undefined gets refilled from the other device by the v296 merge fill,
      // so a deliberately cleared value would come back.
      value: (value === null ? "" : value),
      receipt: document.getElementById("apEdReceipt").value.trim(),
      manual: manual,
      photos: photos,
      notes: document.getElementById("apEdNotes").value.trim()
    };
    var cur = getAppliances();
    var savedId = _applEditId;
    if (_applEditId != null) {
      var j = cur.findIndex(function(a){ return a && a.id === _applEditId; });
      if (j < 0) { toast("That item is no longer here"); leave(); return; }
      Object.keys(fields).forEach(function(k){ cur[j][k] = fields[k]; });
      cur[j].updated = Date.now();
    } else {
      savedId = Date.now() + Math.floor(Math.random() * 1000);
      cur.unshift(Object.assign({ id: savedId, addedBy: hearthUser, added: Date.now(), updated: Date.now() }, fields));
    }
    saveAppliances(cur);
    _applEditing = false; _applCancelFn = null;
    _applEditId = null; _applOpenId = savedId; _applView = "detail";
    renderAppliances(); window.scrollTo(0, 0);
    toast("Saved");
  });
  var n = document.getElementById("apEdName");
  if (n && !rec) n.focus();
}

