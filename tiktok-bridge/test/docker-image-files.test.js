'use strict';
// The Dockerfile ships an explicit whitelist of files rather than copying the directory. In
// server/ that same pattern already cost a deploy: capacity-gate.js was committed, every test
// passed, the build was clean, and the container died on MODULE_NOT_FOUND because the COPY line
// never named it.
//
// Here the failure mode is worse. The manager does not require() the bridge — it forks it by path:
//
//     fork(path.join(__dirname, 'bridge.js'), [username], ...)
//
// A require-graph walker never sees that edge. Drop bridge.js from the COPY list and the manager
// still boots, still answers /health with 200, still passes Railway's health check — and silently
// never spawns a single bridge. A green deployment delivering zero events is far harder to notice
// than a crash loop.
//
// So this test follows both kinds of edge: ordinary local require(), and files named inside
// path.join(__dirname, ...). It seeds the graph from both entry points the image can run —
// connection-manager.js (CMD and `npm run manager`) and bridge.js (the forked child).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCKERFILE = path.join(ROOT, 'Dockerfile');

// connection-manager.js is what the service runs; bridge.js is reachable only through fork(), and
// is listed here as a root as well so the test still holds if that fork edge is ever refactored.
const ENTRYPOINTS = ['connection-manager.js', 'bridge.js'];

const dockerfile = () => fs.readFileSync(DOCKERFILE, 'utf8');

// Every path COPYed in from the build context. `--from=<stage>` copies come from an earlier build
// stage (node_modules), not from the repo, so they are not repo files and are skipped.
function copiedFromRepo(text) {
  const files = new Set();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    while (/\\\s*$/.test(line) && i + 1 < lines.length) line = line.replace(/\\\s*$/, ' ') + lines[i += 1];
    const match = /^\s*COPY\s+(.*)$/i.exec(line);
    if (!match) continue;
    const parts = match[1].trim().split(/\s+/);
    if (parts.some(p => p.startsWith('--from='))) continue;
    parts.filter(p => !p.startsWith('--')).slice(0, -1)
      .forEach(p => files.add(p.replace(/^\.\//, '')));
  }
  return files;
}

const LOCAL_REQUIRE = /require\(\s*(['"])(\.\/[^'"]+)\1\s*\)/g;
// fork(path.join(__dirname, 'bridge.js'), ...) — and spawn/execFile/readFileSync forms of the same
// idea. Anything addressed relative to __dirname is a file that must exist inside the image.
const DIRNAME_FILE = /__dirname\s*,\s*(['"])([^'"]+)\1/g;

function referencedFiles(file) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const found = [];
  for (const pattern of [LOCAL_REQUIRE, DIRNAME_FILE]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) found.push(match[2].replace(/^\.\//, ''));
  }
  return found;
}

// Node resolves './normalizer' to normalizer.js. Mirror that, so the graph is keyed on the exact
// filename the Dockerfile would have to name.
const resolveSpec = spec => {
  const full = path.join(ROOT, spec);
  return fs.existsSync(full) && fs.statSync(full).isFile() ? spec : `${spec}.js`;
};

function runtimeFiles() {
  const seen = new Set(), queue = [...ENTRYPOINTS];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith('.js')) continue;
    if (!fs.existsSync(path.join(ROOT, file))) continue;   // covered by its own test below
    for (const dependency of referencedFiles(file).map(resolveSpec)) {
      if (!seen.has(dependency)) queue.push(dependency);
    }
  }
  return seen;
}

test('every file the image actually loads is copied into the image', () => {
  const copied = copiedFromRepo(dockerfile());
  const missing = [...runtimeFiles()].filter(f => !copied.has(f)).sort();
  assert.deepEqual(missing, [],
    `Dockerfile COPY saknar runtimefiler: ${missing.join(', ')}. ` +
    'Utan dem kraschar containern med MODULE_NOT_FOUND — eller, om bridge.js saknas, startar den ' +
    'normalt och spawnar tyst aldrig nagon bridge.');
});

test('the forked child is tracked even though no require() mentions it', () => {
  // The whole reason this file exists. If the fork edge ever stops being detected, the test above
  // silently stops protecting bridge.js — and would keep passing. This asserts the edge itself.
  const reachable = runtimeFiles();
  assert.ok(reachable.has('bridge.js'), 'bridge.js hittades inte via fork/__dirname-sparningen');
  const managerRefs = referencedFiles('connection-manager.js').map(resolveSpec);
  assert.ok(managerRefs.includes('bridge.js'),
    'connection-manager.js forkar bridge.js men sparningen ser inte kanten langre');
});

test('both entry points are copied', () => {
  const copied = copiedFromRepo(dockerfile());
  for (const entry of ENTRYPOINTS) {
    assert.ok(copied.has(entry), `${entry} kopieras inte in i imagen`);
  }
});

test('every file the Dockerfile copies actually exists', () => {
  // The mirror failure: a rename leaves a stale name in the COPY list and the BUILD breaks instead
  // of the container — later, and with a worse error.
  const stale = [...copiedFromRepo(dockerfile())]
    .filter(f => !f.includes('*') && !fs.existsSync(path.join(ROOT, f))).sort();
  assert.deepEqual(stale, [], `Dockerfile kopierar filer som inte finns: ${stale.join(', ')}`);
});

test('the whitelist has not silently become a directory copy', () => {
  // `COPY . ./` would make every assertion above pass vacuously, while shipping tests and anything
  // else in the build context into the image.
  assert.ok(!/^\s*COPY\s+\.\s+\.?\/?\s*$/mi.test(dockerfile()),
    'Dockerfile kopierar hela katalogen — da hamnar tester och allt annat i imagen');
});

test('the check itself fails when a required file is dropped from the COPY list', () => {
  // Proves the test is load-bearing rather than tautological: take the real Dockerfile, remove
  // bridge.js from the COPY line exactly as a careless edit would, and confirm the detection fires.
  const broken = dockerfile().replace(/(^\s*COPY\s+(?![-]).*?)\sbridge\.js/mi, '$1');
  assert.ok(!copiedFromRepo(broken).has('bridge.js'), 'kunde inte simulera bortfallet av bridge.js');

  const copied = copiedFromRepo(broken);
  const missing = [...runtimeFiles()].filter(f => !copied.has(f));
  assert.deepEqual(missing, ['bridge.js'],
    'testet upptacker inte att bridge.js fallit ur COPY-listan — da skyddar det ingenting');
});
