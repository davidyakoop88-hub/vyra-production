'use strict';
// PANELRAMEN (vyra-panelram.js) mot den riktiga render/bind-kedjan i jsdom, med en TESTPOST.
//
// Registret har inga poster i PR 1, så i studion är ramen en no-op (det bevisas för en modell per
// familj i tests/browser/panelram-noop.browser.test.js). Här läggs en post för Heart Me Goal
// classic till inne i provet, och ramen måste då:
//   * bygga sektionerna i ordningen 1–7, med specens rubriker,
//   * aldrig bygga en tom sektion,
//   * bevara fokus och scrollposition när en kontroll ändras (input och change),
//   * låta "Återställ utseende" röra bara vald widget och bara fälten i utseendeFalt,
//   * inte röra något i overlayläget eller med flaggan vyra-panelram=av.
const test = require('node:test'), assert = require('node:assert/strict');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

test.after(closeAll);
const vanta = (ms = 30) => new Promise(r => setTimeout(r, ms));

// Testposten. Den blandar flyttade kontroller (legacyId, std-block) med sådana ramen bygger själv,
// och deklarerar dem MED FLIT i oordning — sektionernas ordning ska komma från numren.
const POST = `({
  typ: 'templateHeartGoal',
  modell: w => w.heartTheme || 'classic',
  galler: ['classic'],
  rubrik: () => 'Heart Me Goal',
  marke: () => 'Mål · Classic',
  ersatter: ['#heartCurrent'],
  kontroller: [
    { sektion: 6, typ: 'kryss', falt: 'provPuls', etikett: 'Puls' },
    { sektion: 2, typ: 'text', falt: 'templateTitle', etikett: 'Rubrik', legacyId: '#heartTitle' },
    { sektion: 2, typ: 'tal', falt: 'heartTarget', etikett: 'Mål', min: 1, max: 1000, enhet: 'st' },
    { sektion: 3, typ: 'std-position', utan: ['lager'] },
    { sektion: 5, typ: 'farg', falt: 'heartColor', etikett: 'Hjärtfärg', legacyId: '#heartColor' },
    { sektion: 4, typ: 'tal', falt: 'provTextstorlek', etikett: 'Textstorlek', min: 50, max: 200, enhet: '%' },
    { kalla: 'exempel', typ: 'text', falt: 'provNamn', etikett: 'Namn' },
    { sektion: 2, kalla: 'live', typ: 'text', etikett: 'Värdet kommer från TikTok.' },
    { sektion: 7, typ: 'std-aterstall' },
    { sektion: 4, typ: 'kryss', falt: 'provDold', etikett: 'Aldrig synlig', om: () => false },
  ],
  utseendeFalt: ['heartColor', 'heartTextColor', 'heartNumberColor'],
})`;

// Bara std-block som inte finns i den här panelen (ingen textgrupp, bakgrund eller intro laddad)
// och en kontroll vars villkor är falskt: sektion 4–6 har då ingenting att visa.
const TOM_POST = `({
  typ: 'templateHeartGoal',
  kontroller: [
    { sektion: 2, typ: 'text', falt: 'templateTitle', etikett: 'Rubrik', legacyId: '#heartTitle' },
    { sektion: 4, typ: 'std-text' },
    { sektion: 5, typ: 'std-bakgrund' },
    { sektion: 6, typ: 'std-entre' },
    { sektion: 6, typ: 'kryss', falt: 'provDold', etikett: 'Aldrig synlig', om: () => false },
    { sektion: 3, typ: 'tal', falt: 'provSaknas', legacyId: '#finnsInte', etikett: 'Saknas' },
  ],
})`;

function studio({ post = POST, url, ram = true, flagga = null } = {}) {
  const h = createDom({ url, state: { widgets: [], projectName: 'panelram' } });
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s); };
  run(`window.__fel = []; window.addEventListener('error', e => __fel.push(String(e.message)));`);
  if (flagga) run(`localStorage.setItem('vyra-panelram', ${JSON.stringify(flagga)})`);
  else run(`localStorage.removeItem('vyra-panelram'); localStorage.removeItem('vyra-panelram-oppna');`);
  h.load('overlay-sanitize.js');
  if (ram) { h.load('vyra-panelregister.js'); h.load('vyra-panelram.js'); }
  h.load('vyra-panelordning.js');
  // runtime-controls.js laddas sent i studion (media.js-svansen), alltså UTANPÅ ramen i
  // bind-kedjan. Dess PRESET-grupp kommer därför efter ramens synkrona avstämning och fångas av
  // mikrotasken — precis den väg som ska provas.
  h.load('runtime-controls.js');
  if (ram && post) run(`window.__post = VyraPanelregister.definiera(${post});`);
  run(`
    const a = VyraWidgets.create('catalog:heartgoal:classic'); a.id = 'w1'; a.x = 10; a.y = 20;
    const b = VyraWidgets.create('catalog:heartgoal:classic'); b.id = 'w2'; b.x = 400; b.y = 20;
    state.widgets.push(a, b); selected = 'w1'; view = 'editor'; render();`);
  h.run = run;
  h.$ = sel => h.document.querySelector(sel);
  h.panel = () => h.document.querySelector('.properties');
  h.sektioner = () => [...h.document.querySelectorAll('.properties [data-panelram-sektion]')];
  h.w = id => h.window.eval(`state.widgets.find(x => x.id === ${JSON.stringify(id)})`);
  return h;
}

const synlig = el => !el.closest('[hidden]');
const rubrik = sek => (sek.querySelector(':scope > h4, :scope > .pg-toggle').firstChild.textContent || '').trim();

test('ordningen är 1–7 med specens rubriker, oavsett deklarationsordning', async () => {
  const h = studio();
  await vanta();
  const S = h.window.VyraPanelregister.SEKTIONER;
  const sek = h.sektioner();
  assert.deepEqual(sek.map(s => s.dataset.sektion), ['1', '2', '3', '4', '5', '6', '7']);
  assert.deepEqual(sek.map(rubrik), [1, 2, 3, 4, 5, 6, 7].map(n => S[n]));
  assert.equal(h.panel().dataset.panelram, '1');
  assert.equal(h.panel().dataset.panelramWidget, 'w1');

  // Inga gamla grupper syns längre — de är parkerade i den dolda förvaringen.
  const synligaGrupper = [...h.document.querySelectorAll('.properties .property-group')].filter(synlig);
  assert.deepEqual(synligaGrupper.filter(g => !g.dataset.panelramSektion).map(g => g.className + ' ' + g.parentElement.className), [], 'en gammal grupp syns fortfarande');
  const forvaring = h.$('[data-panelram-forvaring]');
  assert.ok(forvaring && forvaring.hidden && forvaring.hasAttribute('inert'));

  // Sektionernas innehåll.
  const i = n => h.$(`[data-panelram-sektion="${n}"]`);
  assert.ok(i(1).querySelector('.pr-exempel #pr-provNamn'), 'exempeldata ska ligga i sektion 1');
  assert.ok(i(2).querySelector('#heartTitle'), 'Rubrik (legacyId) ska ha flyttats till Innehåll');
  assert.equal(h.$('#heartTitle').closest('label').firstChild.textContent.trim(), 'Rubrik');
  assert.equal(i(2).querySelector('#pr-heartTarget').closest('label').querySelector('b').textContent, '50 st');
  assert.ok(i(2).querySelector('.pr-live-rad'), 'LIVE-raden saknas');
  assert.ok(i(3).querySelector('#propX') && i(3).querySelector('#propY') && i(3).querySelector('#propWidth'));
  assert.equal(i(3).querySelector('#propLayer'), null, 'utan:["lager"] ska utelämna Lager');
  assert.ok(i(5).querySelector('#heartColor'));
  assert.equal(h.$('#heartColor').closest('label').textContent.trim(), 'Hjärtfärg');
  assert.ok(i(6).querySelector('#pr-provPuls'));
  assert.equal(h.$('#pr-provDold'), null, 'en kontroll med om → falskt ska inte byggas');

  // Sektion 7: Återställ utseende + mallknapparna, som runtime-controls.js lade till EFTER ramen.
  assert.ok(i(7).querySelector('#pr-aterstall-utseende'));
  assert.equal(i(7).querySelector('#runtimeSavePreset').textContent, 'Spara mall');
  assert.equal(i(7).querySelector('#runtimeLoadPreset').textContent, 'Ladda senaste mall');
  assert.ok(!synlig(h.$('#runtimeResetWidget')), 'gamla "Återställ widget" ska inte synas');

  // Rubrik, märke och ersatta testknappar.
  assert.equal(h.$('.properties-body > h3').textContent, 'Heart Me Goal');
  assert.equal(h.$('.properties-body > .template-badge').textContent, 'Mål · Classic');
  assert.equal(h.$('#heartCurrent'), null, 'en kontroll i ersatter ska tas bort på riktigt');

  // Sektionerna ligger före Ta bort-knappen; dolda id:n är inte dubblerade.
  assert.ok(sek.every(s => s.compareDocumentPosition(h.$('#del')) & 4));
  const ids = [...h.panel().querySelectorAll('[id]')].map(e => e.id);
  assert.deepEqual(ids.filter((x, n) => ids.indexOf(x) !== n), [], 'dubbla id:n i panelen');
  assert.equal(h.window.__fel.length, 0, h.window.__fel.join(' | '));
});

test('ingen tom sektion byggs', async () => {
  const h = studio({ post: TOM_POST });
  await vanta();
  // Bara Innehåll har något att visa; 3 (saknad legacy), 4–6 (std-block utan källa, om → falskt)
  // och 1/7 (inget deklarerat) får inte finnas alls.
  assert.deepEqual(h.sektioner().map(s => s.dataset.sektion), ['2']);
  for (const s of h.sektioner()) {
    const body = s.querySelector(':scope > .pg-body') || s;
    const rader = [...body.children].filter(e => !e.matches('h4'));
    assert.ok(rader.length > 0, `sektion ${s.dataset.sektion} är tom`);
  }
});

test('avstämningen är idempotent — ett andra pass rör ingen nod', async () => {
  const h = studio();
  await vanta();
  const mutationer = [];
  const obs = new h.window.MutationObserver(m => mutationer.push(...m));
  obs.observe(h.panel(), { childList: true, subtree: true, attributes: true, characterData: true });
  h.window.VyraPanelram.stamAv();
  h.window.VyraPanelram.stamAv();
  await vanta();
  obs.disconnect();
  assert.equal(mutationer.length, 0, `ett andra pass gav ${mutationer.length} mutationer`);
});

test('fokus och scroll bevaras när ett byggt reglage ändras', async () => {
  const h = studio();
  await vanta();
  h.panel().scrollTop = 300;
  const falt = h.$('#pr-heartTarget');
  falt.focus();

  // input: vyraLivePatch — värdet skrivs, bara siffran byts, panelen ritas INTE om.
  falt.value = '80';
  falt.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  assert.equal(h.w('w1').heartTarget, 80);
  assert.equal(h.$('#pr-heartTarget'), falt, 'input får inte rita om panelen');
  assert.equal(falt.closest('label').querySelector('b').textContent, '80 st');

  // change: save + vyraRenderKeepingPanel — panelen byggs om, fokus och scroll står kvar.
  falt.dispatchEvent(new h.window.Event('change', { bubbles: true }));
  await vanta();
  const nytt = h.$('#pr-heartTarget');
  assert.notEqual(nytt, falt, 'change ska rita om panelen');
  assert.equal(h.document.activeElement, nytt, 'fokus ska tillbaka till samma kontroll');
  assert.equal(h.panel().scrollTop, 300, 'scrollpositionen ska stå kvar');
  assert.equal(nytt.value, '80');
  assert.equal(nytt.closest('label').querySelector('b').textContent, '80 st');
  assert.ok(nytt.closest('[data-panelram-sektion="2"]'));
});

test('fokus bevaras även för en flyttad (legacy) kontroll', async () => {
  const h = studio();
  await vanta();
  h.panel().scrollTop = 120;
  const falt = h.$('#heartTitle');
  falt.focus();
  falt.value = 'NY RUBRIK';
  falt.dispatchEvent(new h.window.Event('input', { bubbles: true }));
  falt.dispatchEvent(new h.window.Event('change', { bubbles: true }));
  await vanta();
  assert.equal(h.w('w1').templateTitle, 'NY RUBRIK', 'det gamla bind-omslaget ska fortfarande binda fältet');
  assert.equal(h.document.activeElement && h.document.activeElement.id, 'heartTitle');
  assert.equal(h.panel().scrollTop, 120);
  assert.ok(h.document.activeElement.closest('[data-panelram-sektion="2"]'));
});

test('en stängd sektion förblir stängd efter omritning', async () => {
  const h = studio();
  await vanta();
  const sek3 = () => h.$('[data-panelram-sektion="3"]');
  assert.ok(sek3().classList.contains('open'), 'sektion 3 är öppen som standard');
  assert.ok(!h.$('[data-panelram-sektion="7"]').classList.contains('open'), 'sektion 7 är hopfälld');
  assert.equal(h.$('[data-panelram-sektion="2"] .pg-toggle'), null, 'sektion 2 är alltid öppen');
  sek3().querySelector('.pg-toggle').click();
  assert.ok(!sek3().classList.contains('open'));
  h.run('render()');
  await vanta();
  assert.ok(!sek3().classList.contains('open'), 'läget ska överleva render()');
});

test('Återställ utseende rör bara vald widget och bara utseendeFalt', async () => {
  const h = studio();
  await vanta();
  const fabrik = h.window.VyraWidgets.create('catalog:heartgoal:classic');
  Object.assign(h.w('w1'), { heartColor: '#111111', heartTextColor: '#222222', heartNumberColor: '#333333',
    templateTitle: 'MIN TITEL', heartTarget: 999, accent: '#abcdef' });
  Object.assign(h.w('w2'), { heartColor: '#444444', heartTextColor: '#555555' });
  const utseende = ['heartColor', 'heartTextColor', 'heartNumberColor'];
  const utan = w => JSON.stringify(Object.fromEntries(Object.entries(w).filter(([k]) => !utseende.includes(k))));
  const fore1 = utan(h.w('w1'));
  const fore2 = JSON.stringify(h.w('w2'));
  h.run('render()');
  await vanta();

  h.$('#pr-aterstall-utseende').click();
  await vanta();

  for (const f of utseende) assert.equal(h.w('w1')[f], fabrik[f], `${f} ska vara fabrikens värde`);
  assert.equal(utan(h.w('w1')), fore1, 'innehåll, position och andra fält får inte röras');
  assert.equal(h.w('w1').templateTitle, 'MIN TITEL');
  assert.equal(h.w('w1').accent, '#abcdef', 'ett fält utanför utseendeFalt får inte röras');
  assert.equal(JSON.stringify(h.w('w2')), fore2, 'en annan widget får inte röras');
});

test('Återställ utseende: API:t, katalognyckel som reserv och tom lista', async () => {
  const h = studio();
  await vanta();
  const P = h.window.VyraPanelram;
  const w1 = h.w('w1');
  // Äldre widget utan createdFrom: postens katalognyckel(w) används.
  delete w1.createdFrom;
  w1.heartColor = '#010101';
  assert.equal(P.aterstallUtseende(w1), false, 'utan createdFrom och utan katalognyckel görs inget');
  assert.equal(w1.heartColor, '#010101');
  h.window.__post.katalognyckel = () => 'catalog:heartgoal:classic';
  assert.equal(P.aterstallUtseende(w1), true);
  assert.equal(w1.heartColor, h.window.VyraWidgets.create('catalog:heartgoal:classic').heartColor);
  // En widget utan post: ingenting.
  const annan = { id: 'x', type: 'templateTopCoins', accent: '#123456' };
  assert.equal(P.aterstallUtseende(annan), false);
  assert.equal(annan.accent, '#123456');
});

test('utan post: ramen rör ingenting (samma panel som utan ramen)', async () => {
  const med = studio({ post: null });
  const utan = studio({ ram: false });
  await vanta();
  assert.equal(med.panel().dataset.panelram, undefined);
  assert.equal(med.$('[data-panelram-forvaring]'), null);
  assert.equal(med.panel().innerHTML, utan.panel().innerHTML);
});

test('flaggan vyra-panelram=av stänger av ramen', async () => {
  const h = studio({ flagga: 'av' });
  await vanta();
  assert.equal(h.window.VyraPanelram.ager(h.w('w1')), false);
  assert.equal(h.sektioner().length, 0);
  assert.equal(h.panel().dataset.panelram, undefined);
});

test('overlayläget: ramen äger ingenting och ritar ingenting', async () => {
  const h = studio({ url: 'https://vyralive.app/studio.html?overlay=1' });
  await vanta();
  assert.equal(h.window.VyraPanelram.ager(h.w('w1')), false);
  h.window.VyraPanelram.stamAv();
  assert.equal(h.sektioner().length, 0);
});

test('studio.html laddar registret och ramen före panelordningen, med cachebust', () => {
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'studio.html'), 'utf8');
  const plats = (fil, v) => html.indexOf(`<script src="${fil}?v=${v}"></script>`);
  // 20261019-2: ramen bygger kontrolltypen media med vyra-mediaval.js, registret validerar medietyp.
  // 20261019-3: ramen bygger Ärv färgschema och skriver enheter i talfältens etiketter; registret har
  // arv(w). Top Gifts poster (vyra-topgift-panel.js) laddas efter registret och testmotorn.
  const reg = plats('vyra-panelregister.js', '20261019-3'), ram = plats('vyra-panelram.js', '20261019-3');
  const ordning = plats('vyra-panelordning.js', '20261019-1'), mediaval = plats('vyra-mediaval.js', '20261019-1');
  const testspel = plats('vyra-testspel.js', '20261019-2'), topgift = plats('vyra-topgift-panel.js', '20261019-1');
  assert.ok(reg > 0 && ram > 0 && ordning > 0 && mediaval > 0, 'en av laddraderna saknas eller har fel bust');
  assert.ok(testspel > 0 && topgift > reg && topgift > testspel && topgift < ordning, 'Top Gifts poster laddas efter registret och testmotorn, före panelordningen');
  assert.ok(mediaval < ram, 'mediaväljaren laddas före ramen');
  // Ordningen är en beroendeordning: ramen läser registret, och panelordningens bind-omslag ska
  // ligga utanpå ramens så att den sorterar efter att ramen byggt sina sektioner.
  assert.ok(reg < ram && ram < ordning, 'fel laddordning: register → ram → panelordning');
  assert.ok(html.indexOf('vyra-bildfalt.js') < reg, 'ramen laddas efter vyra-bildfalt.js');
});
