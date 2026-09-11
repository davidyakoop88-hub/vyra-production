'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {startaWebblasare,hoppaOver}=require('../helpers/webblasare.js');
const ROOT=path.join(__dirname,'../..');let browser;let skip = hoppaOver();
test.before(async()=>{if(!skip)browser=await startaWebblasare()});
test.after(async()=>{if(browser)await browser.close()});
async function fixture(){
 const page=await browser.newPage({viewport:{width:900,height:800}});
 await page.route('https://fireworks.test/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffd36b"/><circle cx="40" cy="30" r="15" fill="#7e3cac"/></svg>'}));
 await page.setContent('<style>body{background:#101018}.canvas{position:absolute;left:250px;top:250px;width:360px}.resize-handle{display:none}'+fs.readFileSync(path.join(ROOT,'gift-fireworks.css'),'utf8')+'</style><div class="canvas"></div>');
 await page.addScriptTag({content:`var state={widgets:[]},selected=null,view='overlay';function wh(){return ''}function props(){return ''}function bind(){}function save(){}function render(){}function liveWidget(){return null}function bk(w,v,k,f){return v||f}function campaignGiftList(){return []}`});
 await page.addScriptTag({content:fs.readFileSync(path.join(ROOT,'overlay-sanitize.js'),'utf8')});
 await page.addScriptTag({content:fs.readFileSync(path.join(ROOT,'gift-fireworks.js'),'utf8')});
 await page.addScriptTag({content:`
 window.startFireworks=(theme,duration,combo)=>{
  dispatchEvent(new Event('vyra-session-ended'));
  const w={id:'fw',type:'templateGiftFireworks',x:0,y:0,width:360,fwTheme:theme,fwDuration:duration,fwSpeed:1.5,fwDensity:100,fwSound:false};
  state.widgets=[w];document.querySelector('.canvas').innerHTML=wh(w);
  window.sendFireworks=()=>triggerGiftFireworks({username:'@Anna',giftName:'Rose',giftImage:'https://fireworks.test/gift.png',profileImage:'https://fireworks.test/profile.png',combo});sendFireworks();
 };
 window.seekFireworks=t=>document.querySelector('.gift-fireworks-fx').getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=t});
 `});
 return page;
}
// Sample actual visible faces and transforms, not just keyframe names: a previous
// filter/backface collision passed animation-name checks while displaying both faces.
test('all four designs land and flip each personal rocket at 2, 5 and 10 seconds',{skip},async()=>{
 const page=await fixture();
 try{
  for(const theme of ['royal','ice','rose','comet'])for(const duration of [2,5,10])for(const combo of [1,100]){
   const result=await page.evaluate(([theme,duration,combo])=>{
    startFireworks(theme,duration,combo);
    const fx=document.querySelector('.gift-fireworks-fx'),event=fx.querySelector('.fw-event');
    const rockets=[...event.querySelectorAll('.fw-personal-rocket')];
    const stages=rockets.map(r=>{
     const arrival=parseFloat(r.style.getPropertyValue('--arrival'))*1000,delay=parseFloat(r.style.getPropertyValue('--delay'))*1000;
     const gift=r.querySelector('.fw-rocket-gift'),profile=r.querySelector('.fw-rocket-profile'),carrier=r.querySelector('.fw-carrier'),burst=r.querySelector('.fw-burst');
     const opacity=n=>+getComputedStyle(n).opacity;
     const at=t=>{seekFireworks(t);return {gift:opacity(gift),profile:opacity(profile),flash:opacity(r.querySelector('.fw-flash')),spark:opacity(burst.firstChild)}};
     const before=at(arrival-1),firstHalf=at(arrival+160),secondHalf=at(arrival+490),after=at(arrival+651);
     const center=n=>{const b=n.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]};
     const centerAfter=center(profile),target=burst.getBoundingClientRect(),matrix=new DOMMatrixReadOnly(getComputedStyle(carrier).transform);
     seekFireworks(arrival);const centerBefore=center(gift);
     const flightStart=at(delay+(arrival-delay)*.25),flash=at(arrival+40);
     return {before,firstHalf,secondHalf,after,flash,flightStart,centerBefore,centerAfter,target:[target.x,target.y],landing:[matrix.m41,matrix.m42],expected:[parseFloat(r.style.getPropertyValue('--target-x')),parseFloat(r.style.getPropertyValue('--target-y'))],faceDuration:getComputedStyle(gift).animationDuration,faceDelay:getComputedStyle(gift).animationDelay,arrival,carrierName:getComputedStyle(carrier).animationName,burstName:getComputedStyle(burst.firstChild).animationName};
    });
    return {stages,count:rockets.length,text:event.textContent};
   },[theme,duration,combo]);
   const label=theme+' '+duration+'s x'+combo;
   assert.equal(result.count,combo===100?7:1,label);assert.equal(result.text,'',label+' no names or labels');
   for(const s of result.stages){
    assert.equal(s.before.gift,1,label);assert.equal(s.before.profile,0,label);assert.equal(s.before.flash,0,label+' no premature explosion');
    assert.ok(s.firstHalf.gift>0,label);assert.equal(s.firstHalf.profile,0,label+' exclusive front');
    assert.equal(s.secondHalf.gift,0,label+' exclusive back');assert.ok(s.secondHalf.profile>0,label);
    assert.equal(s.after.gift,0,label);assert.equal(s.after.profile,1,label);assert.ok(s.flash.flash>0,label+' explosion at arrival');assert.ok(s.flash.spark>0,label+' sparks at arrival');
    assert.equal(s.faceDuration,'0.65s',label);assert.ok(Math.abs(parseFloat(s.faceDelay)*1000-s.arrival)<.1,label);
    s.centerBefore.forEach((n,i)=>assert.ok(Math.abs(n-s.centerAfter[i])<.2,label+' same flip center'));
    s.centerAfter.forEach((n,i)=>assert.ok(Math.abs(n-s.target[i])<.2,label+' own explosion center'));
    s.landing.forEach((n,i)=>assert.ok(Math.abs(n-s.expected[i])<.2,label+' exact landing'));
    assert.equal(s.carrierName,{royal:'fw-personal-launch',ice:'fw-personal-cross',rose:'fw-personal-fan',comet:'fw-personal-orbit'}[theme]);
    assert.equal(s.burstName,{royal:'fw-personal-willow',ice:'fw-explode-bloom',rose:'fw-personal-fan-burst',comet:'fw-explode-spiral'}[theme]);
   }
  }
 }finally{await page.close()}
});
test('three senders keep independent running timelines; a fourth waits',{skip},async()=>{
 const page=await fixture();
 try{
  const result=await page.evaluate(()=>{
   startFireworks('royal',5,100);seekFireworks(1500);
   const fx=document.querySelector('.gift-fireworks-fx'),first=fx.firstElementChild,original=first.getAnimations({subtree:true}).filter(a=>a.effect.target.matches('.fw-event,.fw-carrier,.fw-rocket-gift,.fw-rocket-profile'));
   sendFireworks();sendFireworks();sendFireworks();
   return {quality:fx.dataset.fwQuality,rockets:fx.querySelectorAll('.fw-rocket').length,sparks:fx.querySelectorAll('.fw-burst i').length,sparksPerBurst:[...fx.querySelectorAll('.fw-burst')].map(n=>n.children.length),cheap:[...fx.querySelectorAll('.fw-burst i,.fw-rocket-gift,.fw-rocket-profile')].every(n=>getComputedStyle(n).boxShadow==='none'),rings:[...fx.querySelectorAll('.fw-ring')].every(n=>getComputedStyle(n).display==='none'),trailFilters:[...fx.querySelectorAll('.fw-carrier')].every(n=>getComputedStyle(n,'::after').filter==='none'),layers:fx.children.length,pending:VyraFireworks.pending(),same:fx.firstElementChild===first,preserved:original.every(a=>first.getAnimations({subtree:true}).includes(a)&&a.currentTime===1500),lanes:[...fx.children].map(n=>n.dataset.lane),newTimes:[...fx.children].slice(1).flatMap(n=>n.getAnimations({subtree:true}).map(a=>a.currentTime||0))};
  });
  assert.equal(result.quality,'busy');assert.equal(result.rockets,21);assert.equal(result.sparks,252);assert.ok(result.sparksPerBurst.every(n=>n<=12));assert.equal(result.cheap,true);assert.equal(result.rings,true);assert.equal(result.trailFilters,true);assert.equal(result.layers,3);assert.equal(result.pending,1);assert.equal(result.same,true);assert.equal(result.preserved,true);assert.equal(new Set(result.lanes).size,3);assert.ok(result.newTimes.every(n=>n<100));
 }finally{await page.close()}
});
test('reduced motion hides explosions and shows the stationary gift/profile exchange',{skip},async()=>{
 const page=await fixture();
 try{
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const theme of ['royal','ice','rose','comet']){
   const result=await page.evaluate(theme=>{
    startFireworks(theme,5,1);const r=document.querySelector('.fw-personal-rocket'),c=r.querySelector('.fw-carrier');
    const at=t=>{seekFireworks(t);return {transform:getComputedStyle(c).transform,gift:+getComputedStyle(r.querySelector('.fw-rocket-gift')).opacity,profile:+getComputedStyle(r.querySelector('.fw-rocket-profile')).opacity}};
    const arrival=parseFloat(r.style.getPropertyValue('--arrival'))*1000;
    return {early:at(arrival*.25),late:at(arrival+700),name:getComputedStyle(c).animationName,hidden:['.fw-burst','.fw-ring','.fw-flash'].map(s=>getComputedStyle(r.querySelector(s)).display),display:getComputedStyle(r).display};
   },theme);
   assert.equal(result.name,'fw-personal-still');assert.equal(result.early.transform,result.late.transform);assert.equal(result.early.gift,1);assert.equal(result.early.profile,0);assert.equal(result.late.gift,0);assert.equal(result.late.profile,1);assert.equal(result.display,'block');assert.deepEqual(result.hidden,['none','none','none']);
  }
 }finally{await page.close()}
});
