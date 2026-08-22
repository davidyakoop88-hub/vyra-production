'use strict';
// KONFIGURATION UTAN OMLADDNING — widgeten ska ta emot en andring utan att kallan uppdateras i OBS.
//
// LAGET I DAG, uppmatt 2026-08-22: overlay-access.js hamtar `/api/overlay-access/{token}` EN gang
// vid start och oppnar sedan en strom som bara bar `live`-handelser. Andrar agaren nagot i Studion
// star OBS kvar med den gamla bilden tills kallan laddas om for hand. Det ar den storsta dagliga
// irritationen enligt Davids egen prioritering.
//
// UPPLAGGET, beslutat med David: servern publicerar bara ett TECKEN — `{overlayId, revision}` —
// pa den strom widgeten redan lyssnar pa. Klienten hamtar darefter om fran den ENDA
// konfigurationskallan. Att skicka sjalva konfigurationen over strommen hade skapat en andra
// sanning, och en gammal och en ny kopia hade kunnat krocka i OBS.
//
// `revision` ar inte pahittad: `overlays` har redan `version integer`, och goal-runtime.js kor
// `version=version+1` vid varje sparning. Den ar alltsa redan auktoritativ.
//
// DE SEX KRAVEN NEDAN AR DAVIDS EGNA. Beslutslogiken ligger i en ren modul med injicerade beroenden
// (samma monster som server/goal-ingest.js) sa att alla sex gar att prova utan webblasare, utan
// server och utan klocka som far ta tid. Det som INTE gar att prova sa — att en pagaende widget
// behaller sitt live-tillstand — har ett eget browserprov.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { skapaKonfigSync } = require(path.join(__dirname, '..', 'overlay-config-sync.js'));

// En rigg dar tiden ar en variabel, inte en vantan. Prov som sover blir langsamma prov, och
// langsamma prov kors inte fore push — det ar hela poangen med att halla dem har.
function rigg({ hamtSvar } = {}) {
  const spar = { hamtningar: [], applicerade: [], fel: [] };
  let nu = 0;
  const kolagda = [];
  const svar = hamtSvar || (() => ({ revision: 1, widgets: [] }));

  const sync = skapaKonfigSync({
    overlayId: 'A',
    hamta: async () => {
      spar.hamtningar.push(nu);
      const r = svar(spar.hamtningar.length);
      if (r instanceof Error) throw r;
      return r;
    },
    applicera: (konfig) => { spar.applicerade.push(konfig) },
    logg: (m) => { spar.fel.push(m) },
    nu: () => nu,
    schemalagg: (fn, ms) => { const p = { fn, vid: nu + ms }; kolagda.push(p); return p },
    avbryt: (p) => { const i = kolagda.indexOf(p); if (i >= 0) kolagda.splice(i, 1) },
  });

  // Stega klockan och kor det som forfallit — deterministiskt, ingen riktig tid inblandad.
  const stega = async (ms) => {
    nu += ms;
    for (const p of kolagda.filter(k => k.vid <= nu)) {
      kolagda.splice(kolagda.indexOf(p), 1);
      await p.fn();
    }
    await Promise.resolve();
  };
  return { sync, spar, stega, kolagda };
}

test('1 · bara rätt overlayId väcker en hämtning', async () => {
  // En workspace kan ha flera overlays, och strommen ar per workspace. Vaknade alla vid varje
  // sparning skulle en andring i en scen rita om en annan — och den andra sandningen ar kanske
  // mitt i en gava.
  const { sync, spar, stega } = rigg();
  await sync.taEmot({ overlayId: 'B', revision: 9 });
  await stega(5000);
  assert.equal(spar.hamtningar.length, 0,
    'en annan overlays sparning hamtade om konfigurationen — fel scen ritades om');

  await sync.taEmot({ overlayId: 'A', revision: 2 });
  await stega(5000);
  assert.equal(spar.hamtningar.length, 1, 'den egna overlayns sparning gav ingen hamtning');
});

test('2 · en äldre revision skriver aldrig över en nyare', async () => {
  // Ordningen over en strom ar inte garanterad, och en ateransluten klient kan fa en gammal
  // handelse efter en ny. Samma fella som goal-revision-kontraktsglappet: klienten ordnade pa ett
  // falt som inte fanns. Har finns det, och det MASTE anvandas.
  const { sync, spar, stega } = rigg({ hamtSvar: () => ({ revision: 7, widgets: [] }) });
  await sync.taEmot({ overlayId: 'A', revision: 7 });
  await stega(5000);
  assert.equal(spar.applicerade.length, 1);

  await sync.taEmot({ overlayId: 'A', revision: 5 });
  await stega(5000);
  assert.equal(spar.hamtningar.length, 1,
    'en revision ALDRE an den vi redan visar startade en hamtning — den hade rullat tillbaka '
    + 'designen till nagot agaren redan andrat bort');
});

test('3 · många snabba sparningar blir EN hämtning', async () => {
  // Studion sparar vid varje andring. Drar man i ett reglage blir det tiotals sparningar pa nagra
  // sekunder, och en hamtning per sparning hade gett en storm mot servern och en blinkande OBS.
  const { sync, spar, stega, kolagda } = rigg({ hamtSvar: () => ({ revision: 12, widgets: [] }) });
  for (let r = 3; r <= 12; r++) await sync.taEmot({ overlayId: 'A', revision: r });
  // MAT KON FORE stegningen. Utan den har raden var provet gront aven nar avbokningen togs bort
  // (uppmatt i mutation D): de tio timrarna lag kvar men gjorde ingenting, sa antalet HAMTNINGAR
  // blev anda ett. Ratt utfall av fel skal ar inte ett bevis — en framtida omskrivning hade kunnat
  // lacka en timer per sparning i en flera timmar lang sandning utan att nagot prov sagt ifran.
  assert.equal(kolagda.length, 1,
    `tio sparningar lamnade ${kolagda.length} planerade hamtningar i kon — de ska ersatta varandra`);

  await stega(5000);
  assert.equal(spar.hamtningar.length, 1,
    `tio sparningar gav ${spar.hamtningar.length} hamtningar — de ska slas ihop till en`);
  assert.equal(spar.applicerade.length, 1, 'och till EN omritning');
});

test('4 · en misslyckad hämtning lämnar designen kvar och försöker igen', async () => {
  // FAIL-SAFE, precis som resten av huset: en trasig hamtning far ALDRIG slacka en fungerande
  // overlay mitt i en sandning. Den gamla bilden star kvar tills en ny faktiskt kommit hem.
  let varv = 0;
  const { sync, spar, stega } = rigg({
    hamtSvar: () => { varv++; return varv === 1 ? new Error('natverket dog') : { revision: 4, widgets: [] } },
  });
  await sync.taEmot({ overlayId: 'A', revision: 4 });
  await stega(5000);
  assert.equal(spar.applicerade.length, 0, 'en misslyckad hamtning applicerade nagot anda');
  assert.ok(spar.fel.length > 0, 'felet loggades inte — en tyst miss ar omojlig att felsoka i OBS');

  await stega(60000);
  assert.equal(spar.hamtningar.length, 2, 'inget nytt forsok efter det misslyckade');
  assert.equal(spar.applicerade.length, 1, 'andra forsoket applicerade inte');
});

test('5 · efter återanslutning hämtas den senaste revisionen', async () => {
  // Bruten anslutning ar det normala i en flera timmar lang sandning. Missade handelser under
  // avbrottet kommer aldrig igen som handelser — darfor maste ateranslutningen sjalv fraga.
  const { sync, spar, stega } = rigg({ hamtSvar: () => ({ revision: 30, widgets: [] }) });
  await sync.taEmot({ overlayId: 'A', revision: 2 });
  await stega(5000);
  assert.equal(spar.hamtningar.length, 1);

  await sync.ateranslot();
  await stega(5000);
  assert.equal(spar.hamtningar.length, 2,
    'ateranslutningen hamtade inte om — en andring gjord medan stromen lag nere hade da aldrig '
    + 'natt OBS, och anvandaren hade sett en gammal design utan att forsta varfor');
});

// ---- Serversidan · vad som far ga ut pa stromen ----------------------------------------------
const { sseChunk } = require(path.join(__dirname, '..', 'server', 'goal-sse.js'));

const KONFIG = { konfig: { overlayId: 'A', revision: 12 } };

test('S1 · konfigbeskedet når BARA sin egen overlay', () => {
  // Samma regel som malramarna redan lyder under, och av samma skal: en OBS-lank ar publik for den
  // som har den. Ett overlay-id som lacker till en annan lank ar en identitetslacka, och en
  // omritning i fel scen ar dessutom ett synligt fel mitt i nagon annans sandning.
  assert.match(sseChunk(KONFIG, 'A') || '', /event: konfig/,
    'ratt overlay fick inget konfigbesked');
  assert.equal(sseChunk(KONFIG, 'B'), null,
    'konfigbeskedet gick ut pa en ANNAN overlays strom');
});

test('S2 · beskedet bär bara overlayId och revision — aldrig konfigurationen', () => {
  const ut = sseChunk(KONFIG, 'A') || '';
  const data = JSON.parse(ut.split('data: ')[1]);
  assert.deepEqual(Object.keys(data).sort(), ['overlayId', 'revision'],
    'beskedet bar mer an ett tecken. Hela poangen med upplagget ar att konfigurationen har EN '
    + 'kalla — skickas den ocksa over strommen kan en gammal och en ny kopia krocka i OBS');
});

test('S3 · konfigbeskedet hamnar ALDRIG i återuppspelningen', () => {
  // En `id:`-rad gor meddelandet till en del av Last-Event-ID-historiken. Ett konfigbesked dar
  // hade dels spelats upp igen vid varje ateranslutning, dels flyttat klientens
  // aterupptagningspunkt till nagot xRange inte hittar. Klienten fragar i stallet sjalv efter
  // senaste revisionen nar den ateransluter — det ar prov 5 ovan.
  assert.doesNotMatch(sseChunk(KONFIG, 'A') || '', /^id: /m,
    'konfigbeskedet bar en id-rad och skulle hamna i ateruppspelningshistoriken');
});

test('6 · samma revision en gång till ritar inte om i onödan', async () => {
  // En omritning mitt i sandning ar inte gratis: den ar risken punkt 4 i Davids lista handlar om.
  // Kommer samma revision igen — vilket den gor vid varje ateranslutning — ska ingenting handa.
  const { sync, spar, stega } = rigg({ hamtSvar: () => ({ revision: 8, widgets: [] }) });
  await sync.taEmot({ overlayId: 'A', revision: 8 });
  await stega(5000);
  assert.equal(spar.applicerade.length, 1);

  await sync.taEmot({ overlayId: 'A', revision: 8 });
  await stega(5000);
  assert.equal(spar.hamtningar.length, 1, 'samma revision hamtades om utan att nagot andrats');
});
