'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDom,closeAll}=require('./helpers/dom-harness.js');
const factory=require('../widget-factory.js');
test.after(closeAll);
test('Aura replaces old campaign appearance without mutating saved gifts or placement',()=>{
 const h=createDom();h.load('overlay-sanitize.js');h.load('gift-campaign-aura.js');
 for(const orientation of ['landscape','portrait'])for(const giftCount of [1,4,6]){
  const w=factory.create('catalog:giftcampaign:aurora:'+orientation);Object.assign(w,{id:'aura',giftCount,x:117,y:212,width:377,giftCurrent0:0,giftTarget0:123,giftName0:'A <gift>',giftImage0:'https://example.com/rose.png'});
  const before=JSON.stringify(w),root=h.document.createElement('div');root.innerHTML=h.window.VyraCampaignAura.html(w);
  assert.equal(root.querySelectorAll('.gift').length,giftCount);assert.equal(root.querySelector('.vyra-campaign-aura').dataset.theme,'emerald');assert.equal(root.querySelector('.count b').textContent,'0');assert.equal(root.querySelector('.name').textContent,'A <gift>');assert.equal(root.querySelector('.frame img').getAttribute('src'),w.giftImage0);assert.match(root.firstChild.style.cssText,/width: 377px/);assert.equal(JSON.stringify(w),before);assert.equal(root.querySelectorAll('.vyra-campaign,.campaign-flow').length,0);
 }
});
test('New campaign catalog offers only approved themes in both orientations',()=>{
 const h=createDom();h.load('overlay-sanitize.js');h.load('gift-campaign-aura.js');
 const script=h.document.createElement('script');script.textContent=`view='editor';document.querySelector('#view').innerHTML='<div class="widget-catalog"><section data-campaign-template="1"><button data-campaign-theme="retro">Old</button></section></div>';bind();`;h.document.body.append(script);
 const cards=[...h.document.querySelectorAll('[data-campaign-template] button')];assert.equal(cards.length,6);assert.deepEqual([...new Set(cards.map(c=>c.dataset.campaignTheme))],['gold','platinum','emerald']);
 for(const card of cards){const w=factory.create(card.dataset.catalogKey);assert.equal(w.campaignTheme,card.dataset.campaignTheme);assert.equal(w.campaignSound,false);assert.equal(w.campaignVolume,30)}
});
test('Campaign settings expose approved motion and optional sound without ineffective color inheritance',()=>{
 const w=factory.create('catalog:giftcampaign:emerald:portrait');Object.assign(w,{id:'settings-aura',campaignMotion:'wave',campaignDirection:1,campaignSound:true,campaignVolume:42});
 const h=createDom({state:{widgets:[w]}});h.load('overlay-sanitize.js');h.load('gift-campaign-aura.js');
 const script=h.document.createElement('script');script.textContent=`view='editor';selected='settings-aura';document.querySelector('#view').innerHTML='<aside class="properties">'+props()+'</aside>';bind();`;h.document.body.append(script);
 assert.deepEqual([...h.document.querySelectorAll('#campaignTheme option')].map(o=>o.value),['gold','platinum','emerald']);
 assert.equal(h.document.querySelector('#campaignMotion').value,'wave');assert.equal(h.document.querySelector('#campaignDirection').value,'1');assert.equal(h.document.querySelector('#campaignVolume').value,'42');assert.equal(h.document.querySelector('#campaignSound').checked,true);
 assert.equal(h.document.querySelector('#bkInherit'),null);assert.equal(h.document.querySelector('#campaignAccent'),null);
});
