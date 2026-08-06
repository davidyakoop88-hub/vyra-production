'use strict';
// Battle MVP ska tändas av en riktig match, inte av en testknapp.
//
// Före det här: `media.js:566` tände MVP bara på `type.includes('battle_mvp') || type==='mvp'`.
// Bryggan publicerar en enda battle-typ — `battle`, från `WebcastEvent.LINK_MIC_BATTLE`
// (bridge.js:252) — och aldrig `battle_mvp` eller `mvp`. Alltså kunde overlayn bara nås via
// testknappen i panelen eller en Action som användaren själv byggt. Widgeten var färdig grafik utan
// trigger.
//
// `battleStatus` färdades hela vägen från normalizern via molnets cleanEvent till klientkontraktet
// och lästes av NOLL rader klientkod.
//
// VÄRDENA ÄR OMÄTTA. Enda battleStatus-värdet i hela repot är `'active'` i ett servertest, hittat på
// av testförfattaren. `tiktok-live-connector ^2` typar battle-payloaden som en generisk EventHandler,
// så inte heller biblioteket ger facit. Klassificeringen är därför NYCKELORDSBASERAD och tolerant,
// och varje rått värde som setts sparas i VyraBattleMvp.seenStatuses så en enda riktig battle räcker
// för att pinna dem.
//
// RÖTT NU: filen battle-mvp-session.js finns inte.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);

const mvpWidget = (id = 'mvp1', over = {}) => Object.assign({
  id, type: 'templateBattleMvp', x: 10, y: 10, width: 300, title: 'Battle MVP',
  mvpLabel: 'BATTLE MVP', mvpName: 'TestAlpha', mvpScore: 1500, mvpDuration: 7
}, over);

function boot(widgets = [mvpWidget()]) {
  const h = createDom({ state: { widgets, projectName: 'mvp' } });
  h.load('overlay-sanitize.js');
  h.load('battle-mvp-session.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;${widgets.map(w => `state.widgets.push(${JSON.stringify(w)})`).join(';')};`);
  // Fånga varje MVP-trigger i stället för att rita — det som ska bevisas är URVALET, inte pixlarna.
  run(`window.__mvp=[];const echt=window.triggerBattleMvp;window.triggerBattleMvp=e=>{window.__mvp.push(e);return true};`);
  const skicka = e => h.window.routeLiveBattleEvent(e);
  const traffar = () => h.window.__mvp;
  return { h, run, skicka, traffar };
}

const battle = (battleStatus, over = {}) => ({ type: 'battle', battleStatus, ...over });
const gava = (username, coins, over = {}) => ({ type: 'gift', username, coins, ...over });

// ---- 1. hela kedjan --------------------------------------------------------------------------

test('battle start → gåvor → battle end ger en MVP', () => {
  const { skicka, traffar } = boot();
  skicka(battle('battle_start'));
  skicka(gava('lisa', 500));
  skicka(gava('omar', 1200));
  skicka(gava('lisa', 300));
  skicka(battle('battle_end'));
  assert.equal(traffar().length, 1, 'exakt en MVP per avslutad match');
  assert.equal(traffar()[0].name, 'omar', 'MVP ska vara den som gav mest coins totalt');
  assert.equal(traffar()[0].score, 1200);
});

test('summeringen är total, inte största enskilda gåva', () => {
  const { skicka, traffar } = boot();
  skicka(battle('battle_start'));
  skicka(gava('stina', 400));
  skicka(gava('stina', 400));
  skicka(gava('stina', 400));
  skicka(gava('bo', 1000));
  skicka(battle('battle_end'));
  assert.equal(traffar()[0].name, 'stina', '1200 i tre gåvor slår 1000 i en');
  assert.equal(traffar()[0].score, 1200);
});

test('profilbilden följer med MVP:n', () => {
  const { skicka, traffar } = boot();
  skicka(battle('battle_start'));
  skicka(gava('lisa', 900, { profileImage: 'https://bild/lisa.png' }));
  skicka(battle('battle_end'));
  assert.equal(traffar()[0].profileImage, 'https://bild/lisa.png');
});

// ---- 2. inga gåvor ---------------------------------------------------------------------------

test('ingen gåva under matchen ger ingen MVP', () => {
  const { skicka, traffar } = boot();
  skicka(battle('battle_start'));
  skicka(battle('battle_end'));
  assert.equal(traffar().length, 0, 'en tom match ska inte visa någon MVP alls');
});

test('gåvor UTANFÖR matchen räknas inte', () => {
  const { skicka, traffar } = boot();
  skicka(gava('före', 9999));
  skicka(battle('battle_start'));
  skicka(battle('battle_end'));
  skicka(gava('efter', 9999));
  assert.equal(traffar().length, 0, 'bara bidrag under aktiv battle får räknas');
});

// ---- 3. dubbla och släpande slutsignaler -------------------------------------------------------

test('två end-events ger inte två MVP', () => {
  const { skicka, traffar } = boot();
  skicka(battle('battle_start'));
  skicka(gava('lisa', 500));
  skicka(battle('battle_end'));
  skicka(battle('battle_end'));
  skicka(battle('battle_finished'));
  assert.equal(traffar().length, 1, 'en avslutad match får tända exakt en gång');
});

test('ett släpande end-event utan föregående start ger ingen MVP', () => {
  const { skicka, traffar } = boot();
  skicka(battle('battle_end'));
  assert.equal(traffar().length, 0, 'utan en aktiv session finns ingen match att kora MVP för');
});

// ---- 4. ny battle nollställer ------------------------------------------------------------------

test('ny battle nollställer föregående summering', () => {
  const { skicka, traffar } = boot();
  skicka(battle('battle_start'));
  skicka(gava('gammal', 5000));
  skicka(battle('battle_end'));
  skicka(battle('battle_start'));
  skicka(gava('ny', 100));
  skicka(battle('battle_end'));
  assert.equal(traffar().length, 2);
  assert.equal(traffar()[1].name, 'ny', 'förra matchens 5000 läckte in i den nya');
  assert.equal(traffar()[1].score, 100);
});

test('en ny start utan sett slut avslutar den föregående matchen först', () => {
  // Säkerhetsnätet mot att slutvärdet inte känns igen: nästa match kan inte börja medan en gammal
  // fortfarande är öppen, så den föregående stängs och tänder sin MVP då.
  const { skicka, traffar } = boot();
  skicka(battle('battle_start'));
  skicka(gava('lisa', 700));
  skicka(battle('battle_start'));
  assert.equal(traffar().length, 1, 'den öppna matchen stängdes aldrig');
  assert.equal(traffar()[0].name, 'lisa');
});

// ---- 5. tie-breaker ---------------------------------------------------------------------------

test('vid lika coins vinner den som bidrog först', () => {
  const { skicka, traffar } = boot();
  skicka(battle('battle_start'));
  skicka(gava('forst', 600));
  skicka(gava('sedan', 600));
  skicka(battle('battle_end'));
  assert.equal(traffar()[0].name, 'forst',
    'tie-breaker: tidigast första bidrag vinner — dokumenterad i battle-mvp-session.js');
});

test('vid lika coins OCH samma ordning är urvalet ändå deterministiskt', () => {
  // Andra steget i tie-breakern: användarnamn i bokstavsordning. Utan det kan urvalet variera
  // mellan körningar och testet blir flakigt i stället för fel.
  const { h } = boot();
  const valj = h.window.VyraBattleMvp.valjMvp;
  const bidrag = [
    { username: 'zeta', coins: 500, forstAt: 10 },
    { username: 'alfa', coins: 500, forstAt: 10 }
  ];
  assert.equal(valj(bidrag).username, 'alfa');
  assert.equal(valj([...bidrag].reverse()).username, 'alfa', 'urvalet beror på inmatningsordningen');
});

// ---- 6. statusklassificering -------------------------------------------------------------------

test('slutvärden känns igen på nyckelord, inte på en exakt sträng', () => {
  const { h } = boot();
  const { klassa } = h.window.VyraBattleMvp;
  for (const v of ['battle_end', 'end', 'ENDED', 'battle_finish', 'finished', 'battle-over',
    'settle', 'result', 'punish']) {
    assert.equal(klassa(v), 'slut', `"${v}" borde läsas som slutläge`);
  }
});

test('startvärden känns igen på nyckelord', () => {
  const { h } = boot();
  const { klassa } = h.window.VyraBattleMvp;
  for (const v of ['battle_start', 'start', 'ACTIVE', 'begin', 'in_progress', 'ongoing']) {
    assert.equal(klassa(v), 'aktiv', `"${v}" borde läsas som aktivt läge`);
  }
});

test('okänt statusvärde ändrar ingenting, men antecknas', () => {
  // Värdena är omätta. Ett okänt värde får aldrig gissas till "slut" — då tänder MVP mitt i
  // matchen. Det ska däremot synas, så en enda riktig battle räcker för att pinna sanningen.
  const { h, skicka, traffar } = boot();
  skicka(battle('battle_start'));
  skicka(gava('lisa', 500));
  skicka(battle('nagot_helt_okant'));
  assert.equal(traffar().length, 0, 'ett okänt värde tolkades som slut');
  assert.ok([...h.window.VyraBattleMvp.seenStatuses].includes('nagot_helt_okant'),
    'okända värden måste antecknas, annars går de aldrig att lära sig');
});

// ---- 7. duration-default -----------------------------------------------------------------------

test('visningstidens default är 7 sekunder överallt', () => {
  const fs = require('fs'), path = require('path');
  const ROOT = path.join(__dirname, '..');
  const avvikande = [];
  for (const fil of ['media.js', 'runtime-controls.js', 'widget-factory.js']) {
    const src = fs.readFileSync(path.join(ROOT, fil), 'utf8');
    for (const m of src.matchAll(/mvpDuration\s*(?:\|\||\?\?)\s*(\d+)/g)) {
      if (m[1] !== '7') avvikande.push(`${fil}: mvpDuration || ${m[1]}`);
    }
    for (const m of src.matchAll(/mvpDuration:\s*(\d+)/g)) {
      if (m[1] !== '7') avvikande.push(`${fil}: mvpDuration: ${m[1]}`);
    }
  }
  assert.deepEqual(avvikande, [], 'kön och widgeten skulle räkna med olika tider:\n' + avvikande.join('\n'));
});

// ---- 8. debugresten ---------------------------------------------------------------------------

test('ingen toast vid trigger', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'media.js'), 'utf8');
  const rad = src.split('\n').find(l => /function triggerBattleMvp/.test(l)) || '';
  assert.doesNotMatch(rad, /toast\(/,
    'en Studio-notis per MVP i skarp drift — felsökningsrest');
});
