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
  // Samma beslut, men mot en GODTYCKLIG queryable — poolen när det står för sig självt, och den
  // öppna transaktionens client när det ingår i ett statusbesked. Det är hela poängen: seq-domen
  // får inte committa separat och sedan låta pekarflytten ske i en annan transaktion. Då kan
  // seq=2 accepteras, seq=3 flytta pekaren, och seq=2 vakna efteråt och flytta tillbaka den.
  //
  // Returnerar {} = accepterat och framflyttat, {idempotent:true} = samma seq igen,
  // {skal:'...'} = föråldrat.
  async function sekvensdom(q, { nyckel, bridgeRunId, seq }) {
    if (bridgeRunId == null) return {};            // äldre bryggor utan körnings-id: eget beslut
    const kornId = String(bridgeRunId).trim();

    if (seq == null) {
      const r = await q.query(
        'SELECT current FROM bridge_runs WHERE account_key=$1 AND bridge_run_id=$2',
        [nyckel, kornId]);
      if (!r.rowCount) return { skal: 'okand-korning' };
      return r.rows[0].current ? {} : { skal: 'avlost-korning' };
    }

    const n = Number(seq);
    if (!Number.isFinite(n)) return { skal: 'ogiltigt-seq' };

    const framflyttad = await q.query(
      'UPDATE bridge_runs SET max_seq=$3 '
      + 'WHERE account_key=$1 AND bridge_run_id=$2 AND current AND max_seq<$3 '
      + 'RETURNING max_seq', [nyckel, kornId, n]);
    if (framflyttad.rowCount) return {};

    const r = await q.query(
      'SELECT current, max_seq FROM bridge_runs WHERE account_key=$1 AND bridge_run_id=$2',
      [nyckel, kornId]);
    if (!r.rowCount) return { skal: 'okand-korning' };
    if (!r.rows[0].current) return { skal: 'avlost-korning' };
    const max = Number(r.rows[0].max_seq);
    // SAMMA SEQ ÄR EN FULLSTÄNDIG NO-OP FÖR SESSIONSDELEN. Den får INTE gå vidare till
    // rumsbeslutet: annars kan någon skicka om samma seq med ett ANNAT roomId och flytta pekaren
    // trots att sekvensen inte är ny.
    if (n === max) return { idempotent: true };
    if (n < max) return { skal: 'aldre-seq' };
    return { skal: 'kapplopning' };
  }

  // Fristående variant, kvar för sina egna prov. Produktionsflödet går genom sekvensdom() på
  // transaktionens client.
  async function foraldratBesked({ nyckel, bridgeRunId, seq }) {
    const d = await sekvensdom(pool, { nyckel, bridgeRunId, seq });
    return d.skal || null;
  }


  // De workspaces som prenumererar på kontot. Fan-out sker HÄR, i servern, på en enda
  // TikTok-anslutning — capacity-gate.js räknar anslutningar, och en per workspace skalar inte.
  async function prenumeranter(nyckel) {
    const q = await pool.query(
      'SELECT workspace_id FROM tiktok_connections WHERE active AND ' + KONTO_SQL + '=$1 '
      + 'ORDER BY workspace_id', [nyckel]);
    return q.rows.map(r => r.workspace_id);
  }


  // ---- sessionsbeslut per workspace --------------------------------------------------------------
  // Körs INNE i statusbeskedets transaktion, efter att workspaceraden är låst. Varje workspace äger
  // sin EGEN historik och sin egen biljett: ett blockerat workspace får inte hindra ett annat, för
  // statusbeskedet är giltigt för KONTOT medan historiken är per workspace.
  async function beslutForWorkspace(c, { workspaceId, rum, nyckel, kornId }) {
    // Pekarraden måste finnas för att kunna låsas. INSERT ... ON CONFLICT DO NOTHING följt av
    // FOR UPDATE — workspaceraden är redan låst ovan, så ingen kan hinna emellan.
    await c.query('INSERT INTO stream_session_pointer(workspace_id) VALUES($1) ON CONFLICT DO NOTHING',
      [workspaceId]);
    const p = await c.query(
      'SELECT session_id FROM stream_session_pointer WHERE workspace_id=$1 FOR UPDATE',
      [workspaceId]);
    const pekare = p.rows[0] ? p.rows[0].session_id : null;

    let aktiv = null;
    if (pekare) {
      const a = await c.query(
        'SELECT id, room_id FROM stream_sessions WHERE id=$1 AND ended_at IS NULL', [pekare]);
      aktiv = a.rows[0] || null;
    }

    // a) ÅTERANSLUTNING. Samma rum som redan är aktivt: ingen ny session, ingen pekarflytt — och
    //    framför allt ingen biljett konsumeras. En återanslutning är inte en återöppning.
    if (aktiv && aktiv.room_id === rum) {
      return { workspaceId, created: false, session: { id: aktiv.id, roomId: rum } };
    }

    // b) STÄNGD HISTORIK → FAIL-CLOSED. Ett rum som en gång avslutats öppnas aldrig automatiskt.
    //    Enda vägen tillbaka är en biljett som en människa utfärdat.
    let biljett = null;
    const stangd = await c.query(
      'SELECT 1 FROM stream_sessions WHERE workspace_id=$1 AND room_id=$2 AND ended_at IS NOT NULL '
      + 'LIMIT 1', [workspaceId, rum]);
    if (stangd.rowCount) {
      // FOR UPDATE låser biljetten så två samtidiga besked inte kan konsumera samma. Det partiella
      // unika indexet garanterar att det finns högst en obrukad.
      const b = await c.query(
        'SELECT created_at FROM stream_room_reopen '
        + 'WHERE workspace_id=$1 AND room_id=$2 AND consumed_at IS NULL FOR UPDATE LIMIT 1',
        [workspaceId, rum]);
      if (!b.rowCount) {
        return { workspaceId, created: false, session: null, stale: true, skal: 'stangt-rum' };
      }
      biljett = b.rows[0].created_at;
    }

    // c) Byte: den föregående sändningen avslutas som ERSATT — inte 'bridge', för bryggan sa aldrig
    //    att den var slut; vi drog slutsatsen av att ett nytt rum dök upp.
    if (aktiv) {
      await c.query("UPDATE stream_sessions SET ended_at=now(), end_reason='ersatt' WHERE id=$1",
        [aktiv.id]);
    }

    // d) Skapa och peka. Faller INSERT (t.ex. på det partiella unika indexet) rullar hela
    //    transaktionen tillbaka och biljetten förblir oanvänd — den får bara konsumeras om
    //    sessionen verkligen blev till.
    const ny = await c.query(
      'INSERT INTO stream_sessions(workspace_id,room_id,account_key,bridge_run_id) '
      + 'VALUES($1,$2,$3,$4) RETURNING id', [workspaceId, rum, nyckel, kornId]);
    const sessionId = ny.rows[0].id;
    await c.query('UPDATE stream_session_pointer SET session_id=$2, updated_at=now() '
      + 'WHERE workspace_id=$1', [workspaceId, sessionId]);
    if (biljett) {
      await c.query('UPDATE stream_room_reopen SET consumed_at=now() '
        + 'WHERE workspace_id=$1 AND room_id=$2 AND created_at=$3', [workspaceId, rum, biljett]);
    }
    return { workspaceId, created: true, session: { id: sessionId, roomId: rum },
      ersatte: aktiv ? aktiv.id : null, biljettAnvand: !!biljett };
  }

  // ETT statusbesked = EN transaktion. Generation, seq, workspacelås, sessionsbeslut och pekarflytt
  // sker på samma anslutning. Delas de upp kan seq=2 accepteras, seq=3 flytta pekaren, och seq=2
  // sedan vakna och flytta tillbaka den — slutresultatet hade avgjorts av vem som sov längst.
  //
  // LÅSORDNING (invariant): bridge_accounts → workspaces (sorterade på id) → stream_*.
  // registreraKorning tar också bridge_accounts först, så vägarna serialiseras utan cykel.
  // INGA nätverksanrop inne i transaktionen.
  async function startaLive({ konto, roomId, bridgeRunId, seq } = {}) {
    const nyckel = kontonyckel(konto);
    if (!nyckel) throw fel(400, 'kontonamn saknas');
    const rum = String(roomId == null ? '' : roomId).trim();
    const kornId = bridgeRunId == null ? null : String(bridgeRunId).trim();

    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT account_key FROM bridge_accounts WHERE account_key=$1 FOR NO KEY UPDATE',
        [nyckel]);

      const ws = (await c.query(
        'SELECT workspace_id FROM tiktok_connections WHERE active AND ' + KONTO_SQL + '=$1 '
        + 'ORDER BY workspace_id', [nyckel])).rows.map(r => r.workspace_id);

      // Sorterad låsordning. Två besked som rör samma konto tar samma rader i samma ordning, så
      // de kan inte låsa varandra i motsatt riktning.
      if (ws.length) {
        await c.query('SELECT id FROM workspaces WHERE id = ANY($1::uuid[]) ORDER BY id '
          + 'FOR NO KEY UPDATE', [ws]);
      }

      // FÖRST NU seq/generation — inne i låset. Tas den före låsen kan två besked passera den och
      // sedan köa i godtycklig ordning, och då avgör låsordningen i stället för sekvensen.
      const dom = await sekvensdom(c, { nyckel, bridgeRunId, seq });
      if (dom.skal) {
        await c.query('ROLLBACK');
        return { stale: true, skal: dom.skal, workspaces: [] };
      }
      if (dom.idempotent) {
        // SAMMA SEQ IGEN: fullständig no-op för sessionsdelen. Läser bara upp nuläget så svaret
        // blir detsamma som första gången. Går man vidare till rumsbeslutet kan samma seq med ett
        // ANNAT roomId flytta pekaren, trots att sekvensen inte är ny.
        const nulage = [];
        for (const w of ws) {
          const p = await c.query(
            'SELECT s.id, s.room_id FROM stream_session_pointer p '
            + 'LEFT JOIN stream_sessions s ON s.id=p.session_id AND s.ended_at IS NULL '
            + 'WHERE p.workspace_id=$1', [w]);
          const rad = p.rows[0];
          nulage.push({ workspaceId: w, created: false,
            session: rad && rad.id ? { id: rad.id, roomId: rad.room_id } : null });
        }
        await c.query('ROLLBACK');
        return { stale: false, idempotent: true, workspaces: nulage };
      }

      if (!rum) { await c.query('ROLLBACK'); throw fel(400, 'roomId saknas'); }

      const resultat = [];
      for (const w of ws) {
        resultat.push(await beslutForWorkspace(c, { workspaceId: w, rum, nyckel, kornId }));
      }
      await c.query('COMMIT');
      return { stale: false, workspaces: resultat };
    } catch (error) {
      try { await c.query('ROLLBACK'); } catch (_) {}
      throw error;
    } finally {
      c.release();
    }
  }

  return {
    kontonyckel,
    aktiverad: AKTIVERAD,
    registreraKorning,

    startaLive,

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
