// guardian-session.js — ger Guardian Emblem en riktig trigger.
//
// Widgeten fanns färdig (fyra praktsteg, heraldiskt vapen, koreografin i guardian-emblem-fas.js,
// språkval, köad via runtime-controls.js) men kunde bara nås från panelens testknapp. Enda
// anroparna av `window.triggerGuardianEmblem` var media.js:1058 (testknappen) och köwrappern i
// runtime-controls.js — INGEN livekedja alls. Det är samma mönster som en gång dolde Fan Level Up,
// Gifter Level Up, Battle MVP och Gift Fireworks: färdig grafik utan livetrigger.
//
// Kommentaren i tiktok-bridge/bridge.js påstod "Klientsidan ar redan klar ... vantar bara pa ett
// event". Triggern fanns, men ingenting anropade den. Den här filen är det som saknades.
//
// MODELLEN. Till skillnad från Fan/Gifter Level Up är Guardian ingen SIFFRA som stiger — det är en
// HÄNDELSE. Ingen jämförelse mot senast sedd nivå, ingen nivåkarta. Kommer ett event av typen
// 'guardian' tänds emblemet för den som kom in.
//
// TYPEN MATCHAS EXAKT, INTE SOM DELSTRÄNG. media.js:737 använder `type.includes(...)` för sina
// egna trigrar, men det duger inte här: TikTok har en gåva som heter "Guardian Wings"
// (assets/gifts/events/0006_Guardian_Wings.png). En delsträngsmatchning mot något som blandar in
// gåvonamnet hade tänt emblemet för varje såld gåva. Bara `e.type`/`e.event` läses, aldrig giftName.
//
// EN GÅNG PER TITTARE PER SÄNDNING. Bryggans egen kommentar (bridge.js, "GUARDIAN — FORBEREDD")
// listar `MEMBER med ett rollfalt (guardianType / userRole / badgeList)` som främsta kandidat. Är
// det så, bärs Guardian-statusen av VARJE event från den tittaren — en Guardian som skriver fyrtio
// chattrader hade gett fyrtio alerts. Spärren gör det ofarligt. Blir det i stället en engångs-
// händelse kostar spärren ingenting: den kan bara stoppa en upprepning.
//
// PRAKTSTEGET SÄTTS INTE HÄR. Steget (1–4) är ett STUDIOVAL som streamern gör i panelen — bryggan
// skickar det med flit inte, och den här filen skickar det inte vidare. Ett steg utifrån hade tyst
// skrivit över streamerns val. Eventet bär bara VEM som kom in.
//
// KÖN ÄR LOKAL, av samma skäl som i syskonfilerna. Den delade VyraAlertQueue trimmar vid tio
// väntande och kastar allt äldre än 30 s; den policyn gäller alla alerttyper och är orörd. Den här
// filen håller sin egen kö och släpper EN i taget dit, så den delade kön aldrig ser mer än ett
// guardian-jobb och inte kan trimma bort något.
(function (root) {
  'use strict';

  // Bara mot en trasig ström. Två samtidiga Guardians är mycket, tvåhundra är ett fel.
  const NODBROMS = 200;

  // Typen bryggan kommer att skicka. Skrivs på ETT ställe så att den dagen fältnamnet är uppmätt
  // och bridge.js aktiveras finns bara en sträng att stämma av mot.
  const TYP = 'guardian';

  function arGuardian(e) {
    return String((e && (e.type || e.event)) || '').trim().toLowerCase() === TYP;
  }

  // username -> när personen senast firades. Bara i minnet, nollas med glom().
  //
  // VAR EN Set, alltså "en gång per tittare per sändning". Den spärren var en GARDERING mot något
  // ingen visste då: om Guardian-statusen bars av VARJE event från tittaren hade en Guardian som
  // skrev fyrtio chattrader gett fyrtio alerts. Kommentaren överst sa själv att spärren "kostar
  // ingenting" om det i stället visade sig vara en engångshändelse.
  //
  // NU ÄR DET UPPMÄTT, och garderingen kostade något: den svalde riktiga återkomster.
  // Inspelning 2026-09-05T2111 (28 minuter, 176 chattrader, 373 member-event) bar exakt TVÅ
  // guardian-händelser — samma person, 19:14:28 och 19:23:50, nio minuter isär, båda med
  // scene='guardian_entrance'. Vore statusen ett rollfält på varje meddelande hade vi sett
  // hundratals. Bryggan fyrar bara på BARRAGE med subType 'guardian_entrance': en entré, inte en
  // egenskap.
  //
  // Kvar finns bara den risk mätningen INTE utesluter: att samma entré levereras två gånger tätt
  // inpå. Därför ett kort fönster i stället för ett evigt — se hantera().
  const sedda = new Map();
  const ko = [];
  let spelar = false;
  let kastade = 0;

  // Hur länge en visning tar. Emblemet har ingen egen visningstid i panelen — triggern i media.js
  // räknar den som `Math.max(VyraGuardianEmblemFas.total(), 6500)`, och den här filen speglar
  // exakt samma uttryck. Läses vid varje uppspelning, så en ändrad koreografi slår igenom direkt.
  function visningsMs() {
    let total = 0;
    try { const F = root.VyraGuardianEmblemFas; total = (F && F.total && F.total()) || 0 } catch (_) {}
    return Math.max(Number(total) || 0, 6500) + 200;   // liten lucka så två alerts aldrig andas i varandra
  }

  function nasta() {
    if (spelar || !ko.length) return;
    const jobb = ko.shift();
    spelar = true;
    // Slås upp vid ANROPET: runtime-controls.js byter ut funktionen mot en köad variant en stund
    // efter start, och en tidig referens hade gått förbi den delade kön helt.
    if (typeof root.triggerGuardianEmblem === 'function') root.triggerGuardianEmblem(jobb);
    root.setTimeout(() => { spelar = false; nasta() }, visningsMs());
  }

  function koa(jobb) {
    if (ko.length >= NODBROMS) {
      kastade += 1;
      try {
        root.console && root.console.warn(
          `[VYRA guardian] kön är full (${NODBROMS}), kastade ${kastade} guardians — `
          + 'det här ska aldrig hända i normal användning');
      } catch (_) {}
      return;
    }
    ko.push(jobb);
    nasta();
  }

  function hantera(e) {
    if (!arGuardian(e)) return;
    const namn = String((e && (e.username || e.name || e.userId)) || '').trim();
    if (!namn) return;                 // utan avsändare finns inget att visa
    // FÖNSTRET ÄR VISNINGSTIDEN, inte ett påhittat tal. Kommer samma person tillbaka medan hens
    // eget emblem fortfarande är på skärmen är det en dubblettleverans, inte en återkomst — och två
    // identiska emblem i rad ser ut som ett fel. Är emblemet färdigspelat är det en riktig entré och
    // ska firas igen. Fönstret följer koreografin automatiskt om den ändras.
    const nu = Date.now();
    const forra = sedda.get(namn);
    if (forra != null && nu - forra < visningsMs()) return;
    sedda.set(namn, nu);
    koa({
      username: namn,
      profileImage: String((e && (e.profileImage || e.avatar)) || '')
    });
  }

  const tidigareRoute = root.routeLiveBattleEvent;
  root.routeLiveBattleEvent = function (event = {}) {
    if (typeof tidigareRoute === 'function') tidigareRoute(event);
    hantera(event);
  };

  // Obligatorisk teardown. Utan den överlever spärren och kön ett kontobyte: nästa projektion hade
  // dels tystat en riktig Guardian som råkar heta samma sak, dels kunnat spela förra kontots köade
  // alerts. Samma lucka som mättes upp i gifter-level-session.js 2026-08-19.
  addEventListener('vyra-session-ended', () => root.VyraGuardian.glom());
  root.VyraSessionState?.registerTeardown?.('guardian-session', () => root.VyraGuardian.glom());

  root.VyraGuardian = {
    arGuardian,
    koLangd: () => ko.length,
    spelar: () => spelar,
    kastade: () => kastade,
    // Släpper nästa jobb direkt i stället för att vänta ut visningstiden. För tester och felsökning;
    // produktionen driver kön på timern i nasta().
    nastaNu: () => { spelar = false; nasta() },
    glom: () => { sedda.clear(); ko.length = 0; spelar = false; kastade = 0 }
  };
})(window);
