'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PLANS,planFromPrice,setCancellation}=require('../billing');

// EN KOMPAD RAD ÄR ETT AKTIVT ABONNEMANG, INTE ETT SAKNAT. Frågan hämtade stripe_subscription_id och
// kastade 404 så fort den saknades — vilket slog ihop "ingen rad finns" med "raden finns men har
// inget Stripe-id". Det andra fallet gjorde att kontoborttagningen i index.js aldrig kom fram till
// `UPDATE users SET deletion_requested_at`, eftersom den säger upp aktiva abonnemang FÖRST. Kontot
// gick alltså aldrig att ta bort, och felet var permanent.
function fejkpool(rader){
  const skrivningar=[];
  return {skrivningar,query:async(sql,params)=>{
    if(/^\s*SELECT/i.test(sql))return{rows:rader};
    skrivningar.push({sql,params});return{rows:[],rowCount:1};
  }};
}

test('en kompad rad gar att saga upp — utan Stripe, och utan att kasta',async()=>{
  const p=fejkpool([{stripe_subscription_id:null,current_period_end:null}]);
  const svar=await setCancellation(p,'w-1',true);
  assert.equal(svar.cancelAtPeriodEnd,true);
  assert.equal(p.skrivningar.length,1,'uppsagningen ska skrivas lokalt');
  assert.match(p.skrivningar[0].sql,/cancel_at_period_end/);
  assert.deepEqual(p.skrivningar[0].params,[true,'w-1']);
});

test('utan rad kastas 404 fortfarande — spärren far inte bli for bred',async()=>{
  const p=fejkpool([]);
  await assert.rejects(()=>setCancellation(p,'w-1',true),e=>e.status===404);
  assert.equal(p.skrivningar.length,0,'ingenting far skrivas nar det inte finns nagot abonnemang');
});

test('en riktig Stripe-rad gar fortfarande till Stripe',async()=>{
  // Utan STRIPE_SECRET_KEY kastar stripe() 503. Att felet ar 503 och inte ett tyst lokalt svar
  // BEVISAR att raden med ett stripe-id inte smiter forbi Stripe genom den nya lokala vagen — den
  // regressionen hade tyst slutat saga upp riktiga kunders abonnemang.
  const gammal=process.env.STRIPE_SECRET_KEY;delete process.env.STRIPE_SECRET_KEY;
  try{
    const p=fejkpool([{stripe_subscription_id:'sub_1ABC',current_period_end:null}]);
    await assert.rejects(()=>setCancellation(p,'w-1',true),e=>e.status===503);
    assert.equal(p.skrivningar.length,0);
  }finally{if(gammal!==undefined)process.env.STRIPE_SECRET_KEY=gammal}
});
test('premium expands the free quotas',()=>{assert.ok(PLANS.premium.overlays>PLANS.free.overlays);assert.ok(PLANS.premium.mediaBytes>PLANS.free.mediaBytes);assert.ok(PLANS.premium.widgets>PLANS.free.widgets)});
test('unknown Stripe prices never grant premium access',()=>{process.env.STRIPE_PRICE_MONTHLY='price_monthly_15usd';assert.equal(planFromPrice('price_monthly_15usd'),'premium');assert.equal(planFromPrice('price_attacker'),'free')});
