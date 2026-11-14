#!/usr/bin/env node
// Hearth build — stitches src/ into the ONE shipped file, index.html.
//
//   node build.js            writes index.html at the repo root (commit it)
//   node build.js <path>     writes there instead (tests/checks.sh uses this
//                            to prove the committed index.html is current)
//
// src/index.html is the page with each stylesheet/script body replaced by a
// marker line:  <!--@include js/01-core.js-->  — the marker LINE is swapped
// for the file's exact bytes. Nothing is added, trimmed or reordered, so a
// pure cut rebuilds byte-identically. Do NOT add banners, minify, or join
// with extra newlines here: the build-match check would pass (it compares
// against this script's own output) but every diff would stop meaning
// "what changed in the app".
//
// Order = the order of the markers in src/index.html. The build FAILS if a
// marker names a missing file, a file is included twice, or a file under
// src/css or src/js is never included (a forgotten file is silently-missing
// code on the phone, never a visible error).
//
// Plain Node, no packages. Do not convert the app to ES modules or serve
// these files separately — see docs/HEARTH-notes.md § Source split.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const MARKER = /^<!--@include ([a-z0-9][a-z0-9._\/-]*)-->$/;

function fail(msg) { console.error('build.js: ' + msg); process.exit(1); }

const page = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const seen = new Set();
const out = page.split('\n').map(function (line) {
  const m = MARKER.exec(line);
  if (!m) return line;
  const rel = m[1];
  if (seen.has(rel)) fail('src/' + rel + ' is included twice');
  seen.add(rel);
  const file = path.join(SRC, rel);
  if (!fs.existsSync(file)) fail('marker names src/' + rel + ', which does not exist');
  const body = fs.readFileSync(file, 'utf8');
  if (!body.endsWith('\n')) fail('src/' + rel + ' must end with a newline');
  return body.slice(0, -1); // the join below puts the marker line's newline back
});

for (const dir of ['css', 'js']) {
  for (const f of fs.readdirSync(path.join(SRC, dir))) {
    if (!seen.has(dir + '/' + f)) fail('src/' + dir + '/' + f + ' is never included — add a marker for it to src/index.html');
  }
}

const dest = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'index.html');
fs.writeFileSync(dest, out.join('\n'));
console.log('built ' + path.relative(process.cwd(), dest) + ' from ' + seen.size + ' files');
