'use strict';

// v530: Renpho CSV weight import (Track → Body). Pins: columns found by
// header name, "--" rows skipped, latest reading per day wins, future dates
// skipped, existing days are kept (never overwritten), and imports land on
// the person picked in Track.

module.exports = {
  name: '99-renpho-import',
  async run(page) {
    return page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var csv = '\\uFEFFNo.,Date,Time,Weight(kg),BMI,Body Fat Percentage(%),Remarks,\\n' +
        '1,2026.11.25,07:55:19,82.05,30.5,28.5,,\\n' +
        '2,2026.11.25,07:54:42,82.15,30.5,28.5,--,\\n' +
        '3,2026.11.24,12:03:26,83.30,31.0,--,,\\n' +
        '4,2026.11.24,12:04:30,82.20,30.6,28.6,,\\n' +
        '5,2026.10.02,11:15:00,84.00,31.2,--,,\\n' +
        '6,2026.10.01,11:15:00,--,--,--,,\\n' +
        '7,2999.01.01,09:00:00,80.00,30,--,,\\n';
      var rows = renphoWeightsFromCSV(csv);
      ok('parses three days', rows && rows.length === 3, JSON.stringify(rows));
      ok('newest first, ISO dates', rows && rows[0].date === '2026-11-25' && rows[2].date === '2026-10-02', JSON.stringify(rows));
      ok('latest reading of the day wins', rows && rows[0].weight === 82.1 && rows[1].weight === 82.2, JSON.stringify(rows));
      ok('non-Renpho file rejected', renphoWeightsFromCSV('a,b\\n1,2') === null, 'not null');

      var wd = getWD(); wd.bodyweight = [{ date: '2026-11-24', weight: 90 }]; saveWD(wd);
      var res = applyRenphoWeights(rows, 'me');
      var bw = getWD().bodyweight;
      ok('adds new days, keeps existing', res.added === 2 && res.kept === 1, JSON.stringify(res));
      ok('existing day not overwritten', bw.filter(function(e){ return e.date === '2026-11-24'; })[0].weight === 90, JSON.stringify(bw));
      ok('me entries carry no person key', bw.every(function(e){ return !('person' in e); }), JSON.stringify(bw));
      ok('re-import adds nothing', applyRenphoWeights(rows, 'me').added === 0, 'added again');

      var r2 = applyRenphoWeights(rows, 'wife');
      var wife = getWD().bodyweight.filter(function(e){ return e.person === 'wife'; });
      ok('wife import is separate', r2.added === 3 && wife.length === 3, JSON.stringify(getWD().bodyweight));

      wd = getWD(); wd.bodyweight = []; saveWD(wd);
      return {pass:pass, fail:fail};
    })()`);
  },
};
