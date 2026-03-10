FROM --platform=linux/arm64 node:20-alpine3.22 AS base

RUN apk update && apk upgrade && \
    apk add --no-cache \
      openssh \
      rsync \
      postgresql-client \
      curl \
      openssl \
      socat \
      ca-certificates

RUN curl -LO https://dl.min.io/client/mc/release/linux-amd64/mc && \
    chmod +x mc && \
    mv mc /usr/local/bin/

RUN curl https://get.acme.sh | sh && \
    /root/.acme.sh/acme.sh --set-default-ca --server letsencrypt && \
    /root/.acme.sh/acme.sh --register-account -m xxx@gmail.com

# --- Dependencies stage: install only when lockfile changes ---
FROM base AS deps

WORKDIR /app
COPY package.json pnpm-lock.yaml ./

RUN corepack enable \
    && corepack prepare pnpm@latest --activate \
    && pnpm install --frozen-lockfile

# --- Build stage ---
FROM deps AS build

WORKDIR /app
COPY . .
RUN pnpm build

# --- Production stage ---
FROM base AS production

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/prisma ./prisma

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD sh -c 'curl -f http://localhost:${PORT}/health || exit 1'

CMD ["node", "dist/main"]
