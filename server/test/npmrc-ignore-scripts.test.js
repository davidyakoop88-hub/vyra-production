'use strict';
// TTS CHAT TYSTNADE 2026-10-21: Microsoft flyttade Read Aloud-tjänsten, och msedge-tts 2.0.7 fick 403 på
// den gamla adressen ("Edge TTS WebSocket error: Unexpected server response: 403"). 2.1.0 når den nya
// (api.msedgeservices.com) — men bär preinstall "npx only-allow pnpm", som avbryter `npm ci` när npm
// kör skriptet. Därför ignore-scripts i server/.npmrc, och filen måste följa med in i Docker-bygget,
// annars installerar Railway utan den och bygget faller.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const SERVER = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(SERVER, f), 'utf8');

test('server/.npmrc stänger av beroendenas installationsskript', () => {
  assert.match(las('.npmrc'), /^ignore-scripts=true$/m);
});

test('Docker-bygget kopierar .npmrc före npm ci', () => {
  const docker = las('Dockerfile');
  const kopia = docker.indexOf('COPY package.json package-lock.json .npmrc ./');
  const ci = docker.indexOf('RUN npm ci');
  assert.ok(kopia > 0 && ci > kopia, '.npmrc måste kopieras in före npm ci');
});

test('msedge-tts är minst 2.1.0 (den nya adressen hos Microsoft)', () => {
  const v = require(path.join(SERVER, 'package-lock.json')).packages['node_modules/msedge-tts'].version;
  const [maj, min] = v.split('.').map(Number);
  assert.ok(maj > 2 || (maj === 2 && min >= 1), 'msedge-tts ' + v);
});

test('inget annat serverberoende behöver ett installationsskript', () => {
  const lock = require(path.join(SERVER, 'package-lock.json'));
  const med = Object.entries(lock.packages).filter(([, p]) => p.hasInstallScript).map(([k]) => k);
  assert.deepEqual(med, ['node_modules/msedge-tts'], 'ett nytt beroende med installationsskript: kontrollera att det klarar sig utan');
});
