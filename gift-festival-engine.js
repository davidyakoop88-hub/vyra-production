/* Gift Fireworks · Festival-motorn (2026-10-17). Ersätter gift-natural-engine.js.
   Davids ord: "när de går igång i min live man kan knappt se de", "de gamla vill inte jag ha" och
   referensbilden "målet skulle vara så" (hjärtfyrverkerier runt en guldsol).

   Referensbilden, punkt för punkt — och det som styr ritningen nedan:
   * Färgerna är MÄTTADE: djupblått, grönt, rött, persika. Ingen vit överexponering. Kärnan ritas därför
     i ren färg (source-over); glöden är en svag, smal additiv halo. (Version 2 lade ljus på ljus och
     allt smälte till en vit klump — Davids "kolla på den design och kolla på din".)
   * Hjärtana är STORA och ligger RUNT solen med luft emellan, inte ovanpå den.
   * Hjärtats kant är ett TÄTT PÄRLBAND av jämnt fördelade lysande pärlor.
   * Inuti hjärtat går TUNNA strålar ut från HJÄRTATS EGEN MITT, med mörkt emellan.
   * Solen: många TUNNA krämgula strålar med pärlspets; de yttersta böjer sig NEDÅT som ett regn.
   * Ingen stor vit blixt i mitten.

   SAMMA gränssnitt som VyraNatural.create (ready, render, renderStill, duration, setQuality,
   setOptions, getOptions, inspect, maxParticles) — gift-supernova-engine.js använder den utan ändring.
   Ren och seedad: allt är en funktion av tiden. Värden äger klockan (VFX.Ticker). Designrummet är
   960×800 som förut. */
(function(root){'use strict';
const TAU=Math.PI*2,clamp=x=>Math.max(0,Math.min(1,x));
const TEMAN={
 festival:{hj:['#1f6bff','#20d35a','#ff3b3b','#ff8f6b'],sol:'#ffd99a'},
 royal:{hj:['#9b4dff','#ffbf2e','#ff5ccf','#6a5cff','#ffd36b'],sol:'#ffd99a'},
 ice:{hj:['#1f6bff','#38c8ff','#7a6bff','#8fe9ff','#25d6c4'],sol:'#d8f2ff'},
 rose:{hj:['#ff3d96','#ff2f5f','#ff8f6b','#ff6ad5','#ffaa55'],sol:'#ffd2b8'},
 comet:{hj:['#1fd9c2','#ff6a45','#3cb5ff','#20d35a','#ffc93a'],sol:'#ffe39a'},
 supernova:{hj:['#1f6bff','#20d35a','#ff3b3b','#ff8f6b','#9b4dff','#ffbf2e'],sol:'#ffd99a'}
};
// hjärtkurvan, utjämnad efter båglängd så pärlorna ligger jämnt. Enhetshjärta ~32 brett, mitt i (0,0).
const HJ=(()=>{const p=[];let L=0;for(let i=0;i<=900;i++){const a=i*TAU/900,x=16*Math.pow(Math.sin(a),3),y=-(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))+2.5;if(i)L+=Math.hypot(x-p[i-1].x,y-p[i-1].y);p.push({x,y,L})}return{p,L}})();
function hjartPunkter(n){const out=[];let c=1;for(let i=0;i<n;i++){const t=i*HJ.L/n;while(HJ.p[c].L<t)c++;const a=HJ.p[c-1],b=HJ.p[c],f=(t-a.L)/(b.L-a.L||1);out.push({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f})}return out}

function create(input={}){
const theme=TEMAN[input.theme]?input.theme:'festival';
const mode=Number(input.combo)>=100?'100':Number(input.combo)>=10?'10':'1';
const seed=Number.isFinite(input.seed)?input.seed>>>0:root.crypto.getRandomValues(new Uint32Array(1))[0];
const variant=Number.isFinite(input.variantIndex)?Math.max(0,Math.trunc(input.variantIndex)):1;
const R=root.VFX.createRng(root.VFX.hashSeed(seed,'festival-'+variant));
const validColor=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
const options={theme,style:['classic','willow','sparkle'].includes(input.style)?input.style:'classic',customPalette:input.customPalette===true,
 primary:validColor(input.primary)?input.primary.toLowerCase():null,secondary:validColor(input.secondary)?input.secondary.toLowerCase():null};
// Egna färger (Davids "alla inställningar ska påverka den widget"): Färg 1 blir guldsolens färg och
// Färg 2 ett av hjärtana — temats övriga hjärtfärger finns kvar, så det förblir flerfärgat.
const tema=()=>{if(!(options.customPalette&&options.primary))return TEMAN[theme];const t=TEMAN[theme],s2=options.secondary;
 return{sol:options.primary,hj:s2?[s2].concat(t.hj.filter(c=>c.toLowerCase()!==s2)):t.hj}};
// ---- valfria stilinställningar (playgroundens stilpanel; utan dem ritas som förut) --------------
const stil={glod:Number.isFinite(input.glow)?Math.max(0,input.glow)/.8:1,rund:Number.isFinite(input.radius)?clamp(input.radius/50):1,
 fx:input.badgeFx||'none',namn:String(input.name||'').slice(0,40),namnFx:input.nameFx||'none',namnFarg:input.nameColor||'#ffffff',
 namnFont:input.nameFont||"'Segoe UI',system-ui,sans-serif",hal:Number(input.badgeHole)||.6};
const ram=new Image();if(input.badgeFrame){const u=root.VyraSafe?.src(input.badgeFrame,'');if(u)ram.src=u}

// ---- bilder (gåva + profil), samma reservbilder som förut ------------------------------------
const gift=new Image(),profile=new Image();
const safe=(value,fallback)=>root.VyraSafe?.src(value,fallback)||fallback;
const ready=Promise.all([gift,profile].map((img,i)=>new Promise(resolve=>{
 const fallback=i?'assets/images/test-profile.svg':'assets/gifts/events/0001_Rose.png';
 const source=safe(i?input.profileImage:input.giftImage,fallback);let retried=source===fallback;
 img.onload=resolve;img.onerror=()=>{if(retried){resolve();return}retried=true;img.src=fallback};img.src=source;
})));

let ctx,px=0,py=0,stride=1,requested=1;
const skal=[];
// RÖRELSE, INTE LAMPA (Davids "den ger inte känsla av fyrverkeri den ger känsla av trasig lampa").
// Varje gnista rör sig hela tiden: flyger ut från explosionspunkten mot sitt mål med inbromsning,
// och efter en kort stund tar tyngdkraften över så att den sjunker i en båge medan den slocknar.
// Det som syns är gnistans RÖRELSESPÅR (långt när den är snabb, kort när den bromsar) — aldrig ett
// fast streck från mitten, och ingenting blinkar i takt.
function punkt(q,t){t=Math.max(0,t);const v=1-Math.exp(-q.k*t),fall=Math.max(0,t-q.haller);
 // HJÄRTSLAG: hjärtat slår en gång (ba-dum) precis när formen är klar
 const pl=q.puls?1+.1*Math.max(0,Math.sin(Math.PI*clamp((t-.55)/.22)))+.06*Math.max(0,Math.sin(Math.PI*clamp((t-.8)/.2))):1;
 px=q.mx*v*pl+Math.sin(q.fas)*fall*6;py=q.my*v*pl+.5*q.g*fall*fall}

// Färgen längs en gnista, som i riktiga fyrverkerier: vitgult huvud -> egen färg -> rödorange glöd.
// Ges som tre färger per partikel; ritningen blandar efter var på spåret segmentet ligger.
const GLOD='#ff7a2e',HUVUD='#fff4d6';

// HJÄRTA: tät gnistrande kontur (många små gnistor med korta spår) + gnistor från hjärtats mitt
// och en liten kärna i en annan färg. Växer fram, håller kort, sjunker.
function hjarta(at,x,y,storlek,fi){
 const r=root.VFX.createRng(root.VFX.hashSeed(seed,'h'+skal.length+'-'+variant)),pal=tema().hj,farg=pal[fi%pal.length],karna=pal[(fi+2)%pal.length];
 const s=storlek*9.6,lut=r.range(-.16,.16),cs=Math.cos(lut),sn=Math.sin(lut),p=[];
 const rot=(X,Y)=>[X*cs-Y*sn,X*sn+Y*cs];
 for(const q of hjartPunkter(Math.round(90+storlek*70))){const j=r.range(.96,1.04),[mx,my]=rot(q.x*s*j,q.y*s*j);
  p.push({mx,my,k:3.3,haller:.6,g:46,liv:r.range(2.1,2.6),delay:r.range(0,.05),fas:r.range(0,TAU),farg,svans:.24,bredd:4.6+storlek*1.5,huvud:true,glitter:r.next()<.7,puls:true})}
 for(const q of hjartPunkter(Math.round(50+storlek*40))){const d=r.range(.25,.9),[mx,my]=rot(q.x*s*d,q.y*s*d);
  p.push({mx,my,k:3,haller:.5,g:46,liv:r.range(1.5,2.1),delay:r.range(0,.06),fas:r.range(0,TAU),farg,svans:.28,bredd:2.6+storlek,glitter:true,puls:true})}
 for(let i=0;i<Math.round(18+storlek*14);i++){const a=r.range(0,TAU),d=r.range(10,34)*s/9.6;
  p.push({mx:Math.cos(a)*d,my:Math.sin(a)*d+18*s/9.6,k:3.4,haller:.4,g:40,liv:r.range(1.2,1.7),delay:r.range(.05,.12),fas:r.range(0,TAU),farg:karna,svans:.16,bredd:3.2+storlek,huvud:true})}
 const e={at,x,y,size:storlek,typ:'hjarta',p,farg,sken:farg,flyg:1.1+r.range(0,.2),startX:480+(x-480)*.4+r.range(-40,40)};skal.push(e);return e}

// GULDSOL: hundratals tunna gnistor som fyller hela bollen, långa spår som böjer sig nedåt (pil),
// en kärna i annan färg i mitten och glitter längs spåren.
function sol(at,x,y,storlek,badge){
 const r=root.VFX.createRng(root.VFX.hashSeed(seed,'s'+skal.length+'-'+variant)),farg=tema().sol,karna=tema().hj[Math.floor(r.range(0,tema().hj.length))],p=[];
 const rad=320*storlek,rot=r.range(0,TAU),n=Math.round(220+storlek*160);
 for(let i=0;i<n;i++){const a=rot+i*2.39996323+r.range(-.03,.03),yttre=i%3===0,
   d=yttre?r.range(1,1.2):Math.sqrt(Math.max(.2,1-Math.pow(r.range(-1,1),2)))*r.range(.75,1);
  p.push({mx:Math.cos(a)*rad*d,my:Math.sin(a)*rad*d,k:2.5,haller:yttre?.55:.75,g:yttre?110:70,liv:r.range(2.6,3.3),delay:r.range(0,.06),fas:r.range(0,TAU),farg,
   svans:yttre?.75:.48,bredd:2.2+storlek*1.1,huvud:i%2===0,glitter:r.next()<.6,delas:!yttre&&i%5===1?{ts:r.range(.62,.85),v:r.range(0,TAU)}:null})}
 for(let i=0;i<Math.round(40+storlek*30);i++){const a=r.range(0,TAU),d=rad*r.range(.18,.38);
  p.push({mx:Math.cos(a)*d,my:Math.sin(a)*d,k:3,haller:.5,g:50,liv:r.range(1.6,2.1),delay:r.range(.06,.14),fas:r.range(0,TAU),farg:karna,svans:.22,bredd:2.8+storlek,huvud:true})}
 const e={at,x,y,size:storlek,typ:'sol',p,badge,farg,sken:farg,flyg:1.15+r.range(0,.2),startX:480+(x-480)*.4+r.range(-40,40)};skal.push(e);return e}

// ---- programmet per nivå (designrum 960×800) ------------------------------------------------------
// Hjärtana placeras RUNT solen, utanför dess strålar, med luft emellan — som i referensbilden.
let duration=7;const f0=Math.floor(R.range(0,6));
const kring=[[175,165,1],[785,165,1],[95,430,.62],[865,430,.62],[205,665,.78],[755,665,.78],[480,90,.5],[480,735,.42]];
if(mode==='1'){
 duration=7;
 sol(1.2,480,410,.8,true);
 [0,1,4,5].forEach((k,i)=>{const [x,y,s]=kring[k];hjarta(1.55+i*.18,x,y,s*.85,f0+i)});
}else if(mode==='10'){
 duration=11;
 sol(1.2,480,410,.92,true);
 kring.forEach(([x,y,s],i)=>hjarta(1.5+i*.28+R.range(-.04,.04),x+R.range(-12,12),y+R.range(-8,8),s,f0+i));
 sol(3.6,480,410,.75,false);sol(6,480,410,.6,false);
}else{
 duration=20;
 // UPPBYGGNAD som trappas upp mot crescendot: sju grupper (sol + hjärtan) över hela rutan, större
 // och tätare för varje grupp, delvis överlappande — finalen ska aldrig stå tom.
 const grupper=[[300,300,.5],[680,280,.52],[480,470,.56],[230,520,.58],[730,520,.6],[400,230,.62],[600,380,.66]];
 let at=1.2;
 grupper.forEach(([gx,gy,gs],g)=>{sol(at,gx,gy,gs,g===0);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([dx,dy],i)=>hjarta(at+.28+i*.12,gx+dx*gs*260,gy+dy*gs*190,gs*.82,f0+g*4+i));
  at+=1.75-g*.13});
 // crescendo som referensbilden: stor guldsol och åtta hjärtan runt om
 sol(12.4,480,410,1,true);
 kring.forEach(([x,y,s],i)=>hjarta(12.75+i*.13,x,y,s,f0+i));
 sol(15,480,410,.7,false);
}
// solar ritas först, hjärtan ovanpå
skal.sort((a,b)=>(a.typ==='sol'?0:1)-(b.typ==='sol'?0:1));

// ---- ritning -------------------------------------------------------------------------------------
function prick(x,y,r,c,a){if(a<=0)return;ctx.globalAlpha=Math.min(1,a);ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill()}
function stjarna(x,y,r,c,a){if(a<=0)return;ctx.globalAlpha=a;ctx.strokeStyle=c;ctx.lineWidth=Math.max(1.4,r*.26);ctx.beginPath();ctx.moveTo(x-r,y);ctx.lineTo(x+r,y);ctx.moveTo(x,y-r);ctx.lineTo(x,y+r);ctx.stroke();prick(x,y,r*.28,'#ffffff',a)}
// form för bilden: rundning 50 = cirkel, 0 = fyrkant med små hörn
function form(R){const c=Math.max(R*.12,R*stil.rund);ctx.beginPath();if(ctx.roundRect&&c<R*.999)ctx.roundRect(-R,-R,2*R,2*R,c);else ctx.arc(0,0,R,0,TAU)}
function badge(e,t,x=e.x,y=e.y){if(!e.badge)return;const flip=clamp((t-.16)/.65),alpha=t<0?1:clamp((3-t)/.6);if(!alpha)return;
 const radius=38+e.size*12,tid=Math.max(0,t),harRam=ram.complete&&ram.naturalWidth>0;
 // ramlager bakom bilden
 ctx.save();ctx.translate(x,y);ramlager(radius,tid,e.farg,alpha,false);ctx.restore();
 ctx.save();ctx.globalCompositeOperation='source-over';ctx.translate(x,y);ctx.scale(Math.max(.04,Math.abs(Math.cos(flip*Math.PI))),1);ctx.globalAlpha=alpha;
 ctx.shadowColor=e.farg;ctx.shadowBlur=24;ctx.fillStyle='#0d0f1c';form(radius);ctx.fill();ctx.shadowBlur=0;
 if(!harRam){ctx.strokeStyle='#ffffff';ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle=e.farg;ctx.lineWidth=3;ctx.stroke()}
 ctx.clip();
 const img=flip<.5?gift:profile;if(img.complete&&img.naturalWidth){const d=radius*(flip<.5?1.6:2);ctx.drawImage(img,-d/2,-d/2,d,d)}
 ctx.restore();
 ctx.save();ctx.translate(x,y);ctx.globalAlpha=alpha;
 // bildram (HD) runt bilden: ramens hål passar bilden
 if(harRam){const S=radius*2/stil.hal;ctx.drawImage(ram,-S/2,-S/2,S,S)}
 ramlager(radius,tid,e.farg,alpha,true);
 if(stil.namn&&t>=0)namn(stil.namn,radius*(harRam?1/stil.hal:1)+30,tid,alpha);
 ctx.restore()}
// RAMLAGER (Halo, Flamma, Blixt, Guld + glimt, Ripple, Komet, Kronblad), ritat runt bilden.
// ovanpa=false ritas före bilden (sken, lågor, kronblad), ovanpa=true efter (ringar, blixtar, glans).
function ramlager(R,t,farg,a,ovanpa){const fx=stil.fx;if(fx==='none')return;ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
 if(fx==='halo'&&!ovanpa){const g=ctx.createRadialGradient(0,0,R*.9,0,0,R*1.7);g.addColorStop(0,farg);g.addColorStop(1,'rgba(0,0,0,0)');ctx.globalAlpha=a*(.45+.2*Math.sin(t*4));ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,R*1.7,0,TAU);ctx.fill()}
 if((fx==='halo'||fx==='ripple')&&ovanpa){for(let k=0;k<(fx==='ripple'?3:1);k++){const u=((t*.9+k/3)%1);ctx.globalAlpha=a*(1-u)*.8;ctx.strokeStyle=farg;ctx.lineWidth=4*(1-u)+1;ctx.beginPath();ctx.arc(0,0,R*(1.05+u*.8),0,TAU);ctx.stroke()}}
 if(fx==='flame'&&!ovanpa){for(let k=0;k<22;k++){const v=k/22*TAU+Math.sin(t*2)*.1,L=R*(.32+.22*Math.max(0,Math.sin(t*9+k*1.7))+.1*hash(k,Math.floor(t*12))),x0=Math.cos(v)*R*.92,y0=Math.sin(v)*R*.92,x1=x0+Math.cos(v)*L,y1=y0+Math.sin(v)*L-L*.4;
   const g=ctx.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,'#ffd23a');g.addColorStop(.5,'#ff6a1a');g.addColorStop(1,'rgba(255,40,0,0)');
   ctx.globalAlpha=a*.9;ctx.strokeStyle=g;ctx.lineWidth=R*.16;ctx.beginPath();ctx.moveTo(x0,y0);ctx.quadraticCurveTo(x0+Math.cos(v)*L*.6,y0+Math.sin(v)*L*.6,x1,y1);ctx.stroke()}}
 if(fx==='bolt'&&ovanpa){const f=Math.floor(t*9);for(let k=0;k<3;k++){if(hash(k,f)<.35)continue;let v=hash(k*3,f)*TAU,r=R*1.08;ctx.beginPath();ctx.moveTo(Math.cos(v)*r,Math.sin(v)*r);
   for(let j=1;j<7;j++){v+=.18;r=R*(1.04+hash(j,f+k)*.22);ctx.lineTo(Math.cos(v)*r,Math.sin(v)*r)}ctx.strokeStyle='#bfe3ff';ctx.lineWidth=3;ctx.globalAlpha=a;ctx.shadowColor='#5fb8ff';ctx.shadowBlur=14;ctx.stroke();ctx.shadowBlur=0}}
 if(fx==='glint'&&ovanpa){ctx.globalAlpha=a*.9;ctx.strokeStyle='#ffcf5a';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,R*1.08,0,TAU);ctx.stroke();
   const v=(t*2.2)%TAU,gx=Math.cos(v)*R*1.08,gy=Math.sin(v)*R*1.08,g=ctx.createRadialGradient(gx,gy,0,gx,gy,R*.45);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.globalAlpha=a;ctx.beginPath();ctx.arc(gx,gy,R*.45,0,TAU);ctx.fill()}
 if(fx==='comet'&&ovanpa){for(let j=0;j<16;j++){const v=t*3.2-j*.07;prick(Math.cos(v)*R*1.18,Math.sin(v)*R*1.18,6*(1-j/16)+1,j?farg:'#ffffff',a*(1-j/16))}}
 if(fx==='petals'&&!ovanpa){ctx.globalCompositeOperation='source-over';for(let k=0;k<8;k++){const v=k/8*TAU+t*.8;ctx.save();ctx.rotate(v);ctx.translate(R*1.22,0);ctx.rotate(Math.PI/2);ctx.globalAlpha=a*.85;ctx.fillStyle=k%2?'#ff8fc8':'#ffc2de';ctx.beginPath();ctx.ellipse(0,0,R*.16,R*.3,0,0,TAU);ctx.fill();ctx.restore()}}
 ctx.restore()}
// GIVARENS NAMN under bilden, med textfärg, typsnitt och namneffekt (Shimmer, Aurora, Flimmer)
function namn(txt,dy,t,a){ctx.save();ctx.translate(0,dy);ctx.font='800 34px '+stil.namnFont;ctx.textAlign='center';ctx.textBaseline='middle';
 let al=a;if(stil.namnFx==='flicker'){const h=hash(3,Math.floor(t*14));al*=h<.18?.25:h<.3?.6:1}
 ctx.globalAlpha=al;ctx.lineWidth=7;ctx.strokeStyle='rgba(5,6,14,.85)';ctx.lineJoin='round';ctx.strokeText(txt,0,0);
 const w=ctx.measureText(txt).width/2+4;let fill=stil.namnFarg;
 if(stil.namnFx==='shimmer'){const m=((t*.6)%1.6-.3)*2*w-w,g=ctx.createLinearGradient(-w,0,w,0);g.addColorStop(0,stil.namnFarg);g.addColorStop(clamp((m+w-30)/(2*w)),stil.namnFarg);g.addColorStop(clamp((m+w)/(2*w)),'#ffffff');g.addColorStop(clamp((m+w+30)/(2*w)),stil.namnFarg);g.addColorStop(1,stil.namnFarg);fill=g}
 if(stil.namnFx==='aurora'){const g=ctx.createLinearGradient(-w,0,w,0),h=t*80;for(let k=0;k<=4;k++)g.addColorStop(k/4,'hsl('+((h+k*55)%360)+' 90% 65%)');fill=g}
 ctx.fillStyle=fill;ctx.fillText(txt,0,0);
 if(stil.namnFx==='flicker'){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=al*.35;ctx.shadowColor=stil.namnFarg;ctx.shadowBlur=18;ctx.fillText(txt,0,0)}
 ctx.restore()}
function raketPunkt(e,p){p=clamp(p);const q=1-Math.pow(1-p,2.2);px=e.startX+(e.x-e.startX)*q;py=860+(e.y-860)*q}
function flyg(e,t){const p=(t-e.at+e.flyg)/e.flyg;if(p<=0||p>=1)return;
 ctx.save();ctx.lineCap='round';
 for(let j=16;j>0;j--){raketPunkt(e,p-j*.012);const x=px,y=py;raketPunkt(e,p-(j-1)*.012);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(px,py);
  ctx.strokeStyle=e.farg;ctx.globalAlpha=(1-j/17)*.85;ctx.lineWidth=(1-j/17)*6;ctx.stroke()}
 // gnistor som faller från raketen medan den stiger
 for(let j=1;j<=14;j++){const pj=p-j*.022;if(pj<=0)break;raketPunkt(e,pj);const tw=hash(j,Math.floor(t*30));if(tw<.35)continue;
  const ner=j*j*.35,sid=(hash(j*3,1)-.5)*j*1.6;prick(px+sid,py+ner,1.2+tw*1.6,tw>.8?'#ffffff':'#ffd27a',(1-j/15)*tw)}
 raketPunkt(e,p);ctx.globalCompositeOperation='lighter';prick(px,py,10,e.farg,.3);ctx.globalCompositeOperation='source-over';prick(px,py,4,'#fff3d6',1);ctx.restore();badge(e,-1,px,py)}

// färgblandning mellan två #rrggbb, t i 0..1
const _hex={};function rgb(h){return _hex[h]||(_hex[h]=[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)])}
function blanda(a,b,t){const A=rgb(a),B=rgb(b);return 'rgb('+Math.round(A[0]+(B[0]-A[0])*t)+','+Math.round(A[1]+(B[1]-A[1])*t)+','+Math.round(A[2]+(B[2]-A[2])*t)+')'}
// deterministisk "slump" per gnista och glitterkorn, så glittret tindrar var för sig utan Math.random
const hash=(a,b)=>{const x=Math.sin(a*12.9898+b*78.233)*43758.5453;return x-Math.floor(x)};
function explosion(e,t){const age=t-e.at;if(age<0||age>5.4)return;
 ctx.save();ctx.translate(e.x,e.y);ctx.lineCap='round';
 // LJUSSKEN: explosionen lyser upp en mjuk dimma runt sig, starkast direkt och sedan avklingande
 const skenA=age<.15?age/.15:Math.max(0,1-(age-.15)/1.6);
 if(skenA>0){const r=(e.typ==='sol'?330:170)*e.size*(.6+.4*Math.min(1,age/.6));ctx.globalCompositeOperation='lighter';
  const g=ctx.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,e.sken);g.addColorStop(1,'rgba(0,0,0,0)');ctx.globalAlpha=Math.min(1,skenA*.26*stil.glod);ctx.fillStyle=g;ctx.fillRect(-r,-r,2*r,2*r)}
 if(age<.18){const k=1-age/.18,r=20+age*240*e.size;ctx.globalCompositeOperation='lighter';
  const g=ctx.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,'rgba(255,248,230,.95)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.globalAlpha=k*.6;ctx.fillStyle=g;ctx.fillRect(-r,-r,2*r,2*r)}
 const N=5;
 for(let pass=0;pass<2;pass++){
  ctx.globalCompositeOperation=pass?'source-over':'lighter';
  for(let i=0;i<e.p.length;i+=stride){const q=e.p[i],a=age-q.delay;if(a<=0)continue;
   // EFTERGLITTER: när gnistan slocknat fortsätter några korn från dess slutpunkt att tindra och
   // sakta falla en stund (Davids "lite mer av de gnistor på slutet").
   if(a>=q.liv){const ta=a-q.liv;if(pass&&(q.glitter||q.huvud)&&i%2===0&&ta<1.4){punkt(q,q.liv);const bx=px,by=py,liv=1-ta/1.4;
     for(let k=0;k<3;k++){const tw=hash(i*13+k,Math.floor(a*20));if(tw<.5)continue;const fx=bx+(hash(i,k+9)-.5)*26,fy=by+(hash(k+5,i)-.5)*18+22*ta+28*ta*ta;
      if(tw>.85&&liv>.3)stjarna(fx,fy,4+tw*3,'#ffffff',liv*(tw-.5)*1.8);else prick(fx,fy,1.2+tw*1.4,tw>.75?'#ffffff':'#ffe2a6',liv*(tw-.5)*1.9)}}
    continue}
   const u=a/q.liv,fade=u<.5?1:Math.pow(clamp((1-u)/.5),1.3);
   // färgen vandrar med åldern: ung gnista = vitgul, mitt i livet = egen färg, gammal = rödorange glöd
   const ung=clamp(1-a/.35),gammal=clamp((u-.55)/.45),kropp=gammal>0?blanda(q.farg,GLOD,gammal*.8):q.farg;
   const L=Math.min(a,q.svans);let x0,y0;punkt(q,a-L);x0=px;y0=py;
   for(let j=1;j<=N;j++){punkt(q,a-L+L*j/N);const f=j/N;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(px,py);x0=px;y0=py;
    if(!pass){ctx.strokeStyle=kropp;ctx.lineWidth=q.bredd*2.4*f;ctx.globalAlpha=Math.min(1,fade*.12*f*stil.glod);ctx.stroke()}
    else{ctx.strokeStyle=f>.8&&ung>0?blanda(kropp,HUVUD,ung):kropp;ctx.lineWidth=q.bredd*(.25+.75*f);ctx.globalAlpha=fade*Math.pow(f,1.4)*.95;ctx.stroke()}}
   if(!pass)continue;
   const hx=px,hy=py;
   if(q.huvud){ctx.globalCompositeOperation='lighter';prick(hx,hy,q.bredd*1.9,kropp,fade*.22);ctx.globalCompositeOperation='source-over';prick(hx,hy,q.bredd*.7,ung>0?blanda(kropp,HUVUD,.5+ung*.5):kropp,fade);prick(hx,hy,q.bredd*.34,HUVUD,fade*.95)}
   // CROSSETTE: gnistan delar sig i fyra små gnistor med en vit smäll, som sprakar vidare utåt
   if(q.delas&&a>q.delas.ts){const d=q.delas,ta=a-d.ts;punkt(q,d.ts);const bx=px,by=py;
    if(ta<.12){ctx.globalCompositeOperation='lighter';prick(bx,by,10*(1-ta/.12)+3,'#ffffff',(1-ta/.12)*.9);ctx.globalCompositeOperation='source-over'}
    const ut=1-Math.exp(-6*ta),liv=clamp(1-ta/.75);if(liv>0)for(let k=0;k<4;k++){const vv=d.v+k*TAU/4,cx=bx+Math.cos(vv)*46*ut,cy=by+Math.sin(vv)*46*ut+40*ta*ta;
     const sx=bx+Math.cos(vv)*46*Math.max(0,ut-.35),sy=by+Math.sin(vv)*46*Math.max(0,ut-.35);
     ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(cx,cy);ctx.strokeStyle=blanda(HUVUD,q.farg,ta/.75);ctx.lineWidth=2.2;ctx.globalAlpha=liv;ctx.stroke();prick(cx,cy,2.4,HUVUD,liv)}}
   // GLITTER: korn längs spåret som tindrar var för sig (snabbt, oregelbundet) — eldens kornighet
   if(q.glitter&&a>.25){const sen=clamp((u-.45)/.4),antal=3+Math.round(sen*4),stor=1+sen*.9;
    for(let k=0;k<antal;k++){const pos=hash(i,k);punkt(q,a-L*pos*(1.6+sen));const tw=hash(i*7+k,Math.floor(a*24));
     if(tw>.42)prick(px+(hash(k,i)-.5)*(4+sen*8),py+(hash(i,k*3)-.5)*(4+sen*8),(.9+tw*1.5)*stor,tw>.8?'#ffffff':'#ffe2a6',Math.max(fade,sen*.8)*(tw-.42)*1.7)}}
  }
 }
 ctx.restore();badge(e,age)}

// småstjärnor i bakgrunden medan programmet pågår, som i referensbilden
const himmel=[];{const r=root.VFX.createRng(root.VFX.hashSeed(seed,'himmel'));const n=mode==='1'?14:mode==='10'?24:40;
 for(let i=0;i<n;i++)himmel.push({x:r.range(30,930),y:r.range(30,770),at:r.range(1.3,duration-2),liv:r.range(1,2.4),rad:r.range(3.5,7),c:i%3?'#ffffff':'#ffd99a'})}
function himlen(t){ctx.save();for(const s of himmel){const a=t-s.at;if(a<0||a>s.liv)continue;stjarna(s.x,s.y,s.rad,s.c,Math.sin(Math.PI*a/s.liv)*.85)}ctx.restore()}

function render(context,width,height,time){ctx=context;ctx.clearRect(0,0,width,height);
 if(!Number.isFinite(time)||time<0||time>=duration||width<=0||height<=0)return;
 ctx.save();const scale=Math.min(width/960,height/800);ctx.translate((width-960*scale)/2,(height-800*scale)/2);ctx.scale(scale,scale);
 let aktiva=0;for(const e of skal)if(time>=e.at&&time<e.at+5.4)aktiva+=e.p.length;stride=Math.max(requested,Math.ceil(aktiva/2300),1);
 himlen(time);for(const e of skal)flyg(e,time);for(const e of skal)explosion(e,time);
 ctx.restore()}
function renderStill(context,width,height){ctx=context;ctx.clearRect(0,0,width,height);if(width<=0||height<=0)return;ctx.save();const scale=Math.min(width/960,height/800);
 ctx.translate((width-960*scale)/2,(height-800*scale)/2);ctx.scale(scale,scale);for(const e of skal.slice(0,5))explosion(e,e.at+1.5);ctx.restore()}
function setOptions(next={}){if(!next||typeof next!=='object')return{...options};if(typeof next.customPalette==='boolean')options.customPalette=next.customPalette;
 for(const k of ['primary','secondary'])if(validColor(next[k]))options[k]=next[k].toLowerCase();if(['classic','willow','sparkle'].includes(next.style))options.style=next.style;
 const tm=tema();let hi=0;for(const e of skal){const f=e.typ==='sol'?tm.sol:tm.hj[(hi++)%tm.hj.length];e.farg=f;for(const q of e.p)q.farg=f}return{...options}}
if(options.customPalette)setOptions({});
return{ready,render,renderStill,duration:()=>duration,toppen:()=>Math.min(duration,Math.max(...skal.map(e=>e.at))+TOPP_EFTER),setQuality(v){requested=Math.max(1,Math.min(128,Number(v)|0))},setOptions,getOptions:()=>({...options}),
 inspect:()=>({motor:'festival',theme,mode,duration,seed,variantIndex:variant,stride,skal:skal.length,partiklar:skal.reduce((n,e)=>n+e.p.length,0),typer:skal.map(e=>e.typ)}),
 maxParticles:()=>skal.reduce((n,e)=>n+e.p.length,0)};
}
/* TOPPEN (2026-10-18): när programmet har nått sin sista explosion och den har slagit ut — solen och
   hjärtana står färdiga och hjärtslaget (punkt(): puls t .55–1.0) är klart. Gift Fireworks-kön låter
   NÄSTA fyrverkeri starta här, inte först när hela visningstiden har gått; det här tonas ut i sin egen
   takt. Tiderna är programmets egna `at` ovan (sista smällen per nivå) plus TOPP_EFTER, och provet
   gift-fireworks-en-i-taget.test.js jämför tabellen mot en riktig renderares toppen() för varje nivå,
   så de kan inte glida isär tyst. 1: sista hjärtat 1.55+3*.18 = 2.09. 10: sista solen 6. 100: sista solen 15. */
const TOPP_EFTER=1,SISTA_SMALL={'1':1.55+3*.18,'10':6,'100':15};
const toppen=combo=>{const m=Number(combo)>=100?'100':Number(combo)>=10?'10':'1';return SISTA_SMALL[m]+TOPP_EFTER};
root.VyraFestival={create,TEMAN,toppen,TOPP_EFTER};
})(window);
