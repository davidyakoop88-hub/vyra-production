'use strict';
// EN DOMARE SOM BÅDE STUDION OCH OVERLAYN SER (§15, fortsättningen).
//
// UPPMÄTT 2026-08-20 mot OBS 32.2.1: en browser source har sin EGEN localStorage-rymd. Samma
// provsida, samma origin (127.0.0.1:8123), värde satt i Chrome — OBS hittade det inte. Se
// docs/live-verifiering.md punkt 5, avläst med OBS egen GetSourceScreenshot.
//
// Följden är att §15:s förarval inte når över gränsen. `vyra-automation-master` är en
// localStorage-nyckel som delas mellan FLIKAR via storage-event; OBS är ingen flik. Studion och
// overlayn ser aldrig varandras nyckel, så båda kan tro att de är förare samtidigt — precis det
// §15 stängde mellan flikar. Tittaren betalar två gånger och ser effekten två gånger.
//
// Den lokala servern i skrivbordsappen ser BÅDA: Studion och overlayn talar redan med
// 127.0.0.1:4173. Den blir därför domare när den finns, och localStorage är kvar som reserv för
// den som kör webben utan appen (Davids val A, 2026-08-20).
//
// Reglerna är avsiktligt IDENTISKA med vyra-masterval.js, annars vore det två sanningar:
//   · en färsk innehavare behåller platsen
//   · nivå 1 tar platsen även från en levande nivå 2 (studion vinner över overlayn)
//   · nivå 2 tar bara en ledig eller inaktuell plats
//   · inaktuell = ingen puls på 6 s, samma fönster som sceneOnline()
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { startLocalServer } = require('../local-server');

const ROOT = path.resolve(__dirname, '../..');
let server, origin;

test.before(async () => {
  server = await startLocalServer(ROOT, 4231);
  origin = 'http://127.0.0.1:4231';
});
test.after(async () => { if (server) await new Promise(r => server.close(r)) });

const krav = (kropp) => fetch(`${origin}/api/automation/master`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(kropp),
}).then(async r => ({ status: r.status, kropp: await r.json().catch(() => null) }));

test('första anspråket vinner platsen', async () => {
  const r = await krav({ nyckel: 'prov-a', tabId: 'studio-1', niva: 1 });
  assert.equal(r.status, 200, `oväntad status ${r.status}`);
  assert.equal(r.kropp.master, 'studio-1', `fick ${JSON.stringify(r.kropp)}`);
  assert.equal(r.kropp.jagArMaster, true, 'den som vann ska få veta det direkt i svaret');
});

test('en färsk innehavare behåller platsen mot samma nivå', async () => {
  await krav({ nyckel: 'prov-b', tabId: 'overlay-1', niva: 2 });
  const r = await krav({ nyckel: 'prov-b', tabId: 'overlay-2', niva: 2 });
  assert.equal(r.kropp.master, 'overlay-1', 'en levande innehavare på samma nivå ska inte petas');
  assert.equal(r.kropp.jagArMaster, false, 'utmanaren ska få veta att den INTE är förare');
});

test('nivå 1 tar platsen från en levande nivå 2 — studion vinner över overlayn', async () => {
  await krav({ nyckel: 'prov-c', tabId: 'overlay-1', niva: 2 });
  const r = await krav({ nyckel: 'prov-c', tabId: 'studio-1', niva: 1 });
  assert.equal(r.kropp.master, 'studio-1',
    'nivå 1 ska ta platsen även från en levande nivå 2 — samma regel som vyra-masterval.js');
  assert.equal(r.kropp.jagArMaster, true);
});

test('nivå 2 petar aldrig en levande nivå 1', async () => {
  await krav({ nyckel: 'prov-d', tabId: 'studio-1', niva: 1 });
  const r = await krav({ nyckel: 'prov-d', tabId: 'overlay-1', niva: 2 });
  assert.equal(r.kropp.master, 'studio-1', 'overlayn ska inte kunna ta över från studion');
  assert.equal(r.kropp.jagArMaster, false);
});

test('en inaktuell plats tas över — annars vore en stängd flik en död automation', async () => {
  await krav({ nyckel: 'prov-e', tabId: 'gammal-flik', niva: 2, __nuForProv: Date.now() - 7000 });
  const r = await krav({ nyckel: 'prov-e', tabId: 'ny-flik', niva: 2 });
  assert.equal(r.kropp.master, 'ny-flik',
    'ingen puls på 7 s (>6 s TTL) ska räknas som ledig plats');
});

test('två nycklar är två oberoende val — automationen och rösten delar inte förare', async () => {
  await krav({ nyckel: 'automation', tabId: 'studio-1', niva: 1 });
  const r = await krav({ nyckel: 'rost', tabId: 'overlay-1', niva: 1 });
  assert.equal(r.kropp.master, 'overlay-1',
    'rösten har omvänd prioritet och måste kunna ha en annan förare än automationen');
});

test('platsen går att lämna direkt när en flik stängs', async () => {
  await krav({ nyckel: 'prov-f', tabId: 'flik-1', niva: 1 });
  const lamna = await fetch(`${origin}/api/automation/master`, {
    method: 'DELETE', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nyckel: 'prov-f', tabId: 'flik-1' }),
  });
  assert.equal(lamna.status, 200, 'DELETE ska gå att anropa vid pagehide');
  const r = await krav({ nyckel: 'prov-f', tabId: 'flik-2', niva: 2 });
  assert.equal(r.kropp.master, 'flik-2',
    'efter ett avsked ska nästa flik få platsen utan att vänta ut TTL:en');
});

test('en annan flik kan inte lämna någon annans plats', async () => {
  await krav({ nyckel: 'prov-g', tabId: 'agare', niva: 1 });
  await fetch(`${origin}/api/automation/master`, {
    method: 'DELETE', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nyckel: 'prov-g', tabId: 'inkraktare' }),
  });
  const r = await krav({ nyckel: 'prov-g', tabId: 'utmanare', niva: 2 });
  assert.equal(r.kropp.master, 'agare',
    'ett avsked från fel tabId ska inte frigöra platsen — annars kan vem som helst peta föraren');
});

test('trasig indata avvisas i stället för att bli en tom förare', async () => {
  for (const kropp of [{}, { nyckel: 'x' }, { tabId: 'y' }, { nyckel: '', tabId: 'z', niva: 1 }]) {
    const r = await krav(kropp);
    assert.equal(r.status, 400,
      `${JSON.stringify(kropp)} gav ${r.status} — utan nyckel och tabId finns inget val att göra`);
  }
});
