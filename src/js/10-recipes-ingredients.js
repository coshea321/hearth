// ── Grocery name cleanup + matching (v363) ────────────────────────────────
// Recipe ingredient names arrive with measure and prep noise baked into the
// NAME, because parseIngredients only peels a LEADING number+unit off the
// line: "460 g (1 3/4 cups + 2 tbs) Greek yogurt" parses to amount 460, unit
// g, name "(1 3/4 cups + 2 tbs) Greek yogurt". Both grocery import paths used
// to strip only a TRAILING bracket, so that name went onto the list verbatim
// and could never match a hand-typed "Greek Yoghurt". These two helpers are
// the single source of truth for both paths (recipe push + quick import).
//
// cleanGroceryName returns the buyable name. Nothing it removes is lost: the
// caller carries the detail into the item's note.
//   light=true  → brackets and "x2"/"~2" only (used for non-grocery lists,
//                 where a trailing comma clause is real text: "Call bank,
//                 ask about fees" must NOT become "Call bank").
function cleanGroceryName(raw, light) {
  var s = String(raw || "").replace(/<\/?[^>]+>/g, " ");   // any stray markup
  s = s.replace(/\([^)]*\)/g, " ");                        // brackets ANYWHERE, not just trailing
  s = s.replace(/[()]/g, " ");                             // unbalanced leftovers
  s = s.replace(/\s+[x~]\s*\d+(?:\s|$)/i, " ");            // "Milk x2" (was quick-import only)
  if (!light) {
    s = s.split(",")[0];                                   // "onion, finely chopped" → "onion"
    s = s.replace(/^of\s+/i, "");                          // "1 pinch of salt" → unit=pinch, "of salt"
  }
  s = s.replace(/^[\s\-–—.:]+|[\s\-–—.:,]+$/g, "");        // edge punctuation
  s = s.replace(/\s{2,}/g, " ").trim();
  // Sentence-case a fully lowercase start so recipe items sit beside typed
  // ones ("egg" → "Egg"). Guarded so deliberate casing survives ("iPhone").
  if (!light && /^[a-z]/.test(s) && !/^[a-z][A-Z]/.test(s)) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

// A leading number as recipes write them: "1 1/2", "3/4", "¾", "200", "1.5".
var GROCERY_NUM_SRC = "\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|\\d+(?:\\.\\d+)?";

// Units that may be recovered from inside a NAME and still scale properly —
// values are the canonical unit scaleIngredient understands, so anything
// pulled out here doubles when the recipe doubles.
var GROCERY_NAME_UNITS = {
  g:"g", gram:"g", grams:"g", kg:"kg", kilogram:"kg", kilograms:"kg",
  ml:"ml", millilitre:"ml", millilitres:"ml", l:"l", litre:"l", litres:"l", liter:"l", liters:"l",
  tsp:"tsp", teaspoon:"tsp", teaspoons:"tsp", tbsp:"tbsp", tbs:"tbsp", tablespoon:"tbsp", tablespoons:"tbsp",
  oz:"oz", ounce:"oz", ounces:"oz", lb:"lb", lbs:"lb", pound:"lb", pounds:"lb",
  cup:"cup", cups:"cup", clove:"clove", cloves:"clove", can:"can", cans:"can",
  tin:"tin", tins:"tin", slice:"slice", slices:"slice", piece:"piece", pieces:"piece",
  pinch:"pinch", pinches:"pinch", cube:"cube", cubes:"cube",
  scoop:"scoop", scoops:"scoop", rasher:"rasher", rashers:"rasher",
  sprig:"sprig", sprigs:"sprig", bunch:"bunch", bunches:"bunch", stick:"stick", sticks:"stick"
};

// Prep instructions that are only ever stripped when they TRAIL the name (see
// rule ⑤). Deliberately an explicit list rather than "any -ed word", so a real
// product name is never mistaken for an instruction.
var GROCERY_PREP_WORDS = ["deseeded","de-seeded","seeded","chopped","diced","sliced","minced",
  "crushed","grated","peeled","drained","rinsed","trimmed","halved","quartered","beaten",
  "melted","softened","cubed","shredded","zested","juiced","washed","separated","divided"];

// Pull a buyable name, a quantity and a note out of one ingredient NAME.
// parseIngredients only peels a leading "<number> <unit>" off a line, so a
// recipe that writes the measure any other way leaves it stranded in the name
// — which is what puts "Juice of 1 lemon" and "Garlic - 2 cloves" on the
// shopping list instead of "Lemon ×1" and "Garlic, 2 cloves".
//
// hasAmount: whether parseIngredients already found an amount for this line
// (if it did, we never invent a second one — we only recover a stranded unit).
// Returns { name, amount, unit, qty, detail, prep }:
//   amount+unit → scalable, handed back through scaleIngredient
//   qty         → a literal quantity we cannot scale ("1/2 thumb size"),
//                 so it is shown at base servings only, like bracket text
//   detail      → a note that REPLACES the built-up amount note ("Juice of 1
//                 lemon" already says the amount, so repeating it reads badly)
//   prep        → a note fragment that is ADDED to it ("finely chopped")
function splitGroceryName(raw, hasAmount) {
  var out = { name: "", amount: null, unit: null, qty: "", detail: "", prep: "" };
  var s = String(raw || "").replace(/<\/?[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!s) return out;
  // Bracket text is the caller's business, not this function's: amtDetail reads
  // it straight off the raw name and cleanGroceryName strips it from the final
  // name anyway. Taking it out of `body` up front stops the trailing rules ⑤
  // matching THROUGH a closing bracket — "Black beans (425 g, rinsed)" was
  // yielding a prep note of "rinsed)", stray paren and all, which mattered a
  // lot more once v366's tidy tool started writing brackets deliberately.
  // `s` deliberately stays whole: rule ① hands the untouched original back as
  // the note detail.
  var body = s.replace(/\([^)]*\)/g, " ").replace(/[()]/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!body) return out;
  var numRe = new RegExp("^(" + GROCERY_NUM_SRC + ")\\s*([a-zA-Z]+)?\\s*(.*)$");

  // ① "Juice of 1 lemon" → buy a Lemon, quantity 1, and keep the whole
  //    original as the note (it is what you actually do with the lemon).
  // Also "zest and juice of 1 lime" — the same shape, written with both, which
  // the single-word version missed and left as an untidyable line.
  var jm = body.match(/^(?:grated\s+)?(?:juice|zest|rind|peel)(?:\s+and\s+(?:juice|zest|rind|peel))?\s+of\s+(.+)$/i);
  if (jm) {
    var rest = jm[1].replace(/^(?:a|an|the)\s+/i, "1 ");
    var jn = rest.match(numRe);
    if (jn && !GROCERY_NAME_UNITS[String(jn[2] || "").toLowerCase()]) {
      out.amount = parseAmount(jn[1]);
      rest = ((jn[2] || "") + " " + (jn[3] || "")).trim();
    }
    if (rest) { if (out.amount == null) out.amount = 1; out.detail = s; body = rest; }
  }

  // ② A trailing " - " clause: a quantity ("Garlic - 2 cloves") or a prep
  //    instruction ("Fresh coriander - finely chopped"). Spaces around the
  //    dash are required, so hyphenated names ("self-rising flour") are safe.
  var dm = body.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dm) {
    var clause = dm[2].trim();
    var cm = clause.match(numRe);
    if (!cm) { if (!out.prep) out.prep = clause; }
    else {
      var cu = GROCERY_NAME_UNITS[String(cm[2] || "").toLowerCase()];
      if (cu && !cm[3] && out.amount == null) { out.amount = parseAmount(cm[1]); out.unit = cu; }
      else if (!cm[2] && !cm[3] && out.amount == null) out.amount = parseAmount(cm[1]);
      else out.qty = clause;               // "1/2 thumb size" — real, but not scalable
    }
    body = dm[1].trim();
  }

  // ③ "200g mushrooms" — number glued to its unit, so parseIngredients' own
  //    "<number> <space> <unit>" match never fired.
  if (out.amount == null && !out.qty && !hasAmount) {
    var lm = body.match(numRe);
    if (lm && lm[2] && lm[3] && GROCERY_NAME_UNITS[lm[2].toLowerCase()]) {
      out.amount = parseAmount(lm[1]);
      out.unit = GROCERY_NAME_UNITS[lm[2].toLowerCase()];
      body = lm[3];
    }
  }

  // ④ "1 tin chopped tomatoes" — the amount parsed but the container word did
  //    not, so it was left stranded at the front of the name.
  if (hasAmount && out.amount == null && !out.unit) {
    var wm = body.match(/^([a-zA-Z]+)\s+(.+)$/);
    if (wm && GROCERY_NAME_UNITS[wm[1].toLowerCase()]) { out.unit = GROCERY_NAME_UNITS[wm[1].toLowerCase()]; body = wm[2]; }
  }

  // ⑤ Unpunctuated trailing noise, as seen in badly-ingested CSV recipes:
  //    "Chilli deseeded chili" means one chilli, deseeded. Two rules, both
  //    TRAILING-only — that asymmetry is what makes them safe. A modifier that
  //    LEADS is part of the product ("chopped tomatoes", "condensed milk",
  //    "smoked salmon") and is never touched; one that trails is an
  //    instruction. Rule one: a last word that just repeats the first is
  //    ingest noise. Rule two: a trailing prep word (optionally with its
  //    adverb) is a note, not something you buy.
  var w = body.split(/\s+/);
  if (w.length > 1) {
    var firstK = groceryNameKey(w[0]);
    if (firstK && groceryNameKey(w[w.length - 1]) === firstK) { w.pop(); body = w.join(" "); }
  }
  var pm = body.match(/^(.+?)\s+((?:finely|roughly|thinly|coarsely|freshly|lightly|well)\s+)?([a-zA-Z-]+)$/);
  if (pm && GROCERY_PREP_WORDS.indexOf(pm[3].toLowerCase()) !== -1) {
    if (!out.prep) out.prep = ((pm[2] || "") + pm[3]).trim();
    body = pm[1].trim();
  }

  // A comma clause is dropped by cleanGroceryName — keep it as a prep note
  // rather than losing it ("onion, finely chopped").
  var ci = body.indexOf(",");
  if (ci !== -1 && !out.prep) out.prep = body.slice(ci + 1).trim();

  out.name = cleanGroceryName(body);
  return out;
}

// ── Tidy ingredients (v366) ───────────────────────────────────────────────
// A one-off maintenance pass over the whole recipe book. Everything above this
// point is DOWNSTREAM rescue — it cleans a name on its way to the grocery list
// and never touches what is stored. This is the opposite: it rewrites the
// stored ingredient into the shape the parser wanted all along, so the recipe
// VIEW reads properly too and no rescue is needed on the way out.
//
// The canonical shape is "<amount> <unit> <Name> (<detail>)", which needs no
// new field: parseIngredients already reads the amount and unit, and since
// v363 anything in brackets is stripped out of the grocery name and carried
// into the item's note. So a tidied line survives an editor round-trip and
// produces exactly the item Cathal asked for — "Black beans", amount "2 cans",
// note "(15-ounce / 425 g, rinsed)".
//
// SAFETY: this rewrites household-synced data, so the bar for touching a line
// is losslessness, not cleverness. Every word of the original has to reappear
// somewhere in the rewrite (see tidyIsLossless) and the rewrite has to reparse
// to the same amount/unit/name. A line that fails either check is reported as
// "needs your eye" and left exactly as it was — the tool never guesses.

// Container words that can carry a size ("15-ounce cans"). Values are the
// canonical singular scaleIngredient understands.
var TIDY_CONTAINERS = {
  can:"can", cans:"can", tin:"tin", tins:"tin", jar:"jar", jars:"jar",
  pack:"pack", packs:"pack", packet:"packet", packets:"packet",
  bottle:"bottle", bottles:"bottle", box:"box", boxes:"box", bag:"bag", bags:"bag"
};
// Measure words a container size is written in ("15-ounce", "400 g").
var TIDY_SIZE_UNITS = "ounce|ounces|oz|g|gram|grams|kg|ml|millilitre|millilitres|l|litre|litres|lb|lbs|pound|pounds";

// Some recipe sites gloss a spoon measure with its metric size — "2 x 15ml
// tablespoons olive oil" means two tablespoons, and a tablespoon IS 15ml, so
// the gloss restates the unit and carries no information of its own. It does
// however stop the parser dead: the leading amount is taken, the "x" isn't a
// unit, and everything after it is stranded in the name. Collapsing it to
// "2 tablespoons" lets every existing rule (including compound summing) work.
// Applied to BOTH sides of the losslessness comparison, so dropping a pure
// restatement never reads as lost wording.
function normaliseIngredientLine(line) {
  return String(line || "").replace(
    /(\d+(?:\.\d+)?)\s*x\s*\d+(?:\.\d+)?\s*(?:ml|g|oz|fl\s?oz)\s+(tablespoons?|teaspoons?|tbsps?|tsps?|cups?|dessertspoons?)/gi,
    "$1 $2");
}

// Rewrite one ingredient into the canonical shape. Returns:
//   { before, after, changed, ok, ing }
// ok=false means low confidence — the caller flags it and leaves it alone.
function tidyIngredient(ing) {
  var before = ingredientToLine(ing);
  var out = { before: before, after: before, changed: false, ok: true, ing: ing };
  if (!ing || isHeaderIng(ing)) return out;

  var eff = rescueIngredientMeasure(ing);   // recover a compound/range first
  // Collapse a "2 x 15ml tablespoons" gloss and re-parse, so the compound and
  // range rules get a line they can actually read.
  var effLine = ingredientToLine(eff), normLine = normaliseIngredientLine(effLine);
  if (normLine !== effLine) {
    var renorm = parseIngredients(normLine, false)[0];
    if (renorm && !renorm.header && renorm.name) eff = renorm;
  }
  var detail = [];
  var body = String(eff.name || "").replace(/<\/?[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!body) return out;

  // Bracket text already in the name is detail by definition — lift it out
  // verbatim and keep it, rather than re-deriving it.
  body = body.replace(/\(([^)]*)\)/g, function(_m, inner){
    if (inner && inner.trim()) detail.push(inner.trim());
    return " ";
  }).replace(/[()]/g, " ").replace(/\s{2,}/g, " ").trim();

  var amount = eff.amount != null ? eff.amount : null;
  var unit = eff.unit || null;

  // ⓐ0 The "1 x 400g tin chopped tomatoes" multiplier form, very common in UK
  //     recipes. parseIngredients takes the leading "1" and then stops dead on
  //     the "x", leaving the whole measure stranded. The multiplication itself
  //     is not lost by rewriting it — amount × pack size says the same thing —
  //     so the pack size goes to the bracket and the container becomes the unit.
  var xm = body.match(new RegExp("^x\\s*(\\d+(?:\\.\\d+)?)\\s*(" + TIDY_SIZE_UNITS + ")\\s+(?:([a-zA-Z]+)\\s+)?(.+)$", "i"));
  if (xm) {
    if (xm[3] && TIDY_CONTAINERS[xm[3].toLowerCase()]) {
      if (!unit) unit = TIDY_CONTAINERS[xm[3].toLowerCase()];
      body = xm[4];
    } else {
      body = ((xm[3] || "") + " " + xm[4]).trim();
    }
    detail.unshift(xm[1] + " " + xm[2].toLowerCase());
  }

  // ⓐ A sized container: "15-ounce cans black beans" → 1 can, size to detail.
  //    This is the shape CSV-imported US recipes use constantly and the one
  //    the leading-amount parser can never reach, because the size number is
  //    where it expects the product name to start.
  var sc = body.match(new RegExp("^(\\d+(?:\\.\\d+)?)\\s*[-\\s]\\s*(" + TIDY_SIZE_UNITS + ")\\s+([a-zA-Z]+)\\s+(.+)$", "i"));
  if (sc && TIDY_CONTAINERS[sc[3].toLowerCase()]) {
    if (!unit) unit = TIDY_CONTAINERS[sc[3].toLowerCase()];
    detail.unshift(sc[1] + "-" + sc[2].toLowerCase());
    body = sc[4];
  }

  // ⓑ A dual-unit tail: "black beans / 425 g" — the metric equivalent the
  //    recipe site printed alongside the imperial measure. Real information,
  //    but it is a note, not part of what you buy.
  var du = body.match(new RegExp("^(.+?)\\s*/\\s*((?:\\d+(?:\\.\\d+)?)\\s*(?:" + TIDY_SIZE_UNITS + ")\\b.*)$", "i"));
  if (du) { detail.push(du[2].trim()); body = du[1].trim(); }

  // ⓒ The comma clause, taken WHOLE. splitGroceryName only keeps it when its
  //    trailing prep-word rule hasn't already claimed part of it, so leaving
  //    this to the splitter loses words out of the middle ("onion, peeled and
  //    diced" kept only "diced"). Losing words is exactly what the tidy pass
  //    must never do, so it is handled here first.
  var cc = body.indexOf(",");
  if (cc !== -1) {
    var clause = body.slice(cc + 1).trim();
    if (clause) detail.push(clause);
    body = body.slice(0, cc).trim();
  }

  // ⓒ2 A trailing "or <alternative>" measure. v365 deliberately dropped
  //     "or"-alternatives from the PARSER because it would have had to choose
  //     between them — but moving the alternative into the bracket chooses
  //     nothing, it just stops the second measure blocking the name. A number
  //     is required in the tail so a product name ("salt or pepper") is safe.
  var om = body.match(/^(.+?)\s+or\s+(.+)$/i);
  if (om && /\d|[¼½¾⅓⅔⅛⅜⅝⅞]/.test(om[2]) && om[1].trim()) {
    detail.push("or " + om[2].trim());
    body = om[1].trim();
  }

  // ⓓ Everything the existing splitter already knows: glued units, stranded
  //    container words, " - " clauses, trailing prep.
  var sp = splitGroceryName(body, amount != null);
  // A "Juice of 1 lemon" line (sp.detail) is deliberately left alone: v363's
  // downstream rescue already turns it into the right grocery item, and any
  // rewrite here either duplicates the phrase in a bracket or drops what you
  // actually do with the lemon. Nothing to add, so don't touch it.
  if (sp.detail) return out;
  if (amount == null && sp.amount != null) { amount = sp.amount; unit = unit || sp.unit; }
  else if (amount != null && !unit && sp.unit) unit = sp.unit;
  if (sp.qty) detail.push(sp.qty);
  if (sp.prep) detail.push(sp.prep);
  var name = sp.name || cleanGroceryName(body);

  // A name that still carries a digit means a measure survived the pass — the
  // one thing this whole exercise exists to remove. Don't pretend otherwise.
  // `why` is shown on the flagged row: "couldn't tidy this" on its own tells
  // Cathal nothing about what to do, and tells us nothing about what to fix.
  if (!name) { out.ok = false; out.why = "nothing left to buy once the measure was taken out"; return out; }
  if (/\d/.test(name)) { out.ok = false; out.why = "a number is still stuck in the name"; return out; }

  var tidied = { name: name };
  if (amount != null) tidied.amount = amount;
  if (eff.amountMax != null) tidied.amountMax = eff.amountMax;
  if (unit) tidied.unit = unit;
  if (eff.approx) tidied.approx = true;
  // Keep the compound's original phrasing — dropping it would flatten
  // "1 3/4 cup + 2 tbsp" to a decimal in the editor for good.
  if (eff._compoundNote) tidied._compoundNote = eff._compoundNote;
  if (detail.length) tidied.name = name + " (" + detail.join(", ") + ")";

  var after = ingredientToLine(tidied);
  // Round-trip: the rewritten line has to come back out of the parser as the
  // same ingredient, or the editor would quietly change it on the next save.
  var rt = parseIngredients(after, false)[0];
  if (!rt || rt.header || rt.name !== tidied.name ||
      (rt.amount == null) !== (amount == null) ||
      (rt.amount != null && Math.abs(rt.amount - amount) > 0.001) ||
      (rt.unit || null) !== (unit || null)) {
    out.ok = false; out.why = "the tidied line wouldn't read back the same"; return out;
  }
  if (!tidyIsLossless(before, after)) {
    out.ok = false; out.why = "some of the wording would have been lost"; return out;
  }

  out.after = after;
  out.ing = tidied;
  out.changed = after !== before;
  return out;
}

// Every meaningful word of the original must still be present afterwards.
// Compared through groceryNameKey so "cans"→"can" and "Beans"→"bean" don't
// read as losses, and with punctuation-only noise ignored. This is what
// makes "confident" mean something: the tool may MOVE text between the name,
// the unit and the bracket, but it may never drop any.
function tidyIsLossless(before, after) {
  function bag(s) {
    var m = {};
    // "200g" and "200 g" are the same two facts written differently, and the
    // whole point of the pass is to separate them — so split a glued
    // number+unit before comparing, or every such fix would read as a loss.
    // Markup is not wording: "<s>2 tbsp sugar</s>" would otherwise leave a
    // stray "s" token behind and read as a lost word.
    s = String(s || "").replace(/<\/?[^>]+>/g, " ");
    // Compared post-normalisation, so collapsing a "2 x 15ml tablespoons"
    // gloss — a restatement of the unit, not information — isn't a loss.
    s = normaliseIngredientLine(s);
    s = s.replace(/(\d)\s*([a-zA-Z])/g, "$1 $2").replace(/[^\w\s./-]/g, " ");
    groceryNameKey(s).split(/\s+/).forEach(function(w){
      w = w.replace(/^[-.\/]+|[-.\/]+$/g, "");
      // A bare "x" is the multiplier symbol in "1 x 400g", not information:
      // amount × pack size carries it, so rewriting it away is not a loss.
      if (!w || /^(of|the|a|an|and|x)$/.test(w)) return;
      // Fold a unit word to the parser's canonical form, so writing
      // "2 tablespoons" as "2 tbsp" is recognised as the same two facts.
      if (INGREDIENT_UNIT_MAP[w]) w = INGREDIENT_UNIT_MAP[w];
      m[w] = (m[w] || 0) + 1;
    });
    return m;
  }
  var b = bag(before), a = bag(after);
  for (var k in b) { if (!a[k]) return false; }
  return true;
}

// Does this recipe's Serves look wrong? CSV imports routinely landed on 1
// because the source's quantity column was blank or unparseable. Flag only —
// a guessed serves silently rescales every amount in the recipe, so the number
// is never changed without Cathal typing it.
function tidyServesLooksWrong(r) {
  if (!r || (r.servings || 1) > 1) return false;
  var ings = (r.ingredients || []).filter(function(i){ return !isHeaderIng(i); });
  if (ings.length < 5) return false;
  return ings.some(function(i){
    var a = i.amount, u = i.unit;
    if (a == null) return false;
    if ((u === "g" || u === "ml") && a >= 300) return true;
    if ((u === "kg" || u === "l") && a >= 1) return true;
    if ((u === "can" || u === "tin") && a >= 2) return true;
    if (u === "clove" && a >= 3) return true;
    return false;
  });
}

// Build the full proposal for one recipe.
function tidyRecipeProposal(r) {
  var lines = (r.ingredients || []).map(function(ing){ return tidyIngredient(ing); });
  return {
    id: r.id,
    name: r.name || "(untitled)",
    // The stamp the review was built against. Reviewing 60 recipes takes
    // minutes, and a partner's edit can land in the middle of it — see the
    // staleness check in applyTidyLines.
    updated: r.updated || 0,
    method: r.method || "",   // shown in the expanded card: you can't judge an ingredient blind
    servings: r.servings || 1,
    servesFlag: tidyServesLooksWrong(r),
    lines: lines,
    changedCount: lines.filter(function(l){ return l.ok && l.changed; }).length,
    flagCount: lines.filter(function(l){ return !l.ok; }).length
  };
}

// UK/US names for the same product. Used ONLY to PROPOSE a merge in step two
// of the tidy screen — never applied on its own, because some of these pairs
// are genuinely ambiguous in a British kitchen: "coriander" on a UK shelf is
// the ground seed while "cilantro" is always the leaf, so folding them
// together can be flat wrong. A group formed this way is labelled as a
// spelling variant and starts on "leave as they are".
var TIDY_SYNONYMS = [
  ["coriander","cilantro"], ["aubergine","eggplant"], ["courgette","zucchini"],
  ["spring onion","scallion"], ["rocket","arugula"], ["prawn","shrimp"],
  ["chickpea","garbanzo bean"], ["plain flour","all purpose flour"],
  ["caster sugar","superfine sugar"], ["bicarbonate of soda","baking soda"],
  ["tomato puree","tomato paste"], ["double cream","heavy cream"],
  ["beetroot","beet"], ["swede","rutabaga"], ["mangetout","snow pea"]
];
// The buyable part of an ingredient name — what's left once the bracket the
// tidy pass wrote is taken back off.
function tidyBaseName(name) {
  return String(name || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}
function tidyMergeKey(base) {
  var k = groceryNameKey(base);
  TIDY_SYNONYMS.forEach(function(p){
    var re = new RegExp("(^|\\s)" + p[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|\\s)");
    if (re.test(k)) k = k.replace(re, "$1" + p[0] + "$2");
  });
  return k;
}
// Find products written more than one way across the whole book. Two sources:
// names that already fold to the same grocery key (pure spelling/plural
// differences), and names joined by the synonym table above. Anything else is
// left well alone — "Coriander" and "Fresh coriander" are different products
// on a shelf, and merging by word-overlap would wreck exactly that case.
function tidyNameGroups(rb) {
  var byKey = {};
  (rb || []).forEach(function(r){
    (r.ingredients || []).forEach(function(ing){
      if (isHeaderIng(ing)) return;
      var base = tidyBaseName(ing.name);
      if (!base) return;
      var mk = tidyMergeKey(base);
      if (!mk) return;
      var g = byKey[mk] || (byKey[mk] = { key: mk, names: {}, exact: {} });
      g.names[base] = (g.names[base] || 0) + 1;
      g.exact[groceryNameKey(base)] = true;
    });
  });
  var out = [];
  Object.keys(byKey).forEach(function(k){
    var g = byKey[k];
    var variants = Object.keys(g.names);
    if (variants.length < 2) return;
    variants.sort(function(a, b){ return g.names[b] - g.names[a] || a.localeCompare(b); });
    out.push({
      key: k,
      variants: variants.map(function(n){ return { name: n, count: g.names[n] }; }),
      viaSynonym: Object.keys(g.exact).length > 1
    });
  });
  out.sort(function(a, b){ return b.variants.length - a.variants.length || a.key.localeCompare(b.key); });
  return out;
}

// Spelling pairs where a recipe and a shopping list legitimately disagree.
// Matching only — the displayed name is never rewritten. Keep this short and
// only add pairs that have actually caused a duplicate on the list.
var GROCERY_SPELLINGS = [[/yoghurt/g, "yogurt"], [/chilli/g, "chili"], [/&/g, "and"]];

// The key two names are matched on. Case-, punctuation- and plural-insensitive
// so a recipe's "egg" lands on the existing "Eggs" instead of beside it. Both
// sides of every comparison go through this, so the folding is symmetric —
// an imperfect singular ("oats" → "oat") still matches itself.
function groceryNameKey(name) {
  var k = String(name || "").toLowerCase().replace(/[^a-z0-9\s&]/g, " ").replace(/\s{2,}/g, " ").trim();
  GROCERY_SPELLINGS.forEach(function(p){ k = k.replace(p[0], p[1]); });
  k = k.split(" ").map(function(w){
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";        // berries → berry
    if (w.length > 4 && /oes$/.test(w)) return w.slice(0, -2);              // tomatoes → tomato
    if (w.length > 4 && /(s|sh|ch|x|z)es$/.test(w)) return w.slice(0, -2);  // boxes → box
    if (w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1); // eggs → egg
    return w;
  }).join(" ").replace(/\s{2,}/g, " ").trim();
  return k;
}

// The recipe writes at most ONE line into an item's note, and the line no
// longer names the recipe (v364) — the item's own recipe chip already does,
// so "200 g for Chickpea curry" was saying it twice. Without that suffix the
// line is no longer self-identifying, so the exact text is remembered in
// `item._recipeNote` and removed by value when the recipe is re-added,
// re-tagged or cleared. Like `_recipePrev`/`_recipeAdded` this bookkeeping
// field deliberately rides along into storage/sync/export: the clear/revert
// flow has to survive a reload.
// `tag` is still taken so a note written by v363 ("… for <recipe>") is
// recognised and cleaned up on the next add — those notes exist on devices
// that ran the pre-release test link.
function stripRecipeNote(notes, tag, own) {
  var legacy = tag ? " for " + tag : "";
  return String(notes || "").split("\n").filter(function(l){
    if (own && l === own) return false;
    if (legacy && l.slice(-legacy.length) === legacy) return false;
    return true;
  }).join("\n").replace(/\n{2,}/g, "\n").trim();
}
// Replace this recipe's note line on an item, in place. Pass an empty detail
// to remove it and leave any note the user typed themselves untouched.
function setRecipeNote(item, tag, detail) {
  if (!item) return;
  var base = stripRecipeNote(item.notes, tag, item._recipeNote);
  var next = detail ? (base ? base + "\n" + detail : detail) : base;
  if (next) item.notes = next; else if (item.notes) item.notes = "";
  if (detail) item._recipeNote = detail; else delete item._recipeNote;
}

// ── Per-ingredient shopping preferences (v368) ─────────────────────────────
// Two optional fields can sit on a recipe ingredient, both set from the
// "Add to grocery list" review screen and both remembered for every later add:
//   groceryName — the name to buy it under, when the recipe's own wording is
//                 not what you want to read on the shopping list;
//   noBuy       — a staple you never need to shop for (olive oil, salt).
// They ride inside recipe.ingredients[] and so sync/export with the
// fl4_recipebook whole-record merge — no new plumbing anywhere.
// groceryName deliberately does NOT rewrite the recipe's own line: the recipe
// keeps its full wording (amount, brackets, prep clause) and only the shopping
// name changes, so a rename can never lose detail out of the recipe.
function recipeGroceryName(ing, sp) {
  if (!ing) return "";
  var own = String(ing.groceryName || "").trim();
  if (own) return own;
  var s = sp || splitGroceryName(ing.name, ing.amount != null);
  return s.name || String(ing.name || "").trim();
}
// Anything that re-parses a recipe's ingredient TEXT (the editor textarea, the
// tidy pass) builds fresh plain objects from each line and would silently drop
// the two fields above — the same "object rebuilt from a hand-typed field
// list" class as the babySex incident. Match the new lines back onto the old
// ingredients and carry the preferences across. Matching is on the shopping
// key, so re-wording a line ("200g mushrooms" → "200 g Mushrooms") keeps them.
function carryGroceryPrefs(next, prev) {
  if (!next || !next.length || !prev || !prev.length) return next;
  var by = {};
  prev.forEach(function(ing){
    if (!ing || isHeaderIng(ing)) return;
    if (!ing.groceryName && !ing.noBuy) return;
    // Keyed on BOTH the derived name and any override, so the preference is
    // found whether the edited line still reads like the recipe's original
    // wording or has been brought into line with the shopping name.
    var k1 = groceryNameKey(splitGroceryName(ing.name, ing.amount != null).name || ing.name);
    var k2 = groceryNameKey(recipeGroceryName(ing));
    if (k1 && !(k1 in by)) by[k1] = ing;
    if (k2 && !(k2 in by)) by[k2] = ing;
  });
  next.forEach(function(ing){
    if (!ing || isHeaderIng(ing)) return;
    var k = groceryNameKey(splitGroceryName(ing.name, ing.amount != null).name || ing.name);
    var src = k ? by[k] : null;
    if (!src) return;
    if (src.groceryName) ing.groceryName = src.groceryName;
    if (src.noBuy) ing.noBuy = true;
  });
  return next;
}
// The amount label that would land on the grocery list for this ingredient at
// multiplier m. Shared by the push itself and the review screen's preview, so
// the two can never disagree about what is about to be bought.
// Scale whatever we ended up with: the parser's own amount when it found one,
// otherwise the amount/unit splitGroceryName recovered from the name. Either
// way it goes through scaleIngredient, so it doubles when the recipe doubles.
// Returns "" when there is no clean amount → callers fall back to name-only.
function groceryAmtLabel(ing, m, sp) {
  if (!ing) return "";
  var s = sp || splitGroceryName(ing.name, ing.amount != null);
  var eff = ing;
  if (ing.amount == null && s.amount != null) eff = { name: ing.name, amount: s.amount, unit: s.unit, approx: ing.approx, amountMax: ing.amountMax };
  else if (ing.amount != null && !ing.unit && s.unit) eff = { name: ing.name, amount: ing.amount, unit: s.unit, approx: ing.approx, amountMax: ing.amountMax };
  function ascii(x){ return String(x).replace(/¼/g,"1/4").replace(/⅓/g,"1/3").replace(/½/g,"1/2").replace(/⅔/g,"2/3").replace(/¾/g,"3/4"); }
  var sc = scaleIngredient(eff, m);
  if (sc && sc.amount && sc.amount !== "0") {
    var a = ascii(sc.amount) + (sc.amountMax ? "-" + ascii(sc.amountMax) : "");
    return (ing.approx ? "~" : "") + a + (sc.unit ? " " + sc.unit : "");
  }
  // An unscalable literal quantity ("1/2 thumb size") stands in for the
  // amount, but only at base servings — same honesty rule as bracket text.
  if (s.qty && m === 1) return s.qty;
  return "";
}

// Push a Recipes-section recipe onto the Grocery list.
// Tag = recipe name, so the batch clears/reverts as a group exactly like the
// grocery CSV import. Also saves a reusable saved-recipe chip in fl4_recipes at
// the recipe's BASE servings. Targets grocery directly (not currentList) so it
// works no matter which section is open. Names go through cleanGroceryName and
// match on groceryNameKey (v363) so an ingredient lands ON an existing entry
// instead of beside it; the amount rides in the amount chip (new items) and in
// the item note (always, so a matched item still shows how much is needed).
// quiet (v317, optional): suppress the toast and skip nothing else — the
// week-planner batch caller shows one combined toast instead. Returns
// {added, tagged} counts (null when there was nothing to add).
function addRecipeToGroceries(recipe, mult, quiet) {
  if (!recipe) return null;
  var m = (typeof mult === "number" && mult > 0) ? mult : 1;
  var tag = (recipe.name || "").trim();
  // noBuy (v368): a line ticked off in the review screen as something you
  // never shop for is skipped on EVERY path — the single-recipe add, the week
  // planner and the roll-over banner all come through here.
  var ings = (recipe.ingredients || []).filter(function(ing){ return ing && ing.name && String(ing.name).trim() && !isHeaderIng(ing) && !ing.noBuy; }).map(rescueIngredientMeasure);
  // v363: names are cleaned here, not at the call site, so the saved chip
  // below stores buyable names too (it is re-imported through the quick-import
  // path, which would otherwise re-introduce the raw name).
  // v368: a groceryName saved on the ingredient wins over the derived name.
  var names = ings.map(function(ing){ return recipeGroceryName(ing); });
  if (!tag || !names.length) { if (!quiet) toast("No ingredients to add"); return null; }

  var d = loadListData("grocery");
  var items = d.items;
  var byName = {};
  items.forEach(function(it){ if (it){ var k = groceryNameKey(it.name); if (k && !(k in byName)) byName[k]=it; } });

  // Grocery-specific category detection (detectCat() is bound to currentList).
  function gcat(name){
    if (!name) return "other";
    var low = name.toLowerCase();
    for (var i=0;i<GROCERY_KW.length;i++){ if (low.indexOf(GROCERY_KW[i][0])!==-1) return GROCERY_KW[i][1]; }
    return "other";
  }
  // The amount label (scaled, ASCII-only, ranges as "4-6 tbsp") is built by
  // the shared top-level groceryAmtLabel so the review screen can preview
  // exactly what will land here.
  // The note line's amount detail: the scaled amount, plus whatever bracketed
  // measure cleanGroceryName stripped out of the name, plus any prep clause
  // splitGroceryName recovered. Both of those are verbatim from the recipe, so
  // the bracket is only true at BASE servings and is dropped when scaling.
  // A `detail` from splitGroceryName REPLACES the lot: "Juice of 1 lemon"
  // already states the amount, so prefixing it with "1 " reads badly.
  // amtInChip (v364): when the amount is going into the item's own Amount
  // field there is no point repeating it in the note, so it is left out.
  // A matched existing item keeps ITS amount chip untouched, so there the
  // note is the only place the recipe's amount can appear and it stays.
  function amtDetail(ing, amt, sp, amtInChip){
    if (sp && sp.detail) return sp.detail;
    var bits = [];
    if (amt && !amtInChip) bits.push(amt);
    if (m === 1) {
      // A compound sum's original phrasing ("1 3/4 cup + 2 tbsp") is only
      // true at base servings, same as the bracket text below — at any
      // other multiplier the scaled `amt` above already says what's needed.
      if (ing._compoundNote) bits.push(ing._compoundNote);
      else {
        // Any bracket, not just one holding a measure (v366). Before the tidy
        // pass a digit-free bracket was usually junk; after it, the bracket is
        // where every prep instruction deliberately lives — "Garlic (minced)"
        // has to reach the note or tidying a recipe would quietly lose the
        // wording that used to come through as a trailing comma clause.
        var br = String(ing.name || "").match(/\(([^)]+)\)/);
        if (br && br[1].trim()) bits.push("(" + br[1].trim() + ")");
      }
    }
    if (sp && sp.prep) bits.push(sp.prep);
    return bits.join(" ");
  }

  var added = 0, tagged = 0;
  ings.forEach(function(ing){
    var sp = splitGroceryName(ing.name, ing.amount != null);
    var clean = recipeGroceryName(ing, sp);
    var key = groceryNameKey(clean);
    var existing = key ? byName[key] : null;
    var amt = groceryAmtLabel(ing, m, sp);
    if (existing) {
      // Never touch an existing item's NAME — that is text Cathal typed. Its
      // Amount field is filled only when EMPTY (v364): a recognised amount
      // belongs in the Amount field wherever it can go, but an amount already
      // written there wins and the recipe's rides in the note instead.
      // Everything changed here is snapshotted first so Clear restores it.
      if (!existing._recipePrev) {
        existing._recipePrev = { done: !!existing.done, catId: existing.catId, recipe: existing.recipe || null,
                                 notes: existing.notes || "", amount: existing.amount || "" };
      }
      existing.recipe = tag;
      existing._recipeAdded = false;        // pre-existed: restore on clear, don't delete
      var _recRevived = false;
      if (existing.done) { _recRevived = !reviveWasMisclick(existing); existing.done = false; existing.added = Date.now(); } // revived = recently added (v325)
      // The snapshot is taken before the first change, so an empty amount in
      // it means the recipe owns this field — a re-add refreshes it (servings
      // may have changed) and the note still leaves the amount out. Without
      // this, re-adding would see its own amount as one Cathal typed.
      var ownsAmt = existing._recipePrev && existing._recipePrev.amount === "";
      var filledAmt = false;
      if (amt && (!existing.amount || ownsAmt)) { existing.amount = amt; filledAmt = true; }
      setRecipeNote(existing, tag, amtDetail(ing, amt, sp, filledAmt));
      existing.updated = Date.now();
      existing.catId = gcat(clean);
      // v406: reviving a done item off a recipe is a re-add, same as the new-item
      // branch below. Uses the item's own name (grocery matching is fuzzy, so
      // `clean` can differ) and runs after catId settles.
      if (_recRevived) addToHistFor("grocery", existing.name, existing.catId);
      tagged++;
    } else {
      var catId = gcat(clean);
      var rec = { id: Date.now() + Math.floor(Math.random()*10000), name: clean, catId: catId, done: false, addedBy: hearthUser, recipe: tag, _recipeAdded: true, updated: Date.now(), added: Date.now() };
      // Snapshot amount:"" from creation so a later re-add at different
      // servings knows this field is recipe-owned (see ownsAmt above) and
      // refreshes it, instead of mistaking the recipe's own first value for
      // something Cathal typed.
      rec._recipePrev = { done: false, catId: catId, recipe: null, notes: "", amount: "" };
      if (amt) rec.amount = amt;            // new items carry the scaled amount
      // Only what the Amount field cannot say: the bracketed measure, a prep
      // instruction, or the "Juice of 1 lemon" style original line.
      setRecipeNote(rec, tag, amtDetail(ing, amt, sp, !!amt));
      items.unshift(rec);
      if (key) byName[key] = rec;
      addToHistFor("grocery", clean, catId);
      added++;
    }
  });

  // Save grocery list directly (saveCurrentList() is bound to currentList).
  storeSet(LIST_CONFIG.grocery.key, d);
  pushPersonal();
  if (isHouseholdSet() && isSynced("grocery")) pushHousehold();

  // Update the reusable saved-recipe chip quietly, at BASE servings, names only.
  var saved = storeGet("fl4_recipes") || [];
  var si = saved.findIndex(function(x){ return x && x.name && x.name.toLowerCase() === tag.toLowerCase(); });
  var srec = { name: tag, lines: names, updated: Date.now() };
  if (si >= 0) saved[si] = srec; else saved.unshift(srec);
  storeSet("fl4_recipes", saved);

  if (currentList === "grocery") renderList();
  if (!quiet) {
    var msg = "&#x1F6D2; Added " + added + " to Grocery";
    if (tagged) msg += ", tagged " + tagged + " existing";
    toast(msg);
  }
  return { added: added, tagged: tagged };
}

// Add every dinner planned in the next-7-day window to the grocery list.
// Groups assignments by recipe and SUMS servings across days (spag bol on
// Mon + Thu at 4 each → one addRecipeToGroceries call at 8 servings), then
// reuses the existing per-recipe flow — no new grocery/merge logic here.
// Known, deliberate limit: when two DIFFERENT recipes share an ingredient
// already on the list, the existing merge re-tags it but never sums
// amounts (that's the Phase 3 pack-quantities question, on hold).
function addWeekToGroceries() {
  var now = new Date();
  var startDay = now.getFullYear() + "-" + t2(now.getMonth()+1) + "-" + t2(now.getDate());
  var endD = new Date(now); endD.setDate(now.getDate() + 6);
  var endDay = endD.getFullYear() + "-" + t2(endD.getMonth()+1) + "-" + t2(endD.getDate());
  var rb = getRecipeBook();
  var servingsByRecipe = {};
  getMealPlan().forEach(function(e){
    if (!e || e.recipeId == null || typeof e.day !== "string") return;
    if (e.day < startDay || e.day > endDay) return;
    var r = rb.find(function(x){ return x && x.id === e.recipeId; });
    if (!r) return; // recipe deleted since it was planned — the planner row shows that state
    servingsByRecipe[e.recipeId] = (servingsByRecipe[e.recipeId] || 0) + (e.servings || r.servings || 1);
  });
  var ids = Object.keys(servingsByRecipe);
  if (!ids.length) { toast("No planned dinners to add"); return; }
  var totAdded = 0, totTagged = 0, nRecipes = 0;
  ids.forEach(function(k){
    var rid = Number(k);
    var r = rb.find(function(x){ return x && x.id === rid; });
    if (!r) return; // guard: never index on a failed find
    var res = addRecipeToGroceries(r, servingsByRecipe[k] / (r.servings || 1), true);
    if (res) { totAdded += res.added; totTagged += res.tagged; nRecipes++; }
  });
  var msg = "&#x1F6D2; " + nRecipes + (nRecipes === 1 ? " recipe" : " recipes") + ": " + totAdded + " added";
  if (totTagged) msg += ", " + totTagged + " already on the list";
  toast(msg);
}

// Seed the first recipe once
function seedRecipes() {
  var rb = getRecipeBook();
  if (rb.length) return;
  rb.push({
    id: Date.now(),
    name: "Iced Coffee",
    servings: 1,
    ingredients: [
      { amount: 2,    unit: "tsp",   name: "instant coffee (dark roast if you have it)" },
      { amount: 2,    unit: "tbsp",  name: "warm water (just to dissolve)" },
      { amount: 150,  unit: "ml",    name: "milk of choice (oat or lactose-free)" },
      { amount: 8,    unit: "cube",  name: "ice cubes", approx: true },
      { amount: 1,    unit: "tsp",   name: "maple syrup or honey" },
      { amount: 0.25, unit: "tsp",   name: "vanilla extract (gluten-free)" },
      { amount: 1,    unit: "pinch", name: "salt" }
    ],
    method: "Dissolve the coffee in the warm water until smooth, then blend everything on high for 30–40 seconds until slushy — stop the moment it's smooth so the oat milk doesn't go gluey. Drink upright.",
    notes: ""
  });
  saveRecipeBook(rb);
}

// ── Unit + scaling helpers ──
// Spoon/volume/weight units keep their unit and just scale the number.
// Cups convert to grams (dry goods, by ingredient) or ml (liquids).
var _SPOON_KEEP = { tsp:1, tbsp:1, ml:1, l:1, g:1, kg:1 };
// Approx grams per 1 cup for common dry ingredients (keyword match on name)
var _CUP_GRAMS = [
  ["self-raising flour",120],["self raising flour",120],["plain flour",120],["flour",120],
  ["icing sugar",125],["powdered sugar",125],["caster sugar",220],["brown sugar",220],["sugar",200],
  ["rolled oats",90],["oats",90],["cocoa",100],["butter",225],["rice",185],
  ["breadcrumbs",108],["chocolate chips",175],["chocolate",175],["raisins",145],
  ["almonds",140],["nuts",140],["desiccated coconut",80],["coconut",80]
];
var _CUP_ML = 240;

function fmtFraction(n) {
  var whole = Math.floor(n);
  var frac = n - whole;
  var map = [[0,""],[0.25,"¼"],[0.333,"⅓"],[0.5,"½"],[0.667,"⅔"],[0.75,"¾"],[1,""]];
  var best = map[0], bestD = Math.abs(frac - map[0][0]);
  for (var i=1;i<map.length;i++){ var d=Math.abs(frac-map[i][0]); if(d<bestD){bestD=d;best=map[i];} }
  if (best[0] === 1) { whole += 1; best = map[0]; }
  if (bestD > 0.08) { var v = Math.round(n*10)/10; return String(v); }
  if (whole === 0 && best[1] === "") return "0";
  if (whole === 0) return best[1];
  return whole + (best[1] ? " " + best[1] : "");
}
function fmtNumber(n) {
  var r = Math.round(n*100)/100;
  if (r % 1 === 0) return String(r);
  return fmtFraction(r);
}
function roundMetric(v) { return v >= 100 ? Math.round(v/5)*5 : Math.round(v); }

// Approx grams per US cup for common dry/weighable ingredients.
// If the ingredient name matches, cups convert to grams; otherwise to millilitres.
function cupToGrams(name) {
  var n = (name||"").toLowerCase();
  var table = [
    ["icing sugar",120],["powdered sugar",120],["brown sugar",220],["caster sugar",200],
    ["granulated sugar",200],["sugar",200],["self-raising flour",120],["self raising flour",120],
    ["plain flour",120],["bread flour",127],["wholemeal flour",120],["flour",120],
    ["butter",227],["rolled oats",90],["oats",90],["rice",185],["cocoa",100],
    ["breadcrumbs",108],["ground almond",96],["almonds",143],["almond",96],
    ["chocolate chip",170],["chocolate",170],["honey",340],["maple syrup",322],
    ["yogurt",245],["yoghurt",245],["cream cheese",225],["grated cheese",100],["cheese",113]
  ];
  for (var i=0;i<table.length;i++){ if(n.indexOf(table[i][0])!==-1) return table[i][1]; }
  return null;
}

// Format one already-scaled amount for a given unit + ingredient name. Rule:
// tsp/tbsp always stay tsp/tbsp; ml stays ml; cups convert to g (dry) or ml
// (liquid); counts/pinches/cubes scale as whole numbers. Factored out of
// scaleIngredient so a range's amountMax can be run through the exact same
// per-unit formatting as its amount.
function formatScaledAmount(unit, amt, name) {
  if (unit === "tsp" || unit === "tbsp") {
    return { amount: fmtFraction(amt), unit: unit };
  }
  if (unit === "ml") {
    var mlR = amt >= 100 ? Math.round(amt/5)*5 : Math.round(amt);
    return { amount: String(mlR), unit: "ml" };
  }
  if (unit === "l") {
    return { amount: fmtNumber(amt), unit: "l" };
  }
  if (unit === "cup" || unit === "cups") {
    var gpc = cupToGrams(name);
    if (gpc != null) {
      var grams = amt * gpc;
      var gR = grams >= 100 ? Math.round(grams/5)*5 : Math.round(grams);
      return { amount: String(gR), unit: "g" };
    }
    var ml = amt * 240;
    var mlc = ml >= 100 ? Math.round(ml/5)*5 : Math.round(ml);
    return { amount: String(mlc), unit: "ml" };
  }
  if (unit === "g")  return { amount: fmtNumber(amt), unit: "g" };
  if (unit === "kg") return { amount: fmtNumber(amt), unit: "kg" };
  if (unit === "oz") return { amount: fmtNumber(amt), unit: "oz" };
  if (unit === "lb") return { amount: fmtNumber(amt), unit: "lb" };
  // Count-style units pluralise on scaling
  var countUnits = { pinch:["pinch","pinches"], cube:["cube","cubes"], clove:["clove","cloves"],
                     can:["can","cans"], tin:["tin","tins"], slice:["slice","slices"], piece:["piece","pieces"],
                     // v366: count words that were being left stranded in the
                     // NAME instead of scaling — "2 scoops vanilla protein
                     // powder" was Cathal's own reported case.
                     scoop:["scoop","scoops"], rasher:["rasher","rashers"],
                     sprig:["sprig","sprigs"], bunch:["bunch","bunches"], stick:["stick","sticks"] };
  if (countUnits[unit]) {
    var nWhole = Math.round(amt*100)/100;
    var disp = fmtNumber(amt);
    var plural = nWhole !== 1;
    return { amount: disp, unit: countUnits[unit][plural ? 1 : 0] };
  }
  return { amount: fmtNumber(amt), unit: unit || "" };
}
// Given an ingredient and a scale multiplier, return the display amount + unit.
// When the ingredient carries amountMax (a range, e.g. "2-3 tbsp"), the
// returned unit follows the TOP of the range ("1-2 cloves", not "1-2 clove") —
// non-range ingredients are unaffected, same single-amount result as before.
function scaleIngredient(ing, mult) {
  var unit = ing.unit;
  var min = formatScaledAmount(unit, (ing.amount || 0) * mult, ing.name);
  var result = { amount: min.amount, unit: min.unit };
  if (ing.amountMax != null) {
    var max = formatScaledAmount(unit, ing.amountMax * mult, ing.name);
    result.amountMax = max.amount;
    result.unit = max.unit;
  }
  return result;
}

var _recipeView = "list";   // "list" | "detail" | "plan"
var _recipeEditing = false; // true while the recipe editor is open — suppresses sync re-renders that would discard unsaved input
var _recipeOpenId = null;
var _recipeServings = 1;
var _recipeSelectMode = false;  // bulk-categorise selection mode
var _recipeSelected = {};       // id -> true while selected

// ── Cook-along ticks (v405) ────────────────────────────────────────────────
// Tapping an ingredient line or a Prep/Method step in the detail view greys it
// out, so a phone propped on the counter shows where you are. Deliberately
// NOT stored on the recipe and NOT synced: this is "where am I in tonight's
// cook", not a property of the recipe, and a partner opening the same recipe
// should not see half of it struck through. Keys are positional
// ("i3", "p0", "m2") so a re-render — a servings change, a favourite toggle,
// an incoming sync push — repaints the same ticks instead of losing them.
var _recipeDone = {};           // key -> true, for the recipe in _recipeDoneId
var _recipeDoneId = null;       // which recipe the ticks above belong to
var _recipeTickWired = false;   // #recipesContent is permanent — wire its delegated click listener once

// Called on every deliberate open of a recipe, which is what "everything
// resets when you re-enter" means. Leaving the Recipes tab and coming back
// does NOT pass through here, so a glance at the calendar mid-cook keeps your
// place; renderRecipeDetail's id check catches every other way in.
function resetRecipeTicks(id) { _recipeDone = {}; _recipeDoneId = (id == null ? null : id); _recipeFocusKey = undefined; _recipeDoneClassic = null; }

// Recipe Focus mode (vNNN) — a display layer over the ticks above, confirmed
// design 12/08/2026 (see HEARTH-notes.md). No new stored data on a recipe:
// the on/off flag is device-local (fl4_cookfocus, never synced or exported)
// and the cursor is memory-only, living and dying with _recipeDone above.
var _recipeFocusOn = storeGet("fl4_cookfocus") === true;
// Turning Focus ON stashes whatever classic ticks were on the recipe here and
// starts _recipeDone fresh, so Focus always begins from nothing — and since
// v423 it stays at nothing, because no Focus tap ticks. Turning Focus
// OFF restores this stash. Cathal's ask (12/08/2026): entering Focus should
// clear ticks visibly, but classic ticks must survive a round trip through
// Focus and back. null while classic ticks are the live _recipeDone (i.e.
// whenever Focus is off) — only holds a value while Focus is on.
var _recipeDoneClassic = null;
// undefined = not yet initialised for the current recipe entry (set fresh by
// resetRecipeTicks); null = no line highlighted (finished, deliberately no
// wrap); a string = the highlighted line's data-tk key.
var _recipeFocusKey;

// Page order comes free from the DOM — ingredients render before Prep/Method,
// so the first [data-tk] node is always an ingredient. Never derive order
// from the "i"/"p"/"m" key prefixes instead.
function recipeFocusNodes() {
  var root = document.getElementById("recipesContent");
  return root ? Array.prototype.slice.call(root.querySelectorAll("[data-tk]")) : [];
}
// The cursor is pure page position (v423): a Focus tap never ticks anything,
// so _recipeDone is empty for the whole session and there is no "skip the
// already-done ones" search to do. null past the last node — deliberately no
// wrap back to a line you jumped over.
function recipeFocusKeyAt(nodes, index) {
  var n = nodes[index || 0];
  return n ? n.getAttribute("data-tk") : null;
}
// Re-stamps rcp-now on the current [data-tk] nodes rather than re-rendering,
// same reason as the v405 tick listener: a tap must never move the page
// under your hands. Called after every renderRecipeDetail AND after every
// focus tap — never scrolls itself (see recipeFocusScrollIntoViewIfNeeded).
function stampRecipeFocus() {
  var root = document.getElementById("recipesContent");
  if (!root) return;
  root.classList.toggle("rcp-focusing", _recipeFocusOn);
  var nodes = recipeFocusNodes();
  for (var i = 0; i < nodes.length; i++) {
    var isNow = _recipeFocusOn && nodes[i].getAttribute("data-tk") === _recipeFocusKey;
    nodes[i].classList.toggle("rcp-now", isNow);
    if (isNow) nodes[i].setAttribute("aria-current", "step");
    else nodes[i].removeAttribute("aria-current");
  }
}
// Only called from a tap or the Focus toggle, never from renderRecipeDetail
// itself — otherwise a servings tap or an incoming sync push would yank the
// page (the same v405 lesson the tick listener above was built around).
function recipeFocusScrollIntoViewIfNeeded() {
  if (!_recipeFocusOn || _recipeFocusKey == null) return;
  var node = document.querySelector('#recipesContent [data-tk="' + _recipeFocusKey + '"]');
  if (!node) return;
  var r = node.getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight) node.scrollIntoView({ block: "center", behavior: "smooth" });
}

var _recipeFilter = "fav"; // "all" | "fav" | category name — opens on Favourites by default (falls back to "all" in renderRecipes if none are favourited)
var _recipeSearchQuery = "";
var _recipeSearchPreset = false; // v387: set by openRecord right before switchSection("recipes") so its v386 arrival-reset leaves a deliberate global-search hand-off alone
var _recipeScrollPos = 0;
// Everything a recipe search should look at, lowercased once (v383). Kept
// top-level because renderRecipes() calls it — a locally scoped helper is the
// classic breakage in this file. Ingredient text covers both the written name
// and any grocery-name override, so "which recipe used chorizo?" works.
function recipeSearchText(r) {
  if (!r) return "";
  var ings = (r.ingredients || []).map(function(i){
    return i ? ((i.name || "") + " " + (i.groceryName || "")) : "";
  }).join(" ");
  return ((r.name || "") + " " + (r.notes || "") + " " + (r.category || "") + " " +
          (r.prep || "") + " " + (r.method || "") + " " + ings).toLowerCase();
}
// v506: Favourites order — most-opened first, then A–Z. The counts live in
// fl4_recipe_opens ({recipeId: n}), DEVICE-LOCAL: not synced, not exported.
// Deliberately NOT a field on the recipe — bumping r.updated on every open
// would let a mere glance on one phone beat the partner's real edit in the
// newest-wins recipe merge. Each device orders by its own use.
function getRecipeOpens() { var o = storeGet("fl4_recipe_opens"); return (o && typeof o === "object" && !Array.isArray(o)) ? o : {}; }
function noteRecipeOpened(id) {
  if (id == null) return;
  var o = getRecipeOpens();
  o[id] = (+o[id] || 0) + 1;
  storeSet("fl4_recipe_opens", o);
}
function sortRecipesByUse(list) {
  var o = getRecipeOpens();
  return list.slice().sort(function(a, b){
    var d = (+o[b.id] || 0) - (+o[a.id] || 0);
    if (d) return d;
    return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
  });
}
function renderRecipes() {
  _recipeEditing = false; // reaching the list/detail dispatcher means the editor isn't open
  seedRecipes();
  if (_recipeView === "detail" && _recipeOpenId != null) { renderRecipeDetail(); return; }
  if (_recipeView === "plan") { renderMealPlanner(); return; }
  if (_recipeView === "tidy") { renderRecipeTidy(); return; }
  if (_recipeView === "prephelper") { renderPrepHelper(); return; }
  if (_recipeView === "calhelper") { renderCalHelper(); return; }
  if (_recipeView === "duplicates") { renderDupRepair(); return; }
  if (_recipeView === "grocerypick") { renderGroceryPick(); return; }
  var el = document.getElementById("recipesContent");
  var rb = getRecipeBook();
  if (!rb.length) {
    el.innerHTML = "<div style='text-align:center;color:#8A7A5A;padding:40px 20px'><div style='font-size:40px;margin-bottom:10px'>&#x1F37D;</div><div style='font-size:16px;font-weight:600;margin-bottom:4px'>No recipes yet</div><div style='font-size:13px'>Tap + or &#x22EF; &rarr; Import.</div></div>";
    return;
  }
  // Collect categories in use
  var cats = [];
  rb.forEach(function(r){ var c=(r.category||"").trim(); if(c && cats.indexOf(c)===-1) cats.push(c); });
  cats.sort();
  var hasFav = rb.some(function(r){ return r.fav; });
  if (_recipeFilter === "fav" && !hasFav) _recipeFilter = "all"; // default-to-fav fallback: never open on an empty list

  // Filter bar
  var bar = "<div style='display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px'>";
  function chip(key,label){
    var on = _recipeFilter === key;
    return "<button class='rcp-filter' data-key='" + esc(key).replace(/'/g,"&#39;") + "' style='border:1.5px solid " + (on?"#B5651D":"#E0D0B8") + ";background:" + (on?"#B5651D":"#fff") + ";color:" + (on?"#fff":"#7A5A30") + ";border-radius:14px;padding:5px 13px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer'>" + label + "</button>";
  }
  bar += chip("all","All");
  if (hasFav) bar += chip("fav","&#x2605; Favourites");
  cats.forEach(function(c){ bar += chip(c, esc(c)); });
  bar += "</div>";

  // Filter the list
  var shown = rb.filter(function(r){
    if (_recipeFilter === "all") return true;
    if (_recipeFilter === "fav") return !!r.fav;
    return (r.category||"").trim() === _recipeFilter;
  });
  if (_recipeFilter === "fav") shown = sortRecipesByUse(shown);
  // Recipe search (v383). Two changes that only work as a pair.
  // WIDER haystack: name+notes alone could not answer "which recipe used the
  // chorizo?" — ingredients, method and category are searched too now.
  // TIGHTER match: fuzzyMatch is a SUBSEQUENCE matcher, so "curry" matched any
  // text containing c..u..r..r..y ("slow cooker ... crusty bread, very yummy").
  // On a real-sized book that returned most of the shelf for a plain
  // recipe-name search, so the list looked as though it had not filtered at
  // all — the bug Cathal actually reported. Substring is now the primary
  // match; the fuzzy pass runs ONLY when substring finds nothing, and the list
  // says so on screen rather than quietly showing near-misses as if they were
  // hits. Widening without tightening would have made this markedly worse.
  var _rcpFuzzy = false;
  if (_recipeSearchQuery) {
    var _qLow = _recipeSearchQuery.toLowerCase();
    var _exact = shown.filter(function(r){ return recipeSearchText(r).indexOf(_qLow) !== -1; });
    if (_exact.length) {
      shown = _exact;
    } else {
      shown = shown.filter(function(r){ return fuzzyMatch(_recipeSearchQuery, recipeSearchText(r)); });
      _rcpFuzzy = shown.length > 0;
    }
  }

  var _selCount = Object.keys(_recipeSelected).filter(function(k){ return _recipeSelected[k]; }).length;
  var selectHdr;
  if (_recipeSelectMode) {
    selectHdr = "<div style='display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px'>" +
      "<button id='rcpSetCat'" + (_selCount?"":" disabled") + " style='flex:1;min-width:110px;padding:10px;border:none;border-radius:10px;background:" + (_selCount?"#B5651D":"#D8CEBC") + ";color:#fff;font-family:inherit;font-size:14px;font-weight:700;cursor:" + (_selCount?"pointer":"default") + "'>Set category (" + _selCount + ")</button>" +
      "<button id='rcpSetRot'" + (_selCount?"":" disabled") + " style='flex:1;min-width:110px;padding:10px;border:none;border-radius:10px;background:" + (_selCount?"#2D6B35":"#D8CEBC") + ";color:#fff;font-family:inherit;font-size:14px;font-weight:700;cursor:" + (_selCount?"pointer":"default") + "'>&#x1F501; In rotation (" + _selCount + ")</button>" +
      "<button id='rcpSelCancel' style='padding:10px 14px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Cancel</button>" +
    "</div>";
  } else {
    selectHdr = "<div style='display:flex;flex-wrap:wrap;gap:6px;justify-content:space-between;margin-bottom:10px'>" +
      "<button id='rcpPlanBtn' style='padding:6px 12px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:14px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer'>&#x1F4C5; Week plan</button>" +
      "<button id='rcpToolsBtn' style='padding:6px 12px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:14px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer'>&#x1F9F0; Tools</button>" +
    "</div>" +
    "<div class='overlay' id='rcpToolsOverlay'>" +
      "<div class='modal-box' style='position:relative'>" +
        "<button class='modal-close' id='rcpToolsClose' aria-label='Close'>&#x2715;</button>" +
        "<div class='modal-title'>&#x1F9F0; Tools</div>" +
        "<button id='rcpTidyBtn' class='more-row'><span class='more-ico'>&#x1F9F9;</span><span class='more-name'>Tidy</span></button>" +
        "<button id='rcpPrepBtn' class='more-row'><span class='more-ico'>&#x1F4DD;</span><span class='more-name'>Prep helper</span></button>" +
        "<button id='rcpCalBtn' class='more-row'><span class='more-ico'>&#x1F525;</span><span class='more-name'>Calories</span></button>" +
        "<button id='rcpSelStart' class='more-row'><span class='more-ico'>&#x2713;</span><span class='more-name'>Select</span></button>" +
      "</div>" +
    "</div>";
  }
  // A banner rather than a fifth toolbar button: duplicates are a one-off
  // repair, not a tool you reach for, and this disappears the moment the book
  // is clean. Same shape as the v362 "New week — plan dinners?" prompt.
  var dupBanner = "";
  if (!_recipeSelectMode) {
    var dupGroups = findDuplicateRecipes(rb);
    if (dupGroups.length) {
      var dupExtra = 0;
      dupGroups.forEach(function(g){ dupExtra += g.recipes.length - 1; });
      dupBanner =
        "<div style='display:flex;align-items:center;gap:10px;background:#FBF4E8;border:1px solid #E0C8A0;border-radius:12px;padding:11px 13px;margin-bottom:12px'>" +
          "<div style='flex:1;font-size:13px;color:#8A5A1A;line-height:1.45'>" +
            "<b>" + dupExtra + " duplicate recipe" + (dupExtra !== 1 ? "s" : "") + "</b> in your book." +
          "</div>" +
          "<button id='rcpDupBtn' style='flex:none;padding:7px 12px;border:1.5px solid #B5651D;background:#fff;color:#B5651D;border-radius:10px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer'>Review</button>" +
        "</div>";
    }
  }
  var html = selectHdr + dupBanner + bar;
  if (_rcpFuzzy) {
    html += "<div style='text-align:center;color:#9A7A4A;font-size:12px;padding:2px 10px 10px'>No exact matches &#x2014; showing similar.</div>";
  }
  if (!shown.length) {
    // Say WHY the list is empty (v383). A bare "Nothing here yet." under an
    // active search or a category chip reads as a broken app — that exact
    // misread is what sent v381 and v382 chasing the wrong bug twice.
    // No "fav" branch on purpose: the hasFav fallback above already flips an
    // empty Favourites filter to "all", so a bare empty favourites list is
    // unreachable here and a message for it would be dead code.
    var why = _recipeSearchQuery
      ? "No recipes match &#x201C;" + esc(_recipeSearchQuery) + "&#x201D;."
      : (_recipeFilter === "all" || _recipeFilter === "fav")
        ? "Nothing here yet."
        : "Nothing in &#x201C;" + esc(_recipeFilter) + "&#x201D; yet.";
    html += "<div style='text-align:center;color:#9A8A6A;padding:30px'>" + why + "</div>";
  } else {
    // Group by category when showing All; otherwise flat
    if (_recipeFilter === "all" && cats.length) {
      var groups = {};
      var uncat = [];
      shown.forEach(function(r){ var c=(r.category||"").trim(); if(c){(groups[c]=groups[c]||[]).push(r);} else uncat.push(r); });
      cats.forEach(function(c){
        if (!groups[c]) return;
        html += "<div style='font-size:12px;font-weight:700;color:#9A7A4A;text-transform:uppercase;letter-spacing:.5px;margin:6px 2px 8px'>" + esc(c) + "</div>";
        groups[c].forEach(function(r){ html += recipeCardHTML(r, _recipeSelectMode, !!_recipeSelected[r.id]); });
      });
      if (uncat.length) {
        html += "<div style='font-size:12px;font-weight:700;color:#9A7A4A;text-transform:uppercase;letter-spacing:.5px;margin:6px 2px 8px'>Uncategorised</div>";
        uncat.forEach(function(r){ html += recipeCardHTML(r, _recipeSelectMode, !!_recipeSelected[r.id]); });
      }
    } else {
      shown.forEach(function(r){ html += recipeCardHTML(r, _recipeSelectMode, !!_recipeSelected[r.id]); });
    }
  }
  el.innerHTML = html;

  el.querySelectorAll(".rcp-filter").forEach(function(b){
    b.addEventListener("click", function(){
      _recipeFilter = b.dataset.key;
      // v386: a chip tap while a search was active used to silently re-AND
      // the two, so a real match could read as "Nothing here yet." with no
      // clue why. v381 already resets the filter when search is OPENED;
      // this closes the other direction — a chip tap resets an active search.
      if (_recipeSearchQuery) {
        _recipeSearchQuery = "";
        var _rsi = document.getElementById("rcpSearchInput");
        var _rsr = document.getElementById("rcpSearchRow");
        if (_rsi) _rsi.value = "";
        if (_rsr) _rsr.style.display = "none";
      }
      renderRecipes();
    });
  });
  el.querySelectorAll(".recipe-fav").forEach(function(star){
    star.addEventListener("click", function(e){
      e.stopPropagation();
      var id = +star.dataset.rid;
      var rb2 = getRecipeBook();
      var r = rb2.find(function(x){ return x.id === id; });
      if (r) { r.fav = !r.fav; r.updated = Date.now(); saveRecipeBook(rb2); renderRecipes(); }
    });
  });
  el.querySelectorAll(".recipe-card").forEach(function(card){
    card.addEventListener("click", function(){
      var id = +card.dataset.rid;
      if (_recipeSelectMode) {
        if (_recipeSelected[id]) delete _recipeSelected[id]; else _recipeSelected[id] = true;
        renderRecipes();
        return;
      }
      _recipeOpenId = id;
      noteRecipeOpened(id);
      _recipeScrollPos = window.scrollY;
      var r = getRecipeBook().find(function(x){ return x.id === _recipeOpenId; });
      _recipeServings = (r && r.servings) || 1;
      resetRecipeTicks(id);
      _recipeView = "detail";
      renderRecipeDetail();
      window.scrollTo(0, 0);
    });
  });
  var _rcpPlanBtn = document.getElementById("rcpPlanBtn");
  if (_rcpPlanBtn) _rcpPlanBtn.addEventListener("click", function(){
    _recipeScrollPos = window.scrollY || document.documentElement.scrollTop;
    _recipeView = "plan";
    renderRecipes();
  });
  var _rcpToolsOverlay = document.getElementById("rcpToolsOverlay");
  var _rcpToolsBtn = document.getElementById("rcpToolsBtn");
  if (_rcpToolsBtn && _rcpToolsOverlay) _rcpToolsBtn.addEventListener("click", function(){ _rcpToolsOverlay.classList.add("open"); });
  var _rcpToolsClose = document.getElementById("rcpToolsClose");
  if (_rcpToolsClose && _rcpToolsOverlay) _rcpToolsClose.addEventListener("click", function(){ _rcpToolsOverlay.classList.remove("open"); });
  if (_rcpToolsOverlay) _rcpToolsOverlay.addEventListener("click", function(e){ if (e.target === this) _rcpToolsOverlay.classList.remove("open"); });
  var _rcpTidyBtn = document.getElementById("rcpTidyBtn");
  if (_rcpTidyBtn) _rcpTidyBtn.addEventListener("click", function(){
    _recipeScrollPos = window.scrollY || document.documentElement.scrollTop;
    _tidyState = null;            // always recompute against what's stored now
    _recipeView = "tidy";
    renderRecipes();
  });
  var _rcpDupBtn = document.getElementById("rcpDupBtn");
  if (_rcpDupBtn) _rcpDupBtn.addEventListener("click", function(){
    _recipeScrollPos = window.scrollY || document.documentElement.scrollTop;
    _dupState = null;             // always recompute against what's stored now
    _recipeView = "duplicates";
    renderRecipes();
  });
  var _rcpPrepBtn = document.getElementById("rcpPrepBtn");
  if (_rcpPrepBtn) _rcpPrepBtn.addEventListener("click", function(){
    _recipeScrollPos = window.scrollY || document.documentElement.scrollTop;
    _prepHelperState = null;      // always rebuild the export against what's stored now
    _recipeView = "prephelper";
    renderRecipes();
  });
  var _rcpCalBtn = document.getElementById("rcpCalBtn");
  if (_rcpCalBtn) _rcpCalBtn.addEventListener("click", function(){
    _recipeScrollPos = window.scrollY || document.documentElement.scrollTop;
    _calHelperState = null;       // always rebuild the export against what's stored now
    _recipeView = "calhelper";
    renderRecipes();
  });
  var _selStart = document.getElementById("rcpSelStart");
  if (_selStart) _selStart.addEventListener("click", function(){ _recipeSelectMode = true; _recipeSelected = {}; renderRecipes(); });
  var _selCancel = document.getElementById("rcpSelCancel");
  if (_selCancel) _selCancel.addEventListener("click", function(){ _recipeSelectMode = false; _recipeSelected = {}; renderRecipes(); });
  var _setCat = document.getElementById("rcpSetCat");
  if (_setCat) _setCat.addEventListener("click", function(){
    var ids = Object.keys(_recipeSelected).filter(function(k){ return _recipeSelected[k]; }).map(Number);
    if (ids.length) openBulkCategoryPicker(ids);
  });
  var _setRot = document.getElementById("rcpSetRot");
  if (_setRot) _setRot.addEventListener("click", function(){
    var ids = Object.keys(_recipeSelected).filter(function(k){ return _recipeSelected[k]; }).map(Number);
    if (ids.length) applyBulkInRotation(ids);
  });
}

// Human label for a "YYYY-MM-DD" day string: "Today" / "Tomorrow" / "Thu 11".
function mealPlanDayLabel(dayStr) {
  var dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  var now = new Date();
  var today = now.getFullYear() + "-" + t2(now.getMonth()+1) + "-" + t2(now.getDate());
  var tmr = new Date(now); tmr.setDate(now.getDate() + 1);
  var tomorrow = tmr.getFullYear() + "-" + t2(tmr.getMonth()+1) + "-" + t2(tmr.getDate());
  if (dayStr === today) return "Today";
  if (dayStr === tomorrow) return "Tomorrow";
  var parts = dayStr.split("-");
  var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  return dayNames[d.getDay()] + " " + d.getDate();
}

// Week plan — 7 tappable day cards (today .. today+6) showing the assigned
// dinner, if any. Tap an unassigned day to pick a recipe; tap an assigned
// day to open the assignment sheet (change servings / swap / remove).
function renderMealPlanner() {
  var el = document.getElementById("recipesContent");
  var savedPos = _recipeScrollPos;
  var plan = getMealPlan();
  var rb = getRecipeBook();
  var days = [];
  var anyGroceryable = false;
  for (var i = 0; i < 7; i++) {
    var d = new Date();
    d.setDate(d.getDate() + i);
    var dayStr = d.getFullYear() + "-" + t2(d.getMonth()+1) + "-" + t2(d.getDate());
    var entry = plan.find(function(e){ return e && e.day === dayStr && e.recipeId != null; });
    var recipe = entry ? rb.find(function(x){ return x && x.id === entry.recipeId; }) : null;
    if (entry && recipe) anyGroceryable = true;
    days.push({ dayStr: dayStr, entry: entry, recipe: recipe });
  }

  var cardsHtml = days.map(function(dinfo){
    var body;
    if (dinfo.entry && dinfo.recipe) {
      var servings = dinfo.entry.servings || dinfo.recipe.servings || 1;
      body = "<div style='font-size:16px;font-weight:700;color:#2A2010'>" + esc(dinfo.recipe.name) + "</div>" +
             "<div style='font-size:12px;color:#9A8A6A'>serves " + servings + "</div>";
    } else if (dinfo.entry && !dinfo.recipe) {
      body = "<div style='font-size:14px;font-weight:700;color:#B03030'>Recipe deleted</div>";
    } else {
      body = "<div style='font-size:14px;font-weight:700;color:#B5651D'>+ Add dinner</div>";
    }
    return "<div class='mpDayCard' data-day='" + esc(dinfo.dayStr) + "' style='display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;background:#fff;border:1px solid #ECE4D6;border-radius:12px;padding:14px;margin-bottom:10px;cursor:pointer;min-height:40px;box-sizing:border-box'>" +
      "<div style='font-size:12px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px;min-width:64px'>" + esc(mealPlanDayLabel(dinfo.dayStr)) + "</div>" +
      "<div style='flex:1;text-align:right;min-width:0'>" + body + "</div>" +
    "</div>";
  }).join("");

  el.innerHTML =
    "<button id='mpBackBtn' style='border:none;background:none;color:#B5651D;font-size:14px;font-weight:700;cursor:pointer;padding:0 0 12px'>&larr; All recipes</button>" +
    "<div style='font-family:Georgia,serif;font-size:24px;font-weight:600;color:#2A2010;margin-bottom:4px'>Week plan</div>" +
    "<div style='font-size:13px;color:#8A7A5A;margin-bottom:16px'>Dinners for the next 7 days — tap a day</div>" +
    "<button id='mpFillBtn' style='width:100%;box-sizing:border-box;padding:11px;margin-bottom:10px;border:1.5px solid #B5651D;background:#fff;color:#B5651D;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>&#x1F501; Fill empty days</button>" +
    cardsHtml +
    (anyGroceryable ? "<button id='mpAddWeekBtn' style='width:100%;box-sizing:border-box;padding:12px;margin-top:8px;border:none;background:#2D6B35;color:#fff;border-radius:10px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer'>&#x1F6D2; Add week to groceries</button>" : "");

  document.getElementById("mpBackBtn").addEventListener("click", function(){
    _recipeView = "list";
    renderRecipes();
    requestAnimationFrame(function(){ window.scrollTo(0, savedPos); });
  });
  el.querySelectorAll(".mpDayCard").forEach(function(card){
    card.addEventListener("click", function(){
      var day = card.dataset.day;
      var e = getMealPlan().find(function(x){ return x && x.day === day && x.recipeId != null; });
      if (e) openMealPlanDaySheet(day); else openMealPlanPicker(day);
    });
  });
  var _mpAddWeek = document.getElementById("mpAddWeekBtn");
  if (_mpAddWeek) _mpAddWeek.addEventListener("click", function(){ addWeekToGroceries(); });
  var _mpFill = document.getElementById("mpFillBtn");
  if (_mpFill) _mpFill.addEventListener("click", function(){ runMealPlanFill(); renderMealPlanner(); });
}

// Bottom-sheet recipe picker for one meal-plan day. Favourited recipes first
// (starred), then the rest, both groups alphabetical.
function openMealPlanPicker(day) {
  var label = mealPlanDayLabel(day);
  var ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;background:rgba(40,30,16,.45);z-index:900;display:flex;align-items:flex-end;justify-content:center";
  ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true"); ov.setAttribute("aria-label","Choose dinner for " + label);
  function close(){ if (ov.parentNode) ov.parentNode.removeChild(ov); }
  function draw(query){
    var rb = getRecipeBook();
    var shown = rb.filter(function(r){ return !query || fuzzyMatch(query, r.name); });
    function byName(a,b){ return (a.name||"").toLowerCase().localeCompare((b.name||"").toLowerCase()); }
    var favs = shown.filter(function(r){ return !!r.fav; }).sort(byName);
    var rest = shown.filter(function(r){ return !r.fav; }).sort(byName);
    var ordered = favs.concat(rest);
    var rowsHtml = ordered.map(function(r){
      return "<div class='mpPickRow' data-rid='" + esc(r.id) + "' style='display:flex;align-items:center;gap:8px;min-height:44px;padding:9px 4px;border-bottom:1px solid #EEE9E0;cursor:pointer'>" +
        (r.fav ? "<span style='color:#E8A030;font-size:15px'>&#x2605;</span>" : "") +
        "<div style='flex:1;min-width:0'>" +
          "<div style='font-size:15px;font-weight:600;color:#2A2010'>" + esc(r.name) + "</div>" +
          (r.category ? "<div style='font-size:12px;color:#9A8A6A'>" + esc(r.category) + "</div>" : "") +
        "</div>" +
      "</div>";
    }).join("") || "<div style='text-align:center;color:#9A8A6A;padding:20px;font-size:13px'>No recipes match.</div>";
    var listEl = ov.querySelector("#mpPickList");
    if (!listEl) return;
    listEl.innerHTML = rowsHtml;
    listEl.querySelectorAll(".mpPickRow").forEach(function(row){
      row.addEventListener("click", function(){
        var id = +row.dataset.rid;
        var r = getRecipeBook().find(function(x){ return x && x.id === id; });
        if (!r) return;
        setMealPlanDay(day, r.id, r.servings || 1);
        close();
        renderMealPlanner();
        toast(esc(r.name) + " set for " + esc(label));
      });
    });
  }
  ov.innerHTML =
    "<div style='background:#FFFDF7;width:100%;max-width:520px;border-radius:16px 16px 0 0;padding:18px 18px 14px;box-sizing:border-box;max-height:70vh;display:flex;flex-direction:column'>" +
      "<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:10px'>" +
        "<div style='font-size:16px;font-weight:800;color:#2A2010'>Dinner for " + esc(label) + "</div>" +
        "<button id='mpPickClose' data-bbclose aria-label='Close' style='border:none;background:none;color:#8A7A5A;font-size:22px;cursor:pointer;padding:4px 8px;line-height:1'>&times;</button>" +
      "</div>" +
      "<input id='mpPickSearch' type='text' placeholder='Search recipes…' autocomplete='off' style='" + recipeInputCss() + "margin-bottom:10px;flex-shrink:0'>" +
      "<div id='mpPickList' style='overflow-y:auto;flex:1'></div>" +
    "</div>";
  document.body.appendChild(ov);
  draw("");
  ov.querySelector("#mpPickClose").addEventListener("click", close);
  ov.addEventListener("click", function(e){ if (e.target === ov) close(); });
  ov.querySelector("#mpPickSearch").addEventListener("input", function(){ draw(this.value.trim()); });
}

// Assignment sheet for one already-planned meal-plan day: adjust servings,
// open/swap the recipe, or remove the day's assignment.
function openMealPlanDaySheet(day) {
  var label = mealPlanDayLabel(day);
  var entry = getMealPlan().find(function(e){ return e && e.day === day && e.recipeId != null; });
  if (!entry) { openMealPlanPicker(day); return; }
  var recipe = getRecipeBook().find(function(x){ return x && x.id === entry.recipeId; });
  var count = entry.servings || (recipe && recipe.servings) || 1;
  var ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;background:rgba(40,30,16,.45);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box";
  ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true"); ov.setAttribute("aria-label","Dinner for " + label);
  function close(){ if (ov.parentNode) ov.parentNode.removeChild(ov); }
  function closeAndRefresh(){ close(); renderMealPlanner(); }
  ov.innerHTML =
    "<div style='background:#FFFDF7;border-radius:16px;padding:20px;width:100%;max-width:380px;max-height:82vh;overflow-y:auto;box-sizing:border-box'>" +
      "<div style='font-size:12px;font-weight:700;color:#8A7A5A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px'>" + esc(label) + "</div>" +
      "<div style='font-size:18px;font-weight:700;color:" + (recipe?"#2A2010":"#B03030") + ";margin-bottom:14px'>" + (recipe?esc(recipe.name):"Recipe deleted") + "</div>" +
      (recipe ?
        "<div style='display:flex;align-items:center;gap:14px;background:#FBF5EC;border:1px solid #ECE0CC;border-radius:12px;padding:10px 14px;margin-bottom:16px'>" +
          "<span style='font-size:13px;font-weight:700;color:#7A5A30;text-transform:uppercase;letter-spacing:.5px'>Serves</span>" +
          "<button id='mpServMinus' style='width:34px;height:34px;border:1.5px solid #D8C8A8;background:#fff;border-radius:8px;font-size:20px;color:#7A5A30;cursor:pointer;line-height:1'>&minus;</button>" +
          "<span id='mpServCount' style='font-size:20px;font-weight:700;color:#2A2010;min-width:24px;text-align:center'>" + count + "</span>" +
          "<button id='mpServPlus' style='width:34px;height:34px;border:1.5px solid #D8C8A8;background:#fff;border-radius:8px;font-size:20px;color:#7A5A30;cursor:pointer;line-height:1'>+</button>" +
        "</div>"
      : "") +
      (recipe ? "<button id='mpCookedBtn' style='width:100%;padding:11px;margin-bottom:8px;border:1.5px solid #2D6B35;background:#fff;color:#2D6B35;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>&#x2713; Mark cooked</button>" : "") +
      (recipe ? "<button id='mpOpenRecipeBtn' style='width:100%;padding:11px;margin-bottom:8px;border:1.5px solid #B5651D;background:#fff;color:#B5651D;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Open recipe</button>" : "") +
      "<button id='mpSwapBtn' style='width:100%;padding:11px;margin-bottom:8px;border:1.5px solid #D8C0A0;background:#fff;color:#8A5A1A;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Swap recipe</button>" +
      "<button id='mpRemoveBtn' style='width:100%;padding:11px;margin-bottom:8px;border:1.5px solid #E0C0C0;background:#fff;color:#B03030;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Remove</button>" +
      "<button id='mpCancelBtn' data-bbclose style='width:100%;padding:11px;border:none;background:none;color:#8A7A5A;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer'>Cancel</button>" +
    "</div>";
  document.body.appendChild(ov);
  ov.addEventListener("click", function(e){ if (e.target === ov) closeAndRefresh(); });
  document.getElementById("mpCancelBtn").addEventListener("click", closeAndRefresh);
  if (recipe) {
    document.getElementById("mpServMinus").addEventListener("click", function(){
      if (count > 1) { count--; setMealPlanDay(day, entry.recipeId, count); document.getElementById("mpServCount").textContent = count; }
    });
    document.getElementById("mpServPlus").addEventListener("click", function(){
      if (count < 50) { count++; setMealPlanDay(day, entry.recipeId, count); document.getElementById("mpServCount").textContent = count; }
    });
    document.getElementById("mpOpenRecipeBtn").addEventListener("click", function(){
      close();
      _recipeOpenId = recipe.id;
      noteRecipeOpened(recipe.id);
      _recipeServings = entry.servings || recipe.servings || 1;
      resetRecipeTicks(recipe.id);
      _recipeView = "detail";
      renderRecipes();
    });
    document.getElementById("mpCookedBtn").addEventListener("click", function(){
      var rb2 = getRecipeBook();
      var rr = rb2.find(function(x){ return x && x.id === recipe.id; });
      if (rr) { rr.lastCooked = Date.now(); rr.updated = Date.now(); saveRecipeBook(rb2); }
      toast("&#x2713; Marked cooked — moves to the back of the rotation queue");
      closeAndRefresh();
    });
  }
  document.getElementById("mpSwapBtn").addEventListener("click", function(){ close(); openMealPlanPicker(day); });
  document.getElementById("mpRemoveBtn").addEventListener("click", function(){
    setMealPlanDay(day, null, null);
    close();
    renderMealPlanner();
  });
}

function recipeCardHTML(r, selectMode, selected) {
  var ingCount = (r.ingredients||[]).length;
  var check = selectMode ? "<div style='font-size:22px;line-height:1;color:" + (selected?"#B5651D":"#CFC4AE") + "'>" + (selected?"&#x2611;":"&#x2610;") + "</div>" : "";
  var fav = selectMode ? "" : "<button class='recipe-fav' data-rid='" + esc(r.id) + "' aria-label='Favourite' style='border:none;background:none;cursor:pointer;font-size:22px;line-height:1;padding:4px;color:" + (r.fav?"#E8A030":"#D8CEBC") + "'>" + (r.fav?"&#x2605;":"&#x2606;") + "</button>";
  return "<div class='recipe-card' data-rid='" + esc(r.id) + "' style='display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:" + (selected?"#FBF1E2":"#fff") + ";border:1px solid " + (selected?"#E0C098":"#ECE4D6") + ";border-radius:12px;padding:14px 14px;margin-bottom:10px;cursor:pointer'>" +
    check +
    "<div style='flex:1;min-width:0'>" +
      "<div style='font-size:16px;font-weight:700;color:#2A2010;margin-bottom:3px'>" + esc(r.name) + "</div>" +
      "<div style='font-size:12px;color:#9A8A6A'>" + ingCount + " ingredient" + (ingCount!==1?"s":"") + " &middot; serves " + (r.servings||1) + (r.category?" &middot; " + esc(r.category):"") + (r.inRotation?" &middot; &#x1F501; in rotation":"") + "</div>" +
    "</div>" +
    fav +
  "</div>";
}

// Bulk-add selected recipes to the rotation pool (never bulk-removes — taking
// a recipe out of rotation is a deliberate single-recipe edit, done from its
// own editor checkbox).
