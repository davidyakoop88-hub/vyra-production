# VYRALIVE — logotypen

Monogrammet är **VL**, extruderat i djupled. Djupet är inte en skugga utan sexton lager ritade
bakifrån och fram, mörkast längst bak, så att framsidan alltid läses först. Allt är SVG.

Filerna genereras av [`scripts/generera-logo.js`](../../scripts/generera-logo.js). **Redigera inte
SVG-filerna för hand** — ändra generatorn och kör den, annars glider lagren isär mellan filerna:

```bash
node scripts/generera-logo.js assets/logo
```

## Vilken fil till vad

| Fil | Används till |
|---|---|
| `vl-marke.svg` | märket ensamt, mörk bakgrund |
| `vl-marke-ljus.svg` | märket ensamt, ljus bakgrund |
| `vl-marke-mono.svg` | en enda färg — tryck, gravyr, ensfärgade ytor |
| `vl-ikon.svg` | app-ikon och favikon (kvadratisk platta, märket tål 16 px) |
| `vyra-live-ordmarke.svg` / `-ljus.svg` | bara texten |
| `vyra-live-lockup.svg` / `-ljus.svg` | märke + text — **det här sitter på framsidan** |

## Tre saker som är lätta att gå på

**Ordmärket är ritade banor, inte ett typsnitt.** Det finns inget `font-family` någonstans i
filerna. Det är avsiktligt: samma fil ska se exakt likadan ut i en OBS browser source, i Electron,
i favikonen och i tryck, och ett typsnitt som saknas gör tyst något annat av bokstäverna.

**`vl-marke-mono.svg` bär `color="#a83aef"` på rot-elementet.** En SVG som laddas via `<img>` är ett
eget dokument och ärver ingenting från sidan, så `currentColor` faller tillbaka på svart och filen
såg svart ut. Attributet gör att den ser rätt ut som `<img>` — och läggs den inline i HTML slår
`style="color:…"` fortfarande över det.

**Märket ensamt blir en fläck under ~24 px.** Det är därför `vl-ikon.svg` finns: plattan ger
kontrast och håller ända ner till 16 px. Använd ikonfilen till favikon och app-ikon, aldrig
`vl-marke.svg`.

## Höjden på framsidan

Märket sitter överst i `.hero-topp`. Heron är en flexkolumn där `.hero-prisrad` hålls kvar i botten
med `margin-top:auto` — **varje pixel märket tar är en pixel närmare vecket för prisraden**, och
den raden har hamnat under vecket två gånger förut. Krympningen bor i `@media (max-height:1000px)`
sist i `styles.css`, och `tests/browser/framsida-logo.browser.test.js` mäter att raden håller sig
ovanför vecket i en 900px-vy.
