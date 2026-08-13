'use strict';
// Local migration proof, not part of the permanent contract.
//
// tests/widget-factory.test.js compares the factory against a checked-in snapshot, which is what CI
// can run in a shallow checkout. This file proves the other half of that chain on a full clone: that
// the snapshot really is what the twenty inline catalog literals produced before widget-factory.js
// existed. It reads the pre-factory media.js out of git and evaluates the literals directly.
//
// It skips — loudly, not silently — when the baseline is unreachable, because a shallow CI checkout
// has no other refs and a skip there is correct. A failure here on a full clone means the snapshot
// has drifted from history and must be regenerated with scripts/generate-widget-snapshot.js.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { CONTRACT } = require('./fixtures/catalog-variants.js');
const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/widget-defaults.snapshot.json'), 'utf8'));

// Any ref that still has the inline literals. The branch this work is stacked on comes first.
//
// Den LOKALA grenen raderades i Steg 0.5 (2026-08-08) — den var mergad och overgiven — och da
// slutade det har provet tyst att kora hos alla som stadar sina lokala grenar. De tva ovriga
// posterna hjalpte inte: literalerna finns inte i main langre, det ar hela poangen med provet.
// Fjarrgrenen bar dem daremot fortfarande, sa `origin/`-varianten star nu direkt efter den lokala.
// Uppmatt 2026-08-13, samma resultat som i docs/tech-debt.md §4:
//
//   nej  feature/event-deduplication:media.js      (lokal gren finns inte langre)
//   JA   origin/feature/event-deduplication:media.js
//   nej  origin/main:media.js
//
// origin/feature/event-deduplication ar darmed den enda ref som bar baslinjen. Raderas den pa
// GitHub forsvinner underlaget provet jamfor mot, och da ar det har provet inte langre mojligt
// att kora — CI marks inte (grund checkout hoppar over anda), men beviskedjan bryts permanent.
const BASELINE = (() => {
  for (const rev of ['feature/event-deduplication:media.js', 'origin/feature/event-deduplication:media.js',
    'origin/main:media.js', 'main:media.js']) {
    try {
      const source = execFileSync('git', ['show', rev], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      if (source.includes('state.widgets.push({')) return { rev, source };
    } catch (_) {}
  }
  return null;
})();

const skip = BASELINE ? false : 'ingen baseline-ref med inline-literaler (grund checkout) — hoppar över';

// Widgetar som TILLKOM efter baslinjen. De har aldrig haft en literal i den gamla media.js, sa de
// kan varken hittas eller jamforas — precis som raderna utan markor. Listan ar uttrycklig sa att
// en felstavad markor inte kan gomma sig som "fanns visst inte i historien".
const EFTER_BASLINJEN = ['catalog:giftjar:crystal'];

// Hur manga nycklar som faktiskt ska jamforas. Kontrollmatningen finns for att provet annars kan
// krympa till noll jamforelser och anda vara gront — samma fallgrop som docs/tech-debt.md §7
// beskriver: ett prov som mater franvaro maste bevisa att det mätt nagot alls.
const ANTAL_JAMFORDA = 27;

function literalContaining(marker) {
  const source = BASELINE.source;
  let from = 0;
  for (;;) {
    const at = source.indexOf('state.widgets.push({', from);
    if (at === -1) return null;
    const open = source.indexOf('{', at);
    let depth = 0, i = open;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') { depth -= 1; if (!depth) break }
    }
    const literal = source.slice(open, i + 1);
    if (literal.includes(marker)) return literal;
    from = i;
  }
}

// Falt som medvetet andrats EFTER migrationen, och som darfor inte langre kan vara lika med
// historiken. Alla sex kommer ur EN commit: d0a7156 "feat(widgets): finish verified widget designs".
//
//   socialgoal   goalColor/goalColor2 fick nya varden. De gamla (#ff3f8f, #b84ee8, #24d8df) finns
//                inte kvar nagonstans i dagens kod.
//   battlemvp    etiketten kortades till "MVP" och tre nya reglage tillkom - mvpShowLabel,
//                mvpShowName, mvpShowCoins. De ar levande i widget-factory.js och media.js och
//                vaktas av tests/battle-mvp-display.test.js.
//
// Listan finns for att provet ska kunna fortsatta bevisa det den faktiskt kan bevisa: att de
// OVRIGA 21 nycklarna migrerade oforandrade, och att ingenting NYTT glider tyst. Utan den maste
// provet antingen ljuga eller stangas av - och avstangt var precis vad det var, i fem dagar,
// utan att nagon sag det. Vaxer listan ska det vara ett medvetet beslut med en commit att peka pa.
const AVSIKTLIGT_ANDRAT = {
  'catalog:socialgoal:likes:2:portrait': ['goalColor', 'goalColor2'],
  'catalog:socialgoal:follows:1:landscape': ['goalColor', 'goalColor2'],
  'catalog:battlemvp:ice': ['mvpLabel', 'mvpShowLabel', 'mvpShowName', 'mvpShowCoins'],
  'catalog:battlemvp:inferno': ['mvpLabel', 'mvpShowLabel', 'mvpShowName', 'mvpShowCoins'],
  'catalog:battlemvp:royal': ['mvpLabel', 'mvpShowLabel', 'mvpShowName', 'mvpShowCoins'],
  'catalog:battlemvp:frame:gold-crown': ['mvpLabel', 'mvpShowLabel', 'mvpShowName', 'mvpShowCoins']
};

test('undantagslistan beskriver nycklar som faktiskt finns', { skip }, () => {
  // En post som pekar pa en nyckel utan snapshot ar en kvarglomd rad, och den doljer drift.
  const vilse = Object.keys(AVSIKTLIGT_ANDRAT).filter(key => !SNAPSHOT[key]);
  assert.deepEqual(vilse, [], 'undantag utan motsvarande snapshot-nyckel');
});

test('snapshot matchar de ursprungliga katalogliteralerna', { skip }, () => {
  let jamforda = 0;
  for (const row of CONTRACT) {
    // Rader utan markor har aldrig haft en literal i media.js: Last-X, Eget innehall och Gift
    // Fireworks byggde sina widgets i sina egna filer. Baseline-beviset galler media.js, sa de kan
    // varken hittas eller jamforas har. Deras motsvarande bevis — att fabriken ger exakt det
    // knappen byggde — star i tests/factory-last-eleven.test.js.
    if (!row.marker) continue;
    const literal = literalContaining(row.marker);
    if (literal === null) {
      assert.ok(EFTER_BASLINJEN.includes(row.key),
        `${row.key}: markören ${row.marker} finns inte i ${BASELINE.rev} och står inte i EFTER_BASLINJEN`);
      continue;
    }
    jamforda += 1;
    const sandbox = Object.assign({ Math, Number, String, Object, Array, JSON, Date }, row.bindings);
    // Copied into this realm before comparing: an object built inside a vm context carries that
    // context's Object.prototype, and deepEqual is strict about prototypes.
    const original = Object.assign({}, vm.runInNewContext('(' + literal + ')', sandbox));
    delete original.id;
    // Jamforelsen sker pa kopior, sa undantagen tas bort fran BADA sidor. Ett falt som bara finns
    // i den ena (mvpShowLabel fanns inte fore d0a7156) forsvinner da helt ur jamforelsen i stallet
    // for att sta kvar som undefined mot true.
    const aktuell = Object.assign({}, SNAPSHOT[row.key]);
    for (const falt of AVSIKTLIGT_ANDRAT[row.key] || []) { delete aktuell[falt]; delete original[falt] }
    assert.deepEqual(aktuell, original, `${row.key} har glidit från ${BASELINE.rev}`);
  }
  assert.equal(jamforda, ANTAL_JAMFORDA,
    `jämförde ${jamforda} nycklar, väntade ${ANTAL_JAMFORDA} — provet har tappat täckning`);
});

test('baseline hade exakt tjugo katalogliteraler', { skip }, () => {
  const count = (BASELINE.source.match(/state\.widgets\.push\(\{/g) || []).length;
  assert.equal(count, 20, `baseline har ${count} katalogliteraler, kontraktet utgår från 20`);
});
