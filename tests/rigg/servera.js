'use strict';
// Delad filserver for browser-proven, med OPT-IN mock-backend (Etapp 6B).
//
// De 23 befintliga provfilerna bar var sin egen kopia av den har servern och forutsatter att
// /api/* svarar 404. Den har modulen andrar ingenting for dem: utan { backend: true } beter den
// sig exakt likadant. Nya prov kan anvanda den delade versionen; gamla behover inte roras.
//
//   servera()                                   filserver, /api/* -> 404 (som i dag)
//   servera({ backend: true })                  mock-backenden monterad
//   servera({ backend: true, fel: {...} })      felsimulering, se tests/fixtures/api-fel.js
//   servera({ backend: true, logg: [] })        varje /api-anrop loggas i arrayen
//   servera({ brommade: {'x.js': 1200} })       fordrojer enskilda filer, i millisekunder
//
// BROMSEN finns for att kunna prova KAPPLOPNINGAR mellan skript. Studion laddar ett trettiotal
// filer, och flera av dem lyssnar pa handelser som en tidigare fil kan hinna avfyra. Sadana fel
// syns bara nar laddningen ar langsam — de var osynliga lokalt och slog till slumpvis i CI.

const http = require('http'), fs = require('fs'), path = require('path');
const { skapaMock } = require('./mock-backend.js');

const ROT = path.join(__dirname, '..', '..');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };

function servera(opts = {}) {
  const mock = opts.backend ? skapaMock({ fel: opts.fel, logg: opts.logg }) : null;
  const brommade = opts.brommade || {};

  const server = http.createServer(async (req, res) => {
    const sokvag = decodeURIComponent(req.url.split('?')[0]);

    if (sokvag.startsWith('/api/')) {
      if (mock && mock(req, res)) return;
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":"ingen backend i riggen"}');
      return;
    }

    const fil = path.join(ROT, sokvag.replace(/^\/+/, ''));
    if (!fil.startsWith(ROT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    const broms = brommade[path.basename(sokvag)];
    if (broms > 0) await new Promise(r => setTimeout(r, broms));
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });

  return new Promise(klar => server.listen(0, '127.0.0.1', () => klar({
    server,
    bas: `http://127.0.0.1:${server.address().port}`,
    stang: () => new Promise(r => server.close(r)),
  })));
}

module.exports = { servera };
