// fan-hjarta-luminous.js — Fan Level Up · Luminous (modell 6 av hjärtmodellerna, fan-hjarta.js).
//
// Berättelsen först (David): guldhjärtat har en egen soloshow i varmt ljus och konfetti, sedan bygger
// ljuset kristallramen, och sist avslöjas personen, namnet och den nya nivån — med stark guldglöd på
// LEVEL UP. Hjärtat sjunker ner och lägger sig bredvid nivåsiffran. Prototypen:
// fan-luminous-approved.html (Codex 2026-11-05).
//
// GRANSKNINGEN (2026-11-05). Prototypen var fyra designer staplade på varandra (fjäderkrönet, medaljen,
// kristallen, "story first") där bara den sista gällde; scenen var i själva verket 420×515, inte
// 370×400. Hjärtats rörelse kom inte från CSS (den var avstängd med !important) utan från ett
// WAAPI-spår på 6,6 s (organicHeartFrames), som en överlämning avbröt vid 6,3 s. Det som syntes då:
//   * introt slutade 23 px till höger om märket, och överlämningen gled sedan i sidled i 1,4 s,
//   * hjärtat hade kvar ~80 px/s nedåt med bara 6 px kvar, så flygningens farts-puckel sköt 13 px
//     förbi märket och kom tillbaka — ett gupp, inte en landning,
//   * introhjärtat hade mörk skugga och märket guldglöd: glöden slog om i bytet.
// Här är spåret samma kurva (samma fjäder för lutningen) men nedstigningen slutar i märkets ruta, får
// gå klart till 6,6 s och stannar mjukt där (kvintisk utfasning, ingen fart kvar). Motorns flygning tar
// över först då och landar vid 7,7 s som förut, när nivåraden har kommit fram. Nivåsiffran har fast
// bredd för två siffror, så att märket står på samma ställe för nivå 1 som för 50.
(function () {
  'use strict';
  const M = window.VyraFanHjarta;
  if (!M) return;
  // Konfettins och gnistornas färger, som i prototypen.
  const KONFETTI = ['#ffe9ae', '#e4b25b', '#f1d3ff', '#fff3d6'];
  const GNISTOR = ['#ffe6ab', '#ffe4a0', '#fff1c7'];
  // Sju ljusspår efter hjärtat i soloshowen (prototypens heart-trace): fördröjning och styrka per index i CSS.
  const spar = Array.from({ length: 7 }, (_, i) => `<i class="flu-spar" style="--flu-i:${i}"></i>`).join('');
  M.registrera('luminous', {
    namn: 'Luminous',
    visning: 11,              // landar 7,7 s, nivåglittret klart 9,25 s — firandet får stå en stund
    langd: 9250,              // sista ändliga rörelsen (glittret vid nivåraden); glöden andas till uttoningen
    bredd: 300,
    namnRyms: 22,
    scen: { b: 420, h: 470 }, // prototypens scen 420×515; de nedersta 45 px var tomma
    // Nedstigningen (CSS-spåret) är framme och stilla vid 6,6 s; flygningen rättar bara upp det sista
    // (subpixlar) och bytet till märket sker när nivåraden har vilat in, 7,7 s.
    flygning: { start: 6600, langd: 1100 },
    partiklar: [
      // Välkomstkonfettin kring hjärtat (prototypens 48 bitar, i två skurar som prototypens fördröjningar).
      { t: 850, n: 30, kraft: 5, x: 194, y: 122, lyft: 60, tyngd: 70, avtag: 0.4, farger: KONFETTI },
      { t: 990, n: 18, kraft: 6, x: 194, y: 122, lyft: 70, tyngd: 70, avtag: 0.42, farger: KONFETTI },
      // Gnistorna när ljuset bygger ramen: rakt ut från kristallens mitt, utan tyngd.
      { t: 3550, n: 34, kraft: 6, x: 211, y: 176, lyft: 0, tyngd: 0, avtag: 0.55, farger: GNISTOR },
    ],
    html: d => '<div class="flu-glod"></div><div class="flu-stralar"></div>'
      + '<div class="flu-ring"></div><div class="flu-ring flu-ring2"></div><div class="flu-aura"></div><div class="flu-kant"></div>'
      + '<div class="flu-skal"></div><div class="flu-blixt"></div>'
      + `<div class="flu-portratt"><img data-fhm="bild" src="${d.bild}" alt=""></div>`
      + spar
      + '<div class="flu-glimt"></div>'
      + `<div class="flu-namn fhm-namn" data-fhm="namn">${d.namn}</div>`
      + `<div class="flu-niva"><span class="flu-etikett">LEVEL UP</span><span class="flu-siffra" data-fhm="niva">${d.niva}</span>`
      + `<img class="fhm-markhjarta flu-mark" src="${d.hjarta}" alt=""></div>`
      + '<div class="flu-overlamning"></div>'
      + `<img class="fhm-hjarta flu-intro" src="${d.hjarta}" alt="">`
      + '<div class="flu-stjarnor"><i></i><i></i><i></i><i></i></div>',
  });
})();
