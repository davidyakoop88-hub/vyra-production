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
