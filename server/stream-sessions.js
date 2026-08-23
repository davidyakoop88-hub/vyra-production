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
const GoalRuntime = require('./goal-runtime.js');

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



  // ---- nollställning ---------------------------------------------------------------------------
  // SCOPES. Stabila strängar, ett kvitto per scope. Ordningen är fast och godtycklig i sak, men
  // FIXERAD med flit: samma ordning varje gång gör felbilder reproducerbara. Faller ett senare
  // scope rullar hela transaktionen tillbaka, inklusive tidigare scopes kvitton och skrivningar —
  // en session vars mål aldrig nollställdes är värre än ett sessionsbyte som inte blev av.
  const SCOPES = ['gift_campaign', 'goal_runtime'];

  // Kvittot ÄR låset. INSERT ... ON CONFLICT DO NOTHING RETURNING gör tävlingen avgjord av
  // primärnyckeln (session_id, scope) och inte av kod: exakt en transaktion får tillbaka en rad,
  // och bara den får nollställa.
  async function taKvitto(c, sessionId, scope) {
    const r = await c.query(
      'INSERT INTO stream_session_reset(session_id, scope) VALUES($1,$2) '
      + 'ON CONFLICT DO NOTHING RETURNING session_id', [sessionId, scope]);
    return r.rowCount === 1;
  }

  // GIFT CAMPAIGN. Räknaren bor i overlays.state, på widgetobjektet: gift-event-images.js:236 gör
  // widget['giftCurrent'+i] += count vid varje gåva och media.js:362 läser tillbaka det.
  //
  // Raderna LÅSES och läses i samma sats. Att läsa state utan lås och skriva tillbaka senare hade
  // skrivit över en samtidig Studio-ändring med en gammal kopia — hela JSON-dokumentet byts ju ut.
  // Ordningen på id gör att två samtidiga nollställningar tar raderna i samma ordning.
  //
  // Bara nycklar som matchar ^giftCurrent\d+$ på widgetar av typen templateGiftCampaign rörs. Ingen
  // generell JSON-rensning: allt annat i dokumentet är konfiguration, inklusive nycklar som inte
  // fanns när den här koden skrevs.
  async function nollstallKampanjerPa(c, workspaceId) {
    const rader = await c.query(
      'SELECT id, state FROM overlays WHERE workspace_id=$1 ORDER BY id FOR UPDATE', [workspaceId]);
    let andrade = 0;
    for (const rad of rader.rows) {
      const state = rad.state;
      if (!state || !Array.isArray(state.widgets)) continue;
      let rort = false;
      for (const w of state.widgets) {
        if (!w || w.type !== 'templateGiftCampaign') continue;
        for (const nyckel of Object.keys(w)) {
          if (!/^giftCurrent\d+$/.test(nyckel)) continue;
          if (Number(w[nyckel]) === 0) continue;      // redan noll: ingen skrivning, ingen version
          w[nyckel] = 0;
          rort = true;
        }
      }
      if (!rort) continue;
      // Versionen är overlayns auktoritativa räknare och höjs BARA när något faktiskt ändrades.
      // En bump utan ändring hade fått varje klient att hämta om en identisk konfiguration.
      await c.query('UPDATE overlays SET state=$2::jsonb, version=version+1, updated_at=now() '
        + 'WHERE id=$1', [rad.id, JSON.stringify(state)]);
      andrade++;
    }
    return andrade;
  }

  // Produktionsvägen. Namngivna resetfunktioner, allt databasarbete på samma client — inga
  // nätverksanrop, ingen eventpublicering, inga icke-transaktionella sidoeffekter. Utkorgen är ett
  // eget block och rör inte den här.
  async function nollstallForNySession(c, { sessionId, workspaceId }) {
    const gjort = {};
    for (const scope of SCOPES) {
      if (!await taKvitto(c, sessionId, scope)) continue;   // någon annan hann först: no-op
      if (scope === 'gift_campaign') gjort[scope] = await nollstallKampanjerPa(c, workspaceId);
      if (scope === 'goal_runtime') gjort[scope] = await GoalRuntime.resetWorkspaceGoals(c, workspaceId);
    }
    return gjort;
  }


  // ---- transactional outbox ----------------------------------------------------------------------
  // Konfigurerbara konstanter. Inga magiska tal spridda i logiken.
  const LEASE_SEKUNDER = 30;      // hur länge en worker äger raden under publiceringen
  const MAX_FORSOK = 8;           // därefter parkeras raden
  const BACKOFF_BAS = 5;          // sekunder
  const BACKOFF_TAK = 900;        // 15 minuter

  // DETERMINISTISKT JITTER, härlett ur (id, attempts). Ingen Math.random() i beslutslogiken:
  // ett prov ska kunna kräva ett EXAKT värde i stället för ett intervall, och en flackande
  // backoff går inte att skilja från en trasig.
  function backoffSekunder(id, attempts, { bas = BACKOFF_BAS, tak = BACKOFF_TAK } = {}) {
    const rakt = Math.min(tak, bas * Math.pow(2, attempts));
    const fro = ((Number(id) * 2654435761) + (attempts * 40503)) >>> 0;
    const jitter = (fro % 1000) / 1000;                     // [0,1)
    return Math.round(Math.min(tak, rakt * (1 + 0.25 * jitter)));
  }

  // ÄGARVILLKORET. Varje skrivning som följer av ett publiceringsförsök — kvittens, retry OCH
  // parkering — måste bära det. En gammal worker vars lease tagits över får inte öka attempts,
  // flytta backoffen eller parkera den NYA workerns rad; den har inget att säga om raden längre.
  // $3 ar ALLTID den injicerade tiden i alla tre satserna nedan, sa villkoret kan vara gemensamt.
  //
  // `lease_until > $3` ar inte samma sak som `lease_owner = $2`. Ett OVERTAGANDE byter agare; en
  // UTGANGEN lease lamnar det gamla agarnamnet kvar men gor det tidsmassigt ogiltigt. Utan
  // tidsvillkoret far en worker som vaknar langt efter sin lease fortfarande kvittera, flytta
  // backoffen eller parkera raden — och den kan da skriva over arbete som en ny agare redan hunnit
  // gora, eller hinna fore den nya agaren och gora dess claim meningslos.
  const AGARVILLKOR = 'id=$1 AND lease_owner=$2 AND lease_until > $3::timestamptz '
    + 'AND published_at IS NULL AND parked_at IS NULL';

  // Publicerar en omgång. Ingen autostart: den här funktionen körs bara när någon anropar den.
  //
  // Klockan injiceras (`nu`) så att prov kan hoppa förbi backoff utan att sova, och så att
  // tidsjämförelserna blir en parameter i stället för databasens now(). Alla tidsvillkor använder
  // samma $nu — annars kunde ett prov få två olika "nu" i samma omgång.
  async function publiceraUtkorg({ sand, workerId, nu, logg, metric, antal = 10 } = {}) {
    const jag = String(workerId || ('worker-' + process.pid + '-' + Math.floor(Date.now() / 1000)));
    const tid = () => (nu ? nu() : new Date());
    const skriv = logg || (() => {});
    const matvarde = metric || (() => {});

    // 1. CLAIM i en KORT transaktion. FOR UPDATE SKIP LOCKED gör att två workers plockar olika
    //    rader; leasen är det som äger raden efter att transaktionen stängts.
    //    `lease_until < $nu` är också återtagandet: en krashad worker släpper aldrig sin lease,
    //    den LÖPER UT, och då plockas raden av nästa omgång utan att någon städare behöver finnas.
    const c = await pool.connect();
    let claimade = [];
    try {
      await c.query('BEGIN');
      const q = await c.query(
        `UPDATE stream_event_outbox SET lease_owner=$1,
                lease_until = $2::timestamptz + ($3 || ' seconds')::interval
          WHERE id IN (
            SELECT id FROM stream_event_outbox
             WHERE published_at IS NULL AND parked_at IS NULL
               AND next_attempt_at <= $2::timestamptz
               AND (lease_until IS NULL OR lease_until < $2::timestamptz)
             ORDER BY id LIMIT $4 FOR UPDATE SKIP LOCKED)
        RETURNING id, workspace_id, event_id, topic, payload, attempts`,
        [jag, tid(), LEASE_SEKUNDER, antal]);
      claimade = q.rows;
      await c.query('COMMIT');
    } catch (error) {
      try { await c.query('ROLLBACK'); } catch (_) {}
      throw error;
    } finally {
      c.release();
    }

    // 2. PUBLICERA UTANFÖR TRANSAKTIONEN. Ett nätverksanrop inne i en öppen transaktion håller
    //    lås och anslutning under någon annans svarstid — och en långsam buss blir då en
    //    databasincident.
    let publicerade = 0;
    for (const rad of claimade) {
      try {
        await sand(rad);
        // 3. KVITTENS, ägarskyddad. rowCount 0 = leasen är övertagen; då skriver vi ingenting.
        const ok = await pool.query(
          `UPDATE stream_event_outbox SET published_at=$3, lease_owner=NULL, lease_until=NULL
            WHERE ${AGARVILLKOR} RETURNING id`,
          [rad.id, jag, tid()]);
        if (ok.rowCount) publicerade++;
        else skriv('[vyra] utkorg: leasen övertagen innan kvittens, rad ' + rad.id);
      } catch (fel_) {
        await hanteraMisslyckande({ rad, jag, tid, fel: fel_, skriv, matvarde });
      }
    }
    return publicerade;
  }

  // Retry, backoff och parkering — allt bakom SAMMA ägarvillkor som kvittensen.
  async function hanteraMisslyckande({ rad, jag, tid, fel, skriv, matvarde }) {
    const nastaForsok = Number(rad.attempts) + 1;
    const parkera = nastaForsok >= MAX_FORSOK;
    const dröj = backoffSekunder(rad.id, Number(rad.attempts));
    const text = String((fel && fel.message) || fel).slice(0, 500);

    if (!parkera) {
      await pool.query(
        `UPDATE stream_event_outbox
            SET attempts=attempts+1, last_error=$4, lease_owner=NULL, lease_until=NULL,
                next_attempt_at = $3::timestamptz + ($5 || ' seconds')::interval
          WHERE ${AGARVILLKOR}`, [rad.id, jag, tid(), text, dröj]);
      return;
    }

    // PARKERING OCH AUDIT I SAMMA KORTA TRANSAKTION. Faller auditinserten ska parkeringen rullas
    // tillbaka — en tyst parkerad rad är precis det som gör en giftig händelse osynlig.
    // Ägarvillkoret gör dessutom att ett upprepat felresultat från samma eller en gammal worker
    // inte kan skapa en andra poison-auditrad: efter första parkeringen är parked_at satt och
    // villkoret matchar aldrig igen.
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const p = await c.query(
        `UPDATE stream_event_outbox
            SET attempts=attempts+1, last_error=$4, parked_at=$3, lease_owner=NULL, lease_until=NULL,
                next_attempt_at = $3::timestamptz + ($5 || ' seconds')::interval
          WHERE ${AGARVILLKOR} RETURNING event_id, workspace_id`,
        [rad.id, jag, tid(), text, dröj]);
      if (!p.rowCount) { await c.query('ROLLBACK'); return; }
      await c.query(
        `INSERT INTO audit_log(workspace_id, actor_user_id, action, target_type, target_id, metadata)
         VALUES($1, NULL, 'stream_outbox_poison', 'stream_event_outbox', $2, $3)`,
        [p.rows[0].workspace_id, String(rad.id),
          JSON.stringify({ eventId: p.rows[0].event_id, attempts: nastaForsok, lastError: text })]);
      await c.query('COMMIT');
      skriv('[vyra] utkorg: händelse parkerad efter ' + nastaForsok + ' försök, rad ' + rad.id);
      matvarde('vyra_outbox_poison_total');
    } catch (error) {
      try { await c.query('ROLLBACK'); } catch (_) {}
      throw error;
    } finally {
      c.release();
    }
  }

  // ADAPTERN: fran claimad outboxrad till bussen. Den verkliga vagen, men fortfarande MANUELLT
  // anropad — ingen worker startas av sig sjalv.
  //
  // ROUTINGEN KOMMER FRAN DATABASKOLUMNEN, aldrig fran payloaden. Ett payload ar data som passerat
  // genom en tabell och kan ha handredigerats; kolumnen ar det servern sjalv skrev nar sessionen
  // skapades. Laser man routing ur payloaden racker det att nagon andrar ett falt for att skicka
  // en annan streamers sandningsbesked in i fel overlay.
  async function publiceraTillBuss(eventBus, rad) {
    const workspaceId = rad && rad.workspace_id;
    if (!workspaceId) throw fel(500, 'outboxraden saknar workspace_id');
    // cleanInternalEvent ar fail-closed: ett korrumperat payload kastar i stallet for att bli en
    // halvgiltig ram.
    return eventBus.publishInternal(workspaceId, rad.payload);
  }

  async function giftigaHandelser() {
    const q = await pool.query(
      'SELECT id, workspace_id, event_id, topic, attempts, last_error, parked_at '
      + 'FROM stream_event_outbox WHERE parked_at IS NOT NULL ORDER BY parked_at');
    return q.rows;
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
        'SELECT 1 FROM stream_room_reopen '
        + 'WHERE workspace_id=$1 AND room_id=$2 AND consumed_at IS NULL FOR UPDATE LIMIT 1',
        [workspaceId, rum]);
      if (!b.rowCount) {
        return { workspaceId, created: false, session: null, stale: true, skal: 'stangt-rum' };
      }
      biljett = true;
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
    // NOLLSTÄLLNINGEN LIGGER I SAMMA TRANSAKTION som sessionen och pekarflytten. Faller den
    // rullar sessionsbytet tillbaka i sin helhet — hellre det än en sändning vars mål bär förra
    // sändningens siffror. Bara den här grenen når hit: en återanslutning returnerar långt
    // tidigare och kan varken skapa kvitto eller nollställa.
    await nollstallForNySession(c, { sessionId, workspaceId });

    // OUTBOXRADEN, i samma transaktion. Skrivs BARA här: återanslutning, idempotent seq, stale och
    // stangt-rum returnerar alla tidigare. Faller nollställningen ovan rullar raden tillbaka med
    // allt annat — en händelse om en sändning vars mål aldrig nollställdes får inte lämna huset.
    //
    // event_id härleds ur det interna session_id:t. Det gör det stabilt och deterministiskt: samma
    // session ger samma id hur många gånger raden än publiceras. UNIQUE(event_id) är sista försvar.
    //
    // PAYLOADEN ÄR MINIMAL. accountKey och bridgeRunId hör hemma i serverns beslut, inte hos en
    // overlaymottagare — skickas de med riskerar de att vitlistas ut till klienten av misstag.
    // roomId utelämnas tills en konkret mottagare behöver det.
    const eventId = 'live:start:' + sessionId;
    await c.query(
      'INSERT INTO stream_event_outbox(workspace_id, event_id, topic, payload) VALUES($1,$2,$3,$4)',
      [workspaceId, eventId, 'live:start', JSON.stringify({
        type: 'livesession',
        event: 'live:start',
        eventId,
        sessionId,
        workspaceId,
        startedAt: new Date().toISOString(),
        previousSessionId: aktiv ? aktiv.id : null,
      })]);

    if (biljett) {
      // Matchar på `consumed_at IS NULL`, INTE på created_at. Postgres timestamptz har
      // mikrosekundsupplösning och JS Date bara millisekunder — ett värde som läses ut och skickas
      // tillbaka som parameter tappar precision och matchar då INGEN rad. Uppmätt i CI 2026-08-23:
      // biljetten konsumerades aldrig, och nästa prov föll på det unika indexet i stället.
      // Det partiella unika indexet garanterar att det finns högst en obrukad, och raden är låst
      // med FOR UPDATE ovan — så villkoret är exakt.
      await c.query('UPDATE stream_room_reopen SET consumed_at=now() '
        + 'WHERE workspace_id=$1 AND room_id=$2 AND consumed_at IS NULL', [workspaceId, rum]);
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
      //
      // ⚠ BEVAKNINGSPUNKT — det här låsets mutationsbevis är UPPSKJUTET, inte godkänt.
      // Uppmätt 2026-08-23: med låset bortmuterat föll INGET prov. Förklaringen är att
      // transaktionen tar bridge_accounts först och att tiktok_connections har workspace_id som
      // primärnyckel — ett workspace har alltså bara ETT konto, så kontolåset serialiserar redan
      // allt som rör workspacet. Låset är därför försvar på djupet, inte den primära
      // serialiseraren, och det finns i dag inget prov som kan fälla dess borttagande.
      //
      // NÄR admin-återöppningen (tillatRumIgen) eller någon ANNAN oberoende skrivväg mot
      // stream_sessions/stream_session_pointer byggs — alltså en väg som INTE går via kontolåset —
      // ska ett deterministiskt samtidighetsprov läggas som visar att borttaget workspacelås fäller
      // rätt prov. Först då är låset bevisat. Ta inte bort det innan dess: frånvaron av ett prov är
      // inte frånvaron av ett behov.
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
    // TESTSEAM, inte en produktionsväg. `utfor` finns för att prov ska kunna framkalla ett fel
    // mitt i nollställningen och för att räkna hur många gånger den kördes. Produktionen använder
    // nollstallForNySession() med NAMNGIVNA resetfunktioner — en generell callback hade öppnat
    // för nätverksanrop och andra icke-transaktionella sidoeffekter inne i transaktionen.
    async nollstall({ sessionId, scope, utfor } = {}) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const vann = await taKvitto(c, sessionId, scope);
        if (!vann) { await c.query('ROLLBACK'); return false; }
        if (utfor) await utfor(c);
        await c.query('COMMIT');
        return true;
      } catch (e) { try { await c.query('ROLLBACK'); } catch (_) {} throw e; } finally { c.release(); }
    },
    // Fristående primitiver, en transaktion var. De tar INGET kvitto — kvittot ägs av
    // sessionsflödet, som är det enda som vet vilken sändning nollställningen hör till.
    async nollstallMal({ workspaceId } = {}) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const n = await GoalRuntime.resetWorkspaceGoals(c, workspaceId);
        await c.query('COMMIT');
        return n;
      } catch (e) { try { await c.query('ROLLBACK'); } catch (_) {} throw e; } finally { c.release(); }
    },
    async nollstallKampanjer({ workspaceId } = {}) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const n = await nollstallKampanjerPa(c, workspaceId);
        await c.query('COMMIT');
        return n;
      } catch (e) { try { await c.query('ROLLBACK'); } catch (_) {} throw e; } finally { c.release(); }
    },
    publiceraUtkorg,
    async tillampaEnGang() { return false; },
    giftigaHandelser,
    backoffSekunder,
    publiceraTillBuss,
  };
}

module.exports = { skapaStreamSessions, kontonyckel };
