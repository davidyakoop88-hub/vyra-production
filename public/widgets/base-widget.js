// VYRA Widget Engine — shared base for every OBS browser-source widget under public/widgets/.
// Handles the repetitive plumbing every widget needs (SSE connection, reconnect, URL params,
// logging/error handling) so a new widget only has to write its own rendering logic.
//
// Connects to the exact same public, token-authed SSE endpoint the main Studio overlay uses —
// /api/overlay-access/:uid/events/stream (see overlay-access.js, server/index.js's publicAccess
// route) — so a widget built on this file is a real production overlay, not a separate protocol.
//
// URL parameters every widget can read via VyraWidget.getParams():
//   uid       required — the "Säker OBS-länk" access token (same token Studio issues/revokes)
//   variant   optional — widget-specific style name, e.g. "cyber" or "celestial"
// Any other param is available via VyraWidget.get(name, fallback).
'use strict';
(function(global){
  // server/event-bus.js's cleanEvent() puts the avatar on `profileUrl` and the gift value on
  // `value`, but every widget here — like the Studio widgets — was written against the desktop
  // shape and reads `profileImage`/`coins`. Nothing in the client reads `profileUrl` at all, so
  // without this every OBS widget rendered its placeholder avatar on live data. Mirrors
  // normalizeCloudFields() in live-client.js; the two consumer families each need their own copy
  // because the standalone widgets never load live-client.js.
  function normalizeCloudFields(event){
    if(event&&typeof event==='object'){
      if(event.profileImage==null&&event.profileUrl)event.profileImage=event.profileUrl;
      if(event.coins==null&&event.value!=null)event.coins=event.value;
    }
    return event;
  }

  function get(name,fallback=''){
    const value=new URLSearchParams(location.search).get(name);
    return value===null||value===''?fallback:value;
  }
  function getParams(){
    return{uid:get('uid',get('access','')),variant:get('variant','cyber')};
  }

  function log(...args){console.log('[VyraWidget]',...args)}
  function warn(...args){console.warn('[VyraWidget]',...args)}
  function error(...args){console.error('[VyraWidget]',...args)}

  function setConnectionState(state){
    document.documentElement.dataset.vyraConnection=state;
  }

  // Connects to the live event stream for `uid` and calls onEvent(event) for every event
  // received. EventSource already auto-reconnects on drop, but on a genuinely dead connection
  // (readyState CLOSED — e.g. a revoked/expired token) this adds capped exponential backoff
  // (1s/2s/4s/8s/16s, then holds at 30s) instead of hammering a dead endpoint. Returns
  // {close()} to tear the connection down (e.g. when a widget is hidden/removed).
  // One gate per browsing context: two OBS browser sources are two independent counters and both
  // must see the event, which is exactly what sessionStorage scopes to.
  // Keyed to this stream, and the access token never reaches storage: it is the only handle a
  // standalone page has on its stream, so it goes through the one-way digest first.
  const gateStorage=(()=>{try{return typeof sessionStorage!=='undefined'?sessionStorage:null}catch(_){return null}})();
  const gate=dedupe(gateStorage,'vyra-seen-events',namespace(getParams().uid));
  function connect({uid,onEvent,onStatus}={}){
    if(!uid){
      warn('Inget "uid" i URL:en — widgeten kan inte ansluta till någon event-stream.');
      onStatus?.('error',{message:'uid saknas'});
      return{close(){}};
    }
    let source=null,attempt=0,closed=false,retryTimer=null;

    function scheduleReconnect(){
      const delayMs=Math.min(30000,1000*2**Math.min(attempt,5));
      attempt++;
      warn(`återansluter om ${Math.round(delayMs/1000)}s (försök ${attempt})`);
      retryTimer=setTimeout(open,delayMs);
    }

    function open(){
      if(closed)return;
      try{
        source=new EventSource(`/api/overlay-access/${encodeURIComponent(uid)}/events/stream`);
      }catch(err){
        error('kunde inte öppna EventSource',err);
        onStatus?.('error',{message:err.message});
        scheduleReconnect();
        return;
      }
      source.addEventListener('live',message=>{
        try{
          const event=normalizeCloudFields(JSON.parse(message.data));
          // The server stamps every frame with its Redis stream id, and EventSource hands it back
          // as lastEventId. A reconnect replays from that id, so without the gate the replayed
          // tail would be counted a second time by this widget.
          if(!gate.accept(message.lastEventId||event?.id))return;
          log('event mottaget',event.type,event);
          onEvent?.(event);
        }catch(err){
          error('kunde inte tolka inkommande event',err,message.data);
        }
      });
      source.onopen=()=>{
        attempt=0;
        setConnectionState('connected');
        log('ansluten till live-strömmen');
        onStatus?.('connected');
      };
      source.onerror=()=>{
        setConnectionState('reconnecting');
        onStatus?.('reconnecting',{attempt});
        // A network hiccup leaves EventSource in CONNECTING and it retries itself — only take
        // over with manual backoff once the browser has actually given up (CLOSED), e.g. a
        // revoked/expired access token.
        if(source.readyState===EventSource.CLOSED){
          source.close();
          scheduleReconnect();
        }
      };
    }

    open();
    return{
      close(){
        closed=true;
        if(retryTimer)clearTimeout(retryTimer);
        source?.close();
        setConnectionState('closed');
      }
    };
  }

  // Avatar and gift URLs arrive from the event stream and are assigned straight to img.src. These
  // pages write every piece of event text with textContent, so there is no HTML sink here — the URL
  // is the one value that still needs a decision. Same rule as VyraSafe.src() in the Studio bundle:
  // http(s) and bitmap data: URIs only, everything else falls back to the shipped asset. Duplicated
  // here for the same reason normalizeCloudFields is: these pages never load the Studio bundle, and
  // a widget running in OBS must not depend on one.
  const SAFE_URL=/^(?:https?:|data:image\/(?:png|jpe?g|gif|webp|avif);)/;
  function safeSrc(value,fallback=''){
    const raw=String(value==null?'':value).trim();
    if(!raw)return fallback;
    let probe='';
    for(let i=0;i<raw.length;i+=1)if(raw.charCodeAt(i)>0x20)probe+=raw[i];
    probe=probe.toLowerCase();
    if(probe.startsWith('//'))return fallback;
    if(/^[a-z][a-z0-9+.-]*:/.test(probe)&&!SAFE_URL.test(probe))return fallback;
    if(/["'<>`\s]/.test(raw))return fallback;
    return raw;
  }

  // Identical contract to VyraDedupe.create() in event-dedupe.js — same ring size, same high-water
  // rule, same treatment of missing and non-Redis ids. Duplicated for the same reason
  // normalizeCloudFields is: these pages never load the Studio bundle, and a widget running in OBS
  // must not depend on one. tests/event-dedupe.test.js drives both copies through the same table so
  // they cannot drift apart.
  // Identical contract to event-dedupe.js in the Studio bundle — same ring size, same high-water
  // rule, same namespace derivation, same stale-run reset, same fail-open behaviour. Duplicated for
  // the same reason normalizeCloudFields is: these pages never load the Studio bundle, and a widget
  // running in OBS must not depend on one. tests/event-dedupe*.test.js drive both copies through the
  // same tables so they cannot drift apart.
  const DEDUPE_RING=512,DEDUPE_STALE_RUN=100;
  const DEDUPE_STREAM_ID=/^(\d+)-(\d+)$/;
  // Never stores a credential. A workspace or overlay id is not one and is used verbatim; an access
  // token is, so it is reduced to a FNV-1a digest — not reversible, stable, and different per token.
  function namespace(seed,options){
    const raw=seed===undefined||seed===null?'':String(seed);
    if(!raw)return 'anon';
    if(options&&options.sensitive===false)return raw;
    let h1=0x811c9dc5,h2=0x01000193;
    for(let i=0;i<raw.length;i+=1){
      const c=raw.charCodeAt(i);
      h1=Math.imul(h1^c,0x01000193)>>>0;
      h2=Math.imul(h2^(c+i),0x85ebca6b)>>>0;
    }
    return 'h'+h1.toString(36)+h2.toString(36);
  }
  function dedupeGet(storage,key){
    try{return storage&&typeof storage.getItem==='function'?storage.getItem(key):null}catch(_){return null}
  }
  function dedupeSet(storage,key,value){
    try{if(storage&&typeof storage.setItem==='function')storage.setItem(key,value)}catch(_){}
  }
  function dedupe(storage,keyPrefix,ns){
    const key=String(keyPrefix||'vyra-seen-events')+':'+(ns||'anon');
    let high=null,ids=[],seen=new Set(),staleRun=0;
    try{
      const saved=JSON.parse(dedupeGet(storage,key)||'{}');
      if(saved&&Array.isArray(saved.ids)){ids=saved.ids.filter(id=>typeof id==='string').slice(-DEDUPE_RING);seen=new Set(ids)}
      if(saved&&Array.isArray(saved.high)&&saved.high.length===2){
        const ms=Number(saved.high[0]),seq=Number(saved.high[1]);
        if(Number.isFinite(ms)&&Number.isFinite(seq))high=[ms,seq];
      }
    }catch(_){}
    function persist(){dedupeSet(storage,key,JSON.stringify({ids,high}))}
    function accept(id){
      const raw=id?String(id):'';
      if(!raw)return true;
      const stream=DEDUPE_STREAM_ID.exec(raw);
      if(stream){
        const ms=Number(stream[1]),seq=Number(stream[2]);
        if(high&&(ms<high[0]||(ms===high[0]&&seq<=high[1]))){
          staleRun+=1;
          if(staleRun<DEDUPE_STALE_RUN)return false;
          high=null;
        }
        staleRun=0;high=[ms,seq];persist();return true;
      }
      if(seen.has(raw))return false;
      seen.add(raw);ids.push(raw);
      if(ids.length>DEDUPE_RING)ids.splice(0,ids.length-DEDUPE_RING).forEach(old=>seen.delete(old));
      persist();return true;
    }
    return{accept,namespace:ns,size:()=>seen.size};
  }

  global.VyraWidget={getParams,get,log,warn,error,connect,safeSrc,dedupe,namespace};

})(typeof window!=='undefined'?window:globalThis);
