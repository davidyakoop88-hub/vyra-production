'use strict';
// NOLLSTALLNINGEN VID live:start — widget for widget, i en riktig Chrome (#271 avsnitt 4).
//
// tests/browser/livesession-uppstartslucka.browser.test.js bevisade monstret via leaderboard,
// sandningsrekorden, Gift Campaign och TTS. Tre familjer stod kvar som "foljer samma monster" utan
// att nagon matt dem: Battle MVP, Last-X och malwidgeten. Ett pastaende om ett monster ar inget
// bevis for den enskilda filen — den kan ha fel signalnamn, fel handelse eller nollstalla nagot som
// genast skrivs over. Har mats var och en for sig, genom hela den verkliga kedjan.
//
// SAMMA RIGG som uppstartsluckan: repot serveras, och de slutpunkter en OBS-lank lever pa harmas —
// bootstrap, SSE-strommen och malsnapshotet. Allt daremellan ar PRODUKTIONSKOD. Riggen ar
// kopierad, inte delad: uppstartsluckans fil agas av live-domanen, och en gemensam hjalpare hade
// gjort en andring dar till en andring har.
//
// Plus en fjarde fraga, i Studio-laget: skrivs Gift Campaigns rakning (`giftCurrent<i>`) in i den
// layout som sparas — och foljer forra sandningens rakning da med in i nasta?
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.gif': 'image/gif' };

const TOKEN = 'provtoken-nollstallning';
const OVERLAY_ID = 'OV-NS';
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';

// ---- widgetarna, som fabriken skapar dem ------------------------------------------------------
const mvp = (over = {}) => Object.assign(VyraWidgets.create('catalog:battlemvp:inferno'),
  { id: 'm1', x: 40, y: 40 }, over);
// followDuration 15 = langsta tiden panelen erbjuder. Forsta kortet ska STA KVAR medan de
// andra koar bakom det — det ar kon nollstallningen ska tomma.
const lastX = () => ({ id: 'lx1', type: 'templateLastX', x: 40, y: 360, width: 500,
  title: 'Last-X Alerts', lastXType: 'all', lastXDesign: 'card', lastXEntrance: 'slide-left',
  followDuration: 15 });
const mal = () => ({ id: 'g1', type: 'templateSocialGoal', goalKind: 'follows',
  goalCurrent: 0, goalTarget: 1000, x: 700, y: 40 });
const kampanj = (current) => ({ id: 'k1', type: 'templateGiftCampaign', x: 420, y: 40,
  width: 320, height: 240, giftName0: 'Rose', giftCurrent0: current, giftTarget0: 10 });

// En malrad som servern bar den: absolut varde och en revision som ar enda ordningsbegreppet.
const malrad = (value, revision) => ({ overlayId: OVERLAY_ID, widgetId: 'g1', metric: 'follows',
  value, target: 1000, epoch: 1, at: 1, revision: String(revision), baseline: 0, progress: value });

function rigg() {
  const lada = { version: 1, state: { widgets: [] }, session: undefined, hamtningar: 0,
    mal: [], malHamtningar: 0 };
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
    if (u === `/api/overlay-access/${TOKEN}/goals`) {
      lada.malHamtningar += 1;
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, goals: lada.mal }));
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

  let strom = 0;
  const ram = (namn, data) => {
    strom += 1;
    for (const s of strommar) s.write(`id: ${strom}-0\nevent: ${namn}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  // Exakt den sandningsram servern publicerar (event-bus.js cleanInternalEvent).
  const sandning = (handelse, sessionId) => ram('live', { type: 'livesession', event: handelse,
    eventId: handelse + ':' + sessionId, sessionId,
    [handelse === 'live:start' ? 'startedAt' : 'endedAt']: '2026-08-25T09:00:00.000Z' });
  // Ett vanligt liveevent over samma strom. Eget id per ram, annars dedupar eventgrinden bort det.
  let nasta = 0;
  const live = (handelse) => { nasta += 1; ram('live', { id: 'prov-' + nasta, ...handelse }) };
  const malram = (rad) => ram('goal', rad);
  return { server, lada, sandning, live, malram, strommar };
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

async function oppnaOverlay() {
  const sida = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await sida.addInitScript(() => {
    window.__las = (nyckel) => window.VyraLiveSession.lagratVarde(nyckel);
  });
  sida.__fel = [];
  sida.on('pageerror', e => sida.__fel.push(String(e && e.message).slice(0, 160)));
  await sida.goto(`${bas}/studio.html?overlay=1&access=${TOKEN}`, { waitUntil: 'load' });
  await sida.waitForFunction(() => !!document.querySelector('[data-id]'), null, { timeout: 30000 });
  await sida.waitForFunction(
    () => document.documentElement.dataset.overlayConnection === 'connected', null, { timeout: 30000 });
  // Overlever inte en omladdning. "Utan omladdning" ar annars bara en forhoppning.
  await sida.evaluate(() => { window.__markor = 'star-kvar' });
  return sida;
}

// Samma regel som i uppstartsluckan: vanta pa VILLKORET med en ovre grans, inte en fast paus.
async function vantaPa(villkor, meddelande, { timeout = 15000, intervall = 50 } = {}) {
  const slut = Date.now() + timeout;
  while (Date.now() < slut) {
    if (villkor()) return;
    await new Promise(res => setTimeout(res, intervall));
  }
  throw new assert.AssertionError({ message: meddelande + ' (inom ' + timeout + ' ms)',
    actual: false, expected: true, operator: '==' });
}

const prov = (namn, fn) => test('nollstallning: ' + namn, { skip, timeout: 120000 }, fn);

// Startar sandning S2 over strommen och vantar ut BADE signalen och konfig-omhamtningen den
// utloser. Det ar omhamtningen som river och bygger om widgetarna; ett pastaende som gors fore den
// mater en bild som strax ritas over.
async function nySandning(sida) {
  const fore = r.lada.hamtningar;
  r.sandning('live:start', S2);
  await sida.waitForFunction(id => __las('vyra-live-session-aktiv') === id, S2, { timeout: 60000 });
  await vantaPa(() => r.lada.hamtningar > fore, 'den nya sandningen hamtade aldrig om konfigurationen');
  // Applicering och omritning ar asynkrona efter svaret — tva bildrutor och en kort marginal.
  await sida.waitForTimeout(600);
  await sida.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))));
}

// textContent, INTE innerText. Battle MVP vilar osynlig i overlayen (visibility:hidden, opacity 0
// tills den tands), och innerText av en dold nod ar tom — ett "namnet syns inte" hade da varit
// gront for att INGENTING syns. Det som mats ar vad noden BAR, det som visas nasta gang den tands.
const text = (sida, id) => sida.evaluate(i => {
  const box = document.querySelector(`.canvas [data-id="${i}"]`) || document.querySelector(`[data-id="${i}"]`);
  return box ? box.textContent.replace(/\s+/g, ' ').trim() : null;
}, id);

// ---- 1. BATTLE MVP ----------------------------------------------------------------------------
// Hela kedjan, inte triggern direkt: en match gar aktiv, en gava raknas, matchen tar slut, och
// battle-mvp-session.js kor fram MVP:n (efter sin facitvantan pa 1200 ms). Det namnet ar forra
// sandningens RIKTIGA tittare — det som inte far sta kvar nar nasta sandning borjar.
prov('battle MVP: forra sandningens vinnare star inte kvar efter live:start', async () => {
  r.lada.version = 1;
  r.lada.state = { widgets: [mvp()] };
  r.lada.session = { sessionId: S1, startedAt: '2026-08-25T09:00:00.000Z' };
  const sida = await oppnaOverlay();
  try {
    await sida.waitForFunction(id => __las('vyra-live-session-aktiv') === id, S1, { timeout: 60000 });
    r.live({ type: 'battle', battleStatus: 'active', battleId: 'b-forra' });
    r.live({ type: 'gift', giftName: 'Rose', username: 'forra_mvp', name: 'Forra Vinnaren',
      coins: 500, count: 1 });
    r.live({ type: 'battle', battleStatus: 'ended', battleId: 'b-forra' });
    await sida.waitForFunction(() => state.widgets.some(w => w.type === 'templateBattleMvp'
      && w.mvpName === 'Forra Vinnaren'), null, { timeout: 30000 });
    assert.match(await text(sida, 'm1'), /Forra Vinnaren/,
      'riggens match kronte aldrig nagon MVP pa skarmen — provet mater ingenting');

    // Laget I SIGNALOGONBLICKET, fore omhamtningen. Har kan servern inte ha bar MVP:ns namn (OBS
    // kan inte spara), sa omhamtningen ensam hade ocksa gett ratt slutbild — utan den har
    // matpunkten vore provet gront aven med battle-mvp-session.js lyssnare bortkopplad (uppmatt).
    // Lyssnaren registreras efter filens egen, sa den laser det filen just lamnat efter sig.
    await sida.evaluate(() => addEventListener('vyra-live-session', e => {
      if (e.detail && e.detail.event === 'live:start') {
        window.__mvpVidSignal = state.widgets.find(v => v.type === 'templateBattleMvp').mvpName;
      }
    }));
    r.lada.version += 1;                          // konfig-omhamtningen ska ge en ny revision
    await nySandning(sida);
    assert.equal(await sida.evaluate(() => window.__mvpVidSignal), mvp().mvpName,
      'live:start nollstallde inte vinnaren — det var omhamtningen som rattade bilden');

    const w = await sida.evaluate(() => {
      const x = state.widgets.find(v => v.type === 'templateBattleMvp');
      return { mvpName: x.mvpName, mvpScore: x.mvpScore };
    });
    assert.deepEqual(w, { mvpName: mvp().mvpName, mvpScore: mvp().mvpScore },
      'widgeten bar forra sandningens vinnare in i den nya');
    assert.doesNotMatch(await text(sida, 'm1'), /Forra Vinnaren/,
      'forra sandningens vinnare syns fortfarande pa scenen');
    assert.equal(await sida.evaluate(() => window.__markor), 'star-kvar', 'sidan laddades om');
    assert.deepEqual(sida.__fel, []);
  } finally { await sida.close() }
});

// Varianten som faktiskt intraffar nar Studio var oppen under forra sandningen: triggerBattleMvp
// kor save() dar, sa vinnarens namn ligger i den SPARADE layouten. OBS-kallan nollstaller i minnet
// vid live:start — och direkt efter hamtar den om just den layouten. Fragan ar om omhamtningen tar
// tillbaka det gamla namnet.
prov('battle MVP: ett vinnarnamn som Studio sparat i layouten kommer inte tillbaka med omhamtningen', async () => {
  r.lada.version = 1;
  r.lada.state = { widgets: [mvp({ mvpName: 'Sparad Vinnare', mvpScore: 4258 })] };
  r.lada.session = { sessionId: S1, startedAt: '2026-08-25T09:00:00.000Z' };
  const sida = await oppnaOverlay();
  try {
    await sida.waitForFunction(id => __las('vyra-live-session-aktiv') === id, S1, { timeout: 60000 });
    assert.match(await text(sida, 'm1'), /Sparad Vinnare/, 'utgangslaget ritades aldrig');

    // Servern nollstaller inte MVP-namnet (bara giftCurrent<i> och malen), sa layouten bar det
    // fortfarande. Versionen hojs anda: nagot annat i samma nollstallning andrades.
    r.lada.version += 1;
    await nySandning(sida);

    assert.doesNotMatch(await text(sida, 'm1'), /Sparad Vinnare/,
      'omhamtningen efter live:start ritade tillbaka forra sandningens vinnare ur den sparade layouten');
    assert.equal(await sida.evaluate(() => state.widgets.find(v => v.type === 'templateBattleMvp').mvpName),
      mvp().mvpName);

    // Namnet ar KONFIGURATION ocksa — en ny konfigrevision mitt i sandningen (agaren flyttar en
    // widget i Studio) far inte heller ta tillbaka det.
    r.lada.version += 1;
    const fore = r.lada.hamtningar;
    r.strommar.forEach(s => s.write(`event: konfig\ndata: ${JSON.stringify({ overlayId: OVERLAY_ID, revision: r.lada.version })}\n\n`));
    await vantaPa(() => r.lada.hamtningar > fore, 'konfigbeskedet hamtades aldrig');
    await sida.waitForTimeout(600);
    assert.doesNotMatch(await text(sida, 'm1'), /Sparad Vinnare/,
      'en senare konfigrevision i samma sandning ritade tillbaka forra sandningens vinnare');

    // Och en NY vinnare i den nya sandningen ska fortfarande kunna tandas — och sta kvar nar
    // Studio sparat den och OBS hamtar om. Vakten mot omhamtningen far bara galla forra
    // sandningens namn; raden nedan ar rod om den nollstaller aven den nya vinnaren.
    r.live({ type: 'battle', battleStatus: 'active', battleId: 'b-ny' });
    r.live({ type: 'gift', giftName: 'Rose', username: 'ny_mvp', name: 'Ny Vinnare', coins: 900, count: 1 });
    r.live({ type: 'battle', battleStatus: 'ended', battleId: 'b-ny' });
    await sida.waitForFunction(() => state.widgets.some(w => w.type === 'templateBattleMvp'
      && w.mvpName === 'Ny Vinnare'), null, { timeout: 30000 });
    r.lada.version += 1;
    r.lada.state = { widgets: [mvp({ mvpName: 'Ny Vinnare', mvpScore: 900 })] };
    const fore2 = r.lada.hamtningar;
    r.strommar.forEach(s => s.write(`event: konfig\ndata: ${JSON.stringify({ overlayId: OVERLAY_ID, revision: r.lada.version })}\n\n`));
    await vantaPa(() => r.lada.hamtningar > fore2, 'konfigbeskedet hamtades aldrig');
    await sida.waitForTimeout(600);
    assert.match(await text(sida, 'm1'), /Ny Vinnare/,
      'den nya sandningens vinnare nollstalldes av vakten mot omhamtningen');
    assert.equal(await sida.evaluate(() => window.__markor), 'star-kvar', 'sidan laddades om');
    assert.deepEqual(sida.__fel, []);
  } finally { await sida.close() }
});

// ---- 2. LAST-X --------------------------------------------------------------------------------
// Last-X haller sin ko pa widgetens DOM-nod (`box._lx`): ett kort visas, de andra vantar i
// `order`/`slots`. Kravet: kort som koats i forra sandningen far inte spelas upp i den nya.
//
// Konfig-omhamtningen bygger om widgeten, men den GAMLA noden ar inte dod for det — dess timers
// lever kvar, och nar kortet som visas gar ut tar advanceLX() nasta ur kon och skriver det till
// `w.lastXLatest` pa den NYA widgeten (liveWidget slar upp per id). Den skrivningen ar "senast
// sedda" som widgeten sedan ritar i vila. Kon maste alltsa tommas pa riktigt, inte bara forsvinna
// ur synfaltet.
prov('last-X: koade kort fran forra sandningen spelas inte upp i den nya', async () => {
  r.lada.version = 1;
  r.lada.state = { widgets: [lastX()] };
  r.lada.session = { sessionId: S1, startedAt: '2026-08-25T09:00:00.000Z' };
  const sida = await oppnaOverlay();
  try {
    await sida.waitForFunction(id => __las('vyra-live-session-aktiv') === id, S1, { timeout: 60000 });
    r.live({ type: 'gift', giftName: 'Rose', username: 'forra_givaren', coins: 5, count: 1 });
    await sida.waitForFunction(() => /forra_givaren/.test(
      document.querySelector('[data-id="lx1"] .last-x-name')?.textContent || ''), null, { timeout: 20000 });
    r.live({ type: 'like', username: 'forra_gillaren', count: 3 });
    r.live({ type: 'follow', username: 'forra_foljaren' });
    // Kon star nu med tva vantande kort bakom det som visas. Noden sparas — det ar den som bar dem.
    await sida.waitForFunction(() => {
      const box = document.querySelector('[data-id="lx1"]');
      return box && box._lx && box._lx.order.length === 2;
    }, null, { timeout: 20000 });
    await sida.evaluate(() => { window.__lxNod = document.querySelector('[data-id="lx1"]') });

    r.lada.version += 1;
    await nySandning(sida);

    const ko = await sida.evaluate(() => ({ order: [...window.__lxNod._lx.order],
      slots: Object.values(window.__lxNod._lx.slots).filter(Boolean).map(s => s.username) }));
    assert.deepEqual(ko, { order: [], slots: [] }, 'forra sandningens koade kort stod kvar i kon');

    // Och det synliga beviset: lat kortet som visades ga ut (15 s halltid + utgang) och se att
    // inget av de koade namnen dyker upp — varken pa skarmen eller i det widgeten minns.
    await sida.waitForTimeout(16500);
    const efter = await sida.evaluate(() => ({
      skarm: [...document.querySelectorAll('[data-id="lx1"] .last-x-name')].map(n => n.textContent).join('|'),
      minns: JSON.stringify(state.widgets.find(w => w.id === 'lx1').lastXLatest || {}),
    }));
    assert.doesNotMatch(efter.skarm + efter.minns, /forra_gillaren|forra_foljaren/,
      'ett kort fran forra sandningen spelades upp efter live:start: ' + JSON.stringify(efter));
    assert.equal(await sida.evaluate(() => window.__markor), 'star-kvar', 'sidan laddades om');
    assert.deepEqual(sida.__fel, []);
  } finally { await sida.close() }
});

// ---- 3. MALWIDGETEN ---------------------------------------------------------------------------
// tests/goal-mal-vid-ny-sandning.test.js bevisar att goal-client.js HAMTAR om snapshotet vid
// live:start. Har mats det som raknas: att SIFFRAN PA SKARMEN blir serverns resetvarde, utan
// omladdning. Serverns nollstallning publicerar ingen malram (goal-runtime.js) — snapshotet ar enda
// vagen, och utan det star forra sandningens progress kvar tills nasta liveevent knuffar den.
prov('malwidgeten visar serverns resetvarde efter live:start, utan omladdning', async () => {
  r.lada.version = 1;
  r.lada.state = { widgets: [mal()] };
  r.lada.mal = [malrad(0, 1)];
  r.lada.session = { sessionId: S1, startedAt: '2026-08-25T09:00:00.000Z' };
  const sida = await oppnaOverlay();
  const varde = () => sida.evaluate(() => (document.querySelector('[data-id="g1"] [data-goal-value]')
    ?.textContent || '').replace(/\s/g, ''));
  try {
    await sida.waitForFunction(id => __las('vyra-live-session-aktiv') === id, S1, { timeout: 60000 });
    r.malram(malrad(420, 2));                     // forra sandningens progress, som ram
    await sida.waitForFunction(() => (document.querySelector('[data-id="g1"] [data-goal-value]')
      ?.textContent || '').replace(/\s/g, '') === '420', null, { timeout: 20000 });

    // Serverns nollstallning: raden ar noll med hogre revision. Ingen ram gar ut, och overlayns
    // konfiguration rors inte (malet bor inte i layouten).
    r.lada.mal = [malrad(0, 3)];
    const malFore = r.lada.malHamtningar;
    await nySandning(sida);
    // Skarmen forst — det ar den som ar fragan. Uppmatt med lyssnaren i goal-client.js bortkopplad:
    // konfig-omhamtningen ritar om widgeten, men den ritas med storens gamla 420, inte med noll.
    await sida.waitForFunction(() => (document.querySelector('[data-id="g1"] [data-goal-value]')
      ?.textContent || '').replace(/\s/g, '') === '0', null, { timeout: 20000 }).catch(() => {});
    assert.equal(await varde(), '0', 'malwidgeten visar fortfarande forra sandningens progress');
    assert.ok(r.lada.malHamtningar > malFore, 'nollan kom utan att malsnapshotet hamtades om');
    assert.equal(await sida.evaluate(() => window.__markor), 'star-kvar', 'sidan laddades om');

    // Och den nya sandningen raknar vidare fran noll — en ram med hogre revision tas emot.
    r.malram(malrad(7, 4));
    await sida.waitForFunction(() => (document.querySelector('[data-id="g1"] [data-goal-value]')
      ?.textContent || '').replace(/\s/g, '') === '7', null, { timeout: 20000 });
    assert.deepEqual(sida.__fel, []);
  } finally { await sida.close() }
});

// ---- 4. GIFT CAMPAIGN I STUDIO-LAGET ----------------------------------------------------------
// gift-event-images.js skriver `widget['giftCurrent'+i] += count` rakt in i state.widgets — samma
// objekt som save() serialiserar. I OBS-laget ar projektionen skrivskyddad och konfig-omhamtningen
// ersatter raknaren med serverns nollstallda. I Studio-laget finns ingen omhamtning. Fragan:
//   a) hamnar raknaren i den sparade layouten?             (uppmatt nedan: ja, vid nasta save())
//   b) nollstalls den i Studios minne vid live:start?
// Ar svaret pa (b) nej skriver Studios nasta save() — vilken andring som helst — tillbaka forra
// sandningens rakning OVER serverns nollstallning, och OBS hamtar den med nasta konfigrevision.
prov('gift campaign i Studio: raknaren sparas med layouten och nollstalls vid live:start', async () => {
  const sida = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  sida.__fel = [];
  sida.on('pageerror', e => sida.__fel.push(String(e && e.message).slice(0, 160)));
  try {
    await sida.goto(`${bas}/studio.html`, { waitUntil: 'load' });
    await sida.waitForFunction(() => typeof render === 'function'
      && typeof save === 'function' && !!window.VyraLiveSession, null, { timeout: 30000 });
    // Spion pa sessionsagarens skrivvag — samma metod som angra-gor-om.browser.test.js. Oinloggad
    // svarar writeActive 'not-writable' och lagringen forblir tom, sa det som save() LAMNAR OVER ar
    // matpunkten. Det ar exakt den strang som annars gar till vyra-state och cloud-sync:s PUT.
    await sida.evaluate(() => {
      const riktig = window.VyraSessionState.writeActive.bind(window.VyraSessionState);
      window.__sparat = null;
      window.VyraSessionState.writeActive = (nyckel, varde) => {
        if (nyckel === 'vyra-state') window.__sparat = varde;
        return riktig(nyckel, varde);
      };
    });
    await sida.evaluate(async (w) => {
      view = 'editor';
      state.widgets = [w];
      render();
      await save();
    }, kampanj(0));
    const sparad = () => sida.evaluate(() => {
      const s = JSON.parse(window.__sparat || '{}');
      const w = (s.widgets || []).find(x => x.id === 'k1');
      return w ? { giftCurrent0: Number(w.giftCurrent0 || 0), giftName0: w.giftName0, giftTarget0: w.giftTarget0 } : null;
    });
    const iMinnet = () => sida.evaluate(() => {
      const w = state.widgets.find(x => x.id === 'k1');
      return { giftCurrent0: Number(w.giftCurrent0 || 0), giftName0: w.giftName0, giftTarget0: w.giftTarget0 };
    });
    assert.deepEqual(await sparad(), { giftCurrent0: 0, giftName0: 'Rose', giftTarget0: 10 },
      'utgangslaget sparades aldrig — provet mater ingenting');

    // Sandning 1 borjar och en gava kommer. Samma ingang som live-client.js ingest() tar.
    await sida.evaluate((id) => window.VyraLiveSession.runtime().behandla({ type: 'livesession',
      event: 'live:start', eventId: 'live:start:' + id, sessionId: id }), S1);
    await sida.evaluate(() => dispatchEvent(new CustomEvent('vyra-live-event', {
      detail: { type: 'gift', giftName: 'Rose', username: '@provgivare', coins: 10, count: 3 } })));
    assert.equal((await iMinnet()).giftCurrent0, 3, 'gavan raknades aldrig');

    // (a) Lyssnaren sparar inte sjalv — men nasta save(), fran vad som helst, tar med raknaren.
    assert.equal((await sparad()).giftCurrent0, 0, 'gavolyssnaren sparade layouten pa egen hand');
    await sida.evaluate(async () => { await save() });
    assert.equal((await sparad()).giftCurrent0, 3,
      'raknaren sparades INTE med layouten — da stammer inte premissen for resten av provet');

    // (b) Ny sandning. Servern har redan nollstallt giftCurrent<i> i sin kopia.
    await sida.evaluate((id) => window.VyraLiveSession.runtime().behandla({ type: 'livesession',
      event: 'live:start', eventId: 'live:start:' + id, sessionId: id }), S2);
    assert.deepEqual(await iMinnet(), { giftCurrent0: 0, giftName0: 'Rose', giftTarget0: 10 },
      'Studio bar forra sandningens kampanjrakning in i den nya');
    // Ingen egen sparning vid sandningsbytet: servern har redan nollan, och en PUT med Studios
    // gamla version hade bara gett en synkkonflikt mot serverns nollstallning.
    assert.equal((await sparad()).giftCurrent0, 3, 'sandningsbytet sparade layouten pa egen hand');

    // Nasta vanliga save() — agaren flyttar nagot — far inte skriva tillbaka den gamla rakningen.
    await sida.evaluate(async () => { state.widgets[0].x += 1; await save() });
    assert.equal((await sparad()).giftCurrent0, 0,
      'en vanlig sparning efter live:start skrev tillbaka forra sandningens rakning over serverns nolla');

    // Den nya sandningen raknar fran noll.
    await sida.evaluate(() => dispatchEvent(new CustomEvent('vyra-live-event', {
      detail: { type: 'gift', giftName: 'Rose', username: '@ny', coins: 10, count: 2 } })));
    assert.equal((await iMinnet()).giftCurrent0, 2);

    // live:end nollstaller INTE — sista siffran ska sta kvar pa skarmen.
    await sida.evaluate((id) => window.VyraLiveSession.runtime().behandla({ type: 'livesession',
      event: 'live:end', eventId: 'live:end:' + id, sessionId: id }), S2);
    assert.equal((await iMinnet()).giftCurrent0, 2, 'live:end raderade den nya sandningens rakning');
    assert.deepEqual(sida.__fel, []);
  } finally { await sida.close() }
});
