'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDom,closeAll}=require('./helpers/dom-harness.js');
const factory=require('../widget-factory.js');
test.after(closeAll);
function setup(){
 const w=factory.create('catalog:giftfireworks:supernova');w.id='nova';
 const h=createDom({state:{widgets:[w],projectName:'nova'}});
 h.load('overlay-sanitize.js');h.load('gift-fireworks.js');h.load('gift-supernova-panel.js');
 h.window.eval("view='editor';selected='nova';render();bind()");
 return h;
}
const state=h=>h.window.eval("state.widgets.find(w=>w.id==='nova')");
function change(h,id,value){const el=h.document.getElementById(id);el.value=value;el.dispatchEvent(new h.window.Event('change',{bubbles:true}));}
test('Supernova factory and standalone use approved defaults without changing old four',()=>{
 for(const placement of ['layout','standalone']){
  const w=factory.create('catalog:giftfireworks:supernova',placement==='standalone'?{placement}:{});
  assert.equal(w.fwTheme,'supernova');assert.equal(w.fwNovaStyle,'classic');assert.equal(w.fwColor,'#ffd06b');assert.equal(w.fwColor2,'#a764ff');assert.equal(w.width,540);
 }
 for(const key of ['royal','ice','rose','comet']){const w=factory.create('catalog:giftfireworks:'+key);assert.equal(w.width,360);assert.equal(w.fwNovaStyle,undefined);}
});
test('Supernova panel exposes three styles and only supported animation controls',()=>{
 const h=setup();assert.equal(h.document.querySelectorAll('#fwNovaStyle option').length,3);assert.equal(h.document.querySelectorAll('#fwNovaPalette option').length,5);
 assert.equal(h.document.getElementById('fwGiftImage').closest('details').open,false);
 for(const id of ['fwDuration','fwSpeed','fwPreset','fwReturn','fwDensity','fwExplosion','fwIntro','fwOutro'])assert.equal(h.document.getElementById(id),null,id+' should not promise an unused control');
 for(const id of ['fwMin','fwSound','fwExcludeAnon','fwVolume','fwGiftImage','propWidth','testFw'])assert.ok(h.document.getElementById(id));
});
test('style, palettes, custom colors, and reset update the real selected widget',()=>{
 const h=setup();change(h,'fwNovaStyle','willow');assert.equal(state(h).fwNovaStyle,'willow');change(h,'fwNovaPalette','ice');assert.equal(state(h).fwColor,'#dcecff');assert.equal(state(h).fwColor2,'#49cfff');
 change(h,'fwColor','#123456');assert.equal(state(h).fwColor,'#123456');assert.equal(h.document.getElementById('fwNovaPalette').value,'custom');
 change(h,'fwGiftImage','https://example.com/gift.png');assert.equal(state(h).fwGiftImage,'https://example.com/gift.png');
 const x=state(h).x;h.document.getElementById('fwNovaReset').click();assert.equal(state(h).fwNovaStyle,'classic');assert.equal(state(h).fwColor,'#ffd06b');assert.equal(state(h).fwColor2,'#a764ff');assert.equal(state(h).x,x);
});
test('test count and volume are clamped and legacy panel stays available',()=>{
 const h=setup();change(h,'fwCombo','1000');assert.equal(state(h).fwCombo,100);change(h,'fwVolume','20');assert.equal(state(h).fwVolume,20);
 h.window.eval("state.widgets[0].fwTheme='royal';render();bind()");assert.ok(h.document.getElementById('fwDuration'));assert.equal(h.document.getElementById('fwNovaStyle'),null);
});
