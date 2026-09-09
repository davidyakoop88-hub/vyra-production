'use strict';
// PROVPERIODEN FÖRBRUKAS VID AKTIVERINGEN, INTE NÄR CHECKOUTEN STARTAR.
//
// Det första skarpa PayPal-köpet 2026-09-09 (workspace c6439ecb) gick så här: checkout 19:43:59
// (provplanen, aldrig godkänd — kunden gick tillbaka), checkout igen 19:46:24, ACTIVATED 19:50:48
// och PAYMENT.SALE.COMPLETED en sekund senare. 15 USD drogs direkt och trial_end blev null, för att
// checkouten hade skrivit trial_started_at redan vid det FÖRSTA försöket. Erbjudandet lovar tre
// gratisdagar; varje kund som stänger PayPal-rutan och trycker igen hade fått samma sak.
//
// Proven här kör checkout() och webhook() på riktigt mot en fejkad pool och en fejkad fetch — så
// att det är SEKVENSEN som bevisas, inte en hjälpfunktion i isolering.
const test=require('node:test'),assert=require('node:assert/strict');
const {checkout,webhook}=require('../billing');

const HUVUDEN={'paypal-transmission-id':'t-1','paypal-transmission-time':'2026-09-09T19:50:48Z','paypal-cert-url':'https://api.paypal.com/v1/notifications/certs/CERT-1','paypal-auth-algo':'SHA256withRSA','paypal-transmission-sig':'sig'};
const MILJO={PAYPAL_CLIENT_ID:'id',PAYPAL_CLIENT_SECRET:'hemlig',PAYPAL_ENV:'sandbox',PAYPAL_PLAN_MONTHLY_TRIAL:'P-PROV',PAYPAL_PLAN_MONTHLY:'P-REGULJAR',PAYPAL_WEBHOOK_ID:'WH-1'};

// En pool som minns exakt det billing.js frågar efter: kundraden (trial_started_at) och
// abonnemangsraden (status). Allt annat skrivs igenom utan att kasta.
function fejkpool(){
  const st={kund:null,abonnemang:null,skapade:[]};
  async function query(sql,params=[]){
    const s=sql.replace(/\s+/g,' ');
    if(/^(BEGIN|COMMIT|ROLLBACK)/i.test(s))return{rows:[],rowCount:0};
    if(/INSERT INTO billing_customers/i.test(s)){if(!st.kund)st.kund={trial_started_at:null};return{rows:[],rowCount:1}}
    if(/UPDATE billing_customers SET trial_started_at=COALESCE/i.test(s)){if(st.kund&&!st.kund.trial_started_at)st.kund.trial_started_at=new Date();return{rows:[],rowCount:1}}
    if(/UPDATE billing_customers SET trial_started_at=now\(\)/i.test(s)){if(st.kund)st.kund.trial_started_at=new Date();return{rows:[],rowCount:1}}
    if(/SELECT trial_started_at FROM billing_customers/i.test(s))return{rows:st.kund?[st.kund]:[]};
    if(/SELECT status FROM subscriptions/i.test(s))return{rows:st.abonnemang?[{status:st.abonnemang.status}]:[]};
    if(/SELECT cancel_at_period_end FROM subscriptions/i.test(s))return{rows:st.abonnemang?[{cancel_at_period_end:false}]:[]};
    if(/SELECT workspace_id FROM subscriptions/i.test(s))return{rows:st.abonnemang?[{workspace_id:'w-1'}]:[]};
    if(/INSERT INTO subscriptions/i.test(s)){
      // checkout: (workspace,'paypal',subId,planId) → pending. upsertFromPaypal: (workspace,subId,planId,plan,status,…).
      const status=/'pending'/.test(s)?'pending':params[4];
      st.abonnemang={status,subId:params[1],planId:params[2]};st.skapade.push(st.abonnemang);return{rows:[],rowCount:1};
    }
    if(/INSERT INTO billing_events/i.test(s))return{rows:[{stripe_event_id:params[0]}],rowCount:1};
    return{rows:[],rowCount:1};
  }
  return{st,query,connect:async()=>({query,release(){}})};
}

// fetch som spelar PayPal: token, skapa abonnemang (och minns vilken PLAN som begärdes), verifiera webhook.
function fejkfetch(){
  const begarda=[];let n=0;
  const svar=data=>({ok:true,status:200,text:async()=>JSON.stringify(data),json:async()=>data});
  async function fetch(url,init={}){
    const u=String(url);
    if(u.endsWith('/v1/oauth2/token'))return svar({access_token:'tok',expires_in:3600});
    if(u.endsWith('/v1/billing/subscriptions')){const body=JSON.parse(init.body);begarda.push(body.plan_id);n++;return svar({id:`I-${n}`,status:'APPROVAL_PENDING',links:[{rel:'approve',href:`https://paypal.example/approve/${n}`}]})}
    if(u.endsWith('/v1/notifications/verify-webhook-signature'))return svar({verification_status:'SUCCESS'});
    throw new Error('oväntat anrop: '+u);
  }
  return{fetch,begarda};
}

function medMiljo(fn){
  return async()=>{
    const gammal={};for(const k of Object.keys(MILJO)){gammal[k]=process.env[k];process.env[k]=MILJO[k]}
    const gammalFetch=global.fetch;const f=fejkfetch();global.fetch=f.fetch;
    try{await fn(f)}finally{global.fetch=gammalFetch;for(const k of Object.keys(MILJO)){if(gammal[k]===undefined)delete process.env[k];else process.env[k]=gammal[k]}}
  };
}

// cycle_executions här är PayPals riktiga form (se VERKLIG_PROVAKTIVERING nedan), inte en gissning.
function aktiveradHandelse(id,{prov,subId='I-1'}){
  return JSON.stringify({id,event_type:'BILLING.SUBSCRIPTION.ACTIVATED',resource:{id:subId,custom_id:'w-1',plan_id:prov?'P-PROV':'P-REGULJAR',status:'ACTIVE',
    billing_info:{next_billing_time:'2026-09-12T10:00:00Z',cycle_executions:prov?[{tenure_type:'TRIAL',sequence:1,cycles_completed:1,cycles_remaining:0,total_cycles:1},{tenure_type:'REGULAR',sequence:2,cycles_completed:0,cycles_remaining:0,total_cycles:0}]:[{tenure_type:'REGULAR',sequence:1,cycles_completed:1,cycles_remaining:0,total_cycles:0}]}}});
}

test('ett avbrutet första försök bränner inte provet — andra checkouten får fortfarande provplanen',medMiljo(async f=>{
  const p=fejkpool(),arg={workspaceId:'w-1',email:'ny@example.com',name:'Ny kund',origin:'https://vyralive.app'};
  await checkout(p,arg);           // 19:43:59 — kunden stänger PayPal-rutan, inget aktiveras
  await checkout(p,arg);           // 19:46:24 — kunden trycker igen
  assert.deepEqual(f.begarda,['P-PROV','P-PROV'],'båda försöken ska begära provplanen hos PayPal');
  assert.equal(p.st.kund.trial_started_at,null,'inget har aktiverats, så provet är inte förbrukat');
}));

test('provet förbrukas när PayPal AKTIVERAR — och en kund som kommer tillbaka får den reguljära planen',medMiljo(async f=>{
  const p=fejkpool(),arg={workspaceId:'w-1',email:'ny@example.com',name:'Ny kund',origin:'https://vyralive.app'};
  await checkout(p,arg);
  assert.equal(p.st.kund.trial_started_at,null,'checkouten själv får inte sätta spärren');
  const ut=await webhook(p,aktiveradHandelse('WH-EVT-1',{prov:true}),HUVUDEN);
  assert.equal(ut.type,'BILLING.SUBSCRIPTION.ACTIVATED');
  assert.equal(p.st.abonnemang.status,'trialing');
  assert.ok(p.st.kund.trial_started_at instanceof Date,'aktiveringen ska sätta spärren');
  // Kunden säger upp, perioden går ut, kommer tillbaka: inget prov till.
  p.st.abonnemang={status:'canceled'};
  await checkout(p,arg);
  assert.deepEqual(f.begarda,['P-PROV','P-REGULJAR']);
}));

test('en aktivering UTAN prov förbrukar också provet — annars kan den som betalat fullt säga upp och hämta tre gratisdagar efteråt',medMiljo(async f=>{
  const p=fejkpool();
  p.st.kund={trial_started_at:null};p.st.abonnemang={status:'pending',subId:'I-1',planId:'P-REGULJAR'};
  await webhook(p,aktiveradHandelse('WH-EVT-2',{prov:false}),HUVUDEN);
  assert.equal(p.st.abonnemang.status,'active');
  assert.ok(p.st.kund.trial_started_at instanceof Date);
  p.st.abonnemang={status:'canceled'};
  await checkout(p,{workspaceId:'w-1',email:'x@example.com',name:'X',origin:'https://vyralive.app'});
  assert.deepEqual(f.begarda,['P-REGULJAR']);
}));

test('spärrens datum bevaras vid förnyelser — COALESCE, inte now()',medMiljo(async()=>{
  const p=fejkpool();
  const forsta=new Date('2026-09-01T00:00:00Z');
  p.st.kund={trial_started_at:forsta};p.st.abonnemang={status:'trialing',subId:'I-1',planId:'P-PROV'};
  await webhook(p,aktiveradHandelse('WH-EVT-3',{prov:false}),HUVUDEN);
  assert.equal(p.st.kund.trial_started_at,forsta);
}));

// ANDRA KÖPET 2026-09-09 21:36 (workspace b88d17ab, provplanen, inget drogs): PayPals ACTIVATED-
// nyttolast (avläst i utvecklarpanelen, händelse WH-4GU30990D79292050-1SN49004ES011905Y) bar
// TRIAL med cycles_completed 1 / cycles_remaining 0 och REGULAR med cycles_completed 0, och
// current_cycle_sequence 2. Regeln "TRIAL med cycles_remaining > 0" gav 'active' utan trial_end
// fast nästa dragning låg tre dagar fram. Fixturen nedan ÄR den nyttolasten, fältnamn för fältnamn.
const {prenumerationsfalt,localStatus}=require('../billing');
const VERKLIG_PROVAKTIVERING={plan_id:'P-7UY349153P1818424NKPKG2A',custom_id:'b88d17ab-6da5-44f6-bf93-9f8036f6b400',status:'ACTIVE',
  billing_info:{outstanding_balance:{currency_code:'USD',value:'0.0'},current_cycle_sequence:2,
    cycle_executions:[{tenure_type:'TRIAL',sequence:1,cycles_completed:1,cycles_remaining:0,current_pricing_scheme_version:1,total_cycles:1},
                      {tenure_type:'REGULAR',sequence:2,cycles_completed:0,cycles_remaining:0,current_pricing_scheme_version:1,total_cycles:0}],
    next_billing_time:'2026-09-12T10:00:00Z',failed_payments_count:0}};

test('PayPals riktiga aktivering av provplanen ÄR en provperiod: trialing, och trial_end = nästa dragning',()=>{
  const f=prenumerationsfalt(VERKLIG_PROVAKTIVERING);
  assert.equal(f.inTrial,true);
  assert.equal(localStatus(f,false),'trialing');
  assert.equal(f.trialEnd,Math.floor(Date.parse('2026-09-12T10:00:00Z')/1000));
  assert.equal(f.periodEnd,f.trialEnd,'under provperioden är periodens slut och provets slut samma tidpunkt');
});

test('den första reguljära dragningen avslutar provperioden',()=>{
  const efter={...VERKLIG_PROVAKTIVERING,billing_info:{...VERKLIG_PROVAKTIVERING.billing_info,
    cycle_executions:[VERKLIG_PROVAKTIVERING.billing_info.cycle_executions[0],{tenure_type:'REGULAR',sequence:2,cycles_completed:1,cycles_remaining:0,current_pricing_scheme_version:1,total_cycles:0}],
    next_billing_time:'2026-10-12T10:00:00Z'}};
  const f=prenumerationsfalt(efter);
  assert.equal(f.inTrial,false);
  assert.equal(localStatus(f,false),'active');
  assert.equal(f.trialEnd,null);
});

test('den reguljära planen (första köpet, I-VRMYASWS3R6L) har ingen provtenure och är active',()=>{
  const f=prenumerationsfalt({plan_id:'P-REGULJAR',status:'ACTIVE',billing_info:{cycle_executions:[{tenure_type:'REGULAR',sequence:1,cycles_completed:1,cycles_remaining:0,total_cycles:0}],next_billing_time:'2026-10-09T10:00:00Z'}});
  assert.equal(f.inTrial,false);assert.equal(f.trialEnd,null);assert.equal(localStatus(f,false),'active');
});

test('en flercyklig provperiod är prov tills den reguljära cykeln utförts — inte bara medan varv återstår',()=>{
  const mitt={plan_id:'P-PROV',status:'ACTIVE',billing_info:{cycle_executions:[{tenure_type:'TRIAL',sequence:1,cycles_completed:3,cycles_remaining:0,total_cycles:3},{tenure_type:'REGULAR',sequence:2,cycles_completed:0,cycles_remaining:0,total_cycles:0}],next_billing_time:'2026-09-30T10:00:00Z'}};
  assert.equal(prenumerationsfalt(mitt).inTrial,true);
});

test('utan cycle_executions alls är det inte en provperiod',()=>{
  const f=prenumerationsfalt({plan_id:'P-PROV',status:'ACTIVE',billing_info:{next_billing_time:'2026-09-12T10:00:00Z'}});
  assert.equal(f.inTrial,false);assert.equal(f.trialEnd,null);
});
