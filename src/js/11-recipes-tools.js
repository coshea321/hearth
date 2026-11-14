// ── Tidy ingredients screen (v366) ────────────────────────────────────────
// Two steps, both review-first: ① every proposed line rewrite on one screen,
// tick per recipe, edit anything inline; ② once those are saved, offer to
// unify names that mean the same product across recipes. Nothing is written
// until the Apply button on that step is pressed.
var _tidyState = null;
var _tidyInputWired = false;   // #recipesContent is permanent — wire its delegated input listener once

function tidyLineValue(p, idx) {
  var k = p.id + ":" + idx;
  if (_tidyState.edits[k] != null) return _tidyState.edits[k];
  var l = p.lines[idx];
  return l.ok ? l.after : l.before;   // a flagged line keeps its original text
}

function buildTidyState() {
  var rb = getRecipeBook();
  var props = rb.map(tidyRecipeProposal).filter(function(p){
    return p.changedCount > 0 || p.flagCount > 0 || p.servesFlag;
  });
  var accept = {};
  // Pre-ticked: a recipe with confident changes is the normal case and
  // ticking 60 boxes by hand would defeat the point. Everything is visible
  // and untickable before anything is written.
  props.forEach(function(p){ accept[p.id] = p.changedCount > 0; });
  _tidyState = { step: "lines", recipes: props, accept: accept, edits: {}, serves: {},
                 expanded: {}, groups: [], picks: {}, custom: {} };
}

function renderRecipeTidy() {
  // Same guard the recipe editor uses: this screen holds unsaved input, so a
  // sync landing mid-review must not re-render it out from under Cathal.
  _recipeEditing = true;
  if (!_tidyState) buildTidyState();
  if (_tidyState.step === "names") return renderRecipeTidyNames();
  var el = document.getElementById("recipesContent");
  var st = _tidyState;
  var totalChanged = 0, totalFlagged = 0, accepted = 0;
  st.recipes.forEach(function(p){
    totalChanged += p.changedCount; totalFlagged += p.flagCount;
    if (st.accept[p.id]) accepted++;
  });

  var html =
    "<button id='tidyBackBtn' style='border:none;background:none;color:#B5651D;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px'>&larr; All recipes</button>" +
    "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:6px'>Tidy ingredients</div>";

  if (!st.recipes.length) {
    // The undo offer belongs here too — finishing a cleanup lands you on this
    // screen, and that is exactly when you might want it back.
    html += tidyUndoCardHtml() +
            "<div style='text-align:center;color:#8A7A5A;padding:30px 10px'><div style='font-size:34px;margin-bottom:8px'>&#x2728;</div>" +
            "<div style='font-size:15px;font-weight:600'>Nothing to tidy</div>" +
            "<div style='font-size:13px;margin-top:4px'>Every recipe already reads cleanly.</div></div>";
    el.innerHTML = html;
    document.getElementById("tidyBackBtn").addEventListener("click", tidyExit);
    wireTidyUndoBtn();
    return;
  }

  html +=
    "<div style='font-size:13px;color:#6A5A40;line-height:1.6;margin-bottom:10px'>" +
      "Moves the measure and prep wording out of each ingredient's name and into brackets, so the shopping list gets a name you can buy. " +
      "Nothing is saved until you tap Apply." +
    "</div>" +
    tidyUndoCardHtml() +
    "<div style='background:#FDF6E8;border:1px solid #E8D8B8;border-radius:10px;padding:10px 12px;margin-bottom:14px'>" +
      "<div style='font-size:13px;color:#7A5A30;font-weight:600;margin-bottom:6px'>&#x26A0;&#xFE0F; This rewrites recipes on every family device. You can put them back straight afterwards, on this phone only &mdash; a backup is the safer net.</div>" +
      "<button id='tidyBackupBtn' style='padding:7px 12px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:9px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>&#x2B07;&#xFE0F; Export a backup first</button>" +
    "</div>" +
    "<div style='font-size:13px;color:#6A5A40;margin-bottom:10px'>" +
      "<b>" + st.recipes.length + "</b> recipe" + (st.recipes.length!==1?"s":"") + " to look at &middot; <b>" + totalChanged + "</b> line" + (totalChanged!==1?"s":"") + " tidied" +
      (totalFlagged ? " &middot; <b style='color:#B5651D'>" + totalFlagged + "</b> need your eye" : "") +
    "</div>" +
    "<div style='display:flex;gap:8px;margin-bottom:12px'>" +
      "<button id='tidyAll' style='flex:1;padding:8px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:9px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>Tick all</button>" +
      "<button id='tidyNone' style='flex:1;padding:8px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:9px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>Untick all</button>" +
    "</div>";

  st.recipes.forEach(function(p){
    var on = !!st.accept[p.id], open = !!st.expanded[p.id];
    html += "<div style='border:1.5px solid " + (on?"#D8C0A0":"#ECE4D6") + ";background:" + (on?"#fff":"#FAF7F1") + ";border-radius:12px;margin-bottom:8px;overflow:hidden'>";
    // The row toggles expand, the checkbox toggles accept — two actions in one
    // strip, so the checkbox gets a padded hit box of its own rather than
    // relying on a 19px target next to a much bigger one.
    html += "<div class='tidy-hdr' data-id='" + esc(p.id) + "' style='display:flex;align-items:center;gap:6px;padding:11px 12px;cursor:pointer;min-height:44px;box-sizing:border-box'>" +
      "<span class='tidy-chkwrap' data-id='" + esc(p.id) + "' style='display:flex;align-items:center;justify-content:center;padding:12px;margin:-12px 0 -12px -12px;flex:none;cursor:pointer'>" +
        "<input type='checkbox' class='tidy-chk' data-id='" + esc(p.id) + "'" + (on?" checked":"") + " aria-label='Apply changes to " + esc(p.name).replace(/'/g,"&#39;") + "' style='width:22px;height:22px;flex:none'>" +
      "</span>" +
      "<div style='flex:1;min-width:0'>" +
        "<div style='font-size:15px;font-weight:600;color:#2A2010;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" + esc(p.name) + "</div>" +
        "<div style='font-size:12px;color:#8A7A5A;margin-top:2px'>" +
          (p.changedCount ? p.changedCount + " tidied" : "no changes") +
          (p.flagCount ? " &middot; <span style='color:#B5651D;font-weight:700'>" + p.flagCount + " needs your eye</span>" : "") +
          (p.servesFlag ? " &middot; <span style='color:#B5651D;font-weight:700'>serves?</span>" : "") +
        "</div>" +
      "</div>" +
      "<span style='color:#B5651D;font-size:13px;font-weight:700;flex:none'>" + (open?"Hide":"Show") + "</span>" +
    "</div>";
    if (open) {
      html += "<div style='padding:0 12px 12px'>";
      if (p.servesFlag) {
        var sv = st.serves[p.id] != null ? st.serves[p.id] : p.servings;
        html += "<div style='background:#FDF6E8;border:1px solid #E8D8B8;border-radius:9px;padding:9px 10px;margin-bottom:10px'>" +
          "<div style='font-size:12px;color:#7A5A30;margin-bottom:6px'>The amounts look bigger than " + p.servings + " serving" + (p.servings!==1?"s":"") + ". Set the right number if you know it &mdash; it's never guessed for you.</div>" +
          "<label style='display:flex;align-items:center;gap:8px;font-size:13px;color:#7A5A30;font-weight:600'>Serves " +
          "<input type='number' min='1' max='50' class='tidy-serves' data-id='" + esc(p.id) + "' value='" + sv + "' style='width:70px;padding:6px 8px;border:1.5px solid #D8C8A8;border-radius:8px;font-family:inherit;font-size:14px'>" +
          "</label></div>";
      }
      // EVERY line, not just the ones with something to say. Cathal's report:
      // "it is sometimes difficult to make a change without the context of the
      // full recipe" — a flagged line in isolation tells you nothing about
      // whether it's the tin or the topping. Untouched lines render quieter but
      // stay editable, so anything can be fixed from here.
      p.lines.forEach(function(l, idx){
        var val = tidyLineValue(p, idx);
        var flagged = !l.ok, quiet = l.ok && !l.changed;
        html += "<div style='padding:7px 0;border-top:1px dotted #ECE4D6'>" +
          "<div style='font-size:12px;color:#9A8A6A;margin-bottom:4px'>" +
            (flagged ? "<span style='color:#B5651D;font-weight:700'>&#x26A0;&#xFE0F; left as it was &mdash; " + esc(l.why || "couldn't tidy this one") + "</span>"
             : quiet ? "<span>already fine</span>"
                     : "<span style='text-decoration:line-through'>" + esc(l.before) + "</span>") +
          "</div>" +
          "<input type='text' class='tidy-line' data-key='" + esc(p.id) + ":" + idx + "' value='" + esc(val).replace(/'/g,"&#39;") + "' style='width:100%;box-sizing:border-box;padding:10px;border:1.5px solid " + (flagged?"#E8C89A":quiet?"#ECE4D6":"#D8C8A8") + ";border-radius:8px;font-family:inherit;font-size:14px;color:" + (quiet?"#7A6A50":"#2A2010") + ";background:" + (flagged?"#FFFBF3":"#fff") + "'>" +
        "</div>";
      });
      if (p.method) {
        html += "<div style='margin-top:10px;border-top:1px dotted #ECE4D6;padding-top:8px'>" +
          "<div style='font-size:11px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px'>Method &mdash; for context</div>" +
          "<div style='font-size:12px;color:#7A6A50;line-height:1.5;max-height:150px;overflow-y:auto;white-space:pre-wrap'>" + esc(p.method) + "</div>" +
        "</div>";
      }
      html += "</div>";
    }
    html += "</div>";
  });

  html += "<button id='tidyApply'" + (accepted?"":" disabled") + " style='width:100%;box-sizing:border-box;padding:13px;margin-top:10px;border:none;background:" + (accepted?"#2D6B35":"#D8CEBC") + ";color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:" + (accepted?"pointer":"default") + "'>Apply to " + accepted + " recipe" + (accepted!==1?"s":"") + "</button>";

  el.innerHTML = html;

  document.getElementById("tidyBackBtn").addEventListener("click", tidyExit);
  document.getElementById("tidyBackupBtn").addEventListener("click", exportAllData);
  wireTidyUndoBtn();
  document.getElementById("tidyAll").addEventListener("click", function(){
    st.recipes.forEach(function(p){ st.accept[p.id] = true; }); renderRecipeTidy();
  });
  document.getElementById("tidyNone").addEventListener("click", function(){
    st.recipes.forEach(function(p){ st.accept[p.id] = false; }); renderRecipeTidy();
  });
  // Typing is captured as it happens, so expanding another recipe (which
  // re-renders the whole screen) never loses an edit.
  // Wired ONCE: #recipesContent is a permanent element whose innerHTML is
  // replaced, so attaching per render would stack a new listener on every
  // expand/collapse/tick. Delegated off _tidyState rather than the closure,
  // since this listener outlives the render that created it.
  if (!_tidyInputWired) {
    _tidyInputWired = true;
    el.addEventListener("input", function(e){
      var t = e.target;
      if (!t || !t.classList || !_tidyState) return;
      if (t.classList.contains("tidy-line")) _tidyState.edits[t.getAttribute("data-key")] = t.value;
      else if (t.classList.contains("tidy-serves")) {
        var n = parseInt(t.value, 10);
        _tidyState.serves[t.getAttribute("data-id")] = (n > 0 ? n : null);
      }
    });
  }
  // Listen on the padded wrapper, not the 22px box, so a near-miss still hits.
  Array.prototype.forEach.call(el.querySelectorAll(".tidy-chkwrap"), function(w){
    w.addEventListener("click", function(e){
      e.stopPropagation();                       // never also expand the row
      var c = w.querySelector(".tidy-chk");
      if (!c) return;
      if (e.target !== c) c.checked = !c.checked; // tapped the padding, not the box
      st.accept[w.getAttribute("data-id")] = c.checked;
      renderRecipeTidy();
    });
  });
  Array.prototype.forEach.call(el.querySelectorAll(".tidy-hdr"), function(h){
    h.addEventListener("click", function(){
      var id = h.getAttribute("data-id");
      st.expanded[id] = !st.expanded[id];
      renderRecipeTidy();
    });
  });
  document.getElementById("tidyApply").addEventListener("click", function(){
    if (!accepted) return;
    confirmDialog("Rewrite the ingredients in " + accepted + " recipe" + (accepted!==1?"s":"") + "?", applyTidyLines);
  });
}

function tidyExit() {
  _tidyState = null;
  _recipeView = "list";
  renderRecipes();
}

// ── Narrow undo for a tidy pass (v366) ────────────────────────────────────
// "Export a backup first" is real protection but wildly disproportionate:
// restoring a whole Hearth backup to walk back a recipe cleanup would also
// roll back baby data, trips and lists. This keeps just enough to put the
// recipes back — previous ingredients and servings per recipe, plus the stamp
// we wrote, so a recipe touched since is left alone rather than clobbered.
// DEVICE-LOCAL and single-slot on purpose: it is a safety net for the minutes
// after a cleanup, not a version history. Never synced, never exported.
var TIDY_UNDO_KEY = "fl4_tidy_undo";
var TIDY_UNDO_DAYS = 7;

function tidySnapshotRecipe(r) {
  return { id: r.id, name: r.name || "",
           // Deep copy: the caller is about to replace these in place.
           ingredients: JSON.parse(JSON.stringify(r.ingredients || [])),
           servings: r.servings || 1,
           appliedUpdated: 0 };   // filled in once the new stamp is written
}
function tidySaveUndo(kind, entries) {
  if (!entries || !entries.length) return;
  storeSet(TIDY_UNDO_KEY, { kind: kind, ts: Date.now(), recipes: entries });
}
// The receipt, or null when there isn't a usable one.
function tidyUndoInfo() {
  var rec = storeGet(TIDY_UNDO_KEY);
  if (!rec || !rec.recipes || !rec.recipes.length || !rec.ts) return null;
  if (Date.now() - rec.ts > TIDY_UNDO_DAYS * 86400000) return null;
  return rec;
}
function applyTidyUndo() {
  var rec = tidyUndoInfo();
  if (!rec) return;
  var rb = getRecipeBook(), n = 0, stale = 0;
  rec.recipes.forEach(function(e){
    var r = rb.find(function(x){ return x && x.id === e.id; });
    if (!r) return;
    // Only put back what this cleanup actually wrote. Anything edited since —
    // here or on a partner's phone — keeps its newer version.
    if ((r.updated || 0) !== e.appliedUpdated) { stale++; return; }
    r.ingredients = e.ingredients;
    if (e.servings) r.servings = e.servings;
    r.updated = Date.now();
    n++;
  });
  saveRecipeBook(rb);
  pushPersonal();
  storeSet(TIDY_UNDO_KEY, null);
  toast("Put back " + n + " recipe" + (n!==1?"s":"") +
        (stale ? " &middot; " + stale + " changed since, left as they are" : ""));
  tidyExit();
}
// The undo offer, shown at the top of the tidy screen while a receipt lasts.
function tidyUndoCardHtml() {
  var rec = tidyUndoInfo();
  if (!rec) return "";
  var mins = Math.round((Date.now() - rec.ts) / 60000);
  var when = mins < 1 ? "just now" : mins < 60 ? mins + " min ago"
           : mins < 1440 ? Math.round(mins/60) + "h ago" : Math.round(mins/1440) + "d ago";
  return "<div style='background:#F1F6EE;border:1px solid #CFE0C6;border-radius:10px;padding:10px 12px;margin-bottom:14px'>" +
    "<div style='font-size:13px;color:#2D6B35;font-weight:600;margin-bottom:6px'>" +
      "Last " + (rec.kind === "names" ? "name merge" : "tidy") + ": " + rec.recipes.length +
      " recipe" + (rec.recipes.length!==1?"s":"") + " changed, " + when +
    "</div>" +
    "<button id='tidyUndoBtn' style='padding:7px 12px;border:1.5px solid #2D6B35;background:#fff;color:#2D6B35;border-radius:9px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>&#x21A9;&#xFE0F; Put them back</button>" +
  "</div>";
}
function wireTidyUndoBtn() {
  var b = document.getElementById("tidyUndoBtn");
  if (!b) return;
  b.addEventListener("click", function(){
    var rec = tidyUndoInfo();
    if (!rec) return;
    confirmDialog("Put " + rec.recipes.length + " recipe" + (rec.recipes.length!==1?"s":"") +
                  " back the way they were?", applyTidyUndo);
  });
}

function applyTidyLines() {
  var st = _tidyState;
  if (!st) return;
  var rb = getRecipeBook(), n = 0, skipped = 0, stale = 0, undo = [];
  st.recipes.forEach(function(p){
    if (!st.accept[p.id]) return;
    var r = rb.find(function(x){ return x && x.id === p.id; });
    if (!r) return;
    // The proposals were built from one read of the book, but working through
    // 60 recipes takes minutes and this screen suppresses its own re-render —
    // so a partner's edit (or a sync) can land underneath a review that still
    // shows the pre-edit text. Writing our rewrite of the OLD text would
    // silently discard their change, which is the stale-copy-wins-the-merge
    // class this app has been bitten by before. Skip and say so instead.
    if ((r.updated || 0) !== p.updated) { stale++; return; }
    var text = p.lines.map(function(_l, idx){ return tidyLineValue(p, idx); }).join("\n");
    var next = parseIngredients(text, false);
    // Never let a tidy pass empty a recipe out. If the rewrite produced fewer
    // ingredients than the recipe started with, something went wrong in the
    // text and losing them is worse than leaving the recipe untidied.
    if (next.length < p.lines.length) { skipped++; return; }
    var snap = tidySnapshotRecipe(r);      // before anything is replaced
    // A tidy rebuilds every ingredient from text, so the v368 shopping
    // preferences have to be carried onto the rewritten lines.
    r.ingredients = carryGroceryPrefs(next, r.ingredients);
    var sv = st.serves[p.id];
    if (sv && sv > 0 && sv !== r.servings) r.servings = sv;
    r.updated = Date.now();
    snap.appliedUpdated = r.updated;
    undo.push(snap);
    n++;
  });
  saveRecipeBook(rb);
  tidySaveUndo("lines", undo);
  pushPersonal();
  // Step two works off the saved names, so rebuild the groups now.
  st.groups = tidyNameGroups(getRecipeBook());
  st.picks = {}; st.custom = {};
  toast(n + " recipe" + (n!==1?"s":"") + " tidied" +
        (skipped ? " &middot; " + skipped + " skipped" : "") +
        (stale ? " &middot; " + stale + " changed on another device, left alone" : ""));
  if (st.groups.length) { st.step = "names"; renderRecipeTidy(); }
  else tidyExit();
}

function renderRecipeTidyNames() {
  var el = document.getElementById("recipesContent");
  var st = _tidyState;
  var picked = Object.keys(st.picks).filter(function(k){ return st.picks[k]; }).length;

  var html =
    "<button id='tidyBackBtn' style='border:none;background:none;color:#B5651D;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px'>&larr; All recipes</button>" +
    "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:6px'>Same thing, different names</div>" +
    "<div style='font-size:13px;color:#6A5A40;line-height:1.6;margin-bottom:14px'>" +
      "Ingredients written more than one way across your recipes. Pick the name you'd rather buy under and it's used everywhere. " +
      "Leave anything you're unsure about &mdash; they're only merged if you pick one." +
    "</div>";

  // Most groups are pure spelling or plural differences ("sea salt" / "Sea
  // salt"), which groceryNameKey already folds — merging them changes nothing
  // on the shopping list, they just bury the groups that DO need a decision.
  // One tap clears the lot. Only the synonym groups are real judgement calls.
  var trivial = st.groups.filter(function(g){ return !g.viaSynonym; }).length;
  if (trivial > 1) {
    html += "<button id='tidyPickCommon' style='width:100%;box-sizing:border-box;padding:11px;margin-bottom:12px;border:1.5px solid #2D6B35;background:#fff;color:#2D6B35;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Use the most common spelling everywhere (" + trivial + ")</button>";
  }

  st.groups.forEach(function(g, gi){
    html += "<div style='border:1.5px solid #ECE4D6;background:#fff;border-radius:12px;padding:12px;margin-bottom:8px'>";
    if (g.viaSynonym) {
      html += "<div style='font-size:12px;color:#B5651D;font-weight:700;margin-bottom:8px'>&#x26A0;&#xFE0F; Spelling variant &mdash; check these really are the same thing</div>";
    }
    g.variants.forEach(function(v){
      var on = st.picks[gi] === v.name;
      // Whole row is the target, min 44px — the name and the count are part of
      // the label, not decoration beside a 17px dot.
      html += "<label style='display:flex;align-items:center;gap:10px;padding:9px 0;min-height:44px;box-sizing:border-box;font-size:14px;color:#2A2010;cursor:pointer'>" +
        "<input type='radio' name='tidyg" + gi + "' class='tidy-pick' data-gi='" + esc(gi) + "' data-name='" + esc(v.name).replace(/'/g,"&#39;") + "'" + (on?" checked":"") + " style='width:20px;height:20px;flex:none'>" +
        "<span style='flex:1'>" + esc(v.name) + "</span>" +
        "<span style='font-size:12px;color:#9A8A6A;flex:none'>" + v.count + "&times;</span>" +
      "</label>";
    });
    // Neither spelling is always the one you want — the real book threw up
    // "scoop vanilla protein powder" vs "scoops Vanilla Protein Powder",
    // where the right answer is a third thing you type yourself.
    var cust = st.custom[gi] || "";
    var custOn = !!cust && st.picks[gi] === cust;
    // A plain div, NOT a label: a label wrapping both a radio and a text input
    // is ambiguous for screen readers and lets a tap meant for the box hit the
    // radio instead. Typing already selects the radio in the input handler.
    html += "<div style='display:flex;align-items:center;gap:10px;padding:9px 0;min-height:44px;box-sizing:border-box;border-top:1px dotted #ECE4D6;margin-top:4px'>" +
      "<input type='radio' name='tidyg" + gi + "' class='tidy-pick' data-gi='" + esc(gi) + "' data-custom='1'" + (custOn?" checked":"") + " aria-label='Use a name I type' style='width:20px;height:20px;flex:none'>" +
      "<input type='text' class='tidy-custom' data-gi='" + esc(gi) + "' value='" + esc(cust).replace(/'/g,"&#39;") + "' placeholder='Or type a different name' aria-label='A different name for this ingredient' style='flex:1;min-width:0;padding:10px 9px;border:1.5px solid #D8C8A8;border-radius:8px;font-family:inherit;font-size:14px;color:#2A2010'>" +
    "</div>";
    html += "<label style='display:flex;align-items:center;gap:10px;padding:9px 0;min-height:44px;box-sizing:border-box;font-size:14px;color:#8A7A5A;cursor:pointer'>" +
      "<input type='radio' name='tidyg" + gi + "' class='tidy-pick' data-gi='" + esc(gi) + "' data-name=''" + (st.picks[gi]?"":" checked") + " style='width:20px;height:20px;flex:none'>" +
      "<span>Leave as they are</span></label>";
    html += "</div>";
  });

  html += "<button id='tidyNamesApply'" + (picked?"":" disabled") + " style='width:100%;box-sizing:border-box;padding:13px;margin-top:10px;border:none;background:" + (picked?"#2D6B35":"#D8CEBC") + ";color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:" + (picked?"pointer":"default") + "'>Merge " + picked + " name" + (picked!==1?"s":"") + "</button>" +
    "<button id='tidyNamesSkip' style='width:100%;box-sizing:border-box;padding:11px;margin-top:8px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Done, leave names alone</button>";

  el.innerHTML = html;
  document.getElementById("tidyBackBtn").addEventListener("click", tidyExit);
  document.getElementById("tidyNamesSkip").addEventListener("click", tidyExit);
  var _pickCommon = document.getElementById("tidyPickCommon");
  if (_pickCommon) _pickCommon.addEventListener("click", function(){
    // variants are sorted count-desc, so [0] IS the most common spelling.
    st.groups.forEach(function(g, gi){ if (!g.viaSynonym) st.picks[gi] = g.variants[0].name; });
    renderRecipeTidyNames();   // a deliberate button tap, so a redraw is fine here
  });
  // Nothing on this screen re-renders on a tap or a keystroke: the radios keep
  // their own state and only the Apply button depends on the picks, so it is
  // updated in place. Re-rendering would take focus off the text box mid-word.
  Array.prototype.forEach.call(el.querySelectorAll(".tidy-pick"), function(radio){
    radio.addEventListener("change", function(){
      var gi = radio.getAttribute("data-gi");
      if (radio.getAttribute("data-custom")) {
        var box = el.querySelector(".tidy-custom[data-gi='" + gi + "']");
        st.picks[gi] = (box && box.value.trim()) || null;
        if (box) box.focus();
      } else {
        st.picks[gi] = radio.getAttribute("data-name") || null;
      }
      updateTidyNamesApply();
    });
  });
  Array.prototype.forEach.call(el.querySelectorAll(".tidy-custom"), function(box){
    box.addEventListener("input", function(){
      var gi = box.getAttribute("data-gi");
      st.custom[gi] = box.value;
      // Typing IS choosing — tick this group's custom radio rather than making
      // Cathal type the name and then remember to tap the button beside it.
      var radio = el.querySelector(".tidy-pick[data-gi='" + gi + "'][data-custom]");
      if (radio) radio.checked = true;
      st.picks[gi] = box.value.trim() || null;
      updateTidyNamesApply();
    });
  });
  document.getElementById("tidyNamesApply").addEventListener("click", function(){
    var n = Object.keys(st.picks).filter(function(k){ return st.picks[k]; }).length;
    if (!n) return;
    confirmDialog("Use the chosen name" + (n!==1?"s":"") + " across all recipes?", applyTidyNames);
  });
  updateTidyNamesApply();
}

// Keep the Merge button in step with the picks without redrawing the screen.
function updateTidyNamesApply() {
  var btn = document.getElementById("tidyNamesApply");
  if (!btn || !_tidyState) return;
  var n = Object.keys(_tidyState.picks).filter(function(k){ return _tidyState.picks[k]; }).length;
  btn.disabled = !n;
  btn.textContent = "Merge " + n + " name" + (n!==1?"s":"");
  btn.style.background = n ? "#2D6B35" : "#D8CEBC";
  btn.style.cursor = n ? "pointer" : "default";
}

function applyTidyNames() {
  var st = _tidyState;
  if (!st) return;
  // name-as-written → winner, for every group Cathal actually picked
  var map = {};
  st.groups.forEach(function(g, gi){
    var win = st.picks[gi];
    if (!win) return;
    g.variants.forEach(function(v){ if (v.name !== win) map[v.name] = win; });
  });
  var rb = getRecipeBook(), changed = 0, recipes = 0, undo = [];
  rb.forEach(function(r){
    var snap = tidySnapshotRecipe(r);      // before any name is replaced
    var touched = false;
    (r.ingredients || []).forEach(function(ing){
      if (isHeaderIng(ing)) return;
      var base = tidyBaseName(ing.name);
      if (!map[base]) return;
      // Keep the bracket detail — only the buyable part of the name changes.
      var br = String(ing.name || "").match(/\(([^)]*)\)/);
      ing.name = map[base] + (br ? " (" + br[1] + ")" : "");
      changed++; touched = true;
    });
    if (touched) {
      r.updated = Date.now();
      snap.appliedUpdated = r.updated;
      undo.push(snap);
      recipes++;
    }
  });
  saveRecipeBook(rb);
  tidySaveUndo("names", undo);
  pushPersonal();
  toast(changed + " ingredient" + (changed!==1?"s":"") + " renamed in " + recipes + " recipe" + (recipes!==1?"s":""));
  tidyExit();
}

function applyBulkInRotation(ids){
  var rb = getRecipeBook(), set = {}, n = 0;
  (ids||[]).forEach(function(id){ set[id] = true; });
  rb.forEach(function(r){ if (r && set[r.id] && !r.inRotation) { r.inRotation = true; r.updated = Date.now(); n++; } });
  saveRecipeBook(rb);
  _recipeSelectMode = false; _recipeSelected = {};
  renderRecipes();
  toast(n + " recipe" + (n!==1?"s":"") + " &#x1F501; added to rotation");
}
function applyBulkCategory(ids, category){
  var rb = getRecipeBook(), set = {}, n = 0;
  (ids||[]).forEach(function(id){ set[id] = true; });
  rb.forEach(function(r){ if (r && set[r.id]) { r.category = category; r.updated = Date.now(); n++; } });
  saveRecipeBook(rb);
  _recipeSelectMode = false; _recipeSelected = {};
  renderRecipes();
  toast(n + " recipe" + (n!==1?"s":"") + (category ? " &rarr; " + esc(category) : " set to Uncategorised"));
}
function openBulkCategoryPicker(ids){
  if (!ids || !ids.length) return;
  var seen = {}, cats = [];
  getRecipeBook().forEach(function(r){ var c=(r.category||"").trim(); if(c && !seen[c.toLowerCase()]){ seen[c.toLowerCase()]=1; cats.push(c); } });
  cats.sort(function(a,b){ return a.toLowerCase().localeCompare(b.toLowerCase()); });
  var chips = cats.map(function(c){ var v=esc(c).replace(/'/g,"&#39;"); return "<button type='button' class='bulkCatChip' data-cat='" + v + "' style='padding:7px 13px;border:1.5px solid #D8C0A0;background:#FBF4E8;color:#8A5A1A;border-radius:16px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer'>" + esc(c) + "</button>"; }).join("");
  var ov = document.createElement("div");
  ov.id = "bulkCatOverlay";
  ov.style.cssText = "position:fixed;inset:0;background:rgba(40,30,16,.45);display:flex;align-items:flex-end;justify-content:center;z-index:9999";
  ov.innerHTML =
    "<div style='background:#FFFDF7;width:100%;max-width:520px;border-radius:16px 16px 0 0;padding:18px 18px 22px;box-sizing:border-box;max-height:80vh;overflow:auto'>" +
      "<div style='font-size:16px;font-weight:800;color:#2A2010;margin-bottom:4px'>Set category</div>" +
      "<div style='font-size:13px;color:#8A7A5A;margin-bottom:14px'>" + ids.length + " recipe" + (ids.length!==1?"s":"") + " selected</div>" +
      (chips ? "<div style='display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px'>" + chips + "</div>" : "") +
      "<input id='bulkCatInput' placeholder='Or type a new category' style='" + recipeInputCss() + "margin-bottom:12px'>" +
      "<button id='bulkCatUncat' type='button' style='width:100%;padding:11px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:16px'>Set to Uncategorised</button>" +
      "<div style='display:flex;gap:8px'>" +
        "<button id='bulkCatCancel' type='button' style='flex:1;padding:12px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>Cancel</button>" +
        "<button id='bulkCatApply' type='button' style='flex:1;padding:12px;border:none;background:#B5651D;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>Apply</button>" +
      "</div>" +
    "</div>";
  document.body.appendChild(ov);
  function close(){ if (ov.parentNode) ov.parentNode.removeChild(ov); }
  var input = ov.querySelector("#bulkCatInput");
  ov.querySelectorAll(".bulkCatChip").forEach(function(b){ b.addEventListener("click", function(){ input.value = b.getAttribute("data-cat"); input.focus(); }); });
  ov.querySelector("#bulkCatUncat").addEventListener("click", function(){ close(); applyBulkCategory(ids, ""); });
  ov.querySelector("#bulkCatCancel").addEventListener("click", close);
  ov.querySelector("#bulkCatApply").addEventListener("click", function(){ close(); applyBulkCategory(ids, input.value.trim()); });
  ov.addEventListener("click", function(e){ if (e.target === ov) close(); });
}

// ── Method → numbered steps (v394) ────────────────────────────────────────
// The stored method text is NEVER rewritten — this is display only, so an
// edit still shows Cathal exactly what he typed or pasted.
//
// A leading step marker on a line ("1.", "2)", "Step 3:"). Deliberately narrow:
// 1–2 digits only and a "." or ")" or ":" separator that must be followed by a
// space, so "350. degrees", "1.5 tsp", "1/2 cup" and "2 - 3 mins" are all safe.
var METHOD_STEP_MARK = /^\s*(?:step\s*)?\d{1,2}\s*[.):]\s+/i;
// A leading bullet glyph, from a pasted list.
var METHOD_BULLET_MARK = /^\s*[•·▪◦*–—-]\s+/;

// Split a method into the pieces the detail view numbers. Returns a list of
// {type:"step"|"head", text}. Two splitting modes, because a pasted method is
// either explicitly numbered or it isn't:
//   - explicitly numbered (2+ marked lines): a marked line starts a step and
//     every unmarked line after it is a continuation. Hard-wrapped pastes
//     therefore stay in one step instead of exploding into fake ones.
//   - unnumbered: one line = one step, unless the line reads as a wrap
//     (starts lower-case AND the previous step didn't end a sentence).
function methodSteps(text){
  var t = String(text||"").replace(/\r\n?/g, "\n");
  if (!t.trim()) return [];
  t = t.replace(/([^\n])\s+(\d{1,2}[.)]\s)/g, "$1\n$2");          // break before "N. "
  t = t.replace(/([^\n])\s+(Step\s+\d+\b[:.]?\s*)/gi, "$1\n$2");  // break before "Step N"
  var lines = t.split("\n");
  var marked = 0;
  lines.forEach(function(l){ if (METHOD_STEP_MARK.test(l)) marked++; });
  var trustMarks = marked >= 2;

  var out = [], afterBlank = true;
  lines.forEach(function(raw){
    var line = raw.trim();
    if (!line) { afterBlank = true; return; }
    var bare = line.replace(/<\/?[^>]+>/g, "").trim();
    var mark = METHOD_STEP_MARK.test(line);
    // A short line ending in ":" is a sub-heading ("For the sauce:"), not a
    // step — numbering it would offset every step under it.
    if (!mark && /:$/.test(bare) && bare.split(/\s+/).length <= 6 && !/^(step\b|\d)/i.test(bare)) {
      out.push({ type: "head", text: bare.replace(/:\s*$/, "").trim() });
      afterBlank = false;
      return;
    }
    var body = mark ? line.replace(METHOD_STEP_MARK, "").trim()
                    : line.replace(METHOD_BULLET_MARK, "").trim();
    if (!body) return;
    var last = out.length ? out[out.length - 1] : null;
    var cont = false;
    if (last && last.type === "step" && !afterBlank) {
      cont = trustMarks ? !mark
                        : (/^[a-z(]/.test(body) && !/[.!?:;]$/.test(last.text));
    }
    if (cont) last.text += " " + body;
    else out.push({ type: "step", text: body });
    afterBlank = false;
  });
  return out;
}

// Render the method as an auto-numbered <ol>. Numbers come from the list, not
// from the text, so "1." typed into a step never doubles up as "1. 1.".
function formatMethod(text){
  var steps = methodSteps(text);
  if (!steps.length) return "";
  // A single unbroken block of prose isn't a step list — a lone "1." in front
  // of it is just noise, so it stays a paragraph.
  if (steps.length === 1 && steps[0].type === "step") {
    return "<p style='margin:0'>" + esc(steps[0].text) + "</p>";
  }
  var html = "", n = 0, open = false;
  steps.forEach(function(s){
    if (s.type === "head") {
      if (open) { html += "</ol>"; open = false; }
      html += "<div style='font-size:12px;font-weight:800;color:#B5651D;text-transform:uppercase;letter-spacing:.5px;margin:14px 0 8px'>" + esc(s.text) + "</div>";
      return;
    }
    // Each run of steps reopens the list with `start`, so a sub-heading in the
    // middle doesn't restart the numbering at 1.
    if (!open) { html += "<ol start='" + (n + 1) + "' style='margin:0;padding:0 0 0 22px'>"; open = true; }
    n++;
    html += "<li style='margin:0 0 10px;padding-left:3px;color:#B5651D'><span style='color:#2A2010'>" + esc(s.text) + "</span></li>";
  });
  if (open) html += "</ol>";
  return html;
}

// ── Prep (v396) ───────────────────────────────────────────────────────────
// A recipe carries an optional `prep` field: the work done before the cooking
// starts. Every recipe written before v396 has no such field, and asking
// Cathal to retro-fill the whole book by hand was the actual cost of this
// feature — so when nothing is typed the detail view DERIVES a prep list from
// the ingredient lines, which already carry most of it ("Garlic (minced)",
// "Onion, finely chopped"). That fallback is display-only: nothing is written
// to a recipe unless the editor's "use the prep from my ingredients" button is
// tapped, exactly like the v365 rescue-at-render below.
//
// A wider word list than GROCERY_PREP_WORDS, deliberately kept SEPARATE from
// it. That list drives what gets stripped out of a shopping name, so adding
// display-only wording to it would quietly change what lands on the grocery
// list — a much bigger blast radius than this feature deserves.
var RECIPE_PREP_WORDS = GROCERY_PREP_WORDS.concat([
  "cut","soaked","marinated","thawed","defrosted","toasted","sifted","mashed",
  "whisked","whipped","strained","pitted","cored","stemmed","deveined","scored",
  "boiled","cooked","room temperature","patted dry","brought to room temperature"
]);
var RECIPE_PREP_RE = new RegExp("(^|[^a-z])(" +
  RECIPE_PREP_WORDS.map(function(w){ return w.replace(/[-\s]/g, "[-\\s]"); }).join("|") +
  ")([^a-z]|$)", "i");

// Does a fragment read as an instruction rather than a measure? It has to
// contain a known prep word, so "425 g", "or 2 tbsp" and "15-ounce" are never
// listed as prep — the conservative direction, since a missed prep note costs
// nothing (the ingredient still shows it) while a wrong one is visible noise.
function isPrepPhrase(txt) {
  var s = String(txt || "").trim();
  if (!s) return false;
  return RECIPE_PREP_RE.test(s);
}

// Read a prep list off the ingredients. Returns [{name, prep}] — one entry per
// ingredient that actually says something, in recipe order.
function derivedPrepSteps(r) {
  var out = [];
  if (!r) return out;
  (r.ingredients || []).forEach(function(ing){
    if (!ing || isHeaderIng(ing) || !ing.name) return;
    var raw = String(ing.name);
    var bits = [];
    // Brackets first. The canonical v366 ingredient shape puts prep wording in
    // the bracket, and splitGroceryName deliberately never looks inside one.
    (raw.match(/\(([^)]*)\)/g) || []).forEach(function(b){
      b.slice(1, -1).split(",").forEach(function(p){ bits.push(p); });
    });
    // Then everything the grocery splitter already peels off a name: a " - "
    // clause, a comma clause, a trailing prep word.
    var sp = splitGroceryName(raw, ing.amount != null);
    if (sp.prep) sp.prep.split(",").forEach(function(p){ bits.push(p); });
    var prep = [];
    bits.forEach(function(p){
      p = String(p).trim().replace(/^(?:and|then)\s+/i, "").trim();
      if (p && isPrepPhrase(p) && prep.indexOf(p) === -1) prep.push(p);
    });
    if (!prep.length) return;
    out.push({ name: sp.name || cleanGroceryName(raw) || raw, prep: prep.join(", ") });
  });
  return out;
}

// One derived step as a line of text — the same wording the editor's button
// writes into the textarea, so what you see is what you'd get.
function prepStepLine(s){ return s.name + " — " + s.prep; }

// The derived list, rendered in the same shape formatMethod uses so a derived
// prep block and a typed one look identical apart from the footnote.
function derivedPrepHtml(steps) {
  if (!steps || !steps.length) return "";
  var html = "<ol style='margin:0;padding:0 0 0 22px'>";
  steps.forEach(function(s){
    html += "<li style='margin:0 0 10px;padding-left:3px;color:#B5651D'><span style='color:#2A2010'>" +
            esc(s.name) + " &mdash; " + esc(s.prep) + "</span></li>";
  });
  return html + "</ol><div style='font-size:11px;color:#9A8A6A;margin-top:8px'>Read from your ingredient list. Edit the recipe to write your own.</div>";
}

// ── Prep helper: copy out → write the prep elsewhere → paste back (v397) ──
// The derived reader above can only surface prep that is already attached to
// an ingredient. "Preheat the oven", "take the butter out an hour ahead" and
// "soak the beans overnight" live in the method or nowhere, so this is the
// route for filling those in across the whole book at once: copy the recipes,
// have something write the prep, paste the reply back, review it, apply.
//
// DELIBERATELY PREP-ONLY. Recipes have no JSON export today, and a full
// recipe file would put every field an import could damage — grocery
// preferences, favourites, lastCooked, inRotation — inside the blast radius
// of a paste. This round trip reads a lot and writes exactly one field.
var RECIPE_PREP_FILE_TAG = "recipe-prep-v1";
// null | { step:"copy"|"review", rows:[], accept:{}, edits:{}, unmatched:[], error:"" }
var _prepHelperState = null;

// One recipe as whatever writes the prep needs to see it: what it is, what
// goes in, what you do. Nothing else is any of its business.
function prepExportRecipeBlock(r) {
  var out = ["id " + r.id + " — " + (r.name || "Untitled") + " (serves " + (r.servings || 1) + ")"];
  var ings = (r.ingredients || []).map(function(ing){
    if (!ing || !ing.name) return "";
    if (isHeaderIng(ing)) return "  " + headerLabel(ing) + ":";
    return "  - " + ingredientToLine(ing);
  }).filter(Boolean);
  if (ings.length) out.push("Ingredients:", ings.join("\n"));
  if (r.method) out.push("Method:", "  " + String(r.method).replace(/\n/g, "\n  "));
  if (r.prep) out.push("Prep already written:", "  " + String(r.prep).replace(/\n/g, "\n  "));
  return out.join("\n");
}

// How much goes into one copy. v398 batched by COUNT (20 recipes) and that
// was the wrong unit: real recipes vary enormously. Cathal's book has a
// three-line "Chicken Soya" sitting beside a bread recipe with a 4,000-
// character method and a drink whose "method" is an entire scraped article.
// Twenty of the short ones is a small paste; twenty of the long ones is a
// paste that gets cut off in transit and a reply that stops partway. Budget
// characters instead and let the recipe count fall out of it.
var PREP_BATCH_CHARS = 12000;

// [{from, to, blocks}] over the book, packed so no batch exceeds the budget.
// The one exception is a single recipe longer than the whole budget on its
// own — it gets a batch to itself rather than being dropped, because a
// recipe you can't copy at all is worse than one long paste.
function prepBatchRanges(rb) {
  var out = [], cur = null, used = 0;
  (rb || []).filter(Boolean).forEach(function(r, i){
    var block = prepExportRecipeBlock(r);
    var len = block.length + 2;                  // the blank line between blocks
    if (cur && used + len > PREP_BATCH_CHARS) cur = null;
    if (!cur) { cur = { from: i, to: i, blocks: [] }; out.push(cur); used = 0; }
    cur.to = i;
    cur.blocks.push(block);
    used += len;
  });
  return out;
}

function prepBatchCount(rb) {
  return Math.max(1, prepBatchRanges(rb).length);
}

// The clipboard payload for one batch: the instructions AND those recipes, so
// there is one thing to paste rather than two. `batch` is 0-based.
function prepExportText(batch) {
  var rb = getRecipeBook().filter(Boolean);
  var ranges = prepBatchRanges(rb);
  var count = Math.max(1, ranges.length);
  var b = Math.min(Math.max(parseInt(batch, 10) || 0, 0), count - 1);
  var range = ranges[b] || { from: 0, to: -1, blocks: [] };
  var L = [];
  L.push("I keep my recipes in an app called Hearth. My whole recipe book is below.");
  L.push("");
  L.push("For each recipe, write a PREP section: the work done BEFORE the cooking starts.");
  L.push("");
  L.push("Rules:");
  L.push("- Prep only — chopping, slicing, measuring out, preheating the oven, bringing something to room temperature, soaking, marinating, lining a tin, boiling a kettle. NOT the cooking itself; that is already in the method.");
  L.push("- One step per line. Plain text, no numbering and no bullet characters — the app numbers them.");
  L.push("- GROUP BY WHAT GOES IN TOGETHER. A step is one moment in the method, not one ingredient. Read the method and see which ingredients hit the pan at the same time, then make those a single line — \"Mince the garlic and set it out with the chili powder, cumin, chipotle and salt\", \"Rinse the black beans and set them out with the tomatoes and lime juice\". Ingredients that go in alone, or need different work (peeling, dicing, soaking), stay on their own line.");
  L.push("- Include the spices and the garnish. Measuring the dry spices into one dish, and chopping the herbs that get stirred in at the end, are both prep.");
  L.push("- Keep it short: at most 6 lines per recipe, usually fewer.");
  L.push("- Work only from what the recipe already says. Do not invent ingredients, quantities or techniques that are not there.");
  L.push("- If a recipe genuinely needs no prep, give it \"\".");
  L.push("- Where prep is already written, repeat it back unless you can genuinely improve it — regrouping loose one-ingredient lines into the steps above counts as an improvement.");
  L.push("");
  // The fence is not cosmetic: a fenced block renders in a chat with a
  // one-tap Copy button, and loose prose does not — it has to be hand-selected,
  // which is miserable on a phone. v402 asked for NO fence and made copying
  // worse than the JSON it replaced (JSON at least usually arrived fenced).
  L.push("Put your WHOLE reply inside a single code block (three backticks before and after), so it can be copied in one tap on a phone.");
  L.push("");
  L.push("Inside that code block, reply in EXACTLY this format and nothing else — no explanation, no note, no apology, even if something in the recipes is unclear or missing:");
  L.push("");
  L.push("=== 123");
  L.push("Finely chop the onion");
  L.push("Preheat the oven to 200C");
  L.push("");
  L.push("=== 456");
  L.push("Rinse the beans and set them out with the tomatoes");
  L.push("");
  L.push("Format rules:");
  L.push("- One block per recipe. The block starts with === followed by the recipe's id, then one prep step per line.");
  L.push("- A blank line between blocks.");
  L.push("- Plain text only. Do NOT use JSON, quotes around anything, backslashes, or escape sequences — write inch marks, apostrophes and accents literally and they will be fine.");
  L.push("- A recipe that needs no prep: give the === line and no steps under it.");
  L.push("- Keep each id exactly as given — the app matches on it.");
  L.push("- The code block is the whole reply. Do not write anything above or below it, and do not split it into several code blocks.");
  L.push("");
  // The batch line is for the reader as much as the model: pasting batch 4
  // into a fresh chat should be obviously batch 4, not a mystery half-book.
  L.push(count > 1
    ? "--- MY RECIPES — BATCH " + (b + 1) + " OF " + count + " (recipes " + (range.from + 1) + "-" + (range.to + 1) + " of " + rb.length + ") ---"
    : "--- MY RECIPES (" + rb.length + ") ---");
  range.blocks.forEach(function(block){ L.push(""); L.push(block); });
  return L.join("\n");
}

// Clipboard with an execCommand fallback — writeText needs a user gesture and
// a secure context, and neither is guaranteed on every browser this opens in.
// Kept separate from plantCopyPrompt rather than refactoring it: that one
// works, and widening a Plants function inside a Recipes version buys nothing.
function prepCopyToClipboard(text) {
  function fallback() {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      toast(ok ? "&#x1F4CB; Recipes copied" : "Couldn't copy — select the text below by hand");
    } catch (e) { toast("Couldn't copy — select the text below by hand"); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function(){ toast("&#x1F4CB; Recipes copied"); }, fallback);
  } else { fallback(); }
}

// Text pasted back out of a chat is a known source of invisible characters —
// v395 lost a whole recipe's amounts to a U+200B in front of every line, and
// one inside a JSON string would break the parse outright.
function prepStripInvisible(s) {
  return String(s == null ? "" : s)
    .replace(/[\u200b\u200c\u200d\u2060\ufeff\xad\u200e\u200f]/g, "");
}

// Returns {rows, unmatched} or {error}. Rows are matched against the book
// here, not at apply time, so the review screen can only ever offer real
// recipes.
// The "=== <id>" block format (v402). JSON kept breaking on recipe text: a
// reply containing `⅛" slices` fails JSON.parse outright, because the inch
// mark closes the string. Inches, 9x5" tins and quoted names are ordinary in
// recipes, so asking a model to remember escaping mid-recipe is a losing
// battle. This format has NO quoting or escaping at all, so there is nothing
// to get wrong; it is far easier to select than one enormous JSON line; and
// because each block stands alone, a reply that gets cut off part-way still
// imports every complete block before the cut instead of failing entirely.
// Deliberately forgiving (v404). Cathal's first real paste began
// `.=== 1782917881957` — one stray character before the marker, and under the
// original strict `^\s*={2,}\s*(\d+)\s*$` that whole line failed to match, so
// the block AND its four prep lines were swallowed as preamble and the recipe
// vanished with no message. Silently losing a recipe is far worse than
// refusing the paste, so the marker now tolerates anything non-alphanumeric
// around it: a stray dot, a list dash, markdown bold or a heading hash. A prep
// step would have to begin with punctuation and then "==" to false-positive,
// which doesn't happen in recipe text.
var PREP_BLOCK_MARK = /^[^A-Za-z0-9]*={2,}[^0-9\n]*(\d+)/;
// Anything that mentions === near a number is *meant* to be a marker. Used
// only to catch a line the marker itself somehow still missed, so the parser
// can say so instead of dropping a recipe.
var PREP_BLOCK_HINT = /={2,}[^0-9\n]*\d/;

function parsePrepBlocks(s) {
  var lines = String(s).replace(/\r\n?/g, "\n").split("\n");
  var out = [], cur = null, missed = [];
  lines.forEach(function(line){
    var m = line.match(PREP_BLOCK_MARK);
    if (m) { cur = { id: m[1], steps: [] }; out.push(cur); return; }
    if (PREP_BLOCK_HINT.test(line)) missed.push(line.trim());  // looked like a marker, wasn't
    if (!cur) return;                                   // preamble before the first block
    var t = line.trim();
    if (!t) return;
    if (/^```/.test(t)) return;                         // a stray fence, if one slipped in
    cur.steps.push(t.replace(METHOD_BULLET_MARK, "").trim());
  });
  return {
    entries: out.map(function(b){
      return { id: b.id, prep: b.steps.filter(Boolean).join("\n") };
    }),
    missed: missed
  };
}

function parsePrepReply(raw) {
  var s = prepStripInvisible(raw).trim();
  if (!s) return { error: "Paste the reply into the box first." };
  // Block format takes precedence: its marker is unambiguous, and a reply
  // carrying it should never be second-guessed by the JSON path.
  if (PREP_BLOCK_HINT.test(s)) {
    var parsed = parsePrepBlocks(s);
    // A line that reads like a marker but produced no block must never be
    // dropped in silence — that is exactly how a whole recipe went missing.
    if (parsed.missed.length) {
      return { error: "Couldn't read this line: “" + parsed.missed[0].slice(0, 60) + "”. Every recipe should start with === and its number." };
    }
    return matchPrepEntries(parsed.entries);
  }
  // A chat reply arrives wrapped in a ``` fence about as often as not, and
  // sometimes with a sentence either side of it. Take the outermost {...}
  // rather than demanding a surgically clean paste.
  s = stripPasteFence(s);
  var a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a !== -1 && b > a) s = s.slice(a, b + 1);
  var obj;
  try { obj = JSON.parse(s); }
  catch (e) { return { error: "Couldn't read that as JSON. Paste the whole reply, including the { and the }." }; }
  if (!obj || obj.hearth !== RECIPE_PREP_FILE_TAG) {
    return { error: "That doesn't look like a Hearth prep reply — it needs \"hearth\":\"" + RECIPE_PREP_FILE_TAG + "\"." };
  }
  return matchPrepEntries(Array.isArray(obj.recipes) ? obj.recipes : [obj]);
}

// Shared by both reply formats: turn {id, name, prep} entries into review rows
// matched against the real book. Matching lives here rather than at apply time
// so the review screen can only ever offer recipes that actually exist.
function matchPrepEntries(list) {
  var rb = getRecipeBook();
  var rows = [], unmatched = [], seen = {};
  (list || []).forEach(function(src){
    if (!src || typeof src !== "object" || Array.isArray(src)) return;
    var prep = prepStripInvisible(src.prep).replace(/\r\n?/g, "\n").trim();
    if (!prep) return;                                   // "" means nothing offered
    var rec = null;
    if (src.id != null) {
      rec = rb.find(function(x){ return x && String(x.id) === String(src.id); });
    }
    if (!rec && src.name) {                              // id mangled in the round trip
      var n = String(src.name).trim().toLowerCase();
      rec = rb.find(function(x){ return x && String(x.name || "").trim().toLowerCase() === n; });
    }
    if (!rec) { unmatched.push(String(src.name || src.id || "?")); return; }
    if (seen[rec.id]) return;                            // one row per recipe, first wins
    seen[rec.id] = true;
    rows.push({ id: rec.id, name: rec.name || "", prep: prep, existing: String(rec.prep || "") });
  });
  if (!rows.length) {
    return { error: unmatched.length
      ? "None of those recipes are in your book any more."
      : "No prep found in that reply." };
  }
  return { rows: rows, unmatched: unmatched };
}

// The text a row would actually write — an inline edit wins over what came back.
function prepRowValue(row) {
  var e = _prepHelperState && _prepHelperState.edits[row.id];
  return String(e != null ? e : row.prep).trim();
}

// ── Calorie helper: copy out → price it elsewhere → paste back (v436) ─────
// v434 gave a recipe a `kcal` field (calories per SERVING) and made the food
// journal log off it, but every figure had to be typed in one recipe at a
// time. This is the same round trip as the prep helper above, writing that
// one field instead: copy the recipes out, have something estimate them,
// paste the reply back, review it, apply.
//
// The reason it is a copy-out/paste-back and not a calculation inside the app
// is the v434 rule and it has not changed: FOOD_CAL is mixed-basis (butter
// and cheese per 100g, egg and bread per item) with no per-unit basis stored
// to multiply ingredient amounts against, so the app cannot price an
// ingredient list. Something that can read the recipe has to do it, and the
// number still arrives as a PROPOSAL that Cathal reviews and can edit before
// a single recipe is written.
//
// DELIBERATELY kcal-ONLY, exactly like the prep helper: this round trip reads
// a lot and writes one integer. Don't widen it to other fields without a
// fresh design call — the narrowness IS the safety argument.
// null | { step:"copy"|"review", batch, rows:[], accept:{}, edits:{}, unreadable:[], error:"", includeAll:false }
var _calHelperState = null;

// What goes out. Default is the recipes with NO figure yet — the job is
// filling in the blanks, and re-sending priced recipes just burns the paste
// budget. The toggle re-prices the whole book when a figure looks wrong.
// `filter` is the SECTION (v437): "all" | "fav" | a category name, the same
// three shapes and the same meanings as the recipe list's own _recipeFilter.
// It is a separate axis from includeAll -- section says WHICH recipes,
// includeAll says whether the ones already priced are among them -- so both
// apply at once and neither replaces the other. Omitted (the pre-v437 call
// shape) means every section.
function calHelperPool(includeAll, filter) {
  var rb = getRecipeBook().filter(Boolean);
  if (filter && filter !== "all") {
    rb = rb.filter(function(r){
      return filter === "fav" ? !!r.fav : String(r.category || "").trim() === filter;
    });
  }
  return includeAll ? rb : rb.filter(function(r){ return !r.kcal; });
}

// The book's categories in use, sorted — the chip row's middle section, built
// the same way the recipe list builds its own.
function calHelperCats() {
  var cats = [];
  getRecipeBook().filter(Boolean).forEach(function(r){
    var c = String(r.category || "").trim();
    if (c && cats.indexOf(c) === -1) cats.push(c);
  });
  return cats.sort();
}

function calHelperHasFav() {
  return getRecipeBook().filter(Boolean).some(function(r){ return !!r.fav; });
}

// Chip row for the copy step. Rendered even when the current section is empty:
// an empty section with no way off it is a dead end, and the whole point of
// the row is switching between them.
function calFilterBarHTML(cur) {
  var bar = "<div style='display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px'>";
  function chip(key, label) {
    var on = cur === key;
    return "<button class='cal-filter' data-key='" + esc(key).replace(/'/g, "&#39;") + "' style='border:1.5px solid " + (on ? "#B5651D" : "#E0D0B8") + ";background:" + (on ? "#B5651D" : "#fff") + ";color:" + (on ? "#fff" : "#7A5A30") + ";border-radius:14px;padding:5px 13px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer'>" + label + "</button>";
  }
  bar += chip("all", "All");
  if (calHelperHasFav()) bar += chip("fav", "&#x2605; Favourites");
  calHelperCats().forEach(function(c){ bar += chip(c, esc(c)); });
  return bar + "</div>";
}

// What the current section is called in a sentence.
function calFilterLabel(f) {
  if (!f || f === "all") return "recipe";
  if (f === "fav") return "favourite";
  return f + " recipe";
}

// One recipe as something pricing it needs to see: what it is, how many it
// serves (the answer is PER SERVING, so this is the load-bearing number), what
// goes in, and how it is cooked. The method stays in full and untruncated —
// "deep fry in 1L of oil" is the difference between 400 and 900 kcal, and a
// truncation would cut exactly that kind of line. Length is the batcher's
// problem, not this function's.
function calExportRecipeBlock(r) {
  var out = ["id " + r.id + " — " + (r.name || "Untitled") + " (serves " + (r.servings || 1) + ")"];
  var ings = (r.ingredients || []).map(function(ing){
    if (!ing || !ing.name) return "";
    if (isHeaderIng(ing)) return "  " + headerLabel(ing) + ":";
    return "  - " + ingredientToLine(ing);
  }).filter(Boolean);
  if (ings.length) out.push("Ingredients:", ings.join("\n"));
  if (r.method) out.push("Method:", "  " + String(r.method).replace(/\n/g, "\n  "));
  if (r.kcal) out.push("Figure already set: " + r.kcal + " kcal per serving");
  return out.join("\n");
}

// Same character budget and the same packing rule as the prep helper — one
// transport limit, one number to tune. Kept as its own function rather than
// widening prepBatchRanges: that one works, and the pool it runs over here is
// a filtered list, not the whole book.
function calBatchRanges(list) {
  var out = [], cur = null, used = 0;
  (list || []).filter(Boolean).forEach(function(r, i){
    var b = calExportRecipeBlock(r);
    var len = b.length + 2;                      // the blank line between blocks
    if (cur && used + len > PREP_BATCH_CHARS) cur = null;
    if (!cur) { cur = { from: i, to: i, blocks: [] }; out.push(cur); used = 0; }
    cur.to = i;
    cur.blocks.push(b);
    used += len;
  });
  return out;
}

function calBatchCount(list) {
  return Math.max(1, calBatchRanges(list).length);
}

// The clipboard payload for one batch: the instructions AND those recipes, so
// there is one thing to paste rather than two. `batch` is 0-based.
function calExportText(batch, includeAll, filter) {
  var pool = calHelperPool(includeAll, filter);
  var ranges = calBatchRanges(pool);
  var count = Math.max(1, ranges.length);
  var b = Math.min(Math.max(parseInt(batch, 10) || 0, 0), count - 1);
  var range = ranges[b] || { from: 0, to: -1, blocks: [] };
  var L = [];
  L.push("I keep my recipes in an app called Hearth. Some of my recipes are below.");
  L.push("");
  L.push("For each recipe, estimate the CALORIES IN ONE SERVING.");
  L.push("");
  L.push("Rules:");
  L.push("- PER SERVING, not for the whole dish. Each recipe says how many it serves — work out the total and divide by that number.");
  L.push("- A whole number of kcal. No range, no decimal, no \"about\".");
  L.push("- Count the cooking fat. Oil, butter and the like in the method count even when the method is vague about how much; assume a normal amount for the pan size.");
  L.push("- Where a quantity is missing or vague, use an ordinary household amount for a dish of that size rather than skipping the ingredient.");
  L.push("- Ignore anything served alongside that is not in the ingredients. Price the dish as written.");
  L.push("- A rough, honest estimate is what is wanted. Do not refuse a recipe because the ingredients are imprecise — every recipe below should come back with a number.");
  L.push("");
  L.push("Put your WHOLE reply inside a single code block (three backticks before and after), so it can be copied in one tap on a phone.");
  L.push("");
  L.push("Inside that code block, reply in EXACTLY this format and nothing else — no explanation, no working, no note, no apology:");
  L.push("");
  L.push("=== 123");
  L.push("520");
  L.push("");
  L.push("=== 456");
  L.push("310");
  L.push("");
  L.push("Format rules:");
  L.push("- One block per recipe. The block starts with === followed by the recipe's id, then the number of kcal per serving on the next line, on its own.");
  L.push("- A blank line between blocks.");
  L.push("- Just the number. No units, no commas, no quotes, no JSON, no working out.");
  L.push("- Keep each id exactly as given — the app matches on it.");
  L.push("- The code block is the whole reply. Do not write anything above or below it, and do not split it into several code blocks.");
  L.push("");
  L.push(count > 1
    ? "--- MY RECIPES — BATCH " + (b + 1) + " OF " + count + " (recipes " + (range.from + 1) + "-" + (range.to + 1) + " of " + pool.length + ") ---"
    : "--- MY RECIPES (" + pool.length + ") ---");
  range.blocks.forEach(function(bl){ L.push(""); L.push(bl); });
  return L.join("\n");
}

// Reuses the prep helper's block format and its two marker regexes verbatim —
// the "=== <id>" shape with no quoting or escaping anywhere is the v402/v404
// lesson, and a reply made of bare integers has even less to get wrong. What
// differs is only what a block's body means: one number, not prep lines.
function parseCalReply(raw) {
  var s = prepStripInvisible(raw).trim();
  if (!s) return { error: "Paste the reply into the box first." };
  if (!PREP_BLOCK_HINT.test(s)) {
    return { error: "That doesn't look like a reply from the prompt above — every recipe should start with === and its number." };
  }
  var lines = String(s).replace(/\r\n?/g, "\n").split("\n");
  var blocks = [], cur = null, missed = [];
  lines.forEach(function(line){
    var m = line.match(PREP_BLOCK_MARK);
    if (m) { cur = { id: m[1], body: [] }; blocks.push(cur); return; }
    if (PREP_BLOCK_HINT.test(line)) { missed.push(line.trim()); return; }
    if (!cur) return;                                   // preamble before the first block
    var t = line.trim();
    if (!t || /^```/.test(t)) return;
    cur.body.push(t);
  });
  // A line that reads like a marker but produced no block must never be
  // dropped in silence — the prep helper learned that the hard way.
  if (missed.length) {
    return { error: "Couldn't read this line: “" + missed[0].slice(0, 60) + "”. Every recipe should start with === and its number." };
  }

  var rb = getRecipeBook();
  var rows = [], unreadable = [], seen = {};
  blocks.forEach(function(bk){
    var rec = rb.find(function(x){ return x && String(x.id) === String(bk.id); });
    if (!rec) { unreadable.push("id " + bk.id + " (no such recipe)"); return; }
    if (seen[rec.id]) return;                           // one row per recipe, first wins
    // First integer in the block body, so "520", "520 kcal" and "~520" all read.
    var m = bk.body.join(" ").replace(/,/g, "").match(/\d+/);
    var n = m ? parseInt(m[0], 10) : 0;
    if (!n || n < 1 || n > 9999) {
      unreadable.push((rec.name || ("id " + bk.id)) + (m ? " (" + m[0] + "?)" : " (no number)"));
      return;
    }
    seen[rec.id] = true;
    rows.push({ id: rec.id, name: rec.name || "", kcal: n, existing: rec.kcal || 0 });
  });

  if (!rows.length) {
    return { error: unreadable.length
      ? "No usable numbers in that reply — nothing matched a recipe in your book."
      : "No calorie figures found in that reply." };
  }
  return { rows: rows, unreadable: unreadable };
}

// The number a row would actually write — an inline edit wins over what came
// back. Returns 0 for anything out of range, which apply reads as "skip".
function calRowValue(row) {
  var e = _calHelperState && _calHelperState.edits[row.id];
  var n = parseInt(e != null ? e : row.kcal, 10);
  if (!n || n < 1 || n > 9999) return 0;
  return n;
}

// Writes ONLY `kcal`, and only on ticked rows. Every other field on the record
// is left exactly as it was — same narrowness as applyPrepImport, same reason.
function applyCalImport() {
  var st = _calHelperState;
  if (!st) return;
  var rb = getRecipeBook();
  var n = 0;
  st.rows.forEach(function(row){
    if (!st.accept[row.id]) return;
    var i = rb.findIndex(function(x){ return x && x.id === row.id; });
    if (i < 0) return;                       // deleted on another device mid-review — guard the -1
    var v = calRowValue(row);
    if (!v) return;                          // emptied or nonsense inline = "leave this one alone"
    rb[i].kcal = v;
    rb[i].updated = Date.now();              // unstamped mutations lose the merge (v353)
    n++;
  });
  saveRecipeBook(rb);
  toast(n ? ("Calories set on " + n + " recipe" + (n !== 1 ? "s" : "")) : "Nothing applied");

  // Batch advance differs from the prep helper's on purpose. On the default
  // pool the recipes just applied DROP OUT of it, so the remaining unpriced
  // ones renumber from the start — advancing the index here would skip a
  // batch's worth of recipes. Only the whole-book pool is stable enough to
  // step through.
  var pool = calHelperPool(st.includeAll, st.filter);
  if (!pool.length) { calHelperExit(); return; }
  var count = calBatchCount(pool);
  if (count > 1 || !st.includeAll) {
    st.step = "copy";
    st.batch = st.includeAll ? Math.min((st.batch || 0) + 1, count - 1) : 0;
    st.rows = []; st.accept = {}; st.edits = {}; st.unreadable = []; st.error = "";
    renderCalHelper();
    return;
  }
  calHelperExit();
}

// Shared by both copy-step renders. A section change resets the batch index:
// the pool it indexed into no longer exists.
function calWireFilterChips(el, st) {
  Array.prototype.forEach.call(el.querySelectorAll(".cal-filter"), function(b){
    b.addEventListener("click", function(){
      st.filter = b.getAttribute("data-key");
      st.batch = 0;
      st.error = "";
      renderCalHelper();
    });
  });
}

function calHelperExit() {
  _calHelperState = null;
  _recipeView = "list";
  renderRecipes();
}

function renderCalHelper() {
  // Same guard the editor and the prep helper use: this screen holds unsaved
  // input, so a sync landing mid-review must not redraw it out from under him.
  _recipeEditing = true;
  // Opens on Favourites (v437), the same default and the same fallback as the
  // recipe list itself — that is the section Cathal works in, and defaulting
  // anywhere else would mean a chip tap every single time.
  if (!_calHelperState) _calHelperState = { step: "copy", batch: 0, rows: [], accept: {}, edits: {}, unreadable: [], error: "", includeAll: false, filter: "fav" };
  var st = _calHelperState;
  var el = document.getElementById("recipesContent");
  var head =
    "<button id='calBackBtn' style='border:none;background:none;color:#B5651D;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px'>&larr; All recipes</button>" +
    "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:6px'>Calorie helper</div>";

  if (st.step === "review") { renderCalHelperReview(el, st, head); return; }

  var rb = getRecipeBook().filter(Boolean);
  // Never open on an empty section: the same guard the recipe list uses, for
  // a book with no favourites yet.
  if (st.filter === "fav" && !calHelperHasFav()) st.filter = "all";
  // A category renamed or emptied out from under a held state.
  if (st.filter && st.filter !== "all" && st.filter !== "fav" && calHelperCats().indexOf(st.filter) === -1) st.filter = "all";

  var priced = calHelperPool(true, st.filter).filter(function(r){ return !!r.kcal; }).length;
  var pool = calHelperPool(st.includeAll, st.filter);
  var ranges = calBatchRanges(pool);
  var count = Math.max(1, ranges.length);
  if (st.batch == null || st.batch < 0 || st.batch >= count) st.batch = 0;
  var bar = calFilterBarHTML(st.filter);
  var noun = calFilterLabel(st.filter);

  var toggle =
    "<label id='calAllWrap' style='display:flex;align-items:center;gap:10px;cursor:pointer;background:#FBF4E8;border:1px solid #ECE0CC;border-radius:10px;padding:10px 12px;margin-bottom:12px'>" +
      "<input type='checkbox' id='calAll'" + (st.includeAll ? " checked" : "") + " style='width:19px;height:19px;flex:none'>" +
      "<span style='font-size:13px;color:#8A5A1A;line-height:1.45'>Include the " + priced + " " + noun + (priced !== 1 ? "s" : "") + " that already have a figure" +
        "<span style='display:block;font-size:11px;color:#A08A6A'>Off by default — nothing you have already priced is sent back out.</span>" +
      "</span>" +
    "</label>";

  // Nothing to do in THIS section. Say which, and keep both the chips and the
  // toggle on screen — they are the only two things that can change the
  // answer, and an empty section with no way off it is a dead end (the whole
  // point of the row is switching between sections).
  if (!pool.length) {
    var inSection = calHelperPool(true, st.filter).length;
    el.innerHTML = head +
      "<div style='font-size:13px;color:#8A7A5A;line-height:1.6;margin-bottom:14px'>" +
        (!rb.length
          ? "There are no recipes in your book yet."
          : !inSection
            ? "Nothing in this section yet — pick another below."
            : "Every " + noun + " already has a calorie figure. Pick another section below, or tick to send these out again and re-price them.") +
      "</div>" + (rb.length ? bar : "") + (inSection ? toggle : "");
    document.getElementById("calBackBtn").addEventListener("click", calHelperExit);
    calWireFilterChips(el, st);
    var _allEmpty = document.getElementById("calAll");
    if (_allEmpty) _allEmpty.addEventListener("change", function(){
      st.includeAll = _allEmpty.checked; st.batch = 0; renderCalHelper();
    });
    return;
  }

  var text = calExportText(st.batch, st.includeAll, st.filter);
  var curRange = ranges[st.batch] || { from: 0, to: -1, blocks: [] };
  var inBatch = curRange.blocks.length;

  var batchHtml = "";
  if (count > 1) {
    var chips = "";
    for (var bi = 0; bi < count; bi++) {
      var on = bi === st.batch;
      chips += "<button class='cal-batch' data-b='" + esc(bi) + "' style='padding:6px 12px;border:1.5px solid " + (on ? "#B5651D" : "#D8C0A0") + ";background:" + (on ? "#B5651D" : "#FBF4E8") + ";color:" + (on ? "#fff" : "#8A5A1A") + ";border-radius:14px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>" + (bi + 1) + "</button>";
    }
    batchHtml =
      "<div style='background:#FBF4E8;border:1px solid #ECE0CC;border-radius:10px;padding:10px 12px;margin-bottom:12px'>" +
        "<div style='font-size:12px;color:#8A5A1A;line-height:1.5;margin-bottom:8px'>" +
          "That's too much to do in one go — a long paste gets cut off and the reply stops before it gets through them all. " +
          "Do it in " + count + " batches, applying each one before moving to the next. " +
          "Batches are sized by length, not by count, so a batch of long recipes holds fewer of them." +
        "</div>" +
        "<div style='display:flex;flex-wrap:wrap;gap:6px'>" + chips + "</div>" +
      "</div>";
  }

  el.innerHTML = head +
    "<div style='font-size:13px;color:#8A7A5A;line-height:1.6;margin-bottom:14px'>" +
      "Copy the " + noun + "s below, paste them into a chat, then paste the reply back here. " +
      "You get a calories-per-serving figure for each one, which you can edit before it is saved. " +
      "Nothing is written to a recipe until you review it and tap Apply." +
    "</div>" +
    bar +
    toggle +
    batchHtml +
    "<button id='calCopyBtn' style='width:100%;box-sizing:border-box;padding:13px;border:none;background:#B5651D;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:8px'>&#x1F4CB; Copy " + (count > 1 ? ("batch " + (st.batch + 1) + " of " + count + " (" + inBatch + " recipes)") : (pool.length + " " + noun + (pool.length !== 1 ? "s" : ""))) + "</button>" +
    "<textarea id='calExportBox' readonly rows='5' style='" + recipeInputCss() + "margin-bottom:20px;resize:vertical;line-height:1.5;font-size:12px;color:#7A6A50'>" + esc(text) + "</textarea>" +
    "<div style='font-size:12px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px'>Paste the reply</div>" +
    (st.error ? "<div style='font-size:13px;color:#B03030;font-weight:600;margin-bottom:8px'>" + esc(st.error) + "</div>" : "") +
    "<textarea id='calImportBox' rows='6' placeholder='Paste the whole reply here' style='" + recipeInputCss() + "margin-bottom:10px;resize:vertical;line-height:1.5;font-size:13px'></textarea>" +
    "<button id='calReviewBtn' style='width:100%;box-sizing:border-box;padding:13px;border:1.5px solid #B5651D;background:#fff;color:#B5651D;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>Review what came back</button>";

  document.getElementById("calBackBtn").addEventListener("click", calHelperExit);
  document.getElementById("calCopyBtn").addEventListener("click", function(){ prepCopyToClipboard(text); });
  calWireFilterChips(el, st);
  var _all = document.getElementById("calAll");
  if (_all) _all.addEventListener("change", function(){
    st.includeAll = _all.checked; st.batch = 0; st.error = ""; renderCalHelper();
  });
  Array.prototype.forEach.call(el.querySelectorAll(".cal-batch"), function(b){
    b.addEventListener("click", function(){
      st.batch = parseInt(b.getAttribute("data-b"), 10) || 0;
      renderCalHelper();
    });
  });
  document.getElementById("calReviewBtn").addEventListener("click", function(){
    var res = parseCalReply(document.getElementById("calImportBox").value);
    if (res.error) { st.error = res.error; renderCalHelper(); return; }
    st.error = "";
    st.rows = res.rows;
    st.unreadable = res.unreadable || [];
    st.edits = {};
    // Pre-ticked only where there is nothing of his to lose, the prep helper's
    // rule: a recipe that already has a figure stays unticked, so replacing it
    // is a deliberate tap rather than a default he has to notice and undo.
    st.accept = {};
    st.rows.forEach(function(row){ st.accept[row.id] = !row.existing; });
    st.step = "review";
    renderCalHelper();
  });
}

function renderCalHelperReview(el, st, head) {
  var accepted = 0, replacing = 0, withExisting = 0;
  st.rows.forEach(function(row){
    if (st.accept[row.id]) accepted++;
    if (st.accept[row.id] && row.existing) replacing++;
    if (row.existing) withExisting++;
  });

  var html = head +
    "<div style='font-size:13px;color:#8A7A5A;line-height:1.6;margin-bottom:14px'>" +
      st.rows.length + " recipe" + (st.rows.length !== 1 ? "s" : "") + " came back. Tick what you want, edit any number, then Apply. " +
      "Only the calories are written — nothing else on the recipe is touched." +
    "</div>";

  if (withExisting) {
    html +=
      "<div style='background:#FBF4E8;border:1px solid #ECE0CC;border-radius:10px;padding:10px 12px;margin-bottom:12px'>" +
        "<div style='font-size:12px;color:#8A5A1A;line-height:1.5;margin-bottom:8px'>" +
          withExisting + " of these already have a figure, so they start unticked — " +
          "nothing you set stays replaced unless you say so." +
        "</div>" +
        "<div style='display:flex;gap:6px;flex-wrap:wrap'>" +
          "<button id='calTickAll' style='padding:6px 12px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:14px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>Tick all " + st.rows.length + "</button>" +
          "<button id='calTickNone' style='padding:6px 12px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:14px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>Untick all</button>" +
        "</div>" +
      "</div>";
  }

  if (st.unreadable.length) {
    html += "<div style='background:#FBF4E8;border:1px solid #ECE0CC;border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#8A5A1A;line-height:1.5'>" +
            "Skipped, no usable number: " + esc(st.unreadable.slice(0, 8).join(", ")) +
            (st.unreadable.length > 8 ? " and " + (st.unreadable.length - 8) + " more" : "") + "</div>";
  }

  st.rows.forEach(function(row){
    var on = !!st.accept[row.id];
    var val = _calHelperState.edits[row.id] != null ? _calHelperState.edits[row.id] : row.kcal;
    html +=
      "<div style='border:1.5px solid " + (on ? "#D8C0A0" : "#ECE4D6") + ";background:" + (on ? "#FDFAF3" : "#fff") + ";border-radius:12px;padding:12px;margin-bottom:10px'>" +
        "<div class='cal-chkwrap' data-id='" + esc(row.id) + "' style='display:flex;align-items:center;gap:10px;cursor:pointer;padding:2px 0 8px'>" +
          "<input type='checkbox' class='cal-chk'" + (on ? " checked" : "") + " style='width:20px;height:20px;flex:none'>" +
          "<span style='flex:1;font-size:15px;font-weight:700;color:#2A2010'>" + esc(row.name) + "</span>" +
          (row.existing ? "<span style='font-size:11px;color:#B03030;font-weight:700'>replaces " + row.existing + "</span>" : "") +
        "</div>" +
        "<div style='display:flex;align-items:center;gap:8px'>" +
          "<input type='number' class='cal-edit' data-id='" + esc(row.id) + "' min='1' max='9999' inputmode='numeric' value='" + esc(String(val)) + "' style='" + recipeInputCss() + "max-width:120px'>" +
          "<span style='font-size:13px;color:#8A7A5A'>kcal per serving</span>" +
        "</div>" +
      "</div>";
  });

  html +=
    "<button id='calApply'" + (accepted ? "" : " disabled") + " style='width:100%;box-sizing:border-box;padding:13px;margin-top:6px;border:none;background:" + (accepted ? "#2D6B35" : "#D8CEBC") + ";color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:" + (accepted ? "pointer" : "default") + "'>" +
      (accepted ? ("Apply to " + accepted + " recipe" + (accepted !== 1 ? "s" : "")) : "Tick the ones you want") +
    "</button>" +
    "<button id='calBackToCopy' style='width:100%;box-sizing:border-box;padding:11px;margin-top:8px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>&larr; Paste a different reply</button>";

  el.innerHTML = html;

  document.getElementById("calBackBtn").addEventListener("click", calHelperExit);
  document.getElementById("calBackToCopy").addEventListener("click", function(){
    st.step = "copy"; st.rows = []; st.accept = {}; st.edits = {}; st.unreadable = [];
    renderCalHelper();
  });
  var _tickAll = document.getElementById("calTickAll");
  if (_tickAll) _tickAll.addEventListener("click", function(){
    st.rows.forEach(function(row){ st.accept[row.id] = true; });
    renderCalHelper();
  });
  var _tickNone = document.getElementById("calTickNone");
  if (_tickNone) _tickNone.addEventListener("click", function(){
    st.rows.forEach(function(row){ st.accept[row.id] = false; });
    renderCalHelper();
  });
  // Inline edits are kept in state, not read at apply time: the review
  // re-renders on every tick, which would otherwise throw away typing.
  Array.prototype.forEach.call(el.querySelectorAll(".cal-edit"), function(t){
    t.addEventListener("input", function(){ st.edits[t.getAttribute("data-id")] = t.value; });
  });
  Array.prototype.forEach.call(el.querySelectorAll(".cal-chkwrap"), function(w){
    w.addEventListener("click", function(e){
      var c = w.querySelector(".cal-chk");
      if (!c) return;
      if (e.target !== c) c.checked = !c.checked;   // tapped the padding, not the box
      st.accept[w.getAttribute("data-id")] = c.checked;
      renderCalHelper();
    });
  });
  document.getElementById("calApply").addEventListener("click", function(){
    if (!accepted) return;
    var msg = "Set calories on " + accepted + " recipe" + (accepted !== 1 ? "s" : "") + "?";
    if (replacing) msg += " " + replacing + " of them already had a figure, which will be replaced.";
    confirmDialog(msg, applyCalImport);
  });
}

// ── Duplicate recipes: find and repair (v401) ─────────────────────────────
// v400 fixed the CAUSE (a colliding id generator). This clears up what the
// old one already created. Two kinds of group, deliberately kept separate on
// screen because they are different problems:
//   "id"   — records SHARING an id. The importer bug. Only the first is
//            reachable by find()/findIndex(), so the others are invisible to
//            opening, favouriting, deleting and the prep helper.
//   "name" — records with the same name but DIFFERENT ids. Two real records;
//            both work, but you almost certainly only want one.
//
// Nothing is written until Apply. Removals go through addTomb() exactly as
// the Delete button does, so a sync from the other phone cannot resurrect
// them — a local-only delete would come straight back.
var _dupState = null;   // null | { groups:[], keep:{}, expanded:{} }

// How much a record actually carries. Used only to SUGGEST a keeper — the
// fullest copy is usually the one that's been worked on (tidied ingredients,
// prep written, notes, a URL). Never applied without a tap.
function recipeRichness(r) {
  if (!r) return -1;
  var n = 0;
  n += (r.ingredients || []).length * 10;
  n += String(r.prep || "").length;
  n += String(r.method || "").length / 10;
  n += String(r.notes || "").length / 10;
  if (r.url) n += 25;
  if (r.category) n += 15;
  if (r.fav) n += 15;
  if (r.inRotation) n += 10;
  // A tidied ingredient list is the marker of the copy that has had work done
  // on it: v366's canonical shape puts detail in brackets.
  (r.ingredients || []).forEach(function(ing){
    if (ing && /\(/.test(String(ing.name || ""))) n += 5;
    if (ing && (ing.groceryName || ing.noBuy)) n += 20;   // v368 prefs are hand-set
  });
  return n;
}

// [{kind:"id"|"name", key, recipes:[...]}] — id groups first, then name
// groups, each in book order. A record can only appear in ONE group: if it is
// already in an id group it is not also offered as a name duplicate, or
// resolving one group would silently change another.
function findDuplicateRecipes(rb) {
  var book = (rb || []).filter(function(r){ return r && r.id != null; });
  var byId = {}, groups = [], claimed = {};
  book.forEach(function(r){ (byId[r.id] = byId[r.id] || []).push(r); });
  Object.keys(byId).forEach(function(k){
    if (byId[k].length < 2) return;
    byId[k].forEach(function(r){ claimed[book.indexOf(r)] = true; });
    groups.push({ kind: "id", key: k, recipes: byId[k] });
  });
  var byName = {};
  book.forEach(function(r, i){
    if (claimed[i]) return;
    var n = String(r.name || "").trim().toLowerCase();
    if (!n) return;
    (byName[n] = byName[n] || []).push(r);
  });
  Object.keys(byName).forEach(function(n){
    if (byName[n].length < 2) return;
    groups.push({ kind: "name", key: byName[n][0].name || n, recipes: byName[n] });
  });
  return groups;
}

// A stable per-record handle. Index in the book, because id is exactly the
// thing that isn't unique here.
function dupRowKey(rb, r) { return rb.indexOf(r); }

function buildDupState() {
  var rb = getRecipeBook();
  var groups = findDuplicateRecipes(rb);
  var keep = {};
  groups.forEach(function(g, gi){
    var best = g.recipes[0], bestScore = recipeRichness(best);
    g.recipes.forEach(function(r){
      var s = recipeRichness(r);
      if (s > bestScore) { best = r; bestScore = s; }
    });
    keep[gi] = dupRowKey(rb, best);
  });
  _dupState = { groups: groups, keep: keep, expanded: {}, book: rb };
}

function dupExit() {
  _dupState = null;
  _recipeView = "list";
  renderRecipes();
}

// Deletes every copy in every group except the chosen keeper. Tombstoned, so
// the other phone's next sync doesn't bring them back.
function applyDupRepair() {
  var st = _dupState;
  if (!st) return;
  // Work against st.book — the exact snapshot the choices were made on.
  // getRecipeBook() re-parses from storage on every call, so it returns fresh
  // objects each time and identity comparisons against the reviewed records
  // would all miss. The choices are indices into that snapshot, so if the
  // stored book changed underneath (a sync landing mid-review) those indices
  // no longer mean the same records — refuse rather than delete the wrong one.
  if (getRecipeBook().length !== st.book.length) {
    toast("Your recipes changed — reopen the duplicates screen");
    dupExit();
    return;
  }
  var dropIdx = {}, removed = 0;
  st.groups.forEach(function(g, gi){
    var keepIdx = st.keep[gi];
    g.recipes.forEach(function(r){
      var i = st.book.indexOf(r);
      if (i < 0 || i === keepIdx) return;      // guard the -1
      dropIdx[i] = r;
    });
  });
  var next = st.book.filter(function(r, i){ return !dropIdx[i]; });
  Object.keys(dropIdx).forEach(function(i){
    var r = dropIdx[i];
    // Only tombstone an id that is genuinely leaving the book. In an id group
    // the keeper SHARES the id with the copies being dropped, so a tombstone
    // would delete the keeper too on the next sync.
    var stillThere = next.some(function(x){ return x && x.id === r.id; });
    if (!stillThere) addTomb("recipes", r.id);
    removed++;
  });
  saveRecipeBook(next);
  toast(removed ? ("Removed " + removed + " duplicate" + (removed !== 1 ? "s" : "")) : "Nothing removed");
  dupExit();
}

function renderDupRepair() {
  // Holds unsaved choices — same guard the editor and tidy screen use.
  _recipeEditing = true;
  if (!_dupState) buildDupState();
  var st = _dupState;
  var rb = st.book;
  var el = document.getElementById("recipesContent");
  var head =
    "<button id='dupBackBtn' style='border:none;background:none;color:#B5651D;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px'>&larr; All recipes</button>" +
    "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:6px'>Duplicate recipes</div>";

  if (!st.groups.length) {
    el.innerHTML = head +
      "<div style='text-align:center;color:#8A7A5A;padding:30px 10px'><div style='font-size:34px;margin-bottom:8px'>&#x2728;</div>" +
      "<div style='font-size:15px;font-weight:600'>No duplicates found</div>" +
      "<div style='font-size:13px;margin-top:4px'>Every recipe in your book is unique.</div></div>";
    document.getElementById("dupBackBtn").addEventListener("click", dupExit);
    return;
  }

  var idGroups = st.groups.filter(function(g){ return g.kind === "id"; }).length;
  var toRemove = 0;
  st.groups.forEach(function(g){ toRemove += g.recipes.length - 1; });

  var html = head +
    "<div style='font-size:13px;color:#8A7A5A;line-height:1.6;margin-bottom:14px'>" +
      st.groups.length + " group" + (st.groups.length !== 1 ? "s" : "") + " found. " +
      "Pick the copy to keep in each — the fullest one is suggested. " +
      "Nothing is deleted until you tap Apply." +
    "</div>";

  if (idGroups) {
    html += "<div style='background:#FBF4E8;border:1px solid #ECE0CC;border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#8A5A1A;line-height:1.5'>" +
      "<b>" + idGroups + " group" + (idGroups !== 1 ? "s share" : " shares") + " an id.</b> These came from an import bug (fixed in v400): " +
      "only the first copy of each was reachable, so the others couldn't be opened, favourited or given prep." +
    "</div>";
  }

  st.groups.forEach(function(g, gi){
    var open = !!st.expanded[gi];
    html +=
      "<div style='border:1.5px solid #ECE4D6;border-radius:12px;padding:12px;margin-bottom:10px'>" +
        "<div style='display:flex;align-items:center;gap:8px;margin-bottom:8px'>" +
          "<span style='font-size:15px;font-weight:700;color:#2A2010;flex:1'>" + esc(g.recipes[0].name || "Untitled") + "</span>" +
          "<span style='font-size:11px;font-weight:700;color:#8A5A1A;background:#FBF4E8;border-radius:10px;padding:3px 8px'>" +
            (g.kind === "id" ? "same id" : "same name") + " &middot; " + g.recipes.length +
          "</span>" +
        "</div>";
    g.recipes.forEach(function(r){
      var idx = dupRowKey(rb, r);
      var chosen = st.keep[gi] === idx;
      var ings = (r.ingredients || []).length;
      html +=
        "<div class='dup-pick' data-g='" + esc(gi) + "' data-i='" + esc(idx) + "' style='display:flex;gap:10px;align-items:flex-start;padding:8px;margin-bottom:6px;border:1.5px solid " + (chosen ? "#2D6B35" : "#ECE4D6") + ";background:" + (chosen ? "#F3F8F3" : "#fff") + ";border-radius:10px;cursor:pointer'>" +
          "<div style='width:18px;height:18px;flex:none;margin-top:2px;border-radius:50%;border:2px solid " + (chosen ? "#2D6B35" : "#C8BEA8") + ";background:" + (chosen ? "#2D6B35" : "#fff") + "'></div>" +
          "<div style='flex:1;min-width:0'>" +
            "<div style='font-size:13px;font-weight:700;color:" + (chosen ? "#2D6B35" : "#6A5A40") + "'>" +
              (chosen ? "Keep this one" : "Remove") +
            "</div>" +
            "<div style='font-size:12px;color:#8A7A5A;margin-top:2px'>" +
              ings + " ingredient" + (ings !== 1 ? "s" : "") +
              (r.prep ? " &middot; has prep" : "") +
              (r.notes ? " &middot; notes" : "") +
              (r.url ? " &middot; link" : "") +
              (r.fav ? " &middot; ★" : "") +
            "</div>" +
            (open
              ? "<div style='font-size:11px;color:#9A8A6A;margin-top:6px;line-height:1.5;white-space:pre-wrap;word-break:break-word'>" +
                  esc((r.ingredients || []).slice(0, 6).map(ingredientToLine).join("\n") || "(no ingredients)") +
                ((r.ingredients || []).length > 6 ? "\n…" : "") +
                "</div>"
              : "") +
          "</div>" +
        "</div>";
    });
    html +=
        "<button class='dup-toggle' data-g='" + esc(gi) + "' style='border:none;background:none;color:#B5651D;font-size:12px;font-weight:700;cursor:pointer;padding:2px 0'>" +
          (open ? "Hide ingredients" : "Compare ingredients") +
        "</button>" +
      "</div>";
  });

  html +=
    "<button id='dupApply' style='width:100%;box-sizing:border-box;padding:13px;margin-top:6px;border:none;background:#B03030;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>" +
      "Remove " + toRemove + " duplicate" + (toRemove !== 1 ? "s" : "") +
    "</button>";

  el.innerHTML = html;

  document.getElementById("dupBackBtn").addEventListener("click", dupExit);
  Array.prototype.forEach.call(el.querySelectorAll(".dup-pick"), function(row){
    row.addEventListener("click", function(){
      st.keep[row.getAttribute("data-g")] = parseInt(row.getAttribute("data-i"), 10);
      renderDupRepair();
    });
  });
  Array.prototype.forEach.call(el.querySelectorAll(".dup-toggle"), function(b){
    b.addEventListener("click", function(){
      var gi = b.getAttribute("data-g");
      st.expanded[gi] = !st.expanded[gi];
      renderDupRepair();
    });
  });
  document.getElementById("dupApply").addEventListener("click", function(){
    confirmDialog(
      "Remove " + toRemove + " duplicate" + (toRemove !== 1 ? "s" : "") + "? The copy you picked in each group is kept.",
      applyDupRepair
    );
  });
}

function prepHelperExit() {
  _prepHelperState = null;
  _recipeView = "list";
  renderRecipes();
}

// Writes ONLY `prep`, and only on ticked rows. Every other field on the
// record is left exactly as it was — that narrowness is the whole safety
// argument for this feature, so don't widen it without a fresh design call.
function applyPrepImport() {
  var st = _prepHelperState;
  if (!st) return;
  var rb = getRecipeBook();
  var n = 0;
  st.rows.forEach(function(row){
    if (!st.accept[row.id]) return;
    var i = rb.findIndex(function(x){ return x && x.id === row.id; });
    if (i < 0) return;                       // deleted on another device mid-review — guard the -1
    var v = prepRowValue(row);
    if (!v) return;                          // emptied inline = "leave this one alone"
    rb[i].prep = v;
    rb[i].updated = Date.now();              // unstamped mutations lose the merge (v353)
    n++;
  });
  saveRecipeBook(rb);
  toast(n ? ("Prep added to " + n + " recipe" + (n !== 1 ? "s" : "")) : "Nothing applied");
  // A batched book is worked through one batch at a time, so landing back on
  // the recipe list after each one would mean re-opening the helper and
  // re-finding your place six times over. Go back to the copy step with the
  // next batch already selected instead; the chips are still there if you
  // want to redo one.
  var count = prepBatchCount(getRecipeBook().filter(Boolean));
  if (count > 1) {
    st.step = "copy";
    st.batch = Math.min((st.batch || 0) + 1, count - 1);
    st.rows = []; st.accept = {}; st.edits = {}; st.unmatched = []; st.error = "";
    renderPrepHelper();
    return;
  }
  prepHelperExit();
}

function renderPrepHelper() {
  // Same guard the editor and the tidy screen use: this screen holds unsaved
  // input, so a sync landing mid-review must not redraw it out from under him.
  _recipeEditing = true;
  if (!_prepHelperState) _prepHelperState = { step: "copy", batch: 0, rows: [], accept: {}, edits: {}, unmatched: [], error: "" };
  var st = _prepHelperState;
  var el = document.getElementById("recipesContent");
  var head =
    "<button id='prepBackBtn' style='border:none;background:none;color:#B5651D;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px'>&larr; All recipes</button>" +
    "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:6px'>Prep helper</div>";

  if (st.step === "review") { renderPrepHelperReview(el, st, head); return; }

  var rb = getRecipeBook().filter(Boolean);
  var ranges = prepBatchRanges(rb);
  var count = Math.max(1, ranges.length);
  if (st.batch == null || st.batch < 0 || st.batch >= count) st.batch = 0;
  var text = prepExportText(st.batch);
  var curRange = ranges[st.batch] || { from: 0, to: -1, blocks: [] };
  var inBatch = curRange.blocks.length;

  // Batch chips only when there is more than one — a small book shouldn't grow
  // a control that only ever says "1 of 1".
  var batchHtml = "";
  if (count > 1) {
    var chips = "";
    for (var bi = 0; bi < count; bi++) {
      var on = bi === st.batch;
      chips += "<button class='prep-batch' data-b='" + esc(bi) + "' style='padding:6px 12px;border:1.5px solid " + (on ? "#B5651D" : "#D8C0A0") + ";background:" + (on ? "#B5651D" : "#FBF4E8") + ";color:" + (on ? "#fff" : "#8A5A1A") + ";border-radius:14px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>" + (bi + 1) + "</button>";
    }
    batchHtml =
      "<div style='background:#FBF4E8;border:1px solid #ECE0CC;border-radius:10px;padding:10px 12px;margin-bottom:12px'>" +
        "<div style='font-size:12px;color:#8A5A1A;line-height:1.5;margin-bottom:8px'>" +
          "Your book is too big to do in one go — a long paste gets cut off and the reply stops before it gets through them all. " +
          "Do it in " + count + " batches, applying each one before moving to the next. " +
          "Batches are sized by length, not by count, so a batch of long recipes holds fewer of them." +
        "</div>" +
        "<div style='display:flex;flex-wrap:wrap;gap:6px'>" + chips + "</div>" +
      "</div>";
  }

  el.innerHTML = head +
    "<div style='font-size:13px;color:#8A7A5A;line-height:1.6;margin-bottom:14px'>" +
      "Copy the recipes below, paste them into a chat, then paste the reply back here. " +
      "Nothing is written to a recipe until you review it and tap Apply." +
    "</div>" +
    batchHtml +
    "<button id='prepCopyBtn' style='width:100%;box-sizing:border-box;padding:13px;border:none;background:#B5651D;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:8px'>&#x1F4CB; Copy " + (count > 1 ? ("batch " + (st.batch + 1) + " of " + count + " (" + inBatch + " recipes)") : ("my " + rb.length + " recipe" + (rb.length !== 1 ? "s" : ""))) + "</button>" +
    "<textarea id='prepExportBox' readonly rows='5' style='" + recipeInputCss() + "margin-bottom:20px;resize:vertical;line-height:1.5;font-size:12px;color:#7A6A50'>" + esc(text) + "</textarea>" +
    "<div style='font-size:12px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px'>Paste the reply</div>" +
    (st.error ? "<div style='font-size:13px;color:#B03030;font-weight:600;margin-bottom:8px'>" + esc(st.error) + "</div>" : "") +
    "<textarea id='prepImportBox' rows='6' placeholder='Paste the whole reply here' style='" + recipeInputCss() + "margin-bottom:10px;resize:vertical;line-height:1.5;font-size:13px'></textarea>" +
    "<button id='prepReviewBtn' style='width:100%;box-sizing:border-box;padding:13px;border:1.5px solid #B5651D;background:#fff;color:#B5651D;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>Review what came back</button>";

  document.getElementById("prepBackBtn").addEventListener("click", prepHelperExit);
  document.getElementById("prepCopyBtn").addEventListener("click", function(){ prepCopyToClipboard(text); });
  Array.prototype.forEach.call(el.querySelectorAll(".prep-batch"), function(b){
    b.addEventListener("click", function(){
      st.batch = parseInt(b.getAttribute("data-b"), 10) || 0;
      renderPrepHelper();
    });
  });
  document.getElementById("prepReviewBtn").addEventListener("click", function(){
    var res = parsePrepReply(document.getElementById("prepImportBox").value);
    if (res.error) { st.error = res.error; renderPrepHelper(); return; }
    st.error = "";
    st.rows = res.rows;
    st.unmatched = res.unmatched || [];
    st.edits = {};
    // Pre-ticked only where there is nothing of his to lose. A recipe he has
    // already written prep for stays unticked, so replacing it is always a
    // deliberate tap rather than a default he has to notice and undo.
    st.accept = {};
    st.rows.forEach(function(row){ st.accept[row.id] = !row.existing; });
    st.step = "review";
    renderPrepHelper();
  });
}

function renderPrepHelperReview(el, st, head) {
  var accepted = 0;
  st.rows.forEach(function(row){ if (st.accept[row.id]) accepted++; });
  var replacing = 0;
  st.rows.forEach(function(row){ if (st.accept[row.id] && row.existing) replacing++; });

  var withExisting = 0;
  st.rows.forEach(function(row){ if (row.existing) withExisting++; });

  var html = head +
    "<div style='font-size:13px;color:#8A7A5A;line-height:1.6;margin-bottom:14px'>" +
      st.rows.length + " recipe" + (st.rows.length !== 1 ? "s" : "") + " came back. Tick what you want, edit anything, then Apply. " +
      "Only the prep is written — nothing else on the recipe is touched." +
    "</div>";

  // The second-pass dead end: on a re-run every recipe already has prep, so
  // nothing is pre-ticked and Apply sits disabled reading "Apply to 0" with
  // no clue why. Say why, and give one tap that fixes it.
  if (withExisting) {
    html +=
      "<div style='background:#FBF4E8;border:1px solid #ECE0CC;border-radius:10px;padding:10px 12px;margin-bottom:12px'>" +
        "<div style='font-size:12px;color:#8A5A1A;line-height:1.5;margin-bottom:8px'>" +
          withExisting + " of these already have prep written, so they start unticked — " +
          "nothing you wrote gets replaced unless you say so." +
        "</div>" +
        "<div style='display:flex;gap:6px;flex-wrap:wrap'>" +
          "<button id='prepTickAll' style='padding:6px 12px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:14px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>Tick all " + st.rows.length + "</button>" +
          "<button id='prepTickNone' style='padding:6px 12px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:14px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>Untick all</button>" +
        "</div>" +
      "</div>";
  }

  if (st.unmatched.length) {
    html += "<div style='background:#FBF4E8;border:1px solid #ECE0CC;border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#8A5A1A;line-height:1.5'>" +
            "Skipped, no matching recipe: " + esc(st.unmatched.slice(0, 8).join(", ")) +
            (st.unmatched.length > 8 ? " and " + (st.unmatched.length - 8) + " more" : "") + "</div>";
  }

  st.rows.forEach(function(row){
    var on = !!st.accept[row.id];
    html +=
      "<div style='border:1.5px solid " + (on ? "#D8C0A0" : "#ECE4D6") + ";background:" + (on ? "#FDFAF3" : "#fff") + ";border-radius:12px;padding:12px;margin-bottom:10px'>" +
        "<div class='prep-chkwrap' data-id='" + esc(row.id) + "' style='display:flex;align-items:center;gap:10px;cursor:pointer;padding:2px 0 8px'>" +
          "<input type='checkbox' class='prep-chk'" + (on ? " checked" : "") + " style='width:20px;height:20px;flex:none'>" +
          "<span style='font-size:15px;font-weight:700;color:#2A2010'>" + esc(row.name) + "</span>" +
          (row.existing ? "<span style='font-size:11px;color:#B03030;font-weight:700'>replaces what you wrote</span>" : "") +
        "</div>" +
        (row.existing
          ? "<div style='font-size:11px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px'>Yours now</div>" +
            "<div style='font-size:13px;color:#7A6A50;line-height:1.5;white-space:pre-wrap;margin-bottom:8px'>" + esc(row.existing) + "</div>" +
            "<div style='font-size:11px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px'>Proposed</div>"
          : "") +
        "<textarea class='prep-edit' data-id='" + esc(row.id) + "' rows='3' style='" + recipeInputCss() + "resize:vertical;line-height:1.5;font-size:13px'>" + esc(prepRowValue(row)) + "</textarea>" +
      "</div>";
  });

  html +=
    "<button id='prepApply'" + (accepted ? "" : " disabled") + " style='width:100%;box-sizing:border-box;padding:13px;margin-top:6px;border:none;background:" + (accepted ? "#2D6B35" : "#D8CEBC") + ";color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:" + (accepted ? "pointer" : "default") + "'>" +
      (accepted ? ("Apply to " + accepted + " recipe" + (accepted !== 1 ? "s" : "")) : "Tick the ones you want") +
    "</button>" +
    "<button id='prepBackToCopy' style='width:100%;box-sizing:border-box;padding:11px;margin-top:8px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>&larr; Paste a different reply</button>";

  el.innerHTML = html;

  document.getElementById("prepBackBtn").addEventListener("click", prepHelperExit);
  document.getElementById("prepBackToCopy").addEventListener("click", function(){
    st.step = "copy"; st.rows = []; st.accept = {}; st.edits = {}; st.unmatched = [];
    renderPrepHelper();
  });
  var _tickAll = document.getElementById("prepTickAll");
  if (_tickAll) _tickAll.addEventListener("click", function(){
    st.rows.forEach(function(row){ st.accept[row.id] = true; });
    renderPrepHelper();
  });
  var _tickNone = document.getElementById("prepTickNone");
  if (_tickNone) _tickNone.addEventListener("click", function(){
    st.rows.forEach(function(row){ st.accept[row.id] = false; });
    renderPrepHelper();
  });
  // Inline edits are kept in state, not read at apply time: the review
  // re-renders on every tick, which would otherwise throw away typing.
  Array.prototype.forEach.call(el.querySelectorAll(".prep-edit"), function(t){
    t.addEventListener("input", function(){ st.edits[t.getAttribute("data-id")] = t.value; });
  });
  Array.prototype.forEach.call(el.querySelectorAll(".prep-chkwrap"), function(w){
    w.addEventListener("click", function(e){
      var c = w.querySelector(".prep-chk");
      if (!c) return;
      if (e.target !== c) c.checked = !c.checked;   // tapped the padding, not the box
      st.accept[w.getAttribute("data-id")] = c.checked;
      renderPrepHelper();
    });
  });
  document.getElementById("prepApply").addEventListener("click", function(){
    if (!accepted) return;
    var msg = "Add prep to " + accepted + " recipe" + (accepted !== 1 ? "s" : "") + "?";
    if (replacing) msg += " " + replacing + " of them already had prep written, which will be replaced.";
    confirmDialog(msg, applyPrepImport);
  });
}

// Rescue-at-render (recipe-parser second pass, v365): an ingredient stored
// before compound/range parsing existed may still carry a stranded "+ 2
// tbsp"/"to 3 tbsp" leftover in its name — the old parser only ever peeled a
// single leading amount+unit off a line. Reconstructing the original text
// exactly as `openRecipeEditor` would and re-running it through the current
// parseIngredients recovers the correct amount/amountMax for display.
// Stored data is never rewritten here — editing and saving the recipe is
// still what actually cleans it up (same "zero migration code" mechanism
// v363's downstream rescue relies on).
// Serialize one ingredient back to its editor line — the exact text the
// recipe editor's textarea shows, and the format parseIngredients reads. Kept
// as one function so the editor and v366's tidy pass can never disagree about
// what a stored ingredient "says".
// NOTE: rescueIngredientMeasure deliberately does NOT use this. It rebuilds a
// line in order to RE-PARSE it, so it must leave out amountMax and the
// compound note — re-emitting those would just hand the parser back what it
// already produced and the rescue could never find anything.
function ingredientToLine(i) {
  if (!i) return "";
  // A header has to go back out in a shape parseIngredients still reads AS a
  // header, or saving the recipe silently demotes it to an ingredient: the
  // parser stores "<b>Base</b>" and "Sauce:" alike as {name:"Base"|"Sauce",
  // header:true}, and a bare "Base" reparses as something you buy.
  if (i.header) return "<b>" + String(i.name || "") + "</b>";
  // A compound sum re-emits its ORIGINAL phrasing ("1 3/4 cup + 2 tbsp"), not
  // the normalized decimal it was stored as, so re-editing a typed fraction
  // doesn't flatten it — parseIngredients recognises it again on save either
  // way (round-trip: serialize → parse → same data).
  if (i._compoundNote) return (i.approx?"~":"") + i._compoundNote + " " + i.name;
  return (i.approx?"~":"") +
         (i.amount!=null ? fmtIngredientAmount(i.amount) + (i.amountMax!=null ? "-"+fmtIngredientAmount(i.amountMax) : "") + " " : "") +
         (i.unit ? i.unit + " " : "") + i.name;
}
// Amounts are stored as floats, so "1 2/3 tbsp" comes back out of the parser
// as 1.6666666666666665 and the editor showed it that way. Re-emit a common
// fraction when one reparses to the same number (within a hair), so a typed
// fraction survives an edit instead of decaying into a wall of digits.
var INGREDIENT_FRACTIONS = [[0.125,"1/8"],[0.25,"1/4"],[0.333,"1/3"],[0.375,"3/8"],[0.5,"1/2"],
                            [0.625,"5/8"],[0.667,"2/3"],[0.75,"3/4"],[0.875,"7/8"]];
function fmtIngredientAmount(n) {
  if (typeof n !== "number" || !isFinite(n)) return String(n);
  if (n === Math.floor(n)) return String(n);
  var whole = Math.floor(n), frac = n - whole;
  for (var i = 0; i < INGREDIENT_FRACTIONS.length; i++) {
    if (Math.abs(frac - INGREDIENT_FRACTIONS[i][0]) < 0.0005) {
      var s = (whole ? whole + " " : "") + INGREDIENT_FRACTIONS[i][1];
      // Only if it really does come back as the same amount.
      var back = parseAmount(s);
      if (back != null && Math.abs(back - n) < 0.0005) return s;
    }
  }
  return String(Math.round(n * 100) / 100);
}
function rescueIngredientMeasure(ing) {
  if (!ing || isHeaderIng(ing) || ing.amountMax != null) return ing;
  var raw = (ing.approx ? "~" : "") + (ing.amount != null ? ing.amount + " " : "") + (ing.unit ? ing.unit + " " : "") + ing.name;
  var reparsed = parseIngredients(raw, false)[0];
  if (!reparsed || reparsed.header) return ing;
  if (reparsed.amountMax == null && reparsed.amount == ing.amount) return ing;
  // A rescue re-parses the line into a FRESH object, so the v368 shopping
  // preferences have to be carried across or an add would forget them.
  if (ing.groceryName) reparsed.groceryName = ing.groceryName;
  if (ing.noBuy) reparsed.noBuy = true;
  return reparsed;
}
// Make the lines inside a Prep/Method block tappable (v405). Called after the
// detail view's innerHTML is set, because formatMethod and derivedPrepHtml are
// shared string builders and marking them up in place would leak cook-along
// classes into anything else that ever renders a method. `prefix` keys the
// block ("p" / "m") so a prep step and a method step never collide.
// Selector note: the block's direct children are <ol>s, sub-heading <div>s and
// (for a single unbroken paragraph of prose) one <p>. Only the steps and the
// prose paragraph are things you "do", so headings and the derived-prep
// footnote are deliberately left out.
function wireRecipeTicks(root, prefix) {
  if (!root) return;
  var items = root.querySelectorAll("ol > li, p");
  for (var i = 0; i < items.length; i++) {
    var key = prefix + i;
    items[i].setAttribute("data-tk", key);
    items[i].className = "rcp-tick" + (_recipeDone[key] ? " rcp-done" : "");
  }
}
