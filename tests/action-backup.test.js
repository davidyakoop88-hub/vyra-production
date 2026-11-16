'use strict';
// Backup av automatiken (action-backup.js) — export och import i Action & Event.
//
// En backup är bara värd något om det som läses tillbaka SPELAR: rätt actions, events som pekar
// på rätt actions efter att id:na skrivits om, och mediefilerna med. Proven skriver genom en
// riktig skrivbar studioflik (writeActive) och kör ett importerat event genom den riktiga kedjan
// i en overlayflik. Mediefilerna går via ett utbytt lager: jsdom har ingen IndexedDB.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./helpers/flikar.js');

const living = [];
test.after(() => { while (living.length) living.pop().close() });
const vanta = ms => new Promise(r => setTimeout(r, ms));
const state = lager => JSON.parse(lager.getItem(F.KEY) || '{"actions":[],"events":[]}');

async function studio({ lager = F.delatLager(), actions = [], events = [], timers = [] } = {}) {
  const w = await F.fonster({ namn: 'studio', lager, skrivbar: true, actions, events, extraFiler: ['action-backup.js'] });
  living.push(w);
  if (timers.length) {
    const r = await w.VyraSessionState.writeActive(F.KEY, JSON.stringify({ actions, events, timers }));
    assert.equal(r.ok, true);
  }
  const filer = new Map();
  w.VyraActionBackup.media = {
    las: async id => filer.get(id) || null,
    skriv: async (id, blob) => { filer.set(id, blob); return true }
  };
  return { lager, w, filer };
}
const ljud = (w, text = 'hej') => Object.assign(new w.Blob([text], { type: 'audio/mpeg' }), { name: 'ljud.mp3' });

const A = (id, o = {}) => ({ id, name: 'Action ' + id, types: ['alert'], config: { alertText: 'Tack {username}' }, scene: { number: 1 }, duration: 1, ...o });
const E = (id, actionId, o = {}) => ({ id, enabled: true, trigger: 'gift', advancedTrigger: 'gift', triggerValue: 'Rose', condition: 'Rose', actionId, allActionIds: [actionId], randomActionIds: [], ...o });

test('1: exporten bär actions, events, timers och mediefilerna, och läses tillbaka oförändrad', async () => {
  const actions = [A('a1', { types: ['audio'], audioMedia: { id: 'media-1', name: 'ljud.mp3', type: 'audio/mpeg', size: 3 } }), A('a2')];
  const { w, filer } = await studio({ actions, events: [E('e1', 'a1')], timers: [{ id: 't1', actionId: 'a2', intervalMinutes: 5, enabled: true }] });
  filer.set('media-1', ljud(w));
  const fil = await w.VyraActionBackup.bygg(Date.UTC(2026, 10, 16));
  assert.equal(fil.format, 'vyra-automatik');
  assert.equal(fil.skapad.slice(0, 10), '2026-11-16');
  assert.deepEqual([fil.actions.length, fil.events.length, fil.timers.length], [2, 1, 1]);
  assert.deepEqual(Object.keys(fil.media), ['media-1']);
  assert.equal(Buffer.from(fil.media['media-1'].data, 'base64').toString(), 'hej');
  assert.equal(fil.media['media-1'].type, 'audio/mpeg');
  const tillbaka = w.VyraActionBackup.tolka(JSON.stringify(fil));
  assert.equal(tillbaka.kalla, 'automatik');
  assert.deepEqual(Array.from(tillbaka.actions, a => a.id), ['a1', 'a2']);
  assert.equal(tillbaka.media['media-1'].data, fil.media['media-1'].data);
});

test('2: Lägg till ger nya id, pekar om events och timers, och rör inget befintligt', async () => {
  const { lager, w, filer } = await studio({ actions: [A('a1', { name: 'Min egen' })], events: [E('e1', 'a1')] });
  const fil = {
    actions: [A('a1', { name: 'Från filen', types: ['audio'], audioMedia: { id: 'media-x', name: 'x.mp3' } }), A('a2')],
    events: [E('e1', 'a1', { allActionIds: ['a1', 'a2'], randomActionIds: ['a2'] }), E('e2', 'saknas')],
    timers: [{ id: 't1', actionId: 'a2', intervalMinutes: 3, enabled: true }],
    media: { 'media-x': { name: 'x.mp3', type: 'audio/mpeg', data: Buffer.from('ljud').toString('base64') } }
  };
  const svar = await w.VyraActionBackup.lasIn(fil, 'lagg-till');
  assert.deepEqual({ ...svar }, { ok: true, lage: 'lagg-till', actions: 2, events: 1, media: 1 });
  const s = state(lager);
  assert.equal(s.actions.length, 3);
  assert.equal(s.actions[0].name, 'Min egen', 'den befintliga actionen ändrades');
  assert.equal(s.actions[0].id, 'a1');
  const ids = s.actions.map(a => a.id);
  assert.equal(new Set(ids).size, 3, 'två actions fick samma id');
  const [, nyA1, nyA2] = s.actions;
  assert.equal(nyA1.name, 'Från filen');
  assert.equal(s.events.length, 2, 'eventet som pekade på en action som inte finns ska inte följa med');
  const nyttEvent = s.events[1];
  assert.equal(nyttEvent.actionId, nyA1.id);
  assert.deepEqual([...nyttEvent.allActionIds], [nyA1.id, nyA2.id]);
  assert.deepEqual([...nyttEvent.randomActionIds], [nyA2.id]);
  assert.equal(s.events[0].actionId, 'a1', 'det befintliga eventet pekades om');
  assert.equal(s.timers.length, 1);
  assert.equal(s.timers[0].actionId, nyA2.id);
  assert.equal(await filer.get('media-x').text(), 'ljud', 'mediefilen skrevs inte tillbaka');
});

test('3: Ersätt allt byter ut automatiken, och Ångra lägger tillbaka den', async () => {
  const fore = { actions: [A('a1'), A('a2')], events: [E('e1', 'a1')] };
  const { lager, w } = await studio(fore);
  const svar = await w.VyraActionBackup.lasIn({ actions: [A('x1')], events: [], timers: [], media: {} }, 'ersatt');
  assert.equal(svar.ok, true);
  assert.deepEqual(state(lager).actions.map(a => a.id), ['x1']);
  assert.equal(state(lager).events.length, 0);
  const angra = await w.VyraActionBackup.angraSenaste();
  assert.equal(angra.ok, true);
  assert.deepEqual(state(lager).actions.map(a => a.id), ['a1', 'a2']);
  assert.deepEqual(state(lager).events.map(e => e.id), ['e1']);
  assert.equal((await w.VyraActionBackup.angraSenaste()).reason, 'inget-att-angra');
});

test('4: tolka tar layoutfilen från Inställningar och säger ifrån om allt annat', async () => {
  const { w } = await studio();
  const B = w.VyraActionBackup;
  const layout = { widgets: [{ id: 'w1' }], __vyraBackup: { schema: 1, createdAt: Date.UTC(2026, 10, 1), storage: { [F.KEY]: JSON.stringify({ actions: [A('a1')], events: [E('e1', 'a1')] }) } } };
  const fil = B.tolka(JSON.stringify(layout));
  assert.equal(fil.kalla, 'layout');
  assert.equal(fil.actions.length, 1);
  assert.deepEqual({ ...fil.media }, {});
  assert.throws(() => B.tolka('inte json'), /inte en VYRA-backup/);
  assert.throws(() => B.tolka('{"hej":1}'), /inte en VYRA-backup/);
  assert.throws(() => B.tolka(JSON.stringify({ widgets: [{ id: 'w1' }] })), /ingen automatik/);
  assert.throws(() => B.tolka(JSON.stringify({ format: 'vyra-automatik', version: 99 })), /nyare version/);
});

test('5: ett importerat event spelar i overlayn', async () => {
  const { lager, w } = await studio();
  await w.VyraActionBackup.lasIn({ actions: [A('a9', { types: ['overlay'], config: { widget: 'Gift Fireworks' } })], events: [E('e9', 'a9')], timers: [], media: {} }, 'lagg-till');
  const o = F.delatLager();
  o.setItem(F.KEY, JSON.stringify(state(lager)));
  o.setItem('vyra-scene-heartbeat-1', String(Date.now()));
  const s = state(lager);
  const ov = await F.fonster({ namn: 'overlay', scen: 1, lager: o, actions: s.actions, events: s.events });
  living.push(ov);
  await vanta(30);
  ov.VyraActionEvent.handleEvent('gift', { username: 'lisa', gift: 'Rose', value: 'Rose', coins: 1 });
  await vanta(250);
  assert.equal(ov.__utskick, 1, 'det importerade eventet spelade inte');
});

test('6: panelen, importdialogen och Ångra-knappen', async () => {
  const { lager, w } = await studio({ actions: [A('a1')], events: [E('e1', 'a1')] });
  const d = w.document;
  d.querySelector('#view').innerHTML = '<div data-ae-advanced-body></div><div id="aeModal"></div>';
  (w.VyraActionsExtras || []).forEach(fn => fn());
  (w.VyraActionsExtras || []).forEach(fn => fn());
  assert.equal(d.querySelectorAll('.ae-backup').length, 1, 'panelen ritades två gånger');
  assert.ok(d.querySelector('[data-backup-export]'));
  assert.ok(d.querySelector('[data-backup-fil]'));
  assert.equal(d.querySelector('[data-backup-angra]').hidden, true, 'Ångra syns innan något importerats');
  w.VyraActionBackup.fraga({ actions: [A('n1'), A('n2')], events: [E('ne1', 'n1')], timers: [], media: {}, skapad: '2026-11-16T10:00:00.000Z', kalla: 'automatik' });
  assert.match(d.querySelector('.ae-backup-sammanfattning').textContent, /^Filen innehåller 2 actions, 1 events\. Sparad 2026-11-16\.$/);
  assert.match(d.querySelector('.ae-modal-backup').textContent, /Dina nuvarande 1 actions och 1 events tas bort/);
  d.querySelector('[data-backup-lage="lagg-till"]').click();
  await vanta(150);
  assert.equal(d.querySelector('#aeModal').innerHTML, '', 'dialogen stängdes inte');
  assert.equal(state(lager).actions.length, 3);
  assert.ok(w.__toaster.some(t => t === '2 actions och 1 events lades till'), w.__toaster.join(' | '));
  d.querySelector('.ae-backup').remove();
  (w.VyraActionsExtras || []).forEach(fn => fn());
  const angra = d.querySelector('[data-backup-angra]');
  assert.equal(angra.hidden, false, 'Ångra syns inte efter en import');
  angra.click();
  await vanta(150);
  assert.equal(state(lager).actions.length, 1);
  assert.ok(w.__toaster.includes('Importen är ångrad'));
});
