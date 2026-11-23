// EGEN SPOTIFY-APP PÅ SPOTIFY-SIDAN (David 2026-11-23: "bygg att alla kan ansluta sig").
//
// VYRA:s Spotify-app står i Spotifys utvecklarläge: Spotify släpper bara in fem konton som lagts till
// för hand, och utökad åtkomst kräver ett registrerat företag med 250 000 aktiva användare i månaden.
// En kund som inte står i listan fick "Inte ansluten" och kom aldrig vidare.
//
// Den här filen lägger en guide under Anslut-raden på Spotify-sidan: skapa en gratis app på
// developer.spotify.com, klistra in dess Client ID, anslut. Då loggar kunden in genom sin egen app,
// där hen själv är användaren, och VYRA:s tak gäller inte. Själva kedjan (inloggning, kodutbyte,
// förnyelse med rätt app) bor i spotify-client.js — här finns bara ytan.
//
// Guiden är hopfälld tills den behövs. Den fälls ut av sig själv när Spotify säger att kontot inte är
// tillagt, och den visar vilken app som används när kunden har en egen.
//
// Spotify-sidan ritas av extras.js med innerHTML på #view, så en observatör lägger tillbaka guiden
// varje gång sidan ritas om — samma mönster som spotify-kommandon.js. studio.js rörs aldrig.
(function (root) {
  'use strict';

  var doc = root.document;
  if (!doc || /[?&]overlay=1/.test(root.location && root.location.search || '')) return;

  var REDIRECTS = ['https://vyralive.app/spotify-callback.html', 'http://127.0.0.1:4173/spotify-callback.html'];
  var DASHBOARD = 'https://developer.spotify.com/dashboard';

  function spotify() { return root.VyraSpotify; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(t) { if (typeof root.toast === 'function') root.toast(t); }

  function html() {
    var s = spotify(), eget = s && s.egetClientId ? s.egetClientId() : '';
    var rubrik = eget
      ? '<span>Ansluter via din egen Spotify-app</span> <code>…' + esc(eget.slice(-4)) + '</code>'
      : 'Kan du inte ansluta? Använd din egen Spotify-app';
    return '<details class="spe"' + ' data-spotify-eget>' +
      '<summary><span class="spe-rubrik">' + rubrik + '</span><i aria-hidden="true">⌄</i></summary>' +
      '<div class="spe-kropp">' +
        '<p class="spe-ingress">Spotify släpper bara in ett fåtal konton genom VYRA:s app. Med en egen gratis app ansluter du ditt konto direkt. Det tar ett par minuter och görs en gång.</p>' +
        '<a class="spe-lank spe-bilder" href="spotify-hjalp.html" target="_blank" rel="noopener">Visa steg för steg med bilder</a>' +
        '<ol class="spe-steg">' +
          '<li><b>Skapa appen</b><span>Logga in på Spotifys utvecklarsida med ditt Spotify-konto och tryck ”Create app”. Namn och beskrivning väljer du själv.</span>' +
            '<a class="spe-lank" href="' + DASHBOARD + '" target="_blank" rel="noopener">developer.spotify.com/dashboard</a></li>' +
          '<li><b>Lägg till adresserna</b><span>Klistra in båda under ”Redirect URIs” och tryck ”Add” efter varje. Kryssa i ”Web API”, godkänn villkoren och spara.</span>' +
            REDIRECTS.map(function (u) { return '<span class="spe-adress"><code>' + esc(u) + '</code><button type="button" data-spe-kopiera="' + esc(u) + '">Kopiera</button></span>'; }).join('') +
          '</li>' +
          '<li><b>Släpp in ditt konto</b><span>Öppna fliken ”User Management” i appen och lägg till ditt namn och e-postadressen till ditt Spotify-konto.</span></li>' +
          '<li><b>Klistra in Client ID</b><span>Öppna appen. ”Client ID” står överst under ”Basic Information”. Kopiera det och klistra in det här.</span></li>' +
        '</ol>' +
        '<div class="spe-rad">' +
          '<input type="text" inputmode="text" autocomplete="off" spellcheck="false" maxlength="64" placeholder="Client ID, 32 tecken" aria-label="Client ID från din Spotify-app" value="' + esc(eget) + '" data-spe-id>' +
          '<button type="button" class="spe-spara" data-spe-spara>Spara och anslut</button>' +
          (eget ? '<button type="button" data-spe-aterstall>Använd VYRA:s app</button>' : '') +
        '</div>' +
        '<small class="spe-fel" data-spe-fel role="alert"></small>' +
        '<small class="spe-not">Spotify Premium krävs för att VYRA ska kunna spela och köa låtar.</small>' +
      '</div></details>';
  }

  function bind(el) {
    el.querySelectorAll('[data-spe-kopiera]').forEach(function (b) {
      b.onclick = function () {
        var text = b.getAttribute('data-spe-kopiera');
        var klar = function () { b.textContent = 'Kopierad'; setTimeout(function () { b.textContent = 'Kopiera'; }, 1500); };
        try { root.navigator.clipboard.writeText(text).then(klar, function () { toast(text); }); } catch (e) { toast(text); }
      };
    });
    var falt = el.querySelector('[data-spe-id]'), fel = el.querySelector('[data-spe-fel]');
    el.querySelector('[data-spe-spara]').onclick = async function () {
      fel.textContent = '';
      var s = spotify();
      if (!s || !s.setClientId) return;
      try {
        var id = s.setClientId(falt.value);
        if (!id) { fel.textContent = 'Klistra in Client ID från din Spotify-app först.'; return; }
        root.dispatchEvent(new root.CustomEvent('vyra:spotify-changed'));
        await s.connect();
      } catch (e) { fel.textContent = (e && e.message) || 'Spotify kunde inte anslutas'; }
    };
    falt.onkeydown = function (e) { if (e.key === 'Enter') el.querySelector('[data-spe-spara]').click(); };
    var aterstall = el.querySelector('[data-spe-aterstall]');
    if (aterstall) aterstall.onclick = function () {
      spotify().setClientId('');
      toast('VYRA:s Spotify-app används igen');
      root.dispatchEvent(new root.CustomEvent('vyra:spotify-changed'));
      rita(true);
    };
  }

  function rita(tvinga) {
    var kort = doc.querySelector('.spotify-card');
    var rad = kort && kort.querySelector('.spotify-connect');
    if (!rad || !spotify()) return;
    var fanns = kort.querySelector('[data-spotify-eget]');
    if (fanns && !tvinga) return;
    var oppen = fanns && fanns.open;
    var mall = doc.createElement('div');
    mall.innerHTML = html();
    var ny = mall.firstChild;
    if (oppen) ny.open = true;
    if (fanns) fanns.replaceWith(ny); else rad.insertAdjacentElement('afterend', ny);
    bind(ny);
    folj();
  }

  // Säger Spotify att kontot inte är tillagt fälls guiden ut, för det är precis det den löser.
  var statusVakt = null;
  function folj() {
    var status = doc.querySelector('#spotifyStatus');
    if (!status || (statusVakt && statusVakt.el === status)) return;
    if (statusVakt) statusVakt.obs.disconnect();
    var kolla = function () {
      var guide = doc.querySelector('[data-spotify-eget]');
      if (guide && /egen Spotify-app|inte tillagt/i.test(status.textContent || '')) guide.open = true;
    };
    var obs = new root.MutationObserver(kolla);
    obs.observe(status, { childList: true, characterData: true, subtree: true });
    statusVakt = { el: status, obs: obs };
    kolla();
  }

  function stil() {
    if (doc.querySelector('#spotify-eget-stil')) return;
    var st = doc.createElement('style');
    st.id = 'spotify-eget-stil';
    st.textContent = [
      '.spotify-card .spe{margin:12px 0 4px;border:1px solid var(--border-subtle,#ffffff1f);border-radius:12px;background:var(--surface-1,#ffffff06)}',
      '.spotify-card .spe summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 14px;cursor:pointer;list-style:none;font-size:13px;color:var(--text-secondary,#c9bfd6)}',
      '.spotify-card .spe summary::-webkit-details-marker{display:none}',
      '.spotify-card .spe summary:hover{color:var(--text-primary,#f4eefa)}',
      '.spotify-card .spe summary i{font-style:normal;opacity:.6;transition:transform .2s ease}',
      '.spotify-card .spe[open] summary i{transform:rotate(180deg)}',
      '.spotify-card .spe summary code,.spotify-card .spe-adress code{font-size:12px;color:#1ed760}',
      '.spotify-card .spe-kropp{display:flex;flex-direction:column;gap:10px;padding:0 14px 14px;font-size:13px;line-height:1.5;color:var(--text-secondary,#c9bfd6)}',
      '.spotify-card .spe-ingress{margin:0}',
      '.spotify-card .spe-steg{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:10px}',
      '.spotify-card .spe-steg li>b,.spotify-card .spe-steg li>span:not(.spe-adress),.spotify-card .spe-lank{display:block}',
      '.spotify-card .spe-steg b{color:var(--text-primary,#f4eefa);font-weight:600}',
      '.spotify-card .spe-lank{margin-top:4px;width:max-content}',
      '.spotify-card .spe-steg a{color:#1ed760}',
      '.spotify-card .spe-adress{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px}',
      '.spotify-card .spe-adress code{padding:4px 8px;border-radius:6px;background:var(--surface-2,#ffffff0d);word-break:break-all}',
      '.spotify-card .spe button{font:inherit;font-size:12px;color:var(--text-primary,#f4eefa);background:var(--surface-2,#ffffff12);border:1px solid var(--border-subtle,#ffffff22);border-radius:8px;padding:6px 10px;cursor:pointer}',
      '.spotify-card .spe button:hover{border-color:#1db954}',
      '.spotify-card .spe .spe-spara{background:#1db954;border-color:#1db954;color:#06150b;font-weight:700}',
      '.spotify-card .spe-rad{display:flex;flex-wrap:wrap;gap:8px}',
      '.spotify-card .spe-rad input{flex:1 1 240px;min-width:0;font:inherit;font-size:13px;font-family:ui-monospace,Consolas,monospace;color:var(--text-primary,#f4eefa);background:var(--surface-2,#ffffff12);border:1px solid var(--border-subtle,#ffffff22);border-radius:8px;padding:8px 10px}',
      '.spotify-card .spe-fel{color:#ff8ea0}',
      '.spotify-card .spe-fel:empty{display:none}',
      '.spotify-card .spe-not{opacity:.7}'
    ].join('\n');
    doc.head.appendChild(st);
  }

  function start() {
    stil();
    rita();
    try { new root.MutationObserver(function () { rita(); }).observe(doc.querySelector('#view') || doc.documentElement, { childList: true, subtree: true }); } catch (e) {}
    root.addEventListener('vyra:spotify-changed', function () { if (doc.querySelector('[data-spotify-eget]')) rita(true); });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : this);
