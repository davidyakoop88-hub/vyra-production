'use strict';
// GLOVE SNIPE RITAS INOM SIN EGEN RUTA — HELA ANIMATIONEN, I VARJE OBS-STORLEK.
//
// Uppmätt 2026-09-27 före fixen (battle-pack-images.css):
//   - X2/X3-symbolen låg 75 px ovanför rutan redan i vila och 97 px när vyraPackHero lyfte den
//     på slutet. Drogs widgeten upp mot kanten klipptes animationen utan varning.
//   - höjden var 23vw: 150 px i en OBS-källa som är 432 bred, 248 px i en som är 1080 bred.
//     Samma layout såg olika ut beroende på OBS-inställningen.
//   - centreringen (left:50% + translateX(-50%)) skrevs över av animationens transform, så
//     symbolen hamnade i rutans högra halva.
//
// Provet spelar upp animationen och tar ett prov var 100:e ms i hela förloppet.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''), fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' }); fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}
let server, browser, bas, skip = hoppaOver();
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('webblasaren kunde inte starta'); server = await servera(); bas = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { if (browser) await browser.close(); if (server) await new Promise(r => server.close(r)); });

async function spela(bredd, hojd, nyckel) {
  const page = await browser.newPage({ viewport: { width: bredd, height: hojd } });
  const fel = []; page.on('pageerror', e => fel.push(e.message));
  try {
    await page.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraWidgets && !!window.VyraSessionState, null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(800);
    const m = await page.evaluate(async nyckel => {
      await VyraSessionState.projectLocalSession(); window.toast = () => {};
      state.widgets.length = 0;
      const w = VyraWidgets.create(nyckel); state.widgets.push(w); render();
      await new Promise(r => setTimeout(r, 400));
      triggerGloveSnipe({});
      let varst = 0, vad = '', symH = 0, mitt = 0;
      for (let t = 0; t < 62; t++) {
        await new Promise(r => setTimeout(r, 100));
        const el = document.querySelector(`.widget[data-id="${w.id}"]`), r0 = el.getBoundingClientRect(), sk = r0.width / el.offsetWidth;
        const s = el.querySelector('.battle-image-symbol');
        if (s) { symH = s.offsetHeight; mitt = Math.round(s.offsetLeft + s.offsetWidth / 2 - el.offsetWidth / 2); }
        for (const n of el.querySelectorAll('*')) {
          const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
          if (!r.height || cs.opacity === '0' || cs.visibility === 'hidden' || cs.display === 'none') continue;
          const o = Math.max((r0.top - r.top) / sk, (r.bottom - r0.bottom) / sk, (r0.left - r.left) / sk, (r.right - r0.right) / sk);
          if (o > varst) { varst = o; vad = `${n.tagName}.${String(n.className).split(' ')[0]} vid ${t * 100} ms`; }
        }
      }
      const el = document.querySelector(`.widget[data-id="${w.id}"]`);
      return { varst: Math.round(varst), vad, symH, mitt, x: w.x, y: w.y, b: el.offsetWidth, h: el.offsetHeight };
    }, nyckel);
    assert.deepEqual(fel, []);
    return m;
  } finally { await page.close(); }
}

for (const nyckel of ['catalog:glovesnipe:koiPearl:boost:3', 'catalog:glovesnipe:masquerade:glove:2']) {
  test(`${nyckel}: hela animationen ryms i rutan, lika stor och centrerad i varje OBS-storlek`, { skip, timeout: 120000 }, async () => {
    const liten = await spela(432, 768, nyckel), stor = await spela(1080, 1920, nyckel);
    for (const m of [liten, stor]) {
      assert.ok(m.varst <= 1, `sticker ut ${m.varst} px ur rutan (${m.vad})`);
      assert.ok(Math.abs(m.mitt) <= 1, `symbolen är inte centrerad: ${m.mitt} px från mitten`);
      assert.ok(m.x >= 0 && m.y >= 0 && m.x + m.b <= 432 && m.y + m.h <= 768, `skapas utanför duken: ${JSON.stringify(m)}`);
    }
    assert.equal(liten.symH, stor.symH, `symbolen är ${liten.symH} px i en 432-källa men ${stor.symH} px i en 1080-källa`);
  });
}
