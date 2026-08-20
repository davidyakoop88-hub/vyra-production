'use strict';
// FAS 4 — JÄMFÖRAREN MUTERAD ÅT BÅDA HÅLLEN.
//
// Vakten i visuell-regression.browser.test.js står och faller med EN funktion: V.JAMFOR. Allt
// annat — fotograferingen, stillaställandet, referenshanteringen — kan vara felfritt medan
// jämföraren tyst svarar "identiska" på allt. Då är 166 gröna nycklar värdelösa: de bevisar att
// jämföraren kördes, inte att widgetarna ser rätt ut.
//
// Provet muterar därför jämföraren i båda riktningarna och kräver att mutationen märks:
//
//   Fa  ALLTID IDENTISK  släpper igenom en VERKLIG visuell ändring som den riktiga fäller.
//                        Det är den farliga riktningen — en vakt som alltid säger ja är tyst.
//   Fb  ALLTID OLIKA     fäller ett par bilder som den riktiga kallar identiska.
//                        Bevisar att ett "0 olika" faktiskt kommer ur pixeljämförelsen.
//   Fc  MÅTTVAKTEN       en ändrad storlek fångas före pixeljämförelsen — annars hade en
//                        beskuren bild kunnat jämföras mot fel yta.
//
// Fa använder samma sorts ändring som en riktig regression: en färg som flyttar kanaler med
// tiotal, inte en avrundning i sista biten. Tröskelns egen kontroll (§7-provet i vaktfilen)
// mäter den nedre gränsen; det här provet mäter att jämföraren över huvud taget bestämmer utfallet.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const V = require('../helpers/visuell.js');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

let browser, sida;
let skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  sida = await browser.newPage({ viewport: { width: 600, height: 400 } });
  await sida.goto('data:text/html,<!doctype html><title>jamforaren</title>');
});

test.after(async () => { if (browser) await browser.close() });

// Två bilder som skiljer sig på ett sätt ingen tröskel kan bortförklara: en 60×40-platta byter
// färg med 40 steg per kanal. Byggda i webbläsaren så att de går genom exakt samma PNG-väg som
// vaktens riktiga foton.
const PAR = `(async () => {
  const gor = (mala) => {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 120;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(20,14,30)'; g.fillRect(0, 0, 200, 120);
    g.fillStyle = 'rgb(153,101,255)'; g.fillRect(20, 20, 60, 40);
    mala(g);
    return c.toDataURL('image/png').split(',')[1];
  };
  return {
    bas: gor(() => {}),
    likadan: gor(() => {}),
    andrad: gor(g => { g.fillStyle = 'rgb(193,141,215)'; g.fillRect(20, 20, 60, 40) }),
    mindre: (() => {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 100;
      const g = c.getContext('2d');
      g.fillStyle = 'rgb(20,14,30)'; g.fillRect(0, 0, 200, 100);
      return c.toDataURL('image/png').split(',')[1];
    })(),
  };
})()`;

test('Fa: en jämförare som alltid säger identisk släpper igenom en verklig ändring', { skip }, async () => {
  const svar = await sida.evaluate(async ([KALLA, troskel, parKalla]) => {
    const JAMFOR = eval(KALLA);
    const par = await eval(parKalla);
    // Mutationen: samma signatur, samma svarsform — men utfallet är alltid "inga olika".
    const ALLTID_IDENTISK = async () => ({ olika: 0, total: 24000 });
    return {
      riktig: await JAMFOR([par.bas, par.andrad, troskel]),
      muterad: await ALLTID_IDENTISK(),
    };
  }, [V.JAMFOR.toString(), V.KANALTROSKEL, PAR]);

  assert.ok(svar.riktig.olika >= 2400,
    `den riktiga jämföraren såg bara ${svar.riktig.olika} olika pixlar på en 60×40-platta som `
    + 'bytt färg med 40 steg — då mäter provet inte det det tror');
  assert.ok(svar.riktig.storsta >= 30,
    `största kanalskillnad ${svar.riktig.storsta} — ändringen ska vara långt över alla trösklar`);
  assert.equal(svar.muterad.olika, 0,
    'kontrollmätning: den muterade jämföraren ska per definition rapportera noll');
  // Själva poängen: skillnaden mellan de två svaren är vad vakten hänger på.
  assert.notEqual(svar.riktig.olika, svar.muterad.olika,
    'den muterade jämföraren gav SAMMA svar som den riktiga på en verklig visuell ändring — '
    + 'då avgör inte jämföraren utfallet, och vaktens 166 gröna nycklar bevisar ingenting');
});

test('Fb: en jämförare som alltid säger olika fäller det den riktiga kallar identiskt', { skip }, async () => {
  const svar = await sida.evaluate(async ([KALLA, troskel, parKalla]) => {
    const JAMFOR = eval(KALLA);
    const par = await eval(parKalla);
    const ALLTID_OLIKA = async ([, , ]) => ({ olika: 24000, total: 24000, storsta: 255, ruta: [0, 0, 200, 120] });
    return {
      riktig: await JAMFOR([par.bas, par.likadan, troskel]),
      muterad: await ALLTID_OLIKA([par.bas, par.likadan, troskel]),
    };
  }, [V.JAMFOR.toString(), V.KANALTROSKEL, PAR]);

  assert.equal(svar.riktig.olika, 0,
    `två identiskt målade bilder rapporterades som ${svar.riktig.olika} olika pixlar — `
    + 'jämföraren har ett brusgolv som inte kommer från bilderna');
  assert.ok(svar.muterad.olika > 0,
    'kontrollmätning: den muterade jämföraren ska per definition rapportera skillnad');
  assert.notEqual(svar.riktig.olika, svar.muterad.olika,
    'mutationen märktes inte — ett grönt utfall kommer då inte ur pixeljämförelsen');
});

test('Fc: ändrade mått fångas före pixeljämförelsen', { skip }, async () => {
  const svar = await sida.evaluate(async ([KALLA, troskel, parKalla]) => {
    const JAMFOR = eval(KALLA);
    const par = await eval(parKalla);
    return await JAMFOR([par.bas, par.mindre, troskel]);
  }, [V.JAMFOR.toString(), V.KANALTROSKEL, PAR]);

  assert.equal(svar.matt, true,
    'en bild som krympt 120 → 100 px rapporterades inte som måttändring; utan den vakten '
    + 'hade en beskuren widget jämförts mot fel yta');
  assert.equal(svar.ref, '200×120', `referensens mått rapporterades som ${svar.ref}`);
  assert.equal(svar.ny, '200×100', `den nya bildens mått rapporterades som ${svar.ny}`);
});
