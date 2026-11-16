// STARTPAKET — snabbstart med ett klick i Action & Event (2026-11-16).
//
// En ny streamer möter två tomma listor och en trestegsförklaring. Ett startpaket lägger in
// färdiga Actions OCH Events som redan är kopplade till varandra, så att det första som händer i
// liven faktiskt syns. Allt som läggs in är vanliga poster: de går att redigera, stänga av och
// radera precis som de man skapat själv, och körloggen visar dem som vilka andra som helst.
//
// BARA FUNKTIONER SOM ALLTID FINNS. Paketen använder alert och gåvans egen animation — inga
// mediefiler, ingen OBS-anslutning, ingen chattbot. En mall som kräver något användaren inte har
// satt upp än vore en tom knapp, och det är just den upplevelsen snabbstarten ska ta bort.
//
// SKRIVNINGEN går samma väg som spara-knapparna i action-event.js: läs hela tillståndet, lägg
// till, skriv med VyraSessionState.writeActive och vänta på `ok` innan något kallas tillagt.
// Varje post märks med `startpaket` så att ett paket inte läggs in två gånger av misstag.
(function(){
  'use strict';
  const KEY='vyra-action-event-v2';
  if(window.VYRA_OVERLAY_SCENE||/[?&]overlay=1/.test(location.search))return;

  // Scen 1, mitten — samma förval som Action-dialogen ger (action-scenes.js).
  const SCEN={number:1,placement:'center',x:160,y:690,width:760,layer:10};
  const alert=(sv,en)=>({types:['alert'],text:{sv,en}});

  // Varje paket: namn, en mening om vad det gör, och par av [action, event].
  const PAKET=[
    {
      id:'gavor',ikon:'🎁',namn:'Tacka för gåvor',
      om:'En tack-alert för varje gåva, och TikToks egen animation när någon skickar 500 coins eller mer.',
      delar:[
        {namn:{sv:'Tack för gåvan',en:'Thanks for the gift'},...alert('Tack {username} för {giftname}!','Thank you {username} for the {giftname}!'),duration:5,
          trigger:'giftCoins',varde:'1'},
        {namn:{sv:'Gåvans animation (500+ coins)',en:'Gift animation (500+ coins)'},types:['giftVideo'],duration:10,prioritet:'hog',
          trigger:'giftCoins',varde:'500'}
      ]
    },
    {
      id:'valkommen',ikon:'👋',namn:'Välkomna nya tittare',
      om:'Hälsar nya följare och tackar den som delar liven. Samma tittare tackas för delning högst var femte minut.',
      delar:[
        {namn:{sv:'Ny följare',en:'New follower'},...alert('Välkommen {username}! Tack för följet.','Welcome {username}! Thanks for the follow.'),duration:5,
          trigger:'follow',varde:''},
        {namn:{sv:'Tack för delningen',en:'Thanks for sharing'},...alert('Tack för delningen, {username}!','Thanks for sharing, {username}!'),duration:5,userCooldown:300,
          trigger:'share',varde:''}
      ]
    },
    {
      id:'chatt',ikon:'❗',namn:'Chattkommandon',
      om:'!hype och !hej i chatten visar en alert. Väntetider hindrar att en tittare spammar dem.',
      delar:[
        {namn:{sv:'!hype',en:'!hype'},...alert('{username} drog igång hypen!','{username} started the hype!'),duration:5,cooldown:30,userCooldown:120,
          trigger:'chatCommand',varde:'!hype'},
        {namn:{sv:'!hej',en:'!hi'},...alert('Hej {username}!','Hi {username}!'),duration:4,userCooldown:300,
          trigger:'chatCommand',varde:{sv:'!hej',en:'!hi'}}
      ]
    }
  ];

  const sprak=()=>{try{return window.VyraLang?.current?.()==='en'?'en':'sv'}catch{return'sv'}};
  const las=()=>window.VyraActionEvent?.read?.()||{actions:[],events:[]};
  const harPaket=(state,id)=>state.actions.some(a=>a.startpaket===id);
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // Bygger posterna för ett paket. Ren funktion — provas utan DOM.
  function bygg(paket,lang,nu){
    const actions=[],events=[];
    paket.delar.forEach((d,i)=>{
      const aid=`a${nu}${i}`,eid=`e${nu}${i}`;
      const varde=typeof d.varde==='object'?d.varde[lang]:d.varde;
      const config={addPointsAmount:10,removePointsAmount:10};
      if(d.types.includes('alert'))Object.assign(config,{alertText:d.text[lang],alertColor:'#ffffff',alertStyle:'premium',inheritBrandKit:true});
      actions.push({id:aid,name:d.namn[lang],types:[...d.types],config,duration:d.duration||5,cooldown:d.cooldown||0,userCooldown:d.userCooldown||0,
        volume:100,fade:true,repeatCombo:false,skipOnNext:false,prioritet:d.prioritet||'',scene:{...SCEN},startpaket:paket.id});
      // Samma form som eventdialogen sparar (action-event-advanced.js collect + action-event.js
      // saveEvent): `trigger` speglar `advancedTrigger` och `condition` speglar `triggerValue`.
      events.push({id:eid,enabled:true,audience:'everyone',specificUser:'',excludeAnonymous:false,
        advancedTrigger:d.trigger,trigger:d.trigger,triggerValue:varde,condition:varde,
        teamLevel:0,pointsCost:0,minPointsLevel:0,allActionIds:[aid],randomActionIds:[],actionId:aid,startpaket:paket.id});
    });
    return{actions,events};
  }

  async function laggTill(id){
    const paket=PAKET.find(p=>p.id===id);
    if(!paket)return{ok:false,reason:'okant-paket'};
    const state=las();
    if(harPaket(state,id))return{ok:false,reason:'finns-redan'};
    const nya=bygg(paket,sprak(),Date.now());
    const nytt={...state,actions:[...state.actions,...nya.actions],events:[...state.events,...nya.events]};
    let ut;
    try{ut=await window.VyraSessionState.writeActive(KEY,JSON.stringify(nytt))}catch(err){console.warn('[VYRA] startpaket kunde inte sparas',err)}
    if(!ut?.ok)return{ok:false,reason:ut?.reason||'write-failed'};
    return{ok:true,actions:nya.actions.length,events:nya.events.length};
  }

  function kortHtml(state){
    return PAKET.map(p=>{
      const finns=harPaket(state,p.id);
      return`<li class="ae-paket${finns?' is-tillagt':''}"><span class="ae-paket-ikon" aria-hidden="true">${p.ikon}</span>
        <div class="ae-paket-text"><b>${esc(p.namn)}</b><p>${esc(p.om)}</p><small>${p.delar.length} actions · ${p.delar.length} events</small></div>
        <button type="button" data-paket="${p.id}"${finns?' disabled':''}>${finns?'Tillagt':'Lägg till'}</button></li>`;
    }).join('');
  }

  function oppna(){
    const vard=document.querySelector('#aeModal');
    if(!vard)return;
    vard.innerHTML=`<div class="ae-modal ae-modal-paket"><div>
      <header><h3>Startpaket</h3><button type="button" class="ae-ik ae-ik--stang" data-stang-paket title="Stäng" aria-label="Stäng"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
      <p class="ae-paket-intro">Färdiga Actions och Events som redan är kopplade. Allt hamnar på Scen 1 och går att ändra efteråt.</p>
      <ul class="ae-paket-lista">${kortHtml(las())}</ul>
      <footer><button type="button" class="ae-avbryt" data-stang-paket>Stäng</button></footer>
    </div></div>`;
    const stang=()=>{vard.innerHTML=''};
    vard.querySelectorAll('[data-stang-paket]').forEach(b=>b.onclick=stang);
    vard.querySelector('.ae-modal-paket').onclick=e=>{if(e.target.classList.contains('ae-modal-paket'))stang()};
    vard.querySelectorAll('[data-paket]').forEach(b=>b.onclick=async()=>{
      if(b.disabled)return;
      b.disabled=true;b.textContent='Lägger till…';
      const svar=await laggTill(b.dataset.paket);
      if(!svar.ok){
        b.disabled=svar.reason==='finns-redan';b.textContent=svar.reason==='finns-redan'?'Tillagt':'Lägg till';
        if(svar.reason!=='finns-redan')window.toast?.('Startpaketet kunde inte sparas');
        return;
      }
      window.toast?.(`Startpaketet är tillagt — ${svar.actions} actions och ${svar.events} events`);
      // Sidan ritas om (listorna och räknarna ska visa de nya posterna) och dialogen öppnas igen,
      // så att man kan lägga till ett paket till utan att leta upp knappen.
      window.VyraActionEvent?.refresh?.();
      oppna();
    });
  }

  function render(){
    // Bredvid "Skapa Action", inte i hjälterutan: vyra-hig.css tömde hjälterutan på knappar med
    // flit — knapparna står vid listan de fyller.
    const skapa=document.querySelector('.ae-actions-card #newAeAction');
    if(skapa&&!skapa.parentElement.querySelector('[data-oppna-paket]')){
      const b=document.createElement('button');
      b.type='button';b.className='ae-paket-knapp';b.dataset.oppnaPaket='';b.textContent='Startpaket';
      b.onclick=oppna;skapa.after(b);
    }
    // Tom lista: snabbstarten är det naturliga första steget, så den visas där blicken redan är —
    // under "Skapa din första Action" (vyra-tomma-handlingar.js), som förblir den primära knappen.
    const tom=document.querySelector('.ae-actions-card .ae-empty-state');
    if(tom&&!tom.querySelector('[data-oppna-paket]')){
      const b=document.createElement('button');
      b.type='button';b.dataset.oppnaPaket='';b.textContent='Börja med ett startpaket';
      b.onclick=oppna;tom.append(b);
    }
  }

  window.VyraStartpaket={PAKET,bygg,laggTill,oppna};
  (window.VyraActionsExtras=window.VyraActionsExtras||[]).push(render);
})();
