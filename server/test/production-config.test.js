'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{validateProductionEnv}=require('../production-config');
const crypto=require('crypto');

// A complete, valid configuration for either deployment. APP_ENV is a separate axis from NODE_ENV:
// staging and production BOTH run NODE_ENV=production, and APP_ENV only says which real deployment
// this is. Nothing here is relaxed for staging — the only differences are the PayPal mode and
// the object-storage isolation that staging additionally requires.
function good(appEnv='production'){
  const env={APP_ENV:appEnv,APP_ORIGIN:'https://app.vyra.test',DATABASE_URL:'postgresql://vyra:secret@db.vyra.test/vyra',DATABASE_SSL:'require',REDIS_URL:'rediss://redis.vyra.test:6380',APP_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64url'),TIKTOK_INGEST_TOKEN:'ing_'+crypto.randomUUID(),METRICS_TOKEN:'met_'+crypto.randomUUID(),MEDIA_SCAN_TOKEN:'scan_'+crypto.randomUUID(),OBJECT_ENDPOINT:'https://objects.vyra.test',CDN_ORIGIN:'https://cdn.vyra.test',OBJECT_ACCESS_KEY:'access_'+crypto.randomUUID(),OBJECT_SECRET_KEY:'object_'+crypto.randomUUID(),MEDIA_SCAN_REQUIRED:'true',PAYPAL_CLIENT_ID:'A'.repeat(20)+crypto.randomUUID().replace(/-/g,''),PAYPAL_CLIENT_SECRET:'E'.repeat(20)+crypto.randomUUID().replace(/-/g,''),PAYPAL_ENV:'live',PAYPAL_WEBHOOK_ID:'7VL31387MH8558935',PAYPAL_PLAN_MONTHLY:'P-1N359441EG117004VNKPKILY',PAYPAL_PLAN_MONTHLY_TRIAL:'P-7UY349153P1818424NKPKG2A',RESEND_API_KEY:'re_'+crypto.randomUUID(),EMAIL_FROM:'VYRA <billing@vyra.test>',ALERT_EMAIL_TO:'alerts@vyra.test',ALERT_WEBHOOK_URL:'https://alerts.vyra.test/hook',DESKTOP_DOWNLOAD_URL:'https://downloads.vyra.test/VYRA-Setup.exe',DESKTOP_VERSION:'1.0.0',DESKTOP_SHA256:'a'.repeat(64),DESKTOP_SIZE_BYTES:'2048'};
  if(appEnv==='staging'){
    env.PAYPAL_ENV='sandbox';
    env.OBJECT_KEY_PREFIX='staging/';
  }
  return env;
}
const fails=(env,pattern,note)=>assert.throws(()=>validateProductionEnv(env),pattern,note);

// ---- baseline ----------------------------------------------------------------------------------
test('complete production configuration passes',()=>assert.equal(validateProductionEnv(good()).ok,true));
test('complete staging configuration passes',()=>assert.equal(validateProductionEnv(good('staging')).ok,true));
test('the validated environment is reported back',()=>{
  assert.equal(validateProductionEnv(good('production')).appEnv,'production');
  assert.equal(validateProductionEnv(good('staging')).appEnv,'staging');
});

// ---- APP_ENV is required and closed ------------------------------------------------------------
test('APP_ENV must be present — it is never guessed',()=>{
  const env=good();delete env.APP_ENV;
  fails(env,/APP_ENV måste vara staging eller production/);
});
test('APP_ENV rejects anything outside the two real deployments',()=>{
  for(const value of ['dev','development','test','prod','local','']){
    const env=good();env.APP_ENV=value;
    fails(env,/APP_ENV måste vara/,`${JSON.stringify(value)} slapp igenom`);
  }
});
test('APP_ENV tolerates surrounding space and casing for the two valid values',()=>{
  const env=good();env.APP_ENV=' Production ';
  assert.equal(validateProductionEnv(env).appEnv,'production');
});

// ---- PayPal: refused in BOTH directions -------------------------------------------------------
test('production refuses PayPal sandbox',()=>{
  const env=good('production');env.PAYPAL_ENV='sandbox';
  fails(env,/sandbox men APP_ENV=production/);
});
test('staging refuses PayPal live',()=>{
  const env=good('staging');env.PAYPAL_ENV='live';
  fails(env,/live men APP_ENV=staging/);
});
test('neither environment accepts an unknown PayPal mode',()=>{
  for(const appEnv of ['production','staging']){
    const env=good(appEnv);env.PAYPAL_ENV='test';
    fails(env,appEnv==='production'?/måste vara live/:/måste vara sandbox/);
  }
});
test('weak PayPal credentials are rejected in both environments',()=>{
  for(const appEnv of ['production','staging']){
    const env=good(appEnv);env.PAYPAL_CLIENT_SECRET='x';
    fails(env,/PAYPAL_CLIENT_SECRET är för svag/,appEnv);
    const env2=good(appEnv);env2.PAYPAL_CLIENT_ID='change-me';
    fails(env2,/PAYPAL_CLIENT_ID är för svag/,appEnv);
  }
});
test("the webhook id is required and must look like PayPal's",()=>{
  for(const appEnv of ['production','staging']){
    const env=good(appEnv);env.PAYPAL_WEBHOOK_ID='whsec_'+crypto.randomUUID();
    fails(env,/PAYPAL_WEBHOOK_ID är ogiltigt/,appEnv);
  }
});
test('both plan ids are validated and must differ',()=>{
  for(const appEnv of ['production','staging']){
    const env=good(appEnv);env.PAYPAL_PLAN_MONTHLY='price_123';
    fails(env,/PAYPAL_PLAN_MONTHLY är ogiltigt/,appEnv);
    const env2=good(appEnv);env2.PAYPAL_PLAN_MONTHLY_TRIAL=env2.PAYPAL_PLAN_MONTHLY;
    fails(env2,/två olika planer/,appEnv);
  }
});

// ---- object storage: staging is STRICTER, never weaker -----------------------------------------
test('staging must isolate its object storage',()=>{
  const env=good('staging');delete env.OBJECT_KEY_PREFIX;delete env.OBJECT_BUCKET;
  fails(env,/kräver OBJECT_KEY_PREFIX/);
});
test('a separate bucket satisfies staging isolation too',()=>{
  const env=good('staging');delete env.OBJECT_KEY_PREFIX;env.OBJECT_BUCKET='vyra-media-staging';
  assert.equal(validateProductionEnv(env).ok,true);
});
test('production does not require a prefix — its keys must stay byte-for-byte unchanged',()=>{
  const env=good('production');delete env.OBJECT_KEY_PREFIX;delete env.OBJECT_BUCKET;
  assert.equal(validateProductionEnv(env).ok,true);
});

// ---- every pre-existing check still applies to BOTH --------------------------------------------
// The guard against this change quietly opening a weaker path for staging: if any of these ever
// stops firing under APP_ENV=staging, staging has become the soft way in.
const HARDENING=[
  ['APP_ORIGIN','http://localhost',/APP_ORIGIN/],
  ['DATABASE_URL','postgresql://vyra:secret@example.com/vyra',/DATABASE_URL/],
  ['DATABASE_SSL','',/DATABASE_SSL=require/],
  ['REDIS_URL','redis://redis.public.test:6379',/REDIS_URL/],
  ['APP_ENCRYPTION_KEY','short',/APP_ENCRYPTION_KEY/],
  ['TIKTOK_INGEST_TOKEN','change-me',/TIKTOK_INGEST_TOKEN/],
  ['MEDIA_SCAN_TOKEN','x',/MEDIA_SCAN_TOKEN/],
  ['OBJECT_ENDPOINT','http://objects.local',/OBJECT_ENDPOINT/],
  ['OBJECT_SECRET_KEY','x',/OBJECT_SECRET_KEY/],
  ['MEDIA_SCAN_REQUIRED','false',/MEDIA_SCAN_REQUIRED/],
  ['RESEND_API_KEY','sk_'+'x'.repeat(40),/RESEND_API_KEY/],
  ['EMAIL_FROM','VYRA <noreply@example.com>',/EMAIL_FROM/],
  ['ALERT_EMAIL_TO','not-an-email',/ALERT_EMAIL_TO/],
  ['DESKTOP_DOWNLOAD_URL','http://downloads.local/x.exe',/DESKTOP_DOWNLOAD_URL/],
  ['DESKTOP_VERSION','v1',/DESKTOP_VERSION/],
  ['DESKTOP_SHA256','abc',/DESKTOP_SHA256/],
  ['DESKTOP_SIZE_BYTES','10',/DESKTOP_SIZE_BYTES/]
];
for(const appEnv of ['production','staging']){
  test(`every hardening check still applies when APP_ENV=${appEnv}`,()=>{
    for(const [name,bad,pattern] of HARDENING){
      const env=good(appEnv);env[name]=bad;
      fails(env,pattern,`${name} slapp igenom i ${appEnv}`);
    }
  });
  test(`secrets must still be independent when APP_ENV=${appEnv}`,()=>{
    const env=good(appEnv);env.METRICS_TOKEN=env.TIKTOK_INGEST_TOKEN;
    fails(env,/unika/);
  });
}

// ---- the original assertions, kept -------------------------------------------------------------
test('weak secrets, test payments and HTTP are blocked',()=>{
  const env=good();env.APP_ORIGIN='http://localhost';env.TIKTOK_INGEST_TOKEN='short';env.PAYPAL_ENV='sandbox';
  assert.throws(()=>validateProductionEnv(env),
    error=>error.code==='VYRA_PRODUCTION_CONFIG'&&/APP_ORIGIN/.test(error.message)&&/TIKTOK/.test(error.message)&&/APP_ENV=production/.test(error.message));
});
test('secrets must be independent',()=>{
  const env=good();env.METRICS_TOKEN=env.TIKTOK_INGEST_TOKEN;
  assert.throws(()=>validateProductionEnv(env),/unika/);
});

// Store-lanken ar frivillig: utan den passerar konfigurationen som forut. Satt maste den vara
// Microsofts produktsida — en felskriven lank ar en blockerad deploy, inte en variant.
test('DESKTOP_STORE_URL ar frivillig men valideras nar den ar satt',()=>{
  assert.equal(validateProductionEnv({...good(),DESKTOP_STORE_URL:'https://apps.microsoft.com/detail/9PPKZN2SCJM2'}).ok,true);
  assert.equal(validateProductionEnv({...good(),DESKTOP_STORE_URL:''}).ok,true);
  fails({...good(),DESKTOP_STORE_URL:'https://example.com/detail/9PPKZN2SCJM2'},/DESKTOP_STORE_URL/);
  fails({...good(),DESKTOP_STORE_URL:'http://apps.microsoft.com/detail/9PPKZN2SCJM2'},/DESKTOP_STORE_URL/);
});
