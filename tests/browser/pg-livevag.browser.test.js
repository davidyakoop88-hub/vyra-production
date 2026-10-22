'use strict';
// LIVEVÄGEN ÄR OFÖRÄNDRAD FÖR PLAYGROUND-WIDGETARNA (PR 11 i panelspecifikationen).
//
// Top Gifter Podium, Top Streak Flip och Goal Pro har sedan PR 11 panelramens panel och ▶ Testa widget, som
// spelar en klon i VyraPlayground.sandlada med en egen session. Testraden (Skicka gåva … Nollställ), som
// matade sändningens session och kunde nollställa den, är borta. Provet kräver att de riktiga widgetarna
// beter sig som förut:
//   * en riktig händelse genom routeLiveBattleEvent → feed når ALLA monterade instanser (två podier, två
//     mål, två streakar), och live:start nollställer dem (resetAll) som förut,
//   * ▶/■ ändrar varken sändningens session, runtime-state eller någon riktig widget — ett mål på 40 %
//     står kvar på 40 % (resetAll anropas alltså inte), och en riktig händelse MITT I ett test når de
//     riktiga widgetarna men inte klonen,
//   * Top Streak Flips regler, som bara syns när händelser kommer (därför tidsstyrda i panel-krav): Visa från
//     streak, Flippa mellan profil och gåva med Flip-tid, och Streak bryts efter,
//   * Ramlager på avatar och Namneffekt saknar verkan i Goal Pro även med Visa senaste bidrag och ett bidrag
//     ritat (därför finns de inte i Goal Pros panel), men verkar i podiet,
//   * Återställ utseende tar tillbaka utseendet i w.pg och lämnar innehållet (rubrik, mål) och placeringen.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };

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

async function oppna(fel, widgets, vald) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraTestspel && !!window.VyraPlayground,
    null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(([lista, vald]) => {
    state.widgets.length = 0;
    lista.forEach(([id, n, pg], i) => {
      const w = window.VyraWidgets.create(n);
      w.id = id; w.x = 10 + (i % 3) * 140; w.y = 40 + Math.floor(i / 3) * 360; w.width = 130;
      if (pg) w.pg = Object.assign({}, w.pg, pg, { x: Object.assign({}, (w.pg || {}).x, pg.x || {}) });
      state.widgets.push(w);
    });
    selected = vald;
    save();
    render();
  }, [widgets, vald]);
  await page.waitForTimeout(1500);
  return page;
}

// Riktiga händelser, i VYRA:s format, genom samma ingång som bryggan.
const gava = (page, user, giftName, diamonds, repeatCount = 1, giftId) => page.evaluate(([user, giftName, diamonds, repeatCount, giftId]) =>
  // `diamonds` är här styckpriset; bryggan skickar totalen (pris × repeatCount), så det gör provet också.
  window.routeLiveBattleEvent({ type: 'gift', username: user, giftName, giftId: giftId || giftName, diamonds: diamonds * repeatCount, repeatCount, repeatEnd: true }),
[user, giftName, diamonds, repeatCount, giftId || null]);

const riktig = id => `.canvas [data-id="${id}"]:not([data-testspel-klon])`;
const lage = page => page.evaluate(() => {
  const nod = id => document.querySelector(`.canvas [data-id="${id}"]:not([data-testspel-klon])`);
  const pc = id => { const n = nod(id); const c = n && [...n.querySelectorAll('.gvc')].find(x => x.style.display !== 'none'); return c ? c.querySelector('.pc').textContent : null; };
  return {
    podA: nod('lv-pa') && nod('lv-pa').querySelector('.pcol.r1 .nm').textContent,
    podB: nod('lv-pb') && nod('lv-pb').querySelector('.pcol.r1 .nm').textContent,
    malA: pc('lv-ma'), malB: pc('lv-mb'),
    streakA: nod('lv-sa') && nod('lv-sa').querySelector('.stk-nm').textContent,
    streakB: nod('lv-sb') && nod('lv-sb').querySelector('.stk-nm').textContent,
    session: JSON.stringify(window.VyraPlaygroundWidgets.session()),
    runtime: JSON.stringify(window.VyraPlaygroundWidgets.state),
    monterade: window.VyraPlaygroundWidgets.mounted(),
  };
});

const LAYOUT = [
  ['lv-pa', 'catalog:pgpodium:royal-phoenix'], ['lv-pb', 'catalog:pgpodium:none'],
  ['lv-ma', 'catalog:pggoal:1', { x: { metric: 'coins', target: 2000 } }], ['lv-mb', 'catalog:pggoal:6', { x: { metric: 'coins', target: 2000 } }],
  ['lv-sa', 'catalog:pgstreak:royal-wings'], ['lv-sb', 'catalog:pgstreak:frost-wings'],
];

test('livevägen: routeLiveBattleEvent når alla instanser, ▶/■ rör ingenting, live:start nollställer', { skip, timeout: 180000 }, async () => {
  const fel = [];
  const page = await oppna(fel, LAYOUT, 'lv-pa');
  try {
    const start = await lage(page);
    assert.equal(start.monterade, 6, 'alla sex är monterade');
    assert.deepEqual([start.malA, start.malB], ['0%', '0%']);

    // En riktig Crown (799 mynt): båda podierna, båda målen (40 %) och båda streakarna.
    await gava(page, 'anna', 'Crown', 799);
    await page.waitForTimeout(1500);
    // Målets procent räknas upp mjukt (playground-widgets.js `shown` närmar sig värdet över tid). På en
    // belastad maskin (domänsviten kör filerna parallellt) stod den på 38 % efter 1,5 s — vänta in den.
    await page.waitForFunction(() => [...document.querySelectorAll('.canvas [data-id="lv-ma"] .pc, .canvas [data-id="lv-mb"] .pc')]
      .filter(n => n.textContent).every(n => n.textContent === '40%'), null, { timeout: 6000, polling: 100 }).catch(() => {});
    const efterGava = await lage(page);
    assert.deepEqual([efterGava.podA, efterGava.podB], ['anna', 'anna'], 'båda podierna fick givaren');
    assert.deepEqual([efterGava.malA, efterGava.malB], ['40%', '40%'], 'båda målen räknade gåvan');
    assert.ok(JSON.parse(efterGava.runtime)['lv-sa'].top.user === 'anna' && JSON.parse(efterGava.runtime)['lv-sb'].top.user === 'anna', 'båda streakarna har rekordet');
    assert.deepEqual(Object.keys(JSON.parse(efterGava.session).users), ['anna']);

    // ▶ på podiet: sändningen står still, och en riktig gåva mitt i testet når bara de riktiga.
    await page.click('#pr-testspel');
    await page.waitForTimeout(1600);
    assert.deepEqual(await lage(page), efterGava, 'ett pågående test rör varken session, runtime-state eller någon riktig widget');
    await gava(page, 'bert', 'Lion', 29999);
    await page.waitForTimeout(800);
    const mitt = await lage(page);
    assert.deepEqual([mitt.podA, mitt.podB], ['bert', 'bert'], 'den riktiga gåvan nådde båda podierna mitt i testet');
    assert.deepEqual([mitt.malA, mitt.malB], ['100%', '100%'], 'och båda målen');
    const klon = await page.evaluate(() => [...document.querySelectorAll('.canvas [data-testspel-klon] .pcol .nm')].map(n => n.textContent));
    assert.ok(!klon.includes('bert') && !klon.includes('anna'), 'klonen visar bara testets givare: ' + klon.join(','));
    await page.click('#pr-testspel');
    await page.waitForTimeout(3000);
    const efterTest = await lage(page);
    assert.equal(efterTest.session, mitt.session, '■ ändrade inte sessionen (resetAll anropades inte)');
    assert.equal(await page.evaluate(() => window.VyraTestspel.status().senaste.brott.length), 0, 'inga brott');

    // live:start nollställer allt — samma resetAll som förut.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('vyra-live-session', { detail: { event: 'live:start' } })));
    await page.waitForTimeout(800);
    const nollat = await lage(page);
    assert.equal(nollat.session, JSON.stringify({ users: {}, coins: 0, likes: 0, follows: 0, shares: 0, focus: null }), 'live:start tömde sessionen');
    assert.deepEqual([nollat.malA, nollat.malB], ['0%', '0%'], 'live:start nollställde målen');
    assert.notEqual(nollat.podA, 'bert', 'podiet visar inte längre givaren');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Top Streak Flip: Visa från streak, Flippa/Flip-tid och Streak bryts efter verkar när händelser kommer', { skip, timeout: 180000 }, async () => {
  const fel = [];
  const page = await oppna(fel, [
    ['lv-min', 'catalog:pgstreak:royal-wings', { x: { minn: 5 } }],
    ['lv-flip', 'catalog:pgstreak:royal-wings', { x: { flip: '1', flipt: 2 } }],
    ['lv-utan', 'catalog:pgstreak:royal-wings', { x: { flip: '0', flipt: 2 } }],
    ['lv-gap', 'catalog:pgstreak:royal-wings', { x: { gap: 3 } }],
  ], 'lv-min');
  try {
    const tom = id => page.evaluate(s => document.querySelector(s + ' .stk').classList.contains('stk-empty'), riktig(id));
    const baksida = id => page.evaluate(s => !!document.querySelector(s + ' .fl.back'), riktig(id));
    // Visa från streak 5: en combo på 3 visas inte, på 5 visas den.
    await gava(page, 'cia', 'Rose', 1, 3, 'r');
    await page.waitForTimeout(300);
    assert.equal(await tom('lv-min'), true, 'streak 3 under Visa från streak 5 visas inte');
    await gava(page, 'cia', 'Rose', 1, 5, 'r');
    await page.waitForTimeout(300);
    assert.equal(await tom('lv-min'), false, 'streak 5 visas');
    // Flippa: varannan Flip-tid (2 s) står den på gåvan med flipp på; den utan vänder aldrig. Läses var
    // 100:e ms under ett helt varv, eftersom flippen går i widgetens egen takt från monteringen.
    const sett = { flip: false, utan: false };
    for (let i = 0; i < 45; i++) {
      if (await baksida('lv-flip')) sett.flip = true;
      if (await baksida('lv-utan')) sett.utan = true;
      await page.waitForTimeout(100);
    }
    assert.equal(sett.flip, true, 'Flippa Ja vänder till gåvan inom ett varv');
    assert.equal(sett.utan, false, 'Flippa Nej vänder aldrig');
    // Streak bryts efter 3 s: en ny gåva efter paus startar om combon på 1.
    const n = () => page.evaluate(() => window.VyraPlaygroundWidgets.state['lv-gap'].live.dan.n);
    await gava(page, 'dan', 'Cap', 99, 1, 'c');
    await gava(page, 'dan', 'Cap', 99, 1, 'c');
    await page.waitForTimeout(100);
    const fore = await n();
    await page.waitForTimeout(3300);
    await gava(page, 'dan', 'Cap', 99, 1, 'c');
    await page.waitForTimeout(100);
    assert.ok(fore >= 2, 'combon växte inom 3 s: ' + fore);
    assert.equal(await n(), 1, 'efter 3 s paus börjar combon om');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Ramlager på avatar och Namneffekt: ingen verkan i Goal Pro med ett bidrag ritat, verkan i podiet', { skip, timeout: 180000 }, async () => {
  const fel = [];
  const page = await oppna(fel, [
    ['lv-mal', 'catalog:pggoal:1', { x: { last: '1', metric: 'coins' } }],
    ['lv-pod', 'catalog:pgpodium:none'],
  ], 'lv-mal');
  try {
    await gava(page, 'eva', 'Cap', 99);
    // Bidragets egna effekter (+99, milstolpen) ska ha klingat av, och inga animationer får gå under mätningen.
    await page.waitForTimeout(3000);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
    await page.waitForTimeout(200);
    assert.ok(await page.$(riktig('lv-mal') + ' .gvlast .lrow'), 'bidraget är ritat');
    const stil = (id, frame, namefx) => page.evaluate(([s, frame, namefx]) => {
      const host = document.querySelector(s + ' .pgw');
      host.dataset.frame = frame; host.dataset.namefx = namefx;
      const P = ['color', 'backgroundImage', 'boxShadow', 'filter', 'animationName', 'opacity', 'display', 'borderTopColor', 'textShadow', 'backgroundClip', 'webkitTextFillColor'];
      return [...host.querySelectorAll('*')].map(n => { const c = getComputedStyle(n); return n.tagName + '.' + n.className + ' ' + P.map(p => c[p]).join('|'); });
    }, [riktig(id), frame, namefx]);
    const olika = (a, b) => a.filter((r, i) => r !== b[i]).concat(a.length === b.length ? [] : ['antal noder']);
    const malFore = await stil('lv-mal', 'halo', 'none');
    for (const [frame, namefx] of [['flame', 'none'], ['petals', 'none'], ['halo', 'aurora'], ['halo', 'shimmer']]) {
      assert.deepEqual(olika(await stil('lv-mal', frame, namefx), malFore), [], `Goal Pro: ${frame}/${namefx} ändrade ingenting`);
    }
    const podFore = await stil('lv-pod', 'halo', 'none');
    assert.ok(olika(await stil('lv-pod', 'flame', 'none'), podFore).length > 0, 'podiet: Ramlager verkar');
    assert.ok(olika(await stil('lv-pod', 'halo', 'aurora'), podFore).length > 0, 'podiet: Namneffekt verkar');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

test('Återställ utseende tar tillbaka utseendet i w.pg och lämnar rubrik, mål och placering', { skip, timeout: 180000 }, async () => {
  const fel = [];
  const page = await oppna(fel, [['lv-ater', 'catalog:pggoal:3']], 'lv-ater');
  try {
    await page.waitForFunction(() => document.querySelector('.properties')?.dataset.panelram === '1', null, { timeout: 15000 });
    const fore = await page.evaluate(() => JSON.stringify(liveWidget('lv-ater').pg));
    await page.evaluate(() => {
      const w = liveWidget('lv-ater');
      w.pg = Object.assign({}, w.pg, { accent: '#ff00ff', glow: 1.4, enter: 'drop', title: 'Kvar', x: Object.assign({}, w.pg.x, { skin: 'neon', target: 777 }) });
      w.x = 333; save(); render();
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelector('.properties [data-panelram-sektion="7"]').classList.add('open'));
    await page.click('#pr-aterstall-utseende');
    await page.waitForTimeout(800);
    const efter = await page.evaluate(() => { const w = liveWidget('lv-ater'); return { pg: w.pg, x: w.x }; });
    const f = JSON.parse(fore);
    assert.equal(efter.pg.accent, f.accent, 'Färg 1 tillbaka');
    assert.equal(efter.pg.glow, f.glow, 'Glöd tillbaka');
    assert.equal(efter.pg.enter, f.enter, 'Entré tillbaka');
    assert.equal(efter.pg.x.skin, f.x.skin, 'Stilskinn tillbaka');
    assert.equal(efter.pg.x.design, '3', 'designen (katalogens modell) står kvar');
    assert.equal(efter.pg.title, 'Kvar', 'rubriken rörs inte');
    assert.equal(efter.pg.x.target, 777, 'målet rörs inte');
    assert.equal(efter.x, 333, 'placeringen rörs inte');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});
