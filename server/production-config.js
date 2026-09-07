'use strict';
const Nyckelformat=require('./krypteringsnyckel');
const PLACEHOLDER=/example\.com|change-me|replace-with|localhost|127\.0\.0\.1/i;
function httpsUrl(value,name){let url;try{url=new URL(String(value||''));if(url.protocol!=='https:'||url.username||url.password||PLACEHOLDER.test(url.hostname))throw Error()}catch{throw new Error(`${name} måste vara en riktig HTTPS-adress`)}return url}
function secret(value,name,min=32){const raw=String(value||'');if(raw.length<min||PLACEHOLDER.test(raw)||/^(.)(\1)+$/.test(raw))throw new Error(`${name} är för svag eller saknas`);return raw}
// APP_ENV is a SEPARATE axis from NODE_ENV. Both staging and production run NODE_ENV=production —
// that is what turns on every hardening path in the stack — and APP_ENV only says WHICH real
// deployment this is. Keeping them separate is deliberate: a staging box must not become a
// development box just because it needs test payment keys.
//
// It is required, never defaulted. A missing APP_ENV fails loudly rather than guessing, because
// both guesses are bad: default to production and a staging deploy demands live keys; default to
// staging and a production deploy would happily accept test keys and take real customers' money
// nowhere.
//
// Nothing below is RELAXED for staging. Every secret, URL and token check applies identically in
// both; staging is strictly not weaker, and in one respect stricter (OBJECT_KEY_PREFIX).
const APP_ENVS=['staging','production'];
function appEnvOf(env){
  const value=String(env.APP_ENV||'').trim().toLowerCase();
  if(!APP_ENVS.includes(value))throw new Error(`APP_ENV måste vara ${APP_ENVS.join(' eller ')} (fick ${JSON.stringify(env.APP_ENV||'')})`);
  return value;
}
function validateProductionEnv(env=process.env){
  const errors=[],check=fn=>{try{fn()}catch(error){errors.push(error.message)}};
  let appEnv=null;
  check(()=>{appEnv=appEnvOf(env)});
  check(()=>httpsUrl(env.APP_ORIGIN,'APP_ORIGIN'));
  check(() => {
  let url;

  try {
    url = new URL(String(env.DATABASE_URL || ''));
  } catch {}

  if (
    !url ||
    !/^postgres(ql)?:$/.test(url.protocol) ||
    PLACEHOLDER.test(url.hostname)
  ) {
    throw new Error('DATABASE_URL är ogiltig');
  }

  const privateRailway =
    /\.railway\.internal$/i.test(url.hostname);

  if (!privateRailway && env.DATABASE_SSL !== 'require') {
    throw new Error(
      'Extern DATABASE_URL kräver DATABASE_SSL=require'
    );
  }
});
  check(()=>{let url;try{url=new URL(String(env.REDIS_URL||''))}catch{}const privateRailway=url&&url.protocol==='redis:'&&/\.railway\.internal$/i.test(url.hostname);if(!url||(!privateRailway&&url.protocol!=='rediss:')||PLACEHOLDER.test(url.hostname))throw new Error('REDIS_URL måste vara rediss:// eller privat Railway redis://')});
  ['APP_ENCRYPTION_KEY','TIKTOK_INGEST_TOKEN','METRICS_TOKEN','MEDIA_SCAN_TOKEN'].forEach(name=>check(()=>secret(env[name],name)));
  // APP_ENCRYPTION_KEY har ETT KRAV TILL, och det ar hardare: exakt 32 bytes kanonisk base64url.
  // secret() ovan kraver bara 32 TECKEN, och glappet mellan de tva var tyst — en nyckel som klarade
  // secret() men inte formen lat servern starta och se frisk ut, medan token-vault kastade forst vid
  // anvandning (MFA) och heart-me-goal.js rakade NOLL i tysthet. Bada kontrollerna behovs: den har
  // sager INGENTING om platshallare eller upprepade tecken, och 43 likadana tecken ar en kanonisk
  // nyckel men en usel hemlighet.
  check(()=>{ if(!Nyckelformat.arGiltig(env.APP_ENCRYPTION_KEY)) throw new Error(`APP_ENCRYPTION_KEY ${Nyckelformat.KRAV}`) });
  check(()=>{const values=['APP_ENCRYPTION_KEY','TIKTOK_INGEST_TOKEN','METRICS_TOKEN','MEDIA_SCAN_TOKEN'].map(name=>env[name]);if(new Set(values).size!==values.length)throw new Error('Produktionshemligheter måste vara unika')});
  check(()=>httpsUrl(env.OBJECT_ENDPOINT,'OBJECT_ENDPOINT'));if(env.CDN_ORIGIN)check(()=>httpsUrl(env.CDN_ORIGIN,'CDN_ORIGIN'));
  check(()=>secret(env.OBJECT_ACCESS_KEY,'OBJECT_ACCESS_KEY',16));check(()=>secret(env.OBJECT_SECRET_KEY,'OBJECT_SECRET_KEY'));
  if(env.MEDIA_SCAN_REQUIRED!=='true')errors.push('MEDIA_SCAN_REQUIRED måste vara true');
  // Stricter on staging than on production, on purpose: staging must never be able to write into
  // production's object namespace. A prefix isolates it even when the bucket is shared, and setting
  // a separate OBJECT_BUCKET satisfies it too.
  if(appEnv==='staging'&&!String(env.OBJECT_KEY_PREFIX||'').trim()&&!String(env.OBJECT_BUCKET||'').trim())
    errors.push('APP_ENV=staging kräver OBJECT_KEY_PREFIX (t.ex. staging/) eller en egen OBJECT_BUCKET, så stagingfiler aldrig hamnar bland produktionens');
  // PayPal (ersatte Stripe 2026-09-07). Samma princip som förr, nekat i BÅDA riktningarna: sandbox i
  // produktion tar inga pengar alls och ser ut att fungera; live på staging drar riktiga pengar från
  // en testlåda. PAYPAL_ENV är därför bunden till APP_ENV, inte bara "måste vara ett giltigt värde".
  check(()=>secret(env.PAYPAL_CLIENT_ID,'PAYPAL_CLIENT_ID'));
  check(()=>secret(env.PAYPAL_CLIENT_SECRET,'PAYPAL_CLIENT_SECRET'));
  {const mode=String(env.PAYPAL_ENV||'').trim().toLowerCase();
   if(appEnv==='production'){
     if(mode==='sandbox')errors.push('PAYPAL_ENV är sandbox men APP_ENV=production — produktion får inte köra PayPal i sandbox');
     else if(mode!=='live')errors.push('PAYPAL_ENV måste vara live när APP_ENV=production');
   }else if(appEnv==='staging'){
     if(mode==='live')errors.push('PAYPAL_ENV är live men APP_ENV=staging — staging får aldrig röra riktiga betalningar');
     else if(mode!=='sandbox')errors.push('PAYPAL_ENV måste vara sandbox när APP_ENV=staging');
   }}
  // Webhook-id:t är det PayPal själva verifierar varje leverans mot; utan det tas ingen händelse emot.
  if(!/^[0-9A-Z]{17}$/.test(String(env.PAYPAL_WEBHOOK_ID||'')))errors.push('PAYPAL_WEBHOOK_ID är ogiltigt');
  // Två planer på samma produkt: med och utan 3 dagars provperiod. Samma id på båda hade gett
  // varje återkommande kund en ny gratisperiod — eller ingen kund någon.
  for(const name of ['PAYPAL_PLAN_MONTHLY','PAYPAL_PLAN_MONTHLY_TRIAL'])if(!/^P-[A-Z0-9]{20,}$/.test(String(env[name]||'')))errors.push(`${name} är ogiltigt`);
  if(env.PAYPAL_PLAN_MONTHLY&&env.PAYPAL_PLAN_MONTHLY===env.PAYPAL_PLAN_MONTHLY_TRIAL)errors.push('PAYPAL_PLAN_MONTHLY och PAYPAL_PLAN_MONTHLY_TRIAL måste vara två olika planer');
  check(()=>secret(env.RESEND_API_KEY,'RESEND_API_KEY'));if(!/^re_/.test(String(env.RESEND_API_KEY||'')))errors.push('RESEND_API_KEY är ogiltig');
  if(!/@(?!example\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}>?$/.test(String(env.EMAIL_FROM||'')))errors.push('EMAIL_FROM måste använda en verifierad domän');
  if(env.ALERT_WEBHOOK_URL)check(()=>httpsUrl(env.ALERT_WEBHOOK_URL,'ALERT_WEBHOOK_URL'));
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(env.ALERT_EMAIL_TO||'')))errors.push('ALERT_EMAIL_TO är ogiltig');
  check(()=>httpsUrl(env.DESKTOP_DOWNLOAD_URL,'DESKTOP_DOWNLOAD_URL'));
  // Frivillig, men satt ska den vara Microsofts produktsida — samma regel som vid körning, sa en
  // felskriven butikslank stoppar deployen i stallet for att skickas ut till alla anvandare.
  if(String(env.DESKTOP_STORE_URL||'').trim())check(()=>require('./desktop-release').storeUrl(env.DESKTOP_STORE_URL));
  if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(env.DESKTOP_VERSION||'')))errors.push('DESKTOP_VERSION är ogiltig');
  if(!/^[a-f0-9]{64}$/.test(String(env.DESKTOP_SHA256||'')))errors.push('DESKTOP_SHA256 är ogiltig');
  if(!(Number(env.DESKTOP_SIZE_BYTES)>=1024))errors.push('DESKTOP_SIZE_BYTES är ogiltig');
  if(errors.length){const error=new Error(`Produktionskonfiguration blockerad:\n- ${errors.join('\n- ')}`);error.code='VYRA_PRODUCTION_CONFIG';throw error}
  return{ok:true,appEnv,origin:new URL(env.APP_ORIGIN).origin};
}
module.exports={validateProductionEnv,httpsUrl,secret,appEnvOf,APP_ENVS};
