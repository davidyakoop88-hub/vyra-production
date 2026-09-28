#!/usr/bin/env node
'use strict';
/*
 * frame-import.js — importera-och-registrera-pipeline för widget-ramar.
 *
 * Tar en rambild (valfri stil: ornerad ring, glas-orb, geometrisk) på enfärgad
 * (oftast svart) bakgrund, klipper bort bakgrunden till transparent, beskär till
 * innehållet, hittar placeringsytan där profil/gåva ska sitta, sparar en transparent
 * PNG och registrerar ramen i ett manifest som widget-renderaren läser.
 *
 * Anv:
 *   node scripts/frame-import.js --src <bild> --name "Namn" [--slug s] [--shape circle|square] [--bg 38] [--out-dir dir] [--dry]
 *
 * Placeringen ("shape"):
 *   circle  — hittar ringens/orbens verkliga mitt (cx,cy) och innerradie (r) robust
 *             aven om ringen har en glugg (morfologisk stangning). Profilbilden
 *             centreras dar; renderaren skalar r mot visningsstorleken.
 *   square  — hittar den rektangulara oppningen (x,y,w,h) for fyrkantiga/romb-ramar.
 *
 * Skriver:
 *   <out-dir>/<slug>.png              transparent ram
 *   <out-dir>/frames.json             manifest { version, frames: { slug: {...} } }
 */
const fs = require('fs');
const path = require('path');
const jimpMod = require('jimp');
const Jimp = jimpMod.read ? jimpMod : (jimpMod.Jimp || jimpMod.default || jimpMod);

function parseArgs(argv) {
  const a = { shape: 'circle', bg: 38, outDir: path.join('assets', 'topstreak-frames'), dry: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--dry') { a.dry = true; continue; }
    const v = argv[++i];
    if (k === '--src') a.src = v;
    else if (k === '--name') a.name = v;
    else if (k === '--slug') a.slug = v;
    else if (k === '--shape') a.shape = v;
    else if (k === '--bg') a.bg = parseInt(v, 10);
    else if (k === '--out-dir') a.outDir = v;
    else throw new Error('Okänd flagga: ' + k);
  }
  if (!a.src) throw new Error('--src <bild> krävs');
  if (!a.name && !a.slug) throw new Error('--name "Namn" (eller --slug) krävs');
  a.slug = a.slug || slugify(a.name);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(a.slug)) throw new Error('Ogiltig slug: ' + a.slug);
  if (a.shape !== 'circle' && a.shape !== 'square') throw new Error('--shape måste vara circle eller square');
  return a;
}

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[åäà]/g, 'a').replace(/[öø]/g, 'o').replace(/[é]/g, 'e')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Flood-filla enfärgad (nära-svart) bakgrund fran kanter + mitt -> alpha 0.
function removeBackground(d, W, H, bg) {
  const maxCh = i => Math.max(d[i], d[i + 1], d[i + 2]);
  const seen = new Uint8Array(W * H), st = [];
  const push = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const p = y * W + x; if (seen[p]) return; if (maxCh(p * 4) > bg) return; seen[p] = 1; st.push(p); };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  push(W >> 1, H >> 1);
  let removed = 0;
  while (st.length) { const p = st.pop(); d[p * 4 + 3] = 0; removed++; const x = p % W, y = (p - x) / W; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  return removed;
}

function contentBBox(d, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  return { x0, y0, x1, y1 };
}

function dilate(src, W, H, D) {
  let cur = src;
  for (let it = 0; it < D; it++) {
    const nx = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (cur[p]) { nx[p] = 1; continue; }
      if ((x > 0 && cur[p - 1]) || (x < W - 1 && cur[p + 1]) || (y > 0 && cur[p - W]) || (y < H - 1 && cur[p + W])) nx[p] = 1;
    }
    cur = nx;
  }
  return cur;
}

// Ringens/orbens verkliga mitt + innerradie, robust mot en glugg i ringen:
// tata forst opaka pixlar (dilation) sa insidan blir innesluten, floda sedan insidan.
function detectCircle(d, W, H) {
  const op = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) op[i] = d[i * 4 + 3] > 25 ? 1 : 0;
  for (let D = 8; D <= 60; D += 6) {
    const cur = dilate(op, W, H, D);
    const inte = new Uint8Array(W * H), st = [];
    const push = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const p = y * W + x; if (inte[p] || cur[p]) return; inte[p] = 1; st.push(p); };
    push(W >> 1, H >> 1);
    let x0 = W, y0 = H, x1 = 0, y1 = 0, leak = false, nn = 0;
    while (st.length) { const p = st.pop(); const x = p % W, y = (p - x) / W; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) leak = true; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; nn++; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
    if (!leak && nn > 500) {
      return { cx: Math.round((x0 + x1) / 2), cy: Math.round((y0 + y1) / 2), r: Math.round(Math.min(x1 - x0, y1 - y0) / 2 + D), D };
    }
  }
  // Fallback: bildmitt + 40% av minsta sidan.
  return { cx: W >> 1, cy: H >> 1, r: Math.round(Math.min(W, H) * 0.4), D: 0 };
}

// Rektangular oppning for fyrkant/romb-ramar: floda innerhalet fran mitten.
function detectSquare(d, W, H) {
  const op = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) op[i] = d[i * 4 + 3] > 25 ? 1 : 0;
  for (let D = 8; D <= 60; D += 6) {
    const cur = dilate(op, W, H, D);
    const inte = new Uint8Array(W * H), st = [];
    const push = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const p = y * W + x; if (inte[p] || cur[p]) return; inte[p] = 1; st.push(p); };
    push(W >> 1, H >> 1);
    let x0 = W, y0 = H, x1 = 0, y1 = 0, leak = false, nn = 0;
    while (st.length) { const p = st.pop(); const x = p % W, y = (p - x) / W; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) leak = true; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; nn++; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
    if (!leak && nn > 500) {
      return { x: Math.max(0, x0 - D), y: Math.max(0, y0 - D), w: (x1 - x0) + 2 * D, h: (y1 - y0) + 2 * D, D };
    }
  }
  return { x: Math.round(W * 0.15), y: Math.round(H * 0.15), w: Math.round(W * 0.7), h: Math.round(H * 0.7), D: 0 };
}

function readManifest(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { version: 1, frames: {} }; }
}

async function main() {
  const a = parseArgs(process.argv);
  const img = await Jimp.read(a.src);
  let d = img.bitmap.data, W = img.bitmap.width, H = img.bitmap.height;

  const removed = removeBackground(d, W, H, a.bg);
  const origPx = W * H;
  const bb = contentBBox(d, W, H);
  if (bb.x1 < bb.x0) throw new Error('Ingen kvarvarande bild efter urklippning — höj --bg eller kontrollera bilden');
  const pad = 6;
  const x0 = Math.max(0, bb.x0 - pad), y0 = Math.max(0, bb.y0 - pad);
  const cw = Math.min(W - 1, bb.x1 + pad) - x0 + 1, ch = Math.min(H - 1, bb.y1 + pad) - y0 + 1;
  img.crop(x0, y0, cw, ch);
  d = img.bitmap.data; W = cw; H = ch;

  const placement = a.shape === 'square' ? detectSquare(d, W, H) : detectCircle(d, W, H);

  const entry = { name: a.name || a.slug, file: a.slug + '.png', w: W, h: H, shape: a.shape, placement };
  const outPng = path.join(a.outDir, a.slug + '.png');
  const manFile = path.join(a.outDir, 'frames.json');

  if (a.dry) {
    console.log('[dry] skulle skriva', outPng, JSON.stringify(entry));
    return;
  }
  fs.mkdirSync(a.outDir, { recursive: true });
  await img.writeAsync(outPng);
  const man = readManifest(manFile);
  man.version = man.version || 1;
  man.frames = man.frames || {};
  man.frames[a.slug] = entry;
  fs.writeFileSync(manFile, JSON.stringify(man, null, 2) + '\n');

  console.log(`Importerad: ${a.slug}  ${W}x${H}  shape=${a.shape}  ${a.shape === 'square' ? JSON.stringify(placement) : `mitt(${placement.cx},${placement.cy}) r=${placement.r}`}  (borttaget ${(removed / origPx * 100).toFixed(1)}%)`);
  console.log(`  -> ${outPng}`);
  console.log(`  -> ${manFile} (${Object.keys(man.frames).length} ramar registrerade)`);
}

if (require.main === module) {
  main().catch(e => { console.error('FEL:', e.message); process.exit(1); });
}

module.exports = { slugify, removeBackground, contentBBox, detectCircle, detectSquare };
