'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const N=require('../normalizer');

test('gift streak is converted to total diamonds and keeps gift image',()=>{
  const out=N.giftFields({user:{userId:'u1',uniqueId:'alex',nickname:'Alex',avatarThumb:{urlList:['https://img/avatar.jpg']}},giftDetails:{giftId:'g1',giftName:'Galaxy',diamondCount:1000,giftImage:{urlList:['https://img/gift.png']}},repeatCount:5,repeatEnd:true});
  assert.equal(out.coins,5000);assert.equal(out.count,5);assert.equal(out.giftName,'Galaxy');assert.equal(out.giftImage,'https://img/gift.png');assert.equal(out.userId,'u1');
});
test('cloud event preserves canonical identity and bounded values',()=>{
  const out=N.cloudEvent('evt-1','GIFT',{userId:'u1',username:'alex',giftId:'g1',giftName:'Rose',giftImage:'https://img/g.png',coins:5,count:5},123);
  assert.deepEqual(out,{id:'evt-1',type:'gift',userId:'u1',username:'alex',profileUrl:'',giftId:'g1',giftName:'Rose',giftImage:'https://img/g.png',count:5,value:5,scoreUs:0,scoreThem:0,multiplier:0,battleStatus:'',at:123});
});
test('battle fields support common score shapes',()=>{
  const out=N.battleFields({battleInfo:{hostScore:1200,guestScore:900,multiplier:3}});
  assert.equal(out.scoreUs,1200);assert.equal(out.scoreThem,900);assert.equal(out.multiplier,3);
});
