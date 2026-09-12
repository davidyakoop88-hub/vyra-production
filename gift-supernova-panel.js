// Approved canvas fireworks expose only controls their renderers use.
(function(){
'use strict';
const palettes={royal:['#ffd06b','#a764ff'],ice:['#dcecff','#49cfff'],rose:['#edb98b','#ff7cc8'],emerald:['#ffd06b','#39db9b']};
const styles={classic:'Supernova · Original',willow:'Kaskad · Långa svansar',sparkle:'Stjärnregn · Glittrande smällar'};
const themes=VyraWidgets.variants('giftfireworks.theme');
const isCanvas=w=>w?.type==='templateGiftFireworks'&&Object.hasOwn(themes,w.fwTheme);
const paletteFor=w=>w.fwTheme==='supernova'?palettes:Object.fromEntries(Object.entries(themes).filter(([k])=>k!=='supernova').map(([k,t])=>[k,[t.primary,t.secondary]]));
const color=(v,f)=>/^#[0-9a-f]{6}$/i.test(v||'')?v:f;
const previousProps=props;
props=function(){
 const w=liveWidget(selected);if(!isCanvas(w))return previousProps();
 const nova=w.fwTheme==='supernova',theme=themes[w.fwTheme],activePalettes=paletteFor(w);
 const safe=VyraSafe.text,p=color(w.fwColor,theme.primary),s=color(w.fwColor2,theme.secondary);
 return `<h3>${nova?'SUPERNOVA':safe(theme.label)}</h3><div class="template-badge">GÅVOR · TRANSPARENT</div><div hidden><input id="pt" value="${safe(w.title||'Supernova')}"><input id="pv" value=""></div>
 <div class="property-group"><h4>DESIGN & FÄRGER</h4>${nova?`<label>Fyrverkeristil<select id="fwNovaStyle">${Object.entries(styles).map(([key,label])=>`<option value="${key}" ${w.fwNovaStyle===key?'selected':''}>${label}</option>`).join('')}</select></label>`:`<label>Fyrverkeridesign<select id="fwCanvasTheme">${Object.entries(themes).map(([key,t])=>`<option value="${key}" ${w.fwTheme===key?'selected':''}>${t.label}</option>`).join('')}</select></label>`}
 <label>Färgtema<select id="fwNovaPalette">${Object.keys(activePalettes).map(key=>`<option value="${key}">${key==='emerald'?'Smaragd & guld':themes[key].label}</option>`).join('')}<option value="custom">Egna färger</option></select></label>
 <div class="color-grid"><label>Huvudfärg<input id="fwColor" type="color" value="${p}" ${w.inheritBrandKit?'disabled':''}></label><label>Accentfärg<input id="fwColor2" type="color" value="${s}" ${w.inheritBrandKit?'disabled':''}></label></div>${bkCheckbox(w)}<button id="fwNovaReset" type="button">Återställ original</button></div>
 <div class="property-group"><h4>TRIGGER & TEST</h4><label>Minsta gåvovärde (mynt)<input id="fwMin" type="number" min="1" value="${Number(w.fwMin)||1}"></label><label><input id="fwExcludeAnon" type="checkbox" ${w.fwExcludeAnon?'checked':''}> Exkludera anonyma tittare</label><label>Antal testgåvor<input id="fwCombo" type="number" min="1" max="100" value="${Number(w.fwCombo)||1}"></label><button id="testFw" type="button">▶ Testa ${safe(theme.label)}</button><small>1 gåva: en uppskjutning. 10: rytmiskt firande. 100: en show med den största finalen.</small></div>
 <div class="property-group"><h4>LJUD</h4><label><input id="fwSound" type="checkbox" ${w.fwSound===false?'':'checked'}> Aktivera ljud</label><label>Ljudvolym<input id="fwVolume" type="range" min="0" max="100" value="${Number(w.fwVolume??60)}"></label></div>
 <details class="property-group"><summary>BILDER</summary><label>Reservbild för gåva<input id="fwGiftImage" value="${safe(w.fwGiftImage||'assets/gifts/events/0001_Rose.png')}"></label><small>Vid live visas gåvan och avsändarens profilbild.</small></details>
 <div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${Number(w.x)||0}"></label><label>Y<input id="propY" type="number" value="${Number(w.y)||0}"></label><label>Bredd<input id="propWidth" type="number" value="${Number(w.width)||540}"></label><label>Lager<input id="propLayer" type="number" value="${Number(w.layer)||1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
};
const previousBind=bind;
bind=function(){
 previousBind();const w=liveWidget(selected);if(!isCanvas(w))return;
 const activePalettes=paletteFor(w);bkBind(w);
 const palette=document.querySelector('#fwNovaPalette');if(palette)palette.value=Object.keys(activePalettes).find(k=>activePalettes[k][0]===w.fwColor&&activePalettes[k][1]===w.fwColor2)||'custom';
 const commit=()=>{save();render()};
 const themeChoice=document.getElementById('fwCanvasTheme');if(themeChoice)themeChoice.onchange=e=>{const theme=themes[e.target.value];if(theme){w.inheritBrandKit=false;w.fwTheme=e.target.value;w.fwMotion=theme.motion;w.fwColor=theme.primary;w.fwColor2=theme.secondary;commit()}};
 const gift=document.getElementById('fwGiftImage');if(gift)gift.onchange=e=>{w.fwGiftImage=e.target.value;commit()};
 const style=document.querySelector('#fwNovaStyle');if(style)style.onchange=e=>{if(Object.hasOwn(styles,e.target.value)){w.fwNovaStyle=e.target.value;commit()}};
 if(palette)palette.onchange=e=>{const colors=activePalettes[e.target.value];if(colors){w.inheritBrandKit=false;[w.fwColor,w.fwColor2]=colors;commit()}};
 const reset=document.querySelector('#fwNovaReset');if(reset)reset.onclick=()=>{w.inheritBrandKit=false;if(w.fwTheme==='supernova')w.fwNovaStyle='classic';const theme=themes[w.fwTheme];w.fwColor=theme.primary;w.fwColor2=theme.secondary;commit()};
 for(const [id,field,min,max] of [['fwCombo','fwCombo',1,100],['fwVolume','fwVolume',0,100]]){const el=document.getElementById(id);if(el)el.onchange=e=>{w[field]=Math.min(max,Math.max(min,Number(e.target.value)||0));commit()};}
};
if(typeof render==='function')render();
})();
