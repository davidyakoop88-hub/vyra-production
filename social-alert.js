// social-alert.js — SOCIAL-ALERT: en alert som växlar automatiskt mellan streamerns sociala konton
// (Davids playground "social-alert", överlämnad 2026-10-25). En egen widgettyp, templateSocialAlert,
// med playgroundens två designer:
//   glans   1 · Glanskort (original) — kompakt glanskort 260 x 60 med glanssvep och ljus kant
//   kapsel  2 · Ikon som öppnas — rund ikon som öppnas till en kapsel på 1,6 s, texten tonas in
//
// INSTÄLLNINGARNA BOR I WIDGETEN. Konton, design, visningstid och växling är widgetens fält i state,
// och följer med molnsynken till OBS-länken i en annan webbläsare (cloud-sync.js → SSE-signal →
// overlay-config-sync.js). Playgroundens localStorage når aldrig OBS; det här gör det.
//
// SAMMA KONTO PÅ BÅDA SKÄRMARNA. Växlingen räknas ur ett absolut ankare, inte en timer per flik:
//   saStart  epoch-ms då nuvarande växling började (datorns klocka, som Boxgame-klockan)
//   saIndex  kontot (bland de aktiva) som visades vid saStart, eller som står still vid paus
// Kontot just nu = (saIndex + antal hela visningstider sedan saStart) mod antal aktiva. Studion och OBS
// räknar fram samma konto och samma läge i förloppsstapeln, även efter en omladdning.
(function () {
  'use strict';
  if (typeof wh !== 'function' || window.VyraSocialAlert) return;

  const TYP = 'templateSocialAlert';
  const OVERLAY = new URLSearchParams(location.search).has('overlay');
  const UTFART_MS = 360;                                    // designens social-exit/capsule-close
  const SEKUNDER = [3, 5, 8, 10, 15, 20, 30];
  const nu = () => Date.now();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const klamp = (v, min, max, f) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : f; };

  // Plattformarna, ordagrant ur playgrounden: färg och rubrik. Ikonerna är Phosphor-ikonernas "fill"
  // (MIT, @phosphor-icons/react 2.1.10 — samma som playgrounden), här som inbyggda SVG-banor.
  const IKON = Object.freeze({
    "Instagram": "M176,24H80A56.06,56.06,0,0,0,24,80v96a56.06,56.06,0,0,0,56,56h96a56.06,56.06,0,0,0,56-56V80A56.06,56.06,0,0,0,176,24ZM128,176a48,48,0,1,1,48-48A48.05,48.05,0,0,1,128,176Zm60-96a12,12,0,1,1,12-12A12,12,0,0,1,188,80Zm-28,48a32,32,0,1,1-32-32A32,32,0,0,1,160,128Z",
    "TikTok": "M232,80v40a8,8,0,0,1-8,8,103.25,103.25,0,0,1-48-11.71V156a76,76,0,0,1-152,0c0-36.9,26.91-69.52,62.6-75.88A8,8,0,0,1,96,88v42.69a8,8,0,0,1-4.57,7.23A20,20,0,1,0,120,156V24a8,8,0,0,1,8-8h40a8,8,0,0,1,8,8,48.05,48.05,0,0,0,48,48A8,8,0,0,1,232,80Z",
    "YouTube": "M234.33,69.52a24,24,0,0,0-14.49-16.4C185.56,39.88,131,40,128,40s-57.56-.12-91.84,13.12a24,24,0,0,0-14.49,16.4C19.08,79.5,16,97.74,16,128s3.08,48.5,5.67,58.48a24,24,0,0,0,14.49,16.41C69,215.56,120.4,216,127.34,216h1.32c6.94,0,58.37-.44,91.18-13.11a24,24,0,0,0,14.49-16.41c2.59-10,5.67-28.22,5.67-58.48S236.92,79.5,234.33,69.52Zm-73.74,65-40,28A8,8,0,0,1,108,156V100a8,8,0,0,1,12.59-6.55l40,28a8,8,0,0,1,0,13.1Z",
    "Twitch": "M208,32H48A16,16,0,0,0,32,48V192a16,16,0,0,0,16,16H64v32a8,8,0,0,0,13.12,6.15L122.9,208h42.2a16,16,0,0,0,10.25-3.71l42.89-35.75A15.93,15.93,0,0,0,224,156.25V48A16,16,0,0,0,208,32ZM128,136a8,8,0,0,1-16,0V88a8,8,0,0,1,16,0Zm48,0a8,8,0,0,1-16,0V88a8,8,0,0,1,16,0Z",
    "Discord": "M247.51,174.39,218,58a16.08,16.08,0,0,0-13-11.88l-36.06-5.92a16.22,16.22,0,0,0-18.26,11.88l-.21.85a4,4,0,0,0,3.27,4.93,155.62,155.62,0,0,1,24.41,5.62,8.2,8.2,0,0,1,5.62,9.7,8,8,0,0,1-10.19,5.64,155.4,155.4,0,0,0-90.8-.1,8.22,8.22,0,0,1-10.28-4.81,8,8,0,0,1,5.08-10.33,156.85,156.85,0,0,1,24.72-5.72,4,4,0,0,0,3.27-4.93l-.21-.85A16.21,16.21,0,0,0,87.08,40.21L51,46.13A16.08,16.08,0,0,0,38,58L8.49,174.39a15.94,15.94,0,0,0,9.06,18.51l67,29.71a16.17,16.17,0,0,0,21.71-9.1l3.49-9.45a4,4,0,0,0-3.27-5.35,158.13,158.13,0,0,1-28.63-6.2,8.2,8.2,0,0,1-5.61-9.67,8,8,0,0,1,10.2-5.66,155.59,155.59,0,0,0,91.12,0,8,8,0,0,1,10.19,5.65,8.19,8.19,0,0,1-5.61,9.68,157.84,157.84,0,0,1-28.62,6.2,4,4,0,0,0-3.27,5.35l3.49,9.45a16.18,16.18,0,0,0,21.71,9.1l67-29.71A15.94,15.94,0,0,0,247.51,174.39ZM92,152a12,12,0,1,1,12-12A12,12,0,0,1,92,152Zm72,0a12,12,0,1,1,12-12A12,12,0,0,1,164,152Z",
    "Facebook": "M232,128a104.16,104.16,0,0,1-91.55,103.26,4,4,0,0,1-4.45-4V152h24a8,8,0,0,0,8-8.53,8.17,8.17,0,0,0-8.25-7.47H136V112a16,16,0,0,1,16-16h16a8,8,0,0,0,8-8.53A8.17,8.17,0,0,0,167.73,80H152a32,32,0,0,0-32,32v24H96a8,8,0,0,0-8,8.53A8.17,8.17,0,0,0,96.27,152H120v75.28a4,4,0,0,1-4.44,4A104.15,104.15,0,0,1,24.07,124.09c2-54,45.74-97.9,99.78-100A104.12,104.12,0,0,1,232,128Z",
    "X": "M215,219.85a8,8,0,0,1-7,4.15H160a8,8,0,0,1-6.75-3.71l-40.49-63.63L53.92,221.38a8,8,0,0,1-11.84-10.76l61.77-68L41.25,44.3A8,8,0,0,1,48,32H96a8,8,0,0,1,6.75,3.71l40.49,63.63,58.84-64.72a8,8,0,0,1,11.84,10.76l-61.77,67.95,62.6,98.38A8,8,0,0,1,215,219.85Z",
    "pil": "M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"
  });
  const PLATTFORMAR = Object.freeze({
    Instagram: { farg: '#ef78ac', rubrik: 'Följ mig på' },
    TikTok: { farg: '#6ce5df', rubrik: 'Följ mig på' },
    YouTube: { farg: '#ff6c6c', rubrik: 'Prenumerera på' },
    Twitch: { farg: '#bc9aff', rubrik: 'Se mig live på' },
    Discord: { farg: '#91a5ff', rubrik: 'Häng med på' },
    Facebook: { farg: '#7ab6ff', rubrik: 'Följ mig på' },
    X: { farg: '#e4e8ef', rubrik: 'Följ mig på' }
  });
  const svg = (d, cls) => `<svg class="${cls}" viewBox="0 0 256 256" aria-hidden="true"><path d="${d}"/></svg>`;
  const plattform = p => PLATTFORMAR[p] ? p : 'Instagram';
  const STANDARDKONTON = () => [
    { id: 'k1', plattform: 'Instagram', namn: '@dittnamn', lank: '', aktiv: true },
    { id: 'k2', plattform: 'TikTok', namn: '@dittnamn', lank: '', aktiv: true },
    { id: 'k3', plattform: 'YouTube', namn: '@dinkanal', lank: '', aktiv: true }
  ];
  const konton = w => Array.isArray(w.saKonton) ? w.saKonton : [];
  const aktiva = w => konton(w).filter(k => k && k.aktiv !== false && String(k.namn || '').trim());
  const sekunder = w => SEKUNDER.includes(Number(w.saSekunder)) ? Number(w.saSekunder) : 5;
  const design = w => w.saDesign === 'glans' ? 'glans' : 'kapsel';

  // ---------- läget, räknat ur fälten och klockan ----------
  function lage(w, t = nu()) {
    const lista = aktiva(w), n = lista.length, langd = sekunder(w) * 1000;
    if (!n) return { konto: null, nr: 0, n: 0, forflutet: 0, langd };
    const bas = Math.max(0, Math.floor(Number(w.saIndex) || 0));
    let steg = 0, forflutet = 0;
    if (w.saRotera !== false && n > 1) {
      const sedan = Math.max(0, t - (Number(w.saStart) || t));
      steg = Math.floor(sedan / langd); forflutet = sedan - steg * langd;
    }
    const nr = (bas + steg) % n;
    return { konto: lista[nr], nr, n, forflutet, langd };
  }

  // ---------- markup ----------
  function kortHtml(w, l) {
    const k = l.konto, p = plattform(k.plattform), m = PLATTFORMAR[p];
    const rorlig = w.saRotera !== false && l.n > 1;
    // Förloppsstapeln startar där klockan står (negativ fördröjning), så studion och OBS är i fas.
    const stapel = rorlig ? `<div class="sa-stapel" style="animation-duration:${l.langd}ms;animation-delay:-${Math.round(l.forflutet)}ms"></div>` : '<div class="sa-stapel sa-stilla"></div>';
    return `<div class="sa-kort" style="--accent:${m.farg}"><div class="sa-glans" aria-hidden="true"></div>`
      + `<div class="sa-logo">${svg(IKON[p] || '', 'sa-ikon')}</div>`
      + `<div class="sa-text"><div class="sa-rubrik">${esc(m.rubrik)} <b>${esc(p)}</b></div><div class="sa-namn">${esc(k.namn)}</div></div>`
      + `${svg(IKON.pil || '', 'sa-pil')}${stapel}</div>`;
  }
  const tomtHtml = () => OVERLAY ? '' : '<div class="sa-tom">Lägg till och aktivera ett konto för att visa alerten.</div>';

  const oldWh = wh;
  wh = function (w) {
    if (!w || w.type !== TYP) return oldWh(w);
    const width = klamp(w.width, 120, 900, 260);
    const valt = typeof selected !== 'undefined' && selected === w.id;
    const l = lage(w);
    return `<div class="widget vyra-social sa-${design(w)}${valt ? ' selected' : ''}" data-id="${esc(w.id)}" `
      + `style="left:${Number(w.x) || 0}px;top:${Number(w.y) || 0}px;width:${width}px;--sa-z:${(width / 260).toFixed(3)}">`
      + `<div class="sa-vard">${l.konto ? kortHtml(w, l) : tomtHtml()}</div>${valt ? '<span class="resize-handle">↘</span>' : ''}</div>`;
  };

  // ---------- växlingen ----------
  // Byts kontot spelas designens utfart (360 ms), sedan byggs kortet om så att infarten — glanskortets
  // social-enter eller kapselns 1,6 s-öppning — börjar om. Samma konto med nytt namn eller ny plattform
  // ritas om direkt, utan övergång. Allt sker i noden; render() behövs inte.
  function uppdatera(rot, w, t = nu()) {
    const l = lage(w, t), vard = rot.querySelector('.sa-vard'); if (!vard) return;
    const k = l.konto;
    const nyckel = k ? String(k.id) : '';
    const innehall = k ? `${plattform(k.plattform)}|${k.namn}|${w.saRotera !== false}|${l.n}|${sekunder(w)}` : '';
    const m = rot.__sa || (rot.__sa = { nyckel, innehall, tills: 0 });
    if (m.tills && t < m.tills) return;                     // utfarten spelas
    const ny = () => { vard.innerHTML = k ? kortHtml(w, l) : tomtHtml(); m.nyckel = nyckel; m.innehall = innehall; };
    if (m.tills) { m.tills = 0; ny(); return; }
    if (nyckel !== m.nyckel) {
      const kort = vard.querySelector('.sa-kort');
      const stilla = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (kort && !stilla) { kort.classList.add('sa-ut'); m.tills = t + UTFART_MS; return; }
      ny(); return;
    }
    if (innehall !== m.innehall) {
      m.innehall = innehall;
      const kort = vard.querySelector('.sa-kort');
      if (!kort || !k) { ny(); return; }
      // Utan att starta om infarten: byt bara det som ändrats.
      const mall = document.createElement('div'); mall.innerHTML = kortHtml(w, l);
      const nytt = mall.firstElementChild;
      kort.style.setProperty('--accent', nytt.style.getPropertyValue('--accent'));
      ['.sa-logo', '.sa-text', '.sa-stapel'].forEach(sel => { const a = kort.querySelector(sel), b = nytt.querySelector(sel); if (a && b) a.replaceWith(b); });
    }
  }
  function tick() {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.widgets)) return;
    const t = nu();
    document.querySelectorAll('.vyra-social[data-id]').forEach(rot => {
      const w = state.widgets.find(x => x && x.id === rot.dataset.id && x.type === TYP);
      if (w) uppdatera(rot, w, t);
    });
    if (!OVERLAY) panelStatus();
  }
  setInterval(tick, 100);

  // ---------- studions styrning ----------
  const spara = () => { if (typeof save === 'function') save(); };
  const rita = () => { if (typeof render === 'function') render(); };
  // Varje ändring av kontolistan eller tiden ankrar om växlingen på kontot som visas just nu, så att
  // bilden inte hoppar till ett annat konto bara för att listan blev längre eller kortare.
  function ankra(w) {
    const l = lage(w), id = l.konto && l.konto.id;
    return lista => {
      const i = id ? lista.findIndex(k => k.id === id) : -1;
      w.saIndex = i >= 0 ? i : 0;
      w.saStart = nu();
    };
  }
  function styr(w, vad) {
    if (vad === 'vaxla') {
      if (w.saRotera !== false) { const l = lage(w); w.saIndex = l.nr; w.saRotera = false; }
      else { w.saRotera = true; w.saStart = nu(); }
    } else if (vad === 'nasta') {
      const l = lage(w); w.saIndex = l.n ? (l.nr + 1) % l.n : 0; w.saStart = nu();
    }
    spara(); rita();
  }
  function andraKonton(w, fn) {
    const efter = ankra(w);
    fn(konton(w));
    efter(aktiva(w));
    spara();
  }
  function panelStatus() {
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return;
    const el = document.querySelector('#saStatus'); if (!el) return;
    const l = lage(w);
    const txt = l.n ? `Visar ${l.nr + 1} av ${l.n}${l.konto ? ' · ' + plattform(l.konto.plattform) + ' ' + String(l.konto.namn) : ''}` : 'Inget aktivt konto';
    if (el.textContent !== txt) el.textContent = txt;
  }

  const oldProps = props;
  props = function () {
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return oldProps();
    const roterar = w.saRotera !== false;
    const kontoRad = k => `<div class="sa-konto" data-sa-konto="${esc(k.id)}">`
      + `<div class="sa-konto-topp"><label><input type="checkbox" data-sa-falt="aktiv"${k.aktiv === false ? '' : ' checked'}> Visa konto</label><button type="button" class="sa-ta-bort" data-sa-ta-bort="${esc(k.id)}" aria-label="Ta bort kontot">Ta bort</button></div>`
      + `<label>Plattform<select data-sa-falt="plattform">${Object.keys(PLATTFORMAR).map(p => `<option${plattform(k.plattform) === p ? ' selected' : ''}>${p}</option>`).join('')}</select></label>`
      + `<label>Användarnamn<input data-sa-falt="namn" maxlength="45" value="${esc(k.namn)}"></label>`
      + `<label>Länk <small>(valfri)</small><input data-sa-falt="lank" type="url" placeholder="https://…" value="${esc(k.lank)}"></label></div>`;
    return `<h3>SOCIAL-ALERT</h3><div class="template-badge">SOCIALA KONTON · AUTOMATISK VÄXLING</div><div hidden><input id="pt" value="Social-alert"><input id="pv" value=""></div>`
      + `<div class="property-group"><h4>DESIGN</h4><label>Design<select id="saDesign"><option value="glans"${design(w) === 'glans' ? ' selected' : ''}>1 – Glanskort (original)</option><option value="kapsel"${design(w) === 'kapsel' ? ' selected' : ''}>2 – Ikon som öppnas</option></select></label></div>`
      + `<div class="property-group"><h4>VÄXLING</h4><div class="sa-status" id="saStatus"></div>`
      + `<div class="sa-knappar"><button type="button" id="saVaxla">${roterar ? 'Pausa växling' : 'Starta växling'}</button><button type="button" id="saNasta">Nästa konto →</button></div>`
      + `<label>Visa varje konto<select id="saSekunder">${SEKUNDER.map(n => `<option value="${n}"${sekunder(w) === n ? ' selected' : ''}>${n} sek</option>`).join('')}</select></label>`
      + `<small>OBS-länken visar samma konto. Ändringar här syns där efter några sekunder.</small></div>`
      + `<div class="property-group"><h4>KONTON <span class="sa-antal">${konton(w).length} st</span></h4><small>Markera vilka konton som ska vara med i växlingen.</small>`
      + konton(w).map(kontoRad).join('')
      + `<button type="button" id="saLaggTill">+ Lägg till konto</button></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width || 260}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
  };

  function katalog() {
    const cat = document.querySelector('.widget-catalog');
    if (!cat || cat.querySelector('[data-sa-skapa]')) return;
    const sek = document.createElement('section');
    sek.className = 'sa-katalog';
    sek.innerHTML = '<h4>SOCIAL-ALERT</h4>';
    [['glans', '1 · Glanskort', 'Kompakt glanskort · växlar mellan dina konton'], ['kapsel', '2 · Ikon som öppnas', 'Ikonen öppnas till en kapsel på 1,6 s']].forEach(([d, namn, text]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.saSkapa = d; b.dataset.catalogKey = 'catalog:socialalert:' + d;
      b.innerHTML = `<i class="vyra-pro-icon">↻</i><span><b>Social-alert · ${namn}</b><small>${text}</small></span>`;
      b.onclick = () => {
        if (!window.VyraWidgets || typeof state === 'undefined') return;
        const w = window.VyraWidgets.create('catalog:socialalert:' + d);
        w.saStart = nu();
        state.widgets.push(w); selected = w.id; spara(); rita();
        if (typeof toast === 'function') toast('Social-alert skapad');
      };
      sek.append(b);
    });
    cat.append(sek);
  }

  const oldBind = bind;
  bind = function () {
    oldBind();
    if (typeof view === 'undefined' || (view !== 'editor' && view !== 'overlay')) return;
    katalog();
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return;
    if (!Array.isArray(w.saKonton)) w.saKonton = STANDARDKONTON();
    const pa = (sel, ev, fn) => { const el = document.querySelector(sel); if (el) el[ev] = fn; };
    pa('#saDesign', 'onchange', e => { w.saDesign = e.target.value === 'glans' ? 'glans' : 'kapsel'; spara(); rita(); });
    pa('#saVaxla', 'onclick', () => styr(w, 'vaxla'));
    pa('#saNasta', 'onclick', () => styr(w, 'nasta'));
    pa('#saSekunder', 'onchange', e => { const efter = ankra(w); w.saSekunder = SEKUNDER.includes(+e.target.value) ? +e.target.value : 5; efter(aktiva(w)); spara(); rita(); });
    pa('#saLaggTill', 'onclick', () => {
      andraKonton(w, lista => lista.push({ id: 'k' + nu().toString(36), plattform: 'Instagram', namn: '@dittnamn', lank: '', aktiv: true }));
      rita();
    });
    document.querySelectorAll('[data-sa-ta-bort]').forEach(b => {
      b.onclick = () => { const id = b.dataset.saTaBort; andraKonton(w, lista => { const i = lista.findIndex(k => k.id === id); if (i >= 0) lista.splice(i, 1); }); rita(); };
    });
    document.querySelectorAll('[data-sa-konto]').forEach(rad => {
      const k = konton(w).find(x => x.id === rad.dataset.saKonto); if (!k) return;
      rad.querySelectorAll('[data-sa-falt]').forEach(f => {
        const falt = f.dataset.saFalt;
        // Text skrivs medan man skriver (oninput) utan att panelen ritas om — markören står kvar.
        // Kryssrutan och plattformen ändrar listan och ritar om.
        if (falt === 'namn' || falt === 'lank') f.oninput = e => { k[falt] = String(e.target.value).slice(0, falt === 'namn' ? 45 : 500); spara(); };
        else f.onchange = e => { andraKonton(w, () => { k[falt] = falt === 'aktiv' ? e.target.checked : plattform(e.target.value); }); rita(); };
      });
    });
  };

  window.VyraSocialAlert = Object.freeze({ typ: TYP, lage, uppdatera, styr, plattformar: PLATTFORMAR, standardkonton: STANDARDKONTON });
  try { if (typeof render === 'function') render(); } catch (_) {}
})();
