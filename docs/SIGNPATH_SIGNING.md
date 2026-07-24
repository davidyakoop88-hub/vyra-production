# SignPath-signering för VYRA Desktop

VYRA:s GitHub-flöde skickar den färdiga `VYRA-Setup.exe` till SignPath och ersätter den med den signerade filen innan checksumma och release skapas.

## Testkonfiguration

- Organisation: `Vyralive`
- Organization ID: `219a00ae-1c16-440b-9e00-284e317787a1`
- Projekt: `VYRA Desktop`
- Project slug: `vyra-desktop`
- Testcertifikat: `VYRA Test Certificate`
- Signing policy slug: `test-signing`

Testcertifikatet är självsignerat och används endast för att verifiera byggkedjan. Det är inte lämpligt för en offentlig release och tar inte bort Windows-varningen på användarnas datorer.

## GitHub-konfiguration

GitHub Actions-hemlighet:

- `SIGNPATH_API_TOKEN`

GitHub Actions-variabler:

- `SIGNPATH_ENABLED=true`
- `SIGNPATH_ORGANIZATION_ID=219a00ae-1c16-440b-9e00-284e317787a1`
- `SIGNPATH_PROJECT_SLUG=vyra-desktop`
- `SIGNPATH_SIGNING_POLICY_SLUG=test-signing`

## Säkerhetsregler

- API-token får aldrig läggas i koden.
- Endast installationsfilen som byggts i VYRA:s GitHub Actions-flöde ska signeras.
- En offentlig version måste använda ett betrott kommersiellt kodsigneringscertifikat och en separat release-policy.
- Den signerade filens Authenticode-signatur kontrolleras automatiskt innan en taggad GitHub-release publiceras.

Microsoft Artifact Signing kan återinföras senare utan att ändra VYRA-applikationens kod.
