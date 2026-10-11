'use strict';
// GOAL PRO: MARKÖRENS ETIKETT STANNAR INOM RUTAN (2026-10-11).
//
// Davids granskning "kontrollera alla att det design all 100%": vid 100 % klipptes Pill-designens
// etikett "100%" av widgetens högerkant. Etiketten är centrerad på huvudet (translateX(-50%)), så i
// radens ände stack halva utanför. Samma mönster i Rak bar, Steg och Bara siffra.
//
// Kontraktet: alla fyra bindningarna går via klamp(), som håller etikettens centrum inom
// [halva etikettbredden, radbredd − halva etikettbredden].
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'playground-widgets.js'), 'utf8');

test('klamp() finns och håller centrum inom raden', () => {
  assert.match(src, /const klamp=\(mk,row,x\)=>\{const b=\(mk&&mk\.offsetWidth\)\|\|0;return Math\.min\(Math\.max\(x,b\/2\),Math\.max\(b\/2,row\.clientWidth-b\/2\)\)\}/);
});

test('Rak bar/Pill, Steg och Bara siffra placerar etiketten via klamp()', () => {
  assert.match(src, /mk\.style\.left=klamp\(mk,row,x\)\+"px"/, 'barFx (Rak bar + Pill)');
  assert.match(src, /mk5\.style\.left=klamp\(mk5,row5,headX5\(\)\)\+"px"/, 'Steg');
  assert.match(src, /mk6\.style\.left=klamp\(mk6,row6,x\)\+"px"/, 'Bara siffra');
  // Huvudet (pricken) följer fortfarande fyllningen exakt — det är bara etiketten som klämms.
  assert.match(src, /head\.style\.left=x\+"px";mk\.style\.left=klamp/);
});
