/* playground-widgets.js - Top Gifter Podium, Top Streak Flip och Goal Pro (godkända i widget-playgrounden 2026-10).
   Portad kod + adapter mot VYRA:s wh/props/bind/routeLiveBattleEvent (samma recept som gift-bubbles.js).
   Genereras av playgroundens vyra-port/build_port.py - redigera i playgrounden, inte här. */
(function(){
'use strict';
const PGD=window.VYRA_PG;if(!PGD||typeof wh!=='function')return;
const $=(s,r=document)=>r.querySelector(s);
const pick=a=>a[Math.floor(Math.random()*a.length)];
const rnd=(a,b)=>a+Math.random()*(b-a);
const fmt=n=>Math.round(n).toLocaleString("sv-SE");
function hue(n){let h=0;for(const c of n)h=(h*31+c.charCodeAt(0))%360;return h}
function grad(n){const h=hue(n);return `linear-gradient(135deg,hsl(${h} 80% 58%),hsl(${(h+50)%360} 80% 42%))`}
function bump(el){el.classList.remove("bump");void el.offsetWidth;el.classList.add("bump")}


const S={users:{},coins:0,likes:0,follows:0,shares:0,focus:null};
function ensure(n){return S.users[n]||(S.users[n]={coins:0,xp:0})}
function applyState(e){
  const u=ensure(e.user);if(e.avatar)u.img=e.avatar;
  if(e.type==="gift"){const c=e.gift.c*e.count;u.coins+=c;u.xp+=c;S.coins+=c;S.focus=e.user}
  else if(e.type==="likes"){S.likes+=e.count;u.xp+=e.count}
  else if(e.type==="follow"){S.follows++}
  else if(e.type==="share"){S.shares++}
}

function hueNone(){}
const W={goal:{}};
const HD=PGD.frames,HDMAP=Object.fromEntries(HD.map(f=>[f.id,f]));
const IMG=n=>PGD.img[n]||('assets/playground/'+n+'.webp');
const VY=[],ALLF=HD;
function measureFrame(f){
  if(f.measured||f.measuring)return;f.measuring=true;
  const im=new Image();
  im.onload=()=>{
    const N=256,c=document.createElement("canvas");c.width=c.height=N;const x=c.getContext("2d");x.drawImage(im,0,0,N,N);
    let d;try{d=x.getImageData(0,0,N,N).data}catch(e){return}
    const A=(px,py)=>d[(py*N+px)*4+3];
    const rad=[];
    for(let a=0;a<360;a+=4){const t=a*Math.PI/180;for(let r=8;r<N/2;r++){const px=Math.round(N/2+r*Math.cos(t)),py=Math.round(N/2+r*Math.sin(t));if(A(px,py)>128){rad.push(r);break}}}
    if(rad.length<20)return;rad.sort((p,q)=>p-q);const med=rad[rad.length>>1];
    let bottom=0;
    for(let py=N-1;py>0&&!bottom;py--){for(let px=Math.round(N*.44);px<=Math.round(N*.56);px++){if(A(px,py)>128){bottom=py/N;break}}}
    f.hole=Math.min(.95,Math.max(.3,2*med/N));f.mdy=Math.max(84,(bottom||.95)*100-9);f.measured=true;
    document.querySelectorAll('.fimgbox[data-fid="'+f.id+'"]').forEach(b=>{b.style.setProperty("--hole",f.hole);b.style.setProperty("--mdy",f.mdy+"%")});
  };
  im.src=IMG(f.imgKey);
}
function hueOf(hex){const n=parseInt(hex.slice(1),16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;return Math.round((h*60+360)%360)}
function makeFrameBox(f,rank){
  const box=document.createElement("div");box.className="fimgbox";box.dataset.ftheme=f.theme;
  box.style.setProperty("--hole",f.hole);box.style.setProperty("--mdy",(f.mdy||88)+"%");box.style.setProperty("--fg",f.glow);
  box.dataset.fid=f.id;const ik=f.imgKey||(f.id+"-key");box.style.setProperty("--img",`url("${IMG(ik)}")`);if(f.vy)measureFrame(f);
  const rin=f.hole*50+3,rout=46;let p="";
  for(let i=0;i<8;i++){
    const s1=Math.sin((i+1)*12.9898+f.id.length*3.1)*43758.5453,r1=s1-Math.floor(s1);
    const s2=Math.sin((i+1)*78.233+f.id.length)*12345.6,r2=s2-Math.floor(s2);
    const th=(i/8+r1*.1)*6.2832,rr=rin+r2*(rout-rin);
    p+=`<i style="--x:${(50+rr*Math.cos(th)).toFixed(1)}%;--y:${(50+rr*Math.sin(th)).toFixed(1)}%;--d:${(i*.6).toFixed(2)}s;--r:${Math.floor(r1*160-80)}deg"></i>`;
  }
  const own=rank&&PGD.img&&PGD.img[f.id+"-rank-"+rank];
  const mk=own?f.id+"-rank-"+rank:"medal-"+rank;
  const crownOk=rank===1&&PGD.img&&PGD.img[f.id+"-crown"];
  if(f.top!=null)box.style.setProperty("--ctop",f.top+"%");
  box.style.setProperty("--mh",(hueOf(f.glow||"#ffd27a")-38)+"deg");box.style.setProperty("--ms",(f.id==="diamond-halo"?0.35:1.7));
  if(f.crownRatio)box.style.setProperty("--cr",f.crownRatio);
  box.innerHTML=(rank===1?`<div class="rays"></div>`:"")+`<img src="${IMG(ik)}" alt=""><div class="fshine"></div><div class="fpart">${p}</div>`
    +(crownOk?`<div class="rcrown" style="--cimg:url('${IMG(f.id+"-crown")}')"><img src="${IMG(f.id+"-crown")}" alt=""></div>`:"")
    +(rank?`<div class="rbadge${own?" own":""}" data-rank="${rank}"><img src="${IMG(mk)}" alt="${rank}"></div>`:"");
  return box;
}
function fitAvatar(host,f){
  if(f.vy||!(PGD.img&&PGD.img[f.id+"-hole"]))return;
  const av=host.querySelector(".av");if(!av||av.classList.contains("fitav"))return;
  const w=av.offsetWidth||150;
  host.style.setProperty("--aw",w+"px");host.classList.add("hasfit");
  av.style.setProperty("--hole",f.hole);av.style.setProperty("--hm",`url("${IMG(f.id+"-hole")}")`);av.classList.add("fitav");
}
function unfitAvatars(r){
  r.querySelectorAll(".av.fitav").forEach(a=>{a.classList.remove("fitav");a.style.removeProperty("--hm");a.style.removeProperty("--hole")});
  r.querySelectorAll(".hasfit").forEach(h=>{h.classList.remove("hasfit");h.style.removeProperty("--aw")});
}
window.crownBurst=function(col){
  const box=col.querySelector(".fimgbox"),cr=col.querySelector(".rcrown");if(!box||!cr)return;
  cr.style.animation="none";void cr.offsetWidth;cr.style.animation="";
  const top=getComputedStyle(box).getPropertyValue("--ctop")||"6%";
  for(let i=0;i<18;i++){const a=(i/18)*6.2832+Math.random()*.4,d=20+Math.random()*22,sp=document.createElement("i");sp.className="spark";
    sp.style.left="50%";sp.style.top="50%";sp.style.setProperty("--dx",(Math.cos(a)*d)+"cqw");sp.style.setProperty("--dy",(Math.sin(a)*d*.8)+"cqw");
    sp.style.animationDelay=(Math.random()*.15)+"s";cr.appendChild(sp);setTimeout(()=>sp.remove(),1300)}
};

function crownBurst(col){
  const box=col.querySelector(".fimgbox"),cr=col.querySelector(".rcrown");if(!box||!cr)return;
  cr.style.animation="none";void cr.offsetWidth;cr.style.animation="";
  const top=getComputedStyle(box).getPropertyValue("--ctop")||"6%";
  for(let i=0;i<18;i++){const a=(i/18)*6.2832+Math.random()*.4,d=20+Math.random()*22,sp=document.createElement("i");sp.className="spark";
    sp.style.left="50%";sp.style.top="50%";sp.style.setProperty("--dx",(Math.cos(a)*d)+"cqw");sp.style.setProperty("--dy",(Math.sin(a)*d*.8)+"cqw");
    sp.style.animationDelay=(Math.random()*.15)+"s";cr.appendChild(sp);setTimeout(()=>sp.remove(),1300)}
}
W.podium={name:"Top Gifter-podium",title:true,
  defaults:{accent:"#ffd24a",accent2:"#ff4fa3",title:"TOP GIFTERS"},schema:[],
  create(root,O){
    root.innerHTML='<div class="pod"><div class="pod-title"></div><div class="pod-cols"></div></div>';
    const cols=$(".pod-cols",root),title=$(".pod-title",root),els=[];
    [1,0,2].forEach(r=>{const c=document.createElement("div");c.className="pcol r"+(r+1);
      c.innerHTML='<div class="crown">👑</div><div class="avw"><div class="av"></div><div class="fxbox"><i></i><i></i><i></i></div></div><div class="nm"></div><div class="cn"></div><div class="blk"><span></span></div>';
      cols.appendChild(c);els[r]=c});
    function refresh(){
      title.textContent=O().title;
      const top=Object.entries(S.users).filter(u=>u[1].coins>0).sort((a,b)=>b[1].coins-a[1].coins).slice(0,3);
      for(let r=0;r<3;r++){
        const c=els[r],u=top[r],av=$(".av",c);
        c.classList.toggle("dim",!u);
        const name=u?u[0]:"—",txt=u?fmt(u[1].coins):"0";
        av.textContent=u?name[0].toUpperCase():"?";
        av.style.background=u?grad(name):"#ffffff22";const pimg=u&&u[1].img;if(pimg){av.style.background="url('"+pimg+"') center/cover";av.textContent=""}
        $(".nm",c).textContent=name;
        $(".blk span",c).textContent=r+1;
        const cn=$(".cn",c);
        const first=c.dataset.n===undefined;
        if(cn.textContent!==txt||c.dataset.n!==name){cn.textContent=txt;if(u&&!first)bump(c)}
        const changed1=(r===0&&u&&!first&&c.dataset.n!==name);c.dataset.n=name;if(changed1)setTimeout(()=>crownBurst(c),60);
      }
    }
    return{refresh,event(e){if(e.type==="gift"||e.type==="reset")refresh()},destroy(){}};
  }};


const STREAK_MODELS=PGD.streak;
const STREAK_MAP=Object.fromEntries(STREAK_MODELS.map(m=>[m.id,m]));
W.streak={name:"Top Streak",title:false,
  defaults:{accent:"#ffc83d",accent2:"#ff8a1f"},schema:[
    {k:"model",l:"Modell",t:"select",o:STREAK_MODELS.map(m=>[m.id,m.name]),d:"royal-wings"},
    {k:"mcol",l:"Färger från modellen",t:"select",o:[["1","Ja"],["0","Nej (använd Färg 1/2)"]],d:"1"},
    {k:"gap",l:"Streak bryts efter (s)",t:"range",min:3,max:20,step:1,d:8},
    {k:"minn",l:"Visa från streak",t:"range",min:1,max:10,step:1,d:2},
    {k:"showname",l:"Visa namn",t:"select",o:[["1","Ja"],["0","Nej"]],d:"1"},
    {k:"flip",l:"Flippa mellan profil och gåva",t:"select",o:[["1","Ja"],["0","Nej"]],d:"1"},
    {k:"flipt",l:"Flip-tid (s)",t:"range",min:2,max:10,step:.5,d:3.5}],
  create(root,O){
    const FL='<svg viewBox="0 0 24 24"><path d="M13.5 2s.6 3.2-1.3 5.5C10.4 9.6 8 11 8 14.500A5.500 5.500 0 0 0 13.500 20c3 0 5.500-2.300 5.500-5.600 0-2.200-1-3.800-2-5 0 0-.5 1.700-1.700 2.500.3-3-.8-6.400-1.800-9.900z"/></svg>';
    root.innerHTML='<div class="stk stk-empty"><div class="stk-stage"><div class="stk-av"><div class="fl"><div class="fa"></div><div class="fb"><span class="ge2"></span></div></div></div><div class="stk-gift"><span class="ge"></span></div><img class="stk-frame" alt=""></div><div class="stk-info"><div class="stk-nm"></div><div class="stk-pill">'+FL+'<small>STREAK</small><b>0</b></div></div></div>';
    const el=$(".stk",root),av=$(".stk-av",root),fl=$(".fl",root),fa=$(".fa",root),ge2=$(".ge2",root),gf=$(".stk-gift",root),ge=$(".ge",gf),img=$(".stk-frame",root),nm=$(".stk-nm",root),cnt=$(".stk-pill b",root);
    const S=760,st=O().st,live=st.live||(st.live={}),top=st.top||(st.top={user:null,gift:null,n:0,img:''});let shown=top.n,raf=0,flipT=0,side=0;
    function model(){return STREAK_MAP[O().x.model]||STREAK_MODELS[0]}
    function giftHTML(g){const gu=g.img||PGD.gift[g.id]||"assets/gifts/events/0001_Rose.png";return '<img src="'+gu+'" alt="" onerror="this.replaceWith(document.createTextNode(\''+g.e+'\'))">'}
    function setSide(v){side=v;fl.classList.toggle("back",!!v)}
    function layout(){
      const m=model();img.src=PGD.img[m.key]||m.file;
      const b=m.big,s=m.small,ar=b.r*1.05;
      av.style.left=(b.cx-ar)*S+"px";av.style.top=(b.cy-ar)*S+"px";av.style.width=av.style.height=ar*2*S+"px";fa.style.fontSize=b.r*S*.6+"px";
      ge2.style.width=ge2.style.height=(ar*2*S*.64)+"px";
      if(O().x.mcol==="1"){el.style.setProperty("--a",m.a);el.style.setProperty("--b",m.b)}else{el.style.removeProperty("--a");el.style.removeProperty("--b")}
      if(s){gf.style.display="";gf.style.left=(s.cx-s.r)*S+"px";gf.style.top=(s.cy-s.r)*S+"px";gf.style.width=gf.style.height=s.r*2*S+"px";ge.style.width=ge.style.height=(s.r*2*S*.74)+"px"}
      else gf.style.display="none";
      clearInterval(flipT);flipT=0;
      if(!s&&O().x.flip==="1")flipT=setInterval(()=>{if(top.user&&top.n>=O().x.minn)setSide(side^1)},O().x.flipt*1000);
      else setSide(0);
    }
    function paint(swap){
      const has=top.user&&top.n>=O().x.minn;el.classList.toggle("stk-empty",!has);
      if(top.user){if(top.img){fa.style.background="url('"+top.img+"') center/cover";fa.textContent=""}else{fa.style.background=grad(top.user);fa.textContent=top.user[0].toUpperCase()}ge.innerHTML=giftHTML(top.gift);ge2.innerHTML=giftHTML(top.gift)}
      else{fa.style.background="radial-gradient(circle,#2a2433,#0c0b12)";fa.textContent="?";ge.innerHTML="";ge2.innerHTML=""}
      nm.textContent=top.user?top.user:"Ingen streak än";nm.style.display=O().x.showname==="1"?"":"none";
      if(swap){setSide(0);av.classList.remove("swap");void av.offsetWidth;av.classList.add("swap")}
      if(!raf)loop();
    }
    function loop(){shown+=(top.n-shown)*.2;if(Math.abs(top.n-shown)<.5)shown=top.n;cnt.textContent=Math.round(shown);raf=shown===top.n?0:requestAnimationFrame(loop)}
    function roar(){
      el.classList.remove("roar");void el.offsetWidth;el.classList.add("roar");
      const m=model(),s=m.small,r=document.createElement("div");r.className="stk-ring";
      if(s){gf.classList.remove("pop");void gf.offsetWidth;gf.classList.add("pop");
        const d=s.r*2*S;r.style.cssText="left:"+(s.cx-s.r)*S+"px;top:"+(s.cy-s.r)*S+"px;width:"+d+"px;height:"+d+"px";
        r.animate([{transform:"scale(1)",opacity:.9},{transform:"scale(2.6)",opacity:0}],{duration:800/O().speed,easing:"ease-out"}).onfinish=()=>r.remove()}
      else{const b=m.big,d=b.r*2*S*1.02;r.style.cssText="left:"+(b.cx-b.r*1.02)*S+"px;top:"+(b.cy-b.r*1.02)*S+"px;width:"+d+"px;height:"+d+"px";
        r.animate([{transform:"scale(1)",opacity:.85},{transform:"scale(1.22)",opacity:0}],{duration:900/O().speed,easing:"ease-out"}).onfinish=()=>r.remove()}
      $(".stk-stage",root).appendChild(r);
    }
    layout();paint(false);
    return{refresh(){layout();paint(false)},
      event(e){
        if(e.type==="reset"){for(const k in live)delete live[k];top.user=null;top.n=0;top.img='';shown=0;paint(false);return}
        if(e.type!=="gift")return;
        const now=Date.now(),L=live[e.user],gap=O().x.gap*1000;
        if(L&&L.gift.id===e.gift.id&&now-L.last<gap){L.n+=e.count;L.last=now}
        else live[e.user]={gift:e.gift,n:e.count,last:now,img:e.avatar||''};
        const cur=live[e.user];
        if(cur.n>top.n||(top.user===e.user&&cur.gift.id===top.gift.id&&cur.n>=top.n)){
          const newHolder=top.user!==e.user;
          top.user=e.user;top.gift=cur.gift;top.n=cur.n;top.img=cur.img||e.avatar||'';paint(newHolder);roar();
        }
      },destroy(){cancelAnimationFrame(raf);clearInterval(flipT)}};
  }};


const GMET={
  coins:{l:"GIFT-MÅL",i:"💰",d:2000,n:"Gåvor (coins)",f:e=>e.type==="gift"?e.gift.c*e.count:0},
  gifts:{l:"GÅVOR",i:"🎁",d:50,n:"Antal gåvor",f:e=>e.type==="gift"?e.count:0},
  likes:{l:"TAP-MÅL",i:"❤️",d:1000,n:"Tap / likes",f:e=>e.type==="likes"?e.count:0},
  follows:{l:"FÖLJ-MÅL",i:"➕",d:50,n:"Följare",f:e=>e.type==="follow"?1:0},
  shares:{l:"DELA-MÅL",i:"🔁",d:25,n:"Delningar",f:e=>e.type==="share"?1:0},
  comments:{l:"KOMMENTAR-MÅL",i:"💬",d:50,n:"Kommentarer",f:e=>e.type==="comment"?1:0}};
const GMETOPT=Object.keys(GMET).map(k=>[k,GMET[k].n]);
W.goalvar={name:"Mål-varianter",
  defaults:{accent:"#3dffb0",accent2:"#2d8cff"},schema:[
    {k:"metric",l:"Mäter",t:"select",o:GMETOPT,d:"coins"},
    {k:"target",l:"Mål",t:"range",min:5,max:20000,step:5,d:2000}],
  create(root,O){
    const R=80,C=2*Math.PI*R,G=Math.PI*R,MS=[.25,.5,.75];
    const ringTicks="";
    const gaugeTicks="";
    const vticks="";
    const barTicks="";
    const NOTK=true;
    root.innerHTML=`<div class="gv">
      <div class="gvc"><div class="gvcap">1 · Rak bar</div><div class="gv1"><div class="s3t s1h"><span class="s3i"></span><span class="s3l">GIFT-MÅL</span><span class="s5r"><b class="pc"></b><small>av <span class="t"></span></small></span></div><div class="s6row s1row"><div class="gv1b"><i class="f f1 nof"></i></div><canvas></canvas><i class="s6head"></i><div class="s5mark s6mark"><b class="mk">0</b><i class="s5tri"></i></div></div></div></div>
      <div class="gvc"><div class="gvcap">2 · Pill</div><div class="gv2w"><div class="s3t s1h"><span class="s3i"></span><span class="s3l">GIFT-MÅL</span><span class="s5r"><b class="pc"></b><small>av <span class="t"></span></small></span></div><div class="s6row s2row"><div class="gv2"><i class="f f2 nof"></i><span class="v"></span></div><canvas></canvas><i class="s6head"></i><div class="s5mark s6mark"><b class="pc">0%</b><i class="s5tri"></i></div></div></div></div>
      <div class="gvc"><div class="gvcap">3 · Ring</div><div class="gv3w"><div class="s3t"><span class="s3i"></span><span class="s3l">GIFT-MÅL</span></div><div class="gv3"><svg viewBox="0 0 200 200"><defs><linearGradient id="gv3g" x1="1" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--a)"/><stop offset="1" style="stop-color:var(--b)"/></linearGradient></defs><circle class="tr" cx="100" cy="100" r="${R}" fill="none" stroke-width="16"/><circle class="pg" cx="100" cy="100" r="${R}" fill="none" stroke-width="16" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>${ringTicks}</svg><canvas width="600" height="600"></canvas><i class="s3head"></i><b class="s3mark mk">0</b><div class="mid"><b class="pc"></b><small>av <span class="t"></span></small></div></div></div></div>
      <div class="gvc"><div class="gvcap">4 · Mätare</div><div class="gv4w"><div class="s3t"><span class="s3i"></span><span class="s3l">GIFT-MÅL</span></div><div class="gv4"><svg viewBox="0 0 200 118"><defs><linearGradient id="gv4g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--a)"/><stop offset="1" style="stop-color:var(--b)"/></linearGradient></defs><path class="tr" d="M20 100 A${R} ${R} 0 0 1 180 100" fill="none" stroke-width="16" stroke-linecap="round"/><path class="pg" d="M20 100 A${R} ${R} 0 0 1 180 100" fill="none" stroke-width="16" stroke-linecap="round" stroke-dasharray="${G}" stroke-dashoffset="${G}"/>${gaugeTicks}</svg><canvas width="840" height="500"></canvas><i class="s4head"></i><b class="s4mark mk">0</b><div class="mid"><b class="pc"></b><small>av <span class="t"></span></small></div></div></div></div>
      <div class="gvc"><div class="gvcap">5 · Steg</div><div class="gv5"><div class="s3t s5h"><span class="s3i"></span><span class="s3l">GIFT-MÅL</span><span class="s5r"><b class="pc"></b><small>av <span class="t"></span></small></span></div><div class="s5row"><div class="seg">${Array.from({length:10},(_,i)=>`<i style="--c:color-mix(in srgb,var(--a) ${Math.round(100-i/9*100)}%,var(--b) ${Math.round(i/9*100)}%)"><u></u></i>`).join("")}</div><canvas></canvas><div class="s5mark"><b class="mk">0</b><i class="s5tri"></i></div></div></div></div>
      <div class="gvc"><div class="gvcap">6 · Bara siffra</div><div class="gv6"><div class="s3t s6t"><span class="s3i"></span><span class="s3l">GIFT-MÅL</span></div><b class="big n"></b><small>av <span class="t"></span></small><div class="s6row"><div class="gv6b"><i class="f6"></i></div><canvas></canvas><i class="s6head"></i><div class="s5mark s6mark"><b class="pc">0%</b><i class="s5tri"></i></div></div></div></div>
      <div class="gvc"><div class="gvcap">7 · Stående</div><div class="gv7w"><div class="s3t"><span class="s3i"></span><span class="s3l">GIFT-MÅL</span></div><div class="gv7">
        <div class="vbar"><i class="fv"><i class="s9b" style="width:6px;height:6px;left:25%;animation-duration:4.0s;animation-delay:0.2s"></i><i class="s9b" style="width:8px;height:8px;left:18%;animation-duration:4.0s;animation-delay:0.2s"></i><i class="s9b" style="width:8px;height:8px;left:33%;animation-duration:3.1s;animation-delay:1.7s"></i><i class="s9b" style="width:4px;height:4px;left:36%;animation-duration:3.2s;animation-delay:1.7s"></i><i class="s9b" style="width:8px;height:8px;left:21%;animation-duration:5.5s;animation-delay:2.5s"></i><i class="s9b" style="width:8px;height:8px;left:13%;animation-duration:4.5s;animation-delay:1.6s"></i><i class="s9b" style="width:5px;height:5px;left:11%;animation-duration:4.4s;animation-delay:0.5s"></i><i class="s9b" style="width:7px;height:7px;left:24%;animation-duration:4.4s;animation-delay:2.3s"></i><i class="s9b" style="width:8px;height:8px;left:29%;animation-duration:3.3s;animation-delay:2.3s"></i><i class="s9b" style="width:5px;height:5px;left:53%;animation-duration:3.3s;animation-delay:2.8s"></i><i class="s9b" style="width:8px;height:8px;left:13%;animation-duration:4.6s;animation-delay:2.0s"></i></i>${vticks}</div>
        <div class="vinfo"><b class="big n"></b><small>av <span class="t"></span></small></div>
        <div class="vpill"><i class="fv"><i class="s9b" style="width:8px;height:8px;left:60%;animation-duration:5.0s;animation-delay:1.9s"></i><i class="s9b" style="width:7px;height:7px;left:52%;animation-duration:3.8s;animation-delay:3.2s"></i><i class="s9b" style="width:9px;height:9px;left:37%;animation-duration:3.2s;animation-delay:1.2s"></i><i class="s9b" style="width:7px;height:7px;left:49%;animation-duration:4.9s;animation-delay:1.2s"></i><i class="s9b" style="width:4px;height:4px;left:21%;animation-duration:4.3s;animation-delay:0.7s"></i><i class="s9b" style="width:6px;height:6px;left:25%;animation-duration:5.4s;animation-delay:1.7s"></i><i class="s9b" style="width:9px;height:9px;left:15%;animation-duration:5.0s;animation-delay:2.3s"></i><i class="s9b" style="width:6px;height:6px;left:49%;animation-duration:4.8s;animation-delay:2.4s"></i><i class="s9b" style="width:8px;height:8px;left:64%;animation-duration:3.2s;animation-delay:0.4s"></i><i class="s9b" style="width:6px;height:6px;left:66%;animation-duration:4.8s;animation-delay:0.3s"></i><i class="s9b" style="width:9px;height:9px;left:45%;animation-duration:4.7s;animation-delay:4.0s"></i></i><span class="pc"></span></div>
      </div></div></div>
      <div class="gvc"><div class="gvcap">8 · Smal med pil</div><div class="gv9"><div class="s9t"><span class="s9i"></span><span class="s9l">GIFT-MÅL</span></div><div class="s9w"><div class="vbar s9bar"><i class="fv"><i class="s9b" style="width:5px;height:5px;left:2px;animation-duration:3.2s;animation-delay:0.0s"></i><i class="s9b" style="width:7px;height:7px;left:7px;animation-duration:4.1s;animation-delay:0.9s"></i><i class="s9b" style="width:4px;height:4px;left:5px;animation-duration:2.8s;animation-delay:1.7s"></i><i class="s9b" style="width:6px;height:6px;left:3px;animation-duration:3.7s;animation-delay:2.4s"></i><i class="s9b" style="width:5px;height:5px;left:8px;animation-duration:4.6s;animation-delay:0.4s"></i><i class="s9b" style="width:8px;height:8px;left:4px;animation-duration:5.2s;animation-delay:3.1s"></i><i class="s9b" style="width:4px;height:4px;left:9px;animation-duration:3.0s;animation-delay:2.0s"></i><i class="s9b" style="width:6px;height:6px;left:6px;animation-duration:3.9s;animation-delay:1.2s"></i><i class="s9b" style="width:5px;height:5px;left:3px;animation-duration:4.4s;animation-delay:3.6s"></i><i class="s9b" style="width:7px;height:7px;left:8px;animation-duration:3.4s;animation-delay:0.6s"></i><i class="s9b" style="width:4px;height:4px;left:4px;animation-duration:2.6s;animation-delay:2.8s"></i><i class="s9b" style="width:6px;height:6px;left:2px;animation-duration:4.8s;animation-delay:1.5s"></i></i></div><div class="s9mark"><svg viewBox="0 0 20 30"><path d="M19 2 L2 15 L19 28 Z" fill="var(--a)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg><b class="mk">0</b></div></div><div class="s9n"><b class="pc"></b><small>av <span class="t"></span></small></div></div></div>
      <div class="gvc"><div class="gvcap">9 · Senaste bidrag och takt</div><div class="gv8"><div class="gvlast"><div class="empty">Väntar på första gåvan…</div></div><div class="gvpace"><b class="rate">+0/min</b><small class="eta">—</small></div></div></div>
      <div class="gvtoast"></div>
      <div class="gvbanner">MÅL NÅTT!</div>
    </div>`;
    const box=$(".gv",root),st=O().st;let val=st.val||0,shown=val,level=st.level||1,busy=false,raf=0;
    let fr=null;
    function buildFrame(){
      const stage=$(".fstage",root);stage.innerHTML="";const f=HDMAP[O().frameImg]||HD[0];if(!f){fr=null;return}
      const avw=document.createElement("div");avw.className="avw";avw.innerHTML='<div class="av" style="background:'+grad("Jokero")+'">J</div>';stage.appendChild(avw);
      const fbox=makeFrameBox(f,0);fbox.querySelectorAll(".fpart,.fshine").forEach(e=>e.remove());fbox.classList.add("dimbase");
      const base=fbox.querySelector("img");
      const col=document.createElement("img");col.className="fcol";col.src=base.src;col.alt="";fbox.appendChild(col);
      const head=document.createElement("i");head.className="fhead";fbox.appendChild(head);
      if(PGD.img&&PGD.img[f.id+"-crown"]){const c=document.createElement("div");c.className="rcrown";c.style.setProperty("--cimg","url('"+IMG(f.id+"-crown")+"')");c.innerHTML='<img src="'+IMG(f.id+"-crown")+'" alt="">';fbox.appendChild(c)}
      avw.appendChild(fbox);fitAvatar(avw,f);
      fr={f,col,head};
    }
    function paintFrame(){
      if(!fr)return;const p=Math.min(1,shown/tgt()),deg=p*360,r=(fr.f.hole/2+.5)/2;
      fr.col.style.setProperty("--deg",deg+"deg");
      const a=deg*Math.PI/180;fr.head.style.left=(50+r*100*Math.sin(a))+"%";fr.head.style.top=(50-r*100*Math.cos(a))+"%";fr.head.style.opacity=p>0&&p<1?1:0;
    }
    const tgt=()=>{const b=O().x.target*Math.pow(1.25,level-1),st=b<200?5:50;return Math.round(b/st)*st||st};
    const q=sel=>root.querySelectorAll(sel);
    function paintText(){
      const T=tgt(),sv=Math.min(Math.round(shown),T),pc=Math.round(Math.min(1,shown/T)*100)+"%";
      q(".v").forEach(e=>e.textContent=fmt(sv)+" / "+fmt(T));q(".pc").forEach(e=>e.textContent=pc);
      q(".n,.mk").forEach(e=>e.textContent=fmt(sv));paintRing();paintGauge();paintSteps();paintBar6();bx1&&bx1.paint();bx2&&bx2.paint();q(".t").forEach(e=>e.textContent=fmt(T));paintFrame();
    }
    function loop(){shown+=(val-shown)*.14;if(Math.abs(val-shown)<.6)shown=val;paintText();raf=shown===val?0:requestAnimationFrame(loop)}
    function refresh(){
      const T=tgt(),p=Math.min(1,val/T);
      q(".f:not(.nof)").forEach(e=>e.style.width=(p*100)+"%");q(".s9mark").forEach(e=>e.style.bottom=(p*100)+"%");q(".fv").forEach(e=>e.style.height=(p*100)+"%");
      $(".gv3 .pg",root).style.strokeDashoffset=C*(1-p);$(".gv4 .pg",root).style.strokeDashoffset=G*(1-p);
      q(".tk").forEach(e=>e.classList.toggle("hit",p>=+e.dataset.f-1e-9));
      if(!raf)raf=requestAnimationFrame(loop);
    }
    function pop(n){
      const sw=$(".gv9 .s9w",root);if(sw){const mk=$(".s9mark",sw),pl=document.createElement("div");pl.className="s9plus";pl.textContent="+"+fmt(n);pl.style.bottom="calc("+(Math.min(1,val/tgt())*100)+"% + 20px)";sw.appendChild(pl);setTimeout(()=>pl.remove(),1200/O().speed);
        mk.classList.remove("bump");void mk.offsetWidth;mk.classList.add("bump");const bar=$(".s9bar",sw);bar.classList.add("tap");setTimeout(()=>bar.classList.remove("tap"),300)}
      [".gv1",".gv2",".gv6"].forEach(sel=>{const host=$(sel,root).parentElement,el=document.createElement("div");el.className="gvpop";el.textContent=(GMET[O().x.metric]||GMET.coins).i+" +"+fmt(n);host.appendChild(el);setTimeout(()=>el.remove(),1100)});
    }
    function confetti(){
      const cols=[O().accent,O().accent2,"#fff","#ffd24a"];
      for(let i=0;i<46;i++){const c=document.createElement("div");c.className="gvconf";c.style.background=cols[i%4];c.style.left=(5+Math.random()*90)+"%";c.style.top=(8+Math.random()*10)+"%";box.appendChild(c);
        c.animate([{transform:"translate(0,0) rotate(0)",opacity:1},{transform:`translate(${(Math.random()-.5)*240}px,${420+Math.random()*520}px) rotate(${360+Math.random()*500}deg)`,opacity:0}],{duration:(1300+Math.random()*1100)/O().speed,easing:"cubic-bezier(.2,.6,.4,1)"}).onfinish=()=>c.remove()}
    }
    const ring=$(".gv3",root),cv=ring&&$("canvas",ring),cx2=cv&&cv.getContext("2d"),head3=$(".s3head",root),mk3=$(".s3mark",root);
    let parts=[],lastT=0,spawnAcc=0,raf2=0;if(cx2)cx2.scale(2,2);
    const ringFill=()=>Math.min(1,shown/tgt())*360;
    function paintRing(){
      if(!head3)return;const f=ringFill(),th=f*Math.PI/180,sn=Math.sin(th),cs=Math.cos(th),vis=f>0?1:0;
      head3.style.left=(150+120*sn)+"px";head3.style.top=(150-120*cs)+"px";mk3.style.left=(150+168*sn)+"px";mk3.style.top=(150-168*cs)+"px";head3.style.opacity=vis;mk3.style.opacity=vis;
    }
    function spawn(fast){const fd=ringFill();if(fd<6)return;parts.push({a:Math.random()*Math.min(fd*.2,18),r:(Math.random()-.5)*14,sp:fast?80+Math.random()*90:26+Math.random()*34,sz:2+Math.random()*3.4,life:0,w:Math.random()*6.28})}
    function cloop(t){
      const dt=Math.max(0,Math.min(.05,((t-lastT)/1000)||0));lastT=Math.max(lastT,t);
      if(cx2&&ring.offsetParent){
        const fd=ringFill();spawnAcc+=dt*(fd>6?7:0);while(spawnAcc>1){spawnAcc--;spawn(false)}
        cx2.clearRect(0,0,300,300);
        parts=parts.filter(q=>{q.a+=q.sp*dt;q.life+=dt;q.w+=dt*3;return q.a<fd-1&&q.life<7});
        parts.forEach(q=>{const ang=q.a*Math.PI/180,rr=120+q.r+Math.sin(q.w)*1.2,x=150+rr*Math.sin(ang),y=150-rr*Math.cos(ang);
          const al=.95*Math.max(0,Math.min(1,q.a/10,(fd-q.a)/14));
          cx2.beginPath();cx2.arc(x,y,q.sz,0,6.2832);cx2.fillStyle="rgba(255,255,255,"+(al*.22)+")";cx2.fill();cx2.lineWidth=1;cx2.strokeStyle="rgba(255,255,255,"+(al*.85)+")";cx2.stroke();
          cx2.beginPath();cx2.arc(x-q.sz*.32,y-q.sz*.32,Math.max(.7,q.sz*.28),0,6.2832);cx2.fillStyle="rgba(255,255,255,"+al+")";cx2.fill()});
      }
      raf2=requestAnimationFrame(cloop);
    }
    if(ring){ring.__cloop=cloop;raf2=requestAnimationFrame(cloop)}
    const g4=$(".gv4",root),cv4=g4&&$("canvas",g4),c4=cv4&&cv4.getContext("2d"),head4=$(".s4head",root),mk4=$(".s4mark",root);
    let p4=[],lt4=0,sa4=0,raf4=0;if(c4)c4.scale(2,2);
    const gFill=()=>Math.min(1,shown/tgt())*180;
    const gPos=(deg,rr)=>{const a=deg*Math.PI/180;return[210-rr*Math.cos(a),210-rr*Math.sin(a)]};
    function paintGauge(){
      if(!head4)return;const f=gFill(),h=gPos(f,168),m=gPos(f,216),v=f>0?1:0;
      head4.style.left=h[0]+"px";head4.style.top=h[1]+"px";mk4.style.left=m[0]+"px";mk4.style.top=m[1]+"px";head4.style.opacity=v;mk4.style.opacity=v;
    }
    function spawn4(fast){const fd=gFill();if(fd<5)return;p4.push({a:Math.random()*Math.min(fd*.2,12),r:(Math.random()-.5)*20,sp:fast?50+Math.random()*60:17+Math.random()*24,sz:2.4+Math.random()*4.2,w:Math.random()*6.28})}
    function gloop(t){
      const dt=Math.max(0,Math.min(.05,((t-lt4)/1000)||0));lt4=Math.max(lt4,t);
      if(c4&&g4.offsetParent){
        const fd=gFill();sa4+=dt*(fd>5?7:0);while(sa4>1){sa4--;spawn4(false)}
        c4.clearRect(0,0,420,250);
        p4=p4.filter(q=>{q.a+=q.sp*dt;q.w+=dt*3;return q.a<fd-1});
        p4.forEach(q=>{const pt=gPos(q.a,168+q.r+Math.sin(q.w)*1.3),al=.95*Math.max(0,Math.min(1,q.a/8,(fd-q.a)/12));
          c4.beginPath();c4.arc(pt[0],pt[1],q.sz,0,6.2832);c4.fillStyle="rgba(255,255,255,"+(al*.22)+")";c4.fill();c4.lineWidth=1;c4.strokeStyle="rgba(255,255,255,"+(al*.85)+")";c4.stroke();
          c4.beginPath();c4.arc(pt[0]-q.sz*.32,pt[1]-q.sz*.32,Math.max(.7,q.sz*.28),0,6.2832);c4.fillStyle="rgba(255,255,255,"+al+")";c4.fill()});
      }
      raf4=requestAnimationFrame(gloop);
    }
    if(g4){g4.__cloop=gloop;raf4=requestAnimationFrame(gloop)}
    const row5=$(".s5row",root),cv5=row5&&$("canvas",row5),c5=cv5&&cv5.getContext("2d"),mk5=$(".s5mark",root),segs5=row5?[...row5.querySelectorAll(".seg i")]:[];
    let p5=[],lt5=0,sa5=0,raf5=0,lastSeg=0;const H5=40;
    function headX5(){const W=row5.clientWidth,cw=(W-72)/10,pp=Math.min(1,shown/tgt())*10,i=Math.min(9,Math.floor(pp)),fr=pp>=10?1:pp-i;return i*(cw+8)+fr*cw}
    function paintSteps(){
      if(!row5)return;const pp=Math.min(1,shown/tgt())*10;
      segs5.forEach((e,i)=>{e.firstChild.style.width=Math.max(0,Math.min(1,pp-i))*100+"%"});
      const done=Math.min(10,Math.floor(pp+1e-6));if(done>lastSeg&&done<=10){const e=segs5[done-1];if(e){e.classList.remove("s5pop");void e.offsetWidth;e.classList.add("s5pop")}}lastSeg=done;
      if(row5.clientWidth){mk5.style.left=headX5()+"px";mk5.style.opacity=pp>0?1:0}
    }
    function spawn5(fast){if(!row5.clientWidth)return;const hx=headX5();if(hx<14)return;p5.push({x:Math.random()*Math.min(hx*.25,70),y:8+Math.random()*(H5-16),sp:fast?170+Math.random()*190:48+Math.random()*60,sz:2+Math.random()*3.6,w:Math.random()*6.28})}
    function loop5(t){
      const dt=Math.max(0,Math.min(.05,((t-lt5)/1000)||0));lt5=Math.max(lt5,t);
      if(c5&&row5.offsetParent&&row5.clientWidth){
        const W=row5.clientWidth;if(cv5.width!==W*2){cv5.width=W*2;cv5.height=H5*2;c5.setTransform(2,0,0,2,0,0)}
        const hx=headX5();sa5+=dt*(hx>14?9:0);while(sa5>1){sa5--;spawn5(false)}
        c5.clearRect(0,0,W,H5);
        p5=p5.filter(q=>{q.x+=q.sp*dt;q.w+=dt*3;return q.x<hx-2});
        p5.forEach(q=>{const y=q.y+Math.sin(q.w)*1.6,al=.95*Math.max(0,Math.min(1,q.x/30,(hx-q.x)/40));
          c5.beginPath();c5.arc(q.x,y,q.sz,0,6.2832);c5.fillStyle="rgba(255,255,255,"+(al*.22)+")";c5.fill();c5.lineWidth=1;c5.strokeStyle="rgba(255,255,255,"+(al*.85)+")";c5.stroke();
          c5.beginPath();c5.arc(q.x-q.sz*.32,y-q.sz*.32,Math.max(.7,q.sz*.28),0,6.2832);c5.fillStyle="rgba(255,255,255,"+al+")";c5.fill()});
      }
      raf5=requestAnimationFrame(loop5);
    }
    if(row5){row5.__cloop=loop5;raf5=requestAnimationFrame(loop5)}
    function barFx(row,H,fillEl){
      const cv=$("canvas",row),c=cv&&cv.getContext("2d"),head=$(".s6head",row),mk=$(".s5mark",row);let ps=[],lt=0,sa=0,raf=0;
      const fxp=()=>Math.min(1,shown/tgt())*row.clientWidth;
      function paint(){const p=Math.min(1,shown/tgt());fillEl.style.width=(p*100)+"%";
        if(row.clientWidth){const x=fxp();head.style.left=x+"px";mk.style.left=x+"px";const v=p>0?1:0;head.style.opacity=v;mk.style.opacity=v}}
      function spawn(fast){if(!row.clientWidth)return;const hx=fxp();if(hx<14)return;ps.push({x:Math.random()*Math.min(hx*.25,70),y:H*.18+Math.random()*(H*.64),sp:fast?170+Math.random()*190:48+Math.random()*60,sz:Math.max(2,H*.07)+Math.random()*Math.max(2.5,H*.1),w:Math.random()*6.28})}
      function loop(t){
        const dt=Math.max(0,Math.min(.05,((t-lt)/1000)||0));lt=Math.max(lt,t);
        if(c&&row.offsetParent&&row.clientWidth){
          const W=row.clientWidth;if(cv.width!==W*2){cv.width=W*2;cv.height=H*2;c.setTransform(2,0,0,2,0,0)}
          const hx=fxp();sa+=dt*(hx>14?9:0);while(sa>1){sa--;spawn(false)}
          c.clearRect(0,0,W,H);
          ps=ps.filter(q=>{q.x+=q.sp*dt;q.w+=dt*3;return q.x<hx-2});
          ps.forEach(q=>{const y=q.y+Math.sin(q.w)*H*.04,al=.95*Math.max(0,Math.min(1,q.x/30,(hx-q.x)/40));
            c.beginPath();c.arc(q.x,y,q.sz,0,6.2832);c.fillStyle="rgba(255,255,255,"+(al*.22)+")";c.fill();c.lineWidth=1;c.strokeStyle="rgba(255,255,255,"+(al*.85)+")";c.stroke();
            c.beginPath();c.arc(q.x-q.sz*.32,y-q.sz*.32,Math.max(.6,q.sz*.28),0,6.2832);c.fillStyle="rgba(255,255,255,"+al+")";c.fill()});
        }
        raf=requestAnimationFrame(loop);
      }
      row.__cloop=loop;raf=requestAnimationFrame(loop);
      return{paint,spawn,stop(){cancelAnimationFrame(raf)}};
    }
    const r1=$(".s1row",root),r2=$(".s2row",root);
    const bx1=r1&&barFx(r1,30,$(".f1",r1)),bx2=r2&&barFx(r2,78,$(".f2",r2));
    const row6=$(".gv6 .s6row",root),cv6=row6&&$("canvas",row6),c6=cv6&&cv6.getContext("2d"),f6=row6&&$(".f6",row6),head6=$(".s6head",root),mk6=$(".s6mark",root);
    let p6=[],lt6=0,sa6=0,raf6=0;const H6=22;
    const fx6=()=>Math.min(1,shown/tgt())*row6.clientWidth;
    function paintBar6(){
      if(!row6)return;const p=Math.min(1,shown/tgt());f6.style.width=(p*100)+"%";
      if(row6.clientWidth){const x=fx6();head6.style.left=x+"px";mk6.style.left=x+"px";head6.style.opacity=p>0?1:0;mk6.style.opacity=p>0?1:0}
    }
    function spawn6(fast){if(!row6.clientWidth)return;const hx=fx6();if(hx<14)return;p6.push({x:Math.random()*Math.min(hx*.25,60),y:5+Math.random()*(H6-10),sp:fast?160+Math.random()*180:44+Math.random()*56,sz:2+Math.random()*3,w:Math.random()*6.28})}
    function loop6(t){
      const dt=Math.max(0,Math.min(.05,((t-lt6)/1000)||0));lt6=Math.max(lt6,t);
      if(c6&&row6.offsetParent&&row6.clientWidth){
        const W=row6.clientWidth;if(cv6.width!==W*2){cv6.width=W*2;cv6.height=H6*2;c6.setTransform(2,0,0,2,0,0)}
        const hx=fx6();sa6+=dt*(hx>14?9:0);while(sa6>1){sa6--;spawn6(false)}
        c6.clearRect(0,0,W,H6);
        p6=p6.filter(q=>{q.x+=q.sp*dt;q.w+=dt*3;return q.x<hx-2});
        p6.forEach(q=>{const y=q.y+Math.sin(q.w)*.8,al=.95*Math.max(0,Math.min(1,q.x/30,(hx-q.x)/40));
          c6.beginPath();c6.arc(q.x,y,q.sz,0,6.2832);c6.fillStyle="rgba(255,255,255,"+(al*.22)+")";c6.fill();c6.lineWidth=.9;c6.strokeStyle="rgba(255,255,255,"+(al*.85)+")";c6.stroke();
          c6.beginPath();c6.arc(q.x-q.sz*.32,y-q.sz*.32,Math.max(.5,q.sz*.28),0,6.2832);c6.fillStyle="rgba(255,255,255,"+al+")";c6.fill()});
      }
      raf6=requestAnimationFrame(loop6);
    }
    if(row6){row6.__cloop=loop6;raf6=requestAnimationFrame(loop6)}
    function burst10(){
      for(let i=0;i<22;i++)setTimeout(()=>{spawn(true);spawn4(true);spawn5(true);spawn6(true);bx1&&bx1.spawn(true);bx2&&bx2.spawn(true)},Math.random()*450/O().speed);
      root.querySelectorAll(".gv7 .fv").forEach(f7=>{for(let i=0;i<16;i++){const el=document.createElement("i");el.className="s9b fast";const sz=4+Math.random()*7;el.style.cssText="width:"+sz+"px;height:"+sz+"px;left:"+(6+Math.random()*80)+"%;animation-duration:"+((.9+Math.random()*.9)/O().speed)+"s;animation-delay:"+(Math.random()*.5/O().speed)+"s";f7.appendChild(el);setTimeout(()=>el.remove(),2400/O().speed)}});
      const fv=$(".gv9 .s9bar .fv",root);if(!fv)return;
      for(let i=0;i<14;i++){
        const el=document.createElement("i");el.className="s9b fast";const sz=3+Math.random()*6;
        el.style.cssText="width:"+sz+"px;height:"+sz+"px;left:"+(1+Math.random()*(10-sz/2))+"px;animation-duration:"+((.9+Math.random()*.9)/O().speed)+"s;animation-delay:"+(Math.random()*.5/O().speed)+"s";
        fv.appendChild(el);setTimeout(()=>el.remove(),2400/O().speed);
      }
    }
    const hist=[];let lastP=0,toastT=0;
    function splash(){const o=$(".orb",root);o.classList.remove("splash");void o.offsetWidth;o.classList.add("splash")}
    function fly(e,n){
      const wrap=$(".orbwrap",root),orb=$(".orb",root);if(!wrap)return;
      const em=e?(e.type==="gift"?e.gift.e:e.type==="likes"?"❤️":"➕"):"✨";
      const cnt=Math.max(1,Math.min(9,Math.ceil(n/180)));
      for(let i=0;i<cnt;i++){
        const el=document.createElement("div");el.className="flyg";el.textContent=em;wrap.appendChild(el);
        const sx=-(260+Math.random()*160),sy=-(60+Math.random()*220),delay=i*90/O().speed;
        el.animate([{transform:`translate(${sx}px,${sy}px) scale(.5) rotate(-30deg)`,opacity:0},{transform:`translate(${sx*.45}px,${sy*1.35}px) scale(1.15) rotate(10deg)`,opacity:1,offset:.45},{transform:"translate(0,12px) scale(.7) rotate(0deg)",opacity:1,offset:.92},{transform:"translate(0,16px) scale(.2)",opacity:0}],{duration:900/O().speed,delay,easing:"cubic-bezier(.45,.05,.55,.95)",fill:"both"}).onfinish=()=>{el.remove();if(i===cnt-1)splash()};
      }
    }
    const REWARD={0.25:"25 % · Bonusrunda låst upp!",0.5:"50 % · Halvvägs! Dubbel poäng",0.75:"75 % · Nästan där, kör!"};
    function toast(t){const el=$(".gvtoast",root);el.textContent=t;el.classList.remove("show");void el.offsetWidth;el.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove("show"),2200/O().speed)}
    function showLast(e,n){
      const host=$(".gvlast",root);host.innerHTML="";
      const f=(HD.length&&(HDMAP[O().frameImg]||HD[0]))||null;
      const row=document.createElement("div");row.className="lrow";
      const avw=document.createElement("div");avw.className="avw";avw.innerHTML='<div class="av" style="background:'+grad(e.user)+'">'+e.user[0].toUpperCase()+'</div>';
      row.appendChild(avw);
      const info=document.createElement("div");info.className="linfo";
      info.innerHTML='<b>'+e.user+'</b><span>'+(e.type==="gift"?e.gift.e+" "+e.gift.n+" ×"+e.count:e.type==="likes"?"❤️ tap ×"+e.count:e.type==="share"?"🔁 delade livet":e.type==="comment"?"💬 "+e.text:"➕ följer nu")+'</span><em>+'+fmt(n)+'</em>';
      row.appendChild(info);host.appendChild(row);
      if(f){avw.appendChild(makeFrameBox(f,0));fitAvatar(avw,f)}
    }
    function paceTick(){
      const now=Date.now();while(hist.length&&now-hist[0].t>60000)hist.shift();
      const sum=hist.reduce((a,x)=>a+x.n,0),T=tgt(),rem=Math.max(0,T-val);
      $(".rate",root).textContent="+"+fmt(sum)+"/min";
      $(".eta",root).textContent=sum>0&&rem>0?"ca "+Math.max(1,Math.ceil(rem/sum))+" min kvar":(rem===0?"mål nått":"—");
    }
    const paceI=setInterval(paceTick,1000);
    function add(n,e){
      const T0=tgt(),p0=Math.min(1,val/T0);val+=n;st.val=val;pop(n);
      if(e){hist.push({t:Date.now(),n});showLast(e,n);paceTick()}
      const p1=Math.min(1,val/tgt());
      const s0=Math.floor(p0*10+1e-9),s1=Math.floor(Math.min(p1,.999)*10+1e-9);if(s1>s0&&p1<1)burst10();
      [.25,.5,.75].forEach(m=>{if(p0<m&&p1>=m&&p1<1)toast(REWARD[m])});
      box.classList.toggle("near",p1>=.9&&p1<1);
      refresh();
      if(val>=tgt()&&!busy){busy=true;box.classList.add("done");confetti();
        setTimeout(()=>{box.classList.remove("done","near","full");level++;st.level=level;val=0;st.val=0;shown=0;busy=false;lastP=0;refresh()},2300/O().speed)}
    }
    return{refresh(){refresh()},event(e){const m=GMET[O().x.metric]||GMET.coins;
      if(e.type==="reset"){val=0;st.val=0;st.level=1;shown=0;level=1;busy=false;refresh()}
      else{const n=m.f(e);if(n>0)add(n,e)}},destroy(){cancelAnimationFrame(raf);cancelAnimationFrame(raf2);cancelAnimationFrame(raf4);cancelAnimationFrame(raf5);cancelAnimationFrame(raf6);bx1&&bx1.stop();bx2&&bx2.stop();clearInterval(paceI)}};
  }};

Object.assign(W.goal,{name:"Mål / progress",title:true,
  defaults:{accent:"#3dffb0",accent2:"#2d8cff",title:"GIFT-MÅL"},schema:[
    {k:"design",l:"Design",t:"select",o:[["1","Rak bar"],["2","Pill"],["3","Ring"],["4","Mätare"],["5","Steg"],["6","Bara siffra"],["7","Stående"],["8","Smal med pil"],["all","Alla (jämför)"]],d:"1"},
    {k:"metric",l:"Mäter",t:"select",o:GMETOPT,d:"coins"},
    {k:"target",l:"Mål",t:"range",min:5,max:20000,step:5,d:2000},
    {k:"last",l:"Visa senaste bidrag",t:"select",o:[["1","Ja"],["0","Nej"]],d:"0"},
    {k:"pace",l:"Visa takt och tid kvar",t:"select",o:[["1","Ja"],["0","Nej"]],d:"0"},
    {k:"toasts",l:"Milstolpe-meddelanden",t:"select",o:[["1","På"],["0","Av"]],d:"1"},
    {k:"cap",l:"Visa designnamn",t:"select",o:[["0","Nej"],["1","Ja"]],d:"0"},
    {k:"skin",l:"Stilskinn",t:"select",o:[["std","Standard"],["glass","Glas"],["neon","Neon"],["parallel","Parallellogram"],["pixel","Pixel"],["hud","HUD (gaming)"]],d:"std"},
    {k:"badge",l:"Procentbricka",t:"select",o:[["0","Av"],["1","På"]],d:"0"}],
  create(root,O){
    const inst=W.goalvar.create(root,O);
    let lastM=O().x.metric;
    function apply(){
      const x=O().x;
      if(x.metric!==lastM){lastM=x.metric;x.target=(GMET[x.metric]||GMET.coins).d;inst.event({type:"reset"});(O().save&&O().save())}
      const cards=[...root.querySelectorAll(".gvc")];
      cards.forEach((c,i)=>{
        const cap=c.querySelector(".gvcap").textContent.trim();
        const isLast=i===cards.length-1;
        if(isLast){c.style.display=(x.last==="1"||x.pace==="1")?"":"none";
          const l=c.querySelector(".gvlast"),p=c.querySelector(".gvpace");if(l)l.style.display=x.last==="1"?"":"none";if(p)p.style.display=x.pace==="1"?"":"none";}
        else c.style.display=(x.design==="all"||cap.startsWith(x.design+" "))?"":"none";
        const cp=c.querySelector(".gvcap");if(cp)cp.style.display=(x.cap==="1"||x.design==="all")?"":"none";
      });
      const gm=GMET[x.metric]||GMET.coins,ttl0=O().title;
      const ttl=(!ttl0||Object.keys(GMET).some(k=>GMET[k].l===ttl0))?gm.l:ttl0;root.querySelectorAll(".gv1t span,.gv5t span,.s9l,.s3l").forEach(e=>e.textContent=ttl);root.querySelectorAll(".s9i,.s3i").forEach(e=>e.textContent=gm.i);
      const tt=root.querySelector(".gvtoast");if(tt)tt.style.display=x.toasts==="1"?"":"none";
      const gv=root.querySelector(".gv");gv.dataset.skin=x.skin||"std";
      cards.slice(0,-1).forEach(c=>{let b=c.querySelector(".gvbadge");
        if(x.badge==="1"&&!b){b=document.createElement("em");b.className="pc gvbadge";c.appendChild(b)}
        if(b)b.style.display=x.badge==="1"?"":"none"});
      inst.refresh&&0;
    }
    apply();
    return{refresh(){inst.refresh();apply()},event(e){inst.event(e)},destroy(){inst.destroy()}};
  }});


const PALETTE=[
  ["Mint","#3dffb0","#2d8cff"],["Rosa/guld","#ff4fa3","#ffd24a"],["Eld","#ff3b3b","#ff9a3d"],["Lila/is","#a855ff","#3dd5ff"],
  ["Guld","#ffd24a","#ff7a18"],["Cyan","#00e5ff","#7c4dff"],["Lime","#7cff4f","#1fd1a8"],["Vit","#ffffff","#9aa4b2"],
  ["Karmosin","#ff2d55","#ff7a9a"],["Himmel","#4fb3ff","#2d4bff"],["Magenta","#ff3df0","#7a3dff"],["Smaragd","#22d17a","#d6ff4a"],
  ["Solnedgång","#ff6b3d","#ff2d95"],["Hav","#19d3ff","#1f6bff"],["Skog","#3fbf5a","#0f7a4a"],["Candy","#ff8ad8","#8ad8ff"],
  ["Kunglig","#ffc83d","#9a4dff"],["Neongul","#f5ff3d","#3dff8a"],["Rosé","#ffb3c7","#ffd9a8"],["Kol","#cfd6e6","#5a6478"],
  ["Lava","#ff5a1f","#ffd23d"],["Orkidé","#d28cff","#ff8ad0"],["Is","#bff0ff","#6fb8ff"],["Blod","#c3122b","#ff4d4d"]];

const GLOBAL=[
  {k:"frameImg",l:"Bildram (HD)",t:"select",o:[["none","Ingen (kodad ram)"]].concat(ALLF.map(f=>[f.id,(f.vy?"VYRA · ":"")+f.name]))},
  {k:"enter",l:"Entré / utgång",t:"select",o:[["zoom","Zoom (överskjuter)"],["drop","Drop"],["bounce","Bounce"],["rise","Rise"],["glass","Glas"],["neon","Neon-flimmer"],["none","Ingen"]]},
  {k:"frame",l:"Ramlager på avatar",t:"select",o:[["halo","Halo + ripple"],["flame","Flamma"],["bolt","Blixt"],["glint","Guld + glimt"],["ripple","Ripple"],["comet","Komet"],["petals","Kronblad"],["none","Ingen"]]},
  {k:"namefx",l:"Namneffekt",t:"select",o:[["none","Ingen"],["shimmer","Shimmer"],["aurora","Aurora"],["flicker","Flimmer"]]},
  {k:"accent",l:"Färg 1",t:"color"},{k:"accent2",l:"Färg 2",t:"color"},{k:"text",l:"Textfärg",t:"color"},
  {k:"font",l:"Typsnitt",t:"select",o:[["'Segoe UI',system-ui,sans-serif","Segoe UI"],["Impact,'Arial Narrow Bold',sans-serif","Impact"],["Georgia,serif","Georgia (serif)"],["'Trebuchet MS',sans-serif","Trebuchet"],["'Courier New',monospace","Mono"]]},
  {k:"scale",l:"Storlek",t:"range",min:.5,max:1.8,step:.05},
  {k:"speed",l:"Rörelsehastighet",t:"range",min:.4,max:2.5,step:.1},
  {k:"glow",l:"Glöd",t:"range",min:0,max:1.5,step:.05},
  {k:"radius",l:"Rundning",t:"range",min:0,max:50,step:1},
  {k:"pos",l:"Position",t:"select",o:[["top","Överst"],["mid","Mitten"],["bottom","Nederst"]]}
];
const BASE={text:"#ffffff",font:"'Segoe UI',system-ui,sans-serif",scale:1,speed:1,glow:.8,radius:22,pos:"mid",enter:"zoom",frame:"halo",namefx:"none",frameImg:"none"};
const defaultsFor=id=>{const w=W[id],o=Object.assign({},BASE,w.defaults,{x:{}});w.schema.forEach(f=>o.x[f.k]=f.d);
  if(id==="goal"){o.pos="top";o.enter="drop"}
  if(id==="podium"&&HD.length)o.frameImg=HD[0].id;
  return o};


/* =====================================================================
   VYRA-adapter: kopplar de portade widgetarna (podiet, Top Streak, Goal Pro)
   till VYRA:s widgetsystem (wh / props / bind / routeLiveBattleEvent).
   Samma recept som gift-bubbles.js: wrap av wh/props/bind, katalogsektion med
   data-catalog-key, livevägen via routeLiveBattleEvent, teardown på vyra-session-ended.
   ===================================================================== */
const TYPES = { podium: 'templatePgPodium', streak: 'templatePgStreak', goal: 'templatePgGoal' };
const KINDS = { templatePgPodium: 'podium', templatePgStreak: 'streak', templatePgGoal: 'goal' };
const KEYS = { podium: 'catalog:pgpodium', streak: 'catalog:pgstreak', goal: 'catalog:pggoal' };
const TITEL = { podium: 'Top Gifter Podium', streak: 'Top Streak Flip', goal: 'Goal Pro' };
const BESKR = {
  podium: 'Pallplats med HD-ram, krona och siffermedaljer · 12 ramar',
  streak: 'Profilbild som flippar till gåvan · 12 egna ramar',
  goal: 'Mål med 8 designer, markör, bubblor och färgpalett'
};
const NAT = { podium: { w: 940, h: 900 }, streak: { w: 760, h: 900 }, goal: { w: 940, h: 640 } };
const GOALH = { 1: 250, 2: 320, 3: 520, 4: 470, 5: 280, 6: 360, 7: 620, 8: 660 };
const STATE = {};          // per-widget runtime-state som överlever en omrendering
const REG = new Map();     // host-element -> { id, kind, inst }

const safeUrl = u => {
  const s = String(u || '');
  if (!s) return '';
  try { if (window.VyraSafe && VyraSafe.src) return VyraSafe.src(s, '') || ''; } catch (_) {}
  return /^(https?:|data:image\/|assets\/|\.\/)/i.test(s) ? s : '';
};
const widgetById = id => { try { return state.widgets.find(x => x.id === id) } catch (_) { return null } };

function cfgOf(w) {
  const k = KINDS[w.type], o = defaultsFor(k), p = w.pg || {};
  for (const key in p) if (key !== 'x') o[key] = p[key];
  Object.assign(o.x, p.x || {});
  o.st = STATE[w.id] || (STATE[w.id] = {});
  o.save = () => { try { save() } catch (_) {} };
  return o;
}
function natOf(w) {
  const k = KINDS[w.type], n = NAT[k];
  if (k === 'goal') return { w: n.w, h: GOALH[String(cfgOf(w).x.design || '1')] || n.h };
  return n;
}
function look(host, o, kind) {
  const set = (k, v) => host.style.setProperty(k, v);
  set('--a', o.accent); set('--b', o.accent2); set('--t', o.text); set('--s', 1);
  set('--sp', o.speed); set('--g', o.glow); set('--r', o.radius); set('--font', o.font);
  host.dataset.enter = o.enter; host.dataset.frame = o.frame; host.dataset.namefx = o.namefx;
  host.dataset.fimg = (kind === 'podium' && HDMAP[o.frameImg]) ? '1' : '0';
}
function applyPodiumFrames(host, o) {
  const f = HDMAP[o.frameImg];
  host.querySelectorAll('.fimgbox').forEach(e => e.remove()); unfitAvatars(host);
  host.dataset.fimg = f ? '1' : '0';
  if (!f) return;
  host.querySelectorAll('.pcol .avw').forEach(h => {
    const m = h.closest('.pcol').className.match(/\br(\d)\b/);
    h.appendChild(makeFrameBox(f, o.rankBadge === false ? 0 : (m ? +m[1] : 0)));
    fitAvatar(h, f);
  });
}

function mount(host) {
  const id = host.dataset.pgid, kind = host.dataset.pgkind;
  if (!W[kind] || !widgetById(id)) return;
  host.dataset.pgm = '1';
  const O = () => { const w = widgetById(id); return cfgOf(w || { id, type: TYPES[kind] }) };
  look(host, O(), kind);
  host.classList.add('play-in');
  let inst;
  try { inst = W[kind].create(host, O); } catch (e) { try { console.error('[VYRA playground-widgets]', e) } catch (_) {} return; }
  if (kind === 'podium') applyPodiumFrames(host, O());
  try { inst.refresh && inst.refresh(); } catch (_) {}
  REG.set(host, { id, kind, inst, O });
}
function scan() {
  document.querySelectorAll('.pgw[data-pgid]:not([data-pgm])').forEach(mount);
  for (const [h, r] of REG) if (!h.isConnected) { try { r.inst.destroy && r.inst.destroy() } catch (_) {} REG.delete(h); }
}
let sched = 0;
const obs = new MutationObserver(() => { if (sched) return; const run = () => { sched = 0; scan(); }; sched = window.requestAnimationFrame ? window.requestAnimationFrame(run) : setTimeout(run, 16); });
function start() { if (!document.body) return; obs.observe(document.body, { childList: true, subtree: true }); scan(); }
if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

/* ---------- live-händelser: VYRA -> playground-format ---------- */
const lastRC = new Map();
function conv(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const t = String(ev.type || ev.event || '').toLowerCase();
  const user = String(ev.username || ev.name || ev.user || ev.nickname || '?');
  const avatar = safeUrl(ev.profileImage || ev.avatar || '');
  if (t === 'gift' || t === 'gift_combo' || t === 'giftcombo') {
    const rc = Math.max(1, Math.floor(Number(ev.repeatCount ?? ev.combo ?? ev.count) || 1));
    const key = String(ev.userId || user) + '|' + String(ev.giftId || ev.giftName || '');
    const nu = Date.now(), prev = lastRC.get(key);
    let count = rc;
    if (!ev.__test && prev && nu - prev.t < 12000 && rc > prev.n) count = rc - prev.n;
    if (ev.repeatEnd === true) lastRC.delete(key); else lastRC.set(key, { n: rc, t: nu });
    const perUnit = Number(ev.diamonds) > 0 ? Number(ev.diamonds) : (Number(ev.coins ?? ev.value) > 0 ? Number(ev.coins ?? ev.value) / rc : 1);
    const name = String(ev.giftName || 'Gift');
    return {
      type: 'gift', user, avatar, count, combo: rc > 1,
      gift: { id: String(ev.giftId || name).toLowerCase().replace(/[^a-z0-9]+/g, '-'), n: name, e: '🎁', c: perUnit, img: safeUrl(ev.giftImage) }
    };
  }
  if (t.includes('like')) return { type: 'likes', user, avatar, count: Math.max(1, Math.floor(Number(ev.count) || 1)) };
  if (t.includes('follow')) return { type: 'follow', user, avatar };
  if (t.includes('share')) return { type: 'share', user, avatar };
  if (t === 'chat' || t.includes('comment')) return { type: 'comment', user, avatar, text: String(ev.comment || ev.text || '').slice(0, 120) };
  return null;
}
function feed(ev) {
  const e = conv(ev);
  if (!e) return;
  applyState(e);
  for (const [, r] of REG) { try { r.inst.event(e); } catch (_) {} }
}
const prevRoute = window.routeLiveBattleEvent;
window.routeLiveBattleEvent = function (event = {}) {
  if (typeof prevRoute === 'function') prevRoute(event);
  try { feed(event); } catch (_) {}
};
function resetAll() {
  for (const k of Object.keys(S.users)) delete S.users[k];
  S.coins = S.likes = S.follows = S.shares = 0; S.focus = null;
  for (const k of Object.keys(STATE)) delete STATE[k];
  lastRC.clear();
  for (const [, r] of REG) { try { r.inst.event({ type: 'reset' }); } catch (_) {} }
}
window.addEventListener('vyra-live-session', ev => { const d = ev && ev.detail; if (d && d.event === 'live:start') resetAll(); });
function glom() {
  for (const [h, r] of REG) { try { r.inst.destroy && r.inst.destroy() } catch (_) {} REG.delete(h); }
  resetAll();
}
window.addEventListener('vyra-session-ended', glom);
try { window.VyraSessionState && VyraSessionState.registerTeardown && VyraSessionState.registerTeardown('playground-widgets', glom); } catch (_) {}

/* ---------- testhändelser från panelen ---------- */
const TESTNAMN = ['Lina', 'Jokero', 'Maja_88', 'Oskar', 'Nova', 'Zayn', 'Elsa', 'Kimmie'];
const TESTGIFTS = [
  { giftId: 7578, giftName: 'Crown', diamonds: 799, giftImage: 'assets/gifts/events/7578_Crown.png' },
  { giftId: 1, giftName: 'Rose', diamonds: 1, giftImage: 'assets/gifts/events/0001_Rose.png' },
  { giftId: 7460, giftName: 'Cap', diamonds: 99, giftImage: 'assets/gifts/events/7460_Cap.png' },
  { giftId: 8017, giftName: 'Diamond', diamonds: 5000, giftImage: 'assets/gifts/events/8017_Diamond.png' }
];
let testIx = 0;
function pgTest(what) {
  const user = TESTNAMN[Math.floor(Math.random() * TESTNAMN.length)];
  if (what === 'gift' || what === 'combo') {
    const g = TESTGIFTS[testIx++ % TESTGIFTS.length];
    const n = what === 'combo' ? 10 : 1;
    for (let i = 0; i < n; i++) setTimeout(() => feed({ type: 'gift', __test: true, username: user, ...g, repeatCount: 1, combo: 1 }), i * 140);
  } else if (what === 'likes') feed({ type: 'like', username: user, count: 50 });
  else if (what === 'follow') feed({ type: 'follow', username: user });
  else if (what === 'share') feed({ type: 'share', username: user });
  else if (what === 'comment') feed({ type: 'chat', username: user, comment: 'Vilken sändning!' });
  else if (what === 'reset') resetAll();
}

/* ---------- lagernamn i lagerpanelen ---------- */
if (typeof liveLayerName === 'function') {
  const oldLayerName = liveLayerName;
  liveLayerName = function (w) { return KINDS[w.type] ? TITEL[KINDS[w.type]] : oldLayerName(w); };
}

/* ---------- widget-skal (wh) ---------- */
const oldWh = wh;
wh = function (w) {
  if (!KINDS[w.type]) return oldWh(w);
  const k = KINDS[w.type], n = natOf(w), width = w.width || 300, s = width / n.w, height = Math.round(n.h * s);
  return `<div class="widget templatePg ${w.type}${selected === w.id ? ' selected' : ''}" data-id="${w.id}" style="left:${w.x || 0}px;top:${w.y || 0}px;width:${width}px;height:${height}px"><div class="pgw wroot" data-pgid="${w.id}" data-pgkind="${k}" style="width:${n.w}px;transform:scale(${s.toFixed(4)});transform-origin:0 0"></div><span class="resize-handle">↘</span></div>`;
};

/* ---------- panel (props) ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function fieldHtml(id, f, val) {
  if (f.t === 'range') return `<label>${esc(f.l)} <span data-pgv="${id}">${val}</span><input id="${id}" type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${val}"></label>`;
  if (f.t === 'color') return `<label>${esc(f.l)}<input id="${id}" type="color" value="${esc(val)}"></label>`;
  if (f.t === 'select') return `<label>${esc(f.l)}<select id="${id}">${f.o.map(o => `<option value="${esc(o[0])}"${String(o[0]) === String(val) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
  return `<label>${esc(f.l)}<input id="${id}" type="text" value="${esc(val)}"></label>`;
}
const GLOBAL_PG = k => GLOBAL.filter(f => !(f.k === 'frameImg' && k !== 'podium') && f.k !== 'pos' && f.k !== 'scale');
function schemaOf(k) {
  const sch = W[k].schema || [];
  if (k !== 'goal') return sch;
  return sch.map(f => f.k === 'design' ? Object.assign({}, f, { o: f.o.filter(o => o[0] !== 'all') }) : f);
}
const oldProps = props;
props = function () {
  const w = liveWidget(selected);
  if (!w || !KINDS[w.type]) return oldProps();
  const k = KINDS[w.type], o = cfgOf(w);
  const sw = PALETTE.map(([n, a, b]) => `<button type="button" class="pg-sw${(o.accent || '').toLowerCase() === a && (o.accent2 || '').toLowerCase() === b ? ' on' : ''}" data-pgsw="${a}|${b}" title="${esc(n)}" style="background:linear-gradient(135deg,${a},${b})"></button>`).join('');
  const sch = schemaOf(k).map(f => fieldHtml('pgx_' + f.k, f, o.x[f.k])).join('');
  const glob = GLOBAL_PG(k).map(f => fieldHtml('pgg_' + f.k, f, o[f.k])).join('');
  const titelFalt = W[k].title ? fieldHtml('pgg_title', { t: 'text', l: 'Rubrik' }, o.title) : '';
  const testKnappar = (k === 'goal' || k === 'podium' || k === 'streak')
    ? ['gift:Skicka gåva', 'combo:Combo ×10', 'likes:Likes ×50', 'follow:Följ', 'share:Dela', 'comment:Kommentar', 'reset:Nollställ'].map(s => { const [a, b] = s.split(':'); return `<button type="button" data-pgtest="${a}">${b}</button>` }).join('') : '';
  return `<h3>${esc(TITEL[k].toUpperCase())}</h3><div class="template-badge">LIVE · TRANSPARENT</div><div hidden><input id="pt" value="${esc(TITEL[k])}"><input id="pv" value=""></div>`
    + `<div class="property-group"><h4>DESIGN</h4>${titelFalt}${sch}</div>`
    + `<div class="property-group"><h4>FÄRGER OCH STIL</h4><div class="pg-pal">${sw}</div>${glob}</div>`
    + `<div class="property-group fw-premium-motion"><h4>TEST</h4><div class="pg-test">${testKnappar}</div></div>`
    + `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width || 300}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
};

/* ---------- katalog + bindningar ---------- */
const oldBind = bind;
bind = function () {
  oldBind();
  if (view !== 'editor' && view !== 'overlay') return;
  const cat = document.querySelector('.widget-catalog');
  if (cat && !cat.querySelector('[data-pgcat]')) {
    const sec = document.createElement('section'); sec.dataset.pgcat = '1';
    sec.innerHTML = '<h4>NYA WIDGETAR · ' + Object.keys(TYPES).length + ' DESIGNER</h4>';
    Object.keys(TYPES).forEach(k => {
      const b = document.createElement('button');
      b.dataset.pgCreate = k; b.dataset.catalogKey = KEYS[k];
      b.innerHTML = `<i class="vyra-pro-icon">${(window.vyraCatalogIcon ? vyraCatalogIcon('bolt') : '✦')}</i><span><b>${TITEL[k]}</b><small>${BESKR[k]}</small></span>`;
      b.onclick = () => { const created = VyraWidgets.create(KEYS[k]); state.widgets.push(created); selected = created.id; save(); render(); if (window.toast) toast(TITEL[k] + ' skapad'); };
      sec.append(b);
    });
    cat.prepend(sec);
  }
  const w = liveWidget(selected);
  if (!w || !KINDS[w.type]) return;
  const k = KINDS[w.type];
  const put = (grp, key, el) => {
    const v = el.type === 'range' ? +el.value : el.value;
    w.pg = w.pg || {}; if (grp === 'x') { w.pg.x = w.pg.x || {}; w.pg.x[key] = v; } else w.pg[key] = v;
  };
  const wire = (prefix, grp, list) => list.forEach(f => {
    const el = document.getElementById(prefix + f.k); if (!el) return;
    el.oninput = () => { const sp = document.querySelector(`[data-pgv="${prefix + f.k}"]`); if (sp) sp.textContent = el.value; };
    el.onchange = () => {
      put(grp, f.k, el);
      if (grp === 'x' && k === 'goal' && f.k === 'metric') { w.pg.x.target = (GMET[el.value] || GMET.coins).d; }
      if (grp === 'x' && k === 'goal' && f.k === 'design') { w.height = undefined; }
      save(); render();
    };
  });
  wire('pgx_', 'x', schemaOf(k));
  wire('pgg_', 'g', GLOBAL_PG(k));
  const tt = document.getElementById('pgg_title'); if (tt) tt.onchange = () => { w.pg = w.pg || {}; w.pg.title = tt.value; save(); render(); };
  document.querySelectorAll('[data-pgsw]').forEach(b => b.onclick = () => {
    const [a, c] = b.dataset.pgsw.split('|'); w.pg = w.pg || {}; w.pg.accent = a; w.pg.accent2 = c;
    if (k === 'streak') { w.pg.x = w.pg.x || {}; w.pg.x.mcol = '0'; }
    save(); render();
  });
  document.querySelectorAll('[data-pgtest]').forEach(b => b.onclick = ev => { ev.preventDefault(); pgTest(b.dataset.pgtest); });
};

window.VyraPlaygroundWidgets = { feed, resetAll, scan, types: TYPES, keys: KEYS, mounted: () => REG.size, state: STATE };

})();
