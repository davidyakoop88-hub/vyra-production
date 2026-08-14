'use strict';
// Röstvalet i en TTS-action ska vara ett riktigt val.
//
// Listan var tre hårdkodade etiketter — "Kvinnlig röst", "Manlig röst", "Neutral röst" — och
// `<option>`-elementen saknade `value`, så `select.value` blev själva etiketttexten.
// action-runtime.js matchar med `voices.find(v => v.name === c.voice || v.lang === c.voice)`,
// och ingen riktig röst heter något av det. Matchningen föll alltid till `null`, alltså systemets
// standardröst: **alla tre valen lät likadant.** Kryssrutan "Slumpmässig röst" fungerade, eftersom
// den plockar ur den riktiga röstlistan.
//
// Uppmätt 2026-08-14 i jsdom med en påhittad röstlista: valet nådde aldrig fram till uppspelningen.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const living = [];
test.after(() => { while (living.length) living.pop().window.close() });

const ROSTER = [
  { name: 'Alva', lang: 'sv-SE' },
  { name: 'Google svenska', lang: 'sv-SE' },
  { name: 'Daniel', lang: 'en-GB' }
];

function panel({ roster = ROSTER } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="view"></div></body></html>',
    { url: 'https://vyralive.app/studio.html', pretendToBeVisual: false, runScripts: 'dangerously' });
  living.push(dom);
  const { window } = dom;
  window.navigator.locks = undefined;
  window.__talat = [];
  window.SpeechSynthesisUtterance = function (t) { this.text = t };
  const lyssnare = [];
  window.speechSynthesis = {
    getVoices: () => window.__roster,
    speak: u => window.__talat.push(u),
    cancel: () => {},
    addEventListener: (namn, fn) => lyssnare.push([namn, fn]),
    fyra: namn => lyssnare.filter(([n]) => n === namn).forEach(([, fn]) => fn())
  };
  window.__roster = roster;
  const s = window.document.createElement('script');
  s.textContent = las('action-options.js');
  window.document.body.append(s);

  // Panelen byggs av en MutationObserver när modalen dyker upp.
  const modal = window.document.createElement('div');
  modal.className = 'ae-modal';
  modal.innerHTML = '<div class="ae-grid"></div><button id="saveAeAction"></button>';
  window.document.body.append(modal);
  return { window, modal };
}
const vanta = ms => new Promise(r => setTimeout(r, ms));

test('röstlistan fylls med maskinens faktiska röster', async () => {
  const p = panel();
  await vanta(150);
  const select = p.window.document.querySelector('#aoVoice');
  assert.ok(select, 'röstväljaren renderades inte');
  const val = Array.from(select.options, o => ({ value: o.value, text: o.textContent }));
  assert.equal(val[0].value, '', 'första valet ska vara standardrösten');
  assert.deepEqual(val.slice(1).map(o => o.value), ['Alva', 'Google svenska', 'Daniel']);
  assert.equal(val[1].text, 'Alva (sv-SE)', 'språket ska synas i etiketten');
});

test('inget val bär längre en etikett som inte är en röst', async () => {
  const p = panel();
  await vanta(150);
  const select = p.window.document.querySelector('#aoVoice');
  for (const gammal of ['Kvinnlig röst', 'Manlig röst', 'Neutral röst']) {
    assert.ok(!Array.from(select.options).some(o => o.value === gammal || o.textContent === gammal),
      `"${gammal}" står kvar i listan — den matchar ingen riktig röst och låter som standardrösten`);
  }
});

test('en tom lista fylls på när webbläsaren rapporterar sina röster', async () => {
  // Chrome svarar ofta tomt på första getVoices() och fyrar voiceschanged strax därpå. Utan
  // lyssnaren står listan kvar tom hela sessionen.
  const p = panel({ roster: [] });
  await vanta(150);
  const select = p.window.document.querySelector('#aoVoice');
  assert.equal(select.options.length, 1, 'utan röster ska bara standardvalet stå där');

  p.window.__roster = ROSTER;
  p.window.speechSynthesis.fyra('voiceschanged');
  await vanta(50);
  assert.equal(select.options.length, 4, 'listan fylldes inte på när rösterna kom');
});

test('lyssnaren skriver inte över tts-chats onvoiceschanged', () => {
  // tts-chat.js gör `speechSynthesis.onvoiceschanged = refreshVoiceOptions`. En tilldelning här
  // hade slagit ut den — eller tvärtom, beroende på laddningsordning.
  // Kommentarraderna bort först: filen FÖRKLARAR varför den inte gör tilldelningen, och den
  // förklaringen innehåller förstås strängen vi letar efter.
  const kod = las('action-options.js').split('\n').filter(r => !/^\s*\/\//.test(r)).join('\n');
  assert.ok(!/speechSynthesis\.onvoiceschanged\s*=/.test(kod),
    'action-options tilldelar onvoiceschanged och slår ut tts-chats lyssnare');
  assert.match(kod, /addEventListener\('voiceschanged'/);
});

test('"Testa TTS" använder den valda rösten', async () => {
  const p = panel();
  await vanta(150);
  const d = p.window.document;
  d.querySelector('#aoTts').value = 'Hej {username}';
  d.querySelector('#aoVoice').value = 'Daniel';
  d.querySelector('#aoTest').click();
  await vanta(50);
  assert.equal(p.window.__talat.length, 1, 'testknappen sa ingenting');
  assert.equal(p.window.__talat[0].voice?.name, 'Daniel',
    'testknappen ignorerade röstvalet — förhandsvisningen låter inte som skarpt läge');
});

test('"Slumpmässig röst" går före ett explicit val, precis som i runtime', async () => {
  const p = panel();
  await vanta(150);
  const d = p.window.document;
  d.querySelector('#aoTts').value = 'Hej';
  d.querySelector('#aoVoice').value = 'Daniel';
  d.querySelector('#aoRandom').checked = true;
  d.querySelector('#aoTest').click();
  await vanta(50);
  const namn = p.window.__talat[0].voice?.name;
  assert.ok(ROSTER.some(v => v.name === namn), `slumpad röst ska komma ur listan, fick ${namn}`);
});

test('en sparad röst som inte finns på maskinen faller till standardrösten', async () => {
  // Så här ser en gammal action ut: voice === 'Kvinnlig röst'. Den ska inte bli ett kvarhängande
  // val som ser giltigt ut i panelen.
  const p = panel();
  await vanta(150);
  const select = p.window.document.querySelector('#aoVoice');
  select.value = 'Kvinnlig röst';
  assert.equal(select.value, '', 'ett okänt röstnamn valdes ändå');
});
