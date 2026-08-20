'use strict';
// Cooldown i en flik som inte får skriva — §15b i docs/tech-debt.md.
//
// `runAction` sparade förr `lastRun` inne i actionen, alltså i `vyra-action-event-v2`. Den nyckeln
// skrivs bara via `VyraSessionState.writeActive`, som kräver `studio-committed` eller
// `local-committed`. En overlayflik står i `overlay-token-readonly` och kunde därför **aldrig**
// spara en stämpel: cooldownen var helt verkningslös i själva utgången som sänds. Uppmätt före
// fixen, fem gåvor under cooldown 30 s i ett fönster utan skrivrätt: fem uppspelningar, 500 poäng.
//
// Stämplarna bor nu i `vyra-action-cooldowns` — rå `localStorage`, ingen projektion, ingen version.
//
// TRE SAKER SOM ÄR LÄTTA ATT TRO FEL OM I DEN HÄR FILEN:
//
//   1. ATT SKRIVNINGEN LYCKADES BEVISAS INTE AV ATT COOLDOWNEN BET. En flik kan ha rätt beteende
//      av fel skäl — därför läser prov 3 båda nycklarna: den nya ska ha fyllts, och
//      `vyra-action-event-v2` ska vara **byte för byte oförändrad**.
//   2. LÄSNINGEN ÄR TVÅKÄLLIG, SKRIVNINGEN ENKÄLLIG. Gamla installationer har stämplar inne i
//      actionen. De läses (prov 4) men skrivs aldrig igen (prov 5).
//   3. EFEMÄRT ÄR INTE DETSAMMA SOM OFARLIGT. `per` är keyad på tittarnas användarnamn, så
//      nyckeln måste torkas vid kontobyte trots att den varken synkas eller backas upp (prov 6).
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');
const F = require('./helpers/flikar.js');
const H = require('./helpers/session-harness.js');
const Session = require(path.join(__dirname, '..', 'session-state.js'));

const COOLDOWN_KEY = 'vyra-action-cooldowns';

const living = [];
test.after(() => { while (living.length) living.pop().close() });
const foljmed = w => { living.push(w); return w };

const vanta = ms => new Promise(r => setTimeout(r, ms));

const action = (o = {}) => ({ id: 'a1', name: 'Fyrverkeri', types: ['overlay'], duration: 1,
  cooldown: 30, config: { widget: 'Gift Fireworks' }, scene: { number: 1 }, ...o });
const handelse = (o = {}) => ({ id: 'e1', trigger: 'gift', triggerValue: 'Rose', actionId: 'a1',
  enabled: true, pointsCost: 100, ...o });
const gava = (o = {}) => ({ username: 'lisa', gift: 'Rose', value: 'Rose', coins: 500, ...o });

// EN overlay, ingen studio: en nivå 2-master, alltså en flik utan skrivrätt för session-state.
// Det är hela poängen med filen — riggens `skrivbar: false` ÄR det tillstånd §15b handlar om.
async function overlayEnsam({ actions = [action()], events = [handelse()], scen = 1,
                              saldo = 1000 } = {}) {
  const lager = F.delatLager();
  lager.setItem(F.KEY, JSON.stringify({ actions, events }));
  lager.setItem(`vyra-scene-heartbeat-${scen}`, String(Date.now()));
  const w = foljmed(await F.fonster({ namn: `overlay ${scen}`, scen, lager, skrivbar: false,
    actions, events }));
  await vanta(30);
  if (saldo) w.VyraPoints.add('lisa', saldo);
  return { lager, w };
}

const bok = lager => JSON.parse(lager.getItem(COOLDOWN_KEY) || '{}');

// ---- 1-2. cooldown biter nu i en flik utan skrivrätt --------------------------------------------

test('1: fem gåvor under cooldown i en overlay ger EN uppspelning och ETT avdrag', async () => {
  const { w } = await overlayEnsam();
  const fore = w.VyraPoints.get('lisa');
  for (let i = 0; i < 5; i++) { w.VyraActionEvent.handleEvent('gift', gava()); await vanta(40) }
  await vanta(1500);

  assert.equal(w.__spelningar, 1, 'cooldownen bet inte i fliken som faktiskt sänder');
  assert.equal(fore - w.VyraPoints.get('lisa'), 100);
});

test('2: cooldown per användare i en overlay stoppar spammaren, inte alla andra', async () => {
  const { w } = await overlayEnsam({ actions: [action({ cooldown: 0, userCooldown: 60 })] });
  w.VyraPoints.add('anna', 1000);
  const fore = { lisa: w.VyraPoints.get('lisa'), anna: w.VyraPoints.get('anna') };

  for (let i = 0; i < 3; i++) { w.VyraActionEvent.handleEvent('gift', gava()); await vanta(40) }
  w.VyraActionEvent.handleEvent('gift', gava({ username: 'anna' }));
  await vanta(1500);

  assert.equal(fore.lisa - w.VyraPoints.get('lisa'), 100, 'lisa betalade för sina spärrade försök');
  assert.equal(fore.anna - w.VyraPoints.get('anna'), 100, 'anna spärrades av lisas cooldown');
  assert.equal(w.__spelningar, 2);
});

// ---- 3. beviset att det var den nya vägen som bar --------------------------------------------

test('3: stämpeln skrevs till den nya nyckeln, och den skyddade rördes inte', async () => {
  const { lager, w } = await overlayEnsam();
  const layoutFore = lager.getItem(F.KEY);

  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(100);

  const post = bok(lager).a1;
  assert.ok(post, `${COOLDOWN_KEY} fylldes aldrig — cooldownen kan ha bitit av fel skäl`);
  assert.ok(Number(post.at) > 0, 'posten saknar tidsstämpel');
  assert.ok(Number(post.per?.lisa) > 0, 'användarstämpeln nådde aldrig nyckeln');

  assert.equal(lager.getItem(F.KEY), layoutFore,
    'den skyddade nyckeln ändrades från en flik utan skrivrätt — då mäter provet något annat');
});

// ---- 4-5. uppgraderingsvägen ------------------------------------------------------------------

test('4: en gammal stämpel inne i actionen läses fortfarande', async () => {
  // Så här ser en installation ut som uppgraderar mitt i en sändning.
  const { w } = await overlayEnsam({ actions: [action({ lastRun: Date.now() })] });
  const fore = w.VyraPoints.get('lisa');

  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(100);

  assert.equal(w.__spelningar, 0, 'den gamla stämpeln ignorerades — cooldowns nollställs vid uppdatering');
  assert.equal(fore - w.VyraPoints.get('lisa'), 0);
});

test('5: en körning lägger ingen stämpel tillbaka i det som synkas', async () => {
  // MÅSTE köras i en SKRIVBAR flik. I en overlay stoppas den gamla skrivningen ändå av
  // writeActive, så provet hade varit grönt även med felet återinfört — ett prov som inte kan
  // falla bevisar ingenting. Studion är den enda flik där läckaget faktiskt kan ske.
  const lager = F.delatLager();
  const actions = [action({ cooldown: 0 })], events = [handelse()];
  lager.setItem(`vyra-scene-heartbeat-1`, String(Date.now()));
  const w = foljmed(await F.fonster({ namn: 'studio', scen: null, lager, skrivbar: true,
    actions, events }));
  await vanta(30);
  w.VyraPoints.add('lisa', 1000);

  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(100);

  assert.ok(bok(lager).a1, 'den skrivbara fliken skrev ingen stämpel alls — provet mäter fel sak');
  const sparad = JSON.parse(lager.getItem(F.KEY)).actions[0];
  assert.equal(sparad.lastRun, undefined, 'stämpeln läckte tillbaka in i den molnsynkade nyckeln');
  assert.equal(sparad.lastRunByUser, undefined, 'användarstämplarna läckte tillbaka in i layouten');
});

// ---- 6. kontoisolering -------------------------------------------------------------------------

test('6: utloggning torkar cooldown-nyckeln — den bär tittarnas namn', async () => {
  // Direkt mot ägaren, för det är beginLogout som är påståendet — inte en flik.
  const storage = H.createStorage({ [COOLDOWN_KEY]: JSON.stringify({ a1: { at: 1, per: { lisa: 1 } } }) });
  const owner = H.createOwner(Session.createSessionState,
    { storage, locks: H.createLockManager(), tabId: 'flik-1' });
  const token = owner.beginProjection();
  await owner.projectActive(token, { mode: 'studio-committed', workspaceId: 'ws', overlayId: 'ov',
    state: H.layout('A'), extras: H.extrasFor('A') });

  assert.ok(storage.getItem(COOLDOWN_KEY), 'riggen hade ingen nyckel att tvätta bort');
  await owner.beginLogout();

  assert.equal(storage.getItem(COOLDOWN_KEY), null,
    'nästa konto på samma dator kunde läsa förra kontots tittarnamn');
});

// ---- 7. gallring -------------------------------------------------------------------------------

test('7: en post äldre än gallringsfönstret slängs vid nästa skrivning', async () => {
  const { lager, w } = await overlayEnsam({ actions: [action({ cooldown: 0 })] });
  const gammalt = Date.now() - 25 * 60 * 60 * 1000;      // fönstret är 24 h
  lager.setItem(COOLDOWN_KEY, JSON.stringify({
    gammal: { at: gammalt, per: { kim: gammalt } },
    fersk: { at: Date.now() - 1000, per: {} },
  }));

  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(100);

  const efter = bok(lager);
  assert.equal(efter.gammal, undefined, 'nyckeln växer för alltid — ingen annan städar den');
  assert.ok(efter.fersk, 'gallringen tog en post som fortfarande var i bruk');
  assert.ok(efter.a1, 'den egna körningen skrevs inte');
});

// ---- 8. ingen regression mot §15a --------------------------------------------------------------

test('8: studio plus två overlays ger fortfarande en uppspelning och ett avdrag', async () => {
  const lager = F.delatLager();
  const actions = [action()], events = [handelse()];
  lager.setItem(F.KEY, JSON.stringify({ actions, events }));
  for (const n of [1, 2]) lager.setItem(`vyra-scene-heartbeat-${n}`, String(Date.now()));

  const flikar = [foljmed(await F.fonster({ namn: 'studio', scen: null, lager, skrivbar: true, actions, events }))];
  for (const n of [1, 2]) flikar.push(foljmed(await F.fonster({ namn: `overlay ${n}`, scen: n, lager, skrivbar: false, actions, events })));
  await vanta(30);
  flikar[0].VyraPoints.add('lisa', 1000);
  const fore = flikar[0].VyraPoints.get('lisa');

  for (const w of flikar) w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(1500);

  assert.equal(fore - flikar[0].VyraPoints.get('lisa'), 100);
  assert.equal(flikar.reduce((s, w) => s + w.__spelningar, 0), 1);
});
