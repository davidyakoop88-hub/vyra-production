(function (root) {
  'use strict';

  const styles = Object.freeze([
    Object.freeze(['clean-bar', 'VYRA Clean Bar']),
    Object.freeze(['soft-stack', 'VYRA Soft Stack']),
    Object.freeze(['mini-podium', 'VYRA Mini Podium']),
    Object.freeze(['side-rank', 'VYRA Side Rank']),
    // Ranking-sixpack (2026-09-24): sex fristående Claude Artifact-prototyper, godkända av David,
    // integrerade som rena CSS-skinn ovanpå SAMMA .toplike-row-skelett som ovanstående fyra — se
    // ranking-sixpack.css. Bara Top Like bär klassen (skinn-stämpeln, se toplike-studio.js), Top
    // Coins/Top Points får motsvarande design via SIN EGEN DESIGNS-tabell (topcoins-v2.js/toppoints-v2.js).
    Object.freeze(['voltage', 'VYRA Voltage']),
    Object.freeze(['basic-v2', 'VYRA Basic v2']),
    Object.freeze(['prism-vertical', 'VYRA Prism (vertikal)']),
    Object.freeze(['prism-horizontal', 'VYRA Prism (horisontal)']),
    Object.freeze(['celestial', 'VYRA Celestial']),
    Object.freeze(['royal-rose', 'VYRA Royal Rose'])
  ]);
  const defaults = Object.freeze({
    'clean-bar': Object.freeze({
      id: 'clean-bar', name: 'VYRA Clean Bar', layout: 'clean', frame: 'minimal-glow', count: 5
    }),
    'soft-stack': Object.freeze({
      id: 'soft-stack', name: 'VYRA Soft Stack', layout: 'clean', frame: 'minimal-glow', count: 5
    }),
    'mini-podium': Object.freeze({
      id: 'mini-podium', name: 'VYRA Mini Podium', layout: 'center', frame: 'minimal-glow', count: 5
    }),
    'side-rank': Object.freeze({
      id: 'side-rank', name: 'VYRA Side Rank', layout: 'right', frame: 'minimal-glow', count: 5
    }),
    // De sex nya bär ingen Avatar Frame-bild (frame:'none') — deras ring/glöd ritas av
    // ranking-sixpack.css runt fotot i stället, precis som prototyperna. En vald Avatar Frame
    // skulle annars konkurrera med samma cirkel.
    voltage: Object.freeze({
      id: 'voltage', name: 'VYRA Voltage', layout: 'clean', frame: 'none', count: 5
    }),
    'basic-v2': Object.freeze({
      id: 'basic-v2', name: 'VYRA Basic v2', layout: 'clean', frame: 'none', count: 5
    }),
    'prism-vertical': Object.freeze({
      id: 'prism-vertical', name: 'VYRA Prism (vertikal)', layout: 'clean', frame: 'none', count: 5
    }),
    // layout:'clean' (INTE 'center') for dessa tre, med flit — .like-center bar sedan tidigare
    // Mini Podiums (0,4,0)-block (toplike-studio.css:393: .like-center.like-center, absolut
    // per-rank-positionering via --px/--py, olika bildstorlek per plats). Prism horisontal/
    // Celestial/Royal Rose ar EN RAK RAD UTAN HOJDSKILLNAD (Davids uttryckliga krav), och
    // .like-center hade tyst atergett dem som en pyramid med krona-glod pa nummer 1 — matt i
    // riktig Chromium, inte bara last i kallkod. .like-clean har ingen egen CSS alls (se
    // kommentaren i toplike-studio.css:71), sa ranking-sixpack.css:s egna radregler ager hela
    // layouten oemotsagda, precis som for voltage/basic-v2/prism-vertikal ovan.
    'prism-horizontal': Object.freeze({
      id: 'prism-horizontal', name: 'VYRA Prism (horisontal)', layout: 'clean', frame: 'none', count: 5
    }),
    celestial: Object.freeze({
      id: 'celestial', name: 'VYRA Celestial', layout: 'clean', frame: 'none', count: 5
    }),
    'royal-rose': Object.freeze({
      id: 'royal-rose', name: 'VYRA Royal Rose', layout: 'clean', frame: 'none', count: 5
    })
  });

  root.VYRA_TOPLIKE_STYLES = styles;
  root.VYRA_TOPLIKE_DEFAULTS = defaults;
  root.applyVyraTopLikeStyle = function applyVyraTopLikeStyle(widget, id) {
    const preset = defaults[id];
    if (!widget || !preset) return false;
    widget.skin = preset.id;
    widget.likeTheme = preset.layout;
    widget.likeCount = preset.count;
    widget.profileFrame = preset.frame;
    const WIDE = new Set(['mini-podium', 'prism-horizontal', 'celestial', 'royal-rose']);
    widget.width = WIDE.has(preset.id) ? 300 : preset.id === 'side-rank' ? 180 : 250;
    widget.showTitle = false;
    widget.showCrown = false;
    widget.autoMedal = false;
    widget.showProfile = true;
    widget.showDataName = true;
    widget.showDataValue = true;
    widget.showBackground = false;
    widget.rankingCycle = false;
    return true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
