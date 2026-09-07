'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PLANS,planFromPlanId,setCancellation,localStatus,webhookHeaders}=require('../billing');

// EN KOMPAD RAD ÄR ETT AKTIVT ABONNEMANG, INTE ETT SAKNAT. Frågan hämtade leverantörs-id:t och
// kastade 404 så fort det saknades — vilket slog ihop "ingen rad finns" med "raden finns men har
// inget leverantörs-id". Det andra fallet gjorde att kontoborttagningen i index.js aldrig kom fram
// till `UPDATE users SET deletion_requested_at`, eftersom den säger upp aktiva abonnemang FÖRST.
// Kontot gick alltså aldrig att ta bort, och felet var permanent. Bevarat från Stripe-tiden;
// scripts/certifieringskonto.js skriver fortfarande sådana rader.
function fejkpool(rader){
  const skrivningar=[];
  return {skrivningar,query:async(sql,params)=>{
    if(/^\s*SELECT/i.test(sql))return{rows:rader};
    skrivningar.push({sql,params});return{rows:[],rowCount:1};
  }};
}

test('en kompad rad gar att saga upp — utan PayPal, och utan att kasta',async()=>{
  const p=fejkpool([{stripe_subscription_id:null,provider:'paypal',current_period_end:null}]);
  const svar=await setCancellation(p,'w-1',true);
  assert.equal(svar.cancelAtPeriodEnd,true);
  assert.equal(p.skrivningar.length,1,'uppsagningen ska skrivas lokalt, och ingen notis ska koas for en kompad rad');
  assert.match(p.skrivningar[0].sql,/cancel_at_period_end/);
  assert.deepEqual(p.skrivningar[0].params,[true,'w-1']);
});

test('utan rad kastas 404 fortfarande — spärren far inte bli for bred',async()=>{
  const p=fejkpool([]);
  await assert.rejects(()=>setCancellation(p,'w-1',true),e=>e.status===404);
  assert.equal(p.skrivningar.length,0,'ingenting far skrivas nar det inte finns nagot abonnemang');
});

test('en riktig PayPal-rad gar fortfarande till PayPal',async()=>{
  // Utan PAYPAL_CLIENT_ID kastar config() 503. Att felet ar 503 och inte ett tyst lokalt svar
  // BEVISAR att raden med ett leverantors-id inte smiter forbi PayPal genom den lokala vagen — den
  // regressionen hade tyst slutat saga upp riktiga kunders abonnemang.
  const gammal=process.env.PAYPAL_CLIENT_ID;delete process.env.PAYPAL_CLIENT_ID;
  try{
    const p=fejkpool([{stripe_subscription_id:'I-ABC123',provider:'paypal',current_period_end:null}]);
    await assert.rejects(()=>setCancellation(p,'w-1',true),e=>e.status===503);
    assert.equal(p.skrivningar.length,0);
  }finally{if(gammal!==undefined)process.env.PAYPAL_CLIENT_ID=gammal}
});

test('en gammal Stripe-rad far inte tyst sagas upp lokalt',async()=>{
  // Stripe-kontot aktiverades aldrig, sa raden ska inte finnas. Finns den anda ar det fel att
  // lata den se ut som uppsagd medan leverantoren fortsatter fakturera.
  const p=fejkpool([{stripe_subscription_id:'sub_1ABC',provider:'stripe',current_period_end:null}]);
  await assert.rejects(()=>setCancellation(p,'w-1',true),e=>e.status===503);
  assert.equal(p.skrivningar.length,0);
});

test('premium expands the free quotas',()=>{assert.ok(PLANS.premium.overlays>PLANS.free.overlays);assert.ok(PLANS.premium.mediaBytes>PLANS.free.mediaBytes);assert.ok(PLANS.premium.widgets>PLANS.free.widgets)});

test('bara vara egna tva planer ger premium',()=>{
  process.env.PAYPAL_PLAN_MONTHLY='P-REGULAR000000000000';process.env.PAYPAL_PLAN_MONTHLY_TRIAL='P-TRIAL00000000000000';
  assert.equal(planFromPlanId('P-REGULAR000000000000'),'premium');
  assert.equal(planFromPlanId('P-TRIAL00000000000000'),'premium');
  assert.equal(planFromPlanId('P-ATTACKER0000000000'),'free');
  assert.equal(planFromPlanId(null),'free');
});

// ---- statusoversattning: SUSPENDED ar tvetydigt ----------------------------------------------
test('SUSPENDED ar past_due nar PayPal gjorde det, men aktivt nar VI sa upp',()=>{
  const f={paypalStatus:'SUSPENDED',inTrial:false};
  assert.equal(localStatus(f,false),'past_due','PayPal pausar efter missad betalning — kunden maste uppdatera betalmetoden');
  assert.equal(localStatus(f,true),'active','var egen "Sag upp" ar en suspend hos PayPal — kunden behaller perioden ut');
  assert.equal(localStatus({paypalStatus:'SUSPENDED',inTrial:true},true),'trialing');
});
test('ACTIVE ar trialing under provperioden och active annars',()=>{
  assert.equal(localStatus({paypalStatus:'ACTIVE',inTrial:true},false),'trialing');
  assert.equal(localStatus({paypalStatus:'ACTIVE',inTrial:false},false),'active');
});
test('CANCELLED och EXPIRED stanger; vantande godkannande ar pending',()=>{
  assert.equal(localStatus({paypalStatus:'CANCELLED'},false),'canceled');
  assert.equal(localStatus({paypalStatus:'EXPIRED'},true),'canceled');
  assert.equal(localStatus({paypalStatus:'APPROVAL_PENDING'},false),'pending');
  assert.equal(localStatus({paypalStatus:''},false),'pending','okand status far aldrig bli premium');
});

// ---- webhook-huvuden: utan dem fragar vi inte ens PayPal ---------------------------------------
const HUVUDEN={'paypal-transmission-id':'t-1','paypal-transmission-time':'2026-09-07T10:00:00Z','paypal-cert-url':'https://api.paypal.com/v1/notifications/certs/CERT-1','paypal-auth-algo':'SHA256withRSA','paypal-transmission-sig':'sig'};
test('alla fem PayPal-huvuden kravs',()=>{
  const ut=webhookHeaders(HUVUDEN);
  assert.equal(ut.transmissionId,'t-1');assert.equal(ut.certUrl,HUVUDEN['paypal-cert-url']);
  for(const namn of Object.keys(HUVUDEN)){
    const utan={...HUVUDEN};delete utan[namn];
    assert.throws(()=>webhookHeaders(utan),e=>e.status===400&&e.message.includes(namn),`utan ${namn} ska det vara 400`);
  }
});
test('certifikatet maste komma fran PayPal — inte fran vem som helst som satter huvudena',()=>{
  assert.throws(()=>webhookHeaders({...HUVUDEN,'paypal-cert-url':'https://attacker.example/cert'}),e=>e.status===400);
  assert.doesNotThrow(()=>webhookHeaders({...HUVUDEN,'paypal-cert-url':'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-2'}));
});
