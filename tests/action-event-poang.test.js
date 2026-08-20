'use strict';
// Poängekonomin i Action & Event — betalar tittaren för uppspelningar som aldrig sker?
//
// §13 i docs/tech-debt.md: avdraget låg i `handleEvent` FÖRE allt som kan säga nej. Cooldown,
// cooldown per användare, raderad action och offline scen avgörs alla efteråt, i `runAction` —
// och poängen var redan borta. Uppmätt 2026-08-14: cooldown 30 s, kostnad 100, fem gåvor gav
// 1 körning och 500 spenderade poäng.
//
// Fixen är Check-Then-Act: `kanKora()` svarar på samma fyra grindar UTAN att röra något, och
// `runAction` anropar den i stället för att upprepa den. Det finns därför bara en implementation
// av grindarna, och de kan inte komma i otakt.
//
// TRE SAKER SOM ÄR LÄTTA ATT TRO FEL OM I DEN HÄR FILEN:
//
//   1. FÖNSTRET HÄR ÄR SKRIVBART MED FLIT. När filen skrevs sparade `runAction` sin `lastRun` via
//      `VyraSessionState.writeActive`, som vägrar utan låshanterare och utan committad projektion
//      — så ett fönster riggat som kedjan-provets (`navigator.locks = undefined`) hade ingen
//      fungerande cooldown alls. Sedan §15b bor stämplarna i `vyra-action-cooldowns` och fungerar
//      i vilken flik som helst, men `studio()` projicerar fortfarande ett riktigt
//      `studio-committed`-läge: proven nedan handlar om poängen, och de ska mätas i den flik där
//      allt annat också fungerar. De tre prov som seedar `lastRun` INNE i actionen (C2b, C3, C4)
//      läses numera via §15b:s reservläsning och vaktar därmed uppgraderingsvägen på köpet.
//   2. KÖN ÄR INTE COOLDOWN. Med `duration: 6` spelar overlayn en action var sjätte sekund;
//      fyra köade actions ser ut som "bara en körde" om man bara räknar widgetträffar. Proven
//      räknar därför `vyra:action`-utskicken — det `runAction` faktiskt beslutade — och
//      widgetträffar bara där hela vägen ska bevisas.
//   3. AVDRAGET SITTER PÅ EVENTET, GRINDARNA PÅ ACTIONEN. Ett event som pekar på tre actions
//      betalar en gång, inte tre. Kostnaden hör till triggern, inte till uppspelningen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const H = require('./helpers/session-harness.js');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const KEY = 'vyra-action-event-v2';
const FILER = ['session-state.js', 'action-runtime.js', 'action-event.js', 'action-event-advanced.js'];

// Fönstren har levande setInterval (scenernas hjärtslag). Utan close() avslutas node --test aldrig.
const living = [];
test.after(() => { while (living.length) living.pop().window.close() });

const vanta = ms => new Promise(r => setTimeout(r, ms));

const action = (over = {}) => ({ id: 'a1', name: 'Fyrverkeri', types: ['overlay'], duration: 6,
  cooldown: 30, config: { widget: 'Gift Fireworks' }, scene: { number: 1 }, ...over });
const handelse = (over = {}) => ({ id: 'e1', name: 'Rose ger fyrverkeri', trigger: 'gift',
  triggerValue: 'Rose', actionId: 'a1', enabled: true, pointsCost: 100, ...over });

const gava = (over = {}) => ({ username: 'lisa', gift: 'Rose', value: 'Rose', coins: 500, ...over });

// En inloggad studioflik: låshanterare INNAN session-state.js laddas, sedan en committad
// projektion — annars sparas aldrig `lastRun` och ingen cooldown i hela filen fungerar.
async function studio({ scen = 1, actions = [action()], events = [handelse()], saldo = 1000 } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="title"></div>' +
    '<div id="view"><div class="ae-steps"></div></div></body></html>',
    { url: 'https://vyralive.app/studio.html', pretendToBeVisual: false, runScripts: 'dangerously' });
  living.push(dom);
  const { window } = dom;
  Object.defineProperty(window.navigator, 'locks', { value: H.createLockManager(), configurable: true });
  if (scen != null) window.VYRA_OVERLAY_SCENE = scen;

  window.__korningar = 0;
  window.document.addEventListener('vyra:action', () => { window.__korningar++ });
  for (const f of FILER) {
    const s = window.document.createElement('script');
    s.textContent = las(f);
    window.document.body.append(s);
  }

  const token = window.VyraSessionState.beginProjection();
  const ok = await window.VyraSessionState.projectActive(token, { mode: 'studio-committed',
    workspaceId: 'ws-prov', overlayId: 'ov-prov', state: { widgets: [], user: 'Streamer' },
    extras: { [KEY]: JSON.stringify({ actions, events }) } });
  assert.equal(ok.ok, true, 'riggen fick aldrig ett skrivbart läge — då mäter inget prov cooldown');

  window.__traffar = [];
  window.triggerGiftFireworks = p => { window.__traffar.push(p || {}); return true };
  window.__toaster = [];
  window.toast = m => { window.__toaster.push(String(m)) };
  if (saldo) window.VyraPoints.add('lisa', saldo);
  return window;
}

const saldo = (w, namn = 'lisa') => w.VyraPoints.get(namn);

// ---- A. kanKora är ren ------------------------------------------------------------------------

test('A1: kanKora kan anropas om och om igen utan att röra sparat tillstånd', async () => {
  const w = await studio();
  const a = w.VyraActionEvent.read().actions[0];
  const fore = w.VyraSessionState.readExtra(KEY);

  for (let i = 0; i < 20; i++) {
    const dom = w.VyraActionEvent.kanKora(a, gava());
    assert.equal(dom.ok, true, `svar ${i + 1} sa nej — checken hade skrivit en cooldown åt sig själv`);
  }
  await vanta(30);

  assert.equal(w.VyraSessionState.readExtra(KEY), fore,
    'kanKora ändrade sparat tillstånd — då är den inte en check utan en halv körning');
  assert.equal(w.__korningar, 0, 'kanKora skickade i väg en action');
});

test('A2: kanKora toastar inte och scrollar inte — UI-återkopplingen hör till runAction', async () => {
  const w = await studio({ scen: null });                    // scenen är offline i studioläge
  const a = w.VyraActionEvent.read().actions[0];

  const dom = w.VyraActionEvent.kanKora(a, gava());
  assert.equal(dom.ok, false);
  assert.equal(dom.skal, 'scen-offline');
  assert.equal(w.__toaster.length, 0, 'checken toastade — då kan den inte anropas före ett avdrag');

  w.VyraActionEvent.runAction(a, gava());                    // samma nej, men nu SKA det synas
  assert.equal(w.__toaster.length, 1, 'runAction slutade berätta varför den sa nej');
});

// ---- B. §13: poängen ska följa uppspelningen ---------------------------------------------------

test('B1: fem gåvor under cooldown kostar 100, inte 500', async () => {
  const w = await studio();
  for (let i = 0; i < 5; i++) { w.VyraActionEvent.handleEvent('gift', gava()); await vanta(30) }

  assert.equal(w.__korningar, 1, 'cooldownen släppte igenom mer än en körning');
  assert.equal(w.__traffar.length, 1, 'widgeten spelade inte den enda körning som betalades');
  assert.equal(saldo(w), 900, 'tittaren betalade för uppspelningar som aldrig skedde');
});

test('B2: ett event som pekar på en raderad action kostar ingenting', async () => {
  const w = await studio({ events: [handelse({ actionId: 'borttagen' })] });
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(30);

  assert.equal(w.__korningar, 0);
  assert.equal(saldo(w), 1000, 'poäng drogs för en action som inte finns');
});

test('B3: en offline scen kostar ingenting', async () => {
  const w = await studio({ scen: null });                    // studioläge, inget hjärtslag
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(30);

  assert.equal(w.__korningar, 0);
  assert.equal(saldo(w), 1000, 'poäng drogs medan scenen var offline');
});

test('B4: cooldown per användare stoppar spammaren, inte alla andra', async () => {
  const w = await studio({ actions: [action({ cooldown: 0, userCooldown: 60 })] });
  w.VyraPoints.add('anna', 1000);                            // båda måste ha råd INNAN de triggar
  for (let i = 0; i < 3; i++) { w.VyraActionEvent.handleEvent('gift', gava()); await vanta(30) }
  w.VyraActionEvent.handleEvent('gift', gava({ username: 'anna' }));
  await vanta(30);

  assert.equal(w.__korningar, 2, 'lisa och anna skulle ha en körning var');
  assert.equal(saldo(w), 900, 'lisa betalade för sina spärrade försök');
  assert.equal(saldo(w, 'anna'), 900, 'anna betalade inte för sin egen körning');
});

// ---- C. det som ska fortsätta fungera ----------------------------------------------------------

test('C1: för litet saldo kör ingenting och drar ingenting', async () => {
  const w = await studio({ saldo: 0 });
  w.VyraPoints.add('lisa', 50);
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(30);

  assert.equal(w.__korningar, 0);
  assert.equal(saldo(w), 50, 'ett underkänt köp drog ändå poäng');
});

test('C2: utan cooldown betalar och spelar varje gåva', async () => {
  const w = await studio({ actions: [action({ cooldown: 0 })] });
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(30);
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(30);

  assert.equal(w.__korningar, 2);
  assert.equal(saldo(w), 800, 'fixen slutade ta betalt för riktiga uppspelningar');
});

test('C2b: en utgången cooldown släpper igenom och tar betalt', async () => {
  const w = await studio({ actions: [action({ lastRun: Date.now() - 31000 })] });
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(30);

  assert.equal(w.__korningar, 1, 'en cooldown som gått ut blockerade ändå');
  assert.equal(saldo(w), 900);
});

test('C3: gift-combo kringgår cooldown — och betalar för varje uppspelning', async () => {
  // Den mest sannolika regressionen: missar kanKora bypassCooldown slutar snabba kombon spela helt.
  const w = await studio({ actions: [action({ repeatCombo: true, lastRun: Date.now() })] });
  for (let i = 0; i < 3; i++) {
    w.VyraActionEvent.handleEvent('gift', gava({ combo: 5, repeatcount: 5 }));
    await vanta(30);
  }

  assert.equal(w.__korningar, 3, 'kombon slutade spela — bypassCooldown saknas i checken');
  assert.equal(saldo(w), 700, 'kombon spelade utan att betala');
});

test('C4: ett event med tre actions betalar en gång, inte en per action', async () => {
  const w = await studio({
    actions: [action(), action({ id: 'a2', lastRun: Date.now() }), action({ id: 'a3' })],
    events: [handelse({ allActionIds: ['a1', 'a2', 'a3'] })],
  });
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(30);

  assert.equal(w.__korningar, 2, 'a2 låg i cooldown — a1 och a3 skulle köra');
  assert.equal(saldo(w), 900, 'kostnaden hör till eventet, inte till varje action');
});

test('C5: ett event utan kostnad rör inte saldot', async () => {
  const w = await studio({ events: [handelse({ pointsCost: 0 })] });
  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(30);

  assert.equal(w.__korningar, 1);
  assert.equal(saldo(w), 1000);
});
