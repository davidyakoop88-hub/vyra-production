'use strict';
// ANALYSERAR EN SÄNDNINGSINSPELNING OCH SVARAR PÅ docs/live-verifiering.md.
//
// Inspelningen (inspelare.js) skriver JSON Lines: en rad per händelse, maskad på identiteter men
// med tal, tidsstämplar och fältnamn orörda. Fem av de sju punkterna går att svara på ur den
// filen. Punkt 5 (delar OBS browser source localStorage med webbläsaren?) och punkt 7 (spelar
// Glove Snipes H.264-videor i OBS?) kan den INTE — de kräver OBS, och verktyget säger det rakt ut
// i stället för att lämna dem tomma. En tom rad i en rapport läses som ett godkännande.
//
// REGELN GENOM HELA FILEN: hellre "inget underlag" än ett svar. Varje punkt bygger på ett
// antagande som kan vara fel, och ett verktyg som gissar flyttar bara gissningen ett steg.
//
// Kör:  node tiktok-bridge/analysera-inspelning.js <fil.jsonl>
const fs = require('fs');
// SAMMA FALTUTVINNARE SOM BRYGGAN. Faltvagarna dubblerades tidigare har (`nyttolast.rewardConfig`,
// `rewardDuration`) och matchade inte det TikTok faktiskt skickar — analysatorn svarade darfor
// "inget underlag" pa varje riktig inspelning. En kopia av en faltvag ar en kopia som glider isar.
const N = require('./normalizer.js');

const INGET = 'inget underlag';

function lasRader(fil) {
  const rader = [];
  for (const rad of fs.readFileSync(fil, 'utf8').split('\n')) {
    if (!rad.trim()) continue;
    try { rader.push(JSON.parse(rad)) } catch { /* en trasig rad ska inte fälla hela analysen */ }
  }
  return rader;
}

const arEvent = r => r && r.typ && !String(r.typ).startsWith('_');
const avTyp = (rader, typ) => rader.filter(r => arEvent(r) && r.typ === typ);
const nycklar = o => (o && typeof o === 'object' && !Array.isArray(o)) ? Object.keys(o) : [];

// INSPELAREN SKRIVER BRYGGANS UTGAENDE NAMN, INTE TIKTOKS.
//
// Varje rad kommer ur `inspelare.raa(type, data)` inuti sendEvent(), dar `type` ar det bryggan
// skickar VIDARE. Analysatorn letade efter TikToks handelsenamn och hittade darfor ingenting i
// en riktig inspelning — punkt 3 och 4 svarade "inget underlag" varje gang.
//
// Nyttolasten daremot ar RA: inspelare.raa sparar payloaden orord, sa faltnamnen ar TikToks.
//
// LINK_MIC_BATTLE_PUNISH_FINISH har INGEN vag till filen: dess enda lyssnare ar battle-sonden,
// som bara console.loggar, och typen star i inspelarens `redanLyssnade` sa inspelaren lagger
// ingen egen lyssnare. Den redovisas darfor som omojlig i stallet for att tigas ihjal.
const INSPELAT_SOM = {
  LINK_MIC_BATTLE: ['battle'],
  LINK_MIC_ARMIES: ['battle_mvp'],
  LINK_MIC_BATTLE_TASK: ['glove'],
  LINK_MIC_BATTLE_PUNISH_FINISH: [],
};
const avFamilj = (rader, tikTokNamn) => rader.filter(r => arEvent(r)
  && (r.typ === tikTokNamn || (INSPELAT_SOM[tikTokNamn] || []).includes(r.typ)));

// ---- 1. Tänder handsken vid rätt ögonblick? -----------------------------------------------------
//
// TVA KLOCKOR SOM INTE FAR BLANDAS. `rewardStartTimestamp` och `common.createTime` kommer bada ur
// TikToks klocka och ligger i SAMMA nyttolast. Inspelningens `vid` kommer ur maskinens.
//
// UPPMATT 2026-09-02 over samtliga 3798 handelser i en riktig sandning: maskinens klocka lag
// 222,8-231,5 SEKUNDER efter `common.createTime` — liten spridning, stor forskjutning, alltsa en
// klockforskjutning och inte leveransfordrojning. Den forra versionen rade `fonsterMs -
// Date.parse(r.vid)` och matte darfor drift; drivet ar tva storleksordningar storre an det som
// ska matas, sa svaret var brus med tva decimaler.
//
// REGELN: lokalt mot lokalt gar bra, TikTok mot TikTok gar bra, blandat gar aldrig.

// Inspelaren skriver typ `glove`, inte `LINK_MIC_BATTLE_TASK`: bryggan prenumererar redan pa den
// senare (se redanLyssnade i bridge.js) sa inspelaren lagger ingen egen lyssnare, och den enda
// raden kommer via sendEvent("glove", ...) — alltsa med det UTGAENDE namnet. Bada accepteras: om
// redanLyssnade nagon gang andras ska analysatorn inte tystna.
const BOOSTTYPER = new Set(['glove', 'LINK_MIC_BATTLE_TASK']);
// De typer bryggan SKJUTER UPP innan de skickas. For dem ar radens `vid` avfyrningstid, inte
// mottagningstid — se klockdriftsberakningen i punkt1.
const FORDROJDA = new Set(['glove']);

// Ett boostfonster oppnar tiotals sekunder till nagra minuter efter START — uppmatt 106, 111 och
// 151 s. Den gamla gransen lag pa 120 s och hade avfardat tva av tre UPPMATTA varden som trasig
// data. Taket foljer nu normalizer.js BOOST_TAK_MS: tio minuter skiljer "vanta lange" fran
// "vanta for alltid", och en battle ar ~5 minuter.
const TAK_SEKUNDER = 600;

function punkt1(rader) {
  const start = rader.filter(r => arEvent(r) && BOOSTTYPER.has(r.typ))
    .filter(r => Number(r.nyttolast?.taskMessageType) === 0);
  if (!start.length) {
    return { svar: INGET, skal: 'ingen boost-handelse (glove eller LINK_MIC_BATTLE_TASK) med taskMessageType=0' };
  }
  const matningar = start.map(r => {
    const f = N.battleTaskFields(r.nyttolast);
    // battleTaskFields satter saknade tal till 0 eller till sitt TAK (MAX_SAFE_INTEGER) — bada
    // maste bort innan de nar en subtraktion. Se boostFordrojningMs for samma grind.
    const fonster = Number(f.fonsterStart), skickat = Number(f.skickatAt);
    if (!Number.isFinite(fonster) || fonster <= 0 || fonster >= Number.MAX_SAFE_INTEGER) return null;
    if (!Number.isFinite(skickat) || skickat <= 0 || skickat >= Number.MAX_SAFE_INTEGER) return null;
    const fonsterMs = fonster < 1e12 ? fonster * 1000 : fonster;
    return {
      avstandSekunder: Math.round((fonsterMs - skickat) / 1000),
      // Vad bryggan FAKTISKT vantar. Samma funktion som bridge.js kallar, sa analysen kan inte
      // saga en sak medan bryggan gor en annan.
      bryggansFordrojningMs: N.boostFordrojningMs(f),

      multiplikator: f.multiplier || null,
      sekunder: f.fonsterSekunder || null,
    };
  }).filter(Boolean);
  if (!matningar.length) return { svar: INGET, skal: 'boost-handelserna saknade rewardStartTimestamp eller common.createTime' };

  // KLOCKDRIFTEN MATS ALDRIG PA EN GLOVE-RAD.
  //
  // `inspelare.raa()` ligger INUTI `sendEvent()`, och sedan boost-fordrojningen mergades skjuts
  // `sendEvent('glove', ...)` upp till dess fonstret oppnar. Glove-radens `vid` ar alltsa
  // AVFYRNINGSTIDEN, inte mottagningstiden, och `vid - createTime` blir dar drift PLUS
  // fordrojning — 223 + 151 = 374 s for den uppmatta sandningen i stallet for 223.
  //
  // Varje annan vidarebefordrad handelse skickas direkt, sa dar bar `vid` bara driften. Finns
  // ingen sadan rad gar drift och fordrojning inte att skilja at, och da sags det rakt ut
  // i stallet for att gissa — samma regel som resten av filen.
  const drifter = [];
  for (const r of rader) {
    if (!arEvent(r) || FORDROJDA.has(r.typ)) continue;
    const t = Number(r.nyttolast?.common?.createTime), lokalt = Date.parse(r.vid);
    if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(lokalt)) continue;
    drifter.push((lokalt - t) / 1000);
  }
  // MEDIAN, ALDRIG MEDEL. Uppmatt 2026-09-04: 2375 matningar med median 226,6 s och MEDEL
  // 1 504 875 s — tva ROOM_MESSAGE-rader bar createTime i sekundskala i stallet for millisekunder.
  // Tva rader av 2375 racker for att gora ett medelvarde meningslost, och kallmatningen sa
  // uttryckligen "median over 3798 handelser". Forsta versionen har raknade medel anda.
  drifter.sort((a, b) => a - b);
  const klockdriftSekunder = drifter.length
    ? Math.round(drifter[Math.floor(drifter.length / 2)] * 10) / 10
    : null;
  const driftSkal = drifter.length ? null
    : 'ingen ofordrojd handelse med common.createTime i inspelningen — glove-raden skrivs nar eventet fyrar, sa dess `vid` bar bade drift och fordrojning och gar inte att dela upp';
  const varsta = matningar.reduce((a, b) => Math.abs(b.avstandSekunder) > Math.abs(a.avstandSekunder) ? b : a);
  const d = varsta.avstandSekunder;
  const gemensamt = {
    avstandSekunder: d, matningar: matningar.length, klockdriftSekunder, driftSkal,
    bryggansFordrojningMs: varsta.bryggansFordrojningMs,
  };

  // RIMLIGHETSGRANSEN, nu i ratt klocka. Med `vid` inblandat var ett stort tal oftast bara
  // driften; nu ar ett stort POSITIVT tal ett verkligt forsprang. Kvar att fanga ar det som
  // ingen sandning kan producera: ett fonster som pastar sig oppna over tio minuter bort, eller
  // fore sitt eget meddelande.
  if (Math.abs(d) > TAK_SEKUNDER) {
    return { ...gemensamt, svar: 'orimligt avstånd',
      slutsats: `${d} s mellan START och rewardStartTimestamp ar inte en timing-avvikelse. `
        + 'Bada talen ska komma ur samma nyttolast — kontrollera enheten (sekunder mot '
        + 'millisekunder) i rewardStartTimestamp och att common.createTime finns kvar efter '
        + 'maskeringen.' };
  }
  return {
    ...gemensamt,
    svar: d > 1 ? 'START ligger före fönstret' : d < -1 ? 'START ligger EFTER fönstret' : 'START och fönstret sammanfaller',
    slutsats: d > 1
      ? (varsta.bryggansFordrojningMs > 0
        ? `START ligger ${d} s fore fonstret, och bryggan fordrojer glove-eventet `
          + `${varsta.bryggansFordrojningMs} ms — overlayn tands nar multiplikatorn borjar galla`
        : `overlayn tands ${d} s for tidigt — fordroj sandningen till rewardStartTimestamp `
          + '(boostFordrojningMs finns redan i normalizer.js)')
      : d < -1
        ? `overlayn tands ${Math.abs(d)} s for sent — multiplikatorn galler redan nar handsken syns`
        : 'ingen atgard: START och rewardStartTimestamp ligger inom en sekund',
  };
}

// ---- 2. Vilka värden bär battleStatus? ----------------------------------------------------------
// Klassificeringen i battle-mvp-session.js är tolerant med flit eftersom INGET riktigt värde är
// uppmätt. Här samlas de råa värdena i den ordning de sågs; det sista är kandidaten för "slut".
function punkt2(rader) {
  const sedda = [];
  for (const r of rader) {
    if (!arEvent(r)) continue;
    const v = r.nyttolast?.battleStatus;
    if (v === undefined || v === null) continue;
    if (!sedda.includes(v)) sedda.push(v);
  }
  if (!sedda.length) return { svar: INGET, skal: 'ingen händelse bar battleStatus' };
  return { svar: `${sedda.length} distinkta värden`, varden: sedda, sista: sedda[sedda.length - 1],
    slutsats: 'skriv in värdena i battle-mvp-session.js — det sista är kandidaten för avslutad match' };
}

// ---- 3. Vilken händelse bär matchens slut? ------------------------------------------------------
// Jämför sista raden i varje battle-familj mot raderna före: fält som TILLKOMMER eller FÖRSVINNER
// i den sista raden är signalen. Uppmätt facit sedan tidigare: LINK_MIC_ARMIES, triggerReason 2,
// battleSettings borta. Verktyget mäter om igen i stället för att lita på minnet.
const BATTLEFAMILJ = ['LINK_MIC_BATTLE', 'LINK_MIC_ARMIES', 'LINK_MIC_BATTLE_PUNISH_FINISH', 'LINK_MIC_BATTLE_TASK'];
// De familjer som inte har nagon vag till filen alls. Redovisas i svaret sa tystnaden inte
// lases som "matchen tog aldrig slut".
const OMOJLIGA = BATTLEFAMILJ.filter(t => !(INSPELAT_SOM[t] || []).length);
function punkt3(rader) {
  const kandidater = [];
  for (const typ of BATTLEFAMILJ) {
    const r = avFamilj(rader, typ);
    if (r.length < 2) continue;
    const sista = nycklar(r[r.length - 1].nyttolast);
    const fore = new Set(r.slice(0, -1).flatMap(x => nycklar(x.nyttolast)));
    const skiljer = sista.filter(k => !fore.has(k));
    const borta = [...fore].filter(k => !sista.includes(k));
    if (skiljer.length || borta.length) {
      kandidater.push({ handelse: typ, skiljer, borta, antal: r.length,
        sistaVid: r[r.length - 1].vid });
    }
  }
  if (!kandidater.length) {
    return { svar: INGET, spelasAldrigIn: OMOJLIGA,
      skal: 'ingen battle-familj hade två rader med olika fältuppsättning — matchen kanske aldrig '
        + 'tog slut i inspelningen' };
  }
  // Den med flest skiljande fält är den tydligaste signalen.
  const b = kandidater.reduce((a, c) => (c.skiljer.length + c.borta.length) > (a.skiljer.length + a.borta.length) ? c : a);
  return { svar: `${b.handelse} skiljer sig i sista raden`, ...b, allaKandidater: kandidater, spelasAldrigIn: OMOJLIGA };
}

// ---- 4. Vad innehåller LINK_MIC_ARMIES per sida? ------------------------------------------------
// Stämmer formen blir MVP exakt i stället för uträknad. Alla fältnamn samlas — även sådana bara
// vissa användare bär, för det är precis de som kan göra skillnaden.
// LAGEN UR DEN FORM TIKTOK FAKTISKT SKICKADE.
//
// UPPMATT over tre skarpa sandningar — formen VAXLAR, aven inom samma kvall:
//   2026-09-02 21:28   teamArmies fylld i 305 av 305
//   2026-09-04 21:58   teamArmies TOM   i 450 av 450
//   2026-09-04 23:29   teamArmies fylld i  27 av 27
// `armies` (objekt nycklat pa ankar-id) fanns i ALLA tre.
//
// FALLAN: `teamArmies: []` ar TRUTHY, sa den gamla ||-kedjan stannade dar och svarade
// "inget underlag" pa en inspelning som bar hela strukturen. Ratt svar, fel skal — och det
// gar inte att skilja fran "battlen saknades".
//
// Samma tva former som normalizer.js vartLagsGivare hanterar; se den for strukturen.
// BADA FORMERNA BESKRIVER SAMMA LAG. Falten samlas ur bada — det ar hela poangen med punkt 4 —
// men ANTALET far inte summeras: tva lag i teamArmies och samma tva i armies ar inte fyra lag.
// Forsta versionen av den har fixen svarade "4 lag" pa en match med tva, vilket ar exakt den
// sorts tal som glider forbi en lasare.
function lagenUr(nyttolast) {
  const t = Array.isArray(nyttolast && nyttolast.teamArmies) ? nyttolast.teamArmies : [];
  const a = nyttolast && nyttolast.armies;
  const arm = (a && typeof a === 'object' && !Array.isArray(a)) ? Object.values(a) : [];
  const b = Array.isArray(nyttolast && nyttolast.battleArmies) ? nyttolast.battleArmies : [];
  return { falt: [...t, ...arm, ...b], antal: Math.max(t.length, arm.length, b.length) };
}
function punkt4(rader) {
  const armeer = avFamilj(rader, 'LINK_MIC_ARMIES');
  if (!armeer.length) return { svar: INGET, skal: 'ingen LINK_MIC_ARMIES i inspelningen (den skrivs som battle_mvp, och bara nar mvpFields ger traff)' };
  let lag = 0; const faltLag = new Set(), faltAnv = new Set(); let anvandare = 0;
  for (const r of armeer) {
    // FALTNAMNEN UR PRODUKTIONSKOD. normalizer.js armeMvp() laser `teamArmies`, `teamUser` och
    // `userArmies.userArmies` — och den funktionen har gett en verklig MVP i drift.
    // `battleArmies`/`battleUsers` fanns aldrig i payloaden; de gamla namnen star kvar sist som
    // reserv ifall TikTok byter tillbaka, men de ar inte det som matas.
    const { falt: lista, antal } = lagenUr(r.nyttolast);
    if (!lista.length) continue;
    lag = Math.max(lag, antal);
    for (const l of lista) {
      nycklar(l).forEach(k => faltLag.add(k));
      // I armies-formen AR `userArmies` listan; i teamArmies-formen BAR den listan.
      const anv = (Array.isArray(l?.userArmies) ? l.userArmies : null)
        || l?.userArmies?.userArmies || l?.teamUser || l?.battleUsers || l?.users || [];
      if (Array.isArray(anv)) {
        anvandare = Math.max(anvandare, anv.length);
        anv.forEach(u => nycklar(u).forEach(k => faltAnv.add(k)));
      }
    }
  }
  if (!lag) return { svar: INGET, skal: 'varken teamArmies eller armies bar nagot lag' };
  return { svar: `${lag} lag`, lag, faltPerLag: [...faltLag], faltPerAnvandare: [...faltAnv],
    storstaLag: anvandare,
    slutsats: faltAnv.has('score') || faltAnv.has('diamondScore')
      ? 'TikTok skickar egen poängställning — MVP kan bli exakt i stället för uträknad'
      : 'ingen poäng per användare i formen; MVP måste fortsätta summera själv' };
}

// ---- 6. Vilket event bär Guardian-status? -------------------------------------------------------
// Jämför användare inom samma händelsetyp: fält (eller badge-typer) som bara VISSA bär är
// kandidater. Heuristiken pekar ut var man ska titta — den avgör inget själv.
const GUARDIANORD = /guardian|vakt|protector|shield/i;
function punkt6(rader) {
  const traffar = [];
  for (const r of rader) {
    if (!arEvent(r)) continue;
    const text = JSON.stringify(r.nyttolast || {});
    if (GUARDIANORD.test(text)) {
      const falt = [];
      const gar = (o, vag) => {
        if (!o || typeof o !== 'object') return;
        for (const [k, v] of Object.entries(o)) {
          const p = vag ? `${vag}.${k}` : k;
          if (GUARDIANORD.test(k) || (typeof v === 'string' && GUARDIANORD.test(v))) falt.push(`${p}=${JSON.stringify(v).slice(0, 60)}`);
          else if (typeof v === 'object') gar(v, p);
        }
      };
      gar(r.nyttolast, '');
      traffar.push({ handelse: r.typ, vid: r.vid, falt });
    }
  }
  if (!traffar.length) {
    return { svar: INGET, skal: 'inget fält eller värde nämnde guardian — kör inspelningen med VYRA_INSPELNING_TYPER=alla, annars spelas bara elva av 67 händelser in' };
  }
  const typer = [...new Set(traffar.map(t => t.handelse))];
  return { svar: `${traffar.length} rader nämner guardian`, handelse: typer[0], handelseTyper: typer,
    kandidater: [...new Set(traffar.flatMap(t => t.falt))].slice(0, 12),
    slutsats: 'skriv in fältet i GUARDIAN — FORBEREDD i bridge.js och lägg typen i ALLA fyra listorna (bryggan, TIKTOK_INGEST_TYPES, TIKTOK_ROOM_TYPES, event-bussens ALLOWED)' };
}


// ---- KONTROLL: TIKTOKS EGET GIVARANTAL MOT VART ------------------------------------------------
//
// #361 matte att GOAL_UPDATE bar `goal.contributors[]` med score per person och
// `goal.contributorsLength` — samma sorts tal som Heart Me Goal raknar fram sjalvt. Det talet kom
// dyrt: #289/#290 kravde sex granskningsrundor, ett kontrolltal som inte fick resa i samma payload
// som listan, och till slut SHA-256 over en sorterad multimangd av id for att bevisa MEDLEMSKAP och
// inte bara kardinalitet. TikTok skickar det redan, och bryggan kastar det.
//
// VARFOR KONTROLLEN LIGGER HAR OCH INTE I PRODUKTIONSKEDJAN.
//
// Att fora talet till servern hade kravt en ny typ i FYRA listor (bryggans TILL_MOLNET, index.js
// TIKTOK_INGEST_TYPES och TIKTOK_ROOM_TYPES, event-bussens ALLOWED) — en permanent vag genom hela
// systemet for en engangskontroll av att var rakning stammer. Inspelningen bar redan bada talen,
// och hashen ar STABIL genom filen, sa samma person gar att folja. Kontrollen hor alltsa hemma i
// analysatorn.
//
// ⚠️ TVA TAL SOM LIKNAR VARANDRA AR INTE SAMMA TAL. TikToks mal ar det mal STREAMERN satt upp i
// TikTok, och Heart Me Goal raknar VAR gava. Sammanfaller de ar TikToks siffra ett facit; gor de
// inte det ar en skillnad helt vantad. Verktyget redovisar darfor BADA talen och pastar aldrig att
// de ska vara lika — samma regel som resten av filen: hellre "inget underlag" an ett svar.
function heartMeKontroll(rader) {
  const mal = avTyp(rader, 'GOAL_UPDATE');
  const gavor = avTyp(rader, 'gift');

  // VART TAL, per gava: unika avsandare. Identiteten hamtas ur bryggans egen giftFields — en kopia
  // av faltvagen hade glidit isar, vilket ar precis vad som hande punkt 3 och 4 en gang.
  const perGava = new Map();
  for (const r of gavor) {
    const f = N.giftFields(r.nyttolast || {}, '');
    const vem = String(f.userId || f.username || '').trim();
    const namn = String(f.giftName || '(namnlos)').trim();
    if (!vem) continue;
    if (!perGava.has(namn)) perGava.set(namn, new Set());
    perGava.get(namn).add(vem);
  }
  const vartTal = [...perGava.entries()]
    .map(([namn, set]) => [namn, set.size])
    .sort((a, b) => b[1] - a[1]);

  if (!mal.length) {
    return {
      svar: INGET,
      skal: 'ingen GOAL_UPDATE i filen — kor inspelningen med VYRA_INSPELNING_TYPER=alla, och notera '
        + 'att typen bara kommer nar streamern faktiskt har ett mal igang i TikTok',
      'vart tal (unika avsandare per gava)': vartTal.slice(0, 8),
    };
  }

  const forlopp = [];
  const unika = new Set();
  let sistaLangd = null, delmal = null;
  for (const r of mal) {
    const g = (r.nyttolast && r.nyttolast.goal) || r.nyttolast || {};
    const langd = Number(g.contributorsLength);
    if (Number.isFinite(langd)) { if (langd !== sistaLangd) forlopp.push(langd); sistaLangd = langd }
    for (const c of Array.isArray(g.contributors) ? g.contributors : []) {
      const id = String((c && (c.userIdStr || c.userId)) || '').trim();
      if (id) unika.add(id);
    }
    if (Array.isArray(g.subGoals) && g.subGoals.length) {
      delmal = g.subGoals.map(s => `${s && s.progress}/${s && s.target}`);
    }
  }

  return {
    svar: sistaLangd === null
      ? 'GOAL_UPDATE finns men bar ingen contributorsLength'
      : `TikTok sager ${sistaLangd} unika givare pa sitt mal`,
    'GOAL_UPDATE-rader': mal.length,
    'contributorsLength, forlopp': forlopp,
    'unika id i contributors[]': unika.size,
    'delmal (progress/target)': delmal || INGET,
    'vart tal (unika avsandare per gava)': vartTal.slice(0, 8),
    jamforelse: 'TikToks mal och Heart Me Goal ar inte nodvandigtvis samma mal. Talen jamfors av en '
      + 'MANNISKA, inte av verktyget: sammanfaller malen ar TikToks siffra ett facit, annars ar en '
      + 'skillnad vantad.',
  };
}

// ── FRÅGOR FRÅN OMBYGGNADEN 2026-09-16 ─────────────────────────────────────────────────────────
//
// Allt nedanför byggdes mot TRE inspelningar från 2026-09-01/02. De svaren styr nu produktionskod,
// och de behöver bekräftas mot ny data — inte för att de är osäkra, utan för att ett mått från en
// enda kväll kan råka gälla just den kvällen.

// VAR KOMMER EMOTES IN, OCH VAD SKILJER EN STICKER FRÅN EN EMOTE?
//
// Uppmätt 2026-09-16: 48 av 48 emotes kom som `typ:'chat'` med emoten i `emotes[]` — NOLL som
// WebcastEmoteChatMessage med `emoteList`. Och `packageId` sade 'fansclub' i 150 av 156, medan
// `emoteScene` var 2 i 59 fall och 3 i 97 — där 3 inte ens finns i TikToks eget proto-enum.
// Klassificeringen bygger därför på packageId, inte på scenen.
function emoter(rader) {
  const barande = rader.filter(r => {
    const n = r && r.nyttolast;
    return n && (Array.isArray(n.emoteList) ? n.emoteList.length
      : Array.isArray(n.emotes) ? n.emotes.length : !!n.emote);
  });
  if (!barande.length) return { svar: INGET, kommentar: 'ingen emote i inspelningen' };

  const via = {}, scener = {}, paket = {};
  let stickers = 0, emotes = 0, utanId = 0, utanBild = 0;
  for (const r of barande) {
    const n = r.nyttolast;
    via[Array.isArray(n.emoteList) && n.emoteList.length ? 'emoteList (EMOTE-händelse)'
      : Array.isArray(n.emotes) && n.emotes.length ? 'emotes[] (chattrad)' : 'emote (enkel)']
      = (via[Array.isArray(n.emoteList) && n.emoteList.length ? 'emoteList (EMOTE-händelse)'
        : Array.isArray(n.emotes) && n.emotes.length ? 'emotes[] (chattrad)' : 'emote (enkel)'] || 0) + 1;
    const f = N.emoteFields(n);
    if (!f.emote) { utanId++; continue }
    if (!f.giftImage) utanBild++;
    scener[f.emoteScene] = (scener[f.emoteScene] || 0) + 1;
    paket[f.emotePaket || '(tomt)'] = (paket[f.emotePaket || '(tomt)'] || 0) + 1;
    if (String(f.emotePaket || '').toLowerCase() === 'fansclub') stickers++; else emotes++;
  }
  return {
    svar: `${barande.length} emote-bärande händelser · ${stickers} Fan Club-stickers, ${emotes} subscriber-emotes`,
    kom_in_via: via,
    emoteScene: scener,
    emotePaket: paket,
    utan_id: utanId,
    utan_bild: utanBild,
    kontroll: 'Kom något via emoteList? Då finns BÅDA vägarna och båda måste fortsätta fungera.',
  };
}

// GÅVOKATALOGEN: kommer namnen på streamerns språk, och bär de coin-värden?
//
// Vår statiska assets/gifts/gifts-manifest.js har ENGELSKA namn och inget värde alls. Facit visar
// svenska namn med "1 Coins" per rad. OBS: inspelaren MASKERAR gåvonamn (namn#hash), så den här
// punkten kan bara räkna och se på värdena — namnen måste avläsas i gåvoväljaren under sändningen.
function gavor(rader) {
  const g = rader.filter(r => r && r.typ === 'gift' && r.nyttolast);
  if (!g.length) return { svar: INGET, kommentar: 'ingen gåva i inspelningen' };
  const varden = {}; let utanVarde = 0, unika = new Set();
  for (const r of g) {
    // N.giftFields, INTE egna fältvägar. Första versionen letade i `giftDetails.diamondCount` och
    // rapporterade 70 av 70 gåvor UTAN värde — ett mätfel, inte ett produktfel. Filhuvudet varnar
    // för precis det: en kopia av en fältväg är en kopia som glider isär.
    const f = N.giftFields(r.nyttolast) || {};
    if (f.giftName) unika.add(String(f.giftName));
    const coins = Number(f.diamonds ?? f.coins ?? 0);
    if (!coins) utanVarde++; else varden[coins] = (varden[coins] || 0) + 1;
  }
  return {
    svar: `${g.length} gåvor · ${unika.size} unika (namnen är maskerade i inspelningen)`,
    coin_varden: Object.entries(varden).sort((a, b) => Number(b[0]) - Number(a[0])).slice(0, 10),
    utan_coin_varde: utanVarde,
    kontroll: 'Är utan_coin_varde > 0 bär inte alla gåvor sitt värde, och coin-trösklar missar dem.',
    las_av_live: 'Öppna gåvoväljaren i Actions & Events under sändningen och fotografera den: står namnen på svenska med coin-värden fungerar inlärningen.',
  };
}

// PROTOKOLLGLAPPET: vilka händelsetyper kom som VYRA inte gör något med?
//
// Anteckningarna säger 74 dokumenterade TikTok-händelser mot VYRA:s 12, och att glappet ska MÄTAS
// i en sändning i stället för att gissas. Den här punkten är den mätningen.
const VYRA_HANTERAR = new Set(['gift', 'giftcombo', 'like', 'likes', 'follow', 'share', 'member',
  'subscribe', 'join', 'roomuser', 'chat', 'comment', 'chatcommand', 'subscriberemote',
  'fanclubsticker', 'fansticker', 'shoppurchase', 'purchase', 'battle', 'glove', 'guardian',
  'fanlevelup', 'battle_mvp', 'viewer', 'livesession']);
function protokollglapp(rader) {
  const handelser = rader.filter(arEvent);
  if (!handelser.length) return { svar: INGET };
  const okanda = {}, kanda = {};
  for (const r of handelser) {
    const t = String(r.typ || '').toLowerCase();
    if (VYRA_HANTERAR.has(t)) kanda[t] = (kanda[t] || 0) + 1;
    else okanda[t] = (okanda[t] || 0) + 1;
  }
  const lista = Object.entries(okanda).sort((a, b) => b[1] - a[1]);
  return {
    svar: lista.length ? `${lista.length} typer som VYRA inte gör något med` : 'inget glapp i den här sändningen',
    ohanterade: lista.slice(0, 25),
    hanterade: Object.entries(kanda).sort((a, b) => b[1] - a[1]),
    kontroll: 'En ohanterad typ med många förekomster är en funktion konkurrenterna kan ha och vi inte.',
  };
}

// IDENTITET: syns moderatorer, prenumeranter, följare och fanklubbsnivåer i trafiken?
//
// Målgruppsfiltren i Events vilar på de här flaggorna. Är de tomma matchar filtren aldrig — tyst.
function identitet(rader) {
  const medUser = rader.filter(r => r && r.nyttolast && r.nyttolast.user);
  if (!medUser.length) return { svar: INGET };
  const r = { moderator: 0, prenumerant: 0, foljare: 0, fanklubbsniva: 0 };
  const nivaer = {};
  for (const rad of medUser) {
    const b = N.baseUser(rad.nyttolast);
    if (b.isModerator) r.moderator++;
    if (b.isSubscriber) r.prenumerant++;
    if (b.isFollower) r.foljare++;
    const niva = Number(b.fanClubLevel) || 0;
    if (niva > 0) { r.fanklubbsniva++; nivaer[niva] = (nivaer[niva] || 0) + 1 }
  }
  const tomma = Object.entries(r).filter(([, v]) => !v).map(([k]) => k);
  return {
    svar: `${medUser.length} händelser med användare · ${JSON.stringify(r)}`,
    fanklubbsnivaer: Object.entries(nivaer).sort((a, b) => Number(a[0]) - Number(b[0])).slice(0, 20),
    varning: tomma.length ? `ALLTID NOLL: ${tomma.join(', ')} — motsvarande målgruppsfilter i Events kan aldrig matcha` : '',
  };
}

function analysera(fil) {
  const rader = lasRader(fil);
  const handelser = rader.filter(arEvent);
  const perTyp = {};
  for (const r of handelser) perTyp[r.typ] = (perTyp[r.typ] || 0) + 1;
  return {
    fil,
    sammanfattning: {
      raderLasta: handelser.length,
      typer: Object.entries(perTyp).sort((a, b) => b[1] - a[1]),
      forsta: handelser[0]?.vid || null,
      sista: handelser[handelser.length - 1]?.vid || null,
      baraInspelade: handelser.filter(r => r.kalla === 'inspelad').length,
      vidarebefordrade: handelser.filter(r => r.kalla === 'vidarebefordrad').length,
    },
    heartMeKontroll: heartMeKontroll(rader),
    emoter: emoter(rader),
    gavor: gavor(rader),
    protokollglapp: protokollglapp(rader),
    identitet: identitet(rader),
    punkt1: punkt1(rader),
    punkt2: punkt2(rader),
    punkt3: punkt3(rader),
    punkt4: punkt4(rader),
    punkt5: { svar: 'kräver OBS', skal: 'localStorage-rymden går inte att se i en inspelning — läs av VyraPoints.get() i både Studions och OBS browser sources konsol' },
    punkt6: punkt6(rader),
    punkt7: { svar: 'kräver OBS', skal: 'H.264-stödet är webbläsarens, inte payloadens — trigga en Glove Snipe i OBS och sök efter DEMUXER i browser source-loggen' },
  };
}

function skrivUt(r) {
  const s = r.sammanfattning;
  console.log(`\nINSPELNING: ${r.fil}`);
  console.log(`${s.raderLasta} händelser (${s.vidarebefordrade} vidarebefordrade, ${s.baraInspelade} bara inspelade)`);
  if (s.forsta) console.log(`${s.forsta} → ${s.sista}`);
  console.log(`Vanligast: ${s.typer.slice(0, 6).map(([t, n]) => `${t} ${n}`).join(', ') || '(inga)'}\n`);
  const rubriker = {
    emoter: 'A. Var kommer emotes in, och vad skiljer sticker från emote?',
    gavor: 'B. Bär gåvorna coin-värden?',
    protokollglapp: 'C. Vilka händelsetyper gör VYRA inget med?',
    identitet: 'D. Syns moderator, prenumerant, följare och fanklubbsnivå?',
    punkt1: '1. Tänder handsken vid rätt ögonblick?',
    punkt2: '2. Vilka värden bär battleStatus?',
    punkt3: '3. Vilken händelse bär matchens slut?',
    punkt4: '4. Vad innehåller LINK_MIC_ARMIES per sida?',
    punkt5: '5. Delar OBS localStorage med webbläsaren?',
    punkt6: '6. Vilket event bär Guardian-status?',
    punkt7: '7. Spelar Glove Snipes videor i OBS?',
    heartMeKontroll: 'KONTROLL: TikToks eget givarantal mot vart (#361)',
  };
  for (const [nyckel, rubrik] of Object.entries(rubriker)) {
    const p = r[nyckel];
    console.log(`── ${rubrik}`);
    console.log(`   SVAR: ${p.svar}`);
    for (const [k, v] of Object.entries(p)) {
      if (k === 'svar') continue;
      console.log(`   ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
    console.log('');
  }
}

module.exports = { analysera, skrivUt };

if (require.main === module) {
  const fil = process.argv[2];
  if (!fil) {
    console.error('Ange en inspelning:\n  node tiktok-bridge/analysera-inspelning.js tiktok-bridge/inspelningar/<fil>.jsonl');
    process.exit(2);
  }
  if (!fs.existsSync(fil)) { console.error(`Filen finns inte: ${fil}`); process.exit(2) }
  skrivUt(analysera(fil));
}
