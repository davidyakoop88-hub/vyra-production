'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const M=require('../battle-analytics-model');
const {JSDOM}=require('jsdom');
test('repeated starts preserve a battle; finish is deduplicated; zero scores remain unknown',()=>{
 const s=M.empty();const event={type:'battle',battleId:'a',battleStatus:'battle_started',scoreUs:100,scoreThem:50};
 M.receive(s,{...event,id:'1'},100);M.receive(s,{...event,id:'2',scoreUs:120},200);assert.equal(s.active.at,100);
 M.receive(s,{...event,id:'3',battleStatus:'battle_finished',scoreUs:0,scoreThem:0},300);assert.equal(s.history[0].us,120);assert.equal(s.history[0].result,'win');assert.equal(s.active,null);
 M.receive(s,{...event,id:'4',battleStatus:'battle_punish_started'},400);assert.equal(s.history.length,1);assert.equal(s.history[0].endedAt,300);
 assert.equal(M.receive(s,{...event,id:'5'},500),false);assert.equal(s.active,null);
 M.receive(s,{...event,id:'6',battleId:'b',battleStatus:'battle_finished',scoreUs:0,scoreThem:0},600);assert.equal(s.history[0].result,'unknown');
});
test('simulation, unstarted statuses and unrelated boost events cannot create history or inventory',()=>{
 const s=M.empty();for(const event of [{__simulerad:true,battleStatus:'battle_started'},{test:true,battleStatus:'battle_started'},{battleStatus:'not_started'}])M.receive(s,{type:'battle',battleId:'a',...event});
 M.receive(s,{type:'glove',battleId:'a',multiplier:5,durationSec:30});assert.equal(s.active,null);assert.equal(s.boost,null);assert.equal(s.boosters.length,0);
 M.receive(s,{type:'battle',battleId:'a',battleStatus:'battle_started'});M.receive(s,{type:'glove',battleId:'a',multiplier:5,durationSec:30},1000);assert.equal(s.boost.until,31000);assert.equal(s.boosters.length,0);
});
test('manual boosters validate counts, identity and calendar date; filters exclude expired entries',()=>{
 const a=M.booster({user:'@Anna',kind:'glove',count:2,expires:'2030-12-31'},1);assert.equal(a.user,'anna');assert.equal(a.source,'manual');
 for(const input of [{...a,count:-1},{...a,count:1.5},{...a,user:'<script>'},{...a,expires:'2030-02-30'},{...a,kind:'invented'}])assert.throws(()=>M.booster(input,1));
 const s=M.empty();s.boosters=[a,{...a,kind:'fog',user:'bob'},{...a,expires:'2020-01-01'}];assert.equal(M.visibleBoosters(s,'glove','ann',Date.UTC(2026,10,1)).length,1);
});
test('restoring history never restores a stale active battle; malformed data is ignored',()=>{
 const s=M.restore(JSON.stringify({active:{id:'stale'},history:[{id:'a',result:'win',us:5,them:2}],boosters:[{user:'anna',kind:'glove',count:2}]}));assert.equal(s.active,null);assert.equal(s.history.length,1);assert.equal(s.boosters.length,1);assert.equal(M.restore('not json').history.length,0);
});
test('history and event dedupe memory are bounded',()=>{
 const s=M.empty();for(let i=0;i<600;i++)M.receive(s,{id:String(i),type:'battle',battleId:String(i),battleStatus:'battle_finished',scoreUs:1,scoreThem:0},i+1);assert.equal(s.history.length,200);assert.equal(s.seen.length,500);
});
test('battle UI opens, filters manual boosters, and isolates account changes without duplicate tabs',async()=>{
 const dom=new JSDOM('<!doctype html><section data-statistics-page><header>General</header></section>',{runScripts:'outside-only',url:'https://vyra.test'});const w=dom.window;let account='anna';w.VyraCloudSync={current:()=>({workspace:{id:'ws'}})};w.VyraLive={tillstand:()=>({konto:account,gron:true,text:'Ansluten'})};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new w.Event('close'))};
 try{
  w.eval(fs.readFileSync('battle-analytics-model.js','utf8'));w.eval(fs.readFileSync('battle-analytics.js','utf8'));await new Promise(resolve=>setTimeout(resolve,10));const d=w.document;
  d.querySelector('.battle-analytics-tabs button:last-child').click();assert.equal(d.querySelector('.battle-analytics-page').hidden,false);assert.equal(d.querySelector('[data-statistics-page]>header').hidden,true);
  d.querySelector('[data-battle-add]').click();const form=d.querySelector('dialog form');form.elements.user.value='viewer';form.elements.count.value=2;form.dispatchEvent(new w.Event('submit',{cancelable:true}));assert.match(d.querySelector('[data-battle-boosters]').textContent,/Handske ×2/);
  d.querySelector('[data-battle-clear]').click();assert.doesNotMatch(d.querySelector('[data-battle-boosters]').textContent,/Handske ×2/);d.querySelector('[data-battle-undo]').click();assert.match(d.querySelector('[data-battle-boosters]').textContent,/Handske ×2/);
  account='other';w.dispatchEvent(new w.CustomEvent('vyra-live-tillstand'));assert.doesNotMatch(d.querySelector('[data-battle-boosters]').textContent,/Handske ×2/);
  account='anna';w.dispatchEvent(new w.CustomEvent('vyra-live-tillstand'));assert.match(d.querySelector('[data-battle-boosters]').textContent,/Handske ×2/);
  w.dispatchEvent(new w.CustomEvent('vyra-auth-identity-cleared'));await new Promise(resolve=>setTimeout(resolve,10));assert.equal(d.querySelectorAll('.battle-analytics-tabs').length,1);assert.equal(d.querySelector('[data-battle-add]').disabled,true);
 }finally{dom.window.close()}
});

// Granskningen 2026-11-01. Bryggans normalizer gör TikToks siffror till ord (action 4 = OPEN,
// 5 = FINISH, battleSettings.status 3 = PUNISH_STARTED); modellen ska förstå just de orden.
test('riktiga statusar från bryggans normalizer: öppna, poäng, avsluta, straff — en match, poängvinst',()=>{
 const {battleFields}=require('../tiktok-bridge/normalizer');
 const s=M.empty(),ev=(id,raw)=>({type:'battle',id,...battleFields(raw)});
 assert.equal(ev('x',{action:4,battleId:'7'}).battleStatus,'battle_started','normalizern har bytt ord — modellen måste följa med');
 M.receive(s,ev('1',{action:4,battleId:'7'}),100);
 M.receive(s,ev('2',{battleId:'7',battleSettings:{status:1},battleInfo:{hostScore:900,guestScore:400}}),200);
 assert.equal(s.active.us,900);
 M.receive(s,ev('3',{action:5,battleId:'7'}),300);
 M.receive(s,ev('4',{battleId:'7',battleSettings:{status:3}}),400);
 assert.equal(s.history.length,1);assert.equal(s.history[0].result,'win');assert.equal(s.history[0].us,900);assert.equal(s.active,null);
 assert.equal(battleFields({battleSettings:{status:0}}).battleStatus,'','NOT_STARTED ska aldrig öppna en match');
});

test('boost utan battleId hör till den pågående matchen; okänd längd ger 60 s, inte noll',()=>{
 const s=M.empty();
 M.receive(s,{type:'battle',id:'1',battleId:'m',battleStatus:'battle_started'},1000);
 assert.equal(M.receive(s,{type:'glove',id:'2',multiplier:2,durationSec:0},2000),true,'boosten utan id kastades');
 assert.equal(s.boost.id,'m');assert.equal(s.boost.until,2000+60000,'durationSec 0 betyder okänd längd (server/event-bus.js)');
 M.receive(s,{type:'glove',id:'3',multiplier:3,durationSec:20},5000);assert.equal(s.boost.until,25000);
 const tom=M.empty();assert.equal(M.receive(tom,{type:'glove',id:'4',multiplier:2}),false,'utan pågående match finns ingen match att knyta boosten till');
});

test('flikar och rubrik är på svenska',()=>{
 const src=fs.readFileSync('battle-analytics.js','utf8');
 assert.doesNotMatch(src,/General Analytics|Battle Analytics|Battle <em>Analytics/);
 assert.match(src,/'Översikt'/);assert.match(src,/'Battles'/);
});
