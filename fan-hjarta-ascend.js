// fan-hjarta-ascend.js — Fan Level Up · Ascend (modell 1 av hjärtmodellerna, fan-hjarta.js).
//
// Personen i centrum: portalringarna öppnas, profilen stiger fram, guldhjärtat landar vid porträttet
// och flyger sedan — samma element, i en båge — till märket bredvid den nya nivåsiffran medan den
// gamla nivån lämnar plats. Prototypen: fan-ascend-approved.html (Codex 2026-11-05).
//
// GRANSKNINGEN (2026-11-05). I prototypen var introhjärtat en kvadrat på 108×108 och märket 112×76,
// båda med object-fit:contain — det synliga hjärtat bytte alltså storlek i landningen. Båda har nu
// bildens egna proportioner. Prototypens hjärtfirande (heartCelebrate vid 3 s) avbröts alltid av
// flygningen vid 2,05 s och är borttaget, liksom den egna uttoningen vid 7 s (Fan Level Up har sin).
(function () {
  'use strict';
  const M = window.VyraFanHjarta;
  if (!M) return;
  M.registrera('ascend', {
    namn: 'Ascend',
    visning: 7,               // prototypens uttoning började vid 7 s
    langd: 4200,              // sista rörelsen (glansen över porträttet) är klar
    bredd: 300,
    namnRyms: 14,
    flygning: { start: 2050, langd: 1400 },
    partiklar: [
      { t: 2150, n: 85, kraft: 17, x: 215, y: 232, farger: ['#ad51ff', '#ffda91', '#ffda91'] },
      { t: 3200, n: 45, kraft: 12, x: 215, y: 232, farger: ['#ad51ff', '#ffda91', '#ffda91'] },
    ],
    html: d => '<div class="fa-beam"></div><div class="fa-halo"></div><div class="fa-orbit fa-yttre"></div><div class="fa-orbit"></div>'
      + `<div class="fa-portratt"><img data-fhm="bild" src="${d.bild}" alt=""><i class="fa-glans"></i></div>`
      + `<img class="fhm-hjarta fa-intro" src="${d.hjarta}" alt="">`
      + '<div class="fa-flare"></div>'
      + `<div class="fa-namn fhm-namn" data-fhm="namn">${d.namn}</div>`
      + `<div class="fa-niva"><div class="fa-gammal">LV. <span data-fhm="fran">${d.fran}</span></div>`
      + `<div class="fa-ny"><span class="fa-etikett">LEVEL UP</span><span class="fa-siffra" data-fhm="niva">${d.niva}</span><img class="fhm-markhjarta fa-mark" src="${d.hjarta}" alt=""></div></div>`
      + '<div class="fa-mark-golv"></div>',
  });
})();
