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

function makeEnv({ widgets, dom }) {
  const calls = { save: 0, render: 0 };
  const root = node('div', 'canvas');
  dom.forEach(d => root.append(d));

  const listeners = {};
  const state = { widgets };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Map, Set, Boolean, Error,
    document: {
      querySelector: sel => root.querySelector(sel),
      querySelectorAll: sel => root.querySelectorAll(sel)
    },
    addEventListener: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn) },
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
  vm.runInNewContext(SOURCE, sandbox, { filename: 'gift-event-images.js' });

  const gift = detail => {
    for (const fn of listeners['vyra-live-event'] || []) fn({ detail });
  };
  return { sandbox, state, calls, root, gift };
}

const GIFT = { type: 'gift', giftName: 'Rose', username: 'wpwer17', coins: 10, count: 3,
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
  assert.equal(dom.querySelector('.streak-score b').textContent, '×10',
    'streakens värde sitter i .streak-score b med × framför, inte i ett <em>');
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
