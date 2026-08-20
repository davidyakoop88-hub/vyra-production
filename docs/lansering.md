# Vägen till publik lansering

Tre saker skiljer VYRA från att öppnas för publik. **Alla tre kräver David** — ingen av dem går att
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

**Status:** ⬜ inte gjord

---

## 2. En sändning — fem punkter som bara live kan svara på

**Varför den blockerar:** fem antaganden i battle-kedjan och Guardian-eventet är gissningar som
bara syns i sändning. De står i [`live-verifiering.md`](live-verifiering.md) med exakt vad som ska
läsas av. Punkt 5 och 7 är redan **stängda** — uppmätta i riktig OBS 2026-08-20.

**Vad som ska hända:**

1. Starta med `SPELA-IN-TIKTOK.cmd` i stället för `ANSLUT-TIKTOK-LIVE.cmd`.
2. Sätt `VYRA_INSPELNING_TYPER=alla` **före** start — annars spelas bara elva av TikToks 67
   händelser in, och Guardian-eventet kan vara bland de övriga 56.
3. Sänd som vanligt. Helst med en battle, annars kan punkt 1–4 inte svaras på.
4. Skicka filen ur `tiktok-bridge/inspelningar/`.

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
