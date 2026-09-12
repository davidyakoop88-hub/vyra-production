'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {startaWebblasare,hoppaOver}=require('../helpers/webblasare.js');
const ROOT=path.join(__dirname,'../..');let browser;let skip = hoppaOver();
test.before(async()=>{if(!skip)browser=await startaWebblasare()});
test.after(async()=>{if(browser)await browser.close()});
async function fixture(){
 const page=await browser.newPage({viewport:{width:1000,height:850}});
 await page.route('https://fireworks.test/**',route=>route.request().url().endsWith('/index.html')?route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}):route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="'+(route.request().url().includes('profile')?'#2255ee':'#ee2244')+'"/></svg>'}));
 await page.goto('https://fireworks.test/index.html');
 await page.setContent('<style>'+fs.readFileSync(path.join(ROOT,'gift-fireworks.css'),'utf8')+'</style><div class="canvas"></div>');
 await page.addScriptTag({content:`var state={widgets:[]},selected=null,view='overlay';function wh(){return ''}function props(){return ''}function bind(){}function save(){}function render(){}function liveWidget(){return null}function bk(w,v,k,f){return v||f}function campaignGiftList(){return []}`});
 for(const file of ['overlay-sanitize.js','widget-factory.js','vfx-types.js','vfx-ticker.js','gift-classics-engine.js','gift-supernova-engine.js','gift-fireworks.js'])await page.addScriptTag({content:fs.readFileSync(path.join(ROOT,file),'utf8')});
 await page.addScriptTag({content:`window.startFireworks=(theme,combo)=>{dispatchEvent(new Event('vyra-session-ended'));state.widgets=[{id:'fw',type:'templateGiftFireworks',x:0,y:0,width:540,fwTheme:theme,fwSound:false}];document.querySelector('.canvas').innerHTML=wh(state.widgets[0]);window.sendFireworks=()=>triggerGiftFireworks({username:'Anna',giftImage:'https://fireworks.test/gift.svg',profileImage:'https://fireworks.test/profile.svg',coins:100,combo});sendFireworks()};`});
 return page;
}
test('four approved canvas designs flip real image faces at a fixed arrival center for all tiers',{skip},async()=>{
 const page=await fixture();try{
  for(const theme of ['royal','ice','rose','comet'])for(const combo of [1,10,100]){
   const r=await page.evaluate(async([theme,combo])=>{
    startFireworks(theme,combo);const renderer=VyraClassics.create({theme,giftImage:'https://fireworks.test/gift.svg',profileImage:'https://fireworks.test/profile.svg'});await renderer.ready;
    const c=document.createElement('canvas');c.width=960;c.height=800;const ctx=c.getContext('2d');
    const stages=renderer.inspect(combo,0).map(rocket=>{
     const at=t=>{renderer.render(ctx,960,800,t,combo);return Array.from(ctx.getImageData(Math.round(rocket.target.x),Math.round(rocket.target.y),1,1).data)};
     const front=at(rocket.arrival-.001),back=at(rocket.arrival+.95);
     const arrived=renderer.inspect(combo,rocket.arrival)[rocket.index],held=renderer.inspect(combo,rocket.arrival+1)[rocket.index];
     return{front,back,arrived:[arrived.x,arrived.y,arrived.radius],held:[held.x,held.y,held.radius],target:[rocket.target.x,rocket.target.y]};
    });
    renderer.render(ctx,960,800,renderer.duration(combo),combo);const pixels=ctx.getImageData(0,0,960,800).data;let finalAlpha=0;for(let i=3;i<pixels.length;i+=4)finalAlpha+=pixels[i];
    return{stages,finalAlpha,duration:VyraFireworks.durationFor({combo}),canvas:!!document.querySelector('.fw-classics-canvas'),text:document.querySelector('.gift-fireworks-fx').textContent};
   },[theme,combo]);
   assert.equal(r.canvas,true);assert.equal(r.text,'');assert.equal(r.duration,combo===100?18000:combo===10?9000:6000);assert.equal(r.stages.length,combo===100?14:combo===10?3:1);assert.equal(r.finalAlpha,0);
   for(const s of r.stages){assert.ok(s.front[0]>s.front[2],theme+' gift front');assert.ok(s.back[2]>s.back[0],theme+' profile back');assert.deepEqual(s.arrived,s.held);assert.deepEqual(s.arrived.slice(0,2),s.target)}
  }
 }finally{await page.close()}
});
test('three sender canvases persist independently, fourth queues, and session reset stops the clock',{skip},async()=>{
 const page=await fixture();try{const r=await page.evaluate(()=>{startFireworks('royal',100);const first=document.querySelector('.fw-event');sendFireworks();sendFireworks();sendFireworks();const before={canvases:document.querySelectorAll('.fw-classics-canvas').length,pending:VyraFireworks.pending(),same:first===document.querySelector('.fw-event'),active:VyraSupernova.active(),listeners:VFX.Ticker._listeners.size};dispatchEvent(new Event('vyra-session-ended'));return{before,after:{active:VyraSupernova.active(),listeners:VFX.Ticker._listeners.size,canvases:document.querySelectorAll('canvas').length}}});assert.deepEqual(r.before,{canvases:3,pending:1,same:true,active:3,listeners:3});assert.deepEqual(r.after,{active:0,listeners:0,canvases:0})}finally{await page.close()}
});
test('reduced motion is one stationary badge and hidden widgets clear their bitmap',{skip},async()=>{
 const page=await fixture();try{await page.emulateMedia({reducedMotion:'reduce'});for(const theme of ['royal','ice','rose','comet']){await page.evaluate(theme=>startFireworks(theme,100),theme);await page.waitForTimeout(100);const r=await page.evaluate(async()=>{const c=document.querySelector('canvas'),ctx=c.getContext('2d');const pixels=()=>{const d=ctx.getImageData(0,0,c.width,c.height).data;let count=0;for(let i=3;i<d.length;i+=4)if(d[i])count++;return count};const before=pixels(),image=c.toDataURL();await new Promise(resolve=>setTimeout(resolve,50));const same=image===c.toDataURL();state.widgets[0].hidden=true;await new Promise(resolve=>setTimeout(resolve,50));return{before,same,after:pixels(),active:VyraSupernova.active()}});assert.ok(r.before>1000&&r.before<40000);assert.equal(r.same,true);assert.equal(r.after,0);assert.equal(r.active,0)}}finally{await page.close()}
});
