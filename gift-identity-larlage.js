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

  // OFFLINE-LÄGET. Skrivbordsappen serverar Studion genom sin lokala server, som proxar statiskt
  // innehåll till vyralive.app. Når den inte fram faller den tillbaka på den kopia som ligger i
  // .exe:n — och DÄR kan lärläget ändå inte fungera: armera, bekräfta och statusläsningen är alla
  // molnrutter, och fångsten kräver ett gåvoevent genom molnets ingest.
  //
  // Att visa knappen ändå vore värre än att dölja den. Användaren skulle trycka, ingenting hända,
  // och felet se ut som en trasig funktion i stället för en saknad anslutning. Modulen stängs
  // därför av med ETT tydligt skäl, och gör inga anrop som ändå måste misslyckas.
  var OFFLINE_MEDDELANDE = 'Lär in gåva kräver anslutning till VYRA.';

  function skapaLarlage(opts) {
    var workspaceId = opts.workspaceId;
    var api = opts.api;                       // (path, options) -> Promise<json>
    var rita = opts.rita || function () {};   // (lage) -> void, Studio ritar
    var schemalagg = opts.schemalagg || setTimeout;
    var avbrytTimer = opts.avbrytTimer || clearTimeout;

    var pollTimer = null, tickTimer = null;
    var aktivRegel = null;
    var lage = { armerad: false, sekunderKvar: 0, fangst: null, inlard: null, fel: null,
                otillganglig: false, meddelande: null };

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
      // Ett lyckat svar betyder att anslutningen finns igen — laget laker av sig sjalvt.
      lage.otillganglig = false;
      lage.meddelande = null;
      publicera();

      stoppaTimers();
      if (lage.armerad) {
        pollTimer = schemalagg(poll, POLL_MS);
        tickTimer = schemalagg(tick, TICK_MS);
      }
    }

    // Anslutningen ar borta. Ett avvisat anrop ar ett TRANSPORTFEL — ett 409 kommer tillbaka som ett
    // svar med ok:false och gar aldrig hit. Laget nollstalls, for en armering som inte gar att
    // fraga om ar inte langre en armering.
    function offline() {
      stoppaTimers();
      lage.armerad = false; lage.sekunderKvar = 0; lage.fangst = null; lage.fel = null;
      lage.otillganglig = true;
      lage.meddelande = OFFLINE_MEDDELANDE;
      publicera();
      return lage;
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
        return api(bas(ruleKey), { method: 'GET' }).then(taEmot).catch(offline);
      },

      armera: function (ruleKey) {
        // INGET ANROP nar anslutningen ar borta. Ett armeringsanrop som anda maste misslyckas ger
        // bara en tyst timeout och ett lage som ser halvt startat ut.
        if (lage.otillganglig) { publicera(); return Promise.resolve(lage); }
        aktivRegel = ruleKey;
        return api(bas(ruleKey) + '/armera', { method: 'POST' })
          .then(function () { return api(bas(ruleKey), { method: 'GET' }); })
          .then(taEmot)
          .catch(offline);
      },

      // Bekräfta kan svara 409 — ingen fångst, utgången, eller aldrig armerad. Det är ett LÄGE,
      // inte ett trasigt anrop: användaren ska få veta att den behöver armera om.
      bekrafta: function (ruleKey) {
        if (lage.otillganglig) { publicera(); return Promise.resolve(lage); }
        return api(bas(ruleKey) + '/bekrafta', { method: 'POST' })
          .then(function (svar) {
            if (svar && svar.ok === false) { lage.fel = svar.skal || 'kunde-inte-bekrafta'; }
            return api(bas(ruleKey), { method: 'GET' });
          })
          .then(taEmot)
          .catch(offline);
      },

      avbryt: function (ruleKey) {
        // Avbryt far ALLTID rensa lokalt, men utan anslutning finns inget att avbryta pa servern.
        if (lage.otillganglig) {
          stoppaTimers();
          lage.armerad = false; lage.sekunderKvar = 0; lage.fangst = null;
          publicera();
          return Promise.resolve(lage);
        }
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

  root.VyraGiftIdentityLarlage = { skapaLarlage: skapaLarlage, POLL_MS: POLL_MS, TICK_MS: TICK_MS,
                                   OFFLINE_MEDDELANDE: OFFLINE_MEDDELANDE };
})(typeof window !== 'undefined' ? window : globalThis);
