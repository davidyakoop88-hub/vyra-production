'use strict';
// Genererar VYRALIVE-logotyperna som fristående SVG med djupet INBAKAT.
// Ingen JavaScript i filerna, inga hsl()-funktioner, inga externa typsnitt — bara banor och hex.
// Skälet: samma fil ska se likadan ut i OBS browser source, i Electron, i favikonen och i tryck.
const fs = require('fs'), path = require('path');
const UT = process.argv[2] || __dirname;

const BANOR = '<path d="M40 34 L80 154 L120 34"/><path d="M160 34 V154 H216"/>';
const DJUP = 16, STEG = 1.35;
const STROKE = 'fill="none" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"';
const VY = '-16 -14 292 218';

// hsl(276,62%,L%) -> #hex. Fast lista i stället för runtime-matte i SVG:en.
function hsl2hex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Lagren bakifrån och fram. Mörkast längst bak, så fronten alltid läses först.
//
// `steg` är hur långt varje lager förskjuts. Lockupen använder ett kortare steg: där renderas
// märket runt 34 px högt, och på den ytan smetar 16 lager à 1.35 ihop sig till en mörk grumla
// bakom bokstäverna i stället för att läsas som djup. Uppmätt i Chrome på framsidan.
function lager(mork, steg = STEG) {
  let ut = '';
  for (let i = DJUP; i >= 1; i--) {
    const ljus = 17 + (1 - i / DJUP) * 24;
    ut += `\n    <g transform="translate(${(i * steg).toFixed(2)},${(i * steg).toFixed(2)})" `
        + `stroke="${mork ? hsl2hex(276, 40, ljus * 0.75) : hsl2hex(276, 62, ljus)}">${BANOR}</g>`;
  }
  return ut;
}

const FRONT_GRAD = `<linearGradient id="vlFront" gradientUnits="userSpaceOnUse" x1="30" y1="20" x2="240" y2="180">
    <stop offset="0" stop-color="#e879ff"/><stop offset=".45" stop-color="#a83aef"/><stop offset="1" stop-color="#06b6d4"/>
  </linearGradient>`;

function marke({ front, grad, tile, vy = VY, bredd, hojd }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vy}"${bredd ? ` width="${bredd}" height="${hojd}"` : ''} role="img" aria-label="VYRALIVE">
  <title>VYRALIVE</title>
  ${grad ? `<defs>${FRONT_GRAD}</defs>` : ''}${tile || ''}
  <g ${STROKE}>${lager(!grad)}
    <g stroke="${front}">${BANOR}</g>
  </g>
</svg>
`;
}

// --- Ordmärket: varje bokstav en ritad bana, ingen font ---
const ORD_VYRA = '<path d="M0 0 L28 100 L56 0"/><path d="M84 0 L112 50 L140 0 M112 50 V100"/>'
  + '<path d="M168 100 V0 H202 A28 28 0 0 1 202 56 H168 M200 56 L226 100"/>'
  + '<path d="M254 100 L282 0 L310 100 M265 64 H299"/>';
const ORD_LIVE = '<path d="M366 0 V100 H412"/><path d="M440 0 V100"/>'
  + '<path d="M478 0 L506 100 L534 0"/><path d="M610 0 H562 V100 H610 M562 50 H600"/>';
const ORD_STROKE = 'fill="none" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"';

function ordmarke(fVyra, fLive) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 634 124" role="img" aria-label="VYRA LIVE">
  <title>VYRA LIVE</title>
  <g ${ORD_STROKE} stroke="${fVyra}">${ORD_VYRA}</g>
  <g ${ORD_STROKE} stroke="${fLive}">${ORD_LIVE}</g>
</svg>
`;
}

// Lockup: märket skalat och satt före ordmärket på gemensam baslinje.
function lockup(fVyra, fLive, grad, front) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 132" role="img" aria-label="VYRALIVE">
  <title>VYRALIVE</title>
  ${grad ? `<defs>${FRONT_GRAD}</defs>` : ''}
  <g transform="translate(0,4) scale(0.56)">
    <g ${STROKE}>${lager(!grad, 0.95)}
      <g stroke="${front}">${BANOR}</g>
    </g>
  </g>
  <g transform="translate(200,16)">
    <g ${ORD_STROKE} stroke="${fVyra}">${ORD_VYRA}</g>
    <g ${ORD_STROKE} stroke="${fLive}">${ORD_LIVE}</g>
  </g>
</svg>
`;
}

const TILE = '<rect x="-16" y="-14" width="292" height="218" rx="52" fill="#100a1c"/>';
const TILE_KVADRAT = '<rect width="256" height="256" rx="58" fill="#100a1c"/>';

const filer = {
  // Huvudmärket — mörk bakgrund, full gradient
  'vl-marke.svg': marke({ front: 'url(#vlFront)', grad: true }),
  // För ljus bakgrund — massiv violett front, dovare djup
  'vl-marke-ljus.svg': marke({ front: '#6b1fb0', grad: false }),
  // En färg, för fax, gravyr, en enda tryckplåt
  // En färg. `color` på roten gör att filen ser rätt ut även som <img>, där currentColor
  // annars faller tillbaka på svart — en <img>-laddad SVG är ett eget dokument och ärver
  // ingenting från sidan. Inlinead i HTML slår `style="color:…"` presentationsattributet.
  'vl-marke-mono.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VY}" color="#a83aef" role="img" aria-label="VYRALIVE">
  <title>VYRALIVE</title>
  <g ${STROKE} stroke="currentColor">${BANOR}</g>
</svg>
`,
  // App-ikon / favikon — kvadratisk platta, märket centrerat
  'vl-ikon.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="VYRALIVE">
  <title>VYRALIVE</title>
  <defs>${FRONT_GRAD}</defs>
  ${TILE_KVADRAT}
  <g transform="translate(24,44) scale(0.72)">
    <g ${STROKE}>${lager(false)}
      <g stroke="url(#vlFront)">${BANOR}</g>
    </g>
  </g>
</svg>
`,
  'vyra-live-ordmarke.svg': ordmarke('#f6f2fa', '#06b6d4'),
  'vyra-live-ordmarke-ljus.svg': ordmarke('#6b1fb0', '#0e7490'),
  'vyra-live-lockup.svg': lockup('#f6f2fa', '#06b6d4', true, 'url(#vlFront)'),
  'vyra-live-lockup-ljus.svg': lockup('#6b1fb0', '#0e7490', false, '#6b1fb0'),
};

fs.mkdirSync(UT, { recursive: true });
for (const [namn, innehall] of Object.entries(filer)) {
  fs.writeFileSync(path.join(UT, namn), innehall, 'utf8');
  console.log(`${namn.padEnd(30)} ${String(Buffer.byteLength(innehall)).padStart(6)} B`);
}
console.log(`\n${Object.keys(filer).length} filer i ${UT}`);
