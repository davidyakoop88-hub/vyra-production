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
  const TABLES = {
    // Short colour tables, verbatim from the catalog they came from.
    'topgift.theme': { royal: '#ff9d28', neon: '#d946ef', cyber: '#22d3ee', glass: '#d8e6ff' },
    // Premiumdesignerna ar en EGEN familj, inte fler rader i topgift.theme ovan: de delar bara
    // namn, inte defaults - premium ar 340 px bred mot temats 280, och bar giftSize och glow.
    // Accenten ar densamma for alla 21; tabellen bar etiketten sa den sager nagot mer an att
    // namnet finns.
    'topgift.premium': { royal: 'Royal Gold', neon: 'Neon Purple', cyber: 'Cyber Blue',
      glass: 'Glass', sakura: 'Sakura Pink', fire: 'Inferno Fire', ice: 'Ice Crystal',
      galaxy: 'Galaxy', aurora: 'Aurora', retro: 'Retro', goldrush: 'Gold Rush',
      hall: 'VYRA Hall of Fame', throne: 'Royal Throne', champion: 'Celestial Champion',
      pedestal: 'Diamond Pedestal', arch: 'Celestial Arch', phoenix: 'Phoenix',
      signal: 'Signal', fireworks: 'Fireworks', bloom: 'Bloom', comet: 'Comet' },
    'topgift.extra': {"sakura":"#ff69b4","fire":"#ff4b16","ice":"#64dfff","galaxy":"#9b5cff","aurora":"#4fd8c4","retro":"#ffcf3d","goldrush":"#e8b64d","coronation":"#e8c25a"},
    'topstreak.theme': {"inferno":"#ff671f","neon":"#cf45ff","ice":"#65ddff","royal":"#ffc13b","sakura-rail":"#ff8fc7","cyber-grid":"#3ddcff","storm":"#8fa6ff"},
    // Samma skal som topgift.premium: eget bord, egna defaults. Har bar tabellen accentfargen,
    // som skiljer sig per design.
    'topstreak.premium': { liquid: '#d9a441', momentum: '#d8dee9', tier: '#c68cff',
      thread: '#e7bc63', chrono: '#9db7d0', chain: '#d2d5da', thermo: '#ff8a36' },
    'topstreak.width': {neon:235,'sakura-rail':235,'cyber-grid':330,storm:310},
    'ranking.kind': {templateTopCoins:{title:'TOP COINS',icon:'●',label:'Top Coins'},templateTopPoints:{title:'TOP POINTS',icon:'◆',label:'Top Points'}},
    'heartgoal.theme': {classic:['#ff447d','#ffffff'],dark:['#b331ff','#e9d8ff'],emerald:['#37ed8a','#d8ffe9'],galaxy:['#a764ff','#efddff'],golden:['#ffbd2e','#fff1bb'],ice:['#42d8ff','#dff9ff'],neon:['#ff3bc8','#ffffff'],ocean:['#2caeff','#d8f2ff'],sakura:['#ff78b7','#fff0f7'],frost:['#8fd4ff','#eaf8ff'],midnight:['#5b6bff','#dde1ff'],citrus:['#ffb020','#fff4dd']},
    'fanlevel.theme': {gold:['#ff8a20','#ffd36b'],neon:['#ff3ac8','#a74cff'],ice:['#29cfff','#b9f5ff'],emerald:['#35e783','#baffd4'],fire:['#ff3c24','#ffb52d'],sakura:['#ff6fa8','#ffd9e8'],storm:['#6d7bff','#d6dbff'],royal:['#c79bff','#f0e2ff']},
    'battlemvp.style': {inferno:'#ff8b16',royal:'#ff8b16',ice:'#52d9ff',cyber:'#cb46ff',storm:'#6d7bff',aurora:'#4fd8c4',samurai:'#ff3355'},
    'glovesnipe.pack': {koiPearl:['Tjej','#3ecdd6','#e8c37a','ice','koi'],masquerade:['Tjej','#7a1128','#d4af37','fire','masquerade']},
    'glovesnipe.detail': {koiPearl:['Koi Pearl Lagoon','🐟','KOI STRIKE'],masquerade:['Masquerade Ball','🎭','MASKED STRIKE']},
    // The frame tables. media.js reads these back through VyraWidgets.variants() for rendering —
    // they are geometry as much as colour, and one copy is the whole point.
    'topgift.frame': {'royal-wings':{label:'Royal Wings',accent:'#ffc13b',aspect:0.8327,circle:{left:33.51,top:42.86,width:33.46,height:29.0},titlePlate:{left:27.14,top:25.56,width:45.97,height:12.19},namePlate:{left:34.22,top:76.81,width:31.32,height:12.7}},'crystal-spire':{label:'Crystal Spire',accent:'#b083ff',aspect:0.5888,circle:{left:28.19,top:45.95,width:44.29,height:26.27},titlePlate:{left:19.42,top:28.85,width:61.51,height:11.57},namePlate:{left:28.22,top:77.2,width:43.57,height:12.07}},'angel-heart':{label:'Angel Heart',accent:'#ff8fc8',aspect:0.6766,circle:{left:31.86,top:47.71,width:36.88,height:25.14},titlePlate:{left:25.14,top:32.91,width:50.3,height:10.23},namePlate:{left:31.76,top:80.57,width:36.18,height:9.72},darkTitle:true,darkName:true},'dark-raven':{label:'Dark Raven',accent:'#9b5cff',aspect:0.6267,circle:{left:28.49,top:43.99,width:44.61,height:27.58},titlePlate:{left:19.26,top:27.05,width:61.8,height:11.57},namePlate:{left:28.36,top:77.98,width:43.61,height:11.9}},'frost-crystal':{label:'Frost Crystal',accent:'#6db8ff',aspect:0.6907,circle:{left:30.8,top:40.27,width:39.0,height:27.72},titlePlate:{left:26.33,top:23.6,width:47.64,height:11.78},namePlate:{left:30.82,top:76.45,width:38.36,height:10.39}},'rose-garden':{label:'Rose Garden',accent:'#ff8fc8',aspect:0.695,circle:{left:32.27,top:39.47,width:38.44,height:27.5},titlePlate:{left:27.07,top:24.49,width:49.15,height:10.98},namePlate:{left:31.94,top:75.43,width:37.61,height:9.93},darkTitle:true,darkName:true},'luna-mist':{label:'Luna Mist',accent:'#c07bff',aspect:0.6695,circle:{left:27.45,top:39.52,width:41.91,height:29.06},titlePlate:{left:20.34,top:22.64,width:56.45,height:11.64},namePlate:{left:27.81,top:73.77,width:41.2,height:13.43}}},
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
  const GOAL_KINDS = { follows: 'follows', followers: 'follows', likes: 'likes' };
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
    'topgift.theme': v => ({
      type: 'templateTopGift', theme: v.theme, x: 70, y: 180, width: 280, title: 'VYRA Top Gift',
      templateTitle: 'TOP GIFT', value: '', dataName: '@StreamQueen', dataValue: '44 999',
      accent: v.accent, dataColor: '#ffffff', valueColor: v.accent, dataSize: 18, showDataValue: true
    }),
    'topgift.extra': v => ({
      type: 'templateTopGift', theme: v.theme, x: 70, y: 180,
      width: v.theme === 'coronation' ? 260 : 280, title: 'VYRA Top Gift',
      templateTitle: v.theme === 'coronation' ? 'TOP GIFTER' : 'TOP GIFT',
      dataName: '@StreamQueen', dataValue: v.theme === 'coronation' ? '12 500' : '44 999',
      giftName: 'ROSE', giftCount: 250, giftSize: v.theme === 'coronation' ? 90 : 62,
      accent: v.accent, dataColor: '#fff', valueColor: v.accent, dataSize: 18, showDataValue: true
    }),
    'topgift.frame': v => ({
      type: 'templateTopGift', giftFrame: v.frame, x: 70, y: 150, width: 300,
      title: 'VYRA Top Gift', templateTitle: 'TOP GIFTER', dataName: '@StreamQueen',
      dataValue: '44 999', accent: v.accent, dataColor: '#fff', valueColor: v.accent,
      dataSize: 15, showDataValue: true
    }),

    'topstreak': () => ({
      type: 'templateTopStreak', x: 65, y: 220, width: 310, title: 'Top Streak',
      templateTitle: 'TOP STREAK', dataName: '@StreamQueen', dataValue: 18, accent: '#ff671f',
      dataColor: '#fff'
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

    'toplike.theme': v => ({
      type: 'templateTopLike', x: 70, y: 100, width: 220, title: 'Top Likes',
      templateTitle: 'TOP LIKES', likeCount: 5, likeTheme: v.theme, likePosition: 'left',
      accent: '#ff4da6'
    }),
    'ranking.theme': v => ({
      type: v.type, x: 80, y: 110, width: 300, title: v.label, templateTitle: v.title,
      likeCount: 5, likeTheme: v.theme,
      accent: v.type === 'templateTopCoins' ? '#ffbd32' : '#9b5cff', profileFrame: 'none'
    }),

    'heartgoal.theme': v => ({
      type: 'templateHeartGoal', x: 80, y: 120, width: 310, title: 'Heart Me Goal',
      templateTitle: 'HEART ME GOAL', heartCurrent: 0, heartTarget: 50, heartTheme: v.theme,
      heartColor: v.color, heartTextColor: '#ffffff', heartNumberColor: v.color
    }),
    'socialgoal.kind': v => ({
      type: 'templateSocialGoal', goalKind: v.kind, x: 70, y: 120,
      width: v.orientation === 'portrait' ? 220 : 440,
      title: v.kind === 'likes' ? 'Like Goal' : 'Follower Goal',
      goalTitle: v.kind === 'likes' ? 'LIKE GOAL' : 'FOLLOWERS GOAL',
      goalCurrent: 0, goalTarget: 1000, goalModel: v.model, goalOrientation: v.orientation,
      goalColor: v.kind === 'likes' ? '#ff3f8f' : '#24d8df', goalColor2: '#b84ee8'
    }),

    'fanlevel.theme': v => ({
      type: 'templateFanLevel', x: 100, y: 80, width: 260, title: 'Fan Level Up',
      fanHeadline: 'LEVEL UP', fanLevelLabel: 'FAN LEVEL', fanLevel: 12, fanName: 'HeartRiser',
      fanMessage: 'Fan level up!', fanTheme: v.theme, fanColor: v.color, fanLight: v.light
    }),
    'gifterlevel.layout': v => ({
      type: 'templateGifterLevel', x: 100, y: 70, width: 270, title: 'Gifter Level Up',
      gifterHeadline: 'LEVEL UP', gifterLabel: 'GIFTER LEVEL', gifterLevel: 15,
      gifterName: 'ThunderGifter', gifterMessage: 'Level up!', gifterLayout: v.layout,
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
    'battlemvp.style': v => ({
      type: 'templateBattleMvp', x: 100, y: 90, width: 240, title: 'Battle MVP',
      mvpLabel: 'BATTLE MVP', mvpName: 'TestAlpha', mvpScore: 1500, mvpStyle: v.style,
      mvpColor: v.color, mvpColor2: '#ffe239', mvpDuration: 7
    }),
    'battlemvp.frame': v => ({
      type: 'templateBattleMvp', mvpFrame: v.frame, x: 100, y: 90, width: 300, title: 'Battle MVP',
      mvpLabel: 'BATTLE MVP', mvpName: 'TestAlpha', mvpScore: 1500, mvpShowCoins: false,
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
      width: v.orientation === 'portrait' ? 260 : 430, title: 'Gift Campaign',
      templateTitle: 'GIFT CAMPAIGN',
      campaignSubtitle: v.theme === 'crystal-garden' ? 'GROW THE CRYSTAL GARDEN' : 'PUSH THE EVENT',
      campaignTheme: v.theme,
      campaignOrientation: v.orientation,
      accent: v.theme === 'crystal-garden' ? '#ff6ec7' : '#ff3fa4'
    })
  };

  // ---- catalog keys -----------------------------------------------------------------------------
  // 'catalog:<family>[:<variant>…]'. Each resolver turns the key's own segments into the values its
  // builder needs, reading the tables so the caller never has to.
  const RESOLVE = {
    'video': (parts, extra) => ['video', extra || {}],
    'topgift': parts => {
      if (!parts.length) return ['topgift', {}];
      if (parts[0] === 'frame') return ['topgift.frame', { frame: parts[1], accent: pick('topgift.frame', parts[1], 'gåvoram').accent }];
      if (parts[0] === 'extra') return ['topgift.extra', { theme: parts[1], accent: pick('topgift.extra', parts[1], 'extratema') }];
      if (parts[0] === 'premium') { pick('topgift.premium', parts[1], 'premiumdesign'); return ['topgift.premium', { theme: parts[1] }] }
      return ['topgift.theme', { theme: parts[0], accent: pick('topgift.theme', parts[0], 'tema') }];
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
      const kind = goalKind(parts[0]), model = Number(parts[1]), orientation = parts[2];
      if (!Number.isFinite(model)) throw new Error('catalog:socialgoal kräver en modell som siffra');
      if (orientation !== 'portrait' && orientation !== 'landscape') throw new Error('Okänd orientering "' + orientation + '" — giltiga: portrait, landscape');
      return ['socialgoal.kind', { kind, model, orientation }, 'catalog:socialgoal:' + kind + ':' + model + ':' + orientation];
    },
    'fanlevel': parts => {
      const c = pick('fanlevel.theme', parts[0], 'fan level-tema');
      return ['fanlevel.theme', { theme: parts[0], color: c[0], light: c[1] }];
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
      if (parts[0] === 'frame') return ['battlemvp.frame', { frame: parts[1], accent: pick('battlemvp.frame', parts[1], 'MVP-ram').accent }];
      return ['battlemvp.style', { style: parts[0], color: pick('battlemvp.style', parts[0], 'MVP-stil') }];
    },
    'likefountain': () => ['likefountain', {}],
    'giftcampaign': parts => {
      const orientation = parts[1];
      if (!parts[0]) throw new Error('catalog:giftcampaign kräver ett tema');
      if (orientation !== 'portrait' && orientation !== 'landscape') throw new Error('Okänd orientering "' + orientation + '" — giltiga: portrait, landscape');
      return ['giftcampaign.theme', { theme: parts[0], orientation }];
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
