'use strict';

function text(value,max=160){return String(value??'').trim().slice(0,max)}
function number(value,max=1e12){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(max,n)):0}
function userOf(data){return data?.user||data?.userInfo||data}
function profileImageOf(data){
  const user=userOf(data);
  return text(user?.profilePicture?.urls?.[0]||user?.avatarThumb?.urlList?.[0]||user?.avatarThumb?.urlListList?.[0]||user?.avatarMedium?.urlList?.[0]||'',1200);
}
function baseUser(data){
  const user=userOf(data);
  return{
    userId:text(user?.userId||user?.id||user?.secUid||user?.uniqueId,160),
    username:text(user?.uniqueId||user?.displayId||'',120),
    name:text(user?.nickname||user?.uniqueId||'',120),
    profileImage:profileImageOf(data)
  };
}
function giftImageOf(data){return text(data?.giftDetails?.giftImage?.urlList?.[0]||data?.gift?.image?.urlList?.[0]||data?.giftPictureUrl||'',1200)}
function giftFields(data){
  const repeatCount=Math.max(1,number(data?.repeatCount||data?.repeat_count||1,1e7));
  const coinsEach=number(data?.giftDetails?.diamondCount??data?.diamondCount??data?.gift?.diamondCount,1e9);
  return{...baseUser(data),giftId:text(data?.giftId||data?.giftDetails?.giftId||data?.gift?.id,160),giftName:text(data?.giftDetails?.giftName||data?.giftName||data?.gift?.name||'Gift',160),giftImage:giftImageOf(data),coins:coinsEach*repeatCount,count:repeatCount,repeatEnd:data?.repeatEnd!==false};
}
function battleFields(data){
  const battle=data?.battleInfo||data?.battle||data||{};
  return{...baseUser(data),scoreUs:number(battle?.hostScore??battle?.scoreUs??battle?.team1Score),scoreThem:number(battle?.guestScore??battle?.scoreThem??battle?.team2Score),multiplier:number(battle?.multiplier??battle?.boostMultiplier,100),battleStatus:text(battle?.status||battle?.battleStatus||'',64)};
}
function cloudEvent(id,type,fields,at=Date.now()){
  return{id:text(id,160),type:text(type,64).toLowerCase(),userId:text(fields.userId||fields.username,160),username:text(fields.username||fields.name,120),profileUrl:text(fields.profileImage,1200),giftId:text(fields.giftId,160),giftName:text(fields.giftName,160),giftImage:text(fields.giftImage,1200),count:number(fields.count,1e9),value:number(fields.coins??fields.points??fields.score,1e12),scoreUs:number(fields.scoreUs,1e12),scoreThem:number(fields.scoreThem,1e12),multiplier:number(fields.multiplier,100),battleStatus:text(fields.battleStatus,64),at:number(at,Number.MAX_SAFE_INTEGER)};
}
module.exports={text,number,profileImageOf,baseUser,giftFields,battleFields,cloudEvent};
