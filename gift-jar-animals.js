/* Approved animal Gift Jar motion, ported from jar-animals-preview.html.
   Counts and gifts remain owned by media.js; no duplicate live event subscription. */
(()=>{'use strict';
const models=[
['lion','Royal Lion','Guld / kunglig puls','#f4c971',.517,.347,.772,.31,.73,'Guldljuset växer från glaset och öppnar sig i en kunglig ljuskrona.'],
['dragon','Ember Dragon','Koppar / glödvirvel','#ff9c58',.505,.203,.768,.34,.70,'Två glödande spiraler stiger längs burken och möts över draken.'],
['phoenix','Phoenix Rise','Roséguld / stigande gnistor','#ffc4a1',.51,.385,.755,.33,.70,'Gnistor lyfter i två vingar och faller långsamt som ett varmt guldregn.'],
['panther','Midnight Panther','Platina / smaragd','#a0f2d1',.49,.345,.79,.30,.69,'Precisa ljusspår sveper över glaset, följt av ett stilla smaragdskimmer.'],
['peacock','Sapphire Peacock','Safir / juvelskimmer','#8fdded',.52,.38,.79,.31,.73,'Ljuset öppnar en solfjäder av safir och guld, en stråle i taget.']
];

const legacy={crystal:'lion',royal:'lion',neon:'peacock',fire:'dragon',ice:'panther',heart:'phoenix',galaxy:'peacock'};
const resolve=id=>models.some(m=>m[0]===id)?id:(legacy[id]||'lion');
const images=new Map();function image(src){if(!images.has(src)){const im=new Image();im.src=src;images.set(src,im)}return images.get(src)}

function mount(cv,w){
 const ctx=cv.getContext('2d');if(!ctx)return;
 const active=models.findIndex(m=>m[0]===resolve(w.jarModel));
 let ready=false,paused=false,t=0,last=0,items=[],queue=[],particles=[],rings=[],start=-100,emission=0;
 const art=[];let seen=new Set(),previousCount=giftJarState(w).count,initialized=false;
 function sync(){const live=giftJarState(w);const valid=new Set(live.items.map(e=>e.serial));items=items.filter(g=>valid.has(g.serial));
 if(live.count===0&&previousCount>0){particles=[];rings=[];queue=[];start=-100;seen.clear()}
 seen=new Set([...seen].filter(serial=>valid.has(serial)));
 let batch=0;for(const entry of live.items){if(seen.has(entry.serial))continue;seen.add(entry.serial);const m=models[active],col=entry.serial%7,row=Math.floor((entry.serial%35)/7);let icon=entry.image?image(entry.image):null;
 items.push({release:t+(initialized?batch++*.055:0),serial:entry.serial,x:m[4]*800,y:initialized?Math.max(25,m[5]*1000-190):m[6]*1000-row*32,vy:0,a:((entry.serial*17)%49-24)*Math.PI/180,spin:.5,icon,tx:(m[7]+(m[8]-m[7])*(col+.5+(row%2?.22:-.22))/7)*800,floor:m[6]*1000-row*32,bounce:0,done:!initialized});if(!initialized)items[items.length-1].x=items[items.length-1].tx;}
 if(initialized&&previousCount<Math.max(1,+w.jarCapacity||50)&&live.count>=Math.max(1,+w.jarCapacity||50))queue.push({at:t+2.2,finale:true});
 previousCount=live.count;initialized=true;
 }
 function begin(){start=t}function spawn(){}
 function spark(x,y,vx,vy,life,size,color){if(!paused&&particles.length<650)particles.push({x,y,vx,vy,life,max:life,size,color})}
function burst(x,y,n,power){for(let k=0;k<n;k++){let a=Math.random()*Math.PI*2,v=power*(.3+Math.random()*.7);spark(x,y,Math.cos(a)*v,Math.sin(a)*v-40,1+Math.random(),1+Math.random()*1.5,models[active][3])}}
function ring(x,y,r,color,alpha){ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=14;ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(x,y,r,r*.23,0,0,Math.PI*2);ctx.stroke();ctx.restore()}
function effects(dt){let m=models[active],s=t-start,cx=m[4]*800,my=m[5]*1000,power=Math.min(1,s/1.4)*Math.min(1,(7-s)/2);if(s<0||s>=7)return;
ctx.save();ctx.globalCompositeOperation='lighter';
if(active===0){for(let k=0;k<3;k++)ring(cx,my+40,80+(s*90+k*75)%245,m[3],power*.3)}
if(active===3){for(let k=0;k<3;k++){let p=(s*.4+k*.22)%1;ctx.globalAlpha=Math.sin(p*Math.PI)*power*.65;ctx.strokeStyle=m[3];ctx.shadowColor=m[3];ctx.shadowBlur=20;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(180+p*340,280);ctx.bezierCurveTo(140+p*330,480,260+p*300,650,210+p*350,810);ctx.stroke()}}
if(active===4){for(let k=0;k<11;k++){let a=-Math.PI+.18+k*(Math.PI-.36)/10,p=Math.min(1,Math.max(0,(s-k*.08)/1.5));ctx.globalAlpha=power*.4;ctx.strokeStyle=k%2?'#f4cb7e':'#75b6ff';ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=14;ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(cx,680);ctx.quadraticCurveTo(cx+Math.cos(a)*180,430,cx+Math.cos(a)*330*p,680+Math.sin(a)*530*p);ctx.stroke()}}
ctx.restore();if(paused)return;emission+=dt;while(emission>.035){emission-=.035;
if(active===0&&s>1.2&&s<4.2){let a=Math.PI+Math.random()*Math.PI;spark(cx,my+30,Math.cos(a)*250,Math.sin(a)*340,2.2,1.5,m[3])}
if(active===1)for(let k=0;k<2;k++){let a=s*4+k*Math.PI;spark(cx+Math.sin(a)*200,800-(s*145%660),Math.cos(a)*40,-50,1.5,2,k?'#ffd896':m[3])}
if(active===2)for(let k=0;k<2;k++){let side=k?-1:1,p=(s*.55)%1;spark(cx+side*Math.sin(p*Math.PI*.75)*280,740-p*570,side*35,-60,2,1.7,m[3])}
if(active===3){let p=(s*.4)%1;spark(210+p*350,810,25,-35,1.5,1.5,m[3])}
if(active===4&&s>1.6&&s<5){let k=Math.floor(Math.random()*11),a=-Math.PI+.18+k*(Math.PI-.36)/10;spark(cx+Math.cos(a)*330,680+Math.sin(a)*530,Math.cos(a)*15,15,1.7,1.7,k%2?'#ffd994':'#8bbdff')}
}if(s>=2.2&&s-dt<2.2){burst(cx,my-25,active===3?45:110,active===3?120:220);void 0}}
function frame(now){if(!cv.isConnected||cv.dataset.jarFrozen)return;if(w.hidden)return;sync();let dt=Math.min(.033,(now-last)/1000||.016);last=now;if(!paused){t+=dt;while(queue.length&&queue[0].at<=t){let e=queue.shift();e.finale?begin():spawn(e.icon)}}ctx.clearRect(0,0,800,1000);if(ready){let m=models[active];ctx.drawImage(art[active],0,0,800,1000);
for(let g of items){if(t<g.release)continue;if(!paused&&!g.done){g.vy+=700*dt;g.y+=g.vy*dt;g.x+=(g.tx-g.x)*dt*(g.y>m[5]*1000?3:0.3);g.a+=g.spin*dt;if(g.y>=g.floor){g.y=g.floor;g.vy=-g.vy*.27;g.spin*=.3;g.bounce++;if(g.bounce===1){rings.push({x:g.x,y:g.floor+18,at:t});burst(g.x,g.y,7,38)}if(g.bounce>2||Math.abs(g.vy)<24)g.done=true}}ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.a);ctx.globalAlpha=g.y>m[5]*1000?.86:1;if(g.icon&&g.icon.complete&&g.icon.naturalWidth)ctx.drawImage(g.icon,-25,-25,50,50);ctx.restore()}
ctx.save();ctx.beginPath();ctx.rect(m[7]*800-25,m[5]*1000+42,(m[8]-m[7])*800+50,(m[6]-m[5])*1000-15);ctx.clip();ctx.globalAlpha=.12;ctx.drawImage(art[active],0,0,800,1000);ctx.restore();effects(dt);
for(let i=rings.length-1;i>=0;i--){let r=rings[i],age=t-r.at;if(age>1.2){rings.splice(i,1);continue}ring(r.x,r.y,15+age*70,m[3],(1-age/1.2)*.55)}
ctx.save();ctx.globalCompositeOperation='lighter';for(let i=particles.length-1;i>=0;i--){let p=particles[i];if(!paused){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=28*dt}if(p.life<=0){particles.splice(i,1);continue}ctx.globalAlpha=Math.min(1,p.life/.5)*.8;ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill()}ctx.restore();if(t-start>=7&&start>=0){start=-100;void 0}
}requestAnimationFrame(frame)}

 // Capture existing contents before texture IO so gifts arriving during loading still fall.
 sync();
 window.VyraGiftJarTextures.load(models[active][0]).then(texture=>{if(!cv.isConnected)return;art[active]=texture;ready=true;requestAnimationFrame(frame)}).catch(()=>{cv.setAttribute('aria-label','Bilden kunde inte laddas')});
}

const oldWh=wh;wh=function(w){if(w.type!=='templateGiftJar')return oldWh(w);return '<div class="widget gift-jar-widget animal-gift-jar'+(selected===w.id?' selected':'')+'" data-id="'+VyraSafe.text(w.id)+'" data-model="'+resolve(w.jarModel)+'" style="left:'+(+w.x||0)+'px;top:'+(+w.y||0)+'px;width:'+(+w.width||250)+'px;zoom:'+(+w.widgetScale||1)+'"><canvas width="800" height="1000" aria-label="Gift Jar"></canvas>'+(selected===w.id?'<span class="resize-handle">↘</span>':'')+'</div>'};
const oldProps=props;props=function(){let html=oldProps(),w=liveWidget(selected);if(w?.type!=='templateGiftJar')return html;return html.replace('7 MODELLER','5 MODELLER').replace(/<div class="switch-row one"><label><input id="jarShowCounter"[\s\S]*?<\/div>/,'').replace(/<div class="property-group"><h4>FÄRGER<\/h4>[\s\S]*?<h4>TEST OCH RESET<\/h4>/,'<div class="property-group"><h4>TEST OCH RESET</h4>')};
const oldBind=bind;bind=function(){oldBind();document.querySelectorAll('.animal-gift-jar canvas').forEach(cv=>{if(cv.dataset.mounted)return;const w=typeof state!=='undefined'&&state.widgets.find(w=>String(w.id)===cv.parentElement.dataset.id);if(w?.hidden)return;cv.dataset.mounted='1';if(!w||cv.closest('.widget-catalog,.catalog-preview,.widget-thumb')){window.VyraGiftJarTextures.load(cv.parentElement.dataset.model).then(im=>{if(cv.isConnected)cv.getContext('2d')?.drawImage(im,0,0,800,1000)}).catch(()=>{});return}mount(cv,w)});const w=liveWidget(selected);if(w?.type==='templateGiftJar'){const sel=document.querySelector('#jarModel');if(sel)sel.value=resolve(w.jarModel)}};
function still(cv,w){if(!cv)return Promise.resolve();return window.VyraGiftJarTextures.load(resolve(w.jarModel)).then(im=>{const ctx=cv.getContext('2d');if(ctx){ctx.clearRect(0,0,800,1000);ctx.drawImage(im,0,0,800,1000)}}).catch(()=>{})}
window.VyraAnimalGiftJars={resolve,still,models:models.map(m=>m[0])};if(typeof render==='function')render();
})();
