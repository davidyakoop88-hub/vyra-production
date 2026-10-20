'use strict';
// EN TESTAVATAR FÖR ALLA FAMILJER (David 2026-10-11: "jag vill alla ska använda en avatar test bild").
//
// Uppmätt i overlay med tittare utan foto: Top Like/Coins/Points, Top Gift, follower alert m.fl.
// visade den lila silhuetten assets/images/test-profile.svg — men Top Gifter Podium, Top Streak Flip
// och Goal Pro:s bidragsrader ritade första bokstaven på en färgad cirkel, Last X visade initialen,
// och premium-Top Gift, det globala bildfelsnätet och fyrverkeriets testknapp pekade på en gammal
// PNG (assets/images/test/test-profile.png). Samma overlay, fyra olika reserver.
//
// Kontraktet: EN reservbild, test-profile.svg, överallt där en tittare saknar foto.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const TA = 'assets/images/test-profile.svg';

test('reservbilden finns och är SVG-silhuetten', () => {
  assert.ok(fs.existsSync(path.join(ROOT, TA)));
  assert.match(las(TA), /aria-label="Standardprofil"/);
});

test('playground-familjerna ritar testavataren, aldrig en bokstav', () => {
  const src = las('playground-widgets.js');
  assert.match(src, /const TESTAVATAR="assets\/images\/test-profile\.svg"/);
  // podium, streak-flip och bidragsraderna
  assert.match(src, /av\.style\.background="url\('"\+\(pimg\|\|TESTAVATAR\)\+"'\) center\/cover"/, 'podiet');
  assert.match(src, /fa\.style\.background="url\('"\+\(\(t\.user&&t\.img\)\|\|TESTAVATAR\)\+"'\) center\/cover"/, 'streak-flippen');
  assert.match(src, /JSON\.stringify\(e\.avatar\|\|TESTAVATAR\)/, 'bidragsraderna');
  assert.doesNotMatch(src, /\[0\]\.toUpperCase\(\)/, 'ingen initial som avatar');
});

test('Last X faller tillbaka på samma bild i stället för initialen', () => {
  assert.match(las('last-x-alerts.js'), /const profileImage = remembered\?\.avatar \|\| w\.profileImage \|\| TESTAVATAR;/);
});

test('ingen klientfil pekar längre på den gamla PNG:n som profilreserv', () => {
  const filer = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && f !== 'agency-test.js');
  const kvar = filer.filter(f => las(f).includes('assets/images/test/test-profile.png'));
  assert.deepEqual(kvar, [], 'pekar fortfarande på test/test-profile.png');
  for (const f of ['premium-final.js', 'runtime-controls.js', 'gift-fireworks.js']) assert.ok(las(f).includes(TA), f);
});

test('cachebustarna höjdes med filerna', () => {
  const media = las('media.js'), html = las('studio.html');
  assert.match(media, /const version='20261020-14'/, 'premiumbunten (premium-final, runtime-controls)');
  assert.match(media, /playground-widgets\.js\?v=20261020-14/);
  assert.match(media, /playground-widgets\.css\?v=20261020-14/, 'streak-pillens siffra');
  assert.match(las('playground-widgets.css'), /\.stk-pill b\{[^}]*font:800 44px\/1 var\(--font\)\}/);
  assert.match(media, /last-x-alerts\.js\?v=20261020-9/);  // 20261020-9: svenska standardmeddelanden
  assert.match(media, /gift-fireworks\.js\?v=20261019-1/);  // 20261019-1: fwSpelaPa (PR 12)
  assert.match(html, /media\.js\?v=20261020-14/);
});
