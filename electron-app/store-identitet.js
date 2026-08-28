'use strict';
// MICROSOFT STORE-IDENTITETEN — HÄMTAD, ALDRIG GISSAD.
//
// Ett Store-paket måste bära exakt den identitet Microsoft reserverat åt just den här produkten.
// De tre värdena står på VYRA-postens identitetssida i Partner Center:
//
//   Package/Identity/Name  -> identityName          (t.ex. "12345Foretaget.VYRA")
//   Publisher              -> publisher             (hela X.500-strängen, "CN=..." med GUID)
//   Publisher display name -> publisherDisplayName  (visningsnamnet i butiken)
//
// VARFÖR DE INTE FÅR GISSAS. Identiteten är inte kosmetik: den binder paketet till Store-posten.
// Ett paket med fel `Publisher` avvisas i certifieringen, och ett med fel `identityName` kan i
// värsta fall gå igenom som en ANNAN produkt. Ett rimligt påhittat värde är farligare än ett tomt,
// för det ser rätt ut ända tills någon annan drabbas av det.
//
// Modulen läser därför bara, validerar hårt, och FALLER med en instruktion om något saknas. Den har
// medvetet inget standardvärde och ingen reserv.

const fs = require('node:fs');
const path = require('node:path');

// Env vinner över fil, så CI kan mata in dem utan att de behöver committas. Värdena är inte
// hemligheter — de står i klartext i varje publicerat pakets manifest — men de är miljöberoende.
const FALT = [
  { nyckel: 'identityName', env: 'VYRA_STORE_IDENTITY_NAME', partnerCenter: 'Package/Identity/Name' },
  { nyckel: 'publisher', env: 'VYRA_STORE_PUBLISHER', partnerCenter: 'Publisher' },
  { nyckel: 'publisherDisplayName', env: 'VYRA_STORE_PUBLISHER_DISPLAY_NAME', partnerCenter: 'Publisher display name' }
];

const FIL = path.join(__dirname, 'store-identitet.json');

// Former som ser ifyllda ut men inte är det. Utan den här listan blir ett kvarglömt exempelvärde
// ett paket som byggs, signeras och skickas in — och först certifieringen säger ifrån.
const PLATSHALLARE = /^(|<.*>|TODO|FIXME|ANGE|xxx+|placeholder|CN=Example|CN=Contoso.*|12345[A-Za-z]*\.Example.*)$/i;

// Publisher är en X.500-sträng. Certifieringen jämför den TECKEN FÖR TECKEN mot Store-posten, så
// ett värde som inte ens börjar med CN= är garanterat fel och ska stoppas här, inte där.
const X500 = /^CN=.+/;

// Store-identitetsnamn: bokstäver, siffror, punkt och bindestreck. Microsofts eget format är
// <prefix>.<namn>, och prefixet är kontospecifikt — därför ingen hårdare regel än teckenuppsättningen.
const IDENTITETSNAMN = /^[A-Za-z0-9][A-Za-z0-9.-]{1,49}$/;

function franFil() {
  try { return JSON.parse(fs.readFileSync(FIL, 'utf8')); }
  catch { return {}; }
}

function las(env = process.env) {
  const fil = franFil();
  const ut = {};
  for (const f of FALT) ut[f.nyckel] = String(env[f.env] || fil[f.nyckel] || '').trim();
  return ut;
}

// Returnerar en lista med brister — tom lista betyder giltig. Varje brist NAMNGER både fältet i
// Partner Center och miljövariabeln, så den som får felet vet exakt var värdet hämtas.
function brister(identitet) {
  const fel = [];
  for (const f of FALT) {
    const varde = identitet[f.nyckel];
    if (!varde || PLATSHALLARE.test(varde)) {
      fel.push(`${f.nyckel} saknas — hämta "${f.partnerCenter}" från VYRA-postens identitetssida i ` +
               `Partner Center och sätt ${f.env} (eller fältet i store-identitet.json)`);
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
  }
  return fel;
}

const arGiltig = identitet => brister(identitet).length === 0;

// Bygger fastnar hellre än gissar.
function krav(env = process.env) {
  const identitet = las(env);
  const fel = brister(identitet);
  if (fel.length) {
    throw new Error('Store-identiteten är ofullständig, och den får inte gissas:\n  - ' + fel.join('\n  - '));
  }
  return identitet;
}

module.exports = { las, brister, arGiltig, krav, FALT, FIL };
