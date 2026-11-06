// fan-hjarta-goldenstage.js — Fan Level Up · Golden Stage (modell 4 av hjärtmodellerna, fan-hjarta.js).
//
// Personen står på en gyllene scen: strålkastaren och scengolvet tänds, profilen stiger fram, guldhjärtat
// kliver in vid porträttets nederkant, lyfter lätt och flyger sedan — samma element, i en båge — ner
// till märket bredvid den nya nivåsiffran. Prototypen: fan-golden-stage-approved.html (Codex 2026-11-05).
//
// GRANSKNINGEN (2026-11-05, prototypen spelad i Chromium och avläst var ~50:e ms). Prototypen var fem
// lager överskrivningar ovanpå Ascend och Hjärtats gåva; det här är de värden som faktiskt gällde till
// sist, plus följande rättningar:
//   * Hjärtats svävning startade vid 3,0 s på rotate(-3deg) — hjärtat ryckte 3° rakt innan flygningen.
//     Nu är entrén och lyftet EN tidslinje (fgsHjarta) som går mjukt från vila till lyft, så att
//     flygningen tar över ett hjärta som redan rör sig uppåt (motorn mäter farten och fortsätter i den).
//   * Strålkastarens pendel (vid 2,6 s), scengolvets puls (1,7 s) och namnets glans (3,5 s) började
//     alla på ett annat värde än entrén slutade — tre små hopp. Looparna börjar nu där entrén slutar.
//   * Nivåraden andades redan från 4,0 s, så märket stod 0,5 px fel när hjärtat landade 4,6 s. Andningen
//     börjar nu efter landningen.
//   * Namnets text-shadow ritades OVANPÅ den guldtonade texten (background-clip:text) och gjorde
//     namnet gråbrunt. Skuggan är nu en drop-shadow bakom texten.
//   * Prototypens uttoning låg på 13 s — ärvd från Hjärtats gåvas längre tidslinje. Golden Stage är
//     färdig när hjärtat landat (4,6 s) och sista skuren (5,3 s), så visningstiden är 7 s som fabriken.
//   * Y-snurren (gsHeartSpin, från 5,5 s) och perspektivet kunde aldrig synas — flygningen avbröt dem
//     vid 3,2 s — och är borttagna, liksom den gamla nivåraden (dold med !important i prototypen).
(function () {
  'use strict';
  const M = window.VyraFanHjarta;
  if (!M) return;
  M.registrera('goldenstage', {
    namn: 'Golden Stage',
    visning: 7,               // tidslinjen är klar 5,3 s; samma tal som FAN_HJARTA_VISNING i fabriken
    langd: 5300,              // sista skuren av guldkonfetti; hjärtat har landat 4,6 s
    bredd: 300,
    namnRyms: 18,             // 400 px rad i 31 px: arton tecken innan namnet behöver krympa
    scen: { b: 430, h: 465 },
    flygning: { start: 3200, langd: 1400 },
    partiklar: [
      { t: 3500, n: 32, kraft: 10, x: 215, y: 165, farger: ['#ad51ff', '#ffda91', '#ffda91'] },
      { t: 5300, n: 15, kraft: 8, x: 215, y: 165, farger: ['#ad51ff', '#ffda91', '#ffda91'] },
    ],
    html: d => '<div class="fgs-golv"></div><div class="fgs-spot"></div><div class="fgs-halo"></div>'
      + `<div class="fgs-portratt"><img data-fhm="bild" src="${d.bild}" alt=""><i class="fgs-glans"></i></div>`
      + `<img class="fhm-hjarta fgs-intro" src="${d.hjarta}" alt="">`
      + '<div class="fgs-flare"></div>'
      + `<div class="fgs-namn fhm-namn" data-fhm="namn">${d.namn}</div>`
      + '<div class="fgs-niva"><div class="fgs-ny"><span class="fgs-etikett">LEVEL UP</span>'
      + `<span class="fgs-siffra" data-fhm="niva">${d.niva}</span><img class="fhm-markhjarta fgs-mark" src="${d.hjarta}" alt=""></div></div>`,
  });
})();
