(function(){const localRuntime=['127.0.0.1','localhost'].includes(location.hostname);const listeners=new Set(),activeUsers=new Set();
function emit(name,detail){dispatchEvent(new CustomEvent(name,{detail}));listeners.forEach(fn=>fn(detail))}
// KLIENTGRANSEN FOR #133. Bade `coins` och `diamonds` satts till samma tal, och `diamonds`
// vinner nar bada finns. ~20 filer nedstroms laser det interna `coins` utan att veta nagot
// om tradformatet — de behover alltsa inte roras nar tradfaltet till slut forsvinner.
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
// och normaliseringen i live-client.js) och som nyckel i sparad localStorage-state i
// live-leaderboard.js — den sista kraver migrering eller dubbel lasning.
function liveEventTriggers(e){let t=String(e.type||e.event||'').toLowerCase().replace(/[\s_-]/g,''),username=e.username||e.uniqueId||e.user,first=!!username&&!activeUsers.has(String(username).toLowerCase()),payload={username,name:e.name||username,gift:e.giftName||e.gift,giftname:e.giftName||e.gift,giftImage:e.giftImage||'',profileImage:e.profileImage||e.avatarUrl,coins:Number(e.diamonds??e.coins??e.diamondCount??0),diamonds:Number(e.diamonds??e.coins??e.diamondCount??0),count:Number(e.count||e.repeatCount||1),repeatcount:Number(e.count||e.repeatCount||1),combo:Number(e.count||e.repeatCount||1),teamLevel:Number(e.teamLevel||e.fanClubLevel||0),isFollower:!!e.isFollower,isSubscriber:!!(e.isSubscriber||e.isMember),isModerator:!!e.isModerator,isTopGifter:!!e.isTopGifter,isAnonymous:!!e.isAnonymous,value:e.value??e.name??e.giftName??e.gift??username};let out=[];
  if(first){activeUsers.add(String(username).toLowerCase());out.push(['firstActivity',payload])}
  if(t==='gift'||t==='giftcombo'){const giftPayload={...payload,value:payload.gift};out.push(['gift',giftPayload],['giftCoins',giftPayload]);if(payload.count>1||t==='giftcombo')out.push(['giftCombo',giftPayload])}
  else if(t==='follow')out.push(['follow',{...payload,isFollower:true}]);
  else if(t==='member'||t==='subscribe'||t==='subscription')out.push(['member',{...payload,isSubscriber:true}]);
  else if(t==='join'||t==='roomuser')out.push(['join',payload]);
  else if(t==='share')out.push(['share',payload]);
  else if(t==='likes'||t==='like')out.push(['likes',{...payload,value:payload.count,likecount:payload.count,totallikecount:e.totalLikes||e.totalLikeCount||0}]);
  else if(t==='chatcommand'||t==='command')out.push(['chatCommand',{...payload,command:e.command||e.name,value:e.command||e.name}]);
  else if(t==='chat'||t==='comment'){const text=String(e.comment||e.name||'');out.push(['chat',{...payload,comment:text,value:text}]);if(text.trim().startsWith('!'))out.push(['chatCommand',{...payload,command:text.trim().split(/\s+/)[0],value:text.trim().split(/\s+/)[0],comment:text}])}
  else if(t==='subscriberemote')out.push(['subscriberEmote',{...payload,value:e.emote||e.name}]);
  else if(t==='fanclubsticker'||t==='fansticker')out.push(['fanSticker',{...payload,value:e.sticker||e.name}]);
  else if(t==='shoppurchase'||t==='purchase')out.push(['shopPurchase',{...payload,value:e.productName||e.name}]);
  return out}
// Single entry point for one live event, regardless of transport — the local poll loop below
// calls this for every polled event, and overlay-access.js's cloud SSE handler calls
// `VyraLive.ingest(event)` directly for every 'live' message it receives. Keeping this as one
// shared function (instead of duplicating the routing in both places) is what makes the cloud
// SSE path actually drive widget animations the same way the local demo/bridge path already did.
// Subscriber emotes have no human-readable name (TikTok only gives an opaque emoteId), so the
// Events picker can't ship with a fixed catalog like gifts have. Instead it offers whatever emotes
// have actually appeared live, most-recent-first, capped so a long session doesn't grow forever.
function recordSeenEmote(e){
  const type=String(e.type||e.event||'').toLowerCase().replace(/[\s_-]/g,'');
  if(type!=='subscriberemote'||!e.emote)return;
  try{
    const KEY='vyra-seen-emotes-v1';
    const list=JSON.parse(localStorage.getItem(KEY)||'[]').filter(x=>x.id!==e.emote);
    list.unshift({id:e.emote,image:e.giftImage||'',lastSeen:Date.now()});
    localStorage.setItem(KEY,JSON.stringify(list.slice(0,40)));
  }catch{}
}
// Same reasoning as recordSeenEmote — TikTok gives no "pick from your followers" API to any
// third-party connector (confirmed: no fetchFollowers/userList route exists anywhere in
// tiktok-live-connector), so the Events "specific user" picker can't ship with a real follower
// list either. Every live event already carries a real username, so capture-as-seen is the only
// technically honest way to offer a picker instead of free text.
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
  const topGifter=window.VyraLeaderboard?.getTop('coins',1)[0];
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
  try{localStorage.setItem('vyra-live-event',JSON.stringify(e))}catch{}
  emit('vyra-live-event',e);
  recordSeenEmote(e);
  recordSeenUser(e);
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
  const shape=c=>({ok:true,localRuntime:false,cloud:true,
    connection:c&&c.active?{connected:true,state:'cloud',username:c.tiktok_username}
                          :{connected:false,state:'idle'}});
  window.VyraLive={
    status:async()=>{try{const r=await cloud('GET');return shape(r.connection)}
      catch{return{ok:true,localRuntime:false,cloud:true,connection:{connected:false,state:'idle'}}}},
    connect:async username=>shape((await cloud('PUT',{username})).connection),
    disconnect:async()=>shape((await cloud('DELETE')).connection),
    send:async()=>{throw Error('Testevent kraver VYRA Desktop')},
    on(fn){listeners.add(fn);return()=>listeners.delete(fn)},
    mapEvent:liveEventTriggers,ingest,closeStream};
  // Subscribe to the workspace event stream. Without this Studio never saw a single live event in
  // web mode: the desktop build gets them from its poll() loop against the local server, and OBS
  // widgets open their own EventSource, but the Studio canvas had no source at all — so widgets
  // sat on their placeholder data and only the auto-play flip animation moved.
  let stream = null, streamGeneration = 0, onLiveMessage = null;
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
    // EventSource reconnects on its own; drop the handle if the workspace goes away so a later
    // login can open a fresh one rather than reusing a stream bound to the previous workspace.
    stream.onerror = () => { if (stream && stream.readyState === EventSource.CLOSED) stream = null };
  }
  window.VyraSessionState?.registerTeardown?.('live-client', closeStream);
  addEventListener('vyra-session-ended', closeStream);
  addEventListener('vyra-auth-ready', openStream);
  openStream();
  setTimeout(openStream, 2000);

  dispatchEvent(new CustomEvent('vyra-cloud-live-ready'));return}
const API='/api';let last=Number(sessionStorage.getItem('vyra-last-live-event')||0),online=false;async function json(url,options){let r=await fetch(API+url,{cache:'no-store',headers:{'Content-Type':'application/json'},...options});let d=await r.json().catch(()=>null);if(!r.ok)throw Error(d?.error||'Serverfel '+r.status);return d}async function status(){try{let d=await json('/status');if(!online){online=true;emit('vyra-server-status',d)}return d}catch(e){if(online){online=false;emit('vyra-server-offline',{error:e.message})}throw e}}
let pollTimer=null,pollGeneration=0,pollStopped=false;async function poll(){const mine=pollGeneration;try{let d=await json('/events?after='+last);if(mine!==pollGeneration)return;for(let e of d.events||[]){last=Math.max(last,Number(e.id)||0);sessionStorage.setItem('vyra-last-live-event',last);ingest(e)}}catch{}finally{if(mine===pollGeneration&&!pollStopped)pollTimer=setTimeout(poll,650)}}function stopPolling(){pollGeneration+=1;pollStopped=true;if(pollTimer)clearTimeout(pollTimer);pollTimer=null}function startPolling(){if(!pollStopped&&pollTimer)return;pollStopped=false;pollGeneration+=1;poll()}window.VyraLive={status,connect:username=>json('/connect',{method:'POST',body:JSON.stringify({username})}),disconnect:()=>json('/disconnect',{method:'POST',body:'{}'}),send:event=>json('/events',{method:'POST',body:JSON.stringify(event)}),on(fn){listeners.add(fn);return()=>listeners.delete(fn)},mapEvent:liveEventTriggers,ingest,stop:stopPolling,start:startPolling,isStopped:()=>pollStopped};window.VyraSessionState?.registerTeardown?.('live-client-poll',stopPolling);addEventListener('vyra-session-ended',stopPolling);status().catch(()=>{});startPolling()})();
