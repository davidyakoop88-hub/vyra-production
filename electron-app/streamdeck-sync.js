'use strict';
// LÄGGER STREAM DECK-PLUGINET PÅ PLATS. Ren funktion, inga Electron-beroenden.
//
// Pluginet postar till 127.0.0.1:4173 — VYRA Desktops egen lokala server. Ingen Desktop betyder
// ingen server, och då ger knappen kryss varje gång. Alla som KAN använda pluginet har alltså
// redan appen, och därför följer det med appen i stället för att laddas ner separat. Se #428.
//
// TRE SAKER SOM ÄR MEDVETNA VAL, INTE FÖRBISEENDEN:
//
// 1. VERSIONEN LÄSES UR PLUGINETS EGEN manifest.json, aldrig ur package.json. De två kan glida
//    isär, och det är manifestets version Stream Deck faktiskt läser. Ett prov mutationsvaktar
//    det: byts källan till package.json ska provet falla. Att de råkar vara lika i dag gör inte
//    valet oviktigt — det gör felet OSYNLIGT tills den dagen de skiljer sig.
//
// 2. SAKNAD ELGATO-KATALOG ÄR EN TYST NO-OP. De flesta användare har ingen Stream Deck. Ett
//    felmeddelande för det vore brus i en logg där riktiga fel ska synas.
//
// 3. FUNKTIONEN KASTAR ALDRIG. Den anropas deferrat vid appstart, och en filkopia får aldrig
//    kunna fälla uppstarten. Allt som går fel returneras som ett utfall i stället.
//
// MÅLKATALOGEN ÄR ETT ARGUMENT, inte hårdkodad. VYRA Desktop byggs i dag bara för Windows
// (build.win/nsis, releasen kör windows-latest --win), så anroparen skickar %APPDATA%-vägen.
// Den dag ett mac-mål finns är tillägget EN RAD hos anroparen —
// ~/Library/Application Support/com.elgato.StreamDeck/Plugins/ — och inte en omskrivning här.
const fs = require('fs');
const path = require('path');

const MAPP = 'se.vyra.live.sdPlugin';

// Jämför "0.1.0" mot "0.10.2" numeriskt, del för del. En stränjämförelse hade sagt att 0.9 är
// nyare än 0.10, och pluginet hade fastnat på en gammal version utan att något sade ifrån.
function nyareAn(a, b) {
  const x = String(a || '').split('.').map(n => parseInt(n, 10) || 0);
  const y = String(b || '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

function lasVersion(manifestVag) {
  try {
    return String(JSON.parse(fs.readFileSync(manifestVag, 'utf8')).Version || '');
  } catch (_) {
    return '';
  }
}

/**
 * @param {string} kalla   Pluginmappen i appen, t.ex. <appRoot>/streamdeck-plugin/se.vyra.live.sdPlugin
 * @param {string} malKatalog  Elgatos Plugins-katalog. Finns den inte händer ingenting.
 * @returns {{status:string, version?:string, installerad?:string, fel?:string}}
 *   'ingen-streamdeck' | 'installerad' | 'uppdaterad' | 'aktuell' | 'kalla-saknas' | 'fel'
 */
function synkaPlugin(kalla, malKatalog) {
  try {
    // Ordningen spelar roll: målet först. Saknas Stream Deck ska vi inte ens bry oss om att
    // kontrollera källan — det vanligaste fallet ska vara det billigaste.
    if (!malKatalog || !fs.existsSync(malKatalog)) return { status: 'ingen-streamdeck' };

    const kallManifest = path.join(kalla, 'manifest.json');
    if (!fs.existsSync(kallManifest)) return { status: 'kalla-saknas' };

    const version = lasVersion(kallManifest);
    if (!version) return { status: 'kalla-saknas' };

    const mal = path.join(malKatalog, MAPP);
    const installerad = lasVersion(path.join(mal, 'manifest.json'));

    if (installerad && !nyareAn(version, installerad)) {
      return { status: 'aktuell', version, installerad };
    }

    // Kopiera in i en TILLFÄLLIG mapp och byt först därefter. Ett avbrott mitt i en direktkopia
    // hade lämnat en halv plugin på plats, och Stream Deck hade läst den vid nästa start.
    const temp = mal + '.ny';
    fs.rmSync(temp, { recursive: true, force: true });
    fs.cpSync(kalla, temp, { recursive: true });
    fs.rmSync(mal, { recursive: true, force: true });
    fs.renameSync(temp, mal);

    return { status: installerad ? 'uppdaterad' : 'installerad', version, installerad };
  } catch (err) {
    return { status: 'fel', fel: String((err && err.message) || err).slice(0, 200) };
  }
}

// Elgatos katalog på Windows. Egen funktion så anroparen slipper känna till sökvägen, och så att
// ett framtida mac-mål kan lägga sin bredvid utan att röra synkningen.
function elgatoKatalogWindows(env = process.env) {
  return env.APPDATA ? path.join(env.APPDATA, 'Elgato', 'StreamDeck', 'Plugins') : '';
}

module.exports = { synkaPlugin, elgatoKatalogWindows, nyareAn, MAPP };
