'use strict';
// UTKORGSWORKERN — pulsgivaren för sändningsidentitetens transactional outbox (PR #270 fas 1).
// Design: docs/worker-och-klient-design.md §Del A.
//
// Allt ÄGARSKAP bor i stream-sessions.js och är redan mutationsbevisat i #268: claimen
// (FOR UPDATE SKIP LOCKED + per-workspace-ordning + lease 30 s), ägarvillkoret på varje
// skrivning, retry/backoff och poison-parkeringen med atomisk audit. Den här modulen äger BARA
// pulsen: när nästa varv körs, att varv aldrig överlappar, att fel blir backoff i stället för
// en död server, att shutdown är begränsad, och att pending/leased/parked syns i metrics.
//
// STARTAS ALDRIG AV SIG SJÄLV. index.js anropar startStreamWorker endast i require.main-blocket
// och endast när VYRA_SANDNINGSIDENTITET === '1' — flagga av betyder att den här filen aldrig
// exekverar någonting (flagga-av-smoken bevakar att en planterad rad förblir orörd).
//
// Talen (godkända i designen): poll 1000 ms, batch 20, stoppväntan max 5 s — halva serverns
// hårda 10 s-utgång, så pool/eventBus alltid hinner stängas efteråt. Ett varv som överges vid
// stopp lämnar sin rad bakom leasen och återtas förlustfritt av nästa instans.
const os = require('node:os');
const crypto = require('node:crypto');
const { skapaStreamSessions } = require('./stream-sessions');

function startStreamWorker({
  pool,
  eventBus,
  metrics = {},
  logg = console,
  intervallMs = 1000,
  antal = 20,
  workerId = `${os.hostname()}-${process.pid}-${crypto.randomBytes(3).toString('hex')}`,
  stoppVantanMs = 5000,
  nu = Date.now,
} = {}) {
  const S = skapaStreamSessions({ pool });
  const m = { publicerade: 0, forsok: 0, parkerade: 0, senastPublicerad: null, pending: 0, leased: 0, parked: 0 };
  metrics.utkorg = m;

  let stoppad = false;
  let timer = null;
  let pagaende = null;      // promise för pågående varv — överlappsvakten
  let felIRad = 0;
  let senastParkerad = null;

  // Mätarna läses per varv — tre tal, inga payloads.
  //
  // TRE DELFRÅGOR, INTE EN `count(*) FILTER`. Uppmätt 2026-08-25 mot Postgres 16 med 50 003 rader
  // i utkorgen (50 000 publicerade, 3 väntande):
  //     count(*) FILTER över hela tabellen   Seq Scan, 50 003 rader, 715 buffers, 14,9 ms
  //     tre delfrågor mot de partiella index  Index Only Scan, 8 buffers, 0,10 ms
  // Skillnaden är att en enda aggregatsökning bara kan välja EN åtkomstväg, och då blir det hela
  // tabellen. Varje delfråga nedan matchar däremot exakt predikatet i ett partiellt index
  // (`stream_outbox_pending_idx` respektive `stream_outbox_parked_idx`) och rör bara de rader som
  // faktiskt är intressanta.
  //
  // Det spelar roll för att frågan körs VARJE SEKUND och publicerade rader aldrig städas bort:
  // kostnaden för den gamla formen växer linjärt med allt som någonsin publicerats.
  async function matare() {
    const q = await pool.query(
      `SELECT (SELECT count(*) FROM stream_event_outbox
                WHERE published_at IS NULL AND parked_at IS NULL)::int AS pending,
              (SELECT count(*) FROM stream_event_outbox
                WHERE published_at IS NULL AND parked_at IS NULL
                  AND lease_until > $1::timestamptz)::int AS leased,
              (SELECT count(*) FROM stream_event_outbox
                WHERE parked_at IS NOT NULL)::int AS parked`, [new Date(nu())]);
    m.pending = q.rows[0].pending;
    m.leased = q.rows[0].leased;
    m.parked = q.rows[0].parked;
  }

  // PARKED ÄR EN DRIFTINDIKERING: varje NYparkerad rad får en egen error-rad med workspace och
  // eventId — id:n, aldrig payload, aldrig token — så driften ser blockeringen utan att gräva.
  // NYparkerad, inte "alla parkerade som någonsin funnits".
  //
  // Vattenmärket `senastParkerad` startade som null, och den första frågan efter VARJE omstart
  // returnerade därför hela poisonlistan och larmade om varenda rad igen. Vid en deployväxling
  // gjorde dessutom båda processerna det samtidigt, så samma gamla rad gav två larm. Ett larm som
  // upprepas vid varje omstart slutar man läsa — och då är indikeringen värdelös just när den
  // behövs.
  //
  // Första varvet SÄTTER därför bara vattenmärket till det som redan fanns, utan att logga. Att en
  // gammal parkerad rad finns kvar syns ändå: mätaren `parked` räknar dem varje varv.
  // Vattenmärket sätts FÖRE första varvet, inte efter. Sätts det efteråt sväljs en rad som
  // parkerades UNDER det varvet — och det är precis de raderna indikeringen finns för.
  let vattenmarkeSatt = false;
  //
  // VATTENMÄRKET ÄR TEXT, INTE ETT Date. Uppmätt 2026-08-25: Postgres timestamptz har
  // MIKROsekunder, JS Date har millisekunder. Läses märket som ett Date trunkeras 11:45:50.693456
  // till 11:45:50.693, och nästa varv är `parked_at > märket` sant för RADEN SJÄLV — samma rad
  // larmade om varje sekund i evighet. Precisionen får aldrig gå genom JS: `::text` behåller den
  // hela vägen, och jämförelsen görs av databasen.
  async function sattVattenmarke() {
    if (vattenmarkeSatt) return;
    const q0 = await pool.query(
      'SELECT max(parked_at)::text AS senast FROM stream_event_outbox WHERE parked_at IS NOT NULL');
    senastParkerad = q0.rows[0].senast || null;
    vattenmarkeSatt = true;
  }
  async function loggaNyparkerade() {
    const q = await pool.query(
      `SELECT workspace_id, event_id, attempts, parked_at::text AS parked_at FROM stream_event_outbox
        WHERE parked_at IS NOT NULL AND ($1::timestamptz IS NULL OR parked_at > $1::timestamptz)
        ORDER BY parked_at`, [senastParkerad]);
    for (const rad of q.rows) {
      senastParkerad = rad.parked_at;
      m.parkerade++;
      logg.error(`[utkorg-worker][error] rad parkerad workspace=${rad.workspace_id} eventId=${rad.event_id} forsok=${rad.attempts} — blockerar sitt workspace tills den hanteras`);
    }
  }

  async function varv() {
    await sattVattenmarke();
    const n = await S.publiceraUtkorg({
      sand: rad => S.publiceraTillBuss(eventBus, rad),
      workerId,
      antal,
      nu: () => new Date(nu()),
      logg: text => logg.log(text),
      metric: () => { m.forsok++; },
    });
    if (n > 0) {
      m.publicerade += n;
      m.senastPublicerad = new Date(nu()).toISOString();
    }
    await loggaNyparkerade();
    await matare();
  }

  // FELTEXTEN SANERAS FÖRE LOGGNING. `error.message` är inte vår text: den kommer från pg eller
  // node-redis och bär regelbundet en HEL uppkopplingssträng — `redis://default:<lösenord>@host` —
  // när anslutningen faller. Ett driftlarm får aldrig vara det som skriver ut hemligheten.
  // Regeln är därför en vitlista i praktiken: allt som ser ut som en URL med användarinfo klipps,
  // och texten kortas. Payloads har aldrig varit med här och ska inte bli det.
  function sanera(error) {
    const text = String((error && error.message) || error || 'okänt fel');
    return text
      .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s@/]*@/gi, '<uppkoppling>@')   // user:pass@host
      .replace(/\b(password|pwd|token|secret|auth)\s*[=:]\s*\S+/gi, '$1=<dolt>')
      .slice(0, 200);
  }

  function boka(ms) {
    if (stoppad) return;
    timer = setTimeout(kor, ms);
    if (typeof timer.unref === 'function') timer.unref();
  }

  // setTimeout-KEDJA, inte setInterval: nästa varv bokas först när det förra är klart, så två
  // varv kan aldrig överlappa i samma process. `pagaende` är hängslen ovanpå.
  function kor() {
    if (stoppad || pagaende) return;
    pagaende = (async () => {
      try {
        await varv();
        felIRad = 0;
        boka(intervallMs);
      } catch (error) {
        // Redis/Postgres nere får ALDRIG döda servern: logga och backa 1→30 s.
        felIRad++;
        const backoffMs = Math.min(30_000, 1_000 * (2 ** Math.min(felIRad - 1, 5)));
        logg.error(`[utkorg-worker][error] varvet föll (${sanera(error)}) — nytt försök om ${Math.round(backoffMs / 1000)}s`);
        boka(backoffMs);
      } finally {
        pagaende = null;
      }
    })();
  }

  boka(0);

  // stop(): inga nya varv eller claims omedelbart; vänta BEGRÄNSAT på pågående varv. Ett varv
  // som inte hinner klart överges — dess rad står bakom leasen och återtas av nästa instans.
  async function stop() {
    stoppad = true;
    clearTimeout(timer);
    if (pagaende) {
      await Promise.race([pagaende, new Promise(r => { const t = setTimeout(r, stoppVantanMs); if (typeof t.unref === 'function') t.unref(); })]);
    }
  }

  return { stop };
}

module.exports = { startStreamWorker };
