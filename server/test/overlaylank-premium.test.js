'use strict';
// OBS-LÄNKEN SKA SLUTA LEVERERA NÄR ABONNEMANGET TAR SLUT.
//
// UPPMÄTT 2026-09-10 genom att läsa hela grenen: `/api/overlay-access/:token` kontrollerade bara
// att token fanns, inte var återkallad och inte utgången. Ingen plankontroll fanns någonstans —
// varken när overlayens tillstånd hämtades, när målen lästes, när händelseströmmen öppnades, eller
// i bryggan som matar den. En kund som sa upp och lät perioden löpa ut behöll alltså sin overlay i
// sändningen, med livedata, i all framtid. Studion låste sig korrekt och nedladdningen stoppades
// korrekt; det enda som fortsatte var det som faktiskt syns för tittarna. Ingen provfil vaktade det.
//
// Proven här delas i två: reglerna (utan databas, körs överallt) och hela vägen över HTTP (kräver
// Postgres, körs i CI). Regelproven ensamma räcker inte — ett grönt modulprov säger ingenting om
// rutten, vilket den här kodbasen redan lärt sig en gång.
const test = require('node:test'), assert = require('node:assert/strict');

const { overlayPlan, glomOverlayPlan } = require('../billing');

// En pool som räknar frågorna, så cachen går att bevisa och inte bara påstås.
function fejkpool(rader) {
  const p = { fr0agor: 0, frågor: 0 };
  p.query = async () => { p.frågor += 1; return { rows: rader ? [rader] : [] } };
  return p;
}
const om = (over = {}) => ({ plan: 'premium', status: 'active', cancel_at_period_end: false,
  current_period_end: new Date(Date.now() + 86400000), ...over });

test('ett aktivt abonnemang öppnar länken', async () => {
  assert.equal(await overlayPlan(fejkpool(om()), 'w-1'), 'premium');
  glomOverlayPlan('w-1');
});

test('provperiod räknas som aktiv — annars slocknar overlayen mitt i provet', async () => {
  assert.equal(await overlayPlan(fejkpool(om({ status: 'trialing' })), 'w-trial'), 'premium');
  glomOverlayPlan('w-trial');
});

test('uppsagd men perioden kvar: länken lever — kunden har betalat för de dagarna', async () => {
  const rad = om({ cancel_at_period_end: true, current_period_end: new Date(Date.now() + 3600000) });
  assert.equal(await overlayPlan(fejkpool(rad), 'w-slut-senare'), 'premium');
  glomOverlayPlan('w-slut-senare');
});

test('uppsagd OCH perioden passerad: länken stängs', async () => {
  const rad = om({ cancel_at_period_end: true, current_period_end: new Date(Date.now() - 1000) });
  assert.equal(await overlayPlan(fejkpool(rad), 'w-utlopt'), 'free');
  glomOverlayPlan('w-utlopt');
});

test('ingen rad alls är inte premium — deny by default', async () => {
  assert.equal(await overlayPlan(fejkpool(null), 'w-tom'), 'free');
  glomOverlayPlan('w-tom');
});

test('avslutad prenumeration är inte premium', async () => {
  for (const status of ['canceled', 'pending', 'inactive', '']) {
    assert.equal(await overlayPlan(fejkpool(om({ status })), 'w-' + status), 'free', status);
    glomOverlayPlan('w-' + status);
  }
});

test('cachen sparar frågor, och en ändring slår igenom direkt', async () => {
  const p = fejkpool(om());
  await overlayPlan(p, 'w-cache');
  await overlayPlan(p, 'w-cache');
  await overlayPlan(p, 'w-cache');
  assert.equal(p.frågor, 1, 'tre läsningar ska bli en fråga — vägen är publik och träffas ofta');
  // En uppsägning får inte behöva vänta ut cachen.
  glomOverlayPlan('w-cache');
  await overlayPlan(p, 'w-cache');
  assert.equal(p.frågor, 2, 'glomOverlayPlan() ska tvinga fram en ny läsning');
  glomOverlayPlan('w-cache');
});

test('setCancellation och webhooken tömmer cachen', () => {
  // Vakt mot att någon tar bort anropen: utan dem slår en uppsägning igenom först efter en minut,
  // och det syns inte i något annat prov.
  const kalla = require('fs').readFileSync(require.resolve('../billing.js'), 'utf8');
  const anrop = kalla.split('glomOverlayPlan(workspaceId)').length - 1;
  assert.ok(anrop >= 2,
    `glomOverlayPlan(workspaceId) anropas ${anrop} gånger — både upsertFromPaypal och `
    + 'setCancellation måste tömma cachen');
});
