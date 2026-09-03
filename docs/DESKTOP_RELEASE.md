# VYRA desktop release

## Local Windows preview installer

On a Windows development machine with Node.js LTS installed, double-click
`BYGG-OCH-INSTALLERA-VYRA.cmd`. It installs the locked dependencies, builds
`electron-app/dist2/VYRA-Setup.exe` and opens the installer. This local preview build is
unsigned. Public distribution must still use the signed tagged release workflow below.

The public website downloads a normal Windows NSIS installer, never a ZIP archive.

## Release flow

1. Complete CI and test the app on a clean Windows 10 and Windows 11 machine.
2. Set `WINDOWS_CERTIFICATE_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD` as repository secrets. Public releases must be Authenticode-signed to reduce SmartScreen warnings and prove publisher identity.
3. Create and push a semantic version tag such as `v1.0.0`.
4. The Windows release workflow builds and Authenticode-signs `VYRA-Setup.exe`, creates a SHA-256 checksum and publishes all release files.
5. Configure production with the immutable release asset URL and matching metadata:

```env
DESKTOP_DOWNLOAD_URL=https://github.com/OWNER/REPOSITORY/releases/download/v1.0.0/VYRA-Setup.exe
DESKTOP_VERSION=1.0.0
DESKTOP_SHA256=<64 lowercase hex characters from VYRA-Setup.exe.sha256>
DESKTOP_SIZE_BYTES=<installer size in bytes>
```

## Microsoft Store som nedladdningsmål

Den publicerade `.exe`-filen är osignerad (v1.2.3 släpptes med `UNSIGNED_RELEASE`), och Windows
SmartScreen varnar för den på varje dator. Store-paketet signeras av Microsoft vid certifieringen
(se `docs/store-msix.md`). När Store-posten är publicerad byts hemsidans knappar till butiken med
**en** miljövariabel i produktionen:

```env
DESKTOP_STORE_URL=https://apps.microsoft.com/detail/9PPKZN2SCJM2
```

- Är den satt följer den med som `storeUrl` i `/api/downloads/windows?meta=1`, och
  `vyra-desktop.js` pekar varje `[data-ladda-desktop]` — raden i Inställningar, sidhuvudet,
  guidens OBS-kort, `studio.html?intent=download` — på butiken. Butikssidan är publik, så de tre
  grindarna (session, verifierad e-post, premium) gäller inte den.
- Bara `https://apps.microsoft.com/detail/<Store-ID>` godtas. Allt annat stoppar
  produktionskonfigurationen (`server/production-config.js`) och ger 503 från rutten — en
  felskriven butikslänk ska aldrig nå användarna.
- `.exe`-rutten (302) och uppdateraren i `.exe`-versionen är oförändrade. Utan variabeln är
  allt exakt som förut. Prov: `server/test/desktop-release.test.js`,
  `tests/browser/desktop-nedladdning.browser.test.js` (prov 11–12).

The website calls `/api/downloads/windows`. The API refuses to redirect unless the configured URL is HTTPS and the optional checksum is valid. This prevents a broken link from pretending a missing file was downloaded.

Public tagged releases are never optional-signing: the workflow fails unless the Windows
certificate exists and the finished installer has a valid Authenticode signature. Configure the
repository variable `VYRA_UPDATE_API_ORIGIN` to the production HTTPS origin. The build writes that
origin into `electron-app/update-config.json`.

On startup, the packaged app checks the release metadata after 15 seconds. It never installs
silently: the user approves the download, VYRA verifies the declared size and SHA-256, and the user
approves installation in a second dialog. A partial or mismatched download is deleted and never
opened.

## Release gate

- Installer is signed and the signature is valid (mandatory for every `v*` tag).
- `npm audit --audit-level=high` reports zero vulnerabilities for the desktop build dependencies.
- Electron renderer sandbox, context isolation and web security remain enabled; permission requests are denied by default.
- SHA-256 matches the uploaded installer.
- Install, launch, update-over-install and uninstall pass on clean Windows machines.
- Desktop app opens VYRA Studio and the local overlay server remains healthy.
- Microsoft Defender scan passes.
- Website metadata shows the same version and size as the release.
- Rollback keeps the previous signed installer available.
