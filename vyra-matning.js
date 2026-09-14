// Tratmatning for MARKNADSFORINGSSIDAN. Laddas av index.html och ingen annanstans.
//
// VARFOR INTE I STUDION (Davids beslut 2026-09-14): Studion ar dar kreatoren arbetar och dar
// OBS-tokens cirkulerar. En tredjepart dar ar en onodig attackyta. De tva "djupa" tratthandelserna
// — forsta_sandning och betald — skickas darfor server-to-server i stallet (server/matning.js).
//
// ⛔ TVA SPARRAR, och bada finns for att INGENTING kansligt ska kunna lamna sidan:
//
// 1. OVERLAY-SPARREN. overlay.html ar bara en omdirigering till
//    `studio.html?overlay=1&access=<token>` — tittarnas overlay AR Studion. Skulle den har filen
//    nagonsin laddas dar (av misstag, eller for att nagon kopierar en skripttagg) skulle varje
//    tittare i varje sandning bli en sidvisning, och OBS fa en extra tredjepartsforfragan.
//    Filen vagrar darfor kora nar `overlay` finns i URL:en. Sparren ar overflodig i dag och star
//    kvar med flit: den kostar en rad och stoppar den dyraste tankbara misstaget.
//
// 2. MANUELLT LAGE (script.manual.js), inte det vanliga skriptet. Det vanliga skickar sidans
//    FULLSTANDIGA URL, query och allt. Vyra-URL:er bar `?access=<permanent OBS-token>`, och en
//    sadan far aldrig na en tredjepart — det ar samma klass av lackage som #264. I manuellt lage
//    bestammer VI adressen, och vi skickar bara origin + pathname. Aldrig sokstrangen.
(function () {
  'use strict';
  var parametrar = new URLSearchParams(location.search);
  if (parametrar.has('overlay')) return;          // sparr 1 — se ovan
  if (parametrar.has('access')) return;           // balte och hangslen: ingen tokenbarande vy mats

  var DOMAN = 'vyralive.app';

  // Plausibles officiella kostub. Anrop som gors innan skriptet laddat hamnar i kon och spelas
  // upp efterat — sa en handelse tidigt i sidans liv tappas inte.
  window.plausible = window.plausible || function () {
    (window.plausible.q = window.plausible.q || []).push(arguments);
  };

  // Adressen vi rapporterar. Ingen query, ingen fragment.
  function adress() { return location.origin + location.pathname; }

  function handelse(namn, egenskaper) {
    try {
      var val = { u: adress() };
      if (egenskaper) val.props = egenskaper;
      window.plausible(namn, val);
    } catch (_) { /* matning far aldrig falla sidan */ }
  }

  var skript = document.createElement('script');
  skript.defer = true;
  skript.setAttribute('data-domain', DOMAN);
  skript.src = 'https://plausible.io/js/script.manual.js';
  document.head.appendChild(skript);

  handelse('pageview');

  // store_klick DELEGERAT pa document i stallet for bundet till knappen. Lanken ritas av
  // landing-hamta.js EFTER ett natverksanrop, sa en engangsbindning vid laddning hade missat den
  // helt — samma fallgrop som download-client.js redan gatt i (se vyra-desktop.js).
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-hamta-desktop],[data-ladda-desktop]');
    if (el) handelse('store_klick');
  }, true);

  window.VyraMat = { handelse: handelse };
})();
