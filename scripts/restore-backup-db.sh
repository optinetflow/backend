#!/bin/bash
set -euo pipefail

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

: "${DEV_BOT_TOKEN:?DEV_BOT_TOKEN is not set}"
: "${DEV_BOT_USERNAME:?DEV_BOT_USERNAME is not set}"
: "${POSTGRES_USER:?POSTGRES_USER is not set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set}"
: "${DB_PORT:?DB_PORT is not set}"
: "${POSTGRES_DB:?POSTGRES_DB is not set}"

DEV_DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${DB_PORT}/${POSTGRES_DB}"

SQL=$(cat <<EOSQL
DELETE FROM public."TelegramUser" WHERE "userId" != 'c240976d-659b-487e-90be-8202b3ea9caa';
UPDATE public."Brand" SET "domainName" = 'localhost:3000', "botToken" = '${DEV_BOT_TOKEN}', "botUsername" = '${DEV_BOT_USERNAME}' WHERE "id" = 'da99bcd1-4a96-416f-bc38-90c5b363573e';
UPDATE public."Brand" SET "deletedAt" = CURRENT_TIMESTAMP WHERE "id" != 'da99bcd1-4a96-416f-bc38-90c5b363573e';
UPDATE public."Brand" SET "reportGroupId" = -4973565155, "backupGroupId" = -4973565155;
EOSQL
)

psql --file="backup.sql" -c "$SQL" "$DEV_DB_URL" && pnpm migrate:deploy
