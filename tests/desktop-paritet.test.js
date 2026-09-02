'use strict';
// Skrivbordsappens egen TikTok-anslutning ska se samma sak som molnbryggan.
//
// VYRA har TVÅ vägar in från TikTok, och de delar ingen kod:
//
//   tiktok-bridge/normalizer.js        molnvägen, körs i Railway
//   electron-app/tiktok-service.js     desktopvägen, körs lokalt i Electron
//
// De matar SAMMA widgetar. Glider de isär fungerar en widget på ena vägen och är död på den andra,
// och ingenting säger vilken väg användaren kör. Natten 2026-09-01→02 fixades fyra saker på
// molnvägen (#301, #304, #305, #307) — desktopvägen fick ingen av dem.
//
// UPPMÄTT I SKARP SÄNDNING, inte antaget (inspelning 2026-09-01, 3710 rader):
//
//   uniqueId          0 av 1333 event bar faltet          -> username blev TOMT
//   fansClub          0 forekomster i hela inspelningen   -> fanClubLevel blev alltid 0
//   payGrade.level    0 i alla 1226 forekomster           -> gifterLevel fanns inte ens
//   badgeList         sceneType 10 = fanklubb (1269 st), sceneType 8 = niva (938 st)
//
// DEN ALLVARLIGASTE ÄR DEN FÖRSTA. `username` byggdes ur `uniqueId`, som biblioteket slutat
// skicka. Varje event på desktopvägen är därför NAMNLÖST — inte bara nivåerna, utan gåvor,
// följare, allt. Bryggan klarade sig för att `baseUser` där redan föll tillbaka på `displayId`.
//
// EMOTES ÄR REDAN PÅ PLATS på desktopvägen och rörs inte. Desktop läste `emoteList[0].emoteId` och
// `image.urlList[0]` långt före #307 — två oberoende implementationer landade på samma form, vilket
// är en oberoende bekräftelse på att #307 läser rätt fält.
//
// RÖTT NU: tiktok-service.js exporterar inga rena hjälpare, läser fansClub/uniqueId, saknar
// gifterLevel och lyssnar inte på BARRAGE.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROT, f), 'utf8');
const DESKTOP = las('electron-app/tiktok-service.js');
const LOKAL = las('electron-app/local-server.js');

// tiktok-fields.js, INTE tiktok-service.js: tjansten gor require('tiktok-live-connector') pa
// modulniva, och den modulen finns bara i electron-app/node_modules medan CI kor `npm ci` i ROTEN.
// Ett prov som laddade tjansten foll darfor i CI aven nar logiken var ratt. Falten ar utbrutna till
// en fil med NOLL beroenden, precis som tiktok-bridge/normalizer.js.
const T = require(path.join(ROT, 'electron-app/tiktok-fields.js'));
const N = require(path.join(ROT, 'tiktok-bridge/normalizer.js'));

// ---- verklig payload ur inspelningen -------------------------------------------------------------

const badge = (sceneType, level) => ({
  sceneType, displayType: 4, position: 1,
  privilegeLogExtra: { level: String(level) }
});

const anv = (over = {}) => ({
  user: Object.assign({
    id: 'id#5c67f361',
    displayId: 'lisa',            // uniqueId finns INTE i biblioteket — 0 av 1333 event
    nickname: 'Lisa',
    avatarThumb: { urlList: ['https://cdn/a.jpg'] },
    payGrade: { level: 0 },       // finns, men alltid 0
    badgeList: [badge(1, 0), badge(8, 34), badge(10, 50), badge(16, 0)]
  }, over)
});

// ---- 1. namnet, det som gör alla event namnlösa ---------------------------------------------------

test('username faller tillbaka på displayId', () => {
  assert.equal(typeof T.baseUser, 'function',
    'tiktok-fields.js exporterar ingen baseUser — går inte att prova');
  const u = T.baseUser(anv());
  assert.equal(u.username, 'lisa',
    'username är tomt — uniqueId finns inte i biblioteket, varje desktop-event blir namnlöst');
  assert.equal(u.name, 'Lisa');
});

test('samma namn som molnvägen ger', () => {
  // Bada vagarna matar samma widgetar. Ger de olika namn ser anvandaren olika saker beroende pa
  // vilken vag som rakar vara igang — och ingenting sager vilken det ar.
  assert.equal(T.baseUser(anv()).username, N.baseUser(anv()).username);
});

// ---- 2. nivåerna ----------------------------------------------------------------------------------

test('fanClubLevel läses ur badgeList sceneType 10', () => {
  assert.equal(T.baseUser(anv()).fanClubLevel, 50, 'fanClubLevel är 0 — Fan Level Up är död på desktop');
});

test('gifterLevel finns och läses ur badgeList sceneType 8', () => {
  assert.equal(T.baseUser(anv()).gifterLevel, 34,
    'gifterLevel saknas helt på desktopvägen — Gifter Level Up kan aldrig tända');
});

test('badgen vinner över payGrade.level, som alltid är 0', () => {
  assert.equal(T.baseUser(anv()).gifterLevel, 34, 'payGrade.level=0 vann över badgens 34');
});

test('badgen vinner över en reserv som säger något annat', () => {
  // Foretradet ar ett medvetet val, inte en slump: badgen ar uppmatt och payGrade ar tomt i all
  // verklig trafik. Skulle TikTok aterinfora faltet med ett foraldrat varde ska badgen anda vinna.
  // Samma prov finns pa bryggsidan (#305) — de tva vagarna maste ranga kallorna likadant, annars
  // visar de olika siffror for samma person.
  const u = T.baseUser(anv({ fansClub: { data: { level: 3 } }, payGrade: { level: 9 } }));
  assert.equal(u.fanClubLevel, 50, 'reserven vann över den uppmätta badgen');
  assert.equal(u.gifterLevel, 34, 'reserven vann över den uppmätta badgen');
});

test('nivåerna blir identiska med molnvägens', () => {
  const d = T.baseUser(anv()), m = N.baseUser(anv());
  assert.equal(d.fanClubLevel, m.fanClubLevel, 'fanClubLevel skiljer mellan desktop och moln');
  assert.equal(d.gifterLevel, m.gifterLevel, 'gifterLevel skiljer mellan desktop och moln');
});

test('en tittare utan badges ger 0, inte NaN', () => {
  const u = T.baseUser({ user: { displayId: 'ny', nickname: 'Ny' } });
  assert.equal(u.fanClubLevel, 0);
  assert.equal(u.gifterLevel, 0);
});

test('de gamla fälten fungerar som reserv', () => {
  const u = T.baseUser({ user: { displayId: 'a', fansClub: { data: { level: 7 } }, payGrade: { level: 12 } } });
  assert.equal(u.fanClubLevel, 7);
  assert.equal(u.gifterLevel, 12);
});

// ---- 3. Guardian ----------------------------------------------------------------------------------

test('desktop lyssnar på BARRAGE och skickar guardian', () => {
  assert.match(DESKTOP, /WebcastEvent\.BARRAGE/,
    'desktop lyssnar inte på BARRAGE — Guardian Emblem är död på desktopvägen');
  assert.match(DESKTOP, /emit\('guardian'/, "desktop skickar inget 'guardian'");
});

test('desktops guardian-regel ger samma svar som bryggans, indata for indata', () => {
  // REGELN AR MEDVETET KOPIERAD, inte delad. electron-builder paketerar en EXPLICIT filnamnslista
  // (electron-app/package.json build.files); en require utanfor electron-app/ hade saknats i .exe:n
  // och kraschat appen vid start med "Cannot find module". Kopian ar priset for paketerbarhet —
  // och det har provet ar vad priset kostar: bada implementationerna korda mot samma tabell.
  const fall = [
    { subType: 'guardian_entrance' },
    { scene: 'guardian_entrance' },
    { subType: 'GUARDIAN_ENTRANCE' },
    { subType: ' guardian_entrance ' },
    { subType: 'fans_entrance' },
    { subType: 'fans_upgrade' },
    { subType: 'user_level_entrance' },
    { subType: 'guardian_shield_card_used' },
    { subType: 'guardian' },
    { subType: 'guardian_entrance_v2' },
    { giftDetails: { giftName: 'Guardian Wings' } },
    {}, null, undefined
  ];
  for (const f of fall) {
    assert.equal(T.arGuardianEntrance(f), N.arGuardianEntrance(f),
      `desktop och bryggan är oense om ${JSON.stringify(f)}`);
  }
  // Och regeln maste faktiskt saga JA nagon gang — annars ar likheten ovan meningslos.
  assert.equal(T.arGuardianEntrance({ subType: 'guardian_entrance' }), true);
  assert.equal(T.arGuardianEntrance({ giftDetails: { giftName: 'Guardian Wings' } }), false,
    'gåvan "Guardian Wings" tände emblemet');
});

test('desktop kopplar regeln till BARRAGE', () => {
  assert.match(DESKTOP, /WebcastEvent\.BARRAGE/,
    'desktop lyssnar inte på BARRAGE — Guardian Emblem är död på desktopvägen');
  assert.match(DESKTOP, /arGuardianEntrance\(data\)/, 'lyssnaren använder inte regeln');
  assert.match(DESKTOP, /emit\('guardian'/, "desktop skickar inget 'guardian'");
});

test('inget kors-paket-require: allt tjansten laddar maste ga att paketera', () => {
  // .exe:n bygger ur en EXPLICIT filnamnslista relativt electron-app/. En require till en fil
  // utanfor den katalogen hamnar aldrig i paketet, och appen kraschar vid START — inte i ett prov.
  const kors = [...DESKTOP.matchAll(/require\('(\.\.[^']*)'\)/g)].map(m => m[1]);
  assert.deepEqual(kors, [],
    `tiktok-service.js kräver filer utanför electron-app/: ${kors.join(', ')} — de packas inte in`);
});

test('varje lokal require finns med i build.files', () => {
  // Samma falla som Dockerfilens COPY-lista: filen finns i repot, provet ar gront, och .exe:n
  // saknar den. Uppmatt risk — tiktok-fields.js var inte med forsta gangen.
  const pkg = JSON.parse(las('electron-app/package.json'));
  const filer = new Set(pkg.build.files);
  const lokala = [...DESKTOP.matchAll(/require\('\.\/([^']+)'\)/g)].map(m => m[1]);
  const saknas = lokala.map(f => f.endsWith('.js') ? f : f + '.js').filter(f => !filer.has(f));
  assert.deepEqual(saknas, [],
    `dessa laddas av tiktok-service.js men packas inte in i .exe:n: ${saknas.join(', ')}`);
});

// ---- 4. emotes rördes inte -------------------------------------------------------------------------

test('emote-hanteringen finns kvar oförändrad', () => {
  // Den fanns FORE #307 och ar oberoende bekraftelse pa att bryggan nu laser ratt falt.
  assert.match(DESKTOP, /WebcastEvent\.EMOTE/);
  assert.match(DESKTOP, /emoteList\?\.\[0\]/);
  assert.match(DESKTOP, /emit\('subscriberemote'/);
});

// ---- 5. den fjärde listan: vad desktop speglar till molnet -----------------------------------------

test('local-server speglar molnets typer minus chat', () => {
  // Listan har en REGEL i sin egen kommentar: "molnets egna tillatna typer minus chat". Den regeln
  // provas har i stallet for att kopian hardkodas — en hardkodad kopia glider isar tyst, och det
  // har den redan gjort: `glove` lades till i molnet 2026-08-14 och nadde aldrig hit.
  const index = las('server/index.js');
  const m = index.match(/TIKTOK_INGEST_TYPES\s*=\s*new Set\(\[([^\]]*)\]/);
  assert.ok(m, 'hittade ingen TIKTOK_INGEST_TYPES');
  const moln = new Set([...m[1].matchAll(/'([a-z]+)'/g)].map(x => x[1]));
  moln.delete('chat');

  const l = LOKAL.match(/TILL_MOLNET\s*=\s*new Set\(\[([^\]]*)\]/);
  assert.ok(l, 'hittade ingen TILL_MOLNET i local-server.js');
  const lokal = new Set([...l[1].matchAll(/'([a-z]+)'/g)].map(x => x[1]));

  const saknas = [...moln].filter(t => !lokal.has(t)).sort();
  const extra = [...lokal].filter(t => !moln.has(t)).sort();
  assert.deepEqual(saknas, [],
    `desktop speglar inte dessa till molnet: ${saknas.join(', ')} — de går förlorade för molnstatistiken`);
  assert.deepEqual(extra, [],
    `desktop speglar typer molnet avvisar med 400: ${extra.join(', ')}`);
});

// ---- 6. vakten mot framtida glidning ---------------------------------------------------------------

test('varje typ desktop skickar tas emot av molnet', () => {
  // Samma vakt som tests/event-contract.test.js har for bryggan, men for den andra vagen in.
  const bus = las('server/event-bus.js');
  const a = bus.match(/ALLOWED\s*=\s*new Set\(\[([^\]]*)\]/);
  const allowed = new Set([...a[1].matchAll(/'([a-z]+)'/g)].map(x => x[1]));
  const al = bus.match(/TYPE_ALIASES\s*=\s*\{([^}]*)\}/);
  const alias = Object.fromEntries([...al[1].matchAll(/([a-z]+)\s*:\s*'([a-z]+)'/g)].map(x => [x[1], x[2]]));

  const skickade = [...DESKTOP.matchAll(/emit\('([a-z_]+)'/g)].map(x => x[1]);
  const foraldralosa = [...new Set(skickade)].filter(t => !allowed.has(alias[t] || t));
  assert.deepEqual(foraldralosa, [],
    `desktop skickar typer molnet kastar: ${foraldralosa.join(', ')}`);
});

// ---- 7. fans_upgrade: samma regel, samma svar --------------------------------------------------

test('desktops fansUppgradering ger samma svar som bryggans, indata för indata', () => {
  // Andra kopierade regeln (efter arGuardianEntrance), av samma paketeringsskal. Provet ar priset:
  // bada implementationerna korda mot samma tabell, inklusive de fem UPPMATTA nivaerna.
  const upp = (niva, over = {}) => Object.assign({
    subType: 'fans_upgrade',
    content: { key: 'pm_mt_fan_live_upgrade_bullet', pieces: [{ type: 1, stringValue: String(niva) }] },
    user: { displayId: 'lisa', nickname: 'Lisa' }
  }, over);

  const fall = [
    ...[32, 18, 10, 19, 11].map(n => upp(n)),          // de fem uppmatta
    upp(1), upp(2), upp(50), upp(51), upp(0),
    upp(32, { subType: 'guardian_entrance' }),
    upp(32, { subType: 'fans_entrance' }),
    upp(32, { subType: 'guardian_shield_card_used' }),
    { subType: 'fans_upgrade', content: {} },
    {}, null, undefined
  ];
  // JAMFOR REGELNS BESLUT, inte hela objektet. De tva baseUser-implementationerna skiljer sig pa
  // en punkt som ar ALDRE an den har andringen: bryggan satter `userId`, desktop gor det inte.
  // Den skillnaden provas separat nedan sa den ar dokumenterad i stallet for dold — en deepEqual
  // over hela objektet hade blandat ihop "reglerna ar oense" med "baseUser skiljer sig sedan forut".
  const beslut = r => r && { fanClubLevel: r.fanClubLevel, fanLevelUp: r.fanLevelUp,
    username: r.username, name: r.name };
  for (const f of fall) {
    assert.deepEqual(beslut(T.fansUppgradering(f)), beslut(N.fansUppgradering(f)),
      `desktop och bryggan är oense om ${JSON.stringify(f && f.subType)} / ${JSON.stringify(f && f.content?.pieces?.[0]?.stringValue)}`);
  }
  // Och regeln maste saga JA nagon gang — annars ar likheten meningslos.
  assert.equal(T.fansUppgradering(upp(32)).fanLevelUp.to, 32);
  assert.equal(T.fansUppgradering(upp(1)), null, 'nivå 1 gav en stämpel molnet ändå kastar');
});

// ---- 8. paritet åt BÅDA hållen -----------------------------------------------------------------

test('desktop har ALLA molnets persontyper — inte bara typer molnet accepterar', () => {
  // Provet ovan ("varje typ desktop skickar tas emot av molnet") mater bara ENA riktningen. Den
  // missar det omvanda felet: molnet far en ny typ och desktop halkar efter. Det hande direkt —
  // #309 la till 'fanlevelup' i molnet, och utan den har vakten hade desktopvagen tigit om
  // nivahojningar medan molnvagen visade dem, utan att nagot prov sagt ifran.
  //
  // RUMSTYPER UNDANTAS med flit: viewer/battle/glove beskriver RUMMET och har ingen avsandare.
  // Desktop skickar dem redan pa annat satt, och de hor inte till den har jamforelsen.
  const index = las('server/index.js');
  const alla = new Set([...index.match(/TIKTOK_INGEST_TYPES\s*=\s*new Set\(\[([^\]]*)\]/)[1]
    .matchAll(/'([a-z]+)'/g)].map(x => x[1]));
  const rum = new Set([...index.match(/TIKTOK_ROOM_TYPES\s*=\s*new Set\(\[([^\]]*)\]/)[1]
    .matchAll(/'([a-z]+)'/g)].map(x => x[1]));

  const skickade = new Set([...DESKTOP.matchAll(/emit\('([a-z_]+)'/g)].map(x => x[1]));
  // Molnets alias: bryggan/desktop skickar 'likes' och 'member', molnet lagrar dem som
  // 'like'/'viewer'. En typ som desktop skickar under sitt raa namn raknas som tackt.
  const bus = las('server/event-bus.js');
  const alias = Object.fromEntries([...bus.match(/TYPE_ALIASES\s*=\s*\{([^}]*)\}/)[1]
    .matchAll(/([a-z]+)\s*:\s*'([a-z]+)'/g)].map(x => [x[1], x[2]]));
  for (const t of [...skickade]) if (alias[t]) skickade.add(alias[t]);

  const saknas = [...alla].filter(t => !rum.has(t) && t !== 'chat' && !skickade.has(t)).sort();
  assert.deepEqual(saknas, [],
    `molnet tar emot dessa persontyper men desktop skickar dem aldrig: ${saknas.join(', ')} `
    + '— widgeten fungerar på molnvägen och är tyst på desktopvägen');
});

test('känd och dokumenterad skillnad: desktop sätter inte userId', () => {
  // AKTUELL AVVIKELSE, inte ett fel som infors har — den fanns fore #309. Molnets cleanEvent laser
  // `userId`, sa desktopvagens event saknar det faltet. Provet finns for att skillnaden ska vara
  // SYNLIG och inte vaxa: forsvinner den (desktop borjar satta userId) faller provet och nagon far
  // ta bort det medvetet. Blir det fler skillnader syns de har.
  const p = { subType: 'fans_upgrade', content: { pieces: [{ stringValue: '32' }] },
    user: { displayId: 'lisa', nickname: 'Lisa' } };
  const d = T.fansUppgradering(p), m = N.fansUppgradering(p);
  const bara = (a, b) => Object.keys(b).filter(k => !(k in a));
  assert.deepEqual(bara(d, m), ['userId'],
    `oväntade fält skiljer desktop från bryggan: ${bara(d, m).join(', ')}`);
  assert.deepEqual(bara(m, d), [], 'desktop har fält bryggan saknar');
});
