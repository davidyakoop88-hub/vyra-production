# Ram-import — importera-och-registrera-pipeline

Verktyg för att ta en rambild (ornerad ring, glas-orb, geometrisk) och göra den till
en färdig, transparent widget-ram som renderaren kan använda. Byggt för att skala:
lägg in fler ramar utan handpill.

Kräver `jimp` (devDependency). All bearbetning sker lokalt i Node — ingen webbläsare.

## Använda

```bash
npm run frame:import -- --src <bild> --name "Namn" [flaggor]
```

| Flagga | Beskrivning | Standard |
|---|---|---|
| `--src <fil>` | Källbild (JPG/PNG) på enfärgad, oftast svart, bakgrund. **Krävs.** | — |
| `--name "Namn"` | Visningsnamn. **Krävs** (om inte `--slug` ges). | — |
| `--slug <s>` | Filnamns-slug (a–z, 0–9, bindestreck). | härleds ur namnet |
| `--shape circle\|square` | Placeringsyta: rund (ring/orb) eller rektangulär (fyrkant/romb). | `circle` |
| `--bg <0–255>` | Tröskel för "bakgrund" (max av R/G/B under detta = bakgrund). Höj om glöd-/mörka kanter äts. | `38` |
| `--out-dir <dir>` | Var ram + manifest skrivs. | `assets/topstreak-frames` |
| `--dry` | Visa vad som skulle skrivas, skriv inget. | av |

Exempel:

```bash
npm run frame:import -- --src ~/Downloads/fire.jpg --name "Fire Dragon"
npm run frame:import -- --src frame.png --name "Neon Square" --shape square --bg 30
```

## Vad den gör

1. **Bakgrundsurklippning** — flood-fill av nära-svart från kanterna *och* mitten →
   både ytterbakgrund och mitthål blir transparenta (profilbilden syns i mitten).
2. **Beskär** till innehållet (+6 px marginal).
3. **Placeringsdetektering:**
   - `circle`: hittar ringens/orbens **verkliga mitt** och innerradie robust, även om
     ringen har en glugg (morfologisk stängning + flood av den inneslutna insidan).
   - `square`: hittar den rektangulära öppningen.
4. **Skriver** `<slug>.png` (transparent) och uppdaterar `frames.json`.

## Manifest (`frames.json`)

Renderaren läser detta för att veta var profil/gåva ska sitta i varje ram:

```json
{
  "version": 1,
  "frames": {
    "fire-dragon": {
      "name": "Fire Dragon",
      "file": "fire-dragon.png",
      "w": 608, "h": 652,
      "shape": "circle",
      "placement": { "cx": 326, "cy": 323, "r": 229 }
    }
  }
}
```

`cx/cy/r` (och `x/y/w/h` för `square`) är i ramens egna pixelkoordinater; renderaren
skalar mot visningsstorleken. "Ram över bild": profilbilden fyller `r` (ev. ×faktor)
och ramen ritas ovanpå.

## Nästa steg (ej i detta verktyg än)

- Runtime-koppling: låta widget-renderaren läsa `frames.json` och rita ram + placera
  profil/gåva enligt `placement`, med flippen.
- Fler former och maskning (klippa profilbilden exakt till öppningen).
