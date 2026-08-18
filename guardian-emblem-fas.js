// guardian-emblem-fas.js — koreografin "Vapenskölden" för Guardian Emblem, en fas i taget.
//
// VARFÖR FILEN FINNS. Samma skäl som fan-fas.js: media.js är störst i repot, och CLAUDE.md säger
// rakt ut att nya renderare och deras koreografi hör hemma i en syskonfil. Guardian Emblem är en
// EGEN familj — den delar mönster med fan-fas.js men inga data, och de två registren ska aldrig
// kunna glida in i varandra.
//
// VAD EN FAS ÄR. En fas är en klass på widgetlådan plus en varaktighet. Klassen heter
// `ge-fas-<namn>`, och guardian-emblem.css hänger sina animationer på den. JS bestämmer alltså NÄR
// något händer, CSS bestämmer VAD. Den uppdelningen är hela poängen: en ändrad rörelse ska aldrig
// kräva en ändrad timer, och en ändrad timing ska aldrig kräva ny CSS.
//
// VAD ETT PRAKTSTEG ÄR. Fyra nivåer av heraldisk prakt, 1 till 4. Steg 3 ÄR steg 2 plus mer guld —
// delarna är kumulativa och ligger i samma ordning i varje steg. Det är inte en detalj: om ett
// steg tappade en del som ett lägre steg bär vore det inte en högre praktnivå längre, utan en
// annan design, och "höj till steg 4" skulle sluta betyda det användaren tror.
//
// NAMNEN ÄR ASCII MED FLIT. `oppna`, `upplosning`, `kristall-vanster` — inte `öppna`,
// `upplösning`, `kristall-vänster`. De blir CSS-klassnamn, och resten av repot håller sig till a-z
// där (avtackning, avlasning, uppstigning).
//
// KLOCKAN GÅR ATT BYTA UT. `klocka` är en öppen krok med flit. Ett prov som ska bevisa att fas 2
// följer fas 1 skulle annars behöva sova 600 ms per påstående — långsamt, och flaky på en lastad
// maskin. Med en manuell klocka blir samma prov exakt och tar noll tid.
//
// TAKET. `KORTASTE_VISNING` är den kortaste tid ett emblem står kvar. En koreografi som är längre
// än så hinner aldrig spelas färdigt innan alerten tas ned, och tittaren ser en avhuggen rörelse.
(function (root) {
  'use strict';

  // EN GÅNG, ÄVEN OM FILEN LADDAS TVÅ. `arKopplad` nedan är scopat till den här körningen, så en
  // andra laddning hade lindat den redan lindade triggern en gång till. Filen laddas idag bara
  // från studio.html; grinden finns för att en skriptsvans i media.js är en frestande andra väg
  // och skulle vara tyst fel.
  if (root.VyraGuardianEmblemFas) return;

  const PREFIX = 'ge-fas-';

  // Kön i runtime-controls.js håller ett emblem i 8000 ms. Golvet här är lägre än så med flit:
  // taket ska vara en egenskap hos KOREOGRAFIN, inte hos en siffra någon annan råkar äga idag.
  // 6500 ger koreografins 6100 ms en marginal på 400 ms utan att någonsin luta sig mot kön.
  const KORTASTE_VISNING = 6500;

  const STEGNYCKLAR = ['1', '2', '3', '4'];

  // FASERNA ÄR DESAMMA I VARJE STEG. Guardian Welcome lät hållet variera med storleken; här gör
  // det inte det, och skälet är att praktnivån redan är skillnaden. Ett steg 1 som spelade kortare
  // än ett steg 4 hade känts som två olika widgetar i stället för en widget med ett reglage.
  //
  // VAPENSKÖLDEN, fyra faser:
  //
  //   ljus (600)         Ljuset samlas på tom scen. Ingen del syns. Det är den enda fasen där
  //                      widgeten är en ljuskägla och inget mer — skulle skölden skymta fram här
  //                      vore ankomsten redan avslöjad.
  //   oppna (1200)       Skölden reser sig och delarna fälls ut UTIFRÅN OCH IN: bladverk och
  //                      voluter först, sedan krona och kristaller, sist sköld och namn. Rubriken
  //                      stämplas fram genom att teckenavståndet krymper, inte genom att tona in.
  //   hyllning (3500)    Hållet. Guldet andas och kristallerna glimtar; ingen annan del rör sig.
  //                      Namnet står absolut stilla — det är det tittaren ska hinna läsa.
  //   upplosning (800)   Allt tonar ut i omvänd ordning. Ljuset sist, så det släcks efter det som
  //                      stod i det.
  const FASER = ['ljus', 'oppna', 'hyllning', 'upplosning'];

  const TIDER = { ljus: 600, oppna: 1200, hyllning: 3500, upplosning: 800 };

  // REGISTRET ÖVER PRAKTSTEGEN. Ett steg utan post här går inte att rendera — och G-SLUT i
  // tests/guardian-emblem-fas.test.js kräver att fabriken, panelväljaren, katalogsektionen och den
  // här tabellen är exakt samma mängd, så ett femte steg kan inte läggas till någon annanstans
  // utan att någon skriver dess delar.
  //
  // DELARNA ÄR KUMULATIVA OCH ORDNADE. Varje steg börjar med föregående stegs lista, oförändrad,
  // och lägger till sina egna sist. Renderaren går igenom listan i ordning, så samma tabell styr
  // både VAD som ritas och I VILKEN ORDNING det staplas — ingen andra tabell att hålla i synk.
  const STEG_1 = ['skold', 'avatar', 'rubrik', 'banderoll', 'namn', 'undertext'];
  const STEG_2 = STEG_1.concat(['krona', 'kristall-vanster', 'kristall-hoger']);
  const STEG_3 = STEG_2.concat(['lov-vanster', 'lov-hoger', 'diamant']);
  const STEG_4 = STEG_3.concat(['stralkrans', 'voluter', 'sockel']);

  const STEG = {
    1: { namn: 'Vapensköld', delar: STEG_1 },
    2: { namn: 'Krona', delar: STEG_2 },
    3: { namn: 'Lagrar', delar: STEG_3 },
    4: { namn: 'Full prakt', delar: STEG_4 },
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
  const TEXT_NYCKLAR = ['rubrik', 'banderoll', 'undertext'];

  const TEXTER = {
    sv: { rubrik: 'BESKYDDAREN HAR ANLÄNT', banderoll: 'BESKYDDARE', undertext: 'Tack för ditt beskydd' },
    en: { rubrik: 'GUARDIAN HAS ARRIVED', banderoll: 'GUARDIAN', undertext: 'Thank you for your protection' },
  };

  function sprak(w) {
    const valt = w && w.guardianLang;
    if (valt === 'sv' || valt === 'en') return valt;
    const lang = root.VyraLang;                       // <- den enda raden som byts när VyraLang byggs
    const fran = lang && typeof lang.current === 'function' ? lang.current() : '';
    const kod = String(fran || (root.navigator && root.navigator.language) || '').toLowerCase();
    return kod.indexOf('en') === 0 ? 'en' : 'sv';
  }

  function text(lang) {
    const t = TEXTER[lang] || TEXTER.sv;
    return { rubrik: t.rubrik, banderoll: t.banderoll, undertext: t.undertext };
  }

  // ---- Koreografin -------------------------------------------------------------------------------

  // BYTBAR MED FLIT — se filhuvudet. Provet ersätter den med en manuell klocka.
  //
  // INVARIANT: DEN HÄR DEKLARATIONEN MÅSTE VARA FLERRADIG och sluta med `};` på egen rad.
  // G-KLOCKA i tests/guardian-emblem-fas.test.js lyfter bort just det här blocket ur källan innan
  // den letar efter direktanrop till setTimeout — skrivs den på en rad hittar vakten delegeringen
  // här nedanför och fäller filen för sitt eget undantag. Det är en FORMkoppling, inte en
  // beteendekoppling: bryts den blir provet rött, aldrig tyst grönt.
  const klocka = {
    satt: (fn, ms) => root.setTimeout(fn, ms),
    rensa: id => root.clearTimeout(id),
  };

  const delar = steg => (STEG[steg] && STEG[steg].delar) || null;
  const total = () => FASER.reduce((s, f) => s + TIDER[f], 0);

  // Steget läses ur lådans EGNA klasser i stället för ur widgetobjektet. Skälet är att det är den
  // RENDERADE lådan koreografin gäller: står det `ge-step-4` i DOM:en är det steg 4 som syns,
  // oavsett vad någon råkat skriva i state. Samma princip som renderer-honors-widget.
  function stegAv(box) {
    for (const k of box.classList) if (k.indexOf('ge-step-') === 0) return k.slice(8);
    return '';
  }

  function stadaKlasser(box) {
    [...box.classList].forEach(k => { if (k.indexOf(PREFIX) === 0) box.classList.remove(k) });
  }

  // Avbryter en pågående koreografi och lämnar lådan i sitt vilotillstånd. Anropas både vid en ny
  // trigger (omstart) och när sekvensen tar slut.
  function avbryt(box) {
    if (box._geFasTimers) box._geFasTimers.forEach(klocka.rensa);
    box._geFasTimers = [];
    stadaKlasser(box);
  }

  // Spelar faserna i ordning. Varje fas äger sin klass ENSAM — två faser är aldrig aktiva
  // samtidigt, så CSS:en aldrig behöver bry sig om kombinationer.
  function spela(box, steg = stegAv(box)) {
    avbryt(box);
    if (!delar(steg)) return false;
    box.classList.add(PREFIX + FASER[0]);
    let vid = 0;
    for (let i = 0; i < FASER.length; i += 1) {
      vid += TIDER[FASER[i]];
      const nasta = FASER[i + 1];
      const fran = FASER[i];
      box._geFasTimers.push(klocka.satt(() => {
        box.classList.remove(PREFIX + fran);
        if (nasta) box.classList.add(PREFIX + nasta);
      }, vid));
    }
    return true;
  }

  root.VyraGuardianEmblemFas = {
    PREFIX, FASER, TIDER, STEG, STEGNYCKLAR, KORTASTE_VISNING, TEXT_NYCKLAR,
    delar, total, stegAv, spela, avbryt, klocka, sprak, text,
  };

  // ---- Kopplingen till triggern --------------------------------------------------------------
  //
  // `triggerGuardianEmblem` i media.js talar inte om vilka lådor den tände; den returnerar inget.
  // Att räkna ut det igen här hade betytt att gatet fanns på två ställen — precis den sortens
  // dubblering som lät `card` och `hero` glida isär i Fan Level Up-familjen.
  //
  // Men triggern lämnar ett spår som går att läsa: för varje låda den tänder byter den ut
  // `box._geTimer`. Identiteten på det handtaget ändras alltså exakt för de lådor som triggades,
  // och för inga andra. Vi läser före och efter och jämför. En låda som redan spelade och INTE
  // triggades om får därmed behålla sin pågående koreografi i stället för att ryckas om från fas 1.
  //
  // EXAKT EN GÅNG, OCH INNANFÖR KÖN. runtime-controls.js byter kort efter start ut
  // `window.triggerGuardianEmblem` mot en KÖAD variant som bara lägger jobbet i VyraAlertQueue och
  // returnerar. Vi måste sitta innanför den kön: en koreografi som startar när alerten KÖAS i
  // stället för när den SPELAS hamnar ur takt med sin egen widget.
  let arKopplad = false;
  function koppla() {
    const original = root.triggerGuardianEmblem;
    if (arKopplad || typeof original !== 'function') return false;
    const kopplad = function () {
      const lador = [...root.document.querySelectorAll('.guardian-emblem')];
      const fore = new Map(lador.map(box => [box, box._geTimer]));
      const svar = original.apply(this, arguments);
      for (const box of root.document.querySelectorAll('.guardian-emblem')) {
        if (!box.classList.contains('ge-active')) continue;
        if (fore.has(box) && fore.get(box) === box._geTimer) continue;   // spelade redan
        spela(box);
      }
      return svar;
    };
    kopplad.__geFasKopplad = true;
    root.triggerGuardianEmblem = kopplad;
    arKopplad = true;
    return true;
  }
  root.VyraGuardianEmblemFas = Object.assign(root.VyraGuardianEmblemFas, { koppla, arKopplad: () => arKopplad });

  // media.js laddar den här filen ur skriptsvansen, alltså efter att triggern definierats — det
  // första försöket lyckas i praktiken alltid. Lyssnaren finns för det fall det inte gör det, och
  // slutar göra något så fort kopplingen suttit.
  koppla();
  root.document.addEventListener('load', () => koppla(), true);
})(window);
