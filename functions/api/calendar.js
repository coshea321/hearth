// Hearth calendar feed (v521) — Cloudflare Pages Function at /api/calendar.
//
// Fetches ONE Google Calendar through its "secret address in iCal format",
// expands it into the next few days of events in Irish time, and returns
// small JSON for the Home card. Read-only: nothing here writes anywhere.
//
// WHY A FUNCTION: the browser cannot fetch the iCal feed itself (Google sends
// no CORS headers), and the secret address must never reach the browser or
// this PUBLIC repo. It lives only in the Pages project's encrypted variable
// GCAL_ICS_URL (Settings → Variables and Secrets). This route is on the same
// hostname as the app, so the existing Cloudflare Access gate covers it too —
// nobody off the allowlist can call it.
//
// Plain JS, no packages, no imports (same zero-dependency rule as the app).
// The parser covers what Google actually emits: DATE and DATE-TIME starts,
// TZID / UTC / floating times, DTEND or DURATION, RRULE with
// FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, COUNT, UNTIL, BYDAY (incl.
// "2TU" / "-1FR" in monthly rules) and BYMONTHDAY, EXDATE, moved or
// cancelled single occurrences (RECURRENCE-ID), and STATUS:CANCELLED.
// Anything rarer (BYSETPOS, BYWEEKNO…) shows the series' first date only
// rather than guessing.

const TZ = 'Europe/Dublin';
const DAYS = 8; // today + the next 7 days (confirmed design, 15/11/2026)

export async function onRequestGet(context) {
  const env = context.env || {};
  const src = String(env.GCAL_ICS_URL || '').trim();
  if (!/^https:\/\//.test(src)) {
    return json({ error: 'not_configured' }, 503);
  }
  let text;
  try {
    const r = await fetch(src, { headers: { 'User-Agent': 'Hearth calendar' } });
    if (!r.ok) return json({ error: 'upstream', status: r.status }, 502);
    text = await r.text();
  } catch (e) {
    return json({ error: 'upstream' }, 502);
  }
  try {
    const from = todayIn(TZ, Date.now());
    const events = eventsInWindow(text, from, DAYS, TZ);
    return json({ ok: true, tz: TZ, from: from, days: DAYS, events: events,
                  generatedAt: new Date().toISOString() }, 200);
  } catch (e) {
    return json({ error: 'parse' }, 500);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8',
               'Cache-Control': 'no-store' }
  });
}

// ── Time helpers ─────────────────────────────────────────────────────────────
// Every time is held as "wall ms": the wall-clock reading in a given zone,
// encoded as if it were UTC (Date.UTC(y,m,d,h,mi,s)). Arithmetic on wall ms is
// plain date arithmetic, which is exactly what recurrence rules mean ("every
// Tuesday at 09:00" stays 09:00 across the clock change).

function wallInZone(tz, utcMs) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const p = {};
  f.formatToParts(new Date(utcMs)).forEach(x => { p[x.type] = x.value; });
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
}

function validZone(tz) {
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; }
  catch (e) { return false; }
}

// wall ms in zone `tz` → real UTC ms
function wallToUtc(tz, wall) {
  let utc = wall - (wallInZone(tz, wall) - wall);
  utc = wall - (wallInZone(tz, utc) - utc);
  return utc;
}

function todayIn(tz, utcMs) {
  return ymd(wallInZone(tz, utcMs));
}

function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(wall) {
  const d = new Date(wall);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}
function hm(wall) {
  const d = new Date(wall);
  return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
}
const DAY_MS = 86400000;

// ── iCal parsing ─────────────────────────────────────────────────────────────

function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeText(v) {
  return String(v).replace(/\\([\\;,nN])/g, (m, c) => (c === 'n' || c === 'N') ? '\n' : c);
}

function parseLine(line) {
  // NAME;PARAM=V;PARAM="V":VALUE — the first ':' outside quotes splits.
  let inQ = false, i = 0;
  for (; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === ':' && !inQ) break;
  }
  const head = line.slice(0, i), value = line.slice(i + 1);
  const bits = head.split(';');
  const params = {};
  for (let j = 1; j < bits.length; j++) {
    const eq = bits[j].indexOf('=');
    if (eq > 0) params[bits[j].slice(0, eq).toUpperCase()] = bits[j].slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: bits[0].toUpperCase(), params: params, value: value };
}

function parseVevents(text) {
  const out = [];
  let cur = null;
  unfold(text).split('\n').forEach(raw => {
    if (!raw) return;
    const ln = parseLine(raw);
    if (ln.name === 'BEGIN' && ln.value.toUpperCase() === 'VEVENT') { cur = { exdates: [] }; return; }
    if (ln.name === 'END' && ln.value.toUpperCase() === 'VEVENT') { if (cur) out.push(cur); cur = null; return; }
    if (!cur) return;
    // Nested components (VALARM) carry their own fields; skip them.
    if (ln.name === 'BEGIN') { cur._skip = (cur._skip || 0) + 1; return; }
    if (ln.name === 'END') { cur._skip = Math.max(0, (cur._skip || 0) - 1); return; }
    if (cur._skip) return;
    if (ln.name === 'EXDATE') cur.exdates.push(ln);
    else if (!cur[ln.name]) cur[ln.name] = ln;
  });
  return out;
}

// A DTSTART-style property → { wall, allDay, tz } where wall is in tz.
// UTC values ("Z") are converted into the household zone.
function parseWhen(prop, homeTz, rawValue) {
  const v = String(rawValue != null ? rawValue : prop.value).trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m || (prop.params && prop.params.VALUE === 'DATE' && (m = /^(\d{4})(\d{2})(\d{2})/.exec(v)))) {
    return { wall: Date.UTC(+m[1], +m[2] - 1, +m[3]), allDay: true, tz: homeTz };
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (m[7]) return { wall: wallInZone(homeTz, wall), allDay: false, tz: homeTz };
  const tzid = prop.params && prop.params.TZID;
  if (tzid && tzid !== homeTz && validZone(tzid)) return { wall: wall, allDay: false, tz: tzid };
  return { wall: wall, allDay: false, tz: homeTz }; // floating or home zone
}

// wall ms in `fromTz` → wall ms in `homeTz`
function toHome(wall, fromTz, homeTz) {
  if (fromTz === homeTz) return wall;
  return wallInZone(homeTz, wallToUtc(fromTz, wall));
}

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v || '').trim());
  if (!m) return null;
  const ms = ((+(m[2] || 0)) * 7 + (+(m[3] || 0))) * DAY_MS +
             (+(m[4] || 0)) * 3600000 + (+(m[5] || 0)) * 60000 + (+(m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

function parseRrule(v) {
  const r = {};
  String(v || '').split(';').forEach(kv => {
    const eq = kv.indexOf('=');
    if (eq > 0) r[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1);
  });
  return r;
}

const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function daysInMonth(y, mo) { return new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); }

// nth weekday of a month (n may be negative: -1 = last). Returns day or 0.
function nthWeekday(y, mo, wd, n) {
  const dim = daysInMonth(y, mo);
  if (n > 0) {
    const first = new Date(Date.UTC(y, mo, 1)).getUTCDay();
    const day = 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
    return day <= dim ? day : 0;
  }
  const last = new Date(Date.UTC(y, mo, dim)).getUTCDay();
  const day = dim - ((last - wd + 7) % 7) + (n + 1) * 7;
  return day >= 1 ? day : 0;
}

// Expand a recurring series into its start walls (in the event's own zone),
// stopping once past `limitWall`. Supports the common Google shapes only.
function expandStarts(start, rr, limitWall) {
  const freq = (rr.FREQ || '').toUpperCase();
  const interval = Math.max(1, parseInt(rr.INTERVAL, 10) || 1);
  const count = rr.COUNT ? parseInt(rr.COUNT, 10) : 0;
  let until = null;
  if (rr.UNTIL) {
    const u = parseWhen({ params: {} }, start.tz, rr.UNTIL);
    if (u) until = u.allDay ? u.wall + DAY_MS - 1 : u.wall;
  }
  const unsupported = rr.BYSETPOS || rr.BYWEEKNO || rr.BYYEARDAY || rr.BYHOUR || rr.BYMINUTE;
  if (unsupported || ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].indexOf(freq) === -1) return [start.wall];

  const t0 = new Date(start.wall);
  const timeOfDay = start.wall - Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), t0.getUTCDate());
  const byday = rr.BYDAY ? rr.BYDAY.split(',').map(s => {
    const m = /^([+-]?\d+)?([A-Z]{2})$/.exec(s.trim().toUpperCase());
    return m && (m[2] in WD) ? { n: m[1] ? parseInt(m[1], 10) : 0, wd: WD[m[2]] } : null;
  }).filter(Boolean) : [];
  const bymd = rr.BYMONTHDAY ? rr.BYMONTHDAY.split(',').map(x => parseInt(x, 10)).filter(x => x) : [];
  const bymonth = rr.BYMONTH ? rr.BYMONTH.split(',').map(x => parseInt(x, 10) - 1) : [];

  const out = [];
  let emitted = 0, guard = 0;
  function emit(w) {
    if (w < start.wall) return true;
    if (until !== null && w > until) return false;
    if (count && emitted >= count) return false;
    emitted++;
    if (w <= limitWall) out.push(w);
    return w <= limitWall;
  }

  if (freq === 'DAILY') {
    for (let w = start.wall; guard++ < 40000; w += interval * DAY_MS) {
      const d = new Date(w);
      if (bymonth.length && bymonth.indexOf(d.getUTCMonth()) === -1) { if (w > limitWall) break; continue; }
      if (byday.length && !byday.some(b => b.wd === d.getUTCDay())) { if (w > limitWall) break; continue; }
      if (!emit(w)) break;
    }
  } else if (freq === 'WEEKLY') {
    const days = byday.length ? byday.map(b => b.wd).sort((a, b) => a - b) : [t0.getUTCDay()];
    // Week containing DTSTART, starting Monday (WKST default).
    const weekStart = Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), t0.getUTCDate()) -
                      ((t0.getUTCDay() + 6) % 7) * DAY_MS;
    let stop = false;
    for (let wk = weekStart; !stop && guard++ < 10000; wk += interval * 7 * DAY_MS) {
      const order = days.map(wd => (wd + 6) % 7).sort((a, b) => a - b);
      for (const off of order) {
        const w = wk + off * DAY_MS + timeOfDay;
        if (w < start.wall) continue;
        if (!emit(w)) { stop = true; break; }
      }
    }
  } else if (freq === 'MONTHLY') {
    let y = t0.getUTCFullYear(), mo = t0.getUTCMonth(), stop = false;
    while (!stop && guard++ < 3000) {
      let ds = [];
      if (byday.length) {
        byday.forEach(b => {
          if (b.n) { const d = nthWeekday(y, mo, b.wd, b.n); if (d) ds.push(d); }
          else { for (let d = 1; d <= daysInMonth(y, mo); d++) if (new Date(Date.UTC(y, mo, d)).getUTCDay() === b.wd) ds.push(d); }
        });
      } else if (bymd.length) {
        bymd.forEach(n => { const dim = daysInMonth(y, mo); const d = n > 0 ? n : dim + n + 1; if (d >= 1 && d <= dim) ds.push(d); });
      } else {
        const d = t0.getUTCDate();
        if (d <= daysInMonth(y, mo)) ds.push(d); // RFC 5545: skip months without that day
      }
      ds = ds.filter((d, i, a) => a.indexOf(d) === i).sort((a, b) => a - b);
      for (const d of ds) {
        const w = Date.UTC(y, mo, d) + timeOfDay;
        if (!emit(w)) { stop = true; break; }
      }
      mo += interval;
      while (mo > 11) { mo -= 12; y++; }
      if (Date.UTC(y, mo, 1) > limitWall + 32 * DAY_MS && !count && until === null) break;
    }
  } else { // YEARLY
    let y = t0.getUTCFullYear();
    const mo0 = t0.getUTCMonth(), d0 = t0.getUTCDate();
    while (guard++ < 500) {
      const months = bymonth.length ? bymonth : [mo0];
      let stop = false;
      for (const mo of months.slice().sort((a, b) => a - b)) {
        if (d0 > daysInMonth(y, mo)) continue; // e.g. 29 Feb in a non-leap year
        const w = Date.UTC(y, mo, d0) + timeOfDay;
        if (!emit(w)) { stop = true; break; }
      }
      if (stop) break;
      y += interval;
    }
  }
  return out;
}

// The whole job: iCal text → events overlapping [from, from + days) in homeTz.
// from = "YYYY-MM-DD". Exported for the test suite.
export function eventsInWindow(text, from, days, homeTz) {
  const fm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from);
  const winStart = Date.UTC(+fm[1], +fm[2] - 1, +fm[3]);
  const winEnd = winStart + days * DAY_MS;

  const vevents = parseVevents(text);
  // Overrides of single occurrences, keyed "UID|home-wall-of-RECURRENCE-ID".
  const overridden = {};
  vevents.forEach(ev => {
    if (ev['RECURRENCE-ID'] && ev.UID) {
      const rid = parseWhen(ev['RECURRENCE-ID'], homeTz);
      if (rid) overridden[ev.UID.value + '|' + toHome(rid.wall, rid.tz, homeTz)] = true;
    }
  });

  const out = [];
  vevents.forEach(ev => {
    if (!ev.DTSTART) return;
    const status = ev.STATUS ? ev.STATUS.value.toUpperCase() : '';
    const start = parseWhen(ev.DTSTART, homeTz);
    if (!start) return;
    let dur;
    if (ev.DTEND) {
      const end = parseWhen(ev.DTEND, homeTz);
      dur = end ? toHome(end.wall, end.tz, homeTz) - toHome(start.wall, start.tz, homeTz) : 0;
    } else if (ev.DURATION) {
      dur = parseDuration(ev.DURATION.value) || 0;
    } else {
      dur = start.allDay ? DAY_MS : 0;
    }
    if (start.allDay && dur < DAY_MS) dur = DAY_MS;
    if (dur < 0) dur = 0;

    const title = ev.SUMMARY ? unescapeText(ev.SUMMARY.value).trim() : '';
    const location = ev.LOCATION ? unescapeText(ev.LOCATION.value).trim() : '';
    const uid = ev.UID ? ev.UID.value : '';
    const isOverride = !!ev['RECURRENCE-ID'];

    let starts;
    if (ev.RRULE && !isOverride) {
      // Expand in the event's own zone, with headroom for the zone gap.
      const limit = (start.tz === homeTz ? winEnd : winEnd + DAY_MS);
      starts = expandStarts(start, parseRrule(ev.RRULE.value), limit);
      const ex = {};
      ev.exdates.forEach(p => String(p.value).split(',').forEach(v => {
        const w = parseWhen(p, homeTz, v);
        if (w) ex[w.allDay ? ymd(w.wall) : toHome(w.wall, w.tz, homeTz)] = true;
      }));
      starts = starts.filter(w => !(start.allDay ? ex[ymd(w)] : ex[toHome(w, start.tz, homeTz)]));
    } else {
      starts = [start.wall];
    }
    if (status === 'CANCELLED') return; // a cancelled override still blanks its slot above

    starts.forEach(w0 => {
      const s = start.allDay ? w0 : toHome(w0, start.tz, homeTz);
      if (!isOverride && overridden[uid + '|' + s]) return;
      const e = s + dur;
      if (start.allDay) {
        // One row per covered day inside the window (DTEND is exclusive).
        for (let d = Math.max(s, winStart); d < Math.min(e, winEnd); d += DAY_MS) {
          out.push({ date: ymd(d), allDay: true, start: '', end: '', title: title, location: location,
                     multi: e - s > DAY_MS });
        }
        return;
      }
      if (e <= winStart && !(dur === 0 && s >= winStart)) return; // already over before today
      if (s >= winEnd) return;
      const cont = s < winStart; // began before today, still running
      out.push({ date: cont ? ymd(winStart) : ymd(s), allDay: false,
                 start: cont ? '' : hm(s), end: dur ? hm(e) : '',
                 endDate: dur ? ymd(e - 1) : ymd(s), cont: cont,
                 title: title, location: location });
    });
  });

  out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 :
                     (a.allDay !== b.allDay ? (a.allDay ? -1 : 1) :
                     (a.start < b.start ? -1 : a.start > b.start ? 1 : (a.title < b.title ? -1 : 1))));
  return out.slice(0, 200);
}
