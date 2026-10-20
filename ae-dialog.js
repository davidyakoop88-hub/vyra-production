(function () {
  'use strict';
  // Action & Event-dialogerna beter sig som dialoger (granskning 2026-10-17 F10 och F11).
  //
  // ORSAKEN: action-event.js och action-timers.js ritar sina dialoger som en vanlig <div class=
  // "ae-modal"> i #aeModal. Fokus lag kvar pa knappen bakom, tillganglighetstradet sag en
  // namnlos container, Tab vandrade ut i sidan bakom och Escape gjorde ingenting.
  //
  // LOSNINGEN ar ett lager ovanpa, inte en omskrivning av de tre dialogbyggarna: varje .ae-modal
  // som dyker upp efter ett klick far
  //   - role="dialog", aria-modal="true" och aria-labelledby mot sin rubrik (<h3>),
  //   - fokus pa forsta faltet (annars forsta knappen),
  //   - Tab och Shift+Tab som stannar inne i dialogen,
  //   - Escape som stanger via dialogens EGEN stangknapp ([data-close-ae]) — samma vag som
  //     Avbryt, sa ingen stangningslogik dupliceras. Har anvandaren andrat nagot fragar den forst,
  //     och svarar man nej star dialogen kvar orord,
  //   - fokus tillbaka till knappen som oppnade den nar dialogen forsvinner, oavsett om den
  //     stangdes, sparades eller sidan ritades om.
  //
  // Bara anvandarens egna inmatningar raknas som andringar (isTrusted): action-event.js fyller
  // namnfaltet automatiskt, och det ar inget som gar forlorat.
  //
  // Overlay-laget (?overlay=1) har inga dialoger och ska inte rora nagonting.
  if (new URLSearchParams(location.search).has('overlay')) return;

  const FOKUSBAR = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const FRAGA = 'Du har osparade ändringar. Vill du stänga utan att spara?';
  let lopnummer = 0;

  const fokusbara = modal => [...modal.querySelectorAll(FOKUSBAR)].filter(el => el.getClientRects().length > 0);
  const oppen = () => [...document.querySelectorAll('.ae-modal[data-ae-dialog]')].pop() || null;

  function aterstallFokus(info) {
    const mal = (info.oppnare && info.oppnare.isConnected && info.oppnare)
      || (info.oppnarId && document.getElementById(info.oppnarId))
      || document.getElementById('newAeAction');
    if (mal && typeof mal.focus === 'function') { try { mal.focus({ preventScroll: true }); } catch (_) { mal.focus(); } }
  }

  function forbered(modal, oppnare) {
    modal.dataset.aeDialog = '1';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const rubrik = modal.querySelector('header h3') || modal.querySelector('h3');
    if (rubrik) {
      if (!rubrik.id) rubrik.id = 'aeDialogRubrik' + (++lopnummer);
      modal.setAttribute('aria-labelledby', rubrik.id);
    }
    const info = { oppnare, oppnarId: oppnare && oppnare.id, andrad: false };
    modal._aeDialog = info;
    const markera = e => { if (e.isTrusted) info.andrad = true; };
    modal.addEventListener('input', markera);
    modal.addEventListener('change', markera);

    const lista = fokusbara(modal);
    const forsta = lista.find(el => el.matches('input,select,textarea')) || lista[0];
    if (forsta) { try { forsta.focus({ preventScroll: true }); } catch (_) { forsta.focus(); } }

    // Bevakningen lever bara medan dialogen ar oppen.
    const vakt = new MutationObserver(() => {
      if (modal.isConnected) return;
      vakt.disconnect();
      aterstallFokus(info);
    });
    vakt.observe(document.body, { childList: true, subtree: true });
  }

  // Dialogerna oppnas alltid av ett klick (Enter/mellanslag pa en knapp ar ocksa ett klick). Nar
  // klicket bubblat hit har knappens egen handler redan ritat dialogen.
  document.addEventListener('click', e => {
    if (e.target && e.target.closest && e.target.closest('.ae-modal')) return;
    const oppnare = e.target && e.target.closest ? e.target.closest('button,a,[tabindex]') : null;
    setTimeout(() => {
      document.querySelectorAll('.ae-modal:not([data-ae-dialog])').forEach(m => forbered(m, oppnare));
    }, 0);
  });

  document.addEventListener('keydown', e => {
    const modal = oppen();
    if (!modal || !modal.isConnected) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const info = modal._aeDialog || {};
      if (info.andrad && !window.confirm(FRAGA)) return;
      const stang = modal.querySelector('footer [data-close-ae]') || modal.querySelector('[data-close-ae]');
      if (stang) stang.click();
      return;
    }
    if (e.key !== 'Tab') return;
    const lista = fokusbara(modal);
    if (!lista.length) { e.preventDefault(); return; }
    const forsta = lista[0], sista = lista[lista.length - 1], aktiv = document.activeElement;
    if (!modal.contains(aktiv)) { e.preventDefault(); (e.shiftKey ? sista : forsta).focus(); return; }
    if (e.shiftKey && aktiv === forsta) { e.preventDefault(); sista.focus(); }
    else if (!e.shiftKey && aktiv === sista) { e.preventDefault(); forsta.focus(); }
  }, true);

  window.VyraAeDialog = { forbered };
})();
