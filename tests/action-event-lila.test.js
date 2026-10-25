'use strict';
// DEN LILA DESIGNEN ÄR ETT SKAL — FUNKTIONERNA UNDER ÄR OFÖRÄNDRADE (godkänd 2026-10-19).
//
// Ny Action och Nytt Event ritades om efter designpaketet: numrerade sektioner, effektkort och
// valkort, och Ctrl-flerval ersatt av kryssrutor. Riskerna är alla av samma slag — att något som
// sparas eller matchas tappas på vägen:
//
//   · effektkortens kryssrutor måste vara kvar som `input[data-fn-check]` med samma värden,
//     annars läser selectedActionTypes() ingenting;
//   · radiogrupperna `aeAudience` och `aeAdvancedTrigger` måste ha kvar namn och alla värden;
//   · "Kör alla" och "Kör en slumpmässig" är två OBEROENDE flerval. Kryssrutorna skriver in i
//     respektive <select multiple>, som collect() läser — samma sparade fält som förut;
//   · ett gammalt event med bara `actionId` ska fortfarande visas förvalt (nu som ikryssad ruta).
//
// Proven monterar den riktiga koden, inte en sträng ur källan.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const F = require('./helpers/flikar.js');

const ROT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROT, f), 'utf8');
const levande = [];
test.after(() => { while (levande.length) { const x = levande.pop(); (x.window || x).close() } });
const vanta = ms => new Promise(r => setTimeout(r, ms));
// Arrayer skapade inne i jsdom tillhör jsdoms realm; jämför som JSON (se event-bakatkompatibilitet).
const json = v => JSON.stringify(Array.from(v || []));

const ACTIONS = [{ id: 'a1', name: 'Tack för gåvan' }, { id: 'a2', name: 'Konfetti' }, { id: 'a3', name: 'Chattsvar' }];

function eventPanel(event) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://vyralive.app/studio.html', runScripts: 'dangerously' });
  levande.push(dom);
  const { window } = dom;
  window.VyraSafe = { text: v => String(v == null ? '' : v), url: v => String(v == null ? '' : v) };
  const leverantorer = [];
  window.VyraEventFields = { register: p => leverantorer.push(p) };
  const s = window.document.createElement('script');
  s.textContent = las('action-event-advanced.js');
  window.document.body.append(s);
  const modal = window.document.createElement('div');
  modal.className = 'ae-modal ae-modal-event ae-lila';
  modal.innerHTML = '<div class="ae-event-slot"></div><button id="saveAeEvent"></button>';
  window.document.body.append(modal);
  const panel = leverantorer.find(p => typeof p.mount === 'function');
  panel.mount(modal, event, { actions: ACTIONS });
  return { window, modal, panel };
}
const kryss = (modal, lista) => [...modal.querySelectorAll(`#${lista}+.ae-flerval input[type=checkbox]`)];

test('event: radiogrupperna har kvar namn och alla värden, som valkort med rubrik', () => {
  const { modal } = eventPanel({});
  const varden = namn => [...modal.querySelectorAll(`input[type=radio][name=${namn}]`)].map(r => r.value);
  assert.deepEqual(varden('aeAudience'), ['everyone', 'follower', 'subscriber', 'moderator', 'topGifter', 'specificUser']);
  assert.equal(varden('aeAdvancedTrigger').length, 15, 'alla 15 triggertyper ska finnas kvar');
  for (const grupp of modal.querySelectorAll('[role=radiogroup]')) {
    assert.ok(modal.querySelector('#' + grupp.getAttribute('aria-labelledby')), 'radiogruppen saknar namngivande rubrik');
  }
  assert.equal(modal.querySelector('[name=aeAudience]:checked').value, 'everyone');
  assert.equal(modal.querySelectorAll('.ae-valkort small').length, 6, 'varje "Vem får trigga"-kort har en beskrivning');
});

test('event: Ctrl-flervalet är ersatt av kryssrutor, och selecten finns kvar gömd', () => {
  const { modal } = eventPanel({});
  for (const id of ['aeAllActions', 'aeRandomActions']) {
    const sel = modal.querySelector('#' + id);
    assert.ok(sel && sel.multiple, `${id} måste finnas kvar — collect() läser den`);
    assert.equal(sel.hidden, true, `${id} ska vara gömd bakom kryssrutorna`);
    assert.equal(sel.tabIndex, -1, `${id} ska inte gå att tabba till`);
    assert.equal(kryss(modal, id).length, ACTIONS.length);
  }
  assert.doesNotMatch(modal.textContent, /Håll Ctrl/, 'instruktionen om Ctrl-klick ska vara borta');
});

test('event: kryssrutorna sparar exakt samma urval, och de två listorna är oberoende', () => {
  const { window, modal, panel } = eventPanel({});
  const klick = ruta => { ruta.checked = !ruta.checked; ruta.dispatchEvent(new window.Event('change', { bubbles: true })) };
  const alla = kryss(modal, 'aeAllActions'), slump = kryss(modal, 'aeRandomActions');
  klick(alla[0]); klick(alla[2]);
  klick(slump[0]); klick(slump[1]);
  let ut = panel.collect(modal);
  assert.equal(json(ut.allActionIds), json(['a1', 'a3']));
  assert.equal(json(ut.randomActionIds), json(['a1', 'a2']), 'samma Action får stå i båda listorna');
  klick(alla[0]);
  ut = panel.collect(modal);
  assert.equal(json(ut.allActionIds), json(['a3']), 'en urkryssad ruta ska försvinna ur sparningen');
  assert.equal(json(ut.randomActionIds), json(['a1', 'a2']), 'den andra listan påverkades av den första');
  assert.match(modal.querySelector('#aeAllActions ~ .ae-flerval-antal').textContent, /1 vald/);
});

test('event: ett gammalt event med bara actionId visas som ikryssad ruta', () => {
  const { modal, panel } = eventPanel({ id: 'g', trigger: 'gift', condition: 'Rose', actionId: 'a2', enabled: true });
  assert.deepEqual(kryss(modal, 'aeAllActions').map(r => r.checked), [false, true, false]);
  assert.equal(json(panel.collect(modal).allActionIds), json(['a2']));
});

test('event: villkorsfälten följer triggern som förut', () => {
  const { window, modal } = eventPanel({ advancedTrigger: 'chatCommand', triggerValue: '!hej' });
  assert.equal(modal.querySelector('#aeAdvancedValue').value, '!hej');
  assert.equal(modal.querySelector('#aePointsLevelRad').hidden, false, 'poängnivån syns bara på kommando');
  const gava = modal.querySelector('[name=aeAdvancedTrigger][value=gift]');
  gava.checked = true; gava.dispatchEvent(new window.Event('change'));
  assert.ok(modal.querySelector('#aeChooseGift'), 'gåvoväljaren saknas för "Skickar en specifik gåva"');
  assert.equal(modal.querySelector('#aeTeamLevelRad').hidden, true);
});

async function studio() {
  const lager = F.delatLager();
  lager.setItem(F.KEY, JSON.stringify({ actions: [], events: [] }));
  const w = await F.fonster({ namn: 'studio', lager, skrivbar: true, actions: [], events: [], extraFiler: ['overlay-sanitize.js'] });
  levande.push(w);
  const flik = w.document.createElement('button');
  flik.dataset.extra = 'actions'; flik.className = 'active';
  w.document.body.append(flik);
  w.VyraActionEvent.refresh();
  w.__toaster = [];
  w.toast = m => w.__toaster.push(String(m));
  return w;
}

test('action: numrerade sektioner och ett effektkort per verklig funktion', async () => {
  const w = await studio();
  w.document.querySelector('#newAeAction').click();
  const modal = w.document.querySelector('.ae-modal');
  assert.ok(modal.classList.contains('ae-lila'));
  assert.deepEqual([...modal.querySelectorAll('.ae-sek-rubrik')].map(h => h.textContent.replace(/^\d/, '')),
    ['Grundinställningar', 'Vad ska hända live?', 'Var ska det synas?']);
  const kort = [...modal.querySelectorAll('.ae-fn-kort')];
  assert.equal(kort.length, 14, 'ett kort per funktion i actionTypes — inga påhittade från designbilden');
  for (const k of kort) {
    assert.ok(k.querySelector('input[type=checkbox][data-fn-check]'), 'kortets kryssruta måste vara kvar som riktig kontroll');
    assert.ok(k.querySelector('.ae-fn-ikon svg'), 'kortet saknar ikon');
    assert.ok(k.querySelector('small')?.textContent.trim(), 'kortet saknar beskrivning');
  }
  assert.doesNotMatch(modal.textContent, /Streamer\.bot|Tangenttryckning/, 'designbildens konkurrentkort ska inte finnas');
  assert.ok(modal.querySelector('.ae-sek-skarm .ae-extra-slot'), 'scenvalet ska ligga i sektion 3');
  assert.equal(modal.querySelector('#saveAeAction').textContent, 'Spara Action');
});

test('action: ett ikryssat kort sparas med samma types som förut', async () => {
  const w = await studio();
  w.document.querySelector('#newAeAction').click();
  const modal = w.document.querySelector('.ae-modal');
  modal.querySelector('#aeActionName').value = 'Chattsvar';
  const ruta = modal.querySelector('input[data-fn-check][value="chat"]');
  ruta.checked = true; ruta.dispatchEvent(new w.Event('change'));
  assert.equal(modal.querySelector('.ae-fn-slot[data-slot="chat"]').hidden, false, 'luckan ska öppnas under kortet');
  modal.querySelector('#saveAeAction').click();
  for (let i = 0; i < 60 && !w.__toaster.includes('Action sparad'); i++) await vanta(10);
  const sparad = JSON.parse(w.localStorage.getItem(F.KEY)).actions.find(a => a.name === 'Chattsvar');
  assert.ok(sparad, `actionen sparades inte: ${w.__toaster.join(' | ')}`);
  assert.equal(json(sparad.types), json(['chat']));
});

test('css: lagret är scopat och fälten följer designens mått', () => {
  const css = las('action-event.css');
  const del = css.slice(css.lastIndexOf('/*', css.indexOf('LILA DESIGNEN FÖR NY ACTION')));
  assert.ok(del.length > 1000, 'det lila lagret saknas i action-event.css');
  for (const [token, varde] of [['--ae-panel', '#241a30'], ['--ae-card', '#30243e'], ['--ae-border', '#62516f'], ['--ae-accent', '#a13bfa'], ['--ae-control-height', '44px']]) {
    assert.match(del, new RegExp(`${token}:${varde}`), `${token} ska vara ${varde}`);
  }
  const regler = del.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map(r => r.split('{')[0].trim()).filter(r => r && !r.startsWith('@'));
  // Dela på komman på nivå 0 — `:is(a,b)` är EN selektor.
  const delaSelektorer = r => { const ut = []; let djup = 0, bit = ''; for (const c of r) { if (c === '(') djup++; if (c === ')') djup--; if (c === ',' && !djup) { ut.push(bit); bit = '' } else bit += c } return ut.concat(bit) };
  for (const r of regler) {
    for (const sel of delaSelektorer(r)) assert.match(sel.trim(), /^\.ae-modal\.ae-lila/, `regeln "${sel.trim()}" läcker utanför formulären`);
  }
});
