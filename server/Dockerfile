FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S vyra && adduser -S -G vyra vyra
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json index.js db.js security.js event-bus.js rate-limit.js observability.js media-storage.js billing.js notifications.js token-vault.js auth-flow.js mfa.js session-device.js login-protection.js account-data.js desktop-release.js support.js production-config.js capacity-gate.js tts.js goal-runtime.js goal-metrics.js goal-sse.js goal-ingest.js viewer-levels.js stream-stats.js stream-sessions.js gavoidentitet.js regelnycklar.js heart-me-goal.js stream-worker.js stats-read.js migrate.js schema.sql ./
USER vyra
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health/live || exit 1
CMD ["node","index.js"]
