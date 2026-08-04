'use strict';
// Gift Fireworks under en riktig combo.
//
// Widgeten tände en enda raket hur stor gåvan än var. Kedjan ser ut så här:
//
//   tiktok-bridge/normalizer.js  ->  count: repeatCount        (combons storlek)
//   server/event-bus.js          ->  count överlever cleanEvent
//   action-runtime.js            ->  triggerGiftFireworks(payload.combo || payload.repeatcount || 1)
//
// Eventet bär `count`. Det bär varken `combo` eller `repeatcount`, så uttrycket föll alltid igenom
// till 1. buildComboRockets har hela tiden klarat 1–100; det var bara siffran som aldrig kom fram.
//
// Två fel till satt i samma funktion, och de är arkitektoniska: den anropade save() och render() per
// gåva. En full omritning river ner den pågående animationen — vid en 100-combo hundra gånger — och
// save() lade dessutom senaste gåvans combo permanent i den sparade layouten, precis som premiums
// +1-knapp en gång gjorde med sin räknare.
//
// RÖTT NU: fältnamnet, save/render i livevägen, och att en ny gåva startar om en pågående animation.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// ---- en sandlåda som räknar allt widgeten gör -----------------------------------------------------
function makeEnv({ widget = {} } = {}) {
  const calls = { save: 0, render: 0 };
  const classes = new Set();

  const el = (cls = '') => {
    const node = {
      className: cls, children: [], style: { setProperty() {} },
      dataset: {}, innerHTML: '',
      classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
      get offsetWidth() { return 1 },
      append(child) { this.children.push(child) },
      insertBefore(child) { this.children.push(child) },
      remove() {},
      querySelector(sel) { return sel.includes('burst') ? el('fw-burst') : null },
      querySelectorAll(sel) {
        return sel.includes('rocket') ? this.children.filter(c => (c.className || '').includes('fw-rocket')) : [];
      },
      setAttribute() {}, getAttribute: () => null, scrollIntoView() {}
    };
    return node;
  };

  const fx = el('gift-fireworks-fx');
  const state = { widgets: [{ id: 'fw1', type: 'templateGiftFireworks', hidden: false,
    fwDuration: 5, fwGiftImage: 'assets/gifts/rose.png', ...widget }] };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Set, Map, Boolean, Error, Promise, Date,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    document: {
      querySelector: sel => (sel.includes('gift-fireworks-fx') ? fx : null),
      querySelectorAll: () => [],
      createElement: () => el(),
      addEventListener() {}, body: el(), head: el()
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    state, selected: null, view: 'overlay',
    // Renderarna widgeten dekorerar. Fireworks-filen wrappar dem, så de måste finnas.
    wh: () => '', props: () => '', bind: () => {},
    bk: (w, value, _k, fallback) => value || fallback,
    vyraCatalogIcon: () => '', allCampaignGiftChoices: [{ file: 'assets/gifts/rose.png' }],
    toast() {},
    save: () => { calls.save += 1 },
    render: () => { calls.render += 1 }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(read('gift-fireworks.js'), sandbox, { filename: 'gift-fireworks.js' });
  // Modulen ritar en gang vid laddning, och det ar meningen. Raknarna nollstalls darfor har,
  // sa testerna nedan mater livevagen och inte uppstarten.
  calls.save = 0; calls.render = 0;

  return { sandbox, state, calls, fx, classes,
    widget: () => state.widgets[0],
    rockets: () => fx.children.filter(c => (c.className || '').includes('fw-rocket')).length };
}

// ---- fältet som aldrig kom fram -------------------------------------------------------------------
test('action-runtime skickar gåvans count till fyrverkeriet', () => {
  const source = read('action-runtime.js').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  const call = source.slice(source.indexOf('triggerGiftFireworks'));
  const args = call.slice(call.indexOf('('), call.indexOf(')') + 1);

  assert.match(args, /payload\.count/,
    'triggern läser inte payload.count — bryggan skickar combons storlek i just det fältet, '
    + 'och varken combo eller repeatcount finns på eventet');
});

test('fältet finns verkligen kvar hela vägen ut till webbläsaren', () => {
  // Utan det här kan testet ovan bli grönt mot ett fält servern tappar bort.
  const cleanEvent = read('server/event-bus.js');
  assert.match(cleanEvent, /count\s*:\s*Math\.max/,
    'cleanEvent bär inte count längre — då hjälper det inte vad action-runtime läser');
  const normalizer = read('tiktok-bridge/normalizer.js');
  assert.match(normalizer, /count\s*:\s*repeatCount/,
    'bryggan skickar inte längre repeatCount som count');
});

// ---- combon ---------------------------------------------------------------------------------------
test('en combo på 100 bygger 100 raketer', () => {
  const env = makeEnv();
  assert.equal(env.sandbox.triggerGiftFireworks(100), true);
  assert.equal(env.rockets(), 100, 'combon skalar inte — widgeten tänder inte en raket per gåva');
});

test('en ensam gåva ger en raket, och en tvåa ger två', () => {
  for (const [combo, expected] of [[1, 1], [2, 2], [17, 17]]) {
    const env = makeEnv();
    env.sandbox.triggerGiftFireworks(combo);
    assert.equal(env.rockets(), expected, `combo ${combo} gav ${env.rockets()} raketer`);
  }
});

test('över hundra klipps till hundra i stället för att bygga tusentals noder', () => {
  const env = makeEnv();
  env.sandbox.triggerGiftFireworks(5000);
  assert.equal(env.rockets(), 100, 'taket på 100 håller inte — en spam-combo skulle frysa overlayn');
});

test('skräp i antalet ger en raket, inte noll och inte en krasch', () => {
  for (const bad of [undefined, null, 0, -4, NaN, 'många', {}]) {
    const env = makeEnv();
    assert.doesNotThrow(() => env.sandbox.triggerGiftFireworks(bad), `kraschade på ${String(bad)}`);
    assert.equal(env.rockets(), 1, `${String(bad)} gav ${env.rockets()} raketer`);
  }
});

// ---- livevägen får inte spara eller rendera -------------------------------------------------------
test('en gåva varken sparar eller renderar om canvasen', () => {
  const env = makeEnv();
  env.sandbox.triggerGiftFireworks(40);
  assert.equal(env.calls.render, 0,
    'render() per gåva ritar om hela canvasen och river den pågående animationen — '
    + 'vid en 100-combo hundra gånger');
  assert.equal(env.calls.save, 0, 'save() per gåva skriver state på varje gift');
});

test('combon hamnar inte i den sparade widgeten', () => {
  // Samma fälla som premiums +1-knapp: en tillfällig förhandsvisning som blir data.
  const env = makeEnv();
  const before = { ...env.widget() };
  env.sandbox.triggerGiftFireworks(63);
  assert.equal(env.widget().fwCombo, before.fwCombo,
    'senaste gåvans combo skrevs in i layouten och följer med nästa sparning');
});

test('hundra gåvor i rad sparar och renderar fortfarande noll gånger', () => {
  const env = makeEnv();
  for (let i = 0; i < 100; i += 1) env.sandbox.triggerGiftFireworks(1);
  assert.equal(env.calls.render, 0, `100 gåvor gav ${env.calls.render} omritningar`);
  assert.equal(env.calls.save, 0, `100 gåvor gav ${env.calls.save} sparningar`);
});

// ---- den pågående animationen ---------------------------------------------------------------------
test('en gåva mitt i en pågående animation startar inte om den', () => {
  // Samma regel som VyraFlip fick för Top Gift och Top Streak i #52: en ny händelse ska bygga på,
  // inte rycka undan det tittaren redan ser.
  const env = makeEnv();
  env.sandbox.triggerGiftFireworks(10);
  assert.ok(env.classes.has('play'), 'första gåvan startade ingen animation');
  const removals = [];
  env.fx.classList.remove = c => { removals.push(c); env.classes.delete(c) };
  env.sandbox.triggerGiftFireworks(10);
  assert.deepEqual(removals, [],
    'animationen nollställdes av nästa gåva — den syns som ett hack mitt i effekten');
  assert.ok(env.classes.has('play'), 'animationen är inte igång efter den andra gåvan');
});

test('widgeten ar dold: ingenting hander och ingenting kastar', () => {
  // Dolds EFTER uppstart, for sa gar det till i verkligheten: streamern slar av ogat i lagerlistan
  // mitt i sandningen. Ett modulblock i gift-fireworks.js tvingar hidden=false vid laddning, sa en
  // widget som ar dold redan fran borjan gar inte att rigga har.
  const env = makeEnv();
  env.widget().hidden = true;
  assert.equal(env.sandbox.triggerGiftFireworks(20), false);
  assert.equal(env.rockets(), 0, 'en dold widget byggde anda raketer');
});
