# TikTok-appens ansökan — ifyllda värden

Appen skapades 2026-09-17. Status: **Draft**, ej inskickad.

Filen finns för att TikToks formulär **inte går att spara** förrän varje obligatoriskt fält är
ifyllt — en omladdning av fliken innan dess raderar allt. Det som står här är återställbart.

| Fält | Värde |
|---|---|
| App-id | `7686507983287617557` |
| Ownership | Individual |
| App type | Other (går inte att ändra i efterhand) |
| App name | `VYRA` |
| Category | Photo & Video |
| Description | `Overlays, alerts and goals for TikTok LIVE creators, shown in OBS. Sign in to link your verified @handle.` |
| Terms of Service URL | `https://vyralive.app/terms.html` |
| Privacy Policy URL | `https://vyralive.app/privacy.html` |
| Platforms | Web |
| Web/Desktop URL | `https://vyralive.app` |
| Produkt | Login Kit (enbart) |
| Scope | `user.info.basic`, `user.info.profile` (enbart) |
| Redirect URI | `https://vyralive.app/api/auth/callback/tiktok` |
| App icon | `assets/logo/vl-ikon.svg` renderad till 1024×1024 PNG |

## Domänverifiering

Verifierad 2026-09-17 via DNS. TXT-posten ligger kvar i Cloudflare på `vyralive.app`:

```
tiktok-developers-site-verification=DEciUmMizO97xzT30CQ7bwDyEUkgccQZ
```

**Ta inte bort den.** Försvinner posten tappar appen sin domänverifiering, och alla tre URL-fälten
blir underkända igen.

## Granskningstexten

Fältet *"Explain how each product and scope works within your app or website"*, 941/1000 tecken:

> VYRA is a web app that gives TikTok LIVE creators overlays, alerts, goals and leaderboards for
> OBS. Login Kit has one purpose here: letting a creator prove that a TikTok account is theirs
> before we connect to its LIVE. Previously the creator typed the username by hand, so anyone could
> point our service at someone else's stream. After sign-in we read the verified @handle and store
> it as the account we listen to. user.info.basic gives us open_id, which we use as the stable
> account identifier. A handle is locked to the open_id that linked it, so no one else can claim it
> later. user.info.profile gives us the username field, the @handle itself. The whole verification
> depends on it: without it we cannot tell which account was authorised, and we reject the sign-in
> instead of saving a half-verified row. We do not store or reuse the access token. It is
> exchanged, read once and discarded. We request no other scopes and no other products.

## Kvar innan Submit for review

1. **App icon** — ladda upp PNG-filen.
2. **Demovideo** — se nedan.

## Vad TikTok kräver av demovideon

Ordagrant ur formuläret:

- mp4 eller mov, högst 5 filer, max 50 MB styck
- ska visa **hela** flödet från början till slut
- *"If your app has not been approved before, you are required to use a sandbox environment"*
- ska visa den sajt där funktionen faktiskt är integrerad
- **domänen i videon måste stämma med den angivna webbadressen** — alltså `vyralive.app`, inte
  Windows-appen från Microsoft Store
- alla valda produkter och scope ska demonstreras tydligt
- gränssnitt och interaktioner ska synas tydligt

Microsoft Store-godkännandet räknas inte här: kravet gäller TikToks egen granskning av just den
här appen.

## Vad videon ska visa, i ordning

1. `vyralive.app` — inloggad i studion, adressfältet synligt
2. Anslutningsrutan öppnas: *"Lägg till ditt TikTok-användarnamn"*
3. Klick på **Verifiera med TikTok**
4. TikToks inloggning och medgivandesida, med båda scopen synliga
5. Återhoppet till `vyralive.app`
6. Det verifierade @handtaget syns i gränssnittet

## Förutsättningar innan videon kan spelas in

- [ ] PR #459 mergad och utrullad, så koden finns på `vyralive.app`
- [ ] sandbox-nycklar i Railway (`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`)
- [ ] sandbox-redirect-URI registrerad under Sandbox-fliken (egen lista, skild från Production)
- [ ] en sandbox-testanvändare hos TikTok
