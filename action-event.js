(() => {
  const KEY='vyra-action-event-v2';
  // Tokenlaget (?access=) skriver ingen nyckel — extras projiceras bara i minnet. En direkt
  // localStorage-lasning ger darfor noll actions i en OBS browser source, och scenen spelar
  // ingenting hur ratt lanken an ar. session-state.js ager bade minnet och localStorage.
  const readExtra=key=>{try{return window.VyraSessionState?.readExtra?.(key)??localStorage.getItem(key)}catch{return null}};
  const actionRunChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('vyra-action-run'):null;
  const actionTypes=[['overlay','Visa overlay/widget'],['animation','Visa animation'],['picture','Visa bild/GIF'],['audio','Spela ljud'],['video','Spela video'],['alert','Visa alert'],['tts','Läs text (TTS)'],['chat','Skicka chatbotmeddelande'],['spotify','Spela Spotify'],['obsScene','Byt OBS-scen'],['obsSource','Aktivera OBS-källa'],['webhook','Anropa webhook'],['addPoints','Lägg till poäng'],['removePoints','Ta bort poäng']];
  const triggerNames={gift:'Gåva mottagen',giftCombo:'Gift-combo',follow:'Ny följare',member:'Ny medlem',likes:'Likes uppnådda',share:'Delning',level:'Level up',battle:'Battle-event',chat:'Chattkommando',join:'Går med i liven',firstActivity:'Första aktiviteten',chatCommand:'Chattkommando',giftCoins:'Minsta coin-värde',subscriberEmote:'Subscriber-emote',fanSticker:'Fan Club-sticker',shopPurchase:'TikTok Shop-köp'};
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
  const read=()=>{try{const parsed=JSON.parse(readExtra(KEY)||'{"actions":[],"events":[]}');const cleaned=cleanupLegacyTestState(parsed);if(cleaned.changed)window.VyraSessionState.writeActive(KEY,JSON.stringify(cleaned.state));return cleaned.state}catch(e){console.warn('[VYRA] Ogiltig action-state',e);return{actions:[],events:[]}}};
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
  function selectedActionTypes(modal){
    return [...modal.querySelectorAll('fieldset input:checked')].map(x=>x.value);
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
  function shell(){const state=read();return `<div class="ae-head"><div><h2>Automatik</h2><p>Skapa en Action först. Koppla sedan ett Event som triggar den.</p></div><div><button id="newAeAction" class="primary">＋ Ny Action</button><button id="newAeEvent">＋ Nytt Event</button></div></div><div class="ae-steps"><b>1</b><span>Skapa Action</span><i>→</i><b>2</b><span>Koppla Event</span><i>→</i><b>3</b><span>Trigger kör Action</span></div><div class="ae-columns"><section class="card"><header><h3>Actions</h3><span>${state.actions.length} sparade</span></header><div class="ae-list">${state.actions.length?state.actions.map(a=>{const n=a.scene?.number||1,on=sceneOnline(n),timing=actionTimingMeta(a);return `<article><i>⚡</i><span><b>${formatActionName(a)}</b><small>${a.types.map(t=>actionTypes.find(x=>x[0]===t)?.[1]||t).join(' · ')} · Scen ${n} <mark class="ae-action-scene ${on?'online':'offline'}">${on?'Online':'Offline'}</mark> <mark class="ae-action-timing ${timing.className}">${timing.label}</mark></small></span><em>${timing.label}</em><button data-test-action="${a.id}">Testa</button><button data-delete-action="${a.id}">×</button></article>`}).join(''):'<p data-tom="automatik-actions">Inga Actions ännu. Skapa den första.</p>'}</div></section><section class="card"><header><h3>Events</h3><span>${state.events.length} kopplingar</span></header><div class="ae-list">${state.events.length?state.events.map(e=>`<article class="${e.enabled?'':'off'}"><i>◇</i><span><b>${triggerNames[e.advancedTrigger||e.trigger]||e.advancedTrigger||e.trigger}</b><small>${formatEventCondition(e)} · → ${eventActionNames(state,e)}</small></span><button data-toggle-event="${e.id}">${e.enabled?'Aktiv':'Pausad'}</button><button data-test-event="${e.id}">Testa</button><button data-delete-event="${e.id}">×</button></article>`).join(''):'<p data-tom="automatik-events">Inga Events ännu. Koppla ett event till en Action.</p>'}</div></section></div><div id="aeModal"></div>`}
  function renderPage(){if(!document.querySelector('[data-extra="actions"]')?.classList.contains('active'))return;document.querySelector('#title').textContent='Automatik';document.querySelector('#view').innerHTML=shell();bindPage();(window.VyraActionsExtras||[]).forEach(fn=>{try{fn()}catch(err){console.warn('[VYRA] extras-panel misslyckades',err)}})}
  function bindClose(){document.querySelectorAll('[data-close-ae]').forEach(x=>x.onclick=()=>document.querySelector('#aeModal').innerHTML='')}
  function actionModal(){document.querySelector('#aeModal').innerHTML=`<div class="ae-modal"><div><header><h3>Ny Action</h3><button data-close-ae>×</button></header><label>Actionens namn<input id="aeActionName" placeholder="Exempel: Ny Action"></label><fieldset><legend>Vad ska hända? Flera val är möjliga.</legend>${actionTypes.map(x=>`<label><input type="checkbox" value="${x[0]}"> ${x[1]}</label>`).join('')}</fieldset><div class="ae-grid"><label>Visningstid<input id="aeDuration" type="number" min="1" max="60" value="6"></label><label>Global cooldown<input id="aeCooldown" type="number" min="0" max="300" value="2"></label><label>Cooldown per användare<input id="aeUserCooldown" type="number" min="0" max="600" value="0"></label><label>Volym<input id="aeVolume" type="range" min="0" max="100" value="80"></label><label><input id="aeFade" type="checkbox" checked> Fade in/ut</label><label><input id="aeRepeatCombo" type="checkbox"> Upprepa med gift-combo</label><label><input id="aeSkipOnNext" type="checkbox"> Hoppa över om nästa action väntar i kön</label></div><footer><button data-close-ae>Avbryt</button><button id="saveAeAction" class="primary">Spara Action</button></footer></div></div>`;bindClose();const modal=document.querySelector('.ae-modal');bindActionNameAutomation(modal);document.querySelector('#saveAeAction').onclick=()=>{const m=document.querySelector('.ae-modal'),actionName=m.querySelector('#aeActionName').value.trim(),types=[...m.querySelectorAll('fieldset input:checked')].map(x=>x.value);if(!actionName||!types.length)return window.toast?.('Ange namn och välj minst en funktion');const state=read();state.actions.push({id:'a'+Date.now(),name:actionName,types,duration:+m.querySelector('#aeDuration').value,cooldown:+m.querySelector('#aeCooldown').value,userCooldown:+m.querySelector('#aeUserCooldown').value,volume:+m.querySelector('#aeVolume').value,fade:m.querySelector('#aeFade').checked,repeatCombo:m.querySelector('#aeRepeatCombo').checked,skipOnNext:m.querySelector('#aeSkipOnNext').checked});persist(state);window.toast?.('Action sparad')}}
  function eventModal(){const state=read();if(!state.actions.length)return window.toast?.('Skapa en Action först');document.querySelector('#aeModal').innerHTML=`<div class="ae-modal"><div><header><h3>Nytt Event</h3><button data-close-ae>×</button></header><label>När detta händer<select id="aeTrigger">${Object.entries(triggerNames).slice(0,9).map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('')}</select></label><label>Värde / villkor<input id="aeCondition" placeholder="Exempel: Rose, 10000 eller !hype"></label><label>Kör denna Action<select id="aeActionId">${state.actions.map(a=>`<option value="${a.id}">${formatActionName(a)}</option>`).join('')}</select></label><footer><button data-close-ae>Avbryt</button><button id="saveAeEvent" class="primary">Spara Event</button></footer></div></div>`;bindClose();bindEventAutomation(document.querySelector('.ae-modal'),state);document.querySelector('#saveAeEvent').onclick=()=>{const current=read();current.events.push({id:'e'+Date.now(),trigger:document.querySelector('#aeTrigger').value,condition:document.querySelector('#aeCondition').value.trim(),actionId:document.querySelector('#aeActionId').value,enabled:true});persist(current);window.toast?.('Event kopplat till Action')}}
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
    if(!bypassCooldown&&stored.lastRun){const kvar=(stored.cooldown||0)*1000-(now-stored.lastRun);if(kvar>0)return{ok:false,skal:'cooldown',scen:scene,kvar}}
    const userKey=payload.username?String(payload.username).replace(/^@/,'').toLowerCase():'';
    if(!bypassCooldown&&stored.userCooldown&&userKey){const lastForUser=(stored.lastRunByUser||{})[userKey];if(lastForUser){const kvar=stored.userCooldown*1000-(now-lastForUser);if(kvar>0)return{ok:false,skal:'cooldown-anvandare',scen:scene,kvar}}}
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
    stored.lastRun=now;if(userKey){stored.lastRunByUser=stored.lastRunByUser||{};stored.lastRunByUser[userKey]=now;const entries=Object.entries(stored.lastRunByUser);if(entries.length>200)stored.lastRunByUser=Object.fromEntries(entries.sort((a,b)=>b[1]-a[1]).slice(0,200))}
    if(!state.actions.some(a=>a.id===stored.id))state.actions.push(stored);write(state);const detail={action:stored,payload,runId:'run-'+now+'-'+Math.random().toString(36).slice(2)};if(window.VYRA_OVERLAY_SCENE)document.dispatchEvent(new CustomEvent('vyra:action',{detail}));try{actionRunChannel?.postMessage(detail)}catch{}try{localStorage.setItem('vyra-action-run',JSON.stringify({...detail,at:now}))}catch{}window.toast?.(`Kör ${stored.name} på Scen ${scene}`);return true}
  function actionsForEvent(state,event){if(event.allActionIds?.length)return event.allActionIds;if(event.randomActionIds?.length)return[event.randomActionIds[Math.floor(Math.random()*event.randomActionIds.length)]];return[event.actionId]}
  function runEvent(event,payload={}){const state=read();if(!event?.enabled&&payload.__test!==true)return false;actionsForEvent(state,event).forEach(id=>runAction(state.actions.find(a=>a.id===id),payload));return true}
  function handleEvent(trigger,payload={}){if(window.VyraAdvancedEvents)return window.VyraAdvancedEvents.handleEvent(trigger,payload);const state=read();state.events.filter(e=>e.enabled&&(e.advancedTrigger||e.trigger)===trigger).forEach(e=>{const condition=e.triggerValue||e.condition;if(!condition||String(payload.value??payload.gift??payload.command??'').toLowerCase().includes(String(condition).toLowerCase()))runEvent(e,payload)})}
  function bindPage(){document.querySelector('#newAeAction').onclick=actionModal;document.querySelector('#newAeEvent').onclick=eventModal;document.querySelectorAll('[data-delete-action]').forEach(b=>b.onclick=()=>{const state=read(),id=b.dataset.deleteAction;state.actions=state.actions.filter(a=>a.id!==id);state.events=state.events.map(e=>({...e,allActionIds:(e.allActionIds||[]).filter(x=>x!==id),randomActionIds:(e.randomActionIds||[]).filter(x=>x!==id)})).filter(e=>e.actionId!==id||e.allActionIds.length||e.randomActionIds.length);persist(state)});document.querySelectorAll('[data-delete-event]').forEach(b=>b.onclick=()=>{const state=read();state.events=state.events.filter(e=>e.id!==b.dataset.deleteEvent);persist(state)});document.querySelectorAll('[data-toggle-event]').forEach(b=>b.onclick=()=>{const state=read(),e=state.events.find(x=>x.id===b.dataset.toggleEvent);if(e)e.enabled=!e.enabled;persist(state)});document.querySelectorAll('[data-test-action]').forEach(b=>b.onclick=()=>{const state=read();runAction(state.actions.find(a=>a.id===b.dataset.testAction),{username:'TestUser',giftname:'Rose',gift:'Rose',profileImage:'assets/images/test-profile.svg',combo:5,repeatcount:5,coins:5,__test:true})});document.querySelectorAll('[data-test-event]').forEach(b=>b.onclick=()=>{const state=read(),e=state.events.find(x=>x.id===b.dataset.testEvent);runEvent(e,{username:'TestUser',giftname:e.triggerValue||'Rose',gift:e.triggerValue||'Rose',command:e.triggerValue||'!test',value:e.triggerValue||'',profileImage:'assets/images/test-profile.svg',combo:5,repeatcount:5,coins:5,teamLevel:50,isFollower:true,isSubscriber:true,isModerator:true,isTopGifter:true,__test:true});window.toast?.('Event testat → '+eventActionNames(state,e))})}
  document.addEventListener('click',e=>{if(e.target.closest('[data-extra="actions"]'))setTimeout(renderPage,0)},true);
  window.VyraActionEvent={handleEvent,runAction,runEvent,kanKora,refresh:renderPage,read};
})();
