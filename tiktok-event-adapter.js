(function(root){
  'use strict';
  var giftOwners=new Map(),stats={received:0,gifts:0,routed:0,rejected:0,ownerChanges:0};
  function text(v,max){return String(v??'').trim().slice(0,max||160)}
  function num(v,max){var n=Number(v);return isFinite(n)?Math.max(0,Math.min(max||1e12,n)):0}
  function normalize(input){
    if(!input||typeof input!=='object')return null;
    var aliases={likes:'like',member:'viewer',chatcommand:'chat'},type=text(input.type||input.event,64).toLowerCase();type=aliases[type]||type;
    if(['gift','like','follow','share','subscribe','chat','battle','viewer'].indexOf(type)<0)return null;
    return{id:text(input.id||input.eventKey,160)||('live-'+Date.now()),type:type,userId:text(input.userId||input.username,160),username:text(input.username||input.name,120),displayName:text(input.name||input.username,120)||'Tittare',profileImage:text(input.profileImage||input.profileUrl,1200),giftId:text(input.giftId,160),giftName:text(input.giftName||input.gift,160),giftImage:text(input.giftImage,1200),count:num(input.count||input.repeatCount,1e9),coins:num(input.coins??input.value,1e12),scoreUs:num(input.scoreUs,1e12),scoreThem:num(input.scoreThem,1e12),multiplier:num(input.multiplier,100),at:num(input.at||input.timestamp,Number.MAX_SAFE_INTEGER)||Date.now()};
  }
  function tier(coins){return coins>=10000?'legendary':coins>=1000?'large':coins>=100?'medium':'small'}
  function giftModel(e){
    var key=e.giftId||e.giftName||'gift',total=e.coins,repeat=Math.max(1,e.count||1);
    return{id:'live-gift-'+text(e.id,120),eventId:e.id,timestamp:e.at,user:{id:e.userId,displayName:e.displayName,avatarUrl:e.profileImage||null},gift:{id:e.giftId,imageUrl:e.giftImage||null,amount:repeat,coins:total,repeatCount:repeat,streakId:key+':'+e.userId},presentation:{tier:tier(total),showDisplayName:true,showGiftName:false,title:'LIVE GIFT',subtitle:total?total.toLocaleString('sv-SE')+' coins':'Ny gåva',durationMs:null,intensity:total>=1000?'high':'normal'},accessibility:{announcement:e.displayName+' skickade en gåva'}};
  }
  function updateGiftOwner(e){
    var key=e.giftId||e.giftName;if(!key)return;
    var previous=giftOwners.get(key)||null,next={userId:e.userId,username:e.username,displayName:e.displayName,profileImage:e.profileImage,at:e.at};
    giftOwners.set(key,next);
    if(previous&&previous.userId!==next.userId){stats.ownerChanges++;root.dispatchEvent?.(new CustomEvent('vyra-top-gift-change',{detail:{giftId:e.giftId,giftName:e.giftName,previous:previous,current:next}}))}
  }
  function ensurePremium(){
    if(!root.document||!root.VyraPremiumWidget||!root.VyraPremiumGiftWidget)return false;
    root.VyraPremiumWidget.mount(root.document.body);root.VyraPremiumGiftWidget.mount(root.document.body);return true;
  }
  function route(input){
    stats.received++;var e=normalize(input);if(!e){stats.rejected++;return{status:'rejected',reason:'unsupported event'}};
    if(e.type==='gift'){stats.gifts++;updateGiftOwner(e);if(ensurePremium()){var result=root.VyraPremiumGiftWidget.show(giftModel(e));stats.routed++;return{status:'routed',event:e,result:result}}}
    root.dispatchEvent?.(new CustomEvent('vyra-tiktok-normalized',{detail:e}));stats.routed++;return{status:'routed',event:e};
  }
  function getGiftOwner(key){var value=giftOwners.get(key);return value?JSON.parse(JSON.stringify(value)):null}
  function reset(){giftOwners.clear();Object.keys(stats).forEach(function(k){stats[k]=0})}
  root.VyraTikTokEvents=Object.freeze({normalize:normalize,tier:tier,giftModel:giftModel,route:route,getGiftOwner:getGiftOwner,getStats:function(){return{...stats}},reset:reset});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.VyraTikTokEvents;
})(typeof window!=='undefined'?window:globalThis);
