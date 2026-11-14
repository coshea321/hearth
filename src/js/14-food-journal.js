// ============================================================
// FOOD JOURNAL
// ============================================================

// ── Calorie estimator — ~400 common foods ────────────────
var FOOD_CAL = (function(){
  var d = {
    // Grains & carbs
    "rice":250,"white rice":250,"brown rice":215,"fried rice":330,
    "pasta":200,"spaghetti":220,"penne":200,"noodles":210,"ramen":380,
    "bread":80,"toast":85,"white bread":80,"brown bread":75,"sourdough":90,"baguette":130,
    "roll":130,"bagel":270,"croissant":230,"wrap":180,"pitta":165,"tortilla":160,
    "oats":160,"porridge":130,"granola":210,"muesli":190,"cereal":150,"cornflakes":110,
    "potato":90,"boiled potato":90,"mashed potato":120,"roast potato":150,"chips":300,"crisps":520,
    "sweet potato":90,"fries":320,"wedges":200,"couscous":175,"quinoa":185,
    // Proteins
    "chicken":165,"chicken breast":165,"chicken thigh":210,"fried chicken":280,"roast chicken":190,
    "beef":250,"steak":270,"mince":230,"burger":300,"meatballs":220,
    "pork":240,"bacon":540,"sausage":280,"ham":145,"salami":350,
    "lamb":250,"lamb chop":280,"lamb stew":210,
    "salmon":200,"tuna":130,"cod":80,"haddock":90,"fish":100,"fish and chips":600,
    "prawn":90,"shrimp":90,"crab":85,"lobster":95,"mussels":70,
    "eggs":140,"egg":70,"scrambled eggs":160,"fried egg":90,"boiled egg":70,"omelette":200,
    "tofu":80,"tempeh":160,"lentils":115,"chickpeas":165,"beans":140,
    "black beans":130,"kidney beans":140,"edamame":120,
    // Dairy
    "milk":60,"full fat milk":60,"skimmed milk":35,"semi skimmed milk":48,
    "cheese":400,"cheddar":400,"brie":330,"feta":260,"mozzarella":280,
    "yogurt":60,"greek yogurt":90,"cream":200,"butter":720,"cream cheese":340,
    "ice cream":200,"gelato":180,
    // Fruit
    "apple":80,"banana":90,"orange":60,"grape":70,"strawberry":32,"strawberries":32,
    "blueberries":55,"raspberries":50,"mango":65,"pineapple":55,"melon":30,
    "watermelon":30,"peach":40,"pear":55,"kiwi":50,"avocado":160,
    "cherry":50,"cherries":50,"plum":40,"lemon":30,"lime":20,
    // Vegetables
    "salad":20,"lettuce":5,"tomato":20,"cucumber":15,"carrot":35,"broccoli":35,
    "spinach":23,"peas":80,"corn":90,"mushroom":20,"onion":40,"garlic":5,
    "pepper":30,"courgette":17,"aubergine":25,"cauliflower":25,"cabbage":25,
    "kale":35,"celery":6,"asparagus":20,"green beans":25,"leek":30,
    // Snacks & treats
    "chocolate":530,"dark chocolate":550,"milk chocolate":520,
    "biscuit":70,"digestive":70,"cookie":70,"cake":380,"muffin":370,
    "donut":280,"brownie":340,"waffle":300,"pancake":200,
    "crisps":520,"popcorn":450,"nuts":600,"peanuts":570,"almonds":580,
    "cashews":560,"peanut butter":590,"hummus":170,"dip":120,
    // Fast food
    "pizza":270,"margherita pizza":250,"pepperoni pizza":290,
    "kebab":700,"doner kebab":700,"sandwich":300,"sub":350,"panini":350,
    "hot dog":290,"nuggets":250,"chicken nuggets":250,
    // Drinks (per 300ml unless noted)
    "coffee":5,"americano":5,"latte":120,"cappuccino":90,"flat white":100,
    "tea":5,"green tea":2,"hot chocolate":200,
    "orange juice":110,"apple juice":120,"smoothie":150,
    "beer":140,"wine":180,"prosecco":120,"gin":100,"vodka":100,"coke":120,
    "diet coke":1,"water":0,"sparkling water":0,
    // Ready meals / common dishes
    "soup":100,"tomato soup":90,"chicken soup":80,"lentil soup":130,
    "curry":300,"chicken curry":300,"beef curry":380,"korma":400,"tikka masala":400,
    "stir fry":200,"noodle stir fry":280,"pad thai":450,"sushi":180,"sashimi":120,
    "burrito":520,"taco":200,"nachos":480,"quesadilla":400,
    "lasagne":350,"bolognese":400,"carbonara":450,"risotto":350,
    "fish finger":55,"fish fingers":165,
    // Breakfast specific
    "full irish":850,"full english":850,"fry up":850,
    "cereal bar":100,"protein bar":200,"crumpet":90,
  };
  return d;
})();

var MEAL_TYPES = [
  { label:"Breakfast", icon:"&#x1F31E;" },
  { label:"Lunch",     icon:"&#x1F33F;" },
  { label:"Dinner",    icon:"&#x1F319;" },
  { label:"Snack",     icon:"&#x1F370;" }
];
// The meal the add form logs to, mirrored by #foodMealSelect. Its value is
// re-derived per day by foodDefaultMeal() below; foodMealPicked records that
// the user chose one by hand, which wins until the date nav moves.
var currentFoodMeal = 0;
var foodMealPicked  = false;
var foodDate = (function(){
  var d = new Date();
  return d.getFullYear()+"-"+(d.getMonth()<9?"0":"")+(d.getMonth()+1)+"-"+(d.getDate()<10?"0":"")+d.getDate();
})();

// A food entry's `meal` is an INDEX into MEAL_TYPES. renderFoodView groups the
// day by that index but totals the day by reduce, so an entry carrying
// anything else counts toward the total and the goal bar while appearing under
// no meal heading -- the day simply doesn't add up, with nothing on screen to
// say why. (v407's demo seed did exactly this: it wrote "breakfast"/"lunch"
// as strings, so 770 kcal of demo food was in the total and in no group.)
// Normalised HERE so every reader gets a valid index from one place, the same
// contract as getRecipeBook's null guard -- do NOT push this check out to the
// renderers, that is how one of them gets missed again.
function foodMealIndex(v) {
  var n = (typeof v === "number") ? Math.floor(v) : parseInt(v, 10);
  if (n >= 0 && n < MEAL_TYPES.length) return n;
  var s = String(v == null ? "" : v).trim().toLowerCase();
  for (var i = 0; i < MEAL_TYPES.length; i++) {
    if (MEAL_TYPES[i].label.toLowerCase() === s) return i;
  }
  return MEAL_TYPES.length - 1; // unrecognised: the Snack bucket, so it is at least visible
}
function getFoodLog() {
  return (storeGet("fl4_food_log") || []).filter(function(e){ return !!e; }).map(function(e){
    var mi = foodMealIndex(e.meal);
    // Copy only what needs fixing -- normal entries stay the stored objects.
    return (mi === e.meal) ? e : Object.assign({}, e, { meal: mi });
  });
}
function saveFoodLog(e) { storeSet("fl4_food_log", e); pushPersonal(); }

// v461: food-log ids were Date.now(), so two entries added inside the SAME
// millisecond got the same id -- and every "newest id wins" read then picked
// arbitrarily. Re-opening a day could default to Breakfast when Dinner was
// what you logged last, and it is what made 61-food-meal-dropdown.js fail on
// roughly half of all runs. One of the three creation sites had already been
// patched with Date.now()+Math.random(); the other two had not, which is
// exactly why the bug survived that patch.
//
// This is now the ONLY way a food-log id is made: strictly increasing even
// within a single tick, so a tie cannot be created. Do NOT return a bare
// Date.now() at any call site -- the id is also the entry's identity for sync
// dedup and for deletion tombstones, so a collision is not just a sorting
// nuisance, it can make two entries the same record.
var _foodIdLast = 0;
function nextFoodId() {
  var t = Date.now();
  if (t <= _foodIdLast) t = _foodIdLast + 1;
  _foodIdLast = t;
  return t;
}

// What the meal dropdown should start on for a given day: Breakfast for the
// first entry of the day, otherwise the meal last logged on it. Derived from
// the log rather than remembered in a variable, so it is right for whichever
// DAY the date nav is showing -- a variable would carry today's last meal
// back to an empty Tuesday. Newest = highest id (ids are Date.now()-based),
// not last in the array: the array is insertion order, and a recipe or saved
// meal logged to a past date lands at the end of it either way.
function foodDefaultMeal(date) {
  var last = null;
  getFoodLog().forEach(function(e) {
    if (e.date !== date || trackPersonOf(e) !== trackPerson()) return;
    // v461: nextFoodId() stops NEW ties being created, but entries already
    // stored -- or logged on the other phone in the same millisecond -- can
    // still share an id, and this read must not be arbitrary for them. Break a
    // tie toward the later meal: a day runs breakfast to supper, so the higher
    // meal index is the likelier "last logged" of the two.
    var lid = last ? (last.id || 0) : -1, eid = e.id || 0;
    if (!last || eid > lid || (eid === lid && (e.meal || 0) > (last.meal || 0))) last = e;
  });
  return last ? last.meal : 0; // getFoodLog has already normalised meal to an index
}

// ── Calorie goal: stamped on every local write (v441) ────────────────────
// The goal is a bare scalar, so the personal-sync merge has no per-record
// `updated` field to compare and used to take the incoming value blindly.
// Any device that had never set a goal pushed the `|| 2000` fallback, and
// that push stomped a real goal set on another device back to 2000. Every
// local write now stamps `fl4_cal_goal_ts`; the merge takes the incoming
// value only when its stamp is newer. Route ALL goal writes through here --
// a bare storeSet("fl4_cal_goal", ...) leaves the stamp stale and the value
// silently loses to the next sync.
function setCalGoal(v) {
  storeSet("fl4_cal_goal", v);
  storeSet("fl4_cal_goal_ts", Date.now());
}

// ── Recipe -> food journal (v434) ────────────────────────────────────────
// One recipe becomes ONE food-log line, priced off the kcal-per-serving
// figure TYPED into the recipe editor.
//
// Do NOT "improve" this by estimating from the ingredients. FOOD_CAL above
// is mixed-basis -- butter (720) and cheese (400) are per 100g, egg (70) and
// bread (80) are per item, coffee (5) is per cup -- and there is no per-unit
// basis stored to multiply the ingredient amounts against. Summing it would
// be out by a factor of ten on exactly the fatty ingredients that dominate a
// total, and a calorie figure is one Cathal acts on. Typed, editable, shown
// with its working: the medicine-dosing rule, applied to food.
//
// Split of concerns: the recipe (and so its kcal) is household-shared, the
// food log is personal -- the figure syncs to Petra, the fact that it was
// eaten does not.
function recipeDefaultMeal(r) {
  var cat = String((r && r.category) || "").trim().toLowerCase();
  for (var i = 0; i < MEAL_TYPES.length; i++) {
    if (MEAL_TYPES[i].label.toLowerCase() === cat) return i;
  }
  return currentFoodMeal;
}
function fmtPortions(n) { return (n % 1) ? n.toFixed(1) : String(n); }
function foodTodayStr() {
  var d = new Date();
  return d.getFullYear()+"-"+(d.getMonth()<9?"0":"")+(d.getMonth()+1)+"-"+(d.getDate()<10?"0":"")+d.getDate();
}

function openRecipeFoodLogSheet(id) {
  var r = getRecipeBook().find(function(x){ return x.id === id; });
  if (!r) return;

  var ov = document.createElement("div");
  ov.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.55);z-index:700;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box";
  var box = document.createElement("div");
  box.style.cssText = "background:#fff;border-radius:14px;padding:20px;width:100%;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,.2)";
  function close() { if (ov.parentNode) document.body.removeChild(ov); }

  // No figure typed yet: say so and offer the editor, never guess one.
  if (!r.kcal) {
    box.innerHTML =
      "<div style='font-family:Georgia,serif;font-size:18px;font-weight:600;color:#2A2010;margin-bottom:8px'>" + esc(r.name) + "</div>" +
      "<div style='font-size:14px;color:#6A5A40;line-height:1.55;margin-bottom:14px'>No calories set for this recipe yet. Add a per-serving figure in the recipe editor and it&rsquo;s ready to log from here.</div>" +
      "<div style='display:flex;gap:8px'>" +
        "<button id='_rfClose' style='flex:1;padding:11px;border:1.5px solid #E0D0B0;border-radius:9px;background:none;font-family:inherit;font-size:14px;cursor:pointer;touch-action:manipulation;color:#7A5A30'>Close</button>" +
        "<button id='_rfEdit' style='flex:1;padding:11px;border:none;background:#A05A10;color:#fff;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>Set calories</button>" +
      "</div>";
    ov.appendChild(box);
    document.body.appendChild(ov);
    document.getElementById("_rfClose").addEventListener("click", close);
    document.getElementById("_rfEdit").addEventListener("click", function(){ close(); openRecipeEditor(r.id); });
    ov.addEventListener("click", function(e){ if (e.target === ov) close(); });
    return;
  }

  var portions = 1;                    // how much was eaten, not the recipe's servings
  var mealIdx  = recipeDefaultMeal(r); // "Dinner" category lands on Dinner

  function doLog() {
    var total = Math.round(r.kcal * portions);
    var text  = r.name + (portions === 1 ? "" : " (" + fmtPortions(portions) + " portions)");
    var log = getFoodLog();
    log.push({ id: nextFoodId(), date: foodTodayStr(), meal: mealIdx, text: text, cal: total, calAuto: false, person: "me" });
    saveFoodLog(log);
    close();
    toast("&#x1F373; " + MEAL_TYPES[mealIdx].label + ": " + text + " (" + total + " kcal)");
  }

  function wire() {
    document.getElementById("_rfMinus").addEventListener("click", function(){
      if (portions > 0.5) { portions = Math.round((portions - 0.5) * 10) / 10; draw(); }
    });
    document.getElementById("_rfPlus").addEventListener("click", function(){
      if (portions < 10) { portions = Math.round((portions + 0.5) * 10) / 10; draw(); }
    });
    box.querySelectorAll("._rfMeal").forEach(function(b){
      b.addEventListener("click", function(){ mealIdx = +b.dataset.mi; draw(); });
    });
    document.getElementById("_rfCancel").addEventListener("click", close);
    document.getElementById("_rfLog").addEventListener("click", doLog);
  }

  function draw() {
    var total = Math.round(r.kcal * portions);
    box.innerHTML =
      "<div style='font-family:Georgia,serif;font-size:18px;font-weight:600;color:#2A2010;margin-bottom:2px'>" + esc(r.name) + "</div>" +
      "<div style='font-size:12px;color:#9A8A6A;margin-bottom:14px'>" + r.kcal.toLocaleString() + " kcal per serving &middot; logging to today</div>" +
      "<div style='display:flex;align-items:center;gap:9px;background:#FBF5EC;border:1px solid #ECE0CC;border-radius:12px;padding:10px 12px;margin-bottom:12px'>" +
        "<span style='font-size:12px;font-weight:700;color:#7A5A30;text-transform:uppercase;letter-spacing:.5px'>Portions</span>" +
        "<button id='_rfMinus' style='width:32px;height:32px;border:1.5px solid #D8C8A8;background:#fff;border-radius:8px;font-size:20px;color:#7A5A30;cursor:pointer;line-height:1;touch-action:manipulation'>&minus;</button>" +
        "<span style='font-size:18px;font-weight:700;color:#2A2010;min-width:30px;text-align:center'>" + fmtPortions(portions) + "</span>" +
        "<button id='_rfPlus' style='width:32px;height:32px;border:1.5px solid #D8C8A8;background:#fff;border-radius:8px;font-size:20px;color:#7A5A30;cursor:pointer;line-height:1;touch-action:manipulation'>+</button>" +
        "<b style='margin-left:auto;font-size:15px;color:#7A3A05'>" + total.toLocaleString() + " kcal</b>" +
      "</div>" +
      "<div style='display:flex;gap:6px;margin-bottom:16px'>" +
        MEAL_TYPES.map(function(m, i){
          var on = (i === mealIdx);
          return "<button class='_rfMeal' data-mi='" + esc(i) + "' style='flex:1;padding:8px 2px;border:1.5px solid " + (on?"#A05A10":"#E0D0B0") + ";background:" + (on?"#A05A10":"#fff") + ";color:" + (on?"#fff":"#7A5A30") + ";border-radius:9px;font-family:inherit;font-size:11px;font-weight:700;line-height:1.5;cursor:pointer;touch-action:manipulation'>" + m.icon + "<br>" + m.label + "</button>";
        }).join("") +
      "</div>" +
      "<div style='display:flex;gap:8px'>" +
        "<button id='_rfCancel' style='flex:1;padding:11px;border:1.5px solid #E0D0B0;border-radius:9px;background:none;font-family:inherit;font-size:14px;cursor:pointer;touch-action:manipulation;color:#7A5A30'>Cancel</button>" +
        "<button id='_rfLog' style='flex:1;padding:11px;border:none;background:#A05A10;color:#fff;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>Log</button>" +
      "</div>";
    wire();
  }

  ov.appendChild(box);
  document.body.appendChild(ov);
  ov.addEventListener("click", function(e){ if (e.target === ov) close(); });
  draw();
}

function estimateCals(text) {
  var low = text.toLowerCase().replace(/[^a-z0-9 ]/g," ").trim();
  var best = 0;
  // Try longest match first
  var words = low.split(/\s+/);
  for (var len = 4; len >= 1; len--) {
    for (var i = 0; i <= words.length - len; i++) {
      var phrase = words.slice(i, i+len).join(" ");
      if (FOOD_CAL[phrase] !== undefined) {
        best = FOOD_CAL[phrase];
        // Try to detect quantity multiplier e.g. "2 eggs"
        if (i > 0 && !isNaN(words[i-1])) {
          var qty = parseFloat(words[i-1]);
          if (qty > 0 && qty <= 10) best = Math.round(best * qty);
        }
        return best;
      }
    }
  }
  return 0;
}

function foodDateStr(date) {
  var d = new Date(date + "T12:00:00");
  var today = (function(){ var d2=new Date(); return d2.getFullYear()+"-"+(d2.getMonth()<9?"0":"")+(d2.getMonth()+1)+"-"+(d2.getDate()<10?"0":"")+d2.getDate(); })();
  var yest  = (function(){ var d2 = new Date(today+"T12:00:00"); d2.setDate(d2.getDate()-1);
    return d2.getFullYear()+"-"+(d2.getMonth()<9?"0":"")+(d2.getMonth()+1)+"-"+(d2.getDate()<10?"0":"")+d2.getDate();
  })();
  if (date === today) return "Today";
  if (date === yest)  return "Yesterday";
  return d.toLocaleDateString("en-IE",{weekday:"short",day:"numeric",month:"short"});
}
function foodShiftDay(date, delta) {
  var d = new Date(date+"T12:00:00");
  d.setDate(d.getDate()+delta);
  return d.getFullYear()+"-"+(d.getMonth()<9?"0":"")+(d.getMonth()+1)+"-"+(d.getDate()<10?"0":"")+d.getDate();
}

// -- Food journal autosuggest (v442) --------------------------------------
// Typing in the "What did you eat?" box offers what you have logged before
// plus your recipe names, so a repeat meal is one tap instead of retyping.
//
// The calorie rule is the one that matters here, and it is the v434 rule
// again: a suggestion only carries a figure that a HUMAN typed -- a
// hand-entered kcal on a past entry, or a recipe's per-serving kcal from its
// editor. An auto-estimated figure is deliberately NOT carried across; the
// box is left empty so estimateCals regenerates it and the entry stays
// flagged `calAuto`. Copying an estimate forward would launder a guess into
// something that looks hand-checked, and calorie figures are numbers Cathal
// acts on. Do NOT "improve" this by prefilling estimates.
var _foodSuggest = [];

function foodSuggestKey(s) { return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " "); }

// One entry per distinct food name, newest-first so the display text and any
// typed figure come from the most recent time it was logged.
function foodSuggestPool() {
  var map = {}, out = [];
  function slot(text) {
    var k = foodSuggestKey(text);
    if (!k) return null;
    if (!map[k]) { map[k] = { key: k, text: String(text).trim(), cal: 0, uses: 0, last: 0, recipe: false }; out.push(map[k]); }
    return map[k];
  }
  getFoodLog().slice().sort(function(a, b) { return (b.id || 0) - (a.id || 0); }).forEach(function(e) {
    var it = slot(e.text);
    if (!it) return;
    it.uses++;
    if ((e.id || 0) > it.last) it.last = e.id || 0;
    if (!it.cal && e.cal && !e.calAuto) it.cal = e.cal;   // typed only -- see the note above
  });
  getRecipeBook().forEach(function(r) {
    var it = slot(r.name);
    if (!it) return;
    it.recipe = true;
    if (!it.cal && r.kcal) it.cal = r.kcal;               // typed in the recipe editor, never estimated
  });
  return out;
}

function foodSuggestMatches(q, max) {
  var needle = foodSuggestKey(q);
  if (needle.length < 2) return [];
  var hits = [];
  foodSuggestPool().forEach(function(it) {
    if (it.key === needle) return;                        // exact: already in the box, nothing to offer
    var at = it.key.indexOf(needle);
    if (at < 0) return;
    // starts the name (2) > starts a word inside it (1) > anywhere (0)
    hits.push({ it: it, rank: at === 0 ? 2 : (it.key.charAt(at - 1) === " " ? 1 : 0) });
  });
  hits.sort(function(a, b) {
    if (b.rank !== a.rank) return b.rank - a.rank;
    if (b.it.uses !== a.it.uses) return b.it.uses - a.it.uses;
    if (b.it.last !== a.it.last) return b.it.last - a.it.last;
    return a.it.text.localeCompare(b.it.text);
  });
  return hits.slice(0, max || 6).map(function(h) { return h.it; });
}

function hideFoodSuggest() {
  var box = document.getElementById("foodSuggestBox");
  if (box) { box.style.display = "none"; box.innerHTML = ""; }
  _foodSuggest = [];
}

function renderFoodSuggest() {
  var box = document.getElementById("foodSuggestBox");
  var fi  = document.getElementById("foodItemInput");
  if (!box || !fi) return;
  _foodSuggest = foodSuggestMatches(fi.value, 6);
  if (!_foodSuggest.length) { hideFoodSuggest(); return; }
  box.innerHTML = _foodSuggest.map(function(it, i) {
    var last = i === _foodSuggest.length - 1;
    return "<div class='food-sugg' data-si='" + esc(i) + "' style='display:flex;align-items:center;gap:8px;padding:10px 11px;cursor:pointer;touch-action:manipulation" +
      (last ? "" : ";border-bottom:1px solid #F0E4D0") + "'>" +
      "<span style='font-size:13px;flex-shrink:0'>" + (it.recipe ? "&#x1F4D6;" : "&#x1F553;") + "</span>" +
      "<span style='flex:1;font-size:14px;color:#2A2010;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" + esc(it.text) + "</span>" +
      (it.cal ? "<span style='font-size:11px;font-weight:700;color:#A05A10;flex-shrink:0'>" + it.cal + " kcal</span>" : "") +
    "</div>";
  }).join("");
  box.style.display = "block";
  box.scrollTop = 0;
  box.querySelectorAll(".food-sugg").forEach(function(row) {
    // Swallow the focus change, or the input blurs and the panel is gone
    // before the click ever lands on it.
    row.addEventListener("mousedown", function(e) { e.preventDefault(); });
    row.addEventListener("click", function() { pickFoodSuggest(+row.dataset.si); });
  });
}

function pickFoodSuggest(i) {
  var it = _foodSuggest[i];
  if (!it) return;
  var fi = document.getElementById("foodItemInput");
  var ci = document.getElementById("foodCalInput");
  if (!fi) return;
  fi.value = it.text;
  if (ci && it.cal && !ci.value && trackPerson() !== "daughter") ci.value = it.cal; // adult figures only
  hideFoodSuggest();
  refreshFoodCalEst();
  fi.focus();
}

// The live "Est. ~N kcal" line under the inputs. Top-level so both the input
// listener and pickFoodSuggest drive it from one place.
function refreshFoodCalEst() {
  var fi    = document.getElementById("foodItemInput");
  var estEl = document.getElementById("foodCalEst");
  var calIn = document.getElementById("foodCalInput");
  if (!fi || !estEl || !calIn) return;
  var est = trackPerson() === "daughter" ? 0 : estimateCals(fi.value);
  if (est && !calIn.value) {
    estEl.textContent = "Est. ~" + est + " kcal";
    calIn.placeholder = "~" + est + " kcal (estimated)";
  } else {
    estEl.textContent = "";
    calIn.placeholder = trackPerson() === "daughter" ? "kcal (optional)" : "kcal (auto-estimated)";
  }
}

function foodNoteKey(date) { return trackPerson() === "me" ? date : trackPerson() + ":" + date; }
function renderFoodView() {
  refreshFoodCalEst();
  var today = (function(){ var d=new Date(); return d.getFullYear()+"-"+(d.getMonth()<9?"0":"")+(d.getMonth()+1)+"-"+(d.getDate()<10?"0":"")+d.getDate(); })();

  // Date nav
  document.getElementById("foodDateLabel").textContent = foodDateStr(foodDate);
  document.getElementById("foodNextDay").disabled = foodDate >= today;

  var entries = getFoodLog().filter(function(e){ return e.date === foodDate && trackPersonOf(e) === trackPerson(); });
  // Sort by meal order
  entries.sort(function(a,b){ return (a.meal||0) - (b.meal||0); });

  var totalCal = entries.reduce(function(s,e){ return s+(e.cal||0); }, 0);
  var goalCal  = storeGet("fl4_cal_goal") || 2000;
  var isMyFood = trackPerson() === "me";

  // Summary bar
  var pct = Math.min(100, Math.round(totalCal/goalCal*100));
  var barColour = pct < 80 ? "#4CAF7D" : pct < 100 ? "#FFA726" : "#EF5350";
  document.getElementById("foodDaySummary").innerHTML =
    "<div style='font-size:15px;font-weight:700;color:#7A3A05;margin-bottom:5px'>" +
      totalCal.toLocaleString() + " kcal" +
      (isMyFood ? "<span style='font-size:12px;font-weight:400;color:#B8805A;margin-left:8px'>of " + goalCal.toLocaleString() + " goal</span>" : "") +
    "</div>" +
    (isMyFood ? "<div style='height:6px;background:#E8D8C0;border-radius:3px;overflow:hidden'>" +
      "<div style='height:100%;width:"+pct+"%;background:"+barColour+";border-radius:3px;transition:width .3s'></div>" +
    "</div>" : "") +
    "<div style='display:flex;justify-content:space-between;margin-top:5px;font-size:11px;color:#B8805A'>" +
      MEAL_TYPES.map(function(m,i){
        var mCal = entries.filter(function(e){ return e.meal===i; }).reduce(function(s,e){ return s+(e.cal||0);},0);
        return "<span>" + m.icon + " " + m.label + (mCal ? ": "+mCal : "") + "</span>";
      }).join("") +
    "</div>";

  // Entries grouped by meal
  var html = "";
  MEAL_TYPES.forEach(function(m, mi) {
    var meal = entries.filter(function(e){ return e.meal === mi; });
    if (!meal.length) return;
    var mCal = meal.reduce(function(s,e){ return s+(e.cal||0);},0);
    html += "<div style='margin-bottom:10px'>" +
      "<div style='font-size:11px;font-weight:700;color:#A05A10;text-transform:uppercase;letter-spacing:.5px;padding:4px 0 6px;display:flex;justify-content:space-between'>" +
        "<span>" + m.icon + " " + m.label + "</span>" +
        (mCal ? "<span style='color:#B8805A'>" + mCal + " kcal</span>" : "") +
      "</div>";
    meal.forEach(function(e) {
      html += "<div style='display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border-radius:10px;margin-bottom:5px;box-shadow:0 1px 3px rgba(0,0,0,.07)'>" +
        "<div style='flex:1'>" +
          "<div style='font-size:14px;color:#2A2010'>" + esc(e.text) + "</div>" +
          (e.calAuto ? "<div style='font-size:11px;color:#B8805A;margin-top:1px'>~" + e.cal + " kcal (estimated)</div>" : "") +
          (!e.calAuto && e.cal ? "<div style='font-size:11px;color:#7A5030;margin-top:1px'>" + e.cal + " kcal</div>" : "") +
        "</div>" +
        "<button data-foodid='" + esc(e.id) + "' class='food-del-btn' style='border:none;background:none;color:#C06060;font-size:14px;cursor:pointer;touch-action:manipulation;opacity:.45'>&#x2715;</button>" +
      "</div>";
    });
    html += "</div>";
  });

  if (!entries.length) {
    html = "<div style='text-align:center;padding:32px 24px;color:#B8805A'>" +
      "<div style='font-size:36px;margin-bottom:8px'>&#x1F373;</div>" +
      "<div style='font-size:14px'>Nothing logged yet for " + foodDateStr(foodDate) + "</div></div>";
  }

  document.getElementById("foodEntries").innerHTML = html;

  document.getElementById("foodEntries").querySelectorAll(".food-del-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var id = +btn.dataset.foodid;
      addTomb("food_log", id);
      saveFoodLog(getFoodLog().filter(function(e){ return e.id !== id; }));
      renderFoodView();
    });
  });

  // Daily note
  var noteEl = document.getElementById("foodDailyNote");
  var dayNotes = storeGet("fl4_food_notes") || {};
  noteEl.value = dayNotes[foodNoteKey(foodDate)] || "";
  if (!noteEl._wired) {
    noteEl._wired = true;
    noteEl.addEventListener("blur", function() {
      var dayNotes2 = storeGet("fl4_food_notes") || {};
      var key = foodNoteKey(foodDate);
      if (noteEl.value.trim()) dayNotes2[key] = noteEl.value.trim();
      else delete dayNotes2[key];
      storeSet("fl4_food_notes", dayNotes2);
      pushPersonal();
    });
  }

  // Saved meals chips
  var savedMeals = storeGet("fl4_saved_meals") || [];
  var smRow = document.getElementById("savedMealsRow");
  smRow.style.display = trackPerson() === "daughter" ? "none" : "flex";
  document.getElementById("saveMealBtn").style.display = trackPerson() === "daughter" ? "none" : "";
  if (savedMeals.length) {
    smRow.innerHTML = savedMeals.map(function(m, i) {
      return "<button class='food-saved-chip' data-midx='" + esc(i) + "' style='padding:5px 10px;background:#F5E8D8;border:1.5px solid #C4A07A;border-radius:16px;color:#7A3A05;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;touch-action:manipulation;white-space:nowrap;flex-shrink:0'>" +
        esc(m.name) + (m.cal ? " ~"+m.cal+"kcal" : "") + "</button>";
    }).join("") +
    "<button id='manageSavedMealsBtn' style='padding:5px 10px;background:none;border:1.5px dashed #C4A07A;border-radius:16px;color:#B8805A;font-family:inherit;font-size:12px;cursor:pointer;touch-action:manipulation;white-space:nowrap;flex-shrink:0'>&#x2699; Manage</button>";
  } else {
    smRow.innerHTML = "<span style='font-size:12px;color:#B8805A;padding:4px 0'>No saved meals yet — add items then tap 💾 Save as meal</span>";
  }

  smRow.querySelectorAll(".food-saved-chip").forEach(function(chip) {
    chip.addEventListener("click", function() {
      var meal = (storeGet("fl4_saved_meals")||[])[+chip.dataset.midx];
      if (!meal) return;
      var entries2 = getFoodLog();
      meal.items.forEach(function(it) {
        entries2.push({ id:nextFoodId(), date:foodDate, meal:currentFoodMeal, text:it.text, cal:it.cal, calAuto:it.calAuto, person:trackPerson() });  // v461: was Date.now()+Math.random()
      });
      saveFoodLog(entries2);
      renderFoodView();
      toast("&#x1F37D; Added: " + meal.name);
    });
  });

  var manageBtn = document.getElementById("manageSavedMealsBtn");
  if (manageBtn) manageBtn.addEventListener("click", openSavedMealsManager);

  // Meal dropdown: options once, then the day's default -- unless the user
  // has picked a meal by hand, which must survive a re-render (deleting an
  // entry would otherwise silently move their next log to an earlier meal).
  var msel = document.getElementById("foodMealSelect");
  if (!msel._wired) {
    msel._wired = true;
    msel.innerHTML = MEAL_TYPES.map(function(m, i) {
      return "<option value='" + i + "'>" + m.icon + " " + m.label + "</option>";
    }).join("");
    msel.addEventListener("change", function() {
      currentFoodMeal = foodMealIndex(msel.value);
      foodMealPicked  = true;
    });
  }
  if (!foodMealPicked) currentFoodMeal = foodDefaultMeal(foodDate);
  msel.value = String(currentFoodMeal);

  // Auto-estimate + autosuggest as user types
  var fi = document.getElementById("foodItemInput");
  if (fi && !fi._wired) {
    fi._wired = true;
    fi.addEventListener("input", function() { refreshFoodCalEst(); renderFoodSuggest(); });
    fi.addEventListener("focus", function() { renderFoodSuggest(); });
    // Backstop only: picking a suggestion cancels the blur (mousedown is
    // prevented), so this fires when focus really has left the box.
    fi.addEventListener("blur", function() { setTimeout(hideFoodSuggest, 180); });
    fi.addEventListener("keydown", function(e) {
      if (e.key === "Escape") { hideFoodSuggest(); return; }
      if (e.key === "Enter") { hideFoodSuggest(); document.getElementById("foodAddBtn").click(); }
    });
  }
}

// Date nav
document.getElementById("foodPrevDay").addEventListener("click", function() {
  foodDate = foodShiftDay(foodDate, -1); foodMealPicked = false; renderFoodView();
});
document.getElementById("foodNextDay").addEventListener("click", function() {
  var today = (function(){ var d=new Date(); return d.getFullYear()+"-"+(d.getMonth()<9?"0":"")+(d.getMonth()+1)+"-"+(d.getDate()<10?"0":"")+d.getDate(); })();
  if (foodDate < today) { foodDate = foodShiftDay(foodDate, 1); foodMealPicked = false; renderFoodView(); }
});

// Add food entry
document.getElementById("foodAddBtn").addEventListener("click", function() {
  if (btnBusy(this)) return;
  var text = document.getElementById("foodItemInput").value.trim();
  if (!text) { toast("Enter what you ate"); return; }
  var manualCal = parseInt(document.getElementById("foodCalInput").value);
  // The estimator uses adult portions; a toddler entry needs an explicit amount.
  var autoCal   = trackPerson() === "daughter" ? 0 : estimateCals(text);
  var cal = manualCal || autoCal || 0;
  var calAuto = !manualCal && !!autoCal;

  var entries = getFoodLog();
  entries.push({ id:nextFoodId(), date:foodDate, meal:currentFoodMeal, text:text, cal:cal, calAuto:calAuto, person:trackPerson() });
  saveFoodLog(entries);

  document.getElementById("foodItemInput").value = "";
  document.getElementById("foodCalInput").value  = "";
  document.getElementById("foodCalEst").textContent = "";
  document.getElementById("foodCalInput").placeholder = trackPerson() === "daughter" ? "kcal (optional)" : "kcal (auto-estimated)";
  hideFoodSuggest();
  renderFoodView();
  toast("&#x1F373; Logged: " + text + (cal ? " (~" + cal + " kcal)" : ""));
});

// Goal setting — tap summary
document.getElementById("foodDaySummary").addEventListener("click", function() {
  if (trackPerson() !== "me") return;
  var ov = document.createElement("div");
  ov.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.55);z-index:700;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box";
  var box = document.createElement("div");
  box.style.cssText = "background:#fff;border-radius:14px;padding:20px;width:100%;max-width:300px";
  box.innerHTML =
    "<div style='font-family:Georgia,serif;font-size:16px;font-weight:600;color:#2A2010;margin-bottom:10px'>Daily calorie goal</div>" +
    "<input id='_calGoalInput' type='number' min='500' max='10000' inputmode='numeric' style='width:100%;border:2px solid #E0D0B0;border-radius:9px;padding:11px 12px;font-family:inherit;font-size:18px;outline:none;box-sizing:border-box;margin-bottom:12px;text-align:center'>" +
    "<div style='display:flex;gap:8px'>" +
      "<button id='_goalCancel' style='flex:1;padding:10px;border:1.5px solid #E0D0B0;border-radius:9px;background:none;font-family:inherit;font-size:14px;cursor:pointer;touch-action:manipulation'>Cancel</button>" +
      "<button id='_goalSave' style='flex:1;padding:10px;border:none;background:#A05A10;color:#fff;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>Save</button>" +
    "</div>";
  ov.appendChild(box);
  document.body.appendChild(ov);
  var inp = document.getElementById("_calGoalInput");
  inp.value = storeGet("fl4_cal_goal") || 2000;
  setTimeout(function(){ inp.focus(); inp.select(); }, 60);
  function doSave() {
    var v = +inp.value;
    if (v > 0) { setCalGoal(v); pushPersonal(); renderFoodView(); }
    document.body.removeChild(ov);
  }
  document.getElementById("_goalSave").addEventListener("click", doSave);
  document.getElementById("_goalCancel").addEventListener("click", function(){ document.body.removeChild(ov); });
  inp.addEventListener("keydown", function(e){ if (e.key==="Enter") doSave(); });
});

// Save as meal
document.getElementById("saveMealBtn").addEventListener("click", function() {
  if (btnBusy(this)) return;
  var entries = getFoodLog().filter(function(e){ return e.date === foodDate && trackPersonOf(e) === trackPerson(); });
  if (!entries.length) { toast("No entries today to save as a meal"); return; }

  // prompt() is blocked in sandboxed iframes — use a custom overlay instead
  var ov = document.createElement("div");
  ov.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.55);z-index:700;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box";
  var box = document.createElement("div");
  box.style.cssText = "background:#fff;border-radius:14px;padding:20px;width:100%;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,.2)";
  box.innerHTML =
    "<div style='font-family:Georgia,serif;font-size:18px;font-weight:600;color:#2A2010;margin-bottom:12px'>Name this meal</div>" +
    "<input id='_mealNameInput' type='text' placeholder='e.g. Sunday fry up' style='width:100%;border:2px solid #E0D0B0;border-radius:9px;padding:11px 12px;font-family:inherit;font-size:15px;outline:none;box-sizing:border-box;margin-bottom:12px'>" +
    "<div style='display:flex;gap:8px'>" +
      "<button id='_mealCancel' style='flex:1;padding:11px;border:1.5px solid #E0D0B0;border-radius:9px;background:none;font-family:inherit;font-size:14px;cursor:pointer;touch-action:manipulation;color:#7A5A30'>Cancel</button>" +
      "<button id='_mealSave' style='flex:1;padding:11px;border:none;background:#A05A10;color:#fff;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>Save</button>" +
    "</div>";
  ov.appendChild(box);
  document.body.appendChild(ov);
  var inp = document.getElementById("_mealNameInput");
  setTimeout(function(){ inp.focus(); }, 60);

  function doSave() {
    var name = inp.value.trim() || "My meal";
    var totalCal = entries.reduce(function(s,e){ return s+(e.cal||0);},0);
    var saved = storeGet("fl4_saved_meals") || [];
    saved.push({ id:Date.now(), name:name, cal:totalCal,
      items: entries.map(function(e){ return { text:e.text, cal:e.cal, calAuto:e.calAuto }; }) });
    storeSet("fl4_saved_meals", saved);
    pushPersonal();
    document.body.removeChild(ov);
    renderFoodView();
    toast("&#x1F4BE; Meal saved: " + name);
  }

  document.getElementById("_mealSave").addEventListener("click", doSave);
  document.getElementById("_mealCancel").addEventListener("click", function(){ document.body.removeChild(ov); });
  inp.addEventListener("keydown", function(e){ if (e.key === "Enter") doSave(); });
});

// -- Saved meal -> recipe (v442) ------------------------------------------
// A saved meal is a personal one-tap logging shortcut; the recipe book is
// household-shared. This COPIES, it never moves: the saved meal stays exactly
// where it was, because "also make it a recipe" is not a request to lose the
// shortcut. Note the scope crossing it implies -- the meal was personal, the
// recipe it becomes is visible to the whole household.
//
// Calories follow the v434 rule one more time. The total is only carried into
// the recipe's `kcal` when EVERY item carries a hand-typed figure: one
// auto-estimated line makes the total a guess, and a recipe's kcal is the
// number every future food-log entry gets priced off. Mixed or estimated, it
// is left blank for Cathal to type. Do NOT "fix" this by summing estimates.
function savedMealCalories(meal) {
  var items = (meal && meal.items) || [];
  if (!items.length) return 0;
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    if (!items[i].cal || items[i].calAuto) return 0;
    total += items[i].cal;
  }
  return total;
}

// The recipe this saved meal became, if it is already in the book. Name match
// only, normalized the way the autosuggest normalizes food names.
function savedMealRecipe(meal) {
  var key = foodSuggestKey(meal && meal.name);
  if (!key) return null;
  return getRecipeBook().find(function(r){ return foodSuggestKey(r.name) === key; }) || null;
}

// Returns the new recipe's id, or null if it was refused.
function savedMealToRecipe(mi) {
  var saved = storeGet("fl4_saved_meals") || [];
  var meal = saved[mi];
  if (!meal) return null;
  var name = String(meal.name || "").trim() || "My meal";
  if (savedMealRecipe(meal)) { toast("A recipe called &ldquo;" + esc(name) + "&rdquo; is already in your book"); return null; }
  // One logged line in, one ingredient out. parseIngredients picks up whatever
  // amount the text carries ("2 eggs" -> 2 x eggs) and leaves the rest as a
  // plain named ingredient, which is the honest result: a food-log line is not
  // a measured quantity.
  //
  // Parsed a line at a time, with a fallback, because parseIngredients is
  // built for RECIPE lines where a bare unit word is a measure. "Rashers",
  // "Slices", "Scoop" are all in INGREDIENT_UNIT_MAP, so a food-log line
  // consisting only of one parses to a unit with an EMPTY name and gets
  // filtered out -- the meal would silently lose an item. In a food log those
  // words are the food's name. Do NOT collapse this back into one
  // parseIngredients call over the joined text.
  var ingredients = [];
  (meal.items || []).forEach(function(it) {
    var line = String(it.text || "").trim();
    if (!line) return;
    var parsed = parseIngredients(line)[0];
    ingredients.push((parsed && parsed.name && !parsed.header) ? parsed : { name: line });
  });
  var rb = getRecipeBook();
  var id = nextRecipeId(recipeIdMap(rb));
  rb.unshift({ id:id, name:name, servings:1, kcal:savedMealCalories(meal), category:"",
    ingredients:ingredients, prep:"", method:"", notes:"", url:"", fav:false,
    inRotation:false, updated:Date.now(), addedBy:hearthUser });
  saveRecipeBook(rb);
  return id;
}

function openSavedMealsManager() {
  var saved = storeGet("fl4_saved_meals") || [];
  var overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.5);z-index:600;display:flex;align-items:flex-end;justify-content:center";
  var box = document.createElement("div");
  box.style.cssText = "background:#fff;border-radius:16px 16px 0 0;width:100%;max-width:480px;padding:20px;max-height:70vh;overflow-y:auto";
  function render() {
    saved = storeGet("fl4_saved_meals") || [];
    box.innerHTML = "<div style='font-family:Georgia,serif;font-size:18px;font-weight:600;color:#2A2010;margin-bottom:14px'>Saved Meals</div>" +
      (saved.length ? saved.map(function(m,i){
        return "<div style='display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #F0EDE8'>" +
          "<div style='flex:1'><div style='font-size:14px;font-weight:700;color:#2A2010'>" + esc(m.name) + "</div>" +
          "<div style='font-size:12px;color:#B8805A'>" + m.items.length + " items" + (m.cal?" · ~"+m.cal+" kcal total":"") + "</div>" +
          m.items.map(function(it){ return "<div style='font-size:11px;color:#B8805A;padding-left:8px'>• " + esc(it.text) + (it.cal?" ("+it.cal+"kcal)":"") + "</div>"; }).join("") +
          "</div>" +
          // Already in the book: a second, deliberate tap opens it, rather than
          // the manager teleporting you over to Recipes on its own.
          (savedMealRecipe(m)
            ? "<button data-open='" + esc(i) + "' style='border:1.5px solid #C4A07A;background:none;color:#7A3A05;font-family:inherit;font-size:11px;font-weight:700;border-radius:14px;cursor:pointer;touch-action:manipulation;padding:5px 9px;white-space:nowrap;flex-shrink:0'>&#x1F4D6; Open</button>"
            : "<button data-rec='" + esc(i) + "' style='border:1.5px solid #C4A07A;background:none;color:#7A3A05;font-family:inherit;font-size:11px;font-weight:700;border-radius:14px;cursor:pointer;touch-action:manipulation;padding:5px 9px;white-space:nowrap;flex-shrink:0'>&#x1F4D6; Make recipe</button>") +
          "<button data-del='" + esc(i) + "' style='border:none;background:none;color:#C06060;font-size:14px;cursor:pointer;touch-action:manipulation;padding:4px 8px;flex-shrink:0'>&#x2715;</button>" +
        "</div>";
      }).join("") : "<p style='color:#B8805A;font-size:14px'>No saved meals yet.</p>") +
      "<button style='width:100%;margin-top:14px;padding:12px;border:none;background:#F5E8D8;color:#7A3A05;border-radius:9px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation'>Close</button>";
    box.querySelector("button:last-child").addEventListener("click", function(){ document.body.removeChild(overlay); renderFoodView(); });
    box.querySelectorAll("[data-rec]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var m = saved[+btn.dataset.rec];
        var id = savedMealToRecipe(+btn.dataset.rec);
        if (!id) return;                       // name clash -- savedMealToRecipe already said so
        render();                              // the row flips to "Open"
        toast("&#x1F4D6; Recipe added: " + esc(m.name) +
              (savedMealCalories(m) ? "" : " &mdash; add the method and calories"));
      });
    });
    box.querySelectorAll("[data-open]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var r = savedMealRecipe(saved[+btn.dataset.open]);
        if (!r) { render(); return; }
        if (overlay.parentNode) document.body.removeChild(overlay);
        switchSection("recipes");
        openRecipeEditor(r.id);
      });
    });
    box.querySelectorAll("[data-del]").forEach(function(btn){
      btn.addEventListener("click", function(){
        // v443: the tombstone is what makes the delete STICK. Without it the
        // next pull re-added the other device's copy and the meal came back.
        var gone = saved[+btn.dataset.del];
        if (gone) addTomb("saved_meals", gone.id);
        saved.splice(+btn.dataset.del, 1);
        storeSet("fl4_saved_meals", saved);
        pushPersonal();
        render();
        // v445: render() rebuilds THIS overlay only. The saved-meal chips in the
        // Food view underneath are painted by renderFoodView(), which until now
        // ran only when the sheet was closed -- so a deleted meal sat there in
        // the chip row until you navigated away and came back. Repaint both:
        // the overlay is a separate element on <body>, so redrawing the view
        // beneath it is safe and leaves the open sheet alone.
        renderFoodView();
      });
    });
  }
  render();
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", function(e){ if(e.target===overlay){ document.body.removeChild(overlay); renderFoodView(); } });
}

