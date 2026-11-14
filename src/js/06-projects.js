// ============================================================
// PROJECTS (v499) — renovations, DIY and household admin: the thing
// Lists → General was being misused for. Design confirmed 31/08/2026, the
// three open questions answered 30/09/2026 (HEARTH-backlog.md):
//   • The TRIPS shape: one project record (name, status, target date, notes)
//     holding TYPED child items — tasks, quotes, costs, contacts, links.
//   • Status is a FIXED set (PROJ_STATUSES), never free text.
//   • Costs carry no currency field: amounts are euro, formatted by the
//     inventory's applianceMoney and parsed by applianceParseValue.
//   • A task can be COPIED to the To-do list (projSendTaskToTodo). One-way:
//     after the copy the two are separate records and ticking one does not
//     tick the other. A live link was offered and declined — it would tie
//     two synced stores together, which is where sync bugs come from.
//   • Home gets ONE self-suppressing Today line (projHomeSummary).
//
// Deliberately NOT a fifth list type: the four list types are hard-coded
// across 13 sync/backup/export sites and a project item carries fields none
// of them have (the v391 Watchlist decision, unchanged).
//
// SYNC is the Trips contract, NOT the Health one: a project is a CONTAINER
// of independently-edited items, so whole-record newest-wins would let one
// phone ticking a task silently undo the other phone adding a quote to the
// same project. mergeProjectsData merges the project fields newest-wins by
// `updated` and the items by id, newest-wins by each item's own `updated`,
// with a separate `fl4_tomb_projitems` namespace — mergeTripsData /
// fl4_tomb_bookings, one level down. An item edit stamps the ITEM only, so
// it never makes the project's own fields win or lose a merge.
//
// Firebase stores no empty container (the v478 bags lesson): a new project's
// `items:[]` comes back off the echo as a missing key, and a sparse array
// comes back as an object. projItemsOf() normalises at the read boundary, so
// never read `p.items` without going through getProjects()/projItemsOf().
// ============================================================
var PROJ_COLOR = "#8A5A2B";
var PROJ_STATUSES = [
  { key:"idea",     label:"Idea",        ico:"&#x1F4A1;", bg:"#F3EEE3", fg:"#6B5A3A" },
  { key:"planning", label:"Planning",    ico:"&#x1F4DD;", bg:"#E6EEF7", fg:"#2F4F7A" },
  { key:"active",   label:"In progress", ico:"&#x1F528;", bg:"#FBEBD9", fg:"#8A4A10" },
  { key:"done",     label:"Done",        ico:"&#x2705;",  bg:"#E4F2E6", fg:"#2D6B35" }
];
// Only these count on Home. An Idea is a someday project and Done is done,
// so neither should put a line on a card read every morning.
var PROJ_HOME_STATUSES = ["planning", "active"];
// The list's group order: what you're doing, then what's next, then someday.
// Done is its own collapsed group at the bottom.
var PROJ_LIST_ORDER = ["active", "planning", "idea"];
function projStatusMeta(k) {
  for (var i = 0; i < PROJ_STATUSES.length; i++) if (PROJ_STATUSES[i].key === k) return PROJ_STATUSES[i];
  return PROJ_STATUSES[1];   // unknown/missing status reads as Planning rather than throwing
}
function projStatusPill(k) {
  var s = projStatusMeta(k);
  return "<span style='flex-shrink:0;background:" + s.bg + ";color:" + s.fg + ";font-size:12px;font-weight:700;border-radius:20px;padding:4px 9px;white-space:nowrap'>" + s.label + "</span>";
}

var PROJ_ITEM_TYPES = [
  { key:"task",    label:"Task",    plural:"Tasks",    ico:"&#x2611;&#xFE0F;" },
  { key:"link",    label:"Link",    plural:"Links",    ico:"&#x1F517;" }
];
// v512 (Cathal, 06/11/2026): Quote, Cost and Contact were retired — that
// detail goes in the notes now. Items of those types already saved are KEPT
// in the data (sync, merge and backup carry them untouched) but are never
// shown, counted or searched. Do NOT let them fall through to the "unknown
// reads as a task" default below: they would reappear as tasks.
var PROJ_RETIRED_ITEM_TYPES = { quote:true, cost:true, contact:true };
var PROJ_RETIRED_META = { key:"retired", label:"Item", plural:"Items", ico:"" };
function projItemTypeMeta(k) {
  for (var i = 0; i < PROJ_ITEM_TYPES.length; i++) if (PROJ_ITEM_TYPES[i].key === k) return PROJ_ITEM_TYPES[i];
  if (PROJ_RETIRED_ITEM_TYPES[k] === true) return PROJ_RETIRED_META;
  return PROJ_ITEM_TYPES[0];
}
function projItemShown(it) { return !!it && projItemTypeMeta(it.type).key !== "retired"; }
// What each item type ASKS FOR and what the shared fields are CALLED — the
// HEALTH_KIND_FIELDS pattern. "" / false means the field isn't shown for
// that type. Every item STORES every field whatever its type ("" or false,
// never a dropped key — the v296 rule), so the merge never refills a
// cleared field from the other phone.
var PROJ_ITEM_FIELDS = {
  task:    { title:"Task",               date:"Due",     amount:"",       who:"",              phone:false, url:""                  },
  link:    { title:"Label",              date:"",        amount:"",       who:"",              phone:false, url:"Web address"       }
};
function projItemFields(type) { return PROJ_ITEM_FIELDS[projItemTypeMeta(type).key] || PROJ_ITEM_FIELDS.task; }

// The read boundary. Accepts Firebase's shapes: a missing key (an empty
// array it refused to store) and an object keyed "0","1",… (a sparse array).
function projItemsOf(p) {
  var raw = p && p.items;
  if (raw && !Array.isArray(raw) && typeof raw === "object") raw = Object.keys(raw).map(function(k){ return raw[k]; });
  if (!Array.isArray(raw)) return [];
  return raw.filter(function(x){ return x && typeof x === "object" && x.id != null; });
}
function getProjects() {
  var p = storeGet("fl4_projects");
  if (!Array.isArray(p)) return [];
  return p.filter(function(x){ return x && typeof x === "object" && x.id != null; })
          .map(function(x){ x.items = projItemsOf(x); return x; });
}
function saveProjects(p) {
  storeSet("fl4_projects", p);
  pushPersonal();
  if (typeof isHouseholdSet === "function" && isHouseholdSet()) pushHousehold();
}
function projFind(all, id) {
  for (var i = 0; i < all.length; i++) if (all[i] && all[i].id === id) return all[i];
  return null;
}
function projNewId() { return Date.now() + Math.floor(Math.random() * 1000); }

// Trips-shape merge, see the header comment. Returns {projects, push} —
// push=true means our merged copy is fuller or newer than what arrived, so
// the caller re-pushes to converge (the mergeTripsData contract).
function mergeProjectsData(localP, incomingP, projTombs, itemTombs) {
  projTombs = projTombs || {}; itemTombs = itemTombs || {};
  var push = false;
  function mergeItems(localI, incI) {
    var incById = {};
    incI.forEach(function(it){ incById[it.id] = it; });
    var localIds = {};
    var merged = localI.map(function(it){
      localIds[it.id] = true;
      var inc = incById[it.id];
      if (!inc) { push = true; return it; }                  // partner missing this → push
      var winner, loser;
      if ((inc.updated||0) > (it.updated||0)) { winner = inc; loser = it; }
      else {
        if ((it.updated||0) > (inc.updated||0)) push = true;  // local newer → push to converge
        winner = it; loser = inc;
      }
      // v296 field-fill: keys UNDEFINED on the winner come from the loser, so
      // an older build's copy can't wipe a field it has never heard of. A
      // deliberately cleared field is "" and stays cleared.
      Object.keys(loser).forEach(function(k){ if (winner[k] === undefined) winner[k] = loser[k]; });
      return winner;
    });
    var fresh = incI.filter(function(it){ return !localIds[it.id]; });
    var full = fresh.concat(merged);
    var pre = full.length;
    full = full.filter(function(it){ return !(itemTombs[it.id] && itemTombs[it.id] >= (it.updated||0)); });
    if (full.length < pre) push = true;
    return full;
  }
  var incById = {};
  (incomingP || []).forEach(function(p){ if (p && typeof p === "object" && p.id != null) incById[p.id] = p; });
  var localIds = {};
  var merged = (localP || []).filter(function(p){ return p && typeof p === "object" && p.id != null; }).map(function(p){
    localIds[p.id] = true;
    var inc = incById[p.id];
    if (!inc) { push = true; return p; }
    var winner = (inc.updated||0) > (p.updated||0) ? inc : p;
    var loser  = winner === p ? inc : p;
    if ((p.updated||0) > (inc.updated||0)) push = true;
    // v296: built from BOTH copies (winner's keys win, loser fills gaps), so
    // a future project-level field can't be dropped by an older phone.
    var out = Object.assign({}, loser, winner);
    out.id = p.id;
    out.items = mergeItems(projItemsOf(p), projItemsOf(inc));
    return out;
  });
  var fresh = (incomingP || []).filter(function(p){ return p && typeof p === "object" && p.id != null && !localIds[p.id]; })
    .map(function(p){
      var out = Object.assign({}, p);
      out.items = projItemsOf(p).filter(function(it){ return !(itemTombs[it.id] && itemTombs[it.id] >= (it.updated||0)); });
      return out;
    });
  var full = fresh.concat(merged);
  var pre = full.length;
  full = full.filter(function(p){ return !(projTombs[p.id] && projTombs[p.id] >= (p.updated||0)); });
  if (full.length < pre) push = true;
  return { projects: full, push: push };
}

// ── Derived facts ────────────────────────────────────────────────────────
function projTaskOverdue(it) {
  if (!it || projItemTypeMeta(it.type).key !== "task" || it.done || !it.date) return false;
  var d = tripDaysUntil(it.date);
  return d !== null && d < 0;
}
function projTaskCounts(p) {
  var c = { open:0, done:0, overdue:0 };
  projItemsOf(p).forEach(function(it){
    if (projItemTypeMeta(it.type).key !== "task") return;
    if (it.done) c.done++; else { c.open++; if (projTaskOverdue(it)) c.overdue++; }
  });
  return c;
}
// A missing, blank or junk amount is skipped rather than read as 0 —
// applianceValueNum draws exactly that line for the inventory totals.
function projItemAmount(it) { return applianceValueNum({ value: it && it.amount }); }
// The Home line's numbers, across Planning + In progress projects only.
// null when nothing is open, so the line self-suppresses like every other
// Today row. `onlyId` is the project to deep-link to when every open task
// sits in one project; otherwise the tap lands on the list.
function projHomeSummary() {
  var open = 0, overdue = 0, ids = {};
  getProjects().forEach(function(p){
    if (PROJ_HOME_STATUSES.indexOf(projStatusMeta(p.status).key) === -1) return;
    var c = projTaskCounts(p);
    if (!c.open) return;
    open += c.open; overdue += c.overdue; ids[p.id] = true;
  });
  if (!open) return null;
  var keys = Object.keys(ids);
  return { open:open, overdue:overdue, onlyId: keys.length === 1 ? Number(keys[0]) : null };
}
function projectSearchText(p) {
  if (!p) return "";
  var parts = [p.name, p.notes, projStatusMeta(p.status).label];
  projItemsOf(p).forEach(function(it){ if (projItemShown(it)) parts.push(it.title, it.who, it.notes, it.group); });
  return parts.join(" ").toLowerCase();
}
// v512: an item's group is free text; "Part A" and "part a " are one group
// (shown with the spelling of its earliest item). Returns [{label, items}],
// the ungrouped bucket (label "") first, then groups by earliest `added`.
function projGroupKey(it) { return String((it && it.group) || "").trim().toLowerCase(); }
function projItemGroups(items) {
  // Prototype-free: a group typed as "constructor" or "__proto__" must be a
  // bucket like any other, not an inherited property (PR #284 review).
  var byKey = Object.create(null), order = [];
  items.slice().sort(function(a, b){ return (a.added || 0) - (b.added || 0); }).forEach(function(it){
    var k = projGroupKey(it);
    if (!byKey[k]) { byKey[k] = { label: k ? String(it.group).trim() : "", items: [] }; if (k) order.push(k); }
    byKey[k].items.push(it);
  });
  var out = byKey[""] ? [byKey[""]] : [];
  order.forEach(function(k){ out.push(byKey[k]); });
  return out;
}
// v515: manual task order. A task's `order` is a number, or "" if never set.
// A group's open tasks follow their due dates until someone moves one; that
// first move numbers every open task in the group 1..n as shown, and from
// then on a move changes ONLY the moved task (it takes the midpoint between
// its new neighbours). Do NOT renumber the whole group on every move: the
// item merge is newest-wins per task, so two phones each renumbering n tasks
// would sync into a mix of both orders. Done tasks sink below the open ones
// and keep their number, so un-ticking one puts it back where it was.
function projHasOrder(it) { return !!it && typeof it.order === "number" && isFinite(it.order); }
function projTaskDateCmp(a, b) {
  var da = String(a.date || ""), db = String(b.date || "");
  if (da && db && da !== db) return da.localeCompare(db);
  if (da && !db) return -1;
  if (!da && db) return 1;
  return (a.added || 0) - (b.added || 0);
}
// Tasks of ONE group, in display order: open first (by `order` once the
// group has one — tasks without one, e.g. from an older phone, after them by
// date), then done ones by date.
function projSortTasks(items) {
  var open = items.filter(function(it){ return !it.done; });
  var done = items.filter(function(it){ return !!it.done; });
  var ordered = open.some(projHasOrder);
  open.sort(function(a, b){
    if (ordered) {
      var ha = projHasOrder(a), hb = projHasOrder(b);
      if (ha !== hb) return ha ? -1 : 1;
      if (ha && a.order !== b.order) return a.order - b.order;
      if (ha) return ((a.added || 0) - (b.added || 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }
    return projTaskDateCmp(a, b);
  });
  done.sort(projTaskDateCmp);
  return open.concat(done);
}
function projGroupTasks(p, key, exceptId) {
  return projItemsOf(p).filter(function(x){
    return projItemShown(x) && projItemTypeMeta(x.type).key === "task" && projGroupKey(x) === key && x.id !== exceptId;
  });
}
// The order a task gets on joining a group (added, or moved by its Group
// field): the end of the list if the group has been ordered, else "".
function projOrderForJoin(p, key, exceptId) {
  var max = null;
  projGroupTasks(p, key, exceptId).forEach(function(x){ if (projHasOrder(x) && (max === null || x.order > max)) max = x.order; });
  return max === null ? "" : Math.floor(max) + 1;
}
function projMoveTask(projId, itemId, dir) {
  var all = getProjects();
  var p = projFind(all, projId);
  var it = p ? projFind(p.items, itemId) : null;
  if (!it || it.done || projItemTypeMeta(it.type).key !== "task") return;
  var open = projSortTasks(projGroupTasks(p, projGroupKey(it))).filter(function(x){ return !x.done; });
  var i = open.indexOf(it), j = i + dir;
  if (i < 0 || j < 0 || j >= open.length) return;     // -1 guard (CLAUDE.md), and the ends
  var now = Date.now();
  function renumber(list) {
    list.forEach(function(x, n){ if (x.order !== n + 1) { x.order = n + 1; x.updated = now; } });
  }
  if (!open.every(projHasOrder)) renumber(open);      // the group's first move
  var rest = open.filter(function(x){ return x !== it; });
  var before = rest[j - 1], after = rest[j];
  var o = !before ? after.order - 1 : !after ? before.order + 1 : (before.order + after.order) / 2;
  if (before && after && !(o > before.order && o < after.order)) {
    rest.splice(j, 0, it);                             // tied or worn-out gap: renumber once
    renumber(rest);
  } else {
    it.order = o;
    it.updated = now;                                  // the ITEM only — see the header comment
  }
  saveProjects(all);
  renderProjects();
}
function projDateText(v) {
  var s = String(v || "");
  if (!s) return "";
  return listDate(s) || esc(s);        // listDate is the one row-date format (v498); junk shows escaped, for correction
}

// ── One-way copy to the To-do list (confirmed 30/09/2026) ──────────────────
// Writes an ordinary To-do item and then forgets about it: no link field on
// either side, so ticking one never ticks the other. `sentAt` on the task
// only drives the "on To-do" marker, so a second tap is a visible choice
// rather than an accidental duplicate. Goes through loadListData, not
// addItemToCurrent — that one works on whichever list is currently open.
function projSendTaskToTodo(projId, itemId) {
  var all = getProjects();
  var p = projFind(all, projId);
  var it = p ? projFind(p.items, itemId) : null;
  if (!it) { toast("That task is no longer here"); return false; }
  var name = String(it.title || "").trim();
  if (!name) return false;
  var d = loadListData("todo");
  var low = name.toLowerCase();
  if (d.items.some(function(x){ return x && !x.done && String(x.name || "").toLowerCase() === low; })) {
    toast("Already on your To-do list");
    return false;
  }
  var catId = "other", kw = LIST_CONFIG.todo.kw;
  for (var k = 0; k < kw.length; k++) { if (low.indexOf(kw[k][0]) !== -1) { catId = kw[k][1]; break; } }
  var now = Date.now();
  d.items.unshift({ id: now + Math.floor(Math.random() * 1000), name: name, catId: catId, done: false,
                    dueDate: it.date || null, notes: "From project: " + String(p.name || ""),
                    addedBy: hearthUser, updated: now, added: now });
  storeSet(LIST_CONFIG.todo.key, d);
  pushPersonal();
  if (isHouseholdSet() && isSynced("todo")) pushHousehold();
  it.sentAt = now; it.updated = now;
  saveProjects(all);
  toast("Copied to To-do");
  return true;
}

// ── Mutations ────────────────────────────────────────────────────────────
function projDelete(id) {
  var all = getProjects();
  var i = all.findIndex(function(p){ return p.id === id; });
  if (i < 0) return;                                   // -1 guard (CLAUDE.md)
  all.splice(i, 1);
  addTomb("projects", id);
  saveProjects(all);
  var folds = projFolds();                             // v516: drop its folded sections too
  if (Object.prototype.hasOwnProperty.call(folds, id)) { delete folds[id]; try { storeSet("fl4_proj_folds", folds); } catch (e) {} }
  _projOpenId = null; _projView = "list";
  renderProjects();
  toast("Deleted");
}
function projItemDelete(projId, itemId) {
  var all = getProjects();
  var p = projFind(all, projId);
  if (!p) return;
  var i = p.items.findIndex(function(it){ return it.id === itemId; });
  if (i < 0) return;
  p.items.splice(i, 1);
  addTomb("projitems", itemId);
  saveProjects(all);
  toast("Deleted");
}
function projToggleTask(projId, itemId) {
  var all = getProjects();
  var p = projFind(all, projId);
  var it = p ? projFind(p.items, itemId) : null;
  if (!it) return;
  it.done = !it.done;
  it.updated = Date.now();                             // the ITEM only — see the header comment
  saveProjects(all);
  renderProjects();
}

// ── UI state ─────────────────────────────────────────────────────────────
var _projView      = "list";   // "list" | "detail" | "editor" | "item" | "import"
var _projImportParsed = null;  // import step 2: the parsed plan, null on step 1 (v512)
var _projOpenId    = null;     // project shown in detail (and the parent of an item being edited)
var _projEditId    = null;     // project editor: id being edited, null = new
var _projItemId    = null;     // item editor: id being edited, null = new
var _projItemType  = "task";   // item editor: the type being added/edited
var _projShowDone  = false;    // Done group expanded — session only
var _projNotesOpen = {};       // v513: project id -> long notes expanded — session only
var _projReorderId = null;     // v515: project whose tasks show the move arrows — session only
var _projEditing   = false;    // sync-render guard, same role as _healthEditing
var _projCancelFn  = null;     // back-button discard closure (v345 pattern)

function projBtn(cls, label, extra, attrs) {
  return "<button class='" + cls + "'" + (attrs || "") + " style='padding:10px 12px;border:1.5px solid #E2D6C6;background:#fff;color:#5A4630;border-radius:9px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation;" + (extra || "") + "'>" + label + "</button>";
}
function projGroupHeader(text) {
  return "<div style='font-size:11px;font-weight:700;color:#7A6A55;text-transform:uppercase;letter-spacing:.5px;margin:14px 2px 7px'>" + text + "</div>";
}
// v516: folded sections of a project's detail. Device-local UI state like
// fl4_catOpen_* — not synced, not in the backup — so each phone folds its
// own view. Shape { projectId: { sectionKey: 1 } }; absent = open. Section
// keys: "t:task" / "t:link" for the ungrouped type sections, "g:" + the
// group's projGroupKey for a named group. The "t:"/"g:" prefix also keeps a
// group typed as "__proto__" from reading an inherited property.
function projFolds() {
  var f = null;
  try { f = storeGet("fl4_proj_folds"); } catch (e) {}
  return (f && typeof f === "object" && !Array.isArray(f)) ? f : {};
}
function projSecFolded(projId, sec) {
  var f = projFolds()[projId];
  return !!(f && typeof f === "object" && Object.prototype.hasOwnProperty.call(f, sec) && f[sec]);
}
function projSetFolds(projId, secs, folded) {
  var all = projFolds();
  var f = (all[projId] && typeof all[projId] === "object") ? all[projId] : {};
  secs.forEach(function(s){ if (folded) f[s] = 1; else delete f[s]; });
  if (Object.keys(f).length) all[projId] = f; else delete all[projId];
  try { storeSet("fl4_proj_folds", all); } catch (e) {}
}
function projFoldHeader(sec, text, folded) {
  return "<button type='button' class='proj-fold' data-sec='" + esc(sec) + "' aria-expanded='" + (folded ? "false" : "true") + "' " +
    "style='display:flex;align-items:center;gap:8px;width:100%;min-height:44px;margin:4px 0 3px;padding:8px 2px;border:none;background:none;text-align:left;font-family:inherit;font-size:11px;font-weight:700;color:#7A6A55;text-transform:uppercase;letter-spacing:.5px;cursor:pointer;touch-action:manipulation'>" +
    "<span style='flex:1;min-width:0'>" + text + "</span>" +
    "<span aria-hidden='true' style='flex-shrink:0;font-size:12px;color:" + PROJ_COLOR + "'>" + (folded ? "&#x25BC;" : "&#x25B2;") + "</span></button>";
}

function renderProjects() {
  _projEditing = false;
  _projCancelFn = null;
  if (_projView === "editor") { renderProjectEditor(); return; }
  if (_projView === "item")   { renderProjectItemEditor(); return; }
  if (_projView === "detail") { renderProjectDetail(); return; }
  if (_projView === "import") { renderProjectImport(); return; }
  _projView = "list";
  var el = document.getElementById("projectsContent");
  if (!el) return;
  var all = getProjects();
  if (!all.length) {
    el.innerHTML = "<div style='text-align:center;color:#7A6A55;padding:40px 20px'>" +
      "<div style='font-size:40px;margin-bottom:10px'>&#x1F528;</div>" +
      "<div style='font-size:16px;font-weight:600;margin-bottom:4px;color:#2A2010'>No projects yet</div>" +
      "<div style='font-size:13px;line-height:1.55'>Renovations, DIY and household admin &mdash; each with its own tasks and links. Tap + to start one, or import a plan from the &#x22EF; menu.</div></div>";
    return;
  }
  var html = "";
  PROJ_LIST_ORDER.forEach(function(sk){
    var group = all.filter(function(p){ return projStatusMeta(p.status).key === sk; });
    if (!group.length) return;
    group.sort(projListSort);
    var s = projStatusMeta(sk);
    html += projGroupHeader(s.ico + " " + s.label + " &middot; " + group.length);
    group.forEach(function(p){ html += projCardHTML(p); });
  });
  var done = all.filter(function(p){ return projStatusMeta(p.status).key === "done"; });
  if (done.length) {
    done.sort(function(a, b){ return (b.updated || 0) - (a.updated || 0); });
    html += "<button id='projDoneToggle' aria-expanded='" + (_projShowDone ? "true" : "false") + "' style='display:block;width:100%;margin:14px 0 7px;padding:10px;border:1.5px dashed #E2D6C6;background:none;color:#7A6A55;border-radius:10px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation'>" +
      "&#x2705; Done &middot; " + done.length + " " + (_projShowDone ? "&#x25B2;" : "&#x25BC;") + "</button>";
    if (_projShowDone) done.forEach(function(p){ html += projCardHTML(p); });
  }
  el.innerHTML = html;
  el.querySelectorAll(".proj-card").forEach(function(b){
    b.addEventListener("click", function(){ _projOpenId = +b.dataset.pid; _projView = "detail"; renderProjects(); window.scrollTo(0, 0); });
  });
  var dt = document.getElementById("projDoneToggle");
  if (dt) dt.addEventListener("click", function(){ _projShowDone = !_projShowDone; renderProjects(); });
}
// Soonest target first; a project with no target date sinks below the dated ones.
function projListSort(a, b) {
  var ta = String(a.target || ""), tb = String(b.target || "");
  if (ta && tb && ta !== tb) return ta.localeCompare(tb);
  if (ta && !tb) return -1;
  if (!ta && tb) return 1;
  return String(a.name || "").localeCompare(String(b.name || ""));
}
function projCardHTML(p) {
  var c = projTaskCounts(p);
  var sub = [];
  if (p.target) sub.push("Target " + projDateText(p.target));
  if (c.open || c.done) sub.push(c.done + " of " + (c.open + c.done) + " tasks done");
  return "<div class='proj-card' data-pid='" + esc(String(p.id)) + "' style='background:#fff;border:1.5px solid #EDE3D5;border-radius:12px;margin-bottom:8px;padding:12px;cursor:pointer;touch-action:manipulation'>" +
    "<div style='display:flex;align-items:center;gap:8px'>" +
      "<div style='flex:1;min-width:0;font-size:15px;font-weight:600;color:#2A2010;line-height:1.3'>" + esc(p.name || "Untitled project") + "</div>" +
      (c.overdue ? "<span style='flex-shrink:0;background:#FBE9E9;color:#B03030;font-size:12px;font-weight:700;border-radius:20px;padding:4px 9px;white-space:nowrap'>" + c.overdue + " overdue</span>" : "") +
      projStatusPill(p.status) +
    "</div>" +
    (sub.length ? "<div style='font-size:12px;color:#6E5E48;margin-top:4px'>" + sub.join(" &middot; ") + "</div>" : "") +
  "</div>";
}

// v515: `pos` (optional) = { num, up, down } for an open task — its number in
// its group, and which move arrows to draw (only while reordering).
function projItemRowHTML(p, it, pos) {
  var t = projItemTypeMeta(it.type).key;
  var f = projItemFields(t);
  var idAttr = " data-iid='" + esc(String(it.id)) + "'";
  var amt = f.amount ? projItemAmount(it) : null;
  var url = f.url ? applianceLinkUrl(it.url) : "";          // gated at render too (v483 rule)
  var tel = f.phone ? healthPhoneHref(it) : "";              // the one phone gate, reused
  var sub = [];
  if (f.who && it.who) sub.push(esc(it.who));
  if (f.date && it.date) {
    var dTxt = projDateText(it.date);
    sub.push(projTaskOverdue(it) ? "<b style='color:#B03030'>Due " + dTxt + "</b>" : (t === "task" ? "Due " + dTxt : dTxt));
  }
  if (t === "task" && it.sentAt) sub.push("<span style='color:#5A3AA0;font-weight:700'>&#x2713; on To-do</span>");
  var h = "<div style='display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid #EDE3D5;border-radius:12px;margin-bottom:6px;padding:4px 10px 4px 4px" + (t === "task" && it.done ? ";opacity:.6" : "") + "'>";
  if (t === "task") {
    h += "<button class='proj-tick'" + idAttr + " role='checkbox' aria-checked='" + (it.done ? "true" : "false") + "' aria-label='" + (it.done ? "Mark not done: " : "Mark done: ") + esc(it.title || "task") + "' " +
      "style='flex-shrink:0;width:44px;height:44px;border:none;background:none;cursor:pointer;touch-action:manipulation;display:flex;align-items:center;justify-content:center'>" +
      "<span style='width:24px;height:24px;border-radius:50%;border:2px solid " + (it.done ? "#2D6B35" : "#B8A68E") + ";background:" + (it.done ? "#2D6B35" : "#fff") + ";color:#fff;font-size:14px;line-height:20px;text-align:center'>" + (it.done ? "&#x2713;" : "") + "</span></button>";
  } else {
    h += "<span style='flex-shrink:0;width:44px;text-align:center;font-size:18px'>" + projItemTypeMeta(t).ico + "</span>";
  }
  h += "<div class='proj-item-body'" + idAttr + " style='flex:1;min-width:0;padding:8px 0;cursor:pointer;touch-action:manipulation'>" +
      "<div style='font-size:14px;font-weight:600;color:#2A2010;line-height:1.3" + (t === "task" && it.done ? ";text-decoration:line-through" : "") + "'>" + (pos && pos.num ? "<span style='color:" + PROJ_COLOR + ";font-weight:700'>" + pos.num + ".</span> " : "") + esc(it.title || "Untitled") + "</div>" +
      (sub.length ? "<div style='font-size:12px;color:#6E5E48;margin-top:2px'>" + sub.join(" &middot; ") + "</div>" : "") +
    "</div>";
  if (pos && (pos.up || pos.down)) {
    [["up", -1, "&#x2191;", "Move up: "], ["down", 1, "&#x2193;", "Move down: "]].forEach(function(a){
      var on = pos[a[0]];
      h += "<button class='proj-move'" + idAttr + " data-dir='" + a[1] + "'" + (on ? "" : " disabled") + " aria-label='" + a[3] + esc(it.title || "task") + "' " +
        "style='flex-shrink:0;width:44px;height:44px;border:1.5px solid #E2D6C6;border-radius:9px;background:#fff;color:" + PROJ_COLOR + ";font-size:20px;font-weight:700;cursor:pointer;touch-action:manipulation" + (on ? "" : ";opacity:.3") + "'>" + a[2] + "</button>";
    });
  }
  if (amt !== null) h += "<span style='flex-shrink:0;font-size:14px;font-weight:700;color:#2A2010'>" + applianceMoney(amt) + "</span>";
  if (tel) h += "<a href='" + esc(tel) + "' aria-label='Call " + esc(it.title || "") + "' style='flex-shrink:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:1.5px solid #E2D6C6;border-radius:9px;text-decoration:none;font-size:16px'>&#x1F4DE;</a>";
  if (url) h += "<a href='" + esc(url) + "' target='_blank' rel='noopener' aria-label='Open " + esc(it.title || "link") + "' style='flex-shrink:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:1.5px solid #E2D6C6;border-radius:9px;text-decoration:none;color:" + PROJ_COLOR + ";font-size:16px;font-weight:700'>&#x2197;</a>";
  return h + "</div>";
}

function renderProjectDetail() {
  var el = document.getElementById("projectsContent");
  if (!el) return;
  var p = projFind(getProjects(), _projOpenId);
  // Deleted on the other phone, or a stale deep link — fall back to the list.
  if (!p) { _projView = "list"; _projOpenId = null; renderProjects(); return; }
  var c = projTaskCounts(p);
  var html = "<button id='projBack' style='border:none;background:none;color:" + PROJ_COLOR + ";font-family:inherit;font-size:14px;font-weight:700;padding:6px 2px 10px;cursor:pointer;touch-action:manipulation'>&#x2039; All projects</button>";
  html += "<div style='background:#fff;border:1.5px solid #EDE3D5;border-radius:14px;padding:14px;margin-bottom:6px'>" +
    "<div style='display:flex;align-items:flex-start;gap:8px'>" +
      "<div style='flex:1;min-width:0;font-size:19px;font-weight:700;color:#2A2010;line-height:1.3'>" + esc(p.name || "Untitled project") + "</div>" +
      projStatusPill(p.status) +
    "</div>";
  var facts = [];
  if (p.target) facts.push("Target " + projDateText(p.target));
  if (c.open || c.done) facts.push(c.done + " of " + (c.open + c.done) + " tasks done" + (c.overdue ? " &middot; <b style='color:#B03030'>" + c.overdue + " overdue</b>" : ""));
  if (facts.length) html += "<div style='font-size:13px;color:#6E5E48;margin-top:6px;line-height:1.6'>" + facts.join("<br>") + "</div>";
  // v513: long notes (an imported plan's background) start folded to about
  // five lines so the tasks aren't pushed a screen down; tap to unfold.
  var notesLong = p.notes && (p.notes.length > 260 || p.notes.split("\n").length > 6);
  var notesOpen = !!_projNotesOpen[p.id];
  if (p.notes) html += "<div id='projNotesBody' style='font-size:14px;color:#2A2010;line-height:1.55;white-space:pre-wrap;margin-top:10px" +
      (notesLong && !notesOpen ? ";max-height:7.75em;overflow:hidden;-webkit-mask-image:linear-gradient(#000 60%,transparent);mask-image:linear-gradient(#000 60%,transparent)" : "") + "'>" + esc(p.notes) + "</div>";
  if (notesLong) html += "<button id='projNotesToggle' type='button' aria-expanded='" + (notesOpen ? "true" : "false") + "' style='border:none;background:none;color:" + PROJ_COLOR + ";font-family:inherit;font-size:13px;font-weight:700;padding:8px 0 0;cursor:pointer;touch-action:manipulation'>" +
      (notesOpen ? "Show less &#x25B2;" : "Show more &#x25BC;") + "</button>";
  html += "<div style='display:flex;gap:8px;margin-top:12px'>" +
    projBtn("proj-edit", "Edit", "flex:1") +
    projBtn("proj-del", "Delete", "flex:1;color:#B03030;border-color:#F0D0D0") +
    "</div></div>";

  // One add button per type: the type is chosen by the tap, so the item
  // editor never needs a type picker.
  html += "<div style='display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 2px'>";
  PROJ_ITEM_TYPES.forEach(function(ty){
    html += "<button class='proj-add' data-type='" + ty.key + "' style='flex:1 1 30%;padding:10px 4px;border:1.5px dashed #D9C8B0;background:#fff;color:" + PROJ_COLOR + ";border-radius:9px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation'>+ " + ty.label + "</button>";
  });
  html += "</div>";

  // v512: groups. Ungrouped items come first, under their type headers
  // exactly as before groups existed; then each named group, in the order
  // its first item was added (so an imported plan keeps its own order),
  // with its tasks then its links.
  // v515: the Reorder toggle, only when some group has two open tasks to swap.
  var canReorder = projItemGroups(p.items.filter(projItemShown)).some(function(g){
    return g.items.filter(function(it){ return projItemTypeMeta(it.type).key === "task" && !it.done; }).length > 1;
  });
  var reordering = canReorder && _projReorderId === p.id;
  if (canReorder) html += "<button id='projReorder' type='button' aria-pressed='" + (reordering ? "true" : "false") + "' style='display:block;width:100%;margin:8px 0 0;padding:10px;border:1.5px solid " + (reordering ? PROJ_COLOR : "#E2D6C6") + ";background:" + (reordering ? PROJ_COLOR : "#fff") + ";color:" + (reordering ? "#fff" : PROJ_COLOR) + ";border-radius:9px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation'>" +
    (reordering ? "&#x2713; Done reordering" : "&#x2195;&#xFE0F; Reorder tasks") + "</button>";
  // v516: every section header folds its section; the sections are built
  // into secHtml first so the Collapse all / Expand all button above them
  // knows how many there are and whether any is open.
  var secHtml = "", secKeys = [], anyOpen = false;
  projItemGroups(p.items.filter(projItemShown)).forEach(function(g){
    var gKey = g.label ? "g:" + projGroupKey(g.items[0]) : "";
    var gFolded = !!gKey && projSecFolded(p.id, gKey);
    if (g.label) {
      var gc = { open:0, done:0 };
      g.items.forEach(function(it){ if (projItemTypeMeta(it.type).key === "task") { if (it.done) gc.done++; else gc.open++; } });
      secKeys.push(gKey); if (!gFolded) anyOpen = true;
      secHtml += projFoldHeader(gKey, "&#x1F4C2; " + esc(g.label) + " &middot; " +
        (gc.open + gc.done ? gc.done + " of " + (gc.open + gc.done) + " done" : g.items.length), gFolded);
    }
    PROJ_ITEM_TYPES.forEach(function(ty){
      var items = g.items.filter(function(it){ return projItemTypeMeta(it.type).key === ty.key; });
      if (!items.length) return;
      if (gFolded) return;
      if (ty.key === "task") {
        // v515: open tasks in their set order (by due date until one is
        // moved), numbered 1..n within the group; done ones last.
        items = projSortTasks(items);
      } else if (g.label) {
        items.sort(function(a, b){ return (a.added || 0) - (b.added || 0); });
      } else {
        items.sort(function(a, b){ return String(a.title || "").localeCompare(String(b.title || "")); });
      }
      if (!g.label) {
        var tKey = "t:" + ty.key, tFolded = projSecFolded(p.id, tKey);
        secKeys.push(tKey); if (!tFolded) anyOpen = true;
        secHtml += projFoldHeader(tKey, ty.ico + " " + ty.plural + " &middot; " + items.length, tFolded);
        if (tFolded) return;
      }
      var openN = ty.key === "task" ? items.filter(function(it){ return !it.done; }).length : 0;
      items.forEach(function(it, n){
        var pos = (ty.key === "task" && !it.done) ? { num: n + 1 } : null;
        if (pos && reordering) { pos.up = n > 0; pos.down = n < openN - 1; }
        secHtml += projItemRowHTML(p, it, pos);
      });
    });
  });
  if (secKeys.length > 1) html += "<div style='text-align:right;margin-top:6px'><button id='projFoldAll' type='button' style='border:none;background:none;min-height:44px;padding:8px 2px;color:" + PROJ_COLOR + ";font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation'>" +
    (anyOpen ? "Collapse all &#x25B2;" : "Expand all &#x25BC;") + "</button></div>";
  html += secHtml;
  el.innerHTML = html;

  document.getElementById("projBack").addEventListener("click", function(){ _projView = "list"; _projOpenId = null; _projReorderId = null; renderProjects(); window.scrollTo(0, 0); });
  el.querySelector(".proj-edit").addEventListener("click", function(){ openProjectEditor(p.id); });
  var nt = document.getElementById("projNotesToggle");
  if (nt) nt.addEventListener("click", function(){ _projNotesOpen[p.id] = !_projNotesOpen[p.id]; renderProjects(); });
  el.querySelector(".proj-del").addEventListener("click", function(){
    confirmDialog("Delete &ldquo;" + esc(p.name || "this project") + "&rdquo; and everything in it?", function(){ projDelete(p.id); });
  });
  el.querySelectorAll(".proj-add").forEach(function(b){
    b.addEventListener("click", function(){ openProjectItemEditor(null, b.dataset.type); });
  });
  el.querySelectorAll(".proj-tick").forEach(function(b){
    b.addEventListener("click", function(){ projToggleTask(p.id, +b.dataset.iid); });
  });
  el.querySelectorAll(".proj-fold").forEach(function(b){
    b.addEventListener("click", function(){ projSetFolds(p.id, [b.dataset.sec], b.getAttribute("aria-expanded") === "true"); renderProjects(); });
  });
  var fa = document.getElementById("projFoldAll");
  if (fa) fa.addEventListener("click", function(){ projSetFolds(p.id, secKeys, anyOpen); renderProjects(); });   // the Lists rule: any open → collapse all
  var ro = document.getElementById("projReorder");
  if (ro) ro.addEventListener("click", function(){ _projReorderId = reordering ? null : p.id; renderProjects(); });
  el.querySelectorAll(".proj-move").forEach(function(b){
    b.addEventListener("click", function(){ projMoveTask(p.id, +b.dataset.iid, +b.dataset.dir); });
  });
  el.querySelectorAll(".proj-item-body").forEach(function(b){
    b.addEventListener("click", function(){ openProjectItemEditor(+b.dataset.iid); });
  });
}

function openProjectEditor(id) {
  _projEditId = (id == null) ? null : id;
  _projView = "editor";
  renderProjects();
  window.scrollTo(0, 0);
}
function openProjectItemEditor(itemId, type) {
  _projItemId = (itemId == null) ? null : itemId;
  _projItemType = type || "task";
  _projView = "item";
  renderProjects();
  window.scrollTo(0, 0);
}

var PROJ_LBL = "font-size:11px;font-weight:700;color:#7A6A55;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px";
var PROJ_INP = "width:100%;box-sizing:border-box;padding:11px;border:1.5px solid #E2D6C6;border-radius:9px;font-family:inherit;font-size:16px;background:#fff;color:#2A2010";
var PROJ_OPT = "<span style='text-transform:none;font-weight:600;color:#7F6F58'>(optional)</span>";
// An optional date with a Clear button — an <input type="date"> has no
// reliable clear affordance on a phone (the v454 expiry lesson).
function projDateFieldHTML(id, label, value) {
  return "<div style='" + PROJ_LBL + ";margin-top:14px'>" + label + " " + PROJ_OPT + "</div>" +
    "<div style='display:flex;gap:8px;align-items:center'>" +
      "<input id='" + id + "' type='date' style='" + PROJ_INP + ";flex:1;min-width:0' value='" + esc(value || "") + "'>" +
      "<button type='button' class='proj-date-clear' data-for='" + id + "' style='flex:0 0 auto;padding:11px 14px;border:1.5px solid #E2D6C6;background:#fff;color:#5A4630;border-radius:9px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation'>Clear</button>" +
    "</div>";
}
function projEditorButtons() {
  return "<div style='display:flex;gap:8px;margin-top:18px'>" +
    "<button id='projEdCancel' style='flex:1;padding:13px;border:1.5px solid #E2D6C6;background:#fff;color:#5A4630;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation'>Cancel</button>" +
    "<button id='projEdSave' style='flex:2;padding:13px;border:none;background:" + PROJ_COLOR + ";color:#fff;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>Save</button>" +
  "</div>";
}
function projWireDateClears(el) {
  el.querySelectorAll(".proj-date-clear").forEach(function(b){
    b.addEventListener("click", function(){ var t = document.getElementById(b.dataset.for); if (t) t.value = ""; });
  });
}

function renderProjectEditor() {
  var el = document.getElementById("projectsContent");
  if (!el) return;
  var p = null;
  if (_projEditId != null) {
    p = projFind(getProjects(), _projEditId);
    if (!p) { _projView = "list"; _projEditId = null; renderProjects(); return; }
  }
  _projEditing = true;
  var statusDraft = p ? projStatusMeta(p.status).key : "planning";
  function leave() {
    _projEditing = false; _projCancelFn = null;
    _projView = p ? "detail" : "list"; _projEditId = null;
    renderProjects(); window.scrollTo(0, 0);
  }
  _projCancelFn = leave;
  el.innerHTML =
    "<div style='" + PROJ_LBL + "'>Project</div>" +
    "<input id='projEdName' type='text' placeholder='e.g. Kitchen extension' style='" + PROJ_INP + "' value='" + esc((p && p.name) || "") + "'>" +
    "<div style='" + PROJ_LBL + ";margin-top:14px'>Status</div>" +
    "<div style='display:flex;flex-wrap:wrap;gap:6px'>" +
      PROJ_STATUSES.map(function(s){
        return "<button type='button' class='proj-status-pick' data-status='" + s.key + "' aria-pressed='false' style='flex:1 1 40%;padding:10px 4px;border-radius:9px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation'>" + s.ico + " " + s.label + "</button>";
      }).join("") +
    "</div>" +
    projDateFieldHTML("projEdTarget", "Target date", p && p.target) +
    "<div style='" + PROJ_LBL + ";margin-top:14px'>Notes " + PROJ_OPT + "</div>" +
    "<textarea id='projEdNotes' rows='4' placeholder='Scope, measurements, decisions made&hellip;' style='" + PROJ_INP + ";resize:vertical'>" + esc((p && p.notes) || "") + "</textarea>" +
    projEditorButtons();

  function paintStatus() {
    el.querySelectorAll(".proj-status-pick").forEach(function(b){
      var on = b.dataset.status === statusDraft;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.style.background = on ? PROJ_COLOR : "#fff";
      b.style.color      = on ? "#fff" : "#5A4630";
      b.style.border     = "1.5px solid " + (on ? PROJ_COLOR : "#E2D6C6");
    });
  }
  paintStatus();
  el.querySelectorAll(".proj-status-pick").forEach(function(b){
    b.addEventListener("click", function(){ statusDraft = projStatusMeta(b.dataset.status).key; paintStatus(); });
  });
  projWireDateClears(el);
  document.getElementById("projEdCancel").addEventListener("click", leave);
  document.getElementById("projEdSave").addEventListener("click", function(){
    var name = document.getElementById("projEdName").value.trim();
    if (!name) { toast("Give the project a name first"); return; }
    // Every field written, always — "" is defined and survives the v296
    // field-fill; a dropped key would be refilled by the other phone.
    var vals = {
      name:   name,
      status: statusDraft,
      target: document.getElementById("projEdTarget").value.trim(),
      notes:  document.getElementById("projEdNotes").value
    };
    var all = getProjects(), now = Date.now();
    if (_projEditId != null) {
      var cur = projFind(all, _projEditId);
      if (!cur) { toast("That project is no longer here"); _projView = "list"; _projEditId = null; renderProjects(); return; }
      Object.keys(vals).forEach(function(k){ cur[k] = vals[k]; });
      cur.updated = now;
      _projOpenId = cur.id;
    } else {
      var fresh = { id: projNewId(), addedBy: hearthUser, added: now, updated: now, items: [] };
      Object.keys(vals).forEach(function(k){ fresh[k] = vals[k]; });
      all.unshift(fresh);
      _projOpenId = fresh.id;
    }
    saveProjects(all);
    _projEditing = false; _projCancelFn = null;
    _projView = "detail"; _projEditId = null;
    renderProjects(); window.scrollTo(0, 0);
    toast("Saved");
  });
  var n = document.getElementById("projEdName");
  if (n && !p) n.focus();
}

function renderProjectItemEditor() {
  var el = document.getElementById("projectsContent");
  if (!el) return;
  var p = projFind(getProjects(), _projOpenId);
  if (!p) { _projView = "list"; _projOpenId = null; _projItemId = null; renderProjects(); return; }
  var it = null;
  if (_projItemId != null) {
    it = projFind(p.items, _projItemId);
    // Deleted on the other phone while the editor was open — back to the
    // project rather than saving a resurrected copy.
    // A retired type (v512) is never shown, so this is only a stale handle.
    if (!it || !projItemShown(it)) { _projView = "detail"; _projItemId = null; renderProjects(); return; }
    _projItemType = projItemTypeMeta(it.type).key;
  }
  var type = projItemTypeMeta(_projItemType).key;
  if (type === "retired") type = "task";
  var meta = projItemTypeMeta(type);
  var f = projItemFields(type);
  _projEditing = true;
  function leave() {
    _projEditing = false; _projCancelFn = null;
    _projView = "detail"; _projItemId = null;
    renderProjects(); window.scrollTo(0, 0);
  }
  _projCancelFn = leave;
  var v = function(k){ return esc((it && it[k] != null) ? String(it[k]) : ""); };
  var html = "<div style='font-size:13px;color:#6E5E48;margin-bottom:10px'>" + meta.ico + " " + (it ? "Edit " : "New ") + meta.label.toLowerCase() + " &middot; <b>" + esc(p.name || "") + "</b></div>" +
    "<div style='" + PROJ_LBL + "'>" + f.title + "</div>" +
    "<input id='projItTitle' type='text' style='" + PROJ_INP + "' value='" + v("title") + "'>";
  if (f.who)    html += "<div style='" + PROJ_LBL + ";margin-top:14px'>" + f.who + " " + PROJ_OPT + "</div><input id='projItWho' type='text' style='" + PROJ_INP + "' value='" + v("who") + "'>";
  if (f.amount) html += "<div style='" + PROJ_LBL + ";margin-top:14px'>" + f.amount + " (&euro;) " + PROJ_OPT + "</div><input id='projItAmount' type='text' inputmode='decimal' placeholder='e.g. 1250' style='" + PROJ_INP + "' value='" + esc(projItemAmount(it) === null ? "" : String(projItemAmount(it))) + "'>";
  if (f.date)   html += projDateFieldHTML("projItDate", f.date, it && it.date);
  if (f.phone)  html += "<div style='" + PROJ_LBL + ";margin-top:14px'>Phone " + PROJ_OPT + "</div><input id='projItPhone' type='tel' inputmode='tel' placeholder='e.g. 087 123 4567' style='" + PROJ_INP + "' value='" + v("phone") + "'>";
  if (f.url)    html += "<div style='" + PROJ_LBL + ";margin-top:14px'>" + f.url + (type === "link" ? "" : " " + PROJ_OPT) + "</div><input id='projItUrl' type='url' inputmode='url' placeholder='https://&hellip;' style='" + PROJ_INP + "' value='" + v("url") + "'>";
  // v512: the group — free text, offered the project's existing groups.
  // v513: as tappable chips under the field, not a native <datalist> — on
  // Android the datalist popup turns near-transparent once you start typing.
  var groupOpts = projItemGroups(p.items.filter(projItemShown)).filter(function(g){ return g.label; })
    .map(function(g){ return "<button type='button' class='proj-grp-chip' data-g='" + esc(g.label) + "' style='padding:7px 11px;border:1.5px solid #D9C8B0;background:#fff;color:#2A2010;border-radius:16px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation'>" + esc(g.label) + "</button>"; }).join("");
  html += "<div style='" + PROJ_LBL + ";margin-top:14px'>Group " + PROJ_OPT + "</div>" +
    "<input id='projItGroup' type='text' autocomplete='off' placeholder='e.g. Part A &mdash; passport' style='" + PROJ_INP + "' value='" + v("group") + "'>" +
    (groupOpts ? "<div id='projItGroupChips' style='display:flex;flex-wrap:wrap;gap:6px;margin-top:8px'>" + groupOpts + "</div>" : "");
  html += "<div style='" + PROJ_LBL + ";margin-top:14px'>Notes " + PROJ_OPT + "</div>" +
    "<textarea id='projItNotes' rows='3' style='" + PROJ_INP + ";resize:vertical'>" + v("notes") + "</textarea>";
  if (type === "task" && it && !it.done) {
    html += "<button type='button' id='projItToTodo' style='width:100%;margin-top:14px;padding:12px;border:1.5px solid #D8CCEE;background:#fff;color:#5A3AA0;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>&#x2705; Copy to To-do list</button>" +
      "<div style='font-size:11px;color:#7F6F58;margin-top:5px;line-height:1.5'>" +
        (it.sentAt ? "Already copied on " + listDate(it.sentAt) + ". " : "") +
        "A copy, not a link: ticking it on To-do won&rsquo;t tick it here.</div>";
  }
  html += projEditorButtons();
  if (it) html += "<button type='button' id='projItDelete' style='width:100%;margin-top:10px;padding:12px;border:1.5px solid #F0D0D0;background:#fff;color:#B03030;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation'>Delete this " + meta.label.toLowerCase() + "</button>";
  el.innerHTML = html;
  projWireDateClears(el);
  // Chips filter as you type (contains, any case); the exact current value hides.
  var grpIn = document.getElementById("projItGroup");
  var chips = el.querySelectorAll(".proj-grp-chip");
  function filterGroupChips() {
    var q = grpIn.value.trim().toLowerCase();
    chips.forEach(function(c){
      var g = c.dataset.g.toLowerCase();
      c.style.display = (g !== q && (!q || g.indexOf(q) !== -1)) ? "" : "none";
    });
  }
  if (grpIn && chips.length) {
    grpIn.addEventListener("input", filterGroupChips);
    chips.forEach(function(c){
      c.addEventListener("click", function(){ grpIn.value = c.dataset.g; filterGroupChips(); });
    });
    filterGroupChips();
  }

  function val(id) { var e = document.getElementById(id); return e ? e.value : ""; }
  document.getElementById("projEdCancel").addEventListener("click", leave);
  var toTodo = document.getElementById("projItToTodo");
  if (toTodo) toTodo.addEventListener("click", function(){
    // Copies what is SAVED, so an unsaved rename can't reach To-do and then
    // be thrown away by Cancel.
    if (projSendTaskToTodo(p.id, it.id)) leave();
  });
  var del = document.getElementById("projItDelete");
  if (del) del.addEventListener("click", function(){
    confirmDialog("Delete &ldquo;" + esc(it.title || "this item") + "&rdquo;?", function(){ projItemDelete(p.id, it.id); leave(); });
  });
  document.getElementById("projEdSave").addEventListener("click", function(){
    var title = val("projItTitle").trim();
    if (!title) { toast("Give it a title first"); return; }
    var amount = "";
    if (f.amount) {
      var parsed = applianceParseValue(val("projItAmount"));
      if (parsed === false) { toast("The amount needs to be a number, like 1250"); return; }
      amount = parsed === null ? "" : parsed;
    }
    var url = "";
    if (f.url) {
      var rawUrl = val("projItUrl").trim();
      if (rawUrl) {
        url = applianceLinkUrl(rawUrl);
        if (!url) { toast("That needs a http(s) web address"); return; }
      } else if (type === "link") { toast("Add the web address first"); return; }
    }
    // Every field stored whatever the type ("" / false, never a dropped key —
    // the v296 rule). A field this type doesn't show keeps its old value, so
    // nothing typed is ever destroyed by a field being hidden.
    var vals = { type: type, title: title, notes: val("projItNotes"), group: val("projItGroup").trim() };
    if (f.who)    vals.who = val("projItWho").trim();
    if (f.amount) vals.amount = amount;
    if (f.date)   vals.date = val("projItDate").trim();
    if (f.phone)  vals.phone = val("projItPhone").trim();
    if (f.url)    vals.url = url;
    var all = getProjects(), now = Date.now();
    var pp = projFind(all, p.id);
    if (!pp) { toast("That project is no longer here"); _projView = "list"; renderProjects(); return; }
    if (_projItemId != null) {
      var cur = projFind(pp.items, _projItemId);
      if (!cur) { toast("That item is no longer here"); leave(); return; }
      // v515: a task moved to another group joins the end of that group's order.
      if (type === "task" && projGroupKey(cur) !== projGroupKey(vals)) vals.order = projOrderForJoin(pp, projGroupKey(vals), cur.id);
      Object.keys(vals).forEach(function(k){ cur[k] = vals[k]; });
      cur.updated = now;                               // the ITEM only
    } else {
      var fresh = { id: projNewId(), type: type, title: "", date: "", amount: "", who: "", phone: "", url: "",
                    notes: "", group: "", order: "", done: false, sentAt: 0, addedBy: hearthUser, added: now, updated: now };
      if (type === "task") vals.order = projOrderForJoin(pp, projGroupKey(vals));   // v515
      Object.keys(vals).forEach(function(k){ fresh[k] = vals[k]; });
      pp.items.push(fresh);
    }
    saveProjects(all);
    leave();
    toast("Saved");
  });
  var t = document.getElementById("projItTitle");
  if (t && !it) t.focus();
}

// ============================================================
// PROJECT IMPORT (v512) — a plan (a document, notes, a chat answer) turned
// into a project by an AI chat, the golf-course pattern: copy a prompt,
// paste the JSON back, preview, create. Confirmed 06/11/2026: every import
// makes a NEW project (never updates one), items are tasks and links only,
// and costs, quotes and contacts go in the notes. Each item keeps the plan's
// section as its `group`, and its order through ascending `added` stamps.
var PROJ_FILE_TAG = "project-v1";
var PROJ_IMPORT_MAX_ITEMS = 400;
function projImportPrompt() {
  return "I want to turn the plan below into a project in my Hearth app.\n\n" +
    "Reply with ONLY this JSON — no code fences, no commentary before or after:\n\n" +
    "{\n" +
    '  "hearth": "' + PROJ_FILE_TAG + '",\n' +
    '  "name": "",\n' +
    '  "status": "planning",\n' +
    '  "target": "",\n' +
    '  "notes": "",\n' +
    '  "items": [\n' +
    '    { "type": "task", "group": "", "title": "", "date": "", "notes": "", "done": false },\n' +
    '    { "type": "link", "group": "", "title": "", "url": "", "notes": "" }\n' +
    "  ]\n" +
    "}\n\n" +
    "Field notes:\n" +
    "- name: a short project name.\n" +
    "- status: \"idea\", \"planning\", \"active\" or \"done\".\n" +
    "- target: the date the whole project should be finished by, as YYYY-MM-DD, or \"\" if the plan doesn't give one.\n" +
    "- notes: the background someone needs to follow the plan: the overall approach, key facts and rules, and tips. " +
    "Also put here any costs or budgets (keep the original currency), contact details (names, phone numbers, emails, addresses) and quotes. " +
    "Plain text with line breaks. Summarise; don't copy the whole plan.\n" +
    "- items: one entry per thing to do and per web address, in the order the plan does them.\n" +
    "- type \"task\": something someone has to do, get, bring or check, including each document on a checklist. " +
    "title: short, starting with a verb where natural. date: a due date as YYYY-MM-DD only if the plan gives a real date, otherwise \"\". " +
    "notes: the detail for that step (how, where, what to watch for), or \"\". done: true only if the plan says it is already done.\n" +
    "- type \"link\": a web address worth keeping. title: what it is. url: the full address starting with https://.\n" +
    "- group: the section of the plan the item belongs to, e.g. \"Part A — Passport renewal\". Spell it exactly the same for every item in that section. " +
    "Use \"\" for an item that belongs to no section. Aim for about 3 to 8 groups.\n" +
    "- Don't make items for costs, quotes or contacts — they go in notes. Don't invent dates, prices or addresses that aren't in the plan.\n\n" +
    "The plan:\n[paste the plan here, or attach it]";
}
function projIsoDate(v) {
  var t = String(v == null ? "" : v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "";
  var d = new Date(t + "T00:00:00Z");
  return (!isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t) ? t : "";
}
function projImportStr(v) { return (typeof v === "string" || typeof v === "number") ? String(v) : ""; }
// Returns {project:{name,status,target,notes,items}, skipped:[{title,why}],
// badDates:n} or {error}. A file-level problem refuses the paste; an item
// that can't be used is skipped and NAMED in the preview, never dropped
// silently, and a bad date is cleared and counted.
function parseProjectFile(raw) {
  var obj;
  try { obj = JSON.parse(raw); } catch (e) { return { error: "Couldn't read that as JSON — check it and try again." }; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || obj.hearth !== PROJ_FILE_TAG) {
    return { error: "Not a Hearth project file. Make sure the JSON includes \"hearth\": \"" + PROJ_FILE_TAG + "\"." };
  }
  var name = projImportStr(obj.name).trim();
  if (!name) return { error: "The file has no project name." };
  if (obj.items != null && !Array.isArray(obj.items)) return { error: "\"items\" needs to be a list." };
  var list = obj.items || [];
  if (list.length > PROJ_IMPORT_MAX_ITEMS) return { error: "That's " + list.length + " items — the most one import takes is " + PROJ_IMPORT_MAX_ITEMS + "." };
  var badDates = 0, skipped = [], items = [];
  var rawTarget = projImportStr(obj.target).trim(), target = projIsoDate(rawTarget);
  if (rawTarget && !target) badDates++;
  list.forEach(function(x, n){
    if (!x || typeof x !== "object" || Array.isArray(x)) { skipped.push({ title: "Item " + (n + 1), why: "not an item" }); return; }
    var title = projImportStr(x.title).trim();
    var type = projImportStr(x.type).trim().toLowerCase() || "task";
    var label = title || ("Item " + (n + 1));
    if (PROJ_RETIRED_ITEM_TYPES[type] === true) { skipped.push({ title: label, why: "a " + type + " &mdash; put it in the notes instead" }); return; }
    if (type !== "task" && type !== "link") { skipped.push({ title: label, why: "unknown type &ldquo;" + esc(type) + "&rdquo;" }); return; }
    if (!title) { skipped.push({ title: label, why: "no title" }); return; }
    var notes = projImportStr(x.notes);
    var url = "";
    var rawUrl = projImportStr(x.url).trim();
    if (type === "link") {
      url = applianceLinkUrl(rawUrl);
      if (!url) { skipped.push({ title: label, why: "no valid https web address" }); return; }
    } else if (rawUrl && applianceLinkUrl(rawUrl) && notes.indexOf(rawUrl) === -1) {
      notes = notes ? notes + "\n" + rawUrl : rawUrl;      // a task has no link field; keep the address, don't drop it
    }
    var date = "";
    if (type === "task") {
      var rawDate = projImportStr(x.date).trim();
      date = projIsoDate(rawDate);
      if (rawDate && !date) badDates++;
    }
    items.push({ type: type, group: projImportStr(x.group).trim(), title: title, date: date, url: url,
                 notes: notes, done: type === "task" && x.done === true });
  });
  var st = projImportStr(obj.status).trim().toLowerCase();
  return {
    project: { name: name, status: projStatusMeta(st).key === st ? st : "planning", target: target,
               notes: projImportStr(obj.notes), items: items },
    skipped: skipped, badDates: badDates
  };
}
// Always a NEW project. Every id (project and items) is stepped past every
// id already in the store — item tombstones are keyed by id across all
// projects, so a reused item id could be deleted by another project's tomb.
function projApplyImport(pr) {
  var all = getProjects(), now = Date.now(), used = {};
  all.forEach(function(p){ used[p.id] = true; p.items.forEach(function(it){ used[it.id] = true; }); });
  var nextId = projNewId();
  function freshId() { while (used[nextId]) nextId++; var id = nextId; used[id] = true; nextId += 1000; return id; }
  var proj = { id: freshId(), name: pr.name, status: pr.status, target: pr.target, notes: pr.notes,
               items: [], addedBy: hearthUser, added: now, updated: now };
  pr.items.forEach(function(x, i){
    // `added` steps by 1ms in file order: undated tasks and grouped links sort
    // by it, and groups are ordered by their first item, so the plan's order holds.
    proj.items.push({ id: freshId(), type: x.type, title: x.title, date: x.date, amount: "", who: "", phone: "",
                      url: x.url, notes: x.notes, group: x.group, done: x.done, sentAt: 0,
                      order: x.type === "task" ? i + 1 : "",   // v515: the plan's own order, from the start
                      addedBy: hearthUser, added: now + i, updated: now });
  });
  all.unshift(proj);
  saveProjects(all);
  return proj;
}
function openProjectImport() {
  _projImportParsed = null;
  _projEditId = null; _projItemId = null;
  _projView = "import";
  if (currentSection !== "projects") switchSection("projects"); else renderProjects();
  window.scrollTo(0, 0);
}
function renderProjectImport() {
  var el = document.getElementById("projectsContent");
  if (!el) return;
  _projEditing = true;                        // a sync mid-paste must not redraw the textarea away
  function leave() {
    _projEditing = false; _projCancelFn = null; _projImportParsed = null;
    _projView = "list";
    renderProjects(); window.scrollTo(0, 0);
  }
  _projCancelFn = leave;
  var back = "<button id='projImpBack' style='border:none;background:none;color:" + PROJ_COLOR + ";font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;padding:6px 2px 10px;touch-action:manipulation'>&lsaquo; " + (_projImportParsed ? "Back" : "Cancel") + "</button>" +
    "<div style='font-size:20px;font-weight:700;margin-bottom:10px;color:#2A2010'>Import a plan</div>";

  if (!_projImportParsed) {
    el.innerHTML = back +
      "<div style='font-size:13px;color:#5A4630;background:#FBF4EA;border:1px solid #EDE3D5;border-radius:10px;padding:12px 14px;margin-bottom:12px;line-height:1.65'>" +
        "<b>How to use this with an AI chat:</b>" +
        "<div style='margin-top:6px'>1. Copy the prompt below.</div>" +
        "<div>2. Paste it into a chat and add your plan at the end &mdash; paste the text or attach the document.</div>" +
        "<div>3. Paste the JSON it replies with into the box below.</div>" +
        "<div style='margin-top:6px;font-size:12px;color:#6E5E48'>It always makes a new project; nothing you already have is changed.</div>" +
      "</div>" +
      "<button id='projCopyPrompt' style='width:100%;padding:12px;border:1.5px solid " + PROJ_COLOR + ";background:#fff;color:" + PROJ_COLOR + ";border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:6px;touch-action:manipulation'>&#x1F4CB; Copy the prompt</button>" +
      "<details style='margin-bottom:14px'><summary style='font-size:12px;color:#6E5E48;cursor:pointer;padding:4px 2px'>See the prompt</summary>" +
        "<textarea id='projPromptText' readonly rows='10' style='" + PROJ_INP + ";margin-top:8px;resize:vertical;line-height:1.5;font-size:11px;font-family:monospace'>" + esc(projImportPrompt()) + "</textarea>" +
      "</details>" +
      "<textarea id='projImportJson' rows='8' placeholder='Paste the JSON here&hellip;' style='" + PROJ_INP + ";margin-bottom:14px;resize:vertical;line-height:1.5;font-size:12px;font-family:monospace'></textarea>" +
      "<button id='projImportNext' style='width:100%;padding:13px;border:none;background:" + PROJ_COLOR + ";color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation'>Next &rsaquo;</button>";
    document.getElementById("projImpBack").addEventListener("click", leave);
    document.getElementById("projCopyPrompt").addEventListener("click", function(){ copyToClipboard(projImportPrompt(), "&#x1F4CB; Prompt copied"); });
    document.getElementById("projImportNext").addEventListener("click", function(){
      var raw = stripPasteFence(document.getElementById("projImportJson").value);
      if (!raw) { toast("Paste the JSON first"); return; }
      var parsed = parseProjectFile(raw);
      if (parsed.error) { toast(esc(parsed.error)); return; }
      _projImportParsed = parsed;
      renderProjectImport();
      window.scrollTo(0, 0);
    });
    return;
  }

  // Step 2 — the preview. Nothing is written until Create.
  var pr = _projImportParsed.project;
  var tasks = pr.items.filter(function(x){ return x.type === "task"; }).length;
  var links = pr.items.length - tasks;
  var groups = projItemGroups(pr.items.map(function(x, i){ return { group: x.group, type: x.type, added: i }; }));
  var counts = [];
  if (tasks) counts.push(tasks + (tasks === 1 ? " task" : " tasks"));
  if (links) counts.push(links + (links === 1 ? " link" : " links"));
  var named = groups.filter(function(g){ return g.label; });
  if (named.length) counts.push(named.length + (named.length === 1 ? " group" : " groups"));
  var html = back +
    "<div style='background:#fff;border:1.5px solid #EDE3D5;border-radius:14px;padding:14px;margin-bottom:10px'>" +
      "<div style='display:flex;align-items:flex-start;gap:8px'>" +
        "<div style='flex:1;min-width:0;font-size:17px;font-weight:700;color:#2A2010;line-height:1.3'>" + esc(pr.name) + "</div>" +
        projStatusPill(pr.status) +
      "</div>" +
      "<div style='font-size:13px;color:#6E5E48;margin-top:6px;line-height:1.6'>" +
        (counts.length ? counts.join(" &middot; ") : "No items &mdash; just the project and its notes") +
        (pr.target ? "<br>Target " + projDateText(pr.target) : "") + "</div>" +
      (pr.notes ? "<details style='margin-top:8px'><summary style='font-size:12px;color:#6E5E48;cursor:pointer'>Notes (" + pr.notes.length + " characters)</summary>" +
        "<div style='font-size:13px;color:#2A2010;line-height:1.55;white-space:pre-wrap;margin-top:6px'>" + esc(pr.notes) + "</div></details>" : "") +
    "</div>";
  groups.forEach(function(g){
    var gt = g.items.filter(function(x){ return x.type === "task"; }).length;
    var gl = g.items.length - gt;
    html += "<div style='display:flex;gap:8px;font-size:13px;color:#2A2010;padding:6px 4px;border-bottom:1px solid #F1E9DD'>" +
      "<div style='flex:1;min-width:0'>" + (g.label ? "&#x1F4C2; " + esc(g.label) : "<i style='color:#6E5E48'>No group</i>") + "</div>" +
      "<div style='flex-shrink:0;color:#6E5E48'>" + [gt ? gt + " task" + (gt === 1 ? "" : "s") : "", gl ? gl + " link" + (gl === 1 ? "" : "s") : ""].filter(Boolean).join(", ") + "</div></div>";
  });
  var warn = [];
  if (_projImportParsed.badDates) warn.push(_projImportParsed.badDates + (_projImportParsed.badDates === 1 ? " date wasn&rsquo;t" : " dates weren&rsquo;t") + " a real YYYY-MM-DD date and " + (_projImportParsed.badDates === 1 ? "was" : "were") + " left blank.");
  if (warn.length) html += "<div style='font-size:12px;color:#8A4A10;margin-top:10px;line-height:1.5'>" + warn.join("<br>") + "</div>";
  if (_projImportParsed.skipped.length) {
    html += "<div style='font-size:12px;color:#B03030;margin-top:10px;line-height:1.6'><b>Not imported (" + _projImportParsed.skipped.length + "):</b>" +
      _projImportParsed.skipped.map(function(k){ return "<div>&bull; " + esc(k.title) + " &mdash; " + k.why + "</div>"; }).join("") + "</div>";
  }
  html += "<button id='projImportGo' style='width:100%;margin-top:16px;padding:13px;border:none;background:" + PROJ_COLOR + ";color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation'>Create project</button>";
  el.innerHTML = html;
  document.getElementById("projImpBack").addEventListener("click", function(){ _projImportParsed = null; renderProjectImport(); window.scrollTo(0, 0); });
  document.getElementById("projImportGo").addEventListener("click", function(){
    var made = projApplyImport(pr);
    _projEditing = false; _projCancelFn = null; _projImportParsed = null;
    _projOpenId = made.id; _projView = "detail";
    renderProjects(); window.scrollTo(0, 0);
    toast("&#x1F528; Project created");
  });
}

