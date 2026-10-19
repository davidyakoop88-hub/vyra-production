(function () {
  'use strict';
  // VyraTransform — rotens ENDA skrivare av `transform`, och ägaren av widgetens likformiga skala.
  //
  // ROTATION, INGET ANNAT (2026-10-18). Formen var `rotate(θdeg) scaleY(sy)` sedan 2026-08-18,
  // med sy ur w.widgetScaleY som över/under-handtagen skrev. Beslut 2026-10-18 (ersätter beslutet
  // 2026-08-13 om sträckning): INGET innehåll får sträckas av misstag. Granskningen samma dag mätte
  // 173 av 173 katalogmodeller som kunde få skilda X/Y-skalor — även med proportionslåset på
  // (Top Like Voltage fick matrix(1,0,0,0.8,0,0) med låset PÅ, Guardian i sändningen scaleY(0.3)).
  // Transformen här är därför bara `rotate(θdeg)` med origin CENTER. widgetScaleY läses aldrig
  // som en sträckning längre — den migreras bort (se migrera() nedan).
  //
  // !important av uppmätt skäl: inline utan den gav beräknad identitetsmatris — någon regel vann
  // kaskaden (widget-handles.js-mätningen 2026-08-13).
  //
  // NEUTRALLÄGE = FRÅNVARO. Rotation 0/saknas ⇒ propertyn tas bort helt, så orörda layouter är
  // pixelidentiska — och widgets vars design animerar transform på ROTEN behåller sina animationer
  // så länge de inte roteras.
  //
  // APPLICERAS PÅ ALLA widgets efter varje render, i både editor och overlay (overlay.html är en
  // redirect till studio.html?overlay=1 med samma render-kedja) — samma målare i Layout och OBS.
  //
  // Defensivt mot molnet: servern validerar bara widgets-id, så värdena kan komma korrupta —
  // allt som inte är ett ändligt tal behandlas som neutralt, aldrig krasch.

  function tal(v, reserv) { return (typeof v === 'number' && isFinite(v)) ? v : reserv; }
  function vinkel(w) { return tal(w && w.rotation, 0); }

  // STORLEKSKLASSER — vilken sorts storleksändring en widget tål.
  //   text   Egen text: riktig bredd och höjd, texten radbryts. Aldrig skala per axel.
  //   media  Egen bild/video (och den gamla videowidgeten): riktig bredd och höjd, innehållet
  //          passas in eller beskärs med object-fit ("Anpassning" i panelen). Aldrig sträckning.
  //   fast   Allt annat — färdiga kompositioner med bildmotiv, profilbilder, ramar och text.
  //          Skalas BARA likformigt (w.widgetScale), från alla handtag och från Storlek-reglaget.
  const MEDIA = { templateCustomImage: 1, templateCustomVideo: 1, video: 1 };
  function klass(w) {
    if (!w) return 'fast';
    if (w.type === 'templateCustomText') return 'text';
    if (MEDIA[w.type]) return 'media';
    return 'fast';
  }

  // SKALA SOM BOR I ROTENS TRANSFORM (2026-10-19). Top Coins Halo och Signal Orbit (topcoins-v2.css)
  // och Top Points (toppoints-v2.css, idag bara pensionerade vägar — rk6 tar bort klassen) skalar med
  // `transform: scale(var(--tc-scale|--tp-scale))` kring ÖVRE VÄNSTRA hörnet. Inline `rotate(θ)
  // !important` ersatte den regeln helt: uppmätt i Chrome föll Halo vid widgetScale 1.6 från 368 till
  // 230 px bred så fort den roterades. Skalan stannar i sin mekanism (zoom hade flyttat varje sparad
  // layout med skala ≠ 1, eftersom zoom multiplicerar left/top och transformen inte gör det) och
  // komponeras här: samma likformiga s på båda axlarna, rotation kring den SKALADE lådans mitt.
  // Med origin center är det translate((s−1)·50 %) rotate(θ) scale(s): mitten hamnar på s·(B/2, H/2)
  // från left/top, precis där den oroterade regeln har den, så rotationen flyttar aldrig widgeten.
  function cssSkala(el) {
    if (!el || !el.classList || !el.style) return 1;
    var namn = el.classList.contains('vyra-topcoins-new') ? '--tc-scale'
      : el.classList.contains('vyra-toppoints-new') ? '--tp-scale' : '';
    if (!namn || parseFloat(el.style.zoom) > 0) return 1;
    var v = parseFloat(el.style.getPropertyValue(namn));
    return v > 0 && isFinite(v) ? v : 1;
  }

  function applicera(w, el) {
    if (!w || !el || !el.style) return;
    var rot = vinkel(w);
    if (Math.abs(rot) < 0.01) {
      if (el.style.getPropertyValue('transform')) el.style.removeProperty('transform');
      if (el.style.getPropertyValue('transform-origin')) el.style.removeProperty('transform-origin');
      return;
    }
    var t = 'rotate(' + rot + 'deg)';
    var s = cssSkala(el);
    if (Math.abs(s - 1) >= 0.0005) {
      var p = Math.round((s - 1) * 50 * 10000) / 10000;
      t = 'translate(' + p + '%, ' + p + '%) ' + t + ' scale(' + s + ')';
    }
    // Skriv bara vid faktisk ändring — observern nedan ska inte mata sig själv, och en
    // omskrivning av samma värde är en gratis style-invalidering per render.
    if (el.style.getPropertyValue('transform') !== t) el.style.setProperty('transform', t, 'important');
    if (el.style.getPropertyValue('transform-origin') !== 'center') el.style.setProperty('transform-origin', 'center', 'important');
  }

  // ---- LIKFORMIG SKALA ----------------------------------------------------------------------
  //
  // w.widgetScale ritas av de flesta renderare som `zoom` på roten. UPPMÄTT 2026-10-18 i riktig
  // Chrome, alla 220 katalognycklar med widgetScale 1.5: 173 svarade, men Gift Fireworks (8),
  // Heart Fireworks, Gift Bubbles, Goal Pro (10), Podium Pro (14) och Streak Pro (6) ritade INGEN
  // skala alls — hörnhandtaget ändrade alltså w.widgetScale utan att något syntes efter render.
  // De får zoomen härifrån. Två mekanismer finns redan och lämnas i fred: Top Coins skalar via
  // `--tc-scale` (transform i CSS) och Top Points via `--tp-scale` (zoom i CSS).
  const egenZoom = typeof WeakSet === 'function' ? new WeakSet() : null;

  function zoomFor(el) {
    if (!el) return 1;
    var cz = NaN;
    try { cz = parseFloat(getComputedStyle(el).zoom); } catch (_) {}
    if (cz > 0) return cz;
    var iz = parseFloat(el.style && el.style.zoom);
    return iz > 0 ? iz : 1;
  }

  function zooma(w, el) {
    if (klass(w) !== 'fast') return;
    var s = tal(w.widgetScale, 1);
    var vår = egenZoom && egenZoom.has(el);
    if (!(s > 0) || Math.abs(s - 1) < 0.0005) {
      if (vår) { el.style.removeProperty('zoom'); egenZoom.delete(el); }
      return;
    }
    if (vår) { if (el.style.zoom !== String(s)) el.style.zoom = s; return; }
    if (el.style.zoom) return;                                   // renderaren skalar själv
    var stil = el.getAttribute('style') || '';
    if (/--tc-scale|--tp-scale/.test(stil)) return;              // egen CSS-mekanism
    var cz = NaN;
    try { cz = parseFloat(getComputedStyle(el).zoom); } catch (_) {}
    if (cz > 0 && Math.abs(cz - 1) > 0.0005) return;             // zoom ur en CSS-regel
    el.style.zoom = s;
    if (egenZoom) egenZoom.add(el);
  }

  // Sätt en ny likformig skala på en RENDERAD rot, utan render() (under ett drag eller ett
  // reglage). Renderarens egna faktorer bevaras: Last X ritar zoom = dragskala × widgetScale,
  // så en inline-zoom skrivs om i proportion i stället för att ersättas.
  //
  // ZOOM FÖRE VARIABLERNA (2026-10-18, verifieringen). ranking-sixpack.js (rk6) tar bort Top Coins/
  // Top Points egna klasser och skalar med inline-zoom, men `--tc-scale`/`--tp-scale` låg kvar i
  // stilen. satSkala skrev då bara variabeln, som ingen regel längre läste: under draget syntes
  // ingenting (Royal Rose 390x157 stod still medan widgetScale gick 1 -> 1.254) och vid släppet
  // hoppade widgeten 65 px. En inline-zoom är alltid den mekanism som faktiskt ritar.
  function satSkala(w, el, ny) {
    if (!w || !(ny > 0)) return;
    var gammal = tal(w.widgetScale, 1) > 0 ? tal(w.widgetScale, 1) : 1;
    w.widgetScale = ny;
    if (!el || !el.style) return;
    var iz = parseFloat(el.style.zoom);
    if (!(iz > 0)) {
      // En roterad Halo bär skalan i den inline-transform applicera() komponerade — skriv om den också.
      // Handtagen skalas av samma transform, så motzoomen följer med (widget-handles.js motzooma).
      var namn = el.style.getPropertyValue('--tc-scale') ? '--tc-scale' : el.style.getPropertyValue('--tp-scale') ? '--tp-scale' : '';
      if (namn) {
        el.style.setProperty(namn, String(ny));
        applicera(w, el);
        if (window.VyraHandtag && typeof window.VyraHandtag.motzooma === 'function' && el.classList && el.classList.contains('selected')) window.VyraHandtag.motzooma(el);
        return;
      }
    }
    if (iz > 0 && !(egenZoom && egenZoom.has(el))) el.style.zoom = String(Math.round(iz * ny / gammal * 10000) / 10000);
    else { el.style.zoom = String(ny); if (egenZoom) egenZoom.add(el); }
  }

  // FÖRANKRINGEN. Den punkt som ska stå still när widgeten växer: motsatt kant och mitten av den
  // andra axeln för sidhandtagen, motsatt hörn för hörnen — kontraktet ur #158-163 (ned håller
  // överkanten, upp håller underkanten, höger håller vänsterkanten, vänster håller högerkanten).
  // En roterad widget, Storlek-reglaget och migreringen håller MITTEN, som är rotationsinvariant.
  function ankarpunkt(r, riktning, mitten) {
    if (mitten || !riktning || riktning === 'mitt') return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    var x = riktning.indexOf('w') >= 0 ? r.right : riktning.indexOf('e') >= 0 ? r.left : r.left + r.width / 2;
    var y = riktning.indexOf('n') >= 0 ? r.bottom : riktning.indexOf('s') >= 0 ? r.top : r.top + r.height / 2;
    return { x: x, y: y };
  }

  // Flytta roten så att ankaret hamnar där det stod. MÄTT, inte härlett: zoom multiplicerar
  // `left`/`top` (uppmätt 2026-08-13 och igen 2026-10-18: left 60 vid zoom 1.5 ritas på 90),
  // men en transform-skala (Top Coins) gör det inte. Skärmförskjutningen delas därför med
  // kanvasskalan gånger rotens FAKTISKA zoom — då blir det rätt för båda mekanismerna.
  function forankra(w, el, ankare, riktning, mitten, kanvas) {
    if (!w || !el || !ankare || typeof el.getBoundingClientRect !== 'function') return;
    var r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    var p = ankarpunkt(r, riktning, mitten);
    var m = (kanvas > 0 ? kanvas : 1) * zoomFor(el);
    if (!(m > 0)) return;
    w.x = Math.round(tal(w.x, 0) + (ankare.x - p.x) / m);
    w.y = Math.round(tal(w.y, 0) + (ankare.y - p.y) / m);
    el.style.left = w.x + 'px';
    el.style.top = w.y + 'px';
  }

  // ---- FÖRANKRING UR LÅDAN, INTE UR SKÄRMEN (2026-10-18, verifieringen) -----------------------
  //
  // forankra() ovan mäter getBoundingClientRect. Det gav fel på tre sätt, alla uppmätta:
  //   1. En rot med `transition` (Battle MVP gold-ribbon, Gifter Level) visar en zoom på väg —
  //      rect stod kvar på 280 px fast zoom 2 var skrivet, och mitten flyttade (-200, -234) px.
  //   2. Läsbarhetslägena (lv-kompakt, rk6-kompakt) byter layout först i render() vid släppet, så
  //      ett ankare räknat under draget var ogiltigt efteråt (Top Like n-handtaget: 89 px).
  //   3. En entréanimation på roten flyttar rect utan att flytta widgeten.
  // Lådan räknas därför i dukens egna px ur det som FAKTISKT bestämmer den: style.left/top,
  // offsetmåtten (ozoomade, orroterade) och MÅLzoomen (inline-värdet, inte ett animerat
  // mellanläge). Zoom multiplicerar både storlek och left/top; Top Coins Halo/Signal Orbit skalar
  // med transform kring övre vänstra hörnet och flyttar inte left/top. Rotationen går kring
  // mitten och flyttar den aldrig, så en roterad widget förankras i sin mitt.
  function malZoom(el) {
    var iz = parseFloat(el && el.style && el.style.zoom);
    return iz > 0 ? iz : zoomFor(el);
  }
  function lada(el) {
    if (!el || !el.style) return null;
    var z = malZoom(el), s = 1;
    // Transformskalan gäller även roterad: applicera() komponerar den i stället för att ersätta den,
    // och rotationen går kring den skalade lådans mitt — lådan är densamma som oroterad.
    if (Math.abs(z - 1) < 0.0005) s = cssSkala(el);
    var x = parseFloat(el.style.left), y = parseFloat(el.style.top);
    if (!isFinite(x)) x = 0;
    if (!isFinite(y)) y = 0;
    var b = el.offsetWidth || 0, h = el.offsetHeight || 0;
    return { left: x * z, top: y * z, width: b * z * s, height: h * z * s,
      right: (x + b * s) * z, bottom: (y + h * s) * z, zoom: z, x: x, y: y };
  }
  function ankareLada(el, riktning, mitten) {
    var r = lada(el);
    return r ? ankarpunkt(r, riktning, mitten) : null;
  }
  // Flyttar roten så att ankaret (ur ankareLada) står där det stod. Ändrar w.x/w.y med exakt den
  // förskjutning som left/top fick, så att en renderare som ritar left = w.x + något behåller sitt.
  function hallLada(w, el, ankare, riktning, mitten) {
    if (!w || !el || !ankare) return;
    // En nod som just ritats har inte fått sin zoom härifrån än (observern nedan är en mikrouppgift
    // efter render) — mätt utan den gled Gift Bubbles (-130, -242) px vid Storlek 50 %.
    zooma(w, el);
    var r = lada(el);
    if (!r || !(r.zoom > 0)) return;
    var p = ankarpunkt(r, riktning, mitten);
    var dx = Math.round((ankare.x - p.x) / r.zoom), dy = Math.round((ankare.y - p.y) / r.zoom);
    if (!dx && !dy) return;
    w.x = Math.round(tal(w.x, 0) + dx);
    w.y = Math.round(tal(w.y, 0) + dy);
    el.style.left = (r.x + dx) + 'px';
    el.style.top = (r.y + dy) + 'px';
  }
  // Under ett drag eller ett reglage ska roten inte animera sin zoom (studio.css .battle-mvp:
  // transition 0.4s all) — bilden släpar annars efter pekaren. Släpps vid nästa render, som ritar
  // en ny nod; tystna(el, false) tar bort det för hand.
  function tystna(el, pa) {
    if (!el || !el.style) return;
    if (pa === false) el.style.removeProperty('transition');
    else el.style.setProperty('transition', 'none', 'important');
  }

  // ---- MIGRERING AV SPARAD STRÄCKNING (widgetScaleY) ------------------------------------------
  //
  // REGELN, en gång per widget, idempotent:
  //   1. widgetScaleY tas bort. Ett neutralt (≈1) eller korrupt värde tas bara bort.
  //   2. Fast komposition: sträckningen sy ersätts av en LIKFORMIG skala som bevarar ytan —
  //      ny widgetScale = widgetScale × √sy. (Bredd × höjd var B·z × H·z·sy; nu B·z' × H·z' med
  //      z' = z·√sy, samma yta, naturlig form.)
  //   3. Den synliga MITTPUNKTEN står kvar. Sträckningen gick kring mitten (origin center), så
  //      mitten var lådans mitt: (x + B/2)·z. Med zoomkvoten q = z/z' blir
  //      x' = x·q + (B/2)·(q − 1), och detsamma för y med H. B och H är lådans layoutmått
  //      (offsetWidth/offsetHeight, som zoom inte påverkar); saknas de används w.width/w.height,
  //      och saknas även de förankras den axeln i sin skalade överkant.
  //   4. Egen text och egen media: sträckningen blir RIKTIG höjd i stället — höjd × sy — med
  //      samma mittpunkt (y + (H − H')/2). Där finns ingen zoom att räkna med.
  //   5. Inget annat fält skrivs: färger, text, design, bredd och lager står orörda.
  //
  // NÄR: när widgeten ritas (studio OCH overlay), före första målningen — observern nedan är en
  // mikrouppgift efter render. Sändningen blir alltså rätt även innan studion har öppnats. En
  // widget som inte ritas i den här vyn får vänta tills den ritas: sträckningen syns ingenstans
  // längre, så att vänta kostar inget och ger rätt mått. Migreringen SPARAR INTE (inga skrivningar
  // vid mount, tests/inga-mount-migreringar.test.js); värdet följer med nästa sparning användaren
  // själv gör, och tills dess migrerar varje läsare likadant ur samma sparade värde.
  const STANDARDHOJD = { templateCustomText: 90, templateCustomImage: 300, templateCustomVideo: 450, video: 450 };

  function migrera(w, matt) {
    if (!w || typeof w !== 'object' || !Object.prototype.hasOwnProperty.call(w, 'widgetScaleY')) return null;
    var sy = w.widgetScaleY;
    delete w.widgetScaleY;
    var k = klass(w);
    if (!(typeof sy === 'number' && isFinite(sy) && sy > 0) || Math.abs(sy - 1) < 0.005) return { klass: k, sy: 1 };
    var m = matt || {};
    var y0 = tal(w.y, 0);
    if (k !== 'fast') {
      var h0 = tal(w.height, 0) || tal(m.hojd, 0) || STANDARDHOJD[w.type] || 0;
      if (h0 > 0) {
        var h1 = Math.max(20, Math.round(h0 * sy));
        w.height = h1;
        w.y = Math.round(y0 + (h0 - h1) / 2);
      }
      return { klass: k, sy: sy };
    }
    var s0 = tal(w.widgetScale, 1) > 0 ? tal(w.widgetScale, 1) : 1;
    var s1 = Math.round(s0 * Math.sqrt(sy) * 1000) / 1000;
    var q = s0 / s1;
    var b = tal(m.bredd, 0) || tal(w.width, 0);
    var h = tal(m.hojd, 0) || tal(w.height, 0);
    w.widgetScale = s1;
    w.x = Math.round(tal(w.x, 0) * q + (b / 2) * (q - 1));
    w.y = Math.round(y0 * q + (h / 2) * (q - 1));
    return { klass: k, sy: sy, fran: s0, till: s1 };
  }

  // Migrera en widget vars rot redan står i DOM, och för över resultatet till noden direkt så att
  // första målningen redan är rätt (render() hinner inte köra igen före den).
  // En projektion kan byta statens innehåll mot det SPARADE (omigrerade) värdet utan att rita om.
  // Noden bär då redan resultatet — samma regel ur samma värde ger samma tal, så bara state
  // skrivs om. Utan vakten hade zoomen skalats om en gång till ovanpå sig själv.
  const migreradeNoder = typeof WeakSet === 'function' ? new WeakSet() : null;

  function migreraNod(w, el) {
    var matt = (el.offsetWidth > 0 && el.offsetHeight > 0) ? { bredd: el.offsetWidth, hojd: el.offsetHeight } : null;
    var fore = tal(w.widgetScale, 1);
    var r = migrera(w, matt);
    if (!r || r.sy === 1) return;
    var redan = migreradeNoder && migreradeNoder.has(el);
    if (migreradeNoder) migreradeNoder.add(el);
    if (redan) return;
    if (r.klass === 'fast') {
      w.widgetScale = fore;                    // satSkala räknar kvoten mot det gamla värdet
      satSkala(w, el, r.till);
    } else if (w.height) {
      el.style.height = w.height + 'px';
    }
    el.style.left = tal(w.x, 0) + 'px';
    el.style.top = tal(w.y, 0) + 'px';
  }

  function nodFor(w) {
    return document.querySelector('.canvas [data-id="' + String(w.id).replace(/"/g, '') + '"]');
  }

  function appliceraAlla() {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.widgets)) return;
    for (var i = 0; i < state.widgets.length; i++) {
      var w = state.widgets[i];
      if (!w || w.id == null) continue;
      var el = nodFor(w);
      if (!el) continue;
      if (Object.prototype.hasOwnProperty.call(w, 'widgetScaleY')) migreraNod(w, el);
      applicera(w, el);
      zooma(w, el);
      // Handtagens motzoom följer rotens zoom även när den sätts här, efter handtagens egen synk.
      if (window.VyraHandtag && typeof window.VyraHandtag.motzooma === 'function' && el.classList && el.classList.contains('selected')) window.VyraHandtag.motzooma(el);
    }
  }

  window.VyraTransform = {
    applicera: applicera, appliceraAlla: appliceraAlla, klass: klass, migrera: migrera,
    satSkala: satSkala, cssSkala: cssSkala, ankarpunkt: ankarpunkt, forankra: forankra, zoomFor: zoomFor,
    lada: lada, ankareLada: ankareLada, hallLada: hallLada, tystna: tystna, nodFor: nodFor
  };

  // ---- Panelfaltet: injiceras efter Hojd-faltet i den RENDERADE panelen (tech-debt paragraf 9:
  // dynamiskt laddade panelbyggare hamnar alltid utanpa ett statiskt skripts props-wrap, sa
  // faltet far ALDRIG skrivas in i props()-strangarna). oninput ar en ren stilpatch via
  // komposoren — vyraLivePatch byter outerHTML och PR #221:s kontrakt ar att textfalt inte
  // river vyn. onchange gar genom save-tratten. Fokusvakten ar proportioner-lardomen:
  // ror inte DOM nar ratt falt redan star ratt.
  function injiceraFalt() {
    if (typeof view === 'undefined' || view !== 'editor') return;
    if (typeof liveWidget !== 'function' || typeof selected === 'undefined') return;
    var w = liveWidget(selected);
    if (!w) return;
    var varde = (typeof w.rotation === 'number' && isFinite(w.rotation)) ? w.rotation : 0;
    var falt = document.getElementById('propRotation');
    if (falt) {
      if (document.activeElement !== falt && falt.value !== String(varde)) falt.value = varde;
      return;
    }
    var ankare = document.querySelector('label[data-aspect-source]');
    if (!ankare) {
      var wFalt = document.getElementById('propWidth');
      ankare = wFalt && (wFalt.closest('label') || wFalt.parentElement);
    }
    if (!ankare) return;
    ankare.insertAdjacentHTML('afterend',
      '<label data-rotation-falt>Rotation (°)<input id="propRotation" type="number" step="1" min="-180" max="180" value="' + varde + '"></label>');
    falt = document.getElementById('propRotation');
    falt.oninput = function () {
      var v = parseFloat(falt.value);
      if (!isFinite(v)) return;
      var el = nodFor(w);
      if (el) applicera({ rotation: v }, el);
    };
    falt.onchange = function () {
      var v = parseFloat(falt.value);
      w.rotation = isFinite(v) ? Math.max(-180, Math.min(180, Math.round(v * 10) / 10)) : 0;
      if (typeof save === 'function') save();
      if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel();
      else if (typeof render === 'function') render();
    };
  }

  // Post-render-applicering utan editor-grind: samma målare når editorn och sändningen.
  // childList-observation ser inte style-skrivningarna ovan, så ingen loop. Projektioner
  // byter statens INNEHÅLL utan DOM-ändring — därför även sessionssignalerna
  // (scenbakgrund-lärdomen: OBS-vägen projicerar efter sidladdning).
  new MutationObserver(function () { appliceraAlla(); injiceraFalt(); }).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('vyra-session-state', appliceraAlla);
  addEventListener('vyra-session-state-saved', appliceraAlla);
  appliceraAlla();
})();
