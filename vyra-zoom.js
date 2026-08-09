(function () {
  'use strict';
  // Zoom i editorn (Etapp 5). Anpassa + fyra steg, och en vykontroll nere till hoger.
  //
  // VARFOR ANPASSA INTE AR EN BEKVAMLIGHET: Fas B matte att duken klipps redan i dag. .workarea
  // ar 752px hog vid 1440x900 och 572px vid 1280x720, mot en kanvas pa 768px — vid den mindre
  // storleken ligger en fjardedel utanfor bild. Anpassa lagar ett fel som finns nu.
  //
  // SKALAN SATTS INLINE, ALLTID. getEditorCanvasScale() (studio.js:4) laser den, och en skala satt
  // i ett stilark gar varken att andra per anvandare eller att lita pa (den kan overskuggas av
  // !important-regler som JavaScript inte ser). tests/fixtures/inline-transform-vakt.js vaktar det.
  //
  // ORIGO AR OVRE VANSTRA HORNET. Med centrum — webblasarens default, och det editorn har utan
  // zoom — vandrar innehallet under zoomningen, och dragmatten hade behovt kompensera for en
  // forskjutning som inte syns i skalan.
  //
  // ZOOM AR EN VYINSTALLNING, INTE LAYOUTDATA. Den gar aldrig genom save(): en zoomniva i
  // sessionen hade blivit ett angra-steg i vyra-historik.js, och undo hade bytt zoom i stallet
  // for att flytta tillbaka en widget. sessionStorage, inte localStorage — nasta gang editorn
  // oppnas ska den bara 100 %, annars kan en anvandare lamna 50 % bakom sig och tro att appen
  // ar trasig.
  //
  // Monteringen sker via MutationObserver pa #view, samma skal som vyra-historik.js och
  // vyra-proportioner.js: layout-safe.js ager editor-vyn och returnerar utan render-kedjan.

  const NYCKEL = 'vyra-editor-zoom';
  const STEG = [0.5, 0.75, 1, 1.5];
  const MIN = STEG[0], MAX = STEG[STEG.length - 1];

  function las() {
    try { const v = parseFloat(sessionStorage.getItem(NYCKEL)); return v > 0 ? v : null }
    catch (_) { return null }
  }
  function spara(v) { try { sessionStorage.setItem(NYCKEL, String(v)) } catch (_) {} }

  let niva = las() || 1;

  const kanvas = () => document.querySelector('.canvas');
  const yta = () => document.querySelector('.workarea');
  const iEditorn = () => typeof view !== 'undefined' && view === 'editor' &&
    !document.documentElement.classList.contains('overlay-output');

  const klamp = v => Math.min(MAX, Math.max(MIN, v));

  // Passform ur den FAKTISKA duken, inte ur 432x768: layout-format.js kan byta format, och en
  // hardkodad siffra hade tyst gett fel passform for varje annat format.
  // offsetWidth/-Height ar layoutstorlek och paverkas inte av transformen vi sjalva satt.
  function berakna() {
    const c = kanvas(), w = yta();
    if (!c || !w || !c.offsetWidth || !c.offsetHeight) return 1;
    const cs = getComputedStyle(w);
    const bredd = w.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const hojd = w.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const s = Math.min(bredd / c.offsetWidth, hojd / c.offsetHeight);
    // Nedat till narmaste hundradel: en avrundning uppat hade lagt tillbaka de pixlar vi just
    // raknat bort och latit duken klippas med ett har.
    return klamp(Math.floor(s * 100) / 100);
  }

  // Stegen styr [−] och [+]. Anpassa hamnar ofta MELLAN tva steg (0.97 vid 1440x900), och da ska
  // nasta klick ga till narmaste steg i den riktning man tryckte — inte hoppa forbi.
  function grannsteg(riktning) {
    if (riktning < 0) {
      const under = STEG.filter(s => s < niva - 0.001);
      return under.length ? under[under.length - 1] : STEG[0];
    }
    const over = STEG.filter(s => s > niva + 0.001);
    return over.length ? over[0] : STEG[STEG.length - 1];
  }

  function satt(v) {
    niva = klamp(v);
    spara(niva);
    applicera();
  }

  function applicera() {
    const c = kanvas();
    if (!c || !iEditorn()) return;
    const transform = `scale(${niva})`;
    // '0px 0px', inte 'top left': webblasaren normaliserar sokordsformen till 'left top' vid
    // uttlasning, sa en jamforelse mot 'top left' hade alltid varit sann och skrivit om varje svep.
    if (c.style.transformOrigin !== '0px 0px') c.style.transformOrigin = '0px 0px';
    if (c.style.transform !== transform) c.style.transform = transform;
    const etikett = document.querySelector('[data-zoom-niva]');
    const text = Math.round(niva * 100) + '%';
    // Bara vid skillnad: en ovillkorlig skrivning hade triggat observern och loopat.
    if (etikett && etikett.textContent !== text) etikett.textContent = text;
  }

  const KNAPPAR = [
    ['ut', '−', 'Zooma ut'],
    ['in', '+', 'Zooma in'],
    ['anpassa', 'Anpassa', 'Anpassa duken till fonstret'],
  ];

  function montera() {
    if (!iEditorn()) return false;
    const w = yta();
    if (!w || w.querySelector('[data-vy-kontroll]')) return false;
    const box = document.createElement('div');
    box.className = 'vy-kontroll';
    box.setAttribute('data-vy-kontroll', '');
    box.innerHTML =
      `<button type="button" data-zoom="ut" title="${KNAPPAR[0][2]}">${KNAPPAR[0][1]}</button>` +
      '<span data-zoom-niva>100%</span>' +
      `<button type="button" data-zoom="in" title="${KNAPPAR[1][2]}">${KNAPPAR[1][1]}</button>` +
      `<button type="button" data-zoom="anpassa" title="${KNAPPAR[2][2]}">${KNAPPAR[2][1]}</button>` +
      // Snappvaxeln byggs i nasta PR. Platsen ar reserverad men TOM — en knapp som inte gor
      // nagot ar precis den sortens UI-logn Etapp 4 stangde.
      '<span data-snapp-plats hidden></span>';
    box.querySelector('[data-zoom="ut"]').onclick = () => satt(grannsteg(-1));
    box.querySelector('[data-zoom="in"]').onclick = () => satt(grannsteg(1));
    box.querySelector('[data-zoom="anpassa"]').onclick = () => satt(berakna());
    w.append(box);
    return true;
  }

  function svep() {
    montera();
    applicera();
  }

  const vyRot = document.getElementById('view');
  if (vyRot) new MutationObserver(svep).observe(vyRot, { childList: true, subtree: true });
  window.addEventListener('resize', applicera);

  window.VyraZoom = { STEG, niva: () => niva, satt, berakna, grannsteg };
})();
