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
// origin/-formen står först sedan 2026-08-14. Den lokala grenen `feature/event-deduplication`
// raderades i Steg 0.5 — den var mergad och övergiven — och därefter hittade listan ingen ref med
// literalerna hos någon som städar sina lokala grenar. Provet hoppade tyst över på varje
// utvecklarmaskin, i månader, medan det såg ut att bara vara CI:s grunda checkout som skippade.
// Fjärrgrenen finns kvar på origin (`git ls-remote --heads origin | grep event-dedup`), så refen
// nedan räcker; behövs den lokalt: `git fetch origin feature/event-deduplication`.
const BASELINE = (() => {
  for (const rev of ['origin/feature/event-deduplication:media.js', 'feature/event-deduplication:media.js',
                     'origin/main:media.js', 'main:media.js']) {
    try {
      const source = execFileSync('git', ['show', rev], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      if (source.includes('state.widgets.push({')) return { rev, source };
    } catch (_) {}
  }
  return null;
})();

const skip = BASELINE ? false : 'ingen baseline-ref med inline-literaler (grund checkout) — hoppar över';

// Returnerar null när markören saknas. En variant som inte fanns i media.js före fabriken är
// inte "glidning" — den är tillkommen efteråt, och de två fallen ska inte se likadana ut.
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

// Designen har medvetet gått vidare sedan migrationen, och historien ändras inte i efterhand.
// Ett krav på exakt likhet kan därför aldrig bli grönt igen — det provet var rött från den dag
// någon förbättrade en widget, och syntes inte eftersom hela filen hoppade över.
//
// Listan nedan är skillnaden mellan "designen utvecklades" och "något ändrades utan att någon
// märkte det". Varje post är en variant som avviker från baseline, exakt vilka fält det gäller,
// och beslutet bakom. Avviker en variant i ett fält som INTE står här faller provet — och det är
// hela poängen: 20 av 28 varianter är fortfarande bit för bit identiska med media.js före
// fabriken, och de ska förbli det.
const AVSIKTLIG_DRIFT = {
  // d0a7156 bytte målfärgerna från en regel per typ (likes rosa, annars turkos) till en palett
  // per modell, och uppdaterade snapshotten i samma commit.
  'catalog:socialgoal:likes:2:portrait': { falt: ['goalColor', 'goalColor2'], beslut: 'd0a7156' },
  'catalog:socialgoal:follows:1:landscape': { falt: ['goalColor', 'goalColor2'], beslut: 'd0a7156' },
  // d0a7156 + 195fc8a: ramarna visar MVP, profilbild och namn — inget annat. Etiketten och de tre
  // visa-flaggorna följde med det beslutet.
  'catalog:battlemvp:ice': { falt: ['mvpLabel', 'mvpShowLabel', 'mvpShowName', 'mvpShowCoins'], beslut: 'd0a7156' },
  'catalog:battlemvp:inferno': { falt: ['mvpLabel', 'mvpShowLabel', 'mvpShowName', 'mvpShowCoins'], beslut: 'd0a7156' },
  'catalog:battlemvp:royal': { falt: ['mvpLabel', 'mvpShowLabel', 'mvpShowName', 'mvpShowCoins'], beslut: 'd0a7156' },
  'catalog:battlemvp:frame:gold-crown': { falt: ['mvpLabel', 'mvpShowLabel', 'mvpShowName'], beslut: '195fc8a' },
  // Texten skilde sig redan när repot importerades (058badb) — den har aldrig matchat grenen.
  'catalog:gifterlevel:profile': { falt: ['gifterMessage'], beslut: '058badb' },
  // 23ece1d porterade Gift Jar till dagens kodbas. Widgeten fanns inte i media.js före
  // fabriken, så det finns ingen literal att jämföra mot — inte en glidning, en tillkomst.
  'catalog:giftjar:crystal': { falt: '*', beslut: '23ece1d', tillkommen: true },
};

test('varje avvikelse från de ursprungliga katalogliteralerna är beslutad', { skip }, () => {
  const oväntade = [];
  for (const row of CONTRACT) {
    // Rader utan markor har aldrig haft en literal i media.js: Last-X, Eget innehall och Gift
    // Fireworks byggde sina widgets i sina egna filer. Baseline-beviset galler media.js, sa de kan
    // varken hittas eller jamforas har. Deras motsvarande bevis — att fabriken ger exakt det
    // knappen byggde — star i tests/factory-last-eleven.test.js.
    if (!row.marker) continue;
    const sandbox = Object.assign({ Math, Number, String, Object, Array, JSON, Date }, row.bindings);
    // Copied into this realm before comparing: an object built inside a vm context carries that
    // context's Object.prototype, and deepEqual is strict about prototypes.
    const literal = literalContaining(row.marker);
    const tillkommen = literal === null;
    if (tillkommen) {
      if (!AVSIKTLIG_DRIFT[row.key]) oväntade.push(`${row.key}: fanns inte alls i baseline`);
      continue;
    }
    const original = Object.assign({}, vm.runInNewContext('(' + literal + ')', sandbox));
    delete original.id;
    const nu = SNAPSHOT[row.key] || {};

    const skiljer = [...new Set([...Object.keys(original), ...Object.keys(nu)])]
      .filter(f => JSON.stringify(original[f]) !== JSON.stringify(nu[f]));
    if (!skiljer.length) continue;

    const tillåtet = AVSIKTLIG_DRIFT[row.key];
    if (tillåtet && tillåtet.falt === '*') continue;
    const oredovisade = tillåtet ? skiljer.filter(f => !tillåtet.falt.includes(f)) : skiljer;
    if (oredovisade.length) {
      oväntade.push(`${row.key}: ${oredovisade.join(', ')}` + (tillåtet ? ` (utöver beslut ${tillåtet.beslut})` : ''));
    }
  }

  assert.deepEqual(oväntade, [],
    'dessa varianter skiljer sig från ' + BASELINE.rev + ' utan att någon skrivit varför.\n' +
    'Är ändringen avsiktlig: lägg varianten och fälten i AVSIKTLIG_DRIFT med commiten som beslutade det.\n' +
    oväntade.map(r => `  ${r}`).join('\n'));
});

test('de varianter som inte är beslutade är fortfarande bit för bit identiska', { skip }, () => {
  let identiska = 0;
  for (const row of CONTRACT) {
    if (!row.marker || AVSIKTLIG_DRIFT[row.key]) continue;
    const sandbox = Object.assign({ Math, Number, String, Object, Array, JSON, Date }, row.bindings);
    const literal = literalContaining(row.marker);
    assert.notEqual(literal, null, `${row.key} har ingen literal i ${BASELINE.rev} och saknas i AVSIKTLIG_DRIFT`);
    const original = Object.assign({}, vm.runInNewContext('(' + literal + ')', sandbox));
    delete original.id;
    assert.deepEqual(SNAPSHOT[row.key], original, `${row.key} har glidit från ${BASELINE.rev}`);
    identiska += 1;
  }
  // Bärande: vore siffran låg bevisade provet ovan nästan ingenting.
  assert.ok(identiska >= 20, `bara ${identiska} varianter jämfördes mot historien — beviset har urholkats`);
});

test('baseline hade exakt tjugo katalogliteraler', { skip }, () => {
  const count = (BASELINE.source.match(/state\.widgets\.push\(\{/g) || []).length;
  assert.equal(count, 20, `baseline har ${count} katalogliteraler, kontraktet utgår från 20`);
});
