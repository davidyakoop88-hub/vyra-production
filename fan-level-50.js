// fan-level-50.js — Fan Level 50-tavlan.
//
// En milstolpe-widget: bara fans som natt Fan Level 50 visas, var och en pa en fardig kort-mall
// (bakgrundsbild med inbrand "LEVEL 50") med sin profilbild, sitt namn och lag. Tva rorelselagen:
// slideshow (ett kort i taget, byter var N:e sekund) och rullande band.
//
// ROSTERN. Auto-fansen (de som natt niva 50 i live) samlas i minnet av fan-level-50-session.js och
// forsvinner med sidan — inget sparas. Den handtaggade listan (fanl50Manual) sparas i layouten.
// fanl50Source valjer: 'both' (auto + manuell), 'auto', eller 'manual'.
//
// Geometrin (foto/namn/lag) bor i fan-level-50.css — en mall, en uppsattning matt. Renderaren
// returnerar sin egen rot, sa den bar sjalv width/z-index/display:none (styledWh hoppas over nar en
// wh-patch returnerar tidigt) — en dold widget far aldrig ritas i overlay.
(function (root) {
  'use strict';
  const safe = VyraSafe;
  const DESIGNS = VyraWidgets.variants('fanlevel50.design');           // {royal:'Fly Love', zeus, ornen, lejon}
  // Fyra mallar (David 2026-10-14). Nyckeln `royal` bar nu den nya Fly Love-mallen: sparade layouter
  // med fanl50Design:'royal' far den nya bilden i stallet for att tappa sin design. Den gamla bilden
  // (fly-love-royal-50.jpg) ar borttagen. Foto- och namngeometrin per mall bor i fan-level-50.css.
  const ART = {
    royal: { art: 'assets/fanlevel50/fly-love-50.webp?v=20261014-2', level: 50 },
    zeus:  { art: 'assets/fanlevel50/zeus-50.webp?v=20261014-1', level: 50 },
    ornen: { art: 'assets/fanlevel50/ornen-50.webp?v=20261014-1', level: 50 },
    lejon: { art: 'assets/fanlevel50/lejon-50.webp?v=20261014-1', level: 50 }
  };
  const FALLBACK = 'assets/images/test-profile.svg';

  const auto = [];                 // live-roster {name,avatar,team} — sparas i localStorage sa den overlever omladdning + sandning
  const STORAGE_KEY = 'vyra-fanlevel50-roster';
  function saveRoster() { try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify(auto)); } catch (_) {} }
  function loadRoster() {
    try {
      const raw = root.localStorage.getItem(STORAGE_KEY); if (!raw) return;
      const arr = JSON.parse(raw); if (!Array.isArray(arr)) return;
      const seen = new Set();
      arr.forEach(m => { const namn = String(m && m.name || '').trim(); const k = namn.toLowerCase(); if (!namn || seen.has(k)) return; seen.add(k); auto.push({ name: namn, avatar: String(m.avatar || ''), team: String(m.team || '') }); });
    } catch (_) {}
  }
  loadRoster();
  const idx = new Map();           // widgetId -> aktuellt slideshow-index
  const lastSwap = new Map();      // widgetId -> tidsstampel for senaste byte
  const cssEsc = s => (root.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, '\\$&');
  const num = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

  function demo() {
    return [{ name: 'MICHELLY', avatar: '', team: '' }, { name: 'GARY B.', avatar: '', team: '' }, { name: 'NOVA STORM', avatar: '', team: '' }];
  }
  function manualOf(w) { return Array.isArray(w.fanl50Manual) ? w.fanl50Manual : []; }
  function members(w) {
    const src = w.fanl50Source || 'both';
    let list = [];
    if (src !== 'manual') list = list.concat(auto);
    if (src !== 'auto') list = list.concat(manualOf(w));
    const seen = new Set(), out = [];
    for (const m of list) { const k = String(m && m.name || '').toLowerCase().trim(); if (!k || seen.has(k)) continue; seen.add(k); out.push(m); }
    // REGEL NR 1 (David 2026-10-11): demomedlemmarna (MICHELLY, GARY B., NOVA STORM) är till för
    // editorn. I overlay med en tom roster visades de som riktiga fans — uppmätt med noll events.
    // Tom lista i overlay ger en dold widget; första riktiga level-50-fansen (addAuto) tänder den.
    return out.length ? out : (iOverlay() && aktivSandning() ? [] : demo());
  }

  // NAMNET SKA FÅ PLATS (David 2026-10-14). Banderollen rymmer ~11 tecken i full storlek; ett längre
  // namn krymper i stället för att klippas till "Nova Stor…". Faktorn är en uppskattning (en
  // versal i Oswald 800 ≈ 0,6 em) — ellipsen i CSS finns kvar som sista skydd för extrema namn.
  // Golvet 0,5: under halva storleken går texten inte att läsa i OBS, då är ellipsen bättre.
  // `ryms` = antal tecken som far plats i full storlek: 11 i stora vyn, 8 i det sma kortets storre
  // namn (fan-level-50.css, --fl50-nm-ks).
  function namnFaktor(namn, ryms = 11) {
    const n = Array.from(String(namn || '')).length;
    return n <= ryms ? 1 : Math.max(0.5, Math.round(ryms * 100 / n) / 100);
  }
  const namnStil = namn => `--fl50-nm-k:${namnFaktor(namn)};--fl50-nm-ks:${namnFaktor(namn, 8)}`;

  // UPPSKATTNINGEN RÄCKER INTE — MÄT (slutgranskningen 2026-10-20, A-004). Oswald laddas ingenstans,
  // så namnet ritas i reservtypsnittet ('Segoe UI' på Windows, system-ui i OBS på andra system), som
  // är bredare än 0,6 em per versal: "NOVA STORM" (10 tecken, faktor 1) blev 107 px i en 103 px
  // banderoll och klipptes till "NOVA STOR…" i sändningen. Efter varje ritning mäts varje namn som
  // inte får plats, och faktorerna krymps med kvoten — samma golv 0,5 som namnFaktor. Ett namn som
  // redan får plats rörs aldrig, så en ritning utan klippta namn skriver ingenting.
  function passaNamn(scope) {
    (scope || document).querySelectorAll('.fan-level-50 .fl50-name').forEach(box => {
      const sp = box.firstElementChild; if (!sp) return;
      for (let varv = 0; varv < 3; varv++) {
        const cw = sp.clientWidth, sw = sp.scrollWidth;
        if (!cw || sw <= cw) return;                       // dold (0) eller får plats
        const k = parseFloat(box.style.getPropertyValue('--fl50-nm-k')) || 1;
        const ks = parseFloat(box.style.getPropertyValue('--fl50-nm-ks')) || 1;
        if (k <= 0.5 && ks <= 0.5) return;                 // golvet: ellipsen tar resten
        const r = cw / sw * 0.98;
        box.style.setProperty('--fl50-nm-k', Math.max(0.5, Math.floor(k * r * 1000) / 1000));
        box.style.setProperty('--fl50-nm-ks', Math.max(0.5, Math.floor(ks * r * 1000) / 1000));
      }
    });
  }
  let passaPlanerad = 0;
  function planeraPassning() {
    if (passaPlanerad) return;
    passaPlanerad = (root.requestAnimationFrame || (f => root.setTimeout(f, 16)))(() => { passaPlanerad = 0; passaNamn(); });
  }
  if (typeof MutationObserver === 'function' && root.document && root.document.body) {
    // Bara mutationer som rör en Fan Level 50-tavla: en omritning, ett kortbyte (bytKort skriver
    // namnets text) eller ▶ Testa:s klon. Stilskrivningarna ovan är inga childList-mutationer.
    new MutationObserver(muts => {
      for (const m of muts) {
        const t = m.target && m.target.nodeType === 1 ? m.target : m.target && m.target.parentElement;
        if ((t && t.closest && t.closest('.fan-level-50')) || [...(m.addedNodes || [])].some(n => n.nodeType === 1 && (n.matches('.fan-level-50') || n.querySelector('.fan-level-50')))) { planeraPassning(); return; }
      }
    }).observe(root.document.body, { childList: true, subtree: true });
  }
  // Typsnitt som laddas efter ritningen ändrar bredden.
  try { root.document.fonts && root.document.fonts.ready.then(planeraPassning); root.document.fonts.addEventListener('loadingdone', planeraPassning); } catch (_) {}

  // EN WIDGET, ALLA DESIGNER (David 2026-10-16): katalogen har ett kort i stallet for fyra, och
  // inspektorn valjer en design eller 'alla'. Med 'alla' far kort nr N mall nr N (runt), sa bandet
  // visar alla fyra bredvid varandra och slideshowen byter mall med varje fan.
  const ALLA = 'alla';
  const NYCKLAR = Object.keys(ART);
  function designFor(w, rank) {
    if (w.fanl50Design === ALLA) return NYCKLAR[(Math.max(1, rank || 1) - 1) % NYCKLAR.length];
    return ART[w.fanl50Design] ? w.fanl50Design : 'royal';
  }

  function cardHtml(w, m, rank) {
    const design = designFor(w, rank);
    const d = ART[design];
    const team = safe.text(m.team || w.fanl50Team || '');
    return `<div class="fl50-card fl50-design-${design}">
      <img class="fl50-art" src="${d.art}" alt="">
      <div class="fl50-photo"><img src="${safe.url((typeof window.vyraReservbild === 'function' ? window.vyraReservbild : v => v)(m.avatar), FALLBACK)}" alt=""></div>
      <div class="fl50-name" style="${namnStil(m.name)}"><span>${safe.text(m.name, 'FAN')}</span></div>
      ${team ? `<div class="fl50-team"><span>#${team}</span></div>` : ''}
      ${rank ? `<div class="fl50-rank">#${rank}</div>` : ''}
    </div>`;
  }

  const iOverlay = () => new URLSearchParams(root.location.search).has('overlay');
  // Samma sändningsgrind som vyra-tom-widget.js: utan sändning (t.ex. den visuella riggen) visas demot.
  const aktivSandning = () => { try { return !!(root.VyraTomWidget && root.VyraTomWidget.aktivSession()) } catch (_) { return false } };
  // Sändningsstarten ritar om, så demomedlemmarna försvinner när publiken kommer.
  root.addEventListener('vyra-live-session', () => { if (typeof render === 'function') render(); });
  const DOLJ = 'display:none!important;';

  // `lista` ges bara av ▶ Testa widget (provHtml nedan): exempeldeltagarna pa klonen, fran forsta kortet.
  function fanLevel50Html(w, lista) {
    const list = lista || members(w);
    const dold = !list.length;
    const mode = w.fanl50Mode === 'band' ? 'band' : 'slideshow';
    let inner;
    if (mode === 'band') {
      const cards = list.map((m, i) => cardHtml(w, m, i + 1)).join('');
      inner = `<div class="fl50-track">${cards}${cards}</div>`;
    } else if (lista) {
      inner = list.length ? cardHtml(w, list[0], 1) : '';
    } else {
      // Klampen skrivs tillbaka: krymper listan (remove/clear) visade ritningen kort 0 men swap()
      // raknade vidare fran det gamla indexet och visade samma kort ett varv till.
      let i = idx.get(w.id) || 0; if (i >= list.length) { i = 0; idx.set(w.id, 0); }
      inner = list.length ? cardHtml(w, list[i], i + 1) : '';
    }
    const interval = num(w.fanl50Interval, 6, 2, 60);
    // --fl50-z: kortet tar tillbaka zoomen sa att dess container query mater den verkliga bredden
    // (kompakt lage i fan-level-50.css). Samma tal som zoom:, annars stammer inte storleken.
    const zoom = num(w.widgetScale, 1, .1, 5);
    return `<div class="widget fan-level-50 fl50-mode-${mode}${selected === w.id ? ' selected' : ''}" data-id="${safe.text(w.id)}" style="${dold ? DOLJ : ''}left:${num(w.x, 0, -10000, 10000)}px;top:${num(w.y, 0, -10000, 10000)}px;width:${num(w.width, 300, 120, 2000)}px;zoom:${zoom};--fl50-z:${zoom};z-index:${num(w.layer, 1, 0, 99)};${w.hidden ? 'display:none;' : ''}--fl50-speed:${interval}s"><div class="fl50-viewport">${inner}</div>${selected === w.id ? '<span class="resize-handle">↘</span>' : ''}</div>`;
  }

  // ---- render-kedja: patcha wh for den nya typen -------------------------------------------------
  const prevWh = wh;
  wh = function (w) { return w && w.type === 'templateFanLevel50' ? fanLevel50Html(w) : prevWh(w); };

  // ---- inspector --------------------------------------------------------------------------------
  const prevProps = props;
  props = function () {
    const w = liveWidget(selected);
    if (!w || w.type !== 'templateFanLevel50') return prevProps();
    const interval = num(w.fanl50Interval, 6, 2, 60);
    const manual = manualOf(w);
    const manualLines = manual.map(m => m.avatar ? `${m.name}|${m.avatar}` : String(m.name || '')).join('\n');
    // En rad per deltagare: bild, namn (går att skriva om) och Ta bort. I den nya panelen
    // (vyra-fl50-panel.js) blir bilden en mediaväljare; namnet och Ta bort binds här nedan.
    const chipsHtml = manual.length
      ? manual.map((m, i) => `<div class="fl50-chip fl50-rad" data-fl50-rad="${i}"><span class="fl50-rad-bild" data-fl50-bild="${i}"><img src="${safe.url(m.avatar, FALLBACK)}" alt=""></span><input class="fl50-rad-namn" data-fl50-namn="${i}" id="fl50Namn${i}" value="${safe.text(m.name, 'FAN')}" aria-label="Namn på deltagare ${i + 1}" spellcheck="false"><button type="button" class="fl50-chip-x vw-ik vw-ik--radera vw-ik--trang" id="fl50Del${i}" data-fl50-del="${i}" title="Ta bort" aria-label="Ta bort ${safe.text(m.name, 'FAN')}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6.5h16M9.5 6.5V4.5h5v2M6 6.5l1 13a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5l1-13M10 11v6M14 11v6"/></svg></button></div>`).join('')
      : '<small class="fl50-chips-tom">Inga deltagare i listan än. Skriv ett namn ovan.</small>';
    const opt = (val, cur, label) => `<option value="${val}"${cur === val ? ' selected' : ''}>${label}</option>`;
    return `<h3>FAN LEVEL 50</h3><div class="template-badge">MILSTOLPE · LIVE + MANUELL</div>
      <div hidden><input id="pt" value="${safe.text(w.title, 'Fan Level 50')}"><input id="pv" value=""></div>
      <div class="property-group"><h4>VISNING</h4>
        <label>Design<select id="fl50Design">${opt(ALLA, w.fanl50Design, 'Alla designer (växlar)')}${Object.entries(DESIGNS).map(([k, label]) => opt(k, w.fanl50Design, label)).join('')}</select></label>
        <label>Läge<select id="fl50Mode">${opt('slideshow', w.fanl50Mode || 'slideshow', 'Slideshow')}${opt('band', w.fanl50Mode, 'Rullande band')}</select></label>
        <label class="range-label">Bytestid <b>${interval} s</b><input id="fl50Interval" type="range" min="2" max="20" value="${interval}"></label>
        <label>Källa<select id="fl50Source">${opt('both', w.fanl50Source || 'both', 'Live och deltagarlistan')}${opt('auto', w.fanl50Source, 'Bara live')}${opt('manual', w.fanl50Source, 'Bara deltagarlistan')}</select></label>
        <label>Lagnamn (#)<input id="fl50Team" value="${safe.text(w.fanl50Team, 'FANCLUB')}"></label>
      </div>
      <div class="property-group"><h4>LÄGG TILL ANVÄNDARE <span class="fl50-count">${manual.length}</span></h4>
        <div class="fl50-deltagare" id="fl50Deltagare">
        <label for="fl50AddUser" class="fl50-add-etikett">Användarnamn att lägga till</label>
        <div class="fl50-add"><input id="fl50AddUser" placeholder="@namn1, @namn2" spellcheck="false"><button id="fl50AddBtn" type="button">Hämta från TikTok</button><button id="fl50AddNamn" type="button">Lägg till namn</button></div>
        <small id="fl50AddStatus">Skriv ett eller flera @användarnamn (separera med komma eller mellanslag). Hämta från TikTok hämtar namn och profilbild; Lägg till namn lägger till namnen som de är.</small>
        <div id="fl50Chips" class="fl50-chips">${chipsHtml}</div></div></div>
      <details class="property-group"><summary class="fl50-summary">Redigera listan som text</summary>
        <small>En per rad: <code>namn</code> eller <code>namn|profilbild-url</code></small>
        <textarea id="fl50Manual" rows="4" spellcheck="false">${safe.text(manualLines, '')}</textarea></details>
      <div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid">
        <label>X<input id="propX" type="number" value="${num(w.x, 0, -10000, 10000)}"></label>
        <label>Y<input id="propY" type="number" value="${num(w.y, 0, -10000, 10000)}"></label>
        <label>Bredd<input id="propWidth" type="number" min="120" max="1200" value="${num(w.width, 300, 120, 2000)}"></label>
        <label>Lager<input id="propLayer" type="number" min="0" max="99" value="${num(w.layer, 1, 0, 99)}"></label>
      </div></div>
      <button class="delete" id="del">Ta bort</button>`;
  };

  const prevBind = bind;
  bind = function () {
    prevBind();
    if (view !== 'editor') return;
    const w = liveWidget(selected);
    if (!w || w.type !== 'templateFanLevel50') return;
    const on = (id, fn) => { const el = document.querySelector(id); if (el) fn(el); };
    on('#fl50Design', el => { el.onchange = e => { w.fanl50Design = e.target.value; save(); render(); }; });
    on('#fl50Mode', el => { el.value = w.fanl50Mode || 'slideshow'; el.onchange = e => { w.fanl50Mode = e.target.value; save(); render(); }; });
    on('#fl50Source', el => { el.value = w.fanl50Source || 'both'; el.onchange = e => { w.fanl50Source = e.target.value; save(); render(); }; });
    // Bytestiden styr också bandets fart (--fl50-speed i rotens stil, fan-level-50.css): skriv den på noden
    // medan reglaget dras och rita om vid change — förut syntes en ny fart i bandet först vid nästa omritning.
    const ritaOm = () => { if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel(); else render(); };
    on('#fl50Interval', el => { el.oninput = e => { w.fanl50Interval = +e.target.value; const b = el.parentElement.querySelector('b'); if (b) b.textContent = (+e.target.value) + ' s'; const nod = document.querySelector(`.canvas [data-id="${cssEsc(w.id)}"]`); if (nod) nod.style.setProperty('--fl50-speed', num(w.fanl50Interval, 6, 2, 60) + 's'); }; el.onchange = e => { w.fanl50Interval = +e.target.value; save(); ritaOm(); }; });
    on('#fl50Team', el => { el.onchange = e => { w.fanl50Team = e.target.value; save(); render(); }; });
    on('#fl50Manual', el => {
      el.onchange = e => {
        w.fanl50Manual = String(e.target.value || '').split('\n').map(rad => rad.trim()).filter(Boolean).map(rad => {
          const bit = rad.split('|'); return { name: bit[0].trim(), avatar: (bit[1] || '').trim() };
        });
        save(); render();
      };
    });
    on('#fl50AddBtn', btn => {
      btn.onclick = async () => {
        const inp = document.querySelector('#fl50AddUser'), stat = document.querySelector('#fl50AddStatus');
        // Flera namn: separera på komma, mellanslag eller radbrytning. Skiftlägesokänslig dedupe.
        const seen = new Set(), koll = [];
        String(inp && inp.value || '').split(/[\s,]+/).forEach(bit => {
          const n = bit.trim().replace(/^@/, ''); const k = n.toLowerCase();
          if (n && !seen.has(k)) { seen.add(k); koll.push(n); }
        });
        if (!koll.length) { if (stat) stat.textContent = 'Skriv minst ett användarnamn.'; return; }
        btn.disabled = true;
        const lista = Array.isArray(w.fanl50Manual) ? w.fanl50Manual.slice() : [];
        let lagt = 0; const fel = [];
        for (let i = 0; i < koll.length; i++) {
          const n = koll[i];
          if (stat) stat.textContent = 'Hämtar @' + n + '… (' + (i + 1) + '/' + koll.length + ')';
          try {
            const r = await fetch('/api/tiktok-profile?username=' + encodeURIComponent(n));
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d || !d.ok) throw new Error((d && d.error) || 'kunde inte hämta');
            if (!lista.some(m => String(m && m.name || '').toLowerCase() === String(d.nickname).toLowerCase())) {
              lista.push({ name: d.nickname, avatar: d.avatar || '', hamtad: true }); lagt++;
            }
          } catch (_) { fel.push('@' + n); }
        }
        w.fanl50Manual = lista; save();
        if (typeof toast === 'function' && lagt) toast('La till ' + lagt + ' användare');
        render();
        // render() bygger om panelen — sätt eventuell felnotis på det nya statusfältet.
        if (fel.length) { const s2 = document.querySelector('#fl50AddStatus'); if (s2) s2.textContent = (lagt ? ('La till ' + lagt + '. ') : '') + 'Kunde inte hämta: ' + fel.join(', '); }
      };
    });
    document.querySelectorAll('[data-fl50-del]').forEach(x => {
      x.onclick = () => {
        const i = Number(x.getAttribute('data-fl50-del'));
        const lista = Array.isArray(w.fanl50Manual) ? w.fanl50Manual.slice() : [];
        if (i >= 0 && i < lista.length) { lista.splice(i, 1); w.fanl50Manual = lista; save(); render(); }
      };
    });
    // Lägg till namn: samma inmatning som Hämta, men utan servern — namnen läggs till som de är (det
    // textrutan "namn|profilbild-url" gjorde förut). Bilden väljs sedan per rad.
    on('#fl50AddNamn', btn => {
      btn.onclick = () => {
        const inp = document.querySelector('#fl50AddUser'), stat = document.querySelector('#fl50AddStatus');
        const lista = manualOf(w).slice();
        const finns = new Set(lista.map(m => String(m && m.name || '').toLowerCase()));
        let lagt = 0;
        String(inp && inp.value || '').split(/[\s,]+/).forEach(bit => {
          const n = bit.trim().replace(/^@/, ''); const k = n.toLowerCase();
          if (n && !finns.has(k)) { finns.add(k); lista.push({ name: n, avatar: '' }); lagt++; }
        });
        if (!lagt) { if (stat) stat.textContent = 'Skriv minst ett namn som inte redan finns i listan.'; return; }
        w.fanl50Manual = lista; save(); render();
      };
    });
    // Namnet på en rad går att skriva om. Ett tomt namn ångras (raden tas bort med Ta bort).
    document.querySelectorAll('[data-fl50-namn]').forEach(inp => {
      inp.onchange = () => {
        const i = Number(inp.getAttribute('data-fl50-namn'));
        const lista = manualOf(w).slice();
        const namn = String(inp.value || '').trim();
        if (!(i >= 0 && i < lista.length)) return;
        if (!namn || namn === lista[i].name) { inp.value = lista[i].name || ''; return; }
        lista[i] = Object.assign({}, lista[i], { name: namn });
        w.fanl50Manual = lista; save(); render();
      };
    });
  };

  // ---- katalogsektion ---------------------------------------------------------------------------
  const prevCatalog = bind;
  bind = function () {
    prevCatalog();
    if (view !== 'editor' && view !== 'overlay') return;
    const catalog = document.querySelector('.widget-catalog');
    if (!catalog || catalog.querySelector('[data-fl50]')) return;
    const section = document.createElement('section');
    section.dataset.fl50 = '1';
    section.className = 'fan-level-50-template-section';
    // Ett kort for alla designer (David 2026-10-16). Fabriken bygger fortfarande en widget per mall
    // (sparade layouter bar sina nycklar); det nya kortet startar i 'alla' och designen valjs sedan
    // i inspektorn.
    section.innerHTML = '<h4>FAN LEVEL 50 · MILSTOLPE</h4>' +
      `<button data-fl50-design="${ALLA}" data-catalog-key="catalog:fanlevel50:royal"><i>♛</i><span><b>Fan Level 50</b><small>${Object.values(DESIGNS).join(' · ')} · välj en eller alla</small></span></button>`;
    catalog.prepend(section);
    section.querySelectorAll('button').forEach(b => {
      const key = b.dataset.catalogKey;
      b.onclick = () => { const created = VyraWidgets.create(key); created.fanl50Design = ALLA; state.widgets.push(created); selected = created.id; save(); render(); toast('Fan Level 50 skapad'); };
    });
  };

  // ---- slideshow-motor: byter kort utan att bygga om hela canvasen ------------------------------
  function swap() {
    if (view !== 'editor' && view !== 'overlay') return;
    const now = Date.now();
    // `state` ar en const i studio.js och hamnar ALDRIG pa window — `root.state` var alltid
    // undefined, listan tom och slideshowen bytte aldrig kort (LIVE 2026-10-17; bandet ar ren CSS
    // och klarade sig). Las den delade bindningen; reserven ar samma objekt via VyraSessionState.
    const st = typeof state !== 'undefined' ? state : root.VyraSessionState?.activeState?.();
    const list0 = (st && Array.isArray(st.widgets)) ? st.widgets : [];
    list0.forEach(w => {
      if (!w || w.type !== 'templateFanLevel50' || w.fanl50Mode === 'band') return;
      const list = members(w); if (list.length < 2) return;
      const interval = num(w.fanl50Interval, 6, 2, 60) * 1000;
      if (now - (lastSwap.get(w.id) || 0) < interval) return;
      const box = document.querySelector(`[data-id="${cssEsc(w.id)}"]`); if (!box) return;
      lastSwap.set(w.id, now);
      let i = (idx.get(w.id) || 0) + 1; if (i >= list.length) i = 0; idx.set(w.id, i);
      const card = box.querySelector('.fl50-card'); if (!card) return;
      bytKort(card, w, list[i], i, (f, ms) => root.setTimeout(f, ms));
    });
  }
  root.setInterval(swap, 1000);

  // Ett kortbyte pa ett givet kort: tona ut, byt foto/namn/lag/mall, tona in. swap() ovan anropar den for
  // widgetarna i state; ▶ Testa widget for klonens kort, med testmotorns vaktade timer som `tid`.
  function bytKort(card, w, m, i, tid) {
    card.classList.add('fl50-out');
    tid(() => {
      // 'alla': nasta fan far nasta mall — byt bild och mallklass (geometrin hanger pa klassen).
      const design = designFor(w, i + 1);
      if (!card.classList.contains('fl50-design-' + design)) {
        NYCKLAR.forEach(k => card.classList.remove('fl50-design-' + k)); card.classList.add('fl50-design-' + design);
        const art = card.querySelector('.fl50-art'); if (art) art.src = ART[design].art;
      }
      const ph = card.querySelector('.fl50-photo img'); if (ph) ph.src = safe.src((typeof window.vyraReservbild === 'function' ? window.vyraReservbild : v => v)(m.avatar) || FALLBACK, FALLBACK);
      const nm = card.querySelector('.fl50-name span'); if (nm) { nm.textContent = safe.text(m.name, 'FAN'); nm.parentElement.style.setProperty('--fl50-nm-k', namnFaktor(m.name)); nm.parentElement.style.setProperty('--fl50-nm-ks', namnFaktor(m.name, 8)); }
      const teamText = safe.text(m.team || w.fanl50Team || '');
      const tm = card.querySelector('.fl50-team span'); if (tm) tm.textContent = teamText ? ('#' + teamText) : '';
      const rk = card.querySelector('.fl50-rank'); if (rk) rk.textContent = '#' + (i + 1);
      card.classList.remove('fl50-out'); card.classList.add('fl50-in');
      tid(() => card.classList.remove('fl50-in'), 520);
    }, 420);
  }

  // ---- publikt API for sessionen ----------------------------------------------------------------
  let renderTimer = null;
  function schedule() { if (renderTimer) return; renderTimer = root.setTimeout(() => { renderTimer = null; if (typeof render === 'function') render(); }, 300); }
  root.VyraFanLevel50 = {
    roster: () => auto.slice(),
    members,
    namnFaktor,
    passaNamn,
    // ▶ Testa widget (vyra-fl50-panel.js): kortens HTML med en given lista, och ett kortbyte pa ett givet
    // kort. Inget av dem laser eller skriver rostern, layouten eller natet. glom(id) tar bort det
    // slideshowen eventuellt minns for klonens id.
    provHtml: (w, lista) => fanLevel50Html(w, Array.isArray(lista) ? lista : []),
    bytKort,
    glom(id) { idx.delete(id); lastSwap.delete(id); },
    addAuto(m) {
      const namn = String(m && m.name || '').trim(); if (!namn) return;
      const av = String(m.avatar || ''), team = String(m.team || '');
      // Redan med? Fyll i saknad bild/lag om live-eventet bar dem (namn-bara-post far sitt foto nar hen dyker upp).
      const ex = auto.find(x => x.name.toLowerCase() === namn.toLowerCase());
      if (ex) {
        let changed = false;
        if (av && !ex.avatar) { ex.avatar = av; changed = true; }
        if (team && !ex.team) { ex.team = team; changed = true; }
        if (changed) { saveRoster(); schedule(); }
        return;
      }
      auto.push({ name: namn, avatar: av, team: team });
      saveRoster(); schedule();
    },
    remove(namn) { const k = String(namn || '').toLowerCase(); const i = auto.findIndex(x => x.name.toLowerCase() === k); if (i >= 0) { auto.splice(i, 1); saveRoster(); schedule(); } },
    clear() { auto.length = 0; saveRoster(); schedule(); }
  };

  // Stilmallen laddas av media.js-svansen (stylesheet-pairs.test.js vaktar att paret halls ihop dar).
  if (typeof render === 'function') render();
})(window);
