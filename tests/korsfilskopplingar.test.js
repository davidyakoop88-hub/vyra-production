'use strict';
// DE FYRA KORSFILSKOPPLINGARNA -- NU MOT data-ATTRIBUT.
//
// Renderkedjeauditen (2026-09-17) hittade omslag som sokte efter UI-TEXT som en
// ANNAN fil skrev. `String.replace()` pa en icke-traff returnerar strangen
// oforandrad: inget fel kastas, inget loggas, panelen tappar bara tyst det
// omslaget skulle ha lagt till. Den som rattar ett stavfel i en etikett far veta
// det forst nar en anvandare hor av sig.
//
// Kopplingarna ar nu omskrivna till ankare som media.js sander ut med FLIT:
//
//   media.js                       ankare                konsument
//   -------------------------------------------------------------------------
//   :1487  gavoburkens etikett     data-jar-modeller     gift-jar-animals.js
//   :1312  guardianpanelen         data-ge-prakt         guardian-emblem-models.js
//   :1313  praktstegets etikett    data-ge-steg          guardian-emblem-models.js
//   :558   kampanjens orientering  select#campaignOrientation + option[value]
//                                                        gift-campaign-aura.js
//
// Gift Campaign kravde ingen andring i media.js: bade <select> och <option> bar
// redan id respektive value, sa strukturen DUGDE som ankare -- omslaget matchade
// bara pa texten i onodan.
//
// VARFOR DET HAR PROVET SER UT SOM DET GOR. Foregangaren lade en snubbeltrad:
// den las bada filerna som TEXT och jamforde literaler. Det provet kunde inte
// skilja "ersattningen traffar" fran "strangen rakar finnas nagonstans i filen",
// och tvingades darfor nala fast ANTALET forekomster for att inte bli blint for
// partiell drift. Har byggs panelen i stallet pa riktigt och DOM:en far svara.
// Varje koppling provas som ett A/B: panelen UTAN konsumentfilen mot panelen MED
// den. Da mats det som faktiskt betyder nagot -- att ersattningen landade.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');
const factory = require('../widget-factory.js');

const ROOT = path.join(__dirname, '..');
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');

test.after(() => closeAll());

// Bygger panelen for en widget. `filer` ar konsumentfilerna som ska kora ovanpa
// media.js -- utelamna dem for att se vad media.js ENSAM sander ut.
function panel(nyckel, filer, extra = {}) {
  const w = Object.assign(factory.create(nyckel), { id: 'w1' }, extra);
  const h = createDom({ state: { widgets: [w], projectName: 'test' } });
  h.load('overlay-sanitize.js');
  for (const f of filer) h.load(f);
  h.window.eval("view='editor';selected='w1'");
  const html = h.window.eval('props()');
  const box = h.document.createElement('div');
  box.innerHTML = html;
  return box;
}

// -- Gift Jar ---------------------------------------------------------------

// Antalet lases ur konsumentfilen i stallet for att skrivas hit. Laggs en modell
// till foljer provet med; skrivs siffran hit skulle den bli en ny literal att
// halla i synk, vilket ar precis felet vi tar bort.
function antalModeller() {
  const src = fs.readFileSync(path.join(ROOT, 'gift-jar-animals.js'), 'utf8');
  const start = src.indexOf('const models=[');
  assert.notEqual(start, -1, 'hittade ingen models-lista i gift-jar-animals.js');
  const slut = src.indexOf('\n];', start);
  return src.slice(start, slut).split('\n').filter(r => r.trim().startsWith('[')).length;
}

test('gift jar: media.js sander ut ankaret, konsumenten skriver om siffran', () => {
  const utan = panel('catalog:giftjar:lion', []);
  const ankare = utan.querySelector('[data-jar-modeller]');
  assert.ok(ankare, 'media.js sander inte ut [data-jar-modeller] i gavoburkens panel');

  const med = panel('catalog:giftjar:lion', ['gift-jar-animals.js']);
  const efter = med.querySelector('[data-jar-modeller]');
  assert.ok(efter, 'ankaret forsvann nar gift-jar-animals.js kort');

  const n = antalModeller();
  assert.match(efter.textContent, new RegExp('(^|\\D)' + n + '(\\D|$)'),
    `etiketten sager "${efter.textContent}" men filen har ${n} modeller -- ` +
    'ersattningen i gift-jar-animals.js traffade inte ankaret');
  assert.notEqual(efter.textContent, ankare.textContent,
    'etiketten ar oforandrad: omslaget korde men skrev ingenting');
});

// -- Guardian: PRAKT -> UTSEENDE + modellvaljare -----------------------------

const GUARDIAN = ['guardian-emblem-fas.js', 'guardian-emblem-models.js'];

test('guardian: prakt-rubriken byts mot modellvaljaren', () => {
  const utan = panel('catalog:guardianemblem:2', []);
  const rubrik = utan.querySelector('h4[data-ge-prakt]');
  assert.ok(rubrik, 'media.js sander inte ut <h4 data-ge-prakt> i guardianpanelen');

  const med = panel('catalog:guardianemblem:2', GUARDIAN);
  assert.equal(med.querySelector('h4[data-ge-prakt]'), null,
    'prakt-rubriken star kvar -- ersattningen i guardian-emblem-models.js traffade inte');
  assert.ok(med.querySelector('select#geModel'),
    'modellvaljaren saknas: omslaget tog bort ankaret men la inte dit sitt eget');
});

// -- Guardian: praktsteget doljs for andra modeller an guldmodellen ----------

test('guardian: praktsteget doljs for icke-klassiska modeller, inte for classic', () => {
  const utan = panel('catalog:guardianemblem:2', []);
  assert.ok(utan.querySelector('label[data-ge-steg]'),
    'media.js sander inte ut <label data-ge-steg> i guardianpanelen');

  const classic = panel('catalog:guardianemblem:model:classic', GUARDIAN);
  const cSteg = classic.querySelector('label[data-ge-steg]');
  assert.ok(cSteg, 'praktstegets etikett forsvann for classic');
  assert.equal(cSteg.hasAttribute('hidden'), false,
    'praktsteget ar dolt for classic -- steget TILLHOR guldmodellen och ska synas');

  // Vilken modell som helst utom classic; namnet lases ur registret sa att provet
  // inte bar en modellista som kan glida isar fran den riktiga.
  const h = createDom();
  h.load('overlay-sanitize.js');
  const modeller = Object.keys(
    h.window.eval("VyraWidgets.variants('guardianemblem.model')"));
  const annan = modeller.find(m => m !== 'classic');
  assert.ok(annan, 'registret har bara modellen classic -- provet kan inte visa skillnaden');

  const dold = panel('catalog:guardianemblem:model:' + annan, GUARDIAN);
  const dSteg = dold.querySelector('label[data-ge-steg]');
  assert.ok(dSteg, `praktstegets etikett forsvann for ${annan}`);
  assert.equal(dSteg.hasAttribute('hidden'), true,
    `praktsteget syns for ${annan} -- ersattningen traffade inte ankaret`);
});

// -- Gift Campaign: orienteringens etiketter --------------------------------

test('gift campaign: orienteringsetiketterna skrivs om via struktur, inte text', () => {
  const utan = panel('catalog:giftcampaign:aurora:landscape', []);
  const valjare = utan.querySelector('select#campaignOrientation');
  assert.ok(valjare, 'media.js sander inte ut select#campaignOrientation');
  const foreL = valjare.querySelector('option[value="landscape"]').textContent;
  const foreP = valjare.querySelector('option[value="portrait"]').textContent;

  const med = panel('catalog:giftcampaign:aurora:landscape', ['gift-campaign-aura.js']);
  const efter = med.querySelector('select#campaignOrientation');
  assert.ok(efter, 'orienteringsvaljaren forsvann nar gift-campaign-aura.js kort');

  const efterL = efter.querySelector('option[value="landscape"]').textContent;
  const efterP = efter.querySelector('option[value="portrait"]').textContent;

  assert.equal(efterL, 'Liggande · gåvor i rad',
    `liggande-etiketten ar "${efterL}" -- ersattningen i gift-campaign-aura.js traffade inte`);
  assert.equal(efterP, 'Stående · gåvor i följd',
    `staende-etiketten ar "${efterP}" -- ersattningen traffade inte`);
  assert.notEqual(efterL, foreL, 'liggande-etiketten ar oforandrad');
  assert.notEqual(efterP, foreP, 'staende-etiketten ar oforandrad');

  // Katalogen (media.js:1031) bar samma etiketter och ska INTE rotas om: omslaget
  // ska tra bara panelens <select>. Foregangaren kunde inte se skillnaden och
  // nalade darfor fast antalet forekomster i filen.
  assert.equal(efter.querySelectorAll('option').length, 2,
    'orienteringsvaljaren har fatt fler alternativ an de tva den ska ha');
});

// -- Ankarena maste vara entydiga -------------------------------------------

test('varje ankare forekommer exakt en gang i media.js', () => {
  // Ett ankare som star pa tva stallen gor ersattningen godtycklig: `replace()`
  // utan /g tar det forsta, och vilket det ar beror pa i vilken ordning
  // omslagen byggde strangen. Ett attribut ar latt att kopiera med en rad, sa
  // entydigheten ar vard ett prov aven nu nar texten inte langre styr.
  for (const ankare of ['data-jar-modeller', 'data-ge-prakt', 'data-ge-steg']) {
    const n = MEDIA.split(ankare).length - 1;
    assert.equal(n, 1,
      `${ankare} finns ${n} gang(er) i media.js, ska finnas 1. ` +
      'Tva ankare gor konsumentens ersattning godtycklig.');
  }
});

test('reglen star kvar i dokumentationen som de har proven vaktar', () => {
  // Om nagon tar bort regeln ur dokumentet ska proven inte tyst leva vidare som
  // enda spar av varfor de finns.
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'RENDERKEDJAN.md'), 'utf8');
  assert.match(doc, /Matcha aldrig på UI-text/,
    'regeln om UI-text saknas i docs/RENDERKEDJAN.md');
});
