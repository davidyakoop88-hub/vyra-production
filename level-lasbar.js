/* LÄSBARA LEVEL-LARM I LITEN STORLEK — Gifter Level Up och Fan Level Up, alla layouter.
 *
 * Davids ord 2026-10-12: "ramarna syns knappt så tydliga — overlaylive.app har ramar som ser
 * tydligt på liven men inte mina" och "grejen är när man har dem i mini läge (liten storlek) så
 * ser man inte dem tydligt". Det finns ingen mini-inställning: det är när widgeten görs liten.
 *
 * En widget blir liten på TVÅ sätt, och bägge måste räknas:
 *   1. Bredd-fältet (w.width) — sidolayouterna struntade i det helt (fast 290-320 px i CSS).
 *   2. Storlekshandtaget, som sätter w.widgetScale och ritar widgeten med CSS `zoom`.
 * En ren container query ser bara det första. UPPMÄTT i Chromium 154 (2026-10-12): en container på
 * 260 px med `zoom:.5` rapporterar fortfarande 260 px till @container, och en text med
 * `max(12px, 5cqi)` ritas 6,5 px hög. Därför avgör renderaren kompaktläget på den EFFEKTIVA
 * bredden (bredd × zoom) och sätter klassen `lv-kompakt`; CSS:en i level-lasbar.css gör resten med
 * container-enheter (cqi) inne i widgeten och `--lv-z` för att hålla minsta textstorlek i
 * designpixlar även under zoom.
 *
 * Tröskeln är mätt, inte gissad (tabellen i PR:en fix/level-lasbar): i vanligt läge ritas namnet i 15-18 px och
 * profilbilden i 42-86 px oberoende av bredd, så vid effektiv bredd under ~210 designpixlar faller
 * namnet under 12 px (18 px × 180/270) och bilden under en tredjedel av ytan.
 *
 * Inget här rör kön (runtime-controls.js) eller triggerns logik — bara HTML-strängen och hur
 * nivåtexten delas upp, med exakt samma textContent som förut. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof window.wh !== 'function') return;

  const KOMPAKT_UNDER = 210;
  // Layouter vars bredd CSS:en låser oavsett w.width (studio.css). Bredd-fältet respekteras för
  // dem först när det begärs smalare än kompakttröskeln — då ska kortet faktiskt bli så smalt.
  const FAST = {
    templateGifterLevel: { sidebadge: 300, flip: 290, duo: 300 },
    templateFanLevel: { heartbeat: 300, duo: 320 },
  };
  const STANDARD = { templateGifterLevel: 270, templateFanLevel: 260 };

  function tal(v, reserv) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : reserv; }

  /* Effektiv bredd i designpixlar och den bredd kortet ska ritas med (före zoom). */
  function matt(w) {
    const typ = w && w.type;
    const layout = typ === 'templateGifterLevel' ? (w.gifterLayout || 'profile') : (w.fanLayout || 'hero');
    const fast = (FAST[typ] || {})[layout];
    const begard = tal(w.width, STANDARD[typ] || 260);
    const bas = fast ? (begard < KOMPAKT_UNDER ? begard : fast) : begard;
    const z = Math.max(0.1, tal(w.widgetScale, 1));
    const effektiv = bas * z;
    return { bas, z, effektiv, kompakt: effektiv < KOMPAKT_UNDER };
  }

  const tidigareWh = window.wh;
  window.wh = function (w) {
    const html = tidigareWh.apply(this, arguments);
    if (!w || (w.type !== 'templateGifterLevel' && w.type !== 'templateFanLevel') || typeof html !== 'string') return html;
    const m = matt(w);
    return html
      .replace('class="widget ', `class="widget lv-las${m.kompakt ? ' lv-kompakt' : ''} `)
      .replace('style="', `style="--lv-z:${+m.z.toFixed(3)};--lv-b:${Math.round(m.bas)}px;`);
  };

  /* NIVÅTEXTEN I DELAR. gifterSattNiva skrev "LV. 1 → 9" som en enda textnod, så kompaktläget
     kunde inte visa bara den nya nivån. Samma textContent som förut (provet för transformations-
     sekvensen läser den), men från-delen ligger i ett eget <b> som CSS:en kan dölja. Inte <span>: studio.css döljer
     `.gifter-level-badge span` (den gamla etiketten), och då försvann siffran helt — uppmätt. */
  if (typeof window.gifterSattNiva === 'function') {
    const tidigare = window.gifterSattNiva;
    const ny = function (box, niva, text) {
      tidigare(box, niva, text);
      const brick = box && box.querySelector && box.querySelector('.gifter-level-badge strong');
      if (!brick) return;
      const delar = /^(.*?)\s*→\s*(.*)$/.exec(String(text));
      if (!delar) return;
      const fran = document.createElement('b');
      fran.className = 'lv-fran';
      fran.textContent = delar[1] + ' → ';
      const till = document.createElement('b');
      till.className = 'lv-till';
      till.textContent = delar[2];
      brick.textContent = 'LV. ';
      brick.append(fran, till);
    };
    window.gifterSattNiva = ny;
  }

  window.VyraLevelLasbar = { KOMPAKT_UNDER, FAST, matt };
  if (typeof window.render === 'function') { try { window.render() } catch (_) {} }
})();
