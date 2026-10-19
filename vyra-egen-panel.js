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
  // EGEN BILD OCH EGEN VIDEO har ingen post än: mediaväljaren (vyra-mediaval.js) skriver en molnlänk (en sträng)
  // i fältet när molnet är anslutet, men customImageHtml/customVideoHtml läser bara {id} ur IndexedDB
  // (cwResolveUrl). Det kräver en ändring i renderaren och provas för sig — se täckningslistan i PR 16.

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
})();
