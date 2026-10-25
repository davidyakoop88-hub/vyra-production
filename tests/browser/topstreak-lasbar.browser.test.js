'use strict';
// TOP STREAK ÄR LÄSBAR ÄVEN LITEN (2026-10-12).
//
// DAVIDS ORD: "ramarna syns knappt så tydliga — overlaylive.app har ramar som ser tydligt på liven
// men inte mina" och "grejen är när man har dem i mini läge (liten storlek) så ser man inte dem
// tydligt". Det finns ingen mini-inställning: det är när widgeten görs smal i sändningen.
//
// UPPMÄTT FÖRE: hela widgeten ritas i 760 px och skalas med transform:scale(bredd/760). Namnet stod
// fritt under ramen mot videon och renderade 8,5 designpx vid 120 px bredd (räknaren 6,9). Nu står
// namn och siffra på en mörk platta, båda har ett golv i designpx, och under 220 px byts ornamentramen
// mot en tjock ljus ring runt en större profilbild.
//
// Mätningen sker på den körande sidan i overlay-läge med en riktig gåva — inget demovärde.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (rel.startsWith('api/')) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{}'); return; }
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, bas;
const skip = hoppaOver();
test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) server.close(); });

const BREDDER = [120, 160, 200, 260, 320];

async function mat(modell, kompakt = false) {
  const sida = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  try {
    await sida.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
    await sida.waitForFunction(() => window.VyraPlaygroundWidgets && typeof render === 'function', null, { timeout: 60000 });
    await sida.waitForTimeout(400);
    return await sida.evaluate(async ({ modell, BREDDER, kompakt }) => {
      const st = window.eval('state'); st.widgets.length = 0;
      let x = 10; const ids = [];
      for (const b of BREDDER) {
        const w = VyraWidgets.create('catalog:pgstreak:' + modell);
        w.x = x; w.y = 10; w.width = b; w.kompaktLage = kompakt; st.widgets.push(w); ids.push(w.id); x += b + 40;
      }
      try { window.eval('selected=null') } catch (e) {}
      render();
      await new Promise(r => setTimeout(r, 700));
      VyraPlaygroundWidgets.feed({ type: 'gift', __test: true, username: 'NovaStorm_99', giftName: 'Rose', giftId: 1,
        diamonds: 1, giftImage: 'assets/gifts/events/0001_Rose.png', repeatCount: 27 });
      await new Promise(r => setTimeout(r, 1200));
      return ids.map((id, i) => {
        const el = document.querySelector(`[data-id="${id}"]`);
        const pgw = el.querySelector('.pgw'), nm = el.querySelector('.stk-nm'), cnt = el.querySelector('.stk-pill b');
        const info = el.querySelector('.stk-info'), frame = el.querySelector('.stk-frame'), av = el.querySelector('.stk-av');
        const s = +(/scale\(([\d.]+)\)/.exec(pgw.style.transform) || [0, 1])[1];
        const ic = getComputedStyle(info);
        const alfa = (/rgba?\(([^)]+)\)/.exec(ic.backgroundColor) || [0, '0,0,0,0'])[1].split(',').map(Number);
        return {
          bredd: BREDDER[i], namn: nm.textContent, siffra: cnt.textContent,
          namnPx: parseFloat(getComputedStyle(nm).fontSize) * s,
          sifferPx: parseFloat(getComputedStyle(cnt).fontSize) * s,
          plattaAlfa: alfa.length === 4 ? alfa[3] : 1,
          plattaKant: parseFloat(ic.borderTopWidth) * s,
          ramSyns: getComputedStyle(frame).display !== 'none',
          avatarPx: av.getBoundingClientRect().width,
        };
      });
    }, { modell, BREDDER, kompakt });
  } finally { await sida.close(); }
}

// royal-gold (gåvan i en egen liten cirkel) togs bort 2026-10-17 med de andra sex av den sorten;
// alla fem som finns kvar visar profil och gåva i samma cirkel. Två av dem provas.
// Kompaktläget är ett uttryckligt val (w.kompaktLage, granskningen 2026-10-25): utan valet behåller
// varje bredd ramkonsten, med valet ger smal bredd den stora ringen.
for (const modell of ['royal-wings', 'rose-wings']) {
  test(`Top Streak ${modell}: utan valt kompaktläge behåller varje bredd ramkonsten`, { skip, timeout: 120000 }, async () => {
    for (const r of await mat(modell)) {
      const id = `${modell} @ ${r.bredd} px: ${JSON.stringify(r)}`;
      assert.equal(r.namn, 'NovaStorm_99', id);
      assert.equal(r.ramSyns, true, `ramkonsten försvann av storleken — ${id}`);
      assert.ok(r.plattaAlfa >= 0.8, `plattan bakom namnet saknas — ${id}`);
    }
  });
  test(`Top Streak ${modell}: platta, textgolv och valt kompaktläge vid smal bredd`, { skip, timeout: 120000 }, async () => {
    const rader = await mat(modell, true);
    for (const r of rader) {
      const id = `${modell} @ ${r.bredd} px: ${JSON.stringify(r)}`;
      assert.equal(r.namn, 'NovaStorm_99', id);
      assert.ok(r.namnPx >= 12 - 0.05, `namnet under 12 designpx — ${id}`);
      assert.ok(r.sifferPx >= 12 - 0.05, `räknaren under 12 designpx — ${id}`);
      assert.ok(r.plattaAlfa >= 0.8, `plattan bakom namnet saknas eller är för genomskinlig — ${id}`);
      assert.ok(r.plattaKant >= 0.9, `plattans kant syns inte — ${id}`);
      // Valt kompaktläge gäller i alla bredder — det är ett val, inte en tröskel.
      assert.equal(r.ramSyns, false, `ornamentramen ska ge plats åt ringen i kompakt läge — ${id}`);
      assert.ok(r.avatarPx >= 0.55 * r.bredd, `profilbilden under 55 % av bredden — ${id}`);
      assert.ok(r.namnPx >= 14 - 0.05, `namnet ska vara större i kompakt läge — ${id}`);
    }
  });
}
