'use strict';
// TTS: RÖSTKORTET FÅR INTE VÄXA UT ÖVER "VEM FÅR HÖRAS?" (granskning F02, 2026-10-17)
//
// Sett vid ~1145 px: när rösterna laddats blev select:en "Röst" lika bred som sitt längsta
// alternativ (Edge-röster heter t.ex. "Microsoft Sofie Online (Natural) - Swedish (Sweden)").
// .tts-fields var `1fr 1fr`, och gridbarn har min-width:auto — så kolumnen följde med ut ur
// kortet, in över grannkortet, och sidan fick horisontell scroll.
//
// Uppmätt i Edge med riktig markup ur tts-chat.js + studio.css/design-system.css/tts-chat.css:
//   före  1145 px: kortet slutar x=670, select:en x=962 (292 px utanför)
//   efter 1145 px: select:en slutar x=651, inuti kortet; 980/760/600 px: en kolumn, inget utanför.
//
// Provet är källnära (jsdom räknar ingen layout): det vaktar reglerna som gör att det håller.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'tts-chat.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const js = fs.readFileSync(path.join(__dirname, '..', 'tts-chat.js'), 'utf8');

// Sista regeln för en selektor vinner vid samma specificitet — läs alltså den sista förekomsten
// utanför media-/containerregler.
function sistaRegel(selektor) {
  const ytan = css.replace(/@(media|container)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const esc = selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const träffar = [...ytan.matchAll(new RegExp(`(?:^|[}\\s,])${esc}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 'g'))];
  return träffar.length ? träffar[träffar.length - 1][1] : '';
}

test('röstväljaren sitter i .tts-fields i röstkortet', () => {
  assert.match(js, /class="card tts-general"[\s\S]*?<div class="tts-fields">[\s\S]*?<select id="ttsVoice">/);
});

test('fältens kolumner får krympa: minmax(0, 1fr), inte 1fr', () => {
  const regel = sistaRegel('.tts-fields');
  assert.match(regel, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, `.tts-fields: "${regel}"`);
});

test('gridbarnen i kortet och fälten har min-width:0', () => {
  assert.match(css, /\.tts-vyra-grid>\*\s*,\s*\.tts-fields>\*\s*\{[^}]*min-width:\s*0/);
});

test('select:en i fälten fyller kolumnen och går aldrig utanför', () => {
  const regel = sistaRegel('.tts-fields select');
  for (const krav of [/width:\s*100%/, /max-width:\s*100%/, /min-width:\s*0/, /text-overflow:\s*ellipsis/, /box-sizing:\s*border-box/]) {
    assert.match(regel, krav, `.tts-fields select saknar ${krav}: "${regel}"`);
  }
});

test('när bredden inte räcker läggs fälten under varandra', () => {
  assert.match(css, /\.tts-vyra-grid>\.card\s*\{[^}]*container-type:\s*inline-size/);
  assert.match(css, /@container\s*\(max-width:\s*\d+px\)\s*\{\s*\.tts-fields\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  // Den smala mediaregeln måste ligga EFTER basregeln, annars skriver basregeln över den.
  const bas = css.lastIndexOf('.tts-fields{grid-template-columns:repeat(2,minmax(0,1fr))}');
  const smal = css.lastIndexOf('@media(max-width:700px){.tts-fields{grid-template-columns:minmax(0,1fr)}}');
  assert.ok(bas >= 0 && smal > bas, 'mediaregeln för smala fönster ligger före basregeln och slås ut');
});
