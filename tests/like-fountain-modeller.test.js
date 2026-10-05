'use strict';
// LIKE FOUNTAIN · TIO MODELLER (2026-10-05).
//
// Granskningen av första utkastet (Codex, efter BetterTok): modellerna skilde sig "främst genom
// färg och partikelutseende", fontänen låg för långt till höger, profilbilderna var för små och
// strömmen loopade i OBS oavsett om någon tappade. Proven här låser kontraktet; rörelsen och
// avstånden är uppmätta i Chromium (se PR-beskrivningen), inte här.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const media = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'studio.css'), 'utf8');

const MODELLER = ['classic', 'sakuraFall', 'neonPulse', 'goldRush', 'pixelArcade', 'galaxyDrift', 'bubblePop', 'ghostHearts', 'plasmaCore', 'origami'];
const presetRad = media.split(/\r?\n/).find(l => l.startsWith('const LIKE_FOUNTAIN_PRESETS={'));

test('tio modeller, och var och en har sin EGEN rörelse', () => {
  assert.ok(presetRad, 'LIKE_FOUNTAIN_PRESETS saknas');
  const rorelser = MODELLER.map(k => {
    const m = presetRad.match(new RegExp(k + ":\\{[^}]*motion:'([a-z]+)'"));
    assert.ok(m, `${k} saknas eller saknar motion`);
    return m[1];
  });
  assert.equal(new Set(rorelser).size, 10, 'två modeller delar rörelse: ' + rorelser.join(', '));
  for (const r of rorelser) assert.match(media, new RegExp(`\\b${r}:\\{name:'`), `rörelsen ${r} finns inte i LIKE_FOUNTAIN_MOTIONS`);
});

test('varje ny rörelse har egna keyframes, inte bara en färg', () => {
  for (const [rorelse, kf] of [['pulse', 'lfHeartBeat'], ['pixel', 'lfPixelRise'], ['bubble', 'lfBubbleRise'], ['ghost', 'lfGhostRise'], ['flip', 'lfHeartFlip']]) {
    assert.match(css, new RegExp(`\\.lf-motion-${rorelse} \\.lf-p-heart\\{animation-name:[^}]*${kf}`), `${rorelse} använder inte ${kf}`);
    assert.match(css, new RegExp(`@keyframes ${kf}\\{`), `${kf} saknas`);
  }
});

test('tätheten stannar på 12–28 hjärtan, aldrig 80', () => {
  assert.match(media, /w\.fountainCount=Math\.round\(12\+p\.heartDensity\*16\)/);
  for (const m of presetRad.matchAll(/heartDensity:([\d.]+)/g)) assert.ok(+m[1] <= 1, 'heartDensity över 1 ger fler än 28');
});

test('profilbilden är större än hjärtat och har ring och skyddszon', () => {
  const rad = css.match(/\.lf-p-heart-avatar-img\{[^}]*\}/)[0];
  const k = +rad.match(/width:calc\(var\(--sz,20px\) \* ([\d.]+)\)/)[1];
  assert.ok(k >= 1.2, `profilbilden är ${k} av hjärtat — granskningen bad om 30–50 % större än förut (0,92)`);
  assert.match(rad, /padding:2px/, 'skyddszonen mellan ansikte och ring saknas');
  assert.match(rad, /border:2\.5px solid/, 'ringen saknas');
});

test('i OBS syns bara hjärtan som en like släppt', () => {
  // !important: modellernas egna display (Bubble Pop: display:grid, (0,4,1)) slog annars döljningen
  // (0,4,0), och Bubble Pops förhandsström rullade i OBS fast ingen tappade (uppmätt i OBS 2026-10-05).
  assert.match(css, /\.overlay-output \.like-fountain \.lf-p:not\(\.lf-live\)\{display:none!important\}/);
  assert.match(media, /triggerLikeFountainPop=function\(event=\{\}\)\{try\{lfSlappLikes\(event\)\}/);
  assert.match(media, /fountainMaxAvatars\|\|4/, 'taket för profilbilder samtidigt saknas');
  assert.match(media, /fountainStarLikes\|\|25/, 'stjärnläget saknas');
  assert.match(css, /\.lf-p-heart\.lf-star \.lf-p-heart-avatar-img\{/);
});
