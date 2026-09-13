// Vagen till appen FRAN FRAMSIDAN — for den som inte ar inloggad.
//
// Fore den har filen fanns ingen publik vag alls. [data-ladda-desktop] bor i vyra-desktop.js och
// laddas bara av studio.html, sa enda satten att na appen var att forst skapa konto och logga in.
// Samtidigt lovade trust-raden "Vanlig .exe-installation", vilket slutade vara sant nar leveransen
// flyttade till Microsoft Store (den publicerade .exe-filen ar osignerad och SmartScreen varnar
// for den pa varje dator; Store-paketet signeras av Microsoft).
//
// VARFOR INTE vyra-desktop.js HAR: den filen ar byggd for Studion. Den vantar pa
// vyra-entitlement-ok/-blocked for att veta om lanken far vara oppen, och de handelserna fyras
// aldrig pa index.html — lanken hade blivit permanent stangd. Har behovs ingen grind alls:
// butikssidan ar PUBLIK, och .exe-rutten har kvar sina egna grindar (401/402/403) i servern.
//
// VARFOR ?meta=1 GAR UTAN INLOGGNING: server/index.js svarar pa meta-fragan INNAN den slar upp
// sessionen. Svaret bar version och storeUrl men aldrig sjalva .exe-URL:en (url:undefined).
//
// TRE LAGEN, och tystnad ar ett av dem:
//   storeUrl satt   -> lanken pekar pa Microsoft Store, etiketten sager det
//   inget storeUrl  -> lanken star kvar pa studio.html?intent=download (inloggad 302-vag)
//   inte 200        -> lanken forblir DOLD. Ingen publicerad version = ingen knapp. En knapp som
//                      leder till 503 ar samre an ingen knapp.
(function () {
  'use strict';
  const lankar = document.querySelectorAll('[data-hamta-desktop]');
  if (!lankar.length) return;

  // Samma villkor som butiken() i vyra-desktop.js. Duplicerat med flit: filerna delar ingen
  // modulgrans, och en butikslank som pekar nagon annanstans ska falla pa BADA stallen.
  function butiken(data) {
    return data && typeof data.storeUrl === 'string' &&
      /^https:\/\/apps\.microsoft\.com\//.test(data.storeUrl) ? data.storeUrl : null;
  }

  function visa(href, etikett, ar_butik) {
    lankar.forEach(function (el) {
      el.setAttribute('href', href);
      el.textContent = etikett;
      if (ar_butik) {
        el.setAttribute('data-butik', '');
        el.setAttribute('rel', 'noopener');
      }
      el.hidden = false;
    });
  }

  fetch('/api/downloads/windows?meta=1', { cache: 'no-store', headers: { accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null })
    .then(function (data) {
      if (!data || data.ok === false) return;          // 503 m.fl. -> lanken star kvar dold
      const butik = butiken(data);
      if (butik) return visa(butik, 'Ladda ner · Microsoft Store', true);
      visa('studio.html?intent=download', 'Ladda ner appen', false);
    })
    .catch(function () { /* natverksfel -> dold, samma regel som ovan */ });
})();
