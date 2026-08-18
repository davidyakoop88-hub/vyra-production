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

const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

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

let server, browser, bas;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webblasare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

// Ett litet fonster med flit: panelen ar ~2900px hog, sa kontrollerna langst ner hamnar utanfor
// bild precis som pa Davids skarm. Ett hogt testfonster skulle dolja hela buggen.
// `extra` finns for kontroller som bara renderas i ett visst widgetlage. Battle MVP:s
// storleksreglage byggs t.ex. bara nar en MVP-ram ar vald (mvpFrameOptionsBind i media.js kraver
// w.mvpFrame), vilket ar precis darfor de inte syntes i den forsta inventeringen.
async function editorMed(typ, id = 'w1', extra = null) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${bas}/studio.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function' && typeof window.wh === 'function',
    null, { timeout: 20000 });
  // premium-final.js och toplike-studio.js laddas asynkront av media.js och ager panelerna som
  // provas har; utan dem matter testet fel panel.
  await page.waitForFunction(() => !!document.querySelector('script[src*="premium-final"]'),
    null, { timeout: 20000 });
  await page.evaluate(async ([typ, id, extra]) => {
    view = 'editor';
    state.widgets = [{ id, type: typ, x: 20, y: 20, width: 280, ...(extra || {}) }];
    selected = id;
    render();
    // Kontroller som byggs av en senare bind()-utokning (t.ex. MVP-ramens reglage) finns inte
    // efter forsta render(); ett extra bind() bygger dem, precis som ett klick i panelen gor.
    if (typeof bind === 'function') bind();
    await new Promise(r => setTimeout(r, 400));
  }, [typ, id, extra]);
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
  { namn: 'TOP LIKES · Bredd', typ: 'templateTopLike', kontroll: 'propWidth', nyckel: 'width' },
  // Femte bindaren: num() i media.js, en tredje parametervariant av samma kropp. Reglagen byggs
  // bara nar en MVP-ram ar vald, sa utan `extra` finns kontrollen inte och testet blir tyst gront.
  { namn: 'Battle MVP', typ: 'templateBattleMvp', kontroll: 'mvpScoreSize', nyckel: 'mvpScoreSize',
    extra: { mvpFrame: 'royal-purple' } },
  { namn: 'Battle MVP · namn', typ: 'templateBattleMvp', kontroll: 'mvpNameSize', nyckel: 'mvpNameSize',
    extra: { mvpFrame: 'royal-purple' } }
];

for (const fall of FALL) {
  test(`${fall.namn}: ett dragsteg ersätter inte elementet`, { skip }, async () => {
    const page = await editorMed(fall.typ, 'w1', fall.extra);
    const ut = await page.evaluate(DRAGSTEG, [fall.kontroll, fall.nyckel]);
    await page.close();
    assert.equal(ut.sammaElement, true,
      `${fall.kontroll}: elementet byttes ut mitt i dragningen — reglaget slapper och gar inte att dra`);
  });

  test(`${fall.namn}: scrollpositionen överlever ett dragsteg`, { skip }, async () => {
    const page = await editorMed(fall.typ, 'w1', fall.extra);
    const ut = await page.evaluate(DRAGSTEG, [fall.kontroll, fall.nyckel]);
    await page.close();
    assert.equal(ut.scrollEfter, ut.fore.scroll,
      `${fall.kontroll}: panelen hoppade från ${ut.fore.scroll} till ${ut.scrollEfter}`);
    assert.equal(ut.iSynfaltet, true,
      `${fall.kontroll}: reglaget kastades ut ur bild (y ${ut.fore.y} → ${ut.yEfter})`);
  });

  test(`${fall.namn}: fokus stannar på kontrollen`, { skip }, async () => {
    const page = await editorMed(fall.typ, 'w1', fall.extra);
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
    const page = await editorMed(fall.typ, 'w1', fall.extra);
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
    const page = await editorMed(fall.typ, 'w1', fall.extra);
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


// ================================================================================================
// ATT SKRIVA I ETT TEXTFALT ar samma fel som att dra i ett reglage — bara mer synligt.
//
// Reglagets fall matte ETT dragsteg. Ett tangenttryck ar samma sak: handlaren kor, render() river
// vyn, och elementet anvandaren star i finns inte langre. Skillnaden ar att man MARKER det, for
// nasta tecken gar ingenstans.
//
// UPPMATT I RIKTIG CHROME 2026-08-18, atta tecken skrivna i foljd utan att klicka om:
//
//   panel                       | falt            | fram | fokus kvar | samma nod
//   ----------------------------+-----------------+------+------------+-----------
//   custom-widgets.js           | #ctwText        | 1/8  | nej        | nej
//   gift-fireworks.js           | #followName     | 1/8  | nej        | nej
//   gift-fireworks.js           | #followMessage  | 1/8  | nej        | nej
//   media.js (advancedProperty) | #propWidth      | 5/5  | ja         | ja      (KONTROLL)
//
// `#propWidth` ar kontrollen och star i SAMMA panel som `#ctwText`. Den ags av
// advancedPropertyBind i media.js, alltsa av den delade live-vagen, och klarar sig helt. Utan den
// raden mater provet "skriver Chrome tecken?" i stallet for "river panelen sig sjalv?".
//
// ATT SKRIVA PA RIKTIGT, inte dispatcha ett Event: en syntetisk `input` mot en nod vi redan haller
// i skulle na fram aven efter att panelen bytt ut den. Det ar just den skillnaden som ar felet.
//
// PANELENS SCROLL MATS INTE HAR, och det ar ett resultat av en matning, inte en forbiseelse.
// Ett forsta utkast satte scrollTop till 300 fore fokus och foll — men det var `el.focus()` som
// scrollade, inte en omrendering: focus() drar sjalv in elementet i en scrollbar behallare. Med
// baslinjen tagen EFTER fokus blev provet gront bade fore och efter lagningen, eftersom textrutan
// ligger sa hogt i panelen att focus() och en omrendering landar pa samma varde. Ett prov som inte
// kan falla pa felet det pastar sig vakta ar en lognare, sa det togs bort. Panelens scroll under en
// DRAGNING mats fortfarande, av fallen langre upp i filen.
const TEXTFALT = [
  { namn: 'Egen text', typ: 'templateCustomText', kontroll: 'ctwText', nyckel: 'customText',
    skriv: 'Hej alla' },
  { namn: 'Follower Spotlight · namn', typ: 'templateFollowerAlert', kontroll: 'followName',
    nyckel: 'followName', skriv: 'Hej alla' },
  { namn: 'Follower Spotlight · meddelande', typ: 'templateFollowerAlert', kontroll: 'followMessage',
    nyckel: 'followMessage', skriv: 'Hej alla' },
  // KONTROLLEN. Samma panel som Egen text, men bunden av den delade live-vagen. Ett talfalt, sa
  // siffror skrivs i stallet — det som mats ar fokus och elementidentitet, inte tecknen i sig.
  { namn: 'Egen text · Bredd (kontroll)', typ: 'templateCustomText', kontroll: 'propWidth',
    nyckel: 'width', skriv: '12345' }
];

// En sida per falt, inte en per pastaende: samma sida, samma widget, samma tangenttryck.
const skrivet = new Map();

async function skriv(fall) {
  if (skrivet.has(fall.namn)) return skrivet.get(fall.namn);
  const page = await editorMed(fall.typ);
  try {
    const fore = await page.evaluate(id => {
      const el = document.getElementById(id);
      if (!el) return { fel: `kontrollen #${id} finns inte i panelen` };
      el.scrollIntoView({ block: 'center' });
      el.value = '';
      el.focus();                       // focus() scrollar sjalv — matt tas EFTER
      window.__falt = el;
      const panel = document.querySelector('.properties');
      return { scroll: panel ? panel.scrollTop : 0, fokus: document.activeElement === el };
    }, fall.kontroll);
    if (fore.fel) { skrivet.set(fall.namn, fore); return fore }
    for (const tecken of fall.skriv) await page.keyboard.type(tecken, { delay: 25 });
    const ut = await page.evaluate(([id, nyckel]) => {
      const el = document.getElementById(id);
      return {
        iRutan: el ? el.value : null,
        iState: String(state.widgets[0][nyckel] ?? ''),
        sammaNod: window.__falt === el,
        fokus: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
        scroll: (document.querySelector('.properties') || {}).scrollTop
      };
    }, [fall.kontroll, fall.nyckel]);
    const svar = { ...ut, fore };
    skrivet.set(fall.namn, svar);
    return svar;
  } finally { await page.close() }
}

for (const fall of TEXTFALT) {
  test(`${fall.namn}: fältet finns och tar emot fokus`, { skip }, async () => {
    // POSITIV KONTROLL. Utan den blir de tva foljande grona for ett falt som aldrig renderades —
    // vilket ar precis vad som hander om panelen byter id eller widgeten byter typnamn.
    const m = await skriv(fall);
    assert.ok(!m.fel, m.fel);
    assert.equal(m.fore.fokus, true, `#${fall.kontroll} gick inte att fokusera`);
  });

  test(`${fall.namn}: hela meningen kommer fram utan att klicka om`, { skip }, async () => {
    const m = await skriv(fall);
    assert.ok(!m.fel, m.fel);
    assert.equal(m.iRutan, fall.skriv,
      `av ${fall.skriv.length} tecken kom ${(m.iRutan || '').length} fram: ${JSON.stringify(m.iRutan)} — ` +
      `resten gick till ${m.fokus}`);
  });

  test(`${fall.namn}: elementet byts inte ut mellan tangenttryck`, { skip }, async () => {
    const m = await skriv(fall);
    assert.ok(!m.fel, m.fel);
    assert.equal(m.sammaNod, true, 'fältet ersattes av en ny nod medan användaren skrev i det');
    assert.equal(m.fokus, fall.kontroll, `fokus hamnade på ${m.fokus} i stället för på fältet`);
  });
}
