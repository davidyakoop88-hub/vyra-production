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
