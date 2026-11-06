'use strict';

// v514 — a soft single tone at the halfway point of long timed holds.
//
// What's worth pinning:
//   1. it fires only for holds of 60s or more (the 30–55s poses stay silent)
//   2. it fires exactly once, at the midpoint (rounded down for odd lengths)
//   3. the tone is NOT the 3-note end chime

module.exports = {
  name: '93-halfway-tone',
  async run(page) {
    return await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      function ticks(dur){ var n=0; for (var t=dur-1; t>=0; t--) if (isHalfwayTick(dur, t)) n++; return n; }
      ok('a 30s pose gets no halfway tone', ticks(30) === 0);
      ok('a 55s pose gets no halfway tone', ticks(55) === 0);
      ok('a 60s hold gets exactly one tone', ticks(60) === 1);
      ok('a 90s hold gets exactly one tone', ticks(90) === 1);
      ok('a 600s hold gets exactly one tone', ticks(600) === 1);
      ok('the 60s tone lands at 30s left', isHalfwayTick(60, 30) && !isHalfwayTick(60, 31));
      ok('an odd length rounds the midpoint down', isHalfwayTick(61, 30));
      ok('the halfway tone is its own function, not the end chime', typeof playHalfwayTone === 'function' && playHalfwayTone !== playChime);
      return {pass:pass, fail:fail};
    })()`);
  },
};
