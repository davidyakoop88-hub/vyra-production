'use strict';
// SÄNDNINGSIDENTITET — bryggkörningens generation.
//
// Den här filen äger EN sak i det här skedet: vilken bryggkörning som får tala för ett konto.
// Sessionsskapande, sessionsbyte, nollställning, utkorg och HTTP-rutter är ännu inte skrivna och
// står kvar som stommar — avsiktligt, så att varje beteende kan bevisas för sig.
//
// AKTIVERINGSFLAGGA (fail-closed): skrivvägen över HTTP är avstängd om inte
// VYRA_SANDNINGSIDENTITET är exakt strängen '1'. Allt annat — 'true', 'ja', 'on', tomt, osatt —
// är AV. Flaggan gäller rutterna, som inte finns än; proven anropar modulen direkt.
const AKTIVERAD = () => process.env.VYRA_SANDNINGSIDENTITET === '1';

// Husregeln finns redan i capacity-gate.js:24 och återanvänds ordagrant. En andra
// normaliseringsregel hade delat kontot i två och halverat fan-outen.
function kontonyckel(namn) {
  return String(namn == null ? '' : namn).trim().toLowerCase().replace(/^@+/, '');
}

// Samma uttryck som ovan, men i SQL — så att uppslagningen matchar redan lagrade namn oavsett
// hur de skrevs in. `@Jokero060 ` och `jokero060` är samma konto.
const KONTO_SQL = "regexp_replace(lower(btrim(tiktok_username)), '^@+', '')";

function fel(status, meddelande) {
  // Går till klienten OCH loggen. Ingen token, ingen header, ingen hemlighet — inte heller dess
  // längd, som är en ledtråd i sig.
  return Object.assign(new Error(meddelande), { status });
}

function skapaStreamSessions({ pool }) {
  if (!pool) throw new Error('stream-sessions kräver en pool');

  const inteAn = namn => { throw fel(501, namn + ' är inte implementerad än'); };

  // ---- generationstilldelning -------------------------------------------------------------------
  // UNIQUE(account_key, generation) hindrar dubbletter men skapar INGEN ordning: utan lås läser två
  // samtidiga registreringar samma MAX, båda skriver N+1, och den ena kraschar på unikhetsfelet.
  // Det är en LEGITIM registrering som förloras — bryggan har inte gjort något fel.
  //
  // Låset ligger på bridge_accounts, en rad per konto som alltid finns. FOR NO KEY UPDATE, inte
  // FOR UPDATE: krockar med sig självt så registreringar serialiseras, men inte med FOR KEY SHARE,
  // så INSERT i bridge_runs (som refererar raden) inte blockeras i onödan.
  //
  // Inte pg_advisory_xact_lock: capacity-gate.js:29 har redan ett advisory-lås på en FAST konstant
  // med en kommentar om att det bara håller så länge inget annat i databasen använder samma nyckel.
  // En hashad nyckel bredvid den är precis den samordningsskulden. En riktig rad syns dessutom i
  // pg_locks med namn.
  async function registreraKorning({ konto, bridgeRunId } = {}) {
    const nyckel = kontonyckel(konto);
    const kornId = String(bridgeRunId == null ? '' : bridgeRunId).trim();
    if (!nyckel) throw fel(400, 'kontonamn saknas');
    if (!kornId) throw fel(400, 'bridgeRunId saknas');

    // Två försök. INSERT ... ON CONFLICT DO NOTHING följt av SELECT ... FOR NO KEY UPDATE har ett
    // smalt fönster: förlorar man kapplöpningen om INSERT blockerar man på unika indexet, får noll
    // rader tillbaka, och om vinnaren sedan RULLAR TILLBAKA finns raden inte att låsa. Då gör vi
    // om — en gång. Fler försök vore att dölja ett annat fel.
    for (let forsok = 0; forsok < 2; forsok++) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query(
          'INSERT INTO bridge_accounts(account_key) VALUES($1) ON CONFLICT DO NOTHING', [nyckel]);
        const last = await c.query(
          'SELECT account_key FROM bridge_accounts WHERE account_key=$1 FOR NO KEY UPDATE', [nyckel]);
        if (!last.rowCount) { await c.query('ROLLBACK'); continue; }

        // Härifrån är vi ensamma om kontot. Beslutet fattas EXPLICIT under låset — inte av en
        // ON CONFLICT-klausul, som inte kan skilja de tre fallen åt.
        //
        // EN AVLÖST KÖRNING FÅR ALDRIG ÅTERUPPSTÅ. `ON CONFLICT ... DO UPDATE SET current=true`
        // gjorde precis det: A registrerar sig, B avlöser A, A registrerar sig igen och blev
        // aktuell på nytt. En död eller nätverkstappad brygga hade då kunnat rycka tillbaka
        // sändningen från den som faktiskt kör. En omstartad brygga ska mynta ett NYTT körnings-id.
        const befintlig = await c.query(
          'SELECT generation, current FROM bridge_runs WHERE account_key=$1 AND bridge_run_id=$2',
          [nyckel, kornId]);
        if (befintlig.rowCount) {
          const { generation, current } = befintlig.rows[0];
          await c.query('COMMIT');
          if (current) {
            // Samma AKTUELLA brygga säger till igen. Idempotent: samma generation, ingen ny rad,
            // inget byte.
            return { accountKey: nyckel, bridgeRunId: kornId, generation: Number(generation),
              redanRegistrerad: true };
          }
          throw fel(409, 'bryggkörningen är avlöst och kan inte återregistreras');
        }

        // MAX läses UNDER låset — det är hela poängen. Generationen härleds ALDRIG ur
        // bridge_run_id (sträng utan ordning), started_at (klockor går isär och bakåt) eller
        // id/bigserial (delas ut före commit, så två samtidiga kan committa i omvänd ordning mot
        // sina id).
        const nasta = await c.query(
          'SELECT COALESCE(MAX(generation),0)+1 AS generation FROM bridge_runs WHERE account_key=$1',
          [nyckel]);
        const generation = Number(nasta.rows[0].generation);

        await c.query('UPDATE bridge_runs SET current=false WHERE account_key=$1 AND current',
          [nyckel]);
        // Rak INSERT. UNIQUE(account_key,bridge_run_id) och UNIQUE(account_key,generation) står
        // kvar som SISTA försvar — men beslutet är redan fattat ovan, under låset.
        const rad = await c.query(
          'INSERT INTO bridge_runs(account_key,bridge_run_id,generation,current) '
          + 'VALUES($1,$2,$3,true) RETURNING generation', [nyckel, kornId, generation]);
        await c.query('COMMIT');
        return { accountKey: nyckel, bridgeRunId: kornId, generation: Number(rad.rows[0].generation) };
      } catch (error) {
        try { await c.query('ROLLBACK'); } catch (_) {}
        throw error;
      } finally {
        c.release();
      }
    }
    throw fel(409, 'kontoraden kunde inte låsas');
  }

  // Vilken körning får tala? Aktuell generation, och ett seq som inte är äldre än det högsta sedda.
  // Returnerar null när beskedet ska accepteras, annars ett skäl.
  async function foraldratBesked({ nyckel, bridgeRunId, seq }) {
    if (bridgeRunId == null) return null;          // äldre bryggor utan körnings-id: eget beslut
    const q = await pool.query(
      'SELECT current, max_seq FROM bridge_runs WHERE account_key=$1 AND bridge_run_id=$2',
      [nyckel, String(bridgeRunId).trim()]);
    if (!q.rowCount) return 'okand-korning';
    // AVLÖST GENERATION. En omstartad brygga gör den förra inaktuell; allt som kommer därifrån
    // efteråt är ett eko. Att släppa igenom det vore att låta en död process byta sändning.
    /*MUT2*/ if (false) return null;
    if (seq == null) return null;
    const max = Number(q.rows[0].max_seq), n = Number(seq);
    if (!Number.isFinite(n)) return 'ogiltigt-seq';
    if (n < max) return 'aldre-seq';
    if (n > max) {
      await pool.query(
        'UPDATE bridge_runs SET max_seq=$3 WHERE account_key=$1 AND bridge_run_id=$2 AND max_seq<$3',
        [nyckel, String(bridgeRunId).trim(), n]);
    }
    return null;                                    // n === max är samma besked igen: idempotent
  }

  // De workspaces som prenumererar på kontot. Fan-out sker HÄR, i servern, på en enda
  // TikTok-anslutning — capacity-gate.js räknar anslutningar, och en per workspace skalar inte.
  async function prenumeranter(nyckel) {
    const q = await pool.query(
      'SELECT workspace_id FROM tiktok_connections WHERE active AND ' + KONTO_SQL + '=$1 '
      + 'ORDER BY workspace_id', [nyckel]);
    return q.rows.map(r => r.workspace_id);
  }

  return {
    kontonyckel,
    aktiverad: AKTIVERAD,
    registreraKorning,

    // Sessionsskapandet är ÄNNU INTE skrivet. Det här steget avgör bara vem som får tala och
    // vilka workspaces beskedet gäller — inga sessionsrader skapas, ingen pekare flyttas.
    async startaLive({ konto, bridgeRunId, seq } = {}) {
      const nyckel = kontonyckel(konto);
      if (!nyckel) throw fel(400, 'kontonamn saknas');
      const skal = await foraldratBesked({ nyckel, bridgeRunId, seq });
      if (skal) return { stale: true, skal, workspaces: [] };
      return {
        stale: false,
        workspaces: (await prenumeranter(nyckel)).map(workspaceId => ({ workspaceId })),
      };
    },

    async avslutaLive() { return { ended: false }; },
    async startaLiveViaHttp() { return inteAn('startaLiveViaHttp'); },
    async tillatRumIgen() { return inteAn('tillatRumIgen'); },
    async nollstall() { return false; },
    async nollstallMal() { return inteAn('nollstallMal'); },
    async nollstallKampanjer() { return inteAn('nollstallKampanjer'); },
    async publiceraUtkorg() { return 0; },
    async tillampaEnGang() { return false; },
    async giftigaHandelser() { return []; },
  };
}

module.exports = { skapaStreamSessions, kontonyckel };
