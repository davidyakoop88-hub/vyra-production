# TikFinity · Actions — facit från 15 skärmbilder (2026-09-16)

Avskrift, fält för fält, av TikFinitys Action-del. Detta är **målbilden**: VYRA:s
Action-vy ska bygga samma sak, inte den vi har idag. Events behandlas i ett eget
dokument när David skickar de bilderna.

Ordningen nedan är exakt den TikFinity visar. Etiketterna står på engelska som i
originalet; svensk text för VYRA sätts först när David godkänt strukturen.

---

## 1. Listvyn (bild 1)

Rubrik: **Actions**

Brödtext, två rader:
> What do you want to happen? Here you can create new actions and edit the existing ones.
> You can link these actions to events below.

Kontrollrad:

| Element | Typ | Läge på bilden |
|---|---|---|
| `+ Create new Action` | knapp | vänster |
| `Enabled` | kryssruta | ikryssad, direkt till höger om knappen |
| `Search existing actions...` | sökfält med förstoringsglas | högerställt |

Tabellkolumner, vänster till höger:

1. **Radikoner** (fyra, ingen rubrik): ▶ kör · ✏ redigera · ⧉ duplicera · 🗑 radera
2. **Name**
3. **Screen**
4. **Duration (sec.)**
5. **Points +/-**
6. **Animation** (kryssruta)
7. **Picture** (kryssruta)
8. **Sound** (kryssruta)
9. **Video** (kryssruta)
10. **Description**

Uppmätt ur raderna:

| Name | Screen | Duration | Points | Kryss | Description |
|---|---|---|---|---|---|
| Nala | Screen 3 | 10 | 0 | Video | `Play Video pinflik.com__Taylor_swift_pink_aesthetic_wallpaper__Taylor_pin (kopia).mp4` |
| batbutiii | Screen 3 | 10 | 0 | Video | `Play Video IMG_9864 (1).mov` |
| messia | Screen 3 | 8 | 0 | Video | `Play Video FullSizeRender (38).mov` |
| messaia | Screen 3 | 8 | 0 | Video | `Play Video FullSizeRender (38).mov` |
| Nono2020 | Screen 2 | 6 | 0 | Picture | `Show image-generation_..._result-removebg-preview.png` |
| Salsa, Dvd, Lexi, Baris, mela, nono | Screen 3 | 8 | 0 | Video | `Play Video <Namn>.mov` |

**Tre saker att bära härifrån:**

- `Description` är **genererad**, inte skriven av användaren: verbet plus filnamnet
  (`Play Video <fil>`, `Show image<fil>`). Den ska aldrig vara ett inmatningsfält.
- Kryssrutekolumnerna 6–9 är en **avläsning** av vilka funktioner actionen valt —
  fyra av sjutton har egen kolumn, resten syns bara i Description.
- `Screen` och `Points +/-` står i listan, alltså måste båda finnas per action.

---

## 2. Dialogen "New Action" — ramen (bild 2, 14, 15)

Rubrik **New Action**, stängkryss uppe till höger.

### 2.1 Namn

> What is the name of the action?

Ett textfält, platshållare `e.g. Subscription Animation`.

### 2.2 Funktionslistan

> What should happen? (multiple options selectable)

**Sjutton kryssrutor i denna ordning:**

| # | Etikett | Vad som fälls ut när den kryssas |
|---|---|---|
| 1 | Show Animation | (ej avbildad) |
| 2 | Show Picture / GIF | `Select file` + `or Drop file here` |
| 3 | Play Audio | `Open Sound Library` **och** `Select file` + `or Drop file here` |
| 4 | Play Video File | `Select file` + `or Drop file here` + konverteringstips |
| 5 | Show Alert (User + Text) | textfält + färgväljare + `Global Overlay Settings` + variabelrad |
| 6 | Read Text (TTS) | textfält + variabelrad + Voice + Speed + Pitch + Random Voice + Test |
| 7 | Send Chatbot Message | textfält + variabelrad |
| 8 | Switch OBS Scene | (ej avbildad) |
| 9 | Activate OBS Source | (ej avbildad) |
| 10 | Trigger WebHook | URL-fält + `How does this work?` |
| 11 | Exec Minecraft Command | (ej avbildad) |
| 12 | Simulate Keystrokes | `Select Keystroke` → egen dialog |
| 13 | Third-Party Action | (ej avbildad) |
| 14 | Control Custom Goal | (ej avbildad) |
| 15 | Set Voicemod Voice | (ej avbildad) |
| 16 | Streamer.bot Action | (ej avbildad) |
| 17 | Control Timer | (ej avbildad) |

Formen: kontrollerna fälls ut **på samma rad, till höger om kryssrutan**, och raden
växer i höjd. Ingen separat panel längre ned. Det är en avgörande skillnad mot VYRA
idag, som lägger alla fält i en egen `.ae-action-options`-låda ovanför rutnätet.

### 2.3 Visningstid

> How long should it be displayed?

`Display duration (seconds)` — sifferfält med upp/ned-pilar, standard **10**.

### 2.4 Poäng

> Should the trigger user receive a reward or must they pay for it? (optional)

- `Add points` — kryssruta
- `Remove points` — kryssruta

Alltså **kryssruta plus belopp**, inte två egna funktionstyper i listan ovan.
VYRA har dem idag som `addPoints`/`removePoints` bland funktionerna — fel plats mot facit.

### 2.5 Ytterligare inställningar

> Additional settings (optional)

| Fält | Kontroll | Standard |
|---|---|---|
| Media sound volume | reglage | längst till höger (max) |
| Overlay Screen | rullgardin | `Screen 1` |
| Global Cooldown | sifferfält | `0 Seconds` |
| User Cooldown | sifferfält | `0 Seconds` |
| Enable Fade-In/Out | kryssruta | ikryssad |
| Repeat with gift combos | kryssruta | urkryssad |
| Skip on next action | kryssruta | urkryssad |

Fot: `Save` · `Cancel`

---

## 3. Show Picture / GIF (bild 3)

Kryssrutan ikryssad → på samma rad: knappen `Select file` och texten
`or Drop file here`. Alltså både filväljare och drop-yta.

---

## 4. Play Audio (bild 4)

Två kontroller staplade till höger om kryssrutan:

1. `Open Sound Library` — knapp till ett inbyggt ljudbibliotek
2. `Select file` + `or Drop file here`

VYRA har idag bara en `input type="file"`. Ljudbiblioteket saknas helt.

---

## 5. Play Video File (bild 5)

`Select file` + `or Drop file here`, och under dem en hjälptext:

> If the file is not supported, too large or does not play, use freeconvert.com to
> convert the file to a compatible format. The recommended format is MP4 with H264
> codec (streamable).

`freeconvert.com` är en länk.

---

## 6. Show Alert (User + Text) (bild 5, 8)

På raden:

- textfält, platshållare `e.g. Thanks for {giftname}!`
- **färgväljare**: liten vit/svart ruta med nedåtpil
- knapp `Global Overlay Settings` (kugghjulsikon)

Under: **Placeholder Params:** `{giftname}` `{repeatcount}` `{coins}`
`{likecount}` `{totallikecount}` `{comment}` `{submonth}`

> Observera: `{username}` står **inte** i alert-raden trots att funktionen heter
> "User + Text" — användarnamnet ritas som eget element, inte via variabel.

### Färgväljaren (bild 8)

Egen dialog: mättnads-/ljushetsfyrkant, lodrät nyansremsa, förhandsruta uppe till
höger, sifferfälten **R / G / B** (223 / 223 / 223) och hexfältet **#** `dfdfdf`.
Knappar `OK` · `Cancel`.

---

## 7. Global Overlay Settings (bild 6, 7)

Egen dialog med rubriken **Overlay Settings**, rullbar. Fält i ordning:

**Typsnitt**

| Fält | Kontroll | Värde på bilden |
|---|---|---|
| Font | rullgardin | `Noto Sans` |
| Font Size | sifferfält | 45 |
| Font Line Spacing | sifferfält | 45 |
| Font Letter Spacing | sifferfält | 65 |

**Font Effects** (rubrik i blått)

- Enable Wave Effect ✓
- Enable Move Effect ✓
- Enable 3D Effect ✓
- Enable Wiggle Effect ✓
- Enable Text Shadow ✓

**Font Border**

- Enable Font Border ✓
- Border Color — `#242424`

**Usernames**

- Enable Custom Color ✓

**Username Text Effects**

- Username Text Effect — rullgardin, `The Aurora`

**Size**

- Picture Size — 85
- Username Size — 50

**Options**

- Show Profile Picture ✓
- Show Gift Picture ☐
- Single Text Line ☐

Fot: `Test` (grå/inaktiv på bilden) · `OK`

Detta är den enskilt största luckan. VYRA:s `#aoGlobalPanel` har fem fält
(placering, textstorlek, typsnitt, accentfärg, bakgrund). Facit har **nitton**,
och fem av dem är namngivna rörelseeffekter.

---

## 8. Read Text (TTS) (bild 9)

- textfält, platshållare `e.g. Welcome {username}!`
- **Placeholder Params:** `{username}` `{giftname}` `{repeatcount}` `{coins}`
  `{likecount}` `{totallikecount}` `{comment}` `{submonth}`
- `Voice` — rullgardin, `Male Voice`
- `Speed` — reglage, mitten
- `Pitch` — reglage, mitten
- `Random Voice` — kryssruta
- `Test` — knapp med pil

VYRA har alla dessa. Skillnad: VYRA fyller rösten med maskinens faktiska röster;
TikFinity visar generiska namn (`Male Voice`). Vår lösning är den bättre — ändra inte.

---

## 9. Send Chatbot Message (bild 10)

- textfält, platshållare `e.g. Welcome to my broadcast!`
- **Placeholder Params:** `{giftname}` `{repeatcount}` `{coins}` `{likecount}`
  `{totallikecount}` `{comment}` `{submonth}` ← inget `{username}`

---

## 10. Trigger WebHook (bild 11)

- textfält, platshållare `WebHook URL (https://maker.ifttt.com/trigger/...)`
- under fältet: länken `How does this work?` med frågeteckenikon

---

## 11. Simulate Keystrokes (bild 12, 13)

På raden: knappen `Select Keystroke`. Den öppnar **Keystroke Configurator**:

- Kryssrutor på en rad: `CTRL` · `ALT` · `SHIFT`
- Etikett: *Keys, letters or numbers to be pressed in sequence:* plus flerradigt fält
- **Placeholder Params:** `{username}` `{nickname}` `{giftname}` `{repeatcount}`
  `{coins}` `{likecount}` `{totallikecount}` `{comment}` `{submonth}`
  ← **`{nickname}` finns bara här**, i ingen annan variabelrad
- Knappar: `Left Mouse Click` · `Right Mouse Click`
- Tangentknappar i fyra rader:
  - `ENTER` `SPACE` `ESC` `TAB` `BACKSPACE` `BREAK`
  - `CAPS LOCK` `DELETE` `UP ARROW` `RIGHT ARROW` `LEFT ARROW`
  - `DOWN ARROW` `END` `HOME` `INSERT` `F1` `F2` `F3`
  - `F4` `F5` `F6` `F7` `F8` `F9` `F10` `F11` `F12`
- `Enable Game compatibility mode (requires AutoIt installed)` — kryssruta,
  med röd notis `For Games (GTA, Forza)`
- `Key hold duration:` `100 ms` *(requires compatibility mode)* — inaktiverat
  tills kompatibilitetsläget är ikryssat
- `Save`

---

## 12. Glappet mot VYRA idag

Nuläge: `action-event.js:13` har fjorton funktionstyper, `action-options.js` har
fältpanelerna, `action-event.js:250` har ramen.

**Vi har redan (behåll):**
Show Picture, Play Audio, Play Video, Show Alert, Read Text (TTS), Send Chatbot
Message, Switch OBS Scene, Activate OBS Source, Trigger WebHook, Display duration,
Global Cooldown, User Cooldown, Media sound volume, Enable Fade-In/Out, Repeat
with gift combos, Skip on next action.

**Vi har på fel plats:**

- `addPoints` / `removePoints` ligger som funktionstyper. Facit har dem som
  kryssruta plus belopp i ett eget block under funktionslistan.
- Alla fält ligger i en separat låda. Facit fäller ut dem **inline på raden**.
- `overlay` (Visa overlay/widget) och `spotify` finns hos oss men inte i facit.
  Behåll — de är VYRA:s egna, men de ska placeras medvetet i ordningen.

**Vi saknar helt:**

| Sak | Var |
|---|---|
| Listvyn med kolumnerna Screen / Duration / Points / Animation / Picture / Sound / Video / Description | avsnitt 1 |
| Genererad Description | avsnitt 1 |
| `Enabled`-huvudbrytare och sökfält | avsnitt 1 |
| Show Animation | funktion 1 |
| Ljudbibliotek (`Open Sound Library`) | avsnitt 4 |
| Drop-yta för filer | avsnitt 3–5 |
| Konverteringstipset för video | avsnitt 5 |
| Overlay Settings med 19 fält, inkl. fem rörelseeffekter och Username Text Effect | avsnitt 7 |
| Egen RGB/hex-färgväljare | avsnitt 6 |
| `Overlay Screen` | avsnitt 2.5 |
| Exec Minecraft Command | funktion 11 |
| Simulate Keystrokes + Keystroke Configurator | avsnitt 11 |
| Third-Party Action | funktion 13 |
| Control Custom Goal | funktion 14 |
| Set Voicemod Voice | funktion 15 |
| Streamer.bot Action | funktion 16 |
| Control Timer | funktion 17 |
| `{nickname}` som variabel | avsnitt 11 |

---

## 13. Beslut och status (2026-09-16)

David överlät besluten. Valda:

1. **Fjorton funktioner, inte sjutton.** *(Utökat 2026-09-16: `Control Custom Goal` och
   `Control Timer` byggdes efteråt — de kräver inget tredjepartsprogram, för VYRA har både mål
   (`goal-client.js`) och timers (`action-timers.js`) som egna funktioner.)* Byggda är facits tio webbdugliga plus VYRA:s två
   egna. Utelämnade: `Exec Minecraft Command`, `Simulate Keystrokes`, `Third-Party Action`,
   `Control Custom Goal`, `Set Voicemod Voice`, `Streamer.bot Action`, `Control Timer` —
   de två första kan fysiskt bara köras i desktopappen, de övriga kräver tredjepartsprogram.
   En kryssruta som inte gör något ser ut som en bugg; det mönstret har redan drabbat fem
   widgetar i det här projektet.
2. **Svenska etiketter**, facits struktur och ordning.
3. `Screen` var ingen ny sak: VYRA har redan **tio** overlay-scener (`action-scenes.js`),
   med egen länk och egen kölängd per scen. Kolumnen mappar på `action.scene.number`.

**Byggt 2026-09-16** (1768/1768 prov gröna):
listvyn som tabell, genererad Beskrivning, huvudbrytare, sökfält, redigering, duplicering,
funktionsordningen, inline-luckorna, poängblocket flyttat ur funktionslistan, filväljare
med drop-yta, konverteringstipset, och Overlay-inställningar med nitton fält där alla
nitton faktiskt når renderingen.

**Färdigställt samma dag** (Davids beslut: "Färdigställ Actions helt först"):

- **Ljudbiblioteket.** `sound-alerts.js` hade redan tretton royaltyfria klipp — knappen öppnar
  det som finns i stället för att bygga ett nytt. Provlyssning per klipp; `stopPropagation`
  på ▶, annars hade ett lyssningsklick också bytt val. Klippet sparas som `packagePath`,
  inte som en IndexedDB-kopia: `playMedia` tar redan statiska sökvägar för ljud.
- **`Visa animation` skild från overlay.** De två var en DUBBLETT: samma sex widgetnamn, och
  `action-runtime.js` skickade båda till samma `runWidget`. Nu är `animation` ett klipp ur
  Mediabiblioteket (**125 stycken**, samma lista Mediabiblioteket ritar) och `overlay` en
  levande widget. Äldre sparade animation-actions saknar `animationPath` och faller tillbaka
  på `runWidget` — de beter sig exakt som förut.
- **Egen RGB/hex-färgväljare.** Mättnadsfält, nyansremsa, förhandsruta, R/G/B, hex, OK/Avbryt.
  Det dolda `input[type=color]` är kvar som VÄRDEBÄRARE, så `collect()` är oförändrad.
  Uppmätt: hex `2fd4a1` → `47,212,161`, och OK skriver tillbaka till rätt fält.
- **Scenpanelen flyttad.** Den låg efter `.ae-steps`, alltså före listorna, och tio scenkort
  plus tio länkkort fyllde hela första skärmen. I facit är Overlay Screen Settings en egen
  panel längst ned. Den hänger nu på `.ae-columns`.

Action-sidan följer därmed facit i sin helhet, undantaget de fem funktioner som medvetet
valdes bort (punkt 1 ovan).

### Det som hittades på vägen

Fyra filer slogs om samma spara-knapp. `action-media.js` skrev **över**
`action-event.js`:s `onclick`, och `action-options.js`, `action-scenes.js` och
`action-event-advanced.js` pollade `localStorage` var 100:e ms i två till fyra sekunder
för att i efterhand klistra sina fält på `state.actions.at(-1)`. Två följder:
en långsam sparning tappade fälten **tyst**, och redigering var omöjlig, eftersom "den
sista i listan" är fel post så fort man inte skapar en ny.

De tre första är ersatta av ett fältregister i `action-event.js` — en ägare, en skrivning.
Den fjärde sitter kvar i `action-event-advanced.js:54` och hör till eventsidan; se
[tikfinity-events-facit.md](tikfinity-events-facit.md) §6.
