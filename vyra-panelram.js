(function () {
  'use strict';
  // PANELRAMEN — sju sektioner för de modeller som har en post i vyra-panelregister.js.
  //
  //   1 ▶ Testa widget · 2 Innehåll · 3 Storlek och placering · 4 Text · 5 Utseende
  //   6 Animation · 7 Återställ utseende
  //
  // EN MODELL UTAN POST FÅR EXAKT DAGENS PANEL. Ramen rör då ingenting — inte en nod, inte ett
  // attribut. tests/browser/panelram-noop.browser.test.js jämför panelens DOM med och utan ramen,
  // för en modell per familj ur katalogen.
  //
  // RAMEN STÄMMER AV I EFTERHAND (spec 1.3). Dagens bind-omslag förutsätter ofta att deras element
  // finns: media.js:423 och :184 anropar querySelector(...).onchange utan vakt, och omslagen läggs på
  // i varierande ordning eftersom flera skript injiceras asynkront. Ramen byter därför aldrig ut
  // props()-utdata. Den kör EFTER bind-kedjan, synkront och en gång till i en mikrotask (samma grepp
  // som vyra-panelordning.js), och flyttar de kontroller registret pekar ut in i sina sektioner.
  //
  // ODEKLARERADE GRUPPER PARKERAS, DE RADERAS INTE. De flyttas hela in i en dold, inert behållare
  // (data-panelram-forvaring). Två skäl, båda uppmätta i koden:
  //   * ett bind() utan omritning (tests/rebind-after-late-scripts.test.js, en sen skriptladdning)
  //     kör de gamla omslagen igen mot samma panel — ett omslag utan vakt hade kastat på ett
  //     raderat element och avbrutit resten av bind-kedjan;
  //   * flera omslag bygger sin grupp bara om den saknas (".wb-group", ".runtime-controls",
  //     ".vyra-intro-group"). En raderad grupp hade byggts igen vid nästa bind, med dubbla id:n.
  // Behållaren är dold och inert, så ingen kontroll i den kan nås, och nästa render() river den.
  // Gamla testknappar i R.ersatter tas däremot bort på riktigt — de ska aldrig kunna utlösas.
  //
  // FOKUS OCH SCROLL. Ramen flyttar bara när ordningen inte redan stämmer, och mäter då kontrollen
  // man håller i före och efter flytten (vyra-panelordning.js:s metod). Kontroller som ramen bygger
  // får stabila id:n (pr-<falt>) så att vyraRenderKeepingPanel() kan ge tillbaka fokus, och
  // sektionernas öppet/stängt-läge överlever omritningen.
  //
  // Flaggläge för felsökning: localStorage['vyra-panelram'] = 'av' stänger av ramen lokalt.

  const LAGRING_OPPNA = 'vyra-panelram-oppna';
  const FLAGGA = 'vyra-panelram';
  const ALLTID_OPPNA = new Set([1, 2]);
  const STANDARD_STANGDA = new Set([7]);

  const SEKTIONER = () => (window.VyraPanelregister && window.VyraPanelregister.SEKTIONER) || {};
  const reg = () => window.VyraPanelregister;

  // ---- Lägen -----------------------------------------------------------------------------------
  function iOverlay() {
    if (typeof VYRA_OVERLAY !== 'undefined' && VYRA_OVERLAY) return true;
    try { return new URLSearchParams(location.search).has('overlay'); } catch (_) { return false; }
  }
  function avstangd() {
    try { return localStorage.getItem(FLAGGA) === 'av'; } catch (_) { return false; }
  }
  const iEditor = () => typeof view !== 'undefined' && view === 'editor' && !iOverlay();
  const vald = () => (typeof liveWidget === 'function' && typeof selected !== 'undefined') ? liveWidget(selected) : null;

  function postFor(w) {
    if (!w || avstangd()) return null;
    const r = reg();
    return r && typeof r.hitta === 'function' ? r.hitta(w) : null;
  }
  // Andra filer frågar här innan de bygger något eget (t.ex. Top Likes flikrad i en senare PR).
  function ager(w) { return !!(iEditor() && postFor(w || vald())); }

  const sant = (f, ...a) => { try { return !!f(...a); } catch (_) { return false; } };

  // ---- Öppet/stängt per sektion ----------------------------------------------------------------
  let oppnaMinne = null;
  function oppna() {
    if (oppnaMinne) return oppnaMinne;
    oppnaMinne = {};
    try { Object.assign(oppnaMinne, JSON.parse(localStorage.getItem(LAGRING_OPPNA) || '{}') || {}); } catch (_) {}
    return oppnaMinne;
  }
  function arOppen(nr) {
    if (ALLTID_OPPNA.has(nr)) return true;
    const m = oppna();
    return nr in m ? !!m[nr] : !STANDARD_STANGDA.has(nr);
  }
  function minnsOppen(nr, ja) {
    oppna()[nr] = !!ja;
    try { localStorage.setItem(LAGRING_OPPNA, JSON.stringify(oppnaMinne)); } catch (_) {}
  }

  // ---- Gemensamma block (spec 1.5) -------------------------------------------------------------
  //
  // Varje block är en lista med BEFINTLIGA kontroller. Ramen flyttar dem — den bygger dem inte —
  // så de bind-omslag som redan finns fortsätter att binda dem. Nyckeln är det namn `utan:[…]` i
  // registret använder för att utelämna en del av blocket.
  //
  // std-storlek ÄR #651:s kontroller: Bredd, Höjd och kedjelåset ur vyra-proportioner.js
  // (injicera) och Storlek-reglaget (injiceraStorlek), som skalar via VyraTransform. Ramen bygger
  // ingen egen storlekskontroll — två reglage för samma värde är exakt den dubblett
  // panel-inga-dubbletter stänger.
  const STORLEK = [
    { nyckel: 'bredd', sel: '#propWidth' },
    { nyckel: 'hojd', sel: 'label[data-aspect-source]' },
    { nyckel: 'las', sel: '[data-aspect-lock]' },
    { nyckel: 'storlek', sel: '#propScale, #followScale' },
  ];
  const ENTRE_EFFEKT = '#vyraEntrance, #gafEntrance, #wsEntrance, #lastXEntrance';
  const STD = {
    'std-storlek': STORLEK,
    'std-position': [
      { nyckel: 'x', sel: '#propX' },
      { nyckel: 'y', sel: '#propY' },
      ...STORLEK,
      { nyckel: 'rotation', sel: '#propRotation' },
      { nyckel: 'lager', sel: '#propLayer' },
    ],
    'std-text': ['vtFont', 'vtScale', 'vtShadowBlur', 'vtShadowColor', 'vtShadowX', 'vtShadowY', 'vtOutline', 'vtOutlineColor']
      .map(id => ({ nyckel: id, sel: '#' + id })),
    'std-bakgrund': ['wbHide', 'wbColor', 'wbStrength', 'wbRadius', 'wbPadding']
      .map(id => ({ nyckel: id, sel: '#' + id })),
    'std-entre': [
      { nyckel: 'effekt', sel: ENTRE_EFFEKT },
      // Varaktigheten visas bara när effekten inte är Ingen. Valet ritar om panelen vid ändring,
      // så villkoret läses om varje gång.
      { nyckel: 'varaktighet', sel: '#vyraEntranceDuration, #gafEntranceDuration, #wsEntranceDuration',
        om: (w, panel) => { const e = panel.querySelector(ENTRE_EFFEKT); return !e || e.value !== 'none'; } },
    ],
    'std-aterstall': [
      { nyckel: 'aterstall', bygg: 'aterstall' },
      { nyckel: 'mallnamn', sel: '#runtimePresetName', etikett: 'Mallnamn' },
      { nyckel: 'sparaMall', sel: '#runtimeSavePreset', text: 'Spara mall' },
      { nyckel: 'laddaMall', sel: '#runtimeLoadPreset', text: 'Ladda senaste mall' },
    ],
  };

  // Före std-storlek: se till att #651:s reglage finns. Båda anropen är idempotenta.
  function sakerstallStorlek() {
    const P = window.VyraProportioner;
    if (!P) return;
    try { if (typeof P.injiceraStorlek === 'function') P.injiceraStorlek(); } catch (_) {}
  }

  // ---- Återställ utseende (spec 1.5) -----------------------------------------------------------
  //
  // Bara vald widget och bara fälten i R.utseendeFalt. Fabriken är ren och lägger inte till något i
  // state (widget-factory.js create), så en ny widget av samma katalognyckel är facit. Innehåll,
  // position och media rörs inte. Ett fält som fabriken inte sätter alls tas bort från widgeten —
  // det är då en egen avvikelse, och utan den gäller renderarens standard.
  const klon = v => (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
  function aterstallUtseende(w, R) {
    const post = R || (reg() && reg().hitta(w));
    if (!w || !post || !Array.isArray(post.utseendeFalt) || !post.utseendeFalt.length) return false;
    let nyckel = w.createdFrom;
    if (!nyckel && typeof post.katalognyckel === 'function') { try { nyckel = post.katalognyckel(w); } catch (_) {} }
    if (!nyckel || !window.VyraWidgets || typeof window.VyraWidgets.create !== 'function') return false;
    let ny;
    try { ny = window.VyraWidgets.create(nyckel); } catch (_) { return false; }
    for (const f of post.utseendeFalt) {
      if (Object.prototype.hasOwnProperty.call(ny, f)) w[f] = klon(ny[f]);
      else delete w[f];
    }
    if (typeof save === 'function') save();
    if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel();
    else if (typeof render === 'function') render();
    return true;
  }

  // ---- Generisk bindning (spec 1.4) ------------------------------------------------------------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const idFor = k => 'pr-' + String(k.falt || k.id).replace(/[^A-Za-z0-9_-]/g, '-');

  function lasVarde(k, el) {
    if (k.typ === 'kryss') return !!el.checked;
    if (k.typ === 'tal') { const n = Number(el.value); return isFinite(n) ? n : 0; }
    return el.value;
  }
  function andra(w, k, v) {
    w[k.falt] = v;
    if (typeof save === 'function') save();
    if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel();
    else if (typeof render === 'function') render();
  }
  function knyt(w, k, el) {
    // input går till vyraLivePatch: värdet skrivs, bara siffran i <b> och widgetens nod byts.
    // Kryssrutor och val ändras bara på change — och aldrig via render() direkt.
    if (k.typ === 'text' || k.typ === 'tal' || k.typ === 'farg') {
      el.oninput = () => {
        const v = lasVarde(k, el);
        if (typeof vyraLivePatch === 'function') vyraLivePatch(w, el, k.falt, v);
        else w[k.falt] = v;
      };
    }
    el.onchange = () => andra(w, k, lasVarde(k, el));
  }

  function byggKontroll(w, k) {
    const id = idFor(k);
    const etikett = esc(k.etikett || k.falt || k.id);
    const v = w[k.falt];
    const rad = document.createElement(k.typ === 'knapp' ? 'div' : 'label');
    let html;
    if (k.typ === 'text') {
      html = `${etikett}<input id="${id}" type="text" value="${esc(v)}">`;
    } else if (k.typ === 'tal') {
      const min = k.min ?? 0, max = k.max ?? 100, steg = k.steg ?? 1;
      const tal = Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : (k.standard ?? min);
      rad.className = 'range-label';
      html = `${etikett} <b>${tal}${k.enhet ? ' ' + esc(k.enhet) : ''}</b><input id="${id}" type="range" min="${min}" max="${max}" step="${steg}" value="${tal}">`;
    } else if (k.typ === 'val') {
      const alt = (k.alternativ || []).map(a => Array.isArray(a) ? a : [a, a]);
      html = `${etikett}<select id="${id}">${alt.map(([a, t]) => `<option value="${esc(a)}"${String(v) === String(a) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    } else if (k.typ === 'kryss') {
      html = `<input id="${id}" type="checkbox"${v ? ' checked' : ''}> ${etikett}`;
    } else if (k.typ === 'farg') {
      html = `<span>${etikett}</span><input id="${id}" type="color" value="${esc(v || k.standard || '#ffffff')}">`;
    } else if (k.typ === 'knapp') {
      html = `<button type="button" id="${id}">${etikett}</button>`;
    } else if (k.typ === 'media') {
      // Mediaväljaren kommer i en egen PR (spec kapitel 3). Utan den visas ingen kontroll alls.
      const M = window.VyraMediaval;
      if (!M || typeof M.falt !== 'function') return null;
      const nod = M.falt(Object.assign({ w }, k));
      return nod || null;
    } else return null;
    rad.innerHTML = html;
    const el = rad.querySelector('#' + id);
    if (k.typ === 'knapp') el.onclick = () => { try { k.klick(w, el); } catch (e) { console.error('[VyraPanelram]', e); } };
    else knyt(w, k, el);
    return rad;
  }

  function byggLiveRad(k) {
    const rad = document.createElement('div');
    rad.className = 'pr-live-rad';
    rad.innerHTML = `<span class="pr-live">LIVE</span> <span>${esc(k.etikett || 'Namn, profilbild och värde kommer från TikTok.')}</span>`;
    return rad;
  }

  function byggAterstall(w, R) {
    if (!Array.isArray(R.utseendeFalt) || !R.utseendeFalt.length) return null;
    const knapp = document.createElement('button');
    knapp.type = 'button';
    knapp.id = 'pr-aterstall-utseende';
    knapp.textContent = 'Återställ utseende';
    knapp.onclick = () => aterstallUtseende(w, R);
    return knapp;
  }

  // ---- Etiketter på flyttade kontroller --------------------------------------------------------
  //
  // Registrets text ersätter etikettens text, och enheten läggs i <b> efter värdet — samma format
  // som vyraLivePatch förutsätter (den byter bara siffran och låter resten stå).
  function skrivEtikett(rad, etikett, enhet) {
    if (!rad || rad.tagName !== 'LABEL') return;
    if (etikett) {
      const span = rad.firstElementChild && rad.firstElementChild.tagName === 'SPAN' ? rad.firstElementChild : null;
      const textnod = [...rad.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
      // Ett <span> först (widget-background.js: <span>Färg</span>) bär etiketten; annars den första
      // textnoden, före eller efter inputen (kryssrutor har texten efter).
      if (span && (!textnod || (textnod.compareDocumentPosition(span) & 2))) {
        if (span.textContent !== etikett) span.textContent = etikett;
      } else if (textnod) {
        const fore = textnod.textContent.match(/^\s*/)[0], efter = textnod.textContent.match(/\s*$/)[0];
        const ny = fore + etikett + (efter || (rad.querySelector(':scope > b') ? ' ' : ''));
        if (textnod.textContent !== ny) textnod.textContent = ny;
      } else rad.prepend(document.createTextNode(etikett + ' '));
    }
    if (enhet) {
      const b = rad.querySelector(':scope > b');
      const tal = b && (b.textContent.match(/^[\d.,-]+/) || [''])[0];
      if (b && tal && b.textContent !== tal + ' ' + enhet) b.textContent = tal + ' ' + enhet;
    }
  }

  function tillampaBeror(rad, k, w) {
    if (!k.beror || !rad) return;
    const aktiv = sant(k.beror.villkor, w[k.beror.falt], w);
    rad.querySelectorAll('input, select, textarea, button').forEach(el => { el.disabled = !aktiv; });
    rad.classList.toggle('pr-inaktiv', !aktiv);
    if (k.beror.text && !rad.querySelector(':scope > .pr-beror')) {
      rad.insertAdjacentHTML('beforeend', `<small class="pr-beror">${esc(k.beror.text)}</small>`);
    }
  }

  // ---- Sektioner -------------------------------------------------------------------------------
  const kroppAv = panel => panel.querySelector(':scope > .properties-body') || panel;
  const sektionsBody = sek => sek.querySelector(':scope > .pg-body') || sek;
  const nyckelFor = k => k.falt ? 'falt:' + k.falt : k.id ? 'id:' + k.id : k.legacyId ? 'legacy:' + k.legacyId : '';

  function skapaSektion(nr) {
    const rubrik = SEKTIONER()[nr] || String(nr);
    const sek = document.createElement('section');
    sek.className = 'property-group pr-sektion';
    sek.dataset.sektion = String(nr);
    sek.dataset.panelramSektion = String(nr);
    if (ALLTID_OPPNA.has(nr)) {
      sek.innerHTML = `<h4>${esc(rubrik)}</h4>`;
      return sek;
    }
    // Samma hopfällbara struktur som pgSection() och vyra-panelordning.js använder, så studio.css
    // redan har sin stil för den.
    sek.classList.add('collapsible');
    sek.dataset.propertySection = rubrik;
    sek.innerHTML = `<button type="button" class="pg-toggle">${esc(rubrik)}<i class="pg-chevron">›</i></button><div class="pg-body"></div>`;
    if (arOppen(nr)) sek.classList.add('open');
    sek.querySelector('.pg-toggle').onclick = () => minnsOppen(nr, sek.classList.toggle('open'));
    return sek;
  }

  function forvaring(kropp) {
    let f = kropp.querySelector(':scope > [data-panelram-forvaring]');
    if (!f) {
      f = document.createElement('div');
      f.hidden = true;
      f.setAttribute('inert', '');
      f.dataset.panelramForvaring = '1';
      kropp.append(f);
    }
    return f;
  }

  const attr = s => String(s).replace(/["\\]/g, '\\$&');
  const iRam = el => !!(el && el.closest('[data-panelram-sektion]'));
  const iForvaring = el => !!(el && el.closest('[data-panelram-forvaring]'));
  const radAv = el => (el.tagName === 'LABEL' || el.tagName === 'BUTTON' && !el.closest('label')) ? el : (el.closest('label') || el);

  // Hittar raden för en befintlig kontroll. En ny nod utanför ramen vinner över en som redan ligger
  // i en sektion: den har byggts av ett senare bind och bär de färska händelsehanterarna.
  function hittaRad(panel, sel, nyckel) {
    let kandidater = [];
    try { kandidater = [...panel.querySelectorAll(sel)]; } catch (_) { return null; }
    const farsk = kandidater.find(el => !iRam(el) && !iForvaring(el));
    const gammal = panel.querySelector(`[data-panelram-sektion] [data-pr-kontroll="${attr(nyckel)}"]`);
    if (farsk) {
      const rad = radAv(farsk);
      if (gammal && gammal !== rad) gammal.remove();
      rad.dataset.prKontroll = nyckel;
      return rad;
    }
    if (gammal) return gammal;
    // En kontroll som ett annat skript själv lagt in i en sektion (vyra-rotation.js skarvar in
    // Rotation efter Höjd, och Höjd ligger redan i sektion 3) hör hemma där den är.
    const iSektion = kandidater.find(el => iRam(el));
    if (iSektion) { const rad = radAv(iSektion); rad.dataset.prKontroll = nyckel; return rad; }
    const parkerad = kandidater.find(iForvaring);
    if (parkerad) { const rad = radAv(parkerad); rad.dataset.prKontroll = nyckel; return rad; }
    return null;
  }

  function befintligByggd(panel, nyckel) {
    return panel.querySelector(`[data-panelram-sektion] [data-pr-kontroll="${attr(nyckel)}"]`);
  }
  // Markerar en nod som ramen själv byggt: den tas bort, inte parkeras, när den inte längre behövs.
  const byggd = (nod, nyckel) => { if (nod) { nod.dataset.prKontroll = nyckel; nod.dataset.prByggd = '1'; } return nod; };

  // Sektionsbyggare från andra filer: testmotorn (PR 2) lägger ▶ Testa widget överst i sektion 1.
  // fn(w, R) returnerar en nod eller null. Noden byggs en gång per panel och återanvänds sedan.
  const tillaggen = [];
  function tillagg(nr, fn) {
    if (!(Number.isInteger(nr) && nr >= 1 && nr <= 7) || typeof fn !== 'function') throw new Error('VyraPanelram.tillagg(nr 1–7, fn)');
    tillaggen.push({ nr, fn, nyckel: 'tillagg:' + tillaggen.length });
  }

  // Planen: vilka rader varje sektion ska ha, i ordning. Bygger saknade kontroller men flyttar
  // ingenting — flytten görs i ett svep efteråt, bara där ordningen inte redan stämmer.
  function planera(w, R, panel) {
    const plan = new Map();
    const exempel = [];
    const lagg = (nr, rad) => { if (!rad) return; if (!plan.has(nr)) plan.set(nr, []); if (!plan.get(nr).includes(rad)) plan.get(nr).push(rad); };

    for (const t of tillaggen) {
      let nod = befintligByggd(panel, t.nyckel);
      if (!nod) {
        try { nod = t.fn(w, R) || null; } catch (e) { console.error('[VyraPanelram]', e); nod = null; }
        byggd(nod, t.nyckel);
      }
      lagg(t.nr, nod);
    }

    if (R.kontroller.some(k => k.typ === 'std-storlek' || k.typ === 'std-position')) sakerstallStorlek();

    R.kontroller.forEach((k, i) => {
      if (k.om && !sant(k.om, w)) return;
      const nr = k.kalla === 'exempel' ? 1 : k.sektion;
      const mal = k.kalla === 'exempel' ? (rad => { if (rad && !exempel.includes(rad)) exempel.push(rad); }) : (rad => lagg(nr, rad));

      if (STD[k.typ]) {
        const utan = new Set(k.utan || []);
        for (const del of STD[k.typ]) {
          if (utan.has(del.nyckel)) continue;
          if (del.om && !sant(del.om, w, panel)) continue;
          const nyckel = k.typ + ':' + del.nyckel;
          let rad;
          if (del.bygg === 'aterstall') {
            rad = befintligByggd(panel, nyckel) || byggd(byggAterstall(w, R), nyckel);
          } else {
            rad = hittaRad(panel, del.sel, nyckel);
            if (rad && del.text && rad.tagName === 'BUTTON' && !rad.children.length && rad.textContent !== del.text) rad.textContent = del.text;
            if (rad && del.etikett) skrivEtikett(rad, del.etikett);
          }
          mal(rad);
        }
        return;
      }

      const nyckel = nyckelFor(k) || 'kontroll:' + i;
      let rad;
      if (k.kalla === 'live') {
        rad = befintligByggd(panel, 'live:' + i) || byggd(byggLiveRad(k), 'live:' + i);
      } else if (k.legacyId) {
        rad = hittaRad(panel, k.legacyId, nyckel);
        if (rad) skrivEtikett(rad, k.etikett, k.enhet);
      } else {
        rad = befintligByggd(panel, nyckel);
        if (!rad) rad = byggd(byggKontroll(w, k), nyckel);
      }
      tillampaBeror(rad, k, w);
      mal(rad);
    });

    if (exempel.length) {
      let grupp = befintligByggd(panel, 'exempeldata');
      if (!grupp) {
        grupp = document.createElement('div');
        grupp.className = 'pr-exempel';
        byggd(grupp, 'exempeldata');
        grupp.innerHTML = '<h5>Exempeldata för test och förhandsvisning</h5>'
          + '<small>Visas bara i editorn och i testet. I sändningen ersätts det av TikTok.</small>';
      }
      lagg(1, grupp);
      plan.set('exempel', exempel);
    }
    return plan;
  }

  const samma = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  // Lägger raderna i en behållare i rätt ordning. Rör ingenting när den redan stämmer. Det som inte
  // längre hör hemma parkeras (befintliga kontroller) eller tas bort (sådant ramen själv byggt).
  function ordna(behallare, rader, fast, kropp) {
    const nu = [...behallare.children].filter(el => !fast.includes(el));
    if (samma(nu, rader)) return false;
    for (const el of nu) if (!rader.includes(el)) {
      if (el.dataset && el.dataset.prByggd) el.remove();
      else forvaring(kropp).append(el);
    }
    for (const el of rader) behallare.append(el);
    return true;
  }

  // ---- Avstämningen ----------------------------------------------------------------------------
  function stamAv() {
    if (!iEditor()) return;
    const panel = document.querySelector('.properties');
    if (!panel) return;
    const w = vald();
    const R = postFor(w);
    if (!R) return;                                     // ingen post: dagens panel, orörd
    const kropp = kroppAv(panel);

    const fokus = panel.contains(document.activeElement) ? document.activeElement : null;
    const markering = fokus && typeof fokus.selectionStart === 'number' ? [fokus.selectionStart, fokus.selectionEnd] : null;
    const yFore = fokus && fokus.getBoundingClientRect ? fokus.getBoundingClientRect().top : null;
    let flyttat = false;

    const plan = planera(w, R, panel);

    // Sektionerna: bara de som har minst en synlig rad. En tom sektion byggs aldrig.
    const sektioner = [];
    for (let nr = 1; nr <= 7; nr++) {
      let sek = kropp.querySelector(`:scope > [data-panelram-sektion="${nr}"]`);
      const rader = plan.get(nr) || [];
      if (!rader.length) { if (sek) { ordna(sektionsBody(sek), [], [], kropp); sek.remove(); flyttat = true; } continue; }
      if (!sek) { sek = skapaSektion(nr); flyttat = true; }
      const body = sektionsBody(sek);
      const fast = body === sek ? [sek.querySelector(':scope > h4')].filter(Boolean) : [];
      if (ordna(body, rader, fast, kropp)) flyttat = true;
      sektioner.push(sek);
    }
    const exempelGrupp = panel.querySelector('[data-pr-kontroll="exempeldata"]');
    if (exempelGrupp && plan.has('exempel')) {
      const fast = [...exempelGrupp.querySelectorAll(':scope > h5, :scope > small')];
      if (ordna(exempelGrupp, plan.get('exempel'), fast, kropp)) flyttat = true;
    }

    // Gamla grupper parkeras hela; gamla testknappar tas bort.
    // Två behållare: studio.js grundpanel har .properties-body, men en del omslag lägger sin grupp
    // direkt i .properties (runtime-controls.js insertBefore mot panelen).
    const grupper = [...kropp.querySelectorAll(':scope > .property-group')];
    if (kropp !== panel) grupper.push(...panel.querySelectorAll(':scope > .property-group'));
    for (const g of grupper) {
      if (g.dataset.panelramSektion) continue;
      forvaring(kropp).append(g);
      flyttat = true;
    }
    for (const sel of R.ersatter || []) {
      let traffar = [];
      try { traffar = [...panel.querySelectorAll(sel)]; } catch (_) {}
      traffar.forEach(el => { el.remove(); flyttat = true; });
    }

    // Sektionerna i nummerordning, före svansen (Ta bort-knappen och åtgärdsraden).
    const svans = kropp.querySelector(':scope > #del, :scope > .delete, :scope > .delete-at-bottom, :scope > [data-panel-svans]');
    const nuvarande = [...kropp.querySelectorAll(':scope > [data-panelram-sektion]')];
    const iOrdning = samma(nuvarande, sektioner) && sektioner.every(s => !svans || (s.compareDocumentPosition(svans) & 4));
    if (!iOrdning) { for (const s of sektioner) kropp.insertBefore(s, svans || null); flyttat = true; }

    // Rubrik och märke.
    if (typeof R.rubrik === 'function') {
      const h3 = kropp.querySelector(':scope > h3');
      let t = null; try { t = R.rubrik(w); } catch (_) {}
      if (h3 && t != null && h3.textContent !== String(t)) h3.textContent = String(t);
    }
    if (typeof R.marke === 'function') {
      let t = null; try { t = R.marke(w); } catch (_) {}
      let m = kropp.querySelector(':scope > .template-badge');
      if (t == null || t === '') { if (m) m.remove(); }
      else {
        if (!m) { m = document.createElement('div'); m.className = 'template-badge'; const h3 = kropp.querySelector(':scope > h3'); if (h3) h3.after(m); else kropp.prepend(m); }
        if (m.textContent !== String(t)) m.textContent = String(t);
      }
    }

    if (panel.dataset.panelram !== '1') panel.dataset.panelram = '1';
    if (panel.dataset.panelramWidget !== String(w.id)) panel.dataset.panelramWidget = String(w.id);

    if (flyttat && fokus && fokus.isConnected && document.activeElement !== fokus) {
      if (yFore !== null) {
        const yEfter = fokus.getBoundingClientRect().top;
        if (yEfter !== yFore) panel.scrollTop += yEfter - yFore;
      }
      try { fokus.focus({ preventScroll: true }); } catch (_) { fokus.focus(); }
      if (markering) try { fokus.setSelectionRange(markering[0], markering[1]); } catch (_) {}
    }
  }

  // EFTER bind-kedjan: synkront, och en gång till i en mikrotask för grupper som en yttre (senare
  // laddad) bindare lägger till efter oss. Laddas före vyra-panelordning.js, så ordningens omslag
  // blir yttre och sorterar efter ramen.
  let kolagd = false;
  function schemalagg() {
    if (kolagd) return;
    kolagd = true;
    Promise.resolve().then(() => { kolagd = false; stamAv(); });
  }

  if (typeof bind === 'function') {
    const foregaende = bind;
    bind = function () {
      const ut = foregaende.apply(this, arguments);
      try { stamAv(); } catch (e) { console.error('[VyraPanelram]', e); }
      schemalagg();
      return ut;
    };
  }

  // EN FRÄMMANDE KONTROLL I EN SEKTION stäms av direkt. Några skript skarvar in sina fält med en
  // egen MutationObserver i stället för i bind (vyra-rotation.js lägger Rotation efter Höjd, och
  // Höjd ligger då redan i sektion 3). Utan det här hade fältet stått där det råkade hamna tills
  // nästa bind. Bara element som läggs DIREKT i en sektion räknas, och bara sådana ramen inte själv
  // har märkt — ramens egna flyttar bär data-pr-kontroll och väcker alltså inte observern.
  function framling(m) {
    if (m.type !== 'childList' || !m.addedNodes.length) return false;
    const t = m.target;
    if (!t || t.nodeType !== 1) return false;
    const sek = t.matches('[data-panelram-sektion]') ? t : (t.matches('.pg-body') && t.parentElement && t.parentElement.matches('[data-panelram-sektion]') ? t.parentElement : null);
    if (!sek) return false;
    return [...m.addedNodes].some(n => n.nodeType === 1 && !n.dataset.prKontroll && !n.matches('h4, .pg-toggle, .pg-body'));
  }
  if (typeof MutationObserver === 'function') {
    const rot = document.getElementById('view') || document.documentElement;
    new MutationObserver(muts => {
      if (!document.querySelector('.properties[data-panelram]')) return;
      if (muts.some(framling)) schemalagg();
    }).observe(rot, { childList: true, subtree: true });
  }

  window.VyraPanelram = { ager, stamAv, aterstallUtseende, tillagg, STD, postFor };
})();
