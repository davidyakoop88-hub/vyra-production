'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
process.env.APP_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64url');
const M=require('../mfa');
test('TOTP follows the RFC 6238 SHA1 test vector',()=>{const secret=M.base32Encode(Buffer.from('12345678901234567890'));assert.equal(M.hotp(secret,Math.floor(59/30)),'287082')});
test('TOTP accepts only the small clock-drift window',()=>{const secret=M.newSecret(),now=1710000000000,code=M.hotp(secret,Math.floor(now/30000));assert.equal(M.verify(secret,code,now),true);assert.equal(M.verify(secret,code,now+120000),false);assert.equal(M.verify(secret,'12345',now),false)});
test('MFA secrets encrypt and recovery codes are stored as hashes',()=>{const secret=M.newSecret(),sealed=M.encryptedSecret(secret),codes=M.recoveryCodes();assert.equal(M.openSecret(sealed),secret);assert.equal(codes.length,10);assert.equal(new Set(codes).size,10);assert.doesNotMatch(M.hashRecovery(codes[0]),new RegExp(codes[0].replace('-','')))});

// ---- QR-KODEN ---------------------------------------------------------------------------------
//
// EN QR-KOD SOM SER RATT UT KAN KODA FEL STRANG. Det farligaste felet i det har flodet ar inte en
// trasig bild — det ar en perfekt bild av fel data, t.ex. om nagon skickar `secret` dar `uri`
// skulle sta. Ett strukturprov ("ratt storlek, ratt antal moduler") skulle sla igenom det utan att
// mucka.
//
// Darfor AVKODAS koden har. `jsqr` ar en oberoende implementation av lasarsidan och ligger som
// devDependency — produktionsbygget kor `npm ci --omit=dev`, sa den foljer aldrig med.
//
// Bitmappsjamforelse mot ett annat bibliotek duger INTE som prov: uppmatt 2026-08-30 valde
// `qrcode-generator` och `qrcode` olika maskmonster for samma indata. Bada avkodades till exakt
// kall-URI:n. Masken ar ett fritt val i standarden, sa ett bitmappsprov hade varit rott utan fel.
const jsQR = require('jsqr');

// Bygger en RGBA-bild ur moduldatan. Tyst zon och uppskalning behovs: en avkodare som far en bild
// utan marginal, eller en modul per pixel, hittar ofta inte hornmarkorerna.
function tillBild(qr, skala = 4, tyst = 4) {
  const n = qr.storlek, sid = (n + tyst * 2) * skala;
  const d = new Uint8ClampedArray(sid * sid * 4).fill(255);
  for (let y = 0; y < sid; y++) for (let x = 0; x < sid; x++) {
    const r = Math.floor(y / skala) - tyst, c = Math.floor(x / skala) - tyst;
    if (r >= 0 && c >= 0 && r < n && c < n && qr.moduler.charCodeAt(r * n + c) === 49) {
      const i = (y * sid + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0;
    }
  }
  return { data: d, sid };
}
const avkoda = qr => { const b = tillBild(qr); const ut = jsQR(b.data, b.sid, b.sid); return ut && ut.data };

test('QR-koden avkodas tillbaka till exakt samma otpauth-URI', () => {
  const secret = M.newSecret(), uri = M.uri(secret, 'david.yakoop88@gmail.com');
  const qr = M.qrModuler(uri);
  assert.equal(qr.moduler.length, qr.storlek * qr.storlek, 'moduldatan ar inte kvadratisk');
  assert.equal(avkoda(qr), uri, 'QR-koden kodar inte den URI den fick');
});

test('QR-koden bar hemligheten — inte nagot annat falt', () => {
  // Regressionsvakt for det verkliga misstaget: att skicka `secret` i stallet for `uri`. Den
  // koden ar en giltig QR som ingen autentiseringsapp forstar.
  const secret = M.newSecret(), uri = M.uri(secret, 'a@b.se');
  const avkodat = avkoda(M.qrModuler(uri));
  assert.ok(avkodat.startsWith('otpauth://totp/'), 'QR-koden ar inte en otpauth-URI: ' + String(avkodat).slice(0, 40));
  assert.ok(avkodat.includes('secret=' + secret), 'QR-koden bar inte den utfardade hemligheten');
  assert.notEqual(avkodat, secret, 'QR-koden bar bara hemligheten, utan otpauth-holje');
});

test('QR-koden klarar en lang e-postadress — hogre version, fortfarande lasbar', () => {
  // Langre adress -> fler tecken -> hogre QR-version -> versionsinfoblock i matrisen. Just den
  // granden ar dar en handskriven kodare oftast gar sonder, och den provas darfor uttryckligen.
  const secret = M.newSecret();
  const uri = M.uri(secret, 'en.mycket.lang.adress.som.nagon.faktiskt.kan.ha@ett-langt-domannamn.example.com');
  const qr = M.qrModuler(uri);
  assert.ok(qr.storlek >= 45, 'lang adress gav ovantat liten kod: ' + qr.storlek);
  assert.equal(avkoda(qr), uri, 'den langre koden avkodas inte tillbaka');
});

test('KONTROLLMATNING: avkodaren fangar en forandrad modul', () => {
  // Utan den har ar proven ovan varda ingenting — en avkodare som alltid svarar samma sak, eller
  // en tillBild() som ritar fel, hade gett gront pa allt.
  const qr = M.qrModuler(M.uri(M.newSecret(), 'a@b.se'));
  const trasig = { storlek: qr.storlek, moduler: qr.moduler.split('').map((v, i) => i % 3 ? v : (v === '1' ? '0' : '1')).join('') };
  assert.notEqual(avkoda(trasig), avkoda(qr), 'avkodaren gav samma svar for en sonderslagen matris');
});
