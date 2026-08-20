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

// ---- 1. Tänder handsken vid rätt ögonblick? -----------------------------------------------------
// Bryggan skickar boosten på taskMessageType=START. Samma payload bär rewardStartTimestamp — när
// fönstret FAKTISKT öppnar. Ligger START före är overlayn tidig, och då ska sändningen fördröjas
// till tidsstämpeln i stället.
function punkt1(rader) {
  const start = avTyp(rader, 'LINK_MIC_BATTLE_TASK')
    .filter(r => Number(r.nyttolast?.taskMessageType) === 0 && r.nyttolast?.rewardConfig);
  if (!start.length) return { svar: INGET, skal: 'ingen LINK_MIC_BATTLE_TASK med taskMessageType=0 och rewardConfig' };
  const matningar = start.map(r => {
    const k = r.nyttolast.rewardConfig;
    const fonster = Number(k.rewardStartTimestamp ?? k.rewardStartTime);
    if (!Number.isFinite(fonster) || !fonster) return null;
    // Tidsstämpeln kommer i sekunder; raden i ISO. Avståndet är det enda som mäts.
    const fonsterMs = fonster < 1e12 ? fonster * 1000 : fonster;
    return { avstandSekunder: Math.round((fonsterMs - Date.parse(r.vid)) / 1000),
      multiplikator: Number(k.rewardMultiple) || null, sekunder: Number(k.rewardDuration) || null };
  }).filter(Boolean);
  if (!matningar.length) return { svar: INGET, skal: 'rewardConfig saknade rewardStartTimestamp' };
  const varsta = matningar.reduce((a, b) => Math.abs(b.avstandSekunder) > Math.abs(a.avstandSekunder) ? b : a);
  const d = varsta.avstandSekunder;
  // RIMLIGHETSGRÄNSEN. Ett boostfönster varar tiotals sekunder; ett avstånd på minuter eller
  // timmar är inte en timing-fråga utan trasig data — sekunder mot millisekunder, eller lokal
  // tid mot UTC. Uppmätt under bygget: ett provdata med fel tidszon gav -7196 s, och verktyget
  // svarade "overlayn tänds 7196 s för sent". Ett råd på ett sådant tal är värre än tystnad.
  if (Math.abs(d) > 120) {
    return { svar: 'orimligt avstånd', avstandSekunder: d, matningar: matningar.length,
      slutsats: `${d} s mellan START och rewardStartTimestamp är inte en timing-avvikelse. `
        + 'Kontrollera enheten (sekunder mot millisekunder) och tidszonen (lokal tid mot UTC) '
        + 'i både inspelningens `vid` och rewardConfig innan siffran tolkas.' };
  }
  return {
    svar: d > 1 ? 'START ligger före fönstret' : d < -1 ? 'START ligger EFTER fönstret' : 'START och fönstret sammanfaller',
    avstandSekunder: d,
    matningar: matningar.length,
    slutsats: d > 1
      ? `overlayn tänds ${d} s för tidigt — fördröj sändningen till rewardStartTimestamp (fonsterStart finns redan uträknat i normalizer.js)`
      : d < -1
        ? `overlayn tänds ${Math.abs(d)} s för sent — multiplikatorn gäller redan när handsken syns`
        : 'ingen åtgärd: START och rewardStartTimestamp ligger inom en sekund',
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
function punkt3(rader) {
  const kandidater = [];
  for (const typ of BATTLEFAMILJ) {
    const r = avTyp(rader, typ);
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
    return { svar: INGET, skal: 'ingen battle-familj hade två rader med olika fältuppsättning — matchen kanske aldrig tog slut i inspelningen' };
  }
  // Den med flest skiljande fält är den tydligaste signalen.
  const b = kandidater.reduce((a, c) => (c.skiljer.length + c.borta.length) > (a.skiljer.length + a.borta.length) ? c : a);
  return { svar: `${b.handelse} skiljer sig i sista raden`, ...b, allaKandidater: kandidater };
}

// ---- 4. Vad innehåller LINK_MIC_ARMIES per sida? ------------------------------------------------
// Stämmer formen blir MVP exakt i stället för uträknad. Alla fältnamn samlas — även sådana bara
// vissa användare bär, för det är precis de som kan göra skillnaden.
function punkt4(rader) {
  const armeer = avTyp(rader, 'LINK_MIC_ARMIES');
  if (!armeer.length) return { svar: INGET, skal: 'ingen LINK_MIC_ARMIES i inspelningen' };
  let lag = 0; const faltLag = new Set(), faltAnv = new Set(); let anvandare = 0;
  for (const r of armeer) {
    const lista = r.nyttolast?.battleArmies || r.nyttolast?.armies;
    if (!Array.isArray(lista)) continue;
    lag = Math.max(lag, lista.length);
    for (const l of lista) {
      nycklar(l).forEach(k => faltLag.add(k));
      const anv = l.battleUsers || l.users || [];
      if (Array.isArray(anv)) {
        anvandare = Math.max(anvandare, anv.length);
        anv.forEach(u => nycklar(u).forEach(k => faltAnv.add(k)));
      }
    }
  }
  if (!lag) return { svar: INGET, skal: 'LINK_MIC_ARMIES saknade battleArmies-listan' };
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
