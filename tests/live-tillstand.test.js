'use strict';
// F04: EN TILLSTÅNDSMODELL FÖR LIVE — toppraden och LIVE-kontroll får inte säga emot varandra.
//
// Skärmbilden (granskning 34-live-kontroll.png): toppraden sa "TikTok ansluten · @jokero060" i
// grönt, samtidigt som LIVE-kontroll sa "SERVER Offline" och "TIKTOK Väntar på connector".
// Orsaken var två källor:
//   * Molnets connection.connected betyder att raden i tiktok_connections är AKTIV, alltså ett
//     sparat konto. Toppraden läste det som "ansluten".
//   * LIVE-kontroll drevs av vyra-server-status, som bara den lokala servern skickar. I webbläget
//     kom den aldrig, så korten stod kvar på sitt startläge.
// Nu bygger live-client.js en modell (VyraLive.tillstand) som båda läser. Grönt får bara visas när
// LIVE-händelser faktiskt kan komma fram.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROT, f), 'utf8');
const vanta = (ms = 20) => new Promise(r => setTimeout(r, ms));
// Varje fönster stängs efteråt: skrivbordsgrenen pollar var 650:e ms och håller annars processen vid liv.
const fonster = [];
test.after(() => { for (const w of fonster) { try { w.VyraLive?.stop?.() } catch {} try { w.close() } catch {} } });

const SIDHUVUD = '<header><button class="connect connection"><i></i><span>Anslut TikTok</span></button></header>'
  + '<aside></aside><h1 id="title"></h1><main id="view"></main>';

// Laddar den riktiga live-client.js. url avgör läget: localhost = skrivbord, annars webb.
function klient({ url = 'https://vyra.example/studio.html', connection = null, aktivSession = null, molnFel = false } = {}) {
  const dom = new JSDOM(`<!doctype html><body>${SIDHUVUD}</body>`, { url, runScripts: 'outside-only' });
  const w = dom.window;
  fonster.push(w);
  w.EventSource = class { addEventListener() {} close() {} };
  w.fetch = async () => { throw new Error('ingen lokal server i provet'); };
  w.toast = () => {}; w.state = {}; w.save = () => {};
  let session = aktivSession;
  w.VyraLiveSession = { runtime: () => ({ aktivSession: () => session, behandla() {} }) };
  w.VyraAuth = {
    lastDetail: () => ({ user: { emailVerified: true }, workspaces: [{ id: 'ws-1' }] }),
    api: async url => {
      if (url.endsWith('/tiktok-connection')) {
        if (molnFel) throw Object.assign(new Error('Serverfel'), { status: 503 });
        return { ok: true, connection, verifieringKravs: false };
      }
      return { ok: true };
    },
  };
  w.eval(las('live-client.js'));
  return { w, d: w.document, sattSession: s => { session = s; w.dispatchEvent(new w.CustomEvent('vyra-live-session', { detail: {} })); } };
}

let delad = null;
const bygg = (d, opt) => (delad || (delad = klient().w)).VyraLive.byggTillstand(d, opt);
const SPARAT = { connection: { connected: true, state: 'cloud', username: 'jokero060' } };

// ---- modellen -----------------------------------------------------------------------------------

test('modell webb: sparat konto utan livesession är INTE anslutet och inte grönt', () => {
  const m = bygg(SPARAT, { lage: 'webb' });
  assert.equal(m.lage, 'webb');
  assert.equal(m.konto, 'jokero060');
  assert.equal(m.connector, 'väntar');
  assert.equal(m.live, 'inte aktiv');
  assert.equal(m.text, 'TikTok-konto sparat · @jokero060');
  assert.equal(m.connectorText, 'Väntar på connector');
  assert.equal(m.gron, false);
});

test('modell webb: med aktiv livesession är connectorn ansluten och grön', () => {
  const m = bygg(SPARAT, { lage: 'webb', aktivSession: '11111111-1111-4111-8111-111111111111' });
  assert.equal(m.connector, 'ansluten');
  assert.equal(m.live, 'aktiv');
  assert.equal(m.text, 'Ansluten till LIVE · @jokero060');
  assert.equal(m.gron, true);
});

test('modell webb: SERVER-kortet säger aldrig "Offline" — det visar molnet neutralt', () => {
  const m = bygg(SPARAT, { lage: 'webb', online: false });
  assert.equal(m.server.namn, 'MOLNET');
  assert.equal(m.server.text, 'Webbläge');
  assert.equal(m.server.varning, false);
  const fel = bygg({ molnFel: true, connection: { connected: false, state: 'idle' } }, { lage: 'webb' });
  assert.equal(fel.server.text, 'Svarar inte');
  assert.equal(fel.server.varning, true);
  assert.equal(fel.text, 'Anslut TikTok');
});

test('modell desktop: ansluten, sparat-men-inte-anslutet, väntar och offline', () => {
  const ansluten = bygg({ connection: { connected: true, state: 'connected', username: '@x' } }, { lage: 'desktop', online: true });
  assert.equal(ansluten.connector, 'ansluten');
  assert.equal(ansluten.text, 'Ansluten till LIVE · @x');
  assert.equal(ansluten.gron, true);
  assert.equal(ansluten.server.text, 'Online');
  assert.equal(ansluten.server.varning, false);

  const sparat = bygg({ connection: { connected: false, state: 'idle', username: 'x' } }, { lage: 'desktop', online: true });
  assert.equal(sparat.connector, 'väntar');
  assert.equal(sparat.text, 'TikTok-konto sparat · @x');
  assert.equal(sparat.gron, false);

  const tomt = bygg({ connection: { connected: false, state: 'idle' } }, { lage: 'desktop', online: true });
  assert.equal(tomt.text, 'Anslut TikTok', 'viloläget måste vara exakt "Anslut TikTok" — e-postkravet skriver om just den texten');
  assert.equal(tomt.connectorText, 'Väntar på connector');

  const ansluter = bygg({ connection: { connected: false, state: 'reconnecting', reconnectAttempt: 3 } }, { lage: 'desktop', online: true });
  assert.equal(ansluter.connector, 'ansluter');
  assert.equal(ansluter.text, 'TikTok återansluter · försök 3');

  const offline = bygg({ connection: { connected: true, state: 'connected', username: 'x' } }, { lage: 'desktop', online: false });
  assert.equal(offline.connector, 'fel', 'ett gammalt "connected" får inte lysa när den lokala servern inte svarar');
  assert.equal(offline.gron, false);
  assert.equal(offline.server.text, 'Offline');
  assert.equal(offline.server.varning, true);
});

test('modell desktop: en paus är inte ett avbrott, men den är inte grön heller', () => {
  const m = bygg({ connection: { connected: true, state: 'paused', username: 'x' } }, { lage: 'desktop', online: true });
  assert.equal(m.connector, 'pausad');
  assert.equal(m.klass, 'pausad');
  assert.equal(m.text, 'Sändningen pausad');
  assert.equal(m.gron, false);
});

test('modell: grönt bara när connectorn är ansluten, i alla lägen', () => {
  const stater = ['idle', 'cloud', 'connected', 'connecting', 'reconnecting', 'stale', 'paused', 'suspended', 'failed'];
  for (const lage of ['webb', 'desktop']) for (const online of [null, true, false]) for (const state of stater)
    for (const aktivSession of [null, 'sess']) {
      const m = bygg({ connection: { connected: true, state, username: 'x' } }, { lage, online, aktivSession });
      assert.equal(m.gron, m.connector === 'ansluten', `${lage}/${state}/${online}/${aktivSession}`);
    }
});

test('modell: saknade fält kastar aldrig', () => {
  for (const d of [undefined, null, {}, { connection: null }, { connection: { state: 42 } }])
    for (const lage of ['webb', 'desktop'])
      assert.doesNotThrow(() => bygg(d, { lage }));
});

// ---- toppraden och LIVE-kontroll läser samma modell ---------------------------------------------

// Laddar studio-live.js (toppraden) och live-control.js (korten) ovanpå den riktiga klienten.
async function studio(opt) {
  const k = klient(opt);
  k.w.eval(las('studio-live.js'));
  k.w.eval(las('live-control.js'));
  await k.w.VyraLive.status();
  await vanta();
  k.w.VyraLiveControl.render();
  return k;
}
function avlas(d) {
  const chip = d.querySelector('.connection'), tik = d.querySelector('[data-lc-kort="tiktok"]'), srv = d.querySelector('[data-lc-kort="server"]');
  return {
    chipText: chip.querySelector('span').textContent, chipGron: chip.classList.contains('connected'),
    tikText: tik.querySelector('b').textContent, tikGron: tik.querySelector('i').classList.contains('ok'),
    tikKonto: tik.querySelector('.lc-konto').textContent, connector: tik.dataset.connector,
    serverNamn: srv.querySelector('small').textContent, serverText: srv.querySelector('b').textContent,
    serverVarnar: srv.querySelector('i').classList.contains('warn'),
  };
}

test('skärmbildens läge (webb, sparat konto, ingen LIVE): toppraden och korten säger samma sak', async () => {
  const { d } = await studio({ connection: { tiktok_username: 'jokero060', active: true } });
  const v = avlas(d);
  assert.equal(v.chipText, 'TikTok-konto sparat · @jokero060', 'toppraden påstår fortfarande en anslutning');
  assert.equal(v.chipGron, false, 'toppraden lyser grönt fast inga LIVE-händelser kan komma fram');
  assert.equal(v.tikText, 'Väntar på connector');
  assert.equal(v.tikGron, false);
  assert.equal(v.tikKonto, '@jokero060');
  assert.equal(v.serverNamn, 'MOLNET');
  assert.equal(v.serverText, 'Webbläge');
  assert.equal(v.serverVarnar, false, 'webbläget varnar för en lokal server som inte ska finnas');
});

test('webb: när servern startar en livesession blir BÅDA gröna samtidigt', async () => {
  const { d, sattSession } = await studio({ connection: { tiktok_username: 'jokero060', active: true } });
  sattSession('11111111-1111-4111-8111-111111111111');
  await vanta();
  const v = avlas(d);
  assert.equal(v.chipText, 'Ansluten till LIVE · @jokero060');
  assert.equal(v.chipGron, true);
  assert.equal(v.tikText, 'Ansluten');
  assert.equal(v.tikGron, true);
  assert.equal(v.connector, 'ansluten');
});

test('webb: inget sparat konto — "Anslut TikTok" och "Inget TikTok-konto sparat"', async () => {
  const { d } = await studio({ connection: null });
  const v = avlas(d);
  assert.equal(v.chipText, 'Anslut TikTok');
  assert.equal(v.chipGron, false);
  assert.equal(v.tikText, 'Väntar på connector');
  assert.equal(v.tikKonto, 'Inget TikTok-konto sparat');
});

test('webb: när molnet inte svarar varnar MOLNET-kortet, och inget är grönt', async () => {
  const { d } = await studio({ molnFel: true });
  const v = avlas(d);
  assert.equal(v.serverText, 'Svarar inte');
  assert.equal(v.serverVarnar, true);
  assert.equal(v.chipGron, false);
  assert.equal(v.tikGron, false);
});

test('desktop utan lokal server: SERVER Offline, och toppraden lyser inte', async () => {
  const k = klient({ url: 'http://localhost:5173/studio.html' });
  k.w.eval(las('studio-live.js'));
  k.w.eval(las('live-control.js'));
  await k.w.VyraLive.status().catch(() => {});
  await vanta();
  k.w.VyraLiveControl.render();
  const v = avlas(k.d);
  assert.equal(v.serverNamn, 'SERVER');
  assert.equal(v.serverText, 'Offline');
  assert.equal(v.serverVarnar, true);
  assert.equal(v.chipGron, false);
  assert.equal(v.tikGron, false);
});
