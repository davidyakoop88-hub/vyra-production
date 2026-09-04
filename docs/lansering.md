# Vägen till publik lansering

**Läget 2026-09-03: punkt 1 är avklarad.** Två saker återstår. **Båda kräver David** — ingen av dem går att
koda fram. Allt annat i backloggen är förbättringar som inte blockerar.

Listan är kort med flit. En lanseringschecklista som växer till trettio punkter är en lista ingen
bockar av, och då blir "vad är kvar?" en fråga som ställs om och om igen.

---

## 1. Betalningen — en riktig transaktion hela vägen

**Varför den blockerar:** Stripe-konfigurationen är bevisad i produktion, men **ingen riktig
betalning har någonsin gått igenom kedjan**. Konfiguration och genomförd betalning är två olika
saker; den första säger att rören är kopplade, den andra att vatten kommer ut.

**Vad som ska hända, i ordning:**

1. Skapa ett konto på vyralive.app (gärna ett nytt, inte Davids eget).
2. Betala 15 USD med ett riktigt kort.
3. Kontrollera att `/api/workspaces/<id>/billing` svarar med `plan: "premium"` och
   `subscription.status: "active"` eller `"trialing"`.
4. Kontrollera att skrivbordsappen släpper in kontot — behörighetsgrinden i `main.js` kräver
   exakt de värdena.
5. Kontrollera att `trial_end` stämmer med de tre gratisdagarna.

**Vem:** David betalar, Claude läser av kedjan i produktion.

**Status:** ✅ **KLAR — avläst i produktion 2026-09-03**

| Kontroll | Utfall |
|---|---|
| `plan` | `premium` |
| `subscription.status` | `active` |
| Skrivbordsgrinden (`main.js`) | villkoret släpper in kontot |
| `trial_end` | `2026-07-27` — tre dagar efter start, stämmer med `trialDays: 3` |
| `cancel_at_period_end` | `false` |

TVÅ OBEROENDE KÄLLOR SÄGER SAMMA SAK. Appens `/api/workspaces/<id>/billing` och Stripes egen
instrumentpanel: prenumerationen "VYRA Premium" är **Aktiv**, månadsvis, och två betalningar à
**15,00 USD har lyckats** — 27 juli och 27 augusti. Nästa faktura 27 september.

Det är starkare än checklistan krävde: webhook-kedjan har inte bara tagit emot en första
betalning, den har behandlat **två förnyelser** i produktion.

Avläst på Davids eget konto (workspace `8826f6d1`). Kontot är `isPlatformAdmin`, men det
påverkar inte planen: `planFromPrice()` härleder `premium` ur att prenumerationens pris matchar
`STRIPE_PRICE_MONTHLY`, och `isPlatformAdmin` förekommer inte i någon billing-logik.

⚠️ **Vad detta INTE bevisar:** prenumerationen började i juli, så vägen *registrering →
checkout → premium* för en helt ny kund är fortfarande oprövad. Steady state fungerar; första
gången är inte mätt. Det var därför checklistan bad om ett nytt konto.

---

## 2. En sändning — fem punkter som bara live kan svara på

**Varför den blockerar:** fem antaganden i battle-kedjan och Guardian-eventet är gissningar som
bara syns i sändning. De står i [`live-verifiering.md`](live-verifiering.md) med exakt vad som ska
läsas av. Punkt 5 och 7 är redan **stängda** — uppmätta i riktig OBS 2026-08-20.

**Vad som ska hända:**

1. Starta med `SPELA-IN-TIKTOK.cmd` i stället för `ANSLUT-TIKTOK-LIVE.cmd`.
2. Sätt `VYRA_INSPELNING_TYPER=alla` **före** start — annars spelas bara elva av TikToks 67
   händelser in, och Guardian-eventet kan vara bland de övriga 56.
3. Sätt `VYRA_INSPELNING_MAX_MB=400` i samma veva. Standardtaket är **50 MB**, och med `alla`
   fylls det långt före sändningens slut — inspelaren slutar då skriva mitt i. Battlen ligger
   nästan alltid efter den punkten, och utan den går punkt 1–4 inte att svara på. Ett avbrutet
   band ser dessutom ut som en komplett fil: den enda skillnaden är att slutet saknas.
4. Sänd som vanligt. Helst med en battle, annars kan punkt 1–4 inte svaras på.
5. Skicka filen ur `tiktok-bridge/inspelningar/`.

Sedan kör Claude:

```bash
node tiktok-bridge/analysera-inspelning.js tiktok-bridge/inspelningar/<fil>.jsonl
```

Analysatorn svarar på punkt 1, 2, 3, 4 och 6 — och säger `inget underlag` hellre än att gissa.

**Vem:** David sänder, Claude läser av.

**Status:** ⬜ inte gjord — verktyget är byggt och mergat (PR #243)

---

## 3. Signeringen — annars möts varje ny användare av en varning

**Varför den blockerar:** senaste releasen heter bokstavligen `v1.2.3 (unsigned)`. Windows
SmartScreen varnar för osignerade installationsprogram, och en varning i det allra första
ögonblicket kostar kunder som aldrig hör av sig. Tekniskt hindrar den ingen lansering — men den
är dyrast av de tre i förlorade användare per dag.

**Läget:** SignPath svarade 503 (bevisat: `signingRequestId: null`, alltså inte policyn som
stoppade). `UNSIGNED_RELEASE` är avstängd, så nästa tagg **faller** i stället för att släppa
något osignerat. Ett testcertifikat tar inte bort varningen — det krävs ett riktigt
kodsigneringscertifikat med identitetsverifiering, vilket kostar pengar och tar tid.

Bakgrunden står i [`SIGNPATH_SIGNING.md`](SIGNPATH_SIGNING.md) och
[`DESKTOP_RELEASE.md`](DESKTOP_RELEASE.md).

**Vem:** David — det kräver ett köp och en identitetsverifiering.

**Status:** ⬜ parkerad på Davids beslut (2026-08-20)

---

## 4. Gåvoregistret — mergat, testat, och verkningslöst tills det seedas

**Blockerar inte lanseringen.** Utan seedning faller `heart-me-goal.js` tillbaka i
lärlägesreserven, precis som före PR #289 — produkten fungerar. Punkten står här för att den
annars är osynlig: den ser klar ut i varje statuslista, för allt är mergat och CI är grön.
**Proven bygger sin egen data, så de säger ingenting om produktionens tomma tabeller.**

**Tre steg, inte två.** De står i sin helhet i
[`gavokatalog-matresultat.md`](gavokatalog-matresultat.md); här är ordningen:

1. **Mät listan lokalt först.** Hämta `webcast/gift/list/?aid=1988` ur en inloggad SE-flik
   (utan `room_id` — rumskontext ger en annan mängd), spara svaret, och kör:
   ```bash
   node scripts/gavokatalog-matning.js <sparad-lista.json> SE
   ```
   Säger den `STÄMMER` går seedningen igenom. Säger den något annat ska kontraktet mätas om
   via granskad PR **innan** något postas — verktyget skriver ut blocket.
2. **Seeda:** `POST /api/admin/gavokatalog` med `{ region, gifts }`. Kroppen bär BARA de två
   fälten; skickas kontrolltal med avvisas anropet. Kräver `is_platform_admin`.
3. **Verifiera Heart Me:** `POST /api/admin/gavoregel/heart_me/verifiera` med `giftId` ur
   katalogen, och läs av `GET /api/admin/gavokatalog/status`.

⚠️ **Kontraktet har kort hållbarhet.** Listan drev **åtta poster på ett dygn** (PR #294). Är
kontraktet äldre än något dygn avvisas seedningen med 422 — inte för att något är trasigt,
utan för att kontraktet beskriver en lista som inte finns längre. Steg 1 finns just för att
upptäcka det på en sekund i stället för efter ett produktionsanrop.

**Vem:** David hämtar listan ur sin inloggade session och kör anropen — ingen kod i repot
postar till adminrutterna, med flit: en människa ska avgöra vilket `giftId` som får öka ett mål.

**Status:** ⬜ inte gjord — staging godkänd 2026-08-30, produktionen är **inte** seedad

---

## Vad som INTE står här, och varför

Följande är känt, uppmätt och värt att göra — men inget av det hindrar en lansering:

| Sak | Var den står |
|---|---|
| Sex gifter-modeller kvar i fyrfasporten | minnet, `gifter-fas.js` |
| Förarvalet över `vyralive.app`-gränsen (alternativ B) | PR #246, avsnittet om räckvidd |
| `ranking:templateTopPoints:neon` flackar på textrendering | `tests/visual/README.md` |
| Kapaciteten: ~57 MiB per aktivt konto | `CAPACITY_AND_LOAD.md` |
| §5 i skuldregistret, ostruken trots fix i drift | `tech-debt.md` |

Kapaciteten är den enda som blir akut av **framgång**: Railway-planen tar slut kring tjugo
samtidiga konton. Den spricker inte vid lansering utan när det börjar gå bra — och då är det ett
lyxproblem med en känd lösning.
