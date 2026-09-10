'use strict';
// ÅNGRA-KNAPPEN FÅR INTE STÅ DÄR SÄG UPP STOD.
//
// UPPMÄTT PÅ RIKTIGA KONTON 2026-09-10 (Api-loggen, tider i UTC):
//   20:30:35  POST …/b88d17ab/billing/cancel  200   → PayPal SUSPENDED 20:30:49
//   20:34:49  POST …/b88d17ab/billing/resume  401   (sessionen hade gått ut — klicket dog tyst)
//   20:35:05  POST …/b88d17ab/billing/resume  200   → PayPal ACTIVATED 20:35:29
// David trodde han sa upp; han hade sagt upp och sedan ÅNGRAT det. Samma sak hände på ett andra
// konto (609c5761) tre minuter tidigare. Två gånger på fem minuter är inte slarv, det är en fälla:
//
//   1. `cancel.hidden=!active||ending` och `resume.hidden=!active||!ending` — knapparna BYTER AV
//      VARANDRA i samma knapprad. Efter en uppsägning står "Ångra uppsägningen" exakt där
//      "Säg upp abonnemang" stod, och ett klick till tar tillbaka uppsägningen.
//   2. Uppsägningen hade en confirm(); ångra hade INGEN. Att råka ångra var alltså lättare än att
//      säga upp, trots att ångra kostar 15 USD.
//   3. Felet vid 401 skrevs som vanlig brödtext i statusraden och gick att missa helt.
//
// Proven nedan låser alla tre. De kör mot en attrapp av VyraAuth/VyraCloudSync i stället för mot
// riktig inloggning: panelen ägs av billing-client.js, och det som ska bevisas är dess UI-regler.
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

// Öppnar panelen med ett påhittat abonnemang. `uppsagt` styr om raden redan är uppsagd.
// `felar` gör att varje anrop kastar, som en utgången session gör.
async function panelen(opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#view'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(1200);
  await page.evaluate(([uppsagt, felar]) => {
    window.__anrop = [];
    window.__fragor = [];
    window.confirm = fraga => { window.__fragor.push(fraga); return true; };
    window.VyraCloudSync = { current: () => ({ workspace: { id: 'w-prov' } }) };
    window.VyraAuth = { api: async (url, init) => {
      window.__anrop.push(`${(init && init.method) || 'GET'} ${url.split('/billing')[1] || '/billing'}`);
      if (felar) throw Object.assign(new Error('Inte inloggad'), { status: 401 });
      if (!init) return { plan: 'premium', subscription: { status: 'trialing',
        cancel_at_period_end: window.__uppsagt, current_period_end: '2026-09-12T10:00:00.000Z' } };
      if (/\/cancel$/.test(url)) window.__uppsagt = true;
      if (/\/resume$/.test(url)) window.__uppsagt = false;
      return { ok: true };
    } };
    window.__uppsagt = uppsagt;
    window.VyraBilling.open();
  }, [!!opts.uppsagt, !!opts.felar]);
  await page.waitForFunction(() => !!document.querySelector('.billing-modal'), null,
    { timeout: 15000, polling: 100 });
  await page.waitForTimeout(400);
  return page;
}

const lage = page => page.evaluate(() => {
  const ruta = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), b: Math.round(r.width), h: Math.round(r.height) }; };
  const cancel = document.querySelector('.billing-cancel'), resume = document.querySelector('.billing-resume');
  const synlig = el => !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  return {
    cancelSyns: synlig(cancel), resumeSyns: synlig(resume),
    cancelRuta: ruta(cancel), resumeRuta: ruta(resume),
    resumeText: resume.textContent.trim(),
    status: document.querySelector('.billing-state').textContent,
    statusArFel: document.querySelector('.billing-state').classList.contains('billing-fel'),
  };
});

test('ångra står ALDRIG där säg upp stod', { skip }, async () => {
  const aktiv = await panelen({ uppsagt: false });
  try {
    const fore = await lage(aktiv);
    assert.equal(fore.cancelSyns, true, 'säg upp ska synas på ett aktivt abonnemang');
    assert.equal(fore.resumeSyns, false, 'ångra ska inte finnas när det inte finns något att ångra');

    // Säg upp, och se var ångra hamnar.
    await aktiv.evaluate(() => document.querySelector('.billing-cancel').click());
    await aktiv.waitForFunction(() => {
      const r = document.querySelector('.billing-resume');
      return r && !r.hidden;
    }, null, { timeout: 15000, polling: 100 });
    const efter = await lage(aktiv);
    assert.equal(efter.cancelSyns, false, 'säg upp ska försvinna när abonnemanget redan är uppsagt');
    assert.equal(efter.resumeSyns, true, 'ångra ska erbjudas när en uppsägning finns');

    // Kärnan: ångra får inte ärva säg upp-knappens plats. Ett klick på samma ställe som nyss
    // sa upp ska inte kunna ta tillbaka uppsägningen.
    const sammaPlats = Math.abs(efter.resumeRuta.x - fore.cancelRuta.x) < 12
      && Math.abs(efter.resumeRuta.y - fore.cancelRuta.y) < 12;
    assert.equal(sammaPlats, false,
      `ångra ligger på säg upp-knappens gamla plats (säg upp ${JSON.stringify(fore.cancelRuta)}, `
      + `ångra ${JSON.stringify(efter.resumeRuta)}) — det var så uppsägningen ångrades av misstag `
      + '2026-09-10, två gånger på fem minuter');
  } finally { await aktiv.close(); }
});

test('ångra frågar först — den kostar 15 USD', { skip }, async () => {
  const page = await panelen({ uppsagt: true });
  try {
    const fragor = await page.evaluate(async () => {
      window.__fragor.length = 0;
      document.querySelector('.billing-resume').click();
      await new Promise(r => setTimeout(r, 600));
      return { fragor: window.__fragor, anrop: window.__anrop.filter(a => /resume/.test(a)) };
    });
    assert.equal(fragor.fragor.length, 1, 'ångra gick igenom utan att fråga');
    assert.match(fragor.fragor[0], /15 USD/, 'frågan säger inte vad det kostar');
    assert.equal(fragor.anrop.length, 1, 'ett ja ska nå servern');
  } finally { await page.close(); }
});

test('ett dött klick syns — en utgången session får inte tiga', { skip }, async () => {
  // 401:an 2026-09-10 skrevs som vanlig brödtext och gick att missa. Nu märks statusraden.
  const page = await panelen({ uppsagt: false, felar: true });
  try {
    const m = await lage(page);
    assert.equal(m.statusArFel, true,
      `statusraden markerades inte som fel (texten var "${m.status}") — ett klick som inte gör `
      + 'något är värre än ett som säger ifrån');
    assert.match(m.status, /inloggad|fel/i, 'felet nämner inte vad som är fel');
  } finally { await page.close(); }
});
