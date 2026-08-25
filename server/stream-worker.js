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

  // Mätarna läses per varv — en fråga, tre tal, inga payloads.
  async function matare() {
    const q = await pool.query(
      `SELECT count(*) FILTER (WHERE published_at IS NULL AND parked_at IS NULL)::int AS pending,
              count(*) FILTER (WHERE published_at IS NULL AND parked_at IS NULL AND lease_until > $1::timestamptz)::int AS leased,
              count(*) FILTER (WHERE parked_at IS NOT NULL)::int AS parked
         FROM stream_event_outbox`, [new Date(nu())]);
    m.pending = q.rows[0].pending;
    m.leased = q.rows[0].leased;
    m.parked = q.rows[0].parked;
  }

  // PARKED ÄR EN DRIFTINDIKERING: varje nyparkerad rad får en egen error-rad med workspace och
  // eventId — id:n, aldrig payload, aldrig token — så driften ser blockeringen utan att gräva.
  async function loggaNyparkerade() {
    const q = await pool.query(
      `SELECT workspace_id, event_id, attempts, parked_at FROM stream_event_outbox
        WHERE parked_at IS NOT NULL AND ($1::timestamptz IS NULL OR parked_at > $1::timestamptz)
        ORDER BY parked_at`, [senastParkerad]);
    for (const rad of q.rows) {
      senastParkerad = rad.parked_at;
      m.parkerade++;
      logg.error(`[utkorg-worker][error] rad parkerad workspace=${rad.workspace_id} eventId=${rad.event_id} forsok=${rad.attempts} — blockerar sitt workspace tills den hanteras`);
    }
  }

  async function varv() {
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
        /*MUTD felen tystas, ingen backoff*/
        boka(intervallMs);
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
