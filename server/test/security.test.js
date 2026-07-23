'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),S=require('../security');
test('password hashes are salted and verify safely',()=>{const a=S.hashPassword('a very strong password'),b=S.hashPassword('a very strong password');assert.notEqual(a,b);assert.equal(S.verifyPassword('a very strong password',a),true);assert.equal(S.verifyPassword('wrong password',a),false)});
test('tokens have enough entropy and digest is stable',()=>{const a=S.token(),b=S.token();assert.notEqual(a,b);assert.ok(a.length>=43);assert.equal(S.digest(a),S.digest(a))});
test('OBS access tokens are opaque and URL safe',()=>{const raw=S.token(32);assert.match(raw,/^[A-Za-z0-9_-]{43}$/);assert.equal(S.digest(raw).length,64);assert.equal(S.digest(raw).includes(raw),false)});
test('email and user text are normalized',()=>{assert.equal(S.normalizeEmail('  USER@Example.COM '),'user@example.com');assert.equal(S.safeText('<b>Alice</b>'), 'bAlice/b');assert.throws(()=>S.normalizeEmail('not-an-email'))});
test('cookies use hardened flags',()=>{const c=S.sessionCookie('secret',3600);assert.match(c,/HttpOnly/);assert.match(c,/Secure/);assert.match(c,/SameSite=Strict/)});
test('cloud overlay state rejects malformed or oversized layouts',()=>{assert.equal(S.validOverlayState({widgets:[{id:'w1'}]}),true);assert.equal(S.validOverlayState({widgets:[{}]}),false);assert.equal(S.validOverlayState({widgets:Array.from({length:501},(_,i)=>({id:'w'+i}))}),false)});
