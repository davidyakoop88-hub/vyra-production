// landing-login.js — inloggningskortet på framsidan.
//
// Kortet DUPLICERAR INTE kontosystemet — det talar exakt samma API som gaten i auth-client.js:
// POST /api/auth/login|register {email, password[, displayName]} → {csrfToken, mfaRequired?},
// och vid tvåsteg POST /api/auth/mfa/challenge {code}. Lyckad inloggning landar i studio.html,
// där auth-client.js:s init() hittar den färdiga sessionen via /api/auth/me och aldrig visar
// gaten. CSRF-tokenen läggs i sessionStorage under samma nyckel ('vyra-csrf') av samma skäl.
//
// Kortet är en FÖRSTÄRKNING av framsidan: utan JS är knappen en vanlig submit som ingenstans
// går, och länken "Öppna Studio" bredvid tar alltid besökaren till studio.html där gaten
// finns som reserv. studio.html rör aldrig den här modulen — tests/framsida-inloggning.test.js.
(function () {
  'use strict';

  const kort = document.querySelector('[data-login]');
  if (!kort) return;


  // ---- SLAPP IN: dorren oppnas, gubben gar in, kortet blir gront ------------------------------
  //
  // Davids onskan 2026-08-21. Sekvensen spelas EN gang, pa BADA framgangsvagarna (vanlig
  // inloggning och tvasteg), och landar sedan i studion som forut.
  //
  // TRE REGLER:
  //   1. Inloggningen far aldrig HANGA pa en animation. Redirecten sker efter en fast tid, och
  //      kastar nagot i sekvensen gar vi vidare anda — inloggningen ar redan gjord vid det laget.
  //   2. prefers-reduced-motion hoppar RAKT till studion. Ingen dorr, ingen gubbe, ingen vantan.
  //   3. Ingen anvandardata ritas har, sa en statisk SVG-strang ar trygg. Namnet visas aldrig.
  const SLAPP_IN_MS = 1500;

  function slappIn(gaVidare) {
    try {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return gaVidare();
      kort.classList.add('login-klar');

      const scen = document.createElement('div');
      scen.className = 'login-dorr';
      scen.setAttribute('aria-hidden', 'true');
      scen.innerHTML =
        '<span class="login-dorr-karm"><span class="login-dorr-ljus"></span>'
        + '<span class="login-dorr-blad"></span></span>'
        + '<svg class="login-gubbe" viewBox="0 0 24 40" fill="none">'
        + '<circle cx="12" cy="6" r="4.6" fill="currentColor"/>'
        + '<rect x="8.4" y="12" width="7.2" height="13" rx="3.4" fill="currentColor"/>'
        + '<rect class="login-ben login-ben-a" x="9.4" y="24" width="2.6" height="12" rx="1.3" fill="currentColor"/>'
        + '<rect class="login-ben login-ben-b" x="12.4" y="24" width="2.6" height="12" rx="1.3" fill="currentColor"/>'
        + '<rect class="login-arm" x="5.6" y="13.5" width="2.4" height="9" rx="1.2" fill="currentColor"/>'
        + '</svg>';
      kort.append(scen);

      // For den som INTE ser animationen. Egen nod med role=status, sa en skarmlasare far beskedet.
      const ord = document.createElement('p');
      ord.className = 'login-valkommen';
      ord.setAttribute('role', 'status');
      ord.textContent = 'Välkommen in';
      kort.append(ord);
    } catch (e) {
      return gaVidare();   // en trasig festyta far aldrig sta i vagen for en lyckad inloggning
    }
    setTimeout(gaVidare, SLAPP_IN_MS);
  }

  const form = kort.querySelector('form');
  const felrad = kort.querySelector('#loginError');
  const knapp = form.querySelector('button[type="submit"]');
  const namnFalt = kort.querySelector('[data-login-namn]');
  const flikar = kort.querySelectorAll('[data-login-flik]');
  let lage = 'login';

  async function api(path, body) {
    const csrf = sessionStorage.getItem('vyra-csrf');
    const r = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-VYRA-CSRF': csrf } : {}) },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({ ok: false, error: 'Serverfel' }));
    if (!r.ok) throw new Error(d.error || 'Serverfel');
    return d;
  }

  function bytLage(nytt) {
    lage = nytt;
    flikar.forEach(f => f.classList.toggle('active', f.dataset.loginFlik === lage));
    namnFalt.hidden = lage !== 'register';
    namnFalt.querySelector('input').required = lage === 'register';
    form.querySelector('#loginPassword').autocomplete =
      lage === 'login' ? 'current-password' : 'new-password';
    knapp.querySelector('b').textContent = lage === 'login' ? 'Logga in' : 'Skapa konto';
    felrad.textContent = '';
  }
  flikar.forEach(f => { f.onclick = () => bytLage(f.dataset.loginFlik) });

  // Tvåstegsläget byter kortets formulär mot kodfältet — samma dramaturgi som gaten.
  function mfaSteg() {
    form.hidden = true;
    const mfa = kort.querySelector('[data-login-mfa]');
    mfa.hidden = false;
    const kodForm = mfa.querySelector('form');
    kodForm.onsubmit = async e => {
      e.preventDefault();
      const kodKnapp = kodForm.querySelector('button');
      kodKnapp.disabled = true;
      mfa.querySelector('#loginMfaError').textContent = '';
      try {
        await api('/api/auth/mfa/challenge', { code: kodForm.querySelector('#loginMfaCode').value });
        return slappIn(() => { location.href = 'studio.html' });
      } catch (err) {
        mfa.querySelector('#loginMfaError').textContent = err.message;
        kodKnapp.disabled = false;
      }
    };
    mfa.querySelector('#loginMfaCode').focus();
  }

  // Glömt lösenord: kortet BEGÄR bara engångslänken (POST /api/auth/password/request) —
  // själva återställningen är redan byggd och landar i studio.html?reset-password, där
  // auth-security.js:s recover() tar vid. Samma svarstext oavsett om kontot finns.
  const glomt = kort.querySelector('[data-login-forgot]');
  kort.querySelector('[data-login-glomt]').onclick = e => {
    e.preventDefault();
    form.hidden = true;
    glomt.hidden = false;
    glomt.querySelector('#loginForgotEmail').value = form.querySelector('#loginEmail').value;
    glomt.querySelector('#loginForgotEmail').focus();
  };
  kort.querySelector('[data-login-tillbaka]').onclick = () => {
    glomt.hidden = true;
    form.hidden = false;
    felrad.textContent = '';
  };
  glomt.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    const skicka = glomt.querySelector('button[type="submit"]');
    const fel = glomt.querySelector('#loginForgotError');
    skicka.disabled = true;
    fel.textContent = '';
    try {
      await api('/api/auth/password/request', { email: glomt.querySelector('#loginForgotEmail').value });
      glomt.querySelector('.login-mfa-text').textContent =
        'Om kontot finns är länken på väg — kolla din inkorg. Länken kan bara användas en gång.';
      glomt.querySelector('form').hidden = true;
      skicka.disabled = false;
    } catch (err) {
      fel.textContent = err.message;
      skicka.disabled = false;
    }
  };

  form.onsubmit = async e => {
    e.preventDefault();
    const payload = {
      email: form.querySelector('#loginEmail').value,
      password: form.querySelector('#loginPassword').value,
    };
    if (lage === 'register') payload.displayName = form.querySelector('#loginName').value;
    knapp.disabled = true;
    felrad.textContent = '';
    try {
      const d = await api('/api/auth/' + lage, payload);
      if (d.csrfToken) sessionStorage.setItem('vyra-csrf', d.csrfToken);
      if (d.mfaRequired) return mfaSteg();
      return slappIn(() => { location.href = 'studio.html' });
    } catch (err) {
      felrad.textContent = err.message;
      knapp.disabled = false;
    }
  };
})();
