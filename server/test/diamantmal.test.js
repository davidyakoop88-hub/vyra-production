'use strict';
// DIAMANTMÅLET — och den söm som gör varje ny måltyp farlig.
//
// Streamern vill ha en påminnelse om hur långt det är kvar till nästa steg, och tröskeln TikTok
// visar är i diamanter ("9.7K Diamanter för att nå nr. 99"). Uppmätt i en sändning 2026-09-06:
// 887 diamanter över 108 minuter, så standardmålet 1000 är ungefär en sändnings arbete — samma
// skala som 1000 följare, vilket är varför `TARGET_DEFAULTS` inte behövde en ny post. #367
//
// MOTORN KUNDE DET REDAN. `diamonds` fanns i goal-runtime.js METRICS, i CONTRIBUTIONS, i
// TRANSPORT_METRICS, i goal-sse.js och i CHECK-villkoret i schema.sql. Det enda som saknades var
// en rad i `GOAL_KINDS` — tabellen som säger vad en WIDGET får välja. Ändringen är en ratt på ett
// system som redan snurrade.
//
// ⚠️ DÄRFÖR ÄR DET HÄR PROVET INTE BARA OM DIAMANTER. Två av vakterna nedan är generella och
// gäller varje FRAMTIDA måltyp: en `GOAL_KIND` som motorn inte matar, eller som databasen inte
// accepterar, ger en widget som står på 0 för alltid — eller ett 500-fel vid sparandet — utan att
// ett enda befintligt prov faller. Det är samma klass som #349.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const M = require(path.join(__dirname, '..', 'goal-metrics.js'));
const Runtime = require(path.join(__dirname, '..', 'goal-runtime.js'));

const las = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('diamonds är en måltyp en widget kan välja', { timeout: 5000 }, () => {
  assert.equal(M.goalKind('diamonds'), 'diamonds');
  assert.equal(M.metricForWidget({ type: 'templateSocialGoal', goalKind: 'diamonds' }), 'diamonds');
});

test('en sparad overlay med ett diamantmål ger en runtime-rad med rätt metrik', { timeout: 5000 }, () => {
  // Vägen från sparat läge till databasrad. `metricForWidget` i isolering hade bevisat att
  // funktionen fungerar, inte att en sparad widget faktiskt tar sig hit.
  const rader = M.goalWidgetsIn({ widgets: [
    { id: 'w-diamant', type: 'templateSocialGoal', goalKind: 'diamonds', goalTarget: 9700 },
    { id: 'w-foljare', type: 'templateSocialGoal', goalKind: 'followers' },
  ]});
  assert.deepEqual(rader.map(r => [r.widgetId, r.metric, r.target]),
    [['w-diamant', 'diamonds', 9700], ['w-foljare', 'follows', 1000]]);
});

test('en gåva flyttar diamantmålet med VÄRDET, inte med antalet', { timeout: 5000 }, () => {
  // Buggen som annars hade sett rimlig ut: en combo på 10 Rose är EN händelse med count 10 och
  // value 300. Räknar målet `count` visar stapeln 10 av 9700 när streamern fick 300 diamanter.
  const gava = { type: 'gift', count: 10, value: 300 };
  assert.equal(Runtime.goalAmount('diamonds', gava), 300);
  assert.equal(Runtime.goalAmount('gifts', gava), 10, 'gifts ska fortfarande vara antalet');
  // Och en like får aldrig röra diamantmålet: `value` bär TikToks löpande rumstotal för likes, så
  // en enda tryckning hade annars krediterat målet med hela rummet.
  assert.equal(Runtime.goalAmount('diamonds', { type: 'like', count: 1, value: 10159 }), 0);
});

// ---- de generella sömvakterna ------------------------------------------------------------------

test('VARJE måltyp en widget kan välja är en metrik motorn faktiskt matar', { timeout: 5000 }, () => {
  // Utan den här vakten kan en ny `GOAL_KIND` läggas till, sparas, skapa en runtime-rad och visas
  // i studion — och sedan stå på 0 för evigt, eftersom ingen CONTRIBUTIONS-gren producerar den.
  // Widgeten ser korrekt ut i varje kodgranskning. Bara en sändning avslöjar den.
  for (const metrik of new Set(Object.values(M.GOAL_KINDS))) {
    assert.ok(Runtime.TRANSPORT_METRICS.includes(metrik),
      `måltypen "${metrik}" finns i GOAL_KINDS men motorn skickar den aldrig — ` +
      'widgeten skulle stå på 0 hela sändningen');
    // Och den måste kunna FÅ ett värde: goalAmount kastar på en metrik motorn inte känner.
    assert.doesNotThrow(() => Runtime.goalAmount(metrik, { type: 'gift', count: 1, value: 1 }),
      `goalAmount känner inte igen "${metrik}"`);
  }
});

test('VARJE måltyp accepteras av CHECK-villkoret i schema.sql', { timeout: 5000 }, () => {
  // En metrik som motorn matar men databasen avvisar ger inte en tom stapel utan ett 500-fel när
  // overlayen SPARAS — och det har redan hänt en gång: kommentaren vid rad 197 i schema.sql
  // berättar att Heart Me Goal kraschade på "violates check constraint
  // goal_runtime_metric_check" i produktion. Vakten läser villkoret som text i stället för att
  // kräva en Postgres, så den kör i den vanliga serversviten och inte bara i goal-runtime-jobbet.
  const schema = las('schema.sql');
  const villkor = schema.match(/metric\s+text\s+NOT NULL CHECK \(metric IN \(([^)]*)\)/);
  assert.ok(villkor, 'hittade inte CHECK-villkoret för metric — har schemat skrivits om?');
  const tillatna = new Set(villkor[1].match(/'([a-z_]+)'/g).map(s => s.slice(1, -1)));
  for (const metrik of new Set(Object.values(M.GOAL_KINDS))) {
    assert.ok(tillatna.has(metrik),
      `måltypen "${metrik}" avvisas av databasen — att spara overlayen ger 500. ` +
      'Lägg till den i BÅDE CREATE TABLE och ALTER TABLE-migreringen i schema.sql.');
  }
});
