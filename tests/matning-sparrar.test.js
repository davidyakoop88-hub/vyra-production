'use strict';
// TRATTMATNINGENS TVA SPARRAR, webblasarledet.
//
// Bada finns for att INGENTING kansligt ska kunna lamna sidan, och bada ar lattare att rasera av
// misstag an att uppfinna:
//
//  1. OVERLAY-SPARREN. overlay.html ar bara en omdirigering till `studio.html?overlay=1&access=…`
//     — tittarnas overlay AR Studion. Laddas matningen dar blir varje tittare i varje sandning en
//     sidvisning, och OBS far en tredjepartsforfragan. I dag laddas filen bara av index.html, sa
//     sparren ar overflodig. Den star kvar for att den dagen nagon kopierar en skripttagg ska
//     kostnaden vara noll i stallet for en incident.
//
//  2. INGEN QUERY I ADRESSEN. Vyra-URL:er bar `?access=<permanent OBS-token>`. Plausibles VANLIGA
//     skript skickar sidans fullstandiga URL — darfor kors manuellt lage, och adressen byggs av
//     oss. Ett prov som bara laser location.pathname hade varit blint for buggen; darfor lases
//     det som FAKTISKT skickas till window.plausible.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const KALLA = fs.readFileSync(path.join(__dirname, '..', 'vyra-matning.js'), 'utf8');

// Kor modulen mot en sida pa `url` och fanga allt den skickar till window.plausible.
function kor(url) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
    { url, runScripts: 'outside-only' });
  const w = dom.window;
  const skickat = [];
  // Stubben modulen sjalv satter upp skulle ko anropen. Vi lagger var egen FORE, sa
  // `window.plausible = window.plausible || …` behaller den och vi ser anropen direkt.
  w.plausible = function () { skickat.push(Array.from(arguments)); };
  w.eval(KALLA);
  return { w, skickat, dom };
}

// URL:en har BARA `overlay`, aldrig `access`. Forsta versionen av det har provet bar bada, och da
// tackte access-sparren for overlay-sparren: en mutation som TOG BORT overlay-sparren gav
// fortfarande sex grona prov. Ett prov som inte kan se vilken sparr som arbetar bevisar ingen av
// dem. Sparrarna provas darfor var for sig.
test('overlay-lage UTAN access: modulen gor ingenting alls', () => {
  const { w, skickat, dom } = kor('https://vyralive.app/studio.html?overlay=1&widget=toplist');
  assert.deepEqual(skickat, [], 'en tittares overlay far aldrig ge en sidvisning');
  assert.equal(w.document.querySelector('script[src*="plausible"]'), null,
    'skriptet far inte ens laddas — OBS ska inte gora en tredjepartsforfragan');
  assert.equal(w.VyraMat, undefined, 'ingen API-yta ska finnas i overlay-lage');
  dom.window.close();
});

test('access-token i URL:en: modulen gor ingenting alls', () => {
  const { skickat, dom } = kor('https://vyralive.app/studio.html?access=hemlig-token');
  assert.deepEqual(skickat, [], 'en tokenbarande vy far inte matas');
  dom.window.close();
});

test('vanlig framsida: sidvisning skickas', () => {
  const { w, skickat, dom } = kor('https://vyralive.app/');
  assert.equal(skickat.length, 1);
  assert.equal(skickat[0][0], 'pageview');
  assert.ok(w.document.querySelector('script[src*="plausible.io/js/script.manual.js"]'),
    'MANUELLT lage kravs — det vanliga skriptet skickar hela URL:en, query och allt');
  dom.window.close();
});

test('adressen som skickas bar ALDRIG sokstrangen', () => {
  const { skickat, dom } = kor('https://vyralive.app/?utm_source=tiktok&access=lackande-token');
  // access-sparren stoppar redan den har, sa provet ar tvadelat: inget skickas...
  assert.deepEqual(skickat, []);
  dom.window.close();

  // ...och pa en sida UTAN access men MED query far sokstrangen anda inte folja med.
  const b = kor('https://vyralive.app/?utm_source=tiktok&kampanj=host');
  assert.equal(b.skickat.length, 1);
  const adress = b.skickat[0][1].u;
  assert.equal(adress, 'https://vyralive.app/');
  assert.equal(adress.includes('?'), false, 'query far aldrig na en tredjepart');
  assert.equal(adress.includes('utm_source'), false);
  b.dom.window.close();
});

test('store_klick fangas aven for en lank som ritas EFTER laddning', () => {
  const { w, skickat, dom } = kor('https://vyralive.app/');
  // landing-hamta.js ritar lanken forst efter ett natverksanrop. En engangsbindning vid laddning
  // hade missat den helt — samma fallgrop som download-client.js redan gatt i.
  const a = w.document.createElement('a');
  a.setAttribute('data-hamta-desktop', '');
  a.textContent = 'Ladda ner';
  w.document.body.appendChild(a);
  a.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  const namn = skickat.map(s => s[0]);
  assert.deepEqual(namn, ['pageview', 'store_klick']);
  dom.window.close();
});

test('ett klick nagon annanstans ger ingen handelse', () => {
  const { w, skickat, dom } = kor('https://vyralive.app/');
  const d = w.document.createElement('button');
  w.document.body.appendChild(d);
  d.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(skickat.map(s => s[0]), ['pageview']);
  dom.window.close();
});
