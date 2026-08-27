// gift-identity-larlage.js — Studios lärläge för gåvoidentitet.
//
// Se docs/gavoidentitet-inlarning.md. Flödet är: Lär in nästa gåva → nedräkning → fångst visas
// med namn och bild → Bekräfta eller Avbryt.
//
// Modulen äger INGEN regellogik och ingen matchning — den visar serverns läge och skickar tre
// kommandon. Servern äger tiden: `sekunderKvar` räknas fram där, så en klientklocka som ligger
// fel kan inte få lärläget att se levande ut när det redan gått ut.
//
// Nedräkningen tickar lokalt mellan pollningarna, men RÄTTAS av varje svar. Utan den lokala
// tickern står siffran still mellan anropen och ser trasig ut; utan rättningen driver den isär.
(function (root) {
  'use strict';

  var POLL_MS = 2000;          // hur ofta serverns läge hämtas medan armeringen är aktiv
  var TICK_MS = 1000;          // nedräkningens egen takt mellan pollningarna

  function skapaLarlage(opts) {
    var workspaceId = opts.workspaceId;
    var api = opts.api;                       // (path, options) -> Promise<json>
    var rita = opts.rita || function () {};   // (lage) -> void, Studio ritar
    var schemalagg = opts.schemalagg || setTimeout;
    var avbrytTimer = opts.avbrytTimer || clearTimeout;

    var pollTimer = null, tickTimer = null;
    var aktivRegel = null;
    var lage = { armerad: false, sekunderKvar: 0, fangst: null, inlard: null, fel: null };

    function bas(ruleKey) {
      return '/api/workspaces/' + encodeURIComponent(workspaceId) +
             '/gift-identity/' + encodeURIComponent(ruleKey);
    }

    function publicera() { rita(lage); }

    function stoppaTimers() {
      if (pollTimer) { avbrytTimer(pollTimer); pollTimer = null; }
      if (tickTimer) { avbrytTimer(tickTimer); tickTimer = null; }
    }

    // Lokal tick: bara nedräkningen, aldrig ett beslut. När den når noll slutar den ticka och
    // låter nästa poll säga vad som faktiskt gäller — klienten avgör inte att tiden är ute.
    function tick() {
      if (!lage.armerad) return;
      lage.sekunderKvar = Math.max(0, lage.sekunderKvar - 1);
      publicera();
      if (lage.sekunderKvar > 0) tickTimer = schemalagg(tick, TICK_MS);
    }

    function taEmot(svar) {
      lage.inlard = svar.inlard || null;
      lage.armerad = !!svar.armerad;
      lage.sekunderKvar = Number(svar.sekunderKvar) || 0;
      lage.fangst = svar.fangst || null;
      lage.fel = null;
      publicera();

      stoppaTimers();
      if (lage.armerad) {
        pollTimer = schemalagg(poll, POLL_MS);
        tickTimer = schemalagg(tick, TICK_MS);
      }
    }

    function poll() {
      if (!aktivRegel) return;
      api(bas(aktivRegel), { method: 'GET' }).then(taEmot).catch(function () {
        // Ett tappat pollsvar får inte se ut som att lärläget dog. Nästa försök står kvar.
        if (lage.armerad) pollTimer = schemalagg(poll, POLL_MS);
      });
    }

    return {
      // Läser serverns läge utan att armera — Studio kan visa "inlärt: Heart Me" för en regel
      // som inte håller på att läras om.
      hamta: function (ruleKey) {
        aktivRegel = ruleKey;
        return api(bas(ruleKey), { method: 'GET' }).then(taEmot);
      },

      armera: function (ruleKey) {
        aktivRegel = ruleKey;
        return api(bas(ruleKey) + '/armera', { method: 'POST' })
          .then(function () { return api(bas(ruleKey), { method: 'GET' }); })
          .then(taEmot);
      },

      // Bekräfta kan svara 409 — ingen fångst, utgången, eller aldrig armerad. Det är ett LÄGE,
      // inte ett trasigt anrop: användaren ska få veta att den behöver armera om.
      bekrafta: function (ruleKey) {
        return api(bas(ruleKey) + '/bekrafta', { method: 'POST' })
          .then(function (svar) {
            if (svar && svar.ok === false) { lage.fel = svar.skal || 'kunde-inte-bekrafta'; }
            return api(bas(ruleKey), { method: 'GET' });
          })
          .then(taEmot);
      },

      avbryt: function (ruleKey) {
        return api(bas(ruleKey) + '/avbryt', { method: 'POST' }).then(function () {
          stoppaTimers();
          lage.armerad = false; lage.sekunderKvar = 0; lage.fangst = null; lage.fel = null;
          publicera();
        });
      },

      // Teardown. Utan den fortsätter en pollslinga leva efter att vyn bytts — samma regel som
      // resten av huset: allt som schemalägger måste gå att riva.
      stang: function () { stoppaTimers(); aktivRegel = null; },

      lage: function () { return lage; }
    };
  }

  root.VyraGiftIdentityLarlage = { skapaLarlage: skapaLarlage, POLL_MS: POLL_MS, TICK_MS: TICK_MS };
})(typeof window !== 'undefined' ? window : globalThis);
