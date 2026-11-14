// ============================================================
// GOLF (v500) — a simple personal scorecard. Confirmed 03/10/2026: one
// golfer, hole-by-hole strokes, saved courses with a par per hole, and
// household-synced like the other reference sections.
//
// ONE store, `fl4_golf`, holding two record kinds — the Health shape
// (`kind` on the record) rather than two stores, so there is one set of
// sync/backup/tombstone wiring instead of two:
//   course: id, kind:"course", name, holes (9|18), pars [n×holes],
//           si [stroke index 1..holes or ""×holes] (v501), notes
//   round:  id, kind:"round", date, courseId, courseName, holes, pars, si,
//           strokes [n or ""×holes], notes, and since v501 myHcp,
//           partner, partnerHcp (playing handicaps: int or ""), pStrokes
// v501 (confirmed 03/10/2026): one optional partner per round, PLAYING
// handicaps typed in (not index + slope), Stableford on the scorecard and
// the rounds list. Shots per hole come from the stroke index (golfShots);
// a hole where one player gets more shots than the other is highlighted
// before any score is entered — that is the "advantage".
//   both:   addedBy, added, updated
// A round SNAPSHOTS the course's name, hole count, pars and SI when it is
// started, so editing or deleting a course later never rewrites a score
// already played. Do NOT turn a round's pars into a live course lookup.
//
// SYNC is whole-record newest-wins by `updated` (the Health/Plants
// contract), tombstones in `fl4_tomb_golf`. That is safe here, unlike
// Projects, because a round is one person's scorecard edited in one go —
// no second phone adds parts to the same record.
//
// Firebase hands back a gappy array as an object (the v478 lesson), so
// golfNormalise coerces `pars`/`strokes` at the read boundary — read only
// through getGolf(). An unplayed hole stores "" (the v296 rule: a value,
// never a dropped entry).
// ============================================================
var GOLF_COLOR = "#3F6B21";
var GOLF_PAR_MIN = 3, GOLF_PAR_MAX = 6, GOLF_STROKE_MAX = 15;

function golfArr(raw) {
  if (raw && !Array.isArray(raw) && typeof raw === "object") {
    var o = raw; raw = [];
    Object.keys(o).forEach(function(k){ var i = parseInt(k, 10); if (i >= 0 && i < 18) raw[i] = o[k]; });
  }
  return Array.isArray(raw) ? raw : [];
}
function golfHoles(n) { return +n === 9 ? 9 : 18; }
function golfParOf(v) { var n = parseInt(v, 10); return (n >= GOLF_PAR_MIN && n <= GOLF_PAR_MAX) ? n : 4; }
function golfStrokeOf(v) { var n = parseInt(v, 10); return (n >= 1 && n <= GOLF_STROKE_MAX) ? n : ""; }
function golfStrokesArr(raw, holes) {
  var st = golfArr(raw), so = [];
  for (var j = 0; j < holes; j++) so.push(golfStrokeOf(st[j]));
  return so;
}
// A stroke index outside 1..holes reads as "" (unset), never as a guess.
function golfSiArr(raw, holes) {
  var a = golfArr(raw), out = [];
  for (var i = 0; i < holes; i++) { var n = parseInt(a[i], 10); out.push(n >= 1 && n <= holes ? n : ""); }
  return out;
}
// A playing handicap: a whole number from -10 (a plus handicap) to 54, or "".
function golfHcpOf(v) {
  if (v === "" || v == null) return "";
  var n = Number(v);
  return (Math.floor(n) === n && n >= -10 && n <= 54) ? n : "";
}
// v505 hole distances (confirmed 05/10/2026): ONE distance per hole — a
// course is one set of tees, the same as its pars and SI — in the course's
// own unit, metres ("m", the default) or yards ("yd"). Informational only:
// nothing is calculated from them. A blank hole is "" (the v296 rule).
var GOLF_DIST_MAX = 999;
function golfDistOf(v) { var n = Number(v); return (v !== "" && v != null && Math.floor(n) === n && n >= 1 && n <= GOLF_DIST_MAX) ? n : ""; }
function golfDistArr(raw, holes) {
  var a = golfArr(raw), out = [];
  for (var i = 0; i < holes; i++) out.push(golfDistOf(a[i]));
  return out;
}
function golfUnitOf(u) { return (u === "yd" || u === "yards" || u === "y") ? "yd" : "m"; }
function golfDistText(n, unit) { return n === "" || n == null ? "" : n + (unit === "yd" ? " yd" : " m"); }
function golfDistTotal(dist) {
  var t = 0, any = false;
  (dist || []).forEach(function(n){ if (n !== "") { t += n; any = true; } });
  return any ? t : null;
}
function golfHasDist(dist) { return golfDistTotal(dist) !== null; }
// The distance as shown beside a course: the total when every hole has one,
// otherwise the part-sum clearly marked "(N of M holes)" — never a part-sum
// passed off as the course length (Codex review on #275). "" when none.
function golfDistSummary(dist, unit) {
  var t = golfDistTotal(dist);
  if (t === null) return "";
  var n = (dist || []).filter(function(x){ return x !== ""; }).length;
  return golfDistText(t, unit) + (n < dist.length ? " (" + n + " of " + dist.length + " holes)" : "");
}
function golfNormalise(r) {
  if (r.kind !== "course" && r.kind !== "round") return r;   // a future kind passes through untouched
  r.holes = golfHoles(r.holes);
  var pars = golfArr(r.pars), po = [];
  for (var i = 0; i < r.holes; i++) po.push(golfParOf(pars[i]));
  r.pars = po;
  r.si = golfSiArr(r.si, r.holes);                           // v501; a v500 record reads as all-unset
  r.dist = golfDistArr(r.dist, r.holes);                     // v505; older records read as no distances
  r.unit = golfUnitOf(r.unit);
  if (r.kind === "round") {
    r.strokes = golfStrokesArr(r.strokes, r.holes);
    r.pStrokes = golfStrokesArr(r.pStrokes, r.holes);
    r.myHcp = golfHcpOf(r.myHcp);
    r.partnerHcp = golfHcpOf(r.partnerHcp);
    r.partner = typeof r.partner === "string" ? r.partner : "";
  }
  return r;
}
function getGolf() {
  var g = storeGet("fl4_golf");
  if (!Array.isArray(g)) return [];
  return g.filter(function(x){ return x && typeof x === "object" && x.id != null; }).map(golfNormalise);
}
function saveGolf(g) {
  storeSet("fl4_golf", g);
  pushPersonal();
  if (typeof isHouseholdSet === "function" && isHouseholdSet()) pushHousehold();
}
function golfCourses() {
  return getGolf().filter(function(r){ return r.kind === "course"; })
    .sort(function(a, b){ return String(a.name || "").localeCompare(String(b.name || "")); });
}
// Newest round first; same-day rounds by when they were added.
function golfRounds() {
  return getGolf().filter(function(r){ return r.kind === "round"; }).sort(function(a, b){
    var da = String(a.date || ""), db = String(b.date || "");
    if (da !== db) return db.localeCompare(da);
    return (b.added || 0) - (a.added || 0);
  });
}
function golfFind(all, id) {
  for (var i = 0; i < all.length; i++) if (all[i] && all[i].id === id) return all[i];
  return null;
}

// Whole-record newest-wins by `updated`, tombstone-filtered — the
// mergeHealthData contract exactly. Returns {golf, push}: push=true means
// our merged copy is fuller or newer than what arrived, so the caller
// re-pushes to converge.
function mergeGolfData(localG, incomingG, tombs) {
  tombs = tombs || {};
  var push = false;
  var incById = {};
  (incomingG || []).forEach(function(r){ if (r && r.id != null) incById[r.id] = r; });
  var localIds = {};
  var merged = (localG || []).filter(function(r){ return r && r.id != null; }).map(function(r){
    localIds[r.id] = true;
    var inc = incById[r.id];
    if (!inc) { push = true; return r; }
    var winner, loser;
    if ((inc.updated||0) > (r.updated||0)) { winner = inc; loser = r; }
    else {
      if ((r.updated||0) > (inc.updated||0)) push = true;
      winner = r; loser = inc;
    }
    // v296 field-fill: an older build's copy can't drop a field it doesn't know.
    Object.keys(loser).forEach(function(k){ if (winner[k] === undefined) winner[k] = loser[k]; });
    return winner;
  });
  var fresh = (incomingG || []).filter(function(r){ return r && r.id != null && !localIds[r.id]; });
  var full = fresh.concat(merged);
  var pre = full.length;
  full = full.filter(function(r){ return !(tombs[r.id] && tombs[r.id] >= (r.updated||0)); });
  if (full.length < pre) push = true;
  return { golf: full, push: push };
}

// ── Derived facts ────────────────────────────────────────────────────────
// Stableford needs every hole's SI, each used once.
function golfSiComplete(si, holes) {
  if (!si || si.length !== holes) return false;
  var seen = {};
  for (var i = 0; i < holes; i++) {
    var n = si[i];
    if (typeof n !== "number" || n < 1 || n > holes || seen[n]) return false;
    seen[n] = true;
  }
  return true;
}
// The course editor's rule: all blank, or all filled with 1..holes once each.
function golfSiCheck(raw, holes) {
  var filled = 0, seen = {};
  for (var i = 0; i < holes; i++) {
    var t = String(raw[i] == null ? "" : raw[i]).trim();
    if (t === "") continue;
    var n = Number(t);
    if (Math.floor(n) !== n || n < 1 || n > holes) return "Stroke index must be a whole number from 1 to " + holes;
    if (seen[n]) return "Stroke index " + n + " is on two holes";
    seen[n] = true; filled++;
  }
  if (filled && filled < holes) return "Fill in the stroke index for every hole, or leave them all blank";
  return "";
}
// Handicap shots on a hole. A playing handicap is spread over the holes by
// stroke index: 18 on 18 holes is a shot a hole, 22 adds a second shot on
// SI 1–4. A 9-hole course uses the handicap as typed (a 9-hole figure) over
// SI 1–9. A plus handicap gives shots back on the easiest holes first.
function golfShots(hcp, si, holes) {
  if (hcp === "" || si === "" || si == null) return 0;
  var a = Math.abs(hcp), base = Math.floor(a / holes), rem = a % holes;
  if (hcp >= 0) return base + (si <= rem ? 1 : 0);
  return -(base + (si > holes - rem ? 1 : 0));
}
// Stableford: 2 points for a net par, one more per shot better, none worse
// than net double bogey. An unplayed hole scores nothing (null).
function golfPoints(par, shots, strokes) {
  if (strokes === "" || strokes == null) return null;
  return Math.max(0, 2 + par + shots - strokes);
}
// One player's totals on a round. Only holes with a score count, so a
// part-played round reads "thru 12". `points` is null unless both the SI
// and this player's handicap are known.
function golfPlayerStats(r, strokes, hcp) {
  var siOk = hcp !== "" && golfSiComplete(r.si, r.holes);
  var s = { played:0, strokes:0, par:0, toPar:0, complete:false, points: siOk ? 0 : null };
  (strokes || []).forEach(function(v, i){
    if (v === "" || v == null) return;
    s.played++; s.strokes += v; s.par += (r.pars[i] || 4);
    if (siOk) s.points += golfPoints(r.pars[i], golfShots(hcp, r.si[i], r.holes), v);
  });
  s.toPar = s.strokes - s.par;
  s.complete = s.played === r.holes;
  return s;
}
function golfRoundStats(r) { return golfPlayerStats(r, r.strokes, r.myHcp); }
// Partners played with before, newest first, each with the last handicap
// they played off. Names match case-insensitively.
function golfKnownPartners() {
  var out = [], seen = {};
  golfRounds().forEach(function(r){
    var name = String(r.partner || "").trim(), k = name.toLowerCase();
    if (!name || seen[k]) return;
    seen[k] = true;
    out.push({ name: name, hcp: r.partnerHcp });
  });
  return out;
}
function golfLastMyHcp() {
  var rs = golfRounds();
  for (var i = 0; i < rs.length; i++) if (rs[i].myHcp !== "") return rs[i].myHcp;
  return "";
}
function golfParTotal(pars) { return (pars || []).reduce(function(t, p){ return t + p; }, 0); }
function golfToParText(n) { return n === 0 ? "E" : (n > 0 ? "+" + n : "&minus;" + (-n)); }
function golfToParColor(n) { return n < 0 ? "#B03030" : (n === 0 ? "#2A2010" : "#2F4F7A"); }
// Best and average over COMPLETE rounds of one length — a 9-hole score
// never mixes into the 18-hole numbers, and a part-played round counts in
// neither. Average is the last 5 complete rounds. null when there are none.
function golfSummary(holes) {
  var done = golfRounds().filter(function(r){ return r.holes === holes && golfRoundStats(r).complete; });
  if (!done.length) return null;
  var totals = done.map(function(r){ return golfRoundStats(r).strokes; });
  var recent = totals.slice(0, 5);
  return {
    count: done.length,
    best: Math.min.apply(null, totals),
    avg: Math.round(recent.reduce(function(t, n){ return t + n; }, 0) / recent.length * 10) / 10,
    avgOf: recent.length
  };
}

// ── UI state ─────────────────────────────────────────────────────────────
var _golfView      = "list";   // "list" | "round" | "courses" | "course" | "import" (v502)
var _golfEditId    = null;     // round or course being edited, null = new
var _golfNewCourse = null;     // course to pre-select when starting a new round
var _golfThenRound = false;    // course editor was opened from "+" with no courses yet
var _golfEditing   = false;    // sync-render guard, same role as _projEditing
var _golfCancelFn  = null;     // back-button discard closure (v345 pattern) — the course editor
var _golfDoneFn    = null;     // v501: the round editor's save-and-leave (no discard: it autosaves)
var _golfAutoSave  = null;     // v501: the round editor's save-now, for the page being hidden

function renderGolf() {
  _golfEditing = false;
  _golfCancelFn = null; _golfDoneFn = null; _golfAutoSave = null;
  if (_golfView === "round")   { renderGolfRoundEditor(); return; }
  if (_golfView === "course")  { renderGolfCourseEditor(); return; }
  if (_golfView === "courses") { renderGolfCourses(); return; }
  if (_golfView === "import")  { renderGolfImport(); return; }
  _golfView = "list";
  var el = document.getElementById("golfContent");
  if (!el) return;
  var rounds = golfRounds(), courses = golfCourses();
  var html = "<button id='golfCoursesBtn' style='display:block;width:100%;margin-bottom:12px;padding:11px;border:1.5px solid #D9E2CF;background:#fff;color:" + GOLF_COLOR + ";border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>&#x26F3; Courses &middot; " + courses.length + "</button>";
  if (!rounds.length) {
    el.innerHTML = html + "<div style='text-align:center;color:#6E5E48;padding:30px 20px'>" +
      "<div style='font-size:40px;margin-bottom:10px'>&#x1F3CC;&#xFE0F;</div>" +
      "<div style='font-size:16px;font-weight:600;margin-bottom:4px;color:#2A2010'>No rounds yet</div>" +
      "<div style='font-size:13px;line-height:1.55'>" + (courses.length ? "Tap + to score a round hole by hole." : "Add a course with its par for each hole, then tap + to score a round.") + "</div></div>";
    wireGolfList(el);
    return;
  }
  [18, 9].forEach(function(h){
    var s = golfSummary(h);
    if (!s) return;
    html += "<div style='display:flex;gap:8px;margin-bottom:8px'>" +
      golfStatTile(h + "-hole rounds", s.count) +
      golfStatTile("Best", s.best) +
      golfStatTile("Average" + (s.avgOf > 1 ? " (last " + s.avgOf + ")" : ""), s.avg) +
    "</div>";
  });
  html += projGroupHeader("Rounds &middot; " + rounds.length);
  rounds.forEach(function(r){
    var s = golfRoundStats(r);
    var sub = [projDateText(r.date) || "No date", r.holes + " holes"];
    if (!s.complete) sub.push("thru " + s.played);
    if (r.partner) sub.push("with " + esc(r.partner));
    if (s.points !== null && s.played) sub.push("<b style='color:" + GOLF_COLOR + "'>" + s.points + " pts</b>");
    html += "<div class='golf-round' data-id='" + esc(String(r.id)) + "' style='display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid #E3EADB;border-radius:12px;margin-bottom:8px;padding:12px;cursor:pointer;touch-action:manipulation'>" +
      "<div style='flex:1;min-width:0'>" +
        "<div style='font-size:15px;font-weight:600;color:#2A2010;line-height:1.3'>" + esc(r.courseName || "Course") + "</div>" +
        "<div style='font-size:12px;color:#6E5E48;margin-top:3px'>" + sub.join(" &middot; ") + "</div>" +
      "</div>" +
      "<div style='flex-shrink:0;text-align:right'>" +
        "<div style='font-size:20px;font-weight:700;color:#2A2010;line-height:1'>" + (s.played ? s.strokes : "&ndash;") + "</div>" +
        (s.played ? "<div style='font-size:12px;font-weight:700;margin-top:3px;color:" + golfToParColor(s.toPar) + "'>" + golfToParText(s.toPar) + "</div>" : "") +
      "</div>" +
    "</div>";
  });
  el.innerHTML = html;
  wireGolfList(el);
}
function golfStatTile(label, value) {
  return "<div style='flex:1;min-width:0;background:#fff;border:1.5px solid #E3EADB;border-radius:10px;padding:9px 6px;text-align:center'>" +
    "<div style='font-size:19px;font-weight:700;color:" + GOLF_COLOR + "'>" + value + "</div>" +
    "<div style='font-size:11px;color:#6E5E48;margin-top:2px'>" + label + "</div></div>";
}
function wireGolfList(el) {
  var cb = document.getElementById("golfCoursesBtn");
  if (cb) cb.addEventListener("click", function(){ _golfView = "courses"; renderGolf(); window.scrollTo(0, 0); });
  el.querySelectorAll(".golf-round").forEach(function(b){
    b.addEventListener("click", function(){ openGolfRound(+b.dataset.id); });
  });
}

function renderGolfCourses() {
  var el = document.getElementById("golfContent");
  if (!el) return;
  var courses = golfCourses();
  var html = "<button id='golfBack' style='margin-bottom:12px;padding:8px 12px;border:1.5px solid #D9E2CF;background:#fff;color:" + GOLF_COLOR + ";border-radius:9px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation'>&#x2190; Rounds</button>";
  if (!courses.length) {
    html += "<div style='text-align:center;color:#6E5E48;padding:20px;font-size:13px;line-height:1.55'>No courses yet. Add one with its par for each hole &mdash; you set it up once and pick it for every round.</div>";
  }
  courses.forEach(function(c){
    html += "<div class='golf-course' data-id='" + esc(String(c.id)) + "' style='background:#fff;border:1.5px solid #E3EADB;border-radius:12px;margin-bottom:8px;padding:12px;cursor:pointer;touch-action:manipulation'>" +
      "<div style='font-size:15px;font-weight:600;color:#2A2010'>" + esc(c.name || "Course") + "</div>" +
      "<div style='font-size:12px;color:#6E5E48;margin-top:3px'>" + c.holes + " holes &middot; par " + golfParTotal(c.pars) + (golfHasDist(c.dist) ? " &middot; " + golfDistSummary(c.dist, c.unit) : "") + (golfSiComplete(c.si, c.holes) ? "" : " &middot; no stroke index yet") + "</div></div>";
  });
  html += "<button id='golfAddCourse' style='display:block;width:100%;margin-top:6px;padding:12px;border:none;background:" + GOLF_COLOR + ";color:#fff;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>+ Add course</button>";
  el.innerHTML = html;
  document.getElementById("golfBack").addEventListener("click", function(){ _golfView = "list"; renderGolf(); window.scrollTo(0, 0); });
  document.getElementById("golfAddCourse").addEventListener("click", function(){ openGolfCourse(null); });
  el.querySelectorAll(".golf-course").forEach(function(b){
    b.addEventListener("click", function(){ openGolfCourse(+b.dataset.id); });
  });
}

// The header "+": a new round, or — with no course to score against yet —
// the course editor first, which then carries straight on into the round.
function golfNewRound() {
  // v501: a round being scored is already saved, so + keeps it and moves on.
  if (_golfEditing && _golfDoneFn) _golfDoneFn(true);
  // The + stays in the header while the course editor is open, so ask
  // before a new round replaces a half-made course.
  if (_golfEditing && _golfCancelFn) {
    confirmDialog("Discard changes?", function(){ _golfEditing = false; _golfCancelFn = null; golfNewRound(); }, function(){});
    return;
  }
  if (!golfCourses().length) {
    toast("Add your course first");
    _golfThenRound = true;
    openGolfCourse(null);
    return;
  }
  openGolfRound(null);
}
function openGolfRound(id) {
  _golfEditId = (id == null) ? null : id;
  _golfView = "round";
  renderGolf();
  window.scrollTo(0, 0);
}
function openGolfCourse(id) {
  _golfEditId = (id == null) ? null : id;
  _golfView = "course";
  renderGolf();
  window.scrollTo(0, 0);
}

// A − / value / + stepper, 44px targets. `cls` names the row's buttons.
// v504 `big`: the one-hole view's on-course size — buttons share a full
// row at 72px tall and the score is 44px, readable at arm's length with a
// club in the other hand. The full card keeps the compact 44px stepper.
function golfStepperHTML(cls, idx, valueHTML, big) {
  var b = big
    ? "flex:1;min-width:0;height:72px;border:2px solid #C9D6BC;background:#fff;color:" + GOLF_COLOR + ";border-radius:14px;font-family:inherit;font-size:36px;font-weight:700;line-height:1;cursor:pointer;touch-action:manipulation"
    : "width:44px;height:44px;border:1.5px solid #D9E2CF;background:#fff;color:" + GOLF_COLOR + ";border-radius:10px;font-family:inherit;font-size:20px;font-weight:700;cursor:pointer;touch-action:manipulation;flex-shrink:0";
  var v = big
    ? "flex:0 0 76px;text-align:center;font-size:44px;font-weight:800;line-height:1;color:#2A2010"
    : "width:34px;text-align:center;font-size:19px;font-weight:700;color:#2A2010";
  return "<button type='button' class='" + cls + "-dn' data-i='" + idx + "' aria-label='Less' style='" + b + "'>&minus;</button>" +
    "<span class='" + cls + "-val' data-i='" + idx + "' style='" + v + "'>" + valueHTML + "</span>" +
    "<button type='button' class='" + cls + "-up' data-i='" + idx + "' aria-label='More' style='" + b + "'>+</button>";
}
function golfEditorButtons(delLabel) {
  return "<div style='display:flex;gap:8px;margin-top:18px'>" +
    "<button id='golfEdCancel' style='flex:1;padding:13px;border:1.5px solid #D9E2CF;background:#fff;color:#4A5A3A;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation'>Cancel</button>" +
    "<button id='golfEdSave' style='flex:2;padding:13px;border:none;background:" + GOLF_COLOR + ";color:#fff;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>Save</button>" +
  "</div>" +
  (delLabel ? "<button id='golfEdDelete' style='display:block;width:100%;margin-top:10px;padding:12px;border:1.5px solid #F0D0D0;background:#fff;color:#B03030;border-radius:10px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation'>" + delLabel + "</button>" : "");
}
function golfDelete(id) {
  var all = getGolf();
  var i = all.findIndex(function(r){ return r.id === id; });
  if (i < 0) return;                                   // -1 guard (CLAUDE.md)
  all.splice(i, 1);
  addTomb("golf", id);
  saveGolf(all);
  toast("Deleted");
}

function renderGolfRoundEditor() {
  var el = document.getElementById("golfContent");
  if (!el) return;
  var r = null;
  if (_golfEditId != null) {
    r = golfFind(getGolf(), _golfEditId);
    if (!r || r.kind !== "round") { _golfView = "list"; _golfEditId = null; renderGolf(); return; }
  }
  var courses = golfCourses();
  if (!r && !courses.length) { _golfView = "list"; renderGolf(); return; }
  _golfEditing = true;
  // The draft. A new round starts on the course just added, else the one
  // played last, else the first; its pars and stroke indexes are
  // snapshotted from the course.
  var d;
  if (r) {
    d = { courseId: r.courseId, courseName: r.courseName, holes: r.holes, pars: r.pars.slice(), si: r.si.slice(),
          dist: r.dist.slice(), unit: r.unit, strokes: r.strokes.slice(), pStrokes: r.pStrokes.slice() };
    // A round played before its course had stroke indexes picks them up
    // once the course has them. SI only, never pars: a par change must not
    // rewrite a score already played.
    if (!golfSiComplete(d.si, d.holes)) {
      var src = golfFind(courses, d.courseId);
      if (src && src.holes === d.holes && golfSiComplete(src.si, src.holes)) d.si = src.si.slice();
    }
    // v505: the same for distances — a round with none takes the course's.
    if (!golfHasDist(d.dist)) {
      var srcD = golfFind(courses, d.courseId);
      if (srcD && srcD.holes === d.holes && golfHasDist(srcD.dist)) { d.dist = srcD.dist.slice(); d.unit = srcD.unit; }
    }
  } else {
    var last = golfRounds()[0];
    var start = golfFind(courses, _golfNewCourse) || (last && golfFind(courses, last.courseId)) || courses[0];
    d = golfDraftFor(start);
  }
  _golfNewCourse = null;
  var known = golfKnownPartners();
  function leave() {
    _golfEditing = false; _golfCancelFn = null; _golfDoneFn = null; _golfAutoSave = null;
    _golfView = "list"; _golfEditId = null;
    renderGolf(); window.scrollTo(0, 0);
  }
  // v501 autosave (confirmed 03/10/2026): there is no Cancel. The round is
  // written on the first score and on every change after it, so a phone
  // that sleeps or a PWA the OS kills between holes loses nothing. Leaving
  // by Done, the back button or the header + all keep what's there.
  _golfDoneFn = done;
  _golfAutoSave = persist;

  var head = r
    ? "<div style='" + PROJ_LBL + "'>Course</div><div style='font-size:17px;font-weight:700;color:#2A2010'>" + esc(d.courseName || "Course") + "</div>"
    : "<div style='" + PROJ_LBL + "'>Course</div><div style='display:flex;flex-wrap:wrap;gap:6px'>" +
        courses.map(function(c){
          return "<button type='button' class='golf-course-pick' data-id='" + esc(String(c.id)) + "' aria-pressed='false' style='padding:10px 12px;border-radius:9px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation'>" + esc(c.name || "Course") + "</button>";
        }).join("") + "</div>";
  var hcpInp = PROJ_INP + ";width:92px;flex:0 0 auto";
  el.innerHTML =
    "<button type='button' id='golfSetupSum' aria-expanded='true' style='display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:10px 12px;border:1.5px solid #D9E2CF;background:#fff;border-radius:10px;font-family:inherit;cursor:pointer;touch-action:manipulation'></button>" +
    "<div id='golfSetup' style='margin-top:12px'>" + head +
    "<div style='" + PROJ_LBL + ";margin-top:14px'>Date</div>" +
    "<input id='golfEdDate' type='date' style='" + PROJ_INP + "' value='" + esc(r ? (r.date || "") : trainTodayStr()) + "'>" +
    "<div style='" + PROJ_LBL + ";margin-top:14px'>Your playing handicap " + PROJ_OPT + "</div>" +
    "<input id='golfEdMyHcp' type='number' inputmode='numeric' min='-10' max='54' placeholder='e.g. 18' style='" + hcpInp + "' value='" + esc(String(r ? r.myHcp : golfLastMyHcp())) + "'>" +
    "<div style='" + PROJ_LBL + ";margin-top:14px'>Partner " + PROJ_OPT + "</div>" +
    "<div style='display:flex;gap:8px'>" +
      "<input id='golfEdPartner' type='text' list='golfPartnerList' autocomplete='off' placeholder='Name' style='" + PROJ_INP + ";flex:1;min-width:0' value='" + esc((r && r.partner) || "") + "'>" +
      "<input id='golfEdPHcp' type='number' inputmode='numeric' min='-10' max='54' placeholder='Hcp' aria-label='Partner&rsquo;s playing handicap' style='" + hcpInp + "' value='" + esc(String(r ? r.partnerHcp : "")) + "'>" +
    "</div>" +
    "<datalist id='golfPartnerList'>" + known.map(function(k){ return "<option value='" + esc(k.name) + "'></option>"; }).join("") + "</datalist>" +
    "</div>" +
    "<div id='golfSiNote'></div>" +
    "<div style='display:flex;gap:6px;margin-top:14px'>" +
      [["full", "Full card"], ["one", "One hole"]].map(function(v){
        return "<button type='button' class='golf-view-pick' data-v='" + v[0] + "' aria-pressed='false' style='flex:1;padding:9px;border-radius:9px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation'>" + v[1] + "</button>";
      }).join("") +
    "</div>" +
    "<div id='golfTotals' style='margin-top:8px;background:#F2F6EC;border:1.5px solid #D9E2CF;border-radius:10px;padding:8px 12px'></div>" +
    "<div id='golfHoles' style='margin-top:8px'></div>" +
    "<div style='" + PROJ_LBL + ";margin-top:14px'>Notes " + PROJ_OPT + "</div>" +
    "<textarea id='golfEdNotes' rows='3' placeholder='Weather, how it went&hellip;' style='" + PROJ_INP + ";resize:vertical'>" + esc((r && r.notes) || "") + "</textarea>" +
    "<div id='golfSaved' style='margin-top:12px;font-size:12px;color:#6E5E48;text-align:center'></div>" +
    "<button id='golfEdDone' style='display:block;width:100%;margin-top:8px;padding:13px;border:none;background:" + GOLF_COLOR + ";color:#fff;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>Done</button>" +
    "<button id='golfEdDelete' style='display:" + (r ? "block" : "none") + ";width:100%;margin-top:10px;padding:12px;border:1.5px solid #F0D0D0;background:#fff;color:#B03030;border-radius:10px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation'>Delete this round</button>";

  var inMy = document.getElementById("golfEdMyHcp"), inName = document.getElementById("golfEdPartner"), inP = document.getElementById("golfEdPHcp");
  // Read live from the inputs, so a handicap typed mid-round re-scores every hole at once.
  function who() {
    var name = inName.value.trim();
    return { me: golfHcpOf(inMy.value), name: name, p: name ? golfHcpOf(inP.value) : "" };
  }
  function paintSiNote() {
    document.getElementById("golfSiNote").innerHTML = golfSiComplete(d.si, d.holes) ? "" :
      "<div style='margin-top:12px;font-size:12px;line-height:1.5;color:#6E5E48;background:#FBF6EA;border:1.5px solid #EADFC4;border-radius:9px;padding:8px 10px'>Stableford points and handicap shots need the <b>stroke index</b> for every hole. Add them to this course under &#x26F3; Courses.</div>";
  }
  function totalsLine(label, s) {
    return "<div style='display:flex;align-items:center;gap:10px;padding:4px 0'>" +
      "<div style='flex:1;min-width:0;font-size:13px;color:#4A5A3A'><b style='color:#2A2010'>" + label + "</b> &middot; " + (s.complete ? "all " + d.holes : "thru " + s.played) + "</div>" +
      "<div style='font-size:20px;font-weight:700;color:#2A2010'>" + (s.played ? s.strokes : "&ndash;") + "</div>" +
      "<div style='min-width:30px;text-align:right;font-size:13px;font-weight:700;color:" + golfToParColor(s.toPar) + "'>" + (s.played ? golfToParText(s.toPar) : "") + "</div>" +
      "<div style='min-width:52px;text-align:right;font-size:13px;font-weight:700;color:" + GOLF_COLOR + "'>" + (s.points !== null ? s.points + " pts" : "") + "</div>" +
    "</div>";
  }
  function paintTotals() {
    var w = who();
    document.getElementById("golfTotals").innerHTML =
      totalsLine("You", golfPlayerStats(d, d.strokes, w.me)) +
      (w.name ? totalsLine(esc(w.name), golfPlayerStats(d, d.pStrokes, w.p)) : "");
  }
  function playerLine(cls, label, arr, i, hcp) {
    var v = arr[i];
    var shots = golfSiComplete(d.si, d.holes) ? golfShots(hcp, d.si[i], d.holes) : 0;
    var pts = (hcp !== "" && golfSiComplete(d.si, d.holes)) ? golfPoints(d.pars[i], shots, v) : null;
    var diff = v === "" ? "" : "<span style='font-weight:700;color:" + golfToParColor(v - d.pars[i]) + "'>" + golfToParText(v - d.pars[i]) + "</span>";
    var sub = [];
    if (shots) sub.push(shots > 0 ? shots + " shot" + (shots > 1 ? "s" : "") : "gives " + (-shots));
    if (pts !== null) sub.push("<b style='color:" + GOLF_COLOR + "'>" + pts + " pt" + (pts !== 1 ? "s" : "") + "</b>");
    // v504: in the one-hole view each player gets two rows — who and how
    // it's going, then a full-width big stepper.
    if (mode === "one") {
      return "<div style='margin-top:10px'>" +
        "<div style='display:flex;align-items:baseline;gap:8px'>" +
          "<div style='flex:1;min-width:0;font-size:16px;font-weight:700;color:#2A2010;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" + label +
            (sub.length ? " <span style='font-size:13px;font-weight:600;color:#6E5E48'>&middot; " + sub.join(" &middot; ") + "</span>" : "") + "</div>" +
          "<span style='font-size:16px'>" + diff + "</span>" +
        "</div>" +
        "<div style='display:flex;align-items:center;gap:10px;margin-top:6px'>" + golfStepperHTML(cls, i, v === "" ? "&ndash;" : v, true) + "</div>" +
      "</div>";
    }
    return "<div style='display:flex;align-items:center;gap:8px;margin-top:4px'>" +
      "<div style='flex:1;min-width:0'><div style='font-size:13px;font-weight:700;color:#2A2010;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" + label + "</div>" +
      "<div style='font-size:12px;color:#6E5E48'>" + (sub.join(" &middot; ") || "&nbsp;") + "</div></div>" +
      "<span style='width:30px;text-align:right;font-size:13px'>" + diff + "</span>" +
      golfStepperHTML(cls, i, v === "" ? "&ndash;" : v) +
    "</div>";
  }
  function paintHoles() {
    var w = who(), siOk = golfSiComplete(d.si, d.holes), h = "";
    var one = mode === "one";
    if (cur >= d.holes) cur = d.holes - 1;            // a switch to a 9-hole course
    for (var i = one ? cur : 0; i < (one ? cur + 1 : d.holes); i++) {
      // The advantage: who receives more handicap shots on this hole. Known
      // before a ball is struck, so it shows on an empty card.
      var adv = "";
      if (siOk && w.name && w.me !== "" && w.p !== "") {
        var gap = golfShots(w.me, d.si[i], d.holes) - golfShots(w.p, d.si[i], d.holes);
        if (gap) adv = (gap > 0 ? "You" : esc(w.name)) + " +" + Math.abs(gap) + " shot" + (Math.abs(gap) > 1 ? "s" : "");
      }
      h += "<div class='golf-hole' data-i='" + i + "'" + (adv ? " data-adv='" + (adv.indexOf("You") === 0 ? "me" : "p") + "'" : "") + " style='background:" + (adv ? "#FFF6DD" : "#fff") + ";border:1.5px solid " + (adv ? "#E2C46A" : "#E3EADB") + ";border-radius:10px;margin-bottom:6px;padding:6px 8px'>" +
        "<div style='display:flex;align-items:center;gap:8px'>" +
          "<div style='flex:1;font-size:15px;font-weight:700;color:#2A2010'>Hole " + (i + 1) +
            " <span style='font-size:12px;font-weight:600;color:#6E5E48'>&middot; Par " + d.pars[i] + (siOk ? " &middot; SI " + d.si[i] : "") + (d.dist[i] !== "" ? " &middot; " + golfDistText(d.dist[i], d.unit) : "") + "</span></div>" +
          (adv ? "<span style='flex-shrink:0;background:#F3DF9E;color:#5A4300;font-size:12px;font-weight:700;border-radius:20px;padding:3px 9px'>" + adv + "</span>" : "") +
        "</div>" +
        playerLine("golf-st", "You", d.strokes, i, w.me) +
        (w.name ? playerLine("golf-ps", esc(w.name), d.pStrokes, i, w.p) : "") +
      "</div>";
    }
    // v503 one-hole view: Prev / Next under the single hole. Scores still
    // autosave on every tap; Next only moves, it never saves anything extra.
    if (one) {
      // v504: big Prev / Next (64px, Next twice as wide) — the other tap made every hole.
      var nb = "min-height:64px;padding:0 12px;border:2px solid #C9D6BC;background:#fff;color:" + GOLF_COLOR + ";border-radius:14px;font-family:inherit;font-size:20px;font-weight:700;cursor:pointer;touch-action:manipulation";
      h += "<div id='golfHoleOf' style='text-align:center;font-size:14px;font-weight:700;color:#4A5A3A;margin:6px 0'>Hole " + (cur + 1) + " of " + d.holes + "</div>" +
        "<div style='display:flex;gap:10px'>" +
        "<button type='button' id='golfPrevHole'" + (cur === 0 ? " disabled" : "") + " style='flex:1;" + nb + (cur === 0 ? ";opacity:.4" : "") + "'>&lsaquo; Prev</button>" +
        "<button type='button' id='golfNextHole'" + (cur === d.holes - 1 ? " disabled" : "") + " style='flex:2;" + nb + (cur === d.holes - 1 ? ";opacity:.4" : ";background:" + GOLF_COLOR + ";color:#fff;border-color:" + GOLF_COLOR) + "'>Next &rsaquo;</button>" +
      "</div>";
    }
    var box = document.getElementById("golfHoles");
    box.innerHTML = h;
    if (one) {
      document.getElementById("golfPrevHole").addEventListener("click", function(){ if (cur > 0) { cur--; paintHoles(); } });
      document.getElementById("golfNextHole").addEventListener("click", function(){ if (cur < d.holes - 1) { cur++; paintHoles(); } });
    }
    box.querySelectorAll(".golf-st-up, .golf-st-dn, .golf-ps-up, .golf-ps-dn").forEach(function(b){
      b.addEventListener("click", function(){
        var i = +b.dataset.i, mine = b.className.indexOf("golf-st") === 0;
        var arr = mine ? d.strokes : d.pStrokes, v = arr[i], up = /-up$/.test(b.className);
        var firstScore = !anyScore();
        // The first tap on an empty hole lands on par — most holes are within
        // one of it, so that's the fewest taps. − below 1 clears the hole.
        if (v === "") v = d.pars[i];
        else if (up) v = Math.min(GOLF_STROKE_MAX, v + 1);
        else v = v - 1 < 1 ? "" : v - 1;
        arr[i] = v;
        if (firstScore && setupOpen && anyScore()) { setupOpen = false; paintSetup(); }
        paintHoles(); paintTotals();
        persist();
      });
    });
  }
  function paintCoursePicks() {
    el.querySelectorAll(".golf-course-pick").forEach(function(b){
      var on = +b.dataset.id === d.courseId;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.style.background = on ? GOLF_COLOR : "#fff";
      b.style.color      = on ? "#fff" : "#4A5A3A";
      b.style.border     = "1.5px solid " + (on ? GOLF_COLOR : "#D9E2CF");
    });
  }
  function repaint() { paintSiNote(); paintTotals(); paintHoles(); }
  // v503: Full card or One hole, remembered per phone. One hole opens on the
  // first hole still missing a score, so a slept phone resumes where it was.
  var mode = golfViewPref();
  var cur = golfFirstOpenHole(d, who().name);
  function paintViewPick() {
    el.querySelectorAll(".golf-view-pick").forEach(function(b){
      var on = b.dataset.v === mode;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.style.background = on ? GOLF_COLOR : "#fff";
      b.style.color      = on ? "#fff" : "#4A5A3A";
      b.style.border     = "1.5px solid " + (on ? GOLF_COLOR : "#D9E2CF");
    });
  }
  el.querySelectorAll(".golf-view-pick").forEach(function(b){
    b.addEventListener("click", function(){
      if (b.dataset.v === mode) return;
      mode = b.dataset.v === "one" ? "one" : "full";
      golfSetViewPref(mode);
      if (mode === "one") cur = golfFirstOpenHole(d, who().name);
      paintViewPick(); paintHoles();
    });
  });
  paintViewPick();
  // v504: the round's details (course, date, handicaps, partner) collapse to
  // one summary line. Confirmed 04/10/2026: it collapses by itself the moment
  // the first score goes in, and a round that already has scores reopens
  // collapsed; a fresh round opens expanded for setting up. A tap on the
  // summary toggles it either way.
  function anyScore() { return golfPlayerStats(d, d.strokes, "").played > 0 || golfPlayerStats(d, d.pStrokes, "").played > 0; }
  var setupOpen = !anyScore();
  function paintSetup() {
    var w = who(), parts = [esc(d.courseName || "Course")];
    var dt = projDateText(document.getElementById("golfEdDate").value);
    if (dt) parts.push(dt);
    if (w.me !== "") parts.push("You " + w.me);
    if (w.name) parts.push("with " + esc(w.name) + (w.p !== "" ? " " + w.p : ""));
    var sum = document.getElementById("golfSetupSum");
    sum.setAttribute("aria-expanded", setupOpen ? "true" : "false");
    sum.innerHTML = setupOpen
      ? "<span style='flex:1;font-size:12px;font-weight:700;color:#7A6A55;text-transform:uppercase;letter-spacing:.5px'>Round details</span><span style='font-size:13px;font-weight:700;color:" + GOLF_COLOR + "'>Hide &#x25B4;</span>"
      : "<span style='flex:1;min-width:0;font-size:14px;font-weight:600;color:#2A2010;line-height:1.4'>" + parts.join(" &middot; ") + "</span><span style='flex-shrink:0;font-size:13px;font-weight:700;color:" + GOLF_COLOR + "'>Edit &#x25BE;</span>";
    document.getElementById("golfSetup").style.display = setupOpen ? "block" : "none";
  }
  document.getElementById("golfSetupSum").addEventListener("click", function(){ setupOpen = !setupOpen; paintSetup(); });
  paintSetup();
  repaint(); paintCoursePicks();
  el.querySelectorAll(".golf-course-pick").forEach(function(b){
    b.addEventListener("click", function(){
      var c = golfFind(golfCourses(), +b.dataset.id);
      if (!c || c.id === d.courseId) return;
      // Switching course re-snapshots its pars and stroke indexes; scores
      // already entered stay on their hole numbers.
      var nd = golfDraftFor(c);
      for (var i = 0; i < nd.holes; i++) {
        if (d.strokes[i] !== undefined) nd.strokes[i] = d.strokes[i];
        if (d.pStrokes[i] !== undefined) nd.pStrokes[i] = d.pStrokes[i];
      }
      d = nd;
      paintCoursePicks(); repaint();
      persist();
    });
  });
  inMy.addEventListener("input", function(){ paintTotals(); paintHoles(); });
  inP.addEventListener("input", function(){ inP.dataset.auto = "0"; paintTotals(); paintHoles(); });
  // A name you've played with before fills in their last handicap, unless
  // you've typed one yourself for this round.
  inName.addEventListener("input", function(){
    var k = golfFind(known.map(function(x){ return { id: x.name.toLowerCase(), hcp: x.hcp }; }), inName.value.trim().toLowerCase());
    if (k && k.hcp !== "" && (inP.value === "" || inP.dataset.auto === "1")) { inP.value = k.hcp; inP.dataset.auto = "1"; }
    // A handicap WE filled in belongs to that partner only — once the name
    // stops matching, clear it rather than let the next name inherit it.
    // One typed by hand (auto "0") is left alone.
    else if (!k && inP.dataset.auto === "1") { inP.value = ""; inP.dataset.auto = "0"; }
    paintTotals(); paintHoles();
  });
  // Text fields save when they're left, and again if the page is hidden
  // mid-typing (the visibilitychange hook beside the Golf wiring).
  ["golfEdMyHcp", "golfEdPartner", "golfEdPHcp", "golfEdDate", "golfEdNotes"].forEach(function(id){
    document.getElementById(id).addEventListener("change", function(){ persist(); });
  });
  function paintSaved() {
    document.getElementById("golfSaved").innerHTML = r ? "&#x2713; Saved as you go" : "Scores save as you enter them";
  }
  paintSaved();
  // Writes the round as it stands. Nothing is written for a new round until
  // a hole has a score; after that every call rewrites the whole record
  // (every field, "" for blanks — the v296 rule) with a fresh `updated`.
  function persist() {
    var w = who();
    var scored = golfPlayerStats(d, d.strokes, "").played || golfPlayerStats(d, d.pStrokes, "").played;
    if (!r && !scored) return false;
    var vals = {
      kind: "round",
      date: document.getElementById("golfEdDate").value.trim(),
      courseId: d.courseId, courseName: d.courseName, holes: d.holes,
      pars: d.pars.slice(), si: d.si.slice(), dist: d.dist.slice(), unit: d.unit, strokes: d.strokes.slice(),
      myHcp: w.me, partner: w.name, partnerHcp: w.p, pStrokes: d.pStrokes.slice(),
      notes: document.getElementById("golfEdNotes").value
    };
    var all = getGolf(), now = Date.now();
    var cur = r ? golfFind(all, r.id) : null;
    if (!cur) {
      // A brand-new round, or one deleted on the other phone mid-round: keep
      // the scores. A fresh `updated` outranks that delete's tombstone.
      cur = { id: r ? r.id : projNewId(), addedBy: (r && r.addedBy) || hearthUser, added: (r && r.added) || now };
      all.unshift(cur);
    }
    Object.keys(vals).forEach(function(k){ cur[k] = vals[k]; });
    cur.updated = now;
    saveGolf(all);
    r = cur;
    document.getElementById("golfEdDelete").style.display = "block";
    paintSaved();
    return true;
  }
  // quiet: leaving by back/+ — save and go, no handicap warning to block it.
  function done(quiet) {
    var w = who();
    if (!quiet && ((inMy.value.trim() !== "" && w.me === "") || (w.name && inP.value.trim() !== "" && w.p === ""))) {
      toast("A playing handicap is a whole number from -10 to 54"); return;
    }
    persist();
    leave();
  }
  document.getElementById("golfEdDone").addEventListener("click", function(){ done(false); });
  document.getElementById("golfEdDelete").addEventListener("click", function(){
    if (!r) return;
    confirmDialog("Delete this round at &ldquo;" + esc(d.courseName || "Course") + "&rdquo;?", function(){ golfDelete(r.id); leave(); });
  });
}
// v503: the scorecard view, a device-local UI preference (`fl4_golf_view`,
// like the fl4_catOpen_* keys: not synced, not in the backup).
function golfViewPref() {
  try { return storeGet("fl4_golf_view") === "one" ? "one" : "full"; } catch (e) { return "full"; }
}
function golfSetViewPref(v) {
  try { storeSet("fl4_golf_view", v === "one" ? "one" : "full"); } catch (e) {}
}
// The first hole missing a score — yours, or the partner's when there is
// one. A finished card starts on hole 1.
function golfFirstOpenHole(d, partnerName) {
  for (var i = 0; i < d.holes; i++) {
    if (d.strokes[i] === "" || (partnerName && d.pStrokes[i] === "")) return i;
  }
  return 0;
}
function golfDraftFor(c) {
  var st = [], ps = [];
  for (var i = 0; i < c.holes; i++) { st.push(""); ps.push(""); }
  return { courseId: c.id, courseName: c.name || "", holes: c.holes, pars: c.pars.slice(), si: c.si.slice(),
           dist: c.dist.slice(), unit: c.unit, strokes: st, pStrokes: ps };
}

function renderGolfCourseEditor() {
  var el = document.getElementById("golfContent");
  if (!el) return;
  var c = null;
  if (_golfEditId != null) {
    c = golfFind(getGolf(), _golfEditId);
    if (!c || c.kind !== "course") { _golfView = "courses"; _golfEditId = null; renderGolf(); return; }
  }
  _golfEditing = true;
  // Pars and stroke indexes are drafted for all 18 holes, so flipping
  // 18 → 9 → 18 doesn't lose the back nine; the save keeps only the first
  // `holes` of them.
  var holes = c ? c.holes : 18;
  var pars = [], si = [], dist = [];
  for (var i = 0; i < 18; i++) {
    pars.push(c && c.pars[i] ? c.pars[i] : 4);
    si.push(c && c.si[i] !== undefined ? c.si[i] : "");
    dist.push(c && c.dist[i] !== undefined ? c.dist[i] : "");
  }
  var unit = c ? c.unit : "m";
  var thenRound = _golfThenRound;
  _golfThenRound = false;
  function leave() {
    _golfEditing = false; _golfCancelFn = null;
    _golfView = thenRound ? "list" : "courses"; _golfEditId = null;
    renderGolf(); window.scrollTo(0, 0);
  }
  _golfCancelFn = leave;
  el.innerHTML =
    "<div style='" + PROJ_LBL + "'>Course name</div>" +
    "<input id='golfCoName' type='text' placeholder='e.g. Fota Island' style='" + PROJ_INP + "' value='" + esc((c && c.name) || "") + "'>" +
    "<div style='" + PROJ_LBL + ";margin-top:14px'>Holes</div>" +
    "<div style='display:flex;gap:6px'>" +
      [9, 18].map(function(n){
        return "<button type='button' class='golf-holes-pick' data-n='" + n + "' aria-pressed='false' style='flex:1;padding:10px;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>" + n + " holes</button>";
      }).join("") +
    "</div>" +
    "<div style='" + PROJ_LBL + ";margin-top:14px'>Distances in</div>" +
    "<div style='display:flex;gap:6px'>" +
      [["m", "Metres"], ["yd", "Yards"]].map(function(u){
        return "<button type='button' class='golf-unit-pick' data-u='" + u[0] + "' aria-pressed='false' style='flex:1;padding:10px;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>" + u[1] + "</button>";
      }).join("") +
    "</div>" +
    "<div id='golfParTotal' style='" + PROJ_LBL + ";margin-top:14px'></div>" +
    "<div style='font-size:12px;line-height:1.5;color:#6E5E48;margin:-2px 0 8px'>SI is the stroke index from the scorecard (1 = hardest hole). Optional, but Stableford points and handicap shots need it on every hole. Distances are optional, for the tees this course is set up for.</div>" +
    "<div id='golfPars'></div>" +
    "<div style='" + PROJ_LBL + ";margin-top:14px'>Notes " + PROJ_OPT + "</div>" +
    "<textarea id='golfCoNotes' rows='3' placeholder='Tee times, booking number&hellip;' style='" + PROJ_INP + ";resize:vertical'>" + esc((c && c.notes) || "") + "</textarea>" +
    golfEditorButtons(c ? "Delete this course" : "");

  function paintParTotal() {
    var dt = golfDistSummary(golfDistArr(dist.slice(0, holes), holes), unit);
    document.getElementById("golfParTotal").innerHTML = "Par, stroke index and distance for each hole &middot; par " + golfParTotal(pars.slice(0, holes)) +
      (dt ? " &middot; " + dt : "");
  }
  function paintPars() {
    var h = "";
    for (var i = 0; i < holes; i++) {
      // v505: two lines per hole — Hole N + par stepper, then SI + distance
      // (three inputs and a stepper don't fit one phone-width row).
      var inp = "box-sizing:border-box;padding:9px 4px;border:1.5px solid #D9E2CF;border-radius:8px;font-family:inherit;font-size:16px;text-align:center;background:#fff;color:#2A2010";
      h += "<div style='background:#fff;border:1.5px solid #E3EADB;border-radius:10px;margin-bottom:6px;padding:4px 8px 8px'>" +
        "<div style='display:flex;align-items:center;gap:8px'>" +
          "<div style='flex:1;font-size:15px;font-weight:700;color:#2A2010'>Hole " + (i + 1) + " <span style='font-size:12px;font-weight:600;color:#6E5E48'>&middot; Par</span></div>" +
          golfStepperHTML("golf-par", i, pars[i]) +
        "</div>" +
        "<div style='display:flex;align-items:center;gap:14px;margin-top:4px'>" +
          "<label style='display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#6E5E48'>SI" +
            "<input class='golf-si' data-i='" + i + "' type='number' inputmode='numeric' min='1' max='" + holes + "' aria-label='Stroke index, hole " + (i + 1) + "' value='" + esc(String(si[i])) + "' style='width:52px;" + inp + "'></label>" +
          "<label style='display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#6E5E48'>Distance" +
            "<input class='golf-dist' data-i='" + i + "' type='number' inputmode='numeric' min='1' max='" + GOLF_DIST_MAX + "' aria-label='Distance, hole " + (i + 1) + "' value='" + esc(String(dist[i])) + "' style='width:70px;" + inp + "'>" +
            "<span class='golf-dist-unit'>" + (unit === "yd" ? "yd" : "m") + "</span></label>" +
        "</div>" +
      "</div>";
    }
    var box = document.getElementById("golfPars");
    box.innerHTML = h;
    box.querySelectorAll(".golf-si").forEach(function(inp){
      inp.addEventListener("input", function(){ si[+inp.dataset.i] = inp.value.trim(); });
    });
    box.querySelectorAll(".golf-dist").forEach(function(inp){
      inp.addEventListener("input", function(){ dist[+inp.dataset.i] = inp.value.trim(); paintParTotal(); });
    });
    box.querySelectorAll(".golf-par-up, .golf-par-dn").forEach(function(b){
      b.addEventListener("click", function(){
        var i = +b.dataset.i;
        pars[i] = Math.max(GOLF_PAR_MIN, Math.min(GOLF_PAR_MAX, pars[i] + (b.classList.contains("golf-par-up") ? 1 : -1)));
        box.querySelector(".golf-par-val[data-i='" + i + "']").textContent = pars[i];
        paintParTotal();
      });
    });
  }
  function paintHolesPick() {
    el.querySelectorAll(".golf-holes-pick").forEach(function(b){
      var on = +b.dataset.n === holes;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.style.background = on ? GOLF_COLOR : "#fff";
      b.style.color      = on ? "#fff" : "#4A5A3A";
      b.style.border     = "1.5px solid " + (on ? GOLF_COLOR : "#D9E2CF");
    });
  }
  function paintUnitPick() {
    el.querySelectorAll(".golf-unit-pick").forEach(function(b){
      var on = b.dataset.u === unit;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.style.background = on ? GOLF_COLOR : "#fff";
      b.style.color      = on ? "#fff" : "#4A5A3A";
      b.style.border     = "1.5px solid " + (on ? GOLF_COLOR : "#D9E2CF");
    });
    el.querySelectorAll(".golf-dist-unit").forEach(function(s){ s.textContent = unit === "yd" ? "yd" : "m"; });
  }
  el.querySelectorAll(".golf-unit-pick").forEach(function(b){
    b.addEventListener("click", function(){ unit = golfUnitOf(b.dataset.u); paintUnitPick(); paintParTotal(); });
  });
  paintHolesPick(); paintParTotal(); paintPars(); paintUnitPick();
  el.querySelectorAll(".golf-holes-pick").forEach(function(b){
    b.addEventListener("click", function(){ holes = golfHoles(b.dataset.n); paintHolesPick(); paintParTotal(); paintPars(); paintUnitPick(); });
  });
  document.getElementById("golfEdCancel").addEventListener("click", leave);
  var del = document.getElementById("golfEdDelete");
  if (del) del.addEventListener("click", function(){
    confirmDialog("Delete the course &ldquo;" + esc(c.name || "Course") + "&rdquo;? Rounds already played there keep their scores.", function(){ golfDelete(c.id); leave(); });
  });
  document.getElementById("golfEdSave").addEventListener("click", function(){
    var name = document.getElementById("golfCoName").value.trim();
    if (!name) { toast("Give the course a name first"); return; }
    var siErr = golfSiCheck(si.slice(0, holes), holes);
    if (siErr) { toast(siErr); return; }
    for (var di = 0; di < holes; di++) {
      if (String(dist[di]).trim() !== "" && golfDistOf(dist[di]) === "") { toast("Hole " + (di + 1) + "&rsquo;s distance must be a whole number from 1 to " + GOLF_DIST_MAX); return; }
    }
    var vals = { kind: "course", name: name, holes: holes, pars: pars.slice(0, holes),
                 si: golfSiArr(si.slice(0, holes), holes), dist: golfDistArr(dist.slice(0, holes), holes), unit: unit,
                 notes: document.getElementById("golfCoNotes").value };
    var all = getGolf(), now = Date.now(), savedId;
    if (c) {
      var cur = golfFind(all, c.id);
      if (!cur) { toast("That course is no longer here"); leave(); return; }
      Object.keys(vals).forEach(function(k){ cur[k] = vals[k]; });
      cur.updated = now;
      savedId = cur.id;
    } else {
      var fresh = { id: projNewId(), addedBy: hearthUser, added: now, updated: now };
      Object.keys(vals).forEach(function(k){ fresh[k] = vals[k]; });
      all.unshift(fresh);
      savedId = fresh.id;
    }
    saveGolf(all);
    toast("Saved");
    if (thenRound) {
      _golfEditing = false; _golfCancelFn = null;
      _golfNewCourse = savedId;
      openGolfRound(null);
      return;
    }
    leave();
  });
  var n = document.getElementById("golfCoName");
  if (n && !c) n.focus();
}

// ── Course import (v502, confirmed 03/10/2026) ───────────────────────────
// A `golf-course-v1` JSON file, usually written by an AI chat from the copy
// prompt below. A course whose name matches a saved one (exact, ignoring
// case and outer spaces — never fuzzy, the plants rule) UPDATES it: holes,
// pars and SI are replaced, notes only if the file has some. Everything else
// is added as new. Rounds already played keep their own snapshot of the old
// pars and SI, so an update never rewrites a score. Two saved courses with
// the same name are skipped rather than guessed between. Nothing is written
// until Import is tapped on the preview.
var GOLF_FILE_TAG = "golf-course-v1";
var _golfImportParsed = null;   // the preview's parsed courses, null = paste step

function golfImportPrompt() {
  return "Course: [type the course name and the tees you play, e.g. \"Fota Island Deerpark, white tees\"]\n\n" +
    "I want to add this golf course to my Hearth app. Using the course's official scorecard " +
    "(I may attach a photo of it), give me the par, the stroke index and the distance for every hole.\n\n" +
    "Reply with ONLY this JSON — no code fences, no commentary before or after:\n\n" +
    "{\n" +
    '  "hearth": "' + GOLF_FILE_TAG + '",\n' +
    '  "name": "",\n' +
    '  "holes": 18,\n' +
    '  "pars": [],\n' +
    '  "si": [],\n' +
    '  "unit": "m",\n' +
    '  "dist": [],\n' +
    '  "notes": ""\n' +
    "}\n\n" +
    "Field notes:\n" +
    "- name: the course name as I'd say it, including the layout if the club has more than one.\n" +
    "- holes: 18 or 9.\n" +
    "- pars: one whole number (3 to 6) per hole, in order from hole 1.\n" +
    "- si: the stroke index (handicap) of each hole, in the same order — 1 is the hardest hole, and every " +
    "number from 1 to the number of holes is used exactly once. Use the men's stroke index unless I say otherwise. " +
    "If the card has different figures for different tees, use the tees I named.\n" +
    "- If you can't find a stroke index you're sure of, leave si as [] rather than guessing — I can add it in the app later.\n" +
    "- dist: the length of each hole from the tees I named, as whole numbers in the same order. unit: \"m\" if the card is in metres, \"yd\" if it is in yards. " +
    "If you can't find distances you're sure of, leave dist as [].\n" +
    "- notes: which tees and which source you used, plus anything you're unsure of. Plain text, one or two short lines.\n" +
    "- Several courses at once: wrap them as {\"hearth\": \"" + GOLF_FILE_TAG + "\", \"courses\": [ ... ]}.";
}

// Returns {courses:[{name, holes, pars, si, notes}]} or {error}. Strict on
// purpose: a wrong par on the card is worse than a refused paste, so a bad
// value is reported (naming the course and hole) rather than coerced.
function parseGolfCourseFile(raw) {
  var obj;
  try { obj = JSON.parse(raw); } catch (e) { return { error: "Couldn't read that as JSON — check it and try again." }; }
  if (!obj || typeof obj !== "object" || obj.hearth !== GOLF_FILE_TAG) {
    return { error: "Not a Hearth golf course file. Make sure the JSON includes \"hearth\": \"" + GOLF_FILE_TAG + "\"." };
  }
  var list = (Array.isArray(obj.courses) ? obj.courses : [obj]).filter(function(c){
    return c && typeof c === "object" && !Array.isArray(c);
  });
  if (!list.length) return { error: "No courses found in that file." };
  var out = [];
  for (var n = 0; n < list.length; n++) {
    var c = list[n];
    var name = typeof c.name === "string" ? c.name.trim().slice(0, 80) : "";
    if (!name) return { error: "Every course needs a \"name\"." };
    var pars = Array.isArray(c.pars) ? c.pars : [];
    var holes = (c.holes === undefined || c.holes === null || c.holes === "") ? pars.length : Number(c.holes);
    if (holes !== 9 && holes !== 18) return { error: name + ": \"holes\" must be 9 or 18." };
    if (pars.length !== holes) return { error: name + ": \"pars\" needs " + holes + " numbers, one per hole (it has " + pars.length + ")." };
    for (var i = 0; i < holes; i++) {
      var p = Number(pars[i]);
      if (Math.floor(p) !== p || p < GOLF_PAR_MIN || p > GOLF_PAR_MAX) return { error: name + ": hole " + (i + 1) + "'s par must be a whole number from " + GOLF_PAR_MIN + " to " + GOLF_PAR_MAX + "." };
    }
    var si = Array.isArray(c.si) ? c.si : [];
    if (si.length && si.length !== holes) return { error: name + ": \"si\" needs " + holes + " numbers, one per hole, or [] for none." };
    var siErr = si.length ? golfSiCheck(si, holes) : "";
    if (siErr) return { error: name + ": " + siErr + "." };
    var dist = Array.isArray(c.dist) ? c.dist : [];
    if (dist.length && dist.length !== holes) return { error: name + ": \"dist\" needs " + holes + " numbers, one per hole, or [] for none." };
    for (var di = 0; di < dist.length; di++) {
      if (golfDistOf(dist[di]) === "") return { error: name + ": hole " + (di + 1) + "'s distance must be a whole number from 1 to " + GOLF_DIST_MAX + "." };
    }
    if (c.unit !== undefined && c.unit !== null && c.unit !== "" && ["m", "yd", "yards", "metres", "meters", "y"].indexOf(String(c.unit).toLowerCase()) === -1) {
      return { error: name + ": \"unit\" must be \"m\" or \"yd\"." };
    }
    var unitRaw = String(c.unit || "").toLowerCase();
    out.push({ name: name, holes: holes, pars: pars.map(Number),
               si: golfSiArr(si, holes), dist: golfDistArr(dist, holes), unit: golfUnitOf(unitRaw === "yards" ? "yd" : unitRaw),
               notes: typeof c.notes === "string" ? c.notes.trim().slice(0, 500) : "" });
  }
  return { courses: out };
}

// What Import will do with each parsed course: {c, action:"new"|"update"|"skip", target, why}.
function golfImportPlan(list) {
  var saved = golfCourses(), seen = {};
  return list.map(function(c){
    var key = c.name.toLowerCase();
    var hits = saved.filter(function(s){ return String(s.name || "").trim().toLowerCase() === key; });
    if (seen[key]) return { c: c, action: "skip", why: "the file has this name twice" };
    seen[key] = true;
    if (hits.length > 1) return { c: c, action: "skip", why: "you have two saved courses with this name — rename one first" };
    if (hits.length === 1) {
      // A file with no stroke index keeps the saved one (same hole count
      // only). Decided here, once, so the preview and Import can't disagree.
      var t = hits[0];
      var keepSi = !golfSiComplete(c.si, c.holes) && t.holes === c.holes && golfSiComplete(t.si, t.holes);
      var keepDist = !golfHasDist(c.dist) && t.holes === c.holes && golfHasDist(t.dist);   // v505, the same rule
      return { c: c, action: "update", target: t, keepSi: keepSi, keepDist: keepDist };
    }
    return { c: c, action: "new" };
  });
}

// Writes the plan. Returns {added, updated}.
function golfApplyImport(plan) {
  var all = getGolf(), now = Date.now(), added = 0, updated = 0;
  // One base for the batch with a 1000 stride (the other bulk importers'
  // shape), stepped past any id already in the store — two projNewId() calls
  // in one millisecond can collide, and a shared id merges two courses.
  var nextId = projNewId();
  function freshId() {
    while (golfFind(all, nextId)) nextId++;
    var id = nextId; nextId += 1000; return id;
  }
  plan.forEach(function(p){
    if (p.action === "update") {
      var cur = golfFind(all, p.target.id);
      if (!cur) return;
      var siKeep = p.keepSi ? cur.si.slice() : (golfSiComplete(p.c.si, p.c.holes) ? p.c.si.slice() : golfSiArr([], p.c.holes));
      cur.name = p.c.name; cur.holes = p.c.holes; cur.pars = p.c.pars.slice(); cur.si = siKeep;
      if (!p.keepDist) { cur.dist = golfDistArr(p.c.dist, p.c.holes); cur.unit = golfUnitOf(p.c.unit); }
      if (p.c.notes) cur.notes = p.c.notes;
      cur.updated = now;
      updated++;
    } else if (p.action === "new") {
      all.unshift({ id: freshId(), kind: "course", name: p.c.name, holes: p.c.holes, pars: p.c.pars.slice(),
                    si: p.c.si.slice(), dist: golfDistArr(p.c.dist, p.c.holes), unit: golfUnitOf(p.c.unit), notes: p.c.notes, addedBy: hearthUser, added: now, updated: now });
      added++;
    }
  });
  if (added || updated) saveGolf(all);
  return { added: added, updated: updated };
}

function openGolfImport() {
  _golfImportParsed = null;
  _golfEditId = null;
  _golfView = "import";
  renderGolf();
  window.scrollTo(0, 0);
}

function renderGolfImport() {
  var el = document.getElementById("golfContent");
  if (!el) return;
  _golfEditing = true;                        // a sync mid-paste must not redraw the textarea away
  function leave() {
    _golfEditing = false; _golfCancelFn = null; _golfImportParsed = null;
    _golfView = "courses";
    renderGolf(); window.scrollTo(0, 0);
  }
  _golfCancelFn = leave;
  var back = "<button id='golfImpBack' style='border:none;background:none;color:" + GOLF_COLOR + ";font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px;touch-action:manipulation'>&larr; " + (_golfImportParsed ? "Back" : "Cancel") + "</button>" +
    "<div style='font-size:20px;font-weight:700;margin-bottom:10px;color:#2A2010'>Import a course</div>";

  if (!_golfImportParsed) {
    el.innerHTML = back +
      "<div style='font-size:13px;color:#4A5A3A;background:#F2F6EC;border:1px solid #D9E2CF;border-radius:10px;padding:12px 14px;margin-bottom:12px;line-height:1.65'>" +
        "<b>How to use this with an AI chat:</b>" +
        "<div style='margin-top:6px'>1. Copy the prompt below.</div>" +
        "<div>2. Paste it into a chat, fill in the course name and your tees on the first line, and attach a photo of the scorecard if you have one.</div>" +
        "<div>3. Paste the JSON it replies with into the box below.</div>" +
      "</div>" +
      "<button id='golfCopyPrompt' style='width:100%;padding:12px;border:1.5px solid " + GOLF_COLOR + ";background:#fff;color:" + GOLF_COLOR + ";border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:6px;touch-action:manipulation'>&#x1F4CB; Copy the prompt</button>" +
      "<details style='margin-bottom:14px'><summary style='font-size:12px;color:#6E5E48;cursor:pointer;padding:4px 2px'>See the prompt</summary>" +
        "<textarea id='golfPromptText' readonly rows='10' style='" + PROJ_INP + ";margin-top:8px;resize:vertical;line-height:1.5;font-size:11px;font-family:monospace'>" + esc(golfImportPrompt()) + "</textarea>" +
      "</details>" +
      "<textarea id='golfImportJson' rows='8' placeholder='Paste the JSON here&hellip;' style='" + PROJ_INP + ";margin-bottom:14px;resize:vertical;line-height:1.5;font-size:12px;font-family:monospace'></textarea>" +
      "<button id='golfImportNext' style='width:100%;padding:13px;border:none;background:" + GOLF_COLOR + ";color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation'>Next &rsaquo;</button>";
    document.getElementById("golfImpBack").addEventListener("click", leave);
    document.getElementById("golfCopyPrompt").addEventListener("click", function(){ copyToClipboard(golfImportPrompt(), "&#x1F4CB; Prompt copied"); });
    document.getElementById("golfImportNext").addEventListener("click", function(){
      var raw = stripPasteFence(document.getElementById("golfImportJson").value);
      if (!raw) { toast("Paste the JSON first"); return; }
      var parsed = parseGolfCourseFile(raw);
      if (parsed.error) { toast(esc(parsed.error)); return; }
      _golfImportParsed = parsed.courses;
      renderGolfImport();
      window.scrollTo(0, 0);
    });
    return;
  }

  // Step 2 — the preview. Nothing is written until Import.
  var plan = golfImportPlan(_golfImportParsed);
  var doing = plan.filter(function(p){ return p.action !== "skip"; }).length;
  var html = back;
  plan.forEach(function(p){
    var badge = p.action === "update" ? ["Will update", "#FBEBD9", "#8A4A10"] :
                p.action === "new"    ? ["New", "#E4F2E6", "#2D6B35"] : ["Skipped", "#F3EEE3", "#6B5A3A"];
    html += "<div class='golf-imp-row' data-action='" + p.action + "' style='background:#fff;border:1.5px solid #E3EADB;border-radius:12px;margin-bottom:8px;padding:12px'>" +
      "<div style='display:flex;align-items:center;gap:8px'>" +
        "<div style='flex:1;min-width:0;font-size:15px;font-weight:600;color:#2A2010'>" + esc(p.c.name) + "</div>" +
        "<span style='flex-shrink:0;background:" + badge[1] + ";color:" + badge[2] + ";font-size:12px;font-weight:700;border-radius:20px;padding:4px 9px'>" + badge[0] + "</span>" +
      "</div>" +
      "<div style='font-size:12px;color:#6E5E48;margin-top:4px'>" + p.c.holes + " holes &middot; par " + golfParTotal(p.c.pars) + " &middot; " +
        (golfSiComplete(p.c.si, p.c.holes) ? "stroke index included" : p.keepSi ? "keeps your saved stroke index" : "no stroke index") + "</div>" +
      "<div style='font-size:12px;color:#4A5A3A;margin-top:6px;line-height:1.6'>Pars: " + p.c.pars.join(" ") +
        (golfSiComplete(p.c.si, p.c.holes) ? "<br>SI: " + p.c.si.join(" ") : "") +
        (golfHasDist(p.c.dist) ? "<br>Distances (" + (p.c.unit === "yd" ? "yd" : "m") + "): " + p.c.dist.map(function(n){ return n === "" ? "&ndash;" : n; }).join(" ") + " &middot; total " + golfDistSummary(p.c.dist, p.c.unit)
          : p.keepDist ? "<br>Keeps your saved distances" : "") + "</div>" +
      (p.c.notes ? "<div style='font-size:12px;color:#6E5E48;margin-top:4px'>" + esc(p.c.notes) + "</div>" : "") +
      (p.action === "skip" ? "<div style='font-size:12px;color:#B03030;margin-top:4px'>Not imported: " + esc(p.why) + ".</div>" : "") +
    "</div>";
  });
  if (plan.some(function(p){ return p.action === "update"; })) {
    html += "<div style='font-size:12px;color:#6E5E48;margin:2px 2px 12px;line-height:1.5'>Updating replaces the course&rsquo;s holes and pars, and its stroke index when the file has one. Rounds already played there keep the scores and pars they were played to.</div>";
  }
  html += "<button id='golfImportGo' " + (doing ? "" : "disabled ") + "style='width:100%;padding:13px;border:none;background:" + (doing ? GOLF_COLOR : "#B8C4AC") + ";color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation'>Import" + (doing > 1 ? " " + doing + " courses" : "") + "</button>";
  el.innerHTML = html;
  document.getElementById("golfImpBack").addEventListener("click", function(){ _golfImportParsed = null; renderGolfImport(); window.scrollTo(0, 0); });
  document.getElementById("golfImportGo").addEventListener("click", function(){
    var res = golfApplyImport(plan);
    var parts = [];
    if (res.added) parts.push(res.added + " added");
    if (res.updated) parts.push(res.updated + " updated");
    toast(parts.length ? "&#x26F3; " + parts.join(", ") : "Nothing imported");
    leave();
  });
}

