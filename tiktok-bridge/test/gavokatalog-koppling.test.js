'use strict';
// RIKTIGT KOPPLINGSPROV — katalogobservationen genom bryggans VERKLIGA anslutningsväg.
//
// Enhetsprovet i gavokatalog-observation.test.js bevisar modulen isolerat. Det räcker inte som
// integrationsbevis: där kopplas en lokal livscykelspion som aldrig varit i närheten av bryggan,
// så provet kan bara visa att observatorn inte anropar något den heller aldrig fick. Det här
// provet kör i stället `node bridge.js <konto>` i en FORKAD process med flaggan PÅ och en fejkad
// tiktok-live-connector (preload — test/hjalp/fejk-katalog-preload.js), och mäter livscykeln som
// den faktiskt observeras: träffarna på mock-molnet.
//
// Bevisas här:
//   1. Ett 403 från katalogen stoppar inte registrering, live:start eller eventflödet.
//   2. En katalog som ALDRIG svarar stoppar dem inte heller — processen avslutas normalt.
//   3. Katalogen hämtas exakt EN gång per anslutning, genom den riktiga connect().then-vägen.
//   4. Bryggan skickar ingen signApiKey — eller någon annan signeringsnyckel — till anslutningen.
//
// Alla värden är syntetiska.
const test = require('node:test'), assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const TOKEN = 'kopplingsprov-' + 'x'.repeat(33);
const WS = 'ws-kopplingsprov';
const KONTO = 'provkonto060';

// Startar mock-molnet, kör den verkliga bryggan i en fork och returnerar allt som observerades.
async function korBrygga({ lage, livstidMs = 2600, timeout = 30000, proxyLista = '' }) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      requests.push({ url: req.url, method: req.method, body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const env = { ...process.env,
    VYRA_CLOUD_URL: `http://127.0.0.1:${port}`,
    VYRA_WORKSPACE_ID: WS,
    VYRA_INGEST_TOKEN: TOKEN,
    VYRA_SANDNINGSIDENTITET: '1',        // PÅ — annars finns ingen livscykel att störa
    PROV_KATALOG_LAGE: lage,
    PROV_LIVSTID_MS: String(livstidMs),
    PROXY_LIST: proxyLista,
  };
  delete env.VYRA_SERVER_URL;            // molnläge

  const preload = path.join(__dirname, 'hjalp', 'fejk-katalog-preload.js');
  const child = fork(path.join(__dirname, '..', 'bridge.js'), [KONTO], {
    env, execArgv: ['-r', preload], silent: true,
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d; });
  child.stderr.on('data', d => { stderr += d; });

  const doda = setTimeout(() => child.kill('SIGKILL'), timeout);
  const kod = await new Promise(r => child.on('exit', r));
  clearTimeout(doda);
  await new Promise(r => server.close(r));

  const rad = m => (stdout.split('\n').find(r => r.includes(m)) || '').trim();
  return {
    kod, stdout, stderr, requests,
    liveRuns: requests.filter(r => r.url.includes('/api/live-runs')),
    liveSessions: requests.filter(r => r.url.includes('/api/live-sessions')),
    katalogAnrop: Number((rad('[fejk] katalogAnrop=').split('=')[1] || '0')),
    connOptionsKeys: (rad('[fejk] connOptionsKeys=').split('=')[1] || '').split(',').filter(Boolean),
    katalogRad: rad('[gavokatalog]'),
  };
}

// ---- 1. KATALOGFEL STOPPAR INTE LIVSCYKELN ----------------------------------------------------

test('403 från katalogen: registrering och live:start går igenom ändå', { timeout: 40000 }, async () => {
  const r = await korBrygga({ lage: 'kast' });

  assert.equal(r.kod, 0, `bryggan dog med kod ${r.kod}. stderr: ${r.stderr.slice(0, 400)}`);
  assert.ok(r.liveRuns.length >= 1, 'registreringen (/api/live-runs) ska ha skett trots katalogfelet');
  assert.ok(r.liveSessions.length >= 1, 'live:start (/api/live-sessions) ska ha skett trots katalogfelet');

  // Felet ska ha loggats som KATEGORI — och observationen ska ha kört, inte hoppats över.
  assert.ok(r.katalogRad.includes('http_403'), 'katalograden ska bära kategorin, inte meddelandet');
  assert.ok(!r.katalogRad.includes('nekades'), 'meddelandetexten får aldrig loggas');
});

test('en katalog som ALDRIG svarar blockerar inte livscykeln', { timeout: 40000 }, async () => {
  // Observatorns timeout är 4 s. Processen lever 2,6 s — kortare än så MED FLIT: hade
  // katalogen kunnat blockera hade live-anropen uteblivit helt.
  const r = await korBrygga({ lage: 'hanger', livstidMs: 2600 });

  assert.equal(r.kod, 0, 'processen ska avslutas normalt även med en hängande katalog');
  assert.ok(r.liveRuns.length >= 1, 'registreringen får inte vänta på katalogen');
  assert.ok(r.liveSessions.length >= 1, 'live:start får inte vänta på katalogen');
  assert.equal(r.katalogRad, '', 'inget svar hann komma — och ingen rad ska ha skrivits i förtid');
});

test('hängande katalog: timeouten slår till och loggas, livscykeln redan klar', { timeout: 40000 }, async () => {
  // Samma läge, men processen lever förbi observatorns 4 s-tak.
  const r = await korBrygga({ lage: 'hanger', livstidMs: 6000 });

  assert.equal(r.kod, 0);
  assert.ok(r.liveRuns.length >= 1);
  assert.ok(r.katalogRad.includes('timeout'), 'timeouten ska ha rapporterats');
  assert.ok(r.katalogRad.includes('"ok":false'));
});

// ---- 2. EXAKT ETT ANROP GENOM DEN RIKTIGA VÄGEN -----------------------------------------------

test('katalogen hämtas exakt en gång per anslutning', { timeout: 40000 }, async () => {
  const r = await korBrygga({ lage: 'ok' });

  assert.equal(r.kod, 0);
  assert.equal(r.katalogAnrop, 1, 'högst ett kataloganrop per anslutning — mätt i den riktiga vägen');
  assert.ok(r.katalogRad.includes('"heartMeTraffar":1'), 'den syntetiska katalogen har exakt en Heart Me');
  assert.ok(r.katalogRad.includes('"poster":2'));

  // Redigeringen håller även här: inga namn eller id ur katalogen i loggen.
  assert.ok(!r.katalogRad.includes('Heart Me'), 'gåvonamn får aldrig loggas');
  assert.ok(!r.katalogRad.includes('6247') && !r.katalogRad.includes('5487'), 'giftId får aldrig loggas');
});

// ---- 3. INGEN SIGNERINGSNYCKEL SKICKAS TILL ANSLUTNINGEN --------------------------------------

test('bryggan skickar ingen signApiKey till TikTokLiveConnection', { timeout: 40000 }, async () => {
  const r = await korBrygga({ lage: 'ok' });
  assert.equal(r.kod, 0);

  // EXAKT nyckellista, inte "saknar signApiKey". Utan proxy bygger bridge.js `options = {}`
  // (rad 352-354), sa listan ska vara TOM. En assertion pa "innehaller inte signApiKey" hade
  // passerat tomt-sant och fortsatt passera aven om nagon senare la till nyckeln i ett annat
  // sammanhang — den har faller pa VARJE ny toppniva-option.
  assert.deepEqual(r.connOptionsKeys, [],
    'bryggan ska skicka en tom optionslista utan proxy — nagon har lagt till en option');

  assert.ok(r.stdout.includes('[fejk] connOptionsKeys='),
    'preloaden ska ha rapporterat konstruktorns nycklar — annars mater provet ingenting');
});

test('KONTROLLMATNING: nyckellistan lases verkligen — med proxy syns webClientOptions', { timeout: 40000 }, async () => {
  // Utan den har halvan bevisar provet ovan ingenting: en lista som alltid ar tom skulle ocksa
  // ge deepEqual([]). Med en proxy satt MASTE exakt en nyckel dyka upp.
  const r = await korBrygga({ lage: 'ok', proxyLista: 'http://127.0.0.1:9/' });
  assert.deepEqual(r.connOptionsKeys, ['webClientOptions'],
    'med PROXY_LIST satt ska precis webClientOptions passera — och inget signeringsfalt');
});

test('KALLKODSVAKT: ingen signeringsnyckel konfigureras nagonstans i bryggan', () => {
  // signApiKey skrivs enligt bibliotekets README till den GLOBALA SignConfig.apiKey. Den vagen
  // syns inte i konstruktorns options, sa den maste vaktas i kallkoden.
  const fs = require('node:fs'), path = require('node:path');
  const dir = path.join(__dirname, '..');
  const filer = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  assert.ok(filer.length >= 5, 'vakten ska lasa bryggans kallfiler');

  // ANKRA PA KONFIGURATIONSSYNTAX, inte pa ordet. En ren substrangsokning traffar prosa: den
  // har filens egen huvudkommentar namner signApiKey nar den forklarar VARFOR observationen
  // behovs, och vakten fallde sig sjalv pa den. Vi forbjuder tilldelning och propertyanvandning.
  const forbjudna = [
    [/signApiKey\s*[:=]/, 'signApiKey'],
    [/SignConfig\s*[.[]/, 'SignConfig'],
    [/eulerApiInstance\s*[:=]/, 'eulerApiInstance'],
    [/signServerUrl\s*[:=]/, 'signServerUrl'],
  ];
  for (const fil of filer) {
    const kall = fs.readFileSync(path.join(dir, fil), 'utf8');
    for (const [monster, namn] of forbjudna) {
      assert.ok(!monster.test(kall), `${fil} konfigurerar ${namn} — signering ska inte satas har`);
    }
  }

  // KONTROLLMATNING: vakten kan faktiskt falla. Samma monster mot en konstruerad rad ska traffa,
  // annars vaktar den ingenting.
  assert.ok(/signApiKey\s*[:=]/.test('const o = { signApiKey: "x" };'), 'monstret maste kunna traffa');
  assert.ok(!/signApiKey\s*[:=]/.test('// namner signApiKey i prosa'), 'prosa ska inte traffa');
});
