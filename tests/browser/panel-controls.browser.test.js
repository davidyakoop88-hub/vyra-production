'use strict';
// Storlekskontrollerna gar inte att dra. Matt i en RIKTIG webblasare, for de fyra egenskaperna som
// provas har — scrollposition, elementidentitet under en dragning, live-forhandsvisning och fokus —
// alla kraver layout och en riktig fokusmodell. jsdom har ingen av delarna: scrollTop ar alltid 0
// och getBoundingClientRect ger 0x0, sa fragan "hamnade reglaget utanfor bild?" gar inte att stalla.
//
// ORSAKEN, uppmatt fore fixen:
//
//   render() i studio.js ar `viewRoot.innerHTML = m[view]()` — den river BADE canvasen och
//   egenskapspanelen. Panelens tre generiska bindare (media.js change(), premium-final.js set(),
//   toplike-studio.js) anropar den vid varje andring, och toplike-studio dessutom fran oninput,
//   alltsa vid varje pixel i en dragning.
//
//   Foljden pa Top Gift (pfTopGiftSize): panelens scrollTop 824 -> 0, reglaget flyttas fran y=335
//   till y=1159 i ett 720px hogt fonster, och document.activeElement blir BODY.
//   Pa Top Likes (wsOutlineWidth): elementet man haller i ersattes efter ETT dragsteg.
//
// ROTT NU: alla fyra.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

let chromium = null;
try { ({ chromium } = require('playwright-core')) } catch (_) {}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function startaWebblasare() {
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try { return await chromium.launch({ channel }) } catch (_) {}
  }
  try { return await chromium.launch() } catch (_) {}
  return null;
}

let server, browser, bas;
let skip = chromium ? false : 'playwright-core saknas — kor `npm i` (hoppar, faller inte)';

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) { skip = 'ingen Chrome/Edge/Chromium hittades pa maskinen (hoppar, faller inte)'; return }
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Ett litet fonster med flit: panelen ar ~2900px hog, sa kontrollerna langst ner hamnar utanfor
// bild precis som pa Davids skarm. Ett hogt testfonster skulle dolja hela buggen.
async function editorMed(typ, id = 'w1') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && typeof window.wh === 'function',
    null, { timeout: 20000 });
  // premium-final.js och toplike-studio.js laddas asynkront av media.js och ager panelerna som
  // provas har; utan dem matter testet fel panel.
  await page.waitForFunction(() => !!document.querySelector('script[src*="premium-final"]'),
    null, { timeout: 20000 });
  await page.evaluate(async ([typ, id]) => {
    view = 'editor';
    state.widgets = [{ id, type: typ, x: 20, y: 20, width: 280 }];
    selected = id;
    render();
    await new Promise(r => setTimeout(r, 400));
  }, [typ, id]);
  return page;
}

// Ett enda steg i en dragning: exakt vad webblasaren gor nar musen ror sig en pixel med knappen
// nere. Det ar har panelen inte far byggas om.
const DRAGSTEG = ([id, nyckel]) => {
  const el = document.getElementById(id);
  el.scrollIntoView({ block: 'center' });
  const panel = document.querySelector('.properties');
  const fore = {
    scroll: panel.scrollTop,
    y: Math.round(el.getBoundingClientRect().top),
    etikett: el.parentElement.querySelector('b')?.textContent || null
  };
  const nytt = Math.min(Number(el.max || 200), Number(el.value || 0) + 20);
  el.value = String(nytt);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  const efter = document.getElementById(id);
  const panelEfter = document.querySelector('.properties');
  const box = efter && efter.getBoundingClientRect();
  return {
    fore, satteTill: nytt,
    stateVarde: state.widgets[0][nyckel],
    sammaElement: efter === el,
    scrollEfter: panelEfter ? panelEfter.scrollTop : null,
    yEfter: box ? Math.round(box.top) : null,
    iSynfaltet: !!box && box.top >= 0 && box.bottom <= window.innerHeight,
    etikettEfter: efter ? (efter.parentElement.querySelector('b')?.textContent || null) : null,
    aktivt: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null
  };
};

// De tre fallen David namngav: den generiska bindaren (media.js change), premium-bindaren
// (premium-final.js set) och den varsta panelen (LikeFountain, 19 kontroller).
//
// propWidth ar med tva ganger med flit. Det ags av en FJARDE bindare
// (advancedPropertyBind, media.js) vars hjalpare har identisk kropp men parametern `number` i
// stallet for `num` — darfor missade den forsta svepande omskrivningen den, och "Bredd", det falt
// som mest bokstavligt heter storlek, satt kvar med hela buggen. Det ar ocksa det enda faltet i
// urvalet som ar ett talfalt utan px-etikett, sa live-provet maste kunna mata state i stallet.
const FALL = [
  { namn: 'TOP GIFT', typ: 'templateTopGift', kontroll: 'pfTopGiftSize', nyckel: 'giftSize' },
  { namn: 'TOP LIKES', typ: 'templateTopLike', kontroll: 'wsOutlineWidth', nyckel: 'textOutlineWidth' },
  { namn: 'LikeFountain', typ: 'templateLikeFountain', kontroll: 'fountainSize', nyckel: 'fountainSize' },
  { namn: 'TOP GIFT · Bredd', typ: 'templateTopGift', kontroll: 'propWidth', nyckel: 'width' },
  { namn: 'TOP LIKES · Bredd', typ: 'templateTopLike', kontroll: 'propWidth', nyckel: 'width' }
];

for (const fall of FALL) {
  test(`${fall.namn}: ett dragsteg ersätter inte elementet`, { skip }, async () => {
    const page = await editorMed(fall.typ);
    const ut = await page.evaluate(DRAGSTEG, [fall.kontroll, fall.nyckel]);
    await page.close();
    assert.equal(ut.sammaElement, true,
      `${fall.kontroll}: elementet byttes ut mitt i dragningen — reglaget slapper och gar inte att dra`);
  });

  test(`${fall.namn}: scrollpositionen överlever ett dragsteg`, { skip }, async () => {
    const page = await editorMed(fall.typ);
    const ut = await page.evaluate(DRAGSTEG, [fall.kontroll, fall.nyckel]);
    await page.close();
    assert.equal(ut.scrollEfter, ut.fore.scroll,
      `${fall.kontroll}: panelen hoppade från ${ut.fore.scroll} till ${ut.scrollEfter}`);
    assert.equal(ut.iSynfaltet, true,
      `${fall.kontroll}: reglaget kastades ut ur bild (y ${ut.fore.y} → ${ut.yEfter})`);
  });

  test(`${fall.namn}: fokus stannar på kontrollen`, { skip }, async () => {
    const page = await editorMed(fall.typ);
    const ut = await page.evaluate(([id]) => {
      const el = document.getElementById(id);
      el.scrollIntoView({ block: 'center' });
      el.focus();
      el.value = String(Number(el.value || 0) + 5);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null;
    }, [fall.kontroll]);
    await page.close();
    assert.equal(ut, fall.kontroll, `fokus hamnade på ${ut} i stället för på kontrollen`);
  });

  // Kravet ar inte "etiketten andrades" — en trasig uppdatering som staplar siffror pa varandra
  // ("130128126124…px") andrar den ocksa, och slank igenom den forsta versionen av det har testet.
  // Kravet ar att den visar exakt det nya vardet med enheten kvar.
  test(`${fall.namn}: live-förhandsvisning visar rätt värde under dragningen`, { skip }, async () => {
    const page = await editorMed(fall.typ);
    const ut = await page.evaluate(DRAGSTEG, [fall.kontroll, fall.nyckel]);
    await page.close();
    // State forst: det ar den egenskap som galler for ALLA kontroller. Talfalten (Bredd) har
    // ingen px-etikett alls, och da vore ett etikettprov tyst gront utan att bevisa nagot.
    assert.equal(ut.stateVarde, ut.satteTill,
      `live-vägen skrev inte värdet till state (fick ${ut.stateVarde}, väntade ${ut.satteTill})`);
    if (ut.fore.etikett !== null) {
      const enhet = String(ut.fore.etikett).replace(/^[\d.,-]+/, '');
      assert.equal(ut.etikettEfter, String(ut.satteTill) + enhet,
        `etiketten visade "${ut.etikettEfter}" i stället för "${ut.satteTill}${enhet}"`);
    }
  });

  // Slappet, inte dragningen. En kontroll utan oninput-handler star helt stilla under `input` —
  // da blir scroll- och fokusproven ovan grona utan att bevisa nagot. Buggen slar vid `change`,
  // dar den gamla bindaren korde en naken render(). Uppmatt pa propWidth fore fixen:
  // scrollTop 1319 -> 0 och faltet kastat fran y=335 till y=1654 i ett 720px hogt fonster.
  test(`${fall.namn}: panelen står kvar när kontrollen släpps`, { skip }, async () => {
    const page = await editorMed(fall.typ);
    const ut = await page.evaluate(([id, nyckel]) => {
      const el = document.getElementById(id);
      el.scrollIntoView({ block: 'center' });
      el.focus();
      const panel = document.querySelector('.properties');
      const scrollFore = panel.scrollTop, yFore = Math.round(el.getBoundingClientRect().top);
      el.value = String(Math.min(Number(el.max || 400), Number(el.value || 0) + 20));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));   // slappet
      const efter = document.getElementById(id);
      const box = efter && efter.getBoundingClientRect();
      return {
        scrollFore, scrollEfter: document.querySelector('.properties').scrollTop,
        yFore, yEfter: box ? Math.round(box.top) : null,
        iSynfaltet: !!box && box.top >= 0 && box.bottom <= window.innerHeight,
        fokus: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
        stateVarde: state.widgets[0][nyckel]
      };
    }, [fall.kontroll, fall.nyckel]);
    await page.close();
    assert.equal(ut.scrollEfter, ut.scrollFore,
      `panelen hoppade från ${ut.scrollFore} till ${ut.scrollEfter} när kontrollen släpptes`);
    assert.equal(ut.iSynfaltet, true,
      `kontrollen kastades ut ur bild vid släppet (y ${ut.yFore} → ${ut.yEfter})`);
    assert.equal(ut.fokus, fall.kontroll, `fokus hamnade på ${ut.fokus} efter släppet`);
  });
}

test('live-vägen skriver till state utan att bygga om vyn', { skip }, async () => {
  const page = await editorMed('templateTopGift');
  const ut = await page.evaluate(() => {
    const el = document.getElementById('pfTopGiftSize');
    el.scrollIntoView({ block: 'center' });
    const vy = document.querySelector('#view');
    const canvasFore = document.querySelector('.canvas');
    el.value = '190';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      giftSize: state.widgets[0].giftSize,
      vySammaNod: document.querySelector('#view') === vy,
      canvasSammaNod: document.querySelector('.canvas') === canvasFore
    };
  });
  await page.close();
  assert.equal(ut.giftSize, 190, 'live-vägen skrev inte värdet till state');
  assert.equal(ut.canvasSammaNod, true, 'hela canvasen byggdes om från en oninput — full render i live-vägen');
});
