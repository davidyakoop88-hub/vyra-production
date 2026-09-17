# TikTok-verifiering av användarnamnet

Uppmätt och byggt 2026-09-17. Motsvarar flödet på overlaylive.app, som lästes av i drift samma dag.

## Varför

`tiktok_connections.tiktok_username` var **fritext**. Den som skrev in en annan kreatörs handtag
fick bryggan startad mot *deras* sändning, och `server/stream-stats.js:99` började skriva den
publikens `viewer_id`, `display_name` och `avatar_url` i ett främmande workspace.
`server/capacity-gate.js` stoppade det inte — den kontrollerar bara att inget *annat workspace*
redan tagit namnet.

Verifieringen är det enda som gör anspråket till ett bevis.

## Kedjan

| Steg | Var |
|---|---|
| Knappen "Verifiera med TikTok" | `studio.html` → `#verifieraTikTok` |
| Klicket | `studio-live.js` |
| Klientanropet | `live-client.js` → `VyraLive.verifiera()` |
| Startar varvet | `POST /api/workspaces/:id/tiktok-verifiering` (`server/index.js`) |
| OAuth-logiken | `server/tiktok-verifiering.js` |
| Återvägen | `GET /api/auth/callback/tiktok` (`server/index.js`) |
| Handtagslåset + skrivningen | `server/tiktok-handtagslas.js` |

## Det du måste göra hos TikTok

På [developers.tiktok.com](https://developers.tiktok.com), i appens inställningar:

1. **Login Kit** måste vara tillagt i appen.
2. **Redirect URI**: lägg till exakt `https://vyralive.app/api/auth/callback/tiktok`.
   Den byggs av `APP_ORIGIN` i `server/index.js`, så den måste stämma tecken för tecken —
   TikTok jämför exakt och avvisar annars hela varvet innan användaren ser något.
3. **Scope**: appen måste vara godkänd för `user.info.profile`.
   `user.info.basic` räcker **inte** — handtaget ligger i fältet `username`, och det fältet finns
   bara med `user.info.profile`. Utan godkännandet finns inget @handtag att verifiera.

## Det du måste sätta i Railway

```
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
```

Saknas de svarar startrutten `503` i stället för att bygga en URL TikTok ändå avvisar. Secreten går
aldrig via repot och aldrig via en frontendfil.

## Flaggan

```
VYRA_TIKTOK_VERIFIERING_KRAVS=1
```

Osatt (standard): fritextfältet finns kvar under verifieringsknappen, märkt *overifierat*.
Satt: `PUT /api/workspaces/:id/tiktok-connection` svarar `403`, och fältet döljs i studion.

**Spärren sitter i servern, inte i UI:t.** Ett dolt formulärfält är ingen spärr — rutten är
anropbar utan vår egen klient.

Sätt flaggan först när siffrorna säger att verifieringen håller i drift. Slås den på för tidigt
låses varenda kund ute samtidigt, inklusive dig.

## Tre val som är medvetna

**Ingen TikTok-token sparas.** VYRA behöver inget löpande anrop mot TikTok — bara handtaget, en
gång. Access-token läses, används i samma andetag och slängs. Den når aldrig databasen. Den
säkraste hemligheten är den som inte finns, och `server/test/tiktok-verifiering.test.js` pinnar det
så en framtida bekvämlighet inte smyger in den igen.

**Callbacken ligger FÖRE sessionsgrinden.** `S.sessionCookie()` sätter `SameSite=Strict`
(`server/security.js:11`). En omdirigering från `tiktok.com` tillbaka hit är en korssajts-navigering,
och en Strict-kaka följer inte med en sådan. Hade rutten legat bakom sessionsgrinden hade **varje**
verifiering svarat 401 — i produktion, aldrig i ett prov som anropar rutten direkt med kakan satt.
Bindningen till användaren görs därför av `state`: raden i `tiktok_verifieringsforsok` bär både
workspace och `user_id`, är engångs (`used_at` sätts i samma UPDATE som läser den) och dör efter tio
minuter. Ett `state` kan bara ha skapats av någon som redan var inloggad med rätt roll i just det
workspacet.

**Handtagslåset.** `tiktok_handtagslas` binder handtaget vid `open_id`. Utan det betyder en
verifiering bara "någon ägde handtaget en gång": nästa person som verifierar sig hade kunnat koppla
samma handtag till sitt workspace, och den första förlorat sitt konto utan ett enda felmeddelande.
Det är regeln overlaylive skriver ut under knappen: *"Each username locks to the account that
linked it."*

## Fällan som inte syns i ett lyckofall

På TikToks medgivandesida är `user.info.profile` ett **reglage**. Användaren kan slå av det och ändå
trycka Fortsätt — då kommer ett fullt giltigt `200` tillbaka, med `open_id` men **utan** `username`.
Sparas det ändå får workspacet en rad som ser verifierad ut och inte är det.

`verifiera()` avvisar det fallet hårt, och provet *"AVVISAR när username saknas"* pinnar beteendet.
Uppmätt på TikToks egen medgivandesida 2026-09-17.

## Vad som är bevisat, och vad som inte är det

**Bevisat i produktion 2026-09-17** (mot sandbox-nycklar, avläst i databasen):

- TikTok accepterar redirect-URI:n för vyralive.app
- hela varvet går igenom med skarpa nycklar
- `username` kommer tillbaka och skrivs som verifierat handtag
- migreringen är körd; callbackens fyra utfallsvägar svarar rätt

**Inte bevisat:**

- att verifieringen fungerar för ANDRA konton än sandboxens testanvändare. Det kräver att TikTok
  godkänner appen; ansökan är inskickad 2026-09-17 och ligger `In review`.
- att produktionsnycklarna fungerar — de finns inte än. Railway kör sandbox-nycklar, och de
  släpper bara in `jokero060`.

**Ordningen när godkännandet kommer:** byt `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET` i Railway
till produktionsnycklarna FÖRST. Sätt `VYRA_TIKTOK_VERIFIERING_KRAVS=1` först när verifieringen
setts fungera för en riktig kund — sätts den innan, låses varenda kund ute samtidigt.
