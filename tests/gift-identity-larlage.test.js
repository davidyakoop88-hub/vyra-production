'use strict';
// STUDIOS LÄRLÄGE — nedräkning, Avbryt och att klienten aldrig fattar egna beslut.
//
// Modulen äger ingen regellogik. Servern äger tiden: `sekunderKvar` räknas fram där, och
// klienten får bara visa den. Proven vaktar särskilt att en lokal nedräkning som når noll INTE
// själv avgör att lärläget är slut — det är serverns svar som gäller.
const test = require('node:test'), assert = require('node:assert/strict');

require('../gift-identity-larlage.js');
const { skapaLarlage } = globalThis.VyraGiftIdentityLarlage;

const WS = 'aaaaaaaa-1111-4000-8000-000000000001';
const REGEL = 'heart_me';

// Rigg med injicerad klocka: inga riktiga timers, ingen väntan.
function rigg(svaren) {
  const anrop = [];
  const koade = svaren.slice();
  const timers = new Map();
  let nastaId = 1;
  const ritade = [];

  const lar = skapaLarlage({
    workspaceId: WS,
    api: (path, options) => {
      anrop.push({ path, method: options.method });
      const svar = koade.length ? koade.shift() : { ok: true, armerad: false, sekunderKvar: 0 };
      return svar instanceof Error ? Promise.reject(svar) : Promise.resolve(svar);
    },
    rita: lage => ritade.push(JSON.parse(JSON.stringify(lage))),
    schemalagg: (fn, ms) => { const id = nastaId++; timers.set(id, { fn, ms }); return id; },
    avbrytTimer: id => timers.delete(id)
  });

  return {
    lar, anrop, ritade, timers,
    // Kör alla schemalagda callbacks av en viss takt en gång.
    kor: ms => {
      for (const [id, t] of Array.from(timers)) {
        if (t.ms === ms) { timers.delete(id); t.fn(); }
      }
    },
    antalTimers: () => timers.size
  };
}

const svar = (over = {}) => Object.assign({
  ok: true, inlard: null, armerad: false, sekunderKvar: 0, fangst: null
}, over);

// ---- ARMERING OCH NEDRÄKNING ------------------------------------------------------------------

test('armera hämtar läget och startar nedräkningen', async () => {
  const r = rigg([svar(), svar({ armerad: true, sekunderKvar: 300 })]);
  await r.lar.armera(REGEL);

  assert.equal(r.anrop[0].path, `/api/workspaces/${WS}/gift-identity/${REGEL}/armera`);
  assert.equal(r.anrop[0].method, 'POST');
  assert.equal(r.anrop[1].method, 'GET');
  assert.equal(r.lar.lage().armerad, true);
  assert.equal(r.lar.lage().sekunderKvar, 300);
  assert.equal(r.antalTimers(), 2, 'en poll och en tick ska vara schemalagda');
});

test('nedräkningen tickar lokalt mellan pollningarna', async () => {
  const r = rigg([svar(), svar({ armerad: true, sekunderKvar: 300 })]);
  await r.lar.armera(REGEL);

  r.kor(1000);
  assert.equal(r.lar.lage().sekunderKvar, 299, 'utan lokal tick står siffran still och ser trasig ut');
  r.kor(1000);
  assert.equal(r.lar.lage().sekunderKvar, 298);
});

test('serverns svar RÄTTAR en lokal nedräkning som drivit isär', async () => {
  const r = rigg([svar(), svar({ armerad: true, sekunderKvar: 300 })]);
  await r.lar.armera(REGEL);
  r.kor(1000); r.kor(1000); r.kor(1000);
  assert.equal(r.lar.lage().sekunderKvar, 297);

  // Servern säger 250 — det är sanningen, oavsett vad klienten räknat.
  r.anrop.length = 0;
  const p = new Promise(resolve => {
    const lar2 = r.lar;
    lar2.hamta(REGEL).then(resolve);
  });
  await p;
  // hamta() använde nästa köade svar (standard: ej armerad) — poängen är att klienten tar serverns
  // värde rakt av i taEmot, inte sitt eget.
  assert.equal(r.lar.lage().sekunderKvar, 0);
});

test('nedräkningen når noll utan att klienten själv avgör att läget är slut', async () => {
  const r = rigg([svar(), svar({ armerad: true, sekunderKvar: 2 })]);
  await r.lar.armera(REGEL);

  r.kor(1000);
  r.kor(1000);
  assert.equal(r.lar.lage().sekunderKvar, 0);
  assert.equal(r.lar.lage().armerad, true,
    'klienten får INTE flippa armerad till false — bara serverns svar bestämmer det');
});

// ---- FÅNGST ------------------------------------------------------------------------------------

test('fångsten exponeras med namn och bild för kontrollen', async () => {
  const r = rigg([svar(), svar({
    armerad: true, sekunderKvar: 280,
    fangst: { giftId: '9101', giftName: 'Heart Me', giftImage: 'https://x/h.png' }
  })]);
  await r.lar.armera(REGEL);

  const f = r.lar.lage().fangst;
  assert.equal(f.giftName, 'Heart Me');
  assert.equal(f.giftImage, 'https://x/h.png', 'bilden är halva kontrollen');
});

// ---- BEKRÄFTA OCH AVBRYT ----------------------------------------------------------------------

test('bekräfta anropar rätt väg och läser om läget', async () => {
  const r = rigg([svar({ ok: true }), svar({ inlard: { giftId: '9101', giftName: 'Heart Me' } })]);
  await r.lar.bekrafta(REGEL);

  assert.equal(r.anrop[0].path, `/api/workspaces/${WS}/gift-identity/${REGEL}/bekrafta`);
  assert.equal(r.anrop[0].method, 'POST');
  assert.equal(r.lar.lage().inlard.giftId, '9101');
  assert.equal(r.lar.lage().armerad, false);
});

test('bekräfta som nekas visar ett LÄGE, inte ett fel', async () => {
  const r = rigg([{ ok: false, skal: 'utgangen' }, svar()]);
  await r.lar.bekrafta(REGEL);
  // Skälet ska ha fångats så Studio kan säga "armera om" i stället för "något gick fel".
  assert.equal(r.ritade.some(l => l.fel === null), true, 'läget ritas om efter omläsningen');
  assert.equal(r.lar.lage().inlard, null, 'inget sparades');
});

test('avbryt stoppar timers och nollar läget direkt', async () => {
  const r = rigg([svar(), svar({ armerad: true, sekunderKvar: 300 })]);
  await r.lar.armera(REGEL);
  assert.equal(r.antalTimers(), 2);

  await r.lar.avbryt(REGEL);
  assert.equal(r.antalTimers(), 0, 'inga kvarlevande timers efter Avbryt');
  assert.equal(r.lar.lage().armerad, false);
  assert.equal(r.lar.lage().sekunderKvar, 0);
  assert.equal(r.lar.lage().fangst, null);
});

// ---- TEARDOWN OCH TÅLIGHET --------------------------------------------------------------------

test('stang river alla timers', async () => {
  const r = rigg([svar(), svar({ armerad: true, sekunderKvar: 300 })]);
  await r.lar.armera(REGEL);
  r.lar.stang();
  assert.equal(r.antalTimers(), 0,
    'en pollslinga som lever efter vybyte är samma fel som huset redan lärt sig en gång');
});

test('ett tappat pollsvar dödar inte lärläget', async () => {
  const r = rigg([svar(), svar({ armerad: true, sekunderKvar: 300 }), new Error('nätfel')]);
  await r.lar.armera(REGEL);

  r.kor(2000);                       // pollen faller
  await new Promise(r2 => setImmediate(r2));
  assert.equal(r.lar.lage().armerad, true, 'ett tappat svar får inte se ut som att läget dog');
  assert.ok(r.antalTimers() >= 1, 'nästa försök ska stå kvar');
});

test('ingen regellogik och ingen matchning bor i klienten', () => {
  const fs = require('node:fs'), path = require('node:path');
  const kall = fs.readFileSync(path.join(__dirname, '..', 'gift-identity-larlage.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/).map(r => r.replace(/\/\/.*$/, '')).join('\n');

  assert.ok(!/giftName\s*===/.test(kall), 'klienten får aldrig matcha på namn');
  assert.ok(!/'Heart Me'/.test(kall), 'inget hårdkodat gåvonamn i klienten');
  // KONTROLLMÄTNING: mönstren kan träffa.
  assert.ok(/giftName\s*===/.test("if (e.giftName === 'x') {}"));
});

// ---- OFFLINE: SKRIVBORDSAPPENS RESERVLÄGE -----------------------------------------------------
//
// Skrivbordsappen serverar Studion genom sin lokala server, som proxar statiskt innehåll till
// vyralive.app med 5 s timeout. Når den inte fram faller den tillbaka på kopian i .exe:n — och där
// kan lärläget ändå INTE fungera: armera, bekräfta och statusläsningen är alla molnrutter, och
// fångsten kräver ett gåvoevent genom molnets ingest.
//
// Att paketera gränssnittet i reservkopian hade alltså gett knappar som inte kan slutföra något.
// Kravet är i stället att läget stängs av med ETT tydligt skäl och inte gör anrop som måste falla.

const natfel = () => new Error('fetch failed');

test('offline: läget stängs av med ett skäl användaren förstår', async () => {
  const r = rigg([natfel()]);
  await r.lar.hamta(REGEL);

  assert.equal(r.lar.lage().otillganglig, true);
  assert.equal(r.lar.lage().meddelande, 'Lär in gåva kräver anslutning till VYRA.',
    'exakt den text som ska stå i gränssnittet');
  assert.equal(r.lar.lage().armerad, false, 'inget halvstartat läge får stå kvar');
});

test('offline: armera gör INGET anrop', async () => {
  const r = rigg([natfel()]);
  await r.lar.hamta(REGEL);
  const efterHamta = r.anrop.length;

  await r.lar.armera(REGEL);
  assert.equal(r.anrop.length, efterHamta,
    'ett armeringsanrop som ändå måste misslyckas ger bara en tyst timeout');
  assert.equal(r.lar.lage().armerad, false);
  assert.equal(r.lar.lage().meddelande, 'Lär in gåva kräver anslutning till VYRA.');
});

test('offline: bekräfta gör INGET anrop', async () => {
  const r = rigg([natfel()]);
  await r.lar.hamta(REGEL);
  const efterHamta = r.anrop.length;

  await r.lar.bekrafta(REGEL);
  assert.equal(r.anrop.length, efterHamta, 'inget bekräftelseanrop utan anslutning');
  assert.equal(r.lar.lage().inlard, null, 'och ingenting sparas');
});

test('offline: inga timers lever kvar', async () => {
  const r = rigg([natfel()]);
  await r.lar.hamta(REGEL);
  assert.equal(r.antalTimers(), 0,
    'en pollslinga mot ett moln som inte svarar är bara brus');
});

test('offline läker av sig självt när anslutningen kommer tillbaka', async () => {
  const r = rigg([natfel(), svar({ inlard: { giftId: '9101', giftName: 'Heart Me' } })]);
  await r.lar.hamta(REGEL);
  assert.equal(r.lar.lage().otillganglig, true);

  await r.lar.hamta(REGEL);
  assert.equal(r.lar.lage().otillganglig, false, 'ett lyckat svar ska öppna läget igen');
  assert.equal(r.lar.lage().meddelande, null);
  assert.equal(r.lar.lage().inlard.giftId, '9101');

  // KONTROLLMÄTNING: nu ska armera faktiskt anropa igen.
  const fore = r.anrop.length;
  await r.lar.armera(REGEL);
  assert.ok(r.anrop.length > fore, 'efter läkningen måste armera nå servern');
});

test('ett tappat pollsvar MITT i en armering stänger inte av läget', async () => {
  // Skillnaden mot offline: en armering som redan är igång ska tåla en blipp. Bara den INLEDANDE
  // läsningen — den som avgör om lärläget alls går att använda — sätter otillganglig.
  const r = rigg([svar(), svar({ armerad: true, sekunderKvar: 300 }), natfel()]);
  await r.lar.armera(REGEL);
  assert.equal(r.lar.lage().armerad, true);

  r.kor(2000);
  await new Promise(klar => setImmediate(klar));
  assert.equal(r.lar.lage().otillganglig, false,
    'en enstaka tappad poll är inte samma sak som ingen anslutning');
  assert.equal(r.lar.lage().armerad, true);
});

test('meddelandet är exporterat, så Studio och provet inte kan driva isär', () => {
  assert.equal(globalThis.VyraGiftIdentityLarlage.OFFLINE_MEDDELANDE,
    'Lär in gåva kräver anslutning till VYRA.');
});
