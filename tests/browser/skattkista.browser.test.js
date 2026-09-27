'use strict';
// SKATTKISTAN i en riktig webbläsare (skattkista.js).
//
// Händelsen skickas som `vyra-live-event` med typen envelope, precis som live-client.js gör när
// bryggan vidarebefordrat en ENVELOPE (tiktok-bridge/normalizer.js envelopeFields). Provet kräver:
//   - i OBS-läget är widgeten osynlig i vila och syns när en kista kommer, med rätt nedräkning
//   - nedräkningen går, och kistan öppnas när tiden är ute
//   - historik (en kista som öppnades för länge sedan) visas inte igen
//   - "kistan döljs" från TikTok tar bort den
//   - i studion finns båda designerna i katalogen, skapas hela på duken, och panelen byter design
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp' };
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

async function sida(overlay) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 950 } });
  const fel = []; page.on('pageerror', e => fel.push(e.message));
  await page.goto(`${bas}/studio.html${overlay ? '?overlay=1' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!window.VyraSkattkista, null, { timeout: 30000, polling: 100 });
  await page.evaluate(async () => { await window.VyraSessionState.projectLocalSession(); window.toast = () => {}; state.widgets.length = 0; });
  return { page, fel };
}
const kista = (page, d) => page.evaluate(d => dispatchEvent(new CustomEvent('vyra-live-event', { detail: Object.assign({ type: 'envelope', at: Date.now() }, d) })), d);
const las = (page, id) => page.evaluate(id => {
  const el = document.querySelector(`.widget.skattkista[data-id="${id}"]`);
  const k = el.querySelector('.sk-klocka');
  return { synlig: getComputedStyle(el).visibility !== 'hidden', klass: el.className, klocka: k ? k.textContent : '', text: el.textContent };
}, id);

test('i OBS: osynlig i vila, nedräkning när en kista kommer, öppnas när tiden är ute', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida(true);
  try {
    const id = await page.evaluate(() => { const w = VyraWidgets.create('catalog:skattkista:kista'); state.widgets.push(w); render(); bind(); return w.id; });
    await page.waitForTimeout(300);
    assert.equal((await las(page, id)).synlig, false, 'kistan syns i sändningen fast ingen kista finns');

    await kista(page, { kistaId: 'gammal', name: 'Förr', diamonds: 50, oppnasAt: Date.now() - 5 * 60000, at: Date.now() - 6 * 60000 });
    await page.waitForTimeout(300);
    assert.equal((await las(page, id)).synlig, false, 'historik visade en kista som öppnades för fem minuter sedan');

    await kista(page, { kistaId: 'k1', name: 'Lina', diamonds: 100, count: 12, oppnasAt: Date.now() + 3200 });
    await page.waitForTimeout(400);
    const forst = await las(page, id);
    assert.equal(forst.synlig, true, 'kistan syns inte när den kommer');
    assert.match(forst.klocka, /^00:0[34]$/, `fel nedräkning: ${forst.klocka}`);
    assert.match(forst.text, /Lina/);
    assert.match(forst.text, /100/);
    assert.match(forst.klass, /sk-snart/, 'kistan skakar inte de sista tio sekunderna');

    await page.waitForTimeout(1200);
    const sedan = await las(page, id);
    assert.notEqual(sedan.klocka, forst.klocka, 'nedräkningen står still');

    await page.waitForTimeout(2600);
    const oppen = await las(page, id);
    assert.equal(oppen.klocka, 'ÖPPNA NU!');
    assert.match(oppen.klass, /sk-oppen/);
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});

test('i OBS: när TikTok döljer kistan försvinner den', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida(true);
  try {
    const id = await page.evaluate(() => { const w = VyraWidgets.create('catalog:skattkista:pill'); state.widgets.push(w); render(); bind(); return w.id; });
    await kista(page, { kistaId: 'k2', name: 'Omar', diamonds: 500, oppnasAt: Date.now() + 60000 });
    await page.waitForTimeout(400);
    assert.equal((await las(page, id)).synlig, true);
    await kista(page, { kistaId: 'k2', kistaDold: true });
    await page.waitForTimeout(3800);
    assert.equal((await las(page, id)).synlig, false, 'en dold kista står kvar i sändningen');
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});

test('i studion: båda designerna finns i katalogen, skapas hela på duken, och panelen byter design', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida(false);
  try {
    const m = await page.evaluate(async () => {
      const ut = {};
      for (const nyckel of ['catalog:skattkista:kista', 'catalog:skattkista:pill']) {
        let k = null;
        for (let t = 0; t < 40 && !k; t++) { view = 'overlay'; render(); bind(); k = document.querySelector(`[data-catalog-key="${nyckel}"]`); if (!k) await new Promise(r => setTimeout(r, 250)); }
        if (!k) return { fel: 'katalogkortet saknas: ' + nyckel };
        k.click();
        const w = state.widgets[state.widgets.length - 1];
        view = 'editor'; selected = null; render(); bind();
        await new Promise(r => setTimeout(r, 300));
        const el = document.querySelector(`.editor-shell .canvas .widget[data-id="${w.id}"]`);
        const d = window.VyraGrans.dukFor(el);
        ut[nyckel] = { design: w.kistaDesign, forhand: el.classList.contains('sk-forhandsvisning'), synlig: getComputedStyle(el).visibility !== 'hidden',
          utanfor: window.VyraGrans.stickerUt(w.x, w.y, el.offsetWidth, el.offsetHeight, d), b: el.offsetWidth, h: el.offsetHeight, id: w.id };
      }
      const w = state.widgets.find(x => x.kistaDesign === 'kista');
      selected = w.id; view = 'editor'; render(); bind();
      const sel = document.querySelector('#skDesign');
      if (!sel) return { fel: 'panelen saknar designväljaren' };
      sel.value = 'pill'; sel.dispatchEvent(new Event('change'));
      await new Promise(r => setTimeout(r, 200));
      ut.bytt = { design: w.kistaDesign, pill: !!document.querySelector(`.widget[data-id="${w.id}"] .sk-pill`) };
      return ut;
    });
    assert.ok(!m.fel, m.fel);
    for (const nyckel of ['catalog:skattkista:kista', 'catalog:skattkista:pill']) {
      const x = m[nyckel];
      assert.equal(x.forhand, true, `${nyckel}: ingen förhandsbild i studion`);
      assert.equal(x.synlig, true, `${nyckel}: osynlig i studion`);
      assert.equal(x.utanfor, false, `${nyckel}: skapas utanför duken (${x.b}x${x.h})`);
    }
    assert.equal(m['catalog:skattkista:pill'].design, 'pill');
    assert.deepEqual(m.bytt, { design: 'pill', pill: true }, 'panelen bytte inte design');
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});
