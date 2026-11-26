'use strict';
// VYRA-CLI (scripts/vyra.js) — redigerar en LOKAL state-fil. Domän: widgets.
//
// Provet vaktar tre saker som går sönder tyst över tid:
//   1. Listorna över Action-typer och triggers är avlästa ur action-event.js. Lägger någon till en typ
//      där måste CLI:t följa med, annars avvisar det en giltig typ eller släpper igenom en ogiltig.
//   2. Filen CLI:t skriver är appens BACKUPformat (__vyraBackup). Molnformatet (__vyraCloud) släpps
//      tyst av appens filimport — Actions och Events försvinner utan felmeddelande (uppmätt i
//      riktig Studio). Extras-nycklarna måste vara de state-backup.js faktiskt läser.
//   3. Widgets kommer från widget-factory.js, aldrig handskrivna.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');

const ROT = path.join(__dirname, '..');
const CLI = path.join(ROT, 'scripts', 'vyra.js');
const lib = require(CLI);
const kalla = f => fs.readFileSync(path.join(ROT, f), 'utf8');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vyra-cli-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

let n = 0;
const nyFil = () => path.join(tmp, `s${++n}.json`);
function kor(fil, ...args) {
  const r = spawnSync(process.execPath, [CLI, '-p', fil, ...args], { encoding: 'utf8' });
  return { kod: r.status, ut: r.stdout, fel: r.stderr };
}
const json = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const aeAv = f => JSON.parse(json(f).__vyraBackup.storage[lib.AE_KEY]);

// ---- 1. listorna följer källan ------------------------------------------------------------------------
test('ACTION_TYPER är exakt de typer action-event.js erbjuder', () => {
  const kod = kalla('action-event.js');
  const start = kod.indexOf('const actionTypes=['), slut = kod.indexOf('\n  ];', start);
  assert.ok(start > 0 && slut > start, 'hittade inte actionTypes i action-event.js');
  const fran = [...kod.slice(start, slut).matchAll(/\['(\w+)',/g)].map(m => m[1]);
  assert.ok(fran.length >= 12, 'läste för få typer ur källan');
  assert.deepEqual([...lib.ACTION_TYPER].sort(), fran.sort());
});

test('TRIGGERS är exakt de triggers action-event.js erbjuder', () => {
  const kod = kalla('action-event.js');
  const m = /const triggerNames=\{([^}]*)\}/.exec(kod);
  assert.ok(m, 'hittade inte triggerNames i action-event.js');
  const fran = [...m[1].matchAll(/(\w+):'/g)].map(x => x[1]);
  assert.deepEqual([...lib.TRIGGERS].sort(), fran.sort());
});

test('scenplaceringarna är de som action-scenes.js använder', () => {
  const m = /const presets = \{([^}]*)\}/.exec(kalla('action-scenes.js'));
  assert.ok(m, 'hittade inte presets i action-scenes.js');
  for (const [namn, v] of Object.entries(lib.PLACERINGAR))
    assert.ok(m[1].includes(`${namn}:[${v.join(',')}]`), `placeringen ${namn} har ändrats i action-scenes.js`);
});

// ---- 2. backupformatet --------------------------------------------------------------------------------
test('ny fil är i backupformat och godkänns av appens och serverns validering', () => {
  const f = nyFil();
  assert.equal(kor(f, 'ny').kod, 0);
  const s = json(f);
  assert.ok(s.__vyraBackup && s.__vyraBackup.schema === 1, 'saknar __vyraBackup');
  assert.ok(!('__vyraCloud' in s), 'molnformatet får aldrig skrivas');
  // state-backup.js validate(): widgets-array där varje widget har id.
  assert.ok(Array.isArray(s.widgets));
  assert.deepEqual(lib.validera(s), []);
});

// Serverns regel läses som TEXT, inte require:as — rotprov får inte köra kod ur ett paket med egna
// beroenden (tests/rotsvitens-beroenden.test.js). CLI:ts gräns och id-regel måste vara samma.
test('CLI:ts widgetgräns och id-regel är serverns validOverlayState', () => {
  const m = /function validOverlayState\(v\)\{([^\n]*)\}/.exec(kalla('server/security.js'));
  assert.ok(m, 'hittade inte validOverlayState i server/security.js');
  assert.match(m[1], /v\.widgets\.length<=500/, 'serverns widgetgräns har ändrats');
  assert.match(m[1], /w\.id\.length<=160/, 'serverns id-längd har ändrats');
  const fyrahundra = Array.from({ length: 500 }, (_, i) => ({ id: 'w' + i, x: 0, y: 0 }));
  assert.deepEqual(lib.validera({ widgets: fyrahundra }), [], '500 widgets ska gå igenom');
  assert.ok(lib.validera({ widgets: [...fyrahundra, { id: 'w500', x: 0, y: 0 }] }).some(p => p.niva === 'fel'), '501 ska avvisas');
  assert.ok(lib.validera({ widgets: [{ id: 'x'.repeat(161), x: 0, y: 0 }] }).some(p => p.niva === 'fel'), 'id över 160 tecken ska avvisas');
});

test('extras-nycklarna är de state-backup.js läser', () => {
  const m = /EXTRA_KEYS=\[([^\]]*)\]/.exec(kalla('state-backup.js'));
  assert.ok(m, 'hittade inte EXTRA_KEYS i state-backup.js');
  assert.ok(m[1].includes(`'${lib.AE_KEY}'`), 'state-backup.js läser inte längre Action/Event-nyckeln');
});

test('en äldre molnformatfil läses och migreras till backupformat vid skrivning', () => {
  const f = nyFil();
  const ae = { actions: [{ id: 'a1', name: 'Gammal', types: ['alert'], scene: { number: 1 } }], events: [] };
  fs.writeFileSync(f, JSON.stringify({ widgets: [], __vyraCloud: { schema: 1, storage: { [lib.AE_KEY]: JSON.stringify(ae) } } }));
  assert.match(kor(f, 'action', 'lista').ut, /Gammal/);
  assert.equal(kor(f, 'action', 'ny', 'Ny').kod, 0);
  const s = json(f);
  assert.ok(!('__vyraCloud' in s));
  assert.deepEqual(aeAv(f).actions.map(a => a.name), ['Gammal', 'Ny']);
});

// ---- 3. widgets, actions, events ----------------------------------------------------------------------
test('widget skapas av fabriken och kan döljas, flyttas och tas bort', () => {
  const f = nyFil(); kor(f, 'ny');
  const r = kor(f, '--json', 'widget', 'lagg-till', 'catalog:topgift:neon', '--x', '50', '--y', '200');
  assert.equal(r.kod, 0, r.fel);
  const w = JSON.parse(r.ut).widget;
  assert.equal(w.type, 'templateTopGift');
  assert.equal(w.createdFrom, 'catalog:topgift:neon');
  assert.equal(w.x, 50);
  kor(f, 'widget', 'dold', w.id);
  assert.equal(json(f).widgets[0].hidden, true);
  kor(f, 'widget', 'visa', w.id);
  assert.ok(!('hidden' in json(f).widgets[0]));
  kor(f, 'widget', 'flytta', w.id, '--x', '5', '--width', '300');
  assert.deepEqual([json(f).widgets[0].x, json(f).widgets[0].width], [5, 300]);
  assert.equal(kor(f, 'widget', 'ta-bort', w.id).kod, 0);
  assert.equal(json(f).widgets.length, 0);
});

test('okänd katalognyckel, okänt id och icke-numeriska värden avvisas', () => {
  const f = nyFil(); kor(f, 'ny');
  assert.equal(kor(f, 'widget', 'lagg-till', 'catalog:finns-inte:x').kod, 1);
  assert.equal(kor(f, 'widget', 'dold', 'saknas').kod, 1);
  assert.equal(kor(f, 'widget', 'lagg-till', 'catalog:topgift:neon', '--x', 'abc').kod, 1);
  assert.equal(json(f).widgets.length, 0, 'en avvisad körning får inte skriva något');
});

test('Action skapas först — ett Event kan inte peka på en Action som saknas', () => {
  const f = nyFil(); kor(f, 'ny');
  const utanAction = kor(f, 'event', 'koppla', '--trigger', 'gift', '--action', 'Finns inte');
  assert.equal(utanAction.kod, 1);
  assert.match(utanAction.fel, /skapa den först/);
  assert.equal(kor(f, 'action', 'ny', 'Tack', '--typ', 'alert,audio', '--scen', '2', '--placering', 'top').kod, 0);
  assert.equal(kor(f, 'event', 'koppla', '--trigger', 'gift', '--villkor', 'Rose', '--action', 'Tack').kod, 0);
  const o = aeAv(f);
  assert.equal(o.events[0].actionId, o.actions[0].id);
  assert.equal(o.events[0].enabled, true);
  assert.deepEqual(o.actions[0].scene, { number: 2, placement: 'top', x: 160, y: 80, width: 760 });
});

test('ogiltig trigger, typ, scen och placering avvisas', () => {
  const f = nyFil(); kor(f, 'ny'); kor(f, 'action', 'ny', 'A');
  assert.equal(kor(f, 'event', 'koppla', '--trigger', 'bogus', '--action', 'A').kod, 1);
  assert.equal(kor(f, 'action', 'ny', 'B', '--typ', 'nonsens').kod, 1);
  assert.equal(kor(f, 'action', 'ny', 'C', '--scen', '11').kod, 1);
  assert.equal(kor(f, 'action', 'ny', 'D', '--placering', 'mitt').kod, 1);
  assert.equal(kor(f, 'action', 'ny', 'A').kod, 1, 'dubbelt Action-namn');
});

test('flera Actions på ett Event: alla eller slump, och actionId skrivs alltid', () => {
  const f = nyFil(); kor(f, 'ny'); kor(f, 'action', 'ny', 'A'); kor(f, 'action', 'ny', 'B');
  kor(f, 'event', 'koppla', '--trigger', 'follow', '--action', 'A,B');
  kor(f, 'event', 'koppla', '--trigger', 'share', '--action', 'A,B', '--slump');
  const [alla, slump] = aeAv(f).events;
  assert.equal(alla.allActionIds.length, 2); assert.ok(alla.actionId);
  assert.equal(slump.randomActionIds.length, 2); assert.ok(slump.actionId);
});

test('id:n är unika även när många Actions skapas samma millisekund', () => {
  const f = nyFil(); kor(f, 'ny');
  for (let i = 0; i < 6; i++) kor(f, 'action', 'ny', 'Akt' + i);
  const ids = aeAv(f).actions.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ---- validering och utdata ----------------------------------------------------------------------------
test('validera: exit 0 på en hel fil, exit 2 på en trasig', () => {
  const f = nyFil(); kor(f, 'ny'); kor(f, 'widget', 'lagg-till', 'catalog:lastx:card');
  assert.equal(kor(f, 'validera').kod, 0);
  const s = json(f); s.widgets.push({ ...s.widgets[0], x: 'abc' });
  fs.writeFileSync(f, JSON.stringify(s));
  const r = kor(f, 'validera');
  assert.equal(r.kod, 2);
  assert.match(r.ut, /dubbelt id/);
});

test('validera hittar ett Event som pekar på en borttagen Action', () => {
  const f = nyFil(); kor(f, 'ny'); kor(f, 'action', 'ny', 'A'); kor(f, 'event', 'koppla', '--trigger', 'follow', '--action', 'A');
  const s = json(f), o = JSON.parse(s.__vyraBackup.storage[lib.AE_KEY]);
  o.actions = []; s.__vyraBackup.storage[lib.AE_KEY] = JSON.stringify(o);
  fs.writeFileSync(f, JSON.stringify(s));
  const r = kor(f, 'validera');
  assert.equal(r.kod, 2);
  assert.match(r.ut, /finns inte/);
});

test('--json ger giltig JSON även när flaggan står före kommandot', () => {
  const f = nyFil(); kor(f, 'ny');
  const r = kor(f, '--json', 'scen', 'lista');
  assert.equal(r.kod, 0);
  assert.equal(JSON.parse(r.ut).ok, true);
});

test('ny skriver inte över en befintlig fil utan --force', () => {
  const f = nyFil(); kor(f, 'ny'); kor(f, 'action', 'ny', 'A');
  assert.equal(kor(f, 'ny').kod, 1);
  assert.equal(aeAv(f).actions.length, 1, 'filen skrevs över');
  assert.equal(kor(f, 'ny', '--force').kod, 0);
});

test('katalog familjer och nycklar kommer från fabriken och katalogkartan', () => {
  const f = nyFil();
  const fam = JSON.parse(kor(f, '--json', 'katalog', 'familjer').ut);
  assert.ok(fam.antal >= 30 && fam.familjer.includes('topgift'));
  const nyck = JSON.parse(kor(f, '--json', 'katalog', 'nycklar', 'giftjar').ut);
  assert.ok(nyck.antal > 0 && nyck.nycklar.every(k => k.startsWith('catalog:giftjar')));
});

// ---- flaggtolkning: tal ----------------------------------------------------------------------------------
// Granskningsfynd: `--x -50` lästes som en ensam flagga (true), Number(true) är 1, och x skrevs tyst som 1.
test('negativa tal i --x/--y/--width skrivs som de är, med både "--x -50" och "--x=-50"', () => {
  const f = nyFil(); kor(f, 'ny');
  const a = kor(f, '--json', 'widget', 'lagg-till', 'catalog:topgift:neon', '--x', '-50', '--y', '-.5', '--width', '-3');
  assert.equal(a.kod, 0, a.fel);
  const w = JSON.parse(a.ut).widget;
  assert.deepEqual([w.x, w.y, w.width], [-50, -0.5, -3]);
  const b = kor(f, 'widget', 'flytta', w.id, '--x=-120');
  assert.equal(b.kod, 0, b.fel);
  assert.equal(json(f).widgets[0].x, -120);
});

test('en talflagga utan värde eller med text avvisas och skriver inget', () => {
  const f = nyFil(); kor(f, 'ny');
  for (const args of [['--x'], ['--x', '--dold'], ['--x='], ['--y', 'abc'], ['--width', 'Infinity']]) {
    const r = kor(f, 'widget', 'lagg-till', 'catalog:topgift:neon', ...args);
    assert.equal(r.kod, 1, `${args.join(' ')} skulle avvisas`);
    assert.match(r.fel, /måste vara ett tal/);
  }
  assert.equal(json(f).widgets.length, 0, 'en avvisad körning får inte skriva något');
});

test('--varaktighet och --scen: saknat värde, negativt och noll avvisas; ett tal skrivs', () => {
  const f = nyFil(); kor(f, 'ny');
  assert.equal(kor(f, 'action', 'ny', 'A', '--varaktighet', '-5').kod, 1);
  assert.equal(kor(f, 'action', 'ny', 'B', '--varaktighet', '0').kod, 1);
  assert.equal(kor(f, 'action', 'ny', 'C', '--varaktighet').kod, 1);
  assert.equal(kor(f, 'action', 'ny', 'D', '--scen').kod, 1, '--scen utan värde blev tidigare tyst scen 1');
  assert.equal(kor(f, 'action', 'ny', 'E', '--scen', '-3').kod, 1);
  assert.equal(kor(f, 'action', 'ny', 'F', '--varaktighet', '7.5').kod, 0);
  assert.deepEqual(aeAv(f).actions.map(a => [a.name, a.duration]), [['F', 7.5]]);
});

test('en annan flagga efter en flagga läses inte som dess värde', () => {
  const f = nyFil(); kor(f, 'ny');
  const r = kor(f, '--json', 'widget', 'lagg-till', 'catalog:topgift:neon', '--dold', '--x', '30');
  assert.equal(r.kod, 0, r.fel);
  const w = JSON.parse(r.ut).widget;
  assert.equal(w.x, 30);
  assert.equal(w.hidden, true);
});

// ---- katalog nycklar ----------------------------------------------------------------------------------------
// Granskningsfynd: kartan nämner också nycklar i löptext; 15 av 172 avvisades av fabriken men listades ändå.
test('varje nyckel som "katalog nycklar" listar går att skapa med fabriken', () => {
  const lista = JSON.parse(kor(nyFil(), '--json', 'katalog', 'nycklar').ut);
  assert.ok(lista.antal >= 100, 'för få nycklar — provet skulle annars vara tomt');
  assert.equal(typeof lista.avvisade, 'number');

  const gammal = global.window;
  global.window = { crypto: require('node:crypto').webcrypto };
  try {
    require(path.join(ROT, 'widget-factory.js'));
    const fabrik = global.window.VyraWidgets;
    const fel = lista.nycklar.filter(k => { try { fabrik.create(k, { placement: 'standalone' }); return false; } catch { return true; } });
    assert.deepEqual(fel, [], 'nycklar som listas men som fabriken avvisar');
  } finally { global.window = gammal; }
});

test('listade och avvisade nycklar tillsammans är alla unika nycklar i katalogkartan', () => {
  const lista = JSON.parse(kor(nyFil(), '--json', 'katalog', 'nycklar').ut);
  const unika = new Set(kalla('docs/katalogkarta.md').match(/catalog:[a-z0-9:_.-]+/g));
  assert.equal(lista.antal + lista.avvisade, unika.size, 'en nyckel försvann eller dök upp utan att räknas');
});

test('filtret på "katalog nycklar" ger bara giltiga nycklar, och avvisade nämns i texten', () => {
  const f = nyFil();
  const r = kor(f, 'katalog', 'nycklar', 'glovesnipe');
  assert.equal(r.kod, 0, r.fel);
  const j = JSON.parse(kor(f, '--json', 'katalog', 'nycklar', 'glovesnipe').ut);
  assert.ok(j.nycklar.every(k => k.includes('glovesnipe')));
  const alla = kor(f, 'katalog', 'nycklar').ut;
  if (JSON.parse(kor(f, '--json', 'katalog', 'nycklar').ut).avvisade > 0) assert.match(alla, /avvisas av fabriken/);
});

// ---- granskningsfynd 3–6 ---------------------------------------------------------------------------------
const stackspar = s => /\n\s+at .+\(.+:\d+:\d+\)|TypeError|ENOENT.*\n\s+at /.test(s);

test('en fil utan widgets-lista avvisas med ett felmeddelande, aldrig ett stackspår', () => {
  for (const [namn, innehall] of [['tomt objekt', '{}'], ['null', 'null'], ['lista', '[]'], ['tal', '5']]) {
    const f = nyFil(); fs.writeFileSync(f, innehall);
    for (const args of [['widget', 'lagg-till', 'catalog:topgift:neon'], ['widget', 'lista'], ['action', 'ny', 'A'], ['scen', 'lista']]) {
      const r = kor(f, ...args);
      assert.equal(r.kod, 1, `${namn}: ${args.join(' ')} skulle avvisas`);
      assert.match(r.fel, /ingen VYRA-state/);
      assert.ok(!stackspar(r.fel), `${namn}: stackspår i utdata:\n${r.fel}`);
    }
    assert.equal(fs.readFileSync(f, 'utf8'), innehall, `${namn}: en avvisad körning får inte skriva något`);
  }
});

test('validera rapporterar en trasig form med exit 2 i stället för att avvisas eller krascha', () => {
  for (const innehall of ['{}', 'null']) {
    const f = nyFil(); fs.writeFileSync(f, innehall);
    const r = kor(f, 'validera');
    assert.equal(r.kod, 2, `validera på ${innehall}`);
    assert.match(r.ut, /Saknar widgets-lista/);
    assert.ok(!stackspar(r.fel));
  }
  assert.deepEqual(lib.validera(null), [{ niva: 'fel', text: 'Saknar widgets-lista' }]);
});

test('en skrivning som misslyckas ger ett felmeddelande, även som --json, och lämnar ingen tempfil', () => {
  const dir = path.join(tmp, 'finns-inte');
  const f = path.join(dir, 's.json');
  const r = kor(f, '--json', 'ny');
  assert.equal(r.kod, 1);
  assert.ok(!stackspar(r.fel), r.fel);
  const j = JSON.parse(r.fel);
  assert.equal(j.ok, false);
  assert.match(j.fel, /Kunde inte skriva/);
  assert.ok(!fs.existsSync(dir), 'CLI:t skapade en mapp som ingen bad om');
});

test('--flagga=värde delas vid första "=" så värdet får innehålla fler', () => {
  const f = nyFil(); kor(f, 'ny'); kor(f, 'action', 'ny', 'A');
  const r = kor(f, '--json', 'event', 'koppla', '--trigger=chatCommand', '--villkor=a=b=c', '--action=A');
  assert.equal(r.kod, 0, r.fel);
  assert.equal(JSON.parse(r.ut).event.condition, 'a=b=c');
  assert.equal(aeAv(f).events[0].trigger, 'chatCommand');
});

test('en Action vars namn innehåller komma kan kopplas, och en upprepad Action räknas en gång', () => {
  const f = nyFil(); kor(f, 'ny');
  kor(f, 'action', 'ny', 'Tack, Rose'); kor(f, 'action', 'ny', 'A'); kor(f, 'action', 'ny', 'B');

  const komma = JSON.parse(kor(f, '--json', 'event', 'koppla', '--trigger', 'gift', '--action', 'Tack, Rose').ut);
  const o1 = aeAv(f);
  assert.equal(komma.event.actionId, o1.actions.find(a => a.name === 'Tack, Rose').id);
  assert.ok(!('allActionIds' in komma.event), 'namnet delades vid kommat');

  const dubbel = JSON.parse(kor(f, '--json', 'event', 'koppla', '--trigger', 'follow', '--action', 'A,A').ut);
  assert.equal(dubbel.ignorerade, 1);
  assert.ok(dubbel.event.actionId && !('allActionIds' in dubbel.event), 'A,A ska bli ett Event med en Action');

  const blandat = JSON.parse(kor(f, '--json', 'event', 'koppla', '--trigger', 'share', '--action', 'A,B,A').ut);
  assert.equal(blandat.ignorerade, 1);
  assert.equal(blandat.event.allActionIds.length, 2);

  const text = kor(f, 'event', 'koppla', '--trigger', 'member', '--action', 'A,A').ut;
  assert.match(text, /ignorerades/);
});

test('fabriken kan hämtas flera gånger i samma process', () => {
  const gammal = global.window;
  try {
    const a = lib.laddaFabrik(), b = lib.laddaFabrik();
    assert.equal(a, b, 'samma fabrik ska komma tillbaka');
    assert.equal(typeof b.create, 'function');
    assert.equal(b.create('catalog:topgift:neon', { placement: 'standalone' }).type, 'templateTopGift');
  } finally { global.window = gammal; }
});
