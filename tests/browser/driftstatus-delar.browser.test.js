'use strict';
// DRIFTSTATUS VISAR DELAR, TIDSZON OCH NÄR STATUSEN INTE ÄR FÄRSK.
//
// Granskning 2026-10-17 F39: status.html visade bara "Alla system fungerar". Inga separata delar,
// och tidsstämpeln saknade tidszon. Rekommendationen: visa delarna separat, ange tidszon och märk
// när statusen inte längre är färsk.
//
// Delarna kommer från GET /api/health (redan publik: postgres och redis) — API-kontraktet är
// oförändrat. TikTok-anslutning och betalning har ingen mätning i API:t, och sidan ska säga det
// i stället för att visa en grön prick utan mätning bakom. Proven svarar på API-anropen med
// page.route, så de kör utan server.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const BAS = 'https://vyra-status.test';
let browser, skip = hoppaOver();
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('webblasaren kunde inte starta'); });
test.after(async () => { if (browser) await browser.close(); });

async function sidan({ status, health, healthKod = 200 }) {
  const context = await browser.newContext({ timezoneId: 'Europe/Stockholm', locale: 'sv-SE' });
  const page = await context.newPage();
  await page.route(BAS + '/**', route => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '');
    if (rel === 'api/public/status') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) });
    if (rel === 'api/health') return health === null ? route.abort() : route.fulfill({ status: healthKod, contentType: 'application/json', body: JSON.stringify(health) });
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) return route.fulfill({ status: 404, body: 'nej' });
    return route.fulfill({ status: 200, contentType: MIME[path.extname(fil)] || 'application/octet-stream', body: fs.readFileSync(fil) });
  });
  await page.goto(`${BAS}/status.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !/Kontrollerar/.test(document.querySelector('#statusTitle').textContent), null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(300);
  return { page, context };
}
const las = page => page.evaluate(() => ({
  titel: document.querySelector('#statusTitle').innerText,
  kontrollerad: document.querySelector('#checkedAt').innerText,
  kort: document.querySelector('.status-card').className,
  delar: [...document.querySelectorAll('#components li')].map(li => li.innerText.replace(/\s+/g, ' ').trim()),
  hela: document.body.innerText,
}));
const friskt = { postgres: true, redis: true, sse: 3, tiktokBridge: { lastEventSecondsAgo: null } };

test('allt fungerar: delarna listas separat och tiden har tidszon', { skip, timeout: 60000 }, async () => {
  const { page, context } = await sidan({ status: { ok: true, overall: 'operational', checkedAt: new Date().toISOString(), incidents: [] }, health: { status: 'ok', timestamp: new Date().toISOString(), services: friskt } });
  try {
    const m = await las(page);
    assert.equal(m.titel, 'Alla system fungerar');
    assert.ok(m.delar.length >= 3, `sidan visar bara en sammanfattning, inga delar (${JSON.stringify(m.delar)})`);
    assert.ok(m.delar.some(d => /Inloggning och molnsynk/.test(d) && /Fungerar/.test(d)), JSON.stringify(m.delar));
    assert.ok(m.delar.some(d => /Realtid/.test(d) && /Fungerar/.test(d)), JSON.stringify(m.delar));
    assert.ok(m.delar.some(d => /TikTok/.test(d) && /Ingen automatisk kontroll/.test(d)), 'TikTok och betalning ska sägas vara omätta, inte gröna');
    assert.match(m.kontrollerad, /CES?T|GMT|UTC/, `tidsstämpeln saknar tidszon: "${m.kontrollerad}"`);
    assert.ok(!/inte färsk/.test(m.kontrollerad));
  } finally { await context.close(); }
});

test('databasen nere (503 från /api/health): delen visar störning', { skip, timeout: 60000 }, async () => {
  const { page, context } = await sidan({ status: { ok: true, overall: 'degraded', checkedAt: new Date().toISOString(), incidents: [] }, health: { status: 'degraded', timestamp: new Date().toISOString(), services: { ...friskt, postgres: false } }, healthKod: 503 });
  try {
    const m = await las(page);
    assert.ok(m.delar.some(d => /Inloggning och molnsynk/.test(d) && /Störning/.test(d)), JSON.stringify(m.delar));
    assert.ok(m.delar.some(d => /Realtid/.test(d) && /Fungerar/.test(d)), JSON.stringify(m.delar));
  } finally { await context.close(); }
});

test('en gammal kontroll märks som inte färsk', { skip, timeout: 60000 }, async () => {
  const gammal = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { page, context } = await sidan({ status: { ok: true, overall: 'operational', checkedAt: gammal, incidents: [] }, health: null });
  try {
    const m = await las(page);
    assert.match(m.kontrollerad, /inte färsk/, `en 30 minuter gammal kontroll märks inte: "${m.kontrollerad}"`);
    assert.match(m.kort, /inaktuell/);
    assert.ok(m.delar.some(d => /Kunde inte kontrolleras/.test(d)), 'utan svar från /api/health ska delarna säga att de inte kunde kontrolleras');
  } finally { await context.close(); }
});
