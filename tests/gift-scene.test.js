const {test}=require('node:test');
const assert=require('node:assert/strict');
const {giftDelta,matchGift,nextVariant,addPending,takePending,pendingCount,buildObsUrl}=require('../gift-scene.js');
test('OBS export preserves access and transfers gift choices, language and volume safely',()=>{
 const link=new URL(buildObsUrl('https://vyralive.app/overlay.html?access=test-token&scene=2',{voice:'sv',volume:.25,map:{egg:'Rose, Coffee',melon:'999'}}));
 assert.equal(link.searchParams.get('access'),'test-token');assert.equal(link.searchParams.get('scene'),'2');
 assert.equal(link.searchParams.get('giftScene'),'berra');assert.equal(link.searchParams.get('egg'),'Rose, Coffee');
 assert.equal(link.searchParams.get('voice'),'sv');assert.equal(link.searchParams.get('volume'),'25');
 assert.throws(()=>buildObsUrl('javascript:alert(1)',{}));
 assert.throws(()=>buildObsUrl('https://vyralive.app.evil.test/overlay.html',{}));
 assert.throws(()=>buildObsUrl('http://vyralive.app/overlay.html',{}));
});
test('English reactions vary without immediate repetition, including single-clip fallback',()=>{
 assert.equal(nextVariant(['a','b','c'],'a',()=>0),'b');
 assert.equal(nextVariant(['a','b','c'],'b',()=>.99),'c');
 assert.equal(nextVariant(['a'],'a',()=>0),'a');
 assert.equal(nextVariant([],'a',()=>0),undefined);
});
test('all six variants play before a line repeats, and cycling avoids the last line',()=>{
 const pool=['a','b','c','d','e','f'];let history=[];
 for(let i=0;i<6;i++){const value=nextVariant(pool,history,()=>0);assert.ok(!history.includes(value));history.push(value)}
 const next=nextVariant(pool,history,()=>0);assert.equal(next,'a');assert.notEqual(next,history.at(-1));
 assert.equal(nextVariant(['a','b'],['a','b','a'],()=>0),'b');
});
test('chosen TikTok gifts map to projectiles independently of gift names',()=>{
 const map={egg:'Rose, Coffee',icecream:'GG',melon:'TikTok',finale:'9999'};
 assert.equal(matchGift(map,{giftName:'Rose',giftId:1}),'egg');
 assert.equal(matchGift(map,{giftName:'coffee',giftId:2}),'egg');
 assert.equal(matchGift(map,{giftName:'GG'}),'icecream');
 assert.equal(matchGift(map,{giftName:'TikTok'}),'melon');
 assert.equal(matchGift(map,{giftId:9999}),'finale');
 assert.equal(matchGift(map,{giftName:'Unassigned'}),undefined);
});
test('replayed events and final cumulative streak packets never duplicate throws',()=>{
 const streaks=new Map(),seen=new Set();
 assert.equal(giftDelta({type:'gift',id:'a',streakId:'s',count:1},streaks,seen),1);
 assert.equal(giftDelta({type:'gift',id:'b',streakId:'s',count:5},streaks,seen),4);
 assert.equal(giftDelta({type:'gift',id:'c',streakId:'s',count:5},streaks,seen),0);
 assert.equal(giftDelta({type:'gift',id:'b',streakId:'s',count:5},streaks,seen),0);
});
test('test traffic is excluded from paid gift dispatch; malicious counts are bounded',()=>{
 const streaks=new Map(),seen=new Set();
 assert.equal(giftDelta({type:'gift',test:true,count:10},streaks,seen),0);
 assert.equal(giftDelta({type:'like',count:10},streaks,seen),0);
 assert.equal(giftDelta({type:'gift',count:1e10},streaks,seen),0);
 assert.equal(giftDelta({type:'gift',count:101},streaks,seen),101);
});
test('large combos stay compact and each gift retains its queued throw',()=>{
 const queue=[];assert.equal(addPending(queue,{kind:'egg',user:'alice',count:150}),true);
 addPending(queue,{kind:'egg',user:'alice',count:25});addPending(queue,{kind:'melon',user:'bob',count:2});
 assert.equal(queue.length,2);assert.equal(pendingCount(queue),177);
 for(let i=0;i<175;i++)assert.deepEqual(takePending(queue),{kind:'egg',user:'alice',count:1});
 assert.equal(takePending(queue).user,'bob');assert.equal(pendingCount(queue),1);
 assert.equal(takePending(queue).kind,'melon');assert.equal(takePending(queue),null);
 assert.equal(addPending(queue,{kind:'unknown',user:'x',count:2}),false);
});
