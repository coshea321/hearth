// ============================================================
// TEMPERATURE (v519) — one tracker, two doors
// ============================================================
// Baby → Temp and Track → Body both render this panel. WHERE a reading is
// stored depends on the person, not on which screen logged it:
//   - "daughter" → fl4_baby.temps (id-keyed, `updated` stamp, fl4_tomb_btemp
//     tombstone; household-synced with the rest of Baby via mergeBabyData).
//     Baby → Temp always shows these, and so does Track → Body when
//     "My daughter" is picked — ONE list, never a second copy.
//   - "me" / "wife" → fl4_workouts.temps (ts-keyed like BP, `person` tag,
//     personal channel only).
// Do NOT let the daughter's readings land in fl4_workouts: the household
// partner would never see them and Baby → Temp would miss them.
//
// The colour bands and the one advice line are informational only — nothing
// here blocks logging or changes any other screen.
var TEMP_METHODS = ["Ear", "Armpit", "Forehead", "Mouth"];
function tempBand(c) {
  if (c >= 38)   return { color:"#C05A3A", label:"High temperature" };
  if (c >= 37.5) return { color:"#B08A20", label:"Slightly raised" };
  return { color:"#2F8A50", label:"Normal" };
}
// All readings for one person, newest first, as { key, ts, temp, method, note }.
function getTempReadings(person) {
  var src = person === "daughter"
    ? getBD().temps
    : (getWD().temps || []).filter(function(e){ return trackPersonOf(e) === person; });
  return (src || []).filter(function(e){ return e && e.ts && typeof e.temp === "number"; })
    .map(function(e){ return { key: person === "daughter" ? e.id : e.ts, ts:e.ts, temp:e.temp, method:e.method||"", note:e.note||"" }; })
    .sort(function(a,b){ return b.ts - a.ts; });
}
function addTempReading(person, ts, temp, method, note) {
  if (person === "daughter") {
    var bd = getBD();
    var id = Date.now();
    while (bd.temps.some(function(t){ return t && t.id === id; })) id++;
    bd.temps.unshift({ id:id, ts:ts, temp:temp, method:method, note:note, updated:Date.now() });
    return saveBD(bd);
  }
  var wd = getWD();
  wd.temps = Array.isArray(wd.temps) ? wd.temps : [];
  while (wd.temps.some(function(t){ return t && t.ts === ts && trackPersonOf(t) === person; })) ts++;
  var rec = { ts:ts, date:localDatetimeValue(ts).slice(0,10), temp:temp, method:method, note:note };
  if (person !== "me") rec.person = person;
  wd.temps.unshift(rec);
  wd.temps.sort(function(a,b){ return (b.ts||0)-(a.ts||0); });
  saveWD(wd); pushPersonal();
  return true;
}
function deleteTempReading(person, key) {
  if (person === "daughter") {
    var bd = getBD(), id = +key;
    addTomb("btemp", id);   // so a partner's copy can't resurrect it
    bd.temps = bd.temps.filter(function(t){ return !t || t.id !== id; });
    saveBD(bd);
    return;
  }
  var wd = getWD();
  wd.temps = (wd.temps || []).filter(function(t){ return !(t && String(t.ts) === String(key) && trackPersonOf(t) === person); });
  saveWD(wd); pushPersonal();
}

function tempChartHtml(readingsDesc) {
  if (readingsDesc.length < 2) {
    return "<div style='padding:14px;text-align:center;color:#B8A8B8;font-size:12px'>Log a couple more readings to see the trend chart</div>";
  }
  var points = readingsDesc.slice().reverse().map(function(r){ return { t:r.ts, v:r.temp }; });
  var W=300, H=140, padL=34, padR=54, padT=12, padB=20;
  var plotW=W-padL-padR, plotH=H-padT-padB;
  var minT=points[0].t, maxT=points[points.length-1].t;
  var vals = points.map(function(p){ return p.v; }).concat([36.5, 38.5]);
  var minV=Math.min.apply(null,vals)-0.3, maxV=Math.max.apply(null,vals)+0.3;
  function xOf(t){ return minT===maxT ? padL+plotW/2 : padL+(t-minT)/(maxT-minT)*plotW; }
  function yOf(v){ return padT+(1-(v-minV)/(maxV-minV))*plotH; }
  var yTop=padT, yBottom=padT+plotH;
  var y38=yOf(38), y375=yOf(37.5);
  var bands = "<rect x='"+padL+"' y='"+yTop+"' width='"+plotW+"' height='"+(y38-yTop).toFixed(1)+"' fill='#FCF0EC'/>" +
    "<rect x='"+padL+"' y='"+y38.toFixed(1)+"' width='"+plotW+"' height='"+(y375-y38).toFixed(1)+"' fill='#FDF6E6'/>" +
    "<rect x='"+padL+"' y='"+y375.toFixed(1)+"' width='"+plotW+"' height='"+(yBottom-y375).toFixed(1)+"' fill='#EDF6E7'/>";
  var labels = [37, 37.5, 38].map(function(v){
    return "<text x='"+(padL-5)+"' y='"+(yOf(v)+3).toFixed(1)+"' font-size='11' fill='#8A8578' text-anchor='end'>"+v.toFixed(1)+"</text>";
  }).join("");
  var linePts = points.map(function(p){ return xOf(p.t).toFixed(1)+","+yOf(p.v).toFixed(1); }).join(" ");
  var lastP = points[points.length-1];
  return "<div style='padding:8px 4px 4px'><svg viewBox='0 0 "+W+" "+H+"' width='100%' height='"+H+"' style='display:block'>" +
    bands + labels +
    "<polyline points='"+linePts+"' fill='none' stroke='#C05A3A' stroke-width='2' stroke-linejoin='round' stroke-linecap='round'/>" +
    chartDots(points, xOf, yOf, "#C05A3A") +
    chartEndLabel(xOf(lastP.t), yOf(lastP.v), yTop, yBottom, lastP.v.toFixed(1)+"°C") +
    chartDateLabels(W, H, padL, padR, minT, maxT) +
  "</svg></div>" +
  "<div style='font-size:11px;color:#8A8578;padding:3px 10px 8px'>Bands: green under 37.5 &middot; amber 37.5&ndash;37.9 &middot; red 38.0 and over</div>";
}

// Builds BOTH cards (log + history) into `container` from scratch.
// `opts.person` is fixed ("daughter") for Baby, or trackPerson() for Body;
// `opts.cardClass`/`titleClass`/`btnClass` pick each screen's own card style;
// `opts.foldKey` (Body only) tags the cards for the collapsible headers.
function renderTempPanel(container, opts) {
  if (!container) return;
  var person = opts.person;
  var readings = getTempReadings(person);
  var p = opts.idPrefix;
  var fold = function(k){ return opts.foldKey ? " data-fold='"+opts.foldKey+k+"'" : ""; };
  var inputCss = "border:1.5px solid #E0DCD4;border-radius:9px;padding:10px 12px;background:#FDFAF3;color:#2A2010;font-family:inherit;font-size:14px;outline:none;width:100%;box-sizing:border-box";
  var methodOpts = "<option value=''>Method (optional)</option>" + TEMP_METHODS.map(function(m){ return "<option value='"+m+"'>"+m+"</option>"; }).join("");
  var html = "<div class='"+opts.cardClass+"'"+fold("log")+">" +
      "<div class='"+opts.titleClass+"'>&#x1F321;&#xFE0F; Log temperature</div>" +
      "<div style='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px'>" +
        "<div style='display:flex;align-items:center;gap:6px'><input id='"+p+"TempVal' type='number' min='34' max='43' step='0.1' inputmode='decimal' placeholder='e.g. 37.8' style='"+inputCss+"'><span style='font-size:14px;color:#8A7A5A;font-weight:700'>&deg;C</span></div>" +
        "<select id='"+p+"TempMethod' style='"+inputCss+"'>"+methodOpts+"</select>" +
      "</div>" +
      "<div style='margin-bottom:8px'><input id='"+p+"TempDt' type='datetime-local' value='"+localDatetimeValue()+"' style='"+inputCss+"'></div>" +
      "<div style='margin-bottom:8px'><input id='"+p+"TempNote' type='text' placeholder='Notes (optional)' autocomplete='off' style='"+inputCss+"'></div>" +
      "<button class='"+opts.btnClass+"' id='"+p+"TempLogBtn'>Log</button>" +
      "<div style='font-size:12px;color:#7A4A18;line-height:1.4;margin-top:10px;padding:8px 10px;background:#FDF0E0;border-radius:8px'>Under 3 months and 38&deg;C or more, or if you&rsquo;re worried &mdash; contact your GP or 112.</div>" +
    "</div>";
  html += "<div class='"+opts.cardClass+"'"+fold("hist")+">" +
    "<div class='"+opts.titleClass+"'>&#x1F4C8; Temperature history</div>";
  if (!readings.length) {
    html += "<p style='text-align:center;color:#A89A80;padding:20px;font-size:14px;margin:0'>No readings yet.</p>";
  } else {
    html += tempChartHtml(readings);
    readings.forEach(function(r){
      var b = tempBand(r.temp);
      var d = new Date(r.ts);
      var when = d.toLocaleDateString("en-IE", { weekday:"short", day:"numeric", month:"short" }) + " " + localDatetimeValue(r.ts).slice(11);
      var sub = [r.method, r.note].filter(Boolean).map(esc).join(" &middot; ");
      html += "<div class='bw-entry'>" +
        "<span class='bw-entry-date' style='display:flex;flex-direction:column;gap:2px'>" + esc(when) +
          (sub ? "<span style='font-size:11px;color:#8A7A5A'>"+sub+"</span>" : "") + "</span>" +
        "<span class='bw-entry-val' style='color:"+b.color+"' title='"+b.label+"'>"+r.temp.toFixed(1)+"&deg;C</span>" +
        "<button class='bw-entry-del temp-del' data-tempkey='"+esc(String(r.key))+"' aria-label='Delete reading'>&#x2715;</button></div>";
    });
  }
  html += "</div>";
  container.innerHTML = html;

  document.getElementById(p+"TempLogBtn").addEventListener("click", function(){
    var v = parseFloat(document.getElementById(p+"TempVal").value);
    if (!(v >= 34 && v <= 43)) { toast("Enter a temperature between 34 and 43 °C"); return; }
    v = Math.round(v * 10) / 10;
    var dtVal = document.getElementById(p+"TempDt").value;
    var ts = dtVal ? new Date(dtVal).getTime() : Date.now();
    if (isNaN(ts)) ts = Date.now();
    var ok = addTempReading(person, ts, v, document.getElementById(p+"TempMethod").value, document.getElementById(p+"TempNote").value.trim());
    if (ok === false) { toast("Couldn't save — storage is full"); return; }
    opts.onChange();
    toast("Temperature logged: " + v.toFixed(1) + " °C");
  });
  container.querySelectorAll(".temp-del").forEach(function(btn){
    btn.addEventListener("click", function(){
      confirmDialog("Delete this temperature reading?", function(){
        deleteTempReading(person, btn.dataset.tempkey);
        opts.onChange();
      });
    });
  });
}

function renderBabyTemp() {
  renderTempPanel(document.getElementById("babyTempView"), {
    person:"daughter", idPrefix:"baby", cardClass:"baby-log-card", titleClass:"baby-card-title", btnClass:"baby-log-btn",
    onChange: renderBabyTemp
  });
}

// ── Collapsible Track → Body cards (v519) ──────────────────────────────
// Every `.bw-card[data-fold]` in #trainBodyView folds when its title is
// tapped. The folded set is per-device (localStorage, never synced): which
// cards one phone hides is a layout preference, not household data.
var BODY_FOLDS_KEY = "hearthBodyFolds";
function getBodyFolds() {
  try { var f = JSON.parse(localStorage.getItem(BODY_FOLDS_KEY) || "{}"); return (f && typeof f === "object") ? f : {}; }
  catch (e) { return {}; }
}
function applyBodyFolds() {
  var folds = getBodyFolds();
  document.querySelectorAll("#trainBodyView .bw-card[data-fold]").forEach(function(card){
    card.classList.toggle("folded", !!folds[card.dataset.fold]);
    var t = card.querySelector(".bw-card-title");
    if (t) { t.setAttribute("role", "button"); t.setAttribute("aria-expanded", folds[card.dataset.fold] ? "false" : "true"); }
  });
}
document.getElementById("trainBodyView").addEventListener("click", function(e){
  var title = e.target.closest(".bw-card-title");
  if (!title) return;
  if (e.target.closest("button, input, select, a")) return;   // controls inside a title keep their own job
  var card = title.closest(".bw-card[data-fold]");
  if (!card || !this.contains(card)) return;
  var folds = getBodyFolds();
  if (folds[card.dataset.fold]) delete folds[card.dataset.fold]; else folds[card.dataset.fold] = 1;
  try { localStorage.setItem(BODY_FOLDS_KEY, JSON.stringify(folds)); } catch (err) {}
  applyBodyFolds();
});
