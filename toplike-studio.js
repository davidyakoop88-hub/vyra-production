(function () {
  const RANKING_TYPES = ['templateTopLike', 'templateTopCoins', 'templateTopPoints'];
  const SKINS = [
    ['clean', 'Clean'], ['royal-gold', 'Royal Gold'], ['neon', 'Neon'], ['galaxy', 'Galaxy'], ['ice', 'Ice'],
    ['fire', 'Fire'], ['sakura', 'Sakura'], ['cyber', 'Cyber'], ['luxury', 'Luxury'],
    ['aurora', 'Aurora'], ['retro-crt', 'Retro CRT'], ['goldrush', 'Gold Rush'],
    ['prism', 'Prism'], ['arena', 'Arena']
  ];

  // Avatar Frame library — real illustrated PNGs where a matching asset already exists in the repo
  // (reused across names/genders where thematically close), plain SVG placeholder rings elsewhere
  // (same "swap file-for-file, no code change" idea as this project's own DEV PLACEHOLDER themes —
  // see README.md). Placeholder ids are exactly the ones with ext:'svg'.
  // Full catalog: every file in assets/images/profile-frames/ (53 total — was 16, the other 37
  // existed on disk but were never registered here, so they were unreachable from any picker).
  const FRAMES = {
    boys: [
      ['ocean-oracle','Ocean Oracle','ocean-oracle','png'],['neon-valkyrie','Neon Valkyrie','neon-valkyrie','png'],
      ['moonlit-sakura','Moonlit Sakura','moonlit-sakura','png'],['celestial-serpent','Celestial Serpent','celestial-serpent','png'],
      ['stellar-emperor','Stellar Emperor','stellar-emperor','png'],['opal-dream','Opal Dream','opal-dream','png'],
      ['thunder-warden','Thunder Warden','thunder-warden','png'],['velvet-nocturne','Velvet Nocturne','velvet-nocturne','png'],
      ['bronze','Bronze','bronze','svg'],['cyber-blue','Cyber Blue','cyber-blue','png'],
      ['emerald','Emerald','emerald','png'],['flame','Flame','flame','svg'],
      ['galaxy','Galaxy','galaxy','png'],['golden-king','Golden King','golden-king','png'],
      ['heroic','Heroic','heroic','svg'],['ice-crystal','Ice Crystal','ice-crystal','png'],
      ['infinity','Infinity','infinity','svg'],['lightning','Lightning','lightning','svg'],
      ['minimal-glow','Minimal Glow','minimal-glow','png'],['neon-blue','Neon Blue','neon-blue','svg'],
      ['neon-green','Neon Green','neon-green','svg'],['neon-purple','Neon Purple','neon-purple','png'],
      ['predator','Predator','predator','svg'],['samurai','Samurai','samurai','png'],
      ['sapphire-nocturne','Sapphire Nocturne','sapphire-nocturne','png'],['viking','Viking','viking','svg']
    ],
    girls: [
      ['gilded-lion','Gilded Lion','gilded-lion','png'],['amethyst-oracle','Amethyst Oracle','amethyst-oracle','png'],
      ['frostfire-crown','Frostfire Crown','frostfire-crown','png'],['quantum-lotus','Quantum Lotus','quantum-lotus','png'],
      ['crimson-dynasty','Crimson Dynasty','crimson-dynasty','png'],['pearl-tempest','Pearl Tempest','pearl-tempest','png'],
      ['cosmic-tiger','Cosmic Tiger','cosmic-tiger','png'],['enchanted-ivy','Enchanted Ivy','enchanted-ivy','png'],
      ['arctic-couture','Arctic Couture','arctic-couture','png'],['aurora-diamond','Aurora Diamond','aurora-diamond','png'],
      ['butterfly','Butterfly','butterfly','svg'],['champagne-crown','Champagne Crown','champagne-crown','png'],
      ['emerald-elan','Emerald Élan','emerald-elan','png'],['fairy','Fairy','fairy','svg'],
      ['flower','Flower','flower','svg'],['midnight-amethyst','Midnight Amethyst','midnight-amethyst','png'],
      ['neon-pink','Neon Pink','neon-pink','svg'],['pearl-lumiere','Pearl Lumière','pearl-lumiere','png'],
      ['pink-angel','Pink Angel','pink-angel','png'],['princess','Princess','princess','svg'],
      ['rose-atelier','Rose Atelier','rose-atelier','png'],['ruby-velvet','Ruby Velvet','ruby-velvet','png'],
      ['silver','Silver','silver','svg'],['sparkle','Sparkle','sparkle','svg'],
      ['starry','Starry','starry','svg'],['unicorn','Unicorn','unicorn','svg'],
      ['wings','Wings','wings','svg']
    ]
  };
  const FRAME_FILES = {}; // id -> "file.ext", built once from FRAMES so wh() can look up the real filename
  Object.values(FRAMES).flat().forEach(([id, , file, ext]) => { FRAME_FILES[id] = `${file}.${ext}`; });

  // Exposed so other widget families (gift-alert-frames.js) can reuse the same frame library and
  // picker markup instead of duplicating the 36-entry table. Only read inside function bodies in
  // consumers, never at their own top-level IIFE scope — script load order between dynamically
  // injected files isn't guaranteed (see the overlay re-render guard at the end of this file).
  // How wide each frame's transparent opening is, as a fraction of the frame image's own width.
  // Measured from the actual assets (alpha channel, 72 rays out from the centre, median ray) — not
  // estimated. Needed because these frames are large ornaments, not thin rings: the opening ranges
  // from 45% (moonlit-sakura) to 80% (minimal-glow), so a single shared photo size cannot fit them
  // all. The photo keeps its size and the frame art scales to 1/fit around it, which is what puts
  // the ring OUTSIDE the photo at any widget size.
  // Median rather than the narrowest ray on purpose: thin decorations (butterfly wingtips reach 19%,
  // lightning 26%) would otherwise demand 4-5x scaling and blow the layout apart. A stray decoration
  // grazing the photo edge is how these frames are drawn.
  // [fit, dx, dy] per frame, measured from each asset's alpha channel as the LARGEST INSCRIBED
  // CIRCLE in the frame's transparent opening:
  //   fit = the circle's diameter as a fraction of the frame image's width
  //   dx/dy = the circle's centre offset from the image centre, as a fraction of the image size
  // The offsets matter: 32 of these 53 frames have an off-centre opening, because an ornament on top
  // (crown, moon, antlers) pushes the usable hole downwards. Measuring rays from the image centre
  // cannot detect that and leaves the photo visibly off inside the ring.
  const FRAME_GEOM = {
    'ocean-oracle': [.4706, .0039, -.0078], 'neon-valkyrie': [.4270, -.0547, .0195],
    'moonlit-sakura': [.4449, -.0273, -.0078], 'celestial-serpent': [.5110, -.0313, .0156],
    'stellar-emperor': [.5423, .0352, .0508], 'opal-dream': [.5156, .0078, .0078],
    'thunder-warden': [.4830, -.0508, .0391], 'velvet-nocturne': [.5533, -.0195, .0391],
    'gilded-lion': [.4680, -.0273, .0898], 'amethyst-oracle': [.4844, -.0273, .0703],
    'frostfire-crown': [.4453, -.0664, .0586], 'quantum-lotus': [.4882, -.0742, .0742],
    'crimson-dynasty': [.5050, -.0078, .0391], 'pearl-tempest': [.4861, -.0273, 0],
    'cosmic-tiger': [.5299, -.0469, .0273], 'enchanted-ivy': [.5221, -.0195, .0742],
    'arctic-couture': [.4674, .0117, .0430], 'aurora-diamond': [.6094, -.0039, -.0039],
    'champagne-crown': [.6484, -.0078, .0664], 'emerald-elan': [.6519, -.0039, .0039],
    'midnight-amethyst': [.5551, -.0195, -.0039], 'pearl-lumiere': [.5896, .0078, .0117],
    'pink-angel': [.6862, -.0078, .0430], 'rose-atelier': [.5823, 0, .0156],
    'ruby-velvet': [.5414, -.0508, -.0117], 'sapphire-nocturne': [.5781, .0039, .0195],
    'ice-crystal': [.6191, -.0156, .0313], 'samurai': [.6035, .0039, .0273],
    'golden-king': [.6282, -.0039, .0664], 'galaxy': [.6033, .0117, .0156],
    'emerald': [.6439, -.0039, .0039], 'cyber-blue': [.7294, .0039, 0],
    'neon-purple': [.7327, -.0039, -.0078], 'minimal-glow': [.7890, 0, 0],
    // svg placeholders
    'bronze': [.6850, -.0039, -.0039], 'silver': [.6850, -.0039, -.0039],
    'flame': [.6484, -.0039, -.0039], 'heroic': [.6040, -.0352, .0703],
    'infinity': [.6641, -.0078, -.0586], 'lightning': [.3314, -.2148, -.0859],
    'neon-blue': [.7669, -.0039, 0], 'neon-green': [.7669, -.0039, 0],
    'neon-pink': [.7669, -.0039, 0], 'predator': [.6272, .0234, .0625],
    'viking': [.7422, -.0078, 0], 'butterfly': [.4939, -.1094, .0938],
    'fairy': [.7813, -.0078, .0039], 'flower': [.6563, -.0039, -.0039],
    'princess': [.7734, -.0039, 0], 'sparkle': [.7734, -.0039, -.0039],
    'starry': [.7488, -.0039, .0078], 'unicorn': [.7188, -.0117, .0273],
    'wings': [.7780, -.0039, -.0039]
  };

  // Raw measurements are stored above and clamped here, so the data stays honest and the policy is
  // visible. Two svg PLACEHOLDER assets are not really rings — lightning's bolt and butterfly's
  // wings cross the photo area itself, so their true inscribed circle is tiny and far off centre.
  // Honouring those literally would scale the ring 3x and shove it sideways, wrecking the row for
  // everyone. They are clamped instead: their decoration overlaps the photo, which is how the art
  // is drawn.
  const FIT_FLOOR = .45, OFFSET_CAP = .07;
  const FRAME_GEOM_DEFAULT = [.62, 0, 0]; // catalog median, for an asset added without measuring
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function frameGeom(id) {
    const g = (id && FRAME_GEOM[id]) || FRAME_GEOM_DEFAULT;
    return {
      fit: Math.max(FIT_FLOOR, g[0]),
      dx: clamp(g[1], -OFFSET_CAP, OFFSET_CAP),
      dy: clamp(g[2], -OFFSET_CAP, OFFSET_CAP)
    };
  }
  window.VYRA_FRAME_GEOM = FRAME_GEOM;
  window.vyraFrameGeom = frameGeom;
  window.vyraFrameFit = id => frameGeom(id).fit;

  window.VYRA_FRAMES = FRAMES;
  window.VYRA_FRAME_FILES = FRAME_FILES;

  // One-time replacement of the retired frame collection on all ranking widgets.
  const signatureIds = new Set(Object.keys(FRAME_FILES));
  if (!localStorage.getItem('vyra-signature-ranking-frames-v1')) {
    state.widgets.filter(w => RANKING_TYPES.includes(w.type)).forEach(w => {
      if (!signatureIds.has(w.profileFrame)) w.profileFrame = 'ocean-oracle';
    });
    save();
    localStorage.setItem('vyra-signature-ranking-frames-v1', '1');
  }

  // ---- Render: skin class, entrance-animation class, opacity, crown on #1 ----
  const wsRenderWh = wh;
  wh = function (w) {
    let html = wsRenderWh(w);
    if (!RANKING_TYPES.includes(w.type)) return html;
    const skin = w.skin || 'royal-gold';
    const anim = w.entranceAnimation && w.entranceAnimation !== 'none' ? ` ws-anim-${w.entranceAnimation}` : '';
    html = html.replace('class="widget vyra-toplike', `class="widget vyra-toplike skin-${skin}${anim}`);
    html = html.replace('style="', `style="opacity:${w.opacity ?? 1};`);
    // Skip the auto crown glyph when a custom illustrated frame is chosen - several frames (e.g.
    // golden-king) already have their own crown/regal motif baked into the art, so the separate ♛
    // badge just clutters the gap between the photo and the frame instead of adding anything.
    if (w.showCrown === true && (!w.profileFrame || w.profileFrame === 'none')) html = html.replace('rank-1"><b>1</b>', 'rank-1"><i class="toplike-crown">♛</i><b>1</b>');

    // Automatic gold/silver/bronze medal ring for #1/#2/#3 — only when no custom Avatar Frame is chosen,
    // so the explicit frame picker (proTopLikeFrameBind/premiumProfileFramesBind) still wins when used.
    if (w.autoMedal === true && (!w.profileFrame || w.profileFrame === 'none')) {
      const medals = [['1', 'gold'], ['2', 'silver'], ['3', 'bronze']];
      medals.forEach(([rank, name]) => {
        html = html.replace(
          new RegExp(`(rank-${rank}">(?:<i class="toplike-crown">[^<]*<\\/i>)?<b>${rank}<\\/b>)(<img[^>]*>)`),
          (match, prefix, img) => `${prefix}<span class="pro-avatar-frame medal-${name}">${img}<img class="pro-frame-art" src="assets/images/medals/${name}.png" alt=""></span>`
        );
      });
    }

    // proTopLikeFrameWh (media.js) always builds the src as assets/images/profile-frames/{id}.png?v=2 —
    // fix it up to the real filename (FRAME_FILES) for frames whose asset is a differently-named PNG
    // reuse or an .svg placeholder, without touching that existing chain.
    if (w.profileFrame && w.profileFrame !== 'none' && FRAME_FILES[w.profileFrame]) {
      html = html.replaceAll(`assets/images/profile-frames/${w.profileFrame}.png?v=2`, `assets/images/profile-frames/${FRAME_FILES[w.profileFrame]}`);
    }
    return html;
  };

  // ---- Props: crown toggle, skin-picker, animation group, opacity slider ----
  const wsExtraProps = props;
  props = function () {
    const html = wsExtraProps();
    const w = state.widgets.find(x => x.id === selected);
    if (!w || !RANKING_TYPES.includes(w.type)) return html;

    let out = html.replace(
      /(<input id="likeShowTitle"[^>]*>\s*Rubrik<\/label>)(<\/div>)/,
      `$1<label><input id="wsShowCrown" type="checkbox" ${w.showCrown === true ? 'checked' : ''}> Krona</label><label><input id="wsAutoMedal" type="checkbox" ${w.autoMedal === true ? 'checked' : ''}> Medaljring #1-3 (avviker från övriga)</label>$2`
    );

    const liveMetric = w.liveMetric || (w.type === 'templateTopCoins' ? 'coins' : 'likes');
    out = out.replace(
      '<div class="property-group"><h4>DESIGN',
      `<div class="property-group"><h4>LIVE-DATA</h4><label><input id="wsLiveData" type="checkbox" ${w.useLiveData === false ? '' : 'checked'}> Visa riktig aktivitet (inte demo-namn)</label><label>Rangordna efter<select id="wsLiveMetric" ${w.useLiveData === false ? 'disabled' : ''}><option value="likes"${liveMetric === 'likes' ? ' selected' : ''}>Likes</option><option value="coins"${liveMetric === 'coins' ? ' selected' : ''}>Gåv-coins</option></select></label></div><div class="property-group"><h4>DESIGN`
    );

    const skin = w.skin || 'royal-gold';
    const skinGroup = `<div class="property-group"><h4>DESIGN · VÄLJ TEMA</h4><div class="toplike-skin-grid">${SKINS.map(([id, name]) => `<button type="button" data-ws-skin="${id}" class="toplike-skin-swatch skin-${id}${skin === id ? ' active' : ''}"><i></i><b>${name}</b></button>`).join('')}</div></div>`;
    const animGroup = `<div class="property-group"><h4>ANIMATION</h4><label>Inträdeseffekt<select id="wsEntrance"><option value="none">Ingen</option><option value="fade">Tona in</option><option value="slideUp">Glid upp</option><option value="pop">Poppa in</option><option value="signal">Signal</option><option value="gilded">Gyllene</option></select></label><label class="range-label">Varaktighet <b>${w.entranceDuration || 600} ms</b><input id="wsEntranceDuration" type="range" min="150" max="1500" step="50" value="${w.entranceDuration || 600}"></label><label class="range-label">Opacitet <b>${Math.round((w.opacity ?? 1) * 100)}%</b><input id="wsOpacity" type="range" min="10" max="100" value="${Math.round((w.opacity ?? 1) * 100)}"></label></div>`;

    out = out.replace('<div class="property-group"><h4>POSITION', skinGroup + animGroup + '<div class="property-group"><h4>POSITION');
    return out;
  };

  // ---- Bind: wire crown/skin/animation/opacity controls + Content/Design/Animation tabs ----
  const wsExtraBind = bind;
  bind = function () {
    wsExtraBind();
    if (view !== 'editor') return;
    const w = state.widgets.find(x => x.id === selected);
    if (!w || !RANKING_TYPES.includes(w.type)) return;

    const crown = document.querySelector('#wsShowCrown');
    if (crown) crown.onchange = e => { w.showCrown = e.target.checked; save(); render(); };

    const autoMedal = document.querySelector('#wsAutoMedal');
    if (autoMedal) autoMedal.onchange = e => { w.autoMedal = e.target.checked; save(); render(); };

    const liveData = document.querySelector('#wsLiveData');
    if (liveData) liveData.onchange = e => { w.useLiveData = e.target.checked; save(); render(); toast(e.target.checked ? 'Visar riktig aktivitet' : 'Visar demodata'); };

    const liveMetric = document.querySelector('#wsLiveMetric');
    if (liveMetric) liveMetric.onchange = e => { w.liveMetric = e.target.value; save(); render(); };

    document.querySelectorAll('[data-ws-skin]').forEach(btn => {
      btn.onclick = () => { w.skin = btn.dataset.wsSkin; save(); render(); };
    });

    const entrance = document.querySelector('#wsEntrance');
    if (entrance) { entrance.value = w.entranceAnimation || 'none'; entrance.onchange = e => { w.entranceAnimation = e.target.value; save(); render(); }; }

    const duration = document.querySelector('#wsEntranceDuration');
    if (duration) duration.onchange = e => { w.entranceDuration = +e.target.value; save(); render(); };

    const opacity = document.querySelector('#wsOpacity');
    if (opacity) opacity.onchange = e => { w.opacity = (+e.target.value) / 100; save(); render(); };

    // Content / Design / Animation tabs, built once per render cycle from the property-group headings.
    const panel = document.querySelector('.properties');
    if (!panel) return;
    const groups = [...panel.querySelectorAll('.property-group')];
    groups.forEach(g => {
      const heading = (g.querySelector('h4')?.textContent || '').toUpperCase();
      if (heading.includes('POSITION') || g.classList.contains('ranking-cycle-editor')) { delete g.dataset.wsTab; return; }
      g.dataset.wsTab = heading.includes('ANIMATION') ? 'animation' : heading.includes('DESIGN') ? 'design' : 'content';
    });

    let nav = panel.querySelector('.ws-tabs');
    if (!nav) {
      nav = document.createElement('div');
      nav.className = 'ws-tabs';
      nav.innerHTML = '<button type="button" data-ws-tab="content">Content</button><button type="button" data-ws-tab="design">Design</button><button type="button" data-ws-tab="animation">Animation</button>';
      groups[0]?.before(nav);
      nav.querySelectorAll('button').forEach(btn => btn.onclick = () => {
        w.wsActiveTab = btn.dataset.wsTab;
        applyTab();
        nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
      });
    }
    function applyTab() {
      const activeTab = w.wsActiveTab || 'content';
      panel.querySelectorAll('.property-group[data-ws-tab]').forEach(g => {
        g.style.setProperty('display', g.dataset.wsTab === activeTab ? 'flex' : 'none', 'important');
      });
    }
    const activeTab = w.wsActiveTab || 'content';
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.wsTab === activeTab));
    applyTab();
  };

  // ---- Full Avatar Frame library (32 names, Killar/Tjejer tabs) — replaces whatever the existing
  // proTopLikeFrameBind/premiumProfileFramesBind last wrote into .pro-frame-picker, same "last loaded
  // wins" pattern those two already use against each other. ----
  // Picker markup extracted into a standalone function (and exposed on window) so gift-alert-frames.js
  // can mount the exact same picker for the gift/alert widget family without duplicating this table.
  window.vyraBuildFramePicker = function (w) {
    const gender = w.frameGenderTab === 'girls' ? 'girls' : 'boys';
    const current = w.profileFrame || 'none';
    const swatch = ([id, name, file, ext]) => `<button type="button" data-ws-frame="${id}" class="ws-frame-swatch${current === id ? ' active' : ''}${ext === 'svg' ? ' placeholder' : ''}"><img src="assets/images/profile-frames/${file}.${ext}" alt=""><b>${name}</b>${ext === 'svg' ? '<small>platshållare</small>' : ''}</button>`;
    return `
      <span>AVATAR-RAMAR · VÄLJ RAM</span>
      <div class="ws-frame-gender-tabs">
        <button type="button" data-ws-gender="boys" class="${gender === 'boys' ? 'active' : ''}">KOLLEKTION 1</button>
        <button type="button" data-ws-gender="girls" class="${gender === 'girls' ? 'active' : ''}">KOLLEKTION 2</button>
      </div>
      <div class="ws-frame-grid">
        <button type="button" data-ws-frame="none" class="ws-frame-swatch${current === 'none' ? ' active' : ''}"><i>×</i><b>Ingen</b></button>
        ${FRAMES[gender].map(swatch).join('')}
      </div>
      <select id="proTopLikeFrame" aria-label="Profilram"><option value="none">Ingen</option>${Object.values(FRAMES).flat().map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select>`;
  };

  const wsFramesBind = bind;
  bind = function () {
    wsFramesBind();
    if (view !== 'editor') return;
    const w = state.widgets.find(x => x.id === selected);
    const picker = document.querySelector('.pro-frame-picker');
    if (!w || !RANKING_TYPES.includes(w.type) || !picker) return;

    const current = w.profileFrame || 'none';
    picker.innerHTML = window.vyraBuildFramePicker(w);

    picker.querySelector('select').value = current;
    picker.querySelectorAll('[data-ws-gender]').forEach(btn => btn.onclick = () => { w.frameGenderTab = btn.dataset.wsGender; render(); });
    picker.querySelectorAll('[data-ws-frame]').forEach(btn => btn.onclick = () => {
      w.profileFrame = btn.dataset.wsFrame; save(); render();
      toast(btn.dataset.wsFrame === 'none' ? 'Profilram borttagen' : `${btn.querySelector('b').textContent} vald`);
    });
  };

  // Overlay pages auto-render on a setTimeout(0) right after page load (see media.js), which can race
  // ahead of this dynamically-loaded script. Force one re-render so skin/crown/opacity/animation are
  // reflected in OBS even when this file lost that race.
  if (new URLSearchParams(location.search).has('overlay') && typeof render === 'function') render();
})();
