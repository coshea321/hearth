// ── Baby data helpers ────────────────────────────────────
function getBD() {
  var d = storeGet("fl4_baby") || {};
  if (!Array.isArray(d.growth))     d.growth     = [];
  if (!Array.isArray(d.medicine))   d.medicine   = [];
  if (!Array.isArray(d.milestones)) d.milestones = [];
  if (!Array.isArray(d.temps))      d.temps      = [];   // v519 temperature readings
  if (!d.teeth || typeof d.teeth !== "object") d.teeth = {};
  if (!d.bottles || typeof d.bottles !== "object") d.bottles = {};
  return d;
}
// v459: returns the local-save result so a caller can refuse to claim success.
function saveBD(data) { var ok = storeSet("fl4_baby", data); pushPersonal(); if (isHouseholdSet() && isSynced("baby")) pushHousehold(); return ok; }

// ── Household fetch/apply ─────────────────────────────────
function fetchHousehold(cb) {
  if (!isHouseholdSet()) { if(cb)cb(); return; }
  firebaseFetch(houseUrl("/shared"))
    .then(function(r){
      if (r.status === 401 || r.status === 403) {
        // v419: auth failed — leave the push guard closed. Both callers of this
        // function run pushHousehold() from the callback, and that push is a
        // wholesale PUT: pushing over a household we were not allowed to read
        // would replace it with whatever this device holds.
        if (cb) cb();
        return _FETCH_AUTH_FAIL;
      }
      return r.json();
    })
    .then(function(data) {
      if (data === _FETCH_AUTH_FAIL) return;
      _householdFetchOk = true; // a literal null body here is a real EMPTY household, not a failure
      if (data && typeof data === "object") applyHousehold(data);
      if (cb) cb();
    })
    .catch(function(){ if(cb)cb(); });
}

function applyHousehold(data) {
  syncPaused = true;
  var _rDirty = {}; // v375: render targets touched by this apply cycle (see flushSyncRenders)
  // Declared outside the try so the partner-added toast below is still safe if a merge throws.
  var _newFromOther = {}; // lt → count of new items added by the other user
  try {
  var _listRepush = false; // true if our merge is fuller/newer than /shared → re-push to converge
  ["grocery","todo","travel","personal"].forEach(function(lt) {
    if (!isSynced(lt)) return;
    var d = data["list_" + lt];
    if (!d || typeof d !== "object") return;
    var incoming = Array.isArray(d.items) ? d.items.filter(Boolean) : [];
    loadListData(lt); // ensure local items are loaded before merging
    // Compare against what we currently hold to spot genuinely new arrivals from the partner
    var existingIds = {};
    ((listData[lt] && listData[lt].items) || []).forEach(function(it){ if (it) existingIds[it.id] = true; });
    var seen = getSeenIds(lt);
    incoming.forEach(function(it){
      if (it && it.addedBy && it.addedBy !== hearthUser && !it.done &&
          !existingIds[it.id] && !seen[it.id]) {
        _newFromOther[lt] = (_newFromOther[lt]||0) + 1;
        markUnseen(lt, it.id);
      }
    });
    var _localItems = (listData[lt] && listData[lt].items) || [];
    var _localHist  = (listData[lt] && listData[lt].hist)  || [];
    var _tombs = mergeTombs(getTombs(lt), (d.deleted && typeof d.deleted === "object") ? d.deleted : {});
    storeSet("fl4_tomb_" + lt, purgeTombs(_tombs));
    var _htombs = mergeTombs(getTombs(histTombKey(lt)), (d.histDeleted && typeof d.histDeleted === "object") ? d.histDeleted : {});
    storeSet("fl4_tomb_" + histTombKey(lt), purgeTombs(_htombs));
    var _lm = mergeListItems(_localItems, incoming, _tombs);
    if (_lm.push) _listRepush = true;
    listData[lt] = {
      items: _lm.items,
      hist:  mergeHist(_localHist, Array.isArray(d.hist) ? d.hist.filter(Boolean) : [], _htombs, _lm.items)
    };
    storeSet(LIST_CONFIG[lt].key, listData[lt]);
    if (Array.isArray(d.notes)) storeSet("fl4_notes_" + lt, d.notes.filter(Boolean));
    if (Array.isArray(d.customCats) && d.customCats.length) {
      var existing = getCustomCats(lt), existingCatIds = {};
      existing.forEach(function(c){ existingCatIds[c.id]=true; });
      var newCats = d.customCats.filter(function(c){ return c && !existingCatIds[c.id]; });
      if (newCats.length) saveCustomCats(lt, existing.concat(newCats));
    }
  });
  if (_listRepush) setTimeout(function(){ if (isHouseholdSet()) pushHousehold(); }, 0); // converge /shared to the union
  if (isSynced("notes")) {
    var _hNotesRepush = false;
    Object.keys(NOTES_CONTEXTS).forEach(function(nc) {
      var c = NOTES_CONTEXTS[nc];
      if (data[c.dfield] && typeof data[c.dfield] === "object") {
        storeSet("fl4_tomb_" + c.tomb, purgeTombs(mergeTombs(getTombs(c.tomb), data[c.dfield])));
      }
      if (!Array.isArray(data[c.pfield])) return;
      var nm = mergeNotes(storeGet(c.key) || [], data[c.pfield].filter(Boolean), getTombs(c.tomb));
      storeSet(c.key, nm.notes);
      if (nm.push) _hNotesRepush = true;
    });
    if (_hNotesRepush) setTimeout(function(){ if (isHouseholdSet()) pushHousehold(); }, 0);
  }
  if (isSynced("baby") && data["med_deleted"] && typeof data["med_deleted"] === "object") {
    storeSet("fl4_tomb_med", purgeTombs(mergeTombs(getTombs("med"), data["med_deleted"])));
  }
  if (isSynced("baby") && data["growth_deleted"] && typeof data["growth_deleted"] === "object") {
    storeSet("fl4_tomb_growth", purgeTombs(mergeTombs(getTombs("growth"), data["growth_deleted"])));
  }
  if (isSynced("baby") && data["ms_deleted"] && typeof data["ms_deleted"] === "object") {
    storeSet("fl4_tomb_ms", purgeTombs(mergeTombs(getTombs("ms"), data["ms_deleted"])));
  }
  if (isSynced("baby") && data["bags_deleted"] && typeof data["bags_deleted"] === "object") {          // v478
    storeSet("fl4_tomb_bags", purgeTombs(mergeTombs(getTombs("bags"), data["bags_deleted"])));
  }
  if (isSynced("baby") && data["bagitems_deleted"] && typeof data["bagitems_deleted"] === "object") {  // v478
    storeSet("fl4_tomb_bagitems", purgeTombs(mergeTombs(getTombs("bagitems"), data["bagitems_deleted"])));
  }
  if (isSynced("baby") && data["btemp_deleted"] && typeof data["btemp_deleted"] === "object") {        // v519
    storeSet("fl4_tomb_btemp", purgeTombs(mergeTombs(getTombs("btemp"), data["btemp_deleted"])));
  }
  if (isSynced("baby") && data["baby"] && typeof data["baby"] === "object") {
    // v329: was a top-level Object.assign (v296) — remote's medicine/growth/
    // milestones/teeth WHOLESALE-replaced the local collections, so a dose
    // logged here but not yet received by the last-pushing device was
    // silently dropped. Now the same per-entry merge the personal channel
    // runs (mergeBabyData), incl. medicine tombstones. (v371: growth +
    // milestones now get the same per-entry merge + tombstones.)
    storeSet("fl4_baby", mergeBabyData(getBD(), data["baby"], getTombs("med"), getTombs("growth"), getTombs("ms"), getTombs("bags"), getTombs("bagitems"), getTombs("btemp")));
    _rDirty.baby = true;
  }
  // Recipe book — merge by id with NEWEST-WINS (by `updated` timestamp), so a
  // stale copy pushed by another device can never revert a newer edit. Partner's
  // new recipes are added. If we end up holding a copy newer than (or absent from)
  // the incoming /shared, schedule a re-push so /shared converges to the newest.
  // Deletions still do NOT propagate (kept from whichever device still has it).
  if (Array.isArray(data["recipebook"])) {
    var localRB = storeGet("fl4_recipebook") || [];
    var incoming = data["recipebook"].filter(function(m){ return m && m.id != null; });
    var incById = {};
    incoming.forEach(function(m){ incById[m.id] = m; });
    var localIds = {}, rbNeedPush = false;
    var merged = localRB.map(function(m){
      if (!m || m.id == null) return m;
      localIds[m.id] = true;
      var inc = incById[m.id];
      if (!inc) { rbNeedPush = true; return m; }                         // /shared missing this → push
      if ((inc.updated||0) > (m.updated||0)) return inc;                 // incoming newer → take it
      if ((m.updated||0) > (inc.updated||0)) rbNeedPush = true;          // local newer → push to converge
      return m;                                                          // equal/local → keep local
    });
    var fresh = incoming.filter(function(m){ return !localIds[m.id]; });  // partner's new ones
    var rbFull = fresh.concat(merged);
    if (data["rb_deleted"] && typeof data["rb_deleted"] === "object") {
      var rTombs = mergeTombs(getTombs("recipes"), data["rb_deleted"]);
      storeSet("fl4_tomb_recipes", rTombs);
      var rbPre = rbFull.length;
      rbFull = rbFull.filter(function(m){ return !(m && rTombs[m.id] && rTombs[m.id] >= (m.updated||0)); });
      if (rbFull.length < rbPre) rbNeedPush = true;
    }
    storeSet("fl4_recipebook", rbFull);
    // Gentle notice if the partner added recipe(s) — household channel only (avoids
    // same-account double-fire), and only on an established device (skip first-load bulk).
    var _rbNew = fresh.filter(function(m){ return m.addedBy && m.addedBy !== hearthUser; });
    if (_rbNew.length && localRB.length) {
      var _rpartner = hearthUser === "cathal1" ? "Petra" : "Cathal";
      var _rmsg = _rbNew.length === 1
        ? "&#x1F37D;&#xFE0F; " + _rpartner + " added a recipe: " + esc(_rbNew[0].name || "")
        : "&#x1F37D;&#xFE0F; " + _rpartner + " added " + _rbNew.length + " recipes";
      setTimeout(function(){ toast(_rmsg); }, 400);
    }
    _rDirty.recipes = true;
    if (rbNeedPush) setTimeout(function(){ if (isHouseholdSet()) pushHousehold(); }, 0);
  }
  // Meal plan — shared household-wide; union of days, newest-wins by
  // `updated` per day (see mergeMealPlanData). No tombstones: clearing a
  // day is itself a newest-wins write (recipeId:null).
  if (Array.isArray(data["mealplan"])) {
    var mpMerge = mergeMealPlanData(getMealPlan(), data["mealplan"]);
    storeSet("fl4_mealplan", mpMerge.plan);
    _rDirty.recipes = true;
    if (mpMerge.push) setTimeout(function(){ if (isHouseholdSet()) pushHousehold(); }, 0);
  }
  // Trips — shared household-wide; nested merge on each trip's bookings so two
  // devices editing different bookings in the same trip don't clobber each other.
  if (Array.isArray(data["trips"])) {
    var tpTombs = mergeTombs(getTombs("trips"), (data["trips_deleted"] && typeof data["trips_deleted"] === "object") ? data["trips_deleted"] : {});
    storeSet("fl4_tomb_trips", purgeTombs(tpTombs));
    var bkTombs = mergeTombs(getTombs("bookings"), (data["bookings_deleted"] && typeof data["bookings_deleted"] === "object") ? data["bookings_deleted"] : {});
    storeSet("fl4_tomb_bookings", purgeTombs(bkTombs));
    var tpMerge = mergeTripsData(storeGet("fl4_trips") || [], data["trips"], tpTombs, bkTombs);
    storeSet("fl4_trips", tpMerge.trips);
    _rDirty.trips = true;
    if (tpMerge.push) setTimeout(function(){ if (isHouseholdSet()) pushHousehold(); }, 0);
  }
  // Plants — shared household-wide; whole-record newest-wins by `updated`,
  // tombstone-filtered. A plant is one edit unit, so no nested merge is needed.
  if (Array.isArray(data["plants"])) {
    var plTombs = mergeTombs(getTombs("plants"), (data["plants_deleted"] && typeof data["plants_deleted"] === "object") ? data["plants_deleted"] : {});
    storeSet("fl4_tomb_plants", purgeTombs(plTombs));
    var plMerge = mergePlantsData(storeGet("fl4_plants") || [], data["plants"], plTombs);
    storeSet("fl4_plants", plMerge.plants);
    _rDirty.plants = true;
    if (plMerge.push) setTimeout(function(){ if (isHouseholdSet()) pushHousehold(); }, 0);
  }
  // Watchlist — shared household-wide; whole-record newest-wins by `updated`,
  // tombstone-filtered. One title is one edit unit, so no nested merge.
  if (Array.isArray(data["watchlist"])) {
    var wlTombs = mergeTombs(getTombs("watchlist"), (data["watchlist_deleted"] && typeof data["watchlist_deleted"] === "object") ? data["watchlist_deleted"] : {});
    storeSet("fl4_tomb_watchlist", purgeTombs(wlTombs));
    var wlMerge = mergeWatchData(storeGet("fl4_watchlist") || [], data["watchlist"], wlTombs);
    storeSet("fl4_watchlist", wlMerge.watchlist);
    _rDirty.watchlist = true;
    if (wlMerge.push) setTimeout(function(){ if (isHouseholdSet()) pushHousehold(); }, 0);
  }
  // Appliances — shared household-wide; whole-record newest-wins by `updated`,
  // tombstone-filtered. One appliance is one edit unit, so no nested merge.
  if (Array.isArray(data["appliances"])) {
    var apTombs = mergeTombs(getTombs("appliances"), (data["appliances_deleted"] && typeof data["appliances_deleted"] === "object") ? data["appliances_deleted"] : {});
    storeSet("fl4_tomb_appliances", purgeTombs(apTombs));
    var apMerge = mergeApplianceData(storeGet("fl4_appliances") || [], data["appliances"], apTombs);
    storeSet("fl4_appliances", apMerge.appliances);
    _rDirty.appliances = true;
    if (apMerge.push) setTimeout(function(){ if (isHouseholdSet()) pushHousehold(); }, 0);
  }
  // Health — shared household-wide; whole-record newest-wins by `updated`,
  // tombstone-filtered. One record is one edit unit, so no nested merge.
  if (Array.isArray(data["health"])) {
    var hlTombs = mergeTombs(getTombs("health"), (data["health_deleted"] && typeof data["health_deleted"] === "object") ? data["health_deleted"] : {});
    storeSet("fl4_tomb_health", purgeTombs(hlTombs));
    var hlMerge = mergeHealthData(storeGet("fl4_health") || [], data["health"], hlTombs);
    storeSet("fl4_health", hlMerge.health);
    _rDirty.health = true;
    if (hlMerge.push) setTimeout(function(){ if (isHouseholdSet()) pushHousehold(); }, 0);
  }
  // Projects (v499) — shared household-wide; the trips merge one level down:
  // project fields newest-wins, items by id with their own tombstones, so one
  // phone ticking a task never undoes the other adding a quote.
  if (Array.isArray(data["projects"])) {
    var pjTombs = mergeTombs(getTombs("projects"), (data["projects_deleted"] && typeof data["projects_deleted"] === "object") ? data["projects_deleted"] : {});
    storeSet("fl4_tomb_projects", purgeTombs(pjTombs));
    var piTombs = mergeTombs(getTombs("projitems"), (data["projitems_deleted"] && typeof data["projitems_deleted"] === "object") ? data["projitems_deleted"] : {});
    storeSet("fl4_tomb_projitems", purgeTombs(piTombs));
    var pjMerge = mergeProjectsData(storeGet("fl4_projects") || [], data["projects"], pjTombs, piTombs);
    storeSet("fl4_projects", pjMerge.projects);
    _rDirty.projects = true;
    if (pjMerge.push) setTimeout(function(){ if (isHouseholdSet()) pushHousehold(); }, 0);
  }
  // Golf (v500) — whole-record newest-wins, the Health contract.
  if (Array.isArray(data["golf"])) {
    var gfTombs = mergeTombs(getTombs("golf"), (data["golf_deleted"] && typeof data["golf_deleted"] === "object") ? data["golf_deleted"] : {});
    storeSet("fl4_tomb_golf", purgeTombs(gfTombs));
    var gfMerge = mergeGolfData(storeGet("fl4_golf") || [], data["golf"], gfTombs);
    storeSet("fl4_golf", gfMerge.golf);
    _rDirty.golf = true;
    if (gfMerge.push) setTimeout(function(){ if (isHouseholdSet()) pushHousehold(); }, 0);
  }
  } catch (err) { console.warn("applyHousehold error (sync continues):", err); }
  finally { syncPaused = false; }
  // v375: one batched flush instead of renders scattered through the merge above.
  // No renderTrainView here — the Train view is fed by the personal channel only.
  flushSyncRenders({ recipes:_rDirty.recipes, trips:_rDirty.trips, baby:_rDirty.baby, appliances:_rDirty.appliances,
                     plants:_rDirty.plants, watchlist:_rDirty.watchlist, health:_rDirty.health, projects:_rDirty.projects, golf:_rDirty.golf, list:true, dots:true, home:true });
  // Gentle in-app toast if the partner added something while we're using the app
  var _totalNew = 0, _firstLt = null;
  Object.keys(_newFromOther).forEach(function(lt){ _totalNew += _newFromOther[lt]; if(!_firstLt) _firstLt = lt; });
  if (_totalNew > 0) {
    var ltName = _firstLt ? (LIST_TYPES[_firstLt] ? LIST_TYPES[_firstLt].name.replace(/&#x[0-9A-Fa-f]+;\s*/,"") : _firstLt) : "";
    var partner = hearthUser === "cathal1" ? "Petra" : "Cathal";
    toast("&#x1F465; " + partner + " added " + _totalNew + " item" + (_totalNew!==1?"s":"") + (_firstLt && _totalNew===_newFromOther[_firstLt] ? " to " + ltName : ""));
  }
}

// ── "Added by partner" unseen tracking ──────────────────────
function getSeenIds(lt) { return storeGet("fl4_seen_"+lt) || {}; }
function markUnseen(lt, id) {
  var u = storeGet("fl4_unseen_"+lt) || {};
  u[id] = true;
  storeSet("fl4_unseen_"+lt, u);
}
function getUnseen(lt) { return storeGet("fl4_unseen_"+lt) || {}; }
function clearUnseen(lt) {
  // Mark all current unseen as seen and wipe the unseen flag
  var u = getUnseen(lt), seen = getSeenIds(lt);
  Object.keys(u).forEach(function(id){ seen[id] = true; });
  storeSet("fl4_seen_"+lt, seen);
  storeSet("fl4_unseen_"+lt, {});
  updateListTabDots();
}
function unseenCount(lt) { return Object.keys(getUnseen(lt)).length; }
function updateListTabDots() {
  ["grocery","todo","travel","personal"].forEach(function(lt){
    var btn = document.querySelector('.type-btn[data-lt="'+lt+'"]');
    if (!btn) return;
    var n = unseenCount(lt);
    var dot = btn.querySelector(".lt-newdot");
    if (n > 0) {
      if (!dot) {
        dot = document.createElement("span");
        dot.className = "lt-newdot";
        dot.style.cssText = "position:absolute;top:3px;right:6px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#E0703C;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;box-sizing:border-box";
        btn.style.position = "relative";
        btn.appendChild(dot);
      }
      dot.textContent = n;
    } else if (dot) {
      dot.remove();
    }
  });
}

// ── Baby view ─────────────────────────────────────────────
var currentBabyView = "growth";

function renderBabyView() {
  document.querySelectorAll(".bsn-btn").forEach(function(b) {
    b.classList.toggle("active", b.dataset.bview === currentBabyView);
  });
  document.getElementById("babyGrowthView").style.display     = currentBabyView === "growth"     ? "" : "none";
  document.getElementById("babyMedicineView").style.display   = currentBabyView === "medicine"   ? "" : "none";
  document.getElementById("babyTempView").style.display       = currentBabyView === "temp"       ? "" : "none";
  document.getElementById("babyMilestonesView").style.display = currentBabyView === "milestones" ? "" : "none";
  document.getElementById("babyTeethView").style.display      = currentBabyView === "teeth"      ? "" : "none";
  document.getElementById("babyBagsView").style.display       = currentBabyView === "bags"       ? "" : "none";
  if (currentBabyView === "growth")     renderGrowth();
  if (currentBabyView === "medicine")   renderMedicine();
  if (currentBabyView === "temp")       renderBabyTemp();
  if (currentBabyView === "milestones") renderMilestones();
  if (currentBabyView === "teeth")      renderTeeth();
  if (currentBabyView === "bags")       renderBagView();
}

document.querySelectorAll(".bsn-btn").forEach(function(btn) {
  btn.addEventListener("click", function() {
    currentBabyView = btn.dataset.bview;
    renderBabyView();
  });
});

// ── Bag view helpers ──────────────────────────────────────
var DEFAULT_BAGS = [
  { id:"changing", name:"Changing Bag", icon:"&#x1F45C;", items:["Nappies","Wipes","Nappy sacks","Change mat","Nappy cream","Spare clothes (x2)","Bib (x2)","Dummy","Muslins (x2)","Hand sanitiser"] },
  { id:"day",      name:"Day Bag",      icon:"&#x1F392;", items:["Nappies (x3)","Wipes","Snacks","Sippy cup","Spare clothes","Bib","Sunscreen","Hat","Dummy","Small toy"] },
  { id:"holiday",  name:"Holiday Bag",  icon:"&#x1F9F3;", items:["Nappies (x20)","Wipes (x4 packs)","Nappy cream","Nappy sacks","Baby sun cream","Swimsuit","Rash vest","Beach towel","Muslins (x4)","Spare clothes (x5)","Bibs (x5)","Formula/snacks","Baby monitor","Favourite toy","Dummy (x3)","First aid kit","Baby paracetamol","Travel cot sheets"] }
];
// EVERY read of the bags goes through here, and it always returns normalised
// bags (see normaliseBags): a bag that has been round-tripped through Firebase
// comes back with its empty `items` array stripped, and an un-normalised bag
// threw mid-render. Normalising is in-memory only — it deliberately does NOT
// save, so merely opening the Bags tab never fires a sync push; the next real
// edit writes the repaired shape back.
//
// The seeded defaults are stamped `updated:0` ON PURPOSE. A seed is the
// lowest-priority state there is, so any real edit on another device outranks
// a device that has only just seeded, and any tombstone outranks a re-seed of
// a bag someone deleted. Never stamp these with Date.now().
//
// v480: a default someone DELETED is not seeded again. The tombstone always
// outranks an updated:0 seed, so re-seeding it only made it flicker: back on
// this read, filtered out by the next merge, back on the read after that, a
// sync push every time. If every default is tombstoned the list stays empty,
// and renderBagView shows its "No bags yet" state instead.
function getBagsData() {
  var bd = getBD();
  var bags = normaliseBags(bd.bags);
  if (!bags.length) {
    var bagTombs = getTombs("bags");
    bags = DEFAULT_BAGS.filter(function(b){ return bagTombs[b.id] == null; }).map(function(b) {
      return { id:b.id, name:b.name, icon:b.icon, updated:0,
               items:b.items.map(function(name,i){ return { id:b.id+"_"+i, name:name, packed:false, updated:0 }; }) };
    });
    if (bags.length) { bd.bags = bags; saveBD(bd); }
  }
  return bags;
}
function saveBagsData(bags) { var bd = getBD(); bd.bags = normaliseBags(bags); saveBD(bd); }
// Any change to a bag or one of its items stamps BOTH, so the newer side wins
// the merge and so an active bag outranks a stale delete from another device.
function touchBagItem(bag, item) { var t = Date.now(); if (item) item.updated = t; if (bag) bag.updated = t; }

// ── confirmDialog — works in sandboxed iframes (no confirm()) ─────────────
function confirmDialog(msg, onYes, onNo) {
  var ov = document.createElement("div");
  ov.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.5);z-index:900;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box";
  ov.setAttribute("role", "alertdialog");
  ov.setAttribute("aria-modal", "true");
  var box = document.createElement("div");
  box.style.cssText = "background:#fff;border-radius:14px;padding:20px;width:100%;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,.2)";
  box.innerHTML = "<div style='font-size:15px;color:#2A2010;line-height:1.5;margin-bottom:16px'>" + msg + "</div>" +
    "<div style='display:flex;gap:8px'>" +
      "<button id='_cfNo' style='flex:1;padding:11px;border:1.5px solid #E0D0B0;border-radius:9px;background:none;font-family:inherit;font-size:14px;cursor:pointer;touch-action:manipulation'>Cancel</button>" +
      "<button id='_cfYes' style='flex:1;padding:11px;border:none;background:#C03030;color:#fff;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>OK</button>" +
    "</div>";
  // msg is HTML (callers esc() any stored name in it), so the label is read
  // back from the rendered text — never set from msg itself, or a screen
  // reader announces "&amp;" and "&ldquo;" literally.
  ov.setAttribute("aria-label", box.firstChild.textContent);
  ov.appendChild(box);
  document.body.appendChild(ov);
  document.getElementById("_cfYes").addEventListener("click", function(){ document.body.removeChild(ov); if(onYes) onYes(); });
  document.getElementById("_cfNo").addEventListener("click",  function(){ document.body.removeChild(ov); if(onNo)  onNo();  });
}

// ============================================================
// BABY — Growth, Medicine, Milestones, Teeth
// ============================================================
function renderGrowth() {
  var bd = getBD();
  var growth = (bd.growth||[]).slice().sort(function(a,b){ return b.date.localeCompare(a.date); });
  var el = document.getElementById("babyGrowthView");
  var html = "<div class='baby-log-card'><div class='baby-card-title'>&#x1F4CF; Log measurement</div>" +
    "<div style='display:flex;gap:8px;margin-bottom:6px'><input id='growthDate' type='date' class='med-input' style='flex:1'><input id='growthWeight' type='number' step='0.01' class='med-input' style='flex:1' placeholder='Weight (kg)'><input id='growthHeight' type='number' step='0.1' class='med-input' style='flex:1' placeholder='Height (cm)'></div>" +
    "<input id='growthNote' type='text' class='med-input' style='width:100%;box-sizing:border-box;margin-bottom:6px' placeholder='Note (optional)'>" +
    "<button class='baby-log-btn' id='growthLogBtn'>Log</button></div>";
  // Sex selector for WHO comparison (one-time, changeable)
  var sexSel = "<div style='display:flex;align-items:center;gap:8px;padding:4px 16px 10px;font-size:12px;color:#8A6A8A'>" +
    "<span>Compare vs average:</span>" +
    "<button id='sexGirl' style='border:1.5px solid "+(bd.babySex==="girl"?"#C2649A":"#E8DDE8")+";background:"+(bd.babySex==="girl"?"#FBEFF6":"#fff")+";color:#C2649A;border-radius:7px;padding:4px 10px;font-family:inherit;font-size:12px;cursor:pointer'>Girl</button>" +
    "<button id='sexBoy' style='border:1.5px solid "+(bd.babySex==="boy"?"#5A8AC2":"#E0E5F0")+";background:"+(bd.babySex==="boy"?"#EFF4FB":"#fff")+";color:#5A8AC2;border-radius:7px;padding:4px 10px;font-family:inherit;font-size:12px;cursor:pointer'>Boy</button>" +
    "</div>";
  html += sexSel;
  var trend = growthTrendSummary();
  if (trend) {
    html += "<div style='margin:0 12px 10px;padding:10px 13px;border-radius:10px;background:" + trend.bg + ";color:" + trend.fg + ";font-size:13px;line-height:1.4;font-weight:600'>" +
      "&#x1F4C8; " + trend.text +
      "<div style='font-size:11px;font-weight:400;opacity:.8;margin-top:2px'>weight-for-length vs WHO centile &middot; not medical advice</div>" +
    "</div>";
  }
  if (growth.length) {
    html += growthChartsHtml(bd);
    html += "<div style='padding:0 12px'>";
    growth.forEach(function(e) {
      var rawIdx = bd.growth.indexOf(e);
      var band = growthBand(e, bd.babySex);
      var bandHtml = band ? "<span style='font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px;margin-left:6px;background:"+band.bg+";color:"+band.fg+"'>"+band.label+"</span>" : "";
      html += "<div class='growth-row' data-gdate='" + esc(e.date) + "' style='padding:10px 0;border-bottom:1px solid #F0EBF8'>" +
        "<div style='display:flex;align-items:center'>" +
          "<div style='flex:1'>" +
            "<div class='growth-edit-trigger' data-growthdate='" + esc(e.date) + "' style='font-size:14px;font-weight:600;color:#2A2010;cursor:pointer;text-decoration:underline dotted'>" + (listDate(String(e.date)) || esc(e.date)) + "</div>" +
            "<div style='font-size:13px;color:#8A6A8A'>" + (e.weight?e.weight+" kg":"") + (e.weight&&e.height?" &middot; ":"") + (e.height?e.height+" cm":"") + bandHtml + "</div>" +
            (e.note?"<div style='font-size:12px;color:#A88AA8;font-style:italic;margin-top:2px'>"+esc(e.note)+"</div>":"") +
          "</div>" +
          "<button data-gidx='" + esc(rawIdx) + "' class='growth-del-btn' style='border:none;background:none;color:#C06060;font-size:14px;cursor:pointer;touch-action:manipulation;opacity:.45;width:40px;height:40px'>&#x2715;</button>" +
        "</div></div>";
    });
    html += "</div>";
  } else {
    html += "<div style='text-align:center;padding:32px;color:#8A6A8A;font-size:14px'>No measurements yet</div>";
  }
  html += "<div style='padding:8px 16px 14px;font-size:12px;color:#8A6A8A'>Centiles are approximate, based on WHO weight-for-length reference tables. Not medical advice &mdash; discuss growth with your PHN or GP.</div>";
  el.innerHTML = html;
  var now2 = new Date(), p2 = function(x){ return x<10?"0"+x:""+x; };
  var d2 = document.getElementById("growthDate"); if(d2) d2.value = now2.getFullYear()+"-"+p2(now2.getMonth()+1)+"-"+p2(now2.getDate());
  document.getElementById("growthLogBtn").addEventListener("click", function() {
    var date = document.getElementById("growthDate").value;
    var weight = parseFloat(document.getElementById("growthWeight").value)||null;
    var height = parseFloat(document.getElementById("growthHeight").value)||null;
    var note = document.getElementById("growthNote").value.trim();
    if (!date||(!weight&&!height)) { toast("Enter a date and at least one measurement"); return; }
    var bd2=getBD(); bd2.growth=bd2.growth||[];
    var idx2=bd2.growth.findIndex(function(e){ return e.date===date; });
    var rec = {date:date,weight:weight,height:height,note:note||null,updated:Date.now()};
    if(idx2>=0) bd2.growth[idx2]=rec; else bd2.growth.push(rec);
    bd2.growth.sort(function(a,b){ return b.date.localeCompare(a.date); });
    saveBD(bd2); renderGrowth(); toast("&#x1F4CF; Logged");
  });
  // Sex selector
  document.getElementById("sexGirl").addEventListener("click", function(){ var b=getBD(); b.babySex="girl"; saveBD(b); renderGrowth(); });
  document.getElementById("sexBoy").addEventListener("click", function(){ var b=getBD(); b.babySex="boy"; saveBD(b); renderGrowth(); });
  el.querySelectorAll(".growth-del-btn").forEach(function(btn){
    btn.addEventListener("click", function(){ confirmDialog("Delete this measurement?", function(){
      var bd2=getBD(); var gidx=parseInt(btn.dataset.gidx,10);
      if (!isNaN(gidx) && gidx>=0 && gidx<bd2.growth.length) {
        addTomb("growth", bd2.growth[gidx].date); // v371: so a partner's copy can't resurrect it
        bd2.growth.splice(gidx,1);
      }
      saveBD(bd2); renderGrowth();
    }); });
  });
  // Full record edit: date, weight, height, note
  el.querySelectorAll(".growth-edit-trigger").forEach(function(span){
    span.addEventListener("click", function(){
      var oldDate = span.dataset.growthdate;
      var row = span.closest(".growth-row");
      var existing = row.querySelector(".growth-full-edit");
      if (existing) { existing.remove(); return; }
      var bd2 = getBD();
      var rec = (bd2.growth||[]).find(function(x){ return x.date===oldDate; });
      if (!rec) return;
      var ed = document.createElement("div");
      ed.className = "growth-full-edit";
      ed.style.cssText = "padding:8px 0;width:100%;box-sizing:border-box";
      ed.innerHTML =
        "<div style='display:flex;gap:6px;margin-bottom:6px'>" +
          "<input type='date' class='_geDate med-input' value='"+rec.date+"' style='flex:1'>" +
          "<input type='number' step='0.01' class='_geWeight med-input' value='"+(rec.weight||"")+"' placeholder='kg' style='flex:1'>" +
          "<input type='number' step='0.1' class='_geHeight med-input' value='"+(rec.height||"")+"' placeholder='cm' style='flex:1'>" +
        "</div>" +
        "<input type='text' class='_geNote med-input' value='"+(rec.note?String(rec.note).replace(/'/g,"&#39;"):"")+"' placeholder='Note (optional)' style='width:100%;box-sizing:border-box;margin-bottom:6px'>" +
        "<div style='display:flex;gap:6px'>" +
          "<button class='_geSave baby-log-btn' style='flex:1;margin:0'>Save</button>" +
          "<button class='_geCancel' style='padding:8px 14px;background:#F0EBF8;border:none;border-radius:7px;color:#8A6A8A;font-family:inherit;font-size:13px;cursor:pointer'>Cancel</button>" +
        "</div>";
      row.appendChild(ed);
      ed.querySelector("._geSave").addEventListener("click", function(){
        var nd = ed.querySelector("._geDate").value;
        var nw = parseFloat(ed.querySelector("._geWeight").value)||null;
        var nh = parseFloat(ed.querySelector("._geHeight").value)||null;
        var nn = ed.querySelector("._geNote").value.trim();
        if (!nd || (!nw && !nh)) { toast("Need a date and at least one measurement"); return; }
        if (nd !== rec.date && bd2.growth.some(function(x){ return x !== rec && x.date === nd; })) {
          toast("An entry for that date already exists &mdash; edit or delete it first"); return;
        }
        // v371: the date IS the merge key — changing it without a tombstone
        // would let a partner's copy under the OLD date resurrect as a dupe.
        if (nd !== rec.date) addTomb("growth", rec.date);
        rec.date=nd; rec.weight=nw; rec.height=nh; rec.note=nn||null; rec.updated=Date.now();
        bd2.growth.sort(function(a,b){ return b.date.localeCompare(a.date); });
        saveBD(bd2); renderGrowth();
      });
      ed.querySelector("._geCancel").addEventListener("click", function(){ ed.remove(); });
    });
  });
}

// ── WHO weight-for-length centiles (LMS parameters, 45–110 cm, v347) ──────
// L/M/S at 5cm steps, transcribed from the official WHO Child Growth
// Standards weight-for-length tables (birth–2 years) — same source CDC
// redistributes verbatim as "WHO-Boys/Girls-Weight-for-length-Percentiles"
// (columns Length,L,M,S,percentiles). Cited in full in the v347 PR body.
// L is genuinely constant per sex across the whole range in the source data
// (WHO's own Box-Cox power for this indicator, not a transcription error —
// verified against all 131 half-cm rows of the source table, not just these
// 14 five-cm points). M values replace the old "approximate" WHO_WFL medians
// (up to ~3.5% higher at longer lengths) — the previous table was a rough
// approximation; this one is transcribed, per Cathal's go-ahead 21/07/2026.
// Linearly interpolating L/M/S between 5cm steps (small accuracy loss vs
// WHO's 0.5cm tables, accepted for a trend view — same tradeoff the old
// medians-only table already made).
var WHO_WFL_LMS = {
  girl: {
    45:{L:-0.3833,M:2.4607,S:0.09029}, 50:{L:-0.3833,M:3.3518,S:0.09068},
    55:{L:-0.3833,M:4.5498,S:0.09110}, 60:{L:-0.3833,M:5.8742,S:0.09136},
    65:{L:-0.3833,M:7.0812,S:0.09119}, 70:{L:-0.3833,M:8.1630,S:0.09068},
    75:{L:-0.3833,M:9.1490,S:0.09005}, 80:{L:-0.3833,M:10.0891,S:0.08940},
    85:{L:-0.3833,M:11.2198,S:0.08898}, 90:{L:-0.3833,M:12.4723,S:0.08906},
    95:{L:-0.3833,M:13.7146,S:0.08963}, 100:{L:-0.3833,M:15.0267,S:0.09069},
    105:{L:-0.3833,M:16.5470,S:0.09219}, 110:{L:-0.3833,M:18.3324,S:0.09401}
  },
  boy: {
    45:{L:-0.3521,M:2.4410,S:0.09182}, 50:{L:-0.3521,M:3.3278,S:0.08890},
    55:{L:-0.3521,M:4.5467,S:0.08592}, 60:{L:-0.3521,M:5.9907,S:0.08342},
    65:{L:-0.3521,M:7.2666,S:0.08223}, 70:{L:-0.3521,M:8.4227,S:0.08229},
    75:{L:-0.3521,M:9.5032,S:0.08295}, 80:{L:-0.3521,M:10.4475,S:0.08308},
    85:{L:-0.3521,M:11.5007,S:0.08181}, 90:{L:-0.3521,M:12.7209,S:0.08041},
    95:{L:-0.3521,M:13.8928,S:0.08047}, 100:{L:-0.3521,M:15.1637,S:0.08198},
    105:{L:-0.3521,M:16.6268,S:0.08453}, 110:{L:-0.3521,M:18.2689,S:0.08755}
  }
};
// Interpolates L, M, S linearly between the 5cm table points for a given
// length (cm). Null outside 45–110 cm or with no sex set.
function whoWflLMS(h, sex) {
  var t = WHO_WFL_LMS[sex]; if (!t || !h || h < 45 || h > 110) return null;
  var lo = Math.floor(h/5)*5, hi = lo+5;
  if (hi > 110) hi = 110;
  var pLo = t[lo], pHi = t[hi];
  if (lo===hi) return pLo;
  var f = (h-lo)/5;
  return { L: pLo.L+(pHi.L-pLo.L)*f, M: pLo.M+(pHi.M-pLo.M)*f, S: pLo.S+(pHi.S-pLo.S)*f };
}
// Standard-normal CDF, Abramowitz–Stegun 7.1.26 approximation (max error ~1.5e-7).
function normalCdf(z) {
  var sign = z < 0 ? -1 : 1; z = Math.abs(z) / Math.sqrt(2);
  var t = 1/(1+0.3275911*z);
  var y = 1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-z*z);
  return 0.5*(1+sign*y);
}
// Weight-for-length centile (0–100) for a growth entry, via the LMS method:
// z = ((weight/M)^L − 1) / (L·S), centile = Φ(z). Null if sex unset, height
// out of range, or weight/height missing.
function growthCentile(rec, sex) {
  if (!sex || !rec.weight || !rec.height) return null;
  var lms = whoWflLMS(rec.height, sex);
  if (!lms) return null;
  var z = (Math.pow(rec.weight/lms.M, lms.L) - 1) / (lms.L*lms.S);
  return normalCdf(z) * 100;
}
function ordinal(n) {
  var s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}
// Per-entry band: exact centile (calm, descriptive — never advice/alarm
// language), coloured by which of the five WHO-standard tiers it falls in
// (<3rd / 3rd–15th / 15th–85th / 85th–97th / >97th).
function growthBand(rec, sex) {
  var c = growthCentile(rec, sex);
  if (c == null) return null;
  var tier = c < 3 ? 0 : c < 15 ? 1 : c <= 85 ? 2 : c < 97 ? 3 : 4;
  var colors = [
    {bg:"#FBE4DC",fg:"#C0603A"}, {bg:"#FDF0E0",fg:"#B07030"},
    {bg:"#E8F5E0",fg:"#508040"}, {bg:"#E8F0FD",fg:"#5070B0"}, {bg:"#E3EAFC",fg:"#3A5AA0"}
  ][tier];
  var label = c < 1 ? "<1st centile" : c > 99 ? ">99th centile" : "≈ " + ordinal(Math.round(c)) + " centile";
  return { label: label, bg: colors.bg, fg: colors.fg };
}
// Growth-trend summary (v301, converted to true centiles v347) reports the
// current weight-for-length centile band and whether the child is holding
// steady / drifting up / drifting down over the last few readings. Advisory
// only; the "not medical advice" disclaimer already sits under the Growth list.
function growthTrendSummary() {
  var bd = getBD(), sex = bd.babySex;
  if (!sex) return null;
  var recs = (bd.growth||[]).filter(function(r){
    return r && r.weight && r.height && growthCentile(r, sex) != null;
  }).sort(function(a,b){ return (a.date||"").localeCompare(b.date||""); });
  if (!recs.length) return null;
  var latest = recs[recs.length-1];
  var band = growthBand(latest, sex);
  if (!band) return null;
  var pron = sex === "girl" ? "her" : "his";
  var text = "Tracking " + band.label + " for " + pron + " length";
  if (recs.length >= 2) {
    var win = recs.slice(Math.max(0, recs.length - 3));
    var firstC = growthCentile(win[0], sex);
    var lastC  = growthCentile(latest, sex);
    var delta = lastC - firstC;
    var dir = Math.abs(delta) < 5 ? "holding steady" : (delta > 0 ? "drifting up" : "drifting down");
    text += ", " + dir + " over the last " + win.length + " readings";
  }
  return { text: text + ".", bg: band.bg, fg: band.fg };
}

// ── Mini-chart shared helpers (v349 chart redesign) ───────────────────────
// All three trend charts share one visual language: 2px rounded lines,
// white-ringed dots (readable over bands/other lines), an emphasized latest
// point with a bold end-of-line value label, hairline gridlines at
// meaningful values, and warm-gray axis text. Helpers are top-level on
// purpose (renderer-called helpers must never be locally scoped).
function chartDots(points, xOf, yOf, color) {
  var out = "";
  for (var i = 0; i < points.length; i++) {
    var last = i === points.length - 1;
    out += "<circle cx='" + xOf(points[i].t).toFixed(1) + "' cy='" + yOf(points[i].v).toFixed(1) +
      "' r='" + (last ? 4.5 : 3) + "' fill='" + color + "' stroke='#fff' stroke-width='1.5'/>";
  }
  return out;
}
// Bold value label just right of the last point, baseline clamped inside the plot.
function chartEndLabel(x, y, yTop, yBottom, text) {
  var ly = Math.max(yTop + 8, Math.min(yBottom - 3, y + 3.5));
  return "<text x='" + (x + 7).toFixed(1) + "' y='" + ly.toFixed(1) +
    "' font-size='11' font-weight='700' fill='#3D4035'>" + text + "</text>";
}
function chartDateLabels(W, H, padL, padR, minT, maxT) {
  var firstLabel = esc(new Date(minT).toLocaleDateString("en-IE",{day:"numeric",month:"short"}));
  var lastLabel = esc(new Date(maxT).toLocaleDateString("en-IE",{day:"numeric",month:"short"}));
  return "<text x='" + padL + "' y='" + (H-4) + "' font-size='11' fill='#8A8578'>" + firstLabel + "</text>" +
    "<text x='" + (W-padR) + "' y='" + (H-4) + "' font-size='11' fill='#8A8578' text-anchor='end'>" + lastLabel + "</text>";
}
// 2–4 "nice" round tick values strictly inside [minV, maxV].
function chartTicks(minV, maxV) {
  var span = maxV - minV;
  if (!(span > 0)) return [];
  var rawStep = span / 3;
  var mag = Math.pow(10, Math.floor(Math.log(rawStep) / Math.LN10));
  var mults = [1, 2, 2.5, 5, 10], step = mag * 10;
  for (var i = 0; i < mults.length; i++) {
    if (mults[i] * mag >= rawStep) { step = mults[i] * mag; break; }
  }
  var ticks = [];
  for (var v = Math.ceil(minV / step) * step; v <= maxV + step * 0.001; v += step) {
    var r = Math.round(v * 100) / 100;
    if (r >= minV && r <= maxV) ticks.push(r);
  }
  return ticks;
}
function centileOrdinal(n) {
  var v = n % 100;
  if (v >= 11 && v <= 13) return n + "th";
  var d = n % 10;
  return n + (d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th");
}

// Renders the WHO weight-for-length centile as one mini SVG line-chart
// (v310 ratio chart replaced with true centiles, v347; redesigned v349).
// points are ascending {t:ms, v:centile 0-100}. A shaded band (15th–85th)
// marks the typical range, with a dashed 50th-centile (median) reference
// line; the 15/50/85 values double as the y-axis labels.
function growthCentileChartSvg(points, color) {
  var W=300, H=140, padL=30, padR=42, padT=12, padB=20;
  var plotW=W-padL-padR, plotH=H-padT-padB;
  var minT=points[0].t, maxT=points[points.length-1].t;
  var vals = points.map(function(p){ return p.v; }).concat([15, 85]);
  var minV=Math.min.apply(null,vals), maxV=Math.max.apply(null,vals);
  var pad = (maxV-minV)*0.15; minV -= pad; maxV += pad;
  minV = Math.max(0, minV); maxV = Math.min(100, maxV);
  function xOf(t){ return minT===maxT ? padL+plotW/2 : padL+(t-minT)/(maxT-minT)*plotW; }
  function yOf(v){ return padT+(1-(v-minV)/(maxV-minV))*plotH; }
  var band = "<rect x='"+padL+"' y='"+yOf(85).toFixed(1)+"' width='"+plotW+"' height='"+(yOf(15)-yOf(85)).toFixed(1)+"' fill='#EBF5E4'/>";
  var medianLine = "<line x1='"+padL+"' x2='"+(W-padR)+"' y1='"+yOf(50).toFixed(1)+"' y2='"+yOf(50).toFixed(1)+"' stroke='#C4BCAE' stroke-width='1' stroke-dasharray='4,3'/>";
  var refLabels = [15, 50, 85].map(function(v){
    return "<text x='"+(padL-5)+"' y='"+(yOf(v)+3).toFixed(1)+"' font-size='11' fill='#8A8578' text-anchor='end'>"+v+"</text>";
  }).join("");
  var linePts = points.map(function(p){ return xOf(p.t).toFixed(1)+","+yOf(p.v).toFixed(1); }).join(" ");
  var lastP = points[points.length-1];
  return "<svg viewBox='0 0 "+W+" "+H+"' width='100%' height='"+H+"' style='display:block'>" +
    band + medianLine + refLabels +
    "<polyline points='"+linePts+"' fill='none' stroke='"+color+"' stroke-width='2' stroke-linejoin='round' stroke-linecap='round'/>" +
    chartDots(points, xOf, yOf, color) +
    chartEndLabel(xOf(lastP.t), yOf(lastP.v), padT, padT+plotH, centileOrdinal(Math.round(lastP.v))) +
    chartDateLabels(W, H, padL, padR, minT, maxT) +
  "</svg>";
}

// Bodyweight trend mini SVG line-chart (v336, redesigned v349). points are
// ascending {t:ms, v:kg} — same hand-built-SVG pattern as
// growthCentileChartSvg; no band/median since there's no "normal range" for
// bodyweight, so it gets round-number gridlines and a soft area wash instead.
function bodyweightChartSvg(points, color) {
  var W=300, H=140, padL=34, padR=54, padT=12, padB=20;
  var plotW=W-padL-padR, plotH=H-padT-padB;
  var minT=points[0].t, maxT=points[points.length-1].t;
  var vals = points.map(function(p){ return p.v; });
  var minV=Math.min.apply(null,vals), maxV=Math.max.apply(null,vals);
  var pad = (maxV-minV)*0.15; if (!pad) pad = 1; minV -= pad; maxV += pad;
  function xOf(t){ return minT===maxT ? padL+plotW/2 : padL+(t-minT)/(maxT-minT)*plotW; }
  function yOf(v){ return padT+(1-(v-minV)/(maxV-minV))*plotH; }
  var grid = chartTicks(minV, maxV).map(function(v){
    var y = yOf(v).toFixed(1);
    var lbl = (v % 1 === 0) ? String(v) : v.toFixed(1);
    return "<line x1='"+padL+"' x2='"+(W-padR)+"' y1='"+y+"' y2='"+y+"' stroke='#EFE9DC' stroke-width='1'/>" +
      "<text x='"+(padL-5)+"' y='"+(yOf(v)+3).toFixed(1)+"' font-size='11' fill='#8A8578' text-anchor='end'>"+lbl+"</text>";
  }).join("");
  var linePts = points.map(function(p){ return xOf(p.t).toFixed(1)+","+yOf(p.v).toFixed(1); }).join(" ");
  var yBottom = (padT+plotH).toFixed(1);
  var area = "<polygon points='"+linePts+" "+xOf(maxT).toFixed(1)+","+yBottom+" "+xOf(minT).toFixed(1)+","+yBottom+"' fill='"+color+"' fill-opacity='0.08'/>";
  var lastP = points[points.length-1];
  return "<svg viewBox='0 0 "+W+" "+H+"' width='100%' height='"+H+"' style='display:block'>" +
    grid + area +
    "<polyline points='"+linePts+"' fill='none' stroke='"+color+"' stroke-width='2' stroke-linejoin='round' stroke-linecap='round'/>" +
    chartDots(points, xOf, yOf, color) +
    chartEndLabel(xOf(lastP.t), yOf(lastP.v), padT, padT+plotH, lastP.v.toFixed(1)+" kg") +
    chartDateLabels(W, H, padL, padR, minT, maxT) +
  "</svg>";
}
function bwChartHtml(bwAsc) {
  if (bwAsc.length < 2) {
    return "<div style='padding:14px;text-align:center;color:#B8A8B8;font-size:12px'>Log a couple more weigh-ins to see the trend line</div>";
  }
  var pts = bwAsc.map(function(e){ return { t: new Date(e.date+"T12:00:00").getTime(), v: e.weight }; });
  return "<div style='padding:8px 4px 4px'>" + bodyweightChartSvg(pts, "#3B6FE0") + "</div>";
}

// Blood-pressure trend mini SVG line-chart (v336): systolic + diastolic as
// two lines sharing one mmHg y-axis. Background bands reuse the same
// traffic-light systolic thresholds as the BP history list (red >=140,
// amber 130-139, else green); dashed reference lines mark the diastolic
// thresholds (90/80) since one y-axis can't band both readings at once.
function bpChartSvg(points, sysColor, diaColor) {
  var W=300, H=140, padL=30, padR=36, padT=12, padB=20;
  var plotW=W-padL-padR, plotH=H-padT-padB;
  var minT=points[0].t, maxT=points[points.length-1].t;
  var vals = [];
  points.forEach(function(p){ vals.push(p.sys, p.dia); });
  vals.push(80, 90, 130, 140);
  var minV=Math.min.apply(null,vals), maxV=Math.max.apply(null,vals);
  var pad = (maxV-minV)*0.15; if (!pad) pad = 5; minV -= pad; maxV += pad;
  function xOf(t){ return minT===maxT ? padL+plotW/2 : padL+(t-minT)/(maxT-minT)*plotW; }
  function yOf(v){ return padT+(1-(v-minV)/(maxV-minV))*plotH; }
  var yTop=padT, yBottom=padT+plotH;
  function clampY(y){ return Math.max(yTop, Math.min(yBottom, y)); }
  var y140=clampY(yOf(140)), y130=clampY(yOf(130));
  var bands = "<rect x='"+padL+"' y='"+yTop+"' width='"+plotW+"' height='"+(y140-yTop).toFixed(1)+"' fill='#FCF0EC'/>" +
    "<rect x='"+padL+"' y='"+y140.toFixed(1)+"' width='"+plotW+"' height='"+(y130-y140).toFixed(1)+"' fill='#FDF6E6'/>" +
    "<rect x='"+padL+"' y='"+y130.toFixed(1)+"' width='"+plotW+"' height='"+(yBottom-y130).toFixed(1)+"' fill='#EDF6E7'/>";
  var diaLines = "<line x1='"+padL+"' x2='"+(W-padR)+"' y1='"+yOf(90).toFixed(1)+"' y2='"+yOf(90).toFixed(1)+"' stroke='#C4BCAE' stroke-width='1' stroke-dasharray='3,3'/>" +
    "<line x1='"+padL+"' x2='"+(W-padR)+"' y1='"+yOf(80).toFixed(1)+"' y2='"+yOf(80).toFixed(1)+"' stroke='#C4BCAE' stroke-width='1' stroke-dasharray='3,3'/>";
  var refLabels = [80, 90, 130, 140].map(function(v){
    return "<text x='"+(padL-5)+"' y='"+(yOf(v)+3).toFixed(1)+"' font-size='11' fill='#8A8578' text-anchor='end'>"+v+"</text>";
  }).join("");
  var sysSeries = points.map(function(p){ return { t: p.t, v: p.sys }; });
  var diaSeries = points.map(function(p){ return { t: p.t, v: p.dia }; });
  var sysPts = sysSeries.map(function(p){ return xOf(p.t).toFixed(1)+","+yOf(p.v).toFixed(1); }).join(" ");
  var diaPts = diaSeries.map(function(p){ return xOf(p.t).toFixed(1)+","+yOf(p.v).toFixed(1); }).join(" ");
  var lastSys = sysSeries[sysSeries.length-1], lastDia = diaSeries[diaSeries.length-1];
  return "<svg viewBox='0 0 "+W+" "+H+"' width='100%' height='"+H+"' style='display:block'>" +
    bands + diaLines + refLabels +
    "<polyline points='"+sysPts+"' fill='none' stroke='"+sysColor+"' stroke-width='2' stroke-linejoin='round' stroke-linecap='round'/>" +
    "<polyline points='"+diaPts+"' fill='none' stroke='"+diaColor+"' stroke-width='2' stroke-dasharray='5,3' stroke-linecap='round'/>" +
    chartDots(sysSeries, xOf, yOf, sysColor) +
    chartDots(diaSeries, xOf, yOf, diaColor) +
    chartEndLabel(xOf(lastSys.t), yOf(lastSys.v), yTop, yBottom, String(Math.round(lastSys.v))) +
    chartEndLabel(xOf(lastDia.t), yOf(lastDia.v), yTop, yBottom, String(Math.round(lastDia.v))) +
    chartDateLabels(W, H, padL, padR, minT, maxT) +
  "</svg>";
}
function bpChartHtml(bpAsc) {
  if (bpAsc.length < 2) {
    return "<div style='padding:14px;text-align:center;color:#B8A8B8;font-size:12px'>Log a couple more readings to see the trend chart</div>";
  }
  var pts = bpAsc.map(function(e){ return { t: e.ts, sys: e.sys, dia: e.dia }; });
  var legend = "<div style='display:flex;gap:16px;align-items:center;font-size:11px;color:#5A5548;padding:4px 10px 0'>" +
    "<span style='display:inline-flex;align-items:center;gap:5px'><svg width='20' height='6' style='display:block'><line x1='0' y1='3' x2='20' y2='3' stroke='#C05A3A' stroke-width='2'/></svg>Systolic</span>" +
    "<span style='display:inline-flex;align-items:center;gap:5px'><svg width='20' height='6' style='display:block'><line x1='0' y1='3' x2='20' y2='3' stroke='#5A8AC2' stroke-width='2' stroke-dasharray='5,3'/></svg>Diastolic</span>" +
  "</div>";
  return "<div style='padding:8px 4px 0'>" + bpChartSvg(pts, "#C05A3A", "#5A8AC2") + "</div>" + legend +
    "<div style='font-size:11px;color:#8A8578;padding:3px 10px 8px'>Bands: green &lt;130 &middot; amber 130&ndash;139 &middot; red &ge;140 (systolic) &middot; dotted lines = diastolic 80/90 thresholds</div>";
}

// Visual growth chart (v309, redesigned v310, true WHO centiles v347) — one
// mini SVG line-chart of the weight-for-length centile over time (same
// centile growthBand() already computes per entry), with a shaded
// 15th–85th-centile band. Needs babySex set and >=2 readings with both
// weight+height in range; otherwise shows an explanatory placeholder.
function growthChartsHtml(bd) {
  var sex = bd.babySex;
  if (!sex) {
    return "<div style='margin:0 12px 10px;padding:14px;text-align:center;color:#B8A8B8;font-size:12px;background:#fff;border-radius:10px;border:1px solid #F0EBF8'>Set the baby's sex above to see the weight-for-length centile chart</div>";
  }
  var color = sex === "girl" ? "#C2649A" : "#5A8AC2";
  var asc = (bd.growth||[]).slice().sort(function(a,b){ return a.date.localeCompare(b.date); });
  var pts = asc.filter(function(e){ return e.weight!=null && e.height!=null && growthCentile(e, sex)!=null; })
    .map(function(e){ return { t: new Date(e.date).getTime(), v: growthCentile(e, sex) }; });
  var body;
  if (pts.length < 2) {
    body = "<div style='padding:14px;text-align:center;color:#B8A8B8;font-size:12px'>Log a couple more readings (with both weight and height) to see the trend line</div>";
  } else {
    body = growthCentileChartSvg(pts, color);
  }
  return "<div style='margin:0 12px 10px;padding:8px 4px 4px;background:#fff;border-radius:10px;border:1px solid #F0EBF8'>" +
    "<div style='font-size:11px;font-weight:700;color:#8A6A8A;text-transform:uppercase;letter-spacing:.4px;padding:0 8px 2px'>Weight-for-length centile</div>" +
    body +
    "<div style='font-size:11px;color:#8A8578;padding:3px 10px 6px'>Shaded band = typical range (15th&ndash;85th centile) &middot; dashed line = WHO median</div>" +
  "</div>";
}

function latestBabyWeightRec() {
  var bd = getBD();
  var g = (bd.growth||[]).slice().sort(function(a,b){ return (b.date||"").localeCompare(a.date||""); });
  for (var i=0;i<g.length;i++){ if (g[i] && typeof g[i].weight==="number" && g[i].weight>0) return g[i]; }
  return null;
}

