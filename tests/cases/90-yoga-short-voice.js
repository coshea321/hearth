'use strict';

// v509 — Full Body Flow: a SHORT version and SPOKEN cues.
//
// What's worth pinning:
//   1. the short flow is the 15 `inShort` base entries, in order, and a slot in
//      it still follows the reviewed/original choice (no second pose array)
//   2. an unset or corrupt `fl4_yoga_length` reads as FULL; Hips has no short
//      version, so it is always full
//   3. the length is read once in openYogaSession, and a short session saves as
//      "Full Body Flow (short)"
//   4. speech: name + the short cues (never the Details paragraph), once per
//      pose, again on back/skip, silenced on pause and on close, and off when
//      `fl4_yoga_voice` is "off". Hips (no `voice` flag) never speaks.

module.exports = {
  name: '90-yoga-short-voice',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      // Stub the speech engine so the test can hear what would be said.
      var said = [], cancels = 0;
      var realSS = Object.getOwnPropertyDescriptor(window, 'speechSynthesis');
      var realU  = window.SpeechSynthesisUtterance;
      Object.defineProperty(window, 'speechSynthesis', { configurable:true, value:{
        speak: function(u){ said.push(u.text); }, cancel: function(){ cancels++; } } });
      window.SpeechSynthesisUtterance = function(t){ this.text = t; };

      try {
        storeSet('fl4_yoga_variants', {});
        storeSet('fl4_yoga_length', {});
        storeSet('fl4_yoga_voice', 'on');

        // ── 1. The short flow ──────────────────────────────────────────────
        var shortNames = buildSlottedFlow(0, true).map(function(p){ return p.name; });
        ok('short flow has 15 poses', shortNames.length === 15, shortNames.length + ': ' + shortNames.join(', '));
        ok('short flow keeps the warm-up first and savasana last',
          shortNames[0] === 'Seated Centering' && /Savasana/.test(shortNames[shortNames.length-1]), shortNames.join(', '));
        ok('short flow drops the half splits and Warrior I',
          !shortNames.some(function(n){ return /Half Splits|Warrior I /.test(n); }), shortNames.join(', '));
        // Short goes Mountain -> Warrior II with no Warrior I, so each Warrior II
        // must say how to get into the stance itself (Codex review on PR #279).
        var w2 = buildSlottedFlow(0, true).filter(function(p){ return /^Warrior II/.test(p.name); });
        ok('each Warrior II sets up its own stance as its first cue',
          w2.length === 2 && w2.every(function(p){ return /foot back/.test(p.cues[0]); }), JSON.stringify(w2.map(function(p){ return p.cues[0]; })));
        var full = buildSlottedFlow(0, false), sh = buildSlottedFlow(0, true);
        ok('short flow is about 12 minutes, full about 20',
          Math.round(yogaFlowTotal(sh)/60) === 12 && Math.round(yogaFlowTotal(full)/60) === 20,
          yogaFlowTotal(sh) + 's / ' + yogaFlowTotal(full) + 's');
        ok('short flow keeps the full flow order',
          sh.every(function(p, i){ return i === 0 || full.indexOf(p) > full.indexOf(sh[i-1]); }));
        setYogaVariant('bridge', 'orig');
        ok('a slot in the short flow follows the reviewed/original switch',
          buildSlottedFlow(0, true).some(function(p){ return p.name === 'Bridge Pose'; }));
        setYogaVariant('bridge', 'rev');

        // ── 2. Fail-safe default ──────────────────────────────────────────
        ok('unset length reads as full', yogaLengthOf(0) === 'full');
        storeSet('fl4_yoga_length', 'short');
        ok('a corrupt length value reads as full', yogaLengthOf(0) === 'full');
        storeSet('fl4_yoga_length', {1:'short'});
        ok('Hips & Lower Back has no short version', !yogaHasShort(1) && yogaLengthOf(1) === 'full');
        storeSet('fl4_yoga_length', {});

        // ── 3. Session length ─────────────────────────────────────────────
        openYogaSession(0);
        ok('the intro offers Length and Spoken cues', /setYogaLength/.test(sesBody.innerHTML) && /setYogaVoice/.test(sesBody.innerHTML));
        setYogaLength(0, 'short');
        ok('choosing Short on the intro rebuilds SS.yFlow and remembers it',
          SS.yShort === true && SS.yFlow.length === 15 && (storeGet('fl4_yoga_length')||{})[0] === 'short');
        openYogaSession(0);
        ok('the next session opens short', SS.yShort === true && SS.yFlow.length === 15);
        var savedName = null, realSave = window.saveSession;
        window.saveSession = function(e){ savedName = e.sessionName; };
        try { SS.yPhase = 'done'; finishYoga(); } finally { window.saveSession = realSave; }
        ok('a short session saves as "Full Body Flow (short)"', savedName === 'Full Body Flow (short)', String(savedName));
        storeSet('fl4_yoga_length', {});

        // ── 4. Speech ─────────────────────────────────────────────────────
        openYogaSession(0);
        ok('nothing is said on the intro', said.length === 0, JSON.stringify(said));
        beginYoga();
        var p0 = SS.yFlow[0];
        ok('beginning speaks the pose name then its cues',
          said[0] === p0.name && said.length === 1 + p0.cues.length, JSON.stringify(said));
        ok('the Details paragraph is never spoken', said.indexOf(p0.cue) === -1);
        var n = said.length;
        renderYogaSession();
        ok('a re-render of the same pose does not repeat it', said.length === n);
        skipYogaPose();
        ok('skip speaks the next pose', said[n] === SS.yFlow[1].name, JSON.stringify(said.slice(n)));
        n = said.length;
        prevYogaPose();
        ok('back speaks the previous pose again', said[n] === SS.yFlow[0].name);
        var c = cancels;
        toggleYogaPause();
        n = said.length;
        ok('pause silences the voice', cancels > c && SS.ySpokenFor === null);
        toggleYogaPause();
        ok('resume reads the current pose again', said[n] === SS.yFlow[0].name);
        SS.yPoseIdx = 1; SS.ySpokenFor = null;
        var cat = SS.yFlow[1];
        renderYogaSession();
        ok('all-caps emphasis is lowered so it is not spelled out',
          said.slice(-cat.cues.length).join(' ').indexOf('FLAT') === -1, JSON.stringify(said.slice(-3)));
        setYogaVoice('off');
        n = said.length;
        SS.yPoseIdx = 2; renderYogaSession();
        ok('voice off: a new pose is not spoken', said.length === n);
        setYogaVoice('on');
        ok('voice back on reads the current pose', said[n] === SS.yFlow[2].name);
        c = cancels;
        closeSessionOverlay();
        ok('closing the session silences the voice', cancels > c);

        openYogaSession(1);
        n = said.length;
        beginYoga();
        ok('Hips & Lower Back never speaks', said.length === n && !/setYogaVoice/.test(sesBody.innerHTML));
        closeSessionOverlay();
      } finally {
        if (realSS) Object.defineProperty(window, 'speechSynthesis', realSS); else delete window.speechSynthesis;
        window.SpeechSynthesisUtterance = realU;
        storeSet('fl4_yoga_length', {});
        storeSet('fl4_yoga_voice', 'on');
      }
      return {pass:pass, fail:fail};
    })()`);
  },
};
