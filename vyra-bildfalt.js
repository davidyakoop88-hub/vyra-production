(function () {
  'use strict';
  // PROFILBILD OCH GÅVOBILD FLYTTAR TILL EN EGEN, HOPFÄLLD GRUPP (2026-09-10).
  //
  // David om de två fälten i INNEHÅLL: "måste de vara synliga?"
  //
  // Nej. Uppmätt samma dag:
  //   * TikTok skriver över båda vid första gåvan (`person.profileImage || w.profileImage`)
  //   * En widget med TOMMA fält renderar exakt samma bilder — renderaren anropar
  //     `safeImg(w.profileImage, fallbackProfile)` och har en egen reservbild
  //   * Det är sökvägar man skriver för hand, i ett fält man rör en gång eller aldrig
  //
  // Kvar finns ett enda syfte: att välja en EGEN reservbild som visas innan första gåvan kommer.
  // Sällsynt, men inte värdelöst — därför göms fälten i stället för att tas bort. Samma val som
  // "Töm widget" fick.

  // ETIKETTEN AVGÖR, och den måste BÖRJA med Profilbild eller Gåvobild. En vidare regel på "bild"
  // eller "url" fångade tre saker som måste stanna där de är:
  //   * Egen bild-widgetens "Bild" — widgetens HELA innehåll, inte en reserv
  //   * "Video-URL" under VIDEO PER NIVÅ — en egen funktion i en egen grupp
  //   * kryssrutan "Profil" och reglaget "Profil/gåva" — de visar och skalar, de pekar inte ut
  //     någon sökväg alls
  const RESERVBILD = /^\s*(profilbild|gåvobild|gavobild)/i;

  const RUBRIK = 'BILDER';

  function etikettFor(falt) {
    const lbl = falt.closest('label');
    if (!lbl) return '';
    return [...lbl.childNodes]
      .filter(n => n.nodeType === 3 || (n.tagName && /^(SPAN|B)$/.test(n.tagName)))
      .map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  }

  function ska(falt) {
    if (falt.tagName !== 'INPUT') return false;
    if (falt.type && !/^(text|search|url)$/.test(falt.type)) return false;   // inte kryssruta, inte reglage
    if (falt.closest('[hidden]')) return false;
    return RESERVBILD.test(etikettFor(falt));
  }

  function flytta() {
    if (typeof view !== 'undefined' && view !== 'editor') return;
    const panel = document.querySelector('.properties');
    if (!panel) return;

    const rader = [];
    for (const falt of panel.querySelectorAll('input')) {
      if (!ska(falt)) continue;
      const rad = falt.closest('label');
      if (!rad || rad.closest('.vyra-bildfalt')) continue;   // redan flyttad
      rader.push(rad);
    }
    if (!rader.length) return;

    let grupp = panel.querySelector('.vyra-bildfalt');
    if (!grupp) {
      grupp = document.createElement('div');
      grupp.className = 'property-group vyra-bildfalt';
      grupp.innerHTML = `<h4>${RUBRIK}</h4>`;
      // Sist i panelen. vyra-panelordning.js flyttar den till rätt plats och fäller ihop den —
      // ordningen ägs på ett enda ställe, och det här är inte det stället.
      panel.append(grupp);
    }
    for (const rad of rader) grupp.append(rad);
  }

  if (typeof bind === 'function') {
    const foregaende = bind;
    bind = function () {
      const ut = foregaende.apply(this, arguments);
      // Två försök, som "Töm widget": panelbyggarna kör i en kedja vars ordning varierar, och ett
      // fält som byggs av en senare bindare finns inte när den här körs första gången.
      flytta();
      Promise.resolve().then(flytta);
      return ut;
    };
  }

  window.VyraBildfalt = { RESERVBILD, RUBRIK, ska, flytta };
})();
