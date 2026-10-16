'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDom,closeAll}=require('./helpers/dom-harness.js');
const factory=require('../widget-factory.js');
test.after(closeAll);
function setup(theme='supernova',overrides={}){
 const w=factory.create('catalog:giftfireworks:'+theme);Object.assign(w,overrides);w.id='nova';
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
  assert.equal(w.fwTheme,'supernova');assert.equal(w.fwNovaStyle,'classic');assert.equal(w.fwColor,'#ffd06b');assert.equal(w.fwColor2,'#a764ff');assert.equal(w.width,360);
 }
 for(const key of ['royal','ice','rose','comet']){const w=factory.create('catalog:giftfireworks:'+key);assert.equal(w.width,360);assert.equal(w.fwNovaStyle,undefined);}
});
// 2026-10-17: panelen är byggd som widget-playgroundens (RÖRELSE, STIL, FYRVERKERI, LJUD,
// POSITION & STORLEK). Varje reglage skriver till just den valda widgeten.
test('panelen har playgroundens ordning och inga döda reglage',()=>{
 const h=setup('festival');
 const rubriker=[...h.document.querySelectorAll('.property-group h4')].map(x=>x.textContent);
 assert.deepEqual(rubriker,['RÖRELSE','STIL','FYRVERKERI','LJUD','POSITION & STORLEK']);
 const stil=[...h.document.querySelectorAll('.property-group')][1].textContent;
 let pos=-1;for(const ord of ['Bildram (HD)','Entré / utgång','Ramlager på avatar','Namneffekt','Färgpalett','Färg 1','Färg 2','Textfärg','Typsnitt','Storlek','Rörelsehastighet','Glöd','Rundning','Position']){const n=stil.indexOf(ord,pos+1);assert.ok(n>pos,ord+' saknas eller står fel');pos=n}
 assert.equal(h.document.querySelectorAll('[data-fwsw]').length,24);
 for(const id of ['fwDuration','fwSpeed','fwPreset','fwReturn','fwDensity','fwExplosion','fwNovaStyle','fwNovaPalette','fwGiftImage'])assert.equal(h.document.getElementById(id),null,id+' ska inte finnas');
 for(const id of ['testFw','fwCombo','fwCanvasTheme','fwFinal','fwMin','fwLanes','fwExcludeAnon','fwSound','fwVolume','propWidth','del'])assert.ok(h.document.getElementById(id),id);
});
test('stilreglagen sparas på den valda widgeten',()=>{
 const h=setup('festival');
 const val={fwFrameImg:'none',fwEnter:'bounce',fwFrameFx:'halo',fwNameFx:'aurora',fwTextColor:'#ffeeaa',fwColor:'#123456',fwColor2:'#654321'};
 for(const [id,v] of Object.entries(val)){change(h,id,v);assert.equal(state(h)[id],v,id)}
 change(h,'fwFont','Georgia,serif');assert.equal(state(h).fwFont,'Georgia,serif');
 for(const [id,v,ut] of [['fwScale','1.4',1.4],['fwPlaySpeed','9',2.5],['fwGlow','0.3',.3],['fwRadius','12',12],['fwFinal','5000',5000],['fwMin','10',10],['fwLanes','5',5]]){change(h,id,v);assert.equal(state(h)[id],ut,id)}
 h.document.querySelector('[data-fwsw="#ff3b3b|#ff9a3d"]').click();assert.equal(state(h).fwColor,'#ff3b3b');assert.equal(state(h).fwColor2,'#ff9a3d');assert.equal(state(h).inheritBrandKit,false);
 assert.ok(h.document.querySelector('[data-fwsw="#ff3b3b|#ff9a3d"]').classList.contains('on'));
 change(h,'fwPos','top');assert.equal(state(h).y,8);change(h,'fwPos','bottom');assert.ok(state(h).y>300);
});
test('temat byter färger men behåller placering',()=>{
 const h=setup('ice',{x:321,y:456,width:377});
 for(const key of ['festival','royal','rose','comet','supernova']){
  change(h,'fwCanvasTheme',key);const original=factory.create('catalog:giftfireworks:'+key);
  assert.equal(state(h).fwTheme,key);assert.equal(state(h).fwColor,original.fwColor);assert.equal(state(h).fwColor2,original.fwColor2);
  assert.equal(state(h).width,377);assert.equal(state(h).x,321);assert.equal(state(h).y,456);
 }
});
test('test count and volume are clamped and legacy panel stays available',()=>{
 const h=setup();change(h,'fwCombo','1000');assert.equal(state(h).fwCombo,100);change(h,'fwVolume','20');assert.equal(state(h).fwVolume,20);
 h.window.eval("delete state.widgets[0].fwTheme;state.widgets[0].fwMotion='magnetic';render();bind()");assert.ok(h.document.getElementById('fwDuration'));assert.equal(h.document.getElementById('fwFrameImg'),null);
});
