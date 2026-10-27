'use strict';
// STANDARDRÖSTEN OCH SLUMPEN ÄR MOLNRÖSTER (David 2026-10-27: "Varför har vi bara killar och alla
// är samma?"). Datorns svenska röst är på Windows oftast bara Microsoft Bengt, och både
// "Standardröst" och "Slumpad röst" valde bara bland datorns röster. Provet kör den riktiga
// tts-chat.js + vyra-tal.js och läser av vilken röst som faktiskt beställs från molnet.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./helpers/flikar.js');

const living = [];
test.after(() => { while (living.length) living.pop().close() });
const vanta = ms => new Promise(r => setTimeout(r, ms));

const ROSTER = [
  { name: 'sv-SE-SofieNeural', languageCodes: ['sv-SE'], gender: 'FEMALE' },
  { name: 'sv-SE-MattiasNeural', languageCodes: ['sv-SE'], gender: 'MALE' },
];

async function studio(installningar, { inloggad = true } = {}) {
  const lager = F.delatLager();
  lager.setItem('vyra-tts-chat-v1', JSON.stringify(Object.assign({ enabled: true, cooldownSeconds: 0,
    maxQueueLength: 50, filterCommands: false }, installningar)));
  const w = await F.fonster({ namn: 'studio', lager, extraFiler: ['tts-chat.js'], tal: true, ljud: true, skrivbar: true });
  living.push(w);
  w.__molnroster = [];
  if (inloggad) w.VyraAuth = {
    lastDetail: () => ({ workspaces: [{ id: 'ws-prov' }] }),
    api: (url, opt) => {
      if (/\/tts\/voices/.test(url)) return Promise.resolve({ voices: ROSTER });
      w.__molnroster.push(JSON.parse(opt.body).voiceName);
      return Promise.resolve({ audioContent: Buffer.from('ljud').toString('base64') });
    },
  };
  w.Audio = function (src) {
    const el = { src, volume: 1, onended: null, onpause: null, onerror: null,
      play() { setTimeout(() => el.onended && el.onended(), 5); return Promise.resolve() }, pause() {} };
    return el;
  };
  await vanta(40);
  return w;
}
const chatta = (w, username, comment) =>
  w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: { type: 'chat', username, name: username, comment } }));

test('utan vald röst läser Sofie i molnet, inte datorns röst', async () => {
  const w = await studio({ voice: '' });
  chatta(w, 'anna', 'hej');
  await vanta(200);
  assert.deepEqual(w.__molnroster, ['sv-SE-SofieNeural']);
  assert.deepEqual(w.__tal, [], 'datorns röst läste också');
});

test('slumpad röst blandar molnrösterna — både Sofie och Mattias hörs', async () => {
  const w = await studio({ voice: '', randomVoice: true });
  for (let i = 0; i < 24; i++) chatta(w, 'tittare' + i, 'rad ' + i);
  await vanta(800);
  assert.equal(w.__molnroster.length, 24, JSON.stringify(w.__molnroster));
  assert.deepEqual([...new Set(w.__molnroster)].sort(), ['sv-SE-MattiasNeural', 'sv-SE-SofieNeural']);
  assert.deepEqual(w.__tal, []);
});

test('en uttryckligen vald röst på datorn lämnas orörd', async () => {
  const w = await studio({ voice: 'Microsoft Bengt - Swedish (Sweden)' });
  chatta(w, 'anna', 'hej');
  await vanta(200);
  assert.deepEqual(w.__molnroster, []);
  assert.deepEqual(w.__tal.map(t => t.text), ['anna säger hej']);
});

test('utan inloggat workspace läser datorns röst direkt, utan ett misslyckat molnanrop', async () => {
  const w = await studio({ voice: '', randomVoice: true }, { inloggad: false });
  chatta(w, 'anna', 'hej');
  await vanta(200);
  assert.deepEqual(w.__tal.map(t => t.text), ['anna säger hej']);
});
