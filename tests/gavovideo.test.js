'use strict';
// gavovideo.js packar upp TikToks gåvozip och läser var färg och alfa ligger i videon. Formen är
// uppmätt 2026-10-30 (se filhuvudet i gavovideo.js) — de här proven låser den formen, utan att
// checka in TikToks egen video: zip-filen byggs här med samma två filer och samma komprimering.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), zlib = require('zlib');
const { lasZip, lasKonfig } = require(path.join(__dirname, '..', 'gavovideo.js'));

// Exakt config.json ur gåva 5660, h264-varianten.
const UPPMATT = '{"portrait":{"videoW":1440,"videoH":1280,"h":1280,"w":720,"align":8,"aFrame":[720,0,720,1280],"rgbFrame":[0,0,720,1280],"v":1,"path":"output.mp4","f":90,"has_audio":0}}';

function byggZip(filer, metod) {
  const lokala = [], katalog = [];
  let offset = 0;
  for (const [namn, innehall] of filer) {
    const n = Buffer.from(namn), data = metod === 8 ? zlib.deflateRawSync(innehall) : innehall;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(metod, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(innehall.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(metod, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(innehall.length, 24); ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(offset, 42);
    lokala.push(lh, n, data); katalog.push(ch, n);
    offset += 30 + n.length + data.length;
  }
  const kat = Buffer.concat(katalog), slut = Buffer.alloc(22);
  slut.writeUInt32LE(0x06054b50, 0); slut.writeUInt16LE(filer.length, 8); slut.writeUInt16LE(filer.length, 10);
  slut.writeUInt32LE(kat.length, 12); slut.writeUInt32LE(offset, 16);
  return Buffer.concat([...lokala, kat, slut]);
}
const inflate = async d => new Uint8Array(zlib.inflateRawSync(d));
const VIDEO = Buffer.from('falsk mp4 med tillräckligt mycket innehåll för att deflate ska göra något'.repeat(20));

test('packar upp TikToks två filer med deflate, som de kommer', async () => {
  const filer = await lasZip(byggZip([['output.mp4', VIDEO], ['config.json', Buffer.from(UPPMATT)]], 8), inflate);
  assert.deepEqual(Object.keys(filer).sort(), ['config.json', 'output.mp4']);
  assert.equal(Buffer.from(filer['output.mp4']).toString(), VIDEO.toString());
  assert.equal(Buffer.from(filer['config.json']).toString(), UPPMATT);
});

test('packar upp lagrade filer utan att anropa inflate', async () => {
  const filer = await lasZip(byggZip([['config.json', Buffer.from(UPPMATT)]], 0), () => { throw new Error('ska inte anropas'); });
  assert.equal(Buffer.from(filer['config.json']).toString(), UPPMATT);
});

test('vägrar en fil som inte är en zip i stället för att ge tomt', async () => {
  await assert.rejects(lasZip(Buffer.from('<html>404</html>'), inflate), /Ingen giltig zip-fil/);
});

test('läser färg- och alfarutan ur den uppmätta config.json', () => {
  const k = lasKonfig(UPPMATT);
  assert.equal(k.lage, 'portrait');
  assert.deepEqual([k.videoB, k.videoH, k.b, k.h], [1440, 1280, 720, 1280]);
  assert.deepEqual(k.farg, [0, 0, 720, 1280]);
  assert.deepEqual(k.alfa, [720, 0, 720, 1280]);
  assert.equal(k.fil, 'output.mp4');
  assert.equal(k.ljud, false);
});

test('480p-varianten har udda höjd — rutorna gäller ändå', () => {
  const k = lasKonfig('{"portrait":{"videoW":960,"videoH":864,"h":854,"w":480,"align":8,"aFrame":[480,0,480,854],"rgbFrame":[0,0,480,854],"v":1,"path":"output.mp4","f":90,"has_audio":0}}');
  assert.deepEqual([k.b, k.h, k.videoH], [480, 854, 864]);
});

test('en config utan rutor ger ett fel, inte en svart ruta', () => {
  assert.throws(() => lasKonfig('{"portrait":{"videoW":1440,"videoH":1280}}'), /rgbFrame/);
  assert.throws(() => lasKonfig('{}'), /rgbFrame/);
});
