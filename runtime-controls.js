(function(){
  const PERF_KEY='vyra-performance-mode',PRESET_KEY='vyra-widget-presets-v1';
  let mode=localStorage.getItem(PERF_KEY)||'standard';
  function applyPerformance(){document.documentElement.dataset.performance=mode;localStorage.setItem(PERF_KEY,mode)}
  applyPerformance();

  // Fem alerts delar den har kon: Battle MVP, Gifter Level Up, Fan Level Up, Gift Fireworks och
  // New Follower. En i taget ar avsiktligt - de skulle rita over varandra annars.
  //
  // Taket och maxaldern ar det inte. Kon hade varken, och clear() anropades fran ingenstans: hundra
  // gavor koade hundra fyrverkerier, cirka tio minuter som fortsatte spela langt efter att gavorna
  // slutade. Uppmatt: forsta fyrverkeriet pa 54 ms, andra pa 7 000 ms. En alert som ar en halv minut
  // gammal beskriver inte langre det som hander pa skarmen.
  const queue=[],wrapped=new Set();let busy=false,kastade=0;
  const MAX_VANTANDE=10,MAX_ALDER=30000;
  // Kastet tar de LAGST prioriterade forst, och bland dem den aldsta. Kon ar sorterad fallande pa
  // prioritet och sorteringen ar stabil, sa den gruppen ligger sist i inlaggsordning. Utan det
  // hade en gavostorm kunnat tranga ut en Battle MVP, alltsa precis tvartemot vad prioriteterna
  // sager.
  function trimma(){
    const nu=Date.now();
    for(let i=queue.length-1;i>=0;i-=1)if(nu-queue[i].at>MAX_ALDER){queue.splice(i,1);kastade+=1}
    while(queue.length>MAX_VANTANDE){
      let i=queue.length-1;const p=queue[i].priority;
      while(i>0&&queue[i-1].priority===p)i-=1;
      queue.splice(i,1);kastade+=1;
    }
  }
  function next(){
    if(busy)return;
    // Aldern provas HAR, inte bara vid push. Blockerar en lang Battle MVP kon i tva minuter kommer
    // inga nya push:ar som kan trimma, och det som legat och vantat skulle spela som om det vore
    // farskt. Ratt tidpunkt att fraga "ar det har fortfarande aktuellt" ar nar sloten blir ledig.
    trimma();
    if(!queue.length){
      // Rapporteras nar kon tomts, inte per kastad alert: en storm hade gett nittio rader.
      if(kastade){console.warn('[VYRA queue] kastade '+kastade+' alerts (tak '+MAX_VANTANDE+', maxalder '+(MAX_ALDER/1000)+'s)');kastade=0}
      return;
    }
    busy=true;let job=queue.shift();try{job.run()}catch(e){console.error('[VYRA queue]',e)}setTimeout(()=>{busy=false;next()},Math.max(800,job.duration||5000))}
  window.VyraAlertQueue={push(run,duration=5000,priority=0){queue.push({run,duration,priority,at:Date.now()});queue.sort((a,b)=>b.priority-a.priority);trimma();next()},clear(){queue.length=0;kastade=0},size(){return queue.length+(busy?1:0)},stats(){return{vantande:queue.length,spelar:busy,kastade}}};
  // Kon var sessionsbunden utan att veta om det. cloud-sync.js, goal-client.js, live-client.js och
  // session-state.js river alla sitt vid sessionsslut; den har gjorde inte det, sa en utloggning
  // mitt i en gavostorm lamnade kon kvar och den fortsatte spela forra sessionens alerts.
  function riv(){queue.length=0;busy=false;kastade=0}
  window.VyraSessionState?.registerTeardown?.('alert-queue',riv);
  addEventListener('vyra-session-ended',riv);
    /* GUARDIAN WELCOME ligger pa 8000/5. Varaktigheten ar koreografins tak (4 s) med marginal, sa
     hela "Beskyddet" hinner spelas fardigt innan nasta alert slapps fram. Prioriteten 5 satter den
     under gavor och nivahojningar men over nya foljare: en Guardian ar sallsynt och betydande, men
     en gavostorm ska inte behova vanta pa den.

     ATT DEN STAR HAR AR SJALVA POANGEN. installQueueWrappers byter ut `window.triggerGuardianWelcome`
     mot en koad variant, alltsa AR den globala referensen kon. Panelens testknapp anropar det
     namnet och kan darfor inte kringga kon ens av misstag — till skillnad fran fyrverkeriets
     testknapp (§2), som byggde raketerna direkt pa DOM och behovde lagas i efterhand. */
  const configs={triggerBattleMvp:[8000,10],triggerGifterLevelUp:[6000,8],triggerFanLevelUp:[6000,7],triggerGuardianWelcome:[8000,5],triggerNewFollower:[5000,3],triggerGiftFireworks:[6000,6]};
  function installQueueWrappers(){Object.entries(configs).forEach(([name,[duration,priority]])=>{let fn=window[name];if(typeof fn!=='function'||wrapped.has(fn))return;let queued=function(event){let d=duration;if(name==='triggerBattleMvp')d=(state.widgets.find(w=>w.type==='templateBattleMvp')?.mvpDuration||7)*1000;if(name==='triggerGifterLevelUp')d=(state.widgets.find(w=>w.type==='templateGifterLevel')?.gifterDuration||6)*1000;if(name==='triggerFanLevelUp')d=(state.widgets.find(w=>w.type==='templateFanLevel')?.fanDuration||6)*1000;if(name==='triggerGiftFireworks')d=(state.widgets.find(w=>w.type==='templateGiftFireworks')?.fwDuration||5)*1000;VyraAlertQueue.push(()=>fn(event),d,priority)};wrapped.add(queued);window[name]=queued})}
  setTimeout(installQueueWrappers,500);setTimeout(installQueueWrappers,2200);addEventListener('load',installQueueWrappers);

  /* .gift-fireworks-fx star med sedan raketerna borjade visa den RIKTIGA gavan: deras src ar numera
     en TikTok-CDN-URL som kan fallera, och utan den har traffen bytte de till profilplatshallaren —
     ett ansiktsfoto flygande i ett fyrverkeri. Alla bilder inuti effekten ar gavor. */
  document.addEventListener('error',e=>{let img=e.target;if(!(img instanceof HTMLImageElement)||img.dataset.fallbackApplied)return;img.dataset.fallbackApplied='1';img.src=img.closest('.vyra-gift-face,.streak-gift-face,.campaign-gift-image,.gift-fireworks-fx')?'assets/gifts/events/0001_Rose.png':'assets/images/test/test-profile.png'},true);

  function presets(){try{return JSON.parse(localStorage.getItem(PRESET_KEY)||'{}')}catch{return{}}}
  function savePresets(x){localStorage.setItem(PRESET_KEY,JSON.stringify(x))}
  const oldBind=bind;
  bind=function(){oldBind();if(view!=='editor')return;let w=liveWidget(selected),panel=document.querySelector('.properties');if(!w||!panel||panel.querySelector('.runtime-controls'))return;let box=document.createElement('div');box.className='property-group runtime-controls';box.innerHTML=`<h4>PRESET & PRESTANDA</h4><label>Presetnamn<input id="runtimePresetName" value="${w.title||w.type||'Min preset'}"></label><div class="property-actions"><button id="runtimeSavePreset">Spara preset</button><button id="runtimeLoadPreset">Ladda senaste</button></div><label>Prestanda<select id="runtimePerformance"><option value="low">Låg</option><option value="standard">Standard</option><option value="ultra">Ultra</option></select></label><button id="runtimeResetWidget">Återställ widget</button>`;let del=panel.querySelector('#del');panel.insertBefore(box,del||null);box.querySelector('#runtimePerformance').value=mode;box.querySelector('#runtimePerformance').onchange=e=>{mode=e.target.value;applyPerformance();toast('Prestanda: '+mode)};box.querySelector('#runtimeSavePreset').onclick=()=>{let all=presets(),key=w.type,copy=JSON.parse(JSON.stringify(w));delete copy.id;delete copy.x;delete copy.y;all[key]={name:box.querySelector('#runtimePresetName').value,data:copy};savePresets(all);toast('Preset sparad')};box.querySelector('#runtimeLoadPreset').onclick=()=>{let p=presets()[w.type];if(!p)return toast('Ingen sparad preset');let keep={id:w.id,x:w.x,y:w.y};Object.keys(w).forEach(k=>delete w[k]);Object.assign(w,p.data,keep);save();render();toast(p.name+' laddad')};box.querySelector('#runtimeResetWidget').onclick=()=>{['widgetScale','opacity','hidden','layer'].forEach(k=>delete w[k]);w.widgetScale=1;save();render();toast('Widget återställd')}
  };
})();
