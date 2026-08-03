'use strict';
// A TikTok viewer chooses their own display name, and that name reaches every widget renderer as
// w.dataName / w.followName / w.fanName / w.gifterName / w.mvpName / w.fountainUser, then goes into
// innerHTML. Their avatar URL reaches w.profileImage and the gift picture w.giftImage, both of which
// land inside src="…". Before overlay-sanitize.js there was no escaping anywhere in the render path,
// so a name could close the surrounding tag and run script — in the overlay in front of an audience
// and in the streamer's own Studio, stored, because save() writes it back to the cloud state.
//
// These tests drive the real renderer sources with hostile values and assert on the produced markup:
// no new element, no event handler attribute, no scheme that can execute. They deliberately do not
// assert on the surrounding design — escaping a name that contains no HTML metacharacters must leave
// the markup byte-identical, and that is asserted too.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const VyraSafe = require(path.join(ROOT, 'overlay-sanitize.js'));

// The payloads. Each one is a real technique, not a variation on the same one.
const HOSTILE_TEXT = [
  ['tag break-out', '"><img src=x onerror=alert(1)>'],
  ['script element', '<script>alert(1)</script>'],
  ['single-quoted attribute', "' onmouseover='alert(1)"],
  ['unquoted attribute', '` onload=alert(1) `'],
  ['svg handler', '<svg/onload=alert(1)>'],
  ['closing the style attribute', '";background:url(//evil.example/x);"'],
  ['entity-looking but literal', '&lt;img src=x onerror=alert(1)&gt;'],
  ['iframe', '<iframe src=javascript:alert(1)></iframe>'],
  ['body handler', '<body onload=alert(1)>'],
  ['nested quotes', '"\'`<>&']
];

const HOSTILE_URL = [
  ['javascript', 'javascript:alert(1)'],
  ['javascript, mixed case', 'JaVaScRiPt:alert(1)'],
  ['javascript, tab-split scheme', 'java\tscript:alert(1)'],
  ['javascript, newline-split scheme', 'java\nscript:alert(1)'],
  ['javascript, leading control byte', '\u0001javascript:alert(1)'],
  ['vbscript', 'vbscript:msgbox(1)'],
  ['data html', 'data:text/html,<script>alert(1)</script>'],
  ['data svg with handler', 'data:image/svg+xml,<svg onload=alert(1)>'],
  ['attribute break-out', 'assets/x.png" onerror="alert(1)'],
  ['attribute break-out, single quotes', "assets/x.png' onerror='alert(1)"],
  ['protocol-relative', '//evil.example/x.png'],
  ['file', 'file:///c:/windows/system32/'],
  ['blob', 'blob:https://vyralive.app/abc']
];

// "No HTML was created" is checked structurally, not by pattern-matching the payload: an escaped
// name may perfectly well still contain the literal characters "onerror=" as visible text, and that
// is inert. What must not change is the shape of the markup — the same number of tag boundaries and
// attribute delimiters as when the value is empty. If the payload cannot open a tag or close an
// attribute, it cannot introduce an element or a handler.
function assertInert(build, payload, label) {
  const empty = build('');
  const hostile = build(payload);
  const count = (s, re) => (s.match(re) || []).length;
  assert.equal(count(hostile, /</g), count(empty, /</g), `${label}: en ny tagg öppnades`);
  assert.equal(count(hostile, />/g), count(empty, />/g), `${label}: en tagg stängdes`);
  assert.equal(count(hostile, /"/g), count(empty, /"/g), `${label}: ett attribut bröts`);
  assert.equal(count(hostile, /'/g), count(empty, /'/g), `${label}: ett enkelcitat bröts`);
  assert.equal(count(hostile, /`/g), count(empty, /`/g), `${label}: en backtick bröts`);
}
// Escaped text may still read "src=javascript:" as visible characters — that is inert, and the
// counts above are what prove it. This check belongs only where the value really is an attribute.
function assertNoExecutableUrl(markup, label) {
  assert.ok(!/(?:src|href)\s*=\s*["'`]?\s*(?:javascript|vbscript|data:text\/html)/i.test(markup),
    `${label}: en exekverbar URL hamnade i ett attribut`);
}

// ---- the helper itself -------------------------------------------------------------------------
test('escaping turns every HTML metacharacter into an entity', () => {
  for (const [label, payload] of HOSTILE_TEXT) {
    const out = VyraSafe.text(payload);
    assert.ok(!/[<>]/.test(out), `${label}: vinkelparentes överlevde escapingen`);
    assert.ok(!/["'`]/.test(out), `${label}: citattecken överlevde escapingen`);
    assertInert(v => `<strong>${VyraSafe.text(v)}</strong>`, payload, label);
    assertInert(v => `<img alt="${VyraSafe.text(v)}">`, payload, label + ' (attribut)');
    assertInert(v => `<b style="color:${VyraSafe.text(v)}">x</b>`, payload, label + ' (style)');
  }
});

test('a name without metacharacters comes back byte-identical', () => {
  // The fix must not change what a normal stream looks like.
  for (const name of ['Jokero', '@StreamQueen', 'Åsa Öberg', 'user_123', 'ﾉ( ﾟдﾟ)ﾉ', '田中さん']) {
    assert.equal(VyraSafe.text(name), name, `${name} förändrades`);
  }
});

test('an empty value falls back, and the fallback is escaped too', () => {
  assert.equal(VyraSafe.text('', '@StreamQueen'), '@StreamQueen');
  assert.equal(VyraSafe.text(null, '@StreamQueen'), '@StreamQueen');
  assert.equal(VyraSafe.text(undefined, '@StreamQueen'), '@StreamQueen');
  assert.equal(VyraSafe.text(''), '');
  assert.ok(!/[<>]/.test(VyraSafe.text('', '<b>x</b>')), 'en osäker fallback släpptes igenom');
});

test('every executable or ambiguous URL scheme falls back', () => {
  for (const [label, payload] of HOSTILE_URL) {
    assert.equal(VyraSafe.src(payload, 'assets/images/test-profile.svg'),
      'assets/images/test-profile.svg', `${label}: URL:en släpptes igenom`);
    assertInert(v => `<img src="${VyraSafe.url(v, 'assets/images/test-profile.svg')}">`, payload, label);
    assertNoExecutableUrl(`<img src="${VyraSafe.url(payload, 'assets/images/test-profile.svg')}">`, label);
  }
});

test('the URLs the product actually uses still work', () => {
  const keep = [
    'https://p16-sign-sg.tiktokcdn.com/aweme/1080x1080/avatar.jpeg',
    'http://127.0.0.1:4173/assets/x.png',
    'assets/gifts/part1/gifts/0001_Rose.png',
    'assets/images/test-profile.svg',
    'data:image/png;base64,iVBORw0KGgo=',
    'data:image/webp;base64,UklGRg=='
  ];
  for (const url of keep) assert.equal(VyraSafe.src(url, 'FALLBACK'), url, `${url} blockerades felaktigt`);
});

test('numbers interpolated into style attributes cannot carry CSS', () => {
  assert.equal(VyraSafe.num('16px;background:url(//evil.example/x)', 18), 18);
  assert.equal(VyraSafe.num('12', 18), 12);
  assert.equal(VyraSafe.num(0, 18), 0);
  assert.equal(VyraSafe.num(undefined, 18), 18);
});

// ---- the renderers -----------------------------------------------------------------------------
// media.js and last-x-alerts.js cannot be evaluated as modules — they build the whole Studio. What
// is checked instead is the property the fix has to hold across every renderer: no event-written
// field reaches innerHTML without going through the helper. A new renderer added later that forgets
// the helper fails here rather than in production.
const EVENT_FIELDS = ['dataName', 'dataValue', 'giftName', 'profileImage', 'giftImage',
  'followName', 'followMessage', 'fanName', 'gifterName', 'fountainUser', 'mvpName'];

const RENDERERS = ['media.js', 'last-x-alerts.js', 'premium-final.js'];

test('no renderer interpolates an event-written field unescaped', () => {
  const offenders = [];
  for (const file of RENDERERS) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const match of source.matchAll(/\$\{w\.([a-zA-Z]+)[^}]*\}/g)) {
      const field = match[1];
      if (!EVENT_FIELDS.includes(field)) continue;
      if (match[0].includes('VyraSafe.')) continue;
      offenders.push(`${file}: ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, [], 'oskyddade interpolationer av eventfält');
});

test('no live consumer assigns an unvalidated URL to .src', () => {
  const offenders = [];
  for (const file of ['live-leaderboard.js', 'media.js', 'last-x-alerts.js']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const match of source.matchAll(/\.src\s*=\s*([^;\n]+)/g)) {
      const rhs = match[1];
      if (rhs.includes('VyraSafe.src')) continue;
      // Only right-hand sides that can carry event data. The media gallery assigns shipped asset
      // paths to .src as well, and those are not what this rule is about.
      if (!/profileImage|giftImage|avatar|person\.|detail\./.test(rhs)) continue;
      offenders.push(`${file}: .src = ${rhs.trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(offenders, [], 'ovaliderade src-tilldelningar');
});

test('the standalone OBS widgets validate the avatar URL they are handed', () => {
  const base = fs.readFileSync(path.join(ROOT, 'public/widgets/base-widget.js'), 'utf8');
  assert.match(base, /safeSrc/, 'base-widget.js saknar URL-validering');
  const page = fs.readFileSync(path.join(ROOT, 'public/widgets/last-x-alerts.html'), 'utf8');
  assert.match(page, /els\.img\.src=VyraWidget\.safeSrc\(data\.avatar\)/,
    'avatar-URL:en sätts fortfarande utan validering');
  // Same rule, second implementation — it has to refuse the same things.
  const sandbox = { window: {}, document: { documentElement: { dataset: {} } }, console };
  sandbox.globalThis = sandbox;
  require('vm').runInNewContext(base, sandbox, { filename: 'base-widget.js' });
  for (const [label, payload] of HOSTILE_URL) {
    assert.equal(sandbox.window.VyraWidget.safeSrc(payload, 'FALLBACK'), 'FALLBACK',
      `base-widget.js: ${label} släpptes igenom`);
  }
  assert.equal(sandbox.window.VyraWidget.safeSrc('https://cdn.example/a.jpg', 'FALLBACK'),
    'https://cdn.example/a.jpg');
});

test('the sanitizer is loaded before the renderers that depend on it', () => {
  const html = fs.readFileSync(path.join(ROOT, 'studio.html'), 'utf8');
  const sanitize = html.indexOf('overlay-sanitize.js');
  const media = html.indexOf('media.js?');
  assert.ok(sanitize !== -1, 'overlay-sanitize.js laddas inte alls');
  assert.ok(sanitize < media, 'sanitizern laddas efter renderaren som använder den');
});

// ---- the localStorage allowlist -----------------------------------------------------------------
test('the overlay only writes the layout side-tables it owns', () => {
  const source = fs.readFileSync(path.join(ROOT, 'overlay-access.js'), 'utf8');
  assert.match(source, /EXTRA_KEYS\.includes\(key\)/,
    'overlay-access.js skriver fortfarande godtyckliga localStorage-nycklar');

  // The allowlist has to be the same set the other two writers use, or a layout restored through
  // the overlay silently loses a side-table that a Studio restore keeps.
  const keys = list => list.replace(/[[\]']/g, '').split(',').map(k => k.trim()).filter(Boolean);
  const listOf = (src, name) => {
    const match = new RegExp(name + '\\s*=\\s*(\\[[^\\]]*\\])').exec(src);
    assert.ok(match, `hittade ingen ${name}-lista`);
    return keys(match[1]);
  };
  const overlay = listOf(source, 'EXTRA_KEYS');
  const cloud = listOf(fs.readFileSync(path.join(ROOT, 'cloud-sync.js'), 'utf8'), 'EXTRA');
  assert.deepEqual(overlay.slice().sort(), cloud.slice().sort(), 'listorna har glidit isär');
  assert.ok(!overlay.some(k => /token|session|auth|access/i.test(k)),
    'en autentiseringsnyckel finns i listan');
});
