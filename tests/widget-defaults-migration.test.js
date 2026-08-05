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
const BASELINE = (() => {
  for (const rev of ['feature/event-deduplication:media.js', 'origin/main:media.js', 'main:media.js']) {
    try {
      const source = execFileSync('git', ['show', rev], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      if (source.includes('state.widgets.push({')) return { rev, source };
    } catch (_) {}
  }
  return null;
})();

const skip = BASELINE ? false : 'ingen baseline-ref med inline-literaler (grund checkout) — hoppar över';

function literalContaining(marker) {
  const source = BASELINE.source;
  let from = 0;
  for (;;) {
    const at = source.indexOf('state.widgets.push({', from);
    assert.notEqual(at, -1, `hittade ingen katalogliteral som innehåller ${marker}`);
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

test('snapshot matchar de ursprungliga katalogliteralerna', { skip }, () => {
  for (const row of CONTRACT) {
    // Rader utan markor har aldrig haft en literal i media.js: Last-X, Eget innehall och Gift
    // Fireworks byggde sina widgets i sina egna filer. Baseline-beviset galler media.js, sa de kan
    // varken hittas eller jamforas har. Deras motsvarande bevis — att fabriken ger exakt det
    // knappen byggde — star i tests/factory-last-eleven.test.js.
    if (!row.marker) continue;
    const sandbox = Object.assign({ Math, Number, String, Object, Array, JSON, Date }, row.bindings);
    // Copied into this realm before comparing: an object built inside a vm context carries that
    // context's Object.prototype, and deepEqual is strict about prototypes.
    const original = Object.assign({}, vm.runInNewContext('(' + literalContaining(row.marker) + ')', sandbox));
    delete original.id;
    assert.deepEqual(SNAPSHOT[row.key], original, `${row.key} har glidit från ${BASELINE.rev}`);
  }
});

test('baseline hade exakt tjugo katalogliteraler', { skip }, () => {
  const count = (BASELINE.source.match(/state\.widgets\.push\(\{/g) || []).length;
  assert.equal(count, 20, `baseline har ${count} katalogliteraler, kontraktet utgår från 20`);
});
