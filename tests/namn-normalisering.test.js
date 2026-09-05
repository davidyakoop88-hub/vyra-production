'use strict';
// TITTARNAS NAMN SKA GÅ ATT LÄSA I OVERLAYEN.
//
// DAVID I DRIFT 2026-09-05: namn kom upp som rutor.
//
// TikTok-namn med "fina" bokstäver — 𝕜𝕠𝕠𝕝, 𝒻𝒶𝓃𝒸𝓎, 𝔇𝔞𝔳𝔦𝔡, ⒿⓄⓀⒺⓇⓄ — är inte formaterad text. Det är
// egna Unicode-tecken i de matematiska alfabeten (U+1D400–1D7FF) och liknande block, och få
// gränssnittstypsnitt täcker dem. Webbläsaren ritar då tofu: en ruta per tecken.
//
// UPPMÄTT över sjutton stilar från de vanliga "fancy text"-generatorerna: NFKC fäller femton av dem
// tillbaka till vanlig text. De två som blir kvar — små kapitäler (ᴀ) och upp-och-ner (ɐ) — ligger i
// Latin Extended, som de flesta typsnitt faktiskt HAR. De var alltså aldrig rutorna.
//
// Provet mäter genom den VERKLIGA klienten: ett event matas in i VyraLive.ingest() och namnet läses
// av på andra sidan, där widgetarna hämtar det. Att kalla normaliseringsfunktionen direkt hade
// bevisat att den fungerar, inte att någon använder den — samma blinda fläck som en gång dolde
// Guardian Emblem, Battle MVP och Fan Level Up.
const test = require('node:test'), assert = require('node:assert/strict');
const { createBrowser } = require('./helpers/browser-harness.js');

const WS = 'ws-A';
let n = 0;

function boot() {
  const browser = createBrowser({ hostname: 'vyralive.app' });
  browser.load('session-state.js');
  browser.sandbox.VyraAuth = { lastDetail: () => ({ workspaces: [{ id: WS }] }) };
  browser.load('live-client.js');
  const sedda = [];
  browser.sandbox.addEventListener('vyra-live-event', e => sedda.push(e.detail || {}));
  return { sedda, ingest: e => browser.sandbox.VyraLive.ingest(e) };
}

const event = (over = {}) => Object.assign(
  { id: 'e' + (++n), type: 'chat', username: 'lisa', comment: 'hej' }, over);

const genom = (ingest, sedda, name) => { ingest(event({ name })); return sedda[sedda.length - 1].name };

test('dekorativa alfabet faller tillbaka till lasbara bokstaver', () => {
  const { sedda, ingest } = boot();
  const FALL = [
    ['matematisk fetstil', '\u{1D55C}\u{1D560}\u{1D560}\u{1D55D}', 'kool'],
    ['skrivstil', '\u{1D4BB}\u{1D4B6}\u{1D4C3}\u{1D4B8}\u{1D4CE}', 'fancy'],
    ['fraktur', '\u{1D507}\u{1D51E}\u{1D533}\u{1D526}\u{1D521}', 'David'],
    ['inringat', 'ⒿⓄⓀⒺⓇⓄ', 'JOKERO'],
    ['fullbredd', 'ＪＯＫＥＲＯ', 'JOKERO'],
  ];
  for (const [stil, fran, till] of FALL) {
    assert.equal(genom(ingest, sedda, fran), till, `${stil} viks inte tillbaka — namnet blir rutor`);
  }
});

test('ett vanligt namn ror man inte', () => {
  const { sedda, ingest } = boot();
  assert.equal(genom(ingest, sedda, 'Jokero'), 'Jokero');
  assert.equal(genom(ingest, sedda, 'Anna-Lena Ö'), 'Anna-Lena Ö');
});

test('riktiga skriftsprak och emoji lamnas i fred — de ar namn, inte dekoration', () => {
  // Den farligaste varianten av den har fixen vore en som "stadar" bort nagons riktiga namn.
  const { sedda, ingest } = boot();
  for (const namn of ['مرحبا', 'สวัสดี', 'こんにちは', '张伟', 'Jokero 🔥', 'Ægir Þórsson']) {
    assert.equal(genom(ingest, sedda, namn), namn, `"${namn}" ska vara oforandrat`);
  }
});

test('HANDTAGET ror man ALDRIG — det ar identiteten', () => {
  // Allt nycklas pa username: leaderboardens bidrag, MVP-raningen, dedupen. Normaliserade man det
  // skulle tva personer vars namn viks lika bli EN person, och fel person kunde vinna. Skillnaden
  // mellan identitet och visning gjordes uttrycklig i battle-mvp-session.js samma dag.
  const { sedda, ingest } = boot();
  const handtag = '\u{1D55C}\u{1D560}\u{1D560}\u{1D55D}';
  ingest(event({ username: handtag, name: 'Kool' }));
  assert.equal(sedda[sedda.length - 1].username, handtag,
    'username normaliserades — da slas skilda personer ihop');
});

test('tomt eller saknat namn skapar inget falt och kastar inte', () => {
  const { sedda, ingest } = boot();
  ingest(event({ name: '' }));
  assert.equal(sedda[sedda.length - 1].name, '');
  ingest(event());                                   // inget name alls
  assert.equal(sedda[sedda.length - 1].name, undefined, 'faltet ska inte uppfinnas');
});
