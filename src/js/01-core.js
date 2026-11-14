// ============================================================
// PREVIEW MODE — skip login when running in Claude / localhost
// ============================================================
var _isPreview = (function() {
  var h = window.location.hostname || "";
  var href = window.location.href || "";
  return !h || h === "localhost" || h === "127.0.0.1" ||
    h.indexOf("claude.ai") !== -1 || h.indexOf("anthropic") !== -1 ||
    href.indexOf("blob:") === 0 || href.indexOf("data:") === 0 ||
    window.self !== window.top; // inside any iframe
})();

// ============================================================
// TEST BUILD — the app served from anywhere that isn't one of the
// real production homes (e.g. the raw.githack.com "try this
// version" link on a PR). Firebase sync, login and the cloud backup
// are hard-blocked and the service worker is skipped, so nothing
// done in a test build can ever reach real data on the phones or in
// Firebase. The browser keeps its localStorage per-site, so test
// data lives (and stays) on the test address only.
//
// _prodHosts is an EXACT-match allowlist, deliberately — not a
// suffix/wildcard test. Cloudflare Pages also publishes every branch
// and every past deployment at <branch|hash>.<project>.pages.dev, and
// those must keep behaving as test builds; a "ends with .pages.dev"
// check would hand them live Firebase access.
// ============================================================
var _prodHosts = ["coshea321.github.io", "miniature-journey-b9p.pages.dev"];
var _isTestBuild = !_isPreview && _prodHosts.indexOf(window.location.hostname || "") === -1;
if (_isTestBuild) {
  var _tbBanner = document.getElementById("testBuildBanner");
  if (_tbBanner) _tbBanner.style.display = "block";
}

// ============================================================
// TEST-BUILD DEMO DATA — phase 1: the wipe (v407)
// ------------------------------------------------------------
// Every "Try this version" PR link is served from the SAME origin
// (raw.githack.com), so localStorage there is shared by every branch and
// every version ever opened. Whatever was left in a test build — including
// a real backup imported into one to get realistic content — carried
// straight into the next PR's test link, which is exactly what we don't
// want to be reviewing against.
//
// A test build therefore reseeds itself ONCE PER VERSION: the first open of
// a given version wipes the whole fl4_* store and lays down a fixed demo
// household (phase 2, next to the boot gate). Reloading the SAME version
// changes nothing, so a refresh part-way through a test doesn't throw away
// what you were doing.
//
// The wipe has to happen HERE, before any module-level code reads storage,
// so every cached-at-parse-time value (sectionVisible, syncPrefs, hearthUser,
// listData…) initialises exactly as it would on a fresh device. The seed
// itself is written later, once importBackupData and its helpers exist.
// None of this can run on the real app — _isTestBuild is false there.
// ============================================================
var TEST_SEED_KEY  = "fl4_testseed";   // holds the version string last seeded
var _testSeedPending = false;
function testBuildVersion() {
  var el = document.getElementById("appVersionLabel");
  return el ? el.textContent.trim() : "";
}
// Clears the app's own namespace only. Deliberately leaves everything else
// (hearth_user / hearth_fb) alone — a test build never logs in anyway, and
// widening the wipe is how a clear-everything button turns into a bug.
function wipeTestStore() {
  var keys = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.indexOf("fl4_") === 0) keys.push(k);
  }
  keys.forEach(function(k){ try { localStorage.removeItem(k); } catch(e){} });
}

// ============================================================
// TAINTED STORE (v420) — a test build's demo data outliving the test build.
// ------------------------------------------------------------
// The marker below is written ONLY by a test build. So finding it on a
// production host means this origin used to BE a test build and has since
// been promoted — exactly what happened to the Cloudflare Pages site on
// 11/08/2026: it was seeded with the demo household while it was a test
// build, v418 made its hostname production, nothing wiped the store, and
// the demo data merged into real data and synced out to every device.
//
// Deliberately NOT a wipe (Cathal's call, 11/08/2026). Nothing deletes
// itself at boot: we stop this device SENDING, say so in a banner, and
// leave the clearing to a tap. Receiving is left alone — pulling real data
// down is how you tell the demo records apart from your own.
// ============================================================
var _seedTainted = false;
try {
  _seedTainted = !_isTestBuild && !!localStorage.getItem(TEST_SEED_KEY);
} catch (e) { _seedTainted = false; }
if (_seedTainted) {
  var _stBanner = document.getElementById("seedTaintBanner");
  if (_stBanner) _stBanner.style.display = "block";
}
if (_isTestBuild) {
  try {
    if (storeGet(TEST_SEED_KEY) !== testBuildVersion()) {
      wipeTestStore();
      _testSeedPending = true;
      // Written after the wipe so the demo household opens with every
      // hideable section on the bar (keep this list in sync with
      // HIDEABLE_SECTIONS below — it can't be built from that constant
      // directly, since this runs before HIDEABLE_SECTIONS is assigned).
      storeSet("fl4_secVisible", { home:true, train:true, trips:true, track:true, sports:true, famlog:true, plants:true, watch:true, appliances:true, health:true, projects:true, golf:true });
    }
  } catch (e) { console.warn("test seed check failed:", e); }
}

// ============================================================
// LIST TYPE CONFIG
// ============================================================
var LIST_TYPES = {
  grocery:{ name:"&#x1F6D2; Grocery", placeholder:"Add an item...", color:"#2D6B35", emptyIco:"&#x1F6D2;", emptyTitle:"Your list is empty",  emptySub:"Start typing - categories detect automatically." },
  todo:   { name:"&#x2705; To-do",  placeholder:"Add a task...",   color:"#5A3AA0", emptyIco:"&#x2705;", emptyTitle:"No tasks yet",         emptySub:"Add a task - it'll be categorised automatically." },
  personal:{ name:"&#x1F464; Personal", placeholder:"Add a task...",   color:"#A0205A", emptyIco:"&#x1F464;", emptyTitle:"No personal tasks yet", emptySub:"Add a personal task - it'll be categorised automatically." },
  travel: { name:"&#x2708; Travel",   placeholder:"Add to pack...",  color:"#1A5A8A", emptyIco:"&#x2708;", emptyTitle:"Nothing packed yet",  emptySub:"Add items to pack - categories detect automatically." },
  notes:  { name:"&#x1F4DD; Notes",   placeholder:"",                color:"#A05A10", emptyIco:"&#x1F4DD;", emptyTitle:"No notes yet",        emptySub:"" },
};

// ============================================================
// CATEGORIES
// ============================================================
var GROCERY_CATS = [
  {id:"produce",  name:"Produce",       emoji:"&#x1F966;", bg:"#D9EDDA", fg:"#1A4A1E"},
  {id:"dairy",    name:"Dairy & Eggs",  emoji:"&#x1F95B;", bg:"#DDEEFF", fg:"#1A3A6A"},
  {id:"meat",     name:"Meat & Fish",   emoji:"&#x1F969;", bg:"#FDDEDD", fg:"#7A1A1A"},
  {id:"bakery",   name:"Bakery",        emoji:"&#x1F35E;", bg:"#FFF0D8", fg:"#7A4A1A"},
  {id:"frozen",   name:"Frozen",        emoji:"&#x1F9CA;", bg:"#D8F0FF", fg:"#0A3A6A"},
  {id:"drinks",   name:"Drinks",        emoji:"&#x1F964;", bg:"#D8FFE8", fg:"#0A4A1A"},
  {id:"pantry",   name:"Pantry",        emoji:"&#x1F96B;", bg:"#F0E8D8", fg:"#5A3A1A"},
  {id:"snacks",   name:"Snacks",        emoji:"&#x1F36B;", bg:"#EED8FF", fg:"#3A1A7A"},
  {id:"cleaning", name:"Cleaning",      emoji:"&#x1F9F9;", bg:"#E8E8E8", fg:"#3A3A3A"},
  {id:"personal", name:"Personal Care", emoji:"&#x1F9F4;", bg:"#FFD8EC", fg:"#7A1A4A"},
  {id:"other",    name:"Other",         emoji:"&#x1F4E6;", bg:"#EDEAE4", fg:"#4A4A3A"},
];
var TODO_CATS = [
  {id:"work",     name:"Work",     emoji:"&#x1F4BC;", bg:"#E8E0FF", fg:"#3A1A8A"},
  {id:"home",     name:"Home",     emoji:"&#x1F3E0;", bg:"#FFF0D8", fg:"#7A4A1A"},
  {id:"errands",  name:"Errands",  emoji:"&#x1F3C3;", bg:"#D8FFE8", fg:"#0A4A1A"},
  {id:"health",   name:"Health",   emoji:"&#x2764;",  bg:"#FDDEDD", fg:"#7A1A1A"},
  {id:"finance",  name:"Finance",  emoji:"&#x1F4B0;", bg:"#FFFBD8", fg:"#6A5A1A"},
  {id:"family",   name:"Family",   emoji:"&#x1F46A;", bg:"#FFD8EC", fg:"#7A1A4A"},
  {id:"personal", name:"Personal", emoji:"&#x2B50;",  bg:"#D8F0FF", fg:"#0A3A6A"},
  {id:"other",    name:"Other",    emoji:"&#x1F4E6;", bg:"#EDEAE4", fg:"#4A4A3A"},
];
var TRAVEL_CATS = [
  {id:"documents",     name:"Documents",     emoji:"&#x1F4C4;", bg:"#FFF0D8", fg:"#7A4A1A"},
  {id:"clothing",      name:"Clothing",      emoji:"&#x1F457;", bg:"#FFD8EC", fg:"#7A1A4A"},
  {id:"toiletries",    name:"Toiletries",    emoji:"&#x1FAA5;", bg:"#D8F0FF", fg:"#0A3A6A"},
  {id:"electronics",   name:"Electronics",   emoji:"&#x1F50C;", bg:"#E8E0FF", fg:"#3A1A8A"},
  {id:"health",        name:"Health",        emoji:"&#x1F48A;", bg:"#FDDEDD", fg:"#7A1A1A"},
  {id:"money",         name:"Money & Cards", emoji:"&#x1F4B3;", bg:"#FFFBD8", fg:"#6A5A1A"},
  {id:"entertainment", name:"Entertainment", emoji:"&#x1F4DA;", bg:"#D8FFE8", fg:"#0A4A1A"},
  {id:"luggage",       name:"Luggage &amp; Bags", emoji:"&#x1F9F3;", bg:"#E0E8D8", fg:"#3A4A1A"},
  {id:"other",         name:"Other",         emoji:"&#x1F4E6;", bg:"#EDEAE4", fg:"#4A4A3A"},
];

var GROCERY_KW = [
  ["oat milk","dairy"],["almond milk","dairy"],["soy milk","dairy"],["sour cream","dairy"],
  ["double cream","dairy"],["single cream","dairy"],["clotted cream","dairy"],
  ["creme fraiche","dairy"],["cottage cheese","dairy"],["cream cheese","dairy"],
  ["semi-skimmed","dairy"],["skimmed milk","dairy"],
  ["milk","dairy"],["cheese","dairy"],["yogurt","dairy"],["yoghurt","dairy"],
  ["butter","dairy"],["cream","dairy"],["eggs","dairy"],["egg","dairy"],
  ["cheddar","dairy"],["mozzarella","dairy"],["parmesan","dairy"],["brie","dairy"],
  ["feta","dairy"],["gouda","dairy"],["edam","dairy"],["camembert","dairy"],
  ["stilton","dairy"],["gruyere","dairy"],["ricotta","dairy"],["halloumi","dairy"],
  ["mascarpone","dairy"],["ghee","dairy"],["kefir","dairy"],
  ["sweet potato","produce"],["spring onion","produce"],["pak choi","produce"],["bok choy","produce"],
  ["apple","produce"],["banana","produce"],["carrot","produce"],["lettuce","produce"],
  ["tomato","produce"],["onion","produce"],["potato","produce"],["spinach","produce"],
  ["broccoli","produce"],["cucumber","produce"],["pepper","produce"],["mushroom","produce"],
  ["avocado","produce"],["lemon","produce"],["lime","produce"],["orange","produce"],
  ["grape","produce"],["strawberr","produce"],["raspberr","produce"],["blueberr","produce"],
  ["pear","produce"],["peach","produce"],["plum","produce"],["mango","produce"],
  ["pineapple","produce"],["kiwi","produce"],["melon","produce"],["watermelon","produce"],
  ["celery","produce"],["courgette","produce"],["zucchini","produce"],["aubergine","produce"],
  ["eggplant","produce"],["cabbage","produce"],["kale","produce"],["leek","produce"],
  ["garlic","produce"],["ginger","produce"],["coriander","produce"],["parsley","produce"],
  ["basil","produce"],["mint","produce"],["chilli","produce"],["chili","produce"],
  ["beetroot","produce"],["radish","produce"],["turnip","produce"],["parsnip","produce"],
  ["butternut","produce"],["salad","produce"],["rocket","produce"],["fennel","produce"],
  ["asparagus","produce"],["chard","produce"],["artichoke","produce"],["shallot","produce"],
  ["smoked salmon","meat"],["sea bass","meat"],["sea bream","meat"],
  ["chicken breast","meat"],["chicken thigh","meat"],["chicken wing","meat"],
  ["chicken","meat"],["beef","meat"],["pork","meat"],["lamb","meat"],
  ["mince","meat"],["steak","meat"],["sausage","meat"],["bacon","meat"],
  ["ham","meat"],["turkey","meat"],["duck","meat"],["fish","meat"],
  ["salmon","meat"],["tuna","meat"],["cod","meat"],["haddock","meat"],
  ["prawn","meat"],["shrimp","meat"],["mussel","meat"],["oyster","meat"],
  ["crab","meat"],["lobster","meat"],["mackerel","meat"],["sardine","meat"],
  ["trout","meat"],["fillet","meat"],["brisket","meat"],["chorizo","meat"],
  ["salami","meat"],["pepperoni","meat"],["pancetta","meat"],["lardons","meat"],
  ["kipper","meat"],["venison","meat"],
  ["english muffin","bakery"],["hot cross bun","bakery"],["bread roll","bakery"],
  ["sourdough","bakery"],["baguette","bakery"],["croissant","bakery"],
  ["bread","bakery"],["loaf","bakery"],["bagel","bakery"],["muffin","bakery"],
  ["scone","bakery"],["donut","bakery"],["doughnut","bakery"],["pastry","bakery"],
  ["pitta","bakery"],["pita","bakery"],["tortilla","bakery"],["naan","bakery"],
  ["ciabatta","bakery"],["focaccia","bakery"],["brioche","bakery"],
  ["crumpet","bakery"],["danish","bakery"],["waffle","bakery"],["cake","bakery"],
  ["ice cream","frozen"],["ice lolly","frozen"],["fish finger","frozen"],
  ["frozen pea","frozen"],["frozen veg","frozen"],["frozen meal","frozen"],
  ["potato waffle","frozen"],["edamame","frozen"],["gelato","frozen"],
  ["sorbet","frozen"],["frozen","frozen"],
  ["orange juice","drinks"],["apple juice","drinks"],["coconut water","drinks"],
  ["rose wine","drinks"],["red wine","drinks"],["white wine","drinks"],
  ["sparkling water","drinks"],["energy drink","drinks"],["protein shake","drinks"],
  ["water","drinks"],["juice","drinks"],["coffee","drinks"],["tea","drinks"],
  ["wine","drinks"],["beer","drinks"],["cider","drinks"],
  ["whiskey","drinks"],["whisky","drinks"],["vodka","drinks"],["gin","drinks"],
  ["rum","drinks"],["cola","drinks"],["lemonade","drinks"],["squash","drinks"],
  ["smoothie","drinks"],["kombucha","drinks"],["tonic","drinks"],
  ["prosecco","drinks"],["champagne","drinks"],
  ["olive oil","pantry"],["vegetable oil","pantry"],["coconut oil","pantry"],
  ["peanut butter","pantry"],["tomato paste","pantry"],["tomato puree","pantry"],
  ["soy sauce","pantry"],["hot sauce","pantry"],["fish sauce","pantry"],
  ["oyster sauce","pantry"],["stock cube","pantry"],
  ["baking powder","pantry"],["baking soda","pantry"],
  ["chilli flakes","pantry"],["curry powder","pantry"],["black pepper","pantry"],
  ["pasta","pantry"],["rice","pantry"],["flour","pantry"],["sugar","pantry"],
  ["vinegar","pantry"],["cereal","pantry"],["oats","pantry"],["porridge","pantry"],
  ["lentil","pantry"],["bean","pantry"],["chickpea","pantry"],
  ["stock","pantry"],["broth","pantry"],["tinned","pantry"],["canned","pantry"],
  ["honey","pantry"],["jam","pantry"],["nutella","pantry"],["syrup","pantry"],
  ["salt","pantry"],["spice","pantry"],["cumin","pantry"],["paprika","pantry"],
  ["turmeric","pantry"],["cinnamon","pantry"],["mustard","pantry"],
  ["ketchup","pantry"],["mayonnaise","pantry"],["mayo","pantry"],
  ["sriracha","pantry"],["yeast","pantry"],["cornflour","pantry"],
  ["breadcrumb","pantry"],["noodle","pantry"],["quinoa","pantry"],
  ["couscous","pantry"],["polenta","pantry"],["miso","pantry"],
  ["tahini","pantry"],["passata","pantry"],["gravy","pantry"],
  ["custard","pantry"],["nutmeg","pantry"],["bay leaf","pantry"],["oil","pantry"],
  ["chocolate bar","snacks"],["granola bar","snacks"],["protein bar","snacks"],
  ["rice cake","snacks"],["oat cake","snacks"],["rice cracker","snacks"],
  ["dried fruit","snacks"],["mixed nuts","snacks"],["trail mix","snacks"],
  ["crisps","snacks"],["chocolate","snacks"],["biscuit","snacks"],
  ["cookie","snacks"],["almond","snacks"],["cashew","snacks"],
  ["walnut","snacks"],["peanut","snacks"],["popcorn","snacks"],
  ["cracker","snacks"],["sweets","snacks"],["candy","snacks"],["gummy","snacks"],
  ["raisin","snacks"],["hummus","snacks"],["breadstick","snacks"],
  ["washing up liquid","cleaning"],["dishwasher tablet","cleaning"],
  ["fabric softener","cleaning"],["washing powder","cleaning"],
  ["bin bag","cleaning"],["bin liner","cleaning"],
  ["tin foil","cleaning"],["cling film","cleaning"],["kitchen roll","cleaning"],
  ["paper towel","cleaning"],["air freshener","cleaning"],
  ["toilet cleaner","cleaning"],["bathroom cleaner","cleaning"],
  ["cleaning spray","cleaning"],["limescale","cleaning"],
  ["detergent","cleaning"],["bleach","cleaning"],["sponge","cleaning"],
  ["domestos","cleaning"],["dettol","cleaning"],["febreze","cleaning"],
  ["persil","cleaning"],["ariel","cleaning"],["antibacterial","cleaning"],
  ["toilet paper","personal"],["toilet roll","personal"],["loo roll","personal"],
  ["shower gel","personal"],["hand soap","personal"],["body wash","personal"],
  ["face wash","personal"],["body lotion","personal"],["hand cream","personal"],
  ["dental floss","personal"],["cotton pads","personal"],["cotton buds","personal"],
  ["baby wipes","personal"],["sanitary pad","personal"],["lip balm","personal"],
  ["shampoo","personal"],["conditioner","personal"],["soap","personal"],
  ["toothpaste","personal"],["toothbrush","personal"],["deodorant","personal"],
  ["razor","personal"],["moisturiser","personal"],["moisturizer","personal"],
  ["sunscreen","personal"],["sunblock","personal"],
  ["tampon","personal"],["nappy","personal"],["diaper","personal"],
  ["wipes","personal"],["tissues","personal"],
  ["mouthwash","personal"],["perfume","personal"],["cologne","personal"],["aftershave","personal"],
];
var TODO_KW = [
  ["standup","work"],["sprint","work"],["pull request","work"],["code review","work"],
  ["meeting","work"],["email","work"],["report","work"],["presentation","work"],
  ["deadline","work"],["phone call","work"],["conference","work"],["review","work"],
  ["proposal","work"],["project","work"],["client","work"],["invoice","work"],
  ["interview","work"],["quarterly","work"],["expense","work"],
  ["hoover","home"],["vacuum","home"],["washing machine","home"],
  ["clean","home"],["tidy","home"],["organise","home"],["organize","home"],
  ["fix","home"],["repair","home"],["garden","home"],["mow","home"],
  ["trim","home"],["plant","home"],["paint","home"],["decorate","home"],
  ["laundry","home"],["dishwasher","home"],["rubbish","home"],
  ["recycling","home"],["ironing","home"],
  ["post office","errands"],["dry clean","errands"],["pick up","errands"],
  ["drop off","errands"],["collect","errands"],["bank","errands"],
  ["pharmacy","errands"],["chemist","errands"],["appointment","errands"],
  ["renew","errands"],["register","errands"],["licence","errands"],["license","errands"],
  ["doctor","health"],["dentist","health"],["optician","health"],
  ["gym","health"],["exercise","health"],["physio","health"],
  ["blood test","health"],["checkup","health"],["therapy","health"],
  ["medication","health"],["prescription","health"],
  ["run","health"],["jog","health"],["yoga","health"],["swim","health"],["cycle","health"],
  ["mortgage","finance"],["rent","finance"],["utility","finance"],
  ["tax return","finance"],["tax","finance"],["pension","finance"],
  ["payment","finance"],["bill","finance"],["insurance","finance"],
  ["savings","finance"],["direct debit","finance"],["standing order","finance"],
  ["transfer","finance"],["budget","finance"],
  ["school","family"],["birthday","family"],["gift","family"],["present","family"],
  ["party","family"],["anniversary","family"],["wedding","family"],
  ["babysitter","family"],["childcare","family"],["kids","family"],
  ["mum","family"],["dad","family"],["parents","family"],["visit","family"],
  ["read","personal"],["course","personal"],["learn","personal"],
  ["study","personal"],["hobby","personal"],["journal","personal"],
  ["meditate","personal"],["podcast","personal"],["research","personal"],
  ["write","personal"],["book","personal"],
];
var TRAVEL_KW = [
  ["boarding pass","documents"],["travel insurance","documents"],
  ["driving licence","documents"],["driving license","documents"],
  ["id card","documents"],["passport","documents"],["visa","documents"],
  ["ticket","documents"],["itinerary","documents"],["booking","documents"],
  ["reservation","documents"],["insurance","documents"],["sim card","documents"],
  ["swimming trunks","clothing"],["rain jacket","clothing"],["sun hat","clothing"],
  ["flip flops","clothing"],["running shoes","clothing"],
  ["underwear","clothing"],["socks","clothing"],["shoes","clothing"],
  ["boots","clothing"],["sandals","clothing"],["slippers","clothing"],["hat","clothing"],
  ["scarf","clothing"],["gloves","clothing"],["belt","clothing"],
  ["suit","clothing"],["shorts","clothing"],["dress","clothing"],
  ["skirt","clothing"],["trousers","clothing"],["jeans","clothing"],
  ["shirt","clothing"],["t-shirt","clothing"],["tshirt","clothing"],
  ["jumper","clothing"],["sweater","clothing"],["hoodie","clothing"],
  ["jacket","clothing"],["coat","clothing"],["pyjamas","clothing"],
  ["pajamas","clothing"],["bikini","clothing"],["swimsuit","clothing"],
  ["swimwear","clothing"],["clothes","clothing"],
  ["toothbrush","toiletries"],["toothpaste","toiletries"],
  ["shower gel","toiletries"],["shampoo","toiletries"],["conditioner","toiletries"],
  ["razor","toiletries"],["deodorant","toiletries"],["moisturiser","toiletries"],
  ["moisturizer","toiletries"],["sunscreen","toiletries"],["sun cream","toiletries"],
  ["aftersun","toiletries"],["makeup","toiletries"],["mascara","toiletries"],
  ["lipstick","toiletries"],["perfume","toiletries"],["cologne","toiletries"],
  ["hairbrush","toiletries"],["comb","toiletries"],["nail file","toiletries"],
  ["face wash","toiletries"],["contact lens","toiletries"],["contacts","health"],["suncream","toiletries"],["lip balm","toiletries"],["creams","toiletries"],
  ["plug adapter","electronics"],["travel adapter","electronics"],
  ["power bank","electronics"],["portable charger","electronics"],
  ["noise cancelling","electronics"],["memory card","electronics"],
  ["phone","electronics"],["charger","electronics"],["adapter","electronics"],
  ["camera","electronics"],["laptop","electronics"],["tablet","electronics"],
  ["ipad","electronics"],["kindle","electronics"],["headphones","electronics"],
  ["earphones","electronics"],["earbuds","electronics"],
  ["smartwatch","electronics"],["cables","electronics"],["tripod","electronics"],
  ["paracetamol","health"],["ibuprofen","health"],["antihistamine","health"],
  ["insect repellent","health"],["mosquito","health"],
  ["first aid","health"],["plasters","health"],["bandage","health"],
  ["prescription","health"],["inhaler","health"],["epipen","health"],
  ["medication","health"],["medicine","health"],["tablets","health"],
  ["vitamins","health"],["antiseptic","health"],["eye drops","health"],["thermometer","health"],["ear plugs","health"],["sippy cup","other"],["sippy","other"],
  ["travel money","money"],["foreign currency","money"],["credit card","money"],
  ["debit card","money"],["cash","money"],["wallet","money"],
  ["euros","money"],["dollars","money"],["pounds","money"],
  ["currency","money"],["forex","money"],
  ["guidebook","entertainment"],["travel guide","entertainment"],
  ["playing cards","entertainment"],["board game","entertainment"],
  ["magazine","entertainment"],["notebook","entertainment"],
  ["puzzle","entertainment"],["games","entertainment"],["book","entertainment"],
  ["suitcase","luggage"],["suitcases","luggage"],["travel cot","luggage"],
  ["car seat","luggage"],["stroller","luggage"],["buggy","luggage"],
  ["pushchair","luggage"],["pram","luggage"],["backpack","luggage"],
  ["rucksack","luggage"],["holdall","luggage"],["duffel","luggage"],
  ["hand luggage","luggage"],["cabin bag","luggage"],["carry-on","luggage"],
  ["carry on","luggage"],["travel bag","luggage"],["luggage","luggage"],
];

var LIST_CONFIG = {
  grocery:{ cats:GROCERY_CATS, kw:GROCERY_KW, key:"fl4_grocery" },
  todo:   { cats:TODO_CATS,    kw:TODO_KW,    key:"fl4_todo"    },
  travel:   { cats:TRAVEL_CATS, kw:TRAVEL_KW,  key:"fl4_travel"   },
  personal: { cats:TODO_CATS,   kw:TODO_KW,    key:"fl4_personal"  },
};

// ============================================================
// CUSTOM CATEGORIES
// ============================================================
var CAT_COLORS = [
  {bg:"#D9EDDA",fg:"#1A4A1E"},{bg:"#DDEEFF",fg:"#1A3A6A"},{bg:"#FDDEDD",fg:"#7A1A1A"},
  {bg:"#FFF0D8",fg:"#7A4A1A"},{bg:"#D8F0FF",fg:"#0A3A6A"},{bg:"#D8FFE8",fg:"#0A4A1A"},
  {bg:"#F0E8D8",fg:"#5A3A1A"},{bg:"#EED8FF",fg:"#3A1A7A"},{bg:"#E8E8E8",fg:"#3A3A3A"},
  {bg:"#FFD8EC",fg:"#7A1A4A"},{bg:"#FFFBD8",fg:"#6A5A1A"},{bg:"#E8E0FF",fg:"#3A1A8A"},
];
var CAT_EMOJIS = ["&#x1F4E6;","&#x1F4A1;","&#x1F333;","&#x1F43E;","&#x1F3AE;","&#x1F4F8;",
  "&#x1F3CB;","&#x2764;","&#x1F31F;","&#x1F381;","&#x1F4DA;","&#x1F527;",
  "&#x1F9F9;","&#x1F3E1;","&#x26BD;","&#x1F3B5;","&#x2708;","&#x1F699;",
  "&#x1F4AA;","&#x1F9D8;","&#x1F35C;","&#x1F9F4;","&#x1F4B0;","&#x1F4BB;"];

var selectedCatEmoji = CAT_EMOJIS[0];
var selectedCatColor = 0;

function getCustomCats(lt) {
  var v = storeGet("fl4_cc_" + lt);
  return Array.isArray(v) ? v : [];
}
function saveCustomCats(lt, cats) { storeSet("fl4_cc_" + lt, cats); pushPersonal(); }

function getAllCats(lt) {
  return LIST_CONFIG[lt].cats.concat(getCustomCats(lt));
}

// ============================================================
// STORAGE
// ============================================================
function storeGet(k) {
  try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }
  catch(e) { console.warn("storeGet failed:", k, e); return null; }
}
// v459: returns TRUE only when the write actually landed. Every one of the
// ~180 existing callers ignores the result and is unaffected; a caller that
// tells the user their data is saved must check it. The toast stays for the
// callers that don't — but a toast is not a save confirmation, and it was
// being overwritten 2 lines later by the medicine "Logged" toast, which is
// the v457 council review's strongest finding.
function storeSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch(e) {
    console.warn("storeSet failed:", k, e);
    if (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED") {
      if (typeof toast === "function") toast("Storage full — some data may not be saved.");
    }
    return false;
  }
}

function loadListData(lt) {
  if (listData[lt]) return listData[lt];
  var raw = storeGet(LIST_CONFIG[lt].key);
  var d = { items:[], hist:[] };
  if (raw && typeof raw === "object") {
    d.items = Array.isArray(raw.items) ? raw.items.filter(function(x){ return x && typeof x==="object"; }) : [];
    d.hist  = Array.isArray(raw.hist)  ? raw.hist.filter(function(x) { return x && typeof x==="object"; }) : [];
  }
  listData[lt] = d;
  return d;
}
function saveCurrentList() {
  var d = listData[currentList];
  if (d) { storeSet(LIST_CONFIG[currentList].key, d); pushPersonal(); if (isHouseholdSet() && isSynced(currentList)) pushHousehold(); }
}

// ── List sync helpers: union-by-id + newest-wins + deletion tombstones ──────
// Fixes the wholesale-replace race (concurrent adds dropped) while keeping
// deletions propagating (via tombstones) across both sync channels.
function getTombs(lt){ var t = storeGet("fl4_tomb_" + lt); return (t && typeof t === "object") ? t : {}; }
function addTomb(lt, id){ if (id == null) return; var t = getTombs(lt); t[id] = Date.now(); storeSet("fl4_tomb_" + lt, t); }
function purgeTombs(t){ var cut = Date.now() - 90*24*3600*1000, o = {}; Object.keys(t||{}).forEach(function(k){ if (t[k] > cut) o[k] = t[k]; }); return o; } // 90d (7d→30d in v289, →90d in v295): a device offline longer than the purge window can resurrect deleted items — 90d covers a drawer-bound tablet; tombstones are tiny, so the cost is nil
// v462: a personal record's revival stamp. action_log / food_log / saved_meals
// were created without an `updated` field, so creation id (Date.now()) is the
// fallback -- the same rule medUpdatedTs uses for doses. This is what lets a
// RESTORED record out-rank a tombstone: see the three filters in applyPersonal.
function personalTs(e){ return (e && (e.updated || e.id)) || 0; }
function mergeTombs(a, b){ var o = {}; [a,b].forEach(function(t){ Object.keys(t||{}).forEach(function(k){ if (!(k in o) || t[k] > o[k]) o[k] = t[k]; }); }); return o; }

// ── History-entry deletion tombstones (v323) — keyed by lowercase item name ──
// Reuses the generic tomb helpers above under a "hist_<lt>" namespace (store
// key fl4_tomb_hist_<lt>). Synced as `histDeleted` on both channels so a
// deleted entry can't be resurrected by another device's copy; a hist entry is
// dropped in mergeHist when its tombstone is at/after its lastUsed, so
// re-adding the item (fresh lastUsed) survives. NOT exported, matching the
// fl4_tomb_* policy — deliberately, a backup restore does NOT bring deleted
// history entries back within the 90d tombstone window: deletions are cleanup
// and should stick. Re-adding an item also clears its local tombstone.
function histTombKey(lt){ return "hist_" + lt; }
function clearHistTomb(lt, name) {
  var t = getTombs(histTombKey(lt)), k = String(name).toLowerCase();
  if (t[k] !== undefined) { delete t[k]; storeSet("fl4_tomb_" + histTombKey(lt), t); }
}
function deleteHistEntries(lt, names) { // names: array of lowercase names
  var t = getTombs(histTombKey(lt)), now = Date.now();
  names.forEach(function(n){ t[n] = now; });
  storeSet("fl4_tomb_" + histTombKey(lt), t);
  listData[lt].hist = (listData[lt].hist || []).filter(function(h){ return h && h.name && names.indexOf(h.name.toLowerCase()) === -1; });
}
// ── Baby sync merge (v329) — ONE shared merge for BOTH sync channels ────────
// Replaces the household channel's top-level Object.assign (which wholesale-
// replaced the medicine/growth/milestones/teeth collections with the last-
// pushing device's copy, silently dropping e.g. a dose the sender hadn't
// received yet) and the personal channel's inline mergeByKey. growth/
// milestones/teeth keep "remote wins on same key" (no per-entry stamps there);
// MEDICINE is newest-wins by per-entry `updated` — fallback to `id`, which is
// Date.now() at creation, so pre-v329 entries merge correctly with no
// migration — and respects deletion tombstones (fl4_tomb_med, keyed by entry
// id) so deleting a mis-logged dose sticks across devices. A new dose is
// always a new id, so tombstones can never block fresh logging.
function medUpdatedTs(m){ return (m && (m.updated || m.id)) || 0; }
// bd.bottles (v346): per-product-key newest-wins map, mirrors mergeMedicine's
// tie rule. No tombstones in v1 (see HEARTH-notes) — "New bottle" reset is the
// common op, not delete, so a resurrect-from-stale-copy risk is accepted.
function mergeBottles(a, b) {
  var out = {};
  Object.keys(a||{}).concat(Object.keys(b||{})).forEach(function(k){
    if (k in out) return;
    var la = (a||{})[k], lb = (b||{})[k];
    if (la && lb) out[k] = ((lb.updated||0) >= (la.updated||0)) ? lb : la; // tie -> remote/b
    else out[k] = la || lb;
  });
  return out;
}
// ── Bag sync merge (v478) ───────────────────────────────────────
// Bags were the one baby collection still merged as `remote.bags || local.bags`
// — a WHOLESALE last-writer-wins, the exact class the v329 comment above says
// was removed for medicine. Reported 20/09/2026 as three symptoms with one
// cause: a bag created here vanished when the next pull landed, items added to
// an existing bag vanished with it, and both came back later when an older
// snapshot echoed off the SSE. Bags now union by id, and their items union by
// id inside them, newest-wins by `updated`, with tombstones for both halves so
// a delete still sticks.
//
// bagShape() is the other half of the same report and is load-bearing:
// **Firebase strips empty containers** (the v333 emptyPersonChecks lesson), so
// a brand-new bag pushed as {id,name,icon,items:[]} comes back off the echo
// with NO items key at all. That missing key threw a TypeError mid-render —
// which is why the new "Test" bag showed the PREVIOUS bag's item list (the tab
// row is written before the throw, the item list after it) and why "Add to
// bag" was a silent no-op. Every read goes through normaliseBags, so a bag can
// never reach a renderer or a handler without an items array. Firebase also
// returns a sparse array as an OBJECT, so both shapes are accepted on the way
// in. Do NOT "simplify" this back into a plain array assignment.
function bagItemShape(it, i, bagId) {
  if (!it || typeof it !== "object") return null;
  var id = (it.id == null || it.id === "") ? (bagId + "_i" + i) : String(it.id);
  return { id:id, name:String(it.name == null ? "" : it.name), packed:!!it.packed, updated:+it.updated || 0 };
}
function bagListOf(v) {   // array, Firebase's sparse-array-as-object, or nothing
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return Object.keys(v).map(function(k){ return v[k]; });
  return [];
}
function normaliseBags(arr) {
  var out = [];
  bagListOf(arr).forEach(function(b, i) {
    if (!b || typeof b !== "object") return;
    var id = (b.id == null || b.id === "") ? ("bag_x" + i) : String(b.id);
    var items = [];
    bagListOf(b.items).forEach(function(it, n){ var s = bagItemShape(it, n, id); if (s) items.push(s); });
    out.push({ id:id, name:String(b.name == null ? "" : b.name), icon:b.icon || "&#x1F45C;",
               items:items, updated:+b.updated || 0 });
  });
  return out;
}
// Union two item lists by id, local order first and remote-only items appended,
// newest-wins by `updated` (tie → remote, matching every other merge here).
function mergeBagItems(a, b) {
  var idx = {}, order = [];
  [a, b].forEach(function(arr) {
    (arr || []).forEach(function(it) {
      if (!it || it.id == null) return;
      if (!(it.id in idx)) order.push(it.id);
      var ex = idx[it.id];
      if (!ex || (it.updated || 0) >= (ex.updated || 0)) idx[it.id] = it;
    });
  });
  return order.map(function(k){ return idx[k]; });
}
function mergeBags(local, remote, bagTombs, itemTombs) {
  var idx = {}, order = [];
  [normaliseBags(local), normaliseBags(remote)].forEach(function(arr) {
    arr.forEach(function(bag) {
      var ex = idx[bag.id];
      if (!ex) { order.push(bag.id); idx[bag.id] = bag; return; }
      var win = (bag.updated >= ex.updated) ? bag : ex;   // tie → remote (second pass)
      idx[bag.id] = { id:win.id, name:win.name, icon:win.icon, updated:win.updated,
                      items:mergeBagItems(ex.items, bag.items) };
    });
  });
  return order.map(function(k) {
    var bag = idx[k];
    return { id:bag.id, name:bag.name, icon:bag.icon, updated:bag.updated,
             items:bag.items.filter(function(it) {       // deleted at/after its last edit → drop
               var ts = itemTombs ? itemTombs[it.id] : null;
               return !(ts != null && ts >= (it.updated || 0));
             }) };
  }).filter(function(bag) {
    var ts = bagTombs ? bagTombs[bag.id] : null;          // ditto for the bag itself
    return !(ts != null && ts >= bag.updated);
  });
}
function mergeBabyData(local, remote, medTombs, growthTombs, msTombs, bagTombs, bagItemTombs) {
  // v371: generalised from the old mergeMedicine (v329) — medicine and
  // milestones share the same shape (id-keyed, `updated` stamp falling back
  // to `id` for pre-migration entries). Growth keeps its own date-keyed
  // variant: the date IS the merge key, so it must never double as the
  // recency fallback (unstamped entries fall back to 0, tie → remote).
  function mergeIdKeyed(a, b, tombs) {
    var idx = {};
    [a, b].forEach(function(arr){                          // local first, remote second → remote wins ties
      (arr||[]).forEach(function(m){
        if (!m || m.id == null) return;
        var ex = idx[m.id];
        if (!ex || medUpdatedTs(m) >= medUpdatedTs(ex)) idx[m.id] = m;
      });
    });
    var out = Object.values(idx).filter(function(m){
      var ts = tombs ? tombs[m.id] : null;
      return !(ts != null && ts >= medUpdatedTs(m));       // deleted at/after last edit → drop
    });
    out.sort(function(x,y){ return y.id - x.id; });        // newest-first, matches the unshift add order
    return out;
  }
  function mergeDateKeyed(a, b, tombs) {
    var idx = {};
    [a, b].forEach(function(arr){                          // local first, remote second → remote wins ties
      (arr||[]).forEach(function(e){
        if (!e || e.date == null) return;
        var ex = idx[e.date];
        if (!ex || (e.updated||0) >= (ex.updated||0)) idx[e.date] = e;
      });
    });
    var out = Object.values(idx).filter(function(e){
      var ts = tombs ? tombs[e.date] : null;
      return !(ts != null && ts >= (e.updated||0));        // deleted at/after last edit → drop
    });
    out.sort(function(a,b){ return b.date.localeCompare(a.date); });
    return out;
  }
  var merged = {
    growth:     mergeDateKeyed(local.growth,   remote.growth,     growthTombs),
    medicine:   mergeIdKeyed(local.medicine,   remote.medicine,   medTombs),
    milestones: mergeIdKeyed(local.milestones, remote.milestones, msTombs),
    teeth:      Object.assign({}, local.teeth||{}, remote.teeth||{}),
    bottles:    mergeBottles(local.bottles,   remote.bottles),
    bags:       mergeBags(local.bags, remote.bags, bagTombs, bagItemTombs)
  };
  // v296: carry EVERY other key through generically (local wins when set,
  // remote fills gaps) — the babySex bug as a class. New Baby fields survive
  // sync without anyone having to remember to add them here.
  Object.keys(local).concat(Object.keys(remote)).forEach(function(k){
    if (k in merged) return;
    var lv = local[k], rv = remote[k];
    merged[k] = (lv === undefined || lv === null || lv === "") ? (rv !== undefined ? rv : lv) : lv;
  });
  return merged;
}

// Union two item lists by id (preserve adds from both sides); newest-wins on
// conflict by `updated` (tie → remote); then drop any id deleted at/after its
// last update. Returned newest-first to match the unshift add order.
function mergeListItems(localItems, remoteItems, tombs){
  var byId = {}, remoteIds = {}, push = false;
  (localItems||[]).forEach(function(it){ if (it && it.id != null) byId[it.id] = it; });
  (remoteItems||[]).forEach(function(it){
    if (!it || it.id == null) return;
    remoteIds[it.id] = it;
    var ex = byId[it.id];
    if (!ex || (it.updated||0) >= (ex.updated||0)) byId[it.id] = it;
  });
  var out = [];
  Object.keys(byId).forEach(function(k){
    var it = byId[k], ts = tombs ? tombs[it.id] : null;
    if (ts != null && ts >= (it.updated||0)) {        // deleted at/after last edit → drop
      if (remoteIds[it.id]) push = true;              // remote still has it → /shared stale
      return;
    }
    var rem = remoteIds[it.id];
    if (!rem || (it.updated||0) > (rem.updated||0)) push = true; // remote lacks/older → /shared stale
    out.push(it);
  });
  out.sort(function(a,b){ return (b.id||0) - (a.id||0); });
  return { items: out, push: push };   // push = our merged set is fuller/newer than remote → re-push to converge
}
function getItems() { return loadListData(currentList).items; }
function getHist()  { return loadListData(currentList).hist; }
function getCats()  { return getAllCats(currentList); }

// ============================================================
// DETECTION
// ============================================================
function detectCat(name) {
  if (!name) return "other";
  var low = name.toLowerCase();
  var kw = LIST_CONFIG[currentList].kw;
  for (var i = 0; i < kw.length; i++) {
    if (low.indexOf(kw[i][0]) !== -1) return kw[i][1];
  }
  return "other";
}
function getCat(id) {
  var cats = getCats();
  for (var i = 0; i < cats.length; i++) { if (cats[i].id === id) return cats[i]; }
  return cats[cats.length-1];
}
// v463: custom categories arrive unvalidated from backup import, household
// sync and personal sync, so bg/fg must be gated before hitting a style
// attribute — one gate, used at every category render site.
function catColorSafe(v, dflt) {
  return (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v)) ? v : (dflt || "#EDEAE4");
}
// v463 hotfix: every real category emoji (built-in AND custom -- the picker
// only ever assigns from the fixed CAT_EMOJIS list) is stored as ONE HTML
// numeric entity like "&#x1F966;" and rendered RAW so the browser decodes
// it -- esc()'ing it turns "&" into "&amp;" and shows the literal entity
// text instead of the emoji. So emoji gets its own gate, not esc(): accept
// only that exact entity shape, else fall back to a safe default.
function catEmojiSafe(v, dflt) {
  return (typeof v === "string" && /^&#x[0-9a-f]{1,8};$/i.test(v)) ? v : (dflt || "&#x1F4E6;");
}

// ============================================================
// STATE
// ============================================================
var currentList = "grocery";
var manualCatId = null;
var currentCatId = null;
var editItemId = null;   // item whose category we're editing (null = adding new)
var listData = { grocery:null, todo:null, travel:null, personal:null };

// ============================================================
// DOM REFS
// ============================================================
var elInput     = document.getElementById("itemInput");
var elAc        = document.getElementById("ac");
var elCatRow    = document.getElementById("catRow");
var elCatChip   = document.getElementById("catChip");
var elCatHint   = document.getElementById("catHint");
var elListC     = document.getElementById("listContent");
var elHistoryC  = document.getElementById("historyContent");
var elHdrBadge  = document.getElementById("hdrBadge");
var elListBadge = document.getElementById("listBadge");
var elClearBtn  = document.getElementById("clearBtn");
var elReopenBtn = document.getElementById("reopenBtn");
var elToast     = document.getElementById("toast");
var toastTimer  = null;

