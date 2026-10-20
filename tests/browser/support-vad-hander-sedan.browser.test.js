'use strict';
// SUPPORT SÄGER VAD SOM HÄNDER EFTER ATT ETT ÄRENDE SKICKATS — UTAN ATT LOVA EN SVARSTID.
//
// Granskning 2026-10-17 F40: formuläret och ärendelistan fanns, men vyn sa inte när svar brukar
// komma eller hur brådskande driftproblem hanteras. Ingen svarstid är utlovad någonstans i
// projektet (docs, villkor, server), så vyn får inte hitta på en. Den ska i stället beskriva det
// som faktiskt sker: ärendet sparas och syns under Mina ärenden med sin status, och störningar
// publiceras på Driftstatus.
//
// Samma vy visade ärendets status och typ som serverns engelska nycklar ("in progress",
// "technical"). Provet låser de svenska namnen.
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

test('Support: vad som händer sedan, väg till Driftstatus, ingen påhittad svarstid, svenska statusar', { skip, timeout: 120000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  try {
    await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.render === 'function' && !!document.querySelector('aside [data-extra="support"]'), null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(1500);
    // Ärendelistan hämtas med VyraAuth.api; attrappen ger två ärenden med serverns nycklar.
    await page.evaluate(() => {
      const verklig = window.VyraAuth || {};
      window.VyraAuth = Object.assign(Object.create(verklig), { api: async url => /\/api\/support\/tickets$/.test(url)
        ? { ok: true, tickets: [
          { subject: 'Overlayen syns inte', category: 'technical', status: 'in_progress', updated_at: '2026-10-19T12:00:00Z' },
          { subject: 'Kvitto', category: 'billing', status: 'waiting', updated_at: '2026-10-18T12:00:00Z' }] }
        : {} });
    });
    await page.click('aside [data-extra="support"]');
    await page.waitForSelector('.support-form', { timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll('.support-list article').length === 2, null, { timeout: 10000, polling: 100 });
    const m = await page.evaluate(() => ({
      formular: document.querySelector('.support-form').innerText,
      statuslank: !!document.querySelector('.support-form a[href="status.html"]'),
      lista: document.querySelector('.support-list').innerText,
      vy: document.querySelector('#view').innerText,
    }));
    assert.match(m.formular, /Vad händer sedan/i, 'formuläret säger inte vad som händer efter att ärendet skickats');
    assert.match(m.formular, /Mina ärenden/, 'formuläret säger inte var ärendet syns');
    assert.ok(m.statuslank, 'formuläret pekar inte på Driftstatus för pågående störningar');
    assert.ok(!/inom \d|\d+\s*(timmar|tim|h|dagar|arbetsdagar)\b/i.test(m.vy), `vyn lovar en svarstid som inte finns någonstans i projektet: "${m.vy.slice(0, 300)}"`);
    assert.ok(!/in progress|technical|billing|waiting/i.test(m.lista), `ärendelistan visar serverns engelska nycklar: "${m.lista}"`);
    assert.match(m.lista, /Pågår/);
    assert.match(m.lista, /Tekniskt problem/);
  } finally { await page.close(); }
});
