'use strict';
// KOMMENTAREN OM FLIPPEN HADE GLIDIT FRAN CSS:EN.
//
// `VyraFlip` i media.js motiverar sin viktigaste regel — att en flipp ager sin widget tills den
// spelat klart — med siffror ur CSS:en. Fram till 2026-09-22 stod det:
//
//   "neither flip rotates at all before roughly 42% of its duration (vyraFlipSmooth holds
//    rotateY(0) until 1.76s of 4.2s, streakFlip likewise)"
//
// Tre fel i en mening. Varvet hade bytts fran 4,2 s till 10 s, sa 43 % ar 4,3 s och inte 1,76.
// Keyframen `streakFlip` hade dopts om till `streakFlipLoop` och fanns inte langre i nagon CSS-fil.
// Och de tva procenttalen ar OLIKA — 43 mot 38 — dar texten pastod ett gemensamt "roughly 42%".
//
// Slutsatsen holl hela tiden. Talen gjorde det inte, och det ar talen nasta person kommer att rakna
// pa nar gavororelsens koreografi ska samsas med flippen.
//
// DET HAR PROVET AR INGEN KALLVAKT. Det laser de riktiga vardena ur studio.css och kraver att
// kommentaren bar samma. Andras varvet eller procenten i CSS:en faller provet och pekar pa texten —
// alltsa precis den drift som fick sta oupptackt i manader.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');

const ROOT = path.join(__dirname, '..');
const las = fil => fs.readFileSync(path.join(ROOT, fil), 'utf8');
const CSS = las('studio.css');
const MEDIA = las('media.js');

// Regeln som ger flippen sin langd, och keyframen som ger den sin form. Bada las ur CSS:en; inget
// tal i det har provet ar skrivet for hand.
function varv(selektor, keyframe) {
  const regel = new RegExp(selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + '\\{animation:' + keyframe + '\\s+([^\\s]+)');
  const m = regel.exec(CSS);
  assert.ok(m, `hittade ingen animationsregel for ${selektor} — provet mater ingenting`);
  const stopp = new RegExp('@keyframes ' + keyframe + '\\{0%,(\\d+)%\\{transform:rotateY\\(0\\)\\}').exec(CSS);
  assert.ok(stopp, `hittade ingen rotateY(0)-etapp i @keyframes ${keyframe}`);
  return { langd: m[1], procent: Number(stopp[1]) };
}

test('Top Gifts varv och vilopunkt star ratt i kommentaren', () => {
  const { langd, procent } = varv('.vyra-topgift.play .vyra-flip', 'vyraFlipSmooth');
  assert.equal(langd, '10s', 'forutsattningen bytte: varvet ar inte langre 10s');
  assert.equal(procent, 43);

  const sekunder = (parseFloat(langd) * procent / 100).toFixed(1);   // 4.3
  assert.ok(MEDIA.includes('vyraFlipSmooth  10s'),
    'kommentaren namner inte varvets riktiga langd');
  assert.ok(MEDIA.includes(`rotateY(0) to ${procent}%  = ${sekunder}s`),
    `kommentaren sager inte att rotationen star still till ${procent}% = ${sekunder}s`);
});

test('Top Streaks varv och vilopunkt star ratt i kommentaren', () => {
  const { langd, procent } = varv('.vyra-streak.hit .streak-flip', 'streakFlipLoop');
  assert.equal(langd, 'var(--speed,3.8s)');
  assert.equal(procent, 38);

  const sekunder = (3.8 * procent / 100).toFixed(2);                 // 1.44
  assert.ok(MEDIA.includes('streakFlipLoop  var(--speed,3.8s)'),
    'kommentaren namner inte streakens riktiga varv');
  assert.ok(MEDIA.includes(`rotateY(0) to ${procent}%  = ${sekunder}s`),
    `kommentaren sager inte att rotationen star still till ${procent}% = ${sekunder}s`);
});

test('MUTATIONSVAKTEN: de gamla talen och det borttagna keyframe-namnet ar borta', () => {
  // Kommer texten tillbaka — av en aterstallning eller en sammanslagning — ska provet falla direkt.
  assert.doesNotMatch(MEDIA, /1\.76s of 4\.2s/, 'det gamla talet ar tillbaka i kommentaren');
  assert.doesNotMatch(MEDIA, /roughly 42% of its duration/,
    'pastaendet om ett gemensamt procenttal ar tillbaka — de ar 43 och 38');
});

test('keyframen kommentaren en gang namngav finns verkligen inte', () => {
  // `streakFlip` utan `Loop`. Fanns den skulle den gamla texten ha varit halvt riktig, och provet
  // ovan hade matt fel sak.
  assert.doesNotMatch(CSS, /@keyframes streakFlip\{/,
    'keyframen streakFlip finns igen — da ska kommentaren beskriva bada, inte bara streakFlipLoop');
});

test('bada flipparna ar oandliga — det ar det resume() vilar pa', () => {
  // `resume()` lamnar aldrig tillbaka till `start()` nar en flipp borjat, eftersom grenen
  // `!state.loopMs && gone >= state.durationMs` kraver en ANDLIG animation. Blir nagon av de tva
  // andlig slutar den regeln galla, och widgeten borjar hacka vid varje gava igen.
  for (const [selektor, keyframe] of [['.vyra-topgift.play .vyra-flip', 'vyraFlipSmooth'],
                                      ['.vyra-streak.hit .streak-flip', 'streakFlipLoop']]) {
    const regel = new RegExp(selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      + '\\{animation:' + keyframe + '[^}]*\\}');
    const m = regel.exec(CSS);
    assert.ok(m, `hittade ingen regel for ${selektor}`);
    assert.match(m[0], /infinite/, `${keyframe} ar inte langre oandlig — resume() slutar halla`);
  }
  assert.match(MEDIA, /BOTH LOOPS ARE INFINITE/,
    'kommentaren sager inte langre att bada looparna ar oandliga');
});
