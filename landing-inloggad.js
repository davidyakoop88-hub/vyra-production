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

  // OKÄND ADRESS (granskning 2026-11-12, fynd 18). Webbservern svarar med index.html på varje
  // sökväg som saknar fil (`try_files {path} /index.html` i Caddyfile). Förut skickade den här
  // filen då en inloggad användare tyst vidare till studion, och en utloggad såg framsidan — ingen
  // av dem fick veta att adressen var fel. Framsidan bor bara på / och /index.html; allt annat
  // som hamnar här är en adress som inte finns. Inga interna länkar pekar på en sådan sökväg
  // (kontrollerat 2026-11-12). I produktion svarar Caddy numera själv med 404 och 404.html, så
  // den här vägen nås bara bakom servrar som fortfarande faller tillbaka på index.html
  // (server.ps1, provriggar) — reserven ser då ut som 404-sidan.
  if (!/^\/(index\.html)?$/.test(location.pathname) && location.protocol !== 'file:') {
    document.title = 'Sidan finns inte · VYRA';
    const robots = document.createElement('meta');
    robots.name = 'robots'; robots.content = 'noindex';
    document.head.append(robots);
    const visaSaknas = () => {
      const kort = document.createElement('main');
      kort.className = 'vyra-saknas';
      kort.setAttribute('role', 'main');
      kort.innerHTML = '<h1>Sidan finns inte</h1>'
        + '<p>Adressen <code></code> leder ingenstans. Kontrollera stavningen, eller gå vidare härifrån.</p>'
        + '<p><a class="vyra-saknas-primar" href="studio.html">Öppna studion</a> <a href="index.html?stanna=1">Till startsidan</a></p>';
      kort.querySelector('code').textContent = location.pathname;
      const stil = document.createElement('style');
      stil.textContent = '.vyra-saknas{max-width:520px;margin:18vh auto;padding:0 16px;font:16px/1.6 Inter,system-ui,sans-serif;color:#f7f2ff}'
        + '.vyra-saknas h1{font-size:32px;line-height:1.2;margin:0 0 12px}'
        + '.vyra-saknas p{color:#cfc3d5;margin:0 0 20px}'
        + '.vyra-saknas code{color:#f7f2ff;word-break:break-all}'
        + '.vyra-saknas a{display:inline-flex;align-items:center;min-height:44px;padding:0 18px;margin:0 8px 8px 0;border-radius:12px;border:1px solid rgba(173,91,255,.45);color:#f7f2ff;text-decoration:none;font-weight:600}'
        + '.vyra-saknas a.vyra-saknas-primar{background:linear-gradient(135deg,#8b3dff,#b43dff);border-color:transparent;color:#fff}'
        + '.vyra-saknas a:focus-visible{outline:2px solid #be5fff;outline-offset:2px}';
      document.head.append(stil);
      document.body.replaceChildren(kort);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', visaSaknas, { once: true });
    else visaSaknas();
    return;
  }

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
