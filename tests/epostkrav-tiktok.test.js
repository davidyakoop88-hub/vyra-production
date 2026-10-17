'use strict';
// ETT NYTT KONTO KUNDE INTE ANSLUTA TIKTOK — OCH FICK INTE VETA VARFÖR.
//
// Rapporterat 2026-10-17: en nyregistrerad användare kom inte förbi "Anslut TikTok". Kedjan:
//
//   server/index.js stoppar VARJE anrop som inte är GET från ett konto med overifierad e-post
//   (403 "Verifiera din e-postadress innan du sparar eller publicerar."). Det gäller också
//   PUT /tiktok-connection, POST /tiktok-verifiering och POST /tiktok-connection/anslut-nu.
//   Ett gammalt konto har verifierat sin e-post; ett nytt har det inte. Det är hela skillnaden.
//
//   Samtidigt lovade bannern i auth-security.js att "allt annat fungerar redan" — bara Premium och
//   VYRA Desktop skulle kräva verifiering. Användaren hade alltså ingen anledning att öppna mejlet,
//   tryckte "Anslut konto" och fick en toast om att "spara eller publicera", som försvann.
//
// Spärren står kvar med flit: varje anslutning är en bryggplats (MAX_BRIDGES), och overifierade
// engångskonton ska inte kunna ta dem. Det som lagas är att beskedet blir sant och går att agera på.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

const ROT = path.join(__dirname, '..');
const las = f => fs.readFileSync(path.join(ROT, f), 'utf8');

const MODAL = `<button class="connect connection"><i></i><span>Anslut TikTok</span></button>
<dialog id="connectModal" open>
  <button class="primary" id="verifieraTikTok">Verifiera med TikTok</button>
  <div id="tikAnslutNu" hidden><button id="anslutNu">Anslut nu</button></div>
  <div id="tikFritext"><input id="tikUser"><button id="connectNow">Anslut konto</button></div>
</dialog>`;

function epostfel() {
  return Object.assign(new Error('Verifiera din e-postadress innan du sparar eller publicerar.'),
    { status: 403, emailVerificationRequired: true });
}

function studio({ connect, verifiera } = {}) {
  const dom = new JSDOM(`<!doctype html><body>${MODAL}</body>`, { runScripts: 'outside-only', url: 'https://vyra.test/studio.html' });
  const w = dom.window, anrop = [], toasts = [];
  w.toast = t => toasts.push(String(t));
  w.state = {}; w.save = () => {};
  w.VyraAuth = {
    lastDetail: () => ({ user: { email: 'ny@exempel.se', emailVerified: false }, workspaces: [{ id: 'w1' }] }),
    api: async (p, o) => { anrop.push([p, o && o.method]); return { ok: true }; },
  };
  w.VyraLive = {
    status: async () => ({ ok: true, connection: { connected: false, state: 'idle' } }),
    connect: connect || (async () => { throw epostfel(); }),
    verifiera: verifiera || (async () => { throw epostfel(); }),
    anslutNu: async () => { throw epostfel(); },
  };
  w.eval(las('studio-live.js'));
  return { w, d: w.document, anrop, toasts };
}
const vanta = () => new Promise(r => setTimeout(r, 30));

test('e-postkrav: "Anslut konto" visar i modalen att e-posten måste verifieras — och var', async () => {
  const { d } = studio();
  d.querySelector('#tikUser').value = 'nykanal';
  d.querySelector('#connectNow').click();
  await vanta();
  const ruta = d.querySelector('#connectModal [data-epostkrav]');
  assert.ok(ruta, 'modalen säger ingenting om e-posten — användaren får bara en toast som försvinner');
  assert.match(ruta.textContent, /e-post/i);
  assert.match(ruta.textContent, /TikTok/, 'beskedet måste säga att det är TikTok-anslutningen som väntar');
  assert.match(ruta.textContent, /ny@exempel\.se/, 'beskedet ska säga VILKEN adress mejlet gick till');
});

test('e-postkrav: "Verifiera med TikTok" ger samma besked', async () => {
  const { d } = studio();
  d.querySelector('#verifieraTikTok').click();
  await vanta();
  assert.ok(d.querySelector('#connectModal [data-epostkrav]'), 'verifieringsknappen tiger om e-postkravet');
  assert.equal(d.querySelector('#verifieraTikTok').disabled, false, 'knappen ska gå att trycka igen');
});

test('e-postkrav: beskedet har en knapp som skickar verifieringsmejlet igen', async () => {
  const { d, anrop } = studio();
  d.querySelector('#tikUser').value = 'nykanal';
  d.querySelector('#connectNow').click();
  await vanta();
  const knapp = d.querySelector('#connectModal [data-epostkrav] button');
  assert.ok(knapp, 'ingen väg vidare från beskedet');
  knapp.click();
  await vanta();
  assert.deepEqual(anrop.at(-1), ['/api/auth/email/send-verification', 'POST']);
});

test('e-postkrav: ett ANNAT fel visar inte e-postbeskedet', async () => {
  const { d, toasts } = studio({ connect: async () => { throw Object.assign(new Error('Ogiltigt TikTok-anvandarnamn'), { status: 400 }); } });
  d.querySelector('#tikUser').value = 'x y';
  d.querySelector('#connectNow').click();
  await vanta();
  assert.equal(d.querySelector('#connectModal [data-epostkrav]'), null);
  assert.ok(toasts.includes('Ogiltigt TikTok-anvandarnamn'), 'vanliga fel ska fortfarande visas som förut');
});

test('e-postkrav: auth-client för vidare serverns emailVerificationRequired på felet', async () => {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://vyra.test/studio.html' });
  const w = dom.window;
  w.fetch = async () => ({ ok: false, status: 403, json: async () => ({ ok: false, emailVerificationRequired: true, error: 'Verifiera' }) });
  w.eval(las('auth-client.js'));
  assert.ok(w.VyraAuth && typeof w.VyraAuth.api === 'function', 'auth-client.js exponerar inte VyraAuth.api');
  const fel = await w.VyraAuth.api('/api/workspaces/w1/tiktok-connection', { method: 'PUT', body: '{}' }).catch(e => e);
  assert.equal(fel.status, 403);
  assert.equal(fel.emailVerificationRequired, true, 'flaggan tappas i klienten — då kan studion inte skilja e-postkravet från andra 403');
});

test('e-postkrav: servern märker spärren med emailVerificationRequired', () => {
  const rad = las('server/index.js').split('\n').find(r => r.includes("!s.email_verified_at&&!p.startsWith('/api/auth/sessions')"));
  assert.ok(rad, 'hittade inte e-postspärren i server/index.js');
  assert.match(rad, /emailVerificationRequired\s*:\s*true/, 'spärren svarar utan maskinläsbar flagga');
});

test('e-postkrav: bannern lovar inte längre att allt annat fungerar utan verifiering', () => {
  const kalla = las('auth-security.js');
  assert.doesNotMatch(kalla, /allt annat fungerar redan/, 'bannern lovar något servern inte håller');
  assert.match(kalla, /verificationBanner[\s\S]{0,900}TikTok/, 'bannern nämner inte att TikTok kräver verifierad e-post');
});
