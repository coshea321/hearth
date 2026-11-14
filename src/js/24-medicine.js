// ── Dose-interval advisory (v291) — ADVISORY ONLY, never a block ──────────
// Standard OTC intervals for the two confirmed products, shown to the user
// rather than silently applied: paracetamol at least 4h between doses / max
// 4 in 24h; ibuprofen at least 6h / max 3 in 24h. Every check reads the
// medicine LOG, so all wording MUST say "logged" — a dose that was given but
// never logged is invisible here, and "last logged 6h ago" must never read
// as permission. Nothing is ever disabled; the strongest intervention is one
// OK/Cancel confirm at log time.
var MED_RULES = [
  { key:"calpol",  label:"Calpol",  match:["calpol","paracetamol","panadol"], gapH:4, max24:4, gapText:"usual gap at least 4h, max 4 doses in 24h" },
  { key:"nurofen", label:"Nurofen", match:["nurofen","ibuprofen"],  gapH:6, max24:3, gapText:"usual gap at least 6h, max 3 doses in 24h" }
];
function medRuleFor(name){
  var n=(name||"").toLowerCase();
  for (var i=0;i<MED_RULES.length;i++){
    for (var j=0;j<MED_RULES[i].match.length;j++){
      if (n.indexOf(MED_RULES[i].match[j])>=0) return MED_RULES[i];
    }
  }
  return null;
}
function medLastFor(rule){
  var meds=(getBD().medicine||[]), last=null;
  meds.forEach(function(m){
    var r = (m && m.ts) ? medRuleFor(m.name) : null;
    if (r && r.key===rule.key && (!last || m.ts>last.ts)) last=m;
  });
  return last;
}
// Nearest logged dose of the same medicine to refTs (absolute distance, so a
// backfilled entry checks against neighbours on BOTH sides), plus the count
// in the 24h window ending at refTs.
function medHistoryFor(rule, refTs){
  var meds=(getBD().medicine||[]), nearest=null, nearestGapMs=Infinity, count24=0;
  meds.forEach(function(m){
    if (!m || !m.ts) return;
    var r=medRuleFor(m.name);
    if (!r || r.key!==rule.key) return;
    var gap=Math.abs(refTs-m.ts);
    if (gap<nearestGapMs){ nearestGapMs=gap; nearest=m; }
    if (m.ts<=refTs && (refTs-m.ts) < 24*3600*1000) count24++;
  });
  return { nearest:nearest, nearestGapMs:nearestGapMs, count24:count24 };
}
function medAgoStr(ms){
  var mins=Math.floor(ms/60000), h=Math.floor(mins/60), m2=mins%60;
  if (mins<1) return "just now";
  if (h<=0) return m2+"m ago";
  return h+"h"+(m2? " "+m2+"m":"")+" ago";
}

// ── Bottle freshness (v346) — ADVISORY ONLY, never a block ────────────────
// Product/inventory layer on top of the dose log: tracks when a bottle was
// opened so the app can flag when it's likely no longer good. The "use
// within N days" window is a REMINDER THE USER SETS, never an authoritative
// manufacturer/leaflet figure — always paired with "check the leaflet".
// Does not read/write MED_RULES, dosing chips, formulas or strengths.
// Fixed products use the SAME keys as MED_RULES ("calpol"/"nurofen") so the
// dose-log advisory below can cross-reference bd.bottles[rule.key]. No
// tombstones in v1 (see HEARTH-notes) — "New bottle" reset is the common
// op, not delete, so a resurrect-from-stale-copy risk is accepted.
function bottleFreshness(b) {
  var windowMs = (b.useWithinDays||0)*86400000;
  var discardTs = (b.openedTs||0) + windowMs;
  var dueLeadMs = Math.min(14*24*3600*1000, windowMs*0.25);
  var now = Date.now(), status;
  if (now >= discardTs) status = "past";
  else if (now >= discardTs - dueLeadMs) status = "due";
  else status = "fresh";
  return { discardTs: discardTs, status: status };
}
function fmtBottleDate(ts) {
  var d = new Date(ts), monA=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return d.getDate()+" "+monA[d.getMonth()];
}
var BOTTLE_STATUS_META = {
  fresh: { color:"#2E8B57", label:"fresh" },
  due:   { color:"#C08A20", label:"due soon" },
  past:  { color:"#C03030", label:"past" }
};
function bottleRowHtml(key, name, bd) {
  var b = (bd.bottles||{})[key];
  if (!b) {
    return "<div class='bottle-row' style='display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;margin:0 0 6px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06)'>"+
      "<div style='flex:1;font-size:14px;font-weight:600;color:#2A2010'>"+esc(name)+" &#8212; <span style='font-weight:400;color:#8A6A8A'>not tracking</span></div>"+
      "<button type='button' class='bottle-mark-opened' data-key='"+esc(key)+"' data-name='"+esc(name)+"' style='border:1.5px solid #9333ea30;background:#F3EAFA;color:#7E22CE;border-radius:8px;padding:8px 12px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer'>Mark opened</button>"+
    "</div>";
  }
  var fr = bottleFreshness(b), meta = BOTTLE_STATUS_META[fr.status];
  return "<div class='bottle-row' data-key='"+esc(key)+"' style='padding:10px 14px;background:#fff;margin:0 0 6px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06)'>"+
    "<div style='display:flex;align-items:center;gap:8px;margin-bottom:4px'>"+
      "<span style='width:8px;height:8px;border-radius:50%;background:"+meta.color+";display:inline-block;flex-shrink:0'></span>"+
      "<span style='flex:1;font-size:14px;font-weight:600;color:#2A2010'>"+esc(b.name||name)+"</span>"+
      "<span style='font-size:12px;font-weight:700;color:"+meta.color+"'>"+meta.label+"</span>"+
    "</div>"+
    "<div style='font-size:12px;color:#8A6A8A;margin-bottom:8px'>Opened "+fmtBottleDate(b.openedTs)+" &middot; use within "+(b.useWithinDays||0)+" days (your reminder &#8212; check the leaflet) &middot; discard after "+fmtBottleDate(fr.discardTs)+"</div>"+
    "<div class='bottle-controls' style='display:flex;flex-wrap:wrap;gap:6px'>"+
      "<button type='button' class='bottle-new' data-key='"+esc(key)+"' style='border:1.5px solid #9333ea30;background:#F3EAFA;color:#7E22CE;border-radius:8px;padding:7px 11px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer'>New bottle</button>"+
      "<button type='button' class='bottle-edit-trigger' data-key='"+esc(key)+"' style='border:1.5px solid #E0DCD4;background:#F6F2FA;color:#7A5A7A;border-radius:8px;padding:7px 11px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer'>Edit</button>"+
      "<button type='button' class='bottle-remove' data-key='"+esc(key)+"' style='border:none;background:none;color:#C06060;font-size:13px;cursor:pointer;padding:7px 6px;opacity:.6'>&#x2715; remove</button>"+
    "</div></div>";
}
function bottleFreshnessCardHtml(bd) {
  var fixed = MED_RULES.map(function(r){ return { key:r.key, name:r.label }; }); // calpol/nurofen — same keys as MED_RULES
  var html = "<div class='baby-log-card'><div class='baby-card-title'>&#x1F9EA; Bottle freshness</div>";
  fixed.forEach(function(f){ html += bottleRowHtml(f.key, f.name, bd); });
  Object.keys(bd.bottles||{}).forEach(function(k){
    if (fixed.some(function(f){ return f.key===k; })) return;
    html += bottleRowHtml(k, bd.bottles[k].name || "Bottle", bd);
  });
  html += "<button type='button' id='bottleAddNew' style='width:100%;margin-top:2px;border:1.5px dashed #D8C8E8;background:none;color:#7E22CE;border-radius:8px;padding:9px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer'>+ Add another bottle</button>"+
    "</div>";
  return html;
}
// Custom name+window overlay for a new free-form bottle (prompt() is blocked
// in sandboxed iframes — same pattern as the "Name this meal" overlay).
function openAddBottleOverlay(onSave) {
  var ov = document.createElement("div");
  ov.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.55);z-index:700;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box";
  var box = document.createElement("div");
  box.style.cssText = "background:#fff;border-radius:14px;padding:20px;width:100%;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,.2)";
  box.innerHTML =
    "<div style='font-family:Georgia,serif;font-size:18px;font-weight:600;color:#2A2010;margin-bottom:12px'>Add another bottle</div>" +
    "<input id='_bNameInput' type='text' placeholder='e.g. Amoxicillin' class='med-input' style='margin-bottom:8px'>" +
    "<div style='display:flex;align-items:center;gap:8px;margin-bottom:6px'><label style='font-size:13px;color:#7A5A7A'>Use within</label><input id='_bWindowInput' type='number' min='1' value='90' class='med-input' style='width:70px'><span style='font-size:13px;color:#7A5A7A'>days</span></div>"+
    "<div style='font-size:11px;color:#B8A8B8;margin-bottom:12px'>Your reminder &#8212; check the leaflet for the real figure.</div>"+
    "<div style='display:flex;gap:8px'>" +
      "<button id='_bCancel' style='flex:1;padding:11px;border:1.5px solid #E0D0B0;border-radius:9px;background:none;font-family:inherit;font-size:14px;cursor:pointer;touch-action:manipulation;color:#7A5A30'>Cancel</button>" +
      "<button id='_bSave' style='flex:1;padding:11px;border:none;background:#9333ea;color:#fff;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>Save</button>" +
    "</div>";
  ov.appendChild(box);
  document.body.appendChild(ov);
  var inp = document.getElementById("_bNameInput");
  setTimeout(function(){ inp.focus(); }, 60);
  function doSave() {
    var name = inp.value.trim();
    if (!name) { toast("Enter a name"); return; }
    var days = +document.getElementById("_bWindowInput").value;
    if (!(days > 0)) days = 90;
    document.body.removeChild(ov);
    onSave(name, days);
  }
  document.getElementById("_bSave").addEventListener("click", doSave);
  document.getElementById("_bCancel").addEventListener("click", function(){ document.body.removeChild(ov); });
  inp.addEventListener("keydown", function(e){ if (e.key === "Enter") doSave(); });
}

// v458: true when the Log-medicine form is on screen holding something he
// typed but has not logged yet. medTime is deliberately EXCLUDED — it is
// pre-filled with "now" on every render, so counting it would make the form
// permanently dirty and Baby would never refresh from sync at all.
function medDraftOpen() {
  if (currentBabyView !== "medicine") return false;
  return ["medName","medDose","medNotes"].some(function(id){
    var el = document.getElementById(id);
    return !!(el && el.value.trim());
  });
}

function medNewestFirst(a,b) {
  return (b.ts||0)-(a.ts||0) || (b.id||0)-(a.id||0);
}

function renderMedicine() {
  var bd = getBD();
  // Show the administration chronology, not the order records were created.
  // A backfilled or corrected time can disagree with the id indefinitely.
  var meds = (bd.medicine||[]).slice().sort(medNewestFirst);
  var el = document.getElementById("babyMedicineView");
  var now3=new Date(), p3=function(x){return x<10?"0"+x:""+x;};
  var dtStr=now3.getFullYear()+"-"+p3(now3.getMonth()+1)+"-"+p3(now3.getDate())+"T"+p3(now3.getHours())+":"+p3(now3.getMinutes());
  // Always-visible last-logged summary per medicine (v291) — neutral when
  // fine, amber when inside the minimum gap or at the 24h maximum
  var intervalHtml = "";
  MED_RULES.forEach(function(rule){
    var last = medLastFor(rule);
    if (!last) return;
    var hist = medHistoryFor(rule, Date.now());
    var gapMs = Date.now() - last.ts;
    var warn = (gapMs >= 0 && gapMs < rule.gapH*3600*1000) || (hist.count24 >= rule.max24);
    var t = new Date(last.ts).toLocaleTimeString("en-IE",{hour:"2-digit",minute:"2-digit"});
    var line = "Last logged "+rule.label+": "+medAgoStr(gapMs)+" ("+t+(last.dose?", "+esc(last.dose):"")+")";
    if (hist.count24 >= 2 || warn) line += " &#183; "+hist.count24+" dose"+(hist.count24!==1?"s":"")+" in 24h";
    line += " &#8212; "+rule.gapText+".";
    if (warn) line += " Based only on logged doses &#8212; check the leaflet.";
    intervalHtml += "<div style='font-size:13px;line-height:1.45;padding:8px 11px;border-radius:9px;margin-bottom:6px;"+
      (warn ? "background:#FDF0E0;color:#9A5A10;border:1px solid #E8C89A;font-weight:600" : "background:#F6F2FA;color:#7A5A7A")+
      "'>"+(warn?"&#x26A0;&#xFE0F; ":"")+line+"</div>";
  });
  // v470: Log medicine leads, bottle freshness follows. At 2am the job is
  // logging a dose; bottle tracking is useful but not the first slot.
  var html = "<div class='baby-log-card'><div class='baby-card-title'>&#x1F48A; Log medicine</div>" +
    intervalHtml +
    "<div class='med-quick-chips' style='display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px'>" +
      "<button type='button' class='med-chip' data-med='Calpol' data-conc='Calpol Infant 120mg/5ml' data-mgkg='15' data-mg5='120' data-floor='0' data-cap='10' style='border:1.5px solid #9333ea30;background:#F3EAFA;color:#7E22CE;border-radius:16px;padding:11px 16px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation'>Calpol</button>" +
      "<button type='button' class='med-chip' data-med='Nurofen' data-conc='Nurofen for Children 100mg/5ml' data-mgkg='10' data-mg5='100' data-floor='5' data-cap='10' style='border:1.5px solid #9333ea30;background:#F3EAFA;color:#7E22CE;border-radius:16px;padding:11px 16px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation'>Nurofen</button>" +
      "<button type='button' class='med-chip' data-med='Antibiotic' data-mgkg='' data-fallback='' style='border:1.5px solid #9333ea30;background:#F3EAFA;color:#7E22CE;border-radius:16px;padding:11px 16px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation'>Antibiotic</button>" +
    "</div>" +
    "<div style='font-size:13px;line-height:1.45;color:#6A4A6A;margin:-2px 0 8px'>Tap Calpol or Nurofen for a weight-based estimate &mdash; then check the leaflet.</div>" +
    "<input id='medName' type='text' class='med-input' placeholder='Medicine name' autocomplete='off' style='margin-bottom:6px'>" +
    "<div style='display:flex;gap:8px;margin-bottom:6px'><input id='medDose' type='text' class='med-input' style='flex:1' placeholder='Dose'><input id='medTime' type='datetime-local' class='med-input' style='flex:1' value='"+dtStr+"'></div>" +
    "<div id='medDoseNote' style='font-size:14px;line-height:1.45;color:#5A3A5A;margin:-2px 0 6px;min-height:0'></div>" +
    "<input id='medNotes' type='text' class='med-input' placeholder='Notes (optional)' style='margin-bottom:6px'>" +
    "<div id='medSaveErr' style='display:none;font-size:15px;line-height:1.45;padding:8px 11px;border-radius:9px;margin-bottom:6px;background:#FDECEC;color:#9A2020;border:1px solid #E8A0A0;font-weight:600'></div>" +
    "<button class='baby-log-btn' id='medLogBtn'>Log</button></div>" +
    bottleFreshnessCardHtml(bd);
  if (meds.length) {
    meds.forEach(function(m){
      var tStr=m.ts?new Date(m.ts).toLocaleTimeString("en-IE",{hour:"2-digit",minute:"2-digit"}):"";
      var dStr=m.ts?listDate(m.ts):"";
      html+="<div class='med-row' style='display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;margin:0 12px 5px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.07)'><div style='flex:1'><div style='font-size:14px;font-weight:600;color:#2A2010'>"+esc(m.name||"")+(m.dose?" — "+esc(m.dose):"")+"</div>"+(m.notes?"<div style='font-size:12px;color:#8A6A8A'>"+esc(m.notes)+"</div>":"")+(tStr?"<div class='med-dt-edit-trigger' data-medid='"+esc(m.id)+"' style='font-size:11px;color:#B8A880;cursor:pointer;text-decoration:underline dotted'>"+dStr+" "+tStr+"</div>":"")+"</div><button data-medid='"+esc(m.id)+"' class='med-del-btn' style='border:none;background:none;color:#C06060;font-size:14px;cursor:pointer;touch-action:manipulation;opacity:.45'>&#x2715;</button></div>";
    });
  } else {
    html+="<div style='text-align:center;padding:32px;color:#8A6A8A;font-size:14px'>No medicine logged yet</div>";
  }
  el.innerHTML=html;
  document.getElementById("medLogBtn").addEventListener("click",function(){
    var name=document.getElementById("medName").value.trim();
    if(!name){toast("Enter a medicine name");return;}
    var time=document.getElementById("medTime").value;
    var ts=time?new Date(time).getTime():Date.now();
    if (isNaN(ts)) ts=Date.now();
    function doLog(){
      var bd2=getBD(); bd2.medicine=bd2.medicine||[];
      bd2.medicine.unshift({id:Date.now(),name:name,dose:document.getElementById("medDose").value.trim(),notes:document.getElementById("medNotes").value.trim(),ts:ts,updated:Date.now()});
      // v459: never announce a dose as logged unless it actually persisted.
      // On failure keep every field exactly as typed and do NOT re-render --
      // re-rendering would rebuild the form and destroy the entry we just
      // failed to save. The message is persistent, not a toast: a toast is
      // what failed the parent here, and it disappears in 2.2 seconds.
      // v479: the limit is Hearth's own browser quota, NOT the phone's free
      // space -- clearing phone storage does not help, so the message must not
      // send him there. Plant photos (plantShrinkPhoto, stored inline as
      // base64) are the only large thing Hearth keeps, so they are the lever.
      if (!saveBD(bd2)) {
        var errEl=document.getElementById("medSaveErr");
        if(errEl){ errEl.textContent="NOT logged \u2014 Hearth's own storage is full, so this dose was not saved. Write it down now. To make room, remove some plant photos, then tap Log again."; errEl.style.display=""; }
        else toast("Not logged &#8212; storage full");
        return;
      }
      document.getElementById("medName").value="";document.getElementById("medDose").value="";document.getElementById("medNotes").value="";
      renderMedicine(); toast("&#x1F48A; Logged");
    }
    // Interval speed-bump (v291): one OK/Cancel when the numbers look wrong —
    // never a block. Checked against the ENTERED time, so backfilling an old
    // dose compares to its own neighbours, not to "now".
    var rule=medRuleFor(name), warnMsg="";
    if (rule){
      var hist=medHistoryFor(rule, ts);
      if (hist.nearest && hist.nearestGapMs < rule.gapH*3600*1000){
        warnMsg="There's a "+rule.label+" dose logged only "+medAgoStr(hist.nearestGapMs).replace(" ago","")+" from this one &#8212; "+rule.gapText+".";
      } else if (hist.count24 >= rule.max24){
        warnMsg=hist.count24+" "+rule.label+" dose"+(hist.count24!==1?"s":"")+" already logged in the 24h before this time &#8212; the usual maximum is "+rule.max24+".";
      }
      // v346: bottle-freshness cross-check — advisory only, combines with any interval warning above.
      var bottle = (getBD().bottles||{})[rule.key];
      if (bottle) {
        var fr = bottleFreshness(bottle);
        if (ts >= fr.discardTs) {
          var bMsg = "The "+rule.label+" bottle you're tracking was opened on "+fmtBottleDate(bottle.openedTs)+" &#8212; past the \"use within "+bottle.useWithinDays+" days\" you set. Check the leaflet.";
          warnMsg = warnMsg ? (warnMsg+" "+bMsg) : bMsg;
        }
      }
    }
    if (warnMsg){
      confirmDialog("&#x26A0;&#xFE0F; "+warnMsg+" This is based only on logged doses. Check the leaflet or your GP if unsure. Log anyway?", doLog);
    } else {
      doLog();
    }
  });
  el.querySelectorAll(".med-chip").forEach(function(chip){
    chip.addEventListener("click",function(){
      var d=chip.dataset;
      document.getElementById("medName").value=d.med||"";
      var doseEl=document.getElementById("medDose"), noteEl=document.getElementById("medDoseNote");
      var dose="", note="";
      if(d.mgkg){
        var mgkg=parseFloat(d.mgkg), mg5=parseFloat(d.mg5), floor=parseFloat(d.floor||"0"), cap=parseFloat(d.cap||"99");
        var wr=latestBabyWeightRec(), w=wr?wr.weight:null;
        // v291: show WHEN the weight was logged so a stale weight is self-evident
        var wDate="";
        if(wr && wr.date){
          var dp=String(wr.date).split("-"), monA=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          if(dp.length===3 && monA[+dp[1]-1]) wDate=" (logged "+(+dp[2])+" "+monA[+dp[1]-1]+")";
        }
        if(w==null){
          // v459: was prefilling data-fallback (5ml Calpol / 2.5ml Nurofen) and
          // calling it "standard infant dose". Two problems, both from the v457
          // council review: it presented a guess as a calculated dose, and it
          // returned BEFORE the floor check below, so Nurofen was suggested
          // without ever testing the under-5kg block. No weight now means no
          // suggested number at all -- typing a dose by hand is untouched.
          dose="";
          note="No weight logged, so there's no weight-based estimate. Add a weight in Growth, or enter the dose from the leaflet yourself"+(floor?". "+d.med+" also needs a weight to check the "+floor+"kg minimum":"")+" - check the leaflet.";
        } else if(floor && w<floor){
          dose="";
          note="Note: "+w+"kg"+wDate+" is under "+floor+"kg. "+d.med+" is not advised at this weight - check your GP or pharmacist.";
        } else {
          var ml=Math.floor((w*mgkg*5/mg5)*4)/4, capped=false;
          if(ml>cap){ ml=cap; capped=true; }
          dose=ml+"ml";
          note=d.conc+" | "+w+"kg"+wDate+" x "+mgkg+"mg/kg ~ "+ml+"ml"+(capped?" (capped)":"")+" | estimate only, check the leaflet.";
        }
      } else {
        dose=d.fallback||"";
        note="Dose as prescribed on the bottle.";
      }
      doseEl.value=dose;
      if(noteEl) noteEl.textContent=note;
      doseEl.focus(); doseEl.select&&doseEl.select();
    });
  });
  el.querySelectorAll(".med-del-btn").forEach(function(btn){
    btn.addEventListener("click",function(){ confirmDialog("Delete this medicine entry?", function(){ var mid=+btn.dataset.medid; addTomb("med", mid); var bd2=getBD(); bd2.medicine=bd2.medicine.filter(function(m){return m.id!==mid;}); saveBD(bd2); renderMedicine(); }); });
  });
  el.querySelectorAll(".med-dt-edit-trigger").forEach(function(span){
    span.addEventListener("click", function(){
      var id = +span.dataset.medid;
      var bd2 = getBD();
      var m = (bd2.medicine||[]).find(function(x){ return x.id===id; });
      if (!m) return;
      var existing = span.closest(".med-row").querySelector(".med-dt-edit");
      if (existing) { existing.remove(); return; }
      var picker = document.createElement("div");
      picker.className = "med-dt-edit";
      picker.style.cssText = "display:flex;gap:6px;align-items:center;padding:8px 0;width:100%;box-sizing:border-box";
      picker.innerHTML = "<input type='datetime-local' value='"+localDatetimeValue(m.ts)+"' class='med-input' style='flex:1'>" +
        "<button class='_mSave baby-log-btn' style='width:auto;padding:8px 12px;margin:0'>Save</button>" +
        "<button class='_mCancel' style='padding:8px 10px;background:#F0EBF8;border:none;border-radius:7px;color:#8A6A8A;font-family:inherit;font-size:13px;cursor:pointer'>&#x2715;</button>";
      span.closest(".med-row").appendChild(picker);
      picker.querySelector("._mSave").addEventListener("click", function(){
        var val = picker.querySelector("input").value;
        var newTs = val ? new Date(val).getTime() : m.ts;
        if (!isNaN(newTs)) {
          m.ts = newTs; m.updated = Date.now(); bd2.medicine.sort(medNewestFirst);
          saveBD(bd2);
        }
        renderMedicine();
      });
      picker.querySelector("._mCancel").addEventListener("click", function(){ picker.remove(); });
    });
  });
  // ── Bottle freshness controls (v346) ──────────────────────────────────
  el.querySelectorAll(".bottle-mark-opened").forEach(function(btn){
    btn.addEventListener("click", function(){
      var key = btn.dataset.key, name = btn.dataset.name;
      var bd2 = getBD();
      bd2.bottles[key] = { key:key, name:name, openedTs:Date.now(), useWithinDays:90, updated:Date.now() };
      saveBD(bd2); renderMedicine();
    });
  });
  el.querySelectorAll(".bottle-new").forEach(function(btn){
    btn.addEventListener("click", function(){
      var key = btn.dataset.key;
      confirmDialog("Start a new bottle? This resets the opened date to today.", function(){
        var bd2 = getBD(), b = bd2.bottles[key];
        if (!b) return;
        b.openedTs = Date.now(); b.updated = Date.now();
        saveBD(bd2); renderMedicine();
      });
    });
  });
  el.querySelectorAll(".bottle-remove").forEach(function(btn){
    btn.addEventListener("click", function(){
      var key = btn.dataset.key;
      confirmDialog("Stop tracking this bottle?", function(){
        var bd2 = getBD();
        delete bd2.bottles[key];
        saveBD(bd2); renderMedicine();
      });
    });
  });
  el.querySelectorAll(".bottle-edit-trigger").forEach(function(btn){
    btn.addEventListener("click", function(){
      var key = btn.dataset.key, bd2 = getBD(), b = bd2.bottles[key];
      if (!b) return;
      var row = btn.closest(".bottle-row");
      var existing = row.querySelector(".bottle-edit");
      if (existing) { existing.remove(); return; }
      var picker = document.createElement("div");
      picker.className = "bottle-edit";
      picker.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 0 0;width:100%;box-sizing:border-box";
      picker.innerHTML = "<input type='date' class='med-input _bOpenedDate' style='flex:1;min-width:120px' value='"+localDatetimeValue(b.openedTs).slice(0,10)+"'>" +
        "<input type='number' class='med-input _bWindowDays' style='width:70px' min='1' value='"+(b.useWithinDays||90)+"'><span style='font-size:12px;color:#8A6A8A'>days</span>" +
        "<button class='_bEditSave baby-log-btn' style='width:auto;padding:8px 12px;margin:0'>Save</button>" +
        "<button class='_bEditCancel' style='padding:8px 10px;background:#F0EBF8;border:none;border-radius:7px;color:#8A6A8A;font-family:inherit;font-size:13px;cursor:pointer'>&#x2715;</button>";
      row.appendChild(picker);
      picker.querySelector("._bEditSave").addEventListener("click", function(){
        var dVal = picker.querySelector("._bOpenedDate").value;
        var newTs = dVal ? new Date(dVal+"T00:00").getTime() : b.openedTs;
        var days = +picker.querySelector("._bWindowDays").value;
        if (!isNaN(newTs)) b.openedTs = newTs;
        if (days > 0) b.useWithinDays = days;
        b.updated = Date.now();
        saveBD(bd2); renderMedicine();
      });
      picker.querySelector("._bEditCancel").addEventListener("click", function(){ picker.remove(); });
    });
  });
  var bottleAddBtn = document.getElementById("bottleAddNew");
  if (bottleAddBtn) bottleAddBtn.addEventListener("click", function(){
    openAddBottleOverlay(function(name, days){
      var key = "b" + Date.now(), bd2 = getBD();
      bd2.bottles[key] = { key:key, name:name, openedTs:Date.now(), useWithinDays:days, updated:Date.now() };
      saveBD(bd2); renderMedicine();
    });
  });
}

