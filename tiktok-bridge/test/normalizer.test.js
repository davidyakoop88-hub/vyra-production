'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const N=require('../normalizer');

test('gift streak is converted to total diamonds and keeps gift image',()=>{
  const out=N.giftFields({user:{userId:'u1',uniqueId:'alex',nickname:'Alex',avatarThumb:{urlList:['https://img/avatar.jpg']}},giftDetails:{giftId:'g1',giftName:'Galaxy',diamondCount:1000,giftImage:{urlList:['https://img/gift.png']}},repeatCount:5,repeatEnd:true});
  assert.equal(out.coins,5000);assert.equal(out.count,5);assert.equal(out.giftName,'Galaxy');assert.equal(out.giftImage,'https://img/gift.png');assert.equal(out.userId,'u1');
});
test('cloud event preserves canonical identity and bounded values',()=>{
  const out=N.cloudEvent('evt-1','GIFT',{userId:'u1',username:'alex',giftId:'g1',giftName:'Rose',giftImage:'https://img/g.png',coins:5,count:5},123);
  // FULL FORM MED FLIT. Provet jamfor HELA objektet, inte enskilda falt: det ar vakten mot att ett
  // falt tyst forsvinner ur molnbodyn. Priset ar att den som LAGGER TILL ett falt maste uppdatera
  // fixturen har — och det ar meningen, for da tvingas andringen vara medveten.
  // fanClubLevel/gifterLevel ar 0 har eftersom anropet inte skickar in dem; nollan betyder
  // "ingen niva rapporterad" hela vagen genom event-bus.js och viewer-levels.js.
  //
  // 2026-09-06 (#349): name, diamonds, isAnonymous och isModerator tillkom. Provet foll da, och
  // det ar precis vad helformen ar till for — fyra falt som raknades fram vid kallan men aldrig
  // nadde molnet gick inte att lagga till utan att den har raden andrades medvetet. Provet fallde
  // en andra gang samma dag nar isFollower/isSubscriber tillkom — ocksa da med flit.
  // `diamonds` ar 5 och inte 0 fastan anropet bara skickar `coins`: reserven i cloudEvent finns
  // for att litteralens alltid-narvarande falt annars blir en explicit nolla, och serverns egen
  // `diamonds ?? coins` faller inte igenom pa noll.
  assert.deepEqual(out,{id:'evt-1',type:'gift',userId:'u1',username:'alex',name:'',comment:'',profileUrl:'',giftId:'g1',giftName:'Rose',giftImage:'https://img/g.png',count:5,value:5,diamonds:5,scoreUs:0,scoreThem:0,multiplier:0,battleStatus:'',emote:'',fanClubLevel:0,gifterLevel:0,isAnonymous:false,isModerator:false,isFollower:false,isSubscriber:false,at:123});
});
test('avatar picks the largest variant TikTok offers, not the 100x100 thumb',()=>{
  const all=N.giftFields({user:{userId:'u1',uniqueId:'alex',avatarThumb:{urlList:['https://img/thumb.jpg']},avatarMedium:{urlList:['https://img/medium.jpg']},avatarLarger:{urlList:['https://img/larger.jpg']}}});
  assert.equal(all.profileImage,'https://img/larger.jpg');

  const noLarger=N.giftFields({user:{uniqueId:'alex',avatarThumb:{urlList:['https://img/thumb.jpg']},avatarMedium:{urlList:['https://img/medium.jpg']}}});
  assert.equal(noLarger.profileImage,'https://img/medium.jpg');

  // thumb is still the last resort rather than dropped
  const thumbOnly=N.giftFields({user:{uniqueId:'alex',avatarThumb:{urlList:['https://img/thumb.jpg']}}});
  assert.equal(thumbOnly.profileImage,'https://img/thumb.jpg');

  const none=N.giftFields({user:{uniqueId:'alex'}});
  assert.equal(none.profileImage,'');
});
test('battle fields support common score shapes',()=>{
  const out=N.battleFields({battleInfo:{hostScore:1200,guestScore:900,multiplier:3}});
  assert.equal(out.scoreUs,1200);assert.equal(out.scoreThem,900);assert.equal(out.multiplier,3);
});
test('moderator/subscriber/follower flags come from userIdentity, not the user struct',()=>{
  const out=N.baseUser({user:{uniqueId:'alex'},userIdentity:{isModeratorOfAnchor:true,isSubscriberOfAnchor:false,isFollowerOfAnchor:true}});
  assert.equal(out.isModerator,true);assert.equal(out.isFollower,true);assert.equal(out.isSubscriber,false);
});
test('identity flags default to false when userIdentity is absent (join/like/follow messages)',()=>{
  const out=N.baseUser({user:{uniqueId:'alex'}});
  assert.equal(out.isModerator,false);assert.equal(out.isFollower,false);assert.equal(out.isSubscriber,false);
});
test('fan club level reads user.fansClub.data.level and defaults to 0',()=>{
  const withClub=N.baseUser({user:{uniqueId:'alex',fansClub:{data:{level:12}}}});
  assert.equal(withClub.fanClubLevel,12);
  const noClub=N.baseUser({user:{uniqueId:'alex'}});
  assert.equal(noClub.fanClubLevel,0);
});

// Regression: the chat text used to ride on `name`, which cleanEvent() does not carry, so every
// browser-side chat consumer received an empty string on the cloud path.
test('cloud event carries the chat comment through to the browser',()=>{
  const out=N.cloudEvent('evt-2','CHAT',{userId:'u2',username:'mia',comment:'hej alla!'},456);
  assert.equal(out.comment,'hej alla!');
});
