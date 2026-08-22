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
