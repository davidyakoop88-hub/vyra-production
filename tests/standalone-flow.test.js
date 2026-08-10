'use strict';
// The product flow, end to end through the real UI handlers: a click on a catalog card's 🔗 creates
// or reuses a standalone instance, the server answers, and only then is there a link — which
// ?widget= then renders.
//
// The handlers are lifted out of the shipped sources rather than re-implemented, so a test cannot
// pass against a copy of the flow that no longer matches what the button does.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
// Shared with the one-shot transform: one implementation decides build time vs click time.
const { classifyCatalogSites, count, handlerSpans } = require('./helpers/catalog-sites.js');

const ROOT = path.join(__dirname, '..');
const VyraWidgets = require(path.join(ROOT, 'widget-factory.js'));
const MEDIA = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
const PREVIEW = fs.readFileSync(path.join(ROOT, 'overlay-preview.js'), 'utf8');
const EMPTY = [].join("");   // tom sträng utan att bråka med escaping i genereringen

// The 🔗 handler, exactly as overlay-preview.js defines it.
const LINK_HANDLER = (() => {
  const start = PREVIEW.indexOf('    linkBtn.onclick = async e => {');
  const end = PREVIEW.indexOf('\n    };', start);
  assert.ok(start > -1 && end > start, 'hittade inte 🔗-handlern');
  // Include the closing brace: the marker sits at the '};' that ends the handler.
  return PREVIEW.slice(start + '    linkBtn.onclick = '.length, end) + String.fromCharCode(10) + '    }';
})();

function harness(options = {}) {
  const state = { widgets: (options.widgets || []).slice() };
  const calls = { pushes: 0, toasts: [], copied: [], rendered: 0, tokenFlow: 0 };
  const sandbox = {
    console, JSON, Math, Number, String, Object, Array, Set, Map, Boolean, Date, Promise, Error, URL,
    crypto: require('crypto').webcrypto, Uint32Array,
    state, VyraWidgets,
    location: { protocol: 'https:', search: '' },
    toast: msg => { calls.toasts.push(String(msg)) },
    render: () => { calls.rendered += 1 },
    // No secure link means the parameter is absent entirely, which is what overlayShareBase()
    // returns before one has been created.
    owgWidgetUrl: id => 'https://vyralive.app/overlay.html?' +
      (options.access === false ? '' : 'access=SECRET-TOKEN') + (id ? '&widget=' + id : ''),
    owgCopyWidgetLink: async id => {
      if (options.clipboardFails) throw new Error('clipboard denied');
      calls.copied.push(id);
    },
    document: { querySelector: () => ({ click: () => { calls.tokenFlow += 1 } }) },
    btn: { dataset: options.dataset === undefined ? { catalogKey: 'catalog:toplike:neon' } : options.dataset },
    overlayPreviewWidgetId: null, overlayDraftPreviewHtml: null, overlayDraftPreviewName: null
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'standalone-links.js'), 'utf8'), sandbox);

  const deps = {
    widgets: VyraWidgets, workspaceId: 'ws-1',
    fetchJson: async () => ({ limits: { widgets: options.limit ?? 500 } }),
    save: () => {},
    sync: { push: async () => { calls.pushes += 1; return options.push ? options.push(calls.pushes) : { ok: true } } }
  };
  // The handler calls window.VyraStandalone.create(key) with no deps; bind the test's ones here so
  // the handler source stays untouched.
  const real = sandbox.window.VyraStandalone;
  sandbox.window.VyraStandalone = {
    create: key => real.create(key, deps),
    deleteStandalone: (id, d) => real.deleteStandalone(id, Object.assign({}, deps, { confirm: options.confirm }, d))
  };

  const handler = vm.runInNewContext('(' + LINK_HANDLER + ')', sandbox);
  return { sandbox, state, calls, click: () => handler({ stopPropagation() {} }) };
}

// ---- catalog click -> create -> ok -> link -> render ---------------------------------------------
test('katalogklick skapar en standalone, kopierar länken och den renderas via ?widget=', { timeout: 5000 }, async () => {
  const h = harness();
  await h.click();
  assert.equal(h.state.widgets.length, 1);
  const created = h.state.widgets[0];
  assert.equal(VyraWidgets.isStandalone(created), true, 'instansen blev inte standalone');
  assert.deepEqual(h.calls.copied, [created.id], 'länken kopierades inte för den skapade widgeten');
  assert.equal(h.calls.pushes, 1);
  // The full layout does not show it; its own link does.
  assert.deepEqual(VyraWidgets.selectForRender(h.state.widgets, {}).widgets, []);
  const picked = VyraWidgets.selectForRender(h.state.widgets, { widgetId: created.id });
  assert.deepEqual(picked.widgets.map(w => w.id), [created.id]);
  assert.equal(picked.error, null);
});

test('andra klicket på samma kort återanvänder instansen utan nytt serveranrop', { timeout: 5000 }, async () => {
  const h = harness();
  await h.click();
  const first = h.state.widgets[0].id;
  await h.click();
  assert.equal(h.state.widgets.length, 1, 'en dubblett skapades');
  assert.equal(h.state.widgets[0].id, first, 'ID:t ändrades');
  assert.deepEqual(h.calls.copied, [first, first]);
  assert.equal(h.calls.pushes, 1, 'servern anropades igen för en återanvänd instans');
});

test('dubbelklick ger en instans och ett serveranrop', { timeout: 5000 }, async () => {
  const h = harness();
  await Promise.all([h.click(), h.click()]);
  assert.equal(h.state.widgets.length, 1);
  assert.equal(h.calls.pushes, 1);
});

// ---- refusals ------------------------------------------------------------------------------------
test('402 tar bort endast kandidaten och kopierar ingen länk', { timeout: 5000 }, async () => {
  const other = { id: 'layout-a', type: 'templateTopLike' };
  const h = harness({ widgets: [other], push: () => ({ ok: false, status: 402 }) });
  await h.click();
  assert.deepEqual(h.state.widgets.map(w => w.id), ['layout-a'], 'kandidaten blev kvar');
  assert.deepEqual(h.calls.copied, [], 'en länk kopierades trots avslag');
  assert.match(h.calls.toasts.join(' '), /Uppgradera/);
});

test('409 visar exakt "Ladda om och försök igen" och ingen länk', { timeout: 5000 }, async () => {
  const h = harness({ push: () => ({ ok: false, status: 409 }) });
  await h.click();
  assert.deepEqual(h.calls.copied, []);
  assert.equal(h.state.widgets.length, 0);
  assert.ok(h.calls.toasts.some(t => t.includes('Ladda om och försök igen')),
    `saknade konfliktmeddelandet: ${h.calls.toasts.join(' | ')}`);
});

test('limit 0 blockeras utan serveranrop och utan länk', { timeout: 5000 }, async () => {
  const h = harness({ limit: 0 });
  await h.click();
  assert.equal(h.state.widgets.length, 0);
  assert.equal(h.calls.pushes, 0);
  assert.deepEqual(h.calls.copied, []);
  assert.match(h.calls.toasts.join(' '), /Uppgradera/);
});

test('inget UI-meddelande bär token, access eller rått serverfel', { timeout: 5000 }, async () => {
  for (const push of [
    () => ({ ok: false, status: 402 }), () => ({ ok: false, status: 409 }),
    () => { throw new Error('PUT https://vyralive.app/overlay.html?access=SECRET-TOKEN 500') }
  ]) {
    const h = harness({ push });
    await h.click();
    const shown = h.calls.toasts.join(' | ');
    for (const leak of ['SECRET-TOKEN', 'access=', 'https://', '500', 'PUT ']) {
      assert.ok(!shown.includes(leak), `meddelandet läckte ${leak}: ${shown}`);
    }
  }
});

// ---- access base ---------------------------------------------------------------------------------
test('utan säker länk öppnas tokenflödet och ingen kandidat skapas', { timeout: 5000 }, async () => {
  const h = harness({ access: false });
  await h.click();
  assert.equal(h.calls.tokenFlow, 1, 'tokenflödet öppnades inte');
  assert.equal(h.state.widgets.length, 0, 'en kandidat skapades ändå');
  assert.equal(h.calls.pushes, 0);
  assert.deepEqual(h.calls.copied, []);
});

// ---- the catalog key -----------------------------------------------------------------------------
test('saknad dataset.catalogKey ger tydligt fel utan factory och utan stateändring', { timeout: 5000 }, async () => {
  const h = harness({ dataset: {} });
  await h.click();
  assert.equal(h.state.widgets.length, 0);
  assert.equal(h.calls.pushes, 0);
  assert.deepEqual(h.calls.copied, []);
  assert.ok(h.calls.toasts.length === 1 && h.calls.toasts[0].length > 0, 'inget felmeddelande visades');
});

test('ogiltig dataset.catalogKey hanteras utan rått fel eller token', { timeout: 5000 }, async () => {
  const h = harness({ dataset: { catalogKey: 'catalog:finns-inte:alls' } });
  await h.click();
  assert.equal(h.state.widgets.length, 0, 'en widget skapades av en ogiltig nyckel');
  assert.deepEqual(h.calls.copied, []);
  const shown = h.calls.toasts.join(' | ');
  assert.ok(shown.length > 0, 'inget meddelande visades');
  for (const leak of ['SECRET-TOKEN', 'access=', 'https://']) {
    assert.ok(!shown.includes(leak), `meddelandet läckte ${leak}`);
  }
});

// A deterministic scanner over media.js, not a regular expression. Every check below walks the
// string once with plain indexOf: the earlier version used an alternating lazy group, which is
// catastrophic backtracking waiting to happen — and did happen, hanging the suite for ten minutes
// the first time a site stopped matching its tail.
function catalogSites(source) {
  const sites = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf('catalogKey=', from);
    if (at === -1) break;
    from = at + 'catalogKey='.length;
    // Skip the publication itself; we are looking for the binding.
    if (source.lastIndexOf('.dataset.', at) === at - 9) continue;
    // The binding runs to the first ; or , at nesting depth zero.
    let depth = 0, quote = '', end = -1;
    for (let i = from; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) { if (ch === quote && source.charCodeAt(i - 1) !== 92) quote = EMPTY; continue }
      if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue }
      if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      else if (ch === ')' || ch === ']' || ch === '}') { if (!depth) { end = i; break } depth -= 1 }
      else if ((ch === ',' || ch === ';') && !depth) { end = i; break }
    }
    if (end === -1) break;
    sites.push({ at, expression: source.slice(from, end) });
    from = end;
  }
  return sites;
}

test('varje katalogknapp publicerar exakt den nyckel den skickar till factoryn', { timeout: 5000 }, () => {
  // The shared classifier counts publications, not bindings: addBoostPack's parameter default
  //  is a binding but publishes nothing, and counting bindings would make it a 22nd site.
  const r = count(MEDIA);
  assert.equal(r.total, 21, 'antal publiceringar');
  assert.equal(r.insideDirectOnclick, 0, 'en nyckel publiceras inuti en klickhandler');
  assert.equal(MEDIA.split('VyraWidgets.create(catalogKey').length - 1, 21,
    'något kataloganrop använder inte den bundna nyckeln');
  assert.equal(MEDIA.split("VyraWidgets.create('catalog:").length - 1, 0,
    'en katalognyckel skrivs fortfarande som literal i ett factory-anrop');
});



test('🔗 läser endast btn.dataset.catalogKey', { timeout: 5000 }, () => {
  assert.match(LINK_HANDLER, /const catalogKey = btn\.dataset\.catalogKey;/);
  // No key assembled here, and nothing read from an input.
  assert.ok(!/['"]catalog:/.test(LINK_HANDLER), 'handlern bygger en egen katalognyckel');
  assert.ok(!/\.value|prompt\(|innerText/.test(LINK_HANDLER), 'handlern läser användarinmatning');
});

// ---- clipboard -----------------------------------------------------------------------------------
test('clipboard-fel efter lyckad sparning raderar inte widgeten', { timeout: 5000 }, async () => {
  const h = harness({ clipboardFails: true });
  await h.click().catch(() => {});
  assert.equal(h.state.widgets.length, 1, 'widgeten togs bort när kopieringen misslyckades');
  assert.equal(VyraWidgets.isStandalone(h.state.widgets[0]), true);
});

// ---- unchanged surfaces --------------------------------------------------------------------------
test('"Lägg till i Layout" använder fortfarande sin egen handler', { timeout: 5000 }, () => {
  const add = /btn\.onclick = function \(e\) \{[\s\S]*?\n    \};/.exec(PREVIEW);
  assert.ok(add, 'hittade inte Lägg till i Layout-handlern');
  assert.match(add[0], /originalClick\.call\(btn, e\)/);
  assert.ok(!add[0].includes('VyraStandalone'), 'Layout-knappen går numera via standalone-flödet');
});

test('länk för en befintlig layoutwidget skapar ingen instans', { timeout: 5000 }, () => {
  const bind = /function bindOverlayPreview\(\)\{?[\s\S]*?\n\}/.exec(PREVIEW);
  assert.ok(bind, 'hittade inte bindOverlayPreview');
  assert.match(bind[0], /owgCopyWidgetLink\(button\.dataset\.copyWidgetLink\)/);
  assert.ok(!bind[0].includes('VyraStandalone'), 'befintliga widgetlänkar går via skapandeflödet');
});

// ---- deletion ------------------------------------------------------------------------------------
test('raderingsknappen visas bara för en standalone-instans', { timeout: 5000 }, () => {
  assert.match(MEDIA, /del\.hidden=!VyraWidgets\.isStandalone\(w\)/,
    'raderingsknappen döljs inte för layoutwidgets');
  assert.match(MEDIA, /<button id="deleteStandaloneWidget" hidden>/,
    'raderingsknappen börjar inte dold');
});

test('radering påverkar endast rätt ID och kräver bekräftelse', { timeout: 5000 }, async () => {
  const target = VyraWidgets.create('catalog:toplike:neon', { placement: 'standalone' });
  const keep = VyraWidgets.create('catalog:topgift:neon', { placement: 'standalone' });
  const layout = { id: 'layout-a', type: 'templateTopLike' };

  const cancelled = harness({ widgets: [layout, target, keep], confirm: () => false });
  const no = await cancelled.sandbox.window.VyraStandalone.deleteStandalone(target.id);
  assert.equal(no.deleted, false);
  assert.equal(cancelled.state.widgets.length, 3, 'något raderades trots avbruten bekräftelse');

  const accepted = harness({ widgets: [layout, target, keep], confirm: () => true });
  const yes = await accepted.sandbox.window.VyraStandalone.deleteStandalone(target.id);
  assert.equal(yes.deleted, true);
  assert.deepEqual(accepted.state.widgets.map(w => w.id), [layout.id, keep.id],
    'fel widget påverkades av raderingen');
  // The link is dead from here on.
  assert.equal(VyraWidgets.selectForRender(accepted.state.widgets, { widgetId: target.id }).error,
    'missing-widget');
});

// ---- klassificerarens regressionsfall ----------------------------------------------------------
const PUB = '.dataset.catalogKey=catalogKey';
const verdicts = src => classifyCatalogSites(src).map(s => (s.insideDirectOnclick ? 'click' : 'build'));

test('två handlers med samma knappnamn på samma rad klassas var för sig', { timeout: 5000 }, () => {
  // The shape that broke the positional version: three lines in media.js carry two catalog sites
  // each, and both use the button name `b`, so comparing against the first `b.onclick=` on the line
  // judged the second site against the first site's handler.
  const src = "forEach(b=>{const catalogKey='a';b" + PUB + ";b.onclick=()=>{f()}});" +
    "forEach(b=>b.onclick=()=>{const catalogKey='c';b" + PUB + ";g()});";
  assert.deepEqual(verdicts(src), ['build', 'click']);
});

test('publicering före, mellan och inuti handlers', { timeout: 5000 }, () => {
  const before = "b" + PUB + ";b.onclick=()=>{x()};b.onclick=()=>{y()};";
  const between = "b.onclick=()=>{x()};b" + PUB + ";b.onclick=()=>{y()};";
  const inside = "b.onclick=()=>{x()};b.onclick=()=>{b" + PUB + ";y()};";
  assert.deepEqual(verdicts(before), ['build'], 'före första handlern');
  assert.deepEqual(verdicts(between), ['build'], 'mellan två handlers');
  assert.deepEqual(verdicts(inside), ['click'], 'inuti andra handlern');
});

test('videons IIFE inne i handlern är klicktid trots semikolonet', { timeout: 5000 }, () => {
  const src = "const btn=c.querySelector('.use-media');btn.onclick=()=>{" +
    "state.widgets.push((()=>{const catalogKey='catalog:video';btn" + PUB + ";" +
    "return VyraWidgets.create(catalogKey,{values:{}})})())};";
  assert.deepEqual(verdicts(src), ['click']);
});

test('boostpaketets gamla indirekta sourceButton dokumenteras som utanför direkt onclick', { timeout: 5000 }, () => {
  // The documented indirect case: the publication sits in a function body reached only from a
  // handler, so a lexical scanner cannot see it as click time. That is why the transform removes the
  // publication from addBoostPack entirely rather than relying on the label.
  const old = "function addBoostPack(id,m,k,sourceButton){let catalogKey='x',g=(sourceButton" + PUB + ",create(catalogKey))};" +
    "forEach(b=>b.onclick=()=>addBoostPack(1,2,3,b));";
  assert.deepEqual(verdicts(old), ['build'],
    'det indirekta fallet ska rapporteras som utanför direkt onclick, inte gissas');
});

test('den nya boost-closuren publicerar vid byggtid', { timeout: 5000 }, () => {
  const now = "forEach(b=>{const catalogKey='catalog:glovesnipe:x:tap:2';b" + PUB + ";" +
    "b.onclick=()=>addBoostPack(b.dataset.vp,+b.dataset.vm,b.dataset.vk,catalogKey)});";
  assert.deepEqual(verdicts(now), ['build']);
});

test('.onclick i strängar, templates och kommentarer öppnar inget handler-span', { timeout: 5000 }, () => {
  const noisy = "const s='b.onclick=()=>{';const t=`b.onclick=()=>{${x}`;// b.onclick=()=>{\n" +
    "/* b.onclick=()=>{ */b" + PUB + ";b.onclick=()=>{run()};";
  assert.deepEqual(verdicts(noisy), ['build'],
    'ett citerat eller kommenterat .onclick räknades som en riktig handler');
  const spans = handlerSpans("const s='b.onclick=()=>{';// b.onclick=()=>{\nb.onclick=()=>{run()};");
  assert.equal(spans.length, 1, `hittade ${spans.length} handler-span, väntade 1`);
});

test('== och === förväxlas inte med en tilldelning', { timeout: 5000 }, () => {
  const src = "if(el.onclick===fn){}b" + PUB + ";b.onclick=()=>{run()};";
  assert.deepEqual(verdicts(src), ['build']);
});

// ---- the real file --------------------------------------------------------------------------------
test('aktuell media.js: 21 platser, alla utanför direkt onclick', { timeout: 5000 }, () => {
  const r = count(fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8'));
  assert.equal(r.total, 21, `factoryplatser: ${r.total}`);
  assert.equal(r.insideDirectOnclick, 0,
    `publiceringar inuti direkt onclick: ${r.sites.filter(s => s.insideDirectOnclick).map(s => s.button).join(', ')}`);
  assert.equal(r.outsideDirectOnclick, 21);
  assert.equal(new Set(r.sites.map(s => s.publishAt)).size, 21, 'unika publiceringspositioner');
});

test('addBoostPack publicerar inte längre någon nyckel', { timeout: 5000 }, () => {
  const media = fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8');
  const at = media.indexOf('function addBoostPack(');
  assert.notEqual(at, -1, 'addBoostPack saknas');
  const body = media.slice(at, at + 700);
  assert.ok(!body.includes('sourceButton'), 'addBoostPack har kvar sourceButton');
  assert.ok(!body.includes('dataset.catalogKey'), 'addBoostPack publicerar fortfarande nyckeln');
  assert.ok(!media.includes('sourceButton'), 'sourceButton finns kvar någonstans i filen');
  const loopAt = media.indexOf("wrap.querySelectorAll('button')");
  const loop = media.slice(loopAt, loopAt + 320);
  assert.ok(loop.indexOf('b.dataset.catalogKey=catalogKey') < loop.indexOf('b.onclick='),
    'boostloopen sätter nyckeln efter onclick');
  assert.match(loop, /addBoostPack\(b\.dataset\.vp,\+b\.dataset\.vm,b\.dataset\.vk,catalogKey\)/,
    'boostloopen skickar inte closure-nyckeln');
});
