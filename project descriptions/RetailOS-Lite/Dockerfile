FROM node:22-bookworm-slim AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV AI_SERVICE_URL=http://ai-service:8001
ENV IMAGE_STORAGE_PUBLIC_BASE_URL=http://minio:9000/retailos-images
ENV S3_ENDPOINT=http://minio:9000

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS builder

COPY . .
RUN npm run build
RUN npm run build:worker

FROM deps AS tools

COPY . .

FROM base AS web-runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]

FROM base AS worker-runner

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/dist-worker ./dist-worker

EXPOSE 9101

CMD ["node", "dist-worker/index.js"]
