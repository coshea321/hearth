// ============================================================
// HEALTH (v449) — the family's MEDICAL HISTORY, per person.
//
// Design confirmed 31/08/2026, and REFRAMED the same day: the first cut of
// this section was a forward-looking reference book (it led with "Coming up"
// and its centre of gravity was the next appointment). Cathal's call before
// it merged was that what he actually wants is a HISTORY — GP visits and
// what was said, the conditions he has, diagnoses as they were made, test
// results, and links to the letters and scans that go with them. So the
// screen now leads with what IS and what HAPPENED, and the upcoming half is
// a group at the top rather than the point of the section.
//
// What it deliberately still does NOT do: LOG anything. Track has the
// household medicine log (v380) and Body; Baby has the weight-based dosing
// calculator. A fourth surface onto that data is how a feature gets rebuilt
// here by accident. This section records what happened; it does not track.
//
// ONE STORE, not seven: every record carries a `kind` from HEALTH_KINDS, the
// way a trip booking carries a TRIP_BOOKING_TYPES type. Seven stores would
// mean seven merges, seven tombstone sets and seven pieces of the backup
// payload to keep in step forever.
//
// Storage contract is the Plants/Watchlist/Inventory one: one record is one
// edit unit, so whole-record newest-wins by `updated` with tombstone
// filtering and no nested merge. `files` rides INSIDE the record for exactly
// that reason — the whole record is the unit, so a nested array needs no
// merge of its own. HOUSEHOLD-SHARED (confirmed 31/08/2026), with the
// standing caveat recorded in HEARTH-backlog.md: this is the most sensitive
// data in the app and github.io still serves it ungated.
// ============================================================
var HEALTH_COLOR = "#2F6E6E";
var HEALTH_KINDS = [
  { key:"visit",       label:"Visit",       plural:"Visits",                 ico:"&#x1FA7A;" },
  { key:"diagnosis",   label:"Diagnosis",   plural:"Diagnoses",              ico:"&#x1F52C;" },
  { key:"condition",   label:"Condition",   plural:"Conditions &amp; allergies", ico:"&#x26A0;&#xFE0F;" },
  { key:"test",        label:"Test",        plural:"Tests &amp; results",    ico:"&#x1F9EA;" },
  { key:"medication",  label:"Medication",  plural:"Medication",             ico:"&#x1F48A;" },
  { key:"vaccination", label:"Vaccination", plural:"Vaccinations",           ico:"&#x1F489;" },
  { key:"contact",     label:"Contact",     plural:"Contacts",               ico:"&#x1F3E5;" }
];
// The first cut of v449 called these two something else. Nothing shipped with
// them, but a phone that opened a PR test link has records carrying the old
// word, and reading one as an unknown kind would silently file a booked
// appointment under Visits' fallback anyway — so name the rename instead of
// relying on the fallback to be right by luck.
var HEALTH_KIND_ALIASES = { appointment:"visit", prescription:"medication" };
function healthKindMeta(k) {
  var key = HEALTH_KIND_ALIASES[k] || k;
  for (var i = 0; i < HEALTH_KINDS.length; i++) if (HEALTH_KINDS[i].key === key) return HEALTH_KINDS[i];
  return HEALTH_KINDS[0];   // unknown/missing kind reads as a visit rather than throwing
}

// Three roles, and they decide where a record lands on screen — NOT the kind
// list's order. **Upcoming**: things you attend, so they can be in the future
// (a booked GP appointment is simply a visit whose date hasn't come yet — when
// the day arrives you open the same record and write what was said, which is
// why "appointment" is not a separate kind). **Standing**: states rather than
// events, so they are pinned above the history instead of buried in it by
// date. **History**: the events, all kinds mixed into ONE reverse-chronological
// feed — that feed is what makes this a medical history rather than a filing
// cabinet, so do not split it back into a group per kind.
var HEALTH_UPCOMING_KINDS = ["visit", "test"];
var HEALTH_STANDING_KINDS = ["condition", "medication"];
var HEALTH_HISTORY_KINDS  = ["visit", "diagnosis", "test", "vaccination"];
// `contact` is in none of them on purpose: a directory, listed last.
function healthKindIn(rec, list) { return list.indexOf(healthKindMeta(rec && rec.kind).key) !== -1; }

// What each kind ASKS FOR, and what the shared fields are CALLED for it.
// "" means the field isn't shown for that kind; `time` and `phone` are plain
// booleans because they need no relabelling.
//
// Every record carries every field whatever its kind. A field the current
// kind doesn't show KEEPS its value — the v392 season rule: never destroy
// something he typed because a picker moved. It also means mis-tapping a
// kind and switching back loses nothing.
var HEALTH_KIND_FIELDS = {
  visit:       { title:"What it was for", date:"Date",       time:true,  who:"Who you saw",   dose:"",     expiry:"",                     outcome:"What was said", location:"Where",    phone:true  },
  diagnosis:   { title:"Diagnosis",       date:"Date",       time:false, who:"Diagnosed by",  dose:"",     expiry:"",                     outcome:"",              location:"",         phone:false },
  condition:   { title:"Condition",       date:"Since",      time:false, who:"",              dose:"",     expiry:"",                     outcome:"",              location:"",         phone:false },
  test:        { title:"Test",            date:"Date",       time:true,  who:"Ordered by",    dose:"",     expiry:"",                     outcome:"Result",        location:"Where",    phone:false },
  medication:  { title:"Medicine",        date:"Started",    time:false, who:"Prescribed by", dose:"Dose", expiry:"Prescription runs out", outcome:"",              location:"Pharmacy", phone:true  },
  vaccination: { title:"Vaccine",         date:"Date given", time:false, who:"",              dose:"",     expiry:"",                     outcome:"",              location:"Where",    phone:false },
  contact:     { title:"Name",            date:"",           time:false, who:"Role",          dose:"",     expiry:"",                     outcome:"",              location:"Address",  phone:true  }
};
function healthFields(kind) { return HEALTH_KIND_FIELDS[healthKindMeta(kind).key]; }

function getHealth() {
  var h = storeGet("fl4_health");
  if (!Array.isArray(h)) return [];
  // Guarded at the source, per the v385 getRecipeBook / v388 normaliseNotes
  // lesson: a null from a bad write or a sync merge must never reach a
  // renderer, and fixing it here covers every caller at once.
  return h.filter(function(x){ return x && typeof x === "object"; });
}
function saveHealth(h) {
  storeSet("fl4_health", h);
  pushPersonal();
  if (typeof isHouseholdSet === "function" && isHouseholdSet()) pushHousehold();
}

// ── The two href gates ────────────────────────────────────────────────────
// `files` and `phone` are the ONLY things in this section that become hrefs,
// and both are rebuilt rather than emitted: every file url goes through
// applianceLinkUrl — the shared http(s)-only gate — on save, on import AND
// here at render, and a phone href is reconstructed from digits. That is the
// 30/08 audit's F3 finding applied from the start rather than retrofitted:
// esc() stops attribute-breakout but does nothing about a scheme, and a
// record reaches this store from sync and from restored backups without ever
// passing through the editor. Never add a second copy of either gate.
//
// Files are LINKS, never bytes — the v428 rule. Hearth does not hold a scan
// or a consultant's letter; it holds a link to wherever that already lives,
// which is also the only version worth having at full resolution.
function healthFileList(rec) {
  var out = [];
  var raw = (rec && Array.isArray(rec.files)) ? rec.files : [];
  raw.forEach(function(f){
    if (!f || typeof f !== "object") return;
    var url = applianceLinkUrl(f.url);
    if (!url) return;                                   // refused scheme → the row simply isn't a link
    out.push({ label: String(f.label || "").trim() || "Document", url: url });
  });
  // The first cut of v449 had a single unlabelled `link` field. It is read
  // FORWARD here rather than migrated in storage — one place, no rewrite of
  // records, and the editor writes only `files` from now on.
  if (!out.length && rec && rec.link) {
    var lu = applianceLinkUrl(rec.link);
    if (lu) out.push({ label:"Link", url:lu });
  }
  return out;
}
function healthPhoneHref(rec) {
  var raw = String((rec && rec.phone) || "").trim();
  if (!raw) return "";
  var cleaned = raw.replace(/[^0-9+]/g, "");
  return /^\+?[0-9]{3,20}$/.test(cleaned) ? "tel:" + cleaned : "";
}

// The people actually in use — for the filter chips and the editor datalist.
// Free text on purpose: a fixed enum would need a code change every time the
// family changes, and "Mum" is as valid an answer as a name.
function healthPeople(list) {
  var seen = {}, out = [];
  (list || []).forEach(function(r){
    var p = String((r && r.person) || "").trim();
    if (!p) return;
    var k = p.toLowerCase();
    if (!seen[k]) { seen[k] = true; out.push(p); }
  });
  return out.sort(function(a, b){ return a.localeCompare(b); });
}

// Only a kind you ATTEND can be upcoming, and only with a future date.
// Reuses tripDaysUntil (v298) rather than a second date-difference helper.
// Returns "" for everything else, so callers test the label instead of
// re-deriving "is this still ahead of us".
function healthCountdownLabel(rec) {
  if (!rec || !healthKindIn(rec, HEALTH_UPCOMING_KINDS)) return "";
  var d = tripDaysUntil(rec.date);
  if (d === null || d < 0) return "";
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return "In " + d + " days";
}
function healthNextAppointment() {
  var up = getHealth().filter(function(r){ return healthCountdownLabel(r); });
  up.sort(function(a, b){
    var c = String(a.date || "").localeCompare(String(b.date || ""));
    return c !== 0 ? c : String(a.time || "").localeCompare(String(b.time || ""));
  });
  return up.length ? up[0] : null;
}

// ── Prescription expiry (v454) ────────────────────────────────────────────
// A repeat prescription RUNS OUT, and unlike an appliance warranty that is
// actionable: you have to ring the surgery before the last one is gone. That
// is the whole reason this exists, and it is the deliberate reversal of the
// v449 note on Home that said no medication-renewal nudge — the backlog
// asked for "a fresh call rather than a quiet yes", and Cathal made it on
// 02/09/2026. It is still not a reminder or an alert: no push, no
// notification, just a self-suppressing line on a card he already reads.
//
// Only a kind whose HEALTH_KIND_FIELDS row NAMES the field can carry one, so
// this is medication-only by the same route every other kind-dependent field
// takes — do not add a second "is this a medication" test anywhere.
// Every record still STORES `expiry` whatever its kind (the v296 rule):
// switching kind hides the field, it never destroys what he typed.
var HEALTH_EXPIRY_SOON_DAYS = 14;   // confirmed 02/09/2026: two weeks' notice

// Days until it runs out — negative once past, null when the kind doesn't
// have one, the field is empty, or the stored value is junk. Reuses
// tripDaysUntil (v298) rather than a second date-difference helper.
function healthExpiryDays(rec) {
  if (!rec || !healthFields(rec.kind).expiry || !rec.expiry) return null;
  return tripDaysUntil(rec.expiry);
}
// The phrase, at any distance. Callers that only want it when it MATTERS use
// healthExpirySoonLabel below and test the label, the healthCountdownLabel way.
function healthExpiryLabel(rec) {
  var d = healthExpiryDays(rec);
  if (d === null) return "";
  if (d < -1)   return "Ran out " + (-d) + " days ago";
  if (d === -1) return "Ran out yesterday";
  if (d === 0)  return "Runs out today";
  if (d === 1)  return "Runs out tomorrow";
  return "Runs out in " + d + " days";
}
// Inside the window, or already past. Past deliberately STAYS: a repeat that
// has already run out is the most actionable state, not the least, so it
// never goes quiet on its own (confirmed 02/09/2026).
function healthExpirySoonLabel(rec) {
  var d = healthExpiryDays(rec);
  return (d !== null && d <= HEALTH_EXPIRY_SOON_DAYS) ? healthExpiryLabel(rec) : "";
}
function healthExpiryPast(rec) {
  var d = healthExpiryDays(rec);
  return d !== null && d < 0;
}
// Soonest (so: most overdue) first — what Home reads.
function healthExpiringSoon() {
  return getHealth().filter(function(r){ return healthExpirySoonLabel(r); })
    .sort(function(a, b){ return String(a.expiry || "").localeCompare(String(b.expiry || "")); });
}

// The haystack global search reads. Health needs its own for the same reason
// appliances do: what you came looking for — a consultant's name, what was
// said at a visit, a test result, the label on a letter — lives in fields a
// plain list item doesn't have.
function healthSearchText(rec) {
  if (!rec) return "";
  var parts = [rec.title, rec.person, rec.who, rec.outcome, rec.location, rec.phone,
               rec.dose, rec.notes, healthKindMeta(rec.kind).label];
  healthFileList(rec).forEach(function(f){ parts.push(f.label); });
  return parts.join(" ").toLowerCase();
}

// Whole-record newest-wins by `updated`, tombstone-filtered. Returns
// {health, push} — push=true means our merged copy is fuller or newer than
// what arrived, so the caller re-pushes to converge (the same contract as
// mergeWatchData / mergePlantsData / mergeApplianceData).
function mergeHealthData(localH, incomingH, tombs) {
  tombs = tombs || {};
  var push = false;
  var incById = {};
  (incomingH || []).forEach(function(r){ if (r && r.id != null) incById[r.id] = r; });
  var localIds = {};
  var merged = (localH || []).filter(function(r){ return r && r.id != null; }).map(function(r){
    localIds[r.id] = true;
    var inc = incById[r.id];
    if (!inc) { push = true; return r; }                         // partner missing this → push
    var winner, loser;
    if ((inc.updated||0) > (r.updated||0)) { winner = inc; loser = r; }
    else {
      if ((r.updated||0) > (inc.updated||0)) push = true;         // local newer → push to converge
      winner = r; loser = inc;
    }
    // v296 field-fill (the babySex incident class): a copy written by an
    // older build doesn't know about newer fields, so fill keys UNDEFINED on
    // the winner from the loser rather than letting them vanish. A field
    // deliberately cleared is "" (or [] for files) and stays cleared — which
    // is why every write below stores a value and never drops a key.
    Object.keys(loser).forEach(function(k){ if (winner[k] === undefined) winner[k] = loser[k]; });
    return winner;
  });
  var fresh = (incomingH || []).filter(function(r){ return r && r.id != null && !localIds[r.id]; });
  var full = fresh.concat(merged);
  var pre = full.length;
  full = full.filter(function(r){ return !(tombs[r.id] && tombs[r.id] >= (r.updated||0)); });
  if (full.length < pre) push = true;
  return { health: full, push: push };
}

function healthDelete(id) {
  var all = getHealth();
  var i = all.findIndex(function(r){ return r && r.id === id; });
  if (i < 0) return;                                   // -1 guard (CLAUDE.md)
  all.splice(i, 1);
  addTomb("health", id);
  saveHealth(all);
  if (_healthOpenId === id) _healthOpenId = null;
  renderHealth();
  toast("Deleted");
}
function confirmHealthDelete(id) {
  var all = getHealth();
  var i = all.findIndex(function(r){ return r && r.id === id; });
  if (i < 0) return;
  var title = all[i].title || "this entry";
  confirmDialog("Delete &ldquo;" + esc(title) + "&rdquo;?", function(){ healthDelete(id); });
}

// ── Health UI ─────────────────────────────────────────────────────────────
var _healthView     = "list";          // "list" | "editor"
var _healthEditId   = null;            // id being edited; null in the editor = a new record
var _healthOpenId   = null;            // inline-expanded row
var _healthPerson   = "";              // person filter — session only, never stored (v379 rule)
var _healthEditing  = false;           // sync-render guard, same role as _watchEditing
var _healthCancelFn = null;            // back-button discard closure (v345 pattern)
var _healthKindDraft = "visit";

// Returns HTML, so every part is esc()'d. The <input type="date"> can only
// produce YYYY-MM-DD, but this field also arrives from sync, from a restored
// backup and from a hand-edited file — none of which pass an input — and the
// split-on-"-" still yields three parts for something like
// `2020-01-01"><img src=x onerror=…>`. Same reasoning as the two href gates.
// Split out at v454 so `expiry` formats through the SAME escaping as `date`
// rather than a second copy of it — expiry arrives from sync and from a
// restored backup too, and junk still splits into three parts on "-".
function healthDMY(v) {
  var s = String(v || "");
  if (!s) return "";
  return listDate(s) || esc(s); // v498: one list date format (was DD/MM/YYYY)
}
function healthDateText(rec, withTime) {
  var f = healthFields(rec.kind);
  if (!f.date || !rec.date) return "";
  var out = healthDMY(rec.date);
  if (withTime !== false && f.time && rec.time) out += " &middot; " + esc(rec.time);
  return out;
}
// Sort key for the history feed. A record with no date sorts to the bottom
// rather than to 1970 — an undated diagnosis is "I don't know when", not
// "before everything else".
function healthSortDate(rec) { return String((rec && rec.date) || ""); }

function healthDetailRow(label, valueHTML) {
  if (!valueHTML) return "";
  return "<div style='display:flex;gap:10px;padding:7px 0;border-bottom:1px solid #EAF1F1'>" +
    "<span style='flex-shrink:0;width:96px;font-size:11px;font-weight:700;color:#7A9494;text-transform:uppercase;letter-spacing:.4px;padding-top:2px'>" + label + "</span>" +
    "<span style='flex:1;min-width:0;font-size:14px;color:#2A3636'>" + valueHTML + "</span></div>";
}

function healthRowHTML(rec) {
  var meta = healthKindMeta(rec.kind);
  var f = healthFields(rec.kind);
  var open = _healthOpenId === rec.id;
  var person = String(rec.person || "").trim();
  var cd = healthCountdownLabel(rec);
  var xp = healthExpirySoonLabel(rec);      // "" unless it is close or past
  var xpPast = healthExpiryPast(rec);
  var dateTxt = healthDateText(rec);
  var files = healthFileList(rec);

  var h = "<div style='background:#fff;border:1.5px solid #DDEAEA;border-radius:12px;margin-bottom:8px;overflow:hidden'>" +
    "<div class='health-body' data-hid='" + esc(rec.id) + "' style='display:flex;align-items:center;gap:9px;padding:11px 12px;cursor:pointer;touch-action:manipulation'>" +
      "<span style='flex-shrink:0;font-size:18px'>" + meta.ico + "</span>" +
      "<div style='flex:1;min-width:0'>" +
        "<div style='font-size:15px;font-weight:600;color:#1E2A2A;line-height:1.3'>" + esc(rec.title || "Untitled") + "</div>";
  // Subtitle: who it's for, when, and who you saw — the three things that
  // tell one row from another in a mixed history feed.
  var sub = [];
  if (person) sub.push(esc(person));
  if (dateTxt && !cd) sub.push(dateTxt);
  if (f.who && rec.who) sub.push(esc(rec.who));
  if (sub.length) {
    h += "<div style='font-size:12px;color:#6E8888;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" + sub.join(" &middot; ") + "</div>";
  }
  h += "</div>";
  if (files.length) {
    h += "<span title='" + files.length + " attached' style='flex-shrink:0;font-size:12px;color:#7A9494'>&#x1F4CE;" +
      (files.length > 1 ? files.length : "") + "</span>";
  }
  if (cd) {
    h += "<span style='flex-shrink:0;background:#E2F0EF;color:" + HEALTH_COLOR + ";font-size:12px;font-weight:700;border-radius:20px;padding:5px 10px;white-space:nowrap;margin-left:6px'>" + cd + "</span>";
  } else if (xp) {
    // Same pill, amber while there is still time and red once it has run
    // out. Medication is a STANDING kind so it never has a countdown of its
    // own — but this is an else-if rather than a second pill on purpose: two
    // pills on one row is how a title gets squeezed off the screen.
    h += "<span style='flex-shrink:0;background:" + (xpPast ? "#FBE9E9" : "#FDF1DE") + ";color:" + (xpPast ? "#B03030" : "#8A5A10") +
      ";font-size:12px;font-weight:700;border-radius:20px;padding:5px 10px;white-space:nowrap;margin-left:6px'>" + xp + "</span>";
  }
  h += "<span style='flex-shrink:0;color:#A8C0C0;font-size:12px;padding-left:4px'>" + (open ? "&#x25B2;" : "&#x25BC;") + "</span>" +
    "</div>";

  if (open) {
    h += "<div style='border-top:1px solid #EAF1F1;padding:6px 12px 12px;background:#F8FBFB'>";
    h += healthDetailRow("Type", meta.ico + " " + meta.label);
    if (person)                     h += healthDetailRow("Who for", esc(person));
    if (f.date && dateTxt)          h += healthDetailRow(f.date, dateTxt);
    if (f.who && rec.who)           h += healthDetailRow(f.who, esc(rec.who));
    if (f.dose && rec.dose)         h += healthDetailRow(f.dose, esc(rec.dose));
    if (f.expiry && rec.expiry) {
      h += healthDetailRow(f.expiry, healthDMY(rec.expiry) + (xp
        ? " &middot; <b style='color:" + (xpPast ? "#B03030" : "#8A5A10") + "'>" + xp + "</b>" : ""));
    }
    if (f.location && rec.location) h += healthDetailRow(f.location, esc(rec.location));
    var tel = f.phone ? healthPhoneHref(rec) : "";
    if (f.phone && rec.phone) {
      h += healthDetailRow("Phone", tel
        ? "<a href='" + esc(tel) + "' style='color:" + HEALTH_COLOR + ";font-weight:600;text-decoration:none'>" + esc(rec.phone) + "</a>"
        : esc(rec.phone));
    }
    // What was said / the result gets its own block rather than a table row:
    // it is the substance of a visit, and it is the thing you came back to read.
    if (f.outcome && rec.outcome) {
      h += "<div style='padding:10px 0 2px'>" +
        "<div style='font-size:11px;font-weight:700;color:#7A9494;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px'>" + f.outcome + "</div>" +
        "<div style='font-size:14px;color:#2A3636;line-height:1.55;white-space:pre-wrap'>" + esc(rec.outcome) + "</div></div>";
    }
    if (files.length) {
      h += "<div style='padding:10px 0 2px'>" +
        "<div style='font-size:11px;font-weight:700;color:#7A9494;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px'>Files &amp; links</div>" +
        "<div style='display:flex;flex-wrap:wrap;gap:6px'>";
      files.forEach(function(fl){
        h += "<a href='" + esc(fl.url) + "' target='_blank' rel='noopener' " +
          "style='display:inline-flex;align-items:center;gap:5px;background:#fff;border:1.5px solid #CFE0E0;color:" + HEALTH_COLOR +
          ";border-radius:20px;padding:7px 12px;font-size:12px;font-weight:700;text-decoration:none;touch-action:manipulation'>" +
          "&#x1F4CE; " + esc(fl.label) + " &#x2197;</a>";
      });
      h += "</div></div>";
    }
    if (rec.notes) {
      h += "<div style='padding:10px 0 2px;font-size:14px;color:#2A3636;line-height:1.55;white-space:pre-wrap'>" + esc(rec.notes) + "</div>";
    }
    h += "<div style='display:flex;gap:8px;margin-top:12px'>" +
      "<button class='health-edit' data-hid='" + esc(rec.id) + "' style='flex:1;padding:10px;border:1.5px solid #CFE0E0;background:#fff;color:#3A5555;border-radius:9px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation'>Edit</button>" +
      "<button class='health-del' data-hid='" + esc(rec.id) + "' style='flex:1;padding:10px;border:1.5px solid #F0D0D0;background:#fff;color:#B03030;border-radius:9px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation'>Delete</button>" +
      "</div></div>";
  }
  return h + "</div>";
}

function healthGroupHeader(text) {
  return "<div style='font-size:11px;font-weight:700;color:#7A9494;text-transform:uppercase;letter-spacing:.5px;margin:12px 2px 7px'>" + text + "</div>";
}

function renderHealth() {
  _healthEditing = false;
  _healthCancelFn = null;
  if (_healthView === "editor") { renderHealthEditor(); return; }
  _healthView = "list";
  var el = document.getElementById("healthContent");
  if (!el) return;

  var all = getHealth();
  if (!all.length) {
    el.innerHTML = "<div style='text-align:center;color:#6E8888;padding:40px 20px'>" +
      "<div style='font-size:40px;margin-bottom:10px'>&#x1FA7A;</div>" +
      "<div style='font-size:16px;font-weight:600;margin-bottom:4px;color:#1E2A2A'>No history yet</div>" +
      "<div style='font-size:13px;line-height:1.55'>GP visits and what was said, the conditions you have, diagnoses, test results, vaccinations and the letters that go with them.</div></div>";
    return;
  }

  // Person chips only earn their row when there's actually a choice to make
  // (the v379 area-chip rule). The chosen person can also vanish — last
  // record retagged, deleted, or dropped by a sync from the other phone — so
  // fall back to All rather than showing an empty list with no explanation.
  var people = healthPeople(all);
  var showChips = people.length >= 2;
  if (!showChips) _healthPerson = "";
  if (_healthPerson && people.map(function(p){ return p.toLowerCase(); }).indexOf(_healthPerson.toLowerCase()) === -1) _healthPerson = "";

  var shown = all.filter(function(r){
    if (!_healthPerson) return true;
    return String(r.person || "").trim().toLowerCase() === _healthPerson.toLowerCase();
  });

  var html = "";
  if (showChips) {
    html += "<div class='chip-scroll' style='display:flex;gap:7px;padding:1px 24px 4px 1px;overflow-x:auto;-webkit-overflow-scrolling:touch'>";
    [{ v:"", t:"All" }].concat(people.map(function(p){ return { v:p, t:p }; })).forEach(function(c){
      var on = _healthPerson.toLowerCase() === c.v.toLowerCase();
      html += "<button class='health-person-chip' data-person='" + esc(c.v) + "' " +
        "style='flex:0 0 auto;border-radius:20px;padding:8px 14px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;touch-action:manipulation;" +
        (on ? "background:" + HEALTH_COLOR + ";color:#fff;border:1.5px solid " + HEALTH_COLOR
            : "background:#fff;color:#3A5555;border:1.5px solid #CFE0E0") + "'>" + esc(c.t) + "</button>";
    });
    html += "</div>";
  }

  // Four passes, and every record lands in exactly one of them: an upcoming
  // visit/test, a standing state, a dated event, or the contacts directory.
  var upcoming = shown.filter(function(r){ return healthCountdownLabel(r); });
  upcoming.sort(function(a, b){
    var c = healthSortDate(a).localeCompare(healthSortDate(b));
    return c !== 0 ? c : String(a.time || "").localeCompare(String(b.time || ""));
  });
  var upcomingIds = {};
  upcoming.forEach(function(r){ upcomingIds[r.id] = true; });

  // THE history feed: every event kind mixed together, newest first. This is
  // the section's centre of gravity — do NOT split it back into a group per
  // kind, which is what it was before the 31/08 reframe and what made it read
  // as a filing cabinet rather than a history.
  var history = shown.filter(function(r){
    return !upcomingIds[r.id] && healthKindIn(r, HEALTH_HISTORY_KINDS);
  }).sort(function(a, b){
    var da = healthSortDate(a), db = healthSortDate(b);
    if (!da && !db) return (b.updated || 0) - (a.updated || 0);
    if (!da) return 1;                                  // undated sinks to the bottom
    if (!db) return -1;
    return db.localeCompare(da);
  });

  if (upcoming.length) {
    html += healthGroupHeader("&#x1F4C5; Coming up &middot; " + upcoming.length);
    upcoming.forEach(function(r){ html += healthRowHTML(r); });
  }

  var bodyCount = upcoming.length + history.length;
  // Conditions and medication are STATES, not events, so they are pinned
  // above the history rather than sorted into it by date — "what do I have
  // and what am I taking" is a question you ask now, not a thing that
  // happened on a Tuesday.
  HEALTH_STANDING_KINDS.forEach(function(kk){
    var meta = healthKindMeta(kk);
    var group = shown.filter(function(r){ return healthKindMeta(r.kind).key === kk; })
      .sort(function(a, b){ return String(a.title || "").localeCompare(String(b.title || "")); });
    if (!group.length) return;
    bodyCount += group.length;
    html += healthGroupHeader(meta.ico + " " + meta.plural + " &middot; " + group.length);
    group.forEach(function(r){ html += healthRowHTML(r); });
  });

  if (history.length) {
    html += healthGroupHeader("&#x1F4D6; History &middot; " + history.length);
    history.forEach(function(r){ html += healthRowHTML(r); });
  }

  var contacts = shown.filter(function(r){ return healthKindMeta(r.kind).key === "contact"; })
    .sort(function(a, b){ return String(a.title || "").localeCompare(String(b.title || "")); });
  if (contacts.length) {
    bodyCount += contacts.length;
    html += healthGroupHeader("&#x1F3E5; Contacts &middot; " + contacts.length);
    contacts.forEach(function(r){ html += healthRowHTML(r); });
  }

  if (!bodyCount) {
    html += "<div style='text-align:center;color:#6E8888;padding:30px 20px;font-size:13px'>Nothing here for " + esc(_healthPerson) + ".</div>";
  }
  el.innerHTML = html;

  el.querySelectorAll(".health-body").forEach(function(b){
    b.addEventListener("click", function(){
      var id = +b.dataset.hid;
      _healthOpenId = (_healthOpenId === id) ? null : id;
      renderHealth();
    });
  });
  el.querySelectorAll(".health-edit").forEach(function(b){
    b.addEventListener("click", function(){ openHealthEditor(+b.dataset.hid); });
  });
  el.querySelectorAll(".health-del").forEach(function(b){
    b.addEventListener("click", function(){ confirmHealthDelete(+b.dataset.hid); });
  });
  el.querySelectorAll(".health-person-chip").forEach(function(b){
    b.addEventListener("click", function(){ _healthPerson = b.dataset.person || ""; renderHealth(); });
  });
}

function openHealthEditor(id) {
  _healthEditId = (id == null) ? null : id;
  _healthView = "editor";
  renderHealth();
  window.scrollTo(0, 0);
}

// Show/hide and relabel the kind-dependent rows IN PLACE. Deliberately not a
// re-render of the editor: re-rendering would throw away everything already
// typed into the fields above the picker, and with seven kinds and eight
// switchable rows that is a lot to lose to a mis-tap.
function healthApplyKindToEditor() {
  var f = healthFields(_healthKindDraft);
  function row(id, on) { var e = document.getElementById(id); if (e) e.style.display = on ? "block" : "none"; }
  function lab(id, text) { var e = document.getElementById(id); if (e) e.innerHTML = text; }
  lab("hlEdTitleLbl", f.title);
  row("hlEdDateRow", !!f.date);   if (f.date)    lab("hlEdDateLbl", f.date);
  row("hlEdTimeRow", !!f.time);
  row("hlEdWhoRow",  !!f.who);    if (f.who)     lab("hlEdWhoLbl", f.who);
  row("hlEdDoseRow", !!f.dose);   if (f.dose)    lab("hlEdDoseLbl", f.dose);
  row("hlEdExpiryRow", !!f.expiry); if (f.expiry) lab("hlEdExpiryLbl", f.expiry);
  row("hlEdOutRow",  !!f.outcome); if (f.outcome) lab("hlEdOutLbl", f.outcome);
  row("hlEdLocRow",  !!f.location); if (f.location) lab("hlEdLocLbl", f.location);
  row("hlEdPhoneRow", !!f.phone);
  document.querySelectorAll(".health-kind-pick").forEach(function(x){
    var on = x.dataset.kind === _healthKindDraft;
    x.style.background = on ? HEALTH_COLOR : "#fff";
    x.style.color      = on ? "#fff" : "#3A5555";
    x.style.border     = "1.5px solid " + (on ? HEALTH_COLOR : "#CFE0E0");
  });
}

// One file row in the editor. Appended to the DOM rather than re-rendered,
// for the same reason the kind picker relabels in place.
function healthAddFileRow(label, url) {
  var box = document.getElementById("hlEdFiles");
  if (!box) return;
  var inp = "box-sizing:border-box;padding:9px;border:1.5px solid #CFE0E0;border-radius:8px;font-family:inherit;font-size:14px;background:#fff;color:#1E2A2A";
  var row = document.createElement("div");
  row.className = "hl-file-row";
  row.style.cssText = "display:flex;gap:6px;align-items:center;margin-bottom:6px";
  row.innerHTML =
    "<input class='hl-file-label' type='text' placeholder='Letter, scan, results&hellip;' style='" + inp + ";flex:0 0 34%;min-width:0' value='" + esc(label || "") + "'>" +
    "<input class='hl-file-url' type='url' inputmode='url' placeholder='https://&hellip;' style='" + inp + ";flex:1;min-width:0' value='" + esc(url || "") + "'>" +
    "<button type='button' class='hl-file-del' aria-label='Remove this file' style='flex:0 0 auto;width:34px;height:38px;border:1.5px solid #F0D0D0;background:#fff;color:#B03030;border-radius:8px;font-size:15px;cursor:pointer;touch-action:manipulation'>&#x2715;</button>";
  box.appendChild(row);
  row.querySelector(".hl-file-del").addEventListener("click", function(){ row.remove(); });
}

function renderHealthEditor() {
  var el = document.getElementById("healthContent");
  if (!el) return;
  var rec = null;
  if (_healthEditId != null) {
    var all = getHealth();
    var i = all.findIndex(function(r){ return r && r.id === _healthEditId; });
    // Deleted on the other phone while this editor was open — fall back to
    // the list rather than silently saving a resurrected copy.
    if (i < 0) { _healthView = "list"; _healthEditId = null; renderHealth(); return; }
    rec = all[i];
  }
  _healthEditing = true;
  _healthKindDraft = rec ? healthKindMeta(rec.kind).key : "visit";

  function leave() {
    _healthEditing = false; _healthCancelFn = null;
    _healthView = "list"; _healthEditId = null;
    renderHealth(); window.scrollTo(0, 0);
  }
  _healthCancelFn = leave;

  var lbl = "font-size:11px;font-weight:700;color:#7A9494;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px";
  var inp = "width:100%;box-sizing:border-box;padding:11px;border:1.5px solid #CFE0E0;border-radius:9px;font-family:inherit;font-size:15px;background:#fff;color:#1E2A2A";
  var opt = "<span style='text-transform:none;font-weight:600;color:#9AB0B0'>(optional)</span>";
  var peopleOpts = healthPeople(getHealth()).map(function(p){ return "<option value='" + esc(p) + "'></option>"; }).join("");

  el.innerHTML =
    "<div style='" + lbl + "'>Type</div>" +
    "<div style='display:flex;flex-wrap:wrap;gap:6px'>" +
      HEALTH_KINDS.map(function(k){
        var on = _healthKindDraft === k.key;
        return "<button class='health-kind-pick' data-kind='" + esc(k.key) + "' style='flex:1 1 30%;padding:10px 4px;border-radius:9px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation;" +
          (on ? "background:" + HEALTH_COLOR + ";color:#fff;border:1.5px solid " + HEALTH_COLOR
              : "background:#fff;color:#3A5555;border:1.5px solid #CFE0E0") + "'>" + k.ico + " " + k.label + "</button>";
      }).join("") +
    "</div>" +
    "<div id='hlEdTitleLbl' style='" + lbl + ";margin-top:14px'>What it was for</div>" +
    "<input id='hlEdTitle' type='text' placeholder='e.g. Chest infection' style='" + inp + "' value='" + esc((rec && rec.title) || "") + "'>" +
    "<div style='" + lbl + ";margin-top:14px'>Who it&rsquo;s for " + opt + "</div>" +
    "<input id='hlEdPerson' type='text' list='hlEdPersonList' placeholder='e.g. Petra' style='" + inp + "' value='" + esc((rec && rec.person) || "") + "'>" +
    "<datalist id='hlEdPersonList'>" + peopleOpts + "</datalist>" +
    "<div id='hlEdDateRow'><div id='hlEdDateLbl' style='" + lbl + ";margin-top:14px'>Date</div>" +
      "<input id='hlEdDate' type='date' style='" + inp + "' value='" + esc((rec && rec.date) || "") + "'></div>" +
    "<div id='hlEdTimeRow'><div style='" + lbl + ";margin-top:14px'>Time " + opt + "</div>" +
      "<input id='hlEdTime' type='time' style='" + inp + "' value='" + esc((rec && rec.time) || "") + "'></div>" +
    "<div id='hlEdWhoRow'><div id='hlEdWhoLbl' style='" + lbl + ";margin-top:14px'>Who you saw</div>" +
      "<input id='hlEdWho' type='text' placeholder='e.g. Dr Murphy' style='" + inp + "' value='" + esc((rec && rec.who) || "") + "'></div>" +
    "<div id='hlEdDoseRow'><div id='hlEdDoseLbl' style='" + lbl + ";margin-top:14px'>Dose</div>" +
      "<input id='hlEdDose' type='text' placeholder='e.g. 10 mg, one at night' style='" + inp + "' value='" + esc((rec && rec.dose) || "") + "'></div>" +
    // Paired with a Clear button, the grocery due-date / item-sheet pattern:
    // an <input type="date"> has NO reliable clear affordance on a phone, so
    // an optional date without one can be set but never unset. The date row
    // above has none because a record's own date is effectively required;
    // this one is optional, and it is the field that puts a line on Home.
    "<div id='hlEdExpiryRow'><div id='hlEdExpiryLbl' style='" + lbl + ";margin-top:14px'>Prescription runs out</div>" +
      "<div style='display:flex;gap:8px;align-items:center'>" +
        "<input id='hlEdExpiry' type='date' style='" + inp + ";flex:1;min-width:0' value='" + esc((rec && rec.expiry) || "") + "'>" +
        "<button type='button' id='hlEdExpiryClear' style='flex:0 0 auto;padding:11px 14px;border:1.5px solid #CFE0E0;background:#fff;color:#3A5555;border-radius:9px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation'>Clear</button>" +
      "</div>" +
      "<div style='font-size:11px;color:#9AB0B0;margin-top:5px;line-height:1.5'>Optional \u2014 the last day it covers. Hearth puts a line on Home " + HEALTH_EXPIRY_SOON_DAYS + " days beforehand, and keeps it there until you Clear the date or change it.</div></div>" +
    "<div id='hlEdOutRow'><div id='hlEdOutLbl' style='" + lbl + ";margin-top:14px'>What was said</div>" +
      "<textarea id='hlEdOut' rows='3' placeholder='What they found, what they advised, what happens next&hellip;' style='" + inp + ";resize:vertical'>" + esc((rec && rec.outcome) || "") + "</textarea></div>" +
    "<div id='hlEdLocRow'><div id='hlEdLocLbl' style='" + lbl + ";margin-top:14px'>Where</div>" +
      "<input id='hlEdLoc' type='text' placeholder='Surgery, hospital or address' style='" + inp + "' value='" + esc((rec && rec.location) || "") + "'></div>" +
    "<div id='hlEdPhoneRow'><div style='" + lbl + ";margin-top:14px'>Phone " + opt + "</div>" +
      "<input id='hlEdPhone' type='tel' inputmode='tel' placeholder='e.g. 021 123 4567' style='" + inp + "' value='" + esc((rec && rec.phone) || "") + "'></div>" +
    "<div id='hlEdFilesRow'><div style='" + lbl + ";margin-top:14px'>Files &amp; links " + opt + "</div>" +
      "<div id='hlEdFiles'></div>" +
      "<button type='button' id='hlEdAddFile' style='width:100%;padding:10px;border:1.5px dashed #CFE0E0;background:#fff;color:" + HEALTH_COLOR + ";border-radius:9px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation'>+ Add a file or link</button>" +
      "<div style='font-size:11px;color:#9AB0B0;margin-top:5px;line-height:1.5'>Links only &mdash; a OneDrive or Drive link to the letter, scan or results. Hearth never holds the file itself, and a web address is the only thing it will accept here.</div></div>" +
    "<div style='" + lbl + ";margin-top:14px'>Notes " + opt + "</div>" +
    "<textarea id='hlEdNotes' rows='3' placeholder='Anything else worth remembering&hellip;' style='" + inp + ";resize:vertical'>" + esc((rec && rec.notes) || "") + "</textarea>" +
    "<div style='display:flex;gap:8px;margin-top:18px'>" +
      "<button id='hlEdCancel' style='flex:1;padding:13px;border:1.5px solid #CFE0E0;background:#fff;color:#3A5555;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation'>Cancel</button>" +
      "<button id='hlEdSave' style='flex:2;padding:13px;border:none;background:" + HEALTH_COLOR + ";color:#fff;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>Save</button>" +
    "</div>";

  healthApplyKindToEditor();
  // Existing files come back through healthFileList, so a url that would be
  // refused at render is not silently re-offered for saving either.
  healthFileList(rec).forEach(function(f){ healthAddFileRow(f.label === "Document" ? "" : f.label, f.url); });
  document.getElementById("hlEdAddFile").addEventListener("click", function(){ healthAddFileRow("", ""); });
  // Clearing is a real edit, not a no-op: "" is what stops the Home line, and
  // it SAVES as "" rather than dropping the key (the v296 rule), so the other
  // phone doesn't refill it on the next sync.
  document.getElementById("hlEdExpiryClear").addEventListener("click", function(){
    document.getElementById("hlEdExpiry").value = "";
  });

  el.querySelectorAll(".health-kind-pick").forEach(function(b){
    b.addEventListener("click", function(){
      _healthKindDraft = healthKindMeta(b.dataset.kind).key;
      healthApplyKindToEditor();
    });
  });
  document.getElementById("hlEdCancel").addEventListener("click", leave);
  document.getElementById("hlEdSave").addEventListener("click", function(){
    var title = document.getElementById("hlEdTitle").value.trim();
    if (!title) { toast("Give it a title first"); return; }

    // Files: same gate as the appliance manual/photos links and the plant
    // photo link, reused rather than copied. A refusal is a toast naming the
    // row, never a silent drop — a link that vanishes on save reads as the
    // app losing data, which for a consultant's letter is the worst outcome.
    var files = [], bad = null;
    document.querySelectorAll("#hlEdFiles .hl-file-row").forEach(function(row){
      var lv = row.querySelector(".hl-file-label").value.trim();
      var uv = row.querySelector(".hl-file-url").value.trim();
      if (!uv) return;                                   // a blank row is just an unused row
      var gated = applianceLinkUrl(uv);
      if (!gated) { if (!bad) bad = lv || uv; return; }
      files.push({ label: lv, url: gated });
    });
    if (bad) { toast("“" + bad + "” needs a http(s) web address"); return; }

    // Every field is written, always, even when empty: "" and [] are DEFINED
    // and survive mergeHealthData's v296 field-fill, whereas a dropped key
    // gets refilled from the other device's older copy on the next sync.
    // Clearing a field has to stick (the v428 inventory `value` rule).
    var vals = {
      kind:     _healthKindDraft,
      person:   document.getElementById("hlEdPerson").value.trim(),
      title:    title,
      date:     document.getElementById("hlEdDate").value.trim(),
      time:     document.getElementById("hlEdTime").value.trim(),
      who:      document.getElementById("hlEdWho").value.trim(),
      dose:     document.getElementById("hlEdDose").value.trim(),
      expiry:   document.getElementById("hlEdExpiry").value.trim(),
      outcome:  document.getElementById("hlEdOut").value,
      location: document.getElementById("hlEdLoc").value.trim(),
      phone:    document.getElementById("hlEdPhone").value.trim(),
      files:    files,
      link:     "",                                      // superseded by `files`; cleared, never dropped
      notes:    document.getElementById("hlEdNotes").value
    };
    var cur = getHealth();
    if (_healthEditId != null) {
      var j = cur.findIndex(function(r){ return r && r.id === _healthEditId; });
      if (j < 0) { toast("That entry is no longer here"); leave(); return; }
      Object.keys(vals).forEach(function(k){ cur[j][k] = vals[k]; });
      cur[j].updated = Date.now();
    } else {
      var fresh = { id: Date.now() + Math.floor(Math.random() * 1000),
                    addedBy: hearthUser, added: Date.now(), updated: Date.now() };
      Object.keys(vals).forEach(function(k){ fresh[k] = vals[k]; });
      cur.unshift(fresh);
    }
    saveHealth(cur);
    _healthEditing = false; _healthCancelFn = null;
    _healthView = "list"; _healthEditId = null;
    renderHealth(); window.scrollTo(0, 0);
    toast("Saved");
  });
  var t = document.getElementById("hlEdTitle");
  if (t && !rec) t.focus();
}

