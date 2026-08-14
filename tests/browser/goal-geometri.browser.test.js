'use strict';
// MÃ¥ldesignernas VERKLIGA geometri, mÃ¤tt i en riktig webblÃ¤sare.
//
// ORSAKEN, uppmÃ¤tt 2026-08-11: `socialGoalHtml` lÃ¤mnar sina fyra barn utan gridplacering, och
// basregeln Ã¤r `grid-template-columns:42px minmax(0,1fr)` med `grid-template-rows:24px 44px 12px`.
// Automatisk placering fyller radvis, sÃ¥ `.goal-track` hamnar i IKONKOLUMNEN pÃ¥ 42 px och vÃ¤rdet
// `0 / 1 000` inuti den spiller ut Ã¶ver spÃ¥ret. Modell 3 klarar sig â den har eget enkolumnsblock.
//
// VARFÃR DE BEFINTLIGA PROVEN MISSADE DET: tests/social-goal-landscape-designs.test.js lÃ¤ser
// KÃLLKODSTEXT â att rÃ¤tt regler stÃ¥r skrivna. Det sÃ¤ger ingenting om var elementen hamnar eller
// om nÃ¥got fÃ¥r plats. Alla sju CI-jobb var grÃ¶na medan kollisionen fanns.
//
// VARFÃR BROWSER OCH INTE jsdom: allt hÃ¤rinne Ã¤r getBoundingClientRect. jsdom har ingen layout och
// svarar 0 pÃ¥ varje mÃ¥tt, sÃ¥ provet hade varit grÃ¶nt fÃ¶re fixen ocksÃ¥.
//
// EN FÃLLA VÃRD ATT NAMNGE: testa INTE att `<strong>` och `.goal-track` saknar Ã¶verlapp. VÃ¤rdet
// ligger INUTI spÃ¥ret och ska alltid Ã¶verlappa geometriskt â ett sÃ¥dant prov mÃ¤ter ingenting.
// Det som ska mÃ¤tas Ã¤r att vÃ¤rdet RYMS i spÃ¥ret, och att spÃ¥ret ligger i rÃ¤tt kolumn.
//
// RÃTT NU: modell 1, 2 och 4 lÃ¤gger spÃ¥ret i ikonkolumnen.
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
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// `?open=layout` gar direkt till editorn â samma vag meny-yta-provet anvander. Att vaxla vy med
// go() efterat lamnar sidopaneler kvar som klipper widgeten.
async function matModell(model) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);

  const matt = await page.evaluate(m => {
    // `state` och `render` ar top-level let/function i media.js och blir aldrig window-egenskaper.
    const w = window.VyraWidgets.create(`catalog:socialgoal:followers:${m}:landscape`);
    w.x = 20; w.y = 20;
    state.widgets.length = 0; state.widgets.push(w);
    render();
    const rot = document.querySelector(`[data-id="${w.id}"]`);
    if (!rot) return { fel: 'widgeten renderades inte' };
    const box = n => { const e = rot.querySelector(n); if (!e) return null;
      const r = e.getBoundingClientRect();
      return { v: r.left, h: r.right, o: r.top, u: r.bottom, bredd: r.width, hojd: r.height } };
    const r = rot.getBoundingClientRect();
    return {
      rot: { v: r.left, h: r.right, o: r.top, u: r.bottom, bredd: r.width, hojd: r.height },
      ikon: box('.goal-icon'), kopia: box('.goal-copy'), rubrik: box('.goal-copy h3'),
      spar: box('.goal-track'), varde: box('.goal-copy strong'),
      procent: box('.goal-copy small'), senaste: box('em'),
      senasteAbsolut: (() => { const e = rot.querySelector('em');
        return !!e && getComputedStyle(e).position === 'absolute' })(),
      // radhojd for att avgora om vardet brutits till flera rader
      vardeRadhojd: (() => { const e = rot.querySelector('.goal-copy strong');
        return e ? parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.2 : 0 })()
    };
  }, model);
  await page.close();
  return matt;
}

// Modell 3 ar avsiktligt enkolumnig. Den generiska premiumplaceringen far inte
// skapa en implicit andra kolumn for .goal-copy eller .goal-track.
test('Goal-modell 3: enkolumnsdesignen behaller ett brett spar och separata rader', { skip }, async () => {
  const m = await matModell(3);
  assert.ok(!m.fel, m.fel);
  assert.ok(m.kopia && m.spar && m.varde, 'kopia, varde eller spar saknas i DOM');
  assert.ok(m.spar.bredd > 350,
    `modell 3:s spar ar bara ${Math.round(m.spar.bredd)} px brett â en implicit kolumn har skapats`);
  assert.ok(Math.abs(m.kopia.v - m.spar.v) <= 1 && Math.abs(m.kopia.h - m.spar.h) <= 1,
    'modell 3:s kopia och spar ligger inte i samma enda gridkolumn');
  const lodratt = Math.min(m.varde.u, m.spar.u) - Math.max(m.varde.o, m.spar.o);
  assert.ok(lodratt <= 1,
    `modell 3:s varde och spar overlappar ${Math.round(lodratt)} px lodratt`);
  for (const del of ['kopia', 'rubrik', 'spar', 'varde', 'procent']) {
    assert.ok(m[del].v >= m.rot.v - 1 && m[del].h <= m.rot.h + 1
      && m[del].o >= m.rot.o - 1 && m[del].u <= m.rot.u + 1,
    `modell 3:s ${del} ligger utanfor widgetens box`);
  }
});

for (const model of [1, 2, 4]) {
  test(`Goal-modell ${model}: sparet ligger i den breda kolumnen, inte i ikonkolumnen`, { skip }, async () => {
    const m = await matModell(model);
    assert.ok(!m.fel, m.fel);
    assert.ok(m.ikon && m.spar, 'ikon eller spar saknas i DOM');
    assert.ok(m.spar.v >= m.ikon.h - 1,
      `sparet borjar vid ${Math.round(m.spar.v)} men ikonen slutar vid ${Math.round(m.ikon.h)} â `
      + 'sparet ligger i ikonkolumnen, vilket ar hela buggen');
    assert.ok(m.spar.bredd > 42 * 2,
      `sparet ar bara ${Math.round(m.spar.bredd)} px brett â det har hamnat i 42 px-kolumnen`);
  });

  test(`Goal-modell ${model}: varderaden lagger sig inte over sparet`, { skip }, async () => {
    const m = await matModell(model);
    assert.ok(m.varde && m.spar, 'vardet eller sparet saknas');
    // I premium-markupen ligger vardet i .goal-copy och sparet ar dess SYSKON â de har alltsa
    // varsin yta och far inte rora varandra. (I media.js-varianten lag vardet inuti sparet, men
    // den renderas aldrig; premium-final.js:40 skriver om socialGoalHtml.)
    const lodratt = Math.min(m.varde.u, m.spar.u) - Math.max(m.varde.o, m.spar.o);
    assert.ok(lodratt <= 1,
      `vardet och sparet overlappar ${Math.round(lodratt)} px lodratt`);
    assert.ok(m.varde.hojd <= m.vardeRadhojd * 1.6,
      `vardet ar ${Math.round(m.varde.hojd)} px hogt mot en radhojd pa `
      + `${Math.round(m.vardeRadhojd)} â det har brutits till flera rader`);
  });

  test(`Goal-modell ${model}: kopia, spar och senaste-raden ligger pa skilda gridrader`, { skip }, async () => {
    const m = await matModell(model);
    // `+1 @NOVA` ar en medvetet svavande bricka (position:absolute, top:-16px). Den deltar
    // inte i gridflodet och SKA ligga ovanpa â att krava skilda rader av den vore fel.
    const parar = m.senasteAbsolut ? [['kopia', 'spar']] : [['kopia', 'spar'], ['spar', 'senaste']];
    for (const [a, b] of parar) {
      if (!m[a] || !m[b]) continue;
      const lodratt = Math.min(m[a].u, m[b].u) - Math.max(m[a].o, m[b].o);
      assert.ok(lodratt <= 1,
        `${a} och ${b} overlappar lodratt med ${Math.round(lodratt)} px â de delar gridrad`);
    }
  });

  test(`Goal-modell ${model}: ingenting klipps i normal liggande storlek`, { skip }, async () => {
    const m = await matModell(model);
    const delar = ['ikon', 'kopia', 'rubrik', 'spar', 'procent']
      .concat(m.senasteAbsolut ? [] : ['senaste']);   // brickan far sticka ut med flit
    for (const del of delar) {
      if (!m[del]) continue;
      assert.ok(m[del].h <= m.rot.h + 1 && m[del].v >= m.rot.v - 1,
        `${del} ligger utanfor widgetens box i sidled`);
      assert.ok(m[del].u <= m.rot.u + 1 && m[del].o >= m.rot.o - 1,
        `${del} ligger utanfor widgetens box i hojdled`);
    }
  });
}
