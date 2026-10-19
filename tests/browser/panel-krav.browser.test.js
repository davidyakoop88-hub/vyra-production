'use strict';
// PANELKRAVEN FÖR MODELLER MED REGISTERPOST (panelspecifikationen 6, "Löpande").
//
// För varje modell som har en post i vyra-panelregister.js — i dag Top Gift · Design 1–3 och
// Signal Orbit (vyra-topgift-panel.js), de elva Last-X (vyra-lastx-panel.js), alertfamiljerna
// (vyra-alert-panel.js), Battle MVP (vyra-mvp-panel.js), Top Like/Coins/Points (vyra-ranking-panel.js) och
// målen: Social Goal, Heart Me och Gift Campaign (vyra-mal-panel.js) och
// Top Streak: Clean Flip och Design 1–3 (vyra-streak-panel.js), playgroundfamiljerna Top Gifter Podium, Top
// Streak Flip och Goal Pro (vyra-playground-panel.js) och fyrverkerierna Gift Fireworks, Heart Fireworks och Gift
// Bubbles (vyra-fyrverkeri-panel.js) och fontänerna och gåvoburken: Like Fountain klassisk och Portal och Gift Jar
// (vyra-fontan-panel.js) och Fan Level 50 och Glove Snipe (vyra-fl50-panel.js, vyra-glove-panel.js) — kräver provet
// att panelen
//   * har sektionerna i ordningen 1–7, med ▶ Testa widget först,
//   * inte har någon tom sektion,
//   * inte har någon etikett två gånger,
//   * inte visar någon text som matchar /assets\/|\.png|\.svg|URL/ (inte heller i fältvärden),
//   * har en enhet på varje tal: ett reglage har enheten i <b> efter värdet, ett talfält i etiketten
//     ("X (px)"); rena antal (Lager, Coins) är undantagna,
//   * bara visar kontroller som GÖR något. Mätmetoden är granskningens (scratchpad
//     wf-panel/topgrupp/granska.js): widgeten återställs, värdet sätts med input, change och blur,
//     och widgetens outerHTML, beräknade stil (upp till 600 noder, 30 egenskaper), text och bilder
//     jämförs före och efter. Animationerna tvingas till slutläget och brus (två vilobilder 900 ms
//     isär) räknas bort. Beroende kontroller mäts med förutsättningen satt (Skuggfärg med Skugga 10,
//     Konturfärg med Kontur 3). Mediaväljaren mäts genom sitt fält: ett annat giltigt värde ska synas.
//     Återställ utseende mäts för sig: den ska återställa utseendet och lämna innehåll och placering.
const test = require('node:test'), assert = require('node:assert/strict');
const path = require('path'), http = require('http'), fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const { startaWebblasare, hoppaOver } = require('../helpers/webblasare.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

function servera() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const fil = path.join(ROOT, rel);
    if (!fil.startsWith(ROOT) || !fs.existsSync(fil) || fs.statSync(fil).isDirectory()) {
      res.writeHead(404); res.end('nej'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(fil)] || 'application/octet-stream' });
    fs.createReadStream(fil).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

// Återställ utseende provas med ett utseendefält, ett innehållsfält och placeringen.
const TOPGIFT_ATERSTALL = { utseende: 'accent', innehall: 'dataName' };
// LAST-X (vyra-lastx-panel.js, PR 5). Widgeten visar bara sin FÖRSTA typ i vila; vad en kontroll för
// en annan typ gör syns först när en händelse av den typen kommer. Sådana kontroller mäts därför
// med en händelse: samma händelse spelas före och efter ändringen (triggerLastXAlert, livevägen),
// och widgeten jämförs. Visningstiden ändrar bara hur länge kortet ligger kvar — inget som syns i
// en ögonblicksbild — och provas i stället av lastx-livevag.browser.test.js.
const LASTX_TYPER = /_(gifter|liker|sharer|subscriber|follower)$/;
const LASTX = {
  aterstall: { utseende: 'followColor', innehall: 'followName' },
  handelse: c => (LASTX_TYPER.exec(c.id) || [])[1] || (c.id === 'lastXPersistent' ? 'gifter' : null),
  tidsstyrt: { followDuration: 'visningstiden mäts i lastx-livevag.browser.test.js' },
};
// Panelkraven gäller alla elva Last-X-modellerna. Effekten per kontroll (den långsamma delen)
// mäts för en modell ur varje grupp: plattorna (card), royal och banderollerna (crownBanner) har
// olika registerposter; modellerna inom en grupp delar post.
const LASTX_MODELLER = ['card', 'stack', 'skew', 'badge', 'royal', 'crownBanner', 'royalAmethyst', 'iceKing', 'neonCyber', 'dragonFlame', 'angelGold']
  .map(d => Object.assign({ namn: 'Last-X · ' + d, nyckel: 'catalog:lastx:' + d, effekt: ['card', 'royal', 'crownBanner'].includes(d) }, LASTX));
// ALERTFAMILJERNA (vyra-alert-panel.js, PR 6): Fan Level Up (8), Gifter Level Up (9), Follower
// Spotlight (3) och Guardian Emblem (6). Panelkraven gäller alla 26. Effekten per kontroll mäts för
// modellerna där panelen skiljer sig: en vanlig, en där profilbilden är dold (Rising Hearts), Welcome
// Ribbon (bandet i stället för nivåpillen) och en med låst bredd i Fan; en vanlig, Stort nivånummer
// (profilramen saknas), Orbitnivå (Ljus färg saknas) och en med låst bredd i Gifter; ett tema i
// Follower; Guld och Blå kristall i Guardian.
//
// TIDSSTYRT är det som bara verkar när en händelse spelas: när den visas (team, automatik, minsta
// nivå), hur länge (Visningstid) och video per nivå. De provas i alert-livevag.browser.test.js; här
// kräver provet att de verkligen inte syns i en ögonblicksbild.
const NIVA_TIDSSTYRT = prefix => ({
  [prefix + 'AutoTrigger']: 'automatiken provas i alert-livevag.browser.test.js',
  [prefix + 'MinLevel']: 'minsta nivån provas i alert-livevag.browser.test.js',
  [prefix + 'Duration']: 'visningstiden provas i alert-livevag.browser.test.js',
  [prefix + 'LevelVideoMode']: 'videon spelas bara vid en händelse',
  'pr-nivavideo-niva': 'nivån för nästa video — ingenting ändras förrän en video väljs',
  ...(prefix === 'fan' ? { fanTeamOnly: 'grinden för teammedlemmar provas i alert-livevag.browser.test.js' } : {}),
});
const ALERT = (namn, nyckel, effekt, aterstall, extra) => Object.assign({ namn, nyckel, effekt, aterstall,
  mediaTidsstyrt: { levelVideoNy: 'videon spelas bara vid en händelse på nivån' } }, extra || {});
const FAN_EFFEKT = ['hero', 'heartbeat', 'hearts', 'ribbon'], GIFTER_EFFEKT = ['profile', 'number', 'orbitlevel', 'sidebadge'];
const ALERT_MODELLER = [
  ...['hero', 'stack', 'heartbeat', 'badgereveal', 'loyalty', 'hearts', 'ribbon', 'duo'].map(l => ALERT('Fan Level Up · ' + l,
    'catalog:fanlevel:layout:' + l, FAN_EFFEKT.includes(l), { utseende: 'fanColor', innehall: 'fanName' }, { tidsstyrt: NIVA_TIDSSTYRT('fan') })),
  ...['profile', 'number', 'stack', 'sidebadge', 'reveal', 'orbitlevel', 'risingtier', 'flip', 'duo'].map(l => ALERT('Gifter Level Up · ' + l,
    'catalog:gifterlevel:' + l, GIFTER_EFFEKT.includes(l), { utseende: 'gifterColor', innehall: 'gifterName' }, { tidsstyrt: NIVA_TIDSSTYRT('gifter') })),
  ...['gold', 'ocean', 'blush'].map(t => ALERT('Follower Spotlight · ' + t, 'catalog:followeralert:' + t, t === 'gold',
    { utseende: 'followColor', innehall: 'followName' }, { tidsstyrt: { followDuration: 'visningstiden provas i alert-livevag.browser.test.js' } })),
  ...['1', '2', '3', '4', 'model:sapphire', 'model:emerald'].map(s => ALERT('Guardian Emblem · ' + s, 'catalog:guardianemblem:' + s,
    s === '1' || s === 'model:sapphire', { utseende: 'textOutlineColor', innehall: 'guardianCustomText' }, { tidsstyrt: {} })),
];
// BATTLE MVP (vyra-mvp-panel.js, PR 7): sex klassiska stilar, sex ramar och åtta firanden. Panelkraven
// gäller alla 20. Effekten per kontroll mäts för modellerna där panelen skiljer sig: en klassisk (Poäng,
// Färg 1/2 och arvet), en ram (Rubrik- och Namnstorlek), ett firande med partikelduk (partiklarna),
// Guldkrona (utan rubrik och skugga) och Lion Clash (utan rubrik och partiklar). Guldkrona har färre
// kontroller än de andra — allt som inte gör något i den är borta — och mäts mot sitt eget golv.
const MVP_KLASSISKA = ['inferno', 'royal', 'cyber', 'storm', 'aurora', 'samurai'];
const MVP_RAMAR = ['royal-ribbon', 'laurel-star', 'dark-wings', 'dragon-fire', 'nautical-helm', 'shadow-star'];
const MVP_FIRANDEN = ['gold-ribbon', 'lion-clash', 'coronation', 'wings', 'portal', 'rosegold', 'pearl', 'moon'];
const MVP_MODELLER = [
  ...MVP_KLASSISKA.map(s => ({ namn: 'Battle MVP · ' + s, nyckel: 'catalog:battlemvp:' + s, effekt: s === 'inferno',
    aterstall: { utseende: 'mvpColor', innehall: 'mvpName' } })),
  ...MVP_RAMAR.map(r => ({ namn: 'Battle MVP · ram ' + r, nyckel: 'catalog:battlemvp:frame:' + r, effekt: r === 'royal-ribbon',
    aterstall: { utseende: 'mvpNameSize', innehall: 'mvpName' } })),
  ...MVP_FIRANDEN.map(f => ({ namn: 'Battle MVP · firande ' + f, nyckel: 'catalog:battlemvp:celebration:' + f,
    effekt: ['coronation', 'gold-ribbon', 'lion-clash'].includes(f), minKontroller: f === 'gold-ribbon' ? 12 : undefined,
    aterstall: { utseende: f === 'coronation' ? 'mvpFxTint' : 'textOutlineColor', innehall: 'mvpName' } })),
];
// RANKING (vyra-ranking-panel.js, PR 8): Top Like, Top Coins och Top Points i de sex designerna — 18
// modeller med en gemensam rankingpanel. Panelkraven gäller alla 18. Effekten per kontroll mäts för en
// lista och en rad i Top Like (Voltage, Royal Rose — Royal Rose har inga placeringstal), podiet i Top
// Coins (Prism horisontal, med Lager och den rubrik som ritas först när Visa rubrik slås på) och en rad
// i Top Points (Celestial).
//
// TIDSSTYRT är här det som bara verkar utanför en ögonblicksbild av editorn: exempeldatan (Namn och
// värde) syns bara i ▶ Testa widget — testspel-isolering provar att den står på klonen — och
// Rangordna efter och Period väljer vilken riktig topplista som visas, vilket bara syns med livedata
// (ranking-livevag.browser.test.js).
const RANKING_DESIGNER = ['voltage', 'basic-v2', 'prism-vertical', 'prism-horizontal', 'celestial', 'royal-rose'];
const RANKING_LIVE = {
  wsLiveMetric: 'rangordningen verkar bara med livedata — provas i ranking-livevag.browser.test.js',
  wsDateRange: 'perioden verkar bara med livedata — provas i ranking-livevag.browser.test.js',
};
const RANKING_EXEMPEL = (namn, varde) => ({ [namn]: 'exempeldatan syns bara i testet — provas i testspel-isolering.browser.test.js',
  [varde]: 'exempeldatan syns bara i testet — provas i testspel-isolering.browser.test.js' });
const RANKING = (typ, d, nyckel, effekt, exempel) => ({ namn: typ + ' · ' + d, nyckel, effekt,
  aterstall: { utseende: 'rankingAccent', innehall: 'templateTitle' }, tidsstyrt: Object.assign({}, RANKING_LIVE, exempel) });
const RANKING_MODELLER = [
  ...RANKING_DESIGNER.map(d => RANKING('Top Like', d, 'catalog:toplike:' + d, d === 'voltage' || d === 'royal-rose', RANKING_EXEMPEL('pr-dataName', 'pr-dataValue'))),
  ...RANKING_DESIGNER.map(d => RANKING('Top Coins', d, 'catalog:ranking:templateTopCoins:' + d, d === 'prism-horizontal', RANKING_EXEMPEL('tcName', 'tcValue'))),
  ...RANKING_DESIGNER.map(d => RANKING('Top Points', d, 'catalog:ranking:templateTopPoints:' + d, d === 'celestial', RANKING_EXEMPEL('tpName', 'tpValue'))),
];
// MÅLEN (vyra-mal-panel.js, PR 9): Follower/Like/Diamond Goal (9), Heart Me Goal (12) och Gift Campaign
// (6). Panelkraven gäller alla 27. Effekten per kontroll mäts för ett format per sort i Social Goal
// (cirkel, liggande, stående), ett tema i Heart Me och en design per orientering i Gift Campaign.
//
// TIDSSTYRT: Mål och Startvärde i Social Goal är serverdata (VyraGoals.patchTarget/patchBaseline) och
// syns först när servern svarat — utan server återställs fältet, vilket är det provet ser. Kampanjens
// entré, rörelse och ljud syns bara medan de spelar
// (rörelsen är kontinuerlig och räknas av mätningen som brus). Allt det provas i mal-livevag, liksom
// Heart Me:s firande (som här syns som en klass på widgeten, och i livevägen som en animation).
const MAL_SERVER = { pfGoalCurrent: 'startvärdet sparas i målet på servern — provas i mal-livevag.browser.test.js',
  pfGoalTarget: 'målet sparas i målet på servern — provas i mal-livevag.browser.test.js' };
const SOCIAL = [['followers', 'crown-orbit', 'circle'], ['followers', 'crown-rail', 'landscape'], ['followers', 'crown-tower', 'portrait'],
  ['likes', 'heart-orbit', 'circle'], ['likes', 'heart-rail', 'landscape'], ['likes', 'heart-tower', 'portrait'],
  ['diamonds', 'diamond-orbit', 'circle'], ['diamonds', 'diamond-rail', 'landscape'], ['diamonds', 'diamond-tower', 'portrait']];
const HJARTTEMAN = ['classic', 'dark', 'emerald', 'galaxy', 'golden', 'ice', 'neon', 'ocean', 'sakura', 'frost', 'midnight', 'citrus'];
const MAL_MODELLER = [
  ...SOCIAL.map(([sort, id, format]) => ({ namn: 'Social Goal · ' + id, nyckel: `catalog:socialgoal:${sort}:${id}:${format}`,
    effekt: ['crown-orbit', 'heart-rail', 'diamond-tower'].includes(id), aterstall: { utseende: 'goalGlow', innehall: 'goalTitle' }, tidsstyrt: MAL_SERVER })),
  ...HJARTTEMAN.map(t => ({ namn: 'Heart Me Goal · ' + t, nyckel: 'catalog:heartgoal:' + t, effekt: t === 'classic',
    aterstall: { utseende: 'heartColor', innehall: 'templateTitle' } })),
  ...['gold', 'platinum', 'emerald'].flatMap(t => ['landscape', 'portrait'].map(o => ({ namn: `Gift Campaign · ${t} ${o}`,
    nyckel: `catalog:giftcampaign:${t}:${o}`, effekt: (t === 'gold' && o === 'landscape') || (t === 'emerald' && o === 'portrait'),
    aterstall: { utseende: 'campaignMotion', innehall: 'templateTitle' },
    tidsstyrt: { campaignDirection: 'entrén syns bara medan den spelar — provas i mal-livevag.browser.test.js',
      campaignMotion: 'rörelsen är kontinuerlig — provas i mal-livevag.browser.test.js',
      campaignSound: 'ljudet hörs bara vid en gåva — provas i mal-livevag.browser.test.js' } }))),
];
// TOP STREAK (vyra-streak-panel.js, PR 10): Clean Flip och Design 1–3. Panelkraven och effekten per kontroll
// gäller alla fyra — panelerna skiljer sig mellan alla fyra (Clean Flip har accent och entré men inga
// Visa-rutor, Design 1 vänder, Design 2 har Färg 2, Design 3 har Stil). De 18 kontroller granskningen mätte
// utan verkan i Clean Flip, och inträdeseffekten i Design 1–3, finns inte i panelen; mätningen här visar att
// det som står kvar gör något.
const STREAK_MODELLER = [
  { namn: 'Top Streak · Clean Flip', nyckel: 'catalog:topstreak', aterstall: { utseende: 'accent', innehall: 'dataName' } },
  ...[1, 2, 3].map(d => ({ namn: 'Top Streak · Design ' + d, nyckel: 'catalog:topstreak:design:' + d, aterstall: { utseende: 'accent', innehall: 'dataName' } })),
];
// PLAYGROUND (vyra-playground-panel.js, PR 11): Top Gifter Podium (13), Top Streak Flip (5) och Goal Pro (9).
// Panelkraven gäller alla 27. Effekten per kontroll mäts för podiet med kodad ram och med en HD-ram, en Top
// Streak Flip och två Goal Pro-designer (Rak bar och Ring). Fälten ligger i w.pg, så Återställ utseende mäts
// här med bakgrunden (ett fält direkt på w) och rubriken w.title; utseendet i w.pg provas i pg-livevag.
//
// TIDSSTYRT i Top Streak Flip är reglerna för vad som händer när gåvor kommer: Visa från streak, Streak bryts
// efter och Flippa mellan profil och gåva med Flip-tid. I editorn står demot (streak 12) stilla. De provas med
// riktiga händelser i pg-livevag.browser.test.js.
const PG_ATERSTALL = { utseende: 'bgColor', innehall: 'title' };
const PG_STREAK_TIDSSTYRT = {
  pgx_gap: 'verkar bara mellan gåvor — provas i pg-livevag.browser.test.js',
  pgx_minn: 'verkar bara när en combo kommer — provas i pg-livevag.browser.test.js',
  pgx_flip: 'flippen går över tid — provas i pg-livevag.browser.test.js',
  pgx_flipt: 'flippen går över tid — provas i pg-livevag.browser.test.js',
};
const PG_RAMAR = ['none', 'royal-phoenix', 'obsidian-dragon', 'gilded-lion', 'frostfire-crown', 'diamond-halo', 'midnight-butterfly',
  'thunder-warden', 'stellar-emperor', 'ocean-oracle', 'moonlit-sakura', 'celestial-serpent', 'neon-valkyrie'];
const PG_MODELLER = [
  ...PG_RAMAR.map(r => ({ namn: 'Top Gifter Podium · ' + r, nyckel: 'catalog:pgpodium:' + r, effekt: r === 'none' || r === 'royal-phoenix', aterstall: PG_ATERSTALL })),
  ...['royal-wings', 'frost-wings', 'emerald-wings', 'neon-wings', 'rose-wings'].map(s => ({ namn: 'Top Streak Flip · ' + s, nyckel: 'catalog:pgstreak:' + s,
    effekt: s === 'royal-wings', aterstall: PG_ATERSTALL, tidsstyrt: PG_STREAK_TIDSSTYRT })),
  ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => ({ namn: 'Goal Pro · design ' + d, nyckel: 'catalog:pggoal:' + d,
    effekt: d === '1' || d === '3', aterstall: PG_ATERSTALL })),
];
// FYRVERKERIERNA (vyra-fyrverkeri-panel.js, PR 12): Gift Fireworks (sex teman på duk), Heart Fireworks och Gift
// Bubbles. Panelkraven gäller alla åtta. Effekten per kontroll mäts för ett Gift Fireworks-tema (alla sex har samma
// post och panel; granskningen mätte Kometspiral), Heart Fireworks och Gift Bubbles.
//
// TIDSSTYRT är nästan allt: effekterna är tomma i vila och ritar bara när en gåva spelar. Varje sådan kontroll
// mäts i fyrverkeri-livevag.browser.test.js — Gift Fireworks duk med ett fast frö (samma väg som livet, festival-
// motorn ritad med och utan ändringen), resten på det motorerna läser (gruppens stil och nivå, grindarna, filerna,
// ljudet, guldskottet, räknaren och bubblornas innehåll). Här kräver provet att de verkligen inte syns i vila.
// Det som syns i vila är placeringen, Storlek, Rotation, Tema (data-fw-theme) och Grundstorlek (data-gb-size).
const FYR_SPELAR = 'syns bara när en gåva spelar — mäts i fyrverkeri-livevag.browser.test.js';
const FYR_TIDSSTYRT = Object.fromEntries(['fwMin', 'fwFinal', 'fwLanes', 'fwExcludeAnon', 'fwScale', 'fwFont', 'fwTextColor', 'fwNameFx',
  'fwColor', 'fwColor2', 'fwGlow', 'fwRadius', 'pr-inheritBrandKit', 'fwEnter', 'fwPlaySpeed', 'fwSound', 'fwVolume'].map(id => [id, FYR_SPELAR]));
const FYR_MODELLER = [
  ...['festival', 'royal', 'ice', 'rose', 'comet', 'supernova'].map(t => ({ namn: 'Gift Fireworks · ' + t, nyckel: 'catalog:giftfireworks:' + t,
    effekt: t === 'comet', aterstall: { utseende: 'fwColor', innehall: 'fwMin' }, tidsstyrt: FYR_TIDSSTYRT })),
  { namn: 'Heart Fireworks', nyckel: 'catalog:heartfireworks', effekt: true, minKontroller: 8, aterstall: { utseende: 'hfGold', innehall: 'hfMin' },
    tidsstyrt: Object.fromEntries(['hfMin', 'hfExcludeAnon', 'hfGold', 'hfShowCombo'].map(id => [id, FYR_SPELAR])) },
  { namn: 'Gift Bubbles', nyckel: 'catalog:giftbubbles', effekt: true, minKontroller: 10, aterstall: { utseende: 'gbSize', innehall: 'gbMin' },
    tidsstyrt: Object.fromEntries(['gbMin', 'gbExcludeAnon', 'gbGiftIn', 'gbHearts', 'gbShowCombo'].map(id => [id, FYR_SPELAR])),
    mediaTidsstyrt: { gbGiftImage: 'reservgåvan syns bara när en gåva utan bild spelar — mäts i fyrverkeri-livevag.browser.test.js' } },
];
// FONTÄNERNA OCH GÅVOBURKEN (vyra-fontan-panel.js, PR 13): Like Fountain klassisk, Like Fountain Portal (nio paletter)
// och Gift Jar (fem djurburkar). Panelkraven gäller alla femton. Effekten per kontroll mäts för den klassiska, en
// Portal (alla nio delar post och panel; paletten ändrar förhandsbilden) och en burk (alla fem delar post).
//
// TIDSSTYRT är det som bara verkar när likes eller gåvor kommer: klassiska fontänens grindar (Minsta like-värde,
// Max profilbilder, Stjärnläge) och popen vid varje like-paket (start, längd, partiklarnas antal, storlek och
// hastighet), Portalens hjärtan per paket, profilbilden och det stora hjärtat, och burkens Full vid, automatiska
// tömning och Töm burken (som bekräftas — provet svarar nej). Varje sådan kontroll mäts i
// fontan-livevag.browser.test.js genom livevägen; här kräver provet att de verkligen inte syns i vila.
const FONTAN_SPELAR = 'syns bara när likes eller gåvor kommer — mäts i fontan-livevag.browser.test.js';
const FONTAN_MODELLER = [
  { namn: 'Like Fountain klassisk', nyckel: 'catalog:likefountain', effekt: true, aterstall: { utseende: 'fountainSize', innehall: 'fountainMinLikes' },
    tidsstyrt: Object.fromEntries(['fountainMinLikes', 'fountainMaxAvatars', 'fountainStarLikes', 'fountainPopEntrance', 'fountainPopDuration',
      'fountainParticleCount', 'fountainParticleSize', 'fountainParticleSpeed'].map(id => [id, FONTAN_SPELAR])) },
  ...['portal', 'rainbow', 'neon', 'fire', 'ice', 'gold', 'aurora', 'pastel', 'mono'].map(p => ({ namn: 'Like Fountain Portal · ' + p,
    nyckel: 'catalog:likefountain:portal:' + p, effekt: p === 'aurora', minKontroller: 8, aterstall: { utseende: 'fountainPalette', innehall: 'fountainPerLike' },
    tidsstyrt: Object.fromEntries(['lfpPer', 'lfpBubblor', 'lfpPop'].map(id => [id, FONTAN_SPELAR])) })),
  ...['lion', 'dragon', 'phoenix', 'panther', 'peacock'].map(m => ({ namn: 'Gift Jar · ' + m, nyckel: 'catalog:giftjar:' + m,
    effekt: m === 'dragon', minKontroller: 8, aterstall: { utseende: 'jarModel', innehall: 'jarCapacity' },
    tidsstyrt: Object.fromEntries(['jarCapacity', 'jarAutoReset', 'pr-jarTom'].map(id => [id, FONTAN_SPELAR])) })),
];
// FAN LEVEL 50 OCH GLOVE SNIPE (vyra-fl50-panel.js och vyra-glove-panel.js, PR 14). Fan Level 50 är en modell med
// fyra kortmallar; effekten per kontroll mäts för den. Inmatningen till deltagarlistan (användarnamnet, Hämta från
// TikTok och Lägg till namn) gör ingenting förrän ett namn skrivits — utan namn står widgeten still, vilket provet
// kräver; med namn provas de i fl50-glove-livevag.browser.test.js (Hämta mot en uppsnappad /api/tiktok-profile).
// Källa mäts med en deltagare i listan (FORUTS): utan någon ser "Live och deltagarlistan" och "Bara live" likadana ut
// (båda visar editorns exempelfans).
//
// Glove Snipe: de fem paketen (Video FX · hela paketet), två poster (WebM med Snipe, MP4 utan). Panelkraven gäller alla
// fem; effekten mäts för ett WebM- och ett MP4-paket. Klippen spelas bara vid en händelse och provas i
// fl50-glove-livevag; i vila är widgeten affischbilden. Paketet har inga utseendefält (färgerna verkar inte, se
// vyra-glove-panel.js), så det har ingen Återställ utseende — provet kräver att knappen saknas.
const FL50_INMATNING = 'verkar först när ett namn skrivits — provas i fl50-glove-livevag.browser.test.js';
const FL50_MODELLER = [
  { namn: 'Fan Level 50', nyckel: 'catalog:fanlevel50:royal', effekt: true, minKontroller: 8, aterstall: { utseende: 'fanl50Design', innehall: 'fanl50Source' },
    tidsstyrt: { fl50AddUser: FL50_INMATNING, fl50AddBtn: FL50_INMATNING, fl50AddNamn: FL50_INMATNING } },
];
const GLOVE_MODELLER = ['koiPearl', 'masquerade', 'pinkPrincess', 'royalRuby', 'cloudFox'].map(p => ({ namn: 'Glove Snipe · ' + p,
  nyckel: 'catalog:glovesnipe:' + p + ':pack:2', effekt: p === 'koiPearl' || p === 'pinkPrincess', minKontroller: 4, aterstall: null }));
const MODELLER = [
  ...FL50_MODELLER,
  ...GLOVE_MODELLER,
  { namn: 'Top Gift · Design 1 (neon)', nyckel: 'catalog:topgift:premium:neon', aterstall: TOPGIFT_ATERSTALL },
  { namn: 'Top Gift · Design 2 (royal)', nyckel: 'catalog:topgift:premium:royal', aterstall: TOPGIFT_ATERSTALL },
  { namn: 'Top Gift · Design 3 (fokus)', nyckel: 'catalog:topgift:premium:fokus', aterstall: TOPGIFT_ATERSTALL },
  { namn: 'Top Gift · Design 4 (Signal Orbit)', nyckel: 'catalog:ranking:templateTopCoins:signal-orbit', aterstall: TOPGIFT_ATERSTALL },
  ...LASTX_MODELLER,
  ...ALERT_MODELLER,
  ...MVP_MODELLER,
  ...RANKING_MODELLER,
  ...MAL_MODELLER,
  ...STREAK_MODELLER,
  ...PG_MODELLER,
  ...FYR_MODELLER,
  ...FONTAN_MODELLER,
];
const LACKA = /assets\/|\.png|\.svg|URL/;
// st: Antal personer i rankingpanelen (spec 5.1: "Antal personer 1–10 st"). mynt: Gift Fireworks Minsta gåva och
// Final vid, och Minsta gåvovärde i Heart Fireworks och Gift Bubbles (talfält: "(mynt)" i etiketten).
// likes: klassiska fontänens Minsta like-värde och Stjärnläge och Portalens Stort hjärta var (talfält: "(likes)" i
// etiketten); st: Gift Jars Full vid.
const ENHET = /(px|%|ms|×|°|s|st|mynt)\s*$/;
// Nivåerna (exempelnivå, minsta nivå och videons nivå, Fan och Gifter) är rena antal, liksom Battle MVP:s
// exempelpoäng (coins) och målens antal (Mål, Startvärde och kampanjens mål per gåva — följare, likes, gåvor), och
// Top Streaks exempelstreak (antalet gåvor i combon).
const RENA_ANTAL = /^(Lager|Coins|Nivå|Minsta nivå|Videons nivå|Poäng|Mål|Startvärde|Gåva \d: mål|Streak)$/;
const PAUS = '*,*::before,*::after{animation-duration:0.001s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition:none!important;caret-color:transparent!important}';
// Förutsättningar för beroende kontroller (granskningens FORUTS).
// Guardians Språk mäts från engelska: provet byter "Följ webbläsaren" mot Svenska, och i en svensk
// webbläsare är det samma text — mätningen hade då berott på maskinens språk.
const FORUTS = { vtShadowColor: { textShadowBlur: 10 }, vtOutlineColor: { textOutlineWidth: 3 }, geLang: { guardianLang: 'en' },
  fl50Source: { fanl50Manual: [{ name: 'Deltagare', avatar: '' }] } };

let server, browser, bas;
const skip = hoppaOver();

test.before(async () => {
  if (skip) return;
  browser = await startaWebblasare();
  if (!browser) throw new Error('hittade en webbläsare men kunde inte starta den - se tests/helpers/webblasare.js');
  server = await servera();
  bas = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
});

async function oppna(nyckel, fel) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', e => fel.push(String(e && e.message || e)));
  await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.editor-shell') && !!window.VyraPanelregister, null, { timeout: 30000, polling: 100 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.VyraSessionState?.projectLocalSession?.());
  await page.waitForTimeout(400);
  await page.evaluate(n => {
    state.widgets.length = 0;
    const w = window.VyraWidgets.create(n); w.id = 'krav'; w.x = 200; w.y = 200;
    state.widgets.push(w); selected = w.id; render();
  }, nyckel);
  await page.waitForFunction(() => document.querySelector('.properties')?.dataset.panelram === '1', null, { timeout: 15000, polling: 100 });
  await page.waitForTimeout(800);
  return page;
}

// ---- i sidan ---------------------------------------------------------------------------------
function sidStruktur() {
  const LACKA_SID = /assets\/|\.png|\.svg|URL/;
  const p = document.querySelector('.properties');
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden'; };
  p.querySelectorAll('[data-panelram-sektion].collapsible').forEach(s => s.classList.add('open'));
  const sektioner = [...p.querySelectorAll('[data-panelram-sektion]')].map(s => {
    const body = s.querySelector(':scope > .pg-body') || s;
    const rader = [...body.children].filter(el => !el.matches('h4'));
    return { nr: Number(s.dataset.panelramSektion), synligaRader: rader.filter(vis).length,
      forstaKontroll: (s.querySelector('button:not(.pg-toggle), input, select') || {}).id || '' };
  });
  // Etiketter: varje rads egen text (utan valens alternativ och värdet i <b>), mediaväljarens och
  // ramens rubriker, och fristående knappar. Knappar INUTI en sammansatt kontroll (mediaväljarens
  // Välj bild/Använd automatisk, ramväljarens rutor, playgroundens och Gift Fireworks färgrutor) är delar av den kontrollen.
  const etiketter = [];
  for (const s of p.querySelectorAll('[data-panelram-sektion]')) {
    s.querySelectorAll('label').forEach(l => {
      if (!vis(l) || l.closest('.vyra-mediaval')) return;
      const c = l.cloneNode(true);
      c.querySelectorAll('select, option, b, small, button, input').forEach(n => n.remove());
      const t = c.textContent.replace(/\s+/g, ' ').trim();
      if (t) etiketter.push(t);
    });
    s.querySelectorAll('.vm-etikett, .pr-etikett').forEach(n => { if (vis(n)) etiketter.push(n.textContent.trim()); });
    s.querySelectorAll('button').forEach(b => {
      if (!vis(b) || b.matches('.pg-toggle, .vyra-emoji-knapp') || b.closest('label, .vyra-mediaval, .pro-frame-picker, .pg-pal, .fw-pal')) return;
      etiketter.push(b.textContent.replace(/\s+/g, ' ').trim());
    });
  }
  const text = [...p.querySelectorAll('[data-panelram-sektion]')].map(s => s.innerText).join('\n');
  const varden = [...p.querySelectorAll('[data-panelram-sektion] input:not([type=file]), [data-panelram-sektion] textarea')]
    .filter(vis).map(i => i.value).filter(v => LACKA_SID.test(v));
  // Tal: reglage och talfält.
  const tal = [...p.querySelectorAll('[data-panelram-sektion] input[type=range], [data-panelram-sektion] input[type=number]')].filter(vis).map(i => {
    const l = i.closest('label');
    const b = l && l.querySelector(':scope > b');
    const c = l ? l.cloneNode(true) : null;
    if (c) c.querySelectorAll('input, b, small, button').forEach(n => n.remove());
    return { id: i.id, typ: i.type, b: b ? b.textContent.trim() : null, etikett: c ? c.textContent.replace(/\s+/g, ' ').trim() : '' };
  });
  return { sektioner, etiketter, text, varden, tal, forstaISektion1: (p.querySelector('[data-panelram-sektion="1"] button') || {}).id };
}

// Kontrollerna som ska mätas, med en selektor per kontroll.
function sidKontroller() {
  const p = document.querySelector('.properties');
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
  p.querySelectorAll('[data-panelram-sektion].collapsible').forEach(s => s.classList.add('open'));
  const ut = [];
  let ramSedd = false;
  for (const s of p.querySelectorAll('[data-panelram-sektion]')) {
    const nr = Number(s.dataset.panelramSektion);
    if (nr === 7) continue;                                 // mäts för sig
    for (const el of s.querySelectorAll('input, select, button')) {
      if (!vis(el) || el.disabled || el.type === 'file') continue;
      if (el.matches('.pg-toggle, .vyra-emoji-knapp, #pr-testspel, #pr-testspel-typ')) continue;
      if (el.closest('.vyra-mediaval')) continue;           // mediaväljaren mäts genom sitt fält
      if (el.closest('.pro-frame-picker')) {
        // Ramväljaren: en ram som inte är vald räcker (flikarna Kollektion byter bara vy i väljaren).
        if (ramSedd || !el.dataset.wsFrame || el.classList.contains('active') || el.dataset.wsFrame === 'none') continue;
        ramSedd = true;
        ut.push({ sel: `.properties [data-ws-frame="${CSS.escape(el.dataset.wsFrame)}"]`, tag: 'button', typ: 'button', etikett: 'Profilram · ' + el.textContent.trim(), id: '' });
        continue;
      }
      const lab = el.closest('label');
      let etikett = '';
      if (lab) { const c = lab.cloneNode(true); c.querySelectorAll('select, option, b, small').forEach(n => n.remove()); etikett = c.textContent.replace(/\s+/g, ' ').trim(); }
      if (!etikett) etikett = el.textContent.replace(/\s+/g, ' ').trim();
      if (!el.id) continue;
      ut.push({ sel: '#' + CSS.escape(el.id), id: el.id, tag: el.tagName.toLowerCase(), typ: el.type, etikett,
        varde: el.type === 'checkbox' ? el.checked : el.value, min: el.min, max: el.max,
        alternativ: el.tagName === 'SELECT' ? [...el.options].map(o => o.value) : null });
    }
  }
  const media = [...p.querySelectorAll('[data-panelram-sektion] .vyra-mediaval')].filter(vis).map(n => n.dataset.mediaval);
  return { kontroller: ut, media };
}

function sidSnap(id) {
  const el = document.querySelector(`.canvas .widget[data-id="${id}"]`);
  if (!el) return null;
  const all = [el, ...el.querySelectorAll('*')];
  const style = all.slice(0, 600).map(n => { const c = getComputedStyle(n); return [n.tagName, typeof n.className === 'string' ? n.className : '', c.color, c.backgroundColor, c.backgroundImage.slice(0, 120), c.fontFamily, c.fontSize, c.fontWeight, c.fontStyle, c.opacity, c.transform, c.width, c.height, c.left, c.top, c.display, c.visibility, c.filter, c.textShadow, c.webkitTextStrokeWidth, c.webkitTextStrokeColor, c.borderTopColor, c.borderTopWidth, c.borderRadius, c.gap, c.marginTop, c.paddingTop, c.letterSpacing, c.zIndex, c.boxShadow.slice(0, 80)].join('|'); });
  const r = el.getBoundingClientRect();
  return { html: el.outerHTML.replace(/ selected/g, ''), style, rect: [r.x, r.y, r.width, r.height].map(Math.round).join(), txt: (el.innerText || '').replace(/\s+/g, ' ').trim(),
    imgs: [...el.querySelectorAll('img')].map(i => i.getAttribute('src')).join() };
}

// ---- i node ----------------------------------------------------------------------------------
function nyttVarde(c) {
  if (c.typ === 'checkbox' || c.tag === 'button') return '__klick';
  if (c.tag === 'select') { const alt = c.alternativ || []; const j = alt.indexOf(c.varde); return alt.length > 1 ? alt[(j + 1) % alt.length] : null; }
  if (c.typ === 'color') return String(c.varde).toLowerCase() === '#ff00ff' ? '#00ff00' : '#ff00ff';
  if (c.typ === 'range') { const v = +c.varde, mx = +c.max, mn = +c.min; return String(v !== mx ? mx : mn); }
  if (c.typ === 'number') {
    const v = +c.varde || 0, mx = c.max !== '' ? +c.max : null, mn = c.min !== '' ? +c.min : null;
    if (mx !== null && mn !== null) { const m = Math.round((mx + mn) / 2 + (mx - mn) / 4); return String(m !== v ? m : mn); }
    return String(v + 37);
  }
  return 'ÄNDRAD TEST';
}

async function tillampa(page, c, v) {
  return page.evaluate(([sel, v, tag]) => {
    const el = document.querySelector(sel);
    if (!el) return 'saknas';
    if (v === '__klick') { el.click(); return 'klick'; }
    const proto = tag === 'select' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return 'satt';
  }, [c.sel, v, c.tag]);
}

async function aterstall(page, orig, forut) {
  await page.evaluate(([o, f]) => {
    const i = state.widgets.findIndex(w => w.id === 'krav');
    state.widgets[i] = Object.assign(JSON.parse(o), f || {});
    selected = 'krav'; render();
  }, [orig, forut || null]);
  await page.waitForTimeout(450);
}

function skiljer(a, b, brus) {
  if (!a || !b) return !!a !== !!b;
  const stil = a.style.some((l, i) => l !== b.style[i] && !brus.stil.has(i)) || a.style.length !== b.style.length;
  return (a.html !== b.html && !brus.html) || stil || a.rect !== b.rect || (a.txt !== b.txt && !brus.txt) || a.imgs !== b.imgs;
}

for (const m of MODELLER) {
  test(`panelkraven: ${m.namn}`, { skip, timeout: 400000 }, async () => {
    const fel = [];
    const page = await oppna(m.nyckel, fel);
    try {
      const s = await page.evaluate(sidStruktur);

      // Ordningen 1–7 och ▶ Testa widget först.
      const nr = s.sektioner.map(x => x.nr);
      assert.equal(nr[0], 1, 'sektion 1 kommer först');
      assert.deepEqual(nr, [...nr].sort((a, b) => a - b), 'sektionerna står i ordningen 1–7');
      assert.equal(new Set(nr).size, nr.length, 'ingen sektion två gånger');
      assert.equal(s.forstaISektion1, 'pr-testspel', '▶ Testa widget är det första i sektion 1');
      // Ingen tom sektion.
      for (const x of s.sektioner) assert.ok(x.synligaRader > 0, `sektion ${x.nr} är tom`);
      // Ingen etikett två gånger.
      const dubbla = s.etiketter.filter((e, i) => s.etiketter.indexOf(e) !== i);
      assert.deepEqual(dubbla, [], 'etiketter som står två gånger');
      // Inga sökvägar eller adresser.
      assert.equal(LACKA.test(s.text), false, `panelens text visar en sökväg: ${(s.text.match(LACKA) || [])[0]}`);
      assert.deepEqual(s.varden, [], 'fältvärden som visar en sökväg');
      // Enheter.
      for (const t of s.tal) {
        if (RENA_ANTAL.test(t.etikett)) continue;
        if (t.typ === 'range') assert.ok(t.b && ENHET.test(t.b), `${t.etikett || t.id}: reglaget saknar enhet i <b> (${t.b})`);
        else assert.ok(/\((px|%|ms|°|s|st|mynt|likes)\)/.test(t.etikett), `${t.etikett || t.id}: talfältet saknar enhet i etiketten`);
      }

      if (m.effekt === false) { assert.deepEqual(fel, [], 'inga sidfel'); return; }

      // Effekt per kontroll.
      await page.addStyleTag({ content: PAUS });
      const orig = await page.evaluate(() => JSON.stringify(state.widgets.find(w => w.id === 'krav')));
      await aterstall(page, orig);
      const s1 = await page.evaluate(sidSnap, 'krav');
      await page.waitForTimeout(900);
      const s2 = await page.evaluate(sidSnap, 'krav');
      const brus = { html: s1.html !== s2.html, txt: s1.txt !== s2.txt, stil: new Set() };
      s1.style.forEach((l, i) => { if (l !== s2.style[i]) brus.stil.add(i); });

      const { kontroller, media } = await page.evaluate(sidKontroller);
      assert.ok(kontroller.length >= (m.minKontroller || 15), `för få kontroller hittades (${kontroller.length})`);
      const utan = [];
      const tidsstyrt = m.tidsstyrt || {};
      // En händelse genom livevägen (bara Last-X): samma händelse före och efter ändringen.
      const handelse = typ => page.evaluate(t => { window.triggerLastXAlert(t, { username: 'Händelseprov', __test: true }); }, typ)
        .then(() => page.waitForTimeout(500));
      const onodiga = [];
      for (const c of kontroller) {
        const v = nyttVarde(c);
        if (tidsstyrt[c.id]) {
          // Undantaget ska vara sant: kontrollen syns verkligen inte i en ögonblicksbild. Det visar
          // också att mätningen kan säga "ingen verkan" för den här modellen.
          await aterstall(page, orig);
          const f = await page.evaluate(sidSnap, 'krav');
          await tillampa(page, c, v);
          await page.waitForTimeout(700);
          if (skiljer(f, await page.evaluate(sidSnap, 'krav'), brus)) onodiga.push(c.id);
          // Samma sak med en händelse: händelsemätningen ovan får inte se verkan där ingen finns.
          if (m.handelse) {
            await aterstall(page, orig);
            await handelse('gifter');
            const fh = await page.evaluate(sidSnap, 'krav');
            await aterstall(page, orig);
            await tillampa(page, c, v);
            await page.waitForTimeout(700);
            await handelse('gifter');
            if (skiljer(fh, await page.evaluate(sidSnap, 'krav'), brus)) onodiga.push(c.id + ' (med händelse)');
          }
          continue;
        }
        if (v === null) { utan.push(`${c.etikett}: inget annat värde att prova`); continue; }
        await aterstall(page, orig, FORUTS[c.id]);
        let fore = await page.evaluate(sidSnap, 'krav');
        let how = await tillampa(page, c, v);
        await page.waitForTimeout(700);
        let efter = await page.evaluate(sidSnap, 'krav');
        const typ = m.handelse && m.handelse(c);
        if (how !== 'saknas' && !skiljer(fore, efter, brus) && typ) {
          await aterstall(page, orig, FORUTS[c.id]);
          await handelse(typ);
          fore = await page.evaluate(sidSnap, 'krav');
          await aterstall(page, orig, FORUTS[c.id]);
          how = await tillampa(page, c, v) + ' + händelse ' + typ;
          await page.waitForTimeout(700);
          await handelse(typ);
          efter = await page.evaluate(sidSnap, 'krav');
        }
        if (how === 'saknas' || !skiljer(fore, efter, brus)) utan.push(`${c.etikett} (${c.sel}, ${how})`);
      }
      // Mediaväljaren: ett annat giltigt värde i fältet ska synas i widgeten.
      const ANNAN = { profileImage: 'assets/gifts/events/7460_Cap.png', giftImage: 'assets/gifts/events/7578_Crown.png' };
      for (const falt of media) {
        if (m.mediaTidsstyrt && m.mediaTidsstyrt[falt]) continue;
        await aterstall(page, orig);
        const fore = await page.evaluate(sidSnap, 'krav');
        await aterstall(page, orig, { [falt]: ANNAN[falt] || 'assets/gifts/events/7578_Crown.png' });
        const efter = await page.evaluate(sidSnap, 'krav');
        if (!skiljer(fore, efter, brus)) utan.push(`mediaväljaren ${falt}`);
      }
      assert.deepEqual(utan, [], 'kontroller utan synlig verkan');
      assert.deepEqual(onodiga, [], 'undantagna som tidsstyrda men syns ändå direkt — ta bort undantaget');
      for (const id of Object.keys(tidsstyrt)) assert.ok(kontroller.some(c => c.id === id), `undantaget ${id} finns inte i panelen`);

      // Återställ utseende: utseendet tillbaka, innehåll och placering kvar.
      await aterstall(page, orig);
      if (m.aterstall === null) {
        assert.equal(await page.$('#pr-aterstall-utseende'), null, 'ingen Återställ utseende utan utseendefält');
        assert.deepEqual(fel, [], 'inga sidfel');
        return;
      }
      const fa = m.aterstall;
      const las7 = () => page.evaluate(f => { const w = liveWidget('krav'); return { accent: w[f.utseende], x: w.x, namn: w[f.innehall] }; }, fa);
      const fore7 = await las7();
      await page.evaluate(f => { const w = liveWidget('krav'); w[f.utseende] = '#ff00ff'; w.x = 333; w[f.innehall] = 'Kvar'; save(); render(); }, fa);
      await page.waitForTimeout(450);
      await page.evaluate(() => document.querySelector('.properties [data-panelram-sektion="7"]').classList.add('open'));
      await page.click('#pr-aterstall-utseende');
      await page.waitForTimeout(450);
      const efter7 = await las7();
      assert.equal(efter7.accent, fore7.accent, `Återställ utseende tar tillbaka ${fa.utseende}`);
      assert.equal(efter7.x, 333, 'placeringen rörs inte');
      assert.equal(efter7.namn, 'Kvar', 'innehållet rörs inte');

      assert.deepEqual(fel, [], 'inga sidfel');
    } finally {
      await page.close();
    }
  });
}

test('en modell utan registerpost får ingen ramsektion och ingen arvsruta', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.goto(`${bas}/studio.html?open=layout`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('.editor-shell'), null, { timeout: 30000, polling: 100 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      state.widgets.length = 0;
      const w = window.VyraWidgets.create('catalog:topgift:premium:neon'); w.id = 'ram'; w.giftFrame = 'gold';
      state.widgets.push(w); selected = w.id; render();
    });
    await page.waitForTimeout(1200);
    const lage = await page.evaluate(() => ({ ram: document.querySelector('.properties')?.dataset.panelram || null,
      sektioner: document.querySelectorAll('[data-panelram-sektion]').length, arv: !!document.querySelector('#pr-inheritBrandKit') }));
    assert.deepEqual(lage, { ram: null, sektioner: 0, arv: false }, 'Top Gift med gåvoram har ingen post och får dagens panel');
    assert.deepEqual(fel, []);
  } finally {
    await page.close();
  }
});

// Battle MVP (spec 5.18): Poäng (exempeldata) och Poängsymbol hör till poängen och visas bara när Visa
// poäng är på — i de klassiska stilarna, de enda som ritar poängen. Med poängen på gäller panelkraven
// fortfarande (enheter, inga dubbla etiketter), och båda fälten syns i widgeten.
test('Battle MVP: Poäng och Poängsymbol visas bara när Visa poäng är på', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna('catalog:battlemvp:inferno', fel);
  try {
    const falt = () => page.evaluate(() => [...document.querySelectorAll('.properties [data-panelram-sektion] #mvpScore, .properties [data-panelram-sektion] #mvpCoinSymbol')]
      .map(e => e.id + '@' + e.closest('[data-panelram-sektion]').dataset.panelramSektion).sort());
    assert.deepEqual(await falt(), [], 'poängfälten syns inte när poängen är av');
    await page.click('#mvpShowCoins');
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => liveWidget('krav').mvpShowCoins), true, 'Visa poäng sparar mvpShowCoins');
    assert.deepEqual(await falt(), ['mvpCoinSymbol@2', 'mvpScore@1'], 'Poäng i exempeldatan, Poängsymbol i Innehåll');
    const s = await page.evaluate(sidStruktur);
    assert.deepEqual(s.etiketter.filter((e, i) => s.etiketter.indexOf(e) !== i), [], 'etiketter som står två gånger');
    const synlig = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-id="krav"] .mvp-copy strong')).display);
    assert.notEqual(synlig, 'none', 'poängen ritas i widgeten');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

// Battle MVP: samma bakgrundsregel som Last-X — ingen grupp för en ny widget (det finns ingen bakgrund
// att ta bort), men en sparad widget med egen bakgrund (ritas bakom motivet) behåller den.
test('Battle MVP: en sparad widget med egen bakgrund behåller bakgrundsgruppen, en ny har den inte', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna('catalog:battlemvp:celebration:coronation', fel);
  try {
    const sektion5 = () => page.evaluate(() => [...document.querySelectorAll('.properties [data-panelram-sektion="5"] #wbColor, .properties [data-panelram-sektion="5"] #wbHide')].map(e => e.id));
    assert.deepEqual(await sektion5(), [], 'en ny Battle MVP har ingen bakgrundsgrupp');
    await page.evaluate(() => { const w = liveWidget('krav'); w.bgColor = '#112233'; w.bgStrength = 80; save(); render(); });
    await page.waitForTimeout(800);
    assert.deepEqual((await sektion5()).sort(), ['wbColor', 'wbHide'], 'bakgrundsgruppen finns för widgeten med egen bakgrund');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

// Battle MVP: Stil-listan har ramarna, så att en ram går att välja tillbaka (förut raderade ett stilval
// mvpFrame och ramen fanns inte i listan). Ett ramval sätter mvpFrame och ger ramens panel; ett
// stilval tar bort ramen igen.
test('Battle MVP: ramarna finns i Stil-listan och går att välja fram och tillbaka', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna('catalog:battlemvp:inferno', fel);
  try {
    const lage = () => page.evaluate(() => {
      const w = liveWidget('krav'), sel = document.querySelector('.properties #mvpStyle');
      return { frame: w.mvpFrame || null, style: w.mvpStyle || null, varde: sel && sel.value,
        marke: (document.querySelector('.properties .template-badge') || {}).textContent,
        ramar: sel ? [...sel.querySelectorAll('optgroup[data-pr-ramar] option')].map(o => o.value) : [] };
    });
    const fore = await lage();
    assert.deepEqual(fore.ramar, ['ram:royal-ribbon', 'ram:laurel-star', 'ram:dark-wings', 'ram:dragon-fire', 'ram:nautical-helm', 'ram:shadow-star']);
    assert.equal(fore.varde, 'inferno');
    await page.evaluate(() => document.querySelector('[data-panelram-sektion="5"]')?.classList.add('open'));
    await page.selectOption('.properties #mvpStyle', 'ram:dark-wings');
    await page.waitForTimeout(900);
    const ram = await lage();
    assert.equal(ram.frame, 'dark-wings', 'ramvalet sätter mvpFrame');
    assert.equal(ram.varde, 'ram:dark-wings', 'listan visar ramen');
    assert.equal(ram.marke, 'Dark Wings · ram', 'ramens panel');
    assert.ok(await page.$('.canvas [data-id="krav"].mvp-framed'), 'widgeten ritas som ram');
    await page.evaluate(() => document.querySelector('[data-panelram-sektion="5"]')?.classList.add('open'));
    await page.selectOption('.properties #mvpStyle', 'cyber');
    await page.waitForTimeout(900);
    const tillbaka = await lage();
    assert.deepEqual([tillbaka.frame, tillbaka.style, tillbaka.varde, tillbaka.marke], [null, 'cyber', 'cyber', 'Cyber · klassisk'], 'ett stilval tar bort ramen');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});

// Last-X visar inte BAKGRUND för en ny widget (spec 5.17), men en sparad widget som redan har en egen
// bakgrund (widget-background.js ritar den bakom kortet) måste kunna ändra och ta bort den.
test('Last-X: en sparad widget med egen bakgrund behåller bakgrundsgruppen, en ny har den inte', { skip, timeout: 120000 }, async () => {
  const fel = [];
  const page = await oppna('catalog:lastx:card', fel);
  try {
    const sektion5 = () => page.evaluate(() => [...document.querySelectorAll('.properties [data-panelram-sektion="5"] #wbColor, .properties [data-panelram-sektion="5"] #wbHide')].map(e => e.id));
    assert.deepEqual(await sektion5(), [], 'en ny Last-X har ingen bakgrundsgrupp');
    await page.evaluate(() => { const w = liveWidget('krav'); w.bgColor = '#112233'; w.bgStrength = 80; save(); render(); });
    await page.waitForTimeout(800);
    assert.deepEqual((await sektion5()).sort(), ['wbColor', 'wbHide'], 'bakgrundsgruppen finns för widgeten med egen bakgrund');
    assert.deepEqual(fel, [], 'inga sidfel');
  } finally {
    await page.close();
  }
});
