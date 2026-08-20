// gifter-level-session.js — ger Gifter Level Up en riktig trigger.
//
// Widgeten fanns färdig (omloppsbana med avatar, diamantstapel, nivåbricka, pilar, egen uttoning)
// men kunde bara nås från panelens testknapp: media.js tände den på `type.includes('gifter_level')`,
// och bryggan publicerar aldrig något sådant.
//
// SKILLNADEN MOT FAN LEVEL UP. Där fanns nivån redan i bryggan och ströks bara av molnet.
// Gifter-nivån fanns inte NÅGONSTANS i kedjan: TikTok bär den på `user.payGrade.level` (UserHonor i
// tiktok-live-proto v3), och ingen rad läste det fältet. Därför utökades tre lager — normalizern,
// molnkontraktet och den här filen.
//
// Det är ett ANNAT tal än fan club-nivån: fan club-nivån gäller mot en enskild streamer,
// gifter-nivån är tittarens globala spenderingsgrad. De får aldrig blandas ihop, och ett test
// vaktar just det.
//
// MODELLEN, samma som Fan Level Up: stiger nivån jämfört med senast sedda nivån för samma användare
// är det en level-up. Ingen egen nivåberäkning. Första gången en tittare syns lärs nivån bara in.
// Kartan lever i minnet och försvinner med sidan — inget skrivs till layouten.
//
// KÖN ÄR LOKAL. Den delade VyraAlertQueue trimmar vid tio väntande och kastar allt äldre än 30 s;
// den policyn gäller alla alerttyper och är orörd. Den här filen håller sin egen kö och släpper EN
// i taget dit, så den delade kön aldrig ser mer än ett gifter-jobb och inte kan trimma bort något.
(function (root) {
  'use strict';

  const MIN_NIVA = 1, MAX_NIVA = 50;
  // Bara mot en trasig ström. Tjugo samtidiga level-ups är mycket, tvåhundra är ett fel.
  const NODBROMS = 200;

  // Giltigt är ett heltal i 1–50. Allt annat betyder "ingen nivå rapporterad". Bara gifterLevel
  // läses — teamLevel/fanClubLevel hör till Fan Level Up och får inte tända den här widgeten.
  function nivaAv(e) {
    const n = Number(e.gifterLevel);
    return (Number.isFinite(n) && Number.isInteger(n) && n >= MIN_NIVA && n <= MAX_NIVA) ? n : 0;
  }

  const senaste = new Map();
  const ko = [];
  let spelar = false;
  let kastade = 0;

  function visningsMs() {
    let w = null;
    try { w = root.state && root.state.widgets && root.state.widgets.find(x => x.type === 'templateGifterLevel') } catch (_) {}
    const visa = Math.max(0, Number(w && w.gifterDuration) || 6);
    const ut = Math.max(0, Number(w && w.gifterExitDuration) || 0.5);
    return (visa + ut) * 1000 + 200;
  }

  function nasta() {
    if (spelar || !ko.length) return;
    const jobb = ko.shift();
    spelar = true;
    // Slås upp vid anropet: runtime-controls.js byter ut funktionen mot en köad variant efter start.
    if (typeof root.triggerGifterLevelUp === 'function') root.triggerGifterLevelUp(jobb);
    root.setTimeout(() => { spelar = false; nasta() }, visningsMs());
  }

  function koa(jobb) {
    if (ko.length >= NODBROMS) {
      kastade += 1;
      try {
        root.console && root.console.warn(
          `[VYRA gifter-level] kön är full (${NODBROMS}), kastade ${kastade} level-ups — `
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

    // SERVERN ÄGER JÄMFÖRELSEN — se viewer-levels.js. Kartan här lever i RAM och dör med sidan, så
    // den ser bara en höjning om samma tittare syns två gånger i samma sändning. Spendergraden
    // rör sig långsammare än så.
    const stampel = e.gifterLevelUp;
    if (stampel && Number(stampel.to) > Number(stampel.from)) {
      koa({
        name: namn,
        fromLevel: Number(stampel.from),
        level: Number(stampel.to),
        profileImage: String(e.profileImage || e.avatar || '')
      });
      return;
    }

    // RESERVEN gäller bara event som aldrig passerat molnets ingest — desktop-appen publicerar
    // direkt till klienten och stämplar ingenting.
    if (forra === undefined) return;
    if (niva <= forra) return;
    koa({
      name: namn,
      fromLevel: forra,
      level: niva,
      profileImage: String(e.profileImage || e.avatar || '')
    });
  }

  const tidigareRoute = root.routeLiveBattleEvent;
  root.routeLiveBattleEvent = function (event = {}) {
    if (typeof tidigareRoute === 'function') tidigareRoute(event);
    hantera(event);
  };

  // Teardown-luckan (uppmätt 2026-08-19): utan den överlever nivåkartan och kön ett kontobyte,
  // och nästa projektion ärver förra kontots nivåer — kontraktets obligatoriska teardown.
  addEventListener('vyra-session-ended', () => root.VyraGifterLevel.glom());
  root.VyraSessionState?.registerTeardown?.('gifter-level-session', () => root.VyraGifterLevel.glom());

  root.VyraGifterLevel = {
    nivaAv,
    koLangd: () => ko.length,
    spelar: () => spelar,
    kastade: () => kastade,
    nastaNu: () => { spelar = false; nasta() },
    glom: () => { senaste.clear(); ko.length = 0; spelar = false; kastade = 0 }
  };
})(window);
