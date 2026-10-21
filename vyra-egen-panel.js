(function () {
  'use strict';
  // EGEN TEXT I PANELRAMEN — PR 16 i panelspecifikationen (täckningen, avsnitt 6). En modell:
  // templateCustomText (catalog:custom:text), texten streamern själv skriver, rullande eller stilla.
  //
  // KONTROLLERNA ÄR DE SOM REDAN FINNS (custom-widgets.js customTextProps/customTextBind). Ramen flyttar
  // in dem med legacyId, så samma bindningar fortsätter att gälla: Text går live-vägen (vyraLivePatch),
  // resten committar med save() och render().
  //
  // INGET ▶ TESTA WIDGET. Widgeten har ingen händelse att spela: texten syns i vila precis som i sändningen,
  // och rullningen går hela tiden. Därför har posten inget test och panelen ingen sektion 1.
  //
  // FÖRÄNDRAT MOT DEN GAMLA PANELEN (fälten ligger kvar i state, ingenting byter namn):
  //   * Rullhastighet visas bara när Rulla oändligt är på — utan rullning läses den inte (studio.css:
  //     animationen sitter på .ctw-track.endless),
  //   * Skuggans X/Y/oskärpa har enheten i etiketten, och Skuggfärg verkar när det finns en skugga,
  //   * Ärv färgschema byggs av ramen (Textfärg ärver textfärgen), i stället för den gamla kryssrutan,
  //   * Lager verkar: renderaren skriver inget z-index själv, så vyra-lager.js gör det (PR 16).
  //
  // EGEN BILD OCH EGEN VIDEO, LÅTÖNSKNINGAR OCH SKATTKISTAN (slutgranskning B-013, 2026-10-20) fick sina poster här.
  // Utan post byggdes panelen av den gamla kedjan: sektionerna hette och låg INNEHÅLL → TEXT → POSITION & STORLEK
  // → … → PRESET, ingen Återställ utseende, tal utan enhet och, för bild och video, webbläsarens råa filfält och en
  // hel TEXT-sektion som bara styrde platshållaren. Bild och video väljs nu med mediaväljaren (lagring 'meta'):
  // en lokal fil blir {id, name, type, size} i w.mediaMeta precis som förut, och en molnlänk blir en sträng som
  // custom-widgets.js cwMediaUrl också ritar. Fälten ligger kvar i state — ingenting byter namn.

  const R = window.VyraPanelregister;
  if (!R || typeof R.definiera !== 'function') return;

  const rullar = w => !!w && w.textScrollEndless !== false;

  R.definiera({
    typ: 'templateCustomText',
    rubrik: () => 'Egen text',
    marke: w => 'Egen · ' + (rullar(w) ? 'rullande text' : 'text'),
    katalognyckel: () => 'catalog:custom:text',
    kontroller: [
      // 2 · Innehåll
      { sektion: 2, typ: 'text', kalla: 'egen', falt: 'customText', etikett: 'Text', legacyId: '#ctwText' },
      { sektion: 2, typ: 'kryss', falt: 'textScrollEndless', etikett: 'Rulla oändligt', legacyId: '#ctwEndless' },
      { sektion: 2, typ: 'tal', falt: 'textScrollSpeed', etikett: 'Rullhastighet', enhet: 's', legacyId: '#ctwSpeed', om: rullar },
      // 3 · Storlek och placering
      { sektion: 3, typ: 'std-position' },
      // 4 · Text
      { sektion: 4, typ: 'val', falt: 'textFontFamily', etikett: 'Typsnitt', legacyId: '#ctwFont', arv: 'fontFamily' },
      { sektion: 4, typ: 'tal', falt: 'textFontSize', etikett: 'Textstorlek', enhet: 'px', legacyId: '#ctwSize' },
      { sektion: 4, typ: 'tal', falt: 'textShadowX', etikett: 'Skugga X (px)', legacyId: '#ctwShadowX' },
      { sektion: 4, typ: 'tal', falt: 'textShadowY', etikett: 'Skugga Y (px)', legacyId: '#ctwShadowY' },
      { sektion: 4, typ: 'tal', falt: 'textShadowBlur', etikett: 'Skugga (px)', legacyId: '#ctwShadowBlur' },
      { sektion: 4, typ: 'farg', falt: 'textShadowColor', etikett: 'Skuggfärg', legacyId: '#ctwShadowColor' },
      // 5 · Utseende
      { sektion: 5, typ: 'farg', falt: 'textColor', etikett: 'Textfärg', legacyId: '#ctwColor', arv: 'text' },
      { sektion: 5, typ: 'kryss', falt: 'textRainbow', etikett: 'Regnbågsfärg', legacyId: '#ctwRainbow' },
      { sektion: 5, typ: 'std-bakgrund' },
      // 6 · Animation
      { sektion: 6, typ: 'std-entre' },
      // 7
      { sektion: 7, typ: 'std-aterstall' },
    ],
    utseendeFalt: ['textFontFamily', 'textFontSize', 'textColor', 'textRainbow', 'textShadowX', 'textShadowY',
      'textShadowBlur', 'textShadowColor', 'entranceAnimation', 'entranceDuration'],
  });

  // ---- Egen bild och Egen video --------------------------------------------------------------------
  // Ingen text (widgeten har ingen, utom studiotipset som overlayn inte ritar) och ingen bakgrund: lådan är
  // genomskinlig med !important (studio.css), så Färg/Styrka/Hörn hade varit kontroller utan verkan.
  const media = (typ, namn, medietyp) => R.definiera({
    typ,
    rubrik: () => namn,
    marke: w => 'Eget innehåll · ' + (w && w.mediaMeta ? (medietyp === 'video' ? 'vald video' : 'vald bild') : (medietyp === 'video' ? 'ingen video vald' : 'ingen bild vald')),
    katalognyckel: () => 'catalog:custom:' + (medietyp === 'video' ? 'video' : 'image'),
    utanText: true,
    test: 'egenmedia',
    kontroller: [
      // 2 · Innehåll
      { sektion: 2, typ: 'media', medietyp, falt: 'mediaMeta', lagring: 'meta', etikett: medietyp === 'video' ? 'Video' : 'Bild' },
      { sektion: 2, typ: 'val', falt: 'mediaFit', etikett: 'Anpassning', legacyId: '#cwFit' },
      // 3 · Storlek och placering
      { sektion: 3, typ: 'std-position' },
      // 5 · Utseende
      { sektion: 5, typ: 'tal', falt: 'mediaOpacity', etikett: 'Opacitet', enhet: '%', legacyId: '#cwOpacity' },
      // 6 · Animation
      { sektion: 6, typ: 'std-entre' },
      // 7
      { sektion: 7, typ: 'std-aterstall' },
    ],
    utseendeFalt: ['mediaFit', 'mediaOpacity', 'entranceAnimation', 'entranceDuration'],
  });
  media('templateCustomImage', 'Egen bild', 'bild');
  media('templateCustomVideo', 'Egen video', 'video');

  // ▶ TESTA WIDGET FÖR BILD OCH VIDEO (slutgranskning N-AB-008, 2026-10-20). Panelen hade ram men ingen sektion 1.
  // Bild och video har ingen händelse; det som går att prova är widgetens egen Inträdeseffekt (vyra-intro.js sätter
  // ws-anim-klassen i wh(), så klonen spelar den när den sätts in), en stund i bild och en uttoning. Utan vald
  // effekt är entrén 0 ms och tidslinjen visar den inte (vyra-testspel.js utanEntre).
  (function () {
    const T = window.VyraTestspel;
    if (!T || typeof T.registrera !== 'function' || (T.harAdapter && T.harAdapter('egenmedia'))) return;
    const entreMs = k => (k.entranceAnimation && k.entranceAnimation !== 'none' ? (Number(k.entranceDuration) || 600) : 0);
    const VISNING = 2500, UTGANG = 500;
    T.registrera('egenmedia', {
      utanEntre: w => entreMs(w) === 0,
      spela(nod, k, ex, ctl) {
        const entre = entreMs(k);
        ctl.setTimeout(() => {
          if (typeof nod.animate === 'function') nod.__egenUt = nod.animate([{ opacity: 1 }, { opacity: 0 }], { duration: UTGANG, fill: 'forwards' });
          else nod.style.opacity = '0';
        }, entre + VISNING);
        return { entre, visning: VISNING, utgang: UTGANG };
      },
      stoppa(nod) { if (nod.__egenUt) { try { nod.__egenUt.cancel(); } catch (_) {} nod.__egenUt = null; } },
    });
  })();

  // ---- Låtönskningar (latonskningar.js) --------------------------------------------------------------
  // Kontrollerna och deras bindningar är latonskningar.js egna; ramen flyttar in dem med legacyId. Styrknapparna
  // (Testa en önskning, Hoppa över, Töm kön) styr den riktiga kön och ligger kvar i sektion 2.
  R.definiera({
    typ: 'templateSongRequests',
    rubrik: () => 'Låtönskningar',
    marke: w => 'Live · ' + ((w && w.latKalla) === 'spotify' ? 'Spotify' : 'YouTube'),
    katalognyckel: w => 'catalog:latonskningar:' + ((w && w.latKalla) === 'spotify' ? 'spotify' : 'youtube'),
    utanText: true,
    kontroller: [
      // 1 · Inget ▶ Testa (slutgranskning N-AB-008): önskningarna kommer från chatten, och ett test som lade en låt
      // i kön hade nått den riktiga kön (och Spotify). Studion visar redan en exempelönskan; raden säger det.
      { sektion: 1, kalla: 'live', typ: 'text', etikett: 'Inget att testa – önskningarna kommer från chatten under sändningen, och studion visar redan en exempelönskan.' },
      // 2 · Innehåll
      { sektion: 2, typ: 'val', falt: 'latKalla', etikett: 'Spela via', legacyId: '#latKalla' },
      { sektion: 2, typ: 'text', falt: 'prLatKallaInfo', legacyId: '#latKallaInfo' },
      { sektion: 2, typ: 'text', falt: 'latKommando', etikett: 'Kommando', legacyId: '#latKommando' },
      { sektion: 2, typ: 'tal', falt: 'latCooldown', etikett: 'Väntetid per tittare (s)', legacyId: '#latCooldown' },
      { sektion: 2, typ: 'tal', falt: 'latMaxKo', etikett: 'Max antal låtar i kön (st)', legacyId: '#latMaxKo' },
      { sektion: 2, typ: 'tal', falt: 'latMaxMinuter', etikett: 'Max längd per låt (min)', legacyId: '#latMaxMinuter' },
      { sektion: 2, typ: 'text', falt: 'prLatSkip', legacyId: '#latSkipInfo' },
      { sektion: 2, typ: 'knapp', id: 'latStyr', legacyId: '#latStyr' },
      // 3 · Storlek och placering
      { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] },
      // 5 · Utseende
      { sektion: 5, typ: 'text', falt: 'latRubrik', etikett: 'Rubrik', legacyId: '#latRubrik' },
      { sektion: 5, typ: 'farg', falt: 'latFarg', etikett: 'Färg', legacyId: '#latFarg' },
      { sektion: 5, typ: 'kryss', falt: 'latVisaKo', etikett: 'Visa kön i widgeten', legacyId: '#latVisaKo' },
      { sektion: 5, typ: 'tal', falt: 'latVisa', etikett: 'Visa låtar i kön', enhet: 'st', legacyId: '#latVisa' },
      { sektion: 5, typ: 'tal', falt: 'latVolym', etikett: 'Volym (YouTube)', enhet: '%', legacyId: '#latVolym' },
      // 7
      { sektion: 7, typ: 'std-aterstall' },
    ],
    utseendeFalt: ['latFarg', 'latVisaKo', 'latVisa'],
  });

  // ---- Skattkistan (skattkista.js) -----------------------------------------------------------------
  // ▶ Testa kista (30 s) är skattkista.js egen knapp: den spelar en riktig kista genom samma väg som en
  // händelse, och ramen lägger den överst som ett test. Höjden följer innehållet och visas inte.
  R.definiera({
    typ: 'templateTreasureChest',
    rubrik: () => 'Skattkista',
    marke: w => 'Live · ' + ((w && w.kistaDesign) === 'pill' ? 'kompakt rad' : 'kista och stor nedräkning'),
    katalognyckel: w => 'catalog:skattkista:' + ((w && w.kistaDesign) === 'pill' ? 'pill' : 'kista'),
    utanText: true,
    kontroller: [
      // 1 · Testa
      { sektion: 1, typ: 'knapp', id: 'skTesta', etikett: '▶ Testa kista (30 s)', legacyId: '#skTesta' },
      // 2 · Innehåll
      { sektion: 2, typ: 'kryss', falt: 'kistaVisaAvsandare', etikett: 'Visa avsändaren', legacyId: '#skAvsandare' },
      { sektion: 2, typ: 'tal', falt: 'kistaEfterOppning', etikett: 'Visas öppen efteråt (s)', legacyId: '#skEfter' },
      { sektion: 2, typ: 'text', falt: 'prKistaInfo', legacyId: '#skInfo' },
      // 3 · Storlek och placering
      { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] },
      // 5 · Utseende
      { sektion: 5, typ: 'val', falt: 'kistaDesign', etikett: 'Design', legacyId: '#skDesign' },
      { sektion: 5, typ: 'farg', falt: 'kistaFarg', etikett: 'Färg', legacyId: '#skFarg' },
      { sektion: 5, typ: 'text', falt: 'kistaRubrik', etikett: 'Rubrik', legacyId: '#skRubrik' },
      // 7
      { sektion: 7, typ: 'std-aterstall' },
    ],
    utseendeFalt: ['kistaFarg', 'kistaVisaAvsandare'],
  });

  // ---- Egen text: "Ta bort bakgrund" utan bakgrund (slutgranskning B-036) --------------------------
  // Egen text ritas utan bakgrund tills Bakgrundsfärg eller Bakgrundsstyrka ändras
  // (widget-background.js lägger bara på en bakgrund när något av dem är satt). Kryssrutan
  // "Ta bort bakgrund" ändrade state men ingenting syntes. Den är inaktiv tills det finns en
  // bakgrund att ta bort, och raden säger varför. En sparad widget med bakgrund påverkas inte.
  const INGEN_BAKGRUND = 'Texten har ingen bakgrund än – välj Bakgrundsfärg eller Bakgrundsstyrka för att lägga till en.';
  function utanBakgrund(w) {
    const ruta = document.querySelector('.properties #wbHide');
    if (!ruta) return;
    const rad = ruta.closest('label') || ruta.parentElement;
    const tom = w.bgColor == null && w.bgStrength == null && !w.hideBackground;
    ruta.disabled = tom;
    // Förklaringen ligger I kryssrutans rad (panelramen flyttar raden och lägger främmande element
    // direkt i en sektion i förvaring), på en egen rad under rutan och texten.
    if (!rad) return;
    let not = rad.querySelector(':scope > .pr-egen-utan-bakgrund');
    if (tom && !not) {
      rad.style.flexWrap = 'wrap';
      rad.insertAdjacentHTML('beforeend', `<small class="pr-egen-utan-bakgrund" style="display:block;flex-basis:100%;opacity:.75;font-size:11px;margin:4px 0 0">${INGEN_BAKGRUND}</small>`);
    } else if (!tom && not) { not.remove(); rad.style.flexWrap = ''; }
  }
  if (typeof bind === 'function' && !new URLSearchParams(location.search).has('overlay')) {
    const tidigareBind = bind;
    bind = function () {
      const ut = tidigareBind.apply(this, arguments);
      try {
        const w = typeof liveWidget === 'function' && typeof selected !== 'undefined' ? liveWidget(selected) : null;
        if (typeof view !== 'undefined' && view === 'editor' && w && w.type === 'templateCustomText') {
          utanBakgrund(w);
          // widget-background.js bygger sin grupp i ett eget bind-omslag; en gång till när kedjan kört.
          Promise.resolve().then(() => { try { const x = liveWidget(selected); if (x && x.id === w.id) utanBakgrund(x); } catch (_) {} });
        }
      } catch (e) { console.error('[VyraEgenPanel]', e); }
      return ut;
    };
  }
})();
