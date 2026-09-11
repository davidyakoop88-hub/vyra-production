// Guardian-modeller. Guldets fyra praktsteg bevaras; Grön aura är en egen full ram.
// Samma ge-avatar/ge-namn och ge-step-4 låter live-triggern och fasklockan arbeta oförändrat.
(function (root) {
  'use strict';
  if (root.VyraGuardianModels) return;

  const EMERALD = {
    bild: 'emerald.png', aspect: 1,
    circle: {left: 35.1, top: 45.3, width: 29.8, height: 29.8}
  };
  const modell = w => w && w.guardianModel === 'emerald' ? 'emerald' : 'classic';
  root.VyraGuardianModels = {modell, EMERALD};

  const tidigareWh = wh;
  wh = function (w) {
    if (w.type !== 'templateGuardianEmblem' || modell(w) !== 'emerald') return tidigareWh(w);
    const t = geText(w), F = root.VyraGuardianEmblemFas;
    const engelska = F && F.sprak(w) === 'en';
    const vald = selected === w.id;
    return `<div class="widget guardian-emblem gem-emerald ge-step-4${vald?' selected':''}" data-id="${VyraSafe.text(w.id)}" style="left:${w.x}px;top:${w.y}px;width:${w.width||400}px;height:${w.height||570}px;zoom:${w.widgetScale||1}">`
      + `<div class="gem-aura" aria-hidden="true"></div>`
      + `<div class="gem-intro">${engelska?'A GUARDIAN ARRIVES':'EN BESKYDDARE ANLÄNDER'}</div>`
      + geDel('bild',w,t,EMERALD)
      + `<div class="gem-rubrik">${VyraSafe.text(t.banderoll)}</div>`
      + geDel('namn',w,t,EMERALD) + geDel('undertext',w,t,EMERALD)
      + (vald?'<span class="resize-handle">&#8600;</span>':'') + '</div>';
  };

  const tidigareProps = props;
  props = function () {
    const html = tidigareProps(), w = liveWidget(selected);
    if (!w || w.type !== 'templateGuardianEmblem') return html;
    const gron = modell(w) === 'emerald';
    const val = '<label>Modell<select id="geModel">'
      + `<option value="classic"${gron?'':' selected'}>Guld</option>`
      + `<option value="emerald"${gron?' selected':''}>Grön aura</option></select></label>`;
    let panel = html.replace('<h4>PRAKT</h4>', '<h4>UTSEENDE</h4>' + val);
    // Praktstegen tillhör guldmodellen. Valet sparas när modellen byts tillbaka.
    if (gron) panel = panel.replace('<label>Praktsteg<select id="geStep">', '<label hidden>Praktsteg<select id="geStep">');
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
        const matt = VyraWidgets.variants('guardianemblem.matt')[w.guardianModel==='emerald'?'4':geStegAv(w)];
        // Behåll användarens storlek; byt bara proportionerna mellan modellerna.
        w.height = Math.round((Number(w.width)||400) * matt[1] / matt[0]);
        save(); vyraRenderKeepingPanel();
      };
    }
    const section = document.querySelector('[data-guardian-emblem]');
    if (!section || section.querySelector('[data-ge-model]')) return;
    section.querySelector('h4').textContent = 'GUARDIAN EMBLEM';
    const knapp = document.createElement('button');
    knapp.dataset.geModel = 'emerald';
    knapp.dataset.catalogKey = 'catalog:guardianemblem:model:emerald';
    knapp.innerHTML = '<i><img src="assets/guardian-emblem/emerald.png" alt="" width="48" height="48"></i><span><b>Grön aura</b><small>Smaragd, guld och fyra entréfaser</small></span>';
    knapp.onclick = () => {
      const skapad = VyraWidgets.create(knapp.dataset.catalogKey);
      state.widgets = state.widgets.filter(w => VyraWidgets.isStandalone(w) || w.type !== 'templateGuardianEmblem');
      state.widgets.push(skapad); selected = skapad.id; save(); render();
      toast('Guardian · Grön aura skapad');
    };
    section.append(knapp);
  };
  // Sparade gröna widgetar kan redan ha målats innan det sena skriptet anländer.
  // Katalogens load-lyssnare binder om, men den byter inte ut en redan ritad canvas.
  if (state.widgets.some(w => w.type === 'templateGuardianEmblem' && modell(w) === 'emerald')) {
    vyraRenderKeepingPanel();
  }
})(window);
