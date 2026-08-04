'use strict';
// Statisk server for E2E. Studio ar rena filer — ingen build, ingen bundler.
//
// Den svarar 405 pa allt utom GET och HEAD med FLIT. Ett av scenariona kontrollerar att sidan
// aldrig utloser en 405, och da maste servern faktiskt kunna ge en. En server som tyst svarar 200
// pa allt skulle gora det testet meningslost.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.argv[2] || 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end('{"ok":false,"error":"Method not allowed"}');
  }
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  // Sokvagen loses mot ROOT och kontrolleras efterat — annars ar ../ en vag ut ur repot.
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'layout.html';
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(path.resolve(ROOT))) {
    res.writeHead(403); return res.end('forbidden');
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size, 'Cache-Control': 'no-store'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => process.stdout.write(`static server on ${PORT}\n`));
