// fan-hjarta-heartgift.js — Fan Level Up · Hjärtats gåva (modell 3 av hjärtmodellerna, fan-hjarta.js).
//
// Hjärtat kommer in från vänster och lämnar en glödande gåva: en ljuspunkt som flyger in i ringen,
// blommar upp och blir personens profilbild. Sedan kommer namnet och nivån, och hjärtat självt —
// samma element — flyger ner till märket bredvid den nya nivåsiffran. Prototypen:
// fan-heart-gift-approved.html (Codex 2026-11-05). Scenen är 460×510, inte 430×610 som de andra.
//
// GRANSKNINGEN (2026-11-05, prototypen spelad i Chromium och avläst varje bildruta).
//   * Hjärtat STOD STILL 1,1 s (giftHandover 24 %–46 % hade samma nyckelbild två gånger) och
//     bromsade sedan till noll igen vid 3,5 s, så flygningen vid 4 s startade ur vila: stopp, stopp,
//     start. Banan är nu en mjuk kurva (fan-hjarta-heartgift.css, fhgHjarta) som aldrig står still —
//     hjärtat svävar vid gåvan, backar undan när porträttet växer fram och är fortfarande på väg
//     nedåt när flygningen tar över, så motorn får med sig farten in i flygningen.
//   * I landningen VÄXTE märket från 112 till 116 px och gled 3 px åt sidan: nivåradens ljuspuls
//     (giftLevelLight) skalade hela raden, märket inräknat, medan hjärtat lade sig. Pulsen ligger
//     nu bara på siffran.
//   * Ljuspunkten (giftFlightBright) stannade mitt i luften vid 46 % — ease-in-out per nyckelbild.
//     Den flyger nu en sammanhängande båge in i ringen.
//   * Namnet blev grådaskigt: text-shadow målas OVANPÅ en gradient som klippts till texten. Skuggan
//     är nu en drop-shadow, så guldskimret syns.
//   * Prototypens egen uttoning vid 13 s är borttagen (Fan Level Up har sin); visningstiden är 13 s.
(function () {
  'use strict';
  const M = window.VyraFanHjarta;
  if (!M) return;
  const satelliter = [0, 1, 2, 3, 4, 5].map(n => `<i class="fhg-satellit" style="--n:${n}"></i>`).join('');
  M.registrera('heartgift', {
    namn: 'Hjärtats gåva',
    visning: 13,              // prototypens uttoning började vid 13 s
    langd: 7700,              // sista rörelsen (glansen över porträttet, 5,7 s + 2 s) är klar
    bredd: 300,
    namnRyms: 18,
    scen: { b: 460, h: 510 },
    flygning: { start: 4000, langd: 1400 },
    partiklar: [
      { t: 3500, n: 32, kraft: 10, x: 249, y: 182, farger: ['#ad51ff', '#ffda91', '#ffda91'] },
      { t: 5300, n: 15, kraft: 8, x: 249, y: 182, farger: ['#ad51ff', '#ffda91', '#ffda91'] },
    ],
    html: d => '<div class="fhg-stralar"></div><div class="fhg-halo"></div><div class="fhg-ring"></div><div class="fhg-spar"></div>'
      + `<div class="fhg-portratt"><img data-fhm="bild" src="${d.bild}" alt=""><i class="fhg-glans"></i></div>`
      + '<div class="fhg-flare"></div>'
      + `<div class="fhg-laddning"></div><div class="fhg-satelliter">${satelliter}</div><div class="fhg-gnista"></div>`
      + `<img class="fhm-hjarta fhg-intro" src="${d.hjarta}" alt="">`
      + `<div class="fhg-namn fhm-namn" data-fhm="namn">${d.namn}</div>`
      + '<div class="fhg-niva"><div class="fhg-rad"><span class="fhg-etikett">LEVEL UP</span>'
      + `<span class="fhg-siffra" data-fhm="niva">${d.niva}</span><img class="fhm-markhjarta fhg-mark" src="${d.hjarta}" alt=""></div></div>`,
  });
})();
