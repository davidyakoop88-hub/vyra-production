'use strict';
// SANERING AV FELTEXT INNAN DEN NÅR EN LOGG.
//
// Bryggans loggar går till Railway och läses av människor vid felsökning. Två saker får aldrig
// hamna där, och båda har varit verkliga i den här koden:
//
//   1. HELA FELOBJEKT. `err?.message || err` ser oskyldigt ut, men när message saknas
//      serialiseras objektet med allt det bär — headers, svarskroppar, interna id:n. Uppmätt
//      2026-08-26: gåvokatalogens fel hade inget `message`, så bridge.js:501 skrev ut hela
//      objektet med stackspår och alla fält.
//   2. UPPKOPPLINGSSTRÄNGAR MED LÖSENORD. PROXY_LIST dokumenteras i proxy-manager.js som
//      "http://user:pass@ip:port", och Postgres-fel bär ofta hela DSN:en. Samma fynd rättades en
//      gång i utkorgsworkern (server/stream-worker.js) — den här filen är bryggans motsvarighet.
//
// Regeln: aldrig ett objekt, aldrig en URL med inloggningsuppgifter, alltid längdbegränsat.

const TAK = 200;

// Plockar en textrepresentation UTAN att serialisera okända fält. Ett objekt utan `message` blir
// sin konstruktortyp, inte sitt innehåll.
function text(fel) {
  if (fel === null || fel === undefined) return 'okänt fel';
  if (typeof fel === 'string') return fel;
  if (typeof fel.message === 'string' && fel.message) return fel.message;
  // constructor.name FORE name: en Error-subklass arver name === 'Error', sa
  // SignatureMissingTokensError hade blivit bara 'Error' och typen — det enda felsokningsvarde
  // som finns kvar nar message saknas — gatt forlorad.
  const kon = fel.constructor && fel.constructor.name;
  if (kon && kon !== 'Object') return kon;
  if (typeof fel.name === 'string' && fel.name) return fel.name;
  return '<Object utan message>';
}

function sanera(fel) {
  return text(fel)
    // user:pass@host i vilken URL som helst — proxy, Postgres, Redis.
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s@/]*@/gi, '<uppkoppling>@')
    // password=..., token: ..., secret=... i fritext.
    .replace(/\b(password|pwd|token|secret|auth|apikey|api_key)\s*[=:]\s*\S+/gi, '$1=<dolt>')
    .slice(0, TAK);
}

// En URL som ska loggas för sig — proxyadressen i en felrad. Behåller värd och port, som är det
// felsökningsvärdet, och slänger inloggningsuppgifterna.
function saneraUrl(url) {
  const s = String(url || '');
  if (!s) return '';
  return s.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^\s@/]*@/i, '$1<uppgifter>@').slice(0, TAK);
}

module.exports = { sanera, saneraUrl, TAK };
