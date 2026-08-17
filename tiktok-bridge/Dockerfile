FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S vyra && adduser -S -G vyra vyra
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json bridge.js normalizer.js proxy-manager.js connection-manager.js inspelare.js ./
USER vyra
# The manager serves /health and /status so a platform health check has something to hit —
# without a listener Railway can restart (or refuse to route to) the very process running the
# fleet. PORT is supplied by the platform; 4180 is only the local default.
EXPOSE 4180
# Deliberately the direct node call, not `npm run manager`. docker-compose.production.yml runs this
# image with read_only:true and only /tmp writable, and npm wants a writable cache/log directory —
# the wrapper would risk failing the one service that uses this image. `npm run manager` is the
# documented START COMMAND for the Railway service (set in the dashboard, where the filesystem is
# writable); both run this exact same entrypoint.
CMD ["node","connection-manager.js"]
