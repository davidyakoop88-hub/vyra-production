(function(root){
  'use strict';
  const START=/^(battle_)?(start|started|begin|active|progress|ongoing|running|live)$/i;
  const END=/^(battle_)?(end|ended|finish|finished|over|settle|result|punish|punish_started|punish_finished|complete|close)$/i;
  const TYPES=['glove','hammer','fog','chrono','x2','x3'];
  const BOOST_RESERV_SEK=60;
  const clean=(v,max=120)=>String(v??'').slice(0,max);
  const score=v=>Number.isFinite(Number(v))&&Number(v)>=0?Math.min(1e12,Number(v)):0;
  function empty(){return {active:null,history:[],boosters:[],seen:[],boost:null}}
  function receive(state,event,now=Date.now()){
    if(!event||event.__simulerad||event.test||event.simulated)return false;
    if(event.type!=='battle'&&event.type!=='glove')return false;
    const eventId=clean(event.id,160);
    if(eventId&&state.seen.includes(eventId))return false;
    if(eventId){state.seen.push(eventId);state.seen=state.seen.slice(-500)}
    // Bryggan skickar battleId på boosten bara när TikTok bär det (tiktok-bridge/bridge.js); saknas
    // det hör boosten till den pågående matchen, precis som i battle-fx-auto.js.
    const id=clean(event.battleId,160)||(event.type==='glove'?state.active?.id||'':'');
    if(!id)return false;
    if(event.type==='glove'){
      if(state.active?.id!==id||!(Number(event.multiplier)>1))return false;
      // durationSec 0 betyder OKÄND längd (server/event-bus.js), inte ett fönster på noll sekunder.
      // Samma reserv som battle-fx-auto.js: 60 s.
      const sek=Number(event.durationSec)>0?Math.min(3600,Number(event.durationSec)):BOOST_RESERV_SEK;
      state.boost={id,multiplier:Math.min(100,Number(event.multiplier)),until:now+sek*1000};
      return true;
    }
    const status=clean(event.battleStatus,64);
    if(!START.test(status)&&!END.test(status))return false;
    const ended=state.history.find(row=>row.id===id);
    // Replayed starts must not reopen a completed battle.
    if(START.test(status)&&ended)return false;
    const prior=state.active?.id===id?state.active:ended;
    const hasScore=score(event.scoreUs)>0||score(event.scoreThem)>0;
    const row={id,at:prior?.at||now,updatedAt:now,us:hasScore?score(event.scoreUs):(prior?.us||0),them:hasScore?score(event.scoreThem):(prior?.them||0),hasScore:hasScore||!!prior?.hasScore};
    if(END.test(status)){
      row.result=row.hasScore?(row.us>row.them?'win':row.us<row.them?'loss':'draw'):'unknown';
      row.endedAt=prior?.endedAt||now;
      state.history=[row,...state.history.filter(value=>value.id!==id)].sort((a,b)=>b.endedAt-a.endedAt).slice(0,200);
      if(state.active?.id===id)state.active=null;
      if(state.boost?.id===id)state.boost=null;
    }else state.active=row;
    return true;
  }
  function booster(input,now=Date.now()){
    const user=clean(input.user,80).replace(/^@/,'').trim().toLowerCase();
    const count=Number(input.count),kind=clean(input.kind,20);
    if(!/^[a-z0-9_.]{1,80}$/.test(user)||!TYPES.includes(kind)||!Number.isInteger(count)||count<1||count>10000)throw new Error('Ange ett TikTok-användarnamn och ett heltal mellan 1 och 10 000.');
    let expires='';
    if(input.expires){const text=String(input.expires);const date=new Date(`${text}T23:59:59.999Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==text||date.getTime()<now)throw new Error('Ange ett giltigt framtida utgångsdatum.');expires=text}
    return {user,kind,count,expires,source:'manual',updatedAt:now};
  }
  function restore(raw){
    const state=empty();try{const data=JSON.parse(raw||'{}');
      if(Array.isArray(data.history))state.history=data.history.filter(row=>row&&typeof row.id==='string'&&['win','loss','draw','unknown'].includes(row.result)).slice(0,200).map(row=>({id:clean(row.id,160),at:score(row.at),endedAt:score(row.endedAt),us:score(row.us),them:score(row.them),hasScore:!!row.hasScore,result:row.result}));
      if(Array.isArray(data.boosters))state.boosters=data.boosters.slice(0,500).flatMap(row=>{try{return [booster(row,0)]}catch{return []}});
    }catch{}return state;
  }
  function visibleBoosters(state,kind,search,now=Date.now()){
    return state.boosters.filter(row=>(!kind||kind==='all'||row.kind===kind)&&row.user.includes(String(search||'').replace(/^@/,'').toLowerCase())&&(!row.expires||new Date(`${row.expires}T23:59:59.999Z`).getTime()>now));
  }
  const api={empty,receive,booster,restore,visibleBoosters,TYPES};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VyraBattleModel=api;
})(typeof window!=='undefined'?window:globalThis);
