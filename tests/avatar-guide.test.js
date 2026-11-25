'use strict';
// AI-GUIDEFILMEN PÅ STARTSIDAN (index.html #guide-film, docs/avatar-guide.md). Sektionen finns med en platshållare tills filmen är
// inspelad. Proven vaktar att platshållaren går att byta utan att något av det som annars går fel i tysthet går fel:
//   * en film som ligger utanför assets/ och public/ ger 404 i produktion (webbimagens tillåtelselista, Dockerfile),
//   * autoplay eller preload på en film med ljud är ett dåligt första intryck och en onödig nedladdning,
//   * AI-genererat innehåll ska märkas,
//   * varje text i sektionen ska ha en engelsk motsvarighet så att språkbytet inte lämnar svenska hål.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function sida(sok = '') {
  const html = las('index.html').replace(/<script\b[^>]*src="[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost/index.html' + sok, runScripts: 'outside-only', pretendToBeVisual: true });
  Object.defineProperty(dom.window.navigator, 'language', { value: 'sv-SE', configurable: true });
  return dom.window;
}
const texter = w => {
  const s = w.document.querySelector('#guide-film'), ut = [], tw = w.document.createTreeWalker(s, 4);
  for (let n; (n = tw.nextNode());) { const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t) ut.push(t); }
  return ut;
};

test('sektionen finns, ligger före stegen och har en rubrik som beskriver den', () => {
  const w = sida(), s = w.document.querySelector('section#guide-film');
  assert.ok(s, 'sektionen #guide-film saknas');
  assert.equal(s.getAttribute('aria-labelledby'), 'avatarGuideRubrik');
  assert.ok(w.document.getElementById('avatarGuideRubrik').textContent.trim());
  const steg = w.document.querySelector('#sa-funkar-det');
  assert.ok(s.compareDocumentPosition(steg) & w.Node.DOCUMENT_POSITION_FOLLOWING, 'guiden ska ligga före "Från widget till OBS i tre steg"');
  assert.ok(s.querySelector('a[href="#sa-funkar-det"]'), 'länk till stegen i text saknas');
});

test('guiden är märkt som AI-genererad, och manuset finns som text bredvid filmen', () => {
  const s = sida().document.querySelector('#guide-film'), t = s.textContent.replace(/\s+/g, ' ');
  assert.match(t, /AI-genererad avatar/, 'märkningen saknas');
  assert.match(t, /Jag är en AI-avatar/, 'avataren ska säga det själv');
  assert.ok(s.querySelectorAll('details p').length >= 6, 'manuset ska stå som text (tillgänglighet och sök)');
});

test('manuset lovar inget som startsidan inte lovar: pris, provperiod och antal designer', () => {
  const m = sida().document.querySelector('#guide-film details').textContent.replace(/\s+/g, ' ');
  assert.match(m, /3 dagar gratis/);
  assert.match(m, /15 USD i månaden/);
  assert.match(m, /över 150 designer/);
  assert.doesNotMatch(m, /för alltid gratis|helt gratis|inga kostnader|utan avgift/i);
  const hela = las('index.html');
  assert.match(hela, /Över 150 widgetdesigner/, 'siffran 150 ska stå kvar på startsidan om manuset nämner den');
  assert.match(hela, /3 dagar gratis provperiod, därefter 15 USD\/månad/);
});

test('om en film finns: inget autoplay, kontroller, ingen förladdning, och filen ligger där webbimagen kopierar den', () => {
  const filmer = [...sida().document.querySelectorAll('#guide-film video')];
  if (!filmer.length) return; // platshållare — inget att kontrollera än
  for (const v of filmer) {
    assert.ok(!v.hasAttribute('autoplay'), 'guiden har ljud och ska inte spela av sig själv');
    assert.ok(v.hasAttribute('controls'), 'controls saknas');
    assert.equal(v.getAttribute('preload'), 'none', 'preload="none": filmen ska inte laddas förrän någon trycker play');
    assert.ok(v.hasAttribute('poster'), 'poster saknas');
    const filer = [v.getAttribute('src'), v.getAttribute('poster'), ...[...v.querySelectorAll('source,track')].map(x => x.getAttribute('src'))].filter(Boolean);
    assert.ok(filer.some(f => /\.(mp4|webm)(\?|$)/.test(f)), 'ingen filmfil hittades');
    for (const f of filer) {
      const ren = f.split('?')[0];
      assert.match(ren, /^(assets|public)\//, `${f}: filen måste ligga under assets/ eller public/ — rotens .mp4/.webm kopieras inte in i webbimagen`);
      assert.ok(fs.existsSync(path.join(ROOT, ren)), `${ren} finns inte i repot`);
    }
    assert.ok(v.querySelector('track[kind="captions"]') || v.getAttribute('aria-label'), 'undertext eller aria-label saknas');
  }
  assert.equal(sida().document.querySelectorAll('#guide-film .avatarguide-plats').length, 0, 'platshållaren ska bort när filmen sätts in');
});

test('varje text i sektionen översätts till engelska, och svenskan kommer tillbaka', async () => {
  const med = async sok => {
    const html = las('index.html').replace(/<script\b[^>]*src="[^"]*"[^>]*><\/script>/g, '');
    const dom = new JSDOM(html, { url: 'http://localhost/index.html' + sok, runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window; Object.defineProperty(w.navigator, 'language', { value: 'sv-SE', configurable: true });
    w.eval(las('vyra-sprak-en.js')); w.eval(las('vyra-sprak.js'));
    await new Promise(r => w.setTimeout(r, 20)); return w;
  };
  const sv = texter(await med('')), en = texter(await med('?lang=en'));
  assert.equal(sv.length, en.length);
  const oversatta = sv.filter((t, i) => t === en[i] && t.length > 3 && !/^(→|VYRA|VYRA-guiden)$/.test(t));
  assert.deepEqual(oversatta, [], 'saknar engelsk text i vyra-sprak-en.js');
  assert.match(en.join(' '), /AI-generated avatar/);
});
