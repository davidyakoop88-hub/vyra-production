'use strict';
// SOCIAL-ALERT (social-alert.js) — alerten som växlar mellan streamerns sociala konton, med
// playgroundens två designer. Provet vaktar att studion och OBS-länken (en annan webbläsare) visar samma
// konto ur samma fält, att växlingen följer visningstiden och bara tar aktiva konton, att designerna går
// att välja, och att alerten syns i OBS utan att vänta på en live-händelse.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
test.after(closeAll);

function rigg(overlay = false) {
  const h = createDom({ url: 'https://vyralive.app/studio.html' + (overlay ? '?overlay=1' : ''), state: { widgets: [], projectName: 'social' } });
  h.load('social-alert.js');
  return h;
}
const S = h => h.window.VyraSocialAlert;
const sida = h => h.window.eval('({ state, render })');
function rita(h, w) {
  const host = h.document.createElement('div');
  host.innerHTML = h.window.wh(w);
  h.document.body.append(host);
  return host.querySelector('.vyra-social');
}

test('två katalognycklar, två designer — och tre exempelkonton att börja med', () => {
  const h = rigg();
  const glans = h.window.VyraWidgets.create('catalog:socialalert:glans');
  const kapsel = h.window.VyraWidgets.create('catalog:socialalert:kapsel');
  assert.equal(glans.type, 'templateSocialAlert');
  assert.equal(glans.saDesign, 'glans');
  assert.equal(kapsel.saDesign, 'kapsel');
  assert.equal(glans.saSekunder, 5);
  assert.equal(JSON.stringify(glans.saKonton.map(k => k.plattform)), JSON.stringify(['Instagram', 'TikTok', 'YouTube']));
  assert.throws(() => h.window.VyraWidgets.create('catalog:socialalert:okand'), /Okänd design/);
  assert.ok(rita(h, glans).classList.contains('sa-glans'));
  assert.ok(rita(h, kapsel).classList.contains('sa-kapsel'));
});

test('samma ankare ger samma konto: växlingen räknas ur saStart, inte en timer per flik', () => {
  const h = rigg();
  const T = 1_800_000_000_000;
  const w = { ...h.window.VyraWidgets.create('catalog:socialalert:glans'), id: 's1', saStart: T, saSekunder: 3 };
  const pa = ms => S(h).lage(w, T + ms).konto.plattform;
  assert.equal(pa(0), 'Instagram');
  assert.equal(pa(2999), 'Instagram');
  assert.equal(pa(3000), 'TikTok', 'byter efter exakt en visningstid');
  assert.equal(pa(6500), 'YouTube');
  assert.equal(pa(9000), 'Instagram', 'börjar om efter sista kontot');
  assert.equal(Math.round(S(h).lage(w, T + 4200).forflutet), 1200, 'förloppsstapeln vet hur långt in i kontot den är');
});

test('bara aktiva konton med namn är med, och en pausad alert står still', () => {
  const h = rigg();
  const T = 1_800_000_000_000;
  const w = { ...h.window.VyraWidgets.create('catalog:socialalert:kapsel'), id: 's2', saStart: T, saSekunder: 5 };
  w.saKonton[1].aktiv = false;
  w.saKonton[2].namn = '   ';
  assert.equal(S(h).lage(w, T).n, 1);
  assert.equal(S(h).lage(w, T + 60_000).konto.plattform, 'Instagram', 'ett enda aktivt konto står kvar');
  w.saKonton[1].aktiv = true; w.saKonton[2].namn = '@kanal';
  Object.assign(w, { saRotera: false, saIndex: 2 });
  assert.equal(S(h).lage(w, T + 60_000).konto.plattform, 'YouTube', 'pausad: kontot i saIndex står still');
});

test('alerten visar plattformens rubrik och namn, och användarens text escapas', () => {
  const h = rigg();
  const w = { ...h.window.VyraWidgets.create('catalog:socialalert:glans'), id: 's3', saStart: Date.now(), saRotera: false };
  w.saKonton[0] = { id: 'x', plattform: 'Twitch', namn: '<img src=x onerror=alert(1)>', lank: '', aktiv: true };
  const rot = rita(h, w);
  assert.equal(rot.querySelector('.sa-rubrik').textContent.replace(/\s+/g, ' ').trim(), 'Se mig live på Twitch');
  assert.equal(rot.querySelector('.sa-namn').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(rot.querySelector('.sa-namn img'), null, 'namnet får aldrig bli markup');
  assert.match(rot.querySelector('.sa-kort').getAttribute('style'), /--accent:#bc9aff/);
});

test('i OBS ritas ingen tom ruta, och alerten väntar inte på en live-händelse', () => {
  const obs = rigg(true);
  const w = { ...obs.window.VyraWidgets.create('catalog:socialalert:glans'), id: 's4', saKonton: [] };
  assert.equal(rita(obs, w).querySelector('.sa-vard').textContent.trim(), '', 'utan konton är OBS-rutan tom');
  const studio = rigg(false);
  assert.match(rita(studio, { ...w }).querySelector('.sa-vard').textContent, /Lägg till och aktivera ett konto/);
  assert.match(fs.readFileSync('overlay-aktivering.js', 'utf8'), /const UNDANTAG = new Set\(\[[^\]]*'templateSocialAlert'/);
});

test('designernas övergångar finns kvar: glanskortets in/ut och kapselns öppning på 1,6 s', () => {
  const css = fs.readFileSync('social-alert.css', 'utf8');
  assert.match(css, /\.vyra-social\.sa-kapsel \.sa-kort\{animation:sa-oppna 1\.6s/);
  assert.match(css, /\.vyra-social \.sa-kort\{animation:sa-in \.7s/);
  assert.match(css, /\.vyra-social \.sa-glans\{animation:sa-glans 5s/);
  assert.match(css, /@media\(prefers-reduced-motion:no-preference\)/, 'rörelsen ska respektera "minska rörelse"');
  const kod = fs.readFileSync('social-alert.js', 'utf8');
  assert.match(kod, /UTFART_MS = 360/, 'utfarten (0,36 s) spelas innan nästa konto byggs');
});
