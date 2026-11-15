'use strict';

// v521 — the service worker must not answer /api/ requests from its cache.
//
// /api/calendar (a Cloudflare Pages Function) is live data. The worker's
// non-shell branch is cache-first and stores every 200, so without the /api/
// passthrough the first week of events fetched would be served forever.
//
// The test plants a stale copy of an /api/ URL in the worker's own cache, then
// fetches it. The local server 404s it (no such file). So:
//   passthrough working  → the fetch gets the server's 404
//   passthrough missing  → the fetch gets the planted "STALE" body
// The plant is asserted first, or the case could pass for the wrong reason.

const fs = require('fs');
const path = require('path');

const SW_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'sw.js'), 'utf8');
const SW_VERSION = (/const VERSION = '([^']*)'/.exec(SW_SRC) || [])[1] || '';

module.exports = {
  name: '05-sw-api-passthrough',
  async run(page) {
    const pass = [];
    const fail = [];
    function check(name, ok, detail) {
      if (ok) pass.push(name);
      else fail.push({ name: name, detail: detail });
    }

    await page.waitFor('!!navigator.serviceWorker.controller', 15000);

    const out = await page.evaluate(
      '(function(){' +
      '  var u = "/api/calendar-probe";' +
      '  return caches.open("hearth-" + ' + JSON.stringify(SW_VERSION) + ')' +
      '    .then(function(c){ return c.put(u, new Response("STALE", {status:200})).then(function(){ return c.match(u); }); })' +
      '    .then(function(hit){ return fetch(u, {cache:"no-store"}).then(function(r){' +
      '      return r.text().then(function(t){ return { planted: !!hit, status: r.status, body: t.slice(0, 40) }; });' +
      '    }); });' +
      '})()'
    );

    check('a stale /api/ copy IS in the worker cache — so cache-first could fire',
      out.planted === true, 'got: ' + JSON.stringify(out));
    check('an /api/ request is NOT answered from the cache',
      out.body !== 'STALE', 'got: ' + JSON.stringify(out));
    check('it reached the network instead (server 404)',
      out.status === 404 && out.body.indexOf('not found') !== -1, 'got: ' + JSON.stringify(out));

    return { pass: pass, fail: fail };
  }
};
