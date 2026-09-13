'use strict';
// TRATTMATNINGEN, serverledet.
//
// Tva saker provas, och det andra ar det som faktiskt kan kosta pengar att ha fel:
//
//  1. matning.js sjalv: tyst utan konfiguration, ratt huvuden med, och ALDRIG ett kast.
//  2. SEKVENSEN i webhook(): att en PROVPERIOD inte rapporteras som BETALD.
//
// Punkt 2 ar en riktig fallgrop och inte en teoretisk. Uppmatt 2026-09-09: provkopet gav
// BILLING.SUBSCRIPTION.ACTIVATED med status ACTIVE och drog 0 USD. Lag 'betald' pa den handelsen
// skulle varje pastartad gratisperiod ha raknats som en intakt.
const test = require('node:test'), assert = require('node:assert/strict');

const HUVUDEN = {
  'paypal-transmission-id': 't-1',
  'paypal-transmission-time': '2026-09-09T19:50:48Z',
  'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT-1',
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-transmission-sig': 'sig',
};
const MILJO = {
  PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'hemlig', PAYPAL_ENV: 'sandbox',
  PAYPAL_PLAN_MONTHLY_TRIAL: 'P-PROV', PAYPAL_PLAN_MONTHLY: 'P-REGULJAR',
  PAYPAL_WEBHOOK_ID: 'WH-1', PLAUSIBLE_DOMAN: 'vyralive.app',
};

function fejkpool() {
  const st = { kund: null, abonnemang: { status: 'active' }, sedda: new Set() };
  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ');
    if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(s)) return { rows: [], rowCount: 0 };
    if (/INSERT INTO billing_events/i.test(s)) {
      if (st.sedda.has(params[0])) return { rows: [], rowCount: 0 };   // ON CONFLICT DO NOTHING
      st.sedda.add(params[0]);
      return { rows: [{ stripe_event_id: params[0] }], rowCount: 1 };
    }
    if (/SELECT workspace_id FROM subscriptions/i.test(s)) return { rows: [{ workspace_id: 'w-1' }] };
    if (/SELECT trial_started_at FROM billing_customers/i.test(s)) return { rows: st.kund ? [st.kund] : [] };
    if (/SELECT status FROM subscriptions/i.test(s)) return { rows: [{ status: st.abonnemang.status }] };
    if (/SELECT cancel_at_period_end FROM subscriptions/i.test(s)) return { rows: [{ cancel_at_period_end: false }] };
    return { rows: [], rowCount: 1 };
  }
  return { st, query, connect: async () => ({ query, release() {} }) };
}

// Fangar varje anrop till Plausible och later PayPal-anropen lyckas.
function rigg({ plausibleFel = false } = {}) {
  const matta = [];
  const svar = d => ({ ok: true, status: 200, text: async () => JSON.stringify(d), json: async () => d });
  async function fetch(url, init = {}) {
    const u = String(url);
    if (u.includes('plausible')) {
      matta.push({ url: u, kropp: JSON.parse(init.body), huvuden: init.headers });
      if (plausibleFel) throw new Error('plausible nere');
      return { ok: true, status: 202 };
    }
    if (u.endsWith('/v1/oauth2/token')) return svar({ access_token: 'tok', expires_in: 3600 });
    if (u.endsWith('/v1/notifications/verify-webhook-signature')) return svar({ verification_status: 'SUCCESS' });
    throw new Error('ovantat anrop: ' + u);
  }
  return { fetch, matta };
}

function rensaCache() {
  for (const n of Object.keys(require.cache)) if (/matning|billing/.test(n)) delete require.cache[n];
}

function medMiljo(fn, { plausibleFel = false } = {}) {
  return async () => {
    const gammal = {};
    for (const k of Object.keys(MILJO)) { gammal[k] = process.env[k]; process.env[k] = MILJO[k]; }
    const gammalFetch = global.fetch, r = rigg({ plausibleFel });
    global.fetch = r.fetch;
    // matning.js laser PLAUSIBLE_DOMAN vid require — modulcachen maste tommas per prov.
    rensaCache();
    try { await fn(r); } finally {
      global.fetch = gammalFetch;
      for (const k of Object.keys(MILJO)) {
        if (gammal[k] === undefined) delete process.env[k]; else process.env[k] = gammal[k];
      }
      rensaCache();
    }
  };
}

// Handelserna skickas EFTER commit utan await. Ge mikrotaskerna en tur innan vi lasar av.
const drant = () => new Promise(r => setTimeout(r, 10));

function aktiverad(id, { prov }) {
  const cykler = prov
    ? [{ tenure_type: 'TRIAL', sequence: 1, cycles_completed: 1, cycles_remaining: 0, total_cycles: 1 }]
    : [{ tenure_type: 'REGULAR', sequence: 1, cycles_completed: 1, cycles_remaining: 0, total_cycles: 0 }];
  return JSON.stringify({
    id, event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
    resource: {
      id: 'I-1', custom_id: 'w-1', plan_id: prov ? 'P-PROV' : 'P-REGULJAR', status: 'ACTIVE',
      billing_info: { next_billing_time: '2026-09-12T10:00:00Z', cycle_executions: cykler },
    },
  });
}
const salj = (id, total) => JSON.stringify({
  id, event_type: 'PAYMENT.SALE.COMPLETED',
  resource: { id: 'S-1', billing_agreement_id: 'I-1', amount: { total } },
});

// ---- 1. modulen -------------------------------------------------------------------------------

test('utan PLAUSIBLE_DOMAN skickas ingenting alls', async () => {
  const gammal = process.env.PLAUSIBLE_DOMAN;
  delete process.env.PLAUSIBLE_DOMAN;
  rensaCache();
  let anrop = 0;
  const gammalFetch = global.fetch;
  global.fetch = async () => { anrop++; return { ok: true, status: 202 }; };
  try {
    const M = require('../matning');
    assert.equal(M.aktiv(), false);
    assert.deepEqual(await M.handelse('betald'), { skickad: false, skal: 'omatt-miljo' });
    assert.equal(anrop, 0, 'en omatt miljo ska vara TYST, inte skicka till fel doman');
  } finally {
    global.fetch = gammalFetch;
    if (gammal === undefined) delete process.env.PLAUSIBLE_DOMAN; else process.env.PLAUSIBLE_DOMAN = gammal;
    rensaCache();
  }
});

test('handelsen bar de tva huvuden Plausible kraver, och en URL UTAN query', medMiljo(async r => {
  const M = require('../matning');
  await M.handelse('betald');
  assert.equal(r.matta.length, 1);
  const { kropp, huvuden, url } = r.matta[0];
  assert.ok(url.endsWith('/api/event'));
  assert.equal(kropp.name, 'betald');
  assert.equal(kropp.domain, 'vyralive.app');
  assert.ok(huvuden['user-agent'], 'utan user-agent svarar Plausible 400');
  assert.ok(huvuden['x-forwarded-for'], 'utan x-forwarded-for svarar Plausible 400');
  assert.equal(kropp.url.includes('?'), false, 'serverns URL far aldrig bara en sokstrang');
}));

test('ett natverksfel kastar aldrig vidare', medMiljo(async () => {
  const M = require('../matning');
  const ut = await M.handelse('betald');            // riggen kastar inifran fetch
  assert.equal(ut.skickad, false);
  assert.equal(ut.skal, 'natverksfel');
}, { plausibleFel: true }));

// ---- 2. sekvensen, det som kan kosta pengar ----------------------------------------------------

test('PROVPERIOD rapporteras som provperiod — ALDRIG som betald', medMiljo(async r => {
  const { webhook } = require('../billing');
  await webhook(fejkpool(), aktiverad('EV-prov', { prov: true }), HUVUDEN);
  await drant();
  const namn = r.matta.map(m => m.kropp.name);
  assert.deepEqual(namn, ['provperiod']);
  assert.equal(namn.includes('betald'), false,
    'ACTIVATED med gratisperiod drog 0 USD 2026-09-09 — raknas den som betald ljuger intaktssiffran');
}));

test('en riktig dragning rapporteras som betald', medMiljo(async r => {
  const { webhook } = require('../billing');
  await webhook(fejkpool(), salj('EV-salj', '15.00'), HUVUDEN);
  await drant();
  assert.deepEqual(r.matta.map(m => m.kropp.name), ['betald']);
}));

test('en dragning pa noll rapporteras inte alls', medMiljo(async r => {
  const { webhook } = require('../billing');
  await webhook(fejkpool(), salj('EV-noll', '0.00'), HUVUDEN);
  await drant();
  assert.deepEqual(r.matta.map(m => m.kropp.name), []);
}));

test('samma webhook tva ganger ger EN handelse', medMiljo(async r => {
  const { webhook } = require('../billing');
  const pool = fejkpool();
  await webhook(pool, salj('EV-dubbel', '15.00'), HUVUDEN);
  const ut = await webhook(pool, salj('EV-dubbel', '15.00'), HUVUDEN);
  await drant();
  assert.equal(ut.duplicate, true);
  assert.deepEqual(r.matta.map(m => m.kropp.name), ['betald'],
    'servern kan inte deduplicera nedstroms — idempotensen MASTE halla har');
}));

// privacy.html LOVAR: "Ingen av handelserna bar konto-, workspace- eller enhetsidentifierare, och
// de kan inte kopplas till en enskild anvandare." Ett loste i en policy som ingen vakt bevakar ar
// sant tills nasta andring, och blir da tyst osant. handelse() TAR emot props — det ar just darfor
// den har vakten behovs: den dag nagon lagger till workspaceId "for felsokning" ska CI saga ifran,
// inte en anvandare.
test('ingen handelse bar identifierare — policyn ar maskinkontrollerad', medMiljo(async r => {
  const { webhook } = require('../billing');
  await webhook(fejkpool(), aktiverad('EV-p', { prov: true }), HUVUDEN);
  await webhook(fejkpool(), salj('EV-s', '15.00'), HUVUDEN);
  await drant();
  assert.equal(r.matta.length, 2);
  for (const m of r.matta) {
    assert.equal('props' in m.kropp, false, 'handelsen ' + m.kropp.name + ' bar props');
    const platt = JSON.stringify(m.kropp);
    for (const forbjudet of ['w-1', 'I-1', 'S-1', 'workspace', 'user', 'email', 'custom_id']) {
      assert.equal(platt.includes(forbjudet), false,
        'handelsen ' + m.kropp.name + ' lackte ' + forbjudet + ' till Plausible');
    }
  }
}));

test('ar Plausible nere lyckas webhooken anda', medMiljo(async () => {
  const { webhook } = require('../billing');
  const ut = await webhook(fejkpool(), salj('EV-nere', '15.00'), HUVUDEN);
  await drant();
  assert.equal(ut.duplicate, false, 'en matning far ALDRIG kunna falla en betalning');
}, { plausibleFel: true }));
