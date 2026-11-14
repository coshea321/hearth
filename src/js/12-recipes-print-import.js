// ── Printing (v497) ──────────────────────────────────────────────────────
// The one print document in the app: Lists (#printLink) and a recipe's Print
// both go through here. It holds the file's only print-string DOCTYPE and the
// ESCAPED <\/script> — tests/checks.sh pins both. Do NOT give a new print
// feature its own copy of this; call openPrintDoc.
function openPrintDoc(title, css, bodyHtml) {
  var doc = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + esc(title) + "</title><style>" + css + "</style></head><body>" +
    bodyHtml +
    "<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>" +
    "</body></html>";
  var w = window.open("", "_blank");
  if (!w) { toast("Allow pop-ups to print"); return false; }
  w.document.open(); w.document.write(doc); w.document.close();
  return true;
}

// A recipe as a printed card: name, Serves N at the servings currently set
// (amounts scaled exactly as on screen), ingredients, prep, method, notes.
// Cathal's scope, 29/09/2026: calories, category, source and the buttons are
// left off on purpose.
var RECIPE_PRINT_CSS =
  "*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;margin:28px;line-height:1.5}" +
  "h1{font-family:Georgia,serif;font-size:24px;margin:0 0 2px}.sub{color:#666;font-size:14px;margin-bottom:18px}" +
  "h2{font-size:15px;margin:20px 0 8px;padding-bottom:4px;border-bottom:1.5px solid #ddd;text-transform:uppercase;letter-spacing:.5px}" +
  "h3{font-size:13px;margin:12px 0 4px;text-transform:uppercase;letter-spacing:.4px;color:#555}" +
  "ul{margin:0;padding:0 0 0 20px}ul li{padding:3px 0;font-size:14px}ol li{font-size:14px}p,.notes{font-size:14px}" +
  "@media print{body{margin:14px}h2{break-after:avoid}li{break-inside:avoid}}";
function recipePrintHtml(r, servings) {
  var base = r.servings || 1;
  var mult = servings / base;
  var ing = "", open = false;
  (r.ingredients || []).forEach(function(i){
    if (isHeaderIng(i)) {
      if (open) { ing += "</ul>"; open = false; }
      ing += "<h3>" + esc(headerLabel(i)) + "</h3>";
      return;
    }
    if (!open) { ing += "<ul>"; open = true; }
    var eff = rescueIngredientMeasure(i);
    var sc = scaleIngredient(eff, mult);
    var amt = (sc.amount && sc.amount !== "0") ? "<b>" + (eff.approx ? "~" : "") + sc.amount + (sc.amountMax ? "–" + sc.amountMax : "") + (sc.unit ? " " + sc.unit : "") + "</b> " : "";
    ing += "<li>" + amt + esc(eff.name) + "</li>";
  });
  if (open) ing += "</ul>";
  var prep = "";
  if (r.prep && String(r.prep).trim()) prep = formatMethod(r.prep);
  else {
    var ds = derivedPrepSteps(r);
    if (ds.length) prep = "<ol>" + ds.map(function(d){ return "<li>" + esc(d.name) + " &mdash; " + esc(d.prep) + "</li>"; }).join("") + "</ol>";
  }
  var method = r.method ? formatMethod(r.method) : "";
  return "<h1>" + esc(r.name || "Recipe") + "</h1>" +
    "<div class='sub'>Serves " + servings + "</div>" +
    (ing ? "<h2>Ingredients</h2>" + ing : "") +
    (prep ? "<h2>Prep</h2>" + prep : "") +
    (method ? "<h2>Method</h2>" + method : "") +
    (r.notes ? "<h2>Notes</h2><div class='notes'>" + escNl(r.notes) + "</div>" : "");
}

function renderRecipeDetail() {
  var el = document.getElementById("recipesContent");
  var r = getRecipeBook().find(function(x){ return x.id === _recipeOpenId; });
  if (!r) { _recipeView = "list"; renderRecipes(); return; }
  // Any route into a different recipe starts with a clean slate, even the ones
  // that don't go through a card tap (global search, "open recipe" from the
  // meal plan sheet, coming back out of the editor onto a different recipe).
  if (_recipeDoneId !== r.id) resetRecipeTicks(r.id);
  var base = r.servings || 1;
  var mult = _recipeServings / base;

  var ingHtml = "";
  (r.ingredients||[]).forEach(function(ing, ingIdx){
    if (isHeaderIng(ing)) {
      // Headers sit outside the bullet column (negative margin cancels the
      // <ul>'s indent) so a section title stays flush with the rest of the page.
      ingHtml += "<li style='padding:11px 0 3px;margin-left:-20px;list-style:none;font-size:12px;font-weight:800;color:#B5651D;text-transform:uppercase;letter-spacing:.5px'>" + esc(headerLabel(ing)) + "</li>";
      return;
    }
    var eff = rescueIngredientMeasure(ing);
    var s = scaleIngredient(eff, mult);
    var amtStr = (s.amount && s.amount !== "0") ? "<b>" + (eff.approx ? "~" : "") + s.amount + (s.amountMax ? "–" + s.amountMax : "") + (s.unit ? " " + s.unit : "") + "</b> " : "";
    // A shopping preference set in the review screen (v368) is shown here, so
    // "why does olive oil never reach my list?" has a visible answer.
    var pref = "";
    if (eff.noBuy) pref = "<span style='font-size:11px;color:#9A8A6A'> &middot; not added to the shopping list</span>";
    else if (eff.groceryName) pref = "<span style='font-size:11px;color:#9A8A6A'> &middot; bought as &ldquo;" + esc(eff.groceryName) + "&rdquo;</span>";
    // The li carries the accent colour so the bullet marker is warm; the span
    // puts the text back to the reading colour.
    // rcp-tick/data-tk make it a cook-along line (v405); the key is the
    // ingredient's index in r.ingredients, so it survives a re-render.
    var ingKey = "i" + ingIdx;
    ingHtml += "<li class='rcp-tick rcp-ing" + (_recipeDone[ingKey] ? " rcp-done" : "") + "' data-tk='" + esc(ingKey) + "' style='padding:7px 0;border-bottom:1px dotted #ECE4D6;font-size:15px;color:#B5651D;list-style:disc'><span style='color:#2A2010'>" + amtStr + esc(eff.name) + pref + "</span></li>";
  });

  // Prep: what was typed if anything was, otherwise what the ingredients
  // already say. Never both — a derived list under a typed one would just
  // repeat the same wording back in a second place.
  var prepHtml = "";
  if (r.prep && String(r.prep).trim()) prepHtml = formatMethod(r.prep);
  else prepHtml = derivedPrepHtml(derivedPrepSteps(r));

  el.innerHTML =
    "<button id='recipeBackBtn' style='border:none;background:none;color:#B5651D;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px'>&larr; All recipes</button>" +
    "<div style='display:flex;align-items:flex-start;gap:10px;margin-bottom:6px'>" +
      "<div style='flex:1;font-family:Georgia,serif;font-size:24px;font-weight:600;color:#2A2010'>" + esc(r.name) + "</div>" +
      "<button id='recipeFavBtn' aria-label='Favourite' style='border:none;background:none;cursor:pointer;font-size:26px;line-height:1;padding:2px;color:" + (r.fav?"#E8A030":"#D8CEBC") + "'>" + (r.fav?"&#x2605;":"&#x2606;") + "</button>" +
    "</div>" +
    (r.category ? "<div style='font-size:13px;color:#9A7A4A;font-weight:600;margin-bottom:14px'>" + esc(r.category) + "</div>" : "<div style='margin-bottom:14px'></div>") +
    "<div style='display:flex;align-items:center;gap:14px;background:#FBF5EC;border:1px solid #ECE0CC;border-radius:12px;padding:10px 14px;margin-bottom:16px'>" +
      "<span style='font-size:13px;font-weight:700;color:#7A5A30;text-transform:uppercase;letter-spacing:.5px'>Serves</span>" +
      "<button id='servMinus' style='width:34px;height:34px;border:1.5px solid #D8C8A8;background:#fff;border-radius:8px;font-size:20px;color:#7A5A30;cursor:pointer;line-height:1'>&minus;</button>" +
      "<span id='servCount' style='font-size:20px;font-weight:700;color:#2A2010;min-width:24px;text-align:center'>" + _recipeServings + "</span>" +
      "<button id='servPlus' style='width:34px;height:34px;border:1.5px solid #D8C8A8;background:#fff;border-radius:8px;font-size:20px;color:#7A5A30;cursor:pointer;line-height:1'>+</button>" +
      // v434: the scaled total tracks the stepper, the per-serving figure below
      // it is the stored number — so it stays obvious which one was typed in.
      (r.kcal ? "<span style='margin-left:auto;text-align:right;line-height:1.3'>" +
        "<b style='font-size:14px;color:#2A2010'>" + (r.kcal * _recipeServings).toLocaleString() + " kcal</b>" +
        "<br><span style='font-size:11px;color:#9A8A6A'>" + r.kcal.toLocaleString() + " per serving</span></span>" : "") +
    "</div>" +
    "<div style='display:flex;align-items:center;gap:8px;margin:-8px 0 14px'>" +
      "<button id='recipeFocusToggle' type='button' aria-pressed='" + (_recipeFocusOn ? "true" : "false") + "' style='flex-shrink:0;border:1.5px solid " + (_recipeFocusOn ? "#B5651D" : "#E0D0B8") + ";background:" + (_recipeFocusOn ? "#B5651D" : "#fff") + ";color:" + (_recipeFocusOn ? "#fff" : "#7A5A30") + ";border-radius:14px;padding:5px 13px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer'>&#x1F526; Focus</button>" +
      (_recipeFocusOn ? "<div id='recipeFocusHint' style='font-size:11px;color:#9A8A6A'>Only the next line is highlighted. Tap it when it&rsquo;s done to move on; tap any other line to jump there.</div>" : "") +
    "</div>" +
    "<div style='font-size:12px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px'>Ingredients</div>" +
    "<ul style='margin:0 0 18px;padding:0 0 0 20px'>" + ingHtml + "</ul>" +
    (prepHtml ? "<div style='font-size:12px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px'>Prep</div><div id='rcpPrepBody' style='font-size:15px;color:#2A2010;line-height:1.6;margin-bottom:18px'>" + prepHtml + "</div>" : "") +
    (r.method ? "<div style='font-size:12px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px'>Method</div><div id='rcpMethodBody' style='font-size:15px;color:#2A2010;line-height:1.6;margin-bottom:18px'>" + formatMethod(r.method) + "</div>" : "") +
    (r.notes ? "<div style='font-size:12px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px'>Notes</div><div style='font-size:14px;color:#6A5A40;line-height:1.6;margin-bottom:18px'>" + esc(r.notes) + "</div>" : "") +
    (applianceLinkUrl(r.url) ? "<div style='font-size:12px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px'>Source</div><a href='" + esc(applianceLinkUrl(r.url)) + "' target='_blank' rel='noopener noreferrer' style='display:inline-block;font-size:14px;color:#B5651D;font-weight:600;word-break:break-all;margin-bottom:18px'>&#x1F517; " + esc(r.url) + "</a>" : "") +
    "<button id='recipeToGroceryBtn' style='width:100%;box-sizing:border-box;padding:12px;margin-top:8px;border:none;background:#2D6B35;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>&#x1F6D2; Add to grocery list&hellip;</button>" +
    "<button id='recipeToFoodBtn' style='width:100%;box-sizing:border-box;padding:12px;margin-top:8px;border:none;background:#A05A10;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>&#x1F373; Log to food journal&hellip;</button>" +
    "<div style='display:flex;gap:8px;margin-top:8px'>" +
      "<button id='recipeEditBtn' style='flex:1;padding:11px;border:1.5px solid #B5651D;background:#fff;color:#B5651D;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Edit</button>" +
      "<button id='recipePrintBtn' style='flex:1;padding:11px;border:1.5px solid #B5651D;background:#fff;color:#B5651D;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>&#x1F5A8; Print</button>" +
      "<button id='recipeDeleteBtn' style='padding:11px 16px;border:1.5px solid #E0C0C0;background:#fff;color:#B03030;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Delete</button>" +
    "</div>";

  // Cook-along ticks (v405). The ingredient <li>s were marked up above; the
  // Prep/Method blocks get marked up here, after their HTML is in the DOM.
  wireRecipeTicks(document.getElementById("rcpPrepBody"), "p");
  wireRecipeTicks(document.getElementById("rcpMethodBody"), "m");
  // Recipe Focus mode: the cursor is undefined only right after a fresh entry
  // (resetRecipeTicks set it so above), so this only fires once per entry —
  // a re-render from a servings tap or a sync push must not recompute it,
  // or a "no wrap" finish would jump the highlight back onto an earlier
  // skipped line on the very next unrelated render.
  if (_recipeFocusKey === undefined) _recipeFocusKey = recipeFocusKeyAt(recipeFocusNodes(), 0);
  stampRecipeFocus();
  // One delegated listener for all three blocks. The class is toggled in place
  // rather than re-rendering, so a tap never moves the page under your hands
  // — which matters when the phone is propped up and covered in flour.
  // Wired ONCE, like the tidy and grocery-picker listeners above and below:
  // #recipesContent is permanent and only its innerHTML is replaced, so
  // attaching per render would stack a listener on every servings tap. Other
  // screens render into the same element, but nothing else emits data-tk.
  if (!_recipeTickWired) {
    _recipeTickWired = true;
    el.addEventListener("click", function(ev){
      var t = ev.target && ev.target.closest ? ev.target.closest("[data-tk]") : null;
      if (!t || !el.contains(t)) return;
      var key = t.getAttribute("data-tk");
      if (!_recipeFocusOn) {
        if (_recipeDone[key]) { delete _recipeDone[key]; t.classList.remove("rcp-done"); }
        else { _recipeDone[key] = true; t.classList.add("rcp-done"); }
        return;
      }
      // Focus mode moves the highlight and NOTHING else (v423, Cathal's ask):
      // no tap while Focus is on may cross a line out — greying/striking a
      // line is the classic (Focus off) behaviour above, and only that.
      // Tapping the highlighted line advances to the next line in page order
      // (no wrap — null once there isn't one); tapping any OTHER line jumps
      // the highlight there. Do NOT "helpfully" tick the line you're leaving:
      // _recipeDone staying empty for the whole session is what keeps the
      // cursor pure page position and the page free of strike-through.
      if (key === _recipeFocusKey) {
        var nodes = recipeFocusNodes();
        _recipeFocusKey = recipeFocusKeyAt(nodes, nodes.indexOf(t) + 1);
      } else {
        _recipeFocusKey = key;
      }
      stampRecipeFocus();
      recipeFocusScrollIntoViewIfNeeded();
    });
  }

  document.getElementById("recipeFocusToggle").addEventListener("click", function(){
    _recipeFocusOn = !_recipeFocusOn;
    storeSet("fl4_cookfocus", _recipeFocusOn);
    if (_recipeFocusOn) {
      // Stash the classic ticks and start Focus with a clean slate — the
      // undefined cursor makes renderRecipeDetail's own init logic below
      // compute the fresh first-undone position, same as a brand-new entry.
      _recipeDoneClassic = _recipeDone;
      _recipeDone = {};
      _recipeFocusKey = undefined;
    } else {
      // Bring the classic ticks back exactly as they were. Since v423 a Focus
      // session can't tick anything, so it has nothing of its own to merge.
      _recipeDone = _recipeDoneClassic || {};
      _recipeDoneClassic = null;
    }
    renderRecipeDetail();
    recipeFocusScrollIntoViewIfNeeded();
  });

  document.getElementById("recipeBackBtn").addEventListener("click", function(){
    var savedPos = _recipeScrollPos;
    _recipeView="list"; _recipeOpenId=null; resetRecipeTicks(null); renderRecipes();
    requestAnimationFrame(function(){ window.scrollTo(0, savedPos); });
  });
  document.getElementById("recipeFavBtn").addEventListener("click", function(){
    var rb = getRecipeBook(), rr = rb.find(function(x){ return x.id === r.id; });
    if (rr) { rr.fav = !rr.fav; rr.updated = Date.now(); saveRecipeBook(rb); renderRecipeDetail(); }
  });
  document.getElementById("servMinus").addEventListener("click", function(){ if(_recipeServings>1){_recipeServings--; renderRecipeDetail();} });
  document.getElementById("servPlus").addEventListener("click", function(){ if(_recipeServings<50){_recipeServings++; renderRecipeDetail();} });
  document.getElementById("recipePrintBtn").addEventListener("click", function(){
    openPrintDoc(r.name || "Recipe", RECIPE_PRINT_CSS, recipePrintHtml(r, _recipeServings));
  });
  document.getElementById("recipeDeleteBtn").addEventListener("click", function(){
    confirmDialog("Delete \"" + esc(r.name) + "\"?", function(){
      addTomb("recipes", r.id);
      saveRecipeBook(getRecipeBook().filter(function(x){ return x.id !== r.id; }));
      _recipeView="list"; _recipeOpenId=null; renderRecipes();
    });
  });
  document.getElementById("recipeToGroceryBtn").addEventListener("click", function(){ openGroceryPicker(r.id, mult); });
  document.getElementById("recipeToFoodBtn").addEventListener("click", function(){ openRecipeFoodLogSheet(r.id); });
  document.getElementById("recipeEditBtn").addEventListener("click", function(){ openRecipeEditor(r.id); });
}

// ── "Add to grocery list" review screen (v368) ─────────────────────────────
// Cathal's ask: tick which ingredients actually go on the list, and rename one
// before it goes, with the new name remembered for next time. Both choices are
// stored on the ingredient (groceryName / noBuy — see recipeGroceryName), so
// this screen is the only place they are set and every add path honours them.
// A full screen rather than a sheet: a 15-ingredient recipe should not have to
// scroll inside a small box on a phone.
var _grocPickState = null;
var _grocPickWired = false;   // #recipesContent is permanent — wire its delegated listeners once

function openGroceryPicker(id, mult) {
  var r = getRecipeBook().find(function(x){ return x && x.id === id; });
  if (!r) { _recipeView = "list"; renderRecipes(); return; }
  var m = (typeof mult === "number" && mult > 0) ? mult : 1;
  var rows = [], names = {}, take = {};
  (r.ingredients || []).forEach(function(ing, i){
    if (!ing) return;
    if (isHeaderIng(ing)) { rows.push({ i: i, header: true, label: headerLabel(ing) }); return; }
    if (!ing.name || !String(ing.name).trim()) return;
    var eff = rescueIngredientMeasure(ing);
    var sp = splitGroceryName(eff.name, eff.amount != null);
    var def = recipeGroceryName({ name: eff.name, amount: eff.amount }, sp);   // derived name, ignoring any override
    rows.push({ i: i, header: false, def: def, line: ingredientToLine(eff), amt: groceryAmtLabel(eff, m, sp) });
    names[i] = String(ing.groceryName || "").trim() || def;
    take[i] = !ing.noBuy;
  });
  // `updated` is remembered so a partner's edit landing mid-review can't be
  // overwritten by preferences written against the pre-edit ingredient list
  // (the stale-copy-wins class — same guard as the tidy pass).
  _grocPickState = { id: id, mult: m, updated: r.updated || 0, rows: rows, names: names, take: take };
  _recipeView = "grocerypick";
  renderGroceryPick();
}

function grocPickCount() {
  var st = _grocPickState;
  if (!st) return 0;
  return st.rows.filter(function(row){ return !row.header && st.take[row.i]; }).length;
}
// The Add button is updated IN PLACE — nothing on this screen re-renders on a
// tick or a keystroke, because a re-render steals focus from a name box
// mid-word (the v366 tidy-screen lesson).
function updateGrocPickAdd() {
  var btn = document.getElementById("gpkAdd");
  if (!btn || !_grocPickState) return;
  var n = grocPickCount();
  btn.disabled = !n;
  btn.style.opacity = n ? "1" : ".5";
  btn.innerHTML = n ? "&#x1F6D2; Add " + n + " to grocery list" : "Nothing ticked";
}

function renderGroceryPick() {
  _recipeEditing = true;   // a sync landing here must not wipe half-typed names
  var el = document.getElementById("recipesContent");
  var st = _grocPickState;
  if (!st) { _recipeView = "detail"; renderRecipeDetail(); return; }
  var r = getRecipeBook().find(function(x){ return x && x.id === st.id; });
  if (!r) { _grocPickState = null; _recipeView = "list"; renderRecipes(); return; }
  var serves = Math.round((r.servings || 1) * st.mult * 100) / 100;

  var rowsHtml = "";
  st.rows.forEach(function(row){
    if (row.header) {
      rowsHtml += "<div style='padding:14px 0 4px;font-size:12px;font-weight:800;color:#B5651D;text-transform:uppercase;letter-spacing:.5px'>" + esc(row.label) + "</div>";
      return;
    }
    var v = st.names[row.i] != null ? st.names[row.i] : row.def;
    var on = !!st.take[row.i];
    rowsHtml +=
      "<div style='display:flex;align-items:flex-start;gap:6px;padding:5px 0;border-bottom:1px dotted #ECE4D6'>" +
        // Padded wrapper, not the 20px box, so a near-miss still hits (44px tall)
        "<span class='gpk-chkwrap' data-i='" + esc(row.i) + "' style='display:flex;align-items:center;min-height:44px;padding:0 8px 0 2px;cursor:pointer'>" +
          "<input class='gpk-chk' type='checkbox' data-i='" + esc(row.i) + "'" + (on ? " checked" : "") +
            " aria-label='Add " + esc(row.def).replace(/'/g,"&#39;") + " to the grocery list' style='width:20px;height:20px'>" +
        "</span>" +
        "<div style='flex:1;min-width:0;padding-top:5px'>" +
          "<div style='display:flex;align-items:center;gap:8px'>" +
            "<input class='gpk-name' data-i='" + esc(row.i) + "' type='text' value='" + esc(v).replace(/'/g,"&#39;") + "'" +
              " aria-label='Name on the shopping list' style='flex:1;min-width:0;padding:9px 10px;border:1.5px solid #E0D0B8;border-radius:8px;font-family:inherit;font-size:15px;color:#2A2010;background:#fff'>" +
            (row.amt ? "<span style='font-size:13px;font-weight:700;color:#2D6B35;white-space:nowrap'>" + esc(row.amt) + "</span>" : "") +
          "</div>" +
          "<div style='font-size:11px;color:#9A8A6A;margin-top:3px'>" + esc(row.line) + "</div>" +
        "</div>" +
      "</div>";
  });

  el.innerHTML =
    "<button id='gpkBackBtn' style='border:none;background:none;color:#B5651D;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px'>&larr; Cancel</button>" +
    "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;color:#2A2010;margin-bottom:2px'>Add to grocery list</div>" +
    "<div style='font-size:13px;color:#9A7A4A;font-weight:600;margin-bottom:10px'>" + esc(r.name) + " &middot; serves " + serves + "</div>" +
    "<div style='font-size:13px;color:#6A5A40;line-height:1.5;background:#FBF5EC;border:1px solid #ECE0CC;border-radius:10px;padding:10px 12px;margin-bottom:12px'>" +
      "Untick anything you already have, and change a name to whatever you&rsquo;d rather read in the shop. Both are remembered for this recipe next time &mdash; the recipe itself keeps its own wording." +
    "</div>" +
    (rowsHtml ? "<div style='display:flex;gap:8px;margin-bottom:6px'>" +
      "<button id='gpkAll' style='flex:1;padding:8px;border:1.5px solid #D8C8A8;background:#fff;color:#7A5A30;border-radius:8px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>Tick all</button>" +
      "<button id='gpkNone' style='flex:1;padding:8px;border:1.5px solid #D8C8A8;background:#fff;color:#7A5A30;border-radius:8px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>Untick all</button>" +
    "</div>" : "") +
    (rowsHtml || "<div style='font-size:14px;color:#8A7A5A;padding:14px 0'>This recipe has no ingredients to add.</div>") +
    "<button id='gpkAdd' style='width:100%;box-sizing:border-box;padding:13px;margin-top:14px;border:none;background:#2D6B35;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>&#x1F6D2; Add to grocery list</button>";

  document.getElementById("gpkBackBtn").addEventListener("click", grocPickCancel);
  var addBtn = document.getElementById("gpkAdd");
  if (addBtn) addBtn.addEventListener("click", applyGroceryPick);
  var allBtn = document.getElementById("gpkAll"), noneBtn = document.getElementById("gpkNone");
  // Tick/untick all flips the boxes in place rather than re-rendering, so a
  // name being typed is never interrupted.
  function setAll(on){
    if (!_grocPickState) return;
    Array.prototype.forEach.call(el.querySelectorAll(".gpk-chk"), function(c){
      c.checked = on;
      _grocPickState.take[Number(c.getAttribute("data-i"))] = on;
    });
    updateGrocPickAdd();
  }
  if (allBtn)  allBtn.addEventListener("click", function(){ setAll(true); });
  if (noneBtn) noneBtn.addEventListener("click", function(){ setAll(false); });

  // Delegated and wired ONCE: #recipesContent is permanent (only its innerHTML
  // is replaced), so attaching per render would stack listeners. Both handlers
  // read _grocPickState rather than this render's closure.
  if (!_grocPickWired) {
    _grocPickWired = true;
    el.addEventListener("input", function(e){
      var t = e.target;
      if (!t || !t.classList || !_grocPickState) return;
      if (t.classList.contains("gpk-name")) _grocPickState.names[Number(t.getAttribute("data-i"))] = t.value;
    });
    el.addEventListener("click", function(e){
      if (!_grocPickState) return;
      var w = e.target && e.target.closest ? e.target.closest(".gpk-chkwrap") : null;
      if (!w) return;
      var c = w.querySelector(".gpk-chk");
      if (!c) return;
      if (e.target !== c) c.checked = !c.checked;   // tapped the padding, not the box
      _grocPickState.take[Number(w.getAttribute("data-i"))] = c.checked;
      updateGrocPickAdd();
    });
  }
  updateGrocPickAdd();
}

function grocPickCancel() {
  _grocPickState = null;
  _recipeEditing = false;
  _recipeView = "detail";
  renderRecipeDetail();
}

// Save the preferences onto the recipe first, then push with the normal
// addRecipeToGroceries — the push reads noBuy/groceryName off the ingredients,
// so there is exactly one code path onto the grocery list.
function applyGroceryPick() {
  var st = _grocPickState;
  if (!st) return;
  if (!grocPickCount()) { toast("Tick at least one ingredient"); return; }
  var rb = getRecipeBook();
  var r = rb.find(function(x){ return x && x.id === st.id; });
  if (!r) { _grocPickState = null; _recipeView = "list"; renderRecipes(); return; }
  // The recipe moved under us (a partner's edit, a sync, the tidy pass): the
  // indexes this screen holds may no longer point at the same ingredients, so
  // rebuild from what is stored now instead of writing against a stale copy.
  if ((r.updated || 0) !== st.updated) {
    toast("This recipe just changed &mdash; check the list again");
    openGroceryPicker(st.id, st.mult);
    return;
  }
  var ings = r.ingredients || [];
  var changed = false;
  st.rows.forEach(function(row){
    if (row.header) return;
    var ing = ings[row.i];
    if (!ing || isHeaderIng(ing)) return;
    var typed = String(st.names[row.i] != null ? st.names[row.i] : "").trim();
    // Typing the derived name back in is not an override — keep the data clean
    // so a later parser improvement still reaches this ingredient.
    var want = (typed && typed !== row.def) ? typed : "";
    if (want !== String(ing.groceryName || "")) {
      if (want) ing.groceryName = want; else delete ing.groceryName;
      changed = true;
    }
    var take = !!st.take[row.i];
    if (take === !!ing.noBuy) {
      if (take) delete ing.noBuy; else ing.noBuy = true;
      changed = true;
    }
  });
  if (changed) {
    r.updated = Date.now();
    saveRecipeBook(rb);
    pushPersonal();
  }
  var mult = st.mult;
  _grocPickState = null;
  _recipeEditing = false;
  addRecipeToGroceries(r, mult);
  _recipeView = "detail";
  renderRecipeDetail();
}

// Minimal create/edit for step one (raw text entry; richer parsing comes later)
function openRecipeEditor(id) {
  _recipeEditing = true;
  var r = id != null ? getRecipeBook().find(function(x){ return x.id === id; }) : null;
  var isNew = !r;
  // Build an ingredient text representation: "amount unit name" per line
  var ingText = r ? (r.ingredients||[]).map(ingredientToLine).join("\n") : "";
  // Offered as a button, never pre-filled: the derived prep is a display
  // fallback everywhere else, and silently seeding the textarea would write it
  // into the recipe for real the next time Cathal saved anything at all.
  var derivedPrep = r ? derivedPrepSteps(r) : [];
  var el = document.getElementById("recipesContent");
  el.innerHTML =
    "<button id='recipeCancelEdit' style='border:none;background:none;color:#B5651D;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px'>&larr; Cancel</button>" +
    "<div style='font-family:Georgia,serif;font-size:22px;font-weight:600;margin-bottom:14px'>" + (isNew?"New recipe":"Edit recipe") + "</div>" +
    fieldLabel("Name") +
    "<input id='reName' type='text' value='" + (r?esc(r.name).replace(/'/g,"&#39;"):"") + "' placeholder='Recipe name' style='" + recipeInputCss() + "margin-bottom:12px'>" +
    fieldLabel("Serves") +
    "<input id='reServings' type='number' min='1' value='" + (r?r.servings||1:1) + "' style='" + recipeInputCss() + "margin-bottom:12px;max-width:90px'>" +
    fieldLabel("Calories per serving (optional)") +
    "<input id='reKcal' type='number' min='0' max='9999' inputmode='numeric' value='" + (r&&r.kcal?r.kcal:"") + "' placeholder='e.g. 520' style='" + recipeInputCss() + "margin-bottom:4px;max-width:110px'>" +
    "<div style='font-size:11px;color:#9A8A6A;margin-bottom:12px'>Your own figure, per serving &mdash; used when you log this recipe to the food journal.</div>" +
    fieldLabel("Category (optional)") +
    "<input id='reCategory' type='text' value='" + (r&&r.category?esc(r.category).replace(/'/g,"&#39;"):"") + "' placeholder='e.g. Breakfast, Dinner, Dessert' list='reCatList' style='" + recipeInputCss() + "margin-bottom:12px'>" +
    "<datalist id='reCatList'>" + recipeCategoryOptions() + "</datalist>" +
    recipeCategoryChips() +
    "<label style='display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:14px;color:#2A2010;cursor:pointer'><input id='reInRotation' type='checkbox'" + (r&&r.inRotation?" checked":"") + " style='width:18px;height:18px'> &#x1F501; In rotation (eligible for the weekly auto-fill)</label>" +
    fieldLabel("Ingredients (one per line: amount unit name)") +
    "<textarea id='reIng' rows='7' placeholder='2 tsp instant coffee&#10;150 ml milk&#10;~8 cube ice cubes' style='" + recipeInputCss() + "resize:vertical;line-height:1.6'>" + (ingText?esc(ingText):"") + "</textarea>" +
    recipeResizeGrip("reIng") +
    "<details open style='margin-bottom:12px'>" + recipeSectionSummary("Prep (optional) — done before the cooking starts") +
    "<textarea id='rePrep' rows='3' placeholder='Finely chop the onion&#10;Preheat the oven to 200C' style='" + recipeInputCss() + "margin-top:5px;resize:vertical;line-height:1.6'>" + (r&&r.prep?esc(r.prep):"") + "</textarea>" +
    recipeResizeGrip("rePrep") +
    (derivedPrep.length ? "<button id='rePrepFromIng' type='button' style='border:1.5px solid #D8C0A0;background:#FBF4E8;color:#8A5A1A;border-radius:8px;padding:7px 11px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;margin-top:6px'>&#x2193; Use the prep from my ingredients (" + derivedPrep.length + ")</button>" : "") +
    "</details>" +
    "<details open style='margin-bottom:12px'>" + recipeSectionSummary("Method") +
    "<textarea id='reMethod' rows='5' placeholder='Step-by-step method...' style='" + recipeInputCss() + "margin-top:5px;resize:vertical;line-height:1.6'>" + (r&&r.method?esc(r.method):"") + "</textarea>" +
    recipeResizeGrip("reMethod") +
    "</details>" +
    "<details open style='margin-bottom:16px'>" + recipeSectionSummary("Notes (optional)") +
    "<textarea id='reNotes' rows='2' placeholder='Any notes...' style='" + recipeInputCss() + "margin-top:5px;resize:vertical;line-height:1.6'>" + (r&&r.notes?esc(r.notes):"") + "</textarea>" +
    recipeResizeGrip("reNotes") +
    "</details>" +
    fieldLabel("Recipe URL (optional)") +
    "<input id='reUrl' type='url' value='" + (r&&r.url?esc(r.url).replace(/'/g,"&#39;"):"") + "' placeholder='https://example.com/recipe' style='" + recipeInputCss() + "margin-bottom:16px'>" +
    "<button id='reSave' style='width:100%;padding:13px;border:none;background:#B5651D;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>Save</button>";

  document.getElementById("recipeCancelEdit").addEventListener("click", function(){
    _recipeEditing = false;
    if (isNew) { _recipeView="list"; renderRecipes(); }
    else { _recipeView="detail"; renderRecipeDetail(); }
  });
  wireRecipeResizeGrips(el);
  var _reChips = document.getElementById("reCatChips");
  if (_reChips) {
    var _hiReChip = function(){
      var v = (document.getElementById("reCategory").value||"").trim().toLowerCase();
      Array.prototype.forEach.call(_reChips.querySelectorAll(".reCatChip"), function(x){
        var on = v !== "" && x.getAttribute("data-cat").toLowerCase() === v;
        x.style.background  = on ? "#B5651D" : "#FBF4E8";
        x.style.color       = on ? "#fff"    : "#8A5A1A";
        x.style.borderColor = on ? "#B5651D" : "#D8C0A0";
      });
    };
    _reChips.addEventListener("click", function(e){
      var b = e.target && e.target.closest ? e.target.closest(".reCatChip") : null;
      if (!b) return;
      var input = document.getElementById("reCategory");
      var val = b.getAttribute("data-cat");
      input.value = (input.value.trim().toLowerCase() === val.toLowerCase()) ? "" : val; // tap active to clear
      _hiReChip();
    });
    document.getElementById("reCategory").addEventListener("input", _hiReChip);
    _hiReChip(); // reflect current value when the editor opens
  }
  var _rePrepBtn = document.getElementById("rePrepFromIng");
  if (_rePrepBtn) {
    _rePrepBtn.addEventListener("click", function(){
      var ta = document.getElementById("rePrep");
      var lines = derivedPrep.map(prepStepLine).join("\n");
      // Appended, never overwritten — anything already typed is his, and a
      // button that eats it would be the wrong kind of surprise.
      ta.value = ta.value.trim() ? (ta.value.replace(/\s+$/, "") + "\n" + lines) : lines;
      ta.focus();
      toast("Prep added — edit it as you like");
    });
  }
  document.getElementById("reSave").addEventListener("click", function(){
    var name = document.getElementById("reName").value.trim();
    if (!name) { toast("Name can't be empty"); return; }
    var servings = parseInt(document.getElementById("reServings").value, 10) || 1;
    var category = document.getElementById("reCategory").value.trim();
    var ingredients = parseIngredients(document.getElementById("reIng").value);
    var prep   = document.getElementById("rePrep").value.trim();
    var method = document.getElementById("reMethod").value.trim();
    var notes  = document.getElementById("reNotes").value.trim();
    var url = normalizeRecipeUrl(document.getElementById("reUrl").value);
    var inRotation = document.getElementById("reInRotation").checked;
    // Typed, never estimated (v434) — see the FOOD_CAL note on logRecipeToFood.
    var kcal = parseInt(document.getElementById("reKcal").value, 10) || 0;
    if (kcal < 0) kcal = 0;
    var rb = getRecipeBook();
    if (isNew) {
      var nid = nextRecipeId(recipeIdMap(rb));
      rb.unshift({ id:nid, name:name, servings:servings, kcal:kcal, category:category, ingredients:ingredients, prep:prep, method:method, notes:notes, url:url, fav:false, inRotation:inRotation, updated:Date.now(), addedBy:hearthUser });
      _recipeOpenId = nid;
    } else {
      var ex = rb.find(function(x){ return x.id === id; });
      // The textarea only carries "amount unit name", so re-parsing it would
      // drop the v368 shopping preferences — carry them onto the new lines.
      if (ex) { ex.name=name; ex.servings=servings; ex.kcal=kcal; ex.category=category; ex.ingredients=carryGroceryPrefs(ingredients, ex.ingredients); ex.prep=prep; ex.method=method; ex.notes=notes; ex.url=url; ex.inRotation=inRotation; ex.updated=Date.now(); }
    }
    saveRecipeBook(rb);
    _recipeEditing = false;
    _recipeServings = servings;
    _recipeView="detail"; renderRecipeDetail();
    toast("Recipe saved");
  });
}
// Build recipe objects from pasted CSV text. Returns {recipes, skipped}.
function recipesFromCSV(text) {
  var rows = parseCSV(text);
  if (!rows.length) return { recipes: [], skipped: 0, tidied: 0 };
  // Built once and threaded through the loop: nextRecipeId reserves each id
  // it hands out, so a 118-row import can't collide with itself or with a
  // recipe already in the book (v400).
  var takenIds = recipeIdMap(getRecipeBook());
  var header = rows[0].map(function(h){ return (h||"").trim().toLowerCase(); });
  function col(name){ return header.indexOf(name); }
  var iTitle = col("title"), iIng = col("ingredients"), iInstr = col("instructions"),
      iQty = col("quantity"), iNotes = col("notes"), iSource = col("source");
  var recipes = [], skipped = 0, tidied = 0;
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    if (!row || !row.length) continue;
    var ingRaw = iIng >= 0 ? (row[iIng]||"").trim() : "";
    if (!ingRaw || ingRaw.toLowerCase() === "nan") { skipped++; continue; }
    var title = iTitle >= 0 ? (row[iTitle]||"").trim() : "";
    if (!title || title.toLowerCase() === "nan") { skipped++; continue; }
    // servings from quantity (first number; "8-10" → 8; blank → 1)
    var servings = 1;
    if (iQty >= 0) {
      var qm = String(row[iQty]||"").match(/\d+/);
      if (qm) servings = parseInt(qm[0], 10) || 1;
    }
    var ingredients = parseIngredients(ingRaw, true); // strip parens
    // Run the same lossless tidy pass the v366 "🧹 Tidy" tool applies to the
    // existing book, so a freshly-imported recipe never needs tidying again.
    // Only confident (ok) rewrites are kept; a flagged line imports exactly
    // as it does today — the import preview is not a place to ask questions.
    ingredients = ingredients.map(function(ing){
      var t = tidyIngredient(ing);
      if (!t.ok) return ing;
      if (t.changed) tidied++;
      return t.ing;
    });
    var method = iInstr >= 0 ? cleanText(row[iInstr]) : "";
    var notes  = iNotes >= 0 ? cleanText(row[iNotes]) : "";
    var source = iSource >= 0 ? (row[iSource]||"").trim() : "";
    if (source && source.toLowerCase() !== "nan") {
      notes = (notes ? notes + "\n\n" : "") + "Source: " + source;
    }
    recipes.push({
      id: nextRecipeId(takenIds),
      name: title, servings: servings, ingredients: ingredients,
      method: method, notes: notes, updated: Date.now() + r, addedBy: hearthUser
    });
  }
  return { recipes: recipes, skipped: skipped, tidied: tidied };
}

var RECIPE_FILE_TAG = "recipe-v1";

// The template Cathal hands to an AI chat (a photo, a page, or pasted text of
// a recipe) to get back JSON the paste box below accepts. ingredients stays a
// single "amount unit name per line" string, same shape as the editor's own
// textarea, so it goes through the same parseIngredients() as everything else.
function recipeAIPrompt() {
  return "Here is a recipe (as text, a photo, or a link) — turn it into JSON for my Hearth app.\n\n" +
    "Reply with ONLY this JSON — no code fences, no commentary before or after:\n\n" +
    "{\n" +
    "  \"hearth\": \"" + RECIPE_FILE_TAG + "\",\n" +
    "  \"name\": \"\",\n" +
    "  \"servings\": 1,\n" +
    "  \"category\": \"\",\n" +
    "  \"ingredients\": \"\",\n" +
    "  \"prep\": \"\",\n" +
    "  \"method\": \"\",\n" +
    "  \"notes\": \"\",\n" +
    "  \"kcal\": 0,\n" +
    "  \"url\": \"\"\n" +
    "}\n\n" +
    "Field notes:\n" +
    "- name: the recipe's title. servings: a whole number — however many it says it serves, or 1 if it doesn't say.\n" +
    "- category: one word if obvious (\"Breakfast\", \"Dinner\", \"Dessert\"), else \"\".\n" +
    "- ingredients: one per line, as \"amount unit name\" — e.g. \"200 g flour\", \"2 eggs\", \"a pinch salt\". Plain text, no bullets or dashes.\n" +
    "- prep: only steps done before cooking starts (chopping, marinating, preheating oven), as separate lines — leave \"\" if the recipe doesn't call these out separately.\n" +
    "- method: the numbered steps, as plain lines — no numbering needed, Hearth adds its own.\n" +
    "- notes: anything else worth keeping (serving suggestions, storage, a source note), else \"\".\n" +
    "- kcal: calories per serving if the recipe states them, else 0.\n" +
    "- url: the page's own URL if you were given a link, else \"\".\n" +
    "- Leave a field \"\" (or 0) if you genuinely don't know — don't guess or pad it out.\n" +
    "- For several recipes at once, reply {\"hearth\":\"" + RECIPE_FILE_TAG + "\",\"recipes\":[ {...}, {...} ]}.";
}

// Clipboard with an execCommand fallback, same shape as plantCopyPrompt —
// writeText needs a user gesture and a secure context, neither guaranteed here.
function recipeCopyPrompt() {
  var text = recipeAIPrompt();
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
      toast(ok ? "&#x1F4CB; Prompt copied" : "Couldn't copy — select the prompt below by hand");
    } catch (e) { toast("Couldn't copy — select the prompt below by hand"); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function(){ toast("&#x1F4CB; Prompt copied"); }, fallback);
  } else { fallback(); }
}

// Build recipe objects from an AI chat's recipe-v1 JSON reply. Accepts a bare
// recipe object as well as a {recipes:[...]} list, mirroring parsePlantFile —
// a one-recipe reply and a multi-recipe reply both come through the same door.
function recipesFromAIJSON(raw) {
  var obj;
  try { obj = JSON.parse(raw); } catch (e) { return { recipes: [], error: "Couldn't parse JSON — check the format and try again." }; }
  if (!obj || obj.hearth !== RECIPE_FILE_TAG) return { recipes: [], error: "Not a Hearth recipe file. Make sure the JSON includes \"hearth\":\"" + RECIPE_FILE_TAG + "\"." };
  var list = Array.isArray(obj.recipes) ? obj.recipes : [obj];
  var takenIds = recipeIdMap(getRecipeBook());
  var recipes = [], tidied = 0;
  list.forEach(function(o, i){
    if (!o || typeof o !== "object") return;
    var name = String(o.name || "").trim();
    if (!name) return;
    var ingredients = parseIngredients(String(o.ingredients || ""), true).map(function(ing){
      var t = tidyIngredient(ing);
      if (t.ok && t.changed) tidied++;
      return t.ok ? t.ing : ing;
    });
    recipes.push({
      id: nextRecipeId(takenIds),
      name: name,
      servings: parseInt(o.servings, 10) || 1,
      kcal: parseInt(o.kcal, 10) || 0,
      category: String(o.category || "").trim(),
      ingredients: ingredients,
      prep: String(o.prep || "").trim(),
      method: String(o.method || "").trim(),
      notes: String(o.notes || "").trim(),
      url: normalizeRecipeUrl(o.url || ""),
      fav: false, inRotation: false,
      updated: Date.now() + i, addedBy: hearthUser
    });
  });
  return { recipes: recipes, tidied: tidied, error: recipes.length ? null : "No recipes with a name found." };
}

// The paste box takes either a CSV export or an AI chat's recipe-v1 JSON reply
// — dispatch on shape so recipeImportText stays a single box. Chats love to
// wrap JSON in ```json fences even when told not to.
function recipesFromImportText(text) {
  var t = stripPasteFence(text);
  if (t.charAt(0) === "{") return recipesFromAIJSON(t);
  return recipesFromCSV(t);
}
function cleanText(s) {
  s = (s||"").trim();
  if (!s || s.toLowerCase() === "nan") return "";
  return s.replace(/\n{3,}/g, "\n\n");
}

function recipeCategoryOptions() {
  var seen = {}, out = "";
  getRecipeBook().forEach(function(r){ var c=(r.category||"").trim(); if(c && !seen[c.toLowerCase()]){ seen[c.toLowerCase()]=1; out += "<option value='" + esc(c).replace(/'/g,"&#39;") + "'></option>"; } });
  return out;
}
// Tappable quick-pick chips of previously-used categories (reliable on Android,
// where the <datalist> dropdown often doesn't surface). Tap fills the field;
// tap the active chip again to clear it.
function recipeCategoryChips() {
  var seen = {}, cats = [];
  getRecipeBook().forEach(function(r){ var c=(r.category||"").trim(); if(c && !seen[c.toLowerCase()]){ seen[c.toLowerCase()]=1; cats.push(c); } });
  cats.sort(function(a,b){ return a.toLowerCase().localeCompare(b.toLowerCase()); });
  if (!cats.length) return "";
  return "<div id='reCatChips' style='display:flex;flex-wrap:wrap;gap:6px;margin:-4px 0 12px'>" +
    cats.map(function(c){ var v=esc(c).replace(/'/g,"&#39;"); return "<button type='button' class='reCatChip' data-cat='" + v + "' style='padding:5px 11px;border:1.5px solid #D8C0A0;background:#FBF4E8;color:#8A5A1A;border-radius:14px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer'>" + esc(c) + "</button>"; }).join("") +
    "</div>";
}
function fieldLabel(t){ return "<div style='font-size:11px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px'>" + t + "</div>"; }
// Same look as fieldLabel, but as a <summary> so the section it labels can collapse.
function recipeSectionSummary(t){ return "<summary style='font-size:11px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px;cursor:pointer;padding:2px 0'>" + t + "</summary>"; }
// A visible drag handle under a resizable textarea. CSS resize:vertical
// leaves no visible grip on most mobile browsers, so this is what actually
// lets you make the box taller by hand there.
function recipeResizeGrip(targetId){ return "<div class='reResizeGrip' data-target='" + esc(targetId) + "' style='text-align:center;font-size:11px;color:#9A8A6A;padding:6px 0;margin-bottom:8px;cursor:ns-resize;touch-action:none;user-select:none'>&#8597; Drag to resize</div>"; }
// Wires every .reResizeGrip inside root to drag-resize the textarea named in
// its data-target, via Pointer Events (covers touch, mouse and pen alike).
function wireRecipeResizeGrips(root) {
  Array.prototype.forEach.call(root.querySelectorAll(".reResizeGrip"), function(grip){
    var ta = document.getElementById(grip.getAttribute("data-target"));
    if (!ta) return;
    var startY = 0, startH = 0;
    function onMove(e) { ta.style.height = Math.max(60, startH + (e.clientY - startY)) + "px"; }
    // v480: pointercancel ends a drag too. Android cancels a touch it takes
    // over (a scroll, the back gesture) and never sends pointerup, which used
    // to leave onMove attached -- any later finger movement anywhere resized
    // this box. Do NOT drop the pointercancel half.
    function onEnd() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
    }
    grip.addEventListener("pointerdown", function(e){
      e.preventDefault();
      onEnd();   // a drag never overlaps another; drop anything left attached
      startY = e.clientY;
      startH = ta.getBoundingClientRect().height;
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onEnd);
      document.addEventListener("pointercancel", onEnd);
    });
  });
}
// Force http(s) so a stray "javascript:" (or a bare "example.com") never
// lands in an <a href> unescaped — trusted scheme in, trusted scheme out.
function normalizeRecipeUrl(u) {
  u = (u||"").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}
function recipeInputCss(){ return "width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #D8D0C0;border-radius:10px;background:#FDFAF3;color:#2A2010;font-family:inherit;font-size:14px;outline:none;"; }

// Same-dimension unit families for summing a compound amount ("1 3/4 cup +
// 2 tbsp") into ONE normalized amount+unit. Factor = how many of the
// family's base unit one of this unit holds. Units outside these three
// families (oz/lb, count units) are deliberately not summable — guessing at
// a density conversion is worse than leaving the line unparsed.
var COMPOUND_UNIT_FAMILIES = {
  tsp:  { base: "tsp", factor: 1 },  tbsp: { base: "tsp", factor: 3 },  cup: { base: "tsp", factor: 48 },
  ml:   { base: "ml",  factor: 1 },  l:    { base: "ml",  factor: 1000 },
  g:    { base: "g",   factor: 1 },  kg:   { base: "g",   factor: 1000 }
};
function sumCompoundAmount(amt1, unit1, amt2, unit2) {
  var f1 = COMPOUND_UNIT_FAMILIES[unit1], f2 = COMPOUND_UNIT_FAMILIES[unit2];
  if (!f1 || !f2 || f1.base !== f2.base || amt1 == null || amt2 == null) return null;
  var totalBase = amt1 * f1.factor + amt2 * f2.factor;
  var outUnit = f1.factor >= f2.factor ? unit1 : unit2;
  return { amount: totalBase / COMPOUND_UNIT_FAMILIES[outUnit].factor, unit: outUnit };
}

// Parse "amount unit name" lines into ingredient objects.
// Handles fractions ("1 1/2", "1/3", "¾"), "~" prefix, unit synonyms
// (tablespoon(s)/teaspoon(s)/grams etc.), and optional bracket-stripping.
// Also recovers two shapes the leading-amount match alone can't reach:
// compound amounts ("1 3/4 cup + 2 tbsp", summed via sumCompoundAmount, with
// the original phrasing kept on `_compoundNote` so the editor round-trips it
// and the grocery note can cite it) and ranges ("2-3 tbsp" / "2 to 3 tbsp",
// stored as `amount`+`amountMax`).
// Hoisted out of parseIngredients (v366) so the losslessness check can fold a
// unit word to the same canonical form the parser uses — otherwise rewriting
// "2 tablespoons" as "2 tbsp" reads as a lost word.
var INGREDIENT_UNIT_MAP = {
    "tsp":"tsp","teaspoon":"tsp","teaspoons":"tsp","teaspoon(s)":"tsp",
    "tbsp":"tbsp","tbs":"tbsp","tablespoon":"tbsp","tablespoons":"tbsp","tablespoon(s)":"tbsp",
    "ml":"ml","millilitre":"ml","millilitres":"ml","milliliter":"ml","milliliters":"ml",
    "l":"l","litre":"l","litres":"l","liter":"l","liters":"l",
    "g":"g","gram":"g","grams":"g","gr":"g",
    "kg":"kg","kilogram":"kg","kilograms":"kg",
    // "C" is cup in US recipe shorthand ("1 1/2 C Dry Beans"), and it means
    // cup in either case so there is no ambiguity to get wrong. "T"/"t" are
    // deliberately absent: they mean tablespoon vs teaspoon by CASE, and unit
    // lookups here are lowercased, so the two could never be told apart.
    "cup":"cup","cups":"cup","c":"cup",
    "oz":"oz","ounce":"oz","ounces":"oz",
    "lb":"lb","lbs":"lb","pound":"lb","pounds":"lb",
    "cube":"cube","cubes":"cube","pinch":"pinch","pinches":"pinch",
    "clove":"clove","cloves":"clove","can":"can","cans":"can","tin":"tin","tins":"tin",
    "slice":"slice","slices":"slice","piece":"piece","pieces":"piece",
    "scoop":"scoop","scoops":"scoop","rasher":"rasher","rashers":"rasher",
    "sprig":"sprig","sprigs":"sprig","bunch":"bunch","bunches":"bunch","stick":"stick","sticks":"stick"
};
function parseIngredients(text, stripParens) {
  var unitMap = INGREDIENT_UNIT_MAP;
  return text.split("\n").map(function(l){ return l.trim(); }).filter(Boolean).map(function(line){
    // Text copied out of an AI chat (translated recipes are a common source)
    // routinely carries invisible zero-width/format characters — a real recipe
    // arrived with a U+200B before every single line, which sits in front of
    // the amount and blocks the "must START with a digit" match just as
    // effectively as a visible glyph, while leaving the line looking completely
    // normal on screen. Stripped everywhere in the line, not just the front,
    // since one can just as easily land between the number and its unit.
    line = line.replace(/[\u200b\u200c\u200d\u2060\ufeff\xad\u200e\u200f]/g, "");
    // Scraped ingredient lists often carry the website's own tick box as the
    // first character ("☐ 2 tsp Ground Cumin"). It is pure ingest noise, but a
    // line that doesn't START with a digit gets no amount at all, so a single
    // glyph was stranding the entire measure in the name. Stripped before
    // anything else looks at the line. Bare "-"/"*" are deliberately NOT in
    // here: a leading asterisk is usually a footnote marker, not a bullet.
    line = line.replace(/^[☐☑☒■□▢▣○●•◦▪‣✓✔✗✘❑❏]+\s*/, "")
               .replace(/^\[\s*[xX✓]?\s*\]\s*/, "")
               .trim();
    if (!line) return { name: "" };
    var approx = false;
    if (line[0] === "~") { approx = true; line = line.slice(1).trim(); }
    if (stripParens) line = line.replace(/\s*\([^)]*\)/g, "").replace(/\s*\)\s*/g," ").replace(/[\s,]+$/,"").replace(/\s{2,}/g," ").trim();
    // Section header (e.g. "<b>Base</b>" or "Sauce:") — keep for display, never a grocery item.
    var _bare = line.replace(/<\/?[^>]+>/g,"").trim();
    if (/^<(b|strong)\b[^>]*>[\s\S]*<\/(b|strong)>$/i.test(line) ||
        (/:\s*$/.test(_bare) && !/^[\d¼½¾⅓⅔⅛⅜⅝⅞]/.test(_bare))) {
      return { name: _bare.replace(/:\s*$/,"").trim(), header: true };
    }
    // Any REMAINING markup is ingest noise and has to go before the amount is
    // read: a scraped struck-through line arrives as "<s>2 tbsp sugar</s>",
    // which doesn't START with a digit, so a stray tag pair was stranding the
    // whole measure in the name. Done after the header check above, because
    // that check needs the <b>/<strong> tags it matches on.
    line = line.replace(/<\/?[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
    if (!line) return { name: "" };
    // amount: a single leading number ("1 1/2" / "1/3" / unicode fraction /
    // decimal), OR one of two shapes that leading match alone can't reach —
    // tried first since both start with what looks like a single amount.
    var AMT = "\\d+\\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|\\d+(?:\\.\\d+)?";
    var amount = null, amountMax = null, rest = line, compoundUnit = null, compoundNote = null;

    // Compound: "1 3/4 cup + 2 tbsp flour" (also "plus"). Both terms need a
    // recognised unit in the SAME family (see sumCompoundAmount) or this
    // isn't attempted — an unconvertible mix falls through unparsed rather
    // than guessing at a density.
    // "and" joins a compound as often as "+" does ("1 cup and 4 tablespoons
    // granulated sugar"). Safe to add because BOTH sides must still resolve to
    // a recognised unit in the same family, so "2 cloves and 1 onion" — where
    // "onion" is not a unit — still doesn't match.
    var cm = line.match(new RegExp("^(" + AMT + ")\\s*([a-zA-Z]+)\\s*(?:\\+|plus|and)\\s*(" + AMT + ")\\s*([a-zA-Z]+)\\s+(.*)$", "i"));
    if (cm) {
      var cu1 = unitMap[cm[2].toLowerCase().replace(/[.,]$/,"")];
      var cu2 = unitMap[cm[4].toLowerCase().replace(/[.,]$/,"")];
      var csum = (cu1 && cu2) ? sumCompoundAmount(parseAmount(cm[1]), cu1, parseAmount(cm[3]), cu2) : null;
      if (csum) {
        amount = csum.amount; compoundUnit = csum.unit; rest = cm[5];
        compoundNote = cm[1] + " " + cm[2] + " + " + cm[3] + " " + cm[4];
      }
    }

    // Range: "2-3 tbsp" / "2–3 tbsp" / "2 to 3 tbsp". Only when the second
    // number is actually bigger — an unrelated hyphenated fraction like
    // "1-1/2" must never be misread as a 1-to-0.5 range.
    if (amount == null) {
      var rm = line.match(new RegExp("^(" + AMT + ")(?:\\s*[-–—]\\s*|\\s+to\\s+)(" + AMT + ")\\s+(.*)$", "i"));
      if (rm) {
        var a1 = parseAmount(rm[1]), a2 = parseAmount(rm[2]);
        if (a1 != null && a2 != null && a2 > a1) { amount = a1; amountMax = a2; rest = rm[3]; }
      }
    }

    // Single leading amount (original behaviour, unchanged).
    if (amount == null) {
      var m = line.match(new RegExp("^(" + AMT + ")\\s+(.*)$"));
      if (m) { amount = parseAmount(m[1]); rest = m[2]; }
    }

    // unit: next word if known (strip trailing punctuation) — skipped when
    // the compound match already resolved a normalized unit.
    var unit = compoundUnit;
    if (!unit) {
      var parts = rest.split(/\s+/);
      if (parts.length) {
        var cand = parts[0].toLowerCase().replace(/[.,]$/,"");
        if (unitMap[cand]) { unit = unitMap[cand]; rest = parts.slice(1).join(" "); }
      }
    }
    rest = rest.replace(/^,\s*/,"").replace(/[\s,]+$/,"").trim();
    var ing = { name: rest };
    if (amount != null) ing.amount = amount;
    if (amountMax != null) ing.amountMax = amountMax;
    if (unit) ing.unit = unit;
    if (approx) ing.approx = true;
    if (compoundNote) ing._compoundNote = compoundNote;
    return ing;
  }).filter(function(ing){ return ing.name; });
}
function parseAmount(s) {
  var fr = {"¼":0.25,"½":0.5,"¾":0.75,"⅓":0.333,"⅔":0.667,"⅛":0.125,"⅜":0.375,"⅝":0.625,"⅞":0.875};
  s = s.trim();
  if (fr[s] != null) return fr[s];
  // mixed "1 1/2"
  var mm = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mm) return (+mm[1]) + (+mm[2])/(+mm[3]);
  // mixed integer + unicode fraction: "1 ¾" or "1¾"
  var um = s.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (um) return (+um[1]) + fr[um[2]];
  if (s.indexOf("/") !== -1) { var p=s.split("/"); return (+p[0])/(+p[1]); }
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Minimal RFC-4180 CSV parser: handles quoted fields, embedded newlines and commas, "" escapes.
function parseCSV(text) {
  var rows = [], row = [], field = "", inQ = false, i = 0;
  text = text.replace(/^\uFEFF/, ""); // strip BOM
  while (i < text.length) {
    var ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i+1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ""; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += ch; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function getTravelTags() { return storeGet("fl4_travel_tags") || []; }
function addTravelTagToPool(tag) {
  var pool = getTravelTags();
  if (!pool.some(function(t){ return t.toLowerCase() === tag.toLowerCase(); })) {
    pool.push(tag); storeSet("fl4_travel_tags", pool);
  }
}

function renderItemSheetTags() {
  var box = document.getElementById("itemSheetTagsChips");
  if (!box) return;
  box.innerHTML = "";
  // Union of pool tags and any already on this item
  var pool = getTravelTags().slice();
  _sheetTags.forEach(function(t){ if (!pool.some(function(p){return p.toLowerCase()===t.toLowerCase();})) pool.push(t); });
  if (!pool.length) {
    box.innerHTML = "<span style='font-size:12px;color:#A0855A'>No tags yet — add one below.</span>";
    return;
  }
  pool.forEach(function(tag){
    var on = _sheetTags.some(function(t){ return t.toLowerCase() === tag.toLowerCase(); });
    var chip = document.createElement("button");
    chip.textContent = tag;
    chip.style.cssText = "border:1.5px solid " + (on?"#3565C8":"#D8D0C0") + ";background:" + (on?"#3565C8":"#fff") + ";color:" + (on?"#fff":"#5A6455") + ";border-radius:14px;padding:5px 12px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer";
    chip.addEventListener("click", function(){
      if (on) _sheetTags = _sheetTags.filter(function(t){ return t.toLowerCase() !== tag.toLowerCase(); });
      else _sheetTags.push(tag);
      renderItemSheetTags();
    });
    box.appendChild(chip);
  });
}

// ── Predictive replenishment suggestions (v306) — grocery only ─────────────
// Reads the v303 add-date history. Two tiers: interval-based when an item has
// ≥3 recorded add-dates (median gap → due when overdue-ish), else a frequency
// fallback (bought ≥3 times, not added in 10+ days) so there's value before
// the date series fills in. NEVER auto-adds — tap to add, × to snooze 14 days.
// Snooze map is device-local + transient (NOT exported/synced).
var SUGG_SNOOZE_KEY = "fl4_sugg_snooze";
function suggSnoozeMap(){ var m = storeGet(SUGG_SNOOZE_KEY); return (m && typeof m==="object") ? m : {}; }
function suggSnooze(name){ var m = suggSnoozeMap(); m[String(name).toLowerCase()] = Date.now() + 14*24*3600*1000; storeSet(SUGG_SNOOZE_KEY, m); }
function medianGapDays(dates){
  if (!Array.isArray(dates) || dates.length < 2) return null;
  var gaps = [];
  for (var i=1;i<dates.length;i++){
    var a = new Date(dates[i-1]).getTime(), b = new Date(dates[i]).getTime();
    if (!isNaN(a) && !isNaN(b) && b>a) gaps.push((b-a)/86400000);
  }
  if (!gaps.length) return null;
  gaps.sort(function(x,y){ return x-y; });
  var mid = Math.floor(gaps.length/2);
  return gaps.length%2 ? gaps[mid] : (gaps[mid-1]+gaps[mid])/2;
}
function buildGrocerySuggestions(max){
  loadListData("grocery");
  var d = listData.grocery || {items:[],hist:[]};
  var onList = {}, doneTs = {};
  (d.items||[]).forEach(function(it){
    if (!it) return;
    var k = it.name.toLowerCase();
    if (!it.done) onList[k] = true;
    // v342: a ticked-off item counts as "just bought" — its `updated` stamp
    // (set by toggleItem) resets the suggestion clock below, so a chip can't
    // reappear the moment its item is marked done. Approximate (any edit to a
    // done item refreshes the stamp) but errs toward suggesting less, never more.
    else if (it.updated && (!doneTs[k] || it.updated > doneTs[k])) doneTs[k] = it.updated;
  });
  var snooze = suggSnoozeMap(), now = Date.now(), out = [];
  (d.hist||[]).forEach(function(h){
    if (!h || !h.name) return;
    var key = h.name.toLowerCase();
    if (onList[key]) return;                       // already on the list
    if (snooze[key] && snooze[key] > now) return;  // snoozed
    var lastAdd = h.lastUsed || (h.dates && h.dates.length ? new Date(h.dates[h.dates.length-1]).getTime() : 0);
    if (doneTs[key] && doneTs[key] > lastAdd) lastAdd = doneTs[key]; // bought + ticked off = the freshest signal
    var daysSince = lastAdd ? (now - lastAdd)/86400000 : 999;
    var gap = medianGapDays(h.dates);
    if (gap != null && (h.dates||[]).length >= 3) {
      if (daysSince >= gap*0.9) out.push({ name:h.name, catId:h.catId, reason:"usually ~"+Math.round(gap)+"d", score: 100 + daysSince/gap });
    } else if ((h.count||0) >= 3 && daysSince >= 10) {
      out.push({ name:h.name, catId:h.catId, reason:"often bought", score: (h.count||0)/10 + daysSince/100 });
    }
  });
  out.sort(function(a,b){ return b.score - a.score; });
  return out.slice(0, max||4);
}
function buildSuggestionsStrip(){
  var sugg = buildGrocerySuggestions(4);
  if (!sugg.length) return "";
  var chips = sugg.map(function(s){
    var cat = esc(s.catId||"other"), nm = esc(s.name);
    // Two large, clearly-separated tap targets (v307): the whole left block
    // adds; the divider-split × on the right dismisses. Each ~40px so they
    // can't be mis-tapped for each other.
    return "<span class='sugg-chip' style='display:inline-flex;align-items:stretch;background:#F3EFE6;border:1px solid #E4DCC8;border-radius:16px;margin:0 8px 8px 0;font-size:13px;overflow:hidden'>" +
      "<span class='sugg-add' data-name='"+nm+"' data-cat='"+cat+"' aria-label='Add "+nm+"' style='display:inline-flex;align-items:center;gap:7px;padding:13px 12px 13px 14px;cursor:pointer;touch-action:manipulation'>" +
        "<span style='color:#2D6B35;font-weight:800;font-size:18px;line-height:1'>+</span>" +
        "<span style='font-weight:600;color:#4A3A20'>"+nm+"</span>" +
        "<span style='font-size:11px;color:#9A8A6A'>"+esc(s.reason)+"</span>" +
      "</span>" +
      "<span class='sugg-x' data-name='"+nm+"' aria-label='Dismiss "+nm+"' style='display:inline-flex;align-items:center;padding:13px 14px;border-left:1px solid #E4DCC8;color:#B0705E;font-weight:700;font-size:16px;line-height:1;cursor:pointer;touch-action:manipulation'>&times;</span>" +
    "</span>";
  }).join("");
  return "<div style='padding:2px 2px 4px'><div style='font-size:11px;font-weight:700;color:#9A8A6A;text-transform:uppercase;letter-spacing:.5px;margin:2px 2px 7px'>&#x1F52E; Suggested</div>" + chips + "</div>";
}
// Wire the suggestion chips after renderList sets innerHTML (called from both
// the empty-list and populated paths, so suggestions work on an empty list too).
function wireSuggestionChips(){
  elListC.querySelectorAll(".sugg-add").forEach(function(el){
    el.addEventListener("click", function(){
      var nm = el.dataset.name; if (!nm) return;
      var res = addItemToCurrent(nm, el.dataset.cat || detectCat(nm), null, null);
      saveCurrentList(); renderList(); switchTab("list");
      toast(res === "exists" ? "Already in your list" : ("Added: " + nm));
    });
  });
  elListC.querySelectorAll(".sugg-x").forEach(function(el){
    el.addEventListener("click", function(){ if (el.dataset.name){ suggSnooze(el.dataset.name); renderList(); } });
  });
}

function renderList() {
  // Notes sub-tab (v318): no LIST_CONFIG entry, so the list renderer must not
  // touch it — sync callbacks call renderList() regardless of the active tab.
  if (currentList === "notes") return;
  var items = getItems();
  // Apply active search filter (fuzzy) — matches active and done items
  if (_listSearchQuery) {
    items = items.filter(function(it){ return it && fuzzyMatch(_listSearchQuery, it.name + " " + (it.notes||"")); });
  }
  // Apply travel tag filter (show items carrying any active tag; "__untagged__" matches items with no tags)
  if (currentList === "travel" && _travelFilter.length) {
    var _wantUntagged = _travelFilter.indexOf("__untagged__") !== -1;
    var _wantTags = _travelFilter.filter(function(f){ return f !== "__untagged__"; });
    items = items.filter(function(it){
      if (!it) return false;
      var hasTags = Array.isArray(it.tags) && it.tags.length;
      if (_wantUntagged && !hasTags) return true;
      if (hasTags && _wantTags.length && it.tags.some(function(t){ return _wantTags.some(function(f){ return f.toLowerCase() === t.toLowerCase(); }); })) return true;
      return false;
    });
  }
  // General "Today" filter: show only starred items. Auto-disengage if nothing is starred
  // (prevents being stranded in an empty filtered view with no chip to toggle off).
  if (currentList === "todo") {
    if (_todayFilter && !getItems().some(function(it){ return it && it.today; })) _todayFilter = false;
    if (_todayFilter) items = items.filter(function(it){ return it && it.today; });
  }
  // "Recent" filter (v325, all lists): show only items added in the last 48h.
  // Auto-disengage if nothing qualifies (same safety net as the Today filter).
  if (_recentFilter && !getItems().some(isRecentItem)) _recentFilter = false;
  if (_recentFilter) items = items.filter(isRecentItem);
  var lt = LIST_TYPES[currentList];
  var active=[], done=[];
  for (var i=0;i<items.length;i++){ (items[i].done?done:active).push(items[i]); }
  // Find names that appear more than once across ALL items (active + done)
  var _nameCounts = {}, _dupNames = {};
  items.forEach(function(it){
    if (!it) return;
    var k = (it.name||"").trim().toLowerCase();
    _nameCounts[k] = (_nameCounts[k]||0) + 1;
  });
  Object.keys(_nameCounts).forEach(function(k){ if (_nameCounts[k] > 1) _dupNames[k] = true; });
  window._dupNames = _dupNames;
  if (currentSection === "lists" && active.length) { elHdrBadge.textContent=active.length+" item"+(active.length!==1?"s":""); elHdrBadge.style.display="block"; }
  else { elHdrBadge.style.display="none"; }
  elListBadge.textContent = active.length||"";
  // v323: grocery keeps its done list as a consistent record — no bulk clear
  // there (per-item &#10005; delete still works); other lists unchanged.
  elClearBtn.style.display  = (done.length && currentList !== "grocery") ? "block" : "none";
  elReopenBtn.style.display = done.length ? "block" : "none";
  if (currentList === "travel") {
    elClearBtn.innerHTML  = "&#x2715; Clear packed";
    elReopenBtn.innerHTML = "&#x21BA; Unpack all";
  } else {
    elClearBtn.innerHTML  = "&#x2715; Clear completed";
    elReopenBtn.innerHTML = "&#x21BA; Reopen all";
  }
  // Suggestions strip (v306) — grocery only, not while searching. Computed
  // here so it also shows above the empty-list state (when it's most useful).
  var suggHtml = (currentList === "grocery" && !_listSearchQuery) ? buildSuggestionsStrip() : "";
  if (!items.length) {
    var _listEmptyTitle = lt.emptyTitle;
    var _listEmptySub = lt.emptySub;
    var _listHasFilter = false;
    if (_listSearchQuery) {
      _listEmptyTitle = "No matches for &quot;" + esc(_listSearchQuery) + "&quot;";
      _listEmptySub = "Try a different search, or use Clear to see everything again.";
      _listHasFilter = true;
    } else if (currentList === "travel" && _travelFilter.length) {
      _listEmptyTitle = "No items match these tags";
      _listEmptySub = "Selected: " + esc(_travelFilter.join(", ")) + ". Clear the filter to see every travel item.";
      _listHasFilter = true;
    } else if (currentList === "todo" && _todayFilter) {
      _listEmptyTitle = "No tasks marked for Today";
      _listEmptySub = "Star a task for Today, or clear the filter to see every task.";
      _listHasFilter = true;
    } else if (_recentFilter) {
      _listEmptyTitle = "No recently added items";
      _listEmptySub = "Clear the Recent filter to see the full list.";
      _listHasFilter = true;
    }
    var _listClearHtml = _listHasFilter
      ? "<button id='listEmptyClearBtn' style='margin-top:12px;padding:9px 14px;border:1.5px solid #D8D0C0;border-radius:9px;background:#fff;color:#5A6455;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>Clear filters</button>"
      : "";
    elListC.innerHTML = suggHtml + "<div class='empty'><div class='empty-ico'>"+lt.emptyIco+"</div><div class='empty-title'>"+_listEmptyTitle+"</div><div class='empty-sub'>"+_listEmptySub+"</div>"+_listClearHtml+"</div>";
    var _listEmptyClear = document.getElementById("listEmptyClearBtn");
    if (_listEmptyClear) _listEmptyClear.addEventListener("click", function(){
      // v469: the search box is a filter too — clearing only the three chip
      // filters left a search-driven empty state looking identical after the tap.
      _listSearchQuery = "";
      var _emptySearchInput = document.getElementById("listSearchInput");
      if (_emptySearchInput) _emptySearchInput.value = "";
      _travelFilter = []; _todayFilter = false; _recentFilter = false; renderList();
    });
    wireSuggestionChips();
    return;
  }
  var groups={};
  for (var i=0;i<active.length;i++) { var cid=active[i].catId||"other"; if (!groups[cid]) groups[cid]=[]; groups[cid].push(active[i]); }
  var html="", cats=getCats();
  // Travel tag filter bar
  if (currentList === "travel") {
    var allTags = getTravelTags().slice();
    // Include any tags present on items but not in the pool
    getItems().forEach(function(it){ if (it && Array.isArray(it.tags)) it.tags.forEach(function(t){ if (!allTags.some(function(p){return p.toLowerCase()===t.toLowerCase();})) allTags.push(t); }); });
    if (allTags.length) {
      html += "<div style='display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px'>";
      html += "<span style='font-size:11px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px'>&#x1F3F7; Filter:</span>";
      allTags.forEach(function(tag){
        var on = _travelFilter.some(function(f){ return f.toLowerCase() === tag.toLowerCase(); });
        html += "<button class='travel-filter-chip' data-tag='" + esc(tag).replace(/'/g,"&#39;") + "' style='border:1.5px solid " + (on?"#3565C8":"#D8D0C0") + ";background:" + (on?"#3565C8":"#fff") + ";color:" + (on?"#fff":"#5A6455") + ";border-radius:13px;padding:4px 11px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer'>" + esc(tag) + "</button>";
      });
      // Untagged option
      var _unOn = _travelFilter.indexOf("__untagged__") !== -1;
      html += "<button class='travel-filter-chip' data-tag='__untagged__' style='border:1.5px dashed " + (_unOn?"#3565C8":"#C0B8A8") + ";background:" + (_unOn?"#3565C8":"#fff") + ";color:" + (_unOn?"#fff":"#7A6A50") + ";border-radius:13px;padding:4px 11px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer'>Untagged</button>";
      if (_travelFilter.length) html += "<button id='travelFilterClear' style='border:none;background:none;color:#A0855A;font-size:12px;font-weight:700;cursor:pointer;padding:4px'>Clear</button>";
      html += "</div>";
    }
  }
  // General "Today" filter chip — only shown when at least one item is starred
  if (currentList === "todo") {
    var _todayCount = getItems().filter(function(it){ return it && it.today; }).length;
    if (_todayCount) {
      var _tOn = _todayFilter;
      html += "<div style='display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px'>";
      html += "<button id='todayFilterChip' style='border:1.5px solid " + (_tOn?"#C2691A":"#D8D0C0") + ";background:" + (_tOn?"#C2691A":"#fff") + ";color:" + (_tOn?"#fff":"#5A6455") + ";border-radius:13px;padding:4px 12px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer'>&#x2605; Today (" + _todayCount + ")</button>";
      html += "</div>";
    }
  }
  // "Recent" filter chip (v325, all lists) — self-suppressing: only shown when
  // something was added in the last 48h. Count includes done items (an item
  // added yesterday and already ticked is still "recently added").
  var _recentCount = getItems().filter(function(it){ return it && isRecentItem(it); }).length;
  if (_recentCount) {
    var _rOn = _recentFilter;
    html += "<div style='display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px'>";
    html += "<button id='recentFilterChip' style='border:1.5px solid " + (_rOn?"#2D6B8A":"#D8D0C0") + ";background:" + (_rOn?"#2D6B8A":"#fff") + ";color:" + (_rOn?"#fff":"#5A6455") + ";border-radius:13px;padding:4px 12px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer'>&#x1F552; Recent (" + _recentCount + ")</button>";
    html += "</div>";
  }
  // Recipe-tag banner: if any active items carry a recipe tag, offer one-tap clear
  var _recipeTags = {};
  active.forEach(function(it){ if (it && it.recipe) _recipeTags[it.recipe] = (_recipeTags[it.recipe]||0)+1; });
  var _rtKeys = Object.keys(_recipeTags);
  if (_rtKeys.length) {
    _rtKeys.forEach(function(tag){
      html += "<div class='recipe-banner' data-recipe='" + esc(tag).replace(/'/g,"&#39;") + "' style='display:flex;align-items:center;gap:8px;background:#F0E8FA;border:1px solid #D8C8F0;border-radius:10px;padding:8px 12px;margin-bottom:8px'>" +
        "<span style='flex:1;font-size:13px;color:#6A3CB0;font-weight:600'>&#x1F37D; " + esc(tag) + " &middot; " + _recipeTags[tag] + " item" + (_recipeTags[tag]!==1?"s":"") + "</span>" +
        "<button class='recipe-clear-btn' data-recipe='" + esc(tag).replace(/'/g,"&#39;") + "' style='border:none;background:#6A3CB0;color:#fff;border-radius:7px;padding:6px 12px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer'>Clear all</button>" +
        "</div>";
    });
  }
  for (var ci=0;ci<cats.length;ci++) {
    var c=cats[ci], gi=groups[c.id]; if (!gi) continue;
    var catKey = "fl4_catOpen_"+currentList+"_"+c.id;
    var catStored = storeGet(catKey);
    var catOpen = (catStored === null) ? true : !!catStored; // default open
    if (_listSearchQuery) catOpen = true; // always expand while searching
    html+="<div class='sec-hdr cat-toggle' data-catkey='"+esc(catKey)+"' style='cursor:pointer'>" +
      "<span class='done-toggle-arrow"+(catOpen?"":" collapsed")+"' style='margin-right:4px'>&#9660;</span>" +
      "<span>"+catEmojiSafe(c.emoji)+"&ensp;<span class='sec-name'>"+esc(c.name)+"</span></span>" +
      "<div class='sec-line'></div><span class='sec-count'>"+gi.length+"</span></div>";
    html+="<div class='cat-items' style='display:"+(catOpen?"block":"none")+"'>";
    for (var ii=0;ii<gi.length;ii++) html+=cardHTML(gi[ii],c,true);
    html+="</div>";
  }
  if (done.length) {
    var doneOpen = storeGet("fl4_doneOpen_"+currentList);
    var isOpen = (doneOpen === null) ? true : !!doneOpen; // default open
    html+="<div class='done-toggle' id='doneToggle'>" +
      "<span class='done-toggle-arrow"+(isOpen?"":" collapsed")+"' id='doneArrow'>&#9660;</span>" +
      "<span class='sec-name' style='color:#7A8772'>&#10003; "+(currentList==="travel"?"Packed":"Done")+"</span>" +
      "<div class='sec-line'></div>" +
      "<span class='sec-count'>"+done.length+"</span>" +
      "</div>";
    html+="<div class='done-items' id='doneItems' style='display:"+(isOpen?"block":"none")+"'>";
    for (var di=0;di<done.length;di++) html+=cardHTML(done[di],getCat(done[di].catId||"other"));
    html+="</div>";
  }
  elListC.innerHTML = suggHtml + html;
  wireSuggestionChips();
  // Wire done section toggle
  var doneToggleEl = elListC.querySelector("#doneToggle");
  if (doneToggleEl) {
    doneToggleEl.addEventListener("click", function() {
      var arrow = document.getElementById("doneArrow");
      var items = document.getElementById("doneItems");
      var isOpen = items.style.display !== "none";
      items.style.display = isOpen ? "none" : "block";
      arrow.classList.toggle("collapsed", isOpen);
      storeSet("fl4_doneOpen_"+currentList, !isOpen);
    });
  }
  // Wire category section toggles
  elListC.querySelectorAll(".cat-toggle").forEach(function(hdr) {
    hdr.addEventListener("click", function() {
      var arrow = hdr.querySelector(".done-toggle-arrow");
      var itemsDiv = hdr.nextElementSibling;
      if (!itemsDiv) return;
      var open = itemsDiv.style.display !== "none";
      itemsDiv.style.display = open ? "none" : "block";
      if (arrow) arrow.classList.toggle("collapsed", open);
      storeSet(hdr.dataset.catkey, !open);
      updateCollapseAllLabel();
    });
  });
  updateCollapseAllLabel();
  // Travel tag filter chips
  elListC.querySelectorAll(".travel-filter-chip").forEach(function(chip){
    chip.addEventListener("click", function(){
      var tag = chip.dataset.tag;
      if (_travelFilter.some(function(f){ return f.toLowerCase() === tag.toLowerCase(); })) {
        _travelFilter = _travelFilter.filter(function(f){ return f.toLowerCase() !== tag.toLowerCase(); });
      } else {
        _travelFilter.push(tag);
      }
      renderList();
    });
  });
  var _tfClear = document.getElementById("travelFilterClear");
  if (_tfClear) _tfClear.addEventListener("click", function(){ _travelFilter = []; renderList(); });
  var _todayChip = document.getElementById("todayFilterChip");
  if (_todayChip) _todayChip.addEventListener("click", function(){ _todayFilter = !_todayFilter; renderList(); });
  var _recentChip = document.getElementById("recentFilterChip");
  if (_recentChip) _recentChip.addEventListener("click", function(){ _recentFilter = !_recentFilter; renderList(); });
  elListC.querySelectorAll(".recipe-clear-btn").forEach(function(btn){
    btn.addEventListener("click", function(e){
      e.stopPropagation();
      var tag = btn.dataset.recipe;
      var count = getItems().filter(function(it){ return it && it.recipe === tag; }).length;
      var addedCount = getItems().filter(function(it){ return it && it.recipe === tag && it._recipeAdded; }).length;

      function doClear(deleteAdded) {
        var kept = [];
        getItems().forEach(function(it){
          if (!it || it.recipe !== tag) { kept.push(it); return; }
          if (it._recipeAdded) {
            if (deleteAdded) { addTomb(currentList, it.id); return; } // remove entirely
            // Keep: just drop the recipe markers, leave as a normal active item.
            // The amount note stays — the item is still to be bought, and the
            // amount is the only place that detail survives (v363).
            it.recipe = null; it.updated = Date.now(); delete it._recipePrev; delete it._recipeAdded; delete it._recipeNote;
            kept.push(it); return;
          }
          // Pre-existed → restore prior state, drop the tag
          var prev = it._recipePrev;
          if (prev) {
            it.done = prev.done; it.catId = prev.catId; it.recipe = prev.recipe || null;
            // v363: the recipe appended an amount line to the note — put the
            // note back exactly as it was. Older snapshots have no `notes` key,
            // so fall back to stripping just this recipe's own line.
            it.notes = (typeof prev.notes === "string") ? prev.notes : stripRecipeNote(it.notes, tag, it._recipeNote);
            // v364: an empty Amount field the recipe filled in is emptied
            // again. Older snapshots have no `amount` key — leave those alone.
            if (typeof prev.amount === "string") it.amount = prev.amount || null;
          }
          else { it.recipe = null; if (it.notes) it.notes = stripRecipeNote(it.notes, tag, it._recipeNote); }
          it.updated = Date.now();
          delete it._recipePrev; delete it._recipeAdded; delete it._recipeNote;
          kept.push(it);
        });
        listData[currentList].items = kept;
        saveCurrentList(); renderList();
        toast("Cleared " + tag + " recipe");
      }

      // Three-way choice: delete the added items, keep them, or cancel
      var ov = document.createElement("div");
      ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:900;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box";
      ov.setAttribute("role","alertdialog"); ov.setAttribute("aria-modal","true");
      var box = document.createElement("div");
      box.style.cssText = "background:#fff;border-radius:14px;padding:20px;width:100%;max-width:330px;box-shadow:0 8px 32px rgba(0,0,0,.2)";
      var msg = "Clear the <b>" + esc(tag) + "</b> recipe?<br><span style='font-size:13px;color:#8A7A5A'>" +
        "Items it tagged that were already on your list will revert to how they were. " +
        (addedCount ? ("The " + addedCount + " item" + (addedCount!==1?"s":"") + " it added new — keep or delete?") : "Nothing new was added.") + "</span>";
      box.innerHTML = "<div style='font-size:15px;color:#2A2010;line-height:1.5;margin-bottom:16px'>" + msg + "</div>" +
        "<div style='display:flex;flex-direction:column;gap:8px'>" +
          (addedCount ? "<button id='_rcDel' style='padding:11px;border:none;background:#C03030;color:#fff;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Delete added items</button>" +
                        "<button id='_rcKeep' style='padding:11px;border:1.5px solid #2D6B35;background:#fff;color:#2D6B35;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Keep added items</button>"
                      : "<button id='_rcDel' style='padding:11px;border:none;background:#2D6B35;color:#fff;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Clear recipe</button>") +
          "<button id='_rcCancel' data-bbclose style='padding:11px;border:1.5px solid #E0D0B0;background:none;border-radius:9px;font-family:inherit;font-size:14px;cursor:pointer'>Cancel</button>" +
        "</div>";
      ov.appendChild(box); document.body.appendChild(ov);
      var close = function(){ document.body.removeChild(ov); };
      document.getElementById("_rcDel").addEventListener("click", function(){ close(); doClear(true); });
      var keepBtn = document.getElementById("_rcKeep");
      if (keepBtn) keepBtn.addEventListener("click", function(){ close(); doClear(false); });
      document.getElementById("_rcCancel").addEventListener("click", close);
    });
  });

   elListC.querySelectorAll(".item-card").forEach(function(card) {
    var id = +card.dataset.id;
    card.addEventListener("click", function(e){
      // Zone 1: delete button
      if (e.target.closest(".del-btn")) return;
      // Zone 2: category pill → change category
      if (e.target.closest(".item-pill")) return;
      // Zone 3: circle/chk → toggle done
      if (e.target.closest(".chk")) { toggleItem(id); return; }
      // Zone 3a: per-person check circle (travel opt-in, v326)
      var _ppc = e.target.closest(".ppc");
      if (_ppc) { togglePersonCheck(id, _ppc.dataset.pp); return; }
      // Zone 3b: star → toggle "today" pick (General list only)
      if (e.target.closest(".star-btn")) { toggleToday(id); return; }
      // Zone 4: due chip, cal link, or item link → let them navigate naturally
      if (e.target.closest(".due-chip") || e.target.closest(".cal-link") || e.target.closest(".alarm-link") || e.target.closest(".item-link")) return;
      // Zone 5: detail lists → open notes ONLY when the item body (name/notes) is tapped.
      // The gap between the checkbox and the body is now a neutral buffer, so a near-miss
      // on the checkbox no longer opens the notes sheet by accident. Applies to all lists.
      if (currentList === "todo" || currentList === "personal" || currentList === "grocery" || currentList === "travel") {
        if (e.target.closest(".item-body")) openItemSheet(id);
        return;
      }
      // Default (non-detail lists): toggle done
      toggleItem(id);
    });
    card.querySelector(".del-btn").addEventListener("click", function(e){
      e.stopPropagation();
      var it = getItems().find(function(x){ return x.id===id; });
      confirmDialog("Delete \"" + esc(it ? it.name : "this item") + "\"?", function(){ removeItem(id); });
    });
    card.querySelector(".item-pill").addEventListener("click", function(e){ e.stopPropagation(); openPicker(id); });
  });
}

function dueDateLabel(item) {
  if (!item.dueDate) return "";
  var now   = new Date(); now.setHours(0,0,0,0);
  var due   = new Date(item.dueDate); due.setHours(0,0,0,0);
  var diff  = Math.round((due - now) / 86400000);
  var label, color;
  if (diff < 0)       { label = "Overdue " + Math.abs(diff) + "d"; color = "#ff6b6b"; }
  else if (diff === 0){ label = "Today";    color = "#fbbf24"; }
  else if (diff === 1){ label = "Tomorrow"; color = "#60a5fa"; }
  else if (diff <= 7) { label = "In " + diff + " days"; color = "#a78bfa"; }
  else                { label = listDate(String(item.dueDate)) || due.toLocaleDateString("en-IE",{day:"numeric",month:"short"}); color = "#6b7280"; }
  return "<span class='due-chip' style='background:" + color + "20;color:" + color + ";border:1px solid " + color + "40'>" + label + "</span>";
}

function calLink(item) {
  // dueDate/dueTime go straight into an href, and a synced or restored item
  // never passed the date picker — so anything not shaped like one gets no
  // button (bad date) or the all-day link (bad time), never the raw string.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.dueDate || ""))) return "";
  var title = encodeURIComponent(item.name);
  var date  = item.dueDate.replace(/-/g,"");
  var start, end;
  if (/^\d{1,2}:\d{2}$/.test(String(item.dueTime || ""))) {
    var h = item.dueTime.split(":")[0].padStart(2,"0");
    var m = item.dueTime.split(":")[1].padStart(2,"0");
    start = date + "T" + h + m + "00";
    // end = 30 mins later
    var endMin = parseInt(m) + 30;
    var endH   = parseInt(h) + Math.floor(endMin/60);
    endMin     = endMin % 60;
    end = date + "T" + String(endH).padStart(2,"0") + String(endMin).padStart(2,"0") + "00";
  } else {
    // All-day: end must be next calendar day
    var d = new Date(item.dueDate);
    d.setDate(d.getDate() + 1);
    var y = d.getFullYear(), mo = String(d.getMonth()+1).padStart(2,"0"), dy = String(d.getDate()).padStart(2,"0");
    start = date;
    end   = "" + y + mo + dy;
  }
  var url = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + title + "&dates=" + start + "/" + end;
  return "<a class='cal-link' href='" + esc(url) + "' target='_blank' title='Add to calendar' style='display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:5px;background:#1E3A5E;color:#60a5fa;font-size:11px;font-weight:600;text-decoration:none;vertical-align:middle'>&#x1F4C5;</a>";
}

function alarmLink(item) {
  if (!item.dueTime) return "";
  var h = parseInt(item.dueTime.split(":")[0]);
  var m = parseInt(item.dueTime.split(":")[1]);
  var pad = function(x){ return x < 10 ? "0"+x : ""+x; };
  var label = pad(h) + ":" + pad(m);
  return "<button class='alarm-link' data-alarmh='" + esc(h) + "' data-alarmm='" + esc(m) + "' data-alarmname='" + esc(item.name) + "' title='Set alarm' style='display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;background:#1E2A3E;color:#a78bfa;font-size:12px;font-weight:600;border:none;cursor:pointer;touch-action:manipulation'>&#x23F0; " + label + "</button>";
}

function cardHTML(item, c, grouped) {
  var isTask   = currentList === "todo" || currentList === "personal";
  var isDetail = currentList === "todo" || currentList === "personal" || currentList === "grocery" || currentList === "travel";
  var dueLabel = isTask ? dueDateLabel(item) : "";
  var calBtn   = isTask && item.dueDate ? calLink(item) : "";
  var alarmBtn = "";
  var noteSnip = isDetail && item.notes
    ? "<div style='font-size:11px;color:#8A7A5A;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>&#x1F4DD; " + esc(item.notes.substring(0,40)) + (item.notes.length>40?"…":"") + "</div>"
    : "";
  var itemLink = isDetail ? applianceLinkUrl(item.link, true) : "";
  var linkChip = itemLink
    ? "<a href='" + esc(itemLink) + "' target='_blank' rel='noopener' class='item-link' style='display:inline-flex;align-items:center;gap:3px;font-size:11px;color:#3B6FE0;margin-top:3px;text-decoration:none;font-weight:600'>&#x1F517; Open link</a>"
    : "";
  var recipeChip = item.recipe
    ? "<span style='display:inline-block;font-size:11px;font-weight:700;background:#E6DBF5;color:#6A3CB0;padding:1px 7px;border-radius:8px;margin-left:6px;vertical-align:middle'>&#x1F37D; " + esc(item.recipe) + "</span>"
    : "";
  var tagChips = (Array.isArray(item.tags) && item.tags.length)
    ? item.tags.map(function(t){ return "<span style='display:inline-block;font-size:11px;font-weight:700;background:#DCE6F8;color:#2B4E9B;padding:1px 7px;border-radius:8px;margin-left:6px;vertical-align:middle'>&#x1F3F7; " + esc(t) + "</span>"; }).join("")
    : "";
  // v361: repeating tasks show a small badge so they read differently from one-offs at a glance
  var repChip = (isTask && item.repeat && REPEAT_OPTS[item.repeat])
    ? "<span style='display:inline-block;font-size:11px;font-weight:700;background:#DDEFE4;color:#2E7D5B;padding:1px 7px;border-radius:8px;margin-left:6px;vertical-align:middle'>&#x1F501; " + REPEAT_OPTS[item.repeat] + "</span>"
    : "";
  // Highlight items recently added by the partner and not yet seen
  var unseen = getUnseen(currentList);
  var isNew = !!unseen[item.id];
  var newBadge = isNew
    ? "<span style='display:inline-block;font-size:11px;font-weight:700;background:#FBE9DE;color:#C2691A;padding:1px 7px;border-radius:8px;margin-left:6px;vertical-align:middle'>NEW</span>"
    : "";
  var amtChip = item.amount
    ? "<span style='font-size:12px;font-weight:600;color:#9A7A4A;margin-left:6px;white-space:nowrap'>" + esc(item.amount) + "</span>"
    : "";
  var isDup = window._dupNames && window._dupNames[(item.name||"").trim().toLowerCase()];
  var dupBadge = isDup
    ? "<span style='display:inline-block;font-size:11px;font-weight:700;background:#FCE4C4;color:#A85A10;padding:1px 7px;border-radius:8px;margin-left:6px;vertical-align:middle'>DUPLICATE</span>"
    : "";
  var leftColor = isDup ? "#E8A030" : (isNew ? "#E0703C" : (catColorSafe(c.fg,"#4A4A3A") + "33"));
  var starBtn = (currentList === "todo")
    ? "<button class='star-btn' title='Pick for today' aria-label='" + (item.today?"Unpick for today":"Pick for today") + "' aria-pressed='" + (item.today?"true":"false") + "' style='width:34px;height:40px;flex-shrink:0;border:none;background:none;font-size:18px;line-height:1;cursor:pointer;padding:0;color:" + (item.today?"#E8A030":"#D0C8B8") + "'>" + (item.today?"&#x2605;":"&#x2606;") + "</button>"
    : "";
  // v326: travel items opted into per-person checks show three circles (C / P / baby) instead of the single checkbox
  var isPP = currentList === "travel" && item.checks && typeof item.checks === "object";
  var checkHTML;
  if (isPP) {
    checkHTML = "<div class='ppc-wrap'>" +
      [["c","C","Cathal"],["p","P","Petra"],["b","&#x1F476;","the baby"]].map(function(pp){
        var isOn = !!item.checks[pp[0]];
        return "<div class='ppc" + (isOn?" on":"") + "' data-pp='" + esc(pp[0]) + "' role='button' aria-pressed='" + isOn + "' aria-label='Packed for " + pp[2] + "'>" + pp[1] + "</div>";
      }).join("") + "</div>";
  } else {
    checkHTML = "<div class='chk' style='cursor:pointer'>" + (item.done?"&#10003;":"") + "</div>";
  }
  return "<div class='item-card" + (item.done?" done":"") + (isDup?" is-dup":"") + "' data-id='" + esc(item.id) + "' style='border-left-color:" + leftColor + (isDup?";background:#FFF8EC":"") + "'>" +
    checkHTML +
    "<div class='item-body' style='flex:1;min-width:0;margin-left:5px;" + (isDetail?"cursor:pointer":"") + "'>" +
      "<span class='item-name'>" + esc(item.name) + "</span>" + amtChip + newBadge + dupBadge + recipeChip + tagChips + repChip +
      (dueLabel ? "<div style='margin-top:3px'>" + dueLabel + (calBtn ? "&nbsp;" + calBtn : "") + "</div>" : "") +

      noteSnip + linkChip +
    "</div>" +
    // v487: under a category header the name is already on screen, so the pill
    // shows the emoji only (still the tap-to-change-category control; the name
    // stays in the DOM for screen readers). Done items have no header -> full pill.
    (grouped
      ? "<span class='item-pill item-pill-ico' role='button' aria-label='Category: " + esc(c.name) + " \u2014 tap to change' style='background:" + catColorSafe(c.bg,"#EDEAE4") + ";color:" + catColorSafe(c.fg,"#4A4A3A") + "' title='" + esc(c.name) + " \u2014 tap to change category'>" + catEmojiSafe(c.emoji) + "<span class='sr-only'>" + esc(c.name) + "</span></span>"
      : "<span class='item-pill' style='background:" + catColorSafe(c.bg,"#EDEAE4") + ";color:" + catColorSafe(c.fg,"#4A4A3A") + "' title='Tap to change category'>" + catEmojiSafe(c.emoji) + " " + esc(c.name) + "</span>") +
    starBtn +
    "<button class='del-btn'>&#x2715;</button></div>";
}

// v361: recurring tasks. Valid repeat values for General/Personal items and their row-chip labels.
var REPEAT_OPTS = { daily:"Daily", weekly:"Weekly", biweekly:"Every 2 wks", monthly:"Monthly" };
// Next due date strictly after BOTH `today` and the current due date (all "YYYY-MM-DD"),
// schedule-anchored: steps from the existing due date by the interval, so an overdue weekly
// Monday task ticked on Wednesday is due next Monday and a long-ignored task needs ONE tick,
// not one per missed period — while ticking EARLY (due date still in the future) rolls to the
// occurrence after it, never returning the unchanged date (that no-op was the pre-merge PR #126
// bug Cathal caught). No due date → anchors from today (UI now requires one, this is a fallback).
// Pure string-in/string-out (UTC internally, no local-midnight/DST maths); monthly clamps to
// month end from the base's own day (31st → 28 Feb) without permanently losing the anchor day.
// Returns null for an unknown repeat value.
function nextRepeatDue(repeat, fromDate, today) {
  if (!REPEAT_OPTS[repeat] || !/^\d{4}-\d{2}-\d{2}$/.test(today || "")) return null;
  var base = /^\d{4}-\d{2}-\d{2}$/.test(fromDate || "") ? fromDate : today;
  var p = base.split("-"), by = +p[0], bm = +p[1], bd = +p[2];
  var pad = function(x){ return x < 10 ? "0"+x : ""+x; };
  var next = base, k = 0;
  do { // do-while: always at least one step past the base date. ISO strings compare chronologically; guard caps a ~13y-overdue daily task
    k++;
    if (repeat === "monthly") {
      var mo = bm - 1 + k, y = by + Math.floor(mo / 12); mo = mo % 12;
      var lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      next = y + "-" + pad(mo + 1) + "-" + pad(Math.min(bd, lastDay));
    } else {
      var days = repeat === "daily" ? 1 : repeat === "weekly" ? 7 : 14;
      var d = new Date(Date.UTC(by, bm - 1, bd + days * k));
      next = d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
    }
  } while (next <= today && k < 5000);
  return next;
}
function toggleItem(id) {
  var items=getItems();
  for (var i=0;i<items.length;i++) { if (items[i].id===id) {
    // v406: unticking in the Done section revives the item — feed history like a
    // typed re-add. Both reads happen before `updated` is re-stamped below.
    var _wasRevived = !!items[i].done, _reviveMisclick = _wasRevived && reviveWasMisclick(items[i]);
    items[i].done=!items[i].done; if (items[i].done) items[i].today=false; items[i].updated=Date.now();
    // v357: opt-in Track auto-logging — append only on the user's own done-tick, never from merge/render paths
    if (items[i].done && items[i].trackLog) {
      var _tlEntries = getActionLog();
      _tlEntries.unshift({ id: Date.now(), text: "✓ " + items[i].name, ts: Date.now() });
      saveActionLog(_tlEntries);
    }
    // v361: a repeating task never rests in "done" — the tick logs (above), then the same item
    // reschedules in place: done back to false, due date advanced. Same id, so a normal delete/
    // tombstone still kills it for good. Mutation lives ONLY here (user-tap call sites: checkbox
    // tap + default-list tap), never in merge/apply/render — sync echoes can't re-fire it.
    if (items[i].done && items[i].repeat) {
      var _nd = nextRepeatDue(items[i].repeat, items[i].dueDate, todayStr());
      if (_nd) {
        items[i].done = false;
        items[i].dueDate = _nd;
        var _ndD = new Date(_nd + "T12:00:00");
        toast("Done ✓ — next due " + _ndD.toLocaleDateString("en-IE", { weekday:"short", day:"numeric", month:"short" }));
      }
    }
    // v406: runs last so a repeating task's reschedule above (done→false on a
    // TICK, not a revive) can't be mistaken for one — _wasRevived was read first.
    if (_wasRevived && !_reviveMisclick) addToHist(items[i].name, items[i].catId);
    break; } }
  saveCurrentList(); renderList();
}
function toggleToday(id) {
  var items=getItems();
  for (var i=0;i<items.length;i++) { if (items[i].id===id) { items[i].today=!items[i].today; items[i].updated=Date.now(); break; } }
  saveCurrentList(); renderList();
}
// v326: flip one person's packing check; item auto-packs when all three are ticked
// (and comes back when any is unticked). p = "c" | "p" | "b".
function togglePersonCheck(id, p) {
  if (p !== "c" && p !== "p" && p !== "b") return;
  var items = getItems();
  for (var i=0;i<items.length;i++) {
    if (items[i].id === id) {
      var it = items[i];
      if (!it.checks || typeof it.checks !== "object") it.checks = emptyPersonChecks();
      it.checks[p] = !it.checks[p];
      it.done = !!(it.checks.c && it.checks.p && it.checks.b);
      if (it.done) it.today = false;
      it.updated = Date.now();
      break;
    }
  }
  saveCurrentList(); renderList();
}
// v333: "opted in, nothing ticked" must be {c:false,p:false,b:false}, never {} —
// Firebase strips empty objects, so a pushed `checks:{}` comes back off the SSE
// echo as a missing field with the SAME `updated` stamp, wins the merge tie, and
// reverts the item to a single checkbox (~1s after toggling per-person checks on).
function emptyPersonChecks() { return {c:false, p:false, b:false}; }
// v326: when something other than the circles forces an item back to not-done
// (revive on re-add, reopen-all, quick-pick), stale ticks must clear with it.
function clearPersonChecks(it) { if (it && it.checks) it.checks = emptyPersonChecks(); }
function updateCollapseAllLabel() {
  var link = document.getElementById("collapseAllLink");
  if (!link) return;
  var cats = getCats();
  var anyOpen = cats.some(function(c){
    var st = storeGet("fl4_catOpen_"+currentList+"_"+c.id);
    return (st === null) ? true : !!st;
  });
  link.innerHTML = anyOpen ? "&#9650;&#9660; Collapse all" : "&#9650;&#9660; Expand all";
}

function removeItem(id) {
  addTomb(currentList, id);
  listData[currentList].items = getItems().filter(function(x){ return x.id!==id; });
  saveCurrentList(); renderList();
}
// v332: both bulk actions hit every done item at once and can't be undone —
// confirm before running, same pattern as the app's other confirmDialog() uses.
elClearBtn.addEventListener("click", function(){
  var n = getItems().filter(function(x){ return x && x.done; }).length;
  var word = currentList === "travel" ? "packed" : "completed";
  confirmDialog("Clear " + n + " " + word + " item" + (n!==1?"s":"") + "? This can't be undone.", function(){
    getItems().forEach(function(x){ if (x && x.done) addTomb(currentList, x.id); });
    listData[currentList].items = getItems().filter(function(x){ return !x.done; });
    saveCurrentList(); renderList(); toast("Cleared " + word + " items");
  });
});

elReopenBtn.addEventListener("click", function(){
  var n = getItems().filter(function(x){ return x && x.done; }).length;
  var verb = currentList === "travel" ? "Unpack" : "Reopen";
  confirmDialog(verb + " all " + n + " item" + (n!==1?"s":"") + "?", function(){
    listData[currentList].items = getItems().map(function(x){ return x.done ? Object.assign({}, x, {done:false, updated: Date.now()}, (x.checks ? {checks:emptyPersonChecks()} : null)) : x; });
    saveCurrentList(); renderList(); toast("&#x21BA; All items reopened");
  });
});

