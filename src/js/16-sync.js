// ============================================================
// SYNC — Hearth (username / password)
// ============================================================

var hearthFbId    = storeGet("hearth_fb")       || "";
var hearthUser    = storeGet("hearth_user")      || "";
var hearthToken   = storeGet("hearth_token")     || ""; // stored pw hash
var hearthHouse   = storeGet("hearth_household") || "";
var hearthApiKey      = storeGet("hearth_apikey")   || "";
var hearthIdToken     = "";
var hearthTokenExpiry = 0;
var hearthSyncES  = null;
var hearthHealthES = null;
var syncPaused    = false;
var lastPushTs    = 0;
// Becomes true once we have successfully READ the remote personal node —
// pushPersonal() refuses to push until then, so we can never overwrite remote
// data we haven't seen. v411: set by BOTH read paths (fetchPersonal and a live
// SSE "put"), not just the first fetch — see handlePersonalEvent.
var _personalFetchOk = false;
// v419: the household twin of _personalFetchOk. pushHousehold() sends a
// wholesale PUT to /shared, so a device that has never successfully READ the
// household must not push: it would replace everyone's shared data with
// whatever it happens to be holding. Set by any authorised read (fetch or a
// live SSE put) and by creating a household (nothing to read — we authored it).
var _householdFetchOk = false;
// Distinct sentinel for "the fetch came back 401/403" (v411). It used to be a
// bare null, which a genuinely EMPTY remote node is indistinguishable from —
// Firebase REST returns literal null for a path that doesn't exist yet, so a
// brand-new account took the auth-failure branch and never set the flag above.
var _FETCH_AUTH_FAIL = {};
// Sync diagnostics (v299) — surfaced read-only in the Settings "Sync health"
// panel; purely observational, nothing depends on these.
var _syncStats = { lastPersonalPush: 0, lastHouseholdPush: 0, lastEvent: 0 };
var _homeAwaitingFetch = false; // true between sign-in and first home data fetch

// Migrate from old keys
(function() {
  // Migrate old keys — store the full database URL
  var oldFb   = storeGet("fl4_fbUrl") || storeGet("hearth_fbProject") || storeGet("hearth_fb") || "";
  var oldRoom = storeGet("fl4_room")  || storeGet("hearth_household")  || storeGet("hearth_code") || "";
  if (oldFb && !hearthFbId) {
    // Accept full URL or bare project ID
    if (oldFb.match(/firebaseio\.com|firebasedatabase\.app/i)) {
      hearthFbId = oldFb.replace(/^(https?:\/\/)?/, "https://").replace(/\/+$/, "");
    } else {
      hearthFbId = "https://" + oldFb.replace(/[^a-z0-9-]/g,"") + "-default-rtdb.firebaseio.com";
    }
    storeSet("hearth_fb", hearthFbId);
  }
  if (oldRoom && !hearthHouse) { hearthHouse = oldRoom; storeSet("hearth_household", hearthHouse); }
})();

// NOTE (v449): this `health` key is NOT the Health section. It predates it,
// has no toggle in the Settings UI (the rows are grocery/todo/travel/personal/
// notes/baby), and so is always true — `isSynced("health")` below is
// effectively a constant. The Health SECTION's visibility lives in
// `sectionVisible` (fl4_secVisible) and its data syncs unconditionally on both
// channels like plants/watchlist/appliances. Do not wire the section to this
// key, and do not "tidy" the two together. The grocery CATEGORY id "health"
// (CATS tables, ~line 1929) is a third, separate namespace.
var syncPrefs = storeGet("fl4_syncPrefs") || { grocery:true, todo:true, travel:true, personal:false, notes:false, baby:true, health:true };
function saveSyncPrefs() { storeSet("fl4_syncPrefs", syncPrefs); }
function isSynced(key)   { return !!(syncPrefs[key]); }
function isLoggedIn()    { return !!(hearthFbId && hearthUser && hearthToken); }
function isHouseholdSet(){ return !!(isLoggedIn() && hearthHouse); }

// ── Firebase URL helpers ──────────────────────────────────
function hearthBase()   { return hearthFbId.replace(/\/+$/, ""); } // hearthFbId is the full database URL
function userUrl(path)  { return hearthBase() + "/hearth/users/" + hearthUser + (path||"") + ".json"; }
function houseUrl(path) { return hearthBase() + "/hearth/households/" + hearthHouse + (path||"") + ".json"; }

// Shared timeout wrapper for the sync/auth fetch stack — a hung request
// (bad "lie-fi" connection) used to survive indefinitely behind whatever
// watchdog called it; this aborts it after timeoutMs so callers' existing
// .catch()/error handling fires instead of waiting forever.
function fetchWithTimeout(url, options, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function(){ controller.abort(); }, timeoutMs || 8000);
  var opts = Object.assign({}, options || {}, { signal: controller.signal });
  return fetch(url, opts).then(function(r){ clearTimeout(timer); return r; }, function(e){ clearTimeout(timer); throw e; });
}

// ── Firebase Auth REST API ────────────────────────────────
var _authRefreshRunning = false;
var _authRefreshWaiters = [];
function finishAuthRefresh(token, reason) {
  var waiters = _authRefreshWaiters.slice();
  _authRefreshWaiters = [];
  _authRefreshRunning = false;
  waiters.forEach(function(cb){ try { cb(token, reason || ""); } catch(e){} });
}
function getAuthToken(cb) {
  if (_isTestBuild) { cb(null, "disabled"); return; } // test builds never get a token, so Firebase denies every read/write
  if (!isLoggedIn()) { cb(null, "logged-out"); return; } // v463: a logged-out device must never hand back a still-live cached token
  if (!hearthApiKey) { cb(null, ""); return; } // legacy mode: Firebase rules may deliberately allow unauthenticated REST
  // Return cached token if still valid (with 5-min buffer)
  if (hearthIdToken && Date.now() < hearthTokenExpiry - 300000) {
    cb(hearthIdToken, ""); return;
  }
  var rt = storeGet("hearth_refresh_token");
  if (!rt) { cb(null, "missing"); return; }

  // One refresh in flight for every caller. Personal fetch, household fetch
  // and both SSE listeners can all notice expiry together; refreshing once
  // avoids races over Firebase's rotated refresh-token response.
  _authRefreshWaiters.push(cb);
  if (_authRefreshRunning) return;
  _authRefreshRunning = true;
  fetchWithTimeout("https://securetoken.googleapis.com/v1/token?key=" + hearthApiKey, {
    method: "POST",
    headers: { "Content-Type":"application/x-www-form-urlencoded" },
    body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(rt)
  }).then(function(r){
    // v480: keep the status. Google's token endpoint answers 429 and 5xx with
    // a JSON error body too, and treating every JSON reply without an id_token
    // as "rejected" put up "log out and back in" for a server hiccup -- the
    // v468 false-alarm class. Only 400/401/403 is Google refusing the
    // credential (INVALID_REFRESH_TOKEN, TOKEN_EXPIRED, USER_DISABLED...);
    // anything else is transient and stays quiet like a network failure.
    return r.json().then(function(d){ return { status:+r.status || 0, d:d || {} }; });
  })
  .then(function(res) {
    var d = res.d;
    // Logout may have happened while the request was in flight. Never restore
    // credentials after v463 deliberately cleared them.
    if (!isLoggedIn()) { finishAuthRefresh(null, "logged-out"); return; }
    if (!d.id_token && res.status !== 400 && res.status !== 401 && res.status !== 403 &&
        !(res.status >= 200 && res.status < 300)) {
      finishAuthRefresh(null, "network"); return;   // cached token left alone: it may still be good
    }
    if (d.id_token) {
      hearthIdToken = d.id_token;
      hearthTokenExpiry = Date.now() + (parseInt(d.expires_in)||3600) * 1000;
      if (d.refresh_token) storeSet("hearth_refresh_token", d.refresh_token);
      finishAuthRefresh(hearthIdToken, "");
    } else {
      hearthIdToken = ""; hearthTokenExpiry = 0;
      finishAuthRefresh(null, "rejected");
    }
  }).catch(function(){ finishAuthRefresh(null, "network"); });
}

function firebaseSignIn(email, password, cb) {
  if (_isTestBuild) { cb("Sync is disabled in test builds"); return; }
  fetchWithTimeout("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + hearthApiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email, password: password, returnSecureToken: true })
  }).then(function(r){ return r.json(); })
  .then(function(d) {
    if (d.idToken) {
      hearthIdToken = d.idToken;
      hearthTokenExpiry = Date.now() + (parseInt(d.expiresIn)||3600) * 1000;
      storeSet("hearth_refresh_token", d.refreshToken);
      cb(null, d);
    } else {
      cb(d.error ? d.error.message : "Sign in failed");
    }
  }).catch(function(e){ cb("Network error"); });
}

function firebaseSignUp(email, password, cb) {
  if (_isTestBuild) { cb("Sync is disabled in test builds"); return; }
  fetchWithTimeout("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + hearthApiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email, password: password, returnSecureToken: true })
  }).then(function(r){ return r.json(); })
  .then(function(d) {
    if (d.idToken) {
      hearthIdToken = d.idToken;
      hearthTokenExpiry = Date.now() + (parseInt(d.expiresIn)||3600) * 1000;
      storeSet("hearth_refresh_token", d.refreshToken);
      cb(null, d);
    } else {
      var msg = d.error ? d.error.message : "Sign up failed";
      if (msg === "EMAIL_EXISTS") msg = "Account already exists — try logging in";
      if (msg === "WEAK_PASSWORD : Password should be at least 6 characters") msg = "Password must be at least 6 characters";
      cb(msg);
    }
  }).catch(function(e){ cb("Network error"); });
}

// Append auth token to Firebase REST URLs
function authUrl(url) {
  if (!hearthIdToken) return url;
  var sep = url.indexOf("?") >= 0 ? "&" : "?";
  return url + sep + "auth=" + hearthIdToken;
}

// Every Firebase Database REST request goes through this gate. It refreshes
// before sending, retries once if Firebase rejects a cached token, and exposes
// why no request could be made so transient network trouble is never presented
// as "log back in".
function firebaseFetch(url, options, retried) {
  return new Promise(function(resolve, reject) {
    getAuthToken(function(token, reason) {
      if (hearthApiKey && !token) {
        var authErr = new Error("Firebase auth unavailable");
        authErr.hearthAuth = reason || "missing";
        reject(authErr);
        return;
      }
      fetchWithTimeout(authUrl(url), options).then(function(r) {
        if (hearthApiKey && !retried && (r.status === 401 || r.status === 403)) {
          hearthIdToken = ""; hearthTokenExpiry = 0;
          firebaseFetch(url, options, true).then(resolve, reject);
          return;
        }
        resolve(r);
      }).catch(reject);
    });
  });
}

// ── Login overlay functions ───────────────────────────────
function showLoginOverlay() {
  if (_isPreview || _isTestBuild) return;
  var ov = document.getElementById("loginOverlay");
  if (ov) ov.style.display = "flex";
  document.body.style.overflow = "hidden";
  if (hearthFbId) {
    var fi = document.getElementById("loginFbInput");
    var ok = document.getElementById("loginFbOk");
    var st = document.getElementById("loginStepAccount");
    if (fi) fi.value = hearthFbId;
    if (ok) ok.style.display = "block";
    if (st) { st.style.opacity = "1"; st.style.pointerEvents = "auto"; }
    // Show API key row if FB URL is set
    var akRow = document.getElementById("loginApiKeyRow");
    if (akRow) akRow.style.display = "block";
    if (hearthApiKey) {
      var akInput = document.getElementById("loginApiKeyInput");
      var akOk    = document.getElementById("loginApiKeyOk");
      if (akInput) akInput.value = hearthApiKey;
      if (akOk)    akOk.style.display = "block";
    }
  }
}
function hideLoginOverlay() {
  var ov = document.getElementById("loginOverlay");
  if (ov) ov.style.display = "none";
  document.body.style.overflow = "";
}
function showLoginError(msg) {
  var el = document.getElementById("loginError");
  if (el) { el.textContent = msg; el.style.display = "block"; }
}
function setLoginSpinner(on) {
  var sp = document.getElementById("loginSpinner");
  var lb = document.getElementById("loginBtn");
  var cb = document.getElementById("createAccountBtn");
  if (sp) sp.style.display = on ? "block" : "none";
  if (lb) lb.style.display = on ? "none" : "block";
  if (cb) cb.style.display = on ? "none" : "block";
}
function enableAccountStep() {
  var st = document.getElementById("loginStepAccount");
  if (st) { st.style.opacity = "1"; st.style.pointerEvents = "auto"; }
}

// ── Login button wiring ───────────────────────────────────
document.getElementById("loginApiKeySaveBtn").addEventListener("click", function() {
  var key = document.getElementById("loginApiKeyInput").value.trim();
  if (!key || !key.startsWith("AIza")) { showLoginError("Enter a valid Web API Key (starts with AIza)"); return; }
  hearthApiKey = key;
  storeSet("hearth_apikey", hearthApiKey);
  document.getElementById("loginApiKeyOk").style.display = "block";
  enableAccountStep();
});

document.getElementById("loginFbSaveBtn").addEventListener("click", function() {
  var raw = document.getElementById("loginFbInput").value.trim();
  if (!raw) return;
  var url;
  if (raw.match(/firebaseio\.com|firebasedatabase\.app/i)) {
    url = raw.replace(/^(https?:\/\/)?/, "https://").replace(/\/+$/, "");
  } else {
    var pid = raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
    url = "https://" + pid + "-default-rtdb.firebaseio.com";
  }
  hearthFbId = url;
  storeSet("hearth_fb", hearthFbId);
  document.getElementById("loginFbInput").value = hearthFbId;
  document.getElementById("loginFbOk").style.display = "block";
  document.getElementById("loginApiKeyRow").style.display = "block";
  if (hearthApiKey) { document.getElementById("loginApiKeyInput").value = hearthApiKey; document.getElementById("loginApiKeyOk").style.display = "block"; }
  enableAccountStep();
});
document.getElementById("loginBtn").addEventListener("click", function() {
  var u = document.getElementById("loginUsernameInput").value.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"");
  var p = document.getElementById("loginPasswordInput").value;
  if (!u || !p) { showLoginError("Enter username and password"); return; }
  document.getElementById("loginError").style.display = "none";
  doLogin(u, p);
});
document.getElementById("createAccountBtn").addEventListener("click", function() {
  var u = document.getElementById("loginUsernameInput").value.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"");
  var p = document.getElementById("loginPasswordInput").value;
  if (!u || p.length < 4) { showLoginError("Username required; password must be 4+ characters"); return; }
  document.getElementById("loginError").style.display = "none";
  doCreateAccount(u, p);
});

// ── Password hashing (SHA-256 via Web Crypto) ─────────────
function hashPw(password) {
  var buf = new TextEncoder().encode(hearthFbId.replace(/https?:\/\//, "") + ":" + password);
  return crypto.subtle.digest("SHA-256", buf).then(function(hash) {
    return Array.from(new Uint8Array(hash)).map(function(b){ return ("0"+b.toString(16)).slice(-2); }).join("");
  });
}

// ── Account management ────────────────────────────────────
function doCreateAccount(username, password) {
  setLoginSpinner(true);
  if (!hearthApiKey) {
    // Legacy mode
    hashPw(password).then(function(hash) {
      return fetchWithTimeout(hearthBase() + "/hearth/users/" + username + "/auth.json")
        .then(function(r){ return r.json(); })
        .then(function(existing) {
          if (existing && existing.hash) { showLoginError("Username already taken"); setLoginSpinner(false); throw new Error("taken"); }
          return fetchWithTimeout(hearthBase() + "/hearth/users/" + username + "/auth.json", {
            method:"PUT", body:JSON.stringify({ hash:hash, createdAt:Date.now() }), headers:{"Content-Type":"application/json"}
          }).then(function(resp) {
            if (!resp.ok) throw new Error("HTTP " + resp.status);
            hearthUser = username; hearthToken = hash;
            storeSet("hearth_user", hearthUser); storeSet("hearth_token", hearthToken);
            onLoginSuccess();
          });
        });
    }).catch(function(e) {
      if (e.message !== "taken") { showLoginError("Could not create account. Check your Firebase URL and rules."); }
      setLoginSpinner(false);
    });
  } else {
    // Firebase Auth mode
    var email = username + "@hearth.app";
    firebaseSignUp(email, password, function(err, data) {
      if (err) { showLoginError(err); setLoginSpinner(false); return; }
      // Store username→uid mapping so we can find their data path
      hearthUser = username; hearthToken = data.idToken;
      storeSet("hearth_user", hearthUser); storeSet("hearth_token", hearthToken);
      // Write username record so verifySession works
      firebaseFetch(hearthBase() + "/hearth/users/" + username + "/auth.json", {
        method:"PUT", body:JSON.stringify({ uid:data.localId, createdAt:Date.now() }),
        headers:{"Content-Type":"application/json"}
      }).catch(function(){});
      onLoginSuccess();
    });
  }
}

function doLogin(username, password) {
  setLoginSpinner(true);
  if (!hearthApiKey) {
    // Legacy mode — no API key set, use old hash method
    hashPw(password).then(function(hash) {
      return fetchWithTimeout(hearthBase() + "/hearth/users/" + username + "/auth.json")
        .then(function(r){
          if (r.status === 401 || r.status === 403) {
            showLoginError("Database rules are locked. Please set your Web API Key first, or temporarily open your Firebase rules.");
            setLoginSpinner(false);
            throw new Error("locked");
          }
          return r.json();
        })
        .then(function(authRec) {
          if (!authRec || authRec.hash !== hash) { showLoginError("Incorrect username or password"); setLoginSpinner(false); return; }
          hearthUser = username; hearthToken = hash;
          storeSet("hearth_user", hearthUser); storeSet("hearth_token", hearthToken);
          onLoginSuccess();
        });
    }).catch(function(e) {
      if (e.message !== "locked") { showLoginError("Could not reach Firebase. Check your database URL and rules."); }
      setLoginSpinner(false);
    });
  } else {
    // Firebase Auth mode
    var email = username + "@hearth.app";
    firebaseSignIn(email, password, function(err, data) {
      if (err) {
        var msg = (err === "EMAIL_NOT_FOUND" || err === "INVALID_PASSWORD" || err === "INVALID_LOGIN_CREDENTIALS" || (err && err.indexOf("INVALID_LOGIN_CREDENTIALS") >= 0))
          ? "Incorrect username or password" : "Login failed: " + err;
        showLoginError(msg); setLoginSpinner(false); return;
      }
      hearthUser = username; hearthToken = data.idToken;
      storeSet("hearth_user", hearthUser); storeSet("hearth_token", hearthToken);
      if (data.refreshToken) storeSet("hearth_refresh_token", data.refreshToken);
      onLoginSuccess();
    });
  }
}

function verifySession() {
  if (!isLoggedIn()) { showLoginOverlay(); return; }
  // v373: stored credentials are enough — enter immediately, no network
  // round-trip gates entry. All the data is local; only SYNC needs the
  // network, and onLoginSuccess sequences the sync kick-off behind the
  // background token refresh itself. (Replaces the v290 6s entry watchdog:
  // its job — surviving a hung request — moves to the sync kick-off, which
  // is the only thing still waiting on one. The old lenient auth.json probe
  // is gone with it: it entered the app on success, failure AND error, so
  // it verified nothing and only added a request to every launch.)
  onLoginSuccess();
}

function onLoginSuccess() {
  hideLoginOverlay();
  setLoginSpinner(false);
  updateSyncStatus();

  if (typeof updateListTabDots === "function") updateListTabDots();

  setTimeout(function(){ if (isLoggedIn() && typeof maybeShowBackupNudge === "function") maybeShowBackupNudge(); }, 1800);
  setTimeout(function(){ if (typeof maybeCloudBackup === "function") maybeCloudBackup(); }, 8000);
  setTimeout(function(){ if (isLoggedIn() && typeof maybeShowMealPlanBanner === "function") maybeShowMealPlanBanner(); }, 2200);

  // Stale-data banner: tapping it triggers re-login
  var sb2 = document.getElementById("staleDataBanner");
  if (sb2 && !sb2._wired) {
    sb2._wired = true;
    sb2.addEventListener("click", function() {
      sb2.style.display = "none";
      logout(false); // shows login overlay, keeps data
    });
  }

  // v373: render Home from local data immediately — no loading state, no
  // waiting on the fetch. Sync landing later re-renders (the callbacks
  // below already do). _homeAwaitingFetch stays false at boot; renderers
  // still honour it for any future flow that sets it.
  switchSection("home");

  // Sync kick-off. Each Firebase REST request now obtains a current token
  // itself, so entry stays local-first without a separate startup watchdog
  // racing the token refresh.
  var _syncStarted = false;
  function startSync() {
    if (_syncStarted) return;
    _syncStarted = true;

    fetchPersonal(function() {
      pushPersonal();
      startPersonalListening();
      startSSEFallback();
      _homeAwaitingFetch = false;
      // Render home with fresh remote data
      if (currentSection === "home") renderHomeScreen();
    });

    // Load household code from user profile if not stored locally
    if (!hearthHouse) {
      firebaseFetch(userUrl("/household")).then(function(r){ return r.json(); }).then(function(code) {
        if (code && typeof code === "string") {
          hearthHouse = code; storeSet("hearth_household", hearthHouse);
          fetchHousehold(function() {
            pushHousehold();
            startListening();
          });
        }
      }).catch(function(err){ console.error("Household code fetch failed:", err); });
    } else {
      fetchHousehold(function() {
        pushHousehold();
        startListening();
      });
    }

    updateSyncStatus();
  }

  startSync();
}

function logout(silent) {
  if (hearthSyncES)   { hearthSyncES.close();   hearthSyncES = null; }
  if (hearthHealthES) { hearthHealthES.close();  hearthHealthES = null; }
  hearthUser = ""; hearthToken = ""; hearthHouse = "";
  hearthIdToken = ""; hearthTokenExpiry = 0; // v463: a cached id token must not outlive logout
  _personalFetchOk = false; _householdFetchOk = false; // v419: a new session must read before it pushes
  storeSet("hearth_user",""); storeSet("hearth_token",""); storeSet("hearth_household","");
  storeSet("hearth_refresh_token",""); // v463: leaving this behind let a logged-out device keep refreshing auth
  if (!silent) showLoginOverlay();
  updateSyncStatus();
}

// ── Push / fetch ──────────────────────────────────────────

// Personal sync: always-on, syncs ALL data for same user on any device
var _pushPersonalTimer = null;
function pushPersonal() {
  if (_isTestBuild) return;
  if (_seedTainted) return; // v420: demo data on this device — never send it up
  if (!isLoggedIn() || syncPaused) return;
  if (!_personalFetchOk) return; // never push until we've successfully pulled remote data
  lastPushTs = Date.now(); // set immediately so tab-switch guard works
  clearTimeout(_pushPersonalTimer);
  _pushPersonalTimer = setTimeout(function() {
var d = {};
  // v519: workouts/bodyweight/BP/temps travel as `workouts`. They used to go
  // as `health`, which the fl4_health line further down overwrote, so they
  // never reached another device. Do NOT move them back under `health`.
  d.workouts = getWD();
  ["grocery","todo","travel","personal"].forEach(function(lt) {
    var ld = listData[lt], notes = storeGet("fl4_notes_" + lt) || [];
    if (ld) d["list_" + lt] = { items:ld.items, hist:ld.hist, notes:notes, customCats:getCustomCats(lt), deleted:purgeTombs(getTombs(lt)), histDeleted:purgeTombs(getTombs(histTombKey(lt))) };
  });
  Object.keys(NOTES_CONTEXTS).forEach(function(nc) {
    var c = NOTES_CONTEXTS[nc];
    d[c.pfield] = storeGet(c.key) || [];
    d[c.dfield] = purgeTombs(getTombs(c.tomb));
  });
  d.action_log   = getActionLog();
  d.action_log_deleted = purgeTombs(getTombs("action_log"));
  d.track_med    = getTrackMed();
  d.track_med_deleted  = purgeTombs(getTombs("track_med"));
  d.food_log     = getFoodLog();
  d.food_log_deleted   = purgeTombs(getTombs("food_log"));
  d.food_notes   = storeGet("fl4_food_notes")  || {};
  d.saved_meals  = storeGet("fl4_saved_meals") || [];
  d.saved_meals_deleted = purgeTombs(getTombs("saved_meals"));
  d.cal_goal     = storeGet("fl4_cal_goal") || 2000;
  d.cal_goal_ts  = +storeGet("fl4_cal_goal_ts") || 0;   // v441: 0 = never set here, so it loses every merge
  d.profile      = storeGet("fl4_profile") || {};
  d.profile_ts   = +storeGet("fl4_profile_ts") || 0;
  d.baby = getBD();
  d.med_deleted = purgeTombs(getTombs("med"));
  d.growth_deleted = purgeTombs(getTombs("growth"));
  d.ms_deleted  = purgeTombs(getTombs("ms"));
  d.bags_deleted = purgeTombs(getTombs("bags"));            // v478
  d.bagitems_deleted = purgeTombs(getTombs("bagitems"));    // v478
  d.btemp_deleted = purgeTombs(getTombs("btemp"));          // v519
  d.recipebook  = storeGet("fl4_recipebook") || [];
  d.rb_deleted  = purgeTombs(getTombs("recipes"));
  d.mealplan    = storeGet("fl4_mealplan") || [];
  d.trips       = storeGet("fl4_trips") || [];
  d.trips_deleted    = purgeTombs(getTombs("trips"));
  d.bookings_deleted = purgeTombs(getTombs("bookings"));
  d.plants      = storeGet("fl4_plants") || [];
  d.plants_deleted   = purgeTombs(getTombs("plants"));
  d.watchlist   = storeGet("fl4_watchlist") || [];
  d.watchlist_deleted = purgeTombs(getTombs("watchlist"));
  d.appliances  = storeGet("fl4_appliances") || [];
  d.appliances_deleted = purgeTombs(getTombs("appliances"));
  d.health      = storeGet("fl4_health") || [];
  d.health_deleted = purgeTombs(getTombs("health"));
  d.projects    = storeGet("fl4_projects") || [];
  d.projects_deleted = purgeTombs(getTombs("projects"));
  d.projitems_deleted = purgeTombs(getTombs("projitems"));
  d.golf        = storeGet("fl4_golf") || [];
  d.golf_deleted = purgeTombs(getTombs("golf"));
  firebaseFetch(userUrl("/data"), { method:"PUT", body:JSON.stringify(d), headers:{"Content-Type":"application/json"} }).then(function(r){ if (r && r.ok) _syncStats.lastPersonalPush = Date.now(); }).catch(function(){});
  }, 800);
}

// ── Batched sync-apply rendering (v375, Release D) ────────────────────────
// applyPersonal/applyHousehold used to render *inside* the merge loop, so one
// apply cycle could call renderRecipes() twice (recipe book, then meal plan)
// and always rebuilt the Lists DOM even when Lists wasn't the visible section.
// Now each merge block only marks a dirty flag and this runs once at the end:
// merge everything first, then redraw each affected + visible section once.
// The per-block guards are preserved, not dropped — they're evaluated here
// instead (currentSection / _recipeEditing / _tripEditing cannot change mid
// apply cycle, so this is the same decision, made once). Each render is
// individually try/caught so one failing view can't block the others.
function flushSyncRenders(dirty) {
  dirty = dirty || {};
  function safeRender(name, fn) {
    try { fn(); } catch (err) { console.warn("sync render failed (" + name + "):", err); }
  }
  if (dirty.recipes && currentSection === "recipes" && !_recipeEditing) safeRender("recipes", renderRecipes);
  if (dirty.trips   && currentSection === "trips"   && !_tripEditing)   safeRender("trips",   renderTrips);
  // v378: the import screen holds pasted text that isn't saved yet, so an
  // incoming sync must not redraw it out from under him either.
  if (dirty.plants  && currentSection === "plants"  && !_plantEditing && !_plantImporting) safeRender("plants",  renderPlants);
  // Same guard shape: an incoming sync must not redraw a half-typed entry away.
  if (dirty.watchlist && currentSection === "watch" && !_watchEditing)   safeRender("watch",   renderWatchlist);
  // Same guard shape again: an incoming sync must not redraw a half-typed
  // appliance away.
  // v428: the import screen is guarded like the plant one — a sync arriving
  // mid-paste must not redraw the textarea out from under a half-typed file.
  if (dirty.appliances && currentSection === "appliances" && !_applEditing && _applView !== "import") safeRender("appliances", renderAppliances);
  // v449: same guard shape again — an incoming sync must not redraw a
  // half-typed health record away.
  if (dirty.health && currentSection === "health" && !_healthEditing) safeRender("health", renderHealth);
  // v499: same guard shape — an incoming sync must not redraw a half-typed
  // project or item away.
  if (dirty.projects && currentSection === "projects" && !_projEditing) safeRender("projects", renderProjects);
  // v500: and again for a half-scored golf round or course.
  if (dirty.golf && currentSection === "golf" && !_golfEditing) safeRender("golf", renderGolf);
  // v458: Baby gets the same guard, with a twist — the Log-medicine form is
  // always on screen, so there is no "editor open" flag to test and the dirty
  // check has to be the form's own contents. Without this, another device's
  // Baby update rebuilt renderMedicine and wiped a half-typed dose.
  // Skipping the refresh is SAFE and must NOT be rebuilt as a save/restore of
  // the field values: the interval speed-bump re-reads getBD() live inside the
  // Log click handler (medHistoryFor), so the advisory is computed when Log is
  // pressed and is never stale — only the displayed panel is, and it refreshes
  // on the next sync after logging.
  if (dirty.baby    && currentSection === "baby" && !medDraftOpen() && !tempDraftOpen()) safeRender("baby", renderBabyView);
  // Lists: unchanged except for the section guard. switchSection() re-renders
  // the list on entry, so skipping it while hidden can't leave a stale view.
  if (dirty.list    && currentSection === "lists")                      safeRender("list",    renderList);
  // Tab dots stay unconditional (they reflect unseen counts, and must run
  // AFTER renderList, which rebuilds the tab bar they attach to).
  if (dirty.dots)                                                       safeRender("listDots", updateListTabDots);
  if (dirty.home    && currentSection === "home")                       safeRender("home",    renderHomeScreen);
  if (dirty.train   && currentSection === "train")                      safeRender("train",   renderTrainView);
}

function applyPersonal(d) {
  if (!d || typeof d !== "object") return;
  syncPaused = true; // v390: applyHousehold has set this on entry since ~v375; applyPersonal only ever cleared it in `finally`, leaving a window where an outgoing push could race an in-progress merge
  var _rDirty = {};
  try {

  // ── Workouts: merge by workout ID, not last-write-wins ───────────────────
  // v519: read `workouts` (see pushPersonal). `health` is the fl4_health ARRAY
  // since v449 — taking it as workouts copied its records into fl4_workouts
  // as "0","1",… keys, which the merge below now strips.
  // A non-array `health` is the pre-v449 shape (workouts under `health`), still accepted.
  function _isWD(x){ return !!(x && typeof x === "object" && !Array.isArray(x)); }
  var _remoteWD = _isWD(d.workouts) ? d.workouts : (_isWD(d.health) ? d.health : null);
  if (_remoteWD) {
    var localWD  = getWD();
    var remoteWD = _remoteWD;
    var localWkts  = Array.isArray(localWD.workouts)  ? localWD.workouts  : [];
    var remoteWkts = Array.isArray(remoteWD.workouts) ? remoteWD.workouts : [];
    var wIdx = {};
    // Remote first, then local overwrites (local is more recent if push is in-flight)
    remoteWkts.forEach(function(w){ if(w) wIdx[w.id] = w; });
    localWkts.forEach(function(w){  if(w) wIdx[w.id] = w; });
    // Merge bodyweight by date (union — never lose a local entry)
    var bwIdx = {};
    (Array.isArray(remoteWD.bodyweight) ? remoteWD.bodyweight : []).forEach(function(e){ if(e && e.date) bwIdx[trackPersonOf(e)+":"+e.date] = e; });
    (Array.isArray(localWD.bodyweight)  ? localWD.bodyweight  : []).forEach(function(e){ if(e && e.date) bwIdx[trackPersonOf(e)+":"+e.date] = e; });
    // Merge blood pressure by date+time (union)
    var bpIdx = {};
    (Array.isArray(remoteWD.bp) ? remoteWD.bp : []).forEach(function(e){ if(e && e.ts) bpIdx[e.ts] = e; });
    (Array.isArray(localWD.bp)  ? localWD.bp  : []).forEach(function(e){ if(e && e.ts) bpIdx[e.ts] = e; });
    // v519: temperatures (Me / My wife — the daughter's live in fl4_baby.temps) merge like BP, by person+ts
    var tpIdx = {};
    (Array.isArray(remoteWD.temps) ? remoteWD.temps : []).forEach(function(e){ if(e && e.ts) tpIdx[trackPersonOf(e)+":"+e.ts] = e; });
    (Array.isArray(localWD.temps)  ? localWD.temps  : []).forEach(function(e){ if(e && e.ts) tpIdx[trackPersonOf(e)+":"+e.ts] = e; });
    // v352: base was remoteWD alone, so a local-only key the remote copy
    // didn't have yet was wiped (fix-queue batch A, finding 12). Base on
    // remoteWD+localWD (remote first, local overwrites — same precedence as
    // the workouts/bodyweight/bp merges above) so unknown keys carry through
    // from whichever side has them.
    var mergedWD = Object.assign({}, remoteWD, localWD, {
      workouts: Object.values(wIdx).sort(function(a,b){ return (b.date||"").localeCompare(a.date||""); }),
      bodyweight: Object.values(bwIdx).sort(function(a,b){ return (b.date||"").localeCompare(a.date||""); }),
      bp: Object.values(bpIdx).sort(function(a,b){ return (b.ts||0)-(a.ts||0); }),
      temps: Object.values(tpIdx).sort(function(a,b){ return (b.ts||0)-(a.ts||0); })
    });
    Object.keys(mergedWD).forEach(function(k){ if (/^\d+$/.test(k)) delete mergedWD[k]; });
    storeSet("fl4_workouts", mergedWD);
  }

  // ── Lists: merge remote + local by item ID (union, no overwrites) ─────────
  var _pListRepush = false;
  ["grocery","todo","travel","personal"].forEach(function(lt) {
    var ld = d["list_" + lt];
    if (!ld || typeof ld !== "object") return;
    loadListData(lt);
    var local   = listData[lt] || { items:[], hist:[] };
    var remote  = { items: Array.isArray(ld.items) ? ld.items.filter(Boolean) : [],
                    hist:  Array.isArray(ld.hist)  ? ld.hist.filter(Boolean)  : [] };
    // Union by id with newest-wins + deletion tombstones (same as household channel)
    var _tombs = mergeTombs(getTombs(lt), (ld.deleted && typeof ld.deleted === "object") ? ld.deleted : {});
    storeSet("fl4_tomb_" + lt, purgeTombs(_tombs));
    var _htombs = mergeTombs(getTombs(histTombKey(lt)), (ld.histDeleted && typeof ld.histDeleted === "object") ? ld.histDeleted : {});
    storeSet("fl4_tomb_" + histTombKey(lt), purgeTombs(_htombs));
    var _lm = mergeListItems(local.items, remote.items, _tombs);
    if (_lm.push) _pListRepush = true;
    listData[lt] = {
      items: _lm.items,
      hist:  mergeHist(local.hist, remote.hist, _htombs, _lm.items)
    };
    storeSet(LIST_CONFIG[lt].key, listData[lt]);
    if (Array.isArray(ld.notes)) storeSet("fl4_notes_" + lt, ld.notes.filter(Boolean));
    if (Array.isArray(ld.customCats) && ld.customCats.length) {
      var existingCats = getCustomCats(lt), existingCatIds = {};
      existingCats.forEach(function(c){ existingCatIds[c.id]=true; });
      var newCats = ld.customCats.filter(function(c){ return c && !existingCatIds[c.id]; });
      if (newCats.length) saveCustomCats(lt, existingCats.concat(newCats));
    }
  });
  if (_pListRepush) setTimeout(function(){ if (isLoggedIn()) pushPersonal(); }, 0); // converge backup to the union

  // ── Notes: id-keyed union + newest-wins + tombstones (v343, both contexts) ─
  var _notesRepush = false;
  Object.keys(NOTES_CONTEXTS).forEach(function(nc) {
    var c = NOTES_CONTEXTS[nc];
    if (d[c.dfield] && typeof d[c.dfield] === "object") {
      storeSet("fl4_tomb_" + c.tomb, purgeTombs(mergeTombs(getTombs(c.tomb), d[c.dfield])));
    }
    if (!Array.isArray(d[c.pfield])) return;
    var nm = mergeNotes(storeGet(c.key) || [], d[c.pfield].filter(Boolean), getTombs(c.tomb));
    storeSet(c.key, nm.notes);
    if (nm.push) _notesRepush = true;
  });
  if (_notesRepush) setTimeout(function(){ if (isLoggedIn()) pushPersonal(); }, 0);

  // ── Action log: merge by entry ID + deletion tombstones ──────────────────
  var _alTombs = mergeTombs(getTombs("action_log"), (d.action_log_deleted && typeof d.action_log_deleted === "object") ? d.action_log_deleted : {});
  storeSet("fl4_tomb_action_log", purgeTombs(_alTombs));
  if (Array.isArray(d.action_log)) {
    var localLog = getActionLog(), logIndex = {};
    localLog.forEach(function(e){ if(e) logIndex[e.id]=e; });
    d.action_log.filter(Boolean).forEach(function(e){ logIndex[e.id]=e; });
    // v462: a tombstone only wins over a record it is NEWER than -- the rule
    // plants, trips, notes, recipes, workouts, inventory and health all already
    // use. Was unconditional, so a restored entry was deleted again by the
    // other device's tombstone no matter how freshly it had been restored.
    var alOut = Object.values(logIndex).filter(function(e){ return e && !(_alTombs[e.id] >= personalTs(e)); });
    storeSet("fl4_action_log", alOut.sort(function(a,b){return b.ts-a.ts;}));
  }

  // ── Track medicine: merge by entry ID + deletion tombstones ──────────────
  var _tmTombs = mergeTombs(getTombs("track_med"), (d.track_med_deleted && typeof d.track_med_deleted === "object") ? d.track_med_deleted : {});
  storeSet("fl4_tomb_track_med", purgeTombs(_tmTombs));
  if (Array.isArray(d.track_med)) {
    var localTm = getTrackMed(), tmIndex = {};
    localTm.forEach(function(e){ if(e) tmIndex[e.id]=e; });
    d.track_med.filter(Boolean).forEach(function(e){ tmIndex[e.id]=e; });
    // v462: this filter stays UNCONDITIONAL on purpose, unlike its three
    // neighbours. Cathal's call, 05/09/2026: a deleted medicine record is
    // medical data and a deletion of it must stick -- it is never revived by a
    // restore, and importBackupData reports it as skipped instead of silently
    // counting it as imported. Do NOT "make this consistent" with the others.
    var tmOut = Object.values(tmIndex).filter(function(e){ return e && _tmTombs[e.id] == null; });
    storeSet("fl4_track_med", tmOut.sort(function(a,b){return b.ts-a.ts;}));
  }

  // ── Food log: merge by entry ID + deletion tombstones ────────────────────
  var _flTombs = mergeTombs(getTombs("food_log"), (d.food_log_deleted && typeof d.food_log_deleted === "object") ? d.food_log_deleted : {});
  storeSet("fl4_tomb_food_log", purgeTombs(_flTombs));
  if (Array.isArray(d.food_log)) {
    var localFood = getFoodLog(), foodIndex = {};
    localFood.forEach(function(e){ if(e) foodIndex[e.id]=e; });
    d.food_log.filter(Boolean).forEach(function(e){ foodIndex[e.id]=e; });
    var flOut = Object.values(foodIndex).filter(function(e){ return e && !(_flTombs[e.id] >= personalTs(e)); });  // v462: see action_log above
    storeSet("fl4_food_log", flOut.sort(function(a,b){return b.id-a.id;}));
  }

  if (d.food_notes  && typeof d.food_notes === "object") {
    var localFN = storeGet("fl4_food_notes") || {};
    storeSet("fl4_food_notes", Object.assign({}, d.food_notes, localFN)); // local daily notes win
  }
  // ── Saved meals: merge by id + deletion tombstones (v443) ────────────────
  // This was the ONE personal collection merged without tombstones, so the
  // union below re-added anything the other device still held and a delete
  // only ever survived until the next pull -- Cathal's "Demo usual breakfast
  // comes back". Do NOT drop the tombstone filter to "simplify" this: a saved
  // meal's id is Date.now() at creation, so a tombstone can never block a
  // newly saved meal, and the 90d purge keeps the map tiny.
  var _smTombs = mergeTombs(getTombs("saved_meals"), (d.saved_meals_deleted && typeof d.saved_meals_deleted === "object") ? d.saved_meals_deleted : {});
  storeSet("fl4_tomb_saved_meals", purgeTombs(_smTombs));
  if (Array.isArray(d.saved_meals)) {
    var localSM = storeGet("fl4_saved_meals") || [], smIndex = {};
    localSM.forEach(function(m){ if(m) smIndex[m.id]=m; });
    d.saved_meals.filter(Boolean).forEach(function(m){ smIndex[m.id]=m; });
    storeSet("fl4_saved_meals", Object.values(smIndex).filter(function(m){ return m && !(_smTombs[m.id] >= personalTs(m)); }));  // v462: see action_log above
  }
  // ── Calorie goal + TDEE profile: newest-wins by stamp (v441) ─────────────
  // Both used to be taken from the incoming payload unconditionally, which is
  // how the goal kept "resetting to 2000": a device that had never set one
  // pushed the `|| 2000` fallback and the next pull wrote it over the real
  // goal. A value with NO stamp counts as 0, so it never overwrites a stamped
  // one -- an old device still on the pre-v441 build can no longer stomp this,
  // it can only be corrected by the converge push below. The `== null` arm is
  // the first-run case: a device with nothing stored takes whatever is there,
  // stamp or not, so a fresh phone still picks the goal up.
  var _goalPush = false, _profPush = false;
  if (d.cal_goal) {
    var _incGoalTs = +d.cal_goal_ts || 0, _locGoalTs = +storeGet("fl4_cal_goal_ts") || 0;
    if (storeGet("fl4_cal_goal") == null || _incGoalTs > _locGoalTs) {
      storeSet("fl4_cal_goal", d.cal_goal);
      storeSet("fl4_cal_goal_ts", _incGoalTs);
    } else if (_locGoalTs > _incGoalTs) _goalPush = true;   // local newer -> push to converge
  }
  if (d.profile && typeof d.profile === "object" && Object.keys(d.profile).length) {
    var _incProfTs = +d.profile_ts || 0, _locProfTs = +storeGet("fl4_profile_ts") || 0;
    var _locProf = storeGet("fl4_profile");
    if (!_locProf || !Object.keys(_locProf).length || _incProfTs > _locProfTs) {
      storeSet("fl4_profile", d.profile);
      storeSet("fl4_profile_ts", _incProfTs);
    } else if (_locProfTs > _incProfTs) _profPush = true;
  }
  if (_goalPush || _profPush) setTimeout(function(){ if (isLoggedIn()) pushPersonal(); }, 0);

  // ── Recipe book: newest-wins by `updated` (mirrors the household channel) ──
  if (Array.isArray(d.recipebook)) {
    var lrb = storeGet("fl4_recipebook") || [];
    var rInc = d.recipebook.filter(function(m){ return m && m.id != null; });
    var rIdx = {}; rInc.forEach(function(m){ rIdx[m.id] = m; });
    var rLids = {}, rbPush = false;
    var rMerged = lrb.map(function(m){
      if (!m || m.id == null) return m;
      rLids[m.id] = true;
      var im = rIdx[m.id];
      if (!im) { rbPush = true; return m; }                       // backup missing this → push
      if ((im.updated||0) > (m.updated||0)) return im;            // incoming newer → take it
      if ((m.updated||0) > (im.updated||0)) rbPush = true;        // local newer → push to converge
      return m;
    });
    var rFresh = rInc.filter(function(m){ return !rLids[m.id]; });
    var rbFullP = rFresh.concat(rMerged);
    if (d.rb_deleted && typeof d.rb_deleted === "object") {
      var rTombsP = mergeTombs(getTombs("recipes"), d.rb_deleted);
      storeSet("fl4_tomb_recipes", rTombsP);
      var rbPreP = rbFullP.length;
      rbFullP = rbFullP.filter(function(m){ return !(m && rTombsP[m.id] && rTombsP[m.id] > (m.updated||0)); });
      if (rbFullP.length < rbPreP) rbPush = true;
    }
    storeSet("fl4_recipebook", rbFullP);
    _rDirty.recipes = true;
    if (rbPush) setTimeout(function(){ if (isLoggedIn()) pushPersonal(); }, 0);
  }

  // ── Meal plan: newest-wins per day (mirrors the household channel) ───────
  if (Array.isArray(d.mealplan)) {
    var mpMergeP = mergeMealPlanData(getMealPlan(), d.mealplan);
    storeSet("fl4_mealplan", mpMergeP.plan);
    _rDirty.recipes = true;
    if (mpMergeP.push) setTimeout(function(){ if (isLoggedIn()) pushPersonal(); }, 0);
  }

  // ── Trips: merge by id, with a nested merge on each trip's bookings ──────
  if (Array.isArray(d.trips)) {
    var tpTombsP = mergeTombs(getTombs("trips"), (d.trips_deleted && typeof d.trips_deleted === "object") ? d.trips_deleted : {});
    storeSet("fl4_tomb_trips", purgeTombs(tpTombsP));
    var bkTombsP = mergeTombs(getTombs("bookings"), (d.bookings_deleted && typeof d.bookings_deleted === "object") ? d.bookings_deleted : {});
    storeSet("fl4_tomb_bookings", purgeTombs(bkTombsP));
    var tpMergeP = mergeTripsData(storeGet("fl4_trips") || [], d.trips, tpTombsP, bkTombsP);
    storeSet("fl4_trips", tpMergeP.trips);
    _rDirty.trips = true;
    if (tpMergeP.push) setTimeout(function(){ if (isLoggedIn()) pushPersonal(); }, 0);
  }

  // ── Plants: whole-record newest-wins by `updated`, tombstone-filtered ────
  if (Array.isArray(d.plants)) {
    var plTombsP = mergeTombs(getTombs("plants"), (d.plants_deleted && typeof d.plants_deleted === "object") ? d.plants_deleted : {});
    storeSet("fl4_tomb_plants", purgeTombs(plTombsP));
    var plMergeP = mergePlantsData(storeGet("fl4_plants") || [], d.plants, plTombsP);
    storeSet("fl4_plants", plMergeP.plants);
    _rDirty.plants = true;
    if (plMergeP.push) setTimeout(function(){ if (isLoggedIn()) pushPersonal(); }, 0);
  }

  // ── Watchlist: whole-record newest-wins by `updated`, tombstone-filtered ──
  if (Array.isArray(d.watchlist)) {
    var wlTombsP = mergeTombs(getTombs("watchlist"), (d.watchlist_deleted && typeof d.watchlist_deleted === "object") ? d.watchlist_deleted : {});
    storeSet("fl4_tomb_watchlist", purgeTombs(wlTombsP));
    var wlMergeP = mergeWatchData(storeGet("fl4_watchlist") || [], d.watchlist, wlTombsP);
    storeSet("fl4_watchlist", wlMergeP.watchlist);
    _rDirty.watchlist = true;
    if (wlMergeP.push) setTimeout(function(){ if (isLoggedIn()) pushPersonal(); }, 0);
  }

  // ── Appliances: whole-record newest-wins by `updated`, tombstone-filtered ─
  if (Array.isArray(d.appliances)) {
    var apTombsP = mergeTombs(getTombs("appliances"), (d.appliances_deleted && typeof d.appliances_deleted === "object") ? d.appliances_deleted : {});
    storeSet("fl4_tomb_appliances", purgeTombs(apTombsP));
    var apMergeP = mergeApplianceData(storeGet("fl4_appliances") || [], d.appliances, apTombsP);
    storeSet("fl4_appliances", apMergeP.appliances);
    _rDirty.appliances = true;
    if (apMergeP.push) setTimeout(function(){ if (isLoggedIn()) pushPersonal(); }, 0);
  }

  // ── Health: whole-record newest-wins by `updated`, tombstone-filtered ────
  if (Array.isArray(d.health)) {
    var hlTombsP = mergeTombs(getTombs("health"), (d.health_deleted && typeof d.health_deleted === "object") ? d.health_deleted : {});
    storeSet("fl4_tomb_health", purgeTombs(hlTombsP));
    var hlMergeP = mergeHealthData(storeGet("fl4_health") || [], d.health, hlTombsP);
    storeSet("fl4_health", hlMergeP.health);
    _rDirty.health = true;
    if (hlMergeP.push) setTimeout(function(){ if (isLoggedIn()) pushPersonal(); }, 0);
  }

  // ── Projects (v499): trips-shape merge — project fields newest-wins, items by id ─
  if (Array.isArray(d.projects)) {
    var pjTombsP = mergeTombs(getTombs("projects"), (d.projects_deleted && typeof d.projects_deleted === "object") ? d.projects_deleted : {});
    storeSet("fl4_tomb_projects", purgeTombs(pjTombsP));
    var piTombsP = mergeTombs(getTombs("projitems"), (d.projitems_deleted && typeof d.projitems_deleted === "object") ? d.projitems_deleted : {});
    storeSet("fl4_tomb_projitems", purgeTombs(piTombsP));
    var pjMergeP = mergeProjectsData(storeGet("fl4_projects") || [], d.projects, pjTombsP, piTombsP);
    storeSet("fl4_projects", pjMergeP.projects);
    _rDirty.projects = true;
    if (pjMergeP.push) setTimeout(function(){ if (isLoggedIn()) pushPersonal(); }, 0);
  }

  // ── Golf (v500): whole-record newest-wins, the Health contract ────────────
  if (Array.isArray(d.golf)) {
    var gfTombsP = mergeTombs(getTombs("golf"), (d.golf_deleted && typeof d.golf_deleted === "object") ? d.golf_deleted : {});
    storeSet("fl4_tomb_golf", purgeTombs(gfTombsP));
    var gfMergeP = mergeGolfData(storeGet("fl4_golf") || [], d.golf, gfTombsP);
    storeSet("fl4_golf", gfMergeP.golf);
    _rDirty.golf = true;
    if (gfMergeP.push) setTimeout(function(){ if (isLoggedIn()) pushPersonal(); }, 0);
  }

  // ── Baby: shared per-entry merge, v329 (see mergeBabyData) ───────────────
  if (d.med_deleted && typeof d.med_deleted === "object") {
    storeSet("fl4_tomb_med", purgeTombs(mergeTombs(getTombs("med"), d.med_deleted)));
  }
  if (d.growth_deleted && typeof d.growth_deleted === "object") {
    storeSet("fl4_tomb_growth", purgeTombs(mergeTombs(getTombs("growth"), d.growth_deleted)));
  }
  if (d.ms_deleted && typeof d.ms_deleted === "object") {
    storeSet("fl4_tomb_ms", purgeTombs(mergeTombs(getTombs("ms"), d.ms_deleted)));
  }
  if (d.bags_deleted && typeof d.bags_deleted === "object") {          // v478
    storeSet("fl4_tomb_bags", purgeTombs(mergeTombs(getTombs("bags"), d.bags_deleted)));
  }
  if (d.bagitems_deleted && typeof d.bagitems_deleted === "object") {  // v478
    storeSet("fl4_tomb_bagitems", purgeTombs(mergeTombs(getTombs("bagitems"), d.bagitems_deleted)));
  }
  if (d.btemp_deleted && typeof d.btemp_deleted === "object") {        // v519
    storeSet("fl4_tomb_btemp", purgeTombs(mergeTombs(getTombs("btemp"), d.btemp_deleted)));
  }
  if (d.baby && typeof d.baby === "object") {
    storeSet("fl4_baby", mergeBabyData(getBD(), d.baby, getTombs("med"), getTombs("growth"), getTombs("ms"), getTombs("bags"), getTombs("bagitems"), getTombs("btemp")));
    _rDirty.baby = true;
  }

  // v375: was bare (no try/catch) while applyHousehold had one — a throw in any
  // merge block left syncPaused stuck true and skipped every render below.
  } catch (err) { console.warn("applyPersonal error (sync continues):", err); }
  finally { syncPaused = false; }
  flushSyncRenders({ recipes:_rDirty.recipes, trips:_rDirty.trips, baby:_rDirty.baby, appliances:_rDirty.appliances,
                     plants:_rDirty.plants, watchlist:_rDirty.watchlist, health:_rDirty.health, projects:_rDirty.projects, golf:_rDirty.golf, list:true, home:true, train:true });
}
function setSyncLoginNeeded(on) {
  var banner = document.getElementById("staleDataBanner");
  var wasOn = !!(banner && banner.style.display === "block");
  if (banner) banner.style.display = on ? "block" : "none";
  if (on && !wasOn) toast("Sync needs re-login — please log out and back in");
}
function fetchPersonal(cb) {
  if (!isLoggedIn()) { if(cb)cb(); return; }
  // Show subtle loading indicator on sync button
  var btn = document.getElementById("syncBtn");
  if (btn) { btn._origColor = btn.style.color; btn.style.opacity = "0.5"; }
  firebaseFetch(userUrl("/data"))
    .then(function(r){
      if (btn) { btn.style.opacity = ""; }
      if (r.status === 401 || r.status === 403) {
        // firebaseFetch already refreshed and retried once. A second denial is
        // rules/configuration trouble, not an expired session.
        toast("Sync access denied — check Firebase rules");
        if (cb) cb();
        return _FETCH_AUTH_FAIL;
      }
      return r.json();
    })
    .then(function(d) {
      if (d === _FETCH_AUTH_FAIL) return; // v411: was `d === null`, which also caught an empty remote
      _personalFetchOk = true;
      setSyncLoginNeeded(false);
      if (d && typeof d === "object") applyPersonal(d);
      if (cb) cb();
    }).catch(function(err){
      if (btn) { btn.style.opacity = ""; }
      // Only a missing or rejected refresh credential needs a human login.
      // Timeouts/offline failures remain quiet and retry through SSE fallback.
      if (err && (err.hearthAuth === "missing" || err.hearthAuth === "rejected")) setSyncLoginNeeded(true);
      if(cb)cb();
    });
}

var _pushHouseholdTimer = null;
function pushHousehold() {
  if (_isTestBuild) return;
  if (_seedTainted) return; // v420: demo data on this device — never send it to the household
  if (!isHouseholdSet() || syncPaused) return;
  if (!_householdFetchOk) return; // never push until we've successfully pulled remote data
  lastPushTs = Date.now();
  clearTimeout(_pushHouseholdTimer);
  _pushHouseholdTimer = setTimeout(function() {
var data = {};
  ["grocery","todo","travel","personal"].forEach(function(lt) {
    if (!isSynced(lt)) return;
    var d = listData[lt], notes = storeGet("fl4_notes_" + lt) || [];
    var cc = getCustomCats(lt);
    if (d) data["list_" + lt] = { items:d.items, hist:d.hist, notes:notes, customCats:cc, deleted:purgeTombs(getTombs(lt)), histDeleted:purgeTombs(getTombs(histTombKey(lt))) };
  });
  if (isSynced("notes")) {
    Object.keys(NOTES_CONTEXTS).forEach(function(nc) {
      var c = NOTES_CONTEXTS[nc];
      data[c.pfield] = storeGet(c.key) || [];
      data[c.dfield] = purgeTombs(getTombs(c.tomb)); // outside any non-empty guard: deleting the LAST note must still propagate (mirrors med_deleted)
    });
  }
  if (isSynced("baby")) {
    var bd = getBD();
    if ((bd.growth||[]).length || (bd.medicine||[]).length || (bd.milestones||[]).length || (bd.temps||[]).length || Object.keys(bd.teeth||{}).length || Object.keys(bd.bottles||{}).length || (bd.bags||[]).length)
      data["baby"] = bd;   // v478: bags added to the guard -- a household whose Baby section held ONLY bags never pushed them at all
    data["med_deleted"] = purgeTombs(getTombs("med")); // outside the non-empty guard: a delete of the LAST dose must still propagate
    data["growth_deleted"] = purgeTombs(getTombs("growth"));
    data["ms_deleted"] = purgeTombs(getTombs("ms"));
    data["bags_deleted"] = purgeTombs(getTombs("bags"));           // v478, same reasoning
    data["bagitems_deleted"] = purgeTombs(getTombs("bagitems"));
    data["btemp_deleted"] = purgeTombs(getTombs("btemp"));         // v519
  }
  // Recipe book is shared household-wide (merge-by-id on the receiving side).
  data["recipebook"] = storeGet("fl4_recipebook") || [];
  data["rb_deleted"] = purgeTombs(getTombs("recipes"));
  // Meal plan is shared household-wide (newest-wins per day on the receiving side).
  data["mealplan"] = storeGet("fl4_mealplan") || [];
  // Trips are shared household-wide too; merge-by-id on both trips and bookings.
  data["trips"] = storeGet("fl4_trips") || [];
  data["trips_deleted"]    = purgeTombs(getTombs("trips"));
  data["bookings_deleted"] = purgeTombs(getTombs("bookings"));
  // Plants are shared household-wide too; whole-record merge-by-id (v377).
  data["plants"] = storeGet("fl4_plants") || [];
  data["plants_deleted"] = purgeTombs(getTombs("plants"));
  // The watchlist is household coordination data (v391) — shared like recipes.
  data["watchlist"] = storeGet("fl4_watchlist") || [];
  data["watchlist_deleted"] = purgeTombs(getTombs("watchlist"));
  // Appliances are household reference data (v424) — shared like plants.
  data["appliances"] = storeGet("fl4_appliances") || [];
  data["appliances_deleted"] = purgeTombs(getTombs("appliances"));
  // Health is household reference data too (v449, confirmed 31/08/2026) —
  // both phones seeing the baby's next appointment is the point of it.
  data["health"] = storeGet("fl4_health") || [];
  data["health_deleted"] = purgeTombs(getTombs("health"));
  // Projects are household coordination data (v499) — shared like trips,
  // with the same two-level merge on the receiving side.
  data["projects"] = storeGet("fl4_projects") || [];
  data["projects_deleted"] = purgeTombs(getTombs("projects"));
  data["projitems_deleted"] = purgeTombs(getTombs("projitems"));
  // Golf (v500) rides the household channel too, as confirmed 03/10/2026.
  data["golf"] = storeGet("fl4_golf") || [];
  data["golf_deleted"] = purgeTombs(getTombs("golf"));
  lastPushTs = Date.now();
  firebaseFetch(houseUrl("/shared"), { method:"PUT", body:JSON.stringify(data), headers:{"Content-Type":"application/json"} }).then(function(r){ if (r && r.ok) _syncStats.lastHouseholdPush = Date.now(); }).catch(function(){});
  }, 800);
}

function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }

function escNl(s) {
  return esc(s).replace(/\n/g, "<br>");
}

// v464: shared paste-dispatch helper (plants/inventory/prep/recipes imports).
// A chat reply routinely arrives with a leading blank line before its ```
// fence; stripping the fence BEFORE trimming leaves it in place because the
// strip regex is anchored at the true start of the string, not the start of
// its content. Trim, strip, trim again — one copy, so a future paste-import
// site can't independently get the order wrong.
function stripPasteFence(s) {
  return String(s || "").trim().replace(/^```(?:[a-z]*)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function toast(msg) {
  // Decode any HTML entities (e.g. &#x1FAB4; emoji, &amp;) to real characters
  var tmp = document.createElement("textarea");
  tmp.innerHTML = msg;
  elToast.textContent = tmp.value;
  elToast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){ elToast.classList.remove("show"); }, 2200);
}

// ══════════════════════════════════════════════════════════
// SPORTS (v308) — hideable pull-on-open scoreboard. Data from TheSportsDB
// free key "3" (public sports data only; nothing personal is ever sent).
// Teams + cache are DEVICE-LOCAL (fl4_sports_teams / fl4_sports_cache) —
// not exported, not synced. No live scores/alerts (no push) — a team's data
// refreshes when the Sports tab is opened, at most every 2h.
// ══════════════════════════════════════════════════════════
var SPORTS_API = "https://www.thesportsdb.com/api/v1/json/3/";
var SPORTS_CACHE_TTL = 2 * 3600 * 1000;
var _sportsFetching = {};
function getSportsTeams(){ var t = storeGet("fl4_sports_teams"); return Array.isArray(t) ? t : [ { id:"133612", name:"Manchester United", sport:"Soccer" } ]; }
function saveSportsTeams(t){ storeSet("fl4_sports_teams", t); }
function sportsCache(){ var c = storeGet("fl4_sports_cache"); return (c && typeof c==="object") ? c : {}; }
function saveSportsCache(c){ storeSet("fl4_sports_cache", c); }
function sportsAgo(ts){ return ts ? medAgoStr(Date.now()-ts) : "—"; }
// Kickoff in the user's local time from strTimestamp (treated as UTC if no tz).
function sportsWhen(ev){
  var ts = ev.strTimestamp, d;
  if (ts) d = new Date(/Z|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts + "Z");
  else if (ev.dateEvent) d = new Date(ev.dateEvent + "T" + (ev.strTime||"00:00:00") + "Z");
  if (!d || isNaN(d.getTime())) return ev.dateEvent || "TBC";
  var days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], mon=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], p=function(x){return x<10?"0"+x:""+x;};
  return days[d.getDay()]+" "+d.getDate()+" "+mon[d.getMonth()]+", "+p(d.getHours())+":"+p(d.getMinutes());
}
// Reduce a team's next+last events to display text (from the team's viewpoint).
function sportsSummarise(team, next, last){
  var out = { nextText:"", lastText:"" };
  var nx = (next && next[0]) ? next[0] : null;
  if (nx){
    var home = String(nx.idHomeTeam) === String(team.id), opp = home ? nx.strAwayTeam : nx.strHomeTeam;
    out.nextText = "vs " + opp + " (" + (home?"H":"A") + ") · " + sportsWhen(nx) + (nx.strLeague ? " · " + nx.strLeague : "");
  }
  var ls = (last && last[0]) ? last[0] : null;
  if (ls){
    var lhome = String(ls.idHomeTeam) === String(team.id), lopp = lhome ? ls.strAwayTeam : ls.strHomeTeam;
    var us = lhome ? ls.intHomeScore : ls.intAwayScore, them = lhome ? ls.intAwayScore : ls.intHomeScore;
    if (us != null && them != null && us !== "" && them !== ""){
      var res = (+us > +them) ? "W" : (+us < +them) ? "L" : "D";
      out.lastText = res + " " + us + "–" + them + " vs " + lopp;
    } else { out.lastText = "vs " + lopp + " · " + (ls.dateEvent||""); }
  }
  return out;
}
function fetchSportsForTeam(team, cb){
  // A fetch already in flight for this team will call cb (renderSports) itself
  // when it resolves. Calling cb synchronously here too would let renderSports'
  // own refreshSports(false) call straight back into this branch — since the
  // cache still isn't populated yet — causing unbounded synchronous recursion
  // and a "Maximum call stack size exceeded" crash. Just wait for the original.
  if (_sportsFetching[team.id]) { return; }
  _sportsFetching[team.id] = true;
  var got = { next:null, last:null, n:0 };
  function step(){ if (++got.n >= 2){ _sportsFetching[team.id]=false;
    var c = sportsCache(); c[team.id] = { next:got.next, last:got.last, at:Date.now(), name:team.name }; saveSportsCache(c); cb && cb(); } }
  fetch(SPORTS_API + "eventsnext.php?id=" + encodeURIComponent(team.id)).then(function(r){return r.json();})
    .then(function(j){ got.next = (j && j.events) ? j.events : []; step(); }).catch(function(){ step(); });
  fetch(SPORTS_API + "eventslast.php?id=" + encodeURIComponent(team.id)).then(function(r){return r.json();})
    .then(function(j){ got.last = (j && (j.results||j.events)) ? (j.results||j.events) : []; step(); }).catch(function(){ step(); });
}
function refreshSports(force){
  if (typeof navigator!=="undefined" && navigator.onLine === false) return;
  var teams = getSportsTeams(), c = sportsCache();
  teams.forEach(function(t){
    var cached = c[t.id];
    if (force || !cached || (Date.now() - (cached.at||0)) > SPORTS_CACHE_TTL){
      fetchSportsForTeam(t, function(){ if (currentSection==="sports") renderSports(); });
    }
  });
}
function renderSports(){
  var el = document.getElementById("sportsContent");
  if (!el) return;
  var teams = getSportsTeams(), c = sportsCache();
  var html = "<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:12px'>" +
    "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600'>&#x26BD; Sports</div>" +
    "<button id='sportsManageBtn' style='border:1.5px solid #C4833A;background:none;color:#C4833A;border-radius:9px;padding:7px 12px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>Manage teams</button></div>";
  if (!teams.length){
    html += "<div style='text-align:center;color:#8A7A5A;padding:30px 16px'><div style='font-size:40px'>&#x26BD;</div><div style='font-size:15px;font-weight:600;margin:8px 0 4px'>No teams yet</div><div style='font-size:13px'>Tap &ldquo;Manage teams&rdquo; to add yours.</div></div>";
  } else {
    teams.forEach(function(t){
      var cached = c[t.id], s = cached ? sportsSummarise(t, cached.next, cached.last) : null;
      html += "<div style='background:#fff;border:1px solid #ECE4D6;border-radius:12px;padding:13px 14px;margin-bottom:10px'>" +
        "<div style='font-size:15px;font-weight:700;color:#1A2E2E;margin-bottom:5px'>"+esc(t.name)+"</div>" +
        (s && s.nextText ? "<div style='font-size:13px;color:#2A6A4A;margin-bottom:3px'>&#x1F4C5; Next: "+esc(s.nextText)+"</div>" : "<div style='font-size:13px;color:#9A8A6A;margin-bottom:3px'>"+(cached?"No upcoming fixture":"Loading…")+"</div>") +
        (s && s.lastText ? "<div style='font-size:13px;color:#6A5A40'>&#x1F3C1; Last: "+esc(s.lastText)+"</div>" : "") +
        "</div>";
    });
    var stamp = teams.map(function(t){ return c[t.id] && c[t.id].at; }).filter(Boolean).sort().pop();
    html += "<div style='font-size:11px;color:#B0A488;text-align:center;margin-top:6px;line-height:1.5'>"+(stamp? "as of "+sportsAgo(stamp) : "Loading…")+"<br>updates when you open this tab &middot; not live</div>";
  }
  el.innerHTML = html;
  var mb = document.getElementById("sportsManageBtn");
  if (mb) mb.addEventListener("click", openSportsManage);
  refreshSports(false);
}
function openSportsManage(){
  var ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box";
  ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true"); ov.setAttribute("aria-label","Manage teams");
  function close(){ if (ov.parentNode) ov.parentNode.removeChild(ov); renderSports(); }
  function doSearch(){
    var q = ov.querySelector("#sptSearch").value.trim(); if (!q) return;
    var rd = ov.querySelector("#sptResults"); rd.innerHTML = "<div style='font-size:13px;color:#8A7A5A;padding:4px 2px'>Searching…</div>";
    fetch(SPORTS_API + "searchteams.php?t=" + encodeURIComponent(q)).then(function(r){return r.json();}).then(function(j){
      var res = (j && j.teams) ? j.teams.slice(0,8) : [];
      if (!res.length){ rd.innerHTML = "<div style='font-size:13px;color:#8A7A5A;padding:4px 2px'>No teams found.</div>"; return; }
      rd.innerHTML = res.map(function(t){
        return "<div class='sptAdd' data-id='"+esc(t.idTeam)+"' data-name='"+esc(t.strTeam)+"' data-sport='"+esc(t.strSport||"")+"' style='display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 2px;border-bottom:1px solid #EEE9E0;cursor:pointer'><span style='font-size:14px;color:#2A2010'>"+esc(t.strTeam)+" <span style='font-size:11px;color:#9A8A6A'>"+esc(t.strSport||"")+(t.strLeague?" · "+esc(t.strLeague):"")+"</span></span><span style='color:#2D6B35;font-weight:800;font-size:18px'>+</span></div>";
      }).join("");
      rd.querySelectorAll(".sptAdd").forEach(function(row){ row.addEventListener("click", function(){
        var t = getSportsTeams();
        if (t.some(function(x){ return String(x.id)===String(row.dataset.id); })){ toast("Already added"); return; }
        t.push({ id:row.dataset.id, name:row.dataset.name, sport:row.dataset.sport }); saveSportsTeams(t);
        toast("Added "+row.dataset.name); draw();
      }); });
    }).catch(function(){ rd.innerHTML = "<div style='font-size:13px;color:#C06060;padding:4px 2px'>Search failed — check your connection.</div>"; });
  }
  function draw(){
    var teams = getSportsTeams();
    var list = teams.map(function(t,i){
      return "<div style='display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 2px;border-bottom:1px solid #EEE9E0'><span style='font-size:14px;color:#2A2010'>"+esc(t.name)+"</span><button class='sptRm' data-idx='"+esc(i)+"' aria-label='Remove' style='border:none;background:none;color:#C06060;font-size:18px;cursor:pointer;padding:0 6px'>&times;</button></div>";
    }).join("") || "<div style='font-size:13px;color:#8A7A5A;padding:6px 2px'>No teams yet.</div>";
    ov.innerHTML = "<div style='background:#fff;border-radius:16px;padding:20px;width:100%;max-width:360px;max-height:82vh;overflow-y:auto'>" +
      "<div style='font-size:16px;font-weight:800;color:#4A3A20;margin-bottom:10px'>&#x26BD; Manage teams</div>" +
      "<div>"+list+"</div>" +
      "<div style='margin-top:14px;font-size:12px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.4px'>Add a team</div>" +
      "<div style='display:flex;gap:8px;margin-top:6px'><input id='sptSearch' type='text' placeholder='Team or country name…' autocomplete='off' autocorrect='off' style='flex:1;padding:9px 11px;border:1.5px solid #D8D0C0;border-radius:9px;font-family:inherit;font-size:14px;outline:none'><button id='sptSearchBtn' style='padding:9px 13px;border:none;background:#C4833A;color:#fff;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Search</button></div>" +
      "<div id='sptResults' style='margin-top:8px'></div>" +
      "<button id='sptClose' data-bbclose style='width:100%;margin-top:16px;padding:11px;border:none;background:#F0EBE2;color:#7A6A4A;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Done</button>" +
    "</div>";
    ov.querySelectorAll(".sptRm").forEach(function(bt){ bt.addEventListener("click", function(){ var t=getSportsTeams(); t.splice(+bt.dataset.idx,1); saveSportsTeams(t); draw(); }); });
    ov.querySelector("#sptClose").addEventListener("click", close);
    ov.querySelector("#sptSearchBtn").addEventListener("click", doSearch);
    ov.querySelector("#sptSearch").addEventListener("keydown", function(e){ if (e.key==="Enter") doSearch(); });
  }
  ov.addEventListener("click", function(e){ if (e.target===ov) close(); });
  document.body.appendChild(ov);
  draw();
}

