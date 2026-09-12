// Supernova settings expose only controls used by the approved renderer.
(function(){
'use strict';
const palettes={royal:['#ffd06b','#a764ff'],ice:['#dcecff','#49cfff'],rose:['#edb98b','#ff7cc8'],emerald:['#ffd06b','#39db9b']};
const styles={classic:'Supernova · Original',willow:'Kaskad · Långa svansar',sparkle:'Stjärnregn · Glittrande smällar'};
const isNova=w=>w?.type==='templateGiftFireworks'&&w.fwTheme==='supernova';
const color=(v,f)=>/^#[0-9a-f]{6}$/i.test(v||'')?v:f;
const previousProps=props;
props=function(){
 const w=liveWidget(selected);if(!isNova(w))return previousProps();
 const safe=VyraSafe.text,p=color(w.fwColor,palettes.royal[0]),s=color(w.fwColor2,palettes.royal[1]);
 return `<h3>SUPERNOVA</h3><div class="template-badge">GÅVOR · TRANSPARENT</div><div hidden><input id="pt" value="${safe(w.title||'Supernova')}"><input id="pv" value=""></div>
 <div class="property-group"><h4>DESIGN & FÄRGER</h4><label>Fyrverkeristil<select id="fwNovaStyle">${Object.entries(styles).map(([key,label])=>`<option value="${key}" ${w.fwNovaStyle===key?'selected':''}>${label}</option>`).join('')}</select></label>
 <label>Färgtema<select id="fwNovaPalette"><option value="royal">Lila & guld</option><option value="ice">Isblå & silver</option><option value="rose">Rosa & roséguld</option><option value="emerald">Smaragd & guld</option><option value="custom">Egna färger</option></select></label>
 <div class="color-grid"><label>Huvudfärg<input id="fwColor" type="color" value="${p}"></label><label>Accentfärg<input id="fwColor2" type="color" value="${s}"></label></div><button id="fwNovaReset" type="button">Återställ original</button></div>
 <div class="property-group"><h4>TRIGGER & TEST</h4><label>Minsta gåvovärde (mynt)<input id="fwMin" type="number" min="1" value="${Number(w.fwMin)||1}"></label><label><input id="fwExcludeAnon" type="checkbox" ${w.fwExcludeAnon?'checked':''}> Exkludera anonyma tittare</label><label>Antal testgåvor<input id="fwCombo" type="number" min="1" max="100" value="${Number(w.fwCombo)||1}"></label><button id="testFw" type="button">▶ Testa Supernova</button><small>1 gåva: en uppskjutning. 10: rytmiskt firande. 100: en show med den största finalen.</small></div>
 <div class="property-group"><h4>LJUD</h4><label><input id="fwSound" type="checkbox" ${w.fwSound===false?'':'checked'}> Aktivera ljud</label><label>Ljudvolym<input id="fwVolume" type="range" min="0" max="100" value="${Number(w.fwVolume??60)}"></label></div>
 <details class="property-group"><summary>BILDER</summary><label>Reservbild för gåva<input id="fwGiftImage" value="${safe(w.fwGiftImage||'assets/gifts/events/0001_Rose.png')}"></label><small>Vid live visas gåvan och avsändarens profilbild.</small></details>
 <div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${Number(w.x)||0}"></label><label>Y<input id="propY" type="number" value="${Number(w.y)||0}"></label><label>Bredd<input id="propWidth" type="number" value="${Number(w.width)||540}"></label><label>Lager<input id="propLayer" type="number" value="${Number(w.layer)||1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
};
const previousBind=bind;
bind=function(){
 previousBind();const w=liveWidget(selected);if(!isNova(w))return;
 const palette=document.querySelector('#fwNovaPalette');if(palette)palette.value=Object.keys(palettes).find(k=>palettes[k][0]===w.fwColor&&palettes[k][1]===w.fwColor2)||'custom';
 const commit=()=>{save();render()};
 const gift=document.getElementById('fwGiftImage');if(gift)gift.onchange=e=>{w.fwGiftImage=e.target.value;commit()};
 const style=document.querySelector('#fwNovaStyle');if(style)style.onchange=e=>{if(Object.hasOwn(styles,e.target.value)){w.fwNovaStyle=e.target.value;commit()}};
 if(palette)palette.onchange=e=>{const colors=palettes[e.target.value];if(colors){[w.fwColor,w.fwColor2]=colors;commit()}};
 const reset=document.querySelector('#fwNovaReset');if(reset)reset.onclick=()=>{w.fwNovaStyle='classic';[w.fwColor,w.fwColor2]=palettes.royal;commit()};
 for(const [id,field,min,max] of [['fwCombo','fwCombo',1,100],['fwVolume','fwVolume',0,100]]){const el=document.getElementById(id);if(el)el.onchange=e=>{w[field]=Math.min(max,Math.max(min,Number(e.target.value)||0));commit()};}
};
if(typeof render==='function')render();
})();
