// ============================================================
// TRIPS — household-shared, like recipebook, but with a nested
// per-booking merge: each booking has its own id/updated so two
// devices can each add/edit a different booking in the same trip
// without one clobbering the other (a whole-trip newest-wins would
// not be safe here — a trip is a container of many edit units).
// ============================================================
function getTrips() { return storeGet("fl4_trips") || []; }
function saveTripsStore(t) {
  storeSet("fl4_trips", t);
  pushPersonal();
  if (typeof isHouseholdSet === "function" && isHouseholdSet()) pushHousehold();
}

function importTripFromJSON(raw) {
  var obj;
  try { obj = JSON.parse(raw); } catch(e) { return { error: "Couldn't parse JSON — check the format and try again." }; }
  if (!obj || obj.hearth !== "trip-v1") return { error: "Not a Hearth trip file. Make sure the JSON includes \"hearth\":\"trip-v1\"." };
  if (!obj.name || typeof obj.name !== "string") return { error: "Missing trip name." };
  var now = Date.now();
  var newId = now + Math.floor(Math.random()*100000);
  var bookings = Array.isArray(obj.bookings) ? obj.bookings.map(function(b, i){
    return {
      id: now + i*1000 + Math.floor(Math.random()*1000),
      type: b.type || "other",
      title: b.title || "",
      start: b.start || "",
      end: b.end || null,
      location: b.location || "",
      ref: b.ref || "",
      notes: b.notes || "",
      connectsFrom: !!b.connectsFrom,
      boarding: b.boarding || "",
      gate: b.gate || "",
      seats: b.seats || "",
      updated: now
    };
  }) : [];
  var trip = { id: newId, name: obj.name, start: obj.start||null, end: obj.end||null, updated: now, bookings: bookings };
  var trips = getTrips();
  trips.unshift(trip);
  saveTripsStore(trips);
  return { id: newId };
}

function mergeBookingsIntoTrip(tripId, bookingObjs) {
  var trips = getTrips();
  var trip = trips.find(function(t){ return t.id === tripId; });
  if (!trip) return { error: "Trip not found." };
  var now = Date.now();
  var newBookings = (bookingObjs||[]).map(function(b, i){
    return { id: now + i*1000 + Math.floor(Math.random()*1000), type:b.type||"other", title:b.title||"", start:b.start||"", end:b.end||null, location:b.location||"", ref:b.ref||"", notes:b.notes||"", connectsFrom:!!b.connectsFrom, boarding:b.boarding||"", gate:b.gate||"", seats:b.seats||"", updated:now };
  });
  trip.bookings = (trip.bookings||[]).concat(newBookings);
  trip.updated = now;
  saveTripsStore(trips);
  return { id: tripId };
}

// Merge two trip lists at both the trip level and the nested booking level.
// Booking ids are globally unique (Date.now()+random), so booking tombstones
// are a single flat store regardless of which trip the booking belonged to.
// Returns {trips, push} — push=true means our merge result is fuller/newer
// than what we received, so the caller should re-push to converge.
function mergeTripsData(localTrips, incomingTrips, tripTombs, bookingTombs) {
  var push = false;
  function mergeBookings(localB, incB) {
    var incById = {};
    (incB || []).forEach(function(b){ if (b && b.id != null) incById[b.id] = b; });
    var localIds = {};
    var merged = (localB || []).map(function(b){
      if (!b || b.id == null) return b;
      localIds[b.id] = true;
      var inc = incById[b.id];
      if (!inc) { push = true; return b; }                    // partner missing this → push
      var winner, loser;
      if ((inc.updated||0) > (b.updated||0)) { winner = inc; loser = b; } // incoming newer → take it
      else {
        if ((b.updated||0) > (inc.updated||0)) push = true;   // local newer → push to converge
        winner = b; loser = inc;
      }
      // v296: fields the winner's copy doesn't know about (older app version
      // that predates e.g. boarding/gate/seats) must not wipe them — fill
      // keys UNDEFINED on the winner from the loser. A deliberately cleared
      // field is "" (defined) and stays cleared.
      Object.keys(loser).forEach(function(k){ if (winner[k] === undefined) winner[k] = loser[k]; });
      return winner;
    });
    var fresh = (incB || []).filter(function(b){ return b && b.id != null && !localIds[b.id]; });
    var full = fresh.concat(merged);
    return full.filter(function(b){
      return !(b && bookingTombs[b.id] && bookingTombs[b.id] >= (b.updated||0));
    });
  }
  var incById = {};
  (incomingTrips || []).forEach(function(t){ if (t && t.id != null) incById[t.id] = t; });
  var localIds = {};
  var merged = (localTrips || []).map(function(t){
    if (!t || t.id == null) return t;
    localIds[t.id] = true;
    var inc = incById[t.id];
    if (!inc) { push = true; return t; }
    var winner = (inc.updated||0) > (t.updated||0) ? inc : t;
    var loser  = winner === t ? inc : t;
    if ((t.updated||0) > (inc.updated||0)) push = true;
    // v296: build from BOTH copies (winner's keys win, loser fills gaps)
    // instead of a hand-typed field list, so future trip-level fields can't
    // be silently dropped by the merge.
    var out = Object.assign({}, loser, winner);
    out.id = t.id;
    out.bookings = mergeBookings(t.bookings, inc.bookings);
    return out;
  });
  var fresh = (incomingTrips || []).filter(function(t){ return t && t.id != null && !localIds[t.id]; });
  var full = fresh.concat(merged);
  full = full.filter(function(t){
    return !(t && tripTombs[t.id] && tripTombs[t.id] >= (t.updated||0));
  });
  return { trips: full, push: push };
}

// ── Notes sync merge (v343) — id-keyed union + newest-wins + tombstones ────
// Replaces the household channel's wholesale-replace of fl4_notes_global(_work)
// and the personal channel's remote-wins-per-id union — both let an older
// backend copy overwrite a newer unpushed edit, the notes-loss class the
// v329 medicine fix already closed for baby data. Keyed by updatedAt||id
// (mirrors medUpdatedTs) so pre-migration notes merge correctly with no
// data migration. Tombstone-filtered so deletions actually propagate instead
// of only "propagating" via the old wholesale-replace. Returns {notes, push}
// — push=true means our merge is fuller/newer than what we received, so the
// caller should re-push to converge.
function notesTs(n){ return (n && (n.updatedAt || n.id)) || 0; }
function mergeNotes(local, incoming, tombs) {
  var push = false;
  var incById = {};
  (incoming||[]).forEach(function(n){ if (n && n.id != null) incById[n.id] = n; });
  var localIds = {};
  var merged = (local||[]).map(function(n){
    if (!n || n.id == null) return n;
    localIds[n.id] = true;
    var inc = incById[n.id];
    if (!inc) { push = true; return n; }
    var winner, loser;
    if (notesTs(inc) > notesTs(n)) { winner = inc; loser = n; }
    else {
      if (notesTs(n) > notesTs(inc)) push = true;
      winner = n; loser = inc;
    }
    Object.keys(loser).forEach(function(k){ if (winner[k] === undefined) winner[k] = loser[k]; });
    return winner;
  });
  var fresh = (incoming||[]).filter(function(n){ return n && n.id != null && !localIds[n.id]; });
  var full = fresh.concat(merged);
  var out = full.filter(function(n){
    return !(n && tombs && tombs[n.id] != null && tombs[n.id] >= notesTs(n));
  });
  return { notes: out, push: push };
}

// ── Trips UI ─────────────────────────────────────────────────
var TRIP_BOOKING_TYPES = {
  parking:       { label: "Parking",       icon: "&#x1F17F;&#xFE0F;" },
  flight:        { label: "Flight",        icon: "&#x2708;&#xFE0F;" },
  car:           { label: "Car rental",    icon: "&#x1F697;" },
  accommodation: { label: "Accommodation", icon: "&#x1F3E8;" },
  other:         { label: "Other",         icon: "&#x1F3AB;" }
};
var TRIP_MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var _tripView = "list"; // "list" | "detail"
var _tripOpenId = null;
var _tripEditing = false;
var _tripCancelFn = null; // v345: back-button-v2 discard closure, set by openTripEditor/openBookingEditor, nulled on every exit path
var _tripExpanded = {};
var _tripDetailView = "compact"; // "compact" | "timeline"
var _tripImporting = false;
var _tripImportParsed = null;
var _tripListScrollPos = 0;

function todayStr() {
  var d = new Date(), p = function(x){ return x < 10 ? "0"+x : x; };
  return d.getFullYear() + "-" + p(d.getMonth()+1) + "-" + p(d.getDate());
}
function tripDayMonth(dateStr) {
  var p = dateStr.split("-");
  return parseInt(p[2],10) + " " + TRIP_MONTH_ABBR[parseInt(p[1],10)-1];
}
function tripRangeLabel(start, end) {
  if (!start) return "";
  if (!end || end === start) return tripDayMonth(start);
  var sp = start.split("-"), ep = end.split("-");
  if (sp[0] === ep[0] && sp[1] === ep[1]) return parseInt(sp[2],10) + "–" + tripDayMonth(end);
  return tripDayMonth(start) + " – " + tripDayMonth(end);
}
function bookingDateTimeLabel(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  var p = function(x){ return x < 10 ? "0"+x : x; };
  return d.getDate() + " " + TRIP_MONTH_ABBR[d.getMonth()] + ", " + p(d.getHours()) + ":" + p(d.getMinutes());
}

function renderTrips() {
  _tripEditing = false;
  _tripCancelFn = null;
  if (_tripView === "detail" && _tripOpenId != null) { renderTripDetail(); return; }
  var el = document.getElementById("tripsContent");

  if (_tripImporting) {
    if (!_tripImportParsed) {
      // Step 1: paste JSON
      el.innerHTML =
        "<button id='tripImportCancel' style='border:none;background:none;color:#0F8A8A;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px'>&larr; Cancel</button>" +
        "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:10px'>Import trip</div>" +
        "<div style='font-size:13px;color:#6A5A40;background:#F8F4EC;border-radius:10px;padding:12px 14px;margin-bottom:14px;line-height:1.6'>" +
          "<b>How to use with Claude:</b> Go to Claude.ai, paste your booking confirmation emails and say:<br><br>" +
          "<i>&ldquo;Read these booking emails and output a Hearth trip JSON with this format:<br>" +
          '{"hearth":"trip-v1","name":"Trip name","start":"YYYY-MM-DD","end":"YYYY-MM-DD","bookings":[{"type":"flight","title":"...","start":"YYYY-MM-DDTHH:MM","end":"YYYY-MM-DDTHH:MM","location":"...","ref":"...","notes":"..."}]}&rdquo;</i><br><br>' +
          "Types: flight, parking, car, accommodation, other. Then paste Claude&rsquo;s output below." +
        "</div>" +
        "<textarea id='tripImportJson' rows='8' placeholder='Paste Hearth trip JSON here…' style='" + recipeInputCss() + "margin-bottom:14px;resize:vertical;line-height:1.5;font-size:12px;font-family:monospace'></textarea>" +
        "<button id='tripImportGo' style='width:100%;padding:13px;border:none;background:#0F8A8A;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>Next ›</button>";

      document.getElementById("tripImportCancel").addEventListener("click", function(){
        _tripImporting = false; _tripImportParsed = null; renderTrips();
      });
      document.getElementById("tripImportGo").addEventListener("click", function(){
        var raw = document.getElementById("tripImportJson").value.trim();
        var obj;
        try { obj = JSON.parse(raw); } catch(e) { toast("Couldn’t parse JSON — check the format and try again."); return; }
        if (!obj || obj.hearth !== "trip-v1") { toast("Not a Hearth trip file. Make sure the JSON includes “hearth”:”trip-v1”."); return; }
        if (!obj.name || typeof obj.name !== "string") { toast("Missing trip name."); return; }
        _tripImportParsed = obj;
        renderTrips();
      });
    } else {
      // Step 2: choose destination
      var existingTrips = getTrips();
      var nB = (_tripImportParsed.bookings||[]).length;
      var bLabel = nB + " booking" + (nB !== 1 ? "s" : "");
      var mergeHtml = "";
      if (existingTrips.length > 0) {
        mergeHtml = "<div style='font-size:13px;color:#6A5A40;text-align:center;margin:14px 0 10px;font-weight:600'>— or add bookings to an existing trip —</div>";
        existingTrips.forEach(function(t){
          mergeHtml += "<button class='tripMergeTarget' data-id='" + esc(t.id) + "' style='display:block;width:100%;text-align:left;padding:11px 14px;margin-bottom:6px;border:1px solid #D8D0C0;background:#fff;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;color:#2A3A3A;cursor:pointer'>" + esc(t.name) + "<span style='float:right;color:#0F8A8A;font-size:12px;font-weight:700'>+ " + bLabel + "</span></button>";
        });
      }
      el.innerHTML =
        "<button id='tripImportBack' style='border:none;background:none;color:#0F8A8A;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px'>&larr; Back</button>" +
        "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:10px'>Import trip</div>" +
        "<div style='background:#F0FAF8;border:1px solid #B8E0DC;border-radius:10px;padding:12px 14px;margin-bottom:14px'>" +
          "<div style='font-size:14px;font-weight:700;color:#2A3A3A;margin-bottom:3px'>" + esc(_tripImportParsed.name) + "</div>" +
          "<div style='font-size:12px;color:#5A7A7A'>" + bLabel + "</div>" +
        "</div>" +
        "<button id='tripImportNew' style='width:100%;padding:13px;border:none;background:#0F8A8A;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>Create as new trip</button>" +
        mergeHtml;

      document.getElementById("tripImportBack").addEventListener("click", function(){
        _tripImportParsed = null; renderTrips();
      });
      document.getElementById("tripImportNew").addEventListener("click", function(){
        var result = importTripFromJSON(JSON.stringify(_tripImportParsed));
        if (result.error) { toast(result.error); return; }
        _tripImporting = false; _tripImportParsed = null;
        _tripOpenId = result.id; _tripView = "detail";
        renderTrips(); toast("Trip imported!");
      });
      document.querySelectorAll(".tripMergeTarget").forEach(function(btn){
        btn.addEventListener("click", function(){
          var tid = parseInt(this.getAttribute("data-id"), 10);
          var result = mergeBookingsIntoTrip(tid, _tripImportParsed.bookings||[]);
          if (result.error) { toast(result.error); return; }
          _tripImporting = false; _tripImportParsed = null;
          _tripOpenId = tid; _tripView = "detail";
          renderTrips(); toast("Bookings added to trip!");
        });
      });
    }
    return;
  }

  var trips = getTrips();
  if (!trips.length) {
    el.innerHTML = "<div style='text-align:center;color:#8A7A5A;padding:40px 20px'><div style='font-size:40px;margin-bottom:10px'>&#x1F9F3;</div><div style='font-size:16px;font-weight:600;margin-bottom:4px'>No trips yet</div><div style='font-size:13px'>Tap + to plan one.</div></div>";
    return;
  }
  var today = todayStr();
  var upcoming = [], past = [];
  trips.forEach(function(t){ ((t.end||t.start||"") >= today ? upcoming : past).push(t); });
  upcoming.sort(function(a,b){ return (a.start||"").localeCompare(b.start||""); });
  past.sort(function(a,b){ return (b.start||"").localeCompare(a.start||""); });

  var html = "";
  if (upcoming.length) {
    html += "<div style='font-size:12px;font-weight:700;color:#0F8A8A;text-transform:uppercase;letter-spacing:.5px;margin:6px 2px 8px'>Upcoming</div>";
    upcoming.forEach(function(t){ html += tripCardHTML(t); });
  }
  if (past.length) {
    html += "<div style='font-size:12px;font-weight:700;color:#9A8A6A;text-transform:uppercase;letter-spacing:.5px;margin:18px 2px 8px'>Past</div>";
    past.forEach(function(t){ html += tripCardHTML(t); });
  }
  el.innerHTML = html;

  el.querySelectorAll(".trip-card").forEach(function(card){
    card.addEventListener("click", function(){
      _tripListScrollPos = window.scrollY;
      _tripOpenId = +card.dataset.tid;
      _tripView = "detail";
      renderTripDetail();
      window.scrollTo(0, 0);
    });
  });
}

// Whole-day delta from today's local midnight to a "YYYY-MM-DD" date;
// null if unparseable. Both endpoints are local midnight, so DST can't
// shift the count (v298).
function tripDaysUntil(dateStr) {
  if (!dateStr) return null;
  var p = String(dateStr).split("-");
  if (p.length !== 3) return null;
  var target = new Date(+p[0], +p[1]-1, +p[2]);
  if (isNaN(target.getTime())) return null;
  var now = new Date();
  var todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - todayMid) / 86400000);
}
// Countdown pill for a trip card (v298). "Today" / "Tomorrow" / "In N days"
// for upcoming departures, "Now" while a trip is in progress, "" otherwise.
// Countdown label text (v298; extracted v302 for reuse by the Today card):
// "Today" / "Tomorrow" / "In N days" upcoming, "Now" in progress, "" for past.
function tripCountdownLabel(t) {
  var d = tripDaysUntil(t.start);
  if (d === null) return "";
  if (d > 1)      return "In " + d + " days";
  if (d === 1)    return "Tomorrow";
  if (d === 0)    return "Today";
  var end = tripDaysUntil(t.end);
  if (end !== null && end >= 0) return "Now"; // started, not yet ended
  return "";                                  // fully in the past
}
function tripCountdownBadge(t) {
  var label = tripCountdownLabel(t);
  if (!label) return "";
  return "<div style='flex-shrink:0;background:#E4F3F1;color:#0F8A8A;font-size:12px;font-weight:700;border-radius:20px;padding:5px 11px;white-space:nowrap'>" + label + "</div>";
}
function tripCardHTML(t) {
  var n = (t.bookings||[]).length;
  return "<div class='trip-card' data-tid='" + esc(t.id) + "' style='display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#fff;border:1px solid #ECE4D6;border-radius:12px;padding:14px;margin-bottom:10px;cursor:pointer'>" +
    "<div style='flex:1;min-width:0'>" +
      "<div style='font-size:16px;font-weight:700;color:#1A2E2E;margin-bottom:3px'>" + esc(t.name||"Untitled trip") + "</div>" +
      "<div style='font-size:12px;color:#9A8A6A'>" + esc(tripRangeLabel(t.start, t.end)) + " &middot; " + n + " booking" + (n!==1?"s":"") + "</div>" +
    "</div>" +
    tripCountdownBadge(t) +
  "</div>";
}

function renderTripDetail() {
  var el = document.getElementById("tripsContent");
  var trip = getTrips().find(function(x){ return x.id === _tripOpenId; });
  if (!trip) { _tripView = "list"; renderTrips(); return; }
  var bookings = (trip.bookings||[]).slice().sort(function(a,b){
    return new Date(a.start||0).getTime() - new Date(b.start||0).getTime();
  });
  var html =
    "<button id='tripBack' style='border:none;background:none;color:#0F8A8A;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px'>&larr; All trips</button>" +
    "<div style='display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px'>" +
      "<div>" +
        "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;color:#1A2E2E'>" + esc(trip.name||"Untitled trip") + "</div>" +
        "<div style='font-size:13px;color:#8A7A5A;margin-top:2px'>" + esc(tripRangeLabel(trip.start, trip.end)) + "</div>" +
      "</div>" +
      "<button id='tripEditBtn' style='border:1.5px solid #D8D0C0;background:#fff;color:#0F8A8A;border-radius:8px;padding:6px 12px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer'>Edit</button>" +
    "</div>" +
    "<button id='bookingNewBtn' style='width:100%;padding:12px;border:none;background:#0F8A8A;color:#fff;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:16px'>+ Add booking</button>";

  // view toggle + expand/collapse all
  var _allExp = bookings.length > 0 && bookings.every(function(b){ return !!_tripExpanded[b.id]; });
  html += "<div style='display:flex;gap:6px;align-items:center;margin-bottom:14px'>" +
    ["compact","timeline"].map(function(v){
      var on = _tripDetailView === v;
      return "<button class='trip-view-btn' data-view='" + esc(v) + "' style='flex:1;padding:8px;border:" + (on?"none":"1.5px solid #D8D0C0") + ";background:" + (on?"#0F8A8A":"#fff") + ";color:" + (on?"#fff":"#6A8A8A") + ";border-radius:8px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer'>" +
        (v === "compact" ? "Compact" : "Timeline") + "</button>";
    }).join("") +
    (bookings.length ? "<button id='tripExpandToggle' style='margin-left:auto;border:none;background:none;color:#0F8A8A;font-size:12px;font-weight:700;cursor:pointer;padding:4px 2px;white-space:nowrap'>" + (_allExp ? "Collapse all" : "Expand all") + "</button>" : "") +
  "</div>";

  // build flat items list (timeline mode splits bookings-with-end into two entries)
  var viewItems = [];
  if (_tripDetailView === "timeline") {
    bookings.forEach(function(b){
      viewItems.push({t:"booking", b:b});
      if (b.end && b.end.slice(0,10) !== (b.start||"").slice(0,10)) viewItems.push({t:"checkout", b:b});
    });
    viewItems.sort(function(x,y){
      var tx = (x.t === "checkout" ? x.b.end : x.b.start) || "";
      var ty = (y.t === "checkout" ? y.b.end : y.b.start) || "";
      return tx < ty ? -1 : tx > ty ? 1 : 0;
    });
  } else {
    bookings.forEach(function(b){ viewItems.push({t:"booking", b:b}); });
  }

  if (!viewItems.length) {
    html += "<div style='text-align:center;color:#9A8A6A;padding:24px'>No bookings yet. Add a flight, hotel, parking…</div>";
  } else {
    var lastDate = "";
    var lastBooking = null;
    viewItems.forEach(function(item){
      var itemDate = ((item.t === "checkout" ? item.b.end : item.b.start) || "").slice(0,10);
      if (itemDate && itemDate !== lastDate) {
        html += dateSeparatorHTML(itemDate);
        lastDate = itemDate;
      }
      if (item.t === "checkout") {
        html += checkoutCardHTML(item.b);
      } else {
        html += bookingCardHTML(item.b, lastBooking);
        lastBooking = item.b;
      }
    });
  }
  el.innerHTML = html;

  document.getElementById("tripBack").addEventListener("click", function(){
    var savedPos = _tripListScrollPos;
    _tripView = "list"; _tripOpenId = null; _tripExpanded = {};
    renderTrips();
    requestAnimationFrame(function(){ window.scrollTo(0, savedPos); });
  });
  document.getElementById("tripEditBtn").addEventListener("click", function(){ openTripEditor(trip.id); });
  document.getElementById("bookingNewBtn").addEventListener("click", function(){ openBookingEditor(trip.id, null); });

  el.querySelectorAll(".booking-card").forEach(function(card){
    card.addEventListener("click", function(e){
      if (e.target.closest(".booking-edit-btn") || e.target.closest("a")) return;
      var bid = +card.dataset.bid;
      _tripExpanded[bid] = !_tripExpanded[bid];
      renderTripDetail();
    });
  });
  el.querySelectorAll(".booking-edit-btn").forEach(function(btn){
    btn.addEventListener("click", function(e){
      e.stopPropagation();
      openBookingEditor(trip.id, +btn.dataset.bid);
    });
  });
  el.querySelectorAll(".trip-view-btn").forEach(function(btn){
    btn.addEventListener("click", function(){
      _tripDetailView = btn.dataset.view;
      renderTripDetail();
    });
  });
  var _expToggle = document.getElementById("tripExpandToggle");
  if (_expToggle) _expToggle.addEventListener("click", function(){
    if (bookings.every(function(b){ return !!_tripExpanded[b.id]; })) {
      _tripExpanded = {};
    } else {
      bookings.forEach(function(b){ _tripExpanded[b.id] = true; });
    }
    renderTripDetail();
  });
}

function dateSeparatorHTML(dateStr) {
  var d = new Date(dateStr + "T12:00:00");
  var days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  var label = days[d.getDay()] + " " + d.getDate() + " " + TRIP_MONTH_ABBR[d.getMonth()];
  return "<div style='font-size:13px;font-weight:800;color:#0F8A8A;letter-spacing:.5px;text-transform:uppercase;padding:14px 0 6px'>" + label + "</div>";
}

function checkoutCardHTML(b) {
  var ty = TRIP_BOOKING_TYPES[b.type] || TRIP_BOOKING_TYPES.other;
  var label = b.type === "accommodation" ? "Check-out" : "End";
  var endTimeHtml = "";
  if (b.end) {
    var _ed = new Date(b.end);
    if (!isNaN(_ed.getTime())) {
      var _eh = _ed.getHours(), _em = _ed.getMinutes();
      endTimeHtml = _ed.getDate() + " " + TRIP_MONTH_ABBR[_ed.getMonth()] +
        ", <span style='color:#0F8A8A;font-weight:700'>" + (_eh < 10 ? "0"+_eh : _eh) + ":" + (_em < 10 ? "0"+_em : _em) + "</span>";
    } else {
      endTimeHtml = esc(b.end);
    }
  }
  return "<div style='background:#F8F4EC;border:1px dashed #D8D0C0;border-radius:12px;padding:11px 14px;margin-bottom:10px;display:flex;align-items:center;gap:10px'>" +
    "<span style='font-size:18px;opacity:.55'>" + ty.icon + "</span>" +
    "<div style='flex:1;min-width:0'>" +
      "<div style='font-size:13px;font-weight:600;color:#6A5A40'>" + esc(b.title||ty.label) + " — " + label + "</div>" +
      "<div style='font-size:12px;color:#9A8A6A'>" + endTimeHtml + (b.location ? " &middot; " + esc(b.location) : "") + "</div>" +
    "</div>" +
  "</div>";
}

function bookingCardHTML(b, prevB) {
  var transferBadge = "";
  if (b.connectsFrom && prevB) {
    var prevEnd = prevB.end ? new Date(prevB.end).getTime() : null;
    var myStart = b.start ? new Date(b.start).getTime() : null;
    if (prevEnd && myStart) {
      var diffMin = Math.round((myStart - prevEnd) / 60000);
      if (diffMin > 0 && diffMin <= 720) {
        var h = Math.floor(diffMin / 60), m = diffMin % 60;
        var tLabel = h > 0 ? (h + "h" + (m > 0 ? " " + m + "m" : "")) : (m + "m");
        transferBadge = "<div style='display:flex;align-items:center;justify-content:center;gap:8px;padding:4px 6px 8px;font-size:12px;color:#5A7A7A;font-weight:600'>" +
          "<span style='font-size:15px'>&#x21C4;</span>" +
          "<span>Transfer &middot; " + tLabel + "</span>" +
          "</div>";
      }
    }
  }
  var ty = TRIP_BOOKING_TYPES[b.type] || TRIP_BOOKING_TYPES.other;
  var expanded = !!_tripExpanded[b.id];
  var timeLineHtml = "";
  if (b.start) {
    var _td = new Date(b.start);
    if (!isNaN(_td.getTime())) {
      var _th = _td.getHours(), _tm = _td.getMinutes();
      timeLineHtml = _td.getDate() + " " + TRIP_MONTH_ABBR[_td.getMonth()] +
        ", <span style='color:#0F8A8A;font-weight:700'>" + (_th < 10 ? "0" + _th : _th) + ":" + (_tm < 10 ? "0" + _tm : _tm) + "</span>";
    } else {
      timeLineHtml = esc(b.start);
    }
  }
  if (b.end) timeLineHtml += " &rarr; " + bookingDateTimeLabel(b.end);
  if (b.location) timeLineHtml += " &middot; " + esc(b.location);
  // Boarding line (v292) — shown on the COLLAPSED card: at the airport this
  // is the line you organise around. Renders nothing when both fields are empty.
  var boardingHtml = "";
  if (b.boarding || b.gate || b.seats) {
    var bParts = [];
    if (b.boarding) bParts.push("Boarding <span style='color:#0F8A8A;font-weight:700'>" + esc(b.boarding) + "</span>");
    if (b.gate) bParts.push("Gate " + esc(b.gate));
    if (b.seats) bParts.push("Seats " + esc(b.seats));
    boardingHtml = "<div style='font-size:12px;color:#5A7A7A;margin-top:2px'>&#x1F6EB; " + bParts.join(" &middot; ") + "</div>";
  }
  var extra = "";
  if (expanded) {
    extra = "<div style='margin-top:10px;padding-top:10px;border-top:1px dotted #ECE4D6;font-size:13px;color:#5A5040'>" +
      (b.location ? "<div style='margin-bottom:6px'><a href='https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(b.location) + "' target='_blank' rel='noopener' onclick='event.stopPropagation()' style='color:#0F8A8A;text-decoration:none;font-weight:600'>&#x1F4CD; " + esc(b.location) + "</a></div>" : "") +
      (b.ref ? "<div style='margin-bottom:4px'><b>Ref:</b> " + esc(b.ref) + "</div>" : "") +
      (b.notes ? "<div style='white-space:pre-wrap'>" + esc(b.notes) + "</div>" : "") +
      (!b.location && !b.ref && !b.notes ? "<div style='color:#B0A488'>No extra details</div>" : "") +
      "<button class='booking-edit-btn' data-bid='" + esc(b.id) + "' style='margin-top:10px;border:1.5px solid #D8D0C0;background:#fff;color:#0F8A8A;border-radius:8px;padding:6px 12px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer'>Edit booking</button>" +
    "</div>";
  }
  return transferBadge + "<div class='booking-card' data-bid='" + esc(b.id) + "' style='background:#fff;border:1px solid #ECE4D6;border-radius:12px;padding:14px;margin-bottom:10px;cursor:pointer'>" +
    "<div style='display:flex;align-items:center;gap:10px'>" +
      "<span style='font-size:20px'>" + ty.icon + "</span>" +
      "<div style='flex:1;min-width:0'>" +
        "<div style='font-size:15px;font-weight:700;color:#1A2E2E'>" + esc(b.title||ty.label) + "</div>" +
        "<div style='font-size:12px;color:#9A8A6A'>" + timeLineHtml + "</div>" +
        boardingHtml +
      "</div>" +
    "</div>" +
    extra +
  "</div>";
}

function openTripEditor(id) {
  _tripEditing = true;
  var t = id != null ? getTrips().find(function(x){ return x.id === id; }) : null;
  var isNew = !t;
  var el = document.getElementById("tripsContent");
  el.innerHTML =
    "<button id='tripCancelEdit' style='border:none;background:none;color:#0F8A8A;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px'>&larr; Cancel</button>" +
    "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:14px'>" + (isNew?"New trip":"Edit trip") + "</div>" +
    fieldLabel("Trip name") +
    "<input id='tpName' type='text' value='" + (t?esc(t.name):"") + "' placeholder='e.g. Lanzarote' style='" + recipeInputCss() + "margin-bottom:12px'>" +
    fieldLabel("Start date") +
    "<input id='tpStart' type='date' value='" + (t&&t.start?t.start:"") + "' style='" + recipeInputCss() + "margin-bottom:12px'>" +
    fieldLabel("End date (optional)") +
    "<input id='tpEnd' type='date' value='" + (t&&t.end?t.end:"") + "' style='" + recipeInputCss() + "margin-bottom:16px'>" +
    "<button id='tpSave' style='width:100%;padding:13px;border:none;background:#0F8A8A;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>Save</button>" +
    (t ? "<button id='tpDelete' style='width:100%;padding:13px;border:1.5px solid #C03030;background:#fff;color:#C03030;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;margin-top:10px'>Delete trip</button>" : "") +
    (t ? "<button id='tpExport' style='width:100%;padding:13px;border:1.5px solid #D8D0C0;background:#fff;color:#6A8A8A;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;margin-top:10px'>&#x1F4E4; Export trip (JSON)</button>" : "");

  var tpCancel = function(){
    _tripEditing = false;
    _tripCancelFn = null;
    if (isNew) { _tripView = "list"; renderTrips(); } else { _tripView = "detail"; renderTripDetail(); }
  };
  _tripCancelFn = tpCancel;
  document.getElementById("tripCancelEdit").addEventListener("click", tpCancel);
  document.getElementById("tpSave").addEventListener("click", function(){
    var name = document.getElementById("tpName").value.trim();
    if (!name) { toast("Trip name can't be empty"); return; }
    var start = document.getElementById("tpStart").value;
    var end = document.getElementById("tpEnd").value;
    if (!start) { toast("Start date is required"); return; }
    if (end && end < start) { toast("End date can't be before start"); return; }
    var trips = getTrips();
    if (isNew) {
      var nid = Date.now() + Math.floor(Math.random()*100000);
      trips.unshift({ id:nid, name:name, start:start, end:end||null, updated:Date.now(), bookings:[] });
      _tripOpenId = nid;
    } else {
      var ex = trips.find(function(x){ return x.id === id; });
      if (ex) { ex.name = name; ex.start = start; ex.end = end||null; ex.updated = Date.now(); }
    }
    saveTripsStore(trips);
    _tripEditing = false;
    _tripCancelFn = null;
    _tripView = "detail";
    renderTripDetail();
    toast("Trip saved");
  });
  var _tpDel = document.getElementById("tpDelete");
  if (_tpDel) _tpDel.addEventListener("click", function(){
    if (!confirm("Delete this trip and all its bookings?")) return;
    var trips = getTrips().filter(function(x){ return x.id !== id; });
    addTomb("trips", id);
    saveTripsStore(trips);
    _tripEditing = false;
    _tripCancelFn = null;
    _tripView = "list";
    _tripOpenId = null;
    renderTrips();
    toast("Trip deleted");
  });
  var _tpExp = document.getElementById("tpExport");
  if (_tpExp) _tpExp.addEventListener("click", function(){
    var trip = getTrips().find(function(x){ return x.id === id; });
    if (!trip) return;
    var payload = {
      hearth: "trip-v1",
      name: trip.name,
      start: trip.start,
      end: trip.end,
      bookings: (trip.bookings||[]).map(function(b){
        return { type:b.type, title:b.title, start:b.start, end:b.end, location:b.location, ref:b.ref, notes:b.notes, connectsFrom:!!b.connectsFrom, boarding:b.boarding||"", gate:b.gate||"", seats:b.seats||"" };
      })
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "hearth-trip-" + (trip.name||"trip").toLowerCase().replace(/[^a-z0-9]+/g,"-") + ".json";
    a.click();
    URL.revokeObjectURL(url);
  });
}

function openBookingEditor(tripId, bookingId) {
  _tripEditing = true;
  var trip = getTrips().find(function(x){ return x.id === tripId; });
  if (!trip) { _tripView = "list"; renderTrips(); return; }
  var b = bookingId != null ? (trip.bookings||[]).find(function(x){ return x.id === bookingId; }) : null;
  var isNew = !b;
  var el = document.getElementById("tripsContent");
  var typeOpts = Object.keys(TRIP_BOOKING_TYPES).map(function(k){
    var sel = (b ? b.type === k : k === "flight") ? " selected" : "";
    return "<option value='" + k + "'" + sel + ">" + TRIP_BOOKING_TYPES[k].icon + " " + TRIP_BOOKING_TYPES[k].label + "</option>";
  }).join("");
  el.innerHTML =
    "<button id='bkCancelEdit' style='border:none;background:none;color:#0F8A8A;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px'>&larr; Cancel</button>" +
    "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:14px'>" + (isNew?"New booking":"Edit booking") + " &mdash; " + esc(trip.name) + "</div>" +
    fieldLabel("Type") +
    "<select id='bkType' style='" + recipeInputCss() + "margin-bottom:12px'>" + typeOpts + "</select>" +
    "<div style='display:flex;align-items:center;justify-content:space-between;background:#F0F8F8;border-radius:10px;padding:11px 14px;margin-bottom:14px'>" +
      "<div>" +
        "<div style='font-size:14px;font-weight:700;color:#1A2E2E'>Connecting leg</div>" +
        "<div style='font-size:12px;color:#6A8A8A;margin-top:2px'>Show transfer time from the previous booking</div>" +
      "</div>" +
      "<label class='toggle-switch'><input type='checkbox' id='bkConnects'" + (b && b.connectsFrom ? " checked" : "") + "><span class='toggle-slider'></span></label>" +
    "</div>" +
    fieldLabel("Title") +
    "<input id='bkTitle' type='text' value='" + (b?esc(b.title):"") + "' placeholder='e.g. Outbound flight DUB-ACE' style='" + recipeInputCss() + "margin-bottom:12px'>" +
    fieldLabel("Start date & time") +
    "<input id='bkStart' type='datetime-local' value='" + (b&&b.start?b.start:"") + "' style='" + recipeInputCss() + "margin-bottom:12px'>" +
    "<div id='bkFlightFields'" + ((b ? b.type === "flight" : true) ? "" : " style='display:none'") + ">" +
      "<div style='display:flex;gap:10px'>" +
        "<div style='flex:1'>" + fieldLabel("Boarding time (optional)") +
          "<input id='bkBoarding' type='time' value='" + (b&&b.boarding?esc(b.boarding):"") + "' style='" + recipeInputCss() + "margin-bottom:12px'></div>" +
        "<div style='flex:1'>" + fieldLabel("Gate (optional)") +
          "<input id='bkGate' type='text' value='" + (b&&b.gate?esc(b.gate):"") + "' placeholder='e.g. B23' style='" + recipeInputCss() + "margin-bottom:12px'></div>" +
      "</div>" +
      fieldLabel("Seat(s) (optional)") +
      "<input id='bkSeats' type='text' value='" + (b&&b.seats?esc(b.seats):"") + "' placeholder='e.g. 14A, 14B' style='" + recipeInputCss() + "margin-bottom:12px'>" +
    "</div>" +
    fieldLabel("End date & time (optional, for stays)") +
    "<input id='bkEnd' type='datetime-local' value='" + (b&&b.end?b.end:"") + "' style='" + recipeInputCss() + "margin-bottom:12px'>" +
    fieldLabel("Location") +
    "<input id='bkLocation' type='text' value='" + (b&&b.location?esc(b.location):"") + "' placeholder='e.g. Cork Airport' style='" + recipeInputCss() + "margin-bottom:12px'>" +
    fieldLabel("Reference / confirmation number") +
    "<input id='bkRef' type='text' value='" + (b&&b.ref?esc(b.ref):"") + "' style='" + recipeInputCss() + "margin-bottom:12px'>" +
    fieldLabel("Notes (optional)") +
    "<textarea id='bkNotes' rows='3' style='" + recipeInputCss() + "margin-bottom:16px;resize:vertical;line-height:1.6'>" + (b&&b.notes?esc(b.notes):"") + "</textarea>" +
    // Connecting-leg entry (v292): NEW flight bookings only — one Save creates
    // both legs as separate bookings (same data model, same timeline display),
    // the second marked connectsFrom and sharing leg 1's reference.
    (isNew ?
      "<div id='bkLeg2Wrap' style='" + ((b ? b.type === "flight" : true) ? "" : "display:none;") + "margin-bottom:16px'>" +
        "<button id='bkAddLeg' type='button' style='width:100%;padding:11px;border:1.5px dashed #0F8A8A;background:#F0F8F8;color:#0F8A8A;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>&#x21C4; Add connecting leg</button>" +
        "<div id='bkLeg2' style='display:none;border:1.5px dashed #B8D8D8;border-radius:12px;padding:12px;margin-top:2px'>" +
          "<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:10px'>" +
            "<div style='font-size:14px;font-weight:700;color:#1A2E2E'>&#x21C4; Connecting leg</div>" +
            "<button id='bkRemoveLeg' type='button' aria-label='Remove connecting leg' style='border:none;background:none;color:#C06060;font-size:16px;cursor:pointer;padding:2px 6px'>&#x2715;</button>" +
          "</div>" +
          fieldLabel("Leg 2 title") +
          "<input id='bkTitle2' type='text' placeholder='e.g. Connecting flight ZRH-BER' style='" + recipeInputCss() + "margin-bottom:12px'>" +
          fieldLabel("Leg 2 start date & time") +
          "<input id='bkStart2' type='datetime-local' style='" + recipeInputCss() + "margin-bottom:12px'>" +
          "<div style='display:flex;gap:10px'>" +
            "<div style='flex:1'>" + fieldLabel("Boarding time (optional)") +
              "<input id='bkBoarding2' type='time' style='" + recipeInputCss() + "margin-bottom:12px'></div>" +
            "<div style='flex:1'>" + fieldLabel("Gate (optional)") +
              "<input id='bkGate2' type='text' placeholder='e.g. B23' style='" + recipeInputCss() + "margin-bottom:12px'></div>" +
          "</div>" +
          fieldLabel("Seat(s) (optional)") +
          "<input id='bkSeats2' type='text' placeholder='e.g. 14A, 14B' style='" + recipeInputCss() + "margin-bottom:12px'>" +
          fieldLabel("Leg 2 location") +
          "<input id='bkLocation2' type='text' placeholder='e.g. Zurich Airport' style='" + recipeInputCss() + "margin-bottom:8px'>" +
          "<div style='font-size:12px;color:#6A8A8A;line-height:1.45'>Uses the same reference as leg 1 and shows as its own card. Set leg 1's <b>End date &amp; time</b> (the arrival) above to show the transfer time between the legs.</div>" +
        "</div>" +
      "</div>"
    : "") +
    "<button id='bkSave' style='width:100%;padding:13px;border:none;background:#0F8A8A;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>Save</button>" +
    (b ? "<button id='bkDelete' style='width:100%;padding:13px;border:1.5px solid #C03030;background:#fff;color:#C03030;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;margin-top:10px'>Delete booking</button>" : "");

  window.scrollTo(0, 0);
  // Flight-only sections follow the type select (v292)
  document.getElementById("bkType").addEventListener("change", function(){
    var isFlight = this.value === "flight";
    var ff = document.getElementById("bkFlightFields");
    if (ff) ff.style.display = isFlight ? "" : "none";
    var lw = document.getElementById("bkLeg2Wrap");
    if (lw) lw.style.display = isFlight ? "" : "none";
  });
  var _addLeg = document.getElementById("bkAddLeg");
  if (_addLeg) _addLeg.addEventListener("click", function(){
    document.getElementById("bkLeg2").style.display = "";
    _addLeg.style.display = "none";
  });
  var _remLeg = document.getElementById("bkRemoveLeg");
  if (_remLeg) _remLeg.addEventListener("click", function(){
    document.getElementById("bkLeg2").style.display = "none";
    var ab = document.getElementById("bkAddLeg");
    if (ab) ab.style.display = "";
  });
  var bkCancel = function(){
    _tripEditing = false; _tripCancelFn = null; _tripView = "detail"; renderTripDetail();
    if (bookingId != null) {
      requestAnimationFrame(function(){
        var bc = document.querySelector(".booking-card[data-bid='" + bookingId + "']");
        if (bc) { var hdr = document.querySelector("header"); var off = hdr ? hdr.offsetHeight + 8 : 80; window.scrollTo({ top: bc.getBoundingClientRect().top + window.pageYOffset - off, behavior: "smooth" }); }
      });
    }
  };
  _tripCancelFn = bkCancel;
  document.getElementById("bkCancelEdit").addEventListener("click", bkCancel);
  document.getElementById("bkSave").addEventListener("click", function(){
    var title = document.getElementById("bkTitle").value.trim();
    var start = document.getElementById("bkStart").value;
    if (!title) { toast("Title can't be empty"); return; }
    if (!start) { toast("Start date & time is required"); return; }
    var type = document.getElementById("bkType").value;
    var isFlight = type === "flight";
    var connectsFrom = document.getElementById("bkConnects").checked;
    var end = document.getElementById("bkEnd").value;
    var location = document.getElementById("bkLocation").value.trim();
    var ref = document.getElementById("bkRef").value.trim();
    var notes = document.getElementById("bkNotes").value.trim();
    var boarding = isFlight ? document.getElementById("bkBoarding").value : "";
    var gate = isFlight ? document.getElementById("bkGate").value.trim() : "";
    var seats = isFlight ? document.getElementById("bkSeats").value.trim() : "";
    // Connecting leg (v292, new flight bookings only): validate BEFORE saving
    // leg 1 so a failed leg 2 never half-saves. A visible-but-untouched leg 2
    // section is skipped silently.
    var leg2 = null;
    var leg2El = document.getElementById("bkLeg2");
    if (isNew && isFlight && leg2El && leg2El.style.display !== "none") {
      var t2 = document.getElementById("bkTitle2").value.trim();
      var s2 = document.getElementById("bkStart2").value;
      var b2 = document.getElementById("bkBoarding2").value;
      var g2 = document.getElementById("bkGate2").value.trim();
      var st2 = document.getElementById("bkSeats2").value.trim();
      var l2 = document.getElementById("bkLocation2").value.trim();
      if (t2 || s2 || b2 || g2 || st2 || l2) {
        if (!t2) { toast("Leg 2 title can't be empty"); return; }
        if (!s2) { toast("Leg 2 start date & time is required"); return; }
        leg2 = { title:t2, start:s2, boarding:b2, gate:g2, seats:st2, location:l2 };
      }
    }
    var trips2 = getTrips();
    var trip2 = trips2.find(function(x){ return x.id === tripId; });
    if (!trip2) { _tripView = "list"; renderTrips(); return; }
    trip2.bookings = trip2.bookings || [];
    var targetBid;
    if (isNew) {
      var nbid = Date.now() + Math.floor(Math.random()*100000);
      targetBid = nbid;
      trip2.bookings.push({ id:nbid, type:type, title:title, start:start, end:end||null, location:location, ref:ref, notes:notes, connectsFrom:connectsFrom||false, boarding:boarding, gate:gate, seats:seats, updated:Date.now() });
      if (leg2) {
        trip2.bookings.push({ id:nbid + 1 + Math.floor(Math.random()*100000), type:"flight", title:leg2.title, start:leg2.start, end:null, location:leg2.location, ref:ref, notes:"", connectsFrom:true, boarding:leg2.boarding, gate:leg2.gate, seats:leg2.seats, updated:Date.now() });
      }
    } else {
      targetBid = bookingId;
      var exb = trip2.bookings.find(function(x){ return x.id === bookingId; });
      if (exb) { exb.type=type; exb.title=title; exb.start=start; exb.end=end||null; exb.location=location; exb.ref=ref; exb.notes=notes; exb.connectsFrom=connectsFrom||false; exb.boarding=boarding; exb.gate=gate; exb.seats=seats; exb.updated=Date.now(); }
    }
    trip2.updated = Date.now();
    saveTripsStore(trips2);
    _tripEditing = false;
    _tripCancelFn = null;
    _tripView = "detail";
    renderTripDetail();
    toast(leg2 ? "Both legs saved" : "Booking saved");
    requestAnimationFrame(function(){
      var bc = document.querySelector(".booking-card[data-bid='" + targetBid + "']");
      if (bc) { var hdr2 = document.querySelector("header"); var off2 = hdr2 ? hdr2.offsetHeight + 8 : 80; window.scrollTo({ top: bc.getBoundingClientRect().top + window.pageYOffset - off2, behavior: "smooth" }); }
    });
  });
  var _bkDel = document.getElementById("bkDelete");
  if (_bkDel) _bkDel.addEventListener("click", function(){
    if (!confirm("Delete this booking?")) return;
    var trips3 = getTrips();
    var trip3 = trips3.find(function(x){ return x.id === tripId; });
    if (trip3) {
      trip3.bookings = (trip3.bookings||[]).filter(function(x){ return x.id !== bookingId; });
      trip3.updated = Date.now();
    }
    addTomb("bookings", bookingId);
    saveTripsStore(trips3);
    _tripEditing = false;
    _tripCancelFn = null;
    _tripView = "detail";
    renderTripDetail();
    toast("Booking deleted");
  });
}

// A section-header line (e.g. "<b>Base</b>" or "Sauce:") — kept for display as a
// sub-heading but never treated as a buyable ingredient. Pattern-matched so it
// also rescues recipes saved before headers were flagged (no re-import needed).
function isHeaderIng(ing){
  if (!ing) return true;
  if (ing.header) return true;
  var n = String(ing.name||"").trim();
  if (!n) return true;
  if (/^<(b|strong)\b[^>]*>[\s\S]*<\/(b|strong)>$/i.test(n)) return true;          // <b>Base</b>
  var bare = n.replace(/<\/?[^>]+>/g,"").trim();
  if (!ing.amount && !ing.unit && /:\s*$/.test(bare)) return true;                 // "Sauce:"
  return false;
}
function headerLabel(ing){
  return String(ing && ing.name || "").replace(/<\/?[^>]+>/g,"").replace(/:\s*$/,"").trim();
}

