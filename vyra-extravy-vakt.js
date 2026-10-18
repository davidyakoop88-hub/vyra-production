(function () {
  'use strict';
  // Ett sent render() far inte skriva over en extra-vy (F08).
  //
  // ORSAKEN: studio.js ager `view`, och bara go() andrar den. Extra-vyerna (Action & Event,
  // LIVE-kontroll, Sound Alerts, Guide ...) ritas av sina egna moduler rakt in i #view/#title
  // och lamnar `view` orord — efter en omladdning alltsa 'home'. render() skriver alltid #view
  // och #title ur m[view], och flera moduler ropar pa det sent och oombedda:
  // account-profile.js (vyra-auth-ready + 500 ms), overview-premium.js, fan-level-50.js
  // (vyra-live-session + 300 ms), battle-mvp-session.js ... Resultatet: navet och brodsmulan sa
  // "Action & Event" medan rubriken och innehallet var Oversikt.
  //
  // VAKTEN: medan en [data-extra] i sidomenyn ar markerad ar #view extra-vyns, och ett render()
  // ritar ingenting. Det ar sakert eftersom ALLA vagar till en vanlig vy slacker extra-knapparna
  // FORE ritningen: go() i studio.js, layout-safe.js renderSafeLayout() och overlay-preview.js.
  // Ingen extra-vy anvander det globala render() for sitt eget innehall — live-control.js,
  // points-system.js, obs-client.js och action-simulator.js har var sin LOKAL render().
  //
  // YTTERST I KEDJAN: flera omslag fattar beslut fore det inre render() (layout-safe.js ritar
  // editorn nar view==='editor', overlay-preview.js Overlay-vyn nar view==='overlay'). Har
  // anvandaren gatt fran Layout till en extra-vy star `view` kvar pa 'editor', och en vakt langre
  // in hade aldrig natts. Darfor laggs vakten ytterst — nu, vid 'load' och vid varje klick pa en
  // extra-knapp, det enda sattet en extra-vy blir aktiv. Ar den redan ytterst gors ingenting.
  //
  // Overlay-laget (?overlay=1) har ingen sidomeny och ska inte ha nagon vakt alls.
  if (new URLSearchParams(location.search).has('overlay')) return;

  const extraAktiv = () => !!document.querySelector('aside [data-extra].active');

  function sakraYtterst() {
    if (typeof render !== 'function' || render.__vyraExtraVakt) return;
    const inre = render;
    const vakt = function () {
      if (extraAktiv()) return;
      return inre.apply(this, arguments);
    };
    vakt.__vyraExtraVakt = true;
    render = vakt;
  }

  sakraYtterst();
  if (document.readyState === 'complete') sakraYtterst();
  else addEventListener('load', sakraYtterst, { once: true });
  document.addEventListener('click', e => {
    if (e.target && e.target.closest && e.target.closest('aside [data-extra]')) sakraYtterst();
  }, true);

  window.VyraExtraVyVakt = { aktiv: extraAktiv, sakraYtterst };
})();
