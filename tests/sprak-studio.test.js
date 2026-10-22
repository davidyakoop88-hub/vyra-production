'use strict';
// SVENSKA + ENGELSKA I STUDIONS CHROME (vyra-sprak.js steg 2, 2026-10-22).
//
// Kraven:
//   * studio.html laddar språkfilerna (den publika ordlistan, studions ordlista, motorn) och har en
//     SV/EN-plats i sidhuvudet,
//   * OVERLAYLÄGET får ingen VyraLang alls — sändningens språk är steg 3 — och Guardian Emblems
//     sprak(w) beter sig där exakt som förut (navigator.language),
//   * widgetinnehållet rörs inte: det sidan undantar med data-sprak-utom (duken, widgetarna,
//     panelen, katalogens kort) står kvar på svenska, även när det ritas efteråt,
//   * fält användaren skriver i får sin placeholder översatt men aldrig sin text,
//   * ett skript som skriver tillbaka sin svenska text ("bara vid ändring") får inte låsa sidan,
//   * tillbaka till svenska återställer, även #title som studion härleder ur en översatt etikett.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const { KALLKOD_MONSTER } = require('./fixtures/sprak-ordlista.js');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const vanta = w => new Promise(r => w.setTimeout(r, 0));

function sida(html, { sok = '', lagrat = null, sprakkod = 'en-US', skript = [] } = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost/studio.html' + sok, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w.navigator, 'language', { value: sprakkod, configurable: true });
  if (lagrat) w.localStorage.setItem('vyra-sprak', lagrat);
  w.eval(las('vyra-sprak-en.js'));
  w.eval(las('vyra-sprak-studio-en.js'));
  w.eval(las('vyra-sprak.js'));
  for (const f of skript) w.eval(las(f));
  return w;
}

const STUDIO_HTML = las('studio.html');
const UTOM = (STUDIO_HTML.match(/data-sprak-utom="([^"]+)"/) || [])[1] || '';

// En liten studio: navet, sidhuvudet med #title, och en duk med en widget som bär samma ord som
// chrome-knappen bredvid. Ordet "Bakgrund" står i ordlistan — det är hela poängen.
const MINI = `<!doctype html><html lang="sv" data-sprak-utom="${UTOM}"><head><title>VYRA</title></head><body>
  <aside><nav><span class="nav-section-label">Kärna</span>
    <button data-view="home"><span>Översikt</span></button>
    <button data-view="settings"><span>Inställningar</span></button></nav></aside>
  <main><header><small id="crumb">VYRA / ÖVERSIKT</small><h1 id="title" data-sprak-tillbaka>God kväll, Lisa</h1>
    <div class="head-actions"><span class="studio-sprakval" data-sprakval></span><button id="bg">Bakgrund</button></div></header>
    <section id="view"><div class="editor-shell"><div class="canvas"><div class="widget"><b>Bakgrund</b><small>Stäng</small></div></div>
      <div class="properties"><label>Bakgrund</label></div>
      <textarea placeholder="Vad hände, vad förväntade du dig och hur kan vi återskapa det?">Stäng</textarea></div></section></main>
</body></html>`;

test('studio.html laddar språkfilerna i rätt ordning, före sessionen, och har en SV/EN-plats', () => {
  assert.match(STUDIO_HTML,
    /<script src="vyra-sprak-en\.js\?v=\d{8}-\d+"><\/script><script src="vyra-sprak-studio-en\.js\?v=\d{8}-\d+"><\/script><script src="vyra-sprak\.js\?v=\d{8}-\d+"><\/script>/);
  assert.ok(STUDIO_HTML.indexOf('vyra-sprak.js?v=') < STUDIO_HTML.indexOf('session-state.js?v='),
    'språkfilerna ska ligga före studions skript, så att inloggningsgrinden översätts från start');
  assert.match(STUDIO_HTML, /<div class="head-actions">\s*<span class="studio-sprakval" data-sprakval><\/span>/);
  assert.match(STUDIO_HTML, /<h1 id="title" data-sprak-tillbaka>/);
  for (const sel of ['.canvas', '.widget', '.properties > :not(.panel-title):not(.properties-empty)', '.owg-thumb', '.widget-catalog h4']) {
    assert.ok(UTOM.split(',').map(s => s.trim()).includes(sel), `data-sprak-utom saknar ${sel}`);
  }
});

test('overlayläget får ingen VyraLang, och Guardian Emblem läser navigator som förut', async () => {
  const w = sida(MINI, { sok: '?overlay=1', lagrat: 'sv', sprakkod: 'en-US', skript: ['guardian-emblem-fas.js'] });
  await vanta(w);
  assert.equal(w.VyraLang, undefined, 'VyraLang ska inte finnas i OBS-utgången');
  assert.equal(w.document.documentElement.lang, 'sv');
  assert.equal(w.document.querySelector('#bg').textContent, 'Bakgrund');
  assert.equal(w.VyraGuardianEmblemFas.sprak({}), 'en',
    'utan VyraLang ska emblemet följa navigator.language precis som före steg 2');
  const w2 = sida(MINI, { sok: '?overlay=1&lang=en', sprakkod: 'sv-SE', skript: ['guardian-emblem-fas.js'] });
  await vanta(w2);
  assert.equal(w2.VyraLang, undefined);
  assert.equal(w2.VyraGuardianEmblemFas.sprak({}), 'sv');
  assert.equal(w2.localStorage.getItem('vyra-sprak'), null, '?lang i en overlaylänk ska inte ändra studions val');
});

test('engelska översätter chrome men lämnar duken, widgetarna och panelen orörda', async () => {
  const w = sida(MINI, { lagrat: 'en' });
  await vanta(w);
  const d = w.document;
  assert.equal(d.documentElement.lang, 'en');
  assert.equal(d.querySelector('[data-view="home"] span').textContent, 'Overview');
  assert.equal(d.querySelector('[data-view="settings"] span').textContent, 'Settings');
  assert.equal(d.querySelector('.nav-section-label').textContent, 'Core');
  assert.equal(d.querySelector('#crumb').textContent, 'VYRA / OVERVIEW');
  assert.equal(d.querySelector('#title').textContent, 'Good evening, Lisa');
  assert.equal(d.querySelector('#bg').textContent, 'Background');
  assert.equal(d.querySelector('.widget b').textContent, 'Bakgrund', 'widgetens text är sändningstext (steg 3)');
  assert.equal(d.querySelector('.widget small').textContent, 'Stäng');
  assert.equal(d.querySelector('.properties label').textContent, 'Bakgrund', 'panelen är steg 3');
  const ta = d.querySelector('textarea');
  assert.equal(ta.value, 'Stäng', 'det användaren skrivit ska aldrig översättas');
  assert.equal(ta.getAttribute('placeholder'), 'What happened, what did you expect and how can we reproduce it?');

  // Det som ritas efteråt: en ny widget på duken och en ny chrome-knapp.
  const ny = d.createElement('div');
  ny.className = 'widget';
  ny.innerHTML = '<span>Bakgrund</span>';
  d.querySelector('.canvas').append(ny);
  const knapp = d.createElement('button');
  knapp.textContent = 'Spara';
  d.querySelector('.head-actions').append(knapp);
  await vanta(w);
  assert.equal(ny.textContent, 'Bakgrund');
  assert.equal(knapp.textContent, 'Save');
});

test('SV/EN-väljaren i sidhuvudet byter språk, delar valet med de publika sidorna och återställer', async () => {
  const w = sida(MINI);
  await vanta(w);
  const d = w.document;
  const knappar = [...d.querySelectorAll('.studio-sprakval button[data-sprak]')];
  assert.deepEqual(knappar.map(b => b.textContent), ['SV', 'EN']);
  assert.equal(knappar[0].getAttribute('aria-pressed'), 'true');
  knappar[1].click();
  assert.equal(w.localStorage.getItem('vyra-sprak'), 'en', 'samma nyckel som index.html');
  assert.equal(d.querySelector('#bg').textContent, 'Background');

  // Studion skriver #title ur den (nu engelska) navetiketten — som i render() — och sedan byter
  // användaren tillbaka. Titeln ska bli svensk igen trots att "Settings" blev nodens original.
  d.querySelector('#title').textContent = d.querySelector('[data-view="settings"] span').textContent;
  await vanta(w);
  assert.equal(d.querySelector('#title').textContent, 'Settings');
  knappar[0].click();
  assert.equal(d.querySelector('#title').textContent, 'Inställningar');
  assert.equal(d.querySelector('[data-view="settings"] span').textContent, 'Inställningar');
  assert.equal(d.querySelector('#bg').textContent, 'Bakgrund');
  assert.equal(d.querySelector('#crumb').textContent, 'VYRA / ÖVERSIKT');
  assert.equal(d.documentElement.lang, 'sv');
});

test('ett skript som skriver tillbaka sin svenska text låser inte sidan', async () => {
  const w = sida(MINI, { lagrat: 'en' });
  await vanta(w);
  const d = w.document;
  const envis = d.createElement('button');
  d.querySelector('.head-actions').append(envis);
  // Samma mönster som stage-background.js hade: "skriv bara vid ändring", men mot svenskan.
  let varv = 0;
  new w.MutationObserver(() => { if (envis.textContent !== 'Bakgrund') { varv++; envis.textContent = 'Bakgrund'; } })
    .observe(envis, { childList: true, characterData: true, subtree: true });
  w.console.warn = () => {};
  envis.textContent = 'Bakgrund';
  for (let i = 0; i < 5; i++) await vanta(w);
  assert.ok(varv < 1000, `slingan gick ${varv} varv`);
  assert.equal(envis.textContent, 'Bakgrund', 'elementet lämnas på svenska när det slåss om texten');
  const annan = d.createElement('button');
  annan.textContent = 'Spara';
  d.querySelector('.head-actions').append(annan);
  await vanta(w);
  assert.equal(annan.textContent, 'Save', 'resten av sidan fortsätter att översättas');

  // Ritas elementet om (nytt element, samma tagg, klass och text) ska slingan inte gå om från noll.
  envis.remove();
  let nyaVarv = 0;
  const ny = d.createElement('button');
  new w.MutationObserver(() => { if (ny.textContent !== 'Bakgrund') { nyaVarv++; ny.textContent = 'Bakgrund'; } })
    .observe(ny, { childList: true, characterData: true, subtree: true });
  d.querySelector('.head-actions').append(ny);
  ny.textContent = 'Bakgrund';
  for (let i = 0; i < 5; i++) await vanta(w);
  assert.equal(nyaVarv, 0, 'ett element med en bevisad slingas form ska lämnas i fred direkt');
  assert.equal(ny.textContent, 'Bakgrund');
});

test('svenska är standard i studion och kostar ingen observer', async () => {
  const w = sida(MINI, { sprakkod: 'en-US' });
  await vanta(w);
  assert.equal(w.VyraLang.current(), 'sv');
  const b = w.document.createElement('button');
  b.textContent = 'Spara';
  w.document.body.append(b);
  await vanta(w);
  assert.equal(b.textContent, 'Spara');
});

test('studions ordlista: mönster med värden och inga förbjudna engelska fraser', () => {
  const w = sida(MINI, { lagrat: 'en' });
  const t = w.VyraLang.t;
  assert.equal(t('3 saker sparade i din live'), '3 items saved in your live');
  assert.equal(t('1 sak sparad i din live'), '1 item saved in your live');
  assert.equal(t('Ansluten som Lisa'), 'Connected as Lisa');
  assert.equal(t('Provperioden · 2 dagar kvar'), 'Trial · 2 days left');
  assert.equal(t('Sparat i molnet ✓ · syns i OBS · 19:33'), 'Saved in the cloud ✓ · shows in OBS · 19:33');
  assert.equal(t('Spela Follow Cheer'), 'Play Follow Cheer');
  assert.equal(t('Spela paketets klipp'), 'Spela paketets klipp', 'en svensk mening ska inte halvöversättas');
  // Produktnamnen står kvar.
  for (const namn of ['Sound Alerts', 'TTS Chat', 'Action & Event', 'Top Gift', 'Gift Campaign', 'Battle MVP', 'Goal Pro'])
    assert.equal(t(namn), namn);
  const { text } = w.VyraSprakEn;
  for (const [sv, en] of Object.entries(text)) {
    assert.equal(sv, sv.trim().replace(/\s+/g, ' '), `nyckeln ${JSON.stringify(sv)} måste vara hopslagen`);
    for (const m of KALLKOD_MONSTER) assert.ok(!m.re.test(en), `${JSON.stringify(en)} träffar sprakvaktens ${m.namn}`);
  }
});
