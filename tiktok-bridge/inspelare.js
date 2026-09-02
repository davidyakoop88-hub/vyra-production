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
//   3. VARDEN MASKERAS, NYCKLAR OCH TYPER BEHALLS. Se maskera() nedan.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Falten som bar identitet i en raa TikTok-payload, lasta ur normalizer.js fältuppslag.
// userId/secUid/uniqueId/displayId hashas, nickname blir ett stabilt smeknamn, avatar-URL:er
// behaller bara sin host och comment ersatts av sin langd.
const ID_FALT = new Set(['userid', 'secuid', 'uniqueid', 'displayid', 'id']);
const NAMN_FALT = new Set(['nickname', 'name', 'username', 'displayname']);
const URL_FALT = new Set(['avatar', 'avatarthumb', 'avatarmedium', 'avatarlarge', 'avatarlarger',
  'profilepicture', 'profilepictureurl', 'avatarurl']);
const TEXT_FALT = new Set(['comment', 'content', 'text', 'message']);
// stringValue ar TVETYDIGT och behandlas darfor efter INNEHALL, inte efter namn. Samma falt bar
// bade ett visningsnamn och ett tal, pa samma niva i payloaden:
//
//   guardian_shield_card_used  content.pieces[0].stringValue = "• PiiikaboOom ♛"   <- PII
//   fans_upgrade               content.pieces[0].stringValue = "32"                <- nivan
//
// Att maskera hela faltet hade forstort exakt den matning som gav oss fans_upgrade; att lamna det
// orort lamnar namn i klartext i en fil som ar tankt att kunna delas. Regeln ar darfor smal: ett
// RENT tal slipper undan, allt annat hashas som ett namn. Tal, antal och raknare overlever;
// namn, texter och emoji-dekorerade smeknamn gor det inte.
const RENT_TAL = /^\d+$/;
const INNEHALLSFALT = new Set(['stringvalue']);

// Kort och stabil: samma tittare ger samma hash inom OCH mellan filer, sa en armé-lista gar att
// aggregera i efterhand. Det ar hela poangen med LINK_MIC_ARMIES — utan stabiliteten blir varje
// rad en ny anonym person och listan sager ingenting.
function hash(varde) {
  return crypto.createHash('sha256').update(String(varde)).digest('hex').slice(0, 8);
}

// MASKERAR VARDEN, ALDRIG FORMER.
//
// Inspelarens hela syfte ar att lara sig faltnamn och former. En maskering som slog sonder
// strukturen hade gjort filen vardelos, sa: nycklar behalls, typer behalls, och TAL ROSS INTE —
// det ar dar battle-datan bor (score, diamondScore, hostscore, rewardMultiple, timestamps).
function maskera(varde, nyckel = '') {
  if (varde === null || varde === undefined) return varde;
  if (Array.isArray(varde)) return varde.map(v => maskera(v, nyckel));
  if (typeof varde === 'object') {
    // Buffer/typade arrayer: langden ar det enda intressanta, innehallet ar binart brus.
    if (ArrayBuffer.isView(varde)) return `<binart ${varde.length} byte>`;
    const ut = {};
    for (const [k, v] of Object.entries(varde)) ut[k] = maskera(v, k);
    return ut;
  }
  if (typeof varde !== 'string') return varde;      // tal, booleaner, bigint — ororda
  const k = String(nyckel).toLowerCase();
  if (ID_FALT.has(k)) return `id#${hash(varde)}`;
  if (NAMN_FALT.has(k)) return `namn#${hash(varde)}`;
  if (TEXT_FALT.has(k)) return `<text ${varde.length} tecken>`;
  // Hashas som ett NAMN med flit: star samma person bade i nickname och i stringValue ska de fa
  // samma hash, sa korshanvisningen genom filen finns kvar.
  if (INNEHALLSFALT.has(k) && !RENT_TAL.test(varde)) return `namn#${hash(varde)}`;
  if (URL_FALT.has(k) || /^https?:\/\//i.test(varde)) {
    try { return `${new URL(varde).origin}/…` } catch { return '<url>' }
  }
  return varde;
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

const LAS_MIG = [
  'Raa TikTok-payloads fran en VYRA-inspelning.',
  '',
  'Filerna innehaller MASKERAD data: anvandar-id, smeknamn, avatar-URL:er och kommentarer ar',
  'ersatta med hashar och platshallare. Tal, tidsstamplar och faltnamn ar ororda — det ar dem',
  'inspelningen finns for.',
  '',
  'Mappen ar gitignorerad. Dela inte filerna vidare utan att titta i dem forst.',
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
    metarad: extra => skrivRad({ typ: '_meta', vid: nu().toISOString(), maskad: true, ...extra }),
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

module.exports = { skapa, maskera, hash, filnamn, taketNatt, typerFranMiljo, TYPER_DEFAULT, LAS_MIG };
