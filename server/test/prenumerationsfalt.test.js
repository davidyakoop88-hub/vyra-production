'use strict';
// Vad vi laser ur en PayPal-prenumeration innan den skrivs till subscriptions-tabellen.
//
// UPPMATT UR PAYPALS REST-DOKUMENTATION (v1/billing/subscriptions) 2026-09-07:
//
//   subscription.billing_info.next_billing_time   nasta dragning — slutet pa den betalda perioden
//   subscription.billing_info.cycle_executions[]  en post per tenure (TRIAL / REGULAR) med
//                                                 cycles_remaining; TRIAL med cycles_remaining > 0
//                                                 betyder att vi ar I provperioden
//   subscription.custom_id                        vart workspace-id, satt vid skapandet
//
// PayPal har INGET trial_end-falt. Under provperioden ar next_billing_time provperiodens slut —
// men bara nar cycle_executions sager att provperioden pagar. Efter den ar samma falt nasta
// manadsdragning, och da ar trialEnd null. Nedrakningen i vyra-trial-onboarding.js vilar pa det.
//
// null, inte 0: to_timestamp(0) ar 1 januari 1970, och en nedrakning pa det visar -20 500 dagar.
// Kolumnerna ar timestamptz och tillater NULL. NULL ar det arliga svaret nar vi inte vet.
//
// Mappningen ar en REN funktion, precis som Stripe-varianten var — provbar utan databas och utan
// signerad nyttolast.
const test = require('node:test'), assert = require('node:assert/strict');
const billing = require('../billing');

const I_PROVPERIOD = {
  id: 'I-TRIAL1', status: 'ACTIVE', plan_id: 'P-TRIAL', custom_id: 'ws-1',
  billing_info: {
    next_billing_time: '2026-09-10T10:00:00Z',
    cycle_executions: [
      { tenure_type: 'TRIAL', sequence: 1, cycles_completed: 0, cycles_remaining: 1, total_cycles: 1 },
      { tenure_type: 'REGULAR', sequence: 2, cycles_completed: 0, cycles_remaining: 0, total_cycles: 0 },
    ],
  },
};

const BETALANDE = {
  id: 'I-REG1', status: 'ACTIVE', plan_id: 'P-REG', custom_id: 'ws-2',
  billing_info: {
    next_billing_time: '2026-10-07T10:00:00Z',
    cycle_executions: [
      { tenure_type: 'TRIAL', sequence: 1, cycles_completed: 1, cycles_remaining: 0, total_cycles: 1 },
      { tenure_type: 'REGULAR', sequence: 2, cycles_completed: 1, cycles_remaining: 0, total_cycles: 0 },
    ],
  },
};

test('faltlasningen finns som en ren funktion', () => {
  assert.equal(typeof billing.prenumerationsfalt, 'function');
});

test('under provperioden ar trialEnd = next_billing_time', () => {
  const f = billing.prenumerationsfalt(I_PROVPERIOD);
  assert.equal(f.inTrial, true);
  assert.equal(f.trialEnd, Date.parse('2026-09-10T10:00:00Z') / 1000);
  assert.equal(f.periodEnd, f.trialEnd, 'provperioden AR den aktuella perioden');
  assert.equal(f.workspaceId, 'ws-1');
  assert.equal(f.planId, 'P-TRIAL');
});

test('efter provperioden ar trialEnd null men periodEnd nasta dragning', () => {
  const f = billing.prenumerationsfalt(BETALANDE);
  assert.equal(f.inTrial, false);
  assert.equal(f.trialEnd, null, 'utan pagaende provperiod ska trialEnd vara null, inte 0');
  assert.equal(f.periodEnd, Date.parse('2026-10-07T10:00:00Z') / 1000);
});

test('saknat next_billing_time blir null, inte 1970', () => {
  const f = billing.prenumerationsfalt({ id: 'I-3', status: 'CANCELLED', billing_info: { cycle_executions: [] } });
  assert.equal(f.periodEnd, null,
    'fallbacken far inte sluta pa 0 — to_timestamp(0) = 1 januari 1970 och nedrakningen visar -20 500 dagar');
  assert.equal(f.trialEnd, null);
  assert.equal(f.paypalStatus, 'CANCELLED');
});

test('tomt eller trasigt objekt kraschar inte', () => {
  for (const indata of [null, undefined, {}, { billing_info: null }, { billing_info: { cycle_executions: 'nej' } }, { billing_info: { next_billing_time: 'inte ett datum' } }]) {
    const f = billing.prenumerationsfalt(indata);
    assert.equal(f.periodEnd, null, `indata: ${JSON.stringify(indata)}`);
    assert.equal(f.trialEnd, null);
    assert.equal(f.inTrial, false);
    assert.equal(f.planId, null);
  }
});

test('statusordet normaliseras till versaler sa att jamforelserna i localStatus haller', () => {
  assert.equal(billing.prenumerationsfalt({ status: 'active' }).paypalStatus, 'ACTIVE');
});
