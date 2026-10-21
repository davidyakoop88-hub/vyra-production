// Gift Fireworks · sidopanelen (2026-10-17). Samma ordning och samma reglage som i widget-playgrounden,
// Davids ord: "så clean ska det vara på min sidopanel" och "alla inställningar ska ... påverka den
// widget". Varje reglage här ändrar fyrverkerierna (gift-festival-engine.js via
// gift-supernova-engine.js rendererFor/mount, och gift-fireworks.js fwSpela) — inget visas som inte
// gör något. Inställningarna sparas på widgeten, så andra widgetar påverkas inte.
// Bildram och ramlager är borttagna (2026-10-17): mitten visar bara gåvan och profilbilden.
//
//   RÖRELSE   testknapp + antal testgåvor
//   STIL      entré, namneffekt, färgpalett, Färg 1/2, textfärg, typsnitt,
//             storlek, rörelsehastighet, glöd, rundning, position
//   FYRVERKERI tema, final vid, minsta gåva, samtidiga, anonyma
//   LJUD      ljud på/av och volym
//   POSITION & STORLEK  X, Y, bredd, lager
(function(){
'use strict';
const themes=VyraWidgets.variants('giftfireworks.theme');
const isCanvas=w=>w?.type==='templateGiftFireworks'&&Object.hasOwn(themes,w.fwTheme);
const color=(v,f)=>/^#[0-9a-f]{6}$/i.test(v||'')?v:f;
// Samma 24 färgpar som playgroundens färgpalett (playground-widgets.js PALETTE).
const PALETT=[["Mint","#3dffb0","#2d8cff"],["Rosa/guld","#ff4fa3","#ffd24a"],["Eld","#ff3b3b","#ff9a3d"],["Lila/is","#a855ff","#3dd5ff"],
 ["Guld","#ffd24a","#ff7a18"],["Cyan","#00e5ff","#7c4dff"],["Lime","#7cff4f","#1fd1a8"],["Vit","#ffffff","#9aa4b2"],
 ["Karmosin","#ff2d55","#ff7a9a"],["Himmel","#4fb3ff","#2d4bff"],["Magenta","#ff3df0","#7a3dff"],["Smaragd","#22d17a","#d6ff4a"],
 ["Solnedgång","#ff6b3d","#ff2d95"],["Hav","#19d3ff","#1f6bff"],["Skog","#3fbf5a","#0f7a4a"],["Candy","#ff8ad8","#8ad8ff"],
 ["Kunglig","#ffc83d","#9a4dff"],["Neongul","#f5ff3d","#3dff8a"],["Rosé","#ffb3c7","#ffd9a8"],["Kol","#cfd6e6","#5a6478"],
 ["Lava","#ff5a1f","#ffd23d"],["Orkidé","#d28cff","#ff8ad0"],["Is","#bff0ff","#6fb8ff"],["Blod","#c3122b","#ff4d4d"]];
const ENTRE=[['zoom','Zooma in med studs'],['drop','Falla in'],['bounce','Studsa in'],['rise','Stiga upp'],['glass','Glas'],['neon','Neon-flimmer'],['none','Ingen']];
const NAMNFX=[['none','Ingen effekt'],['shimmer','Shimmer'],['aurora','Aurora'],['flicker','Flimmer'],['hide','Dölj namnet']];
const TYPSNITT=[["'Segoe UI',system-ui,sans-serif",'Segoe UI'],["Impact,'Arial Narrow Bold',sans-serif",'Impact'],['Georgia,serif','Georgia (serif)'],["'Trebuchet MS',sans-serif",'Trebuchet'],["Consolas,'Courier New',monospace",'Mono']];
const POS=[['','Egen placering'],['top','Överst'],['mid','Mitten'],['bottom','Nederst']];
// Duken är 432×768 i Mobil och 768×432 i Dator (layout-format.js).
const dukH=()=>(typeof state!=='undefined'&&state&&state.layoutFormat==='widescreen')?432:768;
const hojd=w=>{const el=document.querySelector('.editor-shell .canvas [data-id="'+w.id+'"]');return el?el.offsetHeight:Math.round((Number(w.width)||360)*800/960)};
const yFor=(w,v)=>{const H=dukH(),h=hojd(w);return v==='top'?8:v==='bottom'?Math.max(0,H-h-8):Math.max(0,Math.round((H-h)/2))};
const posAv=w=>w.fwPos&&Math.abs((Number(w.y)||0)-yFor(w,w.fwPos))<=2?w.fwPos:'';
// [id, fält, min, max, steg, standard, visning]
// Enheten står i <b> efter värdet (panelspecifikationen 1.2, PR 12) och skrivs med vid varje dragning,
// så att den inte försvinner medan reglaget rör sig.
const REGLAGE={
 fwScale:['Storlek',.5,1.8,.05,1,v=>v.toFixed(2)+' ×'],
 fwPlaySpeed:['Rörelsehastighet',.4,2.5,.1,1,v=>v.toFixed(1)+' ×'],
 fwGlow:['Glöd',0,1.5,.05,.8,v=>v.toFixed(2)+' ×'],
 fwRadius:['Rundning',0,50,1,50,v=>Math.round(v)+' px'],
 fwFinal:['Final vid',100,10000,100,1000,v=>Math.round(v)+' mynt'],
 fwMin:['Minsta gåva',1,500,1,1,v=>Math.round(v)+' mynt'],
 // Standard 1 sedan 2026-10-18 (användarens beslut: ett fyrverkeri i taget). Samma tal som fwFiler i gift-fireworks.js.
 fwLanes:['Samtidiga fyrverkerier',1,5,1,1,v=>Math.round(v)+' st']};
// RUNDNING 0 (PR 12): `Number(v)||standard` gjorde 0 till standardvärdet, så Rundning 0 sparades som 50
// (granskningen). Ett ogiltigt värde ger fortfarande standard; 0 är ett giltigt värde.
const tal=(v,reserv)=>{const n=Number(v);return v!==''&&v!=null&&Number.isFinite(n)?n:reserv};
const varde=(w,k)=>{const r=REGLAGE[k],n=Number(w[k]);return Number.isFinite(n)?Math.min(r[2],Math.max(r[1],n)):r[4]};
const opt=(lista,val)=>lista.map(([k,l])=>`<option value="${k}" ${val===k?'selected':''}>${l}</option>`).join('');
const reglage=(w,k)=>{const r=REGLAGE[k],v=varde(w,k);return `<label class="range-label">${r[0]} <b id="${k}Val">${r[5](v)}</b><input id="${k}" type="range" min="${r[1]}" max="${r[2]}" step="${r[3]}" value="${v}"></label>`};

const previousProps=props;
props=function(){
 const w=liveWidget(selected);if(!isCanvas(w))return previousProps();
 const theme=themes[w.fwTheme],safe=VyraSafe.text,p=color(w.fwColor,theme.primary),s=color(w.fwColor2,theme.secondary);
 const sw=PALETT.map(([n,a,b])=>`<button type="button" class="fw-sw${p.toLowerCase()===a&&s.toLowerCase()===b?' on':''}" data-fwsw="${a}|${b}" title="${n}" aria-label="Färgpalett ${n}" style="background:linear-gradient(135deg,${a},${b})"></button>`).join('');
 return `<h3>GIFT FIREWORKS</h3><div class="template-badge">GÅVOR · TRANSPARENT</div><div hidden><input id="pt" value="${safe(w.title||'Gift Fireworks')}"><input id="pv" value=""></div>
 <div class="property-group"><h4>RÖRELSE</h4><button id="testFw" type="button">▶ Testa fyrverkeriet</button><label>Antal testgåvor<input id="fwCombo" type="number" min="1" max="100" value="${Number(w.fwCombo)||1}"></label><small>1 gåva: en uppskjutning. 10: rytmiskt firande. 100: finalen.</small></div>
 <div class="property-group"><h4>STIL</h4>
  <label>Entré / utgång<select id="fwEnter">${opt(ENTRE,w.fwEnter||'zoom')}</select></label>
  <label>Namneffekt<select id="fwNameFx">${opt(NAMNFX,w.fwNameFx||'none')}</select></label>
  <div class="fw-farger" id="fwFarger"><span class="pg-pal-rubrik">Färgpalett</span><div class="fw-pal" role="group" aria-label="Färgpalett">${sw}</div></div>
  <label>Färg 1<input id="fwColor" type="color" value="${p}"></label>
  <label>Färg 2<input id="fwColor2" type="color" value="${s}"></label>
  <label>Textfärg<input id="fwTextColor" type="color" value="${color(w.fwTextColor,'#ffffff')}"></label>
  <label>Typsnitt<select id="fwFont">${opt(TYPSNITT,w.fwFont||TYPSNITT[0][0])}</select></label>
  ${reglage(w,'fwScale')}${reglage(w,'fwPlaySpeed')}${reglage(w,'fwGlow')}${reglage(w,'fwRadius')}
  <label>Position<select id="fwPos">${opt(POS,posAv(w))}</select></label></div>
 <div class="property-group"><h4>FYRVERKERI</h4><label>Tema<select id="fwCanvasTheme">${Object.entries(themes).map(([key,t])=>`<option value="${key}" ${w.fwTheme===key?'selected':''}>${t.label}</option>`).join('')}</select></label>
  ${reglage(w,'fwFinal')}${reglage(w,'fwMin')}${reglage(w,'fwLanes')}
  <label><input id="fwExcludeAnon" type="checkbox" ${w.fwExcludeAnon?'checked':''}> Exkludera anonyma tittare</label></div>
 <div class="property-group"><h4>LJUD</h4><label><input id="fwSound" type="checkbox" ${w.fwSound===false?'':'checked'}> Aktivera ljud</label><label class="range-label">Ljudvolym <b id="fwVolumeVal">${Number(w.fwVolume??60)}%</b><input id="fwVolume" type="range" min="0" max="100" value="${Number(w.fwVolume??60)}"></label></div>
 <div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${Number(w.x)||0}"></label><label>Y<input id="propY" type="number" value="${Number(w.y)||0}"></label><label>Bredd<input id="propWidth" type="number" value="${Number(w.width)||360}"></label><label>Lager<input id="propLayer" type="number" value="${Number(w.layer)||1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
};
const previousBind=bind;
bind=function(){
 previousBind();const w=liveWidget(selected);if(!isCanvas(w))return;
 const commit=()=>{save();render()},$=id=>document.getElementById(id);
 const val=(id,field,fn=v=>v)=>{const el=$(id);if(el)el.onchange=e=>{w[field]=fn(e.target.value);commit()}};
 val('fwEnter','fwEnter');val('fwNameFx','fwNameFx');val('fwFont','fwFont');
 for(const id of ['fwColor','fwColor2','fwTextColor'])val(id,id,v=>color(v,w[id]));
 for(const k of Object.keys(REGLAGE)){const el=$(k),r=REGLAGE[k];if(!el)continue;
  el.oninput=e=>{const b=$(k+'Val');if(b)b.textContent=r[5](Number(e.target.value))};
  el.onchange=e=>{w[k]=Math.min(r[2],Math.max(r[1],tal(e.target.value,r[4])));commit()}}
 document.querySelectorAll('[data-fwsw]').forEach(b=>b.onclick=()=>{const [a,c]=b.dataset.fwsw.split('|');w.inheritBrandKit=false;w.fwColor=a;w.fwColor2=c;commit()});
 // Position: placerar widgeten överst/mitten/nederst på duken utifrån dess höjd.
 const pos=$('fwPos');if(pos)pos.onchange=e=>{const v=e.target.value;w.fwPos=v;if(v)w.y=yFor(w,v);commit()};
 const tema=$('fwCanvasTheme');if(tema)tema.onchange=e=>{const t=themes[e.target.value];if(t){w.inheritBrandKit=false;w.fwTheme=e.target.value;w.fwMotion=t.motion;w.fwColor=t.primary;w.fwColor2=t.secondary;commit()}};
 const combo=$('fwCombo');if(combo)combo.onchange=e=>{w.fwCombo=Math.min(100,Math.max(1,Number(e.target.value)||1));commit()};
 const vol=$('fwVolume');if(vol){vol.oninput=e=>{const b=$('fwVolumeVal');if(b)b.textContent=e.target.value+'%'};vol.onchange=e=>{w.fwVolume=Math.min(100,Math.max(0,Number(e.target.value)||0));commit()}}
 const ljud=$('fwSound');if(ljud)ljud.onchange=e=>{w.fwSound=e.target.checked;commit()};
 const anon=$('fwExcludeAnon');if(anon)anon.onchange=e=>{w.fwExcludeAnon=e.target.checked;commit()};
};
if(typeof render==='function')render();
})();
