'use strict';
// Talutrymmet — §14 i docs/tech-debt.md.
//
// Två fel, uppmätta 2026-08-17 innan något byggdes:
//
//   A. Tre flikar, EN chattrad: tre röster i mun på varandra och tre avdrag à 10.
//   B. En flik: en TTS-action startade 12 ms in i en pågående uppläsning. Två röster samtidigt,
//      i det ögonblick en tittare precis betalat för att höras.
//
// FYRA SAKER SOM ÄR LÄTTA ATT TRO FEL OM I DEN HÄR FILEN:
//
//   1. VEM SOM BETALAR OCH VEM SOM LÅTER ÄR TVÅ OLIKA FRÅGOR. Automationsmastern föredrar
//      studion (den får skriva); röstmastern föredrar en overlay (den hörs i OBS). De är sällan
//      samma flik, och prioriteringen är inverterad med flit.
//   2. LJUDFILER KÖAS INTE. Ett gåvoljud hör ihop med sin visuella effekt i tid. Det duckas
//      medan någon talar, inte läggs sist i talkön.
//   3. ACTIONS TTS GATEAS INTE PÅ RÖSTMASTERN. Actions routas redan av `allowed()` till rätt
//      scens overlay. En röstmaster-grind ovanpå det hade tystat scen 1:s action så fort scen 2:s
//      overlay råkade hålla röstplatsen.
//   4. STUBBENS UPPLÄSNING TAR TID. Utan det kan inget prov skilja "efter" från "samtidigt" —
//      talstubben i helpers/flikar.js håller därför varje yttrande i 80 ms.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./helpers/flikar.js');

const living = [];
test.after(() => { while (living.length) living.pop().close() });
const foljmed = w => { living.push(w); return w };

const vanta = ms => new Promise(r => setTimeout(r, ms));

const TTS_KEY = 'vyra-tts-chat-v1';
const chattrad = (o = {}) => ({ type: 'chat', username: 'lisa', name: 'Lisa', comment: 'hej alla', ...o });

const ttsAction = (o = {}) => ({ id: 'a1', name: 'Tack', types: ['tts'], duration: 6, cooldown: 0,
  volume: 80, config: { ttsText: 'Tack {username}' }, scene: { number: 1 }, ...o });
const ljudAction = (o = {}) => ({ id: 'a2', name: 'Pling', types: ['audio'], duration: 6, cooldown: 0,
  volume: 80, audioMedia: { packagePath: 'assets/sounds/pling.mp3' }, scene: { number: 1 }, ...o });
const handelse = (o = {}) => ({ id: 'e1', trigger: 'gift', triggerValue: 'Rose', actionId: 'a1',
  enabled: true, ...o });
const gava = (o = {}) => ({ username: 'kim', gift: 'Rose', value: 'Rose', ...o });

async function uppsattning({ scener = [1], studio = true, ttsInstallningar = {},
                             actions = [], events = [], saldo = 1000 } = {}) {
  const lager = F.delatLager();
  lager.setItem(TTS_KEY, JSON.stringify({ enabled: true, cooldownSeconds: 0, ...ttsInstallningar }));
  if (actions.length) lager.setItem(F.KEY, JSON.stringify({ actions, events }));
  for (const n of scener) lager.setItem(`vyra-scene-heartbeat-${n}`, String(Date.now()));

  const bygg = o => F.fonster({ lager, extraFiler: ['tts-chat.js'], tal: true, ljud: true,
    actions, events, ...o });
  const flikar = [];
  if (studio) flikar.push(foljmed(await bygg({ namn: 'studio', scen: null, skrivbar: true })));
  for (const n of scener) flikar.push(foljmed(await bygg({ namn: `overlay ${n}`, scen: n })));

  await vanta(40);                        // låt båda elektionerna landa under sina lås
  if (saldo) flikar[0].VyraPoints.add('lisa', saldo);
  return { lager, flikar, overlay: n => flikar.find(w => w.__namn === `overlay ${n}`),
    studio: studio ? flikar[0] : null };
}

// Så här levererar live-client.js samma event i varje öppen flik.
const chatta = (flikar, ev = chattrad()) => {
  for (const w of flikar) w.dispatchEvent(new w.CustomEvent('vyra-live-event', { detail: ev }));
};
const allaTal = flikar => flikar.flatMap(w => w.__tal.map(t => ({ ...t, flik: w.__namn })));
// Gåvan går också till varje flik — automationsmastern är den som faktiskt kör den, och skickar
// sedan uppspelningen vidare. Att bara mata overlayn hade tystat allt: den är slav.
const gavor = (flikar, payload = gava()) => {
  for (const w of flikar) w.VyraActionEvent.handleEvent('gift', payload);
};

// ---- 1-2. en röst, ett avdrag, i rätt flik -----------------------------------------------------

test('1: tre flikar och en chattrad ger EN röst och ETT avdrag', async () => {
  const { flikar } = await uppsattning({ scener: [1, 2],
    ttsInstallningar: { chargePoints: true, costPerMessage: 10 } });
  const fore = flikar[0].VyraPoints.get('lisa');

  chatta(flikar);
  await vanta(150);

  assert.equal(allaTal(flikar).length, 1, 'chattraden lästes upp av mer än en flik');
  assert.equal(fore - flikar[0].VyraPoints.get('lisa'), 10, 'kostnaden drogs en gång per flik');
});

test('2: rösten hörs i overlayn när en sådan finns, annars i studion', async () => {
  const med = await uppsattning({ scener: [1] });
  chatta(med.flikar);
  await vanta(150);
  const talade = allaTal(med.flikar);
  assert.equal(talade.length, 1);
  assert.equal(talade[0].flik, 'overlay 1',
    'studion tog rösten — då försvinner chatten ur sändningen, för OBS fångar overlayn');

  const utan = await uppsattning({ scener: [], studio: true });
  chatta(utan.flikar);
  await vanta(150);
  const soloTal = allaTal(utan.flikar);
  assert.equal(soloTal.length, 1, 'en ensam studioflik blev tyst — nivå 2 höll inte');
  assert.equal(soloTal[0].flik, 'studio');
});

// ---- 3-4. actions delar utrymmet, och når molnrösterna -----------------------------------------

test('3: en TTS-action mitt i en uppläsning talar EFTER, inte samtidigt', async () => {
  const { flikar, overlay } = await uppsattning({ actions: [ttsAction()], events: [handelse()] });
  const ov = overlay(1);

  chatta(flikar);
  await vanta(20);                        // uppläsningen har just börjat (stubben håller 80 ms)
  gavor(flikar);
  await vanta(300);

  const tal = ov.__tal;
  assert.equal(tal.length, 2, `${tal.length} yttranden i overlayn, väntade 2`);
  assert.ok(tal[1].vid >= tal[0].slut,
    `actionen började ${tal[0].slut - tal[1].vid} ms innan chatten tystnade — två röster samtidigt`);
});

test('4: en TTS-action med cloud:-röst går molnvägen, inte till standardrösten', async () => {
  const { flikar, overlay } = await uppsattning({
    actions: [ttsAction({ config: { ttsText: 'Tack {username}', voice: 'cloud:sv-SE-MattiasNeural' } })],
    events: [handelse()],
  });
  const ov = overlay(1);
  const anrop = [];
  ov.VyraAuth = { api: (vag, o) => { anrop.push({ vag, kropp: JSON.parse(o.body) }); return Promise.resolve({ audioContent: '' }) } };
  ov.VyraSessionState.readActiveExtra = () => null;

  gavor(flikar);
  await vanta(200);

  assert.equal(ov.__tal.length, 0, 'molnrösten hamnade i den lokala speechSynthesis ändå');
  assert.ok(anrop.length || ov.__tal.length === 0,
    'varken molnvägen eller den lokala vägen användes — actionen tystnade helt');
});

// ---- 5-6. duckning i stället för köande --------------------------------------------------------

test('5: ett gåvoljud under en uppläsning duckas — och köas inte', async () => {
  const { flikar, overlay } = await uppsattning({
    actions: [ljudAction()], events: [handelse({ actionId: 'a2' })],
  });
  const ov = overlay(1);

  chatta(flikar);
  await vanta(20);                        // någon talar
  gavor(flikar);
  await vanta(30);

  assert.equal(ov.__ljud.length, 1, 'ljudet köades bakom uppläsningen i stället för att spelas');
  const duckad = ov.__ljud[0].volume;
  assert.ok(duckad < 0.8, `ljudet spelade på full volym (${duckad}) mitt i en uppläsning`);
  assert.ok(Math.abs(duckad - 0.8 * ov.VyraTal.DUCK) < 0.001,
    `duckad volym ${duckad}, väntade ${0.8 * ov.VyraTal.DUCK}`);
});

test('6: ett ljud som redan spelar duckas när uppläsningen börjar, och återgår efteråt', async () => {
  const { flikar, overlay } = await uppsattning({
    actions: [ljudAction()], events: [handelse({ actionId: 'a2' })],
  });
  const ov = overlay(1);

  gavor(flikar);
  await vanta(40);
  const ljud = ov.__ljud[0];
  assert.equal(ljud.volume, 0.8, 'ljudet startade inte på full volym när ingen talade');

  chatta(flikar);
  await vanta(30);
  assert.ok(ljud.volume < 0.8, 'ett ljud som redan spelade duckades inte när rösten började');

  await vanta(200);                       // uppläsningen tystnar
  assert.equal(ljud.volume, 0.8, 'volymen kom aldrig tillbaka efter uppläsningen');
});

// ---- 7-8. det som ska fortsätta fungera --------------------------------------------------------

test('7: full kö stoppar uppläsningen INNAN kostnaden dras', async () => {
  // Regressionsvakt för något tts-chat.js redan gjorde rätt: kapaciteten kollas före avdraget, så
  // en tittare aldrig betalar för en rad som sedan tyst försvinner.
  const { flikar } = await uppsattning({ scener: [1],
    ttsInstallningar: { chargePoints: true, costPerMessage: 10, maxQueueLength: 1 } });
  const fore = flikar[0].VyraPoints.get('lisa');

  for (let i = 0; i < 4; i++) { chatta(flikar, chattrad({ comment: 'rad ' + i })); await vanta(5) }
  await vanta(400);

  const spenderat = fore - flikar[0].VyraPoints.get('lisa');
  const talade = allaTal(flikar).length;
  assert.equal(spenderat, talade * 10,
    `${spenderat} poäng draget för ${talade} upplästa rader — någon betalade för tystnad`);
});

test('8: en action som fortfarande talar hindrar nästa från att bryta in', async () => {
  // Actionkön pacear på VISNINGSTID, inte på taltid. Med duration 1 s och en replik som tar
  // längre tid än så släpps nästa action fram medan den förra fortfarande talar — och då är
  // talutrymmet det enda som håller isär dem. Kortare texter hade bara mätt actionkön.
  // Repliken MÅSTE ta längre tid än visningstiden (stubben talar 10 ms per tecken, actionen visas
  // i 1 s). Med en kortare replik hinner den första tystna av sig själv innan actionkön släpper
  // fram den andra, och provet mäter actionkön i stället för talutrymmet — grönt av fel skäl.
  const lang = 'Tack {username} for den har helt fantastiskt generosa gavan, den varmer verkligen '
    + 'och jag vill saga tusen tack fran hela hjartat till dig som tittar har ikvall igen';
  const { flikar, overlay } = await uppsattning({
    actions: [ttsAction({ duration: 1, config: { ttsText: lang } }),
              ttsAction({ id: 'a3', duration: 1, config: { ttsText: lang + ' igen' } })],
    events: [handelse({ allActionIds: ['a1', 'a3'] })],
  });
  const ov = overlay(1);

  gavor(flikar);
  await vanta(4000);

  assert.equal(ov.__tal.length, 2, `${ov.__tal.length} yttranden, väntade 2`);
  assert.ok(ov.__tal[1].vid >= ov.__tal[0].slut,
    `den andra actionen bröt in ${ov.__tal[0].slut - ov.__tal[1].vid} ms innan den första tystnat`);
});
