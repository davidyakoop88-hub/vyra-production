'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDom,closeAll}=require('./helpers/dom-harness.js');
const factory=require('../widget-factory.js');
test.after(closeAll);
const designs=factory.variants('battlemvp.celebration');
for(const key of Object.keys(designs))if(!designs[key].bespoke)test(key+' renders a real winner through the existing MVP renderer',()=>{
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
  assert.equal(box.querySelectorAll('.mvc-charge,.mvc-smoke,.mvc-art-left,.mvc-copy,.mvc-finale').length,4);

});
test('Lion Clash renders its own animated emblem through the MVP renderer',()=>{
  const w=factory.create('catalog:battlemvp:celebration:lion-clash');
  Object.assign(w,{id:'lion-w',mvpName:'A <winner>',profileImage:'https://example.com/avatar.png',mvpDuration:12});
  const h=createDom({state:{widgets:[w],projectName:'test'}});h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  const box=h.paint([w]).querySelector('.mvc-lion-clash');
  assert.ok(box,'lion-clash-boxen saknas');
  assert.equal(box.querySelector('.lion-name').textContent,'A <winner>');
  assert.equal(box.querySelector('.lion-photo').src,'https://example.com/avatar.png');
  assert.match(box.querySelector('.lion-art').src,/lion-clash\.png$/);
  assert.equal(box.querySelectorAll('.eye').length,2);
  assert.equal(box.querySelectorAll('.energy path').length,2);
  assert.ok(box.querySelector('.crown-flash')&&box.querySelector('.plate-shine'));
  assert.equal(box.style.getPropertyValue('--lion-dur'),'12s');
  assert.equal(box.querySelector('.mvc-portrait'),null,'bespoke-designen anvander inte firande-mallen');
});
test('explicit visibility flags and unsafe portrait URL are respected',()=>{
  const w=factory.create('catalog:battlemvp:celebration:moon');Object.assign(w,{id:'safe',mvpShowName:false,mvpShowLabel:false,profileImage:'javascript:alert(1)'});
  const h=createDom({state:{widgets:[w],projectName:'test'}});h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  const box=h.paint([w]).querySelector('.mvp-celebration');
  assert.equal(box.querySelector('h2').style.display,'none');assert.equal(box.querySelector('small').style.display,'none');
  assert.match(box.querySelector('.mvc-portrait img').src,/test-profile.svg$/);

});
test('all catalog choices, selector and actual thumbnail renderers are available',()=>{
  const h=createDom();h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  h.window.eval("view='editor'; render(); bind()");
  const buttons=h.document.querySelectorAll('[data-mvp-celebration]');assert.equal(buttons.length,Object.keys(designs).length);
  const target=[...buttons].find(b=>b.dataset.mvpCelebration==='pearl');target.click();
  assert.equal(h.document.querySelector('#mvpStyle').value,'pearl');
  assert.equal(h.document.querySelectorAll('#mvpStyle optgroup option').length,Object.keys(designs).length);
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

test('Guldkrona has compact timing, raster art and honest fixed-band settings',()=>{
  const w=factory.create('catalog:battlemvp:celebration:gold-ribbon');
  assert.equal(w.width,280);assert.equal(w.mvpDuration,10);
  const h=createDom({state:{widgets:[w],projectName:'test'}});h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  const box=h.paint([w]).querySelector('.mvc-gold-ribbon');
  assert.match(box.querySelector('.mvc-art').src,/gold-ribbon.png$/);
  assert.equal(box.dataset.mvcParticles,'off');
  assert.match(box.querySelector('.mvc-smoke').src,/gold-ribbon-smoke.png$/);
  h.window.eval("selected=state.widgets[0].id; view='editor'; render(); bind()");
  assert.equal(h.document.querySelector('#mvpLabel'),null);
  assert.equal(h.document.querySelector('#mvpColor'),null);
  assert.equal(h.document.querySelector('#bkInherit'),null);
  const hints=[...h.document.querySelectorAll('small')].map(el=>el.textContent).join('\n');
  assert.ok(!hints.includes('byt rubrik'));
  assert.ok(hints.includes('I lagmatcher kan vinnaren tillhöra en medvärd.'));
  assert.equal(h.document.querySelector('#mvpShowLabelMain'),null);
  assert.equal(h.document.querySelector('#mvpShowCoins'),null);
  assert.equal(h.document.querySelector('#mvpDuration').step,'0.1');
  assert.equal(h.document.querySelector('#mvpFxIntensity'),null);
});

test('Guldkrona live patch updates the real portrait without replacing entrance artwork',()=>{
  const w=factory.create('catalog:battlemvp:celebration:gold-ribbon');w.id='gold-live';
  const h=createDom({state:{widgets:[w],projectName:'test'}});h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  h.window.eval("view='editor'; selected=state.widgets[0].id; render()");
  const before=h.document.querySelector('.canvas [data-id="gold-live"]');
  assert.ok(before);assert.ok(before.querySelector('img').closest('.mvc-portrait'));
  h.window.eval("triggerBattleMvp({name:'Ny vinnare',profileImage:'https://example.com/new-winner.png',score:9500})");
  const box=h.document.querySelector('.canvas [data-id="gold-live"]');
  assert.equal(box,before,'the existing node is patched without restarting its layers');
  assert.equal(box.querySelector('.mvc-portrait img').src,'https://example.com/new-winner.png');
  assert.match(box.querySelector('.mvc-smoke').src,/gold-ribbon-smoke.png$/);
  assert.equal(box.querySelector('h2').textContent,'Ny vinnare');
  assert.ok(box.classList.contains('mvp-active'));
});

test('Guldkrona never allocates a particle canvas for its raster entrance',()=>{
  const w=factory.create('catalog:battlemvp:celebration:gold-ribbon');
  const h=createDom({state:{widgets:[w],projectName:'test'}});h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  const box=h.paint([w]).querySelector('.mvc-gold-ribbon');box.classList.add('mvp-active');
  let allocations=0;
  h.window.HTMLCanvasElement.prototype.getContext=function(){allocations++;return null};
  h.load('battle-mvp-particles.js');h.window.VyraMvpParticles.scan();
  assert.equal(allocations,0);assert.equal(box.querySelectorAll('canvas').length,0);
  assert.equal(h.window.VyraMvpParticles.active(),0);
});


test('all 17 basic presets retain winner data and saved duration under distinct motion hooks',()=>{
  const h=createDom();h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  for(const family of ['style','frame'])for(const key of Object.keys(factory.variants('battlemvp.'+family))){
    const w=factory.create('catalog:battlemvp:'+(family==='frame'?'frame:':'')+key);
    assert.equal(w.mvpDuration,10,'new presets grant a readable winner hold');
    Object.assign(w,{id:'basic-'+key,mvpName:'Winner <A>',profileImage:'https://example.com/winner.png',mvpDuration:12});
    const box=h.paint([w]).querySelector('.battle-mvp');
    assert.equal(box.dataset.mvpMotion,key);
    assert.equal(box.style.getPropertyValue('--mvm-duration'),'12s','saved duration stays authoritative');
    assert.equal(box.querySelector('img').src,'https://example.com/winner.png','live avatar slot belongs to the winner');
    assert.ok(box.textContent.includes('Winner <A>'));
    assert.equal(box.querySelectorAll('canvas').length,0,'BASIC adds no particle renderer');
  }
});

test('profile-only live update cannot overwrite a BASIC frame asset',()=>{
  const w=factory.create('catalog:battlemvp:frame:gold-crown');w.id='frame-live';w.mvpName='Same winner';
  const h=createDom({state:{widgets:[w],projectName:'test'}});h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  h.paint([w]);
  const before=h.document.querySelector('.mvpf-art').src;
  h.window.eval("triggerBattleMvp({profileImage:'https://example.com/new-avatar.png'})");
  assert.equal(h.document.querySelector('.mvpf-photo img').src,'https://example.com/new-avatar.png');
  assert.equal(h.document.querySelector('.mvpf-art').src,before);
});


test('retired Gold Crown is absent from new choices but saved layouts still render',()=>{
  const w=factory.create('catalog:battlemvp:frame:gold-crown');w.id='saved-gold-crown';
  const h=createDom({state:{widgets:[w],projectName:'test'}});h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  h.window.eval("view='editor'; selected='saved-gold-crown'; render(); bind()");
  assert.equal(h.document.querySelector('[data-mvp-frame="gold-crown"]'),null);
  assert.equal(h.document.querySelector('[data-catalog-key="catalog:battlemvp:frame:gold-crown"]'),null);
  assert.equal(h.document.querySelector('[data-battle-mvp] h4').textContent,'BATTLE MVP · 12 DESIGNER');
  assert.equal(h.document.querySelectorAll('[data-battle-mvp] [data-mvp-frame]').length,6);
  // An older frame selector must not reintroduce the retired choice on the next bind.
  const picker=h.document.createElement('select');picker.id='mvpFrame';
  picker.innerHTML='<option value="gold-crown">Gold Crown</option><option value="royal-ribbon">Royal Ribbon</option>';
  h.document.body.append(picker);h.window.eval('bind()');
  assert.equal(picker.querySelector('[value="gold-crown"]'),null);
  assert.ok(picker.querySelector('[value="royal-ribbon"]'));
  const box=h.paint([w]).querySelector('.mvp-framed');
  assert.ok(box);assert.match(box.querySelector('.mvpf-art').src,/gold-crown.png$/);
  assert.equal(factory.variants('battlemvp.frame')['gold-crown'].label,'Gold Crown');
});


test('four retired styles are not selectable while existing saved designs remain renderable',()=>{
  const styles=['royal-purple','ice','diamond-elite','neon-cyber'];
  const h=createDom();h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  h.window.eval("view='editor'; render(); bind()");
  assert.equal(h.document.querySelectorAll('[data-battle-mvp] [data-mvp-style]').length,6);
  assert.equal(h.document.querySelector('[data-battle-mvp] h4').textContent,'BATTLE MVP · 12 DESIGNER');
  for(const key of styles){
    assert.equal(h.document.querySelector('[data-mvp-style="'+key+'"]'),null);
    assert.equal(h.document.querySelector('[data-catalog-key="catalog:battlemvp:'+key+'"]'),null);
    const w=factory.create('catalog:battlemvp:'+key);w.id='saved-'+key;
    h.window.eval('state.widgets='+JSON.stringify([w])+";selected='"+w.id+"';render();bind()");
    assert.equal(h.document.querySelector('#mvpStyle option[value="'+key+'"]'),null);
    const box=h.paint([w]).querySelector('.battle-mvp');
    assert.ok(box.classList.contains('mvp-'+key));
    assert.equal(box.dataset.mvpMotion,key);
    assert.ok(box.querySelector('img'));
  }
});


test('WOW signature decoration preserves live avatar slot and hidden labels; BASIC and Guldkrona stay separate',()=>{
  const h=createDom();h.load('overlay-sanitize.js');h.load('battle-mvp-celebrations.js');
  for(const key of ['coronation','wings','portal','rosegold','pearl','moon']){
    const w=factory.create('catalog:battlemvp:celebration:'+key);
    Object.assign(w,{id:'signature-'+key,profileImage:'https://example.com/real-winner.png',mvpShowLabel:false,mvpShowName:false});
    const box=h.paint([w]).querySelector('.battle-mvp');
    const signature=box.querySelector('.mvc-signature');
    assert.ok(signature,'WOW has a measured decorative layer');
    assert.equal(signature.getAttribute('aria-hidden'),'true');
    assert.equal(signature.textContent,'','decorations never duplicate label or winner text');
    assert.equal(signature.querySelector('img'),null,'live image slot is never decoration');
    assert.equal(box.querySelector('img').src,'https://example.com/real-winner.png');
    assert.equal(box.querySelector('.mvc-copy small').style.display,'none');
    assert.equal(box.querySelector('.mvc-copy h2').style.display,'none');
    assert.equal(w.mvpDuration,10);
  }
  for(const key of ['catalog:battlemvp:celebration:gold-ribbon','catalog:battlemvp:inferno','catalog:battlemvp:frame:royal-ribbon']){
    assert.equal(h.paint([factory.create(key)]).querySelector('.mvc-signature'),null);
  }
});
