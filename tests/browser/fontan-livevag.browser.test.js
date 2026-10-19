'use strict';
// FONTÄNERNA OCH GÅVOBURKEN FÅR SINA RIKTIGA HÄNDELSER SOM FÖRUT (PR 13 i panelspecifikationen).
//
// PR 13 bröt ut per-widget-funktioner ur Like Fountains trigger (media.js lfPopPa/lfPulsPa/lfSlappPa), lät
// portalens klocka rita en testklon, gav burkens rörelse ett handtag (gift-jar-animals.js) och flyttade de tre in i
// panelramen med ▶ Testa widget. Provet kräver att livevägen är densamma — händelserna skickas som live-client.js
// gör (`vyra-live-event`), alltså samma väg som TikTok-likes och -gåvor:
//   * en riktig like fyller BÅDA klassiska fontänerna och båda portalerna, och skriver tittaren på den klassiska
//     som förut; en riktig gåva fyller båda burkarna, men inte en dold,
//   * en riktig like eller gåva mitt i ett test når de riktiga widgetarna men inte klonen,
//   * varje kontroll som bara verkar när händelser kommer (panel-krav undantar dem som tidsstyrda) gör det den säger:
//     klassisk Minsta like-värde, Max profilbilder, Stjärnläge, popens start, längd och partiklar; Portalens hjärtan
//     per paket, profilbilden och det stora hjärtat; burkens Full vid, Töm automatiskt (sekunder i panelen) och
//     Töm burken (bara efter bekräftelse),
//   * Pop-kryssrutorna spelar inget test längre (spec 2.5): en ändring rör ingen pop på den riktiga widgeten.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

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

async function oppna(fel) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraTestspel && !!window.VyraLikePortal && !!window.VyraAnimalGiftJars,
    null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.VyraSessionState?.projectLocalSession?.(); window.toast = () => {}; });
  await page.waitForTimeout(400);
  return page;
}

// Tre widgetar av samma modell: a (vald), b och en dold c. extra läggs på alla tre.
async function layout(page, nyckel, extra) {
  await page.evaluate(([n, extra]) => {
    state.widgets.length = 0;
    [['a', 60, false], ['b', 520, false], ['c', 960, true]].forEach(([id, x, dold]) => {
      const w = Object.assign(window.VyraWidgets.create(n), extra || {}); w.id = id; w.x = x; w.y = 120; if (dold) w.hidden = true; state.widgets.push(w);
    });
    selected = 'a'; save(); render();
  }, [nyckel, extra || null]);
  await page.waitForFunction(() => !!document.querySelector('#pr-testspel'), null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(1200);
}

const like = (page, d) => page.evaluate(d => window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: Object.assign({ type: 'like', at: Date.now() }, d) })), d);
const gava = (page, d) => page.evaluate(d => window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: Object.assign({ type: 'gift', giftName: 'Rose' }, d) })), d);
const andra = (page, f) => page.evaluate(f => { for (const w of state.widgets) Object.assign(w, f); render(); }, f);
const riktig = id => `.canvas [data-id="${id}"]:not([data-testspel-klon])`;

// ---- Like Fountain klassisk -------------------------------------------------------------------
const klassisk = (page, id) => page.evaluate(sel => {
  const n = document.querySelector(sel);
  const pop = n.querySelector('.fountain-pop');
  return { live: n.querySelectorAll('.lf-live').length, bilder: n.querySelectorAll('.lf-live.lf-p-heart-avatar').length,
    stjarnor: n.querySelectorAll('.lf-live.lf-star').length, react: n.classList.contains('lf-live-react'),
    pop: pop.classList.contains('play'), popKlass: pop.className, partiklar: pop.querySelectorAll('i').length,
    storlek: (pop.querySelector('i') || { style: { getPropertyValue: () => '' } }).style.getPropertyValue('--size'),
    avstand: (pop.querySelector('i') || { style: { getPropertyValue: () => '' } }).style.getPropertyValue('--d') };
}, riktig(id));

test('klassisk: en riktig like fyller båda fontänerna och skriver tittaren som förut', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    await layout(page, 'catalog:likefountain');
    await like(page, { count: 12, username: 'Sara', profileImage: 'assets/gifts/events/7460_Cap.png' });
    await page.waitForTimeout(700);
    const a = await klassisk(page, 'a'), b = await klassisk(page, 'b');
    for (const [n, x] of [['a', a], ['b', b]]) {
      assert.ok(x.live > 0, `${n}: likes släpper hjärtan: ${JSON.stringify(x)}`);
      assert.equal(x.pop, true, `${n}: popen spelar`);
      assert.equal(x.react, true, `${n}: pulsen`);
    }
    const w = await page.evaluate(() => ({ user: liveWidget('a').fountainUser, antal: liveWidget('a').fountainLikeCount }));
    assert.equal(w.user, 'Sara', 'livevägen skriver tittaren på widgeten som förut');
    assert.ok(w.antal >= 12, 'och räknar likes');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally { await page.close(); }
});

test('klassisk: en riktig like mitt i ett test når de riktiga fontänerna men inte klonen', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    await layout(page, 'catalog:likefountain');
    await page.click('#pr-testspel');
    await page.waitForTimeout(600);
    await like(page, { count: 9, username: 'Riktig', profileImage: 'assets/gifts/events/7460_Cap.png' });
    await page.waitForTimeout(700);
    const ut = await page.evaluate(() => {
      const bilder = sel => [...document.querySelectorAll(sel + ' .lf-live img')].map(i => i.getAttribute('src')).join();
      return { klon: bilder('.canvas [data-testspel-klon]'), b: bilder('.canvas [data-id="b"]'), user: liveWidget('a').fountainUser };
    });
    assert.match(ut.b, /7460_Cap/, 'den riktiga likens profilbild stiger i B');
    assert.doesNotMatch(ut.klon, /7460_Cap/, 'klonen fick inte den riktiga liken');
    assert.match(ut.klon, /test-profile/, 'klonen spelar sina egna exempellikes');
    assert.equal(ut.user, 'Riktig', 'den riktiga liken skrevs på den riktiga widgeten');
    await page.click('#pr-testspel');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally { await page.close(); }
});

test('klassisk: varje tidsstyrd kontroll verkar på riktiga likes', { skip, timeout: 180000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    await layout(page, 'catalog:likefountain');
    // Minsta like-värde: 20. Ett paket på 8 ger ingen pop (likes samlas), nästa på 14 ger en.
    await andra(page, { fountainMinLikes: 20 });
    await page.waitForTimeout(300);
    await like(page, { count: 8, username: 'Sara' });
    await page.waitForTimeout(150);
    assert.equal((await klassisk(page, 'b')).pop, false, 'under Minsta like-värde: ingen pop');
    await like(page, { count: 14, username: 'Sara' });
    await page.waitForTimeout(150);
    assert.equal((await klassisk(page, 'b')).pop, true, 'när likes nått Minsta like-värde: pop');

    // Popen: start (klass), partiklarnas antal (per sort), storlek (--size) och hastighet (--d), och längd.
    await andra(page, { fountainMinLikes: 1, fountainPopEntrance: 'fade', fountainParticleCount: 6, fountainParticleSize: 30,
      fountainParticleSpeed: 400, fountainPopDuration: 0.8, fountainPopSparkle: false, fountainPopMiniHearts: false,
      fountainPopStars: false, fountainPopConfetti: false, fountainPopFirework: false });
    await page.waitForTimeout(300);
    await like(page, { count: 2, username: 'Leo' });
    await page.waitForTimeout(100);
    const p = await klassisk(page, 'b');
    assert.match(p.popKlass, /ws-anim-fade/, 'Popens start');
    assert.equal(p.partiklar, 6, 'Antal partiklar: 6 av den enda sorten (Burst)');
    assert.equal(p.storlek, '30px', 'Partikelstorlek');
    assert.equal(p.avstand, '120px', 'Partikelhastighet 400 (2 ×) dubblar räckvidden: 60 px → 120 px');
    await page.waitForTimeout(1000);
    assert.equal((await klassisk(page, 'b')).pop, false, 'Popens längd 0,8 s: popen är slut efter 1,1 s');

    // Max profilbilder samtidigt: 1. Fem tittare med bild på en gång ger högst en bild i luften.
    await andra(page, { fountainMaxAvatars: 1, fountainStarLikes: 100 });
    await page.waitForTimeout(300);
    for (let i = 0; i < 5; i++) await like(page, { count: 1, username: 'tittare' + i, profileImage: 'assets/images/test-profile.svg' });
    await page.waitForTimeout(900);
    assert.equal((await klassisk(page, 'b')).bilder, 1, 'Max profilbilder samtidigt 1');

    // Stjärnläge från 10: ett paket på 12 med bild ger stjärnan, ett på 9 gör det inte.
    await andra(page, { fountainMaxAvatars: 4, fountainStarLikes: 10 });
    await page.waitForTimeout(300);
    await like(page, { count: 9, username: 'Mia', profileImage: 'assets/images/test-profile.svg' });
    await page.waitForTimeout(500);
    assert.equal((await klassisk(page, 'b')).stjarnor, 0, 'under Stjärnläge: ingen stjärna');
    await like(page, { count: 12, username: 'Zoe', profileImage: 'assets/images/test-profile.svg' });
    await page.waitForTimeout(500);
    assert.ok((await klassisk(page, 'b')).stjarnor >= 1, 'Stjärnläge från 10: paketet på 12 ger stjärnan');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally { await page.close(); }
});

test('klassisk: Pop-kryssrutorna spelar inget test längre', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    await layout(page, 'catalog:likefountain');
    await page.evaluate(() => document.querySelectorAll('.properties [data-panelram-sektion].collapsible').forEach(s => s.classList.add('open')));
    await page.click('#fountainPopStars');
    await page.waitForTimeout(150);
    const ut = await page.evaluate(sel => ({ pop: document.querySelector(sel + ' .fountain-pop').classList.contains('play'),
      klass: document.querySelector(sel).classList.contains('lf-fx-stars'), falt: liveWidget('a').fountainPopStars }), riktig('a'));
    assert.deepEqual(ut, { pop: false, klass: false, falt: false }, 'kryssrutan sparar valet och byter klassen, men spelar ingen pop');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally { await page.close(); }
});

// ---- Like Fountain Portal ---------------------------------------------------------------------
const portal = (page, id) => page.evaluate(id => window.VyraLikePortal.tillstand(id), id);

test('portal: en riktig like fyller båda portalerna, och en like mitt i ett test når inte klonen', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    await layout(page, 'catalog:likefountain:portal:aurora');
    await like(page, { count: 12, username: 'Sara', profileImage: 'assets/images/test-profile.svg' });
    await page.waitForTimeout(400);
    const a = await portal(page, 'a'), b = await portal(page, 'b');
    for (const [n, t] of [['a', a], ['b', b]]) assert.ok(t && t.hjartan + t.ko > 0 && t.aktiv, `${n}: hjärtan stiger: ${JSON.stringify(t)}`);
    assert.equal(await page.evaluate(sel => document.querySelector(sel).classList.contains('lfp-live'), riktig('b')), true, 'B:s duk ritas');

    // Mitt i ett test: klonens kö ändras inte av en riktig like (räknat i samma bildruta), de riktigas gör det.
    await page.waitForTimeout(6000);
    await page.click('#pr-testspel');
    await page.waitForTimeout(500);
    const ut = await page.evaluate(() => {
      const P = window.VyraLikePortal;
      const fore = { klon: P.tillstand('a__prov').ko, b: (P.tillstand('b') || { ko: 0 }).ko };
      window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'like', at: Date.now(), count: 9, username: 'Riktig' } }));
      return { fore, efter: { klon: P.tillstand('a__prov').ko, b: P.tillstand('b').ko } };
    });
    assert.equal(ut.efter.klon, ut.fore.klon, 'klonen fick inte den riktiga liken');
    assert.ok(ut.efter.b > ut.fore.b, 'den riktiga liken nådde B');
    await page.click('#pr-testspel');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally { await page.close(); }
});

test('portal: hjärtan per paket, profilbilden och det stora hjärtat verkar på riktiga likes', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    // Hjärtan per like-paket 2: ett paket på 12 likes ger 2 hjärtan (inte 6). Profilbild av: ingen bild i kön.
    await layout(page, 'catalog:likefountain:portal:neon', { fountainPerLike: 2, fountainAvatarHearts: false, fountainPopEvery: 0 });
    const k = await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'like', at: Date.now(), count: 12, username: 'Sara', profileImage: 'assets/images/test-profile.svg' } }));
      return window.VyraLikePortal.tillstand('b');
    });
    assert.equal(k.ko, 2, 'Hjärtan per like-paket 2');
    await page.waitForTimeout(900);
    assert.equal((await portal(page, 'b')).bubblor, 0, 'Profilbild stiger med av: ingen profilbild');
    assert.equal((await portal(page, 'b')).form, false, 'Stort hjärta 0 = av');

    // Profilbilden på: tittarens bild stiger. (Likes räknas mot det stora hjärtat också när det är av — 24 nu.)
    await andra(page, { fountainAvatarHearts: true });
    await page.waitForTimeout(3500);
    await like(page, { count: 12, username: 'Leo', profileImage: 'assets/images/test-profile.svg' });
    await page.waitForTimeout(700);
    assert.ok((await portal(page, 'b')).bubblor >= 1, 'Profilbild stiger med: tittarens bild stiger');
    // Stort hjärta var 30 likes: vid 24 ingen formation, nästa paket (36) startar den.
    await andra(page, { fountainPopEvery: 30 });
    await page.waitForTimeout(300);
    assert.equal((await portal(page, 'b')).form, false, 'Stort hjärta var 30: ingen formation vid 24 likes');
    await like(page, { count: 12, username: 'Leo' });
    await page.waitForTimeout(100);
    assert.equal((await portal(page, 'b')).form, true, 'Stort hjärta var 30: formationen startar vid 36 likes');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally { await page.close(); }
});

// ---- Gift Jar --------------------------------------------------------------------------------
const antal = page => page.evaluate(() => ['a', 'b', 'c'].map(id => giftJarState(liveWidget(id)).count));

test('burk: en riktig gåva fyller båda burkarna men inte en dold, och når inte klonen mitt i ett test', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    await layout(page, 'catalog:giftjar:dragon');
    await gava(page, { count: 3 });
    await page.waitForTimeout(400);
    assert.deepEqual(await antal(page), [3, 3, 0], 'tre gåvor i a och b, ingen i den dolda c');
    const foremal = await page.evaluate(sel => document.querySelector(sel + ' canvas').__burk.inspect().foremal, riktig('b'));
    assert.equal(foremal, 3, 'gåvorna faller i B:s burk');

    await page.click('#pr-testspel');
    await page.waitForTimeout(1500);
    const ut = await page.evaluate(() => {
      const klon = () => giftJarRuntime.get('a__prov').count;
      const fore = klon();
      window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'gift', giftName: 'Rose', count: 2 } }));
      return { fore, efter: klon() };
    });
    assert.equal(ut.efter, ut.fore, 'klonens burk fick inte den riktiga gåvan');
    assert.deepEqual(await antal(page), [5, 5, 0], 'den riktiga gåvan nådde a och b mitt i testet');
    // Panelen visar hur full den riktiga burken är, också när gåvor kommer utan omritning.
    assert.equal(await page.textContent('.properties .pr-burk-fylld'), 'Fylld nu: 5 av 50 gåvor');
    await page.click('#pr-testspel');
    await page.waitForTimeout(200);
    assert.deepEqual(await antal(page), [5, 5, 0], 'testet rörde inte de riktiga burkarna');
    assert.equal(await page.evaluate(() => giftJarRuntime.has('a__prov')), false, 'klonens post är borta');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally { await page.close(); }
});

test('burk: Full vid, Töm automatiskt (sekunder) och Töm burken (med bekräftelse) verkar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna(fel);
  try {
    await layout(page, 'catalog:giftjar:panther');
    // Töm automatiskt visas i sekunder och sparas i millisekunder.
    const sek = await page.evaluate(() => { const el = document.querySelector('.properties #jarAutoReset'); return { varde: el.value, max: el.max, steg: el.step }; });
    assert.deepEqual(sek, { varde: '0', max: '60', steg: '0.5' }, 'fältet är i sekunder');
    await page.evaluate(() => { const el = document.querySelector('.properties #jarAutoReset'); el.value = '1.5'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => liveWidget('a').jarAutoResetMs), 1500, '1,5 s sparas som 1500 ms');
    assert.equal(await page.evaluate(() => document.querySelector('.properties #jarAutoReset').value), '1.5', 'panelen visar sekunder efter omritningen');

    // Full vid 4 och töm efter 1,5 s: fyra gåvor fyller burken, finalen köas, och burken töms.
    await andra(page, { jarCapacity: 4, jarAutoResetMs: 1500 });
    await page.waitForTimeout(500);
    await gava(page, { count: 4 });
    await page.waitForTimeout(150);
    const full = await page.evaluate(sel => ({ n: giftJarState(liveWidget('b')).count, burk: document.querySelector(sel + ' canvas').__burk.inspect() }), riktig('b'));
    assert.equal(full.n, 4);
    assert.ok(full.burk.ko === 1 || full.burk.final, 'Full vid 4: finalen köas när burken blir full: ' + JSON.stringify(full.burk));
    await page.waitForTimeout(1700);
    assert.deepEqual(await antal(page), [0, 0, 0], 'Töm automatiskt efter 1,5 s');
    // Full vid 10: fyra gåvor fyller inte burken, och ingenting töms.
    await andra(page, { jarCapacity: 10 });
    await page.waitForTimeout(500);
    await gava(page, { count: 4 });
    await page.waitForTimeout(1900);
    assert.deepEqual(await antal(page), [4, 4, 0], 'Full vid 10: burken är inte full och töms inte');

    // Töm burken: nej i bekräftelsen gör ingenting, ja tömmer bara den valda burken.
    page.once('dialog', d => d.dismiss());
    await page.click('#pr-jarTom');
    await page.waitForTimeout(200);
    assert.deepEqual(await antal(page), [4, 4, 0], 'nej i bekräftelsen: ingenting töms');
    page.once('dialog', d => { assert.match(d.message(), /Töm burken\?/); d.accept(); });
    await page.click('#pr-jarTom');
    await page.waitForTimeout(200);
    assert.deepEqual(await antal(page), [0, 4, 0], 'ja: den valda burken töms, grannen inte');
    assert.equal(await page.textContent('.properties .pr-burk-fylld'), 'Fylld nu: 0 av 10 gåvor');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally { await page.close(); }
});
