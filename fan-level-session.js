// fan-level-session.js — ger Fan Level Up en riktig trigger.
//
// Widgeten fanns färdig (åtta teman, vingar, stigande hjärtan, nivåpill, ribbon, per-nivå-video,
// egen uttoning) men kunde bara nås från panelens testknapp: media.js tände den på
// `type.includes('fan_level')`, och bryggan publicerar aldrig något sådant — bara gift, like, share,
// subscribe, member, chat, viewer, battle och follow.
//
// MODELLEN. TikTok rapporterar avsändarens fan-klubbsnivå på varje event från en tittare. Stiger den
// jämfört med den senast sedda nivån för samma användare är det en level-up. Ingen egen
// nivåberäkning — vi räknar inte ut vad någon BORDE ha för nivå, vi ser att TikTok nu rapporterar en
// högre siffra än förut. Från- och till-nivån faller ut gratis ur samma jämförelse.
//
// Första gången en tittare syns lärs nivån bara in. Utan en tidigare nivå finns ingen höjning att
// visa — annars hade varje ny tittare i chatten gett en level-up-alert direkt.
//
// INGENTING SPARAS. Kartan lever i minnet och försvinner med sidan. Ingen persistens mellan
// sändningar, och triggern skriver inte live-data till den sparade layouten.
//
// KÖN, OCH VARFÖR DEN ÄR LOKAL. Den delade VyraAlertQueue trimmar vid tio väntande och kastar allt
// äldre än 30 sekunder — den policyn gäller ALLA alerttyper och ska inte röras för den här
// widgetens skull. Lösningen är i stället att hålla kön här och släppa EN i taget till den delade
// kön. Då ser den delade kön aldrig mer än ett fan-level-jobb åt gången och kan inte trimma bort
// något, medan taket för allt annat är oförändrat.
(function (root) {
  'use strict';

  const MIN_NIVA = 1, MAX_NIVA = 50;
  // Nödbromsen finns bara mot en trasig ström som aldrig tar slut. Den ligger så högt att en normal
  // skur aldrig når den — tjugo samtidiga level-ups är mycket, tvåhundra är ett fel.
  const NODBROMS = 200;

  // Ett giltigt nivåvärde är ett heltal i 1–50. Allt annat — 0, negativt, NaN, strängar, Infinity,
  // 999 — betyder "ingen nivå rapporterad" och får aldrig räknas som en höjning.
  function nivaAv(e) {
    for (const v of [e.teamLevel, e.fanClubLevel]) {
      const n = Number(v);
      if (Number.isFinite(n) && Number.isInteger(n) && n >= MIN_NIVA && n <= MAX_NIVA) return n;
    }
    return 0;
  }

  const senaste = new Map();     // username -> senast sedd nivå. Bara i minnet.
  const ko = [];                 // väntande level-ups, i ankomstordning
  let spelar = false;
  let kastade = 0;

  // Hur länge en visning tar: widgetens egen tid plus dess uttoning. Läses vid varje uppspelning, så
  // en ändring i panelen slår igenom direkt.
  function visningsMs() {
    let w = null;
    try { w = root.state && root.state.widgets && root.state.widgets.find(x => x.type === 'templateFanLevel') } catch (_) {}
    const visa = Math.max(0, Number(w && w.fanDuration) || 6);
    const ut = Math.max(0, Number(w && w.fanExitDuration) || 0.5);
    return (visa + ut) * 1000 + 200;   // liten lucka så två alerts aldrig andas i varandra
  }

  function nasta() {
    if (spelar || !ko.length) return;
    const jobb = ko.shift();
    spelar = true;
    // Slås upp vid anropet: runtime-controls.js byter ut funktionen mot en köad variant en stund
    // efter start, och en tidig referens hade gått förbi den delade kön helt.
    if (typeof root.triggerFanLevelUp === 'function') root.triggerFanLevelUp(jobb);
    root.setTimeout(() => { spelar = false; nasta() }, visningsMs());
  }

  function koa(jobb) {
    if (ko.length >= NODBROMS) {
      kastade += 1;
      try {
        root.console && root.console.warn(
          `[VYRA fan-level] kön är full (${NODBROMS}), kastade ${kastade} level-ups — `
          + 'det här ska aldrig hända i normal användning');
      } catch (_) {}
      return;
    }
    ko.push(jobb);
    nasta();
  }

  function hantera(e) {
    const niva = nivaAv(e);
    if (!niva) return;
    const namn = String(e.username || e.name || e.userId || '').trim();
    if (!namn) return;
    const forra = senaste.get(namn);
    senaste.set(namn, niva);
    if (forra === undefined) return;   // första gången: lär bara in
    if (niva <= forra) return;         // oförändrad eller sänkt
    koa({
      name: namn,
      fromLevel: forra,
      level: niva,
      profileImage: String(e.profileImage || e.avatar || ''),
      isTeamMember: e.isTeamMember !== false
    });
  }

  const tidigareRoute = root.routeLiveBattleEvent;
  root.routeLiveBattleEvent = function (event = {}) {
    if (typeof tidigareRoute === 'function') tidigareRoute(event);
    hantera(event);
  };

  root.VyraFanLevel = {
    nivaAv,
    koLangd: () => ko.length,
    spelar: () => spelar,
    kastade: () => kastade,
    // Släpper nästa jobb direkt i stället för att vänta ut visningstiden. Finns för tester och för
    // felsökning; produktionen driver kön på timern i nasta().
    nastaNu: () => { spelar = false; nasta() },
    glom: () => { senaste.clear(); ko.length = 0; spelar = false; kastade = 0 }
  };
})(window);
