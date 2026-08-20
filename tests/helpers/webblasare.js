'use strict';
// En ägare av frågan "finns det en webbläsare, och hur startar vi den".
//
// VARFÖR DEN HÄR FILEN FINNS. 43 browsertestfiler bar var sin identisk kopia av en launcher plus
// det här mönstret:
//
//   let skip = chromium ? false : 'playwright-core saknas — kor `npm i` (hoppar, faller inte)';
//   test.before(async () => { browser = await startaWebblasare();
//     if (!browser) skip = 'ingen Chrome/Edge/Chromium hittades pa maskinen (hoppar, faller inte)' });
//   test('...', { skip }, async () => { ... });
//
// node:test läser optionsobjektet när testet REGISTRERAS, alltså innan `before` hinner köra.
// Omtilldelningen i `before` nådde därför aldrig fram, och löftet filerna ger i sin egen text —
// "hoppar, faller inte" — höll inte. På en maskin där playwright-core är installerat men ingen
// binär går att starta föll varje test på `Cannot read properties of null (reading 'newContext')`.
//
// UPPMÄTT 2026-08-14, hela sviten körd domän för domän: 87 hårda fel spridda över fem domäner
// (live 46, ui-design 18, overlay 10, moln 9, goals 4) och sex domäner som aldrig blev klara alls
// — de filer som startar servera()-riggen inne i testkroppen läcker en lyssnande server när kastet
// kommer, så processen hänger i stället för att avslutas. Ett hängande test är dyrare att läsa än
// ett rött: det ser ut som långsamhet, inte som ett fel.
//
// CI döljer alltihop, eftersom CI har en webbläsare.
//
// LÖSNINGEN är att avgöra synkront, före registreringen, om en binär över huvud taget finns.
// Då blir `{ skip }` sant redan när det läses, och testkroppen kör aldrig mot en null-webbläsare.
const fs = require('fs');

let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

// Vanliga installationsplatser för de kanaler playwright annars letar efter. Listan är en
// genväg förbi kanalsökningen, inte en ersättning för den — startaWebblasare() provar
// fortfarande kanalerna om ingen av vägarna finns.
const KANALVAGAR = [
  '/opt/google/chrome/chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/opt/microsoft/msedge/msedge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

// VYRA_CHROMIUM finns för maskiner där playwright-core och den installerade webbläsaren inte
// hör ihop: en container kan ha Chromium build 1194 medan paketet letar efter 1234, och då
// hittar varken executablePath() eller kanalsökningen något — trots att en fullt körbar binär
// ligger på disk.
function binarFranMiljon() {
  return process.env.VYRA_CHROMIUM || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '';
}

function hittaBinar() {
  const angiven = binarFranMiljon();
  if (angiven && fs.existsSync(angiven)) return angiven;
  if (chromium) {
    try {
      const egen = chromium.executablePath();
      if (egen && fs.existsSync(egen)) return egen;
    } catch (_) { /* paketet kan sakna nedladdad binär helt */ }
  }
  for (const vag of KANALVAGAR) {
    try { if (fs.existsSync(vag)) return vag } catch (_) {}
  }
  return null;
}

// Returnerar false när sviten ska köras, annars en sträng som node:test visar som skäl.
// Anropas på modulnivå i varje browsertestfil, före första test().
function hoppaOver() {
  if (!chromium) return 'playwright-core saknas — kor `npm i` (hoppar, faller inte)';
  if (hittaBinar()) return false;
  // I CI är en saknad webbläsare ett fel och inget att tiga om. En tyst överhoppning där ser ut
  // som en grön svit fast ingenting kördes — det är precis den sortens tystnad som gjorde att
  // felen ovan kunde ligga kvar oupptäckta.
  if (process.env.CI) return false;
  return 'ingen korbar webblasare hittades — satt VYRA_CHROMIUM till en Chrome- eller Chromium-binar (hoppar, faller inte)';
}

async function startaWebblasare() {
  if (!chromium) return null;
  const binar = hittaBinar();
  if (binar) {
    try { return await chromium.launch({ executablePath: binar }) } catch (_) {}
  }
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ channel }) } catch (_) {}
  }
  try { return await chromium.launch() } catch (_) {}
  return null;
}

module.exports = { startaWebblasare, hoppaOver, hittaBinar, harPlaywright: () => !!chromium };
