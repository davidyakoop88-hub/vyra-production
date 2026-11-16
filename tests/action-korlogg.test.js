'use strict';
// Körloggen (action-logg.js) — "varför hände ingenting?".
//
// Varje prov kör den riktiga kedjan: handleEvent i action-event-advanced.js → kanKora/runAction i
// action-event.js → kön i action-runtime.js, i riktiga jsdom-flikar mot ett delat lager. Loggen är
// bara värd något om orsaken den visar är den som faktiskt stoppade uppspelningen, så varje prov
// mäter BÅDE loggraden och vad som spelades.
//
// Prov 5 är också en buggfix: "Aktiverad"-brytaren i Actions-kortet stoppade ingenting så fort
// action-event-advanced.js var laddad, eftersom den vägen anropar runAction direkt och aldrig
// passerade runEvent där brytaren satt.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./helpers/flikar.js');

const NYCKEL = 'vyra-action-logg';
const living = [];
test.after(() => { while (living.length) living.pop().close() });
const vanta = ms => new Promise(r => setTimeout(r, ms));

const action = (o = {}) => ({ id: 'a1', name: 'Fyrverkeri', types: ['overlay'], duration: 1,
  cooldown: 0, config: { widget: 'Gift Fireworks' }, scene: { number: 1 }, ...o });
const handelse = (o = {}) => ({ id: 'e1', trigger: 'gift', triggerValue: 'Rose', actionId: 'a1',
  enabled: true, ...o });
const gava = (o = {}) => ({ username: 'lisa', gift: 'Rose', value: 'Rose', coins: 1, ...o });

async function overlay({ actions = [action()], events = [handelse()], extra = {}, lager = F.delatLager(), scen = 1 } = {}) {
  lager.setItem(F.KEY, JSON.stringify({ actions, events, ...extra }));
  lager.setItem(`vyra-scene-heartbeat-${scen}`, String(Date.now()));
  const w = await F.fonster({ namn: `overlay ${scen}`, scen, lager, skrivbar: false, actions, events });
  living.push(w);
  await vanta(30);
  return { lager, w };
}
const logg = lager => JSON.parse(lager.getItem(NYCKEL) || '[]');

test('1: en gåva som spelar ger en rad där actionen kördes, med runId', async () => {
  const { lager, w } = await overlay();
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(300);
  assert.equal(w.__spelningar, 1);
  const [post] = logg(lager);
  assert.ok(post, 'ingen loggrad skrevs');
  assert.equal(post.anvandare, 'lisa');
  assert.equal(post.vad, 'Rose');
  assert.equal(post.events.length, 1);
  assert.equal(post.events[0].utfall, 'kordes');
  assert.equal(post.events[0].actions[0].skal, '');
  assert.match(post.events[0].actions[0].runId, /^run-/);
});

test('2: väntetiden syns som orsak, med sekunder kvar, och den andra gåvan spelade inte', async () => {
  const { lager, w } = await overlay({ actions: [action({ cooldown: 30 })] });
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(50);
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(300);
  assert.equal(w.__spelningar, 1);
  const [senaste] = logg(lager);
  assert.equal(senaste.events[0].utfall, 'stoppad');
  assert.equal(senaste.events[0].actions[0].skal, 'cooldown');
  assert.ok(senaste.events[0].actions[0].kvar >= 29, `kvar var ${senaste.events[0].actions[0].kvar}`);
});

test('3: fel gåva säger vilket villkor eventet väntade på', async () => {
  const { lager, w } = await overlay();
  w.VyraActionEvent.handleEvent('gift', gava({ gift: 'Lion', value: 'Lion' }));
  await vanta(200);
  assert.equal(w.__spelningar, 0);
  const [post] = logg(lager);
  assert.equal(post.events[0].utfall, 'villkor');
  assert.equal(post.events[0].villkor, 'Rose');
});

test('4: ett avstängt event och ett utan behörighet får var sin orsak', async () => {
  const events = [handelse({ id: 'av', enabled: false }), handelse({ id: 'mod', audience: 'moderator' })];
  const { lager, w } = await overlay({ events });
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(200);
  assert.equal(w.__spelningar, 0);
  const utfall = Object.fromEntries(logg(lager)[0].events.map(r => [r.id, r.utfall]));
  assert.deepEqual(utfall, { av: 'avstangt', mod: 'behorighet' });
});

test('5: pausad automatik spelar INGENTING, och loggen säger varför (buggfix)', async () => {
  const { lager, w } = await overlay({ extra: { actionsEnabled: false } });
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(300);
  assert.equal(w.__spelningar, 0, 'brytaren "Aktiverad" stoppade inte den avancerade vägen');
  assert.equal(logg(lager)[0].events[0].utfall, 'pausad');
});

test('6: Testa-vägen (__test) går förbi pausen, som förut', async () => {
  const { w } = await overlay({ extra: { actionsEnabled: false } });
  w.VyraActionEvent.handleEvent('gift', gava({ __test: true }));
  await vanta(300);
  assert.equal(w.__spelningar, 1);
});

test('7: full kö märks in i efterhand på rätt rad', async () => {
  const lager = F.delatLager();
  lager.setItem('vyra-scene-settings-v1', JSON.stringify({ 1: { maxQueue: 1 } }));
  const { w } = await overlay({ lager, actions: [action({ duration: 5 })] });
  for (let i = 0; i < 3; i++) w.VyraActionEvent.handleEvent('gift', gava({ username: 'u' + i }));
  await vanta(300);
  const skal = logg(lager).map(p => p.events[0].actions[0].skal);
  assert.ok(skal.includes('ko-full'), `ingen rad märktes ko-full: ${JSON.stringify(skal)}`);
  assert.ok(skal.includes(''), 'minst en ska ha spelat');
});

test('8: en trigger utan lyssnande event skriver ingen rad', async () => {
  const { lager, w } = await overlay();
  w.VyraActionEvent.handleEvent('follow', { username: 'lisa' });
  await vanta(100);
  assert.equal(logg(lager).length, 0);
});

test('9: Spela igen kör actionen igen utan poängavdrag, märkt som omspelning', async () => {
  const { lager, w } = await overlay({ events: [handelse({ pointsCost: 100 })] });
  w.VyraPoints.add('lisa', 1000);
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(1300);
  const saldo = w.VyraPoints.get('lisa');
  const id = logg(lager)[0].id;
  assert.equal(w.VyraActionLogg.spelaIgen(id), true);
  await vanta(300);
  assert.equal(w.__spelningar, 2);
  assert.equal(w.VyraPoints.get('lisa'), saldo, 'omspelningen drog poäng av tittaren');
  assert.equal(logg(lager)[0].omspelning, true);
});

test('10: loggen är begränsad och torkas vid kontobyte (användarnamn i raderna)', async () => {
  const { lager, w } = await overlay();
  for (let i = 0; i < 70; i++) w.VyraActionEvent.handleEvent('gift', gava({ gift: 'Lion', value: 'Lion' }));
  await vanta(100);
  assert.equal(logg(lager).length, 60);
  assert.ok(w.VyraSessionState.EPHEMERAL_KEYS.includes(NYCKEL), `${NYCKEL} saknas i EPHEMERAL_KEYS`);
});
