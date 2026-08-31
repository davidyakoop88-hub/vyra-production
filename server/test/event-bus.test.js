'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {cleanEvent}=require('../event-bus');
const {RateLimiter}=require('../rate-limit');
test('live events are normalized and bounded',()=>{const e=cleanEvent({id:'evt-1',type:'GIFT',username:' Alex ',count:-2,value:15});assert.equal(e.type,'gift');assert.equal(e.count,0);assert.equal(e.value,15)});
test('gift and battle presentation fields survive cloud normalization',()=>{const gift=cleanEvent({id:'g1',type:'gift',giftId:'rose',giftName:'Rose',giftImage:'https://img/rose.png',value:5});assert.equal(gift.giftImage,'https://img/rose.png');const battle=cleanEvent({id:'b1',type:'battle',scoreUs:1200,scoreThem:900,multiplier:3,battleStatus:'active'});assert.equal(battle.scoreUs,1200);assert.equal(battle.multiplier,3)});
test('unknown and anonymous events are rejected',()=>{assert.throws(()=>cleanEvent({id:'x',type:'casino'}));assert.throws(()=>cleanEvent({type:'gift'}))});
test('rate limiter falls back locally when Redis is down',async()=>{const limiter=new RateLimiter({connect:async()=>{throw new Error('offline')}});assert.equal(await limiter.exceeded('a',2),false);assert.equal(await limiter.exceeded('a',2),false);assert.equal(await limiter.exceeded('a',2),true)});

// DIAMANTER PA MOLNVAGEN (#133). `value` ar ENHETSLOST med flit: samma falt bar gavans varde,
// poang och score. Enheten maste darfor baras separat, annars kan mottagaren bara gissa vad talet
// ar — och for gavor AR det diamanter, inte coins (kallfaltet heter diamondCount i bada bryggorna).
// Vitlistan har strukit falt tva ganger forut, chattexten och fanClubLevel; ett falt som satts vid
// kallan men inte namns har finns inte.
test('diamanter overlever molnets vitlista',()=>{const e=cleanEvent({id:'d1',type:'gift',diamonds:150,coins:150,value:150});assert.equal(e.diamonds,150);assert.equal(e.value,150)});
test('en aldre avsandare som bara skickar coins ger anda diamonds',()=>{assert.equal(cleanEvent({id:'d2',type:'gift',coins:90}).diamonds,90)});
test('diamonds klamps och defaultar till 0 som ovriga tal',()=>{assert.equal(cleanEvent({id:'d3',type:'gift',value:1}).diamonds,0);assert.equal(cleanEvent({id:'d4',type:'gift',diamonds:-5}).diamonds,0)});
