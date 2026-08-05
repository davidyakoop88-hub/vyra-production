'use strict';
// En gavokalla. Inte tva, inte en reserv.
//
// Gavepaketen part1..part9 ar borttagna ur projektet och kvar ligger assets/gifts/events/ med
// 1148 bilder, listade i assets/gifts/gifts-manifest.js. Men media.js bar ocksa en HARDKODAD lista
// pa 51 gavonamn, och hardkodade sokvagar raknade ut ur dem:
//
//   const campaignGiftChoices=['Rose','Community Heart',...].map((name,i)=>
//     ({name,file:`assets/gifts/events/${String(i+1).padStart(4,'0')}_${name.replaceAll(' ','_')...}.png`}));
//   const allCampaignGiftChoices=window.VYRA_GIFTS?.length?window.VYRA_GIFTS:campaignGiftChoices;
//
// Tre saker gor den farlig, och alla tre ar samma sort som veckans buggar:
//
//   1. Den ar en andra sanning om vilka gavor som finns, och kan glida isar fran manifestet.
//   2. Den RAKNAR UT filnamn ur namn. Stammer inte uttrycket med filen pa disk far anvandaren
//      platshallaren - exakt sa Rose, Galaxy och TikTok Universe gick sonder.
//   3. Den slar in TYST sa fort window.VYRA_GIFTS saknas eller ar tom: ett andrat skriptordning,
//      ett misslyckat manifest, och valjaren visar 51 gavor i stallet for 1148 utan ett ord.
//
// Testerna nedan later den inte komma tillbaka.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { hoppaOver } = require('./helpers/skip-dirs.js');

const ROOT = path.join(__dirname, '..');
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
const GIFTS = path.join(ROOT, 'assets', 'gifts');

// ---- pa disk: en mapp ------------------------------------------------------------------------------
test('assets/gifts har exakt en bildmapp', () => {
  const mappar = fs.readdirSync(GIFTS, { withFileTypes: true })
    .filter(p => p.isDirectory()).map(p => p.name);

  assert.deepEqual(mappar, ['events'],
    `hittade ${mappar.join(', ')} — en andra mapp ar en andra uppsattning som kan borja anvandas`);
});

test('assets/gifts innehaller inget utover mappen, manifestet och platshallaren', () => {
  const filer = fs.readdirSync(GIFTS, { withFileTypes: true })
    .filter(p => p.isFile()).map(p => p.name).sort();

  assert.deepEqual(filer, ['gift-placeholder.svg', 'gifts-manifest.js'],
    `ovantade filer i assets/gifts: ${filer.join(', ')}`);
});

// ---- i koden: ingen andra lista ---------------------------------------------------------------------
test('media.js bar ingen egen lista over gavonamn', () => {
  assert.ok(!MEDIA.includes('campaignGiftChoices=['),
    'den hardkodade reservlistan ar tillbaka — den raknar ut filnamn ur namn, och stammer de inte ' +
    'far anvandaren platshallaren utan ett felmeddelande');
});

test('gavolistan kommer bara fran manifestet', () => {
  const rad = MEDIA.split(/\r?\n/).find(r => r.includes('campaignGiftList') && r.includes('VYRA_GIFTS'));
  assert.ok(rad, 'hittade ingen definition som lasar gavolistan till VYRA_GIFTS');
  assert.ok(!/:\s*campaignGiftChoices/.test(rad),
    'listan har fortfarande en reserv att falla tillbaka pa');
});

test('inget i levererad kod raknar ut en gavosokvag ur ett namn', () => {
  // `assets/gifts/events/${...}` med interpolation ar mallen som gick sonder. Manifestet listar
  // filerna rakt av och behover ingen.
  const uttryck = /assets\/gifts\/events\/\$\{/.test(MEDIA);

  assert.equal(uttryck, false,
    'en sokvag byggs av strangar i stallet for att lasas ur manifestet');
});

// ---- beteendet nar manifestet saknas -----------------------------------------------------------------
test('utan manifest erbjuds INGA gavor — inte en annan uppsattning', () => {
  // Tyst halvfungerande ar varre an tomt: 51 gavor ser ut som ett medvetet urval, och ingen letar
  // efter ett fel som inte syns.
  const sandbox = { window: {}, document: { querySelector: () => null } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const rad = MEDIA.split(/\r?\n/).find(r => r.includes('function campaignGiftList'));
  assert.ok(rad, 'campaignGiftList saknas');
  vm.runInContext(rad, sandbox);

  // Kopieras till var egen realm forst: assert/strict jamfor prototyper, och en array fran
  // vm-kontexten har en annan Array.prototype an var. Utan kopian faller det har testet med
  // "[] ar inte []", vilket sager ingenting om koden.
  assert.deepEqual([...sandbox.campaignGiftList()], [],
    'utan manifest foll listan tillbaka pa en annan uppsattning i stallet for att vara tom');
});

test('med manifest erbjuds hela uppsattningen', () => {
  const sandbox = { window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(GIFTS, 'gifts-manifest.js'), 'utf8'), sandbox);
  const rad = MEDIA.split(/\r?\n/).find(r => r.includes('function campaignGiftList'));
  vm.runInContext(rad, sandbox);

  assert.equal(sandbox.campaignGiftList().length, 1148,
    'valjaren erbjuder inte hela manifestet');
});

// ---- borttagna namn far inte leva kvar nagonstans -------------------------------------------------
// allCampaignGiftChoices byttes mot campaignGiftList(). Omdopningen kordes bara over media.js, och
// gift-fireworks.js anvande samma namn pa tre stallen. Det syntes inte i nagot test: filen laddas
// utan att kasta, och felet slog forst nar buildComboRockets faktiskt kordes - alltsa nar en gava
// kom in. Fyrverkerierna var trasiga i produktion.
//
// En textsokning over ALLA levererade filer, inte bara den man rakade andra i.
test('inget borttaget gavonamn lever kvar i levererad kod', () => {
  const BORTTAGNA = ['allCampaignGiftChoices', 'campaignGiftChoices'];
  const HOPPA = hoppaOver('assets', 'tests', 'scripts', '.github',
    'electron-app', 'server', 'tiktok-bridge');
  const filer = [];
  (function walk(d) {
    for (const post of fs.readdirSync(d, { withFileTypes: true })) {
      if (HOPPA.has(post.name)) continue;
      const p = path.join(d, post.name);
      if (post.isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(post.name)) filer.push(p);
    }
  })(ROOT);

  const traffar = [];
  for (const f of filer) {
    const text = fs.readFileSync(f, 'utf8');
    for (const namn of BORTTAGNA) {
      if (text.includes(namn)) traffar.push(path.relative(ROOT, f).split(path.sep).join('/') + ': ' + namn);
    }
  }

  assert.deepEqual(traffar, [],
    'dessa refererar ett namn som inte finns langre — koden laddas utan att kasta och felet slar ' +
    'forst nar raden korrs:\n' + traffar.map(t => '  ' + t).join('\n'));
});

// ---- manifestet ar och forblir den enda sanningen -----------------------------------------------------
test('varje gava i manifestet finns pa disk, och varje bild pa disk star i manifestet', () => {
  const sandbox = { window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(GIFTS, 'gifts-manifest.js'), 'utf8'), sandbox);

  const iManifestet = new Set(sandbox.window.VYRA_GIFTS.map(g => path.basename(g.file)));
  const paDisk = new Set(fs.readdirSync(path.join(GIFTS, 'events')));

  const saknasPaDisk = [...iManifestet].filter(f => !paDisk.has(f));
  const saknasIManifestet = [...paDisk].filter(f => !iManifestet.has(f));

  assert.deepEqual(saknasPaDisk, [], 'manifestet lovar bilder som inte finns');
  assert.deepEqual(saknasIManifestet, [],
    'bilder pa disk som ingen kan valja — de ar dod vikt, eller sa ar manifestet ofullstandigt');
});
