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
})();
