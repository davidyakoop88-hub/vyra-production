'use strict';
// SERVERNS KLOCKA — händelsers ålder räknas i serverns tid, inte PC-klockans.
//
// LIVE 2026-10-17: Like Fountain gjorde ingenting. Användarens PC-klocka gick ~+20 s före verklig
// tid (NTP-mätningar i TikTok LIVE Studios logg). `at`/`timestamp` stämplas av bryggan och servern
// med SERVERNS klocka, och like-fountain-portal.js kastar allt äldre än 15 s mot Date.now() — varje
// like såg 20 s gammal ut och kastades. battle-fx-auto.js (30 s) hade bara 10 s marginal kvar.
//
// live-client.js mäter nu skillnaden med Date-headern på ett vanligt svar och exponerar
// VyraLive.serverNu(). Proven kör den riktiga live-client.js med en PC-klocka som går 20 s FÖRE
// respektive EFTER servern, och kräver:
//   - en färsk like släpps igenom (ger hjärtan) och en färsk boost kastas inte
//   - en händelse som verkligen är gammal kastas fortfarande (historik vid sidladdning)
//   - utan mätning blir det dagens beteende, och det sägs i konsolen
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROT, f), 'utf8');
const vanta = (ms = 30) => new Promise(r => setTimeout(r, ms));
const fonster = [];
test.after(() => { for (const w of fonster) { try { w.VyraLive?.stop?.() } catch {} try { w.close() } catch {} } });

// Nodens klocka spelar SERVERNS roll; fönstrets Date.now() är PC-klockan, förskjuten `skew` ms.
const serverNu = () => Date.now();

function klient({ skew = 0, url = 'https://vyra.example/studio.html', medDatum = true, pcKlocka = { skew } } = {}) {
  const dom = new JSDOM('<!doctype html><body><header></header><main id="view"></main></body>', { url, runScripts: 'outside-only' });
  const w = dom.window;
  fonster.push(w);
  const pc = w.Date.now.bind(w.Date);
  w.Date.now = () => pc() + pcKlocka.skew;
  const loggar = [];
  w.console.warn = (...a) => loggar.push(a.join(' '));
  w.console.info = (...a) => loggar.push(a.join(' '));
  const anrop = [];
  w.fetch = async u => {
    anrop.push(String(u));
    await vanta(5); // lite fram-och-tillbaka-tid
    return { ok: true, status: 200, json: async () => ({ events: [] }),
      headers: { get: k => (medDatum && String(k).toLowerCase() === 'date' ? new Date(serverNu()).toUTCString() : null) } };
  };
  w.EventSource = class { addEventListener() {} close() {} };
  w.toast = () => {}; w.state = {}; w.save = () => {};
  w.VyraLiveSession = { runtime: () => ({ aktivSession: () => null, behandla() {} }) };
  w.VyraAuth = { lastDetail: () => ({ user: { emailVerified: true }, workspaces: [] }), api: async () => ({ ok: true }) };
  w.eval(las('live-client.js'));
  return { w, loggar, anrop };
}

// Konsumentfilerna laddas i SAMMA fönster, via sin module.exports-gren: det är precis den funktion
// som vyra-live-event-lyssnaren och routeLiveBattleEvent-länken anropar, med window.VyraLive synlig.
function modul(w, fil) {
  w.module = { exports: {} };
  w.eval(las(fil));
  const m = w.module.exports; delete w.module;
  return m;
}

async function uppmatt(w) {
  for (let i = 0; i < 100 && !w.VyraLive.klocka(); i++) await vanta(10);
  assert.ok(w.VyraLive.klocka(), 'ingen servertid uppmätt');
}

for (const skew of [20000, -20000]) {
  const namn = skew > 0 ? 'PC-klockan +20 s' : 'PC-klockan −20 s';

  test(`${namn}: serverNu() följer servern, inte PC-klockan`, async () => {
    const { w, loggar } = klient({ skew });
    await uppmatt(w);
    const fel = w.VyraLive.serverNu() - serverNu();
    assert.ok(Math.abs(fel) <= 1500, `serverNu ligger ${fel} ms fel (PC ${skew} ms)`);
    const k = w.VyraLive.klocka();
    assert.ok(Math.abs(k.skillnadMs + skew) <= 1500, `skillnaden ${k.skillnadMs} ms, väntat ${-skew}`);
    assert.ok(loggar.some(l => /servertid uppmatt/.test(l)), 'mätningen loggas inte');
    assert.ok(Math.abs(w.VyraLive.alder({ at: serverNu() - 5000 }) - 5000) <= 1500);
  });

  test(`${namn}: en färsk like ger hjärtan, en riktigt gammal kastas`, async () => {
    const { w } = klient({ skew });
    await uppmatt(w);
    const P = modul(w, 'like-fountain-portal.js');
    assert.equal(P.arFarskLike({ type: 'like', count: 5, at: serverNu() }), true, 'färsk like kastades');
    assert.equal(P.arFarskLike({ type: 'like', count: 5, at: serverNu() - 3000 }), true, 'like 3 s gammal kastades');
    assert.equal(P.arFarskLike({ type: 'like', count: 5, at: serverNu() - 60000 }), false, 'like 60 s gammal släpptes igenom');
    // 25 s: färsk för en PC som går 20 s efter, men historik i verklig tid.
    assert.equal(P.arFarskLike({ type: 'like', count: 5, at: serverNu() - 25000 }), false, 'like 25 s gammal släpptes igenom');
    assert.equal(P.arFarskLike({ type: 'like', timestamp: new Date(serverNu() - 60000).toISOString() }), false);
  });

  test(`${namn}: battle-fx kastar inte en färsk boost, men en riktigt gammal`, async () => {
    const { w } = klient({ skew });
    await uppmatt(w);
    const fx = modul(w, 'battle-fx-auto.js');
    assert.equal(fx.forGammal({ type: 'glove', multiplier: 2, timestamp: serverNu(), id: 'b1' }), false, 'färsk boost kastades');
    assert.equal(fx.forGammal({ type: 'glove', multiplier: 2, timestamp: serverNu() - 15000, id: 'b2' }), false, 'boost 15 s gammal kastades');
    assert.equal(fx.forGammal({ type: 'glove', multiplier: 2, timestamp: serverNu() - 60000, id: 'b3' }), true, 'boost 60 s gammal spelades');
    assert.equal(fx.forGammal({ type: 'glove', multiplier: 2, timestamp: serverNu() - 45000, id: 'b4' }), true, 'boost 45 s gammal spelades');
  });
}

test('skrivbordsläget mäter på pollens svar, utan extra anrop', async () => {
  const { w, anrop } = klient({ skew: 20000, url: 'http://localhost:8787/studio.html' });
  w.VyraLive.start();
  await uppmatt(w);
  w.VyraLive.stop();
  assert.ok(Math.abs(w.VyraLive.serverNu() - serverNu()) <= 1500);
  assert.ok(anrop.every(u => u.startsWith('/api/')), `oväntade anrop: ${anrop.join(', ')}`);
});

test('webbläget mäter mot /health/live och flyttar inga fält mot servern', async () => {
  const { w, anrop } = klient({ skew: 20000 });
  await uppmatt(w);
  assert.ok(anrop.includes('/health/live'), `anrop: ${anrop.join(', ')}`);
});

test('utan Date-header: dagens beteende (PC-klockan), och det sägs i konsolen', async () => {
  const { w, loggar } = klient({ skew: 20000, medDatum: false });
  await vanta(60);
  assert.equal(w.VyraLive.klocka(), null);
  const fore = w.Date.now(), nu = w.VyraLive.serverNu(), efter = w.Date.now();
  assert.ok(nu >= fore && nu <= efter, 'utan mätning ska serverNu vara Date.now()');
  assert.ok(loggar.some(l => /ingen servertid uppmatt/.test(l)), 'reserven loggas inte');
  const P = modul(w, 'like-fountain-portal.js');
  assert.equal(P.arFarskLike({ type: 'like', at: w.Date.now() }), true);
});

test('en omställd PC-klocka börjar om mätningen i stället för att fastna', async () => {
  const pcKlocka = { skew: 20000 };
  const { w } = klient({ url: 'http://localhost:8787/studio.html', pcKlocka });
  w.VyraLive.start();
  try {
    await uppmatt(w);
    assert.ok(Math.abs(w.VyraLive.serverNu() - serverNu()) <= 1500);
    pcKlocka.skew = -40000; // användaren (eller NTP) ställer om klockan mitt i sändningen
    for (let i = 0; i < 100 && Math.abs(w.VyraLive.serverNu() - serverNu()) > 1500; i++) await vanta(20);
    assert.ok(Math.abs(w.VyraLive.serverNu() - serverNu()) <= 1500, `fastnade på gamla skillnaden: ${w.VyraLive.serverNu() - serverNu()} ms`);
  } finally { w.VyraLive.stop(); }
});
