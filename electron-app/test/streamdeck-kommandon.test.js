'use strict';
// STREAM DECK 0.2.0 — den lokala serverns del: ett knapptryck med ett kommando når sidan HELT.
//
// plugin.js postar {type:'streamdeck', eventKey, sdKommando, sdVarde, sdVal} till /api/events.
// cleanEvent stryker allt okänt, så utan vitlistan hade knappen nått VYRA utan att säga vad den ska
// göra. Samma fälla som giftId i #350. Och eventKey måste vara unik per tryck: två tryck på samma
// knapp inom 120 s får inte tystas som dubbletter.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { startLocalServer } = require('../local-server');

const ROOT = path.resolve(__dirname, '../..');
let server, origin;
test.before(async () => { server = await startLocalServer(ROOT, 4236); origin = 'http://127.0.0.1:4236'; });
test.after(async () => { if (server) await new Promise(r => server.close(r)) });

const posta = kropp => fetch(`${origin}/api/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(kropp) }).then(r => r.json());

test('ett streamdeck-tryck behåller kommando, värde och val', async () => {
  await posta({ type: 'streamdeck', eventKey: 'sd:ctx:1', sdKommando: 'widget', sdVarde: 'Top Like', sdVal: 'gom' });
  const { events } = await (await fetch(`${origin}/api/events?after=0`)).json();
  const e = events.find(x => x.eventKey === 'sd:ctx:1');
  assert.ok(e, 'trycket kom inte fram');
  assert.equal(e.type, 'streamdeck');
  assert.equal(e.sdKommando, 'widget');
  assert.equal(e.sdVarde, 'Top Like');
  assert.equal(e.sdVal, 'gom');
});

test('två tryck på samma knapp kommer båda fram, och en gåva bär inga sd-fält', async () => {
  await posta({ type: 'streamdeck', eventKey: 'sd:ctx:2', sdKommando: 'latonsk', sdVal: 'hoppa' });
  await posta({ type: 'streamdeck', eventKey: 'sd:ctx:3', sdKommando: 'latonsk', sdVal: 'hoppa' });
  await posta({ type: 'gift', eventKey: 'g1', username: 'a', giftName: 'Rose', sdKommando: 'widget' });
  const { events } = await (await fetch(`${origin}/api/events?after=0`)).json();
  assert.equal(events.filter(x => x.sdKommando === 'latonsk').length, 2);
  assert.equal('sdKommando' in events.find(x => x.eventKey === 'g1'), false);
});
