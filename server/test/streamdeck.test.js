'use strict';
// STREAM DECK-MOLNVÄGEN, utan en riktig databas. Poolen är en stubb som fångar varje fråga, så
// provet kan slå fast det enda som får vara sant: koden och token lagras ALDRIG i klartext, koden
// blir en token exakt en gång, och en okänd token ger ingen enhet.
const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../security');
const { createStreamdeck, genereraKod, normaliseraKod, KOD_ALFABET, KOD_LANGD, KOMMANDON } = require('../streamdeck');
const { cleanEvent, ALLOWED } = require('../event-bus');

function stubbPool(svar = () => ({ rows: [], rowCount: 0 })) {
  return { fragor: [], async query(sql, args) { this.fragor.push({ sql, args }); return svar(sql, args); } };
}

test('koden är åtta tecken ur ett alfabet utan tvetydiga tecken', () => {
  for (let i = 0; i < 200; i++) {
    const kod = genereraKod();
    assert.equal(kod.length, KOD_LANGD);
    for (const c of kod) assert.ok(KOD_ALFABET.includes(c), `tecknet ${c} står inte i alfabetet`);
  }
  for (const dalig of ['0', 'O', '1', 'I', 'L', 'U']) assert.ok(!KOD_ALFABET.includes(dalig), `${dalig} borde inte finnas i alfabetet`);
});

test('normaliseraKod tar bort gemener, mellanslag och bindestreck', () => {
  assert.equal(normaliseraKod('abcd-2345'), 'ABCD2345');
  assert.equal(normaliseraKod(' ab cd 23 '), 'ABCD23');
});

test('skapaKod lagrar bara hashen och visar koden med bindestreck', async () => {
  const pool = stubbPool();
  const sd = createStreamdeck({ pool, now: () => 1000 });
  const ut = await sd.skapaKod('w1', 'u1');
  assert.match(ut.kod, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const insert = pool.fragor.find(f => /INSERT INTO streamdeck_pairings/.test(f.sql));
  assert.ok(insert, 'ingen INSERT skedde');
  const raGma = ut.kod.replace('-', '');
  assert.equal(insert.args[1], S.digest(raGma), 'code_hash är inte hashen av koden');
  assert.notEqual(insert.args[1], raGma, 'koden lagrades i klartext');
  assert.ok(insert.args.every(a => String(a) !== raGma), 'råa koden läckte in i en kolumn');
  assert.equal(insert.args[0], 'w1'); assert.equal(insert.args[2], 'u1');
});

test('parkoppla byter koden mot en token och lagrar bara token-hashen', async () => {
  const pool = stubbPool(sql => /WITH par AS/.test(sql) ? { rows: [{ device_id: 'd1', workspace_id: 'w1' }], rowCount: 1 } : { rows: [], rowCount: 0 });
  const sd = createStreamdeck({ pool });
  const ut = await sd.parkoppla('abcd-2345', 'Vardagsrummet');
  assert.ok(ut.deviceToken && ut.deviceToken.length >= 32, 'ingen token returnerades');
  assert.equal(ut.workspaceId, 'w1');
  const q = pool.fragor.find(f => /WITH par AS/.test(f.sql));
  assert.equal(q.args[0], S.digest('ABCD2345'), 'slog inte upp på kodens hash');
  assert.equal(q.args[1], S.digest(ut.deviceToken), 'token_hash är inte hashen av token');
  assert.notEqual(q.args[1], ut.deviceToken, 'token lagrades i klartext');
});

test('parkoppla avvisar en kort kod och en okänd kod', async () => {
  const kort = createStreamdeck({ pool: stubbPool() });
  await assert.rejects(() => kort.parkoppla('AB'), e => e.status === 400);
  const okand = createStreamdeck({ pool: stubbPool(() => ({ rows: [], rowCount: 0 })) });
  await assert.rejects(() => okand.parkoppla('ABCD2345'), e => e.status === 404);
});

test('enhetAvToken avvisar en tom token och uppdaterar last_seen på en giltig', async () => {
  const tom = createStreamdeck({ pool: stubbPool() });
  assert.equal(await tom.enhetAvToken(''), null);
  const pool = stubbPool(() => ({ rows: [{ id: 'd1', workspace_id: 'w1', label: 'Stream Deck' }], rowCount: 1 }));
  const sd = createStreamdeck({ pool });
  const enhet = await sd.enhetAvToken('x'.repeat(43));
  assert.equal(enhet.workspace_id, 'w1');
  assert.match(pool.fragor[0].sql, /UPDATE streamdeck_devices SET last_seen_at=now\(\)/);
});

test('event-bussen släpper igenom streamdeck och bär bara sd-fälten på den typen', () => {
  assert.ok(ALLOWED.has('streamdeck'), 'streamdeck står inte i ALLOWED — bussen kastar den');
  const e = cleanEvent({ id: 'sd:1', type: 'streamdeck', sdKommando: 'action', sdVarde: 'Fyrverkeri', sdVal: '', userId: 'x', username: 'y' });
  assert.equal(e.sdKommando, 'action');
  assert.equal(e.sdVarde, 'Fyrverkeri');
  const gava = cleanEvent({ id: 'g1', type: 'gift', sdKommando: 'action' });
  assert.equal(gava.sdKommando, undefined, 'en gåva bär ett sd-fält den inte ska ha');
});

test('molnvägens kommandon är exakt de klienten känner igen', () => {
  assert.deepEqual([...KOMMANDON].sort(), ['action', 'latonsk', 'ljud', 'scen', 'spotify', 'timer', 'tts', 'widget']);
});
