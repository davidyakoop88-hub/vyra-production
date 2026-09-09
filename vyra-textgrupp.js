(function () {
  'use strict';
  // EN GEMENSAM TEXTGRUPP FÖR ALLA WIDGETS (2026-09-09).
  //
  // DAVIDS ORD, efter att ha jämfört med Tiktory: "vi har mer men ändå ser kaos ut". Konkurrenten
  // har SAMMA TEXT-grupp i varje widget. VYRA hade en annan i varje: av 21 familjer kunde 8 byta
  // typsnitt, 8 textstorlek, 3 skugga, 2 kontur och 1 regnbåge. Kan man byta typsnitt i Top Like
  // men inte i Top Gift går systemet inte att lära sig, och det är en tyngre orsak till röran än
  // antalet kontroller.
  //
  // VAD GRUPPEN STYR, OCH VARFÖR INTE ALLT. Räknat i CSS-filerna:
  //   -webkit-text-stroke    8 regler  -> kontur, funktionen saknas nästan helt. Säker.
  //   font-family           21 regler  -> typsnitt. Säkert.
  //   text-shadow          136 regler  -> skugga är additiv, konflikten är hanterbar.
  //   font-size            646 regler  -> BÄR VARJE WIDGETS PROPORTIONER. En absolut storlek hade
  //                                      plattat ut rubrik, namn och siffra till samma tal, så
  //                                      gruppen erbjuder en MULTIPLIKATOR i stället.
  //   color                935 regler  -> BÄR WIDGETARNAS DESIGN: guld för värdet, vitt för namnet,
  //                                      accent för rubriken. En global färg hade suddat ut den
  //                                      skillnaden i alla 21 familjer på en gång. Färgen ligger
  //                                      därför kvar hos familjerna — en medveten avvikelse från
  //                                      "exakt samma grupp som Tiktory".
  //
  // VARFÖR DOM-EFTERBEHANDLING. widget-background.js löste samma sak för bakgrunden och motiverar
  // det så här: "~40 widget templates exist across this codebase and they don't share a common
  // markup shape". Det gäller här också. Skillnaden är att bakgrunden räcker att sätta på roten,
  // medan typografi INTE ärvs hit: elva CSS-regler sätter font-family och 46 sätter text-shadow på
  // element inne i widgetarna. Stilen måste därför landa på varje element som bär text.

  // Bladen: element utan barn som visar egen text. Att sätta på allt hade träffat behållare vars
  // egen storlek styr layouten, och skalat om widgeten i stället för texten.
  function textblad(rot) {
    const ut = [];
    for (const el of rot.querySelectorAll('*')) {
      if (el.children.length) continue;
      if (!(el.textContent || '').trim()) continue;
      ut.push(el);
    }
    return ut;
  }

  // TVÅ KÄLLOR TILL GRUNDSTORLEKEN, och valet mellan dem är hela funktionen.
  //
  // Ett CSS-VÄRDE får aldrig cachas: media.js injicerar premium-final.css asynkront, så en widget
  // vars namn CSS:en säger 13 px mättes till 20 innan stilmallen kommit fram, och skalan 1,5 gav
  // 2,31x mot vad man såg. Ett sådant värde läses därför om varje gång, med inline-stilen nollad
  // först så att läsningen inte träffar vår egen förra uträkning.
  //
  // RENDERARENS EGEN INLINE-STORLEK ÄR HELIG. Flera renderare skriver font-size direkt i markupen
  // (`.ctw-text` sätter `font-size:${w.textFontSize||32}px`, premiumpanelerna gör detsamma). Ett
  // villkorslöst removeProperty raderade den och lämnade elementet med en ärvd storlek: uppmätt
  // 2026-09-09 blev "Skriv din text" 32 px -> 12 px av en skala på 1,5, eftersom 8 px lästes som
  // grund. Samma fälla som bakgrundens padding, och svaret är detsamma — vi måste veta vem som
  // äger värdet.
  //
  // `data-vyra-storlek` sparar vad renderaren satte, INNAN vi rör något. Den är trygg att cacha
  // till skillnad från ett CSS-värde: en inline-stil ändras inte av att en stilmall laddas senare,
  // vilket var precis det som gjorde den förra cachningen fel.
  function skala(el, faktor) {
    if (!faktor || faktor === 1) {
      if (el.dataset.vyraStorlek !== undefined) {
        const eget = el.dataset.vyraStorlek;
        if (eget) el.style.setProperty('font-size', eget);   // lämna tillbaka renderarens värde
        else el.style.removeProperty('font-size');
        delete el.dataset.vyraStorlek;
      }
      return;
    }

    if (el.dataset.vyraStorlek === undefined) el.dataset.vyraStorlek = el.style.fontSize || '';
    const eget = el.dataset.vyraStorlek;

    if (eget) {
      const grund = parseFloat(eget) || 0;
      if (grund) el.style.setProperty('font-size', (grund * faktor) + 'px', 'important');
      return;
    }
    // Ingen inline-storlek att skydda: då är CSS:ens värde det rätta att räkna från.
    el.style.removeProperty('font-size');
    const grund = parseFloat(getComputedStyle(el).fontSize) || 0;
    if (grund) el.style.setProperty('font-size', (grund * faktor) + 'px', 'important');
  }

  function applicera(rot, w) {
    // SNABB UTGÅNG NÄR INGET ÄR INSTÄLLT — det normala fallet för nästan varje widget. Utan den
    // gick funktionen igenom varje textelement i varje widget vid varje bind(), och bind() körs
    // ofta. Uppmätt: ett browserprov som annars tar sekunder drog iväg till 432 sekunder.
    //
    // `data-vyra-text` minns att vi HAR rört elementet, så en widget vars inställningar nollas
    // fortfarande städas en sista gång innan snabbutgången tar över.
    const rorNagot = w.textFont || Number(w.textOutlineWidth) > 0 || Number(w.textShadowBlur) > 0
      || Number(w.textShadowX) || Number(w.textShadowY) || (Number(w.textScale) || 1) !== 1;
    if (!rorNagot && !rot.dataset.vyraText) return;
    if (rorNagot) rot.dataset.vyraText = '1'; else delete rot.dataset.vyraText;

    const blad = textblad(rot);
    const font = w.textFont;
    const kontur = Number(w.textOutlineWidth) || 0;
    const konturFarg = w.textOutlineColor || '#000000';
    const blur = Number(w.textShadowBlur) || 0;
    const skuggX = Number(w.textShadowX) || 0;
    const skuggY = Number(w.textShadowY) || 0;
    const skuggFarg = w.textShadowColor || '#000000';
    const harSkugga = blur > 0 || skuggX !== 0 || skuggY !== 0;
    const faktor = Number(w.textScale) || 1;

    for (const el of blad) {
      // !important genomgående: temaklasserna deklarerar sin typografi på samma nivå
      // (`.premium-topgift`, `.topgift-cyber` m.fl.), och en vanlig inline-stil förlorar mot dem.
      if (font) el.style.setProperty('font-family', font, 'important');
      else el.style.removeProperty('font-family');

      if (kontur > 0) {
        el.style.setProperty('-webkit-text-stroke', kontur + 'px ' + konturFarg, 'important');
        // Konturen ritas centrerad över glyfen och äter annars upp tunn text inifrån.
        el.style.setProperty('paint-order', 'stroke fill', 'important');
      } else {
        el.style.removeProperty('-webkit-text-stroke');
        el.style.removeProperty('paint-order');
      }

      if (harSkugga) {
        el.style.setProperty('text-shadow',
          `${skuggX}px ${skuggY}px ${blur}px ${skuggFarg}`, 'important');
      } else {
        el.style.removeProperty('text-shadow');
      }

      skala(el, faktor);
    }
  }

  function appliceraAlla() {
    if (typeof state === 'undefined' || !state || !Array.isArray(state.widgets)) return;
    for (const w of state.widgets) {
      const rot = document.querySelector(`[data-id="${w.id}"]`);
      if (rot) applicera(rot, w);
    }
  }

  // ---- panelen ------------------------------------------------------------------------------
  const TYPSNITT = ['Inter', 'Arial', 'Georgia', 'Impact', 'Verdana', 'Courier New', 'monospace'];

  // KOMPAKT MED FLIT. Första versionen gav varje kontroll en egen rad och blev 586 px — panelens
  // STÖRSTA post, och därmed samma sorts svällning som gruppen byggdes för att råda bot på. Uppmätt
  // 2026-09-09: Top Gift gick från 1980 px till 2576 när gruppen tillkom.
  //
  // Skuggan och konturen är par av tal som hör ihop och läses tillsammans; de får dela rad i
  // `.property-grid`, precis som Tiktory gör med sin "Text Shadow: X, Y, BLUR, Color". Typsnitt och
  // textstorlek behåller sina egna rader — de ändras oftast, och ett reglage behöver bredden.
  function grupp(w) {
    const alt = TYPSNITT.map(t =>
      `<option value="${t}" ${w.textFont === t ? 'selected' : ''}>${t}</option>`).join('');
    const skala = Math.round((Number(w.textScale) || 1) * 100);
    return `<div class="property-group vyra-textgrupp"><h4>TEXT</h4>`
      + `<label><span>Typsnitt</span><select id="vtFont">`
      + `<option value="" ${!w.textFont ? 'selected' : ''}>Widgetens eget</option>${alt}</select></label>`
      + `<label class="range-label">Textstorlek <b>${skala}%</b>`
      + `<input id="vtScale" type="range" min="50" max="200" step="5" value="${skala}"></label>`
      + `<div class="property-grid">`
      + `<label>Skugga<input id="vtShadowBlur" type="number" min="0" max="24" value="${Number(w.textShadowBlur) || 0}"></label>`
      + `<label>Skuggfärg<input id="vtShadowColor" type="color" value="${w.textShadowColor || '#000000'}"></label>`
      + `<label>Skugga X<input id="vtShadowX" type="number" min="-20" max="20" value="${Number(w.textShadowX) || 0}"></label>`
      + `<label>Skugga Y<input id="vtShadowY" type="number" min="-20" max="20" value="${Number(w.textShadowY) || 0}"></label>`
      + `<label>Kontur<input id="vtOutline" type="number" min="0" max="6" step="0.5" value="${Number(w.textOutlineWidth) || 0}"></label>`
      + `<label>Konturfärg<input id="vtOutlineColor" type="color" value="${w.textOutlineColor || '#000000'}"></label>`
      + `</div></div>`;
  }

  // GRUPPEN LÄGGS I DOM, INTE I props()-STRÄNGEN. Första försöket patchade props() och la
  // gruppen sist i strängen. Den kom aldrig fram för Top Gift: premium-final.js props() gör
  // `if (w.type === 'templateTopGift') return '<h3>…'` och anropar ALDRIG kedjan under sig, så
  // varje patch som ligger innanför den hoppas över. Vilka filer som ligger innanför avgörs av
  // laddordningen, och flera av dem injiceras asynkront av media.js — det går alltså inte att
  // lösa genom att ladda tidigare eller senare.
  //
  // widget-background.js och runtime-controls.js bygger sina grupper i bind() med DOM av samma
  // skäl. Samma väg här: när bind() kör finns panelen, oavsett vem som byggde den.
  if (typeof bind === 'function') {
    const foregaende = bind;
    bind = function () {
      const ut = foregaende.apply(this, arguments);
      appliceraAlla();
      if (typeof view !== 'undefined' && view !== 'editor') return ut;
      const w = typeof liveWidget === 'function' ? liveWidget(selected) : null;
      if (!w) return ut;

      const panel = document.querySelector('.properties');
      if (!panel) return ut;
      if (!panel.querySelector('.vyra-textgrupp')) {
        const halsare = document.createElement('div');
        halsare.innerHTML = grupp(w);
        const ny = halsare.firstElementChild;
        // Sist. vyra-panelordning.js flyttar den till rätt plats efteråt — det är hela poängen
        // med att ordningen ägs på ett enda ställe.
        if (ny) panel.append(ny);
      }

      // Samma live-mönster som resten av panelen: `oninput` målar om utan att bygga om panelen
      // (annars tappas fokus mitt i en dragning), `onchange` sparar.
      const koppla = (id, falt, tolk) => {
        const el = document.querySelector('.properties #' + id);
        if (!el) return;
        const las = e => tolk(e.target.value);
        el.oninput = e => {
          w[falt] = las(e);
          appliceraAlla();
          // Bara textstorleken har kvar en siffra i etiketten; resten är talfält som visar sitt
          // eget värde sedan gruppen blev kompakt.
          const b = el.closest('.range-label')?.querySelector('b');
          if (b) b.textContent = Math.round(Number(el.value)) + '%';
        };
        el.onchange = e => { w[falt] = las(e); if (typeof save === 'function') save(); appliceraAlla(); };
      };

      koppla('vtFont', 'textFont', v => v || undefined);
      koppla('vtScale', 'textScale', v => (Number(v) || 100) / 100);
      koppla('vtShadowBlur', 'textShadowBlur', v => Number(v) || 0);
      koppla('vtShadowX', 'textShadowX', v => Number(v) || 0);
      koppla('vtShadowY', 'textShadowY', v => Number(v) || 0);
      koppla('vtShadowColor', 'textShadowColor', v => v);
      koppla('vtOutline', 'textOutlineWidth', v => Number(v) || 0);
      koppla('vtOutlineColor', 'textOutlineColor', v => v);
      return ut;
    };
  }

  window.VyraTextgrupp = { applicera, appliceraAlla, textblad };
})();
