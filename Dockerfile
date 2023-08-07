FROM node:18-alpine3.17

RUN apk update && apk upgrade
RUN apk add --no-cache \
  openssh \
  rsync \
  curl \
  ca-certificates

# Download and install the Minio client
RUN curl -LO https://dl.min.io/client/mc/release/linux-amd64/mc && \
    chmod +x mc && \
    mv mc /usr/local/bin/

WORKDIR /app

COPY . .

RUN corepack enable \
    && corepack prepare pnpm@latest --activate \
    && pnpm install \ 
    && pnpm build


# ------------- should be different from Dockerfile.dev


CMD [ "pnpm", "start"]