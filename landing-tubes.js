// landing-tubes.js — ljusstrimman som följer muspekaren på framsidan.
//
// TubesCursor ur threejs-components (MIT, Kevin Levron): Three.js-tuber som jagar pekaren på en
// helskärmsduk bakom innehållet, med bloom för glöden. När musen står stilla vandrar målpunkten
// själv i en långsam cos/sin-bana (bibliotekets "sömnläge"), så strimman fortsätter driva.
//
// CDN-modulen följer husets etablerade mönster — home-3d.js importerar redan Three.js från unpkg.
// Effekten är en ren FÖRSTÄRKNING: går importen inte att nå renderas framsidan exakt som förut
// (modulen är sist i skriptsvansen och inget annat beror på den). Studio/OBS-vägen rör den aldrig
// — tests/framsida-tubes.test.js vaktar det.
//
// Färgerna är VYRA:s egna: gifter-lila #9965ff, rosa #ff5da2 ur landningssidans gradienter,
// och ljuslila #e2d6ff som ljusens topp.
import TubesCursor from 'https://cdn.jsdelivr.net/npm/threejs-components@0.0.19/build/cursors/tubes1.min.js';

const duk = document.getElementById('tubes-fx');

// Samma vakt som home-3d.js: den som bett om mindre rörelse får en stilla framsida.
if (duk && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  TubesCursor(duk, {
    tubes: {
      colors: ['#9965ff', '#ff5da2', '#e2d6ff'],
      lights: {
        intensity: 200,
        colors: ['#9965ff', '#ff5da2', '#59dfff', '#e2d6ff'],
      },
    },
  });
}
