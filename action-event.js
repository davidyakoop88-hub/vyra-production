(() => {
  const KEY='vyra-action-event-v2';
  // Tokenlaget (?access=) skriver ingen nyckel — extras projiceras bara i minnet. En direkt
  // localStorage-lasning ger darfor noll actions i en OBS browser source, och scenen spelar
  // ingenting hur ratt lanken an ar. session-state.js ager bade minnet och localStorage.
  const readExtra=key=>{try{return window.VyraSessionState?.readExtra?.(key)??localStorage.getItem(key)}catch{return null}};
  /* Har lag `actionRunChannel`, en BroadcastChannel('vyra-action-run') som postades till men som
     INGEN prenumererade pa. action-runtime.js:139 lyssnar pa document-eventet `vyra:action` och pa
     localStorage-nyckeln `vyra-action-run` — aldrig pa kanalen. Skrivbar dod kod sedan den skrevs.
     Nyckeln med samma namn lever kvar och bar hela trafiken; det ar den vyra-state-sync.js listar
     som flyktig signal. Behovs kanalen igen dedupar execute() pa runId, sa den kan kopplas in utan
     risk for dubbel uppspelning. Se docs/tech-debt.md §15. */
  // ORDNINGEN ÄR FACITS, inte vår. Avskriven ur docs/referens/tikfinity-actions-facit.md §2.2.
  // De tio första står i exakt den ordning TikFinity visar dem; `overlay` och `spotify` är VYRA:s
  // egna och står därför EFTER facits lista, inte inblandade i den.
  //
  // `addPoints`/`removePoints` låg förr här, som funktion 13 och 14. Facit har dem inte i listan
  // alls utan i ett eget block under den ("Should the trigger user receive a reward...", §2.4).
  // De är flyttade dit — men de skrivs fortfarande in i `action.types`, för action-runtime.js:113
  // läser dem därifrån. Flyttas de ur types slutar varje sparad poäng-action att fungera.
  const actionTypes=[
    ['animation','Visa animation'],
    ['picture','Visa bild/GIF'],
    ['audio','Spela ljud'],
    ['video','Spela videofil'],
    ['alert','Visa alert (användare + text)'],
    ['tts','Läs text (TTS)'],
    ['chat','Skicka chattmeddelande'],
    ['obsScene','Byt OBS-scen'],
    ['obsSource','Aktivera OBS-källa'],
    ['webhook','Anropa webhook'],
    ['overlay','Visa overlay/widget'],
    ['spotify','Spela Spotify'],
    // Facits funktion 14 och 17. De kraver inget tredjepartsprogram — VYRA har bade mal
    // (goal-client.js) och timers (action-timers.js) som egna funktioner, sa de gar att styra.
    // De ovriga fem i facit gor det inte: Minecraft och Simulate Keystrokes kan bara kora i
    // desktopappen, och Third-Party, Voicemod och Streamer.bot kraver program pa kundens dator.
    ['goal','Styr ett mal'],
    ['timer','Styr en timer']
  ];
  // Kolumnerna Animation/Bild/Ljud/Video i listan (facit §1) är en AVLÄSNING av `types`, inte egna
  // fält. Fyra av tolv funktioner har egen kolumn; resten syns bara i Beskrivning.
  const listColumnTypes=[['animation','Animation'],['picture','Bild'],['audio','Ljud'],['video','Video']];

  // FÄLTREGISTRET — en enda ägare av spara-knappen.
  //
  // Förr satte action-event.js `#saveAeAction.onclick`, action-media.js SKREV ÖVER den med sin
  // egen async-variant, och action-options.js + action-scenes.js pollade localStorage var 100:e ms
  // i två sekunder för att i efterhand klistra sina fält på `state.actions.at(-1)`. Tre plåster på
  // samma sår: den som laddades sist vann, och en långsam skrivning tappade fälten tyst.
  //
  // Nu registrerar varje fil i stället en leverantör här. actionModal() ritar deras fält i sina
  // luckor, save() frågar dem allihop i tur och ordning, och det finns EN skrivning.
  // ORDNINGSOBEROENDE, och det är inte försiktighet utan en uppmätt nödvändighet.
  // media.js:1185 lägger in varje action-fil med `document.body.append(script)`. Dynamiskt skapade
  // script laddar ASYNC: ordningen i listan är önskan, inte löfte. UPPMÄTT 2026-09-16 i riktig
  // Chrome, samma commit två körningar i rad: i den ena hade bild-, ljud- och videoluckorna
  // innehåll, i den andra var alla tre TOMMA — action-media.js hann före action-event.js, hittade
  // inget `window.VyraActionFields`, och `?.register()` svalde det utan ett ljud.
  // Därför skapar den fil som laddar FÖRST listan, och den som kommer sedan återanvänder den.
  const fieldProviders=window.VyraActionFields?._providers||[];
  window.VyraActionFields={
    // {slots:['picture','video'], render(slotEl,slotName,action), validate(modal,types)->felsträng|null,
    //  collect(modal,types)->Promise<partial> | partial}
    _providers:fieldProviders,
    register(provider){if(provider)fieldProviders.push(provider)}
  };
  // Genererad beskrivning (facit §1): verbet plus vad som valts. Aldrig ett inmatningsfält.
  const describeType={
    animation:c=>`Visa animation ${c.animationName||c.widget||''}`.trim(),
    picture:(c,a)=>`Visa bild ${a.pictureMedia?.name||''}`.trim(),
    audio:(c,a)=>`Spela ljud ${a.audioMedia?.name||''}`.trim(),
    video:(c,a)=>`Spela video ${a.videoMedia?.name||''}`.trim(),
    alert:c=>c.alertText?`Visa alert "${c.alertText}"`:'Visa alert',
    tts:c=>c.ttsText?`Läs upp "${c.ttsText}"`:'Läs upp text',
    chat:c=>c.chatText?`Skicka "${c.chatText}"`:'Skicka chattmeddelande',
    obsScene:c=>c.obsScene?`Byt till scen ${c.obsScene}`:'Byt OBS-scen',
    obsSource:c=>c.obsSource?`Aktivera källa ${c.obsSource}`:'Aktivera OBS-källa',
    webhook:c=>c.webhook?`Anropa ${c.webhook}`:'Anropa webhook',
    overlay:c=>c.widget?`Visa overlay ${c.widget}`:'Visa overlay',
    spotify:c=>c.spotify?`Spela ${c.spotify}`:'Spela Spotify',
    goal:c=>c.goalAction==='reset'?'Nollställ målet':c.goalAction==='target'?`Sätt målet till ${c.goalValue||0}`:c.goalAction==='baseline'?`Sätt startvärdet till ${c.goalValue||0}`:'Styr ett mål',
    timer:c=>c.timerAction==='start'?'Starta timern':c.timerAction==='stop'?'Pausa timern':c.timerAction==='reset'?'Nollställ timern':'Styr en timer',
    addPoints:c=>`Ge ${c.addPointsAmount||10} poäng`,
    removePoints:c=>`Dra ${c.removePointsAmount||10} poäng`
  };
  function describeAction(action){
    const config=action?.config||{};
    const parts=(action?.types||[]).map(type=>describeType[type]?.(config,action)||type).filter(Boolean);
    return parts.join(' · ')||'Ingen funktion vald';
  }
  function actionPointsLabel(action){
    const config=action?.config||{},types=action?.types||[];
    if(types.includes('addPoints'))return `+${config.addPointsAmount||10}`;
    if(types.includes('removePoints'))return `−${config.removePointsAmount||10}`;
    return '0';
  }
  const triggerNames={gift:'Gåva mottagen',giftCombo:'Gift-combo',follow:'Ny följare',member:'Ny medlem',likes:'Likes uppnådda',share:'Delning',level:'Level up',battle:'Battle-event',chat:'Chattkommando',join:'Går med i liven',firstActivity:'Första aktiviteten',chatCommand:'Chattkommando',giftCoins:'Minsta coin-värde',subscriberEmote:'Subscriber-emote',fanSticker:'Fan Club-sticker',shopPurchase:'TikTok Shop-köp',knapp:'Manuell knapp'};

  // EVENTREGISTRET — samma lösning som fältregistret ovan, av samma skäl.
  // action-event-advanced.js sparade förr genom att räkna events före klicket och sedan läsa
  // localStorage var 100:e ms i fyra sekunder för att klistra sina fält på `state.events.at(-1)`.
  // Det var det FJÄRDE exemplaret av det mönstret i den här mappen, och det gjorde redigering av
  // ett event omöjlig: "den sista i listan" är fel post så fort man inte skapar en ny.
  const eventProviders=window.VyraEventFields?._providers||[];
  window.VyraEventFields={
    // {mount(modal,befintligtEvent,state), validate(modal)->felsträng|null, collect(modal)->partial}
    _providers:eventProviders,
    register(provider){if(provider)eventProviders.push(provider)}
  };

  // Facit §1: Trigger-kolumnen är en MENING med ikon — `🪙 Gåva 30+ coins` — inte ett rått
  // triggernamn. Tröskelvärdet står i texten, annars ser tio rader likadana ut.
  // IKONERNA MASTE FINNAS I TYPSNITTET. Uppmatt i Chrome 2026-09-16: 🪙 (mynt, U+1FA99) och
  // ⌨️ (tangentbord) ritades som TOMMA RUTOR — bada ar sena tillskott som systemets
  // emoji-typsnitt saknar. En ikon som blir en ruta ar samre an ingen ikon alls: den ser ut som
  // trasig data. Valda glyfer ar darfor gamla och brett stodda.
  const triggerIkon={join:'👋',firstActivity:'✨',share:'🔁',follow:'➕',member:'⭐',likes:'❤️',chat:'💬',chatCommand:'❗',giftCoins:'💰',gift:'🎁',subscriberEmote:'😀',fanSticker:'🏅',shopPurchase:'🛒',knapp:'🔘',giftCombo:'🎁',level:'⬆️',battle:'⚔️'};
  function triggerMening(event){
    const typ=event?.advancedTrigger||event?.trigger||'';
    const v=String(event?.triggerValue||event?.condition||'').trim();
    const text=
      typ==='giftCoins'?`Gåva ${v||1}+ coins`:
      typ==='likes'?`${v||1}+ likes`:
      typ==='gift'?(v?`Gåva: ${v}`:'Valfri gåva'):
      typ==='chatCommand'?(v?`Kommando ${v}`:'Valfritt kommando'):
      typ==='chat'?(v?`Kommentar med "${v}"`:'Valfri kommentar'):
      typ==='subscriberEmote'?(v?`Emote ${v}`:'Valfri subscriber-emote'):
      typ==='fanSticker'?(v?`Sticker ${v}`:'Valfri Fan Club-sticker'):
      typ==='shopPurchase'?(v?`Produkt med "${v}"`:'Valfri produkt'):
      triggerNames[typ]||typ||'Okänd trigger';
    return `${triggerIkon[typ]||'◇'} ${text}`;
  }
  // Facit visar `Any` — inte tom text — när alla får trigga. Skillnaden betyder något: tomt läses
  // som "något saknas", `Alla` som "avsiktligt öppet".
  const audienceNamn={everyone:'Alla',follower:'Alla följare',subscriber:'Alla prenumeranter',moderator:'Alla moderatorer',topGifter:'Top Gifter'};
  function eventAnvandare(event){
    if(event?.audience==='specificUser')return event.specificUser?`@${event.specificUser}`:'Specifik användare';
    return audienceNamn[event?.audience]||'Alla';
  }
  const persistentWidgetMatchers=[
    /\btop likes?\b/,
    /\btop likers?\b/,
    /\btop coins?\b/,
    /\btop gift(?:ers?|er)\b/,
    /\btop points?\b/,
    /\btop streak\b/,
    /\bheart me goal\b/,
    /\blike goal\b/,
    /\bfollower(?:s)? goal\b/,
    /\bgift campaigns?\b/
  ];
  const systemTestActionIds=new Set(['test-toplikes','test-fireworks']);
  function isSystemTestAction(action){
    const id=String(action?.id||'').trim();
    const name=String(action?.name||'').trim();
    return systemTestActionIds.has(id)||/^__test/i.test(name)||/^stabilitetstest\b/i.test(name);
  }
  function cleanupLegacyTestState(state){
    const removedActionIds=new Set((state.actions||[]).filter(isSystemTestAction).map(action=>action.id));
    if(!removedActionIds.size)return{state,changed:false};
    const actions=(state.actions||[]).filter(action=>!removedActionIds.has(action.id));
    const events=(state.events||[]).map(event=>{
      const allActionIds=(event.allActionIds||[]).filter(id=>!removedActionIds.has(id));
      const randomActionIds=(event.randomActionIds||[]).filter(id=>!removedActionIds.has(id));
      const actionId=removedActionIds.has(event.actionId)?'':event.actionId;
      return {...event,allActionIds,randomActionIds,actionId};
    }).filter(event=>event.actionId||event.allActionIds?.length||event.randomActionIds?.length);
    return{state:{...state,actions,events},changed:true};
  }
  // EN NORMALISERING, INTE FEMTON GUARDS. `read()` returnerade tillståndet precis som det låg, och
  // ett tillstånd utan `actions` (en ofullständig molnnyttolast, en äldre version, en fil som bara
  // bär `timers`) fällde hela Automatik-vyn med "Cannot read properties of undefined (reading
  // 'length')". Varje läsare nedströms hade behövt sin egen guard — och den som glömdes hade varit
  // en vit sida. Formen garanteras här i stället, en gång.
  const normalisera=o=>({...o,actions:Array.isArray(o?.actions)?o.actions:[],events:Array.isArray(o?.events)?o.events:[]});
  const read=()=>{try{const parsed=normalisera(JSON.parse(readExtra(KEY)||'{}'));const cleaned=cleanupLegacyTestState(parsed);if(cleaned.changed)window.VyraSessionState.writeActive(KEY,JSON.stringify(cleaned.state));return cleaned.state}catch(e){console.warn('[VYRA] Ogiltig action-state',e);return{actions:[],events:[]}}};
  const write=state=>window.VyraSessionState.writeActive(KEY,JSON.stringify(state));
  function formatActionName(action){
    const raw=String(action?.name||'').trim();
    const widget=String(action?.config?.widget||'').trim();
    if(raw==='__testPersistentTopLikes'||/persistent\s*top\s*likes/i.test(normalizeWidgetName(raw))){
      return 'Test · Top Likes';
    }
    if(raw==='__testTransientFireworks'||/transient\s*fireworks/i.test(normalizeWidgetName(raw))){
      return 'Test · Gift Fireworks';
    }
    if(/^__test/i.test(raw)&&widget){
      return `Test · ${widget}`;
    }
    return raw||'Action saknas';
  }
  const name=(state,id)=>formatActionName(state.actions.find(a=>a.id===id));
  const eventActionNames=(state,event)=>{const ids=event.allActionIds?.length?event.allActionIds:event.randomActionIds?.length?event.randomActionIds:[event.actionId];return ids.map(id=>name(state,id)).join(', ')};
  function normalizeWidgetName(name=''){
    return String(name||'')
      .replace(/([a-z])([A-Z])/g,'$1 $2')
      .replace(/[_·-]+/g,' ')
      .replace(/\s+/g,' ')
      .trim()
      .toLowerCase();
  }
  const isPersistentWidget=name=>persistentWidgetMatchers.some(pattern=>pattern.test(normalizeWidgetName(name)));
  function actionWidgetName(action){
    return String(action?.config?.widget||action?.name||'').trim();
  }
  function isPersistentAction(action){
    const types=action?.types||[];
    if(!types.some(type=>type==='overlay'||type==='animation'))return false;
    return isPersistentWidget(actionWidgetName(action));
  }
  function actionTimingMeta(action){
    if(isPersistentAction(action))return{label:'Fast',className:'persistent'};
    return{label:`${Math.max(1,action?.duration||6)}s`,className:'transient'};
  }
  function formatEventCondition(event){
    const trigger=event?.advancedTrigger||event?.trigger||'';
    const value=String(event?.triggerValue||event?.condition||'').trim();
    if(trigger==='chatCommand')return value?`Kommando ${value}`:'Valfritt kommando';
    if(trigger==='gift')return value?`Gåva ${value}`:'Valfri gåva';
    if(trigger==='giftCoins')return value?`Minst ${value} coins`:'Minsta coin-värde';
    if(trigger==='specificUser')return value?`Användare ${value}`:'Specifik användare';
    if(trigger==='join')return 'När någon går in i liven';
    if(trigger==='firstActivity')return 'Första aktivitet från användaren';
    if(trigger==='member')return 'När någon blir medlem';
    if(trigger==='follow')return 'När någon börjar följa';
    if(trigger==='share')return 'När någon delar liven';
    if(trigger==='likes')return value?`${value} likes`:'När likes registreras';
    if(trigger==='chat')return value?`Text innehåller ${value}`:'När någon skriver i chatten';
    return value?`Villkor ${value}`:'Utan extra villkor';
  }
  const shorten=(text='',max=36)=>{const value=String(text||'').trim();return value.length>max?`${value.slice(0,max-1).trimEnd()}…`:value};
  const fileStem=name=>String(name||'').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim();
  // `data-fn-check`, INTE `fieldset input:checked`.
  //
  // UPPMÄTT 2026-09-16 i riktig Chrome: den gamla selektorn gav
  // `['video','alert','on','on','on','tts']`. De tre `'on'` är Overlay-inställningarnas kryssrutor
  // (Vågeffekt, Rörelseeffekt, 3D) — de ritas INNE i alert-luckan, som ligger inne i samma
  // fieldset, och en kryssruta utan `value` rapporterar `'on'`. De hade sparats som funktionstyper
  // i `action.types` och sedan skickats till action-runtime.js, som inte känner igen dem.
  // Beskrivningen i listan hade dessutom visat "on · on · on".
  //
  // Felet kunde inte ses i provsviten: den bygger sina egna DOM-fragment och har aldrig en
  // utfälld Overlay-panel inne i ett fieldset. Det krävdes en riktig webbläsare med panelen öppen.
  function selectedActionTypes(modal){
    return [...modal.querySelectorAll('input[data-fn-check]:checked')].map(x=>x.value);
  }
  function suggestActionName(modal){
    const types=selectedActionTypes(modal);
    if(!types.length)return 'Ny Action';
    const overlayWidget=modal.querySelector('#aoWidget')?.value?.trim();
    if(overlayWidget&&(types.includes('overlay')||types.includes('animation')))return `Overlay · ${overlayWidget}`;
    const alertText=shorten(modal.querySelector('#aoAlert')?.value||'',28);
    const ttsText=shorten(modal.querySelector('#aoTts')?.value||'',28);
    const chatText=shorten(modal.querySelector('#aoChat')?.value||'',28);
    const spotifyText=shorten(modal.querySelector('#aoSpotify')?.value||'',28);
    const obsScene=shorten(modal.querySelector('#aoObsScene')?.value||'',28);
    const obsSource=shorten(modal.querySelector('#aoObsSource')?.value||'',28);
    const webhook=modal.querySelector('#aoWebhook')?.value?.trim()||'';
    const pictureName=fileStem(modal.querySelector('#aePictureFile')?.files?.[0]?.name||'');
    const videoName=fileStem(modal.querySelector('#aeVideoFile')?.files?.[0]?.name||'');
    const audioName=fileStem(modal.querySelector('#aoAudio')?.files?.[0]?.name||'');
    const fragments=[];
    if(types.includes('alert'))fragments.push(alertText?`Alert · ${alertText}`:'Alert · Tack-alert');
    if(types.includes('tts'))fragments.push(ttsText?`TTS · ${ttsText}`:'TTS · Meddelande');
    if(types.includes('chat'))fragments.push(chatText?`Chatbot · ${chatText}`:'Chatbot · Meddelande');
    if(types.includes('spotify'))fragments.push(spotifyText?`Spotify · ${spotifyText}`:'Spotify · Starta');
    if(types.includes('obsScene'))fragments.push(obsScene?`OBS Scen · ${obsScene}`:'OBS Scen · Byt scen');
    if(types.includes('obsSource'))fragments.push(obsSource?`OBS Källa · ${obsSource}`:'OBS Källa · Aktivera');
    if(types.includes('webhook'))fragments.push(webhook?`Webhook · ${shorten(webhook,32)}`:'Webhook · Anrop');
    if(types.includes('picture'))fragments.push(pictureName?`Bild · ${pictureName}`:'Bild · Visa media');
    if(types.includes('video'))fragments.push(videoName?`Video · ${videoName}`:'Video · Spela upp');
    if(types.includes('audio'))fragments.push(audioName?`Ljud · ${audioName}`:'Ljud · Spela upp');
    if(fragments.length)return fragments.slice(0,2).join(' + ');
    const fallbackLabels=types.map(type=>actionTypes.find(x=>x[0]===type)?.[1]||type);
    return fallbackLabels.slice(0,2).join(' + ');
  }
  function bindActionNameAutomation(modal){
    const input=modal.querySelector('#aeActionName');
    if(!input||input.dataset.autoNameBound)return;
    input.dataset.autoNameBound='1';
    const refresh=()=>{
      const nextName=suggestActionName(modal);
      const shouldReplace=!input.value.trim()||input.dataset.autoManaged==='1'||input.value===input.dataset.autoValue;
      if(shouldReplace){
        input.value=nextName;
        input.dataset.autoValue=nextName;
        input.dataset.autoManaged='1';
      }
      input.placeholder=`Exempel: ${nextName}`;
    };
    input.addEventListener('input',()=>{
      input.dataset.autoManaged=input.value===input.dataset.autoValue?'1':'0';
    });
    modal.addEventListener('change',event=>{
      if(event.target===input)return;
      refresh();
    },true);
    modal.addEventListener('input',event=>{
      if(event.target===input)return;
      refresh();
    },true);
    setTimeout(refresh,0);
    setTimeout(refresh,80);
    setTimeout(refresh,180);
  }
  function suggestEventConditionMeta(trigger=''){
    const type=String(trigger||'').trim();
    if(type==='chatCommand')return{label:'Kommando',placeholder:'Exempel: !hype',value:'!hype',disabled:false,hint:'Exakt kommando som ska trigga eventet.'};
    if(type==='gift')return{label:'Gåvans namn',placeholder:'Exempel: Rose',value:'Rose',disabled:false,hint:'Exakt gåvonamn som ska matchas.'};
    if(type==='giftCoins')return{label:'Minsta coin-värde',placeholder:'Exempel: 100',value:'100',disabled:false,hint:'Eventet triggas när gåvan når minst detta coin-värde.'};
    if(type==='likes')return{label:'Like-tröskel',placeholder:'Exempel: 100',value:'100',disabled:false,hint:'Använd ett tröskelvärde om du bara vill trigga vid högre like-tal.'};
    if(type==='chat')return{label:'Textfilter',placeholder:'Exempel: välkommen',value:'',disabled:false,hint:'Lämna tomt för alla chattmeddelanden eller ange ett ord/fras.'};
    if(['join','firstActivity','follow','member','share'].includes(type))return{label:'Extra villkor',placeholder:'Inget extra villkor behövs',value:'',disabled:true,hint:'Den här triggern fungerar utan extra villkor.'};
    return{label:'Värde / villkor',placeholder:'Exempel: Rose, 10000 eller !hype',value:'',disabled:false,hint:'Valfritt filter för triggern.'};
  }
  function scoreActionForTrigger(action,trigger=''){
    const types=action?.types||[];
    if(trigger==='chatCommand'){
      if(types.includes('chat'))return 7;
      if(types.includes('tts'))return 4;
      if(types.includes('alert'))return 3;
    }
    if(['gift','giftCoins'].includes(trigger)){
      if((types.includes('overlay')||types.includes('animation'))&&!isPersistentAction(action))return 8;
      if(types.includes('alert'))return 7;
      if((types.includes('overlay')||types.includes('animation'))&&isPersistentAction(action))return 4;
      if(types.includes('audio')||types.includes('video'))return 5;
    }
    if(['join','firstActivity','follow','member','share'].includes(trigger)){
      if(types.includes('alert'))return 7;
      if(types.includes('tts'))return 5;
      if(types.includes('overlay'))return 4;
    }
    if(['likes','chat'].includes(trigger)){
      if(types.includes('chat'))return 5;
      if(types.includes('overlay'))return 4;
      if(types.includes('alert'))return 3;
    }
    return types.length?1:0;
  }
  function suggestActionIdForTrigger(state,trigger=''){
    const ranked=[...(state?.actions||[])].sort((a,b)=>scoreActionForTrigger(b,trigger)-scoreActionForTrigger(a,trigger));
    return ranked[0]?.id||state?.actions?.[0]?.id||'';
  }
  function currentEventTrigger(modal){
    return modal.querySelector('[name=aeAdvancedTrigger]:checked')?.value||modal.querySelector('#aeTrigger')?.value||'';
  }
  function bindEventAutomation(modal,state){
    const triggerSelect=modal.querySelector('#aeTrigger');
    const conditionInput=modal.querySelector('#aeCondition');
    const conditionLabel=conditionInput?.closest('label');
    const actionSelect=modal.querySelector('#aeActionId');
    if(!triggerSelect||!conditionInput||!conditionLabel||!actionSelect||triggerSelect.dataset.autoBound)return;
    triggerSelect.dataset.autoBound='1';
    const hint=document.createElement('small');
    hint.id='aeConditionHint';
    conditionLabel.append(hint);
    const refresh=()=>{
      const trigger=currentEventTrigger(modal);
      const meta=suggestEventConditionMeta(trigger);
      const shouldReplace=!conditionInput.value.trim()||conditionInput.dataset.autoManaged==='1'||conditionInput.value===conditionInput.dataset.autoValue||conditionInput.disabled;
      const nextValue=meta.disabled?'':meta.value;
      conditionLabel.firstChild.textContent=meta.label;
      conditionInput.placeholder=meta.placeholder;
      conditionInput.disabled=meta.disabled;
      hint.textContent=meta.hint;
      hint.style.display='block';
      hint.style.opacity='.82';
      hint.style.marginTop='6px';
      if(shouldReplace){
        conditionInput.value=nextValue;
        conditionInput.dataset.autoValue=nextValue;
        conditionInput.dataset.autoManaged='1';
      }
      const suggestedActionId=suggestActionIdForTrigger(state,trigger);
      if(suggestedActionId&&(!actionSelect.dataset.autoValue||actionSelect.value===actionSelect.dataset.autoValue||!actionSelect.value)){
        actionSelect.value=suggestedActionId;
        actionSelect.dataset.autoValue=suggestedActionId;
      }
    };
    conditionInput.addEventListener('input',()=>{
      conditionInput.dataset.autoManaged=conditionInput.value===conditionInput.dataset.autoValue?'1':'0';
    });
    triggerSelect.addEventListener('change',refresh);
    setTimeout(refresh,0);
  }
  function persist(state){write(state);renderPage()}
  function sceneOnline(number){return Date.now()-Number(localStorage.getItem(`vyra-scene-heartbeat-${number}`)||0)<6000}
  // Huvudbrytaren bredvid "Skapa ny Action" (facit §1). Den pausar LIVE-triggade actions, inte
  // Testa-knappen: en streamer som pausat automationen ska ändå kunna prova en action i lugn och ro.
  const actionsEnabled=state=>state?.actionsEnabled!==false;
  function actionRow(a){
    const n=a.scene?.number||1,on=sceneOnline(n),timing=actionTimingMeta(a);
    const namn=formatActionName(a),beskrivning=describeAction(a);
    const kryss=listColumnTypes.map(([type])=>`<td class="ae-col-check">${(a.types||[]).includes(type)?'<i class="ae-tick" aria-label="Ja">✔</i>':''}</td>`).join('');
    // Söket matchar mot samma text som står i raden — inte mot interna typnamn, för det är
    // namnet och beskrivningen streamern faktiskt läser.
    const sokText=`${namn} ${beskrivning} Scen ${n}`.toLowerCase().replace(/"/g,'');
    return `<tr data-action-row="${a.id}" data-sok="${sokText}">
      <td class="ae-col-icons">
        <button type="button" data-test-action="${a.id}" title="Kör actionen nu">▶</button>
        <button type="button" data-edit-action="${a.id}" title="Redigera">✎</button>
        <button type="button" data-copy-action="${a.id}" title="Duplicera">⧉</button>
        <button type="button" data-delete-action="${a.id}" title="Radera">🗑</button>
      </td>
      <td class="ae-col-name"><b>${namn}</b></td>
      <td class="ae-col-screen">Scen ${n} <mark class="ae-action-scene ${on?'online':'offline'}">${on?'Online':'Offline'}</mark></td>
      <td class="ae-col-duration">${timing.className==='persistent'?'Fast':Math.max(1,a.duration||10)}</td>
      <td class="ae-col-points">${actionPointsLabel(a)}</td>
      ${kryss}
      <td class="ae-col-desc" title="${esc(beskrivning)}">${beskrivning}</td>
    </tr>`;
  }
  // Facit §1: eventraden har BARA två ikoner — penna och papperskorg. Ingen ▶ och ingen ⧉, till
  // skillnad från actionraden. Ett event testas inte, det bara gäller; Testa-knappen sitter på
  // actionen. Aktiveringen är en kryssruta i raden, inte en knapp som växlar text.
  function eventRow(state,e){
    const anvandare=eventAnvandare(e),trigger=triggerMening(e),actions=eventActionNames(state,e);
    const sokText=`${anvandare} ${trigger} ${actions}`.toLowerCase().replace(/"/g,'');
    return `<tr data-event-row="${e.id}" data-sok="${sokText}" class="${e.enabled?'':'off'}">
      <td class="ae-col-icons">
        <button type="button" data-edit-event="${e.id}" title="Redigera">✎</button>
        <button type="button" data-delete-event="${e.id}" title="Radera">🗑</button>
      </td>
      <td class="ae-col-check"><input type="checkbox" data-toggle-event="${e.id}"${e.enabled?' checked':''} aria-label="Aktiv"></td>
      <td class="ae-col-user">${esc(anvandare)}</td>
      <td class="ae-col-trigger">${esc(trigger)}</td>
      <td class="ae-col-desc" title="${esc(actions)}">${esc(actions)}</td>
    </tr>`;
  }
  function shell(){
    const state=read(),onlineScenes=Array.from({length:10},(_,i)=>sceneOnline(i+1)).filter(Boolean).length;
    const activeEvents=state.events.filter(event=>event.enabled).length;
    return `<section class="ae-workspace">
      <header class="ae-hero">
        <div class="ae-hero-copy"><span class="ae-eyebrow">VYRA AUTOMATIK</span><h2>Gör liven levande<br>utan att hålla i allt själv.</h2><p>Välj först vad som ska hända. Koppla sedan när det ska hända. VYRA skickar det till rätt overlay-skärm.</p></div>
        <div class="ae-hero-side"><span class="ae-live-pill ${actionsEnabled(state)?'is-on':'is-off'}"><i></i>${actionsEnabled(state)?'Automatik aktiv':'Automatik pausad'}</span><div class="ae-hero-actions"><button class="primary" data-new-ae-action>＋ Ny Action</button><button data-new-ae-event>＋ Nytt Event</button></div></div>
      </header>
      <div class="ae-health" aria-label="Status för automatik"><div><b>${state.actions.length}</b><span>Actions</span></div><div><b>${activeEvents}</b><span>Aktiva events</span></div><div><b>${onlineScenes}/10</b><span>Skärmar online</span></div><p><strong>Så fungerar det:</strong> Event → Action → Overlay</p></div>
      <div class="ae-steps ae-new-steps"><div><b>1</b><span>Skapa en Action</span><small>Vad ska VYRA göra?</small></div><i>→</i><div><b>2</b><span>Koppla ett Event</span><small>När ska det hända?</small></div><i>→</i><div><b>3</b><span>Välj skärm</span><small>Var ska det synas?</small></div></div>
      <div class="ae-columns ae-work-columns">
        <section class="card ae-actions-card"><header><div><span class="ae-section-number">01</span><h3>Actions</h3><p>Det som ska hända i din LIVE.</p></div><span class="ae-count">${state.actions.length}</span></header><div class="ae-actions-toolbar"><button id="newAeAction" class="primary">＋ Skapa Action</button>${state.actions.length?`<label class="ae-check ae-master-toggle"><input id="aeMasterEnabled" type="checkbox"${actionsEnabled(state)?' checked':''}> Aktiverad</label><input id="aeActionSearch" type="search" placeholder="Sök actions…">`:''}</div>${state.actions.length?`<div class="ae-actions-scroll"><table class="ae-actions-table"><thead><tr><th></th><th>Namn</th><th>Skärm</th><th>Visningstid</th><th>Poäng +/−</th>${listColumnTypes.map(x=>`<th class="ae-col-check">${x[1]}</th>`).join('')}<th>Det här händer</th></tr></thead><tbody>${state.actions.map(actionRow).join('')}</tbody></table><p class="ae-sok-tomt" hidden>Ingen action matchar sökningen.</p></div>`:`<div class="ae-empty-state"><span>⚡</span><b>Din första Action börjar här</b><p class="ae-empty-exempel">Exempel: visa en alert, spela ett ljud eller byt OBS-scen.</p><p data-tom="automatik-actions">Inga Actions ännu. Skapa den första.</p></div>`}</section>
        <section class="card ae-events-card"><header><div><span class="ae-section-number">02</span><h3>Events</h3><p>Händelser som startar dina Actions.</p></div><span class="ae-count">${state.events.length}</span></header><div class="ae-actions-toolbar"><button id="newAeEventCard" class="primary">＋ Koppla Event</button>${state.events.length?`<input id="aeEventSearch" type="search" placeholder="Sök events…">`:''}</div>${state.events.length?`<div class="ae-actions-scroll"><table class="ae-actions-table ae-events-table"><thead><tr><th></th><th class="ae-col-check">Aktiv</th><th>Vem</th><th>När detta händer</th><th>Kör den här Actionen</th></tr></thead><tbody>${state.events.map(e=>eventRow(state,e)).join('')}</tbody></table><p class="ae-sok-tomt" data-tomt="event" hidden>Inget event matchar sökningen.</p></div>`:`<div class="ae-empty-state"><span>✦</span><b>Koppla din första trigger</b><p class="ae-empty-exempel">Exempel: en gåva, följning, likes eller ett kommando i chatten.</p><p data-tom="automatik-events">Inga Events ännu. Koppla ett event till en Action.</p></div>`}</section>
      </div><div id="aeModal"></div></section>`
  }
  function renderPage(){if(!document.querySelector('[data-extra="actions"]')?.classList.contains('active'))return;document.querySelector('#title').textContent='Action & Event';document.querySelector('#view').innerHTML=shell();bindPage();(window.VyraActionsExtras||[]).forEach(fn=>{try{fn()}catch(err){console.warn('[VYRA] extras-panel misslyckades',err)}})}
  function bindClose(){document.querySelectorAll('[data-close-ae]').forEach(x=>x.onclick=()=>document.querySelector('#aeModal').innerHTML='')}
  const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function actionModal(existingId){
    const state=read();
    // `editing` är actionen som redigeras, eller null för en ny. Redigering fanns inte alls förut:
    // pennan i listan är ny i facit §1, och utan den måste streamern radera och bygga om från noll.
    const editing=existingId?state.actions.find(a=>a.id===existingId):null;
    const config=editing?.config||{},types=editing?.types||[];
    const vald=type=>types.includes(type);
    const volume=editing?Number(editing.volume??100):100;
    const rutor=actionTypes.map(([value,label])=>`<div class="ae-fn" data-fn="${value}"><label class="ae-check"><input type="checkbox" data-fn-check value="${value}"${vald(value)?' checked':''}> ${label}</label><div class="ae-fn-slot" data-slot="${value}"${vald(value)?'':' hidden'}></div></div>`).join('');
    document.querySelector('#aeModal').innerHTML=`<div class="ae-modal ae-modal-action"><div>
      <header><h3>${editing?'Redigera Action':'Ny Action'}</h3><button data-close-ae>×</button></header>
      <label class="ae-field-name">Vad ska actionen heta?<input id="aeActionName" placeholder="Exempel: Prenumerationsanimation" value="${esc(editing?.name||'')}"></label>
      <fieldset class="ae-fns"><legend>Vad ska hända? Flera val är möjliga.</legend>${rutor}</fieldset>
      <div class="ae-extra-slot"></div>
      <section class="ae-block"><h4>Hur länge ska den visas?</h4><label class="ae-inline">Visningstid (sekunder)<input id="aeDuration" type="number" min="1" max="600" value="${Number(editing?.duration)||10}"></label></section>
      <section class="ae-block ae-points"><h4>Ska användaren som triggar få en belöning, eller betala för den? (valfritt)</h4>
        <div class="ae-points-row"><label class="ae-check"><input id="aeAddPoints" type="checkbox"${vald('addPoints')?' checked':''}> Lägg till poäng</label><input id="aeAddPointsAmount" type="number" min="1" value="${Number(config.addPointsAmount)||10}"${vald('addPoints')?'':' hidden'}></div>
        <div class="ae-points-row"><label class="ae-check"><input id="aeRemovePoints" type="checkbox"${vald('removePoints')?' checked':''}> Ta bort poäng</label><input id="aeRemovePointsAmount" type="number" min="1" value="${Number(config.removePointsAmount)||10}"${vald('removePoints')?'':' hidden'}></div>
      </section>
      <section class="ae-block"><h4>Ytterligare inställningar (valfritt)</h4><div class="ae-grid">
        <label>Mediets ljudvolym <output id="aeVolumeOut">${volume} %</output><input id="aeVolume" type="range" min="0" max="100" value="${volume}"></label>
        <label>Global cooldown (sekunder)<input id="aeCooldown" type="number" min="0" max="300" value="${Number(editing?.cooldown)||0}"></label>
        <label>Cooldown per användare (sekunder)<input id="aeUserCooldown" type="number" min="0" max="600" value="${Number(editing?.userCooldown)||0}"></label>
        <label class="ae-check"><input id="aeFade" type="checkbox"${editing?(editing.fade?' checked':''):' checked'}> Aktivera fade in/ut</label>
        <label class="ae-check"><input id="aeRepeatCombo" type="checkbox"${editing?.repeatCombo?' checked':''}> Upprepa med gift-combo</label>
        <label class="ae-check"><input id="aeSkipOnNext" type="checkbox"${editing?.skipOnNext?' checked':''}> Hoppa över vid nästa action</label>
      </div></section>
      <footer><button data-close-ae>✘ Avbryt</button><button id="saveAeAction" class="primary">✔ Spara</button></footer>
    </div></div>`;
    bindClose();
    const modal=document.querySelector('.ae-modal');
    // Luckorna fylls av fältleverantörerna (action-media.js, action-options.js). De renderas EN
    // gång och göms/visas sedan — annars tappar en halvifylld ruta sitt innehåll varje gång
    // streamern kryssar i en annan funktion.
    fieldProviders.forEach(provider=>{
      (provider.slots||[]).forEach(slot=>{
        const el=modal.querySelector(`.ae-fn-slot[data-slot="${slot}"]`);
        if(el&&!el.dataset.renderad){try{provider.render?.(el,slot,editing);el.dataset.renderad='1'}catch(err){console.warn('[VYRA] fältlucka misslyckades',slot,err)}}
      });
      try{provider.mount?.(modal,editing)}catch(err){console.warn('[VYRA] fältpanel misslyckades',err)}
    });
    const speglaLuckor=()=>{
      const valda=selectedActionTypes(modal);
      modal.querySelectorAll('.ae-fn-slot').forEach(slot=>{slot.hidden=!valda.includes(slot.dataset.slot)});
    };
    modal.querySelectorAll('input[data-fn-check]').forEach(box=>box.addEventListener('change',speglaLuckor));
    speglaLuckor();
    modal.querySelector('#aeVolume').oninput=e=>{modal.querySelector('#aeVolumeOut').textContent=`${e.target.value} %`};
    [['#aeAddPoints','#aeAddPointsAmount'],['#aeRemovePoints','#aeRemovePointsAmount']].forEach(([kryss,antal])=>{
      modal.querySelector(kryss).addEventListener('change',e=>{modal.querySelector(antal).hidden=!e.target.checked});
    });
    if(!editing)bindActionNameAutomation(modal);
    modal.querySelector('#saveAeAction').onclick=()=>saveAction(existingId);
  }
  // EN ENDA SKRIVNING (se fältregistret ovan). Allt som ska sparas passerar här: modalens egna
  // fält, plus varje leverantörs `collect`. Ingen annan fil rör spara-knappen längre.
  async function saveAction(existingId){
    const modal=document.querySelector('.ae-modal');
    if(!modal)return;
    const namn=modal.querySelector('#aeActionName').value.trim();
    const funktioner=selectedActionTypes(modal);
    const laggTill=modal.querySelector('#aeAddPoints').checked,taBort=modal.querySelector('#aeRemovePoints').checked;
    const types=[...funktioner,...(laggTill?['addPoints']:[]),...(taBort?['removePoints']:[])];
    if(!namn||!types.length)return window.toast?.('Ange namn och välj minst en funktion');
    const state=read(),befintlig=existingId?state.actions.find(a=>a.id===existingId):null;
    for(const provider of fieldProviders){
      const fel=provider.validate?.(modal,types,befintlig);
      if(fel)return window.toast?.(fel);
    }
    const knapp=modal.querySelector('#saveAeAction');
    knapp.disabled=true;knapp.textContent='Sparar…';
    try{
      let delar={},samladConfig={};
      for(const provider of fieldProviders){
        const bit=await provider.collect?.(modal,types,befintlig)||{};
        if(bit.config){Object.assign(samladConfig,bit.config);delete bit.config}
        Object.assign(delar,bit);
      }
      const bas={
        name:namn,types,
        config:{...samladConfig,addPointsAmount:Number(modal.querySelector('#aeAddPointsAmount').value)||10,removePointsAmount:Number(modal.querySelector('#aeRemovePointsAmount').value)||10},
        duration:Number(modal.querySelector('#aeDuration').value)||10,
        cooldown:Number(modal.querySelector('#aeCooldown').value)||0,
        userCooldown:Number(modal.querySelector('#aeUserCooldown').value)||0,
        volume:Number(modal.querySelector('#aeVolume').value),
        fade:modal.querySelector('#aeFade').checked,
        repeatCombo:modal.querySelector('#aeRepeatCombo').checked,
        skipOnNext:modal.querySelector('#aeSkipOnNext').checked,
        ...delar
      };
      const aktuell=read();
      if(existingId){
        const index=aktuell.actions.findIndex(a=>a.id===existingId);
        if(index<0)throw new Error('Actionen finns inte längre');
        aktuell.actions[index]={...aktuell.actions[index],...bas};
      }else aktuell.actions.push({id:'a'+Date.now(),...bas});
      write(aktuell);
      document.querySelector('#aeModal').innerHTML='';
      renderPage();
      window.toast?.(existingId?'Action uppdaterad':'Action sparad');
    }catch(error){
      console.warn('[VYRA] Action kunde inte sparas',error);
      knapp.disabled=false;knapp.textContent='✔ Spara';
      window.toast?.('Actionen kunde inte sparas');
    }
  }
  function eventModal(existingId){
    const state=read();
    const editing=existingId?state.events.find(e=>e.id===existingId):null;
    if(!state.actions.length&&!editing)return window.toast?.('Skapa en Action först');
    document.querySelector('#aeModal').innerHTML=`<div class="ae-modal ae-modal-event"><div>
      <header><h3>${editing?'Redigera Event':'Nytt Event'}</h3><button data-close-ae>×</button></header>
      <div class="ae-event-slot"></div>
      <footer><button data-close-ae>✘ Avbryt</button><button id="saveAeEvent" class="primary">✔ Spara</button></footer>
    </div></div>`;
    bindClose();
    const modal=document.querySelector('.ae-modal');
    eventProviders.forEach(provider=>{try{provider.mount?.(modal,editing,state)}catch(err){console.warn('[VYRA] eventpanel misslyckades',err)}});
    // RESERVFORMULÄRET. Utan det vore modalen TOM om action-event-advanced.js inte hunnit ladda
    // (samma async-fälla som medialuckorna gick i, se fältregistret ovan) — och en tom dialog med
    // en spara-knapp är värre än ett enkelt formulär. Den ritas bara när ingen annan gjort det.
    const vard=modal.querySelector('.ae-event-slot');
    if(vard&&!vard.children.length){
      vard.innerHTML=`<label>När detta händer<select id="aeTrigger">${Object.entries(triggerNames).map(x=>`<option value="${x[0]}"${(editing?.trigger===x[0])?' selected':''}>${x[1]}</option>`).join('')}</select></label><label>Värde / villkor<input id="aeCondition" placeholder="Exempel: Rose, 10000 eller !hype" value="${esc(editing?.condition||'')}"></label><label>Kör denna Action<select id="aeActionId">${state.actions.map(a=>`<option value="${a.id}"${editing?.actionId===a.id?' selected':''}>${esc(formatActionName(a))}</option>`).join('')}</select></label>`;
      bindEventAutomation(modal,state);
    }
    modal.querySelector('#saveAeEvent').onclick=()=>saveEvent(existingId);
  }
  // EN ENDA SKRIVNING, precis som för actions. Se eventregistret högst upp.
  async function saveEvent(existingId){
    const modal=document.querySelector('.ae-modal');
    if(!modal)return;
    for(const provider of eventProviders){
      const fel=provider.validate?.(modal);
      if(fel)return window.toast?.(fel);
    }
    const knapp=modal.querySelector('#saveAeEvent');
    knapp.disabled=true;knapp.textContent='Sparar…';
    try{
      let delar={};
      for(const provider of eventProviders)Object.assign(delar,await provider.collect?.(modal)||{});
      // Reservformuläret bidrar inte via registret, så dess fält läses här.
      const enkelTrigger=modal.querySelector('#aeTrigger'),enkeltVillkor=modal.querySelector('#aeCondition'),enkelAction=modal.querySelector('#aeActionId');
      if(!delar.advancedTrigger&&enkelTrigger)delar={...delar,trigger:enkelTrigger.value,condition:enkeltVillkor?.value?.trim()||'',actionId:enkelAction?.value||''};
      // `trigger` skrivs ALLTID, även när den avancerade panelen styr. Reservvägens handleEvent i
      // den här filen och sound-alerts.js läser `trigger`, inte `advancedTrigger` — utan spegling
      // blir ett event osynligt för dem så fort den avancerade filen inte är laddad.
      if(delar.advancedTrigger)delar.trigger=delar.advancedTrigger;
      if(!delar.actionId)delar.actionId=delar.allActionIds?.[0]||delar.randomActionIds?.[0]||'';
      if(!delar.actionId&&!delar.allActionIds?.length&&!delar.randomActionIds?.length){
        knapp.disabled=false;knapp.textContent='✔ Spara';
        return window.toast?.('Välj minst en Action som eventet ska köra');
      }
      const aktuell=read();
      if(existingId){
        const index=aktuell.events.findIndex(e=>e.id===existingId);
        if(index<0)throw new Error('Eventet finns inte längre');
        aktuell.events[index]={...aktuell.events[index],...delar};
      }else aktuell.events.push({id:'e'+Date.now(),enabled:true,...delar});
      write(aktuell);
      document.querySelector('#aeModal').innerHTML='';
      renderPage();
      window.toast?.(existingId?'Event uppdaterat':'Event kopplat till Action');
    }catch(error){
      console.warn('[VYRA] Event kunde inte sparas',error);
      knapp.disabled=false;knapp.textContent='✔ Spara';
      window.toast?.('Eventet kunde inte sparas');
    }
  }
  // KÖRNINGSTIDSSTÄMPLARNA BOR I EN EGEN NYCKEL (§15b i docs/tech-debt.md).
  //
  // De låg förr inne i actionen i `vyra-action-event-v2`, alltså i en EXTRA_KEY, och det gav två
  // fel på en gång. Nyckeln skrivs bara via `VyraSessionState.writeActive`, som kräver
  // `studio-committed` eller `local-committed` (session-state.js:138, :284) — så en overlayflik
  // kunde aldrig spara ett `lastRun`, och cooldownen var **helt verkningslös** i själva utgången
  // som sänds. Uppmätt: fem gåvor under cooldown 30 s gav fem uppspelningar och 500 spenderade
  // poäng i ett fönster utan skrivrätt. Dessutom synkades stämplarna till molnet och följde med
  // till nästa dator, som om "när spelade det här senast" vore en del av layouten.
  //
  // Nyckeln är rå `localStorage` — samma väg som `vyra-action-run` och scenernas hjärtslag redan
  // går. Ingen projektion, ingen version, inget lås: efter §15a är det en förare per lagerrymd som
  // skriver, och en förlorad skrivning kostar i värsta fall en cooldown.
  //
  // Den är registrerad i `EPHEMERAL_KEYS` i session-state.js, INTE i EXTRA_KEYS. Skillnaden är
  // hela poängen: den projiceras inte, synkas inte och backas inte upp — men den **torkas vid
  // kontobyte**, för `per` är keyad på tittarnas användarnamn och de spåren får aldrig ligga kvar
  // åt nästa konto på en delad dator.
  //
  // Form: { "<action-id>": { at: <ms>, per: { "<tittare>": <ms> } } }
  const COOLDOWN_KEY='vyra-action-cooldowns';
  // Ingen annan städar den här nyckeln. En post vars nyaste stämpel är äldre än så här är död —
  // den längsta cooldown panelen tillåter är 600 s, alltså med väldigt god marginal.
  const COOLDOWN_GALLRING=24*60*60*1000;
  const lasCooldowns=()=>{try{const o=JSON.parse(localStorage.getItem(COOLDOWN_KEY)||'{}');return o&&typeof o==='object'?o:{}}catch{return{}}};
  const nyaste=post=>Math.max(Number(post?.at)||0,...Object.values(post?.per||{}).map(v=>Number(v)||0));
  function skrivCooldown(id,now,userKey){
    if(!id)return;
    const bok=lasCooldowns(),post=bok[id]||{};
    post.at=now;
    if(userKey){
      const per={...(post.per||{}),[userKey]:now},poster=Object.entries(per);
      post.per=poster.length>200?Object.fromEntries(poster.sort((a,b)=>b[1]-a[1]).slice(0,200)):per;
    }
    bok[id]=post;
    for(const [nyckel,varde] of Object.entries(bok)){const sist=nyaste(varde);if(!sist||now-sist>COOLDOWN_GALLRING)delete bok[nyckel]}
    try{localStorage.setItem(COOLDOWN_KEY,JSON.stringify(bok))}catch{}
  }
  // Läsningen är TVÅKÄLLIG, skrivningen enkällig: en installation som uppgraderar har kvar sina
  // stämplar inne i actionen, och utan reservläsningen nollställs varje cooldown vid uppdateringen.
  // De gamla fälten skrivs aldrig igen och vittrar bort av sig själva.
  const sistKord=(post,stored)=>Number(post?.at)||Number(stored?.lastRun)||0;
  const sistKordAv=(post,stored,userKey)=>Number(post?.per?.[userKey])||Number(stored?.lastRunByUser?.[userKey])||0;

  // Check-Then-Act (§13 i docs/tech-debt.md). Grindarna nedan svarar UTAN att röra något, så att
  // en anropare kan fråga innan den tar betalt — poängavdraget i action-event-advanced.js låg förr
  // före allt det här och drog poäng för uppspelningar som sedan aldrig skedde.
  //
  // Toast och scroll hör INTE hemma i checken. De är runActions svar på ett nej, inte en del av
  // frågan; en check som toastar kan inte anropas i förväg utan att ljuga för streamern.
  //
  // runAction ANROPAR den här funktionen i stället för att upprepa villkoren. Det är hela poängen:
  // det finns en implementation av grindarna, aldrig två som kan glida isär.
  function kanKora(action,payload={}){
    if(!action)return{ok:false,skal:'saknas',scen:0,kvar:0};
    const state=read(),stored=state.actions.find(a=>a.id===action.id)||action,scene=Number(stored.scene?.number||1),now=Date.now();
    if(!window.VYRA_OVERLAY_SCENE&&!sceneOnline(scene))return{ok:false,skal:'scen-offline',scen:scene,kvar:0};
    // "Upprepa med gift-combo": once a gift-streak has actually started (combo/repeatcount > 1),
    // every further tap should still fire even if the global/user cooldown hasn't expired yet —
    // otherwise a fast combo would only ever play the action once. A brand-new (first-tap) event
    // is still subject to normal cooldown rules either way.
    const bypassCooldown=stored.repeatCombo&&Number(payload.combo||payload.repeatcount||1)>1;
    const post=lasCooldowns()[stored.id],sist=sistKord(post,stored);
    if(!bypassCooldown&&sist){const kvar=(stored.cooldown||0)*1000-(now-sist);if(kvar>0)return{ok:false,skal:'cooldown',scen:scene,kvar}}
    const userKey=payload.username?String(payload.username).replace(/^@/,'').toLowerCase():'';
    if(!bypassCooldown&&stored.userCooldown&&userKey){const lastForUser=sistKordAv(post,stored,userKey);if(lastForUser){const kvar=stored.userCooldown*1000-(now-lastForUser);if(kvar>0)return{ok:false,skal:'cooldown-anvandare',scen:scene,kvar}}}
    return{ok:true,skal:'',scen:scene,kvar:0};
  }
  function runAction(action,payload={}){
    const dom=kanKora(action,payload);
    if(!dom.ok){
      if(dom.skal==='scen-offline'){window.toast?.(`Scen ${dom.scen} är offline. Öppna scenlänken först.`);document.querySelector(`[data-scene-link="${dom.scen}"]`)?.scrollIntoView({behavior:'smooth',block:'center'})}
      else if(dom.skal==='cooldown')window.toast?.('Action väntar på cooldown');
      else if(dom.skal==='cooldown-anvandare')window.toast?.('Action väntar på cooldown för den här användaren');
      return false;
    }
    const state=read(),stored=state.actions.find(a=>a.id===action.id)||action,scene=dom.scen,now=Date.now();
    const userKey=payload.username?String(payload.username).replace(/^@/,'').toLowerCase():'';
    // Stämpeln går till sin egen nyckel, inte in i actionen. Därmed försvinner också det write()
    // som stod här: varje körd action utlöste förr en låst, versionshanterad projektion — i den
    // varmaste vägen i hela appen, och bara för att spara ett tal som inte hör till layouten.
    skrivCooldown(stored.id,now,userKey);
    const detail={action:stored,payload,runId:'run-'+now+'-'+Math.random().toString(36).slice(2)};if(window.VYRA_OVERLAY_SCENE)document.dispatchEvent(new CustomEvent('vyra:action',{detail}));try{localStorage.setItem('vyra-action-run',JSON.stringify({...detail,at:now}))}catch{}window.toast?.(`Kör ${stored.name} på Scen ${scene}`);
    // Returnerar runId, inte true (§15c). Anroparen behover det for att kunna koppla ihop ett
    // avdrag med de uppspelningar det betalade for — en strypt uppspelning ska ge pengarna
    // tillbaka, och rapporten fran overlayn bar bara ett runId. Strangen ar truthy, sa varje
    // befintlig `if (runAction(...))` beter sig precis som forr.
    return detail.runId}
  function actionsForEvent(state,event){if(event.allActionIds?.length)return event.allActionIds;if(event.randomActionIds?.length)return[event.randomActionIds[Math.floor(Math.random()*event.randomActionIds.length)]];return[event.actionId]}
  // Huvudbrytaren sitter HÄR, inte i handleEvent. action-event-advanced.js har en egen handleEvent
  // som tar över när den är laddad, men båda vägarna passerar runEvent — en grind i handleEvent
  // hade alltså varit verkningslös så fort den avancerade filen fanns.
  function runEvent(event,payload={}){const state=read();if(payload.__test!==true&&!actionsEnabled(state))return false;if(!event?.enabled&&payload.__test!==true)return false;actionsForEvent(state,event).forEach(id=>runAction(state.actions.find(a=>a.id===id),payload));return true}
  // Reservvagen nar action-event-advanced.js inte ar laddad. Master-graden star EFTER delegeringen,
  // annars skulle farKora() anropas tva ganger for samma event (ofarligt men vilseledande i prov).
  // Se §15 och kommentaren vid handleEvent i den avancerade filen.
  function handleEvent(trigger,payload={}){if(window.VyraAdvancedEvents)return window.VyraAdvancedEvents.handleEvent(trigger,payload);if(payload.__test!==true&&window.VyraAutomationMaster&&!window.VyraAutomationMaster.farKora())return;const state=read();state.events.filter(e=>e.enabled&&(e.advancedTrigger||e.trigger)===trigger).forEach(e=>{const condition=e.triggerValue||e.condition;if(!condition||String(payload.value??payload.gift??payload.command??'').toLowerCase().includes(String(condition).toLowerCase()))runEvent(e,payload)})}
  function bindPage(){document.querySelectorAll('#newAeAction,[data-new-ae-action]').forEach(button=>button.onclick=()=>actionModal());const nyttEvent=()=>eventModal();document.querySelectorAll('#newAeEvent,#newAeEventCard,[data-new-ae-event]').forEach(b=>b.onclick=nyttEvent);
    document.querySelectorAll('[data-edit-action]').forEach(b=>b.onclick=()=>actionModal(b.dataset.editAction));
    document.querySelectorAll('[data-copy-action]').forEach(b=>b.onclick=()=>{
      const aktuell=read(),original=aktuell.actions.find(a=>a.id===b.dataset.copyAction);
      if(!original)return;
      // Mediet kopieras som REFERENS, inte som ny blob: båda actionerna pekar på samma post i
      // IndexedDB. Det är avsiktligt — en duplicering ska inte fördubbla en 40 MB videofil. Priset
      // är att en raderad förlaga tar med sig kopians media, och det är inte byggt än (se nedan).
      aktuell.actions.push({...original,id:'a'+Date.now(),name:`${formatActionName(original)} (kopia)`});
      persist(aktuell);window.toast?.('Action duplicerad');
    });
    const master=document.querySelector('#aeMasterEnabled');
    if(master)master.onchange=()=>{const aktuell=read();aktuell.actionsEnabled=master.checked;write(aktuell);window.toast?.(master.checked?'Automatiken är aktiv':'Automatiken är pausad — Testa-knappen fungerar fortfarande')};
    document.querySelectorAll('[data-edit-event]').forEach(b=>b.onclick=()=>eventModal(b.dataset.editEvent));
    const eventSok=document.querySelector('#aeEventSearch');
    if(eventSok)eventSok.oninput=()=>{
      const term=eventSok.value.trim().toLowerCase();
      let traffar=0;
      document.querySelectorAll('[data-event-row]').forEach(row=>{const visa=!term||row.dataset.sok.includes(term);row.hidden=!visa;if(visa)traffar++});
      const tomt=document.querySelector('[data-tomt="event"]');
      if(tomt)tomt.hidden=!!traffar;
    };
    const sok=document.querySelector('#aeActionSearch');
    if(sok)sok.oninput=()=>{
      // Filtrerar raderna i DOM:en i stället för att rita om sidan. Ritas den om vid varje
      // tangenttryck tappar fältet fokus och streamern kan bara skriva en bokstav i taget.
      const term=sok.value.trim().toLowerCase();
      let traffar=0;
      document.querySelectorAll('[data-action-row]').forEach(row=>{const visa=!term||row.dataset.sok.includes(term);row.hidden=!visa;if(visa)traffar++});
      const tomt=document.querySelector('.ae-sok-tomt');
      if(tomt)tomt.hidden=!!traffar;
    };document.querySelectorAll('[data-delete-action]').forEach(b=>b.onclick=()=>{const state=read(),id=b.dataset.deleteAction;state.actions=state.actions.filter(a=>a.id!==id);state.events=state.events.map(e=>({...e,allActionIds:(e.allActionIds||[]).filter(x=>x!==id),randomActionIds:(e.randomActionIds||[]).filter(x=>x!==id)})).filter(e=>e.actionId!==id||e.allActionIds.length||e.randomActionIds.length);persist(state)});document.querySelectorAll('[data-delete-event]').forEach(b=>b.onclick=()=>{const state=read();state.events=state.events.filter(e=>e.id!==b.dataset.deleteEvent);persist(state)});document.querySelectorAll('[data-toggle-event]').forEach(b=>b.onchange=()=>{const state=read(),e=state.events.find(x=>x.id===b.dataset.toggleEvent);if(e)e.enabled=b.checked;persist(state)});document.querySelectorAll('[data-test-action]').forEach(b=>b.onclick=()=>{const state=read();runAction(state.actions.find(a=>a.id===b.dataset.testAction),{username:'TestUser',giftname:'Rose',gift:'Rose',profileImage:'assets/images/test-profile.svg',combo:5,repeatcount:5,coins:5,__test:true})});}
  document.addEventListener('click',e=>{if(e.target.closest('[data-extra="actions"]'))setTimeout(renderPage,0)},true);
  window.VyraActionEvent={handleEvent,runAction,runEvent,kanKora,refresh:renderPage,read};
})();
