'use strict';

// v510 — choice of voice and speed for the Full Body Flow's spoken cues.
//
// What's worth pinning:
//   1. the picker lists the phone's ENGLISH voices only, plus "Phone default"
//   2. the chosen voice and speed reach every utterance (one yogaUtterance)
//   3. a saved voice the phone no longer has falls back to the default, and a
//      corrupt speed reads as normal (0.9, the v509 rate)
//   4. Voice/Speed rows only show while spoken cues are on

module.exports = {
  name: '91-yoga-voice-picker',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var said = [];
      var voices = [
        {name:'Serena', lang:'en-GB', voiceURI:'uri-serena'},
        {name:'Amelie', lang:'fr-FR', voiceURI:'uri-amelie'},
        {name:'Alex',   lang:'en_US', voiceURI:'uri-alex'}
      ];
      var realSS = Object.getOwnPropertyDescriptor(window, 'speechSynthesis');
      var realU  = window.SpeechSynthesisUtterance;
      Object.defineProperty(window, 'speechSynthesis', { configurable:true, value:{
        speak: function(u){ said.push(u); }, cancel: function(){}, getVoices: function(){ return voices; } } });
      window.SpeechSynthesisUtterance = function(t){ this.text = t; };

      try {
        storeSet('fl4_yoga_voice', 'on');
        storeSet('fl4_yoga_voice_name', '');
        storeSet('fl4_yoga_voice_rate', null);

        // ── 1. English voices only ────────────────────────────────────────
        var names = yogaVoiceList().map(function(v){ return v.name; });
        ok('only English voices are listed, sorted', names.join(',') === 'Alex,Serena', names.join(','));
        openYogaSession(0);
        var html = sesBody.innerHTML;
        ok('the intro shows a voice dropdown with Phone default', /yv-sel/.test(html) && /Phone default/.test(html));
        ok('the French voice is not offered', html.indexOf('Amelie') === -1);
        ok('the speed row is shown', /setYogaVoiceRate/.test(html));

        // ── 2. Choice reaches the utterance ────────────────────────────────
        setYogaVoiceName('uri-serena');
        ok('picking a voice saves it and plays a test', storeGet('fl4_yoga_voice_name') === 'uri-serena' && said.length > 0);
        ok('the test uses the picked voice', said.length && said[0].voice && said[0].voice.name === 'Serena');
        setYogaVoiceRate('slow');
        said = [];
        beginYoga();
        ok('pose speech uses the picked voice and speed',
          said.length > 0 && said.every(function(u){ return u.voice && u.voice.name === 'Serena' && u.rate === 0.75; }),
          JSON.stringify(said.map(function(u){ return [u.voice && u.voice.name, u.rate]; })));
        closeSessionOverlay();

        // ── 3. Fallbacks ──────────────────────────────────────────────────
        storeSet('fl4_yoga_voice_name', 'uri-gone');
        storeSet('fl4_yoga_voice_rate', 'warp');
        var u = yogaUtterance('x');
        ok('a missing voice falls back to the phone default', !u.voice && u.lang === 'en-GB');
        ok('a corrupt speed reads as normal (0.9)', u.rate === 0.9);

        // ── 4. Hidden while voice is off ──────────────────────────────────
        storeSet('fl4_yoga_voice', 'off');
        openYogaSession(0);
        ok('voice and speed rows are hidden while spoken cues are off',
          !/yv-sel/.test(sesBody.innerHTML) && !/setYogaVoiceRate/.test(sesBody.innerHTML));
        closeSessionOverlay();
      } finally {
        if (realSS) Object.defineProperty(window, 'speechSynthesis', realSS); else delete window.speechSynthesis;
        window.SpeechSynthesisUtterance = realU;
        storeSet('fl4_yoga_voice', 'on');
        storeSet('fl4_yoga_voice_name', '');
        storeSet('fl4_yoga_voice_rate', null);
      }
      return {pass:pass, fail:fail};
    })()`);
  },
};
