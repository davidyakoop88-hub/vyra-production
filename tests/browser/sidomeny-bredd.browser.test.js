'use strict';
// SIDOMENYN: EN BREDD, OCH PROFILEN ALLTID SYNLIG.
//
// UPPMATT I RIKTIG CHROME FORE FIXEN (1440px bred vy):
//
//   vy         bredd   menyns innehall   profilkortets botten   syns profilen?
//   Oversikt   210px   1046px            y=1028                 NEJ
//   editor     186px    900px            y=888                  ja
//
// Tva sjalvstandiga fel som sag ut som ett:
//
//   1. `body{grid-template-columns:210px 1fr}` gallde overallt UTOM i editorn, dar
//      `body:has(.editor-shell)` satte 186px. Menyn hoppade 24px vid varje vybyte.
//
//   2. Hela <aside> var ett rullningsfalt med DOLD rullningslist. Innehallet ar hogre an vyn, sa
//      profilkortet lag under vecket utan nagon antydan om att det gick att rulla dit. Den gamla
//      koden erkande det rakt ut i en kommentar: "innehallet ar 866px och ryms vid 900px
//      fonsterhojd, men inte vid 768".
//
// Fixen ar strukturell, inte kosmetisk: BARA <nav> rullar, medan huvudet och .aside-bottom star
// kvar. Darfor provas flera fonsterhojder — en losning som krymper padding tills det rams flyttar
// bara gransen till nasta skarmstorlek, och skulle bli gron har vid 900 men rod vid 620.
//
// 210 OCH INTE 186: vid 186 klipps "Vip-widget" och "Automatik" till "Vip-..." och "Auto-...",
// eftersom badgarna PRO och LIVE ater bredden. Fotograferat bada breddarna innan valet.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
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

let server, browser, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

const MAT = () => {
  const aside = document.querySelector('aside');
  const nav = document.querySelector('aside > nav');
  const profil = document.querySelector('aside .user');
  if (!aside || !profil) return { saknas: true };
  const ar = aside.getBoundingClientRect(), pr = profil.getBoundingClientRect();
  return {
    bredd: Math.round(ar.width),
    // Spiller sjalva menyn over sin egen ruta? Da rullar fel element.
    asideSpiller: aside.scrollHeight - Math.round(ar.height) > 1,
    navRullar: !!nav && getComputedStyle(nav).overflowY === 'auto',
    profilBotten: Math.round(pr.bottom),
    profilTopp: Math.round(pr.top),
    profilInne: pr.bottom <= innerHeight + 1 && pr.top >= -1,
    vyHojd: innerHeight
  };
};

async function mat(hojd, vy) {
  const page = await browser.newPage({ viewport: { width: 1440, height: hojd } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ccReady === '1',
    null, { timeout: 20000 });
  await page.evaluate(v => { view = v; render() }, vy);
  await page.evaluate(() => new Promise(r => setTimeout(r, 250)));
  const m = await page.evaluate(MAT);
  await page.close();
  return m;
}

const HOJDER = [1100, 900, 768, 620];

test('sidomenyn har samma bredd i alla vyer och alla fonsterhojder', { skip, timeout: 120000 },
  async () => {
  const matningar = [];
  for (const h of HOJDER) {
    for (const vy of ['home', 'editor']) {
      const m = await mat(h, vy);
      assert.ok(!m.saknas, `sidomenyn eller profilkortet saknas vid h=${h} vy=${vy}`);
      matningar.push({ h, vy, bredd: m.bredd });
    }
  }
  const breddar = [...new Set(matningar.map(m => m.bredd))];
  assert.equal(breddar.length, 1,
    'sidomenyn byter bredd mellan vyer: '
    + matningar.map(m => `${m.vy}@${m.h}=${m.bredd}px`).join(', ')
    + ' — bredden ska bo i EN variabel pa body och gälla överallt');
});

test('profilkortet ligger inne i vyn aven i ett kort fonster', { skip, timeout: 120000 },
  async () => {
  // Det har provet ar hela skalet att fixen ar strukturell. En losning som krymper padding tills
  // innehallet rams blir gron vid 900 och rod har.
  for (const h of HOJDER) {
    for (const vy of ['home', 'editor']) {
      const m = await mat(h, vy);
      assert.equal(m.profilInne, true,
        `profilkortet ligger utanfor vyn vid h=${h} i vy "${vy}": botten y=${m.profilBotten}, `
        + `vyn ar ${m.vyHojd}px. Menyn ska rulla i <nav>, inte i hela <aside>.`);
    }
  }
});

test('det ar NAV som rullar, inte hela menyn', { skip, timeout: 60000 }, async () => {
  // Kontrollmatning mot provet ovan. Utan den kunde nagon gora profilkortet synligt genom att
  // dolja menyposter, och bada proven vore grona medan navigationen tappat rader.
  const m = await mat(620, 'home');
  assert.equal(m.navRullar, true,
    '<nav> ar inte ett eget rullningsfalt — da maste hela <aside> rulla, och da hamnar '
    + 'profilkortet under vecket igen sa fort menyn vaxer');
  assert.equal(m.asideSpiller, false,
    'sjalva <aside> spiller over sin ruta; huvudet och .aside-bottom ska sta kvar och bara '
    + 'navigationen rulla');
});

test('menyposterna har samma form i alla vyer, inte bara samma bredd', { skip, timeout: 120000 },
  async () => {
  // DET HAR VAR DET DAVID FAKTISKT SAG. PR #253 enade bredden och lat <nav> rulla — och jag kallade
  // det klart. Men NIO regler kvar krympte menyn enbart i editorvyn: padding 7px istallet for
  // 12px 14px, teckenstorlek 12px istallet for 12.5, ikoner 16x16 istallet for 22x22, plus egna
  // matt pa radavstand, etiketter, badgar och profilraden.
  //
  // Bredden var alltsa ratt medan menyn anda "andrade sig" vid varje vybyte, precis som han sa.
  // En vakt som bara mater bredd godkanner det. Den har mater FORMEN pa en menypost.
  //
  // Krympningen fanns for att fa in innehallet lodratt i editorn. Den behovs inte langre: <nav>
  // rullar och .aside-bottom har flex-shrink:0, sa menyn rullar i stallet for att krympa.
  const FORM = () => {
    const e = [...document.querySelectorAll('aside nav button, aside nav a')]
      .find(x => (x.textContent || '').trim().startsWith('Sound'));
    if (!e) return null;
    const c = getComputedStyle(e);
    const svg = e.querySelector('svg');
    const ic = svg ? getComputedStyle(svg) : null;
    const bot = document.querySelector('aside .aside-bottom');
    return {
      teckenstorlek: c.fontSize,
      padding: c.padding,
      ikon: ic ? ic.width + 'x' + ic.height : '-',
      radhojd: Math.round(e.getBoundingClientRect().height),
      bottenhojd: bot ? Math.round(bot.getBoundingClientRect().height) : -1
    };
  };

  const former = {};
  for (const vy of ['home', 'editor']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.ccReady === '1',
      null, { timeout: 20000 });
    await page.evaluate(v => { view = v; render() }, vy);
    await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
    former[vy] = await page.evaluate(FORM);
    // Kontrollmatning: mater vi verkligen editorn nar vi tror det?
    if (vy === 'editor') {
      const shell = await page.evaluate(() => !!document.querySelector('.editor-shell'));
      assert.equal(shell, true, 'ingen .editor-shell i editorvyn — provet mater fel lage');
    }
    await page.close();
  }

  assert.ok(former.home && former.editor, 'hittade ingen menypost att mata');
  assert.deepEqual(former.editor, former.home,
    'menyposterna ser olika ut mellan vyerna. '
    + 'Oversikt: ' + JSON.stringify(former.home) + ' — editor: ' + JSON.stringify(former.editor)
    + '. Samma bredd racker inte: menyn far inte byta form nar man trycker Layout.');
});
