# Sanningens karta · widgetkatalogen

<!-- AUTO-GENERERAD. Redigera inte for hand. Kor `npm run karta`. -->

Genererad ur den **korande** katalogen i en riktig webblasare, inte ur kallkoden.
Det ar sjalva poangen: rubriker som pastod fel antal, knappar utan katalognyckel och
tva sektioner som aldrig byggdes sag alla korrekta ut i koden. Det syns bara nar man
startar sidan och raknar.

Commit: `b576311`

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
| Kort totalt | **189** |
| Sektioner | 22 |
| Med katalognyckel | 189 / 189 |
| Med shadow DOM-miniatyr | 189 / 189 |
| Ritar sin design | 189 / 189 |
| Tandningsregel i dokumentet | 0  (ska vara 0) |
| Layout rord av katalogen | 0 i minnet, 0 pa disk  (ska vara 0/0) |

Tandningsregeln for alerts bor i en shadow root och far inte finnas i
`document.styleSheets` — dar kunde den na overlayen. Se `tests/browser/thumb-leak.browser.test.js`.

## Per sektion

| Sektion | Kort | Nyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|---|
| VYRA TOP STREAK · CLEAN FLIP | 1 | 1/1 | 1/1 | 1/1 | 2026-09-20 | — |
| GIFT FIREWORKS · 5 DESIGNER | 5 | 5/5 | 5/5 | 5/5 | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| EGET INNEHÅLL | 3 | 3/3 | 3/3 | 3/3 | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| LAST-X ALERTS · VARJE DESIGN SEPARAT | 5 | 5/5 | 5/5 | 5/5 | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| TOP POINTS · 4 SEPARATA DESIGNER | 4 | 4/4 | 4/4 | 4/4 | 2026-09-21 | — |
| TOP COINS · 2 NYA DESIGNER | 2 | 2/2 | 2/2 | 2/2 | 2026-09-21 | — |
| GIFT JAR · VARJE MODELL SEPARAT | 5 | 5/5 | 5/5 | 5/5 | 2026-08-31 | [#274](https://github.com/davidyakoop88-hub/vyra-production/pull/274) |
| GUARDIAN EMBLEM | 6 | 6/6 | 6/6 | 6/6 | 2026-09-11 | [#403](https://github.com/davidyakoop88-hub/vyra-production/pull/403) |
| GIFT CAMPAIGN · LJUS OCH RÖRELSE | 6 | 6/6 | 6/6 | 6/6 | 2026-09-12 | — |
| LIKE FOUNTAIN | 1 | 1/1 | 1/1 | 1/1 | 2026-08-03 | — |
| BATTLE MVP · 17 DESIGNER | 17 | 17/17 | 17/17 | 17/17 | 2026-09-11 | — |
| BATTLE MVP · FIRANDE · 6 KOREOGRAFIER | 6 | 6/6 | 6/6 | 6/6 | 2026-09-11 | — |
| Koi Pearl Lagoon · VIDEO FX | 4 | 4/4 | 4/4 | 4/4 | 2026-08-03 | — |
| Masquerade Ball · VIDEO FX | 4 | 4/4 | 4/4 | 4/4 | 2026-08-03 | — |
| NEW FOLLOWER ALERT | 1 | 1/1 | 1/1 | 1/1 | 2026-08-03 | — |
| FOLLOWERS, LIKE & DIAMOND GOALS · 6 NYA DESIGNER | 6 | 6/6 | 6/6 | 6/6 | 2026-09-19 | — |
| GIFTER LEVEL UP · VARJE MODELL SEPARAT | 9 | 9/9 | 9/9 | 9/9 | 2026-08-20 | — |
| FAN LEVEL UP · 8 MODELLER | 8 | 8/8 | 8/8 | 8/8 | 2026-08-12 | — |
| HEART ME GOAL · VARJE TEMA SEPARAT | 12 | 12/12 | 12/12 | 12/12 | 2026-08-03 | — |
| TOP LIKE · VYRA ORIGINAL | 4 | 4/4 | 4/4 | 4/4 | 2026-09-20 | — |
| VYRA ORIGINAL · REDIGERBARA | 40 | 40/40 | 40/40 | 40/40 | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| TOP GIFTER · DESIGNVAL | 40 | 40/40 | 40/40 | 40/40 | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |

## Varje kort

### VYRA TOP STREAK · CLEAN FLIP

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Clean Flip | `catalog:topstreak` | ✓ | ✓ | 2026-09-20 | — |

### GIFT FIREWORKS · 5 DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Lila & guld | `catalog:giftfireworks:royal` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Isblå & silver | `catalog:giftfireworks:ice` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Roséguld | `catalog:giftfireworks:rose` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Kometspiral | `catalog:giftfireworks:comet` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |
| Supernova | `catalog:giftfireworks:supernova` | ✓ | ✓ | 2026-08-05 | [#83](https://github.com/davidyakoop88-hub/vyra-production/pull/83) |

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

### TOP POINTS · 4 SEPARATA DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Top Points · Stil 1 · Lista | `catalog:ranking:templateTopPoints:clean` | ✓ | ✓ | 2026-09-21 | — |
| Top Points · Stil 2 · Tre i mitten | `catalog:ranking:templateTopPoints:center` | ✓ | ✓ | 2026-09-21 | — |
| Top Points · Stil 3 · Podium | `catalog:ranking:templateTopPoints:podium` | ✓ | ✓ | 2026-09-21 | — |
| Top Points · Stil 4 · Neon | `catalog:ranking:templateTopPoints:neon` | ✓ | ✓ | 2026-09-21 | — |

### TOP COINS · 2 NYA DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Top Coins · Halo | `catalog:ranking:templateTopCoins:halo` | ✓ | ✓ | 2026-09-21 | — |
| Top Coins · Signal Orbit | `catalog:ranking:templateTopCoins:signal-orbit` | ✓ | ✓ | 2026-09-21 | — |

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
| Like Fountain | `catalog:likefountain` | ✓ | ✓ | 2026-08-03 | — |

### BATTLE MVP · 17 DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Inferno | `catalog:battlemvp:inferno` | ✓ | ✓ | 2026-09-11 | — |
| Royal | `catalog:battlemvp:royal` | ✓ | ✓ | 2026-09-11 | — |
| Cyber | `catalog:battlemvp:cyber` | ✓ | ✓ | 2026-09-11 | — |
| Ice | `catalog:battlemvp:ice` | ✓ | ✓ | 2026-09-11 | — |
| Storm | `catalog:battlemvp:storm` | ✓ | ✓ | 2026-09-11 | — |
| Aurora | `catalog:battlemvp:aurora` | ✓ | ✓ | 2026-09-11 | — |
| Samurai | `catalog:battlemvp:samurai` | ✓ | ✓ | 2026-09-11 | — |
| Royal Purple | `catalog:battlemvp:royal-purple` | ✓ | ✓ | 2026-09-11 | — |
| Neon Cyber | `catalog:battlemvp:neon-cyber` | ✓ | ✓ | 2026-09-11 | — |
| Diamond Elite | `catalog:battlemvp:diamond-elite` | ✓ | ✓ | 2026-09-11 | — |
| Gold Crown | `catalog:battlemvp:frame:gold-crown` | ✓ | ✓ | 2026-08-03 | — |
| Royal Ribbon | `catalog:battlemvp:frame:royal-ribbon` | ✓ | ✓ | 2026-08-03 | — |
| Laurel Star | `catalog:battlemvp:frame:laurel-star` | ✓ | ✓ | 2026-08-03 | — |
| Dark Wings | `catalog:battlemvp:frame:dark-wings` | ✓ | ✓ | 2026-08-03 | — |
| Dragon Fire | `catalog:battlemvp:frame:dragon-fire` | ✓ | ✓ | 2026-08-03 | — |
| Nautical Helm | `catalog:battlemvp:frame:nautical-helm` | ✓ | ✓ | 2026-08-03 | — |
| Shadow Star | `catalog:battlemvp:frame:shadow-star` | ✓ | ✓ | 2026-08-03 | — |

### BATTLE MVP · FIRANDE · 6 KOREOGRAFIER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Kröningen | `catalog:battlemvp:celebration:coronation` | ✓ | ✓ | 2026-09-11 | — |
| Vingar | `catalog:battlemvp:celebration:wings` | ✓ | ✓ | 2026-09-11 | — |
| Energiportalen | `catalog:battlemvp:celebration:portal` | ✓ | ✓ | 2026-09-11 | — |
| Roséguld | `catalog:battlemvp:celebration:rosegold` | ✓ | ✓ | 2026-09-11 | — |
| Pärlvingar | `catalog:battlemvp:celebration:pearl` | ✓ | ✓ | 2026-09-11 | — |
| Lavendelmåne | `catalog:battlemvp:celebration:moon` | ✓ | ✓ | 2026-09-11 | — |

### Koi Pearl Lagoon · VIDEO FX

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Koi X2 | `catalog:glovesnipe:koiPearl:boost:2` | ✓ | ✓ | 2026-08-03 | — |
| Koi X3 | `catalog:glovesnipe:koiPearl:boost:3` | ✓ | ✓ | 2026-08-03 | — |
| Koi Tap Tap | `catalog:glovesnipe:koiPearl:tap:2` | ✓ | ✓ | 2026-08-03 | — |
| Koi Glove | `catalog:glovesnipe:koiPearl:glove:2` | ✓ | ✓ | 2026-08-03 | — |

### Masquerade Ball · VIDEO FX

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Masquerade X2 | `catalog:glovesnipe:masquerade:boost:2` | ✓ | ✓ | 2026-08-03 | — |
| Masquerade X3 | `catalog:glovesnipe:masquerade:boost:3` | ✓ | ✓ | 2026-08-03 | — |
| Masquerade Tap Tap | `catalog:glovesnipe:masquerade:tap:2` | ✓ | ✓ | 2026-08-03 | — |
| Masquerade Glove | `catalog:glovesnipe:masquerade:glove:2` | ✓ | ✓ | 2026-08-03 | — |

### NEW FOLLOWER ALERT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Follower Spotlight | `catalog:followeralert` | ✓ | ✓ | 2026-08-03 | — |

### FOLLOWERS, LIKE & DIAMOND GOALS · 6 NYA DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Follower Goal · Pulse Rail | `catalog:socialgoal:followers:pulse-rail:landscape` | ✓ | ✓ | 2026-09-19 | — |
| Follower Goal · Pulse Tower | `catalog:socialgoal:followers:pulse-tower:portrait` | ✓ | ✓ | 2026-09-19 | — |
| Like Goal · Signal Ribbon | `catalog:socialgoal:likes:signal-ribbon:landscape` | ✓ | ✓ | 2026-09-19 | — |
| Like Goal · Heart Column | `catalog:socialgoal:likes:heart-column:portrait` | ✓ | ✓ | 2026-09-19 | — |
| Diamond Goal · Prism Core | `catalog:socialgoal:diamonds:prism-core:landscape` | ✓ | ✓ | 2026-09-19 | — |
| Diamond Goal · Prism Spine | `catalog:socialgoal:diamonds:prism-spine:portrait` | ✓ | ✓ | 2026-09-19 | — |

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

### TOP LIKE · VYRA ORIGINAL

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| VYRA Clean Bar | `catalog:toplike:clean-bar` | ✓ | ✓ | 2026-09-20 | — |
| VYRA Soft Stack | `catalog:toplike:soft-stack` | ✓ | ✓ | 2026-09-20 | — |
| VYRA Mini Podium | `catalog:toplike:mini-podium` | ✓ | ✓ | 2026-09-20 | — |
| VYRA Side Rank | `catalog:toplike:side-rank` | ✓ | ✓ | 2026-09-20 | — |

### VYRA ORIGINAL · REDIGERBARA

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Royal Gold | `catalog:topgift:royal` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Neon Purple | `catalog:topgift:neon` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Cyber Blue | `catalog:topgift:cyber` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Glass | `catalog:topgift:glass` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Sakura Pink | `catalog:topgift:extra:sakura` | ✓ | ✓ | 2026-08-03 | — |
| Inferno Fire | `catalog:topgift:extra:fire` | ✓ | ✓ | 2026-08-03 | — |
| Ice Crystal | `catalog:topgift:extra:ice` | ✓ | ✓ | 2026-08-03 | — |
| Galaxy | `catalog:topgift:extra:galaxy` | ✓ | ✓ | 2026-08-03 | — |
| Aurora | `catalog:topgift:extra:aurora` | ✓ | ✓ | 2026-08-03 | — |
| Retro Arcade | `catalog:topgift:extra:retro` | ✓ | ✓ | 2026-08-03 | — |
| Gold Rush | `catalog:topgift:extra:goldrush` | ✓ | ✓ | 2026-08-03 | — |
| Royal Coronation | `catalog:topgift:extra:coronation` | ✓ | ✓ | 2026-08-03 | — |
| Gifter · Royal Wings | `catalog:topgift:frame:royal-wings` | ✓ | ✓ | 2026-08-03 | — |
| Gifter · Crystal Spire | `catalog:topgift:frame:crystal-spire` | ✓ | ✓ | 2026-08-03 | — |
| Gifter · Angel Heart | `catalog:topgift:frame:angel-heart` | ✓ | ✓ | 2026-08-03 | — |
| Gifter · Dark Raven | `catalog:topgift:frame:dark-raven` | ✓ | ✓ | 2026-08-03 | — |
| Gifter · Frost Crystal | `catalog:topgift:frame:frost-crystal` | ✓ | ✓ | 2026-08-03 | — |
| Gifter · Rose Garden | `catalog:topgift:frame:rose-garden` | ✓ | ✓ | 2026-08-03 | — |
| Gifter · Luna Mist | `catalog:topgift:frame:luna-mist` | ✓ | ✓ | 2026-08-03 | — |
| Royal Gold | `catalog:topgift:premium:royal` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Neon Purple | `catalog:topgift:premium:neon` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Cyber Blue | `catalog:topgift:premium:cyber` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Glass | `catalog:topgift:premium:glass` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Sakura Pink | `catalog:topgift:premium:sakura` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Inferno Fire | `catalog:topgift:premium:fire` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Ice Crystal | `catalog:topgift:premium:ice` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Galaxy | `catalog:topgift:premium:galaxy` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Aurora | `catalog:topgift:premium:aurora` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Retro | `catalog:topgift:premium:retro` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Gold Rush | `catalog:topgift:premium:goldrush` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| VYRA Hall of Fame | `catalog:topgift:premium:hall` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Royal Throne | `catalog:topgift:premium:throne` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Celestial Champion | `catalog:topgift:premium:champion` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Diamond Pedestal | `catalog:topgift:premium:pedestal` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Celestial Arch | `catalog:topgift:premium:arch` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Phoenix Ribbon | `catalog:topgift:premium:phoenix` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Neon Signal | `catalog:topgift:premium:signal` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Celestial Fireworks | `catalog:topgift:premium:fireworks` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Crystal Bloom | `catalog:topgift:premium:bloom` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Royal Comet | `catalog:topgift:premium:comet` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |

### TOP GIFTER · DESIGNVAL

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Royal Gold | `catalog:topgift:royal` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Neon Purple | `catalog:topgift:neon` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Cyber Blue | `catalog:topgift:cyber` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Glass | `catalog:topgift:glass` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Sakura Pink | `catalog:topgift:extra:sakura` | ✓ | ✓ | 2026-08-03 | — |
| Inferno Fire | `catalog:topgift:extra:fire` | ✓ | ✓ | 2026-08-03 | — |
| Ice Crystal | `catalog:topgift:extra:ice` | ✓ | ✓ | 2026-08-03 | — |
| Galaxy | `catalog:topgift:extra:galaxy` | ✓ | ✓ | 2026-08-03 | — |
| Aurora | `catalog:topgift:extra:aurora` | ✓ | ✓ | 2026-08-03 | — |
| Retro Arcade | `catalog:topgift:extra:retro` | ✓ | ✓ | 2026-08-03 | — |
| Gold Rush | `catalog:topgift:extra:goldrush` | ✓ | ✓ | 2026-08-03 | — |
| Royal Coronation | `catalog:topgift:extra:coronation` | ✓ | ✓ | 2026-08-03 | — |
| Gifter · Royal Wings | `catalog:topgift:frame:royal-wings` | ✓ | ✓ | 2026-08-03 | — |
| Gifter · Crystal Spire | `catalog:topgift:frame:crystal-spire` | ✓ | ✓ | 2026-08-03 | — |
| Gifter · Angel Heart | `catalog:topgift:frame:angel-heart` | ✓ | ✓ | 2026-08-03 | — |
| Gifter · Dark Raven | `catalog:topgift:frame:dark-raven` | ✓ | ✓ | 2026-08-03 | — |
| Gifter · Frost Crystal | `catalog:topgift:frame:frost-crystal` | ✓ | ✓ | 2026-08-03 | — |
| Gifter · Rose Garden | `catalog:topgift:frame:rose-garden` | ✓ | ✓ | 2026-08-03 | — |
| Gifter · Luna Mist | `catalog:topgift:frame:luna-mist` | ✓ | ✓ | 2026-08-03 | — |
| Royal Gold | `catalog:topgift:premium:royal` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Neon Purple | `catalog:topgift:premium:neon` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Cyber Blue | `catalog:topgift:premium:cyber` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Glass | `catalog:topgift:premium:glass` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Sakura Pink | `catalog:topgift:premium:sakura` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Inferno Fire | `catalog:topgift:premium:fire` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Ice Crystal | `catalog:topgift:premium:ice` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Galaxy | `catalog:topgift:premium:galaxy` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Aurora | `catalog:topgift:premium:aurora` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Retro | `catalog:topgift:premium:retro` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Gold Rush | `catalog:topgift:premium:goldrush` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| VYRA Hall of Fame | `catalog:topgift:premium:hall` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Royal Throne | `catalog:topgift:premium:throne` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Celestial Champion | `catalog:topgift:premium:champion` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Diamond Pedestal | `catalog:topgift:premium:pedestal` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Celestial Arch | `catalog:topgift:premium:arch` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Phoenix Ribbon | `catalog:topgift:premium:phoenix` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Neon Signal | `catalog:topgift:premium:signal` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Celestial Fireworks | `catalog:topgift:premium:fireworks` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Crystal Bloom | `catalog:topgift:premium:bloom` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |
| Royal Comet | `catalog:topgift:premium:comet` | ✓ | ✓ | 2026-08-05 | [#82](https://github.com/davidyakoop88-hub/vyra-production/pull/82) |

