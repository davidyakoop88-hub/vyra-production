'use strict';
// BUTIKSBRICKORNA MÅSTE FINNAS — annars byter electron-builder ut dem mot EXEMPELBILDER.
//
// UPPMÄTT: Store-certifieringen föll 2026-09-04 på policy 10.1.1.11 On Device Tiles:
//
//   "The available product tile icons include a default image. Tile icons must uniquely
//    represent product so users associate icons with the appropriate products and do not
//    confuse one product for another."
//
// Orsaken stod i app-builder-lib/out/targets/AppxTarget.js:
//
//   const vendorAssetsForDefaultAssets = {
//     "StoreLogo.png":         "SampleAppx.50x50.png",
//     "Square150x150Logo.png": "SampleAppx.150x150.png",
//     "Square44x44Logo.png":   "SampleAppx.44x44.png",
//     "Wide310x150Logo.png":   "SampleAppx.310x150.png",
//   };
//
// Saknas en av dem i `build/appx/` läggs en SampleAppx-bild in i paketet — utan ett ord i loggen.
// Katalogen fanns inte alls, så ALLA FYRA brickorna i den inskickade versionen var exempelbilder.
//
// LISTAN LÄSES UR ELECTRON-BUILDER, inte kopieras hit. En kopia hade glidit isär den dag de lägger
// till en femte bricka — och då hade certifieringen fallit igen på exakt samma sätt, med en grön
// provsvit bakom sig. Kan listan inte läsas faller provet hellre än att tiga.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROT = path.join(__dirname, '..');
const APPX = path.join(ROT, 'build', 'appx');
const MALL = path.join(ROT, 'node_modules', 'app-builder-lib', 'out', 'targets', 'AppxTarget.js');

// De namn electron-builder ersätter med SampleAppx om de saknas.
function kravdaBrickor() {
  const kalla = fs.readFileSync(MALL, 'utf8');
  const block = /vendorAssetsForDefaultAssets\s*=\s*\{([\s\S]*?)\}/.exec(kalla);
  if (!block) return null;
  const namn = [...block[1].matchAll(/"([^"]+\.png)"\s*:/g)].map(m => m[1]);
  return namn.length ? namn : null;
}

// PNG-huvudet bär bredd och höjd i byte 16–24. Ett prov som bara räknar filer hade godkänt en
// tom fil med rätt namn.
function pngMatt(fil) {
  const b = fs.readFileSync(fil);
  const magi = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  if (b.length < 24 || !b.subarray(0, 4).equals(magi)) return null;
  return { b: b.readUInt32BE(16), h: b.readUInt32BE(20), byte: b.length };
}

const VANTADE_MATT = {
  'StoreLogo.png': [50, 50],
  'Square44x44Logo.png': [44, 44],
  'SmallTile.png': [71, 71],
  'Square150x150Logo.png': [150, 150],
  'LargeTile.png': [310, 310],
  'Wide310x150Logo.png': [310, 150],
  'SplashScreen.png': [620, 300],
};

test('varje bricka electron-builder annars ersatter med en exempelbild finns pa plats', () => {
  const kravda = kravdaBrickor();
  assert.ok(kravda, 'kunde inte lasa vendorAssetsForDefaultAssets ur AppxTarget.js — provet kan '
    + 'inte veta vilka brickor som byts mot exempelbilder, och far da inte pasta att allt ar bra');
  const saknas = kravda.filter(n => !fs.existsSync(path.join(APPX, n)));
  assert.deepEqual(saknas, [],
    'dessa brickor saknas i build/appx/ och byts ut mot SampleAppx-bilder i paketet: '
    + saknas.join(', ') + '. Det ar exakt det Store-certifieringen fallde pa 2026-09-04 '
    + '(policy 10.1.1.11 On Device Tiles).');
});

test('brickorna ar riktiga PNG-filer med ratt matt', () => {
  const fel = [];
  for (const [namn, [b, h]] of Object.entries(VANTADE_MATT)) {
    const fil = path.join(APPX, namn);
    if (!fs.existsSync(fil)) { fel.push(namn + ': saknas'); continue }
    const m = pngMatt(fil);
    if (!m) { fel.push(namn + ': inte en PNG'); continue }
    if (m.b !== b || m.h !== h) fel.push(`${namn}: ${m.b}x${m.h}, vantade ${b}x${h}`);
    // En bricka pa nagra hundra byte ar tom eller enfargad — den forestaller ingenting.
    if (m.byte < 1000) fel.push(`${namn}: bara ${m.byte} byte — misstankt tom`);
  }
  assert.deepEqual(fel, [], fel.join('\n'));
});

test('brickorna ar genomskinliga — bakgrunden ritas av Windows', () => {
  // appx-sektionen satter backgroundColor, och Windows ritar den bakom brickan. En ogenomskinlig
  // platta hade slagits ut mot systemets egen tema-bakgrund pa ljusa teman.
  //
  // PNG-fargtyp star i byte 25: 6 = RGBA, 4 = grastoner med alfa, 3 = palett (kan ha tRNS).
  const utanAlfa = [];
  for (const namn of Object.keys(VANTADE_MATT)) {
    const fil = path.join(APPX, namn);
    if (!fs.existsSync(fil)) continue;
    const b = fs.readFileSync(fil);
    const fargtyp = b[25];
    if (fargtyp !== 6 && fargtyp !== 4 && !(fargtyp === 3 && b.includes(Buffer.from('tRNS')))) {
      utanAlfa.push(`${namn}: fargtyp ${fargtyp}`);
    }
  }
  assert.deepEqual(utanAlfa, [], 'dessa brickor saknar alfakanal:\n' + utanAlfa.join('\n'));
});
