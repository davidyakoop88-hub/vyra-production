// Three independent sender lanes, separate from the shared serial alert queue.
(function (root) {
  'use strict';
  const TYPER = new Set(['gift', 'gift_combo', 'giftcombo']);
  const NODBROMS = 200, SAMTIDIGA = 3;
  const ko = [], aktiva = new Map();
  let generation = 0, sekvens = 0, forsok = null, kastade = 0;
  function visningsMs(jobb) {
    if (root.VyraFireworks?.durationFor) return root.VyraFireworks.durationFor(jobb) + 200;
    let w = null;
    try { w = root.state?.widgets?.find(x => x.type === 'templateGiftFireworks') } catch (_) {}
    return Math.max(0, Number(w?.fwDuration) || 5) * 1000 + 200;
  }
  function bokaForsok() {
    if (forsok !== null) return;
    const g = generation;
    forsok = root.setTimeout(() => {
      if (g !== generation) return;
      forsok = null; nasta();
    }, 100);
  }
  function klar(id, g) {
    if (g !== generation || !aktiva.has(id)) return;
    root.clearTimeout(aktiva.get(id)); aktiva.delete(id); nasta();
  }
  function nasta() {
    while (aktiva.size < SAMTIDIGA && ko.length) {
      // Direct Actions may already occupy renderer lanes. Retain pending gifts.
      if (typeof root.triggerGiftFireworks !== 'function' || root.VyraFireworks?.capacityFor?.(ko[0]) === false) {
        bokaForsok(); return;
      }
      const jobb = ko.shift();
      if (root.triggerGiftFireworks(jobb) === false) continue;
      const id = ++sekvens, g = generation;
      aktiva.set(id, root.setTimeout(() => klar(id, g), visningsMs(jobb)));
    }
  }
  function koa(jobb) {
    if (ko.length >= NODBROMS) {
      kastade += 1;
      try { root.console.warn(`[VYRA gift-fireworks] kön är full (${NODBROMS}), kastade ${kastade} gåvor`) } catch (_) {}
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
  root.VyraSessionState?.registerTeardown?.('gift-fireworks-session', glom);
  root.VyraGiftFireworks = {
    koLangd: () => ko.length, spelar: () => aktiva.size > 0, aktiva: () => aktiva.size,
    kastade: () => kastade,
    nastaNu: () => { const id = aktiva.keys().next().value; if (id !== undefined) klar(id, generation); else nasta() },
    glom
  };
})(window);
