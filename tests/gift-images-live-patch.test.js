'use strict';
// Gåvor får inte spara eller rita om canvasen.
//
// Handlern i gift-event-images.js slutade på `if (changed) { save(); render(); }` — en full
// omritning av canvasen och en statskrivning för VARJE gåva, på vägen som delas av Top Gift,
// Top Streak och Gift Campaign. Omritningen river dessutom ner den animation som just spelar,
// vilket är exakt det VyraFlip byggdes för att lösa i #52.
//
// Live data ska patcha DOM:en riktat. Det den fortfarande får göra är att uppdatera
// widget-objekten i state — Gift Campaign räknar upp en summa som ska överleva en omladdning när
// streamern själv sparar — men den får inte utlösa sparningen.
//
// RÖTT NU: save() och render() anropas per gåva, och ingen riktad patchning finns.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'gift-event-images.js'), 'utf8');

// ---- en DOM som liknar de tre widgetarnas riktiga markup ------------------------------------------
function node(tag, cls) {
  const el = {
    tagName: tag.toUpperCase(), className: cls || '', children: [], textContent: '',
    style: { width: '', setProperty(k, v) { this[k] = v } }, dataset: {}, src: '',
    append(child) { this.children.push(child); child.parent = el; return child },
    querySelector(sel) { return el.querySelectorAll(sel)[0] || null },
    querySelectorAll(selector) {
      // Selektorlistor ('.a strong, .b strong') används av patchen för de två designvarianterna.
      if (String(selector).includes(',')) {
        return String(selector).split(',').flatMap(part => el.querySelectorAll(part));
      }
      const want = String(selector).trim();
      const out = [];
      const visit = n => {
        for (const c of n.children) {
          const byClass = want.startsWith('.') && (' ' + c.className + ' ').includes(' ' + want.slice(1) + ' ');
          const byTag = /^[a-z]+$/.test(want) && c.tagName === want.toUpperCase();
          const compound = want.includes(' ') && (() => {
            const [first, second] = want.split(/\s+/);
            const firstHit = first.startsWith('.')
              ? (' ' + c.className + ' ').includes(' ' + first.slice(1) + ' ')
              : c.tagName === first.toUpperCase();
            return firstHit && c.querySelectorAll(second).length > 0;
          })();
          if (byClass || byTag) out.push(c);
          if (compound) out.push(...c.querySelectorAll(want.split(/\s+/)[1]));
          visit(c);
        }
      };
      visit(el);
      return out;
    }
  };
  return el;
}

// Formen är avläst ur den renderade sidan i webbläsaren, inte gissad. Två detaljer som en
// förenklad fixtur missar och som båda gjorde patchen fel i första utkastet:
//   • värdet ligger i .topgift-copy em men i .streak-score b — olika taggar, olika prefix
//   • .vyra-streak innehåller <em>GOOD</em> i .streak-mechanism, som inte är något värde alls
function topGiftNode(id) {
  const root = node('div', 'widget vyra-topgift');
  root.dataset.id = id;
  const flip = root.append(node('div', 'vyra-flip'));
  flip.append(node('div', 'vyra-profile-face')).append(node('img'));
  flip.append(node('div', 'vyra-gift-face')).append(node('img'));
  const copy = root.append(node('div', 'topgift-copy'));
  const name = copy.append(node('strong')); name.textContent = '@StreamQueen';
  const value = copy.append(node('em')); value.textContent = '◉ 44 999';
  return root;
}

function topStreakNode(id) {
  const root = node('div', 'widget vyra-streak');
  root.dataset.id = id;
  const identity = root.append(node('div', 'streak-identity'));
  const flip = identity.append(node('div', 'streak-flip'));
  flip.append(node('div', 'streak-profile-face')).append(node('img'));
  flip.append(node('div', 'streak-gift-face')).append(node('img'));
  const copy = identity.append(node('div', 'streak-copy'));
  copy.append(node('small'));
  const name = copy.append(node('strong')); name.textContent = '@StreamQueen';
  const score = root.append(node('div', 'streak-score'));
  const value = score.append(node('b')); value.textContent = '×18';
  score.append(node('span')).textContent = 'STREAK';
  const mech = root.append(node('div', 'streak-mechanism'));
  ['GOOD', 'GREAT', 'AMAZING', 'LEGENDARY'].forEach(label => {
    mech.append(node('em')).textContent = label;
  });
  return root;
}

// Clean Flip (approved-rankings.js) — den enda Top Streak som nar skarmen sedan 2026-09-20.
// Formen ar avlast ur cleanStreakHtml: namnet i .approved-streak-copy strong, talet i ett eget <b>
// inne i <em>×<b>0</b> STREAK</em>. Overlayens nollage ar synligt: tomt namn och 0.
function cleanStreakNode(id) {
  const root = node('div', 'widget vyra-streak approved-streak');
  root.dataset.id = id;
  const flip = root.append(node('div', 'streak-flip'));
  flip.append(node('div', 'streak-gift-face')).append(node('img'));
  flip.append(node('div', 'streak-profile-face')).append(node('img'));
  const copy = root.append(node('div', 'approved-streak-copy'));
  const name = copy.append(node('strong')); name.textContent = '';
  const em = copy.append(node('em')); em.textContent = '× STREAK';
  const b = em.append(node('b')); b.textContent = '0';
  return root;
}

function campaignNode(id, slots) {
  const root = node('div', 'widget vyra-campaign');
  root.dataset.id = id;
  const list = root.append(node('div', 'campaign-gifts'));
  for (let i = 0; i < slots; i += 1) {
    const article = list.append(node('article'));
    article.append(node('div', 'campaign-gift-image')).append(node('img'));
    const name = article.append(node('strong')); name.textContent = 'Rose';
    const span = article.append(node('span'));
    const b = span.append(node('b')); b.textContent = '0';
    article.append(node('em')).append(node('u'));
  }
  return root;
}

function makeEnv({ widgets, dom, overlay = false, search = null }) {
  const calls = { save: 0, render: 0 };
  const root = node('div', 'canvas');
  dom.forEach(d => root.append(d));

  const listeners = {};
  const state = { widgets };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error,
    // Overlay-laget lases ur URL:en av bade den har filen och vyra-tom-widget.js.
    URLSearchParams,
    location: { search: search != null ? search : (overlay ? '?overlay=1' : '') },
    document: {
      querySelector: sel => root.querySelector(sel),
      querySelectorAll: sel => root.querySelectorAll(sel)
    },
    addEventListener: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn) },
    // Studions bevakning av nya fack sitter efter bind(); proven anropar bind() själva.
    bind: () => { calls.bind = (calls.bind || 0) + 1 },
    state,
    save: () => { calls.save += 1 },
    render: () => { calls.render += 1 },
    VYRA_GIFTS: [{ name: 'Rose', file: 'assets/gifts/rose.png' }],
    VyraCampaignItems: w => [
      { name: w.giftName0 || 'Rose', current: Number(w.giftCurrent0 || 0), target: 100, image: '' },
      { name: w.giftName1 || 'Galaxy', current: Number(w.giftCurrent1 || 0), target: 50, image: '' }
    ]
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  // Lyssnarna nås av prov som behöver skicka något annat än en gåva (t.ex. en ny sändning).
  sandbox.__lyssnare = listeners;
  vm.runInNewContext(SOURCE, sandbox, { filename: 'gift-event-images.js' });

  const gift = detail => {
    for (const fn of listeners['vyra-live-event'] || []) fn({ detail });
  };
  return { sandbox, state, calls, root, gift };
}

// `coins` är combons TOTAL och `count` dess längd, precis som bryggan skickar dem
// (normalizer.js: `coins:coinsEach*repeatCount`). 30 coins fördelat på 3 gåvor är alltså en gåva
// värd 10 — och 10 är vad Top Gift visar, eftersom widgeten rankar gåvans värde och inte combons
// summa. Fixturen stod tidigare på `coins: 10, count: 3`, vilket inte går ihop med något
// heltalsstyckpris; den råkade se rätt ut bara så länge totalen visades rakt av.
const GIFT = { type: 'gift', giftName: 'Rose', username: 'wpwer17', coins: 30, count: 3,
  profileImage: 'https://cdn/p.jpg', giftImage: 'assets/gifts/rose.png' };

// ---- livevägen får inte spara eller rita om --------------------------------------------------------
test('en gåva anropar varken save() eller render()', () => {
  const env = makeEnv({
    widgets: [{ id: 'g1', type: 'templateTopGift' }],
    dom: [topGiftNode('g1')]
  });
  env.gift(GIFT);
  assert.equal(env.calls.render, 0,
    'render() per gåva ritar om hela canvasen och river den animation som spelar');
  assert.equal(env.calls.save, 0,
    'save() per gåva skriver state på varje gift — vid en stor combo hundratals gånger');
});

test('hundra gåvor ger fortfarande noll sparningar och noll omritningar', () => {
  const env = makeEnv({
    widgets: [{ id: 'g1', type: 'templateTopGift' }, { id: 's1', type: 'templateTopStreak' }],
    dom: [topGiftNode('g1'), topStreakNode('s1')]
  });
  for (let i = 0; i < 100; i += 1) env.gift(GIFT);
  assert.equal(env.calls.save, 0, `100 gåvor gav ${env.calls.save} sparningar`);
  assert.equal(env.calls.render, 0, `100 gåvor gav ${env.calls.render} omritningar`);
});

// ---- men widgeten måste fortfarande uppdateras -----------------------------------------------------
// Patchen ska visa exakt det render() hade visat — den läser widgetens fält, inte eventet.
// Att widget.profileImage aldrig sätts av den här livevägen är ett eget glapp (avataren står kvar);
// det testas nedan så att det står skrivet i stället för att döljas av patchen.
test('Top Gift målas om i den DOM som redan står på skärmen', () => {
  const dom = topGiftNode('g1');
  const env = makeEnv({
    widgets: [{ id: 'g1', type: 'templateTopGift', profileImage: 'https://cdn/p.jpg' }],
    dom: [dom]
  });
  env.gift(GIFT);

  assert.equal(dom.querySelector('.vyra-gift-face img').src, 'assets/gifts/rose.png', 'gåvobilden');
  assert.equal(dom.querySelector('.vyra-profile-face img').src, 'https://cdn/p.jpg', 'profilbilden');
  assert.match(dom.querySelector('.topgift-copy strong').textContent, /wpwer17/, 'namnet');
  assert.match(dom.querySelector('.topgift-copy em').textContent, /10/, 'värdet');
});

test('Top Gift behåller ikonen framför värdet', () => {
  const dom = topGiftNode('g1');
  const env = makeEnv({ widgets: [{ id: 'g1', type: 'templateTopGift' }], dom: [dom] });
  env.gift(GIFT);
  assert.equal(dom.querySelector('.topgift-copy em').textContent, '◉ 10',
    'ikonen framför värdet skrevs över — patchen ska bara byta siffran');
});

test('Top Streak målas om i sin egen DOM', () => {
  const dom = topStreakNode('s1');
  const env = makeEnv({
    widgets: [{ id: 's1', type: 'templateTopStreak', profileImage: 'https://cdn/p.jpg' }],
    dom: [dom]
  });
  env.gift(GIFT);

  assert.equal(dom.querySelector('.streak-gift-face img').src, 'assets/gifts/rose.png');
  assert.equal(dom.querySelector('.streak-profile-face img').src, 'https://cdn/p.jpg');
  assert.match(dom.querySelector('.streak-copy strong').textContent, /wpwer17/);
  // ×3, inte ×10: siffran är GIFT.count (combolängden), inte GIFT.coins. Fram till A2 delade
  // Top Gift och Top Streak samma gren och båda visade coins, vilket är den bugg A2 rättar —
  // den här raden förväntade sig alltså tidigare det felaktiga värdet. Separationen i sig bevisas
  // i tests/top-streak-separation.test.js; här kontrolleras bara att värdet hamnar rätt i DOM:en.
  assert.equal(dom.querySelector('.streak-score b').textContent, '×3',
    'streakens värde sitter i .streak-score b med × framför, inte i ett <em>');
});

test('Clean Flip malas om: namnet i strong, talet i <b> - prefixet och STREAK ror patchen inte', () => {
  // Uppmatt 2026-09-20 fore fixen: SHAPES traffade .streak-copy/.streak-score, som Clean Flip inte
  // har, sa patchen skrev ingenting och widgeten stod pa demovardena hela sandningen.
  const dom = cleanStreakNode('s1');
  const env = makeEnv({
    widgets: [{ id: 's1', type: 'templateTopStreak', profileImage: 'https://cdn/p.jpg' }],
    dom: [dom]
  });
  env.gift(GIFT);
  assert.equal(dom.querySelector('.streak-gift-face img').src, 'assets/gifts/rose.png');
  assert.equal(dom.querySelector('.streak-profile-face img').src, 'https://cdn/p.jpg');
  assert.equal(dom.querySelector('.approved-streak-copy strong').textContent, 'wpwer17', 'namnet');
  assert.equal(dom.querySelector('.approved-streak-copy b').textContent, '3',
    'talet ar combolangden (count), skrivet i <b> utan eget prefix');
  assert.equal(dom.querySelector('.approved-streak-copy em').textContent, '× STREAK',
    'em-textnoden rors inte - × och STREAK star kvar runt talet');
});

test('Top Streak rör inte mekanismraden', () => {
  const dom = topStreakNode('s1');
  const env = makeEnv({ widgets: [{ id: 's1', type: 'templateTopStreak' }], dom: [dom] });
  env.gift(GIFT);
  assert.deepEqual(
    dom.querySelectorAll('.streak-mechanism em').map(el => el.textContent),
    ['GOOD', 'GREAT', 'AMAZING', 'LEGENDARY'],
    'GOOD/GREAT/AMAZING/LEGENDARY är etiketter, inte värden — ett blankt em-urval skriver över dem');
});

test('livevägen sätter fortfarande inte widget.profileImage — avataren är ett eget glapp', () => {
  const env = makeEnv({
    widgets: [{ id: 'g1', type: 'templateTopGift' }],
    dom: [topGiftNode('g1')]
  });
  env.gift(GIFT);
  assert.equal(env.state.widgets[0].profileImage, undefined,
    'om detta börjar sättas är avatarglappet löst — uppdatera då raden i live-readiness-matrisen');
});

test('Gift Campaign räknar upp rätt plats i DOM:en', () => {
  const dom = campaignNode('c1', 2);
  const env = makeEnv({
    widgets: [{ id: 'c1', type: 'templateGiftCampaign', giftName0: 'Rose', giftCurrent0: 0 }],
    dom: [dom]
  });
  env.gift(GIFT);

  const slots = dom.querySelectorAll('article');
  assert.equal(slots[0].querySelector('b').textContent, '3', 'första platsen räknade inte upp med count');
  assert.equal(slots[1].querySelector('b').textContent, '0', 'fel plats räknades upp');
  assert.equal(slots[0].querySelector('u').style.width, '3%', 'förloppsstapeln följde inte med');
});

// ---- state får fortfarande uppdateras, bara inte sparas --------------------------------------------
test('widgetobjekten uppdateras fortfarande, så en senare sparning behåller kampanjen', () => {
  const env = makeEnv({
    widgets: [{ id: 'c1', type: 'templateGiftCampaign', giftName0: 'Rose', giftCurrent0: 5 }],
    dom: [campaignNode('c1', 2)]
  });
  env.gift(GIFT);
  assert.equal(Number(env.state.widgets[0].giftCurrent0), 8,
    'kampanjens summa räknas inte längre upp i widgeten — då tappas den vid nästa render');
});

// ---- patchvägens form ------------------------------------------------------------------------------
test('patchen skriver aldrig innerHTML och ersätter aldrig en nod', () => {
  const code = SOURCE.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  assert.ok(!/innerHTML/.test(code), 'patchen bygger om markup i stället för att skriva textContent');
  assert.ok(!/\breplaceChild\b|\bouterHTML\b/.test(code), 'patchen byter ut noder');
});

test('widget-id jämförs exakt, aldrig genom en interpolerad selektor', () => {
  const code = SOURCE.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  assert.match(code, /dataset\.id\s*===/,
    'id jämförs inte exakt — en selektor byggd av ett widget-id är en injektionsyta');
});

test('en widget med liknande id röres inte', () => {
  const mine = topGiftNode('g1'), other = topGiftNode('g1-kopia');
  const env = makeEnv({
    widgets: [{ id: 'g1', type: 'templateTopGift' }],
    dom: [mine, other]
  });
  env.gift(GIFT);
  assert.match(mine.querySelector('strong').textContent, /wpwer17/);
  assert.equal(other.querySelector('strong').textContent, '@StreamQueen', 'fel widget patchades');
});

test('livepatchen skriver aldrig platshallaren @StreamQueen i en sandning', () => {
  // Uppmatt: ett gift-event utan bade username och name lamnade widget.dataName odefinierat, och
  // fallbacken skrev da fabrikens demoperson till DOM:en mitt i sandningen - exakt det
  // live-zero-state.js finns for att forhindra ("no invented person").
  const dom = topGiftNode('g1');
  const env = makeEnv({ widgets: [{ id: 'g1', type: 'templateTopGift' }], dom: [dom], overlay: true });
  env.gift({ type: 'gift', giftName: 'Rose', coins: 30, count: 3 });   // ingen username, inget name
  assert.equal(dom.querySelector('.topgift-copy strong').textContent, '',
    'i overlay ska ett namnlost event ge tomt namn, inte @StreamQueen');
});


// ---- Gift Campaign: gåvans id avgör, inte bara namnet -------------------------------------------------
// David 2026-11-20: "gift champian räknar inte alla gift". TikTok skickar gåvans namn på streamerns
// språk ("Ros"), medan facket bär katalogens namn ("Rose"). Räkningen jämförde bara namn, så av sex
// rosor räknades de två som kom med engelskt namn (uppmätt i studion). Id:t är detsamma på alla
// språk; gåvovalet sparar det i giftId<i>, och ett fack utan sparat id frågar katalogen.
const kampanj = extra => makeEnv({
  widgets: [Object.assign({ id: 'c1', type: 'templateGiftCampaign', giftCurrent0: 0, giftCurrent1: 0 }, extra)],
  dom: [campaignNode('c1', 2)]
});
const gava = (giftName, giftId, count) => ({ type: 'gift', giftName, giftId, username: 'u', coins: count, count });

test('samma gåva på tre språk räknas i facket som bär dess id', () => {
  const env = kampanj({ giftMatch0: 'Rose', giftId0: '5655' });
  env.gift(gava('Rose', '5655', 2)); env.gift(gava('Ros', '5655', 3)); env.gift(gava('Rosa', '5655', 1));
  assert.equal(Number(env.state.widgets[0].giftCurrent0), 6, 'gåvor med annat språks namn räknades inte');
});

test('en annan gåva räknas inte, varken på namn eller id', () => {
  const env = kampanj({ giftMatch0: 'Rose', giftId0: '5655' });
  env.gift(gava('Lejon', '6369', 1));
  assert.equal(Number(env.state.widgets[0].giftCurrent0), 0);
  assert.equal(Number(env.state.widgets[0].giftCurrent1), 0);
});

test('ett fack utan sparat id frågar katalogen efter namnets id', () => {
  const env = kampanj({ giftMatch0: 'Rose' });
  env.sandbox.VyraGavokatalog = { idn: namn => new Set(String(namn).toLowerCase() === 'rose' ? ['5655'] : []) };
  env.gift(gava('Ros', '5655', 4));
  assert.equal(Number(env.state.widgets[0].giftCurrent0), 4);
});

test('ett fack lär sig gåvans id första gången namnet träffar', () => {
  const env = kampanj({ giftMatch0: 'Rose' });
  env.gift(gava('Ros', '5655', 1));
  assert.equal(Number(env.state.widgets[0].giftCurrent0), 0, 'utan id och utan katalog finns inget att känna igen gåvan på');
  env.gift(gava('Rose', '5655', 2));
  assert.equal(env.state.widgets[0].giftId0, '5655');
  env.gift(gava('Ros', '5655', 3));
  assert.equal(Number(env.state.widgets[0].giftCurrent0), 5);
});

test('ett sparat id går före katalogen, och namnet räknas som förut utan id i händelsen', () => {
  const env = kampanj({ giftMatch0: 'Rose', giftId0: '5655' });
  env.sandbox.VyraGavokatalog = { idn: () => new Set(['9999']) };
  env.gift(gava('Annan', '9999', 5));
  assert.equal(Number(env.state.widgets[0].giftCurrent0), 0, 'katalogens id skrev över det id streamern valde');
  env.gift({ type: 'gift', giftName: 'Rose', username: 'u', coins: 2, count: 2 });
  assert.equal(Number(env.state.widgets[0].giftCurrent0), 2);
});

// ---- Gift Campaign: OBS-källan behåller sin räkning när layouten sparas ---------------------------
// David 2026-11-20: "gift champian räknar inte alla gift". Räknaren bor i varje sida för sig, och i
// OBS byts hela layouten ut varje gång studion sparar något. Uppmätt med en riktig OBS-länk: källan
// hade räknat 5 gåvor, studion öppnades och flyttade en ANNAN widget en pixel, och kampanjen i OBS
// föll till 0. Regeln nedan avgör, per fack, vems tal som gäller. `forra` är värdet i den
// konfiguration källan senast tog emot.
const raknare = () => makeEnv({ widgets: [], dom: [] }).sandbox.VyraKampanjRaknare;
const K = (id, n0, n1) => ({ id, type: 'templateGiftCampaign', giftCurrent0: n0, giftCurrent1: n1 });
const tal = w => [Number(w.giftCurrent0), Number(w.giftCurrent1)];

test('en sparning som inte rör räknaren lämnar OBS-källans räkning kvar', () => {
  const R = raknare(), in_ = [K('c1', 0, 0)];
  R.behall(in_, [K('c1', 5, 2)], { forra: { c1: { giftCurrent0: 0, giftCurrent1: 0 } } });
  assert.deepEqual(tal(in_[0]), [5, 2], 'studions sparning skrev över det källan räknat');
});

test('en studio som räknat färre och sparar sänker inte källan', () => {
  const R = raknare(), in_ = [K('c1', 2, 0)];
  R.behall(in_, [K('c1', 7, 0)], { forra: { c1: { giftCurrent0: 0, giftCurrent1: 0 } } });
  assert.deepEqual(tal(in_[0]), [7, 0]);
});

test('ett sparat tal som är högre än källans tas emot', () => {
  const R = raknare(), in_ = [K('c1', 50, 0)];
  R.behall(in_, [K('c1', 7, 0)], { forra: { c1: { giftCurrent0: 2, giftCurrent1: 0 } } });
  assert.deepEqual(tal(in_[0]), [50, 0]);
});

test('ett sparat tal som streamern sänkt tas emot', () => {
  const R = raknare(), in_ = [K('c1', 1, 0)];
  R.behall(in_, [K('c1', 7, 0)], { forra: { c1: { giftCurrent0: 2, giftCurrent1: 0 } } });
  assert.deepEqual(tal(in_[0]), [1, 0], 'en medveten sänkning i panelen gick inte fram');
});

test('en ny sändning tar emot serverns nollor', () => {
  const R = raknare(), in_ = [K('c1', 0, 0)];
  R.behall(in_, [K('c1', 9, 4)], { nollstall: true, forra: { c1: { giftCurrent0: 0, giftCurrent1: 0 } } });
  assert.deepEqual(tal(in_[0]), [0, 0], 'förra sändningens räkning följde med in i den nya');
});

test('första konfigurationen, en ny kampanj och andra widgetar rörs inte', () => {
  const R = raknare();
  const forsta = [K('c1', 3, 1)];
  const minne = R.behall(forsta, [], {});
  assert.deepEqual(tal(forsta[0]), [3, 1]);
  assert.deepEqual(JSON.parse(JSON.stringify(minne)), { c1: { giftCurrent0: 3, giftCurrent1: 1 } }, 'det sparade värdet minns inte till nästa gång');
  const annan = [{ id: 'c1', type: 'templateTopGift', giftCurrent0: 0 }, K('ny', 0, 0)];
  R.behall(annan, [K('c1', 8, 8)], { forra: minne });
  assert.equal(annan[0].giftCurrent0, 0, 'en annan widgettyp fick kampanjens räkning');
  assert.deepEqual(tal(annan[1]), [0, 0]);
});

test('OBS-källan frågar räknaren innan en ny layout läggs in', () => {
  const kod = fs.readFileSync(path.join(__dirname, '..', 'overlay-access.js'), 'utf8');
  const vid = kod.indexOf('VyraKampanjRaknare?.vidKonfig?.(copy.widgets)'), in_ = kod.indexOf('projectReadonlyOverlay({state:copy,extras})');
  assert.ok(vid > 0 && vid < in_, 'räkningen slås inte ihop före att layouten byts ut');
});

// ---- Gift Campaign: serverns total per gåva ------------------------------------------------------
// Servern räknar varje gåva en gång per sändning och stämplar totalen på händelsen
// (server/kampanj-gavor.js, `giftSessionCount`). Sidan ökar facket med SKILLNADEN mot den total den
// senast såg, inte med händelsens eget antal. Uppmätt på lokal kedja med riktig OBS-länk: efter fem
// gåvor och en dubblettleverans visade källan 9, och efter omladdning fortfarande 9 (sparat värde 0).
const stamplad = (id, count, total) => ({ type: 'gift', giftName: 'Rose', giftId: '5655', username: 'u', coins: count, count, id, giftSessionCount: total });
const rosor = env => Number(env.state.widgets[0].giftCurrent0);

test('en tappad händelse hämtas in av nästa, och en dubblett ger noll', () => {
  const env = kampanj({ giftMatch0: 'Rose', giftId0: '5655' });
  env.gift(stamplad('a', 1, 1));
  assert.equal(rosor(env), 1);
  // Händelserna med total 2 och 3 nådde aldrig sidan. Nästa bär totalen 4.
  env.gift(stamplad('d', 1, 4));
  assert.equal(rosor(env), 4, 'de tappade gåvorna räknades aldrig in');
  env.gift(stamplad('d', 1, 4));
  assert.equal(rosor(env), 4, 'en omleverans räknades en gång till');
  env.gift(stamplad('c', 1, 3));
  assert.equal(rosor(env), 4, 'en sen, äldre händelse sänkte eller höjde talet');
});

test('ett tal streamern ställt in för hand står kvar som utgångspunkt', () => {
  const env = kampanj({ giftMatch0: 'Rose', giftId0: '5655' });
  env.gift(stamplad('a', 2, 2));
  env.state.widgets[0].giftCurrent0 = 100;            // panelens "Nu"
  env.gift(stamplad('b', 3, 5));
  assert.equal(rosor(env), 103);
});

test('utan stämpel räknas händelsens antal som förut', () => {
  const env = kampanj({ giftMatch0: 'Rose', giftId0: '5655' });
  env.gift(gava('Rose', '5655', 2)); env.gift(gava('Rose', '5655', 3));
  assert.equal(rosor(env), 5);
});

test('en källa som öppnas mitt i sändningen lyfts till serverns total — aldrig nedåt', () => {
  const env = kampanj({ giftMatch0: 'Rose', giftId0: '5655', giftCurrent0: 2, giftMatch1: 'Galaxy', giftId1: '5826', giftCurrent1: 40 });
  env.sandbox.VyraKampanjRaknare.vidTotaler({ '5655': 9, '5826': 12, '7934': 3 });
  assert.equal(rosor(env), 9, 'det sparade talet stod kvar i stället för serverns');
  assert.equal(Number(env.state.widgets[0].giftCurrent1), 40, 'ett högre, inställt tal sänktes');
  // Nästa gåva bär totalen 10: en till, inte tio till.
  env.gift(stamplad('n', 1, 10));
  assert.equal(rosor(env), 10);
});

test('en ny sändning glömmer förra sändningens totaler', () => {
  const env = kampanj({ giftMatch0: 'Rose', giftId0: '5655' });
  env.gift(stamplad('a', 5, 5));
  for (const fn of env.sandbox.__lyssnare?.['vyra-live-session'] || []) fn({ detail: { event: 'live:start' } });
  env.state.widgets[0].giftCurrent0 = 0;              // serverns nollställning, via konfigurationen
  env.gift(stamplad('b', 1, 1));
  assert.equal(rosor(env), 1, 'den nya sändningens första gåva jämfördes med förra sändningens total');
});

// ---- Gift Campaign: ett fack som läggs till mitt i sändningen -----------------------------------
// David 2026-11-21. Ett nytt fack, eller ett fack som fick en ny gåva, började på 0 fast gåvan redan
// fått gåvor i sändningen, och räknade sedan bara skillnaden mot den total sidan senast sett.
const galax = (id, count, total) => ({ type: 'gift', giftName: 'Galaxy', giftId: '5826', username: 'u', coins: count, count, id, giftSessionCount: total });

test('OBS-källan lyfter ett nytt fack till den total den redan sett för gåvan', () => {
  const env = kampanj({ giftMatch0: 'Rose', giftId0: '5655', giftCurrent0: 4, giftName1: 'Heart Me', giftMatch1: 'Heart Me', giftId1: '7934' });
  const R = env.sandbox.VyraKampanjRaknare;
  R.vidKonfig([Object.assign({}, env.state.widgets[0])]);
  env.gift(galax('g1', 6, 6));                                   // Galaxy har inget fack än
  const ny = Object.assign({}, env.state.widgets[0], { giftName1: 'Galaxy', giftMatch1: 'Galaxy', giftId1: '5826', giftCurrent1: 0 });
  R.vidKonfig([ny]);
  assert.equal(Number(ny.giftCurrent1), 6, 'det nya facket började på 0 i stället för sändningens total');
  assert.equal(Number(ny.giftCurrent0), 4, 'ett fack som inte bytt gåva rördes');
  // Nästa Galaxy bär totalen 7: en till.
  env.state.widgets[0] = ny;
  env.gift(galax('g2', 1, 7));
  assert.equal(Number(env.state.widgets[0].giftCurrent1), 7);
});

test('OBS-källan lyfter inte ett gammalt fack som streamern sänkt', () => {
  const env = kampanj({ giftMatch0: 'Rose', giftId0: '5655' });
  const R = env.sandbox.VyraKampanjRaknare;
  R.vidKonfig([Object.assign({}, env.state.widgets[0])]);
  env.gift(stamplad('a', 8, 8));
  R.vidKonfig([Object.assign({}, env.state.widgets[0])]);       // studion sparar 8
  const sankt = Object.assign({}, env.state.widgets[0], { giftCurrent0: 2 });
  R.vidKonfig([sankt]);
  assert.equal(Number(sankt.giftCurrent0), 2, 'en sänkning i ett fack med samma gåva lyftes tillbaka');
});

test('Studion lyfter ett nytt fack ur sitt eget minne och sedan ur serverns svar', async () => {
  const env = kampanj({ giftMatch0: 'Rose', giftId0: '5655', giftName1: 'Heart Me', giftMatch1: 'Heart Me', giftId1: '7934' });
  env.sandbox.VyraCloudSync = { current: () => ({ workspace: { id: 'ws1' } }) };
  const fragor = [];
  env.sandbox.VyraAuth = { api: async url => { fragor.push(url); return { ok: true, giftCounts: { '5826': 9 } }; } };
  env.gift(galax('g1', 6, 6));
  const w = env.state.widgets[0];
  Object.assign(w, { giftName1: 'Galaxy', giftMatch1: 'Galaxy', giftId1: '5826' });
  env.sandbox.VyraKampanjRaknare.nyaFack(w, 1, 2);
  assert.equal(Number(w.giftCurrent1), 6, 'facket bar inte Studions kända total när det sparades');
  await new Promise(r => setImmediate(r));
  assert.deepEqual(fragor, ['/api/workspaces/ws1/gift-counts']);
  assert.equal(Number(w.giftCurrent1), 9, 'serverns färskare total lyfte inte facket');
  assert.equal(env.calls.save, 0, 'räknarfilen sparade själv');
  assert.equal(Number(w.giftCurrent0), 0, 'ett annat fack rördes');
});

// ---- Gift Campaign: ett tal skrivet för hand når OBS -------------------------------------------
// En höjning i panelen som var LÄGRE än OBS-källans egen räkning togs för studions vanliga räkning
// och stod inte fram. Panelen stämplar nu facket (giftSetAt<i>) när streamern skriver ett tal.
test('ett handskrivet tal tas emot även när det är lägre än källans egen räkning', () => {
  const R = raknare();
  const in_ = [Object.assign(K('c1', 7, 0), { giftSetAt0: '111' })];
  R.behall(in_, [K('c1', 10, 0)], { forra: { c1: { giftCurrent0: 3, giftCurrent1: 0 } } });
  assert.deepEqual(tal(in_[0]), [7, 0], 'streamerns tal gick inte fram till OBS');
});

test('samma stämpel en gång till är studions räkning, inte ett handgrepp', () => {
  const R = raknare();
  const in_ = [Object.assign(K('c1', 7, 0), { giftSetAt0: '111' })];
  R.behall(in_, [K('c1', 10, 0)], { forra: { c1: { giftCurrent0: 3, giftCurrent1: 0, giftSetAt0: '111' } } });
  assert.deepEqual(tal(in_[0]), [10, 0], 'en vanlig sparning sänkte källan');
});

test('panelen stämplar bara ett handskrivet tal, och anropar nyaFack före sparningen', () => {
  const media = fs.readFileSync(path.join(__dirname, '..', 'media.js'), 'utf8');
  const bind = media.slice(media.indexOf('const campaignBind=bind'), media.indexOf("set('#campaignTitle'", media.indexOf('const campaignBind=bind')));
  assert.ok(bind.includes(String.raw`if(/^giftCurrent\d+$/.test(key))w["giftSetAt"+key.slice(11)]=Date.now();save()`), 'panelen stämplar inte ett handskrivet tal');
  assert.match(media, /const foreAntal=campaignGiftCount\(w\);w\.giftCount=\+e\.target\.value;window\.VyraKampanjRaknare\?\.nyaFack\?\.\(w,foreAntal\);save\(\)/);
  const val = fs.readFileSync(path.join(__dirname, '..', 'vyra-kampanj-gavoval.js'), 'utf8');
  const lyft = val.indexOf('VyraKampanjRaknare.nyaFack(w, i, i + 1)'), spara = val.indexOf('save()', lyft);
  assert.ok(lyft > 0 && spara > lyft, 'gåvovalet lyfter inte facket före sparningen');
});

test('Studion lyfter en kampanj som läggs till mitt i sändningen, men inte de fack som redan fanns', () => {
  const env = kampanj({ giftMatch0: 'Rose', giftId0: '5655', giftCurrent0: 3 });
  const varv = () => env.sandbox.bind();
  varv();
  assert.equal(env.calls.bind, 1, 'Studions bind() lindades fel');
  env.gift(stamplad('a', 1, 20));                                // Rose: total 20, facket 4
  varv();                                                        // första varvet minns bara
  env.state.widgets[0].giftCurrent0 = 2;                         // streamern sänker
  env.state.widgets.push({ id: 'c2', type: 'templateGiftCampaign', giftMatch0: 'Rose', giftId0: '5655', giftCurrent0: 0, giftCurrent1: 0 });
  varv();
  assert.equal(Number(env.state.widgets[1].giftCurrent0), 20, 'den nya kampanjen började på 0');
  assert.equal(Number(env.state.widgets[0].giftCurrent0), 2, 'ett fack som redan fanns lyftes tillbaka');
  assert.equal(env.calls.save, 0, 'bevakningen sparade');
});

test('en OBS-länk bevakar inte facken som Studion gör', () => {
  const env = makeEnv({ widgets: [], dom: [], search: '?overlay=1&access=x' });
  assert.ok(/calls.bind/.test(String(env.sandbox.bind)), 'OBS-länkens bind() lindades');
  assert.ok(!/setInterval\s*\(/.test(SOURCE), 'en evig timer håller jsdom-proven vid liv');
});
