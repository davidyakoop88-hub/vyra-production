(function () {
  'use strict';
  // Trial-onboarding (Etapp 6D).
  //
  // Fas B matte forsta-motet efter "Starta 3 dagar gratis": klicket lamnar Vyra for Stripe
  // Checkout och kommer tillbaka till studio.html?billing=success — och INGENTING lasste den
  // parametern. Man landade pa en sida som laddade som vanligt, utan ett ord om att provperioden
  // borjat och utan nagon nedrakning nagonstans i UI:t.
  //
  // MONTERAS PA vyra-entitlement-ok. Handelsen avfyras redan av entitlement-gate.js nar planen ar
  // giltig, och ingen lyssnade pa den. Den ar ratt tajmad: dess detalj bar bade anvandaren och
  // faktureringsuppgifterna, och den kommer efter att grinden slappt igenom.
  //
  // TIDEN LASES UR trial_end, inte current_period_end. Uppmatt ur Stripes OpenAPI-spec:
  // current_period_end finns inte langre pa subscription-objektet, och periodslutet sammanfaller
  // med provperiodens slut bara genom en outtalad slutledning. trial_end ar det falt Stripe
  // uttryckligen definierar som "the end of that trial" (PR 173).
  //
  // INGENTING HAR GAR GENOM save(). Onboarding ar en vyinstallning; ginge den genom
  // skrivmonopolet hade varje stangd valkomst blivit ett angra-steg. Samma separation som zoom
  // och H-faltets visningsvarde.

  const VALKOMNAD = 'vyra-trial-welcomed';
  const UPPSKJUTEN = 'vyra-trial-prompt-uppskjuten';
  const SISTA_DYGNET = 24 * 3600 * 1000;

  const las = (lager, nyckel) => { try { return lager.getItem(nyckel) } catch (_) { return null } };
  const skriv = (lager, nyckel, v) => { try { lager.setItem(nyckel, v) } catch (_) {} };

  let senaste = null;

  function tidKvar(sub) {
    const slut = sub && sub.trial_end ? Date.parse(sub.trial_end) : NaN;
    if (!Number.isFinite(slut)) return null;
    return slut - Date.now();
  }
  const underProvperiod = billing =>
    !!billing && billing.subscription && billing.subscription.status === 'trialing' &&
    tidKvar(billing.subscription) !== null;

  // Dagar KVAR, uppat: med 71 timmar kvar ar det "3 dagar", inte "2,96". Under ett dygn ar
  // dagrakningen missvisande — da sags det rakt ut i stallet.
  function dagarKvar(ms) { return Math.max(0, Math.ceil(ms / (24 * 3600 * 1000))) }

  const DATUM = ms => new Date(ms).toLocaleDateString('sv-SE',
    { day: 'numeric', month: 'long', year: 'numeric' });

  function riv(valjare) { document.querySelector(valjare)?.remove() }

  // ---- valkomsten ------------------------------------------------------------------------------
  function visaValkomst(billing) {
    const params = new URLSearchParams(location.search);
    if (!params.has('billing')) return;
    if (las(localStorage, VALKOMNAD)) return;
    if (document.querySelector('[data-trial-valkomst]')) return;
    const kvar = tidKvar(billing.subscription);
    if (kvar === null) return;

    const el = document.createElement('div');
    el.className = 'trial-modal';
    el.setAttribute('data-trial-valkomst', '');
    el.setAttribute('role', 'dialog');
    el.innerHTML =
      '<section>' +
      '<div class="auth-brand"><i>V</i><b>VYRA</b></div>' +
      '<small>PROVPERIODEN HAR STARTAT</small>' +
      '<h1>Du har tre dagar på dig</h1>' +
      '<p>Allt i VYRA är öppet fram till <b></b>. Sedan förnyas Premium automatiskt för ' +
      '15 USD per månad, och du kan säga upp när som helst.</p>' +
      '<button class="primary" type="button" data-trial-start>Kom igång</button>' +
      '</section>';
    el.querySelector('p b').textContent = DATUM(Date.now() + kvar);
    el.querySelector('[data-trial-start]').onclick = () => {
      skriv(localStorage, VALKOMNAD, String(Date.now()));
      riv('[data-trial-valkomst]');
    };
    document.body.append(el);
  }

  // ---- nedrakningen ----------------------------------------------------------------------------
  function ritaNedrakning(billing) {
    if (!underProvperiod(billing)) { riv('[data-trial-nedrakning]'); return }
    const kvar = tidKvar(billing.subscription);
    // .head-actions ar knappraden till hoger i sidhuvudet, dar "Anslut TikTok" redan sager status.
    // Forsta forsoket sokte .actions, som inte finns — reserven lat den landa langst till vanster i
    // headern och det sag avsiktligt ut. Reserven ar kvar, men bara som reserv.
    const vard = document.querySelector('header .head-actions') || document.querySelector('header');
    if (!vard) return;

    let el = document.querySelector('[data-trial-nedrakning]');
    if (!el) {
      el = document.createElement('span');
      el.className = 'trial-nedrakning';
      vard.prepend(el);
    }
    const dagar = dagarKvar(kvar);
    const sista = kvar <= SISTA_DYGNET;
    el.dataset.trialNedrakning = String(dagar);
    el.classList.toggle('brattom', sista);
    const text = sista
      ? 'Provperioden · sista dagen'
      : `Provperioden · ${dagar} ${dagar === 1 ? 'dag' : 'dagar'} kvar`;
    if (el.textContent !== text) el.textContent = text;
    el.title = 'Provperioden slutar ' + DATUM(Date.now() + kvar);
  }

  // ---- konverteringsprompten -------------------------------------------------------------------
  function visaPrompt(billing) {
    if (!underProvperiod(billing)) { riv('[data-trial-prompt]'); return }
    const kvar = tidKvar(billing.subscription);
    if (kvar > SISTA_DYGNET) { riv('[data-trial-prompt]'); return }
    // sessionStorage, inte localStorage: sista dygnet ar precis nar pamminnelsen behovs, och ett
    // permanent bortval hade tystat den nar den betyder som mest.
    if (las(sessionStorage, UPPSKJUTEN)) return;
    if (document.querySelector('[data-trial-prompt]')) return;

    const el = document.createElement('div');
    el.className = 'trial-prompt';
    el.setAttribute('data-trial-prompt', '');
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<b>Provperioden slutar imorgon.</b>' +
      '<span>Dina overlays och inställningar är sparade. Aktivera Premium så fortsätter allt ' +
      'som vanligt.</span>' +
      '<button class="primary" type="button" data-trial-aktivera>Aktivera nu</button>' +
      '<button type="button" data-trial-senare>Påminn senare</button>';
    el.querySelector('[data-trial-senare]').onclick = () => {
      skriv(sessionStorage, UPPSKJUTEN, '1');
      riv('[data-trial-prompt]');
    };
    el.querySelector('[data-trial-aktivera]').onclick = () => {
      // Betalvagen ags av billing-client.js. Att duplicera checkout-anropet har hade gett tva
      // stallen som kan komma isar.
      if (window.VyraBilling && typeof window.VyraBilling.open === 'function') window.VyraBilling.open();
      else document.querySelector('[data-open-billing], .billing-open')?.click();
    };
    document.body.append(el);
  }

  function rita(billing) {
    if (!billing) return;
    senaste = billing;
    visaValkomst(billing);
    ritaNedrakning(billing);
    visaPrompt(billing);
  }

  addEventListener('vyra-entitlement-ok', e => rita(e.detail && e.detail.billing));
  addEventListener('vyra-session-ended', () => {
    senaste = null;
    for (const v of ['[data-trial-valkomst]', '[data-trial-nedrakning]', '[data-trial-prompt]']) riv(v);
  });

  // Nedrakningen ritas om varje minut: en sida som star oppen over midnatt ska inte pasta att det
  // ar tre dagar kvar nar det ar tva. Rendern byter ut headern, sa den maste ocksa ritas om da.
  setInterval(() => { if (senaste) ritaNedrakning(senaste) }, 60000);
  const vyRot = document.getElementById('view');
  if (vyRot) new MutationObserver(() => { if (senaste) ritaNedrakning(senaste) })
    .observe(vyRot, { childList: true, subtree: true });

  window.VyraTrialOnboarding = { dagarKvar, tidKvar, underProvperiod, rita };
})();
