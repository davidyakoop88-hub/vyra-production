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
//
// VAD DEN KOSTADE (uppmätt 2026-11-09). Modulen är 757 KB — nästan halva framsidan — och laddades
// med en statisk import: före allt annat, och även på telefoner där det inte finns någon pekare att
// följa. I Chromium utan grafikkort blockerade den huvudtråden 4,6 s vid start och 18 s av 10 s
// vila på mobil (7 s / 22 s på dator), sidan föll till 1 bild/s. Utan modulen: 0 ms.
// Därför tre vakter, i den här ordningen:
//   1. bara med en riktig mus (hover + fin pekare) och utan önskemål om mindre rörelse — annars
//      hämtas modulen aldrig;
//   2. hämtningen väntar tills sidan laddat klart och webbläsaren har en ledig stund, så att
//      rubrik, bilder och inloggning kommer först;
//   3. biblioteket ritar alltid i minst 2x. På en vanlig 1x-skärm är det fyra gånger så många
//      pixlar som syns; här följer den skärmens egen upplösning (högst 2x, som förut);
//   4. bara med ett riktigt grafikkort. Utan grafikacceleration ritar webbläsaren WebGL i
//      processorn (SwiftShader, llvmpipe, Microsoft Basic Render), och där gav effekten 1-4
//      bilder/s även efter vakterna ovan — den sidan ser ut att ha hängt sig.
// Duken ligger i en egen fönsterstor ruta (index.html): biblioteket mäter sin förälder, och direkt
// i <body> blev den hela sidans höjd — 1440x3404 i ett fönster som visar 1440x900.
const MODUL = 'https://cdn.jsdelivr.net/npm/threejs-components@0.0.19/build/cursors/tubes1.min.js';

const duk = document.getElementById('tubes-fx');
const harMus = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
// Samma vakt som home-3d.js: den som bett om mindre rörelse får en stilla framsida.
const lugn = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Frågar en liten engångsduk vem som ritar WebGL, och släpper den direkt igen.
function harGrafikkort() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const ritare = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const forlust = gl.getExtension('WEBGL_lose_context'); if (forlust) forlust.loseContext();
    return !/swiftshader|llvmpipe|software|basic render/i.test(ritare);
  } catch (_) { return false; }
}

function starta() {
  if (!harGrafikkort()) return;
  import(MODUL).then(({ default: TubesCursor }) => {
    if (!duk.isConnected) return;
    const fx = TubesCursor(duk, {
      tubes: {
        colors: ['#9965ff', '#ff5da2', '#e2d6ff'],
        lights: {
          intensity: 200,
          colors: ['#9965ff', '#ff5da2', '#59dfff', '#e2d6ff'],
        },
      },
    });
    const skarm = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    if (fx && fx.three) { fx.three.minPixelRatio = skarm; fx.three.maxPixelRatio = skarm; fx.three.resize(); }
  }).catch(() => {});   // CDN:en nås inte: framsidan står kvar exakt som utan effekten
}

function vanta() {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(starta, { timeout: 2000 });
  else setTimeout(starta, 300);
}

if (duk && harMus && !lugn) {
  if (document.readyState === 'complete') vanta();
  else window.addEventListener('load', vanta, { once: true });
}
