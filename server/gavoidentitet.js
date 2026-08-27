'use strict';
// GÅVOIDENTITET — MANUELLT LÄRLÄGE FÖR EN VALD REGEL.
//
// Se docs/gavoidentitet-inlarning.md. Flödet: välj regel → armera → NÄSTA giltiga, icke-dubblerade
// gåvoevent fångas → Studio visar namn och bild → Bekräfta eller Avbryt → först vid Bekräfta
// sparas giftId för just den regeln och det workspacet.
//
// INGEN observationströskel, INGA avsändarlistor, INGEN automatisk namn→id-katalog. Människan i
// mitten ÄR bekräftelsen, så trösklar löser ett problem som inte finns.
//
// SLUTFRAMES ÄR REDAN LÖST. En streak levererar många frames för samma gåva, men mellanframes
// filtreras bort vid källan — i BÅDA vägarna: tiktok-bridge/bridge.js:374 och
// electron-app/tiktok-service.js:97. Varje gåvoevent som når hit ÄR därför en slutframe. Den
// invarianten bor i andra moduler och vaktas av två egna prov i test/gavoidentitet.test.js.
//
// Modulen äger exakt två tabeller och rör ingenting annat: inte mål, inte statistik, inte de två
// presentationssystemen (recognition-*.js och premium-gift-widget.js).

const UTGANG_MS = 300 * 1000;   // 5 minuter. Två blir stressigt när man växlar Studio↔TikTok.

// Samma transaktionsmönster som resten av servern.
async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const text = (v, max) => String(v === null || v === undefined ? '' : v).slice(0, max);

// rule_key är en teknisk sträng. Tomt eller icke-sträng är inget uppslag.
function nyckel(rule_key) {
  const s = typeof rule_key === 'string' ? rule_key.trim() : '';
  return s.length >= 1 && s.length <= 120 ? s : '';
}

function arGava(event) {
  return !!event && String(event.type || '').toLowerCase() === 'gift';
}

// ---- ARMERING ---------------------------------------------------------------------------------

// Startar lärläget för en regel. Armerar om en redan armerad regel: att trycka "Lär in nästa gåva"
// igen ska ge ett färskt fönster och kasta en gammal fångst, inte tyst behålla den.
async function armera(pool, workspaceId, rule_key, { nu = Date.now, utgangMs = UTGANG_MS } = {}) {
  const k = nyckel(rule_key);
  if (!workspaceId || !k) return { ok: false, skal: 'ogiltig-regel' };
  const nuMs = nu();
  const q = await pool.query(
    `INSERT INTO gift_learn_arm (workspace_id, rule_key, armerad_at, gar_ut_at,
                                 fangad_gift_id, fangad_gift_name, fangad_gift_image, fangad_at)
     VALUES ($1,$2,$3,$4,NULL,NULL,NULL,NULL)
     ON CONFLICT (workspace_id, rule_key) DO UPDATE
       SET armerad_at = EXCLUDED.armerad_at, gar_ut_at = EXCLUDED.gar_ut_at,
           fangad_gift_id = NULL, fangad_gift_name = NULL, fangad_gift_image = NULL, fangad_at = NULL
     RETURNING gar_ut_at`,
    [workspaceId, k, new Date(nuMs), new Date(nuMs + utgangMs)]);
  return { ok: true, garUtAt: q.rows[0].gar_ut_at, utgangMs };
}

async function avbryt(pool, workspaceId, rule_key) {
  const k = nyckel(rule_key);
  if (!workspaceId || !k) return { ok: false, skal: 'ogiltig-regel' };
  await pool.query('DELETE FROM gift_learn_arm WHERE workspace_id=$1 AND rule_key=$2', [workspaceId, k]);
  return { ok: true };
}

// ---- FÅNGSTEN ---------------------------------------------------------------------------------

// Anropas för VARJE inkommande event från ingest-kedjan, fire-and-forget. Returnerar snabbt och
// utan att röra databasen för allt som inte är en gåva — det här ligger i händelseflödet.
//
// `duplicate` speglar raw.duplicate på anropsplatsen: en replay av samma event får aldrig räknas
// som fångsten.
async function fangaFranEvent(pool, workspaceId, event, { duplicate = false, nu = Date.now } = {}) {
  if (!workspaceId || duplicate || !arGava(event)) return { fangad: false };

  const giftId = text(event.giftId, 160);
  if (!giftId) return { fangad: false, skal: 'inget-giftid' };   // utan id finns ingen identitet

  const nuTid = new Date(nu());

  // ETT enda villkorat UPDATE gör hela beslutet, så två samtidiga gåvor inte kan fångas båda:
  //   · fangad_gift_id IS NULL  — bara NÄSTA gåva fångas, en andra skriver inte över
  //   · gar_ut_at > $nu         — en utgången armering fångar ingenting
  // Radlåset i UPDATE serialiserar; den som förlorar ser fangad_gift_id satt och träffar inget.
  // Alla armerade regler i workspacet fångar samma gåva — två samtidiga lärlägen är två
  // oberoende sessioner och ska inte störa varandra.
  const q = await pool.query(
    `UPDATE gift_learn_arm
        SET fangad_gift_id = $2, fangad_gift_name = $3, fangad_gift_image = $4, fangad_at = $5
      WHERE workspace_id = $1
        AND fangad_gift_id IS NULL
        AND gar_ut_at > $5
      RETURNING rule_key`,
    [workspaceId, giftId, text(event.giftName, 160), text(event.giftImage || event.giftPictureUrl, 1200), nuTid]);

  return { fangad: q.rowCount > 0, reglar: q.rows.map(r => r.rule_key) };
}

// ---- BEKRÄFTA ---------------------------------------------------------------------------------

// FÅNGST ÄR INTE SPARANDE. Först här skrivs gift_rule_identity, och bara om fångsten finns OCH
// armeringen fortfarande är giltig — hann du inte trycka måste du armera om.
async function bekrafta(pool, workspaceId, rule_key, { nu = Date.now } = {}) {
  const k = nyckel(rule_key);
  if (!workspaceId || !k) return { ok: false, skal: 'ogiltig-regel' };

  return withTransaction(pool, async client => {
    const arm = await client.query(
      `SELECT fangad_gift_id, fangad_gift_name, fangad_gift_image, gar_ut_at
         FROM gift_learn_arm WHERE workspace_id=$1 AND rule_key=$2 FOR UPDATE`,
      [workspaceId, k]);
    if (!arm.rowCount) return { ok: false, skal: 'ej-armerad' };

    const rad = arm.rows[0];
    if (!rad.fangad_gift_id) return { ok: false, skal: 'ingen-fangst' };
    if (new Date(rad.gar_ut_at).getTime() <= nu()) return { ok: false, skal: 'utgangen' };

    await client.query(
      `INSERT INTO gift_rule_identity (workspace_id, rule_key, gift_id, gift_name, gift_image, bekraftad_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (workspace_id, rule_key) DO UPDATE
         SET gift_id = EXCLUDED.gift_id, gift_name = EXCLUDED.gift_name,
             gift_image = EXCLUDED.gift_image, bekraftad_at = EXCLUDED.bekraftad_at`,
      [workspaceId, k, rad.fangad_gift_id, rad.fangad_gift_name || '', rad.fangad_gift_image || '', new Date(nu())]);

    await client.query('DELETE FROM gift_learn_arm WHERE workspace_id=$1 AND rule_key=$2', [workspaceId, k]);
    return { ok: true, giftId: rad.fangad_gift_id, giftName: rad.fangad_gift_name || '' };
  });
}

// ---- UPPSLAG ----------------------------------------------------------------------------------

// Enda matchningsvägen. giftName matchar ALDRIG — varken här eller som reserv: normalizer.js:68
// defaultar giftName till strängen 'Gift' när namnet saknas, och namnet är språkberoende.
async function slaUppGiftId(pool, workspaceId, rule_key) {
  const k = nyckel(rule_key);
  if (!workspaceId || !k) return null;
  const q = await pool.query(
    'SELECT gift_id FROM gift_rule_identity WHERE workspace_id=$1 AND rule_key=$2', [workspaceId, k]);
  return q.rowCount ? q.rows[0].gift_id : null;
}

// Läget för Studio: vad som är inlärt, om något är armerat, och hur lång tid som är kvar.
// Nedräkningen räknas fram här så att klienten inte behöver äga tidslogiken.
async function status(pool, workspaceId, rule_key, { nu = Date.now } = {}) {
  const k = nyckel(rule_key);
  if (!workspaceId || !k) return { inlard: null, armerad: false };

  const [id, arm] = await Promise.all([
    pool.query('SELECT gift_id, gift_name, gift_image, bekraftad_at FROM gift_rule_identity WHERE workspace_id=$1 AND rule_key=$2', [workspaceId, k]),
    pool.query('SELECT gar_ut_at, fangad_gift_id, fangad_gift_name, fangad_gift_image FROM gift_learn_arm WHERE workspace_id=$1 AND rule_key=$2', [workspaceId, k])
  ]);

  const ut = {
    inlard: id.rowCount ? {
      giftId: id.rows[0].gift_id, giftName: id.rows[0].gift_name,
      giftImage: id.rows[0].gift_image, bekraftadAt: id.rows[0].bekraftad_at
    } : null,
    armerad: false, sekunderKvar: 0, fangst: null
  };

  if (arm.rowCount) {
    const kvarMs = new Date(arm.rows[0].gar_ut_at).getTime() - nu();
    ut.armerad = kvarMs > 0;
    ut.sekunderKvar = Math.max(0, Math.ceil(kvarMs / 1000));
    if (arm.rows[0].fangad_gift_id) {
      ut.fangst = {
        giftId: arm.rows[0].fangad_gift_id,
        giftName: arm.rows[0].fangad_gift_name || '',
        giftImage: arm.rows[0].fangad_gift_image || ''
      };
    }
  }
  return ut;
}

module.exports = { armera, avbryt, fangaFranEvent, bekrafta, slaUppGiftId, status, UTGANG_MS };
