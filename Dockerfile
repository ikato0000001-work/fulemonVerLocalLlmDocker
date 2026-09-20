# ---------------------------------------------------
# 1. Dependencies
# ---------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# OSパッチの適用
RUN apk update && apk upgrade --no-cache

COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------
# 2. Builder
# ---------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk upgrade --no-cache

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---------------------------------------------------
# 3. Runner
# ---------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk upgrade --no-cache \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]