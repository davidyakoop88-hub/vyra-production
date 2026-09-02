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

module.exports = { text, number, avatarOf, identityOf, baseUser, nivaFranBadge,
  arGuardianEntrance, fansUppgradering,
  BADGE_FANKLUBB, BADGE_NIVA };
