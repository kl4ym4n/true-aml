#!/bin/sh
set -eu

STAMP=/app/node_modules/.true-aml-install-stamp
LOCK=/app/package-lock.json

if [ ! -f "$LOCK" ]; then
  echo "docker-dev-entry: missing $LOCK" >&2
  exit 1
fi

HASH=$(sha256sum "$LOCK" | awk '{print $1}')

NEED=0
if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$HASH" ]; then
  NEED=1
fi

# Anonymous /app/node_modules volume can be stale or partial.
if [ "$NEED" -eq 0 ]; then
  for d in sax csv-parse unzipper; do
    if [ ! -d "/app/node_modules/$d" ]; then
      echo "docker-dev-entry: missing /app/node_modules/$d" >&2
      NEED=1
      break
    fi
  done
fi
if [ "$NEED" -eq 0 ]; then
  node -e "require('sax'); require('csv-parse'); require('unzipper');" >/dev/null 2>&1 || NEED=1
fi

if [ "$NEED" -eq 1 ]; then
  echo "docker-dev-entry: npm ci (deps missing or lock changed)..."
  # Skip postinstall prisma generate during ci — schema comes from mounted ./prisma; then generate explicitly.
  npm ci --ignore-scripts
  npx prisma generate
  echo "$HASH" > "$STAMP"
fi

exec npm run dev

