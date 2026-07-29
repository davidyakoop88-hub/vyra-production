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
CMD ["node","connection-manager.js"]
