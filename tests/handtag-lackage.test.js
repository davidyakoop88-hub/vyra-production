'use strict';

// Handtagen far synas i editorn och INGEN ANNANSTANS. Fyra kontexter doljer sedan tidigare
// `.resize-handle`: OBS-utmatningen, live-forhandsvisningen, katalogminiatyrerna och
// konfigurationsscenen. Nar handtagen blev atta i stallet for ett maste alla fyra tacka den
// nya klassen ocksa — annars lacker sju lila brickor ut i sandningen.
//
// Det har ar en ren kallkodsegenskap: att regeln STAR dar gar att avgora ur texten. Att den
// faktiskt doljer nagot ar en annan fraga, och den mats i webblasarprovet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'studio.css'), 'utf8');

const KONTEXT = [
  ['OBS-utmatningen', 'html.overlay-output'],
  ['live-forhandsvisningen', '.overlay-live-preview-stage'],
  ['katalogminiatyrerna', '.owg-thumb-inner'],
  ['konfigurationsscenen', '.owg-configure-preview-stage'],
];

for (const [namn, prefix] of KONTEXT) {
  test(`${namn} doljer aven de nya handtagen`, () => {
    // hitta regeln som doljer .resize-handle i den har kontexten
    const regel = css.split('}').find(r => r.includes(prefix) && r.includes('.resize-handle'));
    assert.ok(regel, `hittade ingen doljregel for .resize-handle i ${prefix}`);
    assert.ok(regel.includes('.vyra-handle'),
      `regeln for ${prefix} doljer .resize-handle men inte .vyra-handle — `
      + 'de sju nya handtagen skulle synas dar');
  });
}

test('handtagsmodulen laddas efter media.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'studio.html'), 'utf8');
  const media = html.indexOf('media.js?v=');
  const handtag = html.indexOf('widget-handles.js');
  assert.ok(handtag > -1, 'widget-handles.js laddas inte alls fran studio.html');
  assert.ok(handtag > media,
    'widget-handles.js maste ligga EFTER media.js — den injicerar i det som media.js renderar');
});
