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
  // ENHETEN AR DIAMANTER, INTE COINS. Kallfaltet heter `diamondCount` i varenda variant nedan.
  // Coins ar vad TITTAREN betalar; diamanter ar vad KREATOREN far — grovt halften — och det ar
  // diamanter TikToks utbetalning bygger pa. De skiljer sig med ungefar faktor tva.
  //
  // `coins` nedan ar darfor felnamngivet, men bevaras: en publicerad .exe i drift skickar det
  // namnet, OBS-kallor kor cachad widgetkod, och live-leaderboard.js har redan `coins` som nyckel
  // i sparad localStorage-state. `diamonds` ar det RIKTIGA namnet och tillkommer vid sidan av.
  // `coins` far ga bort forst nar inget laser det (#133).
  const diamantsEach=number(data?.giftDetails?.diamondCount??data?.diamondCount??data?.gift?.diamondCount,1e9);
  const coinsEach=diamantsEach;
  return{...baseUser(data),giftId:text(data?.giftId||data?.giftDetails?.giftId||data?.gift?.id,160),giftName:text(data?.giftDetails?.giftName||data?.giftName||data?.gift?.name||'Gift',160),giftImage:giftImageOf(data),diamonds:diamantsEach*repeatCount,coins:coinsEach*repeatCount,count:repeatCount,repeatEnd:data?.repeatEnd!==false};
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
// Multiplikatorfonstret i en battle — det som pa svenska heter Boosting Glove.
//
// VARFOR DEN HAR FUNKTIONEN FINNS. Klienten har hela vagen redan byggd: media.js
// routeLiveBattleEvent tander Glove Snipe pa `type.includes('glove')` och pa multiplier 2/3,
// cleanEvent i molnet bar faltet `multiplier` (0-100), och battleFields ovan letar redan efter
// `battle.multiplier ?? battle.boostMultiplier`. Ingen rad FYLLDE det: LINK_MIC_BATTLE bar inte
// multiplikatorn. Den ligger i LINK_MIC_BATTLE_TASK.
//
// Formen ur tiktok-live-proto/v3 (WebcastLinkmicBattleTaskMessage):
//
//   taskMessageType   0=START 1=TASK_UPDATE 2=TASK_SETTLE 3=REWARD_SETTLE
//   start.config.rewardConfig -> RewardPeriodConfig {
//       rewardMultiple         talet: 2, 3, 5 ...
//       rewardStartTimestamp   nar fonstret borjar
//       duration               hur lange det varar
//   }
//   taskUpdate { progress, fromUserId }   vem som drev uppgiften
//   taskSettle { result }                 0=SUCCEED 1=FAILED 2=BOTH_SUCCEED
//   battleId
//
// TOLERANT LASNING, av samma skal som battleFields: biblioteket har bytt faltnamn mellan v2 och
// v3 forr, och en v3-omdopning nollade en gang varenda like utan att nagot larmade. Darfor provas
// flera vagar in till samma varde i stallet for en.
function battleTaskFields(data){
  const rot=data&&typeof data==='object'?data:{};
  const belon=rot.start?.config?.rewardConfig||rot.config?.rewardConfig||rot.rewardConfig||{};
  const uppdatering=rot.taskUpdate||{};
  const slut=rot.taskSettle||{};
  return{
    multiplier:number(belon.rewardMultiple??belon.multiple??rot.rewardMultiple,100),
    fonsterStart:number(belon.rewardStartTimestamp??belon.rewardStartTime,Number.MAX_SAFE_INTEGER),
    fonsterSekunder:number(belon.duration,86400),
    steg:number(rot.taskMessageType,10),
    resultat:number(slut.result,10),
    battleId:text(rot.battleId||rot.battle_id||'',64),
    fromUserId:text(uppdatering.fromUserId||'',160)
  };
}
// Ett boost-event ska bara skickas nar det finns ett riktigt fonster att visa.
//
// Multiplikator 0 eller 1 ar inget att tanda en overlay for, och TASK_UPDATE fyrar upprepat under
// hela uppgiften — skickades varje uppdatering skulle Glove Snipe blinka i ett. Bara steget som
// BAR konfigurationen (START) eller ett lyckat slutlage far passera.
function arBoostFonster(f){
  return !!f && f.multiplier>=2 && (f.steg===0 || (f.steg===2&&(f.resultat===0||f.resultat===2)));
}
function cloudEvent(id,type,fields,at=Date.now()){
  return{id:text(id,160),type:text(type,64).toLowerCase(),userId:text(fields.userId||fields.username,160),username:text(fields.username||fields.name,120),comment:text(fields.comment,500),profileUrl:text(fields.profileImage,1200),giftId:text(fields.giftId,160),giftName:text(fields.giftName,160),giftImage:text(fields.giftImage,1200),count:number(fields.count,1e9),value:number(fields.coins??fields.points??fields.score,1e12),scoreUs:number(fields.scoreUs,1e12),scoreThem:number(fields.scoreThem,1e12),multiplier:number(fields.multiplier,100),battleStatus:text(fields.battleStatus,64),fanClubLevel:number(fields.fanClubLevel,50),gifterLevel:number(fields.gifterLevel,50),at:number(at,Number.MAX_SAFE_INTEGER)};
}
// Alla SKALARA varden i en battle-payload, inklusive ett par nivaer ner — utan anvandardata.
//
// Sond nummer ett letade efter falt vars NAMN innehol status/stage/state/type/phase/result. Den
// matningen gav nastan ingenting: den enda traffen var inviteeGiftPermissionType. Payloaden fran en
// riktig match visade sig bara nycklarna
//
//   battleId, battleSettings, action, battleResult, armies, teamBattleResult, matchPunishExtraInfo
//
// och VARKEN battleInfo ELLER battleStatus. `action` matchade inte monstret, och battleResult ar ett
// objekt — sa bada foll bort. Darfor: ta alla skalarer, gissa inte vilka namn som betyder nagot.
//
// Anvandarnara nycklar filtreras bort. Payloaden bar deltagarnas profiler, och en logg ar inte ratt
// plats for dem. Arrayer redovisas med sin LANGD, aldrig sitt innehall — det ar dar deltagarna bor.
const ANVANDARNYCKEL=/user|anchor|nick|name|avatar|url|display|text|desc|title|image|icon|owner|invitee|host|guest|sec_?uid|comment/i;
const MAX_DJUP=2;
function skalarer(varde,prefix,djup,ut){
  if(!varde||typeof varde!=='object'||djup>MAX_DJUP)return ut;
  for(const [k,v] of Object.entries(varde)){
    if(ANVANDARNYCKEL.test(k))continue;
    const namn=prefix?prefix+'.'+k:k;
    if(v===null||v===undefined)continue;
    if(typeof v==='number'||typeof v==='boolean')ut[namn]=v;
    // Korta varden utan mellanslag: enum-strangar och id:n, inte fritext.
    else if(typeof v==='string'){if(v.length<=24&&!/\s/.test(v)&&v.length>0)ut[namn]=v}
    else if(Array.isArray(v))ut[namn+'.length']=v.length;
    else if(typeof v==='object')skalarer(v,namn,djup+1,ut);
  }
  return ut;
}
function battleProbe(data){
  const rot=data&&typeof data==='object'?data:{};
  return{nycklar:Object.keys(rot).slice(0,30),skalarer:skalarer(rot,'',0,{})};
}
// Vilka typer som far postas till molnets ingest-rutt.
//
// VITLISTA, inte svartlista. Bryggan skickade tidigare ALLT dit, och tva saker gick fel:
//
//   1. bridge.js:305 skickar `chatcommand` nar en chattrad borjar med "!". Den typen finns inte i
//      server/index.js:72, sa molnet svarar 400. Bryggan loggar det (bridge.js:216 kastar pa !r.ok
//      och fangar med console.error), sa det ar inte tyst — men det ar en console.error per
//      utropsteckenkommando under hela sandningen, i en logg dar riktiga fel ska synas.
//
//   2. VARRE: takten kollas FORE valideringen (server/index.js:108 fore :111). Chatt ar den
//      overlagset frekventaste typen under en aktiv sandning och ingest-taket ar 100 event/s per
//      workspace. Chatten kan alltsa ata upp budgeten och fa GAVOR avvisade med 429 — och gavor ar
//      det enda som betyder nagot for intaktsstatistiken. Ett event som avvisas dar finns inte i
//      historiken, och det gar inte att upptacka i efterhand.
//
// Darfor: `chat` ar giltig for molnet men stoppas anda, pa VOLYM. Allt annat som slapps fram ar
// nagot server/stream-stats.js faktiskt raknar.
//
// Galler BARA molnpostningen. Den lokala vagen (/api/events) matar overlayen och far inte
// filtreras — chattwidgetar i OBS lever pa den.
// 'glove' ar rumsnivå precis som battle och viewer: fonstret galler matchen, inte en person.
const TILL_MOLNET=new Set(['gift','like','likes','follow','share','member','subscribe','viewer','battle','glove']);
function tillMolnet(typ){return TILL_MOLNET.has(typ)}

module.exports={text,number,battleProbe,battleTaskFields,arBoostFonster,profileImageOf,isStreakable,isFinalFrame,sourceId,identityOf,baseUser,giftFields,likeFields,battleFields,cloudEvent,tillMolnet,TILL_MOLNET};
