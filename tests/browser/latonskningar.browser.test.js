'use strict';
// LÅTÖNSKNINGAR i en riktig webbläsare (latonskningar.js).
//
// Chattraderna skickas som `vyra-live-event`, precis som live-client.js gör. YouTube-sökningen och
// YouTube-spelaren byts mot stubbar (window.VyraLatSok / VyraLatSpela) — provmiljön når inte
// YouTube, och det som provas här är köns regler, inte Googles API. Spotify byts på samma sätt.
// Serverns sökning har egna prov: server/test/musik.test.js.
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
  await page.addInitScript(() => {
    window.__sokt = []; window.__spelat = []; window.__spotify = [];
    window.VyraLatSok = (u, q) => { window.__sokt.push(q); return Promise.resolve(/lång/.test(q) ? { videoId: 'langlanglan', titel: 'Lång', sekunder: 1200 } : { videoId: 'abcdefghijk', titel: q.toUpperCase(), kanal: 'Artist', sekunder: 200 }); };
    window.VyraLatSpela = id => window.__spelat.push(id);
  });
  await page.goto(`${bas}/studio.html${overlay ? '?overlay=1' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!window.VyraLatonskningar, null, { timeout: 30000, polling: 100 });
  await page.evaluate(async () => { await window.VyraSessionState.projectLocalSession(); window.toast = () => {}; state.widgets.length = 0; });
  return { page, fel };
}
const chatt = (page, d) => page.evaluate(d => dispatchEvent(new CustomEvent('vyra-live-event', { detail: Object.assign({ type: 'chat', id: 'e' + Math.random(), at: Date.now() }, d) })), d);
const ko = page => page.evaluate(() => VyraLatonskningar.ko());

test('YouTube i OBS: !önska köar och spelar, med väntetid, maxlängd, historik och !skip', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida(true);
  try {
    await page.evaluate(() => { const w = VyraWidgets.create('catalog:latonskningar:youtube'); state.widgets.push(w); render(); bind(); });
    await chatt(page, { username: 'gammal', comment: '!önska historik', at: Date.now() - 5 * 60000 });
    await chatt(page, { username: 'lina', comment: '!önska blinding lights' });
    await chatt(page, { username: 'lina', comment: '!önska en till direkt' });          // väntetid
    await chatt(page, { username: 'omar', type: 'chatcommand', name: '!sr levitating', comment: '' });  // lokala vägens form
    await chatt(page, { username: 'sara', comment: '!önska en lång låt' });             // för lång
    await chatt(page, { username: 'kim', comment: 'hej alla' });                       // inget kommando
    await page.waitForTimeout(500);
    const k = await ko(page);
    assert.deepEqual(k.map(x => [x.av, x.status]), [['lina', 'spelar'], ['omar', 'redo'], ['sara', 'fel']]);
    assert.match(k[2].fel, /För lång/);
    assert.deepEqual(await page.evaluate(() => window.__sokt), ['blinding lights', 'levitating', 'en lång låt'], 'historik eller väntetid gav en sökning');
    assert.equal((await page.evaluate(() => window.__spelat)).length, 1, 'två låtar spelas samtidigt');
    assert.match(await page.evaluate(() => document.querySelector('.widget.latonskningar').textContent), /BLINDING LIGHTS[\s\S]*LEVITATING/);

    await chatt(page, { username: 'tittare', comment: '!skip' });                       // inte moderator
    await page.waitForTimeout(200);
    assert.equal((await ko(page))[0].status, 'spelar', 'en vanlig tittare kunde hoppa över låten');
    await chatt(page, { username: 'moddan', comment: '!skip', isModerator: true });
    await page.waitForTimeout(200);
    assert.deepEqual((await ko(page)).slice(0, 2).map(x => x.status), ['spelad', 'spelar'], '!skip från en moderator startade inte nästa låt');

    await page.evaluate(() => VyraLatKlar());                                            // låten tog slut
    await page.waitForTimeout(200);
    assert.equal((await ko(page))[1].status, 'spelad');
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});

test('Spotify i studion: varje önskning läggs i Spotify-kön exakt en gång', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida(false);
  try {
    await page.evaluate(() => {
      window.VyraSpotify = Object.assign({}, window.VyraSpotify, { queue: q => { window.__spotify.push(q); return Promise.resolve({ uri: 'spotify:track:x', titel: q, artist: 'A' }); } });
      const w = VyraWidgets.create('catalog:latonskningar:spotify'); state.widgets.push(w); view = 'editor'; render(); bind();
    });
    await chatt(page, { username: 'lina', comment: '!önska blinding lights', id: 'samma' });
    await chatt(page, { username: 'lina', comment: '!önska blinding lights', id: 'samma' });   // samma event två gånger
    await chatt(page, { username: 'omar', comment: '!önska Blinding Lights' });                // samma låt nyss önskad
    await chatt(page, { username: 'sara', comment: '!önska as it was' });
    await page.waitForTimeout(500);
    assert.deepEqual(await page.evaluate(() => window.__spotify), ['blinding lights', 'as it was']);
    assert.deepEqual((await ko(page)).map(x => x.status), ['skickad', 'skickad']);
    assert.deepEqual(await page.evaluate(() => window.__spelat), [], 'studion spelade upp något själv');
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});

test('i studion: båda källorna finns i katalogen och skapas hela på duken', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida(false);
  try {
    const m = await page.evaluate(async () => {
      const ut = {};
      for (const nyckel of ['catalog:latonskningar:youtube', 'catalog:latonskningar:spotify']) {
        let k = null;
        for (let t = 0; t < 40 && !k; t++) { view = 'overlay'; render(); bind(); k = document.querySelector(`[data-catalog-key="${nyckel}"]`); if (!k) await new Promise(r => setTimeout(r, 250)); }
        if (!k) return { fel: 'katalogkortet saknas: ' + nyckel };
        k.click();
        const w = state.widgets[state.widgets.length - 1];
        view = 'editor'; selected = null; render(); bind();
        await new Promise(r => setTimeout(r, 300));
        const el = document.querySelector(`.editor-shell .canvas .widget[data-id="${w.id}"]`);
        ut[nyckel] = { kalla: w.latKalla, utanfor: window.VyraGrans.stickerUt(w.x, w.y, el.offsetWidth, el.offsetHeight, window.VyraGrans.dukFor(el)), b: el.offsetWidth, h: el.offsetHeight };
      }
      return ut;
    });
    assert.ok(!m.fel, m.fel);
    assert.equal(m['catalog:latonskningar:youtube'].kalla, 'youtube');
    assert.equal(m['catalog:latonskningar:spotify'].kalla, 'spotify');
    for (const k of Object.keys(m)) assert.equal(m[k].utanfor, false, `${k} skapas utanför duken (${m[k].b}x${m[k].h})`);
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});
