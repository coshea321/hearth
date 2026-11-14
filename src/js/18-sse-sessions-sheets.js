// ── SSE: personal sync listener ───────────────────────────
var hearthHealthES = null;
// ── SSE stale-connection fallback — full fetch every 5 minutes ───────────────
var _sseFallbackTimer = null;
function startSSEFallback() {
  if (_sseFallbackTimer) clearInterval(_sseFallbackTimer);
  _sseFallbackTimer = setInterval(function() {
    if (!isLoggedIn()) return;
    // Only fetch if SSE appears stale (not connected or no recent events)
    var personalStale = !hearthHealthES || hearthHealthES.readyState !== 1;
    var householdStale = isHouseholdSet() && (!hearthSyncES || hearthSyncES.readyState !== 1);
    if (personalStale) {
      console.log("SSE personal stale — falling back to fetch");
      fetchPersonal();
      startPersonalListening();
    }
    if (householdStale) {
      console.log("SSE household stale — falling back to fetch");
      fetchHousehold();
      startListening();
    }
  }, 5 * 60 * 1000); // every 5 minutes
}

var _personalReconnectPending = false;
function schedulePersonalReconnect() {
  if (_personalReconnectPending) return;
  _personalReconnectPending = true;
  setTimeout(function(){ _personalReconnectPending = false; if (isLoggedIn()) startPersonalListening(); }, 5000);
}
function startPersonalListening() {
  if (_isTestBuild) return;
  if (!isLoggedIn()) return;
  if (hearthHealthES) { hearthHealthES.close(); hearthHealthES = null; }
  getAuthToken(function(token, reason) {
    if (hearthApiKey && !token) {
      if (reason === "missing" || reason === "rejected") setSyncLoginNeeded(true);
      else if (reason === "network") schedulePersonalReconnect();
      return;
    }
    var url = userUrl("/data") + (token ? "?auth=" + token : "");
    hearthHealthES = new EventSource(url);
    hearthHealthES.addEventListener("put",   handlePersonalEvent);
    hearthHealthES.addEventListener("patch", handlePersonalEvent);
    hearthHealthES.onerror = function() {
      if (hearthHealthES && hearthHealthES.readyState === 2) schedulePersonalReconnect();
    };
  });
}
function handlePersonalEvent(e) {
  // Apply immediately (see handleHouseholdEvent) — the merges are clobber-proof.
  try {
    _syncStats.lastEvent = Date.now();
    var p = JSON.parse(e.data);
    // v411: a "put" IS a successful read of the remote node (Firebase sends the
    // whole node as the first put on every connect), so it satisfies the same
    // guard fetchPersonal() sets. Without this, a first fetch that failed on a
    // network blip followed by a healthy stream left the device RECEIVE-ONLY
    // for the rest of the session: pushPersonal() bails while _personalFetchOk
    // is false, the stream never called fetchPersonal again (startSSEFallback
    // only re-fetches when SSE is STALE), and nothing else set the flag.
    // Set before the p.data guard below — an empty remote is still a real read.
    if (e.type === "put") { _personalFetchOk = true; setSyncLoginNeeded(false); }
    if (e.type === "put" && p.data && typeof p.data === "object") {
      syncPaused = false;
      applyPersonal(p.data);
    } else if (e.type === "patch") {
      fetchPersonal();
    }
  } catch(err) { console.warn("SSE personal event error:", err); }
}

// ── SSE: household sync listener ──────────────────────────
var hearthSyncES = null;
var _householdReconnectPending = false;
function scheduleHouseholdReconnect() {
  if (_householdReconnectPending) return;
  _householdReconnectPending = true;
  setTimeout(function(){ _householdReconnectPending = false; if (isHouseholdSet()) startListening(); }, 5000);
}
function startListening() {
  if (_isTestBuild) return;
  if (!isHouseholdSet()) return;
  if (hearthSyncES) { hearthSyncES.close(); hearthSyncES = null; }
  getAuthToken(function(token, reason) {
    if (hearthApiKey && !token) {
      if (reason === "missing" || reason === "rejected") setSyncLoginNeeded(true);
      else if (reason === "network") scheduleHouseholdReconnect();
      return;
    }
    var url = houseUrl("/shared") + (token ? "?auth=" + token : "");
    hearthSyncES = new EventSource(url);
    hearthSyncES.addEventListener("put",   handleHouseholdEvent);
    hearthSyncES.addEventListener("patch", handleHouseholdEvent);
    hearthSyncES.onerror = function() {
      if (hearthSyncES && hearthSyncES.readyState === 2) scheduleHouseholdReconnect();
    };
  });
}
function handleHouseholdEvent(e) {
  // Apply incoming sync immediately. The v245 list/recipe merges (union by id +
  // newest-wins + deletion tombstones) preserve local unpushed changes and make
  // our own echo an idempotent no-op, so no grace window / bounce guard is needed.
  try {
    _syncStats.lastEvent = Date.now();
    var p = JSON.parse(e.data);
    if (e.type === "put" && p.data && typeof p.data === "object") {
      // v419: a live stream delivering household data is proof we can read it —
      // open the push guard here too, or a device whose first fetch failed on a
      // blip stays receive-only for the whole session (the v411 lesson, ①).
      _householdFetchOk = true;
      applyHousehold(p.data);
    } else if (e.type === "patch") {
      fetchHousehold();
    }
  } catch(err) { console.warn("SSE household event error:", err); }
}

// ── Session body click delegation ─────────────────────────
document.getElementById("sesBody").addEventListener("click", function(e) {
  var btn = e.target.closest("[data-action]");
  if (!btn) return;
  var action = btn.dataset.action;
  if (action === "togglePhysioTimer") { togglePhysioTimer(); }
  else if (action === "physioNext")   { physioNext(); }
  else if (action === "physioPrev")   { physioPrev(); }
  else if (action === "skipYogaPose") { skipYogaPose(); }
  else if (action === "prevYogaPose") { prevYogaPose(); }
  else if (action === "toggleYogaPause") { toggleYogaPause(); }
});

// ── prevYogaPose — go back one pose ───────────────────────
function prevYogaPose() {
  if (SS.yPoseIdx > 0) {
    SS.yPoseIdx--;
    var flow = SS.yFlow;
    SS.yTime = flow[SS.yPoseIdx].dur;
    SS.yPaused = false;
    clearST();
    startYogaTimer();
    renderYogaSession();
  }
}

// ── physioPrev — go back one exercise/set ─────────────────
function physioPrev() {
  var prog = PROGRAMMES_TRAIN[SS.pProgIdx];
  clearST(); SS.pRunning = false;
  if (SS.pSetNum > 1) {
    // Go back a set
    SS.pSetNum--;
    var ex = prog.exercises[SS.pExIdx];
    if (ex.type === "timed") SS.pTime = ex.dur;
  } else if (SS.pExIdx > 0) {
    // Go back an exercise
    SS.pExIdx--;
    var ex2 = prog.exercises[SS.pExIdx];
    SS.pSetNum = physioSetsOf(ex2);
    if (ex2.type === "timed") SS.pTime = ex2.dur;
  }
  renderPhysioSession();
}
// ── Cardio log ────────────────────────────────────────────
var cardioActivity = null;

document.getElementById("cardioChips").addEventListener("click", function(e) {
  var chip = e.target.closest(".cardio-chip");
  if (!chip) return;
  document.querySelectorAll(".cardio-chip").forEach(function(c){ c.classList.remove("sel"); });
  chip.classList.add("sel");
  cardioActivity = { name: chip.dataset.activity, met: parseFloat(chip.dataset.met), ico: chip.dataset.ico };
  document.getElementById("cardioCustomName").value = "";
  updateCardioEst();
});

document.getElementById("cardioCustomName").addEventListener("input", function() {
  if (this.value.trim()) {
    document.querySelectorAll(".cardio-chip").forEach(function(c){ c.classList.remove("sel"); });
    cardioActivity = { name: this.value.trim(), met: 5.0, ico: "&#x1F3C3;" };
  }
  updateCardioEst();
});

document.getElementById("cardioDuration").addEventListener("input", updateCardioEst);
document.getElementById("cardioCalories").addEventListener("input", updateCardioEst);

function updateCardioEst() {
  var dur = parseFloat(document.getElementById("cardioDuration").value) || 0;
  var calEl = document.getElementById("cardioCalories");
  var estEl = document.getElementById("cardioEst");
  if (cardioActivity && dur > 0 && !calEl.value) {
    var est = estimateSessionKcal(cardioActivity.met, dur);
    estEl.textContent = "Est. ~" + est + " kcal";
    calEl.placeholder = "~" + est;
  } else { estEl.textContent = ""; calEl.placeholder = ""; }
}

document.getElementById("cardioLogBtn").addEventListener("click", function() {
  if (btnBusy(this)) return;
  var name = (cardioActivity && cardioActivity.name) || document.getElementById("cardioCustomName").value.trim();
  if (!name) { toast("Select or type an activity"); return; }
  var dur = parseFloat(document.getElementById("cardioDuration").value) || 0;
  var cal = parseFloat(document.getElementById("cardioCalories").value) ||
            (cardioActivity && dur ? estimateSessionKcal(cardioActivity.met, dur) : 0);
  if (!dur && !cal) { toast("Enter duration or calories"); return; }
  var entry = { id:Date.now(), ts:Date.now(), date:workoutDate, type:"cardio",
    activity:name, ico:(cardioActivity&&cardioActivity.ico)||"&#x1F3C3;",
    duration:dur, calories:cal };
  var al = getActionLog(); al.unshift(entry); storeSet("fl4_action_log", al);
  pushPersonal();
  document.getElementById("cardioDuration").value = "";
  document.getElementById("cardioCalories").value = "";
  document.getElementById("cardioEst").textContent = "";
  document.querySelectorAll(".cardio-chip").forEach(function(c){ c.classList.remove("sel"); });
  cardioActivity = null;
  renderCardioLog();
  toast((entry.ico||"&#x1F3C3;")+" "+name+" logged!");
});

function renderCardioLog() {
  var el = document.getElementById("cardioHistory"); if (!el) return;
  var entries = getActionLog().filter(function(e){ return e&&e.type==="cardio"&&e.date===workoutDate; });
  if (!entries.length) { el.innerHTML = ""; return; }
  var html = "<div style=\'margin-top:10px\'>";
  entries.forEach(function(e) {
    html += "<div class=\'cardio-entry\'><span class=\'cardio-entry-ico\'>"+(e.ico||"&#x1F3C3;")+"</span>" +
      "<div style=\'flex:1\'><div style=\'font-size:14px;font-weight:600;color:#3A3328\'>"+esc(e.activity||"")+"</div>" +
      "<div style=\'font-size:12px;color:#8A7A5A\'>"+(e.duration?e.duration+" min":"")+
      (e.duration&&e.calories?" · ":"")+(e.calories?e.calories+" kcal":"")+"</div></div>" +
      "<button data-cardio-id=\'"+e.id+"\' style=\'border:none;background:none;color:#C06060;font-size:14px;cursor:pointer;opacity:.5\'>&#x2715;</button></div>";
  });
  html += "</div>";
  el.innerHTML = html;
  el.querySelectorAll("[data-cardio-id]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      confirmDialog("Delete this cardio entry?", function(){
      addTomb("action_log", +btn.dataset.cardioId);
      storeSet("fl4_action_log", getActionLog().filter(function(e){ return e&&e.id!==+btn.dataset.cardioId; }));
      pushPersonal(); renderCardioLog();
      });
    });
  });
}

// ── Item detail sheet ─────────────────────────────────────
var _sheetItemId = null;
var _sheetTags = [];

function openItemSheet(itemId) {
  var items = getItems();
  var item  = items.find(function(x){ return x.id === itemId; });
  if (!item) return;
  _sheetItemId = itemId;
  document.getElementById("itemSheetNameInput").value = item.name || "";
  document.getElementById("itemSheetNotes").value     = item.notes || "";
  document.getElementById("itemSheetLink").value      = item.link || "";
  // Tags (Travel list only)
  var tagsWrap = document.getElementById("itemSheetTagsWrap");
  if (tagsWrap) {
    if (currentList === "travel") {
      tagsWrap.style.display = "block";
      _sheetTags = Array.isArray(item.tags) ? item.tags.slice() : [];
      var _nt = document.getElementById("itemSheetNewTag"); if (_nt) _nt.value = "";
      renderItemSheetTags();
    } else {
      tagsWrap.style.display = "none";
      _sheetTags = [];
    }
  }
  // Per-person checks opt-in (Travel list only, v326)
  var ppWrap = document.getElementById("itemSheetPPWrap");
  if (ppWrap) {
    ppWrap.style.display = currentList === "travel" ? "block" : "none";
    var ppTog = document.getElementById("itemSheetPPToggle");
    if (ppTog) ppTog.checked = !!(item.checks && typeof item.checks === "object");
  }
  // Amount only relevant for Grocery
  var amtRow = document.getElementById("itemSheetAmountRow");
  if (amtRow) {
    amtRow.style.display = currentList === "grocery" ? "block" : "none";
    document.getElementById("itemSheetAmountInput").value = item.amount || "";
  }
  // Due date only relevant for task-type lists
  var dueRow = document.getElementById("itemSheetDueRow");
  var isTask = currentList === "todo" || currentList === "personal";
  if (dueRow) dueRow.style.display = isTask ? "block" : "none";
  document.getElementById("itemSheetDueInput").value = item.dueDate || "";
  // Repeat picker (General/Personal only, v361)
  var repeatRow = document.getElementById("itemSheetRepeatRow");
  if (repeatRow) repeatRow.style.display = isTask ? "block" : "none";
  var repeatSel = document.getElementById("itemSheetRepeatSelect");
  if (repeatSel) repeatSel.value = (item.repeat && REPEAT_OPTS[item.repeat]) ? item.repeat : "";
  updateRepeatSelState();
  // Track auto-logging opt-in (General/Personal only)
  var trackLogWrap = document.getElementById("itemSheetTrackLogWrap");
  if (trackLogWrap) trackLogWrap.style.display = isTask ? "block" : "none";
  var trackLogTog = document.getElementById("itemSheetTrackLogToggle");
  if (trackLogTog) trackLogTog.checked = !!item.trackLog;

  document.getElementById("itemSheet").style.display         = "block";
  document.getElementById("itemSheetBackdrop").style.display = "block";
  document.body.style.overflow = "hidden";
  setTimeout(function(){ document.getElementById("itemSheetNameInput").focus(); }, 150);
}

function closeItemSheet() {
  document.getElementById("itemSheet").style.display         = "none";
  document.getElementById("itemSheetBackdrop").style.display = "none";
  document.body.style.overflow = "";
  _sheetItemId = null;
}

// v361: repeating needs a due date to anchor to — the picker stays disabled (and resets to
// "Doesn't repeat") until one is set. Top-level: called from openItemSheet + the due-input listeners.
function updateRepeatSelState() {
  var sel = document.getElementById("itemSheetRepeatSelect");
  if (!sel) return;
  var due = document.getElementById("itemSheetDueInput").value;
  sel.disabled = !due;
  sel.style.opacity = due ? "1" : ".5";
  if (!due) sel.value = "";
}

function closeImport() {
  document.getElementById("importSheet").style.display    = "none";
  document.getElementById("importBackdrop").style.display = "none";
  document.body.style.overflow = "";
}

window.addEventListener("DOMContentLoaded", function() {
  document.getElementById("itemSheetClose").addEventListener("click", closeItemSheet);
  document.getElementById("itemSheetBackdrop").addEventListener("click", closeItemSheet);
  document.getElementById("itemSheetDueClear").addEventListener("click", function() {
    document.getElementById("itemSheetDueInput").value = "";
    updateRepeatSelState();
  });
  // v361: repeat picker enables/disables live as the due date is set/cleared
  document.getElementById("itemSheetDueInput").addEventListener("input",  updateRepeatSelState);
  document.getElementById("itemSheetDueInput").addEventListener("change", updateRepeatSelState);

  // ── List import ──────────────────────────────────────────
  // ── Saved recipes (Grocery only) ─────────────────────────
  function getRecipes() { return storeGet("fl4_recipes") || []; }
  function saveRecipes(r) { storeSet("fl4_recipes", r); }
  function upsertRecipe(name, lines) {
    if (!name || !lines.length) return;
    var r = getRecipes();
    var i = r.findIndex(function(x){ return x.name.toLowerCase() === name.toLowerCase(); });
    var rec = { name: name, lines: lines, updated: Date.now() };
    if (i >= 0) r[i] = rec; else r.unshift(rec);
    saveRecipes(r);
  }
  function renderSavedRecipes() {
    var wrap = document.getElementById("savedRecipesWrap");
    var list = document.getElementById("savedRecipesList");
    if (!wrap || !list) return;
    // Grocery only
    if (currentList !== "grocery") { wrap.style.display = "none"; return; }
    var r = getRecipes();
    if (!r.length) { wrap.style.display = "none"; return; }
    wrap.style.display = "block";
    list.innerHTML = "";
    r.forEach(function(rec){
      var chip = document.createElement("span");
      chip.style.cssText = "display:inline-flex;align-items:center;gap:5px;background:#E6DBF5;color:#6A3CB0;border-radius:14px;padding:5px 6px 5px 11px;font-size:13px;font-weight:600";
      var label = document.createElement("button");
      label.textContent = "🍽 " + rec.name;
      label.style.cssText = "border:none;background:none;color:#6A3CB0;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:0";
      label.addEventListener("click", function(){
        document.getElementById("importTag").value = rec.name;
        document.getElementById("importText").value = rec.lines.join("\n");
      });
      var del = document.createElement("button");
      del.innerHTML = "&#x2715;";
      del.setAttribute("aria-label", "Delete recipe " + rec.name);
      del.style.cssText = "border:none;background:rgba(106,60,176,.15);color:#6A3CB0;border-radius:50%;width:18px;height:18px;font-size:11px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0";
      del.addEventListener("click", function(e){
        e.stopPropagation();
        confirmDialog("Delete saved recipe \"" + esc(rec.name) + "\"?", function(){
          saveRecipes(getRecipes().filter(function(x){ return x.name.toLowerCase() !== rec.name.toLowerCase(); }));
          renderSavedRecipes();
        });
      });
      chip.appendChild(label); chip.appendChild(del);
      list.appendChild(chip);
    });
  }

  function openImport() {
    if (currentList === "notes") return;
    document.getElementById("importText").value = "";
    var _itag = document.getElementById("importTag"); if (_itag) _itag.value = "";
    renderSavedRecipes();
    document.getElementById("importSheet").style.display    = "block";
    document.getElementById("importBackdrop").style.display = "block";
    document.body.style.overflow = "hidden";
    setTimeout(function(){ document.getElementById("importText").focus(); }, 150);
  }
  var importLink = document.getElementById("importLink");
  if (importLink) importLink.addEventListener("click", openImport);

  // ── List search (toggleable, fuzzy) ──────────────────────
  var searchLink = document.getElementById("searchLink");
  var searchRow = document.getElementById("searchRow");
  var searchInput = document.getElementById("listSearchInput");
  if (searchLink && searchRow && searchInput) {
    searchLink.addEventListener("click", function() {
      var showing = searchRow.style.display !== "none";
      if (showing) {
        searchRow.style.display = "none";
        _listSearchQuery = ""; searchInput.value = "";
        renderList();
      } else {
        searchRow.style.display = "block";
        setTimeout(function(){ searchInput.focus(); }, 100);
      }
    });
    searchInput.addEventListener("input", function() {
      _listSearchQuery = searchInput.value.trim();
      renderList();
    });
    document.getElementById("searchClearBtn").addEventListener("click", function() {
      searchInput.value = ""; _listSearchQuery = "";
      renderList(); searchInput.focus();
    });
  }

  // ── Recipe search ─────────────────────────────────────────────
  var rcpSearchBtn = document.getElementById("rcpSearchBtn");
  var rcpSearchRow = document.getElementById("rcpSearchRow");
  var rcpSearchInput = document.getElementById("rcpSearchInput");
  if (rcpSearchBtn && rcpSearchRow && rcpSearchInput) {
    rcpSearchBtn.addEventListener("click", function() {
      var showing = rcpSearchRow.style.display !== "none";
      if (showing) {
        rcpSearchRow.style.display = "none";
        _recipeSearchQuery = ""; rcpSearchInput.value = "";
        renderRecipes();
      } else {
        rcpSearchRow.style.display = "block";
        if (_recipeFilter !== "all") { _recipeFilter = "all"; renderRecipes(); }
        setTimeout(function(){ rcpSearchInput.focus(); }, 100);
      }
    });
    rcpSearchInput.addEventListener("input", function() {
      _recipeSearchQuery = rcpSearchInput.value.trim();
      renderRecipes();
    });
    document.getElementById("rcpSearchClear").addEventListener("click", function() {
      rcpSearchInput.value = ""; _recipeSearchQuery = "";
      renderRecipes(); rcpSearchInput.focus();
    });
  }

  var printLink = document.getElementById("printLink");
  if (printLink) printLink.addEventListener("click", function() {
    if (currentList === "notes") return;
    var listName = (LIST_TYPES[currentList] ? LIST_TYPES[currentList].name : "List").replace(/&#x[0-9A-Fa-f]+;\s*/g, "").trim();
    var cats = getCats();
    var items = getItems().filter(function(x){ return x && !x.done; });
    var groups = {};
    items.forEach(function(it){ (groups[it.catId] = groups[it.catId] || []).push(it); });
    var isTask = currentList === "todo" || currentList === "personal";
    var now = new Date();
    var dateStr = now.toLocaleDateString("en-IE", { weekday:"long", day:"numeric", month:"long", year:"numeric" });

    var body = "";
    cats.forEach(function(c){
      var gi = groups[c.id];
      if (!gi || !gi.length) return;
      body += "<h2>" + catEmojiSafe(c.emoji) + " " + esc(c.name) + "</h2><ul>";
      gi.forEach(function(it){
        var due = (isTask && it.dueDate) ? " <span class='due'>(due " + it.dueDate + ")</span>" : "";
        var note = it.notes ? "<div class='note'>" + esc(it.notes) + "</div>" : "";
        body += "<li><span class='box'></span><span class='nm'>" + esc(it.name) + due + "</span>" + note + "</li>";
      });
      body += "</ul>";
    });
    if (!body) body = "<p class='empty'>No items to print.</p>";

    openPrintDoc(listName,
      "*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;margin:28px;line-height:1.5}" +
      "h1{font-size:22px;margin:0 0 2px}.sub{color:#666;font-size:13px;margin-bottom:18px}" +
      "h2{font-size:15px;margin:18px 0 6px;padding-bottom:4px;border-bottom:1.5px solid #ddd}" +
      "ul{list-style:none;margin:0;padding:0}li{display:flex;align-items:flex-start;gap:9px;padding:5px 0;border-bottom:1px dotted #e2e2e2}" +
      ".box{flex:0 0 auto;width:15px;height:15px;border:1.5px solid #888;border-radius:3px;margin-top:2px}" +
      ".nm{font-size:14px}.due{color:#777;font-size:12px}.note{color:#777;font-size:12px;margin-top:1px}" +
      ".empty{color:#888}@media print{body{margin:14px}}",
      "<h1>" + esc(listName) + "</h1><div class='sub'>" + dateStr + "</div>" + body);
  });

  // ── "⋯" list tools: Print + Import list, rare, so hidden until asked for (v493) ──
  var listMoreBtn = document.getElementById("listMoreBtn");
  function setListMore(open) {
    var box = document.getElementById("listMoreItems");
    if (!box || !listMoreBtn) return;
    box.style.display = open ? "inline-flex" : "none";
    listMoreBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (listMoreBtn) listMoreBtn.addEventListener("click", function() {
    setListMore(listMoreBtn.getAttribute("aria-expanded") !== "true");
  });
  if (printLink) printLink.addEventListener("click", function() { setListMore(false); });
  if (importLink) importLink.addEventListener("click", function() { setListMore(false); });

  // ── Expand / collapse all categories ──────────────────────
  var collapseAllLink = document.getElementById("collapseAllLink");
  if (collapseAllLink) collapseAllLink.addEventListener("click", function() {
    var cats = getCats();
    // If any category is currently open, collapse all; otherwise expand all
    var anyOpen = cats.some(function(c){
      var st = storeGet("fl4_catOpen_"+currentList+"_"+c.id);
      return (st === null) ? true : !!st;
    });
    var newState = !anyOpen; // true = open
    cats.forEach(function(c){ storeSet("fl4_catOpen_"+currentList+"_"+c.id, newState); });
    renderList();
  });
  document.getElementById("importClose").addEventListener("click", closeImport);
  document.getElementById("importCancel").addEventListener("click", closeImport);
  document.getElementById("importBackdrop").addEventListener("click", closeImport);
  document.getElementById("importDoBtn").addEventListener("click", function() {
    var raw = document.getElementById("importText").value;
    var tag = (document.getElementById("importTag").value || "").trim();
    var lines = raw.split("\n").map(function(l){ return l.trim(); }).filter(Boolean);
    if (!lines.length) { toast("Nothing to import"); return; }
    var items = getItems();
    // v363: Grocery gets the full treatment — cleaned names and the fuzzy
    // matching key, so a pasted "eggs" lands on the existing "Egg". The task
    // lists deliberately keep the old exact-lowercase key and the light clean:
    // there a trailing comma clause is real text ("Call bank, ask about fees"),
    // and "Buy tickets" is not necessarily the same item as "Buy ticket".
    var isGro = currentList === "grocery";
    function importKey(n){ return isGro ? groceryNameKey(n) : String(n||"").trim().toLowerCase(); }
    var byName = {};
    items.forEach(function(it){ if (it){ var k = importKey(it.name); if (k && !(k in byName)) byName[k]=it; } });
    var added = 0, tagged = 0;
    var recipeLines = [];
    lines.forEach(function(name) {
      // Grocery gets the full splitter too, so a pasted "Garlic - 2 cloves"
      // tidies the same way a recipe's does (no amount chip here — a pasted
      // list has no servings to scale against).
      var clean = isGro ? splitGroceryName(name, false).name : cleanGroceryName(name, true);
      if (!clean) clean = name;
      if (tag) recipeLines.push(clean);
      var key = importKey(clean);
      var existing = key ? byName[key] : null;
      if (existing) {
        // Tag the existing item, recording its prior state so Clear can restore it
        if (!existing._recipePrev) {
          existing._recipePrev = { done: !!existing.done, catId: existing.catId, recipe: existing.recipe || null,
                                  notes: existing.notes || "", amount: existing.amount || "" };
        }
        existing.recipe = tag || existing.recipe; // new tag replaces old
        existing._recipeAdded = false;            // pre-existed: restore, don't delete
        var _impRevived = false;
        if (existing.done) { _impRevived = !reviveWasMisclick(existing); existing.done = false; existing.added = Date.now(); } // revived = recently added (v325)
        // A pasted list carries no amounts, so any note a previous recipe left
        // on this item is now stale — drop it rather than leave it attached to
        // a different recipe's chip (v364).
        if (tag && existing._recipeNote) setRecipeNote(existing, tag, "");
        existing.updated = Date.now();
        if (tag) existing.catId = detectCat(clean); // recipe's category wins
        // v406: reviving a done item off a pasted list is a re-add, same as the
        // new-item branch below. Item's own name — grocery matching is fuzzy.
        if (_impRevived) addToHist(existing.name, existing.catId);
        tagged++;
      } else {
        var catId = detectCat(clean);
        var rec = { id: Date.now() + Math.floor(Math.random()*10000), name: clean, catId: catId, done: false, addedBy: hearthUser, updated: Date.now(), added: Date.now() };
        if (tag) { rec.recipe = tag; rec._recipeAdded = true; }
        items.unshift(rec);
        if (key) byName[key] = rec;
        addToHist(clean, catId);
        added++;
      }
    });
    listData[currentList].items = items;
    // Auto-save the recipe for reuse (Grocery only)
    if (tag && currentList === "grocery" && recipeLines.length) {
      upsertRecipe(tag, recipeLines);
    }
    saveCurrentList(); renderList(); closeImport();
    var msg = "&#x2B07; Added " + added + " item" + (added!==1?"s":"");
    if (tagged) msg += ", tagged " + tagged + " existing";
    toast(msg);
  });

  // ── Travel tags ──────────────────────────────────────────

  var _addTagBtn = document.getElementById("itemSheetAddTag");
  if (_addTagBtn) _addTagBtn.addEventListener("click", function(){
    var inp = document.getElementById("itemSheetNewTag");
    var t = (inp.value || "").trim();
    if (!t) return;
    addTravelTagToPool(t);
    if (!_sheetTags.some(function(x){ return x.toLowerCase() === t.toLowerCase(); })) _sheetTags.push(t);
    inp.value = "";
    renderItemSheetTags();
  });

  document.getElementById("itemSheetSave").addEventListener("click", function() {
    if (!_sheetItemId) return;
    var items = getItems(), item = items.find(function(x){ return x.id === _sheetItemId; });
    if (!item) return;
    var newName = document.getElementById("itemSheetNameInput").value.trim();
    if (!newName) { toast("Name can't be empty"); return; }
    item.name  = newName;
    item.notes = document.getElementById("itemSheetNotes").value.trim();
    var linkVal = document.getElementById("itemSheetLink").value.trim();
    // Add https:// if a bare domain/path was pasted without a scheme
    if (linkVal && !/^https?:\/\//i.test(linkVal) && !/^[a-z]+:/i.test(linkVal)) linkVal = "https://" + linkVal;
    if (linkVal && !/^(https?|mailto|tel):/i.test(linkVal)) { toast("Link must be a http(s), mailto or tel address"); return; }
    item.link = linkVal || null;
    if (currentList === "travel") {
      item.tags = (_sheetTags && _sheetTags.length) ? _sheetTags.slice() : null;
      // Per-person checks opt-in (v326). Turning it on for an already-packed item
      // pre-ticks all three so the states stay consistent; turning it off keeps done as-is.
      var _ppTog = document.getElementById("itemSheetPPToggle");
      if (_ppTog) {
        if (_ppTog.checked) {
          if (!item.checks || typeof item.checks !== "object" || !Object.keys(item.checks).length) item.checks = item.done ? {c:true,p:true,b:true} : emptyPersonChecks();
        } else if (item.checks) {
          delete item.checks;
        }
      }
    }
    var isTask = currentList === "todo" || currentList === "personal";
    if (isTask) {
      var dueVal = document.getElementById("itemSheetDueInput").value;
      item.dueDate = dueVal || null;
      // v361: repeat setting — needs a due date to anchor to, and whitelisted against
      // REPEAT_OPTS so a tampered <select> can't store junk
      var _repSel = document.getElementById("itemSheetRepeatSelect");
      item.repeat = (dueVal && _repSel && REPEAT_OPTS[_repSel.value]) ? _repSel.value : null;
      var _tlTog = document.getElementById("itemSheetTrackLogToggle");
      item.trackLog = (_tlTog && _tlTog.checked) ? true : null;
    }
    if (currentList === "grocery") {
      var amtVal = document.getElementById("itemSheetAmountInput").value.trim();
      item.amount = amtVal || null;
    }
    item.updated = Date.now(); // v326: sheet edits must win the newest-wins merge (was unstamped)
    listData[currentList].items = items; saveCurrentList(); renderList(); closeItemSheet(); toast("Saved");
  });
});

