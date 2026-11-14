// ── Swipe left/right to switch sub-tabs (Lists/Baby/Track) ──
// Bound to document.body rather than the individual section divs: a section
// div is only as tall as its rendered content, so on a sparse view (e.g. an
// empty Baby > Medicine tab) blank space below the content isn't part of the
// section element and touches there never reached the old per-section
// listeners (was v429's bug — swipe worked inconsistently on short views).
(function() {
  var startX = 0, startY = 0, startT = 0;
  document.body.addEventListener("touchstart", function(e) {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startT = Date.now();
  }, { passive: true });
  document.body.addEventListener("touchend", function(e) {
    var dx = e.changedTouches[0].clientX - startX;
    var dy = e.changedTouches[0].clientY - startY;
    var dt = Date.now() - startT;
    // Require: mostly horizontal, decent distance, reasonably quick
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6 || dt > 600) return;
    var dir = dx < 0 ? 1 : -1; // swipe left → next tab, right → previous
    var tabs, idx;
    if (currentSection === "lists") {
      // Don't swipe-switch while a sheet/overlay is open
      var sheet = document.getElementById("itemSheet");
      if (sheet && sheet.style.display === "block") return;
      tabs = Array.prototype.filter.call(
        document.querySelectorAll("#typeBar .type-btn"),
        function(b){ return b.style.display !== "none"; }
      );
      idx = tabs.findIndex(function(b){ return b.dataset.lt === currentList; });
      if (idx < 0) return;
    } else if (currentSection === "baby") {
      // Don't swipe-switch while the tooth-tap modal is open
      var toothModal = document.getElementById("toothModal");
      if (toothModal && toothModal.classList.contains("open")) return;
      tabs = Array.prototype.filter.call(
        document.querySelectorAll(".baby-subnav .bsn-btn"),
        function(b){ return b.style.display !== "none"; }
      );
      idx = tabs.findIndex(function(b){ return b.dataset.bview === currentBabyView; });
      if (idx < 0) return;
    } else if (currentSection === "track") {
      tabs = Array.prototype.filter.call(
        document.querySelectorAll("#trackSubNav .tsn-btn"),
        function(b){ return b.style.display !== "none"; }
      );
      idx = tabs.findIndex(function(b){ return b.dataset.tview === currentTrackView; });
      if (idx < 0) return;
    } else {
      return;
    }
    var next = idx + dir;
    if (next < 0 || next >= tabs.length) return; // no wraparound
    tabs[next].click();
  }, { passive: true });
})();

document.getElementById("syncBtn").addEventListener("click", function() {
  renderSyncModal();
  document.getElementById("syncOverlay").classList.add("open");
});

document.getElementById("syncApiKeySaveBtn").addEventListener("click", function() {
  var key = document.getElementById("syncApiKeyInput").value.trim();
  if (!key || !key.startsWith("AIza")) { toast("Enter a valid Web API Key (starts with AIza)"); return; }
  hearthApiKey = key;
  storeSet("hearth_apikey", hearthApiKey);
  var apiStatus = document.getElementById("syncApiKeyStatus");
  if (apiStatus) { apiStatus.textContent = "✓ API key saved — log out and back in to activate"; apiStatus.style.color = "#2D6B35"; }
  toast("API key saved — log out and back in to activate Firebase Auth");
});

document.getElementById("syncClose").addEventListener("click", function() {
  document.getElementById("syncOverlay").classList.remove("open");
});

document.getElementById("syncOverlay").addEventListener("click", function(e) {
  if (e.target === this) this.classList.remove("open");
});

function renderSyncModal() {
  var loggedIn   = isLoggedIn();
  var inHousehold = isHouseholdSet();

  // API key section
  var apiInput = document.getElementById("syncApiKeyInput");
  var apiStatus = document.getElementById("syncApiKeyStatus");
  if (apiInput && hearthApiKey) apiInput.value = hearthApiKey;
  if (apiStatus) {
    apiStatus.textContent = hearthApiKey ? "✓ API key set — Firebase Auth enabled" : "No API key — using legacy login";
    apiStatus.style.color  = hearthApiKey ? "#2D6B35" : "#8A7A60";
  }

  // Firebase URL section
  var fbSection = document.getElementById("loginFbSection");
  if (fbSection) {
    fbSection.style.opacity = "1";
    fbSection.style.pointerEvents = "auto";
    var fi = document.getElementById("loginFbInput");
    if (fi && hearthFbId) fi.value = hearthFbId;
    var ok = document.getElementById("loginFbOk");
    if (ok) ok.style.display = hearthFbId ? "block" : "none";
  }

  // Account section
  var acSection = document.getElementById("loginStepAccount");
  if (acSection) {
    acSection.style.opacity = hearthFbId ? "1" : "0.4";
    acSection.style.pointerEvents = hearthFbId ? "auto" : "none";
  }

  // Sync status label
  var statusEl = document.getElementById("syncStatusLabel");
  if (statusEl) {
    if (loggedIn) {
      statusEl.textContent = "Signed in as " + hearthUser;
      statusEl.style.color = "#2D6B35";
    } else {
      statusEl.textContent = "Not signed in";
      statusEl.style.color = "#8A7A60";
    }
  }

  // Sync toggles
  var togglesEl = document.getElementById("syncToggles");
  if (togglesEl) {
    togglesEl.style.display = loggedIn ? "" : "none";
  }

  // Household section
  var hhConnected = document.getElementById("syncHouseholdConnected");
  var hhSetup     = document.getElementById("syncHouseholdSetup");
  if (hhConnected && hhSetup) {
    if (inHousehold) {
      hhConnected.style.display = "block";
      hhSetup.style.display     = "none";
      var codeDisplay = document.getElementById("syncHouseholdCodeDisplay");
      if (codeDisplay) codeDisplay.textContent = hearthHouse;
      var hhInput = document.getElementById("joinHouseholdInput");
      if (hhInput) hhInput.value = hearthHouse;
    } else {
      hhConnected.style.display = "none";
      hhSetup.style.display     = "block";
    }
  }

  // Sync checkboxes state
  document.querySelectorAll(".sync-chk").forEach(function(chk) {
    chk.checked = isSynced(chk.dataset.key);
  });
  document.querySelectorAll(".section-chk").forEach(function(chk) {
    chk.checked = sectionVisible[chk.dataset.sec] !== false;
  });
}

// v348: cap a SORTED (count-desc, lastUsed-desc) hist array to 150 entries,
// exempting any entry whose name matches a current list item (active or Done)
// — stops the 150-cap from pruning history for things still visibly on the
// list (the "blueberries" cap-pruning root cause, see HEARTH-notes). A v323
// deletion tombstone still beats this protection; that's handled before this
// runs. Hist can exceed 150 by at most the list's item count.
function capHistToLiveLimit(sortedHist, items) {
  if (sortedHist.length <= 150) return sortedHist;
  var liveNames = {};
  (items || []).forEach(function(it){ if (it && it.name) liveNames[it.name.toLowerCase()] = true; });
  var protectedCount = 0;
  sortedHist.forEach(function(h){ if (h && h.name && liveNames[h.name.toLowerCase()]) protectedCount++; });
  var unprotectedBudget = Math.max(0, 150 - protectedCount), unprotectedSeen = 0;
  return sortedHist.filter(function(h){
    if (!h || !h.name) return false;
    if (liveNames[h.name.toLowerCase()]) return true;
    if (unprotectedSeen < unprotectedBudget) { unprotectedSeen++; return true; }
    return false;
  });
}
function mergeHist(existing, incoming, histTombs, items) {
  // v323: drop entries deleted at/after their last use (same rule as
  // mergeListItems) — an entry re-added after deletion has a fresher lastUsed
  // than the tombstone and survives.
  var tombs = histTombs || {};
  var live = function(h){ return h && h.name && !(tombs[String(h.name).toLowerCase()] >= (h.lastUsed || 0)); };
  var merged = (existing || []).filter(live);
  var existingNames = {};
  merged.forEach(function(h){ existingNames[h.name.toLowerCase()] = true; });
  (incoming || []).forEach(function(h){
    if (live(h) && !existingNames[h.name.toLowerCase()]) merged.push(h);
  });
  merged.sort(function(a,b){ return (b.count - a.count)||(b.lastUsed - a.lastUsed); });
  return capHistToLiveLimit(merged, items);
}

function saveNotes(notes, lt) {
  var key = lt || currentList;
  storeSet("fl4_notes_" + key, notes);
}

function getNotes(lt) {
  var key = lt || currentList;
  var v = storeGet("fl4_notes_" + key);
  return Array.isArray(v) ? v : [];
}

// ── Calorie estimate for training sessions ────────────────
function latestBodyweightKg() {
  var bw = (getWD().bodyweight||[]).filter(function(e){ return trackPersonOf(e) === "me"; });
  return bw.length ? (bw[0].weight || 70) : 70;
}
function estimateSessionKcal(met, minutes) {
  if (!minutes || minutes <= 0) return 0;
  return Math.round(met * latestBodyweightKg() * minutes / 60);
}

function openPhysioSession(progIdx) {
  SS = { type:"physio", pProgIdx:progIdx, pExIdx:0, pSetNum:1, pTime:0, pRunning:false, pPhase:"intro" };
  // Read ONCE here, like SS.yFlow: nothing downstream may go back to the
  // stored pref, so a session runs at the level it was begun at.
  SS.pLevel = PROGRAMMES_TRAIN[progIdx].levels ? physioLevelPref() : "full";
  openSessionOverlay(PROGRAMMES_TRAIN[progIdx].name.replace(/&amp;/g,"&"));
  document.getElementById("sesProgFill").style.background = "#14b8a6";
  renderPhysioSession();
}

function fmtDate(ts) {
  var d = new Date(ts);
  var p = function(x){ return x < 10 ? "0"+x : x; };
  return d.getDate()+"/"+p(d.getMonth()+1)+"/"+d.getFullYear()+" "+p(d.getHours())+":"+p(d.getMinutes());
}

document.getElementById("bnHome").addEventListener("click",  function(){ switchSection("home");  });
document.getElementById("bnLife").addEventListener("click",  function(){ switchSection("lists"); });

// ── More sheet (v452) ─────────────────────────────────────
document.getElementById("bnMore").addEventListener("click", function(){
  renderMoreSheet();
  document.getElementById("moreOverlay").classList.add("open");
});
document.getElementById("moreClose").addEventListener("click", closeMoreSheet);
document.getElementById("moreOverlay").addEventListener("click", function(e){ if (e.target === this) closeMoreSheet(); });
document.getElementById("moreList").addEventListener("click", function(e){
  var row = e.target.closest(".more-row");
  if (!row) return;
  closeMoreSheet();
  // Click the section's OWN nav button rather than calling switchSection here:
  // several of them reset view state first (bnWatch clears _watchView, bnHealth
  // clears _healthView, ...) and reimplementing that is how the two drift.
  var btn = document.getElementById(navIdForSection(row.dataset.sec));
  if (btn) btn.click();
});
document.getElementById("bnTrain").addEventListener("click", function(){ switchSection("train"); });
document.getElementById("bnRecipes").addEventListener("click", function(){ switchSection("recipes"); });
document.getElementById("recipeNewBtn").addEventListener("click", function(){ _recipeView="detail"; openRecipeEditor(null); });
document.getElementById("tripNewBtn").addEventListener("click", function(){ openTripEditor(null); });
document.getElementById("tripImportBtn").addEventListener("click", function(){ _tripImporting = true; _tripView = "list"; renderTrips(); window.scrollTo(0,0); });
// Trips → Travel packing list (v318, deferred v275 item). Clicking the
// type-btn reuses the full typeBar switch handler (filter/search resets etc.).
document.getElementById("tripPackingBtn").addEventListener("click", function(){
  switchSection("lists");
  var tb = document.querySelector('.type-btn[data-lt="travel"]');
  if (tb) tb.click();
});
function closeRecipeImport(){
  var sh = document.getElementById("recipeImportSheet"), bd = document.getElementById("recipeImportBackdrop");
  if (sh) sh.style.display = "none";
  if (bd) bd.style.display = "none";
  document.body.style.overflow = "";
}
(function wireRecipeImport(){
  function wire(){
  var importBtn = document.getElementById("recipeImportBtn");
  if (importBtn) importBtn.addEventListener("click", function(){
    var t = document.getElementById("recipeImportText"); if (t) t.value = "";
    var p = document.getElementById("recipeImportPreview"); if (p) p.textContent = "";
    var pt = document.getElementById("recipePromptText"); if (pt) pt.value = recipeAIPrompt();
    var sh = document.getElementById("recipeImportSheet"); if (sh) sh.style.display = "block";
    var bd = document.getElementById("recipeImportBackdrop"); if (bd) bd.style.display = "block";
    document.body.style.overflow = "hidden";
  });
  var copyBtn = document.getElementById("recipeCopyPrompt");
  if (copyBtn) copyBtn.addEventListener("click", recipeCopyPrompt);
  var closeBtn = document.getElementById("recipeImportClose");
  if (closeBtn) closeBtn.addEventListener("click", closeRecipeImport);
  var cancelBtn = document.getElementById("recipeImportCancel");
  if (cancelBtn) cancelBtn.addEventListener("click", closeRecipeImport);
  var bdrop = document.getElementById("recipeImportBackdrop");
  if (bdrop) bdrop.addEventListener("click", closeRecipeImport);
  var ta = document.getElementById("recipeImportText");
  if (ta) ta.addEventListener("input", function(){
    var txt = this.value.trim();
    var prev = document.getElementById("recipeImportPreview");
    if (!prev) return;
    if (!txt) { prev.textContent = ""; return; }
    try {
      var res = recipesFromImportText(txt);
      if (res.error) { prev.textContent = res.error; return; }
      prev.textContent = res.recipes.length + " recipe" + (res.recipes.length!==1?"s":"") + " found" +
        (res.tidied ? " · " + res.tidied + " ingredient line" + (res.tidied!==1?"s":"") + " tidied" : "") +
        (res.skipped ? ", " + res.skipped + " row(s) skipped" : "");
    } catch(e) { prev.textContent = "Couldn't read that — check it's CSV or the AI's JSON reply."; }
  });
  var doBtn = document.getElementById("recipeImportDo");
  if (doBtn) doBtn.addEventListener("click", function(){
    var ta2 = document.getElementById("recipeImportText");
    var txt = ta2 ? ta2.value.trim() : "";
    if (!txt) { toast("Paste some CSV or the AI's reply first"); return; }
    var res;
    try { res = recipesFromImportText(txt); }
    catch(e) { toast("Couldn't parse that"); return; }
    if (res.error) { toast(res.error); return; }
    if (!res.recipes.length) { toast("No importable recipes found"); return; }
    var rb = getRecipeBook();
    var have = {};
    rb.forEach(function(r){ if(r) have[r.name.toLowerCase()] = true; });
    var added = 0, dupes = 0;
    res.recipes.forEach(function(r){
      if (have[r.name.toLowerCase()]) { dupes++; return; }
      have[r.name.toLowerCase()] = true;
      rb.push(r); added++;
    });
    saveRecipeBook(rb);
    closeRecipeImport();
    _recipeView = "list"; renderRecipes();
    toast("Imported " + added + " recipe" + (added!==1?"s":"") + (dupes ? " (" + dupes + " already there)" : ""));
  });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
document.getElementById("bnBaby").addEventListener("click",  function(){ switchSection("baby");  });
document.getElementById("bnTrips").addEventListener("click", function(){ switchSection("trips"); });
document.getElementById("bnTrack").addEventListener("click", function(){ switchSection("track"); });
document.getElementById("bnSports").addEventListener("click", function(){ switchSection("sports"); });
document.getElementById("bnFamlog").addEventListener("click", function(){ switchSection("famlog"); });
document.getElementById("bnPlants").addEventListener("click", function(){ _plantView = "list"; _plantOpenId = null; _plantImporting = false; _plantImportParsed = null; switchSection("plants"); });
document.getElementById("bnWatch").addEventListener("click", function(){ _watchView = "list"; _watchEditId = null; _watchOpenId = null; switchSection("watch"); });
document.getElementById("bnAppliances").addEventListener("click", function(){ _applView = "list"; _applEditId = null; _applOpenId = null; _applImportParsed = null; switchSection("appliances"); });
// v450: v449 shipped the Health section with a nav button, a visibility toggle,
// a switchSection branch and a title branch — and no click handler, so the icon
// appeared and did nothing. Every other button in the bar had one; this is the
// line that was missing. See tests/cases/01-boot-smoke.js for the assertion that
// now makes a dead nav button impossible to ship again.
document.getElementById("bnHealth").addEventListener("click", function(){ _healthView = "list"; _healthEditId = null; _healthOpenId = null; switchSection("health"); });
document.getElementById("applNewBtn").addEventListener("click", function(){ openApplianceEditor(null); });
document.getElementById("watchNewBtn").addEventListener("click", function(){ openWatchEditor(null); });
document.getElementById("watchRandomBtn").addEventListener("click", watchRandomPick);
document.getElementById("hlNewBtn").addEventListener("click", function(){ openHealthEditor(null); });
// v499: the click handler v449 forgot for Health — written with the button this time.
document.getElementById("bnProjects").addEventListener("click", function(){ _projView = "list"; _projEditId = null; _projItemId = null; _projOpenId = null; _projImportParsed = null; switchSection("projects"); });
document.getElementById("projNewBtn").addEventListener("click", function(){ openProjectEditor(null); });
// v512: Import a plan, from the header ⋯ sheet. An open editor is unsaved
// work, so it asks first (the golf importer's rule).
document.getElementById("projImportBtn").addEventListener("click", function(){
  if (_projEditing && _projCancelFn && _projView !== "import") {
    confirmDialog("Discard changes?", function(){ openProjectImport(); }, function(){});
    return;
  }
  openProjectImport();
});
document.getElementById("bnGolf").addEventListener("click", function(){ _golfView = "list"; _golfEditId = null; switchSection("golf"); });
document.getElementById("golfNewBtn").addEventListener("click", golfNewRound);
// v502: Import a course, from the header ⋯ sheet. A round being scored is
// already saved (v501 autosave), so it is closed quietly first.
document.getElementById("golfImportBtn").addEventListener("click", function(){
  if (_golfEditing && _golfDoneFn) _golfDoneFn(true);
  if (_golfEditing && _golfCancelFn && _golfView === "course") {
    confirmDialog("Discard changes?", function(){ openGolfImport(); }, function(){});
    return;
  }
  openGolfImport();
});
// v501: a round being scored is saved on every tap; this catches a notes or
// handicap field still being typed when the screen sleeps or the app is
// switched away (a PWA the OS later kills never gets a chance otherwise).
document.addEventListener("visibilitychange", function(){
  if (document.hidden && _golfAutoSave) { try { _golfAutoSave(); } catch (e) { console.warn("golf autosave failed:", e); } }
});
document.getElementById("plantNewBtn").addEventListener("click", function(){ openPlantEditor(null); window.scrollTo(0, 0); });
// v496: header ⋯ opens the section's rarely used actions. The buttons inside
// keep their original ids and click handlers; this only opens and closes the sheet.
(function(){
  var ov = document.getElementById("secToolsOverlay");
  function closeSecTools(){ ov.classList.remove("open"); }
  Array.prototype.forEach.call(document.querySelectorAll(".hdr-more"), function(btn){
    btn.addEventListener("click", function(){
      var sec = btn.getAttribute("data-tools");
      Array.prototype.forEach.call(ov.querySelectorAll(".sec-tools"), function(g){
        g.style.display = g.getAttribute("data-sec") === sec ? "block" : "none";
      });
      ov.classList.add("open");
    });
  });
  Array.prototype.forEach.call(ov.querySelectorAll(".sec-tools button"), function(b){ b.addEventListener("click", closeSecTools); });
  document.getElementById("secToolsClose").addEventListener("click", closeSecTools);
  ov.addEventListener("click", function(e){ if (e.target === ov) closeSecTools(); });
})();
document.getElementById("plantImportBtn").addEventListener("click", function(){
  _plantImporting = true; _plantImportParsed = null;
  _plantView = "list"; _plantOpenId = null;
  renderPlants(); window.scrollTo(0, 0);
});

