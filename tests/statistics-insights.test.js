'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const client=fs.readFileSync('statistics-live.js','utf8');
const analytics=fs.readFileSync('studio.js','utf8').split('\n').find(line=>line.startsWith('function analytics()'));
async function setup(response){
  const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only'}),w=dom.window;
  w.eval(analytics);w.document.body.innerHTML=w.analytics();
  w.VyraCloudSync={current:()=>({workspace:{id:'test'}})};
  w.VyraAuth={api:async path=>typeof response==='function'?response(path):response};
  w.eval(client);await new Promise(resolve=>setTimeout(resolve,30));return dom;
}
const base={konto:'test',forstaDagen:'2026-10-01',totalt:{gifts:2,diamonds:300,likes:10},dagar:[
  {dag:'2026-10-05',diamonds:100,gifts:1},{dag:'2026-10-12',diamonds:200,gifts:1},
  {dag:'2026-10-19',diamonds:0,gifts:0,likes:0}
],toppGivare:[{namn:'<img src=x onerror=alert(1)>',diamonds:600,gifts:2}],givarUnderlag:{period:'all',diamonds:1000,givare:60}};
test('weekday averages exclude zero activity; concentration uses full lifetime denominator',async()=>{
  const dom=await setup(base);try{const d=dom.window.document;
    assert.match(d.querySelector('[data-stats-weekdays] li').textContent,/150/);
    assert.equal(d.querySelector('[data-stats-average]').textContent,'150');
    assert.match(d.querySelector('[data-stats-concentration]').textContent,/60/);
    assert.match(d.querySelector('[data-stats-concentration-note]').textContent,/60 givare/);
    assert.equal(d.querySelector('[data-stats-supporters] img'),null);
    assert.match(d.querySelector('[data-stats-weekday-note]').textContent,/Behöver minst 3/);
  }finally{dom.window.close()}
});
test('missing lifetime basis does not turn the visible top list into a false 100 percent',async()=>{
  const dom=await setup({...base,givarUnderlag:undefined});try{
    assert.equal(dom.window.document.querySelector('[data-stats-concentration]').textContent,'–');
  }finally{dom.window.close()}
});
test('period switch updates weekday data, labels, pressed state and empty averages',async()=>{
  const dom=await setup(path=>path.endsWith('7d')?{...base,totalt:{},dagar:[]}:base);try{
    const d=dom.window.document;d.querySelector('[data-stats-period="7d"]').click();
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(d.querySelector('[data-stats-average]').textContent,'–');
    assert.equal(d.querySelector('[data-stats-period="7d"]').getAttribute('aria-pressed'),'true');
    assert.ok([...d.querySelectorAll('[data-stats-period-label]')].every(node=>node.textContent==='7 dagar'));
    assert.match(d.querySelector('[data-stats-concentration]').textContent,/60/);
  }finally{dom.window.close()}
});
test('long periods retain all daily bars and table rows',async()=>{
  const dagar=Array.from({length:90},(_,i)=>({dag:new Date(Date.UTC(2026,7,1+i)).toISOString().slice(0,10),diamonds:i,gifts:1}));
  const dom=await setup({...base,dagar});try{
    assert.equal(dom.window.document.querySelectorAll('.statistics-bar').length,90);
    assert.equal(dom.window.document.querySelectorAll('[data-stats-table] tbody tr').length,90);
  }finally{dom.window.close()}
});
