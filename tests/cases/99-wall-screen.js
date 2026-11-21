'use strict';

// v528: the always-on wall screen (20b-wall.js). Pins: it is off unless this
// phone turned it on; it shows the calendar + Grocery + To-do; a tap ticks
// through the real toggleItem (and a second tap undoes it) without changing
// the user's current list; "Full app" leaves it; it only comes back by
// itself when idle and nothing is open; and turning it off hides it.

module.exports = {
  name: '99-wall-screen',
  async run(page) {
    const res = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      var savedInput = _lastUserInput, savedList = currentList, savedSection = currentSection;
      var el = document.getElementById('wallScreen');
      var added = null;
      try {
        ok('off by default', !wallEnabled() && el.style.display === 'none', localStorage.getItem('hearthWallMode'));
        _lastUserInput = Date.now() - 10 * 60 * 1000;
        wallTick(); wallTick();
        ok('never appears while switched off', !wallIsShowing());

        // A known grocery item to tick.
        var g = loadListData('grocery');
        added = { id: 990000001, name: 'Wall test milk', catId: 'dairy', done: false, updated: Date.now() - 3600000 };
        g.items.push(added);
        currentList = 'todo';

        wallSetEnabled(true);
        ok('turning it on shows it', wallIsShowing() && el.style.display === 'block');
        ok('saved on this phone', localStorage.getItem('hearthWallMode') === '1');
        ok('on Home underneath', currentSection === 'home');
        ok('calendar painted on the wall', document.getElementById('wallCalendar').classList.contains('hcal-show'));
        var cards = el.querySelectorAll('.wall-card');
        ok('two list cards (Grocery, To-do)', cards.length === 2, String(cards.length));
        var btn = el.querySelector(".wall-item[data-id='990000001']");
        ok('grocery item listed', !!btn);

        btn.click();
        ok('tap ticks it', added.done === true);
        ok('user list unchanged by the tick', currentList === 'todo', currentList);
        btn = el.querySelector(".wall-item[data-id='990000001']");
        ok('ticked item stays, struck through', btn && btn.classList.contains('wall-done'));
        btn.click();
        ok('second tap undoes it', added.done === false);

        document.getElementById('wallExit').click();
        ok('Full app leaves it', !wallIsShowing() && el.style.display === 'none');
        wallTick();
        ok('does not come straight back after leaving', !wallIsShowing());

        _lastUserInput = Date.now() - 4 * 60 * 1000;
        var ov = document.getElementById('moreOverlay');
        ov.classList.add('open');
        wallTick();
        ok('idle but a dialog is open: stays away', !wallIsShowing());
        ov.classList.remove('open');

        switchSection('lists');
        _lastUserInput = Date.now() - 4 * 60 * 1000;
        wallTick();
        ok('idle 3+ min with nothing open: comes back to Home', wallIsShowing() && currentSection === 'home');

        wallSetEnabled(false);
        ok('turning it off hides it and forgets it', !wallIsShowing() && localStorage.getItem('hearthWallMode') === null);
      } finally {
        try { localStorage.removeItem('hearthWallMode'); } catch (e) {}
        if (wallIsShowing()) wallHide();
        if (added) { var gi = loadListData('grocery').items, k = gi.indexOf(added); if (k !== -1) gi.splice(k, 1); storeSet(LIST_CONFIG.grocery.key, loadListData('grocery')); }
        currentList = savedList;
        _lastUserInput = savedInput;
        switchSection(savedSection || 'home');
      }
      return { pass: pass, fail: fail };
    })()`);
    return res;
  }
};
