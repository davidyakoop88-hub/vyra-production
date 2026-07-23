// Connects to a real TikTok LIVE room (via the unofficial tiktok-live-connector library — TikTok has
// no public API for this) and forwards events into VYRA's existing local server (server.ps1) using the
// exact same /api/connect and /api/events endpoints the "Testa gåva" demo button already uses. That
// means every existing consumer of live events — live-client.js's poll loop, Action & Event rules,
// battle-widget routing — works unchanged; this script's only job is to be a real event *source*.
//
// Usage:
//   cd tiktok-bridge
//   npm install
//   node bridge.js <tiktok_username_without_@>
//
// Optional environment variables:
//   VYRA_SERVER_URL   default http://127.0.0.1:4173 — where server.ps1 is listening
'use strict';

const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const N = require('./normalizer');

const username = process.argv[2];
if (!username) {
  console.error('Usage: node bridge.js <tiktok_username_without_@>');
  process.exit(1);
}

const SERVER = process.env.VYRA_SERVER_URL || 'http://127.0.0.1:4173';
const CLOUD = process.env.VYRA_CLOUD_URL || '';
const WORKSPACE = process.env.VYRA_WORKSPACE_ID || '';
const INGEST_TOKEN = process.env.VYRA_INGEST_TOKEN || '';
const HEARTBEAT_MS = 5_000;
const MAX_RECONNECT_MS = 60_000;
let reconnectAttempt = 0;
let reconnectTimer = null;
let heartbeatTimer = null;
let activeConnection = null;
let stopping = false;
const recentEventKeys = new Map();

async function postJson(path, body) {
  try {
    const res = await fetch(SERVER + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json().catch(() => ({ ok: true }));
  } catch (err) {
    console.error(`[bridge] Kunde inte nå VYRA-servern på ${SERVER} (${path}):`, err.message);
    return null;
  }
}

function eventKey(type, data, fields) {
  const nativeId = data?.msgId || data?.messageId || data?.logId || data?.id;
  return nativeId ? `${type}:${nativeId}` : `${type}:${fields.username || ''}:${fields.giftName || ''}:${fields.count || ''}:${Math.floor(Date.now() / 1000)}`;
}

function sendEvent(type, fields, data) {
  const key = eventKey(type, data, fields), now = Date.now();
  for (const [oldKey, at] of recentEventKeys) if (now - at > 120_000) recentEventKeys.delete(oldKey);
  if (recentEventKeys.has(key)) return Promise.resolve({ ok: true, duplicate: true });
  recentEventKeys.set(key, now);
  const local={ type, eventKey: key, source: 'tiktok-bridge', ...fields };
  const jobs=[postJson('/api/events',local)];
  if(CLOUD&&WORKSPACE&&INGEST_TOKEN)jobs.push(fetch(`${CLOUD}/api/events/tiktok/${WORKSPACE}`,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${INGEST_TOKEN}`},body:JSON.stringify(N.cloudEvent(key,type,fields))}).then(r=>{if(!r.ok)throw new Error(`Cloud HTTP ${r.status}`)}).catch(err=>console.error('[bridge] Cloud-event misslyckades:',err.message)));
  return Promise.all(jobs);
}

function startHeartbeat(roomId) {
  clearInterval(heartbeatTimer);
  const beat = () => postJson('/api/heartbeat', { username, roomId, reconnectAttempt, state: 'live' });
  beat(); heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
}

function scheduleReconnect(reason) {
  if (stopping || reconnectTimer) return;
  clearInterval(heartbeatTimer); heartbeatTimer = null;
  const base = Math.min(MAX_RECONNECT_MS, 2_000 * (2 ** Math.min(reconnectAttempt, 5)));
  const delay = Math.round(base * (0.8 + Math.random() * 0.4));
  reconnectAttempt++;
  postJson('/api/disconnect', { reason, reconnectAttempt, retryInMs: delay });
  console.log(`[bridge] ${reason}. Nytt försök om ${Math.ceil(delay / 1000)}s (försök ${reconnectAttempt})...`);
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
}

function connect() {
  if (stopping) return;
  const connection = new TikTokLiveConnection(username, {});
  activeConnection = connection;

  connection.on(WebcastEvent.CHAT, data => {
    const comment = data.comment || '';
    sendEvent(comment.trim().startsWith('!') ? 'chatcommand' : 'chat', {
      ...N.baseUser(data),
      name: comment,
    }, data);
  });

  connection.on(WebcastEvent.GIFT, data => {
    if (data.giftType === 1 && !data.repeatEnd) return;
    sendEvent('gift', N.giftFields(data), data);
  });

  connection.on(WebcastEvent.FOLLOW, data => sendEvent('follow',N.baseUser(data),data));

  connection.on(WebcastEvent.SHARE, data => sendEvent('share',N.baseUser(data),data));

  connection.on(WebcastEvent.MEMBER, data => sendEvent('member',N.baseUser(data),data));
  connection.on(WebcastEvent.SUB_NOTIFY, data => sendEvent('subscribe',N.baseUser(data),data));
  connection.on(WebcastEvent.ROOM_USER, data => sendEvent('viewer',{count:N.number(data?.viewerCount||data?.userCount,1e9)},data));
  connection.on(WebcastEvent.LINK_MIC_BATTLE, data => sendEvent('battle',N.battleFields(data),data));
  connection.on(WebcastEvent.STREAM_END, () => scheduleReconnect('TikTok LIVE avslutades'));

  connection.on(WebcastEvent.LIKE, data => {
    sendEvent('likes', {
      ...N.baseUser(data),
      count: data.likeCount || 0,
      points: data.totalLikeCount || 0
    }, data);
  });

  connection.on(ControlEvent.DISCONNECTED, () => {
    if (activeConnection === connection) activeConnection = null;
    scheduleReconnect('Frånkopplad från TikTok LIVE');
  });

  connection.on(ControlEvent.ERROR, err => {
    console.error('[bridge] Anslutningsfel:', err?.message || err);
  });

  connection.connect()
    .then(state => {
      if (activeConnection !== connection || stopping) return connection.disconnect?.();
      reconnectAttempt = 0;
      console.log(`[bridge] Ansluten till @${username} (room ${state.roomId}). Vidarebefordrar events till ${SERVER}`);
      postJson('/api/connect', { username, roomId: state.roomId, source: 'tiktok-bridge' });
      startHeartbeat(state.roomId);
    })
    .catch(err => {
      if (activeConnection === connection) activeConnection = null;
      console.error(`[bridge] Kunde inte ansluta till @${username}:`, err?.message || err);
      scheduleReconnect(`@${username} är kanske inte live`);
    });
}

async function shutdown(signal) {
  if (stopping) return; stopping = true;
  clearTimeout(reconnectTimer); clearInterval(heartbeatTimer);
  try { await activeConnection?.disconnect?.(); } catch {}
  await postJson('/api/disconnect', { reason: signal || 'shutdown' });
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
connect();
