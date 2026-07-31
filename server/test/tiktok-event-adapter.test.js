'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const adapter=require('../../tiktok-event-adapter');
test('TikTok gift becomes a premium model without exposing gift name in text',()=>{
  const event=adapter.normalize({id:'e1',type:'gift',userId:'u1',username:'alex',name:'Alex',giftId:'g1',giftName:'Galaxy',giftImage:'https://img/g.png',count:5,coins:5000});
  const model=adapter.giftModel(event);
  assert.equal(model.presentation.tier,'large');assert.equal(model.presentation.showGiftName,false);assert.equal(model.gift.imageUrl,'https://img/g.png');assert.equal(model.user.displayName,'Alex');
});
test('tier thresholds are deterministic',()=>{assert.equal(adapter.tier(99),'small');assert.equal(adapter.tier(100),'medium');assert.equal(adapter.tier(1000),'large');assert.equal(adapter.tier(10000),'legendary')});
test('unsupported events are rejected',()=>{adapter.reset();assert.equal(adapter.route({id:'x',type:'casino'}).status,'rejected');assert.equal(adapter.getStats().rejected,1)});
test('gift route mounts and drives the premium gift widget',()=>{
  const calls=[];global.document={body:{}};
  global.VyraPremiumWidget={mount:target=>calls.push(['core-mount',target])};
  global.VyraPremiumGiftWidget={mount:target=>calls.push(['gift-mount',target]),show:model=>(calls.push(['show',model]),{status:'shown'})};
  const out=adapter.route({id:'e2',type:'gift',userId:'u2',username:'robin',giftId:'rose',giftImage:'https://img/rose.png',coins:5,count:1});
  assert.equal(out.status,'routed');assert.equal(calls[2][0],'show');assert.equal(calls[2][1].presentation.showGiftName,false);
  delete global.document;delete global.VyraPremiumWidget;delete global.VyraPremiumGiftWidget;
});
