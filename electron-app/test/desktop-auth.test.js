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
  assert.match(source,/fetch\('\/api\/auth\/me'/);
  assert.match(source,/\/billing'/);
  assert.match(source,/billing\.plan!=='premium'/);
  assert.match(source,/me\.user\?\.isPlatformAdmin/);
  assert.match(source,/if\(account\)/);
  assert.match(source,/profile=/);
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
