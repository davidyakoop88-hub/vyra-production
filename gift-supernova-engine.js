/* NOVA: deterministic, seekable canvas celebration prototype. The host owns time. */
(function(root){
'use strict';
function create(input={}) {
const gift=new Image(),profile=new Image();
const safe=(value,fallback)=>root.VyraSafe?.src(value,fallback)||fallback;
const ready=Promise.all([gift,profile].map((img,i)=>new Promise(resolve=>{img.onload=img.onerror=resolve;img.src=safe(i?input.profileImage:input.giftImage,i?'assets/images/test-profile.svg':'assets/gifts/events/0001_Rose.png')})));
const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),ease=v=>1-Math.pow(1-clamp(v),3);
const options={style:'classic',primary:'#ffd06b',secondary:'#a764ff'};
const channels=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
function tint(c,n){return '#'+channels(c).map(v=>Math.round(v+(255-v)*n).toString(16).padStart(2,'0')).join('')}
const rgba=(c,a)=>'rgba('+channels(c).join(',')+','+a+')';
let palettes=[];
function refreshPalette(){palettes=[tint(options.primary,.5),options.primary,tint(options.secondary,.43),options.secondary,tint(options.primary,.83)]}
function setOptions(next={}){if(!next||typeof next!=='object')return {...options};if(['classic','willow','sparkle'].includes(next.style))options.style=next.style;for(const key of ['primary','secondary'])if(typeof next[key]==='string'&&/^#[0-9a-f]{6}$/i.test(next[key]))options[key]=next[key].toLowerCase();refreshPalette();return {...options}}
refreshPalette();
setOptions(input);
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296}}
function event(at,x,y,size,count,seed,kind='bloom',person=0){
 const rand=rng(seed),particles=[];
 for(let i=0;i<count;i++){
  const ring=i%3,angle=TAU*i*.61803398875,spread=(kind==='willow'&&i%5===0?.22:.45)+rand()*.55;
  particles.push({angle,v:(kind==='willow'?150:180)*size*spread,life:(kind==='willow'?3.4:2.2)+rand()*1.1,drag:kind==='willow'?.4:.75,
   gravity:kind==='willow'?46:36,color:kind==='willow'?(i%8===0?2:i%2):i%5,width:kind==='willow'?1.25:1.6,
   phase:rand()*TAU,delay:ring===2?.10:0,crackle:rand()>.78,ring,spread});
 }
 return{at,x,y,size,particles,seed,kind,person,flight:1.25+rand()*.2,bend:(rand()-.5)*150,startX:480+(rand()-.5)*480};
}
const scenes={
 '1':[event(1.55,480,310,1.12,220,17)],
 '10':[event(1.6,285,335,.72,125,21),event(2.1,675,300,.75,125,22),event(4.1,480,265,1.32,330,23,'willow')],
 '100':[
  // Three paired salvos: identical launch and arrival times on both sides.
  event(1.6,245,365,.55,80,101),event(1.6,715,365,.55,80,102),
  event(2.8,300,285,.68,80,103),event(2.8,660,285,.68,80,104),
  event(4.0,355,205,.76,80,105),event(4.0,605,205,.76,80,106),
  // A deliberate rising fan, followed by a breath before the canopy.
  event(5.65,175,350,.72,110,107),event(6.1,325,270,.78,110,108),
  event(6.55,480,205,.85,110,109),event(7.0,635,270,.78,110,110),event(7.45,785,350,.72,110,111),
  // The gold wings open together. The largest central shell is always last.
  event(11.1,250,275,1.02,250,112,'willow'),event(11.1,710,275,1.02,250,113,'willow'),
  event(13.25,480,245,1.8,650,114,'willow')],
 crowd:[event(1.5,230,320,.7,115,51,'bloom',0),event(1.85,730,285,.7,115,52,'bloom',1),event(2.25,480,210,.9,155,53,'bloom',2),event(4.3,280,260,.8,140,54,'willow',0),event(4.7,680,280,.8,140,55,'willow',1),event(6.5,480,185,1.3,280,56,'bloom',2),event(9.15,480,290,1.7,520,57,'willow',2)]
};
scenes['100'].forEach(e=>{e.flight=1.4;e.startX=480+(e.x-480)*.48});
const durations={'1':6,'10':9,'100':18,crowd:14};
function normalize(mode){return Object.hasOwn(scenes,String(mode))?String(mode):'100'}
const scratch=Array.from({length:64},()=>({x:0,y:0}));let scratchIndex=0;
function point(p,t){const q=Math.max(0,t),drag=options.style==='willow'?.38:options.style==='sparkle'?1.4:p.drag,gravity=options.style==='willow'?54:options.style==='sparkle'?17:p.gravity,speed=options.style==='sparkle'?1.3:options.style==='willow'?.9:1,travel=(1-Math.exp(-drag*q))/drag;const out=scratch[scratchIndex++%64];out.x=Math.cos(p.angle)*p.v*speed*travel;out.y=Math.sin(p.angle)*p.v*speed*travel+gravity*q*q/2;return out}
function disc(ctx,x,y,r,color,alpha){ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill()}
function badge(ctx,x,y,r,flip,alpha,person){
 ctx.save();ctx.translate(x,y);ctx.globalAlpha=alpha;
 // Rotate the two faces around the same vertical axis: no position jump.
 const width=Math.max(.035,Math.abs(Math.cos(flip*Math.PI)));
 ctx.scale(width,1);ctx.shadowColor=person===1?options.secondary:options.primary;ctx.shadowBlur=20;
 ctx.fillStyle='#17151d';ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.shadowBlur=0;
 ctx.lineWidth=2.5;ctx.strokeStyle=palettes[0];ctx.stroke();ctx.save();ctx.beginPath();ctx.arc(0,0,r-3,0,TAU);ctx.clip();
 const img=flip<.5?gift:profile;
 if(img.complete&&img.naturalWidth){const factor=(flip<.5?.84:1.02)*r*2;ctx.drawImage(img,-factor/2,-factor/2,factor,factor)}
 else{ctx.fillStyle=palettes[2];ctx.beginPath();ctx.arc(0,-r*.2,r*.24,0,TAU);ctx.fill();ctx.beginPath();ctx.arc(0,r*.72,r*.52,0,TAU);ctx.fill()}
 ctx.restore();ctx.restore();
}
function position(e,time){const p=clamp((time-e.at+e.flight)/e.flight),t=ease(p);return{x:e.startX+(e.x-e.startX)*t,y:840+(e.y-840)*t}}
function flight(ctx,e,time){
 const p=clamp((time-e.at+e.flight)/e.flight);if(p<=0||time>=e.at)return;
 function pos(q){return position(e,e.at-e.flight+q*e.flight)}
 const head=pos(p);
 ctx.save();ctx.globalCompositeOperation='lighter';
 for(let i=22;i>0;i--){const a=pos(Math.max(0,p-i*.009)),b=pos(Math.max(0,p-(i-1)*.009));ctx.globalAlpha=(1-i/24)*.8;ctx.strokeStyle=i%3?options.primary:options.secondary;ctx.lineWidth=(1-i/25)*7;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
 for(let i=0;i<8;i++){const age=(time*3+i*.17)%1,tail=pos(Math.max(0,p-age*.17));disc(ctx,tail.x+Math.sin(i*3+time*10)*age*10,tail.y,1.2,palettes[0],(1-age)*.7)}
 ctx.restore();badge(ctx,head.x,head.y,22+e.size*11,0,Math.min(1,p*7),e.person);
}
function burst(ctx,e,time){
 const t=time-e.at;if(t<0||t>4.75)return;
 ctx.save();ctx.translate(e.x,e.y);ctx.globalCompositeOperation='lighter';
 // Only one glow gradient per visible explosion, not per spark.
 if(t<.46){const r=(28+t*380)*e.size,g=ctx.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,rgba(palettes[0],((e.kind==='willow'?.18:.4)*(1-t/.46))));g.addColorStop(.3,rgba(options.secondary,.22*(1-t/.46)));g.addColorStop(1,rgba(options.secondary,0));ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2)}
 if(t<1){ctx.globalAlpha=Math.pow(1-t,2)*.55;ctx.strokeStyle=palettes[0];ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,20+t*200*e.size,0,TAU);ctx.stroke()}
 for(let particleIndex=0;particleIndex<e.particles.length;particleIndex+=(input.qualityStride||1)){const p=e.particles[particleIndex];const age=t-p.delay,life=options.style==='sparkle'?p.life*.62:options.style==='willow'?Math.min(4.5,p.life+1):p.life;if(age<=0||age>=life)continue;
  const head=point(p,age),willow=options.style==='willow'||(options.style==='classic'&&e.kind==='willow');
  const fade=clamp((life-age)/(options.style==='sparkle'?.4:1.1)),twinkle=age>1.15?.65+.35*Math.pow(Math.sin(age*(options.style==='sparkle'?44:21)+p.phase),2):1;
  if(willow){
   // Long curved filaments stay connected as drag slows them and gravity takes over.
   const trail=Math.min(Math.max(0,age-.2),.62+e.size*.16),segments=8,opening=clamp((age-.16)/.45);
   ctx.beginPath();
   for(let j=0;j<=segments;j++){const q=point(p,age-trail+trail*j/segments);if(j===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y)}
   ctx.strokeStyle=palettes[p.color];ctx.globalAlpha=fade*opening*.055;ctx.lineWidth=4.2*e.size;ctx.stroke();
   ctx.globalAlpha=fade*twinkle*opening*.85;ctx.lineWidth=.85+p.spread*.7;ctx.stroke();
   // A smaller delayed gold fleck gives the trail depth without a second simulation.
   if(age>.9&&p.ring!==1){const dust=point(p,Math.max(0,age-.28));disc(ctx,dust.x+Math.sin(p.phase)*4,dust.y+8,1.1,palettes[4],fade*(.25+.45*Math.pow(Math.sin(age*14+p.phase),4)))}
  }else{
   const tail=point(p,Math.max(0,age-(options.style==='sparkle'?.045:.16)));
   ctx.globalAlpha=fade*twinkle;ctx.strokeStyle=palettes[p.color];ctx.lineWidth=p.width*(.5+fade*.5);
   ctx.beginPath();ctx.moveTo(tail.x,tail.y);ctx.lineTo(head.x,head.y);ctx.stroke();
  }
  if(p.ring===0)disc(ctx,head.x,head.y,willow?1.9:1.65,palettes[p.color],fade*.9);
  // A restrained satellite crackle at the end of a few sparks.
  const crack=age-(options.style==='sparkle'?.55:1.15);if((p.crackle||options.style==='sparkle'&&p.ring===0)&&crack>0&&crack<.42){for(let k=0;k<3;k++){const a=p.phase+k*TAU/3,dist=crack*40;disc(ctx,head.x+Math.cos(a)*dist,head.y+Math.sin(a)*dist,1.15,palettes[4],(1-crack/.42)*.9)}}
 }
 ctx.restore();
 const flip=clamp((t-.18)/.72),hold=e.kind==='willow'?3.05:2.15,opacity=clamp((hold-t)/.6);
 if(opacity>0)badge(ctx,e.x,e.y,22+e.size*11,flip,opacity,e.person);
}
function render(ctx,width,height,time,mode='100'){
 const key=normalize(mode),t=clamp(Number(time)||0,0,durations[key]);
 ctx.clearRect(0,0,width,height);if(t>=durations[key])return;ctx.save();
 const scale=Math.min(width/960,height/800);ctx.translate((width-960*scale)/2,(height-800*scale)/2);ctx.scale(scale,scale);
 const fade=clamp((durations[key]-t)/.65);ctx.globalAlpha=fade;
 // Flight and explosions are pure functions of time, so pause/scrub stays exact.
 for(const e of scenes[key])flight(ctx,e,t);
 for(const e of scenes[key])burst(ctx,e,t);
 ctx.restore();
}
const api={render,ready,setQuality:stride=>{input.qualityStride=Math.max(1,Math.min(128,stride|0))},renderStill:(ctx,width,height)=>{ctx.clearRect(0,0,width,height);ctx.save();ctx.translate(width/2,height*.4);badge(ctx,0,0,Math.min(width,height)*.09,1,1,0);ctx.restore()},setOptions,getOptions:()=>({...options}),inspect:(mode,time)=>scenes[normalize(mode)].map((e,index)=>({index,arrival:e.at,launch:e.at-e.flight,target:{x:e.x,y:e.y},...position(e,time),radius:22+e.size*11,phase:time<e.at-e.flight?'waiting':time<e.at?'flight':time<e.at+.18?'gift':time<e.at+.9?'flip':'profile',active:time>=e.at-e.flight&&time<e.at+(e.kind==='willow'?3.05:2.15),kind:e.kind,particles:e.particles.length})),rocketPosition:(mode,index,time)=>position(scenes[normalize(mode)][index],time),duration:mode=>durations[normalize(mode)],maxParticles:mode=>scenes[normalize(mode)].reduce((sum,e)=>sum+e.particles.length,0),setImages:(giftUrl,profileUrl)=>{if(giftUrl)gift.src=giftUrl;if(profileUrl)profile.src=profileUrl}};
return api;
}
const mounted=new Map();
const mode=combo=>Number(combo)>=100?'100':Number(combo)>=10?'10':'1';
const duration=combo=>({1:6,10:9,100:18})[mode(combo)];
function dispose(group){const item=mounted.get(group);if(!item)return;item.unsubscribe?.();item.canvas.getContext('2d')?.clearRect(0,0,item.canvas.width,item.canvas.height);mounted.delete(group)}
function rendererFor(w,giftImage,profileImage,palette={}){const options={theme:w.fwTheme,style:w.fwNovaStyle||'classic',primary:palette.primary||w.fwColor,secondary:palette.secondary||w.fwColor2,giftImage,profileImage};return ['royal','ice','rose','comet'].includes(w.fwTheme)?root.VyraClassics.create(options):create(options)}
function mount(group,w,combo,giftImage,profileImage,palette){
 const renderer=rendererFor(w,giftImage,profileImage,palette);
 const canvas=document.createElement('canvas');canvas.width=960;canvas.height=800;canvas.className=w.fwTheme==='supernova'?'fw-supernova-canvas':'fw-classics-canvas';canvas.style.cssText='display:block;width:100%;height:100%;pointer-events:none';group.append(canvas);
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const started=performance.now(),item={renderer,canvas,unsubscribe:null};mounted.set(group,item);
 const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const paint=now=>{
  if(!group.isConnected||w.hidden||group.closest('.widget-hidden')){dispose(group);return}
  const elapsed=(now-started)/1000;if(elapsed>=duration(combo)){dispose(group);return}
  renderer.setQuality(Math.max(1,Math.ceil(mounted.size*2180/2500)));
  if(reduced)renderer.renderStill(ctx,960,800);else renderer.render(ctx,960,800,elapsed,mode(combo));
 };
 if(reduced){renderer.renderStill(ctx,960,800);renderer.ready.then(()=>{if(mounted.has(group)&&group.isConnected&&!w.hidden&&!group.closest('.widget-hidden'))renderer.renderStill(ctx,960,800)})}
 item.unsubscribe=root.VFX.Ticker.subscribe(paint);
}
function preview(e,w,palette){
 const renderer=rendererFor(w,undefined,undefined,palette);
 const canvas=document.createElement('canvas');canvas.width=960;canvas.height=800;canvas.style.cssText='display:block;width:100%;height:auto';e.replaceChildren(canvas);e.dataset.fwPreview='1';e.style.setProperty('opacity','1','important');e.style.height='auto';
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const draw=()=>renderer.render(ctx,960,800,14.5,'100');draw();renderer.ready.then(draw);
}
root.addEventListener('vyra-session-ended',()=>{for(const group of mounted.keys())dispose(group)});
root.VyraSupernova={create,mount,preview,dispose,duration,active:()=>mounted.size};
})(window);
