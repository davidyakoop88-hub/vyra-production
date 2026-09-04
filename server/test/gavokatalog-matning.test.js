'use strict';
// VAKT FÖR MÄTVERKTYGET (scripts/gavokatalog-matning.js).
//
// Verktyget finns för att säga i förväg om en gåvolista skulle godkännas av
// `POST /api/admin/gavokatalog`. Räknar det på ett annat sätt än rutten är det värre än inget: det
// skulle lugna inför en seedning som sedan avvisas, eller varna för en som skulle gått igenom.
//
// Proven jämför därför verktyget mot ruttens EGEN räkning och EGEN digest — inte mot hårdkodade
// tal. Ändras normaliseringen i server/gavokatalog.js ska proven följa med av sig själva.
//
// DET VIKTIGASTE PROVET är "lika många poster, ett utbytt id". Kontrolltalen stämmer där, och bara
// medlemskapsbeviset kan fälla listan. Går det provet igenom har digesten slutat betyda något.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');

const ROT = path.join(__dirname, '..', '..');
const SKRIPT = path.join(ROT, 'scripts', 'gavokatalog-matning.js');
const Gavokatalog = require('../gavokatalog.js');
const Matning = require('../../scripts/gavokatalog-matning.js');

// Samma egenheter som TikToks verkliga lista: dubbletter, och poster utan id.
function provlista() {
  const g = [];
  for (let i = 1; i <= 40; i++) g.push({ id: String(1000 + i), name: 'Gava ' + i });
  g.push({ id: '1005', name: 'dubblett' });
  g.push({ id: '1009', name: 'dubblett' });
  g.push({ name: 'utan id' });
  return g;
}

function kor(fil, region, kontraktText) {
  const kontraktFil = path.join(ROT, 'server', 'seedningskontrakt.js');
  const original = fs.readFileSync(kontraktFil, 'utf8');
  if (kontraktText) fs.writeFileSync(kontraktFil, kontraktText);
  try {
    const r = cp.spawnSync(process.execPath, [SKRIPT, fil, region], { cwd: ROT, encoding: 'utf8' });
    return { kod: r.status, ut: (r.stdout || '') + (r.stderr || '') };
  } finally {
    if (kontraktText) fs.writeFileSync(kontraktFil, original);
  }
}

function medKontrakt(matt, digest) {
  const kontraktFil = path.join(ROT, 'server', 'seedningskontrakt.js');
  const original = fs.readFileSync(kontraktFil, 'utf8');
  return original.replace('const KONTRAKT = {',
    'const KONTRAKT = {\n  ZW: { poster: ' + matt.poster + ', unikaId: ' + matt.unikaId
    + ', utanId: ' + matt.utanId + ", digest: '" + digest + "', matt_at: '2026-01-01', kalla: 'prov' },");
}

let kat;
test.before(() => { kat = fs.mkdtempSync(path.join(os.tmpdir(), 'vyra-gavoprov-')) });
test.after(() => { try { fs.rmSync(kat, { recursive: true, force: true }) } catch (_) {} });
const skriv = (namn, data) => {
  const f = path.join(kat, namn); fs.writeFileSync(f, JSON.stringify(data)); return f;
};

test('verktyget raknar exakt som rutten gor', () => {
  const g = provlista();
  // Ruttens rakning, ordagrant ur noteraKatalog(): id ur `id ?? gift_id`, klippt till 160 tecken.
  const unika = new Set(); let utanId = 0;
  for (const p of g) {
    const s = String(p.id ?? p.gift_id ?? '').slice(0, 160).trim();
    if (s) unika.add(s); else utanId += 1;
  }
  const matt = Matning.rakna(g);
  assert.deepEqual(matt, { poster: g.length, unikaId: unika.size, utanId },
    'verktygets rakning skiljer sig fran ruttens — da sager den inget om vad rutten skulle svara');
});

test('en lista som stammer med kontraktet ger exitkod 0', () => {
  const g = provlista();
  const r = kor(skriv('ok.json', { data: { gifts: g } }), 'ZW',
    medKontrakt(Matning.rakna(g), Gavokatalog.digestAvPoster(g)));
  assert.equal(r.kod, 0, 'en korrekt lista ska ge exitkod 0. Utskrift:\n' + r.ut);
  assert.match(r.ut, /STÄMMER/, 'verktyget ska saga att seedningen skulle ga igenom');
});

test('lika manga poster men ett utbytt id fangas — av digesten, inte av antalen', () => {
  const g = provlista();
  const kontrakt = medKontrakt(Matning.rakna(g), Gavokatalog.digestAvPoster(g));
  // Ett id byts. Antalet poster, unika och utan id ar OFORANDRAT.
  const glidit = g.map(x => (x.id === '1020' ? { ...x, id: '9999' } : x));
  assert.deepEqual(Matning.rakna(glidit), Matning.rakna(g),
    'provet ar meningslost om antalen ocksa andrades — da hade kontrolltalen rackt');

  const r = kor(skriv('glidit.json', { gifts: glidit }), 'ZW', kontrakt);
  assert.equal(r.kod, 1, 'en glidd lista ska ge exitkod 1. Utskrift:\n' + r.ut);
  assert.match(r.ut, /INNEHÅLLET HAR GLIDIT/,
    'verktyget ska saga att antalen stammer men innehallet inte gor det — annars dras slutsatsen '
    + '"antalen stammer, alltsa ar listan ratt"');
});

test('en trunkerad lista fangas pa antalen', () => {
  const g = provlista();
  const kontrakt = medKontrakt(Matning.rakna(g), Gavokatalog.digestAvPoster(g));
  const r = kor(skriv('kort.json', { gifts: g.slice(0, 10) }), 'ZW', kontrakt);
  assert.equal(r.kod, 1, 'en trunkerad lista ska ge exitkod 1. Utskrift:\n' + r.ut);
  assert.match(r.ut, /poster: 10 mot kontraktets/, 'avvikelsen ska namnge bada talen');
});

test('en region utan kontrakt foreslar ett block i stallet for att tiga', () => {
  const g = provlista();
  const r = kor(skriv('ny.json', { gifts: g }), 'NO');
  assert.equal(r.kod, 1);
  assert.match(r.ut, /ingen post för NO/, 'verktyget ska saga att regionen saknas');
  assert.match(r.ut, /digest: '[0-9a-f]{64}'/, 'och skriva ut det block som ska in i en granskad PR');
  assert.match(r.ut, /GRANSKAD PR/,
    'blocket far aldrig se ut som nagot man kan posta — kontraktet andras bara via granskning');
});

test('en fil utan gavolista avvisas med besked, inte med en stacktrace', () => {
  const f = path.join(kat, 'skrap.json');
  fs.writeFileSync(f, JSON.stringify({ nagot: 'annat' }));
  const r = kor(f, 'SE');
  assert.equal(r.kod, 2, 'ett anvandarfel ska skiljas fran en avvikelse (1)');
  assert.match(r.ut, /hittade ingen gåvolista/, 'och sagas rakt ut');
});

test('verktyget lamnar seedningskontraktet ororat', () => {
  const kontraktFil = path.join(ROT, 'server', 'seedningskontrakt.js');
  const fore = fs.readFileSync(kontraktFil, 'utf8');
  kor(skriv('ok2.json', { gifts: provlista() }), 'SE');
  assert.equal(fs.readFileSync(kontraktFil, 'utf8'), fore,
    'matverktyget far ALDRIG skriva i kontraktet — det ar hela poangen med granskningen');
});
