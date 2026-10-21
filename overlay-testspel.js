// ▶ TESTA WIDGET AVEN I OBS - men BARA nar ingen sandning pagar (Davids beslut 2026-10-21).
//
// "Bara när du inte är live: före sändningen syns testet i OBS och TikTok LIVE Studio så du ser
// exakt hur det blir; under en pågående live spelas testet bara i studion och tittarna ser aldrig
// exempelnamn."
//
// STUDION (den har filen, utan ?overlay): nar ▶ Testa widget startar ett test i studion (motorn i
// vyra-testspel.js, oforandrad i editorn) fragar vi om en sandning pagar. Pagar en - eller gar det
// inte att veta - stannar testet i studion. Annars gar ett testbesked till servern
// (POST /api/workspaces/:id/testspel), som sjalv avgor om sandning pagar och bara da publicerar ett
// EGET meddelandeslag (`event: testspel`, server/goal-sse.js) till workspace-kanalen. ■ Stoppa (och
// varje annat stopp utom att testet spelat klart) skickar ett stoppbesked samma vag.
//
// OVERLAYN (?overlay=1): overlay-access.js gor om SSE-ramen till `vyra-testspel-overlay`. Har spelas
// samma test med motorns egen klon, vakter och tidslinje (VyraTestspel.spelaIOverlay) pa widgetens
// plats, med widgetens sparade installningar och motorns exempeldata. Den riktiga noden rors aldrig,
// sa efter testet ar widgeten tillbaka i sitt vanliga lage - dold tills en riktig handelse kommer.
//
// TESTET AR ALDRIG EN LIVEHANDELSE. Det gar inte genom ingest(), sparas inte i `vyra-live-event`,
// raknas inte i topplistor, mal, statistik eller koer, triggar inga Actions och aktiverar ingen
// widget (overlay-aktivering.js lyssnar bara pa livevagen). Motorns vakter stoppar dessutom varje
// forsok att na natet, lagringen eller koerna under uppspelningen.
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.VyraOverlayTestspel) return;
  const OVERLAY = new URLSearchParams(location.search).has('overlay');

  const TEXT_LIVE = 'Visas bara här – du är live';
  const TEXT_OBS = 'Visas även i OBS';

  function aktivSession() {
    try { return window.VyraLiveSession?.runtime?.().aktivSession() || null; } catch (_) { return null; }
  }

  // ---- OVERLAYN ---------------------------------------------------------------------------------
  if (OVERLAY) {
    let pagaende = null; // { widgetId, spelId }
    window.addEventListener('vyra-testspel-overlay', ev => {
      const d = ev && ev.detail;
      const T = window.VyraTestspel;
      if (!d || !T || typeof T.spelaIOverlay !== 'function') return;
      if (d.atgard === 'stoppa') {
        if (pagaende && pagaende.widgetId === d.widgetId) { pagaende = null; T.stoppaIOverlay('studion'); }
        return;
      }
      if (d.atgard !== 'spela') return;
      // Dubbel sakerhet: servern publicerar inte under en sandning, men vet overlayn sjalv att en
      // pagar spelas ingenting.
      if (aktivSession()) return;
      let w = null;
      try { w = (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets.find(x => x && String(x.id) === String(d.widgetId)) : null; } catch (_) { w = null; }
      // En lank utan widgeten gor ingenting; en dold widget forblir dold aven i ett test.
      if (!w || w.hidden) return;
      pagaende = { widgetId: w.id, spelId: d.spelId || null };
      if (!T.spelaIOverlay(w, d.typ || null)) pagaende = null;
    });
    window.VyraOverlayTestspel = { lage: 'overlay' };
    return;
  }

  // ---- STUDION ----------------------------------------------------------------------------------
  function arbetsyta() {
    try { return window.VyraAuth?.lastDetail?.()?.workspaces?.[0]?.id || null; } catch (_) { return null; }
  }
  // Klientens bild av laget. 'live' och 'okand' behandlas lika - bara studion. Servern ar domaren
  // for 'inte-live' (den svarar 409 om den vet battre).
  function lage() {
    if (aktivSession()) return 'live';
    let m = null;
    try { m = window.VyraLive?.tillstand?.() || null; } catch (_) { m = null; }
    if (m && (m.live === 'aktiv' || m.connector === 'ansluten' || m.connector === 'ansluter' || m.connector === 'pausad')) return 'live';
    if (m && m.lage === 'desktop') return 'okand';     // skrivbordsappens lokala overlay har ingen testvag
    return arbetsyta() ? 'fraga-servern' : 'okand';
  }

  function visaRad(widgetId, text) {
    document.querySelectorAll('[data-testspel]').forEach(rot => {
      if (rot.dataset.testspelWidget !== String(widgetId)) return;
      let rad = rot.querySelector('.pr-testspel-obs');
      if (!rad) {
        rad = document.createElement('p');
        rad.className = 'pr-testspel-obs';
        rad.setAttribute('role', 'status');
        rad.style.cssText = 'margin:6px 0 0;font-size:12px;opacity:.8';
        rot.append(rad);
      }
      if (rad.textContent !== text) rad.textContent = text;
    });
  }

  let skickat = null; // { widgetId, spelId } nar overlayn fatt ett spela-besked
  let bevakning = null;

  async function posta(kropp) {
    const id = arbetsyta();
    if (!id || !window.VyraAuth || typeof window.VyraAuth.api !== 'function') return { ok: false };
    try { const r = await window.VyraAuth.api(`/api/workspaces/${id}/testspel`, { method: 'POST', body: JSON.stringify(kropp) }); return r || { ok: false }; }
    catch (e) { return { ok: false, fel: e }; }
  }

  function stoppaIOverlay() {
    const s = skickat;
    skickat = null;
    if (s) posta({ atgard: 'stoppa', widgetId: String(s.widgetId), spelId: s.spelId });
  }

  function bevaka(widgetId) {
    if (bevakning) clearInterval(bevakning);
    bevakning = setInterval(() => {
      const T = window.VyraTestspel;
      const st = T && T.status ? T.status() : { aktiv: false };
      // En sandning som startar mitt i ett test: stoppa i OBS direkt.
      if (skickat && aktivSession()) stoppaIOverlay();
      if (st.aktiv && String(st.widget) === String(widgetId)) return;
      clearInterval(bevakning); bevakning = null;
      const orsak = st.senaste && st.senaste.orsak;
      // Spelat klart: overlayn har samma tidslinje och avslutar sjalv.
      if (orsak === 'klar') skickat = null; else stoppaIOverlay();
    }, 150);
  }

  async function efterStart(w) {
    if (!w) return;
    const wid = String(w.id);
    if (skickat) stoppaIOverlay();
    bevaka(wid);
    const l = lage();
    visaRad(wid, TEXT_LIVE);
    if (l !== 'fraga-servern') return;
    const T = window.VyraTestspel;
    const st = T.status();
    const spelId = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const kropp = { atgard: 'spela', widgetId: wid, typ: st.typ != null ? String(st.typ) : null, spelId };
    skickat = { widgetId: wid, spelId };
    const r = await posta(kropp);
    const fortfarande = T.status().aktiv && String(T.status().widget) === wid;
    if (r && r.ok) {
      if (fortfarande) visaRad(wid, TEXT_OBS);
      else if (skickat && skickat.spelId === spelId) stoppaIOverlay();
    } else if (skickat && skickat.spelId === spelId) {
      skickat = null;
    }
  }

  function koppla() {
    const T = window.VyraTestspel;
    if (!T || T.__obsKopplad) return !!T;
    T.__obsKopplad = true;
    const forra = T.spela;
    T.spela = function (w) {
      const ok = forra.apply(this, arguments);
      if (ok) { try { efterStart(w || (typeof liveWidget === 'function' && typeof selected !== 'undefined' ? liveWidget(selected) : null)); } catch (_) {} }
      return ok;
    };
    return true;
  }
  if (!koppla()) {
    let forsok = 0;
    const t = setInterval(() => { if (koppla() || ++forsok > 100) clearInterval(t); }, 100);
  }

  // Raden foljer med nar panelen ritas om under ett test.
  if (typeof bind === 'function') {
    const forraBind = bind;
    bind = function () {
      const r = forraBind.apply(this, arguments);
      try {
        const T = window.VyraTestspel, st = T && T.status && T.status();
        if (st && st.aktiv) visaRad(st.widget, skickat && String(skickat.widgetId) === String(st.widget) ? TEXT_OBS : TEXT_LIVE);
      } catch (_) {}
      return r;
    };
  }

  window.VyraOverlayTestspel = { lage, TEXT_LIVE, TEXT_OBS, skickat: () => skickat };
})();
