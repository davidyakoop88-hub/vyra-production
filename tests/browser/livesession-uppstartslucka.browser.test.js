'use strict';
// UPPSTARTSLUCKAN OCH DEDUPEN — mätt i en riktig Chrome, genom hela den verkliga kedjan.
//
// Riggen serverar repot och härmar de två slutpunkter en OBS-länk lever på:
// `/api/overlay-access/{token}` (bootstrap + konfiguration) och `.../events/stream` (SSE).
// Allt däremellan är PRODUKTIONSKOD: overlay-access.js, live-session-client.js, live-client.js,
// overlay-config-sync.js och render().
//
// FYRA FRÅGOR SOM BARA GÅR ATT SVARA PÅ HÄR:
//   1. En källa som öppnas MITT i en sändning — vet den om det? (`live:start` kom och gick innan
//      källan fanns; snapshotet är det enda som kan berätta.)
//   2. Kommer samma sändning två gånger när snapshotet OCH ramen båda bär den?
//   3. Byter en ny sändning bilden utan omladdning?
//   4. Med flaggan av: skriver klienten något alls?
//
// Konfig-omhämtningen mäts som ANTAL bootstrap-GET:ar på serversidan. Det är den enda mätpunkt
// som är oberoende av klientens egen bokföring — frågar klienten inte om ny konfiguration står
// widgeten kvar med förra sändningens siffror, och det är precis felet det här ska fånga.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.gif': 'image/gif' };

const TOKEN = 'provtoken-livesession';
const OVERLAY_ID = 'OV-LS';
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';

const widget = () => ({ id: 'w1', type: 'templateTopLike', x: 40, y: 40, width: 320, height: 240 });
// Gift Campaign raknar i WIDGETENS EGNA falt (`giftCurrent<i>` i state.widgets), inte i en modul-
// variabel. Designen pastar att serverns nollstallning darfor racker via konfig-omhamtningen.
// Den har widgeten finns for att MATA det pastaendet i stallet for att tro pa det.
const kampanj = (current) => ({ id: 'k1', type: 'templateGiftCampaign', x: 420, y: 40,
  width: 320, height: 240, giftName0: 'Rose', giftCurrent0: current, giftTarget0: 10 });

function rigg() {
  // `session: undefined` = flaggan av (fältet utelämnas helt vid serialiseringen). Det är exakt
  // den skillnad servern gör, och den skillnaden är hela dormant-kontraktet.
  const lada = { version: 1, state: { widgets: [widget(), kampanj(0)] }, session: undefined, hamtningar: 0 };
  const strommar = [];

  const server = http.createServer((req, res) => {
    const u = String(req.url || '').split('?')[0];
    if (u === `/api/overlay-access/${TOKEN}`) {
      lada.hamtningar += 1;
      const kropp = { ok: true, overlay: { id: OVERLAY_ID, version: lada.version, state: lada.state } };
      if (lada.session !== undefined) kropp.session = lada.session;
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(kropp));
      return;
    }
    if (u === `/api/overlay-access/${TOKEN}/events/stream`) {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
      res.write(': hej\n\n');
      strommar.push(res);
      return;
    }
    const rel = decodeURIComponent(u).replace(/^\/+/, '') || 'index.html';
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });

  // Exakt den ram servern publicerar (event-bus.js cleanInternalEvent): inget workspaceId, inget
  // roomId — bara type, event, eventId, sessionId och sitt eget tidsfält.
  const ram = (handelse, sessionId) => ({ type: 'livesession', event: handelse,
    eventId: handelse + ':' + sessionId, sessionId,
    [handelse === 'live:start' ? 'startedAt' : 'endedAt']: '2026-08-25T09:00:00.000Z' });
  let strom = 0;
  const skicka = (handelse, sessionId) => {
    strom += 1;
    for (const s of strommar) {
      s.write(`id: ${strom}-0\nevent: live\ndata: ${JSON.stringify(ram(handelse, sessionId))}\n\n`);
    }
  };
  return { server, lada, skicka, strommar };
}

let browser, r, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  r = rigg();
  await new Promise(res => r.server.listen(0, '127.0.0.1', res));
  bas = `http://127.0.0.1:${r.server.address().port}`;
});
test.after(async () => {
  if (browser) await browser.close();
  if (r) {
    for (const s of r.strommar) { try { s.end() } catch (e) {} }
    await new Promise(res => r.server.close(res));
  }
});

async function oppna() {
  const sida = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  sida.__fel = [];
  sida.on('pageerror', e => sida.__fel.push(String(e && e.message).slice(0, 160)));
  await sida.goto(`${bas}/studio.html?overlay=1&access=${TOKEN}`, { waitUntil: 'load' });
  await sida.waitForFunction(() => !!document.querySelector('[data-id]'), null, { timeout: 30000 });
  await sida.waitForFunction(
    () => document.documentElement.dataset.overlayConnection === 'connected', null, { timeout: 30000 });
  // En markör som INTE överlever en omladdning. Varje prov nedan kräver att den står kvar:
  // "utan omladdning" är annars bara en förhoppning.
  await sida.evaluate(() => { window.__markor = 'star-kvar' });
  return sida;
}

const aktiv = sida => sida.evaluate(() => sessionStorage.getItem('vyra-live-session-aktiv'));
const hanterade = sida => sida.evaluate(() => sessionStorage.getItem('vyra-live-session-hanterade'));

const prov = (namn, fn) => test('livesession: ' + namn, { skip, timeout: 90000 }, fn);

prov('en kalla som oppnas MITT i en sandning far den ur snapshotet', async () => {
  r.lada.session = { sessionId: S1, startedAt: '2026-08-25T09:00:00.000Z' };
  const sida = await oppna();
  try {
    await sida.waitForFunction(() => sessionStorage.getItem('vyra-live-session-aktiv'),
      null, { timeout: 15000 });
    assert.equal(await aktiv(sida), S1, 'uppstartsluckan star oppen: kallan vet inte om sandningen');
    assert.equal(JSON.parse(await hanterade(sida))[0], 'live:start:' + S1,
      'snapshotet gick inte genom dedupen');
    assert.deepEqual(sida.__fel, []);
  } finally { await sida.close() }
});

prov('snapshot + SSE-ram for SAMMA sandning ger EN behandling', async () => {
  r.lada.session = { sessionId: S1, startedAt: '2026-08-25T09:00:00.000Z' };
  const sida = await oppna();
  try {
    await sida.waitForFunction(() => sessionStorage.getItem('vyra-live-session-aktiv'),
      null, { timeout: 15000 });
    // Signalen raknas INNE i sidan, inte som GET:ar pa servern. Uppmatt: bootstrap-GET:en gors
    // ocksa av konfig-synken vid varje ateranslutning av strommen, sa antalet hamtningar ar inget
    // matt pa hur manga sandningsbesked som behandlats — 7 mot vantade 4 i forsta korningen.
    await sida.evaluate(() => {
      window.__signaler = 0;
      addEventListener('vyra-live-session', () => { window.__signaler += 1 });
    });
    r.skicka('live:start', S1);                     // samma sandning igen, over strommen
    await sida.waitForTimeout(1500);
    assert.equal(await sida.evaluate(() => window.__signaler), 0,
      'ramen behandlades trots att snapshotet redan burit samma sandning');
    assert.equal(await aktiv(sida), S1);
    assert.equal(JSON.parse(await hanterade(sida)).length, 1);
  } finally { await sida.close() }
});

prov('en NY sandning byter bild utan omladdning och hamtar om konfigurationen', async () => {
  r.lada.session = { sessionId: S1, startedAt: '2026-08-25T09:00:00.000Z' };
  const sida = await oppna();
  try {
    await sida.waitForFunction(() => sessionStorage.getItem('vyra-live-session-aktiv'),
      null, { timeout: 15000 });
    const fore = r.lada.hamtningar;
    r.lada.version += 1;                            // serverns nollstallning ar redan committad
    r.skicka('live:start', S2);
    await sida.waitForFunction(id => sessionStorage.getItem('vyra-live-session-aktiv') === id,
      S2, { timeout: 15000 });
    assert.ok(r.lada.hamtningar > fore, 'den nya sandningen hamtade aldrig om konfigurationen');
    assert.equal(await sida.evaluate(() => window.__markor), 'star-kvar', 'sidan laddades om');
    assert.deepEqual(sida.__fel, []);
  } finally { await sida.close() }
});

prov('live:end nollar den aktiva sandningen, ett gammalt end gor det inte', async () => {
  r.lada.session = { sessionId: S1, startedAt: '2026-08-25T09:00:00.000Z' };
  const sida = await oppna();
  try {
    await sida.waitForFunction(() => sessionStorage.getItem('vyra-live-session-aktiv'),
      null, { timeout: 15000 });
    r.skicka('live:start', S2);
    await sida.waitForFunction(id => sessionStorage.getItem('vyra-live-session-aktiv') === id,
      S2, { timeout: 15000 });
    r.skicka('live:end', S1);                       // sen ram fran den forra sandningen
    await sida.waitForTimeout(800);
    assert.equal(await aktiv(sida), S2, 'ett gammalt end backade den aktiva sandningen');
    r.skicka('live:end', S2);
    await sida.waitForFunction(() => sessionStorage.getItem('vyra-live-session-aktiv') === '',
      null, { timeout: 15000 });
    assert.equal(await aktiv(sida), '');
  } finally { await sida.close() }
});

prov('sandningsramar lacker aldrig ut i den vanliga eventvagen', async () => {
  r.lada.session = null;
  const sida = await oppna();
  try {
    await sida.evaluate(() => localStorage.removeItem('vyra-live-event'));
    r.skicka('live:start', S1);
    await sida.waitForFunction(id => sessionStorage.getItem('vyra-live-session-aktiv') === id,
      S1, { timeout: 15000 });
    const sista = await sida.evaluate(() => localStorage.getItem('vyra-live-event'));
    assert.equal(sista, null,
      'en livesession-ram behandlades som ett vanligt liveevent och nadde widgetarna');
  } finally { await sida.close() }
});

// ---- MISSAT live:end UNDER ETT STROMAVBROTT --------------------------------------------------
// Den enda vagen tillbaka. `live:end` ar en handelse: tappas strommen medan sandningen slutar
// kommer ramen ALDRIG igen. Utan ett auktoritativt snapshot vid ateranslutningen star kallan kvar
// i en sandning som tog slut — for alltid. Provet river strommen pa serversidan, later sandningen
// ta slut i det dolda, och later klientens egen ateranslutning gora jobbet.
prov('missat live:end: ateranslutningens snapshot avslutar den gamla sandningen', async () => {
  r.lada.session = { sessionId: S1, startedAt: '2026-08-25T09:00:00.000Z' };
  const sida = await oppna();
  try {
    await sida.waitForFunction(id => sessionStorage.getItem('vyra-live-session-aktiv') === id,
      S1, { timeout: 15000 });

    // Sandningen tar slut MEDAN strommen ar nere: servern svarar nu null, men ingen ram gar ut.
    r.lada.session = null;
    for (const strom of r.strommar) { try { strom.end() } catch (e) {} }
    r.strommar.length = 0;

    // Klientens egen ateranslutning hamtar om bootstrappen. Ingen ram har behandlats under tiden,
    // sa snapshotet ar fart och far avsluta.
    await sida.waitForFunction(() => sessionStorage.getItem('vyra-live-session-aktiv') === '',
      null, { timeout: 45000 });
    assert.equal(await aktiv(sida), '', 'kallan star kvar i en sandning som tog slut');
    assert.equal(await sida.evaluate(() => window.__markor), 'star-kvar', 'sidan laddades om');
  } finally { await sida.close() }
});

// ---- SANDNINGSREKORDEN (gift-event-images.js) -------------------------------------------------
// Designen pekade ut extras.js/action-event.js for "streak-raknare". Mätningen visar att den
// raknaren inte finns dar — extras.js ar katalog och chatbot-UI, action-event.js har en regex och
// en kommentar. Den VERKLIGA raknaren bor i gift-event-images.js: `records = {giftCoins,
// streakCount}`, med filens egen kommentar "Rekorden galler SANDNINGEN, inte layouten — de
// nollstalls vid omladdning". Utan omladdning nollstalldes de aldrig, och Top Gift / Top Streak
// bar da forra sandningens rekord in i den nya.
prov('sandningsrekorden nollstalls nar en ny sandning borjar', async () => {
  r.lada.session = { sessionId: S1, startedAt: '2026-08-25T09:00:00.000Z' };
  const sida = await oppna();
  try {
    await sida.waitForFunction(() => sessionStorage.getItem('vyra-live-session-aktiv'),
      null, { timeout: 15000 });
    // Samma ingang som den riktiga vagen tar ett steg efter ingest().
    await sida.evaluate(() => dispatchEvent(new CustomEvent('vyra-live-event', {
      detail: { type: 'gift', giftName: 'Rose', username: '@provgivare', coins: 500, count: 25 } })));
    await sida.waitForFunction(() => window.VyraGiftRecords
      && window.VyraGiftRecords.streakCount > 0, null, { timeout: 10000 });
    const fore = await sida.evaluate(() => ({ ...window.VyraGiftRecords }));
    assert.equal(fore.streakCount, 25, 'riggens gava naddes aldrig fram till rekordhallaren');
    assert.ok(fore.giftCoins > 0);

    r.skicka('live:start', S2);
    await sida.waitForFunction(id => sessionStorage.getItem('vyra-live-session-aktiv') === id,
      S2, { timeout: 15000 });
    const efter = await sida.evaluate(() => ({
      streakCount: window.VyraGiftRecords.streakCount, giftCoins: window.VyraGiftRecords.giftCoins }));
    assert.deepEqual(efter, { streakCount: 0, giftCoins: 0 },
      'forra sandningens rekord foljde med in i den nya');
  } finally { await sida.close() }
});

// ---- EN GAVA I SAMMA TICK SOM SANDNINGSBYTET -------------------------------------------------
// UPPMATT, inte antaget: gift-event-images.js batchar genom en rAF, men det som ligger i den kon
// ar bara DOM-MALNINGEN. Sjalva tillstandet — `records` och widgetens `dataValue`/`giftCurrent<i>`
// — skrivs SYNKRONT i eventhanteraren, alltsa fore sessionssignalen om de kommer i samma tick.
// Nagon sessionsgeneration behovs darfor inte i den har kedjan: den fordrojda delen kan inte
// aterfylla tillstand, bara mala en ruta som nasta omritning ratar.
//
// Provet star kvar for att BEVAKA just det: skulle nagon flytta tillstandsskrivningen in i flush()
// blir den har invarianten falsk direkt. Gavan och bytet skickas i samma synkrona block, sa ingen
// bildruta hinner emellan.
prov('en gava i samma tick som sandningsbytet lamnar inga spar i de nya rekorden', async () => {
  r.lada.version = 1;
  r.lada.state = { widgets: [widget(), kampanj(0)] };
  r.lada.session = { sessionId: S1, startedAt: '2026-08-25T09:00:00.000Z' };
  const sida = await oppna();
  try {
    await sida.waitForFunction(id => sessionStorage.getItem('vyra-live-session-aktiv') === id,
      S1, { timeout: 15000 });
    r.lada.version += 1;
    r.lada.state = { widgets: [widget(), kampanj(0)] };

    // Gavan och sessionssignalen i samma tick — gavan hinner aldrig ut ur rAF-kon.
    await sida.evaluate(() => {
      dispatchEvent(new CustomEvent('vyra-live-event', {
        detail: { type: 'gift', giftName: 'Rose', username: '@sen', coins: 10, count: 9 } }));
      dispatchEvent(new CustomEvent('vyra-live-session', {
        detail: { event: 'live:start', sessionId: '22222222-2222-4222-8222-222222222222' } }));
    });
    await sida.evaluate(() => new Promise(r2 => requestAnimationFrame(() => requestAnimationFrame(r2))));

    const rekord = await sida.evaluate(() => ({ ...window.VyraGiftRecords }));
    assert.equal(rekord.streakCount, 0, 'gavan overlevde sessionsbytet i rekordhallaren');
    assert.equal(rekord.giftCoins, 0);
  } finally { await sida.close() }
});

// ---- GIFT CAMPAIGN (Davids punkt: mat, tro inte) ----------------------------------------------
prov('gift campaign-raknaren foljer serverns nollstallning via konfig-omhamtningen', async () => {
  r.lada.version = 1;
  r.lada.state = { widgets: [widget(), kampanj(0)] };
  r.lada.session = { sessionId: S1, startedAt: '2026-08-25T09:00:00.000Z' };
  const sida = await oppna();
  try {
    await sida.waitForFunction(() => sessionStorage.getItem('vyra-live-session-aktiv'),
      null, { timeout: 15000 });
    await sida.evaluate(() => dispatchEvent(new CustomEvent('vyra-live-event', {
      detail: { type: 'gift', giftName: 'Rose', username: '@provgivare', coins: 10, count: 3 } })));
    await sida.waitForFunction(() => state.widgets.some(w => w.giftCurrent0 === 3),
      null, { timeout: 10000 });

    // Serverns nollstallning ar redan committad nar startbeskedet gar ut: den nya konfigurationen
    // bar giftCurrent0 = 0 och en hogre revision. Klienten ska hamta den utan omladdning.
    r.lada.version += 1;
    r.lada.state = { widgets: [widget(), kampanj(0)] };
    r.skicka('live:start', S2);

    await sida.waitForFunction(id => sessionStorage.getItem('vyra-live-session-aktiv') === id,
      S2, { timeout: 15000 });
    await sida.waitForFunction(() => state.widgets.some(w => w.type === 'templateGiftCampaign'
      && Number(w.giftCurrent0 || 0) === 0), null, { timeout: 15000 });
    assert.equal(await sida.evaluate(() => window.__markor), 'star-kvar', 'sidan laddades om');
    const text = await sida.evaluate(() => {
      const box = [...document.querySelectorAll('[data-id]')].find(el => el.dataset.id === 'k1');
      return box ? box.innerText.replace(/\n/g, ' ') : '';
    });
    assert.ok(/Rose\s*\|?\s*0\s*\|?\s*\/\s*10/.test(text.replace(/\s+/g, ' ')) || /0 \/ 10/.test(text),
      'widgeten visar fortfarande forra sandningens siffra: ' + text.slice(0, 120));
  } finally { await sida.close() }
});

prov('flaggan av: faltet saknas — ingen nyckel skrivs och ingen omhamtning sker', async () => {
  r.lada.session = undefined;
  const sida = await oppna();
  try {
    const fore = r.lada.hamtningar;
    await sida.waitForTimeout(1500);
    assert.equal(await aktiv(sida), null, 'dormant klient skrev aktiv-nyckeln');
    assert.equal(await hanterade(sida), null, 'dormant klient skrev listan over behandlade');
    assert.equal(r.lada.hamtningar, fore, 'dormant klient hamtade om konfigurationen');
    assert.deepEqual(sida.__fel, []);
  } finally { await sida.close() }
});
