'use strict';
// Täcker server/tiktok-verifiering.js — vägen från TikToks kod till ett handtag vi vågar skriva.
//
// Provet finns för att verifieringen har en tyst felmod som INGET lyckofall avslöjar: på TikToks
// medgivandesida är `user.info.profile` ett REGLAGE som användaren kan slå av och ändå trycka
// Fortsätt. Då kommer ett fullt giltigt svar tillbaka — med `open_id` men UTAN `username`. Sparas
// det ändå får workspacet en rad som ser verifierad ut och inte är det. Uppmätt på TikToks egen
// medgivandesida 2026-09-17.
const test = require('node:test'), assert = require('node:assert/strict');
const crypto = require('node:crypto');
const V = require('../tiktok-verifiering');

const NYCKEL = 'awtestclientkey00';
const HEMLIS = 'hemlis-som-aldrig-far-synas';
const OMDIRIGERING = 'https://vyralive.app/api/auth/callback/tiktok';

// Ett svarspar som liknar TikToks: först token, sedan användaren.
function fejkHamta({ token, anvandare, tokenStatus = 200, anvandarStatus = 200 } = {}) {
  const anrop = [];
  const hamta = async (url, init) => {
    anrop.push({ url: String(url), init });
    const svar = String(url).includes('/oauth/token')
      ? { status: tokenStatus, kropp: token }
      : { status: anvandarStatus, kropp: anvandare };
    return { ok: svar.status < 400, status: svar.status, async json() { return svar.kropp } };
  };
  hamta.anrop = anrop;
  return hamta;
}

const TOKEN_OK = { access_token: 'act.hemlig', open_id: 'open-1', scope: 'user.info.basic,user.info.profile' };
const ANV_OK = { data: { user: { open_id: 'open-1', union_id: 'union-1', username: 'StreamQueen',
  display_name: 'Stream Queen', avatar_url: 'https://p16.tiktok.com/a.jpg' } } };

test('auktoriserings-URL:en bär allt TikTok kräver, och PKCE-utmaningen är S256 av verifieraren', () => {
  const { verifierare, utmaning } = V.pkce();
  const url = new URL(V.byggAuktoriseringsUrl({
    clientKey: NYCKEL, redirectUri: OMDIRIGERING, state: 'st-1', kodutmaning: utmaning }));

  assert.equal(url.origin + url.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
  assert.equal(url.searchParams.get('client_key'), NYCKEL);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('redirect_uri'), OMDIRIGERING);
  assert.equal(url.searchParams.get('state'), 'st-1');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), utmaning);

  // user.info.profile är inte valfritt: utan det scopet finns fältet `username` inte i svaret,
  // och då finns inget handtag att verifiera. Uppmätt mot TikToks dokumentation 2026-09-17.
  const scope = String(url.searchParams.get('scope')).split(',');
  assert.ok(scope.includes('user.info.profile'), 'user.info.profile måste begäras');
  assert.ok(scope.includes('user.info.basic'));
  // ...och INGET mer. TikToks granskningsanvisning säger att scope som inte demonstreras i
  // ansökan fördröjer granskningen, och VYRA läser inga följarsiffror någonstans. Läggs ett
  // scope till här ska det vara ett medvetet beslut med en användning i koden — inte en kopia
  // av någon annans uppsättning.
  assert.deepEqual(scope, ['user.info.basic', 'user.info.profile']);

  // Utmaningen ska vara härledd, inte slumpad separat — annars misslyckas inlösningen hos TikTok.
  assert.equal(crypto.createHash('sha256').update(verifierare).digest('base64url'), utmaning);
});

test('pkce() ger ett nytt par varje gång', () => {
  const a = V.pkce(), b = V.pkce();
  assert.notEqual(a.verifierare, b.verifierare);
  assert.notEqual(a.utmaning, b.utmaning);
  assert.ok(a.verifierare.length >= 43, 'PKCE kräver minst 43 tecken');
});

test('verifiera() returnerar handtaget normaliserat på husets form', async () => {
  const ut = await V.verifiera({ clientKey: NYCKEL, clientSecret: HEMLIS, redirectUri: OMDIRIGERING,
    kod: 'kod-1', kodverifierare: 'verif-1', hamta: fejkHamta({ token: TOKEN_OK, anvandare: ANV_OK }) });

  // TikTok svarar 'StreamQueen'; tiktok_connections och bryggan känner bara 'streamqueen'.
  assert.equal(ut.handtag, 'streamqueen');
  assert.equal(ut.openId, 'open-1');
  assert.equal(ut.unionId, 'union-1');
  assert.equal(ut.visningsnamn, 'Stream Queen');
  assert.equal(ut.avatarUrl, 'https://p16.tiktok.com/a.jpg');
});

test('AVVISAR när username saknas — det avslagna reglaget får aldrig bli en halvverifierad rad', async () => {
  const utanNamn = { data: { user: { open_id: 'open-1', display_name: 'Stream Queen' } } };
  await assert.rejects(
    () => V.verifiera({ clientKey: NYCKEL, clientSecret: HEMLIS, redirectUri: OMDIRIGERING,
      kod: 'kod-1', kodverifierare: 'verif-1', hamta: fejkHamta({ token: TOKEN_OK, anvandare: utanNamn }) }),
    /användarnamn/i);
});

test('AVVISAR ett username som inte håller TikToks egen form i stället för att tvätta det', async () => {
  const skrap = { data: { user: { open_id: 'open-1', username: 'bad name <script>' } } };
  await assert.rejects(
    () => V.verifiera({ clientKey: NYCKEL, clientSecret: HEMLIS, redirectUri: OMDIRIGERING,
      kod: 'kod-1', kodverifierare: 'verif-1', hamta: fejkHamta({ token: TOKEN_OK, anvandare: skrap }) }),
    /användarnamn/i);
});

test('lämnar aldrig ut access-token — VYRA har inget att lagra och därmed inget att läcka', async () => {
  const ut = await V.verifiera({ clientKey: NYCKEL, clientSecret: HEMLIS, redirectUri: OMDIRIGERING,
    kod: 'kod-1', kodverifierare: 'verif-1', hamta: fejkHamta({ token: TOKEN_OK, anvandare: ANV_OK }) });
  const text = JSON.stringify(ut);
  assert.ok(!text.includes('act.hemlig'), 'access-token får inte följa med ut');
  assert.ok(!text.includes(HEMLIS), 'client secret får inte följa med ut');
  assert.equal(ut.accessToken, undefined);
});

test('skickar koden och PKCE-verifieraren i KROPPEN, aldrig i query-strängen', async () => {
  const hamta = fejkHamta({ token: TOKEN_OK, anvandare: ANV_OK });
  await V.verifiera({ clientKey: NYCKEL, clientSecret: HEMLIS, redirectUri: OMDIRIGERING,
    kod: 'kod-1', kodverifierare: 'verif-1', hamta });

  const token = hamta.anrop.find(a => a.url.includes('/oauth/token'));
  assert.equal(token.init.method, 'POST');
  assert.ok(!token.url.includes('kod-1'), 'koden får inte ligga i URL:en — den hamnar i loggar');
  const kropp = new URLSearchParams(token.init.body);
  assert.equal(kropp.get('code'), 'kod-1');
  assert.equal(kropp.get('code_verifier'), 'verif-1');
  assert.equal(kropp.get('grant_type'), 'authorization_code');
  assert.equal(kropp.get('redirect_uri'), OMDIRIGERING);
});

test('begär exakt de fält vi tänker spara, med token i Authorization-huvudet', async () => {
  const hamta = fejkHamta({ token: TOKEN_OK, anvandare: ANV_OK });
  await V.verifiera({ clientKey: NYCKEL, clientSecret: HEMLIS, redirectUri: OMDIRIGERING,
    kod: 'kod-1', kodverifierare: 'verif-1', hamta });

  const anv = hamta.anrop.find(a => a.url.includes('/user/info'));
  const falt = new URL(anv.url).searchParams.get('fields').split(',');
  assert.ok(falt.includes('username'), 'utan fields=username svarar TikTok utan handtaget');
  assert.ok(falt.includes('open_id'));
  assert.equal(anv.init.headers.Authorization, 'Bearer act.hemlig');
});

test('ett fel från TikTok blir ett fel här — och bär aldrig med sig hemligheten', async () => {
  const fel = { error: 'invalid_grant', error_description: 'Authorization code expired' };
  await assert.rejects(
    () => V.verifiera({ clientKey: NYCKEL, clientSecret: HEMLIS, redirectUri: OMDIRIGERING,
      kod: 'kod-1', kodverifierare: 'verif-1',
      hamta: fejkHamta({ token: fel, tokenStatus: 400, anvandare: ANV_OK }) }),
    error => {
      assert.ok(!String(error.message).includes(HEMLIS), 'client secret får aldrig nå ett felmeddelande');
      return true;
    });
});
