// Guardian-modeller. Guldets fyra praktsteg bevaras; originalet och Grön aura är egna ramar.
// Samma ge-avatar/ge-namn och ge-step-4 låter live-triggern och fasklockan arbeta oförändrat.
(function (root) {
  'use strict';
  if (root.VyraGuardianModels) return;

  const EMERALD = {
    bild: 'emerald.png', aspect: 1,
    circle: {left: 35.1, top: 45.3, width: 29.8, height: 29.8}
  };
  const SAPPHIRE = {
    bild: 'sapphire.png', aspect: 1,
    circle: {left: 33.952381, top: 48.666667, width: 31.809524, height: 31.809524}
  };
  const MODELLER = {sapphire:SAPPHIRE, emerald:EMERALD};
  const modell = w => w && Object.hasOwn(MODELLER,w.guardianModel) ? w.guardianModel : 'classic';
  root.VyraGuardianModels = {modell, EMERALD, SAPPHIRE};

  const tidigareWh = wh;
  wh = function (w) {
    const m = modell(w), geo = MODELLER[m];
    if (w.type !== 'templateGuardianEmblem' || !geo) return tidigareWh(w);
    const t = geText(w), F = root.VyraGuardianEmblemFas;
    const engelska = F && F.sprak(w) === 'en';
    const vald = selected === w.id;
    return `<div class="widget guardian-emblem gem-model gem-${m} ge-step-4${vald?' selected':''}" data-id="${VyraSafe.text(w.id)}" style="left:${w.x}px;top:${w.y}px;width:${w.width||400}px;height:${w.height||570}px;zoom:${w.widgetScale||1}">`
      + `<div class="gem-aura" aria-hidden="true"></div>`
      + `<div class="gem-intro">${engelska?'A GUARDIAN ARRIVES':'EN BESKYDDARE ANLÄNDER'}</div>`
      + geDel('bild',w,t,geo)
      + `<div class="gem-rubrik">${VyraSafe.text(t.banderoll)}</div>`
      + geDel('namn',w,t,geo) + geDel('undertext',w,t,geo)
      + (vald?'<span class="resize-handle">&#8600;</span>':'') + '</div>';
  };

  const tidigareProps = props;
  props = function () {
    const html = tidigareProps(), w = liveWidget(selected);
    if (!w || w.type !== 'templateGuardianEmblem') return html;
    const m = modell(w);
    const val = '<label>Modell<select id="geModel">'
      + Object.entries(VyraWidgets.variants('guardianemblem.model')).map(([key,namn]) =>
        `<option value="${key}"${m===key?' selected':''}>${VyraSafe.text(namn)}</option>`).join('')
      + '</select></label>';
    let panel = html.replace(/<h4 data-ge-prakt>[\s\S]*?<\/h4>/, '<h4>UTSEENDE</h4>' + val);
    // Praktstegen tillhör guldmodellen. Valet sparas när modellen byts tillbaka.
    if (m !== 'classic') panel = panel.replace('<label data-ge-steg>', '<label data-ge-steg hidden>');
    return panel;
  };

  const tidigareBind = bind;
  bind = function () {
    tidigareBind();
    if (view !== 'editor' && view !== 'overlay') return;
    const w = liveWidget(selected), val = document.querySelector('#geModel');
    if (view === 'editor' && w && w.type === 'templateGuardianEmblem' && val) {
      val.onchange = e => {
        // Låg emblemet helt på duken före bytet passas det in igen om de nya proportionerna
        // skjuter ut det (F02). Låg det redan delvis utanför är det ett val och flyttas inte.
        const inne = !!(root.VyraGrans && root.VyraGrans.inneHelt(w.id));
        w.guardianModel = modell({guardianModel:e.target.value});
        const matt = VyraWidgets.variants('guardianemblem.matt')[w.guardianModel==='classic'?geStegAv(w):'4'];
        // Behåll användarens storlek; byt bara proportionerna mellan modellerna.
        w.height = Math.round((Number(w.width)||400) * matt[1] / matt[0]);
        save(); vyraRenderKeepingPanel();
        if (inne) root.VyraGrans.flyttaIn([w.id]);
      };
    }
    const section = document.querySelector('[data-guardian-emblem]');
    if (!section) return;
    section.querySelector('h4').textContent = 'GUARDIAN EMBLEM';
    const namn = VyraWidgets.variants('guardianemblem.model');
    Object.entries(MODELLER).forEach(([key,geo]) => {
      if (section.querySelector(`[data-ge-model="${key}"]`)) return;
      const knapp = document.createElement('button');
      knapp.dataset.geModel = key;
      knapp.dataset.catalogKey = 'catalog:guardianemblem:model:' + key;
      const beskrivning = key==='sapphire'?'Originalet · blå kristaller och fyra entréfaser':'Smaragd, guld och fyra entréfaser';
      knapp.innerHTML = `<i><img src="assets/guardian-emblem/${geo.bild}" alt="" width="48" height="48"></i><span><b>${VyraSafe.text(namn[key])}</b><small>${beskrivning}</small></span>`;
      knapp.onclick = () => {
        const skapad = VyraWidgets.create(knapp.dataset.catalogKey);
        state.widgets = state.widgets.filter(w => VyraWidgets.isStandalone(w) || w.type !== 'templateGuardianEmblem');
        state.widgets.push(skapad); selected = skapad.id; save(); render();
        toast('Guardian · ' + namn[key] + ' skapad');
      };
      section.append(knapp);
    });
  };
  // ---- PLATSEN: sparade emblem står kvar där de syntes (2026-10-20) ----------------------------
  //
  // guardian-emblem.css gav förut lådan `position:relative`, så emblemet låg i flödet i stället för
  // absolut på sin x/y. Ensam i duken (det vanliga) blev det samma plats — uppmätt: x/y exakt, både
  // i studion och overlayn. Men låg en annan låda i flödet FÖRE den (ett andra emblem, Fan Level
  // heartbeat, Gifter Level orbitlevel) sköts emblemet ned med den lådans höjd. Nu när lådan är
  // absolut hade ett sådant emblem hoppat upp.
  //
  // Migreringen MÄTER i stället för att räkna: varje omigrerat emblem i duken ritas en gång med det
  // gamla `position:relative` inline, rektangeln läses, inline-värdet tas bort och rektangeln läses
  // igen. Skillnaden räknas om till dukens enheter (mätt genom att flytta lådan 100 enheter, så
  // zoom och dukens skala följer med) och läggs på x/y. Markeringen `guardianPlacering:'absolut'`
  // stoppar varje senare mätning; nya emblem får den redan i fabriken. Som vyra-rotation.js
  // migrera(): ingen egen save(), varje läsare migrerar likadant ur samma sparade värde, och nästa
  // vanliga sparning skriver resultatet. En dold (display:none) eller ej ritad låda mäts inte.
  //
  // SAMMA FEL HADE TVÅ LÅDOR TILL (2026-10-20): studio.css gav `.fan-layout-heartbeat.fan-level-up`
  // och `.gifter-layout-orbitlevel.gifter-level-up` samma `position:relative` (två klasser slår
  // `.widget{position:absolute}`). Alla tre låg i SAMMA flöde och knuffade varandra, så de mäts
  // tillsammans — därför bor migreringen för alla tre här, i en enda mätning. Fan Level och Gifter
  // Level markeras med `levelPlacering:'absolut'`. Markeringen sätts på varje Fan/Gifter Level
  // oavsett design: bara heartbeat/orbitlevel mäts, men en widget som SENARE byter till de
  // designerna låg aldrig i flödet och får inte flyttas.
  const PLACERING = 'absolut';
  const FLODE = [
    { typ: 'templateGuardianEmblem', falt: 'guardianPlacering', iFlodet: () => true },
    { typ: 'templateFanLevel', falt: 'levelPlacering', iFlodet: w => w.fanLayout === 'heartbeat' },
    { typ: 'templateGifterLevel', falt: 'levelPlacering', iFlodet: w => w.gifterLayout === 'orbitlevel' }
  ];
  const regelFor = w => w && FLODE.find(r => r.typ === w.type);
  const nodFor = w => document.querySelector(`.canvas [data-id="${String(w.id).replace(/["\\]/g, '\\$&')}"]:not([data-testspel-klon])`);
  function migreraPlats() {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.widgets)) return 0;
    const omigrerade = state.widgets.map(w => {
      const r = regelFor(w);
      if (!r || w[r.falt] === PLACERING) return null;
      // En design som aldrig låg i flödet står redan där den syntes: bara markera.
      if (!r.iFlodet(w)) { w[r.falt] = PLACERING; return null; }
      return [w, nodFor(w), r];
    }).filter(p => p && p[1]);
    // En projektion kan byta statens objekt mot det SPARADE (omigrerade) värdet utan att rita om
    // (samma lucka som vyra-rotation.js beskriver). Noden bär då redan resultatet: samma utgångsläge
    // ger samma svar, så det skrivs tillbaka utan ny mätning — en ny mätning på den redan flyttade
    // noden hade gett noll och lämnat x/y gamla under en låda som står någon annanstans.
    const lista = omigrerade.filter(([w, el, r]) => {
      const minne = el.dataset.gePlats ? el.dataset.gePlats.split(',').map(Number) : null;
      if (!minne || minne[0] !== Number(w.x) || minne[1] !== Number(w.y)) return el.getClientRects().length > 0;
      w.x = minne[2]; w.y = minne[3]; w[r.falt] = PLACERING;
      return false;
    });
    if (!lista.length) return 0;
    // Alla på en gång med det gamla läget: de låg i flödet tillsammans, så de knuffade varandra.
    lista.forEach(([, el]) => el.style.setProperty('position', 'relative'));
    // Rektanglarna läses MOT DUKEN, inte mot fönstret: en flödeslåda först i duken kan dra dukens egen
    // plats med sig (marginalkollaps), och det är platsen I duken som var den synliga (2026-10-20).
    const iDuk = el => { const b = el.getBoundingClientRect(), d = (el.closest('.canvas') || document.documentElement).getBoundingClientRect(); return { left: b.left - d.left, top: b.top - d.top }; };
    const fore = lista.map(([, el]) => iDuk(el));
    lista.forEach(([, el]) => el.style.removeProperty('position'));
    let flyttade = 0;
    lista.forEach(([w, el, r], i) => {
      const efter = iDuk(el);
      const dx = fore[i].left - efter.left, dy = fore[i].top - efter.top;
      el.dataset.gePlats = [Number(w.x) || 0, Number(w.y) || 0].join(',');
      if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) {
        const x0 = Number(w.x) || 0, y0 = Number(w.y) || 0;
        el.style.left = (x0 + 100) + 'px'; el.style.top = (y0 + 100) + 'px';
        const prov = iDuk(el);
        const kx = (prov.left - efter.left) / 100 || 1, ky = (prov.top - efter.top) / 100 || 1;
        const runda = v => Math.round(v * 10) / 10;
        w.x = runda(x0 + dx / kx); w.y = runda(y0 + dy / ky);
        flyttade += 1;
      }
      el.dataset.gePlats += ',' + w.x + ',' + w.y;
      el.style.left = w.x + 'px'; el.style.top = w.y + 'px';
      w[r.falt] = PLACERING;
    });
    return flyttade;
  }
  root.VyraGuardianModels.migreraPlats = migreraPlats;
  root.VyraGuardianModels.PLACERING = PLACERING;
  const platsBind = bind;
  bind = function () {
    platsBind();
    if (view === 'editor' || view === 'overlay') migreraPlats();
  };
  addEventListener('vyra-session-state', migreraPlats);
  addEventListener('vyra-session-state-saved', migreraPlats);
  migreraPlats();

  // Sparade modeller kan redan ha målats innan det sena skriptet anländer.
  // Katalogens load-lyssnare binder om, men den byter inte ut en redan ritad canvas.
  if (state.widgets.some(w => w.type === 'templateGuardianEmblem' && modell(w) !== 'classic')) {
    vyraRenderKeepingPanel();
  }
})(window);
