'use strict';
// FOLLOWER ALERT: EVENTDATA FAR INTE BLI WIDGETENS KONFIGURATION (#353).
//
// Triggern skrev tidigare eventets namn och bild in i widgetobjektet och sparade det. Det gjorde
// tva saker samtidigt: streamerns egen text forsvann, och testknappen — som bygger sin nyttolast
// ur just de falten — visade FORRA foljaren nasta gang den trycktes.
//
// Prov 2 nedan ar det som faller pa den gamla koden. Prov 1 ar vakten mot att skrivningen smyger
// tillbaka: utan den kan man "fixa" symptomet i DOM:en och anda lamna kvar mutationen av `w`.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);

const KONFIG = 'KonfigureratNamn';
const SKARP = 'SkarpFoljare';

function rigg() {
  const w = {
    id: 'fa1', type: 'templateFollowerAlert', x: 0, y: 0, width: 300,
    followName: KONFIG, profileImage: 'assets/images/test-profile.svg', followDuration: 6
  };
  const h = createDom({ state: { widgets: [w], projectName: 'follower-residy' } });
  h.load('overlay-sanitize.js');
  const box = h.paint([w]).querySelector(`[data-id="${w.id}"]`);
  // `state` deklareras med const i ett klassiskt skript och hamnar i den globala LEXIKALA miljon,
  // inte som en egenskap pa window — se filhuvudet i dom-harness.js. Den lasas darfor inifran
  // sidan och skickas ut via en window-egenskap.
  const las = falt => {
    const s = h.document.createElement('script');
    s.textContent = `window.__las = (state.widgets.find(x => x.id === 'fa1') || {})[${JSON.stringify(falt)}]`;
    h.document.body.append(s);
    return h.window.__las;
  };
  return { h, box, las, namn: () => box.querySelector('h2').textContent };
}

test('ett skarpt event malas i DOM:en men skrivs ALDRIG in i widgeten', () => {
  const { h, box, las, namn } = rigg();

  h.window.triggerNewFollower({ name: SKARP, profileImage: 'https://example.invalid/skarp.png' });

  assert.equal(namn(), SKARP, 'DOM ska visa den skarpa foljaren');
  assert.ok(box.classList.contains('follow-active'), 'alerten ska tandas');

  // Karnan i #353: konfigurationen ar orord.
  assert.equal(las('followName'), KONFIG,
    'w.followName skrevs over av eventet — streamerns egen text ar da borta for gott');
  assert.equal(las('profileImage'), 'assets/images/test-profile.svg',
    'w.profileImage skrevs over av eventet');
});

test('testknappen efter ett skarpt event visar KONFIGURATIONEN, inte forra foljaren', () => {
  const { h, las, namn } = rigg();

  // 1. En skarp foljare passerar.
  h.window.triggerNewFollower({ name: SKARP, profileImage: 'https://example.invalid/skarp.png' });
  assert.equal(namn(), SKARP);

  // 2. Streamern trycker testknappen. Den bygger sin nyttolast ur widgeten — exakt sa som
  //    media.js bind() gor: triggerNewFollower({name: w.followName, profileImage: w.profileImage}).
  h.window.triggerNewFollower({ name: las('followName'), profileImage: las('profileImage') });

  // PA DEN GAMLA KODEN star det SKARP har: eventet hade skrivit residyn till w, sa knappen
  // skickade tillbaka den och visade forra foljaren under testnamnet.
  assert.equal(namn(), KONFIG,
    'testknappen visar forra foljarens namn — residyn lever kvar i w');
});

test('utan varden faller malningen tillbaka pa renderarens egna reservvarden', () => {
  // Inte tom strang: followerAlertHtml ritar VyraSafe.text(w.followName,'Aurora Vale'), och en
  // malning som lamnade rubriken tom hade infort en NY avvikelse i stallet for att ta bort en.
  const w = { id: 'fa2', type: 'templateFollowerAlert', x: 0, y: 0, width: 300 };
  const h = createDom({ state: { widgets: [w], projectName: 'follower-reserv' } });
  h.load('overlay-sanitize.js');
  const box = h.paint([w]).querySelector('[data-id="fa2"]');

  h.window.triggerNewFollower({});

  assert.equal(box.querySelector('h2').textContent, 'Aurora Vale');
  assert.match(box.querySelector('.follow-avatar img').getAttribute('src'),
    /test-profile\.svg$/);
});
