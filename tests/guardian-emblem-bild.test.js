'use strict';
// GUARDIAN-EMBLEMETS BILD SATTES ALDRIG.
//
// UPPMÄTT AV DAVID I DRIFT 2026-09-05: "bild på gardien kom inte upp men den kom upp" — emblemet
// tändes, men utan personens bild.
//
// Hela kedjan bar bilden ända fram, och varje led var grönt:
//   bryggan            profileImage vidarebefordrad 2 ms efter BARRAGE, giltig URL
//   guardian-session   skickar den vidare — provet "avsändarens profilbild följer med" är grönt
//   triggerGuardianEmblem   ...läste den aldrig
//
// Det är därför felet var svårt att se: varje prov på vägen mätte sitt eget led och passerade.
// Ingen mätte det SISTA ledet, där värdet faktiskt ska bli en bild på skärmen.
//
// TVÅ FALL, och det andra är det vanliga. geDel('avatar') ritar bara ett <img> när studions
// `guardianAvatar` är satt. En widget där streamern aldrig valt någon bild har alltså ett TOMT hål,
// och en ren `img.src`-tilldelning hade tigit i exakt det fallet.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

const BILD = 'https://p19-common-sign.tiktokcdn-eu.com/exempel/avatar.jpeg';

const widget = (over = {}) => Object.assign({
  id: 'ge1', type: 'templateGuardianEmblem', x: 10, y: 10, width: 400, height: 480,
  title: 'Guardian Emblem', guardianStep: 3, guardianUsername: '@Guardian'
}, over);

function rita(w) {
  const h = createDom({ state: { widgets: [w], projectName: 'g' } });
  h.load('overlay-sanitize.js');
  const box = h.paint([w]).querySelector(`[data-id="${w.id}"]`);
  return { h, box };
}

test('eventets profileImage blir emblemets bild — aven nar studion inte valt nagon', () => {
  const w = widget();                       // inget guardianAvatar => TOMT hal
  const { h, box } = rita(w);
  assert.equal(box.querySelector('.ge-avatar img'), null, 'forutsattningen: halet ar tomt');

  h.window.triggerGuardianEmblem({ username: '@Lisa', profileImage: BILD });

  const img = box.querySelector('.ge-avatar img');
  assert.ok(img, 'ingen bild ritades — det ar buggen David sag i drift');
  assert.match(img.getAttribute('src') || '', /tiktokcdn-eu\.com/, 'fel bild i halet');
});

test('eventets bild vinner over studions valda bild — alerten handlar om en PERSON', () => {
  // Samma regel som namnet: `guardianUsername` ar ett studioval, men en alert om en viss person ska
  // visa den personen. Annars firas Lisa med Omars ansikte.
  const w = widget({ guardianAvatar: 'assets/images/test-profile.svg' });
  const { h, box } = rita(w);
  assert.match(box.querySelector('.ge-avatar img').getAttribute('src'), /test-profile/,
    'forutsattningen: studions bild ligger i halet');

  h.window.triggerGuardianEmblem({ username: '@Lisa', profileImage: BILD });
  assert.match(box.querySelector('.ge-avatar img').getAttribute('src'), /tiktokcdn-eu\.com/,
    'studions platshallare blev kvar — emblemet visade fel person');
});

test('utan bild i eventet ror triggern inte studions val', () => {
  // En guardian utan avatar far inte TOMMA halet. Da hade en fungerande widget blivit sämre av att
  // ett event saknade ett falt.
  const w = widget({ guardianAvatar: 'assets/images/test-profile.svg' });
  const { h, box } = rita(w);
  h.window.triggerGuardianEmblem({ username: '@Lisa' });
  assert.match(box.querySelector('.ge-avatar img').getAttribute('src'), /test-profile/,
    'studions bild ska ligga kvar nar eventet inte bar nagon');
});

test('namnet skrivs fortfarande over — bildfixen far inte ha brutit det', () => {
  const { h, box } = rita(widget());
  h.window.triggerGuardianEmblem({ username: '@Lisa', profileImage: BILD });
  assert.equal(box.querySelector('.ge-namn').textContent, '@Lisa');
});
