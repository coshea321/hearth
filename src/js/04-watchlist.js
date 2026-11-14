// ============================================================
// WATCHLIST (v391) — TV shows and films to watch, household-shared.
// Its own store rather than a 5th list type: the four list types are
// hard-coded in 13 separate sync/backup/export sites, and a watchlist
// carries fields (kind, rating, watchedAt) none of them have. Whole-record
// newest-wins by `updated`, exactly like Plants (v377) — one title is one
// edit unit, so no nested per-field merge is needed.
// ============================================================
// v453: each kind carries its own hue (Film amber, TV teal) so the two are
// told apart by colour, not by two same-sized emoji that render differently on
// every phone. `tag` is the pill text on a row; `ico` stays on the filter chips.
var WATCH_KINDS = [
  { key:"film", label:"Film", ico:"&#x1F3AC;", tag:"FILM", color:"#B5651D", bg:"#FBEEDF" },
  { key:"tv",   label:"TV",   ico:"&#x1F4FA;", tag:"TV",   color:"#2F6E6E", bg:"#E4F0F0" }
];
function watchKindMeta(k) {
  for (var i = 0; i < WATCH_KINDS.length; i++) if (WATCH_KINDS[i].key === k) return WATCH_KINDS[i];
  return WATCH_KINDS[0];   // unknown/missing kind reads as Film rather than throwing
}

// Info links are BUILT FROM THE TITLE at render time — never stored, never
// fetched. No API key, no third-party code in the page, nothing that can go
// stale, and no network traffic at all until he actually taps one. They are
// SEARCH urls rather than deep links because resolving a title to a real id
// would need exactly the API dependency this design avoids.
// v466: `kindTerm` adds the media type to the Wikipedia search — "film" or
// "TV series" — so a title that collides with something famous stops landing on
// the wrong article ("FBI" opened the government agency).
//
// It is PLAIN WORDS plus `fulltext=1`, deliberately, and the first cut of v466
// got this wrong: it sent Wikipedia's own parenthetical page title ("Dune
// (film)") to ride the exact-title jump. That works only when such an article
// really exists — "FBI (TV series)" does — but whenever a title has more than
// one film or show of that name, which is exactly the ambiguous case this is
// for, "X (film)" is a REDIRECT TO THE DISAMBIGUATION PAGE. Cathal hit it
// immediately on Dune and Wall Street: both jumped straight to "(disambiguation)",
// a worse landing than before the change. `fulltext=1` skips the jump entirely
// and always returns a ranked results list, where a title carrying both the name
// and the media type sorts to the top and disambiguation pages are demoted.
// **Do NOT "improve" this back into a parenthetical or drop `fulltext=1`** to win
// a one-hop landing for the handful of titles where the bare "(film)" article
// exists — that trade breaks the many to speed up the few.
//
// Deliberately Wikipedia-only: JustWatch and IMDb match on the title itself, so
// a term there turns a good search into a bad one. A source with no `kindTerm`
// row for the kind gets the bare title, exactly as before.
// One definition, referenced twice on purpose (v467): the Wikipedia LINK and
// the Wikipedia SUMMARY fetch must ask the same question, or the summary can
// describe a different article than the link opens.
var WATCH_WIKI_KIND_TERM = { film:"film", tv:"TV series" };
var WATCH_INFO_SOURCES = [
  { label:"Where to watch", ico:"&#x1F37F;", base:"https://www.justwatch.com/ie/search?q=" },
  { label:"Wikipedia",      ico:"&#x1F4D6;", base:"https://en.wikipedia.org/w/index.php?fulltext=1&search=",
    kindTerm:WATCH_WIKI_KIND_TERM },
  { label:"IMDb",           ico:"&#x2B50;",  base:"https://www.imdb.com/find/?q=" }
];
function watchInfoLinks(item) {
  var title = String((item && item.title) || "").trim();
  if (!title) return [];
  // Via watchKindMeta so a missing or junk kind reads as Film, not undefined.
  var kind = watchKindMeta(item && item.kind).key;
  return WATCH_INFO_SOURCES.map(function(s){
    var term = (s.kindTerm && s.kindTerm[kind]) || "";
    return { label:s.label, ico:s.ico, href:s.base + encodeURIComponent(term ? title + " " + term : title) };
  });
}

// v467: the exact words the Wikipedia SEARCH is given — title plus the kind
// term. `watchSummaryApiUrl` asks Wikipedia's API the SAME question the
// Wikipedia link asks, so the summary and the link can never quietly disagree
// about which article an entry means. Returns "" for a title-less entry.
function watchWikiQuery(item) {
  var title = String((item && item.title) || "").trim();
  if (!title) return "";
  var term = WATCH_WIKI_KIND_TERM[watchKindMeta(item && item.kind).key] || "";
  return term ? title + " " + term : title;
}

// ── The summary (v467) ────────────────────────────────────────────────────
// An optional plot summary per entry, FETCHED ON DEMAND from Wikipedia and
// then STORED on the record. Three things make that acceptable here when the
// three info links deliberately fetch nothing:
//   · Wikipedia's API needs NO API KEY. This repo is public, so a key in
//     index.html is a published key — that is the constraint, not "no network"
//     (Sports and Weather already call keyless APIs the same way).
//   · It only runs when he taps the button. Nothing fetches on load, on sync
//     or on render, so an offline open is untouched.
//   · The text is stored, so it syncs to the other phone through the ordinary
//     whole-record merge and still reads with no signal.
// `summary` and `summarySrc` are plain strings, "" when empty and NEVER a
// dropped key — mergeWatchData refills `undefined` from the other device
// (the v296 rule), so an absent field would come back on the next sync.
var WATCH_SUMMARY_MAX = 400;   // characters kept; the API's intro can run to thousands
var _watchSumBusy = 0;         // id currently fetching, 0 = none (one at a time)

// The API is asked the SAME query as the link, via watchWikiQuery. `origin=*`
// is what makes an anonymous browser request CORS-legal and must stay literal,
// never encoded. gsrlimit=1 takes Wikipedia's own top hit rather than
// re-implementing a ranking here.
function watchSummaryApiUrl(item) {
  return "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*" +
    "&prop=extracts&exintro=1&explaintext=1&generator=search&gsrnamespace=0&gsrlimit=1" +
    "&gsrsearch=" + encodeURIComponent(watchWikiQuery(item));
}

// Collapse whitespace and cut to WATCH_SUMMARY_MAX, preferring a sentence end
// so the stored text doesn't stop mid-clause. Truncated BEFORE storing, not at
// render: this rides in every sync payload and every backup file.
function watchSummaryClean(s) {
  var t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  if (t.length <= WATCH_SUMMARY_MAX) return t;
  var cut = t.slice(0, WATCH_SUMMARY_MAX);
  var stop = cut.lastIndexOf(". ");
  if (stop > WATCH_SUMMARY_MAX / 2) return cut.slice(0, stop + 1);
  var sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut) + "\u2026";
}

// v466's lesson as a guard: Wikipedia's top hit for an ambiguous name can be
// the disambiguation page, and "Dune may refer to:" is a worse summary than
// none. Refused rather than stored, with a message that says what to do.
function watchIsDisambig(title, extract) {
  if (/\(disambiguation\)\s*$/i.test(String(title || ""))) return true;
  return /\bmay (also )?refer to\b/i.test(String(extract || ""));
}

function watchFetchSummary(id) {
  if (_watchSumBusy) return;                      // one at a time; the button reads "Fetching…"
  var all = getWatchlist();
  var i = all.findIndex(function(w){ return w && w.id === id; });
  if (i < 0) return;                              // guarded, never all[-1]
  if (!watchWikiQuery(all[i])) return;            // no title, nothing to ask
  _watchSumBusy = id;
  var asked = watchWikiQuery(all[i]);             // v480: what this fetch is about
  renderWatchlist();
  fetchWithTimeout(watchSummaryApiUrl(all[i]), null, 9000)
    .then(function(r){ return r.json(); })
    .then(function(j){
      var pages = (j && j.query && j.query.pages) || {};
      var keys  = Object.keys(pages);
      var page  = keys.length ? pages[keys[0]] : null;
      var text  = watchSummaryClean(page && page.extract);
      var src   = String((page && page.title) || "");
      _watchSumBusy = 0;
      if (!text) { renderWatchlist(); toast("&#x1F4D6; Wikipedia had nothing for that title"); return; }
      if (watchIsDisambig(src, text)) {
        renderWatchlist();
        toast("&#x1F4D6; Only found a disambiguation page &mdash; try a more exact title");
        return;
      }
      // Re-read the store: the fetch is async, and a sync or an edit may have
      // landed while it was in flight.
      var cur = getWatchlist();
      var k = cur.findIndex(function(w){ return w && w.id === id; });
      if (k < 0) { renderWatchlist(); return; }
      // v480: retitled (or re-kinded) while the fetch was out -- this text is
      // the OLD title's plot, the exact case "retitling clears the summary"
      // exists to prevent. Drop it rather than store it under the new title.
      if (watchWikiQuery(cur[k]) !== asked) { renderWatchlist(); toast("&#x1F4D6; The title changed while fetching &mdash; tap again"); return; }
      cur[k].summary    = text;
      cur[k].summarySrc = src;
      cur[k].updated    = Date.now();
      saveWatchlist(cur);
      renderWatchlist();
      toast("&#x1F4D6; Summary added");
    })
    .catch(function(){
      _watchSumBusy = 0;
      renderWatchlist();
      toast("&#x1F4D6; Couldn't reach Wikipedia");
    });
}

function watchClearSummary(id) {
  var all = getWatchlist();
  var i = all.findIndex(function(w){ return w && w.id === id; });
  if (i < 0) return;
  all[i].summary    = "";     // "", never delete — see the v296 note above
  all[i].summarySrc = "";
  all[i].updated    = Date.now();
  saveWatchlist(all);
  renderWatchlist();
}

// Top-level because a renderer calls it (the locally-scoped-helper trap).
function watchSummaryBlockHTML(w) {
  var lbl = "font-size:11px;font-weight:700;color:#8A84A0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px";
  var text = String((w && w.summary) || "").trim();
  var busy = (_watchSumBusy === w.id);
  var h = "<div style='" + lbl + "'>Summary</div>";
  if (text) {
    h += "<div style='background:#fff;border:1.5px solid #E4E0EE;border-radius:9px;padding:9px 10px;font-size:13px;" +
        "line-height:1.5;color:#3A3450;margin-bottom:5px'>" + esc(text) + "</div>" +
      "<div style='display:flex;align-items:center;gap:8px;margin-bottom:10px'>" +
        "<span style='flex:1;min-width:0;font-size:11px;color:#A8A2B8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" +
          "From Wikipedia &middot; " + esc(String((w && w.summarySrc) || "")) + "</span>" +
        "<button class='watch-sum-get' data-wid='" + esc(w.id) + "' style='flex-shrink:0;padding:5px 10px;border:1.5px solid #DCD6EA;background:#fff;color:#5A5470;border-radius:16px;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;touch-action:manipulation'>" +
          (busy ? "Fetching&hellip;" : "&#x21BB; Refresh") + "</button>" +
        "<button class='watch-sum-clear' data-wid='" + esc(w.id) + "' style='flex-shrink:0;padding:5px 10px;border:1.5px solid #DCD6EA;background:#fff;color:#8A84A0;border-radius:16px;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;touch-action:manipulation'>Clear</button>" +
      "</div>";
  } else {
    h += "<button class='watch-sum-get' data-wid='" + esc(w.id) + "' style='width:100%;padding:10px;border:1.5px solid #DCD6EA;background:#fff;color:" + WATCH_COLOR +
      ";border-radius:9px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:10px;touch-action:manipulation'>" +
      (busy ? "Fetching&hellip;" : "&#x1F4C4; Get a summary from Wikipedia") + "</button>";
  }
  return h;
}

function getWatchlist() {
  var w = storeGet("fl4_watchlist");
  if (!Array.isArray(w)) return [];
  // Guarded at the source, per the v385 getRecipeBook / v388 normaliseNotes
  // lesson: a null from a bad write or a sync merge must never reach a
  // renderer, and fixing it in one place covers every caller at once.
  return w.filter(function(x){ return x && typeof x === "object"; });
}
function saveWatchlist(w) {
  storeSet("fl4_watchlist", w);
  pushPersonal();
  if (typeof isHouseholdSet === "function" && isHouseholdSet()) pushHousehold();
}
function watchRatingOf(w) {
  var n = Math.floor(+((w && w.rating) || 0));
  return (n >= 1 && n <= 5) ? n : 0;
}

// Whole-record newest-wins by `updated`, tombstone-filtered. Returns
// {watchlist, push} — push=true means our merged copy is fuller or newer than
// what arrived, so the caller re-pushes to converge (the same contract as
// mergePlantsData / mergeTripsData).
function mergeWatchData(localW, incomingW, tombs) {
  tombs = tombs || {};
  var push = false;
  var incById = {};
  (incomingW || []).forEach(function(w){ if (w && w.id != null) incById[w.id] = w; });
  var localIds = {};
  var merged = (localW || []).filter(function(w){ return w && w.id != null; }).map(function(w){
    localIds[w.id] = true;
    var inc = incById[w.id];
    if (!inc) { push = true; return w; }                        // partner missing this → push
    var winner, loser;
    if ((inc.updated||0) > (w.updated||0)) { winner = inc; loser = w; }   // incoming newer → take it
    else {
      if ((w.updated||0) > (inc.updated||0)) push = true;       // local newer → push to converge
      winner = w; loser = inc;
    }
    // v296 lesson (the babySex incident class): a copy written by an older
    // build doesn't know about newer fields, so fill keys UNDEFINED on the
    // winner from the loser rather than letting them vanish. A field the user
    // deliberately cleared is "" or 0 (defined) and stays cleared.
    Object.keys(loser).forEach(function(k){ if (winner[k] === undefined) winner[k] = loser[k]; });
    return winner;
  });
  var fresh = (incomingW || []).filter(function(w){ return w && w.id != null && !localIds[w.id]; });
  var full = fresh.concat(merged);
  var pre = full.length;
  full = full.filter(function(w){ return !(tombs[w.id] && tombs[w.id] >= (w.updated||0)); });
  if (full.length < pre) push = true;
  return { watchlist: full, push: push };
}

// ── Watchlist mutations ───────────────────────────────────────────────────
// Three states (v392), stored as TWO BOOLEANS rather than one status string,
// deliberately: a phone still running v391 has this store and knows `watched`
// but has never heard of `watching`. It reads an unknown field harmlessly and
// mergeWatchData's v296 field-fill carries it back untouched — whereas a
// `status:"watching"` string would make every v391 phone read the whole list
// as not-watched. `watched` always wins; `watching` only means anything while
// `watched` is false, an invariant every write below preserves.
function watchStatusOf(w) {
  if (!w) return "todo";
  if (w.watched)  return "watched";
  if (w.watching) return "watching";
  return "todo";
}

function watchSetStatus(id, status) {
  if (status !== "todo" && status !== "watching" && status !== "watched") return;
  var all = getWatchlist();
  var i = all.findIndex(function(w){ return w && w.id === id; });
  if (i < 0) return;                                   // -1 guard (CLAUDE.md)
  // watchedAt is stamped on ARRIVAL at watched and otherwise left alone (v453):
  // the cycling tick makes a stray tap on a watched row move it back to
  // To watch, and before v453 that also wiped the date. Now a mis-tap and a
  // re-tap lose nothing — the same rule the rating has always had. Re-marking
  // something already watched keeps the original date too.
  if (status === "watched" && !all[i].watched) all[i].watchedAt = Date.now();
  all[i].watching  = (status === "watching");
  all[i].watched   = (status === "watched");
  // An existing rating is deliberately KEPT when moving back out of watched:
  // a mis-tap must not silently destroy something he typed, and returning to
  // watched brings it back.
  all[i].updated = Date.now();
  saveWatchlist(all);
  renderWatchlist();
}

// The tick control cycles in the order things actually happen:
// not started → watching → finished → back to not started.
var WATCH_CYCLE = { todo:"watching", watching:"watched", watched:"todo" };
function watchCycleStatus(id) {
  var all = getWatchlist();
  var i = all.findIndex(function(w){ return w && w.id === id; });
  if (i < 0) return;
  watchSetStatus(id, WATCH_CYCLE[watchStatusOf(all[i])]);
}

// Season is optional, TV-only, and capped at a sane range so a typo can't
// render "Season 99999". 0 means "not set" and shows nothing at all.
function watchSeasonOf(w) {
  var n = Math.floor(+((w && w.season) || 0));
  return (n >= 1 && n <= 99) ? n : 0;
}

function watchSetRating(id, n) {
  var all = getWatchlist();
  var i = all.findIndex(function(w){ return w && w.id === id; });
  if (i < 0) return;
  n = Math.floor(+n || 0);
  if (n < 1 || n > 5) return;
  // Tapping the star already rated clears it — the only route back to
  // "unrated" without adding a separate control.
  all[i].rating  = (watchRatingOf(all[i]) === n) ? 0 : n;
  all[i].updated = Date.now();
  saveWatchlist(all);
  renderWatchlist();
}

// Split like deletePlant/its call site: watchDelete does the work, the UI
// wraps it in the confirm. Keeps the destructive step directly testable.
function watchDelete(id) {
  var all = getWatchlist();
  var i = all.findIndex(function(w){ return w && w.id === id; });
  if (i < 0) return;                                   // gone via sync meanwhile
  all.splice(i, 1);
  addTomb("watchlist", id);
  saveWatchlist(all);
  _watchView = "list"; _watchEditId = null; _watchOpenId = null;
  renderWatchlist();
  toast("Removed from the watchlist");
}
function deleteWatchItem(id) {
  var all = getWatchlist();
  var i = all.findIndex(function(w){ return w && w.id === id; });
  if (i < 0) return;
  var title = String(all[i].title || "this");
  confirmDialog("Remove &ldquo;" + esc(title) + "&rdquo; from the watchlist?", function(){ watchDelete(id); });
}

// ── Watchlist UI ──────────────────────────────────────────────────────────
var WATCH_COLOR = "#4A3F7A";
var _watchView    = "list";   // "list" | "editor"
var _watchEditId  = null;     // id being edited; null in the editor = a new entry
var _watchOpenId  = null;     // inline-expanded row
var _watchFilter  = "all";    // "all" | "film" | "tv" — session only, never stored
// Unlike the kind filter above, this one IS persisted (device-local key,
// never synced or exported — same "hearth_" namespace as the auth fields,
// so a test-build wipe leaves it alone too): Cathal asked for the
// last-picked status to be the default next time the section opens.
// v492: no status filter any more — the list is already grouped Watching / To watch / Watched.
// (Older builds saved hearth_watchStatusFilter; nothing reads it now, so a stale value is harmless.)
var _watchEditing = false;    // sync-render guard, same role as _plantEditing
var _watchCancelFn = null;    // back-button discard closure (v345 pattern)
var _watchDoneOpen = false;   // the Watched group starts collapsed
// Icon, colour, and what a tap on the tick control does next, per status.
// v453: `stripe`/`bg` colour the card itself (left edge + tint) so state reads
// at a glance, not only from the 19px tick glyph. To watch is the bulk of the
// list, so it stays plain white with no stripe. `chip` is the selected-chip
// colour on the status filter row — To watch gets a dark grey there, not
// its faint tick colour, so a selected chip is never near-invisible.
var WATCH_STATUS_UI = {
  todo:     { ico:"&#x25CB;", color:"#9A92B8", stripe:"",        bg:"#fff",    chip:"#6A6480", next:"Mark as watching" },
  watching: { ico:"&#x25B6;", color:"#4A3F7A", stripe:"#4A3F7A", bg:"#F4F1FA", chip:"#4A3F7A", next:"Mark as watched" },
  watched:  { ico:"&#x2714;", color:"#3E8E5A", stripe:"#3E8E5A", bg:"#F5F4F7", chip:"#3E8E5A", next:"Move back to the to-watch list" }
};
var WATCH_STATUS_LABELS = [
  { key:"todo",     label:"To watch" },
  { key:"watching", label:"Watching" },
  { key:"watched",  label:"Watched"  }
];
var _watchKindDraft = "film";

// "14 Aug", or "14 Aug 2025" when it wasn't this year. Day-level only — the
// time of night a film finished is noise. Returns "" for 0/junk.
var WATCH_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// v498: the one date format for list and history rows (28/09 review ④):
// "28 Sep" this year, "28 Sep 2025" otherwise. Takes a stored "YYYY-MM-DD"
// (read as that local calendar day — never new Date(iso), which is UTC and
// can land on the day before), a timestamp or a Date; "" if unreadable.
// Display only: stored dates and data-* attributes stay ISO. Fixed month
// names on purpose — en-IE's toLocaleDateString gives "Sept" on some phones.
// Day headings ("Monday 14 September") and trip ranges are NOT meant to use it.
function listDate(v) {
  var d;
  if (typeof v === "string") {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
    if (!m) return "";
    d = new Date(+m[1], +m[2] - 1, +m[3]);
    // An impossible day ("2026-02-30") would roll over to a real one (2 Mar);
    // refuse it so the caller shows the stored value for correction instead.
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return "";
  } else {
    var n = (v instanceof Date) ? v.getTime() : +v;
    if (!(n > 0)) return "";
    d = new Date(n);
  }
  if (isNaN(d.getTime())) return "";
  var out = d.getDate() + " " + ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  if (d.getFullYear() !== new Date().getFullYear()) out += " " + d.getFullYear();
  return out;
}
function watchDateText(ts) { return listDate(+ts || 0); }

function watchStarsHTML(n, interactive, id) {
  var out = "";
  for (var s = 1; s <= 5; s++) {
    var on = s <= n;
    if (interactive) {
      out += "<button class='watch-star' data-wid='" + esc(id) + "' data-star='" + esc(s) + "' " +
        "aria-label='Rate " + s + " star" + (s === 1 ? "" : "s") + "' " +
        "style='border:none;background:none;padding:2px 3px;font-size:20px;line-height:1;cursor:pointer;touch-action:manipulation;color:" +
        (on ? "#E0A020" : "#CFC8DE") + "'>" + (on ? "&#x2605;" : "&#x2606;") + "</button>";
    } else {
      out += "<span style='font-size:12px;color:" + (on ? "#E0A020" : "#CFC8DE") + "'>" +
        (on ? "&#x2605;" : "&#x2606;") + "</span>";
    }
  }
  return out;
}

function watchRowHTML(w) {
  var meta = watchKindMeta(w.kind);
  var open = _watchOpenId === w.id;
  var rating = watchRatingOf(w);
  var note = String(w.note || "").trim();
  var status = watchStatusOf(w);
  var sUI = WATCH_STATUS_UI[status];
  // Season is TV-only on screen. A value left behind by switching a show to a
  // film stays in the record (never destroy something he typed) but stays hidden.
  var seasonN = (meta.key === "tv") ? watchSeasonOf(w) : 0;
  var h = "<div style='background:" + sUI.bg + ";border:1.5px solid #E4E0EE;" +
      (sUI.stripe ? "border-left:4px solid " + sUI.stripe + ";" : "") +
      "border-radius:12px;margin-bottom:8px;overflow:hidden'>" +
    "<div style='display:flex;align-items:center;gap:2px;padding:2px'>" +
      "<button class='watch-tick' data-wid='" + esc(w.id) + "' aria-label='" + sUI.next + "' " +
        "style='flex-shrink:0;width:44px;height:46px;border:none;background:none;cursor:pointer;font-size:20px;line-height:1;touch-action:manipulation;color:" +
        sUI.color + "'>" + sUI.ico + "</button>" +
      "<div class='watch-body' data-wid='" + esc(w.id) + "' style='flex:1;min-width:0;padding:8px 8px 8px 0;cursor:pointer'>" +
        "<div style='font-size:15px;font-weight:600;color:#2A2010;line-height:1.3;" +
          (status === "watched" ? "opacity:.6" : "") + "'>" +
          "<span style='display:inline-block;vertical-align:1px;margin-right:7px;background:" + meta.bg + ";color:" + meta.color +
          ";border-radius:4px;padding:1px 5px;font-size:11px;font-weight:800;letter-spacing:.5px'>" + meta.tag + "</span>" +
          esc(w.title || "Untitled") + "</div>";
  if (seasonN) {
    h += "<div style='margin-top:4px'><span style='display:inline-block;background:#EFECF6;color:" + WATCH_COLOR +
      ";border-radius:5px;padding:2px 7px;font-size:11px;font-weight:700'>Season " + seasonN + "</span></div>";
  }
  if (note) {
    h += "<div style='font-size:12px;color:#6A6480;margin-top:2px;" +
      (open ? "" : "white-space:nowrap;overflow:hidden;text-overflow:ellipsis") + "'>" + esc(note) + "</div>";
  }
  if (status === "watched") {
    var when = watchDateText(w.watchedAt);
    if (rating || when) {
      h += "<div style='margin-top:3px;display:flex;align-items:center;gap:8px'>" +
        (rating ? "<span>" + watchStarsHTML(rating, false, w.id) + "</span>" : "") +
        (when ? "<span style='font-size:11px;color:#8A84A0'>Watched " + when + "</span>" : "") +
        "</div>";
    }
  }
  h += "</div>" +
      "<span style='flex-shrink:0;padding:0 10px 0 2px;color:#BEB6D0;font-size:12px'>" + (open ? "&#x25B2;" : "&#x25BC;") + "</span>" +
    "</div>";

  if (open) {
    h += "<div style='border-top:1px solid #EFECF6;padding:10px 12px 12px;background:#FAF9FD'>";
    // An explicit three-way status picker as well as the cycling tick control:
    // the cycle is one tap once you know it, this is the one that needs no
    // explaining and can jump straight to any state.
    h += "<div style='font-size:11px;font-weight:700;color:#8A84A0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px'>Status</div>" +
      "<div style='display:flex;gap:6px;margin-bottom:10px'>";
    WATCH_STATUS_LABELS.forEach(function(s){
      var on = status === s.key;
      h += "<button class='watch-status-btn' data-wid='" + esc(w.id) + "' data-status='" + esc(s.key) + "' " +
        "style='flex:1;padding:9px 4px;border-radius:8px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;touch-action:manipulation;" +
        (on ? "background:" + WATCH_COLOR + ";color:#fff;border:1.5px solid " + WATCH_COLOR
            : "background:#fff;color:#5A5470;border:1.5px solid #DCD6EA") + "'>" + s.label + "</button>";
    });
    h += "</div>";
    // Summary (v467) — above the links because it is the thing he came to read;
    // the links are what you tap when the summary isn't enough.
    h += watchSummaryBlockHTML(w);
    // Info links: always available, built from the title, nothing stored.
    var links = watchInfoLinks(w);
    if (links.length) {
      h += "<div style='font-size:11px;font-weight:700;color:#8A84A0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px'>Look it up</div>" +
        "<div style='display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px'>";
      links.forEach(function(l){
        h += "<a href='" + esc(l.href) + "' target='_blank' rel='noopener' " +
          "style='display:inline-flex;align-items:center;gap:5px;background:#fff;border:1.5px solid #DCD6EA;color:" + WATCH_COLOR +
          ";border-radius:20px;padding:7px 12px;font-size:12px;font-weight:700;text-decoration:none;touch-action:manipulation'>" +
          l.ico + " " + esc(l.label) + "</a>";
      });
      h += "</div>";
    }
    var wLink = applianceLinkUrl(w.link, true);
    if (wLink) {
      h += "<a href='" + esc(wLink) + "' target='_blank' rel='noopener' " +
        "style='display:inline-flex;align-items:center;gap:5px;background:" + WATCH_COLOR + ";color:#fff;border-radius:20px;" +
        "padding:7px 12px;font-size:12px;font-weight:700;text-decoration:none;margin-bottom:10px;touch-action:manipulation'>&#x1F517; Your link</a>";
    }
    if (status === "watched") {
      h += "<div style='font-size:11px;font-weight:700;color:#8A84A0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px'>What did you think?</div>" +
        "<div style='margin-bottom:10px;margin-left:-3px'>" + watchStarsHTML(watchRatingOf(w), true, w.id) + "</div>";
    }
    h += "<div style='display:flex;gap:8px'>" +
      "<button class='watch-edit' data-wid='" + esc(w.id) + "' style='flex:1;padding:10px;border:1.5px solid #DCD6EA;background:#fff;color:#5A5470;border-radius:9px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation'>Edit</button>" +
      "<button class='watch-del' data-wid='" + esc(w.id) + "' style='flex:1;padding:10px;border:1.5px solid #F0D0D0;background:#fff;color:#B03030;border-radius:9px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation'>Remove</button>" +
      "</div></div>";
  }
  return h + "</div>";
}

function renderWatchlist() {
  _watchEditing = false;
  _watchCancelFn = null;
  if (_watchView === "editor") { renderWatchEditor(); return; }
  _watchView = "list";
  var el = document.getElementById("watchContent");
  if (!el) return;

  var all = getWatchlist();
  if (!all.length) {
    el.innerHTML = "<div style='text-align:center;color:#8A84A0;padding:40px 20px'>" +
      "<div style='font-size:40px;margin-bottom:10px'>&#x1F37F;</div>" +
      "<div style='font-size:16px;font-weight:600;margin-bottom:4px;color:#2A2010'>Nothing on the list yet</div>" +
      "<div style='font-size:13px'>Tap + to note down a film or a show you want to watch.</div></div>";
    return;
  }

  // Kind chips only earn their row when there's actually a choice to make —
  // an all-films list tells you nothing you can't already see (v379 pattern).
  var hasFilm = all.some(function(w){ return watchKindMeta(w.kind).key === "film"; });
  var hasTv   = all.some(function(w){ return watchKindMeta(w.kind).key === "tv"; });
  var showChips = hasFilm && hasTv;
  if (!showChips) _watchFilter = "all";
  // The chosen kind can vanish (last one retagged, removed, or dropped by a
  // sync from the other phone) — fall back to All rather than showing an
  // empty list with no explanation.
  if (_watchFilter === "film" && !hasFilm) _watchFilter = "all";
  if (_watchFilter === "tv"   && !hasTv)   _watchFilter = "all";

  var shownByKind = all.filter(function(w){
    return _watchFilter === "all" || watchKindMeta(w.kind).key === _watchFilter;
  });
  var shown = shownByKind;
  // Watching first — "what are we in the middle of" is the question this
  // screen gets asked most. Most recently touched first within that group.
  var watchingNow = shown.filter(function(w){ return watchStatusOf(w) === "watching"; })
    .sort(function(a, b){ return (b.updated || 0) - (a.updated || 0); });
  var toWatch = shown.filter(function(w){ return watchStatusOf(w) === "todo"; })
    .sort(function(a, b){ return (b.added || b.id || 0) - (a.added || a.id || 0); });
  var watched = shown.filter(function(w){ return watchStatusOf(w) === "watched"; })
    .sort(function(a, b){ return (b.watchedAt || 0) - (a.watchedAt || 0); });

  var html = "";
  if (showChips) {
    html += "<div style='display:flex;gap:7px;padding:1px 1px 10px'>";
    // A selected chip takes the colour of what it selects (v453), so the kind
    // row and the status row below stop looking like the same control twice.
    [{ v:"all", t:"All", c:WATCH_COLOR }, { v:"film", t:"&#x1F3AC; Films", c:watchKindMeta("film").color }, { v:"tv", t:"&#x1F4FA; TV", c:watchKindMeta("tv").color }].forEach(function(c){
      var on = _watchFilter === c.v;
      html += "<button class='watch-kind-chip' data-kind='" + esc(c.v) + "' " +
        "style='flex:1;border-radius:20px;padding:8px 6px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;touch-action:manipulation;" +
        (on ? "background:" + c.c + ";color:#fff;border:1.5px solid " + c.c
            : "background:#fff;color:#5A5470;border:1.5px solid #DCD6EA") + "'>" + c.t + "</button>";
    });
    html += "</div>";
  }
  if (!watchingNow.length && !toWatch.length && !watched.length) {
    var _watchEmptyParts = [];
    if (_watchFilter !== "all") _watchEmptyParts.push(_watchFilter === "tv" ? "TV" : "films");
    html += "<div style='text-align:center;color:#8A84A0;padding:30px 20px;font-size:13px'>" +
      (_watchEmptyParts.length ? "Nothing matches " + esc(_watchEmptyParts.join(" · ")) + "." : "Nothing matches the current filters.") +
      "<br><span style='display:inline-block;margin-top:5px'>Choose another chip above.</span></div>";
  }
  if (watchingNow.length) {
    html += "<div style='font-size:11px;font-weight:700;color:" + WATCH_COLOR + ";text-transform:uppercase;letter-spacing:.5px;margin:2px 2px 7px'>&#x25B6; Watching &middot; " + watchingNow.length + "</div>";
    watchingNow.forEach(function(w){ html += watchRowHTML(w); });
  }
  if (toWatch.length) {
    html += "<div style='font-size:11px;font-weight:700;color:#8A84A0;text-transform:uppercase;letter-spacing:.5px;margin:2px 2px 7px;color:" + WATCH_STATUS_UI.todo.chip + "'>To watch &middot; " + toWatch.length + "</div>";
    toWatch.forEach(function(w){ html += watchRowHTML(w); });
  }
  if (watched.length) {
    html += "<button id='watchDoneHdr' style='width:100%;text-align:left;border:none;background:none;padding:10px 2px 7px;font-family:inherit;font-size:11px;font-weight:700;color:" + WATCH_STATUS_UI.watched.chip + ";text-transform:uppercase;letter-spacing:.5px;cursor:pointer;touch-action:manipulation'>" +
      (_watchDoneOpen ? "&#x25B2;" : "&#x25BC;") + " Watched &middot; " + watched.length + "</button>";
    if (_watchDoneOpen) watched.forEach(function(w){ html += watchRowHTML(w); });
  }
  el.innerHTML = html;

  el.querySelectorAll(".watch-tick").forEach(function(b){
    b.addEventListener("click", function(){ watchCycleStatus(+b.dataset.wid); });
  });
  el.querySelectorAll(".watch-status-btn").forEach(function(b){
    b.addEventListener("click", function(){ watchSetStatus(+b.dataset.wid, b.dataset.status); });
  });
  el.querySelectorAll(".watch-body").forEach(function(b){
    b.addEventListener("click", function(){
      var id = +b.dataset.wid;
      _watchOpenId = (_watchOpenId === id) ? null : id;
      renderWatchlist();
    });
  });
  el.querySelectorAll(".watch-star").forEach(function(b){
    b.addEventListener("click", function(){ watchSetRating(+b.dataset.wid, +b.dataset.star); });
  });
  el.querySelectorAll(".watch-sum-get").forEach(function(b){
    b.addEventListener("click", function(){ watchFetchSummary(+b.dataset.wid); });
  });
  el.querySelectorAll(".watch-sum-clear").forEach(function(b){
    b.addEventListener("click", function(){ watchClearSummary(+b.dataset.wid); });
  });
  el.querySelectorAll(".watch-edit").forEach(function(b){
    b.addEventListener("click", function(){ openWatchEditor(+b.dataset.wid); });
  });
  el.querySelectorAll(".watch-del").forEach(function(b){
    b.addEventListener("click", function(){ deleteWatchItem(+b.dataset.wid); });
  });
  el.querySelectorAll(".watch-kind-chip").forEach(function(b){
    b.addEventListener("click", function(){ _watchFilter = b.dataset.kind || "all"; renderWatchlist(); });
  });
  var dh = document.getElementById("watchDoneHdr");
  if (dh) dh.addEventListener("click", function(){ _watchDoneOpen = !_watchDoneOpen; renderWatchlist(); });
}

// Picks uniformly from everything not marked watched (todo + watching both
// count — "watching" just means already started, not decided against).
// v453: the KIND chip is respected — "pick a film" is the actual Friday-night
// ask, so with Films selected the pick comes from films. The pick is
// still the one row visible on screen (it is inside the selected kind by construction).
function watchRandomPick() {
  var candidates = getWatchlist().filter(function(w){
    return watchStatusOf(w) !== "watched" && (_watchFilter === "all" || watchKindMeta(w.kind).key === _watchFilter);
  });
  if (!candidates.length) { toast("Nothing left to pick &mdash; everything's watched!"); return; }
  var pick = candidates[Math.floor(Math.random() * candidates.length)];
  _watchView = "list";
  _watchOpenId = pick.id;
  renderWatchlist();
  var row = document.querySelector(".watch-body[data-wid='" + pick.id + "']");
  if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
  toast("&#x1F3B2; Tonight's " + (watchKindMeta(pick.kind).key === "tv" ? "show" : "film") + ": " + esc(pick.title || "Untitled"));
}

function openWatchEditor(id) {
  _watchEditId = (id == null) ? null : id;
  _watchView = "editor";
  renderWatchlist();
  window.scrollTo(0, 0);
}

function renderWatchEditor() {
  var el = document.getElementById("watchContent");
  if (!el) return;
  var rec = null;
  if (_watchEditId != null) {
    var all = getWatchlist();
    var i = all.findIndex(function(w){ return w && w.id === _watchEditId; });
    // Removed on the other phone while this editor was open — fall back to the
    // list rather than silently saving a resurrected copy.
    if (i < 0) { _watchView = "list"; _watchEditId = null; renderWatchlist(); return; }
    rec = all[i];
  }
  _watchEditing = true;
  _watchKindDraft = rec ? watchKindMeta(rec.kind).key : "film";

  function leave() {
    _watchEditing = false; _watchCancelFn = null;
    _watchView = "list"; _watchEditId = null;
    renderWatchlist(); window.scrollTo(0, 0);
  }
  _watchCancelFn = leave;

  var lbl = "font-size:11px;font-weight:700;color:#8A84A0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px";
  var inp = "width:100%;box-sizing:border-box;padding:11px;border:1.5px solid #DCD6EA;border-radius:9px;font-family:inherit;font-size:15px;background:#fff;color:#2A2010";
  el.innerHTML =
    "<div style='" + lbl + "'>Title</div>" +
    "<input id='wEdTitle' type='text' autocapitalize='words' enterkeyhint='done' placeholder='e.g. The Banshees of Inisherin' style='" + inp + "' value='" + esc((rec && rec.title) || "") + "'>" +
    "<div style='" + lbl + ";margin-top:14px'>Type</div>" +
    "<div style='display:flex;gap:8px'>" +
      WATCH_KINDS.map(function(k){
        var on = _watchKindDraft === k.key;
        return "<button class='watch-kind-pick' data-kind='" + esc(k.key) + "' style='flex:1;padding:11px;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation;" +
          (on ? "background:" + WATCH_COLOR + ";color:#fff;border:1.5px solid " + WATCH_COLOR
              : "background:#fff;color:#5A5470;border:1.5px solid #DCD6EA") + "'>" + k.ico + " " + k.label + "</button>";
      }).join("") +
    "</div>" +
    // TV only — a film has no season. Hidden rather than removed so switching
    // a show to a film and back doesn't lose the number he already typed.
    "<div id='wEdSeasonRow' style='display:" + (_watchKindDraft === "tv" ? "block" : "none") + "'>" +
      "<div style='" + lbl + ";margin-top:14px'>Season you&rsquo;re on <span style='text-transform:none;font-weight:600;color:#A8A2B8'>(optional)</span></div>" +
      "<input id='wEdSeason' type='number' min='1' max='99' inputmode='numeric' placeholder='e.g. 2' style='" + inp + "' value='" +
        esc(watchSeasonOf(rec) || "") + "'>" +
    "</div>" +
    "<div style='" + lbl + ";margin-top:14px'>Note <span style='text-transform:none;font-weight:600;color:#A8A2B8'>(optional)</span></div>" +
    "<textarea id='wEdNote' rows='2' placeholder='Where it is, who picked it&hellip;' style='" + inp + ";resize:vertical'>" + esc((rec && rec.note) || "") + "</textarea>" +
    "<div style='" + lbl + ";margin-top:14px'>Your own link <span style='text-transform:none;font-weight:600;color:#A8A2B8'>(optional)</span></div>" +
    "<input id='wEdLink' type='url' inputmode='url' placeholder='https://&hellip;' style='" + inp + "' value='" + esc((rec && rec.link) || "") + "'>" +
    "<div style='font-size:11px;color:#A8A2B8;margin-top:5px;line-height:1.5'>Only if you want a specific page. Every entry already gets Where&nbsp;to&nbsp;watch, Wikipedia and IMDb search links built from its title.</div>" +
    "<div style='display:flex;gap:8px;margin-top:18px'>" +
      "<button id='wEdCancel' style='flex:1;padding:13px;border:1.5px solid #DCD6EA;background:#fff;color:#5A5470;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation'>Cancel</button>" +
      "<button id='wEdSave' style='flex:2;padding:13px;border:none;background:" + WATCH_COLOR + ";color:#fff;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>Save</button>" +
    "</div>";

  el.querySelectorAll(".watch-kind-pick").forEach(function(b){
    b.addEventListener("click", function(){
      _watchKindDraft = b.dataset.kind === "tv" ? "tv" : "film";
      // Re-render the picker only — re-rendering the whole editor would throw
      // away whatever he has already typed into the fields above.
      el.querySelectorAll(".watch-kind-pick").forEach(function(x){
        var on = x.dataset.kind === _watchKindDraft;
        x.style.background = on ? WATCH_COLOR : "#fff";
        x.style.color      = on ? "#fff" : "#5A5470";
        x.style.border     = "1.5px solid " + (on ? WATCH_COLOR : "#DCD6EA");
      });
      var sr = document.getElementById("wEdSeasonRow");
      if (sr) sr.style.display = (_watchKindDraft === "tv") ? "block" : "none";
    });
  });
  document.getElementById("wEdCancel").addEventListener("click", leave);
  document.getElementById("wEdSave").addEventListener("click", function(){
    var title = document.getElementById("wEdTitle").value.trim();
    if (!title) { toast("Give it a title first"); return; }
    var linkVal = document.getElementById("wEdLink").value.trim();
    // Same normalisation as the list item sheet: add https:// to a bare domain,
    // and refuse anything that isn't a web/mail/phone address.
    if (linkVal && !/^https?:\/\//i.test(linkVal) && !/^[a-z]+:/i.test(linkVal)) linkVal = "https://" + linkVal;
    if (linkVal && !/^(https?|mailto|tel):/i.test(linkVal)) { toast("Link must be a http(s), mailto or tel address"); return; }
    var note = document.getElementById("wEdNote").value.trim();
    var seasonRaw = document.getElementById("wEdSeason").value.trim();
    var seasonVal = "";
    if (seasonRaw !== "") {
      var sn = Math.floor(+seasonRaw);
      if (!isFinite(sn) || sn < 1 || sn > 99) { toast("Season should be a number from 1 to 99"); return; }
      seasonVal = sn;
    }
    var cur = getWatchlist();
    if (_watchEditId != null) {
      var j = cur.findIndex(function(w){ return w && w.id === _watchEditId; });
      if (j < 0) { toast("That entry is no longer here"); leave(); return; }
      // v467: the stored summary belongs to the OLD title. Retitling makes it
      // someone else's plot, so it is cleared rather than left to describe the
      // wrong film — re-fetching is one tap, a wrong summary is invisible.
      if (String(cur[j].title || "") !== title) { cur[j].summary = ""; cur[j].summarySrc = ""; }
      cur[j].title  = title;
      cur[j].kind   = _watchKindDraft;
      cur[j].note   = note;
      cur[j].link   = linkVal;
      cur[j].season = seasonVal;
      cur[j].updated = Date.now();
    } else {
      cur.unshift({
        id: Date.now() + Math.floor(Math.random() * 1000),
        title: title, kind: _watchKindDraft, note: note, link: linkVal, season: seasonVal,
        summary: "", summarySrc: "",
        watching: false, watched: false, watchedAt: 0, rating: 0,
        addedBy: hearthUser, added: Date.now(), updated: Date.now()
      });
    }
    saveWatchlist(cur);
    _watchEditing = false; _watchCancelFn = null;
    _watchView = "list"; _watchEditId = null;
    renderWatchlist(); window.scrollTo(0, 0);
    toast(_watchEditId == null ? "Saved" : "Saved");
  });
  var t = document.getElementById("wEdTitle");
  // Enter in the title saves (v453) — the same shortcut the list add box has.
  if (t) t.addEventListener("keydown", function(e){
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("wEdSave").click(); }
  });
  if (t && !rec) t.focus();
}

