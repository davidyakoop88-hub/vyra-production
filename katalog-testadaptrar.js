/* katalog-testadaptrar.js — ▶ Testa widget på galleriets scen för fyra familjer som saknade test
 * (David 2026-11-11: Quiz, Hjärtan & moln, Energimätare och Viewer Showcase).
 *
 * De fyra har egna paneler och ingen post i panelregistret, så de kan inte bära `test` där. De
 * registreras därför som KATALOGADAPTRAR (VyraTestspel.registreraKatalog): galleriet i Overlay-vyn
 * hittar dem på widgettyp, medan editorn och OBS-utgången aldrig ser dem.
 *
 * VARJE ADAPTER RÖR BARA KLONEN. Familjernas egna motorer håller läget per widget-id i minnet, sparar
 * det i localStorage och ritar om med render() — allt det är förbjudet under ett test (vakterna i
 * vyra-testspel.js stoppar det). Adaptrarna här skriver i stället direkt i klonens nod, med familjens
 * egna rena funktioner (tips, wh, klippUrl) och samma klasser som den riktiga widgeten använder.
 * Där familjens wh() läser ett läge i minnet (Quiz, Energimätare) skapas läget för klonens id under
 * testet och tas bort i stoppa().
 */
(function () {
  'use strict';
  const T = window.VyraTestspel;
  if (!T || typeof T.registreraKatalog !== 'function' || window.VyraKatalogTestadaptrar) return;

  const PERSONER = ['Alex', 'Mia', 'Leo'];
  const namnI = (ex, i) => (ex && Array.isArray(ex.personer) && ex.personer[i] && ex.personer[i].namn) || PERSONER[i % PERSONER.length];
  // Klonens innehåll ritas om med familjens egen wh(): rotens klasser och innehåll byts, placeringen
  // (som galleriet satt på noden) står kvar.
  function ritaOmKlon(nod, k) {
    const mall = document.createElement('div');
    mall.innerHTML = typeof wh === 'function' ? wh(k) : '';     // eslint-disable-line no-undef
    const ny = mall.firstElementChild;
    if (!ny) return;
    nod.className = ny.className;
    nod.innerHTML = ny.innerHTML;
    nod.querySelectorAll(':scope > .resize-handle').forEach(h => h.remove());
  }

  // ---- ENERGIMÄTAREN: fylls steg för steg till full, och töms sedan en bit --------------------------
  const ENERGI_STEG = [[0, 20], [700, 35], [1400, 55], [2100, 70], [2800, 90], [3500, 100], [5200, 85], [5900, 70]];
  function malaEnergi(nod, k, niva) {
    const E = window.VyraEnergimatare;
    nod.style.setProperty('--niva', niva + '%');
    nod.classList.toggle('em-tom', niva <= 0);
    const v = nod.querySelector('.em-varde'); if (v) v.textContent = niva + '%';
    const s = nod.querySelector('.em-spar'); if (s) s.setAttribute('aria-valuenow', String(niva));
    const t = nod.querySelector('.em-tips'); if (t && E && typeof E.tips === 'function') t.textContent = E.tips(k, niva);
  }
  const glomEnergi = k => { const E = window.VyraEnergimatare; if (E && E._lage) E._lage.delete(String(k.id)); };
  T.registrera('energi', {
    spela(nod, k, ex, ctl) {
      if (!nod.querySelector('.em-fyll')) throw new Error('energimatare.js ritade ingen mätare');
      ENERGI_STEG.forEach(([ms, niva]) => { if (ms === 0) malaEnergi(nod, k, niva); else ctl.setTimeout(() => malaEnergi(nod, k, niva), ms); });
      return { entre: 300, visning: 6000, utgang: 300 };
    },
    stoppa(nod, k) { glomEnergi(k); },
  });

  // ---- QUIZ: en fråga, tre svar som kommer in, rättning med ledare ----------------------------------
  //
  // Quizets tidslinje räknas ur omgångens start och klockan. Testet lägger starten så att frågan har
  // fyra sekunder kvar, låter tre tittare svara och visar sedan rättningen. Läget finns bara för
  // klonens id och bara i minnet.
  const QUIZ_FRAGA_MS = 4000, QUIZ_RATT_MS = 2800;
  const quizLage = k => { const Q = window.VyraQuiz; return Q && typeof Q.lage === 'function' ? Q.lage(k) : null; };
  const glomQuiz = k => { const Q = window.VyraQuiz; if (Q && Q._lage) Q._lage.delete(String(k.id)); };
  T.registrera('quiz', {
    spela(nod, k, ex, ctl) {
      const Q = window.VyraQuiz;
      if (!Q || typeof Q.alternativ !== 'function' || typeof Q.fragor !== 'function') throw new Error('quiz.js saknas');
      const lista = Q.fragor(k);
      if (!lista.length) throw new Error('quizet har inga frågor att visa');
      k.qzTid = 10; k.qzPaus = 3;                             // kortaste tillåtna tider, bara på klonen
      const s = quizLage(k);
      s.start = Date.now() - (10000 - QUIZ_FRAGA_MS); s.svar = { 0: {} }; s.namn = {};
      const ratt = Q.alternativ(lista[0], s.start).findIndex(a => a.ratt), fel = (ratt + 1) % 3;
      const svara = (i, val) => { const uid = 'prov' + i; s.svar[0][uid] = val; s.namn[uid] = namnI(ex, i); ritaOmKlon(nod, k); };
      ritaOmKlon(nod, k);
      ctl.setTimeout(() => svara(0, ratt), 900);
      ctl.setTimeout(() => svara(1, fel), 1700);
      ctl.setTimeout(() => svara(2, ratt), 2500);
      // Sekundklockan och övergången till rättningen: samma wh() som den riktiga widgeten ritas med.
      ctl.setInterval(() => ritaOmKlon(nod, k), 500);
      return { entre: 300, visning: QUIZ_FRAGA_MS + QUIZ_RATT_MS - 600, utgang: 300 };
    },
    stoppa(nod, k) { glomQuiz(k); },
  });

  // ---- VIEWER SHOWCASE: ett firande med exempelnamnet -----------------------------------------------
  //
  // Firandet är ren CSS på klassen vs-spelar, med längden i --vs-dur. Klonen är redan ritad med
  // exempelprofilen; testet sätter namnet och startar animationen.
  T.registrera('showcase', {
    spela(nod, k, ex) {
      const V = window.VyraViewerShowcase;
      const namn = nod.querySelector('.vs-namn');
      if (!namn) throw new Error('viewer-showcase.js ritade inget kort');
      const text = namnI(ex, 0);
      namn.textContent = text; namn.title = text;
      if (V && typeof V.namnKlass === 'function') namn.className = 'vs-namn ' + V.namnKlass(text);
      const sek = Math.min(15, Math.max(6, Number(k.vsSek) || 8));
      nod.style.setProperty('--vs-dur', sek + 's');
      nod.style.setProperty('--vs-off', '0s');
      nod.classList.remove('vs-stilla');
      void nod.offsetWidth;                                   // animationen börjar om från början
      nod.classList.add('vs-spelar');
      return { entre: 1300, visning: sek * 1000 - 2600, utgang: 1300 };
    },
    stoppa(nod) { nod.classList.remove('vs-spelar'); },
  });

  // ---- HJÄRTAN & MOLN: det transparenta klippet spelas i klonens låda -------------------------------
  //
  // Den riktiga widgeten har EN videonod per widget-id i minnet, som flyttas in av render(). Klonen
  // finns inte i state och får därför en egen videonod, med samma klipp, hastighet och klasser.
  const MOLN_MS = 6000;
  function stadaMoln(nod) {
    nod.classList.remove('hm-pa');
    const v = nod.__provVideo;
    if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (_) {} v.remove(); nod.__provVideo = null; }
  }
  T.registrera('hjartmoln', {
    spela(nod, k) {
      const H = window.VyraHjartMoln, vard = nod.querySelector('.hm-vard');
      if (!H || typeof H.klippUrl !== 'function' || !vard) throw new Error('hjartmoln.js saknas');
      const v = document.createElement('video');
      v.className = 'hm-video'; v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
      v.disablePictureInPicture = true; v.preload = 'auto';
      v.src = H.klippUrl(k);
      try { v.playbackRate = Math.min(2, Math.max(0.5, Number(k.hmHastighet) || 1)); } catch (_) {}
      vard.replaceChildren(v);
      nod.__provVideo = v;
      nod.classList.add('hm-pa');
      const start = v.play();
      if (start && typeof start.catch === 'function') start.catch(() => {});   // affischen står kvar om klippet inte kan spelas
      return { entre: 500, visning: MOLN_MS - 1300, utgang: 800 };
    },
    stoppa(nod) { stadaMoln(nod); },
  });

  const TYPER = { templateEnergyBar: 'energi', templateQuiz: 'quiz', templateViewerShowcase: 'showcase', templateHeartCloud: 'hjartmoln' };
  Object.keys(TYPER).forEach(typ => T.registreraKatalog(typ, TYPER[typ]));

  window.VyraKatalogTestadaptrar = Object.freeze({ TYPER, ENERGI_STEG });
})();
