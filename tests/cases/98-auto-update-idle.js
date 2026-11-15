'use strict';

// v524: always-on screens (the kitchen kiosk phone) reload themselves into a
// new build — but only when nobody could lose anything. This pins the
// decision (autoUpdateBlocker) and the two guards around the reload:
// test builds never arm it, and it never reloads twice for the same build.
// The real reload is not exercised here (it would end the test page); the
// service-worker update flow that triggers it is covered by
// tests/sw-cases/02-sw-update-banner.js.

module.exports = {
  name: '98-auto-update-idle',
  async run(page) {
    const res = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      var savedInput = _lastUserInput, savedSection = currentSection;
      try {
        switchSection('home');
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        var now = Date.now();

        _lastUserInput = now - 6 * 60 * 1000;
        ok('idle 6 min on Home, nothing open: safe to reload', autoUpdateBlocker(now) === '', autoUpdateBlocker(now));

        _lastUserInput = now - 60 * 1000;
        ok('touched a minute ago: wait', autoUpdateBlocker(now) === 'recent input', autoUpdateBlocker(now));
        _lastUserInput = now - 6 * 60 * 1000;

        switchSection('lists');
        ok('not on Home: wait', autoUpdateBlocker(now) === 'not on Home', autoUpdateBlocker(now));
        switchSection('home');

        var inp = document.createElement('input');
        document.body.appendChild(inp); inp.focus();
        ok('a text field has focus: wait', autoUpdateBlocker(now) === 'field focused', autoUpdateBlocker(now));
        inp.blur(); document.body.removeChild(inp);

        var ov = document.getElementById('moreOverlay');
        ov.classList.add('open');
        ok('an overlay is open: wait', autoUpdateBlocker(now) === 'dialog open', autoUpdateBlocker(now));
        ov.classList.remove('open');

        var dlg = document.createElement('div');
        dlg.setAttribute('aria-modal', 'true');
        document.body.appendChild(dlg);
        ok('a confirm dialog is open: wait', autoUpdateBlocker(now) === 'dialog open', autoUpdateBlocker(now));
        document.body.removeChild(dlg);

        // Codex on #297: the quick-add panel is inline, with a blurred draft.
        openHqp('grocery', 'Add to Grocery', 'life', 'Item name...');
        var qi = document.getElementById('homeQuickInput');
        qi.value = 'milk'; qi.blur();
        ok('quick-add open with a blurred draft: wait', autoUpdateBlocker(now) === 'quick-add open', autoUpdateBlocker(now));
        closeHqp(); qi.value = '';

        var ta = document.createElement('textarea');
        ta.value = 'half-written note';
        document.getElementById('homeCalendar').parentNode.appendChild(ta);
        ok('any visible box still holding text: wait', autoUpdateBlocker(now) === 'unsaved text', autoUpdateBlocker(now));
        ta.parentNode.removeChild(ta);

        ok('back to safe once everything is closed', autoUpdateBlocker(now) === '', autoUpdateBlocker(now));

        // Test builds never arm the reload timer.
        autoUpdateArm('v999 · 01/01/2030');
        ok('test build: auto-update never arms', _autoUpdateTimer === null, String(_autoUpdateTimer));

        // Loop guard: a build already tried in this tab is not reloaded again.
        _autoUpdateTarget = 'v999 · 01/01/2030';
        sessionStorage.setItem('hearthAutoReloadedFor', 'v999 · 01/01/2030');
        autoUpdateTick(); // would reload the page if the guard failed
        ok('same build already tried: no second reload', sessionStorage.getItem('hearthAutoReloadedFor') === 'v999 · 01/01/2030', 'guard changed');
        sessionStorage.removeItem('hearthAutoReloadedFor');
        _autoUpdateTarget = '';
      } finally {
        _lastUserInput = savedInput;
        switchSection(savedSection || 'home');
      }
      return { pass: pass, fail: fail };
    })()`);
    return res;
  }
};
