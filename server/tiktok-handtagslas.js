'use strict';
// "Each username locks to the account that linked it." — regeln som gör verifieringen värd något
// över tid, och den enda vägen in i tiktok_connections för ett VERIFIERAT handtag.
//
// VARFÖR LÅSET BEHÖVS UTÖVER SJÄLVA VERIFIERINGEN. En verifiering bevisar bara "den här personen
// ägde handtaget i det här ögonblicket". Utan ett lås kan nästa person som verifierar sig koppla
// samma handtag till sitt eget workspace — och den första tappar sitt konto utan att något
// felmeddelande någonsin visas någonstans. Låset binder handtaget vid open_id, TikToks egen
// stabila identitet för kontot, och släpper bara igenom samma open_id igen.
//
// ORDNINGEN ÄR EN DEL AV BESLUTET: låset FÖRE kapaciteten. Tvärtom kunde ett försök som ändå
// kommer att avvisas hinna räknas in i, eller ta, en av de fem live-platserna.
const { decideTikTokCapacity, TIKTOK_CAPACITY_LOCK } = require('./capacity-gate');

// Ett enda INSERT gör både kontrollen och skrivningen, så det inte går att tävla mellan dem:
// finns handtaget redan med ETT ANNAT open_id faller WHERE-villkoret, RETURNING ger noll rader,
// och vi vet att låset hålls av någon annan. En separat SELECT + INSERT hade varit samma
// check-then-act-tävling som capacity-gate.js redan fått laga en gång.
const KNYT_SQL = `
  INSERT INTO tiktok_handtagslas (handtag, open_id)
       VALUES ($1, $2)
  ON CONFLICT (handtag) DO UPDATE SET senast_sedd = now()
        WHERE tiktok_handtagslas.open_id = $2
    RETURNING open_id`;

const MARK_SQL = `
  UPDATE tiktok_connections
     SET verifierad_at = now(), tiktok_open_id = $2, tiktok_union_id = $3,
         visningsnamn = $4, avatar_url = $5, updated_at = now()
   WHERE workspace_id = $1
RETURNING tiktok_username, active, updated_at, verifierad_at, tiktok_open_id,
          tiktok_union_id, visningsnamn, avatar_url`;

// c: en transaktionsklient (måste ligga inne i BEGIN — advisory-låset släpps vid COMMIT/ROLLBACK).
// profil: det verifiera() i tiktok-verifiering.js lämnade ifrån sig.
// Returnerar { refused: 'last' | 'duplicate' | 'capacity', error } eller { connection }.
async function knytVerifieratHandtag(c, { workspaceId, profil, limit }) {
  const handtag = profil && profil.handtag;
  const openId = profil && profil.openId;
  // Skyddar mot att en framtida anropare skickar in en halv profil. verifiera() kan inte lämna
  // ifrån sig något av det här, men den här funktionen får inte lita på att den är enda vägen in.
  if (!handtag) throw new Error('Profilen saknar handtag — inget användarnamn att knyta');
  if (!openId) throw new Error('Profilen saknar konto-id från TikTok (open_id)');

  // SAMMA lås som capacity-gate.js. De två besluten skriver samma tabell och måste därför
  // serialiseras mot varandra, inte bara var för sig. Advisory-lås är re-entrant inom en och
  // samma transaktion, så decideTikTokCapacity kan ta det igen utan att låsa sig själv.
  await c.query('SELECT pg_advisory_xact_lock($1)', [TIKTOK_CAPACITY_LOCK]);

  const las = await c.query(KNYT_SQL, [handtag, openId]);
  if (!las.rowCount) {
    return { refused: 'last',
      error: `@${handtag} är redan kopplat till ett annat TikTok-konto. Logga in med det konto `
        + 'som handtaget tillhör — ett handtag kan bara kopplas av kontot som äger det.' };
  }

  // Kapaciteten och dubblettregeln gäller lika mycket för ett verifierat konto: fleet-managern
  // kör en brygga per konto oavsett hur namnet kom in.
  const beslut = await decideTikTokCapacity(c, { workspaceId, username: handtag, limit });
  if (beslut.refused) return beslut;

  const markt = await c.query(MARK_SQL, [workspaceId, openId, profil.unionId || null,
    profil.visningsnamn || null, profil.avatarUrl || null]);
  return { connection: markt.rows[0] };
}

module.exports = { knytVerifieratHandtag, KNYT_SQL };
