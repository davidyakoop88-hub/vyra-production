# AI-guidefilmen på startsidan

En ca 60 sekunder lång film där en AI-avatar förklarar hur VYRA fungerar, på startsidan mellan "Prova direkt" och
"Från widget till OBS i tre steg". Sektionen (`#guide-film` i `index.html`) finns redan med en **platshållare**. Det här är vad som
återstår för att byta den mot filmen.

## Beslut som är tagna

- **Avatar:** en påhittad, kvinnlig avatar (inte en riktig person, inte Davids ansikte). **Bilden görs i ChatGPT, filmen i CapCut.**
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

## Producera filmen: bilden i ChatGPT, resten i CapCut

Arbetsfördelning: **ChatGPT gör avatarbilden, CapCut gör filmen** (röst, läppsynk, text och export). Jag (Claude) tar emot filerna och gör posterbild,
komprimering, undertext och själva bytet på sidan.

### 1. Avatarbilden (ChatGPT)

CapCuts foto-till-talande-avatar behöver ett **tydligt, rakt framifrån-foto**. Be om en bild som är lätt att animera: stängd eller lätt neutral mun,
jämnt ljus, inget som skymmer ansiktet. Lägg ingen text eller logga i bilden.

Prompt (på engelska, ger bäst resultat):

```text
A friendly young female presenter, fictional person (not a real or recognizable individual), Scandinavian look, shoulder-length light brown hair,
a warm, relaxed, closed-mouth smile, looking straight into the camera, perfectly front-facing, head and shoulders, centered.
Wearing a simple dark charcoal top. Soft, even studio lighting with a subtle violet and gold rim light.
Plain deep navy-violet background (#070417), clean modern tech presenter style. Hair away from the face, no glasses, no hands in frame.
No text, no logo, no watermark. Photorealistic. Square 1:1 image.
```

- Be om flera varianter och välj den där **ansiktet är mest rakt och skarpt**; en lätt vriden eller halvt dold bild ger ofta konstig läppsynk.
- Skriv i prompten att personen är påhittad. Använd inte ett foto av en verklig person utan hens medgivande.
- Spara bilden som PNG eller JPG.

### 2. Filmen (CapCut)

Stegen nedan är hämtade från CapCuts egna guider och kan ha ändrats; menynamnen kan skilja sig i din version.

1. Öppna CapCut (webben eller appen) och välj **AI avatar / Avatar video**, och därefter **ladda upp ditt foto** (talande avatar från foto) eller välj en färdig avatar.
2. Välj **svensk röst** om det finns. **Testa först 10 sekunder** (första meningen) och lyssna på uttalet av VYRA, OBS och TikTok.
3. Klistra in **TTS-versionen** av manuset nedan (siffror och förkortningar är skrivna så att rösten läser dem rätt).
4. Format **16:9**. Bakgrund enkel och mörk (`#070417`). Slå på **automatiska undertexter** om CapCut kan det.
5. Exportera **MP4, 1080p**. Exportera också **undertexten som SRT** om funktionen finns.
6. Kolla att filmen **inte** har CapCuts vattenmärke (beror på plan).

### TTS-versionen av manuset (till röstmotorn, inte till sidan)

Samma innehåll som manuset ovan, men skrivet så att en svensk talsyntes läser rätt. Hittar rösten fel uttal, ändra bara här:

```text
Hej! Jag är en AI-avatar och guidar dig genom Vyra.
Streamar du på TikTok LIVE? Då vet du att det är de små sakerna som får tittarna att stanna: en gåva som firas, ett mål som fylls, en topplista som lever.
Med Vyra fixar du det i tre steg, utan kod och utan att installera något.
Ett: välj widgets ur katalogen, över hundrafemtio designer.
Två: anpassa text, färger och placering, och bestäm i Action och Event vad som ska hända när någon skickar en gåva.
Tre: kopiera din overlay-länk och lägg den som Browser Source i O B S eller Streamlabs. Det du ändrar i Vyra syns direkt i sändningen.
Vill du ha mer kontroll finns Vyra Desktop för Windows, med scenstyrning i O B S, Stream Deck och automatisk backup.
Prova tre dagar gratis. Säger du upp innan provperioden är slut dras ingenting. Därefter kostar det femton dollar i månaden.
Skapa ditt konto på vyra live punkt app och gör din LIVE till en show.
```

(Vilket uttal av "Vyra" som låter rätt är något att lyssna ut. Skriv "Vira" eller "Vyyra" i röstmotorn om grundstavningen blir fel. Sidan ändras inte.)

### 3. Leverans till repot

Lägg filerna på PR-grenen `claude/vigilant-albattani-zj13kz` under **`assets/guide/`** (GitHub: *Add file → Upload files*), och säg till:

| Fil | Namn |
|---|---|
| Filmen | `guide.mp4` (gärna under 8 MB) |
| Avatarbilden (valfritt, för posterbilden) | `avatar.png` |
| Undertext om CapCut gav en | `guide.srt` |

Jag gör sedan: posterbilden `guide-poster.webp` (ur filmens första bildruta eller avatarbilden), komprimering om filmen är för stor, `guide.sv.vtt` ur SRT:n,
bytet av platshållaren i `index.html`, och kör proven.

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
