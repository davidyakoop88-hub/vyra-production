'use strict';
// ▶ TESTA WIDGET ÄR ISOLERAT (panelspecifikationen 2.6) — adaptrarna 'topgift', 'lastx', 'fanlevel',
// 'gifterlevel', 'follower' och 'guardian' i Chrome. (Last-X och alertfamiljerna har egna prov längre ner.)
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
      assert.equal(k.meddelande, 'SENT CROWN ×5', 'exempelgåvan');
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
      assert.equal(k2.meddelande, 'SENT 50 LIKES');

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
