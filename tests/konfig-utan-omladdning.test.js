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

// Hopslagningsfonstret i overlay-config-sync.js. Namngivet har for att proven nedan ska stega
// klockan i FILENS egen takt och inte i ett tal som rakar stamma i dag.
const HOPSLAGNING = 400;

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
      const r = await svar(spar.hamtningar.length);
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

// ---- ATERANSLUTNINGEN FAR INTE BLI EN SLINGA -------------------------------------------------
// Prov 5 ovan matte att `ateranslot()` hamtar om — men bara EN stegning framat, och `stega()` kor
// aldrig det som schemalaggs inuti korningen. Det som lag kvar i kon efterat matte ingen. Prov 3
// bar redan laxan i sin egen kommentar ("MAT KON FORE stegningen ... ratt utfall av fel skal ar
// inte ett bevis"); prov 5 hade den inte, och darfor kunde en oandlig slinga ligga bakom ett gront
// prov.
//
// UPPMATT 2026-08-26 i riktig Chrome mot hela kedjan: en OBS-kalla som oppnades under en pagaende
// sandning gjorde 2,5 bootstrap-hamtningar OCH 2,5 fullstandiga overlay-omritningar i SEKUNDEN,
// resten av sandningen. Orsaken lag i `finally`-grenen: `ateranslot()` skrev
// Number.MAX_SAFE_INTEGER i `onskad`, och eftersom `visad` sedan blev serverns riktiga version
// (1, 2, 3 ...) stod villkoret `onskad > visad` kvar som sant for alltid.
test('7 · återanslutningen hämtar EN gång och lämnar inget i kön', async () => {
  const { sync, spar, stega, kolagda } = rigg({ hamtSvar: () => ({ revision: 30, widgets: [] }) });
  await sync.ateranslot();
  await stega(0);
  assert.equal(spar.hamtningar.length, 1, 'ateranslutningen hamtade inte om');

  // KON MATS EFTERAT, precis som prov 3 mater den innan. Ett svar har kommit hem och ingen har
  // sagt oss nagot nytt — da ska ingenting sta pa tur.
  assert.equal(kolagda.length, 0,
    `ateranslutningen lamnade ${kolagda.length} planerade hamtningar i kon efter att svaret kommit `
    + 'hem — det ar en slinga, inte en hamtning');

  // Och den ska sta stilla. Tjugo fonster a 400 ms ar atta sekunder av en sandning som pagar i
  // timmar; hamtar den har hamrar den servern och ritar om OBS lika lange som sandningen varar.
  for (let i = 0; i < 20; i++) await stega(HOPSLAGNING);
  assert.equal(spar.hamtningar.length, 1,
    `en vilande kalla gjorde ${spar.hamtningar.length} hamtningar pa atta sekunder — `
    + `${(spar.hamtningar.length / 8).toFixed(1)} Hz mot servern, och lika manga omritningar i OBS`);
  assert.equal(spar.applicerade.length, 1, 'och lika manga omritningar');
});

test('8 · en sparning MEDAN en hämtning pågår hämtas ändå', async () => {
  // Motprovet till 7. Slingan gick att doda genom att bara sluta planera i `finally` — och da hade
  // en revision som kom in medan svaret var i luften blivit liggande tills nasta sparning. Kravet
  // ar "hamta en gang till, inte for alltid", inte "sluta hamta".
  const { sync, spar, stega } = rigg({ hamtSvar: (n) => ({ revision: n === 1 ? 5 : 9, widgets: [] }) });
  await sync.taEmot({ overlayId: 'A', revision: 5 });
  await stega(HOPSLAGNING);
  assert.equal(spar.hamtningar.length, 1);

  // Revision 9 sags oss; hamtningen ovan bar bara 5. Den maste hamtas.
  await sync.taEmot({ overlayId: 'A', revision: 9 });
  await stega(HOPSLAGNING);
  assert.equal(spar.hamtningar.length, 2, 'en nyare revision blev liggande — OBS star kvar med den gamla designen');
  assert.equal(spar.applicerade.length, 2);
});

test('9 · en återanslutning MEDAN en hämtning pågår ger en ny hämtning', async () => {
  // Den har var orsaken till att bytet av sandning ibland drojde 400 ms extra: `ateranslot()` kom
  // medan en hamtning redan var i luften, och det svar som var pa vag hade gatt ivag FORE fragan.
  // Det svaret kan inte rakna som svar pa den — annars star kallan kvar med en konfiguration som
  // ar aldre an ateranslutningen sjalv.
  //
  // Hamtning 1 halls hangande med ett lofte provet sjalv slapper. `stega()` VANTAR IN det den kor,
  // sa steget far inte awaitas har — annars laser sig provet i stallet for att mata.
  let slapp;
  const vantan = new Promise(r => { slapp = r });
  const { sync, spar, stega } = rigg({
    hamtSvar: (n) => (n === 1 ? vantan.then(() => ({ revision: 5, widgets: [] })) : { revision: 9, widgets: [] }),
  });
  const nolla = () => new Promise(r => setImmediate(r));

  await sync.taEmot({ overlayId: 'A', revision: 5 });
  const steg = stega(HOPSLAGNING);          // startar hamtning 1 — som hanger
  await nolla();
  assert.equal(spar.hamtningar.length, 1, 'forsta hamtningen gick aldrig ivag');

  await sync.ateranslot();                  // fragan stalls MEDAN hamtning 1 ar i luften
  slapp();
  await steg;                               // nu far hamtning 1 komma hem
  await stega(0);
  await stega(HOPSLAGNING);
  assert.equal(spar.hamtningar.length, 2,
    'ateranslutningen fick nojja sig med ett svar som gick ivag innan den ens fragade');
});

test('10 · ett svar UTAN revision låser inte fast overlayn för all framtid', async () => {
  // Sentinelen bar en andra bugg som ingen hade sett. `nyRev` faller tillbaka pa `onskad` nar
  // svaret saknar revisionsfalt — och efter en `ateranslot()` VAR `onskad` MAX_SAFE_INTEGER. Da
  // blev `visad` MAX_SAFE_INTEGER, och varenda framtida sparning avvisades darefter av `taEmot`
  // som "gammal eller redan pa vag". Overlayen hade slutat ta emot andringar helt, resten av
  // sandningen, utan ett enda felmeddelande.
  //
  // Falt kan saknas pa riktigt: overlay-access.js skickar `Number(d.overlay?.version)`, och en
  // overlay utan `version` ger NaN.
  let varv = 0;
  const { sync, spar, stega } = rigg({
    hamtSvar: () => { varv++; return varv === 1 ? { widgets: [] } : { revision: 4, widgets: [] } },
  });
  await sync.ateranslot();
  await stega(0);
  assert.equal(spar.applicerade.length, 1, 'svaret utan revision applicerades inte');

  // En helt vanlig sparning efterat MASTE fortfarande na fram.
  await sync.taEmot({ overlayId: 'A', revision: 4 });
  await stega(HOPSLAGNING);
  assert.equal(spar.hamtningar.length, 2,
    'en sparning efter ett svar utan revision natt aldrig fram — overlayn ar last vid den design '
    + 'den rakade ha nar faltet saknades');
  assert.equal(spar.applicerade.length, 2);
});
