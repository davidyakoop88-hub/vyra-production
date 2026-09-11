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
    let panel = html.replace('<h4>PRAKT</h4>', '<h4>UTSEENDE</h4>' + val);
    // Praktstegen tillhör guldmodellen. Valet sparas när modellen byts tillbaka.
    if (m !== 'classic') panel = panel.replace('<label>Praktsteg<select id="geStep">', '<label hidden>Praktsteg<select id="geStep">');
    return panel;
  };

  const tidigareBind = bind;
  bind = function () {
    tidigareBind();
    if (view !== 'editor' && view !== 'overlay') return;
    const w = liveWidget(selected), val = document.querySelector('#geModel');
    if (view === 'editor' && w && w.type === 'templateGuardianEmblem' && val) {
      val.onchange = e => {
        w.guardianModel = modell({guardianModel:e.target.value});
        const matt = VyraWidgets.variants('guardianemblem.matt')[w.guardianModel==='classic'?geStegAv(w):'4'];
        // Behåll användarens storlek; byt bara proportionerna mellan modellerna.
        w.height = Math.round((Number(w.width)||400) * matt[1] / matt[0]);
        save(); vyraRenderKeepingPanel();
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
  // Sparade modeller kan redan ha målats innan det sena skriptet anländer.
  // Katalogens load-lyssnare binder om, men den byter inte ut en redan ritad canvas.
  if (state.widgets.some(w => w.type === 'templateGuardianEmblem' && modell(w) !== 'classic')) {
    vyraRenderKeepingPanel();
  }
})(window);
