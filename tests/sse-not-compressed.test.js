'use strict';
// Event-strommen far inte komprimeras.
//
// UPPMATT MOT PRODUKTION 2026-08-06, samma URL, enda skillnaden Accept-Encoding:
//
//   identity  ->  200, text/event-stream, 636 byte inom 8 sekunder
//   gzip      ->  0 byte, inga headers alls
//
// `encode zstd gzip` i Caddyfile komprimerade allt, aven text/event-stream. Komprimering samlar
// byte innan den skickar, och en handelsestrom skickar sallan nog for att fylla bufferten. Foljden:
// overlayn fick aldrig ett enda event i produktion. Klienten sag 502 pa
// /api/overlay-access/.../events/stream, och det gick inte att skilja fran "servern ar nere".
//
// Servern gjorde redan sitt. openEventStream() satter x-accel-buffering: no och anropar
// res.flushHeaders() uttryckligen, med en kommentar som beskriver exakt det har problemet — men det
// hjalper inte mot en komprimerare i vagen.
//
// ROTT NU: encode har ingen matchare och tar darfor aven strommen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CADDY = las('Caddyfile');

test('encode har en matchare', () => {
  const rad = CADDY.split('\n').find(l => /^\s*encode\s/.test(l)) || '';
  assert.ok(rad, 'encode-direktivet hittades inte');
  assert.match(rad, /encode\s+@\w+/,
    `encode komprimerar allt, aven event-strommen: "${rad.trim()}"`);
});

test('matcharen utesluter event-strommen', () => {
  const namn = (CADDY.match(/^\s*encode\s+@(\w+)/m) || [, ''])[1];
  assert.ok(namn, 'ingen namngiven matchare pa encode');
  const def = CADDY.split('\n').find(l => new RegExp(`^\\s*@${namn}\\s`).test(l)) || '';
  assert.match(def, /\bnot\b/, `matcharen ${namn} utesluter ingenting: "${def.trim()}"`);
  assert.match(def, /events\/stream/,
    `matcharen ${namn} namner inte event-strommen: "${def.trim()}"`);
});

test('komprimeringen ar kvar for allt annat', () => {
  // Att stanga av encode helt hade varit en overreaktion — sidan och skripten tjanar pa gzip.
  const rad = CADDY.split('\n').find(l => /^\s*encode\s/.test(l)) || '';
  assert.match(rad, /zstd/, 'zstd togs bort');
  assert.match(rad, /gzip/, 'gzip togs bort');
});

test('servern gor fortfarande sin del', () => {
  // Bada behovs. Faller nagon av dem tillbaka ar strommen dod igen, och nasta person kommer att
  // felsoka fel lager — precis som 502:an fick det att se ut som att servern var nere.
  const server = las('server/index.js');
  assert.match(server, /'x-accel-buffering':\s*'no'/, 'servern slutade be proxyn att inte buffra');
  assert.match(server, /res\.flushHeaders\(\)/,
    'headers flushas inte langre — klienten kan inte se att anslutningen ar oppen');
});

test('SSE-rutten ser ut som matcharen tror', () => {
  // Andras rutten men inte matcharen komprimeras strommen igen, tyst.
  assert.match(las('server/index.js'), /overlay-access[^\n]*events\\?\/stream/,
    'sokvagen till event-strommen ser inte ut som matcharen forutsatter');
});
