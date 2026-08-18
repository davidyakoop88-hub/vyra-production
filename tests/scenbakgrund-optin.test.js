'use strict';
// Scenbakgrundens opt-in-kontrakt — skrivet RÖTT FÖRST (stage-background.js finns inte än).
//
// DEN ENDA KATASTROFRISKEN i hela funktionen är att overlayns transparens offras: OBS-ytan är
// genomskinlig by design och streamern lägger sin kamera bakom. Kontraktet är därför byggt kring
// FRÅNVARO, inte döljande (§8: DOM-existens är inte användarsynlighet — en display:none-nod hade
// sett släckt ut men kunnat läcka vid nästa CSS-ändring):
//
//   * UTAN state.stageBackground monteras INGEN nod alls. Ingenting att gömma = ingenting att läcka.
//   * Fältet är per layout och flyter genom save-tratten/molnet som layoutFormat gör — men servern
//     validerar bara widgets-id (server/security.js), så ett KORRUPT fält från molnet måste tålas
//     defensivt: typkontroll + VyraSafe.url, aldrig krasch, aldrig nod.
//   * Målaren bor UTANFÖR #view: render() är en full innerHTML-riv som live-triggrar kör även i
//     sändning (media.js triggerBattleMvp) — en video i #view hade startat om mitt i sändningen.
//     Noden ska därför ÖVERLEVA en render med samma DOM-referens.
//   * ?widget=-länkar renderar exakt en widget — ingen bakgrund där.
//   * Teardown på vyra-session-ended är obligatorisk (annars läcker förra kontots bakgrund in i
//     nästa projektion).
//
// Riggen kör jsdom via dom-harness — layout finns inte här, så computed-färg och skärmbevis bor i
// tests/browser/scenbakgrund.browser.test.js. Här bevisas KONTRAKTET: nodens existens, form och
// livscykel. overlay-output-klassen sätts av samma rad som studio.html kör inline — den riktiga
// grinden, inte en testgenväg.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness');

test.after(closeAll);

const NOD = '.vyra-scenbakgrund';

function overlayDom(state) {
  const h = createDom({ url: 'https://vyralive.app/studio.html?overlay=1', state });
  // Exakt raden studio.html kör inline i <head> — grinden målaren läser.
  h.load('overlay-sanitize.js');
  runInline(h, `if(new URLSearchParams(location.search).has('overlay'))document.documentElement.classList.add('overlay-output')`);
  h.load('stage-background.js');
  return h;
}

function runInline(h, source) {
  const s = h.document.createElement('script');
  s.textContent = source;
  h.document.body.append(s);
}

const bas = () => ({ widgets: [], layoutFormat: 'mobile' });

test('utan stageBackground finns ingen bakgrundsnod alls', () => {
  const h = overlayDom(bas());
  assert.equal(h.document.querySelector(NOD), null,
    'en bakgrundsnod monterades trots att layouten inte bett om någon — frånvaro är kontraktet');
});

test('färgläge monterar en nod med färgen, utanför #view', () => {
  const h = overlayDom({ ...bas(), stageBackground: { mode: 'color', value: '#ff0044' } });
  const nod = h.document.querySelector(NOD);
  assert.ok(nod, 'ingen bakgrundsnod monterades för color-läget');
  assert.ok(!h.document.getElementById('view').contains(nod),
    'noden bor i #view — render() river den och startar om video mitt i sändning');
  assert.match(nod.style.background || nod.style.backgroundColor, /ff0044|255, 0, 68/i,
    'noden bär inte layoutens färg');
});

test('videoläge är ett videoelement: muted, loop, autoplay, utan ljudväg', () => {
  const h = overlayDom({ ...bas(), stageBackground: { mode: 'video', value: 'assets/videos/bg.mp4' } });
  const nod = h.document.querySelector(NOD);
  assert.ok(nod, 'ingen bakgrundsnod för video-läget');
  const video = nod.tagName === 'VIDEO' ? nod : nod.querySelector('video');
  assert.ok(video, 'videoläget skapade inget <video>');
  assert.ok(video.muted || video.hasAttribute('muted'), 'bakgrundsvideo får aldrig ha ljud');
  assert.ok(video.hasAttribute('loop'), 'bakgrundsvideon loopar inte');
  assert.ok(video.hasAttribute('autoplay'), 'bakgrundsvideon startar inte själv');
  assert.match(video.getAttribute('src') || '', /assets\/videos\/bg\.mp4/, 'fel källa');
});

test('noden överlever en render med samma DOM-referens — videoloopen får inte starta om', () => {
  const h = overlayDom({ ...bas(), stageBackground: { mode: 'video', value: 'assets/videos/bg.mp4' } });
  const fore = h.document.querySelector(NOD);
  assert.ok(fore, 'ingen nod att prova mot');
  fore.dataset.provmarkering = 'samma-nod';
  // En riktig render-riv: #view byts ut i sin helhet, precis vad triggerBattleMvp gör i sändning.
  h.document.getElementById('view').innerHTML = '<div class="canvas-frame"><div class="canvas"></div></div>';
  return new Promise(r => setTimeout(r, 50)).then(() => {
    const efter = h.document.querySelector(NOD);
    assert.ok(efter, 'noden försvann vid render');
    assert.equal(efter.dataset.provmarkering, 'samma-nod',
      'noden byttes ut vid render — i sändning betyder det att videon startar om');
  });
});

test('korrupt fält från molnet ger ingen nod och ingen krasch', () => {
  for (const korrupt of [
    { mode: 'color', value: 'javascript:alert(1)' },
    { mode: 'video', value: 'javascript:alert(1)' },
    { mode: 'video', value: 42 },
    { mode: 'blink', value: '#fff' },
    'en-strang',
    { mode: 'color' },
  ]) {
    const h = overlayDom({ ...bas(), stageBackground: korrupt });
    assert.equal(h.document.querySelector(NOD), null,
      `korrupt värde ${JSON.stringify(korrupt)} gav en nod — defensiv typkontroll saknas`);
  }
});

test('?widget=-länkar får aldrig en bakgrund', () => {
  const h = createDom({ url: 'https://vyralive.app/studio.html?overlay=1&widget=w1',
    state: { ...bas(), stageBackground: { mode: 'color', value: '#ff0044' } } });
  h.load('overlay-sanitize.js');
  runInline(h, `if(new URLSearchParams(location.search).has('overlay'))document.documentElement.classList.add('overlay-output')`);
  h.load('stage-background.js');
  assert.equal(h.document.querySelector(NOD), null,
    'fristående widgetlänk fick en bakgrund — den ytan renderar exakt en widget');
});

test('vyra-session-ended river noden — förra kontots bakgrund får inte läcka', () => {
  const h = overlayDom({ ...bas(), stageBackground: { mode: 'color', value: '#ff0044' } });
  assert.ok(h.document.querySelector(NOD), 'ingen nod att riva');
  h.window.dispatchEvent(new h.window.Event('vyra-session-ended'));
  assert.equal(h.document.querySelector(NOD), null,
    'noden står kvar efter sessionens slut — nästa projektion ärver fel bakgrund');
});

test('historiken diffar stageBackground — ångra ska kunna återställa bakgrunden', () => {
  // vyra-historik projicerar {widgets, layoutFormat}; utan stageBackground i projektionen är
  // ett bakgrundsbyte osynligt för ångra/gör om. Provet läser filen i stället för att boota
  // hela editorkedjan — projektionens INNEHÅLL är kontraktet här, beteendet ägs av historikens
  // egen svit.
  const fs = require('fs'), path = require('path');
  const historik = fs.readFileSync(path.join(__dirname, '..', 'vyra-historik.js'), 'utf8');
  assert.match(historik, /stageBackground/,
    'vyra-historik.js projicerar inte stageBackground — bakgrundsbyten hamnar utanför ångra');
});
