(function(){const localRuntime=['127.0.0.1','localhost'].includes(location.hostname);const listeners=new Set(),activeUsers=new Set();
function emit(name,detail){dispatchEvent(new CustomEvent(name,{detail}));listeners.forEach(fn=>fn(detail))}
function liveEventTriggers(e){let t=String(e.type||e.event||'').toLowerCase().replace(/[\s_-]/g,''),username=e.username||e.uniqueId||e.user,first=!!username&&!activeUsers.has(String(username).toLowerCase()),payload={username,name:e.name||username,gift:e.giftName||e.gift,giftname:e.giftName||e.gift,giftImage:e.giftImage||'',profileImage:e.profileImage||e.avatarUrl,coins:Number(e.coins||e.diamondCount||0),count:Number(e.count||e.repeatCount||1),repeatcount:Number(e.count||e.repeatCount||1),combo:Number(e.count||e.repeatCount||1),teamLevel:Number(e.teamLevel||e.fanClubLevel||0),isFollower:!!e.isFollower,isSubscriber:!!(e.isSubscriber||e.isMember),isModerator:!!e.isModerator,isTopGifter:!!e.isTopGifter,isAnonymous:!!e.isAnonymous,value:e.value??e.name??e.giftName??e.gift??username};let out=[];
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
function ingest(e){
  normalizeUserFlags(e);
  try{localStorage.setItem('vyra-live-event',JSON.stringify(e))}catch{}
  emit('vyra-live-event',e);
  recordSeenEmote(e);
  recordSeenUser(e);
  if(typeof routeLiveBattleEvent==='function')routeLiveBattleEvent(e);
  if(window.VyraActionEvent)liveEventTriggers(e).forEach(([trigger,payload])=>window.VyraActionEvent.handleEvent(trigger,payload));
}
if(!localRuntime){const unavailable=async()=>{throw Error('Öppna VYRA Desktop för att ansluta TikTok LIVE')};window.VyraLive={status:async()=>({ok:true,localRuntime:false,connection:{connected:false,state:'desktop-required'}}),connect:unavailable,disconnect:unavailable,send:unavailable,on(fn){listeners.add(fn);return()=>listeners.delete(fn)},mapEvent:liveEventTriggers,ingest};dispatchEvent(new CustomEvent('vyra-desktop-required'));return}
const API='/api';let last=Number(sessionStorage.getItem('vyra-last-live-event')||0),online=false;async function json(url,options){let r=await fetch(API+url,{cache:'no-store',headers:{'Content-Type':'application/json'},...options});let d=await r.json().catch(()=>null);if(!r.ok)throw Error(d?.error||'Serverfel '+r.status);return d}async function status(){try{let d=await json('/status');if(!online){online=true;emit('vyra-server-status',d)}return d}catch(e){if(online){online=false;emit('vyra-server-offline',{error:e.message})}throw e}}
async function poll(){try{let d=await json('/events?after='+last);for(let e of d.events||[]){last=Math.max(last,Number(e.id)||0);sessionStorage.setItem('vyra-last-live-event',last);ingest(e)}}catch{}finally{setTimeout(poll,650)}}window.VyraLive={status,connect:username=>json('/connect',{method:'POST',body:JSON.stringify({username})}),disconnect:()=>json('/disconnect',{method:'POST',body:'{}'}),send:event=>json('/events',{method:'POST',body:JSON.stringify(event)}),on(fn){listeners.add(fn);return()=>listeners.delete(fn)},mapEvent:liveEventTriggers,ingest};status().catch(()=>{});poll()})();
