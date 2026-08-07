'use strict';
// Anvandardata far inte skrivas i installationskatalogen.
//
// startLocalServer(root, …) anvander `root` till TVA saker: servera statiska filer OCH spara
// layoutbackuper. I en paketerad app ar root = C:\Program Files\VYRA\resources\app, dar en vanlig
// anvandare bara har ReadAndExecute. Skrivningen kastar alltsa EACCES for alla — utom for den som
// kor med avstangd UAC, dar den tyst lyckas. Det ar darfor buggen kunde leva: den maskineras bort
// pa exakt den maskin dar den upptacktes.
//
// Uppmatt: vyra-state-backup.json lag i Program Files med agare BUILTIN\Administrators, och
// katalogen .vyra-backups hade aldrig skapats — versionerade backuper har alltsa aldrig fungerat.
//
// Efter fixen agar `root` bara statiska filer, och allt som skrivs gar till dataDir
// (app.getPath('userData')). En befintlig fil pa den gamla platsen migreras en gang.
//
// ROTT NU: 1-6. Test 7 ar en regressionsvakt och ska vara gron bade fore och efter.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startLocalServer } = require('../local-server');

const REPO = path.resolve(__dirname, '../..');
const LAYOUT = JSON.stringify({ widgets: [{ id: 'w1', type: 'templateTopGift', x: 10, y: 20 }] });

let nextPort = 4310;
const levande = [];

test.after(async () => {
  for (const server of levande) await new Promise(r => server.close(r));
});

function tempkatalog(namn) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `vyra-${namn}-`));
}

// root och dataDir ar med flit SKILDA kataloger. Da blir "skrev den i fel katalog?" en fraga som
// gar att stalla — med en gemensam katalog vore varje test gront av misstag.
async function starta({ root, dataDir } = {}) {
  const port = nextPort++;
  const server = await startLocalServer(root, port, dataDir ? { dataDir } : {});
  levande.push(server);
  return { origin: `http://127.0.0.1:${port}`, server };
}

const filer = dir => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

// ---- 1. Ingen skrivning landar under root ------------------------------------------------------

test('ingen skrivning landar under root', async () => {
  const root = tempkatalog('root'), dataDir = tempkatalog('data');
  // En statisk fil sa root inte ar tom — vi vill kunna se att den ar OFORANDRAD, inte bara tom.
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>hej', 'utf8');
  const fore = filer(root);
  const { origin } = await starta({ root, dataDir });

  const spara = await fetch(`${origin}/api/state`, { method: 'POST', body: LAYOUT });
  const version = await fetch(`${origin}/api/state/version`, { method: 'POST', body: LAYOUT });

  assert.deepEqual(filer(root).sort(), fore.sort(),
    `root fick nya filer: ${filer(root).filter(f => !fore.includes(f)).join(', ')}`);
  assert.ok(spara.ok || version.ok, 'ingen av skrivvagarna svarade — testet mater inget');
  assert.ok(filer(dataDir).length > 0, 'ingenting skrevs till dataDir heller');
});

// ---- 2. Misslyckad skrivning svarar med fel ----------------------------------------------------

test('misslyckad skrivning svarar med fel, inte ok:true', async () => {
  const root = tempkatalog('root2');
  // En FIL dar en katalog forvantas. Ger ENOTDIR pa alla plattformar, till skillnad fran en
  // skrivskyddad katalog som inte biter i CI-containrar som kor som root.
  const dataDir = path.join(tempkatalog('data2'), 'ar-en-fil');
  fs.writeFileSync(dataDir, 'inte en katalog', 'utf8');
  const { origin } = await starta({ root, dataDir });

  const svar = await fetch(`${origin}/api/state`, { method: 'POST', body: LAYOUT });
  const kropp = await svar.json().catch(() => ({}));

  assert.equal(svar.ok, false, `servern svarade ${svar.status} pa en skrivning som inte kunde ske`);
  assert.notEqual(kropp.ok, true, 'servern svarade ok:true trots att ingenting sparades');
});

// ---- 3. Migrering av befintlig fil -------------------------------------------------------------

test('migrering flyttar befintlig backup till dataDir', async () => {
  const root = tempkatalog('root3'), dataDir = tempkatalog('data3');
  fs.writeFileSync(path.join(root, 'vyra-state-backup.json'), LAYOUT, 'utf8');
  await starta({ root, dataDir });

  const flyttad = path.join(dataDir, 'vyra-state-backup.json');
  assert.ok(fs.existsSync(flyttad), 'filen migrerades inte — anvandarens layout blev kvar i installationskatalogen');
  assert.equal(fs.readFileSync(flyttad, 'utf8'), LAYOUT, 'innehallet forandrades under migreringen');
});

// ---- 4. Andra korningen skriver till dataDir ---------------------------------------------------

test('andra körningen skriver till dataDir och återskapar inte den gamla sökvägen', async () => {
  const root = tempkatalog('root4'), dataDir = tempkatalog('data4');
  const legacy = path.join(root, 'vyra-state-backup.json');
  fs.writeFileSync(legacy, LAYOUT, 'utf8');
  await starta({ root, dataDir });                       // korning 1: migrerar
  const { origin } = await starta({ root, dataDir });    // korning 2: normal drift

  const nytt = JSON.stringify({ widgets: [{ id: 'w2', type: 'templateTopLike' }] });
  const svar = await fetch(`${origin}/api/state`, { method: 'POST', body: nytt });
  assert.ok(svar.ok, `skrivningen misslyckades: ${svar.status}`);

  assert.equal(fs.readFileSync(path.join(dataDir, 'vyra-state-backup.json'), 'utf8'), nytt,
    'den nya layouten hamnade inte i dataDir');
  assert.equal(fs.existsSync(legacy), false,
    'den gamla sokvagen aterskapades — da migreras filen om och om igen');
});

// ---- 5. Tom kropp far inte ljuga ---------------------------------------------------------------

test('tom kropp svarar inte ok:true', async () => {
  const root = tempkatalog('root5'), dataDir = tempkatalog('data5');
  const { origin } = await starta({ root, dataDir });

  const svar = await fetch(`${origin}/api/state`, { method: 'POST', body: '' });
  const kropp = await svar.json().catch(() => ({}));

  assert.notEqual(kropp.ok, true,
    'servern sa att layouten sparades trots att ingenting skrevs');
  assert.equal(fs.existsSync(path.join(dataDir, 'vyra-state-backup.json')), false,
    'en tom kropp skapade anda en backupfil');
});

// ---- 6. Migreringen far inte skriva over nyare data --------------------------------------------

// Det racker INTE att kolla att filen ar orord. Utan migrering alls ar den ocksa orord, och da ar
// testet gront av fel skal — det matte ingenting. Darfor tva pastaenden: migreringen lamnade den
// nyare filen ifred, OCH servern skriver darefter till dataDir (alltsa att den kor i nya laget).
test('migrering skriver inte över en befintlig fil i dataDir', async () => {
  const root = tempkatalog('root6'), dataDir = tempkatalog('data6');
  const nyare = JSON.stringify({ widgets: [{ id: 'nyare' }] });
  const mal = path.join(dataDir, 'vyra-state-backup.json');
  fs.writeFileSync(path.join(root, 'vyra-state-backup.json'), LAYOUT, 'utf8');
  fs.writeFileSync(mal, nyare, 'utf8');
  const { origin } = await starta({ root, dataDir });

  assert.equal(fs.readFileSync(mal, 'utf8'), nyare,
    'migreringen skrev over en nyare backup med en aldre fran installationskatalogen');

  const senare = JSON.stringify({ widgets: [{ id: 'senare' }] });
  const svar = await fetch(`${origin}/api/state`, { method: 'POST', body: senare });
  assert.ok(svar.ok, `skrivningen misslyckades: ${svar.status}`);
  assert.equal(fs.readFileSync(mal, 'utf8'), senare,
    'servern skrev inte till dataDir — testet ovan var grönt utan att mäta något');
});

// ---- 7. Regressionsvakt: root serverar fortfarande statiska filer -------------------------------

test('root serverar fortfarande statiska filer', async () => {
  const { origin } = await starta({ root: REPO, dataDir: tempkatalog('data7') });
  const svar = await fetch(`${origin}/studio.html`);
  assert.equal(svar.status, 200, 'statiska filer slutade serveras');
  assert.equal((await fetch(`${origin}/..%2Fpackage.json`)).status, 404, 'sokvagsskyddet gav vika');
});
