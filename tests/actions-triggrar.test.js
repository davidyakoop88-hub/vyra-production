'use strict';
// VILKA TRIGGRAR ACTIONS & EVENTS FAKTISKT FÅR.
//
// `liveEventTriggers()` i live-client.js översätter ett liveevent till de triggrar Actions &
// Events matchar mot. Fram till 2026-09-06 fanns INGET prov på den funktionen alls — och det
// visade sig kosta två döda triggrar i produktion:
//
//   `member`         server/event-bus.js döpte om typen till `viewer`, och `viewer` matchar ingen
//                    gren här. Uppmätt i en skarp sändning: 281 personer gick in i rummet, noll
//                    medlems-Actions fyrade. På desktopvägen, som inte aliasar, fyrade alla 281.
//
//   `totallikecount` bryggan skickar `points`, den här funktionen läste `totalLikes`/
//                    `totalLikeCount`. Ingetdera finns, så värdet var 0 i varje likes-trigger
//                    medan `points` bar riktiga tal (uppmätt 15–10159).
//
// Provet kör den VERKLIGA klienten via riggen, inte funktionen direkt: att anropa mapEvent i
// isolering hade bevisat att den fungerar, inte att något använder den.
const test = require('node:test'), assert = require('node:assert/strict');
const { createBrowser } = require('./helpers/browser-harness.js');

function boot() {
  const browser = createBrowser({ hostname: 'vyralive.app' });
  browser.load('session-state.js');
  browser.sandbox.VyraAuth = { lastDetail: () => ({ workspaces: [{ id: 'ws-A' }] }) };
  browser.load('cloud-fields.js');
  browser.load('live-client.js');
  return browser.sandbox.VyraLive.mapEvent;
}

const triggrarFor = (mapEvent, e) => mapEvent(e).map(([namn]) => namn);

test('en medlem som gar in ger triggern member', () => {
  const mapEvent = boot();
  const t = triggrarFor(mapEvent, { type: 'member', username: 'lisa' });
  assert.ok(t.includes('member'),
    'member-triggern fyrar inte — Actions med "Ny medlem" ar doda. Fick: ' + t.join(', '));
});

test('typen member far INTE dopas om pa vagen — da matchar ingen gren', () => {
  // Regressionsvakten mot aliaset. `viewer` ar rumsuppdateringen (ett ANTAL), `member` ar en
  // PERSON. Slas de ihop finns ingen gren som fangar personen.
  const mapEvent = boot();
  const somViewer = triggrarFor(mapEvent, { type: 'viewer', username: 'lisa', count: 12 });
  assert.ok(!somViewer.includes('member'),
    'typen viewer ger member-triggern — da skulle varje rumsuppdatering rakna som ett intrade');
  const somMember = triggrarFor(mapEvent, { type: 'member', username: 'lisa' });
  assert.ok(somMember.includes('member'), 'member ger inte member-triggern');
});

test('likes-triggern bar bryggans points som totallikecount', () => {
  const mapEvent = boot();
  const par = mapEvent({ type: 'likes', username: 'lisa', count: 5, points: 10159 });
  const likes = par.find(([namn]) => namn === 'likes');
  assert.ok(likes, 'ingen likes-trigger alls');
  assert.equal(likes[1].totallikecount, 10159,
    'totallikecount ar inte bryggans points — varje likes-Action ser 0');
  assert.equal(likes[1].likecount, 5, 'likecount ska vara antalet i den har handelsen');
});

test('de gamla namnen fungerar fortfarande om nagon skickar dem', () => {
  // Desktopvagen och aldre klienter kan skicka totalLikes. Reserven far inte tas bort.
  const mapEvent = boot();
  const par = mapEvent({ type: 'likes', username: 'lisa', count: 1, totalLikes: 42 });
  const likes = par.find(([namn]) => namn === 'likes');
  assert.equal(likes[1].totallikecount, 42, 'reserven totalLikes tappades');
});

test('gavans coins nar Actions-nyttolasten', () => {
  // Somvakten fran #349 mater samma sak genom hela kedjan. Har mats bara sista ledet, men med
  // NOLLAN som var buggen: `e.diamonds ?? e.coins` faller inte igenom pa 0.
  const mapEvent = boot();
  const par = mapEvent({ type: 'gift', username: 'lisa', diamonds: 30000, coins: 30000, count: 1 });
  const giftCoins = par.find(([namn]) => namn === 'giftCoins');
  assert.ok(giftCoins, 'giftCoins-triggern saknas helt');
  assert.equal(giftCoins[1].coins, 30000,
    'giftCoins bar fel varde — varje regel med troskel over noll ar dod');
});

// ---- Match Monitor far inte nollstalla vinstsviten -------------------------------------------
// `live-control.js` visar sviten (battleComboV2.comboCount) bredvid poangen. Falten bars
// VILLKORLIGT genom kedjan — de saknas i var tredje ram, eftersom TikToks karta ar tom da.
//
// Uppdaterar panelen pa ett saknat falt blir siffran noll i var tredje ram, och det ser ut som ett
// riktigt resultat i stallet for ett tapp. Darfor maste tilldelningen vara villkorad, precis som
// scoreUs/scoreThem redan ar.
const fs2 = require('fs'), path2 = require('path');
test('Match Monitor skriver bara vinsterna nar faltet faktiskt finns', () => {
  const src = fs2.readFileSync(path2.join(__dirname, '..', 'live-control.js'), 'utf8');
  assert.match(src, /if\(event\.winsUs!=null\)battle\.winsUs=/,
    'winsUs skrivs ovillkorligt — sviten nollstalls i var tredje ram');
  assert.match(src, /if\(event\.winsThem!=null\)battle\.winsThem=/,
    'winsThem skrivs ovillkorligt');
});

test('och den visar dem', () => {
  const src = fs2.readFileSync(path2.join(__dirname, '..', 'live-control.js'), 'utf8');
  assert.match(src, /battle\.winsUs\}[^]{0,40}vinster/,
    'Match Monitor renderar inte vinsterna — falten reser hela vagen och visas ingenstans');
});

// ---- klientens toppgivare far inte rakna medvardsgavor -----------------------------------------
// Uppmatt 2026-09-06: 604 av 887 diamanter i en multi-guest-sandning gick till en medvard, och
// Top Gifters visade dem som streamerns egna. Bryggan markerar dem med `tillVarden: false`;
// servern kan inte harleda det sjalv eftersom den inte vet streamerns TikTok-id. #360
test('Top Gifters raknar inte en gava till en medvard', () => {
  const browser = createBrowser({ hostname: 'vyralive.app' });
  browser.load('session-state.js');
  browser.sandbox.VyraAuth = { lastDetail: () => ({ workspaces: [{ id: 'ws-A' }] }) };
  browser.load('live-leaderboard.js');
  const lb = browser.sandbox.VyraLeaderboard;
  assert.ok(lb && typeof lb.getTop === 'function', 'VyraLeaderboard saknas — riggen ar fel');
  // Liggaren tar emot via handelsen, inte via ett API — samma vag som i drift.
  const skicka = d => browser.sandbox.dispatchEvent(
    new browser.sandbox.CustomEvent('vyra-live-event', { detail: d }));

  skicka({ type: 'gift', username: 'lisa', coins: 100 });
  skicka({ type: 'gift', username: 'lisa', coins: 500, tillVarden: false });
  const topp = lb.getTop('coins', 5).find(t => String(t.username).toLowerCase() === 'lisa');
  assert.ok(topp, 'givaren hamnade inte i listan alls');
  assert.equal(topp.coins, 100,
    'medvardsgavan raknades — Top Gifters visar da diamanter streamern aldrig fick');
});

test('och en aldre brygga utan faltet raknas som i dag', () => {
  const browser = createBrowser({ hostname: 'vyralive.app' });
  browser.load('session-state.js');
  browser.sandbox.VyraAuth = { lastDetail: () => ({ workspaces: [{ id: 'ws-B' }] }) };
  browser.load('live-leaderboard.js');
  const lb = browser.sandbox.VyraLeaderboard;
  browser.sandbox.dispatchEvent(new browser.sandbox.CustomEvent(
    'vyra-live-event', { detail: { type: 'gift', username: 'mira', coins: 250 } }));
  const topp = lb.getTop('coins', 5).find(t => String(t.username).toLowerCase() === 'mira');
  assert.equal(topp && topp.coins, 250, 'en gava utan faltet filtrerades bort — forvalet ar fel');
});

// ---- ligabrickan i Match Monitor (#367 del 3) --------------------------------------------------
// Brickan bars BARA i battle-payloaden — uppmatt 60 ganger over nio sandningar, mot 6 347 for
// tittarlistan. Panelen minns darfor senaste vardet mellan matcher, och skrivningen maste vara
// villkorad: varje gava, like och chattrad hade annars raderat en korrekt visad bricka.
test('Match Monitor skriver ligan bara nar faltet faktiskt finns', () => {
  const src = fs2.readFileSync(path2.join(__dirname, '..', 'live-control.js'), 'utf8');
  assert.match(src, /if\(event\.ligaText\)\{battle\.liga=/,
    'ligan skrivs ovillkorligt — brickan raderas av varje handelse som inte bar den');
  assert.match(src, /if\(event\.ligaPoang!=null\)battle\.ligaPoang=/,
    'ligapoangen skrivs ovillkorligt');
});

test('ligans farger och ikon VALIDERAS pa form — safe() racker inte i ett style-attribut', () => {
  // Vardena kommer fran TikTok och gar in i ett style-attribut respektive ett src. Ett
  // style-attribut ar en egen injektionsyta: `#fff;background:url(...)` innehaller inte ett enda
  // tecken som safe() ror, sa escapning skyddar inte. Darfor form-validering: en farg som inte ar
  // en hexkod och en ikon som inte ar http(s) ritas inte alls.
  const src = fs2.readFileSync(path2.join(__dirname, '..', 'live-control.js'), 'utf8');
  assert.match(src, /function hexFarg\(v\)\{return \/\^#\[0-9a-fA-F\]\{3,8\}\$\/\.test/,
    'fargerna valideras inte som hexkoder innan de skrivs i ett style-attribut');
  assert.match(src, /function bildUrl\(v\)\{return \/\^https\?/,
    'ikonens URL valideras inte innan den skrivs i ett src');
  // Och de MASTE anvandas pa vagen in, inte bara finnas.
  assert.match(src, /battle\.ligaFarg=hexFarg\(event\.ligaFarg\)/, 'ligaFarg lagras ovaliderad');
  assert.match(src, /battle\.ligaBakgrund=hexFarg\(event\.ligaBakgrund\)/, 'ligaBakgrund lagras ovaliderad');
  assert.match(src, /battle\.ligaIkon=bildUrl\(event\.ligaIkon\)/, 'ligaIkon lagras ovaliderad');
});

test('och brickan renderas — med texten escapad', () => {
  const src = fs2.readFileSync(path2.join(__dirname, '..', 'live-control.js'), 'utf8');
  assert.match(src, /battle\.liga&&battle\.ligaVisa\?/,
    'brickan ritas utan att fraga om shouldShow — TikToks egen "visa inte" ignoreras da');
  assert.match(src, /<b>\$\{safe\(battle\.liga\)\}<\/b>/,
    'ligatexten skrivs oescapad');
  const css = fs2.readFileSync(path2.join(__dirname, '..', 'live-control.css'), 'utf8');
  assert.match(css, /\.lc-liga\{/, 'brickan har ingen CSS — den ritas oformaterad');
});

test('ligabrickan far inte gora headern till en TREKOLUMNSLAYOUT', () => {
  // UPPMATT BUGG, inte en farhaga. `.lc-battle header` ar `display:flex` med
  // `justify-content:space-between`. Brickan lades forst som ett TREDJE barn, och da flyttade sig
  // MATCH AKTIV-chippet fran headerns hogerkant till mitten:
  //
  //   utan liga   chippets hogerkant 1016 px = headerns bredd, alltsa 0 px fran kanten
  //   med liga    chippets hogerkant  580 px, alltsa 436 px in mot mitten
  //
  // Varre an att det ser fel ut: brickan kommer FORST nar en battle borjar, sa chippet hoppade
  // 436 px mitt i sandningen. Chip och bricka bor darfor i en egen behallare, och headern har
  // tva barn precis som forut.
  const src = fs2.readFileSync(path2.join(__dirname, '..', 'live-control.js'), 'utf8');
  assert.match(src, /<div class="lc-battle-status"><span class="lc-match-state/,
    'chippet ligger inte i lc-battle-status — headern far tre barn och chippet flyttar sig');
  assert.match(src, /<\/span>`:''\}<\/div><\/header>/,
    'behallaren stangs inte fore </header>');
  const css = fs2.readFileSync(path2.join(__dirname, '..', 'live-control.css'), 'utf8');
  assert.match(css, /\.lc-battle-status\{display:flex/,
    'behallaren saknar egen layout — da staplas chip och bricka i stallet for att sta bredvid');
  assert.doesNotMatch(css, /\.lc-liga\{[^}]*margin-left/,
    'brickan har kvar sin margin-left — avstandet ska komma fran behallarens gap, annars far den ' +
    'ett dubbelt mellanrum');
});
