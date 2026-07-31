// Real OBS WebSocket v5 client. VYRA's Actions & Events "Byt OBS-scen"/"Aktivera OBS-källa"
// action types previously only dispatched a browser CustomEvent that nothing listened to — this
// is what actually makes them do something.
//
// Lives in the Electron main process (not the browser Studio) because VYRA's web Studio is
// served over HTTPS (vyralive.app) and browsers block a page loaded over HTTPS from opening a
// plain insecure ws:// connection to a local OBS instance (mixed content). Node has no such
// restriction, so this mirrors exactly how the real TikTok LIVE connection already works
// (tiktok-service.js) — a local Node service the browser-side Studio talks to over
// http://127.0.0.1 via local-server.js's /api/obs/* routes.
'use strict';
const crypto = require('crypto');
const { WebSocket } = require('ws');

function createObsService({ log } = {}) {
  let ws = null;
  let identified = false;
  let requestSeq = 0;
  const pending = new Map();
  let status = { connected: false, error: '' };

  function authString(password, salt, challenge) {
    // OBS WebSocket v5 auth: base64(sha256(base64(sha256(password + salt)) + challenge))
    const secret = crypto.createHash('sha256').update(password + salt).digest('base64');
    return crypto.createHash('sha256').update(secret + challenge).digest('base64');
  }

  function request(requestType, requestData = {}) {
    return new Promise((resolve, reject) => {
      if (!identified || !ws) return reject(new Error('OBS är inte anslutet'));
      const requestId = 'r' + (++requestSeq);
      pending.set(requestId, { resolve, reject });
      ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      setTimeout(() => {
        if (pending.has(requestId)) { pending.delete(requestId); reject(new Error('OBS svarade inte i tid')); }
      }, 8000);
    });
  }

  function disconnect() {
    identified = false;
    if (ws) { try { ws.terminate(); } catch { /* already closed */ } ws = null; }
    for (const [, p] of pending) p.reject(new Error('OBS-anslutningen stängdes'));
    pending.clear();
    status = { connected: false, error: '' };
  }

  function connect(ip, port, password) {
    disconnect();
    return new Promise((resolve, reject) => {
      let settled = false;
      let socket;
      try { socket = new WebSocket(`ws://${ip}:${port}`); }
      catch (err) { return reject(err); }
      ws = socket;
      const timeout = setTimeout(() => {
        if (!settled) { settled = true; socket.terminate(); reject(new Error('Timeout — kunde inte nå OBS')); }
      }, 8000);

      socket.on('message', raw => {
        let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg.op === 0) { // Hello
          const auth = msg.d?.authentication;
          const identify = { rpcVersion: 1, eventSubscriptions: 0 };
          if (auth) {
            if (!password) { clearTimeout(timeout); settled = true; socket.close(); return reject(new Error('OBS kräver ett lösenord — ange det som sattes i OBS WebSocket-inställningarna')); }
            identify.authentication = authString(password, auth.salt, auth.challenge);
          }
          socket.send(JSON.stringify({ op: 1, d: identify }));
        } else if (msg.op === 2) { // Identified
          identified = true; status = { connected: true, error: '' };
          clearTimeout(timeout);
          if (!settled) { settled = true; resolve(); }
        } else if (msg.op === 7) { // RequestResponse
          const id = msg.d?.requestId, p = pending.get(id);
          if (!p) return;
          pending.delete(id);
          if (msg.d?.requestStatus?.result) p.resolve(msg.d.responseData || {});
          else p.reject(new Error(msg.d?.requestStatus?.comment || 'OBS-anropet misslyckades'));
        }
      });
      socket.on('error', err => {
        log?.('OBS WS error:', err.message);
        status = { connected: false, error: err.message };
        if (!settled) { settled = true; clearTimeout(timeout); reject(err); }
      });
      socket.on('close', (code, reasonBuf) => {
        const wasIdentified = identified;
        identified = false;
        status = { connected: false, error: status.error };
        if (wasIdentified) log?.('OBS-anslutningen stängdes');
        for (const [, p] of pending) p.reject(new Error('OBS-anslutningen stängdes'));
        pending.clear();
        // OBS closes the socket itself (rather than emitting a WS-level error) on a failed auth
        // attempt — without this, connect() would only ever reject via the 8s fallback timeout
        // below instead of failing fast with a real reason.
        if (!settled) {
          settled = true; clearTimeout(timeout);
          const reason = reasonBuf?.toString() || `close code ${code}`;
          reject(new Error('OBS stängde anslutningen: ' + reason));
        }
      });
    });
  }

  async function setScene(sceneName) {
    return request('SetCurrentProgramScene', { sceneName });
  }

  // Source name -> sceneItemId has to be resolved per-scene (the same source can appear in
  // multiple scenes with different item ids), so this always looks it up fresh rather than
  // caching — a source being renamed/moved in OBS would otherwise silently go stale. VYRA's
  // "Aktivera OBS-källa" Action only ever asked for a source name (no scene picker), so when no
  // sceneName is given this resolves against whatever scene is currently live.
  async function setSourceEnabled(sceneName, sourceName, enabled) {
    const scene = sceneName || (await request('GetCurrentProgramScene')).sceneName;
    const found = await request('GetSceneItemId', { sceneName: scene, sourceName });
    await request('SetSceneItemEnabled', { sceneName: scene, sceneItemId: found.sceneItemId, sceneItemEnabled: !!enabled });
  }

  return { connect, disconnect, setScene, setSourceEnabled, getStatus: () => ({ ...status }) };
}

module.exports = { createObsService };
