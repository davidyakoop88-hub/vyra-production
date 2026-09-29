'use strict';
// One event, four steps, in an order that is the design rather than a detail.
//
//   1. normalise ONCE, with cleanEvent — the injected one, the real one from event-bus.js
//   2. applyEvent(): the number moves in Postgres, committed
//   3. eventBus.publish(): the raw event, on the contract it has always had
//   4. goal frames, for the rows applyEvent actually returned
//
// Postgres first. An event that was announced but not counted is invisible damage: a widget shows a
// number nothing backs, and nothing will retry it because the publish succeeded. Counted but not
// announced is recoverable — the claim is idempotent, so the bridge's retry publishes the raw event
// without counting a second time. That asymmetry is the whole reason for the order.
//
// The two dedupes are independent and must stay that way. Postgres claims (workspace_id, event_id);
// Redis holds its own SET NX key. Redis can already know an id while this is the transaction that
// actually moved the number — a partial earlier attempt, a replay — and the widget still has to be
// told the new value. So the frames follow what applyEvent returned, never what publish reported.
// The reverse case, an id Postgres has already applied, produces no rows and therefore no frames.
//
// Normalising once is not a tidiness point either. The id cleanEvent produces is what Postgres
// claims and what Redis dedupes on; two normalisations could not be relied on to produce the same
// string, and idempotency across the two stores would quietly become fiction. The same object goes
// to both.
//
// metrics.event() and lastTikTokEventAt are deliberately NOT here. They belong to the raw event
// contract, the caller already owns that rule, and duplicating it would let the two drift.

// Everything is injected: no module-level pool, no bus, no logger. That keeps the order and the
// failure semantics testable without a database or a Redis, which is exactly where those claims are
// easiest to get wrong.
// The default logger forwards to console.error at CALL time rather than capturing the function that
// happened to be there when the ingest was created. A snapshot would ignore anything that replaced
// console.error afterwards — which is how a test captures the line, and how any log transport added
// later would work too.
// viewerLevels är valfri och defaultar till tystnad. Nivåminnet är en förbättring av vad widgetarna
// FÅR veta, inte en förutsättning för att eventet ska nå fram — faller det bort ska gåvan gå ut ändå.
const INGA_NIVAER = { applyEvent: async () => ({ fanLevelUp: null, gifterLevelUp: null }) };

// pointsRuntime är valfri på samma sätt: en sidokonsument av SAMMA eventström som mål redan
// använder, inte en förutsättning för den. server/points-runtime.js skriver sin egen idempotenta
// rad (points_event_apply, samma ON CONFLICT-mönster som goal_event_apply) i sin EGEN transaktion —
// den delar ingen transaktion med goalRuntime.applyEvent, så ett fel där kan aldrig rulla tillbaka
// en redan committad målökning, och tvärtom. Om poängskrivningen misslyckas svaljs felet och loggas
// (samma konvention som streamStats/viewerLevels), exakt som kommentaren ovan redan säger om
// goal-ramar: en sidoeffekt som brister får aldrig hindra det rå eventet från att nå overlayet.
const INGA_POANG = { applyEvent: async () => null };

function createEventIngest({ pool, eventBus, goalRuntime, goalSse, cleanEvent,
                             viewerLevels = INGA_NIVAER, pointsRuntime = INGA_POANG,
                             log = (...args) => console.error(...args), now = Date.now } = {}) {
  // A frame failure must not fail the request: the number is committed and the raw event is out, so
  // the response is already true. The widget corrects itself on the next event or the next GET,
  // because a frame is absolute — that is what makes losing one survivable.
  //
  // The log line carries counts and the error, and no ids at all: not the token, not the payload,
  // not the user, not even the workspace. The http_request line written next to it already has the
  // requestId and the path for whoever needs to place it.
  async function publishFrames(workspaceId, rows, at) {
    let published = 0;
    const failures = [];
    for (const row of rows) {
      try {
        // The row is the committed state — baseline, progress, target, epoch — so the frame is the
        // value after the increment. goal-sse.js builds it and refuses anything incomplete; passing
        // the row straight through is what keeps this from becoming a second frame format.
        if (await goalSse.publish(eventBus, workspaceId, { ...row, at })) published += 1;
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) {
      log(JSON.stringify({ level: 'error', event: 'goal_frame_publish_failed',
        frames: rows.length, failed: failures.length, message: failures[0].message,
        at: new Date(now()).toISOString() }));
    }
    return published;
  }

  return async function ingestEvent(workspaceId, payload) {
    const event = cleanEvent(payload);
    // FÖRE publish, för det är det publicerade eventet widgeten läser. Klienten avgör ingenting
    // längre: den renderar den höjning servern redan konstaterat, precis som konkurrentens widget
    // gör — skillnaden är att vårt minne ligger i molnet och inte i en app på en dator.
    const nivaer = await viewerLevels.applyEvent(workspaceId, event);
    if (nivaer.fanLevelUp) event.fanLevelUp = nivaer.fanLevelUp;
    if (nivaer.gifterLevelUp) event.gifterLevelUp = nivaer.gifterLevelUp;
    const applied = await goalRuntime.applyEvent(pool, workspaceId, event);
    // Efter målets claim (Postgres-ordningen ovan gäller fortfarande målet), men FÖRE det rå eventet
    // publiceras — av samma skäl som nivåminnet ovan: en poängbrist får inte hindra gåvan från att
    // gå ut, men den ska inte heller kunna hända EFTER att widgeten redan fått besked om eventet.
    let points = null;
    try {
      points = await pointsRuntime.applyEvent(pool, workspaceId, event);
    } catch (error) {
      log(JSON.stringify({ level: 'error', event: 'points_apply_failed',
        message: error.message, at: new Date(now()).toISOString() }));
    }
    const raw = await eventBus.publish(workspaceId, event);
    const frames = applied.applied && applied.rows.length
      ? await publishFrames(workspaceId, applied.rows, event.at)
      : 0;
    return { raw, applied, frames, points };
  };
}

module.exports = { createEventIngest };
