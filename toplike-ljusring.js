(function () {
  'use strict';

  // TOP LIKE · NEONRAMAR (skin 'ljusring', katalognyckel catalog:toplike:ljusring).
  // Byggd tillsammans med David på lekplatsen 2026-11-10 (G:\widget-lekplats) och flyttad hit "som den är":
  // hans 18 utklippta neonramar + 3 enkla ramar i kod, 12 fyrkantiga modeller, fem lägen (pall, liggande,
  // stående, vänster och höger sida), namnstilar, glans, levande ram, lutning/vridning och synliga omkörningar.
  //
  // TVÅ LAGER I SAMMA ROT.
  //   .tln-data  dolda, vanliga Top Like-rader (.toplike-row med strong/small/em/img). Det är DEM
  //              live-leaderboard.js, live-zero-state.js och vyra-tom-widget.js skriver i och läser,
  //              precis som i de andra designerna — livedatan, nollningen och tom-döljningen följer med.
  //   .tl        det synliga: ramar, namn och siffror. Egna klassnamn, så att toplike-studio.css och
  //              profile-frames-premium.css (hundratals `.vyra-toplike .toplike-row ... !important`) inte
  //              når dem. synka() kopierar datalagret hit och spelar omkörningen när ordningen ändras.
  //
  // KEDJAN BEVARAS. Wrappern (rang 3.5, utanför ranking-sixpack.js och spellayout.js, innanför vyra-bildrad.js) anropar kedjan och byter bara rotens
  // INNEHÅLL; öppningstaggen (data-id, position, dold/opacitet, lager, entré) kommer från kedjan.
  if (window.VyraTopLikeLjusring) return;

  const SKIN = 'ljusring';
  // 3.5, inte 3: spellayout.js har rang 3 och lindar bara in sig om den yttersta har lägre rang (CI 2026-11-11:
  // med samma rang ritades Gaming overlay inte alls). Därför laddas filen också efter spellayout.js.
  const RANG = 3.5;
  const BAS = 'assets/images/toplike-ljusring/';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const iOverlay = () => typeof VYRA_OVERLAY !== 'undefined' ? !!VYRA_OVERLAY : new URLSearchParams(location.search).has('overlay');

  // Tabellerna (ramar, lägen, modeller, typsnitt, standardvärden) och panelposten ligger i
  // toplike-ljusring-panel.js, som laddas tidigt. Utan den ritas ingenting.
  const T = window.VyraTopLikeLjusringTabeller;
  if (!T) { console.error('[VYRA] Neonramar: toplike-ljusring-panel.js saknas'); return; }
  const { RAMAR, LAGEN, FYRMODELLER, NAMNSTILAR, TYPSNITT, IKONER, STANDARD } = T;
  const ramFor = w => RAMAR[w && w.tlnRam] ? w.tlnRam : 'bla';
  const ritaGolv = k => RAMAR[k].kod ? `<div class="tl-enkel-golv enkel-${k}"></div>`
    : `<img class="tl-ram tl-ram-golv pro-frame-art" src="${BAS}ram-${RAMAR[k].n}-golv.png" alt="" draggable="false">`;
  const ritaRing = k => RAMAR[k].kod ? `<div class="tl-ram tl-ram-ring tl-enkel enkel-${k}"><i></i></div>`
    : `<img class="tl-ram tl-ram-ring pro-frame-art" src="${BAS}ram-${RAMAR[k].n}-ring.png" alt="" draggable="false">`;

  const falt = (w, k) => (w && w[k] !== undefined && w[k] !== null && w[k] !== '') ? w[k] : STANDARD[k];
  const val = (w, k, lista) => Object.prototype.hasOwnProperty.call(lista, falt(w, k)) ? falt(w, k) : STANDARD[k];
  const tal = (w, k, min, max) => { const v = Number(falt(w, k)); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : STANDARD[k]; };
  const farg = (w, k) => /^#[0-9a-f]{3,8}$/i.test(String(falt(w, k))) ? falt(w, k) : '';
  const antal = w => Math.max(1, Math.min(5, Math.round(Number(w && w.likeCount) || 3)));

  // Google-typsnitten laddas först när de väljs (studion laddar redan Inter/Manrope därifrån).
  const laddade = new Set();
  function laddaTypsnitt(k) {
    const q = TYPSNITT[k] && TYPSNITT[k][2];
    if (!q || laddade.has(q) || typeof document === 'undefined') return;
    laddade.add(q);
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + q + '&display=swap';
    document.head.append(l);
  }

  // ▶ Testa widget spelar en klon med `__provlista` ([{ namn, varde, bild }]); se ranking-sixpack.js provlista.
  const provlista = w => Array.isArray(w && w.__provlista) && w.__provlista.length ? w.__provlista : null;

  // ---------- innehållet ----------
  function innehall(w) {
    const n = antal(w), ram = ramFor(w), prov = provlista(w), nolla = iOverlay() && !prov;
    const demo = typeof topLikePeople !== 'undefined' && Array.isArray(topLikePeople) ? topLikePeople : [];
    const reserv = (typeof window.vyraReservbild === 'function' ? window.vyraReservbild(w.profileImage) : w.profileImage) || 'assets/images/test-profile.svg';
    const foto = esc(typeof VyraSafe !== 'undefined' && VyraSafe.url ? VyraSafe.url(reserv, 'assets/images/test-profile.svg') : reserv);
    const lage = val(w, 'tlnLage', LAGEN), form = falt(w, 'tlnForm') === 'fyrkant' ? 'fyrkant' : 'rund';
    const fyr = val(w, 'tlnFyr', FYRMODELLER), levande = ['av', 'ljus', 'snurra'].includes(falt(w, 'tlnLevande')) ? falt(w, 'tlnLevande') : 'ljus';
    const glans = ['av', 'glans', 'svep'].includes(falt(w, 'tlnGlans')) ? falt(w, 'tlnGlans') : 'glans';
    const typsnitt = val(w, 'tlnTypsnitt', TYPSNITT); laddaTypsnitt(typsnitt);
    const ikon = IKONER.includes(falt(w, 'tlnIkon')) ? falt(w, 'tlnIkon') : '❤';
    const skala = Number(w.widgetScale) > 0 ? Number(w.widgetScale) : 1;
    const extra = falt(w, 'tlnTextVaxer') !== false && skala < 1 ? Math.min(1.8, 1 / Math.sqrt(skala)) : 1;
    const f = RAMAR[ram].farg, band = RAMAR[ram].band, hoger = lage === 'hoger' ? -1 : 1;
    const inset = ((1 - Math.min(.95, band[0] + .03)) * 50).toFixed(2) + '%';
    const stil = [`--tl-farg:${f}`, `--tl-inset:${inset}`, `--tl-band-i:${band[0]}`, `--tl-band-y:${band[1]}`,
      `--tl-font:${TYPSNITT[typsnitt][1]}`, `--tl-zoom:${(tal(w, 'tlnTextStorlek', 60, 160) / 100 * extra).toFixed(3)}`,
      `--tl-namnfarg:${farg(w, 'tlnNamnFarg') || '#fff'}`, `--tl-antalfarg:${farg(w, 'tlnAntalFarg') || f}`,
      `--tl-lut:${hoger * tal(w, 'tlnLut', -45, 45)}deg`, `--tl-vrid:${hoger * tal(w, 'tlnVrid', -30, 30)}deg`].join(';');
    const klasser = ['tl', 'lage-' + lage, 'antal-' + (n >= 5 ? 5 : n <= 3 ? 3 : n), 'namnstil-' + val(w, 'tlnNamnstil', NAMNSTILAR), 'glans-' + glans,
      'vrid-ring', 'levande-' + levande, w.showDataName === false ? 'utan-namn' : '', w.showProfile === false ? 'utan-bild' : '',
      w.showDataValue === false ? 'utan-varde' : '', w.showRank === false ? 'utan-plats' : '', 'form-' + form, 'fyr-' + fyr, falt(w, 'tlnPlatta') === true ? 'platta' : ''].filter(Boolean).join(' ');
    const rubrik = w.showTitle === false ? '' : (() => {
      const ord = esc(String(w.templateTitle || 'TOP LIKE').trim() || 'TOP LIKE').split(/\s+/), sista = ord.pop();
      return `<div class="tl-rubrik">${ord.length ? ord.join(' ') + ' ' : ''}<span>${sista}</span></div>`;
    })();
    let data = '', syns = '';
    for (let i = 0; i < n; i++) {
      const p = prov ? prov[i] : null;
      if (prov && !p) break;
      const person = demo[i] || ['', ''];
      const namn = p ? esc(p.namn) : nolla ? '' : esc(person[0]);
      const varde = p ? esc(p.varde) : nolla ? '0' : esc(person[1] || '0');
      const plats = t => !p && nolla && t ? ` data-noll-plats="${esc(t)}"` : '';
      const bild = p && p.bild ? esc(p.bild) : foto;
      // Datalagret: exakt de byggstenar live-leaderboard.js skriver i (strong, small, em, första bilden).
      data += `<div class="toplike-row" data-rad="${i}"${p ? ` data-prov="${namn}"` : ''}><b>${i + 1}</b><img src="${bild}" alt="">`
        + `<span><strong${plats(person[0])}>${namn}</strong><small></small></span><em${plats(person[1])}><i></i>${varde}</em></div>`;
      // Det tomma <i> först i <em>: live-leaderboard.js skrivTal() skriver då BARA talet i textnoden efter det
      // (utan <i> tolkas första ordet som ikon och talet hamnar efter det: "0 110").
      const ringar = form === 'fyrkant'
        ? `<div class="tl-fyr"><i></i><i></i><i></i><i></i>${[[0, 0], [100, 0], [0, 100], [100, 100]].map(([x, y]) => `<b style="left:${x}%;top:${y}%"></b>`).join('')}</div>`
          + (levande === 'ljus' && fyr !== 'regnbage' ? '<div class="tl-fyr-ljus"></div>' : '')
        : ritaRing(ram) + (levande === 'ljus' ? '<div class="tl-ljus"></div>' : '');
      syns += `<div class="tl-plats p${i + 1}" data-rad="${i}"><div class="tl-ring">${form === 'fyrkant' ? '<div class="tl-fyr-golv"></div>' : ritaGolv(ram)}`
        + `<div class="tl-vrid"><div class="tl-bild"><img class="tln-foto" src="${bild}" alt="" draggable="false"></div>${ringar}</div>`
        + `<div class="tl-placering">${i + 1}</div></div><div class="tl-text"><div class="tl-namn">${namn}</div>`
        + `<div class="tl-antal" data-ikon="${esc(ikon)}">${varde}</div></div></div>`;
    }
    return `<div class="tln-data rk6-lista" aria-hidden="true">${data}</div><div class="${klasser}" style="${stil}">${rubrik}<div class="tl-lista">${syns}</div></div>`;
  }

  // Byter rotens innehåll men behåller öppningstaggen från kedjan (se ranking-sixpack.js omsluten).
  function omslut(html, w) {
    const m = /^(\s*<div\b[^>]*>)([\s\S]*)<\/div>\s*$/.exec(html);
    if (!m) return html;
    let open = m[1];
    const handtag = (/<span class="resize-handle"[\s\S]*?<\/span>/.exec(m[2]) || [''])[0];
    open = open.replace(/class="([^"]*)"/, (_, cls) =>
      `class="${cls.split(/\s+/).filter(k => k && !/^(skin-|like-|rk6|har-ram$|ranking-bg-off$)/.test(k)).join(' ')} tln"`);
    open = open.replace(/\sdata-rk6="[^"]*"/, '');
    // Zoomen: widgetens egen skala (ranking-sixpack.js skriver sin läsbarhetszoom för Voltage, den gäller inte här).
    open = open.replace(/style="([^"]*)"/, (_, st) => {
      const utan = st.replace(/(^|;)\s*(?:zoom|--rk6-[\w-]+|--ram-[\w-]+):[^;]*;?/g, '$1');
      return `style="${utan}${utan && !/;\s*$/.test(utan) ? ';' : ''}zoom:${Number(w.widgetScale) > 0 ? Number(w.widgetScale) : 1}"`;
    });
    return `${open}${innehall(w)}${handtag}</div>`;
  }

  // ---------- synk: datalagret -> det synliga, plus omkörningen ----------
  function synka(rot, animera) {
    const tl = rot.querySelector(':scope > .tl');
    if (!tl) return;
    const rader = [...rot.querySelectorAll(':scope > .tln-data > .toplike-row')];
    const platser = [...tl.querySelectorAll('.tl-plats')];
    const fore = platser.map(p => p.getBoundingClientRect());
    const ordning = [];
    rader.forEach((rad, i) => {
      const p = platser[i];
      if (!p) return;
      const dold = rad.style.getPropertyValue('display') === 'none';
      p.style.display = dold ? 'none' : '';
      const strong = rad.querySelector('strong'), em = rad.querySelector('em'), img = rad.querySelector('img');
      const namn = strong ? strong.textContent : '', varde = em ? em.textContent.trim() : '';
      const n = p.querySelector('.tl-namn'), a = p.querySelector('.tl-antal'), f = p.querySelector('.tln-foto');
      if (n && n.textContent !== namn) { n.textContent = namn; n.classList.remove('tva-rader'); n.style.removeProperty('font-size'); }
      if (n) { const np = strong && strong.getAttribute('data-noll-plats'); if (np) n.setAttribute('data-noll-plats', np); else n.removeAttribute('data-noll-plats'); }
      if (a && a.textContent !== varde) a.textContent = varde;
      if (f && img && img.getAttribute('src') && f.getAttribute('src') !== img.getAttribute('src')) f.setAttribute('src', img.getAttribute('src'));
      ordning.push(dold ? '' : namn);
    });
    passaNamn(tl);
    const forra = rot.__tlnOrdning;
    rot.__tlnOrdning = ordning;
    if (!animera || !forra || forra.join('\n') === ordning.join('\n')) return;
    ordning.forEach((namn, i) => {
      if (!namn) return;
      const p = platser[i], j = forra.indexOf(namn);
      if (j === i) return;
      if (j < 0) { p.classList.remove('ny-in'); void p.offsetWidth; p.classList.add('ny-in'); return; }
      const fran = fore[j], till = fore[i], k = p.offsetWidth / (till.width || 1);
      const dx = (fran.left - till.left) * k, dy = (fran.top - till.top) * k, sk = fran.width / (till.width || 1);
      if (typeof p.animate === 'function') p.animate([{ transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sk})` }, { transformOrigin: '0 0', transform: 'none' }],
        { duration: 950, easing: 'cubic-bezier(.25, 1.25, .35, 1)' });
      if (j > i) {
        p.classList.remove('klattrar'); void p.offsetWidth; p.classList.add('klattrar');
        setTimeout(() => p.classList.remove('klattrar'), 1500);
        const pil = document.createElement('div'); pil.className = 'tl-pil'; pil.textContent = '▲ ' + (j - i);
        p.querySelector('.tl-ring').append(pil); setTimeout(() => pil.remove(), 2300);
      }
    });
    if (ordning[0] && forra[0] && ordning[0] !== forra[0]) {
      const b = document.createElement('div'); b.className = 'tl-banderoll';
      b.innerHTML = `<b>👑 NY ETTA!</b><span>${esc(ordning[0])}</span>`;
      tl.append(b); setTimeout(() => b.remove(), 3300);
    }
  }
  // Långa TikTok-namn krymps tills de får plats (ner till 55 %, 45 % i topp 5), annars två rader.
  function passaNamn(tl) {
    const golv = tl.classList.contains('antal-5') ? .45 : .55;
    tl.querySelectorAll('.tl-namn').forEach(n => {
      if (!n.isConnected || n.clientWidth === 0) return;
      n.classList.remove('tva-rader'); n.style.removeProperty('font-size');
      const start = parseFloat(getComputedStyle(n).fontSize); let f = start;
      while (n.scrollWidth > n.clientWidth && f > start * golv) { f -= 1; n.style.setProperty('font-size', f + 'px', 'important'); }
      if (n.scrollWidth > n.clientWidth) n.classList.add('tva-rader');
    });
  }
  // Livedatan skriver i datalagret i sin egen takt; synken körs en gång per bildruta efter en ändring.
  const vantar = new Set();
  function bevaka() {
    if (typeof MutationObserver !== 'function' || typeof document === 'undefined' || !document.body) return;
    new MutationObserver(lista => {
      for (const m of lista) {
        const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (!t || !t.closest) continue;
        const rot = t.closest('.widget.tln');
        if (rot) {
          const nyRot = m.type === 'childList' && [...m.addedNodes].some(x => x === rot || (x.contains && x.contains(rot)));
          if (!vantar.has(rot)) { vantar.add(rot); rot.__tlnAnimera = !nyRot && rot.__tlnOrdning !== undefined; }
        } else if (m.type === 'childList') {
          m.addedNodes.forEach(x => { if (x.nodeType === 1) (x.matches && x.matches('.widget.tln') ? [x] : x.querySelectorAll ? [...x.querySelectorAll('.widget.tln')] : []).forEach(r => { vantar.add(r); r.__tlnAnimera = false; }); });
        }
      }
      if (vantar.size) (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(() => {
        vantar.forEach(r => { if (r.isConnected) synka(r, r.__tlnAnimera); }); vantar.clear();
      });
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['src', 'style'] });
  }

  // ---------- wh-omslaget (rang 3.5) ----------
  const djup = { wh: 0 };
  function install(sent) {
    if (typeof wh !== 'function' || wh.__vyraYtter >= RANG) return;
    const tidigare = wh;
    const f = function (w) {
      if (djup.wh) return tidigare.apply(this, arguments);
      djup.wh++;
      try {
        const html = tidigare.apply(this, arguments);
        return w && w.type === 'templateTopLike' && w.skin === SKIN ? omslut(html, w) : html;
      } finally { djup.wh--; }
    };
    f.__vyraYtter = RANG;
    wh = f;
    if (sent) { if (typeof window.VyraRitaSnart === 'function') window.VyraRitaSnart(); }
    else { try { if (typeof render === 'function') render(); } catch (e) {} }
  }

  // ---------- katalogen ----------
  // Ett eget kort i rankinggruppen (ranking-sixpack.js bygger sektionen). Skapas via approved-rankings.js
  // createLike, som alla Top Like-designer.
  function katalog() {
    const sec = document.querySelector('.widget-catalog section[data-rk6-katalog]');
    // ranking-sixpack.js bygger sektionen i SIN bind, som ligger utanför vår och körs efter den: finns den inte
    // än försöker vi igen så fort bind-passet är klart.
    if (!sec) { if (document.querySelector('.widget-catalog') && !katalog.vantar) { katalog.vantar = true; setTimeout(() => { katalog.vantar = false; katalog(); }, 0); } return; }
    if (sec.querySelector('[data-rk6-grupp="' + SKIN + '"]')) return;
    const g = document.createElement('div');
    g.className = 'rk6-grupp'; g.dataset.rk6Grupp = SKIN;
    g.innerHTML = '<h5>Neonramar</h5><button type="button" data-tln-skapa="1" data-catalog-key="catalog:toplike:' + SKIN + '">'
      + '<i class="rk6-kort-ikon">❤</i><span><b>Top Like</b><small>Neonramar · 21 ramar, 5 lägen</small></span></button>';
    sec.append(g);
    g.querySelector('[data-tln-skapa]').onclick = () => window.VyraApprovedRankings?.createLike?.(SKIN);
  }
  function installBind() {
    if (typeof bind !== 'function' || bind.__tlnKatalog) return;
    const tidigare = bind;
    const f = function () { tidigare.apply(this, arguments); try { if (typeof view !== 'undefined' && (view === 'editor' || view === 'overlay')) katalog(); } catch (e) {} };
    f.__tlnKatalog = true;
    if (tidigare.__vyraYtter) f.__vyraYtter = tidigare.__vyraYtter;
    bind = f;
  }

  window.VyraTopLikeLjusring = Object.freeze({ SKIN, RAMAR, LAGEN, FYRMODELLER, NAMNSTILAR, TYPSNITT, STANDARD, innehall, omslut, synka, antal });

  install();
  installBind();
  bevaka();
  document.addEventListener('load', e => { if (e.target && e.target.tagName === 'SCRIPT') { install(true); installBind(); } }, true);
  addEventListener('load', () => { install(); installBind(); }, { once: true });
})();
