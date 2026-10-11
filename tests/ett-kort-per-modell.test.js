'use strict';
// ETT KORT PER MODELL I OVERLAY-KATALOGEN (Davids beslut 2026-10-11: "varje modell vill jag ha for
// sig sjalv i samma katalogen").
//
// Fem samlingskort bar sina modeller som ett val inuti Anpassa: Top Streak Flip (12 modeller),
// Top Gifter Podium (12 HD-ramar + kodad ram), Goal Pro (8 designer), Like Fountain · Portal
// (9 paletter) och Follower Spotlight (3 teman). Nu ar varje modell ett eget kort med egen
// katalognyckel: basnyckeln + ':<modell>'. Basnyckeln utan modell finns kvar for sparade layouter
// och ger exakt samma widget som forut.
//
// Tva saker vaktas har:
//   1. Fabriken: varje modellnyckel forvaljer modellen i samma falt som Anpassa skriver, basnyckeln
//      ar oforandrad, och en felstavad modell kastar — tyst fall till en annan design vore en
//      renderingsbugg som ser ut som en designbugg.
//   2. Listorna ar SAMMA lista: fabrikens tabeller mot kalldatan (playground-assets.js,
//      playground-widgets.js, like-fountain-portal.js, media.js). En modell som laggs till i kallan
//      utan att fa ett kort ar precis det "ett kort inuti ett kort" som beslutet tog bort.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test.afterEach(async () => { await new Promise(setImmediate); closeAll(); });

function fabrik() {
  const h = createDom({ url: 'https://vyralive.app/studio.html', state: { widgets: [], projectName: 'kort' } });
  return h.window.VyraWidgets;
}

test('Top Streak Flip: modellnyckeln forvaljer modellen, basnyckeln ar oforandrad', () => {
  const W = fabrik();
  const w = W.create('catalog:pgstreak:frost-wings');
  assert.equal(w.type, 'templatePgStreak');
  lika(w.pg, { x: { model: 'frost-wings' } }, 'modellen ska ligga i pg.x.model, dar Anpassa skriver den');
  assert.equal(w.title, 'Top Streak Flip · Frost Sapphire');
  const bas = W.create('catalog:pgstreak');
  lika(bas.pg, {}, 'basnyckeln ska ge samma tomma pg som forut');
  assert.equal(bas.title, 'Top Streak Flip');
  assert.throws(() => W.create('catalog:pgstreak:finns-inte'), /Okänd modell/);
});

test('Top Gifter Podium: en nyckel per HD-ram plus den kodade ramen', () => {
  const W = fabrik();
  lika(W.create('catalog:pgpodium:royal-phoenix').pg, { frameImg: 'royal-phoenix' });
  assert.equal(W.create('catalog:pgpodium:royal-phoenix').title, 'Top Gifter Podium · Royal Phoenix');
  lika(W.create('catalog:pgpodium:none').pg, { frameImg: 'none' }, 'den kodade ramen ar ocksa ett kort');
  lika(W.create('catalog:pgpodium').pg, {});
  assert.throws(() => W.create('catalog:pgpodium:guldram'), /Okänd HD-ram/);
});

test('Goal Pro: en nyckel per design, skinnen stannar som val inuti', () => {
  const W = fabrik();
  lika(W.create('catalog:pggoal:3').pg, { x: { design: '3' } });
  assert.equal(W.create('catalog:pggoal:3').title, 'Goal Pro · Ring');
  lika(W.create('catalog:pggoal').pg, {});
  assert.throws(() => W.create('catalog:pggoal:all'), /Okänd design/, '"Alla (jamfor)" ar ett provlage, inte ett kort');
});

test('Like Fountain · Portal: en nyckel per palett, basnyckeln ger portalpaletten', () => {
  const W = fabrik();
  const w = W.create('catalog:likefountain:portal:fire');
  assert.equal(w.fountainDesign, 'portal');
  assert.equal(w.fountainPalette, 'fire');
  assert.equal(w.title, 'Like Fountain · Portal · Fire');
  assert.equal(W.create('catalog:likefountain:portal').fountainPalette, 'portal');
  assert.equal(W.create('catalog:likefountain').fountainDesign, undefined, 'den klassiska fontanen rors inte');
  assert.throws(() => W.create('catalog:likefountain:portal:custom'), /Okänd palett/, 'egna farger ar inget kort');
});

test('Follower Spotlight: en nyckel per tema med temats farg; basnyckeln bar inget followTheme', () => {
  const W = fabrik();
  const w = W.create('catalog:followeralert:ocean');
  assert.equal(w.followTheme, 'ocean');
  assert.equal(w.followColor, '#4fc3ff', 'temats farg ska folja med, som panelens temaval');
  assert.equal(w.title, 'New Follower Alert · Ocean');
  const bas = W.create('catalog:followeralert');
  assert.equal('followTheme' in bas, false, 'basnyckeln ska ge exakt det gamla objektet (snapshotprovet)');
  assert.equal(bas.followColor, '#ffd35d');
  assert.throws(() => W.create('catalog:followeralert:lila'), /Okänd tema/);
});

// ---- listorna ar samma lista ----------------------------------------------------------------------
function tabell(namn) {
  // Fabrikens tabeller ar inte exporterade; den enda vagen in ar att skapa nycklar. Vi laser i
  // stallet id:na ur kallan med samma regex som en manniska laser den: `'id': { label`.
  const src = las('widget-factory.js');
  const i = src.indexOf(`'${namn}': {`);
  assert.notEqual(i, -1, `tabellen ${namn} saknas i widget-factory.js`);
  const slut = src.indexOf('\n    },', i);
  return [...src.slice(i + namn.length + 4, slut).matchAll(/(?:'([^']+)'|\b([A-Za-z0-9_]+))\s*:\s*\{\s*label/g)].map(m => m[1] || m[2]).filter(Boolean);
}
// jsdom-objekt och provets objekt lever i olika realms; deepEqual ser "samma struktur, inte samma
// referens". Jamfor darfor som JSON.
const lika = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

test('streak-modellerna i fabriken ar samma som i playground-assets.js', () => {
  const h = createDom({ url: 'https://vyralive.app/studio.html', state: { widgets: [], projectName: 'kort' } });
  h.load('playground-assets.js');
  const ids = h.window.VYRA_PG.streak.map(m => m.id);
  assert.deepEqual(tabell('pgstreak.model').sort(), [...ids].sort());
  assert.equal(ids.length, 12);
});

test('podiets HD-ramar i fabriken ar samma som i playground-assets.js, plus den kodade ramen', () => {
  const h = createDom({ url: 'https://vyralive.app/studio.html', state: { widgets: [], projectName: 'kort' } });
  h.load('playground-assets.js');
  const ids = h.window.VYRA_PG.frames.map(f => f.id);
  assert.deepEqual(tabell('pgpodium.frame').sort(), ['none', ...ids].sort());
  assert.equal(ids.length, 12);
});

test('Goal Pros designer i fabriken ar samma som i playground-widgets.js (utan "all")', () => {
  const src = las('playground-widgets.js');
  const m = /k:"design",l:"Design",t:"select",o:\[((?:\["[^"]+","[^"]+"\],?)+)\]/.exec(src);
  assert.ok(m, 'hittar inte Goal Pros designlista');
  const ids = [...m[1].matchAll(/\["([^"]+)","[^"]+"\]/g)].map(x => x[1]).filter(id => id !== 'all');
  assert.deepEqual(tabell('pggoal.design').sort(), ids.sort());
  assert.equal(ids.length, 8);
});

test('portalens paletter i fabriken ar samma som PALETTNAMN i like-fountain-portal.js (utan custom)', () => {
  const src = las('like-fountain-portal.js');
  const m = /var PALETTNAMN = \{([\s\S]*?)\};/.exec(src);
  assert.ok(m, 'hittar inte PALETTNAMN');
  const ids = [...m[1].matchAll(/(\w+):\s*'/g)].map(x => x[1]).filter(k => k !== 'custom');
  assert.deepEqual(tabell('likefountain.palette').sort(), ids.sort());
  assert.equal(ids.length, 9);
});

test('Follower Spotlights teman i fabriken ar samma som followerAlertThemes i media.js, med samma farger', () => {
  const src = las('media.js');
  const m = /followerAlertThemes=\{([^}]*)\}/.exec(src);
  assert.ok(m, 'hittar inte followerAlertThemes');
  const teman = Object.fromEntries([...m[1].matchAll(/(\w+):'(#[0-9a-f]{6})'/g)].map(x => [x[1], x[2]]));
  assert.deepEqual(tabell('followeralert.theme').sort(), Object.keys(teman).sort());
  const W = fabrik();
  for (const [t, farg] of Object.entries(teman)) assert.equal(W.create('catalog:followeralert:' + t).followColor, farg, t);
});

// ---- katalogen ritar ett kort per modell ----------------------------------------------------------
test('playground-katalogen ritar 33 modellkort och inget samlingskort', () => {
  const h = createDom({ url: 'https://vyralive.app/studio.html?open=layout', state: { widgets: [], projectName: 'kort' } });
  h.run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  h.run('window.requestAnimationFrame=cb=>setTimeout(()=>cb(Date.now()),0);window.cancelAnimationFrame=id=>clearTimeout(id);');
  h.load('overlay-sanitize.js');
  h.load('playground-assets.js');
  // studio.js/media.js egna bind() vill ha en hel editor; har provas bara katalogplaceringen.
  h.run('bind=function(){};');
  h.load('playground-widgets.js');
  h.run(`view='overlay';document.querySelector('#view').innerHTML='<div class="widget-catalog"><section class="approved-streak-catalog"><h4>VYRA TOP STREAK</h4></section><section class="social-goal-template-section"><h4>GOALS · 10 RÖRLIGA DESIGNER</h4></section></div>';bind();`);
  const d = h.document;
  const kort = [...d.querySelectorAll('.widget-catalog [data-pg-create]')];
  assert.equal(kort.length, 33, '12 streak + 13 podium + 8 goal');
  assert.equal(kort.filter(b => b.dataset.pgCreate === 'streak').length, 12);
  assert.equal(kort.filter(b => b.dataset.pgCreate === 'podium').length, 13);
  assert.equal(kort.filter(b => b.dataset.pgCreate === 'goal').length, 8);
  assert.equal(new Set(kort.map(b => b.dataset.catalogKey)).size, 33, 'varje kort har en egen nyckel');
  for (const bas of ['catalog:pgstreak', 'catalog:pgpodium', 'catalog:pggoal'])
    assert.equal(d.querySelector(`[data-catalog-key="${bas}"]`), null, bas + ' ritas fortfarande som samlingskort');
  // Streakkorten bor i streaksektionen, goalkorten i goalsektionen, och rubriken raknar upp.
  assert.equal(d.querySelectorAll('section.approved-streak-catalog [data-pg-create="streak"]').length, 12);
  assert.match(d.querySelector('section.social-goal-template-section h4').textContent, /18 RÖRLIGA DESIGNER/);
  // Idempotent: en andra bind() lagger inte till dubbletter.
  h.run('bind();');
  assert.equal(d.querySelectorAll('.widget-catalog [data-pg-create]').length, 33);
  // Kortet skapar widgeten med sin modell.
  d.querySelector('[data-catalog-key="catalog:pgstreak:neon-circuit"]').click();
  // `state` ar en lexikal global i studio.js — nas via eval, inte via window.state.
  const widgets = h.window.eval('state').widgets;
  const skapad = widgets[widgets.length - 1];
  assert.equal(skapad.pg.x.model, 'neon-circuit');
  // Forhandsbilden per modellkort: streakens egen ramfil.
  const reg = h.window.VyraKatalogForhandsbilder;
  assert.ok(Array.isArray(reg) && reg.length, 'registret for forhandsbilder saknas');
  const bild = reg.map(f => f('catalog:pgstreak:neon-circuit')).find(Boolean);
  assert.match(bild, /streak-neon-circuit\.webp$/);
  assert.match(reg.map(f => f('catalog:pgpodium:royal-phoenix')).find(Boolean), /royal-phoenix-key\.webp$/);
});

test('Follower Spotlight och Like Fountain · Portal ritar sina kort i kallan: tre teman, nio paletter', () => {
  const media = las('media.js');
  const sektion = media.slice(media.indexOf('const followerAlertCatalog=bind'), media.indexOf('const followerAlertCatalog=bind') + 1800);
  for (const t of ['gold', 'ocean', 'blush']) assert.ok(sektion.includes(`'${t}'`), 'temat ' + t + ' saknar kort');
  assert.ok(sektion.includes("const catalogKey='catalog:followeralert:'+t"), 'korten bygger inte temanyckeln ur sin variant');
  assert.ok(sektion.includes('followerBtn.dataset.catalogKey=catalogKey'), 'nyckeln publiceras inte pa knappen');
  assert.ok(!sektion.includes("const catalogKey='catalog:followeralert'"), 'samlingskortet ritas fortfarande');
  const portal = las('like-fountain-portal.js');
  assert.ok(portal.includes("'catalog:likefountain:portal:' + pal"), 'portalen ritar inte ett kort per palett');
  assert.ok(portal.includes("k !== 'custom'"), 'egna farger ska inte vara ett kort');
});
