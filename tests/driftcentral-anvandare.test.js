'use strict';
// Driftcentralens ruta "Användare" (operations.html + operations.js, GET /api/admin/anvandare).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const ROT = path.join(__dirname, '..');

function sida(svar) {
  const html = fs.readFileSync(path.join(ROT, 'operations.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://vyralive.app/operations.html' });
  const w = dom.window, begarda = [];
  w.VyraAuth = { api: async p => { begarda.push(p); if (p === '/api/admin/anvandare') { if (svar instanceof Error) throw svar; return svar; } return { tickets: [], verifieringar: [], antal: 0 }; } };
  w.eval(fs.readFileSync(path.join(ROT, 'operations.js'), 'utf8'));
  w.dispatchEvent(new w.CustomEvent('vyra-auth-ready', { detail: {} }));
  return { w, begarda, $: s => w.document.querySelector(s) };
}
const vanta = () => new Promise(r => setTimeout(r, 20));

test('rutan ligger överst och visar siffrorna med betan för sig', async () => {
  const { $, begarda, w } = sida({ ok: true, konton: { totalt: 47, aktiva: 46, verifieradEpost: 39, nya7d: 6, nya30d: 21 },
    inloggade: { dygn: 5, d7: 14, d30: 30 }, premium: { totalt: 23, beta: 20, betalande: 3 }, tiktok: { kopplade: 18, aktiva: 15, verifierade: 3 },
    uppdaterad: '2026-11-08T22:00:00Z' });
  await vanta();
  assert.ok(begarda.includes('/api/admin/anvandare'));
  const forsta = w.document.querySelector('main section.panel');
  assert.ok(forsta.classList.contains('anvandare'), 'Användare ska vara första rutan');
  const tal = [...w.document.querySelectorAll('#anvandare .siffra b')].map(b => b.textContent);
  assert.deepEqual(tal, ['47', '6', '5', '23', '18']);
  const text = $('#anvandare').textContent;
  assert.match(text, /3 betalande · 20 i betan/);
  assert.match(text, /14 senaste 7 d · 30 senaste 30 d/);
  assert.ok($('#anvandareUppdatera'), 'uppdateringsknappen finns');
});

test('uppdatera hämtar igen', async () => {
  const { $, begarda } = sida({ ok: true, konton: {}, inloggade: {}, premium: {}, tiktok: {} });
  await vanta();
  $('#anvandareUppdatera').click(); await vanta();
  assert.equal(begarda.filter(p => p === '/api/admin/anvandare').length, 2);
});

test('ett nekande (403) visas som text, och text från servern blir aldrig HTML', async () => {
  const { $ } = sida(new Error('<img src=x onerror=alert(1)>Plattformsadministratör krävs'));
  await vanta();
  assert.equal($('#anvandare img'), null);
  assert.match($('#anvandare').textContent, /Plattformsadministratör krävs/);
});
