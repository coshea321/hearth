// ============================================================
// FAMILY LOG (v338) — read-only "family story" feed aggregating
// events the app already timestamps. Zero new data model, zero
// new logging, no sync changes: pure render-time aggregation.
// Medicine rows are factual only — all dosing/interval logic
// stays in the Baby flow. Teeth are excluded (no dates stored).
// ============================================================
var _famlogFilter = "all"; // all | baby | train | trips | notes
var _famlogDays = 90;      // window; "Load earlier" adds 90 per tap

function _famlogDayStr(ts) {
  var d = new Date(ts), p = function(x){ return x<10?"0"+x:""+x; };
  return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());
}
function _famlogTimeStr(ts) {
  return new Date(ts).toLocaleTimeString("en-IE",{hour:"2-digit",minute:"2-digit"});
}

function famlogEvents() {
  var evs = [];
  var noon = function(dateStr){ var t = new Date(dateStr+"T12:00:00").getTime(); return isNaN(t)?null:t; };
  var okDate = function(s){ return typeof s==="string" && /^\d{4}-\d{2}-\d{2}/.test(s); };

  var bd = getBD();
  (bd.medicine||[]).forEach(function(m){
    if (!m || !m.ts) return;
    evs.push({ date:_famlogDayStr(m.ts), sort:m.ts, src:"baby", act:"baby", ico:"&#x1F48A;",
      text: esc(m.name||"Medicine") + (m.dose?" &middot; "+esc(m.dose):"") + " &middot; check the leaflet",
      time:_famlogTimeStr(m.ts) });
  });
  (bd.growth||[]).forEach(function(g){
    if (!g || !okDate(g.date)) return;
    var gd = g.date.slice(0,10), gt = noon(gd);
    if (gt===null) return;
    var parts = [];
    if (g.weight) parts.push(g.weight+" kg");
    if (g.height) parts.push(g.height+" cm");
    if (!parts.length) return;
    evs.push({ date:gd, sort:gt, src:"baby", act:"baby", ico:"&#x1F4CF;", text:"Growth: "+parts.join(" &middot; "), time:"" });
  });
  (bd.milestones||[]).forEach(function(m){
    if (!m || !m.text) return;
    // Milestone dates are user-typed and optional — fall back to the
    // creation-time id so undated milestones still make the story.
    var ds = okDate(m.date) ? m.date.slice(0,10) : (m.id ? _famlogDayStr(m.id) : null);
    if (!ds) return;
    var mt = noon(ds);
    if (mt===null) return;
    evs.push({ date:ds, sort:mt, src:"baby", act:"baby", ico:"&#x2B50;", text:esc(m.text), time:"" });
  });

  ((getWD().workouts)||[]).forEach(function(w){
    if (!w || !okDate(w.date)) return;
    var wd = w.date.slice(0,10), wt = noon(wd);
    if (wt===null) return;
    evs.push({ date:wd, sort:wt, src:"train", act:"train", ico:"&#x1F4AA;",
      text: esc(w.sessionName||"Workout") + (w.kcal?" &middot; "+Math.round(w.kcal)+" kcal":""), time:"" });
  });

  (getTrips()||[]).forEach(function(tr){
    if (!tr) return;
    if (okDate(tr.start)) {
      var ts1 = noon(String(tr.start).slice(0,10));
      if (ts1!==null) evs.push({ date:String(tr.start).slice(0,10), sort:ts1, src:"trips", act:"trips", id:tr.id, ico:"&#x1F9F3;", text:"Trip started: "+esc(tr.name||"Trip"), time:"" });
    }
    if (okDate(tr.end)) {
      var ts2 = noon(String(tr.end).slice(0,10));
      if (ts2!==null) evs.push({ date:String(tr.end).slice(0,10), sort:ts2, src:"trips", act:"trips", id:tr.id, ico:"&#x1F3E0;", text:"Trip ended: "+esc(tr.name||"Trip"), time:"" });
    }
  });

  Object.keys(NOTES_CONTEXTS).forEach(function(ctx){
    normaliseNotes(storeGet(NOTES_CONTEXTS[ctx].key)||[]).forEach(function(n){
      if (!n || !n.createdAt) return;
      evs.push({ date:_famlogDayStr(n.createdAt), sort:n.createdAt, src:"notes", act:"notes", ico:"&#x1F4DD;",
        text:"Note: "+esc(n.title||"Note"), time:_famlogTimeStr(n.createdAt) });
    });
  });

  // "Story so far": future-dated entries (an upcoming trip's end date,
  // forward-dated milestones) stay out until their day arrives.
  var endOfToday = new Date(); endOfToday.setHours(23,59,59,999);
  evs = evs.filter(function(e){ return e.sort <= endOfToday.getTime(); });
  evs.sort(function(a,b){ return b.sort - a.sort; });
  return evs;
}

function renderFamlog() {
  var el = document.getElementById("famlogContent");
  if (!el) return;
  var all = famlogEvents();
  var filtered = _famlogFilter==="all" ? all : all.filter(function(e){ return e.src===_famlogFilter; });
  var cutoff = Date.now() - _famlogDays*86400000;
  var shown = filtered.filter(function(e){ return e.sort >= cutoff; });
  var hasMore = filtered.length > shown.length;

  var html = "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:2px'>&#x1F4D6; Family Log</div>" +
    "<div style='font-size:12px;color:#8A7A8A;margin-bottom:12px'>The family story, from what's already logged elsewhere. Tap a row to open its section.</div>";

  var chips = [["all","All"],["baby","&#x1F476; Baby"],["train","&#x1F4AA; Train"],["trips","&#x1F9F3; Trips"],["notes","&#x1F4DD; Notes"]];
  html += "<div style='display:flex;gap:7px;flex-wrap:wrap;margin-bottom:6px'>";
  chips.forEach(function(c){
    var on = _famlogFilter===c[0];
    html += "<button class='fml-chip' data-src='"+esc(c[0])+"' style='border:1.5px solid "+(on?"#8A5A9A":"#DCD2E0")+";background:"+(on?"#8A5A9A":"#fff")+";color:"+(on?"#fff":"#6A5A72")+";border-radius:14px;padding:5px 13px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation'>"+c[1]+"</button>";
  });
  html += "</div>";

  if (!shown.length && hasMore) {
    html += "<div style='text-align:center;color:#8A7A8A;padding:30px 16px'><div style='font-size:40px'>&#x1F4D6;</div><div style='font-size:15px;font-weight:600;margin:8px 0 4px'>Nothing in the last "+_famlogDays+" days</div><div style='font-size:13px'>Load earlier shows older events.</div></div>";
  } else if (!shown.length) {
    var _famlogFilterNames = { baby:"Baby", train:"Train", trips:"Trips", notes:"Notes" };
    var _famlogEmptyTitle = _famlogFilter === "all" ? "Nothing here yet" : "No " + (_famlogFilterNames[_famlogFilter] || "matching") + " events yet";
    html += "<div style='text-align:center;color:#8A7A8A;padding:30px 16px'><div style='font-size:40px'>&#x1F4D6;</div><div style='font-size:15px;font-weight:600;margin:8px 0 4px'>" + _famlogEmptyTitle + "</div><div style='font-size:13px'>Events from Baby, Train, Trips and Notes will appear as they're logged"+(_famlogFilter!=="all"?" &mdash; choose All to see every source":"")+".</div></div>";
  } else {
    var lastDate = null;
    shown.forEach(function(e){
      if (e.date !== lastDate) { html += dateSeparatorHTML(e.date); lastDate = e.date; }
      html += "<div class='fml-row' data-act='"+esc(e.act)+"'"+(e.id?" data-id='"+esc(e.id)+"'":"")+" style='display:flex;align-items:center;gap:10px;padding:11px 14px;background:#fff;margin:0 0 5px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.07);cursor:pointer;touch-action:manipulation'>"+
        "<span style='font-size:18px'>"+e.ico+"</span>"+
        "<span style='flex:1;font-size:14px;font-weight:600;color:#2A2A1E;min-width:0'>"+e.text+"</span>"+
        (e.time?"<span style='font-size:12px;color:#B8A8C0;font-weight:600'>"+e.time+"</span>":"")+
        "<span style='color:#C8BEA8;font-size:16px'>&#x203A;</span>"+
      "</div>";
    });
  }

  if (hasMore) {
    html += "<button id='fmlMoreBtn' style='display:block;margin:14px auto 0;border:1.5px solid #8A5A9A;background:#fff;color:#8A5A9A;border-radius:10px;padding:9px 18px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation'>Load earlier</button>";
  } else if (shown.length) {
    html += "<div style='text-align:center;font-size:12px;color:#B8A8C0;padding:14px 0 0'>That's the whole story so far</div>";
  }

  el.innerHTML = html;

  el.querySelectorAll(".fml-chip").forEach(function(b){
    b.addEventListener("click", function(){ _famlogFilter = b.dataset.src; renderFamlog(); });
  });
  var moreBtn = document.getElementById("fmlMoreBtn");
  if (moreBtn) moreBtn.addEventListener("click", function(){ _famlogDays += 90; renderFamlog(); });
  el.querySelectorAll(".fml-row").forEach(function(row){
    row.addEventListener("click", function(){
      var act = row.dataset.act;
      if (act==="trips") {
        openRecord("trip", row.dataset.id || null);
      } else {
        switchSection(act); // "baby" / "train" / "notes" (notes maps to the Lists sub-tab)
      }
    });
  });
}

function switchSection(section) {
  // Notes lives inside Lists since v318 — map legacy deep-links to the sub-tab.
  if (section === "notes") { currentList = "notes"; section = "lists"; }
  // The first test-build navigation can run before currentSection exists.
  var wasTrack = typeof currentSection !== "undefined" && currentSection === "track";
  currentSection = section;
  stopHomeClock();

  // Back-button support (v322): each top-level section is a history entry.
  // Skip when we're here *because of* a popstate (back/forward) event, so
  // we don't push a new entry on top of the one the user just navigated to.
  if (!_navFromPopstate) {
    if (!history.state) {
      history.replaceState({ hearthSection: section }, "");
    } else if (history.state.hearthSection !== section) {
      history.pushState({ hearthSection: section }, "");
    }
  }

  window.scrollTo(0, 0);

  document.getElementById("homeSection").style.display  = section === "home"   ? "block" : "none";
  document.getElementById("lifeSection").style.display  = section === "lists"  ? "block" : "none";
  document.getElementById("trainSection").style.display = section === "train"  ? "block" : "none";
  document.getElementById("recipesSection").style.display = section === "recipes" ? "block" : "none";
  document.getElementById("notesSection").style.display = (section === "lists" && currentList === "notes") ? "block" : "none";
  document.getElementById("babySection").style.display  = section === "baby"   ? "block" : "none";
  document.getElementById("tripsSection").style.display = section === "trips"  ? "block" : "none";
  document.getElementById("trackSection").style.display = section === "track"  ? "block" : "none";
  document.getElementById("sportsSection").style.display = section === "sports" ? "block" : "none";
  document.getElementById("famlogSection").style.display = section === "famlog" ? "block" : "none";
  document.getElementById("plantsSection").style.display = section === "plants" ? "block" : "none";
  document.getElementById("watchSection").style.display = section === "watch" ? "block" : "none";
  document.getElementById("appliancesSection").style.display = section === "appliances" ? "block" : "none";
  document.getElementById("healthSection").style.display = section === "health" ? "block" : "none";
  document.getElementById("projectsSection").style.display = section === "projects" ? "block" : "none";
  document.getElementById("golfSection").style.display = section === "golf" ? "block" : "none";

  document.getElementById("bnHome").className  = "bn-btn" + (section === "home"   ? " home-active"  : "");
  document.getElementById("bnLife").className  = "bn-btn" + (section === "lists"  ? " life-active"  : "");
  document.getElementById("bnTrain").className = "bn-btn" + (section === "train"  ? " train-active" : "");
  document.getElementById("bnRecipes").className = "bn-btn" + (section === "recipes" ? " recipes-active" : "");
  document.getElementById("bnBaby").className  = "bn-btn" + (section === "baby"   ? " baby-active"  : "");
  document.getElementById("bnTrips").className = "bn-btn" + (section === "trips"  ? " trips-active" : "");
  document.getElementById("bnTrack").className = "bn-btn" + (section === "track"  ? " track-active" : "");
  document.getElementById("bnSports").className = "bn-btn" + (section === "sports" ? " sports-active" : "");
  document.getElementById("bnFamlog").className = "bn-btn" + (section === "famlog" ? " famlog-active" : "");
  document.getElementById("bnPlants").className = "bn-btn" + (section === "plants" ? " plants-active" : "");
  document.getElementById("bnWatch").className = "bn-btn" + (section === "watch" ? " watch-active" : "");
  document.getElementById("bnAppliances").className = "bn-btn" + (section === "appliances" ? " appliances-active" : "");
  document.getElementById("bnHealth").className = "bn-btn" + (section === "health" ? " health-active" : "");
  document.getElementById("bnProjects").className = "bn-btn" + (section === "projects" ? " projects-active" : "");
  document.getElementById("bnGolf").className = "bn-btn" + (section === "golf" ? " golf-active" : "");
  syncMoreActive(); // v452: the More button owns the highlight for overflow sections
  if (section === "sports" && typeof renderSports === "function") renderSports();

  document.body.classList.toggle("home-mode",  section === "home");
  document.body.classList.toggle("train-mode", section === "train");
  document.body.classList.toggle("baby-mode",  section === "baby");
  // v496: section colour on the header + that section's header actions.
  document.body.setAttribute("data-sec", section);
  Array.prototype.forEach.call(document.querySelectorAll(".hdr-act"), function(el){
    el.style.display = el.getAttribute("data-sec") === section ? "flex" : "none";
  });

  if (isHouseholdSet() && (section === "home" || section === "lists" || section === "baby") && (Date.now() - lastPushTs > 15000)) {
    fetchHousehold();
  }
  if (isLoggedIn() && (section === "train" || section === "track") && (Date.now() - lastPushTs > 15000)) {
    fetchPersonal();
  }

  if (section === "home") {
    document.getElementById("themeColor").setAttribute("content", "#111820");
    document.getElementById("appTitle").innerHTML = "&#x1F525; Hearth";
    document.getElementById("hdrBadge").style.display = "none";
    // Global search (v384) has no search history (design doc §7) — clear it
    // on every fresh arrival at Home, but not on a background re-render
    // while already here (would wipe an in-progress search on an
    // unrelated sync event), so this lives here and not in renderHomeScreen.
    _gSearchQuery = "";
    var _gsi = document.getElementById("homeSearchInput");
    if (_gsi) _gsi.value = "";
    if (typeof renderGlobalSearchResults === "function") renderGlobalSearchResults();
    renderHomeScreen();
    startHomeClock();
  } else if (section === "lists") {
    applyListTheme();
    renderList();
    updateDueDateRowVisibility();
  } else if (section === "train") {
    document.getElementById("themeColor").setAttribute("content", "#3565C8");
    document.getElementById("appTitle").textContent  = "💪 Train";
    document.getElementById("hdrBadge").style.display = "none";
    renderTrainView();
  } else if (section === "recipes") {
    document.getElementById("themeColor").setAttribute("content", "#B5651D");
    document.getElementById("appTitle").innerHTML = "&#x1F37D; Recipes";
    document.getElementById("hdrBadge").style.display = "none";
    // v386: a search left armed from a previous visit used to survive a
    // section switch (query set, search row still open) and silently
    // filter the list with no visible cause on return. Reset on every
    // fresh arrival here, mirroring the v384 Home-search-clear pattern.
    // Not inside renderRecipes() itself: that also runs on a chip tap and
    // on a sync-triggered redraw while already on this screen, neither of
    // which should wipe an in-progress search.
    // v387: EXCEPT when openRecord just deliberately preset the search as
    // part of a global-search hand-off — _recipeSearchPreset is a one-shot
    // flag it sets immediately before calling switchSection, so this reset
    // doesn't immediately wipe out what it just set.
    if (_recipeSearchPreset) {
      _recipeSearchPreset = false;
    } else {
      _recipeSearchQuery = "";
      var _rsiArrive = document.getElementById("rcpSearchInput");
      var _rsrArrive = document.getElementById("rcpSearchRow");
      if (_rsiArrive) _rsiArrive.value = "";
      if (_rsrArrive) _rsrArrive.style.display = "none";
    }
    renderRecipes();
  } else if (section === "baby") {
    document.getElementById("themeColor").setAttribute("content", "#7E22CE");
    document.getElementById("appTitle").innerHTML = "&#x1F476; Baby";
    document.getElementById("hdrBadge").style.display = "none";
    renderBabyView();
  } else if (section === "trips") {
    document.getElementById("themeColor").setAttribute("content", "#0F8A8A");
    document.getElementById("appTitle").innerHTML = "&#x1F9F3; Trips";
    document.getElementById("hdrBadge").style.display = "none";
    renderTrips();
  } else if (section === "track") {
    if (!wasTrack) document.getElementById("trackPerson").value = "me";
    document.getElementById("themeColor").setAttribute("content", "#A05A10");
    document.getElementById("appTitle").innerHTML = "&#x1F4C8; Track";
    document.getElementById("hdrBadge").style.display = "none";
    renderTrackView();
  } else if (section === "famlog") {
    document.getElementById("themeColor").setAttribute("content", "#8A5A9A");
    document.getElementById("appTitle").innerHTML = "&#x1F4D6; Family Log";
    document.getElementById("hdrBadge").style.display = "none";
    renderFamlog();
  } else if (section === "plants") {
    document.getElementById("themeColor").setAttribute("content", "#2E7D4F");
    document.getElementById("appTitle").innerHTML = "&#x1FAB4; Plants";
    document.getElementById("hdrBadge").style.display = "none";
    renderPlants();
  } else if (section === "watch") {
    document.getElementById("themeColor").setAttribute("content", "#4A3F7A");
    document.getElementById("appTitle").innerHTML = "&#x1F37F; Watchlist";
    document.getElementById("hdrBadge").style.display = "none";
    renderWatchlist();
  } else if (section === "appliances") {
    document.getElementById("themeColor").setAttribute("content", "#3E5C6B");
    document.getElementById("appTitle").innerHTML = "&#x1F4E6; Home inventory";
    document.getElementById("hdrBadge").style.display = "none";
    renderAppliances();
  } else if (section === "health") {
    document.getElementById("themeColor").setAttribute("content", "#2F6E6E");
    document.getElementById("appTitle").innerHTML = "&#x1FA7A; Health";
    document.getElementById("hdrBadge").style.display = "none";
    renderHealth();
  } else if (section === "projects") {
    document.getElementById("themeColor").setAttribute("content", "#8A5A2B");
    document.getElementById("appTitle").innerHTML = "&#x1F528; Projects";
    document.getElementById("hdrBadge").style.display = "none";
    renderProjects();
  } else if (section === "golf") {
    document.getElementById("themeColor").setAttribute("content", "#3F6B21");
    document.getElementById("appTitle").innerHTML = "&#x26F3; Golf";
    document.getElementById("hdrBadge").style.display = "none";
    renderGolf();
  }
}

// ── openRecord(type, id) (v384) ─────────────────────────────────
// Single deep-link entry point, replacing three hand-rolled copies of the
// same "set state + switchSection() + render" sequence that used to live
// separately in the Today card, the Family Log card and the trips card
// (each drifting slightly — see HEARTH-global-search.md §4). State is set
// BEFORE switchSection() runs so its own render call (renderList()/
// renderTrips()/renderPlants(), each of which already dispatches on the
// view state) paints the right thing first time, with no extra render call
// needed afterwards.
// type: a LIST_CONFIG key ("grocery"/"todo"/"personal"/"travel"), "notes",
//       "trip", "plant" or "recipes" (v387). id: the record id where a deep
//       link exists (trip, plant) — there is no id-level deep link into a
//       single list item, note or recipe yet, so id is unused for those types.
// opts.query: for list types, pre-fills and applies that list's own search
//             (resetting its other filters) instead of landing on a stale
//             or unrelated filter — the exact v381 bug class.
// opts.ctx: for notes, which context ("personal"/"work") to land on.
function openRecord(type, id, opts) {
  opts = opts || {};
  if (LIST_CONFIG[type]) {
    currentList = type;
    resetInput();
    _travelFilter = []; _todayFilter = false; _recentFilter = false;
    _listSearchQuery = opts.query || "";
    switchTab("list");
    switchSection("lists");
    var searchRow = document.getElementById("searchRow");
    var searchInput = document.getElementById("listSearchInput");
    if (searchRow) searchRow.style.display = _listSearchQuery ? "block" : "none";
    if (searchInput) searchInput.value = _listSearchQuery;
  } else if (type === "notes") {
    if (opts.ctx) currentNotesView = opts.ctx;
    switchSection("notes");
  } else if (type === "trip") {
    if (id != null) { _tripOpenId = Number(id); _tripView = "detail"; }
    else { _tripOpenId = null; _tripView = "list"; }
    switchSection("trips");
  } else if (type === "plant") {
    if (id != null) { _plantOpenId = Number(id); _plantView = "detail"; }
    else { _plantOpenId = null; _plantView = "list"; }
    _plantImporting = false; _plantImportParsed = null; // a deep-link wins over a half-finished import
    _plantArea = "";                                     // and over an area filter
    switchSection("plants");
  } else if (type === "recipes") {
    // v387 (global search phase 2). Reset the category filter — never
    // silently AND a hand-off with a stale chip, the v381/v386 bug class —
    // and mark the arrival as a deliberate preset so switchSection's own
    // v386 stale-search reset leaves this alone.
    _recipeView = "list";
    _recipeFilter = "all";
    _recipeSearchQuery = opts.query || "";
    _recipeSearchPreset = true;
    switchSection("recipes");
    var rcpRow = document.getElementById("rcpSearchRow");
    var rcpInput = document.getElementById("rcpSearchInput");
    if (rcpRow) rcpRow.style.display = _recipeSearchQuery ? "block" : "none";
    if (rcpInput) rcpInput.value = _recipeSearchQuery;
  } else if (type === "appliances") {
    // v424. The one id-level deep link in global search — landing on the
    // record itself is the whole point here (you searched a model number
    // because you want the model number), whereas the list groups can only
    // hand off to their own search. HEARTH-global-search.md §9 stays open
    // for everything else.
    _applEditId = null;
    _applArea = "";                                    // a deep-link wins over an area filter
    _applImportParsed = null;                          // and over a half-finished import (v428)
    if (id != null) { _applOpenId = Number(id); _applView = "detail"; }
    else { _applOpenId = null; _applView = "list"; }
    switchSection("appliances");
  } else if (type === "health") {
    // v449. Health is the second id-level deep link (after appliances): the
    // record IS the answer here, so a search for a consultant's name or the
    // Home "next appointment" line lands on the expanded row rather than on
    // a list you then have to scan. A deep-link wins over a person filter and
    // over a half-open editor, same rule as the two sections above.
    _healthEditId = null; _healthEditing = false; _healthCancelFn = null;
    _healthPerson = "";
    _healthView = "list";
    _healthOpenId = (id != null) ? Number(id) : null;
    // A past appointment can only be reached with the Past group open, and a
    // deep link that lands on a collapsed row looks like a broken link.
    if (_healthOpenId != null) {
      var _hlRec = getHealth().find(function(r){ return r && r.id === _healthOpenId; });
      if (_hlRec && healthKindMeta(_hlRec.kind).key === "appointment" && !healthCountdownLabel(_hlRec)) _healthPastOpen = true;
    }
    switchSection("health");
  } else if (type === "projects") {
    // v499: id-level deep link, the Health/inventory rule — the Home Today
    // line and a search hit land on the project itself. A deep link wins over
    // a half-open editor.
    _projEditId = null; _projItemId = null; _projEditing = false; _projCancelFn = null;
    if (id != null) { _projOpenId = Number(id); _projView = "detail"; }
    else { _projOpenId = null; _projView = "list"; }
    switchSection("projects");
  }
}

// Back-button support (v322): phone/browser back moves between the
// top-level sections above (Home/Lists/Train/Recipes/Baby/Trips/Sports/Family Log).
// Doesn't unwind sub-tabs (e.g. Lists' History/Notes tabs) or modals
// (e.g. the Trip editor) — those are still closed with their own X/close
// controls. Android's hardware back button triggers this automatically in
// a PWA; iOS has no hardware back button so this only affects the browser
// back gesture there.
var _navFromPopstate = false;

// Back-button-closes-popup (v330): before switching sections on a back-press,
// try to close whatever's on top instead. v1 priority order below; deliberately
// excludes #loginOverlay, the trip editor (_tripEditing), and one-off dynamic
// role="dialog" sheets not listed here — see HEARTH-notes.md for the full spec.
function closeTopOverlay() {
  var cfNo = document.getElementById("_cfNo");
  if (cfNo) { cfNo.click(); return true; } // confirmDialog: always Cancel, never OK

  // v345: generic close for the one-off dynamic role="dialog" sheets (cloud
  // backups, sync health, meal-plan picker/day sheet, sports manage, voice
  // review, delete-all confirm, recipe-clear 3-way) — each tags its own safe
  // dismiss button with data-bbclose at creation time; back-press runs that
  // button's own click handler rather than reimplementing the close. Take the
  // LAST matching dialog in document order (later-appended = on top). An
  // untagged dialog falls through without closing anything.
  var dynDialogs = document.querySelectorAll('body > div[role="dialog"], body > div[role="alertdialog"]');
  if (dynDialogs.length) {
    var bbBtn = dynDialogs[dynDialogs.length - 1].querySelector("[data-bbclose]");
    if (bbBtn) { bbBtn.click(); return true; }
  }

  var neHelp = document.getElementById("neHelpPanel");
  if (neHelp && neHelp.style.display === "block") { neHelp.style.display = "none"; return true; }

  if (document.getElementById("neBody") && _neCloseFn) { _neCloseFn(); return true; }

  var itemSheet = document.getElementById("itemSheet");
  if (itemSheet && itemSheet.style.display === "block") { closeItemSheet(); return true; }
  var importSheet = document.getElementById("importSheet");
  if (importSheet && importSheet.style.display === "block") { closeImport(); return true; }
  var recipeImportSheet = document.getElementById("recipeImportSheet");
  if (recipeImportSheet && recipeImportSheet.style.display === "block") { closeRecipeImport(); return true; }
  var setSheet = document.getElementById("setSheet");
  if (setSheet && setSheet.style.display === "block") { closeSetSheet(); return true; }

  var openOverlay = document.querySelector(".overlay.open");
  if (openOverlay) {
    if (openOverlay.id === "pickerOverlay") closePicker();
    else openOverlay.classList.remove("open");
    return true;
  }

  var toothModal = document.getElementById("toothModal");
  if (toothModal && toothModal.classList.contains("open")) { toothModal.classList.remove("open"); return true; }

  // v354: Train/yoga session overlay toggles style.display directly (no .overlay
  // class, no role="dialog"), so no earlier branch ever catches it — back-press
  // used to fall through to switchSection() while the timer kept running
  // underneath. Click the EXISTING sesBackBtn so its own exit-confirm guard still
  // applies (never reimplement the close, same principle as the data-bbclose
  // step above); the confirmDialog it raises is itself caught by step 1 on a
  // second back-press (bug review finding 5, 25/07/2026).
  var sessionOverlay = document.getElementById("sessionOverlay");
  if (sessionOverlay && sessionOverlay.style.display === "block") {
    document.getElementById("sesBackBtn").click();
    return true;
  }

  // v345: trip editor / booking editor are innerHTML swaps of #tripsContent,
  // not overlays, so they need their own check — LAST, since a confirmDialog
  // can still be sitting above the editor (step 1 catches that first). Ask
  // before discarding; a second back-press while the confirm is up hits step
  // 1 and cancels the confirm instead.
  if (_tripEditing && _tripCancelFn) {
    var tcf = _tripCancelFn;
    confirmDialog("Discard changes?", function(){ tcf(); }, function(){});
    return true;
  }

  // v377: the plant editor is an innerHTML swap of #plantsContent too, so it
  // needs the same treatment as the trip editor above.
  if (_plantEditing && _plantCancelFn) {
    var pcf = _plantCancelFn;
    confirmDialog("Discard changes?", function(){ pcf(); }, function(){});
    return true;
  }

  // v391: the watchlist editor is the same innerHTML-swap shape as the two above.
  if (_watchEditing && _watchCancelFn) {
    var wcf = _watchCancelFn;
    confirmDialog("Discard changes?", function(){ wcf(); }, function(){});
    return true;
  }

  // v424: the appliance editor, same innerHTML-swap shape again.
  if (_applEditing && _applCancelFn) {
    var acf = _applCancelFn;
    confirmDialog("Discard changes?", function(){ acf(); }, function(){});
    return true;
  }

  // v449: the health editor, same innerHTML-swap shape again.
  if (_healthEditing && _healthCancelFn) {
    var hcf = _healthCancelFn;
    confirmDialog("Discard changes?", function(){ hcf(); }, function(){});
    return true;
  }

  // v499: both Projects editors (project and item), same innerHTML-swap shape.
  if (_projEditing && _projCancelFn) {
    var pjcf = _projCancelFn;
    confirmDialog("Discard changes?", function(){ pjcf(); }, function(){});
    return true;
  }

  // v501: the round editor autosaves, so back saves and leaves — no question.
  if (_golfEditing && _golfDoneFn && currentSection === "golf") { _golfDoneFn(true); return true; }
  // v500: the course editor, same shape as the others.
  if (_golfEditing && _golfCancelFn) {
    var gfcf = _golfCancelFn;
    confirmDialog("Discard changes?", function(){ gfcf(); }, function(){});
    return true;
  }

  return false;
}

window.addEventListener("popstate", function(e) {
  if (closeTopOverlay()) {
    // Swallow the back-press: restore the history entry the pop consumed
    // instead of switching sections underneath the (now-closed) popup.
    history.pushState({ hearthSection: currentSection || "home" }, "");
    return;
  }
  var sec = (e.state && e.state.hearthSection) || "home";
  _navFromPopstate = true;
  switchSection(sec);
  _navFromPopstate = false;
});

function updateSyncStatus() {
  var btn = document.getElementById("syncBtn");
  var dot = document.getElementById("syncDot");
  var userEl = document.getElementById("hdrUser");
  // v487: green dot = signed in and online; amber = offline or logged out.
  var online = !(typeof navigator !== "undefined" && navigator.onLine === false);
  var state = !online ? "offline" : (isLoggedIn() ? "signed in" : "logged out");
  if (dot) dot.className = "sync-dot" + (state === "signed in" ? " on" : "");
  if (btn) btn.setAttribute("aria-label", "Open sync settings (" + state + ")");
  if (isLoggedIn()) {
    if (btn) { btn.title = hearthUser + (online ? " — signed in" : " — offline"); }
    if (userEl) userEl.textContent = hearthUser;
  } else {
    if (btn) { btn.title = online ? "Sync" : "Sync — offline"; }
    if (userEl) userEl.textContent = "";
  }
}
window.addEventListener("online",  updateSyncStatus);
window.addEventListener("offline", updateSyncStatus);

