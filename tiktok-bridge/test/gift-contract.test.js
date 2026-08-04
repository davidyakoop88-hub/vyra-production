'use strict';
// One contract for both connection paths: `coins` (which becomes `value` on the cloud event) is the
// TOTAL diamond cost of the forwarded event. A diamonds goal sums that field, so the two paths must
// agree or the same streak is worth different amounts depending on how the streamer connected.
//
// Today they disagree. The bridge multiplies by repeatCount, the desktop service does not. This file
// is red until they do, and both computations are lifted from the real sources rather than restated,
// so it cannot pass against a fossil.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const N = require('../normalizer');

const DESKTOP = fs.readFileSync(
  path.join(__dirname, '..', '..', 'electron-app', 'tiktok-service.js'), 'utf8');

// The desktop service builds its gift payload inline in the GIFT handler. Lift the coins expression
// as written, so a fix there is what turns this green.
function desktopCoinsExpression() {
  const at = DESKTOP.indexOf("emit('gift'");
  assert.notEqual(at, -1, 'hittade ingen gift-emit i tiktok-service.js');
  const line = DESKTOP.slice(at, DESKTOP.indexOf('\n', DESKTOP.indexOf('coins:', at)));
  const expr = /coins:\s*(.+?)(?:,\s*)?$/.exec(line.slice(line.indexOf('coins:')));
  assert.ok(expr, 'hittade inget coins-uttryck');
  return expr[1].replace(/,\s*$/, '');
}

function desktopCoins(data) {
  // number() and text() are the desktop service's own helpers, same semantics as the normalizer's.
  const number = (v, max = 1e12) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0 };
  return new Function('data', 'number', 'return ' + desktopCoinsExpression())(data, number);
}

// A finished streak of 3 roses at 10 diamonds each: the frame both paths actually forward.
const FINAL_FRAME = {
  giftType: 1, repeatCount: 3, repeatEnd: true,
  giftId: '5655', giftName: 'Rose', diamondCount: 10,
  gift: { id: '5655', name: 'Rose', type: 1, diamondCount: 10 },
  user: { userId: 'u1', uniqueId: 'tittare', nickname: 'Tittare' }
};

test('bridgens coins är den totala diamantkostnaden', { timeout: 5000 }, () => {
  assert.equal(N.giftFields(FINAL_FRAME).coins, 30, '10 diamanter × repeatCount 3');
});

test('desktop och cloud ger samma coins för samma frame', { timeout: 5000 }, () => {
  const cloud = N.giftFields(FINAL_FRAME).coins;
  const desktop = desktopCoins(FINAL_FRAME);
  assert.equal(desktop, cloud,
    `desktop ger ${desktop}, cloud ger ${cloud} — samma gåva är värd olika mycket beroende på anslutningsväg`);
});

test('kontraktet håller för varje repeatCount, inte bara för 3', { timeout: 5000 }, () => {
  for (const repeatCount of [1, 2, 5, 99]) {
    const frame = { ...FINAL_FRAME, repeatCount, gift: { ...FINAL_FRAME.gift } };
    assert.equal(desktopCoins(frame), N.giftFields(frame).coins,
      `divergens vid repeatCount ${repeatCount}`);
  }
});

test('en gåva utan repeatCount kostar sitt diamondCount en gång', { timeout: 5000 }, () => {
  const frame = { ...FINAL_FRAME, repeatCount: undefined };
  assert.equal(N.giftFields(frame).coins, 10);
  assert.equal(desktopCoins(frame), 10);
});
