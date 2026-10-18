/* Gift Fireworks live-väg: egen kö, skild från den delade serie-kön för alerts.

   ETT I TAGET SOM STANDARD (användarens beslut 2026-10-18). Tidigare spelade tre avsändare
   samtidigt i tre filer (SAMTIDIGA = 3). Under LIVE 2026-10-17 kom tre gåvor med ett par sekunders
   mellanrum och syntes som tre fyrverkerier bredvid varandra. Nu gäller:

   1. Antalet samtidiga är widgetens "Samtidiga fyrverkerier" (VyraFireworks.lanesFor), standard 1.
      Ett uttryckligt sparat val (t.ex. 3) respekteras.
   2. En plats blir ledig när fyrverkeriet når sin TOPP (VyraFireworks.releaseFor), inte när hela
      visningstiden har gått. Toppen kommer från motorns egen tidslinje — festivalens enkla sol plus
      fyra hjärtan står färdiga 3,09 s in — så nästa startar ca 3,2 s efter det förra, som tonar ut i
      sin egen takt.
   3. Kön trycks ihop när den blir lång (mer än KO_TRYCK väntande):
      a. samma avsändares väntande gåvor slås ihop till EN, med summerat värde — värdet styr nivån,
         inte antalet tryck (beslut 2026-09-19);
      b. tempot höjs för gåvan som startar: 1 + (väntande - 5) / 5, högst 2 (30 väntande -> 2x),
         vilket kortar både visningstiden och tiden till toppen;
      c. en gåva som väntat längre än MAX_ALDER_MS spelas inte alls. */
(function (root) {
  'use strict';
  const TYPER = new Set(['gift', 'gift_combo', 'giftcombo']);
  const NODBROMS = 200;
  const KO_TRYCK = 5, MAX_TEMPO = 2, MAX_ALDER_MS = 60000, MARGINAL_MS = 100;
  const ko = [], aktiva = new Map();
  let generation = 0, sekvens = 0, forsok = null, kastade = 0, forsenade = 0, ihopslagna = 0;
  // Samma klocka som renderaren (dataset.release/expires), så kön och filerna inte kan glida isär.
  const nu = () => Date.now();
  function filer(jobb) {
    const n = Number(root.VyraFireworks?.lanesFor?.(jobb));
    return Number.isFinite(n) && n >= 1 ? Math.min(5, Math.floor(n)) : 1;
  }
  function visningsMs(jobb) {
    if (root.VyraFireworks?.durationFor) return root.VyraFireworks.durationFor(jobb) + 200;
    let w = null;
    try { w = root.state?.widgets?.find(x => x.type === 'templateGiftFireworks') } catch (_) {}
    return Math.max(0, Number(w?.fwDuration) || 5) * 1000 + 200;
  }
  function startavstandMs(jobb) {
    const t = Number(root.VyraFireworks?.releaseFor?.(jobb));
    return Number.isFinite(t) && t > 0 ? t + MARGINAL_MS : visningsMs(jobb);
  }
  const tempoFor = vantande => vantande > KO_TRYCK ? Math.min(MAX_TEMPO, 1 + (vantande - KO_TRYCK) / KO_TRYCK) : 1;
  function avsandare(j) {
    if (!j || j.isAnonymous) return '';
    const k = j.userId || j.uniqueId || j.username;
    return k ? String(k) : '';
  }
  const antal = j => Math.max(1, Math.floor(Number(j.combo ?? j.repeatcount ?? j.count) || 1));
  function varde(j) {
    const v = Number(root.VyraFireworks?.vardeAv?.(j));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  }
  function slaIhop(a, b) {
    const va = varde(a), vb = varde(b);
    const ut = { ...((vb || 0) > (va || 0) ? b : a), id: a.id, combo: antal(a) + antal(b),
      sammanslagna: (a.sammanslagna || 1) + (b.sammanslagna || 1) };
    delete ut.repeatcount; delete ut.count;
    if (va !== undefined || vb !== undefined) { const s = (va || 0) + (vb || 0); ut.diamonds = s; ut.coins = s; delete ut.diamondCount; }
    return ut;
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
    while (ko.length && aktiva.size < filer(ko[0].jobb)) {
      if (nu() - ko[0].koad > MAX_ALDER_MS) {
        ko.shift(); forsenade += 1;
        try { root.console.warn(`[VYRA gift-fireworks] gåva äldre än ${MAX_ALDER_MS / 1000} s spelas inte (${forsenade} hittills)`) } catch (_) {}
        continue;
      }
      if (typeof root.triggerGiftFireworks !== 'function' || root.VyraFireworks?.capacityFor?.(ko[0].jobb) === false) {
        bokaForsok(); return;
      }
      const tempo = tempoFor(ko.length);
      const ursprung = ko.shift().jobb;
      const jobb = tempo > 1 ? { ...ursprung, __tempo: tempo } : ursprung;
      if (root.triggerGiftFireworks(jobb) === false) continue;
      const id = ++sekvens, g = generation;
      aktiva.set(id, root.setTimeout(() => klar(id, g), startavstandMs(jobb)));
    }
  }
  function koa(jobb) {
    if (ko.length >= KO_TRYCK) {
      const vem = avsandare(jobb), fore = vem && ko.find(p => avsandare(p.jobb) === vem);
      if (fore) { fore.jobb = slaIhop(fore.jobb, jobb); ihopslagna += 1; nasta(); return; }
    }
    if (ko.length >= NODBROMS) {
      kastade += 1;
      try { root.console.warn(`[VYRA gift-fireworks] kön är full (${NODBROMS}), kastade ${kastade} gåvor`) } catch (_) {}
      return;
    }
    ko.push({ jobb, koad: nu() }); nasta();
  }
  function glom() {
    generation += 1; ko.length = 0;
    for (const timer of aktiva.values()) root.clearTimeout(timer);
    aktiva.clear();
    if (forsok !== null) root.clearTimeout(forsok);
    forsok = null; kastade = 0; forsenade = 0; ihopslagna = 0;
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
    kastade: () => kastade, forsenade: () => forsenade, ihopslagna: () => ihopslagna,
    regler: Object.freeze({ KO_TRYCK, MAX_TEMPO, MAX_ALDER_MS }),
    nastaNu: () => { const id = aktiva.keys().next().value; if (id !== undefined) klar(id, generation); else nasta() },
    glom
  };
})(window);
