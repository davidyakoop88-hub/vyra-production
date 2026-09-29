const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('performance-runtime.js','utf8');
function runtime(mode){
  const classes=new Set(),video={paused:false,pause(){this.paused=true}};
  const classList={toggle(name,on){on?classes.add(name):classes.delete(name)}};
  const sandbox={window:{},state:{performanceMode:mode},document:{readyState:'complete',body:{classList},documentElement:{classList},querySelectorAll:()=>[video]},MutationObserver:class{observe(){}},requestAnimationFrame:fn=>fn(),addEventListener(){}};
  sandbox.window=sandbox;vm.runInNewContext(source,sandbox);return{classes,video};
}
test('balanserat läge aktiverar runtime och pausar dold video',()=>{
  const result=runtime('balanced');assert.ok(result.classes.has('vyra-performance-balanced'));assert.equal(result.video.paused,true);
});
test('full kvalitet tar bort optimeringsklassen',()=>{
  const result=runtime('full');assert.equal(result.classes.has('vyra-performance-balanced'),false);
});

