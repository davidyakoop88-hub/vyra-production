# Guardian Emblem — referensdesignen

Fyra referensbilder levererade 2026-08-18, som två ark med två emblem på varje. Bildfilerna ligger i
`assets/guardian-emblem/`. Den här filen säger vad som är vad, eftersom filnamn ensamma inte
förklarar en progression.

## Placeringen — låst

| Ark | Vänster | Höger |
|---|---|---|
| Ark A | steg **1** | steg **3** |
| Ark B | steg **2** | steg **4** |

## Vad varje praktsteg lägger till

| Steg | Nytt i det här steget |
|---|---|
| **1** | Ringen ensam. Guldblad som spretar utåt, vita fjädrar bakom, blå diamant i guldfattning nedtill. **Ingen hjort.** |
| **2** | **Hjorten anländer** — bart huvud, stort guldgevir som breder ut sig över hela bredden, diamantspets på ringens överkant, **två** blå kristaller |
| **3** | **Liten krona** på hjortens huvud med en blå sten, **fyra** kristaller |
| **4** | **Stor kronkrona** med flera spiror och blå stenar, fylligare vita vingar, fyra kristaller |

Progressionen är kumulativ: varje steg bär allt det föregående bär.

## Paletten — guld, vitt, isblått

| | |
|---|---|
| Guld, ljust | `#f0c96a` |
| Guld | `#d9a327` |
| Guld, djupt | `#9a6f16` |
| Diamant, ljus | `#dceaff` |
| Diamant, mättad | `#5b9ff5` |
| Fjäder, vit | `#f7f5f0` |
| Avatarhål | `#1a1a1a` |

**Det finns inget grönt i designen.** Fjädrarna är vita, stenarna är blå diamanter. En tidig version
byggdes i skogsgrönt och smaragd — det var fel läsning och är borttaget.

## Regler som följer av bilderna

- **Ramen är rund, aldrig en sköld.** Det finns inga sköldar någonstans i designen.
- **Hjorten hör till steg 2 och uppåt.** Steg 1 har ingen hjort.
- **Kronan skiljer steg 3 från steg 4** — liten mot stor, inte närvarande mot frånvarande.
- **Geviret får sticka ut i höjd, aldrig i bredd.** 400 px är formatet.
- Bilderna kommer med **vit bakgrund**. Den måste bort: overlayn i OBS är transparent, och en vit
  platta bakom emblemet syns som en vit ruta i sändningen.

## Så den är byggd — bild plus geometri, samma mönster som Battle MVP

Ingen handritad SVG. En PNG per steg plus en tabell som säger var avatarhålet sitter, precis som
`'battlemvp.frame'` gör för `assets/mvp-frames/gold-crown.png`.

### Filerna

| | |
|---|---|
| `kalla-ark-a.png` | originalarket, steg 1 till vänster och steg 3 till höger |
| `kalla-ark-b.png` | originalarket, steg 2 till vänster och steg 4 till höger |
| `steg-1.png` … `steg-4.png` | urklippta, bakgrundsfria, beskurna till konstverkets egen kant |

Originalarken ligger kvar med flit. Urklippet går att göra om, och utan källan hade en ny mätning
inneburit en ny leverans från dig.

### Geometrin, mätt och inte skattad

| Steg | Fil | Pixlar | `aspect` | Hålets vänster/topp % | Hålets bredd × höjd % |
|---|---|---|---|---|---|
| **1** | `steg-1.png` | 761×749 | 0.9842 | 26.81 / 32.71 | 45.47 × 44.33 |
| **2** | `steg-2.png` | 763×921 | 1.2071 | 29.10 / 47.67 | 40.76 × 31.70 |
| **3** | `steg-3.png` | 756×956 | 1.2646 | 27.38 / 47.49 | 43.52 × 32.43 |
| **4** | `steg-4.png` | 766×985 | 1.2859 | 28.98 / 48.22 | 42.17 × 30.56 |

`aspect` är höjd delat med bredd. Bredden är 400 px i alla steg, så **`aspect` är det praktnivån
betalar med** — 0,98 → 1,21 → 1,26 → 1,29.

### Hur mätningen gick till

**Bakgrunden** togs bort med flood fill från bildkanten, inte med en färgnyckel. Bakgrunden är en
jämn guldgradient som ligger färgmässigt nära ornamentets guld — en global nyckel hade ätit hål i
emblemet. En fyllning som växer inåt från kanten och jämför mot **grannen** i stället för mot ett
globalt frövärde följer gradienten och stannar vid varje hård kant.

**Avatarhålet** mättes som största sammanhängande yta av omättade mörka pixlar. Första försöket tog
bounding box över *alla* sådana pixlar och fick 87 % bredd för steg 1 — den ramade in varenda skugga
mellan guldbladen också. Alla fyra ger nu fyllnadsgraden **0,78** mot sin bounding box. Det är π/4,
alltså exakt vad en cirkel ger: mätningen hittade en skiva i varje bild, inte en skugga.

### Två saker som bara syntes på foto

1. **Avataren låg bakom konstverket.** Bilden bär sin egen platshållare i hålet — en ogenomskinlig
   svart skiva med grå siluett. En avatar under den hade aldrig synts. Avataren ligger nu över, med
   genomskinlig botten så att platshållaren syns när ingen Guardian har anlänt.
2. **Bildlådan bär sitt höjdförhållande i `padding-top`, inte i pixlar.** Sätts höjden i pixlar
   räcker det att ett steg byts mot en bild med annan proportion för att emblemet ska bli utdraget,
   och det syns först i sändning.
