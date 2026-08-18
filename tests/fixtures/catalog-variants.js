'use strict';
// The variant values the twenty catalog buttons had in scope, and the catalog key each one maps to.
// Checked in on purpose: the permanent suite must run in a shallow checkout with no other branch
// refs, so it cannot reach into git history for them. tests/widget-defaults-migration.test.js is the
// separate, skippable proof that these are the values the old inline literals actually used.
//
// The values here are the real ones from the tables that now live in widget-factory.js — a fixture
// with invented colours would prove nothing.
const CONTRACT = [
  // De tre familjer vars literaler ALDRIG lag i media.js — de byggdes i last-x-alerts.js,
  // custom-widgets.js och gift-fireworks.js. De har darfor ingen `marker`: baseline-beviset i
  // widget-defaults-migration.test.js galler media.js och hoppar over dem. Att fabriken ger exakt
  // det knapparna byggde bevisas i stallet falt for falt i tests/factory-last-eleven.test.js.
  { name: 'Last-X · design card', key: 'catalog:lastx:card' },
  { name: 'Eget innehåll · text', key: 'catalog:custom:text' },
  { name: 'Gift Fireworks · magnetic', key: 'catalog:giftfireworks:magnetic' },
  // Guardian Welcome ar en NY familj, inte en migrerad — den har aldrig funnits som en literal i
  // media.js. Alla tre storlekarna star med, for det ar matten som skiljer dem at och ett kontrakt
  // pa bara en storlek hade latit de andra tva glida.
  { name: 'Guardian Welcome · banner', key: 'catalog:guardianwelcome:banner' },
  { name: 'Guardian Welcome · kort', key: 'catalog:guardianwelcome:kort' },
  { name: 'Guardian Welcome · full', key: 'catalog:guardianwelcome:full' },
  { name: 'Media · video', key: 'catalog:video', marker: "type:'video'",
    values: { title: 'Aurora', value: 'aurora.mp4', src: 'assets/videos/aurora.mp4' },
    bindings: { f: 'aurora.mp4', mediaTitle: () => 'Aurora', normalizeMediaFile: () => 'aurora.mp4', mediaAssetPath: () => 'assets/videos/aurora.mp4' } },

  { name: 'Top Gift · standard', key: 'catalog:topgift',
    marker: "type:'templateTopGift',x:70,y:180,width:280", bindings: { id: 'x' } },
  { name: 'Top Gift · tema neon', key: 'catalog:topgift:neon',
    marker: "type:'templateTopGift',theme,x:70,y:180,width:280",
    bindings: { id: 'x', theme: 'neon', colors: { royal: '#ff9d28', neon: '#d946ef', cyber: '#22d3ee', glass: '#d8e6ff' } } },
  { name: 'Top Gift · extratema coronation', key: 'catalog:topgift:extra:coronation',
    marker: "giftName:'ROSE',giftCount:250",
    bindings: { id: 'x', theme: 'coronation', color: '#e8c25a' } },
  { name: 'Top Gift · extratema sakura', key: 'catalog:topgift:extra:sakura',
    marker: "giftName:'ROSE',giftCount:250",
    bindings: { id: 'x', theme: 'sakura', color: '#ff69b4' } },
  { name: 'Top Gift · ram', key: 'catalog:topgift:frame:royal-wings',
    marker: "type:'templateTopGift',giftFrame:fid",
    bindings: { id: 'x', fid: 'royal-wings', f: { accent: '#ffc13b' } } },

  { name: 'Top Streak · standard', key: 'catalog:topstreak',
    marker: "type:'templateTopStreak',x:65,y:220,width:310", bindings: { id: 'x' } },
  { name: 'Top Streak · tema med egen bredd', key: 'catalog:topstreak:neon',
    marker: "type:'templateTopStreak',streakTheme:theme",
    bindings: { id: 'x', theme: 'neon', color: '#cf45ff', widths: { neon: 235, 'sakura-rail': 235, 'cyber-grid': 330, storm: 310 } } },
  { name: 'Top Streak · tema utan egen bredd', key: 'catalog:topstreak:inferno',
    marker: "type:'templateTopStreak',streakTheme:theme",
    bindings: { id: 'x', theme: 'inferno', color: '#ff671f', widths: { neon: 235, 'sakura-rail': 235, 'cyber-grid': 330, storm: 310 } } },
  { name: 'Top Streak · ram', key: 'catalog:topstreak:frame:amethyst-heart',
    marker: "type:'templateTopStreak',streakFrame:fid",
    bindings: { id: 'x', fid: 'amethyst-heart', f: { accent: '#c07bff' } } },

  { name: 'Top Like · tema', key: 'catalog:toplike:clean',
    marker: "type:'templateTopLike'", bindings: { id: 'x', theme: 'clean' } },
  { name: 'Ranking · Top Coins', key: 'catalog:ranking:templateTopCoins:gold',
    marker: "likeCount:5,likeTheme:theme,accent:type==='templateTopCoins'",
    bindings: { id: 'x', type: 'templateTopCoins', theme: 'gold', kind: { title: 'TOP COINS', icon: '●', label: 'Top Coins' } } },
  { name: 'Ranking · Top Points', key: 'catalog:ranking:templateTopPoints:violet',
    marker: "likeCount:5,likeTheme:theme,accent:type==='templateTopCoins'",
    bindings: { id: 'x', type: 'templateTopPoints', theme: 'violet', kind: { title: 'TOP POINTS', icon: '◆', label: 'Top Points' } } },

  { name: 'Heart Me Goal · tema', key: 'catalog:heartgoal:neon',
    marker: "type:'templateHeartGoal'", bindings: { id: 'x', t: 'neon', c: ['#ff3bc8', '#ffffff'] } },
  { name: 'Social Goal · likes/portrait', key: 'catalog:socialgoal:likes:2:portrait',
    marker: "type:'templateSocialGoal'", bindings: { id: 'x', kind: 'likes', model: 2, orient: 'portrait' } },
  { name: 'Social Goal · follows/landscape', key: 'catalog:socialgoal:follows:1:landscape',
    marker: "type:'templateSocialGoal'", bindings: { id: 'x', kind: 'follows', model: 1, orient: 'landscape' } },

  { name: 'Fan Level Up · tema', key: 'catalog:fanlevel:gold',
    marker: "type:'templateFanLevel'", bindings: { id: 'x', t: 'gold', c: ['#ff8a20', '#ffd36b'] } },
  { name: 'Gifter Level Up · layout', key: 'catalog:gifterlevel:profile',
    marker: "type:'templateGifterLevel'", bindings: { id: 'x', layout: 'profile' } },
  { name: 'New Follower Alert', key: 'catalog:followeralert',
    marker: "type:'templateFollowerAlert'", bindings: { id: 'x' } },

  { name: 'Glove Snipe · tap', key: 'catalog:glovesnipe:koiPearl:tap:2',
    marker: "type:'templateGloveSnipe'",
    bindings: {
      widgetId: 'x', id: 'koiPearl', kind: 'tap', multiplier: 2,
      d: ['Koi Pearl Lagoon', '🐟', 'KOI STRIKE'],
      labels: { boost: 'BATTLE BOOST', glove: 'GLOVE POWER', tap: 'TAP TAP', snipe: 'SNIPE ATTACK' },
      icons: { boost: '🐟', glove: '🥊', tap: '👆', snipe: '🎯' },
      p: ['Tjej', '#3ecdd6', '#e8c37a', 'ice', 'koi']
    } },
  { name: 'Glove Snipe · triple boost', key: 'catalog:glovesnipe:koiPearl:boost:3',
    marker: "type:'templateGloveSnipe'",
    bindings: {
      widgetId: 'x', id: 'koiPearl', kind: 'boost', multiplier: 3,
      d: ['Koi Pearl Lagoon', '🐟', 'KOI STRIKE'],
      labels: { boost: 'TRIPLE BOOST', glove: 'GLOVE POWER', tap: 'TAP TAP', snipe: 'SNIPE ATTACK' },
      icons: { boost: '🐟', glove: '🥊', tap: '👆', snipe: '🎯' },
      p: ['Tjej', '#3ecdd6', '#e8c37a', 'ice', 'koi']
    } },
  { name: 'Battle MVP · stil', key: 'catalog:battlemvp:ice',
    marker: "type:'templateBattleMvp',x:100,y:90,width:240",
    bindings: { id: 'x', b: { dataset: { mvpStyle: 'ice' } }, mvpColors: { ice: '#52d9ff' } } },
  // inferno and royal are the two styles the catalog offered that mvpColors never had an entry for,
  // so the old literal fell through to its `||'#ff8b16'` fallback. The real five-entry legacy table is
  // passed in on purpose: the miss has to be genuine, not staged by handing the literal an empty
  // object. This is what pins #ff8b16 as captured behaviour rather than a colour anyone chose.
  { name: 'Battle MVP · stil inferno (legacyfallback)', key: 'catalog:battlemvp:inferno',
    marker: "type:'templateBattleMvp',x:100,y:90,width:240",
    bindings: { id: 'x', b: { dataset: { mvpStyle: 'inferno' } },
      mvpColors: { ice: '#52d9ff', cyber: '#cb46ff', storm: '#6d7bff', aurora: '#4fd8c4', samurai: '#ff3355' } } },
  { name: 'Battle MVP · stil royal (legacyfallback)', key: 'catalog:battlemvp:royal',
    marker: "type:'templateBattleMvp',x:100,y:90,width:240",
    bindings: { id: 'x', b: { dataset: { mvpStyle: 'royal' } },
      mvpColors: { ice: '#52d9ff', cyber: '#cb46ff', storm: '#6d7bff', aurora: '#4fd8c4', samurai: '#ff3355' } } },
  { name: 'Battle MVP · ram', key: 'catalog:battlemvp:frame:gold-crown',
    marker: "type:'templateBattleMvp',mvpFrame:fid",
    bindings: { id: 'x', fid: 'gold-crown', f: { accent: '#ffc13b' } } },

  { name: 'Like Fountain', key: 'catalog:likefountain',
    marker: "type:'templateLikeFountain'", bindings: { id: 'x' } },
  { name: 'Gift Campaign · tema/orientering', key: 'catalog:giftcampaign:neon:portrait',
    marker: "type:'templateGiftCampaign'", bindings: { id: 'x', t: 'neon', o: 'portrait', label: 'Neon Event' } },
  { name: 'Gift Jar · Crystal', key: 'catalog:giftjar:crystal',
    marker: "type:'templateGiftJar'", bindings: { id: 'x', model: 'crystal' } }
];

module.exports = { CONTRACT };
