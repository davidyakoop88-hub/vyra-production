'use strict';
// Last-X Alerts prints the like count of the event it just received. It read
// `e.count ?? e.value` — and `value` is what cloudEvent() fills from coins ?? points ?? score, which
// for a like is TikTok's running room-wide total. A single tap that arrives with count 0 therefore
// announced the entire room's like count as one viewer's: "SENT 943 LIKES".
//
// This is the same confusion the tally fix in live-leaderboard.js closed, in a second place. Only
// increment fields may be displayed: `count ?? likes`. The room total is never one of them, under
// any of its names.
//
// The functions are lifted out of the shipped sources rather than re-typed here, so the test cannot
// pass against a copy that has drifted from what actually renders.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');

// The Studio port: TYPES.liker.message is an arrow taking the event.
function studioLikerMessage() {
  const source = fs.readFileSync(path.join(ROOT, 'last-x-alerts.js'), 'utf8');
  // `.+?` with an explicit \r?\n rather than [^\n]: the shipped files are CRLF, so a trailing \r
  // would otherwise end up inside the captured expression.
  const liker = /liker:\s*\{[\s\S]*?message:\s*(e\s*=>.+?),?\r?\n/.exec(source);
  assert.ok(liker, 'hittade inte TYPES.liker.message i last-x-alerts.js');
  return vm.runInNewContext('(' + liker[1].replace(/,\s*$/, '') + ')', { Math, Number, String });
}

// The standalone OBS page: same field, plus its own nOf() helper.
function widgetLikerMessage() {
  const source = fs.readFileSync(path.join(ROOT, 'public/widgets/last-x-alerts.html'), 'utf8');
  const helper = /const nOf=[^\n]+/.exec(source);
  const liker = /liker:\s*\{[\s\S]*?message:\s*(e=>.+?),\r?\n/.exec(source);
  assert.ok(helper, 'hittade inte nOf() i last-x-alerts.html');
  assert.ok(liker, 'hittade inte liker.message i last-x-alerts.html');
  const sandbox = { Math, Number, String };
  vm.runInNewContext(helper[0], sandbox);
  return vm.runInNewContext('(' + liker[1] + ')', sandbox);
}

const IMPLEMENTATIONS = [
  ['last-x-alerts.js (Studio)', studioLikerMessage],
  ['last-x-alerts.html (OBS)', widgetLikerMessage]
];

for (const [name, load] of IMPLEMENTATIONS) {
  test(`${name}: count 0 med rumstotal 943 visar aldrig 943`, () => {
    const message = load();
    const out = String(message({ type: 'like', username: 'jokero', count: 0, value: 943 }));
    assert.ok(!/943/.test(out), `rumstotalen hamnade i alerten: "${out}"`);
  });

  test(`${name}: rumstotalen ignoreras under alla sina namn`, () => {
    const message = load();
    for (const field of ['value', 'points', 'total', 'totalLikeCount']) {
      for (const extra of [{ count: 0 }, {}]) {
        const out = String(message({ type: 'like', username: 'jokero', ...extra, [field]: 943 }));
        assert.ok(!/943/.test(out),
          `${field} visades som like-antal (${'count' in extra ? 'med count 0' : 'ensamt'}): "${out}"`);
      }
    }
  });

  test(`${name}: ett verkligt inkrement visas fortfarande`, () => {
    const message = load();
    assert.match(String(message({ type: 'like', username: 'jokero', count: 7, value: 943 })), /\b7\b/);
    // The desktop shape carries `likes`; losing it would silently blank that path.
    assert.match(String(message({ type: 'like', username: 'jokero', likes: 4, value: 943 })), /\b4\b/);
  });

  test(`${name}: stora inkrement formateras men förvanskas inte`, () => {
    const message = load();
    const out = String(message({ type: 'like', username: 'jokero', count: 1234, value: 999999 }));
    assert.ok(/1[\s ]?234/.test(out), `1234 visades som "${out}"`);
    assert.ok(!/999999|999[\s ]?999/.test(out), `rumstotalen läckte in: "${out}"`);
  });
}

test('varken implementationen nämner value/points/total i sin like-rad', () => {
  // A source-level backstop: the expression may be rewritten, but the room total must not come back
  // into it under a different name.
  const studio = fs.readFileSync(path.join(ROOT, 'last-x-alerts.js'), 'utf8');
  const widget = fs.readFileSync(path.join(ROOT, 'public/widgets/last-x-alerts.html'), 'utf8');
  const likerOf = (src, re) => { const m = re.exec(src); assert.ok(m, 'liker-blocket saknas'); return m[0] };
  const blocks = [
    likerOf(studio, /liker:\s*\{[\s\S]*?\r?\n\s{4}\}/),
    likerOf(widget, /liker:\s*\{[\s\S]*?\r?\n\s{4}\}/)
  ];
  for (const block of blocks) {
    assert.ok(!/e\.value|e\.points|e\.total|e\.totalLikeCount/.test(block),
      `rumstotalen används igen i like-raden:\n${block}`);
  }
});
