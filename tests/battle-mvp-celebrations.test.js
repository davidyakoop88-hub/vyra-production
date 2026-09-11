'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDom,closeAll}=require('./helpers/dom-harness.js');
const factory=require('../widget-factory.js');
test.after(closeAll);
const designs=factory.variants('battlemvp.celebration');
for(const key of Object.keys(designs))test(key+' renders a real winner through the existing MVP renderer',()=>{
  const w=factory.create('catalog:battlemvp:celebration:'+key);
  Object.assign(w,{id:'winner',mvpName:'A <winner>',profileImage:'https://example.com/avatar.png',mvpDuration:12});
  const h=createDom({state:{widgets:[w],projectName:'test'}});h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  const box=h.paint([w]).querySelector('.mvp-celebration');
  assert.ok(box.classList.contains('mvc-'+key));
  assert.equal(box.querySelector('h2').textContent,'A <winner>');
  assert.equal(box.querySelector('.mvc-portrait img').src,'https://example.com/avatar.png');
  assert.equal(box.style.getPropertyValue('--mvc-duration'),'12s');
  assert.equal(box.querySelector('.mvc-copy small').textContent,'MVP');
  assert.equal(box.querySelectorAll('.mvc-finale i').length,20);
  assert.equal(box.querySelectorAll('strong').length,0,'no coins leak');
  assert.equal(w.mvpShowName,true);assert.equal(w.mvpShowCoins,false);
  assert.equal(box.querySelectorAll('.mvc-charge,.mvc-art-left,.mvc-copy,.mvc-finale').length,4);

});
test('explicit visibility flags and unsafe portrait URL are respected',()=>{
  const w=factory.create('catalog:battlemvp:celebration:moon');Object.assign(w,{id:'safe',mvpShowName:false,mvpShowLabel:false,profileImage:'javascript:alert(1)'});
  const h=createDom({state:{widgets:[w],projectName:'test'}});h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  const box=h.paint([w]).querySelector('.mvp-celebration');
  assert.equal(box.querySelector('h2').style.display,'none');assert.equal(box.querySelector('small').style.display,'none');
  assert.match(box.querySelector('.mvc-portrait img').src,/test-profile.svg$/);

});
test('six catalog choices, selector and actual thumbnail renderers are available',()=>{
  const h=createDom();h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  h.window.eval("view='editor'; render(); bind()");
  const buttons=h.document.querySelectorAll('[data-mvp-celebration]');assert.equal(buttons.length,6);
  const target=[...buttons].find(b=>b.dataset.mvpCelebration==='pearl');target.click();
  assert.equal(h.document.querySelector('#mvpStyle').value,'pearl');
  assert.equal(h.document.querySelectorAll('#mvpStyle optgroup option').length,6);
  assert.ok(h.paintPreview(factory.create('catalog:battlemvp:celebration:pearl')).querySelector('.mvc-art'));

});
test('legacy MVP rendering stays on its original path',()=>{
  const w=factory.create('catalog:battlemvp:inferno');const h=createDom();h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  const box=h.paint([w]);assert.ok(box.querySelector('.mvp-inferno'));assert.equal(box.querySelector('.mvp-celebration'),null);
});


test('live trigger supplies winner data to the new design and preserves hidden layer',()=>{
  const w=factory.create('catalog:battlemvp:celebration:coronation');w.id='live-winner';
  const hidden={...factory.create('catalog:battlemvp:celebration:moon'),id:'hidden-mvp',hidden:true};
  const h=createDom({state:{widgets:[w,hidden],projectName:'test'}});h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  h.window.render=()=>h.paint(h.window.eval("state.widgets"));
  h.window.eval("triggerBattleMvp({name:'Live Winner',profileImage:'https://example.com/live.png',score:9200})");
  assert.equal(h.document.querySelector('[data-id="live-winner"] h2').textContent,'Live Winner');
  assert.ok(h.document.querySelector('[data-id="live-winner"]').classList.contains('mvp-active'));
  const hiddenBox=h.document.querySelector('[data-id="hidden-mvp"]');
  if(hiddenBox){assert.equal(hiddenBox.style.display,'none');assert.equal(hiddenBox.style.getPropertyPriority('display'),'important');}
  assert.equal(h.window.eval("state.widgets.some(w=>w.id==='hidden-mvp' && w.hidden)"),true);
});
