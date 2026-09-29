'use strict';
// ETT GAMMALT EVENT FÅR INTE TAPPA SIN ACTION NÄR MAN ÖPPNAR DET.
//
// Fram till 2026-09-16 sparade den enkla eventmodalen EN action i `actionId`. Listorna
// `allActionIds`/`randomActionIds` fanns bara om man gått via den avancerade panelen. När
// eventsidan byggdes om mot TikFinity-facit läste den nya modalen bara listorna — och ett gammalt
// event öppnades därför med båda tomma.
//
// Uppmätt i Chrome: `#aeAllActions option:checked` var `[]` för ett event med `actionId:'gammal1'`.
// Trycker kunden Spara stoppas det av "Välj minst en Action" och en koppling som redan fungerade
// måste väljas om för hand. Ingen data försvann, men varje befintligt event blev omöjligt att
// redigera utan att göra om jobbet.
//
// Provet monterar den riktiga panelen via eventregistret — samma anrop action-event.js gör — i
// stället för att läsa källkoden efter en sträng. En vakt som bara letar efter `allaValda` hade
// varit grön även om fältet slutat användas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROT, f), 'utf8');
const levande = [];
test.after(() => { while (levande.length) levande.pop().window.close() });

const ACTIONS = [
  { id: 'gammal1', name: 'Gammal fyrverkeri' },
  { id: 'gammal2', name: 'Gammal poang' },
  { id: 'gammal3', name: 'Tredje' }
];

function montera(event) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://vyralive.app/studio.html', runScripts: 'dangerously' });
  levande.push(dom);
  const { window } = dom;
  // VyraSafe ägs av overlay-sanitize.js. Panelen använder den för varje användarnamn och id, så
  // utan den kastar mount() — och provet hade mätt riggen i stället för koden.
  window.VyraSafe = { text: v => String(v == null ? '' : v), url: v => String(v == null ? '' : v) };
  const leverantorer = [];
  window.VyraEventFields = { register: p => leverantorer.push(p) };

  const s = window.document.createElement('script');
  s.textContent = las('action-event-advanced.js');
  window.document.body.append(s);

  const modal = window.document.createElement('div');
  modal.className = 'ae-modal ae-modal-event';
  modal.innerHTML = '<div class="ae-event-slot"></div><button id="saveAeEvent"></button>';
  window.document.body.append(modal);

  const panel = leverantorer.find(p => typeof p.mount === 'function');
  assert.ok(panel, 'action-event-advanced.js registrerade ingen eventpanel');
  panel.mount(modal, event, { actions: ACTIONS });
  return { window, modal, panel };
}

const valda = modal => [...modal.querySelectorAll('#aeAllActions option')]
  .filter(o => o.selected).map(o => o.value);

// ARRAYER FRÅN JSDOM TILLHÖR JSDOMS REALM.
//
// `collect()` bygger sin lista med spread INNE i fönstret, så resultatet är en array skapad av
// jsdoms `Array` — inte Nodes. `assert.deepEqual` i strict-läge jämför prototyper och faller på
// två listor som innehåller exakt samma strängar. Första versionen av provet rapporterade därför
// "kopplingen försvann i collect()" och skrev ut `[ 'gammal1' ]` som faktiskt värde.
//
// Kontrollmätningen i riktig Chrome (bakåtkompatibilitetskörningen) hade redan visat att
// sparningen fungerade, så felet låg i riggen. `Array.from` här flyttar tillbaka listan till
// Nodes realm; själva jämförelsen är oförändrad.
const somNodeArray = v => Array.from(v || []);

test('ett gammalt event med bara actionId får sin action förvald', () => {
  const { modal } = montera({ id: 'gev1', trigger: 'gift', condition: 'Rose', actionId: 'gammal1', enabled: true });
  assert.deepEqual(valda(modal), ['gammal1'],
    'den gamla kopplingen lyftes inte in i "Kör alla dessa Actions" — kunden tvingas välja om den');
});

test('och den överlever en sparning utan ändringar', () => {
  const { modal, panel } = montera({ id: 'gev1', trigger: 'gift', condition: 'Rose', actionId: 'gammal1', enabled: true });
  assert.equal(panel.validate(modal), null, 'sparningen stoppades av en validering');
  const ut = panel.collect(modal);
  assert.deepEqual(somNodeArray(ut.allActionIds), ['gammal1'], 'kopplingen försvann i collect()');
  assert.equal(ut.triggerValue, 'Rose', 'villkoret följde inte med från `condition`');
  assert.equal(ut.advancedTrigger, 'gift', 'triggern lästes inte ur det gamla `trigger`-fältet');
});

test('ett nytt event med listor rör inte fallbacken', () => {
  // Kontrollen: utan den här skulle en fallback som ALLTID skriver `[actionId]` se korrekt ut.
  const { modal } = montera({ id: 'nytt', advancedTrigger: 'likes', triggerValue: '15',
    allActionIds: ['gammal2', 'gammal3'], randomActionIds: [], actionId: 'gammal2', enabled: true });
  assert.deepEqual(valda(modal), ['gammal2', 'gammal3'],
    'fallbacken skrev över en riktig lista med det enda gamla id:t');
});

test('ett event helt utan action ger tom lista, inte ett påhittat val', () => {
  const { modal } = montera({ id: 'tomt', advancedTrigger: 'follow', enabled: true });
  assert.deepEqual(valda(modal), [], 'panelen valde en action som eventet aldrig haft');
});
