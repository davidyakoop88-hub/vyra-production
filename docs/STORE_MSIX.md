# Microsoft Store — MSIX-paket för VYRA Desktop

## Varför MSIX vid sidan av SignPath

SignPath signerar `VYRA-Setup.exe` för direktnedladdning från vyralive.app.
Store-paketet är en **separat kanal**: Microsoft signerar det själv vid
certifieringen, så det rör aldrig SignPath och kräver inget eget certifikat.

Bakgrund till valet:

- Testcertifikatet i `SIGNPATH_SIGNING.md` är självsignerat och tar inte bort
  Windows-varningen — det står i dokumentet självt.
- Azure Artifact Signing (~$9.99/mån) är inte tillgängligt för oss: individuella
  utvecklare är begränsade till USA och Kanada, och kontot är Individual/Sverige.
- EV-certifikat ger sedan 2024 inte längre omedelbar SmartScreen-tillit.

Store-vägen är därmed den enda varningsfria kanalen som inte kostar något.

## Store-identitet

Hämtad ur Partner Center 2026-08-28. Värdena måste stämma exakt — annars
avvisas paketet vid uppladdning.

| Fält | Värde |
|---|---|
| Store ID | 9PPKZN2SCJM2 |
| Identity/Name | vyralive.app.VYRAStudio |
| Identity/Publisher | CN=A1F38F6A-C85F-42A3-AFCE-019E5D6FF4B7 |
| PublisherDisplayName | vyralive.app |
| Package Family Name | vyralive.app.VYRAStudio_x6x3262f13qx4 |
| Butikslänk | https://apps.microsoft.com/detail/9PPKZN2SCJM2 |
| Partner Center | https://partner.microsoft.com/dashboard/products/9PPKZN2SCJM2 |

Namnreservationen förfaller om appen inte skickats in senast i slutet av
november 2026.

## Vad som ändrades

- `electron-app/package.json` — `win.target` utökad med `appx`, plus ett
  `appx`-block med identiteten ovan.
- `electron-app/build-resources/appx/` — de sju bildresurser electron-builder kräver.
  Filnamnen är givna av verktyget och får inte ändras.
- `electron-app/main.js` — `checkForUpdates` avbryter när `process.windowsStore`
  är satt. Store hanterar uppdateringar själv, och att ladda ner och köra
  `VYRA-Setup.exe` bryter mot Store-policy 10.1.1.
- `.github/workflows/desktop-release.yml` — bygger `.appx`, läser
  `AppxManifest.xml` ur det färdiga paketet och stoppar bygget vid fel
  identitet eller fel versionsformat.

## Versionsregel

Store kräver att fjärde versionssiffran är `0`. electron-builder härleder
`x.y.z.0` ur `package.json`, så versionen höjs där som vanligt — aldrig i
`appx`-blocket. Workflow-steget stoppar bygget om regeln bryts.

## Att verifiera före första inlämningen

**Loopback.** `local-server.js` lyssnar på `127.0.0.1:4173` för OBS browser
source. MSIX kör appen i container. Full-trust-paket (`runFullTrust`, som
electron-builder sätter) får anropa loopback, men detta måste testas på en
**installerad** MSIX — inte i utvecklingsläge. Det är den enda tekniska
risken i flödet.

Installera paketet lokalt för test:

    Add-AppxPackage -Path .\dist2\VYRA-Store-<version>.appx

Kontrollera sedan att OBS browser source når overlayen som vanligt.

**Övrigt som krävs vid inlämning:** publik integritetspolicy-URL, minst en
skärmbild (1366x768 eller större), åldersgräns och prissättning.

## Inlämning

1. Kör workflowen och hämta artefakten `VYRA-Store-Package`.
2. Öppna Partner Center-länken ovan, "Start submission".
3. Ladda upp `.appx` under Packages, fyll i listningen.
4. Certifiering tar några dagar för första inlämningen.

## Ikoner

Resurserna i `electron-app/build-resources/appx/` är genererade platshållare — "VL" i
VYRA:s lila-rosa gradient, rätt dimensioner och färgprofil. De duger genom
certifieringen men bör ersättas med grafik exporterad ur den riktiga
logotypen.

## Om mappnamnet

`build/` är ignorerad i `.gitignore` som byggutdata. Appx-resurserna är
källfiler och måste versionshanteras, så `directories.buildResources` pekar
på `build-resources` i stället för att göra undantag i ignore-regeln.

## Varför `win.target` är orörd

Store-paketet byggs med en explicit CLI-flagga (`--win appx`) i stället för
att läggas till i `win.target`. electron-builders CLI-target åsidosätter
konfigurationen, så `appx`-blocket används ändå.

Skälet är att `npm run build` utan flaggor då hade byggt appx också — och
appx kräver Windows SDK (`makeappx.exe`). Det kommandot står i
`CLAUDE-HANDOFF.md` och `.claude/agents/vyra-desktop.md`, och skulle ha
börjat fela på varje utvecklarmaskin utan SDK installerad.
