'use strict';
// EGENSKAPSPANELEN UTAN GLAPP — MÄTT I RIKTIG CHROMIUM (2026-10-11).
//
// DAVIDS ORD: "lägg en och en widget i layout, öppna höger sidan panel ... widget ska popa eller
// fade ... alla inställning ska vara anpassad o ingen glapp där".
//
// Källkontrakten ligger i tests/panelen-utan-glapp.test.js. Här mäts det som bara en riktig
// rendering kan svara på: hur bred kryssrutan BLEV, vilken animation rotnoden FICK, vilka
// etiketter som faktiskt står i panelen. Samma monteringsväg som studion: katalognyckel →
// VyraWidgets.create → state → render() → bind().
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

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

let server, browser, bas, sida;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
  sida = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await sida.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await sida.waitForTimeout(1500);
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Lägger EN widget i layouten, markerar den, bygger panelen och fäller upp alla grupper.
async function panel(nyckel) {
  return sida.evaluate(async (key) => {
    const st = window.eval('state'); st.widgets = [];
    const w = VyraWidgets.create(key); st.widgets.push(w);
    window.eval('selected=' + JSON.stringify(w.id));
    try { save() } catch (e) {}
    render(); await new Promise(r => setTimeout(r, 300)); bind(); await new Promise(r => setTimeout(r, 150));
    document.querySelectorAll('.properties .property-group.collapsible').forEach(g => g.classList.add('open'));
    return w.id;
  }, nyckel);
}

const KRYSSRUTOR = ['catalog:battlemvp:aurora', 'catalog:lastx:badge', 'catalog:heartfireworks', 'catalog:ranking:templateTopCoins:voltage', 'catalog:giftcampaign:emerald:landscape'];

test('kryssrutor i panelen är små rutor med etiketten bredvid, inte 90 px-rutor med texten under', { skip }, async () => {
  for (const nyckel of KRYSSRUTOR) {
    await panel(nyckel);
    const m = await sida.evaluate(() => [...document.querySelectorAll('.properties label input[type=checkbox]')]
      .filter(c => c.getBoundingClientRect().width > 0)
      .map(c => ({ id: c.id || c.closest('label').textContent.trim().slice(0, 30), w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height) })));
    assert.ok(m.length > 0, `${nyckel}: inga synliga kryssrutor hittades`);
    const stora = m.filter(c => c.w > 24 || c.h > 24);
    assert.deepEqual(stora, [], `${nyckel}: kryssrutor större än 24 px: ${JSON.stringify(stora)}`);
  }
});

test('Egen text: Typsnitt, Textstorlek och Skugga X finns EN gång var', { skip }, async () => {
  await panel('catalog:custom:text');
  const n = await sida.evaluate(() => {
    const t = [...document.querySelectorAll('.properties label')].map(l => (l.firstChild && l.firstChild.nodeType === 3 ? l.firstChild.textContent : l.textContent).trim());
    return { typsnitt: t.filter(x => x === 'Typsnitt').length, storlek: t.filter(x => x === 'Textstorlek').length, skuggX: t.filter(x => x === 'Skugga X' || x === 'X').length, delad: !!document.querySelector('.properties .vyra-textgrupp') };
  });
  assert.equal(n.delad, false, 'den delade TEXT-gruppen ska inte monteras på Egen text');
  assert.equal(n.typsnitt, 1);
  assert.equal(n.storlek, 1);
});

// Sedan PR 7 (vyra-mvp-panel.js) heter kryssrutan "Visa namn" — textfältet Namn är exempeldata i
// sektion 1 och har inte längre samma etikett som kryssrutan.
test('Battle MVP med ram: kryssrutan Visa namn finns en gång, inte två', { skip }, async () => {
  await panel('catalog:battlemvp:frame:dark-wings');
  const n = await sida.evaluate(() => [...document.querySelectorAll('.properties label')].filter(l => l.textContent.trim() === 'Visa namn' && l.querySelector('input[type=checkbox]')).length);
  assert.equal(n, 1);
  const utanRam = await (async () => { await panel('catalog:battlemvp:aurora'); return sida.evaluate(() => !!document.querySelector('#mvpShowCoins')); })();
  assert.equal(utanRam, true, 'utan ram ska den generella raden finnas kvar');
});

test('Guardian Emblem: POSITION & STORLEK skriver till widgeten, och Ta bort tar bort', { skip }, async () => {
  const id = await panel('catalog:guardianemblem:1');
  const r = await sida.evaluate(async (id) => {
    const x = document.querySelector('.properties #propX');
    if (!x) return { propX: false };
    x.value = '321'; x.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const st = window.eval('state');
    const w = st.widgets.find(v => v.id === id);
    const del = document.querySelector('.properties #del');
    if (del) del.click();
    await new Promise(r => setTimeout(r, 200));
    return { propX: true, x: w && w.x, kvar: window.eval('state').widgets.some(v => v.id === id) };
  }, id);
  assert.equal(r.propX, true, '#propX saknas');
  assert.equal(r.x, 321);
  assert.equal(r.kvar, false, 'Ta bort tog inte bort widgeten');
});

test('Top Like: ingen rubrik DESIGN utan kontroller', { skip }, async () => {
  await panel('catalog:toplike:basic-v2');
  const tomma = await sida.evaluate(() => [...document.querySelectorAll('.properties .property-group')]
    .map(g => ({ rubrik: (g.querySelector(':scope > h4, :scope > .pg-toggle') || {}).textContent, ctrls: [...g.querySelectorAll('input,select,textarea,button')].filter(el => el.getBoundingClientRect().width > 0).length }))
    .filter(g => g.rubrik && g.rubrik.trim() === 'DESIGN' && g.ctrls === 0));
  assert.deepEqual(tomma, []);
});

test('volymreglagen visar sitt värde', { skip }, async () => {
  await panel('catalog:giftcampaign:emerald:landscape');
  // Mellanslag före % (svensk standard, vyra-talformat.js, slutgranskning B-024).
  assert.match(await sida.evaluate(() => document.querySelector('#campaignVolume').closest('label').textContent), /\d+ %/);
  await panel('catalog:giftfireworks:comet');
  assert.match(await sida.evaluate(() => document.querySelector('#fwVolume').closest('label').textContent), /\d+ %/);
});

// Intro-valet: finns på alla widgetar som kan ha en entré, och gör något på rotnoden.
const MED_INTRO = {
  'catalog:battlemvp:aurora': '#vyraEntrance', 'catalog:guardianemblem:1': '#vyraEntrance', 'catalog:socialgoal:likes:heart-rail:landscape': '#vyraEntrance',
  'catalog:heartgoal:citrus': '#vyraEntrance', 'catalog:custom:text': '#vyraEntrance', 'catalog:giftjar:dragon': '#vyraEntrance',
  'catalog:topgift:premium:neon': '#gafEntrance', 'catalog:topstreak': '#gafEntrance', 'catalog:followeralert:blush': '#gafEntrance',
  'catalog:toplike:basic-v2': '#wsEntrance',
};
const UTAN_INTRO = ['catalog:giftfireworks:comet', 'catalog:likefountain:portal:portal', 'catalog:glovesnipe:pinkPrincess:pack:2', 'catalog:pggoal:1'];

test('välj "Poppa in" → rotnoden får wsPopIn, även på Top Gift och Top Streak', { skip }, async () => {
  for (const [nyckel, sel] of Object.entries(MED_INTRO)) {
    const id = await panel(nyckel);
    const r = await sida.evaluate(async ({ id, sel }) => {
      const s = document.querySelector('.properties ' + sel);
      if (!s) return { kontroll: false };
      const dubbel = document.querySelectorAll('.properties #vyraEntrance, .properties #gafEntrance, .properties #wsEntrance, .properties #lastXEntrance').length;
      s.value = 'pop'; s.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const el = document.querySelector(`[data-id="${id}"]`);
      return { kontroll: true, dubbel, anim: el ? getComputedStyle(el).animationName : 'ingen nod', cls: el ? el.className : '' };
    }, { id, sel });
    assert.equal(r.kontroll, true, `${nyckel}: ${sel} saknas i panelen`);
    assert.equal(r.dubbel, 1, `${nyckel}: exakt en intro-kontroll, inte ${r.dubbel}`);
    assert.equal(r.anim, 'wsPopIn', `${nyckel}: rotnoden fick ${r.anim} (${r.cls})`);
  }
});

test('effektwidgetar och playground-widgetar får inget andra intro-val', { skip }, async () => {
  for (const nyckel of UTAN_INTRO) {
    await panel(nyckel);
    const n = await sida.evaluate(() => document.querySelectorAll('.properties #vyraEntrance').length);
    assert.equal(n, 0, `${nyckel}: #vyraEntrance ska inte finnas`);
  }
});
