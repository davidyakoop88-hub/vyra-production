'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { slugify, removeBackground, contentBBox, detectCircle, detectSquare } = require('../scripts/frame-import.js');

// Bygger en syntetisk RGBA-bild: svart bakgrund + en opak ring (band r0..r1) runt mitten.
function ringImage(W, H, cx, cy, r0, r1) {
  const d = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) d[i * 4 + 3] = 255; // allt opakt svart
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dist = Math.hypot(x - cx, y - cy);
    if (dist >= r0 && dist <= r1) { const p = (y * W + x) * 4; d[p] = 255; d[p + 1] = 255; d[p + 2] = 255; }
  }
  return d;
}

test('slugify normaliserar namn', () => {
  assert.equal(slugify('Fire Dragon'), 'fire-dragon');
  assert.equal(slugify('Åska & Is!!'), 'aska-is');
  assert.equal(slugify('  Neon  Pulse  '), 'neon-pulse');
});

test('removeBackground tar bort svart bakgrund + mitthål men behåller ringen', () => {
  const W = 140, H = 140, cx = 70, cy = 70;
  const d = ringImage(W, H, cx, cy, 44, 52);
  const removed = removeBackground(d, W, H, 38);
  assert.ok(removed > 0, 'något ska tas bort');
  assert.equal(d[(cy * W + cx) * 4 + 3], 0, 'mitten ska bli transparent');
  assert.equal(d[(2 * W + 2) * 4 + 3], 0, 'hörnet (yttre bakgrund) ska bli transparent');
  assert.equal(d[(cy * W + (cx + 48)) * 4 + 3], 255, 'ringpixeln ska vara kvar (opak)');
});

test('detectCircle hittar ringens mitt och en rimlig radie', () => {
  const W = 160, H = 160, cx = 84, cy = 76; // avsiktligt off-center
  const d = ringImage(W, H, cx, cy, 50, 58);
  removeBackground(d, W, H, 38);
  const c = detectCircle(d, W, H);
  assert.ok(Math.abs(c.cx - cx) <= 5, 'cx nära ' + cx + ': ' + JSON.stringify(c));
  assert.ok(Math.abs(c.cy - cy) <= 5, 'cy nära ' + cy + ': ' + JSON.stringify(c));
  assert.ok(c.r >= 40 && c.r <= 58, 'radie inom ringens inre: ' + c.r);
});

test('detectCircle klarar en ring med glugg (öppen upptill)', () => {
  const W = 160, H = 160, cx = 80, cy = 80;
  const d = ringImage(W, H, cx, cy, 50, 58);
  // klipp en glugg i ringen upptill (gör ett segment transparent)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ang = Math.atan2(y - cy, x - cx);
    if (Math.abs(ang + Math.PI / 2) < 0.28) { const p = (y * W + x) * 4; d[p + 3] = 0; }
  }
  removeBackground(d, W, H, 38);
  const c = detectCircle(d, W, H);
  assert.ok(Math.abs(c.cx - cx) <= 8 && Math.abs(c.cy - cy) <= 8, 'mitt hittad trots glugg: ' + JSON.stringify(c));
});

test('contentBBox ramar in innehållet', () => {
  const W = 100, H = 100;
  const d = new Uint8Array(W * H * 4); // helt transparent
  const set = (x, y) => { const p = (y * W + x) * 4; d[p + 3] = 255; };
  set(20, 30); set(70, 80);
  const bb = contentBBox(d, W, H);
  assert.deepEqual([bb.x0, bb.y0, bb.x1, bb.y1], [20, 30, 70, 80]);
});
