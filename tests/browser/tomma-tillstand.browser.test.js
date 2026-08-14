'use strict';
// Tomma tillstand: EN rost, EN formel, och ytor som bar sig sjalva i tomt lage.
//
// Fore Etapp 4 PR B talade tolv fraser i tre olika roster ("Ingen livedata ännu." /
// "Analys visas efter din första riktiga livesändning." / "Inga Actions ännu. Skapa den
// första.") och Statistik-vyn tackte 54 % av sin yta — resten var naken bakgrund, noll
// skeletons/placeholders i hela appen (uppmatt i Fas A-inventeringen 2026-08-09).
//
// Prov 1 (ROTT nu): varje vy i PER_VY ska visa exakt sina tomma tillstand, taggade med
//   data-tom="nyckel", med EXAKT fixturens text. Rott i dag: noll data-tom i hela appen.
// Prov 2 (ROTT nu): Statistik-vyn ska tacka >= 80 % av sin yta i tomt lage (54 % i dag) —
//   det ar placeholder-kropparnas kontrakt, inte textens.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const { TOMMA, PER_VY } = require('../fixtures/tomma-tillstand.js');

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

async function oppnaStudio() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('[data-view],[data-extra]'),
    null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  return page;
}

async function tillVy(page, nyckel) {
  await page.evaluate(k => {
    const b = document.querySelector(`[data-view="${k}"],[data-extra="${k}"]`);
    b.scrollIntoView({ block: 'nearest' });
    b.click();
  }, nyckel);
  await page.waitForTimeout(900);
}

// ---- Prov 1 · en rost --------------------------------------------------------------------------
test('varje tomt tillstand ar taggat och bar exakt fixturens text', { skip, timeout: 180000 }, async () => {
  const page = await oppnaStudio();
  try {
    const fel = [];
    for (const [vy, nycklar] of Object.entries(PER_VY)) {
      await tillVy(page, vy);
      const funna = await page.evaluate(() =>
        [...document.querySelectorAll('#view [data-tom]')]
          .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
          .map(el => ({ nyckel: el.dataset.tom, text: el.textContent.replace(/\s+/g, ' ').trim() })));

      // Unika nycklar: samma rost far upprepas (scenlanken star pa alla tio scenrader) —
      // det ar TEXTEN som ska vara identisk, vilket loopen nedan provar per forekomst.
      const funnaNycklar = [...new Set(funna.map(f => f.nyckel))].sort();
      const vantade = [...nycklar].sort();
      if (JSON.stringify(funnaNycklar) !== JSON.stringify(vantade)) {
        fel.push(`${vy}: forvantade [${vantade}] men fann [${funnaNycklar}] — otaggade roster kvar`);
      }
      for (const f of funna) {
        const def = TOMMA[f.nyckel];
        if (!def) { fel.push(`${vy}: data-tom="${f.nyckel}" finns inte i fixturen`); continue }
        const ok = def.monster ? def.monster.test(f.text) : f.text === def.text;
        if (!ok) fel.push(`${vy}: ${f.nyckel} sager "${f.text.slice(0, 70)}" — inte fixturens rost`);
      }
    }
    assert.deepEqual(fel, [], 'tomma tillstand utanfor formeln:\n  ' + fel.join('\n  '));
  } finally { await page.close() }
});

// ---- Prov 2 · ytan bar sig ---------------------------------------------------------------------
test('Statistik-vyn tacker minst 80 % av sin yta i tomt lage', { skip, timeout: 90000 }, async () => {
  const page = await oppnaStudio();
  try {
    await tillVy(page, 'analytics');
    const m = await page.evaluate(() => {
      const vy = document.querySelector('#view');
      const vr = vy.getBoundingClientRect();
      const vyYta = vr.width * Math.min(vr.height, 900 - vr.top);
      let kortYta = 0;
      vy.querySelectorAll('.card').forEach(c => {
        const r = c.getBoundingClientRect();
        if (r.width > 100 && r.height > 40 && r.top < 900) kortYta += r.width * Math.min(r.height, 900 - r.top);
      });
      return { tackning: Math.round(100 * Math.min(kortYta, vyYta) / vyYta) };
    });
    assert.ok(m.tackning >= 80,
      `Statistik tacker ${m.tackning} % av sin yta i tomt lage (krav >= 80 %) — ` +
      'placeholder-kropparna ska bara ytan, inte lamna naken bakgrund');
  } finally { await page.close() }
});
