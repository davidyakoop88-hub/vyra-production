(function(){
'use strict';
const DESIGNS={
 'crown-orbit':{name:'Crown Orbit',kind:'followers',orientation:'circle',art:'circle-follower.png',symbol:'center-follower.png',width:360},
 'crown-rail':{name:'Crown Rail',kind:'followers',orientation:'landscape',art:'horizontal-follower.png',width:560},
 'crown-tower':{name:'Crown Tower',kind:'followers',orientation:'portrait',art:'vertical-follower.png',width:205},
 'heart-orbit':{name:'Heart Orbit',kind:'likes',orientation:'circle',art:'circle-like.png',symbol:'center-like.png',width:360},
 'heart-rail':{name:'Heart Rail',kind:'likes',orientation:'landscape',art:'horizontal-like.png',width:560},
 'heart-tower':{name:'Heart Tower',kind:'likes',orientation:'portrait',art:'vertical-like.png',width:205},
 'diamond-orbit':{name:'Diamond Orbit',kind:'diamonds',orientation:'circle',art:'circle-diamond.png',symbol:'center-diamond.png',width:360},
 'diamond-rail':{name:'Diamond Rail',kind:'diamonds',orientation:'landscape',art:'horizontal-diamond.png',width:560},
 'diamond-tower':{name:'Diamond Tower',kind:'diamonds',orientation:'portrait',art:'vertical-diamond.png',width:205}
};
const defaults={followers:'crown-orbit',likes:'heart-orbit',diamonds:'diamond-orbit'};
const labels={followers:'FOLLOWER GOAL',likes:'LIKE GOAL',diamonds:'DIAMOND GOAL'};
const modelFor=w=>DESIGNS[w.goalModel]||DESIGNS[defaults[w.goalKind]||'crown-orbit'];
const fmt=n=>Number(n||0).toLocaleString('sv-SE');
const previous=socialGoalHtml;
socialGoalHtml=function(w){
 const live=window.VyraGoals?.read?.(w.id)||null,current=live?live.value:+(w.goalCurrent??0),target=live?live.target:Math.max(1,+(w.goalTarget||1000)),pct=Math.min(100,Math.round(current/target*100));
 const d=modelFor(w),kind=d.kind,title=w.goalTitle||labels[kind],selectedClass=selected===w.id?' selected':'';
 return `<div data-goal="social" class="widget social-goal goal-motion goal-motion-${d.orientation} goal-${w.goalModel||defaults[kind]} goal-kind-${kind}${selectedClass}" data-id="${w.id}" style="left:${w.x}px;top:${w.y}px;width:${w.width||d.width}px;--goal-pct:${pct};--goal-fill:${pct}%;--goal-glow:${w.goalGlow??62}%;zoom:${w.widgetScale||1}"><div class="goal-motion-visual"><img class="goal-motion-art" src="assets/goal-motion/${d.art}" alt="">${d.symbol?`<img class="goal-motion-symbol" src="assets/goal-motion/${d.symbol}" alt="">`:''}<div class="goal-motion-livefill" data-goal-fill></div></div><div class="goal-motion-copy"><h3>${VyraSafe.text(title,labels[kind])}</h3><strong><b data-goal-value>${fmt(current)}</b><span>/</span><b data-goal-target>${fmt(target)}</b></strong><b class="goal-motion-percent" data-goal-pct>${pct}%</b></div>${selected===w.id?'<span class="resize-handle">↘</span>':''}</div>`;
};
const priorProps=props;
props=function(){const w=liveWidget(selected);if(!w||w.type!=='templateSocialGoal')return priorProps();const d=modelFor(w);return `<h3>${labels[d.kind]}</h3><div class="template-badge">9 RÖRLIGA DESIGNER</div><div hidden><input id="pt" value="${w.title||''}"><input id="pv" value=""></div><div class="property-group"><h4>INNEHÅLL</h4><label>Design<select id="gmModel">${Object.entries(DESIGNS).map(([id,x])=>`<option value="${id}" ${id===(w.goalModel||defaults[d.kind])?'selected':''}>${x.name} · ${x.orientation==='circle'?'Cirkel':x.orientation==='portrait'?'Stående':'Liggande'}</option>`).join('')}</select></label><label>Rubrik<input id="gmTitle" value="${VyraSafe.text(w.goalTitle,labels[d.kind])}"></label><div class="property-grid"><label>Nuvarande<input id="pfGoalCurrent" type="number" min="0" value="${w.goalCurrent??0}"></label><label>Mål<input id="pfGoalTarget" type="number" min="1" value="${w.goalTarget||1000}"></label></div></div><div class="property-group"><h4>RÖRELSE</h4><label class="range-label">Ljus <b>${w.goalGlow??62}%</b><input id="gmGlow" type="range" min="20" max="100" value="${w.goalGlow??62}"></label><button id="pfGoalPlus">+1 Test</button><button id="pfGoalComplete">Testa 100%</button></div><div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x||0}"></label><label>Y<input id="propY" type="number" value="${w.y||0}"></label><label>Bredd<input id="propWidth" type="number" min="120" max="1200" value="${w.width||d.width}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer||1}"></label></div></div><button class="delete" id="del">Ta bort</button>`};
const priorBind=bind;
bind=function(){priorBind();if(view!=='editor'&&view!=='overlay')return;
 const catalog=document.querySelector('.widget-catalog'),old=document.querySelector('.social-goal-template-section');
 if(catalog&&(!old||old.dataset.goalMotion!=='1')){if(old)old.remove();const section=document.createElement('section');section.className='social-goal-template-section';section.dataset.goalMotion='1';section.dataset.socialGoals='1';section.innerHTML='<h4>FOLLOWER, LIKE & DIAMOND GOALS · 9 RÖRLIGA DESIGNER</h4>'+Object.entries(DESIGNS).map(([id,d])=>`<button data-gm-create="${id}"><i>${d.kind==='likes'?'♥':d.kind==='diamonds'?'◆':'♛'}</i><span><b>${d.name}</b><small>${d.orientation==='circle'?'Cirkel':d.orientation==='portrait'?'Stående':'Liggande'} · transparent</small></span></button>`).join('');catalog.prepend(section);section.querySelectorAll('button').forEach(b=>b.onclick=()=>{const d=DESIGNS[b.dataset.gmCreate],created=VyraWidgets.create(`catalog:socialgoal:${d.kind}:${b.dataset.gmCreate}:${d.orientation}`);created.width=d.width;created.goalTitle=labels[d.kind];state.widgets.push(created);selected=created.id;save();render()})}
 if(view!=='editor')return;const w=liveWidget(selected);if(!w||w.type!=='templateSocialGoal')return;const set=(q,key,num=false)=>{const el=document.querySelector(q);if(!el)return;const read=e=>num?+e.target.value:e.target.value;el.oninput=e=>vyraLivePatch(w,el,key,read(e));el.onchange=e=>{w[key]=read(e);save();vyraRenderKeepingPanel()}};
 const model=document.querySelector('#gmModel');if(model)model.onchange=e=>{const d=DESIGNS[e.target.value];w.goalModel=e.target.value;w.goalKind=d.kind;w.goalOrientation=d.orientation;w.goalTitle=labels[d.kind];w.width=d.width;save();render()};set('#gmTitle','goalTitle');set('#gmGlow','goalGlow',true);
};
window.VyraGoalMotion={designs:DESIGNS};
})();
