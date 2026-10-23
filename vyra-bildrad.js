(function () {
  'use strict';
  // BILDSTORLEK, RADAVSTÅND OCH RIKTNING (David 2026-10-23) — tre reglage i Ranking, Battle MVP och
  // Top Gifter Podium.
  //
  // Panelens kontroller läggs i familjernas registerposter (vyra-ranking-panel.js, vyra-mvp-panel.js,
  // vyra-playground-panel.js) av utoka() nedan, och ramen (vyra-panelram.js) bygger dem som vanliga
  // reglage och en lista. Den här filen ritar dem också: en wh-wrapper ytterst i kedjan lägger till klasser och CSS-variabler på widgetens
  // rotnod, och vyra-bildrad.css gör resten. Allt annat i rotens öppningstagg — data-id, position,
  // dold/opacitet/lager, entré, zoom — står orört, och innehållet byts inte.
  //
  // ORÖRDA VÄRDEN RITAR EXAKT SOM FÖRUT. Ett fält som saknas, eller står på sitt standardvärde
  // (100 %, 0 px, designens egen riktning), ger ingen klass och ingen variabel: markupen är byte för
  // byte densamma som före, så varje sparad widget och varje visuell referens gäller oförändrad.
  //
  // FÄLTEN (nya, inga gamla byter namn):
  //   bildStorlek  60–150 (%)   profilbildens storlek; 100 = designens.
  //   radAvstand   -10–40 (px)  läggs till designens eget avstånd mellan raderna; 0 = designens.
  //                             Relativt, inte absolut: varje design har sitt eget avstånd (Basic v2
  //                             36 px, Prism horisontal 3,9 px), och 0 betyder då alltid "som ritat".
  //   riktning     text         designens egen riktning, eller ett av familjens andra lägen.
  //
  // INGET FÅR STICKA UT UR LÅDAN. Rankinglistorna är innehållsstora (width:max-content), så lådan
  // växer med innehållet. Battle MVP har fast bredd: emblemets storlek kläms här så att det ryms.
  // Podiet har fast yta (940×900 designpixlar): bildstorleken kläms och blocken krymper i CSS.

  const FALT = Object.freeze({ bild: 'bildStorlek', rad: 'radAvstand', riktning: 'riktning' });
  const BILD = Object.freeze({ min: 60, max: 150, standard: 100 });
  const RAD = Object.freeze({ min: -10, max: 40, standard: 0 });
  // Podiets yta är fast (940×900 designpixlar). Över 130 % når ettans krona rubriken i HD-ramarna,
  // så reglaget slutar där och renderaren klämmer ett större sparat värde.
  const PODIUM_MAX = 1.3;
  const klamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const tal = v => { if (v === '' || v == null || typeof v === 'boolean') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

  // Faktor (0,6–1,5) eller null när bildstorleken är orörd.
  function bildFaktor(w) {
    const n = tal(w && w[FALT.bild]);
    if (n == null || Math.round(n) === BILD.standard) return null;
    return klamp(n, BILD.min, BILD.max) / 100;
  }
  // Tillägg i px eller null när radavståndet är orört.
  function radTillagg(w) {
    const n = tal(w && w[FALT.rad]);
    if (n == null || Math.round(n) === RAD.standard) return null;
    return klamp(Math.round(n), RAD.min, RAD.max);
  }

  // ---- Familjerna ------------------------------------------------------------------------------
  //
  // Varje familj: vilka riktningar den har (den första är designens egen), och hur roten märks.
  // RANKING: de sex designerna i ranking-sixpack.js. Listorna (Voltage, Basic v2, Prism vertikal)
  // står lodrätt, Prism horisontal är ett podium 4·2·1·3·5 och Celestial/Royal Rose en vågrät rad.
  const RK_LISTA = ['voltage', 'basic-v2', 'prism-vertical'];
  const RK_RAD = ['celestial', 'royal-rose'];
  const RIKTNINGAR = Object.freeze({
    lista: [['lodrat', 'Lodrät lista'], ['vagrat', 'Vågrät rad']],
    rad: [['vagrat', 'Vågrät rad'], ['lodrat', 'Lodrät lista']],
    rkPodium: [['podium', 'Podium (4 · 2 · 1 · 3 · 5)'], ['rad', 'Rad (1 · 2 · 3 · 4 · 5)'], ['lodrat', 'Lodrät lista']],
    mvpRad: [['vagrat', 'Bilden bredvid texten'], ['lodrat', 'Bilden ovanför texten']],
    mvpKolumn: [['lodrat', 'Bilden ovanför texten'], ['vagrat', 'Bilden bredvid texten']],
    pallplats: [['2-1-3', 'Klassisk (2 · 1 · 3)'], ['1-2-3', 'Trappa (1 · 2 · 3)'], ['3-1-2', 'Spegelvänd (3 · 1 · 2)']],
  });
  const rkGrupp = id => RK_LISTA.includes(id) ? 'lista' : RK_RAD.includes(id) ? 'rad' : id === 'prism-horizontal' ? 'rkPodium' : null;
  // Samma fråga som ranking-sixpack.js ställer när den väljer kompaktläget.
  function rkKompakt(w) {
    const S = window.VyraRankingSixpack;
    if (!S || typeof S.designFor !== 'function' || typeof S.lasbarhet !== 'function') return false;
    try {
      const id = S.designFor(w);
      const z = Number(w.widgetScale) > 0 ? Math.min(4, Math.max(0.2, Number(w.widgetScale))) : 1;
      return !!(id && S.lasbarhet(id, S.antal(w), z).kompakt);
    } catch (_) { return false; }
  }

  // BATTLE MVP: bara de sex klassiska stilarna. Ramarna är en fast bild med profilbilden i ett hål och
  // firandena fasta kompositioner — där finns varken en bild att förstora eller rader att flytta,
  // och reglagen visas inte (vyra-mvp-panel.js).
  const MVP_KLASSISKA = ['inferno', 'royal', 'cyber', 'storm', 'aurora', 'samurai'];
  // Uppmätta ur studio.css: emblemets bredd och avståndet mellan emblem och text per stil.
  const MVP_EMBLEM = { royal: 86 };
  const MVP_GAP = { inferno: 7, royal: 3 };
  const TEXT_MIN = 90;
  // Royal, Storm och Aurora står i kolumn (studio.css flex-direction:column), de andra i rad.
  const MVP_KOLUMN = ['royal', 'storm', 'aurora'];
  const mvpGrupp = s => MVP_KOLUMN.includes(s) ? 'mvpKolumn' : 'mvpRad';

  // Den riktning som ska ritas, eller null när den är designens egen (eller okänd).
  function riktning(w, grupp) {
    const lista = RIKTNINGAR[grupp];
    const v = w && typeof w[FALT.riktning] === 'string' ? w[FALT.riktning] : '';
    if (!lista || !v || v === lista[0][0] || !lista.some(([k]) => k === v)) return null;
    return v;
  }

  // ---- Registerkontrollerna -------------------------------------------------------------------
  //
  // Sektion 3 (Storlek och placering). `om` döljer ett reglage för en modell där det inte gör något.
  //   grupp: nyckel i RIKTNINGAR (null = ingen riktning)
  function kontroller(grupp, om) {
    const villkor = typeof om === 'function' ? { om } : {};
    const max = grupp === 'pallplats' ? Math.round(PODIUM_MAX * 100) : BILD.max;
    const ut = [
      Object.assign({ sektion: 3, typ: 'tal', falt: FALT.bild, etikett: 'Bildstorlek', enhet: '%', min: BILD.min, max, steg: 5, standard: BILD.standard }, villkor),
      Object.assign({ sektion: 3, typ: 'tal', falt: FALT.rad, etikett: 'Radavstånd', enhet: 'px', min: RAD.min, max: RAD.max, steg: 1, standard: RAD.standard }, villkor),
    ];
    if (grupp && RIKTNINGAR[grupp]) ut.push(Object.assign({ sektion: 3, typ: 'val', falt: FALT.riktning, etikett: 'Riktning', alternativ: RIKTNINGAR[grupp].map(a => a.slice()) }, villkor));
    return ut;
  }

  // Lägger kontrollerna i familjernas registerposter, direkt efter Position (sektion 3), och fälten i
  // "Återställ utseende". Posterna definieras av panelfilerna i studio.html; den här filen laddas
  // senare från media.js skript-svans, så den lägger sig i posterna i stället för att posterna
  // anropar den. Idempotent: körs igen vid DOMContentLoaded och load om någon post kom sent.
  //   ranking: 18 poster (galler = designen), MVP: de sex klassiska, podiet: en post för alla tretton.
  function gruppFor(post) {
    const g = Array.isArray(post.galler) ? post.galler[0] : null;
    if (['templateTopLike', 'templateTopCoins', 'templateTopPoints'].includes(post.typ) && post.test === 'ranking') return rkGrupp(g);
    if (post.typ === 'templateBattleMvp' && typeof g === 'string' && g.startsWith('klassisk:')) {
      const s = g.slice('klassisk:'.length);
      return MVP_KLASSISKA.includes(s) ? mvpGrupp(s) : null;
    }
    if (post.typ === 'templatePgPodium') return 'pallplats';
    return null;
  }
  function utoka() {
    const R = window.VyraPanelregister;
    if (!R || typeof R.poster !== 'function') return 0;
    let n = 0;
    for (const post of R.poster()) {
      if (!post || post.__vyraBildrad || !Array.isArray(post.kontroller)) continue;
      const grupp = gruppFor(post);
      if (!grupp) continue;
      // En liten topplista ritas i kompaktläget (ranking-sixpack.js), med egen layout som de tre
      // reglagen inte når — där visas de inte.
      const nya = kontroller(grupp, ['lista', 'rad', 'rkPodium'].includes(grupp) ? w => !rkKompakt(w) : null);
      const i = post.kontroller.findIndex(k => k && k.typ === 'std-position');
      post.kontroller.splice(i >= 0 ? i + 1 : post.kontroller.length, 0, ...nya);
      if (Array.isArray(post.utseendeFalt)) for (const f of Object.values(FALT)) if (!post.utseendeFalt.includes(f)) post.utseendeFalt.push(f);
      Object.defineProperty(post, '__vyraBildrad', { value: true });
      n++;
    }
    return n;
  }
  utoka();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', utoka, { once: true });
  addEventListener('load', utoka, { once: true });

  // ---- Rotnoden --------------------------------------------------------------------------------
  // Bara den första taggen: klasser läggs sist i class, variabler sist i style.
  function markRot(html, klasser, stil) {
    if (!klasser.length && !stil.length) return html;
    const m = /^(\s*<div\b)([^>]*)>/.exec(html);
    if (!m) return html;
    let attr = m[2];
    if (klasser.length) {
      if (/\sclass="/.test(attr)) attr = attr.replace(/\sclass="([^"]*)"/, (_, c) => ` class="${c} ${klasser.join(' ')}"`);
      else attr += ` class="${klasser.join(' ')}"`;
    }
    if (stil.length) {
      const decl = stil.join(';');
      if (/\sstyle="/.test(attr)) attr = attr.replace(/\sstyle="([^"]*)"/, (_, s) => ` style="${s}${s && !/;\s*$/.test(s) ? ';' : ''}${decl}"`);
      else attr += ` style="${decl}"`;
    }
    return m[1] + attr + '>' + html.slice(m[0].length);
  }

  // RANKING. Designen läses ur markupen (data-rk6, satt av ranking-sixpack.js), så att det är exakt
  // den design som ritas som styr — samma svar som designFor(), utan en egen kopia av regeln.
  function ranking(html, w) {
    const id = (/^\s*<div\b[^>]*\bdata-rk6="([a-z0-9-]+)"/.exec(html) || [])[1];
    const grupp = id && rkGrupp(id);
    if (!grupp) return html;
    const kl = [], st = [];
    const b = bildFaktor(w), r = radTillagg(w), v = riktning(w, grupp);
    if (b != null) { kl.push('vb-bild'); st.push('--vb-bild:' + b); }
    if (r != null) { kl.push('vb-rad'); st.push('--vb-rad:' + r + 'px'); }
    if (v === 'vagrat' && grupp === 'lista') kl.push('vb-vagrat');
    if (v === 'lodrat' && grupp !== 'lista') kl.push('vb-lodrat');
    if (v === 'rad' && grupp === 'rkPodium') kl.push('vb-rak');
    return markRot(html, kl, st);
  }

  // BATTLE MVP, klassisk stil. Emblemet kläms till lådans innerbredd (bredd − 2 × 10 px padding);
  // bredvid texten lämnas minst TEXT_MIN px åt namnet (uppmätt: Aurora 150 % + 40 px blev "T.").
  function mvp(html, w) {
    const s = w.mvpStyle || 'inferno';
    if (!MVP_KLASSISKA.includes(s) || !new RegExp('^\\s*<div\\b[^>]*\\bclass="[^"]*\\bmvp-' + s + '\\b').test(html) || /^\s*<div\b[^>]*\bmvp-(framed|premium)\b/.test(html)) return html;
    const grupp = mvpGrupp(s);
    const kl = [], st = [];
    const v = riktning(w, grupp);
    const kolumn = v ? v === 'lodrat' : grupp === 'mvpKolumn';
    // Bredvid texten får namnet alltid minst TEXT_MIN px: först kläms bilden, sedan avståndet.
    const emblem = MVP_EMBLEM[s] || 105, gap0 = MVP_GAP[s] ?? 12;
    const inner = Math.max(60, (Number(w.width) || 240) - 20);
    const plats = kolumn ? inner : inner - TEXT_MIN;
    let b = bildFaktor(w);
    if (b != null) {
      // Nedåt, aldrig uppåt: avrundat uppåt sticker emblemet ut en bråkdel av en pixel.
      b = Math.floor(Math.min(b, Math.max(BILD.min / 100, (plats - (kolumn ? 0 : Math.min(gap0, 12))) / emblem)) * 1000 + 1e-9) / 1000;
      kl.push('vb-bild'); st.push('--vb-bild:' + b);
    }
    const r = radTillagg(w);
    if (r != null) {
      let gap = Math.max(0, gap0 + r);
      if (!kolumn) gap = Math.max(0, Math.min(gap, plats - emblem * (b ?? 1)));
      kl.push('vb-rad'); st.push('--vb-rad:' + Math.round(gap) + 'px');
    }
    if (v) kl.push(v === 'lodrat' ? 'vb-lodrat' : 'vb-vagrat');
    return markRot(html, kl, st);
  }

  // PODIET. Ytan är 940 designpixlar bred och skalas till widgetens bredd, så radavståndet (skärm-px
  // vid skala 1) räknas om till designpixlar.
  function podium(html, w) {
    const kl = [], st = [];
    const b = bildFaktor(w), r = radTillagg(w), v = riktning(w, 'pallplats');
    if (b != null) { kl.push('vb-bild'); st.push('--vb-bild:' + Math.min(b, PODIUM_MAX)); }
    if (r != null) {
      const s = (Number(w.width) || 300) / 940;
      kl.push('vb-rad'); st.push('--vb-rad:' + +(r / s).toFixed(1) + 'px');
    }
    if (v) kl.push('vb-pall-' + v);
    return markRot(html, kl, st);
  }

  function markera(html, w) {
    if (typeof html !== 'string' || !w || typeof w !== 'object') return html;
    if (w[FALT.bild] == null && w[FALT.rad] == null && w[FALT.riktning] == null) return html;
    try {
      if (w.type === 'templateTopLike' || w.type === 'templateTopCoins' || w.type === 'templateTopPoints') return ranking(html, w);
      if (w.type === 'templateBattleMvp') return mvp(html, w);
      if (w.type === 'templatePgPodium') return podium(html, w);
    } catch (e) { console.error('[VyraBildrad]', e); }
    return html;
  }

  // ---- Installation, ytterst i kedjan ----------------------------------------------------------
  // Samma vakt som ranking-sixpack.js (rang 2) och spellayout.js (rang 3): wrappern lägger sig ytterst
  // igen efter varje sent skript. Den måste ligga UTANFÖR ranking-sixpack.js (som byter rotens
  // innehåll) och playground-widgets.js (vars wh inte anropar kedjan för podiet). Rang 4: ingen av
  // dem lägger sig utanför den här, och en inre, äldre kopia släpper bara igenom.
  //
  // FÖRST NÄR SIDANS EGNA SKRIPT HAR KÖRT. Rangvakten hindrar en lägre rang från att lägga sig
  // utanför en högre — men också från att installera sig ALLS om den högre redan ligger ytterst.
  // Den här filen laddas asynkront från media.js och kan köra innan approved-rankings.js,
  // ranking-sixpack.js och spellayout.js (vanliga skript längre ned i studio.html) har installerat
  // sig; då ritades varje topplista med en gammal design (uppmätt i riggen, ungefär varannan
  // laddning). Därför väntar installationen på DOMContentLoaded.
  //
  // OCH FÖRST NÄR RANG 1–3 LIGGER YTTERST. Ett osorterat omslag (Gift Campaign Aura, laddas asynkront)
  // som körde strax före installationen hamnade annars innanför den här — och då kunde spellayout.js
  // aldrig lägga sig utanför det igen (vakten ser rang 4 ytterst), så Aura ritade gamingtemats Gift
  // Campaign med 0 platser (uppmätt i CI två gånger, gaming-overlay.browser.test.js). Ligger ett
  // osorterat omslag ytterst väntar den här tills rang 1–3 har sorterat sig vid nästa skript-load
  // (lyssnaren nedan registreras efter deras och körs därför sist). Efter ~5 s installeras den ändå.
  const RANG = 4;
  let djup = 0, forsok = 0;
  function install() {
    if (document.readyState === 'loading') return;
    if (typeof wh !== 'function' || wh.__vyraYtter >= RANG) return;
    if (!(wh.__vyraYtter >= 3) && forsok++ < 25) { setTimeout(install, 200); return; }
    const tidigare = wh;
    const f = function (w) {
      if (djup) return tidigare.apply(this, arguments);
      djup++;
      try { return markera(tidigare.apply(this, arguments), w); } finally { djup--; }
    };
    f.__vyraYtter = RANG;
    wh = f;
    try { if (typeof render === 'function') render(); } catch (_) {}
  }
  install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  document.addEventListener('load', e => { if (e.target && e.target.tagName === 'SCRIPT') install(); }, true);
  addEventListener('load', install, { once: true });

  window.VyraBildrad = Object.freeze({ FALT, BILD, RAD, RIKTNINGAR, PODIUM_MAX, kontroller, utoka, gruppFor, rkKompakt, bildFaktor, radTillagg, riktning, markera, rkGrupp, mvpGrupp });
})();
