'use strict';
// Throwaway local dev helper: server/index.js only answers /api/* (static files are served by
// Caddy in front of it in production/staging — see Caddyfile). This serves the repo root as
// static files and proxies everything under /api to the real node server, so a widget page like
// public/widgets/top-points.html can be opened directly in a browser and its relative fetch('/api/...')
// calls still reach the real API + real Postgres.
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:8099';
const PORT = Number(process.env.STATIC_PORT || 8098);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const target = new URL(u.pathname + u.search, API_TARGET);
    const proxyReq = http.request(target, { method: req.method, headers: req.headers }, proxyRes => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', err => { res.writeHead(502); res.end(String(err)); });
    req.pipe(proxyReq);
    return;
  }
  const filePath = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log('dev static+proxy listening on', PORT, '-> api', API_TARGET));
