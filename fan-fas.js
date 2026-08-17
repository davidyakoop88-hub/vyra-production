// fan-fas.js — koreografin för Fan Level Up, en fas i taget.
//
// VARFÖR FILEN FINNS. Gifter Level Up har redan exakt den här mekanismen, men den ligger inne i
// media.js (gifterTransform, rad 583–597): tre klasser som byts av tre setTimeout, med tiderna
// namngivna så ett prov kan bevisa att hela sekvensen ryms i den kortaste visningstiden.
// Mönstret är rätt. Platsen är fel — CLAUDE.md säger rakt ut att media.js är störst i repot och
// att nya renderare hör hemma i en systerfil. Fan Level Up får därför sin koreografi här, och
// gifter-varianten är förlagan snarare än något att kopiera in.
//
// VAD EN FAS ÄR. En fas är en klass på widgetlådan plus en varaktighet. Klassen heter
// `fan-fas-<namn>`, och CSS:en i premium-final.css hänger sina animationer på den. JS bestämmer
// alltså NÄR något händer, CSS bestämmer VAD. Den uppdelningen är hela poängen: en ändrad
// rörelse ska aldrig kräva en ändrad timer, och en ändrad timing ska aldrig kräva ny CSS.
//
// KLOCKAN GÅR ATT BYTA UT. `klocka` är en öppen krok med flit. Ett prov som ska bevisa att fas 2
// följer fas 1 skulle annars behöva sova 420 ms per påstående — långsamt, och flaky på en lastad
// maskin. Med en manuell klocka blir samma prov exakt och tar noll tid. Det är samma skäl som
// gör att tiderna nedan är namngivna konstanter och inte siffror inne i ett anrop.
//
// TAKET. Visningstidsreglaget i egenskapspanelen börjar på 2 sekunder. En koreografi som är
// längre än så hinner aldrig spelas färdigt innan uttoningen börjar, och tittaren ser en
// avhuggen rörelse. `KORTASTE_VISNING` är den gränsen, och F3 i tests/fan-fas.test.js vaktar
// den för varje registrerad modell — inte bara för dem som råkar finnas idag.
(function (root) {
  'use strict';

  const PREFIX = 'fan-fas-';

  // Reglaget `fanDuration` går från 2 till 15 sekunder (media.js, fanTriggerProps). Ingen
  // koreografi får vara längre än golvet.
  const KORTASTE_VISNING = 2000;

  // REGISTRET. En modell utan post här får ingen koreografi alls — den spelar som förut, med
  // bara `fan-active` och basens fanAlertEnter. Det är avsiktligt: modellerna byggs en i taget,
  // och en halvfärdig fas är sämre än ingen fas.
  //
  // hero · SAMLINGEN. Hjärtat kommer först och ensamt, stiger ur botten och pulsar — pulsen är
  // basens egen `fanLevelPop`, inte en ny animation, så den fortsätter oavbrutet efteråt. Sedan
  // samlas resten runt det: profilbild, nivåpill, rubrik, namn, meddelande, i den ordningen och
  // med en trappa emellan. Sist lägger sig glöden. Totalt 1250 ms, samma total som gifter-
  // sekvensen — inte av en slump, utan för att två alerts från samma familj ska kännas som
  // samma app.
  //
  // ribbon · VÄLKOMNANDET. Profilbilden poppar, banderollen rullar ut i sidled, texten kommer
  // sist. Även här är rörelserna modellens egna (fbProfilePop, frbUnfurl) och det är klockan som
  // byts. Uppmätt före: poppen och utrullningen rörde sig redan mjukt, men rubrik, namn och
  // meddelande stod på opacity 1 i första bildrutan — färdiglästa medan banderollen fortfarande
  // var hoprullad till 30 % bredd. Widgeten berättade slutet före början.
  //
  // Ribbon är dessutom den enda modellen UTAN vilolager: `.fan-burst` är display:none, och med
  // hjärtat försvinner basens två enda oändliga animationer (fanLevelPop, fanRing). Efter entrén
  // stod modellen fullständigt stilla. Den har därför fått en egen diskret andning — men på
  // modellen, inte på en fas. En `infinite` som hänger på en fasklass dör när klassen tas bort,
  // alltså precis när den skulle ha börjat behövas. Vaktat av 18g.
  //
  // stack · MOTTAGANDET. Ikonen faller ner uppifrån, nivåpillen poppar fram, profilbilden stiger
  // underifrån — och namnet och meddelandet stiger med den. Rörelserna är stacks EGNA sedan
  // tidigare (fsIconDrop, fsPillPop, fsAvatarRise i studio.css, delade med hearts och loyalty);
  // det som byts är klockan. Förut låg den i CSS:ens `animation-delay` på `.fan-active`, vilket
  // gjorde tre saker: F3:s tak på 2 s kunde inte se stacks timing alls, familjen hade två olika
  // klockor, och `h3`/`p` hade ingen rörelse att fördröja — de snäppte fram i samma bildruta som
  // lådan medan resten koreograferades.
  const FASER = {
    hero: [
      { namn: 'hjarta', ms: 420 },
      { namn: 'samling', ms: 560 },
      { namn: 'vila', ms: 270 },
    ],
    stack: [
      { namn: 'fall', ms: 300 },
      { namn: 'pop', ms: 260 },
      { namn: 'stigning', ms: 340 },
    ],
    ribbon: [
      { namn: 'pop', ms: 320 },
      { namn: 'utrullning', ms: 420 },
      { namn: 'text', ms: 340 },
    ],
  };

  // Bytbar med flit — se filhuvudet. Provet ersätter den med en manuell klocka.
  const klocka = {
    satt: (fn, ms) => root.setTimeout(fn, ms),
    rensa: id => root.clearTimeout(id),
  };

  const faser = layout => FASER[layout] || null;
  const total = layout => (faser(layout) || []).reduce((s, f) => s + f.ms, 0);

  // Modellen läses ur lådans egna klasser i stället för ur widgetobjektet. Skälet är att det är
  // DEN RENDERADE lådan koreografin gäller: står det `fan-layout-hero` i DOM:en är det hero som
  // syns, oavsett vad någon råkat skriva i state. Samma princip som renderer-honors-widget.
  function layoutAv(box) {
    for (const k of box.classList) if (k.startsWith('fan-layout-')) return k.slice(11);
    return '';
  }

  function stadaKlasser(box) {
    [...box.classList].forEach(k => { if (k.startsWith(PREFIX)) box.classList.remove(k) });
  }

  // Avbryter en pågående koreografi och lämnar lådan i sitt vilotillstånd. Anropas både vid en
  // ny trigger (omstart) och när sekvensen tar slut.
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

  root.VyraFanFas = { PREFIX, FASER, KORTASTE_VISNING, faser, total, layoutAv, spela, avbryt, klocka };

  // ---- Kopplingen till triggern --------------------------------------------------------------
  //
  // `triggerFanLevelUp` i media.js talar inte om vilka lådor den tände; den returnerar inget.
  // Att räkna ut det igen här hade betytt att gatet (fanTeamOnly, autoTrigger, minLevel) fanns
  // på två ställen — precis den sortens dubblering som lät `card` och `hero` glida isär.
  //
  // Men triggern lämnar ett spår som går att läsa: för varje låda den tänder gör den
  // `clearTimeout(box._fanTimer)` och sätter ett NYTT `box._fanTimer`. Identiteten på det
  // handtaget byts alltså exakt för de lådor som triggades, och för inga andra. Vi läser före
  // och efter och jämför. En låda som redan spelade och INTE triggades om får därmed behålla
  // sin pågående koreografi i stället för att ryckas om från fas 1.
  //
  // Kopplingen till `_fanTimer` är medveten och vaktad: F2 i provet faller om media.js slutar
  // sätta fältet.
  //
  // EXAKT EN GÅNG, OCH TIDIGT. runtime-controls.js byter 500 ms efter start ut
  // `window.triggerFanLevelUp` mot en KÖAD variant som bara lägger jobbet i VyraAlertQueue och
  // returnerar. Vi måste sitta INNANFÖR den kön: en koreografi som startar när alerten köas i
  // stället för när den spelas hamnar ur takt med sin egen widget — flera sekunder fel under en
  // gåvostorm.
  //
  // Ett första försök tolererade omkoppling ("laddordningen är inte garanterad") och lindade
  // därför en andra gång runt köaren. Uppmätt i Chromium: den yttre linden såg aldrig
  // `_fanTimer` ändras, eftersom köaren returnerar innan alerten spelat, och gjorde ingenting —
  // ofarligt den här gången, men bara av en slump. Kopplingen sker nu en enda gång, och
  // återförsöken slutar i samma stund den lyckats.
  let arKopplad = false;
  function koppla() {
    const original = root.triggerFanLevelUp;
    if (arKopplad || typeof original !== 'function') return false;
    const kopplad = function (event) {
      const lador = [...root.document.querySelectorAll('.fan-level-up')];
      const fore = new Map(lador.map(box => [box, box._fanTimer]));
      const svar = original.apply(this, arguments);
      for (const box of root.document.querySelectorAll('.fan-level-up')) {
        if (!box.classList.contains('fan-active')) continue;
        if (fore.has(box) && fore.get(box) === box._fanTimer) continue;   // spelade redan
        spela(box);
      }
      return svar;
    };
    kopplad.__fasKopplad = true;
    root.triggerFanLevelUp = kopplad;
    arKopplad = true;
    return true;
  }
  root.VyraFanFas = Object.assign(root.VyraFanFas, { koppla, arKopplad: () => arKopplad });

  // media.js laddar den här filen ur skriptsvansen, alltså efter att triggern definierats — det
  // första försöket lyckas i praktiken alltid. Lyssnaren finns för det fall det inte gör det, och
  // slutar göra något så fort kopplingen suttit.
  koppla();
  root.document.addEventListener('load', () => koppla(), true);
})(window);
