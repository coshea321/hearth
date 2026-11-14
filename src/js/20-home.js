// ============================================================
// HOME SCREEN
// ============================================================
var homeQuickMode = null; // "grocery" | "todo" | "exercise"

// ── Weather (Open-Meteo, no API key, device-local) ───────────
// Carrigaline, Co. Cork. Cached in localStorage; refetched only if
// older than 30 min. Never synced via Firebase. Fails silently:
// card stays hidden if no data and no cache.
var HW_LAT = 51.81, HW_LON = -8.39;
var HW_CACHE_KEY = "hearthWeather";
var HW_MAX_AGE = 30 * 60 * 1000; // 30 min
var _hwFetching = false;

// Nearest-town lookup (v316) — offline table of ~30 Irish towns/cities so the
// weather card can show a real place name instead of "Current location",
// with zero network calls / third-party geocoding. Approximate town centres.
var HW_TOWNS = [
  {n:"Carrigaline", lat:51.8103, lon:-8.3903},
  {n:"Cork", lat:51.8985, lon:-8.4756},
  {n:"Cobh", lat:51.8506, lon:-8.2986},
  {n:"Midleton", lat:51.9147, lon:-8.1739},
  {n:"Ballincollig", lat:51.8875, lon:-8.5936},
  {n:"Bandon", lat:51.7444, lon:-8.7433},
  {n:"Fermoy", lat:52.1400, lon:-8.2761},
  {n:"Mallow", lat:52.1369, lon:-8.6403},
  {n:"Youghal", lat:51.9500, lon:-7.8500},
  {n:"Skibbereen", lat:51.5500, lon:-9.2667},
  {n:"Killarney", lat:52.0599, lon:-9.5044},
  {n:"Tralee", lat:52.2708, lon:-9.7025},
  {n:"Limerick", lat:52.6638, lon:-8.6267},
  {n:"Ennis", lat:52.8436, lon:-8.9864},
  {n:"Galway", lat:53.2707, lon:-9.0568},
  {n:"Waterford", lat:52.2593, lon:-7.1101},
  {n:"Clonmel", lat:52.3550, lon:-7.7000},
  {n:"Kilkenny", lat:52.6541, lon:-7.2448},
  {n:"Carlow", lat:52.8365, lon:-6.9341},
  {n:"Wexford", lat:52.3369, lon:-6.4633},
  {n:"Dublin", lat:53.3498, lon:-6.2603},
  {n:"Bray", lat:53.2028, lon:-6.0986},
  {n:"Greystones", lat:53.1439, lon:-6.0708},
  {n:"Naas", lat:53.2167, lon:-6.6667},
  {n:"Newbridge", lat:53.1833, lon:-6.8000},
  {n:"Portlaoise", lat:53.0333, lon:-7.3000},
  {n:"Athlone", lat:53.4239, lon:-7.9407},
  {n:"Mullingar", lat:53.5258, lon:-7.3378},
  {n:"Longford", lat:53.7276, lon:-7.7933},
  {n:"Tullamore", lat:53.2739, lon:-7.4931},
  {n:"Drogheda", lat:53.7189, lon:-6.3478},
  {n:"Dundalk", lat:54.0000, lon:-6.4000},
  {n:"Navan", lat:53.6528, lon:-6.6819},
  {n:"Sligo", lat:54.2697, lon:-8.4694},
  {n:"Letterkenny", lat:54.9500, lon:-7.7333},
  {n:"Cavan", lat:53.9900, lon:-7.3600},
  {n:"Monaghan", lat:54.2500, lon:-6.9681},
  {n:"Roscommon", lat:53.6333, lon:-8.1833}
];
var HW_TOWN_RADIUS_KM = 20; // beyond this, fall back to "Current location"
function hwNearestTown(lat, lon) {
  var best = null, bestD = Infinity;
  for (var i = 0; i < HW_TOWNS.length; i++) {
    var t = HW_TOWNS[i];
    var dLat = (t.lat - lat) * Math.PI / 180;
    var dLon = (t.lon - lon) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat * Math.PI / 180) * Math.cos(t.lat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var d = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (d < bestD) { bestD = d; best = t.n; }
  }
  return (bestD <= HW_TOWN_RADIUS_KM) ? best : null;
}

function hwCodeToIcon(code) {
  // WMO weather codes → emoji
  if (code === 0) return "\u2600\uFE0F";                 // clear
  if (code === 1 || code === 2) return "\uD83C\uDF24\uFE0F"; // mainly clear / partly cloudy
  if (code === 3) return "\u2601\uFE0F";                 // overcast
  if (code === 45 || code === 48) return "\uD83C\uDF2B\uFE0F"; // fog
  if (code >= 51 && code <= 57) return "\uD83C\uDF26\uFE0F";   // drizzle
  if (code >= 61 && code <= 67) return "\uD83C\uDF27\uFE0F";   // rain
  if (code >= 71 && code <= 77) return "\uD83C\uDF28\uFE0F";   // snow
  if (code >= 80 && code <= 82) return "\uD83C\uDF26\uFE0F";   // rain showers
  if (code >= 85 && code <= 86) return "\uD83C\uDF28\uFE0F";   // snow showers
  if (code >= 95) return "\u26C8\uFE0F";                 // thunderstorm
  return "\uD83C\uDF24\uFE0F";
}
function hwCodeToText(code) {
  if (code === 0) return "Clear";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Cloudy";
}
function hwPaint(data, stale) {
  var card = document.getElementById("homeWeather");
  if (!card || !data) return;
  var iconEl = document.getElementById("hwIcon");
  var tempEl = document.getElementById("hwTemp");
  var condEl = document.getElementById("hwCond");
  var metaEl = document.getElementById("hwMeta");
  iconEl.innerHTML = hwCodeToIcon(data.code);
  tempEl.textContent = Math.round(data.temp) + "\u00B0";
  condEl.textContent = hwCodeToText(data.code) + " \u00B7 " + (data.loc || "Carrigaline");
  // "as of" timestamp lives under the temperature since v327 (was the last
  // meta line) \u2014 one line shorter on the right, so the card stays compact.
  var t = new Date(data.at);
  var hh = ("0" + t.getHours()).slice(-2), mm = ("0" + t.getMinutes()).slice(-2);
  var stampEl = document.getElementById("hwStamp");
  if (stampEl) stampEl.textContent = "as of " + hh + ":" + mm;
  var feelsStr = (data.feels != null) ? "Feels <b>" + data.feels + "\u00B0</b><br>" : "";
  // Today's chance of rain (v305). Prefer the top-level pop; fall back to
  // days[0].pop for caches written before pop was stored there.
  var pop = (data.pop != null) ? data.pop : (data.days && data.days[0] ? data.days[0].pop : null);
  // Rain and current wind share one meta line (v327). No wind fallback for
  // pre-v327 caches \u2014 days[0].wind is the daily MAX, not current; the wind
  // part just hides until a fresh fetch.
  var bits = [];
  if (pop != null) bits.push("\u2614 <b>" + pop + "%</b>");
  if (data.wind != null) bits.push("\uD83D\uDCA8 <b>" + data.wind + "</b> km/h");
  var rainWindStr = bits.length ? bits.join(" \u00B7 ") + "<br>" : "";
  metaEl.innerHTML = feelsStr + "H:<b>" + data.high + "\u00B0</b> L:<b>" + data.low +
    "\u00B0</b><br>" + rainWindStr + "Humidity <b>" + data.hum + "%</b>";
  card.classList.toggle("hw-stale", !!stale);
  card.classList.add("hw-show");
}
function hwLoadCache() {
  try { return JSON.parse(localStorage.getItem(HW_CACHE_KEY) || "null"); }
  catch (e) { return null; }
}
// Try the device's GPS (so weather follows you while travelling); falls back
// to the hardcoded Carrigaline coords on denial/timeout/unsupported browser.
// Coords are used only to build the Open-Meteo request URL — never stored
// or synced beyond the existing device-local hearthWeather cache.
function hwGetCoords(cb) {
  if (!navigator.geolocation) { cb(HW_LAT, HW_LON, false); return; }
  navigator.geolocation.getCurrentPosition(
    function(pos) { cb(pos.coords.latitude, pos.coords.longitude, true); },
    function() { cb(HW_LAT, HW_LON, false); },
    { timeout: 8000, maximumAge: 10 * 60 * 1000 }
  );
}
function fetchWeather(force) {
  // Paint cache immediately (possibly stale) so card never flashes empty
  var cached = hwLoadCache();
  if (cached) hwPaint(cached, (Date.now() - cached.at) > HW_MAX_AGE);

  // Skip network if cache is fresh, or a fetch is already in flight.
  // `force` (used when opening the detail sheet) bypasses the freshness gate
  // so an older cache lacking 3-day data still gets refreshed.
  if (!force && cached && (Date.now() - cached.at) <= HW_MAX_AGE && cached.days && cached.hours) return;
  if (_hwFetching) return;
  if (!navigator.onLine) return; // offline: keep showing cache (or nothing)
  _hwFetching = true;

  hwGetCoords(function(lat, lon, isDevice) {
  var url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat +
    "&longitude=" + lon +
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m" +
    "&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m" +
    "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,wind_speed_10m_max" +
    "&timezone=auto&forecast_days=4";

  fetch(url).then(function(r){ return r.json(); }).then(function(j){
    _hwFetching = false;
    if (!j || !j.current || !j.daily) return;
    var dl = j.daily, days = [];
    for (var i = 0; i < (dl.time ? dl.time.length : 0) && i < 4; i++) {
      days.push({
        date: dl.time[i],
        code: dl.weather_code[i],
        hi:   Math.round(dl.temperature_2m_max[i]),
        lo:   Math.round(dl.temperature_2m_min[i]),
        pop:  (dl.precipitation_probability_max ? dl.precipitation_probability_max[i] : null),
        wind: (dl.wind_speed_10m_max ? Math.round(dl.wind_speed_10m_max[i]) : null)
      });
    }
    // Next ~24 hours, starting from the current hour (rolling window into tomorrow)
    var hl = j.hourly, hours = [];
    if (hl && hl.time) {
      var nowCutoff = Date.now() - 30 * 60000; // allow the current hour's slot
      for (var h = 0; h < hl.time.length; h++) {
        if (new Date(hl.time[h]).getTime() < nowCutoff) continue;
        hours.push({
          time: hl.time[h],
          temp: Math.round(hl.temperature_2m[h]),
          code: hl.weather_code[h],
          pop:  (hl.precipitation_probability ? hl.precipitation_probability[h] : null),
          wind: (hl.wind_speed_10m && hl.wind_speed_10m[h] != null ? Math.round(hl.wind_speed_10m[h]) : null)
        });
        if (hours.length >= 24) break;
      }
    }
    var rec = {
      temp:  j.current.temperature_2m,
      hum:   j.current.relative_humidity_2m,
      feels: (j.current.apparent_temperature != null ? Math.round(j.current.apparent_temperature) : null),
      code:  j.current.weather_code,
      high:  Math.round(dl.temperature_2m_max[0]),
      low:   Math.round(dl.temperature_2m_min[0]),
      pop:   (days[0] ? days[0].pop : null), // today's max chance of rain (v305)
      wind:  (j.current.wind_speed_10m != null ? Math.round(j.current.wind_speed_10m) : null), // current wind km/h (v327)
      days:  days,
      hours: hours,
      loc:   isDevice ? (hwNearestTown(lat, lon) || "Current location") : "Carrigaline",
      at:    Date.now()
    };
    try { localStorage.setItem(HW_CACHE_KEY, JSON.stringify(rec)); } catch (e) {}
    hwPaint(rec, false);
    // If the detail sheet is open, refresh its contents with the new data
    var ws = document.getElementById("weatherOverlay");
    if (ws && ws.classList.contains("open")) renderWeatherSheet(rec);
  }).catch(function(){
    _hwFetching = false;
    // Network failed: leave any cached paint in place; if none, card stays hidden
  });
  });
}

// ── Weather detail sheet (hourly + next 3 days) ──────────────
function hwDayName(dateStr, idx) {
  if (idx === 0) return "Today";
  if (idx === 1) return "Tomorrow";
  var dn = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var d = new Date(dateStr + "T00:00:00");
  return isNaN(d.getTime()) ? "" : dn[d.getDay()];
}
function hwHourLabel(timeStr, idx) {
  if (idx === 0) return "Now";
  var d = new Date(timeStr);
  var h = d.getHours();
  var h12 = h % 12; if (h12 === 0) h12 = 12;
  return h12 + (h >= 12 ? "pm" : "am");
}
function renderHourlyRow(hours) {
  if (!hours || !hours.length) return "";
  var html = "<div class='hw-hourly-label'>Next 24 hours</div><div class='hw-hourly chip-scroll'>";
  for (var i = 0; i < hours.length; i++) {
    var hr = hours[i];
    html += "<div class='hw-hour'>" +
      "<span class='hw-hour-label'>" + hwHourLabel(hr.time, i) + "</span>" +
      "<span class='hw-hour-icon'>" + hwCodeToIcon(hr.code) + "</span>" +
      "<span class='hw-hour-temp'>" + hr.temp + "°</span>" +
      "<span class='hw-hour-pop'>" + (hr.pop != null && hr.pop >= 20 ? hr.pop + "%" : "") + "</span>" +
      "<span class='hw-hour-wind'>" + (hr.wind != null ? "💨" + hr.wind : "") + "</span>" +
    "</div>";
  }
  html += "</div>";
  return html;
}
function renderWeatherSheet(data) {
  var body = document.getElementById("weatherSheetBody");
  if (!body) return;
  if (!data) { body.innerHTML = "<div class='hw-sheet-empty'>No weather data yet.</div>"; return; }
  var html = "";
  // Hourly strip (next 24h, scrolls horizontally). The current-conditions
  // header was removed in v327 \u2014 the front card and the strip's "Now" slot
  // already cover it.
  html += renderHourlyRow(data.hours);
  // Upcoming day rows — today's own row removed in v327 (the front card and
  // the hourly strip above already cover today)
  var days = data.days || [];
  if (days.length > 1) {
    html += "<div class='hw-sheet-days'>";
    for (var i = 1; i < days.length; i++) {
      var dy = days[i];
      html += "<div class='hw-day-row'>" +
        "<span class='hw-day-name'>" + hwDayName(dy.date, i) + "</span>" +
        "<span class='hw-day-icon'>" + hwCodeToIcon(dy.code) + "</span>" +
        "<span class='hw-day-temps'><b>" + dy.hi + "\u00B0</b> / " + dy.lo + "\u00B0</span>" +
        "<span class='hw-day-rain'>\uD83D\uDCA7 " + (dy.pop != null ? dy.pop + "%" : "\u2013") + "</span>" +
        "<span class='hw-day-wind'>\uD83D\uDCA8 " + (dy.wind != null ? dy.wind : "\u2013") + "</span>" +
      "</div>";
    }
    html += "</div>";
    html += "<div class='hw-sheet-units'>Wind in km/h \u00B7 \uD83D\uDCA7 chance of rain</div>";
  } else {
    html += "<div class='hw-sheet-empty'>Loading forecast\u2026</div>";
  }
  // Timestamp
  var t = new Date(data.at);
  var hh = ("0" + t.getHours()).slice(-2), mm = ("0" + t.getMinutes()).slice(-2);
  var staleNote = (Date.now() - data.at) > HW_MAX_AGE ? " (cached)" : "";
  html += "<div class='hw-sheet-stamp'>" + (data.loc || "Carrigaline") + " \u00B7 as of " + hh + ":" + mm + staleNote + "</div>";
  body.innerHTML = html;
}
function openWeatherSheet() {
  var ov = document.getElementById("weatherOverlay");
  if (!ov) return;
  renderWeatherSheet(hwLoadCache());
  ov.classList.add("open");
  fetchWeather(true); // ensure fresh 3-day data; re-renders sheet on arrival
}

// ── Global search (v384) ─────────────────────────────────────────
// A FINDER, not a filter: scans Lists (grocery/general/personal/travel),
// Notes (personal + work) and, since v387, Recipes — and hands off to the
// section that owns a match — it never renders records itself. No new
// store, no sync changes, nothing added to export/backup, nothing
// scheduled. Full design record + the reasoning behind every rule below:
// HEARTH-global-search.md (Recipes was explicitly deferred there as
// "phase 2, his call" — v387 is that call being made).
//
// Substring match is PRIMARY; fuzzyMatch runs ONLY as a fallback, and only
// when substring found nothing in EVERY group (never mixed group-by-group,
// or a result set could silently combine exact hits in one group with
// near-misses in another with no way to tell them apart). This is the v383
// lesson, not a style preference: fuzzyMatch is a subsequence matcher, so
// as the PRIMARY matcher "curry" matches any text containing c..u..r..r..y
// in order — at app scale that returns most of the data and reads to the
// user as "search did nothing" (measured: 7/12 recipes for "curry" pre-v383).
var GLOBAL_SEARCH_MIN = 2;
var GLOBAL_SEARCH_CAP = 5;
var GLOBAL_SEARCH_GROUPS = [
  { key:"grocery",  label:"&#x1F6D2; Grocery",  color:"#2D6B35" },
  { key:"todo",     label:"&#x2705; To-do",   color:"#5A3AA0" },
  { key:"personal", label:"&#x1F464; Personal", color:"#A0205A" },
  { key:"travel",   label:"&#x2708; Travel",    color:"#1A5A8A" },
  { key:"notes",    label:"&#x1F4DD; Notes",    color:"#A05A10" },
  { key:"recipes",  label:"&#x1F37D; Recipes",  color:"#B5651D" }, // phase 2 (v387) — HEARTH-global-search.md §9. Colour matches the Recipes section's own theme colour (switchSection).
  { key:"appliances", label:"&#x1F4E6; Home inventory", color:"#3E5C6B" }, // v424 — the section has no nav icon by default, so search is its main door in.
  { key:"projects",   label:"&#x1F528; Projects",       color:"#8A5A2B" }, // v499 — off the bar by default, so search is a main door in; a tap opens the project.
  { key:"health",     label:"&#x1FA7A; Health",         color:"#2F6E6E" }  // v449 — same reasoning, and the one section where the thing you searched for IS the record.
];
// Notes aren't in LIST_CONFIG/listData (v318) — they live in their own two
// stores (personal + work, NOTES_CONTEXTS). Reshaped to {id,name,notes} so
// listSearchText() can read them the same way as a list item, and tagged
// with which context they came from (_nctx) so a tapped result can land on
// the right Notes sub-tab via openRecord's opts.ctx.
function globalSearchNotesPool() {
  var out = [];
  Object.keys(NOTES_CONTEXTS).forEach(function(ctx){
    // normaliseNotes() itself null-guards its input now (v388) — no need to
    // pre-filter here.
    normaliseNotes(storeGet(NOTES_CONTEXTS[ctx].key) || []).forEach(function(n){
      if (n) out.push({ id:n.id, name:n.title, notes:n.body, _nctx:ctx });
    });
  });
  return out;
}
function globalSearchPool(key) {
  if (key === "notes") return globalSearchNotesPool();
  if (key === "recipes") return getRecipeBook(); // already null-guarded at the source (v385)
  if (key === "appliances") return getAppliances(); // null-guarded at the source too (v424)
  if (key === "health") return getHealth();         // null-guarded at the source too (v449)
  if (key === "projects") return getProjects();     // null-guarded at the source too (v499)
  return (loadListData(key).items || []);
}
// Recipes need the wider v383 haystack (ingredients/method/category, not
// just name+notes) — everything else still uses the plain list/notes text.
// Appliances need their own haystack for the same reason recipes do: the
// numbers you came looking for (model, serial) live in fields a list item
// doesn't have, and name+notes alone would miss every one of them.
// What a result ROW is labelled with. Lists, notes, recipes and appliances
// all happen to key their name off `name`; health records use `title` (the
// watchlist shape), so without this every health hit renders "(untitled)".
function globalSearchLabel(key, item) {
  if (!item) return "";
  if (key === "health") return item.title || "";
  return item.name || "";
}
function globalSearchText(key, item) {
  if (key === "recipes") return recipeSearchText(item);
  if (key === "appliances") return applianceSearchText(item);
  // v449: same reasoning as appliances — a consultant's name, a pharmacy or a
  // dose all live in fields a plain list item doesn't have.
  if (key === "health") return healthSearchText(item);
  // v499: a project is found by what's inside it too — a tradesman's name, a
  // quote, a task.
  if (key === "projects") return projectSearchText(item);
  return listSearchText(item);
}
function globalSearch(query) {
  var q = (query || "").trim();
  if (q.length < GLOBAL_SEARCH_MIN) return { query:q, fuzzy:false, groups:[] };
  var qLow = q.toLowerCase();
  var groups = GLOBAL_SEARCH_GROUPS.map(function(g){
    var items = globalSearchPool(g.key).filter(function(it){ return it && globalSearchText(g.key, it).indexOf(qLow) !== -1; });
    return { key:g.key, label:g.label, color:g.color, items:items };
  });
  var fuzzy = false;
  if (!groups.some(function(g){ return g.items.length; })) {
    fuzzy = true;
    groups = GLOBAL_SEARCH_GROUPS.map(function(g){
      var items = globalSearchPool(g.key).filter(function(it){ return it && fuzzyMatch(q, globalSearchText(g.key, it)); });
      return { key:g.key, label:g.label, color:g.color, items:items };
    });
  }
  return { query:q, fuzzy:fuzzy, groups: groups.filter(function(g){ return g.items.length; }) };
}
// Grouped results + hand-off. Tapping any result (a row or "+N more") jumps
// to the record's list/section — there is no id-level deep link into a
// single list item, note or recipe yet (HEARTH-global-search.md §4), so the
// best a tap can do is land on the right place with the query still
// applied. List groups and Recipes (v387) hand off to that section's own
// search (openRecord resets its other filters — never silently AND with a
// stale one, the v381/v386 bug class); a Notes tap lands on the matched
// note's context (personal/work).
var _gSearchQuery = "";
function renderGlobalSearchResults() {
  var box = document.getElementById("homeSearchResults");
  var clearBtn = document.getElementById("homeSearchClear");
  if (!box) return;
  if (clearBtn) clearBtn.style.display = _gSearchQuery ? "inline" : "none";
  if (!_gSearchQuery) { box.style.display = "none"; box.innerHTML = ""; return; }
  box.style.display = "block";
  if (_gSearchQuery.length < GLOBAL_SEARCH_MIN) {
    box.innerHTML = "<div style='text-align:center;color:#B8AA90;font-size:13px;padding:10px 0'>Keep typing&#8230;</div>";
    return;
  }
  var res = globalSearch(_gSearchQuery);
  if (!res.groups.length) {
    box.innerHTML = "<div style='background:#fff;border-radius:12px;padding:16px 14px;text-align:center;font-size:14px;color:#8A8A6A'>No matches for &#8220;" + esc(_gSearchQuery) + "&#8221;</div>";
    return;
  }
  var html = "";
  if (res.fuzzy) {
    html += "<div style='text-align:center;color:#9A7A4A;font-size:12px;padding:2px 0 8px'>No exact matches &#x2014; showing similar.</div>";
  }
  res.groups.forEach(function(g){
    var shown = g.items.slice(0, GLOBAL_SEARCH_CAP);
    var more = g.items.length - shown.length;
    html += "<div style='background:#fff;border-radius:12px;padding:10px 14px;margin-bottom:8px;box-shadow:0 1px 4px rgba(20,50,20,.07)'>" +
      "<div style='font-size:13px;font-weight:700;color:#8A8A6A;margin-bottom:2px'>" + g.label + "</div>";
    shown.forEach(function(it){
      html += "<div class='gs-row' data-key='" + esc(g.key) + "'" + (it._nctx ? " data-ctx='" + esc(it._nctx) + "'" : "") +
        // Only appliances and health carry an id: they're the groups whose tap
        // opens the record itself rather than handing off to a section search.
        ((g.key === "appliances" || g.key === "health" || g.key === "projects") && it.id != null ? " data-id='" + esc(String(it.id)) + "'" : "") + " style='display:flex;align-items:center;gap:9px;padding:8px 0;cursor:pointer;touch-action:manipulation;border-top:1px solid #F0EDE6'>" +
        "<span style='flex:1;font-size:14px;font-weight:600;color:#2A2A1E;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" + esc(globalSearchLabel(g.key, it) || "(untitled)") + "</span>" +
        "<span style='color:#C8BEA8;font-size:16px'>&#x203A;</span>" +
      "</div>";
    });
    if (more > 0) {
      html += "<div class='gs-more' data-key='" + esc(g.key) + "' style='text-align:center;padding:8px 0 2px;font-size:13px;font-weight:700;color:" + g.color + ";cursor:pointer;touch-action:manipulation'>+" + more + " more &#8594;</div>";
    }
    html += "</div>";
  });
  box.innerHTML = html;
  var q = _gSearchQuery;
  box.querySelectorAll(".gs-row, .gs-more").forEach(function(row){
    row.addEventListener("click", function(){
      var key = row.dataset.key;
      if (key === "notes") { openRecord("notes", null, { ctx: row.dataset.ctx || null }); }
      // A "+N more" tap has no id even in the appliances/health groups — it
      // means "show me the rest", so it lands on the list, not on one record.
      else if (key === "appliances") { openRecord("appliances", row.dataset.id != null ? row.dataset.id : null); }
      else if (key === "health") { openRecord("health", row.dataset.id != null ? row.dataset.id : null); }
      else if (key === "projects") { openRecord("projects", row.dataset.id != null ? row.dataset.id : null); }
      else { openRecord(key, null, { query:q }); }
    });
  });
}
// ~120ms debounce (design brief §7) — the only search input in the app that
// scans multiple stores per keystroke, so it's the one that needs it; the
// per-list and per-recipe search boxes re-render synchronously and that's
// fine at their (single-store) scale.
var _gSearchDebounce = null;
(function(){
  var input = document.getElementById("homeSearchInput");
  var clearBtn = document.getElementById("homeSearchClear");
  if (!input) return;
  input.addEventListener("input", function(){
    var val = input.value;
    clearTimeout(_gSearchDebounce);
    _gSearchDebounce = setTimeout(function(){
      _gSearchQuery = val.trim();
      renderGlobalSearchResults();
    }, 120);
  });
  if (clearBtn) clearBtn.addEventListener("click", function(){
    input.value = ""; _gSearchQuery = "";
    renderGlobalSearchResults();
  });
})();

// ── Today summary card (v302) ──────────────────────────────
// One tappable line per domain, each self-suppressing when it has nothing to
// say. Shows what needs attention (starred tasks, upcoming trip, health,
// sports) plus positive confirmations (workout done). Reads only existing
// data; jumps to the relevant section on tap.
function renderTodayCard() {
  var el = document.getElementById("homeTodayCard");
  if (!el) return;
  var rows = [];
  // v488: no grocery, last-medicine or watering rows. Each repeated something
  // Home already shows just below — the Grocery preview lists the undone
  // groceries, the Last medicine card names the latest dose, and the Plants
  // card says what needs watering (same plantOverdue test). Those cards are
  // always painted, so the fact is never lost. Do NOT re-add these rows
  // without removing the thing they duplicate.
  loadListData("todo");
  var tN = ((listData.todo||{items:[]}).items||[]).filter(function(x){ return x && !x.done && x.today; }).length;
  if (tN) rows.push({ ico:"&#x2B50;", text: tN + " task" + (tN===1?"":"s") + " starred for today", act:"todo" });
  var today = trainTodayStr();
  var sess = ((getWD().workouts)||[]).filter(function(w){ return w && w.date===today; }).length;
  ((getActionLog())||[]).forEach(function(e){ if (e && e.type==="cardio" && e.date===today) sess++; });
  if (sess) rows.push({ ico:"&#x1F4AA;", text: sess + " workout" + (sess===1?"":"s") + " done today", act:"train" });
  var trips = ((getTrips())||[]).filter(function(t){ return t && tripCountdownLabel(t); })
    .sort(function(a,b){ return (a.start||"").localeCompare(b.start||""); });
  if (trips.length) {
    var t0 = trips[0], lab = tripCountdownLabel(t0);
    var tripText = lab==="Now" ? ("On your " + esc(t0.name||"trip")) : (esc(t0.name||"Trip") + " " + lab.toLowerCase());
    rows.push({ ico:"&#x2708;&#xFE0F;", text: tripText, act:"trips", id: t0.id });
  }
  // Health (v449, widened v454): TWO lines, and only two. The first is a
  // future-dated VISIT or TEST — healthCountdownLabel returns "" for anything
  // past, undated or of a kind you don't attend, so it self-suppresses like
  // the rest of the card. Still nothing from the HISTORY itself: a medical
  // history has no business nagging, and that part of the v449 note stands.
  var hlNext = healthNextAppointment();
  if (hlNext) {
    var hlWho = String(hlNext.person || "").trim();
    rows.push({ ico:"&#x1FA7A;",
                text: esc(hlNext.title || "Appointment") + (hlWho ? " (" + esc(hlWho) + ")" : "") +
                      " " + healthCountdownLabel(hlNext).toLowerCase(),
                act:"health", id: hlNext.id });
  }
  // The second (v454): a prescription running out. This is the one v449
  // offered and did NOT build — the backlog asked for a fresh call rather
  // than a quiet yes, and Cathal made it on 02/09/2026. A repeat is
  // actionable in a way an appliance warranty isn't: you have to ring the
  // surgery before the last one is gone. Self-suppressing on the same
  // pattern — healthExpiringSoon() is empty until something is inside the
  // 14-day window — and it STAYS, in red, once past, because a repeat that
  // has already run out is the most actionable state, not the least.
  // Collapses to a count above one, the plants rule: a family on four
  // repeats must not lose the whole card to them.
  var hlRx = healthExpiringSoon();
  if (hlRx.length) {
    var rx0 = hlRx[0], rxWho = String(rx0.person || "").trim();
    var rxText = hlRx.length === 1
      ? (esc(rx0.title || "A prescription") + (rxWho ? " (" + esc(rxWho) + ")" : "") +
         " " + healthExpiryLabel(rx0).toLowerCase())
      : (hlRx.length + " prescriptions running out");
    // Sorted soonest-first, so hlRx[0] is the most overdue: if it has run
    // out, the line goes red whether it is naming one or counting several.
    rows.push({ ico:"&#x1F48A;",
                text: healthExpiryPast(rx0) ? "<span style='color:#B03030'>" + rxText + "</span>" : rxText,
                act:"health", id: hlRx.length === 1 ? rx0.id : null });
  }
  // Projects (v499, confirmed 31/08/2026): ONE line, open tasks across the
  // Planning and In progress projects, with the overdue count in red.
  // Self-suppressing — projHomeSummary() is null when nothing is open — and
  // it deep-links to the project when every open task sits in one of them.
  var pj = projHomeSummary();
  if (pj) {
    var pjText = pj.open + " open project task" + (pj.open === 1 ? "" : "s");
    if (pj.overdue) pjText += " &middot; <span style='color:#B03030'>" + pj.overdue + " overdue</span>";
    rows.push({ ico:"&#x1F528;", text: pjText, act:"projects", id: pj.onlyId });
  }
  var sportCand = [];
  (getSportsTeams()||[]).forEach(function(t){
    var cached = sportsCache()[t.id], nx = cached && cached.next && cached.next[0];
    if (!nx) return;
    var ts = nx.strTimestamp ? new Date(/Z|[+-]\d\d:?\d\d$/.test(nx.strTimestamp) ? nx.strTimestamp : nx.strTimestamp + "Z")
      : (nx.dateEvent ? new Date(nx.dateEvent + "T" + (nx.strTime||"00:00:00") + "Z") : null);
    sportCand.push({ team:t, next:nx, ts: (ts && !isNaN(ts.getTime())) ? ts.getTime() : Infinity });
  });
  if (sportCand.length) {
    sportCand.sort(function(a,b){ return a.ts - b.ts; });
    var sc = sportCand[0], sSum = sportsSummarise(sc.team, [sc.next], null);
    rows.push({ ico:"&#x26BD;", text: esc(sc.team.name) + " " + esc(sSum.nextText), act:"sports" });
  }
  if (!rows.length) {
    el.innerHTML = "<div style='background:#fff;border-radius:14px;padding:16px 14px;margin-bottom:12px;box-shadow:0 1px 4px rgba(20,50,20,.07);text-align:center;font-size:14px;color:#8A8A6A;font-weight:600'>&#x2728; All caught up for today</div>";
    return;
  }
  var html = "<div style='background:#fff;border-radius:14px;padding:2px 14px;margin-bottom:12px;box-shadow:0 1px 4px rgba(20,50,20,.07)'>";
  rows.forEach(function(r, i){
    html += "<div class='today-row' data-act='" + esc(r.act) + "'" + (r.id?" data-id='" + esc(r.id) + "'":"") + " style='display:flex;align-items:center;gap:11px;padding:11px 0;cursor:pointer;touch-action:manipulation" + (i<rows.length-1?";border-bottom:1px solid #F0EDE6":"") + "'>" +
      "<span style='font-size:18px'>" + r.ico + "</span>" +
      "<span style='flex:1;font-size:14px;font-weight:600;color:#2A2A1E'>" + r.text + "</span>" +
      "<span style='color:#C8BEA8;font-size:18px'>&#x203A;</span>" +
    "</div>";
  });
  html += "</div>";
  el.innerHTML = html;
  el.querySelectorAll(".today-row").forEach(function(row){
    row.addEventListener("click", function(){
      var act = row.dataset.act;
      if (act==="todo") { openRecord(act, null); }
      else if (act==="train") { switchSection("train"); }
      else if (act==="trips") {
        openRecord("trip", row.dataset.id || null);
      }
      else if (act==="sports") { switchSection("sports"); }
      else if (act==="health") { openRecord("health", row.dataset.id || null); }
      else if (act==="projects") { openRecord("projects", row.dataset.id || null); }
    });
  });
}

// Live clock (v322): Ireland (home) time, shown only when it differs from
// local — i.e. it appears automatically while travelling and disappears once
// you're back on Irish time. The always-on local clock above it was removed
// in v488 (the phone's status bar already shows the time).
var _homeClockTimer = null;
function updateHomeClock() {
  var elIE = document.getElementById("homeClockIE");
  if (!elIE) return;
  var now = new Date();
  var localStr = now.toLocaleTimeString("en-IE", { hour:"2-digit", minute:"2-digit" });
  var ieStr = localStr;
  try { ieStr = now.toLocaleTimeString("en-IE", { hour:"2-digit", minute:"2-digit", timeZone:"Europe/Dublin" }); } catch(e) {}
  if (ieStr !== localStr) {
    elIE.textContent = "Home (Ireland) " + ieStr;
    elIE.style.display = "block";
  } else {
    elIE.style.display = "none";
  }
}
function startHomeClock() {
  updateHomeClock();
  if (_homeClockTimer) clearInterval(_homeClockTimer);
  _homeClockTimer = setInterval(updateHomeClock, 15000);
}
function stopHomeClock() {
  if (_homeClockTimer) clearInterval(_homeClockTimer);
  _homeClockTimer = null;
}

// ── Home calories card (v443) ───────────────────────────────────────────────
// "On track" is measured against PACE, not just the goal: the day's goal spread
// across a 07:00-21:00 eating window, so a big lunch reads differently at 1pm
// than the same total does at 9pm. Two deliberate choices, both to keep it
// gentle rather than nagging:
//   * being UNDER pace is never flagged - eating less than planned is not a
//     problem to warn about - so there are three states, not four; and
//   * the band is wide (a fifth of the goal, floor 300) so a normal breakfast
//     inside the first hour of the window never reads as a warning.
// Reads fl4_cal_goal (the food journal's own goal), NOT the TDEE card's
// computed goal: that is the number Cathal set and is tracking to, and it needs
// no height/weight/profile set up before this card can say anything at all.
// Returns null when nothing is logged today - the card hides on null.
function homeCalState() {
  var today = trainTodayStr();
  if (!getFoodLog().some(function(e){ return e && e.date === today && trackPersonOf(e) === "me"; })) return null;
  var eaten = tdeeIntakeToday();
  var goal  = +storeGet("fl4_cal_goal") || 2000;
  var mins  = (function(){ var d = new Date(); return d.getHours()*60 + d.getMinutes(); })();
  var pace  = Math.max(0, Math.min(1, (mins - 420) / 840));   // 07:00 -> 21:00
  var band  = Math.max(goal * 0.2, 300);
  var state = eaten > goal ? "over"
            : (eaten > goal * pace + band ? "ahead" : "ontrack");
  return { eaten:eaten, goal:goal, left:goal - eaten, state:state,
           pct: Math.max(0, Math.min(100, Math.round(eaten / goal * 100))) };
}

function renderHomeScreen() {
  // While awaiting the first remote fetch after sign-in, show a gentle loading
  // state instead of painting stale local data (prevents the flash of old content)
  if (_homeAwaitingFetch) {
    var hc = document.querySelector(".home-content");
    if (hc) hc.style.opacity = "0";
    return;
  }
  var hc2 = document.querySelector(".home-content");
  if (hc2) hc2.style.opacity = "1";
  fetchWeather();
  // Show placeholder while data loads
  var tcTrain = document.getElementById("tcTrainCount");
  if (tcTrain && tcTrain.textContent === "—") tcTrain.style.opacity = "0.4";
  var hour = new Date().getHours();
  var greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  document.getElementById("homeGreeting").textContent = greet;
  var d = new Date();
  var days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  document.getElementById("homeDateBig").textContent = days[d.getDay()] + ", " + d.getDate() + " " + months[d.getMonth()];

  // ── Train today-card: all sessions + cardio, with kcal ────
  var _today = trainTodayStr();
  var _sessions = (getWD().workouts||[]).filter(function(w){ return w && w.date === _today; });
  var _kcal = 0;
  _sessions.forEach(function(w){ _kcal += (+w.kcal||0); });
  (getActionLog()||[]).forEach(function(e){
    if (e && e.type === "cardio" && e.date === _today) { _sessions.push(e); _kcal += (+e.calories||0); }
  });
  if (_sessions.length) {
    document.getElementById("tcTrainCount").textContent = _sessions.length;
    document.getElementById("tcTrainLabel").textContent = "session" + (_sessions.length !== 1 ? "s" : "") + " today";
    document.getElementById("tcTrainSub").textContent   = _kcal > 0 ? ("~" + _kcal + " kcal burned") : "Logged";
  } else {
    document.getElementById("tcTrainCount").textContent = "—";
    document.getElementById("tcTrainLabel").textContent = "today";
    document.getElementById("tcTrainSub").textContent   = "No session yet";
  }

  // ── Baby today-card: last medicine + latest weight ─────────
  try {
    var _bd = getBD();
    var _meds = (_bd.medicine||[]).slice().sort(function(a,b){ return (b.ts||0)-(a.ts||0); });
    var _subEl = document.getElementById("tcBabySub");
    if (_subEl) {
      if (_meds.length) {
        var _m = _meds[0];
        var _ago = Date.now() - (_m.ts||0);
        var _hrs = Math.floor(_ago/3600000);
        var _agoTxt = _hrs < 1 ? "under an hour ago" : _hrs < 24 ? _hrs + "h ago" : Math.floor(_hrs/24) + "d ago";
        _subEl.textContent = (_m.name||"Medicine") + (_m.dose ? " ("+_m.dose+")" : "") + " · " + _agoTxt;
      } else {
        _subEl.textContent = "No medicine logged yet";
      }
    }
    var _gw = (_bd.growth||[]).filter(function(e){ return e && e.weight; })
      .sort(function(a,b){ return b.date.localeCompare(a.date); });
    var _wEl = document.getElementById("tcBabyWeight");
    if (_wEl) _wEl.textContent = _gw.length ? (_gw[0].weight + " kg") : "—";
    // v346: compact bottle-freshness note — only when something is actually past, factual + "check the leaflet"
    var _bNoteEl = document.getElementById("tcBabyBottleNote");
    if (_bNoteEl) {
      var _pastBottle = null;
      Object.keys(_bd.bottles||{}).forEach(function(k){
        if (_pastBottle) return;
        var b = _bd.bottles[k];
        if (b && bottleFreshness(b).status === "past") _pastBottle = b;
      });
      if (_pastBottle) {
        _bNoteEl.textContent = "⚠️ " + (_pastBottle.name||"Bottle") + " bottle may be past its date — check the leaflet.";
        _bNoteEl.style.display = "";
      } else {
        _bNoteEl.textContent = "";
        _bNoteEl.style.display = "none";
      }
    }
  } catch(e) {}

  // ── Plants glance card (v379) ────────────────────────────
  // Always painted: this card is how Plants stays reachable without spending a
  // slot in the nav bar, so it must not self-suppress the way the Today row does.
  try {
    var _ps = plantHomeSummary(getPlants());
    var _pCount = document.getElementById("tcPlantsCount");
    var _pLabel = document.getElementById("tcPlantsLabel");
    var _pSub   = document.getElementById("tcPlantsSub");
    if (_pCount) _pCount.textContent = _ps.countText;
    if (_pLabel) _pLabel.textContent = _ps.label;
    if (_pSub)   _pSub.textContent   = _ps.sub;
  } catch(e){ console.error("plants card: "+e.message); }

  // ── Calories glance card (v443) ──────────────────────────
  try {
    var _cs   = homeCalState();
    var _cCard = document.getElementById("tcCalCard");
    if (_cCard) {
      _cCard.style.display = _cs ? "" : "none";
      if (_cs) {
        var _cTone = _cs.state === "over" ? "#EF5350" : _cs.state === "ahead" ? "#FFA726" : "#4CAF7D";
        var _cSub  = _cs.state === "over"
              ? Math.abs(_cs.left).toLocaleString() + " over your goal"
              : _cs.left.toLocaleString() + " left \u00b7 " +
                (_cs.state === "ahead" ? "a bit ahead of pace" : "nicely on track");
        document.getElementById("tcCalCount").textContent = _cs.eaten.toLocaleString();
        document.getElementById("tcCalLabel").textContent = "of " + _cs.goal.toLocaleString();
        document.getElementById("tcCalSub").textContent   = _cSub;
        var _cBar = document.getElementById("tcCalBar");
        _cBar.style.width = _cs.pct + "%";
        _cBar.style.background = _cTone;
      }
    }
  } catch(e){ console.error("calories card: "+e.message); }

  // ── Today summary card (v302) ────────────────────────────
  try { renderTodayCard(); } catch(e){ console.error("renderTodayCard: "+e.message); }

  // ── Grocery spotlight (top 5 undone) ─────────────────────
  try { renderSpotlight("homeGrocerySpot", "grocery", 5); } catch(e){ console.error("renderSpotlight grocery: "+e.message); }

  // ── Todo spotlight (top 4 undone) ────────────────────────
  try { renderSpotlight("homeTodoSpot", "todo", 4, true); } catch(e){ console.error("renderSpotlight todo: "+e.message); }

  // ── Week strip ────────────────────────────────────────────
  try { renderWeekStrip(); } catch(e){ console.error("renderWeekStrip: "+e.message); }
}

function renderSpotlight(elId, lt, maxItems, todayOnly) {
  loadListData(lt);
  var items = (listData[lt]||{items:[]}).items.filter(function(x){
    return !x.done && (!todayOnly || x.today);
  }).slice(0, maxItems);
  var el = document.getElementById(elId);
  if (!items.length) {
    el.innerHTML = "<div class='home-empty-spot'>" +
      (todayOnly ? "&#x1F389; No tasks for today" :
       lt === "grocery" ? "&#x1F389; Grocery list is clear" : "&#x1F389; No pending tasks") + "</div>";
    return;
  }
  var cats = getAllCats(lt);
  var catMap = {};
  for (var i = 0; i < cats.length; i++) catMap[cats[i].id] = cats[i];
  var html = "";
  for (var j = 0; j < items.length; j++) {
    var item = items[j];
    var cat  = catMap[item.catId] || catMap["other"] || { emoji:"&#x1F4E6;", name:"Other", bg:"#EDEAE4", fg:"#4A4A3A" };
    html += "<div class='home-item'>" +
      "<span class='home-item-emoji'>"+catEmojiSafe(cat.emoji)+"</span>" +
      "<span class='home-item-name'>"+esc(item.name)+"</span>" +
      "<span class='home-item-cat' style='background:"+catColorSafe(cat.bg,"#EDEAE4")+";color:"+catColorSafe(cat.fg,"#4A4A3A")+"'>"+esc(cat.name)+"</span>" +
    "</div>";
  }
  el.innerHTML = html;
}

function renderWeekStrip() {
  var el = document.getElementById("homeWeekStrip");
  var today = trainTodayStr();
  var dayLabels = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  var d = new Date();
  var todayDow = d.getDay(); // 0=Sun
  var html = "";
  var anyWkt = false;

  for (var i = 6; i >= 0; i--) {
    var date = new Date(d); date.setDate(d.getDate() - i);
    var dateStr = date.getFullYear() + "-" + t2(date.getMonth()+1) + "-" + t2(date.getDate());
    var dow  = date.getDay();
    var label = dayLabels[dow];
    var isToday = dateStr === today;

    // Check ALL workouts on this date (an empty free-form placeholder
    // for the same date must not mask a real session)
    var hasWkt = (getWD().workouts||[]).some(function(w){
      return w && w.date === dateStr && (
        (Array.isArray(w.exercises) && w.exercises.length > 0) ||
        w.type === "yoga" || w.type === "physio" || w.kcal
      );
    });
    if (!hasWkt) {
      var alog = getActionLog();
      hasWkt = alog.some(function(e) {
        if (!e || !e.ts) return false;
        var ed = new Date(e.ts), eds = ed.getFullYear()+"-"+t2(ed.getMonth()+1)+"-"+t2(ed.getDate());
        return eds === dateStr && (e.type==="yoga"||e.type==="physio"||e.type==="workout"||e.type==="cardio");
      });
    }

    if (hasWkt) anyWkt = true;

    var dotClass = "wk-dot";
    var dotInner = "";
    if (hasWkt) { dotClass += " worked"; dotInner = "&#x1F4AA;"; }
    if (isToday) { dotClass += " today-ring"; }

    html += "<div class='wk-day'>" +
      "<span class='wk-label"+(isToday?" today":"")+"'>"+label+"</span>" +
      "<div class='"+dotClass+"'>"+dotInner+"</div>" +
    "</div>";
  }
  el.innerHTML = html;
  // v471: a week with no session is seven empty dots under a title that says
  // nothing — so hide the strip AND the "Training this week" header with it
  // (an orphaned title reads worse than the dots did). Toggled BOTH ways on
  // purpose: renderWeekStrip runs on every Home render, so the strip comes
  // straight back the moment a session lands. Deliberately NOT extended to
  // the Training today-card — that card is the only door into Train when its
  // bar icon is off (see HEARTH-backlog.md entry 4).
  var wkHdr = document.getElementById("homeWeekHdr");
  el.hidden = !anyWkt;
  if (wkHdr) wkHdr.hidden = !anyWkt;
}

// ── Today-card tap → navigate to section ─────────────────
document.getElementById("tcTrainCard").addEventListener("click", function(){ switchSection("train"); });
(function(){
  var pc = document.getElementById("tcPlantsCard");
  if (!pc) return;
  pc.addEventListener("click", function(){
    // Always the full list: the card counts every plant, so landing on a
    // filtered view would contradict the number just tapped.
    _plantOpenId = null; _plantView = "list"; _plantArea = "";
    _plantImporting = false; _plantImportParsed = null;
    switchSection("plants");
  });
})();
(function(){
  var bc = document.getElementById("tcBabyCard");
  if (!bc) return;
  bc.addEventListener("click", function(){
    // The card is "Last medicine", so land on Baby -> Medicine, not
    // whichever Baby tab was open last.
    currentBabyView = "medicine";
    switchSection("baby");
  });
})();
(function(){
  var cc = document.getElementById("tcCalCard");
  if (!cc) return;
  cc.addEventListener("click", function(){
    // Straight to the food journal on TODAY: the card is a today figure, so
    // landing on whatever day was last browsed would contradict it.
    foodDate = trainTodayStr();
    currentTrackView = "food";
    switchSection("track");
  });
})();
(function(){
  var hw = document.getElementById("homeWeather");
  if (hw) hw.addEventListener("click", function(){ openWeatherSheet(); });
  var wc = document.getElementById("weatherClose");
  if (wc) wc.addEventListener("click", function(){ document.getElementById("weatherOverlay").classList.remove("open"); });
  var wo = document.getElementById("weatherOverlay");
  if (wo) wo.addEventListener("click", function(e){ if (e.target === this) this.classList.remove("open"); });
})();
document.getElementById("hSeeAllGrocery").addEventListener("click", function(){
  switchSection("lists"); currentList = "grocery"; applyListTheme(); switchTab("list"); renderList();
});
document.getElementById("hSeeAllTodo").addEventListener("click", function(){
  switchSection("lists"); currentList = "todo"; applyListTheme(); switchTab("list"); renderList();
});

// ── Quick-add panel ───────────────────────────────────────
var hqpMode = null;
function openHqp(mode, labelText, btnClass, placeholder) {
  hqpMode = mode;
  document.getElementById("hqpLabel").textContent   = labelText;
  document.getElementById("hqpAddBtn").className    = "hqp-add " + btnClass;
  document.getElementById("homeQuickInput").placeholder = placeholder;
  document.getElementById("homeQuickInput").value   = "";
  document.getElementById("homeQuickPanel").style.display = "block";
  setTimeout(function(){ document.getElementById("homeQuickInput").focus(); }, 50);
}
function closeHqp() {
  document.getElementById("homeQuickPanel").style.display = "none";
  hqpMode = null;
}
// Grocery / To-do keep the panel open after an add (v491): clear the field and
// put the cursor back so five items are five entries, not fifteen taps.
// Close only on the cancel button. Exercise still closes.
function hqpAfterAdd() {
  var inp = document.getElementById("homeQuickInput");
  inp.value = "";
  if (hqpMode === "grocery" || hqpMode === "todo") { inp.focus(); return; }
  closeHqp();
}
document.getElementById("hqGrocery").addEventListener("click",  function(){ openHqp("grocery",  "Add to Grocery",   "life",  "e.g. Milk, Bread..."); });
document.getElementById("hqTask").addEventListener("click",     function(){ openHqp("todo",     "Add to To-do",     "life",  "e.g. Call the doctor..."); });
document.getElementById("hqExercise").addEventListener("click", function(){ openHqp("exercise", "Log an Exercise",  "train", "e.g. Bench Press..."); });
// + Medicine opens Baby -> Medicine, the full log form (Calpol/Nurofen buttons,
// weight-based dose, interval advisories), exactly like the Last medicine card.
// Home used to log a name-only entry here with none of that (v494).
document.getElementById("hqMed").addEventListener("click",      function(){ currentBabyView = "medicine"; switchSection("baby"); });
document.getElementById("hqpCancel").addEventListener("click",  closeHqp);

document.getElementById("hqpAddBtn").addEventListener("click",  doHqpAdd);
document.getElementById("homeQuickInput").addEventListener("keydown", function(e){ if (e.key === "Enter") doHqpAdd(); });

function doHqpAdd() {
  var name = document.getElementById("homeQuickInput").value.trim();
  if (!name) return;
  if (hqpMode === "grocery" || hqpMode === "todo") {
    var lt = hqpMode;
    loadListData(lt);
    var catId = (function(){
      var low = name.toLowerCase(), kw = LIST_CONFIG[lt].kw;
      for (var i = 0; i < kw.length; i++) { if (low.indexOf(kw[i][0]) !== -1) return kw[i][1]; }
      return "other";
    })();
    var items = listData[lt].items;
    for (var di = 0; di < items.length; di++) {
      if (items[di] && items[di].name.toLowerCase() === name.toLowerCase()) {
        if (!items[di].done) { toast("Already in your list!"); hqpAfterAdd(); return; }
        var _hqpMisclick = reviveWasMisclick(items[di]); // read before `updated` is re-stamped
        items[di].done = false; clearPersonChecks(items[di]); items[di].updated = Date.now(); items[di].added = Date.now(); // revived = recently added (v325)
        // v406: a quick-pick revive is a re-add, same as the new-item branch below
        if (!_hqpMisclick) addToHistFor(lt, items[di].name, items[di].catId);
        storeSet(LIST_CONFIG[lt].key, listData[lt]);
        pushPersonal(); if (isHouseholdSet() && isSynced(lt)) pushHousehold();
        toast("Moved back to list: " + name); hqpAfterAdd(); renderHomeScreen(); return;
      }
    }
    listData[lt].items.unshift({ id: Date.now(), name: name, catId: catId, done: false, addedBy:hearthUser, updated:Date.now(), added:Date.now() });
    addToHistFor(lt, name, catId);
    storeSet(LIST_CONFIG[lt].key, listData[lt]);
    pushPersonal(); if (isHouseholdSet() && isSynced(lt)) pushHousehold();
    toast("Added to " + (lt === "grocery" ? "Grocery" : "To-do") + ": " + name);
  } else if (hqpMode === "exercise") {
    doAddExercise(name);
  }
  hqpAfterAdd();
  renderHomeScreen();
}

function addToHistFor(lt, name, catId) {
  clearHistTomb(lt, name); // re-adding revives a deleted history entry (v323)
  var hist = loadListData(lt).hist, found = null;
  for (var i = 0; i < hist.length; i++) { if (!hist[i] || !hist[i].name) continue; if (hist[i].name.toLowerCase() === name.toLowerCase()) { found = hist[i]; break; } }
  if (found) { found.count=(found.count||1)+1; found.catId=catId; found.lastUsed=Date.now(); histRecordDate(found); }
  else { var e = { name:name, catId:catId, count:1, lastUsed:Date.now() }; histRecordDate(e); hist.unshift(e); }
  hist.sort(function(a,b){ return (b.count-a.count)||(b.lastUsed-a.lastUsed); });
  listData[lt].hist = capHistToLiveLimit(hist, loadListData(lt).items);
}

