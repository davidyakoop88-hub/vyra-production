# Sanningens karta · widgetkatalogen

<!-- AUTO-GENERERAD. Redigera inte for hand. Kor `npm run karta`. -->

Genererad ur den **korande** katalogen i en riktig webblasare, inte ur kallkoden.
Det ar sjalva poangen: rubriker som pastod fel antal, knappar utan katalognyckel och
tva sektioner som aldrig byggdes sag alla korrekta ut i koden. Det syns bara nar man
startar sidan och raknar.

Commit: `b7d095d`

> **Vilken session kartan mott:** **utloggad**, utan konto och utan cloud-synk.
>
> Katalogen ser inte likadan ut inloggad och utloggad — kontobundna sektioner kan ha
> ett annat antal val. Kartan genereras i CI, dar ingen inloggning finns, sa siffrorna
> nedan ar den utloggade vyn. Kolumnerna Nyckel / Shadow / Ritar galler alla kort som
> faktiskt byggdes, och det ar de kolumnerna som ar vaktarna.

## Sammanfattning

| | |
|---|---|
| Kort totalt | **222** |
| Sektioner | 20 |
| Med katalognyckel | 222 / 222 |
| Med shadow DOM-miniatyr | 222 / 222 |
| Ritar sin design | 222 / 222 |
| Tandningsregel i dokumentet | 0  (ska vara 0) |
| Layout rord av katalogen | 0 i minnet, 0 pa disk  (ska vara 0/0) |

Tandningsregeln for alerts bor i en shadow root och far inte finnas i
`document.styleSheets` — dar kunde den na overlayen. Se `tests/browser/thumb-leak.browser.test.js`.

## Per sektion

| Sektion | Kort | Nyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|---|
| EGET INNEHÅLL | 3 | 3/3 | 3/3 | 3/3 | 2026-08-17 | — |
| LAST-X ALERTS · VARJE DESIGN SEPARAT | 5 | 5/5 | 5/5 | 5/5 | 2026-08-17 | — |
| GIFT FIREWORKS | 3 | 3/3 | 3/3 | 3/3 | 2026-08-17 | — |
| GIFT JAR · VARJE MODELL SEPARAT | 7 | 7/7 | 7/7 | 7/7 | 2026-08-17 | — |
| GIFT CAMPAIGN · VARJE TEMA SEPARAT | 16 | 16/16 | 16/16 | 16/16 | 2026-08-17 | — |
| LIKE FOUNTAIN | 1 | 1/1 | 1/1 | 1/1 | 2026-08-17 | — |
| BATTLE MVP · 17 DESIGNER | 17 | 17/17 | 17/17 | 17/17 | 2026-08-17 | — |
| Koi Pearl Lagoon · VIDEO FX | 4 | 4/4 | 4/4 | 4/4 | 2026-08-17 | — |
| Masquerade Ball · VIDEO FX | 4 | 4/4 | 4/4 | 4/4 | 2026-08-17 | — |
| NEW FOLLOWER ALERT | 1 | 1/1 | 1/1 | 1/1 | 2026-08-17 | — |
| FOLLOWERS & LIKE GOALS · 4 LIGGANDE DESIGNER | 31 | 31/31 | 31/31 | 31/31 | 2026-08-17 | — |
| GIFTER LEVEL UP · VARJE MODELL SEPARAT | 9 | 9/9 | 9/9 | 9/9 | 2026-08-17 | — |
| FAN LEVEL UP · 7 MODELLER | 7 | 7/7 | 7/7 | 7/7 | 2026-08-17 | — |
| HEART ME GOAL · VARJE TEMA SEPARAT | 12 | 12/12 | 12/12 | 12/12 | 2026-08-17 | — |
| VYRA TOP RANKING · VARJE DESIGN SEPARAT | 8 | 8/8 | 8/8 | 8/8 | 2026-08-17 | — |
| TOP LIKE · VARJE DESIGN SEPARAT | 4 | 4/4 | 4/4 | 4/4 | 2026-08-17 | — |
| VYRA TOP STREAK · REDIGERBAR | 23 | 23/23 | 23/23 | 23/23 | 2026-08-17 | — |
| VYRA TOP STREAK · REDIGERBARA | 23 | 23/23 | 23/23 | 23/23 | 2026-08-17 | — |
| VYRA TOP STREAK · PREMIUM | 23 | 23/23 | 23/23 | 23/23 | 2026-08-17 | — |
| TOP GIFTER · DESIGNVAL | 21 | 21/21 | 21/21 | 21/21 | 2026-08-17 | — |

## Varje kort

### EGET INNEHÅLL

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Text | `catalog:custom:text` | ✓ | ✓ | 2026-08-17 | — |
| Bild | `catalog:custom:image` | ✓ | ✓ | 2026-08-17 | — |
| Video | `catalog:custom:video` | ✓ | ✓ | 2026-08-17 | — |

### LAST-X ALERTS · VARJE DESIGN SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Last-X · Card | `catalog:lastx:card` | ✓ | ✓ | 2026-08-17 | — |
| Last-X · Stack | `catalog:lastx:stack` | ✓ | ✓ | 2026-08-17 | — |
| Last-X · Skew | `catalog:lastx:skew` | ✓ | ✓ | 2026-08-17 | — |
| Last-X · Badge | `catalog:lastx:badge` | ✓ | ✓ | 2026-08-17 | — |
| Last-X · Royal Coronation | `catalog:lastx:royal` | ✓ | ✓ | 2026-08-17 | — |

### GIFT FIREWORKS

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Fireworks · Magnetic Return | `catalog:giftfireworks:magnetic` | ✓ | ✓ | 2026-08-17 | — |
| Fireworks · Spiral Recall | `catalog:giftfireworks:spiral` | ✓ | ✓ | 2026-08-17 | — |
| Fireworks · Crystal Bloom | `catalog:giftfireworks:bloom` | ✓ | ✓ | 2026-08-17 | — |

### GIFT JAR · VARJE MODELL SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Crystal Jar | `catalog:giftjar:crystal` | ✓ | ✓ | 2026-08-17 | — |
| Royal Jar | `catalog:giftjar:royal` | ✓ | ✓ | 2026-08-17 | — |
| Neon Jar | `catalog:giftjar:neon` | ✓ | ✓ | 2026-08-17 | — |
| Fire Jar | `catalog:giftjar:fire` | ✓ | ✓ | 2026-08-17 | — |
| Ice Jar | `catalog:giftjar:ice` | ✓ | ✓ | 2026-08-17 | — |
| Heart Jar | `catalog:giftjar:heart` | ✓ | ✓ | 2026-08-17 | — |
| Galaxy Jar | `catalog:giftjar:galaxy` | ✓ | ✓ | 2026-08-17 | — |

### GIFT CAMPAIGN · VARJE TEMA SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Neon Event | `catalog:giftcampaign:neon:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Neon Event | `catalog:giftcampaign:neon:portrait` | ✓ | ✓ | 2026-08-17 | — |
| Royal Gold | `catalog:giftcampaign:royal:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Royal Gold | `catalog:giftcampaign:royal:portrait` | ✓ | ✓ | 2026-08-17 | — |
| Glass | `catalog:giftcampaign:glass:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Glass | `catalog:giftcampaign:glass:portrait` | ✓ | ✓ | 2026-08-17 | — |
| Minimal | `catalog:giftcampaign:minimal:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Minimal | `catalog:giftcampaign:minimal:portrait` | ✓ | ✓ | 2026-08-17 | — |
| Aurora | `catalog:giftcampaign:aurora:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Aurora | `catalog:giftcampaign:aurora:portrait` | ✓ | ✓ | 2026-08-17 | — |
| Retro Arcade | `catalog:giftcampaign:retro:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Retro Arcade | `catalog:giftcampaign:retro:portrait` | ✓ | ✓ | 2026-08-17 | — |
| Gold Rush | `catalog:giftcampaign:goldrush:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Gold Rush | `catalog:giftcampaign:goldrush:portrait` | ✓ | ✓ | 2026-08-17 | — |
| Crystal Garden | `catalog:giftcampaign:crystal-garden:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Crystal Garden | `catalog:giftcampaign:crystal-garden:portrait` | ✓ | ✓ | 2026-08-17 | — |

### LIKE FOUNTAIN

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Like Fountain | `catalog:likefountain` | ✓ | ✓ | 2026-08-17 | — |

### BATTLE MVP · 17 DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Inferno | `catalog:battlemvp:inferno` | ✓ | ✓ | 2026-08-17 | — |
| Royal | `catalog:battlemvp:royal` | ✓ | ✓ | 2026-08-17 | — |
| Cyber | `catalog:battlemvp:cyber` | ✓ | ✓ | 2026-08-17 | — |
| Ice | `catalog:battlemvp:ice` | ✓ | ✓ | 2026-08-17 | — |
| Storm | `catalog:battlemvp:storm` | ✓ | ✓ | 2026-08-17 | — |
| Aurora | `catalog:battlemvp:aurora` | ✓ | ✓ | 2026-08-17 | — |
| Samurai | `catalog:battlemvp:samurai` | ✓ | ✓ | 2026-08-17 | — |
| Royal Purple | `catalog:battlemvp:royal-purple` | ✓ | ✓ | 2026-08-17 | — |
| Neon Cyber | `catalog:battlemvp:neon-cyber` | ✓ | ✓ | 2026-08-17 | — |
| Diamond Elite | `catalog:battlemvp:diamond-elite` | ✓ | ✓ | 2026-08-17 | — |
| Gold Crown | `catalog:battlemvp:frame:gold-crown` | ✓ | ✓ | 2026-08-17 | — |
| Royal Ribbon | `catalog:battlemvp:frame:royal-ribbon` | ✓ | ✓ | 2026-08-17 | — |
| Laurel Star | `catalog:battlemvp:frame:laurel-star` | ✓ | ✓ | 2026-08-17 | — |
| Dark Wings | `catalog:battlemvp:frame:dark-wings` | ✓ | ✓ | 2026-08-17 | — |
| Dragon Fire | `catalog:battlemvp:frame:dragon-fire` | ✓ | ✓ | 2026-08-17 | — |
| Nautical Helm | `catalog:battlemvp:frame:nautical-helm` | ✓ | ✓ | 2026-08-17 | — |
| Shadow Star | `catalog:battlemvp:frame:shadow-star` | ✓ | ✓ | 2026-08-17 | — |

### Koi Pearl Lagoon · VIDEO FX

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Koi X2 | `catalog:glovesnipe:koiPearl:boost:2` | ✓ | ✓ | 2026-08-17 | — |
| Koi X3 | `catalog:glovesnipe:koiPearl:boost:3` | ✓ | ✓ | 2026-08-17 | — |
| Koi Tap Tap | `catalog:glovesnipe:koiPearl:tap:2` | ✓ | ✓ | 2026-08-17 | — |
| Koi Glove | `catalog:glovesnipe:koiPearl:glove:2` | ✓ | ✓ | 2026-08-17 | — |

### Masquerade Ball · VIDEO FX

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Masquerade X2 | `catalog:glovesnipe:masquerade:boost:2` | ✓ | ✓ | 2026-08-17 | — |
| Masquerade X3 | `catalog:glovesnipe:masquerade:boost:3` | ✓ | ✓ | 2026-08-17 | — |
| Masquerade Tap Tap | `catalog:glovesnipe:masquerade:tap:2` | ✓ | ✓ | 2026-08-17 | — |
| Masquerade Glove | `catalog:glovesnipe:masquerade:glove:2` | ✓ | ✓ | 2026-08-17 | — |

### NEW FOLLOWER ALERT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Follower Spotlight | `catalog:followeralert` | ✓ | ✓ | 2026-08-17 | — |

### FOLLOWERS & LIKE GOALS · 4 LIGGANDE DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Follower Goal · Rose Crystal | `catalog:socialgoal:followers:1:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Follower Goal · Pink Crown | `catalog:socialgoal:followers:2:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Follower Goal · Blue Ice | `catalog:socialgoal:followers:3:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Follower Goal · Royal Blue | `catalog:socialgoal:followers:4:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Like Goal · Rose Crystal | `catalog:socialgoal:likes:1:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Like Goal · Pink Crown | `catalog:socialgoal:likes:2:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Like Goal · Blue Ice | `catalog:socialgoal:likes:3:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Like Goal · Royal Blue | `catalog:socialgoal:likes:4:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Follower · Rose Crystal Frame | `catalog:socialgoal:followers:rose-frame:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Follower · Royal Heart Frame | `catalog:socialgoal:followers:heart-frame:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Follower · Sapphire Dragon Frame | `catalog:socialgoal:followers:sapphire-frame:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Follower · Azure Crown Frame | `catalog:socialgoal:followers:azure-frame:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Like · Rose Crystal Frame | `catalog:socialgoal:likes:rose-frame:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Like · Royal Heart Frame | `catalog:socialgoal:likes:heart-frame:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Like · Sapphire Dragon Frame | `catalog:socialgoal:likes:sapphire-frame:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Like · Azure Crown Frame | `catalog:socialgoal:likes:azure-frame:landscape` | ✓ | ✓ | 2026-08-17 | — |
| Sakura Pink | `catalog:topgift:extra:sakura` | ✓ | ✓ | 2026-08-17 | — |
| Inferno Fire | `catalog:topgift:extra:fire` | ✓ | ✓ | 2026-08-17 | — |
| Ice Crystal | `catalog:topgift:extra:ice` | ✓ | ✓ | 2026-08-17 | — |
| Galaxy | `catalog:topgift:extra:galaxy` | ✓ | ✓ | 2026-08-17 | — |
| Aurora | `catalog:topgift:extra:aurora` | ✓ | ✓ | 2026-08-17 | — |
| Retro Arcade | `catalog:topgift:extra:retro` | ✓ | ✓ | 2026-08-17 | — |
| Gold Rush | `catalog:topgift:extra:goldrush` | ✓ | ✓ | 2026-08-17 | — |
| Royal Coronation | `catalog:topgift:extra:coronation` | ✓ | ✓ | 2026-08-17 | — |
| Gifter · Royal Wings | `catalog:topgift:frame:royal-wings` | ✓ | ✓ | 2026-08-17 | — |
| Gifter · Crystal Spire | `catalog:topgift:frame:crystal-spire` | ✓ | ✓ | 2026-08-17 | — |
| Gifter · Angel Heart | `catalog:topgift:frame:angel-heart` | ✓ | ✓ | 2026-08-17 | — |
| Gifter · Dark Raven | `catalog:topgift:frame:dark-raven` | ✓ | ✓ | 2026-08-17 | — |
| Gifter · Frost Crystal | `catalog:topgift:frame:frost-crystal` | ✓ | ✓ | 2026-08-17 | — |
| Gifter · Rose Garden | `catalog:topgift:frame:rose-garden` | ✓ | ✓ | 2026-08-17 | — |
| Gifter · Luna Mist | `catalog:topgift:frame:luna-mist` | ✓ | ✓ | 2026-08-17 | — |

### GIFTER LEVEL UP · VARJE MODELL SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Modell 1 · Profil i orbit | `catalog:gifterlevel:profile` | ✓ | ✓ | 2026-08-17 | — |
| Modell 2 · Stort nivånummer | `catalog:gifterlevel:number` | ✓ | ✓ | 2026-08-17 | — |
| Modell 3 · Diamantstapel | `catalog:gifterlevel:stack` | ✓ | ✓ | 2026-08-17 | — |
| Modell 4 · Sidobadge | `catalog:gifterlevel:sidebadge` | ✓ | ✓ | 2026-08-17 | — |
| Modell 5 · Diamantreveal | `catalog:gifterlevel:reveal` | ✓ | ✓ | 2026-08-17 | — |
| Modell 6 · Orbitnivå | `catalog:gifterlevel:orbitlevel` | ✓ | ✓ | 2026-08-17 | — |
| Modell 7 · Stigande nivåer | `catalog:gifterlevel:risingtier` | ✓ | ✓ | 2026-08-17 | — |
| Modell 8 · Myntvändning | `catalog:gifterlevel:flip` | ✓ | ✓ | 2026-08-17 | — |
| Modell 9 · Kompakt duo | `catalog:gifterlevel:duo` | ✓ | ✓ | 2026-08-17 | — |

### FAN LEVEL UP · 7 MODELLER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Fan Level Up · Original Fan Stack | `catalog:fanlevel:layout:stack` | ✓ | ✓ | 2026-08-17 | — |
| Fan Level Up · Heartbeat Side | `catalog:fanlevel:layout:heartbeat` | ✓ | ✓ | 2026-08-17 | — |
| Fan Level Up · Fan Badge Reveal | `catalog:fanlevel:layout:badgereveal` | ✓ | ✓ | 2026-08-17 | — |
| Fan Level Up · Loyalty Ring | `catalog:fanlevel:layout:loyalty` | ✓ | ✓ | 2026-08-17 | — |
| Fan Level Up · Rising Hearts | `catalog:fanlevel:layout:hearts` | ✓ | ✓ | 2026-08-17 | — |
| Fan Level Up · Welcome Ribbon | `catalog:fanlevel:layout:ribbon` | ✓ | ✓ | 2026-08-17 | — |
| Fan Level Up · Community Duo | `catalog:fanlevel:layout:duo` | ✓ | ✓ | 2026-08-17 | — |

### HEART ME GOAL · VARJE TEMA SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Heart Me Goal · Classic | `catalog:heartgoal:classic` | ✓ | ✓ | 2026-08-17 | — |
| Heart Me Goal · Dark | `catalog:heartgoal:dark` | ✓ | ✓ | 2026-08-17 | — |
| Heart Me Goal · Emerald | `catalog:heartgoal:emerald` | ✓ | ✓ | 2026-08-17 | — |
| Heart Me Goal · Galaxy | `catalog:heartgoal:galaxy` | ✓ | ✓ | 2026-08-17 | — |
| Heart Me Goal · Golden | `catalog:heartgoal:golden` | ✓ | ✓ | 2026-08-17 | — |
| Heart Me Goal · Ice | `catalog:heartgoal:ice` | ✓ | ✓ | 2026-08-17 | — |
| Heart Me Goal · Neon | `catalog:heartgoal:neon` | ✓ | ✓ | 2026-08-17 | — |
| Heart Me Goal · Ocean | `catalog:heartgoal:ocean` | ✓ | ✓ | 2026-08-17 | — |
| Heart Me Goal · Sakura | `catalog:heartgoal:sakura` | ✓ | ✓ | 2026-08-17 | — |
| Heart Me Goal · Frost | `catalog:heartgoal:frost` | ✓ | ✓ | 2026-08-17 | — |
| Heart Me Goal · Midnight | `catalog:heartgoal:midnight` | ✓ | ✓ | 2026-08-17 | — |
| Heart Me Goal · Citrus | `catalog:heartgoal:citrus` | ✓ | ✓ | 2026-08-17 | — |

### VYRA TOP RANKING · VARJE DESIGN SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Top Coins · Stil 1 · Lista | `catalog:ranking:templateTopCoins:clean` | ✓ | ✓ | 2026-08-17 | — |
| Top Coins · Stil 2 · Tre i mitten | `catalog:ranking:templateTopCoins:center` | ✓ | ✓ | 2026-08-17 | — |
| Top Coins · Stil 3 · Podium | `catalog:ranking:templateTopCoins:podium` | ✓ | ✓ | 2026-08-17 | — |
| Top Coins · Stil 4 · Neon | `catalog:ranking:templateTopCoins:neon` | ✓ | ✓ | 2026-08-17 | — |
| Top Points · Stil 1 · Lista | `catalog:ranking:templateTopPoints:clean` | ✓ | ✓ | 2026-08-17 | — |
| Top Points · Stil 2 · Tre i mitten | `catalog:ranking:templateTopPoints:center` | ✓ | ✓ | 2026-08-17 | — |
| Top Points · Stil 3 · Podium | `catalog:ranking:templateTopPoints:podium` | ✓ | ✓ | 2026-08-17 | — |
| Top Points · Stil 4 · Neon | `catalog:ranking:templateTopPoints:neon` | ✓ | ✓ | 2026-08-17 | — |

### TOP LIKE · VARJE DESIGN SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Stil 1 · Lista | `catalog:toplike:clean` | ✓ | ✓ | 2026-08-17 | — |
| Stil 2 · Tre i mitten | `catalog:toplike:center` | ✓ | ✓ | 2026-08-17 | — |
| Stil 3 · Podium | `catalog:toplike:podium` | ✓ | ✓ | 2026-08-17 | — |
| Stil 4 · Neon | `catalog:toplike:neon` | ✓ | ✓ | 2026-08-17 | — |

### VYRA TOP STREAK · REDIGERBAR

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Inferno Streak | `catalog:topstreak` | ✓ | ✓ | 2026-08-17 | — |
| Inferno | `catalog:topstreak:inferno` | ✓ | ✓ | 2026-08-17 | — |
| Neon Rail | `catalog:topstreak:neon` | ✓ | ✓ | 2026-08-17 | — |
| Ice Badge | `catalog:topstreak:ice` | ✓ | ✓ | 2026-08-17 | — |
| Royal Crown | `catalog:topstreak:royal` | ✓ | ✓ | 2026-08-17 | — |
| Sakura Rail | `catalog:topstreak:sakura-rail` | ✓ | ✓ | 2026-08-17 | — |
| Cyber Grid | `catalog:topstreak:cyber-grid` | ✓ | ✓ | 2026-08-17 | — |
| Storm | `catalog:topstreak:storm` | ✓ | ✓ | 2026-08-17 | — |
| Amethyst Heart | `catalog:topstreak:frame:amethyst-heart` | ✓ | ✓ | 2026-08-17 | — |
| Crystal Spire | `catalog:topstreak:frame:crystal-spire` | ✓ | ✓ | 2026-08-17 | — |
| Golden Wings | `catalog:topstreak:frame:gold-wings` | ✓ | ✓ | 2026-08-17 | — |
| Rose Heart | `catalog:topstreak:frame:rose-heart` | ✓ | ✓ | 2026-08-17 | — |
| Luna Stars | `catalog:topstreak:frame:luna-stars` | ✓ | ✓ | 2026-08-17 | — |
| Crystal Tiara | `catalog:topstreak:frame:crystal-tiara` | ✓ | ✓ | 2026-08-17 | — |
| Violet Wings | `catalog:topstreak:frame:violet-wings` | ✓ | ✓ | 2026-08-17 | — |
| Star Crown | `catalog:topstreak:frame:star-crown` | ✓ | ✓ | 2026-08-17 | — |
| Liquid Gold Fuse | `catalog:topstreak:premium:liquid` | ✓ | ✓ | 2026-08-17 | — |
| Momentum Steps | `catalog:topstreak:premium:momentum` | ✓ | ✓ | 2026-08-17 | — |
| Momentum Tier | `catalog:topstreak:premium:tier` | ✓ | ✓ | 2026-08-17 | — |
| Silk Golden Thread | `catalog:topstreak:premium:thread` | ✓ | ✓ | 2026-08-17 | — |
| Chronograph Timeline | `catalog:topstreak:premium:chrono` | ✓ | ✓ | 2026-08-17 | — |
| Jewelry Chain Reaction | `catalog:topstreak:premium:chain` | ✓ | ✓ | 2026-08-17 | — |
| Thermochromic Gauge | `catalog:topstreak:premium:thermo` | ✓ | ✓ | 2026-08-17 | — |

### VYRA TOP STREAK · REDIGERBARA

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Inferno Streak | `catalog:topstreak` | ✓ | ✓ | 2026-08-17 | — |
| Inferno | `catalog:topstreak:inferno` | ✓ | ✓ | 2026-08-17 | — |
| Neon Rail | `catalog:topstreak:neon` | ✓ | ✓ | 2026-08-17 | — |
| Ice Badge | `catalog:topstreak:ice` | ✓ | ✓ | 2026-08-17 | — |
| Royal Crown | `catalog:topstreak:royal` | ✓ | ✓ | 2026-08-17 | — |
| Sakura Rail | `catalog:topstreak:sakura-rail` | ✓ | ✓ | 2026-08-17 | — |
| Cyber Grid | `catalog:topstreak:cyber-grid` | ✓ | ✓ | 2026-08-17 | — |
| Storm | `catalog:topstreak:storm` | ✓ | ✓ | 2026-08-17 | — |
| Amethyst Heart | `catalog:topstreak:frame:amethyst-heart` | ✓ | ✓ | 2026-08-17 | — |
| Crystal Spire | `catalog:topstreak:frame:crystal-spire` | ✓ | ✓ | 2026-08-17 | — |
| Golden Wings | `catalog:topstreak:frame:gold-wings` | ✓ | ✓ | 2026-08-17 | — |
| Rose Heart | `catalog:topstreak:frame:rose-heart` | ✓ | ✓ | 2026-08-17 | — |
| Luna Stars | `catalog:topstreak:frame:luna-stars` | ✓ | ✓ | 2026-08-17 | — |
| Crystal Tiara | `catalog:topstreak:frame:crystal-tiara` | ✓ | ✓ | 2026-08-17 | — |
| Violet Wings | `catalog:topstreak:frame:violet-wings` | ✓ | ✓ | 2026-08-17 | — |
| Star Crown | `catalog:topstreak:frame:star-crown` | ✓ | ✓ | 2026-08-17 | — |
| Liquid Gold Fuse | `catalog:topstreak:premium:liquid` | ✓ | ✓ | 2026-08-17 | — |
| Momentum Steps | `catalog:topstreak:premium:momentum` | ✓ | ✓ | 2026-08-17 | — |
| Momentum Tier | `catalog:topstreak:premium:tier` | ✓ | ✓ | 2026-08-17 | — |
| Silk Golden Thread | `catalog:topstreak:premium:thread` | ✓ | ✓ | 2026-08-17 | — |
| Chronograph Timeline | `catalog:topstreak:premium:chrono` | ✓ | ✓ | 2026-08-17 | — |
| Jewelry Chain Reaction | `catalog:topstreak:premium:chain` | ✓ | ✓ | 2026-08-17 | — |
| Thermochromic Gauge | `catalog:topstreak:premium:thermo` | ✓ | ✓ | 2026-08-17 | — |

### VYRA TOP STREAK · PREMIUM

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Inferno Streak | `catalog:topstreak` | ✓ | ✓ | 2026-08-17 | — |
| Inferno | `catalog:topstreak:inferno` | ✓ | ✓ | 2026-08-17 | — |
| Neon Rail | `catalog:topstreak:neon` | ✓ | ✓ | 2026-08-17 | — |
| Ice Badge | `catalog:topstreak:ice` | ✓ | ✓ | 2026-08-17 | — |
| Royal Crown | `catalog:topstreak:royal` | ✓ | ✓ | 2026-08-17 | — |
| Sakura Rail | `catalog:topstreak:sakura-rail` | ✓ | ✓ | 2026-08-17 | — |
| Cyber Grid | `catalog:topstreak:cyber-grid` | ✓ | ✓ | 2026-08-17 | — |
| Storm | `catalog:topstreak:storm` | ✓ | ✓ | 2026-08-17 | — |
| Amethyst Heart | `catalog:topstreak:frame:amethyst-heart` | ✓ | ✓ | 2026-08-17 | — |
| Crystal Spire | `catalog:topstreak:frame:crystal-spire` | ✓ | ✓ | 2026-08-17 | — |
| Golden Wings | `catalog:topstreak:frame:gold-wings` | ✓ | ✓ | 2026-08-17 | — |
| Rose Heart | `catalog:topstreak:frame:rose-heart` | ✓ | ✓ | 2026-08-17 | — |
| Luna Stars | `catalog:topstreak:frame:luna-stars` | ✓ | ✓ | 2026-08-17 | — |
| Crystal Tiara | `catalog:topstreak:frame:crystal-tiara` | ✓ | ✓ | 2026-08-17 | — |
| Violet Wings | `catalog:topstreak:frame:violet-wings` | ✓ | ✓ | 2026-08-17 | — |
| Star Crown | `catalog:topstreak:frame:star-crown` | ✓ | ✓ | 2026-08-17 | — |
| Liquid Gold Fuse | `catalog:topstreak:premium:liquid` | ✓ | ✓ | 2026-08-17 | — |
| Momentum Steps | `catalog:topstreak:premium:momentum` | ✓ | ✓ | 2026-08-17 | — |
| Momentum Tier | `catalog:topstreak:premium:tier` | ✓ | ✓ | 2026-08-17 | — |
| Silk Golden Thread | `catalog:topstreak:premium:thread` | ✓ | ✓ | 2026-08-17 | — |
| Chronograph Timeline | `catalog:topstreak:premium:chrono` | ✓ | ✓ | 2026-08-17 | — |
| Jewelry Chain Reaction | `catalog:topstreak:premium:chain` | ✓ | ✓ | 2026-08-17 | — |
| Thermochromic Gauge | `catalog:topstreak:premium:thermo` | ✓ | ✓ | 2026-08-17 | — |

### TOP GIFTER · DESIGNVAL

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Royal Gold | `catalog:topgift:premium:royal` | ✓ | ✓ | 2026-08-17 | — |
| Neon Purple | `catalog:topgift:premium:neon` | ✓ | ✓ | 2026-08-17 | — |
| Cyber Blue | `catalog:topgift:premium:cyber` | ✓ | ✓ | 2026-08-17 | — |
| Glass | `catalog:topgift:premium:glass` | ✓ | ✓ | 2026-08-17 | — |
| Sakura Pink | `catalog:topgift:premium:sakura` | ✓ | ✓ | 2026-08-17 | — |
| Inferno Fire | `catalog:topgift:premium:fire` | ✓ | ✓ | 2026-08-17 | — |
| Ice Crystal | `catalog:topgift:premium:ice` | ✓ | ✓ | 2026-08-17 | — |
| Galaxy | `catalog:topgift:premium:galaxy` | ✓ | ✓ | 2026-08-17 | — |
| Aurora | `catalog:topgift:premium:aurora` | ✓ | ✓ | 2026-08-17 | — |
| Retro | `catalog:topgift:premium:retro` | ✓ | ✓ | 2026-08-17 | — |
| Gold Rush | `catalog:topgift:premium:goldrush` | ✓ | ✓ | 2026-08-17 | — |
| VYRA Hall of Fame | `catalog:topgift:premium:hall` | ✓ | ✓ | 2026-08-17 | — |
| Royal Throne | `catalog:topgift:premium:throne` | ✓ | ✓ | 2026-08-17 | — |
| Celestial Champion | `catalog:topgift:premium:champion` | ✓ | ✓ | 2026-08-17 | — |
| Diamond Pedestal | `catalog:topgift:premium:pedestal` | ✓ | ✓ | 2026-08-17 | — |
| Celestial Arch | `catalog:topgift:premium:arch` | ✓ | ✓ | 2026-08-17 | — |
| Phoenix Ribbon | `catalog:topgift:premium:phoenix` | ✓ | ✓ | 2026-08-17 | — |
| Neon Signal | `catalog:topgift:premium:signal` | ✓ | ✓ | 2026-08-17 | — |
| Celestial Fireworks | `catalog:topgift:premium:fireworks` | ✓ | ✓ | 2026-08-17 | — |
| Crystal Bloom | `catalog:topgift:premium:bloom` | ✓ | ✓ | 2026-08-17 | — |
| Royal Comet | `catalog:topgift:premium:comet` | ✓ | ✓ | 2026-08-17 | — |

