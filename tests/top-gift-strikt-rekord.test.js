'use strict';
// TOP GIFT: STRIKT STÖRRE BYTER PERSON, NAMNET FÖLJER BILDEN, INGEN SPARNING PER GÅVA.
//
// Uppmätt 2026-10-18 i Edge mot studio.html?overlay=1, Heart Me (1 coin) först från maryovela och
// sedan från javisst26:
//   1. live-leaderboard.js släppte igenom en gåva LIKA stor som rekordet (`value < giftCoins` ⇒
//      hoppa över), medan gift-event-images.js räknade strikt. Två skrivare, två regler.
//   2. Namnet söktes med ':scope > strong', som inte finns i neon, royal eller fokus. Bilden byttes
//      till javisst26, namnet stod kvar på maryovela.
//   3. updateTopGift gjorde save() för varje gåva — i overlayn en ny konfiguration och en hel
//      render() per gåva, widgetar som blinkade.
//
// Proven kör båda skrivarna i sidans laddordning (gift-event-images.js före live-leaderboard.js) mot
// de riktiga renderarna för alla tre designerna.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

const DESIGNER = ['neon', 'royal', 'fokus'];
const MARY = 'https://p16-sign.tiktokcdn.com/mary.webp';
const JAVISST = 'https://p16-sign.tiktokcdn.com/javisst.webp';
const HEART_ME = 'https://p16-webcast.tiktokcdn.com/heart-me.png';

function boot(theme, { url = 'https://vyralive.app/studio.html?overlay=1', rafKo = null, fore = null } = {}) {
  const w = { id: 'tg-' + theme, type: 'templateTopGift', theme, x: 10, y: 20, width: 340,
    dataName: '@StreamQueen', dataValue: 0, profileImage: '' };
  const h = createDom({ url, state: { widgets: [w], projectName: 'test' } });
  // Utan fetch kastar live-leaderboard.js vid laddning och dess lyssnare registreras aldrig.
  h.window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  // Utan rAF patchar gift-event-images.js direkt — samma väg som en dold flik. Med en kö (rafKo)
  // väntar dess patch till nästa bildruta, som i en synlig OBS-källa.
  h.window.requestAnimationFrame = rafKo ? fn => { rafKo.push(fn); return rafKo.length } : undefined;
  // jsdom rapporterar document.hidden = true, och då patchar gift-event-images.js direkt ändå.
  if (rafKo) Object.defineProperty(h.document, 'hidden', { configurable: true, get: () => false });

  // save() i studio.js är en const och kan inte bytas ut. Den anropar alltid VyraHistorik.notera()
  // och VyraSessionState.writeActive() — båda räknas, så ett save() kan inte passera osett.
  const rakna = { save: 0, write: 0 };
  h.window.VyraHistorik = { notera() { rakna.save++ } };
  const skriv = h.window.VyraSessionState.writeActive;
  h.window.VyraSessionState.writeActive = function () { rakna.write++; return skriv.apply(this, arguments) };

  if (fore) fore(h);
  h.load('overlay-sanitize.js');
  h.load('premium-final.js');
  h.load('topgift-designer.js');
  h.load('gift-event-images.js');
  h.load('live-leaderboard.js');
  const script = h.document.createElement('script');
  script.textContent = `state.widgets.length=0;state.widgets.push(${JSON.stringify(w)});`
    + 'window.__render=render;render=function(){window.__renders=(window.__renders||0)+1;return window.__render.apply(this,arguments)}';
  h.document.body.append(script);
  h.paint([w]);

  const fire = detail => h.window.dispatchEvent(new h.window.CustomEvent('vyra-live-event', { detail }));
  const widget = () => {
    const probe = h.document.createElement('script');
    probe.textContent = 'window.__tg = JSON.parse(JSON.stringify(state.widgets[0]))';
    h.document.body.append(probe);
    return h.window.__tg;
  };
  const node = () => h.document.querySelector('.vyra-topgift[data-id="' + w.id + '"]');
  const dom = () => {
    const el = node();
    return {
      namn: el.querySelector('.topgift-copy strong').textContent,
      profil: el.querySelector('.vyra-profile-face img').getAttribute('src'),
      varde: el.querySelector('.topgift-copy em').textContent
    };
  };
  const renders = () => h.window.__renders || 0;
  return { h, fire, widget, dom, node, rakna, renders };
}

const heartMe = (username, over = {}) => ({ type: 'gift', giftName: 'Heart Me', username, name: username,
  coins: 1, diamonds: 1, count: 1, giftImage: HEART_ME, ...over });

// ---- (a) lika värde byter inte person, strikt större gör det ------------------------------------
for (const theme of DESIGNER) {
  test(`${theme}: en gåva LIKA stor som rekordet byter inte person`, () => {
    const env = boot(theme);
    env.fire(heartMe('maryovela', { profileImage: MARY }));
    assert.equal(env.widget().dataName, 'maryovela');
    assert.equal(env.widget().profileImage, MARY);

    env.fire(heartMe('javisst26', { profileImage: JAVISST }));
    assert.equal(env.widget().dataName, 'maryovela', 'lika värde bytte person i state');
    assert.equal(env.widget().profileImage, MARY, 'lika värde bytte bild i state');
    assert.equal(env.dom().namn, 'maryovela', 'lika värde bytte namn i DOM');
    assert.equal(env.dom().profil, MARY, 'lika värde bytte bild i DOM — ny bild, gammalt namn');
  });

  test(`${theme}: en strikt större gåva byter person`, () => {
    const env = boot(theme);
    env.fire(heartMe('maryovela', { profileImage: MARY }));
    env.fire(heartMe('javisst26', { profileImage: JAVISST, giftName: 'Rose', coins: 2, diamonds: 2 }));
    assert.equal(env.widget().dataName, 'javisst26', 'ett riktigt rekord blockerades');
    assert.equal(Number(env.widget().dataValue), 2);
    assert.equal(env.h.window.VyraGiftRecords.giftCoins, 2);
  });
}

test('beslutet fattas en gång per händelse, oavsett vem som frågar först', () => {
  const env = boot('neon');
  const records = env.h.window.VyraGiftRecords;
  assert.equal(typeof records.bedom, 'function', 'det finns ingen gemensam beslutspunkt');
  const e = heartMe('a', { coins: 5, diamonds: 5 });
  const forsta = records.bedom(e);
  assert.equal(forsta.gift, true);
  assert.equal(records.bedom(e), forsta, 'samma händelse fick ett nytt beslut');
  assert.equal(records.bedom(heartMe('b', { coins: 5, diamonds: 5 })).gift, false, 'lika värde räknades som rekord');
  assert.equal(records.bedom(heartMe('c', { coins: 6, diamonds: 6 })).gift, true);
  assert.equal(records.bedom(null).gift, false, 'en tom händelse kastade eller blev rekord');
});

// ---- (b) namnet i DOM följer bilden i alla tre designerna -----------------------------------------
for (const theme of DESIGNER) {
  test(`${theme}: namnet i DOM följer bilden`, () => {
    const env = boot(theme);
    env.fire(heartMe('maryovela', { profileImage: MARY }));
    assert.deepEqual([env.dom().namn, env.dom().profil], ['maryovela', MARY]);

    env.fire(heartMe('javisst26', { profileImage: JAVISST, giftName: 'Rose', coins: 5, diamonds: 5 }));
    assert.equal(env.dom().profil, JAVISST, 'bilden byttes inte');
    assert.equal(env.dom().namn, 'javisst26', 'ny bild, gammalt namn');
    assert.match(env.dom().varde, /5$/, 'värdet följde inte med');
  });
}

// I en riktig bildruta patchar gift-event-images.js först i NÄSTA bildruta, medan live-leaderboard.js
// skriver direkt. Om live-leaderboard byter bilden men missar namnet syns ny bild med gammalt namn —
// det är precis det som mättes. Därför jämförs DOM:en innan kön töms.
for (const theme of DESIGNER) {
  test(`${theme}: namnet byts i samma ögonblick som bilden, inte en bildruta senare`, () => {
    const ko = [];
    const env = boot(theme, { rafKo: ko });
    const tom = () => { while (ko.length) ko.shift()(0) };
    env.fire(heartMe('maryovela', { profileImage: MARY }));
    tom();
    env.fire(heartMe('javisst26', { profileImage: JAVISST, giftName: 'Rose', coins: 5, diamonds: 5 }));
    assert.equal(env.dom().profil, JAVISST, 'bilden byttes inte');
    assert.equal(env.dom().namn, 'javisst26', 'ny bild, gammalt namn — namnväljaren träffade ingen nod');
    tom();
    assert.deepEqual([env.dom().namn, env.dom().profil], ['javisst26', JAVISST]);
  });
}

// ---- (c) noll save() och noll render() per gåva i overlayn ---------------------------------------
for (const theme of DESIGNER) {
  test(`${theme}: overlayn sparar och ritar inte om per gåva`, () => {
    const env = boot(theme);
    env.rakna.save = 0; env.rakna.write = 0;
    const fore = env.renders();
    env.fire(heartMe('maryovela', { profileImage: MARY }));
    env.fire(heartMe('javisst26', { profileImage: JAVISST, coins: 9, diamonds: 9 }));
    env.fire(heartMe('tredje', { coins: 50, diamonds: 50 }));
    assert.equal(env.widget().dataName, 'tredje', 'gåvorna nådde inte widgeten — provet mäter ingenting');
    assert.equal(env.rakna.save, 0, 'save() kördes per gåva');
    assert.equal(env.rakna.write, 0, 'state skrevs per gåva');
    assert.equal(env.renders() - fore, 0, 'render() kördes per gåva');
  });
}

test('en stor avatar byter bild utan save() i overlayn', () => {
  const env = boot('neon');
  env.h.load('vyra-stor-avatar.js');
  env.fire(heartMe('maryovela', { profileImage: MARY }));
  env.rakna.save = 0; env.rakna.write = 0;
  env.h.window.VyraStorAvatar.byt('maryovela', MARY, 'https://p16-sign.tiktokcdn.com/stor.webp');
  assert.equal(env.widget().profileImage, 'https://p16-sign.tiktokcdn.com/stor.webp', 'state byttes inte');
  assert.equal(env.rakna.save, 0, 'bildbytet sparade layouten');
  assert.equal(env.rakna.write, 0, 'bildbytet skrev state');
});

// ---- utan save() måste Top Gift ändå överleva en omladdning ---------------------------------------
// Konfigurationen bär inte längre livevärdet. Sändningens Top Gift följer därför med i samma
// sessionsnyckel som topplistans `totals`, och läggs tillbaka i state och DOM vid första målningen.
test('Top Gift återställs efter en omladdning i samma sändning, utan save()', () => {
  const sparad = { sessionId: 's1', totals: {}, topGift: { name: 'javisst26', profileImage: JAVISST,
    giftImage: HEART_ME, value: 7 } };
  const env = boot('royal', { fore: h => {
    h.window.VyraLiveSession = { runtime: () => ({ aktivSession: () => 's1' }) };
    h.window.sessionStorage.setItem('vyra-leaderboard-stream-v1', JSON.stringify(sparad));
  } });
  env.rakna.save = 0;
  env.h.window.dispatchEvent(new env.h.window.CustomEvent('vyra-live-repaint'));
  assert.equal(env.widget().dataName, 'javisst26', 'Top Gift återställdes inte i state');
  assert.deepEqual([env.dom().namn, env.dom().profil], ['javisst26', JAVISST], 'Top Gift återställdes inte i DOM');
  assert.equal(env.rakna.save, 0);
});
