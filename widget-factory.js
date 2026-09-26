// Every widget the catalog can create used to have its default configuration written inline in the
// button's own click handler — twenty object literals in media.js, several inside theme and frame
// loops. Nothing else could create a widget, which is why "Kopiera widgetlänk" could not make one
// without a placed widget to copy from.
//
// This is that configuration, once, addressed by catalog key:
//
//     VyraWidgets.create('catalog:topgift:neon', { placement: 'standalone' })
//
// The caller supplies no accent, no width, no title. Variant tables (theme colours, frame accents,
// boost packs) are registered here by whoever owns them for rendering — media.js registers the three
// frame tables it already needs for drawing, and the short colour tables live here outright. Either
// way there is exactly one copy of every value, and it is reachable as metadata:
// VyraWidgets.variants('topgift') lists what the catalog can build.
(function (root) {
  'use strict';

  // Namnen pa de designer vars renderare laser andra falt an likeTheme - se byggarna nedan.
  // Ranking-sixpack (2026-09-24): approved-rankings.js/topcoins-v2.js atersatter alltid dessa falt
  // efter VyraWidgets.create() for sina egna katalogknappar, sa dessa tva listor blockerar inte
  // den vagen - men andra anropare av samma fabriksnyckel (t.ex. widgetlank-kopiering) far INGEN
  // sadan efterhandsratt, sa listorna maste anda halla samma sex nya ID:n som de tva filerna ovan.
  const LIKE_SKINN = new Set(['clean-bar', 'soft-stack', 'mini-podium', 'side-rank', 'voltage', 'basic-v2', 'prism-vertical', 'prism-horizontal', 'celestial', 'royal-rose']);
  // PENSIONERADE RANKINGDESIGNER (2026-09-24, Davids beslut). Fabriken skapar ALDRIG en ny widget
  // med någon av dem: en gammal nyckel (catalog:toplike:clean-bar, catalog:ranking:templateTopPoints:
  // podium ...) bygger i stället närmaste nya design, så inget gammalt val sparas i state eller molnet.
  // Samma val som ranking-sixpack.js:s PENSION, som tar hand om widgetar som redan var sparade.
  // Två tabeller, inte en: för Top Like är 'clean'/'center' LAYOUTVÄRDEN (likeTheme) som även de nya
  // designernas presets sätter, inte designer — bara de fyra skinnen är pensionerade där.
  const TOPLIKE_PENSION = { 'clean-bar': 'voltage', 'soft-stack': 'voltage', 'side-rank': 'voltage', 'mini-podium': 'prism-horizontal' };
  const TOPPOINTS_PENSION = { clean: 'voltage', neon: 'voltage', center: 'prism-horizontal', podium: 'prism-horizontal' };
  const TOPCOINS_V2 = new Set(['halo', 'signal-orbit', 'voltage', 'basic-v2', 'prism-vertical', 'prism-horizontal', 'celestial', 'royal-rose']);

  // Battle MVP-stilar med egen fasmaskin. De sju aldre stilarna har ingen entre alls och behaller
  // sin 7-sekundersvisning; de har kor 0,9 s entre, 5 s hall och 0,9 s exit, och renderas med ett
  // rorelseomslag (.mvp-plate) som de gamla inte far — se battleMvpHtml i media.js.
  const PREMIUM_MVP_STYLES = new Set(['royal-purple', 'neon-cyber', 'diamond-elite']);

  // A widget id is a link that has to stay valid, so it needs real entropy — Date.now() alone
  // collides whenever two widgets are created in the same millisecond. There is deliberately no
  // Math.random() fallback: a weak id would be a link that silently points at someone else's widget
  // after a collision, so a browser without crypto gets a clear failure instead.
  function token() {
    const crypto = root.crypto;
    if (crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }
    if (crypto && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(2);
      crypto.getRandomValues(buf);
      return buf[0].toString(36) + buf[1].toString(36);
    }
    throw new Error('Kan inte skapa widget: webbläsaren saknar crypto.randomUUID och crypto.getRandomValues');
  }

  function newId(type) { return String(type) + '-' + Date.now().toString(36) + '-' + token(); }

  // ---- variant tables ---------------------------------------------------------------------------
  // Short tables live here. The three frame tables are registered by media.js, which owns them for
  // rendering; duplicating 73 frame definitions to satisfy a lookup would be the same mistake this
  // file exists to undo.
  // Guardian Emblem-matten, EN gang. BUILD bygger ur den, och panelen laser samma tabell via
  // `VyraWidgets.variants('guardianemblem.matt')` nar praktsteget byts — en widget vars hojd star
  // pa tva stallen far forr eller senare tva olika varden. Bredden ar 400 i varje steg: det ar
  // familjens format, inte en installning per niva.
  const GE_MATT = { 1: [400, 450], 2: [400, 535], 3: [400, 560], 4: [400, 570] };

  const TABLES = {
    // Short colour tables, verbatim from the catalog they came from.
    // Premiumdesignerna ar en EGEN familj, inte fler rader i topgift.theme ovan: de delar bara
    // namn, inte defaults - premium ar 340 px bred mot temats 280, och bar giftSize och glow.
    // Accenten ar densamma for alla 21; tabellen bar etiketten sa den sager nagot mer an att
    // namnet finns.
    // De tre sista katalogsektionerna. Etiketterna ar desamma som knapparna visar, sa tabellen
    // bar nagot mer an att namnet finns - en okand variant kastar med giltiga alternativ i texten.
    'lastx.design': { card: 'Card', stack: 'Stack', skew: 'Skew', badge: 'Badge',
      royal: 'Royal Coronation' },
    'custom.kind': { text: 'templateCustomText', image: 'templateCustomImage',
      video: 'templateCustomVideo' },
    'giftfireworks.motion': { magnetic: 'Magnetic Return', spiral: 'Spiral Recall',
      bloom: 'Crystal Bloom' },
    'giftfireworks.theme': {
      royal: {label:'Lila & guld',primary:'#ffd06b',secondary:'#a764ff',motion:'magnetic'},
      ice: {label:'Isblå & silver',primary:'#dcecff',secondary:'#49cfff',motion:'bloom'},
      rose: {label:'Roséguld',primary:'#edb98b',secondary:'#ff7cc8',motion:'bloom'},
      comet: {label:'Kometspiral',primary:'#45e1d1',secondary:'#ff806c',motion:'spiral'},
      supernova: {label:'Supernova',primary:'#ffd06b',secondary:'#a764ff',motion:'supernova'}
    },
    // TVA DESIGNER KVAR (David 2026-09-23: "behall neon, royal o ta bort resten"). De nitton andra
    // var omformningar av samma tre <i>-lador i `.topgift-ornament` — renderaren ar EN for hela
    // familjen, sa hela designutrymmet var tre tomma lador plus en accentfarg. Fem av dem bar en
    // enda CSS-regel var. Se docs/topgift-gallringen.md; topgift-pension.js pekar de nitton pa
    // royal sa sparade layouter laser.
    //
    // `royal` far ALDRIG tas bort utan att defaulten i premium-final.js (`w.theme||'royal'`) andras
    // i samma andetag — prov P3 i tests/topgift-pension.test.js vaktar det.
    'topgift.premium': { royal: 'Royal Gold', neon: 'Neon Purple' },
    'topstreak.theme': {"inferno":"#ff671f","neon":"#cf45ff","ice":"#65ddff","royal":"#ffc13b","sakura-rail":"#ff8fc7","cyber-grid":"#3ddcff","storm":"#8fa6ff"},
    // Samma skal som topgift.premium: eget bord, egna defaults. Har bar tabellen accentfargen,
    // som skiljer sig per design.
    'topstreak.premium': { liquid: '#d9a441', momentum: '#d8dee9', tier: '#c68cff',
      thread: '#e7bc63', chrono: '#9db7d0', chain: '#d2d5da', thermo: '#ff8a36' },
    'topstreak.width': {neon:235,'sakura-rail':235,'cyber-grid':330,storm:310},
    'ranking.kind': {templateTopCoins:{title:'TOP COINS',icon:'●',label:'Top Coins'},templateTopPoints:{title:'TOP POINTS',icon:'◆',label:'Top Points'}},
    'heartgoal.theme': {classic:['#ff447d','#ffffff'],dark:['#b331ff','#e9d8ff'],emerald:['#37ed8a','#d8ffe9'],galaxy:['#a764ff','#efddff'],golden:['#ffbd2e','#fff1bb'],ice:['#42d8ff','#dff9ff'],neon:['#ff3bc8','#ffffff'],ocean:['#2caeff','#d8f2ff'],sakura:['#ff78b7','#fff0f7'],frost:['#8fd4ff','#eaf8ff'],midnight:['#5b6bff','#dde1ff'],citrus:['#ffb020','#fff4dd']},
    'fanlevel.theme': {gold:['#ff8a20','#ffd36b'],neon:['#ff3ac8','#a74cff'],ice:['#29cfff','#b9f5ff'],emerald:['#35e783','#baffd4'],fire:['#ff3c24','#ffb52d'],sakura:['#ff6fa8','#ffd9e8'],storm:['#6d7bff','#d6dbff'],royal:['#c79bff','#f0e2ff']},
    // The eight layouts from the Fan Level reference board. Theme remains an editor choice;
    // layout controls structure and motion, so a created catalog widget is never just a recolour.
    // 'hero' star forst for att den ar STANDARDEN: fanLevelHtml renderar fan-layout-${fanLayout
    // ||'hero'}, sa en widget utan vald modell ar redan en hero. Den saknade bara sin plats i
    // registret, vilket gjorde att katalogen inte kunde skapa den och provet inte kunde mata den.
    'fanlevel.layout': {hero:'Hero Card',stack:'Original Fan Stack',heartbeat:'Heartbeat Side',badgereveal:'Fan Badge Reveal',loyalty:'Loyalty Ring',hearts:'Rising Hearts',ribbon:'Welcome Ribbon',duo:'Community Duo'},
    // Guardian Emblem. Praktsteget ar familjens ENDA katalogingang — sprak, namn och egen text ar
    // panelval, eftersom ett emblem alltid ser likadant ut och bara bar olika mycket guld. Matten
    // star i GE_MATT nedan, inte har, sa etiketten och mattet aldrig kan glida isar utan att ett
    // prov ser det. Namnen ar desamma som STEG-registret i guardian-emblem-fas.js bar.
    'guardianemblem.matt': GE_MATT,
    'guardianemblem.step': {1:'Ram',2:'Hjort',3:'Krona',4:'Kungakrona'},
    'guardianemblem.model': {classic:'Guld',sapphire:'Blå kristall',emerald:'Grön aura'},
    'battlemvp.celebration': {coronation:{photo:{left:24.085,top:28.305,width:51.83,height:47.05},label:'Kröningen',accent:'#f5ce70'},wings:{photo:{left:21.93,top:20.815,width:56.14,height:54.23},label:'Vingar',accent:'#cbb4ff'},portal:{photo:{left:24.32,top:20.5,width:51.36,height:49.6},label:'Energiportalen',accent:'#67eff0'},rosegold:{photo:{left:12.44,top:10.29,width:74.16,height:67.94},label:'Roséguld',accent:'#efb6ae'},pearl:{photo:{left:17.705,top:14.75,width:64.59,height:61.4},label:'Pärlvingar',accent:'#f2dcdb'},moon:{photo:{left:16.905,top:13.395,width:72.57,height:65.39},label:'Lavendelmåne',accent:'#c4b4ff'}},
    'battlemvp.style': {inferno:'#ff8b16',royal:'#ff8b16',ice:'#52d9ff',cyber:'#cb46ff',storm:'#6d7bff',aurora:'#4fd8c4',samurai:'#ff3355','royal-purple':'#f5cf6b','neon-cyber':'#3ff5ff','diamond-elite':'#e8edf3'},
    'glovesnipe.pack': {koiPearl:['Tjej','#3ecdd6','#e8c37a','ice','koi'],masquerade:['Tjej','#7a1128','#d4af37','fire','masquerade']},
    'glovesnipe.detail': {koiPearl:['Koi Pearl Lagoon','🐟','KOI STRIKE'],masquerade:['Masquerade Ball','🎭','MASKED STRIKE']},
    // Gift Jar. Till skillnad fran temaregistren ovan bar varje modell bade farg OCH symbol:
    // burken ritas ur dem — accent ar glaset, light ar innehallet, symbol ar markningen.
    'giftjar.model': {
      lion:{label:'Royal Lion',accent:'#f4c971',light:'#fff0a8',symbol:'♛'},
      dragon:{label:'Ember Dragon',accent:'#ff9c58',light:'#ffd896',symbol:'◆'},
      phoenix:{label:'Phoenix Rise',accent:'#ffc4a1',light:'#ffe1ba',symbol:'✦'},
      panther:{label:'Midnight Panther',accent:'#a0f2d1',light:'#dcfbff',symbol:'◆'},
      peacock:{label:'Sapphire Peacock',accent:'#8fdded',light:'#f4cb7e',symbol:'✦'}
    },
    // The frame tables. media.js reads these back through VyraWidgets.variants() for rendering —
    // they are geometry as much as colour, and one copy is the whole point.
    'topstreak.frame': {'amethyst-heart':{label:'Amethyst Heart',accent:'#c07bff',aspect:0.9143,circle:{left:28.9,top:27.65,width:42.19,height:36.38},plate:{left:16.57,top:70.15,width:66.58,height:16.58}},'crystal-spire':{label:'Crystal Spire',accent:'#b083ff',aspect:0.7871,circle:{left:28.13,top:32.66,width:43.43,height:33.73},plate:{left:12.81,top:72.71,width:77.11,height:14.87}},'gold-wings':{label:'Golden Wings',accent:'#ffc13b',aspect:0.8717,circle:{left:28.85,top:27.29,width:42.3,height:35.73},plate:{left:16.66,top:70.03,width:66.97,height:15.86}},'rose-heart':{label:'Rose Heart',accent:'#ff8fc8',aspect:0.8947,circle:{left:30.68,top:22.04,width:39.81,height:39.33},plate:{left:23.29,top:70.2,width:53.12,height:15.92}},'luna-stars':{label:'Luna Stars',accent:'#ffd57f',aspect:0.7673,circle:{left:25.27,top:25.97,width:50.13,height:36.54},plate:{left:19.89,top:68.68,width:61.88,height:14.82}},'crystal-tiara':{label:'Crystal Tiara',accent:'#b083ff',aspect:0.899,circle:{left:29.56,top:27.64,width:41.18,height:37.99},plate:{left:20.32,top:71.36,width:59.07,height:14.8}},'violet-wings':{label:'Violet Wings',accent:'#a866ff',aspect:0.9644,circle:{left:29.18,top:24.79,width:41.93,height:38.37},plate:{left:15.87,top:67.95,width:68.25,height:17.26}},'star-crown':{label:'Star Crown',accent:'#e8c25a',aspect:0.8042,circle:{left:26.18,top:26.88,width:47.31,height:38.05},plate:{left:15.7,top:70.49,width:71.57,height:15.11}}},
    'battlemvp.frame': {'gold-crown':{label:'Gold Crown',accent:'#ffc13b',aspect:0.8906,circle:{left:23.98,top:22.92,width:53.8,height:47.92},plate:{left:20.44,top:80.83,width:60.58,height:13.33}},'royal-ribbon':{label:'Royal Ribbon',accent:'#e8c25a',aspect:0.8125,circle:{left:18.74,top:23.04,width:62.51,height:50.79},plate:{left:15.16,top:80.52,width:70.0,height:12.92}},'laurel-star':{label:'Laurel Star',accent:'#ffd166',aspect:0.8229,circle:{left:17.63,top:20.24,width:63.47,height:52.23},plate:{left:13.29,top:83.1,width:73.42,height:12.71}},'dark-wings':{label:'Dark Wings',accent:'#c9d2e0',aspect:0.9728,circle:{left:21.97,top:22.46,width:55.51,height:54.0},plate:{left:17.21,top:81.66,width:66.15,height:14.13}},'dragon-fire':{label:'Dragon Fire',accent:'#ff5230',aspect:0.8639,circle:{left:16.19,top:15.56,width:65.79,height:56.84},plate:{left:13.48,top:78.66,width:73.94,height:15.71}},'nautical-helm':{label:'Nautical Helm',accent:'#d9a05b',aspect:0.8717,circle:{left:20.01,top:16.92,width:59.68,height:52.02},plate:{left:16.76,top:80.37,width:66.79,height:14.66}},'shadow-star':{label:'Shadow Star',accent:'#e8b64d',aspect:0.9124,circle:{left:19.96,top:12.56,width:60.38,height:55.1},plate:{left:15.7,top:80.56,width:68.61,height:11.75}}}
  };

  // Tables are the production source; nothing registers them from outside, so create() works the
  // moment this file has loaded. media.js reads them back through variants() for rendering.
  // Frozen at load and handed out as a copy: media.js reads these back for rendering, and a caller
  // that mutated what it got would be editing the production source of every future widget.
  // The catalog and the renderer disagreed on the name for the same goal: the renderer defaults to
  // followers, the catalog snapshot said follows. follows is canonical; followers is accepted as a
  // legacy alias and normalised, so one variant can never produce two standalone instances with two
  // different links. Exported because whatever reads a saved widget later — the goal runtime — has
  // to agree with the catalog about what it means.
  // diamonds tillkom 2026-09-07 (#367): motorn matade redan metriken, men ingen widget kunde
  // valja den. Andras den har raden maste server/goal-metrics.js andras i SAMMA commit —
  // tests/goal-metric-parity.test.js ar det som gor det omojligt att glomma.
  const GOAL_KINDS = { follows: 'follows', followers: 'follows', likes: 'likes', diamonds: 'diamonds' };
  function goalKind(value) {
    const raw = value === undefined || value === null || value === '' ? 'follows' : String(value);
    const canonical = GOAL_KINDS[raw];
    if (!canonical) {
      throw new Error('Okänd måltyp "' + raw + '" — giltiga: ' + Object.keys(GOAL_KINDS).join(', '));
    }
    return canonical;
  }

  const deepFreeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.keys(value).forEach(k => deepFreeze(value[k]));
    }
    return value;
  };
  Object.keys(TABLES).forEach(name => deepFreeze(TABLES[name]));
  const table = name => TABLES[name] || {};

  // A missing or misspelled variant must never quietly resolve to another design — an unknown theme
  // that fell through to undefined would build a widget with no accent, and an unknown frame would
  // build one with no artwork. Both look like a rendering bug rather than a typo in a catalog key.
  function pick(name, key, label) {
    const found = table(name)[key];
    if (found === undefined) {
      throw new Error('Okänd ' + (label || 'variant') + ' "' + key + '" — giltiga: ' +
        Object.keys(table(name)).join(', '));
    }
    return found;
  }

  // ---- the defaults -----------------------------------------------------------------------------
  // One builder per catalog family. `v` holds the values resolved from the tables above — the
  // builders never read a table themselves, which keeps the defaults readable next to each other.
  const GOAL_MOTION_MATT = {
    circle: { x: 70, y: 120, width: 360 },
    landscape: { x: 16, y: 120, width: 400 },
    portrait: { x: 151, y: 30, width: 130 },
  };

  const BUILD = {
    'video': v => ({ type: 'video', x: 40, y: 180, title: v.title, value: v.value, src: v.src }),

    'topgift': () => ({
      type: 'templateTopGift', x: 70, y: 180, width: 280, title: 'VYRA Top Gift', value: '',
      dataName: '@StreamQueen', dataValue: '44 999', accent: '#ff9d28', dataColor: '#ffffff',
      valueColor: '#ff9d28', dataSize: 18, showDataValue: true
    }),
    // Falt for falt det som premium-final.js:s knapp byggde for hand. Avviker nagot har byter
    // varje befintlig anvandare utseende nasta gang de lagger till en design, sa det finns ett
    // test som jamfor mot den gamla formen.
    'lastx.design': v => ({
      type: 'templateLastX', x: 100, y: 80, width: 500, title: 'Last-X Alerts',
      lastXType: 'all', lastXDesign: v.design, lastXEntrance: 'slide-left', followDuration: 5
    }),
    // Text har egen bredd och en starttext; bild och video delar allt utom hojden. Formen ar
    // hamtad falt for falt fran custom-widgets.js sa befintliga anvandare far samma sak.
    'custom.kind': v => Object.assign(
      { type: v.type, x: 60, y: 120 },
      v.kind === 'text' ? { width: 420, height: 90, customText: 'Skriv din text här' }
                        : { width: 300, height: v.kind === 'video' ? 450 : 300 }
    ),
    'giftfireworks.motion': v => ({
      type: 'templateGiftFireworks', x: 80, y: 950, width: 360, title: 'Gift Fireworks',
      fwMotion: v.motion, fwMin: 1, fwSpeed: 0.6, fwDuration: 5, fwGiftSize: 110,
      fwExplosion: 100, fwDensity: 70, fwColor: '#ff4fa3', fwColor2: '#ffd45b', fwSound: true
    }),
    // HELA FYRVERKERIET PÅ DUKEN (2026-09-26). 540 px bredd i en 432 px duk gick inte att dra i
    // sidled: widget-grans.js klampar x till 0 när widgeten är bredare än duken. 360 bred ger
    // 300 hög (samma 6:5 som motorn ritar i), centrerad med 36 px på var sida.
    'giftfireworks.theme': v => ({
      type: 'templateGiftFireworks', x: 36, y: 120, width: 360, title: 'Gift Fireworks · '+v.label,
      fwTheme: v.theme, fwMotion: v.motion, fwMin: 1, fwSpeed: 0.6, fwDuration: 5, fwGiftSize: 110,
      fwExplosion: 100, fwDensity: 70, fwColor: v.primary, fwColor2: v.secondary, fwSound: true,
      ...(v.theme==='supernova'?{fwNovaStyle:'classic'}:{})
    }),
    'topgift.premium': v => ({
      type: 'templateTopGift', theme: v.theme, x: 70, y: 140, width: 340, title: 'Top Gifter',
      templateTitle: 'TOP GIFTER', dataName: '@StreamQueen', dataValue: '44 999',
      accent: '#d9a441', giftSize: 110, dataSize: 20, topGiftFlipSpeed: 1, topGiftGlow: 55
    }),
    'topstreak.premium': v => ({
      type: 'templateTopStreak', streakTheme: v.theme, x: 65, y: 170, width: 520,
      title: 'Top Streak', templateTitle: 'TOP STREAK', dataName: '@StreamQueen', dataValue: 18,
      accent: v.accent, giftSize: 64, streakSpeed: 1, streakGlow: 50
    }),

    'topstreak': () => ({
      type: 'templateTopStreak', x: 76, y: 180, width: 280, title: 'Top Streak',
      templateTitle: 'TOP STREAK', dataName: '@StreamQueen', dataValue: 18, accent: '#22d3ee',
      dataColor: '#fff', giftSize: 110, streakSpeed: 1, streakGlow: 45
    }),
    'topstreak.theme': v => ({
      type: 'templateTopStreak', streakTheme: v.theme, x: 65, y: 220, width: v.width,
      title: 'Top Streak', templateTitle: 'TOP STREAK', dataName: '@StreamQueen', dataValue: 18,
      accent: v.accent, dataColor: '#fff'
    }),
    'topstreak.frame': v => ({
      type: 'templateTopStreak', streakFrame: v.frame, x: 65, y: 180, width: 300,
      title: 'Top Streak', templateTitle: 'TOP STREAK', dataName: '@StreamQueen', dataValue: 18,
      accent: v.accent, dataColor: '#fff'
    }),

    'toplike.theme': v => {
      if (TOPLIKE_PENSION[v.theme]) v = { ...v, theme: TOPLIKE_PENSION[v.theme] };
      const w = {
        type: 'templateTopLike', x: 70, y: 100, width: 220, title: 'Top Likes',
        templateTitle: 'TOP LIKES', likeCount: 5, likeTheme: v.theme, likePosition: 'left',
        accent: '#ff4da6'
      };
      // DE FYRA GODKANDA SKINNEN (approved-rankings.js) LASER `skin`, INTE likeTheme. Uppmatt
      // 2026-09-20: via fabriken renderades alla fyra som clean-bar - fyra byte-identiska
      // referensbilder - medan katalogknappen satte skin och lat toplike-design.js:s preset ge
      // layout, ram och bredd. Presetet ags av toplike-design.js (en kalla, en tabell); fabriken
      // garanterar `skin` och delegerar resten dit nar modulen finns - i webblasaren alltid, i
      // nodproven bara nar riggen lagger den pa window.
      if (LIKE_SKINN.has(v.theme)) {
        w.skin = v.theme;
        if (typeof root.applyVyraTopLikeStyle === 'function') root.applyVyraTopLikeStyle(w, v.theme);
      }
      return w;
    },
    'ranking.theme': v => {
      const pensionerad = v.type === 'templateTopPoints' && TOPPOINTS_PENSION[v.theme];
      if (pensionerad) v = { ...v, theme: pensionerad };
      const w = {
        type: v.type, x: 80, y: 110, width: 300, title: v.label, templateTitle: v.title,
        likeCount: 5, likeTheme: v.theme,
        accent: v.type === 'templateTopCoins' ? '#ffbd32' : '#9b5cff', profileFrame: 'none'
      };
      // TOP COINS V2 (topcoins-v2.js) LASER `topCoinsDesign`/`skin` OCH DESIGNENS EGEN ACCENT.
      // Samma fynd samma dag: halo och signal-orbit blev byte-identiska via fabriken, for
      // renderaren foll tillbaka pa halo utan faltet. createTopCoins satter design, bredd och
      // accent ur VyraTopCoins.designs; fabriken laser samma tabell nar modulen finns.
      if (v.type === 'templateTopCoins' && TOPCOINS_V2.has(v.theme)) {
        const designer = root.VyraTopCoins && root.VyraTopCoins.designs;
        const meta = designer && designer[v.theme];
        Object.assign(w, { topCoinsDesign: v.theme, skin: v.theme, likeCount: 1,
          width: meta && meta.width ? meta.width : 230, useLiveData: true, liveMetric: 'coins' });
        if (meta && meta.accent) w.accent = meta.accent;
      }
      if (pensionerad) Object.assign(w, { topPointsDesign: v.theme, skin: v.theme });
      return w;
    },

    'heartgoal.theme': v => ({
      type: 'templateHeartGoal', x: 80, y: 120, width: 310, title: 'Heart Me Goal',
      templateTitle: 'HEART ME GOAL', heartCurrent: 0, heartTarget: 50, heartTheme: v.theme,
      heartColor: v.color, heartTextColor: '#ffffff', heartNumberColor: v.color
    }),
    // De nio goal-motion-designerna (#525) far samma matt har som katalogknappen i goal-motion.js
    // ger dem, sa att forhandsvisningen, den fristaende lanken och "Lagg till" visar samma widget.
    // Alla ryms pa en 432 x 768-duk. Aldre modeller behaller sina matt.
    'socialgoal.kind': v => ({
      type: 'templateSocialGoal', goalKind: v.kind,
      ...(GOAL_MOTION_MATT[v.orientation] && /^(crown|heart|diamond)-(orbit|rail|tower)$/.test(v.model)
        ? GOAL_MOTION_MATT[v.orientation]
        : { x: 70, y: 120, width: v.orientation === 'portrait' ? 220 : 440 }),
      title: ({likes:'Like Goal',diamonds:'Diamond Goal'})[v.kind] || 'Follower Goal',
      goalTitle: ({likes:'LIKE GOAL',diamonds:'DIAMOND GOAL'})[v.kind] || 'FOLLOWERS GOAL',
      goalCurrent: 0, goalTarget: 1000, goalModel: v.model, goalOrientation: v.orientation,
      goalColor: ({1:'#ff4f9f',2:'#ff82c8',3:'#49c8ff',4:'#4d8dff','pulse-rail':'#b629ff','pulse-tower':'#b629ff','prism-core':'#38d9ff','prism-spine':'#38d9ff','signal-ribbon':'#ff3d91','heart-column':'#ff3d91'})[v.model] || '#b629ff',
      goalColor2: ({1:'#ffb1dc',2:'#9d4dff',3:'#d9f6ff',4:'#67dcff','pulse-rail':'#20d9ff','pulse-tower':'#20d9ff','prism-core':'#8768ff','prism-spine':'#8768ff','signal-ribbon':'#ff765e','heart-column':'#ff765e'})[v.model] || '#20d9ff'
    }),

    'fanlevel.theme': v => ({
      type: 'templateFanLevel', x: 100, y: 80, width: 260, title: 'Fan Level Up',
      fanHeadline: 'LEVEL UP', fanLevelLabel: 'FAN LEVEL', fanLevel: 12, fanName: 'HeartRiser',
      fanMessage: 'Fan level up!', fanTheme: v.theme, fanColor: v.color, fanLight: v.light
    }),
    'fanlevel.layout': v => ({
      type: 'templateFanLevel', x: 100, y: 80, width: v.layout === 'heartbeat' || v.layout === 'duo' ? 300 : 260,
      title: 'Fan Level Up', fanHeadline: 'FAN LEVEL UP', fanLevelLabel: 'LV.', fanLevel: 12,
      fanName: 'HeartRiser', fanMessage: 'TROGEN SUPPORTER', fanTheme: 'gold',
      fanColor: '#ff8a20', fanLight: '#ffd36b', fanLayout: v.layout
    }),
    // Guardian Emblem. Bredden ar 400 i VARJE steg — det ar familjens format, inte en installning
    // per niva. Hojden ar det praktnivan betalar med, och den vaxer monotont. En widget vars hojd
    // star pa tva stallen far forr eller senare tva olika varden, sa GE_MATT ar det enda stallet.
    'guardianemblem.step': v => ({
      type: 'templateGuardianEmblem', x: 100, y: 80,
      width: GE_MATT[v.step][0], height: GE_MATT[v.step][1],
      title: 'Guardian Emblem', guardianStep: Number(v.step),
      // 'auto' som default: en streamer som inte rort valet ska fa sitt eget sprak, inte vart.
      guardianLang: 'auto', guardianShowUsername: true, guardianCustomText: '',
      guardianUsername: '@Guardian'
    }),
    'guardianemblem.model': v => Object.assign(BUILD['guardianemblem.step']({step:4}), {
      guardianModel: v.model,
      title: v.model === 'classic' ? 'Guardian Emblem' : 'Guardian · ' + TABLES['guardianemblem.model'][v.model]
    }),
    'gifterlevel.layout': v => ({
      type: 'templateGifterLevel', x: 100, y: 70, width: 270, title: 'Gifter Level Up',
      gifterHeadline: 'LEVEL UP', gifterLabel: 'GIFTER LEVEL', gifterLevel: 15,
      gifterName: 'ThunderGifter', gifterMessage: 'NY NIVÅ UPPLÅST', gifterLayout: v.layout,
      gifterColor: '#9965ff', gifterLight: '#e2d6ff'
    }),
    'followeralert': () => ({
      type: 'templateFollowerAlert', x: 100, y: 80, width: 300, title: 'New Follower Alert',
      followLabel: 'NEW FOLLOWER', followName: 'Aurora Vale', followMessage: 'TAKES THE STAGE',
      followColor: '#ffd35d', followDuration: 6
    }),

    'glovesnipe.pack': v => ({
      type: 'templateGloveSnipe', x: 80, y: 580, width: 760, title: v.title, boostPack: v.pack,
      battleEventKind: v.kind, gloveIcon: v.icon, gloveMultiplier: v.multiplier,
      gloveLabel: v.label, gloveName: v.name, gloveStyle: v.style, gloveColor: v.color,
      gloveColor2: v.color2, gloveDuration: 6, layer: 20, battleVideoMode: true
    }),
    // De tre premiumstilarna bar sin egen fasmaskin: 0,9 s entre, 5 s hall, 0,9 s exit. De sju
    // aldre har ingen entre alls och behaller sin 7-sekundersvisning oforandrad.
    'battlemvp.style': v => ({
      type: 'templateBattleMvp', x: 100, y: 90,
      width: PREMIUM_MVP_STYLES.has(v.style) ? 300 : 240, title: 'Battle MVP',
      mvpLabel: 'MVP', mvpName: 'TestAlpha', mvpScore: 1500, mvpStyle: v.style,
      // NAMNET PA, som for ramarna. Fram till 2026-09-03 stod det `false` har, och de tio
      // stilmodellerna visade darfor bara ordet MVP — aldrig vem som faktiskt vann. Skillnaden
      // mot ramarna (som star `true` sedan 195fc8a) var inte ett renderarfel utan just den har
      // raden: vardet ar UTTRYCKLIGT, sa ett andrat standardvarde i media.js hade inte gjort
      // nagon skillnad alls. Coins ar kvar avstangda — det ar en annan fraga.
      mvpShowLabel: true, mvpShowName: true, mvpShowCoins: false,
      mvpColor: v.color,
      mvpColor2: v.style === 'neon-cyber' ? '#ff3fd0' : v.style === 'diamond-elite' ? '#8d96a2' : '#ffe239',
      mvpDuration: PREMIUM_MVP_STYLES.has(v.style) ? 5 : 7
    }),
    'battlemvp.celebration': v => ({
      type: 'templateBattleMvp', x: 100, y: 90, width: 400, title: 'MVP · '+v.label,
      mvpStyle: v.style, mvpLabel: 'MVP', mvpName: 'TestAlpha', mvpScore: 1500,
      mvpShowLabel: true, mvpShowName: true, mvpShowCoins: false,
      mvpColor: v.accent, mvpColor2: '#ffffff', mvpDuration: 10
    }),
    'battlemvp.frame': v => ({
      type: 'templateBattleMvp', mvpFrame: v.frame, x: 100, y: 90, width: 300, title: 'Battle MVP',
      mvpLabel: 'MVP', mvpName: 'TestAlpha', mvpScore: 1500,
      mvpShowLabel: true, mvpShowName: true, mvpShowCoins: false,
      mvpColor: v.accent, mvpColor2: '#ffe239', mvpDuration: 7
    }),

    'likefountain': () => ({
      type: 'templateLikeFountain', x: 40, y: 100, width: 620, title: 'Like Fountain',
      fountainCount: 42, fountainSize: 22, fountainSpeed: 5, fountainHeight: 420,
      fountainColor: '#ff3c88', fountainColor2: '#b94cff'
    }),
    // Undertexten är temats egen röst. Alla teman utom Crystal Garden delar 'PUSH THE EVENT';
    // kristallträdgården växer i stället för att pushas, och namnger det själv.
    'giftcampaign.theme': v => ({
      type: 'templateGiftCampaign', x: 70, y: 110,
      width: ['gold','platinum','emerald'].includes(v.theme) ? (v.orientation === 'portrait' ? 245 : 608) : (v.orientation === 'portrait' ? 260 : 430), title: 'Gift Campaign',
      templateTitle: 'GIFT CAMPAIGN',
      campaignSubtitle: ['gold','platinum','emerald'].includes(v.theme) ? 'Hjälp oss nå kvällens mål' : v.theme === 'crystal-garden' ? 'GROW THE CRYSTAL GARDEN' : 'PUSH THE EVENT',
      ...(['gold','platinum','emerald'].includes(v.theme) ? { campaignMotion: 'lift', campaignDirection: -1, campaignSound: false, campaignVolume: 30 } : {}),
      campaignTheme: v.theme,
      campaignOrientation: v.orientation,
      accent: v.theme === 'crystal-garden' ? '#ff6ec7' : '#ff3fa4'
    }),
    // jarCount startar pa 0 och stannar dar: antalet ar LIVE-data och bor i en runtime-Map i
    // media.js, aldrig pa widgetobjektet. Skrevs det hit hamnade varje gava i den sparade
    // layouten — se docs/tech-debt.md punkt 3, skulden som inte ska aterskapas.
    'giftjar.model': v => ({
      type: 'templateGiftJar', x: 90, y: 150, width: 250, title: 'Gift Jar',
      jarModel: v.model, jarAccent: v.accent, jarLight: v.light, jarSymbol: v.symbol,
      jarCount: 0, jarCapacity: 50, jarShowCounter: false, jarAutoResetMs: 0
    })
  };

  // ---- catalog keys -----------------------------------------------------------------------------
  // 'catalog:<family>[:<variant>…]'. Each resolver turns the key's own segments into the values its
  // builder needs, reading the tables so the caller never has to.
  const RESOLVE = {
    'video': (parts, extra) => ['video', extra || {}],
    'topgift': parts => {
      if (!parts.length) return ['topgift', {}];
      if (parts[0] === 'premium') { pick('topgift.premium', parts[1], 'premiumdesign'); return ['topgift.premium', { theme: parts[1] }] }
      // `topgift.theme` och `topgift.extra` pensionerades 2026-09-23. De var DUBBLETTER: uppmatt
      // gav `catalog:topgift:royal` och `catalog:topgift:premium:royal` exakt samma `theme`, alltsa
      // samma skinn `topgift-royal`. Det enda som skilde var forvald bredd, rubriktext och
      // accentfarg. Katalogen visade samma design tva ganger, och David bad om farre.
      //
      // En gammal nyckel far darfor peka pa sin TVILLING i premiumtabellen. Det bryter inte mot
      // regeln ovan — "never quietly resolve to another design" — eftersom det inte ar en annan
      // design: det ar samma skinn med andra forvalda matt. Ett namn utan tvilling (coronation var
      // det enda) kastar med en lasbar lista, precis som forut.
      pick('topgift.premium', parts[0], 'premiumdesign');
      return ['topgift.premium', { theme: parts[0] }];
    },
    'topstreak': parts => {
      if (!parts.length) return ['topstreak', {}];
      if (parts[0] === 'frame') return ['topstreak.frame', { frame: parts[1], accent: pick('topstreak.frame', parts[1], 'streakram').accent }];
      if (parts[0] === 'premium') return ['topstreak.premium', { theme: parts[1], accent: pick('topstreak.premium', parts[1], 'premiumdesign') }];
      return ['topstreak.theme', { theme: parts[0], accent: pick('topstreak.theme', parts[0], 'streaktema'), width: table('topstreak.width')[parts[0]] || 310 }];
    },
    'toplike': parts => {
      if (!parts[0]) throw new Error('catalog:toplike kräver ett tema');
      return ['toplike.theme', { theme: parts[0] }];
    },
    'ranking': parts => {
      const kind = pick('ranking.kind', parts[0], 'rankingtyp');
      if (!parts[1]) throw new Error('catalog:ranking kräver ett tema');
      return ['ranking.theme', { type: parts[0], theme: parts[1], label: kind.label, title: kind.title }];
    },
    'heartgoal': parts => ['heartgoal.theme', { theme: parts[0], color: pick('heartgoal.theme', parts[0], 'hjärttema')[0] }],
    'socialgoal': parts => {
      // goalKind() throws on anything else, and normalises the legacy alias so both spellings
      // resolve to one canonical key — the third return value below.
      const kind = goalKind(parts[0]), rawModel = parts[1], frameModels = new Set(['pulse-rail','pulse-tower','prism-core','prism-spine','signal-ribbon','heart-column','crown-orbit','crown-rail','crown-tower','heart-orbit','heart-rail','heart-tower','diamond-orbit','diamond-rail','diamond-tower']), model = frameModels.has(rawModel) ? rawModel : Number(rawModel), orientation = parts[2];
      if (!(frameModels.has(rawModel) || Number.isFinite(model))) throw new Error('catalog:socialgoal kräver en giltig modell');
      if (!['portrait','landscape','circle'].includes(orientation)) throw new Error('Okänd orientering "' + orientation + '" — giltiga: portrait, landscape, circle');
      return ['socialgoal.kind', { kind, model, orientation }, 'catalog:socialgoal:' + kind + ':' + model + ':' + orientation];
    },
    'fanlevel': parts => {
      if (parts[0] === 'layout') {
        if (!parts[1]) throw new Error('catalog:fanlevel:layout kräver en modell');
        pick('fanlevel.layout', parts[1], 'fan level-modell');
        return ['fanlevel.layout', { layout: parts[1] }];
      }
      const c = pick('fanlevel.theme', parts[0], 'fan level-tema');
      return ['fanlevel.theme', { theme: parts[0], color: c[0], light: c[1] }];
    },
    'guardianemblem': parts => {
      if (parts[0] === 'model') {
        pick('guardianemblem.model', parts[1], 'Guardian-modell');
        return ['guardianemblem.model', { model: parts[1] }];
      }
      if (!parts[0]) throw new Error('catalog:guardianemblem kraver ett praktsteg');
      pick('guardianemblem.step', parts[0], 'Guardian-praktsteg');
      return ['guardianemblem.step', { step: parts[0] }];
    },
    'gifterlevel': parts => {
      if (!parts[0]) throw new Error('catalog:gifterlevel kräver en layout');
      return ['gifterlevel.layout', { layout: parts[0] }];
    },
    'followeralert': () => ['followeralert', {}],
    'glovesnipe': parts => {
      // catalog:glovesnipe:<pack>:<kind>[:<multiplier>] — the labels, icon and name are derived from
      // kind and multiplier exactly as addBoostPack() derived them.
      const pack = parts[0], kind = parts[1] || 'boost', multiplier = Number(parts[2] || 2);
      const p = pick('glovesnipe.pack', pack, 'boostpaket');
      const d = pick('glovesnipe.detail', pack, 'boostpaket');
      const labels = { boost: multiplier === 3 ? 'TRIPLE BOOST' : 'BATTLE BOOST', glove: 'GLOVE POWER', tap: 'TAP TAP', snipe: 'SNIPE ATTACK' };
      if (!(kind in labels)) throw new Error('Okänd battle-typ "' + kind + '" — giltiga: ' + Object.keys(labels).join(', '));
      const icons = { boost: d[1], glove: '🥊', tap: '👆', snipe: '🎯' };
      return ['glovesnipe.pack', {
        title: d[0] + ' ' + labels[kind], pack, kind, icon: icons[kind], multiplier,
        label: labels[kind],
        name: kind === 'tap' ? 'KEEP TAPPING' : kind === 'snipe' ? 'FINAL SNIPE' : kind === 'glove' ? 'POWER GLOVE' : d[2],
        style: p[3], color: p[1], color2: p[2]
      }];
    },
    'battlemvp': parts => {
      if (parts[0] === 'celebration') return ['battlemvp.celebration', {style:parts[1], ...pick('battlemvp.celebration', parts[1], 'MVP-firande')}];
      if (parts[0] === 'frame') return ['battlemvp.frame', { frame: parts[1], accent: pick('battlemvp.frame', parts[1], 'MVP-ram').accent }];
      return ['battlemvp.style', { style: parts[0], color: pick('battlemvp.style', parts[0], 'MVP-stil') }];
    },
    'likefountain': () => ['likefountain', {}],
    'lastx': parts => {
      pick('lastx.design', parts[0], 'Last-X-design');
      return ['lastx.design', { design: parts[0] }];
    },
    'custom': parts => ['custom.kind', { kind: parts[0], type: pick('custom.kind', parts[0], 'innehållstyp') }],
    'giftfireworks': parts => {
      if (Object.hasOwn(TABLES['giftfireworks.theme'], parts[0]))
        return ['giftfireworks.theme', {theme:parts[0], ...pick('giftfireworks.theme', parts[0], 'fyrverkeridesign')}];
      pick('giftfireworks.motion', parts[0], 'fyrverkerirörelse');
      return ['giftfireworks.motion', { motion: parts[0] }];
    },
    'giftcampaign': parts => {
      const orientation = parts[1];
      if (!parts[0]) throw new Error('catalog:giftcampaign kräver ett tema');
      if (orientation !== 'portrait' && orientation !== 'landscape') throw new Error('Okänd orientering "' + orientation + '" — giltiga: portrait, landscape');
      return ['giftcampaign.theme', { theme: parts[0], orientation }];
    },
    'giftjar': parts => {
      if (!parts[0]) throw new Error('catalog:giftjar kräver en modell');
      const model = pick('giftjar.model', parts[0], 'gift jar-modell');
      return ['giftjar.model', { model: parts[0], accent: model.accent, light: model.light, symbol: model.symbol }];
    }
  };


  // A resolver may return a third value: the canonical form of the key it was given. Legacy
  // aliases resolve to the same one, so createdFrom identifies the variant rather than the spelling.
  function resolve(catalogKey, extra) {
    const segments = String(catalogKey || '').split(':');
    if (segments.shift() !== 'catalog') throw new Error('Katalognyckel måste börja med "catalog:": ' + catalogKey);
    const family = segments.shift();
    const resolver = RESOLVE[family];
    if (!resolver) throw new Error('Okänd katalogfamilj: ' + family);
    return resolver(segments, extra);
  }

  // `placement` decides which link a widget answers to. A widget without the field is a layout
  // widget — every layout saved before this existed has to keep working, so absence means layout and
  // never the other way round.
  function create(catalogKey, options) {
    const opts = options || {};
    const [builderName, values, canonicalKey] = resolve(catalogKey, opts.values);
    const build = BUILD[builderName];
    if (!build) throw new Error('Okänd widgetvariant: ' + builderName);
    const defaults = build(values);
    if (!defaults.type) throw new Error('Katalogvarianten gav ingen widgettyp: ' + catalogKey);
    // id first so a caller cannot shadow it; createdFrom and placement last so they are never
    // mistaken for part of the shipped default configuration.
    const widget = Object.assign({ id: newId(defaults.type) }, defaults, { createdFrom: canonicalKey || catalogKey });
    if (opts.placement === 'standalone') widget.placement = 'standalone';
    return widget;
  }

  const isStandalone = w => !!w && w.placement === 'standalone';
  const isLayout = w => !isStandalone(w);          // missing placement means layout

  // ---- what gets rendered -----------------------------------------------------------------------
  // One decision, used by the canvas, the layer list and the overlay alike. Standalone instances
  // exist in the same state.widgets array as everything else, so without this they would be drawn
  // into the Layout the streamer is editing. They are filtered out of the list before it is mapped
  // to markup rather than hidden afterwards: a hidden widget is still built, still animated, and
  // still in the DOM for anything that queries it.
  //
  // `hidden` stays a separate concept. It is the streamer's own eye toggle on a layout widget, and a
  // standalone instance the streamer has hidden must still open on its own link.
  function selectForRender(widgets, options) {
    const list = Array.isArray(widgets) ? widgets : [];
    const wanted = options && options.widgetId ? String(options.widgetId) : '';
    if (wanted) {
      // Exact string identity, never a pattern: the id comes from a URL and must not be able to
      // reach a selector or any markup.
      const match = list.filter(w => w && String(w.id) === wanted);
      return match.length ? { widgets: match, error: null } : { widgets: [], error: 'missing-widget' };
    }
    return { widgets: list.filter(isLayout), error: null };
  }

  // The layer list is the Layout's own inspector — a standalone instance has no place on the stage.
  const layoutOnly = widgets => (Array.isArray(widgets) ? widgets : []).filter(isLayout);

  root.VyraWidgets = {
    create, newId, isStandalone, isLayout, selectForRender, layoutOnly, goalKind,
    families: () => Object.keys(RESOLVE),
    builders: () => Object.keys(BUILD),
    // A copy, so adding or replacing a key touches the caller's object and not the registry.
    variants: name => Object.assign({}, table(name))
  };

  if (typeof module === 'object' && module.exports) module.exports = root.VyraWidgets;
})(typeof window !== 'undefined' ? window : globalThis);
