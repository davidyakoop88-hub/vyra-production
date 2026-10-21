'use strict';
// INGEN PANEL VÄLJER PROFILBILD ELLER GÅVOBILD, OCH INGEN PANEL HAR ETT EXEMPELDATABLOCK (2026-10-20).
//
// David, om Top Gift-panelen med "Profilbild innan första gåvan" och "Gåvobild innan första gåvan":
// *"ingen ska profil bild eller gåvan ska vara med panel"*. Och om blocket "Exempeldata för test och
// förhandsvisning" (Användarnamn, Mynt, Töm exempeldata): *"den ska inte vara med heller"*.
//
// Provet läser ALLA registerposter (studio.html laddar dem i den här ordningen) och kräver för varje
// modell:
//   * ingen kontroll med kalla 'exempel' (registret avvisar den dessutom),
//   * ingen mediaväljare (typ 'media') vars fält är ett profil- eller gåvofält, och ingen gåvoväljare,
//   * ingen etikett som pekar ut en profilbild, gåvobild, reservgåva eller avatar (utom avatarRAMEN,
//     som väljer en ram och inte en bild), och ingen "Töm exempeldata".
// Kvar ska mediaväljaren för widgetens EGET innehåll vara: Egen bild och Egen video, och video per
// nivå i Fan Level Up (byggs i vyra-alert-panel.js, inte som registerkontroll).
//
// UTTALAT UNDANTAG: GIFT CAMPAIGNS GÅVOVAL. David samma kväll: "nej vi ska gåva och namn för den" och
// "tycka på nr 1 väljer man gift sen kommer nr två". Kampanjens gåvor ÄR dess innehåll — vilka gåvor
// som räknas — inte en reservbild innan första gåvan. Den väljs i en flikrad (vyra-kampanj-gavoval.js)
// ur Action & Events gåvokatalog och står i registret som EN kontroll, 'gcGavoflikar' — aldrig som en
// mediaväljare och aldrig med en sökväg.
//
// Renderarnas sida: en egen bild som redan är sparad (data:/blob:, en uppladdning i molnets
// mediabibliotek) ignoreras av vyraReservbild i media.js, så att den automatiska reserven ritas för
// alla. Livedata och paketerade assets passerar orörda.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { createDom, closeAll } = require('./helpers/dom-harness.js');

const ROOT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test.after(closeAll);

// Panelfilerna i studio.html:s ordning.
const PANELFILER = [...las('studio.html').matchAll(/src="(vyra-[a-z0-9-]+-panel\.js)/g)].map(m => m[1]);

function register() {
  const h = createDom();
  h.load('overlay-sanitize.js');
  h.load('vyra-panelregister.js');
  for (const f of PANELFILER) h.load(f);
  return h.window.VyraPanelregister;
}

const PROFIL_ELLER_GAVA = /profile|avatar|giftimage|gbgiftimage|^giftimage\d$/i;
const FORBJUDEN_ETIKETT = /^(?:egen\s+)?(?:profilbild|gåvobild|gavobild)\b|reservgåva|reservbild|töm exempeldata|exempeldata/i;
const etikettAv = k => String(k.etikett || '');

test('studio.html laddar panelfilerna, och de definierar poster', () => {
  assert.ok(PANELFILER.length >= 13, 'hittade bara ' + PANELFILER.length + ' panelfiler');
  const R = register();
  assert.ok(R.poster().length >= 20, 'registret har bara ' + R.poster().length + ' poster');
});

test('ingen registerpost har exempeldata eller en bildväljare för profil eller gåva', () => {
  const R = register();
  const fel = [];
  for (const p of R.poster()) {
    const namn = p.typ + (p.galler ? ' [' + p.galler.join(',') + ']' : '');
    for (const k of p.kontroller || []) {
      const e = etikettAv(k);
      if (k.kalla === 'exempel') fel.push(`${namn}: exempeldata "${e || k.falt}"`);
      if (k.typ === 'media' && (k.medietyp === 'gava' || PROFIL_ELLER_GAVA.test(String(k.falt || ''))))
        fel.push(`${namn}: mediaväljare för ${k.falt} ("${e}")`);
      // Kryssrutor, reglage och listor visar och skalar ("Visa profilbild", "Profilbild stiger med") — de väljer ingen bild.
      const valjer = ['media', 'text', 'knapp'].includes(k.typ);
      if (valjer && FORBJUDEN_ETIKETT.test(e)) fel.push(`${namn}: etiketten "${e}"`);
      if (valjer && /avatar/i.test(e) && !/ram/i.test(e)) fel.push(`${namn}: etiketten "${e}"`);
      if (k.id === 'vyraTomWidget' || k.legacyId === '#vyraTomWidget') fel.push(`${namn}: Töm exempeldata`);
    }
  }
  assert.deepEqual(fel, []);
});

test('mediaväljaren finns kvar för Egen bild och Egen video', () => {
  const R = register();
  const media = R.poster().flatMap(p => (p.kontroller || []).filter(k => k.typ === 'media').map(k => p.typ + ':' + k.falt));
  assert.deepEqual(JSON.parse(JSON.stringify(media.sort())), ['templateCustomImage:mediaMeta', 'templateCustomVideo:mediaMeta']);
  // Video per nivå byggs av vyra-alert-panel.js med vyra-mediaval.js — inte en profilbild, och står kvar.
  assert.match(las('vyra-alert-panel.js'), /M\.falt\(\{ w, falt: 'levelVideo' \+ niva, typ: 'video'/);
});

test('registret avvisar exempeldata', () => {
  const R = register();
  assert.ok(!R.KALLOR.includes('exempel'));
  assert.throws(() => R.definiera({ typ: 'templateProv', kontroller: [{ sektion: 1, kalla: 'exempel', typ: 'text', falt: 'a' }] }), /okänd kalla "exempel"/);
});

test('ramen bygger inget exempeldatablock, och Fan Level 50 ingen bildväljare per deltagare', () => {
  const ram = las('vyra-panelram.js');
  assert.doesNotMatch(ram, /Exempeldata för test och förhandsvisning/);
  assert.doesNotMatch(ram, /pr-exempel/);
  const fl50 = las('vyra-fl50-panel.js');
  assert.doesNotMatch(fl50, /VyraMediaval|M\.falt\(/, 'deltagarraden ska inte få en mediaväljare');
  assert.match(fl50, /\.fl50-rad-bild\{display:none!important\}/, 'bildplatsen i deltagarraden döljs');
  // De gamla sökvägsfälten för profil- och gåvobild (paneler utan registerpost) läggs i en DOLD grupp.
  assert.match(las('vyra-bildfalt.js'), /grupp\.hidden = true;/);
});

test('vyraReservbild: en sparad egen bild ignoreras, livedata och assets passerar', () => {
  const h = createDom();
  const r = h.window.vyraReservbild;
  assert.equal(typeof r, 'function');
  assert.equal(r('data:image/png;base64,AAAA'), '');
  assert.equal(r('blob:https://vyralive.app/1234'), '');
  assert.equal(r({ id: 'x', name: 'a.png' }), '');
  assert.equal(r('https://cdn.vyralive.app/media/workspaces/11111111-2222-3333-4444-555555555555/66666666-7777-8888-9999-000000000000.png'), '');
  const tiktok = 'https://p16-sign-va.tiktokcdn.com/tos-maliva-avt-0068/abc~c5_100x100.jpeg?x-expires=1';
  assert.equal(r(tiktok), tiktok);
  assert.equal(r('assets/images/test-profile.svg'), 'assets/images/test-profile.svg');
  assert.equal(r(''), '');
  assert.equal(r(undefined), undefined);
});

test('Top Gift med en sparad egen profil- och gåvobild ritar den automatiska reserven', () => {
  const h = createDom();
  h.load('overlay-sanitize.js');
  // Premiumbunten laddas asynkront av media.js; här laddas renderarna för Design 2 direkt.
  h.load('premium-final.js');
  h.load('topgift-designer.js');
  const egen = 'data:image/png;base64,iVBORw0KGgo=';
  const w = h.window.VyraWidgets.create('catalog:topgift:premium:royal');
  Object.assign(w, { id: 'tg', x: 0, y: 0 });
  const utan = h.window.wh(Object.assign({}, w, { profileImage: '', giftImage: '' }));
  const med = h.window.wh(Object.assign({}, w, { profileImage: egen, giftImage: egen }));
  assert.ok(utan.includes('assets/images/test-profile.svg'), 'reserven för profilbilden ritas');
  assert.ok(!med.includes(egen), 'den egna bilden ska inte ritas');
  assert.equal(med, utan, 'samma markup som utan egen bild');
  // Livedata (en TikTok-bild) ritas som förut.
  const live = 'https://p16-sign-va.tiktokcdn.com/avt/abc.jpeg';
  assert.ok(h.window.wh(Object.assign({}, w, { profileImage: live })).includes(live));
});

test('undantaget: Gift Campaign väljer sina gåvor i flikraden, ur Action & Events gåvokatalog', () => {
  const R = register();
  const kampanj = R.poster().filter(p => p.typ === 'templateGiftCampaign');
  assert.equal(kampanj.length, 6, 'tre designer × två orienteringar');
  for (const p of kampanj) {
    const k = p.kontroller.filter(x => x.falt === 'gcGavoflikar');
    assert.equal(k.length, 1, 'en flikrad per post');
    assert.equal(k[0].sektion, 2, 'i Innehåll');
    assert.equal(k[0].legacyId, '#gcGavoflikar');
    assert.ok(!p.kontroller.some(x => x.typ === 'media'), 'ingen mediaväljare');
    assert.ok(!p.kontroller.some(x => /^giftName\d|^giftTarget\d|^giftImage\d/.test(String(x.falt || ''))),
      'de gamla raderna "Gåva N: namn"/"Gåva N: mål" ersätts av flikarna');
  }
  const val = las('vyra-kampanj-gavoval.js');
  assert.match(val, /window\.VyraGavokatalog/, 'listan läser Action & Events katalog');
  assert.match(las('action-event-advanced.js'), /window\.VyraGavokatalog=\{lista:gavolistan[,}]/, 'samma gavolistan() som eventdialogens gåvoväljare');
  // Fälten är renderarens: namn och bild skrivs dit renderaren läser (media.js campaignItems).
  for (const f of ["'giftName' + i", "'giftImage' + i", "'giftMatch' + i", "'giftTarget' + i"]) assert.ok(val.includes(f), f);
});
