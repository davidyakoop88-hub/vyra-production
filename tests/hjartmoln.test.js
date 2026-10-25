'use strict';
// HJÄRTAN & MOLN (hjartmoln.js) — de nio gallerivarianterna plus de fem extra, som transparenta WebM.
// Provet vaktar det som inte syns i en skärmdump: att varje variant har sitt klipp och sin affisch på
// disk, att klippen bär alfa (VP9 alpha_mode) och inte är MP4, att bara färska händelser av rätt slag
// startar effekten, och att profilhjärtan aldrig hittar på en tittare. OBS-utgången provas i
// tests/browser/hjartmoln.browser.test.js.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);

const ROT = path.join(__dirname, '..');
function rigg(overlay = false) {
  const h = createDom({ url: 'https://vyralive.app/studio.html' + (overlay ? '?overlay=1' : ''), state: { widgets: [], projectName: 'hm' } });
  h.load('hjartmoln.js');
  return h;
}
const HM = h => h.window.VyraHjartMoln;
const GALLERI = ['profilhjartan', 'fallande', 'hjartmoln', 'glodande', 'kristall', 'stjarnstoft', 'blixt', 'organiskt', 'levande'];

test('nio katalognycklar, en per gallerivariant — och en okänd variant kastar', () => {
  const h = rigg();
  for (const id of GALLERI) {
    const w = h.window.VyraWidgets.create('catalog:heartcloud:' + id);
    assert.equal(w.type, 'templateHeartCloud');
    assert.equal(w.hmVariant, id);
    assert.equal(w.hmLage, 'likes', 'standardläget ska vara likes');
    assert.equal(w.hmProfiler, id === 'profilhjartan', 'bara Profilhjärtan har porträttlagret på från början');
    assert.equal(JSON.stringify([w.x, w.y, w.width]), '[0,0,432]', 'effekten fyller duken (432 × 768)');
  }
  assert.throws(() => h.window.VyraWidgets.create('catalog:heartcloud:okand'), /Okänd variant/);
  assert.equal(HM(h).VARIANTER.length, 14, 'nio i galleriet plus de fem extra');
  assert.equal(JSON.stringify(HM(h).VARIANTER.filter(v => v[4]).map(v => v[0])), JSON.stringify(GALLERI));
});

test('varje variant har ett transparent WebM-klipp och en affisch på disk — ingen MP4', () => {
  const h = rigg();
  const mapp = path.join(ROT, 'assets/videos/hjartmoln');
  for (const [id, , , klipp] of HM(h).VARIANTER) {
    const w = { type: 'templateHeartCloud', hmVariant: id };
    const webm = path.join(ROT, HM(h).klippUrl(w)), webp = path.join(ROT, HM(h).affischUrl(w));
    assert.ok(fs.existsSync(webm), `${id}: ${klipp}.webm saknas`);
    assert.ok(fs.existsSync(webp), `${id}: ${klipp}.webp saknas`);
    const huvud = fs.readFileSync(webm).subarray(0, 4096);
    assert.equal(huvud.readUInt32BE(0), 0x1a45dfa3, `${id}: inte en WebM/Matroska-fil`);
    assert.ok(huvud.includes(Buffer.from('V_VP9')), `${id}: klippet är inte VP9`);
    // AlphaMode (0x53C0) = 1 i spårhuvudet: utan den visar Chrome/OBS klippet som en svart ruta.
    assert.ok(huvud.includes(Buffer.from([0x53, 0xc0, 0x81, 0x01])), `${id}: klippet saknar alfa (AlphaMode)`);
    assert.ok(fs.statSync(webm).size < 4.5 * 1024 * 1024, `${id}: klippet är större än 4,5 MB`);
  }
  assert.deepEqual(fs.readdirSync(mapp).filter(f => !/\.(webm|webp)$/.test(f)), [], 'bara WebM och WebP i mappen — MP4 är förhandsvisningar');
});

test('bara färska händelser av rätt slag startar effekten', () => {
  const h = rigg();
  const T = 1_800_000_000_000;
  const w = { ...h.window.VyraWidgets.create('catalog:heartcloud:hjartmoln'), id: 'h1' };
  const t = (e, over = {}) => HM(h).triggar({ ...w, ...over }, { at: T, ...e }, T);
  assert.equal(t({ type: 'like', count: 3 }), true);
  assert.equal(t({ type: 'like', count: 3, at: T - 60000 }), false, 'en like från historiken startade effekten');
  assert.equal(t({ type: 'gift', giftName: 'Rose' }), false, 'likesläget startade på en gåva');
  assert.equal(t({ type: 'gift', giftName: 'Rose' }, { hmLage: 'gavor' }), true);
  assert.equal(t({ type: 'follow' }, { hmLage: 'foljare' }), true);
  assert.equal(t({ type: 'like' }, { hmLage: 'likes-gavor' }), true);
  assert.equal(t({ type: 'like', count: 4 }, { hmMinLikes: 10 }), false, 'ett paket under minsta antal startade effekten');
  assert.equal(t({ type: 'like', count: 12 }, { hmMinLikes: 10 }), true);
  assert.equal(t({ type: 'like' }, { hmLage: 'alltid' }), false, '"Hela tiden" loopar redan och startas inte av händelser');
});

test('profilhjärtan: bara riktiga tittare med profilbild, aldrig ett påhittat porträtt', () => {
  const h = rigg(true);
  const w = { ...h.window.VyraWidgets.create('catalog:heartcloud:profilhjartan'), id: 'p1' };
  h.window.eval('state').widgets.push(w);
  h.window.eval('render')();
  const skicka = e => h.window.dispatchEvent(new h.window.CustomEvent('vyra-live-event', { detail: { type: 'like', count: 2, at: Date.now(), ...e } }));
  skicka({ username: 'utan_bild' });
  assert.equal(h.document.querySelectorAll('.hm-ph').length, 0, 'ett porträtt ritades för en tittare utan bild');
  skicka({ username: 'med_bild', profileImage: 'https://p16-sign.tiktokcdn.com/a.jpeg' });
  const bilder = [...h.document.querySelectorAll('.hm-ph img')].map(b => b.getAttribute('src'));
  assert.deepEqual(bilder, ['https://p16-sign.tiktokcdn.com/a.jpeg']);
  skicka({ username: 'med_bild', profileImage: 'https://p16-sign.tiktokcdn.com/a.jpeg' });
  assert.equal(h.document.querySelectorAll('.hm-ph').length, 1, 'samma tittare igen inom 2,5 s gav ett andra porträtt');
  skicka({ username: 'farlig', profileImage: 'javascript:alert(1)' });
  assert.equal(h.document.querySelectorAll('.hm-ph').length, 1, 'en osäker bildadress släpptes igenom');
  const kod = fs.readFileSync(path.join(ROT, 'hjartmoln.js'), 'utf8');
  assert.doesNotMatch(kod, /\b(Lina|Jay|Maya)\b/, 'paketets demonamn får inte finnas i widgeten');
});

test('i OBS ritas ingen affisch eller etikett — bara den tomma lådan som väntar', () => {
  const obs = rigg(true);
  const w = { ...obs.window.VyraWidgets.create('catalog:heartcloud:glodande'), id: 'o1' };
  const host = obs.document.createElement('div');
  host.innerHTML = obs.window.wh(w);
  const rot = host.querySelector('.vyra-hjartmoln');
  assert.ok(rot && rot.querySelector('.hm-vard'));
  assert.equal(rot.querySelector('.hm-affisch'), null, 'affischen syns i OBS i vila');
  assert.equal(rot.querySelector('.hm-chip'), null, 'studioetiketten syns i OBS');
  const studio = rigg(false);
  const host2 = studio.document.createElement('div');
  host2.innerHTML = studio.window.wh(w);
  assert.match(host2.querySelector('.hm-affisch').getAttribute('src'), /glodande\.webp$/);
  assert.match(fs.readFileSync(path.join(ROT, 'overlay-aktivering.js'), 'utf8'), /templateHeartCloud' && w\.hmLage === 'alltid'/,
    '"Hela tiden" måste vara undantagen från aktiveringen, annars syns den aldrig i OBS');
});
