'use strict';

// De har vakterna ar medvetet källnara. Felet syns forst i en webblasare,
// men orsakerna ar binara: gammal bundle-URL, flera startpunkter eller
// ramkonst bakom widgetens hela stacking context.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('studio och premium-bundlen cachebustas tillsammans', () => {
  const studio = read('studio.html');
  const media = read('media.js');
  // Bumpad 2026-08-13 for Battle MVP-ramarna: andringen lag i media.js och widget-factory.js,
  // och utan ny strang fortsatter en cachad webblasare servera de gamla filerna.
  //
  // Bumpad 2026-08-17 for hero-koreografin, sedan for stack, ribbon, loyalty, badgereveal, hearts, heartbeat och duo — alla atta modeller. Regeln ar densamma
  // varje gang: BARA de strangar vars filer faktiskt andrades. For stack och ribbon ar det tre —
  // studio.css (modellens gamla .fan-active-regler borttagna), media.js (som bar bade sin egen
  // och fan-fas.js:s versionsstrang) och premium-bundlens version, som styr premium-final.css dar
  // faserna bor. widget-factory.js ar orord i bada och behaller sin strang; en bump utan andring
  // ar en gratis omladdning for varje anvandare och gor nasta lasare osaker pa vad som bytts.
  //
  // Bumpad 2026-08-17 for duckningen (§14): media.js bar versionsstrangarna for de sex filer som
  // andrades, sa media.js sjalv maste bumpas — annars fortsatter en cachad media.js peka pa de
  // gamla URL:erna och ingen av de sex byts ut. studio.css, widget-factory.js och fan-fas.js ar
  // OFORANDRADE och behaller darfor sina strangar. Det ar forsta gangen strangarna gar isar, och
  // det ar meningen: de ska folja filerna, inte varandra.
  //
  // Bumpad 2026-08-18 for loyaltys uttoning: BARA studio.css andrades — exit-regeln flyttade
  // fran ankaret `.fan-profile img` till behallaren `.fan-profile`. media.js, widget-factory.js,
  // fan-fas.js och premium-bundlens version ar oforandrade och behaller sina strangar. Andra
  // gangen strangarna gar isar, och av samma skal som forsta: de foljer filerna, inte varandra.
  //
  // Bumpad 2026-08-18 for panelens live-vag: custom-widgets.js och gift-fireworks.js andrades
  // (oninput byggde om hela vyn och slog ut faltet man skrev i). media.js BAR bada strangarna, sa
  // media.js sjalv maste bumpas — annars pekar en cachead media.js pa de gamla URL:erna och ingen
  // av filerna byts ut. Samma skal som duckningen 2026-08-17. gift-fireworks lamnar darfor
  // duckningslistan nedan: dess strang foljer numera panellagningen, inte duckningen.
  // studio.css, widget-factory.js, fan-fas.js och premium-bundlens version ar OFORANDRADE.
  // Bumpad 2026-08-18 for ramvaljarens stadning: media.js (tre pickergenerationer reducerade
  // till EN containerskapare, premium-skriptet raderat), studio.css (dott klassbaserat ramarv),
  // toplike-studio.js/.css, gift-alert-frames.js och profile-frames-premium.css (v=8) andrades.
  // De tre injicerade strangarna bars av media.js och pinnas nedan av samma skal som fan-fas:
  // en andring utan bump ar en tyst gammal fil. widget-factory.js och fan-fas.js ar ororda.
  // Bumpad 2026-08-18 igen for scenbakgrunden: studio.css (nodens tva ytor + kontrollen) och
  // vyra-historik.js (stageBackground i projektionen) andrades; stage-background.js ar ny (v=1).
  assert.match(studio, /studio\.css\?v=20260818-scenbakgrund/);
  assert.match(studio, /vyra-historik\.js\?v=20260818-scenbakgrund/);
  assert.match(studio, /stage-background\.js\?v=1/);
  // Bumpad 2026-08-18 for rotationen: widget-handles.js andrades (delegering till komposoren +
  // center-origin-matten); vyra-rotation.js ar ny (v=1).
  assert.match(studio, /vyra-rotation\.js\?v=1/);
  assert.match(studio, /widget-handles\.js\?v=20260818-rotation/);
  assert.match(studio, /[^-]media\.js\?v=20260819-fabriken/);
  assert.match(media, /toplike-studio\.css\?v=20260818-ramstad/);
  assert.match(media, /toplike-studio\.js\?v=20260818-ramstad/);
  assert.match(media, /gift-alert-frames\.js\?v=20260818-ramstad/);
  assert.match(media, /profile-frames-premium\.css\?v=8/);
  assert.match(studio, /widget-factory\.js\?v=20260813-gifter-level/);
  assert.match(media, /const version='20260819-fabriken'/);
  // Bumpad 2026-08-19: motorkärnan bröts ut till widget-fas.js (fabriken, v=1) och fan-fas
  // blev konfiguration — media.js kedjar laddningen fabrik→art eftersom arten kräver fabriken
  // vid parsning.
  assert.match(media, /widget-fas\.js\?v=1/);
  assert.match(media, /fan-fas\.js\?v=20260819-fabriken/);

  // De sex filer duckningen rorde. En bump utan andring ar en gratis omladdning for varje
  // anvandare; en andring utan bump ar en tyst gammal fil. Bada ar fel, sa listan ar explicit.
  for (const fil of ['vyra-tal', 'action-event', 'action-runtime',
                     'battle-mvp-session', 'sound-alerts']) {
    assert.match(media, new RegExp(`${fil}\\.js\\?v=20260817-duckning`), `${fil}.js cachebustades inte`);
  }
  // Grannarna i samma laddningslista ar ororda och ska INTE ha bumpats med.
  // De tva filer panellagningen rorde. En bump utan andring ar en gratis omladdning; en andring
  // utan bump ar en tyst gammal fil som fortsatter riva panelen vid varje tangenttryck.
  assert.match(media, /custom-widgets\.js\?v=20260818-panel-live/);
  assert.match(media, /gift-fireworks\.js\?v=20260818-panel-live/);
  assert.match(media, /vyra-masterval\.js\?v=20260817-tal/);
  assert.match(media, /action-master\.js\?v=20260817-tal/);
});

test('Like Fountain föder alla partiklar från mitten', () => {
  const css = read('studio.css');
  assert.match(css, /\.lf-p\{position:absolute;left:50%;bottom:14px/,
    'varje partikel måste ha samma fysiska startpunkt');
  assert.doesNotMatch(css, /\.lf-p\{position:absolute;left:calc\(50% \+ var\(--ox/,
    'sidledsspridning får inte placera partiklar på olika startpunkter');
  assert.match(css, /@keyframes lfOrganicHeartRise\{\s*0%\{transform:translate\(-50%,10px\)/,
    'organiska hjärtan måste börja i källpunkten innan banan breder ut sig');
});

test('framed Goal har konst bakom innehållet, även stående', () => {
  const css = read('premium-final.css');
  assert.match(css, /\.premium-goal\.goal-framed \.goal-frame-art\{[^}]*z-index:0/);
  assert.match(css, /\.premium-goal\.goal-framed>\.goal-copy,\.premium-goal\.goal-framed>\.goal-track,\.premium-goal\.goal-framed>em\{z-index:1\}/);
  assert.match(css, /\.premium-goal\.goal-framed\.goal-portrait\{min-height:440px/);
  assert.doesNotMatch(css, /\.premium-goal\.goal-framed \.goal-frame-art\{[^}]*z-index:-1/);
});
