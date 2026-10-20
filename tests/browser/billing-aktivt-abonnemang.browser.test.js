'use strict';
// ETT AKTIVT ABONNEMANG MÖTS AV SITT ABONNEMANG, INTE AV ETT SÄLJERBJUDANDE.
//
// Granskning 2026-10-17 F13: kontot visade Premium och automatisk förnyelse, men rutan dominerades
// av "$15" och "3 dagar gratis" — samma säljruta som en ny kund får. Nästa betalningsdatum och
// aktuell period syntes inte. Rekommendationen: visa aktiv plan, nästa debitering, belopp och
// eventuell uppsägning först, och provperiodserbjudandet bara för den som inte har ett abonnemang.
//
// Provet kör billing-client.js mot en attrapp av VyraAuth/VyraCloudSync (samma rigg som
// uppsagningsknappen.browser.test.js) och läser innerText, alltså det som faktiskt syns.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});


async function panelen(info) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#view') && !!window.VyraBilling, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(1200);
  await page.evaluate(info => {
    window.VyraCloudSync = { current: () => ({ workspace: { id: 'w-prov' } }) };
    window.VyraAuth = { api: async () => info };
    window.VyraBilling.open();
  }, info);
  await page.waitForFunction(() => !!document.querySelector('.billing-modal'), null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(400);
  return page;
}
const las = page => page.evaluate(() => {
  const s = document.querySelector('.billing-modal section'), text = s.innerText;
  const aktiv = s.querySelector('.billing-aktiv'), knappar = s.querySelector('.billing-actions');
  return {
    text,
    rubrik: (s.querySelector('h2') || {}).innerText || '',
    aktivSyns: !!aktiv && aktiv.getBoundingClientRect().height > 0,
    aktivText: aktiv ? aktiv.innerText : '',
    aktivForeKnappar: !!aktiv && aktiv.getBoundingClientRect().bottom <= knappar.getBoundingClientRect().top,
  };
});

test('aktivt Premium: plan, nästa debitering och belopp först — inget provperiodserbjudande', { skip }, async () => {
  const page = await panelen({ plan: 'premium', subscription: { status: 'active', cancel_at_period_end: false, current_period_end: '2026-11-12T10:00:00.000Z' } });
  try {
    const m = await las(page);
    assert.ok(!/3 dagar gratis/i.test(m.text), `ett betalande konto erbjuds provperioden: "${m.text.slice(0, 200)}"`);
    assert.ok(!/\$15/.test(m.text), 'säljpriset "$15" dominerar fortfarande rutan');
    assert.ok(m.aktivSyns, 'aktiv plan och nästa debitering visas inte');
    assert.ok(m.aktivForeKnappar, 'abonnemangsuppgifterna ska stå före knapparna');
    assert.match(m.rubrik, /abonnemang/i, `rubriken säljer fortfarande: "${m.rubrik}"`);
    assert.match(m.aktivText, /Premium/);
    assert.match(m.aktivText, /Nästa debitering/i);
    assert.match(m.aktivText, /2026-11-12/, 'nästa debiteringsdatum saknas');
    assert.match(m.aktivText, /15 USD/, 'beloppet saknas');
  } finally { await page.close(); }
});

test('provperiod: första debiteringen är provperiodens slut', { skip }, async () => {
  const page = await panelen({ plan: 'premium', subscription: { status: 'trialing', cancel_at_period_end: false, trial_end: '2026-10-23T10:00:00.000Z', current_period_end: '2026-10-23T10:00:00.000Z' } });
  try {
    const m = await las(page);
    assert.ok(!/Starta 3 dagar gratis/i.test(m.text), 'den som redan har provperioden erbjuds att starta den');
    assert.match(m.aktivText, /provperiod/i);
    assert.match(m.aktivText, /Första debitering/i);
    assert.match(m.aktivText, /2026-10-23 · 15 USD/);
  } finally { await page.close(); }
});

test('uppsagt: säger hur länge Premium gäller och att inget mer dras', { skip }, async () => {
  const page = await panelen({ plan: 'premium', subscription: { status: 'active', cancel_at_period_end: true, current_period_end: '2026-11-12T10:00:00.000Z' } });
  try {
    const m = await las(page);
    assert.match(m.aktivText, /uppsagt/i);
    assert.match(m.aktivText, /fungerar till/i);
    assert.match(m.aktivText, /2026-11-12/);
    assert.match(m.aktivText, /inga fler debiteringar/i);
  } finally { await page.close(); }
});

test('inget abonnemang: erbjudandet visas som förut', { skip }, async () => {
  const page = await panelen({ plan: 'free', subscription: null });
  try {
    const m = await las(page);
    assert.match(m.text, /3 dagar gratis/);
    assert.match(m.text, /15 USD/);
    assert.equal(m.aktivSyns, false, 'ett konto utan abonnemang ska inte få en tom abonnemangsruta');
  } finally { await page.close(); }
});
