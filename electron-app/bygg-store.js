'use strict';
// BYGGER STORE-PAKETET — utan att röra NSIS-konfigurationen.
//
// electron-builder läser `build` ur package.json. Ett eget config-FILNAMN
// (electron-builder.config.js) hade TAGIT ÖVER helt och tyst slagit ut hela NSIS-uppsättningen, så
// identiteten matas i stället in som `-c.appx.*`-överskrivningar. De läggs ovanpå package.json:s
// `build`, inte i stället för den.
//
// FORMATET. electron-builder 26 har målet `appx`, som producerar en `.appx`. Partner Center tar
// emot .appx likaväl som .msix — det är samma paketfamilj. Skulle en strikt .msix krävas är det
// `makeappxArgs` som ska ändras, inte den här filen.
//
// UPPDATERAREN. Store-versionen ska inte uppdatera sig själv; Microsoft Store gör det. Avstängningen
// sitter i main.js på `process.windowsStore` — ett RUNTIME-villkor, inte en byggflagga. Skälet är
// att en byggflagga kan sättas fel eller glömmas, medan process.windowsStore är sant exakt när
// appen kör ur ett Store-paket och falskt annars. `electronUpdaterAware: false` nedan säger samma
// sak till electron-builder.

const { spawnSync } = require('node:child_process');
const Identitet = require('./store-identitet');

function main() {
  let identitet;
  try {
    identitet = Identitet.krav();
  } catch (fel) {
    // Ett tydligt stopp, inte en stack trace. Den som kör det här ska veta vad som ska hämtas var.
    console.error('\n' + fel.message + '\n');
    process.exit(1);
  }

  const args = [
    '--win', 'appx',
    `-c.appx.identityName=${identitet.identityName}`,
    `-c.appx.publisher=${identitet.publisher}`,
    `-c.appx.publisherDisplayName=${identitet.publisherDisplayName}`,
    // Store sköter uppdateringarna. Se main.js.
    '-c.appx.electronUpdaterAware=false'
  ];

  // Identiteten skrivs ALDRIG ut. publisher innehåller organisationens namn och GUID, och en
  // byggloggg är inte rätt ställe för den. Att bygget kom igång räcker som kvittens.
  console.log('Bygger Store-paket med identitet från Partner Center (värdena loggas inte).');

  const kor = spawnSync('npx', ['electron-builder', ...args],
    { stdio: 'inherit', shell: process.platform === 'win32' });
  process.exit(kor.status === null ? 1 : kor.status);
}

if (require.main === module) main();

module.exports = { main };
