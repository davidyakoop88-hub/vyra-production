// Etapp 6E: de tomma tillstanden fick en rost i Etapp 4 men aldrig hander.
//
// Uppmatt fore det har: tolv tillstand bar data-tom, ETT hade en handling. Resten sa "Skapa den
// forsta", "Lagg till en", "Anslut TikTok LIVE" utan att nagot gick att klicka pa.
//
// Ingen ny mekanism uppfinns har. Fas A matte att varje mal redan finns OCH ar synligt i samma
// vy — knappen tar bara dit anvandaren utan att hon forst maste hitta den sjalv.
//
// HANDLINGEN AR ETT SYSKON till [data-tom]-noden, aldrig ett barn. Rostvakten i
// tests/browser/tomma-tillstand.browser.test.js jamfor nodens textContent EXAKT mot fixturen,
// sa en knapp inuti noden hade fallt den. automatik-scenlank har burit sin knapp som syskon
// sedan Etapp 4 — det ar monstret som foljs.
//
// VARFOR EN MODUL OCH INTE MARKUP I VARJE RENDERARE: fem renderare i fyra filer ritar de har
// tillstanden, och tva av dem laddas dynamiskt av media.js. Ett statiskt skript kan inte lagga
// sig ytterst i den kedjan (tech-debt-kandidat §9), sa DOM-injektion efter render plus en
// MutationObserver ar den enda mekanism som nar alla fem.
(function () {
  'use strict';

  // Speglas av tests/fixtures/tomma-tillstand.js. Provet jamfor bada haller — sarar de sig
  // faller det, vilket ar meningen: rosten och handlingen ar ett beslut, inte en slump.
  const HANDLINGAR = {
    'automatik-actions': { etikett: 'Skapa din första Action', mal: '#newAeAction' },
    'automatik-events': { etikett: 'Koppla ditt första Event', mal: '#newAeEvent' },
    'automatik-timers': { etikett: 'Skapa din första timer', mal: '#newAeTimer' },
    'tts-special': { etikett: 'Lägg till användare', mal: '#ttsAddSpecial' },
    'handelser-tom': { etikett: 'Anslut TikTok LIVE', mal: '.connect' },
  };

  function rita() {
    for (const tom of document.querySelectorAll('#view [data-tom]')) {
      const def = HANDLINGAR[tom.getAttribute('data-tom')];
      if (!def) continue;

      const foralder = tom.parentElement;
      if (!foralder) continue;
      // Idempotens: vyerna ritas om vid varje vybyte och observern fyrar pa varje mutation.
      const redan = [...foralder.children].find(el => el !== tom && el.matches('[data-tom-handling]'));
      if (redan) {
        if (redan.getAttribute('data-tom-handling') !== def.mal) redan.remove();
        else continue;
      }

      const knapp = document.createElement('button');
      knapp.type = 'button';
      knapp.className = 'tom-handling';
      knapp.setAttribute('data-tom-handling', def.mal);
      knapp.textContent = def.etikett;
      tom.insertAdjacentElement('afterend', knapp);
    }
  }

  // Delegerad: knapparna skapas och forstors i takt med att vyer ritas om, sa en engangsbindning
  // hade slutat fungera vid forsta vybytet — samma fella som download-client.js (#175).
  document.addEventListener('click', e => {
    const knapp = e.target && e.target.closest && e.target.closest('[data-tom-handling]');
    if (!knapp) return;
    const mal = document.querySelector(knapp.getAttribute('data-tom-handling'));
    // Ingen reserv och ingen tystnad: finns inte malet ar knappen dod, och da ska den inte
    // heller ha ritats. Provet vaktar det; har raknar vi inte bort felet.
    if (mal) mal.click();
  });

  new MutationObserver(rita).observe(document.documentElement, { childList: true, subtree: true });
  rita();

  window.VyraTommaHandlingar = { HANDLINGAR, rita };
})();
