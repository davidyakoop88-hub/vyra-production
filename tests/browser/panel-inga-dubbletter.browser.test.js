'use strict';
// Egenskapspanelen får inte ha två kontroller för samma inställning — RÖTT FÖRST (2026-09-09).
//
// DAVIDS ORD: "just nu hur jag ser layout EGENSKAPER gör mig förvirrad och vet inte om allt funkar".
// Mätningen bakom provet svarade på den andra halvan: av 196 kontroller i sex widgets fungerar 187.
// De nio som inte skriver till widgeten är avsiktliga (Presetnamn/Prestanda gäller scenen, inte
// widgeten; propHeight är skrivskyddad för aspect-styrda widgets). Förvirringen kommer från något
// annat: SAMMA inställning har flera kontroller, med olika namn och olika spann.
//
// UPPMÄTT FÖRE (Top Streak premium, tre dubbletter — alla från bindare i media.js som lägger sig
// ovanpå premium-final.js:s egen panel):
//   * streakSpeed: "Rörelse" 0,5–2 GÅNGER (#pfStreakSpeed) och "Animation" 1,5–7 SEKUNDER
//     (#streakSpeed). Samma fält, olika enheter. Drar man "Animation" till 5 s blir renderarens
//     multiplikator 5× — och "Rörelse" visar 2, sitt eget tak. Värdet på skärmen är då en lögn.
//   * streakTheme: "Stil" (#pfStreakStyle) och en andra temaväljare (#streakTheme) som dessutom
//     skriver över accentfärgen.
//   * giftSize: "Giftstorlek" 24–140 (#universalGiftSize) och "Profil/gåva" 36–130 (#pfStreakSize).
//     Samma i Top Gift, där premium-reglaget går till 220 och det andra visar 140.
//
// REGELN, formulerad så att den fångar dubbletterna men släpper igenom de AVSIKTLIGA presetarna
// (Fan Levels och Heart Goals "Tema"-väljare sätter flera färgfält på en gång, och en färgruta
// bredvid finjusterar ett av dem):
//   Två kontroller är en dubblett när de skriver till EXAKT samma fältmängd, eller när den enas
//   fältmängd ryms i den andras OCH båda är av samma sort (två select, två range, ...).
//   En preset (select som sätter flera fält) plus en färgruta för ett av dem är alltså tillåtet.
//
//   KRYSSRUTOR ÄR UNDANTAGNA från varandra. Last-X "VILKA SKA VISAS" har fyra kryssrutor som alla
//   skriver till `lastXType` — men var och en äger sin post i listan, vilket är rätt mönster för
//   ett flerval. Två reglage eller två väljare för samma fält är däremot alltid ett fel.
//
// VARFÖR RIKTIG WEBBLÄSARE: panelen byggs av elva filer som monkey-patchar props()/bind(), flera av
// dem injicerade asynkront av media.js. Vilka kontroller som faktiskt hamnar i panelen går bara att
// se när alla har kört. §7: provet klickar och skriver i de riktiga kontrollerna och läser state.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

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

let server, browser, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Ett tvärsnitt av de familjer som har flest panelbyggare ovanpå sig.
const WIDGETS = [
  'catalog:topgift:premium:royal',
  'catalog:topgift',
  'catalog:topstreak:premium:liquid',
  'catalog:topstreak',
  'catalog:topstreak:frame:amethyst-heart',
  // catalog:topgift:frame:* togs bort 2026-09-23 nar Top Gifts ramgren pensionerades
  // (docs/topgift-gallringen.md). Top Streaks ram star kvar och bar formen vidare.
  'catalog:toplike:clean',
  'catalog:fanlevel:gold',
  'catalog:lastx:card',
  'catalog:heartgoal:classic',
];

const SEL = '.properties input:not([type=hidden]):not([type=file]),.properties select,.properties textarea';

async function editorn() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  // REDO AR ETT TILLSTAND, INTE EN KLOCKA. Uppmatt 2026-09-23 over fem laddningar: 32-39 ms fran
  // .editor-shell tills VyraWidgets.create() svarar och panelen har kontroller. Somnen stod pa
  // 2500 — sextiofyra ganger marginalen.
  await page.waitForFunction(() => !!(window.VyraWidgets && window.VyraWidgets.create), null,
    { timeout: 30000, polling: 25 });
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(s => { window.__SEL = s; }, SEL);
  return page;
}

// Seedar om widgeten från grunden. Panelen ritas om vid varje ändring, så varje kontroll måste
// mätas mot ett orört utgångsläge och slås upp på nytt.
async function seeda(page, nyckel) {
  // PANELEN AR STABIL NAR ANTALET KONTROLLER SLUTAT ANDRAS, inte nar en klocka gatt ut.
  //
  // Elva filer monkey-patchar props()/bind() och flera injiceras asynkront av media.js, sa
  // panelen vaxer i flera steg efter render(). Somnen stod pa 650 ms. Uppmatt 2026-09-23 over
  // fem widgetfamiljer: 34 ms median, 55 ms varst — tolv ganger marginalen, och varje kontroll
  // i provet betalade den.
  //
  // Loopen ligger INNE i evaluate: en pollning per 5 ms utan en round-trip till noden emellan,
  // och tre stabila matningar i rad innan den slapper. Taket pa 2 s ar langt over den uppmatta
  // varsta tiden och faller tillbaka pa samma beteende som den gamla somnen hade haft.
  await page.evaluate(async n => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(n);
    w.x = 200; w.y = 200;
    state.widgets.push(w);
    selected = w.id;
    render();
    let forra = -1, stabila = 0;
    for (let k = 0; k < 400; k++) {
      const antal = document.querySelectorAll(window.__SEL).length;
      if (antal > 0 && antal === forra) { if (++stabila >= 3) return; } else { stabila = 0; }
      forra = antal;
      await new Promise(r => setTimeout(r, 5));
    }
  }, nyckel);
}

// Vilka fält i widgetens state en kontroll skriver till. null = kontrollen kunde inte provas.
async function faltFor(page, kontroll) {
  const start = await page.evaluate(([id, i]) => {
    const el = id ? document.querySelector('.properties #' + CSS.escape(id))
                  : document.querySelectorAll(window.__SEL)[i];
    if (!el) return null;
    const fore = JSON.stringify(state.widgets[0]);
    if (el.type === 'checkbox') el.checked = !el.checked;
    else if (el.type === 'range') { const mn = +el.min || 0, mx = +el.max || 100; el.value = String(Math.abs(+el.value - mx) < 1e-9 ? mn : mx); }
    else if (el.type === 'number') el.value = String((+el.value || 0) + 7);
    else if (el.type === 'color') el.value = el.value === '#123456' ? '#654321' : '#123456';
    else if (el.tagName === 'SELECT') { const kvar = [...el.options].filter(o => o.value !== el.value); if (!kvar.length) return null; el.value = kvar[0].value; }
    else el.value = (el.value || '') + 'X';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return fore;
  }, [kontroll.id, kontroll.i]);
  if (start === null) return null;
  // EN KONTROLL SOM SKRIVER GOR DET DIREKT; EN SOM INTE GOR DET MASTE FA HELA BUDGETEN.
  //
  // Uppmatt 2026-09-23 over 60 kontroller i fem widgetfamiljer: av de 45 som andrar state gor 
  // medianen det pa 1 ms och den varsta pa 27. Somnen stod pa 240, alltsa nio ganger varsta 
  // fallet — betald aven av de kontroller som svarade omedelbart.
  //
  // De 15 som INTE andrar state ar inte ett fel: Presetnamn och Prestanda galler scenen, och
  // propHeight ar skrivskyddad for aspect-styrda widgets. For dem kan ingen vantan forkortas —
  // frånvaron av en andring bevisas bara genom att vanta ut budgeten. Den ar darfor kvar pa
  // 250 ms, samma storleksordning som forut, och det ar ratt: provet far inte bli snabbare
  // genom att sluta kolla.
  const efter = await page.evaluate(async fore => {
    for (let k = 0; k < 125; k++) {
      const nu = JSON.stringify(state.widgets[0]);
      if (nu !== fore) return nu;
      await new Promise(r => setTimeout(r, 2));
    }
    return JSON.stringify(state.widgets[0]);
  }, start);
  const a = JSON.parse(start), b = JSON.parse(efter), andrade = [];
  for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) andrade.push(f);
  }
  return andrade;
}

const ryms = (liten, stor) => liten.length > 0 && liten.every(f => stor.includes(f));

for (const nyckel of WIDGETS) {
  test(`${nyckel}: ingen inställning har två kontroller`, { skip }, async () => {
    const page = await editorn();
    try {
      await seeda(page, nyckel);
      const kontroller = await page.evaluate(() => [...document.querySelectorAll(window.__SEL)].map((el, i) => {
        const lbl = el.closest('label'), g = el.closest('.property-group');
        return {
          i, id: el.id || '', sort: el.tagName === 'SELECT' ? 'select' : (el.type || 'text'),
          etikett: (lbl ? [...lbl.childNodes].filter(n => n.nodeType === 3 || n.tagName === 'B').map(n => n.textContent).join(' ') : '').replace(/\s+/g, ' ').trim().slice(0, 30),
          grupp: (g?.querySelector('h4,.pg-toggle')?.textContent || '(utan grupp)').replace(/[▸▾›]/g, '').trim(),
        };
      }));
      assert.ok(kontroller.length > 5, `${nyckel}: bara ${kontroller.length} kontroller — panelen byggdes inte`);

      const matta = [];
      for (const k of kontroller) {
        await seeda(page, nyckel);                 // orört utgångsläge per kontroll
        const falt = await faltFor(page, k);
        if (falt && falt.length) matta.push({ ...k, falt });
      }

      // GRONT AV TOMHET AR DET FARLIGA UTFALLET HAR, och det blev farligare nar vantan blev
      // adaptiv (2026-09-23). Kollapsar den ser varje kontroll ut som om den inte skriver nagot,
      // `matta` blir tom, inga par jamfors — och provet sager GRONT utan att ha vaktat nagot.
      //
      // Uppmatt samma dag over alla nio widgetar: 30-47 av 31-48 kontroller mappar, alltsa
      // 92-98 %. Rubriken hogst upp bar samma andel fran 2026-09-09 (187 av 196). Golvet star pa
      // 70 % — langt under det uppmatta, langt over en kollaps.
      assert.ok(matta.length >= Math.ceil(kontroller.length * 0.7),
        `bara ${matta.length} av ${kontroller.length} kontroller i ${nyckel} kunde mappas till ett `
        + 'falt. Provet har inget att jamfora och skulle bli gront utan att vakta nagot — troligen '
        + 'har vantan i faltFor() blivit for kort for panelen.');

      const dubbletter = [];
      for (let a = 0; a < matta.length; a++) {
        for (let b = a + 1; b < matta.length; b++) {
          const x = matta[a], y = matta[b];
          if (x.sort === 'checkbox' && y.sort === 'checkbox') continue;   // flerval, se rubriken
          const identiska = x.falt.length === y.falt.length && x.falt.every(f => y.falt.includes(f));
          const delmangdSammaSort = x.sort === y.sort && (ryms(x.falt, y.falt) || ryms(y.falt, x.falt));
          if (identiska || delmangdSammaSort) {
            dubbletter.push(`"${x.etikett}" (${x.grupp}, #${x.id || '?'}) och "${y.etikett}" (${y.grupp}, #${y.id || '?'}) styr båda ${x.falt.join('+')} / ${y.falt.join('+')}`);
          }
        }
      }
      assert.deepEqual(dubbletter, [], `${nyckel} har ${dubbletter.length} dubblerade inställningar:\n  - ${dubbletter.join('\n  - ')}`);
    } finally {
      await page.close();
    }
  });
}
