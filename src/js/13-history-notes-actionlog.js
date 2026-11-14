// ============================================================
// RENDER HISTORY
// ============================================================
var _histSelectMode = false, _histSelected = {}; // v323 multi-select delete; keys = lowercase names
function renderHistory() {
  var q = (document.getElementById("histSearch").value||"").trim().toLowerCase();
  var hist = getHist();
  var filtered = hist.filter(function(h){ return h && h.name && (!q||h.name.toLowerCase().indexOf(q)!==-1); }).slice(0,60);
  if (!filtered.length) {
    _histSelectMode=false; _histSelected={};
    elHistoryC.innerHTML="<div class='empty'><div class='empty-ico'>&#x1F550;</div><div class='empty-title'>"+(q?"No matches":"No history yet")+"</div><div class='empty-sub'>"+(q?"Try a different search":"Items you add will appear here for quick re-adding")+"</div></div>";
    return;
  }
  var items=getItems(), html="";
  var selCount = Object.keys(_histSelected).length;
  if (_histSelectMode) {
    html+="<div class='hist-bar'><span class='hist-bar-count'>"+selCount+" selected</span>" +
      "<button id='histSelCancel'>Cancel</button>" +
      "<button id='histSelDelete' class='danger'"+(selCount?"":" disabled style='opacity:.45'")+">&#x2715; Delete"+(selCount?" ("+selCount+")":"")+"</button></div>";
  } else {
    html+="<div class='hist-bar'><span class='hist-bar-count'></span><button id='histSelStart'>&#x2611; Select</button></div>";
  }
  for (var i=0;i<filtered.length;i++) {
    var h=filtered[i], c=getCat(h.catId||"other");
    var inList=false;
    for (var j=0;j<items.length;j++) { if (!items[j].done&&items[j].name.toLowerCase()===h.name.toLowerCase()) { inList=true; break; } }
    var sel = !!_histSelected[h.name.toLowerCase()];
    html+="<div class='hist-item' data-name='"+esc(h.name)+"' data-cat='"+esc(c.id)+"'>" +
      "<span class='hist-emoji'>"+catEmojiSafe(c.emoji)+"</span>" +
      "<div class='hist-body'><div class='hist-name'>"+esc(h.name)+"</div>" +
      "<div class='hist-meta'><span class='hist-cat' style='background:"+catColorSafe(c.bg,"#EDEAE4")+";color:"+catColorSafe(c.fg,"#4A4A3A")+"'>"+esc(c.name)+"</span>" +
      "<span class='hist-count'>Added "+(h.count||1)+"x</span></div></div>" +
      (_histSelectMode
        ? "<span class='hist-check"+(sel?" sel":"")+"'>"+(sel?"&#10003;":"")+"</span>"
        : "<button class='hist-add"+(inList?" in-list":"")+"' aria-label='"+(inList?esc(h.name)+" is already in your list":"Add "+esc(h.name)+" to your list")+"'>"+(inList?"&#10003;":"+")+"</button>" +
          "<button class='hist-del' title='Remove from history' aria-label='Remove "+esc(h.name)+" from history'>&#x2715;</button>") +
      "</div>";
  }
  elHistoryC.innerHTML=html;
  var bStart=document.getElementById("histSelStart"), bCancel=document.getElementById("histSelCancel"), bDel=document.getElementById("histSelDelete");
  if (bStart)  bStart.addEventListener("click",  function(){ _histSelectMode=true;  _histSelected={}; renderHistory(); });
  if (bCancel) bCancel.addEventListener("click", function(){ _histSelectMode=false; _histSelected={}; renderHistory(); });
  if (bDel)    bDel.addEventListener("click",    function(){
    var have={}; getHist().forEach(function(h){ if(h) have[h.name.toLowerCase()]=true; });
    var names=Object.keys(_histSelected).filter(function(n){ return have[n]; });
    if (!names.length) return;
    deleteHistEntries(currentList, names);
    _histSelectMode=false; _histSelected={};
    saveCurrentList(); renderHistory();
    toast("Removed "+names.length+" from history");
  });
  elHistoryC.querySelectorAll(".hist-item").forEach(function(row) {
    var nm=row.dataset.name, cat=row.dataset.cat;
    if (_histSelectMode) {
      row.addEventListener("click", function(){
        var k=nm.toLowerCase();
        if (_histSelected[k]) delete _histSelected[k]; else _histSelected[k]=true;
        renderHistory();
      });
      return;
    }
    row.querySelector(".hist-add").addEventListener("click", function(e){ e.stopPropagation(); addFromHistory(nm,cat); });
    row.querySelector(".hist-del").addEventListener("click", function(e){
      e.stopPropagation();
      deleteHistEntries(currentList, [nm.toLowerCase()]);
      saveCurrentList(); renderHistory();
      toast("Removed from history: "+nm);
    });
    row.addEventListener("click", function(e){
      if (e.target.closest(".hist-add")||e.target.closest(".hist-del")) return;
      elInput.value=nm; manualCatId=cat; currentCatId=cat;
      showCatRow(cat,false); switchTab("list"); elInput.focus();
    });
  });
}
document.getElementById("histSearch").addEventListener("input", renderHistory);
function addFromHistory(name, catId) {
  var items=getItems();
  for (var i=0;i<items.length;i++) {
    if (!items[i].done&&items[i].name.toLowerCase()===name.toLowerCase()) { toast("Already in your list!"); return; }
  }
  listData[currentList].items.unshift({ id:Date.now(), name:name, catId:catId, done:false, addedBy:hearthUser, updated:Date.now(), added:Date.now() });
  addToHist(name,catId); saveCurrentList(); renderList(); renderHistory(); toast("Added: "+name);
}

// ============================================================
// CATEGORY PICKER (for new item OR editing existing item)
// ============================================================
function openPicker(itemId) {
  editItemId = itemId; // null = picking for new item input
  document.getElementById("addCatForm").style.display = "none";
  document.getElementById("pickerTitle").textContent = itemId ? "Change category" : "Choose a category";
  renderPickerGrid();
  document.getElementById("pickerOverlay").classList.add("open");
}

function renderPickerGrid() {
  var cats = getCats();
  var activeCatId = editItemId
    ? (function(){ var items=getItems(); for(var i=0;i<items.length;i++) if(items[i].id===editItemId) return items[i].catId; return "other"; })()
    : (manualCatId || currentCatId || "other");
  var html = "";
  for (var i=0;i<cats.length;i++) {
    var c=cats[i];
    html+="<div class='picker-opt"+(activeCatId===c.id?" sel":"")+"' style='background:"+catColorSafe(c.bg,"#EDEAE4")+";color:"+catColorSafe(c.fg,"#4A4A3A")+"' data-id='"+esc(c.id)+"'>"+
      "<span style='font-size:20px'>"+catEmojiSafe(c.emoji)+"</span><span>"+esc(c.name)+"</span></div>";
  }
  document.getElementById("pickerGrid").innerHTML = html;
  document.getElementById("pickerGrid").querySelectorAll(".picker-opt").forEach(function(opt) {
    opt.addEventListener("click", function(){
      var catId = opt.dataset.id;
      if (editItemId) {
        // Edit existing item's category
        var items = getItems();
        for (var i=0;i<items.length;i++) { if (items[i].id===editItemId) { items[i].catId=catId; items[i].updated=Date.now(); break; } }
        saveCurrentList(); renderList();
        toast("Category updated");
      } else {
        // Picking for new item
        manualCatId = catId; currentCatId = catId;
        showCatRow(catId, false);
      }
      closePicker();
    });
  });
}

function closePicker() {
  document.getElementById("pickerOverlay").classList.remove("open");
  editItemId = null;
}
document.getElementById("pickerOverlay").addEventListener("click", function(e){ if (e.target===this) closePicker(); });
document.getElementById("pickerClose").addEventListener("click", closePicker);

// ---- ADD CUSTOM CATEGORY ----
document.getElementById("addCatBtn").addEventListener("click", function() {
  document.getElementById("addCatForm").style.display = "block";
  document.getElementById("newCatName").value = "";
  selectedCatEmoji = CAT_EMOJIS[0];
  selectedCatColor = 0;
  renderEmojiGrid(); renderColorGrid();
  setTimeout(function(){ document.getElementById("newCatName").focus(); }, 100);
});

function renderEmojiGrid() {
  var html = "";
  for (var i=0;i<CAT_EMOJIS.length;i++) {
    html+="<div class='emoji-opt"+(CAT_EMOJIS[i]===selectedCatEmoji?" sel":"")+"' data-idx='"+esc(i)+"'>"+CAT_EMOJIS[i]+"</div>";
  }
  document.getElementById("emojiGrid").innerHTML = html;
  document.getElementById("emojiGrid").querySelectorAll(".emoji-opt").forEach(function(opt) {
    opt.addEventListener("click", function(){
      selectedCatEmoji = CAT_EMOJIS[+opt.dataset.idx];
      renderEmojiGrid();
    });
  });
}
function renderColorGrid() {
  var html = "";
  for (var i=0;i<CAT_COLORS.length;i++) {
    html+="<div class='color-opt"+(i===selectedCatColor?" sel":"")+"' data-idx='"+esc(i)+"' style='background:"+CAT_COLORS[i].bg+"'></div>";
  }
  document.getElementById("colorGrid").innerHTML = html;
  document.getElementById("colorGrid").querySelectorAll(".color-opt").forEach(function(opt) {
    opt.addEventListener("click", function(){ selectedCatColor=+opt.dataset.idx; renderColorGrid(); });
  });
}

document.getElementById("saveCatBtn").addEventListener("click", function() {
  var name = document.getElementById("newCatName").value.trim();
  if (!name) { toast("Please enter a category name"); return; }
  var col = CAT_COLORS[selectedCatColor];
  var newCat = {
    id: "custom_" + Date.now(),
    name: name,
    emoji: selectedCatEmoji,
    bg: col.bg,
    fg: col.fg
  };
  var existing = getCustomCats(currentList);
  existing.push(newCat);
  saveCustomCats(currentList, existing);
  if (isHouseholdSet()) pushHousehold();
  document.getElementById("addCatForm").style.display = "none";
  renderPickerGrid();
  toast("Category added: " + name);
});

// ============================================================
// ============================================================
// NOTES SECTION — Personal + Work
// ============================================================
var currentNotesView = "personal";

var NOTES_CONTEXTS = {
  personal: { key:"fl4_notes_global",      label:"Personal notes",  icon:"&#x1F464;", tomb:"notes_p", pfield:"global_notes",      dfield:"notes_deleted" },
  work:     { key:"fl4_notes_global_work", label:"Work notes",      icon:"&#x1F4BC;", tomb:"notes_w", pfield:"global_notes_work", dfield:"worknotes_deleted" }
};

function normaliseNotes(notes) {
  // Migrate old format {id, text, html, editedTs} → new {id, title, body, updatedAt}
  // Guard: a null entry (sync merge / bad write) must degrade, never crash —
  // filtered here at the source so every caller gets clean data from one
  // place, the same fix shape as the fl4_recipebook null-entry class (v385).
  return (notes||[]).filter(function(n){ return n && typeof n === "object"; }).map(function(n) {
    if (n.body !== undefined || n.title !== undefined) {
      // New format — backfill createdAt from id if missing
      if (!n.createdAt && n.id) n.createdAt = n.id;
      return n;
    }
    // Old format
    var body  = n.text || "";
    var title = body.split("\n")[0].slice(0, 60) || "Note";
    return { id:n.id, title:title, body:body, updatedAt:n.editedTs || n.ts || n.id };
  });
}

function renderNotesSection() {
  // Log and Food moved to the Track section in v339 — guard stale values.
  if (currentNotesView === "log" || currentNotesView === "food") currentNotesView = "personal";
  // Scroll to top — notes live in the page flow so scroll window
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  document.querySelectorAll("#notesSection .notes-tab-btn").forEach(function(b) {
    var isActive = b.dataset.nview === currentNotesView;
    b.classList.toggle("active", isActive);
  });
  document.getElementById("notesPersonalView").style.display = currentNotesView === "personal" ? "" : "none";
  document.getElementById("notesWorkView").style.display     = currentNotesView === "work"     ? "" : "none";

  // One-time migration: import notes from old list-based notes (fl4_notes_notes) into personal notes
  if (!storeGet("hearth_notes_migrated")) {
    var oldListNotes = storeGet("fl4_notes_notes");
    if (Array.isArray(oldListNotes) && oldListNotes.length) {
      var existing = storeGet("fl4_notes_global") || [];
      var existingIds = {}; existing.forEach(function(n){ existingIds[n.id]=true; });
      var toMerge = oldListNotes.filter(function(n){ return n && !existingIds[n.id]; });
      if (toMerge.length) storeSet("fl4_notes_global", toMerge.concat(existing));
    }
    storeSet("hearth_notes_migrated", true);
  }

  var ctx   = NOTES_CONTEXTS[currentNotesView];
  var raw   = storeGet(ctx.key) || [];
  var notes = normaliseNotes(raw);
  // Save back in new format if we migrated anything
  if (notes.some(function(n,i){ return raw[i] && raw[i].text !== undefined; })) {
    storeSet(ctx.key, notes);
  }
  // Sort: highlighted first, then by updatedAt desc
  notes = notes.slice().sort(function(a, b) {
    if (a.highlighted && !b.highlighted) return -1;
    if (!a.highlighted && b.highlighted) return 1;
    return (b.updatedAt||0) - (a.updatedAt||0);
  });
  var viewEl = document.getElementById(currentNotesView === "personal" ? "notesPersonalView" : "notesWorkView");

  if (!notes.length) {
    viewEl.innerHTML = "<div style='text-align:center;padding:48px 24px;color:#B87A40'>" +
      "<div style='font-size:40px;margin-bottom:10px'>&#x1F4DD;</div>" +
      "<div style='font-family:Georgia,serif;font-size:18px;margin-bottom:6px'>" + ctx.label + "</div>" +
      "<div style='font-size:14px;opacity:.7'>Tap + to write your first note</div></div>" +
      "<button data-action='newNote' style='position:fixed;bottom:80px;right:20px;width:52px;height:52px;border-radius:50%;background:#A05A10;border:none;color:#fff;font-size:28px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:200;touch-action:manipulation'>+</button>";
    return;
  }

  var html = notes.map(function(n, i) {
    var previewRaw = (n.body || "").replace(/<[^>]*>/g, " ").replace(/\s+/g," ").trim();
    // Decode HTML entities using a temporary element
    var tmp = document.createElement("div");
    tmp.innerHTML = previewRaw;
    var preview = (tmp.textContent || tmp.innerText || "").trim().slice(0, 60) || "(empty)";
    var dt = n.updatedAt ? new Date(n.updatedAt) : null;
    var dtMod = dt ? dt.toLocaleDateString("en-IE",{day:"numeric",month:"short"}) + " " + dt.toLocaleTimeString("en-IE",{hour:"2-digit",minute:"2-digit"}) : "";
    var dtCreate = n.createdAt && n.createdAt !== n.updatedAt
      ? "Created " + new Date(n.createdAt).toLocaleDateString("en-IE",{day:"numeric",month:"short"}) : "";
    var dtStr = dtMod ? (dtCreate ? dtCreate + " · " : "") + "Modified " + dtMod : dtCreate;
    var isHL = !!n.highlighted;
    return "<div style='background:" + (isHL ? "#FFF8E8" : "#fff") + ";border-radius:11px;padding:13px 14px;margin:0 12px 8px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.07);touch-action:manipulation;border:" + (isHL ? "2px solid #F5A623" : "2px solid transparent") + "' data-action='openNote' data-noteid='" + esc(n.id) + "'>" +
      "<div style='display:flex;align-items:flex-start;gap:6px'>" +
        "<div style='flex:1'>" +
          "<div style='font-size:15px;font-weight:700;color:#2A2010;margin-bottom:3px'>" + esc(n.title||"Untitled") + "</div>" +
          "<div style='font-size:13px;color:#8A7A60;margin-bottom:4px'>" + esc(preview) + "</div>" +
        "</div>" +
        "<button data-action='highlightNote' data-noteid='" + esc(n.id) + "' style='border:none;background:none;font-size:18px;cursor:pointer;touch-action:manipulation;padding:0 0 0 4px;flex-shrink:0;opacity:" + (isHL ? "1" : "0.25") + "'>" + (isHL ? "&#x2B50;" : "&#x2606;") + "</button>" +
      "</div>" +
      "<div style='display:flex;align-items:center;justify-content:space-between;margin-top:4px'>" +
        "<span style='font-size:11px;color:#B8A880'>" + dtStr + "</span>" +
        "<button data-action='deleteNote' data-noteid='" + esc(n.id) + "' style='border:none;background:none;color:#C06060;font-size:13px;cursor:pointer;touch-action:manipulation'>&#x2715;</button>" +
      "</div></div>";
  }).join("");

  html += "<button data-action='newNote' style='position:fixed;bottom:80px;right:20px;width:52px;height:52px;border-radius:50%;background:#A05A10;border:none;color:#fff;font-size:28px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:200;touch-action:manipulation'>+</button>";
  viewEl.innerHTML = html;
}

// Sub-tab switching
document.getElementById("notesSection").addEventListener("click", function(e) {
  var tab = e.target.closest(".notes-tab-btn[data-nview]");
  if (tab) { currentNotesView = tab.dataset.nview; renderNotesSection(); return; }
  var btn = e.target.closest("[data-action]");
  if (!btn) return;
  var action = btn.getAttribute("data-action");
  var noteid = +btn.getAttribute("data-noteid");
  if (action === "newNote")       openNewNote();
  if (action === "openNote")      openNoteById(noteid);
  if (action === "deleteNote")    { e.stopPropagation(); deleteNoteById(noteid); }
  if (action === "highlightNote") { e.stopPropagation(); toggleNoteHighlightById(noteid); }
});

function getCurrentNotesKey() {
  return NOTES_CONTEXTS[currentNotesView].key;
}

function openNoteById(id) {
  var notes = normaliseNotes(storeGet(getCurrentNotesKey()) || []);
  var note  = notes.find(function(n){ return n.id === id; });
  if (!note) return;
  openNoteEditor(note.title, note.body, function(title, body) {
    note.title     = title;
    note.body      = body;
    note.updatedAt = Date.now();
    if (!note.createdAt) note.createdAt = note.id; // backfill from id (which was Date.now() at creation)
    storeSet(getCurrentNotesKey(), notes);
    pushPersonal(); if (isHouseholdSet() && isSynced("notes")) pushHousehold();
    renderNotesSection();
  }, function() {
    deleteNoteById(id);
  }, note.updatedAt, note.createdAt);
}

function openNewNote() {
  openNoteEditor("", "", function(title, body) {
    var notes = storeGet(getCurrentNotesKey()) || [];
    var now = Date.now();
    notes.unshift({ id: now, title: title, body: body, createdAt: now, updatedAt: now });
    storeSet(getCurrentNotesKey(), notes);
    pushPersonal(); if (isHouseholdSet() && isSynced("notes")) pushHousehold();
    renderNotesSection();
  }, null);
}

function toggleNoteHighlightById(id) {
  var notes = normaliseNotes(storeGet(getCurrentNotesKey()) || []);
  var note  = notes.find(function(n){ return n.id === id; });
  if (!note) return;
  note.highlighted = !note.highlighted;
  note.updatedAt = Date.now();
  storeSet(getCurrentNotesKey(), notes);
  pushPersonal();
  if (isHouseholdSet() && isSynced("notes")) pushHousehold();
  renderNotesSection();
}

function deleteNoteById(id) {
  confirmDialog("Delete this note?", function() {
    var notes = (storeGet(getCurrentNotesKey()) || []).filter(function(n){ return n.id !== id; });
    storeSet(getCurrentNotesKey(), notes);
    addTomb(NOTES_CONTEXTS[currentNotesView].tomb, id);
    pushPersonal(); if (isHouseholdSet() && isSynced("notes")) pushHousehold();
    renderNotesSection();
  });
}

// Exposed so the back-button handler (closeTopOverlay, ~line 7430) can trigger
// the SAME non-destructive close as the editor's own "<" control — set when
// the editor opens, cleared on every close path below.
var _neCloseFn = null;

function openNoteEditor(title, body, onSave, onDelete) {
  var currentTitle = title || "";
  var currentBody  = body  || ""; // stored as HTML

  var overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;background:#FDFAF3;z-index:500;overflow:hidden";

  var inner = document.createElement("div");
  inner.style.cssText = "display:flex;flex-direction:column;height:100%;max-width:480px;margin:0 auto;background:#FDFAF3;position:relative";

  var delBtn = onDelete
    ? "<button id='neDel' style='border:none;background:none;color:#C06060;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;padding:8px 12px;white-space:nowrap'>Delete</button>"
    : "";

  // Modified + created dates (5th and 6th args)
  var modifiedAt = arguments[4] || null;
  var createdAt  = arguments[5] || null;

  function fmtDate(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    return d.toLocaleDateString("en-IE",{day:"numeric",month:"short",year:"numeric"}) +
      " " + d.toLocaleTimeString("en-IE",{hour:"2-digit",minute:"2-digit"});
  }

  var dateHtml = "";
  if (createdAt || modifiedAt) {
    dateHtml = "<div style='font-size:11px;color:#B8A880;padding-left:2px;margin-top:-2px;line-height:1.6'>";
    if (createdAt)  dateHtml += "Created " + fmtDate(createdAt);
    if (createdAt && modifiedAt && createdAt !== modifiedAt) dateHtml += "<br>";
    if (modifiedAt && modifiedAt !== createdAt) dateHtml += "Modified " + fmtDate(modifiedAt);
    dateHtml += "</div>";
  }

  var TOOLBAR_HTML =
    "<div id='neFmt' style='display:flex;gap:3px;padding:7px 8px;background:#fff;border-top:1px solid #E8E4DC;flex-wrap:wrap;flex-shrink:0;padding-bottom:max(8px,env(safe-area-inset-bottom))'>" +
      "<button class='fmt-btn ne-fmt' data-fmt='undo' title='Undo' aria-label='Undo' style='font-size:15px'>&#x21B6;</button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='redo' title='Redo' aria-label='Redo' style='font-size:15px'>&#x21B7;</button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='selectLine' title='Select current line' aria-label='Select current line'>&#x2195;</button>" +
      "<div style='width:1px;background:#E8E4DC;margin:0 2px;align-self:stretch'></div>" +
      "<button class='fmt-btn ne-fmt' data-fmt='bold' title='Bold' aria-label='Bold'><b>B</b></button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='italic' title='Italic' aria-label='Italic'><i>I</i></button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='underline' title='Underline' aria-label='Underline'><u>U</u></button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='strikethrough' title='Strikethrough' aria-label='Strikethrough'><s>S</s></button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='highlight' title='Highlight' aria-label='Highlight' style='background:#FFF176;color:#555'>H</button>" +
      "<div style='width:1px;background:#E8E4DC;margin:0 2px;align-self:stretch'></div>" +
      "<button class='fmt-btn ne-fmt' data-fmt='h1' title='Heading 1' aria-label='Heading 1' style='font-weight:800;font-size:13px'>H1</button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='h2' title='Heading 2' aria-label='Heading 2' style='font-weight:700;font-size:12px'>H2</button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='h3' title='Heading 3' aria-label='Heading 3' style='font-weight:600;font-size:11px'>H3</button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='p' title='Normal text' aria-label='Normal text'>&#xB6;</button>" +
      "<div style='width:1px;background:#E8E4DC;margin:0 2px;align-self:stretch'></div>" +
      "<button class='fmt-btn ne-fmt' data-fmt='ul' title='Bullet list' aria-label='Bullet list'>&#x2022;</button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='ol' title='Numbered list' aria-label='Numbered list'>1.</button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='indent' title='Indent' aria-label='Indent'>&#x21E5;</button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='outdent' title='Outdent' aria-label='Outdent'>&#x21E4;</button>" +
      "<div style='width:1px;background:#E8E4DC;margin:0 2px;align-self:stretch'></div>" +
      "<button class='fmt-btn ne-fmt' data-fmt='justifyLeft' title='Left' aria-label='Left'>&#x2261;</button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='justifyCenter' title='Centre' aria-label='Centre'>&#x2263;</button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='justifyRight' title='Right' aria-label='Right'>&#x2262;</button>" +
      "<div style='width:1px;background:#E8E4DC;margin:0 2px;align-self:stretch'></div>" +
      "<button class='fmt-btn ne-fmt' data-fmt='blockquote' title='Quote' aria-label='Quote'>&#x201C;</button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='hr' title='Divider' aria-label='Divider'>&#x2015;</button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='code' title='Code' aria-label='Code'>{ }</button>" +
      "<button class='fmt-btn ne-fmt' data-fmt='clear' title='Clear formatting' aria-label='Clear formatting' style='color:#C06060'>&#x2A2F;</button>" +
      "<button id='neHelpBtn' class='fmt-btn' title='Toolbar legend' aria-label='Toolbar legend' style='margin-left:auto;font-weight:700;color:#8A7A5C'>?</button>" +
    "</div>";

  inner.innerHTML =
    "<div style='display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #E0D8C0;background:#FDFAF3;flex-shrink:0'>" +
      "<button id='neBack' style='min-width:44px;height:44px;border:none;background:#F0EDE8;border-radius:9px;font-size:20px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center' title='Discard changes'>&#x2039;</button>" +
      "<div style='flex:1;min-width:0'>" +
        "<input id='neTitle' type='text' placeholder='Title' autocorrect='on' style='width:100%;border:none;background:none;font-family:Georgia,serif;font-size:18px;font-weight:600;color:#2A2010;outline:none'>" +
        dateHtml +
      "</div>" +
      "<button id='neSave' style='min-width:52px;height:44px;border:none;background:#A05A10;color:#fff;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;padding:0 12px'>Save</button>" +
      delBtn +
    "</div>" +
    "<div id='neBody' contenteditable='true' spellcheck='true' style='flex:1;padding:16px;font-size:16px;line-height:1.7;color:#1C2018;outline:none;overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",system-ui,sans-serif;-webkit-overflow-scrolling:touch'></div>" +
    "<div id='neHelpPanel' role='dialog' aria-label='Toolbar guide' style='display:none;position:absolute;inset:0;background:#FDFAF3;z-index:20;overflow-y:auto;padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom))'>" +
      "<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:10px'>" +
        "<div style='font-family:Georgia,serif;font-size:16px;font-weight:700;color:#2A2010'>Toolbar guide</div>" +
        "<button id='neHelpClose' style='min-width:36px;height:36px;border:none;background:#F0EDE8;border-radius:8px;font-size:16px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent' title='Close'>&#x2715;</button>" +
      "</div>" +
      "<div id='neHelpList'></div>" +
    "</div>" +
    TOOLBAR_HTML;

  overlay.appendChild(inner);
  document.body.appendChild(overlay);

  var titleEl = document.getElementById("neTitle");
  var bodyEl  = document.getElementById("neBody");

  titleEl.value = currentTitle;
  // Set HTML content safely. The fallback must NEVER assign raw HTML: if the
  // vendored DOMPurify somehow failed to load, show the note escaped as plain
  // text (ugly but safe) rather than injecting unsanitised markup (v328).
  bodyEl.innerHTML = (typeof DOMPurify !== "undefined") ? DOMPurify.sanitize(currentBody || "") : esc(currentBody || "");

  titleEl.addEventListener("input", function(){ currentTitle = titleEl.value; });
  titleEl.addEventListener("blur",  function(){ currentTitle = titleEl.value; });
  bodyEl.addEventListener("input",  function(){ currentBody  = bodyEl.innerHTML; });
  bodyEl.addEventListener("blur",   function(){ currentBody  = bodyEl.innerHTML; });

  // Format toolbar
  overlay.querySelectorAll(".ne-fmt").forEach(function(btn) {
    btn.addEventListener("mousedown", function(e){ e.preventDefault(); }); // keep focus in editor
    btn.addEventListener("click", function() {
      bodyEl.focus();
      var fmt = btn.dataset.fmt;

      if (fmt === "undo") { document.execCommand("undo", false, null); currentBody = bodyEl.innerHTML; return; }
      if (fmt === "redo") { document.execCommand("redo", false, null); currentBody = bodyEl.innerHTML; return; }
      if (fmt === "selectLine") {
        // Select the entire block/line the cursor is currently in
        var sel = window.getSelection();
        if (!sel || !sel.anchorNode) return;
        var node = sel.anchorNode;
        // Walk up to find the direct block child of bodyEl
        while (node && node.parentNode !== bodyEl) node = node.parentNode;
        if (!node) node = sel.anchorNode;
        var range = document.createRange();
        range.selectNodeContents(node);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }

      if (fmt === "h1" || fmt === "h2" || fmt === "h3" || fmt === "p") {
        // Check if selection is inside a list item — formatBlock won't work there
        var sel = window.getSelection();
        var inList = sel && sel.anchorNode && (function(node) {
          while (node && node !== bodyEl) {
            if (node.nodeName === "LI") return true;
            node = node.parentNode;
          }
          return false;
        })(sel.anchorNode);

        if (inList) {
          // Apply font-size via span for text inside list items
          var sizes = { h1:"1.5em", h2:"1.2em", h3:"1.05em", p:"1em" };
          var weights = { h1:"700", h2:"700", h3:"600", p:"400" };
          document.execCommand("fontSize", false, "7"); // placeholder
          // Replace the browser's font size spans with our styled span
          bodyEl.querySelectorAll("font[size='7']").forEach(function(f) {
            var span = document.createElement("span");
            span.style.fontSize   = sizes[fmt];
            span.style.fontWeight = weights[fmt];
            span.innerHTML = f.innerHTML;
            f.parentNode.replaceChild(span, f);
          });
        } else {
          document.execCommand("formatBlock", false, fmt === "p" ? "p" : fmt);
        }
      } else if (fmt === "blockquote") {
        document.execCommand("formatBlock", false, "blockquote");
      } else if (fmt === "ul") {
        document.execCommand("insertUnorderedList", false, null);
      } else if (fmt === "ol") {
        document.execCommand("insertOrderedList", false, null);
      } else if (fmt === "indent") {
        document.execCommand("indent", false, null);
      } else if (fmt === "outdent") {
        document.execCommand("outdent", false, null);
      } else if (fmt === "justifyLeft" || fmt === "justifyCenter" || fmt === "justifyRight") {
        document.execCommand(fmt, false, null);
      } else if (fmt === "hr") {
        document.execCommand("insertHorizontalRule", false, null);
      } else if (fmt === "highlight") {
        document.execCommand("hiliteColor", false, "#FFF176");
      } else if (fmt === "code") {
        var sel2 = window.getSelection();
        if (sel2 && sel2.toString()) {
          document.execCommand("insertHTML", false, "<code>" + sel2.toString() + "</code>");
        }
      } else if (fmt === "clear") {
        document.execCommand("removeFormat", false, null);
        document.execCommand("formatBlock", false, "p");
      } else {
        document.execCommand(fmt, false, null);
      }
      currentBody = bodyEl.innerHTML;
    });
  });

  // Toolbar legend: lists each ne-fmt button's own title attribute, so the
  // legend can never drift out of sync with the toolbar it describes.
  var helpBtn   = document.getElementById("neHelpBtn");
  var helpPanel = document.getElementById("neHelpPanel");
  var helpList  = document.getElementById("neHelpList");
  function renderHelpList() {
    var rows = "";
    overlay.querySelectorAll(".ne-fmt").forEach(function(btn) {
      var label = btn.getAttribute("title");
      if (!label) return;
      rows += "<div style='display:flex;align-items:center;gap:12px;padding:7px 2px;border-bottom:1px solid #F0EDE8'>" +
        "<div style='min-width:32px;text-align:center;font-size:15px'>" + btn.innerHTML + "</div>" +
        "<div style='font-size:14px;color:#2A2010'>" + esc(label) + "</div>" +
      "</div>";
    });
    helpList.innerHTML = rows;
  }
  function openHelpPanel()  { renderHelpList(); helpPanel.style.display = "block"; }
  function closeHelpPanel() { helpPanel.style.display = "none"; }
  helpBtn.addEventListener("mousedown", function(e){ e.preventDefault(); });
  helpBtn.addEventListener("click", function() {
    if (helpPanel.style.display === "block") closeHelpPanel(); else openHelpPanel();
  });
  document.getElementById("neHelpClose").addEventListener("click", closeHelpPanel);

  // Keep toolbar above Android keyboard using visualViewport API
  var toolbar = overlay.querySelector("#neFmt");
  function updateToolbarPos() {
    if (!window.visualViewport || !toolbar) return;
    var keyboardH = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
    toolbar.style.position  = "relative"; // stays in flow
    toolbar.style.marginTop = "auto";
    // Position overlay inner so body shrinks to fit above keyboard
    inner.style.height = window.visualViewport.height + "px";
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateToolbarPos);
    window.visualViewport.addEventListener("scroll", updateToolbarPos);
    overlay.addEventListener("remove", function() {
      window.visualViewport.removeEventListener("resize", updateToolbarPos);
      window.visualViewport.removeEventListener("scroll", updateToolbarPos);
    });
  }

  function doSave() {
    var t = (titleEl.value || currentTitle).trim();
    var b = bodyEl.innerHTML || currentBody;
    if (typeof DOMPurify !== "undefined") b = DOMPurify.sanitize(b);
    if (b.replace(/<[^>]*>/g,"").trim() === "") b = "";
    document.body.removeChild(overlay);
    _neCloseFn = null;
    if (t || b) onSave(t || "Untitled", b);
    else renderNotesSection();
  }

  function doDiscard() {
    document.body.removeChild(overlay);
    _neCloseFn = null;
    renderNotesSection();
  }

  _neCloseFn = doDiscard;

  document.getElementById("neSave").addEventListener("click", doSave);
  document.getElementById("neBack").addEventListener("click", doDiscard);

  if (onDelete) {
    document.getElementById("neDel").addEventListener("click", function() {
      document.body.removeChild(overlay);
      _neCloseFn = null;
      onDelete();
    });
  }

  setTimeout(function(){ bodyEl.focus(); }, 80);
}

// ============================================================
// ACTION LOG
// ============================================================
function getActionLog() { return storeGet("fl4_action_log") || []; }
function saveActionLog(entries) {
  storeSet("fl4_action_log", entries);
  pushPersonal();
}

document.getElementById("logActionBtn").addEventListener("click", function() {
  if (btnBusy(this)) return;
  doLogAction();
});
document.getElementById("logActionInput").addEventListener("keydown", function(e) {
  if (e.key === "Enter") doLogAction();
});

function doLogAction() {
  var text  = document.getElementById("logActionInput").value.trim();
  if (!text) { toast("Enter an action to log"); return; }
  var dtEl  = document.getElementById("logActionDt");
  var ts    = dtEl && dtEl.value ? new Date(dtEl.value).getTime() : Date.now();
  if (isNaN(ts)) ts = Date.now();
  var entries = getActionLog();
  entries.unshift({ id: Date.now(), text: text, ts: ts, person: trackPerson() });
  // Keep sorted newest first
  entries.sort(function(a,b){ return b.ts - a.ts; });
  saveActionLog(entries);
  document.getElementById("logActionInput").value = "";
  if (dtEl) dtEl.value = localDatetimeValue(); // reset to now
  renderLogView();
  toast("&#x1F4CB; Logged: " + text);
}

function localDatetimeValue(ts) {
  var d = ts ? new Date(ts) : new Date();
  var pad = function(x){ return x < 10 ? "0"+x : ""+x; };
  return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function renderLogView() {
  // Only set datetime if it has never been set (not on every render)
  var dtEl = document.getElementById("logActionDt");
  if (dtEl && !dtEl._initialised) { dtEl.value = localDatetimeValue(); dtEl._initialised = true; }

  var entries = getActionLog().filter(function(e2){ return e2 && e2.type !== "cardio" && (e2.text !== undefined && e2.text !== null) && trackPersonOf(e2) === trackPerson(); });
  var el = document.getElementById("logActionList");
  if (!entries.length) {
    el.innerHTML = "<div style='text-align:center;padding:40px 24px;color:#B87A40'>" +
      "<div style='font-size:36px;margin-bottom:8px'>&#x1F4CB;</div>" +
      "<div style='font-size:14px'>Log anything with a timestamp<br><span style='opacity:.6'>Cut grass · Took medication · Fed baby</span></div></div>";
    return;
  }
  var byDate = {}, dateOrder = [];
  entries.forEach(function(e2) {
    var d = new Date(e2.ts);
    var dateKey = d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDate();
    var dateLabel = d.toLocaleDateString("en-IE", { weekday:"long", day:"numeric", month:"long" });
    if (!byDate[dateKey]) { byDate[dateKey] = { label:dateLabel, items:[] }; dateOrder.push(dateKey); }
    byDate[dateKey].items.push(e2);
  });
  var html = "";
  dateOrder.forEach(function(dk) {
    var group = byDate[dk];
    html += "<div style='font-size:11px;font-weight:700;color:#8A6A40;text-transform:uppercase;letter-spacing:.5px;padding:6px 14px 4px'>" + group.label + "</div>";
    group.items.forEach(function(e2) {
      var t = new Date(e2.ts);
      var timeStr = t.toLocaleTimeString("en-IE", { hour:"2-digit", minute:"2-digit" });
      html += "<div style='display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;margin:0 12px 5px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.07)'>" +
        "<span class='log-time-btn' data-logid='" + esc(e2.id) + "' style='font-size:12px;font-weight:700;color:#B87A40;min-width:42px;flex-shrink:0;cursor:pointer;touch-action:manipulation;text-decoration:underline dotted'>" + timeStr + "</span>" +
        "<span style='flex:1;font-size:14px;color:#2A2010'>" + esc(e2.text) + "</span>" +
        "<button data-logid='" + esc(e2.id) + "' class='log-del-btn' style='border:none;background:none;color:#C06060;font-size:13px;cursor:pointer;touch-action:manipulation;opacity:.45'>&#x2715;</button>" +
      "</div>";
    });
  });
  el.innerHTML = html;

  el.querySelectorAll(".log-del-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      confirmDialog("Delete this log entry?", function(){
        var id = +btn.dataset.logid;
        addTomb("action_log", id);
        var entries = getActionLog().filter(function(e2){ return e2.id !== id; });
        saveActionLog(entries);
        pushPersonal();
        renderLogView();
      });
    });
  });

  el.querySelectorAll(".log-time-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var id = +btn.dataset.logid;
      var entries = getActionLog();
      var entry = entries.find(function(e2){ return e2.id === id; });
      if (!entry) return;
      // Show a small inline datetime picker
      var existing = btn.parentElement.querySelector(".log-dt-edit");
      if (existing) { existing.remove(); return; }
      var picker = document.createElement("div");
      picker.className = "log-dt-edit";
      picker.style.cssText = "display:flex;gap:6px;align-items:center;padding:6px 14px;background:#FFF8F0;border-top:1px solid #E0D0B0;width:100%;box-sizing:border-box;margin-top:4px";
      picker.innerHTML = "<input type='datetime-local' value='" + localDatetimeValue(entry.ts) + "' style='flex:1;border:1.5px solid #E0D0B0;border-radius:7px;padding:7px 9px;font-family:inherit;font-size:13px;outline:none;background:#FDFAF3;color:#2A2010'>" +
        "<button style='padding:7px 12px;background:#A05A10;border:none;border-radius:7px;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation'>Save</button>" +
        "<button style='padding:7px 10px;background:#F0EDE8;border:none;border-radius:7px;color:#7A5A30;font-family:inherit;font-size:13px;cursor:pointer;touch-action:manipulation'>✕</button>";
      btn.parentElement.after(picker);
      picker.querySelector("button").addEventListener("click", function() {
        var val = picker.querySelector("input").value;
        var newTs = val ? new Date(val).getTime() : entry.ts;
        if (!isNaN(newTs)) {
          entry.ts = newTs;
          entries.sort(function(a,b){ return b.ts - a.ts; });
          saveActionLog(entries);
        }
        renderLogView();
      });
      picker.querySelectorAll("button")[1].addEventListener("click", function(){ picker.remove(); });
    });
  });
}

// ============================================================
// TRACK MEDICINE (v380) — factual family medicine log. Deliberately no dose
// math or interval advisories: that safety logic stays exclusively in the
// Baby section's renderMedicine(), never duplicated here. Personal-only sync
// (pushPersonal/applyPersonal), same as action_log/food_log — not pushed to
// the household channel.
// ============================================================
function getTrackMed() { return storeGet("fl4_track_med") || []; }
function saveTrackMed(entries) {
  storeSet("fl4_track_med", entries);
  pushPersonal();
}

document.getElementById("trkMedBtn").addEventListener("click", function() {
  if (btnBusy(this)) return;
  doLogTrackMed();
});
document.querySelectorAll(".trkmed-chip").forEach(function(chip) {
  chip.addEventListener("click", function() {
    document.getElementById("trkMedName").value = chip.dataset.med;
    document.getElementById("trkMedDose").focus();
  });
});

function doLogTrackMed() {
  var name = document.getElementById("trkMedName").value.trim();
  if (!name) { toast("Enter a medicine name"); return; }
  var dose  = document.getElementById("trkMedDose").value.trim();
  var notes = document.getElementById("trkMedNotes").value.trim();
  var dtEl  = document.getElementById("trkMedDt");
  var ts    = dtEl && dtEl.value ? new Date(dtEl.value).getTime() : Date.now();
  if (isNaN(ts)) ts = Date.now();
  var entries = getTrackMed();
  entries.unshift({ id: Date.now(), name: name, dose: dose, notes: notes, ts: ts, updated: Date.now(), person: trackPerson() });
  entries.sort(function(a,b){ return b.ts - a.ts; });
  saveTrackMed(entries);
  document.getElementById("trkMedName").value = "";
  document.getElementById("trkMedDose").value = "";
  document.getElementById("trkMedNotes").value = "";
  if (dtEl) dtEl.value = localDatetimeValue();
  renderTrackMedicine();
  toast("&#x1F48A; Logged: " + name);
}

function renderTrackMedicine() {
  var dtEl = document.getElementById("trkMedDt");
  if (dtEl && !dtEl._initialised) { dtEl.value = localDatetimeValue(); dtEl._initialised = true; }
  var babyNote = document.getElementById("trkMedBabyNote");
  if (babyNote) babyNote.style.display = trackPerson() === "daughter" ? "" : "none";

  var entries = getTrackMed().filter(function(e){ return trackPersonOf(e) === trackPerson(); });
  var el = document.getElementById("trkMedList");
  if (!entries.length) {
    el.innerHTML = "<div style='text-align:center;padding:40px 24px;color:#B87A40'>" +
      "<div style='font-size:36px;margin-bottom:8px'>&#x1F48A;</div>" +
      "<div style='font-size:14px'>Log family medicine here<br><span style='opacity:.6'>Nurofen &#183; Panadol &#183; Amoxicillin</span></div></div>";
    return;
  }
  var byDate = {}, dateOrder = [];
  entries.forEach(function(e2) {
    var d = new Date(e2.ts);
    var dateKey = d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDate();
    var dateLabel = d.toLocaleDateString("en-IE", { weekday:"long", day:"numeric", month:"long" });
    if (!byDate[dateKey]) { byDate[dateKey] = { label:dateLabel, items:[] }; dateOrder.push(dateKey); }
    byDate[dateKey].items.push(e2);
  });
  var html = "";
  dateOrder.forEach(function(dk) {
    var group = byDate[dk];
    html += "<div style='font-size:11px;font-weight:700;color:#8A6A40;text-transform:uppercase;letter-spacing:.5px;padding:6px 14px 4px'>" + group.label + "</div>";
    group.items.forEach(function(e2) {
      var t = new Date(e2.ts);
      var timeStr = t.toLocaleTimeString("en-IE", { hour:"2-digit", minute:"2-digit" });
      html += "<div style='display:flex;align-items:center;gap:10px;padding:10px 14px;background:#fff;margin:0 12px 5px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.07)'>" +
        "<span class='trkmed-time-btn' data-medid='" + esc(e2.id) + "' style='font-size:12px;font-weight:700;color:#B87A40;min-width:42px;flex-shrink:0;cursor:pointer;touch-action:manipulation;text-decoration:underline dotted'>" + timeStr + "</span>" +
        "<div style='flex:1'><div style='font-size:14px;color:#2A2010'>" + esc(e2.name) + (e2.dose ? " &#8212; " + esc(e2.dose) : "") + "</div>" +
        (e2.notes ? "<div style='font-size:12px;color:#8A6A40'>" + esc(e2.notes) + "</div>" : "") + "</div>" +
        "<button data-medid='" + esc(e2.id) + "' class='trkmed-del-btn' style='border:none;background:none;color:#C06060;font-size:13px;cursor:pointer;touch-action:manipulation;opacity:.45'>&#x2715;</button>" +
      "</div>";
    });
  });
  el.innerHTML = html;

  el.querySelectorAll(".trkmed-del-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      confirmDialog("Delete this medicine entry?", function(){
        var id = +btn.dataset.medid;
        addTomb("track_med", id);
        saveTrackMed(getTrackMed().filter(function(e2){ return e2.id !== id; }));
        renderTrackMedicine();
      });
    });
  });

  el.querySelectorAll(".trkmed-time-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var id = +btn.dataset.medid;
      var entries2 = getTrackMed();
      var entry = entries2.find(function(e2){ return e2.id === id; });
      if (!entry) return;
      var existing = btn.parentElement.querySelector(".trkmed-dt-edit");
      if (existing) { existing.remove(); return; }
      var picker = document.createElement("div");
      picker.className = "trkmed-dt-edit";
      picker.style.cssText = "display:flex;gap:6px;align-items:center;padding:6px 14px;background:#FFF8F0;border-top:1px solid #E0D0B0;width:100%;box-sizing:border-box;margin-top:4px";
      picker.innerHTML = "<input type='datetime-local' value='" + localDatetimeValue(entry.ts) + "' style='flex:1;border:1.5px solid #E0D0B0;border-radius:7px;padding:7px 9px;font-family:inherit;font-size:13px;outline:none;background:#FDFAF3;color:#2A2010'>" +
        "<button style='padding:7px 12px;background:#A05A10;border:none;border-radius:7px;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation'>Save</button>" +
        "<button style='padding:7px 10px;background:#F0EDE8;border:none;border-radius:7px;color:#7A5A30;font-family:inherit;font-size:13px;cursor:pointer;touch-action:manipulation'>&#x2715;</button>";
      btn.parentElement.after(picker);
      picker.querySelector("button").addEventListener("click", function() {
        var val = picker.querySelector("input").value;
        var newTs = val ? new Date(val).getTime() : entry.ts;
        if (!isNaN(newTs)) {
          entry.ts = newTs;
          entry.updated = Date.now();
          entries2.sort(function(a,b){ return b.ts - a.ts; });
          saveTrackMed(entries2);
        }
        renderTrackMedicine();
      });
      picker.querySelectorAll("button")[1].addEventListener("click", function(){ picker.remove(); });
    });
  });
}

