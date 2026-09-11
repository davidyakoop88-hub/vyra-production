'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {createDom, closeAll} = require('./helpers/dom-harness.js');
test.after(closeAll);

function boot() {
  const h = createDom();
  const run = code => {const s=h.document.createElement('script');s.textContent=code;h.document.body.append(s)};
  h.load('overlay-sanitize.js');
  h.load('guardian-emblem-fas.js');
  h.load('guardian-emblem-models.js');
  const create = key => h.window.VyraWidgets.create(key);
  return {h,run,create};
}

test('guld och gamla sparade widgetar behåller sina fyra praktsteg', () => {
  const {h,create} = boot();
  for (let steg=1;steg<=4;steg++) {
    const w=create('catalog:guardianemblem:'+steg);
    delete w.guardianModel;
    const box=h.paint([w]).firstElementChild;
    assert.match(box.querySelector('.ge-bild>img').src, new RegExp('steg-'+steg+'\\.png$'));
    assert.equal(box.classList.contains('gem-emerald'),false);
  }
});

test('grön modell använder sin bild och tar emot live-personens namn och avatar', () => {
  const {h,run,create} = boot(), w=create('catalog:guardianemblem:model:emerald');
  assert.equal(w.guardianModel,'emerald');
  assert.equal(w.guardianStep,4);
  run('state.widgets=['+JSON.stringify(w)+']');
  const box=h.paint([w]).firstElementChild;
  assert.ok(box.classList.contains('gem-emerald'));
  assert.match(box.querySelector('.ge-bild>img').src,/guardian-emblem\/emerald\.png$/);
  h.window.triggerGuardianEmblem({username:'@Lisa',profileImage:'https://example.com/lisa.png'});
  assert.equal(box.querySelector('.ge-namn').textContent,'@Lisa');
  assert.equal(box.querySelector('.ge-avatar img').src,'https://example.com/lisa.png');
  assert.ok(box.classList.contains('ge-fas-ljus'));
});

test('modellbyte genom panelen bevarar namn, text, praktsteg och användarens bredd', () => {
  const {h,run,create} = boot(), w=create('catalog:guardianemblem:2');
  Object.assign(w,{width:500,guardianUsername:'@David',guardianCustomText:'Välkommen hem'});
  run(`state.widgets=[${JSON.stringify(w)}];selected=state.widgets[0].id;view='editor';render();bind();`);
  let val=h.document.querySelector('#geModel');
  assert.ok(val,'modellväljaren ska vara tillgänglig i den riktiga panelen');
  val.value='emerald';val.dispatchEvent(new h.window.Event('change'));
  run('window.__modellWidget=JSON.parse(JSON.stringify(state.widgets[0]))');
  const bytt=h.window.__modellWidget;
  assert.equal(bytt.guardianModel,'emerald');
  assert.equal(bytt.guardianStep,2);
  assert.equal(bytt.guardianUsername,'@David');
  assert.equal(bytt.guardianCustomText,'Välkommen hem');
  assert.equal(bytt.width,500);
  assert.ok(h.document.querySelector('.gem-emerald'));
  assert.ok(h.document.querySelector('#geStep').closest('label').hidden);
  val=h.document.querySelector('#geModel');val.value='classic';val.dispatchEvent(new h.window.Event('change'));
  assert.equal(h.document.querySelector('#geStep').value,'2');
  assert.equal(h.document.querySelector('#geStep').closest('label').hidden,false);
  assert.match(h.document.querySelector('.canvas .ge-bild>img').src,/steg-2\.png$/);
});

test('katalogen visar grön miniatyr utan att skapa en widget i layouten', () => {
  const {h,run} = boot();
  run(`window.IntersectionObserver=function(cb){this.observe=el=>cb([{isIntersecting:true,target:el}],this);this.unobserve=()=>{};this.disconnect=()=>{}};`);
  h.load('overlay-preview.js');
  run("state.widgets=[];selected=null;view='overlay';render();bind();bind();");
  const knappar=h.document.querySelectorAll('[data-ge-model="emerald"]');
  assert.equal(knappar.length,1);
  const host=knappar[0].querySelector('.owg-thumb');
  const thumb=host&&(host.shadowRoot||host).querySelector('.gem-emerald');
  assert.ok(thumb,'den riktiga renderaren ska användas också i katalogkortet');
  assert.match(thumb.querySelector('.ge-bild>img').src,/emerald\.png$/);
  run('window.__antal=state.widgets.length');
  assert.equal(h.window.__antal,0);
});

test('de fyra faserna spelas i ordning med den gröna modellen', () => {
  const {h,create} = boot(), w=create('catalog:guardianemblem:model:emerald');
  const box=h.paint([w]).firstElementChild,F=h.window.VyraGuardianEmblemFas,jobs=[];
  F.klocka.satt=(fn,ms)=>{jobs.push({fn,ms});return jobs.length};F.klocka.rensa=()=>{};
  assert.equal(F.spela(box),true);
  const phase=()=>[...box.classList].filter(c=>c.startsWith('ge-fas-'));
  assert.deepEqual(phase(),['ge-fas-ljus']);
  jobs[0].fn();assert.deepEqual(phase(),['ge-fas-oppna']);
  jobs[1].fn();assert.deepEqual(phase(),['ge-fas-hyllning']);
  jobs[2].fn();assert.deepEqual(phase(),['ge-fas-upplosning']);
  jobs[3].fn();assert.deepEqual(phase(),[]);
  assert.ok(jobs[3].ms<6500,'utgången ska hinna avslutas innan alerten släcks');
});
