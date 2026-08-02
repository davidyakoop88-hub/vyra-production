'use strict';
// The Dockerfile ships an explicit whitelist of files rather than copying the directory. That is a
// deliberate choice — tests, docs and stray files stay out of the image — but it means every new
// runtime module must be added to that list by hand, and forgetting is invisible until the
// container crash-loops. It already happened once: capacity-gate.js was committed, passed all 37
// tests, built cleanly, and then the image died on MODULE_NOT_FOUND because index.js requires a
// file the Dockerfile never copied.
//
// Nothing in a unit test suite catches that, because the suite runs against the working directory
// where every file exists. So this test reads the real Dockerfile, walks the real require() graph
// from the entry points the image actually runs, and asserts the two agree.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const SERVER = path.join(__dirname, '..');
const DOCKERFILE = path.join(SERVER, 'Dockerfile');

// What the image runs: CMD ["node","index.js"] and the pre-deploy step `npm run migrate`.
const ENTRYPOINTS = ['index.js', 'migrate.js'];

// Non-JS files read at runtime. require() cannot see these, so they are named explicitly.
const RUNTIME_ASSETS = ['schema.sql'];

const dockerfile = () => fs.readFileSync(DOCKERFILE, 'utf8');

// Every path COPYed into the image from the build context. `--from=<stage>` copies come from an
// earlier build stage (node_modules), not the repo, so they are not repo files and are skipped.
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
    // last token is the destination, everything else is a source
    parts.filter(p => !p.startsWith('--')).slice(0, -1)
      .forEach(p => files.add(p.replace(/^\.\//, '')));
  }
  return files;
}

const LOCAL_REQUIRE = /require\(\s*(['"])(\.\/[^'"]+)\1\s*\)/g;

function localRequires(file) {
  const source = fs.readFileSync(path.join(SERVER, file), 'utf8');
  const found = [];
  let match;
  LOCAL_REQUIRE.lastIndex = 0;
  while ((match = LOCAL_REQUIRE.exec(source))) found.push(match[2].replace(/^\.\//, ''));
  return found;
}

// Node resolves './capacity-gate' to capacity-gate.js. Mirror that so the graph is keyed on the
// filename the Dockerfile would have to name.
const resolveSpec = spec =>
  fs.existsSync(path.join(SERVER, spec)) && fs.statSync(path.join(SERVER, spec)).isFile()
    ? spec : `${spec}.js`;

// Transitive closure of local requires reachable from the entry points.
function runtimeModules() {
  const seen = new Set(), queue = [...ENTRYPOINTS];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith('.js')) continue;
    if (!fs.existsSync(path.join(SERVER, file))) continue;   // reported by its own test below
    for (const dependency of localRequires(file).map(resolveSpec)) {
      if (!seen.has(dependency)) queue.push(dependency);
    }
  }
  return seen;
}

test('every module the image actually loads is copied into the image', () => {
  const copied = copiedFromRepo(dockerfile());
  const missing = [...runtimeModules()].filter(f => !copied.has(f)).sort();
  assert.deepEqual(missing, [],
    `Dockerfile COPY saknar runtimefiler som index.js/migrate.js kraver: ${missing.join(', ')}. ` +
    'Containern startar inte utan dem — den kraschar med MODULE_NOT_FOUND.');
});

test('the entry points themselves are copied', () => {
  const copied = copiedFromRepo(dockerfile());
  for (const entry of ENTRYPOINTS) {
    assert.ok(copied.has(entry), `${entry} kopieras inte in i imagen`);
  }
});

test('non-JS runtime assets are copied', () => {
  // migrate.js reads schema.sql at runtime; no require() mentions it, so nothing else would notice.
  const copied = copiedFromRepo(dockerfile());
  for (const asset of RUNTIME_ASSETS) {
    assert.ok(copied.has(asset), `${asset} lases vid korning men kopieras inte in i imagen`);
  }
});

test('every file the Dockerfile copies actually exists', () => {
  // The mirror failure: a rename or delete leaves a stale name in the COPY list, and the BUILD
  // fails rather than the container — later, and with a worse error.
  const stale = [...copiedFromRepo(dockerfile())]
    .filter(f => !f.includes('*') && !fs.existsSync(path.join(SERVER, f))).sort();
  assert.deepEqual(stale, [], `Dockerfile kopierar filer som inte finns: ${stale.join(', ')}`);
});

test('the whitelist has not silently become a directory copy', () => {
  // If someone replaces the list with `COPY . ./`, these tests would pass vacuously forever while
  // the image starts shipping tests and any stray secrets in the build context.
  assert.ok(!/^\s*COPY\s+\.\s+\.?\/?\s*$/mi.test(dockerfile()),
    'Dockerfile kopierar hela katalogen — da hamnar tester och allt annat i imagen');
});
