# Händelsekartan — vem skickar, vem lyssnar

**Senast verifierad:** 2026-09-17 mot `origin/main` @ `5439096`
**Metod:** `grep` över alla `.js` utanför `node_modules` och `tests/`

Klienten hålls ihop av `CustomEvent` på `window`. Det finns inga moduler och
ingen buss-abstraktion — händelsenamnet **är** gränssnittet. Byter du ett namn
ensidigt tystnar lyssnare utan felmeddelande.

---

## De fem bärande händelserna

| Händelse | Utskick | Lyssnare | Roll |
|---|---:|---:|---|
| `vyra-live-event` | 10 | **13** | Databussen: gåvor, likes, chatt, följare från TikTok |
| `vyra-session-ended` | 6 | **21** | **Utloggning.** Kontot lämnas |
| `vyra-live-session` | 2 | **8** | **Sändningen** startar eller slutar |
| `vyra-auth-ready` | 2 | 6 | Inloggning klar, kontodata finns |
| `vyra-entitlement-ok` | 4 | 2 | Betalstatus bekräftad |

### Övriga

`vyra:spotify-changed` (3) · `vyra:action` · `vyra:action-dropped` ·
`vyra:runtime-widget` · `vyra:runtime-alert` · `vyra:obs-source` ·
`vyra:obs-scene` · `vyra:layout-format` · `vyra:chatbot-send` · `vyra:tal` ·
`vyra:spotify-play` · `vyra-media-bytt` · `vyra-cloud-media-ready` ·
`vyra-cloud-live-ready` · `vyra-overlay-access-created` ·
`vyra-entitlement-blocked` · `vyra-auth-local`

---

## ⚠️ De två som förväxlas

Det här är den vanligaste feltolkningen i kodbasen, och den kostar en hel
sändning när den slår fel.

| | `vyra-session-ended` | `vyra-live-session` |
|---|---|---|
| Betyder | Användaren **loggar ut** | **Sändningen** börjar eller slutar |
| Kan fyra i en OBS-källa | **Nej, aldrig** | Ja |
| Vad som hör hemma här | Rensa kontodata | Rensa mellan sändningar |

**Allt som ska nollställas mellan två sändningar hör i `vyra-live-session` — och
bara på `live:start`.**

```js
addEventListener('vyra-live-session', event => {
  if (!event || !event.detail || event.detail.event !== 'live:start') return;
  // nollställ här
});
```

`live:end` får aldrig rensa något. Slutar sändningen och någon rensar, försvinner
det som ska stå kvar på skärmen.

**Åtta produktionslyssnare, och alla åtta filtrerar på `live:start`** (räknat
2026-09-17): `battle-mvp-session.js`, `gift-event-images.js`, `goal-client.js`,
`last-x-alerts.js`, `live-leaderboard.js`, `recognition-runtime.js`,
`tts-chat.js`, `vyra-tom-widget.js`.

Siffran var sju i augusti. Varje ny lyssnare måste bära samma filter —
**det finns inget prov som tvingar det**, disciplinen är allt som håller.

---

## Fältkontraktet

`vyra-live-event` bär fält som reser genom **tre paket**: `tiktok-bridge/` →
`server/` → klienten. Tre separata vitlistor styr vad som når fram, och ingen
håller dem i synk.

Detaljerna står i `docs/` under händelsekontraktet och i
`.claude/agents/vyra-live.md`. Två fällor värda att upprepa:

- **`??` faller inte igenom på noll.** Ett `0` är ett giltigt värde, inte ett
  saknat.
- **`name` betyder olika saker.** På chatt bär det kommentaren; annars
  avsändarens namn.

---

## Så följer du en händelse genom systemet

```
TikTok
  → tiktok-bridge/ (normaliserar)
  → server/ (SSE)
  → live-client.js (tar emot)
  → dispatchEvent('vyra-live-event')
  → 13 lyssnare
  → state
  → render()
  → wh/props/bind-kedjan          (se docs/RENDERKEDJAN.md)
  → DOM / canvas
  → teardown på nästa live:start
```

Hitta lyssnarna för en händelse:

```bash
grep -rn "addEventListener('vyra-live-event'" --include=*.js . | grep -v node_modules
```

---

## Regler

- **Byt aldrig ett händelsenamn ensidigt.** Kontraktet delas mellan tre paket.
- **Rensa på `live:start`, aldrig på `live:end`.**
- **`vyra-session-ended` är utloggning** — inte slutet på en sändning.
- **Lägger du till en lyssnare på `vyra-live-session`, filtrera på `live:start`
  i första raden.** Nio gör det i dag; inget prov tvingar den tionde.

---

## Relaterat

- `docs/RENDERKEDJAN.md` — vad som händer efter att en lyssnare svarat
- `.claude/agents/vyra-live.md` — domänens egna regler och gränser
- `CLAUDE.md` — händelsekontraktet som repo-regel
