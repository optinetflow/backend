#!/bin/bash
set -euo pipefail

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

: "${PROD_SSH_USER:?PROD_SSH_USER is not set}"
: "${PROD_SSH_HOST:?PROD_SSH_HOST is not set}"
: "${PROD_DB_URL:?PROD_DB_URL is not set}"

ssh "${PROD_SSH_USER}@${PROD_SSH_HOST}" "pg_dump -c -F p --dbname=${PROD_DB_URL}" > backup.sql
