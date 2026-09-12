(function(){
'use strict';
const themes=[['gold','Guldslöja'],['platinum','Platinum Light'],['emerald','Emerald Mist']];
function theme(w){return ({gold:'gold',platinum:'platinum',emerald:'emerald',glass:'platinum',minimal:'platinum',aurora:'emerald','crystal-garden':'emerald'})[w.campaignTheme]||'gold'}
const text=v=>VyraSafe.text(String(v??''));
const finite=(v,f)=>Number.isFinite(+v)?+v:f;
function html(w){
 const items=window.VyraCampaignItems(w),portrait=w.campaignOrientation==='portrait',width=Math.max(100,finite(w.width,portrait?245:608)),designWidth=portrait?245:items.length*152+24,scale=width/designWidth;
 const colors={gold:'#dfbf81',platinum:'#c7dce9',emerald:'#82dfb7'};
 return `<div class="widget vyra-campaign-aura${selected===w.id?' selected':''}" data-id="${text(w.id)}" data-theme="${theme(w)}" style="left:${finite(w.x,0)}px;top:${finite(w.y,0)}px;width:${width}px;zoom:${Math.max(.1,finite(w.widgetScale,1))};--accent:${colors[theme(w)]}"><div class="campaign-aura-layout" style="width:${designWidth}px;zoom:${scale}"><div class="event-heading"><b>${text(w.templateTitle||'GIFT CAMPAIGN')}</b><span>${text(w.campaignSubtitle||'Hjälp oss nå kvällens mål')}</span></div><div class="${portrait?'portrait':'landscape'}">${items.map((g,i)=>`<article class="gift" data-gift-index="${i}"><div class="frame"><canvas class="live-aura" width="360" height="396"></canvas><img src="${VyraSafe.url(g.image)}" alt="${text(g.name)}"><div class="burst">${'<i></i>'.repeat(18)}</div><div class="hit-ring"></div></div><div><div class="count"><b>${Math.max(0,finite(g.current,0))}</b><span> / ${Math.max(1,finite(g.target,1))}</span></div><div class="name">${text(g.name)}</div><div class="meter"><i style="width:${Math.min(100,Math.max(0,g.current/Math.max(1,g.target)*100))}%"></i></div><div class="goal-mark">${g.current>=g.target?'MÅL KLART':''}</div><div class="remaining"></div></div></article>`).join('')}</div></div>${selected===w.id?'<span class="resize-handle">↘</span>':''}</div>`;
}
window.VyraCampaignAura={theme,html,themes};
campaignHtml=html;
const oldWh=wh;wh=function(w){return w.type==='templateGiftCampaign'?html(w):oldWh(w)};
const oldProps=props;props=function(){let result=oldProps(),w=liveWidget(selected);if(!w||w.type!=='templateGiftCampaign')return result;
 result=result.replace(/<select id="campaignTheme">[\s\S]*?<\/select>/,`<select id="campaignTheme">${themes.map(([id,label])=>`<option value="${id}" ${theme(w)===id?'selected':''}>${label}</option>`).join('')}</select>`).replace('Liggande · 4 på rad','Liggande · gåvor i rad').replace('Stående · 2 × 2','Stående · gåvor i följd');
 result=result.replace(/<label>Accent<input id="campaignAccent"[^>]*><\/label>/,'').replace(bkCheckbox(w),'');
 return result.replace('<button class="delete"',`<div class="property-group"><h4>LJUS OCH RÖRELSE</h4><label>Entré från<select id="campaignDirection"><option value="-1">Vänster</option><option value="1">Höger</option></select></label><label>Rörelse<select id="campaignMotion"><option value="lift">Mjukt lyft</option><option value="tilt">Lätt lutning</option><option value="wave">Ljusvåg mellan gåvorna</option><option value="still">Stilla gåvor · levande ljus</option></select></label><label><input id="campaignSound" type="checkbox" ${w.campaignSound?'checked':''}> Ljud vid gåva</label><label>Volym<input id="campaignVolume" type="range" min="0" max="100" value="${Math.max(0,Math.min(100,finite(w.campaignVolume,30)))}"></label><p>Kampanjen stannar synlig efter entrén. Gåvoreaktioner har företräde framför ljusvandringen.</p></div><button class="delete"`);
};
const oldBind=bind;bind=function(){oldBind();if(view!=='editor'&&view!=='overlay')return;
 const section=document.querySelector('[data-campaign-template]');if(section&&!section.dataset.aura){section.dataset.aura='1';section.innerHTML='<h4>GIFT CAMPAIGN · LJUS OCH RÖRELSE</h4>'+themes.map(([id,label])=>['landscape','portrait'].map(orientation=>`<button data-campaign-theme="${id}" data-campaign-orient="${orientation}" data-catalog-key="catalog:giftcampaign:${id}:${orientation}"><i>✧</i><span><b>${label}</b><small>${orientation==='portrait'?'Stående':'Liggande'}</small></span></button>`).join('')).join('');section.querySelectorAll('button').forEach(button=>button.onclick=()=>{const w=VyraWidgets.create(button.dataset.catalogKey);state.widgets.push(w);selected=w.id;save();render()})}
 const w=liveWidget(selected);if(!w||w.type!=='templateGiftCampaign'||view!=='editor')return;
 const picker=document.querySelector('#campaignTheme');if(picker)picker.value=theme(w);
 for(const [id,key,fallback] of [['campaignMotion','campaignMotion','lift'],['campaignDirection','campaignDirection',-1],['campaignVolume','campaignVolume',30],['campaignSound','campaignSound',false]]){const el=document.getElementById(id);if(!el)continue;if(el.type!=='checkbox')el.value=w[key]??fallback;el.onchange=()=>{w[key]=el.type==='checkbox'?el.checked:el.type==='range'||id==='campaignDirection'?+el.value:el.value;save();render()}}
};
})();
