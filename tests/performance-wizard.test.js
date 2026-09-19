const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('studio.html','utf8');
const js=fs.readFileSync('performance-wizard.js','utf8');

function api(widgets=[]){
  const button={addEventListener(){}};
  const sandbox={window:{},state:{widgets},navigator:{hardwareConcurrency:8,deviceMemory:16},performance:{},matchMedia:()=>({matches:false}),document:{readyState:'complete',querySelector:s=>s.includes('data-extra')?button:null},requestAnimationFrame(){},addEventListener(){}};
  sandbox.window=sandbox;vm.runInNewContext(js,sandbox);return sandbox.VyraPerformanceWizard;
}
test('Performance Wizard är kopplad till Studio',()=>{
  assert.match(html,/data-extra="performanceWizard"/);
  assert.match(html,/performance-wizard\.js\?v=20260919-1/);
  assert.match(html,/performance-wizard\.css\?v=20260919-1/);
  assert.match(html,/performance-runtime\.js\?v=20260919-1/);
});
test('optimeringsläget kan läsas från layoutens state',()=>{
  const instance=api();assert.equal(instance.getPerformanceMode(),'full');
});
test('en lätt overlay får grönt resultat',()=>{
  const result=api().evaluate({fps:60,jank:1,frames:120,widgets:5,heavy:0,animated:2,cores:8});
  assert.equal(result.level,'good');assert.equal(result.score,100);
});
test('en tung och hackig overlay ger varningar',()=>{
  const result=api().evaluate({fps:38,jank:35,frames:100,widgets:36,heavy:5,animated:12,cores:4,memoryUsed:800,memoryLimit:1000});
  assert.equal(result.level,'heavy');assert.ok(result.score<55);assert.ok(result.recommendations.length>=5);
});
test('overlayanalysen räknar endast synliga delar',()=>{
  const result=api([{type:'video'},{type:'templateGiftFireworks'},{type:'ticker',hidden:true},{type:'text'}]).overlaySnapshot();
  assert.deepEqual({...result},{widgets:3,heavy:2,animated:1});
});

