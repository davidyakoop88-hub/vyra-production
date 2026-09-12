/* Approved Classic Fireworks renderer. Per-instance images and palette; the shared VFX ticker owns time. */
(function(root){
'use strict';
function create(input={}){
const gift=new Image(),profile=new Image();
const safe=(value,fallback)=>root.VyraSafe?.src(value,fallback)||fallback;
const ready=Promise.all([gift,profile].map((img,i)=>new Promise(resolve=>{img.onload=img.onerror=resolve;img.src=safe(i?input.profileImage:input.giftImage,i?'assets/images/test-profile.svg':'assets/gifts/events/0001_Rose.png')})));
const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),ease=v=>1-Math.pow(1-clamp(v),3);
const options={style:'willow',primary:'#ffd06b',secondary:'#a764ff'};
let currentTheme='royal';
const THEMES={royal:{style:'willow',primary:'#ffd06b',secondary:'#a764ff'},ice:{style:'sparkle',primary:'#dcecff',secondary:'#49cfff'},rose:{style:'classic',primary:'#edb98b',secondary:'#ff7cc8'},comet:{style:'classic',primary:'#45e1d1',secondary:'#ff806c'}};
const normalizeTheme=t=>Object.hasOwn(THEMES,t)?t:'royal';
const channels=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
function tint(c,n){return '#'+channels(c).map(v=>Math.round(v+(255-v)*n).toString(16).padStart(2,'0')).join('')}
const rgba=(c,a)=>'rgba('+channels(c).join(',')+','+a+')';
let palettes=[];
function refreshPalette(){palettes=[tint(options.primary,.5),options.primary,tint(options.secondary,.43),options.secondary,tint(options.primary,.83)]}
function setOptions(next={}){if(!next||typeof next!=='object')return {...options};if(['classic','willow','sparkle'].includes(next.style))options.style=next.style;for(const key of ['primary','secondary'])if(typeof next[key]==='string'&&/^#[0-9a-f]{6}$/i.test(next[key]))options[key]=next[key].toLowerCase();refreshPalette();return {...options}}
refreshPalette();
setOptions({...THEMES[normalizeTheme(input.theme)],...(input.primary?{primary:input.primary}:{}),...(input.secondary?{secondary:input.secondary}:{})});
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
// Deliberate timings and formations, not a common show with palette swaps.
const counts=[80,80,80,80,80,80,110,110,110,110,110,250,250,650];
const layouts={
 royal:[[1.6,270,370],[1.6,690,370],[3.1,305,300],[3.1,655,300],[4.6,350,235],[4.6,610,235],[6.2,200,355],[6.55,340,300],[6.9,480,230],[7.25,620,300],[7.6,760,355],[10.5,280,245],[10.5,680,245],[13.1,480,200]],
 ice:[[1.5,235,315],[1.5,725,315],[3,315,235],[3,645,235],[4.5,390,175],[4.5,570,175],[6.2,190,365],[6.2,770,365],[7.2,340,270],[7.2,620,270],[8.2,480,180],[10.8,265,260],[10.8,695,260],[13.3,480,210]],
 rose:[[1.6,160,390],[2,800,390],[2.6,270,315],[3,690,315],[3.6,380,250],[4,580,250],[5.8,200,360],[6.25,330,270],[6.7,480,215],[7.15,630,270],[7.6,760,360],[10.1,300,280],[10.8,660,280],[13,480,245]],
 comet:[[1.5,230,355],[2,680,265],[2.8,400,185],[3.5,720,370],[4.2,265,270],[5,555,180],[6.1,190,385],[6.6,350,275],[7.1,530,205],[7.6,710,280],[8.1,800,395],[10.6,295,240],[11.05,670,250],[13.2,480,235]]};
function make(theme,mode){
 const small=theme==='ice'?[[1.55,480,275]]:theme==='rose'?[[1.65,480,320]]:theme==='comet'?[[1.75,480,275]]:[[1.65,480,300]];
 const medium={royal:[[1.7,285,310],[1.7,675,310],[4.25,480,230]],ice:[[1.65,280,265],[1.65,680,265],[4.1,480,205]],rose:[[1.65,300,325],[2.35,660,290],[4.35,480,235]],comet:[[1.65,285,300],[2.55,700,250],[4.25,480,205]]};
 const layout=mode==='1'?small:mode==='10'?medium[theme]:layouts[theme];
 return layout.map(([at,x,y],i)=>{
  const n=mode==='100'?counts[i]:mode==='10'?[150,150,370][i]:240;
  const size=mode==='1'?1.12:mode==='10'?(i===2?1.4:.8):i===13?1.8:i>=11?1.12:i>=6?.8:.63;
  const e=event(at,x,(mode==='100'&&i===13&&theme!=='royal')?320:y,size,n,700+Object.keys(THEMES).indexOf(theme)*100+i,theme==='royal'?'willow':theme);
  e.theme=theme;e.flight=theme==='comet'?1.45:theme==='rose'?1.4:1.3;
  e.startX=theme==='ice'?960-x:theme==='rose'?480:theme==='comet'?480+(i%2?210:-210):480+(x-480)*.58;
  e.particles.forEach((p,j)=>{
   p.theme=theme;
   if(theme==='ice'){
    const ray=j%6,branch=Math.floor(j/6)%5,depth=((j*29)%101)/100;
    // Six major spines, finer branching arms and interstitial inner starlights.
    p.angle=ray*TAU/6+(branch===0?0:branch===1?.19:branch===2?-.19:(depth-.5)*TAU/6);
    p.v=(22+depth*138)*size;p.life=3.6+(j%4)*.16;p.delay=branch===4?.38:0;
    p.gravity=8;p.width=branch===0?1.5:.8;p.crackle=j%7===0;p.color=branch===0?0:j%5;
   }
   if(theme==='rose'){
    const layer=j%3,a=TAU*j*.61803398875+layer*.23,depth=.92+.16*Math.sin(p.phase);
    // Three nested, slightly rotated petal crowns with soft falling filaments.
    p.angle=a;p.v=(90+48*Math.pow(Math.cos(a*2.5),2))*size*[.35,.64,1][layer]*depth;
    p.life=3.7+p.spread*.6;p.drag=.58;p.gravity=24;p.width=1.4;
    p.delay=layer*.13;p.color=layer===0?2:layer===1?1:j%5;
   }
   if(theme==='comet'){
    const depth=((j*37)%127)/126,arm=j%5;
    // Radial depth also shifts angle, joining the arms into continuous fine spirals.
    p.angle=TAU*arm/5+depth*2.1;p.v=(18+depth*122)*size;
    p.life=3.5+p.spread*.5;p.gravity=13;p.width=depth>.7?1.15:.7;p.color=arm%5;
   }
  });return e;
 });
}
const shows=Object.fromEntries(Object.keys(THEMES).map(theme=>[theme,Object.fromEntries(['1','10','100'].map(mode=>[mode,make(theme,mode)]))]));
const durations={'1':6,'10':9,'100':18};
function normalize(mode){return Object.hasOwn(durations,String(mode))?String(mode):'100'}
const pointPool=Array.from({length:64},()=>({x:0,y:0}));let pointIndex=0;
function point(p,t){const q=Math.max(0,t),theme=p.theme;
 const drag=theme==='royal'?.38:theme==='ice'?1.4:p.drag,gravity=theme==='royal'?54:p.gravity;
 const travel=(1-Math.exp(-drag*q))/drag;
 const angle=p.angle+(theme==='comet'?1.65*Math.log(1+q*1.7):0);
 const speed=theme==='royal'?.9:theme==='ice'?1.35:1;
 const out=pointPool[pointIndex++%64];out.x=Math.cos(angle)*p.v*speed*travel;out.y=Math.sin(angle)*p.v*speed*travel+gravity*q*q/2;return out;
}
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
function position(e,time){
 const p=clamp((time-e.at+e.flight)/e.flight);if(p>=1)return{x:e.x,y:e.y};
 const t=ease(p),envelope=Math.sin(Math.PI*p)*Math.pow(1-p,3),x=e.startX+(e.x-e.startX)*t,y=840+(e.y-840)*t;
 if(e.theme==='comet')return{x:x+Math.sin(p*TAU*2.2+e.seed)*100*envelope,y:y+Math.cos(p*TAU*2.2+e.seed)*36*envelope};
 if(e.theme==='rose')return{x:x+(e.x-480)*.32*envelope,y:y-40*envelope};
 return{x,y};
}
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
 if(t<1){ctx.globalAlpha=Math.pow(1-t,2)*.55;ctx.strokeStyle=palettes[0];ctx.lineWidth=2;ctx.beginPath();if(e.theme==='ice'){for(let k=0;k<6;k++){const a=k*TAU/6,r=20+t*210*e.size;ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}}else if(e.theme==='rose'){for(let k=0;k<=100;k++){const a=k*TAU/100,r=(20+t*175*e.size)*(1+.16*Math.cos(a*5));if(!k)ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);else ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}}else ctx.arc(0,0,20+t*200*e.size,0,TAU);ctx.stroke()}
 for(let particleIndex=0;particleIndex<e.particles.length;particleIndex+=(input.qualityStride||1)){const p=e.particles[particleIndex];const age=t-p.delay,life=options.style==='sparkle'?p.life*.62:options.style==='willow'?Math.min(4.5,p.life+1):p.life;if(age<=0||age>=life)continue;
  const head=point(p,age),willow=options.style==='willow'||(options.style==='classic'&&e.kind==='willow')||e.theme==='rose';
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
   const tail=point(p,Math.max(0,age-(options.style==='sparkle'?.28:e.theme==='comet'?.38:e.theme==='rose'?.23:.16)));
   ctx.globalAlpha=fade*twinkle;ctx.strokeStyle=palettes[p.color];ctx.lineWidth=p.width*(.5+fade*.5);
   ctx.beginPath();ctx.moveTo(tail.x,tail.y);if(e.theme==='comet'){for(let k=1;k<=6;k++){const q=point(p,Math.max(0,age-.38+.38*k/6));ctx.lineTo(q.x,q.y)}}else ctx.lineTo(head.x,head.y);ctx.stroke();
  }
  if(p.ring===0)disc(ctx,head.x,head.y,willow?1.9:1.65,palettes[p.color],fade*.9);
  // A restrained satellite crackle at the end of a few sparks.
  const crack=age-(options.style==='sparkle'?.55:1.15);if((p.crackle||options.style==='sparkle'&&p.ring===0)&&crack>0&&crack<.42){for(let k=0;k<3;k++){const a=p.phase+k*TAU/3,dist=crack*40;disc(ctx,head.x+Math.cos(a)*dist,head.y+Math.sin(a)*dist,1.15,palettes[4],(1-crack/.42)*.9)}}
 }
 ctx.restore();
 const flip=clamp((t-.18)/.72),hold=e.kind==='willow'?3.05:2.15,opacity=clamp((hold-t)/.6);
 if(opacity>0)badge(ctx,e.x,e.y,22+e.size*11,flip,opacity,e.person);
}
function render(ctx,width,height,time,mode='100',theme=input.theme||'royal'){
 currentTheme=normalizeTheme(theme);const scenes=shows[currentTheme];
 const key=normalize(mode),t=clamp(Number(time)||0,0,durations[key]);
 ctx.clearRect(0,0,width,height);if(t>=durations[key])return;ctx.save();
 const scale=Math.min(width/960,height/800);ctx.translate((width-960*scale)/2,(height-800*scale)/2);ctx.scale(scale,scale);
 const fade=clamp((durations[key]-t)/.65);ctx.globalAlpha=fade;
 // Flight and explosions are pure functions of time, so pause/scrub stays exact.
 for(const e of scenes[key])flight(ctx,e,t);
 for(const e of scenes[key])burst(ctx,e,t);
 ctx.restore();
}
return {render,ready,getOptions:()=>({...options}),setQuality:stride=>{input.qualityStride=Math.max(1,Math.min(128,stride|0))},renderStill:(ctx,width,height)=>{ctx.clearRect(0,0,width,height);ctx.save();ctx.translate(width/2,height*.4);badge(ctx,0,0,Math.min(width,height)*.09,1,1,0);ctx.restore()},duration:mode=>durations[normalize(mode)],
 inspect:(mode,time,theme=input.theme||'royal')=>shows[normalizeTheme(theme)][normalize(mode)].map((e,index)=>({index,arrival:e.at,launch:e.at-e.flight,target:{x:e.x,y:e.y},...position(e,time),radius:22+e.size*11,phase:time<e.at-e.flight?'waiting':time<e.at?'flight':time<e.at+.18?'gift':time<e.at+.9?'flip':'profile',active:time>=e.at-e.flight&&time<e.at+(e.kind==='willow'?3.05:2.15),kind:e.kind,particles:e.particles.length})),
 maxParticles:(mode,theme=input.theme||'royal')=>shows[normalizeTheme(theme)][normalize(mode)].reduce((sum,e)=>sum+e.particles.length,0)};
}
root.VyraClassics={create};
})(window);
