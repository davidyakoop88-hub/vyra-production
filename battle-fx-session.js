// battle-fx-session.js — kopplar Chrome Battle FX till riktiga battle-event.
//
// Lindar routeLiveBattleEvent (samma monster som fan-level/guardian/battle-mvp). Samma kallor som
// Glove Snipe redan lyssnar pa (vyra-live-battle, postMessage, cross-tab), sa en battle-fx-widget i
// layouten fyrar pa exakt samma tap/snipe/glove/x2/x3 som video-packen. Battle FX och Glove Snipe ar
// oberoende widgetar; bada fyrar om bada finns i layouten.
//
// Laddas EFTER media.js sa routeLiveBattleEvent finns att skriva om, och slar upp triggerBattleFX vid
// ANROPET (inte vid inladdning) sa ordningen mellan svansfilerna inte spelar roll.
(function (root) {
  'use strict';
  const prev = root.routeLiveBattleEvent;
  root.routeLiveBattleEvent = function (event = {}) {
    if (typeof prev === 'function') prev(event);
    try {
      const type = String(event.type || event.event || '').toLowerCase();
      const mult = +(event.multiplier || event.x || event.combo || 0);
      let kind = null;
      if (type.includes('tap')) kind = 'tap';
      else if (type.includes('snipe')) kind = 'snipe';
      else if (type.includes('glove')) kind = 'glove';
      else if (type.includes('x3') || mult === 3) kind = 'x3';
      else if (type.includes('x2') || mult === 2) kind = 'x2';
      if (kind && typeof root.triggerBattleFX === 'function') root.triggerBattleFX({ kind });
    } catch (_) {}
  };
})(window);
