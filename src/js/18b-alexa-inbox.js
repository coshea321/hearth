// ── Alexa → Grocery inbox (v527) ──────────────────────────
// "Alexa, tell Hearth to add milk and eggs" reaches the Pages Function
// functions/api/alexa.js, which writes the raw phrase to
//   /hearth/households/<code>/inbox/<push id>  = { text, ts, src:"alexa" }
// and nothing else. This device reads that inbox, splits the phrase into
// items, sorts each into a grocery category exactly like a manual add, adds
// them to the grocery list, saves + pushes as usual, then deletes the entry.
//
// WHY AN INBOX, NOT A WRITE INTO /shared: every device PUTs the whole /shared
// document (pushHousehold), so an item the function wrote there could be
// overwritten by a push that was already on its way. /inbox is never touched
// by pushHousehold. Do NOT move this into /shared.
//
// Two devices may drain the same entry at once. Item ids are derived from the
// entry's server timestamp (ts + index), so both create the SAME item and the
// union-by-id merge keeps one. Same reason a tombstoned id is skipped.
var hearthInboxES = null;
var _inboxDraining = false, _inboxAgain = false;

function startInboxListening() {
  if (_isTestBuild) return;
  if (!isHouseholdSet()) return;
  if (hearthInboxES) { hearthInboxES.close(); hearthInboxES = null; }
  getAuthToken(function(token) {
    if (hearthApiKey && !token) return; // the household listener reports login problems
    var url = houseUrl("/inbox") + (token ? "?auth=" + token : "");
    hearthInboxES = new EventSource(url);
    function onEv(e) {
      try {
        var p = JSON.parse(e.data);
        if (p && p.data != null) drainAlexaInbox();
      } catch (err) { console.warn("SSE inbox event error:", err); }
    }
    hearthInboxES.addEventListener("put", onEv);
    hearthInboxES.addEventListener("patch", onEv);
  });
}

function alexaInboxReady() {
  return !_isTestBuild && !_seedTainted && isHouseholdSet() && isSynced("grocery") && _householdFetchOk;
}

function drainAlexaInbox() {
  if (!alexaInboxReady()) return;
  if (_inboxDraining) { _inboxAgain = true; return; }
  _inboxDraining = true;
  firebaseFetch(houseUrl("/inbox"))
    .then(function(r){ return (r && r.ok) ? r.json() : null; })
    .then(function(d){
      var keys = applyAlexaInbox(d);
      keys.forEach(function(k){
        firebaseFetch(houseUrl("/inbox/" + encodeURIComponent(k)), { method:"DELETE" }).catch(function(){});
      });
    })
    .catch(function(){})
    .then(function(){
      _inboxDraining = false;
      if (_inboxAgain) { _inboxAgain = false; drainAlexaInbox(); }
    });
}

// Split what Alexa heard into item names. Reuses the voice-capture splitter
// (commas / "and" / "then" / "plus"), after dropping the carrier words Alexa
// can leave on either end ("some milk", "eggs to the shopping list").
function parseAlexaItems(text) {
  var t = String(text || "").slice(0, 300).trim()
    .replace(/[.!?]+$/, "")
    .replace(/\s+(?:to|on|onto|in)\s+(?:the|my|our)\s+(?:hearth\s+)?(?:grocery|groceries|shopping)?\s*list\s*$/i, "");
  return parseVoiceItems(t).map(function(s){
    return s.replace(/^(?:some|a|an|the|more)\s+/i, "").trim();
  }).filter(Boolean).map(function(s){
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
}

// Apply an /inbox snapshot to the grocery list. Returns the entry keys that
// are now safe to delete — none if the local save failed, so nothing is lost.
function applyAlexaInbox(d) {
  if (!d || typeof d !== "object") return [];
  var lt = "grocery";
  loadListData(lt);
  var tombs = getTombs(lt), keys = [], added = [], changed = false;
  // A failed save must leave memory as it was: otherwise the next drain finds
  // the unsaved items "already on the list" and releases the entry (PR #298 review).
  var before = JSON.stringify(listData[lt]);
  Object.keys(d).sort().forEach(function(k) {
    keys.push(k);
    var e = d[k];
    if (!e || typeof e !== "object" || typeof e.text !== "string") return;
    var ts = (typeof e.ts === "number" && isFinite(e.ts) && e.ts > 0) ? Math.floor(e.ts) : Date.now();
    parseAlexaItems(e.text).forEach(function(name, i) {
      var res = alexaAddGrocery(name, ts + i, tombs);
      if (res === "added" || res === "restored") { changed = true; added.push(name); }
    });
  });
  if (changed) {
    if (!storeSet(LIST_CONFIG[lt].key, listData[lt])) { listData[lt] = JSON.parse(before); return []; }
    pushPersonal();
    if (isHouseholdSet() && isSynced(lt)) pushHousehold();
    flushSyncRenders({ list:true, dots:true, home:true });
    toast("&#x1F50A; Alexa added " + esc(added.join(", ")) + " to Grocery");
  }
  return keys;
}

// One item: "added" | "restored" | "exists" | "deleted". Mirrors the Home
// quick-add (doHqpAdd): an undone match is left alone, a done match is moved
// back to the list, otherwise a new item in its detected category.
function alexaAddGrocery(name, id, tombs) {
  var lt = "grocery", items = listData[lt].items, low = name.toLowerCase();
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || typeof it.name !== "string") continue;
    if (it.id === id) return "exists";               // another device got here first
    if (it.name.toLowerCase() !== low) continue;
    if (!it.done) return "exists";
    it.done = false; clearPersonChecks(it);
    it.updated = Date.now(); it.added = Date.now();
    addToHistFor(lt, it.name, it.catId);
    markUnseen(lt, it.id);
    return "restored";
  }
  if (tombs && tombs[id] != null) return "deleted";   // already added and deleted elsewhere
  var catId = detectCatFor(lt, name);
  items.unshift({ id:id, name:name, catId:catId, done:false, dueDate:null, addedBy:"alexa", updated:id, added:id });
  addToHistFor(lt, name, catId);
  markUnseen(lt, id);
  return "added";
}
