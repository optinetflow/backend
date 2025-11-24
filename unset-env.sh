#!/bin/bash

# Script to unset all environment variables from a .env file
# Usage: source unset-env.sh [env-file]

ENV_FILE="${1:-docker.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found!"
  exit 1
fi

# Read the .env file and unset each variable
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  if [[ ! "$key" =~ ^#.*$ ]] && [[ -n "$key" ]]; then
    # Remove leading/trailing whitespace from key
    key=$(echo "$key" | xargs)
    unset "$key"
    echo "Unset: $key"
  fi
done < "$ENV_FILE"

echo "All environment variables from $ENV_FILE have been unset."

