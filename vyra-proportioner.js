(function () {
  'use strict';
  // H-falt + proportionslas (Etapp 5). Injiceras i ALLA paneler fran ETT stalle.
  //
  // Fas A matte varfor: POSITION & STORLEK-blocket ar duplicerat pa fem stallen
  // (premium-final.js:42, last-x-alerts.js x2, standalone-widgets.js, custom-widgets.js) medan
  // bindningen ar en enda (media.js:81). Att lagga H i alla fem hade skapat fem sanningar.
  //
  // FORSTA FORSOKET wrappade props() och skarvade in H i HTML-strangen. Det foll for tva av fyra
  // klasser, och matningen visade varfor: custom-widgets.js, premium-final.js, standalone-widgets.js
  // och last-x-alerts.js laddas DYNAMISKT (media.js:779/828/849 + bundlen pa 768), alltsa efter
  // varje statiskt skript. Deras props-wrappar hamnar darfor alltid utanpa min, och de returnerar
  // sin egen HTML utan att na inat. Ett statiskt skript kan aldrig bli ytterst i den kedjan.
  //
  // Losningen ar att sluta rora strangen och i stallet skarva in i den RENDERADE panelen. DOM:en
  // ar densamma oavsett vilken av de nio panelbyggarna som skrev den, och observern fangar aven
  // de paneler som ritas om asynkront efter att bind-kedjan redan kort.
  //
  // Fyra klasser, uppmatta i Fas A:
  //   css     .vyra-topgift m.fl. — 17 aspect-ratio-regler i studio.css ager hojden
  //   frame   giftFrame/streakFrame/mvpFrame — --fa ur 53 ramar ager hojden
  //   media   bild/video — LAST som default
  //   content allt annat — OLAST som default, hojden vaxer med innehallet
  //
  // De tva forsta far skrivskyddat H med forklaring och INGET kedjelas: dar finns ingenting att
  // toggla, och en knapp utan verkan ar samma UI-logn som Etapp 4 stangde.
  //
  // aspectRatio lases ur den RENDERADE noden, aldrig ur mediaMeta — den bar bara {name,id}
  // (uppmatt 2026-08-09). DOM ar sanningen; state kan sakna det man hoppas pa.

  const AR_KEY = 'aspectRatio';

  function nod(id) { return document.querySelector(`.canvas [data-id="${id}"]`) }

  // Hojden ags av CSS nar elementet — eller dess forsta barn, dar de flesta reglerna sitter —
  // har en aspect-ratio. Matt i stallet for listat: de 17 reglerna far vaxa utan att den har
  // filen behover uppdateras.
  function cssAgerHojden(el) {
    if (!el) return false;
    for (const kandidat of [el, el.firstElementChild]) {
      if (!kandidat) continue;
      const ar = getComputedStyle(kandidat).aspectRatio;
      if (ar && ar !== 'auto') return true;
    }
    return false;
  }

  function kalla(w) {
    if (!w) return 'content';
    if (w.giftFrame || w.streakFrame || w.mvpFrame) return 'frame';
    if (w.type === 'templateCustomImage' || w.type === 'templateCustomVideo') return 'media';
    if (w.type === 'templateTopGift' || cssAgerHojden(nod(w.id))) return 'css';
    return 'content';
  }
  const lasbar = k => k === 'media' || k === 'content';

  // Matt ur den renderade noden. Bilder/videor rapporterar sin naturliga form nar de laddat;
  // annars duger elementets faktiska ruta — den ar det anvandaren ser.
  function mattUrNod(w) {
    const el = nod(w.id);
    if (!el) return null;
    const media = el.querySelector('img, video');
    if (media) {
      const nw = media.naturalWidth || media.videoWidth, nh = media.naturalHeight || media.videoHeight;
      if (nw > 0 && nh > 0) return { w: nw, h: nh };
    }
    // Rotationsvakt (2026-08-18): for en roterad widget ar bbox STORRE an elementet, sa
    // fangad aspectRatio och visad Hojd blir fel ur getBoundingClientRect. offsetmatten ar
    // orroterade och ratta — bbox behalls bara som sista utvag for orroterade element.
    const roterad = typeof w.rotation === 'number' && isFinite(w.rotation) && Math.abs(w.rotation) >= 0.01;
    if (roterad || (el.offsetWidth > 0 && el.offsetHeight > 0)) {
      return el.offsetWidth > 0 && el.offsetHeight > 0 ? { w: el.offsetWidth, h: el.offsetHeight } : null;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { w: r.width, h: r.height } : null;
  }

  function fangaRatio(w) {
    const m = mattUrNod(w);
    if (!m) return null;
    w[AR_KEY] = m.w / m.h;
    if (!w.height) w.height = Math.round((w.width || m.w) / w[AR_KEY]);
    return w[AR_KEY];
  }

  // Defaultlaget normaliseras en gang per widget, samma monster som studio.js:55 (state.flows??=).
  function normalisera(w) {
    const k = kalla(w);
    if (w.aspectLocked === undefined) w.aspectLocked = k === 'media';
    return k;
  }

  const HOJD_TITEL = {
    css: 'Höjden styrs av widgetens format',
    frame: 'Höjden styrs av den valda ramen',
  };

  // Ett tomt H-falt sager "ingen hojd", vilket ar falskt — widgeten HAR en hojd pa duken, den ar
  // bara inte satt for hand. Faltet visar darfor den uppmatta hojden nar state saknar en, utan att
  // skriva den till state: en siffra i rutan far inte betyda att anvandaren last hojden.
  function visaHojd(w) {
    if (w.height) return w.height;
    const m = mattUrNod(w);
    return m ? Math.round((w.width || m.w) / (m.w / m.h)) : '';
  }

  // Kedjelaset sitter MELLAN W och H, dar det beskriver forhallandet mellan dem — inte efter H,
  // dar det hade lasts som en egenskap hos hojden.
  function markup(w, k) {
    const last = w.aspectLocked === true;
    const h = visaHojd(w);
    const hFalt = lasbar(k)
      ? `<input id="propHeight" type="number" min="40" max="1600" value="${h}">`
      : `<input id="propHeight" type="number" value="${h}" disabled title="${HOJD_TITEL[k]}">`;
    const las = lasbar(k)
      ? `<button type="button" data-aspect-lock class="aspect-lock${last ? ' last' : ''}" ` +
        `aria-pressed="${last}" title="${last ? 'Lås upp proportioner' : 'Lås proportioner'}">` +
        `<i>${last ? '🔗' : '🔓'}</i>${last ? 'Proportioner låsta' : 'Lås proportioner'}</button>`
      : '';
    return las + `<label data-aspect-source="${k}">Höjd${hFalt}</label>`;
  }

  // Skarvar in H + kedjelas direkt efter Bredd-etiketten i den renderade panelen.
  // Returnerar widgeten nar nagot injicerades, annars null.
  function injicera() {
    if (typeof liveWidget !== 'function' || typeof view === 'undefined' || view !== 'editor') return null;
    const wFalt = document.querySelector('#propWidth');
    if (!wFalt) return null;
    const w = liveWidget(selected);
    if (!w) return null;
    const etikett = wFalt.closest('label') || wFalt.parentElement;
    if (!etikett) return null;
    const k = normalisera(w);
    const redan = document.querySelector('label[data-aspect-source]');
    // Ratt falt i ratt lage redan — ror inget, annars tappar ett falt under redigering fokus.
    if (redan && redan.dataset.aspectSource === k &&
        redan.dataset.last === String(w.aspectLocked === true)) return null;
    if (redan) redan.remove();
    const gammalKnapp = document.querySelector('[data-aspect-lock]');
    if (gammalKnapp) gammalKnapp.remove();
    etikett.insertAdjacentHTML('afterend', markup(w, k));
    const ny = document.querySelector('label[data-aspect-source]');
    if (ny) ny.dataset.last = String(w.aspectLocked === true);
    return w;
  }

  // Skriver BADA nycklarna. vyraLivePatch (media.js:143) uppdaterar bara den etikett den fick,
  // sa en tvanyckelsandring maste rita om panelen i stallet for att lita pa live-patchen.
  function rita() {
    if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel();
    else render();
  }
  function satt(w, bredd, hojd) {
    w.width = Math.round(bredd);
    w.height = Math.round(hojd);
    save();
    rita();
  }

  function bindFalten() {
    if (typeof liveWidget !== 'function') return;
    const w = liveWidget(selected);
    if (!w) return;
    const k = kalla(w);
    const hFalt = document.querySelector('#propHeight');
    const wFalt = document.querySelector('#propWidth');
    const knapp = document.querySelector('[data-aspect-lock]');

    if (hFalt && !hFalt.disabled) {
      hFalt.onchange = e => {
        const ny = +e.target.value;
        if (!(ny > 0)) return;
        if (w.aspectLocked && w[AR_KEY] > 0) satt(w, ny * w[AR_KEY], ny);
        else { w.height = ny; save(); rita() }
      };
    }
    // Bredden ags av media.js:81 nar laset ar av. Med laset pa maste den skriva bada, sa
    // hanteraren ersatts — och satts tillbaka implicit vid nasta bind nar laset slas av.
    if (wFalt && w.aspectLocked) {
      wFalt.onchange = e => {
        const ny = +e.target.value;
        if (!(ny > 0)) return;
        if (w[AR_KEY] > 0) satt(w, ny, ny / w[AR_KEY]); else { w.width = ny; save(); rita() }
      };
    }
    if (knapp) {
      knapp.onclick = () => {
        if (!w.aspectLocked) fangaRatio(w);
        w.aspectLocked = !w.aspectLocked;
        save();
        rita();
      };
    }
    if (k === 'media' && w.aspectLocked && !(w[AR_KEY] > 0)) fangaRatio(w);
  }

  if (typeof bind === 'function') {
    const inreBind = bind;
    bind = function () {
      inreBind.apply(this, arguments);
      if (typeof view !== 'undefined' && view !== 'editor') return;
      injicera();
      bindFalten();
    };
  }

  // Byter anvandaren fil ska laset folja den NYA formen — annars stracks eller beskars bilden
  // tyst. Ratio tas om ur den renderade noden.
  window.addEventListener('vyra-media-bytt', e => {
    const id = e.detail && e.detail.id;
    const w = (typeof state !== 'undefined' && state.widgets || []).find(x => x && x.id === id);
    if (w && w.aspectLocked) { fangaRatio(w); save() }
  });

  // Hojden maste ge verkan pa duken, annars vore faltet en siffra utan innebord — precis den
  // sortens UI-logn arbetet stangt fyra ganger om. Observern bar bade den appliceringen och
  // injektionen, av samma skal som vyra-historik.js: render-wrappar nar inte editor-vyn
  // (se studio.js), och panelen ritas om av flera asynkrona byggare.
  function applicera() {
    if (typeof state === 'undefined' || !Array.isArray(state.widgets)) return;
    state.widgets.forEach(w => {
      if (!w || !w.height) return;
      const el = nod(w.id);
      if (el && el.style.height !== w.height + 'px') el.style.height = w.height + 'px';
    });
  }
  function svep() {
    applicera();
    if (injicera()) bindFalten();
  }
  const vyRot = document.getElementById('view');
  if (vyRot) new MutationObserver(svep).observe(vyRot, { childList: true, subtree: true });

  window.VyraProportioner = { kalla, lasbar, fangaRatio, injicera };
})();
