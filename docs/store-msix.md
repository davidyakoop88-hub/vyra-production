# VYRA i Microsoft Store · MSIX/AppX

**Status: förberedelse. Ingen tagg, ingen release, ingenting uppladdat till Partner Center.**

Store-vägen ersätter inte `.exe`-vägen — den lägger sig bredvid. NSIS-bygget och dess
uppdateringskedja är orörda, och ett prov faller om Store-arbetet råkar dra med sig dem.

---

## 1. Identiteten hämtas, aldrig gissas

Tre värden står på VYRA-postens identitetssida i Partner Center:

Store-posten heter **VYRA Studio**, Store ID `9PPKZN2SCJM2`, och värdena är hämtade från dess
identitetssida 2026-08-28:

| Partner Center | Värde | electron-builder | Miljövariabel |
|---|---|---|---|
| `Package/Identity/Name` | `vyralive.app.VYRAStudio` | `appx.identityName` | `VYRA_STORE_IDENTITY_NAME` |
| `Package/Identity/Publisher` | `CN=A1F38F6A-C85F-42A3-AFCE-019E5D6FF4B7` | `appx.publisher` | `VYRA_STORE_PUBLISHER` |
| `Package/Properties/PublisherDisplayName` | `vyralive.app` | `appx.publisherDisplayName` | `VYRA_STORE_PUBLISHER_DISPLAY_NAME` |

Värdena är **inte hemligheter** — de står i klartext i varje publicerat pakets manifest och produkten
är nåbar på `https://apps.microsoft.com/detail/9PPKZN2SCJM2`. De står här som referens, men matas
till bygget via miljön så att en ändrad Store-post inte tyst blir fel i ett committat värde.

**Varför de inte får gissas.** Identiteten binder paketet till Store-posten. Fel `Publisher` avvisas
i certifieringen; fel `identityName` kan i värsta fall gå igenom som en **annan** produkt. Ett
rimligt påhittat värde är farligare än ett tomt — det ser rätt ut ända tills någon annan drabbas.

`electron-app/store-identitet.js` läser, validerar hårt och **faller med en instruktion** om något
saknas. Den har medvetet inget standardvärde och ingen reserv. Platshållare (`TODO`, `<ange>`,
`CN=Example` …) räknas som saknade, för ett kvarglömt exempelvärde bygger och signeras annars utan
invändning.

Värdena är inte hemligheter — de står i klartext i varje publicerat pakets manifest — men de är
miljöberoende, så de matas via miljön och `store-identitet.json` är gitignorerad.

## 2. Bygget

```bash
npm run build:store
```

Identiteten matas som `-c.appx.*`-överskrivningar ovanpå `package.json`. En egen
`electron-builder.config.js` hade **tagit över helt** och tyst slagit ut NSIS-uppsättningen — därför
overrides, och ett prov vaktar att filen inte finns.

**Formatet.** electron-builder 26 har målet `appx` och producerar en `.appx`. Partner Center tar emot
`.appx` likaväl som `.msix` — samma paketfamilj. Krävs en strikt `.msix` är det `makeappxArgs` som
ska ändras.

**Uppmätt 2026-08-28:** bygget går igenom och paketet bär rätt identitet:

```
<Identity Name="vyralive.app.VYRAStudio"
          Publisher='CN=A1F38F6A-C85F-42A3-AFCE-019E5D6FF4B7'
          Version="1.2.3.0" />
<PublisherDisplayName>vyralive.app</PublisherDisplayName>
```

Versionen blir 1.2.4 när #285 mergas — den ligger som draft enligt beslutad ordning.

### SignPath behövs INTE för Store-vägen

electron-builder loggar `AppX is not signed — reason=Windows Store only build`. Store-paket signeras
av **Microsoft** vid publicering, inte av oss. Store-vägen är därför helt oberoende av SignPath, och
går alltså runt de 503-svar som blockerat `.exe`-releasen. Det är ett eget skäl att prioritera den.

## 3. Uppdateraren är av — men bara i Store-versionen

Microsoft Store äger uppdateringarna för ett MSIX/AppX-paket. En app som laddar ner och kör en `.exe`
förbi butiken bryter mot certifieringskraven, och installationskatalogen är dessutom skrivskyddad, så
försöket hade fallit ändå — bara senare och otydligare.

Avstängningen sitter på **`process.windowsStore`**, ett runtime-villkor som är sant exakt när appen
kör ur ett Store-paket. En byggflagga hade kunnat sättas fel eller glömmas, och felet hade då synts
först i certifieringen. `.exe`-versionen uppdaterar sig som förut.

---

## 4. Vad som är bevisat automatiskt

`electron-app/test/store-msix.test.js` (kör på varje PR via `windows-installer`-jobbet):

- varje saknat eller platshållarfyllt fält nekas, och felet namnger både Partner Center-fältet och
  miljövariabeln
- `publisher` måste vara hela X.500-strängen
- identiteten ligger inte hårdkodad i `package.json` och inte committad i repot
- NSIS-målet och appens paketlista är oförändrade
- byggverktygen följer inte med in i appen
- bygget skriver aldrig ut identiteten i loggen
- `checkForUpdates` avbryts **först i funktionen** när `process.windowsStore` är sant, och de
  befintliga villkoren står kvar för `.exe`-versionen

`electron-app/test/larlage-paritet.test.js` täcker redan lokalservern, molnproxyn, reservläget,
`giftId` i alla tre formerna och slutframe-regeln. De proven är byggoberoende och gäller båda
paketen.

## 5. Vad som kräver en riktig installation — mätlista för människa

Automatiken kan inte installera ett Store-paket: det kräver Windows-SDK, sidladdningscertifikat
eller en Store-installation. Följande mäts därför för hand, **efter** att paketet byggts och
**innan** något laddas upp:

| # | Kontroll | Godkänt när |
|---|---|---|
| 1 | Installation | paketet installeras och appen startar |
| 2 | Version | `Inställningar → Appar` visar 1.2.4, och appens egen versionsuppgift stämmer |
| 3 | Lokalservern | Studion öppnas i appen; `http://127.0.0.1:4173` svarar |
| 4 | OBS-länkar | en overlay-länk kopieras och renderar i OBS |
| 5 | Molnbryggan | statistik och mål rör sig under en sändning via tiktok-manager |
| 6 | Electron-anslutningen | appens **egen** TikTok-anslutning kopplar upp mot ett LIVE-konto |
| 7 | `giftId` | lärläget fångar en gåva över den egna anslutningen — det är fixen från #280 |
| 8 | Uppdateraren | ingen uppdateringsdialog visas, och ingen `.exe` laddas ner |

**Punkt 7 är hela skälet till 1.2.4.** `tiktok-service.js` ligger i `build.files`, alltså fryst i
paketet. Publicerad `.exe` är v1.2.3 från 2026-08-04, medan `giftId` kom i `afd1713` (#280) den
2026-08-27 — över appens egen anslutning saknar gåvor därför id, och utan id kan lärläget aldrig
fånga något. Molnbryggan har alltid haft det.

## 6. Grinden

Microsofts certifiering och publiceringsflöde är den mänskliga grinden. Ingenting laddas upp till
Partner Center före granskning.
