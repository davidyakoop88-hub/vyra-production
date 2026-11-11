# Sanningens karta · widgetkatalogen

<!-- AUTO-GENERERAD. Redigera inte for hand. Kor `npm run karta`. -->

Genererad ur den **korande** katalogen i en riktig webblasare, inte ur kallkoden.
Det ar sjalva poangen: rubriker som pastod fel antal, knappar utan katalognyckel och
tva sektioner som aldrig byggdes sag alla korrekta ut i koden. Det syns bara nar man
startar sidan och raknar.

Commit: `6331c986`

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
| Kort totalt | **174** |
| Sektioner | 32 |
| Med katalognyckel | 174 / 174 |
| Med shadow DOM-miniatyr | 142 / 174  ⚠️ |
| Ritar sin design | 174 / 174 |
| Tandningsregel i dokumentet | 0  (ska vara 0) |
| Layout rord av katalogen | 0 i minnet, 0 pa disk  (ska vara 0/0) |

Tandningsregeln for alerts bor i en shadow root och far inte finnas i
`document.styleSheets` — dar kunde den na overlayen. Se `tests/browser/thumb-leak.browser.test.js`.

## Per sektion

| Sektion | Kort | Nyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|---|
| RANKING · SAMMA DESIGN FÖR TOP LIKE, TOP COINS OCH TOP POINTS | 20 | 20/20 | 20/20 | 20/20 | 2026-11-11 | — |
| VYRA TOP STREAK | 4 | 4/4 | 0/4 ⚠️ | 4/4 | 2026-10-19 | [#661](https://github.com/davidyakoop88-hub/vyra-production/pull/661) |
| FOLLOWER, LIKE & DIAMOND GOALS · 18 RÖRLIGA DESIGNER | 18 | 18/18 | 9/18 ⚠️ | 18/18 | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| FAN LEVEL 50 · MILSTOLPE | 1 | 1/1 | 1/1 | 1/1 | 2026-10-20 | [#666](https://github.com/davidyakoop88-hub/vyra-production/pull/666) |
| FIREWORKS & BUBBLES · 2 DESIGNER | 2 | 2/2 | 2/2 | 2/2 | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| EGET INNEHÅLL | 3 | 3/3 | 3/3 | 3/3 | 2026-11-07 | [#739](https://github.com/davidyakoop88-hub/vyra-production/pull/739) |
| LAST-X ALERTS · VARJE DESIGN SEPARAT | 11 | 11/11 | 11/11 | 11/11 | 2026-10-19 | [#656](https://github.com/davidyakoop88-hub/vyra-production/pull/656) |
| GIFT JAR · VARJE MODELL SEPARAT | 5 | 5/5 | 5/5 | 5/5 | 2026-10-20 | [#664](https://github.com/davidyakoop88-hub/vyra-production/pull/664) |
| GUARDIAN EMBLEM | 2 | 2/2 | 2/2 | 2/2 | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |
| GIFT CAMPAIGN · LJUS OCH RÖRELSE | 6 | 6/6 | 6/6 | 6/6 | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| GIFT CAMPAIGN · EN GÅVA I FOKUS | 6 | 6/6 | 6/6 | 6/6 | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| LIKE FOUNTAIN | 1 | 1/1 | 1/1 | 1/1 | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| BATTLE MVP · 6 DESIGNER | 6 | 6/6 | 6/6 | 6/6 | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| BATTLE MVP · FIRANDE · 2 KOREOGRAFIER | 2 | 2/2 | 2/2 | 2/2 | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Battle-paket · VIDEO FX · 3 paket | 3 | 3/3 | 0/3 ⚠️ | 3/3 | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| NEW FOLLOWER ALERT · 3 TEMAN | 3 | 3/3 | 3/3 | 3/3 | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |
| GIFTER LEVEL UP · VARJE MODELL SEPARAT | 9 | 9/9 | 9/9 | 9/9 | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |
| FAN LEVEL UP · 14 MODELLER | 14 | 14/14 | 14/14 | 14/14 | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |
| HEART ME GOAL · VARJE TEMA SEPARAT | 12 | 12/12 | 12/12 | 12/12 | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| TOP GIFT · DESIGNVAL | 4 | 4/4 | 1/4 ⚠️ | 4/4 | 2026-10-19 | [#655](https://github.com/davidyakoop88-hub/vyra-production/pull/655) |
| TOP GIFTERS PODIUM · VARJE RAM SEPARAT | 13 | 13/13 | 0/13 ⚠️ | 13/13 | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| BOXGAME | 1 | 1/1 | 1/1 | 1/1 | 2026-10-25 | [#706](https://github.com/davidyakoop88-hub/vyra-production/pull/706) |
| HJÄRTAN & MOLN | 9 | 9/9 | 9/9 | 9/9 | 2026-10-25 | [#709](https://github.com/davidyakoop88-hub/vyra-production/pull/709) |
| BERTIL PAKET | 1 | 1/1 | 1/1 | 1/1 | 2026-11-09 | — |
| CHATTAVATAR | 2 | 2/2 | 2/2 | 2/2 | 2026-11-09 | — |
| VIEWER SHOWCASE | 3 | 3/3 | 3/3 | 3/3 | 2026-11-08 | [#742](https://github.com/davidyakoop88-hub/vyra-production/pull/742) |
| ENERGIMÄTARE | 3 | 3/3 | 3/3 | 3/3 | 2026-11-08 | [#744](https://github.com/davidyakoop88-hub/vyra-production/pull/744) |
| ORDJAKTEN | 1 | 1/1 | 1/1 | 1/1 | 2026-11-09 | — |
| QUIZ | 3 | 3/3 | 3/3 | 3/3 | 2026-11-08 | [#744](https://github.com/davidyakoop88-hub/vyra-production/pull/744) |
| SOCIAL-ALERT | 2 | 2/2 | 2/2 | 2/2 | 2026-10-25 | [#707](https://github.com/davidyakoop88-hub/vyra-production/pull/707) |
| SKATTKISTA · LIVE | 2 | 2/2 | 2/2 | 2/2 | 2026-10-21 | [#676](https://github.com/davidyakoop88-hub/vyra-production/pull/676) |
| LÅTÖNSKNINGAR · LIVE | 2 | 2/2 | 2/2 | 2/2 | 2026-10-21 | [#676](https://github.com/davidyakoop88-hub/vyra-production/pull/676) |

## Varje kort

### RANKING · SAMMA DESIGN FÖR TOP LIKE, TOP COINS OCH TOP POINTS

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Top Like | `catalog:toplike:voltage` | ✓ | ✓ | 2026-11-11 | — |
| Top Coins | `catalog:ranking:templateTopCoins:voltage` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Top Points | `catalog:ranking:templateTopPoints:voltage` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Top Like | `catalog:toplike:basic-v2` | ✓ | ✓ | 2026-11-11 | — |
| Top Coins | `catalog:ranking:templateTopCoins:basic-v2` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Top Points | `catalog:ranking:templateTopPoints:basic-v2` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Top Like | `catalog:toplike:prism-vertical` | ✓ | ✓ | 2026-11-11 | — |
| Top Coins | `catalog:ranking:templateTopCoins:prism-vertical` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Top Points | `catalog:ranking:templateTopPoints:prism-vertical` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Top Like | `catalog:toplike:prism-horizontal` | ✓ | ✓ | 2026-11-11 | — |
| Top Coins | `catalog:ranking:templateTopCoins:prism-horizontal` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Top Points | `catalog:ranking:templateTopPoints:prism-horizontal` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Top Like | `catalog:toplike:metall` | ✓ | ✓ | 2026-11-11 | — |
| Top Coins | `catalog:ranking:templateTopCoins:metall` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Top Points | `catalog:ranking:templateTopPoints:metall` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Top Like | `catalog:toplike:ljusring` | ✓ | ✓ | 2026-11-11 | — |
| Top Like | `catalog:toplike:ljusring:liggande` | ✓ | ✓ | 2026-11-11 | — |
| Top Like | `catalog:toplike:ljusring:staende` | ✓ | ✓ | 2026-11-11 | — |
| Top Like | `catalog:toplike:ljusring:vanster` | ✓ | ✓ | 2026-11-11 | — |
| Top Like | `catalog:toplike:ljusring:hoger` | ✓ | ✓ | 2026-11-11 | — |

### VYRA TOP STREAK

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Clean Flip | `catalog:topstreak` | — ⚠️ | ✓ | 2026-10-19 | [#661](https://github.com/davidyakoop88-hub/vyra-production/pull/661) |
| Top Streak · Design 1 | `catalog:topstreak:design:1` | — ⚠️ | ✓ | 2026-10-19 | [#661](https://github.com/davidyakoop88-hub/vyra-production/pull/661) |
| Top Streak · Design 2 | `catalog:topstreak:design:2` | — ⚠️ | ✓ | 2026-10-19 | [#661](https://github.com/davidyakoop88-hub/vyra-production/pull/661) |
| Top Streak · Design 3 | `catalog:topstreak:design:3` | — ⚠️ | ✓ | 2026-10-19 | [#661](https://github.com/davidyakoop88-hub/vyra-production/pull/661) |

### FOLLOWER, LIKE & DIAMOND GOALS · 18 RÖRLIGA DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Crown Orbit | `catalog:socialgoal:followers:crown-orbit:circle` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Crown Rail | `catalog:socialgoal:followers:crown-rail:landscape` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Crown Tower | `catalog:socialgoal:followers:crown-tower:portrait` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Heart Orbit | `catalog:socialgoal:likes:heart-orbit:circle` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Heart Rail | `catalog:socialgoal:likes:heart-rail:landscape` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Heart Tower | `catalog:socialgoal:likes:heart-tower:portrait` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Diamond Orbit | `catalog:socialgoal:diamonds:diamond-orbit:circle` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Diamond Rail | `catalog:socialgoal:diamonds:diamond-rail:landscape` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Diamond Tower | `catalog:socialgoal:diamonds:diamond-tower:portrait` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Goal Pro · Rak bar | `catalog:pggoal:1` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Goal Pro · Pill | `catalog:pggoal:2` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Goal Pro · Ring | `catalog:pggoal:3` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Goal Pro · Mätare | `catalog:pggoal:4` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Goal Pro · Steg | `catalog:pggoal:5` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Goal Pro · Bara siffra | `catalog:pggoal:6` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Goal Pro · Stående | `catalog:pggoal:7` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Goal Pro · Smal med pil | `catalog:pggoal:8` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Goal Pro · Stående pill | `catalog:pggoal:9` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |

### FAN LEVEL 50 · MILSTOLPE

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Fan Level 50 | `catalog:fanlevel50:royal` | ✓ | ✓ | 2026-10-20 | [#666](https://github.com/davidyakoop88-hub/vyra-production/pull/666) |

### FIREWORKS & BUBBLES · 2 DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Supernova | `catalog:giftfireworks:supernova` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Gift Bubbles | `catalog:giftbubbles` | ✓ | ✓ | 2026-10-20 | [#663](https://github.com/davidyakoop88-hub/vyra-production/pull/663) |

### EGET INNEHÅLL

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Text | `catalog:custom:text` | ✓ | ✓ | 2026-11-07 | [#739](https://github.com/davidyakoop88-hub/vyra-production/pull/739) |
| Bild | `catalog:custom:image` | ✓ | ✓ | 2026-11-07 | [#739](https://github.com/davidyakoop88-hub/vyra-production/pull/739) |
| Video | `catalog:custom:video` | ✓ | ✓ | 2026-11-07 | [#739](https://github.com/davidyakoop88-hub/vyra-production/pull/739) |

### LAST-X ALERTS · VARJE DESIGN SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Last-X · Card | `catalog:lastx:card` | ✓ | ✓ | 2026-10-19 | [#656](https://github.com/davidyakoop88-hub/vyra-production/pull/656) |
| Last-X · Stack | `catalog:lastx:stack` | ✓ | ✓ | 2026-10-19 | [#656](https://github.com/davidyakoop88-hub/vyra-production/pull/656) |
| Last-X · Skew | `catalog:lastx:skew` | ✓ | ✓ | 2026-10-19 | [#656](https://github.com/davidyakoop88-hub/vyra-production/pull/656) |
| Last-X · Badge | `catalog:lastx:badge` | ✓ | ✓ | 2026-10-19 | [#656](https://github.com/davidyakoop88-hub/vyra-production/pull/656) |
| Last-X · Royal Coronation | `catalog:lastx:royal` | ✓ | ✓ | 2026-10-19 | [#656](https://github.com/davidyakoop88-hub/vyra-production/pull/656) |
| Last-X · Crown Banner | `catalog:lastx:crownBanner` | ✓ | ✓ | 2026-10-19 | [#656](https://github.com/davidyakoop88-hub/vyra-production/pull/656) |
| Last-X · Royal Amethyst | `catalog:lastx:royalAmethyst` | ✓ | ✓ | 2026-10-19 | [#656](https://github.com/davidyakoop88-hub/vyra-production/pull/656) |
| Last-X · Ice King | `catalog:lastx:iceKing` | ✓ | ✓ | 2026-10-19 | [#656](https://github.com/davidyakoop88-hub/vyra-production/pull/656) |
| Last-X · Neon Cyber | `catalog:lastx:neonCyber` | ✓ | ✓ | 2026-10-19 | [#656](https://github.com/davidyakoop88-hub/vyra-production/pull/656) |
| Last-X · Dragon Flame | `catalog:lastx:dragonFlame` | ✓ | ✓ | 2026-10-19 | [#656](https://github.com/davidyakoop88-hub/vyra-production/pull/656) |
| Last-X · Angel Gold | `catalog:lastx:angelGold` | ✓ | ✓ | 2026-10-19 | [#656](https://github.com/davidyakoop88-hub/vyra-production/pull/656) |

### GIFT JAR · VARJE MODELL SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Royal Lion | `catalog:giftjar:lion` | ✓ | ✓ | 2026-10-20 | [#664](https://github.com/davidyakoop88-hub/vyra-production/pull/664) |
| Ember Dragon | `catalog:giftjar:dragon` | ✓ | ✓ | 2026-10-20 | [#664](https://github.com/davidyakoop88-hub/vyra-production/pull/664) |
| Phoenix Rise | `catalog:giftjar:phoenix` | ✓ | ✓ | 2026-10-20 | [#664](https://github.com/davidyakoop88-hub/vyra-production/pull/664) |
| Midnight Panther | `catalog:giftjar:panther` | ✓ | ✓ | 2026-10-20 | [#664](https://github.com/davidyakoop88-hub/vyra-production/pull/664) |
| Sapphire Peacock | `catalog:giftjar:peacock` | ✓ | ✓ | 2026-10-20 | [#664](https://github.com/davidyakoop88-hub/vyra-production/pull/664) |

### GUARDIAN EMBLEM

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Blå kristall | `catalog:guardianemblem:model:sapphire` | ✓ | ✓ | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |
| Grön aura | `catalog:guardianemblem:model:emerald` | ✓ | ✓ | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |

### GIFT CAMPAIGN · LJUS OCH RÖRELSE

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Fokus | `catalog:giftcampaign:fokus:landscape` | ✓ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| Fokus | `catalog:giftcampaign:fokus:portrait` | ✓ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| Classic | `catalog:giftcampaign:classic:landscape` | ✓ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| Classic | `catalog:giftcampaign:classic:portrait` | ✓ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| Gåvoflöde | `catalog:giftcampaign:flode:landscape` | ✓ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| Gåvoflöde | `catalog:giftcampaign:flode:portrait` | ✓ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |

### GIFT CAMPAIGN · EN GÅVA I FOKUS

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Fokus | `catalog:giftcampaign:fokus:landscape` | ✓ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| Fokus | `catalog:giftcampaign:fokus:portrait` | ✓ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| Classic | `catalog:giftcampaign:classic:landscape` | ✓ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| Classic | `catalog:giftcampaign:classic:portrait` | ✓ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| Gåvoflöde | `catalog:giftcampaign:flode:landscape` | ✓ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| Gåvoflöde | `catalog:giftcampaign:flode:portrait` | ✓ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |

### LIKE FOUNTAIN

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Like Fountain | `catalog:likefountain` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |

### BATTLE MVP · 6 DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Inferno | `catalog:battlemvp:inferno` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Royal | `catalog:battlemvp:royal` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Cyber | `catalog:battlemvp:cyber` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Storm | `catalog:battlemvp:storm` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Aurora | `catalog:battlemvp:aurora` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Samurai | `catalog:battlemvp:samurai` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |

### BATTLE MVP · FIRANDE · 2 KOREOGRAFIER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Guldkrona | `catalog:battlemvp:celebration:gold-ribbon` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |
| Lion Clash | `catalog:battlemvp:celebration:lion-clash` | ✓ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |

### Battle-paket · VIDEO FX · 3 paket

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Pink Princess · hela paketet | `catalog:glovesnipe:pinkPrincess:pack:2` | — ⚠️ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| Royal Ruby · hela paketet | `catalog:glovesnipe:royalRuby:pack:2` | — ⚠️ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |
| Cloud Fox · hela paketet | `catalog:glovesnipe:cloudFox:pack:2` | — ⚠️ | ✓ | 2026-11-07 | [#738](https://github.com/davidyakoop88-hub/vyra-production/pull/738) |

### NEW FOLLOWER ALERT · 3 TEMAN

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Follower Spotlight · Gold | `catalog:followeralert:gold` | ✓ | ✓ | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |
| Follower Spotlight · Ocean | `catalog:followeralert:ocean` | ✓ | ✓ | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |
| Follower Spotlight · Blush | `catalog:followeralert:blush` | ✓ | ✓ | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |

### GIFTER LEVEL UP · VARJE MODELL SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Modell 1 · Profil i orbit | `catalog:gifterlevel:profile` | ✓ | ✓ | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |
| Modell 2 · Stort nivånummer | `catalog:gifterlevel:number` | ✓ | ✓ | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |
| Modell 3 · Diamantstapel | `catalog:gifterlevel:stack` | ✓ | ✓ | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |
| Modell 4 · Sidobadge | `catalog:gifterlevel:sidebadge` | ✓ | ✓ | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |
| Modell 5 · Diamantreveal | `catalog:gifterlevel:reveal` | ✓ | ✓ | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |
| Modell 6 · Orbitnivå | `catalog:gifterlevel:orbitlevel` | ✓ | ✓ | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |
| Modell 7 · Stigande nivåer | `catalog:gifterlevel:risingtier` | ✓ | ✓ | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |
| Modell 8 · Myntvändning | `catalog:gifterlevel:flip` | ✓ | ✓ | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |
| Modell 9 · Kompakt duo | `catalog:gifterlevel:duo` | ✓ | ✓ | 2026-10-19 | [#657](https://github.com/davidyakoop88-hub/vyra-production/pull/657) |

### FAN LEVEL UP · 14 MODELLER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Fan Level Up · Hero Card | `catalog:fanlevel:layout:hero` | ✓ | ✓ | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |
| Fan Level Up · Original Fan Stack | `catalog:fanlevel:layout:stack` | ✓ | ✓ | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |
| Fan Level Up · Heartbeat Side | `catalog:fanlevel:layout:heartbeat` | ✓ | ✓ | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |
| Fan Level Up · Fan Badge Reveal | `catalog:fanlevel:layout:badgereveal` | ✓ | ✓ | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |
| Fan Level Up · Loyalty Ring | `catalog:fanlevel:layout:loyalty` | ✓ | ✓ | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |
| Fan Level Up · Rising Hearts | `catalog:fanlevel:layout:hearts` | ✓ | ✓ | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |
| Fan Level Up · Welcome Ribbon | `catalog:fanlevel:layout:ribbon` | ✓ | ✓ | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |
| Fan Level Up · Community Duo | `catalog:fanlevel:layout:duo` | ✓ | ✓ | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |
| Fan Level Up · Ascend | `catalog:fanlevel:layout:ascend` | ✓ | ✓ | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |
| Fan Level Up · Heart Reveal | `catalog:fanlevel:layout:heartreveal` | ✓ | ✓ | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |
| Fan Level Up · Hjärtats gåva | `catalog:fanlevel:layout:heartgift` | ✓ | ✓ | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |
| Fan Level Up · Golden Stage | `catalog:fanlevel:layout:goldenstage` | ✓ | ✓ | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |
| Fan Level Up · Heart Lift | `catalog:fanlevel:layout:heartlift` | ✓ | ✓ | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |
| Fan Level Up · Luminous | `catalog:fanlevel:layout:luminous` | ✓ | ✓ | 2026-11-06 | [#732](https://github.com/davidyakoop88-hub/vyra-production/pull/732) |

### HEART ME GOAL · VARJE TEMA SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Heart Me Goal · Classic | `catalog:heartgoal:classic` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Heart Me Goal · Dark | `catalog:heartgoal:dark` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Heart Me Goal · Emerald | `catalog:heartgoal:emerald` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Heart Me Goal · Galaxy | `catalog:heartgoal:galaxy` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Heart Me Goal · Golden | `catalog:heartgoal:golden` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Heart Me Goal · Ice | `catalog:heartgoal:ice` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Heart Me Goal · Neon | `catalog:heartgoal:neon` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Heart Me Goal · Ocean | `catalog:heartgoal:ocean` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Heart Me Goal · Sakura | `catalog:heartgoal:sakura` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Heart Me Goal · Frost | `catalog:heartgoal:frost` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Heart Me Goal · Midnight | `catalog:heartgoal:midnight` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |
| Heart Me Goal · Citrus | `catalog:heartgoal:citrus` | ✓ | ✓ | 2026-10-19 | [#660](https://github.com/davidyakoop88-hub/vyra-production/pull/660) |

### TOP GIFT · DESIGNVAL

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Top Gift · Design 1 | `catalog:topgift:premium:neon` | — ⚠️ | ✓ | 2026-10-19 | [#655](https://github.com/davidyakoop88-hub/vyra-production/pull/655) |
| Top Gift · Design 2 | `catalog:topgift:premium:royal` | — ⚠️ | ✓ | 2026-10-19 | [#655](https://github.com/davidyakoop88-hub/vyra-production/pull/655) |
| Top Gift · Design 3 | `catalog:topgift:premium:fokus` | ✓ | ✓ | 2026-10-19 | [#655](https://github.com/davidyakoop88-hub/vyra-production/pull/655) |
| Top Gift · Design 4 | `catalog:ranking:templateTopCoins:signal-orbit` | — ⚠️ | ✓ | 2026-11-04 | [#727](https://github.com/davidyakoop88-hub/vyra-production/pull/727) |

### TOP GIFTERS PODIUM · VARJE RAM SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Top Gifter Podium · Kodad ram | `catalog:pgpodium:none` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Top Gifter Podium · Royal Phoenix | `catalog:pgpodium:royal-phoenix` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Top Gifter Podium · Obsidian Dragon | `catalog:pgpodium:obsidian-dragon` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Top Gifter Podium · Gilded Lion | `catalog:pgpodium:gilded-lion` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Top Gifter Podium · Frostfire Crown | `catalog:pgpodium:frostfire-crown` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Top Gifter Podium · Diamond Halo | `catalog:pgpodium:diamond-halo` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Top Gifter Podium · Midnight Butterfly | `catalog:pgpodium:midnight-butterfly` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Top Gifter Podium · Thunder Warden | `catalog:pgpodium:thunder-warden` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Top Gifter Podium · Stellar Emperor | `catalog:pgpodium:stellar-emperor` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Top Gifter Podium · Ocean Oracle | `catalog:pgpodium:ocean-oracle` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Top Gifter Podium · Moonlit Sakura | `catalog:pgpodium:moonlit-sakura` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Top Gifter Podium · Celestial Serpent | `catalog:pgpodium:celestial-serpent` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |
| Top Gifter Podium · Neon Valkyrie | `catalog:pgpodium:neon-valkyrie` | — ⚠️ | ✓ | 2026-10-19 | [#662](https://github.com/davidyakoop88-hub/vyra-production/pull/662) |

### BOXGAME

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Boxgame-klocka | `catalog:boxgame` | ✓ | ✓ | 2026-10-25 | [#706](https://github.com/davidyakoop88-hub/vyra-production/pull/706) |

### HJÄRTAN & MOLN

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Profilhjärtan | `catalog:heartcloud:profilhjartan` | ✓ | ✓ | 2026-10-25 | [#709](https://github.com/davidyakoop88-hub/vyra-production/pull/709) |
| Fallande hjärtan | `catalog:heartcloud:fallande` | ✓ | ✓ | 2026-10-25 | [#709](https://github.com/davidyakoop88-hub/vyra-production/pull/709) |
| Hjärtmoln | `catalog:heartcloud:hjartmoln` | ✓ | ✓ | 2026-10-25 | [#709](https://github.com/davidyakoop88-hub/vyra-production/pull/709) |
| Glödande hjärtmoln | `catalog:heartcloud:glodande` | ✓ | ✓ | 2026-10-25 | [#709](https://github.com/davidyakoop88-hub/vyra-production/pull/709) |
| Kristallhjärtan | `catalog:heartcloud:kristall` | ✓ | ✓ | 2026-10-25 | [#709](https://github.com/davidyakoop88-hub/vyra-production/pull/709) |
| Stjärnstoft | `catalog:heartcloud:stjarnstoft` | ✓ | ✓ | 2026-10-25 | [#709](https://github.com/davidyakoop88-hub/vyra-production/pull/709) |
| Blixtmoln | `catalog:heartcloud:blixt` | ✓ | ✓ | 2026-10-25 | [#709](https://github.com/davidyakoop88-hub/vyra-production/pull/709) |
| Organiskt moln | `catalog:heartcloud:organiskt` | ✓ | ✓ | 2026-10-25 | [#709](https://github.com/davidyakoop88-hub/vyra-production/pull/709) |
| Levande moln | `catalog:heartcloud:levande` | ✓ | ✓ | 2026-10-25 | [#709](https://github.com/davidyakoop88-hub/vyra-production/pull/709) |

### BERTIL PAKET

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Bertil paket | `catalog:vyrapaket:bertil` | ✓ | ✓ | 2026-11-09 | — |

### CHATTAVATAR

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Chattavatar | `catalog:vyrapaket:chattavatar` | ✓ | ✓ | 2026-11-09 | — |
| Chattavatar 2 · helkropp | `catalog:vyrapaket:chattavatar:2` | ✓ | ✓ | 2026-11-09 | — |

### VIEWER SHOWCASE

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Name Takeover | `catalog:vyrapaket:showcase:takeover` | ✓ | ✓ | 2026-11-08 | [#742](https://github.com/davidyakoop88-hub/vyra-production/pull/742) |
| Halo Reveal | `catalog:vyrapaket:showcase:halo` | ✓ | ✓ | 2026-11-08 | [#742](https://github.com/davidyakoop88-hub/vyra-production/pull/742) |
| Spotlight Slide | `catalog:vyrapaket:showcase:spotlight` | ✓ | ✓ | 2026-11-08 | [#742](https://github.com/davidyakoop88-hub/vyra-production/pull/742) |

### ENERGIMÄTARE

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Vital | `catalog:vyrapaket:energi:vital` | ✓ | ✓ | 2026-11-08 | [#744](https://github.com/davidyakoop88-hub/vyra-production/pull/744) |
| Arcade | `catalog:vyrapaket:energi:arcade` | ✓ | ✓ | 2026-11-08 | [#744](https://github.com/davidyakoop88-hub/vyra-production/pull/744) |
| Minimal | `catalog:vyrapaket:energi:minimal` | ✓ | ✓ | 2026-11-08 | [#744](https://github.com/davidyakoop88-hub/vyra-production/pull/744) |

### ORDJAKTEN

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Ordjakten | `catalog:vyrapaket:ordjakten` | ✓ | ✓ | 2026-11-09 | — |

### QUIZ

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Quiz · Frågerad | `catalog:vyrapaket:quiz:fragerad` | ✓ | ✓ | 2026-11-08 | [#744](https://github.com/davidyakoop88-hub/vyra-production/pull/744) |
| Quiz · Spelkort | `catalog:vyrapaket:quiz:spelkort` | ✓ | ✓ | 2026-11-08 | [#744](https://github.com/davidyakoop88-hub/vyra-production/pull/744) |
| Quiz · Quiz Show | `catalog:vyrapaket:quiz:quizshow` | ✓ | ✓ | 2026-11-08 | [#744](https://github.com/davidyakoop88-hub/vyra-production/pull/744) |

### SOCIAL-ALERT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Social-alert · 1 · Glanskort | `catalog:socialalert:glans` | ✓ | ✓ | 2026-10-25 | [#707](https://github.com/davidyakoop88-hub/vyra-production/pull/707) |
| Social-alert · 2 · Ikon som öppnas | `catalog:socialalert:kapsel` | ✓ | ✓ | 2026-10-25 | [#707](https://github.com/davidyakoop88-hub/vyra-production/pull/707) |

### SKATTKISTA · LIVE

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Skattkista | `catalog:skattkista:kista` | ✓ | ✓ | 2026-10-21 | [#676](https://github.com/davidyakoop88-hub/vyra-production/pull/676) |
| Skattkista · rad | `catalog:skattkista:pill` | ✓ | ✓ | 2026-10-21 | [#676](https://github.com/davidyakoop88-hub/vyra-production/pull/676) |

### LÅTÖNSKNINGAR · LIVE

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Låtönskningar · YouTube | `catalog:latonskningar:youtube` | ✓ | ✓ | 2026-10-21 | [#676](https://github.com/davidyakoop88-hub/vyra-production/pull/676) |
| Låtönskningar · Spotify | `catalog:latonskningar:spotify` | ✓ | ✓ | 2026-10-21 | [#676](https://github.com/davidyakoop88-hub/vyra-production/pull/676) |

