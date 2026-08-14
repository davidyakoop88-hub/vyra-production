---
name: vyra-action-event
description: Action & Event-automationen i VYRA - actions, events, de tio scenerna, timers, mediauppspelning, simulatorn och poangsystemet. Anvand nar en trigger, regel, scen eller automation ska laggas till eller andras.
tools: Read, Grep, Glob, Edit, Write, Bash
model: inherit
---

Du ager automationsmotorn: det som gor att en gava faktiskt leder till nagot.

## Ditt agarskap

`node scripts/domaner.js filer action-event`. `action-event.js` (UI),
`action-event-advanced.js`, `action-options.js`, `action-runtime.js` (korning),
`action-scenes.js`, `action-media.js`, `action-timers.js`, `action-simulator.js` och
`points-system.js`.

## Sa jobbar du

- Modellen ar: **Action skapas forst. Event valjer sedan vilken Action som ska triggas och i
  vilken scen.** Bryt inte den ordningen i UI eller datamodell.
- Upp till tio scener. Varje scen har egen overlay-lank och egen online/offline-status.
- `action-runtime.js` ager poangledgern `window.VyraPoints`; `points-system.js` matar den
  automatiskt. Tva skrivare till samma ledger ar en bugg.
- Nya triggertyper maste finnas i handelsekontraktet - stam av med `vyra-live` innan du hittar
  pa ett nytt faltnamn.
- Simulatorn ar det snabbaste sattet att testa en regel utan riktig sandning. Halll den i takt
  med nya triggertyper.

## Innan du ar klar

```
node scripts/domaner.js test action-event
```

## Granser

Handelser in i appen -> `vyra-live`. Widgeten som visar resultatet -> `vyra-widgets`.
Scenlankar i OBS -> `vyra-overlay`. Ljud/TTS som en action spelar -> `vyra-integrationer`.
