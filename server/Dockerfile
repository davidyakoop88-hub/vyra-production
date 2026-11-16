# BASEN ÄR DEBIAN (bookworm-slim), INTE ALPINE (2026-11-16). VYRA:s egna gratisröster
# (server/piper.js) kör talmotorn Piper, vars Python-paket och onnxruntime bara finns byggda för
# glibc. Alla serverns npm-beroenden är ren JavaScript, så bytet rör inget annat. wget finns kvar
# för hälsokontrollen nedan och i docker-compose.production.yml.
FROM node:24-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 wget ca-certificates \
 && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev

# Talmotorn och de sju rösterna. FASTA VERSIONER OCH KONTROLLSUMMOR: paketversionerna är låsta,
# rösterna hämtas från en bestämd commit i rhasspy/piper-voices och sha256 kontrolleras för varje
# modell — en ändrad eller utbytt fil fäller bygget i stället för att hamna i produktion.
# Licenserna är kontrollerade per röst: se server/piper.js och docs/rostlicenser.md.
FROM base AS piper
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3-venv \
 && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/piper \
 && /opt/piper/bin/pip install --no-cache-dir --only-binary=:all: piper-tts==1.8.0 onnxruntime==1.32.0
ARG PIPER_VOICES_REV=e9ab671f2a0e50a701b34361136ba3e6a3a9eb0c
COPY piper-roster.txt /tmp/piper-roster.txt
RUN mkdir -p /opt/piper-voices && cd /opt/piper-voices \
 && while read -r sti sha; do \
      [ -n "$sti" ] || continue; \
      fil="$(basename "$sti")"; \
      wget -q -O "$fil.onnx" "https://huggingface.co/rhasspy/piper-voices/resolve/${PIPER_VOICES_REV}/${sti}.onnx"; \
      wget -q -O "$fil.onnx.json" "https://huggingface.co/rhasspy/piper-voices/resolve/${PIPER_VOICES_REV}/${sti}.onnx.json"; \
      echo "$sha  $fil.onnx" | sha256sum -c - || exit 1; \
    done < /tmp/piper-roster.txt \
 && ls /opt/piper-voices/*.onnx | wc -l | grep -qx 7

FROM base
ENV NODE_ENV=production PIPER_PYTHON=/opt/piper/bin/python PIPER_VOICES=/opt/piper-voices PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
RUN groupadd --system vyra && useradd --system --gid vyra --no-create-home vyra
COPY --from=deps /app/node_modules ./node_modules
COPY --from=piper /opt/piper /opt/piper
COPY --from=piper /opt/piper-voices /opt/piper-voices
COPY package.json package-lock.json index.js db.js security.js event-bus.js rate-limit.js observability.js media-storage.js billing.js anvandarsiffror.js matning.js notifications.js token-vault.js krypteringsnyckel.js auth-flow.js mfa.js session-device.js login-protection.js account-data.js desktop-release.js support.js production-config.js capacity-gate.js tiktok-verifiering.js tiktok-profil.js tiktok-handtagslas.js tts.js piper.js musik.js streamdeck.js goal-runtime.js goal-metrics.js goal-sse.js goal-ingest.js viewer-levels.js points-runtime.js stream-stats.js stream-sessions.js gavoidentitet.js regelnycklar.js heart-me-goal.js gavokatalog.js gavobevakare.js seedningskontrakt.js stream-worker.js stats-read.js migrate.js schema.sql ./
# Pythonprocessen piper.js startar. Egen rad: den require()as inte, så vitlistan ovan ska inte bära den.
COPY piper_worker.py ./
USER vyra
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health/live || exit 1
CMD ["node","index.js"]
