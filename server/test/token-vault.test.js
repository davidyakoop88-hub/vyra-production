'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
process.env.APP_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64url');
const Vault=require('../token-vault');
test('sensitive email links are authenticated and encrypted',()=>{const raw='https://example.com/reset?token=secret',sealed=Vault.seal(raw);assert.notEqual(sealed,raw);assert.doesNotMatch(sealed,/secret/);assert.equal(Vault.open(sealed),raw)});
test('tampered encrypted links are rejected',()=>{const sealed=Vault.seal('hello'),last=sealed.at(-1),tampered=sealed.slice(0,-1)+(last==='A'?'B':'A');assert.throws(()=>Vault.open(tampered))});
