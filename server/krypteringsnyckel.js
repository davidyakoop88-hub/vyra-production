'use strict';
// APP_ENCRYPTION_KEY — EN ENDA STRIKT TOLKNING, DELAD AV ALLA SOM LÄSER NYCKELN.
//
// Varför modulen finns. Fram till 2026-08-28 fanns TVÅ olika krav på samma variabel:
//
//   production-config.js  krävde minst 32 TECKEN            (och stoppade uppstarten)
//   token-vault.js        krävde exakt 32 BYTES base64url   (och kastade först vid användning)
//
// De två är inte samma sak, och glappet mellan dem var tyst. En nyckel på 32 tecken som inte är
// giltig base64url passerade uppstarten, servern startade och såg frisk ut — men:
//
//   · token-vault kastade först när någon faktiskt förseglade eller öppnade något
//     (MFA-hemligheter, åtgärds-URL:er), alltså långt efter deployen och för en enskild användare
//   · heart-me-goal.js är fail-closed och hade räknat NOLL i tysthet, vilket syns som en widget
//     som står still — inte som ett fel
//
// Ett formatfel såg alltså ut som ett funktionsfel. Nu tolkas nyckeln på exakt ETT ställe, och
// uppstarten nekar allt som inte är kanonisk base64url som avkodar till exakt 32 bytes.
//
// KANONISK, inte bara avkodbar. 32 bytes blir 43 base64url-tecken, och det sista tecknet bär bara
// två signifikanta bitar — bara A, Q, g och w är kanoniska där. Ett annat tecken avkodar ändå till
// 32 bytes men kodas tillbaka till något annat. Två olika strängar skulle då ge samma nyckel, och
// en rotation som "bara ändrar sista tecknet" hade sett ut att göra något utan att göra det.
// Rundgångskontrollen nedan är det som fångar den formen.

const NYCKELLANGD = 32;

// 43 tecken ur base64url-alfabetet, ingen utfyllnad. Inget '+', inget '/', inget '='.
const FORM = /^[A-Za-z0-9_-]{43}$/;

// Enda tolkningen. Returnerar nyckelns bytes, eller null. Kastar aldrig och loggar aldrig — den som
// vill ha ett fel ber om det med krav() nedan.
function las(ra) {
  if (typeof ra !== 'string' || !FORM.test(ra)) return null;
  const bytes = Buffer.from(ra, 'base64url');
  if (bytes.length !== NYCKELLANGD) return null;
  if (bytes.toString('base64url') !== ra) return null;   // icke-kanonisk sista sextett
  return bytes;
}

const arGiltig = ra => las(ra) !== null;

// FELMEDDELANDET BÄR ALDRIG VÄRDET, inte heller dess längd. Ett uppstartsfel hamnar i deployloggen,
// och en loggrad som avslöjar hur nära man var är en läcka i sig.
const KRAV = 'måste vara en kanonisk base64url-nyckel som avkodar till exakt 32 bytes';

function krav(ra, namn = 'APP_ENCRYPTION_KEY') {
  const bytes = las(ra);
  if (!bytes) throw new Error(`${namn} ${KRAV}`);
  return bytes;
}

module.exports = { las, arGiltig, krav, NYCKELLANGD, FORM, KRAV };
