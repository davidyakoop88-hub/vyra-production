'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const ROOT = path.join(__dirname, '..', '..');
const MODELS = ['crownBanner', 'royalAmethyst', 'iceKing', 'neonCyber', 'dragonFlame', 'angelGold'];
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

let server, browser, base;
const skip = hoppaOver();
test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  server = await servera();
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

for (const model of MODELS) test(`Last-X ${model} visar ram, profil och sparad LIVE-data`, { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  await page.goto(`${base}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.VyraWidgets && typeof window.render === 'function');
  const result = await page.evaluate(modelName => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(`catalog:lastx:${modelName}`);
    Object.assign(w, { x: 80, y: 120, width: 620, lastXType: 'follower', lastXPersistent: true,
      lastXLatest: { follower: { username: '@VYRA_Test', message: 'FOLLOWED THE LIVE', avatar: 'assets/images/test-profile.svg' } } });
    state.widgets.push(w); selected = w.id; save(); render();
    const root = document.querySelector(`[data-id="${w.id}"]`);
    const art = root.querySelector('.last-x-frame-art');
    const message = root.querySelector('.last-x-message');
    const name = root.querySelector('.last-x-name'), copy = root.querySelector('.last-x-copy');
    const label = root.querySelector('.last-x-label');
    const nr = name.getBoundingClientRect(), cr = copy.getBoundingClientRect();
    const lr = label.getBoundingClientRect(), rr = root.getBoundingClientRect();
    return { cls: root.className, name: name.textContent,
      message: message.textContent, messageDisplay: getComputedStyle(message).display, src: art?.getAttribute('src'),
      avatar: root.querySelector('.last-x-avatar img').getAttribute('src'),
      nameFits: name.scrollWidth <= name.clientWidth + 1,
      nameCenterDelta: Math.abs((nr.top + nr.height / 2) - (cr.top + cr.height * (modelName === 'crownBanner' ? .592 : modelName === 'angelGold' ? .54 : .56))),
      labelFontSize: parseFloat(getComputedStyle(label).fontSize),
      crownLabelX: (lr.left + lr.width / 2 - rr.left) / rr.width,
      crownLabelY: (lr.top + lr.height / 2 - rr.top) / rr.height,
      crownNameX: (nr.left - rr.left) / rr.width,
      crownNameY: (nr.top + nr.height / 2 - rr.top) / rr.height };
  }, model);
  assert.match(result.cls, new RegExp(`design-${model}`));
  assert.match(result.cls, /last-x-sticky/);
  assert.equal(result.name, '@VYRA_Test');
  assert.equal(result.message, 'FOLLOWED THE LIVE');
  assert.equal(result.messageDisplay, 'none');
  assert.equal(result.nameFits, true);
  assert.ok(result.nameCenterDelta <= 2, `namnet ligger ${result.nameCenterDelta}px från avsedd mittlinje`);
  if (model === 'crownBanner') {
    assert.ok(Math.abs(result.crownLabelX - .60) <= .005, `LAST FOLLOWER x=${result.crownLabelX}`);
    assert.ok(Math.abs(result.crownLabelY - .32) <= .005, `LAST FOLLOWER y=${result.crownLabelY}`);
    assert.ok(Math.abs(result.crownNameX - .436) <= .005, `gifternamn x=${result.crownNameX}`);
    assert.ok(Math.abs(result.crownNameY - .592) <= .005, `gifternamn y=${result.crownNameY}`);
  }
  if (model === 'angelGold') assert.ok(result.labelFontSize >= 10, `LAST FOLLOWER är bara ${result.labelFontSize}px`);
  assert.match(result.src, /assets\/images\/last-x\/.+\.png$/);
  assert.match(result.avatar, /test-profile\.svg$/);
  await page.close();
});
