# TikTok-appens ansökan — ifyllda värden

Appen skapades 2026-09-17. Status: **In review** — inskickad 2026-09-17 23:45.

Skälstexten som följde med insändningen (114/120 tecken):

> First submission. Login Kit verifies that a TikTok account belongs to the creator before we connect to their LIVE.

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

Inget. Allt nedan är ifyllt, sparat och verifierat efter omladdning.

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


## Bevisat i produktion 2026-09-17

Hela kedjan kördes skarpt mot sandboxen och lästes av i databasen:

```
tiktok_username:  "jokero060"
verifierad_at:    2026-09-17T21:00:56.932Z
visningsnamn:     "ᵊᵒᵏᵉʳᵒ"   (display_name, INTE handtaget)
```

Fältet `username` kom tillbaka — det var hela osäkerheten i bygget. Visningsnamnet är skrivet med
kalligrafiska unicode-tecken och en krona; hade koden läst `display_name` i stället hade den
avvisat kontots egen inloggning eller skrivit skräp.

Callbacken mättes också direkt mot produktion:

| Anrop | Svar |
|---|---|
| okänt `state` | `302 -> /studio.html?tiktok=utgangen` (bevisar att migreringen körde) |
| `?error=access_denied` | `302 -> /studio.html?tiktok=avbruten` |
| startrutten utan session | `401` |

## Två fällor som kostade tid, och som återkommer

**TikTok hoppar över medgivandesidan för ett konto som redan godkänt appen.** Första demovideon
visade fyra sekunder vit sida i stället för scopen. Behörigheten måste återkallas i TikTok-appen
(Profil -> Inställningar och sekretess -> Säkerhet och behörigheter -> Hantera appbehörigheter)
innan en ny inspelning.

**Knappen binds några sekunder efter sidladdning.** Ett klick direkt efter reload gör ingenting
alls — ingen navigering, inget fel. Vänta tills sidan står still innan du trycker.
