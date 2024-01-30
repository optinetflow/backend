FROM node:18-alpine3.17

RUN apk update && apk upgrade
RUN apk add --no-cache \
  openssh \
  rsync \
  postgresql-client \
  curl \
  openssl \
  socat \
  ca-certificates

# Download and install the Minio client
RUN curl -LO https://dl.min.io/client/mc/release/linux-amd64/mc && \
    chmod +x mc && \
    mv mc /usr/local/bin/

RUN curl https://get.acme.sh | sh && \
    /root/.acme.sh/acme.sh --set-default-ca --server letsencrypt && \
    /root/.acme.sh/acme.sh --register-account -m xxx@gmail.com

WORKDIR /app

COPY . .

RUN mkdir -p /root/.ssh
COPY id_rsa /root/.ssh/id_rsa
RUN chmod 600 /root/.ssh/id_rsa

RUN corepack enable \
    && corepack prepare pnpm@latest --activate \
    && pnpm install \ 
    && pnpm build


# ------------- should be different from Dockerfile.dev


CMD [ "pnpm", "start"]