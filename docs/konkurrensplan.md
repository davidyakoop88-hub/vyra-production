# Konkurrensplan — hur VYRA går om i stället för att komma ikapp

Skriven 2026-09-17. Underlaget är **mätt**, inte hämtat ur minnet: konkurrentens egen publika
funktionslista lästes av samma kväll, och VYRA:s sida räknades ur `docs/katalogkarta.md`, som
genereras ur den körande katalogen i en riktig webbläsare.

Ingen konkurrentkod är läst eller kopierad. Allt nedan bygger på publika beskrivningar.

## Utgångsläget, i siffror

| | VYRA | Konkurrenten |
|---|---|---|
| Widgetdesigner | **277 kort i 23 sektioner** | ~1–5 per funktion, 27 funktioner listade |
| Egen designmotor | ja (widgetfabrik + katalog + shadow-miniatyrer) | okänt, men listan tyder på färre varianter |
| Stream Deck-plugin | ja | ja |
| Verifierat TikTok-handtag | ja (2026-09-17) | ja |

**Slutsatsen är inte att vi ligger efter.** Vi ligger efter på *bredd i interaktion* och långt före på
*djup i design*. Det avgör var pengarna ska läggas: **inte på fler designer.** Där är loppet redan
vunnet, och varje ny variant har avtagande värde.

## Vad som faktiskt saknas — uppmätt i koden

Sökt i hela repot, testfixturer borträknade:

| Funktion de har | Finns i VYRA | Kommentar |
|---|---|---|
| Chattruta (18+ teman) | **nej** | enda träffen är en nämning i `extras.js` |
| Låtönskningar | **nej** | noll träffar |
| Spel och quiz | **nej** | träffarna är testfixturer |
| Donationssida (PayPal) | **nej** | träffarna är landningssidans text |
| Bakgrundsbibliotek | **nej** | noll träffar |
| Live-tittarlista | **nej** | noll träffar |
| Prestandaguide | delvis | motorn finns (`vfx-performance-monitor.js`), guiden saknas |
| Topplistor, mål, gåvoalerts, följaralerts, TTS, ljudalerts, scenlänkar, gåvovideor, skärmeffekter | **ja** | och med fler designer än de visar |

## Den strategiska nyckeln

Designmotorn är tillgången, och den gör luckorna billigare för oss än de var för dem.

En chattruta hos oss behöver inte bli *en* chattruta. Widgetfabriken, katalogen och
shadow-miniatyrerna finns redan — samma maskineri som gav 40 designer åt Top Gifter ger 18 teman åt
en chattruta till en bråkdel av kostnaden. **Vi kan gå in i deras starkaste funktioner och komma ut
med fler varianter än de har.**

Det är skillnaden mellan att komma ikapp och att gå om.

## Planen, billigast först

### 1. Starttappet — dagar, märks för varje sändare

Uppmätt: `connection-manager.js` pollar var 15:e sekund, men en brygga som misslyckas backar av med
fördubbling upp till **fem minuter**. Konkurrenten lovar *"usually within seconds"*.

Det märks i exakt det ögonblick som betyder mest — starten av sändningen.

Verifieringen ger nu argumentet: ett verifierat konto är bevisligen någons eget och försvarar
tätare pollning än ett fritextnamn som kan vara felstavat.

- sänk taket för verifierade konton
- lägg till en **"Anslut nu"**-knapp för den som vill ha det garanterat i stället för automatiskt
- **mät den faktiska fördröjningen först** — fem minuter är ett värsta fall, inte ett typiskt

### 2. Protokolluckan — gratis vid nästa sändning

Referensimplementationen dokumenterar 74 händelser. VYRA prenumererar på **tolv**.

Kör nästa sändning med `VYRA_INSPELNING_TYPER=alla` och jämför observerade typer mot dem bryggan
lyssnar på. Bygg inget på spekulation innan den mätningen finns.

Kandidater som redan ser värdefulla ut:

| Händelse | Varför |
|---|---|
| `LivePause` / `LiveUnpause` | VYRA märker att sändningen slutar, men inte att den pausas. Liten fix, tydlig effekt. |
| `Envelope` | röda kuvert — en intäktshändelse som inte visas alls |
| `Poll` / `QuestionNew` | färdiga interaktionsformat, inget behöver uppfinnas |
| `SuperFan` | tittarkategori med status |

### 3. Chattrutan — veckor, och där vi går om

Den mest synliga luckan, och den billigaste att vinna på grund av designmotorn. Mål: **fler teman än
deras 18**, byggda genom katalogen som allt annat.

### 4. Live-tittarlistan och låtönskningar — veckor

Två funktioner de har och vi saknar helt. Låtönskningar har dessutom en färdig koppling: Spotify
finns redan i repot (`spotify-client.js`).

### 5. Den publika händelsekopplingen — vägvalet

Ett dokumenterat gränssnitt: *"när gåva X kommer, anropa den här adressen."* Motorn finns i
Automatik, den lokala HTTP-servern finns.

Det gör VYRA till något andra bygger **på**. Det var så TikFinity fick sitt ekosystem gratis, och
det är det enda på listan som blir mer värt utan att någon rör det.

**Det löser också spel-luckan** — den dyraste posten — genom att låta andra bygga spelen.

## Vad vi inte ska göra

- **Beta av deras lista uppifrån och ner.** Då är VYRA permanent tvåa: alltid i färd med att bygga
  det de redan visat.
- **Fler widgetdesigner för egen skull.** 277 räcker; nästa hundra flyttar ingenting.
- **Livstidspris.** Ett lån från framtida intäkter. Prissättningen är beslutad: 15 USD/mån.
- **Bygga för 74 händelsetyper på spekulation.** Mät först.

## Ordningen

1. **Nu:** starttappet (1) — avgränsat, mätbart, märks direkt
2. **Nästa sändning:** protokollmätningen (2) — kostar ingenting extra
3. **Sedan:** chattrutan (3), därefter tittarlista och låtönskningar (4)
4. **Beslut med öppna ögon:** händelsekopplingen (5)

Relaterat: `docs/VYRA_MASTER_ROADMAP.md`, `docs/HANDELSEKARTA.md`, `docs/katalogkarta.md`.
