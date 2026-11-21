// ============================================================
// ALWAYS-ON WALL SCREEN (v528)
// ============================================================
// An optional, stripped-down screen for the kitchen phone that sits on all
// day: a big clock, the calendar card, and the Grocery + To-do lists.
// Confirmed with Cathal 21/11/2026:
//  - switched on per phone (Settings), saved on THIS phone only
//    (hearthWallMode, never synced, not in backups) — no other phone changes;
//  - the lists are TICK-OFF ONLY: adding/editing stays in the full app.
//    A ticked item stays on the wall struck through for WALL_RECENT_MS, so a
//    mis-tap at the fridge can be undone with a second tap;
//  - "Full app" leaves it; it comes back by itself after WALL_IDLE_MS with
//    no touch, but only when nothing could be lost (wallIdleBlocker).
// It is an overlay on top of Home, not a new section: Home keeps running
// underneath, so the Home clock tick keeps the calendar fetched (hcalPaint
// paints #wallCalendar too) and the v524 auto-update still sees "on Home".
// Ticks go through toggleItem itself (wallToggle) so repeat tasks, Track
// auto-log, history and sync all behave exactly as a tick in Lists — do NOT
// re-implement the tick here.
var WALL_KEY = "hearthWallMode";
var WALL_LISTS = ["grocery", "todo"];
var WALL_IDLE_MS = 3 * 60 * 1000;
var WALL_RECENT_MS = 10 * 60 * 1000;
var _wallShowing = false;
var _wallBootShown = false;
var _wallTimer = null;
// Repeating To-dos ticked on the wall, id -> tick time (Codex on #305).
// toggleItem reschedules a repeat in place (done back to false, due date
// moved on), so the wall would show it unchanged and a second tap would skip
// ANOTHER occurrence. Instead it shows as done with its next due date and
// is locked for WALL_RECENT_MS. There is no wall undo for a repeat: undoing
// would mean re-implementing the reschedule backwards here (see the header).
var _wallRepeatTicked = {};
function wallRepeatLocked(it, now) {
  var t = it && _wallRepeatTicked[String(it.id)];
  return !!(t && it.repeat && !it.done && now - t < WALL_RECENT_MS);
}

function wallEnabled() {
  try { return localStorage.getItem(WALL_KEY) === "1"; } catch (e) { return false; }
}
function wallIsShowing() { return _wallShowing; }

// Why it must NOT come back on its own right now ("" = safe). The same
// checks the v524 auto-reload uses (overlay, focused field, typed text,
// quick-add, session) plus every section's own "editor open" flag, because
// returning to Home from an open editor would hide it.
function wallIdleBlocker(now) {
  if (now - _lastUserInput < WALL_IDLE_MS) return "recent input";
  var lo = document.getElementById("loginOverlay");
  if (lo && getComputedStyle(lo).display !== "none") return "signed out";
  var flags = ["_recipeEditing", "_tripEditing", "_plantEditing", "_plantImporting", "_watchEditing",
               "_applEditing", "_healthEditing", "_projEditing", "_golfEditing"];
  for (var i = 0; i < flags.length; i++) {
    if (typeof window[flags[i]] !== "undefined" && window[flags[i]]) return "editor open";
  }
  try { if (medDraftOpen() || tempDraftOpen()) return "editor open"; } catch (e) {}
  return uiBusyReason();
}

function wallShow() {
  if (!wallEnabled()) return;
  if (currentSection !== "home") switchSection("home");
  var el = document.getElementById("wallScreen");
  if (!el) return;
  _wallShowing = true;
  _wallBootShown = true;
  el.style.display = "block";
  el.setAttribute("aria-hidden", "false");
  document.body.classList.add("wall-on");
  wallRender();
  try { renderHomeCalendar(); } catch (e) {}
}
function wallHide() {
  var el = document.getElementById("wallScreen");
  _wallShowing = false;
  if (el) { el.style.display = "none"; el.setAttribute("aria-hidden", "true"); }
  document.body.classList.remove("wall-on");
  _lastUserInput = Date.now(); // the idle wait starts from leaving it
}
function wallSetEnabled(on) {
  try { if (on) localStorage.setItem(WALL_KEY, "1"); else localStorage.removeItem(WALL_KEY); } catch (e) {}
  if (on) {
    document.getElementById("settingsOverlay").classList.remove("open");
    wallShow();
  } else {
    wallHide();
  }
}

function wallRenderClock() {
  var t = document.getElementById("wallTime"), d = document.getElementById("wallDate");
  if (!t || !d) return;
  var now = new Date();
  t.textContent = ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2);
  d.textContent = now.toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" });
}

// Items still to do, plus ones ticked in the last few minutes (shown struck
// through, so a second tap undoes a mis-tap). Grocery is grouped in the same
// category order as the list itself.
function wallListItems(lt, now) {
  var items = (loadListData(lt).items || []).filter(function(it){
    return it && it.name && (!it.done || (it.updated && now - it.updated < WALL_RECENT_MS));
  });
  function shownDone(it) { return !!it.done || wallRepeatLocked(it, now); }
  var order = {};
  getAllCats(lt).forEach(function(c, i){ order[c.id] = i; });
  return items.map(function(it, i){ return { it: it, i: i }; }).sort(function(a, b){
    if (shownDone(a.it) !== shownDone(b.it)) return shownDone(a.it) ? 1 : -1;
    var ca = (a.it.catId in order) ? order[a.it.catId] : 999, cb = (b.it.catId in order) ? order[b.it.catId] : 999;
    return ca !== cb ? ca - cb : a.i - b.i;
  }).map(function(x){ return x.it; });
}

function wallRenderLists() {
  var box = document.getElementById("wallLists");
  if (!box) return;
  var now = Date.now(), html = "";
  WALL_LISTS.forEach(function(lt){
    var items = wallListItems(lt, now);
    var left = items.filter(function(it){ return !it.done && !wallRepeatLocked(it, now); }).length;
    var cats = {};
    getAllCats(lt).forEach(function(c){ cats[c.id] = c; });
    html += "<div class='wall-card'><div class='wall-card-head'><span>" + LIST_TYPES[lt].name + "</span>" +
      "<span class='wall-count'>" + (left ? left + " to do" : "") + "</span></div>";
    if (!items.length) html += "<div class='wall-none'>Nothing on the list</div>";
    items.forEach(function(it){
      var c = cats[it.catId], locked = wallRepeatLocked(it, now), done = it.done || locked;
      var next = "";
      if (locked && /^\d{4}-\d{2}-\d{2}$/.test(String(it.dueDate || ""))) {
        next = "<span class='wall-next'>Done &#x2713; next due " +
          esc(new Date(it.dueDate + "T12:00:00").toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" })) + "</span>";
      }
      html += "<button class='wall-item" + (done ? " wall-done" : "") + "' data-lt='" + lt + "' data-id='" + esc(String(it.id)) + "'" + (locked ? " disabled" : "") + ">" +
        "<span class='wall-box'>" + (done ? "&#x2713;" : "") + "</span>" +
        (c ? "<span class='wall-emo'>" + catEmojiSafe(c.emoji) + "</span>" : "") +
        "<span class='wall-name'>" + esc(it.name) + next + "</span></button>";
    });
    html += "</div>";
  });
  box.innerHTML = html;
}

function wallRender() {
  wallRenderClock();
  wallRenderLists();
}

// Tick through the real list code with the wall's list swapped in for the
// moment, then put the user's own list back.
function wallToggle(lt, idStr) {
  if (WALL_LISTS.indexOf(lt) === -1) return;
  var items = loadListData(lt).items || [], target = null;
  for (var i = 0; i < items.length; i++) { if (items[i] && String(items[i].id) === idStr) { target = items[i]; break; } }
  if (!target || wallRepeatLocked(target, Date.now())) return;
  var ticking = !target.done, prev = currentList;
  currentList = lt;
  try { toggleItem(target.id); } finally { currentList = prev; }
  // A tick that toggleItem turned straight into a reschedule.
  if (ticking && target.repeat && !target.done) _wallRepeatTicked[String(target.id)] = Date.now();
  // toggleItem redrew the hidden Lists view for `lt`; redraw the user's own
  // list so it is right if they open Lists without switching section.
  try { if (prev !== "notes") renderList(); } catch (e) {}
  wallRenderLists();
}

function wallTick() {
  if (!wallEnabled()) { if (_wallShowing) wallHide(); return; }
  if (_wallShowing) { wallRender(); return; }
  // First show after the app opens: as soon as it is signed in and on Home.
  if (!_wallBootShown) {
    var lo = document.getElementById("loginOverlay");
    if (typeof currentSection !== "undefined" && currentSection === "home" && !(lo && getComputedStyle(lo).display !== "none")) {
      _wallBootShown = true;
      wallShow();
    }
    return;
  }
  if (!wallIdleBlocker(Date.now())) wallShow();
}

(function wallInit() {
  var chk = document.getElementById("wallModeChk");
  if (chk) chk.addEventListener("change", function(){ wallSetEnabled(chk.checked); });
  document.getElementById("settingsBtn").addEventListener("click", function(){
    if (chk) chk.checked = wallEnabled();
  });
  var exit = document.getElementById("wallExit");
  if (exit) exit.addEventListener("click", wallHide);
  var lists = document.getElementById("wallLists");
  if (lists) lists.addEventListener("click", function(e){
    var b = e.target.closest(".wall-item");
    if (b) wallToggle(b.dataset.lt, b.dataset.id);
  });
  _wallTimer = setInterval(wallTick, 15000);
  setTimeout(wallTick, 500);
})();
