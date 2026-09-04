#!/usr/bin/env node
'use strict';
// MÄTER EN SPARAD GÅVOLISTA MOT SEEDNINGSKONTRAKTET — utan att röra något.
//
// VARFÖR DEN BEHÖVS. Seedningen kräver att listan stämmer med `server/seedningskontrakt.js` på
// fyra tal: poster, unika id, poster utan id, och en SHA-256 över den sorterade multimängden av
// id. Stämmer något av dem inte svarar rutten 422 och skriver ingenting.
//
// Men listan är ett LEVANDE TikTok-svar. Uppmätt: den drev **8 poster på ett dygn** (PR #294 mätte
// om SE från 783/779 till 775/771 dagen efter den första mätningen). Kontraktet uppdateras bara via
// granskad PR — aldrig via ett anrop, med flit. Alltså finns alltid ett glapp mellan mätning och
// seedning, och i det glappet kan listan ha glidit.
//
// Utan det här verktyget upptäcks glappet först som ett 422 från produktion, efter att någon har
// hämtat listan ur en inloggad flik och postat den. Med det upptäcks det lokalt, på en sekund, och
// verktyget skriver ut exakt det kontraktsblock som ska in i PR:en.
//
// DEN RÖR VARKEN NÄT ELLER DATABAS. Den läser en fil och räknar.
//
// Kör:
//   node scripts/gavokatalog-matning.js <fil.json> [region]
//
// Filen får vara TikToks råa svar (`{data:{gifts:[…]}}` eller `{gifts:[…]}`) eller en naken array.
const fs = require('fs');
const path = require('path');

const Gavokatalog = require('../server/gavokatalog.js');
const Kontrakt = require('../server/seedningskontrakt.js');

// SAMMA NORMALISERING SOM SKRIVVÄGEN, genom att kalla serverns egen funktion. En kopia här hade
// kunnat glida isär från den som faktiskt jämförs — och då hade verktyget lugnat i onödan.
const { digestAvPoster } = Gavokatalog;

function lasGavor(fil) {
  let rot;
  try { rot = JSON.parse(fs.readFileSync(fil, 'utf8')) }
  catch (e) { return { fel: `kunde inte läsa ${fil}: ${e.message}` } }
  const kandidater = [
    ['roten som array', Array.isArray(rot) ? rot : null],
    ['gifts', rot && rot.gifts],
    ['data.gifts', rot && rot.data && rot.data.gifts],
    ['data.giftList', rot && rot.data && rot.data.giftList],
  ];
  for (const [var_, v] of kandidater) if (Array.isArray(v)) return { gavor: v, hittad: var_ };
  return { fel: 'hittade ingen gåvolista — väntade en array, eller `gifts` / `data.gifts` i objektet' };
}

// EXAKT SAMMA RÄKNING SOM noteraKatalog() i server/gavokatalog.js. Skiljer den sig är verktyget
// värdelöst: det skulle godkänna en lista rutten avvisar, eller tvärtom.
function rakna(gavor) {
  const unika = new Set();
  let utanId = 0;
  for (const p of gavor) {
    const id = p && (p.id ?? p.gift_id);
    const s = id === null || id === undefined ? '' : String(id).slice(0, 160).trim();
    if (s) unika.add(s); else utanId += 1;
  }
  return { poster: gavor.length, unikaId: unika.size, utanId };
}

function main() {
  const [fil, regionArg] = process.argv.slice(2);
  if (!fil) {
    console.error('Ange en fil: node scripts/gavokatalog-matning.js <fil.json> [region]');
    console.error('Kända regioner i kontraktet: ' + Kontrakt.regioner().join(', '));
    process.exit(2);
  }
  const region = (regionArg || 'SE').toUpperCase();

  const las = lasGavor(path.resolve(fil));
  if (las.fel) { console.error('FEL: ' + las.fel); process.exit(2) }
  const { gavor, hittad } = las;

  const matt = rakna(gavor);
  const digest = digestAvPoster(gavor);
  const k = Kontrakt.forRegion(region);

  console.log(`Fil:      ${fil}  (gåvolistan låg i: ${hittad})`);
  console.log(`Region:   ${region}`);
  console.log('');
  console.log('UPPMÄTT NU');
  console.log(`  poster    ${matt.poster}`);
  console.log(`  unikaId   ${matt.unikaId}`);
  console.log(`  utanId    ${matt.utanId}`);
  console.log(`  digest    ${digest}`);

  if (!k) {
    console.log('');
    console.log(`Kontraktet har ingen post för ${region}. Kända: ${Kontrakt.regioner().join(', ') || '(inga)'}`);
    console.log('');
    skrivBlock(region, matt, digest);
    process.exit(1);
  }

  console.log('');
  console.log(`KONTRAKTET  (mätt ${k.matt_at})`);
  console.log(`  poster    ${k.poster}`);
  console.log(`  unikaId   ${k.unikaId}`);
  console.log(`  utanId    ${k.utanId}`);
  console.log(`  digest    ${k.digest}`);

  const avvikelser = [];
  for (const f of ['poster', 'unikaId', 'utanId']) {
    if (matt[f] !== k[f]) avvikelser.push(`${f}: ${matt[f]} mot kontraktets ${k[f]}`);
  }
  if (digest !== k.digest) avvikelser.push('digest: listan innehåller inte samma id som kontraktet mätte');

  console.log('');
  if (!avvikelser.length) {
    console.log('STÄMMER. Seedningen skulle gå igenom med den här listan.');
    console.log('Hämta den på nytt precis före anropet — listan är levande och driver.');
    process.exit(0);
  }

  console.log('AVVIKER — rutten skulle svara 422 och skriva ingenting:');
  for (const a of avvikelser) console.log('  · ' + a);
  console.log('');
  // Talen kan stämma medan innehållet glidit. Att säga det rakt ut hindrar slutsatsen
  // "antalen stämmer, alltså är listan rätt".
  if (!avvikelser.some(a => a.startsWith('digest')) ) {
    console.log('Antalen skiljer sig — mät om kontraktet.');
  } else if (avvikelser.length === 1) {
    console.log('ANTALEN STÄMMER MEN INNEHÅLLET HAR GLIDIT: lika många poster, andra id.');
    console.log('Det är precis det digesten finns för att fånga.');
  }
  console.log('');
  skrivBlock(region, matt, digest);
  process.exit(1);
}

function skrivBlock(region, matt, digest) {
  const idag = new Date().toISOString().slice(0, 10);
  console.log('Ska listan gälla — klistra in i server/seedningskontrakt.js via GRANSKAD PR:');
  console.log('');
  console.log(`  ${region}: {`);
  console.log(`    poster: ${matt.poster},`);
  console.log(`    unikaId: ${matt.unikaId},`);
  console.log(`    utanId: ${matt.utanId},`);
  console.log(`    digest: '${digest}',`);
  console.log(`    matt_at: '${idag}',`);
  console.log(`    kalla: 'webcast/gift/list/?aid=1988 fran inloggad ${region}-session, UTAN room_id'`);
  console.log('  },');
  console.log('');
  console.log('Kontraktet ändras ALDRIG via ett anrop — det är hela poängen med det.');
}

if (require.main === module) main();
module.exports = { lasGavor, rakna };
