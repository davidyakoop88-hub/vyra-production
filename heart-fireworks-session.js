/* Heart Fireworks live-väg. Samma mönster som gift-bubbles-session.js / gift-fireworks-session.js:
   egen kö skild från den delade serie-kön, tre samtidiga jobb, matas av routeLiveBattleEvent.
   Dubblettspärren på event-id ligger i triggern (heart-fireworks.js). */
(function (root) {
  'use strict';
  const TYPER = new Set(['gift', 'gift_combo', 'giftcombo']);
  const NODBROMS = 200, SAMTIDIGA = 3;
  const ko = [], aktiva = new Map();
  let generation = 0, sekvens = 0, forsok = null, kastade = 0;
  function visningsMs(jobb) {
    let w = null;
    try { w = root.state?.widgets?.find(x => x.type === 'templateHeartFireworks') } catch (_) {}
    return Math.max(2, Number(w?.hfDuration) || 6) * 1000 + 400;
  }
  function bokaForsok() {
    if (forsok !== null) return;
    const g = generation;
    forsok = root.setTimeout(() => { if (g !== generation) return; forsok = null; nasta(); }, 100);
  }
  function klar(id, g) {
    if (g !== generation || !aktiva.has(id)) return;
    root.clearTimeout(aktiva.get(id)); aktiva.delete(id); nasta();
  }
  function nasta() {
    while (aktiva.size < SAMTIDIGA && ko.length) {
      if (typeof root.triggerHeartFireworks !== 'function') { bokaForsok(); return; }
      const jobb = ko.shift();
      if (root.triggerHeartFireworks(jobb) === false) continue;
      const id = ++sekvens, g = generation;
      aktiva.set(id, root.setTimeout(() => klar(id, g), visningsMs(jobb)));
    }
  }
  function koa(jobb) {
    if (ko.length >= NODBROMS) {
      kastade += 1;
      try { root.console.warn(`[VYRA heart-fireworks] kön är full (${NODBROMS}), kastade ${kastade} gåvor`) } catch (_) {}
      return;
    }
    ko.push(jobb); nasta();
  }
  function glom() {
    generation += 1; ko.length = 0;
    for (const timer of aktiva.values()) root.clearTimeout(timer);
    aktiva.clear();
    if (forsok !== null) root.clearTimeout(forsok);
    forsok = null; kastade = 0;
  }
  const tidigareRoute = root.routeLiveBattleEvent;
  root.routeLiveBattleEvent = function (event = {}) {
    if (typeof tidigareRoute === 'function') tidigareRoute(event);
    if (event && typeof event === 'object' && TYPER.has(String(event.type || '').toLowerCase())) koa(event);
  };
  root.addEventListener('vyra-session-ended', glom);
  root.VyraSessionState?.registerTeardown?.('heart-fireworks-session', glom);
  root.VyraHeartFireworks = {
    koLangd: () => ko.length, spelar: () => aktiva.size > 0, aktiva: () => aktiva.size,
    kastade: () => kastade,
    nastaNu: () => { const id = aktiva.keys().next().value; if (id !== undefined) klar(id, generation); else nasta() },
    glom
  };
})(window);
