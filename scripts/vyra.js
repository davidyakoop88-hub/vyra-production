#!/usr/bin/env node
'use strict';
// VYRA-CLI — skikt 1–2: läsa katalogen och redigera en LOKAL state-fil. Rör aldrig molnet och
// aldrig en körande sändning; ingen inloggning, ingen token. Domän: widgets (bygger på widget-factory.js).
//
// Widgets skapas av repots egen fabrik (widget-factory.js), aldrig för hand. Formerna för Action och
// Event är avlästa ur action-event.js / action-scenes.js. Filformatet är samma som molnlayouten:
//   { widgets: [...], __vyraBackup: { schema: 1, createdAt, storage: { 'vyra-action-event-v2': '<json-sträng>' } } }
// Det är appens BACKUPformat (state-backup.js), det som "Importera JSON" läser. Molnformatet (__vyraCloud,
// cloud-sync.js) läses fortfarande in men skrivs aldrig: appens filimport släpper annars tyst Actions/Events.
//
//   node scripts/vyra.js hjalp
//   node scripts/vyra.js -p min.json ny
//
// Importera filen i Studio via Inställningar → Importera JSON (state-backup.js).
// Listorna ACTION_TYPER och TRIGGERS vaktas mot action-event.js av tests/vyra-cli.test.js.

const fs = require('node:fs');
const path = require('node:path');

const ROT = path.resolve(process.env.VYRA_ROOT || path.join(__dirname, '..'));
const AE_KEY = 'vyra-action-event-v2';

// ---- listor avlästa ur källan (action-event.js:35-52, :102; action-scenes.js:43) ----------------------
const ACTION_TYPER = ['animation', 'picture', 'audio', 'video', 'alert', 'tts', 'chat', 'obsScene', 'obsSource',
  'webhook', 'overlay', 'spotify', 'goal', 'timer', 'giftVideo'];
const TRIGGERS = ['gift', 'giftCombo', 'follow', 'member', 'likes', 'share', 'level', 'battle', 'chat', 'join',
  'superfan', 'firstActivity', 'chatCommand', 'giftCoins', 'subscriberEmote', 'fanSticker', 'shopPurchase', 'knapp'];
const PLACERINGAR = { top: [160, 80, 760], center: [160, 690, 760], bottom: [160, 1450, 760], fullscreen: [0, 0, 1080] };
const MAX_WIDGETS = 500; // server/security.js validOverlayState

// ---- fabriken -------------------------------------------------------------------------------------------
function laddaFabrik() {
  const fil = path.join(ROT, 'widget-factory.js');
  if (!fs.existsSync(fil)) fel(`Hittar inte ${fil}. Sätt VYRA_ROOT till repots rot.`);
  const w = { crypto: require('node:crypto').webcrypto };
  global.window = w;
  require(fil);
  if (!w.VyraWidgets) fel('widget-factory.js gav ingen VyraWidgets');
  return w.VyraWidgets;
}

// ---- hjälpare -------------------------------------------------------------------------------------------
let JSON_UT = false;
function fel(msg, kod = 1) { process.stderr.write((JSON_UT ? JSON.stringify({ ok: false, fel: msg }) : 'Fel: ' + msg) + '\n'); process.exit(kod); }
function ut(data, text) { process.stdout.write(JSON_UT ? JSON.stringify({ ok: true, ...data }, null, 2) + '\n' : text + '\n'); }

const BOOL = new Set(['json', 'dold', 'force', 'slump', 'help']);
function tolka(argv) {
  const pos = [], flaggor = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-p') flaggor.p = argv[++i];
    else if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flaggor[k] = v;
      else if (BOOL.has(k)) flaggor[k] = true; // rena flaggor tar aldrig nästa ord som värde
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('-')) flaggor[k] = argv[++i];
      else flaggor[k] = true;
    } else pos.push(a);
  }
  return { pos, f: flaggor };
}

const tom = () => ({ widgets: [], __vyraBackup: { schema: 1, createdAt: Date.now(), storage: {} } });
function las(fil) {
  if (!fs.existsSync(fil)) fel(`Filen finns inte: ${fil} (skapa den med "ny")`);
  try { return JSON.parse(fs.readFileSync(fil, 'utf8')); } catch (e) { return fel(`Ogiltig JSON i ${fil}: ${e.message}`); }
}
// Lagringen (extras) bor i __vyraBackup.storage. En äldre fil med __vyraCloud läses och flyttas vid nästa skrivning.
const lagring = state => state.__vyraBackup?.storage || state.__vyraCloud?.storage || {};
function skriv(fil, state) {
  const storage = { ...lagring(state) };
  delete state.__vyraCloud;
  state.__vyraBackup = { schema: 1, createdAt: Date.now(), storage };
  const tmp = fil + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, fil); // atomiskt: en avbruten skrivning lämnar aldrig en halv fil
}
// Läsarna i appen normaliserar till arrayer (tests/action-state-form.test.js). Gör samma.
function ae(state) {
  let o = {};
  try { o = JSON.parse(lagring(state)[AE_KEY] || '{}'); } catch { o = {}; }
  return { ...o, actions: Array.isArray(o.actions) ? o.actions : [], events: Array.isArray(o.events) ? o.events : [] };
}
function skrivAe(state, o) {
  state.__vyraBackup = { schema: 1, createdAt: Date.now(), storage: { ...lagring(state) } };
  delete state.__vyraCloud;
  state.__vyraBackup.storage[AE_KEY] = JSON.stringify(o);
}
let senastTid = 0;
function nyttId(prefix, finns) { // appen använder prefix + Date.now(); här garanteras unikhet
  let t = Math.max(Date.now(), senastTid + 1);
  while (finns.has(prefix + t)) t++;
  senastTid = t;
  return prefix + t;
}
const csv = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);

// ---- validering (appens regler + serverns) ----------------------------------------------------------------
function validera(state) {
  const p = [], o = ae(state);
  if (!state || !Array.isArray(state.widgets)) return [{ niva: 'fel', text: 'Saknar widgets-lista' }];
  if (state.widgets.length > MAX_WIDGETS) p.push({ niva: 'fel', text: `${state.widgets.length} widgets, max är ${MAX_WIDGETS}` });
  const ids = new Set();
  state.widgets.forEach((w, i) => {
    if (!w || typeof w.id !== 'string' || !w.id || w.id.length > 160) p.push({ niva: 'fel', text: `widget ${i}: ogiltigt id` });
    else if (ids.has(w.id)) p.push({ niva: 'fel', text: `widget ${i}: dubbelt id ${w.id}` });
    else ids.add(w.id);
    if (w && !Number.isFinite(Number(w.x)) || w && !Number.isFinite(Number(w.y))) p.push({ niva: 'fel', text: `widget ${w?.id}: x/y måste vara tal` });
  });
  const aIds = new Set();
  o.actions.forEach(a => {
    if (aIds.has(a.id)) p.push({ niva: 'fel', text: `action ${a.id}: dubbelt id` }); aIds.add(a.id);
    if (!a.name) p.push({ niva: 'fel', text: `action ${a.id}: saknar namn` });
    const typer = Array.isArray(a.types) ? a.types : [];
    if (!typer.length) p.push({ niva: 'varning', text: `action "${a.name}": inga typer — gör ingenting` });
    typer.filter(t => !ACTION_TYPER.includes(t)).forEach(t => p.push({ niva: 'fel', text: `action "${a.name}": okänd typ "${t}"` }));
    const n = a.scene?.number;
    if (n != null && !(Number.isInteger(n) && n >= 1 && n <= 10)) p.push({ niva: 'fel', text: `action "${a.name}": scen ${n} utanför 1–10` });
  });
  const eIds = new Set();
  o.events.forEach(e => {
    if (eIds.has(e.id)) p.push({ niva: 'fel', text: `event ${e.id}: dubbelt id` }); eIds.add(e.id);
    if (!TRIGGERS.includes(e.trigger)) p.push({ niva: 'fel', text: `event ${e.id}: okänd trigger "${e.trigger}"` });
    const refs = [e.actionId, ...(e.allActionIds || []), ...(e.randomActionIds || [])].filter(Boolean);
    if (!refs.length) p.push({ niva: 'fel', text: `event ${e.id}: pekar på ingen Action` });
    refs.filter(r => !aIds.has(r)).forEach(r => p.push({ niva: 'fel', text: `event ${e.id}: Action ${r} finns inte` }));
  });
  return p;
}

// ---- kommandon ------------------------------------------------------------------------------------------
const K = {};

K['ny'] = ({ f }, fil) => {
  if (fs.existsSync(fil) && !f.force) fel(`${fil} finns redan (använd --force för att skriva över)`);
  skriv(fil, tom());
  ut({ fil }, `Skapade ${fil}`);
};

K['katalog familjer'] = () => {
  const fam = laddaFabrik().families();
  ut({ antal: fam.length, familjer: fam }, `${fam.length} familjer:\n  ` + fam.join('\n  '));
};
K['katalog nycklar'] = ({ pos }) => {
  const karta = path.join(ROT, 'docs', 'katalogkarta.md');
  if (!fs.existsSync(karta)) fel('docs/katalogkarta.md saknas');
  const filter = (pos[2] || '').toLowerCase();
  const alla = [...new Set([...fs.readFileSync(karta, 'utf8').matchAll(/catalog:[a-z0-9:_.-]+/g)].map(m => m[0]))].sort();
  const val = filter ? alla.filter(k => k.includes(filter)) : alla;
  ut({ antal: val.length, nycklar: val }, `${val.length} nycklar${filter ? ` som matchar "${filter}"` : ''}:\n  ` + val.join('\n  '));
};

K['widget lagg-till'] = ({ pos, f }, fil) => {
  const nyckel = pos[2];
  if (!nyckel) fel('Ange en katalognyckel, t.ex. catalog:topgift:neon (se "katalog nycklar")');
  const state = las(fil);
  if (state.widgets.length >= MAX_WIDGETS) fel(`Max ${MAX_WIDGETS} widgets`);
  let w;
  try { w = laddaFabrik().create(nyckel, { placement: 'standalone' }); } catch (e) { return fel(e.message); }
  for (const k of ['x', 'y', 'width']) if (f[k] !== undefined) {
    const n = Number(f[k]); if (!Number.isFinite(n)) fel(`--${k} måste vara ett tal`); w[k] = n;
  }
  if (f.dold) w.hidden = true;
  state.widgets.push(w);
  skriv(fil, state);
  ut({ widget: w }, `La till ${w.id} (${w.type})${w.hidden ? ' [dold]' : ''} på x=${w.x} y=${w.y} bredd=${w.width}`);
};
const hitta = (state, id) => state.widgets.find(w => w.id === id) || fel(`Ingen widget med id ${id}`);
K['widget lista'] = (_a, fil) => {
  const state = las(fil);
  const rader = state.widgets.map(w => ({ id: w.id, type: w.type, x: w.x, y: w.y, width: w.width, dold: !!w.hidden }));
  ut({ antal: rader.length, widgets: rader }, rader.length
    ? rader.map(r => `${r.dold ? '·' : '●'} ${r.id}  ${r.type}  (${r.x},${r.y}) ${r.width}px${r.dold ? '  dold' : ''}`).join('\n')
    : '(inga widgets)');
};
K['widget dold'] = ({ pos }, fil) => { const s = las(fil), w = hitta(s, pos[2]); w.hidden = true; skriv(fil, s); ut({ id: w.id, dold: true }, `${w.id} är dold (finns kvar i lagret, ritas inte i overlay)`); };
K['widget visa'] = ({ pos }, fil) => { const s = las(fil), w = hitta(s, pos[2]); delete w.hidden; skriv(fil, s); ut({ id: w.id, dold: false }, `${w.id} är synlig`); };
K['widget flytta'] = ({ pos, f }, fil) => {
  const s = las(fil), w = hitta(s, pos[2]);
  for (const k of ['x', 'y', 'width']) if (f[k] !== undefined) { const n = Number(f[k]); if (!Number.isFinite(n)) fel(`--${k} måste vara ett tal`); w[k] = n; }
  skriv(fil, s); ut({ id: w.id, x: w.x, y: w.y, width: w.width }, `${w.id} → (${w.x},${w.y}) ${w.width}px`);
};
K['widget ta-bort'] = ({ pos }, fil) => {
  const s = las(fil), n0 = s.widgets.length; hitta(s, pos[2]);
  s.widgets = s.widgets.filter(w => w.id !== pos[2]); skriv(fil, s);
  ut({ kvar: s.widgets.length, borttagna: n0 - s.widgets.length }, `Tog bort ${pos[2]} (${s.widgets.length} kvar)`);
};

K['action ny'] = ({ pos, f }, fil) => {
  const namn = pos[2];
  if (!namn) fel('Ange ett namn: action ny "Tack för rosen" --typ alert,audio');
  const typer = csv(f.typ || 'alert');
  const okanda = typer.filter(t => !ACTION_TYPER.includes(t));
  if (okanda.length) fel(`Okänd typ: ${okanda.join(', ')}. Giltiga: ${ACTION_TYPER.join(', ')}`);
  const nr = f.scen === undefined ? 1 : Number(f.scen);
  if (!(Number.isInteger(nr) && nr >= 1 && nr <= 10)) fel('--scen måste vara ett heltal 1–10');
  const plats = f.placering || 'bottom';
  if (!PLACERINGAR[plats]) fel(`--placering måste vara ${Object.keys(PLACERINGAR).join(' | ')}`);
  const s = las(fil), o = ae(s);
  if (o.actions.some(a => a.name === namn)) fel(`Det finns redan en Action som heter "${namn}"`);
  const [x, y, width] = PLACERINGAR[plats];
  const a = {
    id: nyttId('a', new Set(o.actions.map(a => a.id))), name: namn, types: typer, config: { addPointsAmount: 10, removePointsAmount: 10 },
    duration: Number(f.varaktighet) || 10, cooldown: 0, userCooldown: 0, volume: 100, fade: false, repeatCombo: false, skipOnNext: false, prioritet: '',
    scene: { number: nr, placement: plats, x, y, width },
  };
  o.actions.push(a); skrivAe(s, o); skriv(fil, s);
  ut({ action: a }, `Action ${a.id} "${namn}" [${typer.join('+')}] → scen ${nr}, ${plats}`);
};
K['action lista'] = (_a, fil) => {
  const o = ae(las(fil));
  ut({ antal: o.actions.length, actions: o.actions }, o.actions.length
    ? o.actions.map(a => `${a.id}  "${a.name}"  [${(a.types || []).join('+')}]  scen ${a.scene?.number ?? '-'}`).join('\n') : '(inga actions)');
};

K['event koppla'] = ({ f }, fil) => {
  const trigger = f.trigger;
  if (!TRIGGERS.includes(trigger)) fel(`--trigger måste vara en av: ${TRIGGERS.join(', ')}`);
  const val = csv(f.action);
  if (!val.length) fel('--action krävs (namn eller id, komma-separerat). Action skapas först.');
  const s = las(fil), o = ae(s);
  const ids = val.map(v => (o.actions.find(a => a.id === v) || o.actions.find(a => a.name === v) || fel(`Action "${v}" finns inte — skapa den först med "action ny"`)).id);
  const e = { id: nyttId('e', new Set(o.events.map(e => e.id))), enabled: true, trigger, condition: f.villkor === true ? '' : String(f.villkor || '') };
  if (ids.length === 1) e.actionId = ids[0];
  else if (f.slump) e.randomActionIds = ids;
  else e.allActionIds = ids;
  if (!e.actionId) e.actionId = ids[0]; // appen skriver alltid actionId (action-event.js:665)
  o.events.push(e); skrivAe(s, o); skriv(fil, s);
  ut({ event: e }, `Event ${e.id}: ${trigger}${e.condition ? ' = ' + e.condition : ''} → ${ids.join(', ')}`);
};

K['scen lista'] = (_a, fil) => {
  const s = las(fil), o = ae(s), rader = [];
  for (let n = 1; n <= 10; n++) {
    const aks = o.actions.filter(a => (a.scene?.number ?? 1) === n);
    if (!aks.length) continue;
    const ids = new Set(aks.map(a => a.id));
    const ev = o.events.filter(e => [e.actionId, ...(e.allActionIds || []), ...(e.randomActionIds || [])].some(i => ids.has(i)));
    rader.push({ scen: n, actions: aks.map(a => a.name), events: ev.map(e => `${e.trigger}${e.condition ? '=' + e.condition : ''}`) });
  }
  ut({ scener: rader }, rader.length
    ? rader.map(r => `Scen ${r.scen}: ${r.actions.length} action(s) [${r.actions.join(', ')}]  events: ${r.events.join('; ') || '—'}`).join('\n')
    : '(inga scener används)');
};

K['validera'] = (_a, fil) => {
  const s = las(fil), p = validera(s), fe = p.filter(x => x.niva === 'fel');
  const text = (fe.length ? `✗ ${fe.length} fel` : '✓ Inga fel') + (p.length - fe.length ? `, ${p.length - fe.length} varning(ar)` : '') +
    (p.length ? '\n' + p.map(x => `  ${x.niva === 'fel' ? '✗' : '!'} ${x.text}`).join('\n') : '');
  process.stdout.write(JSON_UT ? JSON.stringify({ ok: !fe.length, problem: p }, null, 2) + '\n' : text + '\n');
  process.exit(fe.length ? 2 : 0);
};

const HJALP = `VYRA-CLI — redigerar en lokal state-fil, rör aldrig molnet.

  ny [--force]                                   skapa tom state-fil
  katalog familjer | katalog nycklar [filter]    vad fabriken/katalogen kan bygga
  widget lagg-till <nyckel> [--x --y --width --dold]
  widget lista | dold <id> | visa <id> | flytta <id> --x --y --width | ta-bort <id>
  action ny <namn> [--typ alert,audio] [--scen 1-10] [--placering top|center|bottom|fullscreen] [--varaktighet 10]
  action lista
  event koppla --trigger gift --villkor Rose --action "<namn|id>[,…]" [--slump]
  scen lista
  validera                                       exit 2 vid fel

Flaggor:  -p <fil> (standard ./vyra-state.json)   --json   VYRA_ROOT=<repo>`;

function main() {
  const { pos, f } = tolka(process.argv.slice(2));
  JSON_UT = !!f.json;
  if (!pos.length || f.help || pos[0] === 'hjalp') return process.stdout.write(HJALP + '\n');
  const fil = path.resolve(f.p || 'vyra-state.json');
  const nyckel = [pos[0], pos[1]].join(' ');
  const fn = K[nyckel] || K[pos[0]];
  if (!fn) fel(`Okänt kommando "${pos.slice(0, 2).join(' ')}". Kör "hjalp".`);
  fn({ pos, f }, fil);
}
if (require.main === module) main();
module.exports = { ACTION_TYPER, TRIGGERS, PLACERINGAR, validera, AE_KEY };
