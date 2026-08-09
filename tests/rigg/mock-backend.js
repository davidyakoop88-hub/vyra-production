'use strict';
// Mock-backend for browser-riggen (Etapp 6B).
//
// VARFOR DEN BOR I RIGGENS EGEN SERVER, inte som objektstubb eller page.route():
//
// Objektstubben som anvands i command-center-alltime.browser.test.js ersatter window.VyraAuth.api
// och hoppar darmed over den RIKTIGA api()-hjalparen — alltsa over CSRF-headern, credentials,
// !r.ok-kastningen och configKnown-logiken. Det ar precis det 6B ska kunna prova.
//
// Riggen ar ocksa den enda plats som redan finns i alla provfiler. En mock har arvs utan att en
// enda befintlig fil skrivs om, och den ar AV som default sa de 23 filer som forutsatter 404 pa
// /api/* beter sig exakt som forut.
//
// Ingen Express: repot har noll runtime-beroenden och riggen kor ra http.createServer. En
// hanterarfunktion racker och haller den rakningen pa noll.

const { SVAR, STROMMAR } = require('../fixtures/api-svar.js');

// '/api/workspaces/:ws/overlays/:ov' -> /^\/api\/workspaces\/([^/]+)\/overlays\/([^/]+)$/
function tillRegex(monster) {
  return new RegExp('^' + monster.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[a-zA-Z]+/g, '([^/]+)') + '$');
}

const RUTTER = Object.keys(SVAR).map(nyckel => {
  const [metod, monster] = nyckel.split(' ');
  return { nyckel, metod, monster, re: tillRegex(monster) };
});
const STROMRUTTER = STROMMAR.map(m => ({ monster: m, re: tillRegex(m) }));

function hittaRutt(metod, sokvag) {
  return RUTTER.find(r => r.metod === metod && r.re.test(sokvag)) || null;
}

// Returnerar en hanterare, eller null nar anropet inte ar ett /api-anrop.
// opts: { fel: {rutt: felobjekt}, logg: [] }
function skapaMock(opts = {}) {
  const fel = opts.fel || {};
  const logg = opts.logg;

  return function hantera(req, res) {
    const sokvag = req.url.split('?')[0];
    if (!sokvag.startsWith('/api/')) return false;

    let kropp = '';
    req.on('data', c => { kropp += c });
    req.on('end', () => {
      const rutt = hittaRutt(req.method, sokvag);
      const nyckel = rutt ? rutt.nyckel : `${req.method} ${sokvag}`;

      if (logg) {
        logg.push({
          metod: req.method, sokvag, url: req.url, rutt: rutt ? rutt.nyckel : null,
          csrf: req.headers['x-vyra-csrf'] || null,
          cookie: req.headers.cookie || null,
          kropp: kropp ? kropp.slice(0, 2000) : null,
        });
      }

      // Felsimulering slar till fore allt annat — bade pa kanda och okanda rutter.
      const f = fel[nyckel] || fel[`${req.method} ${sokvag}`];
      if (f) {
        if (f.natverk) { req.socket.destroy(); return }   // inget svar alls: fetch avvisar
        if (f.hang) return;                                // svarar aldrig
        res.writeHead(f.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(f.kropp || { error: 'Fel' }));
        return;
      }

      // Strommar: oppna och tyst. En mock som bara svarar pa GET/POST lamnar dem hangande.
      if (STROMRUTTER.some(s => s.re.test(sokvag))) {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        res.write(': keep-alive\n\n');
        return;
      }

      if (!rutt) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: `Mocken kanner inte ${req.method} ${sokvag}` }));
        return;
      }

      const svar = SVAR[rutt.nyckel]({ sokvag, kropp, req });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(svar));
    });
    return true;
  };
}

module.exports = { skapaMock, RUTTER, STROMRUTTER };
