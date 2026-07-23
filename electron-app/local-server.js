// Pure Node.js re-implementation of server.ps1, used only by the Electron app. Runs in-process (no
// child process spawn at all) instead of shelling out to `powershell.exe -ExecutionPolicy Bypass
// -File server.ps1` — that spawn pattern (unsigned .exe launching PowerShell with an explicit
// security-bypass flag) is a classic antivirus/SmartScreen heuristic trigger, and a real user report
// showed the packaged app's window opening then closing itself ~8s later, consistent with something
// terminating it shortly after launch. Removing the PowerShell dependency removes that signature
// entirely, and having Electron own the server directly is also simpler than managing a child process.
//
// Mirrors server.ps1's API exactly (same endpoints, same event/connection shape) so studio.html,
// tiktok-bridge, and ANSLUT-TIKTOK-LIVE.cmd all work unchanged — only server.ps1's shell process is
// replaced, not the contract other code depends on. The standalone (non-Electron) path via
// STARTA-HEMSIDAN.cmd still uses server.ps1; this file is Electron-only.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg'
};

function readBody(req, maxBytes = 65536) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, failed = false;
    req.on('data', c => { if (failed) return; size += c.length; if (size > maxBytes) { failed = true; reject(Object.assign(new Error('Payload too large'), { statusCode: 413 })); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', e => { if (!failed) reject(e); });
  });
}

function startLocalServer(root, port = 4173) {
  const events = [];
  const connection = { connected: false, username: '', mode: 'demo', state: 'idle', roomId: '', heartbeat: 0, reconnectAttempt: 0, updated: Date.now() };
  const seenEvents = new Map();
  const requestBuckets = new Map();
  const backupDir = path.join(root, '.vyra-backups');
  function writeAtomic(file, raw) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, raw, 'utf8'); fs.renameSync(tmp, file); }
  function versionFiles() { if (!fs.existsSync(backupDir)) return []; return fs.readdirSync(backupDir).filter(n => /^state-\d+\.json$/.test(n)).sort().reverse(); }

  function sendJson(res, obj, status = 200) {
    const body = Buffer.from(JSON.stringify(obj), 'utf8');
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': body.length });
    res.end(body);
  }
  function allowedOrigin(req) { const origin = req.headers.origin; return !origin || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`; }
  function rateAllowed(req) { const ip = req.socket.remoteAddress || 'local', now = Date.now(), bucket = requestBuckets.get(ip) || { at: now, count: 0 }; if (now - bucket.at >= 1000) { bucket.at = now; bucket.count = 0; } bucket.count++; requestBuckets.set(ip, bucket); return bucket.count <= 2500; }
  function text(v, max) { return String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, '').slice(0, max); }
  function imageUrl(v) { const value = text(v, 2048); return /^(https?:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(value) ? value : ''; }
  function number(v, min = 0, max = Number.MAX_SAFE_INTEGER) { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0; }
  function cleanEvent(d) { return { type: text(d.type, 64).replace(/[^a-z0-9_:-]/gi, ''), username: text(d.username, 100), name: text(d.name, 500), profileImage: imageUrl(d.profileImage), giftName: text(d.giftName, 160), giftImage: imageUrl(d.giftImage), coins: number(d.coins, 0, 1e9), count: number(d.count, 0, 1e7), multiplier: number(d.multiplier, 0, 100), points: number(d.points, 0, 1e12), level: number(d.level, 0, 10000), score: number(d.score, 0, 1e12), scoreUs: number(d.scoreUs, 0, 1e12), scoreThem: number(d.scoreThem, 0, 1e12), ourScore: number(d.ourScore, 0, 1e12), opponentScore: number(d.opponentScore, 0, 1e12), eventKey: text(d.eventKey, 200), source: text(d.source, 64) }; }

  const server = http.createServer(async (req, res) => {
    try {
      const parsed = new URL(req.url, `http://127.0.0.1:${port}`);
      const p = parsed.pathname;
      res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin'); res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      if (p.startsWith('/api/') && req.method !== 'GET' && !allowedOrigin(req)) return sendJson(res, { ok: false, error: 'Origin nekad' }, 403);
      if (p.startsWith('/api/') && !rateAllowed(req)) return sendJson(res, { ok: false, error: 'För många anrop' }, 429);

      if (p === '/api/status') {
        if (connection.connected && connection.heartbeat && Date.now() - connection.heartbeat > 15000) {
          connection.connected = false; connection.state = 'stale'; connection.updated = Date.now();
        }
        return sendJson(res, { ok: true, server: 'VYRA Live Server', connection, lastEventId: events.length ? events[events.length - 1].id : 0 });
      }
      if (p === '/api/connect' && req.method === 'POST') {
        const d = JSON.parse((await readBody(req)) || '{}');
        connection.connected = true;
        connection.username = String(d.username || '');
        connection.mode = 'connector-ready'; connection.state = 'live';
        connection.roomId = String(d.roomId || ''); connection.heartbeat = Date.now(); connection.reconnectAttempt = 0;
        connection.updated = Date.now();
        return sendJson(res, { ok: true, connection, message: 'Redo for LIVE-events' });
      }
      if (p === '/api/disconnect' && req.method === 'POST') {
        const d = JSON.parse((await readBody(req)) || '{}');
        connection.connected = false;
        connection.state = d.retryInMs ? 'reconnecting' : 'disconnected';
        connection.reconnectAttempt = Number(d.reconnectAttempt || 0); connection.retryInMs = Number(d.retryInMs || 0); connection.reason = String(d.reason || '');
        connection.updated = Date.now();
        return sendJson(res, { ok: true, connection });
      }
      if (p === '/api/heartbeat' && req.method === 'POST') {
        const d = JSON.parse((await readBody(req)) || '{}');
        connection.connected = true; connection.state = 'live'; connection.heartbeat = Date.now(); connection.updated = connection.heartbeat;
        connection.username = String(d.username || connection.username); connection.roomId = String(d.roomId || connection.roomId); connection.reconnectAttempt = Number(d.reconnectAttempt || 0);
        return sendJson(res, { ok: true, connection });
      }
      if (p === '/api/events' && req.method === 'GET') {
        const after = Number(parsed.searchParams.get('after') || 0) || 0;
        return sendJson(res, { ok: true, events: events.filter(e => e.id > after) });
      }
      if (p === '/api/events' && req.method === 'POST') {
        const d = cleanEvent(JSON.parse((await readBody(req, 65536)) || '{}')); if (!d.type) return sendJson(res, { ok: false, error: 'Eventtyp saknas' }, 400);
        const now = Date.now(), key = d.eventKey;
        for (const [oldKey, at] of seenEvents) if (now - at > 120000) seenEvents.delete(oldKey);
        if (key && seenEvents.has(key)) return sendJson(res, { ok: true, duplicate: true, eventKey: key });
        if (key) seenEvents.set(key, now);
        let id = Date.now();
        while (events.length && events[events.length - 1].id >= id) id++;
        const e = {
          id, type: d.type, username: d.username, name: d.name,
          profileImage: d.profileImage, giftName: d.giftName, giftImage: d.giftImage,
          coins: d.coins, count: d.count, multiplier: d.multiplier, points: d.points, level: d.level,
          score: d.score, scoreUs: d.scoreUs, scoreThem: d.scoreThem, ourScore: d.ourScore, opponentScore: d.opponentScore,
          eventKey: key, source: d.source, timestamp: id
        };
        events.push(e);
        while (events.length > 5000) events.shift();
        return sendJson(res, { ok: true, event: e });
      }
      if (p === '/api/state' && req.method === 'GET') {
        const backupFile = path.join(root, 'vyra-state-backup.json');
        if (fs.existsSync(backupFile)) {
          const body = fs.readFileSync(backupFile);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': body.length });
          return res.end(body);
        }
        return sendJson(res, { ok: false, error: 'Ingen backup sparad an' }, 404);
      }
      if (p === '/api/state' && req.method === 'POST') {
        const raw = await readBody(req, 5 * 1024 * 1024);
        if (raw) { JSON.parse(raw); writeAtomic(path.join(root, 'vyra-state-backup.json'), raw); }
        return sendJson(res, { ok: true });
      }
      if (p === '/api/state/versions' && req.method === 'GET') {
        const versions = versionFiles().map(file => { const stat = fs.statSync(path.join(backupDir, file)); return { id: file.slice(6, -5), createdAt: stat.mtimeMs, size: stat.size }; });
        return sendJson(res, { ok: true, versions });
      }
      if (p === '/api/state/version' && req.method === 'GET') {
        const id = String(parsed.searchParams.get('id') || ''); if (!/^\d+$/.test(id)) return sendJson(res, { ok: false, error: 'Ogiltig version' }, 400);
        const file = path.join(backupDir, `state-${id}.json`); if (!fs.existsSync(file)) return sendJson(res, { ok: false, error: 'Version saknas' }, 404);
        const body = fs.readFileSync(file); res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': body.length }); return res.end(body);
      }
      if (p === '/api/state/version' && req.method === 'POST') {
        const raw = await readBody(req, 5 * 1024 * 1024); const parsedState = JSON.parse(raw || '{}'); if (!Array.isArray(parsedState.widgets)) return sendJson(res, { ok: false, error: 'Ogiltig VYRA-state' }, 400);
        fs.mkdirSync(backupDir, { recursive: true }); const id = String(Date.now()); writeAtomic(path.join(backupDir, `state-${id}.json`), raw);
        versionFiles().slice(20).forEach(file => fs.unlinkSync(path.join(backupDir, file))); return sendJson(res, { ok: true, id });
      }

      if (req.method !== 'GET') {
        return sendJson(res, { ok: false, error: 'Method not allowed' }, 405);
      }

      let rel = decodeURIComponent(p).replace(/^\/+/, '');
      if (!rel) rel = 'index.html';
      const rootResolved = path.resolve(root);
      const filePath = path.resolve(path.join(rootResolved, rel));
      if (!filePath.toLowerCase().startsWith(rootResolved.toLowerCase()) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return sendJson(res, { ok: false, error: 'Hittades inte' }, 404);
      }
      const body = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const type = TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': body.length });
      res.end(body);
    } catch (err) {
      try { sendJson(res, { ok: false, error: err.message }, err.statusCode || (err instanceof SyntaxError ? 400 : 500)); } catch { /* response already sent */ }
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { startLocalServer };
