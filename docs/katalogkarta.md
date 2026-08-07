# Sanningens karta · widgetkatalogen

<!-- AUTO-GENERERAD. Redigera inte for hand. Kor `npm run karta`. -->

Genererad ur den **korande** katalogen i en riktig webblasare, inte ur kallkoden.
Det ar sjalva poangen: rubriker som pastod fel antal, knappar utan katalognyckel och
tva sektioner som aldrig byggdes sag alla korrekta ut i koden. Det syns bara nar man
startar sidan och raknar.

Commit: `fbcd7ff`

> **Vilken session kartan mott:** **utloggad**, utan konto och utan cloud-synk.
>
> Katalogen ser inte likadan ut inloggad och utloggad — kontobundna sektioner kan ha
> ett annat antal val. Kartan genereras i CI, dar ingen inloggning finns, sa siffrorna
> nedan ar den utloggade vyn. Kolumnerna Nyckel / Shadow / Ritar galler alla kort som
> faktiskt byggdes, och det ar de kolumnerna som ar vaktarna.

## Sammanfattning

| | |
|---|---|
| Kort totalt | **154** |
| Sektioner | 17 |
| Med katalognyckel | 154 / 154 |
| Med shadow DOM-miniatyr | 154 / 154 |
| Ritar sin design | 154 / 154 |
| Tandningsregel i dokumentet | 0  (ska vara 0) |
| Layout rord av katalogen | 0 i minnet, 0 pa disk  (ska vara 0/0) |

Tandningsregeln for alerts bor i en shadow root och far inte finnas i
`document.styleSheets` — dar kunde den na overlayen. Se `tests/browser/thumb-leak.browser.test.js`.

## Per sektion

| Sektion | Kort | Nyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|---|
| EGET INNEHÅLL | 3 | 3/3 | 3/3 | 3/3 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| LAST-X ALERTS · VARJE DESIGN SEPARAT | 5 | 5/5 | 5/5 | 5/5 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| GIFT FIREWORKS | 3 | 3/3 | 3/3 | 3/3 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| GIFT CAMPAIGN · VARJE TEMA SEPARAT | 16 | 16/16 | 16/16 | 16/16 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| LIKE FOUNTAIN | 1 | 1/1 | 1/1 | 1/1 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| BATTLE MVP · 17 DESIGNER | 17 | 17/17 | 17/17 | 17/17 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Koi Pearl Lagoon · VIDEO FX | 4 | 4/4 | 4/4 | 4/4 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Masquerade Ball · VIDEO FX | 4 | 4/4 | 4/4 | 4/4 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| NEW FOLLOWER ALERT | 1 | 1/1 | 1/1 | 1/1 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| FOLLOWERS & LIKE GOALS · VARJE DESIGN SEPARAT | 16 | 16/16 | 16/16 | 16/16 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| GIFTER LEVEL UP · VARJE MODELL SEPARAT | 9 | 9/9 | 9/9 | 9/9 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| FAN LEVEL UP · VARJE TEMA SEPARAT | 8 | 8/8 | 8/8 | 8/8 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| HEART ME GOAL · VARJE TEMA SEPARAT | 12 | 12/12 | 12/12 | 12/12 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| VYRA TOP RANKING · VARJE DESIGN SEPARAT | 8 | 8/8 | 8/8 | 8/8 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| TOP LIKE · VARJE DESIGN SEPARAT | 4 | 4/4 | 4/4 | 4/4 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| VYRA TOP STREAK · PREMIUM | 7 | 7/7 | 7/7 | 7/7 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| TOP GIFTER · DESIGNVAL | 36 | 36/36 | 36/36 | 36/36 | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

## Varje kort

### EGET INNEHÅLL

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Text | `catalog:custom:text` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Bild | `catalog:custom:image` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Video | `catalog:custom:video` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### LAST-X ALERTS · VARJE DESIGN SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Last-X · Card | `catalog:lastx:card` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Last-X · Stack | `catalog:lastx:stack` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Last-X · Skew | `catalog:lastx:skew` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Last-X · Badge | `catalog:lastx:badge` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Last-X · Royal Coronation | `catalog:lastx:royal` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### GIFT FIREWORKS

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Fireworks · Magnetic Return | `catalog:giftfireworks:magnetic` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Fireworks · Spiral Recall | `catalog:giftfireworks:spiral` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Fireworks · Crystal Bloom | `catalog:giftfireworks:bloom` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### GIFT CAMPAIGN · VARJE TEMA SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Neon Event | `catalog:giftcampaign:neon:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Neon Event | `catalog:giftcampaign:neon:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Royal Gold | `catalog:giftcampaign:royal:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Royal Gold | `catalog:giftcampaign:royal:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Glass | `catalog:giftcampaign:glass:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Glass | `catalog:giftcampaign:glass:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Minimal | `catalog:giftcampaign:minimal:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Minimal | `catalog:giftcampaign:minimal:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Aurora | `catalog:giftcampaign:aurora:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Aurora | `catalog:giftcampaign:aurora:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Retro Arcade | `catalog:giftcampaign:retro:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Retro Arcade | `catalog:giftcampaign:retro:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Gold Rush | `catalog:giftcampaign:goldrush:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Gold Rush | `catalog:giftcampaign:goldrush:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Crystal Garden | `catalog:giftcampaign:crystal-garden:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Crystal Garden | `catalog:giftcampaign:crystal-garden:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### LIKE FOUNTAIN

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Like Fountain | `catalog:likefountain` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### BATTLE MVP · 17 DESIGNER

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Inferno | `catalog:battlemvp:inferno` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Royal | `catalog:battlemvp:royal` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Cyber | `catalog:battlemvp:cyber` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Ice | `catalog:battlemvp:ice` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Storm | `catalog:battlemvp:storm` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Aurora | `catalog:battlemvp:aurora` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Samurai | `catalog:battlemvp:samurai` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Royal Purple | `catalog:battlemvp:royal-purple` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Neon Cyber | `catalog:battlemvp:neon-cyber` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Diamond Elite | `catalog:battlemvp:diamond-elite` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Gold Crown | `catalog:battlemvp:frame:gold-crown` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Royal Ribbon | `catalog:battlemvp:frame:royal-ribbon` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Laurel Star | `catalog:battlemvp:frame:laurel-star` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Dark Wings | `catalog:battlemvp:frame:dark-wings` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Dragon Fire | `catalog:battlemvp:frame:dragon-fire` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Nautical Helm | `catalog:battlemvp:frame:nautical-helm` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Shadow Star | `catalog:battlemvp:frame:shadow-star` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### Koi Pearl Lagoon · VIDEO FX

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Koi X2 | `catalog:glovesnipe:koiPearl:boost:2` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Koi X3 | `catalog:glovesnipe:koiPearl:boost:3` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Koi Tap Tap | `catalog:glovesnipe:koiPearl:tap:2` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Koi Glove | `catalog:glovesnipe:koiPearl:glove:2` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### Masquerade Ball · VIDEO FX

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Masquerade X2 | `catalog:glovesnipe:masquerade:boost:2` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Masquerade X3 | `catalog:glovesnipe:masquerade:boost:3` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Masquerade Tap Tap | `catalog:glovesnipe:masquerade:tap:2` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Masquerade Glove | `catalog:glovesnipe:masquerade:glove:2` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### NEW FOLLOWER ALERT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Follower Spotlight | `catalog:followeralert` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### FOLLOWERS & LIKE GOALS · VARJE DESIGN SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Follower Goal · Gradient Bar | `catalog:socialgoal:followers:1:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Follower Goal · Gradient Bar | `catalog:socialgoal:followers:1:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Follower Goal · Neon Capsule | `catalog:socialgoal:followers:2:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Follower Goal · Neon Capsule | `catalog:socialgoal:followers:2:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Follower Goal · Minimal Glow | `catalog:socialgoal:followers:3:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Follower Goal · Minimal Glow | `catalog:socialgoal:followers:3:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Follower Goal · Circular Ring | `catalog:socialgoal:followers:4:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Follower Goal · Circular Ring | `catalog:socialgoal:followers:4:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Like Goal · Gradient Bar | `catalog:socialgoal:likes:1:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Like Goal · Gradient Bar | `catalog:socialgoal:likes:1:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Like Goal · Neon Capsule | `catalog:socialgoal:likes:2:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Like Goal · Neon Capsule | `catalog:socialgoal:likes:2:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Like Goal · Minimal Glow | `catalog:socialgoal:likes:3:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Like Goal · Minimal Glow | `catalog:socialgoal:likes:3:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Like Goal · Circular Ring | `catalog:socialgoal:likes:4:landscape` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Like Goal · Circular Ring | `catalog:socialgoal:likes:4:portrait` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### GIFTER LEVEL UP · VARJE MODELL SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Modell 1 · Profil i orbit | `catalog:gifterlevel:profile` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Modell 2 · Stort nivånummer | `catalog:gifterlevel:number` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Modell 3 · Diamantstapel | `catalog:gifterlevel:stack` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Modell 4 · Sidobadge | `catalog:gifterlevel:sidebadge` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Modell 5 · Diamantreveal | `catalog:gifterlevel:reveal` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Modell 6 · Orbitnivå | `catalog:gifterlevel:orbitlevel` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Modell 7 · Stigande nivåer | `catalog:gifterlevel:risingtier` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Modell 8 · Myntvändning | `catalog:gifterlevel:flip` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Modell 9 · Kompakt duo | `catalog:gifterlevel:duo` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### FAN LEVEL UP · VARJE TEMA SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Fan Level Up · Gold | `catalog:fanlevel:gold` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Fan Level Up · Neon | `catalog:fanlevel:neon` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Fan Level Up · Ice | `catalog:fanlevel:ice` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Fan Level Up · Emerald | `catalog:fanlevel:emerald` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Fan Level Up · Fire | `catalog:fanlevel:fire` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Fan Level Up · Sakura | `catalog:fanlevel:sakura` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Fan Level Up · Storm | `catalog:fanlevel:storm` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Fan Level Up · Royal | `catalog:fanlevel:royal` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### HEART ME GOAL · VARJE TEMA SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Heart Me Goal · Classic | `catalog:heartgoal:classic` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Heart Me Goal · Dark | `catalog:heartgoal:dark` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Heart Me Goal · Emerald | `catalog:heartgoal:emerald` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Heart Me Goal · Galaxy | `catalog:heartgoal:galaxy` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Heart Me Goal · Golden | `catalog:heartgoal:golden` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Heart Me Goal · Ice | `catalog:heartgoal:ice` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Heart Me Goal · Neon | `catalog:heartgoal:neon` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Heart Me Goal · Ocean | `catalog:heartgoal:ocean` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Heart Me Goal · Sakura | `catalog:heartgoal:sakura` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Heart Me Goal · Frost | `catalog:heartgoal:frost` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Heart Me Goal · Midnight | `catalog:heartgoal:midnight` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Heart Me Goal · Citrus | `catalog:heartgoal:citrus` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### VYRA TOP RANKING · VARJE DESIGN SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Top Coins · Stil 1 · Lista | `catalog:ranking:templateTopCoins:clean` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Top Coins · Stil 2 · Tre i mitten | `catalog:ranking:templateTopCoins:center` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Top Coins · Stil 3 · Podium | `catalog:ranking:templateTopCoins:podium` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Top Coins · Stil 4 · Neon | `catalog:ranking:templateTopCoins:neon` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Top Points · Stil 1 · Lista | `catalog:ranking:templateTopPoints:clean` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Top Points · Stil 2 · Tre i mitten | `catalog:ranking:templateTopPoints:center` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Top Points · Stil 3 · Podium | `catalog:ranking:templateTopPoints:podium` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Top Points · Stil 4 · Neon | `catalog:ranking:templateTopPoints:neon` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### TOP LIKE · VARJE DESIGN SEPARAT

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Stil 1 · Lista | `catalog:toplike:clean` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Stil 2 · Tre i mitten | `catalog:toplike:center` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Stil 3 · Podium | `catalog:toplike:podium` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Stil 4 · Neon | `catalog:toplike:neon` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### VYRA TOP STREAK · PREMIUM

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Liquid Gold Fuse | `catalog:topstreak:premium:liquid` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Momentum Steps | `catalog:topstreak:premium:momentum` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Momentum Tier | `catalog:topstreak:premium:tier` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Silk Golden Thread | `catalog:topstreak:premium:thread` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Chronograph Timeline | `catalog:topstreak:premium:chrono` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Jewelry Chain Reaction | `catalog:topstreak:premium:chain` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Thermochromic Gauge | `catalog:topstreak:premium:thermo` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

### TOP GIFTER · DESIGNVAL

| Design | Katalognyckel | Shadow | Ritar | Senast andrad | PR |
|---|---|---|---|---|---|
| Royal Gold | `catalog:topgift:premium:royal` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Neon Purple | `catalog:topgift:premium:neon` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Cyber Blue | `catalog:topgift:premium:cyber` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Glass | `catalog:topgift:premium:glass` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Sakura Pink | `catalog:topgift:premium:sakura` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Inferno Fire | `catalog:topgift:premium:fire` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Ice Crystal | `catalog:topgift:premium:ice` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Galaxy | `catalog:topgift:premium:galaxy` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Aurora | `catalog:topgift:premium:aurora` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Retro | `catalog:topgift:premium:retro` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Gold Rush | `catalog:topgift:premium:goldrush` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| VYRA Hall of Fame | `catalog:topgift:premium:hall` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Royal Throne | `catalog:topgift:premium:throne` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Celestial Champion | `catalog:topgift:premium:champion` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Diamond Pedestal | `catalog:topgift:premium:pedestal` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Celestial Arch | `catalog:topgift:premium:arch` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Phoenix Ribbon | `catalog:topgift:premium:phoenix` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Neon Signal | `catalog:topgift:premium:signal` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Celestial Fireworks | `catalog:topgift:premium:fireworks` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Crystal Bloom | `catalog:topgift:premium:bloom` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Royal Comet | `catalog:topgift:premium:comet` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Sakura Pink | `catalog:topgift:extra:sakura` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Inferno Fire | `catalog:topgift:extra:fire` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Ice Crystal | `catalog:topgift:extra:ice` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Galaxy | `catalog:topgift:extra:galaxy` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Aurora | `catalog:topgift:extra:aurora` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Retro Arcade | `catalog:topgift:extra:retro` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Gold Rush | `catalog:topgift:extra:goldrush` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Royal Coronation | `catalog:topgift:extra:coronation` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Gifter · Royal Wings | `catalog:topgift:frame:royal-wings` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Gifter · Crystal Spire | `catalog:topgift:frame:crystal-spire` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Gifter · Angel Heart | `catalog:topgift:frame:angel-heart` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Gifter · Dark Raven | `catalog:topgift:frame:dark-raven` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Gifter · Frost Crystal | `catalog:topgift:frame:frost-crystal` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Gifter · Rose Garden | `catalog:topgift:frame:rose-garden` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |
| Gifter · Luna Mist | `catalog:topgift:frame:luna-mist` | ✓ | ✓ | 2026-08-08 | [#139](https://github.com/davidyakoop88-hub/vyra-production/pull/139) |

