'use strict';
// LIKE FOUNTAIN · PORTAL i en riktig webbläsare: likes från samma ström som Top Like ger hjärtan.
//
// Davids krav 2026-09-26: "När folk börjar tappa på skärmen så stiger hjärtan upp — den ska inte
// spela upp som video", och "den ska funka som Top Like". Provet skickar `vyra-live-event` precis
// som live-client.js gör för ett like-paket från TikTok, och kräver:
//   - i OBS-läget är widgeten tom tills någon tappar, och lever när de gör det
//   - historik (gamla event som spelas upp vid sidladdning) ger inga hjärtan
//   - inga två hjärtan eller profilbubblor på samma plats
//   - i studion syns en förhandsbild när ingen tappar, och katalogkortet skapar widgeten
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
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!window.VyraLikePortal, null, { timeout: 30000, polling: 100 });
  await page.evaluate(async () => { await window.VyraSessionState.projectLocalSession(); window.toast = () => {}; state.widgets.length = 0; });
  return { page, fel };
}
const like = (page, detalj) => page.evaluate(d => dispatchEvent(new CustomEvent('vyra-live-event', { detail: Object.assign({ type: 'like', at: Date.now() }, d) })), detalj);
const malad = (page, id) => page.evaluate(id => {
  const cv = document.querySelector(`.widget[data-id="${id}"] canvas.lfp-duk`); if (!cv || !cv.width) return 0;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0;
  for (let i = 3; i < d.length; i += 16) if (d[i] > 20) n++;
  return n;
}, id);

test('i OBS: tom när ingen tappar, hjärtan när tittarna tappar, historik ger inget', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida(true);
  try {
    const id = await page.evaluate(() => { const w = VyraWidgets.create('catalog:likefountain:portal'); state.widgets.push(w); render(); bind(); return w.id; });
    await page.waitForTimeout(400);
    const vila = await page.evaluate(id => getComputedStyle(document.querySelector(`.widget[data-id="${id}"] .lfp-still`)).display, id);
    assert.equal(vila, 'none', 'förhandsbilden syns i sändningen');
    assert.equal(await malad(page, id), 0, 'fontänen ritar något i OBS fast ingen tappat');

    await like(page, { count: 15, username: 'gammal', at: Date.now() - 120000 });
    await page.waitForTimeout(300);
    assert.equal((await page.evaluate(id => VyraLikePortal.tillstand(id), id) || { hjartan: 0 }).hjartan, 0, 'historik sprutade hjärtan');

    for (let i = 0; i < 12; i++) { await like(page, { count: 1 + (i % 5) * 3, username: 'tittare' + (i % 5), profileImage: 'assets/images/test-profile.svg' }); await page.waitForTimeout(120); }
    await page.waitForTimeout(700);
    const t = await page.evaluate(id => VyraLikePortal.tillstand(id), id);
    assert.ok(t && t.hjartan > 5, `för få hjärtan efter 12 like-paket: ${JSON.stringify(t)}`);
    assert.ok(t.bubblor >= 1, 'tittarnas profilbilder stiger inte med');
    assert.equal(new Set(t.platser).size, t.platser.length, 'två hjärtan på samma plats');
    assert.ok(await malad(page, id) > 50, 'duken är tom fast fontänen lever');
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});

test('i studion: katalogkortet skapar portalen hel på duken, med förhandsbild i vila', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida(false);
  try {
    const m = await page.evaluate(async () => {
      let k = null;
      for (let t = 0; t < 40 && !k; t++) { view = 'overlay'; render(); bind(); k = document.querySelector('[data-catalog-key="catalog:likefountain:portal"]'); if (!k) await new Promise(r => setTimeout(r, 250)); }
      if (!k) return { fel: 'katalogkortet saknas' };
      k.click(); const w = state.widgets[state.widgets.length - 1]; view = 'editor'; selected = null; render(); bind();
      await new Promise(r => setTimeout(r, 400));
      const el = document.querySelector(`.editor-shell .canvas .widget[data-id="${w.id}"]`);
      const d = window.VyraGrans.dukFor(el);
      return { design: w.fountainDesign, still: getComputedStyle(el.querySelector('.lfp-still')).display, hjartan: el.querySelectorAll('.lfp-still path').length,
        utanfor: window.VyraGrans.stickerUt(w.x, w.y, el.offsetWidth, el.offsetHeight, d), w: el.offsetWidth, h: el.offsetHeight };
    });
    assert.ok(!m.fel, m.fel);
    assert.equal(m.design, 'portal');
    assert.notEqual(m.still, 'none', 'förhandsbilden syns inte i studion');
    assert.ok(m.hjartan > 30, `förhandsbilden har bara ${m.hjartan} hjärtan`);
    assert.equal(m.utanfor, false, `portalen skapas utanför duken (${m.w}x${m.h})`);
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});

test('panelens testknapp ger hjärtan, och stora hjärtat poppar på milstolpen', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida(false);
  try {
    const id = await page.evaluate(() => { const w = VyraWidgets.create('catalog:likefountain:portal'); w.fountainPopEvery = 30; state.widgets.push(w); selected = w.id; view = 'editor'; render(); bind(); return w.id; });
    await page.waitForTimeout(300);
    await page.click('#lfpTest');
    await page.waitForTimeout(600);
    const efterTest = await page.evaluate(id => VyraLikePortal.tillstand(id), id);
    assert.ok(efterTest && efterTest.hjartan > 0, 'testknappen gav inga hjärtan');
    for (let i = 0; i < 3; i++) await like(page, { count: 10, username: 'spammare' });
    await page.waitForTimeout(200);
    assert.equal((await page.evaluate(id => VyraLikePortal.tillstand(id), id)).form, true, 'stora hjärtat startade inte vid 30 likes');
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});

// "TOP LIKE, LIKE FOUNTAIN OCH LIKE GOAL GÅR PÅ LIKES" (David 2026-09-26). Den klassiska fontänen
// rörde sig förr bara via en Action. Nu tar den samma like-paket som portalen, och Actions har
// ingen koppling till fontänerna alls.
test('den klassiska fontänen svarar också på likes, utan Action', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida(true);
  try {
    const id = await page.evaluate(() => {
      const w = VyraWidgets.create('catalog:likefountain'); state.widgets.push(w); render(); bind();
      return w.id;
    });
    await page.waitForTimeout(300);
    await like(page, { count: 5, username: 'tittare' });
    await page.waitForTimeout(150);
    const reagerade = await page.evaluate(id => document.querySelector(`[data-id="${id}"]`).classList.contains('lf-live-react'), id);
    assert.equal(reagerade, true, 'den klassiska fontänen reagerade inte på ett like-paket');
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});

// Svepet 2026-09-27: en render() innan like-fountain-portal.js hunnit laddas gick till den klassiska
// fontänens likeFountainHtml med paletten 'portal', som den inte har — och HELA render() kastade.
// likeFountainHtml är den oinslagna klassiska funktionen, så den kan anropas direkt.
test('den klassiska fontänen kraschar inte på en portal som ritas före sitt skript', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida(true);
  try {
    const m = await page.evaluate(() => {
      const w = VyraWidgets.create('catalog:likefountain:portal');
      const html = likeFountainHtml(w);
      const okand = likeFountainHtml(Object.assign(VyraWidgets.create('catalog:likefountain'), { fountainPalette: 'finns-inte' }));
      const d = document.createElement('div'); d.innerHTML = html; const el = d.firstElementChild;
      return { hjartan: d.querySelectorAll('.lf-p').length, b: parseInt(el.style.width), h: parseInt(el.style.height), bredd: w.width, okand: okand.includes('lf-p-heart') };
    });
    assert.equal(m.hjartan, 0, 'den klassiska fontänen ritade sina hjärtan i portalens ruta');
    assert.equal(m.b, m.bredd);
    assert.equal(m.h, Math.round(m.bredd * 768 / 432), 'rutan har inte portalens mått');
    assert.equal(m.okand, true, 'en okänd palett ska falla tillbaka, inte krascha');
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});
