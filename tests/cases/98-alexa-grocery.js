'use strict';

// v525: Alexa → grocery list. Two halves:
//  1. The Pages Function (functions/api/alexa.js), run here in Node: a request
//     is only accepted with a valid Amazon signature, an Amazon cert URL, an
//     in-date echo-api.amazon.com certificate, a fresh timestamp and OUR skill
//     id; the inbox write carries the phrase and a server timestamp only.
//  2. The page: an /inbox snapshot becomes grocery items — split, tidied,
//     categorised like a manual add, duplicate-safe across two devices,
//     tombstones respected, and no entry released for deletion if the local
//     save failed.

const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');

function loadFunction() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'api', 'alexa.js'), 'utf8');
  const code = src.replace(/^export /gm, '');
  return new Function(code + '\nreturn { onRequestPost, verifyAlexaRequest, certUrlOk, parseCertPem, cleanPhrase, writeInbox };')();
}

// ── A hand-built test certificate (DER), so no private key is ever committed.
// Only the parts the function reads are real; its outer signature is filler
// because the function does not re-verify the chain (see the file header).
function derLen(n) {
  if (n < 0x80) return Buffer.from([n]);
  const b = []; while (n) { b.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | b.length].concat(b));
}
function der(tag, ...parts) { const body = Buffer.concat(parts); return Buffer.concat([Buffer.from([tag]), derLen(body.length), body]); }
const SEQ = (...p) => der(0x30, ...p);
function utc(d) { return der(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z')); }
function makeCert(spkiDer, notBefore, notAfter, dnsName) {
  const algo = SEQ(der(0x06, Buffer.from('2a864886f70d01010b', 'hex')), der(0x05));
  const name = SEQ(der(0x31, SEQ(der(0x06, Buffer.from('550403', 'hex')), der(0x0c, Buffer.from('test')))));
  const san = SEQ(der(0x06, Buffer.from('551d11', 'hex')), der(0x04, SEQ(der(0x82, Buffer.from(dnsName)))));
  const tbs = SEQ(der(0xa0, der(0x02, Buffer.from([2]))), der(0x02, Buffer.from([1])), algo, name,
                  SEQ(utc(notBefore), utc(notAfter)), name, spkiDer, der(0xa3, SEQ(san)));
  const cert = SEQ(tbs, algo, der(0x03, Buffer.from([0, 1, 2, 3])));
  return '-----BEGIN CERTIFICATE-----\n' + cert.toString('base64').replace(/(.{64})/g, '$1\n') + '\n-----END CERTIFICATE-----\n';
}

function hdrs(o) { const m = new Map(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v])); return { get: k => m.has(k.toLowerCase()) ? m.get(k.toLowerCase()) : null }; }

module.exports = {
  name: '98-alexa-grocery',
  async run(page) {
    const pass = [], fail = [];
    function ok(name, cond, detail) { if (cond) pass.push(name); else fail.push({ name: name, detail: detail || 'assertion failed' }); }

    // ── 1. The function ─────────────────────────────────────────────────
    const F = loadFunction();
    const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const spki = publicKey.export({ type: 'spki', format: 'der' });
    const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);
    const day = 86400000;
    const CERT_URL = 'https://s3.amazonaws.com/echo.api/echo-api-cert-12.pem';
    const goodPem = makeCert(spki, new Date(NOW - day), new Date(NOW + day), 'echo-api.amazon.com');
    const pems = {
      [CERT_URL]: goodPem,
      'https://s3.amazonaws.com/echo.api/expired.pem': makeCert(spki, new Date(NOW - 3 * day), new Date(NOW - day), 'echo-api.amazon.com'),
      'https://s3.amazonaws.com/echo.api/wrongname.pem': makeCert(spki, new Date(NOW - day), new Date(NOW + day), 'example.com')
    };
    const certFetch = async (u) => pems[u] ? { ok: true, text: async () => pems[u] } : { ok: false };
    const env = { ALEXA_SKILL_ID: 'amzn1.ask.skill.test' };
    function reqBody(over) {
      return JSON.stringify(Object.assign({
        context: { System: { application: { applicationId: 'amzn1.ask.skill.test' } } },
        request: { type: 'IntentRequest', timestamp: new Date(NOW - 5000).toISOString(),
                   intent: { name: 'AddItemsIntent', slots: { items: { name: 'items', value: 'milk and eggs' } } } }
      }, over || {}));
    }
    function sign(body) { return nodeCrypto.sign('sha256', Buffer.from(body), privateKey).toString('base64'); }
    async function verify(body, h, e) {
      return F.verifyAlexaRequest(hdrs(h), body, e || env, NOW, certFetch);
    }

    const parsed = F.parseCertPem(goodPem);
    ok('cert: SAN names read', parsed.dnsNames.join() === 'echo-api.amazon.com', parsed.dnsNames.join());
    ok('cert: dates read', parsed.notBefore === Math.floor((NOW - day) / 1000) * 1000 && parsed.notAfter === NOW + day,
       parsed.notBefore + ' ' + parsed.notAfter);
    ok('cert: public key extracted byte-exact', Buffer.from(parsed.spki).equals(spki));

    const b = reqBody();
    let v = await verify(b, { SignatureCertChainUrl: CERT_URL, 'Signature-256': sign(b) });
    ok('verify: genuine request accepted', v.ok === true, JSON.stringify(v.why));
    v = await verify(b.replace('milk', 'beer'), { SignatureCertChainUrl: CERT_URL, 'Signature-256': sign(b) });
    ok('verify: tampered body rejected', !v.ok && v.why === 'signature', v.why);
    v = await verify(b, { SignatureCertChainUrl: CERT_URL });
    ok('verify: missing signature rejected', !v.ok, v.why);
    v = await verify(b, { SignatureCertChainUrl: CERT_URL, 'Signature-256': sign(b) }, { ALEXA_SKILL_ID: 'amzn1.ask.skill.other' });
    ok('verify: another skill id rejected', !v.ok && v.why === 'skill_id', v.why);
    v = await verify(b, { SignatureCertChainUrl: CERT_URL, 'Signature-256': sign(b) }, {});
    ok('verify: unconfigured skill id rejects everything', !v.ok && v.why === 'not_configured', v.why);
    const stale = reqBody({ request: { type: 'IntentRequest', timestamp: new Date(NOW - 200000).toISOString() } });
    v = await verify(stale, { SignatureCertChainUrl: CERT_URL, 'Signature-256': sign(stale) });
    ok('verify: request older than 150s rejected', !v.ok && v.why === 'timestamp', v.why);
    v = await verify(b, { SignatureCertChainUrl: 'https://s3.amazonaws.com/echo.api/expired.pem', 'Signature-256': sign(b) });
    ok('verify: expired cert rejected', !v.ok && v.why === 'cert_dates', v.why);
    v = await verify(b, { SignatureCertChainUrl: 'https://s3.amazonaws.com/echo.api/wrongname.pem', 'Signature-256': sign(b) });
    ok('verify: cert not for echo-api.amazon.com rejected', !v.ok && v.why === 'cert_name', v.why);

    ok('cert URL: Amazon path accepted', F.certUrlOk('https://S3.AMAZONAWS.COM/echo.api/x.pem') && F.certUrlOk('https://s3.amazonaws.com:443/echo.api/../echo.api/x.pem'));
    ok('cert URL: http rejected', !F.certUrlOk('http://s3.amazonaws.com/echo.api/x.pem'));
    ok('cert URL: other host rejected', !F.certUrlOk('https://evil.com/echo.api/x.pem') && !F.certUrlOk('https://s3.amazonaws.com.evil.com/echo.api/x.pem'));
    ok('cert URL: wrong path or port rejected', !F.certUrlOk('https://s3.amazonaws.com/EcHo.aPi/x.pem') &&
       !F.certUrlOk('https://s3.amazonaws.com/invalid.path/x.pem') && !F.certUrlOk('https://s3.amazonaws.com/echo.api/../x.pem') &&
       !F.certUrlOk('https://s3.amazonaws.com:563/echo.api/x.pem'));

    ok('phrase: trailing "to the shopping list" dropped', F.cleanPhrase('  milk and eggs to the shopping list. ') === 'milk and eggs');
    ok('phrase: capped at 300 characters', F.cleanPhrase('x'.repeat(500)).length === 300);

    // The inbox write: sign-in as the configured family login, then a POST of
    // the phrase with a SERVER timestamp, to /inbox of the configured household.
    const calls = [];
    const fbFetch = async (u, o) => {
      calls.push({ u, o });
      if (/signInWithPassword/.test(u)) return { ok: true, json: async () => ({ idToken: 'TOK', expiresIn: '3600' }) };
      return { ok: true };
    };
    const wenv = { HEARTH_FIREBASE_URL: 'https://x.firebaseio.com/', HEARTH_FIREBASE_KEY: 'k', HEARTH_USER: 'Cathal1',
                   HEARTH_PASSWORD: 'p', HEARTH_HOUSEHOLD: 'abc123' };
    await F.writeInbox(wenv, 'milk and eggs', fbFetch);
    const signIn = JSON.parse(calls[0].o.body), post = calls[1];
    ok('write: signs in as <user>@hearth.app', signIn.email === 'cathal1@hearth.app', signIn.email);
    ok('write: POSTs to the household inbox', post.o.method === 'POST' &&
       post.u === 'https://x.firebaseio.com/hearth/households/abc123/inbox.json?auth=TOK', post.u);
    const sent = JSON.parse(post.o.body);
    ok('write: phrase + server timestamp only', sent.text === 'milk and eggs' && sent.ts['.sv'] === 'timestamp' &&
       sent.src === 'alexa' && Object.keys(sent).length === 3, post.o.body);
    let threw = false;
    try { await F.writeInbox(Object.assign({}, wenv, { HEARTH_HOUSEHOLD: '../users' }), 'x', fbFetch); } catch (e) { threw = true; }
    ok('write: a household code with path characters is refused', threw);

    // ── 2. The page ─────────────────────────────────────────────────────
    const r = await page.evaluate(`(function(){
      var pass = [], fail = [];
      function ok(name, cond, detail){ if (cond) pass.push(name); else fail.push({name:name, detail:detail || 'assertion failed'}); }
      var realStoreSet = storeSet;
      try {
        listData.grocery = { items: [], hist: [] };
        storeSet('fl4_tomb_grocery', {});
        listData.grocery.items.push({ id: 5, name: 'Bread', catId: 'bakery', done: true, updated: 1, added: 1 });
        listData.grocery.items.push({ id: 6, name: 'Butter', catId: 'dairy', done: false, updated: 1, added: 1 });

        ok('parse: split and tidied', JSON.stringify(parseAlexaItems('some milk, eggs and a bag of apples to the shopping list'))
           === JSON.stringify(['Milk','Eggs','Bag of apples']), JSON.stringify(parseAlexaItems('some milk, eggs and a bag of apples to the shopping list')));

        var keys = applyAlexaInbox({
          '-b': { text: 'bread and butter', ts: 2000, src: 'alexa' },
          '-a': { text: 'milk and eggs', ts: 1000, src: 'alexa' },
          '-c': { nonsense: true }
        });
        ok('apply: every entry released for deletion, junk included', keys.join() === '-a,-b,-c', keys.join());
        var items = listData.grocery.items;
        function byName(n){ return items.filter(function(i){ return i.name === n; }); }
        var milk = byName('Milk')[0], eggs = byName('Eggs')[0];
        ok('apply: new items categorised like a manual add', milk && milk.catId === 'dairy' && eggs && eggs.catId === 'dairy',
           JSON.stringify(items));
        ok('apply: ids come from the server timestamp', milk.id === 1000 && eggs.id === 1001 && milk.updated === 1000,
           JSON.stringify(milk) + JSON.stringify(eggs));
        ok('apply: marked as added by Alexa', milk.addedBy === 'alexa' && milk.done === false);
        ok('apply: a ticked-off match moves back to the list', byName('Bread').length === 1 && byName('Bread')[0].done === false);
        ok('apply: an item already on the list is not duplicated', byName('Butter').length === 1);
        ok('apply: saved to storage', (storeGet(LIST_CONFIG.grocery.key).items || []).length === items.length);

        // A second device draining the same entry creates the same ids, so nothing doubles.
        var n = items.length;
        applyAlexaInbox({ '-a': { text: 'milk and eggs', ts: 1000 } });
        ok('apply: the same entry twice adds nothing', listData.grocery.items.length === n);

        // Deleted elsewhere before this device drained it → stays deleted.
        storeSet('fl4_tomb_grocery', { 3000: Date.now() });
        applyAlexaInbox({ '-d': { text: 'cheese', ts: 3000 } });
        ok('apply: a tombstoned id is not resurrected', byName('Cheese').length === 0 &&
           listData.grocery.items.filter(function(i){ return i.name === 'Cheese'; }).length === 0);

        // Local save fails → nothing released, so the entry stays in the inbox.
        storeSet = function(){ return false; };
        var k2 = applyAlexaInbox({ '-e': { text: 'yoghurt', ts: 4000 } });
        storeSet = realStoreSet;
        ok('apply: a failed save releases nothing', k2.length === 0, k2.join());

        ok('apply: empty inbox is a no-op', applyAlexaInbox(null).length === 0);
        ok('test build never drains the real inbox', alexaInboxReady() === false);
      } catch (e) { fail.push({ name: 'threw', detail: String(e && e.stack || e) }); }
      finally { storeSet = realStoreSet; }
      return { pass: pass, fail: fail };
    })()`);
    return { pass: pass.concat(r.pass), fail: fail.concat(r.fail) };
  }
};
