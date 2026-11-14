// ============================================================
// INIT
// ============================================================
loadListData("grocery");
loadListData("todo");

// Clear mangled Firebase URL if it lacks a dot
if (hearthFbId && hearthFbId.indexOf(".") === -1) {
  hearthFbId = "";
  storeSet("hearth_fb", "");
}

// ============================================================
// TEST-BUILD DEMO DATA — phase 2: the seed (v407)
// ------------------------------------------------------------
// Laid down through importBackupData() — the SAME merge the real backup
// restore uses — rather than a pile of hand-written storeSet calls. That
// means the demo household can never drift into a shape the app doesn't
// already read, and a field added to the export payload becomes seedable
// here for free. The store is empty when this runs (phase 1 wiped it), so
// the additive merge is just a plain load.
//
// Every date is relative to today, so the demo always looks current: a trip
// starting next week, doses logged this morning, a meal plan covering the
// days ahead. Ids come off a fixed base so a reset is byte-identical each
// time — the same demo household on every PR, every time.
//
// The names are obvious placeholders. Nothing here can reach the real app
// or Firebase: sync, login and the cloud backup are hard-blocked in a test
// build, and this whole block is behind _isTestBuild.
// ============================================================
var _tsIdN = 0;
function _tsId()   { return 900000000000 + (++_tsIdN); }   // unique, deterministic, never collides with a Date.now() id
function _tsPad(n) { return n < 10 ? "0" + n : "" + n; }
function _tsDay(off) {                                     // "YYYY-MM-DD", off = days from today
  var d = new Date(); d.setDate(d.getDate() + off);
  return d.getFullYear() + "-" + _tsPad(d.getMonth() + 1) + "-" + _tsPad(d.getDate());
}
function _tsAt(off, hh, mm)  { return _tsDay(off) + "T" + _tsPad(hh) + ":" + _tsPad(mm || 0); } // datetime-local shape
function _tsTs(off, hh, mm) {                              // epoch ms
  var d = new Date(); d.setDate(d.getDate() + off); d.setHours(hh, mm || 0, 0, 0);
  return d.getTime();
}
// A history entry as the app writes one (name/catId/count/lastUsed/dates) —
// this is what makes the suggestion chips and "buy again" rows appear.
function _tsHist(name, catId, count, daysAgo) {
  return { name:name, catId:catId, count:count, lastUsed:_tsTs(-daysAgo, 17, 30),
           dates:[_tsDay(-daysAgo - 14), _tsDay(-daysAgo - 7), _tsDay(-daysAgo)] };
}
function _tsItem(name, catId, done, addedBy, daysAgo, dueDate) {
  var t = _tsTs(-(daysAgo || 0), 9, 0);
  return { id:_tsId(), name:name, catId:catId, done:!!done, dueDate:dueDate || null,
           addedBy:addedBy, updated:t, added:t };
}
function _tsNote(title, body, daysAgo) {
  var t = _tsTs(-daysAgo, 20, 0);
  return { id:_tsId(), title:title, body:body, createdAt:t, updatedAt:t };
}

function buildTestSeed() {
  _tsIdN = 0;   // restart the counter every call: the demo household must come out
                // with the SAME ids every time, or a re-seed lands as a second copy
                // of everything instead of being a no-op (importBackupData is
                // additive by id). Also what makes "reset" mean reset.
  var R1 = _tsId(), R2 = _tsId(), R3 = _tsId(), R4 = _tsId();   // recipe ids, needed by the meal plan below

  var seed = {
    version:5, exportedAt:new Date().toISOString(),
    lists:{}, notes:{}, customCats:{ grocery:[], todo:[], travel:[], personal:[] },

    // ── Lists ────────────────────────────────────────────
    // Enough breadth to exercise the renderers: several categories, some
    // ticked items, a due date, both household names, and history deep
    // enough that the suggestion chips have something to offer.
    // (assigned below — needs the helpers above)

    // ── Recipes + meal plan ──────────────────────────────
    recipebook:[
      { id:R1, name:"Demo Chicken Traybake", servings:4, kcal:520, category:"Dinner",
        ingredients:parseIngredients(
          "4 chicken thighs\n2 red peppers\n1 red onion\n400 g baby potatoes\n2 tbsp olive oil\n1 tsp smoked paprika\n1 lemon"),
        prep:"Halve the potatoes and cut the peppers into chunks.",
        method:"Heat the oven to 200C.\nToss everything on a big tray with the oil and paprika.\nRoast 35-40 minutes until the chicken is cooked through.\nSqueeze over the lemon before serving.",
        notes:"Demo recipe - safe to edit or delete.", url:"", fav:true, inRotation:true,
        updated:_tsTs(-20, 12, 0), addedBy:"Cathal" },
      { id:R2, name:"Demo Pasta Bake", servings:4, kcal:610, category:"Dinner",
        ingredients:parseIngredients(
          "300 g penne\n1 jar tomato sauce\n150 g cheddar\n1 courgette\n2 cloves garlic\n1 tbsp olive oil"),
        prep:"", method:"Cook the pasta.\nFry the courgette and garlic.\nStir through the sauce, top with cheese, bake 20 minutes.",
        notes:"", url:"", fav:false, inRotation:true, updated:_tsTs(-15, 12, 0), addedBy:"Petra" },
      { id:R3, name:"Demo Porridge", servings:2, category:"Breakfast",
        ingredients:parseIngredients("100 g porridge oats\n500 ml milk\n1 banana\n1 tbsp honey"),
        prep:"", method:"Simmer the oats and milk for 5 minutes, stirring. Top with sliced banana and honey.",
        notes:"", url:"", fav:false, inRotation:false, updated:_tsTs(-9, 8, 0), addedBy:"Cathal" },
      { id:R4, name:"Demo Fish Pie", servings:4, category:"Dinner",
        ingredients:parseIngredients(
          "500 g white fish\n600 g potatoes\n300 ml milk\n50 g butter\n2 tbsp plain flour\n100 g frozen peas"),
        prep:"Peel and quarter the potatoes.", method:"Boil and mash the potatoes with half the butter.\nMake a white sauce with the rest.\nFold in the fish and peas, top with mash, bake 25 minutes.",
        notes:"", url:"", fav:true, inRotation:true, updated:_tsTs(-4, 12, 0), addedBy:"Petra" }
    ],
    mealplan:[
      { day:_tsDay(0), recipeId:R1, servings:4, updated:_tsTs(-2, 10, 0), addedBy:"Cathal" },
      { day:_tsDay(1), recipeId:R2, servings:4, updated:_tsTs(-2, 10, 0), addedBy:"Cathal" },
      { day:_tsDay(3), recipeId:R4, servings:4, updated:_tsTs(-1, 10, 0), addedBy:"Petra" }
    ],
    // The reusable "add this recipe to the grocery list again" chip — a
    // different store to recipebook: {name, lines, updated}, names only.
    recipes:[
      { name:"Demo Sunday Roast", lines:["chicken", "potatoes", "carrots", "gravy granules"], updated:_tsTs(-11, 12, 0) }
    ],

    // ── Trip ─────────────────────────────────────────────
    // One trip starting next week with all four booking types, so the
    // timeline, the connecting-flight chain and every field the export map
    // carries (boarding/gate/seats/ref/connectsFrom) have real content.
    trips:[{
      id:_tsId(), name:"Demo Trip - Lisbon", start:_tsDay(7), end:_tsDay(11),
      updated:_tsTs(-5, 12, 0),
      bookings:[
        { id:_tsId(), type:"parking", title:"Long-term car park", start:_tsAt(7, 4, 30), end:_tsAt(11, 22, 0),
          location:"Cork Airport", ref:"PK-DEMO-118", notes:"Blue zone, level 2.",
          connectsFrom:false, boarding:"", gate:"", seats:"", updated:_tsTs(-5, 12, 0) },
        { id:_tsId(), type:"flight", title:"Cork to Lisbon", start:_tsAt(7, 6, 40), end:_tsAt(7, 9, 25),
          location:"ORK to LIS", ref:"DEMO123", notes:"Hand luggage only.",
          connectsFrom:false, boarding:"06:10", gate:"12", seats:"14A, 14B", updated:_tsTs(-5, 12, 0) },
        { id:_tsId(), type:"accommodation", title:"Demo Riverside Hotel", start:_tsAt(7, 15, 0), end:_tsAt(11, 11, 0),
          location:"Alfama, Lisbon", ref:"HTL-DEMO-77", notes:"Breakfast included. Late check-in arranged.",
          connectsFrom:false, boarding:"", gate:"", seats:"", updated:_tsTs(-5, 12, 0) },
        { id:_tsId(), type:"car", title:"Small hatchback", start:_tsAt(8, 9, 0), end:_tsAt(10, 18, 0),
          location:"Lisbon city desk", ref:"CAR-DEMO-45", notes:"Full-to-full fuel policy.",
          connectsFrom:false, boarding:"", gate:"", seats:"", updated:_tsTs(-5, 12, 0) },
        { id:_tsId(), type:"flight", title:"Lisbon to Cork", start:_tsAt(11, 19, 15), end:_tsAt(11, 22, 5),
          location:"LIS to ORK", ref:"DEMO456", notes:"",
          connectsFrom:false, boarding:"18:45", gate:"24", seats:"9C, 9D", updated:_tsTs(-5, 12, 0) }
      ]
    }],
    travel_tags:["Beach", "City break", "Baby kit"],

    // ── Baby ─────────────────────────────────────────────
    // Doses are logged a few hours back so the v291 interval advisories have
    // something real to compute against. Demo values only — this is sample
    // data for reviewing the UI, never a dosing reference.
    baby:{
      babySex:"f",
      growth:[
        { date:_tsDay(-56), weight:6.1, height:61, note:null, updated:_tsTs(-56, 11, 0) },
        { date:_tsDay(-28), weight:6.9, height:64, note:"4-month check", updated:_tsTs(-28, 11, 0) },
        { date:_tsDay(-3),  weight:7.4, height:66, note:null, updated:_tsTs(-3, 11, 0) }
      ],
      medicine:[
        { id:_tsId(), name:"Calpol Infant", dose:"5.0 ml", notes:"Demo entry - teething.", ts:_tsTs(0, 7, 30), updated:_tsTs(0, 7, 30) },
        { id:_tsId(), name:"Nurofen for Children", dose:"3.5 ml", notes:"Demo entry.", ts:_tsTs(-1, 21, 0), updated:_tsTs(-1, 21, 0) }
      ],
      milestones:[
        { id:_tsId(), text:"Rolled over on her own", date:_tsDay(-30), updated:_tsTs(-30, 18, 0) },
        { id:_tsId(), text:"First proper giggle",    date:_tsDay(-17), updated:_tsTs(-17, 18, 0) },
        { id:_tsId(), text:"Sat up unaided",         date:_tsDay(-6),  updated:_tsTs(-6, 18, 0) }
      ],
      teeth:{},
      bottles:{ calpol:{ key:"calpol", name:"Calpol Infant", openedTs:_tsTs(-40, 10, 0), useWithinDays:90, updated:_tsTs(-40, 10, 0) } },
      bags:[]
    },

    // ── Plants ───────────────────────────────────────────
    // Two plants with logs positioned either side of their watering
    // interval, so one reads "due" and one reads "fine" on the cards.
    plants:[
      { id:_tsId(), name:"Demo Monstera", latin:"Monstera deliciosa", room:"Sitting room", emoji:"🌿",
        waterDays:7, feedDays:28, photo:"",
        // v432 — a photo link so the detail view's outbound row renders on a
        // test build. The other demo plant deliberately has none, so both
        // states are reviewable from one link.
        photoLink:"https://commons.wikimedia.org/wiki/Category:Monstera_deliciosa",
        summary:"Big glossy leaves, very forgiving. Doing well since it moved off the windowsill.",
        watering:"A good soak when the top 3cm is dry - roughly weekly in summer, every 2 weeks in winter.",
        feeding:"Balanced houseplant feed at half strength, monthly from March to September.",
        light:"Bright indirect light. Scorches in direct afternoon sun.",
        repotting:"Every 2 years into a pot one size up.",
        propagation:"Cut below a node with an aerial root, root in water.",
        updated:_tsTs(-10, 12, 0),
        waterLog:[_tsTs(-9, 9, 0), _tsTs(-16, 9, 0)], feedLog:[_tsTs(-30, 9, 0)] },
      { id:_tsId(), name:"Demo Peace Lily", latin:"Spathiphyllum wallisii", room:"Bedroom", emoji:"🪴",
        waterDays:5, feedDays:30, photo:"",
        summary:"Tells you when it is thirsty - the leaves droop, then perk back up within the hour.",
        watering:"Water when the leaves start to droop, about every 5 days.",
        feeding:"Weak feed once a month in the growing season.",
        light:"Happy in lower light than most.",
        repotting:"Every couple of years, or when it dries out too fast.",
        propagation:"Split the clump when repotting.",
        updated:_tsTs(-8, 12, 0),
        // Deliberately deeper than the Monstera's two entries: the v416 care-history
        // card only shows its "Show all" toggle past PLANT_HISTORY_PREVIEW (5) days,
        // and tapping Log always stamps TODAY — which collapses into one row — so
        // without a plant carrying real history the toggle cannot be reviewed on a
        // test link at all. The -22 feed shares its day with a watering, so that row
        // reads "Watered + fed"; the Monstera's -30 feed has no paired watering, so
        // between the two plants the demo shows both shapes.
        waterLog:[_tsTs(-2, 9, 0), _tsTs(-7, 9, 0), _tsTs(-12, 9, 0), _tsTs(-17, 9, 0),
                  _tsTs(-22, 9, 0), _tsTs(-27, 9, 0), _tsTs(-32, 9, 0), _tsTs(-37, 9, 0)],
        feedLog:[_tsTs(-22, 9, 0)] }
    ],

    // ── Watchlist ────────────────────────────────────────
    watchlist:[
      { id:_tsId(), title:"Demo Film One", kind:"film", note:"Recommended by Dave.", link:"", season:"",
        summary:"A demo entry that already carries a summary, so the summary box is on screen without waiting for a fetch.", summarySrc:"Demo Film One (film)",
        watching:false, watched:false, watchedAt:0, rating:0, addedBy:"Cathal", added:_tsTs(-12, 20, 0), updated:_tsTs(-12, 20, 0) },
      { id:_tsId(), title:"Demo Series Two", kind:"tv", note:"", link:"", season:"2",
        summary:"", summarySrc:"",
        watching:true, watched:false, watchedAt:0, rating:0, addedBy:"Petra", added:_tsTs(-6, 20, 0), updated:_tsTs(-6, 20, 0) },
      { id:_tsId(), title:"Demo Film Three", kind:"film", note:"Watched on the plane.", link:"", season:"",
        summary:"", summarySrc:"",
        watching:false, watched:true, watchedAt:_tsTs(-2, 21, 0), rating:4, addedBy:"Cathal", added:_tsTs(-25, 20, 0), updated:_tsTs(-2, 21, 0) }
    ],

    // ── Home inventory (v424 as appliances, widened v428) ─
    // Three areas so the chip row shows (two named + one untagged), one still
    // in warranty and one out of it so both states of the warranty line are
    // reviewable, and a manual link so the detail view's outbound row renders.
    // v428 adds the insurance side: values on four of the five so the totals
    // card shows a real "N not valued yet", a receipt note, a photos link, and
    // two things that are NOT appliances — the whole point of the widening is
    // that a sofa and a bike belong on the same list as the dishwasher.
    appliances:[
      { id:_tsId(), name:"Demo Dishwasher", area:"Kitchen", brand:"Bosch", model:"SMS4HVI33E",
        serial:"FD-DEMO-9920014", fd:"0603", bought:_tsDay(-400), warranty:_tsDay(330),
        boughtFrom:"Demo Electrical, Cork", manual:"https://www.bosch-home.ie/",
        value:520, receipt:"Demo email, order 88214", photos:"",
        notes:"Salt goes in the cap under the bottom basket. Rinse aid every few months.",
        addedBy:"Cathal", added:_tsTs(-40, 12, 0), updated:_tsTs(-40, 12, 0) },
      { id:_tsId(), name:"Demo Washing Machine", area:"Utility", brand:"Whirlpool", model:"FFB9458BVEE",
        serial:"WM-DEMO-4471", bought:_tsDay(-1500), warranty:_tsDay(-770),
        boughtFrom:"Demo Electrical, Cork", manual:"",
        value:430, receipt:"", photos:"",
        notes:"Filter behind the bottom flap - clean it twice a year.",
        addedBy:"Petra", added:_tsTs(-30, 12, 0), updated:_tsTs(-30, 12, 0) },
      { id:_tsId(), name:"Demo Lawnmower", area:"", brand:"Flymo", model:"EasiMow 300R",
        serial:"", bought:"", warranty:"", boughtFrom:"", manual:"",
        value:"", receipt:"", photos:"",
        notes:"Spare blade in the shed.",
        addedBy:"Cathal", added:_tsTs(-18, 12, 0), updated:_tsTs(-18, 12, 0) },
      { id:_tsId(), name:"Demo Sofa", area:"Kitchen", brand:"Demo Furniture Co", model:"",
        serial:"", bought:_tsDay(-900), warranty:"", boughtFrom:"Demo Furniture, Cork",
        value:1400, receipt:"Folder in the desk", photos:"https://example.com/demo-photos",
        notes:"Three-seater. Covers are washable at 30.",
        addedBy:"Petra", added:_tsTs(-12, 12, 0), updated:_tsTs(-12, 12, 0) },
      { id:_tsId(), name:"Demo Bike", area:"Utility", brand:"Giant", model:"Escape 3",
        serial:"BK-DEMO-77120", bought:_tsDay(-220), warranty:"", boughtFrom:"Demo Cycles",
        value:600, receipt:"Demo email, order 41007", photos:"",
        notes:"Frame number is under the bottom bracket.",
        addedBy:"Cathal", added:_tsTs(-8, 12, 0), updated:_tsTs(-8, 12, 0) }
    ],

    // ── Health — the medical history (v449) ─────────────
    // Nine records across three people, and deliberately not nine
    // interchangeable ones — three people is what makes the person chips
    // appear on a test link; one future visit plus one future test is what
    // fills "Coming up" and the Home line; past visits, a diagnosis, a test
    // with a result and a vaccination are what make the mixed History feed
    // actually read as a history rather than one row; and a condition plus a
    // medication are what pin the two standing groups above it. Two records
    // carry FILES so the 📎 chip and the links row are both reviewable.
    // Keep that shape if you edit them. Dates are relative (_tsDay) for the
    // usual reason: a hard-coded one slides into the past and the countdown
    // stops being demoed.
    health:[
      { id:_tsId(), kind:"visit", person:"Cathal", title:"Demo GP appointment",
        date:_tsDay(6), time:"09:20", who:"Dr Demo", dose:"", expiry:"", outcome:"",
        location:"Demo Family Practice", phone:"021 000 0001", link:"", files:[],
        notes:"Bring the letter from the physio.",
        addedBy:"Cathal", added:_tsTs(-11, 10, 0), updated:_tsTs(-11, 10, 0) },
      { id:_tsId(), kind:"test", person:"Petra", title:"Demo blood test",
        date:_tsDay(12), time:"08:15", who:"Dr Demo", dose:"", expiry:"", outcome:"",
        location:"Demo Family Practice", phone:"", link:"", files:[],
        notes:"Fasting from midnight.",
        addedBy:"Petra", added:_tsTs(-4, 10, 0), updated:_tsTs(-4, 10, 0) },
      { id:_tsId(), kind:"visit", person:"Cathal", title:"Demo back pain review",
        date:_tsDay(-38), time:"11:30", who:"Dr Demo", dose:"", expiry:"",
        outcome:"Examined the lower back. Sent for an MRI and said to keep moving \u2014 no bed rest. Physio referral to follow.",
        location:"Demo Family Practice", phone:"021 000 0001", link:"",
        files:[{ label:"Referral letter", url:"https://example.com/demo-referral" }],
        notes:"",
        addedBy:"Cathal", added:_tsTs(-38, 12, 0), updated:_tsTs(-38, 12, 0) },
      { id:_tsId(), kind:"test", person:"Cathal", title:"Demo MRI, lower back",
        date:_tsDay(-24), time:"", who:"Dr Demo", dose:"", expiry:"",
        outcome:"Disc bulge at L4/L5 and mild narrowing at L5/S1. Nothing needing surgery.",
        location:"Demo Imaging Centre", phone:"", link:"",
        files:[{ label:"MRI report", url:"https://example.com/demo-mri" },
               { label:"Images", url:"https://example.com/demo-mri-images" }],
        notes:"",
        addedBy:"Cathal", added:_tsTs(-24, 12, 0), updated:_tsTs(-24, 12, 0) },
      { id:_tsId(), kind:"diagnosis", person:"Cathal", title:"Demo disc bulge, L4/L5",
        date:_tsDay(-22), time:"", who:"Dr Demo", dose:"", expiry:"", outcome:"",
        location:"", phone:"", link:"", files:[],
        notes:"Managed with physio rather than anything surgical.",
        addedBy:"Cathal", added:_tsTs(-22, 12, 0), updated:_tsTs(-22, 12, 0) },
      { id:_tsId(), kind:"vaccination", person:"Baby", title:"Demo MMR, first dose",
        date:_tsDay(-52), time:"", who:"", dose:"", expiry:"", outcome:"",
        location:"Demo Health Centre", phone:"", link:"", files:[], notes:"",
        addedBy:"Petra", added:_tsTs(-52, 10, 0), updated:_tsTs(-52, 10, 0) },
      { id:_tsId(), kind:"condition", person:"Cathal", title:"Demo penicillin allergy",
        date:_tsDay(-2200), time:"", who:"", dose:"", expiry:"", outcome:"",
        location:"", phone:"", link:"", files:[],
        notes:"Rash as a child. Tell any new doctor or dentist.",
        addedBy:"Cathal", added:_tsTs(-70, 10, 0), updated:_tsTs(-70, 10, 0) },
      { id:_tsId(), kind:"medication", person:"Cathal", title:"Demo Antihistamine",
        date:_tsDay(-90), time:"", who:"Dr Demo", dose:"10 mg, one tablet in the morning",
        expiry:_tsDay(9),
        outcome:"", location:"Demo Pharmacy, Carrigaline", phone:"021 000 0002",
        link:"", files:[],
        notes:"Repeat \u2014 phone ahead a few days before it runs out.",
        addedBy:"Cathal", added:_tsTs(-22, 10, 0), updated:_tsTs(-22, 10, 0) },
      { id:_tsId(), kind:"contact", person:"", title:"Demo Family Practice",
        date:"", time:"", who:"GP", dose:"", expiry:"", outcome:"",
        location:"1 Demo Street, Carrigaline", phone:"021 000 0001", link:"", files:[],
        notes:"Open 08:30-17:00. Out of hours goes to the demo co-op line.",
        addedBy:"Cathal", added:_tsTs(-60, 10, 0), updated:_tsTs(-60, 10, 0) }
    ],

    // Projects (v499): one of each status that matters on screen. The
    // kitchen project is In progress and carries both item types, one
    // overdue task (so the red count shows on Home and on the card), one
    // task already copied to To-do, and two v512 groups plus an ungrouped
    // task (so the detail shows both layouts). The
    // Idea project has an open task on purpose: it must NOT count on Home.
    projects:[
      { id:_tsId(), name:"Demo kitchen refit", status:"active", target:_tsDay(40),
        notes:"New worktops and splashback. Keep the existing units.",
        addedBy:"Cathal", added:_tsTs(-30, 10, 0), updated:_tsTs(-30, 10, 0),
        items:[
          { id:_tsId(), type:"task", title:"Demo: measure the worktops", group:"Worktops", order:2, date:_tsDay(-3), amount:"", who:"", phone:"", url:"", notes:"", done:false, sentAt:0,
            addedBy:"Cathal", added:_tsTs(-30, 10, 0), updated:_tsTs(-30, 10, 0) },
          { id:_tsId(), type:"task", title:"Demo: get three worktop quotes", group:"Worktops", order:1, date:_tsDay(12), amount:"", who:"", phone:"", url:"", notes:"", done:false, sentAt:0,
            addedBy:"Petra", added:_tsTs(-29, 10, 0), updated:_tsTs(-1, 10, 0) },
          { id:_tsId(), type:"task", title:"Demo: pick the splashback tiles", group:"Splashback", order:"", date:_tsDay(5), amount:"", who:"", phone:"", url:"", notes:"", done:false, sentAt:_tsTs(-2, 9, 0),
            addedBy:"Petra", added:_tsTs(-10, 10, 0), updated:_tsTs(-2, 9, 0) },
          { id:_tsId(), type:"task", title:"Demo: clear out the cupboards", group:"", order:"", date:"", amount:"", who:"", phone:"", url:"", notes:"", done:true, sentAt:0,
            addedBy:"Petra", added:_tsTs(-28, 10, 0), updated:_tsTs(-20, 10, 0) },
          { id:_tsId(), type:"link", title:"Demo worktop colours", group:"Worktops", order:"", date:"", amount:"", who:"", phone:"", url:"https://example.com/demo-worktops", notes:"", done:false, sentAt:0,
            addedBy:"Petra", added:_tsTs(-15, 10, 0), updated:_tsTs(-15, 10, 0) }
        ] },
      { id:_tsId(), name:"Demo car tax renewal", status:"planning", target:_tsDay(18), notes:"",
        addedBy:"Petra", added:_tsTs(-5, 10, 0), updated:_tsTs(-5, 10, 0),
        items:[
          { id:_tsId(), type:"task", title:"Demo: find the renewal letter", group:"", order:"", date:_tsDay(10), amount:"", who:"", phone:"", url:"", notes:"", done:false, sentAt:0,
            addedBy:"Petra", added:_tsTs(-5, 10, 0), updated:_tsTs(-5, 10, 0) }
        ] },
      { id:_tsId(), name:"Demo garden shed", status:"idea", target:"", notes:"Somewhere for the bikes.",
        addedBy:"Cathal", added:_tsTs(-45, 10, 0), updated:_tsTs(-45, 10, 0),
        items:[
          { id:_tsId(), type:"task", title:"Demo: look at shed sizes", group:"", order:"", date:"", amount:"", who:"", phone:"", url:"", notes:"", done:false, sentAt:0,
            addedBy:"Cathal", added:_tsTs(-45, 10, 0), updated:_tsTs(-45, 10, 0) }
        ] },
      { id:_tsId(), name:"Demo hall repaint", status:"done", target:_tsDay(-60), notes:"",
        addedBy:"Cathal", added:_tsTs(-90, 10, 0), updated:_tsTs(-58, 10, 0),
        items:[
          { id:_tsId(), type:"task", title:"Demo: buy the paint", group:"", order:"", date:_tsDay(-62), amount:"", who:"", phone:"", url:"", notes:"Two tins of white, about €96.", done:true, sentAt:0,
            addedBy:"Cathal", added:_tsTs(-62, 10, 0), updated:_tsTs(-62, 10, 0) }
        ] }
    ],

    // Golf (v500): an 18-hole and a 9-hole course; two complete 18-hole
    // rounds (so best and average differ), one part-played round (the
    // "thru 9" row, which must count in neither) and one 9-hole round.
    // v501: the 18-hole course has stroke indexes, Cathal plays off 18, and
    // the -12 round has a partner off 12 — so the scorecard shows Stableford
    // for both and six highlighted holes (SI 13–18) where Cathal gets a shot
    // the partner doesn't. The 9-hole course has no SI, to show that state.
    golf:(function(){
      var c18 = _tsId(), c9 = _tsId();
      var p18 = [4,4,3,5,4,4,3,4,5, 4,3,4,5,4,4,3,4,5], p9 = [3,3,3,3,3,3,3,3,3];
      var si18 = [7,11,15,1,3,13,17,9,5, 8,16,12,2,4,10,18,14,6];
      // v505: metres from the white tees, so the scorecard shows a distance per hole.
      var d18 = [319,383,335,489,323,354,153,391,512, 360,146,342,498,365,371,153,330,520];
      var blank9 = ["","","","","","","","",""], blank18 = blank9.concat(blank9);
      function rnd(off, cid, name, pars, si, strokes, notes, extra) {
        var o = { id:_tsId(), kind:"round", date:_tsDay(off), courseId:cid, courseName:name, holes:pars.length,
                  pars:pars, si:si, strokes:strokes, myHcp:si[0] === "" ? "" : 18, partner:"", partnerHcp:"",
                  pStrokes:pars.length === 9 ? blank9 : blank18, notes:notes,
                  dist:cid === c18 ? d18 : blank9, unit:"m",
                  addedBy:"Cathal", added:_tsTs(off, 18, 0), updated:_tsTs(off, 18, 0) };
        Object.keys(extra || {}).forEach(function(k){ o[k] = extra[k]; });
        return o;
      }
      return [
        { id:c18, kind:"course", name:"Demo Links", holes:18, pars:p18, si:si18, dist:d18, unit:"m", notes:"Book tee times online.",
          addedBy:"Cathal", added:_tsTs(-60, 10, 0), updated:_tsTs(-60, 10, 0) },
        { id:c9, kind:"course", name:"Demo Pitch & Putt", holes:9, pars:p9, si:blank9, dist:blank9, unit:"m", notes:"",
          addedBy:"Cathal", added:_tsTs(-50, 10, 0), updated:_tsTs(-50, 10, 0) },
        rnd(-30, c18, "Demo Links", p18, si18, [5,5,4,6,5,4,3,5,6, 5,4,5,6,5,4,4,5,6], "Windy."),
        rnd(-12, c18, "Demo Links", p18, si18, [5,4,3,6,5,5,3,4,5, 5,3,5,6,4,5,3,5,6], "Birdie on the 9th.",
            { partner:"Demo Pat", partnerHcp:12, pStrokes:p18.map(function(p){ return p + 1; }) }),
        rnd(-3,  c18, "Demo Links", p18, si18, [4,5,4,5,5,4,4,5,6].concat(blank9), "Rain stopped play."),
        rnd(-5,  c9,  "Demo Pitch & Putt", p9, blank9, [3,4,3,2,3,4,3,3,4], "")
      ];
    })(),

    // ── Train / Track ────────────────────────────────────
    workouts:{
      workouts:[
        { id:_tsId(), date:_tsDay(-2), exercises:[
          { name:"Squat",      sets:[{weight:60,reps:8},{weight:60,reps:8},{weight:65,reps:6}], notes:"Felt strong — go up 5kg next time." },
          { name:"Bench press",sets:[{weight:45,reps:8},{weight:45,reps:8}], notes:"" }
        ]},
        { id:_tsId(), date:_tsDay(-5), exercises:[
          { name:"Deadlift",   sets:[{weight:80,reps:5},{weight:85,reps:5}], notes:"Lower back a bit tight on the second set." }
        ]}
      ],
      bodyweight:[
        { date:_tsDay(-1),  weight:82.4 },
        { date:_tsDay(-8),  weight:83.1 },
        { date:_tsDay(-15), weight:83.6 },
        // v486: same day as Me's first entry on purpose -- bodyweight merges by person+date.
        { date:_tsDay(-1),  weight:64.2, person:"wife" },
        { date:_tsDay(-8),  weight:64.8, person:"wife" }
      ],
      bp:[
        { ts:_tsTs(-1, 8, 0),  date:_tsDay(-1),  sys:124, dia:78, pulse:62 },
        { ts:_tsTs(-9, 8, 15), date:_tsDay(-9),  sys:128, dia:81, pulse:66 }
      ]
    },
    // Pull-up Plan (v482): Week 1 Session 1 finished, Session 2 part-way.
    pullup:{ checks:{
      "0-0-0":[true,true,true], "0-0-1":[true,true,true], "0-0-2":[true,true,true], "0-0-3":[true,true,true],
      "0-1-0":[true,true,true], "0-1-1":[true,false,false]
    }, test:"", logged:{} },
    action_log:[
      { id:_tsId(), text:"Demo: put the bins out", ts:_tsTs(-1, 19, 0) },
      { id:_tsId(), text:"Demo: booked the dentist", ts:_tsTs(-4, 11, 0) },
      { id:_tsId(), text:"Demo: yoga class", ts:_tsTs(-2, 18, 30), person:"wife" },
      { id:_tsId(), text:"Demo: first swim lesson", ts:_tsTs(-3, 10, 0), person:"daughter" }
    ],
    track_med:[
      { id:_tsId(), name:"Demo vitamin D", dose:"1 tablet", notes:"", ts:_tsTs(0, 8, 0), updated:_tsTs(0, 8, 0) },
      { id:_tsId(), name:"Demo antihistamine", dose:"10 mg", notes:"Hay fever.", ts:_tsTs(-1, 8, 0), updated:_tsTs(-1, 8, 0) },
      { id:_tsId(), name:"Demo iron supplement", dose:"1 tablet", notes:"", ts:_tsTs(0, 9, 0), updated:_tsTs(0, 9, 0), person:"wife" },
      // Not Calpol/Nurofen on purpose: those belong in Baby -> Medicine (see trkMedBabyNote).
      { id:_tsId(), name:"Demo teething gel", dose:"pea-sized", notes:"", ts:_tsTs(-1, 20, 0), updated:_tsTs(-1, 20, 0), person:"daughter" }
    ],
    food_log:[
      // meal is an INDEX into MEAL_TYPES (0 Breakfast, 1 Lunch, 2 Dinner, 3 Snack),
      // never a name — see foodMealIndex. Seeding names here (v407-v433) put
      // 770 kcal of demo food into the day's total under no meal heading.
      { id:_tsId(), date:_tsDay(0),  meal:0, text:"Porridge and banana", cal:320, calAuto:true },
      { id:_tsId(), date:_tsDay(0),  meal:1, text:"Chicken sandwich",    cal:450, calAuto:true },
      { id:_tsId(), date:_tsDay(-1), meal:2, text:"Pasta bake",          cal:680, calAuto:false },
      { id:_tsId(), date:_tsDay(0),  meal:0, text:"Yoghurt and granola", cal:310, calAuto:false, person:"wife" },
      { id:_tsId(), date:_tsDay(0),  meal:0, text:"Toast soldiers",      cal:0,   calAuto:false, person:"daughter" }
    ],
    food_notes:{},
    saved_meals:[
      // Two on purpose (v442): the first is all auto-estimated, so "Make
      // recipe" leaves its kcal blank; the second is all hand-typed, so the
      // total carries. Both branches of savedMealCalories visible on a test build.
      { id:_tsId(), name:"Demo usual breakfast",
        items:[{ text:"Porridge and banana", cal:320, calAuto:true }, { text:"Coffee", cal:10, calAuto:true }] },
      { id:_tsId(), name:"Demo counted lunch",
        items:[{ text:"Chicken sandwich", cal:450, calAuto:false }, { text:"Apple", cal:80, calAuto:false }] }
    ],
    cal_goal:2200,
    cal_goal_ts:_tsTs(-3, 20, 0),
    profile:{ sex:"m", heightCm:178, birthYear:1985, activity:1.375, rate:0.5, goalKg:78 },
    profile_ts:_tsTs(-3, 20, 0)
    // syncPrefs is deliberately NOT seeded: importBackupData doesn't apply it,
    // and it is read into a var at parse time anyway, so a value written here
    // would sit in storage doing nothing. The built-in defaults are correct.
  };

  // Lists — built out here so the helpers above are in scope.
  seed.lists.grocery = {
    items:[
      _tsItem("Milk",            "dairy",    false, "Cathal", 1),
      _tsItem("Sourdough loaf",  "bakery",   false, "Petra",  1),
      _tsItem("Chicken thighs",  "meat",     false, "Cathal", 0),
      _tsItem("Red peppers",     "produce",  false, "Cathal", 0),
      _tsItem("Baby potatoes",   "produce",  false, "Cathal", 0),
      _tsItem("Cheddar",         "dairy",    true,  "Petra",  2),
      _tsItem("Kitchen roll",    "cleaning", false, "Petra",  3),
      _tsItem("Nappies size 3",  "personal", false, "Petra",  2)
    ],
    hist:[
      _tsHist("Milk", "dairy", 24, 1), _tsHist("Bread", "bakery", 18, 2),
      _tsHist("Eggs", "dairy", 15, 3), _tsHist("Bananas", "produce", 12, 2),
      _tsHist("Chicken thighs", "meat", 9, 6), _tsHist("Coffee", "drinks", 7, 8),
      _tsHist("Kitchen roll", "cleaning", 6, 10), _tsHist("Cheddar", "dairy", 5, 4)
    ]
  };
  seed.lists.todo = {
    items:[
      _tsItem("Demo: book the car service", "errands", false, "Cathal", 2, _tsDay(4)),
      _tsItem("Demo: pay the bin charge",   "finance", false, "Petra",  3, _tsDay(1)),
      _tsItem("Demo: fix the shed door",    "home",    false, "Cathal", 6),
      _tsItem("Demo: ring the creche",      "family",  true,  "Petra",  1)
    ],
    hist:[ _tsHist("Bins out", "home", 30, 1), _tsHist("Car service", "errands", 3, 90) ]
  };
  seed.lists.personal = {
    items:[
      _tsItem("Demo: renew the passport", "personal", false, "Cathal", 5, _tsDay(21)),
      _tsItem("Demo: dentist checkup",    "health",   false, "Cathal", 8)
    ],
    hist:[]
  };
  seed.lists.travel = {
    items:[
      _tsItem("Passports",       "documents",   true,  "Cathal", 3),
      _tsItem("Buggy",           "luggage",     false, "Petra",  2),
      _tsItem("Suncream",        "toiletries",  false, "Petra",  2),
      _tsItem("Phone chargers",  "electronics", false, "Cathal", 2),
      _tsItem("Calpol",          "health",      false, "Petra",  1)
    ],
    hist:[ _tsHist("Passports", "documents", 8, 60), _tsHist("Suncream", "toiletries", 5, 120) ]
  };

  seed.notes.grocery  = [_tsNote("Demo: shop notes", "Aldi has the nappies on offer this week.", 2)];
  seed.notes.todo     = [];
  seed.notes.travel   = [_tsNote("Demo: packing reminders", "Check the buggy folds into the boot before we go.", 4)];
  seed.notes.personal = [];
  seed.notes.global   = [
    _tsNote("Demo note", "This is sample data. Nothing here is real and nothing syncs anywhere.", 1),
    _tsNote("Demo: wifi code", "Guest network: demo-guest / demo1234", 30)
  ];
  seed.notes.global_work = [_tsNote("Demo: work note", "Standup moved to 09:30 on Tuesdays.", 5)];

  return seed;
}

// The banner's reset. Wipes and RELOADS — it deliberately does NOT seed here.
//
// v408 fix (Cathal 09/08/2026: "resetting doesn't restore all data … the
// status didn't change, newly done remained done"). v407 wiped storage and
// then called importBackupData on the LIVE page, which quietly did almost
// nothing: `loadListData` hands back the in-memory `listData` whenever it is
// populated, so the merge ran against the copies the page was already holding
// — and importBackupData is additive BY ID, so every seeded item whose id was
// already in memory got filtered out as "already here" and the edited copy
// survived, then got written straight back to storage. Deletions did come
// back (a deleted id isn't in memory, so the seed's copy was genuinely new),
// which is what made it look like a partial reset rather than a broken one.
// Anything edited IN PLACE — a tick, a rename, a due date — did not.
//
// Wiping the marker along with everything else (it is `fl4_`-prefixed, so
// wipeTestStore takes it) routes the reset through exactly the same phase-1 /
// phase-2 path as the once-per-version auto-seed, where the wipe lands before
// any module-level code reads storage and the seed lands in genuinely empty
// memory. One code path, one behaviour, and "reset" means reset.
// Do NOT "optimise" the reload away — pinned by tests/cases/39-test-build-reset.js.
function resetTestData() {
  if (!_isTestBuild) return;                      // belt and braces — never on the real app
  try {
    wipeTestStore();                              // clears fl4_*, INCLUDING the fl4_testseed marker
  } catch (e) {
    console.error("Demo data reset failed:", e);
  }
  location.reload();                              // phase 1 finds no marker → wipes → phase 2 seeds fresh
}

if (_testSeedPending) {
  try {
    importBackupData(buildTestSeed());
    storeSet(TEST_SEED_KEY, testBuildVersion());
  } catch (e) {
    // A broken seed must never cost you the test build itself — the app
    // still boots, just empty, and the console says why.
    console.error("Demo data seed failed:", e);
    storeSet(TEST_SEED_KEY, testBuildVersion());   // don't wipe again on every reload
  }
}

// The orange banner doubles as the reset control in test builds.
if (_isTestBuild) {
  var _tbBan = document.getElementById("testBuildBanner");
  if (_tbBan) {
    _tbBan.style.pointerEvents = "auto";
    _tbBan.style.cursor = "pointer";
    _tbBan.setAttribute("role", "button");
    _tbBan.setAttribute("tabindex", "0");
    _tbBan.addEventListener("click", function() {
      confirmDialog("Put the demo data back? Anything you have changed in this test build is wiped and the sample household is reloaded. The real app is not touched.", resetTestData);
    });
  }
}

// v420 — the tainted-store banner's clear. Wipes this device's copy and
// RELOADS; it never touches Firebase, and it cannot run while the store is
// untainted. Your login survives (hearth_* is outside the fl4_ namespace), so
// the reload logs straight back in and pulls the household down clean.
function clearTaintedStore() {
  if (!_seedTainted) return;                      // belt and braces — only ever on a tainted store
  try {
    wipeTestStore();                              // clears fl4_*, INCLUDING the fl4_testseed marker
  } catch (e) {
    console.error("Tainted store clear failed:", e);
  }
  location.reload();                              // no marker on the way back → no banner, sending back on
}

if (_seedTainted) {
  var _stBan = document.getElementById("seedTaintBanner");
  if (_stBan) {
    _stBan.style.pointerEvents = "auto";
    _stBan.style.cursor = "pointer";
    _stBan.setAttribute("role", "button");
    _stBan.setAttribute("tabindex", "0");
    _stBan.addEventListener("click", function() {
      confirmDialog("Clear this device's data? It came from a test build, so it may contain demo records. Nothing in Firebase is touched — this device reloads and pulls the household down fresh.", clearTaintedStore);
    });
  }
}

// v467: keep any focused bottom sheet above the mobile keyboard. This is
// deliberately event-driven rather than a list of sheet ids: new dynamic
// sheets inherit the same behaviour as soon as one of their inputs is focused.
//
// v476 narrowed BOTH of its triggers, because between them they made every
// button inside the session overlay need two taps:
//
//   1. A BOTTOM SHEET is bottom-anchored and shorter than the screen. The old
//      test also matched a full-screen fixed panel (`inset === "0px"`, or
//      top:0 AND bottom:0) - #sessionOverlay, confirmDialog's backdrop - which
//      then took `max-height:85vh!important` and shrank away from the bottom
//      of the screen, flashing the bottom nav into view behind it.
//   2. Only a control that RAISES THE KEYBOARD should move a sheet at all.
//      v467 reacted to any focusin, so tapping a plain <button> re-laid-out
//      the panel under the finger mid-tap and the click never landed.
//
// Do NOT widen either one back to "any fixed element" or "any focusin": the
// double-tap and the nav flash are what that costs.
function keyboardSheetOwner(node) {
  var cur = node;
  while (cur && cur !== document.body) {
    if (cur.classList && cur.classList.contains("overlay")) return cur;
    var cs = window.getComputedStyle(cur);
    if (cs.position === "fixed" && cs.bottom === "0px" && cs.top !== "0px") return cur;
    cur = cur.parentElement;
  }
  return null;
}
// Text entry only. A <select>, a checkbox or a button opens no keyboard, so
// nothing should shift for them. Unknown/absent type reads as text, which is
// what the browser does too.
function raisesSoftKeyboard(el) {
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  var tag = el.tagName.toLowerCase();
  if (tag === "textarea") return true;
  if (tag !== "input") return false;
  return !/^(button|checkbox|color|date|datetime-local|file|hidden|image|month|radio|range|reset|submit|time|week)$/
    .test((el.getAttribute("type") || "text").toLowerCase());
}
function installKeyboardSheetSupport() {
  if (!window.visualViewport) return;
  var vv = window.visualViewport;
  function update() {
    var inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty("--keyboard-inset", inset + "px");
    if (inset < 40) {
      document.querySelectorAll(".keyboard-sheet-offset").forEach(function(el){
        el.classList.remove("keyboard-sheet-offset");
      });
    }
  }
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  document.addEventListener("focusin", function(e) {
    if (!raisesSoftKeyboard(e.target)) return;
    var owner = keyboardSheetOwner(e.target);
    if (!owner) return;
    document.querySelectorAll(".keyboard-sheet-offset").forEach(function(el){
      if (el !== owner) el.classList.remove("keyboard-sheet-offset");
    });
    owner.classList.add("keyboard-sheet-offset");
    setTimeout(function(){
      update();
      var rect = e.target.getBoundingClientRect();
      var bottom = vv.offsetTop + vv.height - 14;
      if (rect.bottom > bottom || rect.top < vv.offsetTop) {
        e.target.scrollIntoView({ block:"center", behavior:"smooth" });
      }
    }, 250);
  });
  update();
}
installKeyboardSheetSupport();

var bootSection = "home";

// Wrapped in v356: a throw anywhere in here used to abort the rest of the
// script, so the boot gate below never ran and its splash-hiding deadline
// was never armed — the app sat behind the splash forever. Boot failing is
// still a bug, but it must never take the whole screen down with it.
try {
  if (_isTestBuild) {
    // Test builds never talk to Firebase — skip login/session entirely.
    hideLoginOverlay();
    switchSection(bootSection);
  } else if (isLoggedIn()) {
    verifySession();
  } else if (_isPreview) {
    hideLoginOverlay();
    switchSection(bootSection);
  } else {
    showLoginOverlay();
  }
} catch (bootErr) {
  console.error("Boot init failed:", bootErr);
}

try { applySectionVisibility(); } catch (visErr) { console.error("applySectionVisibility failed:", visErr); }

