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

## Så byggs den — samma mönster som Battle MVP

Ingen handritad SVG. En PNG per steg plus en geometritabell som säger var avatarhålet sitter, precis
som `'battlemvp.frame'` gör för `assets/mvp-frames/gold-crown.png`:

```
assets/guardian-emblem/steg-1.png … steg-4.png
'guardianemblem.step': { 1:{ aspect, circle:{left,top,width,height} }, … }
```

Koreografin står kvar oförändrad — den animerar bildlagret, avatarhålet och texten i stället för
fjorton handritade delar.

