'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
function setup(){
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 const widgets=[{id:'a',type:'templateGiftCampaign',giftName0:'Rose',giftCurrent0:0},{id:'a-copy',type:'templateGiftCampaign',giftName0:'Galaxy',giftCurrent0:0},{id:'hidden',type:'templateGiftCampaign',giftName0:'Rose',giftCurrent0:0,hidden:true}];
 const counts={mount:0,receive:[],dispose:0,save:0,render:0},active=new Map();
 w.state={widgets};w.save=()=>counts.save++;w.render=()=>counts.render++;
 w.VyraCampaignItems=x=>[{name:x.giftName0,image:'rose.png',current:x.giftCurrent0,target:10}];
 w.VYRA_GIFTS=[{name:'Rose',file:'rose.png'}];
 w.VyraCampaignAuraEngine={mount(n,x){counts.mount++;active.set(n,x)},inspect:n=>active.get(n),dispose(n){counts.dispose++;active.delete(n)},receive(n,i,q,total){counts.receive.push({id:n.dataset.id,i,q,total})}};
 const main=w.document.querySelector('main');
 for(const x of widgets){const n=w.document.createElement('div');n.className='widget vyra-campaign-aura';n.dataset.id=x.id;n.innerHTML='<article class="gift"><div class="frame"><img></div></article>';main.append(n)}
 const thumbnail=w.document.createElement('div');thumbnail.className='widget-catalog';thumbnail.innerHTML='<div class="widget vyra-campaign-aura" data-id="a"></div>';main.append(thumbnail);
 for(const file of ['gift-event-images.js','gift-campaign-aura-session.js'])w.eval(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
 return {w,widgets,counts,dom,send(d){w.dispatchEvent(new w.CustomEvent('vyra-live-event',{detail:{type:'gift',...d}}))}};
}
test('actual gift event writer routes quantity once to only matching visible aura; no render/save',()=>{
 const e=setup();try{
 assert.equal(e.counts.mount,2);
 e.send({giftName:'Rose',count:3});e.send({giftName:'Rose',count:2});e.send({giftName:'Rose Bouquet',count:9});
 assert.equal(e.widgets[0].giftCurrent0,5);assert.equal(e.widgets[1].giftCurrent0,0);
 assert.equal(e.widgets[2].giftCurrent0,5,'hidden widget preserves counts but has no engine/audio');
 assert.deepEqual(e.counts.receive,[{id:'a',i:0,q:3,total:3},{id:'a',i:0,q:2,total:5}]);
 assert.equal(e.counts.mount,2,'gift events do not restart entrance or queue');
 assert.equal(e.counts.save,0);assert.equal(e.counts.render,0);
 }finally{e.dom.window.close()}
});
test('hidden, removed and replaced scene roots dispose, catalog never mounts',()=>{
 const e=setup();try{
 e.widgets[0].hidden=true;e.w.VyraCampaignAuraSession.sync();
 assert.equal(e.w.VyraCampaignAuraSession.active(),1);
 e.w.document.querySelector('[data-id="a-copy"]').remove();e.w.VyraCampaignAuraSession.sync();
 assert.equal(e.w.VyraCampaignAuraSession.active(),0);
 e.send({giftName:'Galaxy',count:7});assert.equal(e.counts.receive.length,0);
 assert.equal(e.widgets[1].giftCurrent0,7);
 }finally{e.dom.window.close()}
});
test('missing gift identity and nonpositive/nonfinite quantities never trigger a reaction',()=>{
 const e=setup();try{
 for(const count of [-1,0,Infinity,'broken'])e.send({giftName:'Rose',count});
 e.send({count:9});assert.equal(e.counts.receive.length,0);assert.equal(e.widgets[0].giftCurrent0,0);
 e.send({giftName:'Rose'});assert.equal(e.widgets[0].giftCurrent0,1);
 }finally{e.dom.window.close()}
});
test('first received gift replaces a demo placeholder but preserves an explicit saved total',()=>{
 const e=setup();try{
 delete e.widgets[0].giftCurrent0;
 e.w.VyraCampaignItems=x=>[{name:x.giftName0,image:'rose.png',current:x.giftCurrent0??28,target:100}];
 e.send({giftName:'Rose',count:2});
 assert.equal(e.widgets[0].giftCurrent0,2);
 e.widgets[0].giftCurrent0=28;
 e.send({giftName:'Rose',count:2});
 assert.equal(e.widgets[0].giftCurrent0,30);
 assert.deepEqual(e.counts.receive,[{id:'a',i:0,q:2,total:2},{id:'a',i:0,q:2,total:30}]);
 }finally{e.dom.window.close()}
});
test('backgrounding releases engines and returning mounts the current totals',()=>{
 const e=setup();try{
 Object.defineProperty(e.w.document,'hidden',{value:true,configurable:true});
 e.w.document.dispatchEvent(new e.w.Event('visibilitychange'));
 assert.equal(e.w.VyraCampaignAuraSession.active(),0);
 e.send({giftName:'Rose',count:4});
 assert.equal(e.widgets[0].giftCurrent0,4);assert.equal(e.counts.receive.length,0);
 Object.defineProperty(e.w.document,'hidden',{value:false,configurable:true});
 e.w.document.dispatchEvent(new e.w.Event('visibilitychange'));
 assert.equal(e.w.VyraCampaignAuraSession.active(),2);
 e.send({giftName:'Rose',count:1});
 assert.deepEqual(e.counts.receive,[{id:'a',i:0,q:1,total:5}]);
 }finally{e.dom.window.close()}
});
test('session teardown releases every active engine',()=>{
 const e=setup();try{
 e.w.dispatchEvent(new e.w.Event('vyra-session-ended'));
 assert.equal(e.w.VyraCampaignAuraSession.active(),0);
 assert.equal(e.counts.dispose,2);
 }finally{e.dom.window.close()}
});
