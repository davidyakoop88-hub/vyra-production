'use strict';
// Måldesignernas VERKLIGA geometri, mätt i en riktig webbläsare.
//
// ORSAKEN, uppmätt 2026-08-11: `socialGoalHtml` lämnar sina fyra barn utan gridplacering, och
// basregeln är `grid-template-columns:42px minmax(0,1fr)` med `grid-template-rows:24px 44px 12px`.
// Automatisk placering fyller radvis, så `.goal-track` hamnar i IKONKOLUMNEN på 42 px och värdet
// `0 / 1 000` inuti den spiller ut över spåret. Modell 3 klarar sig — den har eget enkolumnsblock.
//
// VARFÖR DE BEFINTLIGA PROVEN MISSADE DET: tests/social-goal-landscape-designs.test.js läser
// KÄLLKODSTEXT — att rätt regler står skrivna. Det säger ingenting om var elementen hamnar eller
// om något får plats. Alla sju CI-jobb var gröna medan kollisionen fanns.
//
// VARFÖR BROWSER OCH INTE jsdom: allt härinne är getBoundingClientRect. jsdom har ingen layout och
// svarar 0 på varje mått, så provet hade varit grönt före fixen också.
//
// EN FÄLLA VÄRD ATT NAMNGE: testa INTE att `<strong>` och `.goal-track` saknar överlapp. Värdet
// ligger INUTI spåret och ska alltid överlappa geometriskt — ett sådant prov mäter ingenting.
// Det som ska mätas är att värdet RYMS i spåret, och att spåret ligger i rätt kolumn.
//
// RÖTT NU: modell 1, 2 och 4 lägger spåret i ikonkolumnen.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

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

async function startaWebblasare() {
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ channel }) } catch (_) {}
  }
  try { return await chromium.launch() } catch (_) {}
  return null;
}

let server, browser, bas;
let skip = chromium ? false : 'playwright-core saknas — kor `npm i` (hoppar, faller inte)';

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) { skip = 'ingen Chrome/Edge/Chromium hittades pa maskinen (hoppar, faller inte)'; return }
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// `?open=layout` gar direkt till editorn — samma vag meny-yta-provet anvander. Att vaxla vy med
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

// Modell 3 har eget enkolumnsblock och ar medvetet undantagen — den var redan korrekt.
for (const model of [1, 2, 4]) {
  test(`Goal-modell ${model}: sparet ligger i den breda kolumnen, inte i ikonkolumnen`, { skip }, async () => {
    const m = await matModell(model);
    assert.ok(!m.fel, m.fel);
    assert.ok(m.ikon && m.spar, 'ikon eller spar saknas i DOM');
    assert.ok(m.spar.v >= m.ikon.h - 1,
      `sparet borjar vid ${Math.round(m.spar.v)} men ikonen slutar vid ${Math.round(m.ikon.h)} — `
      + 'sparet ligger i ikonkolumnen, vilket ar hela buggen');
    assert.ok(m.spar.bredd > 42 * 2,
      `sparet ar bara ${Math.round(m.spar.bredd)} px brett — det har hamnat i 42 px-kolumnen`);
  });

  test(`Goal-modell ${model}: varderaden lagger sig inte over sparet`, { skip }, async () => {
    const m = await matModell(model);
    assert.ok(m.varde && m.spar, 'vardet eller sparet saknas');
    // I premium-markupen ligger vardet i .goal-copy och sparet ar dess SYSKON — de har alltsa
    // varsin yta och far inte rora varandra. (I media.js-varianten lag vardet inuti sparet, men
    // den renderas aldrig; premium-final.js:40 skriver om socialGoalHtml.)
    const lodratt = Math.min(m.varde.u, m.spar.u) - Math.max(m.varde.o, m.spar.o);
    assert.ok(lodratt <= 1,
      `vardet och sparet overlappar ${Math.round(lodratt)} px lodratt`);
    assert.ok(m.varde.hojd <= m.vardeRadhojd * 1.6,
      `vardet ar ${Math.round(m.varde.hojd)} px hogt mot en radhojd pa `
      + `${Math.round(m.vardeRadhojd)} — det har brutits till flera rader`);
  });

  test(`Goal-modell ${model}: kopia, spar och senaste-raden ligger pa skilda gridrader`, { skip }, async () => {
    const m = await matModell(model);
    // `+1 @NOVA` ar en medvetet svavande bricka (position:absolute, top:-16px). Den deltar
    // inte i gridflodet och SKA ligga ovanpa — att krava skilda rader av den vore fel.
    const parar = m.senasteAbsolut ? [['kopia', 'spar']] : [['kopia', 'spar'], ['spar', 'senaste']];
    for (const [a, b] of parar) {
      if (!m[a] || !m[b]) continue;
      const lodratt = Math.min(m[a].u, m[b].u) - Math.max(m[a].o, m[b].o);
      assert.ok(lodratt <= 1,
        `${a} och ${b} overlappar lodratt med ${Math.round(lodratt)} px — de delar gridrad`);
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
