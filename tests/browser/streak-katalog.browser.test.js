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

test('Top Streak visar exakt ett nytt val och renderar den enkla flippen', { skip }, async () => {
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
    const el = document.querySelector('.vyra-streak-simple');
    const profile = el?.querySelector('.streak-profile-face img');
    const gift = el?.querySelector('.streak-gift-face img');
    const card = el?.querySelector('.streak-simple-card');
    const cardRect = card?.getBoundingClientRect();
    const flipRect = el?.querySelector('.streak-flip')?.getBoundingClientRect();
    const copyRect = el?.querySelector('.streak-copy')?.getBoundingClientRect();
    const scoreRect = el?.querySelector('.streak-score')?.getBoundingClientRect();
    return {
      heading: section.querySelector('h4')?.textContent.trim(), buttonCount: buttons.length,
      buttonName: buttons[0]?.querySelector('b')?.textContent.trim(),
      oldStyles: section.querySelectorAll('[data-streak-style],[data-streak-frame],[data-pf-streak]').length,
      simple: !!el, mechanism: !!el?.querySelector('.streak-mechanism'),
      profileFit: profile && getComputedStyle(profile).objectFit,
      giftFit: gift && getComputedStyle(gift).objectFit,
      profileAnimation: profile && getComputedStyle(profile.parentElement).animationName,
      giftAnimation: gift && getComputedStyle(gift.parentElement).animationName,
      styleControl: !!document.querySelector('#streakTheme,#pfStreakStyle'),
      cardHeight: cardRect?.height, sameRow: !!(flipRect&&copyRect&&scoreRect)&&
        Math.abs((flipRect.top+flipRect.height/2)-(copyRect.top+copyRect.height/2))<4&&
        Math.abs((flipRect.top+flipRect.height/2)-(scoreRect.top+scoreRect.height/2))<4
    };
  });
  await page.close();
  assert.equal(result.heading, 'VYRA TOP STREAK · REDIGERBAR');
  assert.equal(result.buttonCount, 1);
  assert.equal(result.buttonName, 'VYRA Top Streak');
  assert.equal(result.oldStyles, 0);
  assert.equal(result.simple, true, JSON.stringify(result));
  assert.equal(result.mechanism, false);
  assert.equal(result.profileFit, 'cover');
  assert.equal(result.giftFit, 'contain');
  assert.match(result.profileAnimation, /vyraStreakFront/);
  assert.match(result.giftAnimation, /vyraStreakBack/);
  assert.equal(result.styleControl, false);
  assert.ok(result.cardHeight >= 95 && result.cardHeight <= 120, `fel höjd ${result.cardHeight}`);
  assert.equal(result.sameRow, true, JSON.stringify(result));
});
