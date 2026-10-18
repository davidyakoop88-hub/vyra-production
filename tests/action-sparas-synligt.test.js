'use strict';
// F07: "Ny Action" -> Spara visade "Action sparad" INNAN den nya raden fanns i listan, och en
// sökning direkt efteråt gav ingen träff. Först efter att man navigerat bort och tillbaka syntes den.
//
// Rotorsaken: `VyraSessionState.writeActive` är asynkron — värdet landar först när låset är taget
// (session-state.js:310). action-event.js anropade den utan `await` och ritade om listan, stängde
// dialogen och visade toasten medan skrivningen fortfarande väntade på låset. `{ok:false}` lästes
// aldrig, så "Action sparad" visades även när ingenting sparades.
//
// Proven riggar därför ett lås som väntar på en TIMER innan callbacken körs. Med ett synkront lås
// hade felet varit osynligt, och ett prov som inte kan falla bevisar ingenting.
const test = require('node:test'), assert = require('node:assert/strict');
const F = require('./helpers/flikar.js');

const living = [];
test.after(() => { while (living.length) living.pop().close() });
const vanta = ms => new Promise(r => setTimeout(r, ms));

const action = (o = {}) => ({ id: 'a1', name: 'Fyrverkeri', types: ['overlay'], duration: 1,
  cooldown: 0, config: { widget: 'Gift Fireworks' }, scene: { number: 1 }, ...o });

async function studio({ actions = [action()], events = [] } = {}) {
  const lager = F.delatLager();
  const bas = lager.lasHanterare;
  // Låset tas först efter en timer — som i webbläsaren, där en annan flik kan hålla det.
  lager.lasHanterare = { ...bas, async request(namn, opt, cb) { await vanta(15); return bas.request(namn, opt, cb) } };
  lager.setItem(F.KEY, JSON.stringify({ actions, events }));
  const w = await F.fonster({ namn: 'studio', lager, skrivbar: true, actions, events,
    extraFiler: ['overlay-sanitize.js'] });   // VyraSafe, som den avancerade eventpanelen behöver
  living.push(w);
  const flik = w.document.createElement('button');
  flik.dataset.extra = 'actions'; flik.className = 'active';
  w.document.body.append(flik);
  w.VyraActionEvent.refresh();
  // Fångar sidans läge I DET ÖGONBLICK toasten visas — det är då streamern tittar.
  w.__vidToast = [];
  w.toast = m => {
    w.__toaster.push(String(m));
    w.__vidToast.push({ text: String(m),
      rader: [...w.document.querySelectorAll('#view [data-action-row]')].map(r => r.textContent),
      eventRader: w.document.querySelectorAll('#view [data-event-row]').length,
      modal: !!w.document.querySelector('.ae-modal') });
  };
  return w;
}

function nyAction(w, namn) {
  w.document.querySelector('#newAeAction').click();
  const modal = w.document.querySelector('.ae-modal');
  modal.querySelector('#aeActionName').value = namn;
  const ruta = modal.querySelector('input[data-fn-check]');
  ruta.checked = true; ruta.dispatchEvent(new w.Event('change'));
  return modal.querySelector('#saveAeAction');
}
// Räknar skrivningar till action-nyckeln: sista-skrivningen-vinner kan dölja en dubblett i lagret.
function raknaSkrivningar(w) {
  const org = w.VyraSessionState.writeActive, rakna = { n: 0 };
  w.VyraSessionState.writeActive = (k, v) => { if (k === F.KEY) rakna.n++; return org(k, v) };
  return rakna;
}
const sparat = w => JSON.parse(w.localStorage.getItem(F.KEY));
const klar = async w => { for (let i = 0; i < 40 && !w.__vidToast.length; i++) await vanta(10); await vanta(40) };

test('ny action: raden finns i listan när "Action sparad" visas, och sökningen hittar den', async () => {
  const w = await studio();
  nyAction(w, 'Konfettiregn').click();
  await klar(w);
  const t = w.__vidToast.find(x => x.text === 'Action sparad');
  assert.ok(t, `ingen "Action sparad": ${JSON.stringify(w.__toaster)}`);
  assert.ok(t.rader.some(r => r.includes('Konfettiregn')), `raden saknades när toasten visades: ${JSON.stringify(t.rader)}`);
  assert.equal(t.modal, false, 'dialogen var kvar efter lyckad sparning');

  const sok = w.document.querySelector('#aeActionSearch');
  sok.value = 'konfetti'; sok.dispatchEvent(new w.Event('input'));
  const synliga = [...w.document.querySelectorAll('[data-action-row]')].filter(r => !r.hidden);
  assert.equal(synliga.length, 1, 'sökningen direkt efter sparningen gav inte exakt en träff');
  assert.match(synliga[0].textContent, /Konfettiregn/);
});

test('ny action: writeActive {ok:false} ger fel, ingen ny rad och ingen "Action sparad"', async () => {
  const w = await studio();
  w.VyraSessionState.writeActive = async () => { await vanta(10); return { ok: false, reason: 'lost-ownership' } };
  nyAction(w, 'Konfettiregn').click();
  await klar(w);
  assert.ok(!w.__toaster.includes('Action sparad'), 'toasten påstod att en vägrad skrivning sparades');
  assert.ok(w.__toaster.includes('Actionen kunde inte sparas'), `inget fel visades: ${JSON.stringify(w.__toaster)}`);
  assert.ok(![...w.document.querySelectorAll('[data-action-row]')].some(r => r.textContent.includes('Konfettiregn')),
    'en rad som aldrig sparades visades i listan');
  const modal = w.document.querySelector('.ae-modal');
  assert.ok(modal, 'dialogen stängdes och det ifyllda gick förlorat');
  assert.equal(modal.querySelector('#aeActionName').value, 'Konfettiregn');
  assert.equal(modal.querySelector('#saveAeAction').disabled, false, 'spara-knappen återställdes inte');
});

test('ny action: dubbelklick på Spara under väntan ger EN post', async () => {
  const w = await studio();
  const knapp = nyAction(w, 'Konfettiregn');
  // onclick direkt: ett disabled-skydd i webbläsaren räcker inte om koden själv inte vaktar.
  const skriv = raknaSkrivningar(w);
  knapp.onclick(); knapp.onclick();
  await klar(w); await vanta(80);
  const poster = sparat(w).actions.filter(a => a.name === 'Konfettiregn');
  assert.equal(poster.length, 1, `dubbelklick gav ${poster.length} poster`);
  assert.equal(w.__toaster.filter(x => x === 'Action sparad').length, 1);
  assert.equal(skriv.n, 1, `dubbelklick gav ${skriv.n} skrivningar`);
});

function nyttEvent(w) {
  w.document.querySelector('#newAeEventCard').click();
  const modal = w.document.querySelector('.ae-modal');
  // Gåva och chattkommando kräver ett värde; välj en trigger som inte gör det.
  const radio = [...modal.querySelectorAll('[name=aeAdvancedTrigger]')].find(r => !['gift', 'chatCommand'].includes(r.value));
  if (radio) { radio.checked = true; radio.dispatchEvent(new w.Event('change')) }
  // Event väljer vilken Action som ska köras — Actionen finns redan (a1).
  const alla = modal.querySelector('#aeAllActions');
  if (alla) [...alla.options].forEach(o => { o.selected = o.value === 'a1' });
  return modal.querySelector('#saveAeEvent');
}

test('nytt event: raden finns när toasten visas', async () => {
  const w = await studio();
  nyttEvent(w).click();
  await klar(w);
  const t = w.__vidToast.find(x => x.text === 'Event kopplat till Action');
  assert.ok(t, `ingen bekräftelse: ${JSON.stringify(w.__toaster)}`);
  assert.equal(t.eventRader, 1, 'eventraden saknades när toasten visades');
  assert.equal(sparat(w).events.length, 1);
});

test('nytt event: {ok:false} ger fel och lämnar dialogen öppen', async () => {
  const w = await studio();
  w.VyraSessionState.writeActive = async () => { await vanta(10); return { ok: false, reason: 'not-writable' } };
  nyttEvent(w).click();
  await klar(w);
  assert.ok(!w.__toaster.includes('Event kopplat till Action'));
  assert.ok(w.__toaster.includes('Eventet kunde inte sparas'), `inget fel visades: ${JSON.stringify(w.__toaster)}`);
  assert.equal(w.document.querySelectorAll('[data-event-row]').length, 0);
  assert.ok(w.document.querySelector('.ae-modal'), 'dialogen stängdes');
});

test('nytt event: dubbelklick ger EN post', async () => {
  const w = await studio();
  const knapp = nyttEvent(w);
  const skriv = raknaSkrivningar(w);
  knapp.onclick(); knapp.onclick();
  await klar(w); await vanta(80);
  assert.equal(sparat(w).events.length, 1, 'dubbelklick gav två event');
  assert.equal(skriv.n, 1, `dubbelklick gav ${skriv.n} skrivningar`);
});
