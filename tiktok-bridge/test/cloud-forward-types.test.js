'use strict';
// Vilka typer molnbryggan får posta till ingest-rutten — och varför det inte är "alla".
//
// TVÅ MÄTTA FEL, båda i den väg som ska köra i Railway när Davids dator är avstängd:
//
// 1. bridge.js:305 skickar `chatcommand` när en chattrad börjar med "!". Den typen finns inte i
//    server/index.js:72, så molnet svarar 400. Bryggan loggar det (bridge.js:216 kastar på !r.ok och
//    fångar med console.error) — alltså inte tyst, men en console.error per utropsteckenkommando
//    under hela sändningen, i en logg där riktiga fel ska synas.
//
// 2. VÄRRE: takten kollas FÖRE valideringen (server/index.js:108 före :111). Chatt är den
//    överlägset frekventaste typen under en aktiv sändning, och ingest-taket är 100 event/s per
//    workspace. Chatten kan alltså äta upp budgeten och få GÅVOR att avvisas med 429 — och gåvor
//    är det enda som betyder något för intäktsstatistiken. Ett event som avvisas där finns inte i
//    historiken, och det går inte att upptäcka i efterhand.
//
// Samma vitlista som electron-app/local-server.js fick: en okänd typ stannar hemma tills någon
// medvetet släpper fram den.
//
// ROTT NU: normalizer.js exporterar ingen sådan regel.
const test = require('node:test'), assert = require('node:assert/strict');
const N = require('../normalizer.js');
const fs = require('fs'), path = require('path');

// Molnets egen lista, server/index.js:72. Kopierad med flit: bryts kontraktet ska det här provet
// falla, inte tyst följa med.
const MOLNETS_TYPER = ['gift', 'like', 'likes', 'chat', 'follow', 'share', 'member', 'subscribe',
  'viewer', 'battle', 'guardian', 'subscriberemote', 'fanlevelup'];

test('regeln finns och är en funktion', () => {
  assert.equal(typeof N.tillMolnet, 'function', 'normalizer.js exporterar ingen tillMolnet-regel');
});

test('allt som släpps fram accepteras av molnet', () => {
  const avvisade = MOLNETS_TYPER.concat(['chatcommand', 'subscriberemote', 'nagotnytt', ''])
    .filter(t => N.tillMolnet(t) && !MOLNETS_TYPER.includes(t));
  assert.deepEqual(avvisade, [],
    `dessa släpps fram men avvisas av molnet med 400: ${avvisade.join(', ')}`);
});

test('chatcommand stoppas', () => {
  assert.equal(N.tillMolnet('chatcommand'), false,
    'chatcommand postas fortfarande och ger 400 — en console.error per utropsteckenkommando');
});

// Chatt är giltig för molnet men får ändå inte skickas: den äter takten och kan svälta gåvorna.
test('chatt stoppas på volym, inte på giltighet', () => {
  assert.equal(N.tillMolnet('chat'), false,
    'chatt äter ingest-takten (100/s) och kan få gåvor avvisade med 429');
  assert.ok(MOLNETS_TYPER.includes('chat'), 'kontrollprov: chatt ÄR giltig för molnet');
});

test('gåvor och likes släpps alltid fram', () => {
  for (const typ of ['gift', 'likes', 'like', 'follow', 'share', 'subscribe', 'member']) {
    assert.equal(N.tillMolnet(typ), true, `${typ} stoppades — statistiken blir ofullständig`);
  }
});

test('en okänd typ stannar hemma', () => {
  for (const typ of ['nagotheltnytt', '', null, undefined, 'GIFT ']) {
    assert.equal(N.tillMolnet(typ), false, `"${String(typ)}" släpptes fram`);
  }
});

// Vitlistan är värdelös om bridge.js inte använder den. Källkodskontroll: bridge.js ansluter till
// TikTok och går inte att köra i en testprocess.
const bridgeKod = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8')
  .split(/\r?\n/).map(r => r.replace(/\/\/[^\r\n]*/, '')).join('\n');

// PR #269: själva fetchen (url + huvuden + N.cloudEvent-bodyn) bor numera i livscykel.js —
// grinden behöver äga posten för att kunna buffra och ordna den. FILTRET ska dock sitta kvar på
// ANROPSPLATSEN i bridge.js: en typ som inte passerar tillMolnet får aldrig ens nå livscykeln,
// annars hade grindbufferten fyllts med typer som molnet ändå avvisar. Vakten följer båda halvorna.
test('bridge.js filtrerar molnanropet genom regeln på anropsplatsen', () => {
  const rad = bridgeKod.split('\n').find(l => /livscykel\.moln\(/.test(l));
  assert.ok(rad, 'hittade inget livscykel.moln-anrop i bridge.js');
  assert.match(rad, /tillMolnet\(/,
    `molnanropet filtrerar inte: ${rad.trim().slice(0, 160)}`);
});

test('livscykel.js äger molnpostningens url', () => {
  const livscykelKod = fs.readFileSync(path.join(__dirname, '..', 'livscykel.js'), 'utf8')
    .split(/\r?\n/).map(r => r.replace(/\/\/[^\r\n]*/, '')).join('\n');
  const rad = livscykelKod.split('\n').find(l => /\/api\/events\/tiktok\//.test(l));
  assert.ok(rad, 'hittade ingen molnpostnings-url i livscykel.js');
});

// Den LOKALA postningen ska vara oförändrad. Overlayen läser den, och den har inga typbegränsningar
// — att smyga in filtret där hade tystat chattwidgetar.
test('den lokala postningen filtreras inte', () => {
  const rad = bridgeKod.split('\n').find(l => /postJson\('\/api\/events'/.test(l));
  assert.ok(rad, 'hittade ingen lokal postning');
  assert.equal(/tillMolnet/.test(rad), false,
    'filtret hamnade på den lokala vägen — chattwidgetar i OBS hade slutat få händelser');
});

// ---- vakt: ett prov far bara ladda det dess EGET CI-jobb installerar -----------------------------
//
// Jobbet `test-tiktok-bridge` kor `npm ci` BARA i tiktok-bridge/ (ci.yml:314-328). Ett prov harifran
// som require:ar nagot utanfor katalogen far alltsa inte MALETS beroenden installerade, och faller i
// CI aven nar logiken ar ratt — det varsta slaget av rott: det ser ut som en bugg i koden och ar en
// bugg i provet.
//
// Uppmatt TVA ganger natten 2026-09-01→02: electron-app/tiktok-service.js (#308, drar in
// tiktok-live-connector) och server/event-bus.js (#309, drar in redis). Bada passerade lokalt
// eftersom beroendena lag pa plats dar.
//
// REGELN AR EN ALLOWLIST, INTE ETT FORBUD. Ett kors-paket-require gar bra om malet ar BEROENDEFRITT
// — server/security.js drar bara in node:crypto och har fungerat i CI hela tiden. Varje nytt
// undantag ska darfor vara ett medvetet beslut med ett skal, inte nagot som glider in.
//
// KOMMENTARER RAKNAS INTE. Forsta versionen av den har vakten foll pa sin egen dokumentation: en
// kommentar som NAMNDE ett forbjudet require lastes som ett require. En vakt som inte skiljer kod
// fran text mater fel sak.
//
// readFileSync ar OK och traffas inte: att LASA en fil kraver inga beroenden.
const KORS_PAKET_TILLATNA = new Map([
  ['../../server/security', 'drar bara in node:crypto — beroendefri']
]);

test('inget prov i tiktok-bridge/test laddar kod med obetalda beroenden', () => {
  // `[^\n]*` OCH INTE `.*$` — det ar skillnaden mellan att fungera pa bada plattformarna och pa en.
  // Forsta versionen kordes per rad med /\/\/.*$/. Pa Linux (LF) stripper den kommentaren; pa
  // Windows slutar raden med \r, och `.` matchar inte \r — sa `$` nas aldrig, matchningen
  // misslyckas och kommentaren star kvar. Vakten var alltsa GRON I CI och rod lokalt, for exakt
  // samma kod. En vakt som beror pa radslut mater operativsystemet, inte koden.
  const utanKommentarer = k => k
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  const trasiga = [];
  for (const fil of fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js'))) {
    const kod = utanKommentarer(fs.readFileSync(path.join(__dirname, fil), 'utf8'));
    for (const [, vag] of kod.matchAll(/require\(\s*['"](\.\.\/\.\.\/[^'"]+)['"]\s*\)/g)) {
      const nyckel = vag.replace(/\.js$/, '');
      if (!KORS_PAKET_TILLATNA.has(nyckel)) trasiga.push(`${fil} -> ${vag}`);
    }
  }
  assert.deepEqual(trasiga, [],
    'dessa require:ar når utanför tiktok-bridge/ utan att stå i allowlistan:\n  ' + trasiga.join('\n  '));
});

test('allowlistans undantag är fortfarande beroendefria', () => {
  // Ett undantag som SLUTAR vara beroendefritt ar en tickande bomb: provet gar gront lokalt och
  // faller i CI nasta gang nagon ror filen. Vakten laser malet och kraver att varje require dar
  // ar en node-inbyggd modul.
  for (const [vag, skal] of KORS_PAKET_TILLATNA) {
    const fil = path.join(__dirname, vag + '.js');
    assert.ok(fs.existsSync(fil), `allowlistan pekar på en fil som inte finns: ${vag}`);
    const kod = fs.readFileSync(fil, 'utf8');
    const beroenden = [...kod.matchAll(/require\(\s*['"]([^'".][^'"]*)['"]\s*\)/g)]
      .map(m => m[1])
      .filter(m => !require('module').isBuiltin(m.replace(/^node:/, '')));
    assert.deepEqual(beroenden, [],
      `${vag} är inte längre beroendefri (${skal}) — den drar in: ${beroenden.join(', ')}`);
  }
});
