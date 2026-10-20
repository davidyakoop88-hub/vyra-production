'use strict';
// ABONNEMANGSRUTANS KONTROLLER SER UT SOM RESTEN AV APPEN — OCH FAKTURAKNAPPEN SÄGER IFRÅN.
//
// Granskningen 2026-10-17 (F12) och 2026-10-18 (F12) såg samma två saker i Premium-dialogen:
//
//   1. Stäng, "Fakturor & betalmetod" och "Säg upp abonnemang" hade webbläsarens ljusa
//      standardknappar mitt i en mörk dialog. billing-client.css gav dem bara färg på texten och
//      kantlinjen — bakgrunden, radien och fokusmarkeringen kom från webbläsaren.
//   2. "Fakturor & betalmetod" gjorde `location.href=result.url` utan att fråga om svaret hade en
//      adress. Ett svar utan url skickade studion till /undefined (en 404 i provriggen) — ingen
//      portal och inget fel, bara en tom sida.
//
// Proven kör mot en attrapp av VyraAuth/VyraCloudSync, precis som uppsagningsknappen-provet:
// det är panelens egna UI-regler som ska bevisas, inte inloggningen.
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
const skip = hoppaOver();

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

// `portal` styr vad POST …/portal svarar: ett objekt, eller ett fel som kastas.
async function panelen(portal = { ok: true, url: '' }) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#view') && !!window.VyraBilling, null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(1000);
  await page.evaluate(portalSvar => {
    window.confirm = () => true;
    window.VyraCloudSync = { current: () => ({ workspace: { id: 'w-prov' } }) };
    window.VyraAuth = { api: async (url, init) => {
      if (!init) return { plan: 'premium', subscription: { status: 'active', cancel_at_period_end: false,
        current_period_end: '2026-11-12T10:00:00.000Z' } };
      if (/\/portal$/.test(url)) {
        if (portalSvar.fel) throw Object.assign(new Error(portalSvar.fel), { status: 404 });
        return portalSvar;
      }
      return { ok: true };
    } };
    window.VyraBilling.open();
  }, portal);
  await page.waitForFunction(() => !!document.querySelector('.billing-modal .billing-manage:not([hidden])'), null,
    { timeout: 15000, polling: 100 });
  await page.waitForTimeout(300);
  return page;
}

// Relativ luminans enligt WCAG. Används för att skilja webbläsarens ljusa standardknapp (≈0,86)
// från en knapp som hör hemma i den mörka dialogen.
const MATT = () => {
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const k = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 };
    return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b);
  };
  // Dialogens yta är en gradient (#190a24 → #0d0613); en genomskinlig knapp vilar på den.
  const YTA = [19, 8, 28];
  return [...document.querySelectorAll('.billing-close, .billing-manage, .billing-cancel')].map(el => {
    const cs = getComputedStyle(el), bg = rgb(cs.backgroundColor), fg = rgb(cs.color);
    const genomskinlig = bg.length === 4 && bg[3] < 0.5;
    const yta = genomskinlig ? YTA : bg.slice(0, 3);
    const lb = lum(yta), lf = lum(fg.slice(0, 3));
    return {
      klass: el.className, text: el.textContent.trim(),
      bakgrund: cs.backgroundColor, ytLuminans: +lb.toFixed(3),
      kontrast: +((Math.max(lb, lf) + 0.05) / (Math.min(lb, lf) + 0.05)).toFixed(2),
      radie: parseFloat(cs.borderTopLeftRadius) || 0,
      kant: cs.borderTopStyle,
    };
  });
};

test('stäng, fakturor och säg upp är mörka appknappar, inte webbläsarens standard', { skip }, async () => {
  const page = await panelen();
  try {
    const knappar = await page.evaluate(MATT);
    assert.equal(knappar.length, 3, 'hittade inte alla tre kontrollerna i dialogen');
    for (const k of knappar) {
      assert.ok(k.ytLuminans < 0.2,
        `"${k.text}" (${k.klass}) har ljus bakgrund ${k.bakgrund} — webbläsarens standardknapp i en mörk dialog`);
      assert.ok(k.kontrast >= 4.5, `"${k.text}" har kontrast ${k.kontrast}:1 mot sin yta, kravet är 4,5:1`);
      assert.ok(k.radie >= 6, `"${k.text}" har radie ${k.radie}px — resten av appens knappar är rundade`);
      assert.notEqual(k.kant, 'outset', `"${k.text}" har webbläsarens upphöjda standardkant`);
    }
  } finally { await page.close(); }
});

test('fakturaportal utan adress ger ett synligt fel och lämnar inte studion', { skip }, async () => {
  const page = await panelen({ ok: true });
  try {
    const fore = page.url();
    await page.click('.billing-manage');
    await page.waitForTimeout(800);
    assert.equal(page.url(), fore,
      `klicket skickade studion till ${page.url()} — ett svar utan url får aldrig bli location.href`);
    const status = await page.evaluate(() => {
      const s = document.querySelector('.billing-state');
      return { text: s.textContent, fel: s.classList.contains('billing-fel') };
    });
    assert.equal(status.fel, true, `statusraden markerades inte som fel ("${status.text}")`);
    assert.match(status.text, /fakturaportal|PayPal/i, 'felet säger inte vad som inte gick att öppna');
  } finally { await page.close(); }
});

test('ett serverfel från fakturaportalen syns i statusraden', { skip }, async () => {
  const page = await panelen({ fel: 'Ingen betalningsprofil finns' });
  try {
    await page.click('.billing-manage');
    await page.waitForTimeout(600);
    const status = await page.evaluate(() => {
      const s = document.querySelector('.billing-state');
      return { text: s.textContent, fel: s.classList.contains('billing-fel') };
    });
    assert.equal(status.fel, true);
    assert.match(status.text, /Ingen betalningsprofil finns/);
  } finally { await page.close(); }
});
