(()=>{
/* Intro och outro i millisekunder, inte i procent av speltiden. Fore det har satt upp- och
   nedtoningen inbakad i fw-scene som 8% och 12% av --duration, sa en effekt pa 2 s fick en intro
   pa 160 ms vare sig man ville eller inte. Nu ar tiderna sig sjalva och speltiden ar speltiden. */
const FW_INTRO={fade:400,pop:520,instant:0},FW_OUTRO={fade:600,cut:0};
const fwIntroOf=w=>FW_INTRO[w.fwIntro]!==undefined?w.fwIntro:'fade';
const fwOutroOf=w=>FW_OUTRO[w.fwOutro]!==undefined?w.fwOutro:'fade';
const fwPresets={classic:{fwSpeed:.6,fwDuration:5,fwExplosion:100,fwDensity:70,fwColor:'#ff4fa3',fwColor2:'#ffd45b'},slowmo:{fwSpeed:1.3,fwDuration:8,fwExplosion:130,fwDensity:55,fwColor:'#7fd8ff',fwColor2:'#ffffff'},chaos:{fwSpeed:.25,fwDuration:4,fwExplosion:150,fwDensity:100,fwColor:'#ff2d2d',fwColor2:'#ffe600'}};
const oldWh=wh;wh=function(w){if(w.type!=='templateGiftFireworks')return oldWh(w);let fwC1=bk(w,w.fwColor,'highlight','#ff4fa3'),fwC2=bk(w,w.fwColor2,'secondaryText','#ffd45b'),n=Math.max(18,Math.round((w.fwDensity||70)/2)),p=Array.from({length:n},(_,i)=>`<i style="--a:${i*137.5}deg;--d:${55+i%8*11}px;--c:${i%3?fwC1:fwC2}"></i>`).join('');return `<div class="widget templateGiftFireworks${selected===w.id?' selected':''}" data-id="${w.id}" style="left:${w.x}px;top:${w.y}px;width:${w.width||360}px"><div class="gift-fireworks-fx" style="--speed:${w.fwSpeed||.6}s;--duration:${w.fwDuration||5}s;--fw-in:${FW_INTRO[fwIntroOf(w)]}ms;--fw-out:${FW_OUTRO[fwOutroOf(w)]}ms;--blast:${(w.fwExplosion||100)/100};--gift:${w.fwGiftSize||110}px"><div class="fw-rocket"></div><div class="fw-burst">${p}</div><div class="fw-ring"></div><img src="${w.fwGiftImage||'assets/gifts/events/0001_Rose.png'}"><strong>GIFT FIREWORKS</strong>${w.fwTextOn?`<span class="fw-text" style="font-size:${VyraSafe.num(w.fwTextSize,20)}px;color:${VyraSafe.text(w.fwTextColor||'#ffffff')}"></span>`:''}</div><span class="resize-handle">↘</span></div>`};
const oldProps=props;props=function(){let w=liveWidget(selected);if(!w||w.type!=='templateGiftFireworks')return oldProps();let range=(id,label,min,max,val,step=1)=>`<label class="range-label">${label}<b>${val}</b><span class="range-row"><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}"><input id="${id}Num" class="range-number" type="number" min="${min}" max="${max}" step="${step}" value="${val}"></span></label>`;return `<h3>GIFT FIREWORKS</h3><div class="template-badge">GIFT-TRIGGER · TRANSPARENT</div><div hidden><input id="pt" value="Gift Fireworks"><input id="pv" value=""></div><div class="property-group"><h4>TRIGGER</h4><label>Minsta gift-värde<input id="fwMin" type="number" min="1" value="${w.fwMin||1}"></label><small>Gåvor under gränsen tänder inget fyrverkeri.</small></div><div class="property-group"><h4>ANIMATION</h4><label>Intro<select id="fwIntro"><option value="fade">Tonar in</option><option value="pop">Zoomar in</option><option value="instant">Direkt, ingen intro</option></select></label><label>Outro<select id="fwOutro"><option value="fade">Tonar bort</option><option value="cut">Klipps bort direkt</option></select></label><small>Intron och outron har egna tider och äter inte av visningstiden.</small></div><div class="property-group"><h4>EFFEKT</h4><label>Förinställning<select id="fwPreset"><option value="">Anpassad</option><option value="classic">Classic</option><option value="slowmo">Slow-mo</option><option value="chaos">Chaos</option></select></label>${range('fwSpeed','Rakethastighet',.2,1.5,w.fwSpeed||.6,.1)}${range('fwDuration','Visningstid',2,10,w.fwDuration||5)}${range('fwGiftSize','Giftstorlek',50,320,w.fwGiftSize||110)}${range('fwExplosion','Explosion',40,160,w.fwExplosion||100)}${range('fwDensity','Partiklar',20,100,w.fwDensity||70)}<div class="color-grid"><label>Färg 1<input id="fwColor" type="color" value="${w.fwColor||'#ff4fa3'}" ${w.inheritBrandKit?'disabled':''}></label><label>Färg 2<input id="fwColor2" type="color" value="${w.fwColor2||'#ffd45b'}" ${w.inheritBrandKit?'disabled':''}></label></div>${bkCheckbox(w)}<label><input id="fwSound" type="checkbox" ${w.fwSound===false?'':'checked'}> Aktivera ljud</label>${w.fwSound===false?'':range('fwVolume','Ljudvolym',0,100,w.fwVolume??60)}<label><input id="fwExcludeAnon" type="checkbox" ${w.fwExcludeAnon?'checked':''}> Exkludera anonyma tittare</label><button id="testFw">▶ Testa Gift Fireworks</button></div><div class="property-group"><h4>TEXT</h4><label><input id="fwTextOn" type="checkbox" ${w.fwTextOn?'checked':''}> Visa text</label><label>Mall<input id="fwText" value="${VyraSafe.text(w.fwText,'{user} skickade {gift}')}"></label><small>{user} och {gift} byts mot gåvans avsändare och namn.</small>${range('fwTextSize','Textstorlek',10,72,w.fwTextSize||20)}<label>Färg<input id="fwTextColor" type="color" value="${w.fwTextColor||'#ffffff'}"></label></div><div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x||0}"></label><label>Y<input id="propY" type="number" value="${w.y||0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width||360}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer||1}"></label></div></div><button class="delete" id="del">Ta bort</button>`};
const oldBind=bind;bind=function(){oldBind();if(view!=='editor'&&view!=='overlay')return;let cat=document.querySelector('.widget-catalog');if(cat&&!cat.querySelector('[data-fw]')){let s=document.createElement('section');s.dataset.fw='1';s.innerHTML=`<h4>GIFT FIREWORKS</h4>${[['magnetic','Magnetic Return'],['spiral','Spiral Recall'],['bloom','Crystal Bloom']].map(([m,label])=>`<button data-fw-motion="${m}"><i class="vyra-pro-icon">${vyraCatalogIcon('bolt')}</i><span><b>Fireworks · ${label}</b><small>Gift-trigger · explosion</small></span></button>`).join('')}`;cat.prepend(s);s.querySelectorAll('[data-fw-motion]').forEach(b=>{/* Nyckeln pa knappen ar det som gor designen matbar, forhandsvisningsbar och aterskapbar. Widgeten byggs ur fabriken i stallet for handknackt har; ett test jamfor falt for falt mot den gamla formen sa befintliga anvandare far exakt samma sak. */const catalogKey='catalog:giftfireworks:'+b.dataset.fwMotion;b.dataset.catalogKey=catalogKey;b.onclick=()=>{const created=VyraWidgets.create(catalogKey);state.widgets.push(created);selected=created.id;save();render();toast('Gift Fireworks · '+b.dataset.fwMotion+' skapad')}})}let w=liveWidget(selected);if(!w||w.type!=='templateGiftFireworks')return;let set=(id,key,bool=false)=>{let e=document.querySelector(id);if(e)e.onchange=x=>{w[key]=bool?x.target.checked:(x.target.type==='color'?x.target.value:+x.target.value);save();render()}};[['fwMin','fwMin'],['fwSpeed','fwSpeed'],['fwDuration','fwDuration'],['fwGiftSize','fwGiftSize'],['fwExplosion','fwExplosion'],['fwDensity','fwDensity'],['fwColor','fwColor'],['fwColor2','fwColor2']].forEach(x=>set('#'+x[0],x[1]));/* fwStreak ar borttagen. bridge.js:241 slapper bara igenom sista frame:n av en streak, sa varje
   gava en widget nagonsin ser AR en avslutad streak - kryssrutan lovade en skillnad som inte
   finns nedstroms. Faltet ligger kvar orort pa redan sparade widgetar och skadar inget. */
[['fwIntro','fwIntro'],['fwOutro','fwOutro']].forEach(([id,key])=>{const e=document.querySelector('#'+id);if(!e)return;e.value=key==='fwIntro'?fwIntroOf(w):fwOutroOf(w);e.onchange=x=>{w[key]=x.target.value;save();render()}});
set('#fwSound','fwSound',true);set('#fwExcludeAnon','fwExcludeAnon',true);set('#fwTextOn','fwTextOn',true);set('#fwTextSize','fwTextSize');let tc=document.querySelector('#fwTextColor');if(tc)tc.onchange=x=>{w.fwTextColor=x.target.value;save();render()};let tm=document.querySelector('#fwText');if(tm)tm.onchange=x=>{w.fwText=x.target.value;save();render()};/* Reglaget och dess nummerfalt visar samma varde och ska folja varandra. Klampningen sitter
   pa BADA: ett nummerfalt slapper igenom vad som helst som skrivs in, till skillnad fran ett
   reglage, och utan klampning hade 9999 hamnat rakt i widgeten. */
[['fwSpeed',.1],['fwDuration',1],['fwGiftSize',1],['fwExplosion',1],['fwDensity',1],['fwTextSize',1],['fwVolume',1]].forEach(([id,steg])=>{const r=document.querySelector('#'+id),n=document.querySelector('#'+id+'Num');if(!r||!n)return;const klamp=v=>Math.min(+r.max,Math.max(+r.min,Number.isFinite(+v)?+v:+r.min));const skriv=(v,fran)=>{const k=klamp(v);w[id]=k;if(fran!=='r')r.value=k;if(fran!=='n')n.value=k;const b=r.closest('.range-label')?.querySelector('b');if(b)b.textContent=k};r.oninput=x=>skriv(x.target.value,'r');r.onchange=x=>{skriv(x.target.value,'r');save();render()};n.onchange=x=>{skriv(x.target.value,'n');save();render()};});bkBind(w);let preset=document.querySelector('#fwPreset');if(preset)preset.onchange=x=>{let p=fwPresets[x.target.value];if(p)Object.assign(w,p);save();render()};/* Testknappens klick agas av capture-lyssnaren nedan, som gar genom triggern. Har satt forr en
   ANDRA onclick som tande `.play` rakt av — tva genvagar forbi kon, tva rader isar. */};
/* Testknappen gar genom den PUBLIKA triggern, aldrig forbi den.
   Forr byggde den har lyssnaren raketerna sjalv och satte `.play` direkt pa noden. Da gick
   testet forbi VyraAlertQueue (runtime-controls.js lindar bara triggern), forbi dubblettsparren
   fwRedanTand, och det tande bara den VALDA widgeten medan en riktig gava tander alla synliga.
   Man kunde alltsa inte prova det man mest behover prova: hur fyrverkerier pacear mot andra
   alerts. Nu ar knappen en gava som alla andra.
   __test hoppar over fwMin och anonymfiltret — annars tystnar knappen sa fort streamern hojer
   sin grans — men behaller kon och sparren. Samma monster som triggerFanLevelUp.
   Combon LASES ur faltet och skickas som argument. Den skrivs inte till widgeten har; det gor
   faltets egen onchange langre ner. Se docs/tech-debt.md punkt 3. */
document.addEventListener('click',event=>{if(!event.target.closest('#testFw'))return;event.preventDefault();let w=liveWidget(selected,'templateGiftFireworks');if(!w)return toast('Välj Gift Fireworks på canvasen först');let combo=Math.max(1,Math.min(100,+document.querySelector('#fwCombo')?.value||w.fwCombo||1));window.triggerGiftFireworks({combo,username:'@Test',giftName:'Rose',__test:true})},true);
/* En timer per EFFEKT, inte en per gava. Forr fick varje gava sin egen setTimeout som tog bort
   .play; tva gavor tatt inpa varandra gav tva timers, och den FORSTA klippte den andra animationen
   kort mitt i. Nu satts samma timer om, sa en ny gava FORLANGER visningen i stallet for att avbryta
   den — samma regel som VyraFlip gav Top Gift och Top Streak. */
const fwTimers=new Map();
/* `gavobild` ar den gava som FAKTISKT skickades, hamtad ur eventet. Utan den visade varje raket
   panelinstallningens bild — standard 0001_Rose.png — sa tva lion gav tva rosor. */
function fwSpela(w,e,combo,gavobild,avatarbild){
  buildComboRockets(w,e,combo,gavobild,avatarbild);
  /* Den CENTRALA gavan — den som aterformas i mitten och ar widgetens storsta grafik. Den byggs
     en gang av wh() ur panelinstallningen och rors annars aldrig av live-vagen: raketerna kunde
     bara ratt gava medan mitten fortfarande visade en ros (uppmatt i riktig Chrome).
     Direktbarnet, inte querySelector('img'): raketerna bar egna <img class="fw-rocket-gift">. */
  if(gavobild){const mitt=[...e.children].find(n=>n.tagName==='IMG');if(mitt)mitt.setAttribute('src',gavobild)}
  e.classList.add('play');
  const ms=Math.max(0,(w.fwDuration||5)*1000),forra=fwTimers.get(e);
  if(forra)clearTimeout(forra.id);
  const id=setTimeout(()=>{e.classList.remove('play');fwTimers.delete(e)},ms);
  fwTimers.set(e,{id,slutarVid:Date.now()+ms});
}
window.VyraFireworks={
  timers:()=>fwTimers.size,
  slutarVid:()=>Math.max(0,...[...fwTimers.values()].map(t=>t.slutarVid)),
  spelar:e=>fwTimers.has(e),
  /* Timerns id, sa ett test kan bevisa att just DEN rensades — genom att spionera pa clearTimeout,
     inte genom att lita pa en raknare koden sjalv okar. En raknare gar att luras: tar man bort
     clearTimeout men later raknaren sta kvar blir testet gront anda (uppmatt). */
  aktivId:e=>fwTimers.get(e)&&fwTimers.get(e).id
};
/* `gavobild` vinner over panelinstallningen, och det ar hela poangen med widgeten: den ska visa
   vilken gava som skickades. Panelbilden ar RESERV — editorns testknapp har ingen gava alls, och
   ett event utan bild ska inte ge en tom <img src="">. */
function buildComboRockets(w,e,combo=w.fwCombo||1,gavobild,avatarbild){combo=Math.max(1,Math.min(100,+combo||1));e.querySelectorAll('.fw-rocket').forEach(x=>x.remove());let burst=e.querySelector('.fw-burst'),gift=gavobild||w.fwGiftImage||campaignGiftList()[0]?.file;for(let i=0;i<combo;i++){let rocket=document.createElement('div');rocket.className='fw-rocket';rocket.style.setProperty('--x',`${8+((i*37)%85)}%`);rocket.style.setProperty('--delay',`${(i%20)*.045}s`);rocket.style.setProperty('--hue',`${(i*29)%360}deg`);rocket.style.setProperty('--gift-scale',`${.62+(i%5)*.08}`);/* Tva sidor nar avsandaren har en bild: profilbilden mot betraktaren under stigningen, gavan pa
     baksidan, och en rotateY i vandpunkten. Flippen ar CSS pa .fw-rocket-flip — en JS-timer per
     raket hade blivit hundra timers vid hundra raketer, och de overlever inte att noden byts ut.
     UTAN avsandarbild byggs INGEN flipstruktur: markupen blir exakt som forut, sa en tom framsida
     aldrig kan sta och lysa i stallet for en gava. */
  rocket.innerHTML=(avatarbild&&i===0)
    ?`<div class="fw-rocket-flip"><img class="fw-rocket-avatar" src="${avatarbild}" alt=""><img class="fw-rocket-gift" src="${gift}" alt=""></div>`
    :`<img class="fw-rocket-gift" src="${gift}" alt="">`;e.insertBefore(rocket,burst)}return combo}
/* Tar emot bade ett rent tal och hela eventet. action-runtime skickade i alla tider bara
   combon, och runtime-controls koar triggern med samma argument - men anonymfiltret och
   textmallen behover avsandare och gavonamn, som bara finns i eventet. Bada formerna gar. */
/* Gavans varde. Molnets kontrakt (server/event-bus.js cleanEvent) doper coins till value, och
   live-client.js lappar tillbaka det - men liveEventTriggers skriver samtidigt over value med
   gavans NAMN for gift-payloads, sa value kan vara en strang. Darfor: forsta faltet som ar ett
   riktigt positivt tal vinner, och saknas alla tre ar beloppet OKANT.
   Okant belopp blockerar aldrig. fwMin ar 1 som standard, och ett testevent utan coins hade
   annars slutat tanda nagot alls. Bara ett KANT belopp under gransen stoppas. */
const fwBelopp=d=>[d.coins,d.value,d.diamondCount].map(Number).find(n=>Number.isFinite(n)&&n>0);
function fwSlapperIgenom(w,d){
  /* Editorns testknapp slipper grindarna, men bara de. Utan undantaget blir knappen TYST sa fort
     streamern hojer fwMin: man trycker och ingenting hander, utan forklaring. Kon och
     dubblettsparren galler fortfarande — det ar dem man testar. */
  if(d.__test)return true;
  if(w.fwExcludeAnon&&d.isAnonymous)return false;
  const belopp=fwBelopp(d);
  return belopp===undefined||belopp>=(w.fwMin||1);
}
/* En gava far tanda ETT fyrverkeri, aven om den kommer in tva vagar.
   gift-fireworks-session.js ger widgeten sin riktiga livetrigger, men action-runtime.js:62 anropar
   redan den har funktionen for den som SJALV lagt upp en Action med "firework" i widgetnamnet. Utan
   sparren skulle just de anvandarna — de enda som haft en fungerande gift-trigger hittills — plotsligt
   fa tva fyrverkerier per gava. Triggern ar den enda punkt bada vagarna passerar, sa sparren hor hemma
   har och ingen annanstans.
   Nyckeln ar molnets event-id. Saknas det sparras ingenting: panelens testknapp skickar inget id, och
   ett tryck till maste alltid ge ett nytt fyrverkeri. */
const fwSedda=new Map(),FW_SPARR_MS=1500;
function fwRedanTand(d){
  const id=d&&d.id;if(!id)return false;
  const nu=Date.now();
  for(const [k,t] of fwSedda)if(nu-t>FW_SPARR_MS)fwSedda.delete(k);
  const nyckel=String(id);
  if(fwSedda.has(nyckel))return true;
  fwSedda.set(nyckel,nu);return false;
}
window.triggerGiftFireworks=input=>{const d=(input&&typeof input==='object')?input:{combo:input};
if(fwRedanTand(d))return false;
/* Alla synliga fyrverkerier, inte bara det forsta. Varje widget gor sin EGEN bedomning av
   anonymfiltret och sin egen granss - tva fyrverkerier med olika fwMin ar hela poangen med att
   det numera far finnas flera. */
const traffar=state.widgets.filter(x=>x.type==='templateGiftFireworks'&&!x.hidden&&fwSlapperIgenom(x,d));
if(!traffar.length)return false;
const combo=Math.max(1,Math.min(100,+(d.combo??d.repeatcount??d.count)||1));
/* Ingen omritning alls har langre — se kommentaren vid nagotTandes nedan. */
/* Inga writes till layouten. Forr stod har `traffar.forEach(w=>{w.fwCombo=combo});save();render();`
   — senaste gavans combo hamnade permanent i den sparade layouten, hela canvasen byggdes om per
   gava, och omritningen rev ner den animation som just spelade. Combon ar ett argument nu, aldrig
   ett falt pa widgeten; w.fwCombo tillhor editorns testknapp. Se docs/tech-debt.md punkt 3. */
let nagotTandes=false;
traffar.forEach(w=>{const e=document.querySelector(`[data-id="${w.id}"] .gift-fireworks-fx`);if(!e)return;/* textContent, aldrig innerHTML: anvandarnamnet kommer fran TikTok via molnet och ar inte
   betrott innehall. */
const tx=e.querySelector('.fw-text');if(tx)tx.textContent=String(w.fwText||'{user} skickade {gift}').split('{user}').join(d.username||d.name||'').split('{gift}').join(d.giftName||d.gift||'');fwSpela(w,e,combo,d.giftImage,d.profileImage||d.profileUrl);nagotTandes=true});
if(!nagotTandes)return false;
/* Ljudet spelas HAR, efter att bade filtren och widgetuppslaget passerat - ett ljud utan
   synligt fyrverkeri ar varre an inget ljud alls. En gang per omgang, inte en gang per widget:
   tre fyrverkerier ar fortfarande en gava.
   Samma monster som sound-alerts.js: new Audio(sokvag), currentTime 0, play(). play()
   returnerar ett lofte som webblasare AVVISAR nar autoplay ar blockerad, till exempel i
   editorn utan anvandargest. Det fangas tyst: animationen ar det som syns och far aldrig
   falla for att ljudet nekades. */
const ljudW=traffar.find(w=>w.fwSound!==false);
if(ljudW){try{const a=new Audio('assets/sounds/freesound/gift-fireworks.mp3');const bas=Math.min(1,Math.max(0,(ljudW.fwVolume??60)/100));
/* Duckas medan nagon talar (§14). Ett gavoljud hor ihop med sin effekt i TID och far darfor
   aldrig koas bakom en uppslasning - det sanker sig i stallet. Fail-open: saknas vyra-tal.js
   spelar det pa sin basvolym, precis som forr. */
if(!window.VyraTal?.duckaLjud?.(a,bas))a.volume=bas;
a.currentTime=0;const pr=a.play();if(pr&&pr.catch)pr.catch(()=>{})}catch(_){}}
return true};
document.addEventListener('click',event=>{if(!event.target.closest('[data-fw] button'))return;setTimeout(()=>{let w=state.widgets.filter(x=>x.type==='templateGiftFireworks').at(-1);if(!w)return;w.x=120;w.y=380;w.width=360;w.hidden=false;w.fwGiftImage=campaignGiftList()[0]?.file;selected=w.id;save();render()},0)});
/* Har lag en rensning som vid VARJE sidladdning behol bara den sist tillagda fyrverkeri-widgeten,
   raderade resten, tvingade den kvarvarande till x:120 y:380 width:360 och sparade. Tva foljder:
   anvandarens position skrevs over varje omladdning, och en andra fyrverkeri-widget forsvann tyst
   nasta gang sidan laddades. Det gjorde ocksa "olika effekt for olika gavor" omojligt i grunden.
   Kvar ar bara det som faktiskt behovdes: en gavobild at en widget som saknar en. Ingen radering,
   ingen flytt, och inget save() pa en ren laddning - en torrkorning ska inte skriva till state. */
{const utanBild=state.widgets.filter(w=>w.type==='templateGiftFireworks'&&(!w.fwGiftImage||w.fwGiftImage==='assets/gifts/events/0001_Rose.png'));if(utanBild.length){const fil=campaignGiftList()[0]?.file;if(fil){utanBild.forEach(w=>{w.fwGiftImage=fil});save()}}}
const comboBind=bind;bind=function(){comboBind();let w=liveWidget(selected,'templateGiftFireworks'),test=document.querySelector('#testFw');if(!w||!test||document.querySelector('#fwCombo'))return;let label=document.createElement('label');label.className='fw-combo-control';label.innerHTML=`Test-combo (1 gift = 1 raket)<input id="fwCombo" type="number" min="1" max="100" value="${w.fwCombo||1}">`;test.before(label);label.querySelector('input').onchange=e=>{w.fwCombo=Math.max(1,Math.min(100,+e.target.value||1));save()}};

const premiumFwWh=wh;wh=function(w){let html=premiumFwWh(w);if(w.type!=='templateGiftFireworks')return html;let gift=w.fwGiftImage||'assets/gifts/events/0001_Rose.png';return html.replace('class="gift-fireworks-fx"',`class="gift-fireworks-fx fw-motion-${w.fwMotion||'magnetic'} fw-intro-${fwIntroOf(w)} fw-outro-${fwOutroOf(w)}"`).replace(`--gift:${w.fwGiftSize||110}px`,`--gift:${w.fwGiftSize||110}px;--return-strength:${(w.fwReturn||80)/100}`).replace(`src="${gift}"`,`src="${gift}" onerror="this.src='assets/gifts/events/0001_Rose.png'"`)};
const premiumFwProps=props;props=function(){let html=premiumFwProps(),w=liveWidget(selected);if(!w||w.type!=='templateGiftFireworks')return html;let controls=`<div class="property-group fw-premium-motion"><h4>PREMIUM RÖRELSE</h4><label>Giftbild<input id="fwGiftImage" value="${w.fwGiftImage||'assets/gifts/events/0001_Rose.png'}"></label><label>Återformning<select id="fwMotion"><option value="magnetic">Magnetic Return</option><option value="spiral">Spiral Recall</option><option value="bloom">Crystal Bloom</option></select></label><label class="range-label">Återdragningsstyrka <b>${w.fwReturn||80}%</b><input id="fwReturn" type="range" min="40" max="100" value="${w.fwReturn||80}"></label><p>Explosionen samlas tillbaka och bygger fram gåvan igen.</p></div>`;return html.replace('<div class="property-group"><h4>POSITION & STORLEK</h4>',controls+'<div class="property-group"><h4>POSITION & STORLEK</h4>')};
const premiumFwBind=bind;bind=function(){premiumFwBind();let w=liveWidget(selected,'templateGiftFireworks');if(!w)return;let motion=document.querySelector('#fwMotion'),strength=document.querySelector('#fwReturn'),gift=document.querySelector('#fwGiftImage');if(motion){motion.value=w.fwMotion||'magnetic';motion.onchange=e=>{w.fwMotion=e.target.value;save();render()}}if(strength)strength.onchange=e=>{w.fwReturn=+e.target.value;save();render()};if(gift)gift.onchange=e=>{w.fwGiftImage=e.target.value;save();render()}};
const followerSpotlightEditBind=bind;bind=function(){followerSpotlightEditBind();let w=liveWidget(selected,'templateFollowerAlert'),panel=document.querySelector('.properties');if(!w||!panel)return;let position=[...panel.querySelectorAll('.property-group')].find(g=>g.querySelector('h4')?.textContent.includes('POSITION'));if(position&&!document.querySelector('#followScale')){let size=document.createElement('div');size.className='property-group follower-size-editor';size.innerHTML=`<h4>STORLEK</h4><label class="range-label">Hela widgeten <b>${Math.round((w.widgetScale||1)*100)}%</b><input id="followScale" type="range" min="0.35" max="2.5" step="0.05" value="${w.widgetScale||1}"></label>`;position.before(size);size.querySelector('input').oninput=e=>{w.widgetScale=+e.target.value;size.querySelector('b').textContent=Math.round(w.widgetScale*100)+'%';let box=document.querySelector(`[data-id="${w.id}"]`);if(box)box.style.zoom=w.widgetScale;save()}}/* Live-vagen, inte render() — se kommentaren i custom-widgets.js. x/y/width behaller sina
      billigare stilputtar (de ror inte ens canvasnoden); resten gar via vyraLivePatch. */
      let bindField=(id,key,num=false)=>{let e=document.querySelector(id);if(!e)return;const las=event=>num?+event.target.value:event.target.value;e.oninput=event=>{let v=las(event),box=document.querySelector(`[data-id="${w.id}"]`);if(box&&key==='width'){w[key]=v;box.style.width=w.width+'px'}else if(box&&key==='x'){w[key]=v;box.style.left=w.x+'px'}else if(box&&key==='y'){w[key]=v;box.style.top=w.y+'px'}else vyraLivePatch(w,e,key,v)};e.onchange=event=>{w[key]=las(event);save();vyraRenderKeepingPanel()}};bindField('#followLabel','followLabel');bindField('#followName','followName');bindField('#followMessage','followMessage');bindField('#followProfile','profileImage');bindField('#propX','x',true);bindField('#propY','y',true);bindField('#propWidth','width',true);bindField('#propLayer','layer',true);let box=document.querySelector(`[data-id="${w.id}"]`);if(box){box.querySelectorAll('img').forEach(img=>img.draggable=false);box.onpointerdown=e=>{if(e.target.closest('.resize-handle'))return;e.preventDefault();e.stopPropagation();let sx=e.clientX,sy=e.clientY,l=w.x||0,t=w.y||0;box.classList.add('is-dragging');box.setPointerCapture(e.pointerId);box.onpointermove=ev=>{let nx=Math.round(l+ev.clientX-sx),ny=Math.round(t+ev.clientY-sy);w.x=nx;w.y=ny;box.style.left=nx+'px';box.style.top=ny+'px';let ix=document.querySelector('#propX'),iy=document.querySelector('#propY');if(ix)ix.value=nx;if(iy)iy.value=ny};box.onpointerup=ev=>{box.releasePointerCapture?.(ev.pointerId);box.onpointermove=null;box.onpointerup=null;box.classList.remove('is-dragging');save()}}}};
let followerDragState=null;document.addEventListener('pointerdown',e=>{let box=e.target.closest?.('.follower-spotlight');if(!box||e.target.closest('.resize-handle'))return;let w=state.widgets.find(x=>x.id===box.dataset.id);if(!w)return;e.preventDefault();followerDragState={box,w,sx:e.clientX,sy:e.clientY,x:w.x||0,y:w.y||0};box.classList.add('is-dragging');box.setPointerCapture?.(e.pointerId)},true);document.addEventListener('pointermove',e=>{let d=followerDragState;if(!d)return;e.preventDefault();d.w.x=Math.round(d.x+e.clientX-d.sx);d.w.y=Math.round(d.y+e.clientY-d.sy);d.box.style.left=d.w.x+'px';d.box.style.top=d.w.y+'px';let ix=document.querySelector('#propX'),iy=document.querySelector('#propY');if(ix)ix.value=d.w.x;if(iy)iy.value=d.w.y},true);document.addEventListener('pointerup',()=>{if(!followerDragState)return;followerDragState.box.classList.remove('is-dragging');save();followerDragState=null},true);
render();
})();
