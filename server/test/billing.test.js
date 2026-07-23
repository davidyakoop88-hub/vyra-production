'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PLANS,planFromPrice}=require('../billing');
test('premium expands the free quotas',()=>{assert.ok(PLANS.premium.overlays>PLANS.free.overlays);assert.ok(PLANS.premium.mediaBytes>PLANS.free.mediaBytes);assert.ok(PLANS.premium.widgets>PLANS.free.widgets)});
test('unknown Stripe prices never grant premium access',()=>{process.env.STRIPE_PRICE_MONTHLY='price_monthly_15usd';assert.equal(planFromPrice('price_monthly_15usd'),'premium');assert.equal(planFromPrice('price_attacker'),'free')});
