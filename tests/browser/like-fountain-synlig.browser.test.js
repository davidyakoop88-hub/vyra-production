'use strict';
// LIKE FOUNTAIN MASTE SYNAS AVEN NAR VYN RENDERAS OM.
//
// Hjartstrommen -- fontanens barande lager --
// hade `opacity:0` som BASVARDE, och en entreanimation var enda vagen till 1:
//
//   .lf-stream{opacity:0;animation:lfStreamIn .6s ease-out .4s forwards}
//   @keyframes lfStreamIn{to{opacity:1}}
//
// `render()` bygger om vyn med innerHTML, sa noden ar ny varje gang och animationen
// startar om fran noll. Nar den inte hinner klart stannar opacity pa basvardet 0.
//
// UPPMATT I PRODUKTION 2026-09-18, Davids studio med levande TikTok-koppling:
// alla 59 hjartan hade opacity ~1 och lag innanfor ramen, men `.lf-stream` var 0 --
// och animationen stod som `running` med currentTime 0. Fontanen var helt osynlig.
//
// UPPMATT LOKALT, andel av tiden strommen var synlig:
//
//   omrendering      fore    efter
//   ---------------------------------
//   ingen             79 %    100 %
//   var 1800 ms       42 %    100 %
//   var 900 ms         0 %    100 %
//   var 400 ms         0 %    100 %
//
// Fixen: vilolaget ska vara SYNLIGT -- opacity 1, utan animation.
//
// EN OPACITY-BASERAD ENTRE GAR INTE ATT RADDA HAR. Den flimrar vid glesa
// renderingar (42 % synlig vid 1800 ms) och slacker helt vid tata. Entren ar
// darfor borttagen, tillsammans med @keyframes lfStreamIn som ingen annan anvande.
//
// campaign-flow i BEHALLER `opacity:0` med flit -- den ar en flygande partikel
// (`campaignFountainRise ... infinite`) som ska vara osynlig utom under flykten.
// En svepande fix over alla `opacity:0;animation:`-regler hade tant den permanent.
//
// VARFOR PROVET KOR I EN RIKTIG WEBBLASARE: jsdom har ingen kaskad och kor inga
// animationer. `getComputedStyle().opacity` dar sager ingenting om vad en tittare ser.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.json': 'application/json', '.woff2': 'font/woff2' };

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
let skip = hoppaOver();          // maste vara let: node:test laser { skip } vid registrering

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

test('hjartstrommen syns aven nar vyn renderas om varje 400 ms', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  // Headless Chromium rapporterar reduce som standard. Utan den har raden mater
  // provet reduced-motion-grenen utan att saga det.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  try {
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
      { timeout: 30000, polling: 100 });
    await page.waitForTimeout(1200);

    const m = await page.evaluate(async () => {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:likefountain');
      Object.assign(w, { id: 'lf', x: 0, y: 120, width: 420 });
      state.widgets.push(w); selected = null; view = 'editor';

      // BARA `.lf-stream`. Samma monster finns pa `.lf-center` och `.lf-label` i
      // studio.css, men ingen kod satter nagonsin de klasserna -- `likeFountainHtml`
      // sander inte ut dem, och `lfUpdateLiveLabel` anvander helt andra namn
      // (`.lf-label-user`, `.lf-label-count`). De ar doda regler, sa att "laga" dem
      // hade varit en andring utan matbart utfall.
      const DELAR = ['.lf-stream'];
      const las = () => {
        const box = document.querySelector('.widget.like-fountain');
        const ut = {};
        for (const d of DELAR) {
          const el = box && box.querySelector(d);
          ut[d] = el ? +getComputedStyle(el).opacity : null;
        }
        return ut;
      };

      // Rendera om tatt, som en levande sandning gor, och mat hela tiden.
      render(); bind();
      const lagsta = {}; for (const d of DELAR) lagsta[d] = 1;
      const t0 = Date.now(); let sist = Date.now();
      while (Date.now() - t0 < 3000) {
        await new Promise(r => setTimeout(r, 100));
        if (Date.now() - sist >= 400) { render(); sist = Date.now(); }
        const nu = las();
        for (const d of DELAR) if (nu[d] !== null) lagsta[d] = Math.min(lagsta[d], nu[d]);
      }
      return { lagsta, fanns: las() };
    });

    for (const [del, varde] of Object.entries(m.lagsta)) {
      assert.notEqual(m.fanns[del], null, `${del} finns inte i fontanen — provet mater fel element`);
      assert.ok(varde > 0.9,
        `${del} sjonk till opacity ${varde} under omrendering. Basvardet maste vara 1: en ` +
        'entreanimation startar om vid varje render() och hinner da aldrig fram till 1, ' +
        'sa elementet blir permanent osynligt i en levande sandning.');
    }
  } finally {
    await page.close();
  }
});

test('kampanjens flygande partikel ar fortfarande osynlig i vila', { skip }, async () => {
  // KONTROLLFALL AT ANDRA HALLET. `campaign-flow i` delar monstret `opacity:0;animation:`
  // men ar en LOOPANDE partikel som ska vara osynlig utom under flykten. Provet finns
  // for att en svepande fix over alla sadana regler inte ska tanda den permanent.
  const css = fs.readFileSync(path.join(ROOT, 'studio.css'), 'utf8');
  const rad = css.match(/opacity:0;animation:campaignFountainRise[^;}]*/);
  assert.ok(rad, 'campaign-flow i har tappat sitt opacity:0 — den flygande partikeln ' +
    'syns nu aven i vila, vilket ar precis vad fixen for fontanen INTE fick gora');
  assert.match(rad[0], /infinite/, 'partikeln ar inte langre loopande — las om varfor ' +
    'opacity:0 var ratt for just den innan du andrar det har provet');
});
