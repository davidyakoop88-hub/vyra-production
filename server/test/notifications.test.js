'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {message,escapeHtml,COPY}=require('../notifications');
test('every billing notification has Swedish copy',()=>{for(const key of ['trial_started','trial_ending','payment_success','payment_failed','cancellation_scheduled','cancellation_reversed','subscription_ended'])assert.ok(COPY[key]?.[1])});
test('email HTML escapes untrusted values',()=>{assert.equal(escapeHtml('<script>'), '&lt;script&gt;');assert.doesNotMatch(message('trial_started').html,/<script>/)});
test('account emails decrypt their sealed one-time URL only while rendering',()=>{const old=process.env.APP_ENCRYPTION_KEY;process.env.APP_ENCRYPTION_KEY=Buffer.alloc(32,9).toString('base64url');const Vault=require('../token-vault'),url='https://vyra.test/studio.html?verify-email=secret',sealedActionUrl=Vault.seal(url),email=message('verify_email',{sealedActionUrl});assert.match(email.text,/verify-email=secret/);assert.doesNotMatch(sealedActionUrl,/secret/);if(old===undefined)delete process.env.APP_ENCRYPTION_KEY;else process.env.APP_ENCRYPTION_KEY=old});
test('new-login email includes an escaped device label',()=>{const email=message('new_login',{device:'Chrome <script> på Windows'});assert.match(email.text,/Chrome <script> på Windows/);assert.doesNotMatch(email.html,/<script>/)});
