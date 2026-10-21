(function(){
'use strict';
// HELA MÅLET PÅ DUKEN (2026-09-26). Rail var 560 bred och Tower 205 bred = 1094 hög i en 432 x 768
// duk; så länge widget-grans.js krävde att hela widgeten rymdes gick målet inte att dra i den
// ledden. Rail 400 x 36 och Tower 130 x ~707 ryms, med x/y så att de hamnar inne på duken när de
// skapas. Därefter placerar användaren fritt (widget-grans.js, 2026-09-26).
const DESIGNS={
 'crown-orbit':{name:'Crown Orbit',kind:'followers',orientation:'circle',art:'circle-follower.png',symbol:'center-follower.png',width:360},
 'crown-rail':{name:'Crown Rail',kind:'followers',orientation:'landscape',art:'horizontal-follower.png',width:400,x:16,y:120},
 'crown-tower':{name:'Crown Tower',kind:'followers',orientation:'portrait',art:'vertical-follower.png',width:130,x:151,y:30},
 'heart-orbit':{name:'Heart Orbit',kind:'likes',orientation:'circle',art:'circle-like.png',symbol:'center-like.png',width:360},
 'heart-rail':{name:'Heart Rail',kind:'likes',orientation:'landscape',art:'horizontal-like.png',width:400,x:16,y:120},
 'heart-tower':{name:'Heart Tower',kind:'likes',orientation:'portrait',art:'vertical-like-tube.png',marker:'vertical-like-emblem.png',width:100,x:151,y:30},
 'diamond-orbit':{name:'Diamond Orbit',kind:'diamonds',orientation:'circle',art:'circle-diamond.png',symbol:'center-diamond.png',width:360},
 'diamond-rail':{name:'Diamond Rail',kind:'diamonds',orientation:'landscape',art:'horizontal-diamond.png',width:400,x:16,y:120},
 'diamond-tower':{name:'Diamond Tower',kind:'diamonds',orientation:'portrait',art:'vertical-diamond.png',width:130,x:151,y:30}
};
const defaults={followers:'crown-orbit',likes:'heart-orbit',diamonds:'diamond-orbit'};
const labels={followers:'FOLLOWER GOAL',likes:'LIKE GOAL',diamonds:'DIAMOND GOAL'};
const SORTER={followers:'Följare',likes:'Likes',diamonds:'Diamanter'};
const modelFor=w=>DESIGNS[w.goalModel]||DESIGNS[defaults[w.goalKind]||'crown-orbit'];
const fmt=n=>Number(n||0).toLocaleString('sv-SE');
// ▶ TESTA WIDGET (vyra-mal-panel.js) ritar en KLON vars id slutar på VyraTestspel.KLON_SUFFIX. Klonen
// läser aldrig målruntimen: testet får inte anropa VyraGoals, och klonens värde är testets eget.
const arKlon=w=>{const s=window.VyraTestspel&&window.VyraTestspel.KLON_SUFFIX;return !!s&&String(w&&w.id).endsWith(s)};
// LJUS (2026-10-19). --goal-glow var '62%' och CSS:en räknade calc(5px + var(--goal-glow)*.08) i en
// drop-shadow — procent i en skuggradie är ogiltigt, så hela filtret föll bort och reglaget gjorde
// ingenting (uppmätt i granskningen). Nu är det ett tal, och CSS:en gör ljusstyrka av det. 62 är
// standard och ritas UTAN filter, precis som alla mål har sett ut hittills.
const LJUS=62;
const ljus=w=>{const n=Number(w.goalGlow);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):LJUS};
const previous=socialGoalHtml;
socialGoalHtml=function(w){
 const live=arKlon(w)?null:(window.VyraGoals?.read?.(w.id)||null),current=live?live.value:+(w.goalCurrent??0),target=live?live.target:Math.max(1,+(w.goalTarget||1000)),pct=Math.min(100,Math.round(current/target*100));
 const d=modelFor(w),kind=d.kind,title=w.goalTitle||labels[kind],selectedClass=selected===w.id?' selected':'',glow=ljus(w);
 // Visa procent, Visa antal och Visa återstående (panelen, spec 5.6). Av som standard är bara återstående.
 const visa=(w.goalShowPercent===false?' gm-utan-procent':'')+(w.goalShowCount===false?' gm-utan-antal':'')+(pct>=100?' goal-uppnatt':'');
 const kvar=w.goalShowRemaining===true?`<small class="goal-motion-kvar" data-goal-remaining>${fmt(Math.max(0,target-current))} kvar</small>`:'';
 return `<div data-goal="social" class="widget social-goal goal-motion goal-motion-${d.orientation} goal-${w.goalModel||defaults[kind]} goal-kind-${kind}${visa}${selectedClass}" data-id="${w.id}"${glow!==LJUS?' data-ljus':''} style="left:${w.x}px;top:${w.y}px;width:${w.width||d.width}px;--goal-pct:${pct};--goal-fill:${pct}%;--goal-glow:${glow};zoom:${w.widgetScale||1}"><div class="goal-motion-visual"><img class="goal-motion-art" src="assets/goal-motion/${d.art}" alt="">${d.symbol?`<img class="goal-motion-symbol" src="assets/goal-motion/${d.symbol}" alt="">`:''}<div class="goal-motion-livefill" data-goal-fill></div><div class="goal-motion-dim" data-goal-dim></div>${d.marker?`<img class="goal-motion-marker" src="assets/goal-motion/${d.marker}" alt="">`:''}</div><div class="goal-motion-copy"><h3>${VyraSafe.text(title,labels[kind])}</h3><strong><b data-goal-value>${fmt(current)}</b><span>/</span><b data-goal-target>${fmt(target)}</b></strong><b class="goal-motion-percent" data-goal-pct>${pct}%</b>${kvar}</div>${selected===w.id?'<span class="resize-handle">↘</span>':''}</div>`;
};
// RUBRIKEN I CIRKELN ÄR EN DEL AV BILDEN (slutgranskning B-005, 2026-10-20). I cirkelformatet är
// "FOLLOWER GOAL"/"LIKE GOAL"/"DIAMOND GOAL" målad i konsten (assets/goal-motion/circle-*.png), och
// goal-motion.css döljer h3 där — en text ovanpå bilden hade krockat med den målade. Fältet Rubrik gjorde
// alltså ingenting. Panelen säger nu det i stället för att visa ett fält utan verkan; goalTitle ligger kvar i
// state och används om användaren byter till liggande eller stående.
const RUBRIK_I_BILDEN='<small id="gmTitleBild" class="pr-info">Rubriken är en del av bilden i cirkeldesignerna och kan inte ändras. Byt till en liggande eller stående design för en egen rubrik.</small>';
const priorProps=props;
props=function(){const w=liveWidget(selected);if(!w||w.type!=='templateSocialGoal')return priorProps();const d=modelFor(w);return `<h3>${labels[d.kind]}</h3><div class="template-badge">9 RÖRLIGA DESIGNER</div><div hidden><input id="pt" value="${w.title||''}"><input id="pv" value=""></div><div class="property-group"><h4>INNEHÅLL</h4><label>Vad räknas<select id="gmKind">${Object.entries(SORTER).map(([k,n])=>`<option value="${k}" ${k===d.kind?'selected':''}>${n}</option>`).join('')}</select></label><label>Design<select id="gmModel">${Object.entries(DESIGNS).filter(([,x])=>x.kind===d.kind).map(([id,x])=>`<option value="${id}" ${id===(w.goalModel||defaults[d.kind])?'selected':''}>${x.name} · ${x.orientation==='circle'?'Cirkel':x.orientation==='portrait'?'Stående':'Liggande'}</option>`).join('')}</select></label>${d.orientation==='circle'?RUBRIK_I_BILDEN:`<label>Rubrik<input id="gmTitle" value="${VyraSafe.text(w.goalTitle,labels[d.kind])}"></label>`}<div class="property-grid"><label>Startvärde<input id="pfGoalCurrent" type="number" min="0" value="${w.goalCurrent??0}"></label><label>Mål<input id="pfGoalTarget" type="number" min="1" value="${w.goalTarget||1000}"></label></div><label><input id="gmShowPct" type="checkbox" ${w.goalShowPercent===false?'':'checked'}> Visa procent</label><label><input id="gmShowCount" type="checkbox" ${w.goalShowCount===false?'':'checked'}> Visa antal</label><label><input id="gmShowRemaining" type="checkbox" ${w.goalShowRemaining===true?'checked':''}> Visa återstående</label></div><div class="property-group"><h4>RÖRELSE</h4><label class="range-label">Ljus <b>${ljus(w)}%</b><input id="gmGlow" type="range" min="20" max="100" value="${ljus(w)}"></label><button id="pfGoalPlus">+1 Test</button><button id="pfGoalComplete">Testa 100%</button></div><div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x||0}"></label><label>Y<input id="propY" type="number" value="${w.y||0}"></label><label>Bredd<input id="propWidth" type="number" min="80" max="1200" value="${w.width||d.width}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer||1}"></label></div></div><button class="delete" id="del">Ta bort</button>`};
const priorBind=bind;
bind=function(){priorBind();if(view!=='editor'&&view!=='overlay')return;
 const catalog=document.querySelector('.widget-catalog'),old=document.querySelector('.social-goal-template-section');
 if(catalog&&(!old||old.dataset.goalMotion!=='1')){if(old)old.remove();const section=document.createElement('section');section.className='social-goal-template-section';section.dataset.goalMotion='1';section.dataset.socialGoals='1';section.innerHTML='<h4>FOLLOWER, LIKE & DIAMOND GOALS · 9 RÖRLIGA DESIGNER</h4>'+Object.entries(DESIGNS).map(([id,d])=>{const key=`catalog:socialgoal:${d.kind}:${id}:${d.orientation}`;return `<button data-gm-create="${id}" data-catalog-key="${key}"><i>${d.kind==='likes'?'♥':d.kind==='diamonds'?'◆':'♛'}</i><span><b>${d.name}</b><small>${d.orientation==='circle'?'Cirkel':d.orientation==='portrait'?'Stående':'Liggande'} · transparent</small></span></button>`}).join('');catalog.prepend(section);section.querySelectorAll('button').forEach(b=>b.onclick=()=>{const d=DESIGNS[b.dataset.gmCreate],created=VyraWidgets.create(b.dataset.catalogKey);created.width=d.width;if(Number.isFinite(d.x)){created.x=d.x;created.y=d.y}created.goalTitle=labels[d.kind];state.widgets.push(created);selected=created.id;save();render()})}
 if(view!=='editor')return;const w=liveWidget(selected);if(!w||w.type!=='templateSocialGoal')return;const set=(q,key,num=false)=>{const el=document.querySelector(q);if(!el)return;const read=e=>num?+e.target.value:e.target.value;el.oninput=e=>vyraLivePatch(w,el,key,read(e));el.onchange=e=>{w[key]=read(e);save();vyraRenderKeepingPanel()}};
 /* DESIGN ÄR SKILT FRÅN VAD SOM RÄKNAS (spec 5.6). Förut bytte Design-listan även sort och skrev över
    en egen rubrik och bredden. Nu visar Design bara den valda sortens tre format, och ett designbyte
    rör aldrig rubriken. Bredden följer formatet (cirkel, liggande, stående har olika konst). */
 const vald=e=>DESIGNS[e.target.value];
 const model=document.querySelector('#gmModel');if(model)model.onchange=e=>{const d=vald(e);if(!d)return;w.goalModel=e.target.value;w.goalKind=d.kind;w.goalOrientation=d.orientation;w.width=d.width;save();render()};
 /* Vad räknas: samma format i den nya sorten. Rubriken byts bara om den var sortens standardrubrik. */
 const kind=document.querySelector('#gmKind');if(kind)kind.onchange=e=>{const ny=e.target.value;if(!SORTER[ny])return;const fore=modelFor(w),id=Object.keys(DESIGNS).find(k=>DESIGNS[k].kind===ny&&DESIGNS[k].orientation===fore.orientation)||defaults[ny],d=DESIGNS[id];if(!w.goalTitle||w.goalTitle===labels[fore.kind])w.goalTitle=labels[ny];w.goalModel=id;w.goalKind=ny;w.goalOrientation=d.orientation;w.width=d.width;save();render()};
 for(const [id,key,standard] of [['#gmShowPct','goalShowPercent',true],['#gmShowCount','goalShowCount',true],['#gmShowRemaining','goalShowRemaining',false]]){const el=document.querySelector(id);if(el)el.onchange=e=>{w[key]=!!e.target.checked;if(w[key]===standard)delete w[key];save();vyraRenderKeepingPanel()}}
 set('#gmTitle','goalTitle');set('#gmGlow','goalGlow',true);
};
window.VyraGoalMotion={designs:DESIGNS,sorter:SORTER,labels,modelFor,arKlon};
})();
