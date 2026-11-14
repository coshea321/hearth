// ============================================================
// TRACK SECTION (v339) — config-driven sub-tab hosting.
// One table maps each sub-view to its container div + renderer; the
// divs keep their pre-v339 ids (see the trackSection markup comment).
// ============================================================
var currentTrackView = "log";
// Missing person on older records means Me. The picker is deliberately session-only.
function trackPersonOf(entry) { return entry && (entry.person === "wife" || entry.person === "daughter") ? entry.person : "me"; }
function trackPerson() { return document.getElementById("trackPerson").value; }
document.getElementById("trackPerson").addEventListener("change", function() {
  if (currentTrackView === "food") foodMealPicked = false;
  renderTrackView();
});
var TRACK_VIEWS = {
  log:      { div: "notesLogView",      render: function(){ renderLogView();      } },
  medicine: { div: "notesMedicineView", render: function(){ renderTrackMedicine(); } },
  food:     { div: "notesFoodView",     render: function(){ renderFoodView();     } },
  body:     { div: "trainBodyView",     render: function(){ renderBodyView();     } }
};

function renderTrackView() {
  document.querySelectorAll("#trackSubNav .tsn-btn").forEach(function(b) {
    b.classList.toggle("active", b.dataset.tview === currentTrackView);
  });
  Object.keys(TRACK_VIEWS).forEach(function(v) {
    document.getElementById(TRACK_VIEWS[v].div).style.display = v === currentTrackView ? "" : "none";
  });
  TRACK_VIEWS[currentTrackView].render();
}

document.getElementById("trackSubNav").addEventListener("click", function(e) {
  var btn = e.target.closest(".tsn-btn");
  if (!btn) return;
  currentTrackView = btn.dataset.tview;
  renderTrackView();
});

var HIDEABLE_SECTIONS = ["home", "train", "trips", "track", "sports", "famlog", "plants", "watch", "appliances", "health", "projects", "golf"]; // lists and baby are always visible; notes lives inside Lists (v318); Track hosts Log/Medicine/Body/Food (v339, Medicine added v380); Plants is opt-in (v377)

var sectionVisible = (function() {
  var stored = storeGet("fl4_secVisible") || {};
  // Default: all visible, EXCEPT Sports (v308), Train (v318), Family Log
  // (v338) and Plants (v377), which are opt-in bar icons. Train stays fully
  // usable either way — the Home Training strip is its entry point; the
  // Settings toggle just pins it back on the bar.
  // v391: "watch" is deliberately NOT in the default-off list — it's a brand-new
  // feature Cathal asked for, and a section he has to go and switch on isn't
  // delivered. One tap in Settings turns it off if the 7-icon bar is too busy.
  // v424: "appliances" joins the default-off list — it is a reference section
  // you open a few times a year, so it does not earn a permanent slot on a bar
  // that already carries seven icons. Global search reaches it either way.
  // v449: "health" joins the default-off list for the same reason as
  // appliances — a reference book you open a few times a month does not earn
  // a permanent slot on a bar that already carries seven icons, and global
  // search plus the Home "next appointment" line both reach it either way.
  // v499: "projects" joins it too — the bar already carries seven icons, and
  // the Home Today line plus global search both reach it without one.
  // v500: "golf" too — a hobby section, opted into from Settings.
  HIDEABLE_SECTIONS.forEach(function(s) { if (stored[s] === undefined) stored[s] = (s !== "sports" && s !== "train" && s !== "famlog" && s !== "plants" && s !== "appliances" && s !== "health" && s !== "projects" && s !== "golf"); });
  return stored;
})();

function saveSectionVisible() { storeSet("fl4_secVisible", sectionVisible); }

// One-off migration (v318 nav consolidation): devices that stored train:true
// before v318 also start with Train off the bar; re-pin it in Settings.
// A test build has no pre-v318 history to migrate — it wipes and reseeds
// fl4_trainNavMigrated along with everything else on every load (v407), so
// without this guard the migration re-fires every time and stomps the
// test-mode seed's train:true (v485) straight back to false.
if (!_isTestBuild && !storeGet("fl4_trainNavMigrated")) {
  sectionVisible.train = false;
  saveSectionVisible();
  storeSet("fl4_trainNavMigrated", true);
}

// v452: the bottom bar in DOM order, INCLUDING the three sections that have no
// Settings toggle (lists, recipes, baby — always on). This is the full bar, not
// just the hideable half, because the "More" overflow counts everything the user
// can actually see down there.
var NAV_ITEMS = [
  { sec:"home",   id:"bnHome"   }, { sec:"lists",  id:"bnLife"    }, { sec:"train",      id:"bnTrain"      },
  { sec:"recipes",id:"bnRecipes"}, { sec:"baby",   id:"bnBaby"    }, { sec:"trips",      id:"bnTrips"      },
  { sec:"track",  id:"bnTrack"  }, { sec:"plants", id:"bnPlants"  }, { sec:"watch",      id:"bnWatch"      },
  { sec:"appliances", id:"bnAppliances" }, { sec:"sports", id:"bnSports" }, { sec:"famlog", id:"bnFamlog"  },
  { sec:"health", id:"bnHealth" }, { sec:"projects", id:"bnProjects" }, { sec:"golf", id:"bnGolf" }
];
// Five icons is what fits comfortably on a phone bar; a sixth slot is the More
// button itself. Raising this doesn't widen the bar, it just crams it.
var NAV_BAR_MAX = 5;
// Section keys currently pushed off the bar and into the More sheet. Empty
// whenever five or fewer sections are on — the More button is hidden then.
var navOverflow = [];

// A section is on the bar if it has no Settings toggle at all (lists, recipes,
// baby) or its toggle is on.
function navSectionOn(sec) {
  return HIDEABLE_SECTIONS.indexOf(sec) === -1 || !!sectionVisible[sec];
}

function navIdForSection(sec) {
  var item = NAV_ITEMS.find(function(i) { return i.sec === sec; });
  return item ? item.id : "";
}

function applySectionVisibility() {
  var shown = NAV_ITEMS.filter(function(it) { return navSectionOn(it.sec); });
  var overflowing = shown.length > NAV_BAR_MAX;
  var onBar = overflowing ? shown.slice(0, NAV_BAR_MAX) : shown;
  navOverflow = overflowing ? shown.slice(NAV_BAR_MAX).map(function(it) { return it.sec; }) : [];
  NAV_ITEMS.forEach(function(it) {
    var btn = document.getElementById(it.id);
    if (btn) btn.style.display = onBar.indexOf(it) === -1 ? "none" : "";
  });
  var more = document.getElementById("bnMore");
  if (more) more.style.display = overflowing ? "" : "none";
  syncMoreActive();
}

// switchSection() rewrites every bn-btn className from scratch, so the More
// button's highlight is set the same way — it lights up while the section you
// are looking at is one of the overflow ones.
function syncMoreActive() {
  var more = document.getElementById("bnMore");
  if (more) more.className = "bn-btn" + (navOverflow.indexOf(currentSection) !== -1 ? " more-active" : "");
}

// Built from the nav buttons themselves (icon + aria-label) so the sheet can
// never drift from the bar. Top-level, per the renderer-helper rule.
function renderMoreSheet() {
  var el = document.getElementById("moreList");
  if (!el) return;
  var html = "";
  navOverflow.forEach(function(sec) {
    var btn = document.getElementById(navIdForSection(sec));
    if (!btn) return;
    var icoEl = btn.querySelector(".bn-ico");
    html += "<button class='more-row" + (sec === currentSection ? " current" : "") + "' data-sec='" + esc(sec) + "'>" +
      "<span class='more-ico'>" + esc(icoEl ? icoEl.textContent : "") + "</span>" +
      "<span class='more-name'>" + esc(btn.getAttribute("aria-label") || sec) + "</span>" +
      "</button>";
  });
  if (!html) html = "<div style='text-align:center;color:#7A8772;padding:16px;font-size:14px'>Nothing here right now.</div>";
  el.innerHTML = html;
}

function closeMoreSheet() { document.getElementById("moreOverlay").classList.remove("open"); }

// Wire section toggles in settings
document.getElementById("settingsBtn").addEventListener("click", function() {
  // Restore toggle states
  document.querySelectorAll(".section-chk").forEach(function(chk) {
    chk.checked = sectionVisible[chk.dataset.sec] !== false;
  });
  renderCustomCatsList();
  document.getElementById("settingsOverlay").classList.add("open");
});

document.getElementById("sectionToggles").addEventListener("change", function(e) {
  var chk = e.target;
  if (!chk.classList.contains("section-chk")) return;
  var sec = chk.dataset.sec;
  sectionVisible[sec] = chk.checked;
  saveSectionVisible();
  applySectionVisibility();
  // If we just hid the current section, navigate to the first visible one
  if (!chk.checked && currentSection === sec) {
    var fallback = ["lists","baby","train","home"].find(function(s) {
      return s === "lists" || s === "baby" || sectionVisible[s];
    });
    switchSection(fallback || "lists");
  }
});

document.getElementById("settingsOverlay").addEventListener("click", function(e){ if(e.target===this) this.classList.remove("open"); });
document.getElementById("settingsClose").addEventListener("click", function(){ document.getElementById("settingsOverlay").classList.remove("open"); });

function renderCustomCatsList() {
  var el = document.getElementById("customCatsList");
  var allCustom = {}, hasAny = false;
  ["grocery","todo","travel","personal"].forEach(function(lt) {
    var cc = getCustomCats(lt);
    if (cc.length) { allCustom[lt] = cc; hasAny = true; }
  });
  if (!hasAny) {
    el.innerHTML = "<div style='text-align:center;color:#7A8772;padding:20px;font-size:14px'>No custom categories yet.<br>Add them from the category picker when adding an item.</div>";
    return;
  }
  var html = "";
  ["grocery","todo","travel","personal"].forEach(function(lt) {
    var cc = allCustom[lt]; if (!cc) return;
    html += "<div style='font-size:12px;font-weight:700;color:#7A8772;margin-bottom:6px;margin-top:12px;text-transform:uppercase'>"+lt+"</div>";
    cc.forEach(function(c, idx) {
      html += "<div style='display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fff;border-radius:9px;margin-bottom:5px;box-shadow:0 1px 4px rgba(0,0,0,.07)'>" +
        "<span style='font-size:20px'>"+catEmojiSafe(c.emoji)+"</span>" +
        "<span style='flex:1;font-size:15px;font-weight:500'>"+esc(c.name)+"</span>" +
        "<span style='font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:"+catColorSafe(c.bg,"#EDEAE4")+";color:"+catColorSafe(c.fg,"#4A4A3A")+"'>"+esc(c.name)+"</span>" +
        "<button class='del-btn' style='opacity:.5' data-lt='"+esc(lt)+"' data-idx='"+esc(idx)+"'>&#x2715;</button>" +
        "</div>";
    });
  });
  el.innerHTML = html;
  el.querySelectorAll(".del-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var lt = btn.dataset.lt, idx = +btn.dataset.idx;
      var cc = getCustomCats(lt);
      cc.splice(idx, 1);
      saveCustomCats(lt, cc);
      renderCustomCatsList();
      toast("Category removed");
    });
  });
}

// ── Logout ────────────────────────────────────────────────
document.getElementById("logoutBtn").addEventListener("click", function() {
  confirmDialog("Log out?", function() {
    logout(); document.getElementById("syncOverlay").classList.remove("open");
  });
});

// ── Leave household ───────────────────────────────────────
document.getElementById("leaveHouseholdBtn").addEventListener("click", function() {
  confirmDialog("Leave this household?", function() {
    if (hearthSyncES) { hearthSyncES.close(); hearthSyncES = null; }
    firebaseFetch(houseUrl("/members/" + hearthUser), { method:"DELETE" }).catch(function(){});
    firebaseFetch(userUrl("/household"), { method:"DELETE" }).catch(function(){});
    hearthHouse = ""; storeSet("hearth_household","");
    _householdFetchOk = false; // v419: the next household must be read before we push to it
    renderSyncModal(); updateSyncStatus(); toast("Left household");
  });
});

// ── Join household ────────────────────────────────────────
document.getElementById("joinHouseholdBtn").addEventListener("click", function() {
  if (btnBusy(this)) return;
  var code = document.getElementById("joinHouseholdInput").value.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
  if (code.length < 4) { toast("Enter a valid code"); return; }
  hearthHouse = code; storeSet("hearth_household", code);
  firebaseFetch(houseUrl("/members/"+hearthUser), {method:"PUT",body:JSON.stringify(true),headers:{"Content-Type":"application/json"}}).catch(function(){});
  firebaseFetch(userUrl("/household"), {method:"PUT",body:JSON.stringify(code),headers:{"Content-Type":"application/json"}}).catch(function(){});
  fetchHousehold(function(){ pushHousehold(); startListening(); });
  renderSyncModal(); toast("Joined: " + code);
});

// ── Create household ──────────────────────────────────────
document.getElementById("createHouseholdBtn").addEventListener("click", function() {
  if (btnBusy(this)) return;
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", code = "";
  for (var i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)];
  hearthHouse = code; storeSet("hearth_household", code);
  firebaseFetch(houseUrl("/members/"+hearthUser), {method:"PUT",body:JSON.stringify(true),headers:{"Content-Type":"application/json"}}).catch(function(){});
  firebaseFetch(userUrl("/household"), {method:"PUT",body:JSON.stringify(code),headers:{"Content-Type":"application/json"}}).catch(function(){});
  // v419: a household we just invented has nothing to read, so open the push
  // guard explicitly — without this the creating device could never push and
  // would sit silently receive-only in its own new household.
  _householdFetchOk = true;
  pushHousehold(); startListening();
  var inp = document.getElementById("joinHouseholdInput"); if(inp) inp.value = code;
  renderSyncModal(); toast("Household created: " + code);
});

// ── Sync toggles ──────────────────────────────────────────
document.getElementById("syncToggles").addEventListener("change", function(e) {
  var chk = e.target; if (!chk.classList.contains("sync-chk")) return;
  syncPrefs[chk.dataset.key] = chk.checked; saveSyncPrefs();
  if (isSynced("health")) pushPersonal(); else if (isHouseholdSet()) pushHousehold();
});

// ── Section visibility toggles ────────────────────────────
document.querySelectorAll(".section-chk").forEach(function(chk) {
  chk.addEventListener("change", function() {
    sectionVisible[chk.dataset.sec] = chk.checked;
    saveSectionVisible(); applySectionVisibility();
  });
});

// ── Export ────────────────────────────────────────────────
function buildExportPayload() {
  ["grocery","todo","travel","personal"].forEach(function(lt){ loadListData(lt); });
  var now=new Date(), pad=function(x){return x<10?"0"+x:""+x;};
  var localDate=now.getFullYear()+"-"+pad(now.getMonth()+1)+"-"+pad(now.getDate());
  var localTime=pad(now.getHours())+":"+pad(now.getMinutes())+":"+pad(now.getSeconds());
  var tzOffset=now.getTimezoneOffset(), tzSign=tzOffset<=0?"+":"-", tzAbs=Math.abs(tzOffset);
  var tzStr=tzSign+pad(Math.floor(tzAbs/60))+":"+pad(tzAbs%60);
  var localIso=localDate+"T"+localTime+tzStr;
  // EXPORT COVERAGE (check on each release that new data types are included):
  //  lists (items+hist), notes, customCats — per list
  //  workouts (incl. bodyweight + bp), baby (incl. growth, medicine, milestones,
  //  teeth, bags, babySex), action_log (incl. cardio), track_med (Track section's
  //  family medicine log, v380 — factual only, personal-only sync, distinct
  //  from Baby's dosing medicine), food_log, food_notes,
  //  saved_meals, cal_goal + cal_goal_ts, profile + profile_ts (v439 — height/
  //   year of birth/sex/activity/rate/target weight, the inputs to the TDEE
  //   estimate; the two _ts stamps are v441, the newest-wins keys), secVisible,
  //  syncPrefs, recipes (list import recipes),
  //  travel_tags (Travel tag pool; per-item tags live on the items themselves),
  //  recipebook (Recipes section), trips (Trips section, incl. nested bookings),
  //  mealplan (week dinner planner, v317),
  //  plants (Plants section, v377 — incl. the photo thumbnail and the
  //   watering/feeding logs, which all ride inside the plant records),
  //  watchlist (Watchlist section, v391 — incl. the watching/watched status,
  //   the season (v392), the ★ rating and any pasted link; the info links are
  //   built from the title at render time and are deliberately never stored),
  //  appliances (Home inventory, v424/v428 — every field is plain text on the
  //   record, so one key covers it; the manual/photos/receipt are LINKS and
  //   notes, never image bytes),
  //  health (Health section, v449 — the medical history. Every kind lives in
  //   the one array with a `kind` field, so one key covers visits, diagnoses,
  //   conditions, tests, medication, vaccinations and contacts alike. The
  //   per-record `files` array rides inside the record; it holds LINKS to
  //   letters and scans, never the documents themselves).
  //  projects (Projects section, v499 — each project carries its typed items
  //   (tasks, quotes, costs, contacts, links) inside the record, so one key
  //   covers them; links are links, never files).
  //  pullup (Train › Pull-up Plan, v482 — the ticks, the Week 4 test result
  //   and which sessions were saved to History; export/backup only, not synced).
  //  NOT exported (intentional — UI/transient state only): fl4_catOpen_*,
  //  fl4_doneOpen_*, fl4_seen_*, fl4_unseen_*, fl4_last_backup, fl4_backup_snooze,
  //  fl4_last_cloudbackup, fl4_tomb_* (sync deletion tombstones),
  //  fl4_mealplan_prompted (device-local weekly roll-over banner marker, v362),
  //  fl4_pullup_open (v482: which Pull-up Plan session is expanded, device UI),
  //  fl4_proj_folds (v516: which Projects detail sections are folded, device UI),
  //  fl4_recipe_opens (v506: per-device recipe open counts for the Favourites order),
  //  fl4_tidy_undo (v366: device-local single-slot receipt for putting a recipe
  //   tidy back; a short-lived safety net, deliberately not version history).
  //  Used by BOTH the manual file export and the daily cloud backup — one
  //  payload definition, so coverage can never drift between the two.
  var exportData = {
    version:5, exportedAt:localIso,
    lists:{}, notes:{}, customCats:{},
    workouts:getWD(), baby:getBD(),
    action_log:getActionLog(), track_med:getTrackMed(), food_log:getFoodLog(),
    food_notes:storeGet("fl4_food_notes")||{},
    saved_meals:storeGet("fl4_saved_meals")||[],
    recipes:storeGet("fl4_recipes")||[],
    travel_tags:storeGet("fl4_travel_tags")||[],
    recipebook:storeGet("fl4_recipebook")||[],
    mealplan:storeGet("fl4_mealplan")||[],
    trips:storeGet("fl4_trips")||[],
    plants:storeGet("fl4_plants")||[],
    watchlist:storeGet("fl4_watchlist")||[],
    appliances:storeGet("fl4_appliances")||[],
    health:storeGet("fl4_health")||[],
    projects:storeGet("fl4_projects")||[],
    golf:storeGet("fl4_golf")||[],
    pullup:pullupState(),
    cal_goal:storeGet("fl4_cal_goal")||2000,
    cal_goal_ts:+storeGet("fl4_cal_goal_ts")||0,
    profile:storeGet("fl4_profile")||{},
    profile_ts:+storeGet("fl4_profile_ts")||0,
    secVisible:storeGet("fl4_secVisible")||{},
    syncPrefs:storeGet("fl4_syncPrefs")||{}
  };
  ["grocery","todo","travel","personal"].forEach(function(lt){
    var d=listData[lt]||{items:[],hist:[]};
    exportData.lists[lt]={items:d.items,hist:d.hist};
    exportData.notes[lt]=getNotes(lt);
    exportData.customCats[lt]=getCustomCats(lt);
  });
  exportData.notes["global"]=storeGet("fl4_notes_global")||[];
  exportData.notes["global_work"]=storeGet("fl4_notes_global_work")||[];
  return exportData;
}
function exportAllData() {
  var exportData=buildExportPayload();
  var now=new Date(), pad=function(x){return x<10?"0"+x:""+x;};
  var localDate=now.getFullYear()+"-"+pad(now.getMonth()+1)+"-"+pad(now.getDate());
  var blob=new Blob([JSON.stringify(exportData,null,2)],{type:"application/json"});
  var url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download="hearth-backup-"+localDate+"_"+pad(now.getHours())+pad(now.getMinutes())+".json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  storeSet("fl4_last_backup", Date.now());
  updateLastBackupInfo();
  dismissBackupNudge();
  toast("Exported!");
}
document.getElementById("exportBtn").addEventListener("click", exportAllData);

// ── Backup-on-login nudge ──────────────────────────────────
// fl4_last_backup / fl4_backup_snooze are transient UI state (NOT exported).
function dismissBackupNudge(){ var b=document.getElementById("backupNudge"); if(b) b.style.display="none"; }
function fmtBackupTime(ts){
  if(!ts) return "never";
  var d=new Date(ts), p=function(x){return x<10?"0"+x:""+x;};
  var mon=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return p(d.getDate())+" "+mon[d.getMonth()]+" "+d.getFullYear()+", "+p(d.getHours())+":"+p(d.getMinutes());
}
function updateLastBackupInfo(){
  var el=document.getElementById("lastBackupInfo");
  if(el) el.textContent="Last backup: "+fmtBackupTime(storeGet("fl4_last_backup")||0);
}
function maybeShowBackupNudge(){
  try {
    var DAY = 24*3600*1000;
    var GAP = 30*DAY;             // suggest a file export if none in 30 days
                                  // (was 7 — relaxed in v287: the daily cloud
                                  // backup covers everyday risk; the downloaded
                                  // file guards against losing Firebase itself)
    var SNOOZE = 2*DAY;           // after dismiss, stay quiet for 2 days
    var last = storeGet("fl4_last_backup") || 0;
    var snooze = storeGet("fl4_backup_snooze") || 0;
    if (Date.now() - snooze < SNOOZE) return;   // recently dismissed
    if (Date.now() - last < GAP)      return;   // backed up recently
    var days = last ? Math.floor((Date.now()-last)/DAY) : 0;
    var sub = document.getElementById("backupNudgeSub");
    if (sub) sub.textContent = last
      ? ("Last backup was " + days + " day" + (days!==1?"s":"") + " ago.")
      : "You haven't exported a backup yet.";
    var b = document.getElementById("backupNudge"); if (b) b.style.display = "flex";
  } catch(e){}
}
(function(){
  var now = document.getElementById("backupNudgeNow");
  if (now) now.addEventListener("click", exportAllData);
  var later = document.getElementById("backupNudgeLater");
  if (later) later.addEventListener("click", function(){ storeSet("fl4_backup_snooze", Date.now()); dismissBackupNudge(); });
  updateLastBackupInfo();
  if (typeof updateCloudBackupInfo === "function") updateCloudBackupInfo();
})();
// ── Meal-plan weekly roll-over prompt (v362) ───────────────
// fl4_mealplan_prompted is transient device-local UI state (NOT exported):
// the Monday-anchored day-string of the week the banner was last shown or
// dismissed, so it fires (or stays quiet) at most once per week per device.
// Deliberately PROMPT-FIRST, never auto-fills — see the 27/07/2026 design
// call: two devices opening independently before syncing must never
// silently auto-fill and land the same dinner on two days.
function mealPlanCurrentWeekKey(d) {
  d = d || new Date();
  var day = d.getDay(); // 0=Sun..6=Sat
  var diff = day === 0 ? -6 : 1 - day; // offset back to Monday
  var mon = new Date(d); mon.setDate(d.getDate() + diff);
  return mon.getFullYear() + "-" + t2(mon.getMonth()+1) + "-" + t2(mon.getDate());
}
function dismissMealPlanBanner(){ var b=document.getElementById("mealPlanBanner"); if(b) b.style.display="none"; }
function markMealPlanPrompted(){ storeSet("fl4_mealplan_prompted", mealPlanCurrentWeekKey()); }
function maybeShowMealPlanBanner(){
  try {
    var wk = mealPlanCurrentWeekKey();
    if ((storeGet("fl4_mealplan_prompted") || "") === wk) return; // already prompted/acted this week
    var b = document.getElementById("mealPlanBanner"); if (b) b.style.display = "flex";
  } catch(e){}
}
(function(){
  var go = document.getElementById("mealPlanBannerGo");
  // v410: used to chain straight into a confirmDialog offering to add the
  // filled week to groceries — easy to tap through without registering what
  // it was asking. Now lands on the Week Plan screen instead, so the filled
  // days are visible and "Add week to groceries" is a fully deliberate tap
  // on the existing green button (renderMealPlanner), not a stacked prompt.
  if (go) go.addEventListener("click", function(){
    markMealPlanPrompted();
    dismissMealPlanBanner();
    runMealPlanFill();
    _recipeScrollPos = window.scrollY || document.documentElement.scrollTop;
    _recipeView = "plan";
    switchSection("recipes");
  });
  var later = document.getElementById("mealPlanBannerLater");
  if (later) later.addEventListener("click", function(){ markMealPlanPrompted(); dismissMealPlanBanner(); });
})();
// ── Daily cloud backup (v287) ──────────────────────────────
// Once a day (per device), quietly PUT the full export payload to the user's
// own Firebase area: /hearth/users/<user>/backups/<YYYY-MM-DD>. Date-keyed, so
// a second device writing the same day is a harmless idempotent overwrite.
// Keeps the newest CLOUD_BACKUP_KEEP snapshots, prunes older after each write.
// Silent on any failure (offline, no token) — simply retries on the next app
// open. fl4_last_cloudbackup is transient device-local state (NOT exported).
var CLOUD_BACKUP_KEEP = 7;
function cloudBackupDateKey(ts){
  var d=new Date(ts), p=function(x){return x<10?"0"+x:""+x;};
  return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());
}
function updateCloudBackupInfo(){
  var el=document.getElementById("lastCloudBackupInfo");
  if(el) el.textContent="Last cloud backup: "+fmtBackupTime(storeGet("fl4_last_cloudbackup")||0);
}
function maybeCloudBackup(){
  try {
    if (_isTestBuild) return;
    if (!isLoggedIn() || navigator.onLine === false) return;
    var last = storeGet("fl4_last_cloudbackup") || 0;
    if (last && cloudBackupDateKey(last) === cloudBackupDateKey(Date.now())) return; // already done today
    var payload;
    try { payload = buildExportPayload(); } catch(e){ return; }
    var key = cloudBackupDateKey(Date.now());
    firebaseFetch(userUrl("/backups/" + key), { method:"PUT", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) })
      .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); })
      .then(function(){
        storeSet("fl4_last_cloudbackup", Date.now());
        updateCloudBackupInfo();
        pruneCloudBackups();
      })
      .catch(function(e){ console.log("cloud backup skipped (will retry next open): " + (e&&e.message)); });
  } catch(e){}
}
function pruneCloudBackups(){
  firebaseFetch(userUrl("/backups") + "?shallow=true").then(function(r){ return r.json(); }).then(function(keys){
    if (!keys || typeof keys !== "object") return;
    var names = Object.keys(keys).sort(); // YYYY-MM-DD keys sort chronologically
    for (var i = 0; i < names.length - CLOUD_BACKUP_KEEP; i++) {
      firebaseFetch(userUrl("/backups/" + names[i]), { method:"DELETE" }).catch(function(){});
    }
  }).catch(function(){});
}
// Re-check on app open: resume from background after being away a while (not quick switches).
var _bgHiddenAt = 0;
document.addEventListener("visibilitychange", function(){
  if (document.hidden) { _bgHiddenAt = Date.now(); return; }
  if (Date.now() - _bgHiddenAt > 30*1000 && isLoggedIn() && typeof maybeShowBackupNudge === "function") maybeShowBackupNudge();
  if (Date.now() - _bgHiddenAt > 30*1000 && isLoggedIn() && typeof maybeCloudBackup === "function") maybeCloudBackup();
  if (Date.now() - _bgHiddenAt > 30*1000 && isLoggedIn() && typeof maybeShowMealPlanBanner === "function") maybeShowMealPlanBanner();
});

// ── Import ────────────────────────────────────────────────
// importBackupData(data) — shared merge used by BOTH the file import and the
// cloud-backup restore (v288). Additive only: items/recipes/trips/notes whose
// id is missing locally are added; existing entries are never overwritten or
// deleted. Every ADDED list item, recipe, trip and booking is stamped
// updated=now and any matching deletion tombstone is cleared — without this,
// restoring something deleted since the snapshot would be silently re-deleted
// by the newest-wins + tombstone sync merge on the next pull.
// (Edge case accepted: a restored copy of an item the partner edited under the
// same id wins over their edit via the fresh stamp — rare, additive-only.)
function importBackupData(data) {
  // v445: every collection this function can ADD to must be counted here, or
  // the toast reports "Nothing new to import" while the restore quietly worked
  // -- Cathal hit exactly that restoring a saved meal and a food entry. If you
  // add a new store to importBackupData, add its counter here AND a line in
  // importedSummary; a restore that silently reports nothing reads as a broken
  // backup file, which is the worst thing a backup can do.
  var imported={lists:0,recipes:0,trips:0,notes:0,food:0,meals:0,plants:0,
                watchlist:0,inventory:0,health:0,projects:0,golf:0,pullup:0,logEntries:0,medEntries:0,workouts:0,baby:0,
                // v462: records the file held that were deliberately NOT restored
                // because they are deleted medical data. Counted separately and
                // kept OUT of IMPORT_LABELS on purpose -- it is not a record type,
                // it is the honest other half of the count.
                skipped:0};
  if(data.lists){
    ["grocery","todo","travel","personal"].forEach(function(lt){
      if(!data.lists[lt]) return;
      var d=data.lists[lt]; loadListData(lt);
      var ex=listData[lt]||{items:[],hist:[]}, exIds={};
      ex.items.forEach(function(x){exIds[x.id]=true;});
      var newItems=(d.items||[]).filter(function(x){return x&&!exIds[x.id];});
      if(newItems.length){
        var tombs=getTombs(lt), tChanged=false;
        newItems.forEach(function(x){ x.updated=Date.now(); if(tombs[x.id]!==undefined){ delete tombs[x.id]; tChanged=true; } });
        if(tChanged) storeSet("fl4_tomb_"+lt, tombs);
      }
      // v323: local hist tombstones apply on import too — restoring a backup
      // does NOT resurrect deleted history entries (deliberate; items do resurrect, above).
      var _mergedItems=newItems.concat(ex.items);
      listData[lt]={items:_mergedItems,hist:mergeHist(ex.hist,d.hist||[],getTombs(histTombKey(lt)),_mergedItems)};
      storeSet(LIST_CONFIG[lt].key,listData[lt]); imported.lists+=newItems.length;
    });
  }
  if(data.workouts&&typeof data.workouts==="object"){
    var wd=getWD(); var wIds={}; wd.workouts.forEach(function(w){wIds[w.id]=true;});
    var newW=(data.workouts.workouts||[]).filter(function(w){return w&&!wIds[w.id];});
    imported.workouts=newW.length;
    wd.workouts=newW.concat(wd.workouts);
    // v352: bodyweight/bp were dropped on restore (fix-queue batch A, finding 1).
    // Additive union, keep-local on a same-date/same-ts collision (Cathal's call,
    // consistent with the rest of this function being additive-only).
    var bwIdx={}; (data.workouts.bodyweight||[]).forEach(function(e){if(e&&e.date)bwIdx[trackPersonOf(e)+":"+e.date]=e;});
    (wd.bodyweight||[]).forEach(function(e){if(e&&e.date)bwIdx[trackPersonOf(e)+":"+e.date]=e;});
    wd.bodyweight=Object.values(bwIdx).sort(function(a,b){return (b.date||"").localeCompare(a.date||"");});
    var bpIdx={}; (data.workouts.bp||[]).forEach(function(e){if(e&&e.ts)bpIdx[e.ts]=e;});
    (wd.bp||[]).forEach(function(e){if(e&&e.ts)bpIdx[e.ts]=e;});
    wd.bp=Object.values(bpIdx).sort(function(a,b){return (b.ts||0)-(a.ts||0);});
    saveWD(wd);
  }
  if(data.baby&&typeof data.baby==="object"){
    var bd=getBD(),bd2=data.baby;
    var mArr=function(a,b,key){var s={};a.forEach(function(x){if(x)s[x[key]]=true;});return a.concat((b||[]).filter(function(x){return x&&!s[x[key]];}));};
    // v329: local medicine tombstones apply on import too — restoring a backup
    // does NOT resurrect a deleted dose within the 90d window (deliberate,
    // matches the v323 history rule: a dose delete is a correction of safety
    // data and must stick; list items still resurrect per v288). v371: growth
    // (by date) and milestones (by id) now get the same tombstone filter.
    var medT=getTombs("med"), growthT=getTombs("growth"), msT=getTombs("ms");
    var _bBefore=(bd.growth||[]).length+(bd.medicine||[]).length+(bd.milestones||[]).length;
    bd.growth=mArr(bd.growth||[],(bd2.growth||[]).filter(function(g){return g&&!(growthT[g.date]!=null&&growthT[g.date]>=(g.updated||0));}),"date");
    bd.medicine=mArr(bd.medicine||[],(bd2.medicine||[]).filter(function(m){return m&&!(medT[m.id]!=null&&medT[m.id]>=medUpdatedTs(m));}),"id");
    bd.milestones=mArr(bd.milestones||[],(bd2.milestones||[]).filter(function(m){return m&&!(msT[m.id]!=null&&msT[m.id]>=medUpdatedTs(m));}),"id"); bd.teeth=Object.assign({},bd2.teeth||{},bd.teeth||{});
    imported.baby=((bd.growth||[]).length+(bd.medicine||[]).length+(bd.milestones||[]).length)-_bBefore;
    bd.bottles=mergeBottles(bd.bottles||{},bd2.bottles||{});
    if(bd2.babySex && !bd.babySex) bd.babySex=bd2.babySex;
    bd.bags=mergeBags(bd.bags,bd2.bags,getTombs("bags"),getTombs("bagitems")); // v478: was "only if local is empty", which after one visit to the Bags tab (it seeds defaults) was never true -- a restore could not bring bags back. Tombstones still apply, per the v329 restore policy.
    saveBD(bd);
  }
  // v462: reviving a restored entry takes BOTH halves, and each covers a case
  // the other cannot. The updated=now stamp out-ranks the tombstone the OTHER
  // device holds (mergeTombs pulls that copy back in on the next pull, so
  // deleting it locally could never work -- the v443 saved-meals repair failed
  // for exactly that reason). Clearing THIS device's tombstone covers the tie:
  // the filters use `tomb >= record`, so a tombstone written in the same
  // millisecond as the restore would otherwise still win. Both, or neither
  // works -- this is the shape saved_meals and recipebook already use.
  if(Array.isArray(data.action_log)){
    var al=getActionLog(),alIds={};al.forEach(function(x){alIds[x.id]=true;});
    var newAl=data.action_log.filter(function(x){return x&&!alIds[x.id];});
    if(newAl.length){
      var alTombsR=getTombs("action_log"), alChanged=false;
      newAl.forEach(function(x){ x.updated=Date.now(); if(alTombsR[x.id]!==undefined){ delete alTombsR[x.id]; alChanged=true; } });
      if(alChanged) storeSet("fl4_tomb_action_log", alTombsR);
      storeSet("fl4_action_log",newAl.concat(al));
    }
    imported.logEntries=newAl.length;
  }
  // v462: the one collection here that does NOT come back. A deleted medicine
  // record is medical data, so the deletion stands (Cathal, 05/09/2026) -- the
  // same rule baby growth/medicine/milestones already follow. It used to be
  // restored and counted as imported, then filtered straight back out by the
  // next sync, so the count was a promise the app could not keep. Now it is
  // skipped and reported. Do NOT "fix" this by clearing the tombstone.
  if(Array.isArray(data.track_med)){
    var tm=getTrackMed(),tmIds={};tm.forEach(function(x){tmIds[x.id]=true;});
    var tmTombs=getTombs("track_med"), newTm=[];
    data.track_med.forEach(function(x){
      if(!x||tmIds[x.id]) return;
      if(tmTombs[x.id]!==undefined){ imported.skipped++; return; }
      newTm.push(x);
    });
    imported.medEntries=newTm.length;
    if(newTm.length)storeSet("fl4_track_med",newTm.concat(tm));
  }
  if(Array.isArray(data.food_log)){
    var fl=getFoodLog(),flIds={};fl.forEach(function(x){flIds[x.id]=true;});
    var newFl=data.food_log.filter(function(x){return x&&!flIds[x.id];});
    if(newFl.length){
      var flTombsR=getTombs("food_log"), flChanged=false;
      newFl.forEach(function(x){ x.updated=Date.now(); if(flTombsR[x.id]!==undefined){ delete flTombsR[x.id]; flChanged=true; } });
      if(flChanged) storeSet("fl4_tomb_food_log", flTombsR);
      storeSet("fl4_food_log",newFl.concat(fl));
    }
    imported.food=newFl.length;
  }
  if(data.food_notes){var fn=storeGet("fl4_food_notes")||{};Object.keys(data.food_notes).forEach(function(k){if(!fn[k])fn[k]=data.food_notes[k];});storeSet("fl4_food_notes",fn);}
  // Saved meals: additive only, and a restored meal CLEARS any matching
  // tombstone — the same shape as the recipebook/plants/watchlist restores
  // below. v443 gave saved meals deletion tombstones for the sync merge but
  // left this line alone, so a restored meal reappeared and was then silently
  // filtered straight back out by the next pull. Resurrecting is deliberate
  // (Cathal, 30/08/2026) and matches its neighbours: a saved meal is a logging
  // shortcut, not safety data like a dose, so it follows the list-item rule and
  // NOT the medicine one. Note this still does not tomb-FILTER the incoming
  // side, which v443 deliberately avoided so a test-build re-seed can restore
  // the demo meals.
  if(Array.isArray(data.saved_meals)){
    var sm=storeGet("fl4_saved_meals")||[],smIds={};sm.forEach(function(m){if(m)smIds[m.id]=true;});
    var newSm=data.saved_meals.filter(function(m){return m&&m.id!=null&&!smIds[m.id];});
    if(newSm.length){
      var smTombsR=getTombs("saved_meals"), smChanged=false;
      // v462: the updated stamp is what actually revives it across devices;
      // the local clear below is kept so THIS device is right immediately.
      newSm.forEach(function(m){ m.updated=Date.now(); if(smTombsR[m.id]!==undefined){ delete smTombsR[m.id]; smChanged=true; } });
      if(smChanged) storeSet("fl4_tomb_saved_meals", smTombsR);
      storeSet("fl4_saved_meals", sm.concat(newSm));
      imported.meals=newSm.length;
    }
  }
  if(Array.isArray(data.recipes)){var rc=storeGet("fl4_recipes")||[],rcN={};rc.forEach(function(m){if(m)rcN[m.name.toLowerCase()]=true;});storeSet("fl4_recipes",rc.concat(data.recipes.filter(function(m){return m&&m.name&&!rcN[m.name.toLowerCase()];})));}
  if(Array.isArray(data.travel_tags)){var tt=storeGet("fl4_travel_tags")||[];data.travel_tags.forEach(function(t){if(t&&!tt.some(function(x){return x.toLowerCase()===t.toLowerCase();}))tt.push(t);});storeSet("fl4_travel_tags",tt);}
  if(Array.isArray(data.recipebook)){
    var rb2=storeGet("fl4_recipebook")||[],rbIds={};rb2.forEach(function(m){if(m)rbIds[m.id]=true;});
    var newRb=data.recipebook.filter(function(m){return m&&m.id!=null&&!rbIds[m.id];});
    if(newRb.length){
      var rTombs=getTombs("recipes"), rChanged=false;
      newRb.forEach(function(r){ r.updated=Date.now(); if(rTombs[r.id]!==undefined){ delete rTombs[r.id]; rChanged=true; } });
      if(rChanged) storeSet("fl4_tomb_recipes", rTombs);
      storeSet("fl4_recipebook", rb2.concat(newRb));
    }
    imported.recipes=newRb.length;
  }
  // Plants: additive only, same shape as the recipebook restore above — a
  // plant whose id is already here is left exactly as it is (its watering log
  // is more current than the snapshot's), and a restored plant is stamped
  // updated=now with any matching tombstone cleared so the next sync pull
  // doesn't quietly re-delete it.
  if(Array.isArray(data.plants)){
    var pl2=storeGet("fl4_plants")||[],plIds={};pl2.forEach(function(m){if(m)plIds[m.id]=true;});
    var newPl=data.plants.filter(function(m){return m&&m.id!=null&&!plIds[m.id];});
    if(newPl.length){
      var plTombsR=getTombs("plants"), plChanged=false;
      newPl.forEach(function(r){ r.updated=Date.now(); if(plTombsR[r.id]!==undefined){ delete plTombsR[r.id]; plChanged=true; } });
      if(plChanged) storeSet("fl4_tomb_plants", plTombsR);
      storeSet("fl4_plants", pl2.concat(newPl));
      imported.plants=newPl.length;
    }
  }
  // Pull-up Plan (v482): additive, see pullupImport.
  if(data.pullup && typeof data.pullup==="object") imported.pullup=pullupImport(data.pullup);
  // Health: additive only, same shape as the plants/watchlist restores below
  // — a record whose id is already here is left exactly as it is, and a
  // restored one is stamped updated=now with any matching tombstone cleared
  // so the next sync pull doesn't quietly re-delete it.
  if(Array.isArray(data.health)){
    var hl2=storeGet("fl4_health")||[],hlIds={};hl2.forEach(function(m){if(m)hlIds[m.id]=true;});
    var newHl=data.health.filter(function(m){return m&&m.id!=null&&!hlIds[m.id];});
    if(newHl.length){
      var hlTombsR=getTombs("health"), hlChanged=false;
      // Every url is re-gated on the way IN, not just on the way out: a
      // hand-edited backup file is exactly the path that reaches the store
      // without passing an editor (audit finding F3). healthFileList does the
      // same gating at render, so a file that slips past here still cannot
      // become an href — this keeps the stored record clean as well.
      newHl.forEach(function(r){
        r.updated=Date.now();
        r.link=applianceLinkUrl(r.link);
        if(Array.isArray(r.files)) r.files=r.files.filter(function(f){ return f&&typeof f==="object"&&applianceLinkUrl(f.url); })
          .map(function(f){ return { label:String(f.label||"").trim(), url:applianceLinkUrl(f.url) }; });
        else r.files=[];
        if(hlTombsR[r.id]!==undefined){ delete hlTombsR[r.id]; hlChanged=true; }
      });
      if(hlChanged) storeSet("fl4_tomb_health", hlTombsR);
      storeSet("fl4_health", hl2.concat(newHl));
      imported.health=newHl.length;
    }
  }
  // Watchlist: additive only, same shape as the plants restore above — an entry
  // whose id is already here is left exactly as it is (its watched tick and
  // rating are more current than the snapshot's), and a restored entry is
  // stamped updated=now with any matching tombstone cleared so the next sync
  // pull doesn't quietly re-delete it.
  if(Array.isArray(data.watchlist)){
    var wl2=storeGet("fl4_watchlist")||[],wlIds={};wl2.forEach(function(m){if(m)wlIds[m.id]=true;});
    var newWl=data.watchlist.filter(function(m){return m&&m.id!=null&&!wlIds[m.id];});
    if(newWl.length){
      var wlTombsR=getTombs("watchlist"), wlChanged=false;
      newWl.forEach(function(r){ r.updated=Date.now(); if(wlTombsR[r.id]!==undefined){ delete wlTombsR[r.id]; wlChanged=true; } });
      if(wlChanged) storeSet("fl4_tomb_watchlist", wlTombsR);
      storeSet("fl4_watchlist", wl2.concat(newWl));
      imported.watchlist=newWl.length;
    }
  }
  // Appliances: additive only, same shape as the two restores above — a
  // record whose id is already here is left exactly as it is, and a restored
  // one is stamped updated=now with any matching tombstone cleared so the next
  // sync pull doesn't quietly re-delete it.
  if(Array.isArray(data.appliances)){
    var ap2=storeGet("fl4_appliances")||[],apIds={};ap2.forEach(function(m){if(m)apIds[m.id]=true;});
    var newAp=data.appliances.filter(function(m){return m&&m.id!=null&&!apIds[m.id];});
    if(newAp.length){
      var apTombsR=getTombs("appliances"), apChanged=false;
      newAp.forEach(function(r){ r.updated=Date.now(); if(apTombsR[r.id]!==undefined){ delete apTombsR[r.id]; apChanged=true; } });
      if(apChanged) storeSet("fl4_tomb_appliances", apTombsR);
      storeSet("fl4_appliances", ap2.concat(newAp));
      imported.inventory=newAp.length;
    }
  }
  // Projects (v499): additive at the PROJECT level, the trips restore below —
  // a project whose id is already here is left exactly as it is (its ticks
  // are more current than the snapshot's), and a restored one is stamped
  // updated=now, with its own and its items' tombstones cleared so the next
  // sync pull doesn't quietly re-delete it. Non-medical, so it resurrects
  // (the v462 restore policy). Links are re-gated on the way in.
  if(Array.isArray(data.projects)){
    var pj2=getProjects(),pjIds={};pj2.forEach(function(m){pjIds[m.id]=true;});
    var newPj=data.projects.filter(function(m){return m&&typeof m==="object"&&m.id!=null&&!pjIds[m.id];});
    if(newPj.length){
      var pjTombsR=getTombs("projects"), piTombsR=getTombs("projitems"), pjChanged=false;
      newPj.forEach(function(p){
        p.updated=Date.now();
        p.items=projItemsOf(p);
        p.items.forEach(function(it){
          it.updated=Date.now();
          if(it.url!==undefined) it.url=applianceLinkUrl(it.url);
          if(piTombsR[it.id]!==undefined){ delete piTombsR[it.id]; pjChanged=true; }
        });
        if(pjTombsR[p.id]!==undefined){ delete pjTombsR[p.id]; pjChanged=true; }
      });
      if(pjChanged){ storeSet("fl4_tomb_projects", pjTombsR); storeSet("fl4_tomb_projitems", piTombsR); }
      storeSet("fl4_projects", pj2.concat(newPj));
      imported.projects=newPj.length;
    }
  }
  // Golf (v500): additive, the Health restore shape — an id already here is
  // left alone; a restored record is stamped updated=now with its tombstone
  // cleared so the next sync pull doesn't quietly re-delete it.
  if(Array.isArray(data.golf)){
    var gf2=getGolf(),gfIds={};gf2.forEach(function(m){gfIds[m.id]=true;});
    var newGf=data.golf.filter(function(m){return m&&typeof m==="object"&&m.id!=null&&!gfIds[m.id];});
    if(newGf.length){
      var gfTombsR=getTombs("golf"), gfChanged=false;
      newGf.forEach(function(r){
        r.updated=Date.now();
        if(gfTombsR[r.id]!==undefined){ delete gfTombsR[r.id]; gfChanged=true; }
      });
      if(gfChanged) storeSet("fl4_tomb_golf", gfTombsR);
      storeSet("fl4_golf", gf2.concat(newGf));
      imported.golf=newGf.length;
    }
  }
  // Meal plan: same newest-wins-per-day merge as sync, so restoring an old
  // backup can never clobber a newer week plan.
  if(Array.isArray(data.mealplan)){
    storeSet("fl4_mealplan", mergeMealPlanData(getMealPlan(), data.mealplan).plan);
  }
  // Trips + notes were exported but never imported before v288 — covered now.
  if(Array.isArray(data.trips)&&data.trips.length){
    var trips=getTrips(), tpIds={};
    trips.forEach(function(t){ if(t) tpIds[t.id]=true; });
    var newTrips=data.trips.filter(function(t){ return t&&t.id!=null&&!tpIds[t.id]; });
    if(newTrips.length){
      var tpTombs=getTombs("trips"), bkTombs=getTombs("bookings"), tombChanged=false;
      newTrips.forEach(function(t){
        t.updated=Date.now();
        if(tpTombs[t.id]!==undefined){ delete tpTombs[t.id]; tombChanged=true; }
        (t.bookings||[]).forEach(function(b){ if(!b) return; b.updated=Date.now(); if(bkTombs[b.id]!==undefined){ delete bkTombs[b.id]; tombChanged=true; } });
      });
      if(tombChanged){ storeSet("fl4_tomb_trips", tpTombs); storeSet("fl4_tomb_bookings", bkTombs); }
      storeSet("fl4_trips", trips.concat(newTrips));
    }
    imported.trips=newTrips.length;
  }
  if(data.notes){
    ["grocery","todo","travel","personal"].forEach(function(lt){
      var inc=data.notes[lt]; if(!Array.isArray(inc)||!inc.length) return;
      var cur=getNotes(lt), nIds={};
      cur.forEach(function(n){ if(n) nIds[n.id]=true; });
      var add=inc.filter(function(n){ return n&&n.id!=null&&!nIds[n.id]; });
      if(add.length){ saveNotes(add.concat(cur), lt); imported.notes+=add.length; }
    });
    ["global","global_work"].forEach(function(g){
      var inc=data.notes[g]; if(!Array.isArray(inc)||!inc.length) return;
      var key="fl4_notes_"+g, cur=storeGet(key)||[], nIds={};
      cur.forEach(function(n){ if(n) nIds[n.id]=true; });
      var add=inc.filter(function(n){ return n&&n.id!=null&&!nIds[n.id]; });
      if(add.length){ storeSet(key, add.concat(cur)); imported.notes+=add.length; }
    });
  }
  if(data.customCats){
    ["grocery","todo","travel","personal"].forEach(function(lt){
      var inc=data.customCats[lt]; if(!Array.isArray(inc)||!inc.length) return;
      var cur=getCustomCats(lt)||[];
      var keyOf=function(c){ return (c&&typeof c==="object") ? String(c.name||"").toLowerCase() : String(c).toLowerCase(); };
      var have={}; cur.forEach(function(c){ have[keyOf(c)]=true; });
      var add=inc.filter(function(c){ var k=keyOf(c); return k&&!have[k]; });
      if(add.length) saveCustomCats(lt, cur.concat(add));
    });
  }
  // Additive as ever -- a restore only fills a goal/profile this device does
  // not have. The v441 stamp rides along so the restored value keeps its place
  // in the newest-wins merge; an older file with no stamp restores as 0.
  if(data.cal_goal&&!storeGet("fl4_cal_goal")){storeSet("fl4_cal_goal",data.cal_goal);storeSet("fl4_cal_goal_ts",+data.cal_goal_ts||0);}
  if(data.profile&&typeof data.profile==="object"&&Object.keys(data.profile).length&&!storeGet("fl4_profile")){storeSet("fl4_profile",data.profile);storeSet("fl4_profile_ts",+data.profile_ts||0);}
  return imported;
}
// v445: one line per counted collection. A restore that added something must
// NEVER come back as "Nothing new to import" -- see the comment on `imported`.
// Beyond three kinds the toast would run off the end of a phone screen, so it
// falls back to the plain total; the toast is one short line on a 2.2s timer.
var IMPORT_LABELS = [
  ["lists",      "list item",      "list items"],
  ["recipes",    "recipe",         "recipes"],
  ["trips",      "trip",           "trips"],
  ["notes",      "note",           "notes"],
  ["food",       "food entry",     "food entries"],
  ["meals",      "saved meal",     "saved meals"],
  ["plants",     "plant",          "plants"],
  ["watchlist",  "watchlist entry","watchlist entries"],
  ["inventory",  "inventory item", "inventory items"],
  ["health",     "health record",  "health records"],
  ["projects",   "project",        "projects"],
  ["golf",       "golf record",    "golf records"],
  ["pullup",     "pull-up set",    "pull-up sets"],
  ["logEntries", "log entry",      "log entries"],
  ["medEntries", "medicine entry", "medicine entries"],
  ["workouts",   "workout",        "workouts"],
  ["baby",       "baby record",    "baby records"]
];
// v462: the skipped tally in plain English, matching the wording the plant
// importer already uses ("deleted on another device"). ONE builder for both
// report sites -- a manual import and a cloud restore must never disagree
// about what happened.
function importedSkippedText(n){
  var k=+(n&&n.skipped)||0;
  if(!k) return "";
  return k+" medicine record"+(k!==1?"s":"")+" deleted on another device "+(k!==1?"were":"was")+" not restored";
}
function importedSummary(n){
  var parts=[], total=0;
  IMPORT_LABELS.forEach(function(L){
    var c=+n[L[0]]||0;
    if(!c) return;
    total+=c;
    parts.push(c+" "+(c===1?L[1]:L[2]));
  });
  if(!parts.length) return "";
  if(parts.length>3) return total+" record"+(total!==1?"s":"");
  return parts.join(", ");
}
document.getElementById("importFile").addEventListener("change", function(e) {
  var file=e.target.files[0]; if(!file) return;
  var reader=new FileReader();
  reader.onload=function(ev){
    try {
      var data=JSON.parse(ev.target.result); if(!data) throw new Error("Invalid file");
      var n=importBackupData(data);
      // v445: renderList() alone left every other section showing pre-import
      // data until you navigated away and back -- and the import lives in
      // Settings, so even the list repaint is on a screen you cannot see.
      // flushSyncRenders is the existing "data changed underneath, repaint
      // what is visible" helper and carries its own per-section guards, so
      // this is one call rather than a pile of `if (currentSection ...)`.
      // Track is not one of its branches (it is fed per sub-view), so the
      // active Track tab is refreshed explicitly beside it.
      flushSyncRenders({ recipes:true, trips:true, baby:true, appliances:true,
                         plants:true, watchlist:true, health:true, golf:true, list:true, dots:true,
                         home:true, train:true });
      if (currentSection === "track" && typeof renderTrackView === "function") renderTrackView();
      pushPersonal(); if (typeof isHouseholdSet === "function" && isHouseholdSet()) pushHousehold();
      var s=importedSummary(n);
      var sk=importedSkippedText(n);
      toast(s ? ("Imported: "+s+(sk?" \u00b7 "+sk:"")) : (sk ? sk : "Nothing new to import"));
    } catch(err){ toast("Import failed: "+err.message); }
    e.target.value="";
  };
  reader.readAsText(file);
});

// ── Cloud backups sheet (v288) — list + restore ────────────
function fmtBackupDateKey(k){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(k); if(!m) return k;
  var d=new Date(+m[1], +m[2]-1, +m[3]);
  var days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], mon=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return days[d.getDay()]+" "+d.getDate()+" "+mon[d.getMonth()]+" "+d.getFullYear();
}
function openCloudBackupsSheet() {
  if (!isLoggedIn()) { toast("Log in to see cloud backups"); return; }
  var ov = document.createElement("div");
  // z-index 890: above the Settings overlay (400) but BELOW confirmDialog
  // (900) — at 950 the restore confirmation appeared behind this sheet
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:890;display:flex;align-items:center;justify-content:center;padding:22px;box-sizing:border-box";
  ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true"); ov.setAttribute("aria-label","Cloud backups");
  ov.innerHTML =
    "<div style='background:#fff;border-radius:16px;padding:20px;width:100%;max-width:340px;max-height:70vh;overflow-y:auto'>" +
      "<div style='font-size:16px;font-weight:800;color:#4A3A20;margin-bottom:4px'>&#x2601;&#xFE0F; Cloud backups</div>" +
      "<div style='font-size:12px;color:#8A7A5A;line-height:1.45;margin-bottom:12px'>Restoring adds anything missing back into your data &#8212; nothing is deleted, and the change syncs to both of you. Deleted medicine records are not brought back, and which sections you show and share is left as you have it here.</div>" +
      "<div id='cbList' style='font-size:13px;color:#8A7A5A'>Loading&#8230;</div>" +
      "<button id='cbClose' data-bbclose style='width:100%;margin-top:12px;padding:11px;border:none;background:none;color:#7A8772;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation'>Close</button>" +
    "</div>";
  document.body.appendChild(ov);
  function closeOv(){ if (ov.parentNode) ov.parentNode.removeChild(ov); }
  ov.querySelector("#cbClose").addEventListener("click", closeOv);
  ov.addEventListener("click", function(e){ if (e.target === ov) closeOv(); });
  firebaseFetch(userUrl("/backups") + "?shallow=true")
    .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
    .then(function(keys){
      var list = ov.querySelector("#cbList"); if (!list) return;
      var names = Object.keys(keys || {}).sort().reverse();
      if (!names.length) { list.textContent = "No cloud backups yet — the first one is saved automatically shortly after opening the app."; return; }
      list.innerHTML = "";
      names.forEach(function(k){
        var row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 2px;border-bottom:1px solid #EEE9E0";
        var lbl = document.createElement("span");
        lbl.style.cssText = "font-size:14px;color:#4A3A20;font-weight:600";
        lbl.textContent = fmtBackupDateKey(k);
        var btn = document.createElement("button");
        btn.style.cssText = "padding:8px 14px;border:1.5px solid #C4833A;background:none;color:#C4833A;border-radius:9px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation";
        btn.textContent = "Restore";
        btn.addEventListener("click", function(){ restoreCloudBackup(k, closeOv); });
        row.appendChild(lbl); row.appendChild(btn); list.appendChild(row);
      });
    })
    .catch(function(){ var list = ov.querySelector("#cbList"); if (list) list.textContent = "Couldn't load backups — check your connection and try again."; });
}
function restoreCloudBackup(dateKey, closeOv) {
  confirmDialog("Restore the cloud backup from " + fmtBackupDateKey(dateKey) + "? Anything missing is added back (nothing is deleted). The change will sync to both of you.", function(){
    firebaseFetch(userUrl("/backups/" + dateKey))
      .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
      .then(function(data){
        if (!data || typeof data !== "object") throw new Error("empty snapshot");
        var n = importBackupData(data);
        pushPersonal(); if (typeof isHouseholdSet === "function" && isHouseholdSet()) pushHousehold();
        renderList();
        if (currentSection === "recipes" && typeof renderRecipes === "function") renderRecipes();
        if (currentSection === "trips"   && typeof renderTrips   === "function") renderTrips();
        if (currentSection === "home"    && typeof renderHomeScreen === "function") renderHomeScreen();
        if (closeOv) closeOv();
        var s = importedSummary(n);
        var sk2=importedSkippedText(n);
        toast(s ? ("Restored: " + s + (sk2?" \u00b7 "+sk2:"")) : (sk2 ? sk2 : "Nothing to restore — you already have everything in that backup"));
      })
      .catch(function(e){ toast("Restore failed: " + e.message); });
  });
}
(function(){
  var cbBtn = document.getElementById("cloudBackupsBtn");
  if (cbBtn) cbBtn.addEventListener("click", openCloudBackupsSheet);
})();

// ── Sync health panel (v299) — read-only diagnostics ───────
function syncAgo(ts){ return ts ? medAgoStr(Date.now() - ts) : "—"; }
function countAllTombs(){
  var n = 0;
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.indexOf("fl4_tomb_") === 0) {
      try { var o = JSON.parse(localStorage.getItem(k)); if (o && typeof o === "object") n += Object.keys(o).length; } catch(e){}
    }
  }
  return n;
}
function esState(es){
  if (!es) return "off";
  return es.readyState === 1 ? "live" : es.readyState === 0 ? "connecting…" : "reconnecting…";
}
function openSyncHealthSheet(){
  var ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:890;display:flex;align-items:center;justify-content:center;padding:22px;box-sizing:border-box";
  ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true"); ov.setAttribute("aria-label","Sync health");
  var online = (typeof navigator.onLine === "boolean") ? navigator.onLine : true;
  var paired = isHouseholdSet();
  var lastUp = Math.max(_syncStats.lastPersonalPush, _syncStats.lastHouseholdPush);
  function row(label, value, tint){
    return "<div style='display:flex;justify-content:space-between;gap:12px;padding:9px 2px;border-bottom:1px solid #EEE9E0'>" +
      "<span style='color:#8A7A5A'>" + label + "</span>" +
      "<span style='font-weight:700;color:" + (tint||"#4A3A20") + ";text-align:right'>" + value + "</span></div>";
  }
  var body =
    row("Status", online ? (isLoggedIn() ? "Signed in" : "Logged out") : "Offline", online ? (isLoggedIn() ? "#2D8A4E" : "#9A5A10") : "#9A5A10") +
    row("This device", online ? "Online" : "Offline", online ? "#2D8A4E" : "#9A5A10") +
    row("Household", paired ? "Paired" : "This device only", paired ? "#4A3A20" : "#8A7A5A") +
    row("Live updates (personal)", esState(hearthHealthES), esState(hearthHealthES) === "live" ? "#2D8A4E" : "#9A5A10") +
    (paired ? row("Live updates (household)", esState(hearthSyncES), esState(hearthSyncES) === "live" ? "#2D8A4E" : "#9A5A10") : "") +
    row("Last sent up", syncAgo(lastUp)) +
    row("Last received", syncAgo(_syncStats.lastEvent)) +
    row("Pending deletions", String(countAllTombs())) +
    row("Last cloud backup", fmtBackupTime(storeGet("fl4_last_cloudbackup") || 0));
  ov.innerHTML =
    "<div style='background:#fff;border-radius:16px;padding:20px;width:100%;max-width:360px;max-height:75vh;overflow-y:auto'>" +
      "<div style='font-size:16px;font-weight:800;color:#4A3A20;margin-bottom:4px'>&#x1F4E1; Sync health</div>" +
      "<div style='font-size:12px;color:#8A7A5A;line-height:1.45;margin-bottom:12px'>A quick read on syncing between your devices. Nothing here needs action &#8212; it's for peace of mind and troubleshooting.</div>" +
      "<div style='font-size:14px'>" + body + "</div>" +
      "<div style='display:flex;gap:8px;margin-top:14px'>" +
        "<button id='shRefresh' style='flex:1;padding:11px;border:1.5px solid #C4833A;background:none;color:#C4833A;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Sync now</button>" +
        "<button id='shClose' data-bbclose style='flex:1;padding:11px;border:none;background:#F0EBE2;color:#7A6A4A;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Close</button>" +
      "</div>" +
    "</div>";
  document.body.appendChild(ov);
  function closeOv(){ if (ov.parentNode) ov.parentNode.removeChild(ov); }
  ov.querySelector("#shClose").addEventListener("click", closeOv);
  ov.addEventListener("click", function(e){ if (e.target === ov) closeOv(); });
  ov.querySelector("#shRefresh").addEventListener("click", function(){
    if (isLoggedIn()) { fetchPersonal(); pushPersonal(); if (isHouseholdSet()) { fetchHousehold(); pushHousehold(); } toast("Syncing…"); }
    closeOv();
    setTimeout(function(){ if (document.getElementById("settingsOverlay") && document.getElementById("settingsOverlay").classList.contains("open")) openSyncHealthSheet(); }, 1200);
  });
}
(function(){
  var shBtn = document.getElementById("syncHealthBtn");
  if (shBtn) shBtn.addEventListener("click", openSyncHealthSheet);
  var fuBtn = document.getElementById("forceUpdateBtn");
  if (fuBtn) fuBtn.addEventListener("click", forceAppUpdate);
})();

document.getElementById("clearAllBtn").addEventListener("click", function() {
  // Multi-step safeguarded deletion — requires typing DELETE
  var ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:950;display:flex;align-items:center;justify-content:center;padding:22px;box-sizing:border-box";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.setAttribute("aria-label", "Delete all data confirmation");
  ov.innerHTML =
    "<div style='background:#fff;border-radius:16px;padding:22px 20px;width:100%;max-width:340px'>" +
      "<div style='font-size:18px;font-weight:800;color:#C03030;margin-bottom:10px'>&#x26A0;&#xFE0F; Delete all my data?</div>" +
      "<div style='font-size:13px;color:#5A5A4A;line-height:1.55;margin-bottom:6px'>This permanently deletes <strong>your personal lists, history, training logs, baby tracking and notes</strong> from this device and from the cloud.</div>" +
      "<div style='font-size:12px;color:#7A8772;line-height:1.5;margin-bottom:14px'>Household data shared by other members is not affected. This cannot be undone.</div>" +
      "<div style='font-size:12px;font-weight:700;color:#5A5A4A;margin-bottom:6px'>Type DELETE to confirm:</div>" +
      "<input id='_delConfirmInput' type='text' autocomplete='off' autocapitalize='characters' placeholder='DELETE' style='width:100%;box-sizing:border-box;padding:11px 13px;border:1.5px solid #D0C8B8;border-radius:9px;font-family:inherit;font-size:15px;letter-spacing:2px;text-align:center;text-transform:uppercase;outline:none;margin-bottom:14px'>" +
      "<button id='_delConfirmBtn' disabled style='width:100%;padding:13px;border:none;background:#D0A0A0;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:not-allowed;margin-bottom:8px'>Delete everything</button>" +
      "<button id='_delCancelBtn' data-bbclose style='width:100%;padding:11px;border:none;background:none;color:#7A8772;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer'>Cancel</button>" +
    "</div>";
  document.body.appendChild(ov);

  var input = ov.querySelector("#_delConfirmInput");
  var btn   = ov.querySelector("#_delConfirmBtn");
  var cancel = ov.querySelector("#_delCancelBtn");
  setTimeout(function(){ input.focus(); }, 100);

  input.addEventListener("input", function() {
    var ok = input.value.trim().toUpperCase() === "DELETE";
    btn.disabled = !ok;
    btn.style.background = ok ? "#C03030" : "#D0A0A0";
    btn.style.cursor = ok ? "pointer" : "not-allowed";
  });

  cancel.addEventListener("click", function(){ document.body.removeChild(ov); });
  ov.addEventListener("click", function(e){ if (e.target === ov) document.body.removeChild(ov); });

  btn.addEventListener("click", function() {
    if (input.value.trim().toUpperCase() !== "DELETE") return;
    // Clear local data
    ["grocery","todo","travel","personal"].forEach(function(lt) {
      var cfg = LIST_CONFIG[lt]; if (cfg) storeSet(cfg.key, {items:[],hist:[]});
      listData[lt] = null;
      storeSet("fl4_notes_" + lt, []);
    });
    storeSet("fl4_notes_global", []);
    // Clear cloud personal data
    if (isLoggedIn()) {
      firebaseFetch(userUrl("/data"), { method:"DELETE" }).catch(function(){});
    }
    document.body.removeChild(ov);
    document.getElementById("settingsOverlay").classList.remove("open");
    renderList();
    toast("All your data has been deleted");
  });
});

// ============================================================
// COMPATIBILITY — polyfills for older iOS Safari
// ============================================================
if (!Array.prototype.find) {
  Array.prototype.find = function(fn) {
    for (var i = 0; i < this.length; i++) { if (fn(this[i], i, this)) return this[i]; }
  };
}
if (!Element.prototype.closest) {
  Element.prototype.closest = function(sel) {
    var el = this;
    while (el && el.nodeType === 1) {
      if (el.matches ? el.matches(sel) : el.msMatchesSelector(sel)) return el;
      el = el.parentElement || el.parentNode;
    }
    return null;
  };
}

// Prevent ghost-click double-fire on Android Chrome
// Usage: if (btnBusy(this)) return;
function btnBusy(el) {
  if (el._busy) return true;
  el._busy = true;
  setTimeout(function(){ el._busy = false; }, 800);
  return false;
}

