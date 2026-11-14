// ============================================================
// LIST TYPE SWITCHER
// ============================================================
function applyListTheme() {
  var lt = LIST_TYPES[currentList];
  document.documentElement.style.setProperty("--accent", lt.color);
  document.getElementById("appTitle").innerHTML = "&#x1F525; Hearth";
  elInput.placeholder = lt.placeholder;
  document.getElementById("themeColor").setAttribute("content", lt.color);
  var btns = document.querySelectorAll(".type-btn");
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle("active", btns[i].dataset.lt === currentList);
  }
  // Notes is a sub-tab of Lists (v318): it has no list machinery of its own,
  // so swap in the full notes section (Personal/Work/Log/Food) instead of the
  // list UI when it's selected.
  var isNotes = currentList === "notes";
  document.getElementById("notesSection").style.display = isNotes ? "block" : "none";
  document.getElementById("listContentWrap").style.display = isNotes ? "none" : "block";
  document.getElementById("mainContent").style.display  = isNotes ? "none"  : "block";
  if (isNotes) { elHdrBadge.style.display = "none"; renderNotesSection(); }
}
document.getElementById("typeBar").addEventListener("click", function(e) {
  var btn = e.target.closest(".type-btn");
  if (!btn || btn.dataset.lt === currentList) return;
  if (currentList !== "notes") saveCurrentList();
  currentList = btn.dataset.lt;
  manualCatId = null; currentCatId = null;
  resetInput();
  // Reset any active search BEFORE rendering the newly selected list
  _listSearchQuery = "";
  _travelFilter = [];
  _todayFilter = false;
  _recentFilter = false;
  var _sr0 = document.getElementById("searchRow");
  if (_sr0) _sr0.style.display = "none";
  var _si0 = document.getElementById("listSearchInput");
  if (_si0) _si0.value = "";
  if (currentList !== "notes") { loadListData(currentList); switchTab("list"); renderList(); }
  window.scrollTo(0, 0);
  applyListTheme();
  updateDueDateRowVisibility();
  clearUnseen(currentList);
});

// ============================================================
// TABS
// ============================================================
document.getElementById("tabList").addEventListener("click",    function(){ switchTab("list"); });
document.getElementById("tabHistory").addEventListener("click", function(){ switchTab("history"); });
function updateDueDateRowVisibility() {
  var row = document.getElementById("dueDateRow");
  if (!row) return;
  row.style.display = (currentList === "todo" || currentList === "personal") ? "block" : "none";
}

function switchTab(t) {
  document.getElementById("listPanel").style.display    = t==="list"    ? "block" : "none";
  document.getElementById("historyPanel").style.display = t==="history" ? "block" : "none";
  document.getElementById("tabList").className    = "tab" + (t==="list"    ? " active" : "");
  document.getElementById("tabHistory").className = "tab" + (t==="history" ? " active" : "");
  if (t==="history") { _histSelectMode=false; _histSelected={}; renderHistory(); }
}

// ============================================================
// INPUT
// ============================================================
elInput.addEventListener("input", function() {
  var val = elInput.value.trim();
  if (!val) { hideCatRow(); hideAC(); currentCatId = null; manualCatId = null; return; }
  currentCatId = manualCatId || detectCat(val);
  showCatRow(currentCatId, !manualCatId);
  showAC(val);
});
elInput.addEventListener("keydown", function(e){ if (e.key==="Enter") doAdd(); });
document.addEventListener("click", function(e){
  if (!document.querySelector(".input-card").contains(e.target)) hideAC();
});
elCatChip.addEventListener("click", function(){ openPicker(null); });

function showCatRow(catId, isAuto) {
  var c = getCat(catId);
  elCatChip.innerHTML = catEmojiSafe(c.emoji) + " " + esc(c.name);
  elCatChip.style.background = catColorSafe(c.bg,"#EDEAE4");
  elCatChip.style.color = catColorSafe(c.fg,"#4A4A3A");
  elCatHint.style.display = isAuto ? "inline" : "none";
  elCatRow.style.display = "flex";
}
function hideCatRow() { elCatRow.style.display = "none"; }
function hideAC() { elAc.style.display = "none"; elAc.innerHTML = ""; }

function showAC(query) {
  var q = query.toLowerCase();
  var hist = getHist();
  var matches = [];
  var matchedNames = {};
  for (var i = 0; i < hist.length && matches.length < 7; i++) {
    if (!hist[i] || !hist[i].name) continue;
    var hn = hist[i].name.toLowerCase();
    if (hn.indexOf(q) !== -1 && hn !== q) { matches.push(hist[i]); matchedNames[hn] = true; }
  }
  // v348: guarantee anything actually in the list autocompletes even if its hist
  // entry died (150-cap prune / v323 deletion / backup import — see HEARTH-notes,
  // "blueberries" incident). Deliberately ignores hist tombstones: a name still
  // visibly on the list should suggest again per Cathal's stated expectation.
  if (matches.length < 7) {
    var items = getItems();
    for (var k = 0; k < items.length && matches.length < 7; k++) {
      var it = items[k];
      if (!it || !it.name) continue;
      var itn = it.name.toLowerCase();
      if (itn === q || matchedNames[itn]) continue;
      if (itn.indexOf(q) !== -1) { matches.push({ name: it.name, catId: it.catId, _fromItem: true, done: !!it.done }); matchedNames[itn] = true; }
    }
  }
  if (!matches.length) { hideAC(); return; }
  var html = "";
  for (var j = 0; j < matches.length; j++) {
    var h = matches[j], c = getCat(h.catId||"other");
    var idx = h.name.toLowerCase().indexOf(q);
    var hl = idx >= 0
      ? esc(h.name.slice(0,idx))+"<b>"+esc(h.name.slice(idx,idx+query.length))+"</b>"+esc(h.name.slice(idx+query.length))
      : esc(h.name);
    var trailer = h._fromItem
      ? "<span class='ac-tag'>"+(h.done ? "done" : "on list")+"</span>"
      : "<span class='ac-times'>"+(h.count||1)+"x</span>";
    html += "<div class='ac-item' data-name='"+esc(h.name)+"' data-cat='"+esc(c.id)+"'>" +
      "<span class='ac-name'>"+hl+"</span>" +
      "<span class='ac-badge' style='background:"+catColorSafe(c.bg,"#EDEAE4")+";color:"+catColorSafe(c.fg,"#4A4A3A")+"'>"+catEmojiSafe(c.emoji)+" "+esc(c.name)+"</span>" +
      trailer + "</div>";
  }
  elAc.innerHTML = html; elAc.style.display = "block";
  elAc.querySelectorAll(".ac-item").forEach(function(row) {
    row.addEventListener("click", function(){
      elInput.value = row.dataset.name;
      manualCatId = row.dataset.cat; currentCatId = manualCatId;
      showCatRow(currentCatId, false); hideAC(); elInput.focus();
    });
  });
}

// ============================================================
// ADD ITEM
// ============================================================
document.getElementById("addBtn").addEventListener("click", doAdd);
// Show the voice mic only where the browser supports speech recognition (v304)
(function(){
  var vb = document.getElementById("voiceMicBtn");
  if (vb && voiceSupported()) { vb.style.display = ""; vb.addEventListener("click", startVoiceAdd); }
})();
// Core add for the current list; returns "added" | "exists" | "restored".
// Shared by manual add (doAdd) and voice capture (v304). `restoreCat`, when
// set, re-categorises a matched done item as it's moved back to the list.
// Does NOT save/render/toast — callers do that once (so voice can batch).
function addItemToCurrent(name, catId, dueD, restoreCat) {
  var items = getItems();
  for (var i = 0; i < items.length; i++) {
    if (items[i].name.toLowerCase()===name.toLowerCase()) {
      if (!items[i].done) return "exists";
      // Matching item is in the Done/Packed section — uncheck it instead of duplicating
      items[i].done = false;
      clearPersonChecks(items[i]);
      if (restoreCat) items[i].catId = restoreCat;
      items[i].added = Date.now();   // a revived item counts as recently added (v325)
      items[i].updated = Date.now(); // and the revival must win the newest-wins merge
      // v342: a revive is a re-purchase — feed the replenishment history
      // (count/lastUsed/dates) exactly like a fresh add, otherwise the
      // suggestion clock for often-revived staples never resets.
      addToHist(name, items[i].catId);
      return "restored";
    }
  }
  // +random so several items added in the same millisecond (voice) get unique ids
  listData[currentList].items.unshift({ id:Date.now()+Math.floor(Math.random()*1000), name:name, catId:catId, done:false, dueDate:dueD||null, addedBy:hearthUser, updated:Date.now(), added:Date.now() });
  addToHist(name, catId);
  return "added";
}
function doAdd() {
  var name = elInput.value.trim();
  if (!name) { elInput.focus(); return; }
  var catId = manualCatId || detectCat(name);
  var dueD = (currentList === "todo" || currentList === "personal") ? (document.getElementById("dueDateInput").value || null) : null;
  var res = addItemToCurrent(name, catId, dueD, manualCatId);
  if (res === "exists") { toast("Already in your list!"); resetInput(); return; }
  saveCurrentList(); resetInput(); renderList(); switchTab("list");
  toast(res === "restored" ? ("Moved back to list: " + name) : ("Added: "+name));
}
function resetInput() {
  elInput.value = ""; hideCatRow(); hideAC(); currentCatId = null; manualCatId = null;
  var dd = document.getElementById("dueDateInput"); if (dd) dd.value = "";

}

// ── Voice capture (v304) — speak a list, get items parsed & added ──────────
// Uses the browser Web Speech API (on Android that transcribes via Google —
// Cathal OK'd this, same as the keyboard mic). Scoped to the list add row, so
// it only ever touches grocery/todo/travel/personal — NEVER medicine/dosing.
// Always shows a review step before adding: never silently commits mis-hears.
var _voiceRec = null;
function voiceSupported(){ return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
// Split a spoken phrase into items on commas / "and" / "then" / "plus" /
// semicolons / newlines. Trims, collapses spaces, drops empties, de-dupes
// (case-insensitive), capitalises the first letter, caps at 20. The "and"
// split can over-split compound names ("fish and chips") — the review step
// lets the user drop those before adding.
function parseVoiceItems(text){
  var seen = {}, out = [];
  String(text||"").split(/,|\bthen\b|\band\b|\bplus\b|;|\n/i).forEach(function(s){
    s = s.replace(/\s+/g," ").trim();
    if (!s) return;
    var key = s.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    out.push(s.charAt(0).toUpperCase() + s.slice(1));
  });
  return out.slice(0, 20);
}
function startVoiceAdd(){
  if (!voiceSupported()) { toast("Voice input isn't available on this browser"); return; }
  if (_voiceRec) { try { _voiceRec.stop(); } catch(e){} return; } // tap again to stop
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = new SR(); _voiceRec = rec;
  rec.lang = "en-IE"; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
  var micBtn = document.getElementById("voiceMicBtn");
  if (micBtn) micBtn.classList.add("listening");
  rec.onresult = function(e){
    var transcript = "";
    for (var i=0;i<e.results.length;i++){ transcript += e.results[i][0].transcript; }
    var items = parseVoiceItems(transcript);
    if (!items.length) { toast("Didn't catch that — try again"); return; }
    showVoiceReview(transcript, items);
  };
  rec.onerror = function(ev){
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed") toast("Allow microphone access to add by voice");
    else if (ev.error === "no-speech") toast("Didn't hear anything — try again");
    else if (ev.error !== "aborted") toast("Voice error — try again");
  };
  rec.onend = function(){ if (micBtn) micBtn.classList.remove("listening"); _voiceRec = null; };
  try { rec.start(); } catch(e){ if (micBtn) micBtn.classList.remove("listening"); _voiceRec = null; }
}
function showVoiceReview(transcript, items){
  var listName = (LIST_TYPES[currentList] ? LIST_TYPES[currentList].name.replace(/&#x[0-9A-Fa-f]+;\s*/,"") : "list").trim();
  var ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:900;display:flex;align-items:center;justify-content:center;padding:22px;box-sizing:border-box";
  ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true"); ov.setAttribute("aria-label","Add by voice");
  var chips = items.map(function(it,idx){
    return "<span class='vc-chip' data-idx='"+esc(idx)+"' style='display:inline-flex;align-items:center;gap:6px;background:#F0EBF8;color:#4A3A20;border-radius:16px;padding:6px 10px;margin:0 6px 6px 0;font-size:14px'>"+esc(it)+"<span class='vc-x' data-idx='"+esc(idx)+"' style='cursor:pointer;color:#B07070;font-weight:800'>&times;</span></span>";
  }).join("");
  ov.innerHTML =
    "<div style='background:#fff;border-radius:16px;padding:20px;width:100%;max-width:360px;max-height:75vh;overflow-y:auto'>" +
      "<div style='font-size:16px;font-weight:800;color:#4A3A20;margin-bottom:2px'>&#x1F3A4; Add by voice</div>" +
      "<div style='font-size:12px;color:#8A7A5A;margin-bottom:12px'>Heard: &ldquo;" + esc(transcript) + "&rdquo; &middot; tap &times; to drop one</div>" +
      "<div id='vcChips'>" + chips + "</div>" +
      "<div style='display:flex;gap:8px;margin-top:14px'>" +
        "<button id='vcAdd' style='flex:1;padding:11px;border:none;background:var(--accent,#2D6B35);color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>Add to " + esc(listName) + "</button>" +
        "<button id='vcCancel' data-bbclose style='padding:11px 14px;border:none;background:#F0EBE2;color:#7A6A4A;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Cancel</button>" +
      "</div>" +
    "</div>";
  document.body.appendChild(ov);
  var current = items.slice();
  function close(){ if (ov.parentNode) ov.parentNode.removeChild(ov); }
  ov.addEventListener("click", function(e){ if (e.target===ov) close(); });
  ov.querySelector("#vcCancel").addEventListener("click", close);
  ov.querySelectorAll(".vc-x").forEach(function(x){
    x.addEventListener("click", function(){
      current[+x.dataset.idx] = null;
      var chip = x.closest(".vc-chip"); if (chip) chip.remove();
      if (!current.filter(Boolean).length) close();
    });
  });
  ov.querySelector("#vcAdd").addEventListener("click", function(){
    var toAdd = current.filter(Boolean), added = 0, existed = 0;
    toAdd.forEach(function(nm){
      var res = addItemToCurrent(nm, detectCat(nm), null, null);
      if (res === "exists") existed++; else added++;
    });
    if (added) { saveCurrentList(); renderList(); switchTab("list"); }
    close();
    toast(added ? ("Added " + added + " item" + (added!==1?"s":"") + (existed?" (" + existed + " already there)":"")) : "Those are already in your list");
  });
}
// v303 (predictive-replenishment foundation): record today's add-date on a
// history entry as a rolling series, so a future feature can learn how often
// an item is needed. Deduped per day, capped at 8 dates (→ up to 7 intervals).
// Backward-compatible: absent on pre-v303 entries until their next add. Purely
// additive data — no UI yet; rides through export/import/sync inside `hist`.
function histRecordDate(entry) {
  var todayS = todayStr();
  if (!Array.isArray(entry.dates)) entry.dates = [];
  if (entry.dates[entry.dates.length-1] !== todayS) {
    entry.dates.push(todayS);
    if (entry.dates.length > 8) entry.dates = entry.dates.slice(-8);
  }
}
// v406: every way of bringing an item back from Done is a re-add and must feed
// history (count/lastUsed/dates), the same as typing the name again (v342) — but
// ticking something by mistake and immediately unticking it is a correction, not
// a re-purchase. Items stamp `updated` when they're ticked done, so a flip inside
// the grace window is skipped. MUST be called BEFORE `updated` is re-stamped.
// Only the count is at stake: histRecordDate() already dedupes dates per day.
var REVIVE_HIST_GRACE_MS = 60000;
function reviveWasMisclick(it) {
  return !!(it && it.updated && (Date.now() - it.updated) < REVIVE_HIST_GRACE_MS);
}
function addToHist(name, catId) {
  clearHistTomb(currentList, name); // re-adding revives a deleted history entry (v323)
  var hist = getHist(), found = null;
  for (var i = 0; i < hist.length; i++) {
    if (!hist[i] || !hist[i].name) continue;
    if (hist[i].name.toLowerCase()===name.toLowerCase()) { found = hist[i]; break; }
  }
  if (found) { found.count=(found.count||1)+1; found.catId=catId; found.lastUsed=Date.now(); histRecordDate(found); }
  else { var e = { name:name, catId:catId, count:1, lastUsed:Date.now() }; histRecordDate(e); hist.unshift(e); }
  hist.sort(function(a,b){ return (b.count-a.count)||(b.lastUsed-a.lastUsed); });
  listData[currentList].hist = capHistToLiveLimit(hist, getItems());
}

// ============================================================
// RENDER LIST
// ============================================================
var _listSearchQuery = "";
var _travelFilter = [];
var _todayFilter = false;
var _recentFilter = false;
// "Recently added" (v325): an item counts as recent for 48h after it goes on
// the list. `added` is stamped at every creation/restore site from v325 on;
// items from before v325 fall back to their id, which has always been a
// Date.now() value (up to 1s of jitter — irrelevant at a 2-day window).
var RECENT_MS = 48 * 60 * 60 * 1000;
function itemAddedTs(it) {
  if (!it) return 0;
  if (it.added) return it.added;
  if (typeof it.id === "number" && it.id > 1000000000000) return it.id;
  return it.updated || 0;
}
function isRecentItem(it) { return Date.now() - itemAddedTs(it) < RECENT_MS; }
// Fuzzy match: true if all query chars appear in order in the text (subsequence),
// or the query is a direct substring. Case-insensitive, spaces ignored in query.
function fuzzyMatch(query, text) {
  if (!query) return true;
  var q = query.toLowerCase().replace(/\s+/g, "");
  var t = (text || "").toLowerCase();
  if (t.indexOf(query.toLowerCase()) !== -1) return true; // fast substring path
  var qi = 0;
  for (var ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}
// Item text for search — name + notes, lowercased once. Top-level and
// !item-guarded, mirroring recipeSearchText (v383); global search (v384)
// and any future list search should call this rather than reading
// item.name/item.notes directly, so both stay in sync.
function listSearchText(item) {
  if (!item) return "";
  return ((item.name || "") + " " + (item.notes || "")).toLowerCase();
}

// ============================================================
// RECIPES SECTION
// ============================================================
// ── Recipe ids must be unique, and the old generator wasn't (v400) ────────
// `Date.now() + rowIndex + random(0..999)` looks random enough until you
// notice Date.now() is CONSTANT across an import loop — so N recipes were
// drawn from a span of about 1,100 values. At 118 recipes that collides with
// 99.9% probability, ~6.4 colliding records expected (simulated), which is
// exactly what Cathal's book turned out to contain.
//
// Two records sharing an id is not cosmetic. Every reader in the app uses
// find()/findIndex() on the id, so only the FIRST is reachable: the twin
// cannot be opened, favourited, deleted, or given prep. And neither sync path
// dedupes by id, so once it exists it propagates to the other phone forever.
//
// This generator is monotonic within a page session AND checks the ids
// already in use, so a bulk import cannot collide with itself or with the
// existing book. Values stay in the normal ms-timestamp range, so nothing
// that sorts or compares ids changes behaviour.
var _lastRecipeId = 0;
function recipeIdMap(rb) {
  var taken = {};
  (rb || []).forEach(function(r){ if (r && r.id != null) taken[r.id] = true; });
  return taken;
}
function nextRecipeId(taken) {
  var id = Date.now();
  if (id <= _lastRecipeId) id = _lastRecipeId + 1;
  while (taken && taken[id]) id++;
  _lastRecipeId = id;
  if (taken) taken[id] = true;          // reserve it for the rest of the batch
  return id;
}
function getRecipeBook() { return (storeGet("fl4_recipebook") || []).filter(function(r){ return !!r; }); } // guard: a null entry (sync merge / CSV import) must degrade, never crash the section (every reader gets clean data from one place)
function saveRecipeBook(r) { storeSet("fl4_recipebook", r); if (typeof isHouseholdSet === "function" && isHouseholdSet()) pushHousehold(); }
// One-off migration (v289): recipes created before v242 carry no `updated`
// stamp and count as 0 in the newest-wins merge. Stamp them with a fixed
// ancient-but-nonzero constant — deliberately NOT Date.now(), which would make
// a stale copy beat the partner's genuinely newer edit of the same recipe.
// Every device converges on the same constant; any real edit, import or
// deletion tombstone still wins over it.
(function(){
  var rb = storeGet("fl4_recipebook");
  if (!Array.isArray(rb)) return;
  var changed = false;
  rb.forEach(function(r){ if (r && !r.updated) { r.updated = 1; changed = true; } });
  if (changed) storeSet("fl4_recipebook", rb);
})();

// ============================================================
// MEAL PLAN — household-shared week planner (v317). One entry per
// calendar day ("YYYY-MM-DD"), dinner only. The day string itself is
// the merge key: newest-wins by `updated` per day, so clearing a day
// just writes recipeId:null with a fresh stamp — no tombstones needed.
// Entries older than 14 days are pruned on save and on merge; the
// cutoff is a deterministic date string, so every device drops the
// same rows and the prune can't cause re-push flapping.
// NOTE: distinct from fl4_saved_meals (the food/calorie log's saved
// meals) — this store is recipe assignments for upcoming dinners.
// ============================================================
function getMealPlan() { return storeGet("fl4_mealplan") || []; }
function mealPlanCutoffDay() {
  var d = new Date(); d.setDate(d.getDate() - 14);
  return d.getFullYear() + "-" + t2(d.getMonth()+1) + "-" + t2(d.getDate());
}
function pruneMealPlan(plan) {
  var cut = mealPlanCutoffDay();
  return (plan || []).filter(function(e){ return e && typeof e.day === "string" && e.day >= cut; });
}
function saveMealPlan(plan) {
  storeSet("fl4_mealplan", pruneMealPlan(plan));
  pushPersonal();
  if (typeof isHouseholdSet === "function" && isHouseholdSet()) pushHousehold();
}
// Assign (or clear, with recipeId null) the dinner for one day.
function setMealPlanDay(day, recipeId, servings) {
  var plan = getMealPlan();
  var e = plan.find(function(x){ return x && x.day === day; });
  if (e) { e.recipeId = recipeId; e.servings = servings; e.updated = Date.now(); e.addedBy = hearthUser; }
  else plan.push({ day: day, recipeId: recipeId, servings: servings, updated: Date.now(), addedBy: hearthUser });
  saveMealPlan(plan);
}
// Merge two meal plans: union of days, newest-wins by `updated` per day.
// Returns {plan, push} — push=true when local holds anything the incoming
// copy lacks or is older on, so the caller schedules a convergence
// re-push (same contract as mergeTripsData / the recipebook merge).
function mergeMealPlanData(local, incoming) {
  var loc = pruneMealPlan(local), inc = pruneMealPlan(incoming);
  var incByDay = {}; inc.forEach(function(e){ incByDay[e.day] = e; });
  var seen = {}, push = false;
  var merged = loc.map(function(e){
    seen[e.day] = true;
    var ie = incByDay[e.day];
    if (!ie) { push = true; return e; }
    if ((ie.updated||0) > (e.updated||0)) return ie;
    if ((e.updated||0) > (ie.updated||0)) push = true;
    return e;
  });
  var fresh = inc.filter(function(e){ return !seen[e.day]; });
  return { plan: fresh.concat(merged), push: push };
}

// The rolling 7-day window (today..+6) as plain "YYYY-MM-DD" day strings —
// shared by renderMealPlanner, the Fill algorithm, and addWeekToGroceries.
function mealPlanWindowDayStrs() {
  var out = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(); d.setDate(d.getDate() + i);
    out.push(d.getFullYear() + "-" + t2(d.getMonth()+1) + "-" + t2(d.getDate()));
  }
  return out;
}

// Rotation Fill — pure function, no storage/global-state side effects (so it's
// easy to test and to preview). Pool = inRotation recipes sorted by
// lastCooked ascending (never-cooked/lastCooked:0 first; ties broken by id
// for a deterministic order). Fills only EMPTY days in the window, skipping
// a recipe already assigned elsewhere in the SAME window so one fill run
// never repeats a dinner. Returns fewer entries than empty days when the
// rotation pool is smaller — a partial fill, never a wraparound repeat.
function mealPlanFillWindow(rb, plan, dayStrs) {
  var pool = (rb || []).filter(function(r){ return r && r.inRotation; }).slice().sort(function(a,b){
    var la = a.lastCooked || 0, lb = b.lastCooked || 0;
    if (la !== lb) return la - lb;
    return a.id - b.id;
  });
  var assignedIds = {};
  (plan || []).forEach(function(e){
    if (e && e.recipeId != null && dayStrs.indexOf(e.day) !== -1) assignedIds[e.recipeId] = true;
  });
  var emptyDays = dayStrs.filter(function(d){
    return !(plan || []).some(function(e){ return e && e.day === d && e.recipeId != null; });
  });
  var entries = [], pi = 0;
  emptyDays.forEach(function(day){
    while (pi < pool.length && assignedIds[pool[pi].id]) pi++;
    if (pi >= pool.length) return;
    var r = pool[pi];
    assignedIds[r.id] = true;
    entries.push({ day: day, recipeId: r.id, servings: r.servings || 1, updated: Date.now(), addedBy: hearthUser });
    pi++;
  });
  return { entries: entries, filledCount: entries.length, emptyCount: emptyDays.length };
}

// Wrapper: runs Fill against the live store and saves the result. Only ever
// called from a user tap (the roll-over banner, or the planner's manual
// "Fill empty days" button) — deliberately no auto-fill anywhere, per the
// 27/07/2026 design call (two devices independently auto-filling before
// syncing could land the same dinner on two days).
function runMealPlanFill() {
  var rb = getRecipeBook();
  if (!rb.some(function(r){ return r && r.inRotation; })) {
    toast("No recipes marked “In rotation” yet — set some from Recipes first");
    return { entries: [], filledCount: 0, emptyCount: 0 };
  }
  var plan = getMealPlan();
  var result = mealPlanFillWindow(rb, plan, mealPlanWindowDayStrs());
  if (result.filledCount) saveMealPlan(plan.concat(result.entries));
  if (!result.emptyCount) toast("Week's already fully planned");
  else if (result.filledCount === result.emptyCount) toast("&#x1F37D; Filled " + result.filledCount + " day" + (result.filledCount!==1?"s":""));
  else if (result.filledCount) toast("&#x1F37D; Filled " + result.filledCount + " of " + result.emptyCount + " empty days — not enough recipes in rotation for the rest");
  else toast("No recipes in rotation to fill with");
  return result;
}

