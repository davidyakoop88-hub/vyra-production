'use strict';
// Sound Alerts-katalogen mot filerna pa disk — i BADA riktningarna.
//
// Varfor bada: en post utan fil ger en tyst trasig knapp (audioEl.onerror -> en toast), och en fil
// utan post ar 236 filer som ingen kan valja. Bara den forsta riktningen hade slappt igenom halva
// felet, och ett bibliotek som tappar halften av sitt innehall ser komplett ut i en lista.
//
// Katalogen byggs numera av en LOOP over KENNEY_GRUPPER, inte av 236 literala rader. Det ar darfor
// den har vakten finns: en felraknad siffra i grupptabellen ger inget syntaxfel och ingen rod rad
// nagonstans — den ger bara poster som pekar pa filer som inte finns.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const F = require('./helpers/flikar.js');

const ROOT = path.join(__dirname, '..');

// sound-alerts.js ar en klientfil utan modulexport: den bygger `soundAlerts` och binder sig mot
// document. Vi klipper ut katalogdelen och kor bara den, sa provet slipper en hel DOM.
function lasKatalog() {
  const src = fs.readFileSync(path.join(ROOT, 'sound-alerts.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = src.indexOf('const soundAlerts=');
  const slut = src.indexOf('const SA_TRIGGERS');
  assert.ok(start >= 0 && slut > start, 'hittade inte katalogdelen i sound-alerts.js');
  return eval(src.slice(start, slut) + ';soundAlerts');
}

test('varje katalogpost pekar pa en fil som finns', () => {
  const poster = Object.values(lasKatalog());
  assert.ok(poster.length > 200, `katalogen ar misstankt liten: ${poster.length} poster`);
  const saknas = poster.filter(p => p.path && !fs.existsSync(path.join(ROOT, p.path)));
  assert.deepEqual(saknas.map(p => p.path), [], 'poster som pekar pa filer som inte finns');
});

test('varje Kenney-fil har en post — annars gar den inte att valja', () => {
  const katalog = lasKatalog();
  const anvanda = new Set(Object.values(katalog).map(p => (p.path || '').split('/').pop()));
  const filer = fs.readdirSync(path.join(ROOT, 'assets/sounds/kenney')).filter(f => f.endsWith('.mp3'));
  const foraldralosa = filer.filter(f => !anvanda.has(f));
  assert.deepEqual(foraldralosa, [], 'ljudfiler utan katalogpost');
});

test('id och namn ar unika', () => {
  const poster = Object.values(lasKatalog());
  // Namnet ar det ENDA anvandaren ser i kortet. Tva poster som heter likadant ar omojliga att
  // skilja at i gransnittet aven om id:na skiljer sig — darav bada kontrollerna.
  for (const falt of ['id', 'name']) {
    const varden = poster.map(p => p[falt]);
    const dubbletter = [...new Set(varden.filter((v, i) => varden.indexOf(v) !== i))];
    assert.deepEqual(dubbletter, [], `dubblerade ${falt}`);
  }
});

test('katalogens id matchar nyckeln det ligger under', () => {
  // saConnection() och kortets data-sound slar upp pa nyckeln, medan koppla-till-event skriver
  // `soundAlertId: sound.id`. Glider de isar gar ljudet att spela men aldrig att koppla fran.
  for (const [nyckel, post] of Object.entries(lasKatalog())) {
    assert.equal(post.id, nyckel, `nyckeln ${nyckel} bar id ${post.id}`);
  }
});

test('alla Kenney-ljud gar att lasa och ar kortare an kopplingens duration', () => {
  // TVA SAKER, och den forsta ar den som faktiskt small. Forsta versionen av den har vakten mätte
  // bara langden och lat ffprobe-anropet kasta fritt om filen var trasig. Den FALLDE ocksa — pa en
  // mp3 som libmp3lame producerade tom ur ett 69 ms langt klipp — men den fallde av en slump, med
  // ett stacktrace i stallet for ett besked. En vakt som ramlar ur ratt anledning av fel skal
  // sager inget nasta gang. Darfor mats laesbarheten uttryckligen har.
  //
  // Langdtaket: koppla-till-event skapar en Action med `duration: 6`. Ett langre klipp klipps av.
  const { execFileSync } = require('node:child_process');
  let harFfprobe = true;
  try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); } catch { harFfprobe = false; }
  if (!harFfprobe) return; // ffprobe finns i CI men inte pa varje maskin

  const kenney = Object.values(lasKatalog()).filter(p => p.path.includes('/kenney/'));
  assert.ok(kenney.length > 200, `forvantade hela Kenney-uppsattningen, fick ${kenney.length}`);
  const olasbara = [], forLanga = [];
  for (const p of kenney) {
    let sekunder = NaN;
    try {
      sekunder = parseFloat(execFileSync('ffprobe',
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(ROOT, p.path)],
        { encoding: 'utf8' }));
    } catch { /* faller igenom till olasbara nedan */ }
    if (!Number.isFinite(sekunder) || sekunder <= 0) olasbara.push(p.path);
    else if (sekunder > 6) forLanga.push(`${p.id} (${sekunder.toFixed(2)}s)`);
  }
  assert.deepEqual(olasbara, [], 'ljudfiler som inte gar att avkoda');
  assert.deepEqual(forLanga, [], 'klipp som ar langre an Actionens duration: 6');
});

test('en sound alert sparas i ett aktivt VYRA-projekt', async () => {
  // Detta ar inte en localStorage-stubb: fonster(... skrivbar:true) skapar samma
  // committade Studio-session med origin-wide lock som den riktiga Studion behover
  // for writeActive(). Testet kor sedan Sound Alerts egen submit-vag.
  const lager = F.delatLager();
  const studio = await F.fonster({ namn: 'sound-alert-studio', lager, skrivbar: true,
    extraFiler: ['sound-alerts.js'] });
  try {
    studio.document.querySelector('#title').textContent = 'Sound Alerts';
    studio.renderSoundAlerts();
    const form = studio.document.querySelector('#saNewAlert');
    assert.ok(form, 'Sound Alerts skapade inte sitt formulär');
    form.elements.sound.value = 'followCheer';

    await studio.saCreateAlert(form)({ preventDefault() {} });

    const saved = JSON.parse(studio.VyraSessionState.readActiveExtra('vyra-action-event-v2'));
    assert.equal(saved.actions.length, 1, 'ljud-actionen skrevs inte i det aktiva projektet');
    assert.equal(saved.events.length, 1, 'eventet skrevs inte i det aktiva projektet');
    assert.equal(saved.events[0].soundAlertId, 'followCheer');
    assert.equal(saved.actions[0].audioMedia.packagePath, 'assets/sounds/mixkit/follow-cheer.mp3');
    assert.match(studio.__toaster.at(-1), /är kopplad till Gåva mottagen/);
  } finally {
    studio.close();
  }
});
