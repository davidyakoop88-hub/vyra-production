'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'studio.css'), 'utf8');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
const COLORS = {1:['#ff4f9f','#ffb1dc'],2:['#ff82c8','#9d4dff'],3:['#49bfff','#8ce8ff'],4:['#287dff','#79a7ff']};

// 2026-09-07 (#367): diamonds blev en tredje måltyp, så "båda" blev "alla tre". Rubriken står kvar
// som ett påstående om ANTALET MODELLER (fyra), inte om antalet måltyper — det är modellerna raden
// under loopar över.
test('katalogen erbjuder fyra liggande modeller för alla måltyperna', () => {
  assert.match(MEDIA, /FOLLOWERS, LIKE & DIAMOND GOALS · 4 LIGGANDE DESIGNER/);
  assert.doesNotMatch(MEDIA.split('const socialGoalCatalog=')[1].split('\n')[0], /data-goal-orient="\$\{o\}"|sgOrients/);
  for (const kind of ['followers','likes','diamonds']) for (let model=1; model<=4; model+=1) {
    const w = VyraWidgets.create(`catalog:socialgoal:${kind}:${model}:landscape`);
    assert.equal(w.goalOrientation, 'landscape');
    assert.deepEqual([w.goalColor,w.goalColor2], COLORS[model]);
  }
});

test('två modeller är rosa och två är blå', () => {
  assert.ok(COLORS[1][0].startsWith('#ff') && COLORS[2][0].startsWith('#ff'));
  assert.ok(COLORS[3][0].includes('bf') && COLORS[4][0].includes('7d'));
});

test('liggande modeller har ingen hård bredd och modell 4 är horisontell', () => {
  const landscape = CSS.slice(CSS.indexOf('.social-goal.goal-landscape{'), CSS.indexOf('}', CSS.indexOf('.social-goal.goal-landscape{')) + 1);
  assert.doesNotMatch(landscape, /width:\s*440px!important/);
  const model4 = CSS.slice(CSS.indexOf('.social-goal.goal-4{'), CSS.indexOf('}', CSS.indexOf('.social-goal.goal-4{')) + 1);
  assert.doesNotMatch(model4, /width:\s*200px!important/);
  assert.match(CSS, /\.social-goal\.goal-landscape\.goal-4\{display:grid!important/);
});

test('äldre sparade stående mål fortsätter vara giltiga', () => {
  const old = VyraWidgets.create('catalog:socialgoal:likes:2:portrait');
  assert.equal(old.goalOrientation, 'portrait');
});

// ---- katalogen måste ERBJUDA varje måltyp som finns --------------------------------------------
// `VyraWidgets.create('catalog:socialgoal:diamonds:…')` fungerar oavsett vad studion visar, så
// proven ovan var gröna även med diamantknappen borttagen ur katalogen — uppmätt med
// mutationsriggen 2026-09-07. Måltypen hade funnits i båda tabellerna, i motorn och i databasen,
// och ändå hade ingen streamer kunnat skapa widgeten.
//
// Det är samma mönster som färdig grafik utan live-trigger, som drabbat fem widgetar: varje led
// korrekt, ingen väg fram. Vakten är generell och gäller varje FRAMTIDA måltyp.
test('katalogen erbjuder varje måltyp som registret känner till', () => {
  const ServerMetrics = require(path.join(ROOT, 'server', 'goal-metrics.js'));
  const block = MEDIA.match(/sgKinds=\[(.*?)\],sgModels=/);
  assert.ok(block, 'hittade inte sgKinds i media.js — har katalogsektionen skrivits om?');
  const erbjudna = new Set([...block[1].matchAll(/\['([a-z_]+)'/g)]
    .map(m => VyraWidgets.goalKind(m[1])));
  for (const kind of new Set(Object.values(ServerMetrics.GOAL_KINDS))) {
    assert.ok(erbjudna.has(kind),
      `måltypen "${kind}" finns i GOAL_KINDS men har ingen knapp i katalogen — ` +
      'ingen kan skapa widgeten, och varje annat prov är fortfarande grönt.');
  }
});
