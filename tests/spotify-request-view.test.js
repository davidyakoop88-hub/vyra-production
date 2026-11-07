'use strict';
// SPOTIFY-LÅTÖNSKNINGAR · VISNINGEN (David 2026-11-07). Spotifykö och Ren musikrad i mörk VYRA-lila.
// Proven vaktar kontraktet: Spotifys ordning gäller, önskaren uppfinns aldrig, gammal data visas aldrig
// som aktuell, ingen text kan bli HTML, studion skickar låtdata till servern (aldrig en token, aldrig via
// localStorage), och overlayn ritar det servern skickar utan att själv röra Spotify.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const view = require('../spotify-request-view.js');
const ROOT = path.join(__dirname, '..');

const bild = id => 'https://i.scdn.co/image/ab67616d0000' + id;
const track = (id, name = id) => ({ type: 'track', uri: 'spotify:track:' + id, name, artists: [{ name: 'Artist ' + id }], duration_ms: 123000, album: { images: [{ url: bild(id) }] } });
const widget = { type: 'templateSongRequests', id: 'spotify-1', latKalla: 'spotify', width: 320 };
function read(data, w = widget, now = 10000) { const dom = new JSDOM(view.html(w, data, now)); return { dom, doc: dom.window.document }; }

test('Spotifys ordning gäller; artist, omslag och önskare visas var för sig', () => {
  const data = view.snapshot({ item: track('current'), is_playing: true }, { queue: [track('second'), track('first')] },
    [{ av: 'Anna', lat: { uri: 'spotify:track:first' }, status: 'skickad' }], 10000);
  const { dom, doc } = read(data);
  assert.match(doc.querySelector('.sr-now').textContent, /NU SPELAS.*current.*Artist current/s);
  assert.deepEqual([...doc.querySelectorAll('li b')].map(e => e.textContent), ['second', 'first']);
  assert.match(doc.querySelectorAll('li')[1].textContent, /Önskad av Anna/);
  assert.equal(doc.querySelectorAll('img').length, 3);
  dom.window.close();
});

test('okänd önskare uppfinns inte; samma låt två gånger förbrukar önskan en gång', () => {
  const data = view.snapshot({ item: track('a'), is_playing: false }, { queue: [track('a')] }, [{ av: 'Anna', lat: { uri: 'spotify:track:a' }, status: 'skickad' }], 10000);
  assert.equal(data.current.requester, 'Anna');
  assert.equal(data.queue[0].requester, '');
  assert.equal(data.current.uri, undefined, 'ögonblicksbilden bär ingen uri');
  const { dom, doc } = read(data);
  assert.match(doc.body.textContent, /PAUSAD/);
  dom.window.close();
});

test('gammal eller misslyckad data visas aldrig som aktuell låt', () => {
  const data = view.snapshot({ item: track('gammal') }, { queue: [track('gammal')] }, [], 10000);
  let r = read(data, widget, 41000);
  assert.doesNotMatch(r.doc.body.textContent, /Artist gammal/);
  assert.match(r.doc.body.textContent, /Väntar på Spotify/);
  r.dom.window.close();
  r = read({ at: 10000, current: null, queue: [], error: 'Spotify kunde inte uppdateras' });
  assert.match(r.doc.body.textContent, /kunde inte uppdateras/);
  r.dom.window.close();
});

test('dold kö, antal rader, tom kö och Ren musikrad', () => {
  const data = view.snapshot(null, { queue: [track('a'), track('b')] }, [], 10000);
  let r = read(data, { ...widget, latVisaKo: false });
  assert.equal(r.doc.querySelector('ol'), null); r.dom.window.close();
  r = read(data, { ...widget, latVisa: 1, latSpotifyDesign: 'line' });
  assert.equal(r.doc.querySelectorAll('li').length, 1); assert.ok(r.doc.querySelector('.sr-line')); r.dom.window.close();
  r = read(view.snapshot(null, { queue: [] }, [], 10000));
  assert.match(r.doc.body.textContent, /Ingen låt spelas/); assert.match(r.doc.body.textContent, /Kön är tom/); r.dom.window.close();
});

test('text och bildadresser kan inte bli skript eller händelseattribut; bara Spotifys bild-CDN', () => {
  const data = { at: 10000, playing: true, current: { title: '<img src=x onerror=alert(1)>', artist: '<script>bad</script>', requester: '<svg onload=bad()>', image: 'javascript:alert(1)', seconds: 0 },
    queue: [{ title: 'Q', artist: '', image: 'https://evil.example/x.png', seconds: 0, requester: '' }] };
  const { dom, doc } = read(data, { ...widget, id: 'x" onclick="bad()' });
  assert.equal(doc.querySelector('script'), null); assert.equal(doc.querySelector('[onclick]'), null);
  assert.equal(doc.querySelector('[onerror]'), null); assert.equal(doc.querySelector('img'), null);
  dom.window.close();
});

test('mörk VYRA-lila, inte grönt', () => {
  const css = fs.readFileSync(path.join(ROOT, 'spotify-request-view.css'), 'utf8');
  assert.match(css, /#8b3dff/, 'VYRA-violett saknas');
  assert.match(css, /#f7f2ff/, 'VYRAs vita text saknas');
  assert.doesNotMatch(css, /#1db954|#1ed760|rgb\(\s*29\s*,\s*185/i, 'Spotify-grönt ska inte användas');
});

function studio(url, extra) {
  const dom = new JSDOM('<!doctype html><head></head><body></body>', { url, runScripts: 'dangerously' }), w = dom.window;
  w.state = { widgets: [widget] }; w.selected = widget.id; w.wh = () => '<div>gammal</div>'; w.setInterval = () => 0; w.requestAnimationFrame = fn => fn();
  Object.assign(w, extra(w));
  w.eval(fs.readFileSync(path.join(ROOT, 'spotify-request-view.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(ROOT, 'latonskningar.js'), 'utf8'));
  return dom;
}

test('studion läser Spotify, ritar kön och skickar bara låtdata till servern', async () => {
  const skickat = [];
  let lasningar = 0;
  const dom = studio('https://vyralive.app/studio.html', () => ({
    VyraSpotify: { current: async () => ({ item: track('spelar'), is_playing: true }), readQueue: async () => { lasningar++; return { queue: [track('vantar')] }; } },
    VyraAuth: { lastDetail: () => ({ workspaces: [{ id: 'ws-1' }] }), api: async (url, opt) => { skickat.push([url, opt]); return { ok: true }; } }
  }));
  const w = dom.window;
  try {
    w.VyraLatonskningar.spotifyVisningUppdatera();
    await new Promise(r => setTimeout(r, 20));
    const box = w.document.createElement('div'); box.innerHTML = w.wh(widget);
    assert.equal(lasningar, 1);
    assert.match(box.textContent, /NU SPELAS.*spelar.*Artist spelar.*vantar.*Artist vantar/s);
    assert.ok(box.querySelector('.resize-handle')); assert.ok(box.querySelector('.selected'));
    assert.equal(skickat.length, 1);
    assert.equal(skickat[0][0], '/api/workspaces/ws-1/spotify-visning');
    assert.equal(skickat[0][1].method, 'POST');
    assert.doesNotMatch(skickat[0][1].body, /token|spotify:track/i, 'ingen token och ingen uri lämnar studion');
    assert.equal(w.localStorage.getItem('vyra-spotify-request-display-v1'), null, 'låtdata ska inte ligga i localStorage');
  } finally { dom.window.close(); }
});

test('overlayn rör aldrig Spotify och ritar det servern skickar', () => {
  const dom = studio('https://vyralive.app/studio.html?overlay=1', () => ({
    VyraSpotify: { current: () => { throw Error('overlayn får inte fråga Spotify'); }, readQueue: () => { throw Error('overlayn får inte fråga Spotify'); } },
    VyraAuth: { api: () => { throw Error('overlayn får inte posta'); } }
  }));
  const w = dom.window;
  try {
    assert.doesNotThrow(() => w.VyraLatonskningar.spotifyVisningUppdatera());
    assert.match(w.wh(widget), /Väntar på Spotify/);
    w.dispatchEvent(new w.CustomEvent('vyra-spotify-overlay', { detail: { at: Date.now(), playing: true, current: { title: 'Från servern', artist: 'X', image: '', seconds: 0, requester: 'Leo' }, queue: [] } }));
    assert.match(w.wh(widget), /Från servern.*Önskad av Leo/s);
    w.dispatchEvent(new w.CustomEvent('vyra-session-ended'));
    assert.match(w.wh(widget), /Väntar på Spotify/, 'kontobyte ska glömma låtdatan');
  } finally { dom.window.close(); }
});

test('studion utan Spotify visar ett märkt exempel; OBS visar aldrig exemplet', () => {
  const studioDom = studio('https://vyralive.app/studio.html', () => ({ VyraSpotify: null }));
  const obsDom = studio('https://vyralive.app/studio.html?overlay=1', () => ({ VyraSpotify: null }));
  try {
    assert.match(studioDom.window.wh(widget), /EXEMPEL · SPOTIFY INTE ANSLUTET/);
    assert.doesNotMatch(obsDom.window.wh(widget), /EXEMPEL|Exempellåt/);
    assert.match(obsDom.window.wh(widget), /Väntar på Spotify/);
  } finally { studioDom.window.close(); obsDom.window.close(); }
});

test('en färsk Spotify-ram tänder Spotify-widgeten i OBS utan chatt, men inte YouTube', () => {
  const src = fs.readFileSync(path.join(ROOT, 'overlay-aktivering.js'), 'utf8');
  assert.match(src, /addEventListener\('vyra-spotify-overlay', ev => taSpotify\(ev && ev\.detail\)\)/);
  const fn = src.slice(src.indexOf('function taSpotify'), src.indexOf('const TIDIGA'));
  assert.match(fn, /Date\.now\(\) - Number\(d\.at\) < 30000/, 'gammal ram får inte tända widgeten');
  assert.match(fn, /w\.type === 'templateSongRequests' && w\.latKalla === 'spotify'/);
  // Versionen ska vara höjd sedan Spotify-regeln kom in (20261107-21); senare ändringar får höja den vidare.
  const v = (fs.readFileSync(path.join(ROOT, 'media.js'), 'utf8').match(/overlay-aktivering\.js\?v=(\d{8}-\d+)/) || [])[1] || '';
  assert.ok(v >= '20261107-21', 'overlay-aktivering.js cachebustades inte: ' + v);
});
