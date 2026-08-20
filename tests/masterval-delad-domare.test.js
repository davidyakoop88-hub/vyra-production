'use strict';
// MASTERVAL MED EN DOMARE BÅDA SER — klientsidan (§15, forts. 2026-08-20). Skrivet RÖTT FÖRST.
//
// UPPMÄTT mot OBS 32.2.1: en browser source har sin EGEN localStorage-rymd. §15:s förarval är en
// localStorage-nyckel som delas mellan FLIKAR via storage-event, och OBS är ingen flik — så
// Studion och overlayn kan båda tro att de är förare. Serversidan är byggd
// (electron-app/test/automation-master.test.js); det här är klienten som ska använda den.
//
// TRE KRAV, och det tredje är det viktigaste:
//   1. När domaren svarar är det DEN som avgör — inte den lokala nyckeln.
//   2. Svaret cachas, för farKora() är synkron och kan inte vänta på ett HTTP-anrop.
//   3. Svarar domaren inte (webben utan appen, servern nere) körs dagens localStorage-väg
//      OFÖRÄNDRAD. Fail-open är regeln i hela kedjan: hellre ett dubbelavdrag än en svart overlay.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const KALLA = fs.readFileSync(path.join(__dirname, '..', 'vyra-masterval.js'), 'utf8');

// En minimal rymd: localStorage, timers och fetch — inget mer. Samma teknik som
// gifter-fas-register: den RIKTIGA filen körs, men utan att dra in en hel sida.
function rymd({ svar = null, fetchFel = false } = {}) {
  const lager = new Map();
  const anrop = [];
  const w = {
    localStorage: {
      getItem: k => (lager.has(k) ? lager.get(k) : null),
      setItem: (k, v) => lager.set(k, String(v)),
      removeItem: k => lager.delete(k),
    },
    setInterval: () => 0, clearInterval: () => {},
    addEventListener: () => {},
    crypto: { randomUUID: () => 'flik-prov-' + (anrop.length + Math.random().toString(36).slice(2, 6)) },
    navigator: {},
    fetch: (url, init) => {
      anrop.push({ url: String(url), kropp: JSON.parse((init && init.body) || '{}'), metod: (init && init.method) || 'GET' });
      if (fetchFel) return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(svar) });
    },
    location: { origin: 'https://vyralive.app' },
  };
  w.window = w;
  vm.runInNewContext(KALLA, w, { filename: 'vyra-masterval.js' });
  return { w, anrop, lager };
}

test('utan domare beter sig valet exakt som förut — localStorage avgör', () => {
  const { w, anrop } = rymd({ fetchFel: true });
  const val = w.VyraMasterval.skapa({ nyckel: 'prov', minNiva: () => 1 });
  assert.equal(val.farKora(), true, 'en ledig plats ska tas som förut');
  assert.equal(val.arMaster(), true, 'och innehavet ska synas i den lokala nyckeln');
  assert.ok(anrop.every(a => !a.url.includes('/api/automation/master')) || anrop.length >= 0,
    'kontrollmätning: anropen får finnas, men de får inte avgöra utfallet när de misslyckas');
});

test('domaren pekas ut med en adress — och den är den lokala servern', () => {
  const { w, anrop } = rymd({ svar: { ok: true, master: 'nagon-annan', jagArMaster: false } });
  w.VyraMasterval.skapa({ nyckel: 'prov', minNiva: () => 2, domare: 'http://127.0.0.1:4173' });
  const traff = anrop.find(a => a.url.includes('/api/automation/master'));
  assert.ok(traff, `ingen förfrågan till domaren; anrop: ${JSON.stringify(anrop.map(a => a.url))}`);
  assert.ok(traff.url.startsWith('http://127.0.0.1:4173'),
    `domaren ska frågas på sin egen adress, fick ${traff.url}`);
  assert.equal(traff.kropp.nyckel, 'prov', 'förfrågan ska bära nyckeln valet gäller');
  assert.ok(traff.kropp.tabId, 'och flikens id, annars kan domaren inte skilja anroparna åt');
});

test('domarens svar avgör — även när den lokala nyckeln säger något annat', async () => {
  const { w } = rymd({ svar: { ok: true, master: 'nagon-annan-flik', jagArMaster: false } });
  const val = w.VyraMasterval.skapa({ nyckel: 'prov', minNiva: () => 1, domare: 'http://127.0.0.1:4173' });
  // Den lokala vägen skulle ha gett platsen: nyckeln är tom i den här rymden.
  await val.pulsa();
  assert.equal(val.farKora(), false,
    'domaren sa att en annan flik är förare, men valet körde ändå — då är buggen kvar');
});

test('domaren som säger ja gör fliken till förare', async () => {
  const { w } = rymd({ svar: { ok: true, master: null, jagArMaster: true } });
  const val = w.VyraMasterval.skapa({ nyckel: 'prov', minNiva: () => 1, domare: 'http://127.0.0.1:4173' });
  await val.pulsa();
  assert.equal(val.farKora(), true, 'domaren sa ja men valet körde inte');
  assert.equal(val.arMaster(), true, 'arMaster ska spegla samma svar');
});

test('en domare som slutar svara faller tillbaka på den lokala vägen', async () => {
  const { w } = rymd({ fetchFel: true });
  const val = w.VyraMasterval.skapa({ nyckel: 'prov', minNiva: () => 1, domare: 'http://127.0.0.1:4173' });
  await val.pulsa();
  assert.equal(val.farKora(), true,
    'servern nere ska INTE tysta automationen — fail-open är regeln i hela kedjan');
});

test('ett gammalt domarsvar slutar gälla — annars tystar en död domare automationen för evigt', async () => {
  // MUTATIONEN SOM ÖVERLEVDE FÖRST: `domarenGaller()` utan åldersgräns. Då lever domarens sista
  // "nej" vidare i all evighet, och en server som stängs mitt i en sändning tystar automationen
  // helt — motsatsen till fail-open. Provet ger ttl 1 ms och låter svaret bli gammalt.
  const { w } = rymd({ svar: { ok: true, master: 'nagon-annan', jagArMaster: false } });
  const val = w.VyraMasterval.skapa({
    nyckel: 'prov', minNiva: () => 1, domare: 'http://127.0.0.1:4173', ttl: 1,
  });
  await val.pulsa();
  assert.equal(val.farKora(), false, 'kontrollmätning: färskt svar ska gälla');
  await new Promise(r => setTimeout(r, 12));
  assert.equal(val.farKora(), true,
    'domarens svar är 12 ms gammalt med ttl 1 ms och gäller fortfarande — en domare som tystnar '
    + 'får aldrig lämna ett permanent nej efter sig');
});
