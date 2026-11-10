(function () {
  'use strict';
  // TOP LIKE · NEONRAMAR — tabellerna och panelposten (huvudfilen: toplike-ljusring.js).
  // Laddas TIDIGT, efter vyra-ranking-panel.js och före vyra-panelordning.js: alla panelposter ska finnas
  // innan panelordningen läser registret (tests/panelram.test.js). Ritningen ligger i toplike-ljusring.js,
  // som måste laddas SENT (efter ranking-sixpack.js) för att ligga ytterst i wh-kedjan — därför två filer.
  if (window.VyraTopLikeLjusringTabeller) return;
  const SKIN = 'ljusring';
  // ---------- ramarna ----------
  // n = bildnummer i assets/images/toplike-ljusring (ram-n.png hela, ram-n-ring.png ringen, ram-n-golv.png golvskenet).
  // band = ringens inre och yttre kant som andel av halva bilden (uppmätt ur alfakanalen).
  const RAMAR = Object.freeze({
    bla: { namn: 'Blå', n: 1, band: [0.722, 0.911], farg: '#3d7bff' },
    gron: { namn: 'Grön', n: 2, band: [0.758, 0.871], farg: '#3bd23b' },
    rod: { namn: 'Röd', n: 3, band: [0.706, 0.903], farg: '#ff2a2a' },
    magenta: { namn: 'Magenta', n: 4, band: [0.734, 0.907], farg: '#e040ff' },
    regnbage: { namn: 'Regnbåge', n: 5, band: [0.71, 0.895], farg: '#ff4fd8' },
    lila: { namn: 'Lila', n: 6, band: [0.641, 0.851], farg: '#8a4dff' },
    turkos: { namn: 'Turkos', n: 7, band: [0.722, 0.831], farg: '#14c9a0' },
    guld: { namn: 'Guld', n: 8, band: [0.681, 0.798], farg: '#ffae1a' },
    vag: { namn: 'Våg', n: 9, band: [0.702, 0.911], farg: '#2f6bff' },
    stralar: { namn: 'Strålar', n: 10, band: [0.601, 0.855], farg: '#c04dff' },
    regnbage2: { namn: 'Regnbåge 2', n: 11, band: [0.681, 0.94], farg: '#ff4fa0' },
    prickar: { namn: 'Prickar', n: 12, band: [0.661, 0.827], farg: '#2fd8b0' },
    virvel: { namn: 'Virvel', n: 13, band: [0.621, 0.915], farg: '#ff4fd8' },
    teknik: { namn: 'Teknik', n: 14, band: [0.673, 0.899], farg: '#4f8bff' },
    flammor: { namn: 'Flammor', n: 15, band: [0.56, 0.903], farg: '#6a6bff' },
    banor: { namn: 'Banor', n: 16, band: [0.573, 0.899], farg: '#ff8a2a' },
    equalizer: { namn: 'Equalizer', n: 17, band: [0.548, 0.839], farg: '#4fd8ff' },
    spiral: { namn: 'Spiral', n: 18, band: [0.573, 0.879], farg: '#5a7bff' },
    // Enkla ramar ritade i kod (Davids bilder hade bakgrund och gick inte att klippa ut).
    formorkelse: { namn: 'Förmörkelse', kod: true, band: [0.80, 0.84], farg: '#ff4fc8' },
    neonring: { namn: 'Neonring', kod: true, band: [0.80, 0.845], farg: '#c04dff' },
    duo: { namn: 'Duo', kod: true, band: [0.80, 0.845], farg: '#2fc8ff' }
  });

  const LAGEN = { pall: 'Pall', liggande: 'Liggande', staende: 'Stående', vanster: 'Vänster sida', hoger: 'Höger sida' };
  const FYRMODELLER = { neon: 'Neon', horn: 'Hörn', diamant: 'Diamant', teknik: 'Teknik', regnbage: 'Regnbåge', glas: 'Glas',
    metall: 'Metall', cyber: 'Cyber', pixel: 'Pixel', elektrisk: 'Elektrisk', polaroid: 'Polaroid', kristall: 'Kristall' };
  const NAMNSTILAR = { skugga: 'Skugga', moln: 'Moln', band: 'Band', kontur: 'Kontur i färg', guld: 'Guld', versaler: 'Versaler', '3d': '3D' };
  const TYPSNITT = { system: ['Standard (extra kraftig)', "'Segoe UI Black', 'Arial Black', system-ui, sans-serif", ''],
    montserrat: ['Montserrat', "'Montserrat', sans-serif", 'Montserrat:wght@800;900'], bebas: ['Bebas Neue', "'Bebas Neue', sans-serif", 'Bebas+Neue'],
    orbitron: ['Orbitron', "'Orbitron', sans-serif", 'Orbitron:wght@800;900'], russo: ['Russo One', "'Russo One', sans-serif", 'Russo+One'],
    poppins: ['Poppins', "'Poppins', sans-serif", 'Poppins:wght@800;900'], monoton: ['Monoton', "'Monoton', sans-serif", 'Monoton'] };
  const IKONER = ['❤', '👍', '🔥', '⭐', ''];

  // Standardvärden = det David valde på lekplatsen. Ett fält som aldrig satts ger standardvärdet.
  const STANDARD = Object.freeze({ tlnLage: 'pall', tlnRam: 'bla', tlnForm: 'rund', tlnFyr: 'neon', tlnLevande: 'ljus', tlnGlans: 'glans',
    tlnLut: 0, tlnVrid: 0, tlnNamnstil: 'skugga', tlnTypsnitt: 'system', tlnNamnFarg: '', tlnAntalFarg: '', tlnTextStorlek: 100,
    tlnIkon: '❤', tlnPlatta: false, tlnTextVaxer: true });
  const falt = (w, k) => (w && w[k] !== undefined && w[k] !== null && w[k] !== '') ? w[k] : STANDARD[k];

  // ---------- panelen ----------
  const R = window.VyraPanelregister;
  if (R && typeof R.definiera === 'function') {
    const alt = o => Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v[0] : (v.namn || v)]);
    const arFyrkant = w => falt(w, 'tlnForm') === 'fyrkant';
    const FALT = Object.keys(STANDARD);
    R.definiera({
      typ: 'templateTopLike',
      modell: w => w && w.type === 'templateTopLike' && w.skin === SKIN ? SKIN : null,
      galler: [SKIN],
      rubrik: () => 'Top Like',
      marke: () => 'Neonramar',
      katalognyckel: () => 'catalog:toplike:' + SKIN,
      test: 'ranking',
      ersatter: ['.ws-tabs', '#tcAvatar', '#tpAvatar', '.pro-frame-picker'],
      arv: ['highlight', 'text', 'fontFamily'],
      kontroller: [
        { sektion: 2, typ: 'text', falt: 'templateTitle', etikett: 'Rubrik', legacyId: '#likeTitle' },
        { sektion: 2, typ: 'kryss', falt: 'showTitle', etikett: 'Visa rubrik', legacyId: '#likeShowTitle' },
        { sektion: 2, typ: 'tal', falt: 'likeCount', etikett: 'Antal personer (högst 5)', enhet: 'st', legacyId: '#likeCount' },
        { sektion: 2, typ: 'kryss', falt: 'showDataName', etikett: 'Visa namn', legacyId: '#likeShowName' },
        { sektion: 2, typ: 'kryss', falt: 'showProfile', etikett: 'Visa profilbilder', legacyId: '#likeShowAvatar' },
        { sektion: 2, typ: 'kryss', falt: 'showRank', etikett: 'Visa placeringar', legacyId: '#rkVisaPlats' },
        { sektion: 2, typ: 'kryss', falt: 'showDataValue', etikett: 'Visa värden', legacyId: '#likeShowValue' },
        { sektion: 2, typ: 'kryss', falt: 'useLiveData', etikett: 'Visa riktig aktivitet', legacyId: '#wsLiveData', om: w => w.useLiveData === false },
        { sektion: 2, typ: 'val', falt: 'liveMetric', etikett: 'Rangordna efter', legacyId: '#wsLiveMetric' },
        { sektion: 2, typ: 'val', falt: 'dateRange', etikett: 'Period', legacyId: '#wsDateRange' },
        { sektion: 2, kalla: 'live', typ: 'text', etikett: 'Listan kommer från TikTok: namn, profilbild och likes för dem som gett mest.' },
        { sektion: 3, typ: 'val', falt: 'tlnLage', etikett: 'Läge', alternativ: alt(LAGEN) },
        { sektion: 3, typ: 'std-position', utan: ['hojd', 'las'] },
        { sektion: 3, typ: 'kryss', falt: 'tlnTextVaxer', etikett: 'Texten krymper mindre än ramarna', standard: true },
        { sektion: 4, typ: 'val', falt: 'tlnNamnstil', etikett: 'Namnstil', alternativ: alt(NAMNSTILAR) },
        { sektion: 4, typ: 'val', falt: 'tlnTypsnitt', etikett: 'Typsnitt', alternativ: alt(TYPSNITT) },
        { sektion: 4, typ: 'tal', falt: 'tlnTextStorlek', etikett: 'Textstorlek', min: 60, max: 160, steg: 5, enhet: '%', standard: 100 },
        { sektion: 4, typ: 'farg', falt: 'tlnNamnFarg', etikett: 'Namnets färg', standard: '#ffffff' },
        { sektion: 4, typ: 'farg', falt: 'tlnAntalFarg', etikett: 'Antalets färg (tomt = ramens färg)' },
        { sektion: 4, typ: 'val', falt: 'tlnIkon', etikett: 'Ikon efter antalet', alternativ: IKONER.map(i => [i, i || 'Ingen']) },
        { sektion: 4, typ: 'kryss', falt: 'tlnPlatta', etikett: 'Mörk platta bakom texten' },
        { sektion: 5, typ: 'val', falt: 'tlnRam', etikett: 'Ram', alternativ: alt(RAMAR) },
        { sektion: 5, typ: 'val', falt: 'tlnForm', etikett: 'Bildens form', alternativ: [['rund', 'Rund (ramarna)'], ['fyrkant', 'Fyrkant']] },
        { sektion: 5, typ: 'val', falt: 'tlnFyr', etikett: 'Fyrkantig modell', alternativ: alt(FYRMODELLER), om: arFyrkant },
        { sektion: 5, typ: 'val', falt: 'tlnLevande', etikett: 'Levande ram', alternativ: [['av', 'Av'], ['ljus', 'Ljus springer runt'], ['snurra', 'Ramen snurrar']] },
        { sektion: 5, typ: 'val', falt: 'tlnGlans', etikett: 'Glans över profilbilden', alternativ: [['av', 'Av'], ['glans', 'Glans'], ['svep', 'Glans med svep']] },
        { sektion: 5, typ: 'tal', falt: 'tlnLut', etikett: 'Lutning (3D)', min: -45, max: 45, steg: 1, enhet: '°', standard: 0 },
        { sektion: 5, typ: 'tal', falt: 'tlnVrid', etikett: 'Vridning', min: -30, max: 30, steg: 1, enhet: '°', standard: 0 },
        { sektion: 5, typ: 'tal', falt: 'opacity', etikett: 'Opacitet', enhet: '%', legacyId: '#wsOpacity' },
        { sektion: 6, typ: 'std-entre' },
        { sektion: 7, typ: 'std-aterstall' }
      ],
      utseendeFalt: [...FALT, 'opacity', 'entranceAnimation', 'entranceDuration']
    });
  }

  window.VyraTopLikeLjusringTabeller = Object.freeze({ SKIN, RAMAR, LAGEN, FYRMODELLER, NAMNSTILAR, TYPSNITT, IKONER, STANDARD });
})();
