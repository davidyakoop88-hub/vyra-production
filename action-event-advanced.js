(() => {
  const KEY='vyra-action-event-v2';
  // Se action-event.js: i tokenlaget lever actionlistan bara i minnet.
  const readExtra=key=>{try{return window.VyraSessionState?.readExtra?.(key)??localStorage.getItem(key)}catch{return null}};
  const audiences=[['everyone','Alla'],['follower','Alla följare'],['subscriber','Alla prenumeranter'],['moderator','Alla moderatorer'],['topGifter','Top Gifter'],['specificUser','En specifik användare']];
  const triggers=[['join','Går med i liven'],['superfan','Super Fan går med i liven'],['firstActivity','Första aktiviteten'],['share','Delar liven'],['follow','Börjar följa'],['member','Prenumererar'],['likes','Skickar likes (taps)'],['chat','Skriver en kommentar'],['chatCommand','Skriver ett kommando'],['giftCoins','Skickar gåva med minsta coin-värde'],['gift','Skickar en specifik gåva'],['subscriberEmote','Skickar subscriber-emote'],['fanSticker','Skickar Fan Club-sticker'],['shopPurchase','Köper en produkt från TikTok Shop'],['knapp','Manuell knapp (Stream Deck)']];
  const opts=a=>a.map(x=>`<option value="${x.id}">${x.name}</option>`).join('');
  // GAVOVALJAREN (facit §3.2): bild + namn + coin-varde per rad.
  //
  // TVA KALLOR, INLARDA FORST. `assets/gifts/gifts-manifest.js` ar en fast lista med ENGELSKA namn
  // och inget coin-varde alls — men TikTok levererar katalogen pa streamerns eget sprak, och facit
  // visar just `Basketboll`, `Kor hart!`, `Morgonblommor` och `1 Coins`. En gava vi sett live bar
  // darfor bade ratt namn, ratt varde och ratt bild, och vinner alltid over manifestet.
  //
  // Serverns `gavokatalog` hade varit den ideala kallan, men den ar admin-only
  // (/api/admin/gavokatalog) och nas inte fran webblasaren. Samma slutsats som for emotes,
  // se bridge.js:553: fanga-nar-den-anvands ar den enda vagen harifran.
  function larddaGavor(){
    try{
      const lista=JSON.parse(localStorage.getItem('vyra-seen-gifts-v1')||'[]');
      return Array.isArray(lista)?lista.filter(g=>g&&g.name):[];
    }catch{return[]}
  }
  // RUMMETS EGEN KATALOG, hamtad av desktopappen via fetchAvailableGifts().
  //
  // Det ar ett RUMSANROP och kraver ingen inloggning, men det kraver en oppen anslutning — alltsa
  // finns den bara i VYRA Desktop. Webblaget kor vidare pa inlarning plus manifest, precis som forr.
  //
  // Katalogen cachas i localStorage sa valjaren har nagot att visa direkt vid nasta oppning, aven
  // innan hamtningen hunnit svara. Den skrivs ALDRIG in i `vyra-seen-gifts-v1`: den ar en katalog
  // over vad som GAR att skicka, inte ett pastaende om vad som HAR skickats. Blandas de ihop ljuger
  // den grona "inlard"-markeringen.
  const KATALOG_NYCKEL='vyra-gift-catalog-v1';
  function rumsKatalog(){
    try{
      const lista=JSON.parse(localStorage.getItem(KATALOG_NYCKEL)||'[]');
      return Array.isArray(lista)?lista.filter(g=>g&&g.name):[];
    }catch{return[]}
  }
  let hamtningPagar=false;
  function hamtaRumsKatalog(){
    // Samma vakt som obs-client.js: den lokala servern finns bara nar Studion serveras av appen.
    if(hamtningPagar||!['127.0.0.1','localhost'].includes(location.hostname))return;
    hamtningPagar=true;
    fetch('/api/gifts')
      .then(r=>r.json())
      .then(svar=>{
        if(!svar||!svar.ok||!Array.isArray(svar.gavor)||!svar.gavor.length)return;
        try{localStorage.setItem(KATALOG_NYCKEL,JSON.stringify(svar.gavor.slice(0,2000)))}catch{}
      })
      // 503 nar ingen anslutning finns ar ett VANTAT svar, inte ett fel att visa for streamern.
      .catch(()=>{})
      .finally(()=>{hamtningPagar=false});
  }
  // MOLNETS KATALOG (/api/gavor). Servern hämtar TikToks gåvolista var sjätte timme (gavobevakare.js),
  // så katalogen växer av sig själv när TikTok släpper nya gåvor — utan att någon behöver
  // skicka dem först, och även i webbläget där desktopappens /api/gifts inte finns. Gåvor som dykt
  // upp efter den första listan bär `ny:true` och visas överst med en NY-etikett.
  const MOLN_NYCKEL='vyra-gift-cloud-v1';
  function molnKatalog(){
    try{
      const lista=JSON.parse(localStorage.getItem(MOLN_NYCKEL)||'[]');
      return Array.isArray(lista)?lista.filter(g=>g&&g.name):[];
    }catch{return[]}
  }
  let molnHamtning=false;
  function hamtaMolnKatalog(){
    // Samma tålighet som en saknad desktopserver: utan fetch (äldre inbäddning, provriggen) ritas
    // väljaren på det som redan finns.
    if(molnHamtning||typeof fetch!=='function')return;
    molnHamtning=true;
    fetch('/api/gavor',{credentials:'same-origin'})
      .then(r=>r.ok?r.json():null)
      .then(svar=>{
        if(!svar||!svar.ok||!Array.isArray(svar.gavor)||!svar.gavor.length)return;
        const lista=svar.gavor.slice(0,6000).map(g=>({name:g.name,image:g.image,coins:g.coins||0,giftId:g.giftId,ny:!!g.ny}));
        try{localStorage.setItem(MOLN_NYCKEL,JSON.stringify(lista))}catch{}
      })
      .catch(()=>{})
      .finally(()=>{molnHamtning=false});
  }
  (window.VyraActionsExtras=window.VyraActionsExtras||[]).push(hamtaMolnKatalog);
  window.VyraMolnGavor={lista:molnKatalog,hamta:hamtaMolnKatalog};

  // Hamtningen startas nar Automatik-sidan ritas, inte vid filens laddning: en anslutning som inte
  // finns an hinner komma upp medan streamern jobbar med sina actions.
  (window.VyraActionsExtras=window.VyraActionsExtras||[]).push(hamtaRumsKatalog);

  // TRE KALLOR, I FALLANDE FORTROENDE:
  //   1. inlarda   — vi har SETT gavan i en sandning. Bar ratt namn, ratt varde, ratt bild.
  //   2. rummets   — TikToks egen katalog for det har rummet. Ratt namn och varde, inte sett an.
  //   3. manifest  — fast lista, ENGELSKA namn och inget coin-varde. Sista utvagen.
  function gavolistan(){
    // PRISET KOMMER FRÅN KATALOGEN när den har gåvan. En inlärd post kan bära combons summa (före
    // 2026-10-21 lärde fem rosor in Rose som 5 coins), men rummets och molnets katalog har TikToks
    // pris per gåva. Den inlärda posten behåller sitt namn och sin bild.
    // BILDEN KOMMER OCKSÅ FRÅN MOLNET när det har gåvan. En inlärd post bär bildadressen från
    // sändningen — en tidsbegränsad TikTok-länk som slutar fungera efter en tid — medan molnets
    // katalog serverar servern egen kopia (/api/gavor/bild/…, gavobevakare.js) som aldrig går ut.
    const pris=new Map(),bild=new Map();
    [...molnKatalog(),...rumsKatalog()].forEach(g=>{const n=String(g.name||'').toLowerCase(),c=Number(g.coins)||0;if(c>0&&!pris.has(n))pris.set(n,c)});
    molnKatalog().forEach(g=>{const n=String(g.name||'').toLowerCase();if(g.image&&!bild.has(n))bild.set(n,g.image)});
    const lardda=larddaGavor().map(g=>{const n=String(g.name).toLowerCase();return{name:g.name,image:bild.get(n)||g.image,coins:pris.get(n)||g.coins||0,giftId:String(g.giftId||''),lard:true}});
    const tagna=new Set(lardda.map(g=>g.name.toLowerCase()));
    const rummet=rumsKatalog()
      .filter(g=>!tagna.has(String(g.name||'').toLowerCase()))
      .map(g=>({name:g.name,image:g.image||'',coins:Number(g.coins)||0,giftId:String(g.giftId||g.id||''),lard:false,rum:true}));
    rummet.forEach(g=>tagna.add(g.name.toLowerCase()));
    // Nya gåvor först i molnkällan, så en gåva TikTok släppt i veckan syns utan att man söker.
    const moln=molnKatalog()
      .filter(g=>g.image&&!tagna.has(String(g.name||'').toLowerCase()))
      .map(g=>({name:g.name,image:g.image,coins:Number(g.coins)||0,giftId:String(g.giftId||''),lard:false,moln:true,ny:!!g.ny}))
      .sort((a,b)=>(b.ny?1:0)-(a.ny?1:0));
    moln.forEach(g=>tagna.add(g.name.toLowerCase()));
    const manifest=(window.VYRA_GIFTS||[])
      .filter(g=>!tagna.has(String(g.name||'').toLowerCase()))
      .map(g=>({name:g.name,image:g.file,coins:0,lard:false}));
    // En gåva som är NY i molnet lyfts överst även om den redan är inlärd eller finns i rummet.
    const nyaNamn=new Set(molnKatalog().filter(g=>g.ny).map(g=>String(g.name).toLowerCase()));
    const alla=[...lardda,...rummet,...moln,...manifest].map(g=>nyaNamn.has(g.name.toLowerCase())?{...g,ny:true}:g);
    return [...alla.filter(g=>g.ny),...alla.filter(g=>!g.ny)];
  }
  // GÅVANS ID FÖR ETT NAMN (David 2026-10-21: "sound på gift är inte aktiv"). TikTok skickar gåvans namn
  // på streamerns språk ("Ros"), men ett event kan ha sparats med ett annat namn för samma gåva — Sound
  // Alerts väljare erbjöd manifestets engelska namn ("Rose"). Ett namn jämfört med ett namn träffade då
  // aldrig. Id:t är detsamma på alla språk; alla tre katalogerna (inlärda, rummets, molnets) bär det.
  function gavoIdn(namn){
    const n=String(namn||'').trim().toLowerCase(),ut=new Set();
    if(!n)return ut;
    [...larddaGavor(),...rumsKatalog(),...molnKatalog()].forEach(g=>{const id=String(g.giftId||g.id||'');if(id&&String(g.name||'').trim().toLowerCase()===n)ut.add(id)});
    return ut;
  }
  // Träffar ett gåvo-event den här gåvan? Namnet först (som förut), sedan id:t — det som eventet sparade
  // (giftId) eller det som katalogen säger att det sparade namnet har.
  function gavanTraffar(e,payload,expected,actual){
    if(actual.toLowerCase()===expected.toLowerCase())return true;
    const id=String(payload.giftId||'');
    if(!id)return false;
    if(e.giftId&&String(e.giftId)===id)return true;
    return gavoIdn(expected).has(id);
  }
  // Samma katalog läses av Gift Campaigns gåvoval (vyra-kampanj-gavoval.js) och Sound Alerts: en lista, ett ställe.
  window.VyraGavokatalog={lista:gavolistan,idn:gavoIdn};
  function openTriggerGiftPicker(input){
    const gammal=document.querySelector('.gift-picker-modal');
    if(gammal)gammal.remove();
    const alla=gavolistan();
    const antalLarda=alla.filter(g=>g.lard).length;
    const antalRum=alla.filter(g=>g.rum).length;
    const antalNya=alla.filter(g=>g.ny).length;
    const modal=document.createElement('div');
    modal.className='gift-picker-modal';
    modal.innerHTML='<div><header><b>VÄLJ GÅVA</b><button type="button" class="ae-ik ae-ik--stang" title="Stäng" aria-label="Stäng">'
      +'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>'
      +'<input placeholder="Sök bland '+alla.length+' gåvor...">'
      +(antalNya?'<small class="gp-hint gp-nya">'+antalNya+(antalNya===1?' ny gåva':' nya gåvor')+' från TikTok — visas först.</small>':'')
      +'<small class="gp-hint">'+(antalRum?antalRum+' gåvor kommer från TikToks katalog för ditt rum'+(antalLarda?' och '+antalLarda+' är inlärda från dina sändningar':'')+' — med riktiga namn och coin-värden.':antalLarda?antalLarda+' gåvor är inlärda från dina egna sändningar och visar riktigt namn och coin-värde.':'Inga gåvor inlärda än. När du sänder lär VYRA sig namn, bild och coin-värde från TikTok — på ditt språk.')+'</small>'
      +'<section></section></div>';
    document.body.append(modal);
    const section=modal.querySelector('section');
    const rita=lista=>{
      section.innerHTML=lista.slice(0,200).map(g=>
        '<button type="button" data-name="'+VyraSafe.text(g.name)+'"'+(g.lard?' class="lard'+(g.ny?' ny':'')+'"':g.rum?' class="rum'+(g.ny?' ny':'')+'"':g.ny?' class="ny"':'')+'>'
        +(g.ny?'<em class="gp-ny">NY</em>':'')
        +(g.image?'<img loading="lazy" src="'+VyraSafe.url(g.image)+'">':'<i>🎁</i>')
        +'<span>'+VyraSafe.text(g.name)+'</span>'
        // Ett varde vi inte kan visas som "okant", inte som 0 — noll coins ar ett pastaende om
        // gavan, "okant" ar ett pastaende om oss. Skillnaden syns nar man valjer.
        +'<small>'+(g.coins?g.coins+' coins':'okänt värde')+'</small></button>').join('');
      section.querySelectorAll('button').forEach(b=>b.onclick=()=>{input.value=b.dataset.name;modal.remove()});
    };
    rita(alla);
    modal.querySelector('header button').onclick=()=>modal.remove();
    modal.onclick=e=>{if(e.target===modal)modal.remove()};
    modal.querySelector('input').oninput=e=>{
      const q=e.target.value.trim().toLowerCase();
      rita(q?alla.filter(g=>g.name.toLowerCase().includes(q)):alla);
    };
    modal.querySelector('input').focus();
  }
  function seenUsers(){try{return JSON.parse(localStorage.getItem('vyra-seen-users-v1')||'[]')}catch{return[]}}
  function renderUserPickerHtml(){
    const seen=seenUsers();
    return seen.length?`<div class="ae-user-grid">${seen.map(u=>`<button type="button" class="ae-user-choice" data-username="${VyraSafe.text(u.username)}" title="${VyraSafe.text(u.username)}">${u.profileImage?`<img loading="lazy" src="${VyraSafe.url(u.profileImage)}">`:'<i>👤</i>'}<span>${VyraSafe.text(u.name||u.username)}</span></button>`).join('')}</div>`:'<small>Inga användare har setts live än — skriv ett användarnamn manuellt.</small>';
  }
  function wireUserPicker(root){
    root.querySelectorAll('.ae-user-choice').forEach(btn=>btn.onclick=()=>{
      root.querySelector('#aeSpecificUser').value=btn.dataset.username;
      root.querySelectorAll('.ae-user-choice').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  }
  function seenEmotes(){try{return JSON.parse(localStorage.getItem('vyra-seen-emotes-v1')||'[]')}catch{return[]}}
  function renderEmotePickerHtml(){
    const seen=seenEmotes();
    const grid=seen.length?`<div class="ae-emote-grid">${seen.map(e=>`<button type="button" class="ae-emote-choice" data-id="${VyraSafe.text(e.id)}" title="${VyraSafe.text(e.id)}">${e.image?`<img loading="lazy" src="${VyraSafe.url(e.image)}">`:'❓'}</button>`).join('')}</div>`:'<small>Inga emotes har setts live än — lämna tomt för alla subscriber-emotes, eller skriv ett emote-ID manuellt.</small>';
    return `<label>Emote (valfritt)<input id="aeAdvancedValue" placeholder="Lämna tomt för alla emotes"></label>${grid}`;
  }
  function wireEmotePicker(d){
    d.querySelectorAll('.ae-emote-choice').forEach(btn=>btn.onclick=()=>{
      d.querySelector('#aeAdvancedValue').value=btn.dataset.id;
      d.querySelectorAll('.ae-emote-choice').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  }
  // ── EVENTPANELEN SOM LEVERANTOR (facit §2) ──────────────────────────────────────────────────
  //
  // Panelen injicerades forr i en fardig modal och sparade genom att rakna events fore klicket och
  // sedan polla localStorage var 100:e ms i fyra sekunder for att klistra sina falt pa
  // `state.events.at(-1)`. Det var det FJARDE exemplaret av det monstret, och det gjorde
  // redigering omojlig: "den sista i listan" ar fel post sa fort man inte skapar en ny.
  // Nu ritar den sin egen lucka och lamnar falten i `collect`. Se eventregistret i action-event.js.
  function seenStickers(){try{return JSON.parse(localStorage.getItem('vyra-seen-stickers-v1')||'[]')}catch{return[]}}
  // TVA LISTOR, INTE EN. Stickervaljaren visade forr subscriber-emotes — bada las ur samma nyckel.
  // Facit har dem som tva skilda val med varsin bildlista, och emoteScene 2 (FANS_CLUB) ar det enda
  // som skiljer dem at i TikToks data. Se live-client.js recordSeenEmote().
  function renderBildvaljare(typ,valt){
    const seen=typ==='fanSticker'?seenStickers():seenEmotes();
    const etikett=typ==='fanSticker'?'Fan Club-sticker':'Subscriber-emote';
    const tomText=typ==='fanSticker'
      ? 'Inga Fan Club-stickers har setts live an. Lamna tomt for alla stickers, eller skriv ett id manuellt.'
      : 'Inga emotes har setts live an. Lamna tomt for alla emotes, eller skriv ett emote-id manuellt.';
    const grid=seen.length
      ? '<div class="ae-emote-grid">'+seen.map(e=>'<button type="button" class="ae-emote-choice'+(e.id===valt?' selected':'')+'" data-id="'+VyraSafe.text(e.id)+'" title="#'+VyraSafe.text(e.id)+'">'+(e.image?'<img loading="lazy" src="'+VyraSafe.url(e.image)+'">':'&#10067;')+'</button>').join('')+'</div>'
      : '<small>'+tomText+'</small>';
    return '<label>'+etikett+' (valfritt)<input id="aeAdvancedValue" placeholder="Lamna tomt for alla" value="'+VyraSafe.text(valt||'')+'"></label>'+grid;
  }
  function wireBildvaljare(d){
    d.querySelectorAll('.ae-emote-choice').forEach(btn=>btn.onclick=()=>{
      d.querySelector('#aeAdvancedValue').value=btn.dataset.id;
      d.querySelectorAll('.ae-emote-choice').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  }
  // Facit §2.3, uppmatt bild for bild: teamnivan star INTE pa alla triggrar. Den syns pa Join,
  // Forsta aktiviteten och Kommando — inte pa likes, chatt, gava eller specifik gava. Poangnivan
  // star BARA pa Kommando. Ett falt som inte kan paverka nagot ar brus, och varre an brus: det ser
  // ut som ett krav streamern maste forsta.
  const VISAR_TEAMNIVA=new Set(['join','superfan','firstActivity','chatCommand']);
  const VISAR_POANGNIVA=new Set(['chatCommand']);
  const attr=v=>VyraSafe.text(String(v==null?'':v));

  // Beskrivning under varje "Vem får trigga"-kort. Ren text om vad valet redan gör i allowed().
  const AUDIENCE_TEXT={everyone:'Alla kan trigga eventet.',follower:'Endast följare kan trigga.',subscriber:'Endast prenumeranter kan trigga.',moderator:'Endast moderatorer kan trigga.',topGifter:'Endast den som är Top Gifter kan trigga.',specificUser:'Endast en användare du anger.'};
  // CTRL-FLERVAL BLIR KRYSSRUTOR, MEN <select multiple> ÄR KVAR SOM SANNING.
  //
  // collect() läser `selectedOptions`, tests/event-bakatkompatibilitet.test.js läser
  // `option:checked`, och gamla events med bara `actionId` lyfts in via `selected` ovan. Därför
  // ritas listan som synliga kryssrutor som skriver rakt in i varje <option>.selected, och själva
  // selecten göms (och tas ur tabbordningen). De två listorna är oberoende — samma Action kan stå
  // i båda, precis som förut.
  function flervalsSpegel(select,rubrikId){
    if(!select||select.dataset.spegel)return;
    select.dataset.spegel='1';
    select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    const lista=document.createElement('div');
    lista.className='ae-flerval';
    lista.setAttribute('role','group');
    lista.setAttribute('aria-labelledby',rubrikId);
    const opts=[...select.options];
    lista.innerHTML=opts.length
      ? opts.map((o,i)=>'<label class="ae-check ae-flerval-val"><input type="checkbox" data-index="'+i+'"'+(o.selected?' checked':'')+'><span>'+attr(o.textContent)+'</span></label>').join('')
      : '<p class="ae-flerval-tom">Inga Actions ännu.</p>';
    const rakna=document.createElement('p');
    rakna.className='ae-flerval-antal';
    rakna.setAttribute('aria-live','polite');
    const visaAntal=()=>{const n=opts.filter(o=>o.selected).length;rakna.textContent=n?(n===1?'1 vald':n+' valda'):'Ingen vald'};
    lista.addEventListener('change',ev=>{
      const ruta=ev.target.closest('input[data-index]');
      if(!ruta)return;
      opts[+ruta.dataset.index].selected=ruta.checked;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      visaAntal();
    });
    visaAntal();
    select.after(lista,rakna);
  }

  function mountEventPanel(modal,befintligt,state){
    const vard=modal&&modal.querySelector('.ae-event-slot');
    if(!vard||vard.querySelector('.ae-event-advanced'))return;
    const e=befintligt||{};
    const valdAudience=e.audience||'everyone';
    const valdTrigger=e.advancedTrigger||e.trigger||'join';
    // GAMLA EVENT HAR `actionId`, INTE `allActionIds`.
    //
    // Fram till 2026-09-16 sparade den enkla eventmodalen EN action i `actionId`; listorna
    // `allActionIds`/`randomActionIds` fanns bara om man gatt via den avancerade panelen.
    // Uppmatt: ett sadant event oppnades med BADA listorna tomma, och sparningen stoppades da av
    // "Valj minst en Action" — kunden tvingades valja om en koppling som redan fanns.
    // Fallbacken lyfter darfor upp `actionId` i "Kor alla dessa Actions", vilket ar precis vad
    // eventet redan gjorde.
    const allaValda=(e.allActionIds&&e.allActionIds.length)?e.allActionIds:(e.actionId?[e.actionId]:[]);
    const vald=(lista,id)=>(lista||[]).includes(id)?' selected':'';
    const actionOpts=lista=>state.actions.map(a=>'<option value="'+a.id+'"'+vald(lista,a.id)+'>'+attr(a.name)+'</option>').join('');
    const storlek=Math.min(6,Math.max(2,state.actions.length||2));
    // LILA DESIGNEN (2026-10-19). Samma radiogrupper och samma <select multiple> som förut — det är
    // dem collect() läser, så sparformatet rör sig inte. Radioknapparna ritas som valkort, och de två
    // listorna får var sin kryssruteslista ovanpå (flervalsSpegel nedan) i stället för Ctrl-klick.
    const rubrik=(nr,text,id)=>'<h4 class="ae-sek-rubrik" id="'+id+'"><span class="ae-sek-nr" aria-hidden="true">'+nr+'</span>'+text+'</h4>';
    const p=document.createElement('div');
    p.className='ae-event-advanced';
    p.innerHTML=
      '<section class="ae-sek">'+rubrik(1,'Vem får trigga eventet?','aeAudienceRubrik')+'<div class="ae-radio-list ae-valkort-lista" role="radiogroup" aria-labelledby="aeAudienceRubrik">'
      + audiences.map(a=>'<label class="ae-check ae-valkort"><input type="radio" name="aeAudience" value="'+a[0]+'"'+(a[0]===valdAudience?' checked':'')+'><span class="ae-valkort-text"><b>'+a[1]+'</b><small>'+(AUDIENCE_TEXT[a[0]]||'')+'</small></span></label>').join('')
      + '</div><div id="aeSpecificUserWrap"'+(valdAudience==='specificUser'?'':' hidden')+'><label>Användarnamn<input id="aeSpecificUser" placeholder="@användarnamn" value="'+attr(e.specificUser||'')+'"></label>'+renderUserPickerHtml()+'</div>'
      + '<label class="ae-check ae-exclude-anon"><input id="aeExcludeAnonymous" type="checkbox"'+(e.excludeAnonymous?' checked':'')+'> Exkludera anonyma tittare</label></section>'
      + '<section class="ae-sek">'+rubrik(2,'Vad ska trigga eventet?','aeTriggerRubrik')+'<div class="ae-radio-list ae-trigger-lista" role="radiogroup" aria-labelledby="aeTriggerRubrik">'
      + triggers.map(t=>'<label class="ae-check ae-valchip"><input type="radio" name="aeAdvancedTrigger" value="'+t[0]+'"'+(t[0]===valdTrigger?' checked':'')+'><span>'+t[1]+'</span></label>').join('')
      + '</div><div id="aeTriggerDetails" class="ae-trigger-details"></div></section>'
      + '<section class="ae-sek">'+rubrik(3,'Nivåkrav och Actions','aeNivaRubrik')
      + '<label class="ae-inline" id="aeTeamLevelRad">Nödvändig TikTok-teamnivå<input id="aeTeamLevel" type="number" min="0" max="50" value="'+(Number(e.teamLevel)||0)+'"></label>'
      + '<small class="ae-hjalp" id="aeTeamLevelHjalp">Ange 0 för att tillåta personer som inte är med i teamet.</small>'
      + '<label class="ae-inline" id="aePointsLevelRad">Nödvändig poängnivå<input id="aeMinPointsLevel" type="number" min="0" value="'+(Number(e.minPointsLevel)||0)+'"></label>'
      + '<small class="ae-hjalp" id="aePointsLevelHjalp">Ange 0 för att tillåta vilken poängnivå som helst.</small>'
      + '<label class="ae-inline">Poängkostnad<input id="aePointsCost" type="number" min="0" value="'+(Number(e.pointsCost)||0)+'"></label>'
      + '<small class="ae-hjalp">Dras från användarens poäng när eventet triggas. 0 = gratis.</small>'
      + '<div class="ae-flerval-falt"><span class="ae-falt-etikett" id="aeAllActionsRubrik">Kör alla dessa Actions</span><select id="aeAllActions" multiple size="'+storlek+'">'+actionOpts(allaValda)+'</select><small>Kryssa i en eller flera. Alla körs när eventet triggas.</small></div>'
      + '<div class="ae-flerval-falt"><span class="ae-falt-etikett" id="aeRandomActionsRubrik">Kör en av dessa Actions slumpmässigt</span><select id="aeRandomActions" multiple size="'+storlek+'">'+actionOpts(e.randomActionIds)+'</select><small>Kryssa i en eller flera. En av dem väljs slumpmässigt.</small></div></section>';
    vard.append(p);
    flervalsSpegel(p.querySelector('#aeAllActions'),'aeAllActionsRubrik');
    flervalsSpegel(p.querySelector('#aeRandomActions'),'aeRandomActionsRubrik');

    const sparatVarde=String(e.triggerValue||e.condition||'');
    const sync=()=>{
      const v=p.querySelector('[name=aeAdvancedTrigger]:checked').value;
      const d=p.querySelector('#aeTriggerDetails');
      d.innerHTML=
        v==='chatCommand'?'<label>Vad är kommandot?<input id="aeAdvancedValue" placeholder="!kommando" value="'+attr(sparatVarde)+'"></label><small class="ae-hjalp">Kommandon bör börja med ! eller /</small>':
        v==='giftCoins'?'<label class="ae-inline">Minsta coin-värde<input id="aeAdvancedValue" type="number" min="1" value="'+(Number(sparatVarde)||1)+'"></label>':
        v==='likes'?'<label class="ae-inline">Minsta antal likes<input id="aeAdvancedValue" type="number" min="1" value="'+(Number(sparatVarde)||15)+'"></label>':
        v==='gift'?'<label>Välj gåva<div class="ae-picker-row"><input id="aeAdvancedValue" placeholder="Exempel: Rose" value="'+attr(sparatVarde)+'"><button type="button" id="aeChooseGift">🎁 Välj gåva</button></div></label>':
        v==='chat'?'<label>Textfilter (valfritt)<input id="aeAdvancedValue" placeholder="Lämna tomt för alla kommentarer" value="'+attr(sparatVarde)+'"></label>':
        v==='shopPurchase'?'<label>Produktnamnet innehåller (valfritt)<input id="aeAdvancedValue" placeholder="Produktnamn" value="'+attr(sparatVarde)+'"></label><small class="ae-hjalp">Ange en del av produktnamnet för att bara trigga på den produkten. Lämnas fältet tomt triggar eventet på alla produkter.</small>':
        (v==='subscriberEmote'||v==='fanSticker')?renderBildvaljare(v,sparatVarde):'';
      if(v==='gift'){const b=d.querySelector('#aeChooseGift');if(b)b.onclick=()=>openTriggerGiftPicker(d.querySelector('#aeAdvancedValue'))}
      if(v==='subscriberEmote'||v==='fanSticker')wireBildvaljare(d);
      const visa=(id,pa)=>{const el=p.querySelector(id);if(el)el.hidden=!pa};
      visa('#aeTeamLevelRad',VISAR_TEAMNIVA.has(v));visa('#aeTeamLevelHjalp',VISAR_TEAMNIVA.has(v));
      visa('#aePointsLevelRad',VISAR_POANGNIVA.has(v));visa('#aePointsLevelHjalp',VISAR_POANGNIVA.has(v));
    };
    p.querySelectorAll('[name=aeAdvancedTrigger]').forEach(x=>x.onchange=sync);
    p.querySelectorAll('[name=aeAudience]').forEach(x=>x.onchange=()=>{p.querySelector('#aeSpecificUserWrap').hidden=p.querySelector('[name=aeAudience]:checked').value!=='specificUser'});
    wireUserPicker(p);
    if(e.specificUser)p.querySelectorAll('.ae-user-choice').forEach(b=>{if(b.dataset.username===e.specificUser)b.classList.add('selected')});
    sync();
  }

  (window.VyraEventFields=window.VyraEventFields||{_providers:[],register(x){if(x)this._providers.push(x)}}).register({
    mount:mountEventPanel,
    validate(modal){
      const p=modal.querySelector('.ae-event-advanced');
      if(!p)return null;
      const audience=p.querySelector('[name=aeAudience]:checked').value;
      if(audience==='specificUser'&&!p.querySelector('#aeSpecificUser').value.trim())return 'Ange ett användarnamn';
      const trigger=p.querySelector('[name=aeAdvancedTrigger]:checked').value;
      const v=p.querySelector('#aeAdvancedValue');
      if(trigger==='chatCommand'&&!(v&&v.value.trim()))return 'Skriv kommandot';
      if(trigger==='gift'&&!(v&&v.value.trim()))return 'Välj en gåva';
      return null;
    },
    collect(modal){
      const p=modal.querySelector('.ae-event-advanced');
      if(!p)return {};
      const valda=q=>[...p.querySelector(q).selectedOptions].map(o=>o.value);
      const varde=(p.querySelector('#aeAdvancedValue')||{}).value;
      const rent=String(varde==null?'':varde).trim();
      return {
        audience:p.querySelector('[name=aeAudience]:checked').value,
        specificUser:p.querySelector('#aeSpecificUser').value.trim().replace(/^@/,''),
        excludeAnonymous:p.querySelector('#aeExcludeAnonymous').checked,
        advancedTrigger:p.querySelector('[name=aeAdvancedTrigger]:checked').value,
        triggerValue:rent,
        // Villkoret speglas till `condition`: reservvagens handleEvent i action-event.js laser det
        // faltet, och sound-alerts.js skriver det. Utan spegling tappar ett event sitt villkor sa
        // fort den har filen inte ar laddad.
        condition:rent,
        teamLevel:+p.querySelector('#aeTeamLevel').value||0,
        pointsCost:+p.querySelector('#aePointsCost').value||0,
        minPointsLevel:+p.querySelector('#aeMinPointsLevel').value||0,
        allActionIds:valda('#aeAllActions'),
        randomActionIds:valda('#aeRandomActions')
      };
    }
  });

  function allowed(e,p={}){if((p.teamLevel||0)<(e.teamLevel||0))return false;if(e.excludeAnonymous&&p.isAnonymous)return false;if(e.minPointsLevel&&window.VyraPoints&&(window.VyraPoints.getLevel(p.username||p.user)?.level||0)<e.minPointsLevel)return false;if(!e.audience||e.audience==='everyone')return true;if(e.audience==='specificUser')return String(p.username||p.user||'').replace(/^@/,'').toLowerCase()===String(e.specificUser||'').toLowerCase();return e.audience===p.role||(e.audience==='follower'&&p.isFollower)||(e.audience==='subscriber'&&p.isSubscriber)||(e.audience==='moderator'&&p.isModerator)||(e.audience==='topGifter'&&p.isTopGifter)}
  // Points cost is charged here, not in allowed() — allowed() only checks whether this event
  // COULD ever fire for this person; the trigger still has to match (right command text, right
  // gift, etc.) below before we know it's genuinely happening, so charging any earlier would
  // dock points for a near-miss (e.g. typing a similar but wrong command).
  //
  // Samma resonemang ett steg till (§13 i docs/tech-debt.md): en trigger som matchar är ännu inte
  // en uppspelning. Cooldown, cooldown per anvandare, raderad action och offline scen avgors alla
  // i runAction EFTERAT — och avdraget lag forr fore dem. Uppmatt: cooldown 30 s, kostnad 100,
  // fem gavor gav 1 korning och 500 spenderade poang. Darfor fragar vi kanKora() forst, och drar
  // bara nar minst en action faktiskt kommer att spela. Kostnaden hor till EVENTET, sa den dras
  // en gang aven nar tre actions kor.
  //
  // kanKora ar ren: den skriver inget och startar ingen cooldown, sa fragan kan stallas i forvag
  // utan att paverka svaret. Saknas den (en flik med en aldre cachad action-event.js) faller vi
  // tillbaka pa den enda grind vi kan se harifran — att actionen over huvud taget finns.
  // HUVUDBOKEN OVER BETALDA UPPSPELNINGAR (§15c i docs/tech-debt.md).
  //
  // Kon i overlayn kan strypa en uppspelning som redan ar betald. Uppmatt: fyra gavor a 100 mot
  // en scen med maxQueue 1 gav 400 dragna poang, en spelning och tva strypta — 200 poang for
  // ingenting. Det var den enda av §13:s grindar som inte gick att flytta fore avdraget, eftersom
  // den lever i en annan flik bakom en BroadcastChannel.
  //
  // TVA SAKER SOM AR LATTA ATT BYGGA FEL HAR:
  //
  //   KOSTNADEN LAMNAR ALDRIG MASTERN. Overlayn sager bara "runId X strops"; belopp och mottagare
  //   slas upp har. En overlay kan darfor inte begara en godtycklig aterbetalning.
  //
  //   ATERBETALNING SKER PER KOP, INTE PER KORNING. Ett event betalar EN gang men kan skicka ut
  //   flera actions. Spelade en av tre fick tittaren det hen betalade for — pengarna kommer bara
  //   tillbaka nar ALLA strops.
  //
  // Huvudboken ligger i minnet, inte i localStorage. Dor mastern mitt i flodet uteblir
  // aterbetalningen; det felar mot "ingen aterbetalning" i stallet for "dubbel", vilket ar ratt
  // hall att fela at.
  const KOP_LIVSLANGD=30000;
  const kopForRun=new Map();       // runId -> kopId
  const kopen=new Map();           // kopId -> {kvar, username, belopp, klar}
  // RAPPORTEN KAN KOMMA FORE REGISTRERINGEN. runAction skickar ut synkront: overlayns execute()
  // hinner saga "kon ar full" innan map() ens har lamnat ifran sig sitt sista runId. En
  // huvudbok som bara tittar bakat hade darfor missat precis de fall den byggdes for. Tidiga
  // rapporter parkeras har och hamtas hem av registreringen — ordningen mellan de tva far inte
  // spela nagon roll.
  const tidigaStrypta=new Set();
  let kopRaknare=0;
  function registreraKop(runIds,username,belopp){
    if(!belopp)return;
    // Betalt men ingenting utskickat: det kan inte hanta sa lange kanKora och runAction kor i
    // samma tick, men om det nagonsin gor det ar pengarna forlorade utan den har raden.
    if(!runIds.length)return void window.VyraPoints?.refund?.(username,belopp);
    const kopId='kop-'+(++kopRaknare);
    kopen.set(kopId,{kvar:runIds.length,username,belopp,klar:false});
    runIds.forEach(r=>kopForRun.set(r,kopId));
    setTimeout(()=>{runIds.forEach(r=>kopForRun.delete(r));kopen.delete(kopId)},KOP_LIVSLANGD);
    runIds.forEach(r=>{if(tidigaStrypta.delete(r))strypt(r)});   // hamta hem det som redan strops
  }
  function strypt(runId){
    // INGEN MASTER-VAKT HAR, OCH DET AR MED FLIT. Planen hade en: "bara mastern betalar tillbaka".
    // Mutationsprovet visade att den var bade overflodig och skadlig. Overflodig for att
    // huvudboken redan ar vakten — bara den flik som DROG poangen kanner igen ett runId, och bara
    // mastern drar. Skadlig for att en flik som drog och sedan TAPPADE platsen (en niva 2-overlay
    // nar studion oppnas) hade slutat betala tillbaka mitt i flodet, och tittaren forlorat pengar
    // pa att streamern startade Studion.
    //
    // Den som tog betalt ar den som betalar tillbaka. Inget annat villkor behovs.
    if(!runId)return;
    const kopId=kopForRun.get(runId);
    if(!kopId){tidigaStrypta.add(runId);setTimeout(()=>tidigaStrypta.delete(runId),KOP_LIVSLANGD);return}
    kopForRun.delete(runId);                // samma runId far bara raknas en gang
    const kop=kopen.get(kopId);
    if(!kop||kop.klar||--kop.kvar>0)return; // nagon annan action i samma kop spelade an
    kop.klar=true;
    window.VyraPoints?.refund?.(kop.username,kop.belopp);
  }
  document.addEventListener('vyra:action-dropped',e=>strypt(e.detail?.runId));
  addEventListener('storage',e=>{if(e.key==='vyra-action-refund'&&e.newValue)try{strypt(JSON.parse(e.newValue).runId)}catch{}});

  // En forare for automationen (§15). Varje oppen flik tar emot samma live-event, sa utan den har
  // graden betalar och spelar tre flikar samma gava tre ganger. Slavarna tiger inte om
  // uppspelningen - de far den via localStorage['vyra-action-run'], som action-runtime.js lyssnar
  // pa. __test slipper igenom: replay-knappen i live-control.js och Testa-knapparna ar uttryckliga
  // handgrepp i studion, inte live-trafik. Saknas modulen kor vi som forr (fail-open) - hellre ett
  // dubbelavdrag an en svart overlay.
  function handleEvent(trigger,payload={}){if(payload.__test!==true&&window.VyraAutomationMaster&&!window.VyraAutomationMaster.farKora())return;const s=JSON.parse(readExtra(KEY)||'{"actions":[],"events":[]}');s.events.filter(e=>e.enabled&&(e.advancedTrigger||e.trigger)===trigger&&allowed(e,payload)).forEach(e=>{const expected=String(e.triggerValue||e.condition||'').trim(),actual=String(payload.value??payload.gift??payload.command??'').trim();if(expected){if((e.advancedTrigger||e.trigger)==='giftCoins'&&Number(payload.coins??payload.value??0)<Number(expected))return;if((e.advancedTrigger||e.trigger)==='likes'&&Number(payload.likecount??payload.value??0)<Number(expected))return;if((e.advancedTrigger||e.trigger)==='gift'&&!gavanTraffar(e,payload,expected,actual))return;if((e.advancedTrigger||e.trigger)==='chatCommand'&&actual.toLowerCase()!==expected.toLowerCase())return;if(!['giftCoins','likes','gift','chatCommand'].includes(e.advancedTrigger||e.trigger)&&!actual.toLowerCase().includes(expected.toLowerCase()))return}const ids=e.allActionIds?.length?e.allActionIds:e.randomActionIds?.length?[e.randomActionIds[Math.floor(Math.random()*e.randomActionIds.length)]]:[e.actionId];const kanKora=id=>{const a=(s.actions||[]).find(x=>x.id===id);return window.VyraActionEvent?.kanKora?window.VyraActionEvent.kanKora(a,payload).ok:!!a};const korbara=ids.filter(kanKora);if(!korbara.length)return;if(e.pointsCost&&window.VyraPoints&&!window.VyraPoints.spend(payload.username||payload.user,e.pointsCost))return;const runIds=korbara.map(id=>window.VyraActionEvent?.runAction((s.actions||[]).find(a=>a.id===id),payload)).filter(r=>typeof r==='string');if(e.pointsCost)registreraKop(runIds,payload.username||payload.user,Number(e.pointsCost)||0)})}
  window.VyraAdvancedEvents={handleEvent};
})();
