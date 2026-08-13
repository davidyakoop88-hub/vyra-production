#!/usr/bin/env node
'use strict';

// Domankartans CLI. Allt som handlar om "vem ager den har filen", "vad ska jag kora nar jag
// andrat i X" och "hur stort ar X" gar via den har filen, sa att svaret alltid kommer fran
// .claude/domaner.json och aldrig fran nagons minne.
//
//   node scripts/domaner.js lista            - alla domaner med agent, antal filer och tester
//   node scripts/domaner.js visa <id>        - allt om en doman
//   node scripts/domaner.js filer <id>       - filerna domanen ager (expanderade)
//   node scripts/domaner.js agare <fil>      - vilken doman (och agent) som ager en fil
//   node scripts/domaner.js test <id>        - kor domanens tester
//   node scripts/domaner.js matt <id>        - mat domanen (storlek, filantal, egna matningar)
//   node scripts/domaner.js luckor           - filer i roten utan agare, och dubbelagda filer
//
// Flaggan --json ger maskinlasbar utdata for lista/visa/filer/agare/matt.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROT = path.resolve(__dirname, '..');
const KARTA = path.join(ROT, '.claude', 'domaner.json');

function laesKarta() {
  return JSON.parse(fs.readFileSync(KARTA, 'utf8'));
}

// Monster: '*' matchar inom ett segment, men ett monster som slutar pa '/*' matchar rekursivt
// under den katalogen (assets/* tacker assets/videos/battle/koi-pearl/tap.mp4).
function tillRegex(monster) {
  const rekursiv = monster.endsWith('/*');
  const kropp = rekursiv ? monster.slice(0, -2) : monster;
  const escaped = kropp.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(rekursiv ? `^${escaped}/` : `^${escaped}$`);
}

function matchar(monster, relativPath) {
  return tillRegex(monster).test(relativPath);
}

let _spårade = null;
function sparadeFiler() {
  if (_spårade) return _spårade;
  const ut = execFileSync('git', ['ls-files'], { cwd: ROT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  _spårade = ut.split('\n').filter(Boolean);
  return _spårade;
}

function expandera(monster) {
  const alla = sparadeFiler();
  const regexar = monster.map(tillRegex);
  return alla.filter((f) => regexar.some((r) => r.test(f)));
}

function hittaDoman(karta, id) {
  const d = karta.domaner.find((x) => x.id === id);
  if (!d) {
    const namn = karta.domaner.map((x) => x.id).join(', ');
    console.error(`Okand doman: ${id}\nFinns: ${namn}`);
    process.exit(1);
  }
  return d;
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function storlek(filer) {
  let summa = 0;
  const per = [];
  for (const f of filer) {
    let s = 0;
    try { s = fs.statSync(path.join(ROT, f)).size; } catch { /* borttagen fil */ }
    summa += s;
    per.push({ fil: f, bytes: s });
  }
  per.sort((a, b) => b.bytes - a.bytes);
  return { summa, per };
}

// --- kommandon ---------------------------------------------------------------

function cmdLista(karta, json) {
  const rader = karta.domaner.map((d) => ({
    id: d.id,
    namn: d.namn,
    agent: d.agent,
    filer: expandera(d.filer).length,
    tester: expandera(d.tester).length,
    matningar: (d.matning || []).length,
  }));
  if (json) return console.log(JSON.stringify(rader, null, 2));
  const bredd = Math.max(...rader.map((r) => r.id.length));
  console.log(`${'DOMAN'.padEnd(bredd)}  AGENT                  FILER  TESTER  NAMN`);
  for (const r of rader) {
    console.log(`${r.id.padEnd(bredd)}  ${r.agent.padEnd(21)}  ${String(r.filer).padStart(5)}  ${String(r.tester).padStart(6)}  ${r.namn}`);
  }
  console.log(`\n${rader.length} domaner. Kor "node scripts/domaner.js visa <id>" for detaljer.`);
}

function cmdVisa(karta, id, json) {
  const d = hittaDoman(karta, id);
  const filer = expandera(d.filer);
  const tester = expandera(d.tester);
  if (json) return console.log(JSON.stringify({ ...d, expanderadeFiler: filer, expanderadeTester: tester }, null, 2));
  const { summa } = storlek(filer);
  console.log(`# ${d.namn}  (${d.id})`);
  console.log(`Agent:   ${d.agent}   ->  .claude/agents/${d.agent}.md`);
  console.log(`Syfte:   ${d.syfte}`);
  console.log(`Filer:   ${filer.length} st, ${kb(summa)}`);
  console.log(`Tester:  ${tester.length} st`);
  if (d.matning && d.matning.length) {
    console.log('Matning:');
    for (const m of d.matning) console.log(`  - ${m.namn}: ${m.kommando}`);
  }
  if (d.risker && d.risker.length) {
    console.log('Att veta:');
    for (const r of d.risker) console.log(`  ! ${r}`);
  }
  console.log(`\nKor tester:  node scripts/domaner.js test ${d.id}`);
  console.log(`Mat:         node scripts/domaner.js matt ${d.id}`);
}

function cmdFiler(karta, id, json) {
  const d = hittaDoman(karta, id);
  const filer = expandera(d.filer);
  if (json) return console.log(JSON.stringify(filer, null, 2));
  for (const f of filer) console.log(f);
}

function cmdAgare(karta, fil, json) {
  const rel = path.relative(ROT, path.resolve(ROT, fil)).split(path.sep).join('/');
  const traffar = karta.domaner
    .filter((d) => d.filer.some((m) => matchar(m, rel)))
    .map((d) => ({ id: d.id, namn: d.namn, agent: d.agent }));
  if (json) return console.log(JSON.stringify({ fil: rel, agare: traffar }, null, 2));
  if (!traffar.length) {
    const ovagd = (karta.ovagda || []).some((m) => matchar(m, rel));
    console.log(ovagd ? `${rel}: medvetet utan agare (vendor/metadata).` : `${rel}: INGEN agare. Lagg till i .claude/domaner.json.`);
    return;
  }
  for (const t of traffar) console.log(`${rel}  ->  ${t.namn} (${t.id})  agent: ${t.agent}`);
  if (traffar.length > 1) console.log('\nVarning: mer an en doman gor ansprak pa filen. Skarp monstren.');
}

function cmdTest(karta, id) {
  const d = hittaDoman(karta, id);
  const tester = expandera(d.tester);
  if (!tester.length) {
    console.log(`${d.namn} har inga tester i kartan an. Lagg till dem under "tester" i .claude/domaner.json.`);
    return;
  }
  // Testerna ligger i tre traed med var sitt arbetskatalog-krav.
  const grupper = new Map();
  for (const t of tester) {
    const cwd = t.startsWith('server/') ? 'server' : t.startsWith('tiktok-bridge/') ? 'tiktok-bridge' : t.startsWith('electron-app/') ? 'electron-app' : '.';
    if (!grupper.has(cwd)) grupper.set(cwd, []);
    grupper.get(cwd).push(cwd === '.' ? t : t.slice(cwd.length + 1));
  }
  let fel = 0;
  for (const [cwd, filer] of grupper) {
    console.log(`\n== ${d.namn}: ${filer.length} test i ${cwd === '.' ? 'roten' : cwd} ==`);
    const r = spawnSync('node', ['--test', ...filer], { cwd: path.join(ROT, cwd), stdio: 'inherit' });
    if (r.status !== 0) fel += 1;
  }
  process.exit(fel ? 1 : 0);
}

function cmdMatt(karta, id, json) {
  const d = hittaDoman(karta, id);
  const filer = expandera(d.filer);
  const { summa, per } = storlek(filer);
  const rapport = {
    doman: d.id,
    filer: filer.length,
    bytes: summa,
    storsta: per.slice(0, 5).map((p) => ({ fil: p.fil, kB: +(p.bytes / 1024).toFixed(1) })),
    tester: expandera(d.tester).length,
    egnaMatningar: d.matning || [],
  };
  if (json) return console.log(JSON.stringify(rapport, null, 2));
  console.log(`# Matning: ${d.namn}`);
  console.log(`Filer:   ${rapport.filer} st`);
  console.log(`Storlek: ${kb(summa)}`);
  console.log(`Tester:  ${rapport.tester} st`);
  console.log('Storsta filer:');
  for (const s of rapport.storsta) console.log(`  ${String(s.kB).padStart(8)} kB  ${s.fil}`);
  if (rapport.egnaMatningar.length) {
    console.log('\nEgna matningar (kor manuellt):');
    for (const m of rapport.egnaMatningar) console.log(`  ${m.namn.padEnd(22)} ${m.kommando}`);
  } else {
    console.log('\nInga egna matningar definierade for domanen.');
  }
}

function cmdLuckor(karta, json) {
  const rotfiler = sparadeFiler().filter((f) => !f.includes('/'));
  const utan = [];
  const dubbla = [];
  for (const f of rotfiler) {
    if ((karta.ovagda || []).some((m) => matchar(m, f))) continue;
    const agare = karta.domaner.filter((d) => d.filer.some((m) => matchar(m, f))).map((d) => d.id);
    if (agare.length === 0) utan.push(f);
    else if (agare.length > 1) dubbla.push({ fil: f, agare });
  }
  if (json) return console.log(JSON.stringify({ utanAgare: utan, dubbelagda: dubbla }, null, 2));
  if (!utan.length && !dubbla.length) {
    console.log(`Alla ${rotfiler.length} filer i roten har exakt en agare.`);
    return;
  }
  if (utan.length) {
    console.log(`${utan.length} fil(er) utan agare:`);
    for (const f of utan) console.log(`  ${f}`);
  }
  if (dubbla.length) {
    console.log(`\n${dubbla.length} dubbelagd(a) fil(er):`);
    for (const d of dubbla) console.log(`  ${d.fil}  ->  ${d.agare.join(', ')}`);
  }
  process.exitCode = 1;
}

// --- ingang ------------------------------------------------------------------

function main(argv) {
  const json = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');
  const [kommando, arg] = args;
  const karta = laesKarta();
  switch (kommando) {
    case 'lista': case undefined: return cmdLista(karta, json);
    case 'visa': return cmdVisa(karta, kraev(arg, 'visa <id>'), json);
    case 'filer': return cmdFiler(karta, kraev(arg, 'filer <id>'), json);
    case 'agare': return cmdAgare(karta, kraev(arg, 'agare <fil>'), json);
    case 'test': return cmdTest(karta, kraev(arg, 'test <id>'));
    case 'matt': return cmdMatt(karta, kraev(arg, 'matt <id>'), json);
    case 'luckor': return cmdLuckor(karta, json);
    default:
      console.error(`Okant kommando: ${kommando}\nAnvand: lista | visa | filer | agare | test | matt | luckor`);
      process.exit(1);
  }
}

function kraev(varde, form) {
  if (!varde) {
    console.error(`Saknar argument. Anvand: node scripts/domaner.js ${form}`);
    process.exit(1);
  }
  return varde;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { laesKarta, expandera, matchar, tillRegex };
