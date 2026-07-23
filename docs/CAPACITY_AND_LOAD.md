# VYRA kapacitet och last

## Produktionssignaler

- `/api/internal/metrics` exponerar Prometheus-format och kräver `METRICS_TOKEN`.
- `/api/internal/capacity` visar aktiva konton, arbetsytor, overlays, sessioner, databasanslutningar, väntande jobb och aktiva overlayströmmar.
- En kapacitetssampling körs var 30:e sekund och varnar via `ALERT_WEBHOOK_URL`.
- Standardgränser: fem väntande databasanslutningar eller 1 000 väntande notifieringar.

## Lastprofiler

Kör först mot staging, aldrig direkt mot produktion:

```powershell
k6 run tests/load/api-smoke.js
$env:VYRA_WORKSPACE_ID="..."
$env:VYRA_INGEST_TOKEN="..."
k6 run tests/load/live-ingest.js
$env:VYRA_OVERLAY_TOKEN="..."
k6 run tests/load/overlay-stream.js
```

Godkännandekrav: mindre än 1 procent fel, p95 under 300 ms för vanliga API-anrop och inga växande köer efter att testet avslutats.

## Autoskalning

`deploy/k8s-autoscaling.yaml` startar med minst två API-instanser och kan skala till 20. Skala upp snabbt vid 65 procent CPU eller 75 procent minne; skala ned försiktigt över fem minuter. Redis och PostgreSQL måste vara externa hanterade tjänster i produktion.
