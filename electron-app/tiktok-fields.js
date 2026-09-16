'use strict';
// Rena faltfunktioner for skrivbordsappens TikTok-anslutning.
//
// VARFOR EN EGEN FIL. Funktionerna nedan lag i tiktok-service.js, som gor `require(
// 'tiktok-live-connector')` pa modulniva. Den modulen finns bara i electron-app/node_modules, och
// CI kor `npm ci` i ROTEN — ett rotprov som laddade tjansten foll darfor i CI aven nar logiken var
// ratt. Utbruten hit har filen NOLL beroenden och gar att prova var som helst, precis som
// tiktok-bridge/normalizer.js.
//
// DEN HAR FILEN AR DESKTOPVAGENS MOTSVARIGHET TILL normalizer.js. De tva far inte glida isar: de
// matar samma widgetar, och en skillnad syns bara for den som rakar kora den ena vagen.
// tests/desktop-paritet.test.js jamfor dem falt for falt.

function text(value, max = 500) {
  return String(value ?? '').slice(0, max);
}

function number(value, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : 0;
}

// Mirrors tiktok-bridge/normalizer.js's profileImageOf: take the largest avatar TikTok offers
// (avatarLarger 1080, avatarMedium 720) before falling back to profilePictureUrl, whose variant is
// unspecified, and to avatarThumb, which is only 100x100. Keeping web and desktop identical here
// matters because both feed the same widgets.
function avatarOf(data) {
  const user = data?.user || data;
  return text(
    user?.avatarLarge?.urlList?.[0] || user?.avatarLarge?.urlListList?.[0]
    || user?.avatarLarger?.urlList?.[0] || user?.avatarLarger?.urlListList?.[0]
    || user?.avatarMedium?.urlList?.[0] || user?.avatarMedium?.urlListList?.[0]
    || data?.profilePictureUrl || user?.profilePictureUrl
    || user?.avatarThumb?.urlList?.[0] || user?.avatarThumb?.urlListList?.[0]
    || '', 2048);
}

// userIdentity (isModeratorOfAnchor/isSubscriberOfAnchor/isFollowerOfAnchor) only exists on chat,
// gift and emote messages in TikTok's protocol — join/like/follow/share/member messages don't carry
// it, so those event types always report false here regardless of the viewer's real status. Mirrors
// tiktok-bridge/normalizer.js's identityOf.
function identityOf(data) {
  const id = data?.userIdentity;
  return { isModerator: !!id?.isModeratorOfAnchor, isFollower: !!id?.isFollowerOfAnchor, isSubscriber: !!id?.isSubscriberOfAnchor };
}

// NIVAERNA BOR I badgeList, atskilda av sceneType. Speglar tiktok-bridge/normalizer.js exakt —
// samma uppmatning, samma val. Inspelning 2026-09-01 (3710 rader):
//   sceneType 10  fanklubbsniva  1269 st, ALLA med privilegeLogExtra.level, spann 1-50
//   sceneType  8  niva ("Lv.")    938 st, ALLA med privilegeLogExtra.level, spann 1-34
//   sceneType 16 (guardian) och 1 (moderator) bar ocksa level, satt till "0"
// De tva falt koden lasta forut finns inte i verklig trafik: fansClub 0 forekomster,
// payGrade.level 0 i alla 1226. Filnamnet i ikonen ar en HINK, inte nivan (fel i 1646 fall), och
// combine.str ar nivan for nivabadgen men klubbens NAMN for fanklubbsbadgen.
const BADGE_FANKLUBB = 10, BADGE_NIVA = 8;
function nivaFranBadge(user, sceneType) {
  for (const b of user?.badgeList || []) {
    if (Number(b?.sceneType) !== sceneType) continue;
    const n = Number(b?.privilegeLogExtra?.level);
    if (n > 0) return n;
  }
  return 0;
}

function baseUser(data) {
  const user = data?.user || data;
  return {
    // uniqueId FINNS INTE i tiktok-live-connector 2.x — uppmatt 0 av 1333 event i en skarp
    // sandning. Utan reserven pa displayId blir VARJE desktop-event namnlost: inte bara nivaerna,
    // utan gavor, foljare, allt. Molnvagens baseUser foll redan tillbaka pa displayId; den har
    // gjorde det inte, och det ar hela skillnaden mellan en fungerande och en tom widget.
    username: text(user?.uniqueId || user?.displayId || data?.uniqueId, 100),
    name: text(user?.nickname || data?.nickname || user?.uniqueId || user?.displayId, 500),
    profileImage: avatarOf(data),
    // TikTok's "Enigma" mode lets a viewer browse/gift anonymously (mask on). Surfacing this lets
    // Events optionally exclude them, same as tiktok-live-proto exposes it on every User struct.
    isAnonymous: !!(data?.user?.enigmaInfo?.isEnigmaMaskOn || data?.enigmaInfo?.isEnigmaMaskOn),
    ...identityOf(data),
    // "Team" level in TikTok's own UI = the viewer's Fan Club level with this streamer specifically.
    fanClubLevel: number(nivaFranBadge(user, BADGE_FANKLUBB) || user?.fansClub?.data?.level),
    // Gifter-badgens niva. Faltet SAKNADES HELT pa desktopvagen — Gifter Level Up (9 designer)
    // kunde darfor aldrig tanda for den som kor skrivbordsappens egen anslutning.
    gifterLevel: number(nivaFranBadge(user, BADGE_NIVA) || user?.payGrade?.level)
  };
}

// GUARDIAN. Uppmatt 2026-09-01: BARRAGE med subType 'guardian_entrance' — atta event, alla fran
// samma person av ~59 tittare.
//
// REGELN AR EN KOPIA AV normalizer.arGuardianEntrance, OCH DET AR ETT TVANG, inte slarv.
// electron-builder paketerar en EXPLICIT filnamnslista (electron-app/package.json build.files);
// en require utanfor electron-app/ hade saknats i .exe:n och kraschat appen vid start med
// "Cannot find module". Kopian ar darfor priset for att kunna paketeras alls.
//
// Priset betalas av ett PROV i stallet: tests/desktop-paritet.test.js kor bada implementationerna
// mot samma tabell av indata och kraver identiskt svar. Glider de isar faller det provet.
//
// Jamforelsen ar EXAKT, aldrig en delstrangssokning: TikTok saljer en gava som heter
// "Guardian Wings", och en ordsokning hade tant emblemet for varje sald sadan gava.
function arGuardianEntrance(data) {
  return String(data?.subType || data?.scene || '').trim().toLowerCase() === 'guardian_entrance';
}

// FANS_UPGRADE — TikToks EGEN nivahojning. Uppmatt 2026-09-01: fem exemplar, nivaer 32/18/10/19/11.
//
//   subType  'fans_upgrade'
//   pieces[0].stringValue = NYA nivan
//
// KOPIERAD FRAN normalizer.fansUppgradering AV SAMMA SKAL SOM arGuardianEntrance: electron-builder
// paketerar en explicit filnamnslista, och en require utanfor electron-app/ hade saknats i .exe:n.
// Priset betalas av tests/desktop-paritet.test.js, som kor bada implementationerna mot samma
// tabell och kraver identiskt svar.
//
// fran = till-1 ar ett ANTAGANDE: TikTok sager bara vilken niva som natts. Samma standard som
// klientens trigger redan anvander. Niva 1 ger ingen stampel — molnets hojning() kraver fran >= 1.
function fansUppgradering(data) {
  if (String(data?.subType || data?.scene || '').trim().toLowerCase() !== 'fans_upgrade') return null;
  const raa = data?.content?.pieces?.[0]?.stringValue;
  const till = Number(raa);
  if (!Number.isInteger(till) || till < 2 || till > 50) return null;
  if (String(raa).trim() === '') return null;
  return { ...baseUser(data), fanClubLevel: till, fanLevelUp: { from: till - 1, to: till } };
}

module.exports = { battleStatusAv, armeMvp, mvpFields, text, number, avatarOf, identityOf, baseUser, nivaFranBadge,
  arGuardianEntrance, fansUppgradering,
  BADGE_FANKLUBB, BADGE_NIVA };

// ---- BATTLE MVP OCH battleStatus — SPEGLADE UR tiktok-bridge/normalizer.js ---------------------
//
// #381: molnet tar emot typen `battle_mvp` och battle-mvp-session.js tander widgeten pa den, men
// SKRIVBORDSAPPEN sande den aldrig. tiktok-service.js emitterade elva typer och battle_mvp var
// ingen av dem. Battle MVP fungerade alltsa pa molnvagen och var HELT TYST pa desktopvagen.
//
// Tva led saknades, inte ett: sjalva typen, och `battleStatus` som ar grinden som oppnar en
// MVP-session (battle-mvp-session.js). Ordet fanns inte en enda gang i electron-app/.
//
// SPEGLINGEN AR ORDAGRANN MED FLIT. Faltnamn, ordning och gransfall foljer normalizer.js rad for
// rad — det ar samma kontrakt, och tva egna tolkningar av samma payload ar exakt den sortens glapp
// som gor att en widget tands pa ena vagen och inte pa den andra. Provet
// electron-app/test/battle-mvp-paritet.test.js kor BADA implementationerna mot samma uppmatta
// payloader och kraver identiska svar; glider de isar faller det.
const BATTLE_ACTION = { 4: 'battle_started', 5: 'battle_finished', 6: 'battle_finished' };
const BATTLE_STATUS = { 1: 'battle_started', 2: 'battle_finished', 3: 'battle_punish_started', 4: 'battle_punish_finished' };

function battleStatusAv(data, battle) {
  return BATTLE_ACTION[Number(data?.action)]
    || BATTLE_STATUS[Number(data?.battleSettings?.status)]
    || text(battle?.status || battle?.battleStatus || '', 64);
}

// TIKTOK SKICKAR ARMELISTAN I TVA FORMER, och bada maste lasas — den ena bar `armies` som ett
// OBJEKT nycklat pa ankar-id, den andra `teamArmies` som en array. Uppmatt 2026-09-04: i 450 rader
// var `teamArmies` en TOM array i varenda rad, sa en implementation som bara laser den hade svarat
// null pa fyra battle-slut i rad. Se tiktok-bridge/test/armies-mvp-tva-former.test.js.
function vartLagsGivare(data, ankare) {
  const armies = data && data.armies;
  if (armies && typeof armies === 'object' && !Array.isArray(armies)) {
    for (const nyckel of Object.keys(armies)) {
      const lag = armies[nyckel];
      if (String(nyckel).trim() !== ankare && String((lag && lag.anchorIdStr) || '').trim() !== ankare) continue;
      if (Array.isArray(lag && lag.userArmies)) return lag.userArmies;
      if (Array.isArray(lag && lag.userArmies && lag.userArmies.userArmies)) return lag.userArmies.userArmies;
      return null;
    }
  }
  const vart = (data && data.teamArmies || []).find(t =>
    (t && t.teamUser || []).some(u => String((u && u.userIdStr) || '').trim() === ankare));
  if (!vart) return null;
  if (Array.isArray(vart.userArmies && vart.userArmies.userArmies)) return vart.userArmies.userArmies;
  if (Array.isArray(vart.userArmies)) return vart.userArmies;
  return null;
}

// GISSA INTE. Utan ankar-id gar det inte att veta vilken sida som ar var, och en MVP fran
// MOTSTANDARENS lag i var egen overlay ar varre an ingen MVP alls. triggerReason 2 ar det enda
// uppmatta varde som betyder "matchen ar slut och listan ar slutgiltig".
function armeMvp(data, mittAnkarId) {
  const ankare = String(mittAnkarId || '').trim();
  if (!ankare) return null;
  if (Number(data?.triggerReason) !== 2) return null;
  const givare = vartLagsGivare(data, ankare);
  if (!givare) return null;
  const lista = givare
    .map(b => ({
      name: text(b?.nickname, 120), score: number(b?.score, 1e12),
      profileImage: text(b?.avatarThumb?.urlList?.[0] || '', 1200)
    }))
    .filter(b => b.score > 0 && b.name);
  if (!lista.length) return null;
  lista.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return lista[0];
}

// BADA FALTNAMNEN FYLLS, precis som i molnet: name/score las av media.js triggerBattleMvp, medan
// username/coins ar det handelsen faktiskt bar genom bussen. Utan bada tappas namnet eller poangen
// beroende pa vilken ande som laser. battleId foljer med sa klienten kan deduplicera per match —
// utan den kan widgeten tandas tva ganger, en gang av TikToks lista och en gang av
// battle-mvp-session.js egen rakning.
function mvpFields(data, mittAnkarId) {
  const mvp = armeMvp(data, mittAnkarId);
  if (!mvp) return null;
  return {
    name: mvp.name, username: mvp.name, score: mvp.score, coins: mvp.score,
    profileImage: mvp.profileImage, battleId: text(data?.battleId, 160)
  };
}
