'use strict';
// BATTLE-POÄNGEN LÅG ALDRIG DÄR KODEN LETADE.
//
// `battleFields` läste `data.battleInfo.hostScore` fram till 2026-09-06. Payloaden har **inget**
// `battleInfo`, och `hostScore` med versalt S finns inte heller — så `number(undefined)` blev 0 och
// battle-widgeten visade **0–0 i varje match**. Ingen märkte det, för 0 ser ut som "matchen har
// inte börjat".
//
// UPPMÄTT i en skarp sändning 2026-09-06 (elva matcher, 28 LINK_MIC_BATTLE-payloads): poängen
// ligger i `armies[<användar-id>].hostscore` — GEMENT s.
//
// VILKEN SIDA SOM ÄR VÅR går inte att läsa ur payloaden. Tre kandidater prövades och föll:
//
//   armies[0]        var vår sida i bara 8 av 13 matcher
//   anchorIdStr      bytte betydelse mellan payloads — ibland användar-id, ibland "1"/"2"
//   anchorsInfo.tags var tomma i samtliga
//
// Därför krävs `mittAnkarId`, samma värde som `armeMvp` redan får (fetchRoomInfo().data.owner).
// Vårt id gick att hitta som armies-nyckel i **13 av 13** payloads.
//
// FIXTURENS FORM är kopierad ur den inspelningen; siffrorna och id:na är påhittade. Att `armies`
// förekommer både som objekt och som array av {key,value} är också uppmätt — `vartLagsGivare`
// hanterade redan båda för MVP:n, och `armelag` gör det nu för poängen.
const test = require('node:test'), assert = require('node:assert/strict');
const N = require('../normalizer');

const OSS = '7100000000000000001';
const DEM = '7100000000000000002';

// Objektformen: `armies` nycklat på användar-id.
const somObjekt = (oss, dem) => ({
  battleId: 'b-1',
  armies: { [OSS]: { hostscore: String(oss), anchorIdStr: '1' },
            [DEM]: { hostscore: String(dem), anchorIdStr: '2' } },
});

// Array-av-par-formen, som inspelningen visar.
const somArray = (oss, dem) => ({
  battleId: 'b-1',
  armies: [{ key: OSS, value: { hostscore: String(oss), anchorIdStr: '1' } },
           { key: DEM, value: { hostscore: String(dem), anchorIdStr: '2' } }],
});

for (const [namn, bygg] of [['objekt', somObjekt], ['array av {key,value}', somArray]]) {
  test(`poängen läses ur armies[].hostscore — ${namn}`, () => {
    const f = N.battleFields(bygg(454, 8268), OSS);
    assert.equal(f.scoreUs, 454, 'vår poäng lästes inte ur hostscore');
    assert.equal(f.scoreThem, 8268, 'motståndarens poäng lästes inte');
  });

  test(`sidorna kastas inte om — ${namn}`, () => {
    // Det farligaste felet: att visa motståndarens siffra som vår. Provet kör samma payload med
    // BÅDA id:na och kräver att svaren speglar varandra.
    const vi = N.battleFields(bygg(454, 8268), OSS);
    const de = N.battleFields(bygg(454, 8268), DEM);
    assert.equal(de.scoreUs, 8268, 'motståndarens egen vy gav fel sida');
    assert.equal(de.scoreThem, 454);
    assert.equal(vi.scoreUs, de.scoreThem, 'sidorna speglar inte varandra');
  });
}

test('armies[0] avgör INTE vilken sida som är vår', () => {
  // Uppmätt: vår sida låg först i bara 8 av 13 matcher. En implementation som tar armies[0] ser
  // rätt ut i en inspelning och fel i nästa.
  const bakvant = {
    battleId: 'b-1',
    armies: [{ key: DEM, value: { hostscore: '8268' } },
             { key: OSS, value: { hostscore: '454' } }],
  };
  const f = N.battleFields(bakvant, OSS);
  assert.equal(f.scoreUs, 454, 'ordningen i armies styrde valet — då är det en slump att det stämmer');
  assert.equal(f.scoreThem, 8268);
});

test('utan ankar-id gissar den INTE — poängen blir 0 som förut', () => {
  // fetchRoomInfo kan misslyckas. Da ar tystnad ratt svar: hellre en nolla an motstandarens poang
  // i var egen overlay. Samma regel som armeMvp, som returnerar null utan ankar-id.
  //
  // SKYDDET AR DUBBELT med flit: `lagen` blir tom utan ankar-id, OCH `vart` kraver det. En
  // mutation som tar bort bara det ena ar inert — uppmatt med mutationsriggen. Den som tar bort
  // ett av leden i tron att det andra racker har alltsa ingen vakt som sager emot; darfor star
  // det har.
  const f = N.battleFields(somObjekt(454, 8268), '');
  assert.equal(f.scoreUs, 0);
  assert.equal(f.scoreThem, 0);
});

test('ett okänt ankar-id ger inte motståndarens siffror', () => {
  const f = N.battleFields(somObjekt(454, 8268), '7100000000000000999');
  assert.equal(f.scoreUs, 0, 'ett id som inte finns i matchen plockade ändå en sida');
  assert.equal(f.scoreThem, 0);
});

test('de gamla formerna fungerar fortfarande (desktop och äldre payloads)', () => {
  // battleInfo.hostScore ar reserven. Den ger 0 pa molnets payloadform, men andra kallor kan
  // fortfarande skicka den — och en fix far inte ta bort en väg som fungerar.
  const f = N.battleFields({ battleInfo: { hostScore: 1200, guestScore: 900, multiplier: 3 } }, OSS);
  assert.equal(f.scoreUs, 1200);
  assert.equal(f.scoreThem, 900);
  assert.equal(f.multiplier, 3);
});

test('armelag normaliserar båda formerna till samma lista', () => {
  const a = N.armelag(somObjekt(1, 2)).map(l => l.id).sort();
  const b = N.armelag(somArray(1, 2)).map(l => l.id).sort();
  assert.deepEqual(a, b, 'de tva formerna gav olika resultat');
  assert.deepEqual(a, [OSS, DEM].sort());
  assert.deepEqual(N.armelag({}), [], 'saknad armies ska ge tom lista, inte kasta');
  assert.deepEqual(N.armelag({ armies: null }), []);
});

// ---- bryggan MÅSTE skicka med ankar-id ---------------------------------------------------------
// Utan det blir hela fixen ovan verkningslös: battleFields faller tillbaka på reserverna, de ger 0
// på molnets payloadform, och widgeten står på 0–0 igen. Ändringen i bridge.js är ETT ORD, och
// ingenting fällde en mutation som tog bort det — uppmätt med mutationsriggen 2026-09-06.
//
// Samma slags vakt som finns för MVP:n, och av samma skäl: `mittAnkarId` är den enda kopplingen
// mellan en payload som beskriver båda sidorna och frågan "vilken av dem är vår?".
const fs = require('fs'), path = require('path');
test('bridge.js skickar mittAnkarId till battleFields', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');
  assert.match(src, /N\.battleFields\(\s*data\s*,\s*mittAnkarId\s*\)/,
    'bridge.js anropar battleFields UTAN ankar-id — da kan poangen inte hittas och widgeten ' +
    'visar 0-0 igen. Se battleFields-kommentaren i normalizer.js.');
});

test('och till mvpFields, som redan krävde det', () => {
  // Kontrollmätning: fanns vakten för MVP:n redan, eller saknades båda? Den här raden gör svaret
  // synligt i stället för antaget.
  const src = fs.readFileSync(path.join(__dirname, '..', 'bridge.js'), 'utf8');
  assert.match(src, /N\.mvpFields\(\s*data\s*,\s*mittAnkarId\s*\)/,
    'mvpFields anropas utan ankar-id — MVP:n blir tyst');
});
