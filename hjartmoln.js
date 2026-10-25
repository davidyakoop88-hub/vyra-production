// hjartmoln.js — HJÄRTAN & MOLN: transparenta hjärt- och molneffekter som spelas när tittarna gör
// något i liven (Davids animationspaket "Hjartan-Moln-Alla-Animationer", 2026-10-25). En egen
// widgettyp, templateHeartCloud.
//
// KLIPPEN ÄR TRANSPARENTA WEBM. Originalen (VP9 med alfa, 720×1280, 30 fps, 12 s) är omkodade till
// assets/videos/hjartmoln/<id>.webm med bibehållen alfa (CRF 44: glödmolnet 10,6 → 4,0 MB vid 41 dB
// PSNR på det som syns). Varje klipp loopar utan skarv — sista rutan ligger lika nära den första som
// två grannrutor (uppmätt, se tests/hjartmoln.test.js). MP4-filerna i paketet var bara förhandsvisningar
// och ligger inte här. Bredvid varje klipp ligger en transparent WebP-affisch (ruta 180) som studion
// visar i vila.
//
// SAMMA KÄLLA SOM LIKE FOUNTAIN OCH TOP LIKE: `vyra-live-event` från live-client.js ingest(). Ett
// event äldre än FARSKT_MS i serverns tid är historik (live-leaderboard.js spelar upp kvällens events
// vid laddning) och ignoreras, precis som i like-fountain-portal.js. Ett event som passar widgetens
// läge (likes, gåvor, följare …) håller effekten igång i hmHall sekunder efter senaste eventet; sedan
// tonas den bort och videon pausas, så att den inte avkodar i onödan.
//
// PROFILHJÄRTAN BYGGS AV RIKTIGA TITTARE. Paketets profilhjärtan var en film med fyra påhittade
// ansikten — de får aldrig synas som tittare. Här är varianten det organiska molnet (transparent WebM)
// med ett DOM-lager ovanpå: varje tittare som tappar och HAR en profilbild faller som ett hjärtformat
// porträtt ur molnet, med samma bana som originalet (2,75 s, fyra spår). Utan profilbild blir det
// inget porträtt alls. Samma lager kan slås på för alla varianter (hmProfiler).
//
// VIDEON ÖVERLEVER RENDER. Overlayn ritar om widgetarna ofta, och en <video> i wh()-markupen hade
// börjat om från noll varje gång. Varje widget har därför EN videonod i minnet som flyttas in i den
// nya lådan synkront i render() (innan webbläsaren hinner pausa en nod som lämnat dokumentet), med en
// MutationObserver som reserv för livepatchar som byter en enskild låda.
(function () {
  'use strict';
  if (typeof wh !== 'function' || window.VyraHjartMoln) return;

  const TYP = 'templateHeartCloud';
  const OVERLAY = new URLSearchParams(location.search).has('overlay');
  const MAPP = 'assets/videos/hjartmoln/';
  const FARSKT_MS = 15000;
  const UTTONING_MS = 800;
  const DUK_B = 432, FORMAT = 16 / 9;

  // id, namn, kort beskrivning, klipp (fil utan .webm), med i galleriet
  const VARIANTER = [
    ['profilhjartan', 'Profilhjärtan', 'Tittarnas profilbilder faller som hjärtan ur molnet', 'organiskt', true],
    ['fallande', 'Fallande hjärtan', 'Molnet släpper glesa, rena hjärtan', 'fallande', true],
    ['hjartmoln', 'Hjärtmoln', 'Molnet med små glittrande hjärtan', 'hjartmoln', true],
    ['glodande', 'Glödande hjärtmoln', 'Molnet släpper glödande ljusbubblor', 'glodande', true],
    ['kristall', 'Kristallhjärtan', 'Kristallhjärtan i flera färger', 'kristall', true],
    ['stjarnstoft', 'Stjärnstoft', 'Fint stjärnstoft och små hjärtan', 'stjarnstoft', true],
    ['blixt', 'Blixtmoln', 'Kristallhjärtan med blixtar i molnet', 'blixt', true],
    ['organiskt', 'Organiskt moln', 'Mjukt moln med en lätt hjärtskur', 'organiskt', true],
    ['levande', 'Levande moln', 'Molnet med en tät hjärtskur', 'levande', true],
    ['stora-hjartan', 'Stora hjärtan', 'Större hjärtan i pastell', 'stora-hjartan', false],
    ['formad-glod', 'Formad glöd', 'Glittrande hjärtregn', 'formad-glod', false],
    ['livfullt', 'Livfullt moln', 'Liten, livlig hjärtskur', 'livfullt', false],
    ['naturligt-regn', 'Naturligt hjärtregn', 'Glest hjärtregn med naturligt fall', 'naturligt-regn', false],
    ['regn-utan-bubblor', 'Hjärtregn utan bubblor', 'Glest hjärtregn utan bubblor', 'regn-utan-bubblor', false]
  ];
  const VARIANT = Object.fromEntries(VARIANTER.map(v => [v[0], { id: v[0], namn: v[1], text: v[2], klipp: v[3], galleri: v[4] }]));

  // Läget avgör vilka händelser som startar effekten. Slagen är overlay-aktivering.js slag().
  const LAGEN = [
    ['likes', 'När tittarna tappar (likes)', ['like']],
    ['gavor', 'När någon skickar en gåva', ['gift']],
    ['likes-gavor', 'Vid likes och gåvor', ['like', 'gift']],
    ['foljare', 'När någon börjar följa', ['follow']],
    ['alltid', 'Hela tiden (loopar)', []]
  ];
  const LAGE = Object.fromEntries(LAGEN.map(l => [l[0], { id: l[0], namn: l[1], slag: l[2] }]));

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const klamp = (v, min, max, f) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : f; };
  const variant = w => VARIANT[w && w.hmVariant] || VARIANT.hjartmoln;
  const lage = w => LAGE[w && w.hmLage] || LAGE.likes;
  const klippUrl = w => MAPP + variant(w).klipp + '.webm';
  const affischUrl = w => MAPP + variant(w).klipp + '.webp';
  const hall = w => klamp(w.hmHall, 2, 60, 8);
  const profiler = w => w.hmProfiler === undefined ? variant(w).id === 'profilhjartan' : !!w.hmProfiler;

  // ---------- ren logik (provas utan DOM i tests/hjartmoln.test.js) ----------
  function slag(e) {
    const t = String((e && (e.type || e.event)) || '').toLowerCase().replace(/[\s_-]/g, '');
    if (t === 'like' || t === 'likes') return 'like';
    if (t === 'gift' || t === 'giftcombo') return 'gift';
    if (t === 'follow') return 'follow';
    return t;
  }
  function serverNu() {
    try { const n = Number(window.VyraLive && window.VyraLive.serverNu && window.VyraLive.serverNu()); if (n > 0) return n; } catch (_) {}
    return Date.now();
  }
  function arFarsk(e, nu) {
    if (!e) return false;
    const at = Number(e.at || (e.timestamp && Date.parse(e.timestamp)));
    return !(Number.isFinite(at) && at > 0 && (nu || serverNu()) - at > FARSKT_MS);
  }
  // Ska den här händelsen starta just den här widgeten?
  function triggar(w, e, nu) {
    if (!w || w.type !== TYP || !arFarsk(e, nu)) return false;
    const k = slag(e), l = lage(w);
    if (l.id === 'alltid') return false;           // loopar redan; händelser ger bara profilhjärtan
    if (!l.slag.includes(k)) return false;
    if (k === 'like') {
      const antal = Number(e.count || e.likeCount || e.value || 1) || 1;
      if (antal < klamp(w.hmMinLikes, 1, 1000, 1)) return false;
    }
    return true;
  }

  // ---------- läget per widget i den här fliken ----------
  const LIVE = new Map();            // id → { video, lager, aktivTill, spelar, senast:{namn:ms}, spar }
  const till = id => { let t = LIVE.get(id); if (!t) { t = { video: null, lager: null, aktivTill: 0, spelar: false, senast: {}, spar: 0, slutar: 0 }; LIVE.set(id, t); } return t; };
  const widgetar = () => { try { return (typeof state !== 'undefined' && state && Array.isArray(state.widgets)) ? state.widgets.filter(w => w && w.type === TYP) : []; } catch (_) { return []; } };
  const rotFor = id => document.querySelector(`.vyra-hjartmoln[data-id="${String(id).replace(/["\\]/g, '\\$&')}"]`);
  const sakerSrc = s => { try { return window.VyraSafe && window.VyraSafe.src ? window.VyraSafe.src(s, '') : (/^(https?:|data:image\/|assets\/)/.test(String(s || '')) ? String(s) : ''); } catch (_) { return ''; } };

  function videoFor(w) {
    const t = till(w.id), url = klippUrl(w);
    if (!t.video) {
      const v = document.createElement('video');
      v.className = 'hm-video'; v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
      v.disablePictureInPicture = true; v.preload = OVERLAY ? 'auto' : 'none';
      t.video = v;
    }
    if (t.video.dataset.src !== url) { t.video.dataset.src = url; t.video.src = url; }
    return t.video;
  }
  function lagerFor(w) {
    const t = till(w.id);
    if (!t.lager) { t.lager = document.createElement('div'); t.lager.className = 'hm-profiler'; t.lager.setAttribute('aria-hidden', 'true'); }
    return t.lager;
  }

  // Flyttar widgetens videonod och profillager in i den aktuella lådan. Synkront efter render().
  function koppla() {
    document.querySelectorAll('.vyra-hjartmoln[data-id]').forEach(rot => {
      const w = widgetar().find(x => String(x.id) === rot.dataset.id);
      if (!w) return;
      const vard = rot.querySelector('.hm-vard');
      if (!vard) return;
      const t = till(w.id);
      // I studion skapas videon först när den behövs (Testa eller en riktig händelse).
      if (OVERLAY || t.video || arAktiv(w, t)) { const v = videoFor(w); if (v.parentNode !== vard) vard.prepend(v); }
      const l = lagerFor(w); if (l.parentNode !== vard) vard.append(l);
      v_satt(rot, w, t);
    });
  }
  function v_satt(rot, w, t) {
    const pa = arAktiv(w, t);
    rot.classList.toggle('hm-pa', pa);
    if (t.video) {
      t.video.playbackRate = klamp(w.hmHastighet, 0.5, 2, 1);
      if (pa && t.video.paused) { const p = t.video.play(); if (p && p.catch) p.catch(() => {}); }
    }
  }
  const arAktiv = (w, t, nu = Date.now()) => !(OVERLAY && w.hidden) && (lage(w).id === 'alltid' || nu < t.aktivTill);

  // Tickern: startar, tonar ut och pausar. Pausen kommer UTTONING_MS efter att klassen tagits bort.
  function tick() {
    if (typeof document === 'undefined' || !document || !document.querySelector) return;   // fönstret är stängt
    const nu = Date.now();
    widgetar().forEach(w => {
      const t = till(w.id), rot = rotFor(w.id);
      if (!rot) return;
      const pa = arAktiv(w, t, nu);
      if (pa) {
        if (!t.video) koppla();
        v_satt(rot, w, t);
        t.slutar = 0;
      } else if (rot.classList.contains('hm-pa')) {
        rot.classList.remove('hm-pa'); t.slutar = nu + UTTONING_MS;
      } else if (t.slutar && nu >= t.slutar && t.video) {
        t.slutar = 0;
        try { t.video.pause(); t.video.currentTime = 0; } catch (_) {}
      }
    });
  }
  const tickare = setInterval(() => { try { tick(); } catch (_) { clearInterval(tickare); } }, 120);

  // ---------- profilhjärtan ----------
  // Originalets bana i 720×1280: spåren x 150/560/290/435, y 270 → 595 på 2,75 s, porträtt 84 px.
  const SPAR = [150, 560, 290, 435];
  const MAX_SAMTIDIGT = 6;
  function profilhjarta(w, e, prov) {
    const src = sakerSrc(e && (e.profileImage || e.profileUrl || e.avatar));
    if (!src) return false;
    const t = till(w.id), namn = String((e && (e.username || e.uniqueId || e.name)) || src), nu = Date.now();
    if (!prov && t.senast[namn] > nu - 2500) return false;
    const l = lagerFor(w);
    if (l.childElementCount >= MAX_SAMTIDIGT) return false;
    t.senast[namn] = nu;
    const nycklar = Object.keys(t.senast); if (nycklar.length > 80) delete t.senast[nycklar[0]];
    const spar = SPAR[t.spar++ % SPAR.length];
    const el = document.createElement('div');
    el.className = 'hm-ph';
    el.style.left = (spar / 720 * 100).toFixed(2) + '%';
    el.style.setProperty('--hm-vagg', ((t.spar % 2 ? 1 : -1) * 16 / 720 * 100).toFixed(2) + 'cqw');
    const bild = document.createElement('img');
    bild.alt = ''; bild.decoding = 'async'; bild.referrerPolicy = 'no-referrer'; bild.src = src;
    bild.onerror = () => el.remove();
    el.append(bild, document.createElement('i'));
    l.append(el);
    setTimeout(() => el.remove(), 2900);
    return true;
  }

  // ---------- kopplingen till liven ----------
  function hantera(e, nu) {
    widgetar().forEach(w => {
      if (OVERLAY && w.hidden) return;
      const t = till(w.id);
      if (triggar(w, e, nu)) {
        t.aktivTill = Math.max(t.aktivTill, Date.now() + hall(w) * 1000);
        if (profiler(w)) profilhjarta(w, e);
        tick();
      } else if (lage(w).id === 'alltid' && profiler(w) && slag(e) === 'like' && arFarsk(e, nu)) {
        profilhjarta(w, e);
      }
    });
  }
  window.addEventListener('vyra-live-event', ev => { try { hantera(ev && ev.detail); } catch (err) { console.warn('[VYRA] Hjärtan & moln', err); } });

  // ▶ Testa här: spelar i DEN HÄR fliken, aldrig i OBS. Porträttet är testbilden (en tecknad siluett),
  // inte ett påhittat ansikte, och det finns bara i studion.
  function testa(w) {
    const t = till(w.id);
    t.aktivTill = Date.now() + hall(w) * 1000;
    koppla(); tick();
    if (profiler(w)) [0, 700, 1400].forEach((ms, i) => setTimeout(() => profilhjarta(w, { username: 'test' + i, profileImage: 'assets/images/test-profile.svg' }, true), ms));
  }

  // ---------- render ----------
  const oldWh = wh;
  wh = function (w) {
    if (!w || w.type !== TYP) return oldWh(w);
    const bredd = klamp(w.width, 120, 1080, DUK_B), hojd = Math.round(bredd * FORMAT);
    const valt = typeof selected !== 'undefined' && selected === w.id;
    const t = LIVE.get(w.id), pa = !!t && arAktiv(w, t);
    return `<div class="widget vyra-hjartmoln${OVERLAY ? '' : ' hm-studio'}${pa ? ' hm-pa' : ''}${w.hmSpegla ? ' hm-spegla' : ''}${valt ? ' selected' : ''}" data-id="${esc(w.id)}" `
      + `style="left:${Number(w.x) || 0}px;top:${Number(w.y) || 0}px;width:${bredd}px;height:${hojd}px;zoom:${klamp(w.widgetScale, 0.1, 5, 1)};--hm-opacitet:${klamp(w.hmOpacitet, 10, 100, 100) / 100}">`
      + (OVERLAY ? '' : `<img class="hm-affisch" src="${esc(affischUrl(w))}" alt="" draggable="false">`)
      + `<div class="hm-vard"></div>`
      + (OVERLAY ? '' : `<span class="hm-chip">${esc(variant(w).namn)} · ${esc(lage(w).id === 'alltid' ? 'loopar hela tiden' : lage(w).namn.toLowerCase())}</span>`)
      + (valt ? '<span class="resize-handle">↘</span>' : '') + '</div>';
  };

  const oldRender = render;
  render = function () {
    const ut = oldRender.apply(this, arguments);
    try { koppla(); } catch (err) { console.warn('[VYRA] Hjärtan & moln: koppla', err); }
    return ut;
  };
  // Reserv: en livepatch som byter en enskild låda går förbi render().
  try {
    new MutationObserver(lista => {
      for (const m of lista) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && (n.matches?.('.vyra-hjartmoln') || n.querySelector?.('.vyra-hjartmoln'))) { koppla(); return; }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  // ---------- panelen ----------
  const optioner = (lista, valt) => lista.map(v => `<option value="${v[0]}"${v[0] === valt ? ' selected' : ''}>${esc(v[1])}</option>`).join('');
  const oldProps = props;
  props = function () {
    const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
    if (!w || w.type !== TYP) return oldProps();
    const v = variant(w), l = lage(w);
    const galleri = VARIANTER.filter(x => x[4]), fler = VARIANTER.filter(x => !x[4]);
    return `<h3>HJÄRTAN & MOLN</h3><div class="template-badge">TRANSPARENT EFFEKT · LIVE</div><div hidden><input id="pt" value="Hjärtan & moln"><input id="pv" value=""></div>`
      + `<div class="property-group hm-panel"><h4>EFFEKT</h4><img class="hm-panelbild" src="${esc(affischUrl(w))}" alt="">`
      + `<label>Effekt<select id="hmVariant"><optgroup label="Galleriet">${optioner(galleri, v.id)}</optgroup><optgroup label="Fler varianter">${optioner(fler, v.id)}</optgroup></select></label>`
      + `<small>${esc(v.text)}.</small></div>`
      + `<div class="property-group"><h4>NÄR SKA DEN SPELAS?</h4><label>Starta<select id="hmLage">${optioner(LAGEN, l.id)}</select></label>`
      + (l.slag.includes('like') ? `<label>Minsta antal likes per paket<input id="hmMinLikes" type="number" min="1" max="1000" value="${klamp(w.hmMinLikes, 1, 1000, 1)}"></label>` : '')
      + (l.id === 'alltid' ? '<small>Effekten syns i OBS hela tiden och loopar utan skarv.</small>'
        : `<label>Fortsätt i sekunder efter senaste händelsen<input id="hmHall" type="number" min="2" max="60" value="${hall(w)}"></label><small>Varje ny händelse förlänger effekten. När det blir tyst tonas den bort.</small>`)
      + `</div>`
      + `<div class="property-group"><h4>PROFILHJÄRTAN</h4><label><input id="hmProfiler" type="checkbox"${profiler(w) ? ' checked' : ''}> Visa tittarnas profilbilder som hjärtan</label>`
      + `<small>Bara riktiga tittare med profilbild. Utan bild blir det inget porträtt.</small></div>`
      + `<div class="property-group"><h4>UTSEENDE</h4><label>Synlighet <span class="hm-varde">${klamp(w.hmOpacitet, 10, 100, 100)}%</span><input id="hmOpacitet" type="range" min="10" max="100" value="${klamp(w.hmOpacitet, 10, 100, 100)}"></label>`
      + `<label>Hastighet<select id="hmHastighet">${optioner([['0.75', 'Lugn (0,75×)'], ['1', 'Normal'], ['1.25', 'Snabb (1,25×)']], String(klamp(w.hmHastighet, 0.5, 2, 1)))}</select></label>`
      + `<label><input id="hmSpegla" type="checkbox"${w.hmSpegla ? ' checked' : ''}> Spegla vågrätt</label></div>`
      + `<div class="property-group"><h4>TESTA</h4><button type="button" id="hmTesta">▶ Testa här</button><small>Spelar effekten här i studion. OBS-länken påverkas inte.</small></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><button type="button" id="hmHelskarm">Fyll hela skärmen</button><div class="property-grid"><label>X<input id="propX" type="number" value="${w.x || 0}"></label><label>Y<input id="propY" type="number" value="${w.y || 0}"></label><label>Bredd<input id="propWidth" type="number" value="${w.width || DUK_B}"></label><label>Lager<input id="propLayer" type="number" value="${w.layer || 1}"></label></div></div><button class="delete" id="del">Ta bort</button>`;
  };

  // ---------- katalogen ----------
  function katalog() {
    const cat = document.querySelector('.widget-catalog');
    if (!cat || cat.querySelector('[data-hm-skapa]')) return;
    const sek = document.createElement('section');
    sek.className = 'hm-katalog';
    sek.innerHTML = '<h4>HJÄRTAN & MOLN</h4>';
    VARIANTER.filter(v => v[4]).forEach(([id, namn, text, klipp]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.hmSkapa = id; b.dataset.catalogKey = 'catalog:heartcloud:' + id;
      b.innerHTML = `<img class="hm-katalogbild" src="${MAPP}${klipp}.webp" alt="" loading="lazy"><span><b>${esc(namn)}</b><small>${esc(text)}</small></span>`;
      b.onclick = () => {
        if (!window.VyraWidgets || typeof state === 'undefined') return;
        const w = window.VyraWidgets.create('catalog:heartcloud:' + id);
        state.widgets.push(w); selected = w.id;
        if (typeof save === 'function') save(); if (typeof render === 'function') render();
        if (typeof toast === 'function') toast(namn + ' tillagd');
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
    const pa = (id, ev, fn) => { const el = document.querySelector(id); if (el) el[ev] = fn; };
    const satt = (falt, v, ritaOm = true) => { w[falt] = v; if (typeof save === 'function') save(); if (ritaOm && typeof render === 'function') render(); };
    pa('#hmVariant', 'onchange', e => {
      const ny = VARIANT[e.target.value] ? e.target.value : 'hjartmoln';
      // Profilhjärtan följer med varianten tills streamern själv valt.
      if (w.hmProfilerSjalv !== true) w.hmProfiler = ny === 'profilhjartan';
      satt('hmVariant', ny);
    });
    pa('#hmLage', 'onchange', e => satt('hmLage', LAGE[e.target.value] ? e.target.value : 'likes'));
    pa('#hmMinLikes', 'onchange', e => satt('hmMinLikes', klamp(Math.round(+e.target.value), 1, 1000, 1), false));
    pa('#hmHall', 'onchange', e => satt('hmHall', klamp(Math.round(+e.target.value), 2, 60, 8), false));
    pa('#hmProfiler', 'onchange', e => { w.hmProfilerSjalv = true; satt('hmProfiler', e.target.checked, false); });
    pa('#hmOpacitet', 'oninput', e => {
      const v = klamp(Math.round(+e.target.value), 10, 100, 100);
      const etikett = document.querySelector('.hm-varde'); if (etikett) etikett.textContent = v + '%';
      const rot = rotFor(w.id); if (rot) rot.style.setProperty('--hm-opacitet', v / 100);
      satt('hmOpacitet', v, false);
    });
    pa('#hmHastighet', 'onchange', e => satt('hmHastighet', klamp(+e.target.value, 0.5, 2, 1)));
    pa('#hmSpegla', 'onchange', e => satt('hmSpegla', e.target.checked));
    pa('#hmTesta', 'onclick', () => testa(w));
    pa('#hmHelskarm', 'onclick', () => { Object.assign(w, { x: 0, y: 0, width: DUK_B }); if (typeof save === 'function') save(); if (typeof render === 'function') render(); });
  };

  window.VyraHjartMoln = Object.freeze({ typ: TYP, VARIANTER, LAGEN, slag, arFarsk, triggar, klippUrl, affischUrl, profiler, testa, FARSKT_MS, MAPP, _live: LIVE });
  try { if (typeof render === 'function') render(); } catch (_) {}
})();
