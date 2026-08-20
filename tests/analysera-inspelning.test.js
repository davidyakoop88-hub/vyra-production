'use strict';
// ANALYSATORN FÖR EN SÄNDNINGSINSPELNING — skriven RÖD FÖRST.
//
// docs/live-verifiering.md listar sju punkter där koden gissar och felet bara syns i sändning.
// Fem av dem går att svara på ur en inspelning (tiktok-bridge/inspelare.js skriver JSON Lines);
// punkt 5 (delar OBS localStorage?) och 7 (spelar Glove Snipes H.264 i OBS?) kräver OBS och kan
// ingen fil svara på.
//
// Utan analysator måste någon läsa en fil på tiotusentals rader för hand, punkt för punkt, efter
// varje sändning. Då blir avläsningen det som inte blir gjort. Analysatorn gör kvällens sändning
// till ett kommando: spela in, kör, läs svaren.
//
// Proven matar syntetiska rader som speglar det inspelare.js faktiskt skriver — `kalla` skiljer
// vidarebefordrat från enbart inspelat, och `_utgaende` bär det bryggan skickade. Varje prov
// kräver ett SVAR, inte bara att koden inte kraschar: ett verktyg som svarar "vet ej" på allt
// hade passerat ett svagare prov.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');

const { analysera } = require('../tiktok-bridge/analysera-inspelning.js');

function skrivFil(rader) {
  const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'vyra-insp-'));
  const fil = path.join(kat, 'prov.jsonl');
  fs.writeFileSync(fil, rader.map(r => JSON.stringify(r)).join('\n') + '\n');
  return fil;
}
const vid = s => new Date(Date.UTC(2026, 7, 20, 20, 0, s)).toISOString();

test('punkt 1: mäter avståndet mellan START och rewardStartTimestamp', () => {
  // START kommer 4 s före fönstret faktiskt öppnar. Koden tänder på START — alltså för tidigt.
  const start = Date.UTC(2026, 7, 20, 20, 0, 30);
  const fil = skrivFil([
    { typ: 'LINK_MIC_BATTLE_TASK', kalla: 'vidarebefordrad', vid: vid(26),
      nyttolast: { taskMessageType: 0, battleId: '7123',
        rewardConfig: { rewardStartTimestamp: Math.floor(start / 1000), rewardMultiple: 3, rewardDuration: 30 } } },
  ]);
  const r = analysera(fil);
  assert.equal(r.punkt1.svar, 'START ligger före fönstret', `fick: ${r.punkt1.svar}`);
  assert.equal(r.punkt1.avstandSekunder, 4,
    `avståndet ska mätas i sekunder, fick ${r.punkt1.avstandSekunder}`);
  assert.match(r.punkt1.slutsats, /fördröj|rewardStartTimestamp/i,
    'slutsatsen ska säga vad som bör göras');
});

test('punkt 2: samlar varje rått battleStatus-värde i den ordning det sågs', () => {
  const fil = skrivFil([
    { typ: 'LINK_MIC_BATTLE', kalla: 'vidarebefordrad', vid: vid(1), nyttolast: { battleStatus: 1 } },
    { typ: 'LINK_MIC_BATTLE', kalla: 'vidarebefordrad', vid: vid(9), nyttolast: { battleStatus: 1 } },
    { typ: 'LINK_MIC_BATTLE', kalla: 'vidarebefordrad', vid: vid(40), nyttolast: { battleStatus: 3 } },
  ]);
  const r = analysera(fil);
  assert.deepEqual(r.punkt2.varden, [1, 3], `distinkta värden i ordning, fick ${r.punkt2.varden}`);
  assert.equal(r.punkt2.sista, 3, 'det sista värdet är kandidaten för "slut"');
});

test('punkt 3: pekar ut vilken händelse som bär matchens slut', () => {
  // Slutet känns igen på att battleSettings försvinner OCH triggerReason dyker upp — det är
  // mönstret som mättes 2026-08-06 och står i minnet som uppmätt facit.
  const fil = skrivFil([
    { typ: 'LINK_MIC_ARMIES', kalla: 'inspelad', vid: vid(5),
      nyttolast: { battleSettings: { duration: 300 }, battleArmies: [] } },
    { typ: 'LINK_MIC_ARMIES', kalla: 'inspelad', vid: vid(50),
      nyttolast: { triggerReason: 2, battleArmies: [] } },
    { typ: 'LINK_MIC_BATTLE', kalla: 'vidarebefordrad', vid: vid(12), nyttolast: { battleStatus: 1 } },
  ]);
  const r = analysera(fil);
  assert.equal(r.punkt3.handelse, 'LINK_MIC_ARMIES',
    `slutet ska pekas ut som LINK_MIC_ARMIES, fick ${r.punkt3.handelse}`);
  assert.ok(r.punkt3.skiljer.includes('triggerReason'),
    `fältet som skiljer sista raden ska rapporteras, fick ${JSON.stringify(r.punkt3.skiljer)}`);
  assert.ok(r.punkt3.borta.includes('battleSettings'),
    `fält som FÖRSVANN i sista raden ska också rapporteras, fick ${JSON.stringify(r.punkt3.borta)}`);
});

test('punkt 4: beskriver arméernas form per lag', () => {
  const fil = skrivFil([
    { typ: 'LINK_MIC_ARMIES', kalla: 'inspelad', vid: vid(50), nyttolast: { battleArmies: [
      { hostUserId: 'a', battleUsers: [{ userId: 'u1', nickname: 'x', score: 120 }] },
      { hostUserId: 'b', battleUsers: [{ userId: 'u2', nickname: 'y', score: 80, diamondScore: 12 }] },
    ] } },
  ]);
  const r = analysera(fil);
  assert.equal(r.punkt4.lag, 2, `två lag i payloaden, fick ${r.punkt4.lag}`);
  assert.ok(r.punkt4.faltPerAnvandare.includes('score'),
    `fälten per användare ska listas, fick ${JSON.stringify(r.punkt4.faltPerAnvandare)}`);
  assert.ok(r.punkt4.faltPerAnvandare.includes('diamondScore'),
    'ett fält som bara vissa användare har ska ändå komma med — annars missas det som gör MVP exakt');
});

test('punkt 6: hittar fältet som skiljer en Guardian från en vanlig medlem', () => {
  const fil = skrivFil([
    { typ: 'MEMBER', kalla: 'inspelad', vid: vid(3), nyttolast: { user: { userId: 'h1', badgeList: [] } } },
    { typ: 'MEMBER', kalla: 'inspelad', vid: vid(7),
      nyttolast: { user: { userId: 'h2', badgeList: [{ type: 'guardian', level: 2 }] } } },
  ]);
  const r = analysera(fil);
  assert.equal(r.punkt6.handelse, 'MEMBER', `fick ${r.punkt6.handelse}`);
  assert.ok(JSON.stringify(r.punkt6.kandidater).toLowerCase().includes('guardian'),
    `kandidatfältet ska nämna guardian, fick ${JSON.stringify(r.punkt6.kandidater)}`);
});

test('punkt 5 och 7 rapporteras som omöjliga att svara på ur en fil', () => {
  const r = analysera(skrivFil([{ typ: '_meta', vid: vid(0), maskad: true }]));
  for (const p of ['punkt5', 'punkt7']) {
    assert.equal(r[p].svar, 'kräver OBS',
      `${p} ska säga rakt ut att en inspelning inte kan svara — annars ser en tom rapport ut som ett godkännande`);
  }
});

test('en inspelning utan battle-händelser svarar "inget underlag", aldrig ett påhittat svar', () => {
  const fil = skrivFil([
    { typ: 'CHAT', kalla: 'vidarebefordrad', vid: vid(1), nyttolast: { comment: '[maskad]' } },
    { typ: 'GIFT', kalla: 'vidarebefordrad', vid: vid(2), nyttolast: { repeatCount: 3 } },
  ]);
  const r = analysera(fil);
  for (const p of ['punkt1', 'punkt2', 'punkt3', 'punkt4']) {
    assert.equal(r[p].svar, 'inget underlag',
      `${p} hittade inget att mäta men svarade "${r[p].svar}" — ett verktyg som gissar är värre än inget`);
  }
  assert.equal(r.sammanfattning.raderLasta, 2, 'antalet lästa rader ska rapporteras');
});

test('punkt 1 litar inte på ett orimligt avstånd — den flaggar mätfelet i stället', () => {
  // Uppmätt under bygget: ett provdata med lokal tid mot ISO-Z gav -7196 s, och verktyget
  // svarade "overlayn tänds 7196 s för sent". Ett boostfönster varar tiotals sekunder; ett
  // avstånd på timmar är inte en timing-fråga utan trasig data — enhet eller tidszon. Ett
  // verktyg som ger råd på ett sådant tal är värre än ett som tiger.
  const fil = skrivFil([
    { typ: 'LINK_MIC_BATTLE_TASK', kalla: 'vidarebefordrad', vid: vid(30),
      nyttolast: { taskMessageType: 0, rewardConfig: { rewardStartTimestamp: 1, rewardMultiple: 3 } } },
  ]);
  const r = analysera(fil);
  assert.equal(r.punkt1.svar, 'orimligt avstånd',
    `fick "${r.punkt1.svar}" — ett avstånd på timmar ska flaggas som mätfel, inte tolkas som timing`);
  assert.match(r.punkt1.slutsats, /tidszon|enhet|sekunder|millisekunder/i,
    'slutsatsen ska peka på den troliga orsaken');
});
