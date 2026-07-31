'use strict';
// Free Text-to-Speech, backed by the same neural voice service that powers Microsoft Edge's
// built-in "Read Aloud" feature (via the msedge-tts package). No account, no API key, no billing —
// this is what makes TTS Chat's cloud voices (guaranteed male/female options regardless of what's
// installed on a viewer's own OS) possible without David having to set up a paid provider.
//
// This is an UNOFFICIAL integration: msedge-tts talks to Microsoft's internal Read Aloud backend,
// not a published public API, using the same technique widely used by open-source projects like
// edge-tts. It could stop working without notice if Microsoft changes something server-side — if
// that ever happens, listVoices()/synthesize() below will start throwing 502s and TTS Chat's cloud
// voices will need a real paid provider (Google/Azure/Amazon) swapped in behind this same module
// interface instead.
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { Readable } = require('stream');

const MAX_TEXT_LENGTH = 300;
const VOICE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let voiceCache = null; // { at, voices }

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// UI sliders use the native SpeechSynthesisUtterance convention (rate 0.5–2, 1=normal; pitch 0–2,
// 1=normal) so browser-native and cloud voices share the same settings fields — these convert that
// into the relative-percentage SSML format msedge-tts's ProsodyOptions expects.
function speedToSsmlRate(speed) {
  const pct = Math.round((Math.max(0.25, Math.min(4, Number(speed) || 1)) - 1) * 100);
  return (pct >= 0 ? '+' : '') + pct + '%';
}
function pitchToSsmlPitch(pitch) {
  const pct = Math.round((Math.max(0, Math.min(2, Number(pitch) ?? 1)) - 1) * 50);
  return (pct >= 0 ? '+' : '') + pct + '%';
}

function mapVoice(v) {
  return {
    name: v.ShortName,
    languageCodes: [v.Locale],
    gender: String(v.Gender || '').toUpperCase(),
    friendlyName: v.FriendlyName || v.ShortName
  };
}
function filterByLanguage(voices, languageCode) {
  if (!languageCode) return voices;
  return voices.filter(v => v.languageCodes.some(l => l.toLowerCase() === languageCode.toLowerCase()));
}

async function allVoices() {
  if (voiceCache && Date.now() - voiceCache.at < VOICE_CACHE_TTL_MS) return voiceCache.voices;
  const client = new MsEdgeTTS();
  let raw;
  try { raw = await client.getVoices(); }
  catch (error) { throw Object.assign(new Error('Kunde inte hämta röstlistan just nu'), { status: 502, detail: error.message }); }
  const voices = raw.map(mapVoice);
  voiceCache = { at: Date.now(), voices };
  return voices;
}

async function listVoices(languageCode = '') {
  return filterByLanguage(await allVoices(), languageCode);
}

async function defaultVoiceFor(languageCode) {
  const matches = await listVoices(languageCode);
  if (matches.length) return matches[0].name;
  const any = await allVoices();
  return any[0]?.name || 'en-US-AriaNeural';
}

async function synthesize({ text, languageCode = 'sv-SE', voiceName, speed = 1, pitch = 1 } = {}) {
  const safeText = String(text || '').trim().slice(0, MAX_TEXT_LENGTH);
  if (!safeText) throw Object.assign(new Error('Ingen text att läsa upp'), { status: 400 });
  const voice = voiceName || await defaultVoiceFor(languageCode);
  const client = new MsEdgeTTS();
  try {
    await client.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = client.toStream(safeText, { rate: speedToSsmlRate(speed), pitch: pitchToSsmlPitch(pitch) });
    const buffer = await streamToBuffer(audioStream);
    if (!buffer.length) throw new Error('Tomt ljudsvar');
    return buffer.toString('base64');
  } catch (error) {
    throw Object.assign(new Error('TTS-tjänsten kunde inte nås just nu'), { status: 502, detail: error.message });
  } finally {
    client.close();
  }
}

module.exports = { listVoices, synthesize, MAX_TEXT_LENGTH };
