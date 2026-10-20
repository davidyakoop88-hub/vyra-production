'use strict';
// ▶ TESTA WIDGET ÄR ISOLERAT (panelspecifikationen 2.6) — adaptrarna 'topgift', 'lastx', 'fanlevel',
// 'gifterlevel', 'follower', 'guardian', 'mvp', 'ranking', 'socialgoal', 'heartgoal', 'kampanj', 'topstreak', 'pg', 'fyrverkeri', 'hjartfyr',
// 'bubblor', 'fontan', 'portal', 'burk', 'fan50', 'glove' och 'glove-mp4' i Chrome.
// (Last-X, alertfamiljerna, Battle MVP, rankingen, målen och Top Streak har egna prov längre ner.)
//
// För varje modell med testadaptern topgift (Top Gift · Design 1–3 och Signal Orbit) byggs en layout
// med två widgetar av samma modell plus en Goal Pro och en Top Like. Den första testas. Provet kräver:
//
//   * ▶ spelar på KLONEN: en nod med data-testspel-klon får exempelgivaren och gåvan, och flippen
//     och rekordpulsen startar på den — inte på den riktiga noden,
//   * ■ stoppar: klonen försvinner, knappen visar ▶ igen, och ett nytt ▶ ger samma faser,
//   * grannwidgetarna och den riktiga noden är tecken för tecken desamma efter ■ som före ▶,
//     och JSON.stringify(state) är byte-identisk,
//   * inget nät och inget sparande under ▶ och ■ (undantag: GET /api/status från studio-live.js),
//     inga brott i motorns vakter, och topplistornas totaler och sändningens rekord oförändrade,
//   * render() mitt i testet tar bort klonen,
//   * ingenting når overlayn: ?overlay=1 har ingen knapp, spela() gör ingenting, och overlayns
//     Top Gift är oförändrad medan editorn testar.
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

const MODELLER = [
  { namn: 'Top Gift · Design 1 (neon)', nyckel: 'catalog:topgift:premium:neon' },
  { namn: 'Top Gift · Design 2 (royal)', nyckel: 'catalog:topgift:premium:royal' },
  { namn: 'Top Gift · Design 3 (fokus)', nyckel: 'catalog:topgift:premium:fokus' },
  { namn: 'Top Gift · Design 4 (Signal Orbit)', nyckel: 'catalog:ranking:templateTopCoins:signal-orbit' },
];

let server, browser, bas, context;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
  context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
});

test.after(async () => {
  if (context) await context.close();
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function oppnaStudio(fel) {
  const page = await context.newPage();
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraTestspel, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  return page;
}

// Layouten: A (testas), B (samma modell), en Goal Pro och en Top Like. Sparas en gång före provet, så
// att overlayn i samma webbläsarkontext ritar samma layout.
async function layout(page, nyckel) {
  await page.evaluate(n => {
    state.widgets.length = 0;
    const lagg = (k, id, x, y) => { const w = window.VyraWidgets.create(k); w.id = id; w.x = x; w.y = y; state.widgets.push(w); return w; };
    lagg(n, 'prov-a', 60, 120);
    lagg(n, 'prov-b', 420, 120);
    lagg('catalog:pggoal:1', 'prov-mal', 60, 620);
    lagg('catalog:toplike:voltage', 'prov-lista', 420, 620);
    selected = 'prov-a';
    save();
    render();
  }, nyckel);
  await page.waitForFunction(() => !!document.querySelector('#pr-testspel'), null, { timeout: 15000, polling: 100 });
  // Grannarnas egna entréer (Top Likes tl-in m.fl.) ska ha gått klart innan något fotograferas.
  await page.waitForTimeout(3500);
}

// Stubbar som RÄKNAR (och släpper igenom) — de ligger under motorns vakter. Motorns egna vakter
// kastar på adapteranrop; stubbarna fångar dessutom det som sker utanför adaptern under testet.
//
// Det som räknas är det som kan nå sändningen, servern eller den sparade layouten: skrivande
// nätanrop (allt utom GET), WebSocket, BroadcastChannel, sendBeacon, save() (studio.js:
// VyraHistorik.notera + VyraSessionState.writeActive('vyra-state')), skrivningar av 'vyra-state',
// och livevägens, målens, köns och battlens ingångar. Studions egna bakgrundsläsningar (GET-poll av
// /api/events, /api/state/version, /api/status) och masterlåsets hjärtslag går vidare som vanligt
// och räknas inte — de sker lika mycket utan testet.
async function installeraRaknare(page) {
  await page.evaluate(() => {
    const r = window.__provRaknare = { anrop: [] };
    const linda = (obj, metod, namn, filter) => {
      if (!obj || typeof obj[metod] !== 'function') return;
      const orig = obj[metod];
      obj[metod] = function () {
        if (r.pa && (!filter || filter.apply(this, arguments))) r.anrop.push(namn + ' ' + String(arguments[0] && (arguments[0].url || arguments[0]) || '').slice(0, 80));
        return orig.apply(this, arguments);
      };
    };
    const skrivande = m => !/^(GET|HEAD)$/i.test(String(m || 'GET'));
    // Undantaget: masterlåsets hjärtslag (vyra-masterval.js, POST /api/automation/master var 2:a
    // sekund) avgör vilken flik som kör automationerna. Det går hela tiden, med eller utan test, och
    // bär inget av layouten.
    linda(window, 'fetch', 'fetch', (u, o) => skrivande((o && o.method) || (u && u.method))
      && !/\/api\/automation\/master\b/.test(String((u && u.url) || u)));
    const xOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m) { this.__provMetod = m; return xOpen.apply(this, arguments); };
    linda(XMLHttpRequest.prototype, 'send', 'xhr.send', function () { return skrivande(this.__provMetod); });
    if (window.WebSocket) linda(WebSocket.prototype, 'send', 'ws.send');
    if (window.BroadcastChannel) linda(BroadcastChannel.prototype, 'postMessage', 'broadcast');
    linda(navigator, 'sendBeacon', 'beacon');
    linda(Storage.prototype, 'setItem', 'storage.setItem', k => /^vyra-state/.test(String(k)));
    linda(window.VyraSessionState, 'writeActive', 'save');
    linda(window.VyraHistorik, 'notera', 'save.historik');
    linda(window.VyraLive, 'send', 'VyraLive.send');
    linda(window.VyraLive, 'ingest', 'VyraLive.ingest');
    linda(window.VyraAuth, 'api', 'VyraAuth.api');
    for (const [obj, namn] of [[window.VyraGoals, 'VyraGoals'], [window.VyraAlertQueue, 'VyraAlertQueue']]) {
      if (obj) for (const m of Object.keys(obj)) if (typeof obj[m] === 'function') linda(obj, m, namn + '.' + m);
    }
    linda(window, 'routeLiveBattleEvent', 'routeLiveBattleEvent');
  });
}

const bild = page => page.evaluate(() => {
  const nod = id => { const el = document.querySelector(`.canvas [data-id="${id}"]:not([data-testspel-klon])`); return el ? el.outerHTML : null; };
  return {
    state: JSON.stringify(state),
    a: nod('prov-a'), b: nod('prov-b'), mal: nod('prov-mal'), lista: nod('prov-lista'),
    topp: JSON.stringify([window.VyraLeaderboard?.getTop?.('coins', 10), window.VyraLeaderboard?.getTop?.('likes', 10)]),
    poang: JSON.stringify(window.VyraPoints?.getTop?.(10) || null),
    rekord: JSON.stringify(window.VyraGiftRecords),
    session: JSON.stringify(Object.keys(sessionStorage).sort().map(k => [k, sessionStorage.getItem(k)])),
  };
});

function lika(fore, efter, nar) {
  for (const k of Object.keys(fore)) assert.equal(efter[k], fore[k], `${nar}: ${k} ändrades`);
}

const klonInfo = page => page.evaluate(() => {
  const k = document.querySelector('.canvas [data-testspel-klon]');
  if (!k) return null;
  const txt = sel => [...k.querySelectorAll(sel)].map(n => n.textContent.trim()).join('|');
  return {
    id: k.dataset.id, klass: k.className,
    namn: txt('.topgift-copy strong, .tgf-plate strong, .tc-copy strong'),
    varde: txt('.topgift-copy em, .tgf-plate em, .tc-copy em'),
    gava: (k.querySelector('.vyra-gift-face img, .tc-gift img') || {}).getAttribute?.('src') || null,
    profil: (k.querySelector('.vyra-profile-face img, .tc-portrait > img') || {}).getAttribute?.('src') || null,
  };
});

for (const m of MODELLER) {
  test(`topgift-adaptern är isolerad: ${m.namn}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppnaStudio(fel);
    try {
      await layout(page, m.nyckel);
      await installeraRaknare(page);
      const typ = await page.evaluate(() => { const s = document.querySelector('#pr-testspel-typ'); return s && s.value; });
      assert.equal(typ, 'rose', 'gåvoväljaren i sektion 1 står på Rose');
      const fore = await bild(page);

      // ▶
      await page.evaluate(() => { window.__provRaknare.pa = true; });
      await page.click('#pr-testspel');
      const s1 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s1.aktiv, true, 'testet startade');
      assert.equal(s1.adapter, 'topgift');
      assert.equal(await page.textContent('#pr-testspel'), '■ Stoppa test');
      const faser1 = s1.faser;
      assert.ok(faser1.visning > 0 && faser1.utgang > 0, 'faserna har längd');

      // Exempelgåvan kommer in efter entrén och en kort stund av visningen.
      await page.waitForTimeout(faser1.entre + 900);
      const k = await klonInfo(page);
      assert.ok(k, 'klonen finns i duken');
      assert.equal(k.id, 'prov-a__prov');
      assert.match(k.namn, /Alex/, 'exempelgivaren står på klonen');
      assert.match(k.varde, m.nyckel.includes('templateTopCoins') ? /1 COINS/ : /\b1$/, 'gåvans värde står på klonen');
      assert.match(k.klass, /\brecord\b/, 'rekordpulsen startade på klonen');
      assert.match(k.klass, /\bplay\b/, 'flippen startade på klonen');
      assert.match(k.profil || '', /test-profile\.svg/, 'exempelprofilen');
      if (k.gava !== null) assert.match(k.gava, /0001_Rose\.png/, 'exempelgåvan Rose');
      const dold = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="prov-a"]:not([data-testspel-klon])')).visibility);
      assert.equal(dold, 'hidden', 'den riktiga noden är dold medan klonen spelar');
      const mitt = await bild(page);
      lika(fore, mitt, 'mitt i testet');

      // ■
      await page.click('#pr-testspel');
      await page.waitForTimeout(150);
      const s2 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s2.aktiv, false, 'testet stoppades');
      assert.equal(s2.senaste.orsak, 'knapp');
      assert.deepEqual(s2.senaste.brott, [], 'inga brott i motorns vakter');
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta');
      assert.equal(await page.textContent('#pr-testspel'), '▶ Testa widget');
      const efter = await bild(page);
      lika(fore, efter, 'efter ■');
      const anrop = await page.evaluate(() => { window.__provRaknare.pa = false; return window.__provRaknare.anrop.slice(); });
      assert.deepEqual(anrop, [], 'inget nät, ingen lagring och inga köer under ▶ och ■');
      assert.deepEqual(await page.evaluate(() => window.VyraTestspel.brott()), [], 'motorn registrerade inga brott');

      // ▶ igen: samma faser. Lion den här gången, via gåvoväljaren.
      await page.selectOption('#pr-testspel-typ', 'lion');
      await page.click('#pr-testspel');
      const s3 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s3.aktiv, true, 'testet kan spelas om');
      assert.deepEqual(s3.faser, faser1, 'omspelningen har samma faser');
      await page.waitForTimeout(s3.faser.entre + 900);
      const k2 = await klonInfo(page);
      assert.match(k2.varde, m.nyckel.includes('templateTopCoins') ? /29\s999 COINS/ : /29999$/, 'Lion ger sitt värde');

      // render() mitt i testet tar bort klonen.
      await page.evaluate(() => render());
      await page.waitForTimeout(150);
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'render() tog bort klonen');
      const s4 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s4.aktiv, false);
      assert.equal(s4.senaste.orsak, 'render');
      assert.equal(await page.evaluate(() => JSON.stringify(state)), fore.state, 'state oförändrad efter render-stoppet');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('topgift: ett test som får gå klart passerar entré → visning → utgång och lämnar inget kvar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppnaStudio(fel);
  try {
    await layout(page, 'catalog:topgift:premium:royal');
    // Widgetens egen inträdeseffekt ska vara den testet spelar.
    await page.evaluate(() => { const w = liveWidget('prov-a'); w.entranceAnimation = 'fade'; w.entranceDuration = 400; save(); render(); });
    await page.waitForTimeout(800);
    const fore = await bild(page);
    await page.click('#pr-testspel');
    const s = await page.evaluate(() => window.VyraTestspel.status());
    assert.equal(s.faser.entre, 400, 'entrén följer widgetens Varaktighet');
    const entre = await page.evaluate(() => document.querySelector('.canvas [data-testspel-klon]').className);
    assert.match(entre, /ws-anim-fade/, 'klonen bär widgetens inträdeseffekt');
    const total = s.faser.entre + s.faser.visning + s.faser.utgang;
    await page.waitForTimeout(total + 600);
    const slut = await page.evaluate(() => window.VyraTestspel.status());
    assert.equal(slut.aktiv, false);
    assert.equal(slut.senaste.orsak, 'klar');
    assert.deepEqual(slut.senaste.forlopp, ['entre', 'visning', 'utgang']);
    assert.equal(await page.$('.canvas [data-testspel-klon]'), null);
    lika(fore, await bild(page), 'efter ett färdigt test');
    assert.deepEqual(fel, []);
  } finally {
    await page.close();
  }
});

test('topgift: ingenting når overlayn', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const editor = await oppnaStudio(fel);
  const overlay = await context.newPage();
  try {
    await layout(editor, 'catalog:topgift:premium:neon');
    await overlay.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
    await overlay.waitForTimeout(3000);
    const lage = await overlay.evaluate(() => ({
      knapp: !!document.querySelector('#pr-testspel'),
      spela: window.VyraTestspel ? window.VyraTestspel.spela(state.widgets[0]) : null,
      kan: window.VyraTestspel ? window.VyraTestspel.kan(state.widgets[0]) : null,
      klon: !!document.querySelector('[data-testspel-klon]'),
    }));
    assert.deepEqual(lage, { knapp: false, spela: false, kan: false, klon: false }, 'overlayn har ingen knapp och spelar ingenting');
    const ovFore = await overlay.evaluate(() => [...document.querySelectorAll('.vyra-topgift')].map(n => n.textContent).join('|'));
    await editor.click('#pr-testspel');
    await editor.waitForTimeout(2500);
    const ovUnder = await overlay.evaluate(() => ({
      text: [...document.querySelectorAll('.vyra-topgift')].map(n => n.textContent).join('|'),
      klon: !!document.querySelector('[data-testspel-klon]'),
    }));
    assert.equal(ovUnder.klon, false, 'ingen klon i overlayn');
    assert.equal(ovUnder.text, ovFore, 'overlayns Top Gift är oförändrad medan editorn testar');
    await editor.click('#pr-testspel');
    assert.deepEqual(fel, []);
  } finally {
    await overlay.close();
    await editor.close();
  }
});

// ---- Last-X (adaptern 'lastx', PR 5) -------------------------------------------------------------
//
// Två Last-X av samma modell och med samma typer, plus Goal Pro och Top Like. Den gamla testknappen
// (showLastX) tände ALLA Last-X med typen, skrev w.lastXLatest och sparade efter 700 ms. Testet
// spelar nu bara på klonen: B ska vara tecken för tecken densamma, ingen widget får lastXLatest och
// inget sparas — inte heller efter de 700 ms då den gamla vägen sparade.
const lastxKlon = page => page.evaluate(() => {
  const k = document.querySelector('.canvas [data-testspel-klon]');
  if (!k) return null;
  const t = sel => (k.querySelector(sel) || {}).textContent || '';
  return { id: k.dataset.id, klass: k.className, rubrik: t('.last-x-label'), namn: t('.last-x-name'), meddelande: t('.last-x-message'),
    profil: (k.querySelector('.last-x-avatar img') || {}).getAttribute?.('src') || null };
});
const ingenSenaste = page => page.evaluate(() => state.widgets.filter(w => w.lastXLatest || w._lastXPersistTimer).map(w => w.id));

for (const design of ['card', 'royal']) {
  test(`lastx-adaptern är isolerad: Last-X · ${design}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppnaStudio(fel);
    try {
      await layout(page, 'catalog:lastx:' + design);
      await installeraRaknare(page);
      const typ = await page.evaluate(() => { const s = document.querySelector('#pr-testspel-typ'); return s && [...s.options].map(o => o.textContent); });
      assert.deepEqual(typ, ['Gåva', 'Like', 'Delning', 'Prenumeration', 'Följare'], 'typväljaren i sektion 1');
      const fore = await bild(page);

      // ▶ Gåva
      await page.evaluate(() => { window.__provRaknare.pa = true; });
      await page.click('#pr-testspel');
      const s1 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s1.aktiv, true, 'testet startade');
      assert.equal(s1.adapter, 'lastx');
      assert.deepEqual(s1.faser, { entre: 400, visning: 5000, utgang: 0 }, 'intro, visningstid 5 s, kortet ligger kvar (Behåll senaste)');
      await page.waitForTimeout(1200);              // förbi de 700 ms då den gamla vägen sparade
      const k = await lastxKlon(page);
      assert.ok(k, 'klonen finns i duken');
      assert.equal(k.id, 'prov-a__prov');
      assert.match(k.klass, /\blast-x-active\b/, 'fasmaskinen tände klonen');
      assert.equal(k.rubrik, 'SENASTE GÅVOGIVARE');
      assert.equal(k.namn, 'Alex', 'exempelnamnet för en gåva');
      assert.equal(k.meddelande, 'SKICKADE CROWN ×5', 'exempelgåvan');
      assert.match(k.profil || '', /test-profile\.svg/);
      const dold = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="prov-a"]:not([data-testspel-klon])')).visibility);
      assert.equal(dold, 'hidden', 'den riktiga noden är dold medan klonen spelar');
      lika(fore, await bild(page), 'mitt i testet');
      assert.deepEqual(await ingenSenaste(page), [], 'ingen widget fick lastXLatest eller en väntande sparning');
      assert.equal(await page.evaluate(() => !!document.querySelector('.canvas [data-id="prov-b"]').className.match(/last-x-active/)), false,
        'Last-X B av samma typ tändes inte');

      // ■
      await page.click('#pr-testspel');
      await page.waitForTimeout(150);
      const s2 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s2.aktiv, false);
      assert.equal(s2.senaste.orsak, 'knapp');
      assert.deepEqual(s2.senaste.brott, [], 'inga brott i motorns vakter');
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta');
      await page.waitForTimeout(900);
      lika(fore, await bild(page), 'efter ■');
      const anrop = await page.evaluate(() => { window.__provRaknare.pa = false; return window.__provRaknare.anrop.slice(); });
      assert.deepEqual(anrop, [], 'inget nät, ingen lagring och inga köer under ▶ och ■');
      assert.deepEqual(await page.evaluate(() => window.VyraTestspel.brott()), [], 'motorn registrerade inga brott');

      // ▶ Like: samma faser, likens exempel.
      await page.selectOption('#pr-testspel-typ', 'liker');
      await page.click('#pr-testspel');
      const s3 = await page.evaluate(() => window.VyraTestspel.status());
      assert.deepEqual(s3.faser, s1.faser, 'omspelningen har samma faser');
      assert.equal(s3.typ, 'liker');
      await page.waitForTimeout(600);
      const k2 = await lastxKlon(page);
      assert.equal(k2.rubrik, 'SENASTE LIKER');
      assert.equal(k2.namn, 'Mia');
      assert.equal(k2.meddelande, 'SKICKADE 50 LIKES');

      // render() mitt i testet tar bort klonen.
      await page.evaluate(() => render());
      await page.waitForTimeout(150);
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'render() tog bort klonen');
      assert.equal((await page.evaluate(() => window.VyraTestspel.status())).senaste.orsak, 'render');
      assert.equal(await page.evaluate(() => JSON.stringify(state)), fore.state, 'state oförändrad efter render-stoppet');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('lastx: ett test som får gå klart passerar entré → visning → utgång, med widgetens egen text', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppnaStudio(fel);
  try {
    await layout(page, 'catalog:lastx:card');
    // Utan "Behåll senaste" glider kortet ut; egen rubrik och eget meddelande för gåvor; exempelnamn.
    await page.evaluate(() => {
      const w = liveWidget('prov-a');
      w.lastXPersistent = false; w.followName = 'Provnamn';
      w.lastXLabel = { gifter: 'TACK!' }; w.lastXMessage = { gifter: '{antal} × {gåva}' };
      save(); render();
    });
    await page.waitForTimeout(800);
    const fore = await bild(page);
    await page.click('#pr-testspel');
    const s = await page.evaluate(() => window.VyraTestspel.status());
    assert.deepEqual(s.faser, { entre: 400, visning: 5000, utgang: 360 });
    await page.waitForTimeout(700);
    const k = await lastxKlon(page);
    assert.deepEqual([k.rubrik, k.namn, k.meddelande], ['TACK!', 'Provnamn', '5 × Crown'], 'rubrik, exempelnamn och eget meddelande per typ');
    await page.waitForTimeout(s.faser.entre + s.faser.visning + s.faser.utgang);
    const slut = await page.evaluate(() => window.VyraTestspel.status());
    assert.equal(slut.aktiv, false);
    assert.equal(slut.senaste.orsak, 'klar');
    assert.deepEqual(slut.senaste.forlopp, ['entre', 'visning', 'utgang']);
    assert.equal(await page.$('.canvas [data-testspel-klon]'), null);
    lika(fore, await bild(page), 'efter ett färdigt test');
    assert.deepEqual(await ingenSenaste(page), []);
    assert.deepEqual(fel, []);
  } finally {
    await page.close();
  }
});

// ---- Alertfamiljerna (adaptrarna 'fanlevel', 'gifterlevel', 'follower' och 'guardian', PR 6) -----
//
// Den gamla testknappen i varje familj anropade den globala triggern, som gick via VyraAlertQueue,
// filtrerade state.widgets per typ och alltså tände ALLA widgetar av typen — och lämnade testets text
// kvar i dem efteråt. Testet spelar nu familjens per-nod-funktion (fanSpelaPa, gifterSpelaPa,
// followerSpelaPa, guardianSpelaPa i media.js) på klonen: B av samma modell ska vara tecken för tecken
// densamma, kön och sparandet orörda, och ingenting av testet får ligga kvar i duken efter ■, efter
// en omritning eller när testet gått klart.
const ALERTFAMILJER = [
  { namn: 'Fan Level Up · hero', nyckel: 'catalog:fanlevel:layout:hero', adapter: 'fanlevel', aktiv: 'fan-active',
    rester: /\bfan-(active|exit|fas-[a-z]+)\b|playing-level-video/, namnSel: 'h3', namnVantat: 'HeartRiser', nivaSel: '.fan-level-pill', nivaVantad: /11\s*→\s*12/ },
  { namn: 'Gifter Level Up · number', nyckel: 'catalog:gifterlevel:number', adapter: 'gifterlevel', aktiv: 'gifter-active',
    rester: /\bgifter-(active|exit|xform-[a-z]+|fas-[a-z]+)\b|playing-level-video/, namnSel: 'h3', namnVantat: 'ThunderGifter', nivaSel: '.gifter-big-level', nivaVantad: /^1[45]$/ },
  { namn: 'Follower Spotlight · ocean', nyckel: 'catalog:followeralert:ocean', adapter: 'follower', aktiv: 'follow-active',
    rester: /\bfollow-active\b/, namnSel: 'h2', namnVantat: 'Aurora Vale' },
  { namn: 'Guardian Emblem · Krona', nyckel: 'catalog:guardianemblem:3', adapter: 'guardian', aktiv: 'ge-active',
    rester: /\bge-(active|koreografi|fas-[a-z]+)\b/, namnSel: '.ge-namn', namnVantat: '@Guardian', fas: /\bge-fas-(ljus|oppna)\b/, koreografi: /\bge-koreografi\b/ },
];

const alertKlon = (page, m) => page.evaluate(m => {
  const k = document.querySelector('.canvas [data-testspel-klon]');
  if (!k) return null;
  const t = sel => sel ? ((k.querySelector(sel) || {}).textContent || '').trim() : '';
  return { id: k.dataset.id, klass: k.className, namn: t(m.namnSel), niva: t(m.nivaSel) };
}, { namnSel: m.namnSel, nivaSel: m.nivaSel || null });

// Widgetar i duken (klonen undantagen) som bär en klass testet sätter.
const resterIDuken = (page, re) => page.evaluate(src => {
  const re = new RegExp(src);
  return [...document.querySelectorAll('.canvas .widget:not([data-testspel-klon])')].filter(n => re.test(n.className)).map(n => n.dataset.id + ': ' + n.className);
}, re.source);

for (const m of ALERTFAMILJER) {
  test(`${m.adapter}-adaptern är isolerad: ${m.namn}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppnaStudio(fel);
    try {
      await layout(page, m.nyckel);
      await installeraRaknare(page);
      assert.equal(await page.$('#pr-testspel-typ'), null, 'familjen har ingen typväljare');
      assert.deepEqual(await resterIDuken(page, m.rester), [], 'kontrollmätning: inget är tänt före ▶');
      const fore = await bild(page);

      // ▶
      await page.evaluate(() => { window.__provRaknare.pa = true; });
      await page.click('#pr-testspel');
      const s1 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s1.aktiv, true, 'testet startade');
      assert.equal(s1.adapter, m.adapter);
      assert.equal(await page.textContent('#pr-testspel'), '■ Stoppa test');
      const faser1 = s1.faser;
      assert.ok(faser1.entre > 0 && faser1.visning > 0 && faser1.utgang > 0, 'faserna har längd: ' + JSON.stringify(faser1));
      // Den riktiga, valda noden tonas ut av motorns stilregel med widgetens egen övergång (0,45 s i
      // Follower Spotlight), så den mäts när övergången gått klart.
      await page.waitForTimeout(700);
      const k = await alertKlon(page, m);
      assert.ok(k, 'klonen finns i duken');
      assert.equal(k.id, 'prov-a__prov');
      assert.match(k.klass, new RegExp('\\b' + m.aktiv + '\\b'), 'per-nod-funktionen tände klonen');
      assert.equal(k.namn, m.namnVantat, 'widgetens exempelnamn står på klonen');
      if (m.nivaVantad) assert.match(k.niva, m.nivaVantad, 'exempelnivån står på klonen');
      if (m.fas) assert.match(k.klass, m.fas, 'koreografin startade på klonen');
      if (m.koreografi) assert.match(k.klass, m.koreografi, 'koreografiklassen ligger på klonen');
      const dold = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="prov-a"]:not([data-testspel-klon])')).visibility);
      assert.equal(dold, 'hidden', 'den riktiga noden är dold medan klonen spelar');
      lika(fore, await bild(page), 'mitt i testet');
      assert.deepEqual(await resterIDuken(page, m.rester), [], 'B av samma modell och den riktiga noden tändes inte');

      // ■
      await page.click('#pr-testspel');
      await page.waitForTimeout(150);
      const s2 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s2.aktiv, false, 'testet stoppades');
      assert.equal(s2.senaste.orsak, 'knapp');
      assert.deepEqual(s2.senaste.brott, [], 'inga brott i motorns vakter');
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta');
      assert.deepEqual(await resterIDuken(page, m.rester), [], 'ingenting av testet ligger kvar i duken');
      await page.waitForTimeout(600);
      lika(fore, await bild(page), 'efter ■');
      const anrop = await page.evaluate(() => { window.__provRaknare.pa = false; return window.__provRaknare.anrop.slice(); });
      assert.deepEqual(anrop, [], 'inget nät, ingen lagring och ingen kö under ▶ och ■');
      assert.deepEqual(await page.evaluate(() => window.VyraTestspel.brott()), [], 'motorn registrerade inga brott');

      // ▶ igen: samma faser.
      await page.click('#pr-testspel');
      const s3 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s3.aktiv, true, 'testet kan spelas om');
      assert.deepEqual(s3.faser, faser1, 'omspelningen har samma faser');

      // render() mitt i testet tar bort klonen.
      await page.evaluate(() => render());
      await page.waitForTimeout(150);
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'render() tog bort klonen');
      assert.equal((await page.evaluate(() => window.VyraTestspel.status())).senaste.orsak, 'render');
      assert.equal(await page.evaluate(() => JSON.stringify(state)), fore.state, 'state oförändrad efter render-stoppet');
      assert.deepEqual(await resterIDuken(page, m.rester), [], 'ingenting av testet ligger kvar efter render-stoppet');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('alertfamiljerna: ett test som får gå klart passerar entré → visning → utgång och lämnar inget kvar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppnaStudio(fel);
  try {
    // Kortaste visningstiden (2 s), så att hela förloppet ryms i provet.
    await layout(page, 'catalog:followeralert:gold');
    await page.evaluate(() => { const w = liveWidget('prov-a'); w.followDuration = 2; save(); render(); });
    await page.waitForTimeout(800);
    const fore = await bild(page);
    await page.click('#pr-testspel');
    const s = await page.evaluate(() => window.VyraTestspel.status());
    assert.deepEqual(s.faser, { entre: 450, visning: 1550, utgang: 450 }, 'övergången in, resten av visningstiden, övergången ut');
    await page.waitForTimeout(s.faser.entre + s.faser.visning + s.faser.utgang + 600);
    const slut = await page.evaluate(() => window.VyraTestspel.status());
    assert.equal(slut.aktiv, false);
    assert.equal(slut.senaste.orsak, 'klar');
    assert.deepEqual(slut.senaste.forlopp, ['entre', 'visning', 'utgang']);
    assert.equal(await page.$('.canvas [data-testspel-klon]'), null);
    assert.deepEqual(await resterIDuken(page, /\bfollow-active\b/), []);
    lika(fore, await bild(page), 'efter ett färdigt test');
    assert.deepEqual(fel, []);
  } finally {
    await page.close();
  }
});


// ---- Battle MVP (adaptern 'mvp', PR 7) ----------------------------------------------------------
//
// Den gamla testknappen (två knappar med samma id #testBattleMvp: ▶ Testa Battle MVP och Testa
// firandet) anropade triggerBattleMvp via VyraAlertQueue (prioritet 10): den skrev namn, poäng och
// profilbild på ALLA MVP-widgetar, sparade, och tände dem alla. Testet spelar nu mvpSpelaPa (media.js)
// på klonen: B av samma modell ska vara tecken för tecken densamma — också dess mvpName i state —
// kön och sparandet orörda, och efter ■ ska ingenting av firandet ligga kvar: ingen mvp-active, inga
// partiklar i gång och inga partikeldukar i klonen.
const MVP_MODELLER = [
  { namn: 'klassisk inferno', nyckel: 'catalog:battlemvp:inferno', namnSel: '.mvp-copy h2' },
  { namn: 'ram royal-ribbon', nyckel: 'catalog:battlemvp:frame:royal-ribbon', namnSel: '.mvpf-row strong' },
  { namn: 'firande coronation', nyckel: 'catalog:battlemvp:celebration:coronation', namnSel: '.mvc-copy h2', partiklar: true },
  { namn: 'firande lion-clash', nyckel: 'catalog:battlemvp:celebration:lion-clash', namnSel: '.lion-name' },
];
const mvpKlon = (page, namnSel) => page.evaluate(sel => {
  const k = document.querySelector('.canvas [data-testspel-klon]');
  if (!k) return null;
  return { id: k.dataset.id, klass: k.className, namn: ((k.querySelector(sel) || {}).textContent || '').trim(),
    dukar: k.querySelectorAll('canvas.mvc-fx').length, partiklar: window.VyraMvpParticles ? window.VyraMvpParticles.active() : null };
}, namnSel);
const mvpNamn = page => page.evaluate(() => state.widgets.filter(w => w.type === 'templateBattleMvp').map(w => w.id + ':' + w.mvpName + ':' + w.mvpScore));

for (const m of MVP_MODELLER) {
  test(`mvp-adaptern är isolerad: Battle MVP · ${m.namn}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppnaStudio(fel);
    try {
      await layout(page, m.nyckel);
      // B har ett eget namn i state: det är det fält den gamla knappen skrev över.
      // Den sparningen går till molnsynken med fördröjning; den ska vara klar innan räknaren slås på.
      await page.evaluate(() => { const b = liveWidget('prov-b'); b.mvpName = 'AndraWidget'; save(); render(); });
      await page.waitForTimeout(3500);
      await installeraRaknare(page);
      assert.equal(await page.$('#pr-testspel-typ'), null, 'familjen har ingen typväljare');
      assert.equal(await page.$('#testBattleMvp'), null, 'de gamla testknapparna är borta');
      assert.deepEqual(await resterIDuken(page, /\bmvp-active\b/), [], 'kontrollmätning: inget är tänt före ▶');
      const namnFore = await mvpNamn(page);
      const fore = await bild(page);

      // ▶
      await page.evaluate(() => { window.__provRaknare.pa = true; });
      await page.click('#pr-testspel');
      const s1 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s1.aktiv, true, 'testet startade');
      assert.equal(s1.adapter, 'mvp');
      assert.equal(await page.textContent('#pr-testspel'), '■ Stoppa test');
      const faser1 = s1.faser;
      assert.deepEqual(faser1, { entre: 1600, visning: 7600, utgang: 800 }, 'visningstiden 10 s: entré 16 %, utgång 8 %');
      await page.waitForTimeout(1800);
      const k = await mvpKlon(page, m.namnSel);
      assert.ok(k, 'klonen finns i duken');
      assert.equal(k.id, 'prov-a__prov');
      assert.match(k.klass, /\bmvp-active\b/, 'mvpSpelaPa tände klonen');
      assert.equal(k.namn, 'TestAlpha', 'widgetens exempelnamn står på klonen');
      if (m.partiklar) {
        assert.ok(k.dukar >= 2, 'firandets partikeldukar finns i klonen');
        assert.ok(k.partiklar >= 1, 'partiklarna är i gång');
      }
      const dold = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="prov-a"]:not([data-testspel-klon])')).visibility);
      assert.equal(dold, 'hidden', 'den riktiga noden är dold medan klonen spelar');
      lika(fore, await bild(page), 'mitt i testet');
      assert.deepEqual(await resterIDuken(page, /\bmvp-active\b/), [], 'B av samma modell och den riktiga noden tändes inte');
      assert.deepEqual(await mvpNamn(page), namnFore, 'ingen MVP-widget fick testets namn eller poäng');

      // ■
      await page.click('#pr-testspel');
      await page.waitForTimeout(300);
      const s2 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s2.aktiv, false, 'testet stoppades');
      assert.equal(s2.senaste.orsak, 'knapp');
      assert.deepEqual(s2.senaste.brott, [], 'inga brott i motorns vakter');
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta');
      assert.deepEqual(await resterIDuken(page, /\bmvp-active\b/), [], 'ingenting av testet ligger kvar i duken');
      if (m.partiklar) assert.equal(await page.evaluate(() => window.VyraMvpParticles.active()), 0, 'inga partiklar i gång efter ■');
      await page.waitForTimeout(600);
      lika(fore, await bild(page), 'efter ■');
      assert.deepEqual(await mvpNamn(page), namnFore, 'grannens mvpName är orörd efter ■');
      const anrop = await page.evaluate(() => { window.__provRaknare.pa = false; return window.__provRaknare.anrop.slice(); });
      assert.deepEqual(anrop, [], 'inget nät, ingen lagring och ingen kö under ▶ och ■');
      assert.deepEqual(await page.evaluate(() => window.VyraTestspel.brott()), [], 'motorn registrerade inga brott');

      // ▶ igen: samma faser.
      await page.click('#pr-testspel');
      const s3 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s3.aktiv, true, 'testet kan spelas om');
      assert.deepEqual(s3.faser, faser1, 'omspelningen har samma faser');

      // render() mitt i testet tar bort klonen.
      await page.evaluate(() => render());
      await page.waitForTimeout(150);
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'render() tog bort klonen');
      assert.equal((await page.evaluate(() => window.VyraTestspel.status())).senaste.orsak, 'render');
      assert.equal(await page.evaluate(() => JSON.stringify(state)), fore.state, 'state oförändrad efter render-stoppet');
      assert.deepEqual(await resterIDuken(page, /\bmvp-active\b/), [], 'ingenting av testet ligger kvar efter render-stoppet');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('mvp: ett test som får gå klart passerar entré → visning → utgång och lämnar inget kvar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppnaStudio(fel);
  try {
    // Kortaste visningstiden (2 s), så att hela förloppet ryms i provet.
    await layout(page, 'catalog:battlemvp:celebration:portal');
    await page.evaluate(() => { const w = liveWidget('prov-a'); w.mvpDuration = 2; save(); render(); });
    await page.waitForTimeout(800);
    const fore = await bild(page);
    await page.click('#pr-testspel');
    const s = await page.evaluate(() => window.VyraTestspel.status());
    assert.deepEqual(s.faser, { entre: 320, visning: 1520, utgang: 160 });
    await page.waitForTimeout(s.faser.entre + s.faser.visning + s.faser.utgang + 600);
    const slut = await page.evaluate(() => window.VyraTestspel.status());
    assert.equal(slut.aktiv, false);
    assert.equal(slut.senaste.orsak, 'klar');
    assert.deepEqual(slut.senaste.forlopp, ['entre', 'visning', 'utgang']);
    assert.equal(await page.$('.canvas [data-testspel-klon]'), null);
    assert.deepEqual(await resterIDuken(page, /\bmvp-active\b/), []);
    assert.equal(await page.evaluate(() => window.VyraMvpParticles.active()), 0, 'inga partiklar i gång efter slutet');
    lika(fore, await bild(page), 'efter ett färdigt test');
    assert.deepEqual(fel, []);
  } finally {
    await page.close();
  }
});

// ---- Ranking: Top Like, Top Coins och Top Points (adaptern 'ranking', PR 8) ------------------------
//
// Testet spelar klonen med en egen lista (k.__provlista, ranking-sixpack.js): fem exempelpersoner i
// widgetens enhet, där widgetens exempelperson (Namn och värde i sektion 1) klättrar från plats 3 till
// plats 1 i två omsorteringar. Ingenting av det får nå den riktiga topplistan: B av samma modell och
// grannarna är tecken för tecken desamma, topplistornas totaler (live-leaderboard.js) och poängen
// (VyraPoints) är oförändrade, och inget sparas, köas eller går till nätet.
const RANKING_MODELLER = [
  { namn: 'Top Like · voltage', nyckel: 'catalog:toplike:voltage', exempel: { dataName: 'Provnamn', dataValue: '5000' }, varde: '5.0K' },
  { namn: 'Top Coins · prism-horizontal', nyckel: 'catalog:ranking:templateTopCoins:prism-horizontal', exempel: { dataName: 'Provnamn', dataValue: 5000 }, varde: '5.0K' },
  // Utan egen exempelperson: panelens reserv (MAYA, 1 500 poäng) är den som klättrar.
  { namn: 'Top Points · celestial', nyckel: 'catalog:ranking:templateTopPoints:celestial', exempel: {}, varde: '1.5K', namnVantat: 'MAYA' },
];
const rankingKlon = page => page.evaluate(() => {
  const k = document.querySelector('.canvas [data-testspel-klon]');
  if (!k) return null;
  const rader = [...k.querySelectorAll('.toplike-row')];
  return { id: k.dataset.id, namn: rader.map(r => (r.querySelector('strong') || {}).textContent || ''),
    varden: rader.map(r => ((r.querySelector('em') || {}).textContent || '').trim()), prov: rader.filter(r => r.dataset.prov).length };
});

for (const m of RANKING_MODELLER) {
  test(`ranking-adaptern är isolerad: ${m.namn}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppnaStudio(fel);
    try {
      await layout(page, m.nyckel);
      // A har widgetens egen exempelperson; B ett annat namn, så att ett läckage till B syns.
      await page.evaluate(ex => {
        Object.assign(liveWidget('prov-a'), ex);
        liveWidget('prov-b').dataName = 'AndraWidget';
        save(); render();
      }, m.exempel);
      await page.waitForTimeout(3500);
      await installeraRaknare(page);
      assert.equal(await page.$('#pr-testspel-typ'), null, 'familjen har ingen typväljare');
      const fore = await bild(page);
      const vantatNamn = m.namnVantat || m.exempel.dataName;

      // ▶
      await page.evaluate(() => { window.__provRaknare.pa = true; });
      await page.click('#pr-testspel');
      const s1 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s1.aktiv, true, 'testet startade');
      assert.equal(s1.adapter, 'ranking');
      assert.equal(await page.textContent('#pr-testspel'), '■ Stoppa test');
      const faser1 = s1.faser;
      assert.deepEqual(faser1, { entre: 0, visning: 4400, utgang: 500 }, 'utan inträdeseffekt: visning med två omsorteringar, uttoning');
      await page.waitForTimeout(300);
      const k0 = await rankingKlon(page);
      assert.ok(k0, 'klonen finns i duken');
      assert.equal(k0.id, 'prov-a__prov');
      assert.equal(k0.prov, 5, 'klonen visar testets lista, inte demolistan');
      assert.deepEqual(k0.namn, ['Alex', 'Mia', vantatNamn, 'Sara', 'Zoe'], 'exempelpersonen börjar på plats 3');
      const dold = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="prov-a"]:not([data-testspel-klon])')).visibility);
      assert.equal(dold, 'hidden', 'den riktiga noden är dold medan klonen spelar');
      lika(fore, await bild(page), 'mitt i testet');

      // Första omsorteringen (1,2 s): förbi tvåan. Andra (2,8 s): förbi ettan, med sitt eget värde.
      await page.waitForTimeout(1400);
      assert.deepEqual((await rankingKlon(page)).namn, ['Alex', vantatNamn, 'Mia', 'Sara', 'Zoe'], 'första omsorteringen');
      await page.waitForTimeout(1600);
      const k2 = await rankingKlon(page);
      assert.deepEqual(k2.namn, [vantatNamn, 'Alex', 'Mia', 'Sara', 'Zoe'], '#3 tog #1');
      assert.match(k2.varden[0], new RegExp(m.varde.replace('.', '\\.') + '$'), 'exempelvärdet står på ettan');
      lika(fore, await bild(page), 'efter omsorteringarna');

      // ■
      await page.click('#pr-testspel');
      await page.waitForTimeout(150);
      const s2 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s2.aktiv, false, 'testet stoppades');
      assert.equal(s2.senaste.orsak, 'knapp');
      assert.deepEqual(s2.senaste.brott, [], 'inga brott i motorns vakter');
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta');
      await page.waitForTimeout(600);
      lika(fore, await bild(page), 'efter ■');
      const anrop = await page.evaluate(() => { window.__provRaknare.pa = false; return window.__provRaknare.anrop.slice(); });
      assert.deepEqual(anrop, [], 'inget nät, ingen lagring och ingen kö under ▶ och ■');
      assert.deepEqual(await page.evaluate(() => window.VyraTestspel.brott()), [], 'motorn registrerade inga brott');
      assert.equal(await page.evaluate(() => state.widgets.some(w => '__provlista' in w)), false, 'ingen widget i state fick testets lista');

      // ▶ igen: samma faser och samma början.
      await page.click('#pr-testspel');
      const s3 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s3.aktiv, true, 'testet kan spelas om');
      assert.deepEqual(s3.faser, faser1, 'omspelningen har samma faser');
      await page.waitForTimeout(200);
      assert.deepEqual((await rankingKlon(page)).namn, k0.namn, 'omspelningen börjar likadant');

      // render() mitt i testet tar bort klonen.
      await page.evaluate(() => render());
      await page.waitForTimeout(150);
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'render() tog bort klonen');
      assert.equal((await page.evaluate(() => window.VyraTestspel.status())).senaste.orsak, 'render');
      assert.equal(await page.evaluate(() => JSON.stringify(state)), fore.state, 'state oförändrad efter render-stoppet');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('ranking: ett test som får gå klart passerar entré → visning → utgång och lämnar inget kvar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppnaStudio(fel);
  try {
    await layout(page, 'catalog:ranking:templateTopPoints:voltage');
    // Widgetens egen inträdeseffekt och varaktighet är testets entré.
    await page.evaluate(() => { const w = liveWidget('prov-a'); w.entranceAnimation = 'fade'; w.entranceDuration = 400; save(); render(); });
    await page.waitForTimeout(800);
    const fore = await bild(page);
    await page.click('#pr-testspel');
    const s = await page.evaluate(() => window.VyraTestspel.status());
    assert.deepEqual(s.faser, { entre: 400, visning: 4400, utgang: 500 }, 'entrén följer widgetens Varaktighet');
    const klass = await page.evaluate(() => { const k = document.querySelector('.canvas [data-testspel-klon]'); return [k.className, k.style.getPropertyValue('--ws-anim-duration')]; });
    assert.match(klass[0], /ws-anim-fade/, 'klonen bär widgetens inträdeseffekt');
    assert.equal(klass[1].trim(), '400ms', 'och dess varaktighet');
    await page.waitForTimeout(s.faser.entre + s.faser.visning + s.faser.utgang + 600);
    const slut = await page.evaluate(() => window.VyraTestspel.status());
    assert.equal(slut.aktiv, false);
    assert.equal(slut.senaste.orsak, 'klar');
    assert.deepEqual(slut.senaste.forlopp, ['entre', 'visning', 'utgang']);
    assert.equal(await page.$('.canvas [data-testspel-klon]'), null);
    lika(fore, await bild(page), 'efter ett färdigt test');
    assert.deepEqual(fel, []);
  } finally {
    await page.close();
  }
});

// ---- Målen: Social Goal, Heart Me och Gift Campaign (adaptrarna 'socialgoal', 'heartgoal' och 'kampanj', PR 9)
//
// Social Goal och Heart Me spelar 0 → 1 → 60 % → 100 % med VyraGoalDom.patch mot KLONENS id — samma
// riktade DOM-väg som en riktig målram, men aldrig målruntimen: inget VyraGoals-anrop (räknaren ovan
// lindar varje metod på VyraGoals), inget sparat, inget nät. Kampanjen nollar klonens räknare och tar
// emot fyra gåvor genom motorn (gift-campaign-aura-engine.js receive), där den sista når sitt mål; den
// riktiga livebryggan (gift-event-images.js, VyraCampaignAuraSession) och de riktiga räknarna rörs inte.
//
// KAMPANJENS NODER RÖR SIG HELA TIDEN (motorn skriver transform och opacitet varje bildruta), så deras
// outerHTML jämförs utan style-attributen inuti widgeten. Räknarna jämförs för sig: motorns värden för
// A och B (inspect) och w.giftCurrent* i state.
const MAL_ISOLERING = [
  { namn: 'Social Goal · crown-rail', nyckel: 'catalog:socialgoal:followers:crown-rail:landscape', adapter: 'socialgoal',
    faser: { entre: 0, visning: 5000, utgang: 500 }, mitt: '600', slut: '1 000' },
  { namn: 'Heart Me Goal · classic', nyckel: 'catalog:heartgoal:classic', adapter: 'heartgoal',
    faser: { entre: 0, visning: 5000, utgang: 500 }, mitt: '30', slut: '50' },
  { namn: 'Gift Campaign · gold landscape', nyckel: 'catalog:giftcampaign:gold:landscape', adapter: 'kampanj',
    faser: { entre: 1200, visning: 5600, utgang: 500 }, kampanj: true },
];
const utanStil = html => html == null ? html : html.replace(/^(<[^>]*>)([\s\S]*)$/, (_, rot, rest) => rot + rest.replace(/ style="[^"]*"/g, ''));
const malBild = (page, kampanj) => bild(page).then(async b => {
  if (!kampanj) return b;
  const varden = await page.evaluate(() => ['prov-a', 'prov-b'].map(id => {
    const nod = document.querySelector(`.canvas [data-id="${id}"]:not([data-testspel-klon])`);
    const i = nod && window.VyraCampaignAuraEngine.inspect(nod);
    return i ? i.values.join(',') : null;
  }));
  return Object.assign({}, b, { a: utanStil(b.a), b: utanStil(b.b), motorA: varden[0], motorB: varden[1] });
});
const malKlon = page => page.evaluate(() => {
  const k = document.querySelector('.canvas [data-testspel-klon]');
  if (!k) return null;
  const i = window.VyraCampaignAuraEngine && window.VyraCampaignAuraEngine.inspect(k);
  return { id: k.dataset.id, klass: k.className, varde: (k.querySelector('[data-goal-value]') || {}).textContent || null,
    procent: (k.querySelector('[data-goal-pct]') || {}).textContent || null, motor: i ? i.values : null,
    klart: [...k.querySelectorAll('.goal-mark')].map(n => n.textContent) };
});

for (const m of MAL_ISOLERING) {
  test(`${m.adapter}-adaptern är isolerad: ${m.namn}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppnaStudio(fel);
    try {
      await layout(page, m.nyckel);
      await installeraRaknare(page);
      assert.equal(await page.$('#pr-testspel-typ'), null, 'familjen har ingen typväljare');
      const fore = await malBild(page, m.kampanj);
      if (m.kampanj) assert.ok(fore.motorA && fore.motorB, 'motorn är monterad på A och B');
      const monterade = m.kampanj ? await page.evaluate(() => window.VyraCampaignAuraEngine.active()) : 0;

      // ▶
      await page.evaluate(() => { window.__provRaknare.pa = true; });
      await page.click('#pr-testspel');
      const s1 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s1.aktiv, true, 'testet startade');
      assert.equal(s1.adapter, m.adapter);
      assert.equal(await page.textContent('#pr-testspel'), '■ Stoppa test');
      assert.deepEqual(s1.faser, m.faser, 'faserna');
      const dold = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="prov-a"]:not([data-testspel-klon])')).visibility);
      assert.equal(dold, 'hidden', 'den riktiga noden är dold medan klonen spelar');

      if (!m.kampanj) {
        // 0 direkt, 1 efter 0,7 s, 60 % efter 1,9 s och målet efter 3,3 s.
        await page.waitForTimeout(200);
        const k0 = await malKlon(page);
        assert.ok(k0, 'klonen finns i duken');
        assert.equal(k0.id, 'prov-a__prov');
        assert.equal(k0.varde, '0', 'klonen börjar på noll');
        await page.waitForTimeout(2000);
        assert.equal((await malKlon(page)).varde, m.mitt, '60 % av målet');
        lika(fore, await malBild(page), 'mitt i testet');
        await page.waitForTimeout(1500);
        const k2 = await malKlon(page);
        assert.equal(k2.varde.replace(/\s/g, ' '), m.slut, 'målet är nått på klonen (sv-SE skriver tusental med hårt mellanslag)');
        assert.match(k2.procent, /^100%/);
        assert.match(k2.klass, /\bgoal-uppnatt\b/, 'klonen är märkt som uppnådd');
      } else {
        // Fyra gåvor, sju bidrag: Rose 3+5, Galaxy 2+3, Lion 1 och sedan resten till målet (50), Universe 1.
        await page.waitForTimeout(m.faser.entre + 7 * 600 + 300);
        const k = await malKlon(page);
        assert.ok(k, 'klonen finns i duken');
        assert.equal(k.id, 'prov-a__prov');
        assert.deepEqual(k.motor, [8, 5, 50, 1], 'klonens räknare började på noll och tog emot testets gåvor');
        assert.equal(k.klart[2], 'MÅL KLART', 'den sista gåvan når sitt mål');
      }
      lika(fore, await malBild(page, m.kampanj), 'efter förloppet');

      // ■
      await page.click('#pr-testspel');
      await page.waitForTimeout(200);
      const s2 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s2.aktiv, false, 'testet stoppades');
      assert.equal(s2.senaste.orsak, 'knapp');
      assert.deepEqual(s2.senaste.brott, [], 'inga brott i motorns vakter');
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta');
      if (m.kampanj) assert.equal(await page.evaluate(() => window.VyraCampaignAuraEngine.active()), monterade, 'klonens motor är riven, de riktiga står kvar');
      await page.waitForTimeout(400);
      lika(fore, await malBild(page, m.kampanj), 'efter ■');
      const anrop = await page.evaluate(() => { window.__provRaknare.pa = false; return window.__provRaknare.anrop.slice(); });
      assert.deepEqual(anrop, [], 'inget VyraGoals-anrop, inget nät, ingen lagring och ingen kö under ▶ och ■');
      assert.deepEqual(await page.evaluate(() => window.VyraTestspel.brott()), [], 'motorn registrerade inga brott');

      // ▶ igen: samma faser.
      await page.click('#pr-testspel');
      const s3 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s3.aktiv, true, 'testet kan spelas om');
      assert.deepEqual(s3.faser, s1.faser, 'omspelningen har samma faser');

      // render() mitt i testet tar bort klonen.
      await page.evaluate(() => render());
      await page.waitForTimeout(150);
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'render() tog bort klonen');
      assert.equal((await page.evaluate(() => window.VyraTestspel.status())).senaste.orsak, 'render');
      assert.equal(await page.evaluate(() => JSON.stringify(state)), fore.state, 'state oförändrad efter render-stoppet');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('målen: ett test som får gå klart passerar entré → visning → utgång och lämnar inget kvar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppnaStudio(fel);
  try {
    await layout(page, 'catalog:heartgoal:golden');
    // Widgetens egen inträdeseffekt är testets entré, och firandet syns när målet är nått.
    await page.evaluate(() => { const w = liveWidget('prov-a'); w.entranceAnimation = 'fade'; w.entranceDuration = 400; w.heartFirande = true; save(); render(); });
    await page.waitForTimeout(800);
    const fore = await bild(page);
    await page.click('#pr-testspel');
    const s = await page.evaluate(() => window.VyraTestspel.status());
    assert.deepEqual(s.faser, { entre: 400, visning: 5000, utgang: 500 }, 'entrén följer widgetens Varaktighet');
    assert.match(await page.evaluate(() => document.querySelector('.canvas [data-testspel-klon]').className), /ws-anim-fade/, 'klonen bär widgetens inträdeseffekt');
    await page.waitForTimeout(400 + 3300 + 300);
    const firande = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-testspel-klon] .heart-fill-wrap')).animationName);
    assert.equal(firande, 'heartGoalFirande', 'firandet spelar på klonen när målet är nått');
    await page.waitForTimeout(s.faser.visning - 3300 + s.faser.utgang + 600);
    const slut = await page.evaluate(() => window.VyraTestspel.status());
    assert.equal(slut.aktiv, false);
    assert.equal(slut.senaste.orsak, 'klar');
    assert.deepEqual(slut.senaste.forlopp, ['entre', 'visning', 'utgang']);
    assert.equal(await page.$('.canvas [data-testspel-klon]'), null);
    lika(fore, await bild(page), 'efter ett färdigt test');
    assert.deepEqual(fel, []);
  } finally {
    await page.close();
  }
});

// ---- Top Streak: Clean Flip och Design 1–3 (adaptern 'topstreak', PR 10) -------------------------
//
// Testet räknar en combo 1 → 12 på KLONEN med streakSpelaPa (approved-rankings.js) — samma skrivning som
// livevägen gör på en riktig combo (gift-event-images.js skrivProfilNod) och samma markering ('hit' och
// rekordpulsen 'record') — medan widgeten flippar mellan gåva och profil i sin egen takt. Livevägen
// skriver på ALLA Top Streak i state och höjer sändningens rekord (VyraGiftRecords.streakCoins); testet
// får göra ingetdera. B av samma modell har ett eget namn, så att ett läckage dit syns, och sändningens
// rekord, topplistorna och sessionStorage ingår i bilden (bild ovan).
const STREAK_ISOLERING = [
  // Clean Flip vänder var 8:e sekund: visningen räcker till att profilsidan hinner synas (halva varvet + 1,2 s).
  { namn: 'Top Streak · Clean Flip', nyckel: 'catalog:topstreak', faser: { entre: 0, visning: 5200, utgang: 500 }, flipp: ['.streak-flip', '8s'] },
  // Design 1 vänder var 7:e sekund.
  { namn: 'Top Streak · Design 1', nyckel: 'catalog:topstreak:design:1', faser: { entre: 0, visning: 4700, utgang: 500 }, flipp: ['.tsd1-flip', '7s'] },
  // Design 3 vänder inte: visningen är bara comboräkningen (0,6 s + 11 × 0,25 s + 1,2 s).
  { namn: 'Top Streak · Design 3', nyckel: 'catalog:topstreak:design:3', faser: { entre: 0, visning: 4550, utgang: 500 } },
];
const streakKlon = page => page.evaluate(() => {
  const k = document.querySelector('.canvas [data-testspel-klon]');
  if (!k) return null;
  return { id: k.dataset.id, klass: k.className,
    namn: (k.querySelector('.approved-streak-copy strong') || {}).textContent || null,
    varde: (k.querySelector('.approved-streak-copy em b') || {}).textContent || null,
    em: ((k.querySelector('.approved-streak-copy em') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    gava: (k.querySelector('.streak-gift-face img') || {}).getAttribute?.('src') || null,
    profil: (k.querySelector('.streak-profile-face img') || {}).getAttribute?.('src') || null };
});

for (const m of STREAK_ISOLERING) {
  test(`topstreak-adaptern är isolerad: ${m.namn}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppnaStudio(fel);
    try {
      await layout(page, m.nyckel);
      // B har ett eget namn och en egen streak, så att ett läckage från testet till B syns.
      await page.evaluate(() => { const b = liveWidget('prov-b'); b.dataName = 'AndraWidget'; b.dataValue = 7; save(); render(); });
      // Sparningens efterföljare (POST /api/state) ska ha gått innan räknarna slås på — som i rankingprovet.
      await page.waitForTimeout(3500);
      await installeraRaknare(page);
      assert.equal(await page.$('#pr-testspel-typ'), null, 'familjen har ingen typväljare');
      const fore = await bild(page);
      const rekordFore = await page.evaluate(() => JSON.stringify(window.VyraGiftRecords));

      // ▶
      await page.evaluate(() => { window.__provRaknare.pa = true; });
      await page.click('#pr-testspel');
      const s1 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s1.aktiv, true, 'testet startade');
      assert.equal(s1.adapter, 'topstreak');
      assert.equal(await page.textContent('#pr-testspel'), '■ Stoppa test');
      assert.deepEqual(s1.faser, m.faser, 'faserna');
      const dold = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="prov-a"]:not([data-testspel-klon])')).visibility);
      assert.equal(dold, 'hidden', 'den riktiga noden är dold medan klonen spelar');
      if (m.flipp) {
        const flipp = await page.evaluate(([sel]) => { const n = document.querySelector('.canvas [data-testspel-klon] ' + sel); return n ? getComputedStyle(n).animationDuration : null; }, m.flipp);
        assert.equal(flipp, m.flipp[1], 'klonen flippar i widgetens takt (Flippar var)');
      }

      // Första gåvan efter 0,6 s: streak 1, exempelgivaren, Cap och exempelprofilen.
      await page.waitForTimeout(600 + 120);
      const k1 = await streakKlon(page);
      assert.ok(k1, 'klonen finns i duken');
      assert.equal(k1.id, 'prov-a__prov');
      assert.equal(k1.namn, 'Alex', 'exempelgivaren står på klonen');
      assert.equal(k1.varde, '1', 'combon börjar på 1');
      assert.match(k1.em, /×\s?1 STREAK$/, 'prefixet och STREAK står kvar runt talet');
      assert.match(k1.gava || '', /7460_Cap\.png$/, 'exempelgåvan');
      assert.match(k1.profil || '', /test-profile\.svg$/, 'exempelprofilen');
      assert.match(k1.klass, /\bhit\b/, 'klonen är armad som vid en riktig combo');
      assert.match(k1.klass, /\brecord\b/, 'rekordpulsen startade på klonen');
      lika(fore, await bild(page), 'efter första gåvan');

      // Combon räknas upp till 12 (11 steg à 0,25 s).
      await page.waitForTimeout(11 * 250 + 200);
      assert.equal((await streakKlon(page)).varde, '12', 'combon räknades upp till 12 på klonen');
      lika(fore, await bild(page), 'efter combon');
      assert.equal(await page.evaluate(() => JSON.stringify(window.VyraGiftRecords)), rekordFore, 'sändningens rekord är orört');
      assert.deepEqual(await page.evaluate(() => state.widgets.filter(w => w.type === 'templateTopStreak').map(w => w.id + ':' + w.dataName + ':' + w.dataValue)),
        ['prov-a:' + JSON.parse(fore.state).widgets[0].dataName + ':' + JSON.parse(fore.state).widgets[0].dataValue, 'prov-b:AndraWidget:7'], 'ingen Top Streak i state fick testets combo');

      // ■
      await page.click('#pr-testspel');
      await page.waitForTimeout(200);
      const s2 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s2.aktiv, false, 'testet stoppades');
      assert.equal(s2.senaste.orsak, 'knapp');
      assert.deepEqual(s2.senaste.brott, [], 'inga brott i motorns vakter');
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta');
      assert.equal(await page.textContent('#pr-testspel'), '▶ Testa widget');
      await page.waitForTimeout(400);
      lika(fore, await bild(page), 'efter ■');
      const anrop = await page.evaluate(() => { window.__provRaknare.pa = false; return window.__provRaknare.anrop.slice(); });
      assert.deepEqual(anrop, [], 'inget nät, ingen lagring och ingen kö under ▶ och ■');
      assert.deepEqual(await page.evaluate(() => window.VyraTestspel.brott()), [], 'motorn registrerade inga brott');

      // ▶ igen: samma faser och samma början.
      await page.click('#pr-testspel');
      const s3 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s3.aktiv, true, 'testet kan spelas om');
      assert.deepEqual(s3.faser, s1.faser, 'omspelningen har samma faser');
      await page.waitForTimeout(600 + 120);
      assert.equal((await streakKlon(page)).varde, '1', 'omspelningen börjar på 1 igen');

      // render() mitt i testet tar bort klonen.
      await page.evaluate(() => render());
      await page.waitForTimeout(150);
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'render() tog bort klonen');
      assert.equal((await page.evaluate(() => window.VyraTestspel.status())).senaste.orsak, 'render');
      assert.equal(await page.evaluate(() => JSON.stringify(state)), fore.state, 'state oförändrad efter render-stoppet');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('topstreak: ett test som får gå klart passerar entré → visning → utgång och lämnar inget kvar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppnaStudio(fel);
  try {
    await layout(page, 'catalog:topstreak');
    // Widgetens egen inträdeseffekt och varaktighet är testets entré (Clean Flip; Design 1–3 har ingen).
    await page.evaluate(() => { const w = liveWidget('prov-a'); w.entranceAnimation = 'fade'; w.entranceDuration = 400; save(); render(); });
    await page.waitForTimeout(800);
    const fore = await bild(page);
    await page.click('#pr-testspel');
    const s = await page.evaluate(() => window.VyraTestspel.status());
    // Visningen räcker till profilsidan: halva varvet (4 s) + 1,2 s, räknat från monteringen.
    assert.deepEqual(s.faser, { entre: 400, visning: 4800, utgang: 500 }, 'entrén följer widgetens Varaktighet');
    const klass = await page.evaluate(() => { const k = document.querySelector('.canvas [data-testspel-klon]'); return [k.className, k.style.getPropertyValue('--ws-anim-duration'), k.style.animationDelay]; });
    assert.match(klass[0], /ws-anim-fade/, 'klonen bär widgetens inträdeseffekt');
    assert.equal(klass[1].trim(), '400ms', 'och dess varaktighet');
    assert.equal(klass[2], '', 'den riktiga nodens fördröjning följer inte med, så entrén spelar från början');
    await page.waitForTimeout(s.faser.entre + s.faser.visning + s.faser.utgang + 600);
    const slut = await page.evaluate(() => window.VyraTestspel.status());
    assert.equal(slut.aktiv, false);
    assert.equal(slut.senaste.orsak, 'klar');
    assert.deepEqual(slut.senaste.forlopp, ['entre', 'visning', 'utgang']);
    assert.equal(await page.$('.canvas [data-testspel-klon]'), null);
    lika(fore, await bild(page), 'efter ett färdigt test');
    assert.deepEqual(fel, []);
  } finally {
    await page.close();
  }
});

test('topstreak: ingenting når overlayn', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const editor = await oppnaStudio(fel);
  const overlay = await context.newPage();
  try {
    await layout(editor, 'catalog:topstreak:design:2');
    await overlay.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
    await overlay.waitForTimeout(3000);
    const lage = await overlay.evaluate(() => ({
      knapp: !!document.querySelector('#pr-testspel'),
      spela: window.VyraTestspel ? window.VyraTestspel.spela(state.widgets[0]) : null,
      klon: !!document.querySelector('[data-testspel-klon]'),
    }));
    assert.deepEqual(lage, { knapp: false, spela: false, klon: false }, 'overlayn har ingen knapp och spelar ingenting');
    const ovFore = await overlay.evaluate(() => [...document.querySelectorAll('.vyra-streak')].map(n => n.outerHTML.replace(/ style="[^"]*"/g, '')).join('|'));
    await editor.click('#pr-testspel');
    await editor.waitForTimeout(2500);
    const ovUnder = await overlay.evaluate(() => ({
      html: [...document.querySelectorAll('.vyra-streak')].map(n => n.outerHTML.replace(/ style="[^"]*"/g, '')).join('|'),
      klon: !!document.querySelector('[data-testspel-klon]'),
    }));
    assert.equal(ovUnder.klon, false, 'ingen klon i overlayn');
    assert.equal(ovUnder.html, ovFore, 'overlayns Top Streak är oförändrad medan editorn testar');
    await editor.click('#pr-testspel');
    assert.deepEqual(fel, []);
  } finally {
    await overlay.close();
    await editor.close();
  }
});

// ---- Playground: Top Gifter Podium, Top Streak Flip och Goal Pro (adaptern 'pg', PR 11) -----------
//
// Testet spelar en klon i VyraPlayground.sandlada (playground-widgets.js): en egen session och egen
// runtime-state, utan REG, conv() och sparning. Den gamla testraden matade sändningens session S och
// tog en annan Goal Pro i layouten från 0 % till 40 % (granskningen) — prov-mal i layouten ÄR en sådan
// granne och ska stå kvar på 0 % under och efter testet. Utöver bilden ovan kräver provet att
// sändningens S och STATE är identiska (djupjämförelse av en JSON-kopia) och att B och grannen har
// exakt samma DOM.
const PG_ISOLERING = [
  { namn: 'Top Gifter Podium · Royal Phoenix', nyckel: 'catalog:pgpodium:royal-phoenix', faser: { entre: 800, visning: 4300, utgang: 600 } },
  // Ett helt flippvarv (2 × 3,5 s) räknat från monteringen.
  { namn: 'Top Streak Flip · Royal Amethyst', nyckel: 'catalog:pgstreak:royal-wings', faser: { entre: 800, visning: 6600, utgang: 600 } },
  { namn: 'Goal Pro · Rak bar', nyckel: 'catalog:pggoal:1', faser: { entre: 800, visning: 4200, utgang: 600 } },
];
const pgBild = page => bild(page).then(async b => Object.assign({}, b, await page.evaluate(() => ({
  pgSession: JSON.stringify(window.VyraPlaygroundWidgets.session()),
  pgState: JSON.stringify(window.VyraPlaygroundWidgets.state),
  pgMonterade: window.VyraPlaygroundWidgets.mounted(),
  malProcent: [...document.querySelectorAll('.canvas [data-id="prov-mal"] .pc')].map(n => n.textContent).filter(Boolean)[0] || null,
}))));
const pgKlon = page => page.evaluate(() => {
  const k = document.querySelector('.canvas [data-testspel-klon]');
  if (!k) return null;
  const host = k.querySelector('.pgw');
  const synlig = [...k.querySelectorAll('.gvc')].find(c => c.style.display !== 'none');
  return { id: k.dataset.id, pgm: host && host.dataset.pgm, klass: host && host.className,
    podium: [1, 2, 3].map(r => { const c = k.querySelector('.pcol.r' + r); return c ? c.querySelector('.nm').textContent + ':' + c.querySelector('.cn').textContent.replace(/\s/g, '') : null; }),
    streakNamn: (k.querySelector('.stk-nm') || {}).textContent || null, streak: (k.querySelector('.stk-pill b') || {}).textContent || null,
    baksida: !!k.querySelector('.fl.back'),
    mal: synlig ? (synlig.querySelector('.pc') || {}).textContent : null, malKlart: !!k.querySelector('.gv.done') };
});

for (const m of PG_ISOLERING) {
  test(`pg-adaptern är isolerad: ${m.namn}`, { skip, timeout: 120000 }, async () => {
    const fel = [];
    const page = await oppnaStudio(fel);
    try {
      await layout(page, m.nyckel);
      await page.waitForTimeout(1500);
      await installeraRaknare(page);
      assert.equal(await page.$('#pr-testspel-typ'), null, 'familjen har ingen typväljare');
      assert.equal(await page.$('.properties [data-pgtest]'), null, 'testraden är borta ur panelen');
      const fore = await pgBild(page);
      assert.equal(fore.malProcent, '0%', 'Goal Pro-grannen står på 0 % före testet');
      assert.equal(fore.pgMonterade, 3, 'A, B och Goal Pro-grannen är monterade');

      // ▶
      await page.evaluate(() => { window.__provRaknare.pa = true; });
      await page.click('#pr-testspel');
      const s1 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s1.aktiv, true, 'testet startade');
      assert.equal(s1.adapter, 'pg');
      assert.equal(await page.textContent('#pr-testspel'), '■ Stoppa test');
      assert.deepEqual(s1.faser, m.faser, 'faserna');
      const dold = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="prov-a"]:not([data-testspel-klon])')).visibility);
      assert.equal(dold, 'hidden', 'den riktiga noden är dold medan klonen spelar');
      const k0 = await pgKlon(page);
      assert.equal(k0.id, 'prov-a__prov');
      assert.equal(k0.pgm, '1', 'klonen är sandlådans, scan() monterar den inte');
      assert.match(k0.klass, /\bplay-in\b/, 'entrén spelar på klonen');

      if (m.nyckel.includes('pgpodium')) {
        await page.waitForTimeout(1200 + 200);
        assert.deepEqual((await pgKlon(page)).podium, ['Leo:1', '—:0', '—:0'], 'första givaren (Rose)');
        lika(fore, await pgBild(page), 'efter första gåvan');
        await page.waitForTimeout(2 * 1100);
        assert.deepEqual((await pgKlon(page)).podium, ['Alex:799', 'Mia:99', 'Leo:1'], 'Crown tog förstaplatsen: omsorteringen');
      } else if (m.nyckel.includes('pgstreak')) {
        await page.waitForTimeout(1200 + 11 * 250 + 200);
        const k = await pgKlon(page);
        assert.equal(k.streakNamn, 'Alex', 'exempelgivaren');
        assert.equal(k.streak, '12', 'combon räknades upp till 12 på klonen');
        lika(fore, await pgBild(page), 'efter combon');
        await page.waitForTimeout(3500 - (1200 + 11 * 250 + 200) + 800);
        assert.equal((await pgKlon(page)).baksida, true, 'klonen vände till gåvan efter Flip-tid');
      } else {
        await page.waitForTimeout(1200 + 900);
        assert.equal((await pgKlon(page)).mal, '60%', '60 % av målet på klonen');
        lika(fore, await pgBild(page), 'vid 60 %');
        await page.waitForTimeout(1800);
        const k = await pgKlon(page);
        assert.equal(k.mal, '100%', 'målet är nått på klonen');
        assert.equal(k.malKlart, true, 'MÅL NÅTT spelar på klonen');
      }
      lika(fore, await pgBild(page), 'efter förloppet');

      // ■
      await page.click('#pr-testspel');
      await page.waitForTimeout(200);
      const s2 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s2.aktiv, false, 'testet stoppades');
      assert.equal(s2.senaste.orsak, 'knapp');
      assert.deepEqual(s2.senaste.brott, [], 'inga brott i motorns vakter');
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta');
      await page.waitForTimeout(400);
      const efter = await pgBild(page);
      lika(fore, efter, 'efter ■');
      assert.equal(efter.malProcent, '0%', 'Goal Pro-grannen står kvar på 0 % efter testet');
      const anrop = await page.evaluate(() => { window.__provRaknare.pa = false; return window.__provRaknare.anrop.slice(); });
      assert.deepEqual(anrop, [], 'inget nät, ingen lagring, ingen kö och ingen routeLiveBattleEvent under ▶ och ■');
      assert.deepEqual(await page.evaluate(() => window.VyraTestspel.brott()), [], 'motorn registrerade inga brott');

      // ▶ igen: samma faser.
      await page.click('#pr-testspel');
      const s3 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s3.aktiv, true, 'testet kan spelas om');
      assert.deepEqual(s3.faser, s1.faser, 'omspelningen har samma faser');

      // render() mitt i testet tar bort klonen.
      await page.evaluate(() => render());
      await page.waitForTimeout(150);
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'render() tog bort klonen');
      assert.equal((await page.evaluate(() => window.VyraTestspel.status())).senaste.orsak, 'render');
      assert.equal(await page.evaluate(() => JSON.stringify(state)), fore.state, 'state oförändrad efter render-stoppet');
      assert.equal(await page.evaluate(() => JSON.stringify(window.VyraPlaygroundWidgets.session())), fore.pgSession, 'sändningens session oförändrad');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('pg: ett test som får gå klart passerar entré → visning → utgång och lämnar inget kvar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppnaStudio(fel);
  try {
    await layout(page, 'catalog:pggoal:3');
    // Rörelsehastigheten styr entré och utgång (0,8 s och 0,6 s delat med hastigheten).
    await page.evaluate(() => { const w = liveWidget('prov-a'); w.pg = Object.assign({}, w.pg, { speed: 2 }); save(); render(); });
    await page.waitForTimeout(1500);
    const fore = await pgBild(page);
    await page.click('#pr-testspel');
    const s = await page.evaluate(() => window.VyraTestspel.status());
    assert.deepEqual(s.faser, { entre: 400, visning: 3150, utgang: 300 }, 'faserna följer Rörelsehastighet');
    await page.waitForTimeout(s.faser.entre + s.faser.visning + 100);
    assert.match(await page.evaluate(() => document.querySelector('.canvas [data-testspel-klon] .pgw').className), /\bplay-out\b/, 'widgetens egen utgång spelar på klonen');
    await page.waitForTimeout(s.faser.utgang + 600);
    const slut = await page.evaluate(() => window.VyraTestspel.status());
    assert.equal(slut.aktiv, false);
    assert.equal(slut.senaste.orsak, 'klar');
    assert.deepEqual(slut.senaste.forlopp, ['entre', 'visning', 'utgang']);
    assert.equal(await page.$('.canvas [data-testspel-klon]'), null);
    lika(fore, await pgBild(page), 'efter ett färdigt test');
    assert.deepEqual(fel, []);
  } finally {
    await page.close();
  }
});

// ---- Fyrverkerierna: Gift Fireworks, Heart Fireworks och Gift Bubbles (adaptrarna 'fyrverkeri', 'hjartfyr' och 'bubblor', PR 12)
//
// De gamla testknapparna (▶ Testa fyrverkeriet med Antal testgåvor, ▶ Testa Heart Fireworks och ▶ Testa Gift
// Bubbles) gick genom triggerGiftFireworks/-HeartFireworks/-GiftBubbles, som tänder ALLA synliga widgetar av
// typen — granskningen mätte att B spelade också. Testet spelar nu per-nod-funktionen (fwSpelaPa, hfSpelaPa,
// gbSpelaPa) på klonen. Utöver bilden ovan kräver provet att
//   * B av samma modell inte spelar: inget .fw-event, ingen hf-play/gb-play, och tecken för tecken samma DOM,
//   * kön och bokföringen är orörda: Gift Fireworks-kön (VyraGiftFireworks), renderarens väntelista
//     (VyraFireworks.pending) och timrar (VyraFireworks.timers), och Heart Fireworks- och Gift Bubbles-köerna,
//   * ingenting lever kvar efter ■ och efter render(): ingen fyrverkeriduk (VyraSupernova.active), ingen
//     prenumeration på VFX-tickern, och Heart Fireworks och Gift Bubbles motor är död (inget rAF-varv, inga
//     timrar, inga gnistor).
// Faserna kommer ur motorns tidslinje: Gift Fireworks 7 s (1 gåva) och 20 s (final) med raketens färd som
// entré och sista sekunden som utgång; Heart Fireworks combo 20 till toppen och gnistornas uttoning; Gift
// Bubbles combo 10 till sista bubblans pop och skärvornas 1,3 s.
const FYR_ISOLERING = [
  { namn: 'Gift Fireworks · Festival (1 gåva)', nyckel: 'catalog:giftfireworks:festival', adapter: 'fyrverkeri', typ: '1', niva: 'single',
    faser: { entre: 1400, visning: 4600, utgang: 1000 } },
  { namn: 'Gift Fireworks · Kometspiral (Final)', nyckel: 'catalog:giftfireworks:comet', adapter: 'fyrverkeri', typ: 'final', niva: 'show',
    faser: { entre: 1400, visning: 17600, utgang: 1000 } },
  { namn: 'Heart Fireworks (combo 20)', nyckel: 'catalog:heartfireworks', adapter: 'hjartfyr', typ: '20', faser: { entre: 900, visning: 2802, utgang: 1800 } },
  { namn: 'Gift Bubbles (combo 10)', nyckel: 'catalog:giftbubbles', adapter: 'bubblor', typ: null, faser: { entre: 800, visning: 4132, utgang: 1300 } },
];
const fyrBild = page => bild(page).then(async b => Object.assign({}, b, await page.evaluate(() => ({
  fwKo: window.VyraGiftFireworks ? [window.VyraGiftFireworks.koLangd(), window.VyraGiftFireworks.aktiva()].join('/') : null,
  fwRenderare: window.VyraFireworks ? [window.VyraFireworks.pending(), window.VyraFireworks.timers()].join('/') : null,
  hfKo: window.VyraHeartFireworks ? [window.VyraHeartFireworks.koLangd(), window.VyraHeartFireworks.aktiva()].join('/') : null,
  gbKo: window.VyraGiftBubbles ? [window.VyraGiftBubbles.koLangd(), window.VyraGiftBubbles.aktiva()].join('/') : null,
  dukar: window.VyraSupernova ? window.VyraSupernova.active() : null,
  ticker: window.VFX && window.VFX.Ticker && window.VFX.Ticker._listeners ? window.VFX.Ticker._listeners.size : null,
  spelar: [...document.querySelectorAll('.canvas .widget:not([data-testspel-klon])')]
    .filter(n => n.querySelector('.fw-event, .hf-play, .gb-play, .gb-orb, .gb-heart, .hf-combo, .gb-combo')).map(n => n.dataset.id).join(),
}))));
const fyrKlon = page => page.evaluate(() => {
  const k = document.querySelector('.canvas [data-testspel-klon]');
  if (!k) return null;
  const grupp = k.querySelector('.fw-event');
  const hf = k.querySelector('.heart-fireworks-fx'), gb = k.querySelector('.gift-bubbles-fx');
  const motor = (hf && hf._hf) || (gb && gb._gb);
  if (motor) window.__fyrMotor = motor;
  return { id: k.dataset.id, grupp: !!grupp, niva: grupp && grupp.dataset.fwLevel, duk: !!(grupp && grupp.querySelector('canvas')),
    hfPlay: !!(hf && hf.classList.contains('hf-play')), gbPlay: !!(gb && gb.classList.contains('gb-play')),
    bubblor: gb ? gb.querySelectorAll('.gb-orb, .gb-heart').length : 0, motor: motor ? motor.inspect() : null };
});

for (const m of FYR_ISOLERING) {
  test(`${m.adapter}-adaptern är isolerad: ${m.namn}`, { skip, timeout: 150000 }, async () => {
    const fel = [];
    const page = await oppnaStudio(fel);
    try {
      await layout(page, m.nyckel);
      await installeraRaknare(page);
      // De gamla testknapparna är borta ur panelen.
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.properties #testFw, .properties #fwCombo, .properties #testHf, .properties #hfCombo, .properties #testGb, .properties #gbCombo')]
        .filter(n => !n.closest('[data-panelram-forvaring]')).map(n => n.id)), [], 'de gamla testknapparna är borta');
      if (m.typ) await page.selectOption('#pr-testspel-typ', m.typ);
      else assert.equal(await page.$('#pr-testspel-typ'), null, 'Gift Bubbles har ingen typväljare (combo 10)');
      const fore = await fyrBild(page);
      assert.equal(fore.spelar, '', 'kontrollmätning: ingenting spelar före ▶');

      // ▶
      await page.evaluate(() => { window.__provRaknare.pa = true; });
      await page.click('#pr-testspel');
      const s1 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s1.aktiv, true, 'testet startade');
      assert.equal(s1.adapter, m.adapter);
      if (m.typ) assert.equal(s1.typ, m.typ, 'typväljarens val');
      assert.deepEqual(s1.faser, m.faser, 'faserna ur motorns tidslinje');
      await page.waitForTimeout(250);
      const k = await fyrKlon(page);
      assert.equal(k.id, 'prov-a__prov');
      if (m.adapter === 'fyrverkeri') {
        assert.equal(k.grupp, true, 'fyrverkeriet startade på klonen');
        assert.equal(k.duk, true, 'klonen ritar på en egen duk');
        assert.equal(k.niva, m.niva, 'typväljarens antal ger nivån');
        const nu = await page.evaluate(() => ({ dukar: window.VyraSupernova.active(), ticker: window.VFX.Ticker._listeners.size }));
        assert.deepEqual(nu, { dukar: fore.dukar + 1, ticker: fore.ticker + 1 }, 'klonens duk prenumererar på den enda tickern');
      } else if (m.adapter === 'hjartfyr') {
        assert.equal(k.hfPlay, true, 'Heart Fireworks startade på klonen');
        assert.ok(k.motor.raketer >= 1, 'guldskottet (combo 20) är i luften: ' + JSON.stringify(k.motor));
      } else {
        assert.equal(k.gbPlay, true, 'Gift Bubbles startade på klonen');
        assert.ok(k.bubblor > 0, 'bubblorna stiger på klonen');
      }
      const dold = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="prov-a"]:not([data-testspel-klon])')).visibility);
      assert.equal(dold, 'hidden', 'den riktiga noden är dold medan klonen spelar');
      await page.waitForTimeout(1200);
      // Klonens egen duk räknas i dukar och ticker medan den spelar (provat ovan); allt annat är orört.
      const mitt = await fyrBild(page);
      if (m.adapter === 'fyrverkeri') Object.assign(mitt, { dukar: fore.dukar, ticker: fore.ticker });
      lika(fore, mitt, 'mitt i testet (B spelar inte, ingen kö)');

      // ■
      await page.click('#pr-testspel');
      await page.waitForTimeout(150);
      const s2 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s2.aktiv, false, 'testet stoppades');
      assert.equal(s2.senaste.orsak, 'knapp');
      assert.deepEqual(s2.senaste.brott, [], 'inga brott i motorns vakter');
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta');
      if (m.adapter !== 'fyrverkeri') {
        const motor = await page.evaluate(() => window.__fyrMotor.inspect());
        assert.deepEqual(motor, Object.assign({ raf: false, dod: true, timrar: 0, gnistor: 0 }, m.adapter === 'hjartfyr' ? { raketer: 0 } : { bubblor: 0 }),
          'motorn är död: inget rAF-varv, inga timrar och inga gnistor');
      }
      await page.waitForTimeout(500);
      lika(fore, await fyrBild(page), 'efter ■');
      assert.equal(await page.evaluate(() => document.querySelectorAll('.canvas canvas.fw-natural-canvas').length), 0, 'ingen fyrverkeriduk ligger kvar');
      const anrop = await page.evaluate(() => { window.__provRaknare.pa = false; return window.__provRaknare.anrop.slice(); });
      assert.deepEqual(anrop, [], 'inget nät, ingen lagring och ingen kö under ▶ och ■');
      assert.deepEqual(await page.evaluate(() => window.VyraTestspel.brott()), [], 'motorn registrerade inga brott');

      // ▶ igen: samma faser.
      await page.click('#pr-testspel');
      const s3 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s3.aktiv, true, 'testet kan spelas om');
      assert.deepEqual(s3.faser, s1.faser, 'omspelningen har samma faser');
      await page.waitForTimeout(300);
      await fyrKlon(page);

      // render() mitt i testet tar bort klonen och allt den startade.
      await page.evaluate(() => render());
      await page.waitForTimeout(300);
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'render() tog bort klonen');
      assert.equal((await page.evaluate(() => window.VyraTestspel.status())).senaste.orsak, 'render');
      assert.equal(await page.evaluate(() => JSON.stringify(state)), fore.state, 'state oförändrad efter render-stoppet');
      const efter = await fyrBild(page);
      for (const f of ['fwKo', 'fwRenderare', 'hfKo', 'gbKo', 'dukar', 'ticker', 'spelar']) assert.equal(efter[f], fore[f], `${f} efter render-stoppet`);
      if (m.adapter !== 'fyrverkeri') assert.equal(await page.evaluate(() => window.__fyrMotor.inspect().dod), true, 'motorn dödades av render-stoppet');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('fyrverkeri: ett test som får gå klart passerar entré → visning → utgång och lämnar inget kvar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppnaStudio(fel);
  try {
    await layout(page, 'catalog:giftfireworks:rose');
    // Rörelsehastigheten 2,5 × kortar hela programmet: 7 s / 2,5 = 2,8 s, raketen 1,4 s / 2,5.
    await page.evaluate(() => { const w = liveWidget('prov-a'); w.fwPlaySpeed = 2.5; save(); render(); });
    await page.waitForTimeout(800);
    const fore = await fyrBild(page);
    await page.click('#pr-testspel');
    const s = await page.evaluate(() => window.VyraTestspel.status());
    assert.deepEqual(s.faser, { entre: 560, visning: 1773, utgang: 467 }, 'faserna följer Rörelsehastighet');
    await page.waitForTimeout(s.faser.entre + s.faser.visning + s.faser.utgang + 600);
    const slut = await page.evaluate(() => window.VyraTestspel.status());
    assert.equal(slut.aktiv, false);
    assert.equal(slut.senaste.orsak, 'klar');
    assert.deepEqual(slut.senaste.forlopp, ['entre', 'visning', 'utgang']);
    assert.equal(await page.$('.canvas [data-testspel-klon]'), null);
    lika(fore, await fyrBild(page), 'efter ett färdigt test');
    assert.deepEqual(fel, []);
  } finally {
    await page.close();
  }
});

// ---- Fontänerna och gåvoburken: Like Fountain klassisk, Portal och Gift Jar (adaptrarna 'fontan', 'portal' och 'burk', PR 13)
//
// De gamla testknapparna: ▶ Testa Pop Effect och ▶ Replay/⏸ Pausa/⟲ Återställ (klassisk), ♥ Testa (15 likes) och ✦ Testa
// stora hjärtat (Portal), Släpp 5 testgåvor/Töm burken/Återställ till standard (Gift Jar). Släpp 5 testgåvor gick genom
// triggerGiftJarDrop, som släppte i ALLA burkar och räknade testgåvorna i den riktiga räknaren (granskningen: A/B 0/0 →
// 5/5). Testet spelar nu på klonen. Utöver bilden ovan kräver provet att
//   * B av samma modell inte spelar: inga släppta hjärtan (.lf-live), ingen pop, ingen levande portal (lfp-live), och
//     tecken för tecken samma DOM,
//   * de riktiga köerna och räknarna är orörda: fontänens kö (VyraLikeFountain.koLangd), portalens tillstånd
//     (VyraLikePortal.tillstand) och burkarnas runtime-poster (giftJarRuntime) — burkarna har RIKTIGA gåvor i sig före
//     testet (tre var, genom livevägen), och de ska ligga kvar,
//   * ingenting lever kvar efter ■ och efter render(): ingen portalklon i klockan och inget tillstånd för klonens id,
//     ingen runtime-post för klonens burk och burkens bildruta död (inget rAF-varv).
// Faserna: klassisk fem paket på 4 s plus Flygtid, Portal fem paket på 1,6 s och det stora hjärtat (formMs ur
// portalens egen konstant), Gift Jar fem gåvor, full burk efter 3 s och finalen 2,2 + 7 s.
const FONTAN_ISOLERING = [
  { namn: 'Like Fountain klassisk', nyckel: 'catalog:likefountain', adapter: 'fontan', faser: () => ({ entre: 500, visning: 8800, utgang: 1000 }) },
  { namn: 'Like Fountain Portal · Aurora', nyckel: 'catalog:likefountain:portal:aurora', adapter: 'portal',
    faser: formMs => ({ entre: 500, visning: 1600 + 2400 + formMs - 1500, utgang: 1000 }) },
  { namn: 'Gift Jar · Ember Dragon', nyckel: 'catalog:giftjar:dragon', adapter: 'burk', faser: () => ({ entre: 600, visning: 9600, utgang: 2000 }) },
];
const FONTAN_GAMLA = ['#testFountainPop', '#lfReplay', '#lfPause', '#lfReset', '#lfpTest', '#lfpTestPop', '#jarDropTest', '#jarReset', '#jarDefaults'];
const fontanBild = page => bild(page).then(async b => Object.assign({}, b, await page.evaluate(() => ({
  lfKo: window.VyraLikeFountain ? ['prov-a', 'prov-b'].map(id => window.VyraLikeFountain.koLangd(id)).join('/') : null,
  portal: window.VyraLikePortal ? JSON.stringify(['prov-a', 'prov-b'].map(id => window.VyraLikePortal.tillstand(id))) : null,
  provade: window.VyraLikePortal && window.VyraLikePortal.provade ? window.VyraLikePortal.provade().join() : null,
  burkar: typeof giftJarRuntime !== 'undefined' ? JSON.stringify([...giftJarRuntime.entries()].map(([k, v]) => [k, v.count, v.items.length])) : null,
  spelar: [...document.querySelectorAll('.canvas .widget:not([data-testspel-klon])')]
    .filter(n => n.querySelector('.lf-live, .fountain-pop.play') || n.classList.contains('lfp-live')).map(n => n.dataset.id).join(),
}))));
const fontanKlon = page => page.evaluate(() => {
  const k = document.querySelector('.canvas [data-testspel-klon]');
  if (!k) return null;
  const cv = k.querySelector('canvas');
  if (cv && cv.__burk) window.__burkMotor = cv.__burk;
  return { id: k.dataset.id, live: k.querySelectorAll('.lf-live').length, pop: !!k.querySelector('.fountain-pop.play'),
    bilder: [...k.querySelectorAll('.lf-live img')].map(i => i.getAttribute('src')).join(),
    portal: window.VyraLikePortal ? window.VyraLikePortal.tillstand(k.dataset.id) : null, portalLever: k.classList.contains('lfp-live'),
    burk: cv && cv.__burk ? cv.__burk.inspect() : null,
    runtime: typeof giftJarRuntime !== 'undefined' && giftJarRuntime.get(k.dataset.id) ? giftJarRuntime.get(k.dataset.id).count : null };
});

for (const m of FONTAN_ISOLERING) {
  test(`${m.adapter}-adaptern är isolerad: ${m.namn}`, { skip, timeout: 150000 }, async () => {
    const fel = [];
    const page = await oppnaStudio(fel);
    try {
      await layout(page, m.nyckel);
      // Riktiga gåvor i burkarna före testet, genom livevägen (samma händelse som TikTok-gåvor).
      if (m.adapter === 'burk') {
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('vyra-live-event', { detail: { type: 'gift', giftName: 'Rose', count: 3, username: 'Riktig' } })));
        await page.waitForTimeout(400);
        assert.deepEqual(await page.evaluate(() => ['prov-a', 'prov-b'].map(id => giftJarState(liveWidget(id)).count)), [3, 3], 'kontrollmätning: de riktiga burkarna har tre gåvor var');
      }
      await installeraRaknare(page);
      assert.deepEqual(await page.evaluate(sel => sel.flatMap(s => [...document.querySelectorAll('.properties ' + s)])
        .filter(n => !n.closest('[data-panelram-forvaring]')).map(n => n.id), FONTAN_GAMLA), [], 'de gamla testknapparna är borta');
      assert.equal(await page.$('#pr-testspel-typ'), null, 'ingen typväljare');
      const fore = await fontanBild(page);
      assert.equal(fore.spelar, '', 'kontrollmätning: ingenting spelar före ▶');

      // ▶
      await page.evaluate(() => { window.__provRaknare.pa = true; });
      await page.click('#pr-testspel');
      const s1 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s1.aktiv, true, 'testet startade');
      assert.equal(s1.adapter, m.adapter);
      const formMs = await page.evaluate(() => window.VyraLikePortal ? window.VyraLikePortal.formMs() : 0);
      assert.deepEqual(s1.faser, m.faser(formMs), 'faserna');
      await page.waitForTimeout(2800);
      const k = await fontanKlon(page);
      assert.equal(k.id, 'prov-a__prov');
      if (m.adapter === 'fontan') {
        assert.ok(k.live > 0, 'like-paketen släpper hjärtan på klonen: ' + JSON.stringify(k));
        assert.match(k.bilder, /test-profile\.svg/, 'exempeltittarens profilbild stiger med');
      } else if (m.adapter === 'portal') {
        assert.ok(k.portal && k.portal.hjartan + k.portal.ko > 0, 'hjärtan stiger ur klonens portal: ' + JSON.stringify(k.portal));
        assert.equal(k.portalLever, true, 'klonens duk ritas');
      } else {
        assert.equal(k.runtime, 5, 'fem gåvor i KLONENS runtime-post');
        assert.ok(k.burk && k.burk.raf && k.burk.foremal === 5, 'burkens rörelse går på klonen: ' + JSON.stringify(k.burk));
      }
      const dold = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="prov-a"]:not([data-testspel-klon])')).visibility);
      assert.equal(dold, 'hidden', 'den riktiga noden är dold medan klonen spelar');
      const mitt = await fontanBild(page);
      // Portalklonen står i klockans lista medan den spelar; allt annat är orört.
      if (m.adapter === 'portal') { assert.equal(mitt.provade, 'prov-a__prov'); mitt.provade = fore.provade; }
      if (m.adapter === 'burk') {
        // Klonens EGEN post finns under testet; de riktiga burkarnas poster är desamma.
        const riktiga = JSON.parse(mitt.burkar).filter(([id]) => id !== 'prov-a__prov');
        assert.deepEqual(riktiga, JSON.parse(fore.burkar), 'de riktiga burkarnas räkning');
        mitt.burkar = fore.burkar;
      }
      lika(fore, mitt, 'mitt i testet (B spelar inte, riktiga köer och räknare orörda)');

      // Burken: vänta in full burk och finalen på klonen.
      if (m.adapter === 'burk') {
        await page.waitForTimeout(3200);
        const full = await fontanKlon(page);
        assert.equal(full.runtime, 50, 'klonens burk är full (Full vid 50)');
        assert.ok(full.burk.final || full.burk.ko === 1, 'finalen är på väg eller spelar: ' + JSON.stringify(full.burk));
      }

      // ■
      await page.click('#pr-testspel');
      await page.waitForTimeout(150);
      const s2 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s2.aktiv, false, 'testet stoppades');
      assert.equal(s2.senaste.orsak, 'knapp');
      assert.deepEqual(s2.senaste.brott, [], 'inga brott i motorns vakter');
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta');
      const kvar = await page.evaluate(() => ({
        lfKo: window.VyraLikeFountain.koLangd('prov-a__prov'),
        portal: window.VyraLikePortal ? window.VyraLikePortal.tillstand('prov-a__prov') : null,
        burkPost: typeof giftJarRuntime !== 'undefined' ? giftJarRuntime.has('prov-a__prov') : false,
        motor: window.__burkMotor ? window.__burkMotor.inspect() : null,
      }));
      assert.equal(kvar.lfKo, 0, 'fontänens kö för klonen är tom');
      assert.equal(kvar.portal, null, 'inget portaltillstånd för klonens id');
      assert.equal(kvar.burkPost, false, 'klonens runtime-post är borta');
      if (m.adapter === 'burk') assert.deepEqual([kvar.motor.dod, kvar.motor.raf], [true, false], 'burkens bildruta är död');
      await page.waitForTimeout(500);
      lika(fore, await fontanBild(page), 'efter ■');
      const anrop = await page.evaluate(() => { window.__provRaknare.pa = false; return window.__provRaknare.anrop.slice(); });
      assert.deepEqual(anrop, [], 'inget nät, ingen lagring och ingen kö under ▶ och ■');
      assert.deepEqual(await page.evaluate(() => window.VyraTestspel.brott()), [], 'motorn registrerade inga brott');

      // ▶ igen: samma faser.
      await page.click('#pr-testspel');
      const s3 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s3.aktiv, true, 'testet kan spelas om');
      assert.deepEqual(s3.faser, s1.faser, 'omspelningen har samma faser');
      await page.waitForTimeout(600);
      await fontanKlon(page);

      // render() mitt i testet tar bort klonen och allt den startade.
      await page.evaluate(() => render());
      await page.waitForTimeout(300);
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'render() tog bort klonen');
      assert.equal((await page.evaluate(() => window.VyraTestspel.status())).senaste.orsak, 'render');
      assert.equal(await page.evaluate(() => JSON.stringify(state)), fore.state, 'state oförändrad efter render-stoppet');
      const efter = await fontanBild(page);
      for (const f of ['lfKo', 'portal', 'provade', 'burkar', 'spelar']) assert.equal(efter[f], fore[f], `${f} efter render-stoppet`);
      if (m.adapter === 'burk') assert.equal(await page.evaluate(() => window.__burkMotor.inspect().dod), true, 'burkens bildruta dödades av render-stoppet');
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('portal: ett test som får gå klart passerar entré → visning → utgång och lämnar inget kvar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppnaStudio(fel);
  try {
    await layout(page, 'catalog:likefountain:portal:neon');
    // Stort hjärta av (0): testet slutar när hjärtana stigit klart, utan formationen.
    await page.evaluate(() => { const w = liveWidget('prov-a'); w.fountainPopEvery = 0; save(); render(); });
    await page.waitForTimeout(800);
    const fore = await fontanBild(page);
    await page.click('#pr-testspel');
    const s = await page.evaluate(() => window.VyraTestspel.status());
    const stig = await page.evaluate(() => window.VyraLikePortal.stigMs());
    assert.deepEqual(s.faser, { entre: 500, visning: 1600 + 700 + stig - 1500, utgang: 1000 }, 'utan stort hjärta: bara stigningen');
    await page.waitForTimeout(s.faser.entre + s.faser.visning + s.faser.utgang + 600);
    const slut = await page.evaluate(() => window.VyraTestspel.status());
    assert.equal(slut.aktiv, false);
    assert.equal(slut.senaste.orsak, 'klar');
    assert.deepEqual(slut.senaste.forlopp, ['entre', 'visning', 'utgang']);
    assert.equal(await page.$('.canvas [data-testspel-klon]'), null);
    lika(fore, await fontanBild(page), 'efter ett färdigt test');
    assert.deepEqual(fel, []);
  } finally {
    await page.close();
  }
});

// ---- Fan Level 50 och Glove Snipe (PR 14, vyra-fl50-panel.js och vyra-glove-panel.js) ---------------------------
//
// Fan Level 50 (adaptern fan50): klonens kort byggs om med fyra exempeldeltagare (Alex, Mia, Leo, Sara). Bandet
// rullar dem; slideshowen byter klonens kort med fan-level-50.js eget kortbyte (bytKort) och motorns timer. De riktiga
// widgetarna har en enda deltagare i slideshowen, så deras egen motor (swap) står still och de kan jämföras tecken
// för tecken. Hämta från TikTok (fetch('/api/tiktok-profile')) får aldrig anropas — inte ens som GET.
//
// Glove Snipe (adaptrarna glove och glove-mp4): typväljaren väljer klippet, och klonen spelar det med samma
// uppspelning som triggern (VyraBattlePaket.spelaPa). Headless Chromium avkodar inte H.264, så provet läser klippets
// källa, klasserna och autoplay — inte bildrutor. Efter ■ finns ingen timer kvar för klonen och ingen video utöver de
// riktiga widgetarnas.
const FL50_GLOVE_ISOLERING = [
  { namn: 'Fan Level 50 · rullande band', nyckel: 'catalog:fanlevel50:royal', adapter: 'fan50', faser: { entre: 300, visning: 16000, utgang: 500 } },
  { namn: 'Fan Level 50 · slideshow (2 s)', nyckel: 'catalog:fanlevel50:royal', adapter: 'fan50', slideshow: true, faser: { entre: 300, visning: 8000, utgang: 500 } },
  { namn: 'Glove Snipe · Pink Princess (Snipe)', nyckel: 'catalog:glovesnipe:pinkPrincess:pack:2', adapter: 'glove', typ: 'snipe',
    klipp: /pink-princess\/snipe\.webm$/, faser: { entre: 200, visning: 9300, utgang: 500 } },
  { namn: 'Glove Snipe · Koi Pearl (X2, MP4)', nyckel: 'catalog:glovesnipe:koiPearl:pack:2', adapter: 'glove-mp4', typ: null,
    klipp: /koi-pearl\/boost-x2\.mp4$/, faser: { entre: 200, visning: 6342, utgang: 500 } },
];
const GLOVE_GAMLA = ['[data-paket-test]', '.paket-testknappar'];
const fgBild = page => bild(page).then(async b => Object.assign({}, b, await page.evaluate(() => ({
  fl50: window.VyraFanLevel50 ? JSON.stringify(window.VyraFanLevel50.roster()) : null,
  paket: window.VyraBattlePaket ? window.VyraBattlePaket.aktiva().join() : null,
  videor: [...document.querySelectorAll('.canvas video')].map(v => (v.closest('[data-id]') || {}).dataset.id + ':' + v.paused + ':' + v.hasAttribute('autoplay')).join(),
  spelar: [...document.querySelectorAll('.canvas .widget:not([data-testspel-klon])')].filter(n => n.classList.contains('pack-active')).map(n => n.dataset.id).join(),
}))));
const fgKlon = page => page.evaluate(() => {
  const k = document.querySelector('.canvas [data-testspel-klon]');
  if (!k) return null;
  const v = k.querySelector('video');
  return { id: k.dataset.id, klass: k.className, klipp: k.dataset.klipp || null,
    namn: [...k.querySelectorAll('.fl50-name span')].map(n => n.textContent.trim()).join('|'),
    rank: [...k.querySelectorAll('.fl50-rank')].map(n => n.textContent.trim()).join('|'),
    foton: [...k.querySelectorAll('.fl50-photo img')].map(i => i.getAttribute('src')).join('|'),
    video: v ? { src: v.getAttribute('src'), autoplay: v.hasAttribute('autoplay'), muted: v.muted } : null,
    synlig: getComputedStyle(k).visibility, opacitet: getComputedStyle(k).opacity };
});

for (const m of FL50_GLOVE_ISOLERING) {
  test(`${m.adapter}-adaptern är isolerad: ${m.namn}`, { skip, timeout: 150000 }, async () => {
    const fel = [];
    const page = await oppnaStudio(fel);
    try {
      await layout(page, m.nyckel);
      if (m.slideshow) {
        await page.evaluate(() => {
          for (const [id, namn] of [['prov-a', 'Ensam A'], ['prov-b', 'Ensam B']]) {
            Object.assign(liveWidget(id), { fanl50Mode: 'slideshow', fanl50Interval: 2, fanl50Source: 'manual', fanl50Manual: [{ name: namn, avatar: '' }] });
          }
          save(); render();
        });
        // Samma väntan som layout(): sparningen går till servern en stund efter save().
        await page.waitForTimeout(3500);
      }
      if (m.typ) {
        await page.selectOption('#pr-testspel-typ', m.typ);
        await page.waitForTimeout(200);
      }
      assert.deepEqual(await page.evaluate(sel => sel.flatMap(s => [...document.querySelectorAll('.properties ' + s)])
        .filter(n => !n.closest('[data-panelram-forvaring]')).length, GLOVE_GAMLA), 0, 'paketets gamla testknappar är borta');
      await installeraRaknare(page);
      // Hämta från TikTok är en GET — räknaren ovan släpper igenom läsningar, så den räknas för sig.
      await page.evaluate(() => {
        window.__profilhamtningar = [];
        const f = window.fetch;
        window.fetch = function (u) { if (/tiktok-profile/.test(String((u && u.url) || u))) window.__profilhamtningar.push(String(u)); return f.apply(this, arguments); };
      });
      const fore = await fgBild(page);
      assert.equal(fore.spelar, '', 'kontrollmätning: inget paket spelar före ▶');

      // ▶
      await page.evaluate(() => { window.__provRaknare.pa = true; });
      await page.click('#pr-testspel');
      const s1 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s1.aktiv, true, 'testet startade');
      assert.equal(s1.adapter, m.adapter);
      assert.deepEqual(s1.faser, m.faser, 'faserna');
      await page.waitForTimeout(m.slideshow ? 2900 : 900);
      const k = await fgKlon(page);
      assert.equal(k.id, 'prov-a__prov');
      if (m.adapter === 'fan50') {
        if (m.slideshow) {
          assert.match(k.klass, /fl50-mode-slideshow/);
          assert.equal(k.namn, 'Mia', 'slideshowen har bytt till klonens andra exempeldeltagare: ' + JSON.stringify(k));
          assert.equal(k.rank, '#2');
        } else {
          assert.match(k.klass, /fl50-mode-band/);
          assert.equal(k.namn, 'Alex|Mia|Leo|Sara|Alex|Mia|Leo|Sara', 'bandet rullar klonens fyra exempeldeltagare');
        }
        assert.match(k.foton, /test-profile\.svg/, 'exempeldeltagarnas profilbild');
      } else {
        assert.match(k.klass, /pack-active/, 'klonen spelar: ' + JSON.stringify(k));
        assert.equal(k.klipp, m.typ || 'boost-x2', 'klippet ur typväljaren');
        assert.match(k.video.src, m.klipp, 'klonens video har klippets källa');
        assert.equal(k.video.autoplay, true, 'autoplay sätts under uppspelningen (samma startväg som triggern)');
        assert.equal(k.video.muted, true);
        assert.equal(k.synlig, 'visible', 'klonen syns medan klippet spelar');
      }
      const dold = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="prov-a"]:not([data-testspel-klon])')).visibility);
      assert.equal(dold, 'hidden', 'den riktiga noden är dold medan klonen spelar');
      const mitt = await fgBild(page);
      if (m.adapter !== 'fan50') {
        assert.equal(mitt.paket, 'prov-a__prov', 'bara klonens klipp har en timer i media.js');
        mitt.paket = fore.paket;
        assert.ok(/prov-a__prov:\w+:true/.test(mitt.videor), 'klonens video har autoplay: ' + mitt.videor);
        mitt.videor = mitt.videor.split(',').filter(x => !x.startsWith('prov-a__prov:')).join();
      }
      lika(fore, mitt, 'mitt i testet (B spelar inte, rostern och de riktiga videorna orörda)');

      // ■
      await page.click('#pr-testspel');
      await page.waitForTimeout(150);
      const s2 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s2.aktiv, false, 'testet stoppades');
      assert.equal(s2.senaste.orsak, 'knapp');
      assert.deepEqual(s2.senaste.brott, [], 'inga brott i motorns vakter');
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'klonen är borta');
      await page.waitForTimeout(1500);   // efter slideshowens kortbyte (420 + 520 ms) och paketets stillastående-reserv (1,2 s)
      lika(fore, await fgBild(page), 'efter ■');
      const anrop = await page.evaluate(() => { window.__provRaknare.pa = false; return window.__provRaknare.anrop.slice(); });
      assert.deepEqual(anrop, [], 'inget nät, ingen lagring och ingen kö under ▶ och ■');
      assert.deepEqual(await page.evaluate(() => window.__profilhamtningar), [], 'Hämta från TikTok anropades inte');
      assert.deepEqual(await page.evaluate(() => window.VyraTestspel.brott()), [], 'motorn registrerade inga brott');

      // ▶ igen: samma faser, samma förlopp.
      await page.click('#pr-testspel');
      const s3 = await page.evaluate(() => window.VyraTestspel.status());
      assert.equal(s3.aktiv, true, 'testet kan spelas om');
      assert.deepEqual(s3.faser, s1.faser, 'omspelningen har samma faser');
      await page.waitForTimeout(500);

      // render() mitt i testet tar bort klonen och allt den startade.
      await page.evaluate(() => render());
      await page.waitForTimeout(300);
      assert.equal(await page.$('.canvas [data-testspel-klon]'), null, 'render() tog bort klonen');
      assert.equal((await page.evaluate(() => window.VyraTestspel.status())).senaste.orsak, 'render');
      assert.equal(await page.evaluate(() => JSON.stringify(state)), fore.state, 'state oförändrad efter render-stoppet');
      const efter = await fgBild(page);
      for (const f of ['fl50', 'paket', 'videor', 'spelar']) assert.equal(efter[f], fore[f], `${f} efter render-stoppet`);
      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('fan50: ett test som får gå klart passerar entré → visning → utgång och lämnar inget kvar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppnaStudio(fel);
  try {
    await layout(page, 'catalog:fanlevel50:royal');
    // Bandet med Bytestid 2: ett varv tar 8 s.
    await page.evaluate(() => { liveWidget('prov-a').fanl50Interval = 2; save(); render(); });
    await page.waitForTimeout(800);
    const fore = await fgBild(page);
    await page.click('#pr-testspel');
    const s = await page.evaluate(() => window.VyraTestspel.status());
    assert.deepEqual(s.faser, { entre: 300, visning: 8000, utgang: 500 });
    await page.waitForTimeout(s.faser.entre + s.faser.visning + 200);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-testspel-klon]')).opacity !== '1'), true, 'utgången tonar ut klonen');
    await page.waitForTimeout(s.faser.utgang + 600);
    const slut = await page.evaluate(() => window.VyraTestspel.status());
    assert.equal(slut.aktiv, false);
    assert.equal(slut.senaste.orsak, 'klar');
    assert.deepEqual(slut.senaste.forlopp, ['entre', 'visning', 'utgang']);
    assert.equal(await page.$('.canvas [data-testspel-klon]'), null);
    lika(fore, await fgBild(page), 'efter ett färdigt test');
    assert.deepEqual(fel, []);
  } finally {
    await page.close();
  }
});

test('glove: ett test som får gå klart passerar entré → visning → utgång och lämnar inget kvar', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppnaStudio(fel);
  try {
    await layout(page, 'catalog:glovesnipe:cloudFox:pack:2');
    // Taket (gloveDuration 4 s) är kortare än klippet (10 s): testet slutar vid taket, som uppspelningen.
    await page.evaluate(() => { liveWidget('prov-a').gloveDuration = 4; save(); render(); });
    await page.waitForTimeout(800);
    const fore = await fgBild(page);
    await page.selectOption('#pr-testspel-typ', 'tap');
    await page.click('#pr-testspel');
    const s = await page.evaluate(() => window.VyraTestspel.status());
    assert.deepEqual(s.faser, { entre: 200, visning: 3300, utgang: 500 });
    assert.equal(s.typ, 'tap');
    await page.waitForTimeout(s.faser.entre + s.faser.visning + s.faser.utgang + 700);
    const slut = await page.evaluate(() => window.VyraTestspel.status());
    assert.equal(slut.aktiv, false);
    assert.equal(slut.senaste.orsak, 'klar');
    assert.deepEqual(slut.senaste.forlopp, ['entre', 'visning', 'utgang']);
    assert.equal(await page.$('.canvas [data-testspel-klon]'), null);
    await page.waitForTimeout(800);
    lika(fore, await fgBild(page), 'efter ett färdigt test');
    assert.deepEqual(fel, []);
  } finally {
    await page.close();
  }
});
