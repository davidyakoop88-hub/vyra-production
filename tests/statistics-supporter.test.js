'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync('statistics-supporter.js','utf8');
const profile={konto:'creator',id:'anna',namn:'<img src=x>',gifts:4,diamonds:400,note:'Hej',birthday:'02-29',dagar:[{dag:'2026-11-01',diamonds:100,gifts:1}],boosters:null};
function setup(api){const dom=new JSDOM('<!doctype html><button id="trigger">Anna</button>',{runScripts:'outside-only'}),w=dom.window;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};w.VyraCloudSync={current:()=>({workspace:{id:'ws'}})};w.VyraAuth={api};w.eval(source);return dom}
test('supporter profile uses text, unknown boosters and persists notes through scoped API',async()=>{
 const calls=[],dom=setup(async(path,options)=>{calls.push({path,options});return options?{ok:true}:{supporter:profile}});try{const w=dom.window,d=w.document;await w.VyraSupporter.open(profile,d.querySelector('button'));assert.equal(d.querySelector('dialog h2').textContent,profile.namn);assert.equal(d.querySelector('dialog img'),null);assert.equal(d.querySelectorAll('.statistics-profile-booster').length,6);assert.match(d.querySelector('.statistics-profile-boosters').textContent,/\?/);d.querySelector('textarea').value='Ny anteckning';d.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(calls[1].options.method,'PUT');assert.deepEqual(JSON.parse(calls[1].options.body),{note:'Ny anteckning',birthday:'02-29',konto:'creator'});assert.match(calls[1].path,/workspaces\/ws\/stats\/supporters\/anna$/);assert.match(d.querySelector('.statistics-profile-save-status').textContent,/Sparat/)}finally{dom.window.close()}
});
test('late response for a closed profile cannot close the newer profile',async()=>{
 let resolveFirst;const dom=setup(path=>path.endsWith('first')?new Promise(resolve=>resolveFirst=resolve):Promise.resolve({supporter:profile}));try{const w=dom.window;const first=w.VyraSupporter.open({id:'first',namn:'First'});await w.VyraSupporter.open(profile);resolveFirst({supporter:{...profile,id:'first'}});await first;assert.equal(w.document.querySelector('dialog h2').textContent,profile.namn)}finally{dom.window.close()}
});
test('workspace change blocks a stale note save',async()=>{
 let puts=0;const dom=setup(async(path,options)=>{if(options)puts++;return {supporter:profile}});try{const w=dom.window;await w.VyraSupporter.open(profile);w.VyraCloudSync.current=()=>({workspace:{id:'other'}});w.document.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(puts,0);assert.equal(w.document.querySelector('dialog'),null)}finally{dom.window.close()}
});
