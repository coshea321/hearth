function renderMilestones() {
  var bd=getBD();
  var ms=(bd.milestones||[]).slice().sort(function(a,b){return b.id-a.id;});
  var el=document.getElementById("babyMilestonesView");
  var now4=new Date(), p4=function(x){return x<10?"0"+x:""+x;};
  var html="<div class='baby-log-card'><div class='baby-card-title'>&#x2B50; Log milestone</div>" +
    "<input id='msText' type='text' class='med-input' placeholder='e.g. First smile…' autocomplete='off' style='margin-bottom:6px'>" +
    "<input id='msDate' type='date' class='med-input' value='"+now4.getFullYear()+"-"+p4(now4.getMonth()+1)+"-"+p4(now4.getDate())+"'>" +
    "<button class='baby-log-btn' id='msLogBtn'>Log</button></div>";
  if(ms.length){
    ms.forEach(function(m){
      html+="<div class='ms-row' style='display:flex;align-items:center;gap:10px;padding:12px 14px;background:#fff;margin:0 12px 6px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.07)'><span style='font-size:22px'>&#x2B50;</span><div style='flex:1'><div style='font-size:14px;font-weight:600;color:#2A2010'>"+esc(m.text||"")+"</div>"+(m.date?"<div class='ms-date-edit' data-msid='"+esc(m.id)+"' style='font-size:12px;color:#B8A880;cursor:pointer;text-decoration:underline dotted'>"+(listDate(String(m.date))||esc(m.date))+"</div>":"")+"</div><button data-msid='"+esc(m.id)+"' class='ms-del-btn' style='border:none;background:none;color:#C06060;font-size:14px;cursor:pointer;touch-action:manipulation;opacity:.45'>&#x2715;</button></div>";
    });
  } else {
    html+="<div style='text-align:center;padding:32px;color:#8A6A8A;font-size:14px'>No milestones yet</div>";
  }
  el.innerHTML=html;
  document.getElementById("msLogBtn").addEventListener("click",function(){
    var text=document.getElementById("msText").value.trim();
    if(!text){toast("Enter a milestone");return;}
    var bd2=getBD(); bd2.milestones=bd2.milestones||[];
    bd2.milestones.unshift({id:Date.now(),text:text,date:document.getElementById("msDate").value,updated:Date.now()});
    saveBD(bd2); document.getElementById("msText").value="";
    renderMilestones(); toast("&#x2B50; Milestone logged!");
  });
  el.querySelectorAll(".ms-del-btn").forEach(function(btn){
    btn.addEventListener("click",function(){ confirmDialog("Delete this milestone?", function(){ var bd2=getBD(); var id=+btn.dataset.msid; addTomb("ms", id); bd2.milestones=bd2.milestones.filter(function(m){return m.id!==id;}); saveBD(bd2); renderMilestones(); }); });
  });
  el.querySelectorAll(".ms-date-edit").forEach(function(span){
    span.addEventListener("click", function(){
      var id = +span.dataset.msid;
      var bd2 = getBD();
      var m = (bd2.milestones||[]).find(function(x){ return x.id===id; });
      if (!m) return;
      var existing = span.closest(".ms-row").querySelector(".ms-dt-edit");
      if (existing) { existing.remove(); return; }
      var picker = document.createElement("div");
      picker.className = "ms-dt-edit";
      picker.style.cssText = "display:flex;gap:6px;align-items:center;padding:8px 0;width:100%;box-sizing:border-box";
      picker.innerHTML = "<input type='date' value='"+(m.date||"")+"' class='med-input' style='flex:1'>" +
        "<button class='_msSave baby-log-btn' style='width:auto;padding:8px 12px;margin:0'>Save</button>" +
        "<button class='_msCancel' style='padding:8px 10px;background:#F0EBF8;border:none;border-radius:7px;color:#8A6A8A;font-family:inherit;font-size:13px;cursor:pointer'>&#x2715;</button>";
      span.closest(".ms-row").appendChild(picker);
      picker.querySelector("._msSave").addEventListener("click", function(){
        var nd = picker.querySelector("input").value;
        if (nd) { m.date = nd; m.updated = Date.now(); saveBD(bd2); }
        renderMilestones();
      });
      picker.querySelector("._msCancel").addEventListener("click", function(){ picker.remove(); });
    });
  });
}

// ── Teeth ─────────────────────────────────────────────────
var UPPER_TEETH = ["UL5","UL4","UL3","UL2","UL1","UR1","UR2","UR3","UR4","UR5"];
var LOWER_TEETH = ["LL5","LL4","LL3","LL2","LL1","LR1","LR2","LR3","LR4","LR5"];
var TOOTH_NAMES = {
  UL1:"Upper Left Central",UL2:"Upper Left Lateral",UL3:"Upper Left Canine",UL4:"Upper Left 1st Molar",UL5:"Upper Left 2nd Molar",
  UR1:"Upper Right Central",UR2:"Upper Right Lateral",UR3:"Upper Right Canine",UR4:"Upper Right 1st Molar",UR5:"Upper Right 2nd Molar",
  LL1:"Lower Left Central",LL2:"Lower Left Lateral",LL3:"Lower Left Canine",LL4:"Lower Left 1st Molar",LL5:"Lower Left 2nd Molar",
  LR1:"Lower Right Central",LR2:"Lower Right Lateral",LR3:"Lower Right Canine",LR4:"Lower Right 1st Molar",LR5:"Lower Right 2nd Molar"
};
var toothPending = null;

function buildRow(teeth) {
  return teeth.map(function(id){
    return "<button class='tooth-btn' data-tooth='"+esc(id)+"'>&middot;</button>";
  }).join("");
}

function renderTeeth() {
  var bd=getBD();
  var upper=document.getElementById("teethUpperRow"), lower=document.getElementById("teethLowerRow");
  if(upper) upper.innerHTML=buildRow(UPPER_TEETH);
  if(lower) lower.innerHTML=buildRow(LOWER_TEETH);
  document.querySelectorAll(".tooth-btn").forEach(function(btn){
    var id=btn.dataset.tooth, erupted=!!(bd.teeth&&bd.teeth[id]);
    btn.innerHTML=erupted?"&#x1F9B7;":"&middot;";
    btn.style.background=erupted?"#9B59B6":"#F0EAF4";
    btn.style.color=erupted?"#fff":"#B0A0BC";
  });
  var total=UPPER_TEETH.length+LOWER_TEETH.length;
  var cnt=Object.keys(bd.teeth||{}).filter(function(k){return bd.teeth[k];}).length;
  var countEl=document.getElementById("teethCount"); if(countEl) countEl.textContent=cnt+" of "+total+" teeth";
  document.querySelectorAll(".tooth-btn").forEach(function(btn){
    btn.addEventListener("click",function(){
      var id=btn.dataset.tooth; toothPending=id;
      var bd2=getBD(), erupted2=!!(bd2.teeth&&bd2.teeth[id]);
      var modal=document.getElementById("toothModal");
      var nameEl=document.getElementById("toothModalName"), eruptBtn=document.getElementById("toothEruptBtn");
      if(nameEl) nameEl.textContent=TOOTH_NAMES[id]||id;
      if(eruptBtn) eruptBtn.textContent=erupted2?"✓ Mark as not yet erupted":"Mark as erupted";
      if(modal) modal.classList.add("open");
    });
  });
}

document.getElementById("toothEruptBtn").addEventListener("click",function(){
  if(!toothPending) return;
  var changedTooth=toothPending, bd2=getBD();
  bd2.teeth=bd2.teeth||{};
  var isNowErupted=!bd2.teeth[changedTooth];
  bd2.teeth[changedTooth]=isNowErupted;
  saveBD(bd2);
  document.getElementById("toothModal").classList.remove("open");
  toothPending=null; renderTeeth();
  toast(isNowErupted?"&#x1F9B7; Tooth erupted!":"Tooth removed");
});
document.getElementById("toothCancelBtn").addEventListener("click",function(){
  document.getElementById("toothModal").classList.remove("open"); toothPending=null;
});

// ── Bags event listeners ───────────────────────────────────
var currentBagId = "changing";

document.getElementById("babyBagsView").addEventListener("click",function(e){
  var tab=e.target.closest(".bag-tab");
  if(tab){currentBagId=tab.dataset.bagid; renderBagView(); return;}
  var btn=e.target.closest("[data-action]"); if(!btn) return;
  var bags=getBagsData(), bag=bags.find(function(b){return b.id===currentBagId;});
  var act=btn.dataset.action;
  if(act==="bagToggle"){ var item=bag&&bag.items.find(function(x){return x.id===btn.dataset.id;}); if(item){item.packed=!item.packed;touchBagItem(bag,item);saveBagsData(bags);renderBagView();} }
  else if(act==="bagDelete"){ if(!bag) return; addTomb("bagitems",btn.dataset.id); bag.items=bag.items.filter(function(x){return x.id!==btn.dataset.id;}); touchBagItem(bag,null); saveBagsData(bags); renderBagView(); }
  else if(act==="bagReset"){ if(!bag) return; confirmDialog("Unpack everything in "+esc(bag.name)+"?",function(){ bag.items.forEach(function(x){x.packed=false;touchBagItem(bag,x);}); saveBagsData(bags); renderBagView(); toast("&#x21BA; Reset"); }); }
  else if(act==="bagRemove"){ var b2=bags.find(function(x){return x.id===btn.dataset.bagid;}); if(!b2) return; confirmDialog("Delete "+esc(b2.name)+"?",function(){ addTomb("bags",btn.dataset.bagid); bags=bags.filter(function(x){return x.id!==btn.dataset.bagid;}); if(currentBagId===btn.dataset.bagid) currentBagId=bags[0]?bags[0].id:""; saveBagsData(bags); renderBagView(); }); }
});
document.getElementById("bagAddItemBtn").addEventListener("click",function(){
  if(btnBusy(this)) return;
  var name=document.getElementById("bagItemInput").value.trim(); if(!name){toast("Enter an item name");return;}
  var bags=getBagsData(), bag=bags.find(function(b){return b.id===currentBagId;});
  if(!bag){ renderBagView(); toast("That bag is gone \u2014 pick a bag first"); return; }
  var item={id:currentBagId+"_"+Date.now(),name:name,packed:false,updated:0};
  touchBagItem(bag,item); bag.items.push(item);
  saveBagsData(bags); document.getElementById("bagItemInput").value=""; renderBagView(); toast("Added: "+name);
});
document.getElementById("bagItemInput").addEventListener("keydown",function(e){if(e.key==="Enter") document.getElementById("bagAddItemBtn").click();});
document.getElementById("bagCreateBtn").addEventListener("click",function(){
  if(btnBusy(this)) return;
  var name=document.getElementById("bagNameInput").value.trim(); if(!name){toast("Enter a bag name");return;}
  var bags=getBagsData(), id="bag_"+Date.now();
  bags.push({id:id,name:name,icon:"&#x1F45C;",items:[],updated:Date.now()}); currentBagId=id;
  saveBagsData(bags); document.getElementById("bagNameInput").value=""; renderBagView(); toast("Created: "+name);
});

// ── renderBagView ──────────────────────────────────────────

// Never bail out part-rendered. The reported "my new bag is showing another
// bag's items" was this function throwing between the tab row (written first)
// and the item list (written last), leaving the two disagreeing on screen. The
// throw is fixed at source in normaliseBags, but the ordering stays safe here
// too: the tab row is written only once the bag it highlights is in hand, and
// an empty bag list renders an empty state instead of returning.
function renderBagView() {
  var bags = getBagsData();
  if (!bags.find(function(b){ return b.id === currentBagId; })) currentBagId = bags.length ? bags[0].id : "";
  var bag = bags.find(function(b){ return b.id === currentBagId; });
  document.getElementById("bagTabRow").innerHTML = bags.map(function(b) {
    return "<button class='bag-tab"+(b.id===currentBagId?" active":"")+"' data-bagid='"+esc(b.id)+"'>"+esc(b.name)+"</button>";
  }).join("");
  if (!bag) {
    document.getElementById("bagContent").innerHTML = "<div class='bag-empty'>No bags yet \u2014 create one below</div>";
    document.getElementById("bagManageList").innerHTML = "";
    return;
  }
  var unpacked = bag.items.filter(function(x){ return !x.packed; });
  var packed   = bag.items.filter(function(x){ return  x.packed; });
  var total    = bag.items.length;
  var pct      = total ? Math.round(packed.length/total*100) : 0;
  var html     = "";
  html += "<div class='bag-progress'><div class='bag-progress-fill' style='width:"+pct+"%'></div></div>";
  html += "<div style='font-size:12px;color:#8A6A8A;text-align:center;margin-bottom:10px'>"+packed.length+" of "+total+" packed"+(pct===100?" &#x1F389;":"")+"</div>";
  if (unpacked.length) {
    html += "<div class='bag-section-hdr'>To pack ("+unpacked.length+")</div>";
    unpacked.forEach(function(item) {
      html += "<div class='bag-item'><button class='bag-item-check' data-action='bagToggle' data-id='"+esc(item.id)+"'>&#x00A0;</button><span class='bag-item-name'>"+esc(item.name)+"</span><button class='bag-item-del' data-action='bagDelete' data-id='"+esc(item.id)+"'>&#x2715;</button></div>";
    });
  } else if (packed.length) {
    html += "<div class='bag-empty'>&#x1F389; Everything is packed!</div>";
  }
  if (packed.length) {
    html += "<div class='bag-packed-hdr'>&#x2705; Packed ("+packed.length+")</div>";
    packed.forEach(function(item) {
      html += "<div class='bag-item'><button class='bag-item-check packed' data-action='bagToggle' data-id='"+esc(item.id)+"'>&#x2713;</button><span class='bag-item-name packed'>"+esc(item.name)+"</span><button class='bag-item-del' data-action='bagDelete' data-id='"+esc(item.id)+"'>&#x2715;</button></div>";
    });
    html += "<button class='bag-reset-btn' data-action='bagReset'>&#x21BA; Unpack all</button>";
  }
  if (!total) html = "<div class='bag-empty'>No items yet — add some below</div>";
  document.getElementById("bagContent").innerHTML = html;
  document.getElementById("bagManageList").innerHTML = bags.map(function(b) {
    return "<div class='bag-manage-row'><span class='bag-manage-name'>"+esc(b.name)+"</span>"+(bags.length>1?"<button class='bag-manage-del' data-action='bagRemove' data-bagid='"+esc(b.id)+"'>&#x2715;</button>":"")+"</div>";
  }).join("");
}

