'use strict';
const PLACEHOLDER=/example\.com|change-me|replace-with|localhost|127\.0\.0\.1/i;
function httpsUrl(value,name){let url;try{url=new URL(String(value||''));if(url.protocol!=='https:'||url.username||url.password||PLACEHOLDER.test(url.hostname))throw Error()}catch{throw new Error(`${name} måste vara en riktig HTTPS-adress`)}return url}
function secret(value,name,min=32){const raw=String(value||'');if(raw.length<min||PLACEHOLDER.test(raw)||/^(.)(\1)+$/.test(raw))throw new Error(`${name} är för svag eller saknas`);return raw}
function validateProductionEnv(env=process.env){
  const errors=[],check=fn=>{try{fn()}catch(error){errors.push(error.message)}};
  check(()=>httpsUrl(env.APP_ORIGIN,'APP_ORIGIN'));
  check(()=>{let url;try{url=new URL(String(env.DATABASE_URL||''))}catch{}if(!url||!/^postgres(ql)?:$/.test(url.protocol)||PLACEHOLDER.test(url.hostname)||env.DATABASE_SSL!=='require')throw new Error('DATABASE_URL måste vara extern och DATABASE_SSL=require')});
  check(()=>{let url;try{url=new URL(String(env.REDIS_URL||''))}catch{}if(!url||url.protocol!=='rediss:'||PLACEHOLDER.test(url.hostname))throw new Error('REDIS_URL måste vara en extern rediss://-adress')});
  ['APP_ENCRYPTION_KEY','TIKTOK_INGEST_TOKEN','METRICS_TOKEN','MEDIA_SCAN_TOKEN'].forEach(name=>check(()=>secret(env[name],name)));
  check(()=>{const values=['APP_ENCRYPTION_KEY','TIKTOK_INGEST_TOKEN','METRICS_TOKEN','MEDIA_SCAN_TOKEN'].map(name=>env[name]);if(new Set(values).size!==values.length)throw new Error('Produktionshemligheter måste vara unika')});
  check(()=>httpsUrl(env.OBJECT_ENDPOINT,'OBJECT_ENDPOINT'));check(()=>httpsUrl(env.CDN_ORIGIN,'CDN_ORIGIN'));
  check(()=>secret(env.OBJECT_ACCESS_KEY,'OBJECT_ACCESS_KEY',16));check(()=>secret(env.OBJECT_SECRET_KEY,'OBJECT_SECRET_KEY'));
  if(env.MEDIA_SCAN_REQUIRED!=='true')errors.push('MEDIA_SCAN_REQUIRED måste vara true');
  check(()=>secret(env.STRIPE_SECRET_KEY,'STRIPE_SECRET_KEY'));if(!String(env.STRIPE_SECRET_KEY||'').startsWith('sk_live_'))errors.push('STRIPE_SECRET_KEY måste vara en live-nyckel');
  check(()=>secret(env.STRIPE_WEBHOOK_SECRET,'STRIPE_WEBHOOK_SECRET'));if(!String(env.STRIPE_WEBHOOK_SECRET||'').startsWith('whsec_'))errors.push('STRIPE_WEBHOOK_SECRET är ogiltig');
  if(!/^price_[A-Za-z0-9]+$/.test(String(env.STRIPE_PRICE_MONTHLY||'')))errors.push('STRIPE_PRICE_MONTHLY är ogiltigt');
  check(()=>secret(env.RESEND_API_KEY,'RESEND_API_KEY'));if(!/^re_/.test(String(env.RESEND_API_KEY||'')))errors.push('RESEND_API_KEY är ogiltig');
  if(!/@(?!example\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}>?$/.test(String(env.EMAIL_FROM||'')))errors.push('EMAIL_FROM måste använda en verifierad domän');
  check(()=>httpsUrl(env.ALERT_WEBHOOK_URL,'ALERT_WEBHOOK_URL'));
  check(()=>httpsUrl(env.DESKTOP_DOWNLOAD_URL,'DESKTOP_DOWNLOAD_URL'));
  if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(env.DESKTOP_VERSION||'')))errors.push('DESKTOP_VERSION är ogiltig');
  if(!/^[a-f0-9]{64}$/.test(String(env.DESKTOP_SHA256||'')))errors.push('DESKTOP_SHA256 är ogiltig');
  if(!(Number(env.DESKTOP_SIZE_BYTES)>=1024))errors.push('DESKTOP_SIZE_BYTES är ogiltig');
  if(errors.length){const error=new Error(`Produktionskonfiguration blockerad:\n- ${errors.join('\n- ')}`);error.code='VYRA_PRODUCTION_CONFIG';throw error}
  return{ok:true,origin:new URL(env.APP_ORIGIN).origin};
}
module.exports={validateProductionEnv,httpsUrl,secret};
