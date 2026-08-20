'use strict';
// En förare för automationen — vad som händer när streamern har studion och två scenlänkar uppe.
//
// §15 i docs/tech-debt.md: live-client.js:131 kör handleEvent i VARJE flik som tar emot ett
// live-event, och studio.html?overlay=1 är samma sida. Uppmätt före fixen, EN gåva à 100 poäng med
// tre flikar öppna: tre avdrag, och fyrverkeriet spelade tre gånger i scen 1.
//
// TRE SAKER SOM ÄR LÄTTA ATT TRO FEL OM I DEN HÄR FILEN:
//
//   1. SLAVARNA TIGER OM AVDRAGET, INTE OM UPPSPELNINGEN. En tystad overlay spelar fortfarande —
//      den får actionen via localStorage['vyra-action-run'], som action-runtime.js:74 lyssnar på.
//      Den bryggan bar redan trafiken före fixen; det var just därför spelningarna blev tre.
//   2. KÖN DÖLJER DUBBLETTER. Med duration 6 spelar overlayn en action var sjätte sekund, så tre
//      köade uppspelningar ser ut som en om man mäter direkt. Proven använder duration 1 och
//      mäter kölängden vid sidan av spelningarna.
//   3. FAIL-OPEN ÄR ETT KRAV, INTE EN SLARVIG DEFAULT. Utan levande master kör varje flik. Att
//      tiga hade gjort varje OBS-uppsättning utan öppen studio död.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./helpers/flikar.js');

const living = [];
test.after(() => { while (living.length) living.pop().close() });
const foljmed = w => { living.push(w); return w };

const vanta = ms => new Promise(r => setTimeout(r, ms));

const action = (o = {}) => ({ id: 'a1', name: 'Fyrverkeri', types: ['overlay'], duration: 1,
  cooldown: 0, config: { widget: 'Gift Fireworks' }, scene: { number: 1 }, ...o });
const handelse = (o = {}) => ({ id: 'e1', trigger: 'gift', triggerValue: 'Rose', actionId: 'a1',
  enabled: true, pointsCost: 100, ...o });
const gava = (o = {}) => ({ username: 'lisa', gift: 'Rose', value: 'Rose', coins: 500, ...o });

// Studion plus så många overlays provet ber om, mot ETT delat lager.
async function uppsattning({ scener = [1, 2], studio = true, actions = [action()],
                             events = [handelse()], saldo = 1000 } = {}) {
  const lager = F.delatLager();
  lager.setItem(F.KEY, JSON.stringify({ actions, events }));
  // Scenerna är online: i verkligheten skriver action-scenes.js hjärtslagen från overlayn.
  for (const n of scener) lager.setItem(`vyra-scene-heartbeat-${n}`, String(Date.now()));

  const flikar = [];
  if (studio) flikar.push(foljmed(await F.fonster({ namn: 'studio', scen: null, lager,
    skrivbar: true, actions, events })));
  for (const n of scener) flikar.push(foljmed(await F.fonster({ namn: `overlay ${n}`, scen: n,
    lager, skrivbar: false, actions, events })));

  await vanta(30);                       // låt master-valet landa under sitt lås
  if (saldo) flikar[0].VyraPoints.add('lisa', saldo);
  return { lager, flikar, studio: studio ? flikar[0] : null,
    overlay: n => flikar.find(w => w.__namn === `overlay ${n}`) };
}

// EN gåva, så som live-client.js:131 levererar den: till varje öppen flik.
const skickaGava = (flikar, payload = gava()) => {
  for (const w of flikar) w.VyraActionEvent.handleEvent('gift', payload);
};
const spenderat = (w, fore) => fore - w.VyraPoints.get('lisa');
const spelningar = flikar => flikar.reduce((s, w) => s + w.__spelningar, 0);

// ---- 1-3. tre flikar, en gåva ------------------------------------------------------------------

test('1: tre flikar och en gåva ger ETT avdrag, inte tre', async () => {
  const { flikar } = await uppsattning();
  const fore = flikar[0].VyraPoints.get('lisa');
  skickaGava(flikar);
  await vanta(100);

  assert.equal(spenderat(flikar[0], fore), 100,
    'varje flik drog sin egen kostnad för samma gåva');
});

test('2: samma gåva spelar EN gång i scen 1, och kön är tom efteråt', async () => {
  const { flikar, overlay } = await uppsattning();
  skickaGava(flikar);
  await vanta(100);
  const koDirekt = overlay(1).VyraActionRuntime.queueSize();
  await vanta(2500);                     // duration 1 s — låt allt köat spela ut

  assert.equal(koDirekt, 1, `scen 1 köade ${koDirekt} uppspelningar för en enda gåva`);
  assert.equal(spelningar(flikar), 1, 'fyrverkeriet spelade fler gånger än gåvan gavs');
  assert.equal(overlay(1).VyraActionRuntime.queueSize(), 0);
});

test('3: en action i scen 2 spelar bara i scen 2, en enda gång', async () => {
  const { flikar, overlay } = await uppsattning({ actions: [action({ scene: { number: 2 } })] });
  skickaGava(flikar);
  await vanta(100);
  await vanta(2500);                     // duration 1 s — annars döljer kön dubbletterna (se 2)

  assert.equal(overlay(2).__spelningar, 1, 'scen 2-actionen spelade fel antal gånger i sin overlay');
  assert.equal(overlay(1).__spelningar, 0, 'scen 1 spelade en action som hör till scen 2');
  assert.equal(overlay(2).VyraActionRuntime.queueSize(), 0);
});

// ---- 4-6. utan studio, och när mastern försvinner -----------------------------------------------

test('4: utan öppen studio kör overlayn själv — annars vore OBS dött före inloggning', async () => {
  const { flikar } = await uppsattning({ studio: false, scener: [1] });
  const fore = flikar[0].VyraPoints.get('lisa');
  skickaGava(flikar);
  await vanta(100);

  assert.equal(flikar[0].__spelningar, 1, 'ingen studio, ingen uppspelning — fail-open höll inte');
  assert.equal(spenderat(flikar[0], fore), 100);
});

test('5: två overlays utan studio drar ändå bara en gång', async () => {
  const { flikar } = await uppsattning({ studio: false, scener: [1, 2] });
  const fore = flikar[0].VyraPoints.get('lisa');
  skickaGava(flikar);
  await vanta(100);

  assert.equal(spenderat(flikar[0], fore), 100, 'nivå 2-valet höll inte — båda tog platsen');
  assert.equal(spelningar(flikar), 1);
});

test('6: dör mastern tar en annan flik över', async () => {
  const { lager, flikar, overlay } = await uppsattning({ studio: false, scener: [1, 2] });
  const master = flikar.find(w => w.VyraAutomationMaster.arMaster());
  assert.ok(master, 'ingen flik tog platsen alls');

  // Så här ser en stängd flik ut: hjärtslaget slutar förnyas och blir inaktuellt.
  const stalt = JSON.parse(lager.getItem('vyra-automation-master'));
  stalt.at = Date.now() - 7000;
  lager.setItem('vyra-automation-master', JSON.stringify(stalt));
  const kvar = flikar.find(w => w !== master);
  const fore = flikar[0].VyraPoints.get('lisa');

  kvar.VyraActionEvent.handleEvent('gift', gava());
  await vanta(100);

  assert.equal(spenderat(flikar[0], fore), 100, 'den kvarvarande fliken tog aldrig över');
});

// ---- 7-8. utvägarna ----------------------------------------------------------------------------

test('7: __test går alltid igenom — replay-knappen får inte tystna i en slav', async () => {
  const { flikar, overlay } = await uppsattning();
  const slav = overlay(1);
  assert.equal(slav.VyraAutomationMaster.arMaster(), false, 'riggen gjorde overlayn till master');

  slav.VyraActionEvent.handleEvent('gift', gava({ __test: true }));
  await vanta(100);

  assert.equal(slav.__utskick, 1, 'ett uttryckligt handgrepp i en slav gjorde ingenting');
});

test('8: utan modulen kör fliken som förr (fail-open)', async () => {
  const { flikar, overlay } = await uppsattning();
  const slav = overlay(1);
  delete slav.VyraAutomationMaster;                   // laddningsfel eller cacheskev
  const fore = flikar[0].VyraPoints.get('lisa');

  slav.VyraActionEvent.handleEvent('gift', gava());
  await vanta(100);

  assert.equal(spenderat(flikar[0], fore), 100, 'en flik utan modulen slutade köra helt');
});

// ---- 9. en förare betyder en cooldown -----------------------------------------------------------

test('9: fem gåvor under cooldown ger en spelning och ett avdrag, med tre flikar', async () => {
  const { flikar } = await uppsattning({ actions: [action({ cooldown: 30 })] });
  const fore = flikar[0].VyraPoints.get('lisa');
  for (let i = 0; i < 5; i++) { skickaGava(flikar); await vanta(40) }
  await vanta(200);

  assert.equal(spenderat(flikar[0], fore), 100,
    'cooldownen bet inte — fler än en flik körde, eller stämpeln nådde inte fram');
  assert.equal(spelningar(flikar), 1);
});
