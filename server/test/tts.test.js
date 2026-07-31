'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

// tts.js's only external dependency is the msedge-tts package — substituting it in Node's
// require.cache (the same technique freshTts() below uses on tts.js itself) lets these tests
// exercise the real text-truncation/rate-pitch-conversion/error-wrapping/voice-caching logic in
// tts.js without ever making a real network call to Microsoft's backend (which would be flaky,
// need internet, and risk rate-limiting/blocking in CI).
const FAKE_VOICES = [
  { Name: 'Microsoft Sofie Online (Natural) - Swedish (Sweden)', ShortName: 'sv-SE-SofieNeural', Gender: 'Female', Locale: 'sv-SE', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3', FriendlyName: 'Microsoft Sofie Online (Natural) - Swedish (Sweden)', Status: 'GA' },
  { Name: 'Microsoft Mattias Online (Natural) - Swedish (Sweden)', ShortName: 'sv-SE-MattiasNeural', Gender: 'Male', Locale: 'sv-SE', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3', FriendlyName: 'Microsoft Mattias Online (Natural) - Swedish (Sweden)', Status: 'GA' },
  { Name: 'Microsoft Aria Online (Natural) - English (US)', ShortName: 'en-US-AriaNeural', Gender: 'Female', Locale: 'en-US', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3', FriendlyName: 'Microsoft Aria Online (Natural) - English (US)', Status: 'GA' }
];

function makeFakeMsEdgeTts({ getVoicesImpl, setMetadataImpl, audioBytes = Buffer.from('FAKEAUDIODATA'), streamError = null } = {}) {
  const instances = [];
  class FakeMsEdgeTTS {
    constructor() { this.setMetadataCalls = []; this.toStreamCalls = []; this.closed = false; instances.push(this); }
    async getVoices() { if (getVoicesImpl) return getVoicesImpl(); return FAKE_VOICES; }
    async setMetadata(voiceName, outputFormat, opts) { this.setMetadataCalls.push({ voiceName, outputFormat, opts }); if (setMetadataImpl) await setMetadataImpl(voiceName); }
    toStream(text, options) {
      this.toStreamCalls.push({ text, options });
      const audioStream = streamError ? Readable.from((async function* () { throw streamError; })()) : Readable.from([audioBytes]);
      return { audioStream, metadataStream: null };
    }
    close() { this.closed = true; }
  }
  return { module: { MsEdgeTTS: FakeMsEdgeTTS, OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'audio-24khz-48kbitrate-mono-mp3' } }, instances };
}

function withFakeMsEdgeTts(fake, fn) {
  const resolved = require.resolve('msedge-tts');
  const original = require.cache[resolved];
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: fake.module };
  delete require.cache[require.resolve('../tts')];
  const TTS = require('../tts');
  return Promise.resolve(fn(TTS)).finally(() => {
    if (original) require.cache[resolved] = original; else delete require.cache[resolved];
    delete require.cache[require.resolve('../tts')];
  });
}

test('synthesize throws 400 for empty/whitespace-only text, without touching the TTS client', async () => {
  const fake = makeFakeMsEdgeTts();
  await withFakeMsEdgeTts(fake, async (TTS) => {
    try { await TTS.synthesize({ text: '   ' }); assert.fail('should have thrown'); }
    catch (err) { assert.equal(err.status, 400); }
    assert.equal(fake.instances.length, 0);
  });
});

test('synthesize picks a voice for the language, calls setMetadata + toStream, and returns base64 audio', async () => {
  const fake = makeFakeMsEdgeTts();
  await withFakeMsEdgeTts(fake, async (TTS) => {
    const result = await TTS.synthesize({ text: 'hej allihopa', languageCode: 'sv-SE' });
    assert.equal(Buffer.from(result, 'base64').toString(), 'FAKEAUDIODATA');
    // No explicit voiceName was given, so synthesize() first spins up its own client to list
    // voices and pick a default (instances[0]), then a second client to actually synthesize
    // (instances[1]) — this asserts against whichever instance actually called setMetadata.
    const inst = fake.instances.find(i => i.setMetadataCalls.length);
    assert.equal(inst.setMetadataCalls[0].voiceName, 'sv-SE-SofieNeural'); // first sv-SE match
    assert.equal(inst.toStreamCalls[0].text, 'hej allihopa');
    assert.equal(inst.closed, true);
  });
});

test('synthesize uses an explicit voiceName when given, instead of picking a default', async () => {
  const fake = makeFakeMsEdgeTts();
  await withFakeMsEdgeTts(fake, async (TTS) => {
    await TTS.synthesize({ text: 'hej', languageCode: 'sv-SE', voiceName: 'sv-SE-MattiasNeural' });
    assert.equal(fake.instances[0].setMetadataCalls[0].voiceName, 'sv-SE-MattiasNeural');
  });
});

test('synthesize converts speed/pitch (native 0.5-2 / 0-2 scale) into relative-percentage SSML values', async () => {
  const fake = makeFakeMsEdgeTts();
  await withFakeMsEdgeTts(fake, async (TTS) => {
    await TTS.synthesize({ text: 'hej', voiceName: 'sv-SE-SofieNeural', speed: 1.5, pitch: 1.4 });
    const opts = fake.instances[0].toStreamCalls[0].options;
    assert.equal(opts.rate, '+50%');   // (1.5-1)*100
    assert.equal(opts.pitch, '+20%');  // (1.4-1)*50
  });
});

test('synthesize truncates text longer than MAX_TEXT_LENGTH before sending', async () => {
  const fake = makeFakeMsEdgeTts();
  await withFakeMsEdgeTts(fake, async (TTS) => {
    await TTS.synthesize({ text: 'x'.repeat(500), voiceName: 'sv-SE-SofieNeural' });
    assert.equal(fake.instances[0].toStreamCalls[0].text.length, TTS.MAX_TEXT_LENGTH);
  });
});

test('synthesize wraps a failing stream as a 502, and still closes the client', async () => {
  const fake = makeFakeMsEdgeTts({ streamError: new Error('connection reset') });
  await withFakeMsEdgeTts(fake, async (TTS) => {
    try { await TTS.synthesize({ text: 'hej', voiceName: 'sv-SE-SofieNeural' }); assert.fail('should have thrown'); }
    catch (err) { assert.equal(err.status, 502); }
    assert.equal(fake.instances[0].closed, true);
  });
});

test('listVoices maps the raw shape and filters by language', async () => {
  const fake = makeFakeMsEdgeTts();
  await withFakeMsEdgeTts(fake, async (TTS) => {
    const svVoices = await TTS.listVoices('sv-SE');
    assert.equal(svVoices.length, 2);
    assert.deepEqual(svVoices.map(v => v.name).sort(), ['sv-SE-MattiasNeural', 'sv-SE-SofieNeural']);
    assert.equal(svVoices.find(v => v.name === 'sv-SE-SofieNeural').gender, 'FEMALE');
    const allVoices = await TTS.listVoices('');
    assert.equal(allVoices.length, 3);
  });
});

test('listVoices caches the raw fetch across calls within the TTL', async () => {
  const fake = makeFakeMsEdgeTts();
  await withFakeMsEdgeTts(fake, async (TTS) => {
    await TTS.listVoices('sv-SE');
    await TTS.listVoices('en-US');
    assert.equal(fake.instances.length, 1, 'second listVoices call should reuse the cached voice list, not fetch again');
  });
});

test('listVoices throws 502 when the underlying voice fetch fails', async () => {
  const fake = makeFakeMsEdgeTts({ getVoicesImpl: () => { throw new Error('network down') } });
  await withFakeMsEdgeTts(fake, async (TTS) => {
    try { await TTS.listVoices('sv-SE'); assert.fail('should have thrown'); }
    catch (err) { assert.equal(err.status, 502); }
  });
});
