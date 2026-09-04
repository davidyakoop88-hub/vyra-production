#!/usr/bin/env node
'use strict';
// SPELAR UPP EN INSPELNING GENOM DEN VERKLIGA BRYGGAN. Se spela-upp-preload.js för hur och varför.
//
//   node tiktok-bridge/spela-upp.js <fil.jsonl> [--fart 20] [--ankare 7276…]
//
// --fart      snabbspolning. 1 = verklig tid. Glove Snipe fördröjer ~141 s, så x20 gör den
//             observerbar på sju sekunder i stället för två och en halv minut.
// --ankare    ankar-id, om det inte går att härleda ur filen.
//
// Bryggan postar till VYRA_SERVER_URL (default http://127.0.0.1:4173). Kör den lokala servern
// först, annars går händelserna ingenstans — uppspelningen blir tyst utan att säga varför.
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const argv = process.argv.slice(2);
const fil = argv.find(a => !a.startsWith('--'));
const flagga = (namn, standard) => {
  const i = argv.indexOf('--' + namn);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : standard;
};

if (!fil) {
  console.error('Ange en inspelning:\n  node tiktok-bridge/spela-upp.js <fil.jsonl> [--fart 20] [--ankare <id>]');
  process.exit(2);
}
const abs = path.resolve(fil);
if (!fs.existsSync(abs)) { console.error('Filen finns inte: ' + abs); process.exit(2) }

// SERVERN KOLLAS FORE START, inte per handelse.
//
// Utan den har kontrollen skriver bryggan EN rad per event — 2246 rader "Kunde inte na
// VYRA-servern" som dranker bade boost-raden och MVP-raden, alltsa precis det uppspelningen
// finns for att visa. Ett verktyg vars utskrift doljer sitt eget resultat ar inte klart.
async function kollaServern(url) {
  try {
    const r = await fetch(url + '/api/events', { method: 'GET' });
    return r.ok || r.status === 404 || r.status === 405;
  } catch { return false }
}

const HAR = __dirname;
const SERVER = process.env.VYRA_SERVER_URL || 'http://127.0.0.1:4173';

(async () => {
if (!(await kollaServern(SERVER))) {
  console.error(`Den lokala servern svarar inte pa ${SERVER}.`);
  console.error('Handelserna skulle ga ingenstans och widgetarna star stilla — starta');
  console.error('servern forst (STARTA-HEMSIDAN.cmd eller server.ps1), eller satt');
  console.error('VYRA_SERVER_URL om den lyssnar nagon annanstans.');
  console.error('');
  console.error('Vill du kora anda — for att bara se bryggans loggrader — satt');
  console.error('VYRA_UPPSPEL_UTAN_SERVER=1.');
  if (process.env.VYRA_UPPSPEL_UTAN_SERVER !== '1') process.exit(3);
  console.error('Fortsatter utan server.');
}

const barn = cp.spawn(process.execPath,
  // Bryggan vill ha anvandarnamnet som ARGUMENT — utan det skriver den sin usage och avslutar.
  ['--require', path.join(HAR, 'spela-upp-preload.js'), path.join(HAR, 'bridge.js'),
   flagga('anvandare', process.env.TIKTOK_USER || 'uppspelning')],
  {
    cwd: HAR,
    stdio: 'inherit',
    env: {
      ...process.env,
      VYRA_UPPSPEL_FIL: abs,
      VYRA_UPPSPEL_FART: flagga('fart', '1'),
      VYRA_UPPSPEL_ANKARE: flagga('ankare', ''),
      // Inspelaren far INTE vara pa: en uppspelning som spelar in sig sjalv fyller disken med en
      // kopia av det den just laste, och nasta analys kan inte skilja original fran eko.
      VYRA_INSPELNING: '0',
      TIKTOK_USER: process.env.TIKTOK_USER || 'uppspelning',
    },
  });

barn.on('exit', kod => process.exit(kod === null ? 1 : kod));
process.on('SIGINT', () => barn.kill('SIGINT'));
})();
