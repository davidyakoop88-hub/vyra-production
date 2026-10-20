'use strict';
// NY ACTION VISAR GRUNDVALEN FÖRST — DE AVANCERADE VALEN ÄR FÄLLDA.
//
// Granskningen 2026-10-17 (F35): Ny Action var en lång dialog med intern scroll där poäng, volym,
// två cooldowns och tre kryssrutor låg utfällda under grundvalen, och Spara/Avbryt fanns först
// längst ned. Minsta ändringen som löser det utan att bryta ett flöde:
//
//   · poängen och "Ytterligare inställningar" ligger i en fällbar <details> som är STÄNGD för en
//     ny action — men ÖPPEN när en befintlig action redan har ett avancerat val satt, så ingen
//     inställning göms för den som redigerar;
//   · fälten är kvar i samma DOM med samma id, så saveAction läser dem precis som förut;
//   · rubriken och fotraden (Avbryt/Spara) står fast när dialogen rullar.
//
// Proven kör den riktiga action-event.js i samma jsdom-rigg som action-sparas-synligt.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const F = require('./helpers/flikar.js');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'action-event.css'), 'utf8');
const living = [];
test.after(() => { while (living.length) living.pop().close() });
const vanta = ms => new Promise(r => setTimeout(r, ms));

const AVANCERADE = ['#aeAddPoints', '#aeRemovePoints', '#aeVolume', '#aeCooldown', '#aeUserCooldown',
  '#aeFade', '#aeRepeatCombo', '#aeSkipOnNext'];

async function studio(actions = []) {
  const lager = F.delatLager();
  lager.setItem(F.KEY, JSON.stringify({ actions, events: [] }));
  const w = await F.fonster({ namn: 'studio', lager, skrivbar: true, actions, events: [],
    extraFiler: ['overlay-sanitize.js'] });
  living.push(w);
  const flik = w.document.createElement('button');
  flik.dataset.extra = 'actions'; flik.className = 'active';
  w.document.body.append(flik);
  w.VyraActionEvent.refresh();
  w.__toaster = w.__toaster || [];
  w.toast = m => w.__toaster.push(String(m));
  return w;
}

test('ny action: de avancerade valen ligger i en stängd, namngiven fällbar sektion', async () => {
  const w = await studio();
  w.document.querySelector('#newAeAction').click();
  const modal = w.document.querySelector('.ae-modal');
  const fall = modal.querySelector('details[data-ae-avancerat]');
  assert.ok(fall, 'dialogen har ingen fällbar sektion för avancerade val — allt visas på en gång');
  assert.equal(fall.open, false, 'de avancerade valen ska vara fällda för en ny action');
  assert.match(fall.querySelector('summary')?.textContent || '', /Avancerade val/);
  for (const sel of AVANCERADE) {
    const falt = modal.querySelector(sel);
    assert.ok(falt, `${sel} finns inte längre — saveAction läser det`);
    assert.ok(fall.contains(falt), `${sel} ligger utanför den fällda sektionen`);
  }
  for (const sel of ['#aeActionName', 'input[data-fn-check]', '#aeDuration', '#saveAeAction']) {
    assert.ok(!fall.contains(modal.querySelector(sel)), `grundvalet ${sel} får inte gömmas i de avancerade valen`);
  }
});

test('ny action: ett värde i den fällda sektionen sparas som förut', async () => {
  const w = await studio();
  w.document.querySelector('#newAeAction').click();
  const modal = w.document.querySelector('.ae-modal');
  modal.querySelector('#aeActionName').value = 'Konfetti';
  const ruta = modal.querySelector('input[data-fn-check]');
  ruta.checked = true; ruta.dispatchEvent(new w.Event('change'));
  modal.querySelector('#aeCooldown').value = '7';
  modal.querySelector('#saveAeAction').click();
  for (let i = 0; i < 60 && !w.__toaster.includes('Action sparad'); i++) await vanta(10);
  const sparad = JSON.parse(w.localStorage.getItem(F.KEY)).actions.find(a => a.name === 'Konfetti');
  assert.ok(sparad, `actionen sparades inte: ${JSON.stringify(w.__toaster)}`);
  assert.equal(Number(sparad.cooldown), 7, 'cooldown i den fällda sektionen nådde inte fram till sparningen');
});

test('redigering: en action med avancerade val öppnar sektionen så inget göms', async () => {
  const w = await studio([{ id: 'a1', name: 'Fyrverkeri', types: ['overlay'], duration: 5, cooldown: 12,
    config: { widget: 'Gift Fireworks' }, scene: { number: 1 } }]);
  w.document.querySelector('[data-edit-action="a1"]').click();
  const fall = w.document.querySelector('.ae-modal details[data-ae-avancerat]');
  assert.ok(fall, 'redigeringsdialogen saknar sektionen');
  assert.equal(fall.open, true, 'en satt cooldown göms bakom en stängd sektion vid redigering');
});

test('redigering: en action utan avancerade val behåller sektionen fälld', async () => {
  const w = await studio([{ id: 'a2', name: 'Bild', types: ['overlay'], duration: 5, cooldown: 0, fade: true,
    config: { widget: 'Gift Fireworks' }, scene: { number: 1 } }]);
  w.document.querySelector('[data-edit-action="a2"]').click();
  assert.equal(w.document.querySelector('.ae-modal details[data-ae-avancerat]').open, false);
});

test('rubrik och Spara/Avbryt står fast när dialogen rullar', () => {
  const fot = CSS.match(/\.ae-modal-action footer\s*\{([^}]*)\}/);
  assert.ok(fot, 'action-event.css har ingen regel för Ny Actions fotrad');
  assert.match(fot[1], /position\s*:\s*sticky/, 'fotraden rullar bort — Spara finns bara längst ned');
  // bottom:-18px: rullningsytan (.ae-modal>div) har 18 px padding, och Chrome räknar den fasta
  // kanten innanför den — med bottom:0 syntes en remsa innehåll under fotraden.
  assert.match(fot[1], /bottom\s*:\s*(0|-18px)/);
  const huvud = CSS.match(/\.ae-modal-action header\s*\{([^}]*)\}/);
  assert.ok(huvud && /position\s*:\s*sticky/.test(huvud[1]), 'rubriken och stängknappen rullar bort');
});
