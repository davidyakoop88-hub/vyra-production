'use strict';
// PIXELVAKTENS DOM — jobbet test-visuell i ci.yml. Två löpare har kört vakten (test-visuell-maskin,
// matrisen `maskin`); det här skriptet läser vad var och en såg och fäller EN dom.
//
// VARFÖR TVÅ LÖPARE. Uppmätt 2026-11-23–24: tre körningar föll på att GitHub servade en maskin som
// ritar text som 0a5592fd medan referenserna togs på 3e0f58bc. Samma avbild (20261111.635), samma
// typsnitt, och varje gång exakt samma 34 nycklar — en fast andra maskintyp i poolen, inte brus.
// Processorn avgör det inte: AMD EPYC 9V74 gav grönt ena gången och rött den andra. Maskinen går
// alltså inte att välja bort, och en andra referensuppsättning för den går inte att hålla aktuell.
// Två löpare som båda hamnar på den är däremot ovanligt nog att vara ett riktigt besked.
//
// REGLERNA, i den ordning de prövas:
//   1. Föll riggproven på NÅGON löpare → rött. De kräver inga referenser och är maskinoberoende;
//      faller de är riggen trasig, och det ska ingen andra löpare kunna tysta.
//   2. Föll vakten på en löpare som ritar som referenserna → rött. Det är ett riktigt fynd.
//   3. Annars grönt om minst en löpare ritade som referenserna och klarade vakten.
//   4. Annars rött, med skälet utskrivet: båda avvek (har GitHub bytt rastrerare för hela flottan?)
//      eller ingen löpare kom fram till vakten (nätverk, apt, Chromium).
//
// En löpare som aldrig kom fram (regel 4:s andra fall) tystas alltså av en som gjorde det. Det är
// avsiktligt: ett hängande apt-steg på en maskin säger ingenting om widgetarna.
const fs = require('fs'), path = require('path');

// Ett utfall: { maskin, rigg, vakt, avtryck } där rigg/vakt är stegens outcome
// ('success' | 'failure' | 'skipped' | 'cancelled' | '') och avtryck är innehållet i
// VYRA_VISUELL_AVTRYCK_FIL ({ lagrat, nu, lika }) eller null om provet aldrig hann skriva det.
function klassa(u) {
  if (u.rigg === 'failure') return 'rigg-fel';
  if (!u.avtryck) return u.vakt === 'success' ? 'okant' : 'kom-inte-fram';
  if (!u.avtryck.lika) return u.vakt === 'success' ? 'avvek' : 'avvek-och-foll';
  return u.vakt === 'success' ? 'godkand' : 'fel';
}

function doma(utfall) {
  const rader = utfall.map(u => ({ ...u, klass: klassa(u) }));
  const beskriv = r => `maskin ${r.maskin}: ${r.klass}`
    + (r.avtryck ? ` (ritar ${r.avtryck.nu}, referenserna ${r.avtryck.lagrat || 'utan avtryck'})` : '')
    + ` — rigg ${r.rigg || 'okänd'}, vakt ${r.vakt || 'okänd'}`;
  const logg = rader.map(beskriv);

  if (!rader.length) return { gron: false, skal: 'Inget utfall från någon löpare — matrisjobbet kördes inte.', logg };
  const rigg = rader.filter(r => r.klass === 'rigg-fel');
  if (rigg.length) {
    return { gron: false, logg, skal: `Riggproven föll på maskin ${rigg.map(r => r.maskin).join(', ')}. `
      + 'De är maskinoberoende — riggen är trasig, inte widgetarna. Se jobbets logg.' };
  }
  // 'okant' = vakten grön men inget avtryck skrevs (provet hoppades). Lita inte på det som dom.
  const fel = rader.filter(r => r.klass === 'fel' || r.klass === 'avvek-och-foll');
  if (fel.length) {
    return { gron: false, logg, skal: `Pixelvakten föll på maskin ${fel.map(r => r.maskin).join(', ')}, `
      + 'som ritar text som referenserna. Det är ett riktigt fynd — diffbilderna ligger i artefakten '
      + `visuella-diffar-ci-${fel[0].maskin}.` };
  }
  const godkand = rader.filter(r => r.klass === 'godkand');
  if (godkand.length) {
    const avvek = rader.filter(r => r.klass === 'avvek');
    return { gron: true, logg, skal: `Maskin ${godkand.map(r => r.maskin).join(', ')} ritar som referenserna `
      + 'och klarade vakten.' + (avvek.length ? ` Maskin ${avvek.map(r => r.maskin).join(', ')} avvek `
      + `(${avvek[0].avtryck.nu}) och hoppade över jämförelsen.` : '') };
  }
  if (rader.every(r => r.klass === 'avvek')) {
    const avtryck = [...new Set(rader.map(r => r.avtryck.nu))].join(', ');
    return { gron: false, logg, skal: `Båda löparna ritar text annorlunda än referenserna (${avtryck} mot `
      + `${rader[0].avtryck.lagrat}). Kör om jobbet. Ger flera körningar i rad samma nya avtryck har `
      + 'GitHub bytt rastrerare för hela flottan — ta då om referenserna med visuell-referenser.yml och '
      + 'valet ny_rastrerare=1.' };
  }
  return { gron: false, logg, skal: 'Ingen löpare kom fram till en jämförelse mot referenserna '
    + '(nätverk, apt eller Chromium föll före vakten). Kör om jobbet.' };
}

// Läser katalogen download-artifact lagt ut: en underkatalog per löpare med utfall.json i.
function lasUtfall(kat) {
  if (!fs.existsSync(kat)) return [];
  const filer = [];
  (function gå(d) {
    for (const n of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, n.name);
      if (n.isDirectory()) gå(p); else if (n.name === 'utfall.json') filer.push(p);
    }
  })(kat);
  return filer.map(f => JSON.parse(fs.readFileSync(f, 'utf8')))
    .sort((a, b) => String(a.maskin).localeCompare(String(b.maskin)));
}

if (require.main === module) {
  const dom = doma(lasUtfall(process.argv[2] || 'visuell-utfall'));
  for (const rad of dom.logg) console.log(rad);
  console.log((dom.gron ? 'GRÖNT: ' : 'RÖTT: ') + dom.skal);
  process.exit(dom.gron ? 0 : 1);
}

module.exports = { klassa, doma, lasUtfall };
