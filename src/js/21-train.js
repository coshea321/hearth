// ============================================================
// TRAIN MODULE
// ============================================================

// ── Chime ─────────────────────────────────────────────────
function playChime(){
  try{
    var ctx=new(window.AudioContext||window.webkitAudioContext)();
    [523.25,659.25,783.99].forEach(function(f,i){
      var o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);o.type='sine';o.frequency.value=f;
      var t=ctx.currentTime+i*0.12;
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.25,t+0.04);
      g.gain.exponentialRampToValueAtTime(0.001,t+1.1);
      o.start(t);o.stop(t+1.1);
    });
  }catch(e){}
}
// v514: one soft, low single tone at the halfway point of a long timed hold
// (yoga pose or physio hold of HALFWAY_MIN_SEC or more). Deliberately a single
// quiet note, not the 3-note end chime, so it never reads as "pose over".
var HALFWAY_MIN_SEC = 60;
function isHalfwayTick(dur, remaining) {
  return dur >= HALFWAY_MIN_SEC && remaining === Math.floor(dur/2);
}
function playHalfwayTone(){
  try{
    var ctx=new(window.AudioContext||window.webkitAudioContext)();
    var o=ctx.createOscillator(),g=ctx.createGain();
    o.connect(g);g.connect(ctx.destination);o.type='sine';o.frequency.value=440;
    var t=ctx.currentTime;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.12,t+0.04);
    g.gain.exponentialRampToValueAtTime(0.001,t+0.6);
    o.start(t);o.stop(t+0.6);
  }catch(e){}
}

// ── Program data ──────────────────────────────────────────
// v446: reviewed against the precise history — a 4 cm hiatus hernia, mild bilateral L5/S1
// foraminal stenosis and an L4/L5 disc bulge. Exercise `id`s are the key BOTH the workout
// history and wktLastEntries' prefill hang off, so ids are frozen; two `name`s changed
// because the safe variation IS the change (Rows -> chest-supported, Dips -> bench).
// Shown on the intro screen (note) and on each superset card (cue).
var WK_TRAIN_NOTE = "Reviewed 30/08/2026 against a 4 cm hiatus hernia, mild bilateral L5/S1 foraminal stenosis and an L4/L5 disc bulge. Two rules run through the whole session. Breathe out on the effort and never hold your breath under load — a held breath is exactly the pressure spike a hernia this size does not want. And keep the lower back in the middle of its range, neither arched nor rounded: arching closes the L5/S1 foramen, rounding under load is what an L4/L5 bulge feels. Train at least 2–3 hours after eating, and not in the first hour after waking. Stop for regurgitation, chest or upper-abdominal pressure, or symptoms travelling further down a leg. New saddle numbness, bladder or bowel changes, foot drop or progressive weakness need urgent medical assessment.";

// Beginner days (v507) — plain beginner guidance for someone with no medical
// history; NOT the clinical note above. Its own conditioning, for the same reason.
var WK_BEGINNER_NOTE = "Beginner plan — two rounds of each pair for the first 3–4 weeks. Finish every set with 2–3 good reps still in the tank; never train to failure. Breathe out on the effort. When every set feels easy for two sessions in a row, make ONE thing harder: a harder version from the tips, or a little more weight. Stop for sharp or joint pain, dizziness or chest pain — mild muscle soreness the next day is normal.";
var COND_BEGINNER = {rounds:2,exercises:[
  {id:'b_step_ups',name:'Step-ups',type:'reps',cue:"Lowest rung of the step ladder, holding the frame for balance. Step up with the whole foot, stand tall at the top, step down with control. Aim for 8–10 per leg. Go slower rather than higher if the knees complain."},
  {id:'b_marching',name:'Marching in Place',type:'duration',cue:"Brisk but easy pace, knees up to a comfortable height, arms swinging. You should still be able to talk. Aim for 30–45 seconds."}
]};
var WK_TRAIN = {
  pull:{name:'Pull Day',color:'#3b82f6',emoji:'&#x1F535;',note:WK_TRAIN_NOTE,supersets:[
    {id:'A',rounds:3,restSec:90,exercises:[
      {id:'rows',name:'Ring Rows',type:'weighted',cue:"Rings hung so you can hang back on straight arms with your heels on the floor. Body in one line from ankle to ear, ribs down; pull the rings to your lower ribs, then lower under control. This replaced a bent-over row for a reason — an unsupported row holds the lower back in loaded flexion, the position an L4/L5 bulge likes least, and needs a brace that spikes abdominal pressure. On rings the spine stays straight and unloaded, and there is no weight to hold your breath against. Progress by walking your feet forward, not by adding load — there is nothing to put a dumbbell on here, so leave the weight box blank and log the reps. Breathe out as you pull."},
      {id:'bulgarian',name:'Bulgarian Split Squats',type:'weighted',cue:"Rear foot on the step ladder, and use a LOW rung — around mid-shin. A high rear foot forces the front hip open and pulls you into a lower-back arch, which is precisely what closes the L5/S1 foramen, so the rung you pick matters more here than the weight does. Start holding a ring or the ladder frame for balance; once that is steady, a light dumbbell hanging in each hand is the load — down by your sides keeps the weight under your centre instead of out in front, where it would pull you forward. Torso tall, tailbone tucked a little, front knee tracking over the foot. Breathe out on the way up."}
    ]},
    {id:'B',rounds:3,restSec:90,exercises:[
      {id:'pullups',name:'Assisted Pull-ups',type:'reps',cue:"Assisted on purpose, not as a fallback: rings set low enough to stand under and take some weight through your legs, or a band under one foot on the bar. Take enough help that you can breathe through the rep — a max-effort pull-up means a hard brace and a held breath, and that pressure spike is the thing to avoid with a 4 cm hernia. Ribs down rather than arching, breathe out as you pull. A relaxed hang between sets is fine and gently decompresses the spine."},
      {id:'glute_bridge',name:'Marching Glute Bridge',type:'reps',cue:"Feet flat, lift the hips to a low, near-neutral height — no big arch at the top — then lift one knee at a time without letting the hips drop or twist. This is the best-tolerated item in either day for you: real glute work with almost no spinal load and no abdominal pressure."}
    ]}
  ]},
  push:{name:'Push Day',color:'#ef4444',emoji:'&#x1F534;',note:WK_TRAIN_NOTE,supersets:[
    {id:'A',rounds:3,restSec:90,exercises:[
      {id:'dips',name:'Bench Dips',type:'reps',cue:"Hands on a rung of the step ladder behind you, feet out in front, elbows bending straight back. Stop when the upper arms reach about parallel — deeper cranks the shoulder. Walk the feet in to make it easier. Do NOT trade these for ring dips: a full dip is the highest intra-abdominal-pressure movement in either day and it finishes folded forward, the worst combination for a hernia this size, and rings add instability on top of that. Breathe out on the way up."},
      {id:'sldl',name:'Single-leg Deadlift',type:'weighted',cue:"Fingertips on a ring for balance — that is what the rings are best for here. Hinge from the hip with a long neutral spine and stop around mid-shin; the hinge is the point, not the depth. Rounding at the bottom to reach further is what loads a disc bulge. Bodyweight with the arms reaching is a real set. Once the hinge is clean, the kettlebell goes in the hand OPPOSITE your standing leg — held that side it counterbalances the reaching leg rather than pulling you into a twist, and rotation is the third thing that closes the foramen. Breathe out as you stand up."}
    ]},
    {id:'B',rounds:3,restSec:90,exercises:[
      {id:'pushups',name:'Push-ups',type:'reps',cue:"Hands under the shoulders, ribs down, hips level — as much a plank as a press, so no sag in the lower back. Put your hands on a rung of the step ladder to take weight off, and go up a rung any time a full push-up makes you hold your breath. Breathe out on the way up, every rep."},
      {id:'side_plank',name:'Side Plank',type:'duration',cue:"From the knees is fine and is the version to start on. Shoulder stacked over the elbow, hips lifted into one straight line, and keep breathing normally right through the hold. Side plank is one of the lowest-compression ways to train the trunk, which is why it stays — but only if it does not turn into a breath-hold."}
    ]}
  ]},
  // ── Beginner Pull / Push Day (v507) ─────────────────────────────────────
  // For Cathal's wife: a beginner with NO hernia or back history, so these
  // deliberately do NOT carry WK_TRAIN_NOTE or the clinical cues above — they
  // are plain beginner coaching. Separate programmes, not a "level" on the two
  // days above, because the safety text is his and would mislead her.
  // Same kit (bar, rings, step ladder, a dumbbell/kettlebell). 2 rounds, not 3.
  // Model-written general fitness, not physio-checked. Exercise NAMES key the
  // prefill (wktLastEntries, matched within this sessionName), so treat them as
  // frozen once she has history, the same rule as the days above.
  pullb:{name:'Beginner Pull Day',color:'#0ea5e9',emoji:'&#x1F535;',note:WK_BEGINNER_NOTE,noteLight:true,cond:COND_BEGINNER,supersets:[
    {id:'A',rounds:2,restSec:90,exercises:[
      {id:'b_rows',name:'Ring Rows',type:'reps',cue:"Rings at about waist height. Hold them, walk your feet in a little and lean back on straight arms — the more upright you stand, the easier it is. Body in one straight line, pull the rings to your lower ribs, squeeze the shoulder blades together, then lower slowly. Breathe out as you pull. Aim for 8–12 reps. Harder later: walk the feet further forward."},
      {id:'b_goblet',name:'Goblet Squat',type:'weighted',cue:"Hold one dumbbell or kettlebell against your chest with both hands, feet a little wider than hips, toes slightly out. Sit down between your heels as if onto a low chair, chest up, knees tracking over the toes, then stand. Only go as deep as feels comfortable on the knees — a shallower squat is a real squat. Start with bodyweight or a light weight. Aim for 8–12 reps."}
    ]},
    {id:'B',rounds:2,restSec:90,exercises:[
      {id:'b_hang',name:'Assisted Dead Hang',type:'duration',cue:"Hang from the bar or rings with an overhand grip, hands shoulder-width apart, keeping one or both feet on a rung of the step ladder so your legs take some of your weight. Arms straight, shoulders gently pulled down away from the ears, breathe normally throughout. Log the seconds held. Aim for 15–20 seconds. Harder later: take less weight through the feet, then lift them off for a full hang — the first step towards a pull-up."},
      {id:'b_bridge',name:'Glute Bridge',type:'reps',cue:"Lie on your back, knees bent, feet flat and hip-width apart. Push through your heels and lift the hips until there is a straight line from knees to shoulders, squeeze the glutes for a second at the top, lower slowly. Aim for 10–15 reps. Harder later: march one knee up at a time at the top without the hips dropping."}
    ]}
  ]},
  pushb:{name:'Beginner Push Day',color:'#f97316',emoji:'&#x1F534;',note:WK_BEGINNER_NOTE,noteLight:true,cond:COND_BEGINNER,supersets:[
    {id:'A',rounds:2,restSec:90,exercises:[
      {id:'b_pushups',name:'Incline Push-ups',type:'reps',cue:"Hands on a high rung of the step ladder (or a kitchen counter), a bit wider than the shoulders, body in one straight line from head to heels. Lower your chest towards your hands with elbows angled back, not flared out, then push away. Breathe out as you push. Aim for 8–12 reps. Harder later: move the hands to a lower rung."},
      {id:'b_rdl',name:'Romanian Deadlift',type:'weighted',cue:"Stand tall holding a dumbbell or kettlebell in front of your thighs, knees soft. Push your hips back and slide the weight down the front of your legs, back flat, until you feel a stretch in the backs of the thighs — around the knees is plenty. Squeeze the glutes to stand back up. Start light. Aim for 8–12 reps. Later: single-leg, holding a ring for balance."}
    ]},
    {id:'B',rounds:2,restSec:90,exercises:[
      {id:'b_dips',name:'Bench Dips',type:'reps',cue:"Hands on a low rung of the step ladder behind you, fingers forward, knees BENT and feet close in — that is the easy version. Bend the elbows straight back and lower only a little, stopping well before the upper arms reach parallel, then press up. Aim for 6–10 reps. If the fronts of the shoulders complain, skip them and log 0."},
      {id:'b_sideplank',name:'Side Plank (knees)',type:'duration',cue:"On your side, elbow under the shoulder, knees bent behind you. Lift the hips so there is a straight line from knees to head and hold, breathing normally. Do both sides each round — log the seconds held per side. Aim for 15–20 seconds. Harder later: straighten the legs and balance on the feet."}
    ]}
  ]}
};
var COND_TRAIN = {rounds:2,exercises:[
  {id:'step_ups',name:'Step-ups',type:'reps',cue:"A low rung on the step ladder — lower than feels necessary — and stand up tall on each rep rather than leaning forward over the knee. Push through the whole foot and breathe out on the way up."},
  {id:'marching',name:'Marching in Place',type:'duration',cue:"Easy pace, tall posture, arms swinging naturally. Nothing to brace and nothing to hold — if you cannot talk while you do it, slow down."}
]};

// ── Full Body Flow — the merged flow (v447) ───────────────────────────────
// v447 merged the two Full Body Flows into ONE. Poses the August-2026 review
// ADDED (scapular press, supported child's pose, supported tree L/R) are simply
// in the flow now. The six poses it REPLACED, plus the nerve floss it dropped,
// are switchable SLOTS: each carries the reviewed version and the original, the
// choice is picked on the session intro screen, and it is remembered in
// `fl4_yoga_variants` — so you always get the flow you last chose.
//
// Do NOT flatten this back into a plain array of poses: the slots ARE the
// feature. An UNSET slot deliberately defaults to the REVIEWED side — that is
// the version written for the foraminal stenosis, the L4/L5 bulge and the 4 cm
// hiatus hernia, and a default of "original" would silently turn the safety work
// off. `floss` is an on/off wearing the same clothes: its reviewed side is an
// EMPTY array, because the review dropped it (Nerve & Hip covers it more fully).
var YOGA_FB_SLOTS = {
  trunk: { label:'Trunk control', revLabel:'Heel Slides', origLabel:'Dead Bug',
    rev:[
          {name:'Alternating Heel Slides',sanskrit:'Trunk control',dur:50,cue:"Replaces Dead Bug. Lie on your back, knees bent, feet flat, spine resting in its natural curve — don't press it hard into the floor. Exhale slowly as you slide one heel away along the mat until the leg is nearly straight. Inhale as you draw it back. Alternate, about 5 slides each side. Same trunk control, far less abdominal pressure, and no breath-holding.",cues:["Knees bent, low back in its natural curve","Exhale as you slide one heel away","Inhale as you draw it back","About 5 each side — no breath-holding"]} ],
    orig:[
          {name:'Dead Bug',sanskrit:'Urdhva Prasarita Padasana',dur:50,cue:'On your back, knees bent to 90° above hips, arms reaching up to the ceiling. Press your lower back firmly into the mat and keep it there throughout. Slowly lower your right arm overhead and left leg toward the floor. Return, switch sides. 4–5 reps each.',cues:["Knees stacked over hips, arms to the ceiling","Lower opposite arm and leg together","Low back stays pressed into the mat","4–5 each side"]} ] },
  cat: { label:'Spine warm-up', revLabel:'Cat to Neutral', origLabel:'Cat-Cow',
    rev:[
          {name:'Cat to Neutral',sanskrit:'Marjaryasana',dur:60,cue:"Tabletop — wrists under shoulders, knees under hips. Exhale and round the spine gently toward the ceiling, tucking chin and tailbone. Inhale and return only as far as a flat, neutral back — do not drop down into a deep Cow. Extension narrows the foramen the nerve root leaves through, and a little flexion opens it — but round only to a comfortable middle, never to your maximum, because repeated end-range flexion is its own irritant for a disc bulge. 6–8 slow rounds.",cues:["Wrists under shoulders, knees under hips","Exhale: round up, tuck chin and tailbone","Inhale: return to FLAT — never down into Cow","A comfortable middle, not your maximum","6–8 slow rounds"]} ],
    orig:[
          {name:'Cat-Cow',sanskrit:'Marjaryasana-Bitilasana',dur:60,cue:'Tabletop — wrists under shoulders, knees under hips. Inhale: let the belly drop, tail lifts, gaze softens forward (Cow). Exhale: press the floor away, round the spine to the ceiling, tuck chin and tailbone (Cat). Flow continuously with your breath for 6–8 rounds.',cues:["Wrists under shoulders, knees under hips","Inhale: belly drops, tailbone lifts","Exhale: round up, tuck chin and tailbone","6–8 rounds, moving with the breath"]} ] },
  floss: { label:'Sciatic nerve floss', revLabel:'Skip', origLabel:'Include',
    rev:[],
    orig:[
          {name:'Sciatic Nerve Floss',sanskrit:'Nerve mobility',dur:45,cue:"Sit tall in a chair or on the floor with knees hip-width apart and feet flat. Extend the affected leg with toes pointing firmly toward you. Synchronise: look up at the ceiling as you extend your knee, then flex both your head and knee together simultaneously. The movement should feel like a gentle oscillation, not a stretch. Perform slowly — about 10 reps each leg. This mobilises the sciatic nerve along its full length.",url:'https://www.youtube.com/watch?v=OMbKv94Bu_U',cues:["Sit tall, feet flat, knees hip-width","Straighten the leg as you look up","Bend the knee and drop the chin together","A gentle oscillation, not a stretch — about 10 each side"]} ] },
  mountain: { label:'Standing warm-up', revLabel:'Calf Raises', origLabel:'Arm Raises',
    rev:[
          {name:'Mountain with Calf Raises',sanskrit:'Tadasana variation',dur:40,cue:"Stand feet hip-width near a wall or chair for a fingertip touch. Inhale and sweep both arms out and up while rising onto the balls of your feet; exhale, lower the heels and the arms together. Slow and controlled, about 8 rounds. The calf raise adds the ankle and lower-leg strength the flow was short on.",cues:["Feet hip-width, fingertips on a wall or chair","Inhale: arms sweep up, rise onto the balls of the feet","Exhale: heels and arms lower together","Slow and controlled, about 8"]} ],
    orig:[
          {name:'Mountain and Arm Raises',sanskrit:'Tadasana',dur:30,cue:'Stand feet hip-width, rooting through all four corners of both feet. Inhale and sweep both arms out and up overhead. As arms rise, let shoulder blades slide down your back. Exhale and lower. Repeat 3–4 times, finding more length with each inhale.',cues:["Feet hip-width, rooted through all four corners","Inhale: sweep the arms out and overhead","Let the shoulder blades slide down the back","Exhale and lower — 3–4 times"]} ] },
  bridge: { label:'Bridge', revLabel:'Low &amp; dynamic', origLabel:'Long hold',
    rev:[
          {name:'Low Dynamic Bridge',sanskrit:'Setu Bandha variation',dur:50,cue:"Feet hip-width apart, flat on the mat, knees bent. Exhale and press through your feet to lift the hips to a low height — spine near neutral, no big arch at the top. Inhale as you lower. 6–8 controlled reps rather than one long hold. Leave your arms flat by your sides; don't interlace the hands underneath.",cues:["Feet hip-width, flat, knees bent","Exhale and press the feet down to a LOW lift","Spine near neutral — no big arch at the top","Inhale as you lower. 6–8 reps","Arms flat by your sides, never interlaced underneath"]} ],
    orig:[
          {name:'Bridge Pose',sanskrit:'Setu Bandha Sarvangasana',dur:55,cue:'Feet hip-width apart, flat on the mat, knees bent. Press firmly through your feet and slowly peel your hips up, vertebra by vertebra. Interlace fingers underneath and press your arms into the mat. Hold 4–5 breaths, then lower slowly one vertebra at a time.',cues:["Feet hip-width, flat, knees bent","Press the feet down, peel the hips up one bone at a time","Interlace the fingers underneath, arms pressing down","Hold 4–5 breaths, then lower slowly"]} ] },
  kneehug: { label:'Knee hug', revLabel:'One at a time', origLabel:'Both knees',
    rev:[
          {name:'Single Knee to Chest Right',sanskrit:'Apanasana variation',dur:30,cue:"Replaces the double knee hug. Lie with both knees bent, feet flat. Draw the right knee up and hold behind the thigh, not over the shinbone — the thigh should not press into your stomach. Left foot stays on the floor. Gentle, steady, breathing normally throughout.",cues:["Both knees bent, feet flat","Draw the right knee up","Hold BEHIND the thigh, not over the shin","Left foot stays down — no pressure on the stomach"]},
          {name:'Single Knee to Chest Left',sanskrit:'Apanasana variation',dur:30,cue:"Lower the right foot, then draw the left knee up and hold behind the left thigh. Right foot stays flat on the floor. Same rule: enough to feel a gentle opening in the lower back, not enough to compress the abdomen.",cues:["Lower the right foot first","Draw the left knee up, hold behind the thigh","Right foot stays flat on the floor","A gentle opening, never a compression"]} ],
    orig:[
          {name:'Knees to Chest',sanskrit:'Apanasana',dur:30,cue:'Lie on your back. Draw both knees gently to chest. Hold below kneecaps. Rock side to side.',cues:["Draw both knees in toward the chest","Hands around the shins, not over the kneecaps","Rock gently side to side","Let the sacrum feel heavy and grounded"]} ] },
  savasana: { label:'Final rest', revLabel:'Propped', origLabel:'Flat',
    rev:[
          {name:'Supported Savasana',sanskrit:'Savasana',dur:90,cue:"Extend both legs long, feet falling open, arms slightly away from the body with palms up. If lying flat brings on reflux, keep the wedge or bolster under your whole upper torso. Close your eyes and stop controlling your breath. Release the face, jaw, hands and feet. You've done the work — now rest and absorb it.",cues:["Legs long, feet falling open","Arms slightly away from the body, palms up","Keep the wedge under the upper torso if lying flat brings reflux","Stop controlling the breath — release face, jaw, hands, feet"]} ],
    orig:[
          {name:'Savasana',sanskrit:'Savasana',dur:90,cue:'Legs long, feet falling open. Arms by sides, palms up. Eyes fully closed. Every muscle releases.',cues:["Legs long, feet falling open","Arms by your sides, palms up","Eyes fully closed","Every muscle releases"]} ] }
};
// Render order for the intro-screen switches — NOT the flow order.
var YOGA_FB_SLOT_ORDER = ['trunk','cat','floss','mountain','bridge','kneehug','savasana'];

// The flow with its slots un-expanded. A `{slot:'x'}` marker is replaced by the
// chosen pose or poses at build time; `kneehug` expands to TWO poses on the
// reviewed side and one on the original, so the flow length is not fixed.
//
// v509: `inShort:true` marks the 15 entries the SHORT version keeps (~12 min,
// Cathal 24/10/2026). It sits on the BASE entry, so a slot keeps whichever side
// is chosen — the short flow is the same reviewed/original choices, fewer poses.
// Do NOT give the short version its own pose array: two copies of a pose is how
// a cue gets fixed in one of them only.
var YOGA_FB_BASE = [
  {name:'Seated Centering',inShort:true,sanskrit:'Sukhasana',dur:60,cue:'Sit cross-legged, using a folded blanket under your hips if needed to tilt the pelvis forward. Rest hands on knees, palms up. Close your eyes. Inhale slowly for 4 counts, filling from the belly upward. Exhale for 6 counts, letting the shoulders soften. Set an intention for your practice. Sit up on a firm cushion or block high enough that your hips end up above your knees — perched rather than slumped, so the lower back is not held rounded for the whole minute.',cues:["Sit up on a cushion or block, hips above knees","Hands on knees, palms up, eyes closed","In for 4, out for 6","Perched, not slumped"]},
  {name:'Neck and Shoulder Rolls',sanskrit:'Seated Mobilisation',dur:30,cue:"Sitting tall, drop your right ear toward your shoulder — don't force it. Slowly roll your chin to your chest, then your left ear to the left shoulder. Reverse the direction. Then roll both shoulders forward 3 times, backward 3 times. Move slowly and follow your breath.",cues:["Right ear down, chin across the chest, left ear","Then reverse the direction","Shoulders: 3 rolls forward, 3 back","Slow — never force the end of the range"]},
  {name:'Pelvic Tilts',inShort:true,sanskrit:'Lumbar warm-up',dur:30,cue:"Lie on your back with knees bent and feet flat. Gently flatten your lower back against the mat by tightening your deep abdominals and tilting your pelvis upward slightly. Hold 2 seconds, then release back to neutral. Move slowly and with control. Keep breathing — this is a light tilt, not a hard brace.",url:'https://www.youtube.com/watch?v=GKz3q3-12-g',cues:["Knees bent, feet flat","Tilt the pelvis so the low back flattens gently","Hold 2 seconds, release to neutral","A light tilt, not a hard brace — keep breathing"]},
  {slot:'trunk',inShort:true},
  {slot:'cat',inShort:true},
  {name:'Quadruped Scapular Press',sanskrit:'Shoulder girdle',dur:30,cue:"Stay in tabletop with your elbows straight the whole time — the movement happens only at the shoulder blades. Let your chest sink a small amount as the blades draw together, then exhale and press the floor away so the upper back rounds slightly. Small, slow, about 10 reps. This adds the shoulder work the flow was missing without adding a plank.",cues:["Stay in tabletop, elbows straight throughout","Let the chest sink, shoulder blades draw together","Exhale, press the floor away, upper back rounds","Small and slow, about 10"]},
  {name:'Bird Dog',inShort:true,sanskrit:'Dandayamna Bharmanasana',dur:50,cue:"From tabletop, draw your navel in gently. Extend your right arm forward and left leg back — keep the leg no higher than hip height, lower is fine. Exhale as you extend and don't let the lower back arch. Hips stay level. Hold 3 steady breaths, lower slowly. Switch sides. 3 rounds each.",cues:["Draw the navel in gently","Opposite arm and leg — leg no higher than the hip","Exhale as you extend, and don't let the back arch","Hips level. 3 breaths, then switch"]},
  {name:"Supported Child's Pose",inShort:true,sanskrit:'Utthita Balasana',dur:45,cue:"Knees wide apart, hips sinking back toward the heels, with a bolster or stacked cushions under your chest so the torso is propped rather than folded flat. Forehead rests, arms reach forward. Breathe into the back of your ribcage. Keep the prop high enough that this stays a rest rather than a maximal fold — with a disc bulge the depth of the fold is not what makes it useful. If folding brings on reflux or upper-abdominal pressure, skip it and rock gently back and forth in tabletop instead.",cues:["Knees wide, hips sinking back toward the heels","Bolster or cushions under the chest","Keep the prop high — a rest, not a deep fold","Breathe into the back of the ribs","Reflux? Rock in tabletop instead"]},
  {name:'Low Lunge Right',inShort:true,sanskrit:'Anjaneyasana',dur:45,cue:"Step right foot forward, lower left knee to mat, top of foot flat. Use a shorter stance than usual. Tuck the tailbone slightly and stack the ribs over the hips, then shift forward only until you feel the left hip flexor. Both hands rest on your right thigh or your hips — keep the torso tall rather than arching back.",cues:["Right foot forward, left knee down, top of foot flat","Shorter stance than usual","Tailbone tucked, ribs stacked over the hips","Hands on the front thigh — no arching back"]},
  {name:'Half Splits Right',sanskrit:'Ardha Hanumanasana',dur:45,cue:'From Low Lunge, shift hips back over your left knee and straighten the right leg — flex the foot. Hinge forward from the hips with a long, flat back rather than rounding. Rest hands on the mat or your shin. Don\'t chase depth; a light stretch behind the right leg is enough. Use blocks or your shin — if you have to round your back to reach the floor, don\'t reach the floor.',cues:["Hips back over the left knee, right leg straight","Flex the right foot","Hinge from the hips, back long and flat","Blocks or shin — never round the back to reach the floor"]},
  {name:'Low Lunge Left',inShort:true,sanskrit:'Anjaneyasana',dur:45,cue:'Step left foot forward, right knee lowers to mat. Short stance, tailbone tucked slightly, ribs stacked. Shift gently forward to open the right hip flexor. Hands to your left thigh or hips, chest open, shoulders relaxed away from ears. No backward arching.',cues:["Left foot forward, right knee down","Short stance, tailbone tucked, ribs stacked","Shift forward to feel the right hip flexor","Hands on the thigh, chest open, no backward arch"]},
  {name:'Half Splits Left',sanskrit:'Ardha Hanumanasana',dur:45,cue:'Shift hips back over your right knee, straighten the left leg — flex the foot. Hinge forward from the hips with a long spine, not a rounded back. Hands to the floor, a block or your shin for support. Light stretch only — if reaching lower means rounding the back, stay high.',cues:["Hips back over the right knee, left leg straight","Flex the left foot","Hinge from the hips with a long spine","Stay high rather than round the back"]},
  {slot:'floss'},
  {slot:'mountain',inShort:true},
  {name:'Side Stretch Right',sanskrit:'Parsva Urdhva Hastasana',dur:30,cue:'Right arm sweeps overhead. Lean gently to the left — keep both hips square and grounded. Feel a long line from your right hip to your fingertips. Left hand rests on your thigh for support. Keep it small, and make it a lengthening of the upper side rather than a bend in the lower back — leaning closes the foramen on the side you lean toward, and yours are narrowed on both. Hold 4 slow breaths.',cues:["Right arm overhead, lean gently to the left","Both hips square and grounded","Long through the ribs, minimal bend at the waist","Keep it small. 4 slow breaths"]},
  {name:'Side Stretch Left',sanskrit:'Parsva Urdhva Hastasana',dur:30,cue:'Left arm sweeps overhead. Lean gently to the right. Both feet grounded equally. Create length through the entire left side of the body. Right hand rests lightly on your thigh. Same rule — long through the ribs, minimal bend at the waist. 4 breaths.',cues:["Left arm overhead, lean gently to the right","Both feet grounded evenly","Length down the left side, not a bend at the waist","4 breaths"]},
  {name:'Supported Tree Right',sanskrit:'Vrksasana',dur:30,cue:"Fingertips of one hand on a wall or the back of a chair. Stand on the right leg, place the left foot against the right ankle, calf or inner thigh — never against the knee itself. Hips level, tailbone slightly tucked, gaze steady on one point. Balance work like this is the piece most stenosis programmes leave out.",cues:["Fingertips on a wall or the back of a chair","Stand on the right leg","Left foot to the ankle, calf or inner thigh — never the knee","Hips level, tailbone tucked, gaze on one point"]},
  {name:'Supported Tree Left',sanskrit:'Vrksasana',dur:30,cue:"Switch sides — fingertips still on the wall or chair. Stand on the left leg, right foot to the left ankle, calf or inner thigh, avoiding the knee. Stay tall, breathe steadily, and use as much hand support as you need. Coming out and going back in counts as practice.",cues:["Fingertips still on the wall or chair","Stand on the left leg","Right foot to ankle, calf or inner thigh — avoid the knee","Use as much hand support as you need"]},
  {name:'Warrior I Right',sanskrit:'Virabhadrasana I',dur:50,cue:"Step left foot back into a shorter stance than usual, turn it out to 45°. Square hips toward the front. Bend the right knee over the ankle. Tuck the tailbone a little and draw the lower ribs in. Hands can stay on your hips — only take the arms overhead if that doesn't arch your lower back.",cues:["Left foot back, turned out 45°, shorter stance","Hips square to the front","Right knee bends over the ankle","Tailbone tucked, lower ribs drawn in","Hands on hips — overhead only if the back stays flat"]},
  {name:'Warrior I Left',sanskrit:'Virabhadrasana I',dur:50,cue:"Step right foot back, shorter stance, turned out to 45°. Square hips toward the front, bend into the left knee. Ribs stacked over the pelvis, tailbone slightly tucked. Hands on hips, or overhead only if the back stays neutral.",cues:["Right foot back, turned out 45°, short stance","Hips square, bend into the left knee","Ribs stacked over the pelvis, tailbone tucked","Hands on hips, or overhead if the back stays neutral"]},
  {name:'Warrior II Right',inShort:true,sanskrit:'Virabhadrasana II',dur:45,cue:'From Warrior I — or from standing, step the left foot back into a shorter stance than usual, foot turned out, and bend the right knee over the ankle — open your arms wide: right forward, left back, parallel to the floor. Open the left hip out to the side. Gaze over your right fingertips. Torso stacked upright between the hips — don\'t lean forward or arch back. Sink into the right knee only as far as is comfortable.',cues:["Left foot back, shorter stance, right knee over the ankle","Arms wide — right forward, left back, parallel to the floor","Left hip opens out to the side","Gaze over the right fingertips","Torso stacked upright — don't lean forward or arch back"]},
  {name:'Warrior II Left',inShort:true,sanskrit:'Virabhadrasana II',dur:45,cue:'Switch sides: step the right foot back into the same shorter stance, foot turned out, and bend the left knee over the ankle. Left arm extends forward, right arm reaches back. Gaze over your left fingertips. Both arms reach actively in opposite directions. Torso upright, ribs down. Deepen the bend in the left knee without letting it collapse inward.',cues:["Switch sides: right foot back, short stance, left knee bent","Left arm forward, right arm back","Gaze over the left fingertips","Reach actively in both directions","Ribs down; left knee tracks out, never inward"]},
  {slot:'bridge',inShort:true},
  {name:'Reclined Butterfly',sanskrit:'Supta Baddha Konasana',dur:60,cue:"Soles of the feet together, knees falling open. If lying flat brings on reflux, prop your whole upper torso on a wedge or a bolster running the length of your spine so the chest sits above the stomach. One hand on the belly, one on the chest. Nothing to do here — just breathe and let gravity work.",cues:["Soles of the feet together, knees falling open","Reflux? Prop the whole upper torso on a wedge","One hand on the belly, one on the chest","Nothing to do here — just breathe"]},
  {name:'Supine Twist Right',inShort:true,sanskrit:'Supta Matsyendrasana',dur:30,cue:'Bring both knees up, then let them fall to the right. Extend your left arm out at shoulder height, palm facing up. Keep both shoulders heavy on the mat. Gaze toward the ceiling or gently to the left. Rest the knees on a cushion so they are supported rather than hanging, and keep the twist small — don\'t use the exhales to travel further. Rotation narrows the foramen, and yours are narrowed on both sides.',cues:["Knees up, then let them fall to the right","Cushion under the knees so they rest, not hang","Left arm wide, palm up, both shoulders heavy","Keep it small — don't travel further on the exhale"]},
  {name:'Supine Twist Left',inShort:true,sanskrit:'Supta Matsyendrasana',dur:30,cue:'Bring knees back to centre, then let them fall to the left. Right arm extends wide, palm up. Cushion under the knees again. Let the exhales release the upper back and shoulders rather than deepen the twist — small and supported is the point here, not range.',cues:["Knees back to centre, then over to the left","Cushion under the knees again","Right arm wide, palm up","Exhale into the shoulders, not deeper into the twist"]},
  {slot:'kneehug'},
  {slot:'savasana',inShort:true}
];


// ── Hips & Lower Back — re-tuned 22/09/2026 (v481) ────────────────────────
// Built on the Full Body machinery: every pose the re-tune changed is a slot
// carrying the reviewed version and the ORIGINAL VERBATIM, and an unset or
// corrupt choice reads as reviewed (yogaVariantOf). Only Windshield Wipers is
// unchanged, so it is the one plain pose. Slot ids are `hlb_`-prefixed because
// they share `fl4_yoga_variants` with the Full Body slots — `kneehug` and
// `savasana` exist in both flows and must stay independent choices.
//
// The reviewed side is MODEL-WRITTEN from the rules in Full Body's note (middle
// of the range, no loaded or end-range fold, small supported twists, head above
// the heart, no breath-holding) and has NOT been checked by a physio —
// YOGA_TRAIN_NOTES[1] says so on screen. Do not describe it as physio-approved.
// Reviewed poses carry `noPhoto:true`: the only photos are of the ORIGINAL
// poses, and "Upright Butterfly" showing the Diamond Fold photo would teach the
// fold this version removed. `hlb_fold2`'s reviewed side is EMPTY (skipped, as
// with Full Body's floss) — the hamstrings are covered by the strap stretch.
var YOGA_HLB_SLOTS = {
  hlb_fold1: { label:'Opening fold', revLabel:'Hip Hinge', origLabel:'Rounded Fold',
    rev:[
          {name:"Seated Hip Hinge",sanskrit:"Sukhasana variation",dur:45,noPhoto:true,cue:"Replaces the rounded forward fold. Sit on a firm cushion or block high enough that your hips are above your knees, feet flat, knees apart. Rest your forearms on your thighs. Tip forward from the hips a little with the back long — the chest leads, and it goes only as far as it can without the back rounding. Stay there, breathing slowly and normally into the back of the ribs. Pressure in the stomach or any reflux: come up taller.",cues:["Sit on a cushion, hips above the knees","Forearms rest on the thighs","Tip forward from the hips — back long, never rounded","Stomach pressure or reflux? Come up taller"]} ],
    orig:[
          {name:'Seated Forward Fold Variation',sanskrit:'Sukhasana variation',dur:60,cue:'Sit with feet on the ground and knees lifted. Slowly drape your heart over the tops of your thighs. Breathe into the back body.'} ] },
  hlb_boat: { label:'Core', revLabel:'Marching', origLabel:'Boat Prep',
    rev:[
          {name:"Supine Marching",sanskrit:"Trunk control",dur:30,noPhoto:true,cue:"Replaces Boat Prep. Lie on your back, knees bent, feet flat, spine resting in its natural curve. Breathe out and lift one foot just a few centimetres off the floor, keeping the knee bent; breathe in and lower it. Alternate slowly, about 6 each side. The hips stay level and still. If the low back arches or you catch yourself holding your breath, make the lift smaller — the same core work as the boat, without the loaded fold or the pressure on the stomach.",cues:["Lie on your back, knees bent, feet flat","Breathe out: lift one foot a few centimetres","Breathe in: lower it. About 6 each side","Hips still — never hold your breath"]} ],
    orig:[
          {name:'Core Stability Boat Prep',sanskrit:'Navasana variation',dur:30,cue:'From seated, lean back slightly and lift shins parallel to the floor. Hands behind thighs for support. Core engaged, breathe steadily.'} ] },
  hlb_twist: { label:'Seated twist', revLabel:'Small, moving', origLabel:'Held',
    rev:[
          {name:"Small Seated Rotation Right",sanskrit:"Ardha Matsyendrasana variation",dur:30,noPhoto:true,cue:"Replaces the held seated twist. Sit tall on a firm cushion or a chair, hips above knees, arms crossed over the chest. Breathe out and turn your ribs and shoulders to the right about half as far as you could go, then breathe in and come back to centre. About 5 slow reps. Moving, not held: no hand behind you levering you further, and no pulling on the knee. Rotation narrows the foramen, so the middle of the range is the whole point.",cues:["Sit tall on a cushion or chair, arms crossed","Breathe out: turn right about HALF your range","Breathe in: back to centre. About 5 reps","No hand levering you further"]},
          {name:"Small Seated Rotation Left",sanskrit:"Ardha Matsyendrasana variation",dur:30,noPhoto:true,cue:"Same again to the left. Sit tall, arms crossed over the chest. Breathe out and turn to the left about half as far as you could go, breathe in and return to centre. About 5 slow reps. Keep it moving and keep it small — the twist should never be held at its end, and nothing should pull you deeper.",cues:["Sit tall, arms crossed over the chest","Breathe out: turn left about half your range","Breathe in: back to centre. About 5 reps","Moving and small — never held at the end"]} ],
    orig:[
          {name:'Seated Spinal Twist Right',sanskrit:'Ardha Matsyendrasana',dur:30,cue:'Extend left leg. Hug right knee to chest. Inhale tall, exhale twist toward right knee. Left hand to right knee, right hand behind.'},
          {name:'Seated Spinal Twist Left',sanskrit:'Ardha Matsyendrasana',dur:30,cue:'Extend right leg. Hug left knee to chest. Inhale tall, exhale twist left. Right hand to left knee, left hand behind.'} ] },
  hlb_h2k: { label:'Hamstrings', revLabel:'Lying, strap', origLabel:'Head-to-Knee',
    rev:[
          {name:"Supine Hamstring Stretch Right",sanskrit:"Supta Padangusthasana variation",dur:30,noPhoto:true,cue:"Replaces Head-to-Knee. Lie on your back with both knees bent. Loop a strap, belt or towel round the ball of the right foot and straighten the leg up toward the ceiling only until you feel a light stretch behind the thigh — the angle does not matter. The left foot stays flat on the floor and your low back keeps its natural curve on the mat, so the hamstring stretches without the spine folding. Keep the shoulders and neck soft and breathe normally.",cues:["Lie on your back, both knees bent","Strap round the ball of the right foot","Straighten the leg up only to a LIGHT stretch","Left foot flat, low back resting on the mat"]},
          {name:"Supine Hamstring Stretch Left",sanskrit:"Supta Padangusthasana variation",dur:30,noPhoto:true,cue:"Lower the right foot and move the strap to the left foot. Straighten the left leg up only until you feel a light stretch behind the thigh. Right foot flat on the floor, low back resting in its natural curve, shoulders soft. Let the strap hold the leg — no pulling it closer on the exhale.",cues:["Right foot down, strap to the left foot","Straighten the left leg to a light stretch","Right foot flat, low back resting","Let the strap hold it — no pulling closer"]} ],
    orig:[
          {name:'Head-to-Knee Pose Right',sanskrit:'Janu Sirsasana',dur:30,cue:'Tuck left foot at inner right thigh. Extend right leg. Hinge from hips with long spine, reach toward right foot or shin.'},
          {name:'Head-to-Knee Pose Left',sanskrit:'Janu Sirsasana',dur:30,cue:'Tuck right foot at inner left thigh. Extend left leg. Hinge from hips, long spine, reach toward left foot.'} ] },
  hlb_bound: { label:'Butterfly', revLabel:'Upright', origLabel:'Diamond Fold',
    rev:[
          {name:"Upright Butterfly",sanskrit:"Baddha Konasana variation",dur:45,noPhoto:true,cue:"Replaces the Diamond Fold. Sit up on a firm cushion so your hips are above your knees. Soles of the feet together, feet a comfortable distance out to make a wide diamond. Sit tall with your hands on the ankles or shins and let the knees drop with gravity — don't push them down, and don't fold forward. The hips do the opening here; the back stays upright and the stomach stays free. Breathe normally.",cues:["Sit on a cushion, hips above the knees","Soles together, a wide diamond","Sit TALL — no fold forward","Let the knees drop; don't push them"]} ],
    orig:[
          {name:'Bound Angle Diamond Fold',sanskrit:'Baddha Konasana',dur:60,cue:'Soles together, feet further from body making a wide diamond. Hinge forward from hips, chest leads, spine long.'} ] },
  hlb_swim: { label:'Side stretch', revLabel:'Figure-Four', origLabel:'Swimming',
    rev:[
          {name:"Seated Figure-Four Right",sanskrit:"Glute stretch",dur:30,noPhoto:true,cue:"Replaces the Swimming Side Stretch, which bent the spine sideways again and again. Sit tall on a chair or a firm cushion. Rest the right ankle on the left thigh just above the knee, right foot flexed. Stay upright and let the right knee lower with gravity — the stretch in the outer right hip comes from the knee dropping, not from leaning forward. If you feel little, that is fine; don't fold to find more. Breathe normally.",cues:["Sit tall on a chair or cushion","Right ankle on the left thigh, above the knee","Stay upright; let the right knee lower","Don't lean forward to find more"]},
          {name:"Seated Figure-Four Left",sanskrit:"Glute stretch",dur:30,noPhoto:true,cue:"Switch sides: left ankle on the right thigh just above the knee, left foot flexed. Sit tall and let the left knee lower with gravity. Feel the outer left hip and the buttock. Upright throughout — the forward lean that deepens this stretch is exactly the fold this version leaves out.",cues:["Left ankle on the right thigh, foot flexed","Sit tall; let the left knee lower","Feel the outer left hip","Upright throughout — no forward lean"]} ],
    orig:[
          {name:'Swimming Side Stretch',sanskrit:'Seated lateral flow',dur:30,cue:'Legs in wide straddle. Reach one arm up and over toward opposite toes in a fluid sweeping motion. 8 sweeps each side.'} ] },
  hlb_fold2: { label:'Seated Forward Fold', revLabel:'Skip', origLabel:'Include',
    rev:[],
    orig:[
          {name:'Seated Forward Fold',sanskrit:'Paschimottanasana',dur:60,cue:'Legs extended, soft bend in knees. Hinge forward from hips with long spine. Reach for shins, ankles or feet.'} ] },
  hlb_froggy: { label:'Inner groin', revLabel:'Rocking', origLabel:'Froggy',
    rev:[
          {name:"Wide-Knee Rocking",sanskrit:"Mandukasana variation",dur:30,noPhoto:true,cue:"Replaces Froggy Pose. Come onto hands and knees with the knees wider than the hips. Keep the back flat. Breathe out and rock the hips back about halfway toward the heels, then breathe in and rock forward to tabletop. Your head stays level with your hips — not dropped below them — and stop the rock before the low back starts to round. Slow, about 8 rocks. Feel it in the inner groin.",cues:["Hands and knees, knees wide","Breathe out: rock back about halfway","Breathe in: forward to tabletop. About 8","Head level with the hips; stop before the back rounds"]} ],
    orig:[
          {name:'Froggy Pose',sanskrit:'Mandukasana variation',dur:30,cue:'Wide kneeling, knees far apart, hips low to floor, body folded forward. Forearms on the ground. Breathe into the inner groin.'} ] },
  hlb_squat: { label:'Squat', revLabel:'Supported', origLabel:'Yogi Squat',
    rev:[
          {name:"Supported Squat",sanskrit:"Malasana variation",dur:30,noPhoto:true,cue:"Replaces the deep Yogi Squat. Put a yoga block, a low stool or a stack of firm books behind you — high enough that your hips stay level with or above your knees. Feet wider than the hips, toes turned out a little, and lower yourself to sit on it. The prop takes your weight, so this is a supported sit, not a deep hanging squat. Chest upright, hands resting on the knees, elbows gently easing them wide. Breathe normally with no bearing down, and use a hand on the floor or a wall to come up.",cues:["Block or low stool behind you","Feet wide, toes out a little — sit on the prop","Hips level with or above the knees","Chest up, breathe normally, no bearing down"]} ],
    orig:[
          {name:'Yogi Squat',sanskrit:'Malasana',dur:30,cue:'Deep squat, heels toward earth. Hands in prayer, elbows pressing knees wide. Tailbone heavy, spine long.'} ] },
  hlb_standfold: { label:'Standing fold', revLabel:'Wall Hinge', origLabel:'Hanging Fold',
    rev:[
          {name:"Wall-Supported Half Hinge",sanskrit:"Ardha Uttanasana variation",dur:30,noPhoto:true,cue:"Replaces the Standing Forward Fold, which hung the spine at the end of its range with the head below the heart. Stand facing a wall or the back of a sturdy chair, hands on it at about hip height. Walk your feet back and hinge from the hips until your arms are straight and your back is long and flat — at most a right angle at the hips, less is fine. Knees softly bent, head in line with the spine so it stays above your heart. Press gently into the hands and feel the length down the backs of the legs. Walk the feet in to come up.",cues:["Hands on a wall or chair back, hip height","Walk back, hinge to a flat back — not a hang","Knees soft, head in line with the spine","Walk the feet in to come up"]} ],
    orig:[
          {name:'Standing Forward Fold',sanskrit:'Uttanasana',dur:60,cue:'Feet wide, hinge at hips, upper body hangs heavy. Soft bend in knees. Arms dangle or hold opposite elbows.'} ] },
  hlb_kneehug: { label:'Knee hug', revLabel:'One at a time', origLabel:'Both knees',
    rev:YOGA_FB_SLOTS.kneehug.rev,
    orig:[
          {name:'Knees to Chest',sanskrit:'Apanasana',dur:30,cue:'Lie on your back. Draw both knees gently to chest. Hold below kneecaps. Rock side to side.'} ] },
  hlb_eagle: { label:'Eagle twist', revLabel:'Supported', origLabel:'Full',
    rev:[
          {name:"Supported Eagle Twist Right",sanskrit:"Supta Garudasana variation",dur:30,noPhoto:true,cue:"Lie on your back, knees bent. Cross the right leg over the left, then let both knees lower to the left — only about halfway, onto a cushion or folded blanket so the legs rest rather than hang. Right arm out wide, palm up, both shoulders heavy on the mat. Breathe normally and let the exhales soften the outer right hip, not take you deeper into the twist. Rotation narrows the foramen, so small and supported is the point.",cues:["Right leg crossed over the left","Knees lower to the left onto a cushion","Only about halfway — resting, not hanging","Exhale into the hip, not deeper into the twist"]},
          {name:"Supported Eagle Twist Left",sanskrit:"Supta Garudasana variation",dur:30,noPhoto:true,cue:"Bring the knees back to centre and uncross. Cross the left leg over the right, and lower both knees to the right onto the cushion — about halfway again. Left arm wide, palm up, shoulders grounded. Soften the outer left hip on each exhale; the twist itself stays where it is.",cues:["Back to centre, uncross","Left leg over the right","Knees lower to the right onto the cushion","Left arm wide; the twist stays small"]} ],
    orig:[
          {name:'Eagle Legs Twist Right',sanskrit:'Supta Garudasana variation',dur:30,cue:'Cross right leg over left, both knees fall to the left. Right arm wide. Both shoulders heavy. Breathe into the right outer hip.'},
          {name:'Eagle Legs Twist Left',sanskrit:'Supta Garudasana variation',dur:30,cue:'Cross left leg over right, knees fall to the right. Left arm wide. Shoulders grounded. Soften on every exhale.'} ] },
  hlb_happy: { label:'Happy Baby', revLabel:'One leg', origLabel:'Both legs',
    rev:[
          {name:"Half Happy Baby Right",sanskrit:"Ananda Balasana variation",dur:25,noPhoto:true,cue:"Replaces the full Happy Baby, which tips the pelvis to the end of its range. Lie on your back with the left foot flat on the floor. Draw the right knee toward the right armpit and hold the outside of the right foot, the back of the thigh, or a strap round the foot — whichever lets your tailbone stay down on the mat. Shin roughly vertical, knee easing wide. Breathe normally; no rocking to go deeper.",cues:["Left foot flat on the floor","Right knee toward the right armpit","Hold the foot, thigh or a strap","Tailbone stays down — no rocking deeper"]},
          {name:"Half Happy Baby Left",sanskrit:"Ananda Balasana variation",dur:25,noPhoto:true,cue:"Lower the right foot to the floor. Draw the left knee toward the left armpit and hold the outside of the left foot, the back of the thigh, or a strap. Tailbone stays on the mat and the right foot stays flat. Gentle and steady, breathing normally.",cues:["Right foot down, flat on the floor","Left knee toward the left armpit","Hold the foot, thigh or a strap","Tailbone on the mat; breathe normally"]} ],
    orig:[
          {name:'Happy Baby',sanskrit:'Ananda Balasana',dur:30,cue:'Hug knees to chest then reach for outer edges of feet. Knees wide toward armpits. Rock side to side if it feels good.'} ] },
  hlb_savasana: { label:'Final rest', revLabel:'Propped', origLabel:'Flat',
    rev:YOGA_FB_SLOTS.savasana.rev,
    orig:[
          {name:'Savasana',sanskrit:'Savasana',dur:90,cue:'Legs long, feet falling open. Arms by sides, palms up. Eyes fully closed. Every muscle releases.'} ] }
};
// Render order for the intro-screen switches (here it is also the flow order).
var YOGA_HLB_SLOT_ORDER = ['hlb_fold1','hlb_boat','hlb_twist','hlb_h2k','hlb_bound','hlb_swim','hlb_fold2','hlb_froggy','hlb_squat','hlb_standfold','hlb_kneehug','hlb_eagle','hlb_happy','hlb_savasana'];
var YOGA_HLB_BASE = [
  {slot:'hlb_fold1'},
  {slot:'hlb_boat'},
  {slot:'hlb_twist'},
  {slot:'hlb_h2k'},
  {slot:'hlb_bound'},
  {slot:'hlb_swim'},
  {slot:'hlb_fold2'},
  {slot:'hlb_froggy'},
  {slot:'hlb_squat'},
  {slot:'hlb_standfold'},
  {slot:'hlb_kneehug'},
  {slot:'hlb_eagle'},
  {slot:'hlb_happy'},
  {name:'Windshield Wipers',sanskrit:'Supta variation',dur:30,cue:'Feet flat, knees bent, feet wider than hips. Let knees drop right then sweep to left. Slow and fluid.'},
  {slot:'hlb_savasana'}
];

// Unset = reviewed. Anything that is not the exact string 'orig' reads as
// reviewed, so a corrupt or half-written value fails safe rather than silently
// dropping the reviewed version.
function yogaVariantPrefs() {
  var p = storeGet("fl4_yoga_variants");
  return (p && typeof p === "object") ? p : {};
}
function yogaVariantOf(id) { return yogaVariantPrefs()[id] === "orig" ? "orig" : "rev"; }

// The two slotted flows, by YOGA_FLOWS_TRAIN index. `allSwitch` adds the
// "All reviewed / All original" row on top of the picker — Hips & Lower Back
// only (Cathal, 22/09/2026: its fourteen switches were too many to flip one by
// one). Full Body keeps its seven without it; that was not asked for.
// v509: `voice:true` turns on the spoken cues for that flow (Full Body only —
// its poses carry short `cues`; Hips has paragraphs only). A flow offers the
// short version only if its base marks entries `inShort` (yogaHasShort).
var YOGA_SLOTTED = {
  0: { base: YOGA_FB_BASE,  slots: YOGA_FB_SLOTS,  order: YOGA_FB_SLOT_ORDER, voice: true },
  1: { base: YOGA_HLB_BASE, slots: YOGA_HLB_SLOTS, order: YOGA_HLB_SLOT_ORDER, allSwitch: true }
};
function buildSlottedFlow(idx, short) {
  var def = YOGA_SLOTTED[idx], out = [];
  def.base.forEach(function(p) {
    if (short && !p.inShort) return;
    if (!p.slot) { out.push(p); return; }
    var s = def.slots[p.slot];
    if (!s) return;                                   // unknown slot: drop it, never crash
    (yogaVariantOf(p.slot) === "orig" ? s.orig : s.rev).forEach(function(q){ out.push(q); });
  });
  return out;
}
function buildFullBodyFlow() { return buildSlottedFlow(0); }
function buildHipsFlow()     { return buildSlottedFlow(1); }
function yogaFlowFor(idx, short) { return YOGA_SLOTTED[idx] ? buildSlottedFlow(idx, short) : YOGA_FLOWS_TRAIN[idx]; }
function yogaFlowTotal(flow){ return flow.reduce(function(a,p){ return a + p.dur; }, 0); }
function yogaSlotFlowIdx(id) {
  for (var k in YOGA_SLOTTED) if (YOGA_SLOTTED[k].slots.hasOwnProperty(id)) return +k;
  return -1;
}

// Called from the intro screen's switches. Saves, rebuilds the live flow and
// repaints, so the pose count and the duration on screen follow the choice.
function setYogaVariant(id, which) {
  if (yogaSlotFlowIdx(id) === -1) return;
  var p = yogaVariantPrefs();
  p[id] = (which === "orig") ? "orig" : "rev";
  storeSet("fl4_yoga_variants", p);
  yogaVariantRepaint(yogaSlotFlowIdx(id));
}
// The "All" row: sets every slot of ONE flow, leaving the other flow's choices
// alone (they share the store).
function setYogaVariantAll(idx, which) {
  var def = YOGA_SLOTTED[idx];
  if (!def) return;
  var p = yogaVariantPrefs();
  def.order.forEach(function(id){ p[id] = (which === "orig") ? "orig" : "rev"; });
  storeSet("fl4_yoga_variants", p);
  yogaVariantRepaint(idx);
}
function yogaVariantRepaint(idx) {
  if (SS && SS.type === "yoga" && SS.yFlowIdx === idx) {
    SS.yFlow = buildSlottedFlow(idx, SS.yShort);
    renderYogaSession();
  }
  if (document.getElementById("progGrid")) renderTrainPrograms();
}

// ── v509: short version + spoken cues ──────────────────────────────────────
// Both prefs are device-local, like `fl4_yoga_variants`: not synced, not in
// buildExportPayload, so not in the backup file or the test seed either.
// `fl4_yoga_length` is {flowIdx: "short"}; anything that is not the exact
// string "short" reads as FULL, so a corrupt value fails to the complete flow.
// `fl4_yoga_voice` is "on"/"off"; unset = on (it was asked for as automatic).
function yogaHasShort(idx) {
  var def = YOGA_SLOTTED[idx];
  return !!def && def.base.some(function(p){ return p.inShort; });
}
function yogaLengthOf(idx) {
  var p = storeGet("fl4_yoga_length");
  return (yogaHasShort(idx) && p && typeof p === "object" && p[idx] === "short") ? "short" : "full";
}
function setYogaLength(idx, which) {
  if (!yogaHasShort(idx)) return;
  var p = storeGet("fl4_yoga_length");
  if (!p || typeof p !== "object") p = {};
  p[idx] = (which === "short") ? "short" : "full";
  storeSet("fl4_yoga_length", p);
  if (SS && SS.type === "yoga" && SS.yFlowIdx === idx && SS.yPhase === "intro") SS.yShort = yogaLengthOf(idx) === "short";
  yogaVariantRepaint(idx);
}
function yogaVoiceSupported() {
  return typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined";
}
function yogaHasVoice(idx) { return !!(YOGA_SLOTTED[idx] && YOGA_SLOTTED[idx].voice) && yogaVoiceSupported(); }
function yogaVoiceOn()     { return storeGet("fl4_yoga_voice") !== "off"; }
function setYogaVoice(which) {
  storeSet("fl4_yoga_voice", which === "off" ? "off" : "on");
  yogaSpeechStop();
  if (SS && SS.type === "yoga") { SS.ySpokenFor = null; renderYogaSession(); }
}
function yogaSpeechStop() {
  if (!yogaVoiceSupported()) return;
  try { window.speechSynthesis.cancel(); } catch(e) {}
}
// v510: a choice of VOICE and SPEED. The app can only use the voices the
// phone itself has installed (speechSynthesis.getVoices) — more can be
// downloaded in the phone's own settings. Device-local like the rest:
// `fl4_yoga_voice_name` holds a voiceURI ("" = the phone's default) and
// `fl4_yoga_voice_rate` "slow"/"fast" (anything else = normal, 0.9 as v509).
// A saved voice the phone no longer has falls back to the default, silently.
var YOGA_VOICE_RATES = { slow: 0.75, normal: 0.9, fast: 1.1 };
function yogaVoiceRateKey() {
  var r = storeGet("fl4_yoga_voice_rate");
  return YOGA_VOICE_RATES.hasOwnProperty(r) ? r : "normal";
}
function setYogaVoiceRate(which) {
  storeSet("fl4_yoga_voice_rate", YOGA_VOICE_RATES.hasOwnProperty(which) ? which : "normal");
  if (SS && SS.type === "yoga") renderYogaSession();
}
// English voices only — the cues are English text. Sorted by name.
function yogaVoiceList() {
  if (!yogaVoiceSupported()) return [];
  var all = [];
  try { all = window.speechSynthesis.getVoices() || []; } catch(e) {}
  return all.filter(function(v){ return /^en([-_]|$)/i.test(v.lang || ""); })
    .sort(function(a, b){ return a.name.localeCompare(b.name); });
}
function yogaVoicePicked() {
  var uri = storeGet("fl4_yoga_voice_name");
  if (!uri) return null;
  return yogaVoiceList().filter(function(v){ return v.voiceURI === uri; })[0] || null;
}
function setYogaVoiceName(uri) {
  storeSet("fl4_yoga_voice_name", typeof uri === "string" ? uri : "");
  yogaVoiceTest();
}
// Every utterance goes through here, so the voice and speed apply everywhere.
function yogaUtterance(text) {
  var u = new SpeechSynthesisUtterance(text);
  var v = yogaVoicePicked();
  if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = "en-GB"; }
  u.rate = YOGA_VOICE_RATES[yogaVoiceRateKey()];
  return u;
}
// The intro's Test button: says the first pose of the current flow.
function yogaVoiceTest() {
  if (!yogaVoiceSupported() || !SS || SS.type !== "yoga" || !SS.yFlow || !SS.yFlow.length) return;
  try {
    window.speechSynthesis.cancel();
    yogaSpeechParts(SS.yFlow[0]).slice(0, 2).forEach(function(t){ window.speechSynthesis.speak(yogaUtterance(t)); });
  } catch(e) {}
}
// Voices load late on Chrome; repaint the intro once they arrive so the list fills.
if (typeof window.speechSynthesis !== "undefined") {
  try {
    window.speechSynthesis.addEventListener("voiceschanged", function(){
      if (typeof SS !== "undefined" && SS && SS.type === "yoga" && SS.yPhase === "intro") renderYogaSession();
    });
  } catch(e) {}
}

// Speaks the pose NAME then its short `cues` — never the Details paragraph.
// All-caps emphasis ("FLAT", "BEHIND") is lowered so engines don't spell it.
function yogaSpeechParts(pose) {
  return [pose.name].concat(pose.cues || []).map(function(t){
    return String(t).replace(/\b[A-Z]{2,}\b/g, function(w){ return w.toLowerCase(); }).replace(/\s*—\s*/g, ", ");
  });
}
// Called at the end of every running/done render. The spoken pose is DERIVED
// (`SS.ySpokenFor` vs the current pose), not triggered from each advance —
// beginYoga, the timer, skip and back all move the index, and a fifth path
// added later then speaks on its own (same reasoning as yogaPoseView).
// One utterance per cue: Chrome cuts off single utterances past ~15s.
function yogaSpeakIfDue() {
  if (!SS || SS.type !== "yoga" || !yogaHasVoice(SS.yFlowIdx) || !yogaVoiceOn() || SS.yPaused) return;
  var key = SS.yPhase === "done" ? "done" : (SS.yPhase === "running" ? "p" + SS.yPoseIdx : null);
  if (!key || SS.ySpokenFor === key) return;
  SS.ySpokenFor = key;
  var parts = key === "done"
    ? ["Practice complete.", "Before rising, roll to your right side first."]
    : yogaSpeechParts(SS.yFlow[SS.yPoseIdx]);
  try {
    window.speechSynthesis.cancel();
    parts.forEach(function(t){
      window.speechSynthesis.speak(yogaUtterance(t));
    });
  } catch(e) {}
}

// Index 0 holds the flow built from the CURRENT choices; the session works from
// SS.yFlow (set in openYogaSession) so a switch mid-intro takes effect at once.
var YOGA_FLOWS_TRAIN = [
  buildFullBodyFlow(),
  buildHipsFlow()
];
var YOGA_TRAIN_NAMES   = ['Full Body Flow','Hips & Lower Back'];
// Index-aligned with YOGA_FLOWS_TRAIN; shown on the session intro screen. Empty string = no note.
var YOGA_TRAIN_NOTES   = [
  "Reviewed August 2026 and re-tuned 30/08/2026 against the precise history — a 4 cm hiatus hernia, mild bilateral L5/S1 foraminal stenosis and an L4/L5 disc bulge. That combination is why this flow keeps to the middle of the range in both directions: extension, side-bending and rotation all close the foramen, while end-range and loaded flexion is what a disc bulge feels. The general 'flex to open the canal' advice is written for central canal stenosis and only half applies to you. The switches below choose between the reviewed version of a pose and the original — they start on the reviewed side and keep whatever you last picked. Practise at least 2–3 hours after eating, and not in the first hour after waking when the discs are at their most swollen. Keep breathing throughout — no breath-holding — and stop for regurgitation, chest or upper-abdominal pressure, or symptoms travelling further down a leg. New saddle numbness, bladder or bowel changes, foot drop or progressive weakness need urgent medical assessment. This is mobility and core work — keep it alongside your strength days and walking.",
  "Re-tuned 22/09/2026 against the same history as the Full Body Flow — a 4 cm hiatus hernia, mild bilateral L5/S1 foraminal stenosis and an L4/L5 disc bulge. The reviewed versions keep to the middle of the range: no loaded or end-range forward folds, small supported twists instead of held ones, no repeated side-bending, the head kept above the heart and nothing pressing on the stomach. They were written by the app from those rules and have NOT been checked by a physio — worth raising at your next appointment. The switches below choose between the reviewed version of each pose and the original — they start on the reviewed side, keep whatever you last picked, and the top row flips them all at once. Practise at least 2–3 hours after eating, and not in the first hour after waking. Keep breathing throughout — no breath-holding — and come out of anything that pinches or sends symptoms further down a leg. Stop for regurgitation or chest or upper-abdominal pressure. New saddle numbness, bladder or bowel changes, foot drop or progressive weakness need urgent medical assessment."
];

var POSE_PHOTOS_TRAIN = {
  swimming:'https://i.imgur.com/PQgaetS.png',standing_fold:'https://i.imgur.com/5gbrs9Q.png',
  knees_chest:'https://i.imgur.com/DuPsRq7.png',paschimottanasana:'https://i.imgur.com/UFuh4kl.png',
  eagle_twist:'https://i.imgur.com/0aDxqzj.png',windshield:'https://i.imgur.com/8l9K9p8.png',
  happy_baby:'https://i.imgur.com/cpf1aN6.png',bound_angle:'https://i.imgur.com/TUdZEV6.png',
  head_to_knee:'https://i.imgur.com/Mz3Kc56.png',froggy:'https://i.imgur.com/XkewjmU.png',
  yogi_squat:'https://i.imgur.com/KC0pJvb.png',seated_fwd_var:'https://i.imgur.com/9qlbSsR.png',
  boat_prep:'https://i.imgur.com/YC7xez0.png',seated_twist:'https://i.imgur.com/jntGvZo.png'
};
function getPosePhoto(name) {
  var n = name.toLowerCase();
  if (n.includes('seated forward fold variation')) return POSE_PHOTOS_TRAIN.seated_fwd_var;
  if (n.includes('boat prep')||n.includes('core stability')) return POSE_PHOTOS_TRAIN.boat_prep;
  if (n.includes('seated spinal twist')) return POSE_PHOTOS_TRAIN.seated_twist;
  if (n.includes('head-to-knee')||n.includes('janu')) return POSE_PHOTOS_TRAIN.head_to_knee;
  if (n.includes('bound angle')||n.includes('diamond')) return POSE_PHOTOS_TRAIN.bound_angle;
  if (n.includes('swimming')) return POSE_PHOTOS_TRAIN.swimming;
  if (n.includes('paschimottanasana')||(n.includes('seated forward fold')&&!n.includes('variation'))) return POSE_PHOTOS_TRAIN.paschimottanasana;
  if (n.includes('froggy')) return POSE_PHOTOS_TRAIN.froggy;
  if (n.includes('yogi squat')) return POSE_PHOTOS_TRAIN.yogi_squat;
  if (n.includes('standing forward')) return POSE_PHOTOS_TRAIN.standing_fold;
  if (n.includes('knees to chest')) return POSE_PHOTOS_TRAIN.knees_chest;
  if (n.includes('eagle legs')) return POSE_PHOTOS_TRAIN.eagle_twist;
  if (n.includes('happy baby')) return POSE_PHOTOS_TRAIN.happy_baby;
  if (n.includes('windshield')) return POSE_PHOTOS_TRAIN.windshield;
  return null;
}

var PROGRAMMES_TRAIN = [
  {id:'nerve_hip',name:'Nerve &amp; Hip',icon:'&#x1F9E0;',note:'Nerve mobility · hip flexor · daily',color:'#14b8a6',exercises:[
    {id:'femoral',name:'Femoral Nerve Glide (Right)',type:'timed',sets:1,dur:60,note:'1 min · right leg',cue:'Lie on your LEFT side and bring your top (right) leg behind you. Reach for your foot and pull it toward your bottom, extending the hip back to feel a stretch in the groin. Holding the position, slowly bend your neck forward and backward in a gentle rhythm for the full minute.',url:'https://www.youtube.com/watch?v=q1ySRKEI0-I'},
      {id:'femoral_l',name:'Femoral Nerve Glide (Left)',type:'timed',sets:1,dur:60,note:'1 min · left leg',cue:'Roll onto your RIGHT side and repeat with the left leg: pull the foot toward your bottom, hip extended, then gently nod the neck forward and back rhythmically for the full minute.',url:'https://www.youtube.com/watch?v=q1ySRKEI0-I'},
    {id:'sciatic',name:'Sciatic Nerve Floss (Right)',type:'timed',sets:1,dur:60,note:'1 min · right leg',cue:'Sit tall in a chair, knees hip-width, feet flat. Extend your RIGHT leg with toes pulled firmly toward you. Synchronise: look up at the ceiling as the knee extends, then flex head and knee together. Slow and rhythmic for the full minute.',url:'https://www.youtube.com/watch?v=OMbKv94Bu_U'},
      {id:'sciatic_l',name:'Sciatic Nerve Floss (Left)',type:'timed',sets:1,dur:60,note:'1 min · left leg',cue:'Same flossing with the LEFT leg: extend with toes toward you while looking up, then flex head and knee together. Slow, gentle, rhythmic for the full minute.',url:'https://www.youtube.com/watch?v=OMbKv94Bu_U'},
    {id:'hip_flexor',name:'Leg Raise Over Kettlebell (Right)',type:'timed',sets:1,dur:30,note:'30s · right leg',cue:'Sit on the floor, legs in a wide V with a kettlebell between them. Keeping your RIGHT leg straight, lift it up and over the kettlebell to the other side, then back. Upright torso, core braced. Steady lifts for the 30 seconds.',url:'https://www.youtube.com/shorts/BVB2dIf5T2E'},
      {id:'hip_flexor_l',name:'Leg Raise Over Kettlebell (Left)',type:'timed',sets:1,dur:30,note:'30s · left leg',cue:'Switch to the LEFT leg: straight-leg lifts up and over the kettlebell and back, torso upright, core stabilising. Steady lifts for the 30 seconds.',url:'https://www.youtube.com/shorts/BVB2dIf5T2E'},
    {id:'one_leg',name:'Pilates One Leg Stretch',type:'timed',dur:60,sets:1,note:'1 min · alternating legs',cue:'Start on your back and exhale as you bring both legs into a tabletop position one at a time, knees hip-distance apart. Exhale as you lengthen one leg forward and upward to a diagonal; inhale as you return it to tabletop. Alternate legs while maintaining a stable spine and keeping your lower back connected to the mat throughout.',url:'https://www.youtube.com/watch?v=fOhKim3hKvI'}
  ]},
  {id:'lower_limb',name:'Lower Limb',icon:'&#x1F9B5;',note:'Glutes · hamstring · quad · calf · knee · daily',color:'#14b8a6',warning:'This programme predates your spinal stenosis diagnosis. The squats and lunges load the spine — keep a neutral or slightly forward torso, never arch backward, and skip on flare-up days. Check with your physio.',exercises:[
    {id:'hamstring_str',name:'Hamstring Stretch (Right)',type:'timed',dur:30,sets:1,note:'30s · right leg',cue:'Lie on your back. Loop a towel or band around your right foot and straighten the leg toward the ceiling. Keep the opposite leg flat on the floor. Gently pull the towel to increase the stretch — stop before any pain. Hold 30 seconds, breathing steadily.',url:'https://www.youtube.com/watch?v=QL8FK8CsGc8'},
      {id:'hamstring_str_l',name:'Hamstring Stretch (Left)',type:'timed',dur:30,sets:1,note:'30s · left leg',cue:'Same stretch on the left: loop the towel around your left foot, straighten the leg toward the ceiling, opposite leg flat. Gently pull to increase the stretch — stop before any pain. Hold 30 seconds, breathing steadily.',url:'https://www.youtube.com/watch?v=QL8FK8CsGc8'},
    {id:'quad_str_side',name:'Quad Stretch (Right)',type:'timed',dur:30,sets:1,note:'30s · right side',cue:'Lie on your left side with your body in a straight line. Bend your top (right) knee, reaching back to hold your ankle or foot. Gently draw the heel toward your glutes — keep your knees together and your hips forward. Avoid arching your lower back. Hold 30 seconds.',url:'https://www.youtube.com/watch?v=599Tvr-JrBc'},
      {id:'quad_str_side_l',name:'Quad Stretch (Left)',type:'timed',dur:30,sets:1,note:'30s · left side',cue:'Roll onto your right side and repeat: bend your top (left) knee, hold your ankle or foot, draw the heel toward your glutes — knees together, hips forward, no arching. Hold 30 seconds.',url:'https://www.youtube.com/watch?v=599Tvr-JrBc'},
    {id:'sl_glute_bridge',name:'Single Leg Glute Bridge (Right)',type:'timed',sets:1,dur:30,note:'30s · right leg working',cue:'Lie on your back, knees bent, feet flat. Extend your LEFT leg straight. Press through the grounded RIGHT foot to lift your hips \u2014 squeeze the glute at the top. Keep hips level; don\'t let the lifted side drop. Lower slowly and repeat for the 30 seconds.',url:'https://www.youtube.com/watch?v=p-XVfkvtUPY'},
      {id:'sl_glute_bridge_l',name:'Single Leg Glute Bridge (Left)',type:'timed',sets:1,dur:30,note:'30s · left leg working',cue:'Switch: extend your RIGHT leg straight and drive through the LEFT foot. Hips level, squeeze at the top, slow lowers, steady reps for the 30 seconds.',url:'https://www.youtube.com/watch?v=p-XVfkvtUPY'},
    {id:'hip_abduction',name:'Hip Abduction with Band (Right)',type:'timed',sets:1,dur:30,note:'30s · right side up · band on',cue:'Band just above your knees. Lie on your LEFT side, hips stacked, knees slightly bent. Feet together, raise your top (right) knee like a clamshell opening \u2014 no rolling the pelvis back. Pause at the top, lower with control, repeat for the 30 seconds.',url:'https://www.youtube.com/watch?v=ESB3VC1XLoE'},
      {id:'hip_abduction_l',name:'Hip Abduction with Band (Left)',type:'timed',sets:1,dur:30,note:'30s · left side up · band on',cue:'Roll onto your RIGHT side and repeat with the left knee lifting: feet together, pelvis still, pause at the top, controlled lowers for the 30 seconds.',url:'https://www.youtube.com/watch?v=ESB3VC1XLoE'},
    {id:'plantar_flex',name:'One Leg Plantar Flexion (Right)',type:'timed',sets:1,dur:30,note:'30s · right foot · knee bent on step',cue:'Stand on the step edge with the ball of your RIGHT foot. Heel drops below the step for a stretch, then rise high onto your toes. Slight knee bend to target the soleus. Wall for balance if needed. Steady reps for the 30 seconds.',url:'https://www.youtube.com/watch?v=muijOYVNgsA'},
      {id:'plantar_flex_l',name:'One Leg Plantar Flexion (Left)',type:'timed',sets:1,dur:30,note:'30s · left foot · knee bent on step',cue:'Switch to the LEFT foot: heel drop, rise to toes, slight knee bend, steady controlled reps for the 30 seconds.',url:'https://www.youtube.com/watch?v=muijOYVNgsA'},
    {id:'fwd_lunge',name:'Alternate Forward Lunge',type:'timed',sets:1,dur:30,note:'30s · alternating legs',cue:'Stand tall, feet hip-width. Step one foot forward and lower your back knee toward the floor — front knee stays directly over the ankle, not past the toes. Push back through the front heel to return to standing. Alternate legs with each rep. Keep your torso upright and core braced throughout.',url:'https://www.youtube.com/watch?v=CpvfDjEulYQ'},
    {id:'bw_squat',name:'Bodyweight Squat',type:'timed',sets:1,dur:30,note:'30s · hips back, knees over feet',cue:'Stand feet shoulder-width, toes turned slightly out. Push your hips back and bend your knees, keeping your chest up and spine neutral. Lower until thighs are parallel to the floor if possible — knees tracking over your second toe throughout. Drive through your heels to stand. 20 reps.',url:'https://www.youtube.com/watch?v=m0GcZ24pK6k'},
    {id:'single_leg_sq',name:'Single Leg Squat (Right)',type:'timed',sets:1,dur:30,note:'30s · right leg · knee over 2nd toe',cue:'Stand on your RIGHT leg, hands out for balance. Bend the standing knee, hips back as if sitting to a chair, knee tracking over your second toe. Lower only as far as you can control, press back up. Steady reps for the 30 seconds.',url:'https://www.youtube.com/watch?v=Npz-kOxdy9I'},
      {id:'single_leg_sq_l',name:'Single Leg Squat (Left)',type:'timed',sets:1,dur:30,note:'30s · left leg · knee over 2nd toe',cue:'Switch to your LEFT leg: hips back, knee over second toe, controlled depth only, press back up. Steady reps for the 30 seconds.',url:'https://www.youtube.com/watch?v=Npz-kOxdy9I'},
    {id:'wall_squat',name:'Wall Squat',type:'timed',dur:45,sets:1,note:'Hold 45s · thighs parallel · knees 90°',cue:'Stand with your back flat against a wall. Slide down until your thighs are parallel to the floor and knees are at 90°. Feet should be hip-width, directly below your knees. Press your lower back firmly into the wall. Keep your weight in your heels. Hold for 45 seconds, breathing steadily.',url:'https://www.youtube.com/watch?v=GyncayY3GuY'}
  ]}
  ,{id:'max_physio',name:'Max Physio',icon:'&#x1F33F;',note:'Post-natal · core & glutes · daily',color:'#14b8a6',exercises:[
    {id:'clamshells',name:'Clamshells (Right)',type:'timed',dur:30,sets:1,note:'30s · right side up',cue:'Lie on your left side with hips and knees bent to about 45°. Keeping your feet together, raise your top (right) knee as high as you can without rotating your pelvis backward. Lower slowly and with control. Repeat steadily for the 30 seconds.'},
      {id:'clamshells_l',name:'Clamshells (Left)',type:'timed',dur:30,sets:1,note:'30s · left side up',cue:'Roll onto your right side, hips and knees bent to about 45°. Feet together, raise your top (left) knee without rotating your pelvis backward. Lower slowly and with control. Repeat steadily for the 30 seconds.'},
    {id:'thigh_squeeze',name:'Thigh Squeezes',type:'timed',dur:30,sets:1,note:'30s · controlled holds',cue:'Lie on your back with knees bent and feet flat. Place a small pillow or folded towel between your knees. Squeeze your knees firmly together and hold for 10 seconds. Release fully, then repeat. 10 reps.'},
    {id:'hip_squeeze',name:'Hip Squeezes',type:'timed',dur:30,sets:1,note:'30s',cue:'Lie on your back with knees bent and feet flat. Squeeze your buttocks firmly together and hold for 1–2 seconds, then relax completely. 15 reps, 2 sets.'},
    {id:'tummy_tuck',name:'Tummy Tuck In',type:'timed',dur:30,sets:1,note:'30s · controlled holds',cue:'Lie on your back with knees bent, feet flat. Breathe in, then as you breathe out gently draw your lower tummy inward — belly button toward spine. Hold 5 seconds, breathe normally, then release. 10 reps.'},
    {id:'figure4',name:'Figure of 4 (Right)',type:'timed',dur:30,sets:1,note:'30s · right ankle over',cue:'Lie on your back with knees bent. Cross your right ankle over your left knee. Gently press your right knee away, or draw your left thigh toward your chest until you feel a stretch in your right hip and glute. Hold for the 30 seconds.'},
      {id:'figure4_l',name:'Figure of 4 (Left)',type:'timed',dur:30,sets:1,note:'30s · left ankle over',cue:'Switch: cross your left ankle over your right knee. Press the left knee gently away, or draw your right thigh toward your chest until you feel the stretch in your left hip and glute. Hold for the 30 seconds.'},
    {id:'tabletop',name:'Practice Table Top',type:'timed',dur:40,sets:1,note:'40s · alternate sides',cue:'Lie on your back with knees bent. Engage your core gently. Breathe in, then as you breathe out slowly float one knee up to 90° — shin parallel to floor, lower back still. Breathe in to lower. Alternate legs. 10 reps each side.'}
  ]},
  {id:'decompression',name:'Decompression',icon:'&#x1F9D8;',note:'Stenosis · hernia · gentle daily',color:'#818cf8',exercises:[
    {id:'diaphragm_breath',name:'Diaphragmatic Breathing',type:'timed',dur:60,sets:1,note:'1 min · calms & decompresses',cue:'Lie on your back with knees bent, feet flat. Place one hand on your chest, one on your belly. Inhale slowly through your nose for 4 counts, letting your belly rise while your chest stays still. Exhale gently for 6 counts. This relaxes the diaphragm and reduces pressure on the hiatal hernia. Do not strain.',url:'https://www.youtube.com/watch?v=ACf2kZST3c4'},
    {id:'pelvic_tilt',name:'Pelvic Tilts',type:'timed',dur:30,sets:1,note:'30s · slow & controlled',cue:'Lie on your back with knees bent. Gently flatten your lower back against the floor by tightening your abdominals and tilting your pelvis upward slightly. Hold 2 seconds, then release. This is a flexion movement that gently opens the spinal canal — key for stenosis relief. Keep your breath steady throughout.',url:'https://www.youtube.com/watch?v=GKz3q3-12-g'},
    {id:'knee_to_chest',name:'Single Knee to Chest (Right)',type:'timed',dur:30,sets:1,note:'30s · right knee',cue:'Lie on your back with knees bent. Draw your right knee gently toward your chest using both hands. Keep your lower back relaxed and the left foot flat on the floor. Breathe slowly — this opens the lumbar spine and is one of the most effective positions for spinal stenosis relief. Avoid pulling hard.',url:'https://www.youtube.com/watch?v=OsNfPCKaJf0'},
      {id:'knee_to_chest_l',name:'Single Knee to Chest (Left)',type:'timed',dur:30,sets:1,note:'30s · left knee',cue:'Switch sides: draw your left knee gently toward your chest with both hands, right foot flat on the floor. Lower back relaxed, slow breaths, no hard pulling.',url:'https://www.youtube.com/watch?v=OsNfPCKaJf0'},
    {id:'double_knee_chest',name:'Double Knee to Chest',type:'timed',dur:30,sets:1,note:'30s hold',cue:'Lie on your back and draw both knees slowly toward your chest. Wrap your arms gently around your shins. Rock side to side very gently if comfortable. This fully flexes the lumbar spine, creating traction and relieving stenosis pressure. Keep the movement gentle — avoid any compression on your abdomen.',url:'https://www.youtube.com/watch?v=KkJDO6kJ-4s'},
    {id:'cat_cow_flex',name:'Cat Stretch (flexion only)',type:'timed',dur:30,sets:1,note:'30s · flexion only',cue:'Start on all fours. Only perform the Cat (rounding) phase — exhale and press the floor away, round your spine to the ceiling, tuck your chin and tailbone. Then return to neutral. Avoid the Cow (back arch / extension) phase as this can compress the spinal canal. Focus entirely on the gentle flexion and spinal decompression.',url:'https://www.youtube.com/watch?v=kqnua4rHVVA'},
    {id:'seated_flexion',name:'Seated Forward Lean',type:'timed',dur:30,sets:1,note:'30s · seated flexion',cue:'Sit at the edge of a chair with feet flat and slightly apart. Slowly lean forward, resting your forearms on your thighs. Let your lower back gently round. Breathe deeply. This flexion position relieves stenosis by widening the spinal canal. Avoid bending from the waist — let the whole spine round gently from the base.',url:'https://www.youtube.com/watch?v=Q5RBH0gR5xQ'},
    {id:'childs_pose_st',name:"Child's Pose",type:'timed',dur:60,sets:1,note:'Hold 60s',cue:"Kneel and sit back onto your heels, then fold forward with arms outstretched or resting alongside your body. Let your spine gently round and lengthen. This is excellent for stenosis — the flexion position opens the spinal canal. Breathe slowly and deeply into your back. If kneeling is uncomfortable, use a folded blanket under your knees.",url:'https://www.youtube.com/watch?v=2MJGg-dUKh0'}
  ]},
  {id:'max_pilates_core',name:'Max Pilates Core',icon:'&#x1F9D8;',note:'Core stability · Pilates · daily',color:'#0ea5e9',exercises:[
    {id:'dead_bugs_mpc',name:'Dead Bugs',type:'timed',dur:30,sets:1,note:'30s alternating',cue:'Lie on your back with arms reaching toward the ceiling and knees bent at 90° (table top). Keeping your lower back gently pressed to the floor, slowly lower your opposite arm and leg toward the floor, then return. Alternate sides. Keep your core engaged and your back flat throughout — never let it arch.',url:'https://www.youtube.com/watch?v=g_BYB0R-4Ws'},
    {id:'tabletop_hold',name:'Table Top Hold',type:'timed',dur:30,sets:1,note:'Hold 30s',cue:'Lie on your back, lift both legs so your hips and knees are bent at 90° — shins parallel to the floor (table top). Hold this position steady, keeping your lower back gently pressed down and core engaged. Breathe steadily.',url:'https://www.youtube.com/watch?v=v7AYKMP6rOE'},
    {id:'tabletop_arms_up',name:'Table Top, Arms Up',type:'timed',dur:30,sets:1,note:'Hold 30s',cue:'From table top position (hips and knees at 90°), raise both arms straight up toward the ceiling. Hold steady, keeping your core braced and lower back flat to the floor. Breathe steadily throughout.',url:'https://www.youtube.com/watch?v=v7AYKMP6rOE'},
    {id:'tabletop_arm_press',name:'Table Top + Arm Press',type:'timed',dur:30,sets:1,note:'30s',cue:'From table top with arms raised, slowly press your arms straight back overhead toward the floor behind you, then return to vertical. Keep your core engaged and lower back flat — the movement comes from the shoulders, not the back. Control the motion both ways.',url:'https://www.youtube.com/watch?v=g_BYB0R-4Ws'},
    {id:'tabletop_leg_45',name:'Table Top + Leg to 45°',type:'timed',dur:30,sets:1,note:'30s alternating',cue:'From table top with arms pressing, extend one leg out to about 45° while keeping the other in table top. Return and alternate legs. Keep your lower back pressed firmly to the floor — if your back starts to arch, extend the leg less far. Move slowly and with control.',url:'https://www.youtube.com/watch?v=g_BYB0R-4Ws'},
    {id:'bridges_mpc',name:'Bridges',type:'timed',dur:30,sets:1,note:'30s · tuck, squeeze, lift',cue:'Lie on your back with knees bent and feet flat. First tuck your tummy (gentle pelvic tilt), then squeeze your glutes, then lift your hips up toward the ceiling. Add a thigh squeeze at the top, and lift your heels up if comfortable. Lower slowly. This sequence protects your spine — the tummy tuck and flexion keep the movement stenosis-safe.',url:'https://www.youtube.com/watch?v=wPM8icPu6H8'}
  ]},
  {id:'knee_general',name:'Knee Programme',icon:'&#x1F9B4;',note:'Knee · gentle strength and stretch · daily',color:'#22c55e',levels:true,warning:'A gentle, general-purpose knee programme — not a diagnosis and not prescribed for anyone in particular. Mild discomfort, up to about 3/10, that settles within a day is fine. Sharp pain, swelling or the knee giving way means stop. See a physio or GP first if you have significant swelling, locking, instability, a recent injury or surgery, or pain that is not improving after 2–3 weeks.',info:'Progression, after 2–3 pain-free weeks: mini squats (0–45°) holding onto a counter · step-ups on a low step · single-leg balance for 30 seconds · a light ankle weight added to the leg raises.',exercises:[
    {id:'heel_slides_kn',name:'Heel Slides',type:'reps',eachLeg:true,reps:15,sets:1,note:'Warm-up · 10–15 reps each leg',cue:'Lie on your back with both legs straight. Slowly slide one heel along the floor toward your bum, bending the knee as far as is comfortable, then slide it back out. Smooth and pain-free throughout — this is a warm-up, not a stretch. 10–15 reps, then swap legs.',cues:["Lie on your back, both legs straight","Slide one heel along the floor toward your bum","Bend only as far as is comfortable, then slide back out","Smooth and pain-free — a warm-up, not a stretch","10–15 reps, then swap legs"]},
    {id:'ankle_pumps_kn',name:'Ankle Pumps',type:'reps',reps:20,sets:1,note:'Warm-up · 20 reps',cue:'Lie or sit with your legs out in front of you. Point both feet away from you, then pull your toes back toward your shins. Steady and rhythmic — this gets the calf pump going before the strength work. 20 reps.',cues:["Lie or sit with your legs out in front","Point both feet away from you","Then pull your toes back toward your shins","Steady and rhythmic — 20 reps"]},
    {id:'quad_sets_kn',name:'Quad Sets',type:'reps',eachLeg:true,reps:10,sets:2,note:'Strength · 2 × 10 each leg · hold 5s',cue:'Sit or lie with the working leg straight out in front of you. Press the back of your knee down into the floor and tighten the thigh muscle. Hold 5 seconds, then relax fully. 10 reps on each leg.',cues:["Sit or lie with the working leg straight out","Press the back of the knee down into the floor","Tighten the thigh and hold 5 seconds","Relax fully between reps — 10 on each leg"]},
    {id:'slr_kn',name:'Straight Leg Raise',type:'reps',eachLeg:true,reps:10,sets:2,note:'Strength · 2 × 10 each leg',cue:'Lie on your back with one knee bent and the working leg straight. Tighten the thigh first, then lift the straight leg about 30 cm off the floor. Hold 2–3 seconds and lower slowly — the slow lowering is the part that builds the quad. 10 reps on each leg.',cues:["One knee bent, the working leg straight","Tighten the thigh FIRST, then lift about 30 cm","Hold 2–3 seconds","Lower slowly — the slow lowering is what builds the quad"]},
    {id:'short_arc_quads_kn',name:'Short Arc Quads',type:'reps',eachLeg:true,reps:10,sets:2,note:'Strength · 2 × 10 each leg · towel roll',cue:'Lie on your back with a rolled towel under your knee so the knee stays slightly bent. Straighten the lower leg by lifting the foot, keeping the back of the knee resting on the towel. Hold 3 seconds, then lower slowly. 10 reps on each leg.',cues:["Rolled towel under the knee so it stays slightly bent","Lift the foot to straighten the lower leg","Back of the knee stays resting on the towel","Hold 3 seconds, lower slowly — 10 on each leg"]},
    {id:'glute_bridge_kn',name:'Glute Bridge',type:'reps',reps:10,sets:2,note:'Strength · 2 × 10 · hold 3s',cue:'Lie on your back, knees bent, feet flat and hip-width apart. Squeeze your glutes and lift your hips until your body makes a straight line from shoulders to knees. Hold 3 seconds, then lower with control. 10 reps.',cues:["Knees bent, feet flat and hip-width apart","Squeeze the glutes, then lift the hips","A straight line from shoulders to knees","Hold 3 seconds, lower with control"]},
    {id:'side_leg_raise_kn',name:'Side-Lying Leg Raise',type:'reps',eachLeg:true,reps:10,sets:2,note:'Strength · 2 × 10 each side',cue:'Lie on your side with your body in a straight line and the bottom knee bent for balance. Lift the top leg straight up with the toes pointing forward, not turned up to the ceiling. Lower slowly. 10 reps on each side.',cues:["On your side, body in a straight line","Bottom knee bent for balance","Lift the top leg with the toes pointing FORWARD","Not turned up to the ceiling. Lower slowly"]},
    {id:'seated_knee_ext_kn',name:'Seated Knee Extension',type:'reps',eachLeg:true,reps:10,sets:2,note:'Strength · 2 × 10 each leg · hold 3s',cue:'Sit tall on a chair with your feet flat on the floor. Straighten one knee fully, hold 3 seconds with the thigh tight, then lower slowly. Do not swing the leg up. 10 reps on each leg.',cues:["Sit tall, feet flat on the floor","Straighten one knee fully","Hold 3 seconds with the thigh tight","Lower slowly — never swing the leg up"]},
    {id:'hamstring_str_kn',name:'Hamstring Stretch',type:'timed',dur:30,sets:4,perLeg:true,note:'Stretch · 30s hold · twice each leg',cue:'Sit on the edge of a chair with one leg straight out in front, heel on the floor and toes up. Keeping your back straight, lean forward gently from the hips until you feel the stretch behind the thigh. Hold 30 seconds, twice on this side.',cues:["Sit on the edge of a chair, one leg straight out","Heel on the floor, toes up","Back straight — lean forward from the hips","Stop at a stretch behind the thigh. Hold 30 seconds"]},
    {id:'calf_str_kn',name:'Calf Stretch',type:'timed',dur:30,sets:4,perLeg:true,note:'Stretch · 30s hold · twice each leg',cue:'Stand facing a wall with your hands on it. Step one foot back, keep that back leg straight and the heel pressed down, and lean into the wall until you feel the stretch in the calf. Hold 30 seconds, twice on this side.',cues:["Face a wall, hands on it","Step one foot back, that leg straight","Press the back heel down and keep it down","Lean in until you feel the calf. Hold 30 seconds"]},
    {id:'quad_str_kn',name:'Quad Stretch',type:'timed',dur:30,sets:4,perLeg:true,note:'Stretch · 30s hold · twice each leg',cue:'Lie on your side, or stand holding onto something solid. Bend the top knee and take hold of the ankle, then draw the heel gently toward your bum. Keep your knees together and your hips forward — no arching the lower back. Hold 30 seconds, twice on this side.',cues:["Lie on your side, or stand holding something solid","Bend the top knee and take hold of the ankle","Draw the heel gently toward your bum","Knees together, hips forward — no arching the back"]},
    {id:'knee_finish_kn',name:'Easy Walk or Cycle',type:'timed',dur:600,sets:1,note:'Finish · 10 min easy',cue:'Finish with about 10 minutes of walking or easy cycling to keep the knee moving. Keep it comfortable — this is a cool-down, not a workout. Tap Skip if you would rather head out and do it away from the phone.',cues:["About 10 minutes of walking or easy cycling","Keep it comfortable — a cool-down, not a workout","Just keep the knee moving","Tap Skip to do it away from the phone"]}
  ]}
];

var QUICK_EXERCISES = [
  "Bench Press","Squat","Deadlift","Overhead Press","Pull-ups",
  "Barbell Row","Dips","Leg Press","Lat Pulldown","Bicep Curl",
  "Tricep Pushdown","Face Pulls","Lunges","Romanian Deadlift",
  "Plank","Push-ups","Incline Press","Cable Row","Hip Thrust","Leg Curl"
];

// ── Free-form log state ───────────────────────────────────
var currentTrainView = "programs"; // Body moved to the Track section in v339
var workoutDate      = trainTodayStr();

function trainTodayStr() {
  var d = new Date();
  return d.getFullYear() + "-" + t2(d.getMonth()+1) + "-" + t2(d.getDate());
}
function t2(n) { return n < 10 ? "0"+n : ""+n; }
function trainShiftDay(dateStr, delta) {
  var d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return d.getFullYear() + "-" + t2(d.getMonth()+1) + "-" + t2(d.getDate());
}
function trainFmtDate(dateStr) {
  var today = trainTodayStr(), yest = trainShiftDay(today,-1);
  if (dateStr === today) return "Today";
  if (dateStr === yest)  return "Yesterday";
  var d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-IE", { weekday:"short", day:"numeric", month:"short" });
}
function trainFmtDateLong(dateStr) {
  var d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-IE", { weekday:"long", day:"numeric", month:"long" });
}
function getWD()      { return storeGet("fl4_workouts") || { workouts:[], bodyweight:[] }; }
function saveWD(data) { storeSet("fl4_workouts", data); }
function getWorkoutForDate(date) {
  var data = getWD();
  for (var i=0;i<data.workouts.length;i++) if (data.workouts[i].date===date) return data.workouts[i];
  return null;
}
function getOrMakeWorkout(date) {
  var data = getWD();
  for (var i=0;i<data.workouts.length;i++) if (data.workouts[i].date===date) return;
  data.workouts.unshift({ id:Date.now(), date:date, exercises:[] });
  data.workouts.sort(function(a,b){ return b.date.localeCompare(a.date); });
  saveWD(data);
}

// ── Sub-nav ───────────────────────────────────────────────
document.getElementById("trainSection").addEventListener("click", function(e) {
  var btn = e.target.closest(".tsn-btn");
  if (!btn) return;
  currentTrainView = btn.dataset.view;
  document.querySelectorAll("#trainSection .tsn-btn").forEach(function(b){ b.classList.toggle("active", b.dataset.view===currentTrainView); });
  document.getElementById("trainProgramsView").style.display = currentTrainView==="programs" ? "" : "none";
  document.getElementById("trainLogView").style.display      = currentTrainView==="log"      ? "" : "none";
  document.getElementById("trainHistoryView").style.display  = currentTrainView==="history"  ? "" : "none";
  renderTrainView();
});

// ── Date nav ──────────────────────────────────────────────
document.getElementById("prevDayBtn").addEventListener("click", function(){
  workoutDate = trainShiftDay(workoutDate,-1); renderWorkoutLog();
});
document.getElementById("nextDayBtn").addEventListener("click", function(){
  if (workoutDate < trainTodayStr()) { workoutDate = trainShiftDay(workoutDate,1); renderWorkoutLog(); }
});

// ── Add free-form exercise ────────────────────────────────
document.getElementById("addExerciseBtn").addEventListener("click", function(){
  doAddExercise(document.getElementById("exerciseInput").value.trim());
});
document.getElementById("exerciseInput").addEventListener("keydown", function(e){
  if (e.key==="Enter") doAddExercise(this.value.trim());
});

function doAddExercise(name) {
  if (!name) return;
  getOrMakeWorkout(workoutDate);
  var data = getWD();
  for (var i=0;i<data.workouts.length;i++) {
    if (data.workouts[i].date===workoutDate) {
      for (var j=0;j<data.workouts[i].exercises.length;j++) {
        if (data.workouts[i].exercises[j].name.toLowerCase()===name.toLowerCase()) { toast("Already added!"); return; }
      }
      data.workouts[i].exercises.push({ name:name, sets:[{weight:0,reps:0}] });
      saveWD(data);
      document.getElementById("exerciseInput").value = "";
      renderWorkoutLog();
      openSetSheet(data.workouts[i].exercises.length-1, 0);
      return;
    }
  }
}

(function buildChips(){
  var el = document.getElementById("quickChips"), html="";
  for (var i=0;i<QUICK_EXERCISES.length;i++)
    html+="<button class='qchip' data-name='"+esc(QUICK_EXERCISES[i])+"'>"+esc(QUICK_EXERCISES[i])+"</button>";
  el.innerHTML = html;
  el.addEventListener("click",function(e){ var c=e.target.closest(".qchip"); if(c) doAddExercise(c.dataset.name); });
})();

function renderTrainView() {
  if (currentTrainView==="body")     currentTrainView = "programs"; // Body lives in Track since v339
  if (currentTrainView==="programs") renderTrainPrograms();
  if (currentTrainView==="log")      renderWorkoutLog();
  if (currentTrainView==="history")  renderWorkoutHistory();
}

// ── Programs grid ─────────────────────────────────────────
function renderTrainPrograms() {
  var el = document.getElementById("progGrid");
  // Both flows' length and duration depend on the slot choices, so the cards are
  // built from the live flow rather than a hard-coded string that would rot.
  var _fbShort = yogaLengthOf(0) === "short";
  var _fbFlow = buildSlottedFlow(0, _fbShort), _hlbFlow = buildHipsFlow();
  var programs = [
    { type:"workout", key:"pull",  bg:"linear-gradient(135deg,#E8EFFA,#F0F5FC)", border:"#3b82f640", icon:"&#x1F535;", name:"Pull Day", desc:"Ring Rows · Split Squats · Assisted Pull-ups · Bridge", descColor:"#2A5AB0" },
    { type:"workout", key:"push",  bg:"linear-gradient(135deg,#FBEAEA,#FCF2F2)", border:"#ef444430", icon:"&#x1F534;", name:"Push Day", desc:"Bench Dips · Single-leg DL · Push-ups · Side Plank", descColor:"#B03030" },
    // v507: beginner versions for Cathal's wife — no clinical note, 2 rounds.
    { type:"workout", key:"pullb", bg:"linear-gradient(135deg,#E3F3FB,#EEF8FD)", border:"#0ea5e940", icon:"&#x1F535;", name:"Beginner Pull Day", tag:"Fitness", desc:"Ring Rows · Goblet Squat · Dead Hang · Bridge", descColor:"#0A6A9A" },
    { type:"workout", key:"pushb", bg:"linear-gradient(135deg,#FDEFE3,#FEF6EE)", border:"#f9731640", icon:"&#x1F534;", name:"Beginner Push Day", tag:"Fitness", desc:"Incline Push-ups · Romanian DL · Bench Dips · Side Plank", descColor:"#B0500A" },
    // v482: the only card whose desc reads saved progress — it is the one programme that keeps any.
    { type:"pullup",  key:0,       bg:"linear-gradient(135deg,#E8EFFA,#F0F5FC)", border:"#3b82f640", icon:"&#x1F4AA;", name:"Pull-up Plan", tag:"Fitness", desc:pullupSessionsDone(pullupState())+" of "+pullupTotalSessions()+" sessions · 4 weeks", descColor:"#2A5AB0" },
    { type:"yoga",    key:0,       bg:"linear-gradient(135deg,#EAE4F8,#F2EDFB)", border:"#8b5cf650", icon:"&#x1F9D8;", name:"Full Body Flow", tag:"Physio", desc:_fbFlow.length+" poses · ~"+Math.round(yogaFlowTotal(_fbFlow)/60)+" min · "+(_fbShort?"short":"your version"), descColor:"#6A3CB0" },
    { type:"yoga",    key:1,       bg:"linear-gradient(135deg,#F0EAFA,#F6F2FC)", border:"#8b5cf630", icon:"&#x1F9D8;", name:"Hips &amp; Lower Back", tag:"Physio", desc:_hlbFlow.length+" poses · ~"+Math.round(yogaFlowTotal(_hlbFlow)/60)+" min · your version", descColor:"#6A3CB0" },
    { type:"physio",  key:0,       bg:"linear-gradient(135deg,#E2F4F1,#EFFAF8)", border:"#14b8a630", icon:"&#x1FAB4;", name:"Nerve &amp; Hip", tag:"Physio", desc:"7 exercises · nerve mobility", descColor:"#0A8070" },
    { type:"physio",  key:1,       bg:"linear-gradient(135deg,#E2F4F1,#EFFAF8)", border:"#14b8a630", icon:"&#x1F9B5;", name:"Lower Limb", tag:"Fitness", desc:"15 exercises · glutes · quad · calf", descColor:"#0A8070" },
    { type:"physio",  key:2,       bg:"linear-gradient(135deg,#E2F4F1,#EFFAF8)", border:"#14b8a630", icon:"&#x1F33F;", name:"Max Physio", tag:"Physio", desc:"8 exercises · post-natal · core &amp; glutes", descColor:"#0A8070" },
    { type:"physio",  key:3,       bg:"linear-gradient(135deg,#EAECFA,#F2F3FC)", border:"#6366f130", icon:"&#x1F9D8;", name:"Decompression", tag:"Physio", desc:"7 exercises · spine · hips · shoulders", descColor:"#4A50C0" },
    { type:"physio",  key:4,       bg:"linear-gradient(135deg,#E2F1FA,#EFF8FC)", border:"#0ea5e930", icon:"&#x1F9D8;", name:"Max Pilates Core", tag:"Physio", desc:"6 exercises · core stability · Pilates", descColor:"#0A7AB0" },
    { type:"physio",  key:5,       bg:"linear-gradient(135deg,#E4F6E8,#F0FBF2)", border:"#22c55e30", icon:"&#x1F9B4;", name:"Knee Programme", tag:"Fitness", desc:"12 exercises · warm-up · strength · stretch", descColor:"#1A8040" }
  ];
  var html = "";
  for (var i=0;i<programs.length;i++) {
    var p = programs[i];
    html += "<button class='prog-card' style='background:"+p.bg+";border:1px solid "+p.border+"' data-type='"+esc(p.type)+"' data-key='"+esc(p.key)+"'>" +
      "<div class='prog-card-icon'>"+p.icon+"</div>" +
      (p.tag ? "<div class='prog-card-tag' style='background:"+(p.tag==='Physio'?'#DCF2E2':'#F7EFD8')+";color:"+(p.tag==='Physio'?'#1A7A3A':'#9A7A10')+"'>"+(p.tag==='Physio'?'&#x2713; Physio-approved':'General fitness')+"</div>" : "") +
      "<div class='prog-card-name'>"+p.name+"</div>" +
      "<div class='prog-card-desc' style='color:"+p.descColor+"'>"+p.desc+"</div>" +
    "</button>";
  }
  el.innerHTML = html;
  el.querySelectorAll(".prog-card").forEach(function(card) {
    card.addEventListener("click", function(){
      var type = card.dataset.type, key = card.dataset.key;
      if (type==="yoga")    openYogaSession(+key);
      if (type==="physio")  openPhysioSession(+key);
      if (type==="workout") openWorkoutSession(key);
      if (type==="pullup")  openPullupPlan();
    });
  });
}

// ============================================================
// SESSION OVERLAY
// ============================================================
var ST = null; // session timer
var SS = {};   // session state

function clearST() { if (ST) { clearInterval(ST); ST = null; } }

function openSessionOverlay(title) {
  clearST();
  document.getElementById("sesTitle").textContent = title;
  document.getElementById("sesCount").textContent = "";
  document.getElementById("sesProgFill").style.width = "0%";
  document.getElementById("sesProgFill").style.background = "#3B6FE0";
  document.getElementById("sessionOverlay").style.display = "block";
  document.body.style.overflow = "hidden";
}
function closeSessionOverlay() {
  clearST();
  yogaSpeechStop();
  document.getElementById("sessionOverlay").style.display = "none";
  document.body.style.overflow = "";
  // Refresh home dashboard if visible
  if (currentSection === "home") renderHomeScreen();
}

document.getElementById("sesBackBtn").addEventListener("click", function(){
  // v508: not on the intro screen either — nothing is logged before Start, and
  // the intro's own Cancel already closes without asking. Mid-workout it stays.
  if (SS.type === "workout" && SS.wPhase !== "complete" && SS.wPhase !== "intro") {
    confirmDialog("Exit workout? Progress will be lost.", closeSessionOverlay);
    return;
  }
  if (SS.type === "yoga" && SS.yStarted && SS.yPhase === "running") {
    confirmDialog("Exit yoga session?", closeSessionOverlay);
    return;
  }
  if (SS.type === "physio" && SS.pPhase === "running") {
    confirmDialog("Exit?", closeSessionOverlay);
    return;
  }
  // Every tick is already saved, so no confirm — just repaint the card's count.
  if (SS.type === "pullup") { closeSessionOverlay(); renderTrainView(); return; }
  closeSessionOverlay();
});

// ── Timer circle SVG ──────────────────────────────────────
function timerCircle(time, total, color, paused) {
  var R=58, circ=2*Math.PI*R, pct=total>0?time/total:1;
  var ringColor = paused ? '#333' : (color || '#818cf8');
  return '<svg width="140" height="140" style="display:block;margin:0 auto 8px">' +
    '<circle cx="70" cy="70" r="'+R+'" fill="none" stroke="#1a1a2e" stroke-width="10"/>' +
    '<circle cx="70" cy="70" r="'+R+'" fill="none" stroke="'+ringColor+'" stroke-width="10"' +
    ' stroke-dasharray="'+circ+'" stroke-dashoffset="'+(circ*(1-pct))+'"' +
    ' stroke-linecap="round" transform="rotate(-90 70 70)" style="transition:stroke-dashoffset 0.95s linear"/>' +
    '<text x="70" y="78" text-anchor="middle" fill="'+(paused?'#B8AE9C':'#2A2010')+'" font-size="38" font-weight="800" font-family="inherit">'+time+'</text>' +
    '</svg>';
}

// ── Save session to workout log ───────────────────────────
function saveSession(entry) {
  var data = getWD();
  data.workouts.unshift(entry);
  data.workouts.sort(function(a,b){ return b.date.localeCompare(a.date); });
  saveWD(data);
}

// ============================================================
// YOGA SESSION
// ============================================================
function openYogaSession(flowIdx) {
  SS = { type:"yoga", yFlowIdx:flowIdx, yPoseIdx:0, yTime:0, yStarted:false, yPaused:false, yPhase:"intro" };
  // Built ONCE per session and read from SS from here on. Flow 0's length and
  // duration depend on the slot choices, so nothing downstream may go back to
  // YOGA_FLOWS_TRAIN[0] — it is only the at-load snapshot.
  // v509: the length is read ONCE here too — a session runs at the length it began at.
  SS.yShort = yogaLengthOf(flowIdx) === "short";
  SS.yFlow = yogaFlowFor(flowIdx, SS.yShort);
  openSessionOverlay(YOGA_TRAIN_NAMES[flowIdx]);
  document.getElementById("sesProgFill").style.background = "#8b5cf6";
  renderYogaSession();
}

function renderYogaSession() {
  var flow = SS.yFlow;
  var body = document.getElementById("sesBody");

  // Progress bar
  if (SS.yPhase === "running") {
    var elapsed = flow.slice(0,SS.yPoseIdx).reduce(function(a,p){return a+p.dur;},0) + (flow[SS.yPoseIdx].dur - SS.yTime);
    var total   = yogaFlowTotal(SS.yFlow);
    document.getElementById("sesProgFill").style.width = Math.min(elapsed/total*100,100)+"%";
    document.getElementById("sesCount").textContent = (SS.yPoseIdx+1)+" / "+flow.length;
  }

  if (SS.yPhase === "intro") {
    var exList = flow.slice(0,5).map(function(p){ return "<div style='padding:7px 0;border-bottom:1px solid #E8E2D6;font-size:13px;color:#8A7A5A'>"+p.name+"</div>"; }).join("") +
      (flow.length>5 ? "<div style='padding:7px 0;font-size:12px;color:#B8AE9C'>+ "+(flow.length-5)+" more poses</div>" : "");
    body.innerHTML = "<div class='ses-intro'>" +
      "<div class='ses-intro-ico'>&#x1F9D8;</div>" +
      "<div class='ses-intro-name'>"+esc(YOGA_TRAIN_NAMES[SS.yFlowIdx])+"</div>" +
      "<div class='ses-intro-sub'>"+flow.length+" poses &middot; ~"+Math.round(yogaFlowTotal(SS.yFlow)/60)+" min</div>" +
      (YOGA_TRAIN_NOTES[SS.yFlowIdx] ? "<div style='width:100%;max-width:320px;background:#FCEFD6;border:1px solid #E2B867;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:14px;color:#3E2A06;line-height:1.55;text-align:left'>&#x26A0;&#xFE0F; "+esc(YOGA_TRAIN_NOTES[SS.yFlowIdx])+"</div>" : "") +
      yogaSessionOptsHtml() +
      yogaVariantPickerHtml() +
      "<div style='width:100%;max-width:320px;background:#fff;border:1px solid #E0DCD4;border-radius:12px;padding:12px 14px;margin-bottom:28px;text-align:left'>"+exList+"</div>" +
      "<button class='ses-begin-btn' style='background:#8b5cf6' onclick='beginYoga()'>Begin practice</button>" +
      "<button class='ses-back-link' onclick='closeSessionOverlay()'>Cancel</button>" +
    "</div>";
    return;
  }

  if (SS.yPhase === "done") {
    var dur = yogaFlowTotal(SS.yFlow);
    body.innerHTML = "<div class='ses-done-wrap'>" +
      "<div class='ses-done-ico'>&#x1F64F;</div>" +
      "<div class='ses-done-title'>Practice complete</div>" +
      "<div class='ses-done-sub'>Well done. Namaste.<br><small style='color:#C8BEA8'>Before rising, roll to your right side first.</small></div>" +
      "<button class='ses-done-btn' onclick='finishYoga()'>Save &amp; finish</button>" +
      "<button class='ses-done-link' onclick='openYogaSession(SS.yFlowIdx)'>Do it again</button>" +
    "</div>";
    yogaSpeakIfDue();
    return;
  }

  // Running
  var pose = flow[SS.yPoseIdx];
  // Reviewed poses have no photo of their own — never show the original's.
  var photo = pose.noPhoto ? null : getPosePhoto(pose.name);
  var photoHtml = photo ? "<img src='"+photo+"' class='ses-pose-photo' alt='"+esc(pose.name)+"'>" : "";
  var nextPose  = SS.yPoseIdx < flow.length-1 ? "<div class='ses-pose-next'>Next: "+flow[SS.yPoseIdx+1].name+"</div>" : "";
  body.innerHTML =
    "<div class='ses-timer-wrap'>" + timerCircle(SS.yTime, pose.dur, "#8b5cf6", SS.yPaused) + "</div>" +
    "<div class='ses-pose-name'>"+esc(pose.name)+"</div>" +
    "<div class='ses-pose-sanskrit'>"+pose.sanskrit+"</div>" +
    photoHtml +
    yogaPoseBodyHtml(pose) +
    nextPose +
    "<div class='ses-ctrl-row'>" +
      "<button class='ses-ctrl-btn ses-ctrl-back' data-action='prevYogaPose'>&#x276E;</button>" +
      "<button class='ses-ctrl-btn' data-action='toggleYogaPause'>"+(SS.yPaused?"Resume":"Pause")+"</button>" +
      "<button class='ses-ctrl-btn' data-action='skipYogaPose'>Skip &#x276F;</button>" +
    "</div>" +
    (yogaHasVoice(SS.yFlowIdx)
      ? "<button class='ses-voice-btn' aria-pressed='"+(yogaVoiceOn()?"true":"false")+"' onclick=\"setYogaVoice('"+(yogaVoiceOn()?"off":"on")+"')\">"+(yogaVoiceOn()?"&#x1F50A; Voice on":"&#x1F507; Voice off")+"</button>"
      : "") +
    "<button class='ses-exit-link' onclick=\"confirmDialog('Exit practice?',function(){closeSessionOverlay()})\">Exit practice</button>";
  yogaSpeakIfDue();
}

// v509: Length and Voice rows on the intro, in the same switch style as the
// pose picker. Each row appears only where the flow offers it (Full Body).
function yogaSessionOptsHtml() {
  var idx = SS.yFlowIdx, rows = "";
  function btn(on, label, aria, click) {
    return "<button class='yv-btn" + (on ? " on" : "") + "' aria-pressed='" + (on ? "true" : "false") + "'" +
      " aria-label='" + aria + "' onclick=\"" + click + "\">" + label + "</button>";
  }
  if (yogaHasShort(idx)) {
    var full = buildSlottedFlow(idx, false), sh = buildSlottedFlow(idx, true);
    rows += "<div class='yv-row'><div class='yv-lab'>Length</div><div class='yv-btns'>" +
      btn(!SS.yShort, "Full &middot; "+Math.round(yogaFlowTotal(full)/60)+" min", "Length: full", "setYogaLength("+idx+",'full')") +
      btn(SS.yShort,  "Short &middot; "+Math.round(yogaFlowTotal(sh)/60)+" min", "Length: short", "setYogaLength("+idx+",'short')") +
    "</div></div>";
  }
  if (yogaHasVoice(idx)) {
    var on = yogaVoiceOn();
    rows += "<div class='yv-row'><div class='yv-lab'>Spoken cues</div><div class='yv-btns'>" +
      btn(on,  "On",  "Spoken cues: on",  "setYogaVoice('on')") +
      btn(!on, "Off", "Spoken cues: off", "setYogaVoice('off')") +
    "</div></div>";
    // v510: voice and speed, shown only while spoken cues are on.
    if (on) {
      var cur = storeGet("fl4_yoga_voice_name") || "", picked = yogaVoicePicked(), rk = yogaVoiceRateKey();
      var opts = "<option value=''" + (picked ? "" : " selected") + ">Phone default</option>" +
        yogaVoiceList().map(function(v){
          return "<option value='" + esc(v.voiceURI) + "'" + (picked && v.voiceURI === cur ? " selected" : "") + ">" +
            esc(v.name) + " (" + esc(v.lang) + ")</option>";
        }).join("");
      rows += "<div class='yv-row'><div class='yv-lab'>Voice</div>" +
        "<select class='yv-sel' aria-label='Voice' onchange='setYogaVoiceName(this.value)'>" + opts + "</select>" +
        btn(false, "&#x1F50A; Test", "Test the voice", "yogaVoiceTest()") + "</div>" +
        "<div class='yv-row'><div class='yv-lab'>Speed</div><div class='yv-btns'>" +
          btn(rk === "slow",   "Slow",   "Speed: slow",   "setYogaVoiceRate('slow')") +
          btn(rk === "normal", "Normal", "Speed: normal", "setYogaVoiceRate('normal')") +
          btn(rk === "fast",   "Fast",   "Speed: fast",   "setYogaVoiceRate('fast')") +
        "</div></div>";
    }
  }
  if (!rows) return "";
  return "<div class='yv-wrap'><div class='yv-hdr'>Session &middot; remembered</div>" + rows + "</div>";
}

// The per-pose switches, shown on the intro of each slotted flow (Full Body,
// and Hips & Lower Back since v481). Real <button>s, so no role/tabindex is
// needed; aria-pressed carries the state the colour shows.
function yogaVariantPickerHtml() {
  var def = YOGA_SLOTTED[SS.yFlowIdx];
  if (!def) return "";
  // The "All" row is lit only when every slot agrees; a mixed flow lights neither.
  var allHtml = "";
  if (def.allSwitch) {
    var curs = def.order.map(yogaVariantOf);
    var allBtn = function(which, label) {
      var on = curs.every(function(c){ return c === which; });
      return "<button class='yv-btn" + (on ? " on" : "") + "'" +
        " aria-pressed='" + (on ? "true" : "false") + "'" +
        " onclick=\"setYogaVariantAll(" + SS.yFlowIdx + ",'" + which + "')\">" + label + "</button>";
    };
    allHtml = "<div class='yv-row yv-all'>" +
      "<div class='yv-lab'><b>Every pose</b></div>" +
      "<div class='yv-btns'>" + allBtn("rev", "All reviewed") + allBtn("orig", "All original") + "</div>" +
    "</div>";
  }
  var rows = allHtml + def.order.map(function(id) {
    var sl = def.slots[id], cur = yogaVariantOf(id);
    function btn(which, label) {
      var on = cur === which;
      return "<button class='yv-btn" + (on ? " on" : "") + "'" +
        " aria-pressed='" + (on ? "true" : "false") + "'" +
        " aria-label='" + esc(sl.label) + ": " + esc(label) + "'" +
        " onclick=\"setYogaVariant('" + id + "','" + which + "')\">" + label + "</button>";
    }
    return "<div class='yv-row'>" +
      "<div class='yv-lab'>" + esc(sl.label) + "</div>" +
      "<div class='yv-btns'>" + btn("rev", sl.revLabel) + btn("orig", sl.origLabel) + "</div>" +
    "</div>";
  }).join("");
  return "<div class='yv-wrap'>" +
    "<div class='yv-hdr'>Your version &middot; remembered</div>" + rows +
  "</div>";
}

// v448: each pose reads as short CUES by default, with the full paragraph one
// tap away under DETAILS.
//
// The reset is derived, not assigned: the choice belongs to the pose index it
// was made on (`SS.yViewFor`), so ANY move to another pose falls back to cues on
// its own. **Do NOT "simplify" this into setting SS.yView = "cues" at each
// advance** — there are four of them (beginYoga, the timer's auto-advance,
// skipYogaPose, prevYogaPose) and a fifth added later would silently inherit
// the previous pose's Details view.
function yogaPoseView() {
  return (SS.yView === "details" && SS.yViewFor === SS.yPoseIdx) ? "details" : "cues";
}
function setYogaPoseView(v) {
  SS.yView    = (v === "details") ? "details" : "cues";
  SS.yViewFor = SS.yPoseIdx;
  renderYogaSession();
}

// A pose with no `cues` array (the Hips & Lower Back flow) shows the paragraph
// exactly as it always has, with no tabs — the tabs appear only where there is
// genuinely a second view to offer.
function yogaPoseBodyHtml(pose) {
  if (!pose.cues || !pose.cues.length) return "<p class='ses-pose-cue'>"+esc(pose.cue)+"</p>";
  var view = yogaPoseView();
  function tab(v, label) {
    var on = view === v;
    return "<button class='ycue-tab"+(on?" on":"")+"' aria-pressed='"+(on?"true":"false")+"'" +
      " onclick=\"setYogaPoseView('"+v+"')\">"+label+"</button>";
  }
  var panel = view === "details"
    ? "<div class='ycue-meta'>Hold for "+pose.dur+" seconds</div>" +
      "<p class='ses-pose-cue'>"+esc(pose.cue)+"</p>"
    : "<ul class='ycue-list'>" + pose.cues.map(function(c){
        return "<li>"+esc(c)+"</li>";
      }).join("") + "</ul>";
  return "<div class='ycue-tabs'>"+tab("cues","Cues")+tab("details","Details")+"</div>" + panel;
}

function beginYoga() {
  SS.yStarted = true;
  SS.yPhase   = "running";
  SS.yTime    = SS.yFlow[0].dur;
  renderYogaSession();
  startYogaTimer();
}
function startYogaTimer() {
  clearST();
  if (SS.yPaused) return;
  ST = setInterval(function(){
    SS.yTime--;
    var flow = SS.yFlow;
    var pose = flow[SS.yPoseIdx];
    // Update timer in place without full re-render
    var svg = document.querySelector("#sesBody svg");
    if (svg) {
      var txt = svg.querySelector("text"); if (txt) txt.textContent = SS.yTime;
      var R=54, circ=2*Math.PI*R, pct=SS.yTime/pose.dur;
      var circle = svg.querySelectorAll("circle")[1]; if (circle) circle.setAttribute("stroke-dashoffset", circ*(1-pct));
    }
    // Update progress bar
    var elapsed = flow.slice(0,SS.yPoseIdx).reduce(function(a,p){return a+p.dur;},0)+(pose.dur-SS.yTime);
    document.getElementById("sesProgFill").style.width = Math.min(elapsed/yogaFlowTotal(SS.yFlow)*100,100)+"%";
    if (isHalfwayTick(pose.dur, SS.yTime)) playHalfwayTone();

    if (SS.yTime <= 0) {
      clearST();
      playChime();
      var flow2 = SS.yFlow;
      var next  = SS.yPoseIdx + 1;
      if (next >= flow2.length) {
        SS.yPhase = "done";
        renderYogaSession();
      } else {
        SS.yPoseIdx = next;
        SS.yTime    = flow2[next].dur;
        renderYogaSession();
        startYogaTimer();
      }
    }
  }, 1000);
}
function toggleYogaPause() {
  SS.yPaused = !SS.yPaused;
  // v509: pausing silences the voice; resuming reads the current pose again.
  if (SS.yPaused) { clearST(); yogaSpeechStop(); SS.ySpokenFor = null; }
  else { startYogaTimer(); }
  renderYogaSession();
}
function skipYogaPose() {
  clearST(); playChime();
  var flow = SS.yFlow, next = SS.yPoseIdx+1;
  if (next >= flow.length) { SS.yPhase="done"; renderYogaSession(); }
  else { SS.yPoseIdx=next; SS.yTime=flow[next].dur; renderYogaSession(); startYogaTimer(); }
}

// v476: a physio exercise with a `cues` array reads as short CUES by default,
// with the full paragraph one tap away under DETAILS — the same two views yoga
// poses have had since v448, and deliberately the same CSS classes, so the two
// session screens stay one design rather than two that drift.
//
// The reset is DERIVED, not assigned: the choice belongs to the exercise index
// it was made on (`SS.pViewFor`), so ANY move to another exercise falls back to
// cues on its own. **Do NOT "simplify" this into setting SS.pView = "cues" at
// each advance** — beginPhysio, physioNext, physioPrev and the timer's
// auto-advance all move the index, and a fifth path added later would silently
// inherit the previous exercise's Details view. Same rule, same reason, as
// yogaPoseView(). Moving between SETS of one exercise deliberately keeps the
// choice — it is still the same movement.
function physioExerciseView() {
  return (SS.pView === "details" && SS.pViewFor === SS.pExIdx) ? "details" : "cues";
}
function setPhysioExerciseView(v) {
  SS.pView    = (v === "details") ? "details" : "cues";
  SS.pViewFor = SS.pExIdx;
  renderPhysioSession();
}
// An exercise with no `cues` array — every programme except the Knee Programme
// — shows the paragraph exactly as it always has, with no tabs. The tabs appear
// only where there is genuinely a second view to offer.
function physioExerciseBodyHtml(ex, col) {
  if (!ex.cues || !ex.cues.length) return ex.cue ? "<p class='ses-pose-cue'>"+esc(ex.cue)+"</p>" : "";
  var view = physioExerciseView();
  function tab(v, label) {
    var on = view === v;
    return "<button class='ycue-tab"+(on?" on":"")+"' aria-pressed='"+(on?"true":"false")+"'" +
      " onclick=\"setPhysioExerciseView('"+v+"')\">"+label+"</button>";
  }
  // Yoga's meta line is always a hold; here it depends on how the set is counted.
  var meta = ex.type === "timed"
    ? "Hold for "+ex.dur+" seconds"
    : ex.reps+" reps"+(physioSetsOf(ex) > 1 ? " \u00b7 "+physioSetsOf(ex)+" sets" : "");
  var panel = view === "details"
    ? "<div class='ycue-meta'>"+esc(meta)+"</div>" +
      "<p class='ses-pose-cue'>"+esc(ex.cue)+"</p>"
    : "<ul class='ycue-list'>" + ex.cues.map(function(c){
        return "<li>"+esc(c)+"</li>";
      }).join("") + "</ul>";
  // The accent follows the programme colour; yoga sets no variable and stays purple.
  return "<div style='--ycue-accent:"+col+"'>" +
    "<div class='ycue-tabs'>"+tab("cues","Cues")+tab("details","Details")+"</div>" + panel +
  "</div>";
}

// v477: the Knee Programme offers two LEVELS. Basic is one set of everything
// and one round of each per-leg stretch; Full is the programme as written.
//
// BASIC IS THE DEFAULT, and anything that is not the exact string "full" reads
// as basic — a corrupt or half-written value fails safe to the shorter, gentler
// session, exactly as an unset yoga slot falls back to the reviewed pose.
//
// Basic changes ONLY `sets` and `perLeg`; it never drops an exercise, so the
// card's "12 exercises" stays true at either level. **Do NOT implement it by
// building a second exercise array** — two lists of the same programme is how
// a cue gets fixed in one of them and not the other.
function physioLevelPref() {
  return storeGet("fl4_physio_level") === "full" ? "full" : "basic";
}
// Device-local on purpose, like `fl4_yoga_variants`: not synced, not in
// buildExportPayload, so not in the backup file or the test seed either.
function setPhysioLevel(which) {
  storeSet("fl4_physio_level", which === "full" ? "full" : "basic");
  if (SS && SS.type === "physio") SS.pLevel = physioLevelPref();
  renderPhysioSession();
}
// A programme with no `levels` flag is always full, so the other five are
// untouched by every one of these.
function physioIsBasic()      { return SS.pLevel === "basic"; }
function physioSetsOf(ex)     { return physioIsBasic() ? 1 : (ex.sets || 1); }
function physioPerLegOf(ex)   { return physioIsBasic() ? false : !!ex.perLeg; }
// Basic runs a per-leg stretch ONCE, so the screen has to say what the four
// side-labelled rounds used to say by themselves.
function physioBothSides(ex)  { return physioIsBasic() && !!ex.perLeg; }
// v479: the same gap for the strength moves done "10 each leg". They are NOT
// perLeg (the set counter never alternated sides for them), so in Basic, where
// they show as one plain "10 reps", only the cue text said to swap legs. The
// `eachLeg` flag is data on the exercise, read only here -- Basic only, as
// confirmed; Full keeps its "Set N of M" line unchanged.
function physioEachLeg(ex)    { return physioIsBasic() && !!ex.eachLeg; }

function physioLevelPickerHtml(prog, col) {
  if (!prog.levels) return "";
  function btn(which, label, sub) {
    var on = SS.pLevel === which;
    return "<button class='plv-btn' aria-pressed='" + (on ? "true" : "false") + "'" +
      (on ? " style='background:" + col + ";border-color:" + col + ";color:#fff'" : "") +
      " onclick=\"setPhysioLevel('" + which + "')\">" +
      "<span class='plv-name'>" + label + "</span>" +
      "<span class='plv-sub'>" + sub + "</span></button>";
  }
  return "<div class='plv-wrap'>" +
    "<div class='plv-hdr'>Level &middot; remembered</div>" +
    "<div class='plv-btns'>" +
      btn("basic", "Basic", "One set each &middot; one round per stretch") +
      btn("full",  "Full",  "Every set and both sides") +
    "</div>" +
  "</div>";
}

function renderPhysioSession() {
  var prog = PROGRAMMES_TRAIN[SS.pProgIdx];
  var body = document.getElementById("sesBody");
  var col  = prog.color || "#14b8a6";
  document.getElementById("sesCount").textContent = (SS.pExIdx+1)+" / "+prog.exercises.length;
  document.getElementById("sesProgFill").style.width = ((SS.pExIdx/prog.exercises.length)*100)+"%";
  document.getElementById("sesProgFill").style.background = col;

  if (SS.pPhase === "intro") {
    var exList = prog.exercises.map(function(ex,i){
      return "<div style='padding:7px 0;border-bottom:1px solid #E8E2D6;font-size:13px;color:#8A7A5A'>"+esc(ex.name)+"</div>";
    }).join("");
    body.innerHTML = "<div class='ses-intro'>" +
      "<div class='ses-intro-ico'>"+prog.icon+"</div>" +
      "<div class='ses-intro-name'>"+prog.name.replace(/&amp;/g,"&")+"</div>" +
      "<div class='ses-intro-sub'>"+prog.exercises.length+" exercises &middot; "+prog.note+"</div>" +
      (prog.warning ? "<div style='width:100%;max-width:320px;background:#FCEFD6;border:1px solid #E2B867;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:14px;color:#3E2A06;line-height:1.55;text-align:left'>&#x26A0;&#xFE0F; "+prog.warning+"</div>" : "") +
      physioLevelPickerHtml(prog, col) +
      "<div style='width:100%;max-width:320px;background:#fff;border:1px solid #E0DCD4;border-radius:12px;padding:12px 14px;margin-bottom:"+(prog.info?"14px":"28px")+";text-align:left'>"+exList+"</div>" +
      (prog.info ? "<div style='width:100%;max-width:320px;background:#F4F1E8;border:1px solid #E0DCD4;border-radius:10px;padding:10px 13px;margin-bottom:28px;font-size:12px;color:#8A7A5A;line-height:1.5;text-align:left'>"+esc(prog.info)+"</div>" : "") +
      "<button class='ses-begin-btn' style='background:"+col+"' onclick='beginPhysio()'>Begin</button>" +
      "<button class='ses-back-link' onclick='closeSessionOverlay()'>Cancel</button>" +
    "</div>";
    return;
  }

  if (SS.pPhase === "done") {
    body.innerHTML = "<div class='ses-done-wrap'>" +
      "<div class='ses-done-ico'>&#x2705;</div>" +
      "<div class='ses-done-title'>Complete!</div>" +
      "<div class='ses-done-sub'>"+prog.name.replace(/&amp;/g,"&")+" done. Great work.</div>" +
      "<button class='ses-done-btn' onclick='finishPhysio()'>Save &amp; finish</button>" +
      "<button class='ses-done-link' onclick='openPhysioSession(SS.pProgIdx)'>Do it again</button>" +
    "</div>";
    return;
  }

  var ex = prog.exercises[SS.pExIdx];
  var totalSets = physioSetsOf(ex);
  // In Basic a per-leg stretch runs once, so this line carries the instruction
  // the four side-labelled rounds used to carry on their own.
  var setLabel = physioBothSides(ex)
    ? "Do both sides"
    : physioEachLeg(ex)
    ? "Each leg"
    : physioPerLegOf(ex)
      ? (SS.pSetNum <= Math.ceil(totalSets/2) ? "Right side" : "Left side") + (totalSets > 2 ? " \u00b7 set "+SS.pSetNum+" of "+totalSets : "")
      : (totalSets > 1 ? "Set "+SS.pSetNum+" of "+totalSets : "");

  // Set dots
  var dots = "";
  for (var s=1; s<=totalSets; s++) {
    var done=s<SS.pSetNum, active=s===SS.pSetNum;
    dots += "<span style='display:inline-block;width:"+(active?"12px":"8px")+";height:"+(active?"12px":"8px")+";border-radius:50%;background:"+(done?col:active?"#fff":"rgba(255,255,255,.2)")+";margin:0 3px;transition:all .2s;vertical-align:middle'></span>";
  }

  var isTimedRunning = ex.type === "timed";
  var nextEx = SS.pExIdx < prog.exercises.length-1 ? prog.exercises[SS.pExIdx+1].name : null;
  var nextLabel = SS.pSetNum < totalSets ? "Next set &#x276F;" : (nextEx ? "Next &#x276F;" : "Finish");

  body.innerHTML =
    (isTimedRunning
      ? "<div class='ses-timer-wrap'>" + timerCircle(SS.pTime, ex.dur, col, !SS.pRunning) + "</div>"
      : "<div class='ses-reps-display'><div style='font-size:64px;font-weight:800;line-height:1;color:"+col+"'>"+ex.reps+"</div><div style='font-size:15px;color:#5A8A80;margin-top:6px'>reps</div></div>"
    ) +
    "<div class='ses-pose-name' style='color:#2A2010'>"+esc(ex.name)+"</div>" +
    (setLabel ? "<div class='ses-pose-sanskrit' style='color:"+col+"'>"+setLabel+"</div>" : "") +
    (totalSets > 1 ? "<div style='text-align:center;margin:6px 0 2px'>"+dots+"</div>" : "") +
    physioExerciseBodyHtml(ex, col) +
    (nextEx && SS.pSetNum >= totalSets ? "<div class='ses-pose-next'>Next: "+esc(nextEx)+"</div>" : "") +
    (ex.url ? "<a class='ses-video-btn' href='"+ex.url+"' target='_blank' rel='noopener'>&#x25B6; Watch video</a>" : "") +
    "<div class='ses-ctrl-row'>" +
      "<button class='ses-ctrl-btn ses-ctrl-back' data-action='physioPrev'>&#x276E;</button>" +
      "<button class='ses-ctrl-btn' data-action='"+esc((isTimedRunning?"togglePhysioTimer":"physioNext"))+"'>" +
        (isTimedRunning ? (SS.pRunning ? "Pause" : "Resume") : nextLabel) +
      "</button>" +
      (isTimedRunning ? "<button class='ses-ctrl-btn' data-action='physioNext'>Skip &#x276F;</button>" : "") +
    "</div>" +
    "<button class='ses-exit-link' onclick=\"confirmDialog('Exit?',function(){closeSessionOverlay()})\">Exit</button>";
}

function beginPhysio() {
  SS.pPhase   = "running";
  SS.pExIdx   = 0;
  SS.pSetNum  = 1;
  var ex = PROGRAMMES_TRAIN[SS.pProgIdx].exercises[0];
  SS.pTime    = ex.type === "timed" ? ex.dur : 0;
  SS.pRunning = false;
  if (ex.type === "timed") togglePhysioTimer(); // flips pRunning→true, starts interval
  renderPhysioSession(); // now renders with pRunning=true → coloured ring
}
function togglePhysioTimer() {
  SS.pRunning = !SS.pRunning;
  if (SS.pRunning) {
    clearST();
    ST = setInterval(function(){
      SS.pTime--;
      var svg = document.querySelector("#sesBody svg");
      if (svg) {
        var txt = svg.querySelector("text"); if (txt) { txt.textContent = SS.pTime; txt.setAttribute("fill", "#2A2010"); }
        var ex=PROGRAMMES_TRAIN[SS.pProgIdx].exercises[SS.pExIdx];
        var R=54,circ=2*Math.PI*R,pct=SS.pTime/ex.dur;
        var circle=svg.querySelectorAll("circle")[1]; if(circle) circle.setAttribute("stroke-dashoffset",circ*(1-pct));
      }
      var exH=PROGRAMMES_TRAIN[SS.pProgIdx].exercises[SS.pExIdx];
      if (exH && isHalfwayTick(exH.dur, SS.pTime)) playHalfwayTone();
      if (SS.pTime<=0) {
        clearST(); SS.pRunning=false; playChime();
        // Auto-advance to next exercise/set like the yoga flow
        physioNext();
      }
    },1000);
  } else {
    clearST();
  }
  var btn = document.querySelector("[data-action='togglePhysioTimer']");
  if (btn) btn.textContent = SS.pRunning ? "Pause" : "Resume";
  var svg = document.querySelector("#sesBody svg");
  if (svg) {
    var prog = PROGRAMMES_TRAIN[SS.pProgIdx];
    var ring = svg.querySelectorAll("circle")[1];
    var txt  = svg.querySelector("text");
    if (ring) ring.setAttribute("stroke", SS.pRunning ? (prog.color || "#818cf8") : "#C8BEA8");
    if (txt)  txt.setAttribute("fill", SS.pRunning ? "#2A2010" : "#B8AE9C");
  }
}
function physioNext() {
  clearST(); SS.pRunning = false;
  var prog = PROGRAMMES_TRAIN[SS.pProgIdx], ex = prog.exercises[SS.pExIdx];
  if (SS.pSetNum < physioSetsOf(ex)) {
    SS.pSetNum++;
    SS.pTime = ex.type==="timed" ? ex.dur : 0;
  } else {
    var nextEx = SS.pExIdx+1;
    if (nextEx >= prog.exercises.length) { SS.pPhase="done"; }
    else {
      SS.pExIdx  = nextEx;
      SS.pSetNum = 1;
      var nex    = prog.exercises[nextEx];
      SS.pTime   = nex.type==="timed" ? nex.dur : 0;
    }
  }
  // Auto-start the timer if the new exercise/set is timed (and we're still running)
  if (SS.pPhase !== "done") {
    var cur = prog.exercises[SS.pExIdx];
    if (cur.type === "timed") {
      togglePhysioTimer(); // flips pRunning→true and starts interval
      renderPhysioSession();
      return;
    }
  }
  renderPhysioSession();
}
function finishYoga() {
  var flow = SS.yFlow;
  var _yMins = flow.reduce(function(s,p){ return s + (p.dur||0); }, 0) / 60;
  var entry = { id:Date.now(), ts:Date.now(), date:trainTodayStr(), type:'yoga',
    sessionName:YOGA_TRAIN_NAMES[SS.yFlowIdx].replace(/&amp;/g,"&") + (SS.yShort ? " (short)" : ""), poses:flow.length,
    kcal:estimateSessionKcal(2.8, _yMins), exercises:[] };
  saveSession(entry);
  var al = getActionLog(); al.unshift(Object.assign({},entry)); storeSet("fl4_action_log", al);
  pushPersonal();
  closeSessionOverlay();
  renderTrainView();
  toast("&#x1F64F; Yoga saved!");
}

function finishPhysio() {
  var prog = PROGRAMMES_TRAIN[SS.pProgIdx];
  var _pMins = prog.exercises.reduce(function(s,ex){ return s + ((ex.dur||40) * physioSetsOf(ex)); }, 0) / 60;
  var entry = { id:Date.now(), ts:Date.now(), date:trainTodayStr(), type:'physio', sessionName:prog.name.replace(/&amp;/g,"&"),
    kcal:estimateSessionKcal(3.0, _pMins), exercises:[] };
  saveSession(entry);
  var al = getActionLog(); al.unshift(Object.assign({},entry)); storeSet("fl4_action_log", al);
  pushPersonal();
  closeSessionOverlay();
  toast("&#x1FAB4; Physio saved!");
}

// ============================================================
// BODYWEIGHT WORKOUT SESSION
// ============================================================
function openWorkoutSession(wType) {
  SS = { type:"workout", wType:wType, wSsIdx:0, wRound:1, wPhase:"intro", wRestTime:0, wRestDur:0, wCondRound:1, wEntries:{}, wTyped:{}, wNotes:{}, wLast:wktLastEntries(wType) };
  var wk = WK_TRAIN[wType];
  openSessionOverlay(wk.name);
  document.getElementById("sesProgFill").style.background = wk.color;
  renderWorkoutSession();
}

function renderWorkoutSession() {
  var wk   = WK_TRAIN[SS.wType];
  var body = document.getElementById("sesBody");

  if (SS.wPhase === "intro") {
    var allExs = [];
    wk.supersets.forEach(function(ss2){ ss2.exercises.forEach(function(ex){ allExs.push(ex); }); });
    allExs = allExs.concat(wktCond().exercises);
    var exList = allExs.map(function(ex,i){
      return "<div class='ses-intro-ex'>" +
        "<div class='ses-intro-ex-num' style='background:"+wk.color+"30;color:"+wk.color+"'>"+(i+1)+"</div>" +
        "<span class='ses-intro-ex-name'>"+esc(ex.name)+"</span>" +
        "<span class='ses-intro-ex-note'>"+esc(ex.type==="weighted"?"weighted":ex.type==="duration"?"hold":"reps")+"</span>" +
      "</div>";
    }).join("");
    body.innerHTML = "<div class='ses-intro'>" +
      "<div class='ses-intro-ico'>"+(/^pull/.test(SS.wType)?"&#x1F4AA;":"&#x1F525;")+"</div>" +
      "<div class='ses-intro-name'>"+wk.name+"</div>" +
      "<div class='ses-intro-sub'>"+wk.supersets.length+" supersets &middot; "+wk.supersets[0].rounds+" rounds each &middot; "+wk.supersets[0].restSec+"s rest</div>" +
      // v507: both boxes are light with larger dark text, for readability.
      // Beginner days (noteLight) are guidance: cream + 💡. Pull/Push Day carry
      // Cathal's clinical caution, so they keep the ⚠️ on a warmer amber.
      (wk.note ? (wk.noteLight
        ? "<div style='width:100%;max-width:320px;background:#FBF4E2;border:1px solid #E6D3A0;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:14px;color:#3A2E12;line-height:1.55;text-align:left'>&#x1F4A1; "+esc(wk.note)+"</div>"
        : "<div style='width:100%;max-width:320px;background:#FCEFD6;border:1px solid #E2B867;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:14px;color:#3E2A06;line-height:1.55;text-align:left'>&#x26A0;&#xFE0F; "+esc(wk.note)+"</div>") : "") +
      "<div class='ses-intro-list'>"+exList+"</div>" +
      "<button class='ses-begin-btn' style='background:"+wk.color+"' onclick='beginWorkout()'>Start workout</button>" +
      "<button class='ses-back-link' onclick='closeSessionOverlay()'>Cancel</button>" +
    "</div>";
    return;
  }

  if (SS.wPhase === "rest") {
    var R=54,circ=2*Math.PI*R,pct=SS.wRestTime/SS.wRestDur;
    var so=circ*(1-pct);
    body.innerHTML = "<div style='text-align:center;padding-top:30px'>" +
      "<div class='ses-rest-label'>Rest</div>" +
      "<div class='ses-rest-next' id='restNextLbl'></div>" +
      "<div class='ses-timer-wrap'>" +
      "<svg width='130' height='130' style='display:block;margin:0 auto' id='restSvg'>" +
        "<circle cx='65' cy='65' r='"+R+"' fill='none' stroke='#E5DFD3' stroke-width='8'/>" +
        "<circle cx='65' cy='65' r='"+R+"' fill='none' stroke='"+WK_TRAIN[SS.wType].color+"' stroke-width='8'" +
        " stroke-dasharray='"+circ+"' stroke-dashoffset='"+so+"'" +
        " stroke-linecap='round' transform='rotate(-90 65 65)' id='restArc'/>" +
        "<text x='65' y='72' text-anchor='middle' fill='#2A2010' font-size='34' font-weight='bold' id='restNum'>"+SS.wRestTime+"</text>" +
      "</svg></div>" +
      "<button class='ses-skip-btn' onclick='skipWorkoutRest()'>Skip rest</button>" +
    "</div>";
    return;
  }

  if (SS.wPhase === "condOption") {
    body.innerHTML = "<div style='padding:28px 0 16px;text-align:center'>" +
      "<div style='font-size:36px;margin-bottom:10px'>&#x1F3C3;</div>" +
      "<div style='font-family:Georgia,serif;font-size:20px;font-weight:600;color:#2A2010;margin-bottom:6px'>Main work done!</div>" +
      "<div style='font-size:14px;color:#8A7A5A;margin-bottom:22px'>Add conditioning?</div>" +
      "<div class='cond-opt' onclick='startConditioning()'>" +
        "<div class='cond-opt-title'>Yes, add conditioning</div>" +
        "<div class='cond-opt-sub'>"+wktCond().exercises[0].name+" + "+wktCond().exercises[1].name+" &middot; "+wktCond().rounds+" rounds</div>" +
      "</div>" +
      "<div class='cond-opt' onclick='finishWorkoutSession(false)'>" +
        "<div class='cond-opt-title'>No thanks, I\'m done</div>" +
        "<div class='cond-opt-sub'>Save and finish</div>" +
      "</div>" +
    "</div>";
    return;
  }

  if (SS.wPhase === "cond") {
    var exHtml = wktCond().exercises.map(function(ex,i){
      var key = "cond_"+SS.wCondRound+"_"+ex.id;
      var val = wktFillEntry("cond", SS.wCondRound, ex);
      return "<div class='ss-ex'>" +
        "<div class='ss-ex-name'>"+esc(ex.name)+"</div>" + (ex.cue ? "<div class='ss-ex-cue'>"+esc(ex.cue)+"</div>" : "") +
        "<div class='ss-inputs'>" + inputsHtml(ex, key, val) + "</div>" +
      "</div>";
    }).join("");
    body.innerHTML = "<div class='ss-card'>" +
      "<div class='ss-card-hdr'><span class='ss-card-label'>Conditioning</span><span class='ss-card-round'>Round "+SS.wCondRound+" of "+wktCond().rounds+"</span></div>" +
      exHtml + "</div>" +
      "<button class='ss-done-btn' onclick='completeCondRound()'>Done</button>";
    wireInputs();
    return;
  }

  if (SS.wPhase === "complete") {
    body.innerHTML = "<div class='ses-done-wrap'>" +
      "<div class='ses-done-ico'>&#x1F4AA;</div>" +
      "<div class='ses-done-title'>"+WK_TRAIN[SS.wType].name+" done!</div>" +
      "<div class='ses-done-sub'>Great work. Saved to your log.</div>" +
      "<button class='ses-done-btn' onclick='closeSessionOverlay()'>Finish</button>" +
    "</div>";
    return;
  }

  // Log phase: show current superset
  if (!SS.wNotes) SS.wNotes = {};   // a session object built elsewhere may predate notes (v456)
  var ss2 = wk.supersets[SS.wSsIdx];
  var total = wk.supersets.reduce(function(t,s){ return t+s.rounds; }, 0);
  var done  = wk.supersets.slice(0,SS.wSsIdx).reduce(function(t,s){ return t+s.rounds; },0) + (SS.wRound-1);
  document.getElementById("sesProgFill").style.width = (done/total*100)+"%";

  var exHtml2 = ss2.exercises.map(function(ex){
    var key = ss2.id+"_"+SS.wRound+"_"+ex.id;
    var val = wktFillEntry(ss2.id, SS.wRound, ex);
    // The note (v456) is per EXERCISE, not per round: its key has no round in it,
    // so the same text shows on all three rounds and saves once with the exercise.
    var nKey = wktNoteKey(ss2.id, ex);
    return "<div class='ss-ex'>" +
      "<div class='ss-ex-name'>"+esc(ex.name)+"</div>" + (ex.cue ? "<div class='ss-ex-cue'>"+esc(ex.cue)+"</div>" : "") +
      "<div class='ss-inputs'>" + inputsHtml(ex, key, val) + "</div>" +
      "<textarea class='ss-note' rows='2' placeholder='Notes (optional)' data-nkey='"+esc(nKey)+"'>"+esc(SS.wNotes[nKey]||"")+"</textarea>" +
    "</div>";
  }).join("");

  body.innerHTML = "<div class='ss-card'>" +
    "<div class='ss-card-hdr'>" +
      "<span class='ss-card-label'>Superset "+ss2.id+"</span>" +
      "<span class='ss-card-round'>Round "+SS.wRound+" of "+ss2.rounds+"</span>" +
    "</div>" +
    exHtml2 + "</div>" +
    "<button class='ss-done-btn' onclick='completeWktRound()'>Done with round</button>";
  wireInputs();
}

// ── Remember last time's numbers (v437) ───────────────────
// A round opens pre-filled instead of blank, so a set you repeat needs no
// typing at all. wktFillEntry writes what it shows back into SS.wEntries, so
// these are real values and an untouched round still saves what is on screen.
function wktFieldsFor(ex) {
  if (ex.type === "weighted") return ["reps","weight"];
  if (ex.type === "duration") return ["duration"];
  return ["reps"];
}

function wktLastEntries(wType) {
  var wk = WK_TRAIN[wType], out = {}, ws = getWD().workouts || [], prev = null;
  for (var i=0;i<ws.length;i++) {
    if (ws[i].sessionName === wk.name && ws[i].exercises && ws[i].exercises.length) { prev = ws[i]; break; }
  }
  if (!prev) return out;
  wk.supersets.forEach(function(ss2){
    ss2.exercises.forEach(function(ex){
      var rec = null, fields = wktFieldsFor(ex);
      for (var j=0;j<prev.exercises.length;j++) if (prev.exercises[j].name === ex.name) { rec = prev.exercises[j]; break; }
      if (!rec || !rec.sets) return;
      for (var r=1;r<=ss2.rounds;r++) {
        var set = rec.sets[r-1] || {}, v = {}, any = false;
        fields.forEach(function(f){ if (set[f]) { v[f] = String(set[f]); any = true; } });
        if (any) out[ss2.id+"_"+r+"_"+ex.id] = v;
      }
    });
  });
  return out;
}

function wktFillEntry(prefix, round, ex) {
  var key = prefix+"_"+round+"_"+ex.id;
  if (!SS.wEntries[key]) SS.wEntries[key] = {};
  var cur = SS.wEntries[key], last = SS.wLast || {};
  wktFieldsFor(ex).forEach(function(f){
    if (Object.prototype.hasOwnProperty.call(cur, f)) return;  // already filled or typed
    var v = "", r, pk;
    for (r=round-1; r>=1 && !v; r--) {                          // a round you typed today wins
      pk = prefix+"_"+r+"_"+ex.id;
      if (SS.wTyped[pk+"."+f]) v = (SS.wEntries[pk]||{})[f] || "";
    }
    if (!v) v = (last[key]||{})[f] || "";                       // else last time, same round
    for (r=round-1; r>=1 && !v; r--) v = (last[prefix+"_"+r+"_"+ex.id]||{})[f] || "";
    cur[f] = v;
  });
  return cur;
}

function inputsHtml(ex, key, val) {
  if (ex.type === "weighted") return "" +
    "<div class='ss-field'><div class='ss-field-label'>Reps</div><input class='ss-input' type='number' inputmode='numeric' placeholder='--' value='"+(val.reps||"")+"' data-key='"+esc(key)+"' data-field='reps'></div>" +
    "<div class='ss-field'><div class='ss-field-label'>kg</div><input class='ss-input' type='number' inputmode='decimal' placeholder='--' value='"+(val.weight||"")+"' data-key='"+esc(key)+"' data-field='weight'></div>";
  if (ex.type === "duration") return "" +
    "<div class='ss-field'><div class='ss-field-label'>Seconds</div><input class='ss-input' type='number' inputmode='numeric' placeholder='--' value='"+(val.duration||"")+"' data-key='"+esc(key)+"' data-field='duration'></div>";
  return "<div class='ss-field'><div class='ss-field-label'>Reps</div><input class='ss-input' type='number' inputmode='numeric' placeholder='--' value='"+(val.reps||"")+"' data-key='"+esc(key)+"' data-field='reps'></div>";
}

function wireInputs() {
  document.querySelectorAll(".ss-input").forEach(function(inp) {
    inp.addEventListener("change", function() {
      var key=inp.dataset.key, field=inp.dataset.field;
      if (!SS.wEntries[key]) SS.wEntries[key]={};
      SS.wEntries[key][field] = inp.value;
      SS.wTyped[key+"."+field] = true;
    });
  });
  // Notes (v456): "input", not "change" — a round can advance from the Done
  // button while the box still has focus, and change wouldn't have fired yet.
  document.querySelectorAll(".ss-note").forEach(function(ta) {
    ta.addEventListener("input", function() { if (!SS.wNotes) SS.wNotes = {}; SS.wNotes[ta.dataset.nkey] = ta.value; });
  });
}

// One note per exercise per session. Deliberately NOT prefilled from last time
// the way the numbers are (wktLastEntries): last week's "left shoulder twinged"
// is a fact about last week, and a stale note re-saved as today's is worse than
// no note at all.
function wktNoteKey(ssId, ex) { return ssId+"_"+ex.id; }

function beginWorkout() {
  SS.wPhase = "log";
  renderWorkoutSession();
}

function completeWktRound() {
  var wk = WK_TRAIN[SS.wType], ss2 = wk.supersets[SS.wSsIdx];
  if (SS.wRound < ss2.rounds) {
    startWorkoutRest(ss2.restSec, function(){ SS.wRound++; renderWorkoutSession(); });
  } else if (SS.wSsIdx < wk.supersets.length-1) {
    startWorkoutRest(ss2.restSec, function(){ SS.wSsIdx++; SS.wRound=1; renderWorkoutSession(); });
  } else {
    SS.wPhase = "condOption";
    renderWorkoutSession();
  }
}

function startWorkoutRest(dur, onDone) {
  SS.wPhase   = "rest";
  SS.wRestDur = dur;
  SS.wRestTime = dur;
  SS._onRestDone = onDone;
  renderWorkoutSession();
  clearST();
  ST = setInterval(function(){
    SS.wRestTime--;
    var numEl = document.getElementById("restNum");
    var arcEl = document.getElementById("restArc");
    if (numEl) numEl.textContent = SS.wRestTime;
    if (arcEl) {
      var R=54,circ=2*Math.PI*R,pct=SS.wRestTime/SS.wRestDur;
      arcEl.setAttribute("stroke-dashoffset", circ*(1-pct));
    }
    if (SS.wRestTime<=0) {
      clearST(); playChime();
      SS.wPhase="log";
      if (SS._onRestDone) { SS._onRestDone(); SS._onRestDone=null; }
    }
  },1000);
}

function skipWorkoutRest() {
  clearST();
  SS.wPhase = "log";
  if (SS._onRestDone) { SS._onRestDone(); SS._onRestDone=null; }
}

// Each day's conditioning block: the Beginner days carry their own (v507),
// Pull/Push Day fall back to COND_TRAIN.
function wktCond() { var wk = WK_TRAIN[SS.wType]; return (wk && wk.cond) || COND_TRAIN; }

function startConditioning() { SS.wPhase="cond"; SS.wCondRound=1; renderWorkoutSession(); }
function completeCondRound() {
  if (SS.wCondRound < wktCond().rounds) { SS.wCondRound++; renderWorkoutSession(); }
  else { finishWorkoutSession(true); }
}

function finishWorkoutSession(withCond) {
  var wk = WK_TRAIN[SS.wType];
  var exercises = [];
  wk.supersets.forEach(function(ss2){
    ss2.exercises.forEach(function(ex){
      var sets = [];
      for (var r=1;r<=ss2.rounds;r++) {
        var v = SS.wEntries[ss2.id+"_"+r+"_"+ex.id]||{};
        sets.push({ reps:+v.reps||0, weight:+v.weight||0, duration:+v.duration||0 });
      }
      exercises.push({ name:ex.name, sets:sets, notes:((SS.wNotes||{})[wktNoteKey(ss2.id, ex)]||"").trim() });
    });
  });
  var _wSets = exercises.reduce(function(s,ex){ return s + (ex.sets?ex.sets.length:0); }, 0);
  saveSession({ id:Date.now(), date:trainTodayStr(), type:'workout', sessionName:wk.name,
    kcal:estimateSessionKcal(4.0, _wSets * 1.5), exercises:exercises });
  SS.wPhase = "complete";
  renderWorkoutSession();
  toast("&#x1F4AA; "+wk.name+" saved!");
}

