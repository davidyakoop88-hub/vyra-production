(()=>{'use strict';
/* VYRA · Gåvofyrverkeri
   Profilbilden flyger upp som raket (alltid upprätt), exploderar i små gåvor + gnistor, de små gåvorna dras
   tillbaka och blir EN stor gåva per raket. Kombo N skjuter exakt N raketer (max 100 per kombo) via EN kö.
   Delas av fireworks.html, index.html, text.html och obs.html — alla element utom #fx är valfria.
   Föregående version: _baslinje/app.js (mätt mot i MATNING.md). */
const $=id=>document.getElementById(id);
const canvas=$('fx');if(!canvas)return;
const ctx=canvas.getContext('2d'),W=360,H=640;
const SPACING=85,FAST_SPACING=60,FAST_BACKLOG=150,MAX_PER_COMBO=100,SPARK_BUDGET=900,RES=3;
const ROCKET_TIME=1.57,HERO_AT=1.5;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const catalog={rose:['Ros','0001_Rose.png'],heart:['Hjärta','0002_Community_Heart.png'],universe:['Universe','8389_TikTok_Universe.png']};
const palettes={classic:['#ffe7a9','#ffc56c','#fff6db'],prism:['#bd83ff','#65dfff','#ff73c5','#ffe4a0'],comet:['#8adfff','#e1edff','#ac91ff']};
const styleNames={classic:'Guldspår',prism:'Prisma',comet:'Kometregn'};
const clamp=(v,a=0,b=1)=>v<a?a:v>b?b:v,smooth=u=>u*u*(3-2*u),outCubic=u=>1-Math.pow(1-u,3);
const backOut=u=>{const c=1.4;return 1+(c+1)*Math.pow(u-1,3)+c*Math.pow(u-1,2)};
const setText=(id,t)=>{const el=$(id);if(el)el.textContent=t};
const stats={kombor:0,beställda:0,uppskjutna:0,explosioner:0,storaGåvor:0,storaGåvorVisade:0,gnistorBortplockade:0,trasigaBilder:0,toppGnistor:0,toppStoraGåvor:0,kvalitetssänkningar:0};

/* ---------- sprites: allt ritas en gång till offscreen-dukar, ramen gör bara drawImage ---------- */
function surface(w,h){const c=document.createElement('canvas');c.width=Math.ceil(w*RES);c.height=Math.ceil(h*RES);const g=c.getContext('2d');g.scale(RES,RES);return [c,g]}
function rgba(hex,a){const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${a})`}
const glowCache=new Map();
function glow(color){let s=glowCache.get(color);if(s)return s;const [c,g]=surface(16,16),gr=g.createRadialGradient(8,8,0,8,8,8);
 gr.addColorStop(0,color);gr.addColorStop(.22,color);gr.addColorStop(.5,rgba(color,.32));gr.addColorStop(1,rgba(color,0));g.fillStyle=gr;g.fillRect(0,0,16,16);glowCache.set(color,c);return c}
function radial(stops){const [c,g]=surface(64,64),gr=g.createRadialGradient(32,32,0,32,32,32);for(const [o,col]of stops)gr.addColorStop(o,col);g.fillStyle=gr;g.fillRect(0,0,64,64);return c}
const halo=radial([[0,'rgba(255,240,200,.75)'],[.45,'rgba(255,205,120,.28)'],[1,'rgba(255,190,90,0)']]);
const flashSprite=radial([[0,'#fffdf1'],[.2,'#ffe4a0'],[1,'rgba(255,220,130,0)']]);
const GIFT_PX=96;
function fallbackGift(){const [c,g]=surface(GIFT_PX,GIFT_PX),gr=g.createRadialGradient(48,44,4,48,48,46);gr.addColorStop(0,'#fff3c9');gr.addColorStop(.6,'#f0b44f');gr.addColorStop(1,'rgba(240,160,60,0)');g.fillStyle=gr;g.beginPath();g.arc(48,48,46,0,Math.PI*2);g.fill();g.font='52px system-ui,"Segoe UI Emoji",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('🎁',48,52);return c}
const gifts={};
for(const [key,[,src]]of Object.entries(catalog)){const slot={sprite:fallbackGift(),ok:false};gifts[key]=slot;const img=new Image();
 img.onload=()=>{const [c,g]=surface(GIFT_PX,GIFT_PX),s=GIFT_PX/Math.max(img.naturalWidth,img.naturalHeight);g.drawImage(img,(GIFT_PX-img.naturalWidth*s)/2,(GIFT_PX-img.naturalHeight*s)/2,img.naturalWidth*s,img.naturalHeight*s);slot.sprite=c;slot.ok=true};
 img.onerror=()=>{stats.trasigaBilder++};img.src=src}
const FACE_PX=48;
function faceSprite(img){const [c,g]=surface(FACE_PX,FACE_PX),r=FACE_PX/2;g.save();g.beginPath();g.arc(r,r,r-1,0,Math.PI*2);g.clip();g.fillStyle='#39244f';g.fillRect(0,0,FACE_PX,FACE_PX);
 if(img&&img.naturalWidth){const z=FACE_PX/Math.min(img.naturalWidth,img.naturalHeight);g.drawImage(img,r-img.naturalWidth*z/2,r-img.naturalHeight*z/2,img.naturalWidth*z,img.naturalHeight*z)}
 else{g.fillStyle='#e9d8ff';g.beginPath();g.arc(r,r*.72,r*.4,0,Math.PI*2);g.fill();g.beginPath();g.arc(r,FACE_PX*1.02,r*.78,Math.PI,0);g.fill()}
 g.restore();g.strokeStyle='#ffe6a5';g.lineWidth=1.6;g.beginPath();g.arc(r,r,r-1,0,Math.PI*2);g.stroke();return c}
const defaultFace=faceSprite(null);
function makeFace(src){const face={sprite:defaultFace};if(!src)return face;const img=new Image();
 img.onload=()=>{face.sprite=faceSprite(img)};img.onerror=()=>{stats.trasigaBilder++;setText('status','Profilbilden kunde inte läsas · standardbilden används')};img.src=src;return face}
let face=makeFace(null),avatarUrl;
const upload=$('profile-upload');
if(upload)upload.onchange=()=>{const f=upload.files[0];if(!f)return;const prev=avatarUrl;avatarUrl=URL.createObjectURL(f);face=makeFace(avatarUrl);
 // raketer som redan flyger behåller sin egen sprite, så den gamla URL:en kan släppas
 if(prev)setTimeout(()=>URL.revokeObjectURL(prev),2000)};

/* ---------- tillstånd ---------- */
let style='classic',rockets=[],sparks=[],gathers=[],heroes=[],flashes=[],queue=[],badge=null;
let raf=0,last=0,clock=0,pumpTimer=0,nextAt=0,autoTimer=0,toastTimer=0,lane=0,scale=2;
const costs=new Float32Array(240);let costIdx=0,costN=0;
/* automatisk kvalitet: 0 = full, 1 = utan glorior och med halva gnistorna, 2 = kvarts gnistor och korta spår.
   Gåvorna (små som stora) och raketerna påverkas aldrig. Styrs av glidande medel av ramintervallet JÄMFÖRT MED källans egen takt (OBS kör ofta 30 bilder/s —
   det är ingen överlast). Takten skattas som minsta intervallet bland de senaste 30 bildrutorna. */
let quality=0,avgIv=16.7,period=16.7,qualityAt=0,ivI=0;const ivs=new Float32Array(30).fill(250);
function adapt(ms){if(!(ms>0))return;ms=Math.min(ms,250);ivs[ivI]=ms;ivI=(ivI+1)%30;period=Math.max(6,Math.min(...ivs));avgIv+=(ms-avgIv)*.08;if(clock-qualityAt<.6)return;
 if(avgIv>period*1.6&&quality<2){quality++;qualityAt=clock;stats.kvalitetssänkningar++}else if(avgIv<period*1.15&&quality>0){quality--;qualityAt=clock}}
function pending(){let n=0;for(const j of queue)n+=j.total-j.sent;return n}
function fit(){const cw=canvas.clientWidth||W,s=Math.min(3,Math.max(2,cw/W*(devicePixelRatio||1)));const w=Math.round(W*s),h=Math.round(H*s);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}scale=w/W}
fit();addEventListener('resize',fit);
function request(){if(!raf){last=performance.now();raf=requestAnimationFrame(frame)}}

/* ---------- kö: en enda takt för alla kombor, exakt antal, inget tappas ---------- */
function enqueue(key,count){if(!catalog[key])key='rose';const total=Math.max(1,Math.min(MAX_PER_COMBO,Math.floor(Number(count)||1)));
 const job={key,total,sent:0,face,colors:palettes[style],style,mega:total>=50};queue.push(job);stats.kombor++;stats.beställda+=total;clearTimeout(autoTimer);schedule();status();return job}
function schedule(){if(pumpTimer||!queue.length)return;pumpTimer=setTimeout(pump,Math.max(0,nextAt-performance.now()))}
function pump(){pumpTimer=0;const job=queue[0];if(!job)return;const now=performance.now();
 // takten räknas från förra startens planerade tid, inte från när timern faktiskt kom — under last håller kombon
 // ändå 85 ms i snitt (en sen timer hämtas in direkt). Efter ett långt uppehåll (dold flik) börjar takten om.
 if(!nextAt||now-nextAt>500)nextAt=now;
 if(job.sent===0)startJob(job);
 fire(job);job.sent++;
 if(job.sent>=job.total){queue.shift();if(badge&&badge.job===job)badge.doneAt=clock}
 nextAt+=pending()>FAST_BACKLOG?FAST_SPACING:SPACING;status();
 if(queue.length)schedule();else afterQueue()}
function startJob(job){if(job.total>=10){badge={job,shownAt:clock,pulse:clock,doneAt:0};if($('toast'))$('toast').classList.remove('show')}const toast=$('toast');
 if(toast&&job.total<10){toast.classList.toggle('milestone',job.total>=100);toast.textContent=(job.total>=100?'✨ MEGAKOMBO · ':'Anna · ')+catalog[job.key][0]+' ×'+job.total;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),Math.max(3200,job.total*SPACING))}}
const GOLD=.6180339887,PLASTIC=.7548776662;
function fire(job){lane++;dispatchEvent(new CustomEvent('firework-sound',{detail:'launch'}));stats.uppskjutna++;
 let x1,y1,curve;
 // megakombo: låg-diskrepans-spridning så att 100 raketer täcker ytan jämnt i stället för att klumpa sig
 if(job.mega){x1=58+((lane*GOLD)%1)*244;y1=150+((lane*PLASTIC)%1)*240;curve=(Math.random()-.5)*60}
 else{x1=65+Math.random()*230;y1=185+Math.random()*120;curve=(Math.random()-.5)*110}
 const x0=clamp(x1+(Math.random()-.5)*120,40,320);
 rockets.push({job,key:job.key,count:job.total,face:job.face.sprite,faceRef:job.face,colors:job.colors,t:0,x0,y0:615,x1,y1,curve:reduced?0:curve,trail:[]});
 if(badge&&badge.job===job)badge.pulse=clock;request()}

/* ---------- explosion ---------- */
function burst(r,x,y){dispatchEvent(new CustomEvent('firework-sound',{detail:'burst'}));stats.explosioner++;
 const mega=r.job.mega,colors=r.colors;
 flashes.push({x,y,life:0,max:.38});
 const n=Math.round((reduced?10:mega?20:Math.min(48,22+r.count*2))*(quality===0?1:quality===1?.5:.25));
 // taket gäller bara gnistor (äldst först) — små och stora gåvor tas aldrig bort
 if(sparks.length+n>SPARK_BUDGET){const drop=sparks.length+n-SPARK_BUDGET;sparks.splice(0,drop);stats.gnistorBortplockade+=drop}
 for(let i=0;i<n;i++){const a=i/n*Math.PI*2+Math.random()*.2,s=45+Math.random()*95;sparks.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:0,max:mega?1.5:2,sprite:glow(colors[i%colors.length]),size:1+Math.random()*1.5})}
 const amount=reduced?4:mega?6:Math.min(9,3+Math.ceil(Math.sqrt(r.count))),spread=mega?.75:1,small=mega?19:25;
 for(let i=0;i<amount;i++){const a=i/amount*Math.PI*2+Math.random()*.3;
  gathers.push({ox:x,oy:y,dx:Math.cos(a)*(55+Math.random()*40)*spread,dy:(Math.sin(a)*65-20)*spread,life:0,max:1.8,key:r.key,size:small+Math.random()*7,rot:(Math.random()-.5)*.4,spin:reduced?0:(Math.random()-.5)*1.4})}
 heroes.push({x,y,life:0,max:mega?3.5:4.6,key:r.key,size:mega?62:88,shown:false});stats.storaGåvor++}

/* ---------- rendering ---------- */
function draw(sprite,x,y,w,h,alpha){if(alpha<=0)return;ctx.globalAlpha=alpha>1?1:alpha;ctx.drawImage(sprite,x-w/2,y-h/2,w,h)}
function frame(now){raf=0;const t0=performance.now(),dt=Math.min(.1,(now-last)/1000);adapt(now-last);last=now;clock+=dt;
 ctx.setTransform(scale,0,0,scale,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.clearRect(0,0,W,H);
 // gnistor
 const damp=Math.pow(.65,dt);let k=0;
 for(const p of sparks){p.life+=dt;if(p.life>=p.max)continue;p.vy+=24*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=damp;const R=p.size*3;draw(p.sprite,p.x,p.y,R*2,R*2,1-p.life/p.max);sparks[k++]=p}
 sparks.length=k;
 // små gåvor: ut, tillbaka mot mitten, krymper och tonas in i den stora gåvan
 k=0;for(const p of gathers){p.life+=dt;if(p.life>=p.max)continue;const L=p.life,out=outCubic(clamp(L/.6)),ret=smooth(clamp((L-.75)/.95)),d=out*(1-ret);
  const s=p.size*(.5+.5*(1-ret)),a=clamp(L/.08)*(1-clamp((L-1.45)/.35));
  if(a>0){ctx.globalAlpha=a;ctx.save();ctx.translate(p.ox+p.dx*d,p.oy+p.dy*d);ctx.rotate(p.rot+L*p.spin*(1-ret));ctx.drawImage(gifts[p.key].sprite,-s/2,-s/2,s,s);ctx.restore()}
  gathers[k++]=p}
 gathers.length=k;
 // stora gåvor — inget tak tar bort dem, de försvinner bara när de spelat klart
 k=0;for(const p of heroes){p.life+=dt;if(p.life>=p.max)continue;const since=p.life-HERO_AT;
  if(since>=0){const ap=clamp(since/.4),fo=clamp((p.life-(p.max-.6))/.6),s=p.size*backOut(ap)*(1-.1*fo),a=clamp(ap*2.5)*(1-fo),y=p.y-8*fo;
   if(!p.shown&&ap>=1){p.shown=true;stats.storaGåvorVisade++}
   if(quality===0)draw(halo,p.x,y,s*1.55,s*1.55,a*.6);draw(gifts[p.key].sprite,p.x,y,s,s,a)}
  heroes[k++]=p}
 heroes.length=k;
 // blixt när raketen spricker (tidigare definierad men aldrig skapad)
 if(flashes.length){ctx.globalCompositeOperation='lighter';k=0;for(const p of flashes){p.life+=dt;if(p.life>=p.max)continue;const u=p.life/p.max,r=12+u*60;draw(flashSprite,p.x,p.y,r*2,r*2,1-u);flashes[k++]=p}flashes.length=k;ctx.globalCompositeOperation='source-over'}
 // raketer med profilbild — upprätt, ingen rotation
 k=0;for(const r of rockets){r.t+=dt;const u=Math.min(1,r.t/ROCKET_TIME),e=1-Math.pow(1-u,2),x=r.x0+(r.x1-r.x0)*e+Math.sin(e*Math.PI)*r.curve,y=r.y0+(r.y1-r.y0)*e;
  if(r.faceRef.sprite!==defaultFace)r.face=r.faceRef.sprite;
  r.trail.push(x,y);if(r.trail.length>(reduced||quality===2?12:quality===1?20:32))r.trail.splice(0,2);const n=r.trail.length/2;
  for(let i=0;i<n;i++){const f=(i+1)/n,R=(1.2+f*1.5)*2.6;draw(glow(r.colors[i%r.colors.length]),r.trail[i*2],r.trail[i*2+1],R*2,R*2,f*.7)}
  const sz=r.job.mega?30+e*10:36+e*10;draw(r.face,x,y,sz,sz,r.job.mega?.55+.45*clamp(u*3):1);
  if(u===1){burst(r,x,y);continue}rockets[k++]=r}
 rockets.length=k;
 drawBadge();ctx.globalAlpha=1;
 if(sparks.length>stats.toppGnistor)stats.toppGnistor=sparks.length;if(heroes.length>stats.toppStoraGåvor)stats.toppStoraGåvor=heroes.length;
 costs[costIdx]=performance.now()-t0;costIdx=(costIdx+1)%costs.length;costN=Math.min(costN+1,costs.length);
 if(rockets.length||sparks.length||gathers.length||heroes.length||flashes.length||badge||queue.length)raf=requestAnimationFrame(frame);
 else{ctx.clearRect(0,0,W,H);idle()}}

/* kombomätare: stor siffra som räknar raketerna i kombon — ritas på duken så den syns i OBS */
function drawBadge(){if(!badge)return;const b=badge,job=b.job;let a=clamp((clock-b.shownAt)/.25);
 if(b.doneAt){const f=clamp((clock-b.doneAt-1.6)/.5);a*=1-f;if(f>=1){badge=null;return}}
 const pulse=1+.16*Math.exp(-(clock-b.pulse)*9),mega=job.total>=100;ctx.globalAlpha=a;
 ctx.save();ctx.translate(W/2,150);ctx.scale(pulse,pulse);
 ctx.fillStyle='rgba(14,10,22,.6)';ctx.beginPath();if(ctx.roundRect)ctx.roundRect(-78,-27,156,54,27);else ctx.rect(-78,-27,156,54);ctx.fill();
 ctx.strokeStyle=mega?'rgba(255,214,128,.85)':'rgba(220,190,255,.6)';ctx.lineWidth=1.2;ctx.stroke();
 ctx.drawImage(gifts[job.key].sprite,-72,-21,42,42);
 ctx.textBaseline='middle';ctx.textAlign='left';ctx.font='900 9px system-ui,sans-serif';ctx.fillStyle=mega?'#ffd98a':'#d9c2ff';ctx.fillText(mega?'MEGAKOMBO':'KOMBO',-24,-14);
 ctx.font='900 25px system-ui,sans-serif';const txt='×'+job.sent,tw=ctx.measureText(txt).width;ctx.lineWidth=4;ctx.strokeStyle='rgba(20,10,30,.9)';ctx.strokeText(txt,-25,9);ctx.fillStyle='#fff6dc';ctx.fillText(txt,-25,9);
 ctx.font='700 10px system-ui,sans-serif';ctx.fillStyle='rgba(255,246,220,.72)';ctx.fillText('/ '+job.total,-25+tw+4,12);
 ctx.restore()}

/* ---------- status, demo, rensa ---------- */
function status(){const job=queue[0],rest=queue.length-1;
 if(job){let t=catalog[job.key][0]+' ×'+job.total+' · '+job.sent+' / '+job.total+' raketer uppskjutna · '+styleNames[job.style];
  if(rest>0)t+=' · i kö: '+rest+(rest===1?' kombo':' kombor')+' ('+(pending()-(job.total-job.sent))+' raketer)';setText('status',t)}
 else if(stats.uppskjutna)setText('status',stats.uppskjutna+' / '+stats.beställda+' raketer uppskjutna · de sista gåvorna visas')}
// demo: nästa kombo startar först när kön är tom — inga överlappande kombor som tidigare (setInterval 6,5 s mot 8,5 s kombo)
function afterQueue(){const auto=$('auto');if(auto&&auto.checked){clearTimeout(autoTimer);autoTimer=setTimeout(()=>{if(auto.checked&&!queue.length)launchFromUi()},4000)}}
function idle(){setText('status','Klart · '+stats.uppskjutna+' raketer · '+stats.storaGåvorVisade+' stora gåvor visade');if(typeof api.onIdle==='function')api.onIdle(api.stats())}
function clear(){dispatchEvent(new CustomEvent('firework-sound',{detail:'stop'}));clearTimeout(autoTimer);const auto=$('auto');if(auto)auto.checked=false;
 clearTimeout(pumpTimer);pumpTimer=0;nextAt=0;queue=[];rockets=[];sparks=[];gathers=[];heroes=[];flashes=[];badge=null;cancelAnimationFrame(raf);raf=0;
 ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);clearTimeout(toastTimer);const toast=$('toast');if(toast)toast.classList.remove('show');
 for(const k in stats)stats[k]=0;setText('status','Rensat · redo')}
function launchFromUi(){const g=$('gift'),c=$('combo');enqueue(g?g.value:'rose',c?Number(c.value):1)}

const on=(id,ev,fn)=>{const el=$(id);if(el)el[ev]=fn};
on('launch','onclick',launchFromUi);on('stop','onclick',clear);
document.querySelectorAll('[data-effect]').forEach(b=>b.onclick=()=>{style=b.dataset.effect;document.querySelectorAll('[data-effect]').forEach(x=>x.classList.toggle('selected',x===b));launchFromUi()});
document.querySelectorAll('[data-banner]').forEach(b=>b.onclick=()=>{$('banner').className='banner '+b.dataset.banner;document.querySelectorAll('[data-banner]').forEach(x=>x.classList.toggle('selected',x===b))});
function update(){const ticker=$('ticker');if(!ticker||!$('banner'))return;const text=($('message')&&$('message').value.trim())||'Välkommen till liven!';setText('banner-label',($('label')&&$('label').value.trim())||'LIVE');
 ticker.replaceChildren();for(let i=0;i<2;i++){const span=document.createElement('span');span.textContent=text;span.setAttribute('aria-hidden',i?'true':'false');ticker.append(span)}
 ticker.style.setProperty('--duration',Math.max(8,ticker.scrollWidth/2/Number($('speed').value))+'s');$('banner').style.top=$('position').value==='top'?'76px':'160px';$('banner').hidden=!$('show-banner').checked}
on('apply','onclick',update);on('show-banner','onchange',update);on('position','onchange',update);on('speed','onchange',update);
on('auto','onchange',()=>{clearTimeout(autoTimer);if($('auto').checked&&!queue.length)launchFromUi()});
addEventListener('pagehide',clear);update();

const api={launch:enqueue,clear,
 setGift(src){
  return new Promise(resolve=>{
   if(!src){resolve('rose');return}
   const key='live';
   catalog[key]=['Gåva'];
   const slot=gifts[key]={sprite:fallbackGift()};
   const img=new Image();
   img.onload=()=>{
    const [c,g]=surface(GIFT_PX,GIFT_PX);
    const s=GIFT_PX/Math.max(img.naturalWidth,img.naturalHeight);
    const w=img.naturalWidth*s,h=img.naturalHeight*s;
    g.drawImage(img,(GIFT_PX-w)/2,(GIFT_PX-h)/2,w,h);
    slot.sprite=c;
    resolve(key);
   };
   img.onerror=()=>resolve(key);
   setTimeout(()=>resolve(key),800);
   img.src=src;
  });
 },
 setStyle(s){if(palettes[s])style=s},
 setProfile(src){face=makeFace(src)},
 stats(){let sum=0,mx=0;for(let i=0;i<costN;i++){sum+=costs[i];if(costs[i]>mx)mx=costs[i]}
  return {...stats,iKö:pending(),kombor_i_kö:queue.length,raketer:rockets.length,gnistor:sparks.length,småGåvor:gathers.length,storaGåvorNu:heroes.length,kvalitet:quality,ramkostnad_ms:+(costN?sum/costN:0).toFixed(2),ramkostnad_max_ms:+mx.toFixed(2)}},
 onIdle:null};
window.VyraGavofyrverkeri=api;
})();
