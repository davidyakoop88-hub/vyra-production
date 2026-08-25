'use strict';
// KLIENTENS LIVESESSION-HANTERING — Del B av sandningsidentiteten (PR #270).
//
// Servermodellen (#268) och bryggan (#269) ligger dormant pa main. Utkorgsworkern (Del A) ar
// pulsgivaren som far raderna ur `stream_event_outbox` ut pa bussen. Da aterstar mottagaren:
// varje OBS-kalla och Studio-canvasen maste kunna byta sandning UTAN omladdning, och maste gora
// det EN gang aven nar samma besked kommer flera ganger.
//
// UPPMATT LEVERANSKEDJA (2026-08-24, docs/worker-och-klient-design.md): ramarna behover INGEN ny
// transport. `publishInternal` lagger dem pa samma kanal som vanliga liveevent, goal-sse skickar
// varje `{event, streamId}` som `event: live` till alla strommar i workspacet, och
// overlay-access.js ger dem till `VyraLive.ingest`. Det som saknas ar tva saker:
//   1. UPPSTARTSLUCKAN. En kalla som oppnas MITT i en sandning har missat `live:start` — den ramen
//      kommer aldrig igen. Darfor bar bootstrapsvaret ett auktoritativt snapshot.
//   2. IDEMPOTENSEN. Ateranslutning, replay och snapshot levererar samma logiska handelse igen.
//
// DEDUPE OCH AKTIV SESSION AR TVA OLIKA SAKER (Davids punkt 1): dedupen ligger pa `eventId`
// (`live:start:<id>` och `live:end:<id>` ar TVA handelser), aldrig pa sessionId ensamt — hade den
// gjort det hade endet avfardats som "redan sett" eftersom starten redan burit samma id.
//
// Modulen ar ren: lagring, signal och konfig-omhamtning ar injicerade, sa hela kontraktet gar att
// prova utan webblasare och utan klocka som far ta tid.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

let skapaLiveSession = null;
try { ({ skapaLiveSession } = require(path.join(__dirname, '..', 'live-session-client.js'))) }
catch (_) {}

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';

// En sessionStorage-attrapp som RAKNAR skrivningar. Dormantprovet nedan bevisar inte bara att
// ingenting hander — det bevisar att ingenting SKREVS.
function lagring(start) {
  const data = new Map(Object.entries(start || {}));
  const spar = { skrivningar: 0, borttag: 0 };
  return {
    spar,
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { spar.skrivningar++; data.set(k, String(v)) },
    removeItem: k => { spar.borttag++; data.delete(k) },
    dump: () => Object.fromEntries(data),
  };
}

function rigg(start) {
  assert.ok(skapaLiveSession, 'live-session-client.js finns inte an — modulen som ager dedupen');
  const lag = lagring(start);
  const signaler = [];
  const omhamtningar = [];
  const session = skapaLiveSession({
    lagring: lag,
    signalera: (namn, detalj) => signaler.push({ namn, detalj }),
    konfigOmhamtning: () => omhamtningar.push(true),
    logg: () => {},
  });
  return { session, lag, signaler, omhamtningar };
}

const startram = (id, extra) => ({ type: 'livesession', event: 'live:start',
  eventId: 'live:start:' + id, sessionId: id, startedAt: '2026-08-25T09:00:00.000Z', ...extra });
const endram = (id, extra) => ({ type: 'livesession', event: 'live:end',
  eventId: 'live:end:' + id, sessionId: id, endedAt: '2026-08-25T10:00:00.000Z', ...extra });

// ---- 1 · SNAPSHOTET STANGER UPPSTARTSLUCKAN --------------------------------------------------
test('B1 · snapshot med sessionId gor sessionen aktiv och signalerar en gang', () => {
  const r = rigg();
  r.session.bootstrap({ overlay: {}, session: { sessionId: S1, startedAt: '2026-08-25T09:00:00.000Z' } });
  assert.equal(r.session.aktivSession(), S1);
  assert.deepEqual(r.signaler.map(s => s.namn), ['vyra-live-session']);
  assert.equal(r.signaler[0].detalj.sessionId, S1);
  assert.equal(r.signaler[0].detalj.event, 'live:start');
  assert.equal(r.omhamtningar.length, 1, 'en ny sandning ska ge en konfig-omhamtning');
});

test('B2 · snapshot och SSE-ram for SAMMA session ger EN behandling', () => {
  const r = rigg();
  r.session.bootstrap({ session: { sessionId: S1, startedAt: '2026-08-25T09:00:00.000Z' } });
  r.session.behandla(startram(S1));                       // samma logiska handelse igen
  assert.equal(r.signaler.length, 1, 'snapshotet och ramen behandlades bada');
  assert.equal(r.session.aktivSession(), S1);
});

test('B3 · flaggan av — session-faltet saknas helt: ingen skrivning, ingen signal', () => {
  const r = rigg();
  const ut = r.session.bootstrap({ ok: true, overlay: { id: 'A', state: {}, version: 3 } });
  assert.equal(ut.atgard, 'dormant');
  assert.equal(r.signaler.length, 0, 'dormant klient signalerade anda');
  assert.equal(r.omhamtningar.length, 0, 'dormant klient hamtade om konfigurationen');
  assert.equal(r.lag.spar.skrivningar, 0, 'dormant klient skrev i sessionStorage');
  assert.equal(r.lag.spar.borttag, 0, 'dormant klient tog bort en nyckel');
  assert.equal(r.session.aktivSession(), null);
});

// ---- 2 · DEDUPEN ------------------------------------------------------------------------------
test('B4 · samma eventId igen ar en no-op oavsett transport-id', () => {
  const r = rigg();
  r.session.behandla(startram(S1), 'strom-1');
  r.session.behandla(startram(S1), 'strom-2');            // replay efter ateranslutning
  r.session.behandla(startram(S1), 'strom-3');
  assert.equal(r.signaler.length, 1, 'olika transport-id gav flera behandlingar');
  assert.equal(r.omhamtningar.length, 1);
});

test('B5 · live:start och live:end for samma session ar TVA handelser', () => {
  const r = rigg();
  r.session.behandla(startram(S1));
  r.session.behandla(endram(S1));
  assert.equal(r.session.aktivSession(), null, 'endet avfardades som redan sett');
  assert.deepEqual(r.signaler.map(s => s.detalj.event), ['live:start', 'live:end']);
});

test('B6 · end(gammal) efter start(ny) ar en no-op', () => {
  const r = rigg();
  r.session.behandla(startram(S1));
  r.session.behandla(startram(S2));
  r.session.behandla(endram(S1));                          // sen ram fran den forra sandningen
  assert.equal(r.session.aktivSession(), S2, 'ett gammalt end backade den aktiva sessionen');
  assert.deepEqual(r.signaler.map(s => s.detalj.event), ['live:start', 'live:start']);
});

test('B7 · trasiga ramar behandlas aldrig', () => {
  const r = rigg();
  const avvisade = [
    { type: 'gift', event: 'live:start', eventId: 'live:start:' + S1, sessionId: S1 },
    { type: 'livesession', event: 'live:paus', eventId: 'live:paus:' + S1, sessionId: S1 },
    { type: 'livesession', event: 'live:start', eventId: 'live:start:' + S2, sessionId: S1 },
    { type: 'livesession', event: 'live:start', eventId: 'live:start:x', sessionId: 'x' },
    null, undefined, 'live:start',
  ];
  for (const ram of avvisade) assert.equal(r.session.behandla(ram).atgard, 'ignorerad');
  assert.equal(r.signaler.length, 0);
  assert.equal(r.session.aktivSession(), null);
});

// ---- 3 · BOOTSTRAP/SSE-RACET (Davids punkt 3) -------------------------------------------------
test('B8 · (a) snapshot null forst, sedan start-ram => aktiv', () => {
  const r = rigg();
  r.session.bootstrap({ session: null });
  assert.equal(r.session.aktivSession(), null);
  r.session.behandla(startram(S1));
  assert.equal(r.session.aktivSession(), S1);
});

test('B9 · (b) start-ram medan refetch pagar, refetchen svarar null => aktiv bestar', () => {
  const r = rigg();
  const biljett = r.session.borjaHamtning();               // refetchen gar ivag
  r.session.behandla(startram(S1));                        // ramen hann fore svaret
  const ut = r.session.bootstrap({ session: null }, biljett);
  assert.equal(ut.atgard, 'ignorerad-gammal');
  assert.equal(r.session.aktivSession(), S1, 'ett aldre null-snapshot skrev over en nyare start');
});

test('B10 · (c) snapshot ny session + replay end(old)+start(new) => new aktiv', () => {
  const r = rigg({ 'vyra-live-session-aktiv': S1 });
  r.session.bootstrap({ session: { sessionId: S2, startedAt: '2026-08-25T09:00:00.000Z' } });
  r.session.behandla(endram(S1));
  r.session.behandla(startram(S2));
  assert.equal(r.session.aktivSession(), S2);
});

test('B11 · (d) alla tre vagarna landar i samma aktiva session', () => {
  const via = [];
  { const r = rigg(); r.session.bootstrap({ session: { sessionId: S2, startedAt: 'x' } });
    r.session.behandla(endram(S1)); r.session.behandla(startram(S2)); via.push(r.session.aktivSession()) }
  { const r = rigg(); r.session.behandla(endram(S1)); r.session.behandla(startram(S2));
    r.session.bootstrap({ session: { sessionId: S2, startedAt: 'x' } }); via.push(r.session.aktivSession()) }
  { const r = rigg(); r.session.behandla(endram(S1));
    r.session.bootstrap({ session: { sessionId: S2, startedAt: 'x' } });
    r.session.behandla(startram(S2)); via.push(r.session.aktivSession()) }
  assert.deepEqual(via, [S2, S2, S2]);
});

// OMSKRIVET 2026-08-25. Provet beskrev den GAMLA regeln ("en senare null ignoreras alltid"), och
// den regeln lamnade en verklig lucka oppen: missas `live:end` under ett SSE-avbrott kommer ramen
// aldrig igen, och klienten stod kvar i den avslutade sandningen for alltid. Snapshotet MASTE
// kunna avsluta. Det som skyddar mot racet ar nu generationen, inte innehallet.
test('B12 · MISSAT live:end: reconnect-snapshot med null avslutar den gamla sessionen', () => {
  const r = rigg();
  r.session.behandla(startram(S1));
  assert.equal(r.session.aktivSession(), S1);
  // Stromtappet: `live:end:S1` publiceras men klienten ar inte dar. Vid ateranslutningen hamtas
  // bootstrappen om, och ingen ram har behandlats under tiden.
  const biljett = r.session.borjaHamtning();
  const ut = r.session.bootstrap({ session: null }, biljett);
  assert.equal(ut.atgard, 'behandlad');
  assert.equal(r.session.aktivSession(), null, 'klienten star kvar i en sandning som tog slut');
  assert.deepEqual(r.signaler.map(s => s.detalj.event), ['live:start', 'live:end']);
});

test('B12b · ett GAMMALT start(old)-snapshot skriver inte over en nyare start(new)', () => {
  const r = rigg();
  const biljett = r.session.borjaHamtning();               // refetchen gar ivag under sandning S1
  r.session.behandla(startram(S2));                        // ny sandning hinner fore svaret
  const ut = r.session.bootstrap({ session: { sessionId: S1, startedAt: 'x' } }, biljett);
  assert.equal(ut.atgard, 'ignorerad-gammal');
  assert.equal(r.session.aktivSession(), S2, 'ett gammalt start-snapshot backade sessionen');
});

test('B12c · en dedupad ram stegar INTE generationen — snapshotet ar fortfarande fart', () => {
  const r = rigg();
  r.session.behandla(startram(S1));
  const biljett = r.session.borjaHamtning();
  r.session.behandla(startram(S1));                        // replay, redan behandlad => no-op
  const ut = r.session.bootstrap({ session: null }, biljett);
  assert.equal(ut.atgard, 'behandlad',
    'en ram utan ny information gjorde snapshotet gammalt');
  assert.equal(r.session.aktivSession(), null);
});

test('B13 · initialt snapshot null nedgraderar en sparad aktiv session', () => {
  // Samma flik, ny sidladdning: sessionStorage sager att S1 var aktiv, men servern sager
  // auktoritativt att ingen sandning pagar. Snapshotet vinner — det ar hela poangen med det.
  const r = rigg({ 'vyra-live-session-aktiv': S1 });
  r.session.bootstrap({ session: null });
  assert.equal(r.session.aktivSession(), null);
  assert.deepEqual(r.signaler.map(s => s.detalj.event), ['live:end']);
});

// ---- 4 · LAGRINGEN ----------------------------------------------------------------------------
test('B14 · behandlade eventId overlever en ny modulinstans i samma flik', () => {
  const lag = lagring();
  const bygg = () => skapaLiveSession({ lagring: lag, signalera: () => {}, konfigOmhamtning: () => {} });
  bygg().behandla(startram(S1));
  const andra = bygg();                                    // sidan laddades om i samma flik
  assert.equal(andra.aktivSession(), S1);
  assert.equal(andra.behandla(startram(S1)).atgard, 'redan-behandlad');
});

test('B15 · listan av behandlade eventId har taket 16 och aldst faller forst', () => {
  const r = rigg();
  for (let i = 0; i < 10; i++) {
    const id = `0000${String(i).padStart(4, '0')}-0000-4000-8000-000000000000`;
    r.session.behandla(startram(id));
    r.session.behandla(endram(id));
  }
  const lista = JSON.parse(r.lag.dump()['vyra-live-session-hanterade']);
  assert.equal(lista.length, 16, 'taket 16 holls inte');
  assert.equal(lista[0], 'live:start:00000002-0000-4000-8000-000000000000', 'fel ande foll bort');
  assert.equal(lista[15], 'live:end:00000009-0000-4000-8000-000000000000');
});

// UTKORGEN AR AT-LEAST-ONCE. Redis-publiceringen och databaskvittensen ar tva steg; en krasch,
// en timeout eller en deployvaxling daremellan ger en publicering UTAN kvittens, och nasta varv
// publicerar raden igen (bevisat serversidan i server/test/stream-worker.test.js, provet om den
// langsamma batchen). Ramen ar da byte for byte densamma — samma eventId, samma payload.
//
// Det ar HAR den blir ofarlig. Utan dedupen hade varje ompublicering nollstallt mal, kampanjer
// och topplistor mitt i sandningen.
test('B16a · ompublicerat event (kvittensen uteblev) ger INGEN andra reset', () => {
  const r = rigg();
  const ram = startram(S1);
  r.session.behandla(ram);
  r.session.behandla(JSON.parse(JSON.stringify(ram)));      // samma rad, nytt varv, ny publicering
  r.session.behandla(JSON.parse(JSON.stringify(ram)));
  assert.equal(r.signaler.length, 1, 'en ompublicering nollstallde sandningen igen');
  assert.equal(r.omhamtningar.length, 1, 'en ompublicering hamtade om konfigurationen igen');
  assert.equal(r.session.aktivSession(), S1);
});

test('B16 · tva browserkallor pa samma origin blockerar inte varandra', () => {
  const a = rigg(), b = rigg();                            // varsin sessionStorage, samma origin
  a.session.behandla(startram(S1));
  assert.equal(b.session.behandla(startram(S1)).atgard, 'behandlad',
    'den ena kallans behandling blockerade den andras');
  assert.equal(b.session.aktivSession(), S1);
});

test('B17 · en lagring som kastar far aldrig fanga hanteringen', () => {
  const trasig = { getItem: () => { throw new Error('nekad') },
    setItem: () => { throw new Error('nekad') }, removeItem: () => { throw new Error('nekad') } };
  const signaler = [];
  const session = skapaLiveSession({ lagring: trasig, signalera: (n, d) => signaler.push(d),
    konfigOmhamtning: () => {} });
  assert.equal(session.behandla(startram(S1)).atgard, 'behandlad');
  assert.equal(session.aktivSession(), S1);
  assert.equal(signaler.length, 1);
});
