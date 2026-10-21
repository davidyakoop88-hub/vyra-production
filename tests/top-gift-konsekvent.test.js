'use strict';
// TOP GIFT FLADDRADE I EN RIKTIG SANDNING (David, 2026-10-21).
//
// "Top Gift bytte fran Jan Erik till Mela, och ungefar tio minuter senare tillbaka till Jan Erik."
// Top Gift ar sandningens enskilt dyraste gava: strikt storre ersatter, styckvarde (elva rosor = 1).
// Inom samma sandning far den aldrig ga tillbaka till ett mindre eller gammalt rekord.
//
// Tre vagar dit, alla reproducerade har med bada skrivarna laddade i sidans ordning
// (gift-event-images.js och sedan live-leaderboard.js):
//
//   1. KONFIGURATIONEN ATERAPPLICERAS. OBS-lanken hamtar om sin konfiguration vid varje sparning i
//      Studion, vid varje SSE-ateranslutning (overlay-access.js: onopen -> konfigSync.ateranslot())
//      och vid live:start. projectReadonlyOverlay byter ut state.widgets mot NYA objekt med det
//      dataName/dataValue Studion senast sparade. aterstallTopGift() kordes bara en gang per
//      widget-ID, sa de nya objekten fick aldrig tillbaka livevardet — och rekordgrinden stod kvar
//      pa Melas varde, sa ingen mindre gava kunde ratta det. Samma sak i Studion nar
//      cloud-sync.js foljaren projicerar en annan enhets sparning.
//   2. TROSKELN TAPPAS NAR KALLAN ATERSKAPAS. OBS river webblasarkallan (scenbyte, omstart) och
//      sessionStorage forsvinner. live-leaderboard.js tar tillbaka Top Gift ur localStorage for en
//      molnlank, men rekordgrinden i gift-event-images.js ligger bara i sessionStorage — den borjade
//      pa 0, och nasta ros (fran Jan Erik) blev "nytt rekord" over Melas gava.
//   3. MEDVARDSGAVOR. live-leaderboard.js raknar inte gavor med `tillVarden: false` (#360), men
//      gift-event-images.js gjorde det: Mela kunde ta Top Gift med en gava till en ANNAN vard, medan
//      live-leaderboard.js fortfarande hade Jan Erik som sandningens Top Gift och lade tillbaka honom
//      vid nasta aterstallning.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = fil => fs.readFileSync(path.join(ROOT, fil), 'utf8');
const SANITIZE = las('overlay-sanitize.js');
const GIFTBILDER = las('gift-event-images.js');
const LEADERBOARD = las('live-leaderboard.js');

const SESSION = '33333333-3333-4333-8333-333333333333';

function lagring() {
  const m = Object.create(null);
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] } };
}

const topGift = (extra = {}) => ({ id: 'tg1', type: 'templateTopGift', x: 0, y: 0, width: 280,
  dataName: '', dataValue: '', profileImage: '', giftImage: '', giftName: '', ...extra });

// Ett fonster med bada skrivarna, i sidans laddordning. `url` avgor lage: ?overlay=1&access= ar en
// molnlank (OBS), utan ar det Studion.
function fonster({ url = 'https://vyralive.app/studio.html?overlay=1&access=tok-abcdefghijklmnopqrstuvwxyz0123456789',
  session = lagring(), lokal = lagring(), widgets = [topGift()] } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url, runScripts: 'outside-only' });
  const w = dom.window;
  w.fetch = () => Promise.reject(new Error('ingen server i provet'));
  Object.defineProperty(w, 'sessionStorage', { value: session, configurable: true });
  Object.defineProperty(w, 'localStorage', { value: lokal, configurable: true });
  w.VyraLiveSession = { runtime: () => ({ aktivSession: () => SESSION }) };
  w.eval(`var VYRA_OVERLAY = ${url.includes('overlay=1')};
    var state = ${JSON.stringify({ widgets })};
    var selected = null; var view = 'overlay';
    var liveWidget = id => state.widgets.find(x => x.id === id);
    window.VYRA_GIFTS = [];`);
  w.eval(SANITIZE);
  w.eval(GIFTBILDER);
  w.eval(LEADERBOARD);
  assert.ok(w.VyraGiftRecords && w.VyraLeaderboard, 'filerna laddades inte hela vagen — provet mater ingenting');
  return { dom, w, session, lokal };
}

const gava = (w, detail) => w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail }));
const visad = w => JSON.parse(JSON.stringify(w.eval('state.widgets.find(x => x.type === "templateTopGift")')));
// overlay-access.js apply(): nya widgetobjekt ur konfigurationen, sedan vyra-live-repaint.
const aterapplicera = (w, widgets) => {
  w.eval(`state.widgets = ${JSON.stringify(widgets)}`);
  w.dispatchEvent(new w.Event('vyra-live-repaint'));
};
const skrivNer = w => w.dispatchEvent(new w.Event('pagehide'));
// Tickern i live-leaderboard.js (setInterval 1000 ms) har gatt manga varv innan konfigurationen
// hamtas om. Utan den har gar provet forbi det som faktiskt hande: aterstallningen var redan
// forbrukad for widgetens ID nar den omhamtade konfigurationen kom.
const tick = w => w.dispatchEvent(new w.Event('vyra-live-repaint'));

const JAN = { type: 'gift', username: 'janerik', name: 'Jan Erik', giftName: 'Hand Heart', diamonds: 100, count: 1 };
const MELA = { type: 'gift', username: 'mela', name: 'Mela', giftName: 'Lion', diamonds: 500, count: 1 };

test('en omhamtad konfiguration med Studions gamla Top Gift tar inte tillbaka det gamla rekordet', () => {
  const { dom, w } = fonster();
  try {
    gava(w, JAN);
    tick(w);
    // Studion sparade medan Jan Erik ledde: det ar det konfigurationen bar.
    const sparad = [visad(w)];
    assert.equal(sparad[0].dataName, 'Jan Erik', 'forutsattningen brast');
    gava(w, MELA);
    tick(w);
    assert.equal(visad(w).dataName, 'Mela', 'forutsattningen brast: en dyrare gava tog inte over');

    // Tio minuter senare: SSE ateransluter (eller Studion sparar) och konfigurationen appliceras om.
    aterapplicera(w, sparad);
    assert.equal(visad(w).dataName, 'Mela', 'Top Gift gick tillbaka till Jan Erik efter en omhamtning');
    assert.equal(Number(visad(w).dataValue), 500, 'Top Gift visar det gamla vardet efter en omhamtning');
    assert.equal(visad(w).giftName, 'Lion', 'gavans namn gick tillbaka till det gamla rekordets');

    // Och det haller vid nasta omhamtning ocksa, inte bara den forsta.
    aterapplicera(w, sparad);
    assert.equal(visad(w).dataName, 'Mela', 'andra omhamtningen tog tillbaka Jan Erik');
  } finally { dom.window.close() }
});

test('Studion: en projicerad layout fran en annan enhet tar inte tillbaka det gamla rekordet', () => {
  const { dom, w } = fonster({ url: 'https://vyralive.app/studio.html' });
  try {
    gava(w, JAN);
    tick(w);
    const sparad = [visad(w)];
    gava(w, MELA);
    tick(w);
    aterapplicera(w, sparad);
    assert.equal(visad(w).dataName, 'Mela', 'Studion visade Jan Erik igen efter foljarens projicering');
  } finally { dom.window.close() }
});

test('en aterskapad OBS-kalla behaller troskeln: nasta ros blir inte nytt Top Gift', () => {
  const lokal = lagring();
  const forsta = fonster({ lokal });
  try {
    gava(forsta.w, JAN);
    gava(forsta.w, MELA);
    skrivNer(forsta.w);
  } finally { forsta.dom.window.close() }

  // Scenbyte med "Shutdown source when not visible": ny kontext, tom sessionStorage, samma localStorage.
  const efter = fonster({ lokal, session: lagring() });
  try {
    assert.equal(visad(efter.w).dataName, '', 'forutsattningen: aterstallningen sker i tickern, inte vid laddning');
    efter.w.dispatchEvent(new efter.w.Event('vyra-live-repaint'));
    assert.equal(visad(efter.w).dataName, 'Mela', 'Top Gift kom inte tillbaka efter att kallan aterskapats');
    gava(efter.w, { ...JAN, giftName: 'Rose', diamonds: 1 });
    assert.equal(visad(efter.w).dataName, 'Mela', 'en ros slog ut Melas gava efter att kallan aterskapats');
    assert.equal(Number(visad(efter.w).dataValue), 500);
    assert.ok(efter.w.VyraGiftRecords.giftCoins >= 500, 'rekordgrinden borjade om fran noll');
    // En gava som verkligen ar storre tar fortfarande over.
    gava(efter.w, { ...JAN, giftName: 'Universe', diamonds: 34999 });
    assert.equal(visad(efter.w).dataName, 'Jan Erik', 'ett akta rekord stoppades efter aterstallningen');
  } finally { efter.dom.window.close() }
});

test('en gava till en annan vard tar inte Top Gift', () => {
  const { dom, w } = fonster();
  try {
    gava(w, JAN);
    gava(w, { ...MELA, tillVarden: false });
    assert.equal(visad(w).dataName, 'Jan Erik', 'en medvardsgava tog Top Gift i gift-event-images.js');
    assert.equal(w.VyraGiftRecords.giftCoins, 100, 'en medvardsgava hojde rekordgrinden');
    // Utan faltet (aldre brygga) raknas gavan som forut.
    gava(w, MELA);
    assert.equal(visad(w).dataName, 'Mela');
  } finally { dom.window.close() }
});

test('ny sandning nollstaller fortfarande Top Gift-troskeln', () => {
  const { dom, w } = fonster();
  try {
    gava(w, MELA);
    w.dispatchEvent(new w.CustomEvent('vyra-live-session', { detail: { event: 'live:start', sessionId: SESSION } }));
    w.dispatchEvent(new w.Event('vyra-live-repaint'));
    assert.equal(w.VyraGiftRecords.giftCoins, 0, 'live:start nollade inte troskeln');
    gava(w, { ...JAN, giftName: 'Rose', diamonds: 1 });
    assert.equal(visad(w).dataName, 'Jan Erik', 'forsta gavan i en ny sandning blev inte Top Gift');
  } finally { dom.window.close() }
});

// ---- inspelningens tidslinje (OBS-utgangen 2026-10-21) ------------------------------------------
// 00:45 Mela -> 11:15 Jan Erik -> 12:12 Mela -> 19:15 Jan Erik. Under 12:12 raknade Top Coins vidare
// utan avbrott, sa sidan laddades inte om — men en omhamtad konfiguration laddar inte heller om
// sidan: `totals` ligger i minnet och topplistan malas om direkt (vyra-live-repaint). Det enda som
// byts ar widgetobjekten, och de bar det som senast SPARADES.
test('tidslinjen: en SSE-ateranslutning 12:12 tar inte tillbaka Mela, och topplistan raknar vidare', () => {
  const { dom, w } = fonster();
  try {
    gava(w, { ...MELA, giftName: 'Popular', diamonds: 30, count: 1 });              // 00:45
    tick(w);
    const sparadMedMela = [visad(w)];                                              // Studion sparar
    gava(w, { ...JAN, giftName: 'Cool Cat', diamonds: 99, count: 1 });              // 11:15
    tick(w);
    assert.equal(visad(w).dataName, 'Jan Erik', 'forutsattningen brast');
    const coinsFore = JSON.parse(JSON.stringify(w.VyraLeaderboard.getTop('diamonds', 5)));
    aterapplicera(w, sparadMedMela);                                               // 12:12
    assert.equal(visad(w).dataName, 'Jan Erik', 'ateranslutningen tog tillbaka Mela (inspelningen 12:12)');
    assert.equal(Number(visad(w).dataValue), 99);
    assert.deepEqual(JSON.parse(JSON.stringify(w.VyraLeaderboard.getTop('diamonds', 5))), coinsFore,
      'topplistan paverkas inte av omhamtningen — precis som i inspelningen');
  } finally { dom.window.close() }
});

// MEKANISMEN I overlay-config-sync.js: ateranslot() applicerar konfigurationen AVEN nar revisionen
// ar densamma som den som redan visas (`nyRev < visad` hoppas over, `===` gor det inte). En
// SSE-ateranslutning utan en enda ny sparning ger alltsa nya widgetobjekt med gammalt Top Gift.
test('en ateranslutning applicerar samma revision igen', async () => {
  const { skapaKonfigSync } = require('../overlay-config-sync.js');
  const applicerade = [];
  const planerade = [];
  const sync = skapaKonfigSync({ overlayId: 'o1', hamta: async () => ({ revision: 7 }),
    applicera: k => applicerade.push(k.revision), logg: () => {}, nu: () => 0,
    schemalagg: fn => { planerade.push(fn); return planerade.length }, avbryt: () => {} });
  const kor = async () => { while (planerade.length) await planerade.shift()() };
  await sync.ateranslot(); await kor();
  await sync.ateranslot(); await kor();
  assert.deepEqual(applicerade, [7, 7], 'samma revision applicerades inte om — mekanismen ar en annan an provet antar');
});
