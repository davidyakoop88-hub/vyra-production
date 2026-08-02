FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S vyra && adduser -S -G vyra vyra
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json bridge.js normalizer.js proxy-manager.js connection-manager.js ./
USER vyra
# The manager serves /health and /status so a platform health check has something to hit —
# without a listener Railway can restart (or refuse to route to) the very process running the
# fleet. PORT is supplied by the platform; 4180 is only the local default.
EXPOSE 4180
# `npm run manager` rather than the bare node call, so the start command is the same one
# documented for Railway and used locally.
CMD ["npm","run","manager"]
