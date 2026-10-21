(function () {
  'use strict';
  // GIFT CAMPAIGNS GÅVOVAL — en flik per gåva i kampanjen (David 2026-10-20: "tycka på nr 1 väljer man
  // gift sen kommer nr två").
  //
  // Panelen (registret i vyra-mal-panel.js, sektion 2 · Innehåll) har en rad med flikar 1, 2, 3 … — lika
  // många som Antal gåvor (giftCount, 1–6). Under flikraden, för den valda fliken:
  //   * Gåva — en rullgardinslista med gåvans bild, namn och coins ("Rose (1 coins)"), sökbar, sorterad
  //     från billigast till dyrast. Gåvor utan bild visas inte, och en bild som inte går att ladda blir
  //     en gåvoikon — aldrig profil-silhuetten (David 2026-10-21: "allt i tiktok är coins och de ska
  //     vara sorterade, en ros är inte 5 mynt").
  //   * Namn — visningsnamnet, förifyllt från vald gåva men går att ändra,
  //   * Mål (st) — antalet.
  //
  // KATALOGEN ÄR ACTION & EVENTS. Listan läser window.VyraGavokatalog.lista() — samma gavolistan() som
  // gåvoväljaren i eventdialogen (action-event-advanced.js "Skickar en specifik gåva"): inlärda gåvor
  // först (svenska namn, riktiga mynt, riktig bild), sedan rummets katalog, molnets katalog och sist
  // manifestet. Raden ritas som där: bild, namn och mynt. Saknas den filen (ett prov som bara laddar
  // registret) blir listan manifestet, utan mynt.
  //
  // FÄLTEN ÄR DE RENDERAREN LÄSER. Ett val skriver giftName<i> och giftImage<i> (media.js campaignItems,
  // gift-campaign-aura.js), så widgeten visar gåvan direkt. Dessutom giftMatch<i> — den valda gåvans
  // riktiga namn, som livevägen (gift-event-images.js) räknar mot även när visningsnamnet ändrats — och
  // giftCoins<i> för listans etikett. Ingenting byter namn: en kampanj sparad före fliken visar sina
  // gåvor i flikarna, och utan giftMatch räknar livet på namnet precis som förut.
  //
  // Bara editorn. I overlay-utdata gör filen ingenting.

  const iOverlay = () => (typeof VYRA_OVERLAY !== 'undefined' && VYRA_OVERLAY)
    || (typeof location !== 'undefined' && /[?&]overlay(=|&|$)/.test(location.search));
  if (iOverlay() || typeof props !== 'function' || typeof bind !== 'function') return;

  const TYP = 'templateGiftCampaign';
  const MAX_RADER = 200;
  const vald = () => (typeof liveWidget === 'function' && typeof selected !== 'undefined') ? liveWidget(selected) : null;
  const harPost = w => !!(w && w.type === TYP && window.VyraPanelregister && window.VyraPanelregister.hitta && window.VyraPanelregister.hitta(w));
  // Samma som media.js campaignGiftCount (1–6, standard 4).
  const antal = w => Math.min(6, Math.max(1, +(w && w.giftCount) || 4));
  const text = v => (window.VyraSafe ? VyraSafe.text(String(v == null ? '' : v)) : String(v == null ? '' : v).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'));
  const bildUrl = v => (window.VyraSafe ? VyraSafe.url(String(v || '')) : '');

  // Vald flik per widget. Minnet överlever omritningen av panelen (render bygger om allt).
  const valdFlik = new Map();
  const flikFor = w => Math.min(antal(w) - 1, Math.max(0, valdFlik.get(w.id) || 0));

  function kalla() {
    const K = window.VyraGavokatalog;
    if (K && typeof K.lista === 'function') {
      try { const l = K.lista(); if (Array.isArray(l) && l.length) return l; } catch (e) { console.error('[VyraKampanjGavoval]', e); }
    }
    return (window.VYRA_GIFTS || []).filter(g => g && g.name).map(g => ({ name: g.name, image: g.file, coins: 0 }));
  }
  // Listan som visas: bara gåvor med bild, en rad per namn, billigast först. Gåvor utan känt pris
  // (manifestet bär inget) hamnar sist, i bokstavsordning.
  function katalog() {
    const sedda = new Set();
    return kalla().filter(g => {
      const n = String(g && g.name || '').toLowerCase();
      if (!n || !g.image || sedda.has(n)) return false;
      sedda.add(n);
      return true;
    }).sort((a, b) => {
      const ca = Number(a.coins) || 0, cb = Number(b.coins) || 0;
      if (!ca !== !cb) return ca ? -1 : 1;
      return ca - cb || String(a.name).localeCompare(String(b.name), 'sv');
    });
  }
  const tusental = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const mynt = c => (Number(c) > 0 ? ' (' + tusental(Math.round(Number(c))) + ' coins)' : '');
  // En gåvobild som inte går att ladda. runtime-controls.js byter annars varje trasig bild mot
  // profil-silhuetten (test-profile.svg) — därav data-fallback-applied, och den här ikonen i stället.
  const GAVOIKON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="12" rx="2" fill="#b13cff"/><rect x="2" y="7" width="20" height="4" rx="1.5" fill="#d27bff"/><rect x="11" y="7" width="2" height="14" fill="#ffd76a"/><path d="M12 7c-2-4-6-4-6-1.5S10 7 12 7zm0 0c2-4 6-4 6-1.5S14 7 12 7z" fill="#ffd76a"/></svg>');
  const bild = (src, lat) => '<img' + (lat ? ' loading="lazy"' : '') + ' alt="" data-fallback-applied="1" data-gc-bild src="' + bildUrl(src) + '">';

  function slot(w, i) {
    const items = typeof window.VyraCampaignItems === 'function' ? window.VyraCampaignItems(w) : [];
    const it = items[i] || { name: w['giftName' + i] || '', image: w['giftImage' + i] || '', target: +w['giftTarget' + i] || 1 };
    // Katalogens pris går före det sparade: ett val gjort före 2026-10-21 kan bära ett inlärt
    // combo-värde (Rose = 5).
    const namn = String(w['giftMatch' + i] || it.name || '').toLowerCase();
    const hit = namn && kalla().find(g => String(g.name).toLowerCase() === namn && Number(g.coins) > 0);
    const coins = (hit && Number(hit.coins)) || Number(w['giftCoins' + i]) || 0;
    return { name: it.name, image: it.image, target: it.target, coins, gava: w['giftMatch' + i] || it.name };
  }

  function stil() {
    if (document.getElementById('vyra-kampanj-gavoval-stil')) return;
    const s = document.createElement('style');
    s.id = 'vyra-kampanj-gavoval-stil';
    s.textContent = [
      '.properties .gc-gavoval{display:grid;gap:10px;margin:4px 0 6px}',
      '.properties .gc-flikar{display:flex;flex-wrap:wrap;gap:6px}',
      '.properties .gc-gavoval button.gc-flik{min-width:44px!important;min-height:32px!important;padding:3px 9px!important;display:inline-flex;align-items:center;justify-content:center;gap:5px;border-radius:9px!important;font-weight:800}',
      '.properties .gc-gavoval button.gc-flik img{width:20px;height:20px;object-fit:contain;flex:0 0 auto}',
      '.properties .gc-gavoval button.gc-flik[aria-selected="true"]{background:linear-gradient(120deg,#b13cff,#7c4dff)!important;border-color:transparent!important;color:#fff!important;box-shadow:0 0 0 2px rgba(177,60,255,.35)}',
      '.properties .gc-gavoval button.gc-flik:focus-visible,.properties .gc-gavoval button.gc-valj:focus-visible,.properties .gc-lista button:focus-visible{outline:2px solid #ffd76a;outline-offset:2px}',
      '.properties .gc-flikpanel{display:grid;gap:8px;padding:10px;border:1px solid var(--line,#4b2b58);border-radius:10px;background:rgba(255,255,255,.02)}',
      '.properties .gc-flikpanel>.gc-rubrik{font-size:12px;font-weight:800;opacity:.85}',
      '.properties .gc-falt{display:grid;gap:4px;font-size:12px}',
      '.properties .gc-gavoval button.gc-valj{width:100%;display:flex!important;align-items:center;gap:8px;text-align:left;min-height:40px!important;padding:5px 10px!important}',
      '.properties .gc-valj img,.properties .gc-lista img{width:26px;height:26px;object-fit:contain;flex:0 0 auto}',
      '.properties .gc-valj span{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}',
      '.properties .gc-valj i{font-style:normal;opacity:.7}',
      '.properties .gc-lista{display:grid;gap:6px;padding:8px;border:1px solid var(--line,#4b2b58);border-radius:10px;background:#140b1b}',
      '.properties .gc-lista[hidden]{display:none}',
      '.properties .gc-lista input{width:100%}',
      '.properties .gc-lista [role="listbox"]{max-height:280px;overflow:auto;display:grid;gap:2px}',
      '.properties .gc-gavoval .gc-lista button{width:100%;display:flex!important;align-items:center;gap:8px;text-align:left;min-height:36px!important;padding:4px 8px!important;background:transparent!important;border-color:transparent!important;font-weight:600!important}',
      '.properties .gc-gavoval .gc-lista button:hover,.properties .gc-gavoval .gc-lista button[aria-selected="true"]{background:#2a1838!important}',
      '.properties .gc-lista small{opacity:.7;font-size:11px}',
    ].join('');
    (document.head || document.documentElement).append(s);
  }

  // Gåvorna i listan, filtrerade på sökordet.
  function rader(q, valdGava) {
    const alla = katalog();
    const s = String(q || '').trim().toLowerCase();
    const traff = s ? alla.filter(g => String(g.name).toLowerCase().includes(s)) : alla;
    const vg = String(valdGava || '').toLowerCase();
    const html = traff.slice(0, MAX_RADER).map(g => {
      const ar = String(g.name).toLowerCase() === vg;
      return '<button type="button" role="option" aria-selected="' + ar + '" data-gc-namn="' + text(g.name) + '">'
        + bild(g.image, true)
        + '<span>' + text(g.name) + text(mynt(g.coins)) + '</span></button>';
    }).join('');
    const mer = traff.length > MAX_RADER ? '<small>' + traff.length + ' gåvor — sök för att se fler.</small>' : '';
    const tom = traff.length ? '' : '<small>Ingen gåva heter så.</small>';
    return { html, mer: mer || tom, alla };
  }

  function html(w) {
    const n = antal(w), i = flikFor(w), s = slot(w, i);
    const flikar = Array.from({ length: n }, (_, j) => {
      const t = slot(w, j), ar = j === i;
      return '<button type="button" role="tab" class="gc-flik" data-gc-flik="' + j + '" aria-selected="' + ar + '" tabindex="' + (ar ? 0 : -1)
        + '" aria-controls="gcFlikPanel" aria-label="Gåva ' + (j + 1) + '" title="Gåva ' + (j + 1) + (t.name ? ': ' + text(t.name) : '') + '">'
        + (t.image ? bild(t.image) : '') + '<span>' + (j + 1) + '</span></button>';
    }).join('');
    return '<div class="gc-flikar" role="tablist" aria-label="Kampanjens gåvor">' + flikar + '</div>'
      + '<div class="gc-flikpanel" id="gcFlikPanel" role="tabpanel" aria-label="Gåva ' + (i + 1) + '">'
      + '<div class="gc-falt"><span class="gc-rubrik" id="gcGavaRubrik">Gåva</span>'
      + '<button type="button" class="gc-valj" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="gcGavaRubrik gcValtNamn">'
      + (s.image ? bild(s.image) : '') + '<span id="gcValtNamn">' + text(s.gava) + '</span><i>' + text(mynt(s.coins)) + '</i><b aria-hidden="true">▾</b></button>'
      + '<div class="gc-lista" hidden><input type="search" placeholder="Sök gåva …" aria-label="Sök gåva"><div role="listbox" aria-label="Gåvor"></div><small class="gc-mer"></small></div></div>'
      + '<label>Namn<input id="gcGavaNamn" value="' + text(s.name) + '"></label>'
      + '<label>Mål (st)<input id="gcGavaMal" type="number" min="1" value="' + (Math.max(1, Math.round(+s.target || 1))) + '"></label>'
      + '</div>';
  }

  // ---- props: elementet läggs i en dold grupp; ramen flyttar det till sektion 2 (legacyId) ----------
  const tidigareProps = props;
  props = function () {
    const ut = tidigareProps.apply(this, arguments);
    const w = vald();
    if (!harPost(w) || typeof ut !== 'string') return ut;
    return ut + '<div class="property-group gc-gavoval-grupp" hidden><div id="gcGavoflikar" class="gc-gavoval">' + html(w) + '</div></div>';
  };

  function ritaOm(rot, w, fokus) {
    // Fokus lämnas FÖRST. Ett ändrat Namn- eller Målfält skickar change när det tappar fokus, och den
    // ritar om hela panelen (vyraRenderKeepingPanel) — mitt i innerHTML hade det rivit noden under oss.
    const aktiv = document.activeElement;
    if (aktiv && rot.contains(aktiv) && typeof aktiv.blur === 'function') aktiv.blur();
    if (!rot.isConnected) rot = document.querySelector('.properties #gcGavoflikar');
    if (!rot) return;
    rot.innerHTML = html(w);
    koppla(rot, w);
    if (fokus) { const el = rot.querySelector(fokus); if (el) el.focus(); }
  }

  function koppla(rot, w) {
    // Varje koppling skriver om on-hanterarna, så flera bind() efter varandra är ofarliga.
    if (!rot) return;
    const i = flikFor(w);

    // Flikarna: klick väljer, piltangenter (och Home/End) flyttar mellan dem.
    const flikar = [...rot.querySelectorAll('.gc-flik')];
    const valj = (j, fokusera) => {
      valdFlik.set(w.id, j);
      ritaOm(rot, w, fokusera ? '.gc-flik[data-gc-flik="' + j + '"]' : null);
    };
    flikar.forEach(f => {
      f.onclick = () => valj(+f.dataset.gcFlik, true);
      f.onkeydown = e => {
        const j = +f.dataset.gcFlik, n = flikar.length;
        const ny = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (j + 1) % n
          : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (j - 1 + n) % n
            : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
        if (ny === null) return;
        e.preventDefault();
        valj(ny, true);
      };
    });

    // Namn och Mål: samma väg som panelens andra fält (vyraLivePatch medan man skriver, sparning vid change).
    const falt = (sel, nyckel, tal) => {
      const el = rot.querySelector(sel);
      if (!el) return;
      const las = () => tal ? Math.max(1, Math.round(+el.value || 1)) : el.value;
      el.oninput = () => { if (typeof vyraLivePatch === 'function') vyraLivePatch(w, el, nyckel, las()); else w[nyckel] = las(); };
      el.onchange = () => { w[nyckel] = las(); if (typeof save === 'function') save(); if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel(); else if (typeof render === 'function') render(); };
    };
    falt('#gcGavaNamn', 'giftName' + i, false);
    falt('#gcGavaMal', 'giftTarget' + i, true);

    // Rullgardinen.
    const knapp = rot.querySelector('.gc-valj'), lista = rot.querySelector('.gc-lista');
    if (!knapp || !lista) return;
    const sok = lista.querySelector('input'), box = lista.querySelector('[role="listbox"]'), mer = lista.querySelector('.gc-mer');
    const s = slot(w, i);
    let utanfor = null;
    const stang = tillKnapp => {
      lista.hidden = true;
      knapp.setAttribute('aria-expanded', 'false');
      if (utanfor) { document.removeEventListener('pointerdown', utanfor, true); utanfor = null; }
      if (tillKnapp) knapp.focus();
    };
    const fyll = () => {
      const r = rader(sok.value, s.gava);
      box.innerHTML = r.html;
      mer.textContent = '';
      mer.insertAdjacentHTML('afterbegin', r.mer);
      const alla = r.alla;
      box.querySelectorAll('[role="option"]').forEach(b => {
        b.onclick = () => {
          const g = alla.find(x => x.name === b.dataset.gcNamn);
          if (!g) return;
          w['giftName' + i] = g.name;
          w['giftMatch' + i] = g.name;
          if (g.image) w['giftImage' + i] = g.image;
          w['giftCoins' + i] = Number(g.coins) || 0;
          stang(false);
          if (typeof save === 'function') save();
          if (typeof render === 'function') render();
          const ny = document.querySelector('.properties #gcGavoflikar .gc-valj');
          if (ny) ny.focus();
          if (typeof toast === 'function') toast('Gåva ' + (i + 1) + ': ' + g.name);
        };
      });
    };
    const oppna = () => {
      lista.hidden = false;
      knapp.setAttribute('aria-expanded', 'true');
      if (window.VyraMolnGavor && typeof window.VyraMolnGavor.hamta === 'function') { try { window.VyraMolnGavor.hamta(); } catch (_) {} }
      sok.value = '';
      fyll();
      const markerad = box.querySelector('[aria-selected="true"]') || box.querySelector('[role="option"]');
      if (markerad && markerad.scrollIntoView) markerad.scrollIntoView({ block: 'nearest' });
      sok.focus();
      utanfor = e => { if (!rot.contains(e.target)) stang(false); };
      document.addEventListener('pointerdown', utanfor, true);
    };
    knapp.onclick = () => (lista.hidden ? oppna() : stang(true));
    knapp.onkeydown = e => { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && lista.hidden) { e.preventDefault(); oppna(); } };
    sok.oninput = fyll;
    lista.onkeydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); stang(true); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const opt = [...box.querySelectorAll('[role="option"]')];
      if (!opt.length) return;
      e.preventDefault();
      const nu = opt.indexOf(document.activeElement);
      const j = e.key === 'ArrowDown' ? Math.min(opt.length - 1, nu + 1) : nu <= 0 ? -1 : nu - 1;
      if (j < 0) sok.focus(); else opt[j].focus();
    };
  }

  // Trasiga gåvobilder i väljaren blir gåvoikonen (fångas i capture-fasen, error bubblar inte).
  if (typeof document !== 'undefined') document.addEventListener('error', e => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.hasAttribute('data-gc-bild') && img.getAttribute('src') !== GAVOIKON) img.setAttribute('src', GAVOIKON);
  }, true);

  const tidigareBind = bind;
  bind = function () {
    const ut = tidigareBind.apply(this, arguments);
    try {
      const w = vald();
      if (typeof view !== 'undefined' && view === 'editor' && harPost(w)) {
        stil();
        const rot = document.querySelector('.properties #gcGavoflikar');
        if (rot) koppla(rot, w);
      }
    } catch (e) { console.error('[VyraKampanjGavoval]', e); }
    return ut;
  };

  window.VyraKampanjGavoval = { valdFlik: id => valdFlik.get(id) || 0 };
})();
