'use strict';
// Vad som blir publikt på vyralive.app.
//
// Imagen bar tidigare hela repot, så /server/index.js, /server/schema.sql, /electron-app/main.js,
// /docker-compose.yml och /.env.production.example gick att ladda ner av vem som helst. Det gick att
// se först när någon frågade webbservern — inte genom att läsa koden. Det här testet gör frågan
// läsbar: dokumentroten byggs av en tillåtlista i Dockerfilen, och listan tolkas här mot det riktiga
// repot, så en ny hemlighet i roten eller en ny katalog inte kan glida ut oupptäckt.
//
// Testet kör ingen Docker. Det läser Dockerfilens regler och tillämpar dem på filträdet — vilket är
// hela poängen: det ska gå i CI, på varje PR, utan en byggmiljö.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { hoppaOver } = require('./helpers/skip-dirs.js');

const ROOT = path.join(__dirname, '..');
const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');

// Kommentarer bort först: filen förklarar sig själv i prosa, och den prosan nämner precis de
// sökvägar testet letar efter.
//
// `[^\r\n]*`, inte `.*$`: JS-punkten matchar inte \r, så på en CRLF-checkout matchade `$` aldrig och
// strippningen blev en no-op — prosan lästes som instruktioner.
const instructions = dockerfile.split(/\r?\n/)
  .map(line => line.replace(/^\s*#[^\r\n]*/, '').replace(/\s+#\s[^\r\n]*/, ''))
  .join('\n');

// ---- reglerna, lästa ur filen -------------------------------------------------------------------
function copiedDirs() {
  return [...instructions.matchAll(/cp\s+-R\s+([A-Za-z0-9._-]+)\s+\/site\//g)].map(m => m[1]);
}

function copiedExtensions() {
  const loop = instructions.match(/for f in ((?:\*\.[A-Za-z0-9]+\s*)+);/);
  assert.ok(loop, 'hittar ingen ändelseloop i Dockerfilen — reglerna har ändrat form och testet '
    + 'tolkar inte längre det som faktiskt byggs');
  return loop[1].trim().split(/\s+/).map(glob => glob.slice(1).toLowerCase());
}

function copiedNamedFiles() {
  const loop = instructions.match(/for f in ((?:[A-Za-z0-9._-]+\.json\s*)+);/);
  return loop ? loop[1].trim().split(/\s+/) : [];
}

const DIRS = copiedDirs(), EXTENSIONS = copiedExtensions(), NAMED = copiedNamedFiles();

// Efterliknar stage 1: kataloger kopieras hela, roten tas per ändelse plus två namngivna filer.
function served(repoPath) {
  const parts = repoPath.split('/');
  if (parts.length > 1) return DIRS.includes(parts[0]);
  const ext = path.extname(repoPath).toLowerCase();
  return EXTENSIONS.includes(ext) || NAMED.includes(repoPath);
}

test('Dockerfilen kopierar de kataloger och ändelser testet tror', () => {
  assert.deepEqual(DIRS.sort(), ['assets', 'public']);
  for (const ext of ['.html', '.js', '.css', '.png']) {
    assert.ok(EXTENSIONS.includes(ext), `${ext} kopieras inte — sajten skulle tappa filer`);
  }
  assert.ok(NAMED.includes('manifest.json'), 'manifest.json kopieras inte');
});

// ---- det som aldrig får bli publikt --------------------------------------------------------------
const SECRETS = [
  'server/index.js', 'server/schema.sql', 'server/goal-runtime.js', 'server/security.js',
  'server/token-vault.js', 'server/.env.example',
  'electron-app/main.js', 'electron-app/package.json',
  'tiktok-bridge/bridge.js',
  '.env.production.example', 'docker-compose.yml', 'docker-compose.production.yml',
  'Caddyfile', 'Dockerfile', '.dockerignore',
  'package.json', 'package-lock.json',
  'tests/site-image-contents.test.js', 'scripts/goal-churn.js',
];

test('ingen backendkod, konfiguration eller hemlighet hamnar i dokumentroten', () => {
  for (const secret of SECRETS) {
    assert.equal(served(secret), false, `${secret} skulle serveras publikt`);
  }
});

test('sökvägarna testet vaktar finns faktiskt kvar i repot', () => {
  // Utan det här kan filen bli grön för att någon döpt om det den skulle skydda.
  for (const secret of ['server/index.js', 'server/schema.sql', 'electron-app/main.js',
    '.env.production.example', 'docker-compose.yml', 'Caddyfile']) {
    assert.ok(fs.existsSync(path.join(ROOT, secret)), `${secret} finns inte längre — uppdatera listan`);
  }
});

// ---- det som måste fortsätta fungera -------------------------------------------------------------
test('sidorna och deras filer serveras fortfarande', () => {
  for (const asset of ['index.html', 'studio.html', 'overlay.html', 'layout.html',
    'goal-client.js', 'session-state.js', 'media.js', 'studio.js', 'widget-factory.js',
    'studio.css', 'manifest.json']) {
    assert.ok(fs.existsSync(path.join(ROOT, asset)), `${asset} finns inte i repot`);
    assert.ok(served(asset), `${asset} skulle inte serveras — sajten går sönder`);
  }
  for (const asset of ['assets/gifts', 'public/widgets']) {
    assert.ok(fs.existsSync(path.join(ROOT, asset)), `${asset} finns inte i repot`);
    assert.ok(served(asset + '/nagot.png'), `${asset} skulle inte serveras`);
  }
});

// Varje fil sidorna faktiskt refererar måste följa med. Det här är samma kontroll som gjordes en
// gång för hand när tillåtlistan skrevs, men körd på varje PR: lägger någon till en widget som
// laddar en .woff2 eller en .mp4 från roten fångas det här, inte av en trasig sajt i produktion.
test('allt sidorna refererar täcks av tillåtlistan', () => {
  const SKIP = hoppaOver('server', 'electron-app', 'tiktok-bridge',
    'tests', 'scripts', 'docs', 'deploy', 'web', '.github', '.claude', '.deploy', 'backups');
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!SKIP.has(entry.name)) walk(path.join(dir, entry.name), out) }
      else out.push(path.join(dir, entry.name));
    }
    return out;
  };
  const PATTERNS = [/\bsrc\s*=\s*["']([^"'>]+)["']/gi, /\bhref\s*=\s*["']([^"'>]+)["']/gi,
    /url\(\s*["']?([^"')]+)["']?\s*\)/gi, /\.src\s*=\s*["'`]([^"'`]+)["'`]/gi];

  const missing = [];
  for (const file of walk(ROOT).filter(f => /\.(html|css|js)$/i.test(f))) {
    const from = path.relative(ROOT, file).replace(/\\/g, '/');
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of PATTERNS) {
      for (const m of text.matchAll(pattern)) {
        let ref = m[1].trim();
        if (!ref || /^(https?:|data:|blob:|mailto:|tel:|javascript:|#|\/\/)/i.test(ref)) continue;
        if (/[${}]/.test(ref)) continue;          // byggs i runtime, går inte att avgöra statiskt
        ref = ref.split('?')[0].split('#')[0];
        if (!ref) continue;
        const target = ref.startsWith('/') ? ref.slice(1)
          : path.posix.normalize(path.posix.join(path.posix.dirname(from), ref));
        if (target.startsWith('..')) continue;
        // Bara filer som finns: en referens till något som inte ligger i repot är antingen en
        // API-rutt (proxas av Caddy) eller en trasig länk, och ingetdera säger något om imagen.
        if (!fs.existsSync(path.join(ROOT, target))) continue;
        if (!served(target)) missing.push(`${target}  <- ${from}`);
      }
    }
  }
  assert.deepEqual(missing, [], 'filer som sidorna laddar skulle inte längre serveras');
});
