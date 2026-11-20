'use strict';
// EGNA LJUD FÖLJER KONTOT (David 2026-11-20: "fixa sound alert-filerna så de följer med till appen").
//
// Ett eget ljud låg som rad i localStorage och som fil i IndexedDB — båda per webbläsare. Alerten
// följde med till skrivbordsappen (den bor i vyra-extras), men ljudet den pekade på fanns inte där,
// och alerten var tyst. Nu bor raden också i vyra-extras (soundAlerts.library) och filen i kontots
// medielagring; en dator som saknar filen hämtar den därifrån.
//
// Hela vägen — uppladdning, efterhandsuppladdning av gamla ljud, hämtning på en ren dator, och
// 401:an när en annan flik bytt CSRF-token — är provad mot riktig server och objektlagring. Det här
// provet vaktar de delar som går att nå utan IndexedDB (jsdom har ingen): att raderna slås ihop
// rätt, att en skrivning av alerterna inte tappar biblioteket, och att filen efterfrågas ur kontot.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./helpers/flikar.js');

const vanta = ms => new Promise(r => setTimeout(r, ms));
const oppna = [];
test.after(() => { while (oppna.length) try { oppna.pop().close() } catch {} });

const rad = { id: 'custom-1', name: 'mitt ljud', mediaMeta: { id: 'media-1', name: 'mitt ljud.mp3', type: 'audio/mpeg', size: 1234, cloudId: 'c1', cloudWs: 'ws1' } };
const alert = { id: 's1', trigger: 'gift', condition: 'Eye for an Eye', giftId: '1374221', soundId: 'custom-1', volume: 60, cooldown: 0, enabled: true };
const gava = () => ({ type: 'gift', giftName: 'Eye for an Eye', giftId: '1374221', diamondCount: 1999, id: 'g' + Math.random().toString(36).slice(2), at: Date.now() });

async function studio(soundAlerts) {
  const lager = F.delatLager();
  lager.setItem('vyra-extras', JSON.stringify({ soundAlerts }));
  const w = await F.fonster({ namn: 'studio', lager, skrivbar: true, ljud: true, actions: [], events: [], extraFiler: ['sound-alerts.js'] });
  oppna.push(w);
  return w;
}
const extras = w => JSON.parse(w.VyraSessionState.readActiveExtra('vyra-extras'));

test('biblioteket läses ur kontot — en dator utan egna rader ser ljudet', async () => {
  const w = await studio({ alerts: [alert], library: [rad] });
  assert.equal(w.localStorage.getItem('vyra-sound-alert-library-v1'), null, 'riggen ska sakna lokala rader');
  assert.deepEqual(Array.from(w.saReadLibrary(), r => r.id), ['custom-1']);
  assert.equal(w.saSound('custom-1').name, 'mitt ljud');
});

test('samma ljud i kontot och i webbläsaren blir en rad, och kontots fil-id överlever', async () => {
  const w = await studio({ alerts: [], library: [rad] });
  // Som raden såg ut innan den nådde kontot: samma id, ingen cloudId.
  w.localStorage.setItem('vyra-sound-alert-library-v1', JSON.stringify([
    { id: 'custom-1', name: 'mitt ljud', mediaMeta: { id: 'media-1', name: 'mitt ljud.mp3', type: 'audio/mpeg', size: 1234 } },
    { id: 'custom-2', name: 'bara här', mediaMeta: { id: 'media-2', name: 'bara här.wav', type: 'audio/wav', size: 99 } },
  ]));
  const bibliotek = w.saReadLibrary();
  assert.deepEqual(Array.from(bibliotek, r => r.id), ['custom-1', 'custom-2']);
  assert.equal(bibliotek[0].mediaMeta.cloudId, 'c1');
  assert.equal(bibliotek[1].mediaMeta.cloudId, undefined);
});

test('att spara alerterna tappar inte biblioteket, och tvärtom', async () => {
  const w = await studio({ alerts: [alert], library: [rad] });
  assert.equal(await w.saWriteAlerts([]), true);
  assert.deepEqual(extras(w).soundAlerts.library.map(r => r.id), ['custom-1'], 'biblioteket försvann när alerterna skrevs');
  assert.equal(await w.saWriteLibrary([rad, { id: 'custom-2', name: 'två', mediaMeta: { id: 'media-2' } }]), true);
  assert.deepEqual(extras(w).soundAlerts.alerts, [], 'alerterna försvann när biblioteket skrevs');
  assert.equal(extras(w).soundAlerts.library.length, 2);
});

test('en dator som saknar filen hämtar den ur kontot när alerten ska spelas', async () => {
  const w = await studio({ alerts: [alert], library: [rad] });
  const anrop = [];
  w.VyraAuth = { api: async sokvag => { anrop.push(sokvag); return { ok: true, url: 'https://lager.test/ws1/c1.mp3?signatur=x', expiresIn: 300 } } };
  // Lagringen släpper inte igenom en fetch härifrån: länken spelas då direkt i stället.
  w.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: gava() }));
  await vanta(60);
  assert.deepEqual(anrop, ['/api/workspaces/ws1/media/c1']);
  assert.deepEqual(w.__ljud.map(a => String(a.src)), ['https://lager.test/ws1/c1.mp3?signatur=x']);
});

test('ett ljud som aldrig nått kontot spelar inte, och frågar inte servern', async () => {
  const utanMoln = { ...rad, mediaMeta: { id: 'media-1', name: 'mitt ljud.mp3', type: 'audio/mpeg', size: 1234 } };
  const w = await studio({ alerts: [alert], library: [utanMoln] });
  const anrop = [];
  w.VyraAuth = { api: async sokvag => { anrop.push(sokvag); return { ok: true, url: 'https://lager.test/x' } } };
  w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: gava() }));
  await vanta(60);
  assert.equal(w.__ljud.length, 0);
  assert.deepEqual(anrop, []);
});

test('medielagringens tre ljudtyper väljs efter ändelsen, vad webbläsaren än kallar filen', async () => {
  const w = await studio({ alerts: [] });
  assert.equal(w.saMolnTyp('a.MP3', 'audio/mp3'), 'audio/mpeg');
  assert.equal(w.saMolnTyp('a.wav', 'audio/x-wav'), 'audio/wav');
  assert.equal(w.saMolnTyp('a.ogg', ''), 'audio/ogg');
  assert.equal(w.saMolnTyp('a.flac', 'audio/flac'), '');
});
