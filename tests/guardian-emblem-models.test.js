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
  h.load('guardian-session.js');
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
    assert.equal(box.classList.contains('gem-model'),false);
  }
});

for (const model of ['sapphire','emerald']) {
test(model + ': originalbilden och live-personens namn, avatar och egen text följer med', () => {
  const {h,run,create} = boot(), w=create('catalog:guardianemblem:model:' + model);
  assert.equal(w.guardianModel,model);
  w.guardianCustomText='Välkommen hem, beskyddare!';
  assert.equal(w.guardianStep,4);
  run('state.widgets=['+JSON.stringify(w)+']');
  const box=h.paint([w]).firstElementChild;
  assert.ok(box.classList.contains('gem-' + model));
  assert.ok(box.querySelector('.ge-bild>img').src.endsWith('/guardian-emblem/' + model + '.png'));
  h.window.routeLiveBattleEvent({type:'guardian',username:'@Lisa',profileImage:'https://example.com/lisa.png'});
  assert.equal(box.querySelector('.ge-namn').textContent,'@Lisa');
  assert.equal(box.querySelector('.ge-avatar img').src,'https://example.com/lisa.png');
  assert.ok(box.classList.contains('ge-fas-ljus'));
  assert.equal(box.querySelector('.ge-undertext').textContent,'Välkommen hem, beskyddare!');
});

test(model + ': modellbyte bevarar namn, profilbild, text, praktsteg och användarens bredd', () => {
  const {h,run,create} = boot(), w=create('catalog:guardianemblem:2');
  Object.assign(w,{width:500,guardianUsername:'@David',guardianAvatar:'https://example.com/david.png',guardianCustomText:'Välkommen hem'});
  run(`state.widgets=[${JSON.stringify(w)}];selected=state.widgets[0].id;view='editor';render();bind();`);
  let val=h.document.querySelector('#geModel');
  assert.ok(val,'modellväljaren ska vara tillgänglig i den riktiga panelen');
  val.value=model;val.dispatchEvent(new h.window.Event('change'));
  run('window.__modellWidget=JSON.parse(JSON.stringify(state.widgets[0]))');
  const bytt=h.window.__modellWidget;
  assert.equal(bytt.guardianModel,model);
  assert.equal(bytt.guardianAvatar,'https://example.com/david.png');
  assert.equal(bytt.guardianStep,2);
  assert.equal(bytt.guardianUsername,'@David');
  assert.equal(bytt.guardianCustomText,'Välkommen hem');
  assert.equal(bytt.width,500);
  assert.ok(h.document.querySelector('.gem-' + model));
  assert.ok(h.document.querySelector('#geStep').closest('label').hidden);
  val=h.document.querySelector('#geModel');val.value='classic';val.dispatchEvent(new h.window.Event('change'));
  assert.equal(h.document.querySelector('#geStep').value,'2');
  assert.equal(h.document.querySelector('#geStep').closest('label').hidden,false);
  assert.match(h.document.querySelector('.canvas .ge-bild>img').src,/steg-2\.png$/);
});

test(model + ': katalogen visar riktig miniatyr utan att skapa en widget i layouten', () => {
  const {h,run} = boot();
  run(`window.IntersectionObserver=function(cb){this.observe=el=>cb([{isIntersecting:true,target:el}],this);this.unobserve=()=>{};this.disconnect=()=>{}};`);
  h.load('overlay-preview.js');
  run("state.widgets=[];selected=null;view='overlay';render();bind();bind();");
  const knappar=h.document.querySelectorAll('[data-ge-model="' + model + '"]');
  assert.equal(knappar.length,1);
  const host=knappar[0].querySelector('.owg-thumb');
  const thumb=host&&(host.shadowRoot||host).querySelector('.gem-' + model);
  assert.ok(thumb,'den riktiga renderaren ska användas också i katalogkortet');
  assert.ok(thumb.querySelector('.ge-bild>img').src.endsWith('/' + model + '.png'));
  run('window.__antal=state.widgets.length');
  assert.equal(h.window.__antal,0);
});

test(model + ': de fyra faserna spelas i ordning', () => {
  const {h,create} = boot(), w=create('catalog:guardianemblem:model:' + model);
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

test(model + ': en besökare utan profilbild ärver inte föregående besökares foto', () => {
  const {h,run,create}=boot(),w=create('catalog:guardianemblem:model:' + model);
  run('state.widgets=['+JSON.stringify(w)+']');
  const box=h.paint([w]).firstElementChild;
  h.window.triggerGuardianEmblem({username:'@Lisa',profileImage:'https://example.com/lisa.png'});
  h.window.triggerGuardianEmblem({username:'@Omar'});
  assert.equal(box.querySelector('.ge-namn').textContent,'@Omar');
  assert.equal(box.querySelector('.ge-avatar img'),null,'Lisas bild ligger kvar under Omars namn');
  run("state.widgets[0].guardianAvatar='https://example.com/reserv.png'");
  h.window.triggerGuardianEmblem({username:'@Mira'});
  assert.equal(box.querySelector('.ge-avatar img').src,'https://example.com/reserv.png');
});
}

test('okänd modell återgår till guld och eget namn kan döljas i båda nya modellerna', () => {
  const {h,create}=boot();
  const w=create('catalog:guardianemblem:2');
  w.guardianModel='saknas';
  assert.match(h.paint([w]).querySelector('.ge-bild>img').src,/steg-2\.png$/);
  for(const model of ['sapphire','emerald']) {
    Object.assign(w,{guardianModel:model,guardianShowUsername:false,guardianCustomText:'<b>David & team</b>',guardianLang:'en'});
    const box=h.paint([w]).firstElementChild;
    assert.equal(box.querySelector('.ge-namn'),null);
    assert.equal(box.querySelector('.ge-undertext').textContent,'<b>David & team</b>');
    assert.equal(box.querySelector('.ge-undertext b'),null);
    assert.equal(box.querySelector('.gem-rubrik').textContent,'GUARDIAN');
    assert.equal(box.querySelector('.gem-intro').textContent,'A GUARDIAN ARRIVES');
  }
});
