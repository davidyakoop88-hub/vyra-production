'use strict';
// LÄRLÄGETS PARITET MELLAN WEBB OCH WINDOWS-APP.
//
// Frågan var: "webbstudion har lärläget, saknar Windows-appen det?". Mätningen gav ett annat svar
// än väntat, och den skillnaden är hela poängen med den här filen.
//
// 1. GRÄNSSNITTET SAKNAS INTE. `build.extraResources` i package.json kopierar HELA repotroten in i
//    `resources/app`, och `gift-identity-larlage.js` ligger i roten och är inte utesluten. Varje ny
//    .exe får alltså lärläget automatiskt — det finns ingen paketeringslista att lägga till det i.
//
// 2. I NORMALT LÄGE KOMMER FILEN ÄNDÅ FRÅN MOLNET. local-server.js proxar statiskt innehåll till
//    vyralive.app med 5 s timeout, så appen kör dagens Studio, inte den inbakade kopian.
//
// 3. RESERVEN KAN INTE KÖRA LÄRLÄGET OAVSETT. Armera, bekräfta och statusläsningen är molnrutter,
//    och fångsten kräver ett gåvoevent genom molnets ingest. Ett gränssnitt i reservkopian hade
//    visat knappar som inte kan slutföra något. Kravet är därför att läget stängs av med ett skäl —
//    vaktat i tests/gift-identity-larlage.test.js.
//
// 4. DET SOM FAKTISKT SAKNAS ÄR `giftId` FRÅN DEN INSTALLERADE .exe:n. `tiktok-service.js` ligger i
//    `build.files`, alltså inbakad i asar-arkivet och FRUSEN vid byggtillfället. giftId kom in i
//    `afd1713` (#280) 2026-08-27, medan senaste publicerade installer är v1.2.3 från 2026-08-04.
//    Över desktopappens EGEN TikTok-anslutning saknar gåvor därför id — och utan id finns ingen
//    identitet att lära in. Molnbryggan har alltid haft det (tiktok-bridge/normalizer.js:68).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { startLocalServer } = require('../local-server');

const ROOT = path.join(__dirname, '..', '..');
const CLOUD = 'https://vyra-cloud.invalid';
const LARLAGE = '/gift-identity-larlage.js';

// EGET PORTBLOCK. `node --test test/*.test.js` kor filerna PARALLELLT, sa tva filer som delar port
// ger EADDRINUSE i den som hinner sist — och felet ser ut som en flackning, inte som en krock.
// 4231-4233 tillhor automation-master.test.js.
const PORT = { online: 4281, studio: 4282, reserv: 4283 };

// ---- 1 · ONLINE-LÄGET PROXAR DAGENS STUDIO ----------------------------------------------------

function stubbaMolnet(t, svara) {
  const riktigFetch = global.fetch;
  t.after(() => { global.fetch = riktigFetch; });
  global.fetch = async (url, init = {}) => {
    const mal = new URL(String(url));
    if (mal.origin !== CLOUD) return riktigFetch(url, init);
    return svara(mal, init);
  };
}

async function medServer(t, port, options, kor) {
  const server = await startLocalServer(ROOT, port, options);
  try { return await kor(`http://127.0.0.1:${port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('online: desktopvägen serverar MOLNETS lärläge, inte den inbakade kopian', async t => {
  const molnkopia = '// FÄRSK FRÅN MOLNET\n';
  const pafil = fs.readFileSync(path.join(ROOT, 'gift-identity-larlage.js'), 'utf8');

  // KONTROLLMÄTNING FÖRST: provet kan bara skilja de två om de faktiskt skiljer sig.
  assert.notEqual(molnkopia, pafil, 'stubben måste skilja sig från filen på disk');

  stubbaMolnet(t, mal => {
    assert.equal(mal.pathname, LARLAGE, 'servern ska fråga molnet efter just den här filen');
    return new Response(molnkopia, { status: 200, headers: { 'content-type': 'application/javascript' } });
  });

  const kropp = await medServer(t, PORT.online, { cloudOrigin: CLOUD }, async origin =>
    (await fetch(origin + LARLAGE)).text());

  assert.equal(kropp, molnkopia, 'appen fick den inbakade kopian i stället för dagens');
});

test('online: hela Studion kommer från molnet, inte bara lärläget', async t => {
  // Lärläget laddas av studio.html. Kommer HTML:en från den frusna kopian medan skriptet kommer
  // från molnet får man en sida som inte ens refererar till modulen.
  const hamtade = [];
  stubbaMolnet(t, mal => {
    hamtade.push(mal.pathname);
    return new Response('// moln\n', { status: 200, headers: { 'content-type': 'text/plain' } });
  });

  await medServer(t, PORT.studio, { cloudOrigin: CLOUD }, async origin => {
    await fetch(origin + '/studio.html');
    await fetch(origin + LARLAGE);
  });

  assert.deepEqual(hamtade, ['/studio.html', LARLAGE]);
});

test('reserven används när molnet inte svarar — och den bär filen', async t => {
  stubbaMolnet(t, () => { throw new Error('offline'); });

  const kropp = await medServer(t, PORT.reserv, { cloudOrigin: CLOUD }, async origin =>
    (await fetch(origin + LARLAGE)).text());

  const pafil = fs.readFileSync(path.join(ROOT, 'gift-identity-larlage.js'), 'utf8');
  assert.equal(kropp, pafil, 'reserven ska falla tillbaka på den inbakade kopian');
  // Alltså: filen SAKNAS inte i paketet. Det är inte gränssnittet som är problemet offline —
  // det är att molnrutterna inte går att nå. Se tests/gift-identity-larlage.test.js.
});

test('paketeringen sveper repotroten — lärläget kan inte glömmas bort', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const res = pkg.build.extraResources[0];
  assert.equal(res.from, '..', 'extraResources ska kopiera hela repotroten');

  const uteslutna = res.filter.filter(m => m.startsWith('!')).map(m => m.slice(1));
  for (const fil of ['gift-identity-larlage.js', 'studio.html', 'goal-client.js']) {
    assert.ok(!uteslutna.includes(fil), `${fil} är utesluten ur paketet`);
  }

  // Och tiktok-service.js ligger i files, alltså i asar — den är FRUSEN och kräver ett ombygge.
  assert.ok(pkg.build.files.includes('tiktok-service.js'),
    'ändras normaliseringen krävs en ny .exe, till skillnad från webbfilerna');
});

// ---- 2 · ELECTRON SKICKAR giftId HELA VÄGEN ---------------------------------------------------

// tiktok-service.js kräver 'tiktok-live-connector' vid modulladdning. Stubben läggs i require-cachen
// före, så den riktiga anslutningen aldrig instansieras och GIFT-hanteraren kan matas direkt.
function medStubbadConnector(kor) {
  const id = require.resolve('tiktok-live-connector');
  const sparad = require.cache[id];
  const hanterare = new Map();

  class FejkAnslutning {
    constructor() { this.roomId = '7600000000000000001'; }
    on(handelse, fn) { hanterare.set(handelse, fn); }
    async connect() { return { roomId: this.roomId }; }
    async disconnect() {}
  }

  require.cache[id] = {
    id, filename: id, loaded: true, exports: {
      TikTokLiveConnection: FejkAnslutning,
      WebcastEvent: { CHAT: 'chat', GIFT: 'gift', FOLLOW: 'follow', SHARE: 'share',
                      MEMBER: 'member', SUB_NOTIFY: 'sub', LIKE: 'like', EMOTE: 'emote',
                      ENVELOPE: 'envelope', ROOM_USER: 'roomuser', LINK_MIC_BATTLE: 'battle',
                      LINK_MIC_ARMIES: 'armies', STREAM_END: 'end' },
      ControlEvent: { CONNECTED: 'connected', DISCONNECTED: 'disconnected', ERROR: 'error',
                      WEBSOCKET_CONNECTED: 'ws' }
    }
  };
  const tjanstId = require.resolve('../tiktok-service');
  delete require.cache[tjanstId];

  try {
    const { createTikTokService } = require('../tiktok-service');
    return kor(createTikTokService, hanterare);
  } finally {
    if (sparad) require.cache[id] = sparad; else delete require.cache[id];
    delete require.cache[tjanstId];
  }
}

// En rå gåvopayload i TikToks form. Syntetiska värden — inget riktigt konto, ingen riktig gåva.
const raGava = over => Object.assign({
  userId: '77770000000000001', uniqueId: 'provgivare', nickname: 'Provgivare',
  giftId: 9001, giftName: 'Provgava', repeatCount: 1, repeatEnd: 1, diamondCount: 5,
  gift: { type: 1 }
}, over);

test('electron skickar giftId hela vägen från en gåva', async () => {
  const utsanda = [];
  await medStubbadConnector(async (skapa, hanterare) => {
    const tjanst = skapa({ onStatus() {}, onEvent: e => utsanda.push(e) });
    await tjanst.connect('provkonto');
    hanterare.get('gift')(raGava());
  });

  assert.equal(utsanda.length, 1, 'gåvan ska ha nått onEvent');
  assert.equal(utsanda[0].type, 'gift');
  assert.equal(utsanda[0].giftId, '9001',
    'utan giftId finns ingen identitet att lära in — det var precis luckan i v1.2.3');
});

test('giftId hittas i alla tre formerna TikTok använder', async () => {
  const former = [
    { namn: 'platt giftId', payload: raGava({ giftId: 9001 }) },
    { namn: 'giftDetails.giftId', payload: raGava({ giftId: undefined, giftDetails: { giftId: 9001 } }) },
    { namn: 'gift.id', payload: raGava({ giftId: undefined, gift: { type: 1, id: 9001 } }) }
  ];
  for (const form of former) {
    const utsanda = [];
    await medStubbadConnector(async (skapa, hanterare) => {
      const tjanst = skapa({ onStatus() {}, onEvent: e => utsanda.push(e) });
      await tjanst.connect('provkonto');
      hanterare.get('gift')(form.payload);
    });
    assert.equal(utsanda[0] && utsanda[0].giftId, '9001', `${form.namn} gav inget id`);
  }
});

test('slutframe-regeln gäller även över desktopvägen', async () => {
  // Samma invariant som molnbryggan (bridge.js:374): en streak levererar många frames, men bara
  // slutframen får passera. Annars fångar lärläget en mellanframe och räknaren dubbelräknar.
  const utsanda = [];
  await medStubbadConnector(async (skapa, hanterare) => {
    const tjanst = skapa({ onStatus() {}, onEvent: e => utsanda.push(e) });
    await tjanst.connect('provkonto');
    hanterare.get('gift')(raGava({ repeatEnd: 0 }));           // mitt i en streak — ska tappas
    hanterare.get('gift')(raGava({ repeatEnd: 1 }));           // slutframen — ska passera
  });

  assert.equal(utsanda.length, 1, 'en mellanframe slapp igenom');
  assert.equal(utsanda[0].giftId, '9001');
});

test('en icke-streakbar gåva passerar utan repeatEnd', async () => {
  // KONTROLLMÄTNING till provet ovan: filtret får inte råka svälja allt.
  const utsanda = [];
  await medStubbadConnector(async (skapa, hanterare) => {
    const tjanst = skapa({ onStatus() {}, onEvent: e => utsanda.push(e) });
    await tjanst.connect('provkonto');
    hanterare.get('gift')(raGava({ gift: { type: 0 }, repeatEnd: 0 }));
  });
  assert.equal(utsanda.length, 1, 'en gåva som inte är streakbar har ingen mellanframe att tappa');
});
