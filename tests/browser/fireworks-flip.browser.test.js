'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {startaWebblasare,hoppaOver}=require('../helpers/webblasare.js');
const ROOT=path.join(__dirname,'../..');let browser;const skip=hoppaOver();
test.before(async()=>{if(!skip)browser=await startaWebblasare()});
test.after(async()=>{if(browser)await browser.close()});

// Riktig renderer + CSS. Synligheten mats fore smallen, fore/efter flippen och vid slutet.
// Inte bara animationName: det var just computed-style utan synlighetsprov som missade
// den gamla 3D/filters-kollisionen. Alla ansikten maste ha var sin exklusiv fas.
test('gåvan exploderar före profilflippen, för alla rörelser och kort/lång speltid', {skip}, async()=>{
 const page=await browser.newPage();
 try{
  await page.setContent('<style>'+fs.readFileSync(path.join(ROOT,'gift-fireworks.css'),'utf8')+'</style><div class="canvas"></div>');
  await page.addScriptTag({content:`var state={widgets:[]},selected=null,view='overlay';function wh(){return ''}function props(){return ''}function bind(){}function save(){}function render(){}function liveWidget(){return null}function bk(w,v,k,f){return v||f}function campaignGiftList(){return []}`});
  await page.addScriptTag({content:fs.readFileSync(path.join(ROOT,'overlay-sanitize.js'),'utf8')});
  await page.addScriptTag({content:fs.readFileSync(path.join(ROOT,'gift-fireworks.js'),'utf8')});
  for(const motion of ['magnetic','spiral','bloom'])for(const duration of [2,5,10]){
   const result=await page.evaluate(([motion,duration])=>{
    const w={id:'fw',type:'templateGiftFireworks',x:0,y:0,width:360,fwMotion:motion,fwDuration:duration,fwSpeed:1.5,fwDensity:100,fwSound:false};
    state.widgets=[w];document.querySelector('.canvas').innerHTML=wh(w);
    triggerGiftFireworks({username:'@Anna',giftName:'Rose',combo:3});
    const fx=document.querySelector('.gift-fireworks-fx'),flight=parseFloat(fx.style.getPropertyValue('--fw-flight'))*1000,reveal=duration*1000-flight;
    const animations=fx.getAnimations({subtree:true});
    const at=t=>{animations.forEach(a=>{a.pause();a.currentTime=t});const opacity=sel=>+getComputedStyle(fx.querySelector(sel)).opacity;return {gift:opacity('.fw-central-gift'),sender:opacity('.fw-sender'),caption:opacity('.fw-sender-caption'),ring:opacity('.fw-ring'),flash:opacity('.fw-flash')}};
    const stages={launch:at(flight*.5),impact:at(flight+reveal*.05),gift:at(flight+reveal*.2),sender:at(flight+reveal*.52),hold:at(duration*1000-650)};
    // Samma nod maste starta om animationen vid nasta event, inte bara fa en ny sluttimer.
    triggerGiftFireworks({username:'@Bea',combo:100});
    return {stages,particles:fx.querySelectorAll('.fw-burst i').length,rockets:fx.querySelectorAll('.fw-rocket').length,name:fx.querySelector('.fw-sender-name').textContent,restarted:fx.getAnimations({subtree:true}).every(a=>(a.currentTime||0)<50)};
   },[motion,duration]);
   const context=motion+' '+duration+'s';
   assert.equal(result.stages.launch.sender,0,context);
   assert.ok(result.stages.impact.flash>.5&&result.stages.impact.ring>.2,context+' small');
   assert.equal(result.stages.gift.gift,1,context+' gava');assert.equal(result.stages.gift.sender,0,context);
   assert.equal(result.stages.sender.gift,0,context);assert.equal(result.stages.sender.sender,1,context+' profil');assert.equal(result.stages.sender.caption,1,context+' namn');
   assert.equal(result.stages.hold.sender,1,context+' lasbar sluttid');
   assert.equal(result.particles,50);assert.equal(result.rockets,100);assert.equal(result.name,'@Bea');assert.equal(result.restarted,true,context+' startar om');
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  const reduced=await page.evaluate(()=>({flash:getComputedStyle(document.querySelector('.fw-flash')).display,ring:getComputedStyle(document.querySelector('.fw-ring')).display,particles:getComputedStyle(document.querySelector('.fw-burst')).display,sender:getComputedStyle(document.querySelector('.fw-sender')).animationName}));
  assert.equal(reduced.flash,'none');assert.equal(reduced.ring,'none');assert.equal(reduced.particles,'none');assert.equal(reduced.sender,'fw-sender-reduced');
 }finally{await page.close()}
});
