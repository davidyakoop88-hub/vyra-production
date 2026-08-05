'use strict';
// En gavovaljare, inte tva.
//
// media.js hade TRE bind-omslag runt samma knapp:
//
//   604  pagedGiftPickerBind        markt om + kopplar till openPagedGiftPicker (alla gifts, sidor)
//   606  campaignPickerBind         SKAPAR knappen + en egen inbyggd modal med 150 gifts
//   608  finalPagedGiftPickerBind   byte-identisk med 604
//
// Omslagen kor innerst-forst, sa ordningen ar 604 -> 606 -> 608. 608 kor sist och vinner alltid:
// den inbyggda 150-modalen som 606 kopplar pa hinner aldrig anvandas, och 604 gor exakt samma
// arbete som 608 gjorde en rad senare.
//
// Anvandaren fick alltsa redan den sidindelade valjaren med alla gifts. Det som fanns var dod
// dubbelkod: en modal som byggs och skrivs over, och ett omslag som finns i tva exemplar. Tva
// vagar in i samma knapp ar ocksa tva stallen dar nasta andring kan hamna i fel.
//
// De strukturella testerna nedan ar ROTTA nu. De beteendemassiga ar VAKTER - de passerar bade
// fore och efter, och ska gora det, for beteendet ska inte andras.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

test.after(closeAll);

const forekomster = (text, bit) => text.split(bit).length - 1;

// ---- strukturen: en implementation, en inkoppling -------------------------------------------------
test('bara en gavovaljarmodal byggs i media.js', () => {
  const antal = forekomster(SOURCE, "className='gift-picker-modal'");

  assert.equal(antal, 1,
    `${antal} olika modaler byggs — den ena skrivs over av den andra och ar dod kod`);
});

test('knappen kopplas till valjaren pa exakt ett stalle', () => {
  // Pilen ar med med flit: 'openPagedGiftPicker(w,' matchar aven funktionens EGEN definition, och
  // ett test som raknar den kan aldrig na noll kopplingar. Den forsta versionen av det har testet
  // sa "3 ganger" av just det skalet.
  const antal = forekomster(SOURCE, '=>openPagedGiftPicker(');

  assert.equal(antal, 1,
    `knappen kopplas ${antal} ganger; tva identiska omslag gor samma arbete efter varandra`);
});

test('inget omslag ar kvar i dubbel uppsattning', () => {
  const dubbletter = ['pagedGiftPickerBind', 'finalPagedGiftPickerBind']
    .filter(namn => SOURCE.includes('const ' + namn + '=bind'));

  assert.deepEqual(dubbletter, [],
    `dessa bind-omslag gor samma sak: ${dubbletter.join(', ')}`);
});

// ---- beteendet: vakter, ska passera bade fore och efter --------------------------------------------
function panel(giftCount) {
  const w = VyraWidgets.create('catalog:giftcampaign:neon:landscape');
  w.id = 'c1'; w.x = 10; w.y = 10; w.giftCount = giftCount;
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout',
    state: { widgets: [w], projectName: 'picker' } });
  h.load('overlay-sanitize.js');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`state.widgets.length=0;state.widgets.push(${JSON.stringify(w)});selected='c1';view='editor';`);
  run(`document.querySelector('#view').innerHTML='<div class="editor-shell"><div class="canvas">'
    +wh(state.widgets[0])+'</div><div class="properties">'+props()+'</div></div>';bind();`);
  return { h, run };
}

test('forsta klicket ger den sidindelade valjaren over hela listan', () => {
  const { h, run } = panel(4);
  run(`
    window.__p = {};
    try {
      document.querySelector('.open-gift-picker').onclick();
      const modal = document.querySelector('.gift-picker-modal');
      __p.sidfot = !!modal.querySelector('.gift-picker-pages');
      __p.status = modal.querySelector('footer strong').textContent;
      __p.helaListan = allCampaignGiftChoices.length;
    } catch (e) { __p.fel = e.message }
  `);
  const p = h.window.__p || {};

  assert.ok(p.sidfot, `ingen sidindelning i modalen — det ar den avkortade varianten (${p.fel || ''})`);
  assert.match(p.status, new RegExp(p.helaListan + ' gifts'),
    `modalen sa "${p.status}" men listan har ${p.helaListan} gifts`);
});

test('knappen ser likadan ut hur manga ganger bind an kort', () => {
  const { h, run } = panel(4);
  run(`window.__t1 = document.querySelector('.open-gift-picker').textContent; bind(); bind();
       window.__t2 = document.querySelector('.open-gift-picker').textContent;`);

  assert.equal(h.window.__t1, h.window.__t2,
    `knapptexten andrades fran "${h.window.__t1}" till "${h.window.__t2}" bara av att bind kordes om`);
});

test('ett val byter fortfarande bild och namn pa ratt gava', () => {
  const { h, run } = panel(6);
  run(`
    window.__v = {};
    try {
      document.querySelectorAll('.open-gift-picker')[5].onclick();
      const val = document.querySelectorAll('.gift-picker-modal section button');
      val[2].onclick();
      __v.bild = state.widgets[0].giftImage5;
      __v.namn = state.widgets[0].giftName5;
      __v.rorInteAndra = state.widgets[0].giftImage0;
    } catch (e) { __v.fel = e.message }
  `);
  const v = h.window.__v || {};

  assert.ok(v.bild && v.bild.startsWith('assets/gifts/events/'),
    `giftImage5 blev ${JSON.stringify(v.bild)} ${v.fel || ''}`);
  assert.ok(v.namn, 'namnet foljde inte med');
  assert.equal(v.rorInteAndra, undefined, 'valet skrev pa fel gava ocksa');
});
