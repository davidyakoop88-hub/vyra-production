'use strict';
// EN REN INLÄSNING AV STUDION FÅR INTE SKRIVA TILL MOLNET.
//
// Uppmätt i produktion 2026-09-15. En engångsmigrering i toplike-studio.js körde vid mount:
//
//   if (!localStorage.getItem('vyra-signature-ranking-frames-v1')) {
//     state.widgets.filter(w => RANKING_TYPES.includes(w.type)).forEach(w => {
//       if (!signatureIds.has(w.profileFrame)) w.profileFrame = 'ocean-oracle'; });
//     save(); localStorage.setItem('vyra-signature-ranking-frames-v1', '1'); }
//
// Den behandlade `undefined` som ett trasigt värde och skrev om Davids Top Like till ocean-oracle
// trots att han klickat opal-dream. OBS visade fel ram. `save()` kördes VILLKORSLÖST, så en ren
// inläsning muterade molnet utan en enda användarinteraktion. Flaggan låg i localStorage (per
// klient) medan datan bor i Postgres (per overlay), så varje ny enhet körde om den mot samma data.
//
// PROVET VAKTAR MÖNSTRET, INTE RADEN — nästa engångsmigrering någon skriver ska falla här.
// Två sorters vakt, för de fångar olika saker:
//   * nätverket: mount får inte skriva widgetdata till molnets overlay, och inga andra skrivningar
//     än de två kända,
//   * källan: ingen klientfil får bära ett localStorage-gatat block som anropar save(). En
//     migrering som muterar `state` UTAN att spara syns inte i nätverket men når molnet vid nästa
//     användarutlösta sparning.
//
// VARFÖR RIKTIG WEBBLÄSARE: migreringen låg i en fil som media.js injicerar asynkront och som
// läser localStorage. jsdom har varken injektionskedjan eller en nätverkslogg att mäta mot.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

let server, browser, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function monteraRent() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  // Lyssnaren sätts FÖRE goto: ett anrop under sidans första bildruta ska räknas.
  const skrivningar = [];
  page.on('request', req => {
    const m = req.method();
    if (m !== 'GET' && m !== 'HEAD' && /\/api\//.test(req.url())) skrivningar.push(`${m} ${req.url()}`);
  });
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null,
    { timeout: 30000, polling: 100 });
  await page.waitForTimeout(3000); // de injicerade filerna landar asynkront
  await page.close();
  return { skrivningar };
}

// NAMNGIVNA LUCKOR, INTE TYSTA UNDANTAG. En ren inläsning skickar i dag två skrivande anrop som
// INTE kommer från någon migrering, uppmätta 2026-09-15:
//
//   POST /api/automation/master   — automationsmotorns eget läge
//   POST /api/state               — den lokala tillståndsbackupen
//
// Båda är egna ärenden: en mount som skriver är fel mönster även när den skriver "sitt eget" läge,
// och det var precis det mönstret som lät migreringen passera obemärkt. De står kvar som en
// EXPLICIT lista i stället för att provet mjukas upp till meningslöshet — dyker ett tredje anrop
// upp faller provet, och den som lagar ett av de två tar bort sin rad.
const KANDA_SKRIVNINGAR_VID_MOUNT = ['/api/automation/master', '/api/state'];

test('en ren inlasning skriver aldrig widgetdata till molnets overlay', { skip, timeout: 120000 }, async () => {
  const { skrivningar } = await monteraRent();
  const motOverlay = skrivningar.filter(r => /\/api\/workspaces\/[^/]+\/overlays\//.test(r));
  assert.deepEqual(motOverlay, [],
    'mount skrev widgetdata till molnets overlay utan att kunden rort nagot — det ar exakt den vag '
    + 'som bytte ram i OBS');
});

test('en ren inlasning skickar inga ANDRA skrivande anrop an de kanda', { skip, timeout: 120000 }, async () => {
  const { skrivningar } = await monteraRent();
  const vagar = [...new Set(skrivningar.map(r => new URL(r.split(' ')[1]).pathname))].sort();
  const ovantade = vagar.filter(v => !KANDA_SKRIVNINGAR_VID_MOUNT.includes(v));
  assert.deepEqual(ovantade, [],
    'en ny skrivning vid mount har tillkommit. Ar den avsiktlig? Lagg till den i '
    + 'KANDA_SKRIVNINGAR_VID_MOUNT med en motivering — annars ar det nasta migrering som muterar '
    + 'kundens data vid inlasning');
});

// KALLVAKTEN MOT SJALVA MONSTRET KOMMER I NASTA PR, inte den har.
//
// Natverksvakterna ovan ser bara vad som lamnar sidan. En migrering som muterar `state` UTAN att
// spara slipper forbi dem och nar molnet vid nasta anvandarutlosta sparning - darfor behovs ocksa
// en kallvakt som letar efter monstret: ett block gatat av en flagga i localStorage som anropar
// save().
//
// Den ar skriven och MUTATIONSBEVISAD (den fangar just den migrering som togs bort har), men den
// ar ROD i dag: samma monster finns pa FEM stallen till i media.js, uppmatt 2026-09-15.
//
//   vyra-toplike-style2-enabled    tvingar likeTheme='center' pa alla Top Like
//   vyra-toplike-three-only        tvingar likeTheme='center' och likeCount=3
//   vyra-remove-old-video-widgets  RADERAR alla video-widgetar
//   vyra-remove-retired-battle-fx  RADERAR alla templateGloveSnipe-widgetar
//   vyra-wide-like-fountain        skriver om bredd/antal/hojd/hastighet pa Like Fountain
//
// Tva av dem RADERAR kundens widgetar ur molnet vid mount pa varje ny klient. De kraver var sin
// matning mot produktionsdatan innan nagon ror dem, precis som ramkollektionen fick. Att mjuka
// upp vakten till gron med en undantagslista hade gjort den meningslos i samma andetag som den
// skrevs. Den aktiveras i uppfoljnings-PR:en nar de fem ar borta.
