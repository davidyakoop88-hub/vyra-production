'use strict';
// TALET SKA TYSTNA NAR EN NY SANDNING BORJAR.
//
// UPPMATT LUCKA (2026-08-25): sandningsresetens TTS-del tomde bara `tts-chat.js` EGNA lista. Den
// kon anvands inte nar VyraTal finns — enqueueSpeech skickar posterna till den DELADE kon i
// vyra-tal.js, och det ar den som faktiskt talar. Foljden: forra sandningens kommentarer lastes
// upp i den nya, och det yttrande som redan pagick (flera sekunder langt) fortsatte rakt igenom
// sessionsbytet — det forsta tittarna hor i en ny LIVE.
//
// Att toma en ko racker alltsa inte. Det pagaende yttrandet maste avbrytas, och bara posten sjalv
// vet hur: lokal rost stoppas med speechSynthesis.cancel(), molnrosten ar ett <audio> som pausas.
// Darfor bar varje kopost sin egen `avbryt`.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const KALLA = fs.readFileSync(path.join(ROOT, 'vyra-tal.js'), 'utf8');

// Ett minimalt fonster. vyra-tal.js ar en IIFE mot `window` och ror inget annat an localStorage,
// en handfull lyssnare och sin egen ko — allt annat ar injicerat via koa().
function fonster() {
  const lager = new Map();
  const win = {
    localStorage: {
      getItem: k => (lager.has(k) ? lager.get(k) : null),
      setItem: (k, v) => lager.set(k, String(v)),
      removeItem: k => lager.delete(k),
    },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
    setTimeout, clearTimeout, console,
    // Rostmastern: den har fliken far tala.
    VyraRostMaster: { arMaster: () => true },
  };
  win.window = win;
  new Function('window', 'setTimeout', 'clearTimeout', 'console', KALLA)(
    win, setTimeout, clearTimeout, console);
  return win;
}

// En kopost vars uppspelning haller tills provet slapper den — eller tills den avbryts.
function post(spar, namn) {
  let slapp;
  const klar = new Promise(r => { slapp = r });
  return {
    kalla: 'tts-chat',
    spela: () => { spar.push('spelar:' + namn); return klar },
    avbryt: () => { spar.push('avbrot:' + namn); slapp() },
    slapp: () => slapp(),
  };
}

const tick = () => new Promise(r => setImmediate(r));

test('tal: tomKo avbryter det PAGAENDE yttrandet, inte bara kon', async () => {
  const win = fonster(), spar = [];
  const p1 = post(spar, 'ett'), p2 = post(spar, 'tva');
  assert.equal(win.VyraTal.koa(p1), true);
  assert.equal(win.VyraTal.koa(p2), true);
  await tick();
  assert.deepEqual(spar, ['spelar:ett'], 'riggen talade inte alls');
  assert.equal(win.VyraTal.talar(), true);

  const bort = win.VyraTal.tomKo({ avbrytPagaende: true, kalla: 'tts-chat' });
  assert.equal(bort, 1, 'den vantande posten lag kvar i kon');
  await tick(); await tick();

  assert.deepEqual(spar, ['spelar:ett', 'avbrot:ett'],
    'det pagaende yttrandet fortsatte rakt in i den nya sandningen');
  assert.equal(win.VyraTal.koLangd(), 0);
  assert.equal(win.VyraTal.talar(), false, 'talutrymmet slapptes aldrig');
});

test('tal: tomKo utan avbrytPagaende later det pagaende tala klart', async () => {
  const win = fonster(), spar = [];
  const p1 = post(spar, 'ett'), p2 = post(spar, 'tva');
  win.VyraTal.koa(p1); win.VyraTal.koa(p2);
  await tick();
  win.VyraTal.tomKo({ kalla: 'tts-chat' });
  await tick();
  assert.deepEqual(spar, ['spelar:ett'], 'posten avbrots trots att ingen bad om det');
  p1.slapp();
  await tick(); await tick();
  assert.deepEqual(spar, ['spelar:ett'], 'den tomda kon spelades anda');
});

test('tal: en annan kalla rors inte av sandningsresetens tomning', async () => {
  const win = fonster(), spar = [];
  const chatt = post(spar, 'chatt');
  const action = { kalla: 'action', spela: () => { spar.push('spelar:action'); return Promise.resolve() } };
  win.VyraTal.koa(chatt);
  win.VyraTal.koa(action);
  await tick();
  win.VyraTal.tomKo({ avbrytPagaende: true, kalla: 'tts-chat' });
  await tick(); await tick();
  assert.ok(spar.includes('avbrot:chatt'), 'chattens yttrande avbrots inte');
  assert.ok(spar.includes('spelar:action'), 'en actions ljud tystades av chattens reset');
});

test('tal: tts-chat registrerar en avbrytare pa varje kopost', () => {
  const tts = fs.readFileSync(path.join(ROOT, 'tts-chat.js'), 'utf8');
  assert.ok(/koa\(\{[^}]*avbryt:/s.test(tts) || /avbryt: \(\) => tystaPagaende\(\)/.test(tts),
    'tts-chat koar utan avbrytare — da kan tomKo inte tysta ett pagaende yttrande');
  assert.ok(/tomKo\?\.\(\{ avbrytPagaende: true/.test(tts),
    'sandningsresetens TTS-del tomer inte den DELADE kon');
});
