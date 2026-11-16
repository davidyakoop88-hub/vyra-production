'use strict';
// Slump utan upprepning (valjSlump i action-event-advanced.js).
//
// "Kör en av dessa slumpmässigt" drog förr ett rent slumptal: samma action två gånger i rad var
// tredje gång med tre att välja på. Proven drar många gånger och mäter egenskaperna, inte en
// viss ordning — påsen är fortfarande slumpad.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./helpers/flikar.js');

const living = [];
test.after(() => { while (living.length) living.pop().close() });
const vanta = ms => new Promise(r => setTimeout(r, ms));

async function flik(o = {}) {
  const lager = F.delatLager();
  const w = await F.fonster({ namn: 'studio', lager, skrivbar: true, ...o });
  living.push(w);
  return w;
}
const ev = (ids, id = 'e1') => ({ id, randomActionIds: ids });

test('1: samma action kommer aldrig två gånger i rad, och alla spelas innan någon upprepas', async () => {
  const w = await flik();
  const v = w.VyraAdvancedEvents.valjSlump;
  const e = ev(['a', 'b', 'c']);
  const dragna = Array.from({ length: 300 }, () => v(e));
  for (let i = 1; i < dragna.length; i++) assert.notEqual(dragna[i], dragna[i - 1], `samma två gånger i rad vid drag ${i}`);
  for (let i = 0; i + 3 <= dragna.length; i += 3) {
    assert.deepEqual([...dragna.slice(i, i + 3)].sort(), ['a', 'b', 'c'], `påse ${i / 3} spelade inte alla en gång`);
  }
});

test('2: två actions växlar, en action väljs alltid, och dubbletter i listan räknas en gång', async () => {
  const w = await flik();
  const v = w.VyraAdvancedEvents.valjSlump;
  const tva = Array.from({ length: 20 }, () => v(ev(['a', 'b'], 'e2')));
  for (let i = 1; i < tva.length; i++) assert.notEqual(tva[i], tva[i - 1]);
  assert.equal(v(ev(['ensam'], 'e3')), 'ensam');
  const dubbel = Array.from({ length: 10 }, () => v(ev(['x', 'x', 'y'], 'e4')));
  for (let i = 1; i < dubbel.length; i++) assert.notEqual(dubbel[i], dubbel[i - 1]);
});

test('3: en action som vilar hoppas över om en annan kan spela', async () => {
  const w = await flik();
  const v = w.VyraAdvancedEvents.valjSlump;
  const e = ev(['a', 'b', 'c'], 'e5');
  for (let i = 0; i < 30; i++) assert.notEqual(v(e, id => id !== 'b'), 'b', 'den vilande valdes fast andra kunde spela');
  assert.ok(['a', 'b', 'c'].includes(v(ev(['a', 'b', 'c'], 'e6'), () => false)), 'kan ingen spela ska ändå en väljas');
});

test('4: ändras listan börjar en ny påse med de nya actionsen', async () => {
  const w = await flik();
  const v = w.VyraAdvancedEvents.valjSlump;
  v(ev(['a', 'b', 'c'], 'e7'));
  const nya = Array.from({ length: 4 }, () => v(ev(['d', 'e'], 'e7')));
  assert.ok(nya.every(x => x === 'd' || x === 'e'), `gamla actions dröjde kvar: ${nya}`);
});

test('5: i den riktiga kedjan spelar en gåva en av de slumpade, med väntetiden respekterad', async () => {
  const actions = ['a', 'b', 'c'].map(id => ({ id, name: id, types: ['overlay'], config: { widget: 'Gift Fireworks' }, cooldown: 60, duration: 1, scene: { number: 1 } }));
  const events = [{ id: 'e1', enabled: true, trigger: 'gift', advancedTrigger: 'gift', triggerValue: 'Rose', condition: 'Rose', actionId: 'a', allActionIds: [], randomActionIds: ['a', 'b', 'c'] }];
  const lager = F.delatLager();
  lager.setItem(F.KEY, JSON.stringify({ actions, events }));
  lager.setItem('vyra-scene-heartbeat-1', String(Date.now()));
  const o = await F.fonster({ namn: 'overlay', scen: 1, lager, actions, events });
  living.push(o);
  await vanta(30);
  // Tre gåvor, varje action har 60 s väntetid: med påsen och vilokollen ska alla tre spela.
  // Med det gamla rena slumptalet valdes ofta en som vilade, och gåvan gav ingenting.
  for (let i = 0; i < 3; i++) { o.VyraActionEvent.handleEvent('gift', { username: 'u' + i, gift: 'Rose', value: 'Rose', coins: 1 }); await vanta(40) }
  await vanta(300);
  assert.equal(o.__utskick, 3, 'en gåva gav ingen effekt fast en action var ledig');
  const logg = JSON.parse(lager.getItem('vyra-action-logg') || '[]');
  const spelade = logg.flatMap(r => r.events.flatMap(e => e.actions.filter(a => !a.skal).map(a => a.id)));
  assert.deepEqual([...spelade].sort(), ['a', 'b', 'c']);
});
