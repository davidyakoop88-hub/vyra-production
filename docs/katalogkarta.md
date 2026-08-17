# Sanningens karta · widgetkatalogen

<!-- AUTO-GENERERAD. Redigera inte for hand. Kor `npm run karta`. -->

Genererad ur den **korande** katalogen i en riktig webblasare, inte ur kallkoden.
Det ar sjalva poangen: rubriker som pastod fel antal, knappar utan katalognyckel och
tva sektioner som aldrig byggdes sag alla korrekta ut i koden. Det syns bara nar man
startar sidan och raknar.

Commit: `9d5de2b`

> **Vilken session kartan mott:** **utloggad**, utan konto och utan cloud-synk.
>
> Katalogen ser inte likadan ut inloggad och utloggad — kontobundna sektioner kan ha
> ett annat antal val. Kartan genereras i CI, dar ingen inloggning finns, sa siffrorna
> nedan ar den utloggade vyn. Kolumnerna Nyckel / Shadow / Ritar galler alla kort som
> faktiskt byggdes, och det ar de kolumnerna som ar vaktarna.

## Sammanfattning

| | |
|---|---|
| Kort totalt | **223** |
| Sektioner | 20 |
| Med katalognyckel | 223 / 223 |
| Med shadow DOM-miniatyr | 223 / 223 |
| Ritar sin design | 223 / 223 |
| Tandningsregel i dokumentet | 0  (ska vara 0) |
| Layout rord av katalogen | 0 i minnet, 0 pa disk  (ska vara 0/0) |

Tandningsregeln for alerts bor i en shadow root och far inte finnas i
`document.styleSheets` — dar kunde den na overlayen. Se `tests/browser/thumb-leak.browser.test.js`.

## Per sektion

| Sektion | Kort | Nyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|---|
| EGET INNEHÅLL | 3 | 3/3 | 3/3 | 3/3 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| LAST-X ALERTS · VARJE DESIGN SEPARAT | 5 | 5/5 | 5/5 | 5/5 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| GIFT FIREWORKS | 3 | 3/3 | 3/3 | 3/3 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| GIFT JAR · VARJE MODELL SEPARAT | 7 | 7/7 | 7/7 | 7/7 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| GIFT CAMPAIGN · VARJE TEMA SEPARAT | 16 | 16/16 | 16/16 | 16/16 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| LIKE FOUNTAIN | 1 | 1/1 | 1/1 | 1/1 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| BATTLE MVP · 17 DESIGNER | 17 | 17/17 | 17/17 | 17/17 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Koi Pearl Lagoon · VIDEO FX | 4 | 4/4 | 4/4 | 4/4 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Masquerade Ball · VIDEO FX | 4 | 4/4 | 4/4 | 4/4 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| NEW FOLLOWER ALERT | 1 | 1/1 | 1/1 | 1/1 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| FOLLOWERS & LIKE GOALS · 4 LIGGANDE DESIGNER | 31 | 31/31 | 31/31 | 31/31 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| GIFTER LEVEL UP · VARJE MODELL SEPARAT | 9 | 9/9 | 9/9 | 9/9 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| FAN LEVEL UP · 8 MODELLER | 8 | 8/8 | 8/8 | 8/8 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| HEART ME GOAL · VARJE TEMA SEPARAT | 12 | 12/12 | 12/12 | 12/12 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| VYRA TOP RANKING · VARJE DESIGN SEPARAT | 8 | 8/8 | 8/8 | 8/8 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| TOP LIKE · VARJE DESIGN SEPARAT | 4 | 4/4 | 4/4 | 4/4 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| VYRA TOP STREAK · REDIGERBAR | 23 | 23/23 | 23/23 | 23/23 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| VYRA TOP STREAK · REDIGERBARA | 23 | 23/23 | 23/23 | 23/23 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| VYRA TOP STREAK · PREMIUM | 23 | 23/23 | 23/23 | 23/23 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| TOP GIFTER · DESIGNVAL | 21 | 21/21 | 21/21 | 21/21 | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

## Varje kort

### EGET INNEHÅLL

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Text | `catalog:custom:text` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Bild | `catalog:custom:image` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Video | `catalog:custom:video` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### LAST-X ALERTS · VARJE DESIGN SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Last-X · Card | `catalog:lastx:card` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Last-X · Stack | `catalog:lastx:stack` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Last-X · Skew | `catalog:lastx:skew` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Last-X · Badge | `catalog:lastx:badge` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Last-X · Royal Coronation | `catalog:lastx:royal` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### GIFT FIREWORKS

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Fireworks · Magnetic Return | `catalog:giftfireworks:magnetic` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Fireworks · Spiral Recall | `catalog:giftfireworks:spiral` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Fireworks · Crystal Bloom | `catalog:giftfireworks:bloom` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### GIFT JAR · VARJE MODELL SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Crystal Jar | `catalog:giftjar:crystal` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Royal Jar | `catalog:giftjar:royal` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Neon Jar | `catalog:giftjar:neon` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Fire Jar | `catalog:giftjar:fire` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Ice Jar | `catalog:giftjar:ice` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Heart Jar | `catalog:giftjar:heart` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Galaxy Jar | `catalog:giftjar:galaxy` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### GIFT CAMPAIGN · VARJE TEMA SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Neon Event | `catalog:giftcampaign:neon:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Neon Event | `catalog:giftcampaign:neon:portrait` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Royal Gold | `catalog:giftcampaign:royal:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Royal Gold | `catalog:giftcampaign:royal:portrait` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Glass | `catalog:giftcampaign:glass:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Glass | `catalog:giftcampaign:glass:portrait` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Minimal | `catalog:giftcampaign:minimal:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Minimal | `catalog:giftcampaign:minimal:portrait` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Aurora | `catalog:giftcampaign:aurora:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Aurora | `catalog:giftcampaign:aurora:portrait` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Retro Arcade | `catalog:giftcampaign:retro:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Retro Arcade | `catalog:giftcampaign:retro:portrait` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Gold Rush | `catalog:giftcampaign:goldrush:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Gold Rush | `catalog:giftcampaign:goldrush:portrait` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Crystal Garden | `catalog:giftcampaign:crystal-garden:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Crystal Garden | `catalog:giftcampaign:crystal-garden:portrait` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### LIKE FOUNTAIN

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Like Fountain | `catalog:likefountain` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### BATTLE MVP · 17 DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Inferno | `catalog:battlemvp:inferno` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Royal | `catalog:battlemvp:royal` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Cyber | `catalog:battlemvp:cyber` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Ice | `catalog:battlemvp:ice` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Storm | `catalog:battlemvp:storm` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Aurora | `catalog:battlemvp:aurora` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Samurai | `catalog:battlemvp:samurai` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Royal Purple | `catalog:battlemvp:royal-purple` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Neon Cyber | `catalog:battlemvp:neon-cyber` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Diamond Elite | `catalog:battlemvp:diamond-elite` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Gold Crown | `catalog:battlemvp:frame:gold-crown` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Royal Ribbon | `catalog:battlemvp:frame:royal-ribbon` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Laurel Star | `catalog:battlemvp:frame:laurel-star` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Dark Wings | `catalog:battlemvp:frame:dark-wings` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Dragon Fire | `catalog:battlemvp:frame:dragon-fire` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Nautical Helm | `catalog:battlemvp:frame:nautical-helm` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Shadow Star | `catalog:battlemvp:frame:shadow-star` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### Koi Pearl Lagoon · VIDEO FX

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Koi X2 | `catalog:glovesnipe:koiPearl:boost:2` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Koi X3 | `catalog:glovesnipe:koiPearl:boost:3` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Koi Tap Tap | `catalog:glovesnipe:koiPearl:tap:2` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Koi Glove | `catalog:glovesnipe:koiPearl:glove:2` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### Masquerade Ball · VIDEO FX

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Masquerade X2 | `catalog:glovesnipe:masquerade:boost:2` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Masquerade X3 | `catalog:glovesnipe:masquerade:boost:3` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Masquerade Tap Tap | `catalog:glovesnipe:masquerade:tap:2` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Masquerade Glove | `catalog:glovesnipe:masquerade:glove:2` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### NEW FOLLOWER ALERT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Follower Spotlight | `catalog:followeralert` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### FOLLOWERS & LIKE GOALS · 4 LIGGANDE DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Follower Goal · Rose Crystal | `catalog:socialgoal:followers:1:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Follower Goal · Pink Crown | `catalog:socialgoal:followers:2:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Follower Goal · Blue Ice | `catalog:socialgoal:followers:3:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Follower Goal · Royal Blue | `catalog:socialgoal:followers:4:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Like Goal · Rose Crystal | `catalog:socialgoal:likes:1:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Like Goal · Pink Crown | `catalog:socialgoal:likes:2:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Like Goal · Blue Ice | `catalog:socialgoal:likes:3:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Like Goal · Royal Blue | `catalog:socialgoal:likes:4:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Follower · Rose Crystal Frame | `catalog:socialgoal:followers:rose-frame:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Follower · Royal Heart Frame | `catalog:socialgoal:followers:heart-frame:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Follower · Sapphire Dragon Frame | `catalog:socialgoal:followers:sapphire-frame:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Follower · Azure Crown Frame | `catalog:socialgoal:followers:azure-frame:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Like · Rose Crystal Frame | `catalog:socialgoal:likes:rose-frame:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Like · Royal Heart Frame | `catalog:socialgoal:likes:heart-frame:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Like · Sapphire Dragon Frame | `catalog:socialgoal:likes:sapphire-frame:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Like · Azure Crown Frame | `catalog:socialgoal:likes:azure-frame:landscape` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Sakura Pink | `catalog:topgift:extra:sakura` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Inferno Fire | `catalog:topgift:extra:fire` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Ice Crystal | `catalog:topgift:extra:ice` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Galaxy | `catalog:topgift:extra:galaxy` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Aurora | `catalog:topgift:extra:aurora` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Retro Arcade | `catalog:topgift:extra:retro` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Gold Rush | `catalog:topgift:extra:goldrush` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Royal Coronation | `catalog:topgift:extra:coronation` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Gifter · Royal Wings | `catalog:topgift:frame:royal-wings` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Gifter · Crystal Spire | `catalog:topgift:frame:crystal-spire` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Gifter · Angel Heart | `catalog:topgift:frame:angel-heart` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Gifter · Dark Raven | `catalog:topgift:frame:dark-raven` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Gifter · Frost Crystal | `catalog:topgift:frame:frost-crystal` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Gifter · Rose Garden | `catalog:topgift:frame:rose-garden` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Gifter · Luna Mist | `catalog:topgift:frame:luna-mist` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### GIFTER LEVEL UP · VARJE MODELL SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Modell 1 · Profil i orbit | `catalog:gifterlevel:profile` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Modell 2 · Stort nivånummer | `catalog:gifterlevel:number` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Modell 3 · Diamantstapel | `catalog:gifterlevel:stack` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Modell 4 · Sidobadge | `catalog:gifterlevel:sidebadge` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Modell 5 · Diamantreveal | `catalog:gifterlevel:reveal` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Modell 6 · Orbitnivå | `catalog:gifterlevel:orbitlevel` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Modell 7 · Stigande nivåer | `catalog:gifterlevel:risingtier` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Modell 8 · Myntvändning | `catalog:gifterlevel:flip` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Modell 9 · Kompakt duo | `catalog:gifterlevel:duo` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### FAN LEVEL UP · 8 MODELLER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Fan Level Up · Hero Card | `catalog:fanlevel:layout:hero` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Fan Level Up · Original Fan Stack | `catalog:fanlevel:layout:stack` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Fan Level Up · Heartbeat Side | `catalog:fanlevel:layout:heartbeat` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Fan Level Up · Fan Badge Reveal | `catalog:fanlevel:layout:badgereveal` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Fan Level Up · Loyalty Ring | `catalog:fanlevel:layout:loyalty` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Fan Level Up · Rising Hearts | `catalog:fanlevel:layout:hearts` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Fan Level Up · Welcome Ribbon | `catalog:fanlevel:layout:ribbon` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Fan Level Up · Community Duo | `catalog:fanlevel:layout:duo` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### HEART ME GOAL · VARJE TEMA SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Heart Me Goal · Classic | `catalog:heartgoal:classic` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Heart Me Goal · Dark | `catalog:heartgoal:dark` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Heart Me Goal · Emerald | `catalog:heartgoal:emerald` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Heart Me Goal · Galaxy | `catalog:heartgoal:galaxy` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Heart Me Goal · Golden | `catalog:heartgoal:golden` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Heart Me Goal · Ice | `catalog:heartgoal:ice` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Heart Me Goal · Neon | `catalog:heartgoal:neon` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Heart Me Goal · Ocean | `catalog:heartgoal:ocean` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Heart Me Goal · Sakura | `catalog:heartgoal:sakura` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Heart Me Goal · Frost | `catalog:heartgoal:frost` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Heart Me Goal · Midnight | `catalog:heartgoal:midnight` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Heart Me Goal · Citrus | `catalog:heartgoal:citrus` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### VYRA TOP RANKING · VARJE DESIGN SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Top Coins · Stil 1 · Lista | `catalog:ranking:templateTopCoins:clean` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Top Coins · Stil 2 · Tre i mitten | `catalog:ranking:templateTopCoins:center` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Top Coins · Stil 3 · Podium | `catalog:ranking:templateTopCoins:podium` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Top Coins · Stil 4 · Neon | `catalog:ranking:templateTopCoins:neon` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Top Points · Stil 1 · Lista | `catalog:ranking:templateTopPoints:clean` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Top Points · Stil 2 · Tre i mitten | `catalog:ranking:templateTopPoints:center` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Top Points · Stil 3 · Podium | `catalog:ranking:templateTopPoints:podium` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Top Points · Stil 4 · Neon | `catalog:ranking:templateTopPoints:neon` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### TOP LIKE · VARJE DESIGN SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Stil 1 · Lista | `catalog:toplike:clean` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Stil 2 · Tre i mitten | `catalog:toplike:center` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Stil 3 · Podium | `catalog:toplike:podium` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Stil 4 · Neon | `catalog:toplike:neon` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### VYRA TOP STREAK · REDIGERBAR

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Inferno Streak | `catalog:topstreak` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Inferno | `catalog:topstreak:inferno` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Neon Rail | `catalog:topstreak:neon` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Ice Badge | `catalog:topstreak:ice` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Royal Crown | `catalog:topstreak:royal` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Sakura Rail | `catalog:topstreak:sakura-rail` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Cyber Grid | `catalog:topstreak:cyber-grid` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Storm | `catalog:topstreak:storm` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Amethyst Heart | `catalog:topstreak:frame:amethyst-heart` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Crystal Spire | `catalog:topstreak:frame:crystal-spire` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Golden Wings | `catalog:topstreak:frame:gold-wings` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Rose Heart | `catalog:topstreak:frame:rose-heart` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Luna Stars | `catalog:topstreak:frame:luna-stars` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Crystal Tiara | `catalog:topstreak:frame:crystal-tiara` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Violet Wings | `catalog:topstreak:frame:violet-wings` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Star Crown | `catalog:topstreak:frame:star-crown` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Liquid Gold Fuse | `catalog:topstreak:premium:liquid` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Momentum Steps | `catalog:topstreak:premium:momentum` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Momentum Tier | `catalog:topstreak:premium:tier` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Silk Golden Thread | `catalog:topstreak:premium:thread` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Chronograph Timeline | `catalog:topstreak:premium:chrono` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Jewelry Chain Reaction | `catalog:topstreak:premium:chain` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Thermochromic Gauge | `catalog:topstreak:premium:thermo` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### VYRA TOP STREAK · REDIGERBARA

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Inferno Streak | `catalog:topstreak` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Inferno | `catalog:topstreak:inferno` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Neon Rail | `catalog:topstreak:neon` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Ice Badge | `catalog:topstreak:ice` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Royal Crown | `catalog:topstreak:royal` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Sakura Rail | `catalog:topstreak:sakura-rail` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Cyber Grid | `catalog:topstreak:cyber-grid` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Storm | `catalog:topstreak:storm` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Amethyst Heart | `catalog:topstreak:frame:amethyst-heart` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Crystal Spire | `catalog:topstreak:frame:crystal-spire` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Golden Wings | `catalog:topstreak:frame:gold-wings` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Rose Heart | `catalog:topstreak:frame:rose-heart` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Luna Stars | `catalog:topstreak:frame:luna-stars` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Crystal Tiara | `catalog:topstreak:frame:crystal-tiara` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Violet Wings | `catalog:topstreak:frame:violet-wings` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Star Crown | `catalog:topstreak:frame:star-crown` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Liquid Gold Fuse | `catalog:topstreak:premium:liquid` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Momentum Steps | `catalog:topstreak:premium:momentum` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Momentum Tier | `catalog:topstreak:premium:tier` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Silk Golden Thread | `catalog:topstreak:premium:thread` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Chronograph Timeline | `catalog:topstreak:premium:chrono` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Jewelry Chain Reaction | `catalog:topstreak:premium:chain` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Thermochromic Gauge | `catalog:topstreak:premium:thermo` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### VYRA TOP STREAK · PREMIUM

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Inferno Streak | `catalog:topstreak` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Inferno | `catalog:topstreak:inferno` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Neon Rail | `catalog:topstreak:neon` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Ice Badge | `catalog:topstreak:ice` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Royal Crown | `catalog:topstreak:royal` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Sakura Rail | `catalog:topstreak:sakura-rail` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Cyber Grid | `catalog:topstreak:cyber-grid` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Storm | `catalog:topstreak:storm` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Amethyst Heart | `catalog:topstreak:frame:amethyst-heart` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Crystal Spire | `catalog:topstreak:frame:crystal-spire` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Golden Wings | `catalog:topstreak:frame:gold-wings` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Rose Heart | `catalog:topstreak:frame:rose-heart` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Luna Stars | `catalog:topstreak:frame:luna-stars` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Crystal Tiara | `catalog:topstreak:frame:crystal-tiara` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Violet Wings | `catalog:topstreak:frame:violet-wings` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Star Crown | `catalog:topstreak:frame:star-crown` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Liquid Gold Fuse | `catalog:topstreak:premium:liquid` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Momentum Steps | `catalog:topstreak:premium:momentum` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Momentum Tier | `catalog:topstreak:premium:tier` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Silk Golden Thread | `catalog:topstreak:premium:thread` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Chronograph Timeline | `catalog:topstreak:premium:chrono` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Jewelry Chain Reaction | `catalog:topstreak:premium:chain` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Thermochromic Gauge | `catalog:topstreak:premium:thermo` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

### TOP GIFTER · DESIGNVAL

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Royal Gold | `catalog:topgift:premium:royal` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Neon Purple | `catalog:topgift:premium:neon` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Cyber Blue | `catalog:topgift:premium:cyber` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Glass | `catalog:topgift:premium:glass` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Sakura Pink | `catalog:topgift:premium:sakura` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Inferno Fire | `catalog:topgift:premium:fire` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Ice Crystal | `catalog:topgift:premium:ice` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Galaxy | `catalog:topgift:premium:galaxy` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Aurora | `catalog:topgift:premium:aurora` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Retro | `catalog:topgift:premium:retro` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Gold Rush | `catalog:topgift:premium:goldrush` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| VYRA Hall of Fame | `catalog:topgift:premium:hall` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Royal Throne | `catalog:topgift:premium:throne` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Celestial Champion | `catalog:topgift:premium:champion` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Diamond Pedestal | `catalog:topgift:premium:pedestal` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Celestial Arch | `catalog:topgift:premium:arch` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Phoenix Ribbon | `catalog:topgift:premium:phoenix` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Neon Signal | `catalog:topgift:premium:signal` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Celestial Fireworks | `catalog:topgift:premium:fireworks` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Crystal Bloom | `catalog:topgift:premium:bloom` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |
| Royal Comet | `catalog:topgift:premium:comet` | ✓ | ✓ | 2026-08-17 | [#211](https://github.com/davidyakoop88-hub/vyra-production/pull/211) |

