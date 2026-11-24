# AI-guidefilmen på startsidan

En ca 60 sekunder lång film där en AI-avatar förklarar hur VYRA fungerar, på startsidan mellan "Prova direkt" och
"Från widget till OBS i tre steg". Sektionen (`#guide-film` i `index.html`) finns redan med en **platshållare**. Det här är vad som
återstår för att byta den mot filmen.

## Beslut som är tagna

- **Avatar:** en färdig avatar från ett verktyg (inte en riktig person, inte Davids ansikte). Önskemål: **en kvinnlig avatar**.
- **Märkning:** filmen och texten bredvid säger att guiden är AI-genererad. Det ska stå kvar.
- **Språk:** svenska. Engelsk undertext följer med språkbytet om vi gör en (se nedan).

## Manus (ca 150 ord, 60 sekunder)

Samma text står på sidan under "Läs vad guiden säger". **Ändras en rad här ska den ändras i `index.html` och i `vyra-sprak-en.js`.**

1. Hej! Jag är en AI-avatar och guidar dig genom VYRA.
2. Streamar du på TikTok LIVE? Då vet du att det är de små sakerna som får tittarna att stanna: en gåva som firas, ett mål som fylls, en topplista som lever.
3. Med VYRA fixar du det i tre steg, utan kod och utan att installera något.
4. Ett: välj widgets ur katalogen, över 150 designer.
5. Två: anpassa text, färger och placering, och bestäm i Action & Event vad som ska hända när någon skickar en gåva.
6. Tre: kopiera din overlay-länk och lägg den som Browser Source i OBS eller Streamlabs. Det du ändrar i VYRA syns direkt i sändningen.
7. Vill du ha mer kontroll finns VYRA Desktop för Windows, med scenstyrning i OBS, Stream Deck och automatisk backup.
8. Prova 3 dagar gratis. Säger du upp innan provperioden är slut dras ingenting. Därefter kostar det 15 USD i månaden.
9. Skapa ditt konto på vyralive.app och gör din LIVE till en show.

Alla påståenden (3 gratisdagar, 15 USD/månad, över 150 designer, OBS/Streamlabs, Desktop-funktionerna) står redan på startsidan.
**Ändras något där, ändra manuset och spela in filmen på nytt.** I filmen säger avataren "femton dollar"; på sidan står "15 USD".

## Producera filmen

1. Välj avatarverktyg (CapCut, HeyGen eller liknande). Välj en kvinnlig, färdig avatar och svensk röst.
2. **Testa 10 sekunder först.** Hur bra svensk text-till-tal blir har inte kontrollerats i något av verktygen.
3. Mata in manuset. Bakgrund: enkel och mörk, i linje med sidans färger (`#070417`).
4. Exportera **MP4 (H.264) i 1280×720 eller 1920×1080, 16:9**. Håll filen under ca 8 MB (webbfilmer i repot är små).
5. Gör en stillbild (poster) ur filmen: `guide-poster.webp`, 1280×720.
6. Valfritt: en svensk undertext som `guide.sv.vtt` (WebVTT). Verktygen kan oftast exportera en.

## Byta platshållaren mot filmen

**Filerna måste ligga i `assets/` (t.ex. `assets/guide/`).** Webbimagen kopierar rotens bild-, ljud- och typsnittsfiler men *inte* `.mp4`
eller `.webm`; en film i roten ger 404 i produktion. Se `Dockerfile`.

I `index.html`, ersätt hela `<div class="avatarguide-plats" …>…</div>` inuti `data-avatarguide-film` med:

```html
<video controls playsinline preload="none"
       poster="assets/guide/guide-poster.webp?v=ÅÅÅÅMMDD-1"
       aria-label="VYRA-guiden förklarar hur VYRA fungerar">
  <source src="assets/guide/guide.mp4?v=ÅÅÅÅMMDD-1" type="video/mp4">
  <track kind="captions" srclang="sv" label="Svenska" src="assets/guide/guide.sv.vtt?v=ÅÅÅÅMMDD-1" default>
</video>
```

Regler som `tests/avatar-guide.test.js` vaktar: **inget `autoplay`**, `controls` finns, `preload="none"` (filmen laddas inte förrän någon trycker
play), filen ligger under `assets/` eller `public/`, och sektionen säger att guiden är AI-genererad. Ta bort kommentaren `PLATSHÅLLARE` i samma ändring.

Lägg inte `muted autoplay` på filmen: guiden är en berättelse med ljud, och en tyst automatisk uppspelning gör den värdelös.

## Kvar att bestämma

- Om en engelsk version ska finnas. Språkbytet byter bara texterna; filmen är svensk, och undertexten (`guide.sv.vtt`) följer inte med.
- Var filmen mer ska användas (Shorts, TikTok). Det är en annan film, i 9:16.
