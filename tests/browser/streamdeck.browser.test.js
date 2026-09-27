'use strict';
// STREAM DECK i en riktig webbläsare (streamdeck.js): varje kommando körs på rätt sida och bara en
// gång, sidan finns i menyn, och den nedladdade .streamDeckPlugin är en giltig zip med alla filer.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
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

async function sida(fraga) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const fel = []; page.on('pageerror', e => fel.push(e.message));
  await page.goto(`${bas}/studio.html${fraga || ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!window.VyraStreamDeck, null, { timeout: 30000, polling: 100 });
  await page.evaluate(async () => { await window.VyraSessionState.projectLocalSession(); window.toast = () => {}; });
  return { page, fel };
}
const tryck = (page, d) => page.evaluate(d => dispatchEvent(new CustomEvent('vyra-live-event', { detail: Object.assign({ type: 'streamdeck', eventKey: 'sd:' + Math.random() }, d) })), d);

test('i studion: widget och timer körs en gång; ljud, uppläsning och Action lämnas åt overlayn', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida('');
  try {
    await page.evaluate(() => {
      window.__kort = [];
      window.VyraActionRuntime = { execute: d => window.__kort.push(d.action.types[0]) };
      state.widgets.length = 0;
      const w = VyraWidgets.create('catalog:skattkista:kista'); w.title = 'Min kista'; state.widgets.push(w);
      localStorage.setItem('vyra-action-event-v2', JSON.stringify({ actions: [{ id: 'a1', name: 'Fyrverkeri', types: ['overlay'] }], events: [], timers: [{ id: 't1', actionId: 'a1', enabled: false, intervalMinutes: 5 }] }));
      view = 'editor'; render();
    });
    await tryck(page, { eventKey: 'sd:samma', sdKommando: 'widget', sdVarde: 'min kista', sdVal: 'gom' });
    await tryck(page, { eventKey: 'sd:samma', sdKommando: 'widget', sdVarde: 'min kista', sdVal: 'vaxla' });   // samma tryck igen
    await tryck(page, { sdKommando: 'timer', sdVarde: 'Fyrverkeri', sdVal: 'start' });
    await tryck(page, { sdKommando: 'ljud', sdVarde: 'Airhorn' });
    await tryck(page, { sdKommando: 'tts', sdVarde: 'Hej' });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({
      dold: liveWidget(state.widgets[0].id).hidden,
      timer: JSON.parse(localStorage.getItem('vyra-action-event-v2')).timers[0].enabled,
      kort: window.__kort
    }));
    assert.equal(m.dold, true, 'widgeten göms inte, eller togs samma tryck två gånger');
    assert.equal(m.timer, true, 'timern startades inte');
    assert.deepEqual(m.kort, [], 'studion spelade ljud eller uppläsning — det hörs då två gånger');
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});

test('i OBS scen 1: ljud och uppläsning spelas; widget och timer rörs inte', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida('?overlay=1&scene=1');
  try {
    await page.evaluate(() => { window.__kort = []; window.VyraActionRuntime = { execute: d => window.__kort.push(d.action.types[0] + ':' + (d.action.config ? d.action.config.ttsText : d.action.audioMedia.packagePath)) }; });
    const ljud = await page.evaluate(() => saSounds()[0].name);
    await tryck(page, { sdKommando: 'ljud', sdVarde: ljud });
    await tryck(page, { sdKommando: 'tts', sdVarde: 'Tack för gåvan' });
    await tryck(page, { sdKommando: 'widget', sdVarde: 'vad som helst', sdVal: 'gom' });
    await page.waitForTimeout(300);
    const kort = await page.evaluate(() => window.__kort);
    assert.equal(kort.length, 2, JSON.stringify(kort));
    assert.match(kort[0], /^audio:/);
    assert.equal(kort[1], 'tts:Tack för gåvan');
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});

test('Stream Deck finns i menyn och nedladdningen är en giltig zip med hela pluginet', { skip, timeout: 90000 }, async () => {
  const { page, fel } = await sida('');
  try {
    await page.click('[data-extra="streamdeck"]');
    await page.waitForFunction(() => document.querySelectorAll('.sd-ruta').length > 0, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => document.querySelector('#title').textContent), 'Stream Deck');
    const b64 = await page.evaluate(async () => {
      const filer = await VyraStreamDeck.pluginFiler();
      const buf = new Uint8Array(await VyraStreamDeck.zip(filer).arrayBuffer());
      let s = ''; for (const x of buf) s += String.fromCharCode(x); return btoa(s);
    });
    const zip = Buffer.from(b64, 'base64');
    const slut = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    assert.ok(slut > 0, 'ingen slutpost — inte en zip');
    const antal = zip.readUInt16LE(slut + 10), katalog = zip.readUInt32LE(slut + 16);
    const namn = [];
    for (let i = 0, p = katalog; i < antal; i++) {
      assert.equal(zip.readUInt32LE(p), 0x02014b50);
      const crc = zip.readUInt32LE(p + 16), storlek = zip.readUInt32LE(p + 20), nl = zip.readUInt16LE(p + 28), lokal = zip.readUInt32LE(p + 42);
      const n = zip.slice(p + 46, p + 46 + nl).toString('utf8'); namn.push(n);
      const data = zip.slice(lokal + 30 + zip.readUInt16LE(lokal + 26), lokal + 30 + zip.readUInt16LE(lokal + 26) + storlek);
      assert.equal(zlib.crc32(data), crc, `${n}: fel CRC`);
      const fil = path.join(ROOT, 'streamdeck-plugin', n);
      assert.ok(Buffer.compare(data, fs.readFileSync(fil)) === 0, `${n} skiljer sig från filen i repot`);
      p += 46 + nl + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
    }
    for (const n of ['manifest.json', 'plugin.js', 'pi.html', 'sdk-ljud.png', 'sdk-ljud@2x.png']) assert.ok(namn.includes('se.vyra.live.sdPlugin/' + n), `${n} saknas i zippen`);
    assert.deepEqual(fel, []);
  } finally { await page.close(); }
});
