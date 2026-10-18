(function(){const localRuntime=['127.0.0.1','localhost'].includes(location.hostname);const listeners=new Set(),activeUsers=new Set();
// SKRIVBORDSAPPEN FAR INTE NAVIGERA BORT FRAN SINA EGNA ADRESSER.
// electron-app/main.js:97 fanger will-navigate och gor preventDefault() pa allt som inte ar
// localOrigin eller CLOUD_ORIGIN. `location.href = <TikToks URL>` blir darfor EN TYST NOLL i
// appen: ingen navigering, inget fel, ingen logg — knappen ser trasig ut utan att nagot sager
// varfor. Exakt det monstret har redan drabbat fem widgetar i det har repot.
//
// window.open gar en ANNAN vag: den traffar setWindowOpenHandler (main.js:84), som skickar varje
// icke-betrodd https-adress till shell.openExternal — alltsa anvandarens riktiga webblasare.
// Det ar dessutom det enda som FUNGERAR: TikTok avvisar rutinmassigt inloggning i inbaddade
// webblasarfonster, sa ett barnfonster i Electron hade inte hjalpt heller.
//
// Klienten laddas fran vyralive.app AVEN i appen (main.js:82 laddar CLOUD_ORIGIN/studio.html), sa
// localRuntime ar falskt dar — vakten maste darfor sitta pa Electron, inte pa vardnamnet.
const iElectron=/\bElectron\//.test(navigator.userAgent||'');
function oppnaVerifiering(url){
  if(iElectron){window.open(url,'_blank');return{externt:true}}
  location.href=url;return{externt:false};
}
function emit(name,detail){dispatchEvent(new CustomEvent(name,{detail}));listeners.forEach(fn=>fn(detail))}
// SERVERNS KLOCKA (2026-10-18). Under LIVE 2026-10-17 gjorde Like Fountain ingenting: anvandarens
// PC-klocka gick ~+20 s fore (36 NTP-matningar i TikTok LIVE Studios logg). `at`/`timestamp` satts
// av bryggan/servern med SERVERNS klocka, och like-fountain-portal.js kastar allt aldre an 15 s
// mot Date.now() — varje like sag 20 s gammal ut och kastades tyst. battle-fx-auto.js hade 10 s kvar.
//
// Darfor mats skillnaden har, en gang for alla konsumenter: Date-headern pa ett svar fran servern.
// Headern har 1 s upplosning (avrundad nedat), sa ett prov sager bara att serverns tid nar svaret
// skrevs lag i [D, D+1000) och att det hande nagon gang mellan t0 (skickat) och t1 (mottaget) i
// PC-tid. Skillnaden (server - PC) ligger alltsa i [D - t1, D + 1000 - t0]. Varje prov ger ett
// sadant intervall; snittet av flera prov med olika sekundfas krymper det till ungefar
// fram-och-tillbaka-tiden. Uppskattningen ar intervallets mitt. Ett prov som inte overlappar
// (PC-klockan stalldes om) borjar om fran det provet. Inga nya falt mot servern: headern finns redan.
const klocka=(()=>{let lag=-Infinity,hog=Infinity,prov=0,varnad=false,omstart=false;
  // Nollstallningen ar LAT: den gamla uppskattningen galler tills nasta prov ersatter den. Annars
  // hade varje ateranslutning gett ett glapp dar likes raknas med PC-klockan och kastas igen.
  function nollstall(){omstart=true}
  let senast=0,klockUrl=null;
  function matt(t0,t1,datum){const D=Date.parse(datum||'');
    if(!Number.isFinite(D)||!Number.isFinite(t0)||!Number.isFinite(t1)||t1<t0)return false;
    const l=D-t1,h=D+1000-t0;senast=t1;
    if(omstart||(prov&&(l>hog||h<lag))){lag=l;hog=h;prov=1;omstart=false}else{lag=Math.max(lag,l);hog=Math.min(hog,h);prov+=1}
    // En rad i konsolen per ny matomgang, sa att en riktig sandning kan lasa av hur fel PC-klockan gar.
    if(prov===1)console.info('[VYRA live] servertid uppmatt: PC-klockan gar '+(-skillnad())+' ms fore servern (osakerhet +-'+Math.round((hog-lag)/2)+' ms)');
    return true}
  function skillnad(){return prov?Math.round((lag+hog)/2):null}
  // Inga stående timers: en mätning äldre än tio minuter förnyas LATT, nästa gång någon frågar.
  // (En evig timer hade dessutom hållit varje prov som laddar live-client.js vid liv.)
  function serverNu(){const s=skillnad();
    if(s===null){if(!varnad){varnad=true;console.warn('[VYRA live] ingen servertid uppmatt annu — handelsers alder raknas med PC-klockan')}return Date.now()}
    if(klockUrl&&!skurPagar&&Math.abs(Date.now()-senast)>600000)skur();
    return Date.now()+s}
  // Alder i serverns tid for en tidsstampel i ms (eller ett event med at/timestamp).
  function alder(x){const ts=typeof x==='object'&&x?Number(x.at||(x.timestamp&&(Number(x.timestamp)||Date.parse(x.timestamp)))):Number(x);
    return Number.isFinite(ts)&&ts>0?serverNu()-ts:null}
  function info(){return prov?{skillnadMs:skillnad(),osakerhetMs:Math.round((hog-lag)/2),prov}:null}
  // Ett prov mot servern. Svaret behover inte vara ok — bara ha en Date-header.
  async function prova(url){if(typeof fetch!=='function')return false;
    try{const t0=Date.now(),r=await fetch(url,{cache:'no-store'}),t1=Date.now();
      return matt(t0,t1,r&&r.headers&&typeof r.headers.get==='function'?r.headers.get('date'):null)}catch{return false}}
  // Skur om sex prov 170 ms isar (plus svarstiden): fasen mot sekundgransen flyttas minst 170 ms
  // per prov, sa sex prov tacker hela sekunden och snittet fangar gransen. Klar pa ungefar en sekund.
  let skurTimer=null,skurGen=0,skurPagar=false;
  function skur(url,antal=6){if(url)klockUrl=url;if(!klockUrl)return;const mine=++skurGen;if(skurTimer)clearTimeout(skurTimer);skurPagar=true;
    const steg=i=>{if(mine!==skurGen)return;prova(klockUrl).finally(()=>{if(mine!==skurGen)return;
      if(i+1<antal)skurTimer=setTimeout(()=>steg(i+1),170);else{skurTimer=null;skurPagar=false}})};
    steg(0)}
  function stoppa(){skurGen+=1;if(skurTimer)clearTimeout(skurTimer);skurTimer=null;skurPagar=false}
  return{matt,nollstall,skillnad,serverNu,alder,info,skur,stoppa}})();
// EN TILLSTÅNDSMODELL FÖR LIVE (F04). Toppraden sa "TikTok ansluten · @x" (grön) samtidigt som
// LIVE-kontroll sa "SERVER Offline" och "TIKTOK Väntar på connector". Bägge hade rätt om sin egen
// källa och fel om helheten:
//   * I webbläget betyder molnets connection.connected bara att raden i tiktok_connections är
//     AKTIV (shape() nedan, c.active) — att kontot är sparat och att bryggmanagern ska försöka.
//     Det säger ingenting om att bryggan faktiskt har kontakt med en LIVE.
//   * LIVE-kontroll drevs av vyra-server-status, som bara den lokala servern (skrivbordsgrenen)
//     skickar. I webbläget kom den aldrig, så korten stod kvar på sitt startläge "Offline".
// Modellen byggs BARA av sådant som redan finns: statussvaret, om den lokala servern svarar, och
// den aktiva livesessionen (live-session-client.js, servern äger den och den kommer via SSE).
// Inga nya fält mot servern eller bryggan. Grönt (gron) betyder att LIVE-händelser kan komma fram.
const EJ_LOPANDE={paused:1,suspended:1};
function byggLiveTillstand(d,{lage='webb',online=null,aktivSession=null}={}){
  const c=(d&&d.connection)||{},st=String(c.state||'idle');
  const konto=String(c.username||'').replace(/^@/,'').trim()||null,at=konto?' · @'+konto:'';
  let connector='väntar',connectorText='Väntar på connector',text=konto?'TikTok-konto sparat'+at:'Anslut TikTok',klass='';
  const ansluten=()=>{connector='ansluten';connectorText='Ansluten';text='Ansluten till LIVE'+at};
  if(lage==='webb'){
    // Molnets connected:true är ett SPARAT konto, inte en anslutning. Först när servern har
    // startat en livesession vet vi att bryggan levererar.
    if(aktivSession)ansluten();
    else if(st==='connecting'){connector='ansluter';connectorText='Ansluter…';text='Ansluter till TikTok…'}
  }else if(online===false){connector='fel';connectorText='Lokala servern svarar inte';text='VYRA Desktop svarar inte'}
  else if(c.connected&&!EJ_LOPANDE[st])ansluten();
  else if(st==='paused'){connector='pausad';connectorText='Sändningen pausad';text='Sändningen pausad';klass='pausad'}
  else if(st==='suspended'){connector='fel';connectorText='Stoppad av TikTok';text='Sändningen stoppad av TikTok';klass='pausad'}
  else if(st==='connecting'){connector='ansluter';connectorText='Ansluter…';text='Ansluter till TikTok…'}
  else if(st==='reconnecting'){connector='ansluter';connectorText='Återansluter';text='TikTok återansluter · försök '+(c.reconnectAttempt||1)}
  else if(st==='stale'){connector='fel';connectorText='Signal saknas';text='TikTok-signal saknas'}
  // SERVERKORTET. I webbläget finns ingen lokal server att vara offline — där visas molnet,
  // neutralt, och bara ett faktiskt fel mot molnet varnar. Kortet blir aldrig grönt: en server
  // som svarar är inte samma sak som att händelser kommer fram.
  const server=lage==='webb'
    ?{namn:'MOLNET',text:d&&d.molnFel?'Svarar inte':'Webbläge',varning:!!(d&&d.molnFel)}
    :{namn:'SERVER',text:online===false?'Offline':online?'Online':'Kontrollerar…',varning:online===false};
  return{lage,konto,connector,live:aktivSession?'aktiv':'inte aktiv',connectorText,text,gron:connector==='ansluten',klass,server};
}
const liveLage={status:null,online:null};
function aktivLiveSession(){try{return window.VyraLiveSession?.runtime?.().aktivSession()||null}catch{return null}}
// d skickas med när anroparen målar ett eget mellanläge (studio-live.js: "Ansluter…" under ett
// tryck); annars gäller senaste statussvaret.
function liveTillstand(d){return byggLiveTillstand(d===undefined?liveLage.status:d,{lage:localRuntime?'desktop':'webb',online:liveLage.online,aktivSession:aktivLiveSession()})}
let senasteLiveTillstand='';
function meddelaLiveTillstand(){const m=liveTillstand(),k=JSON.stringify(m);if(k!==senasteLiveTillstand){senasteLiveTillstand=k;dispatchEvent(new CustomEvent('vyra-live-tillstand',{detail:m}))}return m}
addEventListener('vyra-live-session',()=>meddelaLiveTillstand());
// KLIENTGRANSEN FOR #133. Bade `coins` och `diamonds` satts till samma tal, och `diamonds`
// vinner nar bada finns. Sedan steg 2 laser konsumenterna `diamonds` forst och `coins` bara som
// reserv for en aldre .exe — `coins` skrivs fortfarande, eftersom cachad widgetkod i OBS kan
// lasa det.
//
// Beteendet bevakas av tests/browser/diamanter-vid-gransen.browser.test.js. Kalltextsvakten
// i tests/diamanter-faltnamn.test.js pinnar uttrycket nedan och ar blind for allt som skriver
// over resultatet EFTERAT — bada behovs.
//
// TODO(#133): ta bort `coins` — BLOCKERAT tills v1.2.3 ar ersatt i produktion.
//
// Villkoret ar inte "nagon gang" utan tva matbara saker:
//   1. Den PUBLICERADE .exe:n ar inte langre 1.2.3. Den skickar bara `coins` — `diamonds` kom
//      i #280 (1.2.4), som ar mergad men ALDRIG TAGGAD. Leveransen gar via Microsoft Store.
//      Kontroll: jamfor senaste release-taggen mot electron-app/package.json.
//   2. Ingen kvarvarande installation kor 1.2.3. En .exe uppdateras inte retroaktivt, sa det
//      racker inte att en ny version finns — den maste vara utrullad.
//
// Tas `coins` bort innan bada galler blir varje gava fran en gammal klient vard NOLL — tyst,
// och bara for de anvandarna. Ingen widget kraschar, inga prov faller, summorna blir bara fel.
//
// Nar det ar dags: `coins` finns pa tre stallen i skrivvagen (den har filen, den andra bryggan,
// och normaliseringen i live-client.js). Den sparade localStorage-staten i live-leaderboard.js
// ar redan migrerad till `diamonds` (steg 2) och laser `coins` bara som reserv.
function liveEventTriggers(e){let t=String(e.type||e.event||'').toLowerCase().replace(/[\s_-]/g,''),username=e.username||e.uniqueId||e.user,first=!!username&&!activeUsers.has(String(username).toLowerCase()),payload={username,name:e.name||username,gift:e.giftName||e.gift,giftname:e.giftName||e.gift,giftImage:e.giftImage||'',profileImage:e.profileImage||e.avatarUrl,coins:Number(e.diamonds??e.coins??e.diamondCount??0),diamonds:Number(e.diamonds??e.coins??e.diamondCount??0),count:Number(e.count||e.repeatCount||1),repeatcount:Number(e.count||e.repeatCount||1),combo:Number(e.count||e.repeatCount||1),teamLevel:Number(e.teamLevel||e.fanClubLevel||0),isFollower:!!e.isFollower,isSubscriber:!!(e.isSubscriber||e.isMember),isModerator:!!e.isModerator,isTopGifter:!!e.isTopGifter,isAnonymous:!!e.isAnonymous,value:e.value??e.name??e.giftName??e.gift??username};let out=[];
  if(first){activeUsers.add(String(username).toLowerCase());out.push(['firstActivity',payload])}
  if(t==='gift'||t==='giftcombo'){const giftPayload={...payload,value:payload.gift};out.push(['gift',giftPayload],['giftCoins',giftPayload]);if(payload.count>1||t==='giftcombo')out.push(['giftCombo',giftPayload])}
  else if(t==='follow')out.push(['follow',{...payload,isFollower:true}]);
  else if(t==='member'||t==='subscribe'||t==='subscription')out.push(['member',{...payload,isSubscriber:true}]);
  else if(t==='join'||t==='roomuser')out.push(['join',payload]);
  // SUPER FAN-ENTRÉN (#361 fynd 2). Bryggan skickar typen 'superfan' ur TikToks BARRAGE, med nivån i
  // fanClubLevel — den landar i payload.teamLevel ovan, sa teamnivåfiltret i Actions fungerar direkt.
  else if(t==='superfan')out.push(['superfan',payload]);
  else if(t==='share')out.push(['share',payload]);
  else if(t==='likes'||t==='like')out.push(['likes',{...payload,value:payload.count,likecount:payload.count,totallikecount:e.points??e.totalLikes??e.totalLikeCount??0}]);
  else if(t==='chatcommand'||t==='command')out.push(['chatCommand',{...payload,command:e.command||e.name,value:e.command||e.name}]);
  else if(t==='chat'||t==='comment'){const text=String(e.comment||e.name||'');out.push(['chat',{...payload,comment:text,value:text}]);if(text.trim().startsWith('!'))out.push(['chatCommand',{...payload,command:text.trim().split(/\s+/)[0],value:text.trim().split(/\s+/)[0],comment:text}])}
  // EN FAN CLUB-STICKER AR EN EMOTE MED emoteScene 2 (FANS_CLUB). Bada kommer i TikToks
  // WebcastEmoteChatMessage och bryggan skickar dem som samma typ, `subscriberemote`.
  //
  // `fanclubsticker` nedan var DOD KOD: uppmatt 2026-09-16 emitterar ingenting i hela kedjan den
  // typen — varken normalizer.js, bridge.js eller tiktok-service.js — sa `fanSticker` var en
  // trigger som fysiskt aldrig kunde fyra. Den star kvar som reservvag ifall en framtida kalla
  // skickar en egen typ, men den riktiga vagen ar scenen.
  else if(t==='subscriberemote'||t==='fanclubsticker'||t==='fansticker'){
    const id=e.emote||e.sticker||e.name;
    const arSticker=arFanklubb(e)||t==='fanclubsticker'||t==='fansticker';
    out.push([arSticker?'fanSticker':'subscriberEmote',{...payload,value:id,emote:id,emoteScene:e.emoteScene}]);
  }
  else if(t==='shoppurchase'||t==='purchase')out.push(['shopPurchase',{...payload,value:e.productName||e.name}]);
  // EN MANUELL KNAPP (Stream Deck och liknande). Den ska kunna kora en Action utan att PASTA att
  // en tittare gjorde nagot: ett falskt `gift` hade rakat upp mal, topplistor och sandnings-
  // historik, och i en matsandning forstort sjalva underlaget.
  //
  // MATT 2026-09-15 mot den verkliga local-server.js, inte antaget:
  //   - typen 'knapp' overlever cleanEvent (200, typen ordagrant tillbaka)
  //   - `value` STRYKS av den vitlistan, men `eventKey` overlever — darfor bar knappen sin
  //     identitet i eventKey och packas upp till `value` har, dit Action & Event laser den
  //   - eventet speglas ALDRIG till molnet: local-server.js:215 grenar pa TILL_MOLNET och
  //     'knapp' star inte dar. Ingen ingest-budget, ingen molnstatistik, ingen 400-spam
  //   - topplistan ar inert: live-leaderboard.js:111 grenar bara pa gift/giftcombo
  //
  // SKICKA INGET `username` FRAN KNAPPEN. `first` hogst upp ar sant for ett namn som inte setts
  // forut, och da fyras firstActivity OCKSA — en Action bunden dit hade kort vid varje tryck med
  // ett nytt namn. Utan username ar `first` falskt och bara 'knapp' gar ut.
  //
  // Actions spelas bara i OBS-utgangen: allowed() i action-runtime.js kraver
  // window.VYRA_OVERLAY_SCENE. Ett tryck gor darfor ingenting synligt i Studion, och det ar
  // avsiktligt — se provet "i studion spelas ingen action alls" i action-event-kedjan.test.js.
  else if(t==='knapp')out.push(['knapp',{...payload,value:e.eventKey||payload.value}]);
  return out}
// Single entry point for one live event, regardless of transport — the local poll loop below
// calls this for every polled event, and overlay-access.js's cloud SSE handler calls
// `VyraLive.ingest(event)` directly for every 'live' message it receives. Keeping this as one
// shared function (instead of duplicating the routing in both places) is what makes the cloud
// SSE path actually drive widget animations the same way the local demo/bridge path already did.
// Subscriber emotes have no human-readable name (TikTok only gives an opaque emoteId), so the
// Events picker can't ship with a fixed catalog like gifts have. Instead it offers whatever emotes
// have actually appeared live, most-recent-first, capped so a long session doesn't grow forever.
// EN FAN CLUB-STICKER KANNS PA `packageId`, INTE PA `emoteScene`.
//
// UPPMATT 2026-09-16 mot 156 emotes i tre skarpa inspelningar: `packageId` sade 'fansclub' i 150
// av dem, medan scenen var 2 i 59 fall och 3 i 97 — och 3 finns inte ens i TikToks eget
// proto-enum (SUBSCRIPTION=0, GAME=1, FANS_CLUB=2). Ett forsta forsok klassade pa scenen och hade
// darmed stamplat 97 fanklubbs-stickers som prenumerationsemotes.
//
// EN agare av fragan: bade triggern och inlarningen fragar harifran, sa de kan inte glida isar.
function arFanklubb(e){
  return String(e?.emotePaket||e?.packageId||'').toLowerCase()==='fansclub';
}
function recordSeenEmote(e){
  const type=String(e.type||e.event||'').toLowerCase().replace(/[\s_-]/g,'');
  const id=e.emote||e.sticker;
  if(!['subscriberemote','fanclubsticker','fansticker'].includes(type)||!id)return;
  try{
    // TVA LISTOR, INTE EN. Valjaren for Fan Club-stickers visade forr subscriber-emotes, for bada
    // hamtades ur samma nyckel. Facit har dem som tva skilda val med varsin bildlista, och
    // emoteScene 2 (FANS_CLUB) ar det enda som skiljer dem at i TikToks data.
    const arSticker=arFanklubb(e)||type!=='subscriberemote';
    const KEY=arSticker?'vyra-seen-stickers-v1':'vyra-seen-emotes-v1';
    const list=JSON.parse(localStorage.getItem(KEY)||'[]').filter(x=>x.id!==id);
    list.unshift({id,image:e.giftImage||'',lastSeen:Date.now()});
    localStorage.setItem(KEY,JSON.stringify(list.slice(0,40)));
  }catch{}
}
// Same reasoning as recordSeenEmote — TikTok gives no "pick from your followers" API to any
// third-party connector (confirmed: no fetchFollowers/userList route exists anywhere in
// tiktok-live-connector), so the Events "specific user" picker can't ship with a real follower
// list either. Every live event already carries a real username, so capture-as-seen is the only
// technically honest way to offer a picker instead of free text.
// GAVOKATALOGEN LARS IN LIVE, av exakt samma skal som emotes (se bridge.js:553): det finns ingen
// lista att hamta fran webblasaren. Serverns `gavokatalog` ar ADMIN-ONLY (/api/admin/gavokatalog)
// och nas inte harifran, och den statiska assets/gifts/gifts-manifest.js bar bara ENGELSKA namn
// utan coin-varde — medan TikTok levererar katalogen pa streamerns eget sprak.
//
// UPPMATT MOT FACIT: TikFinity visar `Basketboll`, `Kor hart!`, `Morgonblommor` och `1 Coins` per
// rad. Vart manifest sager `Basketball` och inget varde alls. Ett inlart namn ar darfor ALLTID
// battre an manifestets: det kommer fran samma kalla som sjalva gavan.
//
// Vardet skrivs bara over nar vi faktiskt har ett — en combo-post utan coins ska inte nolla ett
// varde vi redan lart oss.
function recordSeenGift(e){
  const type=String(e.type||e.event||'').toLowerCase().replace(/[\s_-]/g,'');
  if(type!=='gift'&&type!=='giftcombo')return;
  const namn=e.giftName||e.gift;
  if(!namn)return;
  try{
    const KEY='vyra-seen-gifts-v1';
    const lista=JSON.parse(localStorage.getItem(KEY)||'[]');
    const gammal=lista.find(x=>x.name===namn)||{};
    const kvar=lista.filter(x=>x.name!==namn);
    const coins=Number(e.diamonds??e.coins??e.diamondCount??0)||0;
    kvar.unshift({
      name:namn,
      image:e.giftImage||gammal.image||'',
      coins:coins||gammal.coins||0,
      giftId:e.giftId||gammal.giftId||'',
      lastSeen:Date.now()
    });
    localStorage.setItem(KEY,JSON.stringify(kvar.slice(0,200)));
  }catch{}
}
function recordSeenUser(e){
  const username=e.username||e.uniqueId||e.user;
  if(!username)return;
  try{
    const KEY='vyra-seen-users-v1';
    const id=String(username).replace(/^@/,'');
    const list=JSON.parse(localStorage.getItem(KEY)||'[]').filter(x=>x.username.toLowerCase()!==id.toLowerCase());
    list.unshift({username:id,name:e.name||id,profileImage:e.profileImage||e.avatarUrl||'',lastSeen:Date.now()});
    localStorage.setItem(KEY,JSON.stringify(list.slice(0,60)));
  }catch{}
}
// Normalize the same follower/subscriber/moderator/top-gifter booleans onto the raw event that
// liveEventTriggers() below already computes into its own throwaway `payload` for Actions & Events
// — that normalized shape never made it onto `e` itself, so anything listening directly to
// 'vyra-live-event' (points-system.js's subscriber bonus, tts-chat.js's audience gating) was
// always reading undefined fields off the raw event and silently never matching.
// isModerator/isFollower/isSubscriber/fanClubLevel now arrive as real fields on `e` from
// tiktok-bridge/normalizer.js and electron-app/tiktok-service.js (TikTok's userIdentity/fansClub
// data) — only chat/gift/emote messages actually carry userIdentity, so those three booleans stay
// false on other event types regardless of the viewer's real status; that's a TikTok protocol
// limit, not a bug. isTopGifter has no TikTok field at all — it's computed here by checking whether
// this event's sender is currently #1 on the session's own coin leaderboard.
function normalizeUserFlags(e){
  const t=String(e.type||e.event||'').toLowerCase().replace(/[\s_-]/g,'');
  e.isFollower=!!e.isFollower||t==='follow';
  e.isSubscriber=!!(e.isSubscriber||e.isMember)||t==='member'||t==='subscribe'||t==='subscription';
  e.isModerator=!!e.isModerator;
  const topGifter=window.VyraLeaderboard?.getTop('diamonds',1)[0];
  e.isTopGifter=!!e.isTopGifter||(!!e.username&&!!topGifter&&String(topGifter.username||'').toLowerCase()===String(e.username).toLowerCase());
  e.isAnonymous=!!e.isAnonymous;
  e.teamLevel=Number(e.teamLevel||e.fanClubLevel||0);
  return e;
}
// The cloud pipeline and the desktop runtime disagree on two field names, and every widget was
// written against the desktop shape. server/event-bus.js's cleanEvent() emits `profileUrl`, while
// live-leaderboard.js, media.js and last-x-alerts.js all read `profileImage` — nothing in the whole
// client reads `profileUrl`, so on vyralive.app every avatar silently stayed on test-profile.svg
// while the same widget showed real photos in the desktop build. Same story for the gift value:
// `value` on the wire, `coins` in most readers.
//
// Normalizing once here rather than at ~15 call sites keeps the widgets' shape as the single one
// they were built for, and is a no-op on desktop where the fields already arrive named this way.
// Normaliseringen bor i cloud-fields.js sedan 2026-09-06. Den laddas av media.js FORE den har
// filen, och av de fristaende widgetsidorna fore base-widget.js.
//
// SKALET ar en riktig bugg: den har filen hade en egen kopia och base-widget.js en annan, och
// NFKC-fixen (#342) landade bara i den ena. De fristaende OBS-lankarna visade darfor rutor i
// stallet for namn i tre veckor efter att buggen var "lagad".
//
// Saknas modulen ar det ett laddningsfel, inte ett lage att tacka over: en tyst reserv har hade
// aterinfort exakt den halva leverans som fixen skulle ta bort.
function normalizeCloudFields(e){
  const m=(typeof window!=='undefined'?window:globalThis).VyraCloudFields;
  if(!m)throw new Error('cloud-fields.js ar inte laddad - normaliseringen kan inte koras');
  return m.normalizeCloudFields(e);
}
// Every way an event can reach a consumer funnels through ingest(): the SSE stream, the desktop
// poll loop, and live-leaderboard.js's history fetch. The gate therefore belongs here and nowhere
// else — a second gate downstream would be a second place to forget.
//
// frameId is the SSE frame's own id, which the server stamps with the Redis stream id
// (server/index.js: `id: ${item.streamId}`). It is the only identifier guaranteed unique and ordered
// per workspace; the bridge's own event.id is the fallback for the desktop path, which has no
// stream behind it.
// The gate is keyed to the stream it describes, not to the browser. Studio can move between
// workspaces without a reload — cloud-sync's conflict dialog does exactly that — and an overlay tab
// can be pointed at a different access token, so a gate built once at load would carry the previous
// stream's high-water into one that has never seen it and drop every event as stale. It is rebuilt
// whenever the identity changes.
//
// A workspace id is not a credential and is used verbatim, which keeps the stored key readable while
// debugging. An access token is, so it goes through the one-way digest and never reaches storage.
function safeSessionStorage(){try{return sessionStorage}catch(_){return null}}
function currentNamespace(){
  const workspace=window.VyraAuth?.lastDetail?.()?.workspaces?.[0]?.id;
  if(workspace)return window.VyraDedupe?window.VyraDedupe.namespace(workspace,{sensitive:false}):String(workspace);
  const access=new URLSearchParams(location.search).get('access');
  if(access)return window.VyraDedupe?window.VyraDedupe.namespace(access):'anon';
  return 'anon';
}
let gateNamespace=null,eventGate={accept:()=>true};
function gateFor(){
  const ns=currentNamespace();
  if(ns!==gateNamespace){
    gateNamespace=ns;
    eventGate=window.VyraDedupe
      ? window.VyraDedupe.create(safeSessionStorage(),'vyra-seen-events',ns)
      : {accept:()=>true};
  }
  return eventGate;
}
function ingest(e,frameId){
  // SANDNINGSBESKED AR INTE LIVEEVENT. `live:start`/`live:end` kommer pa samma kanal som gavor och
  // likes (publishInternal lagger dem i samma strom), men de ar KONTROLLbesked: de ska aldrig
  // skrivas till `vyra-live-event`, aldrig trigga en Action och aldrig na en widget som ett event.
  //
  // De gar heller inte genom eventgrinden ovan: den dedupar pa TRANSPORT-id, och samma logiska
  // sandningsbesked kommer med olika id efter en ateranslutning och helt utan id fran snapshotet.
  // Dedupen for de har beskeden ligger pa eventId i live-session-client.js.
  if(e&&e.type==='livesession'){window.VyraLiveSession?.runtime?.().behandla(e);return}
  if(!gateFor().accept(frameId||e?.id))return;
  normalizeCloudFields(e);
  normalizeUserFlags(e);
  // Skarpa profilbilder: byter 72 px-avataren mot profilsidans 1080 px när den är känd, annars
  // köar ett uppslag (vyra-stor-avatar.js). Synkront, så widgetarna nedströms ser den stora.
  if(window.VyraStorAvatar)window.VyraStorAvatar.forbattra(e);
  try{localStorage.setItem('vyra-live-event',JSON.stringify(e))}catch{}
  emit('vyra-live-event',e);
  // SIMULERADE EVENT FAR INTE LARAS IN.
  //
  // Simulatorn skickar sina event genom ingest() med flit — hela poangen ar att de ska ga samma
  // vag som ett riktigt event. Men inlarningen ar en PASTAENDE om verkligheten: en gava i
  // valjaren markt som inlard sager "den har gavan har skickats i din sandning", och en
  // anvandare i valjaren sager "den har personen har varit har".
  //
  // Uppmatt 2026-09-16: `TestFollower`, `TestSharer`, `TestSubscriber`, `TestLiker` och
  // `TestGifter` lag redan i anvandarvaljaren hos alla som nagonsin tryckt pa en simuleringsknapp,
  // eftersom recordSeenUser aldrig skilde pa riktigt och simulerat. Med gavokatalogen hade samma
  // hal gett en falsk `Rose / 1 coins` markt som inlard.
  //
  // Triggrarna kors fortfarande — bara minnet lamnas i fred.
  if(!e||!e.__simulerad){
    recordSeenEmote(e);
    recordSeenGift(e);
    recordSeenUser(e);
  }
  // ISOLERAD MED FLIT. routeLiveBattleEvent ar inte en funktion utan en KEDJA: battle-mvp-,
  // fan-level-, gifter-level-, gift-fireworks- och guardian-session lindar alla samma namn, var och
  // en runt den forra. Kastade nagon av dem gick undantaget rakt igenom ingest och raden nedanfor
  // kordes aldrig — hela Actions & Events tystnade for det eventet, utan att nagot i panelen sa
  // varfor. En trasig widget far ta med sig sin egen widget, inte anvandarens Actions.
  // Triggeranropen sjalva ligger redan i VyraAlertQueue:s try/catch, men FORST efter att
  // runtime-controls.js bytt ut funktionerna (500 ms / 2200 ms / load) — och det skyddar inget av
  // det en session gor utanfor sjalva triggern.
  // Fangsten loggar: en tyst catch hade bara bytt en synlig bugg mot en osynlig.
  if(typeof routeLiveBattleEvent==='function'){try{routeLiveBattleEvent(e)}catch(err){console.error('[VYRA live] widgetkedjan kastade, Actions kors anda',err)}}
  if(window.VyraActionEvent)liveEventTriggers(e).forEach(([trigger,payload])=>window.VyraActionEvent.handleEvent(trigger,payload));
}
// Webblaget (ingen VYRA Desktop): anslutningen registreras i molnet istallet for att oppnas harifran.
// PUT lagger raden i tiktok_connections; tiktok-bridge/connection-manager.js ser den och startar en
// bridge-process pa servern som skickar events till /api/events/tiktok/:workspaceId. Sjalva event-
// stromen ut till widgets gar redan via SSE (base-widget.js), sa inget mer behovs pa klientsidan.
if(!localRuntime){
  const workspaceId=()=>window.VyraAuth?.lastDetail?.()?.workspaces?.[0]?.id||null;
  const cloud=async(method,payload)=>{const id=workspaceId();
    if(!id)throw Error('Logga in for att ansluta TikTok LIVE');
    const r=await window.VyraAuth.api(`/api/workspaces/${id}/tiktok-connection`,
      payload===undefined?{method}:{method,body:JSON.stringify(payload)});
    return r};
  // verifieringKravs och verifierad reser MED statusen. Klienten far aldrig gissa serverns lage:
  // gissar den fel visar den ett fritextfalt som rutten anda avvisar, eller doljer ett falt som
  // fortfarande fungerar.
  const shape=(c,extra={})=>({ok:true,localRuntime:false,cloud:true,...extra,
    connection:c&&c.active?{connected:true,state:'cloud',username:c.tiktok_username,
                            verifierad:!!c.verifierad_at,visningsnamn:c.visningsnamn||null,avatarUrl:c.avatar_url||null}
                          :{connected:false,state:'idle'}});
  window.VyraLive={
    status:async()=>{let d;try{const r=await cloud('GET');d=shape(r.connection,{verifieringKravs:!!r.verifieringKravs})}
      // molnFel bara när ett anrop faktiskt gjordes och föll — utan arbetsyta är det inget molnfel.
      catch{d={ok:true,localRuntime:false,cloud:true,molnFel:!!workspaceId(),connection:{connected:false,state:'idle'}}}
      liveLage.status=d;meddelaLiveTillstand();return d},
    tillstand:liveTillstand,byggTillstand:byggLiveTillstand,
    connect:async username=>shape((await cloud('PUT',{username})).connection),
    // VERIFIERING. Servern bygger TikToks egen URL (den bär state + PKCE) och vi skickar dit
    // webbläsaren. Vi öppnar INTE ett popup-fönster: TikToks inloggning avvisas i vissa inbäddade
    // fönster, och en blockerad popup ser för användaren ut som att knappen är trasig.
    // Återvägen är /api/auth/callback/tiktok, som omdirigerar till studio.html?tiktok=…
    verifiera:async()=>{const id=workspaceId();
      if(!id)throw Error('Logga in för att verifiera ditt TikTok-konto');
      const r=await window.VyraAuth.api(`/api/workspaces/${id}/tiktok-verifiering`,{method:'POST',body:'{}'});
      if(!r||!r.url)throw Error('Servern lämnade ingen verifieringslänk');
      return{ok:true,...oppnaVerifiering(r.url)}},
    // ANSLUT NU. Servern svarar 202 och skriver en tidsstampel; bryggmanagern ser den pa sin
    // nasta tick. Det ar alltsa inte ett omedelbart svar om att anslutningen lyckats — bara att
    // begaran tagits emot. Klienten far inte pasta mer an sa.
    anslutNu:async()=>{const id=workspaceId();
      if(!id)throw Error('Logga in för att ansluta');
      return await window.VyraAuth.api(`/api/workspaces/${id}/tiktok-connection/anslut-nu`,{method:'POST',body:'{}'})},
    disconnect:async()=>shape((await cloud('DELETE')).connection),
    // TESTEVENT I WEBBLÄGET (F03). Molnet har POST /api/test/event/:workspaceId: samma
    // eventBus/SSE-väg som riktiga händelser, men ingen skrivning till Postgres, så mål rörs inte.
    // VyraAuth.api skickar X-VYRA-CSRF, som den gemensamma sessionsraden kräver för POST.
    // Servern läser value, inte coins — därför mappas coins/diamonds hit. 202 = mottaget.
    send:async(ev={})=>{const id=workspaceId();
      if(!id)throw Error('Logga in för att skicka testevent');
      const e=ev||{},body={type:e.type,username:e.username||e.name,giftName:e.giftName,count:e.count,value:e.value??e.coins??e.diamonds};
      return await window.VyraAuth.api(`/api/test/event/${id}`,{method:'POST',body:JSON.stringify(body)})},
    on(fn){listeners.add(fn);return()=>listeners.delete(fn)},
    mapEvent:liveEventTriggers,ingest,closeStream,
    // Serverns klocka (se `klocka` ovan). Konsumenter som jamfor en serverstampel med "nu" ska
    // anvanda serverNu() i stallet for Date.now(): PC-klockan kan ga 20 s fel.
    serverNu:klocka.serverNu,alder:klocka.alder,klocka:klocka.info};
  // /health/live ar billigast tankbara svar (ingen databas). Pa vyralive.app nar den inte API:t
  // (uppmatt 2026-10-18: 404 fran framsidan) — men aven 404-svaret bar en Date-header fran samma
  // NTP-synkade kant, och prova() kraver bara headern, inte ett ok-svar.
  const KLOCK_URL='/health/live';
  klocka.skur(KLOCK_URL);
  // Subscribe to the workspace event stream. Without this Studio never saw a single live event in
  // web mode: the desktop build gets them from its poll() loop against the local server, and OBS
  // widgets open their own EventSource, but the Studio canvas had no source at all — so widgets
  // sat on their placeholder data and only the auto-play flip animation moved.
  let stream = null, streamGeneration = 0, onLiveMessage = null, tappad = false;
  // Namngiven callback med generationsvakt. Bada behovs: en anonym pil kan inte tas bort med
  // removeEventListener, och close() garanterar inte att redan kolagda meddelanden uteblir - sa
  // vakten sitter i callbacken, inte i strommen.
  function closeStream() {
    streamGeneration += 1;
    if (stream) {
      if (onLiveMessage) stream.removeEventListener('live', onLiveMessage);
      stream.onerror = null;
      try { stream.close() } catch (_) {}
    }
    stream = null; onLiveMessage = null; activeUsers.clear();
  }
  function openStream() {
    const id = workspaceId();
    if (!id || stream) return;
    const mine = streamGeneration;
    stream = new EventSource(`/api/workspaces/${id}/events/stream`);
    onLiveMessage = message => {
      if (mine !== streamGeneration) return;
      let payload;
      try { payload = JSON.parse(message.data) } catch { return }
      if (!payload || payload.type === 'heartbeat') return;
      ingest(payload, message.lastEventId);
    };
    stream.addEventListener('live', onLiveMessage);
    // Ateranslutning efter ett tapp = mat om klockan (en sovande dator kan ha stallts om). Forsta
    // oppningen behover ingen egen skur: den vid sidladdningen pagar redan.
    stream.addEventListener('open', () => { if (mine !== streamGeneration || !tappad) return; tappad = false; klocka.nollstall(); klocka.skur(KLOCK_URL) });
    // EventSource reconnects on its own; drop the handle if the workspace goes away so a later
    // login can open a fresh one rather than reusing a stream bound to the previous workspace.
    stream.onerror = () => { tappad = true; if (stream && stream.readyState === EventSource.CLOSED) stream = null };
  }
  window.VyraSessionState?.registerTeardown?.('live-client', closeStream);
  addEventListener('vyra-session-ended', closeStream);
  addEventListener('vyra-auth-ready', openStream);
  openStream();
  setTimeout(openStream, 2000);

  dispatchEvent(new CustomEvent('vyra-cloud-live-ready'));return}
const API='/api';let last=Number(sessionStorage.getItem('vyra-last-live-event')||0),online=false;async function json(url,options){const t0=Date.now();let r=await fetch(API+url,{cache:'no-store',headers:{'Content-Type':'application/json'},...options});klocka.matt(t0,Date.now(),r&&r.headers&&typeof r.headers.get==='function'?r.headers.get('date'):null);let d=await r.json().catch(()=>null);if(!r.ok)throw Error(d?.error||'Serverfel '+r.status);return d}async function status(){try{let d=await json('/status');liveLage.status=d;liveLage.online=true;if(!online){online=true;klocka.nollstall();emit('vyra-server-status',d)}meddelaLiveTillstand();return d}catch(e){liveLage.online=false;if(online){online=false;emit('vyra-server-offline',{error:e.message})}meddelaLiveTillstand();throw e}}
let pollTimer=null,pollGeneration=0,pollStopped=false;async function poll(){const mine=pollGeneration;try{let d=await json('/events?after='+last);if(mine!==pollGeneration)return;for(let e of d.events||[]){last=Math.max(last,Number(e.id)||0);sessionStorage.setItem('vyra-last-live-event',last);ingest(e)}}catch{}finally{if(mine===pollGeneration&&!pollStopped)pollTimer=setTimeout(poll,650)}}function stopPolling(){pollGeneration+=1;pollStopped=true;if(pollTimer)clearTimeout(pollTimer);pollTimer=null}function startPolling(){if(!pollStopped&&pollTimer)return;pollStopped=false;pollGeneration+=1;poll()}window.VyraLive={status,tillstand:liveTillstand,byggTillstand:byggLiveTillstand,connect:username=>json('/connect',{method:'POST',body:JSON.stringify({username})}),disconnect:()=>json('/disconnect',{method:'POST',body:'{}'}),send:event=>json('/events',{method:'POST',body:JSON.stringify(event)}),on(fn){listeners.add(fn);return()=>listeners.delete(fn)},mapEvent:liveEventTriggers,ingest,serverNu:klocka.serverNu,alder:klocka.alder,klocka:klocka.info,stop:stopPolling,start:startPolling,isStopped:()=>pollStopped,
// Aven i skrivbordslaget gar verifieringen via MOLNET: det ar molnets tiktok_connections som bar
// handtagslaset, och den lokala servern har varken sessionen eller tabellen. Saknas inloggningen
// sags det rakt ut i stallet for att knappen tyst inte gor nagot.
verifiera:async()=>{const id=window.VyraAuth?.lastDetail?.()?.workspaces?.[0]?.id;
  if(!id)throw Error('Logga in på ditt VYRA-konto för att verifiera TikTok');
  const r=await window.VyraAuth.api(`/api/workspaces/${id}/tiktok-verifiering`,{method:'POST',body:'{}'});
  if(!r||!r.url)throw Error('Servern lämnade ingen verifieringslänk');
  return{ok:true,...oppnaVerifiering(r.url)}}};window.VyraSessionState?.registerTeardown?.('live-client-poll',stopPolling);addEventListener('vyra-session-ended',stopPolling);status().catch(()=>{});startPolling()})();
