'use strict';
// Nivåminnet, och varför det bor här och inte i webbläsaren.
//
// fan-level-session.js höll senast sedda nivå i en Map i RAM. Den dog med sidan, så en höjning
// kunde bara upptäckas om SAMMA tittare syntes TVÅ gånger i SAMMA sändning — och fanklubbsnivå
// rör sig på veckor, inte på minuter. Widgeten var därför tyst i praktiken.
//
// Uppmätt hos konkurrenten (TikControl, Davids egen installation 2026-08-07): deras level-up-widget
// har `minLevel: 1`, `maxLevel: 50` och INGA intjäningsregler alls — de visar TikToks nivå, precis
// som vi. Skillnaden är att de jämför mot ett värde som ligger kvar mellan sändningar. Det är hela
// mekanismen, inte en bättre datakälla.
//
// Serversidan äger minnet i stället för webbläsaren av ett hårt skäl: session-state.js gör den flik
// som inte äger låset skrivskyddad (`mode = 'studio-readonly'`), och under en sändning är det ofta
// överlägget i OBS som kör bredvid en öppen Studio. En ledger som måste skrivas vid varje event kan
// inte ligga där. Ingesten ser varje event oavsett vilken flik som är öppen.
const test = require('node:test'), assert = require('node:assert/strict');
const { createViewerLevels, avgorHojning } = require('../viewer-levels');

// ---- 1. den rena beslutsregeln ----------------------------------------------------------------
test('en höjning ger från och till', () => {
  assert.deepEqual(avgorHojning(3, 7), { from: 3, to: 7 });
});

test('oförändrad nivå är tyst', () => {
  assert.equal(avgorHojning(7, 7), null);
});

test('sänkt nivå är tyst', () => {
  assert.equal(avgorHojning(9, 4), null,
    'en sänkning ska aldrig ge en alert — fanklubbsnivå kan gå ner när ett medlemskap löper ut');
});

test('första gången lär bara in', () => {
  assert.equal(avgorHojning(null, 5), null,
    'utan ett tidigare värde finns ingen höjning att visa; det gäller en gång per tittare NÅGONSIN nu');
  assert.equal(avgorHojning(undefined, 5), null);
});

test('nivå utanför 1-50 räknas som ingen nivå', () => {
  // 0 = TikTok rapporterade ingen nivå. Den som inte gått med i fanklubben har ingen `fansClub`
  // i payloaden alls, och 0 får aldrig se ut som en sänkning från 12.
  [0, -3, 51, 999, NaN, Infinity, 2.5, '7', null, undefined].forEach(v => {
    assert.equal(avgorHojning(3, v), null, `${String(v)} behandlades som en riktig nivå`);
  });
});

test('ett giltigt spann godtas i sin helhet', () => {
  assert.deepEqual(avgorHojning(1, 50), { from: 1, to: 50 });
});

// ---- 2. mot lagret, med injicerad query --------------------------------------------------------
// Samma injektionsstil som goal-ingest.js: ingen modulnivå-pool, så ordningen och felsemantiken går
// att testa utan databas.
function fejk(lagrat = {}) {
  const anrop = [];
  const query = async (sql, params) => {
    anrop.push({ sql, params });
    const nyckel = params[0] + '|' + params[1];
    const forra = lagrat[nyckel] || { fan_level: null, gifter_level: null };
    // Lagret är monotont: högsta sedda vinner, så en tillfällig nolla inte skapar en falsk höjning.
    const nyFan = Math.max(Number(params[2]) || 0, forra.fan_level || 0);
    const nyGifter = Math.max(Number(params[3]) || 0, forra.gifter_level || 0);
    lagrat[nyckel] = { fan_level: nyFan, gifter_level: nyGifter };
    return { rows: [{ forra_fan: forra.fan_level, forra_gifter: forra.gifter_level }] };
  };
  return { query, anrop, lagrat };
}

const event = (over = {}) => ({ type: 'gift', username: 'tittare', userId: 'u1',
  fanClubLevel: 0, gifterLevel: 0, ...over });

test('en höjning över två sändningar upptäcks vid FÖRSTA eventet i den andra', async () => {
  const f = fejk();
  const levels = createViewerLevels({ query: f.query });

  const forsta = await levels.applyEvent('ws1', event({ fanClubLevel: 4 }));
  assert.equal(forsta.fanLevelUp, null, 'första gången ska bara lära in');

  // Ny sändning, ny sida, inget i minnet — men lagret minns.
  const andra = await levels.applyEvent('ws1', event({ fanClubLevel: 6 }));
  assert.deepEqual(andra.fanLevelUp, { from: 4, to: 6 },
    'det är precis det här RAM-kartan aldrig kunde göra');
});

test('fan- och gifternivå är skilda spår', async () => {
  const f = fejk();
  const levels = createViewerLevels({ query: f.query });
  await levels.applyEvent('ws1', event({ fanClubLevel: 2, gifterLevel: 10 }));
  const ut = await levels.applyEvent('ws1', event({ fanClubLevel: 2, gifterLevel: 12 }));
  assert.equal(ut.fanLevelUp, null, 'fanklubbsnivån rördes inte men rapporterades som höjd');
  assert.deepEqual(ut.gifterLevelUp, { from: 10, to: 12 });
});

test('två arbetsytor delar aldrig minne', async () => {
  const f = fejk();
  const levels = createViewerLevels({ query: f.query });
  await levels.applyEvent('ws1', event({ fanClubLevel: 8 }));
  const annan = await levels.applyEvent('ws2', event({ fanClubLevel: 8 }));
  assert.equal(annan.fanLevelUp, null,
    'ws2 såg tittaren för första gången och ska lära in, inte ärva ws1:s nivå');
  assert.equal(f.anrop[0].params[0], 'ws1');
  assert.equal(f.anrop[1].params[0], 'ws2');
});

test('en nolla skriver inte över en lagrad nivå', async () => {
  const f = fejk();
  const levels = createViewerLevels({ query: f.query });
  await levels.applyEvent('ws1', event({ fanClubLevel: 12 }));
  await levels.applyEvent('ws1', event({ fanClubLevel: 0 }));      // chattevent utan fansClub
  const ut = await levels.applyEvent('ws1', event({ fanClubLevel: 13 }));
  assert.deepEqual(ut.fanLevelUp, { from: 12, to: 13 },
    'nollan sänkte det lagrade värdet, så höjningen mättes från fel siffra');
});

test('ett event helt utan nivåer rör inte lagret alls', async () => {
  const f = fejk();
  const levels = createViewerLevels({ query: f.query });
  const ut = await levels.applyEvent('ws1', event());
  assert.deepEqual(ut, { fanLevelUp: null, gifterLevelUp: null });
  assert.equal(f.anrop.length, 0,
    'varje chattrad hade blivit en skrivning — det är livevägen, den ska inte kosta en query');
});

test('en tittare utan identitet ignoreras', async () => {
  const f = fejk();
  const levels = createViewerLevels({ query: f.query });
  const ut = await levels.applyEvent('ws1', { type: 'gift', fanClubLevel: 5, username: '', userId: '' });
  assert.deepEqual(ut, { fanLevelUp: null, gifterLevelUp: null });
  assert.equal(f.anrop.length, 0);
});

test('ett databasfel tystar nivåerna men kastar inte', async () => {
  // Livevägen får inte falla för att nivåminnet strular: gåvan ska nå widgetarna ändå.
  const levels = createViewerLevels({ query: async () => { throw new Error('pg nere') } });
  const ut = await levels.applyEvent('ws1', event({ fanClubLevel: 5 }));
  assert.deepEqual(ut, { fanLevelUp: null, gifterLevelUp: null });
});
