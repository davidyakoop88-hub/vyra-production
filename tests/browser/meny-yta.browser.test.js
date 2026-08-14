'use strict';
// Sidopanelens yta ar hennes egen. Ingenting far ligga ovanpa den, och innehallet ska ga att
// lasa och na utan att rulla.
//
// ORSAKEN, uppmatt 2026-08-11: menybredden stod pa TVA stallen i studio.css — rutnatet
// (`grid-template-columns:186px ...`) och overlaylankfaltets `left`. Nar editorns skena breddades
// fran 64px till 186px andrades bara det ena. Faltet blev kvar pa `left:64px!important` och la sig
// 122px in OVANPA menyn, tvars over kontoraden langst ner.
//
// Ingen mattsiffra var fel — bade `scrollHeight` och `clientHeight` sa 768, `rullar:false`,
// `overskott:0`. Panelen var hel. Nagot annat lag pa den. Det syntes bara pa skarmbilden, och
// det ar precis den luckan prov 1 tacker: geometrisk plats bevisar inte synlighet.
//
// Prov 1 ar darfor medvetet BREDARE an buggen: det gar igenom varje synligt fixed/absolute-
// element pa sidan, inte bara `.overlay-link-bar`. Ett prov som bara namnde det faltet hade
// slappt igenom nasta yta som gor samma sak.
//
// Varfor browser och inte jsdom: allt harinne ar getBoundingClientRect. jsdom har ingen layout
// och svarar 0 pa varje matt, sa provet hade varit gront fore fixen ocksa.
//
// ROTT NU: prov 1 (overlappet), prov 3 (knappen finns kvar).
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// 1366x768 ar den trangsta vanliga laptopen. Overlappet fanns vid alla storlekar, men hojdkravet
// i prov 2 ar bara meningsfullt dar utrymmet faktiskt tar slut.
async function oppnaEditorn(b = 1366, h = 768) {
  const page = await browser.newPage({ viewport: { width: b, height: h } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell')
    && !!document.querySelector('aside nav button'), null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2000);
  return page;
}

test('inget lager far ligga ovanpa sidopanelen i editorn', { skip }, async () => {
  for (const [b, h] of [[1920, 1080], [1440, 900], [1366, 768]]) {
    const page = await oppnaEditorn(b, h);
    const krockar = await page.evaluate(() => {
      const a = document.querySelector('aside').getBoundingClientRect();
      const ut = [];
      for (const el of document.querySelectorAll('body *')) {
        const s = getComputedStyle(el);
        if (s.position !== 'fixed' && s.position !== 'absolute') continue;
        if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) continue;
        if (el.closest('aside')) continue;               // panelens egna barn far forstas ligga dar
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 12) continue;     // dekor och nollytor ar inte lager
        const vaagratt = Math.min(a.right, r.right) - Math.max(a.left, r.left);
        const lodratt = Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top);
        // 1px slack: delade kanter ar inte overlapp.
        if (vaagratt > 1 && lodratt > 1) {
          ut.push(`${el.className || el.tagName} tacker ${Math.round(vaagratt)}px`);
        }
      }
      return ut;
    });
    await page.close();
    assert.deepEqual(krockar, [], `${b}x${h}: nagot ligger ovanpa menyn — ${krockar.join(', ')}`);
  }
});

test('hela menyn ryms utan rullning ned till 1366x768', { skip }, async () => {
  for (const [b, h] of [[1920, 1080], [1440, 900], [1366, 768]]) {
    const page = await oppnaEditorn(b, h);
    const m = await page.evaluate(() => {
      const a = document.querySelector('aside');
      return { overskott: a.scrollHeight - a.clientHeight,
        // Nedersta raden ska sluta INNANFOR fonstret, inte bara "finnas".
        bottenKant: Math.round(a.lastElementChild.getBoundingClientRect().bottom),
        fonster: innerHeight };
    });
    await page.close();
    assert.ok(m.overskott <= 2, `${b}x${h}: menyn rullar, ${m.overskott}px for hog`);
    assert.ok(m.bottenKant <= m.fonster + 2,
      `${b}x${h}: nedersta raden slutar pa ${m.bottenKant}, fonstret ar ${m.fonster}`);
  }
});

test('menyn har ingen hopfallningsknapp och startar aldrig hopfalld', { skip }, async () => {
  const page = await oppnaEditorn();
  const m = await page.evaluate(() => ({
    knapp: !!document.querySelector('.sidebar-collapse-toggle'),
    hopfalld: document.body.classList.contains('sidebar-collapsed'),
    // Etiketterna ar poangen: en meny av bara ikoner ar det vi tog bort.
    etiketter: [...document.querySelectorAll('aside nav button span, aside nav a span')]
      .filter(s => getComputedStyle(s).display !== 'none' && s.textContent.trim()).length,
  }));
  await page.close();
  assert.equal(m.knapp, false, 'hopfallningsknappen finns kvar');
  assert.equal(m.hopfalld, false, 'menyn startar hopfalld');
  assert.ok(m.etiketter >= 10, `bara ${m.etiketter} synliga etiketter — menyn ar en ikonskena`);
});
