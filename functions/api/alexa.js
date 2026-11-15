// Hearth Alexa skill endpoint (v525) — Cloudflare Pages Function at /api/alexa.
//
// "Alexa, tell Hearth to add milk and eggs." Alexa POSTs the request here; we
// check it really came from Amazon for OUR skill, then write the phrase to
//   /hearth/households/<code>/inbox/<push id> = { text, ts, src:"alexa" }
// The app (src/js/18b-alexa-inbox.js) splits it into items, sorts them into
// grocery categories and adds them to the list. ADD-ONLY: nothing here reads
// the list or writes anywhere else. Do NOT write into /shared instead — every
// device PUTs that whole document, so an item written there can be lost.
//
// THIS ROUTE IS OUTSIDE THE CLOUDFLARE ACCESS LOGIN (Alexa cannot sign in), via
// a Bypass application for this one path. What protects it instead, all of it
// required on every request:
//   1. Amazon's request signature (Signature-256 over the raw body, made with
//      the key in the certificate at SignatureCertChainUrl). The certificate
//      URL must be Amazon's own (https://s3.amazonaws.com/echo.api/…), the
//      certificate must be in date and name echo-api.amazon.com.
//   2. The request timestamp within 150 seconds (stops replays).
//   3. The skill id equal to the ALEXA_SKILL_ID secret.
// Limitation, on record: the certificate's chain up to Amazon's root CA is not
// re-verified here (no X.509 library in a zero-dependency function). The URL
// pin to Amazon's S3 path is what vouches for the certificate.
//
// Secrets (Pages → Settings → Variables and Secrets), none of them in this
// public repo: ALEXA_SKILL_ID, HEARTH_FIREBASE_URL (the database URL),
// HEARTH_FIREBASE_KEY (the web API key), HEARTH_USER + HEARTH_PASSWORD (one of
// the two family logins — the function signs in as that person),
// HEARTH_HOUSEHOLD (the household code).
//
// Plain JS, no packages, no imports (same zero-dependency rule as the app).

const MAX_SKEW_MS = 150 * 1000;
const MAX_TEXT = 300;

export async function onRequestPost(context) {
  const env = context.env || {};
  const request = context.request;
  const body = await request.text();

  const check = await verifyAlexaRequest(request.headers, body, env, Date.now());
  if (!check.ok) return new Response('Forbidden', { status: 400 });
  const req = check.json;
  const type = req.request && req.request.type;

  if (type === 'LaunchRequest') {
    return speak('What should I add to the grocery list? Say, add milk and eggs.', false);
  }
  if (type === 'SessionEndedRequest') return json({ version: '1.0', response: {} });
  if (type !== 'IntentRequest') return speak('Sorry, I can only add things to the grocery list.', true);

  const intent = req.request.intent || {};
  const name = intent.name;
  if (name === 'AMAZON.HelpIntent') {
    return speak('You can say, add milk and eggs. I put them on the Hearth grocery list.', false);
  }
  if (name === 'AMAZON.StopIntent' || name === 'AMAZON.CancelIntent' || name === 'AMAZON.NavigateHomeIntent') {
    return speak('Okay.', true);
  }
  if (name !== 'AddItemsIntent') {
    return speak('Sorry, I can only add things. Try, add milk and eggs.', false);
  }

  const raw = intent.slots && intent.slots.items && intent.slots.items.value;
  const text = cleanPhrase(raw);
  if (!text) return speak('What should I add?', false);

  try {
    await writeInbox(env, text);
  } catch (e) {
    return speak("Sorry, I couldn't reach Hearth just now. Please try again.", true);
  }
  return speak('Added ' + text + '.', true);
}

// Trim, cap, and drop a trailing "to the shopping list" so the reply reads well.
// The app does its own splitting and tidying; this is only what Alexa says back.
export function cleanPhrase(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ').trim()
    .replace(/[.!?]+$/, '')
    .replace(/\s+(?:to|on|onto|in)\s+(?:the|my|our)\s+(?:hearth\s+)?(?:grocery|groceries|shopping)?\s*list$/i, '')
    .slice(0, MAX_TEXT)
    .trim();
}

function speak(text, end) {
  const response = { outputSpeech: { type: 'PlainText', text: text }, shouldEndSession: !!end };
  if (!end) response.reprompt = { outputSpeech: { type: 'PlainText', text: 'What should I add?' } };
  return json({ version: '1.0', response: response });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json;charset=UTF-8', 'Cache-Control': 'no-store' }
  });
}

// ── Firebase ──────────────────────────────────────────────
let _tok = null; // { idToken, exp } — reused while this worker instance lives

async function firebaseToken(env, fetchFn) {
  if (_tok && _tok.exp > Date.now() + 60000) return _tok.idToken;
  const r = await fetchFn('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' +
    encodeURIComponent(String(env.HEARTH_FIREBASE_KEY || '')), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: String(env.HEARTH_USER || '').toLowerCase() + '@hearth.app',
                           password: String(env.HEARTH_PASSWORD || ''), returnSecureToken: true })
  });
  if (!r.ok) throw new Error('auth');
  const d = await r.json();
  _tok = { idToken: d.idToken, exp: Date.now() + (parseInt(d.expiresIn, 10) || 3600) * 1000 };
  return _tok.idToken;
}

export async function writeInbox(env, text, fetchFn) {
  fetchFn = fetchFn || fetch;
  const base = String(env.HEARTH_FIREBASE_URL || '').trim().replace(/\/+$/, '');
  const house = String(env.HEARTH_HOUSEHOLD || '').trim();
  if (!/^https:\/\//.test(base) || !house || /[.#$\[\]\/]/.test(house)) throw new Error('not_configured');
  const token = await firebaseToken(env, fetchFn);
  const r = await fetchFn(base + '/hearth/households/' + encodeURIComponent(house) + '/inbox.json?auth=' +
    encodeURIComponent(token), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text, ts: { '.sv': 'timestamp' }, src: 'alexa' })
  });
  if (!r.ok) { _tok = null; throw new Error('write'); }
}

// ── Alexa request verification ────────────────────────────
// Returns { ok:true, json } or { ok:false, why }. `fetchFn` and `now` are
// parameters so the tests can run it without the network.
export async function verifyAlexaRequest(headers, body, env, now, fetchFn) {
  fetchFn = fetchFn || fetch;
  const skillId = String(env.ALEXA_SKILL_ID || '').trim();
  if (!skillId) return { ok: false, why: 'not_configured' };

  const certUrl = headers.get('SignatureCertChainUrl') || '';
  const sig = headers.get('Signature-256') || '';
  if (!certUrlOk(certUrl)) return { ok: false, why: 'cert_url' };
  if (!sig) return { ok: false, why: 'no_signature' };

  let req;
  try { req = JSON.parse(body); } catch (e) { return { ok: false, why: 'json' }; }
  const appId = (req.context && req.context.System && req.context.System.application &&
                 req.context.System.application.applicationId) ||
                (req.session && req.session.application && req.session.application.applicationId) || '';
  if (appId !== skillId) return { ok: false, why: 'skill_id' };
  const ts = Date.parse(req.request && req.request.timestamp);
  if (!isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_MS) return { ok: false, why: 'timestamp' };

  let cert;
  try { cert = await leafCert(certUrl, fetchFn); } catch (e) { return { ok: false, why: 'cert_fetch' }; }
  if (!(cert.notBefore <= now && now <= cert.notAfter)) return { ok: false, why: 'cert_dates' };
  if (cert.dnsNames.indexOf('echo-api.amazon.com') === -1) return { ok: false, why: 'cert_name' };

  let good = false;
  try {
    const key = await crypto.subtle.importKey('spki', cert.spki,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    good = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64ToBytes(sig), new TextEncoder().encode(body));
  } catch (e) { good = false; }
  if (!good) return { ok: false, why: 'signature' };
  return { ok: true, json: req };
}

// Amazon's rule: https, host s3.amazonaws.com, port 443 if given, path starting
// /echo.api/ after resolving any "..".
export function certUrlOk(u) {
  let url;
  try { url = new URL(u); } catch (e) { return false; }
  if (url.protocol !== 'https:') return false;
  if (url.hostname.toLowerCase() !== 's3.amazonaws.com') return false;
  if (url.port && url.port !== '443') return false;
  return url.pathname.indexOf('/echo.api/') === 0;
}

const _certCache = new Map();
async function leafCert(certUrl, fetchFn) {
  const hit = _certCache.get(certUrl);
  if (hit) return hit;
  const r = await fetchFn(certUrl);
  if (!r.ok) throw new Error('cert');
  const cert = parseCertPem(await r.text());
  _certCache.set(certUrl, cert);
  return cert;
}

// ── Minimal X.509 reading: the FIRST certificate in a PEM chain ──
// Pulls out the public key (SubjectPublicKeyInfo, as raw DER for WebCrypto),
// the validity dates and the DNS names in subjectAltName. Nothing else.
export function parseCertPem(pem) {
  const m = /-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/.exec(String(pem || ''));
  if (!m) throw new Error('pem');
  const der = b64ToBytes(m[1].replace(/\s+/g, ''));
  const cert = tlv(der, 0);
  const tbs = tlv(der, cert.start);
  let p = tbs.start;
  let f = tlv(der, p);
  if (f.tag === 0xa0) { p = f.end; f = tlv(der, p); }   // [0] version
  p = f.end;                                            // serialNumber
  p = tlv(der, p).end;                                  // signature algorithm
  p = tlv(der, p).end;                                  // issuer
  const validity = tlv(der, p); p = validity.end;
  const nb = tlv(der, validity.start), na = tlv(der, nb.end);
  p = tlv(der, p).end;                                  // subject
  const spki = tlv(der, p); p = spki.end;
  const dnsNames = [];
  while (p < tbs.end) {
    const x = tlv(der, p); p = x.end;
    if (x.tag !== 0xa3) continue;                       // [3] extensions
    const exts = tlv(der, x.start);
    let q = exts.start;
    while (q < exts.end) {
      const ext = tlv(der, q); q = ext.end;
      const oid = tlv(der, ext.start);
      if (hex(der.subarray(oid.start, oid.end)) !== '551d11') continue; // 2.5.29.17 subjectAltName
      let r = oid.end, val = tlv(der, r);
      if (val.tag === 0x01) val = tlv(der, val.end);      // critical flag
      const names = tlv(der, val.start);
      let s = names.start;
      while (s < names.end) {
        const n = tlv(der, s); s = n.end;
        if (n.tag === 0x82) dnsNames.push(String.fromCharCode.apply(null, der.subarray(n.start, n.end)).toLowerCase());
      }
    }
  }
  return {
    spki: der.slice(spki.hdr, spki.end),
    notBefore: asn1Time(der, nb),
    notAfter: asn1Time(der, na),
    dnsNames: dnsNames
  };
}

function tlv(b, off) {
  if (off + 2 > b.length) throw new Error('der');
  const tag = b[off];
  let len = b[off + 1], p = off + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4) throw new Error('der');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + b[p + i];
    p += n;
  }
  if (p + len > b.length) throw new Error('der');
  return { tag: tag, hdr: off, start: p, end: p + len };
}

function asn1Time(b, t) {
  const s = String.fromCharCode.apply(null, b.subarray(t.start, t.end));
  let m;
  if (t.tag === 0x17 && (m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s))) {
    const y = +m[1] < 50 ? 2000 + +m[1] : 1900 + +m[1];
    return Date.UTC(y, +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  if (t.tag === 0x18 && (m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s))) {
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  throw new Error('time');
}

function hex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  return s;
}

function b64ToBytes(s) {
  const bin = atob(String(s).trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
