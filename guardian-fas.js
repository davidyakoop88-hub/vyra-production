// guardian-fas.js — koreografin "Beskyddet" för Guardian Welcome, en fas i taget.
//
// VARFÖR FILEN FINNS. Samma skäl som fan-fas.js: media.js är störst i repot, och CLAUDE.md säger
// rakt ut att nya renderare och deras koreografi hör hemma i en syskonfil. Guardian Welcome är en
// EGEN familj, inte en variant av Fan Level Up — den delar mönster med fan-fas.js men inga data,
// och de två registren ska aldrig kunna glida in i varandra.
//
// VAD EN FAS ÄR. En fas är en klass på widgetlådan plus en varaktighet. Klassen heter
// `gw-fas-<namn>`, och guardian-welcome.css hänger sina animationer på den. JS bestämmer alltså
// NÄR något händer, CSS bestämmer VAD. Den uppdelningen är hela poängen: en ändrad rörelse ska
// aldrig kräva en ändrad timer, och en ändrad timing ska aldrig kräva ny CSS.
//
// FASNAMNEN ÄR ASCII MED FLIT. `oppna` och `upplosning`, inte `öppna` och `upplösning`. De blir
// CSS-klassnamn, och resten av repot håller sig till a-z där (avtackning, avlasning, uppstigning).
//
// KLOCKAN GÅR ATT BYTA UT. `klocka` är en öppen krok med flit. Ett prov som ska bevisa att fas 2
// följer fas 1 skulle annars behöva sova 500 ms per påstående — långsamt, och flaky på en lastad
// maskin. Med en manuell klocka blir samma prov exakt och tar noll tid.
//
// TAKET. `KORTASTE_VISNING` är den kortaste tid en Guardian-alert står kvar. En koreografi som är
// längre än så hinner aldrig spelas färdigt innan alerten tas ned, och tittaren ser en avhuggen
// rörelse. Vaktat för VARJE registrerad storlek, inte bara de tre som råkar finnas idag.
(function (root) {
  'use strict';

  // EN GÅNG, ÄVEN OM FILEN LADDAS TVÅ. `arKopplad` nedan är scopat till den här körningen, så en
  // andra laddning hade lindat den redan lindade triggern en gång till — samma dubbelkoppling som
  // fan-fas.js varnar för. Filen laddas idag bara från studio.html; grinden finns för att en
  // skriptsvans i media.js är en frestande andra väg och skulle vara tyst fel.
  if (root.VyraGuardianFas) return;

  const PREFIX = 'gw-fas-';

  // Kön i runtime-controls.js håller en Guardian-alert i 8 s. Golvet här är lägre än så med flit:
  // taket ska vara en egenskap hos koreografin, inte hos en siffra någon annan råkar äga idag.
  const KORTASTE_VISNING = 4000;

  const STORLEKAR = ['banner', 'kort', 'full'];

  // REGISTRET. En storlek utan post här får ingen koreografi alls — den skulle snäppa fram färdig.
  // G-SLUT i tests/guardian-fas.test.js kräver att fabriken, panelväljaren och den här tabellen är
  // exakt samma mängd, så en fjärde storlek kan inte läggas till utan att någon skriver dess faser.
  //
  // BESKYDDET, fyra faser:
  //
  //   ljus (500)          Auroran tonar in på tom scen. Ingenting annat syns. Det är den enda
  //                       fasen där widgeten är en bakgrund och inget mer — skölden får inte
  //                       skymta fram här, för då är ankomsten redan avslöjad.
  //   oppna (900)         Skölden glider in från vänster och bär fram hjorten. Rubriken stämplas
  //                       fram genom att teckenavståndet krymper (0.5em → 0.15em), inte genom att
  //                       tona in. Namnet följer efter 200 ms, underrubriken efter 400.
  //   hyllning (varierar) Hållet. Sköldens glöd pulserar och auroran andas vidare; ingen annan del
  //                       rör sig. Längden växer med storleken — en banner ska inte stå och stirra
  //                       lika länge som en full.
  //   upplosning (600)    Allt tonar ut i omvänd ordning. Auroran sist, så ljuset släcks efter
  //                       det som stod i det.
  //
  // Bara hyllningen varierar. Att låta ljus/oppna/upplosning skilja sig mellan storlekar hade gjort
  // de tre till tre olika appar — vaktat av ett eget prov.
  const FASER = {
    banner: [
      { namn: 'ljus', ms: 500 },
      { namn: 'oppna', ms: 900 },
      { namn: 'hyllning', ms: 1200 },
      { namn: 'upplosning', ms: 600 },
    ],
    kort: [
      { namn: 'ljus', ms: 500 },
      { namn: 'oppna', ms: 900 },
      { namn: 'hyllning', ms: 1600 },
      { namn: 'upplosning', ms: 600 },
    ],
    full: [
      { namn: 'ljus', ms: 500 },
      { namn: 'oppna', ms: 900 },
      { namn: 'hyllning', ms: 2000 },
      { namn: 'upplosning', ms: 600 },
    ],
  };

  // ---- Språket -----------------------------------------------------------------------------------
  //
  // ETT STÄLLE, DOKUMENTERAD ORDNING. `VyraLang` finns inte i repot (uppmätt 2026-08-18: noll
  // träffar i hela kodbasen). Kroken nedan finns ändå, så att inkopplingen den dag den byggs blir
  // EN rad här och inte en refaktorering spridd över renderaren, panelen och proven.
  //
  // Ordningen:
  //   1. ett uttryckligt val i widgeten ('sv' eller 'en') vinner alltid
  //   2. VyraLang.current() om den någonsin finns
  //   3. navigator.language
  //   4. 'sv'
  //
  // FALLBACKEN ÄR ASYMMETRISK MED FLIT. Bara engelska ger engelska. En tysk eller spansk webbläsare
  // får svenska, eftersom svenska är appens språk och engelska är ett aktivt val — inte "allt som
  // inte är svenska blir engelska".
  const TEXT_NYCKLAR = ['rubrik', 'vecka'];

  const TEXTER = {
    sv: { rubrik: 'BESKYDDAREN HAR ANLÄNT', vecka: n => 'Vecka ' + n + ' · Din Beskyddare' },
    en: { rubrik: 'GUARDIAN HAS ARRIVED', vecka: n => 'Week ' + n + ' · Your Guardian' },
  };

  function sprak(w) {
    const valt = w && w.guardianLang;
    if (valt === 'sv' || valt === 'en') return valt;
    const lang = root.VyraLang;                       // <- den enda raden som byts när VyraLang byggs
    const fran = lang && typeof lang.current === 'function' ? lang.current() : '';
    const kod = String(fran || (root.navigator && root.navigator.language) || '').toLowerCase();
    return kod.indexOf('en') === 0 ? 'en' : 'sv';
  }

  function text(lang, vecka) {
    const t = TEXTER[lang] || TEXTER.sv;
    return { rubrik: t.rubrik, vecka: t.vecka(vecka) };
  }

  // ---- Koreografin -------------------------------------------------------------------------------

  // Bytbar med flit — se filhuvudet. Provet ersätter den med en manuell klocka.
  const klocka = {
    satt: (fn, ms) => root.setTimeout(fn, ms),
    rensa: id => root.clearTimeout(id),
  };

  const faser = storlek => FASER[storlek] || null;
  const total = storlek => (faser(storlek) || []).reduce((s, f) => s + f.ms, 0);

  // Storleken läses ur lådans egna klasser i stället för ur widgetobjektet. Skälet är att det är
  // DEN RENDERADE lådan koreografin gäller: står det `guardian-size-full` i DOM:en är det full som
  // syns, oavsett vad någon råkat skriva i state. Samma princip som renderer-honors-widget.
  function storlekAv(box) {
    for (const k of box.classList) if (k.startsWith('guardian-size-')) return k.slice(14);
    return '';
  }

  function stadaKlasser(box) {
    [...box.classList].forEach(k => { if (k.startsWith(PREFIX)) box.classList.remove(k) });
  }

  // Avbryter en pågående koreografi och lämnar lådan i sitt vilotillstånd. Anropas både vid en ny
  // trigger (omstart) och när sekvensen tar slut.
  function avbryt(box) {
    if (box._gwFasTimers) box._gwFasTimers.forEach(klocka.rensa);
    box._gwFasTimers = [];
    stadaKlasser(box);
  }

  // Spelar storlekens faser i ordning. Varje fas äger sin klass ensam — två faser är aldrig aktiva
  // samtidigt, så CSS:en aldrig behöver bry sig om kombinationer.
  function spela(box, storlek = storlekAv(box)) {
    const lista = faser(storlek);
    avbryt(box);
    if (!lista || !lista.length) return false;
    box.classList.add(PREFIX + lista[0].namn);
    let vid = 0;
    for (let i = 0; i < lista.length; i += 1) {
      vid += lista[i].ms;
      const nasta = lista[i + 1];
      const fran = lista[i].namn;
      box._gwFasTimers.push(klocka.satt(() => {
        box.classList.remove(PREFIX + fran);
        if (nasta) box.classList.add(PREFIX + nasta.namn);
      }, vid));
    }
    return true;
  }

  root.VyraGuardianFas = {
    PREFIX, FASER, STORLEKAR, KORTASTE_VISNING, TEXT_NYCKLAR,
    faser, total, storlekAv, spela, avbryt, klocka, sprak, text,
  };

  // ---- Kopplingen till triggern --------------------------------------------------------------
  //
  // `triggerGuardianWelcome` i media.js talar inte om vilka lådor den tände; den returnerar inget.
  // Att räkna ut det igen här hade betytt att gatet fanns på två ställen — precis den sortens
  // dubblering som lät `card` och `hero` glida isär i Fan Level Up-familjen.
  //
  // Men triggern lämnar ett spår som går att läsa: för varje låda den tänder byter den ut
  // `box._gwTimer`. Identiteten på det handtaget ändras alltså exakt för de lådor som triggades,
  // och för inga andra. Vi läser före och efter och jämför. En låda som redan spelade och INTE
  // triggades om får därmed behålla sin pågående koreografi i stället för att ryckas om från fas 1.
  //
  // EXAKT EN GÅNG, OCH TIDIGT. runtime-controls.js byter kort efter start ut
  // `window.triggerGuardianWelcome` mot en KÖAD variant som bara lägger jobbet i VyraAlertQueue och
  // returnerar. Vi måste sitta INNANFÖR den kön: en koreografi som startar när alerten köas i
  // stället för när den spelas hamnar ur takt med sin egen widget.
  let arKopplad = false;
  function koppla() {
    const original = root.triggerGuardianWelcome;
    if (arKopplad || typeof original !== 'function') return false;
    const kopplad = function () {
      const lador = [...root.document.querySelectorAll('.guardian-welcome')];
      const fore = new Map(lador.map(box => [box, box._gwTimer]));
      const svar = original.apply(this, arguments);
      for (const box of root.document.querySelectorAll('.guardian-welcome')) {
        if (!box.classList.contains('gw-active')) continue;
        if (fore.has(box) && fore.get(box) === box._gwTimer) continue;   // spelade redan
        spela(box);
      }
      return svar;
    };
    kopplad.__gwFasKopplad = true;
    root.triggerGuardianWelcome = kopplad;
    arKopplad = true;
    return true;
  }
  root.VyraGuardianFas = Object.assign(root.VyraGuardianFas, { koppla, arKopplad: () => arKopplad });

  // media.js laddar den här filen ur skriptsvansen, alltså efter att triggern definierats — det
  // första försöket lyckas i praktiken alltid. Lyssnaren finns för det fall det inte gör det, och
  // slutar göra något så fort kopplingen suttit.
  koppla();
  root.document.addEventListener('load', () => koppla(), true);
})(window);
