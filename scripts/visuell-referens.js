'use strict';
// SKRIVER OM DE VISUELLA REFERENSERNA. Enda vägen — vakten skapar aldrig en referens åt sig själv.
//
//   VYRA_VISUELL_MOTIV="varför bilden ska ändras" npm run test:visual:update
//
// MOTIVERINGEN ÄR OBLIGATORISK, och det är hela poängen. En referens som går att uppdatera utan
// eftertanke slutar vara en vakt och blir en logg över vad som råkade hända: nästa gång vakten
// faller är den snabbaste vägen till grönt att skriva om referensen, och då har vi bytt bort ett
// larm mot en tystnad. Motiveringen skrivs till `historik.md` bredvid bilderna, så varje ändrad
// pixel har ett skäl någon fick skriva ner.
//
// BINÄREN AVGÖR ALLT. Referenserna är bara giltiga på den Chromium-build de gjordes på — två builds
// rastrerar typsnitt olika. Manifestet spelar in vilken, och vakten vägrar jämföra någon annanstans.
const path = require('path'), http = require('http'), fs = require('fs');
const { startaWebblasare, hoppaOver } = require('../tests/helpers/webblasare.js');
const { kravNycklar, ALERTS } = require('../tests/helpers/katalognycklar.js');
const V = require('../tests/helpers/visuell.js');

const ROOT = V.ROOT;
const MOTIV = (process.env.VYRA_VISUELL_MOTIV || '').trim();
const BARA = (process.env.VYRA_VISUELL_BARA || '').trim();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

(async () => {
  if (!MOTIV) {
    console.error('VYRA_VISUELL_MOTIV saknas.\n'
      + '\n  En referensbild som byts utan skäl är ingen vakt längre. Skriv varför:\n'
      + '\n    VYRA_VISUELL_MOTIV="ramen fick 2 px tjockare guldkant" npm run test:visual:update\n');
    process.exit(1);
  }
  if (MOTIV.length < 12) {
    console.error(`Motiveringen "${MOTIV}" är för kort för att betyda något om ett halvår.`);
    process.exit(1);
  }
  const skal = hoppaOver();
  if (skal) { console.error('Ingen körbar webbläsare: ' + skal); process.exit(1) }

  const nycklar = kravNycklar().filter(k => !BARA || k.includes(BARA));
  const motor = V.motorn();
  console.log(`Motor: ${motor.version}  (${motor.binar})`);
  console.log(`Skriver ${nycklar.length} referenser${BARA ? ` (filter: ${BARA})` : ''}\n`);

  const browser = await startaWebblasare();
  const server = await servera();
  const bas = `http://127.0.0.1:${server.address().port}`;
  const sida = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await sida.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
  await sida.waitForFunction(() => typeof window.render === 'function', null,
    { timeout: 30000, polling: 100 });
  await sida.waitForTimeout(4500);
  await sida.evaluate(V.RIGG);

  fs.mkdirSync(V.REFKAT, { recursive: true });
  const skrivna = [], hoppade = [];

  for (const nyckel of nycklar) {
    const foto = await V.fotografera(sida, nyckel, ALERTS);
    if (foto.fel) { hoppade.push(`${nyckel}: ${foto.fel}`); continue }

    // EN TOM REFERENS MATCHAR ALLT. Att skriva den vore att tysta vakten för just den nyckeln, och
    // den sortens tystnad upptäcks aldrig — provet är ju grönt.
    if (foto.fyllnad.procent < 3) {
      hoppade.push(`${nyckel}: bara ${foto.fyllnad.procent} % målad — vägrar skriva en tom referens`);
      continue;
    }
    fs.writeFileSync(V.refvag(nyckel), Buffer.from(foto.b64, 'base64'));
    skrivna.push({ nyckel, fyllnad: foto.fyllnad.procent,
      matt: `${foto.fyllnad.bredd}×${foto.fyllnad.hojd}` });
  }

  await browser.close();
  await new Promise(r => server.close(r));

  if (skrivna.length) {
    // MANIFESTET SLÅS SAMMAN, DET SKRIVS INTE ÖVER.
    //
    // Med VYRA_VISUELL_BARA uppdateras en handfull nycklar — men bilderna för de andra ~170 ligger
    // kvar på disk. Ett manifest som bara listade den här körningens nycklar hade påstått att
    // referensuppsättningen krympt till fem, och `antal` hade sagt fem medan katalogen hade 178.
    // Manifestet ska beskriva vad som FINNS, inte vad den senaste körningen råkade röra.
    const gammalt = fs.existsSync(V.MANIFEST)
      ? (() => { try { return JSON.parse(fs.readFileSync(V.MANIFEST, 'utf8')) } catch (_) { return null } })()
      : null;
    const bilder = Object.assign({}, (gammalt && gammalt.bilder) || {},
      Object.fromEntries(skrivna.map(s => [s.nyckel, { matt: s.matt, fyllnad: s.fyllnad }])));

    // En post vars fil är borttagen är en lögn åt andra hållet. Rensa mot disken.
    for (const nyckel of Object.keys(bilder)) {
      if (!fs.existsSync(V.refvag(nyckel))) delete bilder[nyckel];
    }

    fs.writeFileSync(V.MANIFEST, JSON.stringify({
      motor, antal: Object.keys(bilder).length,
      senaste: { motiv: MOTIV, nycklar: skrivna.length, tid: new Date().toISOString() },
      bilder,
    }, null, 1) + '\n');

    const logg = path.join(V.REFKAT, 'historik.md');
    if (!fs.existsSync(logg)) {
      fs.writeFileSync(logg, '# Historik för de visuella referenserna\n\n'
        + 'Varje rad är en gång någon medvetet bytte ut hur en widget får se ut.\n');
    }
    fs.appendFileSync(logg, `\n## ${new Date().toISOString().slice(0, 10)} — ${skrivna.length} referenser skrivna\n\n`
      + `- **Motiv:** ${MOTIV}\n- **Motor:** ${motor.version}\n`
      + `- **Nycklar:** ${skrivna.length === nycklar.length ? 'alla' : skrivna.map(s => s.nyckel).join(', ')}\n`);
  }

  console.log(`\n${skrivna.length} referenser skrivna till ${path.relative(ROOT, V.REFKAT)}`);
  if (hoppade.length) {
    console.log(`\n${hoppade.length} HOPPADE — de har ingen referens och vakten kommer falla på dem:`);
    hoppade.forEach(h => console.log('   ✘ ' + h));
    process.exitCode = 1;
  }
})();
