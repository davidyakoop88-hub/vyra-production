// DUKENS GRÄNS — så att en widget aldrig kan dras bort ur bildrutan, och så att den som
// ändå sticker ut SYNS i editorn.
//
// BAKGRUND, uppmätt 2026-09-19: Davids layout hade Top Gift på x=-16 och Top Like på x=688
// i en duk som är 432 bred — 256 px bortom kanten. Editorn lät honom dra dit och sa
// ingenting, så widgetarna fanns kvar i datan men syntes aldrig i OBS eller TikTok LIVE
// Studio. Samma mönster fanns i bandet från sändningen 2026-09-18 (Top Gift x=736,
// Battle MVP y=768).
//
// VARFÖR INTE FULL INNESLUTNING. Den första versionen klämde så att HELA widgeten rymdes.
// Den föll på snapp.browser.test.js prov 4, och mätningen visade varför: widgetarna renderar
// 220 × 388 oavsett `width`, så två av dem får inte plats sida vid sida i en 432 bred duk och
// inte staplade i en 768 hög. Kant-mot-kant-snappen är byggd med flit och har eget prov. Full
// inneslutning hade tagit bort den funktionen för att laga en annan — det vore fel byte.
//
// REGELN BLEV: widgetens origo måste ligga kvar på duken, med minst en rutnätsruta (8 px)
// kvar. Då går det inte längre att tappa bort en widget, och snappen är orörd. Det är en
// SVAGARE garanti än inneslutning — en widget kan fortfarande sticka ut till största delen —
// och därför märks den ut visuellt i stället (se markera() längre ned).
//
// DUKENS MÅTT LÄSES UR DOM:EN, aldrig hårdkodat. `.editor-shell .canvas` har
// `width:var(--layout-width,432px)` (studio.css:570) och layout-format.js skriver om
// variabeln vid formatbyte. En hårdkodad 432:a hade tyst gett fel gräns för `widescreen`.
// offsetWidth är LAYOUTstorlek och påverkas inte av zoomens CSS-transform.
//
// VI RÖR ALDRIG BEFINTLIGA LÄGEN VID INLÄSNING. En engångsflytt av redan sparade widgetar
// hade skrivit om kundens layout bakom ryggen på hen — samma klass av fel som
// mount-migreringarna. Gränsen gäller det användaren gör härifrån och framåt.
(function (root) {
  'use strict';

  var STANDARD = { bredd: 432, hojd: 768 };
  var MIN_KVAR = 8;               // en rutnätsruta, samma mått som snappens rutnät

  function duken() {
    try {
      var c = document.querySelector('.editor-shell .canvas') || document.querySelector('.canvas');
      if (c && c.offsetWidth > 0 && c.offsetHeight > 0) {
        return { bredd: c.offsetWidth, hojd: c.offsetHeight };
      }
    } catch (e) {}
    return { bredd: STANDARD.bredd, hojd: STANDARD.hojd };
  }

  function klampEtt(varde, dukMatt) {
    if (!Number.isFinite(varde)) return 0;
    return Math.min(Math.max(0, varde), Math.max(0, dukMatt - MIN_KVAR));
  }

  function klamp(vanster, topp, dukMatt) {
    var d = dukMatt || duken();
    return { vanster: klampEtt(vanster, d.bredd), topp: klampEtt(topp, d.hojd) };
  }

  // Sant när widgeten sticker ut ur duken — åt något håll. Flyttar ingenting; används av
  // markeringen så att den som redan står fel går att se utan att layouten skrivs om.
  function stickerUt(vanster, topp, bredd, hojd, dukMatt) {
    var d = dukMatt || duken();
    return vanster < 0 || topp < 0 ||
      vanster + (bredd || 0) > d.bredd || topp + (hojd || 0) > d.hojd;
  }

  // ---- MARKERINGEN -----------------------------------------------------------------------
  // ALDRIG I SÄNDNINGEN. overlay-output är OBS/TikTok-utdata; en markering där hade stått
  // mitt i bilden för tittarna. Samma regel som lankraden i #264 och felrutan i #470.
  function iEditorn() {
    try {
      return !document.documentElement.classList.contains('overlay-output');
    } catch (e) { return false; }
  }

  function markera() {
    if (!iEditorn()) return 0;
    var d = duken(), antal = 0;
    try {
      document.querySelectorAll('.editor-shell .canvas .widget[data-id]').forEach(function (el) {
        var ut = stickerUt(parseInt(el.style.left, 10), parseInt(el.style.top, 10),
          el.offsetWidth, el.offsetHeight, d);
        if (ut) { el.dataset.utanforDuken = '1'; antal++; }
        else delete el.dataset.utanforDuken;
      });
    } catch (e) {}
    return antal;
  }

  var api = {
    klamp: klamp, klampEtt: klampEtt, duken: duken,
    stickerUt: stickerUt, markera: markera, MIN_KVAR: MIN_KVAR, STANDARD: STANDARD
  };

  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  root.VyraGrans = api;

  // Markeringen körs efter varje render. render() byter ut noderna, så en klass satt en gång
  // hade försvunnit vid nästa ritning.
  if (typeof root.render === 'function') {
    var forra = root.render;
    root.render = function () { var r = forra.apply(this, arguments); markera(); return r; };
  }
})(typeof window !== 'undefined' ? window : globalThis);
