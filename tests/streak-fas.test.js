'use strict';
// TOP STREAKS KOREOGRAFI — S1-S6, skrivna RODA FORST (streak-fas.js finns inte an).
//
// Gavororelsens forsta art. Motorformen kommer fran fabriken (widget-fas.js); det har ar artens
// sida: registret, tiderna och vakterna som haller familjen sluten. Specen ar
// docs/gavororelsen.md — den ar last, och de tre fynd som formade arten star dar:
//
//   §1  Top Streak ar ingen alert. Det finns varken trigger eller timerfalt, sa fabriken kopplar
//       sig INTE — arten anropas explicit fran gift-event-images.js:arma().
//   §3  Noderna VyraFlip skriver animation-delay pa ar SJU, inte sex: de sex selektorerna PLUS
//       widgetladan sjalv. En fas pa nagon av dem hade fatt hela sandningens gangtid som negativ
//       fordrojning och aldrig synts.
//   §7  En pagaende koreografi spelar klart. Fabriken sager OM den spelar; beslutet att lata den
//       gora det bor hos anroparen.
//
//   S1  varje koreografi hor till ett tema renderaren faktiskt skriver
//   S2  ett tema utan koreografi far ingen fasklass alls
//   S3  varje koreografi ryms i taket
//   S4  fasprefixet krockar inte med modellprefixet
//   S5  ingen fas-regel ror nagon av de sju noderna
//   S6  arten kopplar sig inte — den har ingen trigger att linda
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { PREFIX, FASER, KORTASTE_VISNING, LAYOUTPREFIX } = require('./helpers/streak-fas-register.js');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

const las = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('S1: varje koreografi hor till ett tema renderaren faktiskt skriver', () => {
  // TEMALISTAN AR INGEN LITERAL SELECT. Panelens streakTheme-valjare byggs vid korning ur
  // `themes`-arrayen i media.js (plus premiumdesignerna ur VyraStreakPremium), sa ett prov som
  // letade efter `value="inferno"` i kallan hade matt ingenting. Det ar arrayen som ar sanningen:
  // renderaren skriver `streak-${w.streakTheme||'inferno'}` ur samma falt som valjaren satter.
  const media = las('media.js');
  const rad = media.match(/let themes=\[\['inferno'[\s\S]*?\]\]/)?.[0] || '';
  assert.ok(rad.length > 0, 'hittar inte themes-listan i media.js — provet mater ingenting');
  const kanda = [...rad.matchAll(/\['([a-z-]+)'/g)].map(m => m[1]);
  assert.ok(kanda.includes('inferno'), 'themes-listan lastes fel — inferno saknas');
  for (const tema of Object.keys(FASER)) {
    assert.ok(kanda.includes(tema),
      `koreografin '${tema}' pekar pa ett tema som temalistan inte kanner: ${kanda.join(', ')}`);
  }
});

test('S2: ett tema utan koreografi far ingen fasklass alls', () => {
  const h = createDom({ state: { widgets: [] } });
  h.paint([]);
  h.load('widget-fas.js');
  h.load('streak-fas.js');
  const box = h.document.createElement('div');
  box.className = 'widget vyra-streak streak-pahittad';
  assert.equal(h.window.VyraStreakFas.spela(box), false,
    'spela() accepterade ett tema utan koreografi');
  assert.equal([...box.classList].filter(k => k.startsWith(PREFIX)).length, 0,
    'ett okant tema fick fasklasser — halvfardig fas ar samre an ingen');
});

test('S2b: en godkand ranking utan temaklass ror sig inte', () => {
  // approved-rankings.js renderar `.vyra-streak approved-streak` HELT UTAN temaklass. Den ska
  // falla ut av sig sjalv — layoutAv() hittar ingen modell och spela() svarar nej. Star det inte
  // i ett prov ar det en forhoppning, inte en regel.
  const h = createDom({ state: { widgets: [] } });
  h.paint([]);
  h.load('widget-fas.js');
  h.load('streak-fas.js');
  const box = h.document.createElement('div');
  box.className = 'widget vyra-streak approved-streak';
  assert.equal(h.window.VyraStreakFas.spela(box), false,
    'en godkand ranking fick en koreografi — den ska ritas precis som forut');
});

test('S3: varje koreografi ryms i taket', () => {
  // Top Streak slacks ALDRIG, sa taket ar inte "hinner sekvensen innan widgeten forsvinner" som
  // for Fan och Gifter. Det ar hur lange en streamer star ut med att vanta pa nasta kvittens —
  // specens §6 satter 1300 ms, samma storleksordning som de tva alertfamiljerna.
  assert.equal(KORTASTE_VISNING, 1300, 'taket ska vara specens 1300 ms (§6)');
  for (const [tema, lista] of Object.entries(FASER)) {
    const total = lista.reduce((s, f) => s + f.ms, 0);
    assert.ok(total <= KORTASTE_VISNING,
      `${tema}: koreografin ar ${total} ms — langre an taket ${KORTASTE_VISNING}`);
    assert.ok(total >= 1000, `${tema}: ${total} ms ar kortare an specens golv 1000 ms`);
    assert.ok(lista.length >= 2, `${tema}: farre an tva faser ar ingen koreografi`);
  }
});

test('S4: fasprefixet krockar inte med modellprefixet', () => {
  // DEN HAR FALLAN AR EXAKT UPPMATT. Modellen lases med `layoutAv()`, som returnerar FORSTA
  // klassen pa ladan som borjar med LAYOUTPREFIX. Temaklasserna heter `streak-inferno`, alltsa ar
  // prefixet 'streak-'. Hade fasklasserna hetat `streak-fas-slaget` — formen fan-fas.js och
  // gifter-fas.js anvander — hade `layoutAv()` kunnat svara 'fas-slaget' i stallet for 'inferno'
  // sa fort klassordningen bytte. Darfor bar den har arten ett eget prefix.
  assert.ok(!PREFIX.startsWith(LAYOUTPREFIX),
    `fasprefixet '${PREFIX}' borjar med modellprefixet '${LAYOUTPREFIX}' — layoutAv() kan lasa `
    + 'en fasklass som modell');
  assert.ok(!LAYOUTPREFIX.startsWith(PREFIX), 'och tvartom');
});

test('S5: ingen fas-regel ror nagon av de SJU noderna', () => {
  // Specens §3, och den viktigaste regeln i hela arbetet. `parts()` ar
  // `[el, ...el.querySelectorAll(PARTS)]` — LADAN star forst. offset() skriver animation-delay pa
  // alla sju vid varje gava, sa en fas dar hade fatt hela sandningens gangtid som negativ
  // fordrojning. Uppmatt 2026-09-23: ladan far -38ms efter 38 ms.
  const SJU = ['.vyra-flip', '.streak-flip', '.vyra-gift-face', '.vyra-profile-face',
    '.streak-gift-face', '.streak-profile-face', '.vyra-streak', '.vyra-topgift'];
  const css = las('studio.css');
  const regler = css.match(new RegExp('[^}]*\\.' + PREFIX.replace(/-$/, '') + '[^{]*\\{[^}]*\\}', 'g')) || [];
  assert.ok(regler.length > 0, 'hittade inga fas-regler i studio.css — provet mater ingenting');
  for (const regel of regler) {
    const nyckel = regel.slice(0, regel.indexOf('{'));
    // Det som animeras ar nyckelns SISTA led. `.vyra-streak.sfas-slaget .streak-score` animerar
    // `.streak-score`, inte ladan — ladan ar bara barare av fasklassen.
    const subjekt = nyckel.trim().split(/\s+/).pop();
    for (const nod of SJU) {
      assert.ok(!subjekt.includes(nod),
        `fas-regeln "${nyckel.trim()}" animerar ${nod} — VyraFlip.offset() skriver over den`);
    }
  }
});

test('S6: arten kopplar sig inte — den har ingen trigger att linda', () => {
  // §1. Top Streak ar en PERMANENT widget: uppmatt finns varken triggerTopStreak eller nagot
  // timerfalt pa ladorna. Kopplingen skulle darfor inte ha nagot att lasa, och arten sager det
  // rakt ut i stallet for att rakna med att uppslaget rakar bli undefined.
  const h = createDom({ state: { widgets: [] } });
  h.paint([]);
  h.load('widget-fas.js');
  h.load('streak-fas.js');
  assert.equal(h.window.VyraStreakFas.arKopplad(), false,
    'arten kopplade sig — den har ingen trigger, och fabriken ska saga nej');
  assert.equal(h.window.VyraStreakFas.koppla(), false);
});

test('S7: koreografin spelas i ordning, en exklusiv fasklass i taget', () => {
  const h = createDom({ state: { widgets: [] } });
  h.paint([]);
  h.load('widget-fas.js');
  h.load('streak-fas.js');
  const motor = h.window.VyraStreakFas;
  const jobb = [];
  Object.assign(motor.klocka, {
    satt: (fn, ms) => { jobb.push({ fn, ms }); return jobb.length },
    rensa: id => { if (jobb[id - 1]) jobb[id - 1].fn = null },
  });
  const box = h.document.createElement('div');
  box.className = 'widget vyra-streak streak-inferno';

  assert.equal(motor.spela(box), true);
  const faser = FASER.inferno.map(f => PREFIX + f.namn);
  assert.ok(box.classList.contains(faser[0]), 'forsta fasen tands direkt');
  assert.equal([...box.classList].filter(k => k.startsWith(PREFIX)).length, 1,
    'tva faser far aldrig vara tanda samtidigt');
  assert.equal(motor.spelar(box), true, 'sekvensen ar i luften');

  jobb.splice(0).forEach(x => x.fn && x.fn());
  assert.equal(motor.spelar(box), false, 'efter sista fasen ska widgeten vara ledig igen');
  assert.equal([...box.classList].filter(k => k.startsWith(PREFIX)).length, 0,
    'sista fasen slacker sin egen klass');
});
