// gift-fireworks-session.js — ger Gift Fireworks en riktig trigger.
//
// Widgeten fanns färdig — tre rörelser, raketer, explosion, text, ljud, egen intro och outro — men
// kunde bara nås på två sätt: panelens testknapp, eller en Action som användaren själv lagt upp
// under Actions & Events med "firework" i widgetnamnet (action-runtime.js:62). En gåva från TikTok
// nådde aldrig fram av sig själv.
//
// UPPMÄTT 2026-08-06 mot deployad kod, riktig widget i DOM, gåva genom window.VyraLive.ingest:
// Top Gift fick klassen `play`, Gift Fireworks fick ingen klassändring alls, och
// triggerGiftFireworks anropades noll gånger.
//
// Samma döda trigger som Battle MVP, Fan Level Up och Gifter Level Up hade. Gift Fireworks är den
// fjärde. Att det inte upptäcktes har en enda orsak: PR #94 och #102 fixade hur triggern BETER sig,
// och varenda test i dem anropade `triggerGiftFireworks` direkt. Hela livevägen låg utanför det
// testerna såg, och därför var de gröna medan widgeten var död i sändning.
//
// FILEN BEDÖMER INGENTING OM GÅVAN. Gränsvärdet, anonymfiltret och om widgeten är dold ägs av
// triggern, där varje widget gör sin EGEN bedömning — det är hela poängen med att det numera får
// finnas flera fyrverkerier. Här skickas hela eventet vidare oförändrat. Duplicerades den logiken
// hit kunde de två komma isär utan att ett enda test blev rött.
//
// KÖN ÄR LOKAL. Den delade VyraAlertQueue trimmar vid tio väntande och kastar allt äldre än 30 s;
// den policyn gäller alla alerttyper och är orörd. Den här filen håller sin egen kö och släpper EN
// i taget dit, så den delade kön aldrig ser mer än ett fyrverkerijobb och inte kan trimma bort något.
(function (root) {
  'use strict';

  // Samma tre stavningar som live-leaderboard.js accepterar. Släpps bara `gift` igenom blir
  // comboavsluten tysta, och det är just de som bär de stora beloppen.
  const TYPER = new Set(['gift', 'gift_combo', 'giftcombo']);
  // Bara mot en trasig ström. Tjugo gåvor i en skur är en bra kväll, tvåhundra är ett fel.
  const NODBROMS = 200;

  const ko = [];
  let spelar = false;
  let kastade = 0;

  // Mäts på widgeten i stället för att hårdkodas: visningstiden är inställbar 2–10 s. Marginalen
  // ovanpå är för att nästa fyrverkeri inte ska börja i samma bildruta som det förra slutar.
  function visningsMs() {
    let w = null;
    try { w = root.state && root.state.widgets && root.state.widgets.find(x => x.type === 'templateGiftFireworks') } catch (_) {}
    const visa = Math.max(0, Number(w && w.fwDuration) || 5);
    return visa * 1000 + 200;
  }

  function nasta() {
    if (spelar || !ko.length) return;
    const jobb = ko.shift();
    spelar = true;
    // Slås upp vid anropet: runtime-controls.js byter ut funktionen mot en köad variant efter start,
    // och skripten injiceras asynkront av media.js — en tidig referens hade gått förbi kön.
    if (typeof root.triggerGiftFireworks === 'function') root.triggerGiftFireworks(jobb);
    root.setTimeout(() => { spelar = false; nasta() }, visningsMs());
  }

  function koa(jobb) {
    if (ko.length >= NODBROMS) {
      kastade += 1;
      try {
        root.console && root.console.warn(
          `[VYRA gift-fireworks] kön är full (${NODBROMS}), kastade ${kastade} gåvor — `
          + 'det här ska aldrig hända i normal användning');
      } catch (_) {}
      return;
    }
    ko.push(jobb);
    nasta();
  }

  function hantera(e) {
    if (!e || typeof e !== 'object') return;
    if (!TYPER.has(String(e.type || '').toLowerCase())) return;
    // Hela eventet, oförändrat: triggern läser användarnamn, gåvans namn, belopp och combo ur det.
    koa(e);
  }

  const tidigareRoute = root.routeLiveBattleEvent;
  root.routeLiveBattleEvent = function (event = {}) {
    if (typeof tidigareRoute === 'function') tidigareRoute(event);
    hantera(event);
  };

  // Utan det här spelar nästa sändning upp förra sändningens gåvor.
  try {
    root.addEventListener('vyra-session-ended', () => { ko.length = 0; spelar = false });
  } catch (_) {}

  root.VyraGiftFireworks = {
    koLangd: () => ko.length,
    spelar: () => spelar,
    kastade: () => kastade,
    nastaNu: () => { spelar = false; nasta() },
    glom: () => { ko.length = 0; spelar = false; kastade = 0 }
  };
})(window);
