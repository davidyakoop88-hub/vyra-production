'use strict';
// Gifter Level Up: hela kedjan fran en riktig gavohandelse till patchad DOM.
//
//   VyraLive.ingest -> routeLiveBattleEvent -> gifter-level-session (lokal ko)
//   -> kowrappern i runtime-controls -> VyraAlertQueue (global ko) -> job.run()
//   -> triggerGifterLevelUp -> riktad DOM-patch
//
// VARFOR PROVET FINNS. Widgeten dömdes 2026-08-10 som "fardig grafik utan live-trigger" — fyra
// widgetar har haft just det felet. Den domen var FEL, och tva matfel gav den:
//
//   1. Fel ingang. ingest() EMITTAR 'vyra-live-event' OCH ANROPAR routeLiveBattleEvent som tva
//      syskon; den ena leder inte till den andra. Ett prov som skickar DOM-handelsen nar aldrig
//      Gifter Level.
//   2. For kort fonster. Den globala kon spelar ETT alert i taget och haller sloten i
//      job.duration. Uppmatt: jobbet lag 4,7 s och vantade, och tandes sedan korrekt. Ett
//      fyrasekundersprov sag ingenting och hade dragit fel slutsats.
//
// Provet vantar darfor INTE sex sekunder pa riktigt. Det lagger ett eget kort blockerande alert
// forst: vantetiden for vart jobb ar den FORESTAENDE jobbets duration, inte vart eget. Da provas
// serialiseringen deterministiskt utan att sviten star still.
const test = require('node:test'), assert = require('node:assert/strict');
const { servera } = require('../rigg/servera.js');

let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

async function startaWebblasare() {
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ channel }) } catch (_) {}
  }
  try { return await chromium.launch() } catch (_) {}
  return null;
}

let browser;
let skip = chromium ? false : 'playwright-core saknas — kor `npm i` (hoppar, faller inte)';

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) skip = 'ingen Chrome/Edge/Chromium hittades pa maskinen (hoppar, faller inte)';
});
test.after(async () => { if (browser) await browser.close() });

const BLOCKERARE_MS = 400;   // kort med flit: vantetiden ar DENNA, inte Gifter-jobbets 6000

async function oppnaStudio() {
  const rigg = await servera();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${rigg.bas}/studio.html?open=layout`, { waitUntil: 'load', timeout: 120000 });

  // VILLKORSSTYRD vantan, inte en fast. Kowrapparna installeras vid 500 ms, 2200 ms och load,
  // och matningen maste ske EFTER det — annars mats rafunktionen och kon provas aldrig.
  //
  // Har stod forst `setTimeout(6000)`. Det var ett TIDSANTAGANDE av precis den sort provet
  // finns for att avskaffa, och med tva provfall kostade det tolv sekunder ren vantan. Nu vantar
  // vi pa att sakerna FINNS i stallet for pa att klockan gatt.
  //
  // Wrappern kanns igen pa att den namner VyraAlertQueue; ratriggern i media.js gor det inte.
  await page.waitForFunction(() =>
    typeof window.VyraLive?.ingest === 'function'
    && !!window.VyraGifterLevel
    && typeof window.VyraAlertQueue?.push === 'function'
    && typeof window.triggerGifterLevelUp === 'function'
    && String(window.triggerGifterLevelUp).includes('VyraAlertQueue'),
  null, { timeout: 60000, polling: 100 });

  return { rigg, context, page, stang: async () => { await context.close(); await rigg.stang() } };
}

// Kor hela forloppet i sidan och returnerar en tidsstamplad logg.
// RIKTIG FUNKTION, inte en strang: page.evaluate() med en strang behandlar den som ett UTTRYCK
// och skickar inga argument — forsta versionen returnerade darfor sjalva pilfunktionen, som inte
// gar att serialisera, och matningen blev undefined. Samma fella som i #175.
async function FORLOPP(blockerareMs) {
  const T0 = performance.now(), nu = () => Math.round(performance.now() - T0);
  const logg = [];

  state.widgets.length = 0;
  const w = VyraWidgets.create('catalog:gifterlevel:profile');
  w.x = 60; w.y = 60; w.width = 320;
  state.widgets.push(w);
  selected = null;
  render();
  await new Promise(r => setTimeout(r, 600));

  const nod = document.querySelector('[data-id="' + w.id + '"]');
  if (!nod) return { nodSaknas: true };

  // Ogonblicksbild av widgetobjektet: livevagen far inte rora det.
  const foreObjekt = JSON.parse(JSON.stringify(w));

  // Rakna skrivningar till sessionen. save() ska aldrig anropas av en gavohandelse.
  let skrivningar = 0;
  const wa = window.VyraSessionState && window.VyraSessionState.writeActive;
  if (wa) window.VyraSessionState.writeActive = function () { skrivningar++; return wa.apply(this, arguments) };

  // Observera KOn: nar pushas jobbet, och nar kors det?
  const pushInre = window.VyraAlertQueue.push;
  window.VyraAlertQueue.push = function (run, duration, priority) {
    logg.push({ ms: nu(), steg: 'push', duration, priority });
    const varvad = function () {
      logg.push({ ms: nu(), steg: 'run:fore', priority,
        niva: document.querySelector('[data-id="' + w.id + '"] .gifter-level-badge strong')?.textContent });
      const ut = run.apply(this, arguments);
      const n2 = document.querySelector('[data-id="' + w.id + '"]');
      logg.push({ ms: nu(), steg: 'run:efter', priority,
        niva: n2?.querySelector('.gifter-level-badge strong')?.textContent,
        namn: n2?.querySelector('h3')?.textContent,
        aktiv: !!n2?.classList.contains('gifter-active') });
      return ut;
    };
    return pushInre.call(this, varvad, duration, priority);
  };

  window.VyraGifterLevel && window.VyraGifterLevel.glom && window.VyraGifterLevel.glom();

  // Ett eget alert tar sloten forst. Hog prioritet sa det inte trangs undan.
  window.VyraAlertQueue.push(() => { logg.push({ ms: nu(), steg: 'blockerare kor' }) }, blockerareMs, 99);

  const via = (niva, id) => window.VyraLive.ingest({
    id, type: 'gift', giftName: 'Rose', coins: 100,
    username: 'Stigaren', nickname: 'Stigaren', gifterLevel: niva });

  logg.push({ ms: nu(), steg: 'ingest 41' }); via(41, 'kq1');
  await new Promise(r => setTimeout(r, 120));
  logg.push({ ms: nu(), steg: 'ingest 42' }); via(42, 'kq2');

  // Medan blockeraren haller sloten far Gifter-jobbet INTE ha kort.
  await new Promise(r => setTimeout(r, Math.max(60, blockerareMs - 250)));
  const mittI = { ms: nu(), korde: logg.some(l => l.steg === 'run:efter' && l.priority === 8) };

  // Vanta ut blockeraren med god marginal, men langt fran sex sekunder.
  await new Promise(r => setTimeout(r, blockerareMs + 900));

  const slut = document.querySelector('[data-id="' + w.id + '"]');
  return {
    logg, mittI, skrivningar,
    foreObjekt, efterObjekt: JSON.parse(JSON.stringify(w)),
    slutDom: slut ? { klasser: slut.className } : null,
  };
}

test('en riktig gavohandelse tander Gifter Level Up genom bada koerna',
  { skip, timeout: 180000 }, async () => {
    const s = await oppnaStudio();
    try {
      const m = await s.page.evaluate(FORLOPP, BLOCKERARE_MS);
      assert.ok(!m.nodSaknas, 'kontrollmatning: widgetnoden renderades inte');

      const push = m.logg.find(l => l.steg === 'push' && l.priority === 8);
      const kord = m.logg.find(l => l.steg === 'run:efter' && l.priority === 8);

      // KONTROLLMATNING. Utan den kan provet bli tyst gront pa en kedja som aldrig kordes —
      // exakt den fallan som lat widgeten se dod ut i tva matningar.
      assert.ok(push, 'Gifter Level-jobbet lades aldrig i den globala kon (priority 8):\n' +
        JSON.stringify(m.logg, null, 1));
      assert.equal(push.duration, 6000,
        'kowrappern kade jobbet med fel visningstid — runtime-controls sager 6000');
      assert.ok(kord, 'job.run() kordes aldrig:\n' + JSON.stringify(m.logg, null, 1));

      // Serialiseringen: jobbet ska VANTA medan blockeraren haller sloten.
      assert.equal(m.mittI.korde, false,
        `Gifter-jobbet kordes redan vid ${m.mittI.ms} ms, medan blockeraren holl sloten — ` +
        'den globala kon spelar ett alert i taget, och det ar hela dess syfte');
      const blockKorde = m.logg.find(l => l.steg === 'blockerare kor');
      assert.ok(blockKorde && kord.ms > blockKorde.ms,
        'jobbet kordes inte EFTER blockeraren');

      // DOM-patchen, pa ratt nod och med ratt innehall.
      assert.equal(kord.aktiv, true, 'noden fick aldrig klassen gifter-active');
      // gifterPatcha skriver namnet till <h3>; .gifter-level-name finns inte i markupen.
      assert.match(String(kord.namn), /Stigaren/, `namnet nadde inte fram — "${kord.namn}"`);
      // fromLevel 41 -> level 42. Bada langt fran widgetens standard (15), sa utfallen gar att
      // skilja at: med standardvarden hade badgen sett likadan ut vare sig den patchades.
      assert.match(String(kord.niva), /41/,
        `nivan visar inte fromLevel 41 — "${kord.niva}" (fore: "${kord.fore}")`);
      // assert.notMatch finns inte i den har Node-versionen; ok() med negerat villkor gor samma
      // sak och sager varfor.
      assert.ok(!/14 → 15/.test(String(kord.niva)),
        `badgen star kvar pa widgetens standardvarde "${kord.niva}", alltsa opatchat`);
    } finally { await s.stang() }
  });

test('livevagen ror varken widgetobjektet eller sparad state',
  { skip, timeout: 180000 }, async () => {
    const s = await oppnaStudio();
    try {
      const m = await s.page.evaluate(FORLOPP, BLOCKERARE_MS);
      assert.ok(!m.nodSaknas, 'kontrollmatning: widgetnoden renderades inte');
      assert.ok(m.logg.some(l => l.steg === 'run:efter' && l.priority === 8),
        'kontrollmatning: kedjan kordes inte, sa provet sager inget om skrivningar');

      // Nivan ar live-data. Hamnar den pa widgeten foljer varje gava med in i den sparade
      // layouten och blir ett angra-steg — samma skuld som tech-debt §3.
      assert.deepEqual(m.efterObjekt, m.foreObjekt,
        'widgetobjektet andrades av en gavohandelse');
      assert.equal(m.skrivningar, 0,
        'livevagen anropade skrivmonopolet — en gava ar ingen layoutandring');
    } finally { await s.stang() }
  });
