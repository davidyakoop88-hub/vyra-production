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

// NIVAERNA BOR I badgeList — uppmatt i skarp sandning 2026-09-01, inte gissat.
//
// De tva falt koden lasta forut finns inte i verklig trafik:
//   fansClub         0 forekomster i hela inspelningen (3710 rader)
//   payGrade.level   0 i ALLA 1226 forekomster
// Alltsa var fanClubLevel och gifterLevel konstant 0, och Fan Level Up + Gifter Level Up kunde
// aldrig tanda. PR #301 lagade transporten; det har ar kallan.
//
// sceneType skiljer badgarna at. Uppmatta forekomster samma kvall:
//   10  fanklubbsniva   1269 st, ALLA med privilegeLogExtra.level, spann 1-50
//    8  niva ("Lv.")     938 st, ALLA med privilegeLogExtra.level, spann 1-34
//   16  guardian          27 st, level "0"
//    6  top gifter       367 st
//    1  moderator        123 st, level "0"
//
// sceneType valdes framfor ikonens filnamn med flit: filnamnet ar ett CDN-namn som kan bytas, och
// det ar dessutom en HINK — grade_badge_icon_lite_lv30 bars av nagon pa niva 34, lv20 av nagon pa
// 21. Filnamn och verklig niva skiljer sig i 1646 fall.
//
// combine.str duger inte heller: for nivabadgen ar den nivan ("34"), for fanklubbsbadgen klubbens
// NAMN ("YOLO"). Samma falt, tva betydelser.
//
// Kravet niva > 0 haller en nolla fran att rapporteras som en niva. AR INTE LASTBARANDE I DAG och
// ett mutationsprov overlever det: sceneType-filtret plockar redan bort moderator- och
// guardian-badgarna, och en nolla hade dessutom fallit igenom `||` till reservfaltet med samma
// slutresultat. Uppmatt: 0 av 1378 anvandarobjekt hade tva badges av samma sceneType, alltsa finns
// inget fall dar en nolla skymmer en riktig niva bredvid. Raden star kvar som en billig skiljelinje
// mellan "ingen niva rapporterad" och niva 0 — inte som en vakt, och den utges inte for att vara en.
const BADGE_FANKLUBB = 10, BADGE_NIVA = 8;
function nivaFranBadge(user, sceneType){
  for(const b of user?.badgeList||[]){
    if(Number(b?.sceneType)!==sceneType) continue;
    const n=Number(b?.privilegeLogExtra?.level);
    if(n>0) return n;   // NaN>0 ar false, sa Number.isFinite behovs inte
  }
  return 0;
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
    fanClubLevel:number(nivaFranBadge(user,BADGE_FANKLUBB)||user?.fansClub?.data?.level),
    // The gifter badge level — TikTok's own "Gifter Lv." next to a name. It lives on payGrade, which
    // is a UserHonor in tiktok-live-proto v3, and is a DIFFERENT number from fanClubLevel above:
    // fan club level is per-streamer, gifter level is the viewer's global spending grade. Nothing
    // read this field before, so the gifter level did not exist anywhere in the pipeline.
    gifterLevel:number(nivaFranBadge(user,BADGE_NIVA)||user?.payGrade?.level)
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
// BATTLE-STATUS — uppmatt i skarp sandning 2026-09-02, inte gissad.
//
// battleFields lasta `data.status`. Det faltet FINNS INTE. Statusen ligger en niva djupare, pa
// `data.battleSettings.status`, och transitionen pa `data.action`. battleStatus blev darfor alltid
// tom strang — och battle-mvp-session.js klassar tom strang som 'okänd' och gor da INGENTING.
// Sessionen oppnades aldrig, stangdes aldrig, och Battle MVP kunde inte tanda oavsett hur manga
// gavor som kom in. Uppmatt: fem battle-event, action 4 (x3) och 5 (x2).
//
// ENUM-VARDENA kommer ur bibliotekets egna typer (tiktok-live-proto/v3):
//   LinkMicBattleBattleAction   INVITE=1 REJECT=2 CANCEL=3 OPEN=4 FINISH=5 CUT_SHORT=6
//   BattleSettingsBattleStatus  NOT_STARTED=0 STARTED=1 FINISHED=2 PUNISH_STARTED=3
//                               PUNISH_FINISHED=4
//
// ORD, INTE SIFFROR. Klientens klassa() kor en ORDSOKNING (/(end|finish|...)/ mot
// /(start|begin|...)/) — en siffra matchar ingenting. Bryggan oversatter darfor till ord klienten
// redan kanner igen, sa klientsidan inte behover roras alls.
//
// NOT_STARTED GER TOM STRANG med flit: ordet "not_started" innehaller "start" och hade oppnat en
// session for en match som inte borjat. Samma sort av falla som "Guardian Wings".
//
// ACTION GAR FORE STATUS: transitionen ar farskare an tillstandet. Ett FINISH-event kan bara en
// settings-status som fortfarande sager STARTED, och vinner tillstandet stangs matchen aldrig.
const BATTLE_ACTION={4:'battle_started',5:'battle_finished',6:'battle_finished'};
const BATTLE_STATUS={1:'battle_started',2:'battle_finished',3:'battle_punish_started',4:'battle_punish_finished'};
function battleStatusAv(data,battle){
  return BATTLE_ACTION[Number(data?.action)]
    || BATTLE_STATUS[Number(data?.battleSettings?.status)]
    || text(battle?.status||battle?.battleStatus||'',64);
}
// `battleId` FOLJER MED, och utan den bits inte MVP-dedupen.
//
// DEDUPEN FINNS REDAN och ar korrekt: battle-mvp-session.js lindar triggerBattleMvp och haller en
// `annonserade`-mangd nycklad pa battleId, sa en match kan bara tanda widgeten en gang. Den ar
// provad i tests/battle-mvp-dedup.test.js, nio prov, alla grona.
//
// MEN DEN FICK ALDRIG NAGON NYCKEL FRAN KLIENTENS EGEN RANING. MVP tands fran tva hall — TikToks
// armelista (battle_mvp, som BAR battleId) och sessionens egen summering (som reserv nar TikTok
// inte skickar nagon lista). Sessionen hamtar sitt id ur `battle`-eventet via oppna(e.battleId),
// och battleFields skickade det inte. Sessionens id var alltsa alltid tomt, och dedupens egen
// regel slapper med FLIT igenom ett event utan id: "hellre en alert for mycket an ingen alls".
//
// Foljden i drift, uppmatt av David 2026-09-05: TVA MVP-alerts per match. TikToks dedupades, den
// egna slapptes alltid fram. Nyckeln saknades pa exakt den sida som behovde den.
//
// Id:t finns i BADA payloaderna och ar samma strang: uppmatt 7682152221400681249 i bade
// LINK_MIC_BATTLE och LINK_MIC_ARMIES for samma match. Bara vidarebefordran saknades.
// ARMEERNA, OAVSETT FORM. Payloadens `armies` har setts som bade ett objekt nycklat pa anvandar-id
// och en array av {key,value}. vartLagsGivare hanterar redan bada for MVP:n; det har ar samma sak
// for poangen, samlat pa ett stalle.
function armelag(data){
  const a=data&&data.armies;
  if(!a||typeof a!=='object')return[];
  if(Array.isArray(a))return a.map(t=>({id:text(t&&t.key,64),lag:(t&&t.value)||t||{}}));
  return Object.keys(a).map(k=>({id:text(k,64),lag:a[k]||{}}));
}
// POANGEN LAG ALDRIG DAR KODEN LETADE. Fram till 2026-09-06 last battleFields
// `data.battleInfo.hostScore` — men payloaden har INGET `battleInfo`, och `hostScore` med versalt S
// finns inte heller. `number(undefined)` blev 0, sa scoreUs/scoreThem var ALLTID noll och
// battle-widgeten visade 0–0 i varje match.
//
// UPPMATT i en skarp sandning 2026-09-06, elva matcher: poangen ligger i
// `armies[<anvandar-id>].hostscore` — GEMENT s. Vart eget id gick att hitta som armies-nyckel i
// 13 av 13 payloads.
//
// VILKEN SIDA SOM AR VAR gar INTE att lasa ur payloaden: `armies[0]` var var sida i bara 8 av 13
// matcher, `anchorIdStr` bytte betydelse mellan payloads (ibland anvandar-id, ibland "1"/"2"), och
// anchorsInfo[].tags var tomma. Darfor kravs `mittAnkarId` — samma varde som armeMvp redan far,
// hamtat en gang per anslutning ur fetchRoomInfo().data.owner.id_str.
//
// UTAN ankar-id behalls de gamla reserverna. De ger 0 pa den har payloadformen, precis som forut —
// hellre en nolla an motstandarens poang i var egen overlay. Samma regel som armeMvp: gissa inte.
function battleFields(data, mittAnkarId){
  const battle=data?.battleInfo||data?.battle||data||{};
  const ankare=String(mittAnkarId||'').trim();
  const lagen=ankare?armelag(data):[];
  const vart=ankare?lagen.find(l=>l.id===ankare):null;
  const deras=vart?lagen.find(l=>l!==vart):null;
  return{...baseUser(data),
    scoreUs:number(vart?vart.lag?.hostscore:(battle?.hostScore??battle?.scoreUs??battle?.team1Score),1e12),
    scoreThem:number(deras?deras.lag?.hostscore:(battle?.guestScore??battle?.scoreThem??battle?.team2Score),1e12),
    multiplier:number(battle?.multiplier??battle?.boostMultiplier,100),battleStatus:text(battleStatusAv(data,battle),64),battleId:text(data?.battleId??battle?.battleId??data?.battleSettings?.battleId,160)};
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
    fromUserId:text(uppdatering.fromUserId||'',160),
    // MEDDELANDETS EGEN TIDSSTAMPEL, i TikToks klocka. Utan den gar fordrojningen till
    // fonstret bara att rakna mot Date.now() — och den lokala klockan lag 223 SEKUNDER fel i
    // den uppmatta sandningen (median over 3798 handelser). Se boostFordrojningMs nedan.
    skickatAt:number(rot.common?.createTime,Number.MAX_SAFE_INTEGER)
  };
}

/* HUR LANGE BRYGGAN SKA VANTA INNAN GLOVE-EVENTET SKICKAS.
 *
 * START-meddelandet bar bara KONFIGURATIONEN for multiplikatorfonstret; fonstret oppnar
 * senare. UPPMATT 2026-09-02, tre battles i samma sandning: 150 734, 105 987 och 110 881 ms
 * senare. Bryggan skickade boost-eventet i SAMMA millisekund som den tog emot START alla tre
 * gangerna, sa overlayn lyste under hela upptakten och var redan forbrukad nar multiplikatorn
 * borjade galla.
 *
 * RAKNAT INOM TIKTOKS EGEN KLOCKA — bada talen kommer ur SAMMA meddelande:
 *
 *     rewardStartTimestamp * 1000 - common.createTime
 *
 * Aldrig mot Date.now(). Inspelarens lokala klocka lag 222,8-231,5 s efter common.createTime
 * over samtliga 3798 handelser, med liten spridning: en klockforskjutning, inte
 * leveransfordrojning. Analysatorn gor precis det felet i dag och svarar darfor med fel TECKEN
 * och fel storlek.
 *
 * SENTINELVARDET FANGAS FORST. battleTaskFields satter fonsterStart till MAX_SAFE_INTEGER nar
 * faltet saknas; rakt in i en utrakning blir vantetiden ~285 miljoner ar — och en setTimeout
 * med ett sa stort tal fyrar dessutom OMEDELBART i Node, alltsa samma bugg fast tyst.
 *
 * TAKET pa tio minuter gor skillnad pa "vanta lange" och "vanta for alltid". En battle ar ~5
 * minuter; ett fonster som pastar sig oppna om ett dygn ar trasig data. */
const BOOST_TAK_MS = 600000;

function boostFordrojningMs(f){
  if(!f||typeof f!=='object')return 0;
  const start=Number(f.fonsterStart),skickat=Number(f.skickatAt);
  if(!Number.isFinite(start)||start<=0||start>=Number.MAX_SAFE_INTEGER)return 0;
  if(!Number.isFinite(skickat)||skickat<=0)return 0;
  const ms=start*1000-skickat;
  if(!Number.isFinite(ms)||ms<=0)return 0;
  return Math.min(ms,BOOST_TAK_MS);
}
// Ett boost-event ska bara skickas nar det finns ett riktigt fonster att visa.
//
// Multiplikator 0 eller 1 ar inget att tanda en overlay for, och TASK_UPDATE fyrar upprepat under
// hela uppgiften — skickades varje uppdatering skulle Glove Snipe blinka i ett. Bara steget som
// BAR konfigurationen (START) eller ett lyckat slutlage far passera.
function arBoostFonster(f){
  return !!f && f.multiplier>=2 && (f.steg===0 || (f.steg===2&&(f.resultat===0||f.resultat===2)));
}
// FALTEN HAR AR ALLT MOLNVAGEN KAN BARA. Ett falt som baseUser eller giftFields raknar fram men
// som inte star i litteralen nedan finns inte for nagon molnanvandare — och eftersom desktopvagen
// har en EGEN vitlista (electron-app/local-server.js) fungerar samma widget olika beroende pa hur
// streamern anslutit. Fyra falt saknades fram till 2026-09-06 (#349):
//
//   name         -> New Follower Alert skrev bara avataren och lat namnet sta kvar pa forra
//                   foljaren, eftersom media.js:694 gor `if(event.name)` och sedan save().
//   diamonds     -> cleanEvent raknar `diamonds` ur diamonds??coins. Bada saknades, sa den
//                   stamplade 0 i ramen — och klientens `e.diamonds ?? e.coins` faller INTE
//                   igenom pa noll. En gava pa 30 000 diamanter nadde Actions med coins=0, sa
//                   varje giftCoins-regel med troskel >=1 var dod pa molnvagen. Faltet fanns
//                   redan i cleanEvent sedan #133; det var HAR halet satt.
//   isAnonymous  -> "Exkludera anonyma tittare" var en kryssruta som inte gjorde nagot.
//   isModerator  -> publikvalet "Moderator" i Actions kunde aldrig matcha.
//   isFollower/  -> samma familj, hittat av completeness-vakten nedan: klienten HARLEDER dem ur
//   isSubscriber    handelsetypen (`isFollower || t==='follow'`), sa publikvalet "Follower"
//                   matchade bara pa sjalva follow-eventet — aldrig nar en foljare skickade en
//                   gava. Harledningen finns kvar och OR:as med det riktiga vardet.
//
// `name` AR OVERLASTAT MED FLIT och det maste man veta: pa chat/chatcommand bar det KOMMENTAREN,
// inte avsandarens namn (bridge.js:360 satter bade name och comment; desktopens vitlista har
// inget comment-falt, sa dar ar `name` enda vagen for chattexten). Darav 500 tecken och inte 120.
// server/event-bus.js later darfor `comment` falla tillbaka pa `name` BARA for chattyper — utan
// den avgransningen blev avsandarens namn en chattkommentar pa varje gava.
//
// `diamonds` har sin egen reserv (`?? fields.coins`) HAR och inte bara i cleanEvent. Skalet ar
// subtilt: sa fort litteralen alltid skickar ett `diamonds`-falt blir det en explicit NOLLA for
// producenter som bara satter `coins`, och serverns `input?.diamonds ?? input?.coins` faller inte
// igenom pa noll. Utan raden hade fixen alltsa flyttat exakt samma bugg ett steg nedstroms.
// I dag satter bara giftFields `coins` (likeFields satter `points`, battleFields ingetdera), och
// dar ar de tva talen samma — men reserven ska sta dar datat finns, inte dar felet visar sig.
function cloudEvent(id,type,fields,at=Date.now()){
  return{id:text(id,160),type:text(type,64).toLowerCase(),userId:text(fields.userId||fields.username,160),username:text(fields.username||fields.name,120),name:text(fields.name,500),comment:text(fields.comment,500),profileUrl:text(fields.profileImage,1200),giftId:text(fields.giftId,160),giftName:text(fields.giftName,160),giftImage:text(fields.giftImage,1200),count:number(fields.count,1e9),value:number(fields.coins??fields.points??fields.score,1e12),diamonds:number(fields.diamonds??fields.coins,1e12),scoreUs:number(fields.scoreUs,1e12),scoreThem:number(fields.scoreThem,1e12),multiplier:number(fields.multiplier,100),battleStatus:text(fields.battleStatus,64),...(fields.battleId?{battleId:text(fields.battleId,160)}:{}),emote:text(fields.emote,160),...(fields.fanLevelUp?{fanLevelUp:{from:number(fields.fanLevelUp.from,50),to:number(fields.fanLevelUp.to,50)}}:{}),fanClubLevel:number(fields.fanClubLevel,50),gifterLevel:number(fields.gifterLevel,50),isAnonymous:!!fields.isAnonymous,isModerator:!!fields.isModerator,isFollower:!!fields.isFollower,isSubscriber:!!fields.isSubscriber,at:number(at,Number.MAX_SAFE_INTEGER)};
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
// 'guardian' tillkom 2026-09-01, uppmatt i skarp sandning: BARRAGE med subType
// 'guardian_entrance'. Den bar en PERSON och hor darfor inte hemma i TIKTOK_ROOM_TYPES.
const TILL_MOLNET=new Set(['gift','like','likes','follow','share','member','subscribe','viewer','battle','glove','guardian','subscriberemote','fanlevelup','battle_mvp']);

// EMOTES — formen kommer ur bibliotekets egna typer, inte ur en gissning
// (tiktok-live-proto/dist/node/v3.d.ts):
//
//   WebcastEmoteChatMessage { common, user, emoteList: EmoteModel[], msgFilter, userIdentity }
//   EmoteModel { emoteId, image: ImageModel, emoteType, emoteScene, emotePrivateType, packageId }
//   ImageModel { urlList: string[], uri, ... }
//
// FALTNAMNEN AR KLIENTENS, INTE VARA. live-client.js recordSeenEmote() laser `e.emote` och
// `e.giftImage` — darfor heter de sa har, aven om `giftImage` later fel for en emote. Byter man
// namn fylls valjaren aldrig och ingenting sager varfor.
//
// INGEN FILTRERING PA emoteScene, med flit. Enumet finns (SUBSCRIPTION=0, GAME=1, FANS_CLUB=2)
// och det vore frestande att bara slappa fram FANS_CLUB. Men klienten filtrerar inte — den lagrar
// allt den ser — en prenumerationsemote ar en lika giltig trigger, och en filtrering HAR ar osynlig
// for anvandaren och gar inte att angra utan omdeploy. Vill vi filtrera gors det i klienten, mot
// uppmatt data. Vi har annu inte sett ett enda skarpt EMOTE-event.
//
// FORSTA EMOTEN TAS. emoteList ar en array — en chattrad kan bara flera. Ett event per emote hade
// dubblerat trafiken mot ingest-taket for en ren valjarfunktion.
function emoteFields(data){
  const forsta=data?.emoteList?.[0]||data?.emote||{};
  const bild=forsta?.image||{};
  return{
    ...baseUser(data),
    emote:text(forsta?.emoteId,160),
    giftImage:text(bild?.urlList?.[0]||bild?.imageUrl||'',1200)
  };
}
// FANS_UPGRADE — TikToks EGEN nivahojning, uppmatt 2026-09-01 (fem exemplar, nivaer 32/18/10/19/11).
//
//   subType  'fans_upgrade'
//   key      pm_mt_fan_live_upgrade_bullet
//   pattern  "reached member Lv.{0:string}"
//   pieces[0].stringValue = NYA nivan
//
// VARFOR DEN AR BATTRE AN SERVERNS JAMFORELSE. server/viewer-levels.js stamplar en hojning genom
// att jamfora mot senast sedda niva i Postgres, och kraver darfor att personen setts TVA ganger.
// Ses nagon forsta gangen pa sin nya niva lars den bara in och hojningen forsvinner tyst — det ar
// exakt det som hande natten 2026-09-01: fem hojningar intraffade, noll alerts.
//
// FRAN-NIVAN AR till-1, OCH DET AR EN ANTAGANDE. TikTok sager bara vilken niva som natts, aldrig
// varifran. till-1 ar samma standard som klientens egen trigger redan anvander
// (media.js triggerFanLevelUp: `fran && fran<till ? fran : Math.max(1,till-1)`), sa animationen
// blir densamma som forut. En hojning over flera nivaer visas alltsa som ett steg.
//
// NIVA 1 GER INGEN STAMPEL. Molnets hojning() kraver fran >= 1, och for niva 1 blir fran 0. Battre
// att inte skicka an att skicka nagot molnet tyst slanger.
//
// fanClubLevel SATTS OCKSA, och det ar inte overflodigt: fan-level-session.js hantera() borjar med
// `const niva = nivaAv(e); if (!niva) return;` och lamnar alltsa direkt om eventet saknar niva —
// utan faltet hade stampeln aldrig lasts.
function fansUppgradering(data){
  if(String(data?.subType||data?.scene||'').trim().toLowerCase()!=='fans_upgrade') return null;
  const raa=data?.content?.pieces?.[0]?.stringValue;
  const till=Number(raa);
  if(!Number.isInteger(till)||till<2||till>50) return null;
  if(String(raa).trim()==='') return null;
  return{...baseUser(data),fanClubLevel:till,fanLevelUp:{from:till-1,to:till}};
}
// TIKTOKS EGEN BIDRAGSLISTA VID BATTLE-SLUT — uppmatt 2026-09-02, tva battle-slut.
//
// LINK_MIC_ARMIES med triggerReason 2 (BATTLE_END) bar hela rankingen fardigraknad:
//   teamArmies[].teamUser[].userIdStr   ankarna (streamarna) i laget
//   teamArmies[].userArmies.userArmies[] { userId, score, nickname, avatarThumb }  bidragsgivarna
//
// VARFOR DEN AR BATTRE AN ATT RAKNA SJALV. battle-mvp-session.js summerar coins ur gift-event som
// nar klienten. Det missar allt som hant innan overlayen oppnades, tappar ett bidrag om ett event
// tappas — och framfor allt: RAW COINS AR INTE BATTLE-POANG. Boosting Glove multiplicerar poangen
// i matchen, sa siffran TikTok visar pa skarmen ar inte summan av gavornas diamanter.
//
// VILKET LAG AR VART. Listan bar BADA sidorna, och fel val hyllar motstandarens tittare i var egen
// overlay. Regeln ar uppmatt: rummets agare (fetchRoomInfo -> data.owner.id_str) aterfinns i
// teamUser[].userIdStr for vart lag. I den uppmatta sandningen: 7276185677820527649 (jokero060)
// lag i team 1.
//
// UTAN ANKAR-ID GORS INGENTING. Att anta "team 1 ar alltid vart" hade fungerat i BADA de uppmatta
// matcherna och varit fel sa fort streamern bjuds IN i stallet for att bjuda. Hellre tyst an fel
// person pa skarmen.
//
// NOLL POANG VINNER INTE: en match dar ingen gav nagot ska inte visa nagon MVP alls.
// LIKA POANG avgors pa namn, sa svaret aldrig beror pa inmatningsordningen.
/* VART LAGS GIVARLISTA — ur den form TikTok FAKTISKT skickade.
 *
 * TVA FORMER, BADA UPPMATTA i skarpa sandningar med samma konto tva dygn isar:
 *
 *   inspelning   LINK_MIC_ARMIES   teamArmies fylld   armies-objekt
 *   2026-09-02              305           305 av 305             305
 *   2026-09-04              450             0 av 450             450
 *
 * Den 4:e var `teamArmies` en TOM ARRAY i varenda rad. `armies` — ett OBJEKT nycklat pa
 * ankar-id — fanns i BADA, i varenda rad. Den lases darfor forst.
 *
 * FALLAN: `teamArmies: []` ar TRUTHY. En ||-kedja som borjar dar faller aldrig igenom till
 * `armies` — den stannar pa den tomma listan och rapporterar "ingen arme".
 *
 * STRUKTURSKILLNADEN, ordagrant ur inspelningarna:
 *   teamArmies[i] = { teamId, teamUser:[{userIdStr}], userArmies:{ userArmies:[…] } }
 *   armies[ankarId] = { userArmies:[…], hostscore, anchorIdStr }
 * Alltsa: i den ena BAR `userArmies` listan, i den andra AR den listan.
 *
 * LAGET AVGORS ALLTID AV ANKAR-ID, aldrig av ordning eller hogsta poang. Att gissa "forsta
 * laget ar vart" hade fungerat i varje uppmatt match och varit fel sa fort streamern blir
 * INBJUDEN i stallet for att bjuda — och da hyllar overlayn motstandarens tittare. */
function vartLagsGivare(data,ankare){
  const armies=data&&data.armies;
  if(armies&&typeof armies==='object'&&!Array.isArray(armies)){
    for(const nyckel of Object.keys(armies)){
      const lag=armies[nyckel];
      if(String(nyckel).trim()!==ankare&&String(lag&&lag.anchorIdStr||'').trim()!==ankare) continue;
      if(Array.isArray(lag&&lag.userArmies)) return lag.userArmies;
      if(Array.isArray(lag&&lag.userArmies&&lag.userArmies.userArmies)) return lag.userArmies.userArmies;
      return null;
    }
  }
  const vart=(data&&data.teamArmies||[]).find(t=>
    (t&&t.teamUser||[]).some(u=>String(u&&u.userIdStr||'').trim()===ankare));
  if(!vart) return null;
  if(Array.isArray(vart.userArmies&&vart.userArmies.userArmies)) return vart.userArmies.userArmies;
  if(Array.isArray(vart.userArmies)) return vart.userArmies;
  return null;
}
function armeMvp(data, mittAnkarId){
  const ankare=String(mittAnkarId||'').trim();
  if(!ankare) return null;
  if(Number(data?.triggerReason)!==2) return null;
  const givare=vartLagsGivare(data,ankare);
  if(!givare) return null;
  const lista=givare
    .map(b=>({name:text(b?.nickname,120),score:number(b?.score,1e12),
      profileImage:text(b?.avatarThumb?.urlList?.[0]||'',1200)}))
    .filter(b=>b.score>0&&b.name);
  if(!lista.length) return null;
  lista.sort((a,b)=>b.score-a.score||(a.name<b.name?-1:a.name>b.name?1:0));
  return lista[0];
}
// MVP-EVENTET som bryggan skickar. Bygger pa armeMvp ovan och fyller BADA faltnamnen:
//   name/score       las av media.js triggerBattleMvp
//   username/coins   ar det cloudEvent faktiskt bar (username, value)
// Utan bada tappas namnet eller poangen beroende pa vilken ande som laser. battleId foljer med
// for att klienten ska kunna deduplicera per match — utan det kan widgeten tandas tva ganger,
// en gang av TikToks lista och en gang av battle-mvp-session.js egen rakning.
function mvpFields(data, mittAnkarId){
  const mvp=armeMvp(data, mittAnkarId);
  if(!mvp) return null;
  return{name:mvp.name,username:mvp.name,score:mvp.score,coins:mvp.score,
    profileImage:mvp.profileImage,battleId:text(data?.battleId,160)};
}
function tillMolnet(typ){return TILL_MOLNET.has(typ)}

// GUARDIAN — UPPMATT, INTE GISSAD (2026-09-01, inspelning med VYRA_INSPELNING_TYPER=alla).
//
// TikTok annonserar en Guardians entré som ett BARRAGE med subType 'guardian_entrance'. Samma
// sandning bar tre andra BARRAGE-subTypes — fans_entrance (16), user_level_entrance (5) och
// fans_upgrade (3) — sa jamforelsen maste vara EXAKT, aldrig en delstrangssokning: TikTok saljer
// dessutom en gava som heter "Guardian Wings", och en ordsokning i payloaden hade tant emblemet
// for varje sald sadan gava.
//
// `scene` bar samma varde som `subType` i varje uppmatt exemplar och lases som reserv — men bara
// den, aldrig hela payloaden.
function arGuardianEntrance(data){
  return String(data?.subType||data?.scene||'').trim().toLowerCase()==='guardian_entrance';
}


module.exports={text,number,battleProbe,armelag,battleTaskFields,arBoostFonster,boostFordrojningMs,profileImageOf,isStreakable,isFinalFrame,sourceId,identityOf,baseUser,giftFields,likeFields,battleFields,cloudEvent,tillMolnet,TILL_MOLNET,arGuardianEntrance,emoteFields,fansUppgradering,armeMvp,mvpFields};
