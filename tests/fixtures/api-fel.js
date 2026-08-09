'use strict';
// Felsimulering for mock-backenden (Etapp 6B).
//
// VARFOR DEN AR OBLIGATORISK FRAN DAG ETT: auth-client.js baseras pa en sakerhetsegenskap som bara
// gar att prova genom att SKILJA felslagen at. Kommentaren i filen sager det rakt ut:
//
//   configKnown skiljer "servern svarade" fran "anropet gick inte fram". Bara det forsta far leda
//   till en lokal session — ett natverksfel ar inte ett bevis pa att kontosystemet saknas, och att
//   gissa fel dar oppnar en skrivbar session utan verifierad identitet.
//
// Uppmatt 2026-08-09, alla fem lagen mot en riktig Chrome:
//
//   {authRequired:false}   skrivbar session      ingen inloggningsruta
//   {authRequired:true}    EJ skrivbar           inloggningsruta visas
//   HTTP 500               EJ skrivbar           ingen ruta
//   natverksfel            EJ skrivbar           ingen ruta
//   HTTP 404               EJ skrivbar           ingen ruta
//
// Bara ett uttryckligt authRequired:false oppnar skrivlaget. Utan felsimulering kan den regeln
// aldrig vaktas, och en framtida "forenkling" av logiken oppnar sessionen tyst.

// Ett fel ar antingen ett SVAR med fel status, eller inget svar alls.
const FEL = {
  serverfel: { status: 500, kropp: { error: 'Serverfel' } },
  obehorig: { status: 401, kropp: { error: 'Ej inloggad' } },
  forbjuden: { status: 403, kropp: { error: 'Saknar behorighet' } },
  konflikt: { status: 409, kropp: { error: 'Konflikt' } },
  // Socketen rivs utan svar — fetch() avvisar, till skillnad fran ett 500 som ar ett svar.
  natverksfel: { natverk: true },
  // Svarar aldrig. For prov som mater vad UI:t gor medan det vantar.
  timeout: { hang: true },
};

// Bygger en felkarta: { 'GET /api/auth/config': FEL.serverfel }
function fel(karta) {
  const ut = {};
  for (const [rutt, namn] of Object.entries(karta || {})) {
    const f = typeof namn === 'string' ? FEL[namn] : namn;
    if (!f) throw new Error(`Okant fel "${namn}" for ${rutt}. Kanda: ${Object.keys(FEL).join(', ')}`);
    ut[rutt] = f;
  }
  return ut;
}

module.exports = { FEL, fel };
