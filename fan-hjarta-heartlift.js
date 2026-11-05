// fan-hjarta-heartlift.js — Fan Level Up · Heart Lift (modell 5 av hjärtmodellerna, fan-hjarta.js).
//
// Guldhjärtat kommer flygande in från vänster med en komet och ett gnistspår, glider genom mitten där
// en laddning och en ljusvåg slår upp, och fortsätter — samma element, utan att stanna — ned till
// märket bredvid den nya nivåsiffran. Bakom det poppar den lutade porträttramen fram, sedan namnet
// och LEVEL UP-raden. Prototypen: fan-heart-lift-approved.html (Codex 2026-11-05).
//
// GRANSKNINGEN (2026-11-05). Prototypen var åtta lager överskrivningar ovanpå varandra (Ascend →
// Hjärtats gåva → Golden Stage → Heart Lift); det som faktiskt gällde är det som står här, resten
// (orbit, ljuskägla, plattform, gåvopunkten, gamla nivån, flare) var display:none och är borta.
//   * DE TRE STOPPEN David såg kom från den äldre flykten (hlSmoothFlight: stilla 42–56 %, sedan ett
//     pop och en studs). Den sista versionen hade kvar ETT stopp: introt (liftSingleArrival, 2,05 s,
//     cubic-bezier(.2,.65,.25,1)) bromsade till noll i mitten, och överföringen vid 1,95 s startade
//     från vila. Uppmätt i prototypen: under 30 px/s från 1,6 s till 2,15 s — en halv sekund stilla.
//     Här bromsar introt bara till en glidfart (≈135 px/s i scenens px) och flygningen tar över vid
//     1,6 s medan hjärtat ännu rör sig; motorn bär farten vidare, så den aldrig når noll före märket.
//   * Introhjärtat var en kvadrat (124×124, object-fit:contain) och märket 112×76 — båda har nu
//     bildens proportioner, så bytet i landningen inte ändrar storlek.
//   * Prototypens uttoning vid 13 s och de oändliga vilorörelserna (ramens andning, glansen var
//     7:e s) är borta: Fan Level Up har sin egen uttoning, och tidslinjen ska nå vila. Ramen andas
//     en gång och glansen sveper en gång.
(function () {
  'use strict';
  const M = window.VyraFanHjarta;
  if (!M) return;
  // Gnistspåret bakom hjärtat (18 st) och stjärnorna som sprids när ljusvågen slår upp (36 st):
  // prototypens egna värden, så att spridningen ser likadan ut.
  const GNISTOR = Array.from({ length: 18 }, (_, i) => `<i style="--i:${i};--y:${[-18, -9, 0, 9, 18][i % 5]}px"></i>`).join('');
  const STJARNOR = [[95, 0], [-81, 66], [11, -109], [86, 96], [-153, -14], [80, -52], [-28, 105], [-58, -107], [132, 29], [-143, 38],
    [39, -99], [34, 115], [-109, -42], [136, -22], [-87, 90], [-14, -120], [85, 54], [-125, 6], [98, -78], [-4, 121], [-62, -64], [109, 11],
    [-101, 64], [28, -119], [80, 73], [-91, -27], [99, -48], [-45, 113], [-51, -79], [139, 43], [-91, 31], [57, -104], [25, 83], [-113, -57],
    [154, -13], [-62, 92]]
    .map(([x, y], i) => `<i style="--dx:${x}px;--dy:${y}px;--d:${(i % 4) * 25}ms;--snurr:${i * 39}deg"></i>`).join('');
  M.registrera('heartlift', {
    namn: 'Heart Lift',
    visning: 7,               // fabrikens FAN_HJARTA_VISNING; prototypen tonade ut först vid 13 s
    langd: 6600,              // ramens enda andetag (3,4 s + 3,2 s) är klart
    bredd: 300,
    namnRyms: 20,             // 390 px namnrad i 31 px
    scen: { b: 400, h: 440 },
    // Flygningen tar över medan introt fortfarande glider (introt pågår till 2,0 s), så farten
    // mäts på ett hjärta i rörelse. Taket är högre än motorns 140 px/s: glidfarten är ≈135 px/s
    // och ska inte kapas.
    flygning: { start: 1600, langd: 1750, fartTak: 220 },
    partiklar: [
      { t: 3500, n: 32, kraft: 10, x: 200, y: 133, farger: ['#ad51ff', '#ffda91', '#ffda91'] },
      { t: 5300, n: 15, kraft: 8, x: 200, y: 133, farger: ['#ad51ff', '#ffda91', '#ffda91'] },
    ],
    html: d => `<div class="fhl-gnistor" aria-hidden="true">${GNISTOR}</div>`
      + '<div class="fhl-pop"></div><div class="fhl-komet"></div><div class="fhl-laddning"></div><div class="fhl-vag"></div>'
      + `<div class="fhl-stjarnor" aria-hidden="true">${STJARNOR}</div>`
      + '<div class="fhl-ram"></div>'
      + `<div class="fhl-portratt"><img class="fhl-bild" data-fhm="bild" src="${d.bild}" alt=""><i class="fhl-glans"></i></div>`
      + `<img class="fhm-hjarta fhl-intro" src="${d.hjarta}" alt="">`
      + `<div class="fhl-namn fhm-namn" data-fhm="namn">${d.namn}</div>`
      + '<div class="fhl-niva"><div class="fhl-rad">'
      + '<span class="fhl-etikett">LEVEL UP</span>'
      + `<span class="fhl-siffra" data-fhm="niva">${d.niva}</span>`
      + `<img class="fhm-markhjarta fhl-mark" src="${d.hjarta}" alt=""></div></div>`,
  });
})();
