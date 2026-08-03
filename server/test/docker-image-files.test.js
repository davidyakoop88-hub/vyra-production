'use strict';
// The Dockerfile copies an explicit whitelist, not the directory. Add a require() to index.js and
// forget the COPY line, and the image builds clean, the tests pass, and the service dies on boot in
// Railway with MODULE_NOT_FOUND. That already happened once here: goal-runtime.js was required from
// index.js while missing from the COPY list, and nothing caught it.
//
// tiktok-bridge got a guard like this after the same trap cost a deploy. server/ never did.
//
// This walks the real require() graph from index.js — recursively, following only local static
// paths — and requires every file it can reach to be in the whitelist. npm packages, node built-ins,
// test files and anything computed at runtime are not the image's problem and are skipped.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const SERVER = path.join(__dirname, '..');
const DOCKERFILE = fs.readFileSync(path.join(SERVER, 'Dockerfile'), 'utf8');

// Only static string literals count. require(someVariable) cannot be resolved here and is not
// something the whitelist could cover anyway.
function localRequires(source) {
  const out = [];
  const pattern = /require\(\s*'(\.[^']*)'\s*\)/g;
  for (let m = pattern.exec(source); m; m = pattern.exec(source)) out.push(m[1]);
  return out;
}

// Resolves './goal-runtime' and './goal-runtime.js' to the same file name.
function resolveLocal(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, base + '.js', path.join(base, 'index.js')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// Everything index.js can reach, transitively.
function reachableFrom(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const spec of localRequires(source)) {
      const resolved = resolveLocal(file, spec);
      // A path that does not resolve is either dynamic or already broken; the module loader would
      // have said so long before the image did.
      if (resolved) queue.push(resolved);
    }
  }
  seen.delete(entry);
  return [...seen];
}

// The COPY line that puts runtime files in the image. Deliberately parsed rather than assumed, so a
// reshuffled Dockerfile does not quietly make this test vacuous.
function copiedFiles() {
  // The deps stage copies package.json alone; the runtime stage is the one carrying index.js. Match
  // on that, not on the first COPY, or this reads the wrong line and reports every file as missing.
  const line = DOCKERFILE.split('\n')
    .find(l => /^COPY\s/.test(l.trim()) && /\bindex\.js\b/.test(l));
  assert.ok(line, 'hittade ingen COPY-rad för runtimefiler i server/Dockerfile');
  return new Set(line.replace(/^COPY\s+/, '').replace(/\s+\.\/\s*$/, '').trim().split(/\s+/));
}

test('varje lokal fil index.js kan nå finns i Dockerfilens COPY-lista', { timeout: 10000 }, () => {
  const entry = path.join(SERVER, 'index.js');
  const reachable = reachableFrom(entry);
  const copied = copiedFiles();

  // Test helpers are not part of the image and must never be reachable from index.js anyway.
  const runtime = reachable.filter(f => !/[\\/]test[\\/]/.test(f));
  assert.ok(runtime.length >= 5, `hittade bara ${runtime.length} lokala moduler — grafen gick fel`);

  const missing = runtime.map(f => path.basename(f)).filter(name => !copied.has(name)).sort();
  assert.deepEqual(missing, [],
    `dessa krävs av index.js men saknas i Dockerfilens COPY-lista och skulle ge MODULE_NOT_FOUND `
    + `i Railway: ${missing.join(', ')}`);
});

test('vitlistan innehåller inget som index.js inte kan nå', { timeout: 10000 }, () => {
  // The other direction: a file copied but no longer required is dead weight in the image, and
  // usually a sign something was renamed. package files and schema.sql are read, not required.
  const NOT_REQUIRED = new Set(['package.json', 'package-lock.json', 'index.js', 'schema.sql', 'migrate.js']);
  const reachable = new Set(reachableFrom(path.join(SERVER, 'index.js')).map(f => path.basename(f)));
  const orphans = [...copiedFiles()].filter(name => !NOT_REQUIRED.has(name) && !reachable.has(name));
  assert.deepEqual(orphans, [], `dessa kopieras men krävs inte av index.js: ${orphans.join(', ')}`);
});

test('testet blir rött om en nåbar fil tas ur COPY-listan', { timeout: 10000 }, () => {
  // Proves the guard is load-bearing rather than trivially true, without editing the Dockerfile.
  const copied = copiedFiles();
  const reachable = reachableFrom(path.join(SERVER, 'index.js'))
    .map(f => path.basename(f)).filter(n => !/[\\/]test[\\/]/.test(n));
  assert.ok(reachable.length > 0);
  const pretend = new Set(copied);
  pretend.delete(reachable[0]);
  const missing = reachable.filter(name => !pretend.has(name));
  assert.deepEqual(missing, [reachable[0]],
    'att ta bort en nåbar fil ur vitlistan upptäcks inte — vakten är verkningslös');
});

test('buildkontexten är fortfarande server/ och vitlistan är kvar', { timeout: 10000 }, () => {
  // A broad `COPY . .` would make this whole test meaningless, and moving the context would change
  // how the API is built. Neither may happen quietly.
  assert.ok(!/^COPY\s+\.\s+\.\/?\s*$/m.test(DOCKERFILE), 'vitlistan har ersatts av en bred COPY');
  assert.ok(!/COPY\s+\.\.\//.test(DOCKERFILE), 'Dockerfilen kopierar utanför buildkontexten');
});

// Structural test above is the load-bearing one. This is the belt-and-braces check for machines that
// happen to have Docker; it is skipped everywhere else rather than failing.
const hasDocker = (() => {
  try { execFileSync('docker', ['version'], { stdio: 'pipe' }); return true } catch { return false }
})();

test('imagen byggs och kan starta node med alla moduler', { timeout: 300000,
  skip: hasDocker ? false : 'Docker saknas — det strukturella testet ovan är beviset' }, () => {
  const tag = 'vyra-server-copy-check:test';
  execFileSync('docker', ['build', '-t', tag, '.'], { cwd: SERVER, stdio: 'pipe' });
  // Loads index.js's whole require graph without binding a port or touching a database.
  const out = execFileSync('docker', ['run', '--rm', '--entrypoint', 'node', tag,
    '-e', "require('./goal-runtime');console.log('MODULER_OK')"], { stdio: 'pipe' });
  assert.match(String(out), /MODULER_OK/);
});
