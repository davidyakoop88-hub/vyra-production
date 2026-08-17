(() => {
  const seen=new Set(),queue=[];let busy=false;
  // Points ledger — awarded/removed by "Add points"/"Remove points" Actions, and (since
  // points-system.js) auto-earned from real live events (coins/shares/likes/chat activity) at
  // configurable rates, matching TikFinity's viewer-economy model. Exposed globally so the Top
  // Points widget (live-leaderboard.js/toplike-studio.js) can read it as a real 'points'
  // liveMetric, and so viewer-triggered Events (action-event-advanced.js) can gate on cost/level.
  const POINTS_KEY='vyra-points-v1';
  const POINTS_SETTINGS_KEY='vyra-points-settings-v1'; // written by points-system.js's settings UI
  function loadPoints(){try{return JSON.parse(localStorage.getItem(POINTS_KEY)||'{}')}catch{return{}}}
  function savePoints(p){try{localStorage.setItem(POINTS_KEY,JSON.stringify(p))}catch{}}
  function pointsKeyFor(username){return String(username||'').replace(/^@/,'').toLowerCase()}
  // 'earned' is a lifetime running total of every positive add() — used for levels, never
  // decreases when points are spent/removed, same as XP vs. spendable currency in most games.
  //
  // raknaSomIntjanat=false ar HELA skillnaden mellan add() och refund() (§15c). En atervandande
  // poang ar inte intjanad; hade den rakhats in i 'earned' kunde en tittare nivat upp genom att
  // med flit svamma over kon och fa tillbaka pengarna om och om igen. Defaulten (undefined) ar
  // dagens beteende exakt, sa add/remove/spend ar oforandrade.
  function adjustPoints(username,delta,raknaSomIntjanat){
    const key=pointsKeyFor(username);if(!key||!delta)return;
    const p=loadPoints();
    const entry=p[key]||{name:username,points:0,earned:0};
    entry.name=username;
    entry.points=Math.max(0,entry.points+delta);
    if(delta>0&&raknaSomIntjanat!==false)entry.earned=(entry.earned||0)+delta;
    p[key]=entry;
    savePoints(p);
  }
  // Level curve: level N requires levelBasePoints*(levelMultiplier^(N-1)) MORE lifetime points
  // than level N-1 needed in total — "the number of points required to reach the next level
  // increases exponentially" (TikFinity's own wording for this exact setting).
  function computeLevel(earned){
    let settings={};try{settings=JSON.parse(localStorage.getItem(POINTS_SETTINGS_KEY)||'{}')}catch{}
    const base=Math.max(1,Number(settings.levelBasePoints)||100),mult=Math.max(1,Number(settings.levelMultiplier)||1.2);
    let level=0,threshold=base,cumulative=0;
    while(cumulative+threshold<=earned&&level<999){cumulative+=threshold;level++;threshold=Math.round(threshold*mult)}
    return{level,pointsIntoLevel:earned-cumulative,pointsForNextLevel:threshold};
  }
  window.VyraPoints={
    get:username=>loadPoints()[pointsKeyFor(username)]?.points||0,
    getTop:(count=10)=>Object.values(loadPoints()).sort((a,b)=>b.points-a.points).slice(0,count),
    add:(username,amount)=>adjustPoints(username,Math.abs(Number(amount)||0)),
    remove:(username,amount)=>adjustPoints(username,-Math.abs(Number(amount)||0)),
    getLevel:username=>computeLevel(loadPoints()[pointsKeyFor(username)]?.earned||0),
    // Returns false (and charges nothing) if the balance is insufficient. amount<=0 always succeeds.
    spend:(username,amount)=>{
      amount=Math.abs(Number(amount)||0);
      if(!amount)return true;
      const key=pointsKeyFor(username);
      if(!key||(loadPoints()[key]?.points||0)<amount)return false;
      adjustPoints(username,-amount);
      return true;
    },
    // Motsatsen till spend, och INTE detsamma som add: saldot atervands utan att 'earned' rors.
    // Anvands nar en betald uppspelning strops av en full ko (§15c) — tittaren ska fa tillbaka
    // sin valuta, inte sin XP.
    refund:(username,amount)=>adjustPoints(username,Math.abs(Number(amount)||0),false)
  };
  const fill=(text='',p={})=>text.replace(/\{(\w+)\}/g,(_,k)=>({username:p.username||p.user||'TestUser',giftname:p.giftname||p.gift||'Rose',repeatcount:p.repeatcount||p.combo||1,coins:p.coins||0,likecount:p.likecount||p.likes||0,totallikecount:p.totallikecount||p.totalLikes||0,comment:p.comment||'',submonth:p.submonth||1,points:window.VyraPoints?.get(p.username||p.user)||0}[k]??''));
  function openDb(){return new Promise((ok,no)=>{const r=indexedDB.open('vyra-action-media',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('files'))r.result.createObjectStore('files')};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
  async function file(meta){if(!meta?.id)return null;const db=await openDb(),value=await new Promise((ok,no)=>{const tx=db.transaction('files');const r=tx.objectStore('files').get(meta.id);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});db.close();return value}
  function allowed(action){const scene=window.VYRA_OVERLAY_SCENE;return !!scene&&Number(action.scene?.number||1)===Number(scene)}
  function stage(action){let host=document.querySelector('#vyraActionRuntime');if(!host){host=document.createElement('div');host.id='vyraActionRuntime';document.body.append(host)}const scene=action.scene||{},el=document.createElement('div');el.className=`vyra-runtime-item ${action.fade?'fade':''}`;el.style.cssText=`--x:${scene.x??160};--y:${scene.y??1450};--w:${scene.width??760};--z:${scene.layer??10}`;host.append(el);requestAnimationFrame(()=>el.classList.add('active'));const ms=Math.max(1,action.duration||6)*1000;setTimeout(()=>el.classList.remove('active'),ms-350);setTimeout(()=>el.remove(),ms);return el}
  // DUCKNING, INTE KOANDE, FOR RENA LJUD (§14). Ett gavoljud hor ihop med sin visuella effekt i
  // tid; laggs det i talkon spelar det tjugo sekunder efter fyrverkeriet det tillhorde. I stallet
  // sanker det sig medan nagon talar. Prenumerationen loper under hela uppspelningen, sa ett ljud
  // som REDAN rullar duckas nar en upplasning borjar — och avregistreras nar ljudet tar slut,
  // annars lacker varje uppspelning en lyssnare mot en dod nod.
  function duckaMedan(el,basvolym,slut){
    el.volume=basvolym*(window.VyraTal?.volymfaktor?.()??1);
    const av=window.VyraTal?.lyssna?.(f=>{el.volume=basvolym*f});
    if(typeof av==='function'){const stang=()=>{av();el.removeEventListener('ended',stang)};el.addEventListener('ended',stang);if(slut)slut(stang)}
  }
  async function playMedia(action,kind,meta){const staticPath=meta?.packagePath;const blob=staticPath?null:await file(meta);if(!staticPath&&!blob)return;const url=staticPath||URL.createObjectURL(blob);if(kind==='audio'){const audio=new Audio(url);duckaMedan(audio,(action.volume??80)/100);if(!staticPath)audio.onended=()=>URL.revokeObjectURL(url);await audio.play().catch(()=>window.toast?.('Webbläsaren blockerade ljudet'));return}const el=stage(action),media=document.createElement(kind==='video'?'video':'img');media.src=url;if(kind==='video'){media.autoplay=true;media.playsInline=true;duckaMedan(media,(action.volume??80)/100);media.onended=()=>el.remove()}media.onload=media.onloadeddata=()=>el.classList.add('loaded');el.append(media);if(!staticPath)setTimeout(()=>URL.revokeObjectURL(url),Math.max(2,action.duration||6)*1000+1000)}
  // EN ACTION TALAR I SAMMA UTRYMME SOM CHATTEN (§14). Forr gick den rakt pa speechSynthesis, och
  // uppmatt startade den 12 ms in i en pagaende chattupplasning — tva roster samtidigt, i det
  // ogonblick en tittare precis betalat for att horas.
  //
  // Vagen gar nu genom VyraTal.koa, och sjalva talandet genom tts-chat.js:s uppspelning nar den
  // finns. Det ar ocksa vad som gor MOLNROSTERNA atkomliga for Actions: en rost vald i TTS Chat
  // bar prefixet `cloud:`, och det vardet sagde speechSynthesis ingenting om — den foll tyst
  // tillbaka pa standardrosten. Bada halvorna av §14 stangs alltsa av samma omkoppling.
  //
  // Saknas nagon av dem talar vi som forr. Hellre en rost i mun pa en annan an ingen rost alls.
  function tts(action,payload){
    const c=action.config||{},text=fill(c.ttsText,payload);
    if(!text)return;
    const opts={voice:c.voice,randomVoice:c.randomVoice,speed:c.speed||1,pitch:c.pitch??1,volume:action.volume??80,language:c.language};
    const spela=()=>window.VyraTtsChat?.tala?.(text,opts)??talaLokalt(text,opts);
    if(window.VyraTal?.koa)return void window.VyraTal.koa({kalla:'action',spela,maxMs:text.length*120});
    spela();
  }
  function talaLokalt(text,opts){
    if(!window.speechSynthesis)return Promise.resolve();
    return new Promise(klar=>{
      const u=new SpeechSynthesisUtterance(text),voices=speechSynthesis.getVoices();
      u.rate=Number(opts.speed)||1;u.pitch=Number(opts.pitch)??1;u.volume=(Number(opts.volume)??80)/100;
      if(voices.length){if(opts.randomVoice)u.voice=voices[Math.floor(Math.random()*voices.length)];else if(opts.voice)u.voice=voices.find(v=>v.name===opts.voice||v.lang===opts.voice)||null}
      u.onend=u.onerror=()=>klar();
      try{speechSynthesis.speak(u)}catch{klar()}
    });
  }
  // Kedjan nedan matchar på delsträng, så ordningen ÄR logiken. 'fan level' måste testas före
  // 'level': widgetnamnen kommer från liveLayerName() i media.js, och både 'Fan Level Up' och
  // 'Gifter Level Up' innehåller 'level'. Med bara level-grenen nådde en regel som pekade på fan-
  // widgeten alltid gifter-widgeten, och streamern såg fel widget spela utan någon ledtråd om varför.
  function runWidget(action,payload){const name=String(action.config?.widget||'').toLowerCase();if(name.includes('firework'))return window.triggerGiftFireworks?.(payload);if(name.includes('follower'))return window.triggerNewFollower?.(payload);if(name.includes('top like'))return window.triggerLikeFountainPop?.(payload);if(name.includes('battle mvp'))return window.triggerBattleMvp?.(payload);if(name.includes('fan level'))return window.triggerFanLevelUp?.(payload);if(name.includes('level'))return window.triggerGifterLevelUp?.(payload);const aliases={'gift campaign':'campaign','heart me goal':'goal'},needle=aliases[name]||name;let liveState;try{liveState=JSON.parse(localStorage.getItem('vyra-state')||'{}')}catch{liveState={}}let widget=liveState?.widgets?.find(w=>String(w.type+' '+(w.title||'')).toLowerCase().includes(needle));let el=widget&&document.querySelector(`[data-id="${CSS.escape(String(widget.id))}"]`);if(el){el.classList.remove('vyra-action-widget-active');void el.offsetWidth;el.classList.add('vyra-action-widget-active');setTimeout(()=>el.classList.remove('vyra-action-widget-active'),Math.max(1,Number(action.duration)||6)*1000);return true}document.dispatchEvent(new CustomEvent('vyra:runtime-widget',{detail:{action,payload}}));return false}
  async function executeNow(detail){const {action,payload={}}=detail,types=action.types||[],c=action.config||{};if(types.includes('picture'))playMedia(action,'picture',action.pictureMedia);if(types.includes('video'))playMedia(action,'video',action.videoMedia);if(types.includes('audio'))playMedia(action,'audio',action.audioMedia);if(types.includes('alert'))document.dispatchEvent(new CustomEvent('vyra:runtime-alert',{detail:{action,payload}}));if(types.includes('tts'))tts(action,payload);if(types.includes('overlay')||types.includes('animation'))runWidget(action,payload);if(types.includes('chat'))document.dispatchEvent(new CustomEvent('vyra:chatbot-send',{detail:{message:fill(c.chatText,payload),action,payload}}));if(types.includes('spotify'))document.dispatchEvent(new CustomEvent('vyra:spotify-play',{detail:{query:c.spotify,action,payload}}));if(types.includes('obsScene'))document.dispatchEvent(new CustomEvent('vyra:obs-scene',{detail:{scene:c.obsScene,action}}));if(types.includes('obsSource'))document.dispatchEvent(new CustomEvent('vyra:obs-source',{detail:{source:c.obsSource,action}}));if(types.includes('webhook')&&c.webhook)fetch(c.webhook,{method:'POST',mode:'no-cors',body:JSON.stringify(payload)}).catch(()=>window.toast?.('Webhook kunde inte nås'));if(types.includes('addPoints'))window.VyraPoints.add(payload.username,c.addPointsAmount||10);if(types.includes('removePoints'))window.VyraPoints.remove(payload.username,c.removePointsAmount||10)}
  // "Hoppa över om nästa action väntar i kön": if the queue already has something waiting behind
  // this action by the time it starts playing, cut its normal duration-wait short (a small
  // transition buffer instead) so the queue doesn't back up — trades "always play the full
  // duration" for "keep the queue moving" when actions are firing faster than they can display.
  function next(){if(busy||!queue.length)return;busy=true;const detail=queue.shift();executeNow(detail).finally(()=>{const skip=detail.action.skipOnNext&&queue.length>0;setTimeout(()=>{busy=false;next()},skip?150:Math.max(1,Number(detail.action.duration)||6)*1000)})}
  // Per-scene max queue length (set in action-scenes.js's scene table) — reads THIS overlay
  // page's own scene number, since each scene runs its own independent copy of this whole file
  // (its own queue/busy state), not a shared one across scenes.
  function sceneMaxQueue(){try{const stored=window.VyraSessionState?.readExtra?.('vyra-scene-settings-v1')??localStorage.getItem('vyra-scene-settings-v1');const settings=JSON.parse(stored||'{}');return Math.max(0,Number(settings[window.VYRA_OVERLAY_SCENE]?.maxQueue)||0)}catch{return 0}}
  // EN STRYPT UPPSPELNING SKA GE PENGARNA TILLBAKA (§15c i docs/tech-debt.md).
  //
  // Bara den har grenen rapporteras. execute() sager nej av fyra skal, och tre av dem ar INTE en
  // forlorad uppspelning: ett trasigt meddelande, en dubbelleverans (seen) och fel scen (allowed)
  // — det sista ar routing, inte en strypning. Notera ocksa ordningen: kogrinden ligger FORE
  // seen.add, sa en avvisad runId hamnar aldrig i seen och kan rapporteras igen fran en annan
  // flik. Mastern dedupar darfor sjalv.
  //
  // 'Hoppa over om nasta action vantar i kon' (skipOnNext) hor INTE hit: den kortar ner en
  // uppspelning som faktiskt sker. Tittaren fick sin effekt, om an kortvarigt.
  function rapporteraStrypt(runId){
    if(!runId)return;
    const bud={runId,skal:'ko-full',at:Date.now()};
    // Tva vagar, precis som utskicket at andra hallet. Ett storage-event nar aldrig sin egen
    // skribent, och den vanligaste uppsattningen ar EN flik som bade drar poangen och droppar
    // uppspelningen — dar hade en ren storage-brygga inte lagat nagonting.
    document.dispatchEvent(new CustomEvent('vyra:action-dropped',{detail:bud}));
    try{localStorage.setItem('vyra-action-refund',JSON.stringify(bud))}catch{}
  }
  function execute(detail){if(!detail?.action||seen.has(detail.runId)||!allowed(detail.action))return false;const maxQueue=sceneMaxQueue();if(maxQueue&&queue.length>=maxQueue){window.toast?.(`Kön är full för Scen ${window.VYRA_OVERLAY_SCENE} (max ${maxQueue}) — action hoppades över och poängen betalas tillbaka`);rapporteraStrypt(detail.runId);return false}seen.add(detail.runId);setTimeout(()=>seen.delete(detail.runId),15000);queue.push(detail);next();return true}
  document.addEventListener('vyra:action',e=>execute(e.detail));addEventListener('storage',e=>{if(e.key==='vyra-action-run'&&e.newValue)try{execute(JSON.parse(e.newValue))}catch{}});window.VyraActionRuntime={execute,queueSize:()=>queue.length+(busy?1:0),clearQueue:()=>queue.splice(0)};
})();
