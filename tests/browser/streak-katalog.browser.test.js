'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

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
  if (!browser) throw new Error('kunde inte starta webbläsaren');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// SEDAN 2026-09-20 ags Top Streak av approved-rankings.js (Clean Flip). Provet matte forr
// premium-final.js:s "simple"-design, som aldrig nadde skarmen - approved vann redan, och
// provet var rott pa ren main. Nu mater det den design som faktiskt ritas.
test('Top Streak visar exakt ett val och renderar Clean Flip', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`${bas}/studio.html?open=overlay`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('.streak-template-section button'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(1000);
  const result = await page.evaluate(() => {
    const section = document.querySelector('.streak-template-section');
    const buttons = [...section.querySelectorAll('button')];
    const w = window.VyraWidgets.create('catalog:topstreak');
    const host = document.createElement('div');
    host.innerHTML = wh(w);
    document.body.append(host);
    const el = document.querySelector('.approved-streak');
    const profile = el?.querySelector('.streak-profile-face img');
    const gift = el?.querySelector('.streak-gift-face img');
    const flipRect = el?.querySelector('.streak-flip')?.getBoundingClientRect();
    const elRect = el?.getBoundingClientRect();
    const copyRect = el?.querySelector('.approved-streak-copy')?.getBoundingClientRect();
    const flip = el?.querySelector('.streak-flip');
    const flipAnimation = flip && getComputedStyle(flip).animationName;
    const idleDuration = flip && getComputedStyle(flip).animationDuration;
    const idleIterations = flip && getComputedStyle(flip).animationIterationCount;
    return {
      heading: section.querySelector('h4')?.textContent.trim(), buttonCount: buttons.length,
      buttonName: buttons[0]?.querySelector('b')?.textContent.trim(),
      oldStyles: section.querySelectorAll('[data-streak-style],[data-streak-frame],[data-pf-streak]').length,
      approved: !!el, gamlaKlasser: !!document.querySelector('.vyra-streak-simple,.premium-streak,.streak-framed'),
      mechanism: !!el?.querySelector('.streak-mechanism'),
      profileFit: profile && getComputedStyle(profile).objectFit,
      giftFit: gift && getComputedStyle(gift).objectFit,
      flipAnimation,
      idleDuration, idleIterations,
      styleControl: !!document.querySelector('#streakTheme,#pfStreakStyle'),
      // Clean Flip: cirkeln overst, namn + streak under, bada centrerade i widgeten.
      vertical: !!(flipRect&&copyRect)&&flipRect.bottom<=copyRect.top+1,
      centered: !!(elRect&&flipRect&&copyRect)&&
        Math.abs((flipRect.left+flipRect.width/2)-(elRect.left+elRect.width/2))<2&&
        Math.abs((copyRect.left+copyRect.width/2)-(elRect.left+elRect.width/2))<2
    };
  });
  await page.close();
  assert.equal(result.heading, 'VYRA TOP STREAK · CLEAN FLIP');
  assert.equal(result.buttonCount, 1);
  assert.equal(result.buttonName, 'Clean Flip');
  assert.equal(result.oldStyles, 0, 'en avvecklad design ar tillbaka i katalogen');
  assert.equal(result.approved, true, JSON.stringify(result));
  assert.equal(result.gamlaKlasser, false, 'en dod generation ritar igen');
  assert.equal(result.mechanism, false);
  assert.equal(result.profileFit, 'cover');
  assert.equal(result.giftFit, 'contain');
  assert.match(result.flipAnimation, /approved-streak-flip/);
  assert.equal(result.idleDuration, '8s');
  assert.equal(result.idleIterations, 'infinite', 'flippen ska fortsatta under hela LIVE');
  assert.equal(result.styleControl, false);
  assert.equal(result.vertical, true, JSON.stringify(result));
  assert.equal(result.centered, true, JSON.stringify(result));
});
