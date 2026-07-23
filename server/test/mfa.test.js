'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
process.env.APP_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64url');
const M=require('../mfa');
test('TOTP follows the RFC 6238 SHA1 test vector',()=>{const secret=M.base32Encode(Buffer.from('12345678901234567890'));assert.equal(M.hotp(secret,Math.floor(59/30)),'287082')});
test('TOTP accepts only the small clock-drift window',()=>{const secret=M.newSecret(),now=1710000000000,code=M.hotp(secret,Math.floor(now/30000));assert.equal(M.verify(secret,code,now),true);assert.equal(M.verify(secret,code,now+120000),false);assert.equal(M.verify(secret,'12345',now),false)});
test('MFA secrets encrypt and recovery codes are stored as hashes',()=>{const secret=M.newSecret(),sealed=M.encryptedSecret(secret),codes=M.recoveryCodes();assert.equal(M.openSecret(sealed),secret);assert.equal(codes.length,10);assert.equal(new Set(codes).size,10);assert.doesNotMatch(M.hashRecovery(codes[0]),new RegExp(codes[0].replace('-','')))});
