FROM --platform=linux/arm64 node:18-alpine3.17

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

RUN corepack enable \
    && corepack prepare pnpm@latest --activate \
    && pnpm install \
    && pnpm build \
    && npm install pm2 -g # Install PM2 globally

# Add a HEALTHCHECK instruction that reads the dynamic PORT.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD sh -c 'curl -f http://localhost:${PORT}/health || exit 1'

# ------------- should be different from Dockerfile.dev

# Start the application using PM2
# Make sure your `pnpm start` script in package.json does NOT use PM2 itself.
# PM2 will run the script defined in your package.json's "start"
# For example, if "start": "node dist/main.js", PM2 will run that.
# The `--no-daemon` option is crucial for Docker to keep the container running.
# Replace 'your-app-name' with a suitable name for your application process.
CMD [ "pm2-runtime", "--name", "optinetflow", "pnpm", "--", "start"]