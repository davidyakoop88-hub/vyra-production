'use strict';

function text(value,max=160){return String(value??'').trim().slice(0,max)}
function number(value,max=1e12){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(max,n)):0}
function userOf(data){return data?.user||data?.userInfo||data}
// Prefer the largest avatar TikTok offers. avatarLarger is 1080x1080 and avatarMedium 720x720,
// while avatarThumb is only 100x100 — and thumb used to be picked ahead of medium here, so every
// widget was rendering a 100px source. That is fine at the old 54px avatar box but visibly soft as
// soon as a widget draws the photo larger (e.g. inside a decorative frame). The urlList entries are
// CDN mirrors of the same size, so index 0 is fine; the resolution comes from which field is used.
// profilePicture.urls stays in the chain but after the explicitly-sized fields, since its variant
// is unspecified.
function profileImageOf(data){
  const user=userOf(data);
  return text(
    user?.avatarLarge?.urlList?.[0]||user?.avatarLarge?.urlListList?.[0]
    ||user?.avatarLarger?.urlList?.[0]||user?.avatarLarger?.urlListList?.[0]
    ||user?.avatarMedium?.urlList?.[0]||user?.avatarMedium?.urlListList?.[0]
    ||user?.profilePicture?.urls?.[0]
    ||user?.avatarThumb?.urlList?.[0]||user?.avatarThumb?.urlListList?.[0]
    ||'',1200);
}
// userIdentity (isModeratorOfAnchor/isSubscriberOfAnchor/isFollowerOfAnchor) only exists on chat,
// gift and emote messages in TikTok's protocol — join/like/follow/share/member messages don't carry
// it, so those event types always report false here regardless of the viewer's real status.
function identityOf(data){
  const id=data?.userIdentity;
  return{isModerator:!!id?.isModeratorOfAnchor,isFollower:!!id?.isFollowerOfAnchor,isSubscriber:!!id?.isSubscriberOfAnchor};
}
function baseUser(data){
  const user=userOf(data);
  return{
    userId:text(user?.userId||user?.id||user?.secUid||user?.uniqueId,160),
    username:text(user?.uniqueId||user?.displayId||'',120),
    name:text(user?.nickname||user?.uniqueId||'',120),
    profileImage:profileImageOf(data),
    // TikTok's "Enigma" mode lets a viewer browse/gift anonymously (mask on) — surfaced so Events
    // can optionally exclude them, matching what tiktok-live-proto exposes on every User struct.
    isAnonymous:!!(user?.enigmaInfo?.isEnigmaMaskOn||data?.enigmaInfo?.isEnigmaMaskOn),
    ...identityOf(data),
    // "Team" level in TikTok's own UI = the viewer's Fan Club level with this streamer specifically.
    fanClubLevel:number(user?.fansClub?.data?.level),
    // The gifter badge level — TikTok's own "Gifter Lv." next to a name. It lives on payGrade, which
    // is a UserHonor in tiktok-live-proto v3, and is a DIFFERENT number from fanClubLevel above:
    // fan club level is per-streamer, gifter level is the viewer's global spending grade. Nothing
    // read this field before, so the gifter level did not exist anywhere in the pipeline.
    gifterLevel:number(user?.payGrade?.level)
  };
}
// Measured on staging 2026-08-03: WebcastGiftMessage in tiktok-live-proto v3 carries no giftType at
// all — the type sits in gift.type as a number — and repeatEnd is a number, not a boolean. The old
// guard compared data.giftType with 1, which was always false, so every cumulative frame of a streak
// was forwarded and a streak of ten counted as forty-five.
//
// Only a gift we can positively identify as streakable is ever filtered. Every gift in the sample had
// gift.type 1, so the non-streakable path is unproven by traffic; defaulting to "forward it" means an
// unrecognised shape is counted once rather than dropped.
function isStreakable(data){return (data?.gift?.type??data?.giftType??data?.giftDetails?.giftType)===1}
// A gift with no repeatEnd at all is complete on arrival — treating it as unfinished would lose it.
function isFinalFrame(data){return data?.repeatEnd===undefined?true:!!Number(data.repeatEnd)}
// The same received event must keep the same id across every delivery attempt, so this is derived
// from the message, never minted per retry. v3 nests msgId under common; the rest are older shapes.
function sourceId(data){return text(data?.common?.msgId||data?.msgId||data?.messageId||data?.logId||data?.id,160)}
function giftImageOf(data){return text(data?.giftDetails?.giftImage?.urlList?.[0]||data?.gift?.image?.urlList?.[0]||data?.giftPictureUrl||'',1200)}
function giftFields(data){
  const repeatCount=Math.max(1,number(data?.repeatCount||data?.repeat_count||1,1e7));
  const coinsEach=number(data?.giftDetails?.diamondCount??data?.diamondCount??data?.gift?.diamondCount,1e9);
  return{...baseUser(data),giftId:text(data?.giftId||data?.giftDetails?.giftId||data?.gift?.id,160),giftName:text(data?.giftDetails?.giftName||data?.giftName||data?.gift?.name||'Gift',160),giftImage:giftImageOf(data),coins:coinsEach*repeatCount,count:repeatCount,repeatEnd:data?.repeatEnd!==false};
}
// tiktok-live-proto renamed the like fields in v3, which is the version tiktok-live-connector 2.4.0
// imports: likeCount -> count, totalLikeCount -> total, and total is now a STRING rather than a
// number. Reading only the old names produced 0 for every like in production — 251 of 251 — so no
// viewer could ever reach a leaderboard. The library README still shows the v1/v2 names, so both
// are read here and the shape of the socket payload stops mattering.
//
// count  = the increment for THIS event. The only value a leaderboard may accumulate.
// points = TikTok's running room-wide total. Carried for display, never summed: adding a running
//          total once per event would multiply every tally by the number of events received.
function likeFields(data){
  return{...baseUser(data),
    count:number(data?.count??data?.likeCount,1e9),
    points:number(data?.total??data?.totalLikeCount,1e12)};
}
function battleFields(data){
  const battle=data?.battleInfo||data?.battle||data||{};
  return{...baseUser(data),scoreUs:number(battle?.hostScore??battle?.scoreUs??battle?.team1Score),scoreThem:number(battle?.guestScore??battle?.scoreThem??battle?.team2Score),multiplier:number(battle?.multiplier??battle?.boostMultiplier,100),battleStatus:text(battle?.status||battle?.battleStatus||'',64)};
}
function cloudEvent(id,type,fields,at=Date.now()){
  return{id:text(id,160),type:text(type,64).toLowerCase(),userId:text(fields.userId||fields.username,160),username:text(fields.username||fields.name,120),comment:text(fields.comment,500),profileUrl:text(fields.profileImage,1200),giftId:text(fields.giftId,160),giftName:text(fields.giftName,160),giftImage:text(fields.giftImage,1200),count:number(fields.count,1e9),value:number(fields.coins??fields.points??fields.score,1e12),scoreUs:number(fields.scoreUs,1e12),scoreThem:number(fields.scoreThem,1e12),multiplier:number(fields.multiplier,100),battleStatus:text(fields.battleStatus,64),at:number(at,Number.MAX_SAFE_INTEGER)};
}
// Vilka nycklar en battle-payload faktiskt bar, och vilka av dem som ser ut som ett statusvarde.
// Returnerar NAMN och sma tal — aldrig anvandarnamn, bilder eller fritext. Payloaden innehaller
// deltagarnas profiler, och en logg ar inte ratt plats for dem.
//
// Finns for att en hel sandning gick utan att ett enda battle-event nadde klienten, och loggen inte
// kunde saga om LINK_MIC_BATTLE fyrade eller inte: sendEvent loggar inte per event. Utan det har
// gar det bara att gissa vilken av bibliotekets sju link-mic-handelser TikTok faktiskt anvander.
function battleProbe(data){
  const rot=data&&typeof data==='object'?data:{};
  const battle=rot.battleInfo||rot.battle||rot;
  const statusliknande={};
  for(const k of Object.keys(battle||{})){
    if(!/status|stage|state|type|phase|result|stad/i.test(k))continue;
    const v=battle[k];
    if(v===null||v===undefined)continue;
    if(typeof v==='number'||typeof v==='boolean')statusliknande[k]=v;
    else if(typeof v==='string'&&v.length<=40)statusliknande[k]=v;
  }
  return{
    rotnycklar:Object.keys(rot).slice(0,25),
    battlenycklar:Object.keys(battle||{}).slice(0,25),
    statusliknande
  };
}
module.exports={text,number,battleProbe,profileImageOf,isStreakable,isFinalFrame,sourceId,identityOf,baseUser,giftFields,likeFields,battleFields,cloudEvent};
