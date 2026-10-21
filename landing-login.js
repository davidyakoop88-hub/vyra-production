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
  // TikTok-anslutningen kräver verifierad e-post (server/index.js, e-postspärren). Det sägs här,
  // där adressen skrivs in — inte först efteråt. Se tests/registrering-epost-fore-tiktok.test.js.
  const epostkrav = kort.querySelector('[data-login-epostkrav]');
  const flikar = kort.querySelectorAll('[data-login-flik]');
  const losenFalt = form.querySelector('#loginPassword');
  const losenKrav = kort.querySelector('[data-login-losenkrav]');
  const villkor = kort.querySelector('[data-login-villkor]');
  // Håll mig inloggad: bara i inloggningsläget, av som standard. Servern läser `remember: true`
  // (server/index.js) och ger då sessionen 30 dagar som rullar; utan rutan är allt som förut.
  // Inget lösenord och ingen token sparas i webbläsaren — det är fortfarande den HttpOnly-kaka
  // servern sätter som bär inloggningen. tests/hall-mig-inloggad.test.js.
  const minns = kort.querySelector('[data-login-minns]');
  const minnsRuta = kort.querySelector('#loginRemember');
  const minnsHjalp = kort.querySelector('[data-login-minns-hjalp]');
  let lage = 'login';

  // Visa/dölj lösenord. Texten ("Visa") och namnet ("Visa lösenord") står still och aria-pressed
  // bär läget — en text som byter till "Dölj" skulle inte längre finnas i knappens namn, och då
  // hittar röststyrning den inte (WCAG 2.5.3). Läget syns på knappens fyllning i styles.css.
  // Fältet döljs igen före varje skick, så inget klartextlösenord ligger kvar under dörren.
  const visaKnapp = kort.querySelector('[data-login-visa]');
  function visaLosen(pa) {
    if (!visaKnapp) return;
    losenFalt.type = pa ? 'text' : 'password';
    visaKnapp.setAttribute('aria-pressed', pa ? 'true' : 'false');
  }
  if (visaKnapp) visaKnapp.onclick = e => {
    e.preventDefault();
    visaLosen(losenFalt.type === 'password');
  };

  function lasbartFel(status, fel) {
    const text = typeof fel === 'string' ? fel.trim() : '';
    const tekniskt = !text || /^[a-z0-9_.\-]+$/.test(text) ||
      /^(unauthorized|forbidden|not found|too many requests|bad gateway|service unavailable|internal server error|gateway timeout|serverfel)$/i.test(text);
    if (!tekniskt) return text;
    if (status === 429) return 'För många försök. Vänta en stund och försök igen.';
    if (status >= 500) return 'Servern svarade inte. Försök igen om en stund.';
    return 'Det gick inte just nu. Försök igen om en stund.';
  }

  async function api(path, body) {
    const csrf = sessionStorage.getItem('vyra-csrf');
    const r = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-VYRA-CSRF': csrf } : {}) },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({ ok: false, error: 'Serverfel' }));
    // Ett tekniskt felord från en proxy eller gräns ("unauthorized", "rate_limited") ska aldrig stå
    // ordagrant i rutan (slutgranskning 2026-10-20 C-024). Serverns egna meddelanden är meningar på
    // svenska och går igenom som de är; ett ensamt maskinord ersätts med en svensk mening.
    if (!r.ok) throw new Error(lasbartFel(r.status, d.error));
    return d;
  }

  // FLIKARNA ÄR FLIKAR ÄVEN FÖR DEN SOM INTE SER DEM (granskningen 2026-10-17, F17/F18).
  // Rollen tab lovar tre saker: aria-selected följer den valda fliken, panelen namnges av den,
  // och bara den valda fliken nås med Tab — de andra med piltangenterna (roving tabindex).
  // Tidigare bytte bara klassen, så skärmläsaren sa "Logga in, vald" medan Skapa konto visades.
  function bytLage(nytt) {
    lage = nytt;
    flikar.forEach(f => {
      const vald = f.dataset.loginFlik === lage;
      f.classList.toggle('active', vald);
      f.setAttribute('aria-selected', vald ? 'true' : 'false');
      f.tabIndex = vald ? 0 : -1;
      if (vald && f.id) form.setAttribute('aria-labelledby', f.id);
    });
    namnFalt.hidden = lage !== 'register';
    if (epostkrav) epostkrav.hidden = lage !== 'register';
    // Villkor och integritet intill Skapa konto (F21) — de låg bara i sidfoten. Ingen kryssruta:
    // servern kräver ingen acceptans i API:t, så raden informerar och länkar, den grindar inte.
    if (villkor) villkor.hidden = lage !== 'register';
    if (minns) minns.hidden = lage !== 'login';
    if (minnsHjalp) minnsHjalp.hidden = lage !== 'login';
    // Glömt lösenord? hör till inloggningen, inte till ett konto som ännu inte finns (slutgranskning
    // 2026-10-20 C-023).
    const glomtKnapp = kort.querySelector('[data-login-glomt]');
    if (glomtKnapp) glomtKnapp.hidden = lage === 'register';
    // Lösenordets golv sägs INNAN det kan bli fel (F19) — bara när ett lösenord väljs.
    if (losenKrav) {
      losenKrav.hidden = lage !== 'register';
      if (lage === 'register') losenFalt.setAttribute('aria-describedby', losenKrav.id);
      else losenFalt.removeAttribute('aria-describedby');
    }
    namnFalt.querySelector('input').required = lage === 'register';
    form.querySelector('#loginPassword').autocomplete =
      lage === 'login' ? 'current-password' : 'new-password';
    knapp.querySelector('b').textContent = lage === 'login' ? 'Logga in' : 'Skapa konto';
    felrad.textContent = '';
  }
  // En flik visar alltid sitt formulär — också från glömt-steget, där formuläret annars låg dolt
  // och ett klick på fliken inte syntes alls.
  function visaFlik(namn) {
    const glomtSteg = kort.querySelector('[data-login-forgot]');
    if (glomtSteg && !glomtSteg.hidden) { glomtSteg.hidden = true; form.hidden = false }
    bytLage(namn);
  }
  flikar.forEach(f => { f.onclick = () => visaFlik(f.dataset.loginFlik) });

  // Piltangenter, Home och End — automatisk aktivering, som i WAI-ARIA:s flikmönster. Två flikar
  // och inget dyrt bakom bytet, så fokus och val följs åt.
  const flikrad = kort.querySelector('[data-login-flikrad]');
  if (flikrad) flikrad.addEventListener('keydown', e => {
    const lista = [...flikar];
    const nu = lista.indexOf(e.target);
    if (nu < 0) return;
    const nasta = { ArrowRight: nu + 1, ArrowLeft: nu - 1, Home: 0, End: lista.length - 1 }[e.key];
    if (nasta === undefined) return;
    e.preventDefault();
    const mal = lista[(nasta + lista.length) % lista.length];
    visaFlik(mal.dataset.loginFlik);
    mal.focus();
  });

  // Tvåstegsläget byter kortets formulär mot kodfältet — samma dramaturgi som gaten.
  //
  // F22 (granskningen 2026-10-17): rutan hade bara kodfält och Bekräfta. Nu finns tre vägar till:
  //   · återställningskod som EGET läge — bokstäver och bindestreck, inte sifferbordet
  //   · Avbryt och byt konto — stänger den halva sessionen med /api/auth/logout, precis som gatens
  //     "Avbryt och logga ut" i auth-client.js. Utan anropet låg en ej verifierad session kvar.
  //   · hjälp för den som förlorat både appen och koderna (supporten, från kontots adress)
  // Servern tar båda kodtyperna i samma fält ({code}), så API:t är oförändrat.
  const mfa = kort.querySelector('[data-login-mfa]');
  const mfaKod = mfa.querySelector('#loginMfaCode');
  const mfaEtikett = mfa.querySelector('[data-login-mfa-etikett]');
  const mfaText = mfa.querySelector('[data-login-mfa-text]');
  const reservKnapp = mfa.querySelector('[data-login-reserv]');
  const MFA_LAGEN = {
    app: { etikett: 'Säkerhetskod', inputmode: 'numeric', autocomplete: 'one-time-code',
      text: mfaText ? mfaText.textContent : '', knapp: 'Använd en återställningskod' },
    reserv: { etikett: 'Återställningskod', inputmode: 'text', autocomplete: 'off',
      text: 'Ange en av återställningskoderna du sparade när tvåstegsverifieringen slogs på. Varje kod fungerar en gång.',
      knapp: 'Använd koden från appen' },
  };
  function mfaLage(namn) {
    const l = MFA_LAGEN[namn];
    mfa.dataset.lage = namn;
    if (mfaEtikett) mfaEtikett.textContent = l.etikett;
    if (mfaText) mfaText.textContent = l.text;
    if (reservKnapp) reservKnapp.textContent = l.knapp;
    mfaKod.setAttribute('inputmode', l.inputmode);
    mfaKod.setAttribute('autocomplete', l.autocomplete);
    mfaKod.setAttribute('autocapitalize', namn === 'reserv' ? 'characters' : 'off');
    mfaKod.value = '';
    mfa.querySelector('#loginMfaError').textContent = '';
  }
  if (reservKnapp) reservKnapp.onclick = () => {
    mfaLage(mfa.dataset.lage === 'reserv' ? 'app' : 'reserv');
    mfaKod.focus();
  };
  const avbrytKnapp = mfa.querySelector('[data-login-mfa-avbryt]');
  if (avbrytKnapp) avbrytKnapp.onclick = async () => {
    avbrytKnapp.disabled = true;
    // Fail-open åt rätt håll: misslyckas utloggningen ska besökaren ändå komma tillbaka till
    // formuläret, och tokenen för den avbrutna sessionen ska ändå bort ur fliken.
    try { await api('/api/auth/logout', {}) } catch (_) { /* sessionen dör av sig själv */ }
    sessionStorage.removeItem('vyra-csrf');
    mfaLage('app');
    mfa.hidden = true;
    form.hidden = false;
    if (flikrad) flikrad.hidden = false;
    avbrytKnapp.disabled = false;
    knapp.disabled = false;
    losenFalt.value = '';
    bytLage('login');
    form.querySelector('#loginEmail').focus();
  };

  function mfaSteg() {
    form.hidden = true;
    // Flikarna betyder ingenting mitt i en inloggning — vägen ut är Avbryt och byt konto.
    if (flikrad) flikrad.hidden = true;
    mfaLage('app');
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
  const glomtText = glomt.querySelector('.login-mfa-text');
  const glomtTextFran = glomtText.textContent;
  kort.querySelector('[data-login-glomt]').onclick = e => {
    e.preventDefault();
    form.hidden = true;
    glomt.hidden = false;
    // Andra varvet ska se ut som det första: efter ett skickat mejl låg formuläret kvar dolt.
    glomtText.textContent = glomtTextFran;
    glomt.querySelector('form').hidden = false;
    glomt.querySelector('#loginForgotError').textContent = '';
    glomt.querySelector('#loginForgotEmail').value = form.querySelector('#loginEmail').value;
    glomt.querySelector('#loginForgotEmail').focus();
  };
  // "Tillbaka till inloggningen" betyder inloggningen — även när besökaren kom från Skapa konto
  // (F20). Tidigare visades bara formuläret igen, i det läge det råkade stå i.
  kort.querySelector('[data-login-tillbaka]').onclick = () => {
    glomt.hidden = true;
    form.hidden = false;
    bytLage('login');
    form.querySelector('#loginEmail').focus();
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
    if (lage === 'login' && minnsRuta) payload.remember = minnsRuta.checked === true;
    visaLosen(false);
    knapp.disabled = true;
    felrad.textContent = '';
    try {
      const d = await api('/api/auth/' + lage, payload);
      if (d.csrfToken) sessionStorage.setItem('vyra-csrf', d.csrfToken);
      // Tratthandelsen FORE mfaSteg() och FORE slappIn(): bada lamnar den har grenen, och slappIn
      // navigerar dessutom bort. Skickas den senare hinner sidan bytas och handelsen tappas.
      // Villkoret ar `lage === 'register'` — en inloggning ar inte en registrering.
      if (lage === 'register') window.VyraMat && window.VyraMat.handelse('registrering');
      if (d.mfaRequired) return mfaSteg();
      return slappIn(() => { location.href = 'studio.html' });
    } catch (err) {
      felrad.textContent = err.message;
      knapp.disabled = false;
    }
  };
})();
