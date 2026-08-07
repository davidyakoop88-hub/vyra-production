'use strict';
// window.VyraFlip in media.js is the one piece of timing logic behind both widgets that flip from
// the gift picture to the profile picture: Top Gift (`play`) and Top Streak (`hit`). Every gift makes
// gift-event-images.js call render(), which rebuilds the widget, and the fresh node used to be armed
// from 0% — while neither flip rotates before ~42% of its duration. Gifts arriving closer together
// than that left both widgets frozen on the gift face for the whole stream.
//
// These tests cover the shared helper across every shipped variant, including the ones whose
// duration is not 4.2s: the framed Top Gift (3.8s), the themed and framed Top Streak (3.8s), and the
// ice Top Streak, which drops the wrapper animation entirely and runs the two faces for var(--speed).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { el, makeDocument } = require('./helpers/flip-dom');

const ROOT = path.join(__dirname, '..');
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'studio.css'), 'utf8');

// ---- the durations this suite models are the ones that ship ----------------------------------
const SHIPPED = {
  // Top Gift snurrar hela sändningen: 5 s gåva, 5 s profilbild, om och om igen. Davids krav
  // 2026-08-07 — "den ska inte stanna alls". Cykeln är 10 s med vändningen lagd PÅ slaget, så
  // bytet sker exakt var femte sekund.
  topgift: /\.vyra-topgift\.play \.vyra-flip\{animation:vyraFlipSmooth 10s [^}]*infinite\}/,
  // 0-43 % gåvan (0-4,3 s), vänder över 5-sekundersslaget, 50-93 % profilbilden (5-9,3 s), vänder
  // tillbaka och landar på 360° vid 100 % — samma bild som 0°, så loopen inte hackar vid varvet.
  topgiftCykel: /@keyframes vyraFlipSmooth\{0%,43%\{transform:rotateY\(0\)\}[\s\S]*?50%,93%\{transform:rotateY\(180deg\)\}[\s\S]*?100%\{transform:rotateY\(360deg\)\}\}/,
  // Rekordpulsen har en EGEN klass. Låg den kvar på `play` skulle den bara spelas en gång i
  // sändningen, eftersom en evig flipp aldrig startas om.
  topgiftRekord: /\.vyra-topgift\.record \.vyra-gift-face\{animation:giftPulse 2\.1s/,
  topgiftRoot: /\.vyra-topgift\.play\{animation:vyraAppear 3\.6s/,
  streak: /\.vyra-streak\.hit \.streak-flip\{animation:streakFlip 3\.8s/,
  iceWrapper: /\.streak-ice\.hit \.streak-flip\{animation:none!important\}/,
  iceGift: /\.streak-ice\.hit \.streak-gift-face\{animation:iceGiftOut var\(--speed\)/,
  iceProfile: /\.streak-ice\.hit \.streak-profile-face\{animation:iceProfileIn var\(--speed\)/
};
test('the CSS this suite models is the CSS that ships', () => {
  Object.entries(SHIPPED).forEach(([name, re]) =>
    assert.match(CSS, re, `${name} ser inte ut som testet antar`));
});

test('ingen variant har en egen flipptakt', () => {
  // `.topgift-framed.play .vyra-flip{animation-duration:3.8s}` gav den ramade varianten en egen
  // längd. Med en evig loop blir en avvikande längd ett avvikande BEAT — den ramade hade bytt bild
  // var 1,9:e sekund medan alla andra bytte var 5:e.
  assert.doesNotMatch(CSS, /\.play \.vyra-flip\{animation-duration:/,
    'någon variant sätter fortfarande en egen animation-duration på Top Gift-flippen');
});

// ---- load the helper straight out of media.js -------------------------------------------------
// media.js cannot be evaluated as a whole here (it builds the entire studio), so the two functions
// under test are lifted out by source range. They sit next to each other on purpose.
function sourceOf() {
  const from = MEDIA.indexOf('const VyraFlip=');
  const auto = MEDIA.indexOf('function autoStartAllFlips');
  assert.ok(from > -1 && auto > from, 'VyraFlip/autoStartAllFlips hittades inte i media.js');
  const autoEnd = MEDIA.indexOf('\n', auto);
  return MEDIA.slice(from, autoEnd);
}

// A stand-in for the cascade: which animations the trigger class puts on which part, per variant.
// Durations come from the regexes pinned above; --speed is whatever the markup wrote inline.
function computedStyleFor(node, rootOf) {
  const root = rootOf(node);
  const none = { animationName: 'none', animationDuration: '0s', animationIterationCount: '1' };
  if (!root) return none;
  const on = root._classes.has(root._classes.has('vyra-streak') ? 'hit' : 'play');
  if (!on) return none;
  const has = c => root._classes.has(c);
  const is = c => node._classes.has(c);
  const anim = (animationName, animationDuration, animationIterationCount = '1') =>
    ({ animationName, animationDuration, animationIterationCount });
  if (has('vyra-topgift')) {
    if (node === root) return anim('vyraAppear', '3.6s');
    // Samma 10 s för varenda variant: den ramade har ingen egen längd längre, annars hade den
    // snurrat i en annan takt än resten och 5-sekundersslaget bara gällt vissa teman.
    if (is('vyra-flip')) return anim('vyraFlipSmooth', '10s', 'infinite');
    // Rekordpulsen sitter på sin egen klass och finns bara när ett rekord just slagits.
    if (is('vyra-gift-face')) return has('record') ? anim('giftPulse', '2.1s') : none;
    if (is('vyra-profile-face')) return anim('profileGlow', '4.2s');
    return none;
  }
  if (has('vyra-streak')) {
    const speed = root.style.speed || '3.8s';                       // markup writes --speed inline
    if (node === root) return anim('streakEnter', has('streak-ice') ? speed : '3.8s');
    if (is('streak-flip')) return has('streak-ice') ? none : anim('streakFlip', '3.8s');
    if (is('streak-gift-face')) return has('streak-ice') ? anim('iceGiftOut', speed) : none;
    if (is('streak-profile-face')) return has('streak-ice') ? anim('iceProfileIn', speed) : none;
    return none;
  }
  return none;
}

function harness(now = 1000) {
  const { body, doc } = makeDocument();
  const rafs = [];
  const rootOf = node => {
    let n = node;
    while (n && !(n._classes.has('vyra-topgift') || n._classes.has('vyra-streak'))) n = n.parent;
    return n;
  };
  const sandbox = {
    document: doc, Date: class extends Date {
      constructor(...a) { super(...(a.length ? a : [now])) }
      static now() { return now }
    },
    Math, Number, String, Object, Array, Set, Boolean, JSON,
    getComputedStyle: node => computedStyleFor(node, rootOf),
    requestAnimationFrame: fn => { rafs.push(fn); return rafs.length },
    console: { log() {}, warn() {} }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(sourceOf(), sandbox, { filename: 'media.js#VyraFlip' });
  return {
    body, sandbox,
    VyraFlip: sandbox.window.VyraFlip,
    autoStart: (...a) => sandbox.autoStartAllFlips(...a),
    advance(ms) { now += ms },
    // media.js arms fresh nodes inside two nested rAFs; drain them.
    frames() { for (let i = 0; i < 6 && rafs.length; i += 1) rafs.splice(0).forEach(fn => fn()) },
    delayOf(node) { return -parseFloat(String(node.style.animationDelay || '0')) || 0 }
  };
}

// ---- the shipped variants ---------------------------------------------------------------------
function topGift(id, extraClasses = []) {
  const box = el('div', { classes: ['widget', 'vyra-topgift', ...extraClasses], dataset: { id } });
  const flip = el('div', { classes: ['vyra-flip'] });
  flip.append(el('div', { classes: ['vyra-gift-face'] }), el('div', { classes: ['vyra-profile-face'] }));
  box.append(flip, el('strong'), el('em'));
  return box;
}
function streak(id, extraClasses = [], speed) {
  const box = el('div', { classes: ['widget', 'vyra-streak', ...extraClasses], dataset: { id } });
  if (speed) box.style.speed = speed;
  const flip = el('div', { classes: ['streak-flip'] });
  flip.append(el('div', { classes: ['streak-gift-face'] }), el('div', { classes: ['streak-profile-face'] }));
  box.append(flip, el('b'));
  return box;
}
// `evig` skiljer de två familjerna åt. Top Gift snurrar hela sändningen och kan därför aldrig vara
// "klar"; Top Streak spelar en gång per träff och ska fortsätta göra exakt det.
const VARIANTS = [
  { name: 'Top Gift · standardtema', trigger: 'play', durationMs: 10000, evig: true, build: id => topGift(id, ['theme-neon']) },
  { name: 'Top Gift · ram', trigger: 'play', durationMs: 10000, evig: true, build: id => topGift(id, ['topgift-framed']) },
  { name: 'Top Streak · tema', trigger: 'hit', durationMs: 3800, build: id => streak(id, ['streak-inferno']) },
  { name: 'Top Streak · ram', trigger: 'hit', durationMs: 3800, build: id => streak(id, ['streak-framed']) },
  { name: 'Top Streak · ice', trigger: 'hit', durationMs: 2000, build: id => streak(id, ['streak-ice'], '2s') }
];

for (const v of VARIANTS) {
  test(`${v.name}: en gåva mitt i flippen spolar inte tillbaka animationen`, () => {
    const h = harness();
    const node = v.build('w1');
    h.body.append(node);
    h.VyraFlip.start(node);
    assert.ok(node.classList.contains(v.trigger), 'flippen startade inte');
    h.advance(1000);
    assert.equal(h.VyraFlip.resume(node), true, 'flippen ansågs avslutad efter 1 s');
    assert.ok(Math.abs(h.delayOf(node.querySelector('.vyra-flip,.streak-flip')) - 1000) < 50,
      'förloppet fördes inte över');
  });

  test(`${v.name}: en ombyggd nod återupptas i stället för att spelas om`, () => {
    const h = harness();
    h.body.append(v.build('w1'));
    h.VyraFlip.start(h.body.children[0]);
    const midway = Math.round(v.durationMs * 0.6);
    h.advance(midway);
    // render(): the widget is replaced by a brand new element with no trigger class.
    const fresh = v.build('w1');
    h.body.children.length = 0; h.body.append(fresh);
    h.autoStart(h.sandbox.document); h.frames();
    assert.ok(fresh.classList.contains(v.trigger), `${v.trigger} sattes inte på den nya noden`);
    const part = fresh.querySelector('.vyra-flip,.streak-flip');
    assert.ok(Math.abs(h.delayOf(part) - midway) < 60,
      `förloppet startades om (${h.delayOf(part)} ms, väntade ~${midway} ms)`);
    // The faces carry the animation on the ice variant, so they must be offset as well.
    assert.ok(Math.abs(h.delayOf(fresh.querySelector('.streak-profile-face,.vyra-profile-face')) - midway) < 60,
      'profilbildssidan fick inget förlopp');
    assert.ok(Math.abs(h.delayOf(fresh) - midway) < 60, 'widgetens egen entré spelades om');
  });

  if (!v.evig) {
    test(`${v.name}: flippen mäts efter sin egen längd, inte en hårdkodad siffra`, () => {
      const h = harness();
      const node = v.build('w1');
      h.body.append(node);
      h.VyraFlip.start(node);
      h.advance(v.durationMs - 200);
      assert.equal(h.VyraFlip.resume(node), true, `flippen släpptes ${v.durationMs - 200} ms in`);
      h.advance(400);
      assert.equal(h.VyraFlip.resume(node), false, `flippen höll kvar efter ${v.durationMs + 200} ms`);
    });

    test(`${v.name}: nästa event startar en ny flipp när den förra är klar`, () => {
      const h = harness();
      const node = v.build('w1');
      h.body.append(node);
      h.VyraFlip.start(node);
      h.advance(v.durationMs + 100);
      assert.equal(h.VyraFlip.resume(node), false);
      h.VyraFlip.start(node);
      assert.ok(node.classList.contains(v.trigger));
      assert.equal(h.delayOf(node.querySelector('.vyra-flip,.streak-flip')), 0,
        'en ny flipp ska börja på noll');
    });
  }

  if (v.evig) {
    test(`${v.name}: flippen tar aldrig slut`, () => {
      const h = harness();
      const node = v.build('w1');
      h.body.append(node);
      h.VyraFlip.start(node);
      // En hel sändning, inte bara ett par cykler. Returnerar resume() någonsin false kallar
      // armFlip() start(), och start() spolar tillbaka rotationen — synligt hack mitt i vändningen.
      for (const ms of [5000, 10000, 60000, 600000, 3600000]) {
        h.advance(ms);
        assert.equal(h.VyraFlip.resume(node), true, `flippen ansågs avslutad ${ms} ms senare`);
      }
    });

    test(`${v.name}: en ombyggd nod faller in i fas i stället för att börja om`, () => {
      const h = harness();
      h.body.append(v.build('w1'));
      h.VyraFlip.start(h.body.children[0]);
      h.advance(23000);                                  // 2,3 varv in i loopen
      const fresh = v.build('w1');
      h.body.children.length = 0; h.body.append(fresh);
      h.autoStart(h.sandbox.document); h.frames();
      assert.equal(h.delayOf(fresh.querySelector('.vyra-flip')), 3000,
        'loopen lades inte i fas — 23 000 ms in i en 10 s-cykel är 3 000 ms, inte något annat');
    });

    test(`${v.name}: entrén spelas inte om när loopen slår runt`, () => {
      // Fällan i en naiv modulo: 23 000 % 10 000 = 3 000, och lägger man DEN siffran på widgetens
      // egen 3,6 s-entré spelas den upp igen mitt i sändningen. Bara det som faktiskt loopar får
      // räknas om; allt annat ska stå kvar på sitt verkliga förlopp och alltså vara färdigt.
      const h = harness();
      h.body.append(v.build('w1'));
      h.VyraFlip.start(h.body.children[0]);
      h.advance(23000);
      const fresh = v.build('w1');
      h.body.children.length = 0; h.body.append(fresh);
      h.autoStart(h.sandbox.document); h.frames();
      assert.equal(h.delayOf(fresh), 23000, 'widgetens entré fick loopens fas och spelades om');
      assert.equal(h.delayOf(fresh.querySelector('.vyra-profile-face')), 23000,
        'profilbildens engångsglöd fick loopens fas');
    });

    test(`${v.name}: ett nytt rekord märks utan att loopen rubbas`, () => {
      const h = harness();
      const node = v.build('w1');
      h.body.append(node);
      h.VyraFlip.start(node);
      h.advance(7000);
      const fore = h.delayOf(node.querySelector('.vyra-flip'));
      h.VyraFlip.mark(node);
      assert.ok(node.classList.contains('record'), 'rekordet fick ingen markering');
      assert.equal(h.delayOf(node.querySelector('.vyra-flip')), fore,
        'markeringen rubbade rotationens fas');
      assert.equal(h.delayOf(node.querySelector('.vyra-gift-face')), 0,
        'pulsen ärvde ett förlopp och hann aldrig synas');
    });
  }

  test(`${v.name}: gåvospam låter flippen nå profilbildssidan`, () => {
    // Rotation starts at ~42% of the duration. Under a restart-per-gift this value never grew.
    const h = harness();
    let node = v.build('w1');
    h.body.append(node);
    h.VyraFlip.start(node);
    let reached = 0;
    for (let i = 0; i < 4; i += 1) {
      h.advance(Math.round(v.durationMs / 5));
      const fresh = v.build('w1');                       // every gift rebuilds the widget
      h.body.children.length = 0; h.body.append(fresh);
      h.autoStart(h.sandbox.document); h.frames();
      node = fresh;
      reached = Math.max(reached, h.delayOf(node.querySelector('.vyra-flip,.streak-flip')));
    }
    assert.ok(reached > v.durationMs * 0.42,
      `förloppet nådde bara ${reached} ms av ${v.durationMs} ms — rotationen hann aldrig börja`);
    assert.ok(reached >= v.durationMs * 0.65,
      `profilbildssidan (65 %) nåddes aldrig, bara ${reached} ms`);
  });
}

// ---- widgets that must not be dragged into this ----------------------------------------------
test('autoStartAllFlips rör bara Top Gift och Top Streak', () => {
  const h = harness();
  const fountain = el('div', { classes: ['widget', 'templateLikeFountain'], dataset: { id: 'f1' } });
  const fx = el('div', { classes: ['gift-fireworks-fx'] });
  const other = el('div', { classes: ['widget', 'vyra-toplike'], dataset: { id: 't1' } });
  h.body.append(fountain, fx, other, topGift('g1', ['theme-neon']));
  h.autoStart(h.sandbox.document); h.frames();
  [fountain, fx, other].forEach(node => {
    assert.ok(!node.classList.contains('play'), `${node.className} fick play`);
    assert.ok(!node.classList.contains('hit'), `${node.className} fick hit`);
    assert.equal(node.style.animationDelay, undefined, `${node.className} fick ett animation-delay`);
  });
  assert.ok(h.body.children[3].classList.contains('play'), 'Top Gift armerades inte');
});

test('en Top Streak-flipp stör inte en Top Gift-flipp och tvärtom', () => {
  const h = harness();
  const gift = topGift('g1', ['theme-neon']), str = streak('s1', ['streak-inferno']);
  h.body.append(gift, str);
  h.VyraFlip.start(gift);
  h.advance(2000);
  h.VyraFlip.start(str);
  assert.equal(h.delayOf(str.querySelector('.streak-flip')), 0, 'streaken ärvde Top Gifts förlopp');
  assert.equal(h.VyraFlip.resume(gift), true, 'Top Gifts flipp avbröts av streaken');
  assert.ok(Math.abs(h.delayOf(gift.querySelector('.vyra-flip')) - 2000) < 50);
});

test('en widget som aldrig fått en flipp återupptas inte', () => {
  const h = harness();
  const node = topGift('g1', ['theme-neon']);
  h.body.append(node);
  assert.equal(h.VyraFlip.resume(node), false);
  assert.ok(!node.classList.contains('play'));
});

test('autoStartAllFlips armerar varje widget en gång, inte om och om igen', () => {
  const h = harness();
  const node = topGift('g1', ['theme-neon']);
  h.body.append(node);
  h.autoStart(h.sandbox.document); h.frames();
  h.advance(2500);
  h.autoStart(h.sandbox.document); h.frames();          // observern kör vid varje DOM-ändring
  assert.equal(h.delayOf(node.querySelector('.vyra-flip')), 0,
    'en redan armerad nod skrevs om av en senare svep');
});
