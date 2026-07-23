'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../login-protection');
test('login lockout grows progressively and is capped',()=>{assert.deepEqual([1,4,5,6,7,8,50].map(P.lockSeconds),[0,0,30,120,300,900,900])});
test('lock deadlines and alert buckets are deterministic',()=>{assert.equal(P.lockUntil(5,1000).getTime(),31000);assert.equal(P.lockUntil(4,1000),null);assert.equal(P.hourBucket(new Date('2026-07-23T08:45:00Z')),'2026-07-23T08')});
