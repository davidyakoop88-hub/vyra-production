(()=>{
  // KÖRLOGGEN — "varför hände ingenting?"
  //
  // Den vanligaste frågan från en streamer under en LIVE är inte hur något ställs in utan varför en
  // gåva inte gav någon effekt. Svaret fanns redan i koden, utspritt över tre ställen som alla sa nej
  // tyst: handleEvent i action-event-advanced.js (eventet avstängt, automatiken pausad, fel
  // behörighet, fel gåva/kommando, för lite poäng), kanKora i action-event.js (väntetid, väntetid per
  // tittare, scenen offline, raderad action) och kön i overlayn i action-runtime.js (kön full).
  // Loggen samlar de tre till en rad per händelse, med orsaken i klartext och en knapp som spelar
  // upp den igen.
  //
  // VEM SKRIVER. Bara den flik som faktiskt kör automationen (mastern, se action-master.js) når hit,
  // eftersom handleEvent returnerar innan loggen öppnas i alla andra flikar. Raden hamnar alltså
  // exakt en gång, oavsett hur många scenlänkar som är öppna. Kön-full-svaret kommer från en annan
  // flik (overlayn) och märks in i efterhand via runId, samma två vägar som återbetalningen tar.
  //
  // VAR DEN BOR. Rå localStorage under `vyra-action-logg`, så att studion ser loggen även när en
  // overlay är master. Den är registrerad i EPHEMERAL_KEYS i session-state.js: den synkas inte,
  // backas inte upp och torkas vid kontobyte — raderna innehåller tittarnas användarnamn.
  //
  // DEN FÅR ALDRIG STOPPA NÅGOT. Varje skrivning ligger i try/catch och loggen är ett tillägg: saknas
  // filen anropar handleEvent `window.VyraActionLogg?.` och kör precis som förr.
  const NYCKEL='vyra-action-logg';
  const MAX=60;
  // Bara det som behövs för att visa raden och spela upp den igen. Hela payloaden kan bära allt från
  // rå bryggdata till långa listor, och den här nyckeln skrivs på varje gåva.
  const BEHALL=['username','user','name','nickname','gift','giftname','giftName','giftId','coins','diamonds','count','combo','repeatcount','value','command','comment','likecount','profileImage','profilePictureUrl','giftImage','giftVideo','emote','role','isFollower','isSubscriber','isModerator','isTopGifter','teamLevel'];

  const las=()=>{try{const v=JSON.parse(localStorage.getItem(NYCKEL)||'[]');return Array.isArray(v)?v:[]}catch{return[]}};
  const skriv=lista=>{try{localStorage.setItem(NYCKEL,JSON.stringify(lista.slice(0,MAX)))}catch{}};
  const trimma=p=>{const ut={};for(const k of BEHALL){const v=p?.[k];if(v==null||v==='')continue;ut[k]=typeof v==='string'?v.slice(0,300):v}return ut};
  const vem=p=>String(p?.username||p?.user||p?.nickname||p?.name||'').replace(/^@/,'');
  const vad=p=>String(p?.gift??p?.giftname??p?.giftName??p?.command??p?.comment??p?.value??'');

  let raknare=0;
  function borja(trigger,etikett,payload={},extra={}){
    const post={id:'logg-'+Date.now()+'-'+(++raknare),at:Date.now(),trigger,etikett:String(etikett||trigger),
      anvandare:vem(payload),vad:vad(payload),test:payload.__test===true,omspelning:!!extra.omspelning,payload:trimma(payload),events:[]};
    return{
      event(e){
        const rad={id:e?.id||'',villkor:String(e?.triggerValue||e?.condition||''),utfall:'',actions:[]};
        post.events.push(rad);
        return{
          utfall(u){rad.utfall=u},
          action(a,id,skal,scen,kvar,runId){if(runId&&!skal&&tidiga.has(runId))skal='ko-full';rad.actions.push({id:a?.id||id||'',namn:String(a?.name||'Raderad action'),skal:skal||'',scen:Number(scen)||1,kvar:Math.max(0,Math.ceil((Number(kvar)||0)/1000)),runId:runId||''})}
        };
      },
      klar(){
        if(!post.events.length)return;
        const lista=las();lista.unshift(post);skriv(lista);
        rita();
      },
      post
    };
  }

  // Kön i overlayn strypte en uppspelning som redan var utskickad. Raden visade "kördes"; nu vet vi
  // bättre. Båda vägarna, precis som återbetalningen i action-event-advanced.js: ett storage-event
  // når aldrig sin egen skribent, och vanligast är EN flik som både skickar och stryper.
  //
  // RAPPORTEN KAN KOMMA FÖRE RADEN. I en ensam overlay är kön i samma flik och svarar synkront —
  // inne i runAction, alltså innan handleEvent hunnit anropa klar(). Samma sak som huvudboken i
  // action-event-advanced.js löser med tidigaStrypta: tidiga besked parkeras och hämtas av
  // action() när raden byggs.
  const tidiga=new Set();
  function markeraStrypt(runId){
    if(!runId)return;
    tidiga.add(runId);setTimeout(()=>tidiga.delete(runId),30000);
    const lista=las();let andrad=false;
    for(const post of lista)for(const rad of post.events||[])for(const a of rad.actions||[])
      if(a.runId===runId&&a.skal!=='ko-full'){a.skal='ko-full';andrad=true;if(!rad.actions.some(x=>!x.skal))rad.utfall='stoppad'}
    if(andrad){skriv(lista);rita()}
  }
  document.addEventListener('vyra:action-dropped',e=>markeraStrypt(e.detail?.runId));
  addEventListener('storage',e=>{
    if(e.key==='vyra-action-refund'&&e.newValue){try{markeraStrypt(JSON.parse(e.newValue).runId)}catch{}}
    if(e.key===NYCKEL)rita();
  });

  // SPELA IGEN kör samma actions en gång till, som Testa-knappen gör: förbi pausen och mastern men
  // INTE förbi väntetiden eller en offline scen — de är verkligheten, och den nya raden säger då
  // ärligt varför. Inga poäng dras; streamern trycker, inte tittaren.
  function spelaIgen(id){
    const post=las().find(p=>p.id===id);
    const ae=window.VyraActionEvent;
    if(!post||!ae?.runAction)return false;
    const state=ae.read?.()||{actions:[]};
    const payload={...post.payload,__test:true};
    const ny=borja(post.trigger,post.etikett,payload,{omspelning:true});
    const ids=[...new Set(post.events.flatMap(r=>r.actions.map(a=>a.id)).filter(Boolean))];
    if(!ids.length)return false;
    const rad=ny.event({id:'',triggerValue:''});
    let nagon=false;
    ids.forEach(aid=>{
      const a=(state.actions||[]).find(x=>x.id===aid);
      const dom=ae.kanKora?ae.kanKora(a,payload):{ok:!!a,skal:a?'':'saknas',scen:1,kvar:0};
      if(!dom.ok)return rad.action(a,aid,dom.skal,dom.scen,dom.kvar,'');
      const runId=ae.runAction(a,payload);
      if(typeof runId==='string')nagon=true;
      rad.action(a,aid,typeof runId==='string'?'':'stoppad',dom.scen,0,typeof runId==='string'?runId:'');
    });
    rad.utfall(nagon?'kordes':'stoppad');
    ny.klar();
    return nagon;
  }
  function rensa(){try{localStorage.removeItem(NYCKEL)}catch{}rita()}

  // ---- visning ------------------------------------------------------------------------------------

  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const SKAL={
    'cooldown':(a)=>`väntetid för alla${a.kvar?`, ${a.kvar} s kvar`:''}`,
    'cooldown-anvandare':(a)=>`väntetid för den här tittaren${a.kvar?`, ${a.kvar} s kvar`:''}`,
    'scen-offline':(a)=>`Scen ${a.scen} är offline — öppna scenlänken i OBS`,
    'ko-full':(a)=>`kön var full på Scen ${a.scen}`,
    'saknas':()=>'actionen finns inte längre',
    'stoppad':()=>'stoppades innan den nådde overlayn'
  };
  function eventText(rad){
    switch(rad.utfall){
      case'avstangt':return'Eventet är avstängt';
      case'pausad':return'Automatiken är pausad';
      case'behorighet':return'Tittaren hade inte behörighet för eventet';
      case'villkor':return rad.villkor?`Matchade inte villkoret "${rad.villkor}"`:'Matchade inte villkoret';
      case'poang':return'Tittaren hade inte tillräckligt med poäng';
      default:return'';
    }
  }
  const NIVA={kordes:'ok',stoppad:'nej',avstangt:'av',pausad:'av',behorighet:'av',villkor:'av',poang:'nej'};
  function postStatus(post){
    if(post.events.some(r=>r.actions.some(a=>!a.skal)))return'ok';
    if(post.events.some(r=>NIVA[r.utfall]==='nej'))return'nej';
    return'av';
  }
  const tid=ms=>{try{return new Date(ms).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}catch{return''}};
  function radHtml(post){
    const status=postStatus(post);
    // Ett event för en ANNAN gåva är inte en orsak, det är brus: en streamer med tjugo gåvo-events
    // skulle annars få nitton "matchade inte" under varje gåva. Villkorsraderna visas därför bara
    // när INGET event kom förbi villkoret, och då som en enda rad.
    const traffade=post.events.filter(r=>r.utfall!=='villkor');
    const villkor=[...new Set(post.events.filter(r=>r.utfall==='villkor').map(r=>r.villkor).filter(Boolean))];
    const ingenTraff=!traffade.length?`<li class="ae-logg-av">Inget event väntade på ${post.vad?`"${esc(post.vad)}"`:'det här'}${villkor.length?` — eventen väntar på ${villkor.slice(0,6).map(v=>`"${esc(v)}"`).join(', ')}${villkor.length>6?' …':''}`:''}</li>`:'';
    const rader=ingenTraff||traffade.map(r=>{
      const text=eventText(r);
      if(text)return`<li class="ae-logg-${NIVA[r.utfall]||'av'}">${esc(text)}</li>`;
      return r.actions.map(a=>a.skal
        ?`<li class="ae-logg-nej"><b>${esc(a.namn)}</b> stoppades: ${esc((SKAL[a.skal]||(()=>a.skal))(a))}</li>`
        :`<li class="ae-logg-ok"><b>${esc(a.namn)}</b> kördes på Scen ${a.scen}</li>`).join('');
    }).join('');
    const kanSpelas=post.events.some(r=>r.actions.length);
    const markning=post.omspelning?'<span class="ae-logg-tagg">omspelning</span>':post.test?'<span class="ae-logg-tagg">test</span>':'';
    return`<li class="ae-logg-post ae-logg-post--${status}" data-logg-post="${esc(post.id)}">
      <div class="ae-logg-huvud"><i aria-hidden="true"></i><time>${esc(tid(post.at))}</time>
        <span class="ae-logg-vad"><b>${esc(post.anvandare||'Okänd')}</b> · ${esc(post.etikett)}${post.vad?`: ${esc(post.vad)}`:''}</span>${markning}
        ${kanSpelas?`<button type="button" class="ae-logg-igen" data-logg-igen="${esc(post.id)}">Spela igen</button>`:''}</div>
      <ul class="ae-logg-rader">${rader}</ul></li>`;
  }
  function rita(){
    const sektion=document.querySelector('.ae-logg');
    if(!sektion)return;
    const lista=las(),mal=sektion.querySelector('[data-logg-lista]');
    sektion.querySelector('[data-logg-antal]').textContent=lista.length?String(lista.length):'';
    mal.innerHTML=lista.length?lista.map(radHtml).join(''):'<li class="ae-logg-tom">Inget har hänt ännu. Skicka ett test i Event Simulator under Avancerat, eller vänta på första gåvan.</li>';
    mal.querySelectorAll('[data-logg-igen]').forEach(b=>b.onclick=()=>{if(!spelaIgen(b.dataset.loggIgen))window.toast?.('Kunde inte spela upp igen — se den nya raden')});
  }
  function render(){
    if(document.querySelector('.ae-logg'))return rita();
    const ankare=document.querySelector('.ae-work-columns');
    if(!ankare)return;
    const sektion=document.createElement('section');
    sektion.className='card ae-logg';
    sektion.innerHTML=`<header><div><span class="ae-section-number">03</span><h3>Körlogg</h3><p>Vad som hände, och varför något inte hände.</p></div><span class="ae-count" data-logg-antal></span></header>
      <div class="ae-actions-toolbar"><button type="button" data-logg-rensa>Töm loggen</button><small>Visar de senaste ${MAX} händelserna som ett event lyssnar på.</small></div>
      <ol class="ae-logg-lista" data-logg-lista></ol>`;
    // INNE i kolumnytan, som tredje kort: Actions- och Events-kortens stil är skopad under
    // .ae-work-columns, och loggen ska se ut som en del av samma flöde — 01, 02, 03.
    ankare.append(sektion);
    sektion.querySelector('[data-logg-rensa]').onclick=rensa;
    rita();
  }

  window.VyraActionLogg={borja,markeraStrypt,spelaIgen,rensa,lista:las,NYCKEL};
  // Overlayn har ingen studio att rita i, men den kan vara master och måste då kunna skriva.
  if(window.VYRA_OVERLAY_SCENE||/[?&]overlay=1/.test(location.search))return;
  (window.VyraActionsExtras=window.VyraActionsExtras||[]).push(render);
})();
