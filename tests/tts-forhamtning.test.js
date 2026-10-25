'use strict';
// MOLNRÖSTEN HÄMTAS NÄR KOMMENTAREN KÖAS (David 2026-10-24: "kan vi inte göra det snabbare").
//
// Varje molnröst är ett eget anrop till /tts/synthesize, och servern väntar in hela ljudfilen från
// rösttjänsten. Anropet startade först när föregående kommentar tystnat, så varje kommentar i kön
// fick en tyst paus lika lång som anropet. Provet ger hämtningen en fast fördröjning och mäter
// pausen mellan två uppläsningar i den riktiga tts-chat.js + vyra-tal.js.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./helpers/flikar.js');

const living = [];
test.after(() => { while (living.length) living.pop().close() });
const vanta = ms => new Promise(r => setTimeout(r, ms));

const HAMTNING_MS = 300, UPPLASNING_MS = 100;

async function studio() {
  const lager = F.delatLager();
  lager.setItem('vyra-tts-chat-v1', JSON.stringify({ enabled: true, cooldownSeconds: 0, maxQueueLength: 5,
    voice: 'cloud:sv-SE-SofieNeural', filterCommands: false }));
  const w = await F.fonster({ namn: 'studio', lager, extraFiler: ['tts-chat.js'], tal: true, ljud: true, skrivbar: true });
  living.push(w);
  w.__hamtningar = [];
  w.VyraAuth = {
    lastDetail: () => ({ workspaces: [{ id: 'ws-prov' }] }),
    api: (url, opt) => {
      const text = JSON.parse(opt.body).text;
      w.__hamtningar.push({ text, at: Date.now() });
      return new Promise(r => setTimeout(() => r({ audioContent: Buffer.from(text).toString('base64') }), HAMTNING_MS));
    },
  };
  w.__starter = [];
  w.Audio = function (src) {
    const el = { src, volume: 1, onended: null, onpause: null, onerror: null,
      play() { w.__starter.push({ text: Buffer.from(String(src).split(',')[1], 'base64').toString(), at: Date.now() });
        setTimeout(() => el.onended && el.onended(), UPPLASNING_MS); return Promise.resolve() },
      pause() {} };
    return el;
  };
  await vanta(40);
  return w;
}
const chatta = (w, username, comment) =>
  w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: { type: 'chat', username, name: username, comment } }));

test('nästa kommentar börjar direkt — ljudet hämtades medan den väntade i kön', async () => {
  const w = await studio();
  chatta(w, 'anna', 'ett');
  chatta(w, 'bo', 'två');
  chatta(w, 'cia', 'tre');
  await vanta(HAMTNING_MS + 3 * UPPLASNING_MS + 400);

  assert.equal(w.__starter.length, 3, JSON.stringify(w.__starter));
  // Alla tre hämtningarna startar när kommentarerna kommer in, inte en i taget.
  const hamtSpann = w.__hamtningar[2].at - w.__hamtningar[0].at;
  assert.ok(hamtSpann < 50, `hämtningarna startade utspritt över ${hamtSpann} ms`);
  // Pausen mellan två uppläsningar är bara uppläsningen själv, inte uppläsning + hämtning.
  for (let i = 1; i < 3; i++) {
    const glapp = w.__starter[i].at - w.__starter[i - 1].at;
    assert.ok(glapp < UPPLASNING_MS + HAMTNING_MS / 2,
      `uppläsning ${i + 1} började ${glapp} ms efter föregående — hämtningen väntade på kön`);
  }
});

test('en hämtning som misslyckas läses upp av datorns röst, de andra spelas som vanligt', async () => {
  const w = await studio();
  const api = w.VyraAuth.api;
  w.VyraAuth.api = (url, opt) => JSON.parse(opt.body).text.includes('trasig')
    ? Promise.reject(new Error('502')) : api(url, opt);
  chatta(w, 'anna', 'trasig');
  chatta(w, 'bo', 'hel');
  await vanta(HAMTNING_MS + 2 * UPPLASNING_MS + 400);
  assert.deepEqual(w.__starter.map(s => s.text), ['bo säger hel']);
  // Reservvägen från 2026-10-23: molnrösten föll, datorns röst läser samma rad.
  assert.deepEqual(w.__tal.map(t => t.text), ['anna säger trasig']);
});
