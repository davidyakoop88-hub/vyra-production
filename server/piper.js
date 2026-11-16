'use strict';
// VYRA:S EGNA GRATISRÖSTER (Piper, 2026-11-16).
//
// Molnrösterna i server/tts.js går via en INOFFICIELL koppling till Microsofts uppläsningstjänst.
// Den är gratis men kan sluta svara utan förvarning — och i OBS finns ofta ingen datorröst att
// falla tillbaka på, så det blir tyst mitt i en sändning. De här rösterna körs på VYRA:s egen
// server med den öppna talmotorn Piper: inget konto, ingen avgift, inget beroende av Microsoft.
//
// De är BÅDE egna val i röstlistan och reserv: faller en molnröst läser en Piper-röst på samma
// språk upp i stället (server/tts.js synthesizeMedTyp).
//
// LICENSERNA ÄR KONTROLLERADE (2026-11-16, modellkorten på huggingface.co/rhasspy/piper-voices).
// VYRA tar betalt, så bara röster vars data tillåter kommersiell användning finns med. De många
// engelska rösterna som bygger på "lessac" eller "Hi-Fi Captain" (icke-kommersiell licens) är
// medvetet utelämnade — även de stora flerröstpaketen vctk och libritts, som är finjusterade från
// lessac. Namnangivelsen för CC BY 4.0-rösterna finns i docs/rostlicenser.md.
//
// Rösterna och talmotorn byggs in i imagen (server/Dockerfile) med fasta versioner och kontroll-
// summor. Saknas de — lokalt, i proven, eller om imagen byggts utan dem — är modulen avstängd och
// allt beter sig exakt som innan den fanns.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PYTHON = process.env.PIPER_PYTHON || '/opt/piper/bin/python';
const KATALOG = process.env.PIPER_VOICES || '/opt/piper-voices';
// PIPER_ARBETARE finns bara för proven (server/test/piper.test.js), som byter Python mot en
// låtsad motor i Node. I imagen sätts den aldrig.
const ARBETARE = process.env.PIPER_ARBETARE || path.join(__dirname, 'piper_worker.py');
const PREFIX = 'piper:';
const SVARSTID_MS = 20000;

// gender: '' där modellkortet inte säger något. Gissa inte — klienten visar då inget kön.
const ROSTER = [
  { id: 'sv_SE-nst-medium', namn: 'NST', sprak: 'sv-SE', gender: '', licens: 'CC0' },
  { id: 'sv_SE-alma-medium', namn: 'Alma', sprak: 'sv-SE', gender: '', licens: 'CC BY 4.0' },
  { id: 'en_US-kristin-medium', namn: 'Kristin', sprak: 'en-US', gender: 'FEMALE', licens: 'Public domain' },
  { id: 'en_US-hifi_tts_92-medium', namn: 'Cori (USA)', sprak: 'en-US', gender: 'FEMALE', licens: 'CC BY 4.0' },
  { id: 'en_GB-cori-medium', namn: 'Cori', sprak: 'en-GB', gender: 'FEMALE', licens: 'CC BY 4.0' },
  { id: 'en_US-john-medium', namn: 'John', sprak: 'en-US', gender: 'MALE', licens: 'Public domain' },
  { id: 'en_US-bryce-medium', namn: 'Bryce', sprak: 'en-US', gender: 'MALE', licens: 'Public domain' }
];
// Reservrösten per språk när en molnröst faller. Engelska utan exakt träff tar Kristin.
const RESERV = { 'sv-SE': 'sv_SE-alma-medium', 'en-US': 'en_US-kristin-medium', 'en-GB': 'en_GB-cori-medium' };

const modell = r => path.join(KATALOG, r.id + '.onnx');
const finns = p => { try { return fs.statSync(p).isFile() } catch { return false } };

let tillgangligaCache = null;
function tillgangliga() {
  if (tillgangligaCache) return tillgangligaCache;
  tillgangligaCache = finns(PYTHON) && finns(ARBETARE)
    ? ROSTER.filter(r => finns(modell(r)) && finns(modell(r) + '.json')) : [];
  return tillgangligaCache;
}
const arPiper = namn => typeof namn === 'string' && namn.startsWith(PREFIX);

function listVoices(languageCode = '') {
  const kod = String(languageCode || '').toLowerCase();
  return tillgangliga()
    .filter(r => !kod || r.sprak.toLowerCase() === kod)
    .map(r => ({ name: PREFIX + r.id, languageCodes: [r.sprak], gender: r.gender, friendlyName: r.namn,
      multilingual: false, provider: 'piper' }));
}

// Vilken Piper-röst som ska läsa när en molnröst på `languageCode` inte svarar.
function reservFor(languageCode) {
  const kod = String(languageCode || '');
  const lista = tillgangliga();
  const id = RESERV[kod] || (/^en/i.test(kod) ? RESERV['en-US'] : null);
  return lista.find(r => r.id === id) || lista.find(r => r.sprak === kod) || null;
}

// ── Arbetsprocessen ──
// En process som lever kvar; frågorna köas och besvaras i tur och ordning. Dör den startas en ny
// vid nästa fråga — men kraschar den tre gånger inom en minut stängs Piper av i fem minuter, så att
// en trasig installation inte startar om Python för varje chattrad.
let process_ = null, buffert = '', nastaId = 1;
const vantar = new Map();
let krascher = [], avstangdTill = 0;

function avsluta(fel) {
  for (const { reject, timer } of vantar.values()) { clearTimeout(timer); reject(fel) }
  vantar.clear();
}
function starta() {
  if (process_) return process_;
  const p = spawn(PYTHON, [ARBETARE], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1' } });
  process_ = p; buffert = '';
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', bit => {
    buffert += bit;
    let i;
    while ((i = buffert.indexOf('\n')) >= 0) {
      const rad = buffert.slice(0, i); buffert = buffert.slice(i + 1);
      let svar; try { svar = JSON.parse(rad) } catch { continue }
      const v = vantar.get(svar.id);
      if (!v) continue;
      vantar.delete(svar.id); clearTimeout(v.timer);
      if (svar.error) v.reject(Object.assign(new Error('Rösten kunde inte läsa upp'), { status: 502, detail: svar.error }));
      else v.resolve(svar.audio);
    }
  });
  p.stderr.on('data', () => {});
  // En död process ger EPIPE vid nästa skrivning; det hanteras av 'exit' nedan, inte som ett kast.
  p.stdin.on('error', () => {});
  const dog = () => {
    if (process_ !== p) return;
    process_ = null;
    const nu = Date.now();
    krascher = krascher.filter(t => nu - t < 60000).concat(nu);
    if (krascher.length >= 3) { avstangdTill = nu + 5 * 60000; krascher = [] }
    avsluta(Object.assign(new Error('Röstmotorn startade om'), { status: 502 }));
  };
  p.on('exit', dog);
  p.on('error', dog);
  return p;
}

async function synthesize({ text, voiceName, speed = 1 } = {}) {
  const id = arPiper(voiceName) ? voiceName.slice(PREFIX.length) : voiceName;
  const rost = tillgangliga().find(r => r.id === id);
  if (!rost) throw Object.assign(new Error('Rösten finns inte på servern'), { status: 404 });
  if (Date.now() < avstangdTill) throw Object.assign(new Error('Röstmotorn är tillfälligt avstängd'), { status: 503 });
  const p = starta();
  const fragaId = nastaId++;
  const langd = 1 / Math.max(0.5, Math.min(2, Number(speed) || 1));
  const ljud = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      vantar.delete(fragaId);
      reject(Object.assign(new Error('Rösten svarade inte i tid'), { status: 504 }));
    }, SVARSTID_MS);
    vantar.set(fragaId, { resolve, reject, timer });
    try { p.stdin.write(JSON.stringify({ id: fragaId, model: modell(rost), text: String(text), length_scale: langd }) + '\n') }
    catch (fel) { clearTimeout(timer); vantar.delete(fragaId); reject(Object.assign(new Error('Röstmotorn svarar inte'), { status: 502, detail: fel.message })) }
  });
  return { audioContent: ljud, mimeType: 'audio/wav' };
}

// För proven: nollställ cachen så att en ändrad PIPER_VOICES läses om.
function _nollstall() { tillgangligaCache = null; if (process_) { try { process_.kill() } catch {} process_ = null } avstangdTill = 0; krascher = [] }

module.exports = { ROSTER, PREFIX, arPiper, listVoices, reservFor, synthesize, tillgangliga, _nollstall };
