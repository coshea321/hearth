'use strict';

// v519: temperature tracker. One panel, two doors (Baby → Temp and
// Track → Body). Pins: the daughter's readings live ONLY in fl4_baby.temps
// (so both screens show one list and it household-syncs), Me/wife readings
// live in fl4_workouts.temps tagged by person, deletes tombstone the baby
// list, mergeBabyData honours that tombstone, and the Body cards fold.

module.exports = {
  name: '96-temperature',
  async run(page) {
    const result = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }

      var bd = getBD(); bd.temps = []; saveBD(bd);
      var wd = getWD(); wd.temps = []; saveWD(wd);
      try { localStorage.removeItem('hearthBodyFolds'); } catch (e) {}

      // ── Baby → Temp: log goes to fl4_baby.temps, stamped ──
      switchSection('baby');
      currentBabyView = 'temp';
      renderBabyView();
      ok('baby: temp view shown', document.getElementById('babyTempView').style.display === '', 'display: ' + document.getElementById('babyTempView').style.display);
      document.getElementById('babyTempVal').value = '38.24';
      document.getElementById('babyTempMethod').value = 'Ear';
      document.getElementById('babyTempLogBtn').click();
      var t = getBD().temps;
      ok('baby: reading saved to fl4_baby.temps', t.length === 1 && t[0].temp === 38.2 && t[0].method === 'Ear', 'got: ' + JSON.stringify(t));
      ok('baby: stamped with id + updated', t[0] && typeof t[0].id === 'number' && typeof t[0].updated === 'number', 'got: ' + JSON.stringify(t[0]));
      ok('baby: nothing written to workouts', (getWD().temps || []).length === 0, 'got: ' + JSON.stringify(getWD().temps));
      ok('baby: 38.2 shows red', /38\\.2/.test(document.getElementById('babyTempView').textContent) &&
        document.querySelector('#babyTempView .bw-entry-val').getAttribute('style').indexOf('#C05A3A') >= 0, 'html');
      ok('baby: advice line present', /contact your GP or 112/.test(document.getElementById('babyTempView').textContent), 'no advice line');

      // ── Out-of-range input is refused ──
      document.getElementById('babyTempVal').value = '45';
      document.getElementById('babyTempLogBtn').click();
      ok('baby: 45 °C refused', getBD().temps.length === 1, 'got: ' + getBD().temps.length);

      // ── Track → Body as daughter shows the SAME list and logs into it ──
      switchSection('track');
      document.getElementById('trackPerson').value = 'daughter';
      currentTrackView = 'body';
      renderTrackView();
      ok('body/daughter: shows the baby reading', /38\\.2/.test(document.getElementById('bodyTempWrap').textContent), document.getElementById('bodyTempWrap').textContent.slice(0, 200));
      document.getElementById('bodyTempVal').value = '37.6';
      document.getElementById('bodyTempLogBtn').click();
      ok('body/daughter: logged into fl4_baby.temps', getBD().temps.length === 2, 'got: ' + JSON.stringify(getBD().temps));
      ok('body/daughter: nothing in workouts', (getWD().temps || []).length === 0, 'got: ' + JSON.stringify(getWD().temps));

      // ── Track → Body as wife: personal store, tagged ──
      document.getElementById('trackPerson').value = 'wife';
      renderTrackView();
      ok('body/wife: baby readings not shown', !/38\\.2/.test(document.getElementById('bodyTempWrap').textContent), 'leaked');
      document.getElementById('bodyTempVal').value = '36.9';
      document.getElementById('bodyTempLogBtn').click();
      var wt = getWD().temps || [];
      ok('body/wife: saved to workouts with person tag', wt.length === 1 && wt[0].person === 'wife' && wt[0].temp === 36.9, 'got: ' + JSON.stringify(wt));
      document.getElementById('trackPerson').value = 'me';
      renderTrackView();
      ok('body/me: wife reading not shown', !/36\\.9/.test(document.getElementById('bodyTempWrap').textContent), 'leaked');

      // ── Delete a baby reading: tombstoned, and the merge honours it ──
      document.getElementById('trackPerson').value = 'daughter';
      renderTrackView();
      var victim = getBD().temps[0];
      var del = document.querySelector('#bodyTempWrap .temp-del[data-tempkey="' + victim.id + '"]');
      del.click();
      document.getElementById('_cfYes').click();
      ok('delete: removed', !getBD().temps.some(function(x){ return x.id === victim.id; }), 'got: ' + JSON.stringify(getBD().temps));
      ok('delete: tombstoned by id', getTombs('btemp')[victim.id] != null, 'got: ' + JSON.stringify(getTombs('btemp')));
      var merged = mergeBabyData(getBD(), { temps:[victim] }, {}, {}, {}, {}, {}, getTombs('btemp'));
      ok('merge: tombstone stops a partner copy resurrecting it', !merged.temps.some(function(x){ return x.id === victim.id; }), 'got: ' + JSON.stringify(merged.temps));
      var fresh = { id: 123, ts: Date.now(), temp: 37.1, method: '', note: '', updated: Date.now() };
      merged = mergeBabyData(getBD(), { temps:[fresh] }, {}, {}, {}, {}, {}, getTombs('btemp'));
      ok('merge: partner-only reading is added', merged.temps.some(function(x){ return x.id === 123; }), 'got: ' + JSON.stringify(merged.temps));

      // ── Collapsible Body cards ──
      var card = document.querySelector('#trainBodyView .bw-card[data-fold="bplog"]');
      card.querySelector('.bw-card-title').click();
      ok('fold: card folds on title tap', card.classList.contains('folded'), card.className);
      ok('fold: content hidden', getComputedStyle(document.getElementById('bpLogBtn')).display === 'none', 'still visible');
      renderTrackView();
      ok('fold: survives a re-render', document.querySelector('#trainBodyView .bw-card[data-fold="bplog"]').classList.contains('folded'), 'lost');
      var tempCard = document.querySelector('#trainBodyView .bw-card[data-fold="temp-hist"]');
      ok('fold: temperature cards are foldable', !!tempCard, 'no temp-hist card');
      document.querySelector('#trainBodyView .bw-card[data-fold="bplog"] .bw-card-title').click();
      ok('fold: tap again unfolds', !document.querySelector('#trainBodyView .bw-card[data-fold="bplog"]').classList.contains('folded'), 'still folded');

      document.getElementById('trackPerson').value = 'me';
      return {pass:pass, fail:fail};
    })()`);
    return result;
  },
};
