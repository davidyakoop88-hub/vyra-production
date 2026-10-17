'use strict';
// F03: "Skicka testgåva" i LIVE-kontroll gav i webbläget INGENTING synligt.
//
// live-client.js webbgren har send:async()=>{throw Error(...)}, och live-control.js anropade
// send() utan att ta hand om löftet — felet hamnade som ett ohanterat avslag i konsolen och
// användaren såg en knapp som inte gjorde något. Proven nedan vaktar att varje klick ger ett
// synligt besked i en aria-live-region intill knappen, och att beskedet överlever att vyn ritas
// om (render() bygger om hela #view när eventet kommer tillbaka).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const KALLA = fs.readFileSync(path.join(ROOT, 'live-control.js'), 'utf8');

function oppna(live) {
  const dom = new JSDOM('<!doctype html><aside></aside><h1 id="title"></h1><main id="view"></main>', { runScripts: 'outside-only' });
  const w = dom.window;
  if (live !== undefined) w.VyraLive = live;
  w.eval(KALLA);
  w.VyraLiveControl.render();
  return w;
}
const vanta = () => new Promise(r => setTimeout(r, 0));

test('testgåva: knappen har en aria-live-region intill sig redan före klick', () => {
  const w = oppna({ send: async () => ({}) });
  const knapp = w.document.querySelector('#lcTest'), status = w.document.querySelector('#lcTestStatus');
  assert.ok(knapp, '#lcTest saknas');
  assert.ok(status, 'ingen statusregion intill knappen');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(knapp.getAttribute('aria-describedby'), 'lcTestStatus');
  assert.equal(status.parentElement, knapp.parentElement, 'beskedet ska stå intill knappen');
});

test('testgåva: ett fel som send() kastar syns i DOM:en, inte bara i konsolen', async () => {
  const w = oppna({ send: async () => { throw Error('Lokala servern svarar inte'); } });
  w.document.querySelector('#lcTest').click();
  await vanta();
  const status = w.document.querySelector('#lcTestStatus');
  assert.match(status.textContent, /Lokala servern svarar inte/);
  assert.equal(status.dataset.state, 'error');
});

test('testgåva: ett lyckat skick bekräftas och beskedet överlever en omritning', async () => {
  const skickat = [];
  const w = oppna({ send: async ev => { skickat.push(ev); return { ok: true }; } });
  w.document.querySelector('#lcTest').click();
  await vanta();
  assert.equal(skickat.length, 1, 'send() anropades inte exakt en gång');
  assert.equal(skickat[0].type, 'gift');
  assert.equal(skickat[0].giftName, 'Rose');
  assert.match(w.document.querySelector('#lcTestStatus').textContent, /Testgåvan skickades/);
  // Eventet kommer tillbaka och vyn ritas om — beskedet får inte suddas ut av det.
  w.VyraLiveControl.record({ type: 'gift', username: 'TestViewer', giftName: 'Rose', count: 1 });
  assert.match(w.document.querySelector('#lcTestStatus').textContent, /Testgåvan skickades/);
});

test('testgåva: saknas live-klienten helt sägs det ut i stället för att klicket tystnar', async () => {
  const w = oppna(undefined);
  w.document.querySelector('#lcTest').click();
  await vanta();
  const status = w.document.querySelector('#lcTestStatus');
  assert.ok(status.textContent.trim().length > 0, 'klicket gav inget synligt besked');
  assert.equal(status.dataset.state, 'error');
});

// ---- WEBBGRENEN: live-client.js utan lokal runtime POST:ar till molnets testrutt -------------
// Rutten finns sedan tidigare (server/index.js, POST /api/test/event/:workspaceId) och lägger
// eventet på samma eventBus/SSE-väg som riktiga händelser. Klienten kastade ändå ett fel.
function webbKlient(api, workspaces = [{ id: 'ws-1' }]) {
  const dom = new JSDOM('<!doctype html><aside></aside><h1 id="title"></h1><main id="view"></main>',
    { url: 'https://vyra.example/studio.html', runScripts: 'outside-only' });
  const w = dom.window, anrop = [];
  w.EventSource = class { addEventListener() {} close() {} };
  w.VyraAuth = { lastDetail: () => ({ workspaces }), api: async (url, opt) => { anrop.push({ url, opt }); return api(url, opt); } };
  w.eval(fs.readFileSync(path.join(ROOT, 'live-client.js'), 'utf8'));
  const testAnrop = () => anrop.filter(a => a.url.startsWith('/api/test/event/'));
  return { w, testAnrop };
}

test('webbgren: send POST:ar till /api/test/event/<workspace> med value i stället för coins', async () => {
  const { w, testAnrop } = webbKlient(async () => ({ success: true, test: true }));
  await w.VyraLive.send({ type: 'gift', username: 'TestViewer', name: 'TestViewer', giftName: 'Rose', coins: 1, count: 1 });
  const a = testAnrop();
  assert.equal(a.length, 1, 'testrutten anropades inte exakt en gång');
  assert.equal(a[0].url, '/api/test/event/ws-1');
  assert.equal(a[0].opt.method, 'POST');
  assert.deepEqual(JSON.parse(a[0].opt.body), { type: 'gift', username: 'TestViewer', giftName: 'Rose', count: 1, value: 1 });
});

test('webbgren: klick i LIVE-kontroll ger "Testgåvan skickades." när servern svarar 202', async () => {
  const { w, testAnrop } = webbKlient(async () => ({ success: true, test: true }));
  w.eval(KALLA);
  w.VyraLiveControl.render();
  w.document.querySelector('#lcTest').click();
  await vanta(); await vanta();
  assert.equal(testAnrop().length, 1);
  const status = w.document.querySelector('#lcTestStatus');
  assert.match(status.textContent, /Testgåvan skickades/);
  assert.equal(status.dataset.state, 'ok');
});

test('webbgren: ett fel från VyraAuth.api syns i statusraden', async () => {
  const { w } = webbKlient(async () => { throw Object.assign(new Error('Behörighet saknas'), { status: 403 }); });
  w.eval(KALLA);
  w.VyraLiveControl.render();
  w.document.querySelector('#lcTest').click();
  await vanta(); await vanta();
  const status = w.document.querySelector('#lcTestStatus');
  assert.match(status.textContent, /Behörighet saknas/);
  assert.equal(status.dataset.state, 'error');
});

test('webbgren: utan arbetsyta sägs det ut — och inget anrop görs', async () => {
  const { w, testAnrop } = webbKlient(async () => ({ success: true }), []);
  await assert.rejects(() => w.VyraLive.send({ type: 'gift' }), /Logga in för att skicka testevent/);
  assert.equal(testAnrop().length, 0);
});

test('webbgren: det gamla "kräver VYRA Desktop"-kastet är borta', () => {
  const klient = fs.readFileSync(path.join(ROOT, 'live-client.js'), 'utf8');
  assert.doesNotMatch(klient, /Testevent kr[aä]ver VYRA Desktop/);
});
