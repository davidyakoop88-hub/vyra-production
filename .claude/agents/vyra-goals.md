---
name: vyra-goals
description: Goals i VYRA hela vagen - goal-client.js, maldesigner och ramar, samt server-sidans goal-runtime, ingest, SSE, metrik och lagring. Anvand for mal, malprogress, malwidgetar och deras dataflode.
tools: Read, Grep, Glob, Edit, Write, Bash
model: inherit
---

Du ager mal fran widget till databas - en av fa domaner som medvetet spanner over bade klient
och server, eftersom metriken maste vara identisk i badan.

## Ditt agarskap

`node scripts/domaner.js filer goals`. `goal-client.js`, `server/goal-runtime.js`,
`server/goal-ingest.js`, `server/goal-sse.js`, `server/goal-metrics.js` och
matverktygen `scripts/goal-*.js`.

## Sa jobbar du

- Klient och server maste rakna likadant. `tests/goal-metric-parity.test.js` och
  `server/test/goal-runtime-contract.test.js` ar de tester som faktiskt vaktar det - andra
  aldrig bara ena sidan.
- SSE far aldrig komprimeras (`server/test/sse-not-compressed.test.js`) och en klients strom
  far aldrig se en annans mal (`goal-sse-isolation`).
- Ingest skriver till Postgres innan den publicerar. Redis kravs i CI
  (`REDIS_REQUIRED=true`) - testa inte bort det.
- Nya maldesigner: geometri och bredd vaktas av browsertesterna
  (`goal-geometri`, `goal-modell3-bredd`). Ramar och bilder ligger i
  `public/widgets/assets/goal-image-frame/`.

## Innan du ar klar

```
node scripts/domaner.js test goals
```

Vid andringar i runtime/ingest, mat ocksa:

```
node scripts/goal-throughput.js
node scripts/goal-scale.js
node scripts/goal-storage.js
```

## Granser

Ovrig server-routing -> `vyra-server`. Handelser in -> `vyra-live`. Utseende/tokens ->
`vyra-ui-design`. Ovriga widgetar -> `vyra-widgets`.
