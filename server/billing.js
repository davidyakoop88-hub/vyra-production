'use strict';
// Betalning via PayPal Subscriptions. Ersatte Stripe 2026-09-07.
//
// VARFÖR PAYPAL: beslut 2026-09-07. PayPal-företagskonto som enskild näringsidkare, utan
// organisationsnummer, med billing@vyralive.app som handlaradress och PayPal-saldo som betalsätt för
// kunderna. Stripe-kontot hade tagit två riktiga betalningar (docs/lansering.md) — bytet är ett val,
// inte en nödlösning. PayPal Subscriptions bär samma modell som Stripe Checkout + webhook: kunden
// godkänner hos PayPal, PayPal berättar för oss vad som hände.
//
// FÖRE DEPLOY: den Stripe-prenumeration som finns i produktion (Davids workspace 8826f6d1) måste
// avslutas i Stripes instrumentpanel och raden kompas om (scripts/certifieringskonto.js) — annars
// fortsätter Stripe dra pengar medan webhooken nekas som "inte PayPal".
//
// VAD SOM ÄR OFÖRÄNDRAT UTÅT: de fem endpointsen i index.js (GET billing, POST checkout, portal,
// cancel, resume) och svarsformen som billing-client.js och entitlement-gate.js läser. Klienten
// vet inte vilken leverantör som ligger bakom, och ska inte veta det.
//
// KOLUMNNAMNEN I subscriptions HETER FORTFARANDE stripe_*. De bär nu PayPals id:n (provider='paypal').
// Att byta namn hade dragit in scripts/certifieringskonto-beslut.js, index.js och tre prov i andra
// domäner i samma ändring. Kolumnen `provider` säger sanningen; namnet är ett arv.
//
// INGEN SDK. PayPals REST-API är fyra anrop (token, skapa, hämta, verifiera) plus tre
// tillståndsbyten. `fetch` finns i Node ≥ 18. Ett npm-paket för det hade bara varit en till
// versionsdrift att vakta.
const PLANS={free:{overlays:0,widgets:0,mediaBytes:0,members:1},premium:{overlays:50,widgets:500,mediaBytes:50*1024**3,members:10}};
const API={live:'https://api-m.paypal.com',sandbox:'https://api-m.sandbox.paypal.com'};

function config(){
  const id=process.env.PAYPAL_CLIENT_ID,secret=process.env.PAYPAL_CLIENT_SECRET;
  if(!id||!secret)throw Object.assign(new Error('Betalningar är inte konfigurerade'),{status:503});
  const env=String(process.env.PAYPAL_ENV||'live').toLowerCase();
  if(!API[env])throw Object.assign(new Error('PAYPAL_ENV måste vara live eller sandbox'),{status:503});
  return{id,secret,base:API[env]};
}

// Tokenet lever ~9 timmar hos PayPal. Vi förnyar en minut i förväg och delar det över anrop.
let tokenCache={value:null,expiresAt:0};
async function accessToken(){
  const c=config();
  if(tokenCache.value&&tokenCache.expiresAt>Date.now())return tokenCache.value;
  const response=await fetch(`${c.base}/v1/oauth2/token`,{method:'POST',headers:{authorization:'Basic '+Buffer.from(`${c.id}:${c.secret}`).toString('base64'),'content-type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Object.assign(new Error(`PayPal nekade inloggningen (${response.status})`),{status:502});
  const data=await response.json();
  tokenCache={value:data.access_token,expiresAt:Date.now()+Math.max(60,Number(data.expires_in||0)-60)*1000};
  return tokenCache.value;
}

async function paypal(method,path,payload,extraHeaders={}){
  const c=config(),token=await accessToken();
  const response=await fetch(`${c.base}${path}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json',...extraHeaders},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  const text=await response.text();
  let data=null;try{data=text?JSON.parse(text):null}catch{data={raw:text}}
  if(!response.ok){
    const detail=data&&(data.message||data.name||data.error_description)||`HTTP ${response.status}`;
    throw Object.assign(new Error(`PayPal svarade: ${detail}`),{status:502,paypal:data});
  }
  return data;
}

// Två planer på samma produkt: en med 3 dagars gratis provperiod och en utan. Vilken kunden får
// avgörs LOKALT av billing_customers.trial_started_at — precis som förr med Stripe — så att en
// kund som sagt upp och kommer tillbaka inte får tre gratisdagar till.
function planIds(){return{trial:process.env.PAYPAL_PLAN_MONTHLY_TRIAL||'',regular:process.env.PAYPAL_PLAN_MONTHLY||''}}
function planFromPlanId(planId){const p=planIds();return planId&&(planId===p.trial||planId===p.regular)?'premium':'free'}

// Vad vi läser ur en PayPal-prenumeration. REN funktion, precis som Stripe-varianten var — så att den
// går att prova utan databas och utan signerad nyttolast.
//
// PayPal har inget current_period_end. Närmaste sanning är billing_info.next_billing_time: nästa
// dragning, alltså slutet på den period kunden redan betalat för. Under provperioden är det samma
// tidpunkt som provperiodens slut, och det är cycle_executions som säger om vi ÄR i provperioden.
//
// UPPMÄTT 2026-09-09 (webhooken BILLING.SUBSCRIPTION.ACTIVATED för I-BMF7N4NDC4L5, provplanen):
//   cycle_executions: [ {TRIAL, sequence 1, cycles_completed 1, cycles_remaining 0, total_cycles 1},
//                       {REGULAR, sequence 2, cycles_completed 0, cycles_remaining 0, total_cycles 0} ]
//   current_cycle_sequence: 2, next_billing_time: tre dagar fram, ingen PAYMENT.SALE.COMPLETED.
// PayPal räknar alltså provcykeln som UTFÖRD i samma ögonblick som abonnemanget aktiveras, och pekar
// redan på den reguljära cykeln som "nuvarande" — fast dragningen ligger tre dagar fram. Den gamla
// regeln "TRIAL med cycles_remaining > 0" matchade därför aldrig en provperiod på en cykel, och det
// riktiga provköpet lästes som 'active' utan trial_end. Regeln som stämmer med datan: det FINNS en
// provtenure, och ingen reguljär cykel har utförts än — den första riktiga dragningen är det som
// avslutar provperioden.
//
// null, inte 0, när vi inte vet. to_timestamp(0) är 1 januari 1970 och en nedräkning på det visar
// -20 500 dagar. Kolumnerna tillåter NULL.
function prenumerationsfalt(sub){
  const s=sub||{},info=s.billing_info||{},cycles=Array.isArray(info.cycle_executions)?info.cycle_executions:[];
  const epoch=v=>{const t=Date.parse(v||'');return Number.isFinite(t)&&t>0?Math.floor(t/1000):null};
  const nextBilling=epoch(info.next_billing_time);
  const n=v=>Number(v||0);
  const trial=cycles.find(c=>c&&c.tenure_type==='TRIAL'),regular=cycles.find(c=>c&&c.tenure_type==='REGULAR');
  const harProv=!!trial&&(n(trial.total_cycles)>0||n(trial.cycles_completed)>0||n(trial.cycles_remaining)>0);
  const inTrial=harProv&&!(regular&&n(regular.cycles_completed)>0);
  return{
    planId:s.plan_id||null,
    workspaceId:s.custom_id||null,
    periodEnd:nextBilling,
    trialEnd:inTrial?nextBilling:null,
    inTrial,
    paypalStatus:String(s.status||'').toUpperCase(),
  };
}

// PayPals statusord → de status klienten redan förstår ('active','trialing','past_due','canceled',
// 'pending'). SUSPENDED är tvetydigt: det är både vad PayPal gör efter en missad betalning och vad
// VI gör vid "Säg upp" (så att kunden behåller perioden ut och kan ångra sig). Lokalt
// cancel_at_period_end skiljer fallen åt.
function localStatus(fields,cancelAtPeriodEnd){
  switch(fields.paypalStatus){
    case 'ACTIVE':return fields.inTrial?'trialing':'active';
    case 'SUSPENDED':return cancelAtPeriodEnd?(fields.inTrial?'trialing':'active'):'past_due';
    case 'CANCELLED':case 'EXPIRED':return 'canceled';
    case 'APPROVAL_PENDING':case 'APPROVED':return 'pending';
    default:return 'pending';
  }
}

async function upsertFromPaypal(c,workspaceId,sub,{cancelAtPeriodEnd}={}){
  const f=prenumerationsfalt(sub);
  const existing=await c.query('SELECT cancel_at_period_end FROM subscriptions WHERE workspace_id=$1',[workspaceId]);
  const cape=cancelAtPeriodEnd!==undefined?!!cancelAtPeriodEnd:!!existing.rows[0]?.cancel_at_period_end;
  const status=localStatus(f,cape);
  await c.query("INSERT INTO subscriptions(workspace_id,provider,stripe_subscription_id,stripe_price_id,plan,status,current_period_end,trial_end,cancel_at_period_end,updated_at) VALUES($1,'paypal',$2,$3,$4,$5,to_timestamp($6),to_timestamp($7),$8,now()) ON CONFLICT(workspace_id) DO UPDATE SET provider='paypal',stripe_subscription_id=EXCLUDED.stripe_subscription_id,stripe_price_id=EXCLUDED.stripe_price_id,plan=EXCLUDED.plan,status=EXCLUDED.status,current_period_end=COALESCE(EXCLUDED.current_period_end,subscriptions.current_period_end),trial_end=EXCLUDED.trial_end,cancel_at_period_end=EXCLUDED.cancel_at_period_end,updated_at=now()",
    [workspaceId,sub.id,f.planId,status==='canceled'?'free':planFromPlanId(f.planId),status,f.periodEnd,f.trialEnd,status==='canceled'?false:cape]);
  // Gratisperioden är förbrukad först när Premium FAKTISKT blivit aktivt — oavsett om det skedde
  // via provplanen eller den reguljära. COALESCE bevarar det första datumet vid förnyelser.
  if(status==='active'||status==='trialing'){
    await c.query('INSERT INTO billing_customers(workspace_id) VALUES($1) ON CONFLICT(workspace_id) DO NOTHING',[workspaceId]);
    await c.query('UPDATE billing_customers SET trial_started_at=COALESCE(trial_started_at,now()) WHERE workspace_id=$1',[workspaceId]);
  }
  glomOverlayPlan(workspaceId);
  return{status,fields:f};
}

// PLANEN FÖR EN PUBLIK VÄG (OBS-länken).
//
// entitlement() nedan får ha sidoeffekter: den hämtar från PayPal när raden är 'pending' och
// stänger prenumerationen när en uppsägning löpt ut. Ingetdera hör hemma på en väg som en OBS-källa
// träffar vid varje omkoppling — ett PayPal-anrop i den kedjan gör en overlay långsam av skäl som
// inte har med overlayen att göra.
//
// Den här läser bara raden, tillämpar samma regel om utlöpt uppsägning, och cachar en minut.
// Cachen töms när abonnemanget ändras (upsertFromPaypal, setCancellation), så en uppsägning
// slår igenom direkt och inte om en minut.
const OVERLAY_PLAN_TTL=60000;
const overlayPlanCache=new Map();
function glomOverlayPlan(workspaceId){overlayPlanCache.delete(workspaceId)}
async function overlayPlan(pool,workspaceId){
  const nu=Date.now(),cachad=overlayPlanCache.get(workspaceId);
  if(cachad&&nu-cachad.at<OVERLAY_PLAN_TTL)return cachad.plan;
  const q=await pool.query("SELECT plan,status,current_period_end,cancel_at_period_end FROM subscriptions WHERE workspace_id=$1",[workspaceId]),sub=q.rows[0];
  const utlopt=!!(sub&&sub.cancel_at_period_end&&sub.current_period_end&&new Date(sub.current_period_end).getTime()<nu);
  const aktiv=!!(sub&&['active','trialing','past_due'].includes(sub.status))&&!utlopt;
  const plan=aktiv&&sub.plan&&PLANS[sub.plan]?sub.plan:'free';
  overlayPlanCache.set(workspaceId,{at:nu,plan});
  return plan;
}

// Läser BARA tabellen — utom i två lägen där tabellen inte kan veta bättre själv:
//   1. Raden är 'pending': kunden har kommit tillbaka från PayPal före webhooken. Ett anrop till
//      PayPal avgör om godkännandet gick igenom, så att välkomstskärmen inte visar "Inget aktivt
//      abonnemang" i de sekunder webhooken är på väg.
//   2. Raden är uppsagd och perioden har passerat: då är Premium slut, oavsett vad PayPal hunnit
//      säga. Vi stänger lokalt och ber PayPal avsluta på riktigt (best effort).
async function entitlement(pool,workspaceId){
  let q=await pool.query("SELECT plan,status,current_period_end,trial_end,cancel_at_period_end,stripe_subscription_id,provider FROM subscriptions WHERE workspace_id=$1",[workspaceId]);
  let sub=q.rows[0];
  if(sub&&sub.status==='pending'&&sub.provider==='paypal'&&sub.stripe_subscription_id){
    try{const remote=await paypal('GET',`/v1/billing/subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}`);await upsertFromPaypal(pool,workspaceId,remote);q=await pool.query("SELECT plan,status,current_period_end,trial_end,cancel_at_period_end,stripe_subscription_id,provider FROM subscriptions WHERE workspace_id=$1",[workspaceId]);sub=q.rows[0]}catch(error){console.error(JSON.stringify({level:'warn',event:'billing_pending_sync_failed',workspaceId,message:error.message,at:new Date().toISOString()}))}
  }
  if(sub&&sub.cancel_at_period_end&&sub.current_period_end&&new Date(sub.current_period_end).getTime()<Date.now()&&['active','trialing','past_due'].includes(sub.status)){
    await pool.query("UPDATE subscriptions SET status='canceled',plan='free',updated_at=now() WHERE workspace_id=$1",[workspaceId]);
    if(sub.provider==='paypal'&&sub.stripe_subscription_id)paypal('POST',`/v1/billing/subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}/cancel`,{reason:'Uppsagt av kunden, perioden har löpt ut'}).catch(()=>{});
    sub={...sub,status:'canceled',plan:'free'};
  }
  const active=sub&&['active','trialing','past_due'].includes(sub.status);
  const plan=active&&sub.plan&&PLANS[sub.plan]?sub.plan:'free';
  const visible=active?{plan:sub.plan,status:sub.status,current_period_end:sub.current_period_end,trial_end:sub.trial_end,cancel_at_period_end:sub.cancel_at_period_end}:null;
  return{plan,limits:PLANS[plan],subscription:visible};
}

async function usage(pool,workspaceId){const q=await pool.query("SELECT (SELECT count(*)::int FROM overlays WHERE workspace_id=$1) overlays,(SELECT count(*)::int FROM workspace_members WHERE workspace_id=$1) members,(SELECT COALESCE(sum(size_bytes),0)::bigint FROM media_assets WHERE workspace_id=$1 AND status NOT IN ('deleted')) media_bytes",[workspaceId]);return{overlays:q.rows[0].overlays,members:q.rows[0].members,mediaBytes:Number(q.rows[0].media_bytes)}}

// PayPal har inget kundobjekt att skapa i förväg. billing_customers finns kvar för EN sak:
// trial_started_at, spärren mot en andra gratisperiod.
//
// SPÄRREN SÄTTS VID AKTIVERINGEN, INTE HÄR. Fram till 2026-09-09 skrevs trial_started_at redan när
// checkouten STARTADE, så en kund som stängde PayPal-rutan och tryckte igen räknades som förbrukad
// och fick den reguljära planen — 15 USD drogs direkt trots löftet om tre gratisdagar. Det var
// exakt det som hände i det första skarpa köpet (workspace c6439ecb: checkout 19:43, avbrott,
// checkout 19:46, PAYMENT.SALE.COMPLETED). Nu läser checkouten bara spärren; det är
// upsertFromPaypal som sätter den, när PayPal säger att abonnemanget är aktivt.
async function checkout(pool,{workspaceId,email,name,origin}){
  const plans=planIds();
  if(!plans.trial||!plans.regular)throw Object.assign(new Error('Abonnemangsplanerna saknas i serverkonfigurationen'),{status:503});
  const current=await pool.query("SELECT status FROM subscriptions WHERE workspace_id=$1",[workspaceId]);
  if(current.rows[0]&&['active','trialing','past_due'].includes(current.rows[0].status))throw Object.assign(new Error('Premium är redan aktivt'),{status:409});
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    await c.query('INSERT INTO billing_customers(workspace_id) VALUES($1) ON CONFLICT(workspace_id) DO NOTHING',[workspaceId]);
    const q=await c.query('SELECT trial_started_at FROM billing_customers WHERE workspace_id=$1 FOR UPDATE',[workspaceId]),trialEligible=!q.rows[0]?.trial_started_at;
    const planId=trialEligible?plans.trial:plans.regular;
    const sub=await paypal('POST','/v1/billing/subscriptions',{
      plan_id:planId,
      custom_id:workspaceId,
      subscriber:{email_address:email||undefined,name:name?{given_name:String(name).slice(0,140)}:undefined},
      application_context:{brand_name:'VYRA',locale:'sv-SE',user_action:'SUBSCRIBE_NOW',shipping_preference:'NO_SHIPPING',return_url:`${origin}/studio.html?billing=success`,cancel_url:`${origin}/studio.html?billing=cancelled`},
    },{'PayPal-Request-Id':`vyra-sub-${workspaceId}-${Math.floor(Date.now()/300000)}`});
    const approve=(sub.links||[]).find(l=>l.rel==='approve')?.href;
    if(!sub.id||!approve)throw Object.assign(new Error('PayPal gav ingen godkännandelänk'),{status:502});
    await c.query("INSERT INTO subscriptions(workspace_id,provider,stripe_subscription_id,stripe_price_id,plan,status,cancel_at_period_end,updated_at) VALUES($1,'paypal',$2,$3,'free','pending',false,now()) ON CONFLICT(workspace_id) DO UPDATE SET provider='paypal',stripe_subscription_id=EXCLUDED.stripe_subscription_id,stripe_price_id=EXCLUDED.stripe_price_id,plan='free',status='pending',current_period_end=NULL,trial_end=NULL,cancel_at_period_end=false,updated_at=now()",[workspaceId,sub.id,planId]);
    await c.query('COMMIT');
    return approve;
  }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
}

// PayPal har ingen kundportal som Stripe. Kundens egen sida för automatiska betalningar är
// närmast: där ser hen VYRA-abonnemanget, kvittona och kan byta betalmetod.
async function portal(pool,workspaceId){
  const q=await pool.query('SELECT stripe_subscription_id FROM subscriptions WHERE workspace_id=$1',[workspaceId]);
  if(!q.rows[0]?.stripe_subscription_id)throw Object.assign(new Error('Ingen betalningsprofil finns'),{status:404});
  return 'https://www.paypal.com/myaccount/autopay/';
}

async function queueNotification(c,workspaceId,template,dedupeKey,payload={}){
  await c.query("INSERT INTO notification_outbox(workspace_id,recipient,template,payload,dedupe_key) SELECT w.id,u.email,$2,$3,$4 FROM workspaces w JOIN users u ON u.id=w.owner_user_id WHERE w.id=$1 ON CONFLICT(dedupe_key) DO NOTHING",[workspaceId,template,payload,dedupeKey]);
}

// TVÅ OLIKA LÄGEN SOM BÅDA SÅG UT SOM 404 (bevarat från Stripe-tiden): "ingen rad" är 404, "rad utan
// leverantörs-id" är en KOMPAD plan (scripts/certifieringskonto.js) och sägs upp lokalt. Att kasta
// där gjorde kontoborttagningen omöjlig, eftersom index.js säger upp aktiva abonnemang först.
//
// "Säg upp" = suspend hos PayPal, inte cancel. Suspend stoppar dragningarna men går att ångra
// (activate); cancel är slutgiltigt hos PayPal. Perioden kunden betalat för löper ut lokalt via
// cancel_at_period_end + current_period_end, och entitlement() stänger dörren när den passerat.
async function setCancellation(pool,workspaceId,cancel){
  const q=await pool.query("SELECT stripe_subscription_id,provider,current_period_end FROM subscriptions WHERE workspace_id=$1 AND status IN ('active','trialing','past_due')",[workspaceId]),rad=q.rows[0];
  if(!rad)throw Object.assign(new Error('Inget aktivt abonnemang finns'),{status:404});
  if(rad.stripe_subscription_id&&rad.provider==='paypal'){
    const id=encodeURIComponent(rad.stripe_subscription_id);
    await paypal('POST',`/v1/billing/subscriptions/${id}/${cancel?'suspend':'activate'}`,{reason:cancel?'Uppsagt av kunden i VYRA':'Uppsägningen ångrad av kunden i VYRA'});
  }else if(rad.stripe_subscription_id){
    // En Stripe-rad från tiden före bytet. Den ska vara avslutad i Stripe och omkompad före
    // deploy (se filhuvudet) — men om en finns kvar får den inte tyst smita förbi leverantören.
    throw Object.assign(new Error('Abonnemanget hanteras av en leverantör som inte längre är konfigurerad'),{status:503});
  }
  await pool.query('UPDATE subscriptions SET cancel_at_period_end=$1,updated_at=now() WHERE workspace_id=$2',[!!cancel,workspaceId]);
  if(rad.stripe_subscription_id)await queueNotification(pool,workspaceId,cancel?'cancellation_scheduled':'cancellation_reversed',`${rad.stripe_subscription_id}:${cancel?'cancel':'resume'}:${Math.floor(Date.now()/60000)}`).catch(()=>{});
  glomOverlayPlan(workspaceId);
  return{cancelAtPeriodEnd:!!cancel,currentPeriodEnd:rad.current_period_end||null};
}

// De fem huvuden PayPal signerar med. Saknas ett är det inte en PayPal-webhook, och då ska vi
// inte ens fråga PayPal. REN funktion — provbar utan nätverk.
const WEBHOOK_HEADERS={transmissionId:'paypal-transmission-id',transmissionTime:'paypal-transmission-time',certUrl:'paypal-cert-url',authAlgo:'paypal-auth-algo',transmissionSig:'paypal-transmission-sig'};
function webhookHeaders(headers){
  const h=headers||{},out={};
  for(const[key,name]of Object.entries(WEBHOOK_HEADERS)){const v=h[name];if(typeof v!=='string'||!v.trim())throw Object.assign(new Error(`Webhook saknar ${name}`),{status:400});out[key]=v.trim()}
  if(!/^https:\/\/api\.paypal\.com\//.test(out.certUrl)&&!/^https:\/\/api\.sandbox\.paypal\.com\//.test(out.certUrl))throw Object.assign(new Error('Webhookens certifikat kommer inte från PayPal'),{status:400});
  return out;
}

async function verifyWebhook(headers,rawBody){
  const h=webhookHeaders(headers),webhookId=process.env.PAYPAL_WEBHOOK_ID;
  if(!webhookId)throw Object.assign(new Error('PAYPAL_WEBHOOK_ID saknas'),{status:503});
  let event;try{event=JSON.parse(String(rawBody))}catch{throw Object.assign(new Error('Webhooken är inte JSON'),{status:400})}
  const result=await paypal('POST','/v1/notifications/verify-webhook-signature',{auth_algo:h.authAlgo,cert_url:h.certUrl,transmission_id:h.transmissionId,transmission_sig:h.transmissionSig,transmission_time:h.transmissionTime,webhook_id:webhookId,webhook_event:event});
  if(result?.verification_status!=='SUCCESS')throw Object.assign(new Error('Webhookens signatur gick inte att verifiera'),{status:400});
  return event;
}

async function workspaceForSubscription(c,subscriptionId){
  if(!subscriptionId)return null;
  const q=await c.query('SELECT workspace_id FROM subscriptions WHERE stripe_subscription_id=$1',[String(subscriptionId)]);
  return q.rows[0]?.workspace_id||null;
}

// index.js skickar hela req.headers; Stripe-tiden skickade ett enda huvud. Signaturen
// (pool, raw, headers) är därför den enda ändringen i index.js.
async function webhook(pool,raw,headers){
  const event=await verifyWebhook(headers,raw),c=await pool.connect();
  try{
    await c.query('BEGIN');
    const inserted=await c.query('INSERT INTO billing_events(stripe_event_id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING stripe_event_id',[event.id,event.event_type]);
    if(!inserted.rowCount){await c.query('COMMIT');return{duplicate:true,type:event.event_type}}
    const type=String(event.event_type||''),resource=event.resource||{};
    let workspaceId=null;
    if(type.startsWith('BILLING.SUBSCRIPTION.')){
      workspaceId=resource.custom_id||await workspaceForSubscription(c,resource.id);
      if(workspaceId&&resource.id){
        const{status,fields}=await upsertFromPaypal(c,workspaceId,resource,type==='BILLING.SUBSCRIPTION.RE-ACTIVATED'?{cancelAtPeriodEnd:false}:{});
        if(type==='BILLING.SUBSCRIPTION.ACTIVATED'&&fields.inTrial)await queueNotification(c,workspaceId,'trial_started',`${event.id}:trial_started`,{paypalEventId:event.id});
        if(type==='BILLING.SUBSCRIPTION.PAYMENT.FAILED')await queueNotification(c,workspaceId,'payment_failed',`${event.id}:payment_failed`,{paypalEventId:event.id});
        if(status==='canceled')await queueNotification(c,workspaceId,'subscription_ended',`${event.id}:subscription_ended`,{paypalEventId:event.id});
      }
    }else if(type==='PAYMENT.SALE.COMPLETED'){
      workspaceId=await workspaceForSubscription(c,resource.billing_agreement_id);
      const amount=Number(resource.amount?.total||0);
      if(workspaceId&&amount>0)await queueNotification(c,workspaceId,'payment_success',`${event.id}:payment_success`,{paypalEventId:event.id,amount});
    }
    await c.query('COMMIT');
    return{duplicate:false,type};
  }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
}

module.exports={PLANS,entitlement,usage,checkout,portal,setCancellation,webhook,planFromPlanId,prenumerationsfalt,localStatus,webhookHeaders,overlayPlan,glomOverlayPlan};
