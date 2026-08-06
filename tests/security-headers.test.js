'use strict';
// Säkerhetsheadrarna ska finnas kvar — och stanna på steg 1.
//
// HSTS och CSP fanns en gång i Caddyfile.production, men den filen deployades aldrig
// (Dockerfile:55 kopierar ./Caddyfile) och raderades. Uppmätt på vyralive.app innan det här:
// permissions-policy, referrer-policy och x-content-type-options fanns — HSTS och CSP saknades helt.
// Ingenting sa till om det. Det här testet gör tystnaden omöjlig.
//
// STEG 1, MED FLIT SMALT. CSP:n bär bara de fyra direktiv som inte KAN släcka appen, för de
// blockerar sådant appen aldrig gör:
//
//   frame-ancestors 'self'  — vem som får rama in oss (de fristående widget-iframarna är samma origin)
//   base-uri 'self'         — appen sätter aldrig någon <base>
//   form-action 'self'      — enda formuläret i repot (operations.html) saknar action helt
//   object-src 'none'       — inga <object>/<embed>; träffen i overlay-sanitize.js är en blocklista
//
// Resursdirektiven — script, style, img, media, connect — är MEDVETET utelämnade. De kan blanka
// Studion och släcka avatarer i OBS, och kräver en insamlingsendpoint plus en riktig OBS-session
// innan de ens får köra i Report-Only. Testet nedan fäller den som lägger till dem i förbifarten.
//
// HSTS ligger på max-age=300 utan includeSubDomains och utan preload. preload bakas in i
// webbläsarna själva och tar månader att ta sig ur; den gamla konfigurationen hade den, och det var
// ingen som beslutade det.
//
// Det här testet läser filens TEXT. Att headrarna faktiskt skickas av en körande Caddy bevisas av
// jobbet `caddy` i CI, som startar servern och hämtar dem.
//
// RÖTT NU: Caddyfile har varken HSTS eller CSP.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const CADDY = fs.readFileSync(path.join(ROOT, 'Caddyfile'), 'utf8');

const headerVarde = namn => {
  const m = CADDY.match(new RegExp(`^\\s*${namn}\\s+"([^"]*)"`, 'mi'));
  return m ? m[1] : null;
};

// ---- HSTS --------------------------------------------------------------------------------------

test('HSTS skickas', () => {
  const v = headerVarde('Strict-Transport-Security');
  assert.ok(v, 'Strict-Transport-Security saknas helt — samma tysta lucka som före #95');
  assert.match(v, /max-age=300\b/, `steg 1 är max-age=300, inte "${v}"`);
});

test('HSTS står kvar på steg 1 — ingen includeSubDomains, ingen preload', () => {
  // Trappan är 300 → 86400 → ett år med includeSubDomains. Att hoppa direkt till slutet är precis
  // det den gamla konfigurationen gjorde, och preload går inte att ångra på en eftermiddag.
  const v = headerVarde('Strict-Transport-Security');
  assert.doesNotMatch(v, /includeSubDomains/i,
    'includeSubDomains gäller ALLA underdomäner — räkna upp dem först');
  assert.doesNotMatch(v, /preload/i,
    'preload bakas in i webbläsarna och tar månader att ta sig ur');
});

// ---- CSP ---------------------------------------------------------------------------------------

const OFARLIGA = {
  'frame-ancestors': "'self'",
  'base-uri': "'self'",
  'form-action': "'self'",
  'object-src': "'none'"
};
// De som kan blanka Studion eller släcka avatarer i OBS. Inte i det här svepet.
const RESURSDIREKTIV = ['default-src', 'script-src', 'style-src', 'img-src', 'media-src',
  'connect-src', 'font-src', 'worker-src', 'child-src'];

test('CSP skickas', () => {
  assert.ok(headerVarde('Content-Security-Policy'),
    'Content-Security-Policy saknas — de fyra ofarliga direktiven ger skydd utan risk');
});

for (const [direktiv, värde] of Object.entries(OFARLIGA)) {
  test(`CSP bär ${direktiv} ${värde}`, () => {
    const csp = headerVarde('Content-Security-Policy') || '';
    assert.match(csp, new RegExp(`${direktiv}\\s+${värde.replace(/'/g, "'")}`),
      `${direktiv} saknas i "${csp}"`);
  });
}

test('CSP innehåller INGA resursdirektiv', () => {
  const csp = headerVarde('Content-Security-Policy') || '';
  const smugna = RESURSDIREKTIV.filter(d => new RegExp(`(^|;)\\s*${d}\\b`).test(csp));
  assert.deepEqual(smugna, [],
    `${smugna.join(', ')} lades till utan mätning — de kan blanka Studion och släcka avatarer i `
    + 'OBS, och kräver en insamlingsendpoint plus en riktig OBS-session först');
});

test('CSP bär inte Report-Only-varianten i stället', () => {
  // Report-Only utan insamling är en header ingen läser. Blir det aktuellt ska det vara ett medvetet
  // steg med en endpoint, inte ett smygbyte av den skarpa headern.
  assert.doesNotMatch(CADDY, /Content-Security-Policy-Report-Only/i,
    'Report-Only kräver en insamlingsendpoint för att vara värd något');
});

// ---- att de inte kan försvinna tyst ------------------------------------------------------------

test('de befintliga headrarna finns kvar', () => {
  // De tre som redan mättes live. Ingen ska trilla bort när de nya läggs till.
  for (const namn of ['X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
    assert.match(CADDY, new RegExp(namn, 'i'), `${namn} tappades bort`);
  }
});

test('CI hämtar headrarna från en körande Caddy, inte bara ur filen', () => {
  // Det här testet läser TEXT. Utan ett riktigt svar bevisar det inte att Caddy skickar något.
  const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /Strict-Transport-Security/i,
    'CI verifierar inte de faktiska svarsheadrarna — då kan en syntaktiskt giltig fil ändå tiga');
  assert.match(ci, /docker run[^\n]*caddy/i, 'CI startar ingen Caddy att fråga');
});
