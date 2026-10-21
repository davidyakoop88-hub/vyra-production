'use strict';
// SVENSKA + ENGELSKA PÅ DE PUBLIKA SIDORNA (vyra-sprak.js, steg 1 — Davids beslut 2026-10-21).
//
// Kraven:
//   * svenska är standard utan val, även i en engelsk webbläsare (inga svenska prov ska bero på
//     maskinens språk),
//   * ?lang=en och SV/EN-väljaren byter allt synligt till engelska — texter, attribut och titel —
//     och valet sparas,
//   * text som skripten skriver efteråt (inloggningskortets knapp, felrader) översätts också,
//   * tillbaka till svenska återställer originalet exakt, titeln inräknad,
//   * varje publik sida laddar språkfilerna och har en plats för väljaren.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SIDOR = ['index.html', 'privacy.html', 'terms.html', 'status.html'];

function sida(fil, sok = '', lagrat = null) {
  const html = las(fil).replace(/<script\b[^>]*src="[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost/' + fil + sok, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w.navigator, 'language', { value: 'en-US', configurable: true });
  if (lagrat) w.localStorage.setItem('vyra-sprak', lagrat);
  w.eval(las('vyra-sprak-en.js'));
  w.eval(las('vyra-sprak.js'));
  return w;
}
const vanta = w => new Promise(r => w.setTimeout(r, 0));
const synligText = d => { const c = d.body.cloneNode(true); c.querySelectorAll('script,style').forEach(n => n.remove()); return c.textContent.replace(/\s+/g, ' '); };

test('varje publik sida laddar språkfilerna och har en SV/EN-plats', () => {
  for (const f of SIDOR) {
    const html = las(f);
    assert.match(html, /<script src="vyra-sprak-en\.js\?v=\d{8}-\d+"><\/script><script src="vyra-sprak\.js\?v=\d{8}-\d+"><\/script>/, f);
    assert.match(html, /data-sprakval/, f + ' saknar plats för språkväljaren');
  }
});

test('svenska är standard, även i en engelsk webbläsare', async () => {
  const w = sida('index.html');
  await vanta(w);
  assert.equal(w.VyraLang.current(), 'sv');
  assert.equal(w.document.documentElement.lang, 'sv');
  assert.match(w.document.querySelector('h1').textContent, /som får din/);
  assert.equal(w.document.title, 'VYRA — TikTok LIVE, under kontroll');
});

test('?lang=en översätter text, attribut och titel och sparar valet', async () => {
  for (const f of SIDOR) {
    const w = sida(f, '?lang=en');
    await vanta(w);
    const d = w.document;
    assert.equal(d.documentElement.lang, 'en', f);
    assert.equal(w.localStorage.getItem('vyra-sprak'), 'en', f);
    const text = synligText(d);
    const kvar = text.match(/[^.!?]*[åäöÅÄÖ][^.!?]*/g) || [];
    assert.deepEqual(kvar, [], f + ' har svensk text kvar på engelska');
    assert.doesNotMatch(d.title, /[åäö]/, f + ' titel');
  }
  const w = sida('index.html', '?lang=en');
  await vanta(w);
  assert.equal(w.document.querySelector('h1').textContent.replace(/\s+/g, ' ').trim(), 'Overlays that make your TikTok Live stand out');
  assert.equal(w.document.querySelector('[data-login] input[type=password]').getAttribute('placeholder') == null
    || !/[åäö]/.test(w.document.querySelector('[data-login] input[type=password]').getAttribute('placeholder')), true);
});

test('text som ett skript skriver efteråt översätts, och svenska återställs exakt', async () => {
  const w = sida('index.html', '', 'en');
  await vanta(w);
  const d = w.document;
  const p = d.createElement('p');
  d.body.append(p);
  p.textContent = 'Fel e-post eller lösenord';
  await vanta(w);
  assert.equal(p.textContent, 'Wrong email or password');
  const h1Sv = 'Overlays som får din TikTok Live att sticka ut';
  w.VyraLang.set('sv');
  assert.equal(d.querySelector('h1').textContent.replace(/\s+/g, ' ').trim(), h1Sv);
  assert.equal(d.title, 'VYRA — TikTok LIVE, under kontroll');
  assert.equal(p.textContent, 'Fel e-post eller lösenord');
  w.VyraLang.set('en');
  assert.equal(d.title, 'VYRA — TikTok LIVE, under control');
  assert.equal(w.localStorage.getItem('vyra-sprak'), 'en');
});

test('mönster: tider i statusraden', async () => {
  const w = sida('status.html', '?lang=en');
  await vanta(w);
  assert.equal(w.VyraLang.t('Senast kontrollerad 12:04 · statusen är inte färsk'), 'Last checked 12:04 · the status is not fresh');
  assert.equal(w.VyraLang.t('Okänd text'), 'Okänd text');
});
