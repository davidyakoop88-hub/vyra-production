'use strict';
// VYRA:s egna gratisröster (server/piper.js) och reserven i server/tts.js.
//
// Talmotorn är Python och finns bara i imagen; där läser varje röst upp en mening i
// docker-image-files.test.js. Här byts motorn mot en låtsad i Node som talar samma radprotokoll,
// så att det som ligger i Node — röstlistan, reserven när Microsoft inte svarar, omstart efter en
// krasch — provas överallt, även utan Docker.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { Readable } = require('node:stream');

const ROT = fs.mkdtempSync(path.join(os.tmpdir(), 'vyra-piper-'));
const ROSTER = path.join(ROT, 'roster');
fs.mkdirSync(ROSTER);
for (const id of ['sv_SE-nst-medium', 'sv_SE-alma-medium', 'en_US-kristin-medium', 'en_US-hifi_tts_92-medium', 'en_GB-cori-medium', 'en_US-john-medium', 'en_US-bryce-medium']) {
  fs.writeFileSync(path.join(ROSTER, id + '.onnx'), 'x');
  fs.writeFileSync(path.join(ROSTER, id + '.onnx.json'), '{}');
}
// Den låtsade motorn: svarar med ett "WAV" som bär modellnamn och längdskala, och kraschar på
// texten "KRASCH" — precis som en riktig process som dör mitt i.
const MOTOR = path.join(ROT, 'motor.js');
fs.writeFileSync(MOTOR, `
const rl=require('readline').createInterface({input:process.stdin});
rl.on('line',rad=>{const f=JSON.parse(rad);if(f.text==='KRASCH')process.exit(3);
if(f.text==='FEL'){process.stdout.write(JSON.stringify({id:f.id,error:'trasig'})+'\\n');return}
const ljud=Buffer.from('RIFF'+require('path').basename(f.model)+'|'+f.length_scale).toString('base64');
process.stdout.write(JSON.stringify({id:f.id,audio:ljud})+'\\n')});`);

process.env.PIPER_PYTHON = process.execPath;
process.env.PIPER_ARBETARE = MOTOR;
process.env.PIPER_VOICES = ROSTER;

const MOLN = [
  { ShortName: 'sv-SE-SofieNeural', Gender: 'Female', Locale: 'sv-SE', FriendlyName: 'Sofie' },
  { ShortName: 'en-US-AvaMultilingualNeural', Gender: 'Female', Locale: 'en-US', FriendlyName: 'Ava' }
];
function ttsMed({ rostlistaFel = false, strommenFel = false } = {}) {
  class Falsk {
    async getVoices() { if (rostlistaFel) throw new Error('Microsoft svarar inte'); return MOLN }
    async setMetadata() {}
    toStream() { return { audioStream: strommenFel ? Readable.from((async function* () { throw new Error('nere') })()) : Readable.from([Buffer.from('MP3')]) } }
    close() {}
  }
  const msedge = require.resolve('msedge-tts');
  require.cache[msedge] = { id: msedge, filename: msedge, loaded: true, exports: { MsEdgeTTS: Falsk, OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'mp3' } } };
  delete require.cache[require.resolve('../tts')];
  return require('../tts');
}
const Piper = require('../piper');
const PiperPost = require.cache[require.resolve('../piper')];
test.after(() => { Piper._nollstall(); fs.rmSync(ROT, { recursive: true, force: true }) });
test.beforeEach(() => Piper._nollstall());

test('alla sju röster listas, per språk, som VYRA-röster', () => {
  assert.equal(Piper.tillgangliga().length, 7);
  assert.deepEqual(Piper.listVoices('sv-SE').map(v => v.friendlyName), ['NST', 'Alma']);
  assert.deepEqual(Piper.listVoices('en-US').map(v => v.friendlyName), ['Kristin', 'Cori (USA)', 'John', 'Bryce']);
  assert.deepEqual(Piper.listVoices('en-GB').map(v => v.name), ['piper:en_GB-cori-medium']);
  assert.ok(Piper.listVoices('').every(v => v.provider === 'piper'));
});

test('utan installation finns inga röster, och inget annat ändras', () => {
  const sparad = process.env.PIPER_VOICES;
  process.env.PIPER_VOICES = path.join(ROT, 'finns-inte');
  delete require.cache[require.resolve('../piper')];
  const Tom = require('../piper');
  try {
    assert.deepEqual(Tom.listVoices('sv-SE'), []);
    assert.equal(Tom.reservFor('sv-SE'), null);
  } finally {
    process.env.PIPER_VOICES = sparad;
    // Tillbaka till samma modulinstans som resten av filen använder — annars laddar tts.js en
    // andra kopia vars motorprocess aldrig stängs, och provet blir hängande.
    require.cache[require.resolve('../piper')] = PiperPost;
  }
});

test('en Piper-röst läser upp som wav, och hastigheten blir längdskala', async () => {
  const s = await Piper.synthesize({ text: 'hej', voiceName: 'piper:sv_SE-alma-medium', speed: 2 });
  assert.equal(s.mimeType, 'audio/wav');
  assert.equal(Buffer.from(s.audioContent, 'base64').toString(), 'RIFFsv_SE-alma-medium.onnx|0.5');
});

test('en okänd röst ger 404, ett fel i motorn ger 502, och motorn startar om efter en krasch', async () => {
  await assert.rejects(Piper.synthesize({ text: 'hej', voiceName: 'piper:finns-inte' }), e => e.status === 404);
  await assert.rejects(Piper.synthesize({ text: 'FEL', voiceName: 'piper:sv_SE-nst-medium' }), e => e.status === 502);
  await assert.rejects(Piper.synthesize({ text: 'KRASCH', voiceName: 'piper:sv_SE-nst-medium' }), e => e.status === 502);
  const efter = await Piper.synthesize({ text: 'hej igen', voiceName: 'piper:sv_SE-nst-medium' });
  assert.match(Buffer.from(efter.audioContent, 'base64').toString(), /^RIFFsv_SE-nst/);
});

test('tre krascher inom en minut stänger av motorn i stället för att starta om den för varje rad', async () => {
  for (let i = 0; i < 3; i++) await assert.rejects(Piper.synthesize({ text: 'KRASCH', voiceName: 'piper:sv_SE-nst-medium' }));
  await assert.rejects(Piper.synthesize({ text: 'hej', voiceName: 'piper:sv_SE-nst-medium' }), e => e.status === 503);
});

test('röstlistan: molnrösterna först, sedan VYRA-rösterna, sedan de flerspråkiga', async () => {
  const TTS = ttsMed();
  const namn = (await TTS.listVoices('sv-SE')).map(v => v.name);
  assert.deepEqual(namn, ['sv-SE-SofieNeural', 'piper:sv_SE-nst-medium', 'piper:sv_SE-alma-medium', 'en-US-AvaMultilingualNeural']);
});

test('svarar inte Microsoft alls är VYRA-rösterna hela listan, i stället för ett fel', async () => {
  const TTS = ttsMed({ rostlistaFel: true });
  assert.deepEqual((await TTS.listVoices('sv-SE')).map(v => v.friendlyName), ['NST', 'Alma']);
});

test('reserven: faller en molnröst läser VYRA:s egen röst på samma språk upp i stället', async () => {
  const TTS = ttsMed({ strommenFel: true });
  const sv = await TTS.synthesizeMedTyp({ text: 'tack', voiceName: 'sv-SE-SofieNeural', languageCode: 'sv-SE' });
  assert.equal(sv.mimeType, 'audio/wav');
  assert.match(Buffer.from(sv.audioContent, 'base64').toString(), /^RIFFsv_SE-alma-medium/);
  const en = await TTS.synthesizeMedTyp({ text: 'thanks', voiceName: 'en-US-AvaMultilingualNeural' });
  assert.match(Buffer.from(en.audioContent, 'base64').toString(), /^RIFFen_US-kristin-medium/);
});

test('fungerar molnrösten används den som förut, som mp3', async () => {
  const TTS = ttsMed();
  const s = await TTS.synthesizeMedTyp({ text: 'tack', voiceName: 'sv-SE-SofieNeural', languageCode: 'sv-SE' });
  assert.deepEqual(s, { audioContent: Buffer.from('MP3').toString('base64'), mimeType: 'audio/mpeg' });
  await assert.rejects(TTS.synthesizeMedTyp({ text: '   ' }), e => e.status === 400);
});
