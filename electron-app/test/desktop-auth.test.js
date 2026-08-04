'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
const studio=fs.readFileSync(path.join(__dirname,'..','..','studio.html'),'utf8');
const profile=fs.readFileSync(path.join(__dirname,'..','..','desktop-profile.js'),'utf8');

test('desktop requires the production account before opening local Studio',()=>{
  assert.match(source,/const CLOUD_ORIGIN = 'https:\/\/vyralive\.app'/);
  const login=source.indexOf('studio.html?desktop-auth=1');
  const local=source.indexOf('studio.html?desktop=1');
  assert.ok(login>=0,'remote login entry is missing');
  assert.ok(local>login,'local Studio must open only after the remote login gate');
  // Sonden hamtar bada endpointarna via en get()-hjalpare i stallet for tva raka fetch-anrop,
  // sa raderna matchar pa endpointen — det som faktiskt maste anropas — inte pa stavningen.
  assert.match(source,/'\/api\/auth\/me'/);
  assert.match(source,/\/billing'/);
  assert.match(source,/plan!=='premium'/);
  assert.match(source,/isPlatformAdmin/);
  // Lokala Studion far bara oppnas pa ett positivt utslag. Tidigare `if(account)`; sonden lamnar nu
  // ett skal aven vid avslag, sa grinden ar ok-flaggan och inte "sanningsvardet av nagot".
  assert.match(source,/if\(verdict&&verdict\.ok\)/);
  assert.match(source,/profile=/);
});

// Hela poangen med omskrivningen: ett avslag som aldrig loser sig sjalvt maste sagas hogt.
// Utan detta gick appen tillbaka till tyst pollning och anvandaren fick veta ingenting.
test('a blocking verdict stops the polling and explains itself',()=>{
  assert.match(source,/wait:true/,'inget lage ar markt som "vanta" — allt skulle bli terminalt');
  assert.match(source,/wait:false/,'inget lage ar markt som terminalt — allt skulle bli tyst vantan');
  assert.match(source,/reason:'not-premium'/,'saknad premium ar det vanligaste hindret och maste namnges');
  assert.match(source,/reason:'mfa'/,'MFA far inte se ut som utloggad');
  assert.match(source,/showMessageBox/,'anvandaren far ingen forklaring');
  assert.match(source,/entryReasonShown/,'rutan skulle visas en gang i sekunden');
});

test('Studio loads account security before cloud and payment features',()=>{
  const auth=studio.indexOf('auth-client.js');
  const entitlement=studio.indexOf('entitlement-gate.js');
  const cloud=studio.indexOf('cloud-sync.js');
  const billing=studio.indexOf('billing-client.js');
  assert.ok(auth>=0,'Studio must load the account gate');
  assert.ok(entitlement>auth,'subscription access must be checked after login');
  assert.ok(cloud>auth,'cloud sync must start after account security');
  assert.ok(billing>auth,'billing must start after account security');
  assert.match(profile,/displayName/);
  assert.match(profile,/Administratör · full åtkomst/);
});
