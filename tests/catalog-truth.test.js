'use strict';
// Katalogen ska saga sanningen om sig sjalv.
//
// Uppmatt: 17 sektioner i webblasaren, 14 i jsdom. Tre saker stammer inte.
//
// 1. RUBRIKER SOM RAKNAR RAKNAR FEL
//    "BATTLE MVP · 7 DESIGNER" har fjorton knappar. "TOP GIFTER · 21 DESIGNVAL" har trettiosex:
//    21 premiumdesigner, 8 extrateman och 7 ramar, alla under en rubrik som sager 21.
//    En hardkodad siffra i en rubrik glider isar sa fort nagon lagger till en knapp, sa
//    siffrorna ar borttagna ur rubrikerna i stallet for uppdaterade.
//
// 2. TRE KAMPANJTEMAN RITAS IDENTISKT
//    neon, glass och minimal ger samma utseende, i bada orienteringarna — sex knappar, en design.
//    Orsaken ar en ramlos aterstallning i studio.css:121 som listar dem tillsammans:
//
//      .vyra-campaign,.vyra-campaign.campaign-neon,.vyra-campaign.campaign-royal,
//      .vyra-campaign.campaign-glass,.vyra-campaign.campaign-minimal{
//        background:transparent!important;border:0!important;box-shadow:none!important;
//        backdrop-filter:none!important}
//
//    Den ar bade senare OCH mer specifik an .campaign-glass, sa glasets egen panel och blur
//    slacks. minimal ar redan det aterstallningen gor, och neon har ingen egen regel alls.
//
// 3. TVA SEKTIONER SAKNAR KATALOGNYCKEL
//    Top Streak (7 av 7) och Top Gifters premiumdesigner (21 av 36) bygger sina widgets pa egna
//    satt. De gar darfor varken att mata, forhandsvisa eller aterskapa fran en nyckel som resten.
//    Att ge dem nycklar kraver nya familjer i widget-factory.js och ar eget arbete - se
//    UTAN_NYCKEL_ANNU nedan, som later gapet krympa men aldrig vaxa.
//
// Det som INTE ar fel, och som en tidigare matning av mig pastod: VIDEO FX-knapparna. De fyra per
// paket ritas likadant i vila men skapar FYRA OLIKA widgets — skillnaden ar vilken video och
// vilken trigger, inte utseendet. Matningen laste bara utseendet.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

test.after(closeAll);

// Bygger hela widgetkatalogen med den riktiga bind()-kedjan.
function katalog() {
  const h = createDom({ url: 'https://vyralive.app/studio.html', state: { widgets: [], projectName: 'kat' } });
  h.load('overlay-sanitize.js');
  h.load('premium-final.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  // Katalogen bor i EDITORVYNS vansterpanel (studio.js:91), inte i nagon egen overlay-vy, och
  // sektionerna byggs av bind() - inte av render(). Med view='overlay' byggdes noll sektioner
  // och alla matningar nedan blev grona utan att mata nagot. Vakten overst fangade det.
  run(`view='editor';selected=null;render();bind();`);
  const sektioner = [...h.document.querySelectorAll('.widget-catalog section')].map(s => ({
    rubrik: (s.querySelector('h4')?.textContent || '').trim(),
    knappar: [...s.querySelectorAll('button')]
  }));
  return { h, sektioner };
}

test('katalogen byggs alls — testet mater ratt sak', () => {
  const { sektioner } = katalog();
  assert.ok(sektioner.length >= 10,
    `bara ${sektioner.length} sektioner byggdes; testerna nedan mater da nastan ingenting`);
});

// ---- 1. rubriker som raknar maste rakna ratt --------------------------------------------------
test('en rubrik som sager ett antal stammer med antalet knappar', () => {
  const { sektioner } = katalog();
  const fel = [];
  for (const s of sektioner) {
    const m = s.rubrik.match(/(\d+)\s*(DESIGN|DESIGNER|DESIGNVAL|MODELL|TEMA|PREMIUM)/i);
    if (!m) continue;
    if (+m[1] !== s.knappar.length) fel.push(`${s.rubrik} — ${s.knappar.length} knappar`);
  }

  assert.deepEqual(fel, [], 'dessa rubriker sager fel antal:\n  ' + fel.join('\n  '));
});

// ---- 2. varje knapp ar ett eget val -----------------------------------------------------------
test('varje knapp i en sektion skapar en egen widget', () => {
  const { sektioner } = katalog();
  const fel = [];
  for (const s of sektioner) {
    const sedda = new Map();
    for (const b of s.knappar) {
      const nyckel = b.dataset.catalogKey;
      if (!nyckel) continue;
      let w; try { w = VyraWidgets.create(nyckel) } catch (e) { fel.push(`${nyckel}: ${e.message}`); continue }
      const kopia = { ...w }; delete kopia.id;
      const fp = JSON.stringify(Object.keys(kopia).sort().map(k => [k, kopia[k]]));
      if (sedda.has(fp)) fel.push(`${s.rubrik}: ${nyckel} ar identisk med ${sedda.get(fp)}`);
      else sedda.set(fp, nyckel);
    }
  }

  assert.deepEqual(fel, [], 'dessa val ger samma widget:\n  ' + fel.join('\n  '));
});

// ---- 3. varje knapp gar att aterskapa fran en nyckel -------------------------------------------
// Malet ar att VARJE knapp bar en nyckel: da gar den att mata, forhandsvisa och aterskapa. Tva
// sektioner gor det inte an, och att ge dem nycklar kraver nya familjer i widget-factory.js -
// eget arbete, inte en rad.
//
// Listan ar darfor exakt, inte ett undantag: gapet kan inte VAXA, och nar en sektion far sina
// nycklar faller testet tills raden tas bort harifran. Ett "hoppa over det som saknas" hade
// dolt bade tillvaxt och framsteg.
const UTAN_NYCKEL_ANNU = {
  'VYRA TOP STREAK · PREMIUM': 7,
  'TOP GIFTER · DESIGNVAL': 21
};

test('inga fler katalogknappar an de kanda saknar en nyckel', () => {
  const { sektioner } = katalog();
  const nu = {};
  for (const s of sektioner) {
    const n = s.knappar.filter(b => !b.dataset.catalogKey).length;
    if (n) nu[s.rubrik] = n;
  }

  assert.deepEqual(nu, UTAN_NYCKEL_ANNU,
    'kartan over knappar utan katalognyckel har andrats.\n' +
    '  Blev det FLER: de gar varken att mata, forhandsvisa eller aterskapa.\n' +
    '  Blev det FARRE: bra — ta bort raden ur UTAN_NYCKEL_ANNU.\n' +
    '  nu: ' + JSON.stringify(nu));
});

test('varje katalognyckel gar att losa upp', () => {
  const { sektioner } = katalog();
  const fel = [];
  for (const s of sektioner) {
    for (const b of s.knappar) {
      const nyckel = b.dataset.catalogKey;
      if (!nyckel) continue;
      try { const w = VyraWidgets.create(nyckel); if (!w || !w.type) fel.push(nyckel + ': ingen typ') }
      catch (e) { fel.push(nyckel + ': ' + e.message) }
    }
  }

  assert.deepEqual(fel, [], 'dessa nycklar loser inte upp:\n  ' + fel.join('\n  '));
});

// ---- 4. kampanjtemana maste skilja sig -----------------------------------------------------------
test('inget kampanjtema slacks av den ramlosa aterstallningen', () => {
  // Aterstallningen ska ta bort RAMAR. Den far inte lista teman vars identitet ar just det den
  // slacker — glasets panel och blur ar inte en ram.
  const css = fs.readFileSync(path.join(ROOT, 'studio.css'), 'utf8');
  const reset = css.match(/\.vyra-campaign(?:,[^{]*)?\{[^{}]*backdrop-filter:none!important[^{}]*\}/);
  assert.ok(reset, 'hittade inte den ramlosa aterstallningen — testet mater ingenting');

  const listade = [...reset[0].matchAll(/\.campaign-([a-z-]+)/g)].map(m => m[1]);
  const forbjudna = listade.filter(t => t === 'glass');

  assert.deepEqual(forbjudna, [],
    `${forbjudna.join(', ')} listas i aterstallningen, som uttryckligen slacker backdrop-filter ` +
    'och bakgrund — alltsa hela designens identitet');
});

test('neon, glass och minimal har var sin egen styling', () => {
  const css = fs.readdirSync(ROOT).filter(f => f.endsWith('.css'))
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  // Regler som galler BARA det temat, alltsa inte den delade aterstallningen.
  const egna = t => [...css.matchAll(new RegExp('([^{}@]*\\.campaign-' + t + '\\b[^{}]*)\\{([^{}]*)\\}', 'g'))]
    .filter(m => !/backdrop-filter:none!important/.test(m[2])).length;
  const utan = ['neon', 'glass', 'minimal'].filter(t => egna(t) === 0);

  assert.deepEqual(utan, [], `dessa teman har ingen egen styling: ${utan.join(', ')}`);
});
