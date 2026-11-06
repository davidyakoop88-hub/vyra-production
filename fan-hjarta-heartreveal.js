// fan-hjarta-heartreveal.js — Fan Level Up · Heart Reveal (modell 2 av hjärtmodellerna, fan-hjarta.js).
//
// En bred scen (560×310): en guldgnista tänds, ett helt hjärta formas ur ljuset, och hjärtat löses
// upp i ljus just när profilen kommer fram ur det. Panelen vecklas ut åt höger med namnet, och nivån
// kommer sist — med det lilla märket bredvid siffran. Prototypen: fan-heart-reveal-approved.html
// (Codex 2026-11-05).
//
// HJÄRTAT FLYGER INTE (David: "det stora hjärtat ska försvinna när profilen kommer fram, det lilla
// kommer senare med nivån"). Därför `flygning: null`: introhjärtat har sin egen upplösning i CSS och
// märket tonar in med nivåraden. `landning` är tidpunkten då motorn sätter .fhm-landat och märket
// får synas — strax FÖRE märkets egen intoning (4,7 s), så att det blir synligt med opacitet 0 och
// tonar upp i stället för att poppa fram på en bildruta. Introhjärtat är helt borta vid 3,65 s; mellan
// 3,65 och 4,65 s syns inget hjärta alls, så två hjärtan kan aldrig synas samtidigt.
//
// GRANSKNINGEN (2026-11-05), uppspelad i en riktig webbläsare och inte bara skrubbad:
//   * Nivåraden låg 20 px till vänster om sin egen ruta och "LEVEL UP" korsade panelens skiljelinje.
//     Ett dolt extrahjärta (visibility:hidden, 78 px) tog fortfarande plats i den centrerade raden.
//     Här finns bara märket, och raden står vänsterställd under namnet.
//   * Krusningsringen runt hjärtat syntes på 65 % från första bildrutan och stod still i 3,35 s
//     (dess 0 %-bild hade opacitet .65 och `both` höll den kvar före starten). Den tonar nu in när den
//     startar.
//   * Glansen över porträttet gick 3,1–4,2 s, medan porträttet ännu var genomskinligt — den syntes
//     knappt. Den går nu när porträttet har landat (4,8 s).
//   * Hjärtat stannade mitt i sin långsamma växt (vid 2,63 s, där upplösningen började) och tog sedan
//     fart igen. Växten är nu en egen rörelse från vila till upplösning, utan stopp.
//   * Porträttets aura (inset -8 px) klipptes bort helt av porträttets overflow:hidden och syntes
//     aldrig; den är borttagen. Prototypens egna uttoningar (13/15 s) är borttagna — Fan Level Up har sin.
//   * Stoftet drev i 15 s från 1,5 s och var alltså aldrig klart inom visningen. Det driver nu i 11 s
//     och vilar vid 12,5 s, före uttoningen.
(function () {
  'use strict';
  const M = window.VyraFanHjarta;
  if (!M) return;
  const FARGER = ['#ad51ff', '#ffda91', '#ffda91'];   // var tredje i accentlila, som i prototypen
  M.registrera('heartreveal', {
    namn: 'Heart Reveal',
    visning: 13,              // = fabrikens FAN_HJARTA_VISNING; prototypens tidigare uttoning låg vid 13 s
    langd: 12500,             // stoftets långsamma drift vilar; nivån och märket är klara vid 5,5 s
    bredd: 300,
    namnRyms: 16,
    scen: { b: 560, h: 310 },
    flygning: null,
    landning: 4650,           // märket får synas (med opacitet 0) strax före sin intoning vid 4,7 s
    // Från porträttets mitt (135,155), när profilen kommer fram och när nivån har landat.
    partiklar: [
      { t: 3500, n: 30, kraft: 10, x: 135, y: 155, farger: FARGER },
      { t: 5300, n: 16, kraft: 8, x: 135, y: 155, farger: FARGER },
    ],
    // Ordningen är prototypens målarordning (samma z-index målas i dokumentordning).
    html: d => '<div class="fhr-gnista"></div><div class="fhr-ring"></div><div class="fhr-bloom"></div>'
      + '<div class="fhr-ljus"></div><div class="fhr-stoft"></div>'
      + '<div class="fhr-band"><div class="fhr-bandglans"></div></div>'
      + '<div class="fhr-krusning"></div>'
      + `<div class="fhr-portratt"><img class="fhr-bild" data-fhm="bild" src="${d.bild}" alt=""><div class="fhr-glans"></div></div>`
      + '<div class="fhr-flare"></div>'
      + `<img class="fhm-hjarta fhr-intro" src="${d.hjarta}" alt="">`
      + `<div class="fhr-namn fhm-namn" data-fhm="namn">${d.namn}</div>`
      + '<div class="fhr-niva"><div class="fhr-rad"><span class="fhr-etikett">LEVEL UP</span>'
      + `<span class="fhr-siffra" data-fhm="niva">${d.niva}</span>`
      + `<img class="fhm-markhjarta fhr-mark" src="${d.hjarta}" alt=""></div></div>`,
  });
})();
