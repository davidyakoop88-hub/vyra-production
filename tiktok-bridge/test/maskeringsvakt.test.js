'use strict';
// MASKERINGSVAKTEN — inga incheckade inspelningar fran fore maskering version 2 (#354, steg 4).
//
// VARFOR DEN FINNS. Fram till 2026-09-07 skrev inspelaren `maskad: true` i filer som anda lackte
// person-id, avatarsokvagar och visningsnamn (#357). En fil fran fore fixen ser i filhuvudet exakt
// ut som en efter — den enda skillnaden ar `maskeringVersion` i metaraden. Utan det har provet ar
// det ett falt som ingen laser, och en gammal fil kan smyga in som fixtur igen.
//
// VAD DEN VAKTAR. Varje incheckad fil (git ls-files, alltsa ingen hardkodad lista) som ser ut som
// en inspelning eller en fixtur harledd ur en:
//
//   · alla .jsonl/.ndjson — inspelaren skriver .jsonl, och inget annat i repot gor det
//   · .json/.txt/.log som bar en metarad (`"typ":"_meta"`) eller faltet `maskad`/`maskeringVersion`
//   · .js under en fixtures/-katalog som namner samma falt
//
// Var och en maste ha minst en metarad, och VARJE metarad maste ha `maskeringVersion` >= 2. For
// .jsonl maste dessutom forsta raden vara metaraden — det ar sa inspelaren skriver dem.
//
// VAD DEN MED FLIT INTE GOR. Den undantar ingenting. Faller den pa en befintlig fil ar svaret att
// spela in pa nytt, inte att lagga filen pa en lista har.
//
// Den lokala mappen tiktok-bridge/inspelningar/ ar gitignorerad och syns darfor inte for git. Det
// ar ratt: dar far raa filer ligga medan man arbetar. Det ar incheckningen som ar farlig.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const I = require('../inspelare.js');

const ROT = path.join(__dirname, '..', '..');
// Golvet ar 2 och inte I.MASKERING_VERSION: version 2 ar den forsta som ar tat. En framtida
// version 3 gor inte en v2-fil lackande, och vakten ska inte falla pa korrekt maskerade fixturer
// bara for att maskeringen fick ett tillagg.
const MINSTA_VERSION = 2;

const DATA_EXT = new Set(['.json', '.txt', '.log']);
const RAD_EXT = new Set(['.jsonl', '.ndjson']);
// Datafiler: bara JSON-nycklar med citattecken, sa att prosa som "`maskad: true`" i LAS-MIG.txt
// inte raknas som en inspelning. .js-fixturer far ha nycklar utan citattecken.
const MARKOR_DATA = /"typ"\s*:\s*"_meta"|"maskeringVersion"\s*:|"maskad"\s*:/;
const MARKOR_JS = /\btyp\b["']?\s*:\s*["']_meta["']|\bmaskeringVersion\b["']?\s*:|\bmaskad\b["']?\s*:/;
const IGNORERA_KATALOG = new Set(['node_modules', '.git', '.claude']);

// ---- UPPTACKT ----------------------------------------------------------------------------------

// git ls-files ar sanningen om vad som ar incheckat. Fallbacken (ett vanligt katalogtrad) finns
// for en kopia utan .git, t.ex. en zip; den hoppar over node_modules och den gitignorerade
// inspelningsmappen sa att den matchar vad git hade sett.
function listaFiler(rot) {
  try {
    const ut = execFileSync('git', ['-C', rot, 'ls-files', '-z', '--cached'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    // Ar rot inte sjalv repots topp (t.ex. en tempkatalog inuti ett annat repo) ar svaret fel trad.
    const topp = execFileSync('git', ['-C', rot, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (path.resolve(topp).toLowerCase() === path.resolve(rot).toLowerCase()) {
      return ut.split('\0').filter(Boolean);
    }
  } catch (_) { /* ingen git eller inget repo — gå till katalogtradet */ }
  const ut = [];
  (function gaa(rel) {
    for (const post of fs.readdirSync(path.join(rot, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${post.name}` : post.name;
      if (post.isDirectory()) {
        if (IGNORERA_KATALOG.has(post.name) || r === 'tiktok-bridge/inspelningar') continue;
        gaa(r);
      } else if (post.isFile()) ut.push(r);
    }
  })('');
  return ut;
}

function arKandidat(rel, lasa) {
  const ext = path.extname(rel).toLowerCase();
  if (RAD_EXT.has(ext)) return true;
  const iFixtur = /(^|\/)fixtures?\//i.test(rel);
  if (!DATA_EXT.has(ext) && !(ext === '.js' && iFixtur)) return false;
  return (ext === '.js' ? MARKOR_JS : MARKOR_DATA).test(lasa());
}

// En incheckad fil som inte ligger pa disk (sparse checkout, skip-worktree) lases ur indexet.
// Annars vore vakten blind just i de arbetskopior dar man minst ser vad som ar incheckat.
function lasInnehall(rot, rel) {
  const abs = path.join(rot, rel);
  if (fs.existsSync(abs)) return fs.readFileSync(abs, 'utf8');
  try {
    return execFileSync('git', ['-C', rot, 'show', `:${rel}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });
  } catch (_) { return null } // borttagen ur bade disk och index
}

function hittaKandidater(rot) {
  return listaFiler(rot).filter(rel => {
    const ext = path.extname(rel).toLowerCase();
    if (!RAD_EXT.has(ext) && !DATA_EXT.has(ext) && ext !== '.js') return false;
    let innehall;
    const lasa = () => {
      if (innehall === undefined) innehall = lasInnehall(rot, rel);
      return innehall === null ? '' : innehall;
    };
    if (!arKandidat(rel, lasa)) return false;
    lasa();
    return innehall !== null;
  });
}

// Granskar en kandidat aven om den bara finns i indexet: innehallet skrivs da till en tempfil med
// samma andelse, sa att samma tolkning (rader, JSON, require) galler.
function granskaIRepo(rot, rel) {
  const abs = path.join(rot, rel);
  if (fs.existsSync(abs)) return granska(abs, rel);
  const k = fs.mkdtempSync(path.join(os.tmpdir(), 'vyra-maskeringsvakt-index-'));
  try {
    const tmp = path.join(k, `fil${path.extname(rel)}`);
    fs.writeFileSync(tmp, lasInnehall(rot, rel) || '');
    return granska(tmp, rel);
  } finally { fs.rmSync(k, { recursive: true, force: true }) }
}

// ---- GRANSKNING --------------------------------------------------------------------------------

const arMeta = v => v && typeof v === 'object' && !Array.isArray(v) && v.typ === '_meta';

// Metarader i en tolkad struktur: sjalva vardet, element i en lista, eller varden i ett objekt
// (t.ex. `{ _meta: {...}, handelser: [...] }`). Djupare an sa letar vi inte — en metarad som
// gommer sig langre in ar inte en metarad nagon kommer att lasa.
function metaraderI(varde) {
  const ut = [];
  if (arMeta(varde)) ut.push(varde);
  const barn = Array.isArray(varde) ? varde : (varde && typeof varde === 'object' ? Object.values(varde) : []);
  for (const b of barn) if (arMeta(b)) ut.push(b);
  if (varde && typeof varde === 'object' && arMeta(varde._meta) && !ut.includes(varde._meta)) ut.push(varde._meta);
  return ut;
}

function granska(abs, rel = abs) {
  const ext = path.extname(abs).toLowerCase();
  const fel = [];
  let metor = [];
  if (RAD_EXT.has(ext)) {
    const rader = fs.readFileSync(abs, 'utf8').split(/\r?\n/).filter(r => r.trim());
    const tolkade = [];
    rader.forEach((r, i) => {
      try { tolkade.push(JSON.parse(r)) } catch (_) { fel.push(`rad ${i + 1} ar inte giltig JSON`) }
    });
    if (tolkade.length && !arMeta(tolkade[0])) {
      fel.push('forsta raden ar inte en metarad (inspelaren skriver alltid `{"typ":"_meta",...}` forst)');
    }
    metor = tolkade.filter(arMeta);
  } else if (ext === '.js') {
    delete require.cache[require.resolve(abs)];
    metor = metaraderI(require(abs));
  } else {
    let tolkad;
    try { tolkad = JSON.parse(fs.readFileSync(abs, 'utf8')) } catch (_) { tolkad = undefined }
    if (tolkad === undefined) {
      // Inte en JSON-fil — prova radvis, som en inspelning med fel filandelse.
      metor = fs.readFileSync(abs, 'utf8').split(/\r?\n/)
        .map(r => { try { return JSON.parse(r) } catch (_) { return null } })
        .filter(arMeta);
    } else metor = metaraderI(tolkad);
  }

  if (!metor.length) fel.push('saknar metarad helt — da gar det inte att veta om och hur filen ar maskerad');
  metor.forEach((m, i) => {
    const v = m.maskeringVersion;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      fel.push(`metarad ${i + 1} saknar \`maskeringVersion\` (maskad: ${JSON.stringify(m.maskad)}) — filen ar inspelad fore 2026-09-07 och lacker person-id och namn`);
    } else if (v < MINSTA_VERSION) {
      fel.push(`metarad ${i + 1} har \`maskeringVersion\` ${v} — version 1 lacker person-id, avatarsokvagar och visningsnamn trots \`maskad: true\` (#357)`);
    }
  });
  return fel.length ? { fil: rel, fel } : null;
}

function felmeddelande(fynd) {
  return [
    `${fynd.length} incheckad(e) inspelning(ar)/fixtur(er) kan lacka personuppgifter:`,
    '',
    ...fynd.flatMap(f => [`  ${f.fil}`, ...f.fel.map(e => `    - ${e}`)]),
    '',
    `VARFOR: bara filer med \`maskeringVersion\` >= ${MINSTA_VERSION} i metaraden ar maskerade pa riktigt.`,
    'En fil fran fore 2026-09-07 sager `maskad: true` men innehaller anda person-id, avatarsokvagar',
    'och visningsnamn. Efterhandsmaskering ar inte en losning — fixturen ska harledas ur en kand',
    'inspelning (se #354).',
    '',
    'GOR SA HAR:',
    '  1. Ta bort filen ur repot (git rm) — undanta den INTE i det har provet.',
    '  2. Spela in pa nytt: kor SPELA-IN-TIKTOK.cmd (eller VYRA_INSPELNING=1), garna med',
    '     VYRA_INSPELNING_TYPER=alla. Se docs/live-verifiering.md.',
    `  3. Kontrollera att forsta raden i den nya filen har "maskeringVersion":${I.MASKERING_VERSION}.`,
    '  4. Generera fixturen ur den nya inspelningen och checka in den.',
    '',
    'Ar filen inte en inspelning alls (t.ex. en annan sorts .jsonl): ge den en metarad med',
    `"typ":"_meta" och "maskeringVersion":${MINSTA_VERSION}, eller byt format.`,
  ].join('\n');
}

// ---- PROVEN ------------------------------------------------------------------------------------

test('inga incheckade inspelningar eller fixturer har maskering under version 2', () => {
  const kandidater = hittaKandidater(ROT);
  const fynd = kandidater.map(rel => granskaIRepo(ROT, rel)).filter(Boolean);
  assert.equal(fynd.length, 0, felmeddelande(fynd));
});

test('vakten ser hela repot: listan ar inte tom och innehaller vanliga filer', () => {
  // En vakt som tyst listar noll filer (fel rot, git saknas) ar gron for allt. Inspelaren sjalv
  // maste synas, annars tittar vi pa fel trad.
  const alla = listaFiler(ROT);
  assert.ok(alla.length > 100, `listaFiler hittade bara ${alla.length} filer under ${ROT}`);
  assert.ok(alla.includes('tiktok-bridge/inspelare.js'), 'tiktok-bridge/inspelare.js syns inte for vakten');
});

// Resten provar vakten sjalv. Allt skrivs i en tempkatalog och ar syntetiskt — ingen verklig
// identitet, och inget checkas in.
const stadning = [];
test.after(() => { for (const k of stadning) { try { fs.rmSync(k, { recursive: true, force: true }) } catch (_) {} } });
function tempRot() {
  const k = fs.mkdtempSync(path.join(os.tmpdir(), 'vyra-maskeringsvakt-'));
  stadning.push(k);
  return k;
}
function skriv(rot, rel, innehall) {
  const abs = path.join(rot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, innehall);
  return abs;
}
const jsonl = rader => rader.map(r => JSON.stringify(r)).join('\n') + '\n';
// Formen en version 1-fil hade: maskad: true, men namnen ar klartext. Namnen ar pahittade.
const V1_RADER = () => [
  { typ: '_meta', vid: '2026-09-01T20:00:00.000Z', maskad: true, maskeringVersion: 1, bibliotek: '2.4.0' },
  { typ: 'GIFT', kalla: 'vidarebefordrad', vid: '2026-09-01T20:00:01.000Z',
    nyttolast: { user: { userId: '1234567890', uniqueId: 'pahittad_tittare', nickname: 'Pahittad' } } },
];

test('FALLER pa en version 1-inspelning, och sager varfor och hur man gor en ny', () => {
  const rot = tempRot();
  skriv(rot, 'tiktok-bridge/test/fixtures/gammal-inspelning.jsonl', jsonl(V1_RADER()));
  // Mappen hittas via upptackten — inte via en lista — sa att framtida filer ocksa fangas.
  const kandidater = hittaKandidater(rot);
  assert.deepEqual(kandidater, ['tiktok-bridge/test/fixtures/gammal-inspelning.jsonl']);
  const fynd = kandidater.map(rel => granska(path.join(rot, rel), rel)).filter(Boolean);
  assert.equal(fynd.length, 1);
  assert.match(fynd[0].fel.join('\n'), /maskeringVersion` 1/);
  const msg = felmeddelande(fynd);
  assert.match(msg, /gammal-inspelning\.jsonl/);
  assert.match(msg, /SPELA-IN-TIKTOK\.cmd/);
  assert.match(msg, /undanta den INTE/);
});

test('FALLER pa en fil utan maskeringVersion — den aldsta formen, bara `maskad: true`', () => {
  const rot = tempRot();
  const rader = V1_RADER();
  delete rader[0].maskeringVersion;
  const abs = skriv(rot, 'a.jsonl', jsonl(rader));
  const f = granska(abs);
  assert.ok(f, 'en metarad utan version slapptes igenom');
  assert.match(f.fel.join('\n'), /saknar `maskeringVersion`/);
});

test('FALLER pa en .jsonl helt utan metarad', () => {
  const rot = tempRot();
  const abs = skriv(rot, 'b.jsonl', jsonl(V1_RADER().slice(1)));
  const f = granska(abs);
  assert.ok(f);
  assert.match(f.fel.join('\n'), /saknar metarad/);
  assert.match(f.fel.join('\n'), /forsta raden ar inte en metarad/);
});

test('FALLER om en LATER metarad ar version 1, aven nar den forsta ar version 2', () => {
  // Tva inspelningar som klistrats ihop: huvudet ljuger for resten av filen.
  const rot = tempRot();
  const v2 = { ...V1_RADER()[0], maskeringVersion: 2 };
  const abs = skriv(rot, 'c.jsonl', jsonl([v2, ...V1_RADER()]));
  assert.ok(granska(abs), 'en inklistrad v1-del slapptes igenom bakom ett v2-huvud');
});

test('FALLER pa en .json-fixtur och en .js-fixtur med version 1-metarad', () => {
  const rot = tempRot();
  skriv(rot, 'tests/fixtures/korpus.json', JSON.stringify({ _meta: V1_RADER()[0], handelser: [V1_RADER()[1]] }));
  skriv(rot, 'server/test/fixtures/korpus.js', `module.exports = ${JSON.stringify(V1_RADER())};\n`);
  // En .js utanfor fixtures/ ar kod, inte data — den ska inte granskas (annars faller inspelare.js).
  skriv(rot, 'tiktok-bridge/kod.js', "const m = { typ: '_meta', maskad: true };\n");
  const kandidater = hittaKandidater(rot).sort();
  assert.deepEqual(kandidater, ['server/test/fixtures/korpus.js', 'tests/fixtures/korpus.json']);
  for (const rel of kandidater) assert.ok(granska(path.join(rot, rel), rel), `${rel} slapptes igenom`);
});

test('SLAPPER IGENOM en inspelning som den riktiga inspelaren skriver i dag', async () => {
  // Vakten och inspelaren maste vara overens. Skrivs filen av inspelare.js och vakten anda faller,
  // ar det vakten som har fel.
  const rot = tempRot();
  const katalog = path.join(rot, 'tiktok-bridge', 'test', 'fixtures');
  const ins = I.skapa({ pa: true, katalog, anvandare: 'pahittad', logg: () => {} });
  ins.metarad({ bibliotek: 'prov' });
  ins.raa('GIFT', V1_RADER()[1].nyttolast, 'vidarebefordrad');
  await ins.stang();
  const kandidater = hittaKandidater(rot);
  assert.equal(kandidater.length, 1, `vantade en inspelning, fick ${JSON.stringify(kandidater)}`);
  assert.equal(granska(path.join(rot, kandidater[0]), kandidater[0]), null);
});

test('FALLER aven nar v1-filen bara finns i indexet (sparse checkout / skip-worktree)', () => {
  const rot = tempRot();
  const git = (...a) => execFileSync('git', ['-C', rot, ...a], { stdio: ['ignore', 'pipe', 'ignore'] });
  try { git('init', '-q') } catch (_) { return assert.fail('git saknas — vakten kraver git for att se vad som ar incheckat') }
  const rel = 'tests/fixtures/dold.jsonl';
  skriv(rot, rel, jsonl(V1_RADER()));
  git('add', rel);
  git('update-index', '--skip-worktree', rel);
  fs.rmSync(path.join(rot, rel));
  const kandidater = hittaKandidater(rot);
  assert.deepEqual(kandidater, [rel], 'en incheckad fil som inte ligger pa disk syntes inte');
  const f = granskaIRepo(rot, rel);
  assert.ok(f, 'v1-filen i indexet slapptes igenom');
  assert.match(f.fel.join('\n'), /maskeringVersion` 1/);
});

test('den gitignorerade inspelningsmappen granskas inte i ett trad utan git', () => {
  // Dar far raa filer ligga medan man arbetar; det ar incheckningen som ar farlig.
  const rot = tempRot();
  skriv(rot, 'tiktok-bridge/inspelningar/lokal.jsonl', jsonl(V1_RADER()));
  skriv(rot, 'node_modules/x/y.jsonl', jsonl(V1_RADER()));
  assert.deepEqual(hittaKandidater(rot), []);
});
