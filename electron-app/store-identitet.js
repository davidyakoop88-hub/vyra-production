'use strict';
// MICROSOFT STORE-IDENTITETEN — VERSIONSHANTERAD OCH REPRODUCERBAR.
//
// De tre värdena binder paketet till Store-posten och står på VYRA Studios identitetssida i
// Partner Center (Store ID 9PPKZN2SCJM2):
//
//   Package/Identity/Name                    -> identityName
//   Package/Identity/Publisher               -> publisher            (hela X.500-strängen)
//   Package/Properties/PublisherDisplayName  -> publisherDisplayName
//
// DE ÄR INCHECKADE, med flit. Värdena är offentliga — de står i klartext i varje publicerat pakets
// manifest och produkten är nåbar på apps.microsoft.com — och de är stabila. Att versionshantera
// dem gör bygget REPRODUCERBART ur repot: samma commit ger samma identitet, utan att någon behöver
// komma ihåg att sätta tre miljövariabler rätt.
//
// FILEN ÄR AUKTORITATIV. Miljövariablerna finns kvar, men bara för att fylla i det filen saknar.
// Säger en miljövariabel något ANNAT än den incheckade filen är det ett fel, inte en override —
// ett bygge som kan byta identitet genom en kvarglömd variabel är inte reproducerbart, och en
// felaktig identitet kan i värsta fall gå igenom certifieringen som en ANNAN produkt.
//
// Modulen läser, validerar hårt, och FALLER med en instruktion. Den har inget standardvärde och
// ingen reserv: ett rimligt påhittat värde är farligare än ett tomt, för det ser rätt ut ända tills
// någon annan drabbas av det.

const fs = require('node:fs');
const path = require('node:path');

const FALT = [
  { nyckel: 'identityName', env: 'VYRA_STORE_IDENTITY_NAME', partnerCenter: 'Package/Identity/Name' },
  { nyckel: 'publisher', env: 'VYRA_STORE_PUBLISHER', partnerCenter: 'Package/Identity/Publisher' },
  { nyckel: 'publisherDisplayName', env: 'VYRA_STORE_PUBLISHER_DISPLAY_NAME', partnerCenter: 'Package/Properties/PublisherDisplayName' }
];

const FIL = path.join(__dirname, 'store-identitet.json');

// Former som ser ifyllda ut men inte är det. Utan den här listan blir ett kvarglömt exempelvärde
// ett paket som byggs och skickas in — och först certifieringen säger ifrån.
const PLATSHALLARE = /^(|<.*>|TODO|FIXME|ANGE|xxx+|placeholder|CN=Example|CN=Contoso.*|12345[A-Za-z]*\.Example.*)$/i;

// Publisher är en X.500-sträng som certifieringen jämför TECKEN FÖR TECKEN mot Store-posten.
const X500 = /^CN=.+/;

// Store-identitetsnamn: bokstäver, siffror, punkt och bindestreck. Prefixet är kontospecifikt, så
// ingen hårdare regel än teckenuppsättningen är meningsfull.
const IDENTITETSNAMN = /^[A-Za-z0-9][A-Za-z0-9.-]{1,49}$/;

function franFil() {
  try { return JSON.parse(fs.readFileSync(FIL, 'utf8')); }
  catch { return {}; }
}

// `fil` och `env` är injicerbara så proven kan mäta laddningsreglerna utan att röra den riktiga
// filen — och utan att den riktiga filens värden smyger in i ett prov som tror sig mäta något annat.
function las({ env = process.env, fil = franFil() } = {}) {
  const ut = {};
  for (const f of FALT) ut[f.nyckel] = String(fil[f.nyckel] || env[f.env] || '').trim();
  return ut;
}

// Tom lista betyder giltig. Varje brist NAMNGER fältet i Partner Center och miljövariabeln, så den
// som får felet vet exakt var värdet hämtas.
function brister(identitet, { env = process.env, fil = franFil() } = {}) {
  const fel = [];
  for (const f of FALT) {
    const varde = identitet[f.nyckel];
    if (!varde || PLATSHALLARE.test(varde)) {
      fel.push(`${f.nyckel} saknas — hämta "${f.partnerCenter}" från VYRA Studios identitetssida i ` +
               `Partner Center (Store ID 9PPKZN2SCJM2) och skriv in det i store-identitet.json`);
      continue;
    }
    if (f.nyckel === 'publisher' && !X500.test(varde)) {
      fel.push('publisher måste vara hela X.500-strängen från Partner Center och börja med "CN=" — ' +
               'certifieringen jämför den tecken för tecken');
    }
    if (f.nyckel === 'identityName' && !IDENTITETSNAMN.test(varde)) {
      fel.push('identityName har fel form — det ska vara Package/Identity/Name exakt som det står i ' +
               'Partner Center');
    }

    // DIVERGENS ÄR ETT FEL, INTE EN OVERRIDE. Ett bygge som kan byta identitet genom en kvarglömd
    // miljövariabel är inte reproducerbart ur repot.
    const franEnv = String(env[f.env] || '').trim();
    const franFilen = String(fil[f.nyckel] || '').trim();
    if (franEnv && franFilen && franEnv !== franFilen) {
      fel.push(`${f.nyckel}: ${f.env} säger något annat än den incheckade filen. Filen gäller — ` +
               'ta bort variabeln, eller ändra filen mot Partner Center om posten faktiskt bytt identitet');
    }
  }
  return fel;
}

const arGiltig = (identitet, opts) => brister(identitet, opts).length === 0;

// Bygget fastnar hellre än gissar.
function krav(opts) {
  const identitet = las(opts);
  const fel = brister(identitet, opts);
  if (fel.length) {
    throw new Error('Store-identiteten är ofullständig, och den får inte gissas:\n  - ' + fel.join('\n  - '));
  }
  return identitet;
}

module.exports = { las, brister, arGiltig, krav, franFil, FALT, FIL };
