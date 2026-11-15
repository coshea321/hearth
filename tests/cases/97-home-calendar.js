'use strict';

// v521: Home calendar card. Two halves:
//  1. The Pages Function's iCal expansion (functions/api/calendar.js), run
//     here in Node — recurrences, EXDATE, moved/cancelled occurrences, UTC
//     and other-zone times into Irish time, multi-day all-day events, the
//     8-day window, and the not-configured / upstream-error responses.
//  2. The card in the page: test builds paint the demo week and never call
//     the network; finished events drop off; titles are escaped; the
//     not-connected state; the row cap.

const fs = require('fs');
const path = require('path');

function loadFunction() {
  // Plain eval of the module with its `export` keywords removed, so this does
  // not depend on the Node version's ESM detection.
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'api', 'calendar.js'), 'utf8');
  const code = src.replace(/^export /gm, '');
  return new Function(code + '\nreturn { eventsInWindow: eventsInWindow, onRequestGet: onRequestGet };')();
}

const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT', 'UID:a',
  'DTSTART;TZID=Europe/Dublin:20261013T090000', 'DTEND;TZID=Europe/Dublin:20261013T093000',
  'RRULE:FREQ=WEEKLY;BYDAY=TU,TH', 'EXDATE;TZID=Europe/Dublin:20261119T090000',
  'SUMMARY:Crèche drop\\, early',
  'BEGIN:VALARM', 'SUMMARY:alarm text', 'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT', 'UID:a', 'RECURRENCE-ID;TZID=Europe/Dublin:20261117T090000',
  'DTSTART;TZID=Europe/Dublin:20261117T100000', 'DTEND;TZID=Europe/Dublin:20261117T103000',
  'SUMMARY:Crèche drop (moved)', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:a2', 'RECURRENCE-ID;TZID=Europe/Dublin:20261112T090000',
  'DTSTART;TZID=Europe/Dublin:20261112T090000', 'STATUS:CANCELLED', 'SUMMARY:x', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:b', 'DTSTART;VALUE=DATE:20261114', 'DTEND;VALUE=DATE:20261117',
  'SUMMARY:Weekend away', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:c', 'DTSTART:20261120T180000Z', 'DTEND:20261120T190000Z',
  'SUMMARY:Call', 'LOCATION:Zoom', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:d', 'DTSTART;VALUE=DATE:19800318', 'RRULE:FREQ=YEARLY',
  'SUMMARY:Birthday', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:e', 'DTSTART;TZID=Europe/Dublin:20260101T200000', 'DURATION:PT1H',
  'RRULE:FREQ=MONTHLY;BYDAY=3SA', 'SUMMARY:Third Saturday', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:f', 'DTSTART;TZID=America/New_York:20261118T090000',
  'DTEND;TZID=America/New_York:20261118T100000', 'SUMMARY:NY meeting', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:g', 'DTSTART;TZID=Europe/Dublin:20261116T120000',
  'STATUS:CANCELLED', 'SUMMARY:Cancelled thing', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:h', 'DTSTART;TZID=Europe/Dublin:20261001T070000',
  'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Old daily', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:i', 'DTSTART;TZID=Europe/Dublin:20261123T080000',
  'SUMMARY:Day after window', 'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

module.exports = {
  name: '97-home-calendar',
  async run(page) {
    const pass = [], fail = [];
    function ok(name, cond, detail) { if (cond) pass.push(name); else fail.push({ name: name, detail: detail || 'assertion failed' }); }

    // ── 1. The function, in Node ─────────────────────────────────────────
    const fn = loadFunction();
    const ev = fn.eventsInWindow(ICS, '2026-11-15', 8, 'Europe/Dublin');
    const titles = ev.map(e => e.date + ' ' + (e.start || 'all') + ' ' + e.title);
    const has = t => titles.indexOf(t) !== -1;
    ok('fn: multi-day all-day shows on each covered day in the window',
      has('2026-11-15 all Weekend away') && has('2026-11-16 all Weekend away') && !titles.some(t => /^2026-11-17 .*Weekend/.test(t)),
      JSON.stringify(titles));
    ok('fn: moved occurrence replaces the original slot',
      has('2026-11-17 10:00 Crèche drop (moved)') && !has('2026-11-17 09:00 Crèche drop, early'), JSON.stringify(titles));
    ok('fn: EXDATE removes that occurrence', !titles.some(t => t.indexOf('2026-11-19') === 0), JSON.stringify(titles));
    ok('fn: UTC time shown in Irish time', has('2026-11-20 18:00 Call') && ev.some(e => e.title === 'Call' && e.location === 'Zoom' && e.end === '19:00'), JSON.stringify(titles));
    ok('fn: other-zone time converted (09:00 New York = 14:00 Dublin)', has('2026-11-18 14:00 NY meeting'), JSON.stringify(titles));
    ok('fn: monthly 3rd Saturday', has('2026-11-21 20:00 Third Saturday'), JSON.stringify(titles));
    ok('fn: cancelled event left out', !titles.some(t => /Cancelled thing/.test(t)), JSON.stringify(titles));
    ok('fn: finished COUNT series left out', !titles.some(t => /Old daily/.test(t)), JSON.stringify(titles));
    ok('fn: yearly birthday outside the window left out', !titles.some(t => /Birthday/.test(t)), JSON.stringify(titles));
    ok('fn: window is today + 7 days, no further', !titles.some(t => /Day after window/.test(t)), JSON.stringify(titles));
    ok('fn: alarm text never leaks into the title', !titles.some(t => /alarm text/.test(t)), JSON.stringify(titles));
    ok('fn: sorted by date then time', ev.every((e, i) => i === 0 || ev[i - 1].date < e.date ||
      (ev[i - 1].date === e.date && (ev[i - 1].allDay || ev[i - 1].start <= e.start))), JSON.stringify(titles));

    const ics2 = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:z\r\nDTSTART;TZID=Europe/Dublin:20261013T090000\r\n' +
      'DTEND;TZID=Europe/Dublin:20261013T093000\r\nRRULE:FREQ=WEEKLY;BYDAY=TU,TH\r\nSUMMARY:Drop\\, early\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const ev2 = fn.eventsInWindow(ics2, '2026-11-15', 8, 'Europe/Dublin').map(e => e.date + ' ' + e.start + ' ' + e.title);
    ok('fn: weekly BYDAY series expands from an old start', JSON.stringify(ev2) === JSON.stringify([
      '2026-11-17 09:00 Drop, early', '2026-11-19 09:00 Drop, early']),JSON.stringify(ev2));

    const ics3 = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:y\r\nDTSTART;TZID=Europe/Dublin:20261014T200000\r\n' +
      'DTEND;TZID=Europe/Dublin:20261016T100000\r\nSUMMARY:Long\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const ev3 = fn.eventsInWindow(ics3, '2026-10-15', 8, 'Europe/Dublin');
    ok('fn: timed event that began yesterday shows as ongoing today',
      ev3.length === 1 && ev3[0].date === '2026-10-15' && ev3[0].cont === true && ev3[0].end === '10:00', JSON.stringify(ev3));

    // Codex on #294 — four review findings, each pinned.
    function one(body, from) {
      return fn.eventsInWindow('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:q\r\n' + body.join('\r\n') +
        '\r\nSUMMARY:T\r\nEND:VEVENT\r\nEND:VCALENDAR', from, 8, 'Europe/Dublin');
    }
    const mid = one(['DTSTART;TZID=Europe/Dublin:20261115T230000', 'DTEND;TZID=Europe/Dublin:20261116T000000'], '2026-11-15');
    ok('fn: an event ending at midnight carries the NEXT day as its end date',
      mid.length === 1 && mid[0].date === '2026-11-15' && mid[0].end === '00:00' && mid[0].endDate === '2026-11-16', JSON.stringify(mid));
    const utcSeries = one(['DTSTART:20261020T090000Z', 'DTEND:20261020T093000Z', 'RRULE:FREQ=WEEKLY'], '2026-11-15');
    ok('fn: a UTC weekly series keeps its UTC time after the clocks change (09:00Z = 09:00 Irish in winter)',
      utcSeries.length === 1 && utcSeries[0].date === '2026-11-17' && utcSeries[0].start === '09:00', JSON.stringify(utcSeries));
    const utcSummer = one(['DTSTART:20260601T090000Z', 'RRULE:FREQ=WEEKLY;COUNT=2'], '2026-06-01');
    ok('fn: a UTC time shows in Irish summer time (09:00Z = 10:00)',
      utcSummer.length === 2 && utcSummer[0].start === '10:00' && utcSummer[1].date === '2026-06-08', JSON.stringify(utcSummer));
    const wk = one(['DTSTART;TZID=Europe/Dublin:20261109T090000', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,SU;WKST=SU'], '2026-11-15')
      .map(e => e.date);
    ok('fn: WKST decides which fortnight weeks count (22 and 23 Nov, not 15)',
      JSON.stringify(wk) === JSON.stringify(['2026-11-22']), JSON.stringify(wk));
    const wk2 = one(['DTSTART;TZID=Europe/Dublin:20261109T090000', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,SU;WKST=SU'], '2026-11-16')
      .map(e => e.date);
    ok('fn: … and the Monday after (23 Nov) too',
      JSON.stringify(wk2) === JSON.stringify(['2026-11-22', '2026-11-23']), JSON.stringify(wk2));
    const wkMo = one(['DTSTART;TZID=Europe/Dublin:20261109T090000', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,SU'], '2026-11-09')
      .map(e => e.date);
    ok('fn: default Monday week start unchanged (9 & 15 Nov)',
      JSON.stringify(wkMo) === JSON.stringify(['2026-11-09', '2026-11-15']), JSON.stringify(wkMo));

    const r503 = await fn.onRequestGet({ env: {} });
    const b503 = await r503.json();
    ok('fn: no secret configured → 503 not_configured', r503.status === 503 && b503.error === 'not_configured', r503.status + ' ' + JSON.stringify(b503));
    ok('fn: responses are never cached', r503.headers.get('Cache-Control') === 'no-store', r503.headers.get('Cache-Control'));

    const realFetch = globalThis.fetch;
    try {
      let asked = '';
      globalThis.fetch = async (u) => { asked = u; return new Response(ICS, { status: 200 }); };
      const r200 = await fn.onRequestGet({ env: { GCAL_ICS_URL: 'https://calendar.google.com/calendar/ical/x/private-y/basic.ics' } });
      const b200 = await r200.json();
      ok('fn: fetches the configured address', asked.indexOf('https://calendar.google.com/') === 0, asked);
      ok('fn: 200 with ok + events + 8 days', r200.status === 200 && b200.ok === true && Array.isArray(b200.events) && b200.days === 8, JSON.stringify(b200).slice(0, 200));
      ok('fn: the secret address is never echoed back', JSON.stringify(b200).indexOf('private-y') === -1, 'leaked');
      globalThis.fetch = async () => new Response('nope', { status: 404 });
      const r502 = await fn.onRequestGet({ env: { GCAL_ICS_URL: 'https://example.com/a.ics' } });
      ok('fn: upstream failure → 502', r502.status === 502, String(r502.status));
      const rBad = await fn.onRequestGet({ env: { GCAL_ICS_URL: 'http://plain.example/a.ics' } });
      ok('fn: non-https address treated as not configured', rBad.status === 503, String(rBad.status));
    } finally {
      globalThis.fetch = realFetch;
    }

    // ── 2. The card, in the page ─────────────────────────────────────────
    const res = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      var calls = 0, realFetch = window.fetch;
      window.fetch = function(u){ if (String(u).indexOf('/api/calendar') !== -1) calls++; return realFetch.apply(this, arguments); };
      try {
        switchSection('home');
        renderHomeScreen();
        var card = document.getElementById('homeCalendar');
        ok('card: running as a test build or preview', _isTestBuild === true || _isPreview === true, String(_isTestBuild) + '/' + String(_isPreview));
        ok('card: shown with the demo week', card.classList.contains('hcal-show') && /Demo swim lesson/.test(card.textContent), card.textContent.slice(0, 200));
        ok('card: test build / preview never calls /api/calendar', calls === 0, 'calls: ' + calls);
        ok('card: Today and Tomorrow headings', /Today/.test(card.textContent) && /Tomorrow/.test(card.textContent), card.textContent.slice(0, 200));
        ok('card: all-day row labelled', /All day/.test(card.textContent), card.textContent.slice(0, 200));

        var nIE = hcalNow(), today = nIE.today;
        hcalPaint({ at: Date.now(), events: [
          { date: nIE.plus(-1), allDay:false, start:'10:00', end:'11:00', title:'Yesterday thing' },
          { date: today, allDay:false, start:'00:00', end:'00:00', endDate: nIE.tomorrow, title:'Runs to midnight' },
          { date: today, allDay:false, start:'00:00', end:'00:00', title:'Already over' },
          { date: today, allDay:false, start:'23:58', end:'23:59', title:'<img src=x onerror=alert(1)>' }
        ] }, false);
        ok('card: past-day event dropped', !/Yesterday thing/.test(card.textContent), card.textContent);
        ok('card: finished event today dropped', !/Already over/.test(card.textContent), card.textContent);
        ok('card: an event ending at midnight stays up all day', /Runs to midnight/.test(card.textContent) && /00:00–00:00/.test(card.textContent), card.textContent);

        // Irish time, not the phone's: matches Intl's Dublin clock.
        var fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
        ok('card: "today" is the Irish date', nIE.today === fmt, nIE.today + ' vs ' + fmt);
        ok('card: title escaped, not rendered as HTML', !card.querySelector('img') && /<img/.test(card.textContent), card.innerHTML.slice(0, 300));

        hcalPaint({ at: Date.now(), events: [] }, false);
        ok('card: empty week says nothing on today', /Nothing on today/.test(card.textContent), card.textContent);

        var many = [];
        for (var i = 0; i < 14; i++) { many.push({ date: nIE.tomorrow, allDay:true, start:'', end:'', title:'Item ' + i }); }
        hcalPaint({ at: Date.now(), events: many }, false);
        ok('card: capped at 10 rows', card.querySelectorAll('.hcal-ev').length === 10, String(card.querySelectorAll('.hcal-ev').length));
        ok('card: says how many more', /\\+4 more this week/.test(card.textContent), card.textContent.slice(-80));

        hcalPaint({ at: Date.now() - 3600000, events: [], notConfigured: true }, true);
        ok('card: not-connected message', /isn't connected yet/.test(card.textContent), card.textContent);
        ok('card: stale copy is faded with its time', card.classList.contains('hcal-stale') && /as of/.test(card.textContent), card.className);

        hcalPaint(null, false);
        ok('card: hidden with nothing to show', !card.classList.contains('hcal-show'), card.className);
      } finally {
        window.fetch = realFetch;
      }
      return { pass: pass, fail: fail };
    })()`);
    return { pass: pass.concat(res.pass), fail: fail.concat(res.fail) };
  }
};
