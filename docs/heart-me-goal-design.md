# Heart Me Goal · unika avsändare per sändning

**Status: implementerad på grenen `feat/heart-me-unika-avsandare` (PR #275). Inget mergat, inga
flaggor rörda.**

## Produktkravet

`templateHeartGoal` räknar **unika personer som skickar gåvan Heart Me under aktuell LIVE**.

- Endast gåvan Heart Me räknas.
- Varje unik avsändare ger högst `+1` per sändning, oavsett hur många Heart Me hen skickar.
- Likes och alla andra gåvor ger `+0`.
- Samma person får räknas igen i nästa LIVE.
- Dedupen måste tåla processomstart och samtidiga event.
- Generella Like Goal-widgets (`templateSocialGoal`) får inte ändras.

Dagens beteende är fel mot kravet: `goal-metrics.js` mappade `templateHeartGoal` → `likes`, med
kommentaren *"a heart is a like; product decision"*. Uppmätt i test-LIVE 2: två unika Heart
Me-avsändare, men widgeten visade `48/50` — allt från TikTok-likes.

---

## Gåvoidentiteten ägs inte av den här modulen

**Produktbeslut 2026-08-26:** widgeten är låst till Heart Me. Ingen gåvoväljare, ingen ny
inställning i UI. Befintliga `templateHeartGoal`-widgets får den nya betydelsen automatiskt.

Vilken gåva som ÄR Heart Me kommer från **lärläget** (`server/gavoidentitet.js`,
`docs/gavoidentitet-inlarning.md`): man väljer regeln i Studio, trycker *Lär in nästa gåva*,
skickar en Heart Me, kontrollerar namn och bild, och bekräftar. Först då skrivs `giftId` till
`gift_rule_identity`.

Uppslaget sker på den fasta nyckeln **`heart_me`** från `server/regelnycklar.js` — servern äger
nyckelformatet, webbläsaren väljer det inte fritt.

Två vägar som *inte* används, och varför:

| Väg | Varför inte |
|---|---|
| Repots katalog (`assets/gifts/gifts-manifest.js`) | 1148 poster med bara `name` och `file`. Filnamnsprefixen (`0036_Heart_Me`) är en lokal löpnumrering, inte TikToks id. |
| Rummets katalog via `fetchAvailableGifts()` | Uppmätt i produktion: kräver betald Business-plan (`docs/gavokatalog-matresultat.md`). |

**Matchningen sker uteslutande mot `giftId`.** Aldrig mot `giftName`, inte ens som reserv:
`normalizer.js:68` defaultar `giftName` till strängen `'Gift'` när namnet saknas, och namnet är
språkberoende.

Utan en bekräftad `heart_me`-identitet räknar målet **ingenting**. Hellre noll än fel siffra.

---

## Metriken `unique_gift_senders`

Metriken är ny och **additivt** tillagd i `goal_runtime.metric`-villkoret — de fem befintliga
(`follows`, `likes`, `shares`, `gifts`, `diamonds`) står kvar orörda.

Varför en egen metrik i stället för att återanvända `gifts`: alla fem befintliga metriker matas av
`contributionsFor()` i `goal-runtime.js`, som mappar *varje* gåva till `gifts` + `diamonds`. Hade
Heart Me Goal pekat på `gifts` hade varje Rose i rummet knuffat det. Den nya metriken finns just
för att stå **utanför** den vägen.

`contributionsFor()` får aldrig producera `unique_gift_senders`. Ett vaktprov läser
`goal-runtime.js` och faller om namnet dyker upp där.

I Studio heter metriken **Unika givare**.

---

## De två skydden — lätt att blanda ihop

| Skydd | Vad det stoppar | Var det bor |
|---|---|---|
| `raw.duplicate` / `goal_event_apply` | Samma **event** levererat flera gånger (retry, replay, reconnect) | ingest-kedjan |
| `heart_me_bidrag`-raden | Samma **person** bidrar flera gånger | den här modulen |

Båda behövs. Det första skyddar inte mot att Anna skickar tre olika Heart Me; det andra skyddar
inte mot att ett och samma event levereras två gånger.

### Engångsliggaren

```sql
CREATE TABLE heart_me_bidrag (
  session_id      uuid NOT NULL REFERENCES stream_sessions(id) ON DELETE CASCADE,
  widget_id       text NOT NULL,
  avsandarnyckel  text NOT NULL CHECK (avsandarnyckel ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (session_id, widget_id, avsandarnyckel)
);
```

- **`session_id` i nyckeln ger "samma person räknas igen nästa LIVE" gratis.** En ny sändning är en
  ny session och därmed en tom nyckelrymd. Ingen nollställningsrutin behövs.
- **`ON DELETE CASCADE` är städningen.** Raderna försvinner med sessionen; ingen cron, inget TTL.
- **`widget_id` i nyckeln** gör att två Heart Me Goal-widgets i samma overlay räknar oberoende.
- **`avsandarnyckel` är en HMAC** — se nästa avsnitt.

### Avsändarnyckeln · HMAC-pseudonymisering

**Produktbeslut 2026-08-27:** det ska inte gå att läsa ut en tittares namn ur liggaren. Felsökning
sker med resultatkoder och räknare, inte genom att titta på vem som bidragit.

```
identitet   = strip('@') → trim → lowercase          ('@Anna' → 'anna')
undernyckel = HMAC-SHA256(APP_ENCRYPTION_KEY, 'vyra:heart-me-bidrag:v1')
nyckel      = HMAC-SHA256(undernyckel, workspace ⎸ session ⎸ identitet)   → 64 hex
```

Varje del av indata gör ett jobb:

| Del | Varför |
|---|---|
| **Normalisering först** | Hashas namnet före normaliseringen blir `@Anna` och `anna` två nycklar, och samma person räknas två gånger. |
| **workspace** | Två kunder delar aldrig nyckelrymd. |
| **session** | Hela poängen. Samma person får en **helt annan** nyckel i nästa sändning, så raderna inte går att länka ihop över tid. Att `session_id` också står i primärnyckeln räcker inte — det gör raderna *åtskilda*, men med ett återkommande värde hade man ändå sett att samma person kom tillbaka sändning efter sändning. |

**Domänseparation.** Nyckeln är **inte** `APP_ENCRYPTION_KEY` rakt av. `token-vault.js` använder
samma hemlighet som AES-nyckel, och att återanvända exakt de bytesen till en HMAC är
nyckelåteranvändning över två primitiver. Undernyckeln härleds därför med en etikett som bär både
syfte och version, så nyckelrymden är skild från varje annan användning och kan versioneras.

**Ingen reservnyckel.** Saknas hemligheten, eller har den fel form, räknas ingenting — fail-closed,
före varje databasanrop, tyst och utan kastat fel så liveflödet inte påverkas. En hårdkodad reserv
hade gjort hashen offentligt beräkningsbar, alltså ingen pseudonymisering alls utan bara en dyrare
klartext.

**Varför `APP_ENCRYPTION_KEY` och inte en ny variabel:** den är redan obligatorisk i
`production-config.js` och redan i drift. En ny variabel hade, tillsammans med fail-closed, betytt
att målet tyst slutar räkna den dagen någon glömmer sätta den vid en deploy.

**Separatorn.** Fälten fogas ihop med `\x1f` (unit separator), och identiteten nekas om den
innehåller något kontrolltecken. Utan den regeln kan två olika `(workspace, session, namn)` fogas
till samma sträng att hasha — en klassisk sammanfogningstvetydighet, där två personer kollapsar
till en.

**Databasen är själva skyddet, inte koden.** Kolumnen har
`CHECK (avsandarnyckel ~ '^[0-9a-f]{64}$')`, så ett klartextnamn kan fysiskt inte hamna där ens om
en framtida bugg skickar dit ett. Ett prov skriver ett namn rakt mot tabellen och kräver ett nej.

Vad som därmed mäts:

| Påstående | Bevis |
|---|---|
| Namnet går inte att läsa ur nyckeln | 64 hex, och varken hela eller delar av namnet finns i värdet |
| Samma person, samma sändning → samma nyckel | andra gåvan kolliderar med befintlig rad; målet ökas inte igen |
| Samma person, nästa sändning → **annan** nyckel | två sessioner, två olika värden |
| Nyckeln är domänseparerad | en oseparerad HMAC räknas fram och måste skilja sig |
| Saknad eller felformad hemlighet | ingen ökning, ingen rad, inget kastat fel |
| Databasen vägrar klartext | tre avvisade skrivningar plus en godkänd kontrollmätning |
| Nyckeln lämnar aldrig servern | SSE-ramen saknar fältet, namnet och `giftId` |
| Ingen loggning | källvakt på modulen och på ingest-kopplingen |

**Ingen migration behövs.** Tabellen har aldrig funnits i produktion — hela `heart_me_bidrag` kommer
med samma opublicerade PR som hashningen, så det finns inga gamla klartextrader att konvertera.

### Dedupen är en primärnyckel, inte kod

```sql
INSERT INTO heart_me_bidrag (session_id, widget_id, avsandarnyckel)
VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING widget_id
```

Målet ökas **bara** när insert:en skapade en rad. Ingen läsning följd av skrivning, så två samtidiga
gåvor från samma person kan inte båda räknas, och en processomstart ändrar ingenting eftersom
liggaren bor i Postgres.

---

## Flödet, fem steg

1. **Giltigt, deduplicerat slutframe-event.** `duplicate` är falskt, typen är `gift`, `giftId` finns.
   Mellanframes i en streak är redan bortfiltrerade vid källan — i BÅDA vägarna
   (`tiktok-bridge/bridge.js:374` och `electron-app/tiktok-service.js:97`).
2. **Slå upp den inlärda regeln** `heart_me` via `Gavoidentitet.slaUppGiftId()`.
3. **Matcha exakt `giftId`.** Ingen prefix-, delsträngs- eller namnmatchning.
4. **Atomisk engångsinsättning** på `(session_id, widget_id, avsandarnyckel)`.
5. **Öka målet endast om insättningen skapade en ny rad** — `progress + 1`, `revision + 1`.

Varje steg är fail-closed: saknas något händer ingenting alls. Ingen aktiv session, ingen inlärd
identitet, tom avsändarnyckel, fel `giftId` ⇒ `+0`.

### Kopplingen i ingest-kedjan

Samma fire-and-forget-mönster som `streamStats.record()` och `Gavoidentitet.fangaFranEvent()`: inte
`await`:at, bara på `!raw.duplicate`, och med `.catch()` — en avvisad promise utan hanterare fäller
hela processen i Node. En målskrivning får aldrig hindra eventet från att nå overlayet.

---

## Vad som INTE ändras

- `templateSocialGoal` med `goalKind: 'likes'` fortsätter räkna likes precis som förut.
- `contributionsFor()` är orörd.
- `baseline`, `target` och `epoch` ägs av konfigurationen, inte av räknaren.
- Transportlagret. `cleanEvent` (`server/event-bus.js:13-27`) bär redan `userId`, `username` och
  `giftId` — ingenting behövde läggas till.
- Paritetsprovet `tests/goal-metric-parity.test.js` jämför `goalKind()`, inte `metricForWidget()`,
  så mappningen kunde ändras utan att klient och server drev isär.

## Bevisen

`server/test/heart-me-unika-avsandare.test.js` kräver isolerad Postgres (`TEST_DATABASE_URL`) — en
unikhetsnyckel går inte att prova mot en attrapp. Provfilen körs i CI-jobbet *Goal runtime ·
Postgres 18*, som listar sina filer explicit; den måste stå i listan för att köras alls.

Slutbeviset, med syntetiska namn:

| Scenario | Förväntat |
|---|---|
| Anna skickar tre Heart Me | `+1` |
| Anna och Bo skickar en var | `+2` |
| Rose, okänd gåva och likes | `+0` |
| Ny livesession, Anna skickar igen | `+1` till |
