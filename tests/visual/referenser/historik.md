# Historik för de visuella referenserna

Varje rad är en gång någon medvetet bytte ut hur en widget får se ut.

## 2026-08-19 — 166 referenser skrivna

- **Motiv:** Initial visuell baslinje for 166 katalognycklar
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-08-20 — 36 referenser skrivna

- **Motiv:** Fyra nya Top Gift-nycklar (cyber, glass, neon, royal) kom in i katalogen med PR #241, som lade tillbaka femton knappar premium-final.js tidigare skrev over. De har aldrig haft referensbilder.
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-08-20 — 170 referenser skrivna

- **Motiv:** Ta om ALLA referenser i en korning: fyra nya Top Gift-nycklar kom in med PR 241, och ranking:templateTopPoints:neon foll pa textrendering (all text markerad, kanalskillnad 255, avatarer och plattor identiska) vilket tyder pa typsnittsdrift mellan tva CI-tillfallen. En gemensam omtagning pa samma binar tar bort driften mellan gamla och nya bilder.
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-08-21 — 170 referenser skrivna

- **Motiv:** Lankraden flyttade upp i arbetsytan (Davids beslut): duken gar darmed fran top=0 till top=153 i riggens sida, som kor med view=editor. Uppmatt: widgetarnas berakande stilar ar IDENTISKA — samma storlek, typsnitt, vikt, teckenavstand och farg — bara Y-laget skiljer, vilket rasteriserar texten pa ett annat subpixellage. 44 nycklar, identisk lista i tre CI-varv, diffbilder med enbart text markerad.
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-08-22 — 170 referenser skrivna

- **Motiv:** Overlay-fixen (PR 264) tar bort lankraden ur OBS-utdata. Riggen laddar studio.html?overlay=1, sa duken gar fran canvasTop 153 till 0 och varje widgets rasterlage flyttas. UPPMATT: sex nycklar fotograferade med gamla koden och med fixen plus duken tvingad tillbaka till 153 blev BYTEIDENTISKA, 6 av 6 - fixen andrar alltsa varken farg, storlek, text eller geometri, bara var duken borjar. KANDIDATGREN: skriver INTE over referenserna i PR 264.
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-02 — 7 referenser skrivna

- **Motiv:** Battle MVP-ramarna visade TOM namnplatta: riggen triggar med {username} och gamla triggerBattleMvp laste bara event.name, sa namnet slangdes tyst. #313 laser bada faltnamnen, och de sju ramarna visar nu vinnarens namn i stallet for en tom platta. A/B pa samma binar: exakt 1064 pixlar i 54x32 vid (124,254) - bara namnraden, inget annat. De tio designstilarna ar byteidentiska; de doljer namnet som standard.
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-03 — 17 referenser skrivna

- **Motiv:** De tio Battle MVP-stilmodellerna visar nu vinnarens namn, klippt med ellips som ramarna redan gjorde. Aterstaller det d0a7156 slackte 2026-08-11 (vid forsta releasen visades namnet alltid; 195fc8a aterstallde det bara for de sju ramarna). Uppmatt i riktig Chromium: sju av tio stilnycklar byter mått, tre (inferno, cyber, samurai) byter bara pixlar.
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-03 — 1 referenser skrivna

- **Motiv:** Tas om med fonts-noto-cjk explicit installerat i badaflodena, sa bilderna slutar bero pa vilken runner-avbildning GitHub tilldelar. Uppmatt: gron korning hade image 20260819.586, rod hade 20260828.587, och de fyra nycklar som foll ritar de enda tva tecknen utanfor Inter och Manrope (U+5200 och U+FF0B).
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-03 — 8 referenser skrivna

- **Motiv:** Tas om med fonts-noto-cjk explicit installerat i badaflodena, sa bilderna slutar bero pa vilken runner-avbildning GitHub tilldelar. Uppmatt: gron korning hade image 20260819.586, rod hade 20260828.587, och de fyra nycklar som foll ritar de enda tva tecknen utanfor Inter och Manrope (U+5200 och U+FF0B).
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-04 — 9 referenser skrivna

- **Motiv:** Samuraiemblemet och foljarmalets ikon ritas numera som inline-SVG i stallet for U+5200 och U+FF0B ur ett systemtypsnitt. Uppmatt i #322: fc-match valde WenQuanYi Zen Hei, inte det Noto vi installerade, sa glyferna berodde pa runner-avbildningen — och pa varje anvandarmaskin utan CJK-tackning blev de tofu. Nu beror de inte pa nagot typsnitt alls.
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-07 — 8 referenser skrivna

- **Motiv:** Diamantmalet (#367 del 1, PR #375) lade till atta katalognycklar utan referensbilder, sa vakten gjorde main rod vid mergen. Forsta forsoket fotograferade noll: generatorn laser nycklarna ur docs/katalogkarta.md, och kartan hade annu inte regenererats. Grenen star nu pa 84272fb dar boten lagt in dem. Bara nya bilder, inga befintliga byts.
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-08 — 178 referenser skrivna

- **Motiv:** Namnplattan i gåvoramen: två rader, namnet skalat efter plattan [referenser]
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-08 — 3 referenser skrivna

- **Motiv:** Bågpodiet (PR #387): like-center är fem platser i en båge vars scen skalas efter ramen — 340 px utan ram. Gäller alla tre :center-nycklar (toplike, TopCoins, TopPoints delar layouten).
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-08 — 12 referenser skrivna

- **Motiv:** Entrén vid första rendern (#387) ändrar 20–57 kantpixlar deterministiskt på tolv rankingnycklar utan ram (identiska tal i två CI-körningar, lokal A/B på annan Chrome gav 0). Alla tolv i EN körning: toplike + ranking:templateTop, så efterkontrollen går grön.
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-11 — 1 referenser skrivna

- **Motiv:** Lägg till godkänd grön Guardian-ram med transparent avatarhål
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-11 — 1 referenser skrivna

- **Motiv:** Lägg till godkända originalet Blå kristall efter kontroll av profilbild och liveentré
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-12 — 12 referenser skrivna

- **Motiv:** Record approved campaign aura designs and add missing references for existing approved MVP designs; no runtime changes.
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-14 — 5 referenser skrivna

- **Motiv:** Referensbilder for de fem djurburkarna efter regenererad katalogkarta (PR #413)
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-14 — 6 referenser skrivna

- **Motiv:** REGI-stilla for battlemvp-celebration (#418, 6 nycklar)
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-20 — 17 referenser skrivna

- **Motiv:** Tolv nya nycklar utan bild (2026-09-19), Top Points i nattens Top Like-layout och Top Streak som Clean Flip med synligt nollage - riggen neutraliserar passformen (#487)
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-20 — 6 referenser skrivna

- **Motiv:** Sex nycklar vars fabriksvag saknade skin/topCoinsDesign - nu de riktiga designerna (#487)
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-21 — 70 referenser raderade

- **Motiv:** Föräldralösa bilder. Ingen av de 70 nycklarna finns i docs/katalogkarta.md, så varken vakten eller riggen läser dem: de låg kvar och såg ut som täckning, samma mönster som giftjar-bilderna i 58a80fa (2026-09-14). Fyra borttagningsvågor: giftcampaign 16 (åtta gamla teman, ersatta av gold/platinum/emerald i 4403ff9, 2026-09-12), socialgoal 24 (1–4 och azure/heart/rose/sapphire-frame för followers/likes/diamonds, ersatta av sex VYRA-designer i PR #475), topstreak 22 (alla varianter, ersatta av en enda Clean Flip i PR #476), toplike 4 och ranking:templateTopCoins 4 (center/clean/neon/podium, ersatta av clean-bar/soft-stack/mini-podium/side-rank respektive halo/signal-orbit i ba916de–5a96741). Inga bilder ritas om: den här raden TAR BORT, den skriver inte. Efter #487:s två referenskörningar (17 + 6 bilder, som bland annat gav de 12 nya nycklarna deras första bild) har manifestet 203 poster, varav 70 föräldralösa — kvar blir 133, lika många som png på disk, och lika många som kartans 149 nycklar minus de 16 som undantagslistan i katalognycklar.js täcker.
- **Motor:** oförändrad, ingen ny fotografering
- **Nycklar:** 70 raderade (se manifestets diff), 133 kvar

## 2026-09-21 — 4 referenser skrivna

- **Motiv:** Top Points fyra designer: podium och neon ritades som samma lista, nu trappsteg respektive neonglod (fyra nycklar)
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-21 — 4 referenser skrivna

- **Motiv:** Top Points om igen efter specificitets- och accentfixen: podium fick rutnat och neon lila brickor i forra korningen
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-21 — 2 referenser skrivna

- **Motiv:** Top Coins ritades som en clean-bar-stapel 250x42 i stallet for sin egen design 230x193 — skinnet ar scopat och bilderna visar nu Halo och Signal Orbit
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-22 — 4 referenser skrivna

- **Motiv:** Top Points blir 300 px bred nar skin-clean-bar inte langre stamplas pa familjen (#498)
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla

## 2026-09-23 — 95 referenser skrivna

- **Motiv:** Hela referensuppsattningen har glidit fran runnern: 95 av 95 nycklar foll i ci.yml och 93 av 96 i den har workflowen, med identiskt fingeravtryck over tva korningar. Bilderna tas om i sin helhet pa dagens pinnade Chromium.
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** alla 95

## 2026-09-24 — 18 referenser skrivna

- **Motiv:** Nya referensbilder for de 18 nya ranking-sixpack-nycklarna, efter fix av bade ReferenceError och for tidig browser.close()
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** 18 av 113 (filter: voltage,basic-v2,prism-vertical,prism-horizontal,celestial,royal-rose) — catalog:ranking:templateTopCoins:basic-v2, catalog:ranking:templateTopCoins:celestial, catalog:ranking:templateTopCoins:prism-horizontal, catalog:ranking:templateTopCoins:prism-vertical, catalog:ranking:templateTopCoins:royal-rose, catalog:ranking:templateTopCoins:voltage, catalog:ranking:templateTopPoints:basic-v2, catalog:ranking:templateTopPoints:celestial, catalog:ranking:templateTopPoints:prism-horizontal, catalog:ranking:templateTopPoints:prism-vertical, catalog:ranking:templateTopPoints:royal-rose, catalog:ranking:templateTopPoints:voltage, catalog:toplike:basic-v2, catalog:toplike:celestial, catalog:toplike:prism-horizontal, catalog:toplike:prism-vertical, catalog:toplike:royal-rose, catalog:toplike:voltage

## 2026-09-24 — 18 referenser skrivna

- **Motiv:** Ranking-sixpack omgjord till prototypernas design: riktiga ramar, en gemensam markup for Top Like/Coins/Points
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** 18 av 113 (filter: voltage,basic-v2,prism-vertical,prism-horizontal,celestial,royal-rose) — catalog:ranking:templateTopCoins:basic-v2, catalog:ranking:templateTopCoins:celestial, catalog:ranking:templateTopCoins:prism-horizontal, catalog:ranking:templateTopCoins:prism-vertical, catalog:ranking:templateTopCoins:royal-rose, catalog:ranking:templateTopCoins:voltage, catalog:ranking:templateTopPoints:basic-v2, catalog:ranking:templateTopPoints:celestial, catalog:ranking:templateTopPoints:prism-horizontal, catalog:ranking:templateTopPoints:prism-vertical, catalog:ranking:templateTopPoints:royal-rose, catalog:ranking:templateTopPoints:voltage, catalog:toplike:basic-v2, catalog:toplike:celestial, catalog:toplike:prism-horizontal, catalog:toplike:prism-vertical, catalog:toplike:royal-rose, catalog:toplike:voltage

## 2026-09-24 — 8 referenser borttagna

- **Motiv:** Davids beslut: de gamla rankingdesignerna tas bort helt. Top Like Clean Bar, Soft Stack, Mini Podium och Side Rank, och Top Points Lista, Tre i mitten, Podium och Neon, finns inte längre i katalogen. Sparade widgetar ritas som närmaste nya design (ranking-sixpack.js PENSION).
- **Nycklar:** 8 borttagna, 105 kvar — catalog:toplike:clean-bar, catalog:toplike:soft-stack, catalog:toplike:mini-podium, catalog:toplike:side-rank, catalog:ranking:templateTopPoints:clean, catalog:ranking:templateTopPoints:center, catalog:ranking:templateTopPoints:podium, catalog:ranking:templateTopPoints:neon

## 2026-09-24 — 3 referenser skrivna

- **Motiv:** Prism horisontal fick fasta kolumnbredder sa podiet ryms pa den 432 px breda mobilduken
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** 3 av 105 (filter: prism-horizontal) — catalog:ranking:templateTopCoins:prism-horizontal, catalog:ranking:templateTopPoints:prism-horizontal, catalog:toplike:prism-horizontal

## 2026-09-26 — 9 referenser skrivna

- **Motiv:** #525 ersatte social goals med nio goal-motion-designer; #528 gav Rail/Tower mått som ryms på duken
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** 9 av 108 (filter: socialgoal) — catalog:socialgoal:diamonds:diamond-orbit:circle, catalog:socialgoal:diamonds:diamond-rail:landscape, catalog:socialgoal:diamonds:diamond-tower:portrait, catalog:socialgoal:followers:crown-orbit:circle, catalog:socialgoal:followers:crown-rail:landscape, catalog:socialgoal:followers:crown-tower:portrait, catalog:socialgoal:likes:heart-orbit:circle, catalog:socialgoal:likes:heart-rail:landscape, catalog:socialgoal:likes:heart-tower:portrait

## 2026-09-26 — 9 referenser skrivna

- **Motiv:** Rail fick luft ovan och under ramen så att rubrik och procent ryms i boxen (#528)
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** 9 av 108 (filter: socialgoal) — catalog:socialgoal:diamonds:diamond-orbit:circle, catalog:socialgoal:diamonds:diamond-rail:landscape, catalog:socialgoal:diamonds:diamond-tower:portrait, catalog:socialgoal:followers:crown-orbit:circle, catalog:socialgoal:followers:crown-rail:landscape, catalog:socialgoal:followers:crown-tower:portrait, catalog:socialgoal:likes:heart-orbit:circle, catalog:socialgoal:likes:heart-rail:landscape, catalog:socialgoal:likes:heart-tower:portrait

## 2026-09-26 — 9 referenser skrivna

- **Motiv:** Fabriken ger de nio goal-motion-designerna katalogknappens mått (Orbit 360, Rail 400, Tower 130) — #528
- **Motor:** Google Chrome for Testing 151.0.7922.34
- **Nycklar:** 9 av 108 (filter: socialgoal) — catalog:socialgoal:diamonds:diamond-orbit:circle, catalog:socialgoal:diamonds:diamond-rail:landscape, catalog:socialgoal:diamonds:diamond-tower:portrait, catalog:socialgoal:followers:crown-orbit:circle, catalog:socialgoal:followers:crown-rail:landscape, catalog:socialgoal:followers:crown-tower:portrait, catalog:socialgoal:likes:heart-orbit:circle, catalog:socialgoal:likes:heart-rail:landscape, catalog:socialgoal:likes:heart-tower:portrait
