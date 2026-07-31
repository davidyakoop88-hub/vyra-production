'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const { createObsService } = require('../obs-service');
const { startLocalServer } = require('../local-server');

function authString(password, salt, challenge) {
  const secret = crypto.createHash('sha256').update(password + salt).digest('base64');
  return crypto.createHash('sha256').update(secret + challenge).digest('base64');
}

// Minimal OBS WebSocket v5 server, just enough of the protocol to exercise obs-service.js's
// handshake and request/response handling without needing a real OBS installation.
function startMockObs(port, { requireAuth = false, password = '', currentScene = 'Test Scene', sceneItemsByScene = {} } = {}) {
  const wss = new WebSocketServer({ port });
  const received = [];
  const salt = 'testsalt', challenge = 'testchallenge';
  wss.on('connection', ws => {
    ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.0.0', rpcVersion: 1, authentication: requireAuth ? { salt, challenge } : undefined } }));
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.op === 1) {
        if (requireAuth && msg.d.authentication !== authString(password, salt, challenge)) { ws.close(4009, 'Authentication failed'); return; }
        ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      } else if (msg.op === 6) {
        received.push(msg.d);
        const { requestType, requestId, requestData } = msg.d;
        let responseData = {}, result = true, comment = '';
        if (requestType === 'GetCurrentProgramScene') responseData = { sceneName: currentScene };
        else if (requestType === 'GetSceneItemId') {
          const id = (sceneItemsByScene[requestData.sceneName] || {})[requestData.sourceName];
          if (id == null) { result = false; comment = 'No source found'; } else responseData = { sceneItemId: id };
        }
        ws.send(JSON.stringify({ op: 7, d: { requestType, requestId, requestStatus: { result, comment }, responseData } }));
      }
    });
  });
  return { close: () => new Promise(resolve => wss.close(resolve)), received };
}

test('connects with the correct password', async () => {
  const mock = startMockObs(9910, { requireAuth: true, password: 'secret123' });
  const svc = createObsService({ log: () => {} });
  try {
    await svc.connect('127.0.0.1', 9910, 'secret123');
    assert.equal(svc.getStatus().connected, true);
  } finally { svc.disconnect(); await mock.close(); }
});

test('rejects an incorrect password without hanging', async () => {
  const mock = startMockObs(9911, { requireAuth: true, password: 'secret123' });
  const svc = createObsService({ log: () => {} });
  try {
    await assert.rejects(() => svc.connect('127.0.0.1', 9911, 'WRONGPASSWORD'));
  } finally { svc.disconnect(); await mock.close(); }
});

test('connects when OBS has no password set', async () => {
  const mock = startMockObs(9912, { requireAuth: false });
  const svc = createObsService({ log: () => {} });
  try {
    await svc.connect('127.0.0.1', 9912, '');
    assert.equal(svc.getStatus().connected, true);
  } finally { svc.disconnect(); await mock.close(); }
});

test('rejects immediately (no password given) when OBS requires one', async () => {
  const mock = startMockObs(9913, { requireAuth: true, password: 'secret123' });
  const svc = createObsService({ log: () => {} });
  try {
    await assert.rejects(() => svc.connect('127.0.0.1', 9913, ''), /lösenord/i);
  } finally { svc.disconnect(); await mock.close(); }
});

test('setScene sends the scene name as-is', async () => {
  const mock = startMockObs(9914, { requireAuth: false });
  const svc = createObsService({ log: () => {} });
  try {
    await svc.connect('127.0.0.1', 9914, '');
    await svc.setScene('Gaming Scene');
    const req = mock.received.find(r => r.requestType === 'SetCurrentProgramScene');
    assert.equal(req.requestData.sceneName, 'Gaming Scene');
  } finally { svc.disconnect(); await mock.close(); }
});

test('setSourceEnabled resolves the item id within an explicit scene', async () => {
  const mock = startMockObs(9915, { requireAuth: false, sceneItemsByScene: { Main: { 'Camera 2': 42 } } });
  const svc = createObsService({ log: () => {} });
  try {
    await svc.connect('127.0.0.1', 9915, '');
    await svc.setSourceEnabled('Main', 'Camera 2', true);
    const setEnabled = mock.received.find(r => r.requestType === 'SetSceneItemEnabled');
    assert.deepEqual(setEnabled.requestData, { sceneName: 'Main', sceneItemId: 42, sceneItemEnabled: true });
  } finally { svc.disconnect(); await mock.close(); }
});

test('setSourceEnabled falls back to the current program scene when none is given', async () => {
  const mock = startMockObs(9916, { requireAuth: false, currentScene: 'Live Scene', sceneItemsByScene: { 'Live Scene': { Webcam: 7 } } });
  const svc = createObsService({ log: () => {} });
  try {
    await svc.connect('127.0.0.1', 9916, '');
    await svc.setSourceEnabled(null, 'Webcam', false);
    assert.ok(mock.received.some(r => r.requestType === 'GetCurrentProgramScene'));
    const setEnabled = mock.received.find(r => r.requestType === 'SetSceneItemEnabled');
    assert.deepEqual(setEnabled.requestData, { sceneName: 'Live Scene', sceneItemId: 7, sceneItemEnabled: false });
  } finally { svc.disconnect(); await mock.close(); }
});

test('connecting to a port nothing is listening on rejects instead of hanging', async () => {
  const svc = createObsService({ log: () => {} });
  try {
    await assert.rejects(() => svc.connect('127.0.0.1', 9999, ''));
  } finally { svc.disconnect(); }
});

// local-server.js's /api/obs/* routes, end-to-end against a real mock OBS instance — proves the
// HTTP layer the browser Studio actually talks to, not just the service module directly.
test('local-server /api/obs routes proxy through to a real OBS connection', async () => {
  const mock = startMockObs(9917, { requireAuth: false, sceneItemsByScene: { Main: { Overlay: 3 } } });
  const { createObsService: freshObsService } = require('../obs-service');
  const obsService = freshObsService({ log: () => {} });
  const ROOT = path.resolve(__dirname, '../..');
  const server = await startLocalServer(ROOT, 4198, { obsService });
  const origin = 'http://127.0.0.1:4198';
  try {
    const statusBefore = await (await fetch(origin + '/api/obs/status')).json();
    assert.equal(statusBefore.connected, false);

    const connectRes = await fetch(origin + '/api/obs/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: '127.0.0.1', port: 9917, password: '' }) });
    const connectBody = await connectRes.json();
    assert.equal(connectRes.status, 200);
    assert.equal(connectBody.connected, true);

    const sceneRes = await fetch(origin + '/api/obs/scene', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sceneName: 'Main' }) });
    assert.equal(sceneRes.status, 200);
    assert.ok(mock.received.some(r => r.requestType === 'SetCurrentProgramScene' && r.requestData.sceneName === 'Main'));

    const sourceRes = await fetch(origin + '/api/obs/source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sceneName: 'Main', sourceName: 'Overlay', enabled: true }) });
    assert.equal(sourceRes.status, 200);
    assert.ok(mock.received.some(r => r.requestType === 'SetSceneItemEnabled' && r.requestData.sceneItemId === 3));
  } finally {
    obsService.disconnect();
    await new Promise(resolve => server.close(resolve));
    await mock.close();
  }
});

test('local-server /api/obs routes report 503 when no OBS service is configured (plain web build)', async () => {
  const ROOT = path.resolve(__dirname, '../..');
  const server = await startLocalServer(ROOT, 4199, {});
  const origin = 'http://127.0.0.1:4199';
  try {
    assert.equal((await fetch(origin + '/api/obs/status')).status, 503);
    assert.equal((await fetch(origin + '/api/obs/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 503);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
