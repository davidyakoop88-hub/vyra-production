// viewer-showcase.js — VIEWER SHOWCASE: lyft fram en tittare i liven (David 2026-11-07, sparad prototyp
// "Viewer Showcase"). En egen widgettyp, templateViewerShowcase, med tre kompositioner: Name Takeover,
// Halo Reveal och Spotlight Slide. Enkla runda profilbilder; konstiga ramar och generiska kort avvisades.
//
// TRIGGERN ÄR MANUELL. Streamern eller en moderator med redigeringsrätt väljer en tittare i panelen —
// ur listan över tittare som nyss varit aktiva i liven (chatt, likes, gåvor, följare, de som kommit in) eller
// genom att skriva ett namn. "Visa i OBS" skickar ett besked till POST /api/workspaces/:id/showcase; servern
// vitlistar fälten (namn, profilbild från TikToks bildvärdar, rubrik, budskap) och lägger det som ett eget
// SSE-meddelande på overlayns ström (`showcase`). Det är aldrig en livehändelse: inget räknas, sparas
// eller triggar Actions. Automatiska triggers (följare, team, milstolpar) är förslag, inte byggda.
//
// FIRANDET ÄR 8 SEKUNDER (valbart 6–15): ljusspår, profil, stort namn, budskap, diskreta gnistor, stilla
// fas och mjuk uttoning. Kommer en ny tittare under ett firande läggs den i kö (högst 5) och visas efter en
// kort paus, så att presentationerna aldrig krockar. Långa namn får mindre text och kan brytas på två rader.
//
// I OBS syns widgeten bara under ett firande. I studion visas en stillbild med exempelprofilen.
(function () {
  'use strict';
  if (typeof wh !== 'function' || window.VyraViewerShowcase) return;

  const TYP = 'templateViewerShowcase';
  const OVERLAY = (() => { try { return document.documentElement.classList.contains('overlay-output') || new URLSearchParams(location.search).has('overlay'); } catch (_) { return false; } })();
  const DESIGNER = [
    ['takeover', 'Name Takeover', 'Stora bokstäver bredvid den runda profilen'],
    ['halo', 'Halo Reveal', 'Profilen i ljusets mitt, namnet under'],
    ['spotlight', 'Spotlight Slide', 'Profilen till höger, texten till vänster']
  ];
  const DESIGN = Object.fromEntries(DESIGNER.map(d => [d[0], { id: d[0], namn: d[1], text: d[2] }]));
  const RUBRIKER = ['VÄLKOMMEN', 'TACK FÖR STÖDET', 'KVÄLLENS GÄST', 'VECKANS TITTARE'];
  const BAS_B = 300, PAUS_MS = 1500, MAX_KO = 5, MAX_TITTARE = 30;
  const EXEMPELBILD = 'assets/images/test-profile.svg';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const klamp = (v, min, max, f) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : f; };
  const rensa = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  const design = w => DESIGN[w && w.vsDesign] ? w.vsDesign : 'takeover';
  const sek = w => klamp(w && w.vsSek, 6, 15, 8);
  const rubrikFor = w => rensa(w && w.vsRubrik != null ? w.vsRubrik : 'VÄLKOMMEN', 30);
  const budskapFor = w => rensa(w && w.vsMeddelande != null ? w.vsMeddelande : 'Kul att du är här!', 100);

  // ---------- ren logik (provas utan DOM i tests/viewer-showcase.test.js) ----------
  function namnKlass(namn) { const l = Array.from(String(namn || '')).length; return l <= 8 ? 'vs-n1' : l <= 13 ? 'vs-n2' : l <= 20 ? 'vs-n3' : 'vs-n4'; }
  function initialer(namn) { const t = Array.from(String(namn || '').replace(/^@/, '').trim()); return (t.slice(0, 2).join('') || '?').toLocaleUpperCase('sv'); }
  function sakerBild(s) {
    const v = String(s || '');
    try { if (window.VyraSafe && typeof window.VyraSafe.src === 'function') return window.VyraSafe.src(v, '') || ''; } catch (_) {}
    return /^(https:\/\/|assets\/)/.test(v) ? v : '';
  }
  // En tittare ur en livehändelse. På chatt bär `name` kommentaren, så där gäller bara nickname/användarnamn.
  function tittareAv(e) {
    if (!e || typeof e !== 'object' || e.__test || e.test || e.isTest) return null;
    const anv = rensa(e.username || e.uniqueId, 60);
    if (!anv) return null;
    const typ = String(e.type || '').toLowerCase();
    const namn = rensa(e.nickname || e.displayName || (typ !== 'chat' && typ !== 'chatcommand' ? e.name : '') || anv, 40) || anv;
    return { anv, namn, bild: String(e.profileImage || e.profileUrl || ''), typ, at: Date.now() };
  }
  function person(w, p) {
    const namn = rensa(p && p.namn, 40);
    if (!namn) return null;
    return { namn, avatar: String(p.avatar || ''), rubrik: rensa(p.rubrik != null && p.rubrik !== '' ? p.rubrik : rubrikFor(w), 30),
      meddelande: rensa(p.meddelande != null ? p.meddelande : budskapFor(w), 100) };
  }

  // ---------- läget per widget i den här fliken ----------
  const SPEL = new Map();   // id → { nu: {person, start}, ko: [], timer }
  const till = id => { let s = SPEL.get(String(id)); if (!s) { s = { nu: null, ko: [], timer: 0 }; SPEL.set(String(id), s); } return s; };
  const widgetar = () => { try { return (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets.filter(w => w && w.type === TYP) : []; } catch (_) { return []; } };
  const hitta = id => widgetar().find(w => String(w.id) === String(id)) || null;
  const ritaOm = () => { try { if (typeof render === 'function') render(); } catch (_) {} };

  function spela(w, p) {
    const pp = person(w, p);
    if (!w || !pp) return 'ogiltig';
    const s = till(w.id);
    if (s.nu) { if (s.ko.length >= MAX_KO) return 'kon-full'; s.ko.push(pp); return 'ko'; }
    starta(w, pp);
    return 'spelar';
  }
  function starta(w, pp) {
    const s = till(w.id);
    clearTimeout(s.timer);
    s.nu = { person: pp, start: Date.now(), sek: sek(w) };
    s.timer = setTimeout(() => {
      s.nu = null; ritaOm();
      s.timer = setTimeout(() => { const nasta = s.ko.shift(); const lw = hitta(w.id); if (nasta && lw && !lw.hidden) starta(lw, nasta); }, PAUS_MS);
    }, s.nu.sek * 1000);
    ritaOm();
  }
  function stoppa(id) { const s = till(id); clearTimeout(s.timer); s.nu = null; s.ko = []; ritaOm(); }

  // ---------- render ----------
  const GNISTOR = Array.from({ length: 15 }, (_, i) => `<i style="--x:${8 + (i * 37) % 84}%;--y:${12 + (i * 23) % 65}%;--d:${(i * 0.045).toFixed(3)}s;--dx:${(i % 2 ? 1 : -1) * (8 + i)}px"></i>`).join('');
  function kortHtml(d, p) {
    const bild = sakerBild(p.avatar);
    const avatar = bild ? `<img src="${esc(bild)}" alt="" draggable="false">` : esc(initialer(p.namn));
    return `<div class="vs-kort"><div class="vs-avatar">${avatar}</div><div class="vs-ord"><div class="vs-rubrik">${esc(p.rubrik)}</div>`
      + `<div class="vs-namn ${namnKlass(p.namn)}" title="${esc(p.namn)}">${esc(p.namn)}</div><div class="vs-budskap">${esc(p.meddelande)}</div></div>`
      + `<div class="vs-spar"></div><div class="vs-gnistor" aria-hidden="true">${GNISTOR}</div></div>`;
  }
  const exempel = w => ({ namn: 'Tittare', avatar: EXEMPELBILD, rubrik: rubrikFor(w), meddelande: budskapFor(w) });

  const oldWh = wh;
  wh = function (w) {
    if (!w || w.type !== TYP) return oldWh(w);
    const d = design(w), s = SPEL.get(String(w.id)), nu = s && s.nu;
    const p = nu ? nu.person : exempel(w);
    const valt = !OVERLAY && typeof selected !== 'undefined' && selected === w.id;
    const skala = (klamp(w.width, 150, 900, BAS_B) / BAS_B) * klamp(w.widgetScale, 0.1, 5, 1);
    const off = nu ? -((Date.now() - nu.start) / 1000) : 0;
    return `<div class="widget vyra-showcase vs-${d}${OVERLAY ? '' : ' vs-studio'}${nu ? ' vs-spelar' : ''}${valt ? ' selected' : ''}" data-id="${esc(w.id)}" `
      + `style="left:${Number(w.x) || 0}px;top:${Number(w.y) || 0}px;width:${BAS_B}px;zoom:${skala.toFixed(3)};z-index:${Number(w.layer) || 1};--vs-dur:${nu ? nu.sek : sek(w)}s;--vs-off:${off.toFixed(2)}s">`
      + kortHtml(d, p) + (valt ? '<span class="resize-handle">↘</span>' : '') + '</div>';
  };

  // ---------- tittarna som nyss varit aktiva (bara studion) ----------
  const TITTARE = [];
  function minns(e) {
    const t = tittareAv(e);
    if (!t) return;
    const i = TITTARE.findIndex(x => x.anv === t.anv);
    if (i >= 0) { const gammal = TITTARE.splice(i, 1)[0]; if (!t.bild) t.bild = gammal.bild; }
    TITTARE.unshift(t);
    if (TITTARE.length > MAX_TITTARE) TITTARE.length = MAX_TITTARE;
    const lista = document.querySelector('.vs-tittare');
    if (lista) lista.innerHTML = tittareHtml();
  }
  const TYPNAMN = { chat: 'chatt', like: 'like', likes: 'like', gift: 'gåva', follow: 'följare', member: 'kom in', share: 'delning' };
  let valdTittare = null;
  function tittareHtml() {
    if (!TITTARE.length) return '<span class="vs-tom">Ingen har varit aktiv i liven ännu. Skriv ett namn nedan, eller vänta tills tittarna chattar, gillar eller skickar gåvor.</span>';
    return TITTARE.map((t, i) => {
      const bild = sakerBild(t.bild);
      return `<button type="button" data-vs-tittare="${i}"${valdTittare === t.anv ? ' class="vald"' : ''}>${bild ? `<img src="${esc(bild)}" alt="">` : `<span class="vs-ini">${esc(initialer(t.namn))}</span>`}`
        + `<span>${esc(t.namn)}</span><small>${esc(TYPNAMN[t.typ] || t.typ)}</small></button>`;
    }).join('');
  }
  if (!OVERLAY) window.addEventListener('vyra-live-event', ev => { try { minns(ev && ev.detail); } catch (_) {} });

  // ---------- OBS: beskedet från servern ----------
  const SPELADE = new Set();
  window.addEventListener('vyra-showcase-overlay', ev => {
    if (!OVERLAY) return;
    const d = ev && ev.detail;
    if (!d || typeof d !== 'object') return;
    if (d.spelId) { if (SPELADE.has(d.spelId)) return; SPELADE.add(d.spelId); if (SPELADE.size > 200) SPELADE.clear(); }
    const w = hitta(d.widgetId);
    if (!w || w.hidden) return;
    spela(w, { namn: d.namn, avatar: d.avatar, rubrik: d.rubrik, meddelande: d.meddelande });
  });

  // ---------- studion: visa i OBS ----------
  function arbetsyta() { try { return window.VyraAuth && window.VyraAuth.lastDetail && window.VyraAuth.lastDetail().workspaces[0].id || null; } catch (_) { return null; } }
  async function visaIObs(w, p) {
    const pp = person(w, p);
    if (!pp) return { ok: false, fel: 'namn' };
    const lokalt = spela(w, pp);
    const id = arbetsyta();
    if (!id || !window.VyraAuth || typeof window.VyraAuth.api !== 'function') return { ok: false, fel: 'inte-inloggad', lokalt };
    const spelId = 'vs' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try {
      const r = await window.VyraAuth.api(`/api/workspaces/${id}/showcase`, { method: 'POST',
        body: JSON.stringify({ widgetId: String(w.id), spelId, namn: pp.namn, avatar: pp.avatar, rubrik: pp.rubrik, meddelande: pp.meddelande }) });
      return Object.assign({ lokalt }, r || { ok: false });
    } catch (e) { return { ok: false, fel: String(e && e.message || e), lokalt }; }
  }

  // ---------- panelen ----------
  const optioner = (lista, valt) => lista.map(v => `<option value="${esc(v[0])}"${v[0] === valt ? ' selected' : ''}>${esc(v[1])}</option>`).join('');
  const oldProps = props;
  props = function () {
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return oldProps();
    const d = DESIGN[design(w)], s = SPEL.get(String(w.id));
    const ko = s ? s.ko.length : 0;
    return `<h3>VIEWER SHOWCASE</h3><div class="template-badge">LYFT FRAM EN TITTARE · LIVE</div><div hidden><input id="pt" value="Viewer Showcase"><input id="pv" value=""></div>`
      + `<div class="property-group"><h4>VISA EN TITTARE</h4><small>Tittare som nyss varit aktiva i liven. Välj en, eller skriv ett namn.</small>`
      + `<div class="vs-tittare">${tittareHtml()}</div>`
      + `<label>Namn<input id="vsNamn" maxlength="40" placeholder="Tittarens namn"></label>`
      + `<button type="button" id="vsVisa">▶ Visa i OBS</button> <button type="button" id="vsTesta">Testa här</button> <button type="button" id="vsStopp">■ Stoppa</button>`
      + `<small id="vsStatus">${ko ? ko + ' i kö' : 'Firandet visas i ' + sek(w) + ' sekunder. Nästa tittare väntar i kö.'}</small></div>`
      + `<div class="property-group"><h4>DESIGN</h4><label>Komposition<select id="vsDesign">${optioner(DESIGNER, d.id)}</select></label><small>${esc(d.text)}.</small></div>`
      + `<div class="property-group"><h4>TEXT</h4><label>Rubrik<input id="vsRubrik" maxlength="30" list="vsRubriker" value="${esc(rubrikFor(w))}"></label><datalist id="vsRubriker">${RUBRIKER.map(r => `<option value="${esc(r)}">`).join('')}</datalist>`
      + `<label>Budskap<input id="vsMeddelande" maxlength="100" value="${esc(budskapFor(w))}"></label>`
      + `<label>Visningstid (sekunder)<input id="vsSek" type="number" min="6" max="15" value="${sek(w)}"></label></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid"><label>X<input id="propX" type="number" value="${Number(w.x) || 0}"></label><label>Y<input id="propY" type="number" value="${Number(w.y) || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${klamp(w.width, 150, 900, BAS_B)}"></label><label>Lager<input id="propLayer" type="number" value="${Number(w.layer) || 1}"></label></div></div>`
      + `<button class="delete" id="del">Ta bort</button>`;
  };

  // ---------- katalogen ----------
  function katalog() {
    const cat = document.querySelector('.widget-catalog');
    if (!cat || cat.querySelector('[data-vs-skapa]')) return;
    const sek = document.createElement('section');
    sek.className = 'vs-katalog';
    sek.innerHTML = '<h4>VIEWER SHOWCASE</h4>';
    DESIGNER.forEach(([id, namn, text]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.vsSkapa = id; b.dataset.catalogKey = 'catalog:vyrapaket:showcase:' + id;
      // Ingen egen bild: Overlay-galleriet ritar widgeten själv med fabrikens standardvärden.
      b.innerHTML = `<span><b>${esc(namn)}</b><small>${esc(text)}</small></span>`;
      b.onclick = () => {
        if (!window.VyraWidgets || typeof state === 'undefined') return;
        const w = window.VyraWidgets.create('catalog:vyrapaket:showcase:' + id);
        state.widgets.push(w); selected = w.id;
        if (typeof save === 'function') save(); ritaOm();
        if (typeof toast === 'function') toast('Viewer Showcase · ' + namn + ' tillagd');
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
    const q = s => document.querySelector(s);
    const satt = (falt, v, om = true) => { w[falt] = v; if (typeof save === 'function') save(); if (om) ritaOm(); };
    const status = t => { const el = q('#vsStatus'); if (el) el.textContent = t; };
    let el;
    if ((el = q('#vsDesign'))) el.onchange = e => satt('vsDesign', DESIGN[e.target.value] ? e.target.value : 'takeover');
    if ((el = q('#vsRubrik'))) el.onchange = e => satt('vsRubrik', rensa(e.target.value, 30));
    if ((el = q('#vsMeddelande'))) el.onchange = e => satt('vsMeddelande', rensa(e.target.value, 100));
    if ((el = q('#vsSek'))) el.onchange = e => satt('vsSek', klamp(Math.round(+e.target.value), 6, 15, 8), false);
    const lista = q('.vs-tittare');
    if (lista) lista.onclick = e => {
      const b = e.target.closest('[data-vs-tittare]'); if (!b) return;
      const t = TITTARE[+b.dataset.vsTittare]; if (!t) return;
      valdTittare = t.anv; lista.innerHTML = tittareHtml();
      const namn = q('#vsNamn'); if (namn) namn.value = t.namn;
    };
    const vald = () => {
      const namn = rensa((q('#vsNamn') || {}).value, 40);
      const t = TITTARE.find(x => x.anv === valdTittare);
      return t && t.namn === namn ? { namn, avatar: t.bild } : (namn ? { namn, avatar: '' } : null);
    };
    if ((el = q('#vsVisa'))) el.onclick = async () => {
      const p = vald(); if (!p) { status('Välj en tittare eller skriv ett namn först.'); return; }
      status('Skickar till OBS …');
      const r = await visaIObs(w, p);
      status(r.ok ? (r.lokalt === 'ko' ? p.namn + ' står i kö och visas i OBS efter pågående firande.' : p.namn + ' visas nu i OBS.')
        : r.fel === 'inte-inloggad' ? 'Visas här i studion. Logga in för att visa i OBS.' : 'OBS kunde inte nås just nu — försök igen.');
    };
    if ((el = q('#vsTesta'))) el.onclick = () => { const p = vald() || exempel(w); const r = spela(w, p); status(r === 'ko' ? 'Står i kö här i studion.' : 'Spelas här i studion. OBS påverkas inte.'); };
    if ((el = q('#vsStopp'))) el.onclick = () => { stoppa(w.id); status('Stoppad här i studion.'); };
  };

  window.VyraViewerShowcase = Object.freeze({ typ: TYP, DESIGNER, RUBRIKER, namnKlass, initialer, tittareAv, person, spela, stoppa, visaIObs, MAX_KO, PAUS_MS, _spel: SPEL, _tittare: TITTARE });
  ritaOm();
})();
