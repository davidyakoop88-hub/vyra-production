# Sanningens karta · widgetkatalogen

<!-- AUTO-GENERERAD. Redigera inte for hand. Kor `npm run karta`. -->

Genererad ur den **korande** katalogen i en riktig webblasare, inte ur kallkoden.
Det ar sjalva poangen: rubriker som pastod fel antal, knappar utan katalognyckel och
tva sektioner som aldrig byggdes sag alla korrekta ut i koden. Det syns bara nar man
startar sidan och raknar.

Commit: `acd6935`

> **Vilken session kartan mott:** **utloggad**, utan konto och utan cloud-synk.
>
> Katalogen ser inte likadan ut inloggad och utloggad — kontobundna sektioner kan ha
> ett annat antal val. Kartan genereras i CI, dar ingen inloggning finns, sa siffrorna
> nedan ar den utloggade vyn. Kolumnerna Nyckel / Shadow / Ritar galler alla kort som
> faktiskt byggdes, och det ar de kolumnerna som ar vaktarna.

**Senast andrad / PR** letas med `git log -S` pa katalognyckeln, i koden — `docs/`,
`tests/` och `*.md` ar uteslutna, sa en fil som bara *namner* nyckeln kan inte vinna.
Ett tomt PR-falt betyder att andringen gick som en direktpush till main, inte att
proveniensen saknas: datumet bredvid ar anda matt.

## Sammanfattning

| | |
|---|---|
| Kort totalt | **179** |
| Sektioner | 26 |
| Med katalognyckel | 179 / 179 |
| Med shadow DOM-miniatyr | 135 / 179  ⚠️ |
| Ritar sin design | 179 / 179 |
| Tandningsregel i dokumentet | 0  (ska vara 0) |
| Layout rord av katalogen | 0 i minnet, 0 pa disk  (ska vara 0/0) |

Tandningsregeln for alerts bor i en shadow root och far inte finnas i
`document.styleSheets` — dar kunde den na overlayen. Se `tests/browser/thumb-leak.browser.test.js`.

## Per sektion

| Sektion | Kort | Nyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|---|
| RANKING · SAMMA DESIGN FÖR TOP LIKE, TOP COINS OCH TOP POINTS | 18 | 18/18 | 18/18 | 18/18 | 2026-09-25 | [#522](https://github.com/davidyakoop88-hub/vyra-production/pull/522) |
| VYRA TOP STREAK · CLEAN FLIP | 13 | 13/13 | 0/13 ⚠️ | 13/13 | 2026-10-01 | [#558](https://github.com/davidyakoop88-hub/vyra-production/pull/558) |
| FOLLOWER, LIKE & DIAMOND GOALS · 18 RÖRLIGA DESIGNER | 18 | 18/18 | 9/18 ⚠️ | 18/18 | 2026-09-25 | [#525](https://github.com/davidyakoop88-hub/vyra-production/pull/525) |
| FAN LEVEL 50 · MILSTOLPE | 4 | 4/4 | 4/4 | 4/4 | 2026-09-29 | [#549](https://github.com/davidyakoop88-hub/vyra-production/pull/549) |
| FIREWORKS & BUBBLES · 7 DESIGNER | 7 | 7/7 | 7/7 | 7/7 | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| EGET INNEHÅLL | 3 | 3/3 | 3/3 | 3/3 | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| LAST-X ALERTS · VARJE DESIGN SEPARAT | 11 | 11/11 | 11/11 | 11/11 | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| TOP COINS · 2 DESIGNER | 2 | 2/2 | 0/2 ⚠️ | 2/2 | 2026-10-01 | [#558](https://github.com/davidyakoop88-hub/vyra-production/pull/558) |
| GIFT JAR · VARJE MODELL SEPARAT | 5 | 5/5 | 5/5 | 5/5 | 2026-08-31 | [#274](https://github.com/davidyakoop88-hub/vyra-production/pull/274) |
| GUARDIAN EMBLEM | 6 | 6/6 | 6/6 | 6/6 | 2026-09-11 | [#403](https://github.com/davidyakoop88-hub/vyra-production/pull/403) |
| GIFT CAMPAIGN · LJUS OCH RÖRELSE | 6 | 6/6 | 6/6 | 6/6 | 2026-09-12 | — |
| LIKE FOUNTAIN | 10 | 10/10 | 10/10 | 10/10 | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |
| BATTLE MVP · 12 DESIGNER | 12 | 12/12 | 12/12 | 12/12 | 2026-10-01 | [#556](https://github.com/davidyakoop88-hub/vyra-production/pull/556) |
| BATTLE MVP · FIRANDE · 8 KOREOGRAFIER | 8 | 8/8 | 8/8 | 8/8 | 2026-09-11 | — |
| Koi Pearl Lagoon · VIDEO FX | 1 | 1/1 | 0/1 ⚠️ | 1/1 | 2026-08-03 | — |
| Masquerade Ball · VIDEO FX | 1 | 1/1 | 0/1 ⚠️ | 1/1 | 2026-08-03 | — |
| Pink Princess · VIDEO FX | 1 | 1/1 | 0/1 ⚠️ | 1/1 | 2026-08-03 | — |
| Royal Ruby · VIDEO FX | 1 | 1/1 | 0/1 ⚠️ | 1/1 | 2026-08-03 | — |
| Cloud Fox · VIDEO FX | 1 | 1/1 | 0/1 ⚠️ | 1/1 | 2026-08-03 | — |
| NEW FOLLOWER ALERT · 3 TEMAN | 3 | 3/3 | 3/3 | 3/3 | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |
| GIFTER LEVEL UP · VARJE MODELL SEPARAT | 9 | 9/9 | 9/9 | 9/9 | 2026-08-20 | — |
| FAN LEVEL UP · 8 MODELLER | 8 | 8/8 | 8/8 | 8/8 | 2026-08-12 | — |
| HEART ME GOAL · VARJE TEMA SEPARAT | 12 | 12/12 | 12/12 | 12/12 | 2026-08-03 | — |
| TOP GIFTER · DESIGNVAL | 15 | 15/15 | 0/15 ⚠️ | 15/15 | 2026-10-01 | [#558](https://github.com/davidyakoop88-hub/vyra-production/pull/558) |
| SKATTKISTA · LIVE | 2 | 2/2 | 2/2 | 2/2 | 2026-09-27 | [#535](https://github.com/davidyakoop88-hub/vyra-production/pull/535) |
| LÅTÖNSKNINGAR · LIVE | 2 | 2/2 | 2/2 | 2/2 | 2026-09-27 | [#536](https://github.com/davidyakoop88-hub/vyra-production/pull/536) |

## Varje kort

### RANKING · SAMMA DESIGN FÖR TOP LIKE, TOP COINS OCH TOP POINTS

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Top Like | `catalog:toplike:voltage` | ✓ | ✓ | 2026-09-25 | [#522](https://github.com/davidyakoop88-hub/vyra-production/pull/522) |
| Top Coins | `catalog:ranking:templateTopCoins:voltage` | ✓ | ✓ | 2026-10-01 | [#558](https://github.com/davidyakoop88-hub/vyra-production/pull/558) |
| Top Points | `catalog:ranking:templateTopPoints:voltage` | ✓ | ✓ | 2026-09-25 | [#522](https://github.com/davidyakoop88-hub/vyra-production/pull/522) |
| Top Like | `catalog:toplike:basic-v2` | ✓ | ✓ | 2026-09-25 | [#522](https://github.com/davidyakoop88-hub/vyra-production/pull/522) |
| Top Coins | `catalog:ranking:templateTopCoins:basic-v2` | ✓ | ✓ | 2026-10-01 | [#558](https://github.com/davidyakoop88-hub/vyra-production/pull/558) |
| Top Points | `catalog:ranking:templateTopPoints:basic-v2` | ✓ | ✓ | 2026-09-25 | [#522](https://github.com/davidyakoop88-hub/vyra-production/pull/522) |
| Top Like | `catalog:toplike:prism-vertical` | ✓ | ✓ | 2026-09-25 | [#522](https://github.com/davidyakoop88-hub/vyra-production/pull/522) |
| Top Coins | `catalog:ranking:templateTopCoins:prism-vertical` | ✓ | ✓ | 2026-10-01 | [#558](https://github.com/davidyakoop88-hub/vyra-production/pull/558) |
| Top Points | `catalog:ranking:templateTopPoints:prism-vertical` | ✓ | ✓ | 2026-09-25 | [#522](https://github.com/davidyakoop88-hub/vyra-production/pull/522) |
| Top Like | `catalog:toplike:prism-horizontal` | ✓ | ✓ | 2026-09-25 | [#522](https://github.com/davidyakoop88-hub/vyra-production/pull/522) |
| Top Coins | `catalog:ranking:templateTopCoins:prism-horizontal` | ✓ | ✓ | 2026-10-01 | [#558](https://github.com/davidyakoop88-hub/vyra-production/pull/558) |
| Top Points | `catalog:ranking:templateTopPoints:prism-horizontal` | ✓ | ✓ | 2026-09-25 | [#522](https://github.com/davidyakoop88-hub/vyra-production/pull/522) |
| Top Like | `catalog:toplike:celestial` | ✓ | ✓ | 2026-09-25 | [#522](https://github.com/davidyakoop88-hub/vyra-production/pull/522) |
| Top Coins | `catalog:ranking:templateTopCoins:celestial` | ✓ | ✓ | 2026-10-01 | [#558](https://github.com/davidyakoop88-hub/vyra-production/pull/558) |
| Top Points | `catalog:ranking:templateTopPoints:celestial` | ✓ | ✓ | 2026-09-25 | [#522](https://github.com/davidyakoop88-hub/vyra-production/pull/522) |
| Top Like | `catalog:toplike:royal-rose` | ✓ | ✓ | 2026-09-25 | [#522](https://github.com/davidyakoop88-hub/vyra-production/pull/522) |
| Top Coins | `catalog:ranking:templateTopCoins:royal-rose` | ✓ | ✓ | 2026-10-01 | [#558](https://github.com/davidyakoop88-hub/vyra-production/pull/558) |
| Top Points | `catalog:ranking:templateTopPoints:royal-rose` | ✓ | ✓ | 2026-09-25 | [#522](https://github.com/davidyakoop88-hub/vyra-production/pull/522) |

### VYRA TOP STREAK · CLEAN FLIP

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Clean Flip | `catalog:topstreak` | — ⚠️ | ✓ | 2026-10-01 | [#558](https://github.com/davidyakoop88-hub/vyra-production/pull/558) |
| Top Streak Flip · Royal Amethyst | `catalog:pgstreak:royal-wings` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Streak Flip · Frost Sapphire | `catalog:pgstreak:frost-wings` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Streak Flip · Emerald Leaf | `catalog:pgstreak:emerald-wings` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Streak Flip · Inferno Ruby | `catalog:pgstreak:inferno-wings` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Streak Flip · Neon Crystal | `catalog:pgstreak:neon-wings` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Streak Flip · Rose Pearl | `catalog:pgstreak:rose-wings` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Streak Flip · Royal Gold | `catalog:pgstreak:royal-gold` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Streak Flip · Frost Crystal | `catalog:pgstreak:frost-crystal` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Streak Flip · Inferno | `catalog:pgstreak:inferno` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Streak Flip · Emerald Grove | `catalog:pgstreak:emerald-grove` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Streak Flip · Neon Circuit | `catalog:pgstreak:neon-circuit` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Streak Flip · Violet Orchid | `catalog:pgstreak:violet-orchid` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |

### FOLLOWER, LIKE & DIAMOND GOALS · 18 RÖRLIGA DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Crown Orbit | `catalog:socialgoal:followers:crown-orbit:circle` | ✓ | ✓ | 2026-09-25 | [#525](https://github.com/davidyakoop88-hub/vyra-production/pull/525) |
| Crown Rail | `catalog:socialgoal:followers:crown-rail:landscape` | ✓ | ✓ | 2026-09-25 | [#525](https://github.com/davidyakoop88-hub/vyra-production/pull/525) |
| Crown Tower | `catalog:socialgoal:followers:crown-tower:portrait` | ✓ | ✓ | 2026-09-25 | [#525](https://github.com/davidyakoop88-hub/vyra-production/pull/525) |
| Heart Orbit | `catalog:socialgoal:likes:heart-orbit:circle` | ✓ | ✓ | 2026-09-25 | [#525](https://github.com/davidyakoop88-hub/vyra-production/pull/525) |
| Heart Rail | `catalog:socialgoal:likes:heart-rail:landscape` | ✓ | ✓ | 2026-09-25 | [#525](https://github.com/davidyakoop88-hub/vyra-production/pull/525) |
| Heart Tower | `catalog:socialgoal:likes:heart-tower:portrait` | ✓ | ✓ | 2026-09-25 | [#525](https://github.com/davidyakoop88-hub/vyra-production/pull/525) |
| Diamond Orbit | `catalog:socialgoal:diamonds:diamond-orbit:circle` | ✓ | ✓ | 2026-09-25 | [#525](https://github.com/davidyakoop88-hub/vyra-production/pull/525) |
| Diamond Rail | `catalog:socialgoal:diamonds:diamond-rail:landscape` | ✓ | ✓ | 2026-09-25 | [#525](https://github.com/davidyakoop88-hub/vyra-production/pull/525) |
| Diamond Tower | `catalog:socialgoal:diamonds:diamond-tower:portrait` | ✓ | ✓ | 2026-09-25 | [#525](https://github.com/davidyakoop88-hub/vyra-production/pull/525) |
| Goal Pro · Rak bar | `catalog:pggoal:1` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Goal Pro · Pill | `catalog:pggoal:2` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Goal Pro · Ring | `catalog:pggoal:3` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Goal Pro · Mätare | `catalog:pggoal:4` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Goal Pro · Steg | `catalog:pggoal:5` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Goal Pro · Bara siffra | `catalog:pggoal:6` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Goal Pro · Stående | `catalog:pggoal:7` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Goal Pro · Smal med pil | `catalog:pggoal:8` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Goal Pro · Stående pill | `catalog:pggoal:9` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |

### FAN LEVEL 50 · MILSTOLPE

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Fan Level 50 · Fly Love | `catalog:fanlevel50:royal` | ✓ | ✓ | 2026-09-29 | [#549](https://github.com/davidyakoop88-hub/vyra-production/pull/549) |
| Fan Level 50 · Zeus | `catalog:fanlevel50:zeus` | ✓ | ✓ | 2026-09-29 | [#549](https://github.com/davidyakoop88-hub/vyra-production/pull/549) |
| Fan Level 50 · Örnen | `catalog:fanlevel50:ornen` | ✓ | ✓ | 2026-09-29 | [#549](https://github.com/davidyakoop88-hub/vyra-production/pull/549) |
| Fan Level 50 · Lejonkungen | `catalog:fanlevel50:lejon` | ✓ | ✓ | 2026-09-29 | [#549](https://github.com/davidyakoop88-hub/vyra-production/pull/549) |

### FIREWORKS & BUBBLES · 7 DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Lila & guld | `catalog:giftfireworks:royal` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Isblå & silver | `catalog:giftfireworks:ice` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Roséguld | `catalog:giftfireworks:rose` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Kometspiral | `catalog:giftfireworks:comet` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Supernova | `catalog:giftfireworks:supernova` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Heart Fireworks | `catalog:heartfireworks` | ✓ | ✓ | 2026-09-29 | [#547](https://github.com/davidyakoop88-hub/vyra-production/pull/547) |
| Gift Bubbles | `catalog:giftbubbles` | ✓ | ✓ | 2026-09-29 | [#547](https://github.com/davidyakoop88-hub/vyra-production/pull/547) |

### EGET INNEHÅLL

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Text | `catalog:custom:text` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Bild | `catalog:custom:image` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Video | `catalog:custom:video` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |

### LAST-X ALERTS · VARJE DESIGN SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Last-X · Card | `catalog:lastx:card` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Last-X · Stack | `catalog:lastx:stack` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Last-X · Skew | `catalog:lastx:skew` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Last-X · Badge | `catalog:lastx:badge` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Last-X · Royal Coronation | `catalog:lastx:royal` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Last-X · Crown Banner | `catalog:lastx:crownBanner` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Last-X · Royal Amethyst | `catalog:lastx:royalAmethyst` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Last-X · Ice King | `catalog:lastx:iceKing` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Last-X · Neon Cyber | `catalog:lastx:neonCyber` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Last-X · Dragon Flame | `catalog:lastx:dragonFlame` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Last-X · Angel Gold | `catalog:lastx:angelGold` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |

### TOP COINS · 2 DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Top Coins · Halo | `catalog:ranking:templateTopCoins:halo` | — ⚠️ | ✓ | 2026-10-01 | [#558](https://github.com/davidyakoop88-hub/vyra-production/pull/558) |
| Top Coins · Signal Orbit | `catalog:ranking:templateTopCoins:signal-orbit` | — ⚠️ | ✓ | 2026-10-01 | [#558](https://github.com/davidyakoop88-hub/vyra-production/pull/558) |

### GIFT JAR · VARJE MODELL SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Royal Lion | `catalog:giftjar:lion` | ✓ | ✓ | 2026-08-31 | [#274](https://github.com/davidyakoop88-hub/vyra-production/pull/274) |
| Ember Dragon | `catalog:giftjar:dragon` | ✓ | ✓ | 2026-08-31 | [#274](https://github.com/davidyakoop88-hub/vyra-production/pull/274) |
| Phoenix Rise | `catalog:giftjar:phoenix` | ✓ | ✓ | 2026-08-31 | [#274](https://github.com/davidyakoop88-hub/vyra-production/pull/274) |
| Midnight Panther | `catalog:giftjar:panther` | ✓ | ✓ | 2026-08-31 | [#274](https://github.com/davidyakoop88-hub/vyra-production/pull/274) |
| Sapphire Peacock | `catalog:giftjar:peacock` | ✓ | ✓ | 2026-08-31 | [#274](https://github.com/davidyakoop88-hub/vyra-production/pull/274) |

### GUARDIAN EMBLEM

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Ram | `catalog:guardianemblem:1` | ✓ | ✓ | 2026-09-11 | [#403](https://github.com/davidyakoop88-hub/vyra-production/pull/403) |
| Hjort | `catalog:guardianemblem:2` | ✓ | ✓ | 2026-09-11 | [#403](https://github.com/davidyakoop88-hub/vyra-production/pull/403) |
| Krona | `catalog:guardianemblem:3` | ✓ | ✓ | 2026-09-11 | [#403](https://github.com/davidyakoop88-hub/vyra-production/pull/403) |
| Kungakrona | `catalog:guardianemblem:4` | ✓ | ✓ | 2026-09-11 | [#403](https://github.com/davidyakoop88-hub/vyra-production/pull/403) |
| Blå kristall | `catalog:guardianemblem:model:sapphire` | ✓ | ✓ | 2026-09-11 | [#403](https://github.com/davidyakoop88-hub/vyra-production/pull/403) |
| Grön aura | `catalog:guardianemblem:model:emerald` | ✓ | ✓ | 2026-09-11 | [#403](https://github.com/davidyakoop88-hub/vyra-production/pull/403) |

### GIFT CAMPAIGN · LJUS OCH RÖRELSE

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Guldslöja | `catalog:giftcampaign:gold:landscape` | ✓ | ✓ | 2026-09-12 | — |
| Guldslöja | `catalog:giftcampaign:gold:portrait` | ✓ | ✓ | 2026-09-12 | — |
| Platinum Light | `catalog:giftcampaign:platinum:landscape` | ✓ | ✓ | 2026-09-12 | — |
| Platinum Light | `catalog:giftcampaign:platinum:portrait` | ✓ | ✓ | 2026-09-12 | — |
| Emerald Mist | `catalog:giftcampaign:emerald:landscape` | ✓ | ✓ | 2026-09-12 | — |
| Emerald Mist | `catalog:giftcampaign:emerald:portrait` | ✓ | ✓ | 2026-09-12 | — |

### LIKE FOUNTAIN

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Like Fountain | `catalog:likefountain` | ✓ | ✓ | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |
| Like Fountain · Portal · Portal · rosa & lil | `catalog:likefountain:portal:portal` | ✓ | ✓ | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |
| Like Fountain · Portal · Rainbow | `catalog:likefountain:portal:rainbow` | ✓ | ✓ | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |
| Like Fountain · Portal · Neon | `catalog:likefountain:portal:neon` | ✓ | ✓ | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |
| Like Fountain · Portal · Fire | `catalog:likefountain:portal:fire` | ✓ | ✓ | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |
| Like Fountain · Portal · Ice | `catalog:likefountain:portal:ice` | ✓ | ✓ | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |
| Like Fountain · Portal · Gold | `catalog:likefountain:portal:gold` | ✓ | ✓ | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |
| Like Fountain · Portal · Aurora | `catalog:likefountain:portal:aurora` | ✓ | ✓ | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |
| Like Fountain · Portal · Pastel | `catalog:likefountain:portal:pastel` | ✓ | ✓ | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |
| Like Fountain · Portal · Mono | `catalog:likefountain:portal:mono` | ✓ | ✓ | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |

### BATTLE MVP · 12 DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Inferno | `catalog:battlemvp:inferno` | ✓ | ✓ | 2026-10-01 | [#556](https://github.com/davidyakoop88-hub/vyra-production/pull/556) |
| Royal | `catalog:battlemvp:royal` | ✓ | ✓ | 2026-10-01 | [#556](https://github.com/davidyakoop88-hub/vyra-production/pull/556) |
| Cyber | `catalog:battlemvp:cyber` | ✓ | ✓ | 2026-10-01 | [#556](https://github.com/davidyakoop88-hub/vyra-production/pull/556) |
| Storm | `catalog:battlemvp:storm` | ✓ | ✓ | 2026-10-01 | [#556](https://github.com/davidyakoop88-hub/vyra-production/pull/556) |
| Aurora | `catalog:battlemvp:aurora` | ✓ | ✓ | 2026-10-01 | [#556](https://github.com/davidyakoop88-hub/vyra-production/pull/556) |
| Samurai | `catalog:battlemvp:samurai` | ✓ | ✓ | 2026-10-01 | [#556](https://github.com/davidyakoop88-hub/vyra-production/pull/556) |
| Royal Ribbon | `catalog:battlemvp:frame:royal-ribbon` | ✓ | ✓ | 2026-10-01 | [#556](https://github.com/davidyakoop88-hub/vyra-production/pull/556) |
| Laurel Star | `catalog:battlemvp:frame:laurel-star` | ✓ | ✓ | 2026-10-01 | [#556](https://github.com/davidyakoop88-hub/vyra-production/pull/556) |
| Dark Wings | `catalog:battlemvp:frame:dark-wings` | ✓ | ✓ | 2026-10-01 | [#556](https://github.com/davidyakoop88-hub/vyra-production/pull/556) |
| Dragon Fire | `catalog:battlemvp:frame:dragon-fire` | ✓ | ✓ | 2026-10-01 | [#556](https://github.com/davidyakoop88-hub/vyra-production/pull/556) |
| Nautical Helm | `catalog:battlemvp:frame:nautical-helm` | ✓ | ✓ | 2026-10-01 | [#556](https://github.com/davidyakoop88-hub/vyra-production/pull/556) |
| Shadow Star | `catalog:battlemvp:frame:shadow-star` | ✓ | ✓ | 2026-10-01 | [#556](https://github.com/davidyakoop88-hub/vyra-production/pull/556) |

### BATTLE MVP · FIRANDE · 8 KOREOGRAFIER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Guldkrona | `catalog:battlemvp:celebration:gold-ribbon` | ✓ | ✓ | 2026-09-11 | — |
| Lion Clash | `catalog:battlemvp:celebration:lion-clash` | ✓ | ✓ | 2026-09-11 | — |
| Kröningen | `catalog:battlemvp:celebration:coronation` | ✓ | ✓ | 2026-09-11 | — |
| Vingar | `catalog:battlemvp:celebration:wings` | ✓ | ✓ | 2026-09-11 | — |
| Energiportalen | `catalog:battlemvp:celebration:portal` | ✓ | ✓ | 2026-09-11 | — |
| Roséguld | `catalog:battlemvp:celebration:rosegold` | ✓ | ✓ | 2026-09-11 | — |
| Pärlvingar | `catalog:battlemvp:celebration:pearl` | ✓ | ✓ | 2026-09-11 | — |
| Lavendelmåne | `catalog:battlemvp:celebration:moon` | ✓ | ✓ | 2026-09-11 | — |

### Koi Pearl Lagoon · VIDEO FX

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Koi Pearl Lagoon · hela paketet | `catalog:glovesnipe:koiPearl:pack:2` | — ⚠️ | ✓ | 2026-08-03 | — |

### Masquerade Ball · VIDEO FX

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Masquerade Ball · hela paketet | `catalog:glovesnipe:masquerade:pack:2` | — ⚠️ | ✓ | 2026-08-03 | — |

### Pink Princess · VIDEO FX

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Pink Princess · hela paketet | `catalog:glovesnipe:pinkPrincess:pack:2` | — ⚠️ | ✓ | 2026-08-03 | — |

### Royal Ruby · VIDEO FX

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Royal Ruby · hela paketet | `catalog:glovesnipe:royalRuby:pack:2` | — ⚠️ | ✓ | 2026-08-03 | — |

### Cloud Fox · VIDEO FX

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Cloud Fox · hela paketet | `catalog:glovesnipe:cloudFox:pack:2` | — ⚠️ | ✓ | 2026-08-03 | — |

### NEW FOLLOWER ALERT · 3 TEMAN

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Follower Spotlight · Gold | `catalog:followeralert:gold` | ✓ | ✓ | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |
| Follower Spotlight · Ocean | `catalog:followeralert:ocean` | ✓ | ✓ | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |
| Follower Spotlight · Blush | `catalog:followeralert:blush` | ✓ | ✓ | 2026-10-11 | [#587](https://github.com/davidyakoop88-hub/vyra-production/pull/587) |

### GIFTER LEVEL UP · VARJE MODELL SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Modell 1 · Profil i orbit | `catalog:gifterlevel:profile` | ✓ | ✓ | 2026-08-20 | — |
| Modell 2 · Stort nivånummer | `catalog:gifterlevel:number` | ✓ | ✓ | 2026-08-20 | — |
| Modell 3 · Diamantstapel | `catalog:gifterlevel:stack` | ✓ | ✓ | 2026-08-20 | — |
| Modell 4 · Sidobadge | `catalog:gifterlevel:sidebadge` | ✓ | ✓ | 2026-08-20 | — |
| Modell 5 · Diamantreveal | `catalog:gifterlevel:reveal` | ✓ | ✓ | 2026-08-20 | — |
| Modell 6 · Orbitnivå | `catalog:gifterlevel:orbitlevel` | ✓ | ✓ | 2026-08-20 | — |
| Modell 7 · Stigande nivåer | `catalog:gifterlevel:risingtier` | ✓ | ✓ | 2026-08-20 | — |
| Modell 8 · Myntvändning | `catalog:gifterlevel:flip` | ✓ | ✓ | 2026-08-20 | — |
| Modell 9 · Kompakt duo | `catalog:gifterlevel:duo` | ✓ | ✓ | 2026-08-20 | — |

### FAN LEVEL UP · 8 MODELLER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Fan Level Up · Hero Card | `catalog:fanlevel:layout:hero` | ✓ | ✓ | 2026-08-12 | — |
| Fan Level Up · Original Fan Stack | `catalog:fanlevel:layout:stack` | ✓ | ✓ | 2026-08-12 | — |
| Fan Level Up · Heartbeat Side | `catalog:fanlevel:layout:heartbeat` | ✓ | ✓ | 2026-08-12 | — |
| Fan Level Up · Fan Badge Reveal | `catalog:fanlevel:layout:badgereveal` | ✓ | ✓ | 2026-08-12 | — |
| Fan Level Up · Loyalty Ring | `catalog:fanlevel:layout:loyalty` | ✓ | ✓ | 2026-08-12 | — |
| Fan Level Up · Rising Hearts | `catalog:fanlevel:layout:hearts` | ✓ | ✓ | 2026-08-12 | — |
| Fan Level Up · Welcome Ribbon | `catalog:fanlevel:layout:ribbon` | ✓ | ✓ | 2026-08-12 | — |
| Fan Level Up · Community Duo | `catalog:fanlevel:layout:duo` | ✓ | ✓ | 2026-08-12 | — |

### HEART ME GOAL · VARJE TEMA SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Heart Me Goal · Classic | `catalog:heartgoal:classic` | ✓ | ✓ | 2026-08-03 | — |
| Heart Me Goal · Dark | `catalog:heartgoal:dark` | ✓ | ✓ | 2026-08-03 | — |
| Heart Me Goal · Emerald | `catalog:heartgoal:emerald` | ✓ | ✓ | 2026-08-03 | — |
| Heart Me Goal · Galaxy | `catalog:heartgoal:galaxy` | ✓ | ✓ | 2026-08-03 | — |
| Heart Me Goal · Golden | `catalog:heartgoal:golden` | ✓ | ✓ | 2026-08-03 | — |
| Heart Me Goal · Ice | `catalog:heartgoal:ice` | ✓ | ✓ | 2026-08-03 | — |
| Heart Me Goal · Neon | `catalog:heartgoal:neon` | ✓ | ✓ | 2026-08-03 | — |
| Heart Me Goal · Ocean | `catalog:heartgoal:ocean` | ✓ | ✓ | 2026-08-03 | — |
| Heart Me Goal · Sakura | `catalog:heartgoal:sakura` | ✓ | ✓ | 2026-08-03 | — |
| Heart Me Goal · Frost | `catalog:heartgoal:frost` | ✓ | ✓ | 2026-08-03 | — |
| Heart Me Goal · Midnight | `catalog:heartgoal:midnight` | ✓ | ✓ | 2026-08-03 | — |
| Heart Me Goal · Citrus | `catalog:heartgoal:citrus` | ✓ | ✓ | 2026-08-03 | — |

### TOP GIFTER · DESIGNVAL

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Royal Gold | `catalog:topgift:premium:royal` | — ⚠️ | ✓ | 2026-10-01 | [#558](https://github.com/davidyakoop88-hub/vyra-production/pull/558) |
| Neon Purple | `catalog:topgift:premium:neon` | — ⚠️ | ✓ | 2026-10-01 | [#558](https://github.com/davidyakoop88-hub/vyra-production/pull/558) |
| Top Gifter Podium · Kodad ram | `catalog:pgpodium:none` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Gifter Podium · Royal Phoenix | `catalog:pgpodium:royal-phoenix` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Gifter Podium · Obsidian Dragon | `catalog:pgpodium:obsidian-dragon` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Gifter Podium · Gilded Lion | `catalog:pgpodium:gilded-lion` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Gifter Podium · Frostfire Crown | `catalog:pgpodium:frostfire-crown` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Gifter Podium · Diamond Halo | `catalog:pgpodium:diamond-halo` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Gifter Podium · Midnight Butterfly | `catalog:pgpodium:midnight-butterfly` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Gifter Podium · Thunder Warden | `catalog:pgpodium:thunder-warden` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Gifter Podium · Stellar Emperor | `catalog:pgpodium:stellar-emperor` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Gifter Podium · Ocean Oracle | `catalog:pgpodium:ocean-oracle` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Gifter Podium · Moonlit Sakura | `catalog:pgpodium:moonlit-sakura` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Gifter Podium · Celestial Serpent | `catalog:pgpodium:celestial-serpent` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |
| Top Gifter Podium · Neon Valkyrie | `catalog:pgpodium:neon-valkyrie` | — ⚠️ | ✓ | 2026-10-08 | [#574](https://github.com/davidyakoop88-hub/vyra-production/pull/574) |

### SKATTKISTA · LIVE

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Skattkista | `catalog:skattkista:kista` | ✓ | ✓ | 2026-09-27 | [#535](https://github.com/davidyakoop88-hub/vyra-production/pull/535) |
| Skattkista · rad | `catalog:skattkista:pill` | ✓ | ✓ | 2026-09-27 | [#535](https://github.com/davidyakoop88-hub/vyra-production/pull/535) |

### LÅTÖNSKNINGAR · LIVE

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Låtönskningar · YouTube | `catalog:latonskningar:youtube` | ✓ | ✓ | 2026-09-27 | [#536](https://github.com/davidyakoop88-hub/vyra-production/pull/536) |
| Låtönskningar · Spotify | `catalog:latonskningar:spotify` | ✓ | ✓ | 2026-09-27 | [#536](https://github.com/davidyakoop88-hub/vyra-production/pull/536) |

