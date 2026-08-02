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

  global.VyraWidget={getParams,get,log,warn,error,connect};

})(typeof window!=='undefined'?window:globalThis);
