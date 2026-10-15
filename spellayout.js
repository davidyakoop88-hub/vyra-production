(function () {
  'use strict';

  // SPELLAYOUT (2026-10-15). Davids beställning: "gaming layout — varje design innehåller top like /
  // top coins / top poäng, top gifter och mål följare och gift campaign". Konsten kommer från
  // designleveransen VYRALIVE-Till-Claude-13-Stilar: statiska PNG-delar per tema, här som WebP i
  // assets/spellayout/<tema>/ (beskurna till innehållet och nerskalade till den storlek OBS ritar
  // dem i — Fortnite gick från 9,5 MB till 0,7 MB).
  //
  // INGA NYA DATAVÄGAR. Delarna med data är befintliga widgettyper som bär `spelTema`/`spelDel`
  // (widget-factory.js, familjen 'spellayout'), och skinnet här behåller exakt de noder som
  // livedatan redan skriver i:
  //   topplistan   .vyra-toplike + :scope>h3 + .toplike-row (strong/small/em/img)
  //                — live-leaderboard.js och rankingcykeln i media.js (likes → coins → poäng)
  //   Top Gifter   .vyra-topgift + .vyra-profile-face img/.vyra-gift-face img + .topgift-copy strong/em
  //                — gift-event-images.js SHAPES.templateTopGift
  //   följarmålet  [data-goal] + [data-goal-value]/[data-goal-target]/[data-goal-fill]
  //                — patchGoalDom i media.js
  //   kampanjen    .vyra-campaign + article .campaign-gift-image img
  //                — gift-event-images.js patchCampaignWidget
  //
  // ROTEN BYGGS HÄR, INTE UR KEDJAN. De fyra familjernas egna renderare sätter var sin hög klasser
  // med !important-regler (premium-topgift, rk6-*, goal-motion, vyra-campaign-aura) som annars
  // hade ritat om skinnet. Rotens stil räknas därför här med samma fält som media.js:s styledWh
  // läser — position, bredd, opacitet, lager och dold — så att en dold del aldrig syns i OBS.
  //
  // OBS: overlayn är EN genomskinlig källa ovanpå kamera och spel. Bakgrunden ritas därför med
  // genomskinliga hål precis där temats kamera- och spelram har sina öppningar, räknat ur ramarnas
  // FAKTISKA läge på duken — flyttar streamern en ram följer hålet med.

  // Geometrin i procent av den beskurna bilden. Hålen är uppmätta som inneslutna genomskinliga
  // ytor (alfa < 60) i varje WebP. TEXTFÄLTEN är uppmätta som mörka, täckande ytor i konsten —
  // Davids regel 2026-10-16: "texten ska inte vara utanför någon ram". All text ligger därför inuti
  // ett sådant fält, och storleken räknas i cqw (andel av konstens bredd), så den stannar kvar
  // inuti även när widgeten görs större eller mindre.
  const TEMAN = Object.freeze({
    fortnite: Object.freeze({
      label: 'Fortnite', ljus: '#8ff0ff', accent: '#ffd23f', text: '#ffffff',
      kameraram: { bild: [1080, 616], hal: [2.69, 5.41, 94.62, 89.19] },
      spelram: { bild: [1080, 608], hal: [2.69, 4.11, 94.62, 91.1] },
      bakgrund: { bild: [941, 1672] },
      lista: { bild: [520, 759], rad: 20.09, forsta: 4.47, foto: [19.62, 17.31, 12.37], namn: [44.5, 47, 14, 74] },
      gifter: { bild: [480, 555], foto: [26.15, 30.56, 47.69, 40.53], rubrik: [14, 7, 72, 16], namn: [13, 79.5, 74, 7.8], varde: [13, 87.2, 74, 7.6] },
      mal: { bild: [1100, 80], spar: [37.6, 31.8, 24.6, 32] },
      kampanj4: { bild: [1100, 263], hal: [[3.46, 14.52, 17.69, 72.58], [28.46, 14.52, 18.08, 72.58], [53.46, 14.52, 18.08, 72.58], [78.85, 14.52, 17.69, 72.58]] },
      kampanj6: { bild: [1100, 174], hal: [[2.31, 14.63, 11.15, 70.73], [18.85, 14.63, 11.54, 70.73], [35.77, 14.63, 11.54, 70.73], [52.69, 14.63, 11.54, 70.73], [69.62, 14.63, 11.92, 70.73], [86.54, 14.63, 11.54, 70.73]] }
    })
  });
  const DELAR = ['bakgrund', 'kameraram', 'spelram', 'lista', 'gifter', 'mal', 'kampanj4', 'kampanj6'];
  // Hela layouten: bakgrund och ramar först, sedan allt med data. Kampanjen med sex gåvor är
  // standard; fyra väljs i kampanjens egen panel (Antal gåvor), och skinnet byter då till fyrkonsten.
  const HELA = ['bakgrund', 'kameraram', 'spelram', 'lista', 'gifter', 'mal', 'kampanj6'];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tal = (v, f) => Number.isFinite(+v) ? +v : f;
  const iOverlay = () => typeof VYRA_OVERLAY !== 'undefined' ? !!VYRA_OVERLAY : new URLSearchParams(location.search).has('overlay');
  const arVald = w => typeof selected !== 'undefined' && selected === w.id;
  const temaFor = w => w && w.spelTema && Object.hasOwn(TEMAN, w.spelTema) ? TEMAN[w.spelTema] : null;
  const mapp = id => 'assets/spellayout/' + id + '/';
  const pct = a => `left:${a[0]}%;top:${a[1]}%;width:${a[2]}%;height:${a[3]}%`;
  const sakerUrl = (u, f) => (typeof VyraSafe !== 'undefined' && VyraSafe.url) ? VyraSafe.url(u, f) : (u || f);

  function delFor(w) {
    if (!temaFor(w)) return null;
    if (w.type === 'templateSpelram') return ['bakgrund', 'kameraram', 'spelram'].includes(w.spelDel) ? w.spelDel : null;
    if (['templateTopLike', 'templateTopCoins', 'templateTopPoints'].includes(w.type)) return 'lista';
    if (w.type === 'templateTopGift') return 'gifter';
    if (w.type === 'templateSocialGoal') return 'mal';
    if (w.type === 'templateGiftCampaign') return 'kampanj';
    return null;
  }

  // Samma fält som media.js:s styledWh skriver på varje annan widget.
  function rot(w, klasser, extraStil, attr) {
    const bredd = Math.max(40, tal(w.width, 300));
    const zoom = Math.min(4, Math.max(0.2, tal(w.widgetScale, 1)));
    const stil = `left:${tal(w.x, 0)}px;top:${tal(w.y, 0)}px;width:${bredd}px;opacity:${tal(w.opacity, 100) / 100};`
      + `z-index:${tal(w.layer, 1)};zoom:${zoom};${w.hidden ? 'display:none;' : ''}${extraStil || ''}`;
    return `<div class="widget spel ${klasser}${arVald(w) ? ' selected' : ''}" data-id="${esc(w.id)}" data-spel="${esc(w.spelTema)}"${attr || ''} style="${stil}">`;
  }
  const handtag = w => arVald(w) ? '<span class="resize-handle">↘</span>' : '';
  // Ljuset GÅR RUNT RAMARNA (David 2026-10-15: "ljuset ska gå runtom ramarna"). Det maskas med
  // delens kantmask, <del>-kant.webp: konstens kontur — yttre kant och öppningarnas kanter — som ett
  // smalt band, genererat ur bildens alfa. Ljuspunkterna färdas alltså bara längs kanterna, i vilket
  // tema som helst, utan en handritad bana per tema.
  const ljus = src => `<i class="spel-ljus" aria-hidden="true" style="--spel-mask:url('${src.replace(/\.webp$/, '-kant.webp')}')"></i>`;
  const konst = (src, bild) => `<div class="spel-konst" style="aspect-ratio:${bild[0]}/${bild[1]}"><img class="spel-glod" src="${src}" alt="" aria-hidden="true" draggable="false"><img class="spel-bild" src="${src}" alt="" draggable="false">${ljus(src)}`;

  // ---- ramar och bakgrund -----------------------------------------------------------------------
  function ram(w, t) {
    const src = mapp(w.spelTema) + w.spelDel + '.webp';
    return rot(w, `spel-${w.spelDel}`, `--spel-ljusfarg:${t.ljus}`) + konst(src, t[w.spelDel].bild) + '</div>' + handtag(w) + '</div>';
  }

  // Ramens öppning i dukens koordinater, ur ramwidgetens faktiska läge och storlek.
  function oppning(r, t) {
    const g = t[r.spelDel], z = Math.min(4, Math.max(0.2, tal(r.widgetScale, 1)));
    const b = tal(r.width, 432) * z, h = b * g.bild[1] / g.bild[0];
    return [tal(r.x, 0) + b * g.hal[0] / 100, tal(r.y, 0) + h * g.hal[1] / 100, b * g.hal[2] / 100, h * g.hal[3] / 100];
  }

  function bakgrund(w, t) {
    const src = mapp(w.spelTema) + 'bakgrund.webp';
    const z = Math.min(4, Math.max(0.2, tal(w.widgetScale, 1)));
    const b = tal(w.width, 432), h = b * t.bakgrund.bild[1] / t.bakgrund.bild[0];
    const bx = tal(w.x, 0), by = tal(w.y, 0);
    const lista = typeof state !== 'undefined' && state && Array.isArray(state.widgets) ? state.widgets : [];
    // Bara synliga ramar i SAMMA tema skär hål: en dold kameraram ska inte lämna ett tomt fönster.
    const hal = lista.filter(r => r && r.type === 'templateSpelram' && r.spelTema === w.spelTema && !r.hidden
      && (r.spelDel === 'kameraram' || r.spelDel === 'spelram')).map(r => oppning(r, t))
      .map(([x, y, bb, hh]) => [(x - bx) / z, (y - by) / z, bb / z, hh / z]);
    const id = 'spel-hal-' + String(w.id).replace(/[^a-zA-Z0-9_-]/g, '');
    // evenodd: hela ytan minus varje hål. Hålen ritas i bakgrundens egna enheter (viewBox = b × h).
    const vag = `M0 0H${b}V${h}H0Z` + hal.map(([x, y, bb, hh]) => `M${x.toFixed(1)} ${y.toFixed(1)}h${bb.toFixed(1)}v${hh.toFixed(1)}h${(-bb).toFixed(1)}Z`).join('');
    return rot(w, 'spel-bakgrund')
      + `<svg class="spel-bakgrund-svg" viewBox="0 0 ${b.toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="none" aria-hidden="true">`
      + `<defs><clipPath id="${id}"><path clip-rule="evenodd" d="${vag}"/></clipPath></defs>`
      + `<image href="${src}" x="0" y="0" width="${b.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/></svg>`
      + handtag(w) + '</div>';
  }

  // ---- topplistan ---------------------------------------------------------------------------------
  const IKON = { templateTopLike: '♥', templateTopCoins: '●', templateTopPoints: '◆' };
  const RUBRIK = { templateTopLike: 'TOP LIKES', templateTopCoins: 'TOP COINS', templateTopPoints: 'TOP POINTS' };
  function lista(w, t) {
    const g = t.lista, src = mapp(w.spelTema) + 'likes-lista.webp';
    const demo = typeof topLikePeople !== 'undefined' && Array.isArray(topLikePeople) ? topLikePeople : [];
    // Overlay ritar nolläget direkt: publiken ska aldrig se påhittade personer (live-zero-state.js).
    const nolla = iOverlay();
    const foto = esc(sakerUrl(w.profileImage, 'assets/images/test-profile.svg'));
    // ANTAL PLATSER, 1–10 (Davids beslut 2026-10-16), ur samma reglage som de andra listorna
    // (likeCount, "Antal profiler"). Konsten har fem numrerade platser:
    //   färre än 5  — bilden klipps strax under sista platsen, så inga tomma platser syns
    //   fler än 5   — två sidor på samma fem platser: 1–5, sedan 6–10. På sida två döljs konstens
    //                 egna rangbrickor (och kronorna över 1–3) och egna brickor med 6–10 ritas.
    // Livedatan fyller raderna i DOM-ordning, så rad 6–10 får plats 6–10 utan något eget.
    const n = Math.max(1, Math.min(10, Math.round(tal(w.likeCount, 5))));
    const klipp = n < 5 ? Math.min(100, g.forsta + (n - 1) * g.rad + g.foto[2] + 3.5) : 100;
    let rader = '';
    for (let i = 0; i < n; i++) {
      const p = demo[i] || ['', ''];
      const sida = i < 5 ? 0 : 1, plats = i % 5;
      const top = g.forsta + plats * g.rad;
      rader += `<div class="toplike-row rank-${i + 1}" data-sida="${sida}" style="--spel-rad-top:${top}%;--spel-rad-h:${g.foto[2]}%">`
        + (sida ? `<b class="spel-rang">${i + 1}</b>` : '')
        + `<i class="spel-foto" style="--spel-x:${g.foto[0]}%;--spel-b:${g.foto[1]}%"><img src="${foto}" alt=""></i>`
        + `<span class="spel-rad-text" style="--spel-x:${g.namn[0]}%;--spel-b:${g.namn[1]}%;--spel-y:${g.namn[2]}%;--spel-h:${g.namn[3]}%"><strong>${nolla ? '' : esc(p[0])}</strong><small></small>`
        + `<em>${IKON[w.type]} ${nolla ? '0' : esc(p[1] || '0')}</em></span></div>`;
    }
    // Den klippta konsten: ytterlådan har den klippta höjden, den inre hela konstens — så att
    // radernas procent, ljusets mask och glöden räknas mot samma bild som förut.
    const inre = `<div class="spel-konst-inre" style="height:${(10000 / klipp).toFixed(3)}%">`;
    const bild = `<img class="spel-glod" src="${src}" alt="" aria-hidden="true" draggable="false"><img class="spel-bild" src="${src}" alt="" draggable="false">${ljus(src)}`;
    return rot(w, 'vyra-toplike spel-lista', `--spel-ljusfarg:${t.ljus};--spel-accent:${t.accent}`,
      ` data-spel-sidor="${n > 5 ? 2 : 1}" data-spel-sida="0"`)
      + `<h3>${esc(w.templateTitle || RUBRIK[w.type])}</h3>`
      + `<div class="spel-konst${klipp < 100 ? ' spel-klippt' : ''}" style="aspect-ratio:${g.bild[0]}/${(g.bild[1] * klipp / 100).toFixed(2)}">`
      + inre + bild + rader + '</div></div>' + handtag(w) + '</div>';
  }

  // SIDBYTET för listor med fler än fem. Sidan räknas ur klockan (samma vana som rankingcykeln),
  // så alla OBS-källor visar samma sida. I OBS hoppas sida två över så länge plats 6 saknar namn —
  // publiken ska inte se fem tomma platser.
  const SIDA_MS = 5000;
  function bytSidor() {
    document.querySelectorAll('.spel-lista[data-spel-sidor="2"]').forEach(box => {
      let sida = Math.floor(Date.now() / SIDA_MS) % 2;
      if (sida === 1 && iOverlay()) {
        const sjatte = box.querySelector('.toplike-row.rank-6 strong');
        if (!sjatte || !sjatte.textContent.trim()) sida = 0;
      }
      if (box.dataset.spelSida !== String(sida)) box.dataset.spelSida = String(sida);
    });
  }
  setInterval(bytSidor, 500);

  // ---- Top Gifter ---------------------------------------------------------------------------------
  function gifter(w, t) {
    const g = t.gifter, src = mapp(w.spelTema) + 'top-gifter.webp';
    const nolla = iOverlay() && !w.dataName;
    const namn = nolla ? '' : esc(w.dataName || '@StreamQueen');
    const varde = esc(w.dataValue == null ? '44 999' : w.dataValue);
    return rot(w, 'vyra-topgift spel-gifter', `--spel-ljusfarg:${t.ljus};--spel-accent:${t.accent}`)
      + konst(src, g.bild)
      + `<div class="spel-gifter-rubrik" style="${pct(g.rubrik)}">${esc(w.templateTitle || 'TOP GIFTER')}</div>`
      + `<div class="spel-flip" style="${pct(g.foto)}">`
      + `<div class="vyra-profile-face"><img src="${esc(sakerUrl(w.profileImage, 'assets/images/test-profile.svg'))}" alt=""></div>`
      + `<div class="vyra-gift-face"><img src="${esc(sakerUrl(w.giftImage, 'assets/gifts/events/0001_Rose.png'))}" alt=""></div></div>`
      + `<div class="topgift-copy"><strong style="${pct(g.namn)}">${namn}</strong>`
      + `<em style="${pct(g.varde)};${w.showDataValue === false ? 'display:none' : ''}">◉ ${varde}</em></div>`
      + '</div>' + handtag(w) + '</div>';
  }

  // ---- följarmålet --------------------------------------------------------------------------------
  function mal(w, t) {
    const g = t.mal, src = mapp(w.spelTema) + 'malwidget.webp';
    const live = window.VyraGoals && window.VyraGoals.read ? window.VyraGoals.read(w.id) : null;
    const nu = live ? live.value : Math.max(0, tal(w.goalCurrent, 0));
    const mal = live ? live.target : Math.max(1, tal(w.goalTarget, 1000));
    const p = Math.min(100, Math.round(nu / mal * 100));
    const fmt = n => Number(n || 0).toLocaleString('sv-SE');
    return rot(w, 'spel-mal', `--spel-ljusfarg:${t.ljus};--spel-accent:${t.accent};--goal-fill:${p}%`, ' data-goal="social"')
      + konst(src, g.bild)
      + `<div class="spel-mal-spar" style="${pct(g.spar)}"><i data-goal-fill style="width:${p}%"></i>`
      + `<span class="spel-mal-text"><span class="spel-mal-rubrik">${esc(w.goalTitle || 'FÖLJARE')}</span>`
      + `<span class="spel-mal-varde"><b data-goal-value>${fmt(nu)}</b>/<b data-goal-target>${fmt(mal)}</b></span></span></div>`
      + '</div>' + handtag(w) + '</div>';
  }

  // ---- Gift Campaign ------------------------------------------------------------------------------
  // Davids korrigering (BORJA-HAR.md): 4 eller 6 valda gåvobilder när streamern pushar ett event.
  // Inga räknare, poängkrav eller timers — de dolda <span><b> finns bara för att patchCampaignWidget
  // ska hitta sina noder utan att något visas.
  function kampanj(w, t) {
    const sex = tal(w.giftCount, 4) > 4;
    const g = sex ? t.kampanj6 : t.kampanj4, src = mapp(w.spelTema) + (sex ? 'gift-campaign-6.webp' : 'gift-campaign-4.webp');
    const varor = typeof window.VyraCampaignItems === 'function' ? window.VyraCampaignItems(w) : [];
    const platser = g.hal.map((h, i) => {
      const v = varor[i];
      // En tom plats visas tom — den ska aldrig se ut som en extra gåva.
      const bild = v && v.image ? `<img src="${esc(sakerUrl(v.image, ''))}" alt="${esc(v.name)}">` : '';
      return `<article class="spel-gava" data-gift-index="${i}" style="${pct(h)};--spel-fas:${(i * 0.35).toFixed(2)}s">`
        + `<div class="campaign-gift-image">${bild}</div><span hidden><b>${v ? Math.max(0, tal(v.current, 0)) : 0}</b></span></article>`;
    }).join('');
    return rot(w, `vyra-campaign spel-kampanj spel-kampanj-${sex ? 6 : 4}`, `--spel-ljusfarg:${t.ljus}`)
      + konst(src, g.bild) + platser + '</div>' + handtag(w) + '</div>';
  }

  function html(w) {
    const t = temaFor(w), del = delFor(w);
    if (!t || !del) return null;
    if (del === 'bakgrund') return bakgrund(w, t);
    if (del === 'kameraram' || del === 'spelram') return ram(w, t);
    if (del === 'lista') return lista(w, t);
    if (del === 'gifter') return gifter(w, t);
    if (del === 'mal') return mal(w, t);
    return kampanj(w, t);
  }

  // ---- egenskapspanelen för ramarna och bakgrunden --------------------------------------------------
  function ramProps(w) {
    const t = temaFor(w);
    const namn = { bakgrund: 'BAKGRUND', kameraram: 'KAMERARAM', spelram: 'SPELRAM' }[w.spelDel] || 'SPELRAM';
    return `<h3>${namn}</h3><div class="template-badge">${esc(t ? t.label : '')} · SPELLAYOUT</div>`
      + `<div hidden><input id="pt" value="${esc(w.title || '')}"><input id="pv" value=""></div>`
      + `<div class="property-group"><h4>INNEHÅLL</h4><p>${w.spelDel === 'bakgrund'
        ? 'Bakgrunden har genomskinliga hål där kameraramen och spelramen sitter, så kameran och spelet syns igenom i OBS.'
        : 'Ramens mitt är genomskinlig. Lägg kamera- eller spelkällan under overlayn i OBS.'}</p></div>`
      + `<div class="property-group"><h4>POSITION & STORLEK</h4><div class="property-grid">`
      + `<label>X<input id="propX" type="number" value="${tal(w.x, 0)}"></label><label>Y<input id="propY" type="number" value="${tal(w.y, 0)}"></label>`
      + `<label>Bredd<input id="propWidth" type="number" min="80" max="1200" value="${tal(w.width, 432)}"></label><label>Lager<input id="propLayer" type="number" value="${tal(w.layer, 1)}"></label></div></div>`
      + '<button class="delete" id="del">Ta bort</button>';
  }

  // ---- sidan GAMING OVERLAY ---------------------------------------------------------------------
  // Davids beslut 2026-10-15: delarna ligger INTE i widgetkatalogen. Streamern väljer ett tema på en
  // egen sida i menyn och får hela paketet — ramar, bakgrund och alla widgetar — på en gång. Varje
  // del är ändå en egen widget i layouten, så den kan flyttas, döljas eller tas bort för sig.

  // EN gaming overlay i taget: alla delar från ett tidigare tema tas bort först, så att ett byte av
  // tema inte lämnar två kameraramar ovanpå varandra. Andra widgetar i layouten rörs inte.
  function skapaHela(tema) {
    if (!Object.hasOwn(TEMAN, tema)) return;
    state.widgets = state.widgets.filter(w => !(w && w.spelTema));
    HELA.forEach(del => { state.widgets.push(VyraWidgets.create(`catalog:spellayout:${tema}:${del}`)); });
    selected = null;
    save();
    if (typeof toast === 'function') toast(`${TEMAN[tema].label}: hela gaming overlayn är lagd i din layout`);
  }

  const aktivtTema = () => {
    const w = (typeof state !== 'undefined' && state && state.widgets || []).find(x => x && x.spelTema);
    return w ? w.spelTema : null;
  };

  const INNEHALL = ['Kameraram och spelram', 'Bakgrund med plats för kamera och spel', 'Topplista: likes → coins → poäng',
    'Top Gifter', 'Följarmål', 'Gift Campaign med 6 gåvor', 'Rörligt ljus runt ramarna'];

  function sida() {
    const knapp = document.querySelector('[data-extra="gaming"]');
    if (!knapp || !knapp.classList.contains('active')) return;
    const vy = document.querySelector('#view'), titel = document.querySelector('#title');
    if (!vy) return;
    if (titel) titel.textContent = 'Gaming overlay';
    const aktiv = aktivtTema();
    vy.innerHTML = '<section class="card spel-sida-head"><div><h2>Gaming overlay</h2>'
      + '<p>Välj ett tema så får du hela paketet på en gång: kamera överst, spelet under och dina widgetar i samma stil. '
      + 'Lägg kamera- och spelkällan under VYRA-overlayn i OBS — ramarnas mitt är genomskinlig.</p></div></section>'
      + '<section class="spel-teman">' + Object.entries(TEMAN).map(([id, t]) =>
        `<article class="card spel-tema${aktiv === id ? ' aktiv' : ''}" data-spel-tema="${id}">`
        + `<img class="spel-tema-bild" src="${mapp(id)}forhandsvisning.webp" alt="${esc(t.label)}">`
        + `<div class="spel-tema-text"><h3>${esc(t.label)}</h3><ul>${INNEHALL.map(r => `<li>${r}</li>`).join('')}</ul>`
        + `<button type="button" class="spel-anvand" data-spel-anvand="${id}">${aktiv === id ? 'Lägg om temat' : 'Använd tema'}</button>`
        + (aktiv === id ? '<small>Används i din layout nu</small>' : '') + '</div></article>').join('')
      + '</section>';
    vy.querySelectorAll('[data-spel-anvand]').forEach(b => {
      b.onclick = () => {
        const tema = b.dataset.spelAnvand;
        const annat = aktivtTema();
        if (annat && !confirm(annat === tema
          ? `${TEMAN[tema].label} ligger redan i din layout. Lägga om det? Flyttade och ändrade delar återställs.`
          : `Byta från ${TEMAN[annat].label} till ${TEMAN[tema].label}? Delarna från ${TEMAN[annat].label} tas bort.`)) return;
        skapaHela(tema);
        // Till layouteditorn, där streamern ser scenen och kan finjustera den. Via menyns egen
        // Layout-länk, som byter vy utan omladdning — en omladdning direkt efter save() hann före
        // skrivningen och gav en tom layout (uppmätt 2026-10-15).
        const lank = document.querySelector('aside a[href="layout.html"]');
        if (lank) lank.click(); else if (typeof toast === 'function') toast('Öppna Layout för att se din gaming overlay');
      };
    });
  }
  document.addEventListener('click', e => {
    if (e.target && e.target.closest && e.target.closest('[data-extra="gaming"]')) setTimeout(sida, 0);
  }, true);
  // Ett klick direkt efter sidladdningen hann före startsidans egen ritning, som sedan skrev över
  // #view (uppmätt 2026-10-16: rubriken sade Gaming overlay, innehållet var Översikt). Så länge
  // menyknappen är aktiv ritas sidan om när någon annan har skrivit över den.
  new MutationObserver(() => {
    const knapp = document.querySelector('[data-extra="gaming"]');
    const vy = document.querySelector('#view');
    if (knapp && vy && knapp.classList.contains('active') && !vy.querySelector('.spel-teman')) sida();
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ---- installation, ytterst i kedjan --------------------------------------------------------------
  // Samma vakt som ranking-sixpack.js (rang 2): wrappern lägger sig ytterst igen efter varje sent
  // skript, så att Gift Campaign Aura (laddas asynkront ur media.js) inte hamnar utanför skinnet.
  const RANG = 3;
  const djup = { wh: 0, props: 0 };
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
      const tidigare = wh;
      wh = vakt('wh', tidigare, function (w) {
        const egen = html(w);
        return egen === null ? tidigare(w) : egen;
      });
      andrat = true;
    }
    if (typeof props === 'function' && !(props.__vyraYtter >= RANG)) {
      const tidigare = props;
      props = vakt('props', tidigare, function () {
        const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
        return w && w.type === 'templateSpelram' ? ramProps(w) : tidigare();
      });
      andrat = true;
    }
    if (andrat) { try { if (typeof render === 'function') render(); } catch (e) {} }
  }

  install();
  document.addEventListener('load', e => { if (e.target && e.target.tagName === 'SCRIPT') install(); }, true);
  addEventListener('load', install, { once: true });

  window.VyraSpellayout = Object.freeze({ teman: TEMAN, delar: DELAR, hela: HELA, html, delFor, skapaHela, sida });
})();
