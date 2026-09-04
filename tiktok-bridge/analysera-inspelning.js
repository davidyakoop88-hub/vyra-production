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
    const lokalt = Date.parse(r.vid);
    return {
      avstandSekunder: Math.round((fonsterMs - skickat) / 1000),
      // Vad bryggan FAKTISKT vantar. Samma funktion som bridge.js kallar, sa analysen kan inte
      // saga en sak medan bryggan gor en annan.
      bryggansFordrojningMs: N.boostFordrojningMs(f),
      // Driften mats for sig — den ar inte brus, det ar den som gjorde det gamla svaret fel.
      driftSekunder: Number.isFinite(lokalt) ? (lokalt - skickat) / 1000 : null,
      multiplikator: f.multiplier || null,
      sekunder: f.fonsterSekunder || null,
    };
  }).filter(Boolean);
  if (!matningar.length) return { svar: INGET, skal: 'boost-handelserna saknade rewardStartTimestamp eller common.createTime' };

  const drifter = matningar.map(m => m.driftSekunder).filter(d => d !== null);
  const klockdriftSekunder = drifter.length
    ? Math.round(drifter.reduce((a, b) => a + b, 0) / drifter.length * 10) / 10
    : null;
  const varsta = matningar.reduce((a, b) => Math.abs(b.avstandSekunder) > Math.abs(a.avstandSekunder) ? b : a);
  const d = varsta.avstandSekunder;
  const gemensamt = {
    avstandSekunder: d, matningar: matningar.length, klockdriftSekunder,
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
function punkt4(rader) {
  const armeer = avFamilj(rader, 'LINK_MIC_ARMIES');
  if (!armeer.length) return { svar: INGET, skal: 'ingen LINK_MIC_ARMIES i inspelningen (den skrivs som battle_mvp, och bara nar mvpFields ger traff)' };
  let lag = 0; const faltLag = new Set(), faltAnv = new Set(); let anvandare = 0;
  for (const r of armeer) {
    // FALTNAMNEN UR PRODUKTIONSKOD. normalizer.js armeMvp() laser `teamArmies`, `teamUser` och
    // `userArmies.userArmies` — och den funktionen har gett en verklig MVP i drift.
    // `battleArmies`/`battleUsers` fanns aldrig i payloaden; de gamla namnen star kvar sist som
    // reserv ifall TikTok byter tillbaka, men de ar inte det som matas.
    const lista = r.nyttolast?.teamArmies || r.nyttolast?.battleArmies || r.nyttolast?.armies;
    if (!Array.isArray(lista)) continue;
    lag = Math.max(lag, lista.length);
    for (const l of lista) {
      nycklar(l).forEach(k => faltLag.add(k));
      const anv = l.userArmies?.userArmies || l.teamUser || l.battleUsers || l.users || [];
      if (Array.isArray(anv)) {
        anvandare = Math.max(anvandare, anv.length);
        anv.forEach(u => nycklar(u).forEach(k => faltAnv.add(k)));
      }
    }
  }
  if (!lag) return { svar: INGET, skal: 'LINK_MIC_ARMIES (inspelad som battle_mvp) saknade teamArmies-listan' };
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
    punkt1: '1. Tänder handsken vid rätt ögonblick?',
    punkt2: '2. Vilka värden bär battleStatus?',
    punkt3: '3. Vilken händelse bär matchens slut?',
    punkt4: '4. Vad innehåller LINK_MIC_ARMIES per sida?',
    punkt5: '5. Delar OBS localStorage med webbläsaren?',
    punkt6: '6. Vilket event bär Guardian-status?',
    punkt7: '7. Spelar Glove Snipes videor i OBS?',
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
