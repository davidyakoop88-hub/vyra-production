#!/usr/bin/env node
'use strict';
// SKARVAR tests/browser/ I LIKA TUNGA DELAR — en per CI-runner.
//
// VARFOR. `npm run test:browser` ar hela sviten i EN process med --test-concurrency=1. Uppmatt i
// korning 1bcc763e (2026-09-23): 57 min 44 s, alltsa 82 % av test-client-jobbets 70 minuter.
// Delas listan i fyra kors delarna samtidigt.
//
// LIKA TUNGA, INTE LIKA MANGA. Forsta utkastet delade pa varvtal — fil nr i hamnar i del i % N —
// och det holl inte ens efter att de tva varsta filerna snabbats samma dag (panel-inga-dubbletter
// 394 -> 46 s, gifter-level-referens 310 -> 20 s). Uppmatt per fil over alla 90, med de nya
// tiderna inraknade:
//
//     summa 41,7 min   median 18 s   tyngsta 158, 143, 125, 93, 93 s
//     varvtal  n=4:  7,7 / 8,4 / 12,6 / 13,0 min   -> vaggklocka 13,0
//     girig    n=4: 10,4 / 10,4 / 10,4 / 10,4 min  -> vaggklocka 10,4
//
// Tjugo procent skiljer, och det ar efter att utliggarna ar borta. Medianen ar 18 s medan den
// tyngsta filen ar 158 — fordelningen ar fortfarande sned nog att varvtal slosar en runner.
//
// VIKTERNA KAN BLI GAMLA, OCH DET FAR INTE GA SONDER AV DET. Korrektheten — att varje provfil
// hamnar i exakt en del — hanger inte pa tabellen: den kommer ur att filerna delas upp, inte ur
// hur tunga de ar. En fil som SAKNAS i tabellen far medianvikten och placeras som alla andra.
// Det som degraderar ar balansen, inte tackningen, och tests/browser-skarvning.test.js larmar
// nar tabellen tappat greppet om for stor del av katalogen.
//
// SKARVNING AR OFARLIG HAR, OCH BARA HAR. Sviten fragar om en widget SYNS, inte om den ser
// likadan ut; den jamfor inga pixlar. Fyra runners far darfor ha fyra olika Chrome-versioner utan
// att utfallet andras. Den visuella vakten i tests/visual/ tal INTE det och kors odelad.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROT = path.join(__dirname, '..');
const KATALOG = path.join(ROT, 'tests', 'browser');
const TIDER = path.join(ROT, 'tests', 'browser-tider.json');

function filer() {
  return fs.readdirSync(KATALOG)
    .filter(namn => namn.endsWith('.browser.test.js'))
    .sort()
    .map(namn => path.posix.join('tests', 'browser', namn));
}

function tider() {
  try {
    return JSON.parse(fs.readFileSync(TIDER, 'utf8')).tider || {};
  } catch {
    return {};
  }
}

// Medianen, inte snittet: snittet dras upp av de tva utliggarna och hade gett varje NY fil en vikt
// den nastan sakert inte har.
function median(tal) {
  if (tal.length === 0) return 1;
  const s = [...tal].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function vikter() {
  const tabell = tider();
  const kanda = Object.values(tabell);
  const standard = median(kanda);
  const ut = new Map();
  for (const fil of filer()) {
    const namn = path.posix.basename(fil);
    ut.set(fil, Object.prototype.hasOwnProperty.call(tabell, namn) ? tabell[namn] : standard);
  }
  return ut;
}

// del ar 1-indexerad, som matrisen i ci.yml.
//
// Girig packning ar DETERMINISTISK har: sorteringen bryter lika vikter pa filnamn, och korgarna
// valjs pa (last, index). Samma katalog ger samma uppdelning pa varje runner, vilket ar vad som
// gor att en fallande del gar att koras om lokalt med samma kommando.
function delning(av) {
  const v = vikter();
  const ordnade = [...v.keys()].sort((a, b) => (v.get(b) - v.get(a)) || (a < b ? -1 : 1));
  const korgar = Array.from({ length: av }, () => ({ last: 0, filer: [] }));
  for (const fil of ordnade) {
    let lattast = 0;
    for (let i = 1; i < av; i++) if (korgar[i].last < korgar[lattast].last) lattast = i;
    korgar[lattast].filer.push(fil);
    korgar[lattast].last += v.get(fil);
  }
  // Filerna inom en del kors i namnordning — loggen blir lasbar, utfallet paverkas inte.
  return korgar.map(k => ({ last: k.last, filer: k.filer.sort() }));
}

function skarva(del, av) {
  return delning(av)[del - 1].filer;
}

module.exports = { filer, skarva, delning, vikter };

if (require.main === module) {
  const argv = process.argv.slice(2);

  // --mat kor VARJE fil for sig och skriver om tests/browser-tider.json. Tar ~52 minuter.
  if (argv[0] === '--mat') {
    const lista = filer();
    const tabell = {};
    for (const fil of lista) {
      const t0 = Date.now();
      const kor = spawnSync(process.execPath, ['--test', '--test-concurrency=1', fil],
        { cwd: ROT, stdio: 'ignore' });
      const s = Math.round((Date.now() - t0) / 1000);
      tabell[path.posix.basename(fil)] = s;
      console.log(`${String(s).padStart(4)} s  ${kor.status === 0 ? ' ' : 'ROD'}  ${fil}`);
    }
    const summa = Object.values(tabell).reduce((n, s) => n + s, 0);
    fs.writeFileSync(TIDER, JSON.stringify({
      _kommentar: 'Sekunder per provfil, uppmatt for att SKARVNINGEN i scripts/browser-skarva.js ska bli jamn. Regenereras med: node scripts/browser-skarva.js --mat',
      _matt: new Date().toISOString().slice(0, 10),
      _maskin: 'RELATIVA vikter ar det som anvands, inte de absoluta talen — en snabbare maskin andrar alla lika mycket',
      _summa_s: summa,
      tider: Object.fromEntries(Object.entries(tabell).sort(([a], [b]) => (a < b ? -1 : 1))),
    }, null, 2) + '\n');
    console.log(`\nSkrev ${lista.length} vikter till tests/browser-tider.json, summa ${summa} s`);
    process.exit(0);
  }

  const bara = argv[0] === '--lista';
  const [del, av] = (bara ? argv.slice(1) : argv).map(Number);

  if (!Number.isInteger(del) || !Number.isInteger(av) || av < 1 || del < 1 || del > av) {
    console.error('Anvandning: node scripts/browser-skarva.js [--lista] <del> <av>   (1 <= del <= av)');
    console.error('            node scripts/browser-skarva.js --mat                 (mater om vikterna)');
    process.exit(2);
  }

  const delar = delning(av);
  const lista = delar[del - 1].filer;

  // EN TOM DEL FALLER, den hoppas inte over. Fler delar an provfiler ar en felkonfigurerad matris,
  // och ett gront jobb som inte kort nagot ar precis den sortens vakt som #352 handlade om.
  if (lista.length === 0) {
    console.error(`Del ${del} av ${av} ar TOM — matrisen har fler delar an tests/browser/ har filer.`);
    process.exit(2);
  }

  if (bara) {
    process.stdout.write(lista.join('\n') + '\n');
    process.exit(0);
  }

  const last = delar[del - 1].last;
  console.log(`Del ${del} av ${av}: ${lista.length} av ${filer().length} provfiler, vantad tid ~${Math.round(last / 60)} min`);
  const kor = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...lista],
    { cwd: ROT, stdio: 'inherit' });
  process.exit(kor.status === null ? 1 : kor.status);
}
