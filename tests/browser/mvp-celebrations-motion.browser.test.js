'use strict';
// Real CSS sampling catches regressions a renderer-string test cannot: collapsed
// animation names, displaced portraits, visible endings and preview side effects.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {startaWebblasare,hoppaOver}=require('../helpers/webblasare.js');
const {servera}=require('../rigg/servera.js');
const factory=require('../../widget-factory.js');
let skip = hoppaOver();
const models=Object.keys(factory.variants('battlemvp.celebration'));
let browser,server;
test.before(async()=>{if(skip)return;browser=await startaWebblasare();if(!browser)throw Error('Browser could not start');server=await servera();});
test.after(async()=>{await browser?.close();await server?.stang();});
async function open(view='layout'){
  const page=await browser.newPage({viewport:{width:1600,height:1100},locale:'sv-SE'});
  await page.goto(server.bas+'/studio.html?open='+view,{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.VyraMvpCelebrations&&!!window.VyraWidgets);
  await page.waitForFunction(()=>Array.from(document.styleSheets).some(s=>s.href?.includes('battle-mvp-celebrations.css')&&s.cssRules.length));
  return page;
}
async function paint(page,key,width=400,duration=10){
  await page.evaluate(({key,width,duration})=>{
    const w=VyraWidgets.create('catalog:battlemvp:celebration:'+key);
    Object.assign(w,{id:'motion-proof',x:60,y:40,width,mvpDuration:duration,mvpName:'@EttMycketLångtNamnSomInteFårSpillaUtÖverRamen',profileImage:'assets/images/test-profile.svg'});
    state.widgets=[w];selected=null;render();
  },{key,width,duration});
  await page.waitForFunction(()=>{const es=[...document.querySelectorAll('.mvp-celebration img')];return es.length===3&&es.every(e=>e.complete&&e.naturalWidth>0);});
  await page.evaluate(async()=>{await document.fonts.ready;const i=new Image();i.src='assets/mvp-celebrations/motion-atlas.webp';await i.decode();});
}
async function phase(page,fraction){
  return page.evaluate(async fraction=>{
    const root=document.querySelector('.mvp-celebration');root.classList.add('mvp-active');
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const ms=parseFloat(root.style.getPropertyValue('--mvc-duration'))*1000;
    const animations=root.getAnimations({subtree:true});
    animations.forEach(a=>{a.pause();a.currentTime=ms*fraction;});
    const read=selector=>{const e=root.querySelector(selector),s=getComputedStyle(e),b=e.getBoundingClientRect();let opacity=1;for(let p=e;p;p=p.parentElement){const c=getComputedStyle(p);opacity*=+c.opacity;if(c.visibility==='hidden'||c.display==='none')opacity=0;}return {opacity,transform:s.transform,animation:s.animationName,clip:s.clipPath,x:b.x,y:b.y,width:b.width,height:b.height};};
    return {root:read('.mvc-stage'),face:read('.mvc-portrait'),name:read('.mvc-copy'),left:read('.mvc-art-left'),right:read('.mvc-art-right'),light:read('.mvc-flare'),flight:read('.mvc-charge i'),exit:read('.mvc-finale i'),count:animations.length,infinite:animations.some(a=>a.effect.getTiming().iterations===Infinity),text:root.querySelector('h2').textContent};
  },fraction);
}
test('six visibly distinct entrances and exits, with a stable tribute and a fully dark finish',{skip,timeout:120000},async()=>{
  const page=await open(),entrances=[],exits=[];
  try{for(const key of models){
    await paint(page,key);
    const intro=await phase(page,.08);assert.ok(intro.face.opacity<.05,key+' reveals the winner too early');
    const enter=await phase(page,.23);entrances.push([enter.left.transform,enter.face.transform,enter.face.clip,enter.name.animation,enter.flight.animation].join('|'));
    const hold=await phase(page,.6);assert.ok(hold.face.opacity>.99&&hold.name.opacity>.99,key+' tribute is hidden');
    assert.ok(Math.abs(hold.face.width-hold.face.height)<1,key+' portrait is not round');
    assert.ok(hold.name.x>=hold.root.x&&hold.name.x+hold.name.width<=hold.root.x+hold.root.width+1,key+' name spills out');
    assert.equal(hold.infinite,false);assert.ok(hold.count<=90,'animation budget exceeded');
    const exit=await phase(page,.94);exits.push([exit.left.transform,exit.face.transform,exit.face.clip,exit.exit.animation].join('|'));
    assert.ok(exit.face.opacity<.99&&exit.left.opacity<.99,key+' has no dissolution');
    if(process.env.VYRA_MVP_EVIDENCE){fs.mkdirSync(process.env.VYRA_MVP_EVIDENCE,{recursive:true});await page.locator('.mvp-celebration').screenshot({path:path.join(process.env.VYRA_MVP_EVIDENCE,key+'-exit.png')});}
    const end=await phase(page,1);assert.equal(end.root.opacity,0,key+' flashes at the end');
  }
  assert.equal(new Set(entrances).size,6,'two designs use the same entrance');assert.equal(new Set(exits).size,6,'two designs use the same ending');
  }finally{await page.close();}
});
test('portrait safe zone and motion remain proportional at 280, 400 and 560 pixels',{skip,timeout:120000},async()=>{
  const page=await open();try{for(const key of models){let baseline;
    for(const width of [280,400,560]){await paint(page,key,width);const m=await phase(page,.6);
      const center=[(m.face.x+m.face.width/2-m.root.x)/m.root.width,(m.face.y+m.face.height/2-m.root.y)/m.root.height];
      const photo=factory.variants('battlemvp.celebration')[key].photo;
      assert.ok(Math.abs(center[0]-(photo.left+photo.width/2)/100)<.002,key+' horizontal avatar alignment');
      assert.ok(Math.abs(center[1]-(photo.top+photo.height/2)/100)<.002,key+' vertical avatar alignment');
      if(baseline)assert.ok(Math.abs(m.face.width/m.root.width-baseline)<.002,key+' portrait scales incorrectly');baseline=m.face.width/m.root.width;
    }
  }}finally{await page.close();}
});
test('catalog preview and replay animate a draft without touching a real overlay or its saved layout',{skip,timeout:60000},async()=>{
  const page=await open('overlay');try{
    const card=page.locator('[data-catalog-key="catalog:battlemvp:celebration:portal"]');
    await card.locator('.owg-preview').waitFor();
    // The two master leases renew their heartbeat timestamp independently of
    // previews. Compare all other storage, including every saved layout key.
    const snapshot=()=>({widgets:JSON.stringify(state.widgets),storage:JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k=>!['vyra-automation-master','vyra-rost-master'].includes(k)).sort().map(k=>[k,localStorage.getItem(k)])))});
    const before=await page.evaluate(snapshot);
    await card.locator('.owg-preview').click();
    await page.waitForFunction(()=>!!document.querySelector('.overlay-live-preview-stage .mvc-preview.mvp-active'));
    const after=await page.evaluate(snapshot);
    assert.equal(after.widgets,before.widgets);assert.equal(after.storage,before.storage);
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.mvp-active')].filter(e=>!e.closest('.overlay-live-preview-stage')).length),0);
    await page.locator('[data-mvp-replay]').click();
    await page.waitForFunction(()=>document.querySelector('.overlay-live-preview-stage .mvc-preview')?.getAnimations({subtree:true}).some(a=>a.currentTime<2000));
    assert.equal(await page.locator('[data-mvp-replay]').count(),1);
  }finally{await page.close();}
});
test('reduced motion shows a readable still with no decorative motion',{skip,timeout:60000},async()=>{
  const page=await open();try{await page.emulateMedia({reducedMotion:'reduce'});await paint(page,'wings');const m=await phase(page,.6);assert.equal(m.count,0);assert.ok(m.face.opacity>.99&&m.name.opacity>.99);assert.equal(m.light.opacity,0);}finally{await page.close();}
});
