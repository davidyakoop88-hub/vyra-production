/* Approved natural fireworks. Pure, seeded renderer; the host owns the shared clock. */
(function(root){'use strict';
function create(input={}){
const TAU=Math.PI*2,clamp=x=>Math.max(0,Math.min(1,x));
const colors={gold:'#ffc257',pink:'#ff419c',purple:'#aa6bff',blue:'#4eafff',white:'#fff0cd'};
const themes=['rose','royal','ice','comet','supernova'];
const theme=themes.includes(input.theme)?input.theme:'royal';
const mode=Number(input.combo)>=100?'100':Number(input.combo)>=10?'10':'1';
const showNumber=Number.isFinite(input.variantIndex)?Math.max(0,Math.trunc(input.variantIndex)):1;
const showSeed=Number.isFinite(input.seed)?input.seed>>>0:root.crypto.getRandomValues(new Uint32Array(1))[0];
let singleIndex=Number.isFinite(input.singleIndex)?Math.max(0,Math.trunc(input.singleIndex)):0;
const gift=new Image(),profile=new Image();
const safe=(value,fallback)=>root.VyraSafe?.src(value,fallback)||fallback;
const ready=Promise.all([gift,profile].map((img,i)=>new Promise(resolve=>{
 const fallback=i?'assets/images/test-profile.svg':'assets/gifts/events/0001_Rose.png';
 const source=safe(i?input.profileImage:input.giftImage,fallback);let retried=source===fallback;
 img.onload=resolve;img.onerror=()=>{if(retried){resolve();return;}retried=true;img.src=fallback;};img.src=source;
})));
let events=[],duration=7,stride=1,requestedStride=1,ctx,px=0,py=0;
const singleForms=['heart','smile','star'];
const formColors={heart:'#ff419c',smile:'#ffc247',star:'#379fff'};
const shapes={rose:['peony','double','ring'],royal:['willow','fan','crown'],ice:['star','ring','double'],comet:['palm','fan','spiral']};
const accents={rose:[colors.purple,colors.gold],royal:[colors.purple,colors.gold],ice:['#53e7d4',colors.blue],comet:[colors.gold,colors.blue],supernova:[colors.blue,colors.gold]};
function shell(at,x,y,size,kind,seed,showBadge=true,color,heart=false){
 const rng=VFX.createRng(seed),particles=[],willow=kind==='royal',palm=kind==='comet';
 const shape=heart?'peony':shapes[kind][(showNumber+events.length)%3],rotation=rng.range(-.22,.22),branches=rng.int(8,13),glitter=[];
 const n=size<.5?64:palm?160:willow?230:210;
 for(let i=0;i<n;i++){
  let a=palm?TAU*(i%branches)/branches+rng.range(-.035,.035):i*2.3999632297;
  let depth=palm?rng.range(.70,1):Math.sqrt(Math.max(.12,1-Math.pow(rng.range(-1,1),2)));
  if(shape==='ring'){a=TAU*i/n;depth=rng.range(.93,1.02);}
  if(shape==='double')depth=(i%2?.55:1)*rng.range(.92,1.06);
  if(shape==='star'){a=(i%6)*TAU/6+rng.range(-.08,.08);depth=rng.range(.3,1);}
  if(shape==='fan'||shape==='crown'){a=-Math.PI*.96+Math.PI*.92*i/n;depth=rng.range(shape==='crown'?.85:.5,1.1);}
  if(shape==='spiral'){depth=.25+.75*i/n;a=TAU*(i%5)/5+depth*2.7;}
  a+=rotation;
  const speed=(willow?152:palm?200:205)*size*depth*rng.range(.88,1.12);
  const base=color|| (willow?colors.gold:kind==='ice'?colors.blue:kind==='comet'?colors.purple:colors.pink);
  particles.push({vx:Math.cos(a)*speed,vy:Math.sin(a)*speed*(palm?.83:1),drag:willow?.52:palm?.55:.9,g:heart?8:willow?42:kind==='ice'?25:37,
   life:willow?rng.range(3.4,4.8):rng.range(2.5,3.7),delay:rng.range(0,.045),phase:rng.range(0,TAU),size,
   color:shape==='double'&&i%2?accents[kind][0]:i%11===0?colors.gold:!color&&kind==='rose'&&i%5===0?colors.purple:base,
   trail:willow?rng.range(.45,.85):palm?rng.range(.38,.65):rng.range(.36,.64),width:rng.range(1.7,2.6),hot:i%3===0});
  if(i%2===0){const p=particles[i],release=rng.range(.65,2.9);point(p,release);
   glitter.push({x:px,y:py,at:release,life:rng.range(.65,1.5),vx:rng.range(-17,17),vy:rng.range(-8,23),phase:rng.range(0,TAU),radius:rng.range(1.1,2.3),white:i%6===0});}
 }
 return{at,x,y,size,kind,shape,particles,glitter,flight:1.25+rng.range(0,.25),startX:480+(x-480)*.55+rng.range(-65,65),showBadge,primary:color|| (kind==='royal'?colors.gold:kind==='ice'?colors.blue:kind==='comet'?colors.purple:colors.pink)};
}
function formShell(form,kind,seed){
 const e=shell(1.6,480,320,1,kind,seed,true,formColors[form]),rng=VFX.createRng(seed),points=[];
 e.shape=form;e.particles=[];e.glitter=[];
 if(form==='smile'){
  for(let i=0;i<180;i++){const a=i*TAU/180;points.push({x:180*Math.cos(a),y:180*Math.sin(a)});}
  for(const side of [-1,1])for(let i=0;i<28;i++){const a=i*TAU/28;points.push({x:side*65+11*Math.cos(a),y:-55+17*Math.sin(a)});}
  for(let i=0;i<84;i++){const a=Math.PI*i/83;points.push({x:100*Math.cos(a),y:45+65*Math.sin(a)});}
 }else{
  const path=[];let length=0;
  for(let i=0;i<=720;i++){let x,y;
   if(form==='heart'){const a=i*TAU/720;x=16*Math.pow(Math.sin(a),3)*12;y=-(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))*12;}
   else{const v=i/720*10,k=Math.min(9,Math.floor(v)),f=v-k,a=-Math.PI/2+k*TAU/10,b=a+TAU/10,r=k%2?84:190,s=k%2?190:84;x=Math.cos(a)*r*(1-f)+Math.cos(b)*s*f;y=Math.sin(a)*r*(1-f)+Math.sin(b)*s*f;}
   if(i)length+=Math.hypot(x-path[i-1].x,y-path[i-1].y);path.push({x,y,length});}
  let cursor=1;for(let i=0;i<320;i++){const target=i*length/320;while(path[cursor].length<target)cursor++;const a=path[cursor-1],b=path[cursor],f=(target-a.length)/(b.length-a.length||1);points.push({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f});}
 }
 points.forEach((q,i)=>{const p={formX:q.x,formY:q.y,life:rng.range(3.2,3.8),delay:rng.range(0,.035),phase:rng.range(0,TAU),color:e.primary,trail:rng.range(.13,.25),width:rng.range(3.8,4.6),hot:i%2===0};e.particles.push(p);
  {const release=rng.range(.6,2.8);point(p,release);const angle=rng.range(0,TAU),speed=rng.range(18,48);e.glitter.push({x:px,y:py,at:release,life:rng.range(.45,1.05),vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed+8,phase:p.phase,radius:rng.range(1.3,2),white:i%5===0,color:e.primary,shooting:true});}});
 return e;
}
const sequence=VFX.createRng(showSeed);
 const kind=i=>theme==='supernova'?(input.style==='willow'?'royal':input.style==='sparkle'?'ice':['rose','ice','comet','royal'][i%4]):theme;
 const add=(at,x,y,size,i,badge=true,color)=>events.push(shell(at+sequence.range(-.07,.07),x+(i<30?sequence.range(-30,30):0),y+(i<30?sequence.range(-16,16):0),size*sequence.range(.94,1.06),kind(i),VFX.hashSeed(showSeed,String(i)),badge,color));
 if(mode==='1'){duration=7;events.push(formShell(singleForms[singleIndex++%3],kind(0),showSeed));}
 else if(mode==='10'){duration=11;add(1.6,280,310,.83,0);add(2.3,685,285,.83,1);add(5.1,430,315,1.16,2);
  add(5.35,660,195,.52,3,true,accents[theme][0]);add(5.65,660,435,.68,4,true,accents[theme][1]);}
 else {duration=20;for(let i=0;i<10;i++)add(1.7+i*.65,205+(i*173)%560,240+(i%3)*67,.63,i);
  add(9,265,255,1,11);add(9.6,705,270,1,12);
  if(theme==='rose'){
   // The heart consists of individual shells. Never a stroked heart outline.
   // Even spacing by arc length avoids gaps on the sides and crowded tip/lobes.
   const outline=[];let length=0;
   for(let i=0;i<=720;i++){const a=i*TAU/720,x=480+16*Math.pow(Math.sin(a),3)*18,y=335-(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))*18;
    if(i)length+=Math.hypot(x-outline[i-1].x,y-outline[i-1].y);outline.push({x,y,length});}
   let cursor=1;
   for(let i=0;i<36;i++){const target=i*length/36;while(outline[cursor].length<target)cursor++;
    const a=outline[cursor-1],b=outline[cursor],f=(target-a.length)/(b.length-a.length||1);
    events.push(shell(13+sequence.range(-.025,.025),a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f,.24,'rose',VFX.hashSeed(showSeed,'heart'+i),false,i%5===0?colors.gold:colors.pink,true));}
   const center=shell(13,480,335,.8,'rose',VFX.hashSeed(showSeed,'heart-center'),true,colors.pink);center.particles=[];center.glitter=[];events.push(center);
  }else{add(13,225,285,.9,20);add(13.25,745,285,.9,21);add(13.75,480,220,1.43,22);}
 }
function point(p,t){t=Math.max(0,t);if(p.formX!==undefined){const growth=1-Math.exp(-t*4),fall=Math.max(0,t-1.65);px=p.formX*growth+Math.sin(p.phase)*fall*4;py=p.formY*growth+fall*fall*23;return;}const d=(1-Math.exp(-p.drag*t))/p.drag;px=p.vx*d;py=p.vy*d+p.g*t*t*.5;}
function dot(x,y,r,color,a){ctx.globalAlpha=a;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
function badge(e,t,x=e.x,y=e.y){if(!e.showBadge)return;const flip=clamp((t-.16)/.65),alpha=t<0?1:clamp((2.6-t)/.65);if(!alpha)return;
 const radius=20+e.size*7;ctx.save();ctx.translate(x,y);ctx.scale(Math.max(.04,Math.abs(Math.cos(flip*Math.PI))),1);ctx.globalAlpha=alpha;ctx.fillStyle='#111321';ctx.strokeStyle=e.primary;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,radius,0,TAU);ctx.fill();ctx.stroke();ctx.clip();const img=flip<.5?gift:profile;
 if(img.complete&&img.naturalWidth){const d=radius*(flip<.5?1.64:2);ctx.drawImage(img,-d/2,-d/2,d,d);}
 else{ctx.fillStyle=e.primary;ctx.beginPath();ctx.arc(0,-radius*.2,radius*.24,0,TAU);ctx.fill();ctx.beginPath();ctx.arc(0,radius*.72,radius*.52,0,TAU);ctx.fill();}ctx.restore();}
function rocketPoint(e,p){p=clamp(p);let q=Math.pow(p,1.04);
 // Preserve the initial flight. Join the final 30% with matching velocity,
 // arriving at zero velocity without overshooting the explosion position.
 if(p>.7){const u=(p-.7)/.3,q0=Math.pow(.7,1.04),tangent=.3*1.04*Math.pow(.7,.04);
  q=(2*u*u*u-3*u*u+1)*q0+(u*u*u-2*u*u+u)*tangent+(-2*u*u*u+3*u*u);}
 px=e.startX+(e.x-e.startX)*(q*q*(3-2*q));py=835+(e.y-835)*q;}
function flight(e,t){const p=(t-e.at+e.flight)/e.flight;if(p<=0||p>=1)return;
 ctx.save();ctx.lineCap='round';for(let j=24;j>0;j--){rocketPoint(e,p-j*.009);const x=px,y=py;rocketPoint(e,p-(j-1)*.009);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(px,py);ctx.strokeStyle=j>9?e.primary:colors.gold;ctx.globalAlpha=(1-j/25)*.88;ctx.lineWidth=(1-j/25)*3.8;ctx.stroke();}
 rocketPoint(e,p);const x=px,y=py;dot(x,y,5.5,colors.gold,.13);dot(x,y,2.5,colors.white,1);ctx.restore();badge(e,-1,x,y);}
function burst(e,t){const age=t-e.at;if(age<0||age>5.4)return;
 ctx.save();ctx.translate(e.x,e.y);ctx.lineCap='round';
 if(age<.2){const r=12+age*420*e.size;const g=ctx.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,'#fff3d9');g.addColorStop(.12,e.primary);g.addColorStop(1,'transparent');ctx.globalAlpha=(1-age/.2)*.65;ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2);}
 for(let i=0;i<e.particles.length;i+=stride){const p=e.particles[i],a=age-p.delay;if(a<=0||a>=p.life)continue;
  const fade=clamp((p.life-a)/.9),sparkle=a>1.4?.58+.42*Math.pow(Math.sin(a*12+p.phase),4):1;
  const tail=Math.min(a,p.trail),segments=e.kind==='royal'||e.kind==='comet'?7:4;
  ctx.beginPath();for(let j=0;j<=segments;j++){point(p,a-tail+tail*j/segments);if(j===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}
  const x=px,y=py;
  const shaped=p.formX!==undefined;
  if(shaped){ctx.strokeStyle='#111326';ctx.lineWidth=p.width+3;ctx.globalAlpha=fade*.65;ctx.stroke();}
  ctx.strokeStyle=p.color;ctx.lineWidth=p.width+4;ctx.globalAlpha=fade*.075;ctx.stroke();
  ctx.lineWidth=p.width;ctx.globalAlpha=fade*sparkle*.87;ctx.stroke();
  if(shaped){
   const flicker=.76+.24*Math.sin(a*16+p.phase)*Math.sin(a*16+p.phase);
   dot(x,y,3.9,'#111326',fade*.58);dot(x,y,2.6,p.color,fade*flicker);
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(p.phase)*3.5,y+Math.sin(p.phase)*3.5);ctx.strokeStyle=p.color;ctx.lineWidth=1.6;ctx.globalAlpha=fade*flicker;ctx.stroke();
   dot(x,y,1.05,'#f3f6ff',fade*(p.hot?.85:.5)*flicker);
  }
  else if(p.hot){dot(x,y,1.25,p.color,fade);dot(x,y,.65,colors.white,fade*sparkle);}
  if(a>1.5&&i%7===0){point(p,a-.22);dot(px+Math.sin(p.phase)*2,py+4,.8,colors.gold,fade*sparkle*.65);}
 }
 // Independent afterglitter: released from the main sparks, then falls and twinkles.
 for(let i=0;i<e.glitter.length;i+=stride){const g=e.glitter[i],a=age-g.at;if(a<0||a>=g.life)continue;
  const envelope=clamp(a/.09)*clamp((g.life-a)/.35),flicker=.22+.78*Math.pow(Math.sin(a*17+g.phase),6),alpha=envelope*flicker;
  const x=g.x+g.vx*a,y=g.y+g.vy*a+25*a*a,c=g.white?colors.white:(g.color||colors.gold);
  if(g.shooting){ctx.beginPath();ctx.moveTo(x-g.vx*.085,y-(g.vy+50*a)*.085);ctx.lineTo(x,y);ctx.strokeStyle='#111326';ctx.lineWidth=3.4;ctx.globalAlpha=alpha*.45;ctx.stroke();ctx.strokeStyle=c;ctx.lineWidth=1.7;ctx.globalAlpha=alpha;ctx.stroke();}
  dot(x,y,g.radius*3.2,c,alpha*.085);dot(x,y,g.radius,c,alpha);
  if(g.white&&alpha>.6){ctx.globalAlpha=alpha*.75;ctx.strokeStyle=colors.white;ctx.lineWidth=.85;const r=g.radius*3;
   ctx.beginPath();ctx.moveTo(x-r,y);ctx.lineTo(x+r,y);ctx.moveTo(x,y-r);ctx.lineTo(x,y+r);ctx.stroke();}
 }
 ctx.restore();badge(e,age);
}

const validColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const options={theme,style:['classic','willow','sparkle'].includes(input.style)?input.style:'classic',customPalette:input.customPalette===true,primary:validColor(input.primary)?input.primary.toLowerCase():null,secondary:validColor(input.secondary)?input.secondary.toLowerCase():null};
// Preserve originals so changing custom colors never accumulates recoloring.
for(const e of events){e.originalPrimary=e.primary;for(const p of e.particles)p.originalColor=p.color;for(const g of e.glitter)g.originalColor=g.color;}
function applyPalette(){for(const e of events){const custom=options.customPalette&&mode!=='1';e.primary=custom&&options.primary||e.originalPrimary;for(const p of e.particles)p.color=custom?(p.originalColor===e.originalPrimary?options.primary:options.secondary)||p.originalColor:p.originalColor;for(const g of e.glitter)g.color=custom?options.secondary||g.originalColor:g.originalColor;}}
function setOptions(next={}){if(!next||typeof next!=='object')return {...options};if(typeof next.customPalette==='boolean')options.customPalette=next.customPalette;for(const key of ['primary','secondary'])if(validColor(next[key]))options[key]=next[key].toLowerCase();if(['classic','willow','sparkle'].includes(next.style))options.style=next.style;applyPalette();return {...options};}
applyPalette();
function render(context,width,height,time){ctx=context;ctx.clearRect(0,0,width,height);if(!Number.isFinite(time)||time<0||time>=duration||width<=0||height<=0)return;ctx.save();const scale=Math.min(width/960,height/800);ctx.translate((width-960*scale)/2,(height-800*scale)/2);ctx.scale(scale,scale);let active=0;for(const e of events)if(time>=e.at&&time<e.at+5.4)active+=e.particles.length+e.glitter.length;stride=Math.max(requestedStride,Math.ceil(active/1800),1);for(const e of events)flight(e,time);for(const e of events)burst(e,time);ctx.restore();}
function renderStill(context,width,height){ctx=context;ctx.clearRect(0,0,width,height);if(width<=0||height<=0)return;ctx.save();const scale=Math.min(width/960,height/800);ctx.translate((width-960*scale)/2,(height-800*scale)/2);ctx.scale(scale,scale);badge(events.find(e=>e.showBadge)||events[0],1,480,320);ctx.restore();}
return {ready,render,renderStill,duration:()=>duration,setQuality(value){requestedStride=Math.max(1,Math.min(128,Number(value)|0));},setOptions,getOptions:()=>({...options}),inspect:()=>({theme,mode,duration,seed:showSeed,variantIndex:showNumber,stride,shapes:events.map(e=>e.shape),shells:events.length,particles:events.reduce((n,e)=>n+e.particles.length,0),glitter:events.reduce((n,e)=>n+e.glitter.length,0),palette:{...options},events:events.map(e=>({at:e.at,x:e.x,y:e.y,size:e.size,flight:e.flight,startX:e.startX,shape:e.shape,kind:e.kind,showBadge:e.showBadge,primary:e.primary,particles:e.particles.length,glitter:e.glitter.length}))}),maxParticles:()=>events.reduce((n,e)=>n+e.particles.length+e.glitter.length,0)};
}
root.VyraNatural={create};
})(window);
