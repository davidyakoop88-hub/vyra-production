'use strict';
// STREAM DECK HAR TVÅ VÄGAR, OCH VARJE YTA SÄGER DET.
//
// Granskning 2026-10-17 F16: Stream Deck-sidans huvud sa "Kräver VYRA Desktop". Längre ned på samma
// sida stod att molnparkopplingen fungerar helt utan Desktop (#538). Översikten sa samtidigt
// "VYRA Desktop igång … inget går via internet". Tre påståenden som inte kan vara sanna samtidigt.
//
// Sanningen i koden: streamdeck.js når VYRA antingen lokalt via Desktop eller via molnet med en
// parkopplingskod (server/streamdeck.js + live-client.js). Proven kräver att webbläget aldrig
// påstår att Desktop är ett krav, att båda alternativen namnges, och att översikten inte lovar att
// inget går via internet när molnvägen finns.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp' };
let browser, skip = hoppaOver();
test.before(async () => { if (skip) return; browser = await startaWebblasare(); if (!browser) throw new Error('webblasaren kunde inte starta'); });
test.after(async () => { if (browser) await browser.close(); });

// streamdeck.js avgör Desktop på värdnamnet (127.0.0.1/localhost = appens lokala server). Den
// vanliga testservern lyssnar på 127.0.0.1 och skulle alltså rita Desktop-läget. Webbläget provas
// därför på ett påhittat värdnamn som besvaras ur repot via page.route — API-anrop får 404.
const WEBB = 'https://vyra-webb.test';
async function studio() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.route(WEBB + '/**', route => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, ''), fil = path.join(ROOT, rel);
    if (rel.startsWith('api/') || !fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) return route.fulfill({ status: 404, body: 'nej' });
    return route.fulfill({ status: 200, contentType: MIME[path.extname(fil)] || 'application/octet-stream', body: fs.readFileSync(fil) });
  });
  await page.goto(`${WEBB}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && !!window.VyraSessionState && !!document.querySelector('aside [data-extra="streamdeck"]'), null, { timeout: 30000, polling: 100 });
  await page.evaluate(() => window.VyraSessionState.projectLocalSession());
  await page.waitForTimeout(1200);
  return page;
}

test('Stream Deck-sidan i webbläget: inget Desktop-krav i huvudet, två namngivna alternativ', { skip, timeout: 120000 }, async () => {
  const page = await studio();
  try {
    assert.equal(await page.evaluate(() => location.hostname), 'vyra-webb.test', 'kontrollmätning: sidan ska köras i webbläget');
    await page.click('aside [data-extra="streamdeck"]');
    await page.waitForSelector('.sd-sida-head', { timeout: 15000 });
    const m = await page.evaluate(() => ({
      huvud: document.querySelector('.sd-sida-head').innerText,
      status: document.querySelector('.sd-sida-head .sd-status').innerText,
      rubriker: [...document.querySelectorAll('.sd-sida > header h3')].map(h => h.innerText),
      hela: document.querySelector('#view').innerText,
    }));
    assert.ok(/utan VYRA Desktop/i.test(m.hela), 'kontrollmätning: molnvägen (utan Desktop) ska finnas på sidan');
    assert.ok(!/Kräver VYRA Desktop/i.test(m.status), `huvudet kräver Desktop fast molnvägen finns: "${m.status}"`);
    assert.match(m.huvud, /Desktop/, 'huvudet nämner inte den lokala vägen');
    assert.match(m.huvud, /molnet/i, 'huvudet nämner inte molnvägen');
    assert.ok(m.rubriker.some(r => /Alternativ 1/.test(r) && /Desktop/.test(r)), `ingen rubrik för den lokala vägen: ${m.rubriker.join(' | ')}`);
    assert.ok(m.rubriker.some(r => /Alternativ 2/.test(r) && /molnet/i.test(r)), `ingen rubrik för molnvägen: ${m.rubriker.join(' | ')}`);
  } finally { await page.close(); }
});

test('Översikten lovar inte att inget går via internet', { skip, timeout: 120000 }, async () => {
  const page = await studio();
  try {
    await page.click('aside [data-view="home"]');
    await page.waitForSelector('.sd-krav', { timeout: 15000 });
    const krav = await page.evaluate(() => document.querySelector('.sd-krav').innerText);
    assert.ok(!/inget går via internet/i.test(krav), `översikten säger fortfarande att inget går via internet: "${krav.slice(0, 200)}"`);
    assert.match(krav, /molnet|parkopplingskod/i, 'översikten nämner inte molnvägen');
  } finally { await page.close(); }
});
