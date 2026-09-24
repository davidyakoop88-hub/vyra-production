(function () {
  'use strict';

  // RANKING-SIXPACK · EN DESIGN, TRE DATAKÄLLOR (2026-09-24).
  //
  // Davids sex godkända prototyper (Voltage, Basic v2, Prism vertikal, Prism horisontal, Celestial,
  // Royal Rose) säger alla samma sak i sin underrubrik: "Samma design används till Top Like, Top
  // Coins och Top Points — bara symbolen och datakällan bakom siffran byts." Den första integrationen
  // (#518/#520) byggde i stället tre olika tolkningar ovanpå tre olika skelett, och mätt i riktig
  // Chromium stämde ingen av dem med prototypen:
  //   - Top Like ritade ring, glöd och vingram på `img::before/::after`. Ett <img> är ett ersatt
  //     element och får aldrig pseudoelement — INGEN av de sex ramarna syntes någonsin i Top Like.
  //   - Basic v2 och Prism saknade sina PNG-ramar helt (gold-crystal-crown, gold-ruby-wreath,
  //     gold-black-frame) och ersattes av en CSS-cirkel.
  //   - Top Coins var en ensam ledare, inte listan i prototypen.
  //   - Själva profilfotot färgcyklade (hue-rotate) — prototyperna cyklar bara ledlisten och ikonen.
  //
  // Därför EN renderare här, som alla tre familjerna går igenom när de bär en av de sex designerna,
  // med prototypens egen DOM: avatar-omslag med ram, glöd, rangmärke och krona som riktiga noder.
  //
  // KEDJAN BEVARAS. Wrappern anropar kedjan under sig och byter bara INNEHÅLLET i widgetens rotnod.
  // Rotens öppningstagg — data-id, position, dold/opacitet/lager, entréanimation, spegling,
  // tom-widget-döljningen — kommer oförändrad från kedjan. En override som inte anropar kedjan är
  // exakt den bugg approved-rankings.js dokumenterar för Clean Flip (dold widget syntes i overlay).
  //
  // LIVEDATAN HITTAR SAMMA SAKER SOM FÖRUT. live-leaderboard.js, live-zero-state.js,
  // vyra-tom-widget.js och media.js:s rankingcykel läser per `.toplike-row`: `strong` (namn),
  // `small` (handtag), `em` (värde) och `img:not(.pro-frame-art)` (foto). Allt det finns kvar, en
  // gång per rad. Ikonen ligger som <i> FÖRST i <em>, så skrivTal() skriver bara talet och låter
  // ikonen stå (live-leaderboard.js:s regel för Top Coins v2).

  const DESIGNS = Object.freeze({
    voltage: Object.freeze({ label: 'Voltage', riktning: 'lista',
      tiers: ['#FFD700', '#00f2ff', '#ff5e00', '#b24bf3', '#00ff88'].map(c => [c, c]) }),
    'basic-v2': Object.freeze({ label: 'Basic v2', riktning: 'lista', tiers: [['#ffd97a', '#d4af37']] }),
    'prism-vertical': Object.freeze({ label: 'Prism (vertikal)', riktning: 'lista',
      tiers: [['#ffa23c', '#ffe36a'], ['#3cbfff', '#ff7a3c'], ['#ff3ca0', '#3cffb0'], ['#8a5cff', '#3cffb0'],
        ['#c8ff3c', '#ffe36a'], ['#3cd9ff', '#ff7a3c'], ['#3c7bff', '#3cffe0'], ['#ff5c3c', '#8a3cff']] }),
    'prism-horizontal': Object.freeze({ label: 'Prism (horisontal)', riktning: 'podium',
      tiers: [['#ffa23c', '#ffe36a'], ['#3cbfff', '#ff7a3c'], ['#ff3ca0', '#3cffb0'], ['#8a5cff', '#3cffb0'], ['#c8ff3c', '#ffe36a']] }),
    celestial: Object.freeze({ label: 'Celestial', riktning: 'rad',
      tiers: [['#ffd54a', '#b98fff'], ['#6fb7ff', '#ffd54a'], ['#b98fff', '#6fb7ff'], ['#ffd54a', '#6fb7ff'], ['#6fb7ff', '#b98fff']] }),
    'royal-rose': Object.freeze({ label: 'Royal Rose', riktning: 'rad',
      tiers: [['#ffd54a', '#6fae6f'], ['#e8b7c4', '#ffd54a'], ['#6fae6f', '#e8b7c4'], ['#ffd54a', '#e8b7c4'], ['#6fae6f', '#ffd54a']] })
  });
  const IDS = Object.keys(DESIGNS);

  // En symbol per rankingtyp, ordagrant ur prototyperna: rött hjärta, guldmynt, lila stjärna.
  const IKONER = Object.freeze({
    templateTopLike: '<svg viewBox="0 0 24 24" fill="#ff4d6d" aria-hidden="true"><path d="M12 21s-7.5-4.6-10.2-9.1C.2 8.9 1.4 5 5 4.1c2.1-.5 4.1.4 5.4 2.2 1.3-1.8 3.3-2.7 5.4-2.2 3.6.9 4.8 4.8 3.2 7.8C19.5 16.4 12 21 12 21z"/></svg>',
    templateTopCoins: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffd54a" stroke="#c99a12" stroke-width="1.5"/><path d="M13.6 8.2a4 4 0 1 0 0 7.6" fill="none" stroke="#8a6300" stroke-width="2" stroke-linecap="round"/></svg>',
    templateTopPoints: '<svg viewBox="0 0 24 24" fill="#c9a8ff" aria-hidden="true"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.2l7.1-.6L12 2z"/></svg>'
  });
  const KRONA = '<svg viewBox="0 0 640 512" aria-hidden="true"><path d="M528 448H112a16 16 0 0 1 0-32h416a16 16 0 0 1 0 32zM571.31 199.36a32 32 0 0 0-35.16 6.94L457.94 285 396 187.63a48.16 48.16 0 0 0-81.06 1.05L256 285l-78.15-78.73a32 32 0 0 0-54.65 22.6L144 400h352l20.8-166.67a32 32 0 0 0-9.49-33.97z"/></svg>';
  // Prism horisontal: nummer 1 i mitten, sedan utåt — visuell ordning 4, 2, 1, 3, 5.
  const PODIUM = [3, 1, 0, 2, 4];
  const FAMILJER = ['templateTopLike', 'templateTopCoins', 'templateTopPoints'];

  // PENSIONERADE DESIGNER (2026-09-24, Davids beslut: "ta bort de gamla helt och hållet, att de
  // inte kommer tillbaka"). Top Likes fyra (Clean Bar, Soft Stack, Mini Podium, Side Rank) och Top
  // Points fyra (Lista, Tre i mitten, Podium, Neon) är borta ur katalogen och designväljarna. En
  // SPARAD widget med en av dem pekas här om till den nya design som ligger närmast i form — listor
  // blir Voltage, podier blir Prism horisontal — samma skyddsnät som topgift-pension.js: widgeten
  // muteras inte, renderaren får designen, och streamerns sparade värde står orört.
  //
  // Top Like och Top Points ritas därmed ALLTID som en av de sex. Det gäller även en widget utan
  // design alls, eller med något av de äldre skinn som redan tvingades till Clean Bar — de hade
  // annars kommit tillbaka precis som det gamla. Top Coins Halo/Signal Orbit berörs inte.
  const PENSION = Object.freeze({
    'clean-bar': 'voltage', 'soft-stack': 'voltage', 'side-rank': 'voltage', 'mini-podium': 'prism-horizontal',
    clean: 'voltage', neon: 'voltage', center: 'prism-horizontal', podium: 'prism-horizontal'
  });
  const FORVAL = 'voltage';

  function designFor(w) {
    if (!w || !FAMILJER.includes(w.type)) return null;
    if (w.type !== 'templateTopCoins') {
      // Egna fält först: toppoints-v2.js designId() faller tillbaka på 'clean' när inget matchar,
      // och det svaret säger inget om vad widgeten faktiskt bär.
      const falt = w.type === 'templateTopLike' ? [w.skin] : [w.topPointsDesign, w.skin, w.likeTheme];
      for (const f of falt) if (DESIGNS[f]) return f;
      for (const f of falt) if (PENSION[f]) return PENSION[f];
      return FORVAL;
    }
    // Samma uppslag som familjen själv gör — Top Points kan bära designen i topPointsDesign, skin
    // ELLER likeTheme (katalognyckeln sätter bara det sista), se toppoints-v2.js designId().
    const id = w.type === 'templateTopLike' ? w.skin
      : w.type === 'templateTopCoins' ? (window.VyraTopCoins?.designId?.(w) || w.topCoinsDesign || w.skin)
      : (window.VyraTopPoints?.designId?.(w) || w.topPointsDesign || w.skin || w.likeTheme);
    return DESIGNS[id] ? id : null;
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const iOverlay = () => typeof VYRA_OVERLAY !== 'undefined' ? !!VYRA_OVERLAY : new URLSearchParams(location.search).has('overlay');

  function antal(w) {
    // Top Coins v2 skapades som EN ledare (likeCount 1). Prototypen är samma lista som de andra två,
    // så en Top Coins i en av de sex designerna visar fem om inget annat valts.
    const n = w.type === 'templateTopCoins' && !(w.likeCount > 1) ? 5 : (w.likeCount || 5);
    return Math.max(1, Math.min(10, n));
  }

  function rader(w, id) {
    const d = DESIGNS[id];
    const demo = typeof topLikePeople !== 'undefined' && Array.isArray(topLikePeople) ? topLikePeople : [];
    // I OVERLAY RITAS NOLLÄGET DIREKT (samma regel som topcoins-v2.js): publiken ska aldrig se
    // påhittade personer, och live-zero-state.js nollar varje rad med ett demonamn genom att skriva
    // om hela <em> med textContent — det hade tagit ikonen. Livedatan fyller raderna via skrivTal().
    const nolla = iOverlay();
    const foto = esc((typeof VyraSafe !== 'undefined' && VyraSafe.url) ? VyraSafe.url(w.profileImage, 'assets/images/test-profile.svg') : (w.profileImage || 'assets/images/test-profile.svg'));
    const ikon = IKONER[w.type];
    const n = antal(w);
    // Panelens reglage (Bilder/Namn/Värde) och dra-text-förskjutningarna, precis som media.js:s
    // vyraTopLike ritar dem — en design får inte tysta ett reglage som finns i panelen.
    const dold = v => v === false ? 'display:none!important;' : '';
    const flytt = (x, y) => (x || y) ? `transform:translate(${Number(x) || 0}px,${Number(y) || 0}px);` : '';
    const avStil = dold(w.showProfile);
    const namnStil = dold(w.showDataName) + flytt(w.nameOffsetX, w.nameOffsetY);
    const vardeStil = dold(w.showDataValue) + flytt(w.valueOffsetX, w.valueOffsetY);
    let html = '';
    for (let i = 0; i < n; i++) {
      const [c, c2] = d.tiers[i % d.tiers.length];
      const person = demo[i] || ['', ''];
      const namn = nolla ? '' : esc(person[0]);
      const varde = nolla ? '0' : esc(person[1] || '0');
      const krona = (id === 'voltage' && i === 0) || (id === 'prism-horizontal' && i < 3) ? `<i class="rk6-krona">${KRONA}</i>` : '';
      const ordning = d.riktning === 'podium' ? PODIUM.indexOf(i) : i;
      html += `<div class="toplike-row rank-${i + 1}" style="--c:${c};--c2:${c2};--rk6-ordning:${ordning < 0 ? i : ordning};--rk6-fordrojning:${(ordning < 0 ? i : ordning) * 0.12}s">`
        + `<i class="rk6-av"${avStil ? ` style="${avStil}"` : ''}><i class="rk6-ring"></i><i class="rk6-karna"><i class="rk6-glod"></i>`
        + `<img src="${foto}" alt="">${krona}<b class="rk6-rang"><i>${i + 1}</i></b></i></i>`
        + `<span class="rk6-namn"${namnStil ? ` style="${namnStil}"` : ''}><strong>${namn}</strong><small></small><i class="rk6-led"></i></span>`
        + `<em${vardeStil ? ` style="${vardeStil}"` : ''}><i class="rk6-ikon">${ikon}</i> ${varde}</em>`
        + '</div>';
    }
    return html;
  }

  // Byter rotens innehåll och designklasser, men behåller allt annat i öppningstaggen.
  function omsluten(html, w, id) {
    const m = /^(\s*<div\b[^>]*>)([\s\S]*)<\/div>\s*$/.exec(html);
    if (!m) return html;
    let open = m[1];
    const handtag = (/<span class="resize-handle"[\s\S]*?<\/span>/.exec(m[2]) || [''])[0];
    open = open.replace(/class="([^"]*)"/, (_, cls) => {
      // Familjernas egna design-/skinnklasser bär var sin hög !important-regler
      // (toplike-studio.css ~180 st, topcoins-v2.css, toppoints-v2.css) som byggde om raderna till
      // tre olika saker. De sex designerna är EN design — de klasserna ska inte träffa noden alls.
      const kvar = cls.split(/\s+/).filter(k => k && !/^(skin-|like-|topcoins-|toppoints-|tc-|tp-|har-ram$|vyra-topcoins-new$|vyra-toppoints-new$)/.test(k));
      return `class="${kvar.join(' ')} rk6 rk6-${id}"`;
    });
    open = open.replace(/^(\s*<div\b)/, `$1 data-rk6="${id}"`);
    const tr = id === 'celestial' || id === 'royal-rose' ? '<i class="rk6-trad" aria-hidden="true"></i>' : '';
    const stoft = id === 'royal-rose' ? '<i class="rk6-stoft" aria-hidden="true"></i>' : '';
    return `${open}${stoft}<div class="rk6-lista">${tr}${rader(w, id)}</div>${handtag}</div>`;
  }

  // ---- Katalogen: en grupp per design, med Top Like / Top Coins / Top Points under ----
  const GRUPP_RUBRIK = 'RANKING · SAMMA DESIGN FÖR TOP LIKE, TOP COINS OCH TOP POINTS';
  const FAMILJ_KNAPPAR = [
    ['templateTopLike', 'Top Like', id => 'catalog:toplike:' + id],
    ['templateTopCoins', 'Top Coins', id => 'catalog:ranking:templateTopCoins:' + id],
    ['templateTopPoints', 'Top Points', id => 'catalog:ranking:templateTopPoints:' + id]
  ];

  function skapa(typ, id) {
    if (typ === 'templateTopLike') return window.VyraApprovedRankings?.createLike?.(id);
    if (typ === 'templateTopCoins') return window.VyraTopCoins?.create?.(id);
    return window.VyraTopPoints?.create?.(id);
  }

  function katalog() {
    const catalog = document.querySelector('.widget-catalog');
    if (!catalog) return;
    catalog.querySelectorAll('section[data-rk6-katalog]').forEach((el, i) => { if (i) el.remove() });
    // media.js:s "VYRA TOP RANKING"-sektion byggs varje bind, men topcoins-v2.js/toppoints-v2.js tar
    // bort alla dess knappar — kvar stod en tom rubrik. Döljs (tas inte bort: media.js bygger om den
    // så fort markören saknas).
    catalog.querySelectorAll('section[data-extra-rankings]').forEach(el => {
      if (!el.querySelector('button')) el.hidden = true;
    });
    if (catalog.querySelector('section[data-rk6-katalog]')) return;
    const section = document.createElement('section');
    section.dataset.rk6Katalog = '1';
    section.className = 'toplike-template-section rk6-katalog';
    section.innerHTML = `<h4>${GRUPP_RUBRIK}</h4>` + IDS.map(id =>
      `<div class="rk6-grupp" data-rk6-grupp="${id}"><h5>${esc(DESIGNS[id].label)}</h5>`
      + FAMILJ_KNAPPAR.map(([typ, namn, nyckel]) =>
        `<button type="button" data-rk6-skapa="${typ}" data-rk6-design="${id}" data-catalog-key="${nyckel(id)}"><i class="rk6-kort-ikon">${IKONER[typ]}</i><span><b>${namn}</b><small>${esc(DESIGNS[id].label)}</small></span></button>`).join('')
      + '</div>').join('');
    catalog.prepend(section);
    section.querySelectorAll('[data-rk6-skapa]').forEach(b => {
      b.onclick = () => skapa(b.dataset.rk6Skapa, b.dataset.rk6Design);
    });
  }

  let installerad = false;
  function install() {
    if (installerad || typeof wh !== 'function') return;
    installerad = true;
    const tidigareWh = wh;
    wh = function (w) {
      const html = tidigareWh(w);
      const id = designFor(w);
      return id ? omsluten(html, w, id) : html;
    };
    const tidigareBind = bind;
    bind = function () {
      tidigareBind();
      if (typeof view !== 'undefined' && (view === 'editor' || view === 'overlay')) katalog();
    };
    if (typeof render === 'function') render();
  }

  // Efter approved-rankings.js, som också installerar på `load`: lyssnarna körs i registrerings-
  // ordning, så den här wrappern hamnar ytterst och ser den färdiga roten.
  if (document.readyState === 'complete') install();
  else addEventListener('load', install, { once: true });

  window.VyraRankingSixpack = Object.freeze({ designs: DESIGNS, ids: IDS, pension: PENSION, designFor, render: omsluten, katalog });
})();
