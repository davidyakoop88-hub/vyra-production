# Mätplan för nästa sändning

En sändning är ett tillfälle man inte får om. Det här dokumentet finns för att inget ska behöva
mätas i realtid — **spela in, mät efteråt.**

Det är inte en princip utan en erfarenhet: 2026-09-16 gav tre gamla inspelningar svar på frågor
som timmar av live-felsökning inte hade gett. Bland annat att **emotes aldrig kommer på
emote-kanalen** — 48 av 48 kom som chattrader — vilket förklarade varför en hel triggerfamilj
aldrig kunde fyra.

---

## Före sändningen (5 minuter)

**1. Radera de gamla inspelningarna.**
`Documents/VYRA-inspelningar/` innehåller tre filer från 2026-09-01/02. De är gjorda **före**
maskeringsfixen 2026-09-07 och läcker persondata: 416 person-id, ~3 130 avatarsökvägar och
363 visningsnamn, trots att filhuvudet säger `"maskad":true`. Dela dem aldrig. Radera dem.

Nya inspelningar är säkra — förvalet är numera att maskera allt ogranskat.

**2. Starta inspelningen.**
`SPELA-IN-TIKTOK.cmd` (eller `VYRA_INSPELNING=1`). Den är **av** som standard och rör inte disken
när den är avstängd.

**3. Fixa OBS-källan.** Två fel, uppmätta 2026-09-16:
- Källan `"Webbläsare 2"` är **avstängd** (`visible: false`)
- Länken saknar **`&scene=1`** — utan scennumret avvisar overlayn varje action

**4. Skapa en Action och ett Event** i Studion innan du går live, så något kan trigga.

---

## Under sändningen (tre saker som kräver ögon)

Allt annat mäts ur inspelningen. Det här kan den inte svara på:

**Gåvoväljaren.** Öppna Actions & Events → ett Event → "Välj gåva" och **fotografera**.
Frågan: står namnen på **svenska** med coin-värden? Inspelaren maskerar gåvonamn, så det här är
det enda sättet att se om inlärningen ger rätt språk.

**OBS.** Trigga en action och se att den spelar i OBS — inte bara i Studion. Det är det enda som
bevisar molnvägen hela vägen ut.

**Anslutningsraden.** Inställningar → TikTok. Den ska nu visa `ansluten` i grönt, och vid fel
säga varför. Stämmer den med verkligheten?

---

## Efter sändningen (ett kommando)

```bash
node tiktok-bridge/analysera-inspelning.js <fil.jsonl>
```

Verktyget svarar på tio punkter. Fyra av dem är nya och kommer ur ombyggnaden 2026-09-16:

| Punkt | Frågan | Varför den betyder något |
|---|---|---|
| **A** | Var kommer emotes in, och vad skiljer sticker från emote? | Klassificeringen bygger på `packageId==='fansclub'`, inte på `emoteScene` — mätt mot 156 emotes. Kommer något via `emoteList` finns **båda** vägarna och båda måste fortsätta fungera. |
| **B** | Bär gåvorna coin-värden? | Är `utan_coin_varde > 0` missar varje coin-tröskel de gåvorna. |
| **C** | Vilka händelsetyper gör VYRA inget med? | Anteckningarna säger 74 dokumenterade TikTok-händelser mot VYRA:s 12. Det här är mätningen i stället för gissningen. |
| **D** | Syns moderator, prenumerant, följare och fanklubbsnivå? | Målgruppsfiltren i Events vilar på flaggorna. Är någon **alltid noll** kan motsvarande filter aldrig matcha — tyst. |

Punkt 1–7 är de gamla från `live-verifiering.md` (handsken, battleStatus, matchens slut,
LINK_MIC_ARMIES, Guardian).

---

## Vad vi redan vet, och som bara ska bekräftas

Mätt 2026-09-16 mot tre inspelningar (5 369 händelser). Siffrorna nedan är förväntan — avviker den
nya sändningen är det i sig ett fynd.

| Sak | Uppmätt |
|---|---|
| Emotes via chattrad | 48 av 48 · **noll** via emote-kanalen |
| `packageId` | `fansclub` i 150 av 156 |
| `emoteScene` | 2 i 59 fall, 3 i 97 — **3 finns inte i TikToks proto-enum** |
| Moderator / prenumerant / följare | 127 / 119 / 398 |
| Fanklubbsnivå | 4 669 händelser, nivå 1–50, vanligast 19 |
| Ohanterade händelsetyper | 17 · störst `link_mic_armies` (305), `in_room_banner` (67), `gift_panel_update` (63) |

---

## Det som bara går att mäta med en levande anslutning

**`fetchAvailableGifts()`** — hela gåvokatalogen från rummet, med namn på streamerns språk och
coin-värden. Anropet är ett rumsanrop utan inloggning, men kräver en öppen anslutning. Fältnamnen
(`diamond_count` mot `diamondCount`, `url_list` mot `urlList`) är lästa ur bibliotekets
typdefinition och **aldrig provade mot ett riktigt rum**. Går det fel blir katalogen tom, inte
trasig.

Kontroll: öppna gåvoväljaren när anslutningen är grön. Fylls den med blåmärkta poster som bär
riktiga namn och värden fungerar vägen.

---

## En regel att bära

Fyra av dagens fem "fynd" var **mina egna mätfel**, inte produktfel:

- Radavståndet rapporterades som `ok` för att värdet ÄNDRADES — men båda värdena var fel
- Gåvorna såg ut att sakna coin-värden för att jag kopierat fältvägar i stället för att använda
  normalizern
- Ett prov föll på identiskt innehåll för att arrayen tillhörde jsdoms realm
- En glyfdetektor fångade myntet men missade tangentbordet

Därför: **ställ alltid kontrollfrågan.** Ett mått som ger samma svar före och efter mäter inte det
du tror. Och ett mått som bara frågar "ändrades något" godkänner sin egen bugg.
