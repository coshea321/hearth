// ── Service worker + boot splash (v312; non-blocking since v373) ─────
// The #bootSplash overlay covers the app only while this script parses
// and the boot renderers run — the moment execution reaches here, local
// content is ready and the splash hides. The version check runs ENTIRELY
// in the background: when a newer build is installed/activated, the
// tap-to-refresh banner appears. There is NO automatic reload at startup
// any more (v312's bootStaleReload is gone — a stalled boot reload was
// the one remaining way to freeze startup, the v356 residual). Trade-off
// accepted by Cathal 31/07/2026: on a bad connection the app may briefly
// run the previous cached build, with the banner offering the newer one.
var PAGE_VERSION = (function(){
  var el = document.getElementById("appVersionLabel");
  return el ? el.textContent.trim() : "";
})();
function _verNum(v) {
  // "vNNN · DD/MM/YYYY" → NNN as a number (0 when unparseable)
  var m = /^v(\d+)/.exec(String(v || ""));
  return m ? parseInt(m[1], 10) : 0;
}
// Seeded from the failsafe in case its ceiling somehow fired first.
var _bootSplashGone = !!window.__hearthSplashGone;

function hideBootSplash() {
  if (_bootSplashGone) return;
  _bootSplashGone = true;
  if (window.__hearthSplashHide) { window.__hearthSplashHide(); return; }
  var s = document.getElementById("bootSplash");
  if (!s) return;
  s.style.opacity = "0";
  setTimeout(function(){ s.style.display = "none"; }, 200);
}

// Called by the failsafe when IT hides the splash, so the gate's own state
// matches what is on screen (v356).
window.__hearthSplashGoneHook = function() {
  _bootSplashGone = true;
};

// Tells the failsafe the script reached its hide logic, so a later error
// can't be mistaken for "nothing will ever hide the splash" (v356).
window.__hearthBootGateArmed = true;
hideBootSplash();

function showUpdateBanner(version) {
  var banner = document.getElementById("updateBanner");
  if (banner) banner.style.display = "flex";
  autoUpdateArm(version);
}

// ── Always-on screens take updates by themselves (v524) ───────────────
// A page that is never reloaded (the kitchen kiosk phone running Fully Kiosk
// Browser) only checked for a new build when it was opened, so it stayed on
// the version it first loaded indefinitely. Now:
//  1. the worker is asked to check for a new build every hour, and whenever
//     the screen comes back on (visibilitychange → visible);
//  2. once a strictly newer build is ACTIVE (the banner case), the page
//     reloads itself — but only when nobody could lose anything:
//     on Home, no overlay/dialog open, nothing focused for typing, and no
//     touch/key for 5 minutes. Otherwise the banner just waits and this
//     re-checks every minute.
// This is NOT the old boot-time reload (v312 bootStaleReload, removed at
// v356 because a stalled reload could freeze startup): it never runs during
// boot, only after an idle wait on a fully loaded page, and at most once per
// target version per tab (sessionStorage guard), so it cannot loop. The new
// worker has already activated and pre-cached the new shell before
// SW_UPDATED arrives, so one reload is enough.
var AUTO_UPDATE_IDLE_MS = 5 * 60 * 1000;
var AUTO_UPDATE_CHECK_MS = 60 * 60 * 1000;
var _lastUserInput = Date.now();
var _autoUpdateTimer = null;
var _autoUpdateTarget = "";
["pointerdown", "keydown", "input", "touchstart", "wheel"].forEach(function(t){
  document.addEventListener(t, function(){ _lastUserInput = Date.now(); }, { capture: true, passive: true });
});

// Pure decision, separated for the tests. Returns "" when safe, else why not.
function autoUpdateBlocker(now) {
  if (typeof currentSection !== "undefined" && currentSection !== "home") return "not on Home";
  if (now - _lastUserInput < AUTO_UPDATE_IDLE_MS) return "recent input";
  return uiBusyReason();
}

// v528: the "could anyone lose something?" half of autoUpdateBlocker, shared
// with the wall screen's return-after-idle (wallIdleBlocker, 20b-wall.js).
function uiBusyReason() {
  var a = document.activeElement;
  if (a && a !== document.body && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return "field focused";
  if (document.querySelector(".overlay.open, #toothModal.open, [aria-modal='true']")) return "dialog open";
  var so = document.getElementById("sessionOverlay");
  if (so && getComputedStyle(so).display !== "none") return "session open";
  // Home's quick-add panel is an inline panel, not an overlay (Codex on #297).
  var hqp = document.getElementById("homeQuickPanel");
  if (hqp && getComputedStyle(hqp).display !== "none") return "quick-add open";
  // Belt and braces for any other inline editor: never reload over a visible
  // text box that still holds something typed.
  var boxes = document.querySelectorAll("input[type='text'], input[type='search'], input:not([type]), textarea");
  for (var i = 0; i < boxes.length; i++) {
    if (boxes[i].value && boxes[i].offsetParent !== null) return "unsaved text";
  }
  return "";
}

function autoUpdateArm(version) {
  if (_isPreview || _isTestBuild) return;
  _autoUpdateTarget = String(version || _swReportedVersion || "");
  if (!_autoUpdateTimer) _autoUpdateTimer = setInterval(autoUpdateTick, 60 * 1000);
}

function autoUpdateTick() {
  if (autoUpdateBlocker(Date.now())) return;
  var key = "hearthAutoReloadedFor";
  try {
    if (sessionStorage.getItem(key) === _autoUpdateTarget) return; // already tried once for this build
    sessionStorage.setItem(key, _autoUpdateTarget);
  } catch (e) { return; } // no sessionStorage = no loop guard = no auto reload
  clearInterval(_autoUpdateTimer);
  _autoUpdateTimer = null;
  location.reload();
}

// ── Stuck-worker visibility + escape hatch (v426) ─────────────────────
// The WORKER and the PAGE can be on different versions: the worker updates on
// its own schedule, and a worker whose install failed never updates at all.
// The label deliberately shows the WORKER's version when it is same-or-older
// (v382's "sw.js is the single source of truth" — pinned by
// tests/sw-cases/02-sw-update-banner.js, do NOT change it here), which means a
// page genuinely running vNEW can display a stuck worker's vOLD. That is what
// it looked like on the Cloudflare install (page v425, label v421).
// So rather than change the label, SAY SO: swVersionsAgree() drives an
// explicit line under the Force app update button naming both versions.
var _swReportedVersion = "";
function swVersionsAgree(swVersion) {
  return _verNum(swVersion) === _verNum(PAGE_VERSION);
}

// Clears this device's cached copy of the app: every service-worker
// registration and every cache. Deliberately does NOT touch localStorage —
// data, login and household code all survive, so this is safe to offer as a
// button. Returns a promise that always resolves (never rejects): a failure
// to clear must still let the caller reload.
function clearAppInstall() {
  var jobs = [];
  try {
    if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistrations) {
      jobs.push(navigator.serviceWorker.getRegistrations()
        .then(function(regs){ return Promise.all(regs.map(function(r){ return r.unregister(); })); })
        .catch(function(){}));
    }
  } catch (e) {}
  try {
    if (window.caches && caches.keys) {
      jobs.push(caches.keys()
        .then(function(keys){ return Promise.all(keys.map(function(k){ return caches.delete(k); })); })
        .catch(function(){}));
    }
  } catch (e) {}
  return Promise.all(jobs).then(function(){ return true; }, function(){ return true; });
}

function renderSwVersionInfo() {
  var el = document.getElementById("swVersionInfo");
  if (!el) return;
  if (!("serviceWorker" in navigator) || _isPreview || _isTestBuild) { el.textContent = ""; return; }
  if (_swReportedVersion && !swVersionsAgree(_swReportedVersion)) {
    el.textContent = "Running " + PAGE_VERSION + " · installer stuck on " + _swReportedVersion;
  } else {
    el.textContent = "Running " + PAGE_VERSION;
  }
}

function forceAppUpdate() {
  confirmDialog(
    "Force an app update? This clears this device's saved copy of Hearth and reloads it fresh. Your data, login and household code are NOT touched.",
    function() {
      var reloaded = false;
      function go() { if (reloaded) return; reloaded = true; location.reload(); }
      clearAppInstall().then(go);
      setTimeout(go, 4000);   // never leave him staring at a button that did nothing
    }
  );
}

if ("serviceWorker" in navigator && !_isPreview && !_isTestBuild) {
  renderSwVersionInfo();   // paint "Running vNNN" before any worker reports in
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then(function(reg) {
    // .catch (v517): the check rejects with no signal, or when the worker is removed mid-check
    // (Clear & reinstall). Nothing to do about either; the next open checks again.
    reg.update().catch(function(){}); // background check; a new build announces itself via SW_UPDATED
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "GET_VERSION" });
    }
    // v524: keep checking on a page that never closes (kiosk) — hourly, and
    // when the screen comes back on. Offline checks are skipped, not queued.
    setInterval(function(){ if (navigator.onLine) reg.update().catch(function(){}); }, AUTO_UPDATE_CHECK_MS);
    document.addEventListener("visibilitychange", function(){
      if (document.visibilityState === "visible" && navigator.onLine) reg.update().catch(function(){});
    });
  }).catch(function(err){ console.error("SW registration failed:", err); });

  navigator.serviceWorker.addEventListener("controllerchange", function() {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "GET_VERSION" });
    }
  });

  navigator.serviceWorker.addEventListener("message", function(e) {
    if (!e.data) return;
    if (e.data.type === "SW_VERSION") {
      // Never show a version whose code is NOT the code running (v382).
      // The worker updates independently of the document already loaded in
      // the tab: during an update the new SW installs, claims this page and
      // announces vNEW while this page is still the OLD build's HTML+JS.
      // Writing vNEW into the label there made the app claim a version it
      // was not running — the update banner then read as a spurious glitch
      // (the label already "proved" you were up to date), so it got
      // dismissed and a shipped fix stayed invisible. That is exactly how
      // v381's recipe-search fix looked broken on Cathal's phone.
      // A STRICTLY NEWER worker now gets the banner only; the label keeps
      // showing what is actually executing until a reload makes it true.
      // Same-or-older still writes through, which is the original intent
      // (the label is sourced from sw.js, the single source of truth).
      var el = document.getElementById("appVersionLabel");
      _swReportedVersion = e.data.version;
      if (el && _verNum(e.data.version) <= _verNum(PAGE_VERSION)) el.textContent = e.data.version;
      renderSwVersionInfo();
    }
    if (e.data.type === "SW_UPDATED" || e.data.type === "SW_VERSION") {
      // A strictly NEWER build is active (numeric compare, v312 lesson:
      // never banner/reload when this page already is the new build, and
      // never when the page is FRESHER than a not-yet-replaced old SW —
      // its replacement is installing and will announce itself shortly).
      if (_verNum(e.data.version) > _verNum(PAGE_VERSION)) showUpdateBanner(e.data.version);
    }
  });
}

// ── Debug overlay (test builds only — never runs in production) ──
if (_isTestBuild) (function() {
  var errors = [];
  function showDbg(type, msg) {
    errors.push({ type: type, msg: msg.substring(0, 300) });
    var log   = document.getElementById('dbgLog');
    var badge = document.getElementById('dbgBadge');
    if (!log || !badge) return;
    log.innerHTML = errors.map(function(e, i) {
      var col = e.type==='error' ? '#ff6666' : e.type==='warn' ? '#ffaa44' : '#88ddff';
      return '<div style="border-bottom:1px solid #440000;padding:4px 0;color:'+col+'">'+(i+1)+'. '+e.msg+'</div>';
    }).join('');
    badge.textContent = errors.length;
    badge.style.background = errors.some(function(e){ return e.type==='error'; }) ? '#ff4444' : '#ffaa44';
    badge.style.display = 'block';
  }
  window.addEventListener('error', function(e) {
    showDbg('error', '<b>'+(e.message||'Error')+'</b> '+(e.filename?e.filename.split('/').pop()+':'+e.lineno:''));
  });
  window.addEventListener('unhandledrejection', function(e) {
    showDbg('error', '<b>'+((e.reason&&e.reason.message)||String(e.reason)||'Promise rejection')+'</b>');
  });
  var _ce = console.error.bind(console);
  console.error = function() { showDbg('error', Array.from(arguments).join(' ')); _ce.apply(console, arguments); };
  var _cw = console.warn.bind(console);
  console.warn  = function() { showDbg('warn',  Array.from(arguments).join(' ')); _cw.apply(console, arguments); };
  setTimeout(function() {
    var badge = document.getElementById('dbgBadge');
    var log   = document.getElementById('dbgLog');
    if (!badge) return;
    if (errors.length === 0) {
      log.innerHTML = '<div style="padding:4px 0">&#x2705; No errors yet</div>';
      badge.textContent = '0';
      badge.style.background = '#2266cc';
      badge.style.display = 'block';
    }
  }, 2000);
})();

