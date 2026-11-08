'use strict';
// GET /api/admin/anvandare — Driftcentralens användarsiffror. Provas utan databas: frågorna läses
// mot en låtsaspool, och spärren och Dockerfilen läses i källan.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { anvandarsiffror, FRAGOR } = require('../anvandarsiffror.js');
const ROT = path.join(__dirname, '..');

function pool(svar) {
  const fragor = [];
  return { fragor, query: async sql => { fragor.push(sql); const nyckel = Object.keys(FRAGOR).find(k => FRAGOR[k] === sql); return { rows: svar[nyckel] || [] }; } };
}

test('siffrorna räknas ihop: betan skiljs från de som betalar', async () => {
  const p = pool({
    konton: [{ totalt: 47, aktiva: 46, verifierad_epost: 39, nya_7d: 6, nya_30d: 21 }],
    inloggade: [{ dygn: 5, d7: 14, d30: 30 }],
    premium: [{ provider: 'comp', antal: 20 }, { provider: 'paypal', antal: 3 }],
    tiktok: [{ kopplade: 18, aktiva: 15, verifierade: 3 }]
  });
  const s = await anvandarsiffror(p, () => new Date('2026-11-08T22:00:00Z'));
  assert.deepEqual(s.konton, { totalt: 47, aktiva: 46, verifieradEpost: 39, nya7d: 6, nya30d: 21 });
  assert.deepEqual(s.inloggade, { dygn: 5, d7: 14, d30: 30 });
  assert.deepEqual(s.premium, { totalt: 23, beta: 20, betalande: 3, perLeverantor: { comp: 20, paypal: 3 } });
  assert.deepEqual(s.tiktok, { kopplade: 18, aktiva: 15, verifierade: 3 });
  assert.equal(s.uppdaterad, '2026-11-08T22:00:00.000Z');
  assert.equal(p.fragor.length, 4);
});

test('tom databas ger nollor, inte NaN eller undefined', async () => {
  const s = await anvandarsiffror(pool({}));
  assert.equal(s.konton.totalt, 0); assert.equal(s.premium.totalt, 0); assert.equal(s.premium.betalande, 0);
  assert.deepEqual(s.premium.perLeverantor, {});
});

test('bara antal lämnar servern — ingen fråga läser e-post, namn eller lösenord', () => {
  for (const [namn, sql] of Object.entries(FRAGOR)) {
    assert.doesNotMatch(sql, /\b(email|display_name|password_hash|tiktok_username|visningsnamn|token_hash|ip_hash)\b/i, namn);
    assert.match(sql, /count\(/i, namn + ' räknar');
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/i, namn + ' bara läser');
  }
});

test('premium räknas som betalgrinden: utgången uppsägning räknas inte', () => {
  assert.match(FRAGOR.premium, /plan='premium'/);
  assert.match(FRAGOR.premium, /status IN \('active','trialing','past_due'\)/);
  assert.match(FRAGOR.premium, /NOT \(cancel_at_period_end AND current_period_end IS NOT NULL AND current_period_end < now\(\)\)/);
  const billing = fs.readFileSync(path.join(ROT, 'billing.js'), 'utf8');
  assert.match(billing, /\['active','trialing','past_due'\]\.includes\(sub\.status\)/, 'billing.js räknar aktiva statusar annorlunda nu — synka FRAGOR.premium');
});

test('rutten ligger innanför /api/admin/-spärren: utan plattformsadmin blir svaret 403', () => {
  const kod = fs.readFileSync(path.join(ROT, 'index.js'), 'utf8');
  const sparr = kod.indexOf("if(p.startsWith('/api/admin/')){if(!s.is_platform_admin)return send(res,403");
  const rutt = kod.indexOf("p==='/api/admin/anvandare'");
  assert.ok(sparr > 0, 'spärren för /api/admin/ hittades inte');
  assert.ok(rutt > sparr, 'rutten ligger före spärren');
  // Ingen annan väg till siffrorna: modulen används bara av adminrutten.
  assert.equal((kod.match(/Anvandarsiffror\.anvandarsiffror\(/g) || []).length, 1);
  // Mellan spärren och rutten får adminblocket inte ha stängts. Räknar klamrar utanför strängar.
  let djup = 0, i = kod.indexOf('{', sparr), q = null;
  for (; i < rutt; i++) {
    const c = kod[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '{') djup++; else if (c === '}') djup--;
    assert.ok(djup > 0, 'adminblocket stängs innan rutten — den vore öppen för alla');
  }
});

test('Dockerfilen kopierar modulen (annars kraschar servern i produktion)', () => {
  const docker = fs.readFileSync(path.join(ROT, 'Dockerfile'), 'utf8');
  assert.match(docker, /COPY [^\n]*\banvandarsiffror\.js\b/);
});
