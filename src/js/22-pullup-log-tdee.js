// ============================================================
// PULL-UP PLAN (v482)
// ============================================================
// A 4-week, 12-session plan, and the one Train programme that REMEMBERS its
// progress between visits — every other programme is one guided sitting. It
// came from a standalone prototype and was adapted to the Train safety rules
// (HEARTH-notes.md § Train programme safety content): no held breath under
// effort, and only the kit Cathal owns — a bar, gymnastic rings and the step
// ladder. The adaptation is model-written, not physio-checked; the intro says so.
//
// State: `fl4_pullup` = { checks:{ "w-s-e":[bool,…] }, test:"", logged:{ "w-s":workoutId },
// updatedAt }, all indices 0-based. It is in the export/backup, the import and
// the test seed, but deliberately NOT synced (Cathal's call, v482). Which
// session is open is device-local UI state in `fl4_pullup_open`, not exported.
// Always read through pullupState(), which rebuilds the shape from the plan.
var PULLUP_PLAN = {
  id:'pullup-4wk', title:'Pull-up Plan', color:'#3b82f6', sessionsPerWeek:3,
  weeks:[
    { title:'Week 1', focus:'Build the base', exercises:[
      { id:'dead-hang',   name:'Dead hang',       sets:3, target:'20–30s' },
      { id:'scap-pulls',  name:'Scapular pulls',  sets:3, target:'6–8' },
      { id:'inv-rows',    name:'Inverted rows',   sets:3, target:'8' },
      { id:'flexed-hang', name:'Flexed-arm hang', sets:3, target:'5–10s' }
    ]},
    { title:'Week 2', focus:'Introduce negatives', exercises:[
      { id:'dead-hang',   name:'Dead hang',            sets:3, target:'30–40s' },
      { id:'scap-pulls',  name:'Scapular pulls',       sets:3, target:'10' },
      { id:'negatives',   name:'Negatives, 3–5s down', sets:3, target:'3' },
      { id:'inv-rows',    name:'Inverted rows',        sets:3, target:'10' }
    ]},
    { title:'Week 3', focus:'Add volume', exercises:[
      { id:'negatives',   name:'Negatives, 5s down',          sets:4, target:'3' },
      { id:'assisted',    name:'Assisted pull-ups',           sets:3, target:'5' },
      { id:'flexed-hang', name:'Flexed-arm hang',             sets:3, target:'15s' },
      { id:'inv-rows',    name:'Inverted rows, feet forward', sets:3, target:'10' }
    ]},
    { title:'Week 4', focus:'Push toward a full rep', exercises:[
      { id:'negatives',   name:'Negatives, 5–8s down',        sets:4, target:'4' },
      { id:'assisted',    name:'Assisted pull-ups, less help', sets:3, target:'6' },
      { id:'flexed-hang', name:'Flexed-arm hang',             sets:3, target:'20s' }
    ]}
  ]
};
// Week 4 Session 3 (0-based 3-2) adds the test attempt and a free-text result.
var PULLUP_TEST = { week:3, session:2, exercise:{ id:'test', name:'Strict pull-up attempt', sets:1, target:'1' } };
var PULLUP_RULES = [
  "Do 3 sessions a week on non-consecutive days.",
  "Rest 90–120s between sets.",
  "Stop each set 1–2 reps, or a few seconds, short of failure.",
  "Breathe out on every effort and never hold your breath — end the set the moment you would have to.",
  "If you haven't got a full pull-up by the end of Week 4, repeat Week 4.",
  "Back off for sharp pain in the shoulder or elbow, pain that lingers into the next session, or tingling in the hands."
];
var PULLUP_WARMUP  = "10 arm circles each way, 2 × 10 wall slides, 8 cat-cows kept to the middle of the range (no big arch, no deep round), and a 10s easy hang with your feet on the ground.";
var PULLUP_COOLDOWN = "A lat stretch on a doorframe for 30s each side, then forearm stretches, palm up then palm down, 20s each.";
var PULLUP_INFO = "Adapted from a general pull-up plan to your Train safety rules: the breathing rule, and your kit — the bar, the rings and the step ladder. The adaptation is model-written, not physio-checked.";
// Keyed by exercise id; every week's variant of a movement shares one guide.
var PULLUP_GUIDE = {
  'dead-hang':{
    cues:["Overhand grip just wider than the shoulders, thumbs wrapped","Squeeze the bar — arms long, not limp","Ribs down, legs together, keep breathing","Easier: toes on a rung of the step ladder"],
    cue:"Take an overhand grip just wider than your shoulders, thumbs wrapped around the bar. Squeeze the bar and keep your arms long without going limp; ribs down, legs together. Breathe normally the whole way through — a relaxed hang gently decompresses the spine, but only while it never turns into a breath-hold. Common mistakes: collapsing into your shoulders, holding your breath, swinging. Easier: keep your toes on a rung of the step ladder."},
  'scap-pulls':{
    cues:["From a dead hang, arms stay straight","Pull the shoulders down, away from the ears","Hold 1–2s, then lower slowly","Breathe out as you pull down"],
    cue:"From a dead hang, pull your shoulders down away from your ears without bending your elbows. Hold 1–2 seconds, then lower slowly. Think shoulder blades into your back pockets and chest toward the bar — your arms are just ropes. Breathe out as you pull down. Common mistakes: bending the elbows, rushing, swinging."},
  'inv-rows':{
    cues:["On the rings: straight arms, heels down, body in one line","Pull the chest to the rings, elbows back at about 45°","Pause 1s, lower over 2–3s","Breathe out as you pull — hips don't sag"],
    cue:"Use the rings, set up as for Ring Rows on Pull Day: hang back under them on straight arms, heels on the floor, body in one straight line from ankle to ear with ribs down. Pull your chest to the rings, driving the elbows toward your back pockets at about 45°, squeeze the shoulder blades, pause 1 second and lower over 2–3 seconds. Breathe out as you pull. Common mistakes: hips sagging (that is the lower back arching), craning the neck, dropping fast. Easier: bend your knees or stand more upright. Harder: walk your feet forward — progress by angle, never by adding load."},
  'flexed-hang':{
    cues:["Step up from the ladder so your chin is over the bar","Chest to the bar, elbows down, shoulders down","Keep breathing — short, steady breaths","End the hold if it needs a held breath; lower slowly"],
    cue:"Step up from the step ladder so your chin is over the bar, lift your feet and hold: chest to the bar, elbows pointing down, shoulders down. Keep breathing in short, steady breaths the whole time. This is the item most likely to turn into a breath-hold, and with a 4 cm hiatus hernia that pressure spike is the thing to avoid — if you can only stay up by holding your breath, end the hold there; the seconds you get while breathing are the ones that count. Lower slowly rather than dropping. Common mistakes: tilting your head back, dropping at the end. Easier: hold with your chin level with the bar."},
  'negatives':{
    cues:["Step up from the ladder to chin over the bar — no jump","Lower under control for the target time","Fight hardest through the bottom half","Breathe out on the way down; stop when you can't slow it"],
    cue:"Step up from the step ladder — not a jump — to chin over the bar, then lower yourself under control for the target time until your arms are straight. Control the whole way down and fight hardest through the bottom half. Breathe out slowly as you lower rather than holding your breath at the top. End the set when you can no longer slow the descent."},
  'assisted':{
    cues:["A foot on a ladder rung, or rings low enough to stand under","Full reps: dead hang to chin over the bar","The least help that still hits the target reps","Enough help that you can breathe out through every rep"],
    cue:"Take some of your weight through your legs: a foot on a rung of the step ladder, rings set low enough to stand under, or a band under one foot if you have one. Do full reps from a dead hang to chin over the bar. Use the lightest help that still lets you hit the target reps — but never so little that you have to brace and hold your breath to finish one, the same line as Assisted Pull-ups on Pull Day. Ribs down, breathe out as you pull."},
  'test':{
    cues:["After a full warm-up — one attempt","Dead hang to chin over the bar, no kick or swing","Breathe out as you pull","Needs a held breath? Stop: that's a not-yet, repeat Week 4"],
    cue:"After a full warm-up, one strict attempt: from a dead hang, pull until your chin is over the bar, with no kicking or swinging. Breathe out as you pull. This is the one maximal effort in the plan, so it carries one extra rule: if the rep only goes by bracing hard and holding your breath, stop and count it as not yet — that held breath under max effort is exactly the pressure spike a 4 cm hiatus hernia does not want. Not yet is fine: repeat Week 4 and try again. Write what happened in the result box."}
};

function pullupSessionExercises(w, s) {
  var wk = PULLUP_PLAN.weeks[w];
  if (!wk) return [];
  var exs = wk.exercises.slice();
  if (w === PULLUP_TEST.week && s === PULLUP_TEST.session) exs.push(PULLUP_TEST.exercise);
  return exs;
}
function pullupEachSession(fn) {
  for (var w=0; w<PULLUP_PLAN.weeks.length; w++)
    for (var s=0; s<PULLUP_PLAN.sessionsPerWeek; s++) fn(w, s, pullupSessionExercises(w, s));
}
function pullupTotalSessions() { return PULLUP_PLAN.weeks.length * PULLUP_PLAN.sessionsPerWeek; }
// Rebuilds the stored object against the plan: unknown keys are dropped, every
// ticks array is exactly `sets` long and holds real booleans. A corrupt value
// reads as no progress rather than throwing.
function pullupNormalise(raw) {
  var out = { checks:{}, test:"", logged:{}, updatedAt:0 };
  if (!raw || typeof raw !== "object") return out;
  var c = (raw.checks && typeof raw.checks === "object") ? raw.checks : {};
  var lg = (raw.logged && typeof raw.logged === "object") ? raw.logged : {};
  pullupEachSession(function(w, s, exs){
    exs.forEach(function(ex, e){
      var a = c[w+"-"+s+"-"+e];
      if (!Array.isArray(a)) return;
      var arr = [];
      for (var i=0; i<ex.sets; i++) arr.push(a[i] === true);
      out.checks[w+"-"+s+"-"+e] = arr;
    });
    if (lg[w+"-"+s] != null) out.logged[w+"-"+s] = lg[w+"-"+s];
  });
  out.test = typeof raw.test === "string" ? raw.test.slice(0, 200) : "";
  out.updatedAt = +raw.updatedAt || 0;
  return out;
}
function pullupState() { return pullupNormalise(storeGet("fl4_pullup")); }
function pullupSave(st) { st.updatedAt = Date.now(); storeSet("fl4_pullup", st); }
function pullupSessionCount(st, w, s) {
  var done = 0, total = 0;
  pullupSessionExercises(w, s).forEach(function(ex, e){
    var a = st.checks[w+"-"+s+"-"+e] || [];
    total += ex.sets;
    for (var i=0; i<ex.sets; i++) if (a[i]) done++;
  });
  return { done:done, total:total };
}
function pullupSessionsDone(st) {
  var n = 0;
  pullupEachSession(function(w, s){ var c = pullupSessionCount(st, w, s); if (c.done === c.total) n++; });
  return n;
}
// "" is a real choice (everything closed), so only a missing key falls back
// to the first session that isn't finished yet.
function pullupOpenKey(st) {
  var k = storeGet("fl4_pullup_open");
  if (typeof k === "string") return k;
  var first = "";
  pullupEachSession(function(w, s){
    if (first) return;
    var c = pullupSessionCount(st, w, s);
    if (c.done < c.total) first = w+"-"+s;
  });
  return first;
}

function openPullupPlan() {
  SS = { type:"pullup", puHow:"", puView:"cues", puViewFor:"" };
  openSessionOverlay(PULLUP_PLAN.title);
  renderPullupPlan();
}
function pullupToggleSession(k) {
  storeSet("fl4_pullup_open", pullupOpenKey(pullupState()) === k ? "" : k);
  renderPullupPlan();
}
function pullupToggleHow(k) {
  SS.puHow = SS.puHow === k ? "" : k;
  renderPullupPlan();
}
// Same DERIVED reset as physioExerciseView(): Details sticks only to the guide
// it was chosen on, so opening another exercise's guide falls back to Cues.
function pullupHowView(k) { return (SS.puView === "details" && SS.puViewFor === k) ? "details" : "cues"; }
function setPullupHowView(v, k) {
  SS.puView = (v === "details") ? "details" : "cues";
  SS.puViewFor = k;
  renderPullupPlan();
}
// Reuses the .ycue-* tabs so this reads as the same design as the yoga and
// physio session screens.
function pullupGuideHtml(ex, k) {
  var g = PULLUP_GUIDE[ex.id];
  if (!g) return "";
  var view = pullupHowView(k);
  function tab(v, label) {
    var on = view === v;
    return "<button class='ycue-tab"+(on?" on":"")+"' aria-pressed='"+(on?"true":"false")+"'" +
      " onclick=\"setPullupHowView('"+v+"','"+k+"')\">"+label+"</button>";
  }
  var panel = view === "details"
    ? "<p class='ses-pose-cue'>"+esc(g.cue)+"</p>"
    : "<ul class='ycue-list'>" + g.cues.map(function(c){ return "<li>"+esc(c)+"</li>"; }).join("") + "</ul>";
  return "<div class='pu-how'><div class='ycue-tabs'>"+tab("cues","Cues")+tab("details","Details")+"</div>"+panel+"</div>";
}

function renderPullupPlan() {
  var st = pullupState(), col = PULLUP_PLAN.color, open = pullupOpenKey(st);
  var doneN = pullupSessionsDone(st), totalN = pullupTotalSessions();
  var anyTick = Object.keys(st.checks).some(function(k){ return st.checks[k].indexOf(true) !== -1; });
  document.getElementById("sesCount").textContent = doneN+" / "+totalN;
  document.getElementById("sesProgFill").style.width = ((doneN/totalN)*100)+"%";
  document.getElementById("sesProgFill").style.background = col;

  var html = "<div class='pu-wrap' style='--ycue-accent:"+col+"'>" +
    "<div class='ses-intro' style='padding:14px 8px 0'>" +
      "<div class='ses-intro-ico' style='font-size:44px;margin-bottom:8px'>&#x1F4AA;</div>" +
      "<div class='ses-intro-name'>"+esc(PULLUP_PLAN.title)+"</div>" +
      "<div class='ses-intro-sub'>"+PULLUP_PLAN.weeks.length+" weeks &middot; "+PULLUP_PLAN.sessionsPerWeek+" sessions a week</div>" +
    "</div>" +
    "<div class='pu-card pu-overall'><div class='pu-overall-txt'>"+doneN+" of "+totalN+" sessions</div>" +
      "<div class='pu-bar'><div class='pu-bar-fill' style='width:"+((doneN/totalN)*100)+"%;background:"+col+"'></div></div></div>" +
    // Open until the first tick, then folded away — it is long for a screen
    // you come back to twelve times.
    "<details class='pu-card pu-rules'"+(anyTick?"":" open")+"><summary>Before you start</summary><div class='pu-rules-body'>" +
      "<div class='pu-warn'>&#x26A0;&#xFE0F; "+esc(WK_TRAIN_NOTE)+"</div>" +
      "<div class='pu-h'>Rules</div><ul class='ycue-list'>" +
        PULLUP_RULES.map(function(r){ return "<li>"+esc(r)+"</li>"; }).join("") + "</ul>" +
      "<div class='pu-h'>Warm-up &middot; 5 min</div><div>"+esc(PULLUP_WARMUP)+"</div>" +
      "<div class='pu-h'>Cool-down</div><div>"+esc(PULLUP_COOLDOWN)+"</div>" +
      "<div class='pu-info'>"+esc(PULLUP_INFO)+"</div>" +
    "</div></details>";

  PULLUP_PLAN.weeks.forEach(function(wk, w){
    html += "<div class='pu-week'><div class='pu-week-hdr'>"+esc(wk.title)+" <span class='pu-week-focus'>&middot; "+esc(wk.focus)+"</span></div>";
    for (var s=0; s<PULLUP_PLAN.sessionsPerWeek; s++) {
      var sk = w+"-"+s, c = pullupSessionCount(st, w, s), isOpen = open === sk, done = c.done === c.total;
      html += "<div class='pu-card pu-ses'>" +
        "<button class='pu-ses-hdr' aria-expanded='"+(isOpen?"true":"false")+"' onclick=\"pullupToggleSession('"+sk+"')\">" +
          "<span class='pu-ses-name'>Session "+(s+1)+(w===PULLUP_TEST.week&&s===PULLUP_TEST.session?" &middot; test":"")+"</span>" +
          "<span class='pu-ses-prog"+(done?" done":"")+"'>"+(done?"&#x2713; Done":c.done+"/"+c.total+" sets")+"</span>" +
          "<span class='whi-chev'>"+(isOpen?"&#x25B2;":"&#x25BC;")+"</span>" +
        "</button>";
      if (isOpen) {
        html += "<div class='pu-ses-body'>";
        pullupSessionExercises(w, s).forEach(function(ex, e){
          var k = sk+"-"+e, a = st.checks[k] || [], sets = "";
          for (var i=0; i<ex.sets; i++) {
            var on = !!a[i];
            sets += "<button class='pu-set"+(on?" on":"")+"' aria-pressed='"+(on?"true":"false")+"' aria-label='Set "+(i+1)+(on?", done":"")+"'" +
              " onclick=\"pullupTick('"+k+"',"+i+")\">"+(on?"&#x2713;":(i+1))+"</button>";
          }
          var howOpen = SS.puHow === k;
          html += "<div class='pu-ex'>" +
            "<div class='pu-ex-top'><div class='pu-ex-name'>"+esc(ex.name)+"</div>" +
              "<div class='pu-ex-target'>"+(ex.id==="test"?"1 attempt":ex.sets+" &times; "+esc(ex.target))+"</div></div>" +
            "<div class='pu-sets'>"+sets +
              (PULLUP_GUIDE[ex.id] ? "<button class='pu-how-btn' aria-expanded='"+(howOpen?"true":"false")+"' onclick=\"pullupToggleHow('"+k+"')\">How to "+(howOpen?"&#x25B2;":"&#x25BC;")+"</button>" : "") +
            "</div>" +
            (howOpen ? pullupGuideHtml(ex, k) : "") +
            (ex.id==="test" ? "<label class='pu-test'>Result<input class='pu-test-inp' type='text' maxlength='200' value='"+esc(st.test)+"'" +
              " placeholder='e.g. chin to the bar, not over' onchange='pullupSetTest(this.value)'></label>" : "") +
          "</div>";
        });
        html += "</div>";
      }
      html += "</div>";
    }
    html += "</div>";
  });
  html += "<button class='pu-reset' onclick='pullupReset()'>Reset progress</button></div>";
  document.getElementById("sesBody").innerHTML = html;
}

function pullupTick(k, i) {
  var st = pullupState(), p = String(k).split("-"), w = +p[0], s = +p[1], e = +p[2];
  var ex = pullupSessionExercises(w, s)[e];
  if (!ex || i < 0 || i >= ex.sets) return;
  var before = pullupSessionCount(st, w, s);
  var arr = st.checks[k] || [];
  for (var j=0; j<ex.sets; j++) arr[j] = arr[j] === true;
  arr[i] = !arr[i];
  st.checks[k] = arr;
  var after = pullupSessionCount(st, w, s);
  var logged = (after.done === after.total && before.done < before.total) ? pullupLogSession(st, w, s) : false;
  pullupSave(st);
  renderPullupPlan();
  if (logged) toast("&#x1F4AA; Week "+(w+1)+" · Session "+(s+1)+" saved to History");
}
// Finishing a session saves ONE History entry, like the other programmes.
// `logged` remembers it so untick-and-retick doesn't save it twice — unless the
// entry has since been deleted from History, in which case it is saved again.
function pullupLogSession(st, w, s) {
  var lk = w+"-"+s, prevId = st.logged[lk];
  if (prevId != null && (getWD().workouts||[]).some(function(x){ return x && x.id === prevId; })) return false;
  var exs = pullupSessionExercises(w, s), nSets = 0;
  var exercises = exs.map(function(ex){
    var sets = [];
    for (var i=0; i<ex.sets; i++) sets.push({ target:ex.target });
    nSets += ex.sets;
    return { name:ex.name, sets:sets, notes:ex.id === "test" ? st.test : "" };
  });
  var entry = { id:Date.now(), ts:Date.now(), date:trainTodayStr(), type:'workout',
    sessionName:PULLUP_PLAN.title+" · Week "+(w+1)+" · Session "+(s+1),
    kcal:estimateSessionKcal(4.0, nSets * 1.5), exercises:exercises };
  saveSession(entry);
  st.logged[lk] = entry.id;
  pushPersonal();
  return true;
}
// The result can be typed after the session was saved, so it is copied onto
// that History entry's test exercise too.
function pullupSetTest(v) {
  var st = pullupState();
  st.test = String(v == null ? "" : v).trim().slice(0, 200);
  var id = st.logged[PULLUP_TEST.week+"-"+PULLUP_TEST.session];
  if (id != null) {
    var data = getWD(), hit = false;
    (data.workouts||[]).forEach(function(x){
      if (!x || x.id !== id || !Array.isArray(x.exercises)) return;
      x.exercises.forEach(function(ex){ if (ex && ex.name === PULLUP_TEST.exercise.name) { ex.notes = st.test; hit = true; } });
    });
    if (hit) { saveWD(data); pushPersonal(); }
  }
  pullupSave(st);
}
function pullupReset() {
  confirmDialog("Reset pull-up progress? Every tick and the test result are cleared. Sessions already saved to History stay there.", function(){
    pullupSave({ checks:{}, test:"", logged:{} });
    storeSet("fl4_pullup_open", null);
    SS.puHow = "";
    renderPullupPlan();
    toast("Pull-up progress reset");
  });
}
// Backup restore: additive, like the other restores — a tick in either copy
// survives, a result already typed here is kept, and a saved-session marker
// fills in only where this device has none. Returns how many sets it ticked.
function pullupImport(raw) {
  var inc = pullupNormalise(raw), st = pullupState(), n = 0;
  Object.keys(inc.checks).forEach(function(k){
    var a = st.checks[k] || [], b = inc.checks[k];
    for (var i=0; i<b.length; i++) { if (b[i] && !a[i]) n++; a[i] = !!(a[i] || b[i]); }
    st.checks[k] = a;
  });
  if (!st.test && inc.test) st.test = inc.test;
  Object.keys(inc.logged).forEach(function(k){ if (st.logged[k] == null) st.logged[k] = inc.logged[k]; });
  pullupSave(st);
  return n;
}

// ── Free-form log ─────────────────────────────────────────
function renderWorkoutLog() {
  document.getElementById("workoutDateLabel").textContent = trainFmtDate(workoutDate);
  document.getElementById("nextDayBtn").disabled = workoutDate >= trainTodayStr();
  var workout = getWorkoutForDate(workoutDate);
  var el = document.getElementById("workoutExercises");
  if (!workout || !workout.exercises.length) {
    el.innerHTML = "<div class='train-empty'><div class='train-empty-ico'>&#x1F3CB;</div>" +
      "<div class='train-empty-title'>No exercises yet</div>" +
      "<div class='train-empty-sub'>Type a name above or tap a quick-add chip.</div></div>";
    return;
  }
  var html = "";
  for (var ei=0;ei<workout.exercises.length;ei++) {
    var ex=workout.exercises[ei], vol=0;
    for (var si2=0;si2<ex.sets.length;si2++) vol+=(ex.sets[si2].weight||0)*(ex.sets[si2].reps||0);
    var totalSets = ex.sets.length;
    var volStr = vol>0 ? vol.toLocaleString()+" kg vol" : "";
    // Sets summary pills
    var pillsHtml = "";
    for (var si=0;si<ex.sets.length;si++) {
      var s=ex.sets[si];
      var logged = s.reps > 0;
      pillsHtml += "<div class='set-pill"+(logged?" set-pill-done":"")+"' data-ei='"+esc(ei)+"' data-si='"+esc(si)+"'>" +
        "<div class='set-pill-num'>"+(si+1)+"</div>" +
        (logged
          ? "<div class='set-pill-val'>"+(s.weight>0?s.weight+"kg":""+(s.reps)+" reps")+"</div><div class='set-pill-reps'>"+(s.weight>0?s.reps+" reps":"")+"</div>"
          : "<div class='set-pill-val' style='color:#B8AE9C'>—</div>") +
        "</div>";
    }
    html += "<div class='exercise-card'>" +
      "<div class='ex-header'><div class='ex-num'>"+(ei+1)+"</div><span class='ex-name-txt'>"+esc(ex.name)+"</span>" +
      (volStr?"<span class='ex-vol'>"+volStr+"</span>":"") +
      "<button class='ex-del' data-ei='"+esc(ei)+"' style='margin-left:auto'>&#x2715;</button></div>" +
      "<div class='set-pills-row'>"+pillsHtml+"</div>" +
      "<button class='add-set-btn' data-ei='"+esc(ei)+"'>+ Add set</button></div>";
  }
  el.innerHTML = html;
  wireWorkoutLog();
}

// ── Set sheet state ───────────────────────────────────────
var _ssEi = 0, _ssSi = 0;

function openSetSheet(ei, si) {
  var workout = getWorkoutForDate(workoutDate);
  if (!workout) return;
  var ex = workout.exercises[ei];
  var set = ex.sets[si] || { weight: 0, reps: 0 };
  _ssEi = ei; _ssSi = si;
  document.getElementById("setSheetExName").textContent = ex.name;
  document.getElementById("setSheetSetLabel").textContent = "Set " + (si+1) + " of " + ex.sets.length;
  document.getElementById("setSheetWeight").value = set.weight || 0;
  document.getElementById("setSheetReps").value   = set.reps   || 0;
  document.getElementById("setSheet").style.display = "block";
  document.getElementById("setSheetBackdrop").style.display = "block";
  document.body.style.overflow = "hidden";
  setTimeout(function(){ document.getElementById("setSheetWeight").focus(); }, 100);
}

function closeSetSheet() {
  document.getElementById("setSheet").style.display = "none";
  document.getElementById("setSheetBackdrop").style.display = "none";
  document.body.style.overflow = "";
}

// Wire sheet buttons once — runs after DOM is ready
window.addEventListener("DOMContentLoaded", function() {
  function adj(id, delta) {
    var inp = document.getElementById(id);
    var step = id === "setSheetWeight" ? 0.5 : 1;
    var val = (parseFloat(inp.value) || 0) + delta * step;
    inp.value = Math.max(0, val);
  }
  document.getElementById("setSheetWtMinus").addEventListener("click", function(){ adj("setSheetWeight", -1); });
  document.getElementById("setSheetWtPlus").addEventListener("click",  function(){ adj("setSheetWeight",  1); });
  document.getElementById("setSheetRepMinus").addEventListener("click", function(){ adj("setSheetReps", -1); });
  document.getElementById("setSheetRepPlus").addEventListener("click",  function(){ adj("setSheetReps",  1); });
  document.getElementById("setSheetCancel").addEventListener("click", closeSetSheet);
  document.getElementById("setSheetBackdrop").addEventListener("click", closeSetSheet);
  document.getElementById("setSheetLogBtn").addEventListener("click", function() {
    var wt  = parseFloat(document.getElementById("setSheetWeight").value) || 0;
    var rep = parseInt(document.getElementById("setSheetReps").value)     || 0;
    var data = getWD();
    for (var i=0;i<data.workouts.length;i++) {
      if (data.workouts[i].date===workoutDate) {
        data.workouts[i].exercises[_ssEi].sets[_ssSi] = { weight: wt, reps: rep };
        break;
      }
    }
    saveWD(data);
    closeSetSheet();
    renderWorkoutLog();
    var ex = getWorkoutForDate(workoutDate).exercises[_ssEi];
    toast("&#x2713; " + ex.name + " — set "+(_ssSi+1)+": "+(wt>0?wt+"kg × ":"")+rep+" reps");
  });
});

function wireWorkoutLog() {
  // Set pills → open sheet to edit
  document.querySelectorAll(".set-pill").forEach(function(pill) {
    pill.addEventListener("click", function() {
      openSetSheet(+pill.dataset.ei, +pill.dataset.si);
    });
  });
  // Delete exercise
  document.querySelectorAll(".ex-del").forEach(function(btn) {
    btn.addEventListener("click", function() {
      confirmDialog("Remove " + esc((getWorkoutForDate(workoutDate).exercises[+btn.dataset.ei]||{}).name || "this exercise") + "?", function() {
        var data=getWD();
        for (var i=0;i<data.workouts.length;i++) {
          if (data.workouts[i].date===workoutDate) { data.workouts[i].exercises.splice(+btn.dataset.ei,1); break; }
        }
        saveWD(data); renderWorkoutLog();
      });
    });
  });
  // Add set → open sheet on the new (empty) set
  document.querySelectorAll(".add-set-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var ei = +btn.dataset.ei;
      var data=getWD();
      for (var i=0;i<data.workouts.length;i++) {
        if (data.workouts[i].date===workoutDate) {
          var sets=data.workouts[i].exercises[ei].sets;
          var prev=sets.length?sets[sets.length-1]:{weight:0,reps:0};
          sets.push({weight:prev.weight, reps:0});
          saveWD(data);
          renderWorkoutLog();
          openSetSheet(ei, sets.length-1);
          return;
        }
      }
    });
  });
  renderCardioLog();
}

// ── History ───────────────────────────────────────────────
// A history card opens (v456) to show every set as it was logged plus the
// per-exercise note typed during the session. Everything here is read-only and
// every part of it goes through esc() — workouts arrive from sync and from a
// restored backup, so a name or a note is no more trusted than any other field.
function wktSetText(s) {
  if (!s) return "";
  var parts = [];
  if (+s.reps)     parts.push(s.reps + " rep" + (+s.reps === 1 ? "" : "s"));
  if (+s.weight)   parts.push(s.weight + " kg");
  if (+s.duration) parts.push(s.duration + "s");
  // v482: a Pull-up Plan set is a tick against a target, not a logged number.
  if (!parts.length && s.target) parts.push(s.target + " \u2713");
  return parts.join(" · ");
}

function wktHistoryDetailHTML(w) {
  var meta = [];
  if (w.sessionName) meta.push(esc(w.sessionName));
  if (w.duration)    meta.push(esc(String(w.duration)) + " min");
  if (w.poses)       meta.push(esc(String(w.poses)) + " poses");
  if (w.calories)    meta.push(esc(String(w.calories)) + " kcal");
  else if (w.kcal)   meta.push("~" + esc(String(w.kcal)) + " kcal");

  var rows = "";
  (w.exercises || []).forEach(function(ex) {
    if (!ex) return;
    var sets = ex.sets || [], setHtml = "", vol = 0;
    sets.forEach(function(st, i) {
      var txt = wktSetText(st);
      if (!txt) return;                                  // an unlogged set is left out, not shown as a blank
      vol += (+st.weight || 0) * (+st.reps || 0);
      setHtml += "<div class='whd-set'><span class='whd-set-num'>" + (i+1) + "</span><span>" + esc(txt) + "</span></div>";
    });
    if (!setHtml) setHtml = "<div class='whd-set whd-set-none'>Nothing logged</div>";
    rows += "<div class='whd-ex'>" +
      "<div class='whd-ex-name'><span>" + esc(ex.name || "Exercise") + "</span>" +
        (vol > 0 ? "<span class='whd-ex-vol'>" + vol.toLocaleString() + " kg vol</span>" : "") + "</div>" +
      "<div class='whd-sets'>" + setHtml + "</div>" +
      (ex.notes ? "<div class='whd-note'>" + esc(ex.notes) + "</div>" : "") +
    "</div>";
  });

  if (!rows && !meta.length) return "<div class='whd-meta'>No details recorded.</div>";
  return (meta.length ? "<div class='whd-meta'>" + meta.join(" · ") + "</div>" : "") + rows;
}

function renderWorkoutHistory() {
  var data = getWD(), el = document.getElementById("trainHistoryContent");
  var sessions = (data.workouts||[]).slice();
  // Include cardio entries logged in the action log
  (getActionLog()||[]).forEach(function(e){
    if (e && e.type === "cardio") {
      sessions.push({ id:e.id, date:e.date || (e.ts ? localDatetimeValue(e.ts).slice(0,10) : ""), type:"cardio",
        sessionName:(e.activity||"Cardio"), duration:e.duration, calories:e.calories, _cardio:true });
    }
  });
  sessions.sort(function(a,b){ return (b.date||"").localeCompare(a.date||""); });
  if (!sessions.length) {
    el.innerHTML="<div class='train-empty'><div class='train-empty-ico'>&#x1F4C5;</div><div class='train-empty-title'>No sessions yet</div><div class='train-empty-sub'>Complete a program or free-form log to see history.</div></div>";
    return;
  }
  var html="";
  sessions.forEach(function(w) {
    var icon = w.type==="yoga"?"&#x1F9D8;":w.type==="physio"?"&#x1FAB4;":w.type==="cardio"?"&#x1F3C3;":"&#x1F4AA;";
    var name = (w.sessionName || (w.exercises&&w.exercises.length ? w.exercises[0].name+"..." : "Session")).replace(/&amp;/g,"&");
    var sub  = w.type==="yoga" ? (w.poses||"?")+" poses" :
               w.type==="physio" ? "Physio" :
               w.type==="cardio" ? ((w.duration?w.duration+" min":"")+(w.duration&&w.calories?" · ":"")+(w.calories?w.calories+" kcal":"")) :
               (w.exercises&&w.exercises.length ? w.exercises.length+" exercise"+(w.exercises.length!==1?"s":"") : "");
    if (w.kcal && w.type!=="cardio") sub += (sub?" · ":"") + "~" + w.kcal + " kcal";
    html+="<div class='workout-hist-item' data-wid='"+esc(w.id)+"'>"+
      "<div class='whi-row' style='align-items:center'>"+
        "<div class='whi-date wh-date-edit' data-wid='"+esc(w.id)+"' style='cursor:pointer;text-decoration:underline dotted;flex:1'>"+trainFmtDateLong(w.date)+"</div>"+
        "<button class='wh-del-btn' data-wid='"+esc(w.id)+"' style='border:none;background:none;color:#C06060;font-size:13px;cursor:pointer;opacity:.5;padding:0 4px'>&#x2715;</button>"+
      "</div>"+
      "<div class='whi-row whi-toggle' data-wid='"+esc(w.id)+"'><span>"+icon+" "+esc(name)+"</span>"+
        "<span class='whi-sets'>"+sub+"<span class='whi-chev'>&#x25BC;</span></span></div>"+
      "<div class='whi-detail' data-wid='"+esc(w.id)+"' style='display:none'>"+wktHistoryDetailHTML(w)+"</div>"+
    "</div>";
  });
  el.innerHTML = html;

  // Tap the summary row to open the session (v456). The date span and the delete
  // button sit on their own row, so this never steals either of their taps.
  el.querySelectorAll(".whi-toggle").forEach(function(row) {
    row.addEventListener("click", function() {
      var det = row.parentNode.querySelector(".whi-detail");
      if (!det) return;
      var open = det.style.display === "none";
      det.style.display = open ? "" : "none";
      var chev = row.querySelector(".whi-chev");
      if (chev) chev.innerHTML = open ? "&#x25B2;" : "&#x25BC;";
    });
  });

  // Delete with confirmation
  el.querySelectorAll(".wh-del-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      confirmDialog("Delete this session?", function() {
        var wid = btn.dataset.wid;
        var data = getWD();
        data.workouts = (data.workouts||[]).filter(function(x){ return String(x.id) !== wid; });
        saveWD(data);
        // Also remove from action log if it's a cardio entry
        var al = getActionLog().filter(function(e){ return String(e.id) !== wid; });
        storeSet("fl4_action_log", al);
        pushPersonal(); renderWorkoutHistory();
      });
    });
  });

  // Editable date
  el.querySelectorAll(".wh-date-edit").forEach(function(span) {
    span.addEventListener("click", function() {
      var wid = span.dataset.wid;
      var data = getWD();
      var w = (data.workouts||[]).find(function(x){ return String(x.id) === wid; });
      var isCardio = false;
      if (!w) {
        // Might be a cardio entry in the action log
        w = getActionLog().find(function(x){ return String(x.id) === wid; });
        isCardio = true;
      }
      if (!w) return;
      var existing = span.closest(".workout-hist-item").querySelector(".wh-dt-edit");
      if (existing) { existing.remove(); return; }
      var picker = document.createElement("div");
      picker.className = "wh-dt-edit";
      picker.style.cssText = "display:flex;gap:6px;align-items:center;padding:8px 0;width:100%;box-sizing:border-box";
      picker.innerHTML = "<input type='date' value='"+w.date+"' style='flex:1;border:1.5px solid #D8D0C0;border-radius:7px;padding:8px;font-family:inherit;font-size:13px;background:#FDFAF3;color:#2A2010;outline:none'>" +
        "<button class='_whSave' style='padding:8px 12px;background:#3B6FE0;border:none;border-radius:7px;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>Save</button>" +
        "<button class='_whCancel' style='padding:8px 10px;background:#F0EBE0;border:none;border-radius:7px;color:#8A7A5A;font-family:inherit;font-size:13px;cursor:pointer'>&#x2715;</button>";
      span.closest(".workout-hist-item").appendChild(picker);
      picker.querySelector("._whSave").addEventListener("click", function() {
        var nd = picker.querySelector("input").value;
        if (nd) {
          w.date = nd;
          if (isCardio) {
            var al = getActionLog();
            var ce = al.find(function(x){ return String(x.id) === wid; });
            if (ce) { ce.date = nd; if (ce.ts) ce.ts = new Date(nd+"T12:00:00").getTime(); }
            storeSet("fl4_action_log", al); pushPersonal();
          } else {
            data.workouts.sort(function(a,b){ return b.date.localeCompare(a.date); }); saveWD(data); pushPersonal();
          }
        }
        renderWorkoutHistory();
      });
      picker.querySelector("._whCancel").addEventListener("click", function(){ picker.remove(); });
    });
  });
}

// ── TDEE, weight-loss goal & daily calorie target (v439) ──────────────────
// Combines three things the app already records: the food journal's calories,
// the bodyweight log, and — for context only — the Train section's burn.
//
// THE RULE THIS MUST NEVER BREAK: training calories are NOT added to a
// weight-derived TDEE. A falling weight ALREADY contains every workout that
// helped cause it, so adding the Train kcal on top double-counts them and
// inflates the daily goal by several hundred kcal — you eat at maintenance,
// the app says you are on track, and nothing moves. Training burn is shown
// beside these numbers as context and is deliberately never a term in any
// sum below. Do NOT "improve" this by adding exercise back in.
//
// Two estimates, crossfaded:
//   FORMULA  — Mifflin-St Jeor BMR x an activity multiplier. Works on day one,
//              needs height/year of birth/sex, and is +/-10-15% per person.
//   MEASURED — average intake vs. the actual weight trend over a rolling
//              window. Needs ~2 weeks of logging and is the accurate one,
//              because it is measured from this body, not a population.
// Formula alone below TDEE_BLEND_FROM days of span, measured alone from
// TDEE_BLEND_FULL, linearly blended in between.
var TDEE_KCAL_PER_KG  = 7700;  // energy in 1 kg of body fat
var TDEE_WINDOW_DAYS  = 28;    // rolling window the measured figure reads
var TDEE_BLEND_FROM   = 14;    // measured starts counting at this span
var TDEE_BLEND_FULL   = 28;    // and is trusted on its own from here
var TDEE_MIN_COVERAGE = 0.8;   // share of span days needing a food entry
var TDEE_FLOOR_KCAL   = 1500;  // never propose a daily goal below this
var TDEE_MAX_DEFICIT  = 0.25;  // nor a deficit above this share of TDEE
var TDEE_MIN_PLAUSIBLE = 800;  // a measured figure outside this range is a
var TDEE_MAX_PLAUSIBLE = 6000; // data glitch, not a metabolism — refuse it

var TDEE_ACTIVITY = [
  { v:1.2,   label:"Sedentary",          note:"desk job, little walking" },
  { v:1.375, label:"Lightly active",     note:"light exercise 1-3 days/week" },
  { v:1.55,  label:"Moderately active",  note:"exercise 3-5 days/week" },
  { v:1.725, label:"Very active",        note:"hard exercise 6-7 days/week" }
];
// The activity multiplier is the ONLY place training enters the formula
// estimate, and it is an average of a normal week — never today's log.
var TDEE_RATES = [
  { v:0,    label:"Maintain",    note:"no deficit" },
  { v:0.25, label:"0.25 kg/week", note:"gentle" },
  { v:0.5,  label:"0.5 kg/week",  note:"standard" },
  { v:0.75, label:"0.75 kg/week", note:"aggressive" }
];

function getProfile() {
  var p = storeGet("fl4_profile") || {};
  return {
    sex:       p.sex === "f" ? "f" : (p.sex === "m" ? "m" : ""),
    heightCm:  +p.heightCm  || 0,
    birthYear: +p.birthYear || 0,
    activity:  +p.activity  || 1.375,
    rate:      p.rate == null ? 0.5 : (+p.rate || 0),
    goalKg:    +p.goalKg    || 0
  };
}
function saveProfile(p) { storeSet("fl4_profile", p); storeSet("fl4_profile_ts", Date.now()); pushPersonal(); }

function profileAge(p) {
  var y = (p || getProfile()).birthYear;
  return y ? (new Date().getFullYear() - y) : 0;
}
function profileComplete(p) {
  p = p || getProfile();
  var age = profileAge(p);
  return !!(p.sex && p.heightCm >= 100 && p.heightCm <= 250 && age >= 15 && age <= 100);
}

// Newest logged weight, or 0 when nothing is logged. Deliberately NOT
// latestBodyweightKg(), whose 70 kg default is right for a cardio estimate
// and wrong here — a TDEE built on a guessed weight looks authoritative.
function tdeeCurrentKg() {
  var bw = (getWD().bodyweight || []).filter(function(e){ return e && e.date && +e.weight > 0 && trackPersonOf(e) === "me"; })
    .slice().sort(function(a,b){ return (b.date||"").localeCompare(a.date||""); });
  return bw.length ? +bw[0].weight : 0;
}

// Mifflin-St Jeor (1990) — the resting figure clinical guidelines default to.
function bmrMifflin(p, kg) {
  if (!profileComplete(p) || !(kg > 0)) return 0;
  return Math.round(10 * kg + 6.25 * p.heightCm - 5 * profileAge(p) + (p.sex === "m" ? 5 : -161));
}
function formulaTDEE(p, kg) {
  var b = bmrMifflin(p, kg);
  return b ? Math.round(b * (p.activity || 1.375)) : 0;
}

// Days since epoch for a YYYY-MM-DD string — the x-axis of the weight trend.
function tdeeDayNum(dateStr) {
  var d = new Date(dateStr + "T12:00:00");
  return isNaN(d.getTime()) ? null : Math.round(d.getTime() / 86400000);
}

// Least-squares slope in kg/day. A plain first-minus-last would be at the
// mercy of two water-weight mornings; the regression uses every reading.
function tdeeWeightSlope(points) {
  var n = points.length;
  if (n < 2) return null;
  var sx=0, sy=0, sxx=0, sxy=0;
  for (var i=0; i<n; i++) {
    var x = points[i].x, y = points[i].y;
    sx += x; sy += y; sxx += x*x; sxy += x*y;
  }
  var denom = n*sxx - sx*sx;
  if (!denom) return null;
  return (n*sxy - sx*sy) / denom;
}

function measuredTDEE() {
  var today  = tdeeDayNum(trainTodayStr());
  var cutoff = today - TDEE_WINDOW_DAYS;
  var pts = (getWD().bodyweight || [])
    .filter(function(e){ return e && e.date && +e.weight > 0 && trackPersonOf(e) === "me"; })
    .map(function(e){ return { x: tdeeDayNum(e.date), y: +e.weight }; })
    // >= cutoff, not >: a reading taken exactly TDEE_WINDOW_DAYS ago is the
    // oldest one the window is meant to cover, and dropping it shortened
    // every span by a day and cost the run its earliest weight.
    .filter(function(pt){ return pt.x !== null && pt.x >= cutoff && pt.x <= today; })
    .sort(function(a,b){ return a.x - b.x; });
  if (pts.length < 2) return { ok:false, reason:"weights", days:0, points:pts.length };

  var first = pts[0].x, last = pts[pts.length-1].x, span = last - first;
  if (span < TDEE_BLEND_FROM) return { ok:false, reason:"span", days:span, points:pts.length };

  // Food coverage across the same span. A day with no entry is a day that
  // wasn't logged, never a zero-calorie day — so the average is taken over
  // logged days only, and the whole run is refused if too many are missing.
  var byDate = {};
  getFoodLog().forEach(function(e){
    if (!e || !e.date || trackPersonOf(e) !== "me") return;
    var x = tdeeDayNum(e.date);
    if (x === null || x < first || x > last) return;
    byDate[e.date] = (byDate[e.date] || 0) + (+e.cal || 0);
  });
  var dates = Object.keys(byDate), spanDays = span + 1;
  var coverage = dates.length / spanDays;
  if (coverage < TDEE_MIN_COVERAGE) {
    return { ok:false, reason:"food", days:span, spanDays:spanDays,
             logged:dates.length, coverage:coverage, points:pts.length };
  }

  var total = 0;
  dates.forEach(function(d){ total += byDate[d]; });
  var meanIntake = total / dates.length;

  var slope = tdeeWeightSlope(pts);  // kg/day, negative while losing
  if (slope === null) return { ok:false, reason:"weights", days:span, points:pts.length };

  // Losing weight means the body covered a shortfall: add that back on.
  // Gaining means it banked a surplus: take it off. One line, both cases.
  var tdee = Math.round(meanIntake - slope * TDEE_KCAL_PER_KG);
  if (tdee < TDEE_MIN_PLAUSIBLE || tdee > TDEE_MAX_PLAUSIBLE) {
    return { ok:false, reason:"implausible", days:span, spanDays:spanDays,
             logged:dates.length, coverage:coverage, points:pts.length, raw:tdee };
  }
  return { ok:true, tdee:tdee, days:span, spanDays:spanDays, logged:dates.length,
           coverage:coverage, points:pts.length, intake:Math.round(meanIntake),
           kgPerWeek: Math.round(slope * 7 * 100) / 100 };
}

function blendedTDEE() {
  var p = getProfile(), kg = tdeeCurrentKg();
  var f = formulaTDEE(p, kg);
  var m = measuredTDEE();
  if (!f && !m.ok) return { ok:false, source:"none", formula:0, measured:m, kg:kg };
  if (!m.ok)       return { ok:true, tdee:f,      source:"formula",  weight:0, formula:f, measured:m, kg:kg };
  if (!f)          return { ok:true, tdee:m.tdee, source:"measured", weight:1, formula:0, measured:m, kg:kg };
  var w = (m.days - TDEE_BLEND_FROM) / (TDEE_BLEND_FULL - TDEE_BLEND_FROM);
  w = Math.max(0, Math.min(1, w));
  return { ok:true, tdee: Math.round(f * (1 - w) + m.tdee * w),
           source: w <= 0 ? "formula" : (w >= 1 ? "measured" : "blend"),
           weight:w, formula:f, measured:m, kg:kg };
}

// TDEE minus the deficit the chosen rate implies, through two hard guards:
// never below TDEE_FLOOR_KCAL, and never a deficit above a quarter of TDEE.
// Both are safety limits, not preferences — don't make them configurable.
function tdeeGoal() {
  var t = blendedTDEE();
  if (!t.ok) return { ok:false, detail:t };
  var rate = Math.max(0, getProfile().rate);
  var deficit = rate * TDEE_KCAL_PER_KG / 7;
  var capped = "";
  var maxDef = t.tdee * TDEE_MAX_DEFICIT;
  if (deficit > maxDef) { deficit = maxDef; capped = "pct"; }
  var goal = t.tdee - deficit;
  if (goal < TDEE_FLOOR_KCAL) {
    goal = Math.min(TDEE_FLOOR_KCAL, t.tdee);  // and never a goal above TDEE
    deficit = t.tdee - goal;
    capped = "floor";
  }
  goal = Math.round(goal);
  deficit = Math.round(deficit);
  return { ok:true, tdee:t.tdee, source:t.source, detail:t, goal:goal, deficit:deficit,
           rate:rate, actualRate: Math.round(deficit * 7 / TDEE_KCAL_PER_KG * 100) / 100,
           capped:capped };
}

// Only ever a projection off the CURRENT rate — never a promise, and never
// stored, so it re-reads every time the weight or the rate moves.
function tdeeTargetDate(g) {
  var p = getProfile(), kg = tdeeCurrentKg();
  if (!g || !g.ok || !p.goalKg || !kg || p.goalKg >= kg || g.actualRate <= 0) return null;
  var weeks = (kg - p.goalKg) / g.actualRate;
  if (!isFinite(weeks) || weeks <= 0 || weeks > 520) return null;
  var d = new Date();
  d.setDate(d.getDate() + Math.round(weeks * 7));
  return { weeks: Math.round(weeks), toLose: Math.round((kg - p.goalKg) * 10) / 10,
           label: d.toLocaleDateString("en-IE", { day:"numeric", month:"short", year:"numeric" }) };
}

// Context only — see the double-counting warning at the top of this block.
function tdeeTrainingToday() {
  var today = trainTodayStr(), k = 0;
  (getWD().workouts || []).forEach(function(w){ if (w && w.date === today) k += (+w.kcal || 0); });
  getActionLog().forEach(function(e){ if (e && e.type === "cardio" && e.date === today) k += (+e.calories || 0); });
  return Math.round(k);
}
function tdeeIntakeToday() {
  var today = trainTodayStr();
  return getFoodLog().reduce(function(s,e){ return s + (e && e.date === today && trackPersonOf(e) === "me" ? (+e.cal || 0) : 0); }, 0);
}

function tdeeSourceLine(t) {
  var m = t.measured || {};
  if (t.source === "formula")  return "Estimated from your height, age and activity level.";
  if (t.source === "measured") return "Measured from " + m.days + " days of your own food and weight logs.";
  return "Blending the formula with " + m.days + " days of your own logs.";
}

// Why the measured figure isn't running yet, in Cathal's terms, never a code
// reason — this text is the whole feedback loop for "keep logging".
function tdeeMeasuredWait(m) {
  if (!m || m.ok) return "";
  if (m.reason === "weights") return "Log your weight on at least two days " + TDEE_BLEND_FROM + "+ days apart and this switches to your real numbers.";
  if (m.reason === "span")    return "Your weight log spans " + m.days + " day" + (m.days === 1 ? "" : "s") + " so far — " + TDEE_BLEND_FROM + " days of it and this switches to your real numbers.";
  if (m.reason === "food")    return "Food logged on " + m.logged + " of the last " + m.spanDays + " days — this needs about " + Math.round(TDEE_MIN_COVERAGE * 100) + "% of days to use your real numbers.";
  if (m.reason === "implausible") return "Your logs give an unlikely figure (" + m.raw + " kcal), so the formula is being used instead. Check for a mistyped weight or a huge food entry.";
  return "";
}

function renderTdeeCard() {
  var el = document.getElementById("tdeeCard");
  if (!el) return;
  var p = getProfile(), kg = tdeeCurrentKg(), g = tdeeGoal();
  var h = "<div class='bw-card'>" +
    "<div class='bw-card-title' style='display:flex;align-items:center;gap:8px'>" +
      "<span style='flex:1'>&#x1F525; Daily Calories</span>" +
      "<button id='tdeeEdit' style='padding:5px 10px;background:none;border:1.5px solid #C4A07A;border-radius:7px;color:#A05A10;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;touch-action:manipulation'>" +
        (profileComplete(p) ? "Edit" : "Set up") + "</button>" +
    "</div>";

  if (!g.ok) {
    var need = [];
    if (!kg) need.push("log today&rsquo;s weight above");
    if (!profileComplete(p)) need.push("tap <b>Set up</b> and add your height, year of birth and sex");
    h += "<p style='font-size:13px;color:#6A5A40;line-height:1.55;margin:0 0 10px'>" +
         "To work out what you burn in a day, " + need.join(" and ") + ".</p>" +
         "<p style='font-size:12px;color:#8A7A5A;line-height:1.5;margin:0'>" +
         "After about two weeks of logging food and weight, this stops estimating and starts measuring from your own numbers.</p>";
  } else {
    var eaten = tdeeIntakeToday(), burned = tdeeTrainingToday();
    var left = g.goal - eaten;
    var curGoal = storeGet("fl4_cal_goal") || 2000;
    var tgt = tdeeTargetDate(g);
    var m = g.detail.measured;

    h += "<div style='display:flex;gap:10px;margin-bottom:12px'>" +
      "<div style='flex:1;background:#FBF6EC;border-radius:10px;padding:11px 12px;text-align:center'>" +
        "<div style='font-size:24px;font-weight:700;color:#2A2010;line-height:1.1'>" + g.tdee.toLocaleString() + "</div>" +
        "<div style='font-size:11px;color:#8A7A5A;margin-top:3px'>kcal burned per day</div>" +
      "</div>" +
      "<div style='flex:1;background:#F3F8F3;border-radius:10px;padding:11px 12px;text-align:center'>" +
        "<div style='font-size:24px;font-weight:700;color:#2F6A45;line-height:1.1'>" + g.goal.toLocaleString() + "</div>" +
        "<div style='font-size:11px;color:#6A8A72;margin-top:3px'>kcal to eat per day</div>" +
      "</div>" +
    "</div>";

    h += "<div style='font-size:12px;color:#8A7A5A;line-height:1.5;margin-bottom:10px'>" + tdeeSourceLine(g.detail) + "</div>";

    if (!m.ok) {
      var wait = tdeeMeasuredWait(m);
      if (wait) h += "<div style='font-size:12px;color:#8A7A5A;background:#FBF6EC;border-radius:8px;padding:9px 11px;line-height:1.5;margin-bottom:10px'>" + wait + "</div>";
    } else {
      h += "<div style='font-size:12px;color:#8A7A5A;line-height:1.5;margin-bottom:10px'>" +
        "Averaging " + m.intake.toLocaleString() + " kcal a day over " + m.logged + " logged days, " +
        (m.kgPerWeek < 0 ? "losing " + Math.abs(m.kgPerWeek) + " kg" : m.kgPerWeek > 0 ? "gaining " + m.kgPerWeek + " kg" : "holding steady") +
        (m.kgPerWeek === 0 ? "" : " a week") + "." +
      "</div>";
    }

    // The plan
    h += "<div style='border-top:1px solid #EDE4D4;padding-top:10px;margin-bottom:10px'>";
    if (g.rate <= 0) {
      h += "<div style='font-size:13px;color:#4A3A20'>Set to <b>maintain</b> — eating your full burn.</div>";
    } else {
      h += "<div style='font-size:13px;color:#4A3A20;line-height:1.6'>" +
        "Aiming to lose <b>" + g.actualRate + " kg a week</b> on a " + g.deficit.toLocaleString() + " kcal daily deficit" +
        (kg ? ", from " + kg + " kg" : "") + "." +
        (tgt ? "<br><span style='color:#8A7A5A'>" + tgt.toLose + " kg to go &middot; about " + tgt.weeks + " week" + (tgt.weeks === 1 ? "" : "s") + ", around " + tgt.label + ".</span>" : "") +
      "</div>";
    }
    if (g.capped === "pct") {
      h += "<div style='font-size:12px;color:#A05A10;margin-top:6px;line-height:1.5'>Held back to a quarter of your burn — " + g.rate + " kg a week would be too steep at your size.</div>";
    } else if (g.capped === "floor") {
      h += "<div style='font-size:12px;color:#A05A10;margin-top:6px;line-height:1.5'>Held at the " + TDEE_FLOOR_KCAL.toLocaleString() + " kcal floor — a bigger deficit isn&rsquo;t safe to plan for here.</div>";
    }
    h += "</div>";

    // Today
    h += "<div style='border-top:1px solid #EDE4D4;padding-top:10px'>" +
      "<div style='font-size:13px;color:#4A3A20;line-height:1.6'>" +
        "Today: <b>" + eaten.toLocaleString() + "</b> eaten of " + g.goal.toLocaleString() +
        (left >= 0 ? " &middot; <span style='color:#2F6A45'>" + left.toLocaleString() + " left</span>"
                   : " &middot; <span style='color:#C05A3A'>" + Math.abs(left).toLocaleString() + " over</span>") +
      "</div>";
    if (burned > 0) {
      h += "<div style='font-size:12px;color:#8A7A5A;margin-top:5px;line-height:1.5'>" +
        "&#x1F3CB;&#xFE0F; " + burned.toLocaleString() + " kcal logged in Train today &mdash; already counted in the figures above, so don&rsquo;t eat it back.</div>";
    }
    h += "</div>";

    if (curGoal !== g.goal) {
      h += "<button id='tdeeApply' style='width:100%;margin-top:12px;padding:11px;border:none;background:#A05A10;color:#fff;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>" +
        "Use " + g.goal.toLocaleString() + " as my food goal</button>" +
        "<div style='font-size:11px;color:#A89A80;text-align:center;margin-top:5px'>Food journal goal is " + curGoal.toLocaleString() + " right now</div>";
    } else {
      h += "<div style='font-size:11px;color:#A89A80;text-align:center;margin-top:12px'>&#x2713; Your food journal goal matches this</div>";
    }
  }

  h += "</div>";
  el.innerHTML = h;

  var editBtn = document.getElementById("tdeeEdit");
  if (editBtn) editBtn.addEventListener("click", openTdeeEditor);
  var applyBtn = document.getElementById("tdeeApply");
  if (applyBtn) applyBtn.addEventListener("click", function(){
    var gg = tdeeGoal();
    if (!gg.ok) return;
    setCalGoal(gg.goal);
    pushPersonal();
    renderTdeeCard();
    toast("&#x1F525; Food goal set to " + gg.goal.toLocaleString() + " kcal");
  });
}

function openTdeeEditor() {
  var p = getProfile();
  var ov = document.createElement("div");
  ov.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.55);z-index:700;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;overflow-y:auto";
  var box = document.createElement("div");
  box.style.cssText = "background:#fff;border-radius:14px;padding:20px;width:100%;max-width:340px;max-height:100%;overflow-y:auto;box-sizing:border-box";
  function lbl(t){ return "<div style='font-size:12px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.4px;margin:14px 0 6px'>" + t + "</div>"; }
  var inCss = "width:100%;border:2px solid #E0D0B0;border-radius:9px;padding:10px 12px;font-family:inherit;font-size:15px;outline:none;box-sizing:border-box;background:#fff;color:#2A2010";
  box.innerHTML =
    "<div style='font-family:Georgia,serif;font-size:18px;font-weight:600;color:#2A2010'>Your numbers</div>" +
    "<div style='font-size:12px;color:#8A7A5A;line-height:1.5;margin-top:5px'>Used to estimate your burn until there is enough logging to measure it.</div>" +
    lbl("Sex") +
    "<div style='display:flex;gap:8px'>" +
      "<button class='_tdSex' data-sex='m' style='flex:1;padding:10px;border-radius:9px;font-family:inherit;font-size:14px;cursor:pointer;touch-action:manipulation;" + (p.sex === "m" ? "border:2px solid #A05A10;background:#FBF0E2;color:#7A3A05;font-weight:700" : "border:2px solid #E0D0B0;background:#fff;color:#8A7A5A") + "'>Male</button>" +
      "<button class='_tdSex' data-sex='f' style='flex:1;padding:10px;border-radius:9px;font-family:inherit;font-size:14px;cursor:pointer;touch-action:manipulation;" + (p.sex === "f" ? "border:2px solid #A05A10;background:#FBF0E2;color:#7A3A05;font-weight:700" : "border:2px solid #E0D0B0;background:#fff;color:#8A7A5A") + "'>Female</button>" +
    "</div>" +
    "<div style='font-size:11px;color:#A89A80;margin-top:5px;line-height:1.45'>The Mifflin-St Jeor formula takes one of two values here; it has no third option.</div>" +
    lbl("Height (cm)") +
    "<input id='_tdHeight' type='number' min='100' max='250' inputmode='numeric' value='" + (p.heightCm || "") + "' placeholder='e.g. 178' style='" + inCss + "'>" +
    lbl("Year of birth") +
    "<input id='_tdYear' type='number' min='1900' max='" + (new Date().getFullYear() - 15) + "' inputmode='numeric' value='" + (p.birthYear || "") + "' placeholder='e.g. 1985' style='" + inCss + "'>" +
    lbl("Usual activity") +
    "<select id='_tdAct' style='" + inCss + "'>" +
      TDEE_ACTIVITY.map(function(a){
        return "<option value='" + a.v + "'" + (Math.abs(a.v - p.activity) < 0.001 ? " selected" : "") + ">" + a.label + " &mdash; " + a.note + "</option>";
      }).join("") +
    "</select>" +
    "<div style='font-size:11px;color:#A89A80;margin-top:5px;line-height:1.45'>A normal week, not today. Your logged workouts are already inside this.</div>" +
    lbl("Goal") +
    "<select id='_tdRate' style='" + inCss + "'>" +
      TDEE_RATES.map(function(r){
        return "<option value='" + r.v + "'" + (Math.abs(r.v - p.rate) < 0.001 ? " selected" : "") + ">" + r.label + (r.note ? " &mdash; " + r.note : "") + "</option>";
      }).join("") +
    "</select>" +
    lbl("Target weight (kg, optional)") +
    "<input id='_tdGoalKg' type='number' min='30' max='300' step='0.1' inputmode='decimal' value='" + (p.goalKg || "") + "' placeholder='leave blank for no target' style='" + inCss + "'>" +
    "<div style='display:flex;gap:8px;margin-top:18px'>" +
      "<button id='_tdCancel' style='flex:1;padding:11px;border:1.5px solid #E0D0B0;border-radius:9px;background:none;font-family:inherit;font-size:14px;cursor:pointer;touch-action:manipulation;color:#7A5A30'>Cancel</button>" +
      "<button id='_tdSave' style='flex:1;padding:11px;border:none;background:#A05A10;color:#fff;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>Save</button>" +
    "</div>";
  ov.appendChild(box);
  document.body.appendChild(ov);

  var sex = p.sex;
  box.querySelectorAll("._tdSex").forEach(function(b){
    b.addEventListener("click", function(){
      sex = b.dataset.sex;
      box.querySelectorAll("._tdSex").forEach(function(o){
        var on = o.dataset.sex === sex;
        o.style.border = on ? "2px solid #A05A10" : "2px solid #E0D0B0";
        o.style.background = on ? "#FBF0E2" : "#fff";
        o.style.color = on ? "#7A3A05" : "#8A7A5A";
        o.style.fontWeight = on ? "700" : "400";
      });
    });
  });
  function close(){ if (ov.parentNode) document.body.removeChild(ov); }
  document.getElementById("_tdCancel").addEventListener("click", close);
  ov.addEventListener("click", function(e){ if (e.target === ov) close(); });
  document.getElementById("_tdSave").addEventListener("click", function(){
    var hgt = parseFloat(document.getElementById("_tdHeight").value) || 0;
    var yr  = parseInt(document.getElementById("_tdYear").value, 10) || 0;
    var gkg = parseFloat(document.getElementById("_tdGoalKg").value) || 0;
    var age = yr ? (new Date().getFullYear() - yr) : 0;
    if (!sex) { toast("Pick male or female"); return; }
    if (hgt < 100 || hgt > 250) { toast("Enter a height between 100 and 250 cm"); return; }
    if (age < 15 || age > 100)  { toast("Enter a year of birth for an age of 15-100"); return; }
    if (gkg && (gkg < 30 || gkg > 300)) { toast("Enter a target weight between 30 and 300 kg"); return; }
    saveProfile({
      sex: sex, heightCm: hgt, birthYear: yr,
      activity: parseFloat(document.getElementById("_tdAct").value) || 1.375,
      rate:     parseFloat(document.getElementById("_tdRate").value) || 0,
      goalKg:   gkg
    });
    close();
    renderTdeeCard();
    toast("Saved");
  });
}

// ── Bodyweight log ────────────────────────────────────────
document.getElementById("bwLogBtn").addEventListener("click", function() {
  var val=parseFloat(document.getElementById("bwInput").value);
  if (!val||val<20||val>350) { toast("Enter a valid weight (20–350 kg)"); return; }
  var data=getWD(), today=trainTodayStr();
  data.bodyweight=data.bodyweight||[];
  var found=false;
  for (var i=0;i<data.bodyweight.length;i++) { if (data.bodyweight[i].date===today && trackPersonOf(data.bodyweight[i])===trackPerson()) { data.bodyweight[i].weight=val; found=true; break; } }
  if (!found) data.bodyweight.unshift({date:today,weight:val,person:trackPerson()});
  data.bodyweight.sort(function(a,b){ return b.date.localeCompare(a.date); });
  saveWD(data);
  document.getElementById("bwInput").value="";
  renderBodyView(); toast("Weight logged: "+val+" kg");
});

document.getElementById("bpLogBtn").addEventListener("click", function() {
  var sys = parseInt(document.getElementById("bpSys").value);
  var dia = parseInt(document.getElementById("bpDia").value);
  var pulse = parseInt(document.getElementById("bpPulse").value);
  if (!sys || sys<60 || sys>250)  { toast("Enter a valid systolic (60–250)"); return; }
  if (!dia || dia<40 || dia>150)  { toast("Enter a valid diastolic (40–150)"); return; }
  var data = getWD();
  data.bp = data.bp || [];
  data.bp.unshift({ ts: Date.now(), date: trainTodayStr(), sys: sys, dia: dia, pulse: (pulse||null), person:trackPerson() });
  data.bp.sort(function(a,b){ return (b.ts||0)-(a.ts||0); });
  saveWD(data);
  document.getElementById("bpSys").value="";
  document.getElementById("bpDia").value="";
  document.getElementById("bpPulse").value="";
  renderBodyView();
  toast("BP logged: "+sys+"/"+dia + (pulse?" · "+pulse+" bpm":""));
});

function renderBodyView() {
  if (trackPerson() === "me") renderTdeeCard();
  else document.getElementById("tdeeCard").innerHTML = "";
  var data=getWD(), bw=(data.bodyweight||[]).filter(function(e){ return trackPersonOf(e) === trackPerson(); }).slice().sort(function(a,b){ return b.date.localeCompare(a.date); });
  var bwChartEl=document.getElementById("bwChart");
  if (bwChartEl) bwChartEl.innerHTML = bwChartHtml(bw.slice().reverse());
  var el=document.getElementById("bwHistory");
  if (!bw.length) {
    el.innerHTML="<p style='text-align:center;color:#A89A80;padding:20px;font-size:14px'>No entries yet.</p>";
  } else {
    var html="";
    for (var i=0;i<bw.length;i++) {
      var entry=bw[i];
      var label=listDate(String(entry.date)) || esc(entry.date);
      var diffHtml="";
      if (i<bw.length-1) {
        var diff=entry.weight-bw[i+1].weight;
        if (diff!==0) { var cls=diff>0?"pos":"neg"; diffHtml="<span class='bw-entry-diff "+cls+"'>"+(diff>0?"+":"")+diff.toFixed(1)+"</span>"; }
      }
      html+="<div class='bw-entry'><span class='bw-entry-date bw-date-edit' data-date='"+esc(entry.date)+"' style='cursor:pointer;text-decoration:underline dotted'>"+label+"</span>"+diffHtml+"<span class='bw-entry-val'>"+entry.weight+" kg</span><button class='bw-entry-del' data-date='"+esc(entry.date)+"'>&#x2715;</button></div>";
    }
    el.innerHTML=html;
    el.querySelectorAll(".bw-entry-del").forEach(function(btn) {
      btn.addEventListener("click",function(){
        confirmDialog("Delete this weight entry?", function(){
          var data=getWD(); data.bodyweight=(data.bodyweight||[]).filter(function(e){return e.date!==btn.dataset.date || trackPersonOf(e)!==trackPerson();}); saveWD(data); pushPersonal(); renderBodyView();
        });
      });
    });
  }
  var bpEl = document.getElementById("bpHistory");
  if (bpEl) {
    var bp = (data.bp||[]).filter(function(e){ return trackPersonOf(e) === trackPerson(); }).slice().sort(function(a,b){ return (b.ts||0)-(a.ts||0); });
    var bpChartEl=document.getElementById("bpChart");
    if (bpChartEl) bpChartEl.innerHTML = bpChartHtml(bp.slice().reverse());
    if (!bp.length) {
      bpEl.innerHTML="<p style='text-align:center;color:#A89A80;padding:20px;font-size:14px'>No readings yet.</p>";
    } else {
      var bpHtml="";
      for (var j=0;j<bp.length;j++) {
        var r=bp[j];
        var rlabel=listDate(String(r.date)) || esc(r.date);
        var cat = r.sys>=140||r.dia>=90 ? "#C05A3A" : (r.sys>=130||r.dia>=80 ? "#B08A20" : "#2F8A50");
        bpHtml+="<div class='bw-entry'><span class='bw-entry-date bp-date-edit' data-bpts='"+esc(r.ts)+"' style='cursor:pointer;text-decoration:underline dotted'>"+rlabel+"</span>" +
          "<span class='bw-entry-val' style='color:"+cat+"'>"+r.sys+"/"+r.dia+(r.pulse?" <span style='color:#8A7A5A;font-size:12px'>&middot; "+r.pulse+" bpm</span>":"")+"</span>" +
          "<button class='bw-entry-del' data-bpts='"+esc(r.ts)+"'>&#x2715;</button></div>";
      }
      bpEl.innerHTML=bpHtml;
      bpEl.querySelectorAll(".bw-entry-del").forEach(function(btn) {
        btn.addEventListener("click",function(){
          confirmDialog("Delete this blood pressure reading?", function(){
            var data=getWD(); data.bp=(data.bp||[]).filter(function(e){return String(e.ts)!==btn.dataset.bpts || trackPersonOf(e)!==trackPerson();}); saveWD(data); pushPersonal(); renderBodyView();
          });
        });
      });
    }
  }
  // ── Editable weight dates ──
  document.querySelectorAll(".bw-date-edit").forEach(function(span) {
    span.addEventListener("click", function() {
      var oldDate = span.dataset.date;
      var existing = span.parentElement.parentElement.querySelector(".bw-dt-edit");
      if (existing) { existing.remove(); return; }
      var picker = document.createElement("div");
      picker.className = "bw-dt-edit";
      picker.style.cssText = "display:flex;gap:6px;align-items:center;padding:8px 0;width:100%;box-sizing:border-box";
      picker.innerHTML = "<input type='date' value='"+oldDate+"' style='flex:1;border:1.5px solid #D8D0C0;border-radius:7px;padding:8px;font-family:inherit;font-size:13px;background:#FDFAF3;color:#2A2010;outline:none'>" +
        "<button class='_bwSave' style='padding:8px 12px;background:#3B6FE0;border:none;border-radius:7px;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>Save</button>" +
        "<button class='_bwCancel' style='padding:8px 10px;background:#F0EBE0;border:none;border-radius:7px;color:#8A7A5A;font-family:inherit;font-size:13px;cursor:pointer'>&#x2715;</button>";
      span.parentElement.after(picker);
      picker.querySelector("._bwSave").addEventListener("click", function() {
        var newDate = picker.querySelector("input").value;
        if (!newDate) return;
        var data = getWD();
        var e = (data.bodyweight||[]).find(function(x){ return x.date === oldDate && trackPersonOf(x) === trackPerson(); });
        if (e) {
          var conflict = (data.bodyweight||[]).some(function(x){ return x !== e && x.date === newDate && trackPersonOf(x) === trackPerson(); });
          if (conflict) { toast("A weight is already logged for that day"); return; }
          e.date = newDate; data.bodyweight.sort(function(a,b){ return b.date.localeCompare(a.date); }); saveWD(data); pushPersonal();
        }
        renderBodyView();
      });
      picker.querySelector("._bwCancel").addEventListener("click", function(){ picker.remove(); });
    });
  });
  // ── Editable BP date/time ──
  document.querySelectorAll(".bp-date-edit").forEach(function(span) {
    span.addEventListener("click", function() {
      var ts = +span.dataset.bpts;
      var existing = span.parentElement.parentElement.querySelector(".bp-dt-edit");
      if (existing) { existing.remove(); return; }
      var picker = document.createElement("div");
      picker.className = "bp-dt-edit";
      picker.style.cssText = "display:flex;gap:6px;align-items:center;padding:8px 0;width:100%;box-sizing:border-box";
      picker.innerHTML = "<input type='datetime-local' value='"+localDatetimeValue(ts)+"' style='flex:1;border:1.5px solid #D8D0C0;border-radius:7px;padding:8px;font-family:inherit;font-size:13px;background:#FDFAF3;color:#2A2010;outline:none'>" +
        "<button class='_bpSave' style='padding:8px 12px;background:#3B6FE0;border:none;border-radius:7px;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>Save</button>" +
        "<button class='_bpCancel' style='padding:8px 10px;background:#F0EBE0;border:none;border-radius:7px;color:#8A7A5A;font-family:inherit;font-size:13px;cursor:pointer'>&#x2715;</button>";
      span.parentElement.after(picker);
      picker.querySelector("._bpSave").addEventListener("click", function() {
        var val = picker.querySelector("input").value;
        var newTs = val ? new Date(val).getTime() : ts;
        if (!isNaN(newTs)) {
          var data = getWD();
          var e = (data.bp||[]).find(function(x){ return x.ts === ts && trackPersonOf(x) === trackPerson(); });
          if (e) { e.ts = newTs; e.date = localDatetimeValue(newTs).slice(0,10); data.bp.sort(function(a,b){ return (b.ts||0)-(a.ts||0); }); saveWD(data); pushPersonal(); }
        }
        renderBodyView();
      });
      picker.querySelector("._bpCancel").addEventListener("click", function(){ picker.remove(); });
    });
  });
}

