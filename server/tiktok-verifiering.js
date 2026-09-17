'use strict';
// TikTok Login Kit v2 — vägen från "Verifiera med TikTok" till ett handtag vi vågar skriva.
//
// VARFÖR DEN HÄR FILEN FINNS. Fram till nu var tiktok_connections.tiktok_username FRITEXT: den som
// skrev @någon_annan fick bryggan startad mot den personens sändning, och stream-stats.js började
// spara DERAS publiks viewer_id, display_name och avatar_url i ett främmande workspace. Ingen
// kontroll fanns någonstans i kedjan — capacity-gate.js kollar bara att inget ANNAT workspace
// redan tagit namnet. Verifieringen är det enda som gör anspråket till ett bevis.
//
// TRE VAL SOM ÄR MEDVETNA:
//
//   1. INGEN TOKEN SPARAS. VYRA behöver inget löpande anrop mot TikTok — bara handtaget, en gång.
//      Access-token läses, används i samma andetag och slängs; den når aldrig databasen och
//      returneras aldrig härifrån. Den säkraste hemligheten är den som inte finns. Provet
//      "lämnar aldrig ut access-token" pinnar det, så en framtida bekvämlighet inte smyger in den.
//   2. KODEN LIGGER I KROPPEN, ALDRIG I URL:EN. En auktoriseringskod i en query-sträng hamnar i
//      åtkomstloggar, i proxyloggar och i felrapporter. Provet pinnar även det.
//   3. NORMALISERING VIA security.normalizeTikTokUsername — SAMMA funktion som fritextvägen använt
//      hela tiden. Handtaget blir en Postgres-rad OCH en argv-post till en forkad bryggprocess,
//      så det får inte finnas två uppfattningar om vad ett giltigt namn är.
const crypto = require('node:crypto');
const { normalizeTikTokUsername } = require('./security');

const AUKTORISERING = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const ANVANDARE = 'https://open.tiktokapis.com/v2/user/info/';

// `username` är HANDTAGET (@namnet) och kräver scope user.info.profile. `display_name` är något
// annat: ett fritt valt visningsnamn som går att byta när som helst och som INTE identifierar
// kontot. Blanda aldrig ihop dem — verifieringen hänger på det första.
const FALT = 'open_id,union_id,username,display_name,avatar_url';

// user.info.stats är med för profilkortet (följare/följer). Det är inte nödvändigt för själva
// verifieringen, och användaren kan slå av det utan att något går sönder — se läsningen nedan.
const SCOPE = 'user.info.basic,user.info.profile,user.info.stats';

// PKCE. Verifieraren stannar hos oss (krypterad, se tiktok_verifieringsforsok), utmaningen reser
// till TikTok. Utan PKCE räcker en avlyssnad auktoriseringskod för att ta över varvet.
function pkce() {
  const verifierare = crypto.randomBytes(32).toString('base64url');
  const utmaning = crypto.createHash('sha256').update(verifierare).digest('base64url');
  return { verifierare, utmaning };
}

function byggAuktoriseringsUrl({ clientKey, redirectUri, state, kodutmaning }) {
  const url = new URL(AUKTORISERING);
  url.search = new URLSearchParams({
    client_key: clientKey,
    scope: SCOPE,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
    code_challenge: kodutmaning,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

// Ett fel från TikTok blir ett fel här — men bara med TikToks egen text. Varken client_secret,
// access-token eller auktoriseringskoden får någonsin nå ett felmeddelande: felmeddelanden
// loggas, och en loggad hemlighet är en läckt hemlighet.
function tiktokFel(kropp, status) {
  const kod = kropp && (kropp.error || kropp.error_code || (kropp.error && kropp.error.code));
  const text = kropp && (kropp.error_description || kropp.message
    || (kropp.error && kropp.error.message));
  return new Error(`TikTok svarade ${status}${kod ? ` (${kod})` : ''}${text ? `: ${text}` : ''}`);
}

async function vaxlaKod({ clientKey, clientSecret, redirectUri, kod, kodverifierare, hamta }) {
  const svar = await hamta(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code: kod,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: kodverifierare,
    }).toString(),
  });
  const kropp = await svar.json().catch(() => null);
  if (!svar.ok || !kropp || !kropp.access_token) throw tiktokFel(kropp, svar.status);
  return kropp.access_token;
}

async function hamtaAnvandare({ accessToken, hamta }) {
  const url = new URL(ANVANDARE);
  url.searchParams.set('fields', FALT);
  const svar = await hamta(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const kropp = await svar.json().catch(() => null);
  if (!svar.ok || !kropp) throw tiktokFel(kropp, svar.status);
  const anvandare = kropp.data && kropp.data.user;
  if (!anvandare) throw tiktokFel(kropp, svar.status);
  return anvandare;
}

// Hela varvet. Returnerar BARA det vi tänker spara.
async function verifiera({ clientKey, clientSecret, redirectUri, kod, kodverifierare, hamta = fetch }) {
  const accessToken = await vaxlaKod({ clientKey, clientSecret, redirectUri, kod, kodverifierare, hamta });
  const anvandare = await hamtaAnvandare({ accessToken, hamta });

  // DEN TYSTA FELMODEN. På TikToks medgivandesida är user.info.profile ett REGLAGE. Slår
  // användaren av det och trycker Fortsätt kommer ett fullt giltigt 200-svar tillbaka — med
  // open_id men UTAN username. Att spara det ändå ger en rad som ser verifierad ut och inte är
  // det: ett workspace utan handtag att koppla, eller värre, ett handtag som gissats fram på
  // annat håll och nu bär en verifieringsstämpel. Uppmätt på medgivandesidan 2026-09-17.
  //
  // Samma gren fångar ett username som inte håller TikToks egen form. Vi TVÄTTAR det inte —
  // normalizeTikTokUsername avvisar, och ett avvisat namn är ett fel, inte ett namn med
  // tecknen bortplockade.
  const handtag = normalizeTikTokUsername(anvandare.username);
  if (!handtag) {
    throw new Error('TikTok lämnade inget användarnamn. Godkänn raden om profilinformation '
      + '(bio, profillänk och verifieringsstatus) när du loggar in — utan den kan vi inte se '
      + 'vilket @handtag kontot har, och då går kontot inte att koppla.');
  }

  return {
    handtag,
    openId: String(anvandare.open_id || '') || null,
    unionId: String(anvandare.union_id || '') || null,
    visningsnamn: anvandare.display_name ? String(anvandare.display_name) : null,
    avatarUrl: anvandare.avatar_url ? String(anvandare.avatar_url) : null,
  };
}

module.exports = { pkce, byggAuktoriseringsUrl, verifiera, SCOPE, FALT, AUKTORISERING, TOKEN, ANVANDARE };
