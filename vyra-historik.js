(function () {
  'use strict';
  // Angra/gor om for Layout-editorn (Etapp 5). Kontraktet:
  //
  //   - INGEN ny skrivvag: all aterstallning gar genom save() -> writeActive().
  //     session-write-monopoly-provet star orort. Historiken ar en MINNESstack av
  //     layoutsnapshots, aldrig en localStorage-konsument.
  //   - Diff fore push: bara layoutprojektionen (state.widgets + layoutFormat) jamfors.
  //     Ett save() for visningsnamn eller andra icke-layoutfalt skapar ingen post.
  //     Projektionen ar EN definition (proj nedan) — inte tva sanningar.
  //   - Kontobyteslackan: vyra-session-ended tommer BADA stackarna SYNKRONT som forsta
  //     atgard i lyssnaren — ingenting hinner lasa en gammal stack. Samma felklass som
  //     tech-debt paragraf 5, darfor samma kompromisslosa ordning.
  //   - Ctrl+Z kapas INTE fran INPUT/TEXTAREA/SELECT eller contenteditable — falten
  //     behaller sin inbyggda text-undo. contenteditable ar den klassiska missen.
  //   - Taket ar 50 poster, FIFO: aldsta droppas, stacken rensas aldrig av att bli full.
  //   - Knapparnas disabled foljer stackarnas VERKLIGA langd via uppdateraKnappar() vid
  //     varje push/pop/toming/render — inget cachat varde.
  //
  // Baslinjen synkas vid varje render: repo-idiomet ar save();render(), sa notera() i save
  // ser alltid laget FORE mutationen (fran forra renderns synk). En vag som muterar och
  // renderar utan save tappar sin historikpost — fail-safe at ratt hall, aldrig korrupt.

  var TAK = 50;
  var angraStack = [];
  var gorOmStack = [];
  var senast = null;

  function proj() {
    try {
      if (typeof state === 'undefined' || !state || !Array.isArray(state.widgets)) return null;
      return JSON.stringify({ widgets: state.widgets, layoutFormat: state.layoutFormat });
    } catch (_) { return null; }
  }

  function applicera(snap) {
    var data = JSON.parse(snap);
    state.widgets = data.widgets;
    if (data.layoutFormat !== undefined) state.layoutFormat = data.layoutFormat;
    else delete state.layoutFormat;
  }

  function uppdateraKnappar() {
    var a = document.querySelector('.editor-toolbar [data-angra]');
    var g = document.querySelector('.editor-toolbar [data-gor-om]');
    if (a) a.disabled = angraStack.length === 0;
    if (g) g.disabled = gorOmStack.length === 0;
  }

  function notera() {
    var nu = proj();
    if (nu === null) return;
    if (senast === null) { senast = nu; return; }
    if (nu === senast) return;
    angraStack.push(senast);
    if (angraStack.length > TAK) angraStack.shift();
    gorOmStack.length = 0;
    senast = nu;
    uppdateraKnappar();
  }

  async function aterstall(fran, till) {
    if (!fran.length || typeof save !== 'function') return;
    var mal = fran.pop();
    var nu = proj();
    if (nu !== null) till.push(nu);
    // senast satts till malet FORE save: notera() diffar mot senast och skapar darfor
    // ingen ny post av sjalva aterstallningen.
    senast = mal;
    applicera(mal);
    await save();
    render();
    uppdateraKnappar();
  }

  function angra() { return aterstall(angraStack, gorOmStack); }
  function gorOm() { return aterstall(gorOmStack, angraStack); }

  window.addEventListener('vyra-session-ended', function () {
    angraStack.length = 0;
    gorOmStack.length = 0;
    senast = null;
    uppdateraKnappar();
  });

  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    if (typeof view !== 'undefined' && view !== 'editor') return;
    var k = (e.key || '').toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); angra(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); gorOm(); }
  });

  function montera() {
    var toolbar = document.querySelector('.editor-shell .editor-toolbar');
    if (toolbar && !toolbar.querySelector('[data-angra]')) {
      var grupp = document.createElement('div');
      grupp.className = 'historik-knappar';
      grupp.innerHTML =
        '<button type="button" data-angra title="Ångra (Ctrl+Z)" disabled>↺ Ångra</button>' +
        '<button type="button" data-gor-om title="Gör om (Ctrl+Y)" disabled>↻ Gör om</button>';
      var status = toolbar.querySelector('.layout-format-status');
      if (status) status.after(grupp); else toolbar.prepend(grupp);
      grupp.querySelector('[data-angra]').onclick = function () { angra(); };
      grupp.querySelector('[data-gor-om]').onclick = function () { gorOm(); };
    }
    uppdateraKnappar();
  }

  // INTE en render-wrap: layout-safe.js ager editor-vyn pa studio.html och dess render
  // returnerar utan att anropa kedjan nar view==='editor' — en wrap har nedstroms nas aldrig
  // dar. Samma skal som layout-format.js anger for sitt val: MutationObserver pa #view
  // traffar varje omritning oavsett vem som ritade. Ordningen haller anda: save() kor
  // notera() synkront FORE renderingen, observern synkar baslinjen EFTER.
  function synka() {
    var nu = proj();
    if (nu !== null) senast = nu;
    montera();
  }
  var vyRot = document.getElementById('view');
  if (vyRot) new MutationObserver(synka).observe(vyRot, { childList: true, subtree: true });
  synka();

  window.VyraHistorik = { length: function () { return angraStack.length; }, angra: angra, gorOm: gorOm, notera: notera };
})();
