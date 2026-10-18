(function () {
  'use strict';
  // H-falt + proportionslas (Etapp 5). Injiceras i ALLA paneler fran ETT stalle.
  //
  // Fas A matte varfor: POSITION & STORLEK-blocket ar duplicerat pa fem stallen
  // (premium-final.js:42, last-x-alerts.js x2, standalone-widgets.js, custom-widgets.js) medan
  // bindningen ar en enda (media.js:81). Att lagga H i alla fem hade skapat fem sanningar.
  //
  // FORSTA FORSOKET wrappade props() och skarvade in H i HTML-strangen. Det foll for tva av fyra
  // klasser, och matningen visade varfor: custom-widgets.js, premium-final.js, standalone-widgets.js
  // och last-x-alerts.js laddas DYNAMISKT (media.js:779/828/849 + bundlen pa 768), alltsa efter
  // varje statiskt skript. Deras props-wrappar hamnar darfor alltid utanpa min, och de returnerar
  // sin egen HTML utan att na inat. Ett statiskt skript kan aldrig bli ytterst i den kedjan.
  //
  // Losningen ar att sluta rora strangen och i stallet skarva in i den RENDERADE panelen. DOM:en
  // ar densamma oavsett vilken av de nio panelbyggarna som skrev den, och observern fangar aven
  // de paneler som ritas om asynkront efter att bind-kedjan redan kort.
  //
  // TRE KLASSER sedan 2026-10-18 — samma som handtagen (VyraTransform.klass), en sanning:
  //   media   egen bild/video — riktig bredd och hojd, LAST som default, kvoten ur lådan
  //   content egen text — riktig bredd och hojd, OLAST som default, texten radbryts
  //   fast    allt annat: fardiga kompositioner med bildmotiv, profilbilder, ramar och text.
  //
  // VARFOR FAST INTE LANGRE ANDRAR RIKTIGA MATT (verifieringen 2026-10-18, riktig Chrome, alla 173
  // katalogmodeller). Panelen hade fyra klasser och skrev w.width/w.height pa fasta kompositioner:
  //   * Laset tog kvoten ur FORSTA <img> i widgeten — profilbilden test-profile.svg (1:1) — sa ett
  //     klick gjorde Skattkista Pill 340x78 till 340x340 och Guardian 400x570 till 520x520.
  //   * Bredd hade ingen synlig verkan i 40 av 173 (rk6, Heart Goal, Level-larmen, Last X), i 55
  //     vaxte bara ladan och inte innehallet, och dar innehallet foljde stack det ut (Guardians aura
  //     28 px over och under ramen).
  //   * Hojd skrev style.height pa roten; innehallet foljde i 21 av 173 och resten fick en ram som
  //     inte omslot motivet (Top Coins basic-v2: 139 px innehall under ramen).
  //   * Faltet visade w.width / (bildens kvot) — inte det som ritades (Top Like 250x368 mot 189x278).
  // Handtagen skalar redan fasta kompositioner BARA likformigt (widget-handles.js). En fast komposition
  // har alltsa EN storleksfrihet, och panelen har EN kontroll for den: Storlek-reglaget. Bredd och
  // Hojd visar den RITADE ladan i dukens px (layoutmatt x zoom) och ar skrivskyddade med forklaring —
  // tre redigerbara kontroller for samma varde hade varit just den dubblett panelgranskningen stanger
  // (tests/browser/panel-inga-dubbletter.browser.test.js). Laset visas alltid last; det finns inget
  // att toggla. w.width och w.height lamnas orörda (Guardian ritar sin lada ur dem), och
  // vyra-proportioner skriver aldrig style.height pa en fast komposition.
  //
  // aspectRatio lases ur den RENDERADE noden, aldrig ur mediaMeta — den bar bara {name,id}
  // (uppmatt 2026-08-09). DOM ar sanningen; state kan sakna det man hoppas pa.

  const AR_KEY = 'aspectRatio';

  function nod(id) {
    return document.querySelector(`.editor-shell .canvas [data-id="${id}"]`) || document.querySelector(`.canvas [data-id="${id}"]`);
  }
  const T = () => window.VyraTransform;

  function storleksklass(w) {
    const t = T();
    if (t && typeof t.klass === 'function') return t.klass(w);
    if (w && w.type === 'templateCustomText') return 'text';
    if (w && (w.type === 'templateCustomImage' || w.type === 'templateCustomVideo' || w.type === 'video')) return 'media';
    return 'fast';
  }

  function kalla(w) {
    if (!w) return 'content';
    const k = storleksklass(w);
    if (k === 'media') return 'media';
    if (k === 'text') return 'content';
    return 'fast';
  }
  const lasbar = k => k === 'media' || k === 'content';

  // Ladans form. Egen media rapporterar sin naturliga form i fangaRatio vid filbyte; i ovrigt ar
  // det RITADE ladan som galler — det ar den anvandaren ser och den handtagen haller.
  // Rotationsvakt (2026-08-18): offsetmatten ar orroterade och ratta, bbox ar storre.
  function mattUrNod(w) {
    const el = nod(w.id);
    if (!el) return null;
    if (el.offsetWidth > 0 && el.offsetHeight > 0) return { w: el.offsetWidth, h: el.offsetHeight };
    const roterad = typeof w.rotation === 'number' && isFinite(w.rotation) && Math.abs(w.rotation) >= 0.01;
    if (roterad) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { w: r.width, h: r.height } : null;
  }

  // Den naturliga formen hos egen media — bara for media, och bara ur mediaelementet sjalvt.
  function naturligMedia(w) {
    const el = nod(w.id);
    const m = el && el.querySelector('img, video');
    if (!m) return null;
    const nw = m.naturalWidth || m.videoWidth, nh = m.naturalHeight || m.videoHeight;
    return nw > 0 && nh > 0 ? { w: nw, h: nh } : null;
  }

  // Kvoten for text/media: ladans sparade matt i forsta hand, annars den ritade ladan. Skriver
  // aldrig en ny hojd — ett klick pa laset far inte andra formen (det gjorde det 2026-10-18:
  // Skattkista Pill 340x78 -> 340x340).
  function ladansKvot(w) {
    if (Number(w.width) > 0 && Number(w.height) > 0) return w.width / w.height;
    const m = mattUrNod(w);
    return m ? m.w / m.h : 0;
  }
  function fangaRatio(w) {
    const k = ladansKvot(w);
    if (!(k > 0)) return null;
    w[AR_KEY] = k;
    return k;
  }
  // Last utan sparad kvot (en sparning eller synk dar den saknas) faller tillbaka pa ladan,
  // precis som handtagens nyLada — annars ignorerade Bredd/Hojd laset medan knappen sa "lasta".
  function kvotFor(w) {
    return Number(w[AR_KEY]) > 0 ? Number(w[AR_KEY]) : ladansKvot(w);
  }

  // Defaultlaget normaliseras en gang per widget, samma monster som studio.js:55 (state.flows??=).
  function normalisera(w) {
    const k = kalla(w);
    // Den gamla videowidgeten ('video') ar media for handtagen men var aldrig last som standard —
    // standardlaget behalls (tests/browser/skalfix.browser.test.js), laset gar att sla pa.
    if (w.aspectLocked === undefined && k !== 'fast') w.aspectLocked = k === 'media' && w.type !== 'video';
    return k;
  }

  // ---- FAST: den synliga ladan och en likformig skala ---------------------------------------
  function synlig(w) {
    const el = nod(w.id);
    const t = T();
    if (!el) return null;
    const r = t && t.lada ? t.lada(el) : { width: el.offsetWidth, height: el.offsetHeight };
    return r && r.width > 0 && r.height > 0 ? { b: Math.round(r.width), h: Math.round(r.height) } : null;
  }

  function skalaFor(w) { return Number(w.widgetScale) > 0 ? Number(w.widgetScale) : 1; }

  const MATT_TITEL = 'Ritad storlek. Färdiga kompositioner skalas alltid likformigt – ändra med Storlek eller handtagen';
  const LAS_TITEL = 'Proportionerna är alltid låsta för färdiga kompositioner – handtagen och Storlek håller formen';

  // Ett tomt H-falt sager "ingen hojd", vilket ar falskt — widgeten HAR en hojd pa duken, den ar
  // bara inte satt for hand. Faltet visar darfor den uppmatta hojden nar state saknar en, utan att
  // skriva den till state: en siffra i rutan far inte betyda att anvandaren last hojden.
  function visaHojd(w, k) {
    if (k === 'fast') { const m = synlig(w); return m ? m.h : ''; }
    if (w.height) return w.height;
    const m = mattUrNod(w);
    return m ? m.h : '';
  }

  // Kedjelaset sitter MELLAN W och H, dar det beskriver forhallandet mellan dem — inte efter H,
  // dar det hade lasts som en egenskap hos hojden.
  function markup(w, k) {
    const h = visaHojd(w, k);
    if (k === 'fast') {
      return `<button type="button" data-aspect-lock class="aspect-lock last" aria-pressed="true" disabled title="${LAS_TITEL}">` +
        `<i>🔗</i>Proportioner låsta</button>` +
        `<label data-aspect-source="fast">Höjd<input id="propHeight" type="number" value="${h}" disabled title="${MATT_TITEL}"></label>`;
    }
    const last = w.aspectLocked === true;
    return `<button type="button" data-aspect-lock class="aspect-lock${last ? ' last' : ''}" ` +
      `aria-pressed="${last}" title="${last ? 'Lås upp proportioner' : 'Lås proportioner'}">` +
      `<i>${last ? '🔗' : '🔓'}</i>${last ? 'Proportioner låsta' : 'Lås proportioner'}</button>` +
      `<label data-aspect-source="${k}">Höjd<input id="propHeight" type="number" min="40" max="1600" value="${h}"></label>`;
  }

  // Skarvar in H + kedjelas direkt efter Bredd-etiketten i den renderade panelen.
  // Returnerar widgeten nar nagot injicerades, annars null.
  function injicera() {
    if (typeof liveWidget !== 'function' || typeof view === 'undefined' || view !== 'editor') return null;
    const wFalt = document.querySelector('#propWidth');
    if (!wFalt) return null;
    const w = liveWidget(selected);
    if (!w) return null;
    const etikett = wFalt.closest('label') || wFalt.parentElement;
    if (!etikett) return null;
    const k = normalisera(w);
    const redan = document.querySelector('label[data-aspect-source]');
    // Ratt falt i ratt lage redan — ror inget, annars tappar ett falt under redigering fokus.
    if (redan && redan.dataset.aspectSource === k &&
        redan.dataset.last === String(w.aspectLocked === true)) return null;
    if (redan) redan.remove();
    const gammalKnapp = document.querySelector('[data-aspect-lock]');
    if (gammalKnapp) gammalKnapp.remove();
    etikett.insertAdjacentHTML('afterend', markup(w, k));
    const ny = document.querySelector('label[data-aspect-source]');
    if (ny) ny.dataset.last = String(w.aspectLocked === true);
    return w;
  }

  // Faltens VARDEN for en fast komposition foljer den ritade ladan efter varje render — panel-
  // byggarna skriver value="${w.width}", som inte ar det som syns.
  function visaMatt() {
    if (typeof liveWidget !== 'function' || typeof view === 'undefined' || view !== 'editor') return;
    const w = liveWidget(selected);
    if (!w || kalla(w) !== 'fast') return;
    const m = synlig(w);
    if (!m) return;
    const wFalt = document.querySelector('#propWidth'), hFalt = document.querySelector('#propHeight');
    for (const [f, v] of [[wFalt, m.b], [hFalt, m.h]]) {
      if (!f) continue;
      if (!f.disabled) { f.disabled = true; f.title = MATT_TITEL; f.removeAttribute('min'); f.removeAttribute('max'); }
      if (f.value !== String(v)) f.value = v;
    }
  }

  // Skriver BADA nycklarna. vyraLivePatch (media.js:143) uppdaterar bara den etikett den fick,
  // sa en tvanyckelsandring maste rita om panelen i stallet for att lita pa live-patchen.
  function rita() {
    if (typeof vyraRenderKeepingPanel === 'function') vyraRenderKeepingPanel();
    else render();
  }
  function satt(w, bredd, hojd) {
    w.width = Math.round(bredd);
    w.height = Math.round(hojd);
    save();
    rita();
  }

  function bindFalten() {
    if (typeof liveWidget !== 'function') return;
    const w = liveWidget(selected);
    if (!w) return;
    const k = kalla(w);
    if (k === 'fast') return;           // fangas i fonstrets capture-fas, se nedan
    const hFalt = document.querySelector('#propHeight');
    const knapp = document.querySelector('[data-aspect-lock]');

    // Olast: Hojd ar var egen (ingen panelbyggare binder den), Bredd ags av media.js:81 och
    // syskonbyggarna. Last: bada fangas i fonstrets capture-fas (faltHandelse nedan) — en tilldelning
    // har hade skrivits over av en panelbyggare som binder efter oss.
    if (hFalt && !hFalt.disabled) {
      hFalt.onchange = e => {
        const ny = +e.target.value;
        if (!(ny > 0)) return;
        w.height = ny; save(); rita();
      };
    }
    if (knapp && !knapp.disabled) {
      knapp.onclick = () => {
        if (!w.aspectLocked) fangaRatio(w);
        w.aspectLocked = !w.aspectLocked;
        save();
        rita();
      };
    }
    if (k === 'media' && w.aspectLocked && !(w[AR_KEY] > 0)) fangaRatio(w);
  }

  // BREDD/HOJD — i fonstrets capture-fas, fore varje panelbyggares egna oninput/onchange. For en
  // fast komposition ar falten skrivskyddade, men en byggare kan fortfarande fa en handelse (ett
  // skript, ett prov) och skriva w.width — den stoppas har. Last egen text/media raknas har.
  // Nio byggare binder #propWidth (media.js change(), Follower Alerts bindField
  // som skriver box.style.width direkt, ...) och flera laddas dynamiskt efter den har filen, sa en
  // tilldelning har hade skrivits over. Capture pa window kommer alltid forst.
  function faltHandelse(e) {
    const f = e.target;
    if (!f || (f.id !== 'propWidth' && f.id !== 'propHeight')) return;
    if (typeof liveWidget !== 'function' || typeof view === 'undefined' || view !== 'editor') return;
    const w = liveWidget(selected);
    if (!w) return;
    const k = kalla(w);
    if (k !== 'fast' && !w.aspectLocked) return;              // olast text/media: byggarna ager det
    e.stopImmediatePropagation();
    if (window.VyraGrans && typeof window.VyraGrans.slappNy === 'function') window.VyraGrans.slappNy(w.id);
    if (e.type !== 'change') return;
    const v = +f.value;
    if (k === 'fast') { visaMatt(); return; }
    // Last egen text/media: bada matten, med ladans kvot som reserv nar den sparade saknas.
    if (!(v > 0)) return;
    const kvot = kvotFor(w);
    if (!(kvot > 0)) { if (f.id === 'propWidth') w.width = v; else w.height = v; save(); rita(); return; }
    if (f.id === 'propWidth') satt(w, v, v / kvot); else satt(w, v * kvot, v);
  }
  window.addEventListener('input', faltHandelse, true);
  window.addEventListener('change', faltHandelse, true);

  // STORLEK — ETT reglage for hela kompositionen (2026-10-18).
  //
  // w.widgetScale fanns redan som hornhandtagens skala, men inget panelfalt skrev den utom Follower
  // Alerts egna SKALA-grupp. Reglaget injiceras har, i samma renderade panel som H-faltet, for varje
  // FAST komposition (VyraTransform.klass) — egen text och egen media andrar riktiga matt i stallet
  // och far inget. Finns Follower Alerts reglage (#followScale) redan visas inget till: tva reglage
  // for samma varde ar exakt den dubblett panelgranskningen stanger.
  //
  // Skalningen ar likformig och haller widgetens MITT stilla — mätt ur ladan (VyraTransform.
  // ankareLada), inte ur skarmens rect, och forankrad igen efter render nar ett lasbarhetslage
  // byter layout. oninput ar en ren stilpatch — vyraLivePatch byter outerHTML och PR #221:s kontrakt
  // ar att ett reglage inte river vyn; onchange gar genom save-tratten. Golvet foljer vardet nedat:
  // en migrerad widget pa 19 % ska inte hoppa till 20 % bara for att reglaget ror sig.
  let storlekAnkare = null;
  function injiceraStorlek() {
    if (typeof liveWidget !== 'function' || typeof view === 'undefined' || view !== 'editor') return;
    const w = liveWidget(selected);
    const t = T();
    const befintlig = document.getElementById('propScale');
    if (!w || !t || t.klass(w) !== 'fast' || document.getElementById('followScale')) {
      if (befintlig) (befintlig.closest('label') || befintlig).remove();
      return;
    }
    const pct = Math.round(skalaFor(w) * 100);
    if (befintlig) {
      if (document.activeElement !== befintlig && befintlig.value !== String(pct)) {
        befintlig.value = pct;
        const b = befintlig.closest('label') && befintlig.closest('label').querySelector('b');
        if (b) b.textContent = pct + '%';
      }
      return;
    }
    let ankare = document.querySelector('label[data-aspect-source]');
    if (!ankare) {
      const wFalt = document.getElementById('propWidth');
      ankare = wFalt && (wFalt.closest('label') || wFalt.parentElement);
    }
    if (!ankare) return;
    ankare.insertAdjacentHTML('afterend',
      `<label class="range-label" data-storlek-falt style="grid-column:1/-1">Storlek <b>${pct}%</b>` +
      `<input id="propScale" type="range" min="${Math.min(20, pct)}" max="${Math.max(400, pct)}" step="1" value="${pct}"></label>`);
    const falt = document.getElementById('propScale');
    const visning = falt.closest('label').querySelector('b');
    falt.oninput = () => {
      const ny = Math.round(+falt.value) / 100;
      if (!(ny > 0)) return;
      visning.textContent = Math.round(ny * 100) + '%';
      const el = nod(w.id);
      if (!el) { w.widgetScale = ny; return; }
      if (!storlekAnkare) storlekAnkare = t.ankareLada(el, 'mitt', true);
      t.tystna(el);
      t.satSkala(w, el, ny);
      t.hallLada(w, el, storlekAnkare, 'mitt', true);
    };
    falt.onchange = () => {
      falt.oninput();
      const ankarpunkt = storlekAnkare;
      storlekAnkare = null;
      rita();
      const efter = nod(w.id);
      if (efter && ankarpunkt) t.hallLada(w, efter, ankarpunkt, 'mitt', true);
      save();
    };
  }

  if (typeof bind === 'function') {
    const inreBind = bind;
    bind = function () {
      inreBind.apply(this, arguments);
      if (typeof view !== 'undefined' && view !== 'editor') return;
      injicera();
      bindFalten();
      injiceraStorlek();
      visaMatt();
    };
  }

  // Byter anvandaren fil ska laset folja den NYA formen — annars beskars bilden tyst. Ladan far
  // filens form direkt (bredden star kvar, hojden foljer), sa att nasta lasta andring inte hoppar
  // till en ny form: forr fangades bara kvoten och ladan stod kvar pa 300x300, och forsta
  // handtagsdraget gav 272x340 med motsatt kant pa drift.
  window.addEventListener('vyra-media-bytt', e => {
    const id = e.detail && e.detail.id;
    const w = (typeof state !== 'undefined' && state.widgets || []).find(x => x && x.id === id);
    if (!w || !w.aspectLocked) return;
    const n = naturligMedia(w);
    if (n) {
      w[AR_KEY] = n.w / n.h;
      if (Number(w.width) > 0) w.height = Math.round(w.width / w[AR_KEY]);
    } else fangaRatio(w);
    save();
  });

  // Hojden maste ge verkan pa duken, annars vore faltet en siffra utan innebord — precis den
  // sortens UI-logn arbetet stangt fyra ganger om. Observern bar bade den appliceringen och
  // injektionen, av samma skal som vyra-historik.js: render-wrappar nar inte editor-vyn
  // (se studio.js), och panelen ritas om av flera asynkrona byggare.
  // BARA egen text/media: en fast komposition ritar sin egen hojd (Guardian ur w.height, Like
  // Fountain Portal ur bredden), och en tvingad style.height gav en ram som inte omslot motivet.
  function applicera() {
    if (typeof state === 'undefined' || !Array.isArray(state.widgets)) return;
    state.widgets.forEach(w => {
      if (!w || !w.height || kalla(w) === 'fast') return;
      const el = nod(w.id);
      if (el && el.style.height !== w.height + 'px') el.style.height = w.height + 'px';
    });
  }
  function svep() {
    applicera();
    if (injicera()) bindFalten();
    injiceraStorlek();
    visaMatt();
  }
  const vyRot = document.getElementById('view');
  if (vyRot) new MutationObserver(svep).observe(vyRot, { childList: true, subtree: true });

  window.VyraProportioner = { kalla, lasbar, fangaRatio, injicera, injiceraStorlek, synlig, kvotFor };
})();
