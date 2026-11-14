// ============================================================
// PLANTS (v377) — a houseplant care book. Each plant opens to a
// summary + a watering/feeding panel, with the deeper reference
// sections (light, repotting, propagation, safety, notes) below.
//
// Household-shared, WHOLE-RECORD newest-wins by `updated` plus
// deletion tombstones — the recipebook contract, not the nested
// per-booking merge trips need. A plant is a single edit unit, so
// there is nothing inside it for two devices to edit separately.
// ============================================================

// The care write-up, in the order it renders. `top` and `care` mark the
// three that sit above the "More on this plant" divider; everything else
// falls below it. Adding a section here is all it takes — the detail
// view, the editor and the export all iterate this list.
var PLANT_SECTIONS = [
  { key:"summary",     label:"Summary",                     ico:"&#x1F4DD;",         top:true,
    hint:"What it is, how easy it is, how it's doing." },
  { key:"watering",    label:"Watering",                    ico:"&#x1F4A7;",         care:true,
    hint:"How much, how often, how to tell it needs it — including how that changes in winter." },
  { key:"feeding",     label:"Feeding",                     ico:"&#x1F331;",         care:true,
    hint:"Which feed, what strength, which months." },
  { key:"light",       label:"Light &amp; position",        ico:"&#x2600;&#xFE0F;",
    hint:"How much light, and where in the room it wants to be." },
  { key:"repotting",   label:"Repotting",                   ico:"&#x1FAB4;",
    hint:"How often, what size pot, what to look for." },
  { key:"propagation", label:"Propagation",                 ico:"&#x2702;&#xFE0F;",
    hint:"How to take cuttings or pot up babies." },
  { key:"safety",      label:"Safety (children &amp; pets)", ico:"&#x26A0;&#xFE0F;",
    hint:"Safe, or toxic if chewed?" },
  { key:"notes",       label:"Notes &amp; observations",    ico:"&#x1F50D;",
    hint:"Anything you've noticed — brown tips, pale leaves, what you tried." }
];

function getPlants() { return storeGet("fl4_plants") || []; }
function savePlants(p) {
  storeSet("fl4_plants", p);
  pushPersonal();
  if (typeof isHouseholdSet === "function" && isHouseholdSet()) pushHousehold();
  plantStorageWarn(p);
}

// Photos are the only thing in Hearth big enough to threaten the browser's
// ~5MB localStorage budget (and the sync payload with it), so say something
// while it's still fixable rather than waiting for storeSet's quota catch.
var _plantSizeWarned = false;
function plantStorageWarn(p) {
  var bytes;
  try { bytes = JSON.stringify(p || []).length; } catch (e) { return; }
  if (bytes > 1500000) {
    if (!_plantSizeWarned) {
      _plantSizeWarned = true;
      toast("&#x1F4E6; Plant photos are using a lot of storage — consider removing a few");
    }
  } else {
    _plantSizeWarned = false;
  }
}

// Whole-record newest-wins by `updated`, tombstone-filtered.
// Returns {plants, push} — push=true means our merged copy is fuller or
// newer than what arrived, so the caller re-pushes to converge (the same
// contract as mergeTripsData / mergeMealPlanData).
function mergePlantsData(localPlants, incomingPlants, tombs) {
  tombs = tombs || {};
  var push = false;
  var incById = {};
  (incomingPlants || []).forEach(function(p){ if (p && p.id != null) incById[p.id] = p; });
  var localIds = {};
  var merged = (localPlants || []).map(function(p){
    if (!p || p.id == null) return p;
    localIds[p.id] = true;
    var inc = incById[p.id];
    if (!inc) { push = true; return p; }                       // partner missing this → push
    var winner, loser;
    if ((inc.updated||0) > (p.updated||0)) { winner = inc; loser = p; }  // incoming newer → take it
    else {
      if ((p.updated||0) > (inc.updated||0)) push = true;      // local newer → push to converge
      winner = p; loser = inc;
    }
    // v296 lesson (the babySex incident class): a copy written by an older
    // build doesn't know about newer fields, so fill keys UNDEFINED on the
    // winner from the loser rather than letting them vanish. A field the
    // user deliberately cleared is "" (defined) and stays cleared.
    Object.keys(loser).forEach(function(k){ if (winner[k] === undefined) winner[k] = loser[k]; });
    return winner;
  });
  var fresh = (incomingPlants || []).filter(function(p){ return p && p.id != null && !localIds[p.id]; });
  var full = fresh.concat(merged);
  var pre = full.length;
  full = full.filter(function(p){ return !(p && tombs[p.id] && tombs[p.id] >= (p.updated||0)); });
  if (full.length < pre) push = true;
  return { plants: full, push: push };
}

// ── Watering / feeding schedule ───────────────────────────────────────────
function plantLastTs(log) {
  if (!Array.isArray(log) || !log.length) return 0;
  return log[0] || 0;
}
// Whole days from a timestamp to today's local midnight. Both endpoints are
// local midnight so a DST change can't shift the count (same rule as
// tripDaysUntil). null if unparseable or never logged.
function plantDaysSince(ts) {
  if (!ts) return null;
  var d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  var then = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var now = new Date();
  var todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((todayMid - then) / 86400000);
}
// Feed reminders can be paused for a season (v430) — e.g. September to April
// for a plant that shouldn't be fed over winter. Both ends are months 1-12;
// 0 on either means no pause. The range wraps across the year boundary when
// from > to (Sept..April), so a plain from<=m<=to test isn't enough.
// month is 1-12, defaulting to the real current month — overridable so the
// wraparound arithmetic can be unit-tested without mocking Date.
function plantFeedPaused(p, month) {
  var from = parseInt(p && p.feedPauseFrom, 10) || 0;
  var to = parseInt(p && p.feedPauseTo, 10) || 0;
  if (!from || !to) return false;
  var m = month || (new Date().getMonth() + 1);
  if (from <= to) return m >= from && m <= to;
  return m >= from || m <= to;
}
// Days until the next water/feed is due: negative = overdue, 0 = due today.
// null means "don't nag" — either no interval is set, it has never been
// logged, or the reminder is switched off (outdoor plants skip watering
// nags entirely; feeding can be paused for a season). A plant you have not
// watered YET is not overdue, or every plant would land red the moment
// it's added.
function plantDueIn(p, kind) {
  if (!p) return null;
  if (kind === "water" && p.waterOff) return null;
  if (kind === "feed" && plantFeedPaused(p)) return null;
  var iv = parseInt(kind === "feed" ? p.feedDays : p.waterDays, 10);
  if (!iv || iv < 1) return null;
  var since = plantDaysSince(plantLastTs(kind === "feed" ? p.feedLog : p.waterLog));
  if (since === null) return null;
  return iv - since;
}
function plantOverdue(p) { var d = plantDueIn(p, "water"); return d !== null && d <= 0; }
// Soonest of water/feed due-in, for list sorting. null only when neither has
// a reminder set (or logged) — those plants sort to the end, not the top.
function plantNextDue(p) {
  var w = plantDueIn(p, "water"), f = plantDueIn(p, "feed");
  if (w === null) return f;
  if (f === null) return w;
  return Math.min(w, f);
}

// ── Areas (v379) ───────────────────────────────────────────────────────────
// The existing `room` field IS the area — no new field, so every plant already
// in the book and every `plant-v1` file written before v379 filters correctly
// with nothing to migrate.
function plantAreaKey(v) { return String(v == null ? "" : v).trim().toLowerCase(); }
// Distinct areas in use, grouped case-insensitively so "kitchen" typed once
// doesn't split off its own chip. The label shown is the commonest spelling,
// preferring a capitalised one on a tie — otherwise the chip's capitalisation
// would depend on which plant happened to sort first, which looks like a bug.
// Sorted so the chip order is stable between renders.
function plantAreas(plants) {
  var by = {}, keys = [];
  (plants || []).forEach(function(p){
    var k = plantAreaKey(p && p.room);
    if (!k) return;
    var label = String(p.room).trim();
    if (!by[k]) { by[k] = {}; keys.push(k); }
    by[k][label] = (by[k][label] || 0) + 1;
  });
  return keys.map(function(k){
    var best = null, bestN = -1;
    Object.keys(by[k]).forEach(function(label){
      var n = by[k][label];
      var tidier = best !== null && n === bestN &&
        label.charAt(0) === label.charAt(0).toUpperCase() && best.charAt(0) !== best.charAt(0).toUpperCase();
      if (n > bestN || tidier) { best = label; bestN = n; }
    });
    return best;
  }).sort(function(a, b){ return a.localeCompare(b); });
}
// area: "" = every plant, PLANT_AREA_NONE = the ones with no area set yet.
// The sentinel is JS-only and never reaches an HTML attribute.
var PLANT_AREA_NONE = "__none__";
function plantsInArea(plants, area) {
  var list = (plants || []).filter(function(p){ return !!p; });
  if (!area) return list;
  if (area === PLANT_AREA_NONE) return list.filter(function(p){ return !plantAreaKey(p.room); });
  var k = plantAreaKey(area);
  return list.filter(function(p){ return plantAreaKey(p.room) === k; });
}

// Home glance card (v379). Unlike the Today-card row this never suppresses
// itself — "nothing due" is a real answer, and the card's other job is simply
// being a permanent way into the section.
function plantHomeSummary(plants) {
  var list = (plants || []).filter(function(p){ return !!p; });
  if (!list.length) return { count:0, countText:"—", label:"in the book", sub:"Tap to add your first plant" };
  var due = list.filter(plantOverdue);
  var sub;
  if (due.length === 1)    sub = (due[0].name || "A plant") + " needs watering";
  else if (due.length > 1) sub = due.length + " plants need watering";
  else {
    var next = null;
    list.forEach(function(p){
      var d = plantDueIn(p, "water");
      if (d === null) return;                       // no interval, or never logged — don't nag
      if (next === null || d < next) next = d;
    });
    if (next === null)   sub = "Nothing scheduled";
    else if (next === 1) sub = "All watered · next tomorrow";
    else                 sub = "All watered · next in " + next + " days";
  }
  return { count:list.length, countText:String(list.length), label:(list.length === 1 ? "plant" : "plants"), sub:sub };
}

function plantAgoLabel(ts) {
  var d = plantDaysSince(ts);
  if (d === null) return "not logged yet";
  if (d <= 0)     return "today";
  if (d === 1)    return "yesterday";
  return d + " days ago";
}
function plantDueLabel(p, kind) {
  var d = plantDueIn(p, kind);
  if (d === null) return "";
  if (d < 0)   return (-d) + " day" + (d === -1 ? "" : "s") + " overdue";
  if (d === 0) return "due today";
  if (d === 1) return "due tomorrow";
  return "due in " + d + " days";
}

// Newest first, capped — this is a "when did I last do it" habit tracker,
// not a diary, and an uncapped array would ride the sync payload forever.
var PLANT_LOG_CAP = 40;
var PLANT_HISTORY_PREVIEW = 5;   // rows shown before "Show all" — the rest stay one tap away
function plantLogCare(id, kind) {
  var plants = getPlants();
  var i = plants.findIndex(function(p){ return p && p.id === id; });
  if (i < 0) { toast("Plant not found"); return; }   // never write at an unguarded -1
  var now = Date.now();
  var key = kind === "feed" ? "feedLog" : "waterLog";
  var log = Array.isArray(plants[i][key]) ? plants[i][key].slice() : [];
  log.unshift(now);
  plants[i][key] = log.slice(0, PLANT_LOG_CAP);
  // Feeding requires watering at the same time, so a feed log also counts as a water log.
  // Watering alone does not imply feeding, so this only runs one way.
  if (kind === "feed") {
    var waterLog = Array.isArray(plants[i].waterLog) ? plants[i].waterLog.slice() : [];
    waterLog.unshift(now);
    plants[i].waterLog = waterLog.slice(0, PLANT_LOG_CAP);
  }
  plants[i].updated = now;
  savePlants(plants);
}
function plantUndoCare(id, kind) {
  var plants = getPlants();
  var i = plants.findIndex(function(p){ return p && p.id === id; });
  if (i < 0) return;
  var key = kind === "feed" ? "feedLog" : "waterLog";
  var log = Array.isArray(plants[i][key]) ? plants[i][key].slice() : [];
  if (!log.length) return;
  var removed = log.shift();
  plants[i][key] = log;
  // Undo the water log entry that was auto-added alongside this feed entry,
  // but only if it's still the most recent one (same timestamp) — a manual
  // watering logged since then must not be discarded.
  if (kind === "feed") {
    var waterLog = Array.isArray(plants[i].waterLog) ? plants[i].waterLog.slice() : [];
    if (waterLog.length && waterLog[0] === removed) {
      waterLog.shift();
      plants[i].waterLog = waterLog;
    }
  }
  plants[i].updated = Date.now();
  savePlants(plants);
}

// ── Care history (v416) ───────────────────────────────────────────────────
// ONE ROW PER LOCAL DAY, deliberately — not one row per stored timestamp.
// Two reasons, both of which would otherwise render as what looks like a bug:
//   ① a feed writes a watering at the SAME millisecond (plantLogCare, v409),
//      so a per-timestamp list shows "Fed" and "Watered" as two rows for one
//      action;
//   ② two waterings on the same day would produce two rows carrying the
//      identical "Mon 10 Aug · 3 days ago" label, indistinguishable on screen.
// Everything else in Plants already counts in whole local days (plantDaysSince,
// plantDueIn, plantAgoLabel), so the day is the section's natural grain.
// Pure read — this never writes to a plant, and the stored logs keep their
// full per-timestamp detail for anything that needs it later.
function plantCareEvents(p) {
  if (!p) return [];
  var byDay = {};
  function add(log, kind) {
    if (!Array.isArray(log)) return;
    log.forEach(function(ts){
      if (!ts) return;
      var d = new Date(ts);
      if (isNaN(d.getTime())) return;                 // one corrupt entry must not kill the whole list
      var key = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();   // LOCAL day, as plantDaysSince counts
      var row = byDay[key];
      if (!row) row = byDay[key] = { ts: ts, water: false, feed: false };
      else if (ts > row.ts) row.ts = ts;              // the newest moment of that day labels the row
      row[kind] = true;
    });
  }
  add(p.waterLog, "water");
  add(p.feedLog,  "feed");
  return Object.keys(byDay).map(function(k){ return byDay[k]; })
                           .sort(function(a, b){ return b.ts - a.ts; });          // newest first, like the logs themselves
}
function plantCareEventWords(ev) {
  if (!ev) return "";
  if (ev.water && ev.feed) return "Watered + fed";
  return ev.feed ? "Fed" : "Watered";
}
function plantCareEventIcons(ev) {
  if (!ev) return "";
  if (ev.water && ev.feed) return "&#x1F4A7;&#x1F331;";
  return ev.feed ? "&#x1F331;" : "&#x1F4A7;";
}
function plantDateLabel(ts) {
  var d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" });
}

function deletePlant(id) {
  var all = getPlants();
  var i = all.findIndex(function(x){ return x && x.id === id; });
  if (i < 0) return;
  all.splice(i, 1);
  addTomb("plants", id);
  savePlants(all);
  _plantView = "list"; _plantOpenId = null;
  renderPlants();
  toast("Plant deleted");
}

// Shrink to a ~400px thumbnail before it ever reaches localStorage — a raw
// phone photo is several MB and a handful would break both storage and sync.
var PLANT_PHOTO_MAX = 400;
function plantShrinkPhoto(file, cb) {
  if (!file) { cb(""); return; }
  var reader = new FileReader();
  reader.onerror = function(){ cb(""); };
  reader.onload = function() {
    var img = new Image();
    img.onerror = function(){ cb(""); };
    img.onload = function() {
      var w = img.width || 0, h = img.height || 0;
      if (!w || !h) { cb(""); return; }
      var scale = Math.min(1, PLANT_PHOTO_MAX / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
      var c = document.createElement("canvas");
      c.width = cw; c.height = ch;
      try {
        c.getContext("2d").drawImage(img, 0, 0, cw, ch);
        cb(c.toDataURL("image/jpeg", 0.7));
      } catch (e) { cb(""); }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// ── Import / export (v378) ────────────────────────────────────────────────
// A plant file is exactly what the export writes: one plant object, or
// {plants:[...]} for a whole shelf. The point is the AI round-trip — photograph
// a plant, have a chat identify it and write the care sheet, paste the JSON
// back in here.
//
// Deliberately NOT in the file: `id` (regenerated), `updated` (set to now),
// `photo` (a chat can't write one, and base64 would swamp the paste box) and
// the water/feed logs (your own history, not care information). Import never
// touches any of them, so an update keeps your photo and your logging streak.
// `photoLink` (v432) IS in the file — it is a URL, a couple of dozen bytes, so
// it costs the paste box nothing and it is the one photo thing a chat can fill.
//
// KEEP IN SYNC: the text sections come from PLANT_SECTIONS, so adding one
// there flows through export, import and the AI prompt automatically. The
// scalar fields (name/latin/room/emoji/waterDays/feedDays/waterOff/
// feedPauseFrom/feedPauseTo/photoLink) are hand-listed in plantExportObj +
// plantApplyImport — add new ones to BOTH.
var PLANT_FILE_TAG = "plant-v1";
var PLANT_FIELD_MAX = 4000;   // per section; a runaway AI reply must not eat localStorage

function plantCleanText(v) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, PLANT_FIELD_MAX);
}
function plantCleanDays(v) {
  var n = parseInt(v, 10);
  if (!n || n < 1) return 0;                 // 0 (or junk) means "no reminder"
  return Math.min(365, n);
}
function plantCleanMonth(v) {
  var n = parseInt(v, 10);
  if (!n || n < 1 || n > 12) return 0;        // 0 (or junk) means "no pause"
  return n;
}
var PLANT_MONTHS = ["No pause","January","February","March","April","May","June","July","August","September","October","November","December"];
function plantMonthOptionsHTML(sel) {
  sel = plantCleanMonth(sel);
  return PLANT_MONTHS.map(function(name, i){ return "<option value='" + i + "'" + (i === sel ? " selected" : "") + ">" + name + "</option>"; }).join("");
}
// PLANT_SECTIONS labels are HTML source; the AI prompt is plain text.
function plantPlainLabel(s) { return String(s || "").replace(/&amp;/g, "&"); }

// v432 — the photo LINK, which is not the photo. `photo` is a shrunk base64
// thumbnail living in localStorage; this is a web address for a full-size
// picture kept somewhere else (a Commons page, a OneDrive folder, a nursery
// listing). A plant can have either, both or neither.
//
// It goes through applianceLinkUrl — the same http(s)-only gate the appliance
// manual/photos links use, deliberately NOT a second copy of it. That helper is
// named for where it was born, not for what it knows: it refuses any scheme but
// http(s), which is the whole check. Two copies of a security gate is how one
// of them drifts (the v428 lesson), so this reuses it rather than restating it.
// Checked at RENDER time as well as on save, because a plant record can arrive
// from sync or a restored backup written by an older version.
function plantPhotoLinkUrl(p) { return applianceLinkUrl(p && p.photoLink); }

function plantExportObj(p) {
  var out = {
    name:      p.name  || "",
    latin:     p.latin || "",
    room:      p.room  || "",
    emoji:     p.emoji || "",
    waterDays: parseInt(p.waterDays, 10) || 0,
    feedDays:  parseInt(p.feedDays, 10)  || 0,
    waterOff:      !!p.waterOff,
    feedPauseFrom: parseInt(p.feedPauseFrom, 10) || 0,
    feedPauseTo:   parseInt(p.feedPauseTo, 10)   || 0,
    photoLink:     p.photoLink || ""
  };
  PLANT_SECTIONS.forEach(function(sec){ out[sec.key] = p[sec.key] || ""; });
  return out;
}

function plantDownloadJSON(payload, filename) {
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function plantFileSlug(s) {
  return (s || "plant").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plant";
}

// The template Cathal hands to an AI chat along with his photo and notes.
// Built from PLANT_SECTIONS so it can never drift from what import accepts.
function plantAIPrompt() {
  var skeleton = ['  "hearth": "' + PLANT_FILE_TAG + '",',
                  '  "name": "",',
                  '  "latin": "",',
                  '  "room": "",',
                  '  "emoji": "",',
                  '  "waterDays": 0,',
                  '  "feedDays": 0,'];
  PLANT_SECTIONS.forEach(function(sec, i){
    skeleton.push('  "' + sec.key + '": ""' + (i === PLANT_SECTIONS.length - 1 ? "" : ","));
  });
  var guide = PLANT_SECTIONS.map(function(sec){
    return "- " + sec.key + " (" + plantPlainLabel(sec.label) + "): " + plantPlainLabel(sec.hint);
  }).join("\n");
  return "Here is a photo of a houseplant, plus my own notes on it. Identify it if you can, " +
    "then write me a care sheet for my Hearth app.\n\n" +
    "Reply with ONLY this JSON — no code fences, no commentary before or after:\n\n" +
    "{\n" + skeleton.join("\n") + "\n}\n\n" +
    "Field notes:\n" +
    "- name: what I'd call it. latin: the botanical name. room: the area it lives in " +
    "(\"Kitchen\", \"Outside\") — leave \"\" unless I told you where it lives.\n" +
    "- emoji: one emoji for it, or \"\".\n" +
    "- waterDays / feedDays: whole days between waterings / feeds, as numbers. Use 0 for no reminder " +
    "(feeding is often 0 over winter — say so in the feeding text instead).\n" +
    "- The text fields are plain prose, a few short lines each. No markdown, no bullet characters, " +
    "no headings — they're shown as-is on a phone.\n" +
    guide + "\n" +
    "- Leave a field as \"\" if you genuinely don't know. An empty field keeps whatever I've already " +
    "written in the app; a filled one replaces it.\n" +
    "- Anything you're unsure of (especially the identification, and anything in safety) — say so in " +
    "that field rather than guessing confidently.\n" +
    "- For several plants at once, reply {\"hearth\":\"" + PLANT_FILE_TAG + "\",\"plants\":[ {...}, {...} ]}.";
}

// Clipboard with an execCommand fallback — writeText needs a user gesture and
// a secure context, and neither is guaranteed on every browser he opens this in.
function plantCopyPrompt() {
  var text = plantAIPrompt();
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
      toast(ok ? "&#x1F4CB; Prompt copied" : "Couldn't copy — select the prompt below by hand");
    } catch (e) { toast("Couldn't copy — select the prompt below by hand"); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function(){ toast("&#x1F4CB; Prompt copied"); }, fallback);
  } else { fallback(); }
}

// Returns {plants:[...]} or {error}. Accepts a bare plant object as well as a
// {plants:[...]} list, so a one-plant chat reply and a whole-book export both
// come through the same door.
function parsePlantFile(raw) {
  var obj;
  try { obj = JSON.parse(raw); } catch (e) { return { error: "Couldn't parse JSON — check the format and try again." }; }
  if (!obj || obj.hearth !== PLANT_FILE_TAG) return { error: "Not a Hearth plant file. Make sure the JSON includes \"hearth\":\"" + PLANT_FILE_TAG + "\"." };
  var list = (Array.isArray(obj.plants) ? obj.plants : [obj]).filter(function(p){
    return p && typeof p === "object" && !Array.isArray(p);
  });
  if (!list.length) return { error: "No plants found in that file." };
  var unnamed = list.some(function(p){ return !p.name || typeof p.name !== "string" || !p.name.trim(); });
  if (unnamed) return { error: "Every plant needs a \"name\"." };
  return { plants: list };
}

// "File wins, blanks left alone": a field the file fills in replaces what's
// there, a field it leaves empty keeps the existing text. Photo and the two
// logs are never in a file, so they always survive an update.
function plantApplyImport(rec, src) {
  var name = plantCleanText(src.name);
  if (name) rec.name = name.slice(0, 80);
  var latin = plantCleanText(src.latin); if (latin) rec.latin = latin.slice(0, 120);
  var room  = plantCleanText(src.room);  if (room)  rec.room  = room.slice(0, 120);
  var emoji = plantCleanText(src.emoji); if (emoji) rec.emoji = emoji.slice(0, 4);
  if (src.waterDays !== undefined && src.waterDays !== null && src.waterDays !== "") rec.waterDays = plantCleanDays(src.waterDays);
  if (src.feedDays  !== undefined && src.feedDays  !== null && src.feedDays  !== "") rec.feedDays  = plantCleanDays(src.feedDays);
  if (src.waterOff !== undefined) rec.waterOff = !!src.waterOff;
  if (src.feedPauseFrom !== undefined && src.feedPauseFrom !== null && src.feedPauseFrom !== "") rec.feedPauseFrom = plantCleanMonth(src.feedPauseFrom);
  if (src.feedPauseTo   !== undefined && src.feedPauseTo   !== null && src.feedPauseTo   !== "") rec.feedPauseTo   = plantCleanMonth(src.feedPauseTo);
  // Same gate as the editor and the detail view. A file offering something that
  // isn't an http(s) address leaves the existing link alone rather than storing
  // a dead — or hostile — one: blanks-left-alone applies to junk too.
  var photoLink = applianceLinkUrl(src.photoLink);
  if (photoLink) rec.photoLink = photoLink.slice(0, 500);
  PLANT_SECTIONS.forEach(function(sec){
    var v = plantCleanText(src[sec.key]);
    if (v) rec[sec.key] = v;
  });
  if (!Array.isArray(rec.waterLog)) rec.waterLog = [];
  if (!Array.isArray(rec.feedLog))  rec.feedLog  = [];
  rec.updated = Date.now();
  return rec;
}

// Adds every entry as a new plant. Returns the id of the first one so the UI
// can open it; null if the list was empty.
function importPlantsAsNew(list) {
  var all = getPlants();
  var firstId = null;
  var now = Date.now();
  (list || []).forEach(function(src, i){
    var rec = plantApplyImport({ id: now + i * 1000 + Math.floor(Math.random() * 1000), photo: "", waterLog: [], feedLog: [] }, src);
    all.push(rec);
    if (firstId === null) firstId = rec.id;
  });
  if (firstId === null) return null;
  savePlants(all);
  return firstId;
}

// Updates one plant already in the book from one file entry.
function importPlantInto(id, src) {
  var all = getPlants();
  var i = all.findIndex(function(p){ return p && p.id === id; });
  if (i < 0) return { error: "That plant was deleted on another device." };   // guard the -1
  plantApplyImport(all[i], src);
  savePlants(all);
  return { id: id };
}

// ── Name matching for a multi-plant import (v433) ─────────────────────────
// Before v433 a file holding several plants could only be added as new ones,
// so re-importing his own exported shelf produced a duplicate of every plant
// and left the originals (with all their care history) sitting beside them.
// Matching by name is what makes a whole-shelf file usable as an UPDATE.
//
// EXACT name only, case- and whitespace-insensitive. Deliberately NOT fuzzy:
// no Levenshtein, no prefix or substring matching, no "did you mean". A wrong
// automatic match silently overwrites the wrong plant's care notes, and the
// two most similar names in a plant book are exactly the ones most likely to
// be different plants ("Aloe Vera" / "Aloe Vera 2", "Peace Lily" / "Peace Lily
// (small)"). Anything short of an exact match is left for him to pick from the
// row's dropdown. Do NOT "improve" this into a fuzzy matcher.
function plantNameKey(s) {
  return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
}
function plantNameMatches(name, all) {
  var key = plantNameKey(name);
  if (!key) return [];
  return (all || []).filter(function(p){ return p && plantNameKey(p.name) === key; });
}

// Applies a whole multi-plant file in ONE pass: one getPlants(), one
// savePlants(). `plan` is one row per file entry:
//   { src: <file entry>, action: "update" | "new" | "skip", id: <plant id> }
//
// Deliberately NOT a loop over importPlantInto/importPlantsAsNew — those each
// call savePlants(), so an eleven-plant file would write the whole book and
// fire a sync push eleven times over. Same reason the counts come back from
// here rather than being tallied by the caller.
function importPlantsByPlan(plan) {
  var all = getPlants();
  var now = Date.now();
  var res = { updated:0, added:0, skipped:0, missing:0, firstId:null };
  (plan || []).forEach(function(row, i){
    if (!row || !row.src) return;
    if (row.action === "update") {
      var j = all.findIndex(function(x){ return x && x.id === row.id; });
      // Deleted on another device between opening this screen and tapping
      // Import. Counted and reported rather than silently dropped — guard the -1.
      if (j < 0) { res.missing++; return; }
      plantApplyImport(all[j], row.src);
      res.updated++;
      if (res.firstId === null) res.firstId = all[j].id;
    } else if (row.action === "new") {
      // Same id shape as importPlantsAsNew: the i*1000 stride keeps two rows
      // of one import off each other's random range.
      var rec = plantApplyImport({ id: now + i * 1000 + Math.floor(Math.random() * 1000),
                                   photo: "", waterLog: [], feedLog: [] }, row.src);
      all.push(rec);
      res.added++;
      if (res.firstId === null) res.firstId = rec.id;
    } else {
      res.skipped++;
    }
  });
  if (res.updated || res.added) savePlants(all);
  return res;
}

// ── Plants views ──────────────────────────────────────────────────────────
var _plantView = "list";      // "list" | "detail" | "editor"
var _plantOpenId = null;
// Care-history expand state is keyed to the PLANT, not a bare boolean: opening a
// different plant then collapses on its own, with no reset needed at any of the
// dozen places that assign _plantOpenId.
var _plantHistoryOpenId = null;
var _plantEditing = false;
var _plantCancelFn = null;    // back-button discard closure (v345 pattern), nulled on every exit path
var _plantListScrollPos = 0;
var _plantPhotoDraft = null;  // photo held while the editor is open; null = editor closed
var _plantArea = "";          // area filter (v379): "" = all, PLANT_AREA_NONE = untagged. Session-only, never stored.
var _plantImporting = false;  // import screen open (v378) — step 1 paste, step 2 destination
var _plantImportParsed = null;// parsed file entries once step 1 validates; null = still on step 1

function plantThumbHTML(p, size) {
  var s = size || 46;
  if (p && p.photo) {
    return "<div style='flex-shrink:0;width:" + s + "px;height:" + s + "px;border-radius:10px;background-image:url(\"" + esc(p.photo) + "\");background-size:cover;background-position:center;background-color:#EAF2E4'></div>";
  }
  return "<div style='flex-shrink:0;width:" + s + "px;height:" + s + "px;border-radius:10px;background:#EAF2E4;display:flex;align-items:center;justify-content:center;font-size:" + Math.round(s * 0.5) + "px'>" +
    ((p && p.emoji) ? esc(p.emoji) : "&#x1FAB4;") + "</div>";
}
function plantDuePill(p, kind) {
  var d = plantDueIn(p, kind);
  if (d === null) return "";
  var bg = d < 0 ? "#FBE4E4" : (d === 0 ? "#FDF0D8" : "#E6F2E6");
  var fg = d < 0 ? "#B03030" : (d === 0 ? "#8A6A10" : "#2E7D4F");
  var ico = kind === "feed" ? "&#x1F331;" : "&#x1F4A7;";
  return "<div style='flex-shrink:0;background:" + bg + ";color:" + fg + ";font-size:12px;font-weight:700;border-radius:20px;padding:5px 11px;white-space:nowrap'>" + ico + " " + esc(plantDueLabel(p, kind)) + "</div>";
}
// Botanical name, then the area. The area is what the chips filter on, so it
// earns its place on the card even when a filter is already narrowing the list.
function plantCardSubHTML(p) {
  var bits = [];
  if (p && p.latin) bits.push("<i>" + esc(p.latin) + "</i>");
  var area = String((p && p.room) || "").trim();
  if (area) bits.push("&#x1F4CD; " + esc(area));
  return bits.join(" &middot; ");
}
function plantCardHTML(p) {
  return "<div class='plant-card' data-pid='" + esc(p.id) + "' style='display:flex;align-items:center;gap:11px;width:100%;text-align:left;background:#fff;border:1px solid #E4EADC;border-radius:12px;padding:12px;margin-bottom:10px;cursor:pointer'>" +
    plantThumbHTML(p, 46) +
    "<div style='flex:1;min-width:0'>" +
      "<div style='font-size:16px;font-weight:700;color:#1A2E1E;margin-bottom:2px'>" + esc(p.name || "Untitled plant") + "</div>" +
      "<div style='font-size:12px;color:#8A9A7A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" + plantCardSubHTML(p) + "</div>" +
    "</div>" +
    "<div style='flex-shrink:0;display:flex;flex-direction:column;gap:5px;align-items:flex-end'>" +
      plantDuePill(p, "water") + plantDuePill(p, "feed") +
    "</div>" +
  "</div>";
}

function renderPlants() {
  _plantEditing = false;
  _plantCancelFn = null;
  _plantPhotoDraft = null;
  if (_plantImporting) { renderPlantImport(); return; }
  if (_plantView === "detail" && _plantOpenId != null) { renderPlantDetail(); return; }
  _plantView = "list";
  var el = document.getElementById("plantsContent");
  if (!el) return;

  // Soonest next water/feed first (overdue sorts ahead of due-today ahead of
  // due-later); plants with no reminder set at all fall to the end, then
  // alphabetically within any tie so the order stays stable.
  var plants = getPlants().slice().sort(function(a, b){
    var da = plantNextDue(a), db = plantNextDue(b);
    if (da === null && db !== null) return 1;
    if (db === null && da !== null) return -1;
    if (da !== null && db !== null && da !== db) return da - db;
    return String((a && a.name) || "").localeCompare(String((b && b.name) || ""));
  });
  if (!plants.length) {
    el.innerHTML = "<div style='text-align:center;color:#7A8A6A;padding:40px 20px'>" +
      "<div style='font-size:40px;margin-bottom:10px'>&#x1FAB4;</div>" +
      "<div style='font-size:16px;font-weight:600;margin-bottom:4px'>No plants yet</div>" +
      "<div style='font-size:13px'>Tap + to add one, or &#x22EF; &rarr; Import to paste one in from a chat.</div></div>";
    return;
  }

  // ── Area filter (v379) ──────────────────────────────────────────────────
  var areas = plantAreas(plants);
  var untagged = plantsInArea(plants, PLANT_AREA_NONE).length;
  // Only worth a row when there's something to choose between: one area (with
  // everything else untagged) already tells you nothing you can't see.
  var showChips = (areas.length + ((untagged && areas.length) ? 1 : 0)) >= 2;
  if (!showChips) _plantArea = "";
  // The chosen area can vanish — its last plant retagged, deleted, or dropped
  // by a sync from the other phone. Fall back to All rather than showing an
  // empty list with no explanation.
  if (_plantArea && _plantArea !== PLANT_AREA_NONE &&
      !areas.some(function(a){ return plantAreaKey(a) === plantAreaKey(_plantArea); })) _plantArea = "";
  if (_plantArea === PLANT_AREA_NONE && !untagged) _plantArea = "";
  var shown = plantsInArea(plants, _plantArea);

  var html = "";
  if (showChips) {
    html += "<div class='chip-scroll' style='display:flex;gap:7px;overflow-x:auto;padding:1px 24px 10px 1px;-webkit-overflow-scrolling:touch'>";
    var chips = [{ kind:"all", v:"", t:"All" }];
    areas.forEach(function(a){ chips.push({ kind:"area", v:a, t:a }); });
    if (untagged) chips.push({ kind:"none", v:"", t:"No area" });
    chips.forEach(function(c){
      var on = c.kind === "all"  ? !_plantArea
             : c.kind === "none" ? _plantArea === PLANT_AREA_NONE
             : plantAreaKey(c.v) === plantAreaKey(_plantArea);
      html += "<button class='plant-area-chip' data-kind='" + esc(c.kind) + "' data-area='" + esc(c.v) + "' " +
        "style='flex-shrink:0;border-radius:20px;padding:7px 13px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;touch-action:manipulation;" +
        (on ? "background:#2E7D4F;color:#fff;border:1.5px solid #2E7D4F" : "background:#fff;color:#5A6A4A;border:1.5px solid #DCE4D2") +
        "'>" + esc(c.t) + "</button>";
    });
    html += "</div>";
  }

  // Counts what's on screen, so the banner and the list can never disagree.
  var due = shown.filter(plantOverdue);
  if (due.length) {
    html += "<div style='background:#FBE4E4;color:#B03030;border-radius:10px;padding:10px 13px;margin-bottom:12px;font-size:13px;font-weight:700'>&#x1F4A7; " +
      due.length + " plant" + (due.length === 1 ? "" : "s") + " need" + (due.length === 1 ? "s" : "") + " watering</div>";
  }
  if (!shown.length) {
    html += "<div style='text-align:center;color:#7A8A6A;padding:30px 20px;font-size:13px'>" +
      "<div style='font-size:34px;margin-bottom:8px'>&#x1F50D;</div>" +
      "<div style='font-size:15px;font-weight:600;margin-bottom:4px'>No plants in this area</div>" +
      "<div>Tap <b>All</b> above to see every plant.</div></div>";
  }
  shown.forEach(function(p){ html += plantCardHTML(p); });
  html += "<button id='plExportAll' style='width:100%;padding:12px;border:1.5px solid #DCE4D2;background:#fff;color:#5A6A4A;border-radius:10px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;margin-top:8px;touch-action:manipulation'>&#x1F4E4; Export all plants (JSON)</button>" +
    "<div style='font-size:11px;color:#9A9A7A;text-align:center;margin:6px 2px 0;line-height:1.5'>The written care notes only &mdash; photos and care logs live in the full backup under Settings.</div>";
  el.innerHTML = html;

  el.querySelectorAll(".plant-card").forEach(function(card){
    card.addEventListener("click", function(){
      _plantListScrollPos = window.scrollY;
      _plantOpenId = +card.dataset.pid;
      _plantView = "detail";
      renderPlantDetail();
      window.scrollTo(0, 0);
    });
  });
  el.querySelectorAll(".plant-area-chip").forEach(function(chip){
    chip.addEventListener("click", function(){
      var k = chip.dataset.kind;
      _plantArea = k === "all" ? "" : (k === "none" ? PLANT_AREA_NONE : (chip.dataset.area || ""));
      renderPlants();
    });
  });
  var expAll = document.getElementById("plExportAll");
  if (expAll) expAll.addEventListener("click", function(){
    plantDownloadJSON({ hearth: PLANT_FILE_TAG, plants: getPlants().map(plantExportObj) }, "hearth-plants.json");
  });
}

// Import screen (v378). Step 1 pastes the file, step 2 chooses where it lands —
// deliberately two steps so nothing is written until he's picked a destination
// (the same shape as the trip importer).
function renderPlantImport() {
  var el = document.getElementById("plantsContent");
  if (!el) return;
  function leave() {
    _plantImporting = false; _plantImportParsed = null;
    _plantView = "list"; _plantOpenId = null;
    renderPlants(); window.scrollTo(0, 0);
  }

  if (!_plantImportParsed) {
    el.innerHTML =
      "<button id='plImpCancel' style='border:none;background:none;color:#2E7D4F;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px;touch-action:manipulation'>&larr; Cancel</button>" +
      "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:10px;color:#1A2E1E'>Import plant</div>" +
      "<div style='font-size:13px;color:#4A5A3A;background:#F2F7EE;border:1px solid #DCE4D2;border-radius:10px;padding:12px 14px;margin-bottom:12px;line-height:1.65'>" +
        "<b>How to use this with an AI chat:</b>" +
        "<div style='margin-top:6px'>1. Copy the prompt below.</div>" +
        "<div>2. Start a chat, paste it, and attach a photo of the plant plus anything you already know about it.</div>" +
        "<div>3. Paste the JSON it replies with into the box below.</div>" +
      "</div>" +
      "<button id='plCopyPrompt' style='width:100%;padding:12px;border:1.5px solid #2E7D4F;background:#fff;color:#2E7D4F;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:6px;touch-action:manipulation'>&#x1F4CB; Copy the prompt</button>" +
      "<details style='margin-bottom:14px'><summary style='font-size:12px;color:#7A8A6A;cursor:pointer;padding:4px 2px'>See the prompt</summary>" +
        "<textarea id='plPromptText' readonly rows='10' style='" + recipeInputCss() + "margin-top:8px;resize:vertical;line-height:1.5;font-size:11px;font-family:monospace'>" + esc(plantAIPrompt()) + "</textarea>" +
      "</details>" +
      "<textarea id='plImportJson' rows='8' placeholder='Paste the JSON here&hellip;' style='" + recipeInputCss() + "margin-bottom:14px;resize:vertical;line-height:1.5;font-size:12px;font-family:monospace'></textarea>" +
      "<button id='plImportGo' style='width:100%;padding:13px;border:none;background:#2E7D4F;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation'>Next &rsaquo;</button>";

    document.getElementById("plImpCancel").addEventListener("click", leave);
    document.getElementById("plCopyPrompt").addEventListener("click", plantCopyPrompt);
    document.getElementById("plImportGo").addEventListener("click", function(){
      var raw = stripPasteFence(document.getElementById("plImportJson").value);
      if (!raw) { toast("Paste the JSON first"); return; }
      var parsed = parsePlantFile(raw);
      if (parsed.error) { toast(parsed.error); return; }
      _plantImportParsed = parsed.plants;
      renderPlantImport();
      window.scrollTo(0, 0);
    });
    return;
  }

  // Step 2 — destination. Nothing is written until he taps Import at the
  // bottom, which is the whole point of the two-step shape.
  //
  // v433: a multi-plant file used to have exactly one button, "Add all N as
  // new plants", so re-importing his own exported shelf duplicated every plant
  // and stranded the originals (and their care history) beside the copies.
  // Each row now carries its own destination, defaulted by exact name match.
  var list = _plantImportParsed;
  var one = list.length === 1 ? list[0] : null;
  var filled = one ? PLANT_SECTIONS.filter(function(sec){ return plantCleanText(one[sec.key]); }).length : 0;
  var existing = getPlants().slice().sort(function(a, b){
    return String((a && a.name) || "").localeCompare(String((b && b.name) || ""));
  });

  var html = "<button id='plImpBack' style='border:none;background:none;color:#2E7D4F;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px;touch-action:manipulation'>&larr; Back</button>" +
    "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:10px;color:#1A2E1E'>Import plant" + (one ? "" : "s") + "</div>";

  var noteCss = "font-size:11px;color:#9A9A7A;margin:8px 2px 0;line-height:1.5";
  var safetyNote = "Updating fills in the sections this file has and leaves the rest of your notes alone. Your photo and watering history are never changed.";

  if (one) {
    // ── One plant: the v378 screen, with the name match floated to the top ──
    html += "<div style='background:#F2F7EE;border:1px solid #C8DCBC;border-radius:10px;padding:12px 14px;margin-bottom:14px'>" +
      "<div style='font-size:15px;font-weight:700;color:#1A2E1E'>" + esc(plantCleanText(one.name)) + "</div>" +
      (plantCleanText(one.latin) ? "<div style='font-size:12px;color:#7A8A6A;font-style:italic;margin-top:2px'>" + esc(plantCleanText(one.latin)) + "</div>" : "") +
      "<div style='font-size:12px;color:#5A6A4A;margin-top:5px'>" + filled + " of " + PLANT_SECTIONS.length + " section" + (filled === 1 ? "" : "s") + " filled in" +
        (plantCleanDays(one.waterDays) ? " &middot; water every " + plantCleanDays(one.waterDays) + " days" : "") + "</div>" +
    "</div>";

    html += "<button id='plImpNew' style='width:100%;padding:13px;border:none;background:#2E7D4F;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation'>Add as a new plant</button>";

    if (existing.length) {
      // Same-name plants first, so the one he almost certainly means is not
      // eleven rows down the alphabet. Order only — nothing is pre-tapped.
      var oneMatches = plantNameMatches(one.name, existing);
      var oneIsMatch = {};
      oneMatches.forEach(function(p){ oneIsMatch[p.id] = true; });
      var ordered = existing.slice().sort(function(a, b){
        var am = oneIsMatch[a.id] ? 0 : 1, bm = oneIsMatch[b.id] ? 0 : 1;
        if (am !== bm) return am - bm;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
      html += "<div style='font-size:13px;color:#7A8A6A;text-align:center;margin:16px 0 10px;font-weight:600'>&mdash; or update one you already have &mdash;</div>";
      ordered.forEach(function(p){
        var mark = oneIsMatch[p.id];
        html += "<button class='plImpTarget' data-pid='" + esc(p.id) + "' style='display:block;width:100%;text-align:left;padding:11px 14px;margin-bottom:6px;border:1px solid " +
          (mark ? "#8FBF7A" : "#DCE4D2") + ";background:" + (mark ? "#F4FAF0" : "#fff") + ";border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;color:#2A3A22;cursor:pointer;touch-action:manipulation'>" +
          esc(p.name || "Untitled plant") +
          (plantCleanText(p.room) ? "<span style='color:#9A9A7A;font-weight:600'> &middot; " + esc(plantCleanText(p.room)) + "</span>" : "") +
          "<span style='float:right;color:#2E7D4F;font-size:12px;font-weight:700'>" + (mark ? "Same name" : "Update") + "</span></button>";
      });
      html += "<div style='" + noteCss + "'>" + safetyNote + "</div>";
    }
  } else {
    // ── Several plants: one destination per row ────────────────────────────
    html += "<div style='background:#F2F7EE;border:1px solid #C8DCBC;border-radius:10px;padding:12px 14px;margin-bottom:6px'>" +
      "<div style='font-size:15px;font-weight:700;color:#1A2E1E;margin-bottom:3px'>" + list.length + " plants in this file</div>" +
      "<div style='font-size:12px;color:#5A6A4A;line-height:1.6'>Anything with the same name as a plant you already have is set to update it. Change any row you disagree with.</div>" +
    "</div>";
    html += "<div style='text-align:right;margin-bottom:10px'>" +
      "<button id='plImpAllNew' style='border:none;background:none;color:#2E7D4F;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:6px 2px;touch-action:manipulation'>Set every row to &ldquo;add as new&rdquo;</button></div>";

    list.forEach(function(src, idx) {
      var nm = plantCleanText(src.name);
      var matches = plantNameMatches(nm, existing);
      var others  = existing.filter(function(p){ return matches.indexOf(p) === -1; });
      // Exactly one match is safe to pre-select; several is exactly the case a
      // default would get wrong, so it starts unset and blocks Import.
      var def = matches.length === 1 ? String(matches[0].id) : (matches.length ? "" : "new");

      var badge, badgeCss;
      if (matches.length === 1)      { badge = "Matches a plant you have";  badgeCss = "background:#EAF4E2;color:#3D6B2E"; }
      else if (matches.length === 0) { badge = "New to your book";          badgeCss = "background:#F0EFE8;color:#7A7A62"; }
      else                           { badge = "&#x26A0;&#xFE0F; " + matches.length + " plants share this name"; badgeCss = "background:#FBF0DC;color:#8A6A2A"; }

      function optLabel(p) {
        return esc(p.name || "Untitled plant") + (plantCleanText(p.room) ? " · " + esc(plantCleanText(p.room)) : "");
      }
      function opt(value, label) {
        return "<option value='" + esc(value) + "'" + (value === def ? " selected" : "") + ">" + label + "</option>";
      }

      var opts = "";
      if (matches.length > 1) opts += "<option value='' selected>Choose which one&hellip;</option>";
      matches.forEach(function(p){ opts += opt(String(p.id), "Update " + optLabel(p)); });
      opts += opt("new",  "Add as a new plant");
      opts += opt("skip", "Skip this one");
      if (others.length) {
        opts += "<optgroup label='Update a different plant'>";
        others.forEach(function(p){ opts += opt(String(p.id), optLabel(p)); });
        opts += "</optgroup>";
      }

      html += "<div style='background:#fff;border:1px solid #E4EADC;border-radius:11px;padding:11px 13px;margin-bottom:8px'>" +
        "<div style='display:flex;align-items:baseline;gap:8px;flex-wrap:wrap'>" +
          "<div style='font-size:15px;font-weight:700;color:#1A2E1E'>" + esc(nm || "Untitled plant") + "</div>" +
          "<span style='" + badgeCss + ";font-size:11px;font-weight:700;border-radius:6px;padding:2px 6px'>" + badge + "</span>" +
        "</div>" +
        (plantCleanText(src.latin) ? "<div style='font-size:12px;color:#7A8A6A;font-style:italic;margin-top:1px'>" + esc(plantCleanText(src.latin)) + "</div>" : "") +
        "<select class='plImpRow' data-idx='" + esc(idx) + "' style='" + recipeInputCss() + "margin-top:8px'>" + opts + "</select>" +
      "</div>";
    });

    html += "<div id='plImpSummary' style='font-size:13px;font-weight:700;color:#5A6A4A;text-align:center;margin:14px 2px 10px'></div>" +
      "<button id='plImpGo' style='width:100%;padding:14px;border:none;background:#2E7D4F;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation'>Import</button>" +
      "<div style='" + noteCss + "'>" + safetyNote + "</div>";
  }
  el.innerHTML = html;

  document.getElementById("plImpBack").addEventListener("click", function(){
    _plantImportParsed = null; renderPlantImport(); window.scrollTo(0, 0);
  });

  // Reads the whole screen back into an importPlantsByPlan() plan. Read from
  // the DOM rather than held in a variable, so nothing has to re-render (and
  // lose every dropdown) when one row changes.
  function plImpReadPlan() {
    var plan = [], unresolved = [];
    el.querySelectorAll(".plImpRow").forEach(function(sel){
      var idx = parseInt(sel.getAttribute("data-idx"), 10);
      var src = list[idx];
      if (!src) return;                                  // guard a stale index
      var v = String(sel.value || "");
      if (!v) { unresolved.push(sel); return; }
      if (v === "new" || v === "skip") plan.push({ src: src, action: v });
      else plan.push({ src: src, action: "update", id: parseInt(v, 10) });
    });
    return { plan: plan, unresolved: unresolved };
  }

  var summaryEl = document.getElementById("plImpSummary");
  function plImpRefreshSummary() {
    if (!summaryEl) return;
    var r = plImpReadPlan(), u = 0, n = 0, k = 0;
    r.plan.forEach(function(x){ if (x.action === "update") u++; else if (x.action === "new") n++; else k++; });
    var bits = [];
    if (u) bits.push(u + " updated");
    if (n) bits.push(n + " added as new");
    if (k) bits.push(k + " skipped");
    if (r.unresolved.length) bits.push("<span style='color:#A8762A'>" + r.unresolved.length + " still to choose</span>");
    summaryEl.innerHTML = bits.join(" &middot; ") || "Nothing selected";
  }
  el.querySelectorAll(".plImpRow").forEach(function(sel){
    sel.addEventListener("change", plImpRefreshSummary);
  });
  plImpRefreshSummary();

  var allNew = document.getElementById("plImpAllNew");
  if (allNew) allNew.addEventListener("click", function(){
    // The pre-v433 one-tap behaviour, kept as a shortcut: a file from someone
    // else's shelf is all new plants, and picking that eleven times is a chore.
    el.querySelectorAll(".plImpRow").forEach(function(sel){ sel.value = "new"; });
    plImpRefreshSummary();
  });

  var go = document.getElementById("plImpGo");
  if (go) go.addEventListener("click", function(){
    var r = plImpReadPlan();
    if (r.unresolved.length) {
      toast("Choose what to do with " + r.unresolved.length + " plant" + (r.unresolved.length === 1 ? "" : "s") + " first");
      r.unresolved[0].scrollIntoView({ block: "center" });
      return;
    }
    var u = 0, n = 0, k = 0;
    r.plan.forEach(function(x){ if (x.action === "update") u++; else if (x.action === "new") n++; else k++; });
    if (!u && !n) { toast("Every plant is set to skip"); return; }
    var bits = [];
    if (u) bits.push("update " + u);
    if (n) bits.push("add " + n + " as new");
    if (k) bits.push("skip " + k);
    confirmDialog("Import: " + bits.join(", ") + "?", function(){
      var res = importPlantsByPlan(r.plan);
      _plantImporting = false; _plantImportParsed = null;
      _plantOpenId = null; _plantView = "list";
      renderPlants(); window.scrollTo(0, 0);
      if (res.missing) toast(res.missing + " plant" + (res.missing === 1 ? " was" : "s were") + " deleted on another device and skipped");
      else toast("&#x1FAB4; " + (res.updated + res.added) + " plant" + ((res.updated + res.added) === 1 ? "" : "s") + " imported");
    });
  });

  var impNew = document.getElementById("plImpNew");
  if (impNew) impNew.addEventListener("click", function(){
    var firstId = importPlantsAsNew(list);
    if (firstId === null) { toast("Nothing to import"); return; }
    _plantImporting = false; _plantImportParsed = null;
    _plantOpenId = firstId; _plantView = "detail";
    renderPlants(); window.scrollTo(0, 0);
    toast("&#x1FAB4; Plant imported");
  });

  el.querySelectorAll(".plImpTarget").forEach(function(btn){
    btn.addEventListener("click", function(){
      var pid = parseInt(btn.getAttribute("data-pid"), 10);
      var target = getPlants().find(function(x){ return x && x.id === pid; });
      confirmDialog("Update " + esc((target && target.name) || "this plant") + " from this file?", function(){
        var res = importPlantInto(pid, one);
        if (res.error) { toast(res.error); return; }
        _plantImporting = false; _plantImportParsed = null;
        _plantOpenId = pid; _plantView = "detail";
        renderPlants(); window.scrollTo(0, 0);
        toast("&#x1FAB4; Plant updated");
      });
    });
  });
}

function plantCareRowHTML(p, kind) {
  var isFeed = kind === "feed";
  var last = plantLastTs(isFeed ? p.feedLog : p.waterLog);
  var iv = parseInt(isFeed ? p.feedDays : p.waterDays, 10) || 0;
  var d = plantDueIn(p, kind);
  var off = isFeed ? plantFeedPaused(p) : !!p.waterOff;
  var col = (d !== null && d < 0) ? "#B03030" : (d === 0 ? "#8A6A10" : "#7A8A6A");
  var sub = off ? (isFeed ? "feed reminder paused for the season" : "watering reminder off (outdoor)")
    : (iv ? (plantDueLabel(p, kind) || ("every " + iv + " day" + (iv === 1 ? "" : "s"))) : "no reminder set");
  var loggedToday = !!last && plantDaysSince(last) === 0;
  return "<div style='display:flex;align-items:center;gap:10px;padding:11px 0" + (isFeed ? "" : ";border-bottom:1px solid #EDF0E8") + "'>" +
    "<span style='font-size:18px'>" + (isFeed ? "&#x1F331;" : "&#x1F4A7;") + "</span>" +
    "<div style='flex:1;min-width:0'>" +
      "<div style='font-size:14px;font-weight:700;color:#2A3A22'>" + (isFeed ? "Fed" : "Watered") + " " + esc(plantAgoLabel(last)) + "</div>" +
      "<div style='font-size:12px;color:" + col + "'>" + esc(sub) + "</div>" +
    "</div>" +
    (loggedToday ? "<button class='plant-undo' data-kind='" + esc(kind) + "' aria-label='Undo today&#39;s " + (isFeed ? "feed" : "water") + "' style='border:none;background:none;color:#9A9A7A;font-size:13px;font-weight:700;cursor:pointer;padding:11px 8px;touch-action:manipulation'>Undo</button>" : "") +
    "<button class='plant-log' data-kind='" + esc(kind) + "' style='border:none;background:#2E7D4F;color:#fff;border-radius:9px;padding:10px 15px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation;min-height:44px'>Log</button>" +
  "</div>";
}
// The care logs were written from v377 and read by nothing but plantLastTs
// (log[0]) until v416 — this is the rest of them.
function plantCareHistoryHTML(p) {
  var evs = plantCareEvents(p);
  if (!evs.length) return "";                    // never logged → no empty box on a brand-new plant
  var open = _plantHistoryOpenId === p.id;
  var shown = open ? evs : evs.slice(0, PLANT_HISTORY_PREVIEW);
  var html = "<div style='background:#fff;border:1px solid #E4EADC;border-radius:12px;padding:14px;margin-bottom:14px'>" +
    "<div style='font-size:12px;font-weight:700;color:#2E7D4F;text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px'>&#x1F4C5; Recent care</div>";
  shown.forEach(function(ev, i){
    html += "<div class='plant-hist-row' style='display:flex;align-items:baseline;gap:8px;padding:7px 0" + (i ? ";border-top:1px solid #EDF0E8" : "") + "'>" +
      "<span style='font-size:13px'>" + plantCareEventIcons(ev) + "</span>" +
      "<div style='flex:1;min-width:0;font-size:13px;color:#3A4A32'>" +
        esc(plantDateLabel(ev.ts) + " · " + plantCareEventWords(ev)) + "</div>" +
      "<div style='font-size:12px;color:#9A9A7A;white-space:nowrap'>" + esc(plantAgoLabel(ev.ts)) + "</div>" +
    "</div>";
  });
  if (evs.length > PLANT_HISTORY_PREVIEW) {
    html += "<button id='plHistToggle' style='width:100%;border:none;background:none;color:#2E7D4F;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:11px 0 2px;touch-action:manipulation'>" +
      (open ? "Show less" : "Show all (" + evs.length + ")") + "</button>";
  }
  return html + "</div>";
}
function plantSectionHTML(sec, text) {
  return "<div style='background:#fff;border:1px solid #E4EADC;border-radius:12px;padding:14px;margin-bottom:10px'>" +
    "<div style='font-size:12px;font-weight:700;color:#2E7D4F;text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px'>" + sec.ico + " " + sec.label + "</div>" +
    "<div style='font-size:14px;line-height:1.65;color:#3A4A32;white-space:pre-wrap'>" + esc(text) + "</div>" +
  "</div>";
}

function renderPlantDetail() {
  var el = document.getElementById("plantsContent");
  if (!el) return;
  var p = getPlants().find(function(x){ return x && x.id === _plantOpenId; });
  if (!p) { _plantView = "list"; _plantOpenId = null; renderPlants(); return; }   // stale id → back to the list

  var html = "<button id='plBack' style='border:none;background:none;color:#2E7D4F;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px;touch-action:manipulation'>&larr; All plants</button>";

  html += "<div style='display:flex;gap:12px;align-items:center;margin-bottom:14px'>" +
    plantThumbHTML(p, 72) +
    "<div style='flex:1;min-width:0'>" +
      "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;color:#1A2E1E;line-height:1.25'>" + esc(p.name || "Untitled plant") + "</div>" +
      (p.latin ? "<div style='font-size:13px;color:#7A8A6A;font-style:italic;margin-top:2px'>" + esc(p.latin) + "</div>" : "") +
      (p.room  ? "<div style='font-size:12px;color:#9A9A7A;margin-top:3px'>&#x1F4CD; " + esc(p.room) + "</div>" : "") +
    "</div>" +
  "</div>";

  // Care panel — the bit a note can't do: what you actually did, and when.
  html += "<div style='background:#fff;border:1px solid #E4EADC;border-radius:12px;padding:2px 14px;margin-bottom:14px'>" +
    plantCareRowHTML(p, "water") + plantCareRowHTML(p, "feed") + "</div>";

  // …and what you did before that.
  html += plantCareHistoryHTML(p);

  // v432 — the photo link, if there is one. Rendered through the gate rather
  // than from the raw field, so a record that arrived from sync carrying
  // something that isn't an http(s) address simply shows no row.
  var photoLink = plantPhotoLinkUrl(p);
  if (photoLink) {
    html += "<a href='" + esc(photoLink) + "' target='_blank' rel='noopener noreferrer' " +
      "style='display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #E4EADC;border-radius:12px;" +
      "padding:12px 14px;margin-bottom:14px;text-decoration:none;color:#2E7D4F;font-size:14px;font-weight:700;touch-action:manipulation'>" +
      "<span style='flex:1'>&#x1F5BC;&#xFE0F; Photo of this plant</span><span style='font-size:16px'>&#x2197;</span></a>";
  }

  // Summary + watering/feeding first, then everything else under a divider.
  var lowerStarted = false;
  PLANT_SECTIONS.forEach(function(sec){
    var text = (p[sec.key] || "").trim();
    if (!text) return;                                   // an empty section simply doesn't appear
    if (!sec.top && !sec.care && !lowerStarted) {
      lowerStarted = true;
      html += "<div style='display:flex;align-items:center;gap:10px;margin:20px 2px 12px'>" +
        "<div style='flex:1;height:1px;background:#DCE4D2'></div>" +
        "<span style='font-size:11px;font-weight:700;color:#9AA88A;text-transform:uppercase;letter-spacing:.6px'>More on this plant</span>" +
        "<div style='flex:1;height:1px;background:#DCE4D2'></div></div>";
    }
    html += plantSectionHTML(sec, text);
  });

  html += "<div style='display:flex;gap:8px;margin-top:18px'>" +
    "<button id='plEdit' style='flex:1;padding:13px;border:none;background:#2E7D4F;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation'>Edit</button>" +
    "<button id='plDelete' style='padding:13px 16px;border:1px solid #E0C0C0;background:#fff;color:#B03030;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation'>Delete</button>" +
  "</div>" +
  "<button id='plExport' style='width:100%;padding:12px;border:1.5px solid #DCE4D2;background:#fff;color:#5A6A4A;border-radius:10px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;margin-top:8px;touch-action:manipulation'>&#x1F4E4; Export this plant (JSON)</button>";

  el.innerHTML = html;

  document.getElementById("plBack").addEventListener("click", function(){
    _plantView = "list"; _plantOpenId = null;
    renderPlants();
    window.scrollTo(0, _plantListScrollPos || 0);
  });
  el.querySelectorAll(".plant-log").forEach(function(btn){
    btn.addEventListener("click", function(){ plantLogCare(p.id, btn.dataset.kind); renderPlantDetail(); });
  });
  el.querySelectorAll(".plant-undo").forEach(function(btn){
    btn.addEventListener("click", function(){ plantUndoCare(p.id, btn.dataset.kind); renderPlantDetail(); });
  });
  var histToggle = document.getElementById("plHistToggle");   // only present once there are more than PLANT_HISTORY_PREVIEW days
  if (histToggle) histToggle.addEventListener("click", function(){
    _plantHistoryOpenId = (_plantHistoryOpenId === p.id) ? null : p.id;
    renderPlantDetail();
  });
  document.getElementById("plEdit").addEventListener("click", function(){ openPlantEditor(p.id); });
  document.getElementById("plDelete").addEventListener("click", function(){
    confirmDialog("Delete " + esc(p.name || "this plant") + "?", function(){ deletePlant(p.id); });
  });
  document.getElementById("plExport").addEventListener("click", function(){
    var cur = getPlants().find(function(x){ return x && x.id === p.id; });
    if (!cur) { toast("Plant not found"); return; }
    plantDownloadJSON(Object.assign({ hearth: PLANT_FILE_TAG }, plantExportObj(cur)),
                      "hearth-plant-" + plantFileSlug(cur.name) + ".json");
  });
}

function openPlantEditor(id) {
  var el = document.getElementById("plantsContent");
  if (!el) return;
  var existing = id != null ? getPlants().find(function(x){ return x && x.id === id; }) : null;
  if (id != null && !existing) { toast("Plant not found"); _plantView = "list"; _plantOpenId = null; renderPlants(); return; }
  var p = existing || { name:"", latin:"", emoji:"", room:"", photo:"", photoLink:"", waterDays:7, feedDays:0, waterOff:false, feedPauseFrom:0, feedPauseTo:0 };

  _plantEditing = true;
  _plantView = "editor";
  _plantImporting = false; _plantImportParsed = null;   // opening the editor abandons any half-finished import
  _plantPhotoDraft = p.photo || "";

  function lbl(t){ return "<div style='font-size:12px;font-weight:700;color:#5A6A4A;margin:12px 2px 5px'>" + t + "</div>"; }

  var html = "<button id='plCancel' style='border:none;background:none;color:#2E7D4F;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px;touch-action:manipulation'>&larr; Cancel</button>" +
    "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:6px;color:#1A2E1E'>" + (existing ? "Edit plant" : "New plant") + "</div>";

  html += "<div style='display:flex;gap:12px;align-items:center;margin:14px 0 4px'>" +
    "<div id='plPhotoPreview'>" + plantThumbHTML({ photo:_plantPhotoDraft, emoji:p.emoji }, 64) + "</div>" +
    "<div style='flex:1;min-width:0'>" +
      "<label for='plPhoto' style='display:inline-block;background:#EAF2E4;color:#2E7D4F;border-radius:9px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation'>&#x1F4F7; Choose photo</label>" +
      "<input id='plPhoto' type='file' accept='image/*' style='display:none'>" +
      // Always rendered, just hidden when there's nothing to remove — a photo
      // added during this editing session needs the button to appear without a
      // re-render (which would throw away everything already typed below).
      "<button id='plPhotoClear' style='border:none;background:none;color:#B03030;font-size:13px;font-weight:700;cursor:pointer;padding:10px 8px;touch-action:manipulation" + (_plantPhotoDraft ? "" : ";display:none") + "'>Remove</button>" +
      "<div style='font-size:11px;color:#9A9A7A;margin-top:4px'>Shrunk to a thumbnail before it's saved.</div>" +
    "</div>" +
  "</div>";

  html += lbl("Link to a photo (optional)") +
    "<input id='plPhotoLink' type='url' inputmode='url' value='" + esc(p.photoLink || "") + "' placeholder='https://&hellip;' style='" + recipeInputCss() + "'>" +
    "<div style='font-size:11px;color:#9A9A7A;margin:5px 2px 0'>A web page showing what this plant looks like &mdash; handy for telling two similar plants apart. Hearth keeps the link, never the picture.</div>";

  html += lbl("Name") + "<input id='plName' type='text' value='" + esc(p.name || "") + "' placeholder='Spider Plant' style='" + recipeInputCss() + "'>";
  html += lbl("Botanical name (optional)") + "<input id='plLatin' type='text' value='" + esc(p.latin || "") + "' placeholder=\"Chlorophytum comosum 'Vittatum'\" style='" + recipeInputCss() + "'>";
  html += "<div style='display:flex;gap:10px'>" +
    // Suggests the areas already in use so spellings don't drift into two chips,
    // while staying a plain text box for a brand-new area.
    "<div style='flex:1'>" + lbl("Area") + "<input id='plRoom' type='text' list='plAreaList' value='" + esc(p.room || "") + "' placeholder='Kitchen' style='" + recipeInputCss() + "'>" +
      "<datalist id='plAreaList'>" + plantAreas(getPlants()).map(function(a){ return "<option value='" + esc(a) + "'>"; }).join("") + "</datalist></div>" +
    "<div style='width:92px'>" + lbl("Icon") + "<input id='plEmoji' type='text' value='" + esc(p.emoji || "") + "' placeholder='&#x1FAB4;' maxlength='4' style='" + recipeInputCss() + "text-align:center'></div>" +
  "</div>";
  html += "<div style='display:flex;gap:10px'>" +
    "<div style='flex:1'>" + lbl("Water every (days)") + "<input id='plWaterDays' type='number' inputmode='numeric' min='0' max='365' value='" + (parseInt(p.waterDays, 10) || 0) + "' style='" + recipeInputCss() + "'></div>" +
    "<div style='flex:1'>" + lbl("Feed every (days)") + "<input id='plFeedDays' type='number' inputmode='numeric' min='0' max='365' value='" + (parseInt(p.feedDays, 10) || 0) + "' style='" + recipeInputCss() + "'></div>" +
  "</div>" +
  "<div style='font-size:11px;color:#9A9A7A;margin:5px 2px 0'>0 means no reminder. Seasonal changes belong in the Watering and Feeding notes below.</div>";

  html += "<label style='display:flex;align-items:center;gap:8px;margin:12px 2px 0;font-size:13px;color:#3A4A32;cursor:pointer'>" +
    "<input id='plWaterOff' type='checkbox'" + (p.waterOff ? " checked" : "") + " style='width:18px;height:18px;flex-shrink:0'> " +
    "Outdoor plant &mdash; skip watering reminders (rain handles it)" +
  "</label>";

  html += lbl("Pause feed reminders (seasonal)") +
    "<div style='display:flex;gap:8px;align-items:center'>" +
      "<select id='plFeedPauseFrom' style='" + recipeInputCss() + "flex:1'>" + plantMonthOptionsHTML(p.feedPauseFrom) + "</select>" +
      "<span style='font-size:12px;color:#9A9A7A;flex-shrink:0'>to</span>" +
      "<select id='plFeedPauseTo' style='" + recipeInputCss() + "flex:1'>" + plantMonthOptionsHTML(p.feedPauseTo) + "</select>" +
    "</div>" +
    "<div style='font-size:11px;color:#9A9A7A;margin:5px 2px 0'>e.g. September to April, for plants that shouldn't be fed over winter. Leave both as \"No pause\" to always use the feed reminder above.</div>";

  PLANT_SECTIONS.forEach(function(sec){
    html += lbl(sec.ico + " " + sec.label) +
      "<textarea id='plF_" + sec.key + "' rows='4' placeholder='" + esc(sec.hint) + "' style='" + recipeInputCss() + "resize:vertical;line-height:1.6'>" + esc(p[sec.key] || "") + "</textarea>";
  });

  html += "<button id='plSave' style='width:100%;padding:14px;border:none;background:#2E7D4F;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;margin-top:18px;touch-action:manipulation'>Save</button>";

  el.innerHTML = html;

  var plCancel = function(){
    _plantEditing = false; _plantCancelFn = null; _plantPhotoDraft = null;
    if (existing) { _plantView = "detail"; _plantOpenId = existing.id; renderPlantDetail(); }
    else { _plantView = "list"; _plantOpenId = null; renderPlants(); }
  };
  _plantCancelFn = plCancel;
  document.getElementById("plCancel").addEventListener("click", plCancel);

  document.getElementById("plPhoto").addEventListener("change", function(e){
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    plantShrinkPhoto(f, function(dataUrl){
      if (!dataUrl) { toast("Couldn't read that image"); return; }
      _plantPhotoDraft = dataUrl;
      // Swap the preview in place — a full re-render would throw away
      // everything already typed into the section boxes.
      var prev = document.getElementById("plPhotoPreview");
      if (prev) prev.innerHTML = plantThumbHTML({ photo:dataUrl }, 64);
      var clr = document.getElementById("plPhotoClear");
      if (clr) clr.style.display = "";
    });
  });
  var clearBtn = document.getElementById("plPhotoClear");
  if (clearBtn) clearBtn.addEventListener("click", function(){
    _plantPhotoDraft = "";
    var prev = document.getElementById("plPhotoPreview");
    if (prev) prev.innerHTML = plantThumbHTML({ photo:"", emoji:(document.getElementById("plEmoji")||{}).value }, 64);
    clearBtn.style.display = "none";
  });

  document.getElementById("plSave").addEventListener("click", function(){
    var name = document.getElementById("plName").value.trim();
    if (!name) { toast("Give the plant a name"); return; }
    // Checked before anything is written, so a typo'd link is refused rather
    // than saved as a dead one. Same gate the detail view renders through, so
    // what saves and what is offered as a link can never disagree.
    var photoLinkRaw = document.getElementById("plPhotoLink").value.trim();
    var photoLink = photoLinkRaw ? applianceLinkUrl(photoLinkRaw) : "";
    if (photoLinkRaw && !photoLink) { toast("The photo link should be a web address"); return; }
    var all = getPlants(), rec;
    if (existing) {
      var i = all.findIndex(function(x){ return x && x.id === existing.id; });
      if (i < 0) { toast("That plant was deleted on another device"); plCancel(); return; }  // guard the -1
      rec = all[i];
    } else {
      rec = { id: Date.now() + Math.floor(Math.random() * 1000), waterLog:[], feedLog:[] };
      all.push(rec);
    }
    rec.name  = name;
    rec.latin = document.getElementById("plLatin").value.trim();
    rec.room  = document.getElementById("plRoom").value.trim();
    rec.emoji = document.getElementById("plEmoji").value.trim().slice(0, 4);
    rec.waterDays = Math.max(0, Math.min(365, parseInt(document.getElementById("plWaterDays").value, 10) || 0));
    rec.feedDays  = Math.max(0, Math.min(365, parseInt(document.getElementById("plFeedDays").value, 10) || 0));
    rec.waterOff = !!document.getElementById("plWaterOff").checked;
    var fpFrom = plantCleanMonth(document.getElementById("plFeedPauseFrom").value);
    var fpTo   = plantCleanMonth(document.getElementById("plFeedPauseTo").value);
    // A half-set range (only one side chosen) is not a valid pause — clear both
    // rather than silently pausing on an unintended single month.
    rec.feedPauseFrom = (fpFrom && fpTo) ? fpFrom : 0;
    rec.feedPauseTo   = (fpFrom && fpTo) ? fpTo   : 0;
    // "" rather than a dropped key — an absent field comes back from the other
    // device on the next sync (the v296 rule).
    rec.photoLink = photoLink;
    PLANT_SECTIONS.forEach(function(sec){
      var f = document.getElementById("plF_" + sec.key);
      if (f) rec[sec.key] = f.value.trim();
    });
    if (_plantPhotoDraft !== null) rec.photo = _plantPhotoDraft;
    if (!Array.isArray(rec.waterLog)) rec.waterLog = [];
    if (!Array.isArray(rec.feedLog))  rec.feedLog  = [];
    rec.updated = Date.now();

    _plantEditing = false; _plantCancelFn = null; _plantPhotoDraft = null;
    savePlants(all);
    _plantOpenId = rec.id; _plantView = "detail";
    renderPlantDetail();
    window.scrollTo(0, 0);
    toast(existing ? "Plant updated" : "&#x1FAB4; Plant added");
  });
}

