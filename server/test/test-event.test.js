'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildTestEvent}=require('../index');
const {cleanEvent}=require('../event-bus');

test('simulates a gift event with realistic gift fields',()=>{
  const event=buildTestEvent('gift',{},1700000000000);
  assert.equal(event.type,'gift');
  assert.match(event.id,/^test-/);
  assert.equal(event.username,'TestGifter');
  assert.equal(event.giftName,'Rose');
  assert.equal(event.giftId,'test-gift-rose');
  assert.equal(event.count,1);
  assert.equal(event.value,1);
  assert.equal(event.at,1700000000000);
});

test('simulates like, follow and share events without meaningless gift fields',()=>{
  for(const type of ['like','follow','share']){
    const event=buildTestEvent(type,{},1700000000000);
    assert.equal(event.type,type);
    assert.match(event.id,/^test-/);
    assert.equal(event.username,'TestUser');
    assert.equal(event.value,0);
    assert.equal('giftName' in event,false,`${type} event should not carry gift fields`);
    assert.equal('giftId' in event,false,`${type} event should not carry gift fields`);
  }
});

test('unknown or missing event type falls back to gift',()=>{
  assert.equal(buildTestEvent('bogus',{},1700000000000).type,'gift');
  assert.equal(buildTestEvent(undefined,{},1700000000000).type,'gift');
});

test('caller overrides are applied and sanitized',()=>{
  const event=buildTestEvent('follow',{username:'  <script>Alice</script>  ',userId:'u-42',count:9999},1700000000000);
  assert.equal(event.userId,'u-42');
  assert.equal(event.count,9999);
  assert.doesNotMatch(event.username,/[<>]/);
});

test('count and value are clamped to sane bounds regardless of input',()=>{
  const huge=buildTestEvent('gift',{count:1e12,value:1e12},1700000000000);
  assert.equal(huge.count,1e6);
  assert.equal(huge.value,1e9);
  const negative=buildTestEvent('gift',{count:-5,value:-5},1700000000000);
  assert.equal(negative.count,1);
  assert.equal(negative.value,0);
});

test('every simulated event type passes the same validation real TikTok events go through',()=>{
  for(const type of ['gift','like','follow','share']){
    const event=buildTestEvent(type,{},1700000000000);
    assert.doesNotThrow(()=>cleanEvent(event),`${type} event must be publishable via eventBus.publish`);
  }
});
