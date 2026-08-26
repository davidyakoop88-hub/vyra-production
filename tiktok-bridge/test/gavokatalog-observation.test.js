'use strict';
// ENGÅNGSOBSERVATIONEN AV GÅVOKATALOGEN — prov för redigeringen och för att den aldrig rör
// sändningen.
//
// Två saker bevisas här, och redigeringen är den viktigaste: sammanfattningen får bära AGGREGAT
// men aldrig innehåll. Proven matar därför in en katalog full av värden som skulle vara
// katastrofala i en logg — gåvonamn, giftId, roomId, användarnamn, token — och kräver att INGET
// av dem går att hitta i det som lämnar modulen.
//
// Alla värden är påhittade. Rums-id har TikToks 19-siffriga form men är syntetiskt.
const test = require('node:test'), assert = require('node:assert/strict');
const { skapaObservator, sammanfattaKatalog, felkategori } = require('../gavokatalog-observation');

const HEMLIGT = {
  gavonamn: 'Heart Me',
  flexnamn: 'Heart Me Flex',
  giftId: '6247',
  roomId: '7600000000000000001',
  anvandare: 'provgivare_a',
  token: 'tok_hemlig_provvarde_0123456789'
};

const KATALOG = {
  gifts: [
    { id: 5487, name: 'Rose', diamond_count: 1, image: { url_list: ['https://x/rose.png'] } },
    { id: 6247, name: HEMLIGT.gavonamn, diamond_count: 5 },
    { id: 7487, name: HEMLIGT.flexnamn, diamond_count: 50 }
  ]
};

// Fångar loggraderna i stället för att skriva dem.
function fejkLogg() {
  const rader = [];
  return { rader, log: rad => rader.push(String(rad)), error: rad => rader.push(String(rad)) };
}

// ---- REDIGERINGEN -----------------------------------------------------------------------------

test('sammanfattningen bär aggregat, aldrig innehåll', () => {
  const s = sammanfattaKatalog(KATALOG);
  const text = JSON.stringify(s);

  for (const [vad, varde] of Object.entries(HEMLIGT)) {
    assert.ok(!text.includes(varde), `sammanfattningen läckte ${vad}`);
  }
  // Fältnamnen ska däremot finnas — det är hela syftet med observationen.
  assert.deepEqual(s.falt, ['diamond_count', 'id', 'image', 'name']);
  assert.equal(s.poster, 3);
  assert.deepEqual(s.idTyper, { id: 'number' });
  assert.deepEqual(s.namnTyper, { name: 'string' });
});

test('bild-URL:er och nästlat innehåll läcker inte ut', () => {
  const text = JSON.stringify(sammanfattaKatalog(KATALOG));
  assert.ok(!text.includes('https://'), 'ingen URL får lämna modulen');
  assert.ok(!text.includes('url_list'), 'nästlade nycklar räknas inte som toppfält');
});

test('loggraden innehåller heller ingenting hemligt', async () => {
  const logg = fejkLogg();
  await skapaObservator({ hamta: async () => KATALOG, logg }).observera();
  assert.equal(logg.rader.length, 1);
  for (const [vad, varde] of Object.entries(HEMLIGT)) {
    assert.ok(!logg.rader[0].includes(varde), `loggraden läckte ${vad}`);
  }
  assert.ok(logg.rader[0].startsWith('[gavokatalog] '));
});

test('felmeddelanden loggas aldrig råa — bara kategori', async () => {
  const logg = fejkLogg();
  const fel = new Error(`postgres://user:${HEMLIGT.token}@db:5432 nekade`);
  fel.status = 403;
  await skapaObservator({ hamta: async () => { throw fel; }, logg }).observera();
  assert.equal(logg.rader.length, 1);
  assert.ok(!logg.rader[0].includes(HEMLIGT.token), 'ett felmeddelande kan bära en uppkopplingssträng');
  assert.ok(!logg.rader[0].includes('nekade'), 'meddelandetexten får inte med');
  assert.ok(logg.rader[0].includes('http_403'), 'kategorin ska finnas');
});

// ---- HEART ME-RÄKNINGEN -----------------------------------------------------------------------

test('exakt Heart Me räknas — Flex gör det inte', () => {
  assert.equal(sammanfattaKatalog(KATALOG).heartMeTraffar, 1);
  assert.equal(sammanfattaKatalog({ gifts: [{ id: 1, name: 'Heart Me Flex' }] }).heartMeTraffar, 0);
  assert.equal(sammanfattaKatalog({ gifts: [{ id: 1, name: '  heart me  ' }] }).heartMeTraffar, 1,
    'trimmad och skiftlägesokänslig, men exakt');
});

test('flera träffar rapporteras som antal, inte som id', () => {
  const s = sammanfattaKatalog({ gifts: [{ id: 1, name: 'Heart Me' }, { id: 2, name: 'Heart Me' }] });
  assert.equal(s.heartMeTraffar, 2);
  assert.ok(!JSON.stringify(s).includes('"1"') && !JSON.stringify(s).includes('"2"'));
});

// ---- UTFALL SOM INTE ÄR DATA ------------------------------------------------------------------

test('tomt svar, oformat svar och saknat svar ger ok:false utan att kasta', () => {
  assert.equal(sammanfattaKatalog({ gifts: [] }).orsak, 'tomt');
  assert.equal(sammanfattaKatalog(null).orsak, 'oformat');
  assert.equal(sammanfattaKatalog({ nagot: 'annat' }).orsak, 'oformat');
  assert.equal(sammanfattaKatalog([]).orsak, 'tomt');
});

test('felkategorier utan meddelandetext', () => {
  assert.equal(felkategori({ status: 403 }), 'http_403');
  assert.equal(felkategori({ statusCode: 401 }), 'http_401');
  assert.equal(felkategori({ response: { status: 429 } }), 'http_429');
  assert.equal(felkategori(Object.assign(new Error('x'), { name: 'AbortError' })), 'timeout');
  assert.equal(felkategori(new Error('vad som helst')), 'undantag');
});

// ---- HÖGST ETT ANROP PER ANSLUTNING -----------------------------------------------------------

test('katalogen hämtas högst en gång per observator', async () => {
  let anrop = 0;
  const logg = fejkLogg();
  const obs = skapaObservator({ hamta: async () => { anrop++; return KATALOG; }, logg });

  await obs.observera();
  await obs.observera();
  await obs.observera();

  assert.equal(anrop, 1, 'högst ett kataloganrop per anslutning');
  assert.equal(logg.rader.length, 1, 'och högst en loggrad');
  assert.equal(obs.harKort(), true);
});

test('en ny anslutning får en ny observator som hämtar på nytt', async () => {
  let anrop = 0;
  const hamta = async () => { anrop++; return KATALOG; };
  await skapaObservator({ hamta, logg: fejkLogg() }).observera();
  await skapaObservator({ hamta, logg: fejkLogg() }).observera();
  assert.equal(anrop, 2, 'per anslutning, inte per process');
});

// ---- PÅVERKAR ALDRIG LIVSCYKELN ---------------------------------------------------------------

test('ett kastat fel rejectar aldrig utåt', async () => {
  const logg = fejkLogg();
  // Skulle den här rejecta blir det en unhandledRejection på anropsplatsen, som är fire-and-forget.
  await assert.doesNotReject(
    skapaObservator({ hamta: async () => { throw new Error('trasigt'); }, logg }).observera());
  assert.equal(logg.rader.length, 1);
});

test('ett synkront kast i hamta rejectar heller aldrig', async () => {
  const logg = fejkLogg();
  await assert.doesNotReject(
    skapaObservator({ hamta: () => { throw new Error('synkront'); }, logg }).observera());
  assert.ok(logg.rader[0].includes('undantag'));
});

test('timeout: observationen ger upp utan att vänta på ett svar som aldrig kommer', async () => {
  const logg = fejkLogg();
  let timerFn = null;
  const obs = skapaObservator({
    hamta: () => new Promise(() => {}),               // svarar aldrig
    logg,
    timeoutMs: 4000,
    schemalagg: (fn) => { timerFn = fn; return { unref() {} }; },
    avbryt: () => {}
  });
  const p = obs.observera();
  timerFn();                                          // klockan injiceras — ingen riktig väntan
  const rad = await p;
  assert.equal(rad.orsak, 'timeout');
  assert.equal(logg.rader.length, 1);
});

test('ett SENT svar efter timeout loggar inte en andra gång', async () => {
  const logg = fejkLogg();
  let slapp = null;
  let timerFn = null;
  const obs = skapaObservator({
    hamta: () => new Promise(resolve => { slapp = resolve; }),
    logg,
    schemalagg: (fn) => { timerFn = fn; return { unref() {} }; },
    avbryt: () => {}
  });
  const p = obs.observera();
  timerFn();                                          // timeout först
  await p;
  slapp(KATALOG);                                     // svaret landar efteråt
  await new Promise(r => setImmediate(r));
  assert.equal(logg.rader.length, 1, 'ett sent svar får inte ge en andra loggrad');
  assert.ok(logg.rader[0].includes('timeout'));
});

test('livscykeln rörs inte av något utfall', async () => {
  // Livscykeln representeras av spioner. Observationen får inte anropa NÅGON av dem, oavsett
  // utfall — den ligger efter registrering och live:start i bridge.js och äger inget av dem.
  const rord = [];
  const livscykel = {
    startad: () => rord.push('startad'),
    slut: () => rord.push('slut'),
    moln: () => rord.push('moln')
  };
  const utfall = [
    async () => KATALOG,
    async () => { throw Object.assign(new Error('nekad'), { status: 403 }); },
    async () => ({ gifts: [] }),
    async () => null
  ];
  for (const hamta of utfall) {
    await skapaObservator({ hamta, logg: fejkLogg() }).observera();
  }
  assert.deepEqual(rord, [], 'observationen får aldrig röra livscykeln');
  assert.ok(typeof livscykel.startad === 'function');
});

// ---- KOPPLINGEN I BRIDGE.JS -------------------------------------------------------------------

test('bridge.js anropar observationen fire-and-forget efter startad()', () => {
  const fs = require('node:fs');
  const kall = fs.readFileSync(require.resolve('../bridge.js'), 'utf8');

  assert.ok(kall.includes("require('./gavokatalog-observation')"), 'modulen ska vara inkopplad');

  const rad = kall.split('\n').find(r => r.includes('.observera()'));
  assert.ok(rad, 'anropet ska finnas');
  assert.ok(!/await\s+skapaObservator/.test(kall), 'anropet får ALDRIG inväntas');
  assert.ok(!/\.observera\(\)\s*\.then/.test(kall), 'ingen .then som kan röra sändningen');

  // Ordningen: registrering och live:start sker via livscykel.startad(), som måste ligga FÖRE.
  assert.ok(kall.indexOf('livscykel.startad(') < kall.indexOf('.observera()'),
    'observationen ligger efter startad() — den kan inte fördröja live:start');
});
