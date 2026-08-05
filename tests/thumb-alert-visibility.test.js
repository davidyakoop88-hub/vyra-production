'use strict';
// Miniatyrerna ritas nu — men alert-widgetarna syns inte i dem.
//
// Uppmatt i produktion: Gift Campaign visar sin widget pa kortet, Battle MVP visar en tom ruta.
// Alla fjorton Battle MVP-korten, och samma sak for Gifter Level Up, Fan Level Up, New Follower
// och Last-X.
//
// Det ar ingen bugg i miniatyren. En alert ar OSYNLIG i vila och tands av en klass nar den triggas:
//
//   .battle-mvp.selected,.battle-mvp.mvp-active{opacity:1!important;visibility:visible!important}
//
// Miniatyren ritar widgeten precis som den ser ut utan trigger, alltsa opacity 0 och
// visibility hidden. Uppmatt per familj:
//
//   giftcampaign   opacity 1  visible    39/39 synliga barn
//   topgift        opacity 1  visible    28/28
//   battlemvp      opacity 0  hidden      0/9
//   gifterlevel    opacity 0  hidden      0/27
//   fanlevel       opacity 0  hidden      0/25
//   followeralert  opacity 0  hidden      0/18
//   lastx          opacity 0  hidden      0/12
//
// Kortet ska visa hur widgeten SER UT, inte vilket lage den rakar vara i. Inuti en miniatyr ska
// alltsa vilolaget inte galla.
//
// ROTT NU.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));

// Familjer vars widget ar osynlig i vila. Nyckeln ar en representant per familj.
const ALERTS = {
  'Battle MVP': 'catalog:battlemvp:inferno',
  'Gifter Level Up': 'catalog:gifterlevel:stack',
  'Fan Level Up': 'catalog:fanlevel:royal',
  'New Follower': 'catalog:followeralert',
  'Last-X': 'catalog:lastx:card'
};
// Familjer som redan syns. De far inte ga sonder av fixen.
const SYNLIGA = {
  'Gift Campaign': 'catalog:giftcampaign:neon:landscape',
  'Top Gifter': 'catalog:topgift:premium:royal',
  'Top Streak': 'catalog:topstreak:premium:liquid',
  'Heart Me Goal': 'catalog:heartgoal:neon'
};

test.after(closeAll);

// jsdom loser CSS-kaskaden men laddar inga stilmallar sjalv, sa filerna injiceras.
function medCss() {
  const h = createDom({ url: 'https://vyralive.app/studio.html', state: { widgets: [], projectName: 'thumb' } });
  h.load('overlay-sanitize.js');
  const css = fs.readdirSync(ROOT).filter(f => f.endsWith('.css'))
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const style = h.document.createElement('style');
  style.textContent = css;
  h.document.head.append(style);
  return h;
}

// Renderar widgeten pa samma satt owgRenderCardThumb gor: inuti .owg-thumb > .owg-thumb-inner.
function iMiniatyr(h, nyckel) {
  const w = VyraWidgets.create(nyckel);
  // Hela foraldrakedjan byggs: reglerna for miniatyren ar scopade till
  // .overlay-widget-gallery .widget-catalog button .owg-thumb-inner, och en losryckt .owg-thumb i
  // body matchar dem inte. Utan kedjan mater testet en miniatyr som inte finns.
  const box = h.document.createElement('div');
  box.className = 'overlay-widget-gallery';
  box.innerHTML = '<div class="widget-catalog"><button><div class="owg-thumb">' +
    '<div class="owg-thumb-inner"></div></div></button></div>';
  h.document.body.append(box);
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`document.querySelector('.overlay-widget-gallery .owg-thumb-inner').innerHTML = wh(${JSON.stringify(w)})`);
  const el = box.querySelector('.owg-thumb-inner').firstElementChild;
  const s = h.window.getComputedStyle(el);
  const synlig = n => { const c = h.window.getComputedStyle(n);
    return c.display !== 'none' && c.visibility !== 'hidden' && Number(c.opacity) > 0.05 };
  const harSynligtBarn = [...el.querySelectorAll('*')].some(synlig);
  box.remove();
  return { opacity: Number(s.opacity), visibility: s.visibility, klass: el.className, harSynligtBarn };
}

// Hela katalogen, inte ett stickprov. Ett urval hade missat familjer som ingen tankte pa - och
// det var precis sa Battle MVP kunde vara tomt i alla fjorton kort utan att nagot sa till.
test('varje katalogknapps miniatyr visar sin widget', () => {
  const h = medCss();
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  ['custom-widgets.js', 'last-x-alerts.js', 'gift-fireworks.js', 'premium-final.js'].forEach(f => h.load(f));
  run(`view='editor';selected=null;render();bind();`);

  const tomma = [];
  for (const sek of h.document.querySelectorAll('.widget-catalog section')) {
    const rubrik = (sek.querySelector('h4')?.textContent || '(ingen)').trim();
    for (const b of sek.querySelectorAll('button')) {
      if (!b.dataset.catalogKey) continue;
      const s = iMiniatyr(h, b.dataset.catalogKey);
      // Roten RACKER INTE. Gift Fireworks hade synlig rot men ett effektlager pa opacity 0, och
      // den har matningen sa "synlig" medan kortet var tomt. Minst ett barn maste ocksa synas.
      //
      // Det finns en niva till som jsdom inte kan na: ett barn som ar synligt men inte MALAR nagot
      // - ett <video> utan laddad bildruta, till exempel. jsdom har ingen layout alls, sa
      // getBoundingClientRect ar 0x0 for varje element. Den fragan gar bara att stalla i en
      // webblasare, och det ar sa VIDEO FX-korten kunde vara tomma trots gront test.
      if (!(s.opacity > 0.5) || s.visibility === 'hidden' || !s.harSynligtBarn) {
        tomma.push(rubrik + ' — ' + b.dataset.catalogKey);
      }
    }
  }

  assert.deepEqual(tomma, [],
    'dessa katalogkort visar en tom ruta:\n  ' + tomma.join('\n  '));
});

test('varje alert-widget syns i sin miniatyr', () => {
  const h = medCss();
  const osynliga = [];
  for (const [namn, nyckel] of Object.entries(ALERTS)) {
    const s = iMiniatyr(h, nyckel);
    if (!(s.opacity > 0.5) || s.visibility === 'hidden') {
      osynliga.push(`${namn}: opacity ${s.opacity}, visibility ${s.visibility}`);
    }
  }

  assert.deepEqual(osynliga, [],
    'dessa ritar en tom ruta pa sitt katalogkort:\n  ' + osynliga.join('\n  '));
});

test('de som redan syntes gor det fortfarande', () => {
  const h = medCss();
  const trasiga = [];
  for (const [namn, nyckel] of Object.entries(SYNLIGA)) {
    const s = iMiniatyr(h, nyckel);
    if (!(s.opacity > 0.5) || s.visibility === 'hidden') trasiga.push(namn);
  }

  assert.deepEqual(trasiga, [], `fixen slackte dessa: ${trasiga.join(', ')}`);
});

test('vilolaget galler fortfarande UTANFOR en miniatyr', () => {
  // Det ar hela poangen med att en alert ar osynlig: den far inte synas pa overlayen forran den
  // triggas. Skulle fixen lacka ut ur .owg-thumb sag tittarna varenda alert hela sandningen.
  const h = medCss();
  const w = VyraWidgets.create('catalog:battlemvp:inferno');
  const run = src => { const s = h.document.createElement('script'); s.textContent = src; h.document.body.append(s) };
  run(`document.body.insertAdjacentHTML('beforeend', '<div id="utanfor"></div>');
       document.querySelector('#utanfor').innerHTML = wh(${JSON.stringify(w)})`);
  const el = h.document.querySelector('#utanfor').firstElementChild;
  const s = h.window.getComputedStyle(el);

  assert.ok(Number(s.opacity) < 0.5 || s.visibility === 'hidden',
    `en otriggad alert syns utanfor miniatyren: opacity ${s.opacity}, visibility ${s.visibility}`);
});
