'use strict';
// Pengarna tillbaka när kön stryper en betald uppspelning — §15c i docs/tech-debt.md.
//
// Uppmätt före fixen: fyra gåvor à 100 mot en scen med `maxQueue: 1` gav 400 dragna poäng, en
// spelning och två strypta. 200 poäng för ingenting. Det var den enda av §13:s fyra grindar som
// inte gick att flytta före avdraget, eftersom den lever i overlayflikens kö.
//
// FYRA SAKER SOM ÄR LÄTTA ATT TRO FEL OM I DEN HÄR FILEN:
//
//   1. DEN VANLIGASTE UPPSÄTTNINGEN ÄR EN ENDA FLIK. Samma flik drar poängen OCH droppar
//      uppspelningen. Ett `storage`-event når aldrig sin egen skribent, så en ren storage-brygga
//      hade inte lagat någonting — därför finns `vyra:action-dropped` på `document` också.
//      Prov 1 är den vägen, prov 2 är korsflik-vägen.
//   2. ÅTERBETALNING SKER PER KÖP, INTE PER KÖRNING. Ett event betalar en gång men kan skicka ut
//      flera actions. Spelade en av tre fick tittaren det hen betalade för (prov 5).
//   3. FEL SCEN ÄR INTE EN STRYPNING. `allowed()` säger nej i varje overlay som visar en annan
//      scen — det är routing. Skulle det räknas som drop vore varje flerscensuppsättning en
//      gratis återbetalningsautomat (prov 3).
//   4. EN ÅTERBETALNING ÄR INTE EN INTJÄNING. `add()` räknar upp `earned`, livstidssumman bakom
//      `getLevel()`. Med `add()` hade en tittare kunnat nivå upp genom att med flit svämma över
//      kön (prov 7). Provet mäter `earned` mot ett EXAKT tal, inte mot ett värde läst efter
//      gåvorna — återbetalningen landar inom millisekunder, så ett "före" som tas för sent
//      innehåller redan felet och kan aldrig falla.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./helpers/flikar.js');

const living = [];
test.after(() => { while (living.length) living.pop().close() });
const foljmed = w => { living.push(w); return w };

const vanta = ms => new Promise(r => setTimeout(r, ms));

// duration 6 s: uppspelningen blir kvar i kön hela provet, vilket är precis vad som ska till för
// att nästa gåva ska mötas av en full kö.
const action = (o = {}) => ({ id: 'a1', name: 'Fyrverkeri', types: ['overlay'], duration: 6,
  cooldown: 0, config: { widget: 'Gift Fireworks' }, scene: { number: 1 }, ...o });
const handelse = (o = {}) => ({ id: 'e1', trigger: 'gift', triggerValue: 'Rose', actionId: 'a1',
  enabled: true, pointsCost: 100, ...o });
const gava = (o = {}) => ({ username: 'lisa', gift: 'Rose', value: 'Rose', coins: 500, ...o });

async function uppsattning({ scener = [1], studio = false, actions = [action()],
                             events = [handelse()], maxQueue = 1, saldo = 1000 } = {}) {
  const lager = F.delatLager();
  lager.setItem(F.KEY, JSON.stringify({ actions, events }));
  for (const n of scener) lager.setItem(`vyra-scene-heartbeat-${n}`, String(Date.now()));
  if (maxQueue) {
    const settings = {};
    for (const n of scener) settings[n] = { maxQueue };
    lager.setItem('vyra-scene-settings-v1', JSON.stringify(settings));
  }

  const flikar = [];
  if (studio) flikar.push(foljmed(await F.fonster({ namn: 'studio', scen: null, lager,
    skrivbar: true, actions, events })));
  for (const n of scener) flikar.push(foljmed(await F.fonster({ namn: `overlay ${n}`, scen: n,
    lager, skrivbar: false, actions, events })));

  await vanta(30);
  if (saldo) flikar[0].VyraPoints.add('lisa', saldo);
  return { lager, flikar, overlay: n => flikar.find(w => w.__namn === `overlay ${n}`) };
}

const skicka = (flikar, n, payload = gava()) => {
  for (let i = 0; i < n; i++) for (const w of flikar) w.VyraActionEvent.handleEvent('gift', payload);
};
const netto = (w, fore) => fore - w.VyraPoints.get('lisa');

// ---- 1-2. de två vägarna -----------------------------------------------------------------------

test('1: en ensam overlay betalar tillbaka det kön strypte — samma flik', async () => {
  const { flikar } = await uppsattning();
  const w = flikar[0];
  const fore = w.VyraPoints.get('lisa');

  for (let i = 0; i < 4; i++) { w.VyraActionEvent.handleEvent('gift', gava()); await vanta(30) }
  await vanta(100);

  // Fyra gåvor à 100: en spelar, en köas, två stryps. 400 draget, 200 tillbaka.
  assert.equal(netto(w, fore), 200,
    'de strypta uppspelningarna betalades aldrig tillbaka i den flik som drog poängen');
});

test('2: en studio som master och en overlay som stryper — korsflik', async () => {
  const { flikar, overlay } = await uppsattning({ studio: true });
  const master = flikar[0];
  const fore = master.VyraPoints.get('lisa');

  for (let i = 0; i < 4; i++) { skicka(flikar, 1); await vanta(30) }
  await vanta(150);

  assert.equal(netto(master, fore), 200, 'rapporten nådde aldrig mastern över fliksgränsen');
  assert.ok(overlay(1).__spelningar >= 1, 'ingenting spelade — provet mäter fel sak');
});

// ---- 3. fel scen är inte en strypning ----------------------------------------------------------

test('3: en overlay som visar en annan scen utlöser ingen återbetalning', async () => {
  // Scen 2:s overlay säger nej via allowed(). Räknades det som drop vore varje
  // flerscensuppsättning en gratis återbetalningsautomat.
  const { flikar } = await uppsattning({ scener: [1, 2], maxQueue: 0 });
  const fore = flikar[0].VyraPoints.get('lisa');

  skicka(flikar, 1);
  await vanta(150);

  assert.equal(netto(flikar[0], fore), 100, 'fel scen behandlades som en strypt uppspelning');
});

// ---- 4. dubbla rapporter för samma runId -------------------------------------------------------

test('4: två browser sources för samma scen betalar tillbaka en gång', async () => {
  // Två OBS-källor mot samma scenlänk är en fullt normal uppsättning. Båda tar emot samma runId
  // och båda stryper den — men pengarna finns bara en gång.
  const lager = F.delatLager();
  const actions = [action()], events = [handelse()];
  lager.setItem(F.KEY, JSON.stringify({ actions, events }));
  lager.setItem('vyra-scene-heartbeat-1', String(Date.now()));
  lager.setItem('vyra-scene-settings-v1', JSON.stringify({ 1: { maxQueue: 1 } }));
  const a = foljmed(await F.fonster({ namn: 'overlay 1', scen: 1, lager, skrivbar: false, actions, events }));
  const b = foljmed(await F.fonster({ namn: 'overlay 1b', scen: 1, lager, skrivbar: false, actions, events }));
  await vanta(30);
  a.VyraPoints.add('lisa', 1000);
  const fore = a.VyraPoints.get('lisa');

  for (let i = 0; i < 4; i++) { a.VyraActionEvent.handleEvent('gift', gava()); await vanta(30) }
  await vanta(150);

  assert.equal(netto(a, fore), 200, 'samma runId betalades tillbaka två gånger');
});

test('4b: samma runId rapporterat två gånger räknar bara ned köpet en gång', async () => {
  // Skärpningen av prov 4. Med ETT runId per köp döljer `klar`-flaggan en saknad dedupe: den
  // andra rapporten avvisas ändå. Felet syns först när ett köp har FLERA körningar och en av dem
  // dubbelrapporteras — då räknas köpet ned två steg för en enda strypning, och pengarna kommer
  // tillbaka trots att den andra actionen spelade.
  const lager = F.delatLager();
  const actions = [action(), action({ id: 'a2' })];
  const events = [
    handelse({ allActionIds: ['a1', 'a2'] }),
    { id: 'e2', trigger: 'gift', triggerValue: 'Galaxy', actionId: 'a1', enabled: true, pointsCost: 0 },
  ];
  lager.setItem(F.KEY, JSON.stringify({ actions, events }));
  lager.setItem('vyra-scene-heartbeat-1', String(Date.now()));
  lager.setItem('vyra-scene-settings-v1', JSON.stringify({ 1: { maxQueue: 1 } }));
  const a = foljmed(await F.fonster({ namn: 'overlay 1', scen: 1, lager, skrivbar: false, actions, events }));
  const b = foljmed(await F.fonster({ namn: 'overlay 1b', scen: 1, lager, skrivbar: false, actions, events }));
  await vanta(30);
  a.VyraPoints.add('lisa', 1000);

  // En gratis gåva gör kön upptagen men tom: nästa action får plats, den därpå stryps.
  a.VyraActionEvent.handleEvent('gift', gava({ gift: 'Galaxy', value: 'Galaxy' }));
  await vanta(30);
  const fore = a.VyraPoints.get('lisa');

  // De två samtidiga rapporterna kollapsar redan i `tidigaStrypta` (en Set), så de ensamma kan
  // inte falsifiera dedupen. Den riktiga risken är en SEN dubblett: en rapport som kommer efter
  // att köpet registrerats, från en flik vars skrivning dröjde. Den fångas här.
  const rapporterade = [];
  a.document.addEventListener('vyra:action-dropped', e => rapporterade.push(e.detail?.runId));

  a.VyraActionEvent.handleEvent('gift', gava());     // a1 köas, a2 stryps — av BÅDA overlayerna
  await vanta(150);
  assert.equal(netto(a, fore), 100, 'köpet betalades tillbaka trots att a1 spelade');

  assert.ok(rapporterade.length, 'ingenting ströps — provet mäter fel sak');
  a.document.dispatchEvent(new a.CustomEvent('vyra:action-dropped',
    { detail: { runId: rapporterade[0], skal: 'ko-full' } }));
  await vanta(100);

  assert.equal(netto(a, fore), 100,
    'en sen dubblett av samma runId räknade ned köpet en andra gång');
});

// ---- 5-6. per köp, inte per körning ------------------------------------------------------------

test('5: spelade en av tre actions får tittaren ingenting tillbaka', async () => {
  const { flikar } = await uppsattning({
    actions: [action(), action({ id: 'a2' }), action({ id: 'a3' })],
    events: [handelse({ allActionIds: ['a1', 'a2', 'a3'] })],
  });
  const w = flikar[0];
  const fore = w.VyraPoints.get('lisa');

  w.VyraActionEvent.handleEvent('gift', gava());     // a1 spelar, a2 köas, a3 stryps
  await vanta(150);

  assert.equal(w.__spelningar, 1, 'ingen av de tre spelade — provet mäter fel sak');
  assert.equal(netto(w, fore), 100,
    'tittaren fick pengarna tillbaka trots att en action faktiskt spelade');
});

test('6: stryps alla tre kommer eventets kostnad tillbaka en gång', async () => {
  // Kön fylls först med ett GRATIS event. En betald fyllare hade inte fungerat: kostnaden dras av
  // avsändaren, och en avsändare utan saldo får sitt köp nekat — då fylls kön aldrig och provet
  // mäter något helt annat än det påstår.
  const { flikar } = await uppsattning({
    actions: [action(), action({ id: 'a2' }), action({ id: 'a3' })],
    events: [
      handelse({ allActionIds: ['a1', 'a2', 'a3'] }),
      { id: 'e2', trigger: 'gift', triggerValue: 'Galaxy', actionId: 'a1', enabled: true, pointsCost: 0 },
    ],
  });
  const w = flikar[0];
  // Två gratis gåvor: en spelar (busy) och en lägger sig i kön, som rymmer 1. Nu är den full.
  for (let i = 0; i < 2; i++) {
    w.VyraActionEvent.handleEvent('gift', gava({ gift: 'Galaxy', value: 'Galaxy' }));
    await vanta(30);
  }
  const fore = w.VyraPoints.get('lisa');
  const spelFore = w.__spelningar;

  w.VyraActionEvent.handleEvent('gift', gava());
  await vanta(150);

  assert.equal(w.__spelningar, spelFore, 'någon av de tre slank igenom kön');
  assert.equal(netto(w, fore), 0, 'alla tre ströps — hela kostnaden skulle tillbaka, en gång');
});

// ---- 7. en återbetalning är inte en intjäning --------------------------------------------------

test('7: återbetalningen rör inte earned — nivån får inte stiga på strypta uppspelningar', async () => {
  const { flikar } = await uppsattning({ saldo: 0 });
  const w = flikar[0];
  w.VyraPoints.add('lisa', 1000);                     // den ENDA intjäningen i hela provet
  const nivaFore = w.VyraPoints.getLevel('lisa').level;

  for (let i = 0; i < 4; i++) { w.VyraActionEvent.handleEvent('gift', gava()); await vanta(30) }
  await vanta(150);

  assert.equal(netto(w, 1000), 200, 'provet strypte inget — då säger earned ingenting');
  const earned = JSON.parse(w.localStorage.getItem('vyra-points-v1')).lisa.earned;
  assert.equal(earned, 1000,
    'earned växte av en återbetalning — spend sänker den inte, så refund får inte höja den');
  assert.equal(w.VyraPoints.getLevel('lisa').level, nivaFore, 'tittaren nivåade upp på en återbetalning');
});

// ---- 8-9. vakterna -----------------------------------------------------------------------------

test('8: huvudboken är vakten — ett okänt runId betalar ingenting, i någon flik', async () => {
  // Det finns INGEN master-vakt i strypt(), med flit: den som tog betalt är den som betalar
  // tillbaka. Vakten är i stället att bara den fliken känner igen sitt eget runId. Provet visar
  // båda hållen: en slav som aldrig drog något, och mastern med ett påhittat runId medan ett
  // riktigt köp är i luften.
  const { flikar, overlay } = await uppsattning({ studio: true });
  const master = flikar[0], slav = overlay(1);
  const fore = master.VyraPoints.get('lisa');

  master.VyraActionEvent.handleEvent('gift', gava());        // ett riktigt köp, spelar upp
  await vanta(50);
  const efterKop = master.VyraPoints.get('lisa');
  assert.equal(fore - efterKop, 100, 'köpet gick inte igenom — provet mäter fel sak');

  slav.document.dispatchEvent(new slav.CustomEvent('vyra:action-dropped',
    { detail: { runId: 'run-pahittad', skal: 'ko-full' } }));
  master.document.dispatchEvent(new master.CustomEvent('vyra:action-dropped',
    { detail: { runId: 'run-pahittad', skal: 'ko-full' } }));
  await vanta(100);

  assert.equal(master.VyraPoints.get('lisa'), efterKop,
    'ett påhittat runId betalade tillbaka ett köp det inte hörde till');
});

test('9: ett event utan kostnad ger ingen återbetalning', async () => {
  const { flikar } = await uppsattning({ events: [handelse({ pointsCost: 0 })] });
  const w = flikar[0];
  const fore = w.VyraPoints.get('lisa');

  for (let i = 0; i < 4; i++) { w.VyraActionEvent.handleEvent('gift', gava()); await vanta(30) }
  await vanta(150);

  assert.equal(w.VyraPoints.get('lisa'), fore, 'saldot rördes trots att inget kostade något');
});
