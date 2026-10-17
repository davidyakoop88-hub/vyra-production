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

  // EN MYNTSYMBOL I HELA FAMILJEN. Före fanns tre: guldmyntet här (sex designer), ett "V" i en
  // guldcirkel (Halo, Signal Orbit) och "◉" (Top Gift). Guldmyntet vinner: det är det vanligaste
  // (sex av åtta Top Coins-designer) och det enda som ser ut som ett mynt även i 12 px — "V" läses
  // som VYRA:s logga och "◉" som en radioknapp. topcoins-v2.js och Top Gift hämtar det härifrån.
  const MYNT = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffd54a" stroke="#c99a12" stroke-width="1.5"/><path d="M13.6 8.2a4 4 0 1 0 0 7.6" fill="none" stroke="#8a6300" stroke-width="2" stroke-linecap="round"/></svg>';

  // En symbol per rankingtyp, ordagrant ur prototyperna: rött hjärta, guldmynt, lila stjärna.
  const IKONER = Object.freeze({
    templateTopLike: '<svg viewBox="0 0 24 24" fill="#ff4d6d" aria-hidden="true"><path d="M12 21s-7.5-4.6-10.2-9.1C.2 8.9 1.4 5 5 4.1c2.1-.5 4.1.4 5.4 2.2 1.3-1.8 3.3-2.7 5.4-2.2 3.6.9 4.8 4.8 3.2 7.8C19.5 16.4 12 21 12 21z"/></svg>',
    templateTopCoins: MYNT,
    templateTopPoints: '<svg viewBox="0 0 24 24" fill="#c9a8ff" aria-hidden="true"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.2l7.1-.6L12 2z"/></svg>'
  });
  const KRONA = '<svg viewBox="0 0 640 512" aria-hidden="true"><path d="M528 448H112a16 16 0 0 1 0-32h416a16 16 0 0 1 0 32zM571.31 199.36a32 32 0 0 0-35.16 6.94L457.94 285 396 187.63a48.16 48.16 0 0 0-81.06 1.05L256 285l-78.15-78.73a32 32 0 0 0-54.65 22.6L144 400h352l20.8-166.67a32 32 0 0 0-9.49-33.97z"/></svg>';
  // Prism horisontal: nummer 1 i mitten, sedan utåt — visuell ordning 4, 2, 1, 3, 5.
  const PODIUM = [3, 1, 0, 2, 4];
  const FAMILJER = ['templateTopLike', 'templateTopCoins', 'templateTopPoints'];

  // LÄSBARHETSLÄGET (2026-10-12). Davids ord: "ramarna syns knappt så tydliga — overlaylive.app har
  // ramar som ser tydligt på liven men inte mina", och "grejen är när man har dem i mini läge (liten
  // storlek) så ser man inte dem tydligt". Liten storlek är `widgetScale`, som ritas som CSS `zoom`.
  //
  // VARFÖR INTE EN REN CONTAINER QUERY PÅ WIDGETEN. Uppmätt i Chromium 154: en container med
  // `zoom:.5` och bredd 300 px svarar på `@container (max-width:200px)` som om den vore 300 bred —
  // zoomen syns inte för frågan. Den synliga bredden räknas därför här, ur designens uppmätta
  // grundmått gånger skalan, och listan i kompaktläget får en MOTZOOM (1/skala) så att allt inuti
  // ritas i riktiga designpixlar. Där inne är listan en riktig container (`rk6-lista`), och
  // det smala underläget (under 140 px) väljs med en vanlig container query. Alla platser står kvar.
  //
  // GRUNDMÅTTEN, uppmätta i overlay med fem riktiga namn (Anya Plays, Kave, Lina Nordin, Omar_92,
  // Sara K) vid skala 1: Voltage 232 px, Basic v2 222, Prism vertikal 235, Celestial/Royal Rose 390,
  // Prism horisontal 420 före rättningen (380 efter). `foto` är profilbildens diameter, `kolumn`
  // en plats bredd i raddesignerna.
  //
  // TRÖSKELN, efter mätning vid synlig bredd 120/160/200/260/320: kompaktläget slår till när
  //   listorna:  profilbilden blir mindre än 36 synliga px (Voltage 42·0,87 = 36,5 vid 200 px), och
  //   raderna:   en plats blir smalare än 44 synliga px. Ner dit ryms ett namn i 12 px på två rader
  //              (Celestial vid 260 px: kolumn 52 px, "Lina / Nordin"); först under det blir fem
  //              kolumner för smala och listan blir en kompakt rad-lista med alla platser kvar.
  //              (Granskningen av #604: tröskeln 54 px gjorde Celestial 260 px kompakt och klippte namnen.)
  // Före: Celestial vid 260 px gav namn 8,3 px och foto 25,5 px, Voltage vid 160 px namn 8,6 px.
  const GEOMETRI = Object.freeze({
    voltage: { bredd: 232, foto: 42 },
    'basic-v2': { bredd: 222, foto: 58 },
    'prism-vertical': { bredd: 235, foto: 44 },
    'prism-horizontal': { kolumn: 68, etta: 84, gap: 3.9, kant: 8 },
    celestial: { kolumn: 70, gap: 8, kant: 8 },
    'royal-rose': { kolumn: 70, gap: 8, kant: 8 }
  });
  const MIN_FOTO = 36, MIN_KOLUMN = 44, MIN_KOMPAKT_BREDD = 112;
  const skalaFor = w => { const z = Number(w && w.widgetScale); return Number.isFinite(z) && z > 0 ? Math.min(4, Math.max(0.2, z)) : 1; };
  function lasbarhet(id, n, z) {
    const g = GEOMETRI[id];
    if (!g) return { z, synlig: 0, kompakt: false };
    const grund = g.bredd || ((n - 1) * (g.kolumn + g.gap) + (g.etta || g.kolumn) + g.kant);
    const kompakt = g.foto ? g.foto * z < MIN_FOTO : g.kolumn * z < MIN_KOLUMN;
    return { z, synlig: Math.round(grund * z), kompakt };
  }


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
    const ram = profilram(w);
    // Panelens reglage (Bilder/Namn/Värde) och dra-text-förskjutningarna, precis som media.js:s
    // vyraTopLike ritar dem — en design får inte tysta ett reglage som finns i panelen.
    const dold = v => v === false ? 'display:none!important;' : '';
    const flytt = (x, y) => (x || y) ? `transform:translate(${Number(x) || 0}px,${Number(y) || 0}px);` : '';
    const avStil = dold(w.showProfile);
    const namnStil = dold(w.showDataName) + flytt(w.nameOffsetX, w.nameOffsetY);
    const vardeStil = dold(w.showDataValue) + flytt(w.valueOffsetX, w.valueOffsetY);
    let html = '';
    // "Siffror matchar ramarna" (David 2026-09-08): med en profilram vald tar rangbrickan och glöden
    // ramens accent, uppmätt ur PNG:n (toplike-studio.js vyraFrameAccent), i stället för designens.
    const ramAccent = ram && typeof window.vyraFrameAccent === 'function' ? window.vyraFrameAccent(String(w.profileFrame)) : null;
    for (let i = 0; i < n; i++) {
      const [c, c2] = ramAccent ? [ramAccent, ramAccent] : d.tiers[i % d.tiers.length];
      const person = demo[i] || ['', ''];
      const namn = nolla ? '' : esc(person[0]);
      const varde = nolla ? '0' : esc(person[1] || '0');
      const krona = (id === 'voltage' && i === 0) || (id === 'prism-horizontal' && i < 3) ? `<i class="rk6-krona">${KRONA}</i>` : '';
      const ordning = d.riktning === 'podium' ? PODIUM.indexOf(i) : i;
      html += `<div class="toplike-row rank-${i + 1}" style="--c:${c};--c2:${c2};--rk6-ordning:${ordning < 0 ? i : ordning}">`
        + `<i class="rk6-av"${avStil ? ` style="${avStil}"` : ''}><i class="rk6-ring"></i><i class="rk6-karna"><i class="rk6-glod"></i>`
        + `<img src="${foto}" alt="">${ram}${krona}<b class="rk6-rang"><i>${i + 1}</i></b></i></i>`
        + `<span class="rk6-namn"${namnStil ? ` style="${namnStil}"` : ''}><strong>${namn}</strong><small></small><i class="rk6-led"></i></span>`
        + `<em${vardeStil ? ` style="${vardeStil}"` : ''}><i class="rk6-ikon">${ikon}</i> ${varde}</em>`
        + '</div>';
    }
    return html;
  }

  // PROFILRAMEN ERSÄTTER DESIGNENS EGEN (Davids beslut 2026-09-24). Top Likes ramväljare (53 ramar i
  // toplike-studio.js) står kvar; väljer streamern en ram läggs den runt fotot i stället för designens
  // metallring. Samma fil och samma uppmätta geometri som media.js:s tl-frame-art: `fit` är ramens
  // genomskinliga öppning som andel av bildens bredd, så konsten skalas 1/fit för att öppningen ska
  // hamna PÅ fotots kant, och dx/dy flyttar konstens mitt (mitt = fotomitt − dx·bredd).
  function profilram(w) {
    const id = String(w.profileFrame || '');
    if (!id || id === 'none' || !/^[a-z0-9-]+$/.test(id)) return '';
    const g = typeof window.vyraFrameGeom === 'function' ? window.vyraFrameGeom(id) : { fit: 0.62, dx: 0, dy: 0 };
    const fil = String((window.VYRA_FRAME_FILES || {})[id] || id + '.png').replace(/[^a-z0-9._-]/gi, '');
    return `<img class="rk6-profilram pro-frame-art" src="assets/images/profile-frames/${fil}" alt="" `
      + `style="--ram-fit:${g.fit};--ram-dx:${g.dx};--ram-dy:${g.dy}">`;
  }

  // Byter rotens innehåll och designklasser, men behåller allt annat i öppningstaggen.
  function omsluten(html, w, id) {
    const m = /^(\s*<div\b[^>]*>)([\s\S]*)<\/div>\s*$/.exec(html);
    if (!m) return html;
    let open = m[1];
    const handtag = (/<span class="resize-handle"[\s\S]*?<\/span>/.exec(m[2]) || [''])[0];
    // Rubriken följer med från kedjan: den bär Rubrik-reglaget (display) och dra-förskjutningen
    // (transform) som media.js ritar, och vyra-dra-text.js märker den som dragbar textdel.
    const rubrik = (/^\s*<h3\b[\s\S]*?<\/h3>/.exec(m[2]) || [''])[0];
    open = open.replace(/class="([^"]*)"/, (_, cls) => {
      // Familjernas egna design-/skinnklasser bär var sin hög !important-regler
      // (toplike-studio.css ~180 st, topcoins-v2.css, toppoints-v2.css) som byggde om raderna till
      // tre olika saker. De sex designerna är EN design — de klasserna ska inte träffa noden alls.
      const kvar = cls.split(/\s+/).filter(k => k && !/^(skin-|like-|topcoins-|toppoints-|tc-|tp-|har-ram$|vyra-topcoins-new$|vyra-toppoints-new$)/.test(k));
      return `class="${kvar.join(' ')} rk6 rk6-${id}"`;
    });
    open = open.replace(/^(\s*<div\b)/, `$1 data-rk6="${id}"`);
    // SKALAN ÄR ZOOM, FÖR ALLA TRE. Top Like bär `zoom:widgetScale` från media.js, men Top Coins och
    // Top Points skalade med sina egna klasser (topcoins-v2.css/toppoints-v2.css transform), och
    // de klasserna tas bort ovan. Uppmätt 2026-10-12: Top Coins Voltage var 228 px bred vid varje
    // skala, och handtagets dragning hoppade tillbaka vid nästa render(). En zoom, en sanning.
    const l = lasbarhet(id, antal(w), skalaFor(w));
    open = open.replace(/style="([^"]*)"/, (_, st) => {
      const utan = st.replace(/(^|;)\s*zoom:[^;]*;?/g, '$1');
      return `style="${utan}${utan && !/;\s*$/.test(utan) ? ';' : ''}zoom:${l.z};--rk6-z:${l.z};--rk6-mot:${+(1 / l.z).toFixed(4)};--rk6-vb:${Math.max(MIN_KOMPAKT_BREDD, l.synlig)}px"`;
    });
    if (l.kompakt) open = open.replace(/class="([^"]*)"/, 'class="$1 rk6-kompakt"');
    if (profilram(w)) {
      const g = typeof window.vyraFrameGeom === 'function' ? window.vyraFrameGeom(String(w.profileFrame)) : { fit: 0.62 };
      const acc = typeof window.vyraFrameAccent === 'function' ? window.vyraFrameAccent(String(w.profileFrame)) : null;
      open = open.replace(/class="([^"]*)"/, 'class="$1 rk6-egen-ram"')
        .replace(/style="/, `style="--ram-fit:${g.fit};${acc && /^[a-z0-9(),.% ]+$/i.test(acc) ? `--ram-accent:${acc};` : ''}`);
    }
    const tr = id === 'celestial' || id === 'royal-rose' ? '<i class="rk6-trad" aria-hidden="true"></i>' : '';
    const stoft = id === 'royal-rose' ? '<i class="rk6-stoft" aria-hidden="true"></i>' : '';
    return `${open}${stoft}${rubrik}<div class="rk6-lista">${tr}${rader(w, id)}</div>${handtag}</div>`;
  }

  // ---- Ensamma ledare: Top Gift (neon, royal) och Top Coins Halo/Signal Orbit ----
  // Samma läsbarhetsläge som listorna, för de kort som visar EN person. Den här wrappern ligger
  // ytterst i wh-kedjan (rang 2), så den ser den färdiga markupen från premium-final.js och
  // topcoins-v2.js utan att ta över deras renderare. Grundbredderna är uppmätta i overlay vid skala 1:
  // Top Gift neon 136 px, royal 222 px, Halo/Signal Orbit = widgetens bredd (230). Under 170 synliga
  // px blir ornamenten (orbitar, svävande mynt, ramlinjer) brus på under 3 px — där slår
  // kompaktläget till: ornamenten bort, tjock ljus ring, större bild.
  const KORT_GRUND = Object.freeze({ neon: 136, royal: 222 });
  const KORT_KOMPAKT = 170;
  function enkelLasbar(html, w) {
    if (!w || typeof html !== 'string') return html;
    const gava = w.type === 'templateTopGift' && /\bpremium-topgift\b/.test(html);
    const mynt = w.type === 'templateTopCoins' && /\bvyra-topcoins-new\b/.test(html);
    if (!gava && !mynt) return html;
    // Halo/Signal Orbit skalar med transform (--tc-scale), Top Gift med zoom — samma fält.
    const z = skalaFor(w);
    const grund = gava ? (KORT_GRUND[w.theme] || KORT_GRUND.royal) : Math.max(150, Number(w.width) || 230);
    const kompakt = grund * z < KORT_KOMPAKT;
    let ut = html.replace(/^(\s*<div\b[^>]*?)class="([^"]*)"/, (_, a, cls) => `${a}class="${cls} rk-lasbar${kompakt ? ' rk-kompakt' : ''}"`)
      .replace(/^(\s*<div\b[^>]*?)style="/, `$1style="--rk-z:${z};`);
    if (gava) {
      // Namnets storlek är streamerns eget val (dataSize, inline) — det står kvar, men aldrig under
      // 12 synliga px. Myntet ersätter "◉" i värdet.
      ut = ut.replace(/(<div class="topgift-copy"><strong style="[^"]*?)font-size:(\d+(?:\.\d+)?)px/, '$1font-size:max($2px,calc(12px / var(--rk-z,1)))')
        .replace(/(<div class="topgift-copy">[\s\S]*?<em\b[^>]*>)◉\s?/, `$1<i class="rk-mynt">${MYNT}</i> `);
    }
    return ut;
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

  // RÄTT DESIGN FRÅN FÖRSTA RITNINGEN (2026-09-26) - se samma stycke i approved-rankings.js.
  // Förr väntade den här på `load` (alla bilder och videor); Top Like, Top Coins och Top Points
  // ritades då med gamla designer tills sidan var helt klar. Nu installeras den direkt och lägger
  // sig ytterst igen efter varje sent skript. Rang 2: alltid UTANFÖR approved-rankings.js (rang 1),
  // så att den här wrappern ser den färdiga roten. En inre, äldre kopia släpper bara igenom.
  const RANG = 2;
  const djup = { wh: 0, bind: 0 };
  function vakt(nyckel, forra, gor) {
    const f = function () {
      if (djup[nyckel]) return forra.apply(this, arguments);
      djup[nyckel]++;
      try { return gor.apply(this, arguments); } finally { djup[nyckel]--; }
    };
    f.__vyraYtter = RANG;
    return f;
  }
  function install() {
    let andrat = false;
    if (typeof wh === 'function' && !(wh.__vyraYtter >= RANG)) {
      const tidigareWh = wh;
      wh = vakt('wh', tidigareWh, function (w) {
        const html = tidigareWh(w);
        const id = designFor(w);
        return id ? omsluten(html, w, id) : enkelLasbar(html, w);
      });
      andrat = true;
    }
    if (typeof bind === 'function' && !(bind.__vyraYtter >= RANG)) {
      const tidigareBind = bind;
      bind = vakt('bind', tidigareBind, function () {
        tidigareBind();
        if (typeof view !== 'undefined' && (view === 'editor' || view === 'overlay')) katalog();
      });
      andrat = true;
    }
    if (andrat) { try { if (typeof render === 'function') render(); } catch (e) {} }
  }

  // Laddas efter approved-rankings.js, så dess capture-lyssnare körs före den här vid varje sent
  // skript: approved lägger sig ytterst först, sedan hamnar den här utanför.
  install();
  document.addEventListener('load', e => { if (e.target && e.target.tagName === 'SCRIPT') install(); }, true);
  addEventListener('load', install, { once: true });

  // NAMNET FÅR PLATS (2026-10-17). Neon Purple är ett smalt stående kort (210 px, studio.css), så
  // namnskylten rymde bara ~12 tecken: ett vanligt "@StreamQueen2" klipptes till "@StreamQue…" i
  // OBS. Namnet krymper nu tills det får plats, ner till 60 % av sin storlek; först ett riktigt långt
  // namn får ellips. Körs när namnet byts (render eller live via gift-event-images.js), aldrig per
  // bildruta: textcachen hoppar över namn som redan är anpassade.
  const anpassade = new WeakMap();
  // TEXTSTORLEKEN FÅR INTE TAPPAS. TEXT-gruppen (vyra-textgrupp.js) skalar namnet med en inline
  // font-size; en första version tog bort ALL inline-storlek innan den mätte, så 150 % blev 100 %
  // (uppmätt i CI: "@StreamQueen" 13px -> 13px vid 1,5). Nu rörs bara den storlek vi själva skrev
  // (data-passad), mätningen utgår från den storlek namnet har just nu, och anpassningen görs om när
  // den storleken ändras — inte bara när texten gör det.
  function passaNamn(el) {
    const egen = el.dataset.passad === '1';
    const bas = egen ? (el.dataset.passadFran || '') : el.style.getPropertyValue('font-size');
    const nyckel = el.textContent + '|' + bas;
    if (anpassade.get(el) === nyckel) return;
    anpassade.set(el, nyckel);
    if (egen) {
      if (bas) el.style.setProperty('font-size', bas, 'important'); else el.style.removeProperty('font-size');
      delete el.dataset.passad; delete el.dataset.passadFran;
    }
    if (el.scrollWidth <= el.clientWidth + 1) return;
    const grund = parseFloat(getComputedStyle(el).fontSize) || 20;
    el.dataset.passad = '1'; el.dataset.passadFran = bas;
    for (let fs = grund - 1; fs >= grund * 0.6; fs -= 1) {
      el.style.setProperty('font-size', fs + 'px', 'important');
      if (el.scrollWidth <= el.clientWidth + 1) return;
    }
  }
  let namnRaf = 0;
  const passaAlla = () => { namnRaf = 0; document.querySelectorAll('.premium-topgift .topgift-copy strong').forEach(passaNamn); };
  const nastaRuta = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : f => setTimeout(f, 16);
  const planera = () => { if (!namnRaf) namnRaf = nastaRuta(passaAlla); };
  if (typeof MutationObserver === 'function' && typeof document !== 'undefined' && document.body) {
    new MutationObserver(muts => {
      for (const m of muts) {
        const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (t && t.closest && t.closest('.premium-topgift')) { planera(); return; }
        for (const n of m.addedNodes || []) if (n.nodeType === 1 && (n.matches('.premium-topgift') || n.querySelector('.premium-topgift'))) { planera(); return; }
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  }
  planera();

  window.VyraRankingSixpack = Object.freeze({ designs: DESIGNS, ids: IDS, pension: PENSION, designFor, render: omsluten, katalog,
    mynt: MYNT, geometri: GEOMETRI, lasbarhet, enkelLasbar });
})();
