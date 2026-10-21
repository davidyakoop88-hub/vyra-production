// landing-inloggad.js — redan inloggad? Då går framsidan direkt till studion.
//
// Davids beslut 2026-10-21: "När du redan är inloggad och öppnar framsidan → gå direkt till
// studion." Den som har en giltig, FÄRDIGVERIFIERAD session ska aldrig behöva se inloggningskortet.
// Alla andra ser framsidan exakt som förut.
//
// Laddas SYNKRONT i <head>, direkt efter styles.css, så att klassen hinner sättas innan sidan
// målas — annars blinkar framsidan fram och försvinner. Under kontrollen döljs sidan
// (html.vyra-kollar-session i styles.css), men aldrig längre än TIDSGRANS_MS: en långsam eller
// nere server får inte låsa framsidan.
//
// Reglerna:
//   · Bara 200 från GET /api/auth/me med en användare skickar vidare. 401 (inte inloggad), 403
//     (session som väntar på tvåstegskoden), 5xx och nätfel lämnar framsidan som den är.
//   · ?stanna=1 betyder "jag vill till framsidan" — då kontrolleras ingenting.
//   · Ingen kontodata läses eller ritas här. Svarets CSRF-token sparas på samma ställe som
//     auth-client.js gör, eftersom /api/auth/me roterar den (annars blir fliken skrivoförmögen).
(function () {
  'use strict';
  const TIDSGRANS_MS = 1500;
  const rot = document.documentElement;
  let params;
  try { params = new URLSearchParams(location.search) } catch (_) { return }
  if (params.has('stanna') || location.protocol === 'file:' || typeof fetch !== 'function') return;

  let klar = false;
  function visa() {
    if (klar) return;
    klar = true;
    rot.classList.remove('vyra-kollar-session');
  }
  rot.classList.add('vyra-kollar-session');
  // Bakåtknappen kan återställa sidan ur bfcache med klassen kvar — då ska den synas direkt.
  addEventListener('pageshow', e => { if (e.persisted) { klar = true; rot.classList.remove('vyra-kollar-session') } });
  const timer = setTimeout(visa, TIDSGRANS_MS);
  const avbryt = typeof AbortController === 'function' ? new AbortController() : null;
  setTimeout(() => { if (avbryt) avbryt.abort() }, TIDSGRANS_MS);

  fetch('/api/auth/me', { credentials: 'include', cache: 'no-store', signal: avbryt ? avbryt.signal : undefined })
    .then(r => r.json().catch(() => null).then(d => ({ r, d })))
    .then(({ r, d }) => {
      if (d && d.csrfToken) { try { sessionStorage.setItem('vyra-csrf', d.csrfToken) } catch (_) { /* privat läge */ } }
      if (klar) return;   // tidsgränsen hann först — sidan visas redan, flytta inte användaren
      if (r.status === 200 && d && d.ok && d.user && !d.mfaRequired) {
        clearTimeout(timer);
        klar = true;      // sidan förblir dold fram till bytet
        location.replace('studio.html');
        return;
      }
      clearTimeout(timer);
      visa();
    })
    .catch(() => { clearTimeout(timer); visa() });
})();
