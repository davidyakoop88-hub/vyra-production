/* Heart Fireworks live-väg. Samma mönster som gift-fireworks-session.js: egen kö skild från den
   delade serie-kön, matas av routeLiveBattleEvent. Dubblettspärren på event-id ligger i triggern
   (heart-fireworks.js).

   ETT I TAGET (användarens beslut 2026-10-18). Tidigare spelade tre gåvor samtidigt (SAMTIDIGA = 3)
   och varje plats hölls hela visningstiden (hfDuration + 400 ms). Alla hjärtan ritas på SAMMA duk,
   så tre samtidiga syntes som en hög hjärtan ovanpå varandra. Nu gäller samma regler som för
   Gift Fireworks:

   1. Ett fyrverkeri i taget. Heart Fireworks har inget reglage för fler.
   2. Nästa startar när det förra når sin TOPP (VyraHeartFireworksFx.toppFor), räknad ur fire()-
      tidslinjen i heart-fireworks.js: sista hjärtraketens uppskjutning + flygtid + utslag. En gåva
      ger 1,9 s, tolv hjärtan eller fler 3,7 s. Det förra tonar ut medan nästa raket stiger.
   3. Kön trycks ihop när den blir lång (mer än KO_TRYCK väntande):
      a. samma avsändares väntande gåvor slås ihop till EN, med summerat antal och värde;
      b. tempot höjs för gåvan som startar: 1 + (väntande - 5) / 5, högst 2;
      c. en gåva som väntat längre än MAX_ALDER_MS spelas inte alls. */
(function (root) {
  'use strict';
  const TYPER = new Set(['gift', 'gift_combo', 'giftcombo']);
  const NODBROMS = 200, SAMTIDIGA = 1;
  const KO_TRYCK = 5, MAX_TEMPO = 2, MAX_ALDER_MS = 60000, MARGINAL_MS = 100;
  const ko = [], aktiva = new Map();
  let generation = 0, sekvens = 0, forsok = null, kastade = 0, forsenade = 0, ihopslagna = 0;
  const nu = () => Date.now();
  function visningsMs() {
    let w = null;
    try { w = root.state?.widgets?.find(x => x.type === 'templateHeartFireworks') } catch (_) {}
    return Math.max(2, Number(w?.hfDuration) || 6) * 1000 + 400;
  }
  function startavstandMs(jobb) {
    const t = Number(root.VyraHeartFireworksFx?.toppFor?.(jobb));
    return Number.isFinite(t) && t > 0 ? t + MARGINAL_MS : visningsMs();
  }
  const tempoFor = vantande => vantande > KO_TRYCK ? Math.min(MAX_TEMPO, 1 + (vantande - KO_TRYCK) / KO_TRYCK) : 1;
  function avsandare(j) {
    if (!j || j.isAnonymous) return '';
    const k = j.userId || j.uniqueId || j.username;
    return k ? String(k) : '';
  }
  const antal = j => Math.max(1, Math.floor(Number(j.combo ?? j.repeatcount ?? j.count) || 1));
  function varde(j) {
    const v = Number(root.VyraHeartFireworksFx?.vardeAv?.(j));
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
    while (aktiva.size < SAMTIDIGA && ko.length) {
      if (nu() - ko[0].koad > MAX_ALDER_MS) {
        ko.shift(); forsenade += 1;
        try { root.console.warn(`[VYRA heart-fireworks] gåva äldre än ${MAX_ALDER_MS / 1000} s spelas inte (${forsenade} hittills)`) } catch (_) {}
        continue;
      }
      if (typeof root.triggerHeartFireworks !== 'function') { bokaForsok(); return; }
      const tempo = tempoFor(ko.length);
      const ursprung = ko.shift().jobb;
      const jobb = tempo > 1 ? { ...ursprung, __tempo: tempo } : ursprung;
      if (root.triggerHeartFireworks(jobb) === false) continue;
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
      try { root.console.warn(`[VYRA heart-fireworks] kön är full (${NODBROMS}), kastade ${kastade} gåvor`) } catch (_) {}
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
  root.VyraSessionState?.registerTeardown?.('heart-fireworks-session', glom);
  root.VyraHeartFireworks = {
    koLangd: () => ko.length, spelar: () => aktiva.size > 0, aktiva: () => aktiva.size,
    kastade: () => kastade, forsenade: () => forsenade, ihopslagna: () => ihopslagna,
    regler: Object.freeze({ SAMTIDIGA, KO_TRYCK, MAX_TEMPO, MAX_ALDER_MS }),
    nastaNu: () => { const id = aktiva.keys().next().value; if (id !== undefined) klar(id, generation); else nasta() },
    glom
  };
})(window);
