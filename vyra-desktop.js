// Vagen till skrivbordsappen inifran Studion.
//
// Fore den har filen fanns ingen. Fyra stallen namnde VYRA Desktop — tva tomma tillstand
// ("Anslut VYRA Desktop sa visas riktiga TikTok-handelser"), guidens OBS-kort och guidens FAQ —
// och inget av dem var en lank. Enda mekanismen var studio.html?intent=download, och enda
// platsen som producerade den lanken var startmodalen pa landningssidan. En inloggad anvandare
// som last lofte om Desktop hade ingenstans att ga.
//
// VARFOR INTE download-client.js: den binder querySelectorAll('.desktop-download') EN gang i
// sin IIFE och laddas bara pa index.html. Studions vyer ritas om vid varje vybyte, sa en
// engangsbindning kan aldrig na dem. Har ar lyssnaren DELEGERAD pa document — da fungerar aven
// noder som skapas senare, vilket ar forutsattningen for att de tomma tillstanden ska kunna
// bara samma handling.
//
// VARFOR <a href> OCH INTE <button>: rutten svarar 302 till filen. En riktig lank gar att
// hogerklicka och spara, visar malet i statusraden, och fungerar om JavaScript fallerar. Den
// delegerade lyssnaren stoppar klicket bara nar anvandaren anda hade fatt 401/402/403.
//
// BUTIKSVAGEN (2026-09-03): den publicerade .exe-filen ar osignerad, och Windows SmartScreen
// varnar for den pa varje dator. Store-paketet signeras av Microsoft. Nar servern bar en
// storeUrl i metadatan (miljovariabeln DESKTOP_STORE_URL) pekar DARFOR varje [data-ladda-desktop]
// pa Microsofts produktsida i stallet for pa 302-rutten. Butikssidan ar publik, sa de tre
// grindarna (401/402/403) galler inte den — de galler .exe-rutten, som star kvar orord bredvid.
// Utan storeUrl ar allt exakt som forut.
(function () {
  'use strict';
  const root = window;
  const RUTT = '/api/downloads/windows';

  let metadata = null;      // { version, sizeBytes, ... } eller { fel: '...' }
  let hamtning = null;      // pagaende lofte, sa tre vybyten inte ger tre anrop
  // null = inget svar an. Grinden sager numera bade ja och nej, sa tystnad betyder verkligen
  // tystnad — och da far lanken sta oppen och servern avgora. Att neka pa okant lage hade gett
  // fel besked at alla under de forsta sekunderna.
  let behorig = null;

  addEventListener('vyra-entitlement-ok', e => {
    behorig = { ok: true, billing: e.detail && e.detail.billing };
  });
  addEventListener('vyra-entitlement-blocked', e => {
    behorig = { ok: false, billing: e.detail && e.detail.billing };
  });
  addEventListener('vyra-session-ended', () => { behorig = null });

  function megabyte(byte) {
    return Number.isFinite(byte) && byte > 0 ? Math.round(byte / 1048576) + ' MB' : null;
  }

  // Behorigheten speglar serverns tre grindar i server/index.js: session (401), verifierad
  // e-post (403), premium (402). Klienten vet redan alla tre, sa den kan saga skalet i stallet
  // for att skicka anvandaren till en sida med ra JSON.
  function kanLaddaNer() {
    const detalj = root.VyraAuth && root.VyraAuth.lastDetail && root.VyraAuth.lastDetail();
    const anvandare = detalj && detalj.user;
    if (!anvandare) {
      return { ok: false, skal: 'Logga in för att ladda ner VYRA Desktop.' };
    }
    if (anvandare.emailVerified === false || anvandare.email_verified_at === null) {
      return { ok: false, skal: 'Verifiera din e-post innan du laddar ner VYRA Desktop.' };
    }
    if (behorig && behorig.ok === false) {
      return { ok: false, skal: 'VYRA Premium krävs för att ladda ner VYRA Desktop.' };
    }
    return { ok: true };
  }

  function hamtaMetadata() {
    if (metadata) return Promise.resolve(metadata);
    if (hamtning) return hamtning;
    hamtning = fetch(RUTT + '?meta=1', { headers: { accept: 'application/json' } })
      .then(async svar => {
        const data = await svar.json().catch(() => ({}));
        if (!svar.ok || !data.ok) throw Error(data.error || 'Windows-installationen publiceras snart');
        return data;
      })
      .catch(err => ({ fel: err.message || 'Windows-installationen publiceras snart' }))
      .then(data => { metadata = data; hamtning = null; return data });
    return hamtning;
  }

  function besked(text) {
    if (typeof root.toast === 'function') { root.toast(text); return }
    const t = document.querySelector('.toast');
    if (!t) return;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(root._vyraToastTimer);
    root._vyraToastTimer = setTimeout(() => t.classList.remove('show'), 5000);
  }

  // Delegerad, i bubbelfas: en lyssnare i capture-fas hade kort fore sidans egna hanterare och
  // gjort ordningen svar att resonera om. Bubbelfasen racker — inget stoppar klicket pa vagen.
  document.addEventListener('click', e => {
    const el = e.target && e.target.closest && e.target.closest('[data-ladda-desktop]');
    if (!el) return;
    if (el.getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      besked((metadata && metadata.fel) || 'Windows-installationen publiceras snart');
      return;
    }
    if (el.hasAttribute('data-butik')) return;   // publik butikssida — ingen grind
    const svar = kanLaddaNer();
    if (svar.ok) return;             // lat lanken gora sitt jobb
    e.preventDefault();
    besked(svar.skal);
  });

  // ---- butiken: alla handlingar pekas om nar servern sager att den finns ---------------------
  // Guidens OBS-kort och de tomma tillstanden skapar egna [data-ladda-desktop] med 302-rutten som
  // href. De ska inte behova kanna till butiken — MutationObservern nedan kor rita() vid varje
  // omritning, och rita() pekar om det som fatt fel mal. Idempotent: en redan ompekad nod hoppas.
  function butiken(data) {
    return data && !data.fel && typeof data.storeUrl === 'string' &&
      /^https:\/\/apps\.microsoft\.com\//.test(data.storeUrl) ? data.storeUrl : null;
  }
  function pekaOm() {
    const mal = butiken(metadata);
    if (!mal) return;
    document.querySelectorAll('[data-ladda-desktop]:not([data-butik])').forEach(el => {
      el.setAttribute('href', mal);
      el.setAttribute('data-butik', '');
      el.removeAttribute('aria-disabled');
    });
  }

  // ---- raden i Installningar ---------------------------------------------------------------
  // Samma monster som auth-security.js addPrivacySettings(): MutationObserver pa
  // documentElement plus en idempotensvakt. Vyn ritas om av studio.js go(), och ett statiskt
  // skript kan inte lagga sig ytterst i den kedjan (tech-debt-kandidat §9).
  function ritaInstallningsrad() {
    const sida = document.querySelector('.settings-page');
    if (!sida || sida.querySelector('[data-desktop-nedladdning]')) return;

    const box = document.createElement('section');
    box.className = 'desktop-nedladdning';
    box.setAttribute('data-desktop-nedladdning', '');
    box.innerHTML =
      '<header><div><b>VYRA Desktop</b>' +
      '<small data-desktop-info>Hämtar versionsinformation…</small></div></header>' +
      '<a class="desktop-nedladdning-knapp" data-ladda-desktop href="' + RUTT + '"' +
      ' aria-disabled="true">Ladda ner för Windows</a>';
    sida.append(box);

    hamtaMetadata().then(data => {
      // Vyn kan ha bytts under hamtningen. Sok pa nytt i stallet for att skriva till en nod
      // som inte langre sitter i dokumentet.
      const info = document.querySelector('[data-desktop-nedladdning] [data-desktop-info]');
      const knapp = document.querySelector('[data-desktop-nedladdning] [data-ladda-desktop]');
      if (!info || !knapp) return;
      if (data.fel) {
        // Bara texten. Knappen FODS inaktiv i markupen ovan och blir aktiv forst nar metadata
        // kommit fram, sa ett setAttribute har hade satt ett attribut som redan ar satt. Det
        // stod har tills ett mutationsprov overlevde: att ta bort raden andrade ingenting i
        // nagot nabart lage, vilket ar definitionen av dod kod.
        info.textContent = data.fel;
        return;
      }
      const storlek = megabyte(data.sizeBytes);
      if (butiken(data)) {
        info.textContent = 'Version ' + data.version + ' · ' + (data.platform || 'Windows 10/11') +
          ' · Microsoft Store · signerad av Microsoft · behövs för OBS-scenstyrning';
        knapp.textContent = 'Hämta i Microsoft Store';
        pekaOm();
        return;
      }
      info.textContent = 'Version ' + data.version + ' · ' + (data.platform || 'Windows 10/11') +
        (storlek ? ' · ' + storlek : '') + ' · behövs för OBS-scenstyrning';
      knapp.removeAttribute('aria-disabled');
    });
  }

  // ---- knappen i sidhuvudet -----------------------------------------------------------------
  // Raden i Installningar ar den utforliga hemvisten, men den som PRECIS loggat in ska inte
  // behova leta i menyn for att hitta skrivbordsappen. Darfor ocksa en plats hogst upp.
  //
  // Det ar samtidigt skalet att de tomma tillstanden INTE far var sin nedladdningsknapp: da
  // hade "Ladda ner VYRA Desktop" statt pa fem stallen, tva av dem bredvid varandra i
  // Statistik-vyn. En plats hogt upp slar fem utspridda.
  function ritaSidhuvud() {
    const rad = document.querySelector('header .head-actions');
    if (!rad || rad.querySelector('[data-ladda-desktop]')) return;

    const el = document.createElement('a');
    el.className = 'head-desktop';
    el.setAttribute('data-ladda-desktop', '');
    el.setAttribute('href', RUTT);
    el.setAttribute('aria-disabled', 'true');
    el.textContent = '⬇ VYRA Desktop';
    // Fore Fargschema: nedrakningen fran #174 lagger sig forst i raden, sa ordningen blir
    // provperiod, nedladdning, fargschema, anslut.
    const fore = rad.querySelector('#openBrandKit');
    if (fore) rad.insertBefore(el, fore); else rad.prepend(el);

    hamtaMetadata().then(data => {
      const knapp = document.querySelector('header .head-actions [data-ladda-desktop]');
      if (!knapp) return;
      if (data.fel) { knapp.title = data.fel; return }
      const storlek = megabyte(data.sizeBytes);
      // Versionen far inte plats i sidhuvudet men ska ga att se — den bor i verktygstipset.
      if (butiken(data)) {
        knapp.title = 'VYRA Desktop ' + data.version + ' · Microsoft Store · signerad av Microsoft';
        pekaOm();
        return;
      }
      knapp.title = 'VYRA Desktop ' + data.version + (storlek ? ' · ' + storlek : '') +
        ' · behövs för OBS-scenstyrning';
      knapp.removeAttribute('aria-disabled');
    });
  }

  function rita() { ritaInstallningsrad(); ritaSidhuvud(); pekaOm() }

  new MutationObserver(rita).observe(document.documentElement,
    { childList: true, subtree: true });
  rita();

  root.VyraDesktop = { kanLaddaNer, hamtaMetadata, butiken, RUTT };
})();
