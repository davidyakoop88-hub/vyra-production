// widget-fas.js — fyrafasmotorn for VYRAs widgetar.
//
// VARFOR ADAPTER OCH INTE NY MOTOR
// recognition-* (~7 661 rader) har redan en fasmotor, och dess koreografiklasser heter
// anticipation -> reveal -> settled -> exit, alltsa exakt Davids fyra faser. Men recognition
// BYGGER SIN EGEN DOM (mount/show skapar elementen), medan vara sex widgetfamiljer ritas av
// media.js och premium-final.js. Att adoptera det rakt av hade betytt att skriva om sex
// renderare. Darfor lanas tre saker verbatim och appliceras pa BEFINTLIGA noder:
//
//   1. scheduleTimer(instans, gen, fn, ms) + generation-raknaren  (premium-widget-core.js:522)
//   2. klassvokabularen anticipation / reveal / settled / exit    (premium-widget-core.js:484)
//   3. timing-formen med separata langder per fas                 (premium-widget-core.js:26)
//
// TVA SAKER SOM INTE FINNS I RECOGNITION OCH ALLTSA AR NYA HAR
//   4. Decode-grind: recognition har ingen — det finns inte en enda .decode() i produktions-
//      koden. Utan den oppnas ramen mot en tom bild.
//   5. Teardown pa vyra-session-ended: recognition har destroy() men ingenting lyssnar.
//
// SKILLNAD MOT RECOGNITION SOM AR MEDVETEN
// Deras `anticipation` ar hardkodad till 16 ms — en primer sa webblasaren hinner applicera
// starttillstandet innan overgangen. Davids fas 1 ar en DESIGNAD uppbyggnad, sa den har ett
// eget falt `anticipationMs` (standard 380 ms).
//
// KOMPATIBILITET: de befintliga -active/-exit-klasserna satts precis som idag, sa ingen av de
// 105 CSS-reglerna som hanger pa dem paverkas. data-fas och vyra-fas-*-klasserna laggs OVANPA.
(function (root) {
  'use strict';

  var FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];

  // Klassnamnen foljer recognitions vokabular sa att CSS kan delas om systemen mots senare.
  var FASKLASS = {
    ljus: 'vyra-fas-anticipation',
    oppna: 'vyra-fas-reveal',
    hyllning: 'vyra-fas-settled',
    upplosning: 'vyra-fas-exit',
  };
  var ALLA_FASKLASSER = FASER.map(function (f) { return FASKLASS[f] });

  var STANDARD_TIMING = { anticipationMs: 380, enterMs: 700, holdMs: 3200, exitMs: 460 };
  var STANDARD_DECODE_TIMEOUT = 500;

  var instanser = new Map();      // el -> instans (ett element kan bara ha en sekvens)
  var nastaId = 1;

  function tal(v, standard) {
    var n = Number(v);
    return isFinite(n) && n >= 0 ? n : standard;
  }

  function normaliseraTiming(t) {
    t = t || {};
    return {
      anticipationMs: tal(t.anticipationMs, STANDARD_TIMING.anticipationMs),
      enterMs: tal(t.enterMs, STANDARD_TIMING.enterMs),
      holdMs: tal(t.holdMs, STANDARD_TIMING.holdMs),
      exitMs: tal(t.exitMs, STANDARD_TIMING.exitMs),
    };
  }

  // ---- timerregister ------------------------------------------------------------------------
  // Lanat monster: varje timer bar sin generation. En callback fran en overspelad generation
  // returnerar utan att gora nagot, sa en omtandning mitt i sekvensen inte kan lacka igenom.
  function schemalagg(inst, gen, fn, delayMs) {
    var timerId = setTimeout(function () {
      inst.timrar.delete(timerId);
      if (gen !== inst.generation) return;    // overspelad av en nyare kor() pa samma element
      fn();
    }, Math.max(0, delayMs));
    inst.timrar.add(timerId);
    return timerId;
  }

  function rensaTimrar(inst) {
    inst.timrar.forEach(function (id) { clearTimeout(id) });
    inst.timrar.clear();
  }

  // ---- decode-grind -------------------------------------------------------------------------
  // Kravet: reveal far aldrig starta fore avkodad bild ELLER tidsgransen. Vid fel eller
  // tidsgrans kors sekvensen anda — den far aldrig frysa och aldrig hoppa over fas 2.
  function decodeGrind(inst, gen, bild, timeoutMs, klar) {
    if (!bild) return klar('ingen-bild');

    var avgjord = false;
    function svara(utfall) {
      if (avgjord) return;
      avgjord = true;
      if (gen !== inst.generation) return;
      klar(utfall);
    }

    var tidsvakt = schemalagg(inst, gen, function () {
      if (avgjord) return;
      try {
        root.console && console.warn(
          '[VyraFas] decode-grinden slog i tidsgransen ' + timeoutMs + ' ms — ' +
          'sekvensen fortsatter utan avkodad bild: ' + (bild.currentSrc || bild.src || '(ingen src)'));
      } catch (_) {}
      svara('tidsgrans');
    }, timeoutMs);

    function fardig(utfall) {
      clearTimeout(tidsvakt);
      inst.timrar.delete(tidsvakt);
      svara(utfall);
    }

    // decode() finns i alla webblasare vi stoder, men bilden kan sakna src eller vara trasig.
    var p;
    try { p = bild.decode(); } catch (e) { p = Promise.reject(e); }
    if (!p || typeof p.then !== 'function') return fardig('ingen-decode');

    p.then(function () { fardig('avkodad') }, function (e) {
      try {
        root.console && console.warn(
          '[VyraFas] bilden gick inte att avkoda — sekvensen fortsatter anda: ' +
          (bild.currentSrc || bild.src || '(ingen src)') + ' (' + (e && e.message || e) + ')');
      } catch (_) {}
      fardig('fel');
    });
  }

  // ---- fasbyten -----------------------------------------------------------------------------
  function satFas(inst, fas) {
    var el = inst.el;
    inst.fas = fas;

    if (fas === 'ljus') {
      el.classList.add(FASKLASS.ljus);
    } else if (fas === 'oppna') {
      el.classList.remove(FASKLASS.ljus);
      el.classList.add(FASKLASS.oppna);
    } else if (fas === 'hyllning') {
      el.classList.add(FASKLASS.hyllning);          // reveal ligger kvar, som i recognition
    } else if (fas === 'upplosning') {
      el.classList.remove(FASKLASS.oppna, FASKLASS.hyllning);
      el.classList.add(FASKLASS.upplosning);
      if (inst.exitKlass) el.classList.add(inst.exitKlass);
    }
    el.setAttribute('data-fas', fas);

    // Varaktigheterna publiceras som CSS-variabler sa overgangar kan referera dem.
    el.style.setProperty('--fas-' + fas + '-tid', inst.timing[
      fas === 'ljus' ? 'anticipationMs' : fas === 'oppna' ? 'enterMs'
        : fas === 'hyllning' ? 'holdMs' : 'exitMs'] + 'ms');

    if (typeof inst.vidFas === 'function') {
      try { inst.vidFas(fas, inst.id) } catch (e) {
        try { root.console && console.warn('[VyraFas] vidFas kastade: ' + (e && e.message || e)) } catch (_) {}
      }
    }
  }

  function stadaEl(inst) {
    var el = inst.el;
    el.classList.remove.apply(el.classList, ALLA_FASKLASSER);
    if (inst.aktivKlass) el.classList.remove(inst.aktivKlass);
    if (inst.exitKlass) el.classList.remove(inst.exitKlass);
    el.removeAttribute('data-fas');
    FASER.forEach(function (f) { el.style.removeProperty('--fas-' + f + '-tid') });
  }

  function borja(inst) {
    var gen = inst.generation;
    var T = inst.timing;

    // Aktivklassen forst: satFas anropar vidFas, och da ska elementets klasslista redan
    // vara den kompletta. Annars ser en lyssnare fas 1 utan den befintliga -active-klassen.
    if (inst.aktivKlass) inst.el.classList.add(inst.aktivKlass);
    satFas(inst, 'ljus');

    // Fas 2 vantar pa BADA: att ljusfasen har spelat klart, och att bilden ar avgjord.
    // Det ar darfor de racknas ihop i stallet for att kedjas — en snabb bild ska inte
    // forkorta uppbyggnaden, och en langsam bild ska inte forlanga den mer an tidsgransen.
    var kvar = 2;
    function klart() {
      if (--kvar > 0) return;
      if (gen !== inst.generation) return;
      oppna(inst, gen);
    }

    schemalagg(inst, gen, klart, T.anticipationMs);
    decodeGrind(inst, gen, inst.bild, inst.decodeTimeoutMs, function (utfall) {
      inst.decodeUtfall = utfall;
      klart();
    });
  }

  function oppna(inst, gen) {
    var T = inst.timing;
    satFas(inst, 'oppna');
    schemalagg(inst, gen, function () {
      satFas(inst, 'hyllning');
      schemalagg(inst, gen, function () { upplos(inst, gen, 'tid') }, T.holdMs);
    }, T.enterMs);
  }

  function upplos(inst, gen, skal) {
    if (inst.fas === 'upplosning') return;
    satFas(inst, 'upplosning');
    inst.skal = skal;
    schemalagg(inst, gen, function () { slutfor(inst) }, inst.timing.exitMs);
  }

  function slutfor(inst) {
    rensaTimrar(inst);
    stadaEl(inst);
    if (instanser.get(inst.el) === inst) instanser.delete(inst.el);
    if (typeof inst.vidSlut === 'function') {
      try { inst.vidSlut(inst.skal || 'klar', inst.id) } catch (_) {}
    }
  }

  // ---- publikt API --------------------------------------------------------------------------
  var API = {
    FASER: FASER.slice(),
    FASKLASS: Object.assign({}, FASKLASS),
    standardTiming: Object.assign({}, STANDARD_TIMING),

    // Kor fyrafassekvensen pa ett BEFINTLIGT element. Returnerar instans-id.
    kor: function (el, opts) {
      if (!el || !el.classList) throw new TypeError('VyraFas.kor: forsta argumentet maste vara ett element');
      opts = opts || {};

      var inst = instanser.get(el);
      if (inst) {
        // Omtandning: samma element, ny generation. Gamla callbacks tystnar via gen-kontrollen.
        rensaTimrar(inst);
        el.classList.remove.apply(el.classList, ALLA_FASKLASSER);
        if (inst.exitKlass) el.classList.remove(inst.exitKlass);
      } else {
        inst = { el: el, timrar: new Set(), generation: 0 };
        instanser.set(el, inst);
      }

      inst.id = nastaId++;
      inst.generation++;
      inst.fas = null;
      inst.skal = null;
      inst.decodeUtfall = null;
      inst.timing = normaliseraTiming(opts.timing);
      inst.aktivKlass = opts.aktivKlass || null;
      inst.exitKlass = opts.exitKlass || null;
      inst.bild = opts.bild || null;
      inst.decodeTimeoutMs = tal(opts.decodeTimeoutMs, STANDARD_DECODE_TIMEOUT);
      inst.vidFas = opts.vidFas || null;
      inst.vidSlut = opts.vidSlut || null;

      borja(inst);
      return inst.id;
    },

    // Avsluta i fortid — hoppar till upplosningsfasen, klipper den aldrig.
    avsluta: function (el, skal) {
      var inst = instanser.get(el);
      if (!inst) return false;
      upplos(inst, inst.generation, skal || 'avbruten');
      return true;
    },

    // Riv omedelbart: inga fler callbacks, inga klasser kvar.
    destroy: function (el) {
      var inst = instanser.get(el);
      if (!inst) return false;
      inst.generation++;            // allt redan schemalagt blir overspelat
      rensaTimrar(inst);
      stadaEl(inst);
      instanser.delete(el);
      return true;
    },

    destroyAll: function () {
      var n = 0;
      Array.from(instanser.keys()).forEach(function (el) { if (API.destroy(el)) n++ });
      return n;
    },

    aktiva: function () { return instanser.size },
    aktivaTimrar: function () {
      var n = 0;
      instanser.forEach(function (inst) { n += inst.timrar.size });
      return n;
    },
    fasFor: function (el) { var i = instanser.get(el); return i ? i.fas : null },
  };

  // ---- teardown -----------------------------------------------------------------------------
  // Kontrakt §4: ingenting far overleva ett kontobyte eller en utloggning. media.js lyssnar
  // redan pa samma handelse (media.js:937), sa haken ar den etablerade.
  root.addEventListener('vyra-session-ended', function () { API.destroyAll() });

  root.VyraFas = API;
})(typeof window !== 'undefined' ? window : this);
