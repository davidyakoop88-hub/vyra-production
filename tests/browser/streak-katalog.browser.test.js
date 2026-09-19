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
    const titleRect = el?.querySelector('.streak-simple-title')?.getBoundingClientRect();
    const nameRect = el?.querySelector('.streak-simple-name')?.getBoundingClientRect();
    const scoreRect = el?.querySelector('.streak-score')?.getBoundingClientRect();
    const idleProfileAnimation = profile && getComputedStyle(profile.parentElement).animationName;
    const idleGiftAnimation = gift && getComputedStyle(gift.parentElement).animationName;
    el?.classList.add('hit');
    return {
      heading: section.querySelector('h4')?.textContent.trim(), buttonCount: buttons.length,
      buttonName: buttons[0]?.querySelector('b')?.textContent.trim(),
      oldStyles: section.querySelectorAll('[data-streak-style],[data-streak-frame],[data-pf-streak]').length,
      simple: !!el, mechanism: !!el?.querySelector('.streak-mechanism'),
      profileFit: profile && getComputedStyle(profile).objectFit,
      giftFit: gift && getComputedStyle(gift).objectFit,
      idleProfileAnimation, idleGiftAnimation,
      profileAnimation: profile && getComputedStyle(profile.parentElement).animationName,
      giftAnimation: gift && getComputedStyle(gift.parentElement).animationName,
      styleControl: !!document.querySelector('#streakTheme,#pfStreakStyle'),
      cardHeight: cardRect?.height, vertical: !!(titleRect&&flipRect&&nameRect&&scoreRect)&&
        titleRect.bottom<=flipRect.top+1&&flipRect.bottom<=nameRect.top+1&&nameRect.bottom<=scoreRect.top+1,
      centered: !!(cardRect&&flipRect&&nameRect&&scoreRect)&&
        Math.abs((flipRect.left+flipRect.width/2)-(cardRect.left+cardRect.width/2))<2&&
        Math.abs((nameRect.left+nameRect.width/2)-(cardRect.left+cardRect.width/2))<2&&
        Math.abs((scoreRect.left+scoreRect.width/2)-(cardRect.left+cardRect.width/2))<2
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
  assert.equal(result.idleProfileAnimation, 'none');
  assert.equal(result.idleGiftAnimation, 'none');
  assert.match(result.profileAnimation, /vyraStreakFrontEvent/);
  assert.match(result.giftAnimation, /vyraStreakBackEvent/);
  assert.equal(result.styleControl, false);
  assert.ok(result.cardHeight >= 215 && result.cardHeight <= 235, `fel höjd ${result.cardHeight}`);
  assert.equal(result.vertical, true, JSON.stringify(result));
  assert.equal(result.centered, true, JSON.stringify(result));
});
