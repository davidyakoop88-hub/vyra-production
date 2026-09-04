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
const { kravNycklar, ALERTS, UTAN_REFERENS, utanReferens } =
  require('../tests/helpers/katalognycklar.js');
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

  // SAMMA UNDANTAGSLISTA SOM VAKTEN, av precis samma skäl som fotograferingen bor i en delad fil:
  // två listor glider isär, och den som glider bort skriver referenser vakten aldrig läser eller
  // saknar referenser vakten kräver.
  //
  // Uppmätt 2026-08-19 varför det spelar roll: utan filtret gick skriptet igenom alla 181 nycklar,
  // skrev 167, kunde inte skriva de 14 undantagna — och satte då exitkod 1. CI-jobbet föll efter
  // att ha gjort hela sitt arbete, så bilderna aldrig blev committade. Ett undantag är ett väntat
  // utfall och får inte se ut som ett fel.
  const alla = kravNycklar();
  const undantagna = alla.filter(utanReferens);
  // Kommaseparerad lista, for en andring pavarkar sallan nycklar med gemensam delstrang.
  // Efterkontrollen kor HELA vakten, sa en nyckel som utelamnas ur filtret men pavarkas av
  // andringen faller korningen och ingenting committas.
  const termer = BARA.split(',').map(t => t.trim()).filter(Boolean);
  const nycklar = alla.filter(k => !utanReferens(k))
    .filter(k => !termer.length || termer.some(t => k.includes(t)));
  const motor = V.motorn();
  console.log(`Motor: ${motor.version}  (${motor.binar})`);
  console.log(`Skriver ${nycklar.length} av ${alla.length} referenser${BARA ? ` (filter: ${BARA})` : ''}`);
  console.log(`${undantagna.length} nycklar är undantagna med skäl i UTAN_REFERENS:`);
  for (const [prefix, skal] of Object.entries(UTAN_REFERENS)) {
    const n = alla.filter(k => k === prefix || k.startsWith(prefix)).length;
    console.log(`   · ${prefix} (${n} st) — ${skal.slice(0, 100)}`);
  }
  console.log('');

  // TVA OBEROENDE SESSIONER, OCH BARA DET SOM REPRODUCERAR SKRIVS.
  //
  // En referens ar per definition en bild som gar att ta om. Att skriva den efter ETT foto ar att
  // anta det. Uppmatt 2026-08-19 vad antagandet kostade: CI skrev 167 referenser och nasta korning
  // pa samma maskin och samma binar hittade en nyckel som inte reproducerade — forsta gangen
  // rose-heart, andra gangen giftjar:heart. Varje sadan runda ar en tjugominuters CI-cykel som
  // slutar med att ingenting committas.
  //
  // Nu fotograferas allt i webblasare A, allt i en helt ny webblasare B, och bara de nycklar dar
  // A och B ar identiska skrivs. De ovriga namnges med sina siffror sa att de gar att beddoma
  // direkt i stallet for att upptackas en cykel senare.
  async function session(nummer) {
    const browser = await startaWebblasare();
    const server = await servera();
    const bas = `http://127.0.0.1:${server.address().port}`;
    const sida = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await sida.goto(`${bas}/studio.html?overlay=1`, { waitUntil: 'load' });
    await sida.waitForFunction(() => typeof window.render === 'function', null,
      { timeout: 30000, polling: 100 });
    await sida.waitForTimeout(4500);
    await sida.evaluate(V.RIGG);

    const foton = new Map();
    for (const nyckel of nycklar) foton.set(nyckel, await V.fotografera(sida, nyckel, ALERTS));
    console.log(`Session ${nummer}: ${[...foton.values()].filter(f => !f.fel).length} av `
      + `${nycklar.length} fotograferade`);
    return { browser, server, sida, foton };
  }

  // TRE SESSIONER, OCH DEN FORSTA ROSTAR INTE.
  //
  // Uppmatt 2026-08-19, tva CI-korningar med IDENTISKT utfall: catalog:giftjar:heart skiljde sig med
  // exakt 115 av 87000 pixlar, inom exakt 232x34 px vid (13,254), med exakt kanalskillnad 18 — bade
  // nar referensen kom fran session 1 och vakten kordes i en ny session, och nar session 1 jamfordes
  // med session 2. Samma siffror tva ganger ar inte brus, det ar en systematisk skillnad mellan den
  // FORSTA sessionen och alla senare.
  //
  // Lokalt reproducerar samma nyckel perfekt (0 av 87000) — och lokalt har maskinen redan renderat
  // sidan manga ganger. Det som skiljer ar alltsa nagot som varms upp av den forsta sessionen och
  // sedan delas av resten; en kall fontconfig-cache passar bade fyndet och det avgransade
  // textbandet.
  //
  // Darfor: session 1 ar en uppvarmning och kastas. Referensen tas ur session 2 och maste
  // reproduceras av session 3. Det ar ocksa exakt det tillstand vakten sjalv kommer att kora i,
  // eftersom den aldrig ar det forsta som startar en webblasare pa maskinen.
  const varm = await session('1 (uppvarmning, rostar inte)');
  await varm.browser.close();
  await new Promise(r => varm.server.close(r));

  const a = await session(2);
  await a.browser.close();
  await new Promise(r => a.server.close(r));

  const b = await session(3);

  fs.mkdirSync(V.REFKAT, { recursive: true });
  const skrivna = [], hoppade = [];

  for (const nyckel of nycklar) {
    const f1 = a.foton.get(nyckel), f2 = b.foton.get(nyckel);
    if (f1.fel || f2.fel) { hoppade.push(`${nyckel}: ${f1.fel || f2.fel}`); continue }

    // EN TOM REFERENS MATCHAR ALLT. Att skriva den vore att tysta vakten for just den nyckeln, och
    // den sortens tystnad upptacks aldrig — provet ar ju gront.
    if (f2.fyllnad.procent < 3) {
      hoppade.push(`${nyckel}: bara ${f2.fyllnad.procent} % malad — vagrar skriva en tom referens`);
      continue;
    }

    const r = await b.sida.evaluate(V.JAMFOR, [f1.b64, f2.b64, V.KANALTROSKEL]);
    if (r.matt) {
      hoppade.push(`${nyckel}: matten skilde mellan tva sessioner, ${r.ref} mot ${r.ny}`);
      continue;
    }
    if (r.olika) {
      const ruta = r.ruta ? `${r.ruta[2]}x${r.ruta[3]} px vid (${r.ruta[0]},${r.ruta[1]})` : 'okand';
      hoppade.push(`${nyckel}: REPRODUCERAR INTE — ${r.olika} av ${r.total} pixlar skiljer mellan `
        + `session 2 och 3, inom ${ruta}, storsta kanalskillnad ${r.storsta} av 255`);
      continue;
    }

    fs.writeFileSync(V.refvag(nyckel), Buffer.from(f2.b64, 'base64'));
    skrivna.push({ nyckel, fyllnad: f2.fyllnad.procent,
      matt: `${f2.fyllnad.bredd}x${f2.fyllnad.hojd}` });
  }

  await b.browser.close();
  await new Promise(r => b.server.close(r));

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
  // De här är INTE de undantagna — de är nycklar som skulle ha fått en referens men inte kunde.
  // Exitkod 1 är rätt svar: vakten kommer falla på dem, och det ska synas här och inte först då.
  if (hoppade.length) {
    console.log(`\n${hoppade.length} MISSLYCKADES — de har ingen referens och vakten kommer falla på dem:`);
    hoppade.forEach(h => console.log('   ✘ ' + h));
    process.exitCode = 1;
  }
})();
