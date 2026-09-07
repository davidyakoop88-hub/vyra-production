'use strict';
// RA-INSPELARE FOR TIKTOK-PAYLOADS — ett lokalt verktyg, aldrig ett produktionslage.
//
// VARFOR DEN FINNS. docs/live-verifiering.md listar fyra saker som bara gar att avgora i en riktig
// sandning, och roadmapens LINK_MIC_ARMIES vantar pa samma sak: nagon maste hinna lasa loggen i
// stunden, mitt i ett femminuters battle. Sonden i bridge.js loggar redan vid FORANDRING, men den
// loggar en signatur — inte payloaden. Med raa payloads pa fil kan varje falt i roadmapens tabell
// utvecklas och provas offline, om och om igen, mot verklig trafik.
//
// VARFOR DEN AR LOKAL. Bryggan kor pa tva stallen. Lokalt via ANSLUT-TIKTOK-LIVE.cmd, pa
// streamerns egen dator. I molnet forkas den av connection-manager.js i en container som kor
// `read_only: true` med bara tmpfs skrivbar (docker-compose.production.yml) och som USER vyra utan
// deklarerad volym. Dar skulle en skrivning till /app misslyckas rakt av, och en till /tmp
// forsvinna vid nasta deploy utan att nagon kunnat hamta den. Inspelaren ar alltsa avstangd som
// default och stanger av SIG SJALV om katalogen inte gar att skapa.
//
// TRE REGLER SOM INTE FAR BOJAS:
//
//   1. INSPELNINGEN FAR ALDRIG FALLA BRYGGAN. Varje fs-anrop ar omslutet; ett fel stanger av
//      inspelningen och skriver en rad. En sandning far inte do for att en disk ar full.
//   2. EN TYP SOM SPELAS IN MEN INTE REDAN VIDAREBEFORDRAS FAR ALDRIG NA MOLNET. Inspelaren
//      prenumererar bredare an bryggan skickar, och de tva ytorna hor ihop bara via den har
//      filen. Vaktat av tiktok-bridge/test/inspelare.test.js.
//   3. FORVALET AR ATT MASKERA. Typer och struktur behalls; varden maskeras om de inte star
//      pa en GRANSKAD lista. Aven NYCKLAR maskeras nar de ar person-id — TikTok skickar
//      per-anvandarkartor nycklade pa ankar-id. Se maskera() nedan.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---- MASKERINGENS FORVAL: MASKERA, INTE SLAPPA IGENOM (#357) -----------------------------------
//
// FRAM TILL 2026-09-07 var det tvartom. En lista raknade upp de falt som skulle maskeras, och allt
// som inte stod dar slapptes igenom. Den modellen kan bara vara komplett tills TikTok lagger till
// ett falt — och den var aldrig komplett. UPPMATT over nio inspelningar (58 876 rader, 417 MB) i
// en fil vars filhuvud sager `"maskad":true`:
//
//   416 unika person-id i klartext   fromUserId, idStr, userIdStr, contributorId,
//                                    contributorIdStr, currentSponsorId, toUserId, uid,
//                                    anchorId, sendUserId — inget av dem stod i listan
//   ~3 130 unika `uri`               varav 76 332 forekomster ar AVATARSOKVAGAR. De saknar
//                                    `https://`, sa URL-regeln sag dem aldrig.
//   363 unika `describe`             hela meningar byggda pa tva visningsnamn
//    87 unika contributorDisplayId   display-id ar anvandarnamn; 83 % icke-ASCII, ofta emoji
//
// Forvalet ar darfor omvant: ett falt som ingen har granskat MASKERAS. Samma princip som
// Dockerfilens dokumentrot — det som aldrig kopierades kan inte serveras, och det som aldrig
// skrevs kan inte lacka.
//
// ⚠️ REGELN SOM INTE FICK BLI EN MONSTERREGEL. Ett tidigare forslag var att maskera varje varde
// som matchar \d{15,22}, oavsett faltnamn. Det hade forstort inspelaren: `score` levereras som en
// STRANG med upp till 19 siffror (8 596 unika varden uppmatta) och `msgId` som exakt 19 siffror
// (31 132 unika). Bada hade forsvunnit. Ett person-id och en battle-poang har SAMMA form — bara
// faltnamnet skiljer dem at, och darfor maste person-listan ga pa namn.
//
// Av samma skal gar allowlisten pa FALTNAMN och aldrig pa monster: "john_doe" och "gift_streak"
// gar inte att skilja at pa form.

// Pekar ut en MANNISKA -> id#hash. Hashen ar stabil, sa samma person gar att folja genom filen.
//
// Listan ar inte handskriven utan resultatet av en genomgang av SAMTLIGA 384 strangbarande
// faltnamn i de nio inspelningarna. Den handskrivna versionen hade 25 poster; genomgangen hittade
// 54. Det ar sjalva argumentet for att forvalet maste vara "maskera": en lista over farliga falt
// blir aldrig klar, for TikTok fortsatter lagga till dem.
const PERSON_FALT = new Set(['userid', 'secuid', 'uniqueid', 'displayid', 'id', 'idstr',
  'useridstr', 'uid', 'touserid', 'fromuserid', 'anchorid', 'anchoridstr', 'contributorid',
  'contributoridstr', 'contributordisplayid', 'senduserid', 'currentsponsorid', 'sponsorid',
  'opuid', 'actionbyuserid', 'linkerid', 'ownerid', 'hostid', 'toid', 'fromid',
  // Tillkom via genomgangen 2026-09-07:
  'specialid', 'channelid', 'sharetarget', 'targetuserid', 'anchorlinkmicidstr', 'rivalanchorid',
  'rivallinkmicidstr', 'secinviteuid', 'secapplyuid', 'secfromuserid', 'sectouserid', 'uidlist',
  'tomemberid', 'tomemberidint', 'inviteuid', 'ownerlinkmicid', 'primaryid', 'curuserid',
  'deleteuserids', 'linkmicid', 'linkmicidstr', 'grouplinkmicid', 'bestteammateuid']);
// Namn pa en manniska -> namn#hash. Egen prefix sa att en namn-hash gar att skilja fran en id-hash.
const NAMN_FALT = new Set(['nickname', 'nickname2', 'name', 'username', 'displayname', 'nick',
  'tomembernickname', 'sendusername']);
// Fritext skriven av en manniska -> <text N tecken>.
const TEXT_FALT = new Set(['comment', 'content', 'text', 'message', 'describe']);
// Bild- och lankfalt. MED schema racker origin: CDN-varianten gar att kanna igen och pekar inte ut
// nagon. UTAN schema ar det en sokvag, och en avatarsokvag pekar ut en person lika sakert som ett
// namn — da hashas den.
//
// AVSTEG FRAN GENOMGANGEN, med flit: den klassade `urlList` och `profileImage` som PERSON, alltsa
// hasha rakt av. Origin-formen ar mer anvandbar (man ser vilken CDN-variant TikTok valde) och
// matningen visar att den inte lacker — noll URL:er med sokvag over 5,95 miljoner strangvarden.
// Det schemalosa fallet hashas anda, sa skyddet ar detsamma.
const URL_FALT = new Set(['avatar', 'avatarthumb', 'avatarmedium', 'avatarlarge', 'avatarlarger',
  'profilepicture', 'profilepictureurl', 'avatarurl', 'uri', 'openweburl', 'buttonschema',
  'schema', 'previewclickactionschemaurl', 'urllist', 'profileimage', 'shareqrcodeuri',
  'resourceuri']);

// stringValue ar TVETYDIGT och behandlas darfor efter INNEHALL, inte efter namn. Samma falt bar
// bade ett visningsnamn och ett tal, pa samma niva i payloaden:
//
//   guardian_shield_card_used  content.pieces[0].stringValue = "• <visningsnamn> ♛"   <- PII
//   fans_upgrade               content.pieces[0].stringValue = "32"                   <- nivan
//
// Att hasha hela faltet hade forstort exakt den matning som gav oss fans_upgrade; att lamna det
// orort lamnar namn i klartext. Regeln ar darfor smal: ett RENT tal slipper undan, allt annat
// hashas som ett namn.
//
// ⚠️ Faltet MASTE sta har och inte i PERSON_FALT: skikt 2 ligger fore sifferregeln, sa en post i
// PERSON_FALT hade hashat aven "32". Genomgangen 2026-09-07 foreslog just det, och det hade tagit
// bort nivamatningen utan att nagot prov fallit.
const INNEHALLSFALT = new Set(['stringvalue']);

const RENT_TAL = /^\d+$/;
// Bara for OBJEKTNYCKLAR. Se kommentaren i maskera() om varfor samma form ar saker dar och
// oanvandbar pa varden.
const ID_NYCKEL = /^\d{15,22}$/;
const ICKE_ASCII = /[^\x00-\x7F]/;

// Falt vars ICKE-numeriska strangvarden slapps igenom ORORDA.
//
// LISTAN AR DATA MED MOTIVERING, inte en naken upprakning. Varje post bar skalet till att den star
// har, och tiktok-bridge/test/inspelare.test.js faller om en post saknar ett. Det ar det som gor
// "granska och befordra" till en arbetsgang i stallet for en vana: ett falt hamnar har nar nagon
// har tittat pa det och skrivit ned vad det ar — aldrig for att det SER ofarligt ut.
//
// OBS: rena siffror slipper undan pa FORM (skikt 6 i maskera nedan), sa score, msgId, battleId,
// roomId och tidsstamplar behover inte sta har. Av 197 falt som en genomgang foreslog att slappa
// igenom var 137 rena tal — de behover ingen post har over huvud taget. Bara 60 kravde ett beslut.
//
// ⚠️ ETT FALTNAMN AR INTE ETT FALT. Det ar den har listans grundlaggande svaghet, och den ar vard
// att forsta innan nagon lagger till en post. Granskningen 2026-09-07 pekade ut den: `avgColor`
// forekommer under SEX olika foraldrar (avatarThumb, icon, image, leftSideImage, badgeImageList,
// profileImage) och `height` under lika manga. En post har slapper igenom ALLA foraldrar pa en
// gang — aven den man inte tittade pa, och aven den TikTok lagger till i morgon.
//
// Darfor ar listan TOM som utgangslage. Det ar inte forsiktighet for sakens skull utan ett mott
// beslut: acceptansprovet mot de nio inspelningarna ger noll lackage i alla sex kategorierna
// med en tom lista, och battle-datan overlever anda pa sifferregeln — score, msgId, battleId,
// roomId, tidsstamplar och varje raknare. Kostnaden ar att farger och enum-strangar blir
// `<okant #a9{2}a9a>` i stallet for sitt varde. Skelettet sager fortfarande VAD det ar, sa den
// som behover det exakta vardet kan befordra faltet — efter att ha tittat pa alla dess foraldrar.
// VARFOR LISTAN INTE AR TOM TILL SLUT. Analysatorns punkt 6 (analysera-inspelning.js) hittar
// Guardian genom att soka efter ordet "guardian" i payloadens strangvarden. Med allt maskerat
// forsvann traffarna, och Guardian Del A ar oppet arbete som vantar pa just den analysen.
//
// En matning visade var ordet faktiskt star: rad-typen `guardian` (18 rader) ligger UTANFOR
// nyttolast och maskeras aldrig, sa handelserna gar att hitta anda. I varden star ordet i tolv
// falt, och elva av dem ar TikTok-forfattade resurs- och enum-namn med NOLL icke-ASCII, NOLL
// emoji och sma vardemangder. Det tolfte, `defaultPattern`, ar 20 % icke-ASCII och 85 % med
// blanksteg — alltsa renderad text — och star darfor kvar maskerat.
//
// Varje post nedan bar sitt uppmatta underlag. Foraldrarna ar kontrollerade, eftersom en post
// slapper igenom faltnamnet under ALLA foraldrar.
const SLAPP_IGENOM_SKAL = {
  method: 'Protokollets meddelandetyp under common. 28 unika, 0-36 tecken, ingen icke-ASCII.',
  scene: 'Lagesvarde under battleSettings. 8 unika, ingen icke-ASCII eller blanksteg.',
  subtype: 'Payloadens undertypsdiskriminator som analysen grenar pa. 7 unika, ren ASCII.',
  sourcetype: 'Ensiffrigt enum, 1 unikt varde i hela materialet. Kan fysiskt inte bara ett namn.',
  key: 'i18n-nyckel som valjer meddelandemall, under text/displayText/content. 125 unika, ren ASCII.',
  showvalue: 'Sprakresursnyckel under portraitTag i snake_case. 13 unika, inga siffror eller emoji.',
  promptkey: 'Uppslagsnyckel for UI-text under prompt/clickPrompt. 10 unika, ren ASCII.',
  namestarlingkey: 'i18n-nyckel (Starling) for ramens etikett under border/borderList. 1 unikt varde.',
  effectstarlingkey: 'i18n-nyckel for en effekt under assetExtra. 1 unikt varde, alltid 24 tecken.',
  geckochannelname: 'Namn pa TikToks assetbunt under animationData. 4 unika, ren ASCII.',
  filename: 'Filnamn pa en animationstillgang under animationData. 4 unika, ren ASCII.',
  giftname: 'Gavans katalognamn, forfattat av TikTok. 44 unika over nio inspelningar, 0 % icke-ASCII.',
};
const SLAPP_IGENOM = new Set(Object.keys(SLAPP_IGENOM_SKAL));

// Kort och stabil: samma tittare ger samma hash inom OCH mellan filer, sa en armé-lista gar att
// aggregera i efterhand. Det ar hela poangen med LINK_MIC_ARMIES — utan stabiliteten blir varje
// rad en ny anonym person och listan sager ingenting.
function hash(varde) {
  return crypto.createHash('sha256').update(String(varde)).digest('hex').slice(0, 8);
}

// FORMEN UTAN INNEHALLET. bokstav -> a, siffra -> 9, icke-ASCII -> U, emoji -> E; skiljetecken och
// blanksteg behalls; lopande sekvenser kollapsas till a{4}.
//
// Det har ar vad som gor inversionen mojlig utan att doda verktyget. Inspelaren finns for att
// UPPTACKA falt vi inte kanner till, och ett maskerat varde som bara sager <maskerat> hade gjort
// varje nytt falt osynligt. Skelettet sager om vardet ar en sokvag, ett enum, JSON eller ett tal
// — allt man behover for att bestamma sig for att titta narmare — utan att bara innehallet.
function skelett(s) {
  const delar = [];
  for (const tecken of String(s)) {
    let klass;
    if (/[A-Za-z]/.test(tecken)) klass = 'a';
    else if (/[0-9]/.test(tecken)) klass = '9';
    else if (/\p{Extended_Pictographic}/u.test(tecken)) klass = 'E';
    else if (tecken.charCodeAt(0) > 127) klass = 'U';
    else klass = tecken;
    if (delar.length && delar[delar.length - 1][0] === klass) delar[delar.length - 1][1]++;
    else delar.push([klass, 1]);
  }
  return delar.map(([k, n]) => (n > 1 && /[a9EU]/.test(k) ? `${k}{${n}}` : k.repeat(Math.min(n, 3))))
    .join('').slice(0, 64);
}

// MASKERAR VARDEN, ALDRIG FORMER.
//
// Inspelarens hela syfte ar att lara sig faltnamn och former. En maskering som slog sonder
// strukturen hade gjort filen vardelos, sa: nycklar behalls, typer behalls, och TAL ROSS INTE —
// det ar dar battle-datan bor (score, diamondScore, hostscore, rewardMultiple, timestamps).
//
// SKIKTEN ARBETAR I DEN HAR ORDNINGEN, och ordningen ar sjalv en regel:
//
//   1. icke-strangar          ororda            tal, boolean, bigint
//   2. person-falt            id#hash           FORE sifferregeln — ett anvandar-id ar rena siffror
//   3. namn-falt              namn#hash
//   4. text-falt              <text N tecken>
//   5. url-falt / http(s)     origin eller hash avatarsokvagar utan schema fangas av faltnamnet
//   6. rena siffror           ororda            score, msgId, battleId, tidsstamplar, raknare
//   7. granskad allowlist     ororda
//   8. ALLT ANNAT             <okant ...>       forvalet
//
// Skifte 2 fore 6 ar hela poangen: byter man plats pa dem slapper varje anvandar-id igenom.
function maskera(varde, nyckel = '') {
  if (varde === null || varde === undefined) return varde;
  if (Array.isArray(varde)) return varde.map(v => maskera(v, nyckel));
  if (typeof varde === 'object') {
    // Buffer/typade arrayer: langden ar det enda intressanta, innehallet ar binart brus.
    if (ArrayBuffer.isView(varde)) return `<binart ${varde.length} byte>`;
    const ut = {};
    // NYCKLAR KAN OCKSA VARA PERSON-ID. TikTok skickar per-anvandarkartor som ar NYCKLADE pa
    // ankar-id: armies, battleComboV2, leagueInfoMap, leagueScoreInfoMap, userInfos,
    // guestUserInfos, battleResult, abInfos, anchorMatchSettings. Uppmatt over nio inspelningar:
    // 24 unika raa id lag som nycklar i 9 foraldrafalt. En maskering som bara ror varden lamnar
    // dem i klartext — och den forsta matningen av det har lackaget missade dem av precis det
    // skalet: den letade i varden.
    //
    // Nyckeln hashas till SAMMA form som ett person-id i ett varde, sa matchningen overlever:
    // offline-analysen jamfor armies-nyckeln mot `anchorId` i samma payload for att avgora vilken
    // sida som ar var, och bada blir nu id#<samma hash>. Utan det hade battle-analysen dott.
    //
    // ⚠️ HAR ar formregeln saker, till skillnad fran pa varden. En 15-22-siffrig NYCKEL ar alltid
    // ett id i TikToks protokoll — en poang ar aldrig en nyckel. Det ar just den tvetydigheten
    // som gjorde samma regel oanvandbar for varden.
    for (const [k, v] of Object.entries(varde)) {
      ut[ID_NYCKEL.test(k) ? `id#${hash(k)}` : k] = maskera(v, k);
    }
    return ut;
  }
  if (typeof varde !== 'string') return varde;      // tal, booleaner, bigint — ororda
  if (varde === '') return varde;                   // tom strang bar ingenting
  const k = String(nyckel).toLowerCase();
  if (PERSON_FALT.has(k)) return `id#${hash(varde)}`;
  if (NAMN_FALT.has(k)) return `namn#${hash(varde)}`;
  if (TEXT_FALT.has(k)) return `<text ${varde.length} tecken>`;
  // Hashas som ett NAMN med flit: star samma person bade i nickname och i stringValue ska de fa
  // samma hash, sa korshanvisningen genom filen finns kvar. Ett rent tal (nivan) slipper undan.
  if (INNEHALLSFALT.has(k)) return RENT_TAL.test(varde) ? varde : `namn#${hash(varde)}`;
  if (URL_FALT.has(k) || /^https?:\/\//i.test(varde)) {
    // Med schema: origin racker for att kanna igen CDN-varianten och pekar inte ut nagon.
    // Utan schema ar det en sokvag — och en avatarsokvag pekar ut en person lika sakert som ett
    // namn, sa den hashas i stallet for att behallas.
    if (/^https?:\/\//i.test(varde)) {
      try { return `${new URL(varde).origin}/…` } catch { return '<url>' }
    }
    return `id#${hash(varde)}`;
  }
  if (RENT_TAL.test(varde)) return varde;           // score, msgId, battleId, tidsstamplar
  if (SLAPP_IGENOM.has(k)) return varde;
  // FORVALET. Fritext (blanksteg eller icke-ASCII) ar dar namn bor — dar lamnas inte ens formen,
  // eftersom ett skelett av ett namn rojer emoji och interpunktion. Allt annat behaller sin form.
  if (/\s/.test(varde) || ICKE_ASCII.test(varde)) return `<okant text ${varde.length}t>`;
  return `<okant ${skelett(varde)}>`;
}

// Filnamnet bar tid och en hash av anvandarnamnet — aldrig namnet sjalvt. En inspelning som delas
// for felsokning ska inte rojja vems sandning det var.
function filnamn(anvandare, nu = new Date()) {
  const p = n => String(n).padStart(2, '0');
  const stampel = `${nu.getFullYear()}-${p(nu.getMonth() + 1)}-${p(nu.getDate())}T${p(nu.getHours())}${p(nu.getMinutes())}`;
  return `${stampel}-${hash(anvandare || 'okand')}.jsonl`;
}

// Ren funktion, sa taket gar att prova utan att skriva en enda byte.
function taketNatt(skrivetHittills, radLangd, maxByte) {
  return skrivetHittills + radLangd > maxByte;
}

const TYPER_DEFAULT = ['LINK_MIC_ARMIES', 'LINK_MIC_BATTLE', 'LINK_MIC_BATTLE_TASK',
  'LINK_MIC_BATTLE_PUNISH_FINISH'];

// 'alla' -> null (betyder "allt biblioteket har"), annars en Set av versaler.
function typerFranMiljo(varde) {
  const raa = String(varde || '').trim();
  if (!raa) return new Set(TYPER_DEFAULT);
  if (raa.toLowerCase() === 'alla') return null;
  return new Set(raa.split(',').map(s => s.trim().toUpperCase()).filter(Boolean));
}

// Versionen star i VARJE metarad. Fram till 2026-09-07 skrev inspelaren `maskad: true` i filer som
// anda lackte 416 person-id, 3 130 avatarsokvagar och 363 meningar med visningsnamn — och en fil
// fran fore fixen ser i filhuvudet exakt ut som en efter. Utan ett versionsnummer gar de tva inte
// att skilja at, och den enda sakra slutsatsen hade varit att misstro bada.
const MASKERING_VERSION = 2;

const LAS_MIG = [
  'Raa TikTok-payloads fran en VYRA-inspelning.',
  '',
  'MASKERINGEN UTGAR FRAN ATT MASKERA. Allt som inte ar ett rent tal, en granskad',
  'faltnamnspost eller en URL:s origin ersatts — anvandar-id och avatarsokvagar med',
  'hashar, manniskoskriven text med sin langd, och allt okant med sin FORM:',
  '',
  '   <okant a{3}-a{6}9/a{3}.a{4}>   nagot som ser ut som en sokvag',
  '   <okant text 14t>               fritext, dar formen ocksa halls tillbaka',
  '',
  'Tal, tidsstamplar, poang och faltnamn ar ororda — det ar dem inspelningen finns for.',
  '',
  'KONTROLLERA VERSIONEN INNAN DU DELAR. Varje fils metarad bar `maskeringVersion`.',
  'Ar den 1 eller saknas den ar filen inspelad FORE 2026-09-07, och da lacker den',
  'person-id, avatarsokvagar och visningsnamn trots att den sager `maskad: true`.',
  'Sadana filer ska raderas, inte delas.',
  '',
  'Mappen ar gitignorerad. Titta i filen innan du delar den vidare.',
  '',
  'Startas med SPELA-IN-TIKTOK.cmd (eller VYRA_INSPELNING=1). Se docs/live-verifiering.md.',
  '',
].join('\n');

// skapa() gor ingenting tungt forran den forsta raden skrivs: en avstangd inspelare rorer inte
// disken alls, och en pastagen katalog skapas inte "for sakerhets skull".
function skapa({ pa = false, katalog, anvandare = '', maxByte = 50 * 1024 * 1024,
                 typer, logg = console.log, nu = () => new Date(), fsModul = fs } = {}) {
  let aktiv = !!pa;
  let skrivet = 0;
  let strom = null;
  let vag = null;
  const valdaTyper = typer instanceof Set || typer === null ? typer : typerFranMiljo(typer);

  function av(skal) {
    if (!aktiv) return;
    aktiv = false;
    try { strom && strom.end() } catch (_) {}
    strom = null;
    logg(`[bridge][inspelning] av: ${skal}`);
  }

  function oppna() {
    if (strom) return true;
    try {
      fsModul.mkdirSync(katalog, { recursive: true });
      const lasMig = path.join(katalog, 'LAS-MIG.txt');
      if (!fsModul.existsSync(lasMig)) fsModul.writeFileSync(lasMig, LAS_MIG);
      vag = path.join(katalog, filnamn(anvandare, nu()));
      strom = fsModul.createWriteStream(vag, { flags: 'a' });
      // En strom som dor mitt i en sandning far inte kasta upp i bryggan.
      strom.on('error', err => av(`skrivfel (${err.message})`));
      logg(`[bridge][inspelning] pa -> ${vag}`);
      return true;
    } catch (err) {
      av(`kunde inte skapa ${katalog} (${err.message})`);
      return false;
    }
  }

  function skrivRad(post) {
    if (!aktiv) return false;
    if (!oppna()) return false;
    let rad;
    try { rad = JSON.stringify(post) + '\n' } catch (err) { return false }
    if (taketNatt(skrivet, Buffer.byteLength(rad), maxByte)) {
      av(`taket pa ${Math.round(maxByte / 1024 / 1024)} MB natt`);
      return false;
    }
    skrivet += Buffer.byteLength(rad);
    try { strom.write(rad) } catch (err) { av(`skrivfel (${err.message})`); return false }
    return true;
  }

  return {
    get aktiv() { return aktiv },
    get vag() { return vag },
    get skrivet() { return skrivet },
    // null = alla typer biblioteket har.
    typer: () => valdaTyper,
    vill: namn => aktiv && (valdaTyper === null || valdaTyper.has(String(namn).toUpperCase())),
    // Forsta raden i varje fil sager vad filen ar. En inspelning som lases om sex manader ska
    // inte behova gissa om den ar maskerad eller vilket bibliotek som producerade den.
    metarad: extra => skrivRad({ typ: '_meta', vid: nu().toISOString(), maskad: true,
      maskeringVersion: MASKERING_VERSION, ...extra }),
    // kalla skiljer de tva ursprungen at i filen: 'inspelad' ar en typ bryggan INTE skickar vidare
    // (den enda vagen att se LINK_MIC_ARMIES form), 'vidarebefordrad' ar en av de elva som redan
    // gar till molnet. Utan faltet gar det inte att rakna pa en inspelning utan att kanna
    // bryggans prenumerationslista utantill.
    raa: (namn, payload, kalla = 'inspelad') =>
      skrivRad({ typ: String(namn), kalla, vid: nu().toISOString(), nyttolast: maskera(payload) }),
    // Den normaliserade formen vid sidan av den raa: da gar rå -> normaliserat att diffa offline,
    // vilket ar exakt vad fyra-listor-problemet kraver.
    utgaende: (typ, falt) => skrivRad({ typ: '_utgaende', vid: nu().toISOString(), eventTyp: String(typ), falt: maskera(falt) }),
    av,
    // Stanger strommen och vantar tills den ar utskriven. Bryggan behover den inte — processen
    // dor med sandningen — men ett prov som laser filen direkt efter en skrivning far annars
    // ENOENT, eftersom createWriteStream ar asynkron hela vagen till forsta byten pa disk.
    stang: () => new Promise(klar => {
      aktiv = false;
      if (!strom) return klar();
      const s = strom; strom = null;
      try { s.end(klar) } catch (_) { klar() }
    }),
  };
}

module.exports = { skapa, maskera, hash, skelett, filnamn, taketNatt, typerFranMiljo, TYPER_DEFAULT,
  MASKERING_VERSION,
  LAS_MIG, PERSON_FALT, NAMN_FALT, TEXT_FALT, URL_FALT, SLAPP_IGENOM_SKAL };
