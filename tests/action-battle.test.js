'use strict';
// Battle-triggers (action-battle.js) — Events som startar på något som händer i en TikTok-battle.
//
// Händelserna har formen bryggan faktiskt skickar (uppmätt 2026-09-06, docs/live-verifiering.md):
// `battle` med battleStatus battle_started / battle_finished, battleId, remainingSec och
// scoreUs/scoreThem, och `glove` när ett boost-fönster öppnar. Proven mäter två saker: VILKA
// händelser ett flöde ger (tolka), och att ett Event för en av dem spelar i den riktiga kedjan.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./helpers/flikar.js');

const living = [];
test.after(() => { while (living.length) living.pop().close() });
const vanta = ms => new Promise(r => setTimeout(r, ms));
let lopnr = 0;
const battle = (status, o = {}) => ({ id: 'b' + (++lopnr), type: 'battle', battleStatus: status, battleId: 'm1', ...o });
const glove = (o = {}) => ({ id: 'g' + (++lopnr), type: 'glove', multiplier: 2, durationSec: 60, battleId: 'm1', ...o });

async function flik(o = {}) {
  const w = await F.fonster({ namn: 'flik', lager: F.delatLager(), extraFiler: ['action-battle.js'], ...o });
  living.push(w);
  w.VyraActionBattle.nollstall();
  return w;
}

test('1: en hel match — start en gång, ledningsbyten, boost, slut och vinst', async () => {
  const w = await flik();
  const t = e => [...w.VyraActionBattle.tolka(e)].map(h => h.handelse);
  assert.deepEqual(t(battle('battle_started', { remainingSec: 300, scoreUs: 0, scoreThem: 0 })), ['start']);
  assert.deepEqual(t(battle('battle_started', { remainingSec: 290, scoreUs: 0, scoreThem: 0 })), [], 'starten fyrade igen');
  assert.deepEqual(t(battle('battle_started', { scoreUs: 10, scoreThem: 0 })), ['leder']);
  assert.deepEqual(t(battle('battle_started', { scoreUs: 20, scoreThem: 5 })), [], 'samma ledare ska inte fyra igen');
  assert.deepEqual(t(glove()), ['boost']);
  assert.deepEqual(t(battle('battle_started', { scoreUs: 20, scoreThem: 40 })), ['efter']);
  assert.deepEqual(t(battle('battle_started', { scoreUs: 90, scoreThem: 40 })), ['leder']);
  assert.deepEqual(t(battle('battle_finished', { scoreUs: 120, scoreThem: 40 })), ['slut', 'vinst']);
  assert.deepEqual(t(battle('battle_finished', { scoreUs: 120, scoreThem: 40 })), [], 'slutet fyrade två gånger');
  assert.deepEqual(t(battle('battle_started', { remainingSec: 300 })), [], 'en avslutad match startade om');
});

test('2: 0–0 betyder "vet inte" — slut fyrar, men aldrig vinst, förlust eller oavgjort', async () => {
  const w = await flik();
  const t = e => [...w.VyraActionBattle.tolka(e)].map(h => h.handelse);
  assert.deepEqual(t(battle('battle_started', { battleId: 'm2', remainingSec: 300, scoreUs: 0, scoreThem: 0 })), ['start']);
  assert.deepEqual(t(battle('battle_finished', { battleId: 'm2', scoreUs: 0, scoreThem: 0 })), ['slut']);
  assert.deepEqual(t(battle('battle_started', { battleId: 'm3', remainingSec: 300 })), ['start']);
  assert.deepEqual(t(battle('battle_finished', { battleId: 'm3' })), ['slut'], 'utan poäng ska inget resultat gissas');
});

test('3: förlust och oavgjort, och slutpoängen tas från matchen när slutet saknar dem', async () => {
  const w = await flik();
  const t = e => [...w.VyraActionBattle.tolka(e)].map(h => h.handelse);
  t(battle('battle_started', { battleId: 'm4', remainingSec: 300 }));
  t(battle('battle_started', { battleId: 'm4', scoreUs: 5, scoreThem: 50 }));
  assert.deepEqual(t(battle('battle_finished', { battleId: 'm4' })), ['slut', 'forlust']);
  t(battle('battle_started', { battleId: 'm5', remainingSec: 300 }));
  assert.deepEqual(t(battle('battle_finished', { battleId: 'm5', scoreUs: 30, scoreThem: 30 })), ['slut', 'oavgjort']);
});

test('4: laddad mitt i en match — ingen start i efterhand, och samma event-id fyrar inte två gånger', async () => {
  const w = await flik();
  const t = e => [...w.VyraActionBattle.tolka(e)].map(h => h.handelse);
  assert.deepEqual(t(battle('battle_started', { battleId: 'm6', remainingSec: 120 })), []);
  const g = glove({ id: 'samma' });
  assert.deepEqual(t(g), ['boost']);
  assert.deepEqual(t({ ...g }), [], 'samma händelse via två kanaler fyrade två gånger');
  assert.deepEqual(t({ type: 'gift', id: 'x1' }), [], 'en gåva är ingen battle-händelse');
});

test('5: ett Event för "Vi vinner" spelar på vinst och inte på slut eller förlust', async () => {
  const actions = [{ id: 'a1', name: 'Vinst', types: ['overlay'], config: { widget: 'Gift Fireworks' }, duration: 1, scene: { number: 1 } }];
  const events = [{ id: 'e1', enabled: true, trigger: 'battle', advancedTrigger: 'battle', triggerValue: 'vinst', condition: 'vinst',
    audience: 'everyone', actionId: 'a1', allActionIds: ['a1'], randomActionIds: [] }];
  const lager = F.delatLager();
  lager.setItem(F.KEY, JSON.stringify({ actions, events }));
  lager.setItem('vyra-scene-heartbeat-1', String(Date.now()));
  const o = await F.fonster({ namn: 'overlay', scen: 1, lager, actions, events, extraFiler: ['action-battle.js'] });
  living.push(o);
  o.VyraActionBattle.nollstall();
  await vanta(30);
  const B = o.VyraActionBattle;
  B.hantera(battle('battle_started', { battleId: 'm7', remainingSec: 300 }));
  B.hantera(battle('battle_started', { battleId: 'm7', scoreUs: 1, scoreThem: 9 }));
  B.hantera(battle('battle_finished', { battleId: 'm7' }));
  await vanta(150);
  assert.equal(o.__utskick, 0, 'vinst-eventet spelade på en förlust');
  B.hantera(battle('battle_started', { battleId: 'm8', remainingSec: 300 }));
  B.hantera(battle('battle_finished', { battleId: 'm8', scoreUs: 50, scoreThem: 10 }));
  await vanta(200);
  assert.equal(o.__utskick, 1, 'vinst-eventet spelade inte på en vinst');
  const rad = JSON.parse(lager.getItem('vyra-action-logg') || '[]').find(r => r.vad === 'vinst');
  assert.ok(rad, 'körloggen fick ingen rad för vinsten');
});

test('6: länken i routeLiveBattleEvent-kedjan kör vidare även om en tidigare länk kastar', async () => {
  const w = await flik();
  let anrop = 0;
  w.routeLiveBattleEvent = () => { anrop++; throw new Error('trasig widget') };
  assert.equal(w.VyraActionBattle.koppla(), true);
  const sedda = [];
  w.VyraActionEvent = { handleEvent: (trig, p) => sedda.push(trig + ':' + p.value) };
  assert.throws(() => w.routeLiveBattleEvent(glove({ id: 'kedja' })), /trasig widget/);
  assert.equal(anrop, 1);
  assert.deepEqual(sedda, ['battle:boost']);
  assert.equal(w.VyraActionBattle.koppla(), false, 'länken lades på två gånger');
});

test('7: eventpanelens lista är samma som filens, och panelen sparar en battle-händelse neutralt', async () => {
  const lager = F.delatLager();
  const actions = [{ id: 'a1', name: 'Vinst', types: ['alert'], config: {}, scene: { number: 1 } }];
  const w = await F.fonster({ namn: 'studio', lager, skrivbar: true, actions, extraFiler: ['action-battle.js'] });
  living.push(w);
  const d = w.document;
  // VyraSafe ägs av overlay-sanitize.js, som provflikarna inte laddar (samma stubbe som
  // event-bakatkompatibilitet.test.js).
  w.VyraSafe = { text: v => String(v == null ? '' : v), url: v => String(v == null ? '' : v) };
  const nav = d.createElement('a'); nav.dataset.extra = 'actions'; nav.className = 'active'; d.body.append(nav);
  w.VyraActionEvent.refresh();
  d.querySelector('#newAeEventCard').click();
  const radio = d.querySelector('[name=aeAdvancedTrigger][value=battle]');
  assert.ok(radio, 'triggern saknas i eventpanelen');
  d.querySelector('[name=aeAudience][value=follower]').checked = true;
  d.querySelector('#aePointsCost').value = '50';
  radio.checked = true; radio.dispatchEvent(new w.Event('change'));
  const val = d.querySelector('#aeAdvancedValue');
  assert.equal(val.tagName, 'SELECT');
  const handelser = JSON.stringify(w.VyraActionBattle.HANDELSER);
  assert.equal(JSON.stringify([...val.options].map(o => [o.value, o.textContent])), handelser);
  // Reservlistan i action-event-advanced.js (används om action-battle.js inte hunnit ladda) får
  // inte glida isär från filens lista.
  const kalla = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'action-event-advanced.js'), 'utf8');
  const reserv = /const BATTLE_REFERENS=(\[\[.*?\]\]);/.exec(kalla);
  assert.ok(reserv, 'BATTLE_REFERENS hittades inte');
  assert.equal(JSON.stringify(JSON.parse(reserv[1].replace(/'/g, '"'))), handelser, 'reservlistan har glidit isär från HANDELSER');
  assert.equal(d.querySelector('#aeAudienceRubrik').closest('.ae-sek').hidden, true, '"Vem" ska döljas för en battle-händelse');
  val.value = 'vinst';
  d.querySelector('[data-fn-check]')?.click();
  d.querySelector('#aeAllActions').options[0].selected = true;
  d.querySelector('#saveAeEvent').click();
  await vanta(200);
  const e = JSON.parse(lager.getItem(F.KEY)).events[0];
  assert.ok(e, 'eventet sparades inte');
  assert.equal(e.trigger, 'battle');
  assert.equal(e.triggerValue, 'vinst');
  assert.equal(e.audience, 'everyone', 'ett dolt "Bara följare" hade gjort eventet omöjligt att trigga');
  assert.equal(e.pointsCost, 0);
  assert.match(d.querySelector('.ae-events-table').textContent, /Battle: Vi vinner/);
});
