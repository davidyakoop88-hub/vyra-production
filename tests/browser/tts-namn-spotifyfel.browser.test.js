'use strict';
// SÄNDNINGEN 2026-10-23: TRE FEL SOM SÅG UT SOM "DET FUNKAR INTE".
//
//   * TTS tystnade: molnrösten svarade inte, felet fångades och raden gick vidare oläst.
//     Nu läser datorns egen röst upp samma rad. Och `Number(undefined) ?? 1` är NaN, som
//     SpeechSynthesisUtterance kastar på — en lokal röst utan satt tonhöjd sa ingenting alls.
//   * Paris stod som 💙 i topplistan: på chattrader bär `name` KOMMENTAREN
//     (tiktok-bridge/normalizer.js, "name AR OVERLASTAT MED FLIT"), och listan tog den som namn.
//     TTS läste av samma skäl kommentaren två gånger i "{name} säger {comment}".
//   * Spotify-testet sa "Ingen låt spelas just nu" även när Spotify svarade med ett fel.
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

async function sida(fore) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 950 } });
  if (fore) await fore(ctx);
  const page = await ctx.newPage();
  const fel = []; page.on('pageerror', e => fel.push(e.message));
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.VyraTtsChat && !!window.VyraLeaderboard && !!window.VyraSpotifyKommandon, null, { timeout: 30000, polling: 100 });
  return { ctx, page, fel };
}

test('TTS: en molnröst som faller läses upp av datorns röst, även utan satt tonhöjd', { skip, timeout: 90000 }, async () => {
  const { ctx, page, fel } = await sida();
  try {
    const talat = await page.evaluate(async () => {
      const ut = [];
      speechSynthesis.speak = u => { ut.push([u.text, u.pitch, Math.round(u.volume * 100) / 100]); setTimeout(() => u.onend && u.onend(), 5); };
      window.VyraAuth = Object.assign({}, window.VyraAuth, { api: () => Promise.reject(new Error('502')), lastDetail: () => ({ workspaces: [{ id: 'ws1' }] }) });
      await VyraTtsChat.tala('Hej Paris', { voice: 'cloud:sv-SE-MattiasNeural' });
      return ut;
    });
    assert.deepEqual(talat, [['Hej Paris', 1, 0.8]], 'raden försvann tyst när molnrösten föll');
    assert.deepEqual(fel, []);
  } finally { await ctx.close(); }
});

test('topplistan: en chattrad skriver inte över tittarens namn', { skip, timeout: 90000 }, async () => {
  const { ctx, page, fel } = await sida();
  try {
    const m = await page.evaluate(() => {
      const ev = d => dispatchEvent(new CustomEvent('vyra-live-event', { detail: d }));
      ev({ id: 'g1', type: 'gift', username: 'paris', name: 'Paris AM', diamonds: 5, giftName: 'Rose' });
      ev({ id: 'c1', type: 'chat', username: 'paris', name: '💙', comment: '💙' });   // molnvägen
      ev({ id: 'c2', type: 'chat', username: 'paris', name: 'hej alla' });             // desktopvägen
      ev({ id: 'c3', type: 'chat', username: 'ny', name: 'första raden', comment: 'första raden' });
      ev({ id: 'l1', type: 'like', username: 'ny', count: 3 });
      return { paris: VyraLeaderboard.getTop('diamonds', 1)[0].name, ny: VyraLeaderboard.getTop('likes', 1)[0].name };
    });
    assert.equal(m.paris, 'Paris AM', 'kommentaren ersatte tittarens namn');
    assert.equal(m.ny, 'ny', 'en ny tittare fick sin första kommentar som namn');
    assert.deepEqual(fel, []);
  } finally { await ctx.close(); }
});

test('Spotify-testet visar Spotifys fel i stället för "Ingen låt spelas"', { skip, timeout: 90000 }, async () => {
  const { ctx, page, fel } = await sida(async c => {
    await c.route('https://api.spotify.com/**', r => r.request().url().includes('currently-playing')
      ? r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { status: 429, message: 'API rate limit exceeded' } }) })
      : r.fulfill({ status: 200, contentType: 'application/json', body: '{"display_name":"Jokero"}' }));
    await c.addInitScript(() => localStorage.setItem('vyra-spotify-token-v1', JSON.stringify({ accessToken: 'x', refreshToken: 'y', expiresAt: Date.now() + 3600e3 })));
  });
  try {
    const toasts = await page.evaluate(async () => {
      const ut = []; window.toast = t => ut.push(t);
      let knapp = null;
      for (let i = 0; i < 20 && !knapp; i++) {
        knapp = document.querySelector('[data-spk-testa-song]');
        if (!knapp) { document.querySelector('[data-extra="spotify"]')?.click(); await new Promise(r => setTimeout(r, 300)); }
      }
      if (!knapp) return ['knappen saknas'];
      knapp.click();
      await new Promise(r => setTimeout(r, 1500));
      return ut;
    });
    assert.deepEqual(toasts, ['Spotify-fel: API rate limit exceeded']);
    assert.deepEqual(fel, []);
  } finally { await ctx.close(); }
});
