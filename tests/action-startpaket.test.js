'use strict';
// Startpaket (action-snabbstart.js) — snabbstart med ett klick i Action & Event.
//
// Ett startpaket är bara värt något om det som läggs in faktiskt SPELAR när liven händer. Proven
// skriver därför paketen genom en riktig skrivbar studioflik och kör sedan händelserna genom den
// riktiga kedjan i en overlayflik mot samma lager: handleEvent → kanKora/runAction → `vyra:action`.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./helpers/flikar.js');

const living = [];
test.after(() => { while (living.length) living.pop().close() });
const vanta = ms => new Promise(r => setTimeout(r, ms));
const state = lager => JSON.parse(lager.getItem(F.KEY) || '{"actions":[],"events":[]}');

async function studio({ lager = F.delatLager(), actions = [], events = [], sprak = 'sv' } = {}) {
  const w = await F.fonster({ namn: 'studio', lager, skrivbar: true, actions, events, extraFiler: ['action-snabbstart.js'] });
  living.push(w);
  w.VyraLang = { current: () => sprak };
  return { lager, w };
}
// Det studiofliken skrev körs i en overlay på ett EGET lager med samma innehåll — som OBS på en
// annan dator efter molnsynken. Studiofliken håller annars master-låset (action-master.js), och
// en stängd jsdom-flik släpper inte ett lås i provets delade låshanterare.
async function overlay(fran, scen = 1) {
  const s = state(fran);
  const lager = F.delatLager();
  lager.setItem(F.KEY, JSON.stringify(s));
  lager.setItem(`vyra-scene-heartbeat-${scen}`, String(Date.now()));
  const w = await F.fonster({ namn: 'overlay', scen, lager, skrivbar: false, actions: s.actions, events: s.events });
  living.push(w);
  await vanta(30);
  return w;
}

test('1: varje paket bygger events som pekar på sina egna actions, med kända triggers', async () => {
  const { w } = await studio();
  const kanda = new Set(['gift', 'giftCoins', 'follow', 'share', 'chatCommand', 'likes', 'join']);
  for (const paket of w.VyraStartpaket.PAKET) {
    const { actions, events } = w.VyraStartpaket.bygg(paket, 'sv', 123);
    assert.equal(actions.length, events.length, paket.id);
    const ids = new Set(actions.map(a => a.id));
    assert.equal(ids.size, actions.length, `${paket.id}: dubbla action-id`);
    for (const e of events) {
      assert.ok(ids.has(e.actionId), `${paket.id}: event pekar på en action som inte finns`);
      assert.deepEqual([...e.allActionIds], [e.actionId]);
      assert.ok(kanda.has(e.trigger), `${paket.id}: okänd trigger ${e.trigger}`);
      assert.equal(e.trigger, e.advancedTrigger, 'trigger ska spegla advancedTrigger');
      assert.equal(e.condition, e.triggerValue, 'condition ska spegla triggerValue');
      assert.equal(e.enabled, true);
    }
    for (const a of actions) {
      assert.equal(a.startpaket, paket.id);
      assert.equal(a.scene.number, 1);
      if (a.types.includes('alert')) assert.match(a.config.alertText, /\{username\}/);
    }
  }
});

test('2: Lägg till skriver paketet, behåller det som fanns och lägger inte in det två gånger', async () => {
  const egen = { id: 'egen', name: 'Min egen', types: ['alert'], config: {}, scene: { number: 2 } };
  const { lager, w } = await studio({ actions: [egen] });
  const svar = await w.VyraStartpaket.laggTill('gavor');
  assert.deepEqual({ ...svar }, { ok: true, actions: 2, events: 2 });
  let s = state(lager);
  assert.equal(s.actions.length, 3);
  assert.equal(s.actions[0].id, 'egen', 'en befintlig action försvann');
  assert.equal(s.events.length, 2);
  const igen = await w.VyraStartpaket.laggTill('gavor');
  assert.equal(igen.ok, false);
  assert.equal(igen.reason, 'finns-redan');
  s = state(lager);
  assert.equal(s.actions.length, 3, 'paketet lades in två gånger');
});

test('3: på engelska får posterna engelska namn, texter och kommandon', async () => {
  const { lager, w } = await studio({ sprak: 'en' });
  await w.VyraStartpaket.laggTill('chatt');
  const s = state(lager);
  assert.deepEqual(s.actions.map(a => a.name), ['!hype', '!hi']);
  assert.deepEqual(s.events.map(e => e.triggerValue), ['!hype', '!hi']);
  assert.match(s.actions[0].config.alertText, /started the hype/);
});

test('4: gåvopaketet spelar — en liten gåva ger en alert, en stor ger alert och animation', async () => {
  const { lager, w } = await studio();
  await w.VyraStartpaket.laggTill('gavor');
  const o = await overlay(lager);
  o.VyraActionEvent.handleEvent('giftCoins', { username: 'lisa', gift: 'Rose', coins: 1 });
  await vanta(200);
  assert.equal(o.__utskick, 1, 'en gåva på 1 coin ska spela exakt tack-alerten');
  o.VyraActionEvent.handleEvent('giftCoins', { username: 'kim', gift: 'Lion', coins: 600 });
  await vanta(200);
  assert.equal(o.__utskick, 3, 'en gåva på 600 coins ska spela tack-alerten och gåvans animation');
});

test('5: chattpaketet svarar på exakt !hype, inte på ett annat ord', async () => {
  const { lager, w } = await studio();
  await w.VyraStartpaket.laggTill('chatt');
  const o = await overlay(lager);
  o.VyraActionEvent.handleEvent('chatCommand', { username: 'lisa', command: '!hypen' });
  await vanta(150);
  assert.equal(o.__utskick, 0);
  o.VyraActionEvent.handleEvent('chatCommand', { username: 'lisa', command: '!hype' });
  await vanta(150);
  assert.equal(o.__utskick, 1);
});

test('6: knapparna ritas, dialogen visar paketen och ett tillagt paket går inte att lägga till igen', async () => {
  const { lager, w } = await studio();
  const d = w.document;
  d.querySelector('#view').innerHTML = '<section class="ae-actions-card"><div class="ae-actions-toolbar">'
    + '<button id="newAeAction">＋ Skapa Action</button></div><div class="ae-empty-state"></div></section><div id="aeModal"></div>';
  (w.VyraActionsExtras || []).forEach(fn => fn());
  assert.equal(d.querySelectorAll('[data-oppna-paket]').length, 2, 'en knapp bredvid Skapa Action och en i tomläget');
  assert.equal(d.querySelector('#newAeAction').nextElementSibling?.dataset.oppnaPaket, '', 'knappen ska stå direkt efter Skapa Action');
  (w.VyraActionsExtras || []).forEach(fn => fn());
  assert.equal(d.querySelectorAll('[data-oppna-paket]').length, 2, 'knapparna dubblerades vid omritning');
  d.querySelector('.ae-actions-toolbar [data-oppna-paket]').click();
  const knappar = [...d.querySelectorAll('#aeModal [data-paket]')];
  assert.deepEqual(knappar.map(b => b.dataset.paket), ['gavor', 'valkommen', 'chatt']);
  knappar[1].click();
  await vanta(150);
  assert.equal(state(lager).actions.filter(a => a.startpaket === 'valkommen').length, 2);
  const efter = d.querySelector('#aeModal [data-paket="valkommen"]');
  assert.ok(efter, 'dialogen öppnades inte igen efter tillägget');
  assert.equal(efter.disabled, true);
  assert.equal(efter.textContent, 'Tillagt');
  assert.ok(w.__toaster.some(t => /Startpaketet är tillagt/.test(t)));
  d.querySelector('#aeModal [data-stang-paket]').click();
  assert.equal(d.querySelector('#aeModal').innerHTML, '');
});
