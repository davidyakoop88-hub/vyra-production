'use strict';
// "varfor syns en av gavorna och inte resten"
//
// Gift Campaign visade Lion men platshallarikonen for Rose, Galaxy och TikTok Universe.
//
// Gavepaketen part1..part8 togs bort ur projektet. Kvar blev en enda uppsattning bilder,
// assets/gifts/events/ — 1148 filer, identiska med vyralivegifts. Men flera hardkodade
// standardsokvagar pekade fortfarande pa den gamla partN-uppdelningen:
//
//   Rose             assets/gifts/part1/gifts/0001_Rose.png              part1 finns inte
//   Galaxy           assets/gifts/part8/gifts/7973_Galaxy.png            part8 finns inte
//   Lion             assets/gifts/part9/gifts/8371_Lion.png              <- rakade finnas
//   TikTok Universe  assets/gifts/part9/gifts/8389_TikTok_Universe.png   part9 fanns, filen inte
//
// Lion syntes alltsa av en slump: part9 var den enda partN-mappen som blev kvar.
//
// Servern svarar dessutom 200 med text/html for filer som inte finns i stallet for 404, sa
// webblasaren far HTML dar den vantar en bild, misslyckas med att avkoda, och felhanteraren i
// studio.js:1 byter till gift-placeholder.svg. Inget i loggen, inget 404 — bara en gra ikon.
//
// Det har testet lasar fast att varje hardkodad gavosokvag i koden faktiskt finns pa disk. Det
// hade fangat felet nar paketen togs bort.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { hoppaOver } = require('./helpers/skip-dirs.js');

const ROOT = path.join(__dirname, '..');
// tests/ och scripts/ ar med flit utanfor. De innehaller avsiktliga fixturer — 'assets/gifts/rose.png'
// finns inte och ska inte finnas, den ar en stubb for att se ATT en sokvag skrivs ut. Att krava att
// fixturer pekar pa riktiga filer vore att mata fel sak. Det som ska halla ar koden som levereras
// till webblasaren, och den ligger i roten, server/ och electron-app/.
const HOPPA_OVER = hoppaOver('assets', 'tests', 'scripts');
// Manifestet listar hela gavokatalogen och kollas av scripts/test/event-gifts.test.js.
const EJ_FIL = new Set(['gifts-manifest.js']);

function kallfiler(dir, ut = []) {
  for (const post of fs.readdirSync(dir, { withFileTypes: true })) {
    if (HOPPA_OVER.has(post.name)) continue;
    const p = path.join(dir, post.name);
    if (post.isDirectory()) kallfiler(p, ut);
    else if (/\.(js|html|css)$/.test(post.name) && !EJ_FIL.has(post.name)) ut.push(p);
  }
  return ut;
}

// Bade den gamla partN-formen och den nuvarande events-formen matchas. Ett monster som bara
// letade efter partN skulle bli gront sa fort nagon skrev fel pa ett TREDJE satt.
const MONSTER = /assets\/gifts\/[A-Za-z0-9/_-]+\.(png|svg|webp)/g;

function hardkodadeSokvagar() {
  const funna = [];
  for (const fil of kallfiler(ROOT)) {
    const text = fs.readFileSync(fil, 'utf8');
    const traffar = text.match(MONSTER);
    if (!traffar) continue;
    for (const sokvag of new Set(traffar)) {
      funna.push({ fil: path.relative(ROOT, fil).split(path.sep).join('/'), sokvag });
    }
  }
  return funna;
}

test('varje hardkodad gavosokvag i koden finns pa disk', () => {
  const trasiga = hardkodadeSokvagar().filter(t => !fs.existsSync(path.join(ROOT, t.sokvag)));

  assert.deepEqual(trasiga, [],
    'dessa sokvagar ger ingen bild — anvandaren ser gift-placeholder.svg i stallet:\n' +
    trasiga.map(t => `  ${t.sokvag}   <- ${t.fil}`).join('\n'));
});

test('inget i koden pekar langre pa de borttagna gavopaketen', () => {
  // Sokvagen kan rakan finnas kvar, som Lion gjorde. Att den fungerar gor den inte ratt: den
  // pekar in i ett paket som ar borttaget, och nasta stadning tar den med sig.
  const kvar = hardkodadeSokvagar().filter(t => /assets\/gifts\/part[0-9]+\//.test(t.sokvag));

  assert.deepEqual(kvar, [],
    'partN-paketen ar borttagna ur projektet; bilderna ligger i assets/gifts/events/:\n' +
    kvar.map(t => `  ${t.sokvag}   <- ${t.fil}`).join('\n'));
});

// ---- kampanjens fyra forsta, alltsa precis det som syntes trasigt -----------------------------
test('Gift Campaigns standardgavor har alla en bild', () => {
  const media = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
  const rad = media.match(/const campaignDefaults=\[.*?\];/s);
  assert.ok(rad, 'campaignDefaults hittades inte i media.js — testet mater ingenting');

  const poster = [...rad[0].matchAll(/\['([^']+)','([^']+)'/g)].map(m => ({ namn: m[1], bild: m[2] }));
  assert.ok(poster.length >= 4, `hittade bara ${poster.length} standardgavor`);

  const utanBild = poster.filter(p => !fs.existsSync(path.join(ROOT, p.bild)));
  assert.deepEqual(utanBild, [],
    'dessa standardgavor visar platshallaren i stallet for sin bild:\n' +
    utanBild.map(p => `  ${p.namn}: ${p.bild}`).join('\n'));
});

// ---- att uppsattningen ar den ratta ------------------------------------------------------------
test('assets/gifts/events innehaller hela vyralivegifts-uppsattningen', () => {
  const filer = fs.readdirSync(path.join(ROOT, 'assets', 'gifts', 'events'));

  assert.equal(filer.length, 1148,
    `events/ har ${filer.length} filer, inte 1148 — uppsattningen ar inte den som ska ligga dar`);
  for (const namn of ['0001_Rose.png', '7973_Galaxy.png', '8371_Lion.png', '8389_TikTok_Universe.png']) {
    assert.ok(filer.includes(namn), `${namn} saknas i events/`);
  }
});
