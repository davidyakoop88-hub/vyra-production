// widget-fas.js — fasmotorns fabrik: mekaniken en gång, arterna som konfiguration.
//
// VARFÖR FILEN FINNS. fan-fas.js bar motorn (register, bytbar klocka, sekventiella exklusiva
// fasklasser, spela/avbryt, trigger-koppling via timerfältets identitetsdiff) men var
// Fan-hårdkodad på fem punkter: PREFIX, layoutprefixet, selektorn, aktivklassen och
// triggernamnet+timerfältet. När Gifter Level Up får samma motorform (beslut 2026-08-19:
// full port av fyrfasspråket, med wt-g-arkivets motor som förlaga — arkiv/gifter-fyrfasmotorn-wtg)
// vore en kopierad fil två motorer som glider isär — samma felklass som lät 'card' och 'hero'
// divergera. Fabriken äger därför mekaniken; fan-fas.js och gifter-fas.js äger sina register,
// sina tider och sin dokumentation.
//
// VAD EN FAS ÄR. En fas är en klass på widgetlådan plus en varaktighet. Klassen heter
// `<prefix><namn>`, och CSS:en hänger sina animationer på den. JS bestämmer NÄR något händer,
// CSS bestämmer VAD. En ändrad rörelse ska aldrig kräva en ändrad timer, och en ändrad timing
// ska aldrig kräva ny CSS.
//
// KLOCKAN GÅR ATT BYTA UT, PER INSTANS. Ett prov som ska bevisa att fas 2 följer fas 1 skulle
// annars behöva sova per påstående — långsamt och flaky på en lastad maskin. Varje instans får
// sitt EGET klockobjekt så att ett prov som styr Fan-klockan aldrig rör Gifter-sekvensen.
//
// KOPPLINGEN TILL TRIGGERN. Artens trigger i media.js talar inte om vilka lådor den tände;
// den lämnar spåret att `box[timerFalt]` byter identitet för exakt de lådor som triggades.
// Vi läser före och efter och jämför — en låda som redan spelade och inte triggades om behåller
// sin pågående koreografi. Kopplingen sker EXAKT EN GÅNG och måste sitta INNANFÖR alertkön
// (runtime-controls.js byter ut triggern mot en köad variant ~500 ms efter start; en koreografi
// som startar när alerten köas i stället för när den spelas hamnar sekunder fel i en gåvostorm).
// Allt detta är uppmätt och dokumenterat i fan-fas-arbetet; mekaniken flyttade hit oförändrad.
(function (root) {
  'use strict';

  function skapa(konfig) {
    const PREFIX = konfig.prefix;
    const KORTASTE_VISNING = konfig.kortasteVisning;
    const FASER = konfig.faser;
    const layoutPrefix = konfig.layoutPrefix;
    const selector = konfig.selector;
    const aktivKlass = konfig.aktivKlass;
    const timerFalt = konfig.timerFalt;
    const triggerNamn = konfig.triggerNamn;

    // Bytbar med flit — se filhuvudet. Ett prov ersätter satt/rensa med en manuell klocka.
    const klocka = {
      satt: (fn, ms) => root.setTimeout(fn, ms),
      rensa: id => root.clearTimeout(id),
    };

    const faser = layout => FASER[layout] || null;
    const total = layout => (faser(layout) || []).reduce((s, f) => s + f.ms, 0);

    // Modellen läses ur lådans egna klasser i stället för ur widgetobjektet: det är den
    // RENDERADE lådan koreografin gäller. Samma princip som renderer-honors-widget.
    function layoutAv(box) {
      for (const k of box.classList) if (k.startsWith(layoutPrefix)) return k.slice(layoutPrefix.length);
      return '';
    }

    function stadaKlasser(box) {
      [...box.classList].forEach(k => { if (k.startsWith(PREFIX)) box.classList.remove(k) });
    }

    // Avbryter en pågående koreografi och lämnar lådan i sitt vilotillstånd.
    function avbryt(box) {
      if (box._fasTimers) box._fasTimers.forEach(klocka.rensa);
      box._fasTimers = [];
      stadaKlasser(box);
    }

    // Spelar modellens faser i ordning. Varje fas äger sin klass ensam — två faser är aldrig
    // aktiva samtidigt, så CSS:en aldrig behöver bry sig om kombinationer.
    function spela(box, layout = layoutAv(box)) {
      const lista = faser(layout);
      avbryt(box);
      if (!lista || !lista.length) return false;
      box.classList.add(PREFIX + lista[0].namn);
      let vid = 0;
      for (let i = 0; i < lista.length; i += 1) {
        vid += lista[i].ms;
        const nasta = lista[i + 1];
        const fran = lista[i].namn;
        box._fasTimers.push(klocka.satt(() => {
          box.classList.remove(PREFIX + fran);
          if (nasta) box.classList.add(PREFIX + nasta.namn);
        }, vid));
      }
      return true;
    }

    let kopplad = false;
    function koppla() {
      const original = root[triggerNamn];
      if (kopplad || typeof original !== 'function') return false;
      const wrapper = function () {
        const lador = [...root.document.querySelectorAll(selector)];
        const fore = new Map(lador.map(box => [box, box[timerFalt]]));
        const svar = original.apply(this, arguments);
        for (const box of root.document.querySelectorAll(selector)) {
          if (!box.classList.contains(aktivKlass)) continue;
          if (fore.has(box) && fore.get(box) === box[timerFalt]) continue;   // spelade redan
          spela(box);
        }
        return svar;
      };
      wrapper.__fasKopplad = true;
      root[triggerNamn] = wrapper;
      kopplad = true;
      return true;
    }

    // Arten laddas ur skriptsvansen efter att triggern definierats — första försöket lyckas i
    // praktiken alltid. Lyssnaren finns för det fall det inte gör det, och slutar göra något så
    // fort kopplingen suttit.
    koppla();
    root.document.addEventListener('load', () => koppla(), true);

    return { PREFIX, FASER, KORTASTE_VISNING, faser, total, layoutAv, spela, avbryt, klocka,
      koppla, arKopplad: () => kopplad };
  }

  root.VyraWidgetFas = { skapa };
})(window);
